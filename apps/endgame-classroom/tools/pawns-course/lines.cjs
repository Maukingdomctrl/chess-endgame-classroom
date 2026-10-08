// Lines with best play for the two-connected-pawns course (K+P+P vs K), with the exact solver measured to
// the promotion (solver goal 'promotion'): White the quickest safe promotion, Black the longest defence.
// If Black takes a pawn, the line goes on as K+P vs K.
const { Chess } = require('chess.js');
const { table } = require('../course-kit/solver.cjs');
const { file, rank, dist, sqName: n, boardFen } = require('../course-kit/board.cjs');
const { afterLearner, cmp } = require('../course-kit/verify.cjs');
const VERIFY = require('./verify-opts.cjs');

// squares in the solver's table order: 0 white king, 1 black king, 2 and 3 the pawns (3 = -1 once taken)
const T2 = table('KPPK', { goal: 'promotion' }), T1 = table('KPK', { goal: 'promotion' });
const tab = (s) => (s[3] < 0 ? T1 : T2);
const view = (s) => (s[3] < 0 ? Int8Array.of(s[0], s[1], s[2]) : Int8Array.from(s));
const pawns = (s) => (s[3] < 0 ? [s[2]] : [s[2], s[3]]);
const fenOf = (s, stm) => `${boardFen(s.map((q, k) => [q, 'KkPP'[k]]).filter(([q]) => q >= 0))} ${stm ? 'b' : 'w'} - - 0 1`;
const fenAfter = (fen, o) => { const g = new Chess(fen); g.move({ from: n(o.from), to: n(o.to), promotion: o.promo || undefined }); return g.fen(); };
/** Can the black king take pawn square p (next to it and not protected)? */
const hangs = (s, p) => dist(s[1], p) === 1 && !(dist(s[0], p) === 1 || pawns(s).some((q) => q !== p && rank(p) === rank(q) + 1 && Math.abs(file(p) - file(q)) === 1));
const front = (s) => pawns(s).reduce((a, b) => (rank(b) > rank(a) ? b : a)); // the most advanced pawn

/**
 * White's fastest moves (the goal is reached when best is 1: then the promotion, or mate, with the fastest
 * mate afterwards, as ../course-kit/verify.cjs measures it), in the order the line plays them: no pawn left
 * hanging, pawn moves before king moves, the pawn further from the black king, the king nearer the front
 * pawn. The first is played, the others become [%also].
 */
function whiteMoves(s) {
  const os = tab(s).options(view(s), 0).filter((o) => o.v > 0);
  if (!os.length) return null;
  const best = Math.min(...os.map((o) => o.v));
  let tops = os.filter((o) => o.v === best);
  if (best === 1) {
    const fen = fenOf(s, 0);
    const scored = tops.map((o) => ({ o, k: afterLearner(fenAfter(fen, o), VERIFY) })).filter((x) => x.k);
    scored.sort((a, b) => cmp(a.k, b.k));
    tops = scored.filter((x) => cmp(x.k, scored[0].k) === 0).map((x) => x.o);
  }
  const after = (o) => { const c = [...s]; c[o.piece] = o.to; return c; };
  const pref = (o) => {
    const c = after(o);
    return [pawns(c).some((p) => hangs(c, p)) ? 1 : 0, o.piece === 0 ? 1 : 0, o.piece === 0 ? dist(o.to, front(s)) : -dist(o.to, s[1]), o.from, o.to];
  };
  tops.sort((a, b) => { const x = pref(a), y = pref(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; });
  return { best, tops };
}

/** Plays a line from White's move to the promotion. Black: the longest defence; among equally long ones it takes a pawn, then stays near the front pawn. */
function playLine(start) {
  let s = [...start];
  const plies = [];
  for (let k = 0; k < 80; k++) {
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
    bt.sort((a, b) => b.capture - a.capture || dist(a.to, front(s)) - dist(b.to, front(s)) || a.to - b.to);
    const m = bt[0];
    plies.push({ side: 'b', piece: 1, from: s[1], to: m.to, capture: m.capture, before: [...s] });
    if (m.capture) {
      const kept = s[2] === m.to ? s[3] : s[2];
      s = [s[0], m.to, kept, -1];
    } else s[1] = m.to;
  }
  return null;
}

// ---------- candidate positions: White to move, two connected pawns, a single fastest first move ----------
const buf = new Int16Array(1024);
/** White moves that stalemate at once (promotions aside). */
const stalemates = (s) => T2.options(Int8Array.from(s), 0).filter((o) => !o.promo && o.v === 0 && (() => {
  const c = Int8Array.from(s); c[o.piece] = o.to;
  return T2.moves(c, 1, buf) === 0 && !T2.inCheck(c, 1);
})()).map((o) => ({ from: o.from, to: o.to }));
/** Every White-to-move win with two connected pawns (rank and file apart by at most 1) and a single fastest first move. */
function candidates(maxV = 25) {
  const cands = [];
  const sq = new Int8Array(4);
  for (let i = 0; i < T2.size; i += 2) {
    const v = T2.val[i];
    if (v <= 0 || v > maxV) continue;
    T2.decode(i, sq);
    if (Math.abs(file(sq[2]) - file(sq[3])) !== 1 || Math.abs(rank(sq[2]) - rank(sq[3])) > 1) continue; // connected
    if (!T2.legal(sq, 0) || T2.index(sq, 0) !== i) continue;
    if (v === 1) { cands.push({ i, v, sqs: [...sq], first: null }); continue; } // decided when a group asks (see firstMove)
    const w = whiteMoves([...sq]);
    if (!w || w.tops.length !== 1) continue;
    cands.push({ i, v, sqs: [...sq], first: w.tops[0] });
  }
  return cands;
}

module.exports = { T1, T2, tab, view, pawns, fenOf, hangs, front, whiteMoves, playLine, stalemates, candidates };
