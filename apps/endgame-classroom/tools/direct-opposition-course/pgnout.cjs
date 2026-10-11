// Writes the Direct Opposition course PGN from the verified lines: one lesson per phase of the blueprint,
// intros by the slot's help level (3: the idea named, a cue, marks; 2: a cue and marks; 1: a cue; 0:
// nothing before the move), the explanation of every important learner move from the course's explainer
// (teach/explain.cjs with the course's words: nothing flagged is shown), the tempting mistake on the first
// move, a closing note on the last move, and marks in Learn mode only. Then it reads the file back and
// checks every line again (pgn.checkCourse with verify.cjs).
const path = require('path');
const { Chess } = require('chess.js');
const { SLOTS, PHASES } = require('../course-kit/curricula/opposition/direct-opposition.cjs');
const { readable } = require('../course-kit/teach/explain.cjs');
const { cueProblems } = require('../course-kit/teach/concepts.cjs');
const { withoutHiddenArrows } = require('../course-kit/pawn/teach.cjs');
const { moveComment, formatMarks, writePgn, checkCourse } = require('../course-kit/pgn.cjs');
const { F, R } = require('./keys.cjs');
const T = require('./texts.cjs');
const VERIFY = require('./verify-opts.cjs');
const lines = require('./.out/lines.json');

const OUT = path.join(__dirname, '../../courses/direct-opposition-course.pgn');
const problems = [];
const fail = (n, msg) => problems.push(`slot ${n}: ${msg}`);

// ---------- marks (shown in Learn mode before the learner's move) ----------
/** Red arrows on the tempting moves (likely ones) that let the result go; at most three, none on the move to play. */
function marksBefore(l, i) {
  const m = l.moves[i];
  const none = { squares: [], arrows: [] };
  if (l.help < 2 || !m.note.important) return none;
  const arrows = [...new Set(m.traps.slice(0, 3).map((t) => `R${t.from}${t.to}`))];
  return withoutHiddenArrows({ squares: [], arrows }, m);
}

// ---------- notes (shown after the move) ----------
const body = (text) => text.replace(/^\S+ — /, '');
/** The closing note on the last move of a line: what the board shows. */
function closingNote(l) {
  const last = l.moves[l.moves.length - 1];
  const g = new Chess(last.fenAfter);
  if (l.task === 'defend') {
    if (last.side === 'w' && last.captured === 'p') return 'Draw! You take the pawn, and bare kings cannot win.';
    if (g.isStalemate()) return last.side === 'w' ? 'Draw! Stalemate: Black has no move.' : 'Draw! Stalemate: you have no move left.';
    if (g.isThreefoldRepetition()) return 'Draw! The same position for the third time.';
    throw new Error(`slot ${l.n}: a defending line that does not end in a draw on the board`);
  }
  if (!last.promotion || last.side !== 'w') throw new Error(`slot ${l.n}: a winning line that does not end in a promotion`);
  // who keeps the new piece safe: the white king next to it, or the black king is too far away to take it
  const wk = g.board().flat().find((p) => p && p.type === 'k' && p.color === 'w').square;
  const guard = Math.max(Math.abs(F(sqIdx(wk)) - F(sqIdx(last.to))), Math.abs(R(sqIdx(wk)) - R(sqIdx(last.to)))) === 1;
  if (last.promotion === 'r') {
    const t = new Chess(last.fenBefore);
    t.move({ from: last.from, to: last.to, promotion: 'q' });
    if (!t.isStalemate()) throw new Error(`slot ${l.n}: a rook promotion where the queen would not stalemate`);
    return 'Rook! A queen would have been stalemate. The rook wins just as surely.';
  }
  if (g.isCheckmate()) return 'Queen! And it is checkmate.';
  return guard ? 'Queen! Your king protects the new queen, and the win is easy now.' : 'Queen! The black king cannot take it, and the win is easy now.';
}
const sqIdx = (n) => (n.charCodeAt(1) - 49) * 8 + (n.charCodeAt(0) - 97);

