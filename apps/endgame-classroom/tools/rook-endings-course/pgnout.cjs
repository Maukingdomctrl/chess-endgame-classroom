// Writes ../../courses/rook-endings-course.pgn from .out/lines.json: the lessons' texts (texts.cjs); on the
// learner's moves the teaching layer's note where it has a reason the board shows (said once per line: a move
// whose only word is the solver's "quickest way" gets no note) and the closing note on the last move; the board
// marks in Learn mode; nothing but the closing note in the exam. Then reads the file back and checks every line
// again (pgn.checkCourse). Fails loudly.
'use strict';
const path = require('path');
const { Chess } = require('chess.js');
const { writePgn, checkCourse, moveComment, formatMarks } = require('../course-kit/pgn.cjs');
const { file, rank, sqName, sqIdx } = require('../course-kit/board.cjs');
const VERIFY = require('./verify-opts.cjs');
const { LESSONS, TAKEAWAY, closing, FINAL_NOTE } = require('./texts.cjs');

const lines = require('./.out/lines.json');
const OUT = path.join(__dirname, '../../courses/rook-endings-course.pgn');
const problems = [];

/** Where the pieces stand: { K, k, R, r, P, p } as square indices (a1 = 0). */
function pieces(fen) {
  const out = {};
  new Chess(fen).board().forEach((row) => row.forEach((x) => { if (x) out[x.color === 'w' ? x.type.toUpperCase() : x.type] = sqIdx(x.square); }));
  return out;
}
const empty = (fen, s) => !new Chess(fen).get(sqName(s));
const fileSquares = (f, fen) => [0, 1, 2, 3, 4, 5, 6, 7].map((r) => r * 8 + f).filter((s) => empty(fen, s));
const rankSquares = (r, fen) => [0, 1, 2, 3, 4, 5, 6, 7].map((f) => r * 8 + f).filter((s) => empty(fen, s));
const sq = (list, c) => list.map((s) => `${c}${sqName(s)}`);
/**
 * The marks shown before learner move i of a line (in Learn mode), by the lesson's kind of marks; shown keeps what a
 * line has shown already.
 */
function marksFor(l, i, kind, shown) {
  const m = l.moves[i];
  const squares = [];
  if (kind === 'none') return { squares, arrows: [] };
  if (l.group === 'lucena') {
    const p = pieces(m.fenBefore);
    // blue: the file that cuts the black king off (the rook's, between the black king and the pawn), the first time
    if (kind === 'full' && !shown.cut && (file(p.R) - file(p.P)) * (file(p.R) - file(p.k)) < 0) {
      squares.push(...sq(fileSquares(file(p.R), m.fenBefore), 'B'));
      shown.cut = true;
    }
    // green: where the rook goes on the 4th rank (the bridge, the shield), not behind the pawn
    if (m.piece === 'r' && rank(sqIdx(m.to)) === 3 && file(sqIdx(m.to)) !== file(p.P)) squares.push(`G${m.to}`);
  } else if (l.group === 'skewer') {
    const p = pieces(m.fenBefore);
    if (kind === 'full' && i === 0) squares.push(...sq(rankSquares(rank(p.P), m.fenBefore), 'B'));
    if (kind === 'full' && m.piece === 'r' && m.check && l.moves[i + 1]?.captured === 'r') squares.push(`G${m.to}`);
  } else if (l.group === 'philidor') {
    // every square the rook can hold the draw from: the line's move and its [%also]
    if (kind === 'full' && i === 0) {
      const g = new Chess(m.fenBefore);
      squares.push(...[m.san, ...m.also].map((san) => `G${g.moves({ verbose: true }).find((x) => x.san === san).to}`));
    }
  }
  return { squares, arrows: [] };
}

/**
 * The learner's note on move i: the teaching layer's reason, once per line; without a reason of its own, on a move
 * where a likely mistake loses the result, that mistake and what the solver's refutation does ("Not Ke5: Black
 * takes the pawn."), when the refutation shows something on the board; the closing note on the last move.
 */
function noteFor(l, i, said, exam) {
  const m = l.moves[i];
  if (i === l.moves.length - 1) return closing(m);
  if (exam) return '';
  const n = m.note;
  if (n.facts.length) {
    const fresh = n.facts.filter((f) => !said.has(f));
    n.facts.forEach((f) => said.add(f));
    if (fresh.length) return n.text;
  }
  // the alternative's first sentence, what the refutation does; not a rook simply given away, each once in a line
  const alt = n.alternative;
  const why = alt?.text.replace(/^\S+ — /, '').split(/(?<=\.)\s/)[0];
  if (!n.important || !alt || /^Black answers |takes the rook/.test(why) || said.has(why)) return '';
  said.add(why);
  return `${m.san}${n.mark} — Not ${alt.san}: ${why.replace(/^(You|Now) /, (w) => w.toLowerCase())}`;
}

const games = [];
for (const L of LESSONS) {
  const ls = lines.filter((l) => l.lesson === L.id);
  ls.forEach((l, gi) => {
    const exam = L.id === 'exam';
    // the lesson's first intro; then the line's pattern's, else the lesson's next one; in the exam only the task
    const intro = gi === 0 ? L.intro[0] : exam ? '' : L.byPattern?.[l.pattern] ?? L.intro[Math.min(gi, L.intro.length - 1)];
    const parts = [intro, exam ? L.task[l.group] : '', gi === 0 ? L.colours : ''].filter(Boolean);
    const said = new Set();
    const shown = {};
    const moveMarks = l.moves.map(() => ({ squares: [], arrows: [] }));
    let introMarks = { squares: [], arrows: [] };
    if (l.moves[l.moves.length - 1].side !== 'w') problems.push(`${l.fen}: the line ends with Black's move`);
    const notes = l.moves.map((m, i) => {
      if (m.side !== 'w') return '';
      const mk = marksFor(l, i, L.marks, shown);
      if (i === 0) introMarks = mk; else moveMarks[i - 1] = mk;
      return noteFor(l, i, said, exam);
    });
    games.push({
      name: `${String(LESSONS.indexOf(L) + 1).padStart(2, '0')}. ${L.title} (${gi + 1}/${ls.length})`,
      description: L.takeaway ?? TAKEAWAY[l.group],
      fen: l.fen,
      intro: [formatMarks(introMarks), parts.join(' ')].filter(Boolean).join(' '),
      moves: l.moves.map((m, i) => ({ san: m.san, comment: moveComment(moveMarks[i], m.side === 'w' ? m.also : [], notes[i]) })),
    });
  });
}
writePgn(OUT, games);

// ---- read the file back and check it all again ----
const back = checkCourse(OUT, {
  count: lines.length, verify: VERIFY, learner: 'w',
  noMarks: (name) => name.includes('Final exam'),
  finalNote: FINAL_NOTE,
});
problems.push(...back.problems);
for (const p of problems) console.log('PROBLEM', p);
const st = back.stats;
console.log(`pgnout: wrote ${st.lines} lines to ${path.relative(process.cwd(), OUT)}; read back and re-verified: ${st.learnerMoves} learner moves, ` +
  `${st.unique} unique (${st.pct}%), ${st.withAlso} with [%also] (${st.alsoTotal} alternatives); problems: ${problems.length}`);
if (problems.length) {
  console.error(`pgnout: ${problems.length} problem(s) in the written course`);
  process.exit(1);
}
