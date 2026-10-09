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
// opts.learner: 'w' | 'b' when the line starts with the opponent's move (default: the side to move).
//
// opts.objective 'hold' (a drawn position, e.g. defending against a pawn; verify.cjs checks it the same
// way): the learner plays a move that keeps the draw, the others that keep it become [%also] (all of them:
// a draw is a draw); a move that ends the game on the board (taking the last pawn, stalemate) comes first,
// then one that repeats no position of the line, then learnerOrder and a fixed order. The opponent never
// lets the learner win; among its moves that keep the draw it plays, deterministically: no position
// repeated while another move is possible; taking the last pawn first (the game is drawn); stalemating the
// learner last (no real player throws the game away like that); then the most testing try (the fewest
// replies that hold for the learner), a pawn move before a king move (progress, so the line ends),
// opponentOrder and a fixed order. The line ends in a draw on the board: stalemate, insufficient material
// or threefold repetition ({ end: 'draw' }); within maxPlies (default 80), else { end: 'error: ...' }.
const { Chess } = require('chess.js');
const { afterLearner, afterOpponent, cmp, holdingMoves, resultFor } = require('./verify.cjs');
const { sqIdx, ring } = require('./board.cjs');

const fenAfter = (fen, mv) => { const g = new Chess(fen); g.move(mv); return g.fen(); };
const byKey = (a, b) => (a.from + a.to + (a.promotion ?? '') < b.from + b.to + (b.promotion ?? '') ? -1 : 1);
/** Default for the opponent: keep the king nearest the centre, then a fixed order. */
const centralKing = (a, b) => (a.piece === 'k' ? ring(sqIdx(a.to)) : 9) - (b.piece === 'k' ? ring(sqIdx(b.to)) : 9) || byKey(a, b);

const drawnOnBoard = (g) => g.isStalemate() || g.isInsufficientMaterial() || g.isThreefoldRepetition();
const positionKey = (fen) => fen.split(' ').slice(0, 4).join(' ');

/** The 'hold' objective (see the header). */
function playHold(fen, opts, vopts) {
  const g = new Chess(fen);
  const learner = opts.learner ?? g.turn();
  const plies = [];
  const seen = new Set([positionKey(g.fen())]);
  const endsGame = (san) => { const t = new Chess(g.fen()); t.move(san); return t.isStalemate() || t.isInsufficientMaterial(); };
  for (let n = 0; n < (opts.maxPlies ?? 80); n++) {
    if (drawnOnBoard(g)) return { plies, end: 'draw' };
    if (g.isCheckmate()) return { plies, end: 'error: checkmate in a holding line' };
    const before = g.fen();
    const ctx = { fen: before, chess: g };
    const moves = g.moves({ verbose: true });
    if (g.turn() === learner) {
      const holding = holdingMoves(before, vopts);
      if (!holding.length) return { plies, end: 'error: the learner cannot hold the draw' };
      const best = moves.filter((m) => holding.includes(m.san));
      const repeats = (m) => (seen.has(positionKey(fenAfter(before, m.san))) ? 1 : 0);
      best.sort((a, b) => endsGame(b.san) - endsGame(a.san) || repeats(a) - repeats(b) || (opts.learnerOrder ? opts.learnerOrder(a, b, ctx) : 0) || byKey(a, b));
      plies.push({ fen: before, san: best[0].san, learner: true, also: best.slice(1).map((m) => m.san), unique: best.length === 1, move: best[0] });
      g.move(best[0].san);
    } else {
      const keep = moves.map((m) => ({ m, after: fenAfter(before, m.san) })).filter((x) => resultFor(x.after, vopts, learner) !== 'win');
      if (!keep.length) return { plies, end: 'error: the opponent cannot keep the draw' };
      for (const x of keep) {
        const t = new Chess(x.after);
        x.repeats = seen.has(positionKey(x.after)) ? 1 : 0;
        x.ends = t.isInsufficientMaterial() ? -1 : t.isStalemate() ? 1 : 0; // take the last pawn first, stalemate last
        x.holds = x.ends ? 0 : holdingMoves(x.after, vopts).length; // the fewer, the more testing
      }
      keep.sort((a, b) => a.repeats - b.repeats || a.ends - b.ends || a.holds - b.holds ||
        (a.m.piece === 'p' ? 0 : 1) - (b.m.piece === 'p' ? 0 : 1) || (opts.opponentOrder ? opts.opponentOrder(a.m, b.m, ctx) : 0) || byKey(a.m, b.m));
      plies.push({ fen: before, san: keep[0].m.san, learner: false, move: keep[0].m });
      g.move(keep[0].m.san);
    }
    seen.add(positionKey(g.fen()));
  }
  return { plies, end: drawnOnBoard(g) ? 'draw' : 'error: no draw on the board within maxPlies' };
}

function playLine(fen, opts = {}) {
  const vopts = { goal: opts.goal ?? 'mate', probe: opts.probe ?? require('./solver.cjs').probe, promotionProbe: opts.promotionProbe };
  if (opts.objective === 'hold') return playHold(fen, opts, vopts);
  const g = new Chess(fen);
  const learner = opts.learner ?? g.turn();
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
