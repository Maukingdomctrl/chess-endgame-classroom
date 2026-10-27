// Reads a built-in course the way a learner meets it: per line the intro, every comment after a move, the
// equal moves accepted ([%also]) and the takeaway, in plain text, and flags what usually reads badly. Reading
// a whole course like this is how most text problems are found (see the endgame-course skill). No solver:
// it parses the PGN only and takes about a second.
//
//   npm run course:read -- direct-opposition                       # courses/direct-opposition-course.pgn
//   npm run course:read -- courses/king-and-pawn-course.pgn --flags # only the flagged lines and the summary
//   npm run course:read -- direct-opposition --avoid "zugzwang,key square" --strict
//
// Options: --flags (print only flagged lines), --avoid "a,b" (words the course must not use yet), --intro N
// (words an intro may have, default 60), --repeat N (times one note may come back in a line, default 2),
// --learner b (the learner's colour, default w), --strict (exit code 1 when anything is flagged).
//
// Flags: long-intro (more words than --intro), long-note (a note or takeaway over the 4-5 second limit of
// teach/explain.cjs readable(); explainer-style notes "Kd4! — ..." are measured per part; a takeaway may have
// 20 words in one sentence), repeat (the same
// note more than --repeat times in one line), no-closing (the last move has no note), avoid (a word from
// --avoid). They are prompts for a human reader, not errors: a lesson's first intro may well be longer.
const fs = require('fs');
const path = require('path');
const { Chess } = require('chess.js');
const { readPgn } = require('./pgn.cjs');
const { readable } = require('./teach/explain.cjs');

const APP = path.join(__dirname, '../..');
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt; };
const valued = new Set(['--avoid', '--intro', '--repeat', '--learner']);
const target = args.find((a, i) => !a.startsWith('--') && !valued.has(args[i - 1]));
if (!target) { console.error('usage: npm run course:read -- <course name or .pgn path> [--flags] [--avoid "a,b"] [--intro N] [--repeat N] [--learner b] [--strict]'); process.exit(2); }

/** The PGN: a path, or a name in courses/ (with or without "-course" and ".pgn"). */
function resolve(t) {
  const tries = [t, path.join(APP, t), ...[`${t}`, `${t}.pgn`, `${t}-course.pgn`].map((f) => path.join(APP, 'courses', f))];
  const hit = tries.find((f) => fs.existsSync(f) && fs.statSync(f).isFile());
  if (!hit) { console.error(`no course "${t}"; courses/ has: ${fs.readdirSync(path.join(APP, 'courses')).join(', ')}`); process.exit(2); }
  return hit;
}

const file = resolve(target);
const onlyFlags = args.includes('--flags');
const avoid = (opt('avoid', '') || '').split(',').map((w) => w.trim()).filter(Boolean);
const introLimit = +opt('intro', 60), repeatLimit = +opt('repeat', 2), learner = opt('learner', 'w');
/** A takeaway is read once, at the end of the line: one or two sentences, 20 words in all (notes: 12 a sentence). */
const TAKEAWAY = { sentences: 2, wordsPerSentence: 20, words: 20 };
const plain = (c) => c.replace(/\[%[^\]]*\]\s*/g, '').trim();
const words = (t) => t.split(/\s+/).filter(Boolean).length;
/** An explainer-style note ("Kd4! — Take the opposition. Kf5? — ...") in its parts; any other note whole. */
const parts = (t) => (/^\S+ — /.test(t) ? t.split(/ (?=\S+ — )/) : [t]);
/** The note without its move ("Kd4! — "), to find the same words said again. */
const body = (t) => t.replace(/^\S+ — /, '');

const games = readPgn(fs.readFileSync(file, 'utf8'));
const counts = {};
const flag = (list, kind, text) => { list.push(`${kind}: ${text}`); counts[kind] = (counts[kind] ?? 0) + 1; };
const lessons = new Map();
const out = [];
for (const gm of games) {
  const name = gm.tags.LineName ?? gm.tags.Event;
  const flags = [];
  const intro = plain(gm.intro);
  if (words(intro) > introLimit) flag(flags, 'long-intro', `${words(intro)} words`);
  const g = new Chess(gm.tags.FEN);
  const rows = [];
  const said = new Map();
  let learnerMoves = 0, notes = 0;
  for (const m of gm.moves) {
    const mine = g.turn() === learner;
    const num = `${g.moveNumber()}${g.turn() === 'w' ? '.' : '...'}`;
    g.move(m.san);
    const note = plain(m.comment.replace(/\[%also [^\]]*\]/, ''));
    const marks = /\[%c(sl|al) /.test(m.comment);
    if (mine) { learnerMoves++; if (note) notes++; }
    if (!note && !m.also.length) continue;
    rows.push(`   ${num} ${m.san}${m.also.length ? ` [also ${m.also.join(',')}]` : ''}${marks ? ' (marks)' : ''}${note ? `: ${note}` : ''}`);
    if (!note) continue;
    for (const p of parts(note)) { const r = readable(p); if (r.length) flag(flags, 'long-note', `${m.san}: ${r.join('; ')}`); }
    const b = body(note);
    said.set(b, (said.get(b) ?? 0) + 1);
  }
  for (const [b, k] of said) if (k > repeatLimit) flag(flags, 'repeat', `${k} times "${b}"`);
  if (!plain(gm.moves[gm.moves.length - 1]?.comment ?? '')) flag(flags, 'no-closing', 'the last move has no note');
  const takeaway = gm.tags.LineDescription ?? '';
  const t = readable(takeaway, TAKEAWAY);
  if (t.length) flag(flags, 'long-note', `takeaway: ${t.join('; ')}`);
  const all = [intro, takeaway, ...gm.moves.map((m) => plain(m.comment))].join(' ');
  for (const w of avoid) if (all.toLowerCase().includes(w.toLowerCase())) flag(flags, 'avoid', `"${w}"`);
  const lesson = name.replace(/ \(\d+\/\d+\)$/, '');
  const ls = lessons.get(lesson) ?? { lines: 0, learnerMoves: 0, notes: 0, introWords: 0, flagged: 0 };
  Object.assign(ls, { lines: ls.lines + 1, learnerMoves: ls.learnerMoves + learnerMoves, notes: ls.notes + notes, introWords: ls.introWords + words(intro), flagged: ls.flagged + (flags.length ? 1 : 0) });
  lessons.set(lesson, ls);
  if (onlyFlags && !flags.length) continue;
  out.push(`## ${name}  ${gm.tags.FEN}`, `  intro: ${intro}`, ...rows, `  => ${takeaway}`, ...flags.map((f) => `  !! ${f}`), '');
}
console.log(out.join('\n'));
console.log(`${path.relative(APP, file)}: ${games.length} lines`);
for (const [lesson, s] of lessons) {
  console.log(`  ${lesson.padEnd(48)} ${String(s.lines).padStart(3)} lines, ${String(s.learnerMoves).padStart(4)} learner moves, ` +
    `${String(Math.round((100 * s.notes) / Math.max(1, s.learnerMoves))).padStart(3)}% with a note, intro ${Math.round(s.introWords / s.lines)} words on average` +
    `${s.flagged ? `, ${s.flagged} flagged` : ''}`);
}
const total = Object.values(counts).reduce((a, b) => a + b, 0);
console.log(total ? `flags: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}` : 'flags: none');
if (args.includes('--strict') && total) process.exit(1);
