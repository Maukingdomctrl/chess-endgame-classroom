// Plays a course line with best play from any position the solver covers: the learner (the side to
// move at the start) always plays a fastest move, the opponent the most stubborn defence. It uses the
// same measure as verify.cjs, so a line it plays passes the check (which still runs independently).
//
//   const { playLine } = require('./line.cjs');
//   playLine('8/8/8/4k3/8/8/8/R3K2R w - - 0 1')
//   // { plies: [{ fen, san, learner: true, also: [...], unique, move }, ...], end: 'mate' }
//
// opts.goal / opts.probe / opts.promotionProbe: as for verify.cjs ('mate' by default, the toolkit's solver).
// opts.learnerOrder(a, b, ctx) / opts.opponentOrder(a, b, ctx): order among equally good moves (the first
// one is played; for the learner the others become [%also]). a and b are chess.js verbose moves; ctx is
// { fen, chess } before the move. By default the opponent's king stays nearest the centre.
const { Chess } = require('chess.js');
const { afterLearner, afterOpponent, cmp } = require('./verify.cjs');
const { sqIdx, ring } = require('./board.cjs');

const fenAfter = (fen, mv) => { const g = new Chess(fen); g.move(mv); return g.fen(); };
const byKey = (a, b) => (a.from + a.to + (a.promotion ?? '') < b.from + b.to + (b.promotion ?? '') ? -1 : 1);
/** Default for the opponent: keep the king nearest the centre, then a fixed order. */
const centralKing = (a, b) => (a.piece === 'k' ? ring(sqIdx(a.to)) : 9) - (b.piece === 'k' ? ring(sqIdx(b.to)) : 9) || byKey(a, b);

function playLine(fen, opts = {}) {
  const vopts = { goal: opts.goal ?? 'mate', probe: opts.probe ?? require('./solver.cjs').probe, promotionProbe: opts.promotionProbe };
  const g = new Chess(fen);
  const learner = g.turn();
  const plies = [];
  for (let n = 0; n < (opts.maxPlies ?? 300); n++) {
    if (g.isCheckmate()) return { plies, end: 'mate' };
    const before = g.fen();
    const ctx = { fen: before, chess: g };
    const moves = g.moves({ verbose: true });
    if (g.turn() === learner) {
      const vals = moves.map((m) => ({ m, v: afterLearner(fenAfter(before, m.san), vopts) })).filter((x) => x.v);
      if (!vals.length) return { plies, end: 'error: the learner has no winning move' };
      vals.sort((a, b) => cmp(a.v, b.v));
      const best = vals.filter((x) => cmp(x.v, vals[0].v) === 0).map((x) => x.m);
      best.sort((a, b) => (opts.learnerOrder ? opts.learnerOrder(a, b, ctx) : 0) || byKey(a, b));
      plies.push({ fen: before, san: best[0].san, learner: true, also: best.slice(1).map((m) => m.san), unique: best.length === 1, move: best[0] });
      g.move(best[0].san);
      if (vopts.goal === 'promotion' && best[0].promotion) return { plies, end: 'promotion' };
    } else {
      const vals = moves.map((m) => ({ m, v: afterOpponent(fenAfter(before, m.san), vopts) }));
      if (vals.some((x) => x.v === null)) return { plies, end: 'error: the opponent can escape' };
      const longest = Math.max(...vals.map((x) => x.v));
      const best = vals.filter((x) => x.v === longest).map((x) => x.m);
      best.sort((a, b) => (opts.opponentOrder ?? centralKing)(a, b, ctx));
      plies.push({ fen: before, san: best[0].san, learner: false, move: best[0] });
      g.move(best[0].san);
    }
  }
  return { plies, end: 'max' };
}

module.exports = { playLine, centralKing };
