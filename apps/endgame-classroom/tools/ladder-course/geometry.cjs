// Board geometry of the ladder mate, shared by the search and the notes. sqs = squares in the solver's
// table order: 0 white king, 1 black king, 2 and 3 the two pieces (K+Q+R vs K: 2 queen, 3 rook).
const { kingAdj } = require('../course-kit/board.cjs');

/** The black king's box: the squares it could still reach if White stood still (its own square included). */
function box(T, sqs) {
  const s = Int8Array.from(sqs);
  const bk = s[1];
  s[1] = -1; // the king does not block a line it is standing on
  const seen = new Uint8Array(64);
  seen[bk] = 1;
  const stack = [bk];
  const out = [bk];
  while (stack.length) {
    const q = stack.pop();
    for (const t of kingAdj[q]) {
      if (seen[t] || t === s[0] || t === s[2] || t === s[3]) continue;
      seen[t] = 1;
      if (T.attacked(s, t, 0)) continue;
      stack.push(t);
      out.push(t);
    }
  }
  return out.sort((a, b) => a - b);
}
/** Is piece k protected (by the other piece or the white king)? */
function guarded(T, sqs, k) {
  const s = Int8Array.from(sqs);
  const sq = s[k];
  s[k] = -1;
  s[1] = -1;
  return T.attacked(s, sq, 0);
}
module.exports = { box, guarded };
