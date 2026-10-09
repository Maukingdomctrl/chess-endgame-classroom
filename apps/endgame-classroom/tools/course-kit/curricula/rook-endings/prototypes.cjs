// Rook and pawn against rook (five pieces): real positions through the whole course pipeline before a
// curriculum is designed: search (structural criteria on the board, then the solver), lines with best play
// (line.cjs), the independent check (verify.cjs), the PGN written and read back and checked again
// (pgn.cjs). Nothing comes from memory: the criteria only say where to look; the solver decides the moves,
// and what a line shows is read off the solver's line.
//
//   node tools/course-kit/curricula/rook-endings/prototypes.cjs        (KIT_CACHE=1: keep the tables)
//
// Kinds (the learner plays White; a defending lesson is the colour-swapped material, K+R vs K+R+P):
//   lucena    the pawn on the 7th (files b-g), the king in front of it, the white rook between the black king
//             and the pawn (the king cut off); White wins in 9-31 plies to the conversion (the safe promotion
//             or the rook won)
//   skewer    the rook in front of its a-pawn on the 7th, the black rook behind the pawn, the black king on
//             f7-h7: a quiet rook move wins (if ...Rxa7, a check along the 7th rank wins the rook)
//   philidor  White defends: the black pawn (files c-f) on the 4th rank with its king beside it, White's king
//             on the pawn's file, White's rook on the 3rd rank three files or more from the black king, the black
//             rook on Black's half; the line holds the draw to a draw on the board (or the last pawn taken
//             with a draw left)
'use strict';
const fs = require('fs');
const path = require('path');
const solver = require('../../solver.cjs');
const { scan, analyse, fenOf } = require('../../egtb/positions.cjs');
const { playLine } = require('../../line.cjs');
const { verifyLine, summary, fastestMoves } = require('../../verify.cjs');
const { writePgn, checkCourse, moveComment } = require('../../pgn.cjs');
const { file, rank } = require('../../board.cjs');

// one course setting for both kinds of line: wins to the conversion, draws held by the mate tables
const VERIFY = { goal: 'conversion', probe: solver.probe, objective: 'auto' };
const OUT = path.join(__dirname, '.out');

// pieces: KRPKR = [wK, bK, wR, wP, bR]; KRKRP (the colour-swapped view) = [wK, bK, wR, bR, bP]
// Wins are looked for in the conversion table itself, so the depth band costs nothing: at least 9 plies to
// the conversion rules out the positions where a piece simply hangs. A seeded sample spreads the picks over
// the table instead of taking neighbours in index order.
const KINDS = [
  {
    id: 'lucena', title: 'The Lucena position', material: 'KRPKR', goal: 'conversion', result: 'win', plies: [9, 31], sample: 0.02, count: 4,
    pre: (s) => rank(s[3]) === 6 && file(s[3]) >= 1 && file(s[3]) <= 6 && s[0] === s[3] + 8 && Math.abs(file(s[1]) - file(s[3])) >= 2 &&
      (file(s[2]) - file(s[3])) * (file(s[2]) - file(s[1])) < 0, // the rook between the black king and the pawn: the king cut off
    intro: 'Your king stands in front of your pawn, the black king is cut off. Promote safely.',
    takeaway: 'With the king in front of the pawn and the black king cut off, the rook shelters the king and the pawn promotes.',
  },
  {
    id: 'skewer', title: 'The skewer behind the pawn', material: 'KRPKR', goal: 'conversion', result: 'win', plies: [3, 31], count: 3,
    pre: (s) => s[3] === 48 && s[2] === 56 && file(s[4]) === 0 && rank(s[4]) < 6 && rank(s[1]) === 6 && file(s[1]) >= 5,
    intro: 'Your rook stands in front of your rook\'s pawn, the black rook behind it. Find the winning rook move.',
    takeaway: 'If the rook takes the pawn, a check along the 7th rank wins the rook.',
  },
  {
    id: 'philidor', title: 'The Philidor defence', material: 'KRKRP', goal: 'mate', result: 'draw', sample: 0.05, count: 3,
    pre: (s) => rank(s[4]) === 3 && file(s[4]) >= 2 && file(s[4]) <= 5 && rank(s[1]) === 3 && Math.abs(file(s[1]) - file(s[4])) === 1 &&
      file(s[0]) === file(s[4]) && rank(s[0]) <= 1 && rank(s[2]) === 2 && Math.abs(file(s[2]) - file(s[1])) >= 3 && rank(s[3]) >= 5,
    // (the black king beside its pawn, White's rook well away from it, the black rook on its own side of the board)
    intro: 'Your king is on the queening square, your rook on the 3rd rank. Hold the draw.',
    takeaway: 'Keep the rook on the 3rd rank until the pawn advances, then check from behind.',
  },
];

