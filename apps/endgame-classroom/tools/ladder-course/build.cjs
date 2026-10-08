// Converts the picked lines into real FENs + SAN with chess.js and checks every move a second time, on
// the real FEN, with chess.js and the exact solver (../course-kit/verify.cjs): every learner move is a
// fastest mate, its [%also] list is exactly the other equally fast moves, every opponent move is the
// most stubborn defence, and the line ends in checkmate. Any problem stops the build.
const fs = require('fs');
const path = require('path');
const { Chess } = require('chess.js');
const { sqName: n, boardFen } = require('../course-kit/board.cjs');
const { verifyLine, summary } = require('../course-kit/verify.cjs');
const VERIFY = require('./verify-opts.cjs');
const picked = require('./.out/picked.json');

const LETTERS = { rr: ['K', 'k', 'R', 'R'], qr: ['K', 'k', 'Q', 'R'] };

function toActual(pk) {
  const start = pk.line.plies[0].before;
  const fen = `${boardFen(start.map((s, k) => [s, LETTERS[pk.m][k]]))} w - - 0 1`;
  const g = new Chess(fen);
  const moves = pk.line.plies.map((pl) => {
    const also = (pl.others ?? []).map((o) => new Chess(g.fen()).move({ from: n(o.from), to: n(o.to) }).san);
    const fenBefore = g.fen();
    const mv = g.move({ from: n(pl.from), to: n(pl.to) });
    return { san: mv.san, side: pl.side, piece: pl.piece, also, fenBefore, from: mv.from, to: mv.to };
  });
  return { fen, moves };
}

let problems = 0;
const out = [], results = [];
for (const pk of picked) {
  const act = toActual(pk);
  const res = verifyLine(act, VERIFY);
  results.push(res);
  for (const p of res.problems) { problems++; console.log('PROBLEM', pk.group, p); }
  act.moves.filter((m) => m.side === 'w').forEach((m, i) => { m.unique = res.unique[i]; });
  out.push({ lesson: pk.lesson, group: pk.group, m: pk.m, fen: act.fen, moves: act.moves });
}
const st = summary(results);
const withAlso = out.flatMap((l) => l.moves.filter((m) => m.side === 'w' && m.also.length)).length;
console.log(`verified ${out.length} lines, ${st.learnerMoves} learner moves: ${st.unique} unique (${st.pct}%), ${withAlso} with [%also] alternatives; problems: ${problems}`);
for (const l of out) console.log(`${l.group.padEnd(13)} ${l.fen.padEnd(30)} ${l.moves.map((m) => (m.also.length ? `${m.san}[${m.also.join(',')}]` : m.san)).join(' ')}`);
if (problems) {
  console.error(`build: ${problems} problem(s) found, the course was not written`);
  process.exit(1);
}
fs.writeFileSync(path.join(__dirname, '.out/lines.json'), JSON.stringify(out, null, 1));
