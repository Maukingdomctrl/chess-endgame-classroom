// Converts the picked lines into real FENs + SAN with chess.js and checks every move a second time,
// on the real FEN, with chess.js and the exact solvers (../course-kit/verify.cjs):
//   - each learner move keeps the win and is a fastest one (K+Q/K+R: lowest DTM; K+P: fastest safe
//     promotion, and the promotion piece that mates fastest);
//   - its [%also] list is exactly the other equally fast moves (none slower, none missing);
//   - each opponent move is the most stubborn defence (longest DTM / latest promotion);
//   - the line ends in checkmate (K+Q/K+R) or a safe promotion (K+P).
// Any problem stops the build.
const fs = require('fs');
const path = require('path');
const { Chess } = require('chess.js');
const { sqName: n, boardFen } = require('../course-kit/board.cjs');
const { afterLearner, cmp, verifyLine, summary } = require('../course-kit/verify.cjs');
const VERIFY = require('./verify-opts.cjs');
const picked = require('./.out/picked.json');

function toActual(pk) {
  const pcs = pk.kind === 'p' ? [[pk.s.wk, 'K'], [pk.s.bk, 'k'], [pk.s.p, 'P']] : [[pk.s.wk, 'K'], [pk.s.bk, 'k'], [pk.s.x, pk.kind.toUpperCase()]];
  const fen = `${boardFen(pcs)} w - - 0 1`;
  const g = new Chess(fen);
  const moves = [];
  for (const pl of pk.line.plies) {
    const m = pl.move;
    const side = pl.side === 'w' || pl.side === 'att' ? 'w' : 'b';
    let promo = m.promo;
    let also = (pl.others ?? []).map((o) => new Chess(g.fen()).move({ from: n(o.from), to: n(o.to), promotion: o.promo }).san);
    if (m.kind === 'promo') {
      // promote to the piece that mates fastest; another piece that mates just as fast is listed
      const opts = ['q', 'r'].map((pc) => {
        const t = new Chess(g.fen());
        const mv = t.move({ from: n(m.from), to: n(m.to), promotion: pc });
        return { pc, san: mv.san, v: afterLearner(t.fen(), VERIFY) };
      }).filter((o) => o.v);
      opts.sort((a, b) => cmp(a.v, b.v));
      promo = opts[0].pc;
      also = opts.filter((o) => o.pc !== promo && cmp(o.v, opts[0].v) === 0).map((o) => o.san);
    }
    const before = g.fen();
    const mv = g.move({ from: n(m.from), to: n(m.to), promotion: promo });
    moves.push({ san: mv.san, side, kind: m.kind === 'x' ? 'piece' : m.kind === 'promo' ? 'promo' : m.kind === 'p' ? 'pawn' : 'king', also, fenBefore: before, from: mv.from, to: mv.to });
  }
  return { fen, moves };
}

let problems = 0;
const out = [];
const results = [];
for (const pk of picked) {
  const act = toActual(pk);
  const res = verifyLine(act, VERIFY);
  results.push(res);
  for (const p of res.problems) { problems++; console.log('PROBLEM', pk.group, p); }
  act.moves.filter((m) => m.side === 'w').forEach((m, i) => { m.unique = res.unique[i]; });
  out.push({ lesson: pk.lesson, group: pk.group, kind: pk.kind, fen: act.fen, moves: act.moves });
}

// ---------- report ----------
const learner = out.flatMap((l) => l.moves.filter((m) => m.side === 'w'));
const withAlso = learner.filter((m) => m.also.length).length;
const st = summary(results);
console.log(`verified ${out.length} lines, ${st.learnerMoves} learner moves: ${st.unique} unique (${st.pct}%), ` +
  `${withAlso} with [%also] alternatives (${learner.reduce((s, m) => s + m.also.length, 0)} alternatives in all); problems: ${problems}`);
for (const l of out) {
  const txt = l.moves.map((m) => (m.side === 'w' && m.also.length ? `${m.san}[${m.also.join(',')}]` : m.san)).join(' ');
  console.log(`${l.group.padEnd(15)} ${l.fen.padEnd(28)} ${txt}`);
}
if (problems) {
  console.error(`build: ${problems} problem(s) found, the course was not written`);
  process.exit(1);
}
fs.writeFileSync(path.join(__dirname, '.out/lines.json'), JSON.stringify(out, null, 1));