const t0 = Date.now();
fs.mkdirSync(OUT, { recursive: true });
const games = [], rows = [];
for (const [ki, kind] of KINDS.entries()) {
  const T = solver.table(kind.material, { goal: kind.goal });
  const found = [];
  for (const c of scan(T, { stm: 0, result: kind.result, plies: kind.plies, pre: kind.pre, sample: kind.sample })) {
    // a win: a single fastest move by the course's measure (the conversion); a draw: the moves that hold it
    const fen = fenOf(T, c.sqs, 0);
    const fast = kind.result === 'win' ? fastestMoves(fen, VERIFY) : analyse(T, c.sqs, 0).keep.map((m) => m.san); // T: the mate table here
    if (kind.result === 'win' && fast.length !== 1) continue;
    const l = playLine(fen, { goal: 'conversion', objective: kind.result === 'draw' ? 'hold' : undefined });
    if (l.end.startsWith('error') || l.end === 'max') { rows.push({ kind: kind.id, fen, problem: l.end }); continue; }
    found.push({ fen, line: l, first: fast });
    if (found.length >= kind.count) break;
  }
  found.forEach((f, i) => {
    const moves = f.line.plies.map((p) => ({ san: p.san, also: p.also ?? [] }));
    const r = verifyLine({ fen: f.fen, moves }, VERIFY);
    rows.push({ kind: kind.id, fen: f.fen, end: f.line.end, plies: moves.length, unique: r.unique.filter(Boolean).length, learnerMoves: r.unique.length, problems: r.problems });
    const last = moves.length - 1;
    games.push({
      name: `${String(ki + 1).padStart(2, '0')}. ${kind.title} (${i + 1}/${found.length})`,
      description: kind.takeaway, fen: f.fen,
      intro: i === 0 ? `${kind.intro} You play White.` : kind.intro,
      moves: moves.map((m, j) => ({ san: m.san, comment: moveComment(null, j % 2 === 0 ? m.also : [], j === last ? (f.line.end === 'draw' ? 'A draw: the defence held.' : 'Done: the win is safe.') : '') })),
    });
  });
}
const pgnFile = path.join(OUT, 'rook-endings-prototypes.pgn');
writePgn(pgnFile, games);
const back = checkCourse(pgnFile, { verify: VERIFY, learner: 'w', finalNote: /A draw|Done/ });

for (const r of rows) {
  if (r.problem) { console.log(`skip ${r.kind}: ${r.fen}: ${r.problem}`); continue; }
  console.log(`${r.problems.length ? 'FAIL' : 'ok  '} ${r.kind.padEnd(8)} ${r.fen}  ${r.plies} plies to ${r.end}, ${r.unique}/${r.learnerMoves} learner moves unique${r.problems.length ? `: ${r.problems[0]}` : ''}`);
}
const s = summary(rows.filter((r) => !r.problem).map((r) => ({ unique: Array.from({ length: r.learnerMoves }, (_, k) => k < r.unique) })));
console.log(`${games.length} lines; ${s.unique}/${s.learnerMoves} learner moves unique (${s.pct}%); written to ${path.relative(process.cwd(), pgnFile)}`);
console.log(`read back from disk: ${back.problems.length ? `${back.problems.length} problem(s): ${back.problems[0]}` : 'every line verified again'} (${back.stats.lines} lines, ${back.stats.withAlso} learner moves with [%also])`);
console.log(`${((Date.now() - t0) / 1000).toFixed(0)} s`);
process.exit(rows.some((r) => r.problems?.length) || back.problems.length ? 1 : 0);
