// Candidate positions: every White-to-move win in a promotion table (each position once, mirror images
// and pawn order merged by the solver's canonical index), filtered, with a single fastest first move.
//
//   const cands = enumerate(player, 'KPPK', { maxV: 25, accept: connected });
//   firstMove(player, c)   // the single fastest first move, or null
//
// Positions that promote at once (v = 1) are kept unresolved: ranking their finishes needs chess.js and
// the mate tables (promotion.cjs), which is slow, so firstMove() decides when a lesson group asks.
const { table } = require('../solver.cjs');

/** [{ i (table index), v (plies to the promotion), sqs, first (the fastest first move; null: not decided yet) }] */
function enumerate(player, material, { maxV = 25, accept = () => true } = {}) {
  const T = table(material, { goal: 'promotion' });
  const cands = [];
  const sq = new Int8Array(T.n);
  for (let i = 0; i < T.size; i += 2) {
    const v = T.val[i];
    if (v <= 0 || v > maxV) continue;
    T.decode(i, sq);
    if (!accept(sq)) continue;
    if (!T.legal(sq, 0) || T.index(sq, 0) !== i) continue;
    if (v === 1) { cands.push({ i, v, sqs: [...sq], first: null }); continue; }
    const w = player.whiteMoves([...sq]);
    if (!w || w.tops.length !== 1) continue;
    cands.push({ i, v, sqs: [...sq], first: w.tops[0] });
  }
  return cands;
}

/** The single fastest first move of a candidate, or null when there are several. */
function firstMove(player, c) {
  if (c.first === null && c.v === 1) { const w = player.whiteMoves([...c.sqs]); c.first = w && w.tops.length === 1 ? w.tops[0] : false; }
  return c.first || null;
}

module.exports = { enumerate, firstMove };
