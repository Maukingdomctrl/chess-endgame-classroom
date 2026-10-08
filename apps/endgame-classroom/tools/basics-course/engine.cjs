// Plays lines with best play on top of the exact solvers (coordinates: square = rank * 8 + file).
//   K+Q / K+R vs K (mate3.cjs): White plays a fastest mate (lowest DTM), Black the longest defence.
//   K+P vs K (../kpk-course): the King & Pawn course's engine, fastest safe promotion.
const M = require('./mate3.cjs');
const KP = require('../kpk-course/engine.cjs');
const { file, rank, dist, kingAdj } = M;

/** Ring of a square counted from the centre: 0 = d4/e4/d5/e5 ... 3 = the edge. */
const ring = (s) => Math.max(Math.abs(file(s) - 3.5), Math.abs(rank(s) - 3.5)) - 0.5;
const onEdge = (s) => ring(s) === 3;
const isCorner = (s) => (file(s) === 0 || file(s) === 7) && (rank(s) === 0 || rank(s) === 7);
const directOpp = (a, b) =>
  (file(a) === file(b) && Math.abs(rank(a) - rank(b)) === 2) || (rank(a) === rank(b) && Math.abs(file(a) - file(b)) === 2);
const knightJump = (a, b) => {
  const df = Math.abs(file(a) - file(b)), dr = Math.abs(rank(a) - rank(b));
  return (df === 1 && dr === 2) || (df === 2 && dr === 1);
};

/** The black king's box: every square it can still reach if White stood still (its own square included). */
function box(S, wk, bk, x) {
  const att = S.attacked(wk, x);
  const ok = (t) => !att[t] && dist(t, wk) > 1 && t !== x;
  const seen = new Set([bk]);
  const stack = [bk];
  while (stack.length) {
    const s = stack.pop();
    for (const t of kingAdj[s]) if (!seen.has(t) && ok(t)) { seen.add(t); stack.push(t); }
  }
  return [...seen].sort((a, b) => a - b);
}

/** White's moves with their result: d = DTM in plies of the position after the move (0 = mate, -1 = draw). */
function whiteOptions(S, s) {
  return S.whiteMoves(s.wk, s.bk, s.x).map((m) => {
    const [wk, bk, x] = m.child;
    const replies = S.blackMoves(wk, bk, x);
    const stalemate = !replies.length && !S.inCheck(wk, bk, x);
    const hangs = replies.some((r) => r.capture);
    return { ...m, d: S.val(wk, bk, x, 1), stalemate, hangs, check: S.inCheck(wk, bk, x) };
  });
}
/** Black's moves: d = DTM (plies) of the position after the move; a capture of the piece is a draw (-1). */
function blackOptions(S, s) {
  return S.blackMoves(s.wk, s.bk, s.x).map((m) => ({ ...m, d: m.capture ? -1 : S.val(m.child[0], m.child[1], m.child[2], 0) }));
}

/**
 * Plays a mating line from a White-to-move position. White plays a fastest mate; among equally fast
 * moves the line takes the one that leaves the smallest box (then a king move, then the king
 * closest to Black's), and the others are listed as just as good. Black plays the longest defence;
 * among equally long ones it stays closest to the centre, then farthest from the white king.
 */
function playMate(S, start, opts = {}) {
  let s = { ...start, stm: 0 };
  const plies = [];
  for (let n = 0; n < 80; n++) {
    if (s.stm === 0) {
      const os = whiteOptions(S, s).filter((o) => o.d >= 0);
      if (!os.length) return { plies, end: 'error:no-win' };
      const best = Math.min(...os.map((o) => o.d));
      const tops = os.filter((o) => o.d === best);
      const boxAfter = (o) => box(S, ...o.child).length;
      const rank_ = opts.prefer ?? (() => 0);
      tops.sort((a, b) => rank_(a, s) - rank_(b, s) || boxAfter(a) - boxAfter(b) || (a.kind === 'k' ? 0 : 1) - (b.kind === 'k' ? 0 : 1) ||
        dist(a.child[0], s.bk) - dist(b.child[0], s.bk) || a.from - b.from || a.to - b.to);
      const pick = tops[0];
      plies.push({ side: 'w', move: pick, unique: tops.length === 1, alts: tops.length, others: tops.slice(1).map(({ from, to }) => ({ from, to })), before: { ...s } });
      if (pick.d === 0) return { plies, end: 'mate' };
      s = { wk: pick.child[0], bk: pick.child[1], x: pick.child[2], stm: 1 };
    } else {
      const os = blackOptions(S, s);
      if (!os.length) return { plies, end: 'error:stuck' };
      if (os.some((o) => o.d < 0)) return { plies, end: 'error:black-escapes' };
      const worst = Math.max(...os.map((o) => o.d));
      const tops = os.filter((o) => o.d === worst);
      tops.sort((a, b) => ring(a.to) - ring(b.to) || dist(b.to, s.wk) - dist(a.to, s.wk) || a.to - b.to);
      const pick = tops[0];
      plies.push({ side: 'b', move: pick, before: { ...s } });
      s = { wk: s.wk, bk: pick.to, x: s.x, stm: 0 };
    }
  }
  return { plies, end: 'max' };
}

/**
 * The rook's waiting move: the black king is on an edge and the white king faces it two lines in
 * (face to face, or a knight's jump apart); the rook, not attacked, moves without check and without
 * letting the king out. Black then has to step in front of the white king (and is mated) or step back.
 */
function kingsOnEdge(wk, bk) {
  const df = Math.abs(file(wk) - file(bk)), dr = Math.abs(rank(wk) - rank(bk));
  return ((rank(bk) === 0 || rank(bk) === 7) && dr === 2 && df <= 1) || ((file(bk) === 0 || file(bk) === 7) && df === 2 && dr <= 1);
}
const isWait = (S, o, s) => o.kind === 'x' && !o.check && dist(s.bk, s.x) > 1 && kingsOnEdge(s.wk, s.bk) &&
  box(S, ...o.child).length <= box(S, s.wk, s.bk, s.x).length;

/** Box size at each of White's turns. */
const boxSizes = (S, line) => line.plies.filter((p) => p.side === 'w').map((p) => box(S, p.before.wk, p.before.bk, p.before.x).length);
const monotone = (arr) => arr.every((v, i) => i === 0 || v <= arr[i - 1]);

module.exports = { M, KP, ring, onEdge, isCorner, directOpp, knightJump, box, isWait, whiteOptions, blackOptions, playMate, boxSizes, monotone };