/** The notes of a line, one string per move ('' = none). */
function notesFor(l) {
  const notes = l.moves.map(() => '');
  const said = new Set();
  let first = true, reminders = 0;
  l.moves.forEach((m, i) => {
    if (m.side !== 'w') return;
    const e = m.note;
    // nothing the course cannot say: flagged by the explainer, a word a later course teaches, or a pawn move
    // that leaves Black to move in the opposition (a tempo move: course 6)
    const flagged = e.review.length > 0 || T.UNTAUGHT.test(e.text) || (m.piece === 'p' && e.facts[0] === 'zugzwang');
    if (first) {
      first = false;
      if (flagged || !e.facts.length) fail(l.n, `the first learner move ${m.san} has no grounded explanation: ${e.text} (${e.review.join('; ')})`);
      // the consequence of the tempting mistake: the one the slot is about (build.cjs), else the natural
      // alternative (not a slower win, nothing in untaught words)
      const alt = l.mistake ?? (e.alternative && !/^\S+\?! /.test(e.alternative.text) && !T.UNTAUGHT.test(e.alternative.text) ? e.alternative.text : null);
      if (alt && T.UNTAUGHT.test(alt)) fail(l.n, `the mistake's note uses an untaught word: ${alt}`);
      notes[i] = [e.text, alt].filter(Boolean).join(' ');
      said.add(body(e.text));
      return;
    }
    if (!e.important || flagged || !e.facts.length) return;
    if (!said.has(body(e.text))) { notes[i] = e.text; said.add(body(e.text)); return; }
    // the same reason again: a short reminder, twice at most in a line
    if (e.facts[0] === 'opposition' && reminders++ < 2) notes[i] = `${m.san}${e.mark} — Take the opposition again.`;
  });
  // the last move gets the closing note instead (a promotion, the pawn taken, the draw on the board); the
  // assessment comments on nothing else
  if (l.feedback === 'closing') notes.fill('');
  notes[notes.length - 1] = closingNote(l);
  for (const t of notes) for (const part of t.split(/ (?=\S+[!?]* — )/)) if (part && readable(part).length) fail(l.n, `too long to read in 4-5 seconds: "${part}" (${readable(part).join('; ')})`);
  return notes;
}

// ---------- intros ----------
const legendSaid = new Set();
function introFor(l, lessonFirst, courseFirst, hasMarks) {
  const parts = [];
  if (courseFirst) parts.push(T.COURSE_INTRO);
  if (lessonFirst) parts.push(T.LESSONS[l.phase].intro);
  parts.push(T.situation(l));
  if (l.help === 3) parts.push(T.idea(l));
  const first = l.moves.find((m) => m.side === 'w');
  if (l.help >= 1) {
    const q = T.cue(first.note, l.help);
    if (!q) fail(l.n, `help ${l.help}, but no concept gives a cue for ${first.san}`);
    else if (cueProblems(q).length) fail(l.n, `bad cue "${q}": ${cueProblems(q).join('; ')}`);
    else parts.push(q);
  }
  // the colours, the first time marks of their kind appear in a lesson
  const key = `${l.phase} ${l.task === 'defend'}`;
  if (hasMarks && !legendSaid.has(key)) { legendSaid.add(key); parts.push(T.legend(l)); }
  return parts.filter(Boolean).join(' ');
}

// ---------- the games ----------
const games = [];
PHASES.forEach((p, k) => {
  const own = lines.filter((l) => l.phase === p.id);
  own.forEach((l, j) => {
    const notes = notesFor(l);
    const moveMarks = l.moves.map(() => ({ squares: [], arrows: [] }));
    let introMarks = { squares: [], arrows: [] };
    l.moves.forEach((m, i) => {
      if (m.side !== 'w') return;
      const mk = marksBefore(l, i);
      if (i === 0) introMarks = mk; else moveMarks[i - 1] = mk;
    });
    const hasMarks = [introMarks, ...moveMarks].some((x) => x.squares.length || x.arrows.length);
    const intro = introFor(l, j === 0, k === 0 && j === 0, hasMarks);
    const description = T.takeaway(l);
    for (const c of T.claims(l, [T.situation(l), l.help === 3 ? T.idea(l) : '', description])) fail(l.n, c);
    for (const t of [intro, description, ...notes]) if (T.UNTAUGHT.test(t)) fail(l.n, `a word course 1 does not teach: "${t}"`);
    games.push({
      name: `${String(k + 1).padStart(2, '0')}. ${T.LESSONS[p.id].title} (${j + 1}/${own.length})`,
      description,
      fen: l.fen,
      intro: [formatMarks(introMarks), intro].filter(Boolean).join(' '),
      moves: l.moves.map((m, i) => ({ san: m.san, comment: moveComment(moveMarks[i], m.also, notes[i]) })),
    });
  });
});
for (const p of problems) console.log('PROBLEM', p);
if (problems.length) {
  console.error(`pgnout: ${problems.length} problem(s), the course was not written`);
  process.exit(1);
}
writePgn(OUT, games);

// ---------- read the file back and check it all again ----------
const lessonOf = (name) => +name.slice(0, 2);
const noHelp = new Set(PHASES.map((p, k) => (SLOTS.slice(p.from - 1, p.to).every((s) => s.help === 0) ? k + 1 : 0)));
const res = checkCourse(OUT, {
  count: SLOTS.length,
  verify: VERIFY,
  noMarks: (name) => noHelp.has(lessonOf(name)),
  finalNote: /^(\[%[^\]]*\] )*.*(Queen|Rook|Draw)! /,
});
for (const p of res.problems) console.log('PROBLEM', p);
const { stats } = res;
console.log(`pgnout: wrote ${stats.lines} lines to ${path.relative(process.cwd(), OUT)}; read back and re-verified: ` +
  `${stats.learnerMoves} learner moves, ${stats.unique} unique (${stats.pct}%); problems: ${res.problems.length}`);
if (res.problems.length) {
  console.error(`pgnout: ${res.problems.length} problem(s) in the written course`);
  process.exit(1);
}
