// Lines with best play for White's pawns against the lone king, from the exact solver measured to the
// promotion (solver goal 'promotion'): White the quickest safe promotion, Black the longest defence. If
// Black takes a pawn, the line goes on with the pawn that is left.
//
//   const player = createPlayer({ verify });          // verify: the course's verify-opts.cjs
//   player.playLine([wk, bk, p1, p2])                  // { plies, final, promo } or null
//
// Among equally fast White moves the line plays the first by `whiteOrder` (the others become [%also]);
// among equally long Black defences the first by `blackOrder`. The defaults are the method of the
// two-connected-pawns course: White leaves no pawn hanging, prefers pawn moves, the pawn further from the
// black king, the king nearer the front pawn; Black takes a pawn when that is just as good, then stays
// near the front pawn. Change them per course only with a reason (they decide which equal move is shown).
const { table } = require('../solver.cjs');
const { dist, boardFen } = require('../board.cjs');
const { pawns, front, hangs } = require('./geometry.cjs');
const { bestFinishes } = require('./promotion.cjs');

const fenOf = (s, stm) => `${boardFen(s.map((q, k) => [q, 'KkPP'[k]]).filter(([q]) => q >= 0))} ${stm ? 'b' : 'w'} - - 0 1`;
const buf = new Int16Array(1024);

/** Default White order: a list of keys compared in turn (lower first). */
const defaultWhiteOrder = (s, o) => {
  const c = [...s]; c[o.piece] = o.to;
  return [pawns(c).some((p) => hangs(c, p)) ? 1 : 0, o.piece === 0 ? 1 : 0, o.piece === 0 ? dist(o.to, front(s)) : -dist(o.to, s[1]), o.from, o.to];
};
const defaultBlackOrder = (s, a, b) => b.capture - a.capture || dist(a.to, front(s)) - dist(b.to, front(s)) || a.to - b.to;

function createPlayer({ verify, whiteOrder = defaultWhiteOrder, blackOrder = defaultBlackOrder, maxPlies = 80 }) {
  const tables = {};
  /** The promotion table for the pawns left (built on first use). */
  const tab = (s) => (tables[pawns(s).length] ??= table(`K${'P'.repeat(pawns(s).length)}K`, { goal: 'promotion' }));
  const view = (s) => Int8Array.from([s[0], s[1], ...pawns(s)]);

  /** White's fastest moves, in the order the line plays them: { best (plies), tops: [options] } or null. */
  function whiteMoves(s) {
    const os = tab(s).options(view(s), 0).filter((o) => o.v > 0);
    if (!os.length) return null;
    const best = Math.min(...os.map((o) => o.v));
    let tops = os.filter((o) => o.v === best);
    if (best === 1) tops = bestFinishes(fenOf(s, 0), tops, verify);
    tops.sort((a, b) => { const x = whiteOrder(s, a), y = whiteOrder(s, b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; });
    return { best, tops };
  }

  /** A line from White's move to the promotion: { plies, final, promo }, or null when it is not a clean win. */
  function playLine(start) {
    let s = [...start];
    const plies = [];
    for (let k = 0; k < maxPlies; k++) {
      const w = whiteMoves(s);
      if (!w) return null;
      const o = w.tops[0];
      plies.push({ side: 'w', piece: o.piece, from: o.from, to: o.to, promo: o.promo, others: w.tops.slice(1).map((x) => ({ from: x.from, to: x.to, promo: x.promo })), before: [...s], v: w.best });
      if (w.best === 1) { s[o.piece] = o.to; return { plies, final: s, promo: o.promo }; }
      s[o.piece] = o.to;
      const bo = tab(s).options(view(s), 1);
      if (!bo.length || bo.some((x) => x.v >= 0)) return null; // stalemate or an escape: not a won line
      const worst = Math.min(...bo.map((x) => x.v));
      const bt = bo.filter((x) => x.v === worst);
      bt.sort((a, b) => blackOrder(s, a, b));
      const m = bt[0];
      plies.push({ side: 'b', piece: 1, from: s[1], to: m.to, capture: m.capture, before: [...s] });
      if (m.capture) {
        const kept = s[2] === m.to ? s[3] : s[2];
        s = [s[0], m.to, kept, -1];
      } else s[1] = m.to;
    }
    return null;
  }

  /** White moves that stalemate at once (promotions aside): [{ from, to }]. */
  function stalemates(s) {
    const T = tab(s), v = view(s);
    return T.options(v, 0).filter((o) => !o.promo && o.v === 0 && (() => {
      const c = Int8Array.from(v); c[o.piece] = o.to;
      return T.moves(c, 1, buf) === 0 && !T.inCheck(c, 1);
    })()).map((o) => ({ from: o.from, to: o.to }));
  }

  return { tab, view, fenOf, whiteMoves, playLine, stalemates };
}

module.exports = { createPlayer, defaultWhiteOrder, defaultBlackOrder, fenOf };
