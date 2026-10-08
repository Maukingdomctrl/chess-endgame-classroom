// Turns picked lines (solver squares) into real lines (FEN, SAN, [%also]) with chess.js, mirrored where the
// selection asked for it, and checks every move with ../verify.cjs on the real FENs. Fails loudly: the
// caller stops when problems is not empty.
//
//   const { lines, problems, stats } = realize(picked, verify);
const { Chess } = require('chess.js');
const { sqName: n, boardFen } = require('../board.cjs');
const { verifyLine, summary } = require('../verify.cjs');

/** One picked line as { fen, moves: [{ san, side, piece, also, fenBefore, from, to, capture, promotion }] }. */
function toActual(pk) {
  const tr = (q) => (q < 0 ? q : pk.mirror ? q ^ 7 : q);
  const start = pk.line.plies[0].before.map(tr);
  const fen = `${boardFen(start.map((q, k) => [q, 'KkPP'[k]]).filter(([q]) => q >= 0))} w - - 0 1`;
  const g = new Chess(fen);
  const mv = (o) => ({ from: n(tr(o.from)), to: n(tr(o.to)), promotion: o.promo || undefined });
  const moves = pk.line.plies.map((pl) => {
    const also = (pl.others ?? []).map((o) => new Chess(g.fen()).move(mv(o)).san);
    const fenBefore = g.fen();
    const m = g.move(mv(pl));
    return { san: m.san, side: pl.side, piece: m.piece, also, fenBefore, from: m.from, to: m.to, capture: !!m.captured, promotion: m.promotion ?? '' };
  });
  return { fen, moves };
}

function realize(picked, verify) {
  const lines = [], results = [], problems = [];
  for (const pk of picked) {
    const act = toActual(pk);
    const res = verifyLine(act, verify);
    results.push(res);
    for (const p of res.problems) problems.push(`${pk.group}: ${p}`);
    act.moves.filter((m) => m.side === 'w').forEach((m, i) => { m.unique = res.unique[i]; });
    lines.push({ lesson: pk.lesson, group: pk.group, fen: act.fen, moves: act.moves });
  }
  const st = summary(results);
  return { lines, problems, stats: { ...st, withAlso: lines.flatMap((l) => l.moves.filter((m) => m.side === 'w' && m.also.length)).length } };
}

module.exports = { realize, toActual };
