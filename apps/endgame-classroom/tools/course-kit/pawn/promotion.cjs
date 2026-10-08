// Promotion choices. The goal (solver goal 'promotion') is reached by a queen or a rook that the black king
// cannot take at once, without stalemate. Never assume the queen: where it would stalemate, the rook is
// the move (and a bishop or knight never counts). Among moves that reach the goal at once, the line plays
// the one with the fastest mate afterwards, exactly as ../verify.cjs ranks them, so the [%also] list the
// checker expects is the same.
const { Chess } = require('chess.js');
const { sqName: n } = require('../board.cjs');
const { afterLearner, cmp } = require('../verify.cjs');

const fenAfter = (fen, o) => { const g = new Chess(fen); g.move({ from: n(o.from), to: n(o.to), promotion: o.promo || undefined }); return g.fen(); };

/** Of the solver options that reach the goal now (promotions, a mate), the ones ranked best by verify.cjs. */
function bestFinishes(fen, options, verify) {
  const scored = options.map((o) => ({ o, k: afterLearner(fenAfter(fen, o), verify) })).filter((x) => x.k);
  scored.sort((a, b) => cmp(a.k, b.k));
  return scored.filter((x) => cmp(x.k, scored[0].k) === 0).map((x) => x.o);
}

/**
 * Is a promotion move (chess.js, already played on g) a safe promotion by the rules alone, without any
 * solver: a queen or a rook, not stalemate, and the king cannot take it. (Such a position is always won.)
 * The independent checker uses this.
 */
function safeByRule(g, move) {
  if (!move.promotion || !'qr'.includes(move.promotion)) return false;
  if (g.isStalemate()) return false;
  return !g.moves({ verbose: true }).some((m) => m.to === move.to);
}

/** The other pawn's queen moves that would fail here, and why: [{ san, why: 'stalemate' | 'taken' }]. */
function failedQueens(fen, exceptFrom) {
  return new Chess(fen).moves({ verbose: true }).filter((x) => x.promotion === 'q' && x.from !== exceptFrom).map((x) => {
    const t = new Chess(fen); t.move(x.san);
    if (t.isStalemate()) return { san: x.san, why: 'stalemate' };
    if (t.moves({ verbose: true }).some((y) => y.captured && y.captured !== 'p')) return { san: x.san, why: 'taken' };
    return null;
  }).filter(Boolean);
}

module.exports = { bestFinishes, safeByRule, failedQueens, fenAfter };
