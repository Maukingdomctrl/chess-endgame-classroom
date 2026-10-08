// Writes course PGNs in the app's format and reads them back for the final check.
//
// One game per line of the course: [Event] = [LineName] = "NN. Lesson title (i/n)", [SetUp "1"], [FEN],
// [LineDescription] (the takeaway shown when the line is done), an intro comment before the first move,
// and per move a comment made of board marks ([%csl]/[%cal]), [%also] alternatives and a note.
const fs = require('fs');
const { Chess } = require('chess.js');
const { verifyLine, summary } = require('./verify.cjs');

/** Board marks as PGN commands. marks: { squares: ['Gd6', ...], arrows: ['Rd4d5', ...] } (G green, R red, B blue). */
function formatMarks(marks) {
  if (!marks) return '';
  return [marks.squares?.length ? `[%csl ${marks.squares.join(',')}]` : '', marks.arrows?.length ? `[%cal ${marks.arrows.join(',')}]` : '']
    .filter(Boolean).join(' ');
}
/** A move comment: marks, then [%also], then the note ('' when there is nothing to say). */
const moveComment = (marks, also, note) => [formatMarks(marks), also?.length ? `[%also ${also.join(',')}]` : '', note].filter(Boolean).join(' ');

/** Splits movetext into rows of at most 80 characters, as PGN readers expect. */
function wrap(text) {
  const rows = [];
  let row = '';
  for (const w of text.split(' ')) { if (row && row.length + w.length + 1 > 80) { rows.push(row); row = w; } else row = row ? `${row} ${w}` : w; }
  rows.push(row);
  return rows.join('\n');
}
const tag = (k, v) => `[${k} "${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`;

/**
 * One game. g: { name, description, fen, intro (comment text before the first move, marks included),
 * moves: [{ san, comment }] }.
 */
function gameText(g) {
  const chess = new Chess(g.fen);
  let mt = `{${g.intro}}`;
  let needNumber = true;
  for (const m of g.moves) {
    const num = chess.moveNumber();
    if (chess.turn() === 'w') mt += ` ${num}. ${m.san}`;
    else mt += needNumber ? ` ${num}... ${m.san}` : ` ${m.san}`;
    chess.move(m.san);
    needNumber = !!m.comment;
    if (m.comment) mt += ` {${m.comment}}`;
  }
  mt += ' *';
  const tags = [['Event', g.name], ['Site', 'Endgame Classroom'], ['White', '?'], ['Black', '?'], ['Result', '*'],
    ['SetUp', '1'], ['FEN', g.fen], ['LineName', g.name], ['LineDescription', g.description]];
  return tags.map(([k, v]) => tag(k, v)).join('\n') + '\n\n' + wrap(mt) + '\n';
}
const writePgn = (file, games) => fs.writeFileSync(file, games.map(gameText).join('\n'));

/** Reads a PGN written by writePgn: [{ tags, intro, moves: [{ san, comment, also }] }]. */
function readPgn(text) {
  return text.split(/\n(?=\[Event )/).map((chunk) => {
    const tags = Object.fromEntries([...chunk.matchAll(/^\[(\w+) "((?:[^"\\]|\\.)*)"\]$/gm)].map((m) => [m[1], m[2].replace(/\\(.)/g, '$1')]));
    const body = chunk.slice(chunk.indexOf('\n\n') + 2).replace(/\n/g, ' ');
    const tokens = body.match(/\{[^}]*\}|[^\s{}]+/g) ?? [];
    const moves = [];
    let intro = '';
    for (const t of tokens) {
      if (t.startsWith('{')) { if (moves.length) moves[moves.length - 1].comment = t.slice(1, -1); else intro = t.slice(1, -1); continue; }
      if (t === '*' || /^\d+\.+$/.test(t)) continue;
      moves.push({ san: t, comment: '' });
    }
    for (const m of moves) m.also = (m.comment.match(/\[%also ([^\]]+)\]/)?.[1] ?? '').split(',').filter(Boolean);
    return { tags, intro, moves };
  });
}

/**
 * Reads a written course back and checks it all again: tags, intro, marks syntax, every line with
 * verifyLine, the learner's colour and a closing note on the last move.
 * opts: { count, verify (opts for verifyLine), learner: 'w' | 'b', noMarks: (name) => bool, finalNote: RegExp }
 * Returns { problems: [...], stats }.
 */
function checkCourse(file, opts) {
  const problems = [];
  const fail = (...a) => problems.push(a.join(' '));
  const games = readPgn(fs.readFileSync(file, 'utf8'));
  if (opts.count !== undefined && games.length !== opts.count) fail(`expected ${opts.count} lines, read back ${games.length}`);
  const results = [];
  let withAlso = 0, alsoTotal = 0;
  for (const gm of games) {
    const name = gm.tags.LineName;
    if (!/^\d\d\. .+ \(\d+\/\d+\)$/.test(name ?? '') || gm.tags.Event !== name) fail('bad LineName/Event', name);
    if (gm.tags.SetUp !== '1' || !gm.tags.FEN || !gm.tags.LineDescription) fail('missing tags', name);
    if (!gm.intro.trim()) fail('no intro comment', name);
    if (opts.learner && gm.tags.FEN?.split(' ')[1] !== opts.learner) fail('the learner does not start', name);
    for (const c of [gm.intro, ...gm.moves.map((m) => m.comment)]) {
      for (const [, cmd, args] of c.matchAll(/\[%(\w+) ([^\]]*)\]/g)) {
        const ok = cmd === 'csl' ? /^[GRBY][a-h][1-8](,[GRBY][a-h][1-8])*$/.test(args)
          : cmd === 'cal' ? /^[GRBY][a-h][1-8][a-h][1-8](,[GRBY][a-h][1-8][a-h][1-8])*$/.test(args) : cmd === 'also';
        if (!ok) fail('bad mark', name, cmd, args);
        if (opts.noMarks?.(name) && cmd !== 'also') fail('marks where there should be none', name);
      }
    }
    const res = verifyLine({ fen: gm.tags.FEN, moves: gm.moves }, opts.verify);
    for (const p of res.problems) fail(name, p);
    results.push(res);
    const learner = gm.moves.filter((_, i) => i % 2 === 0);
    withAlso += learner.filter((m) => m.also.length).length;
    alsoTotal += learner.reduce((s, m) => s + m.also.length, 0);
    const last = gm.moves[gm.moves.length - 1]?.comment ?? '';
    if (opts.finalNote && !opts.finalNote.test(last)) fail('the final move has no closing note', name, last);
  }
  return { problems, stats: { lines: games.length, ...summary(results), withAlso, alsoTotal } };
}

module.exports = { formatMarks, moveComment, wrap, gameText, writePgn, readPgn, checkCourse };
