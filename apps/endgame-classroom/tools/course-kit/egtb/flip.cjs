// A table seen with the colours swapped: K+R vs K+R+P is K+R+P vs K+R with White and Black exchanged and
// the board turned (rank 1 <-> rank 8). Distance to mate does not depend on the colours, so solver.cjs
// answers the flipped material from the one table instead of building a second one (the learner plays White,
// in a defending lesson as much as in an attacking one). Only for goal 'mate': the conversion and promotion
// goals are White's.
//
//   const v = flipped(table('KRPKR'));   // the table of KRKRP: value(), options(), moves(), decode() ...
'use strict';
const { normalise, piecesOf, nameOf } = require('./layout.cjs');

const VALUE = [0, 9, 5, 3, 3, 1]; // K Q R B N P
/** The material with the colours swapped ('KRKRP' -> 'KRPKR'). */
const flipName = (name) => { const i = name.indexOf('K', 1); return normalise(name.slice(i) + name.slice(0, i)); };
/** Is this material the one stored, of it and its flipped twin? The side with more material is White (then the name). */
function stored(name) {
  const f = flipName(name);
  if (f === name) return true;
  const worth = (n) => { const ps = piecesOf(n); return ps.reduce((a, p) => a + (p.c === 0 ? 1 : -1) * VALUE[p.t], 0); };
  return worth(name) > worth(f) || (worth(name) === worth(f) && name < f);
}

class Flipped {
  constructor(T) {
    this.inner = T;
    this.name = flipName(T.name);
    this.goal = T.goal;
    const mine = piecesOf(this.name), theirs = piecesOf(T.name);
    this.n = mine.length;
    this.col = Int8Array.from(mine.map((p) => p.c));
    this.typ = Int8Array.from(mine.map((p) => p.t));
    // perm[k]: the inner table's piece for my piece k (same kind, other colour; identical pieces in order)
    const used = new Set();
    this.perm = Int8Array.from(mine.map((p) => { const j = theirs.findIndex((q, j2) => !used.has(j2) && q.t === p.t && q.c === 1 - p.c); used.add(j); return j; }));
    this.back = new Int8Array(this.n);
    this.perm.forEach((j, k) => { this.back[j] = k; });
    this.size = T.size;
    this.layout = T.layout;
    this.t = new Int8Array(this.n);
    if (nameOf(mine.map((p) => ({ c: 1 - p.c, t: p.t }))) !== T.name) throw new Error(`flip: ${this.name} is not ${T.name} turned`);
  }
  get stats() { return this.inner.stats; }
  get val() { return this.inner.val; }
  /** My squares -> the inner table's (in this.t). */
  turn(sqs) { const t = this.t; for (let k = 0; k < this.n; k++) t[this.perm[k]] = sqs[k] < 0 ? -1 : sqs[k] ^ 56; return t; }
  value(sqs, stm) { return this.inner.value(this.turn(sqs), 1 - stm); }
  valueEp(sqs, stm, ep) { return this.inner.valueEp(this.turn(sqs), 1 - stm, ep < 0 ? -1 : ep ^ 56); }
  valueAt(i) { return this.inner.valueAt(i); }
  legal(sqs, stm) { return this.inner.legal(this.turn(sqs), 1 - stm); }
  inCheck(sqs, stm) { return this.inner.inCheck(this.turn(sqs), 1 - stm); }
  index(sqs, stm) { return this.inner.index(this.turn(sqs), 1 - stm); }
  decode(i, sqs) {
    const t = this.t, stm = this.inner.decode(i, t);
    for (let k = 0; k < this.n; k++) sqs[k] = t[this.perm[k]] ^ 56;
    return 1 - stm;
  }
  stores(i, sqs) { const ok = this.inner.stores(i, this.t); for (let k = 0; k < this.n; k++) sqs[k] = this.t[this.perm[k]] ^ 56; return ok; }
  options(sqs, stm, ep = -1) {
    return this.inner.options(this.turn(sqs), 1 - stm, ep < 0 ? -1 : ep ^ 56).map((o) => ({ ...o, piece: this.back[o.piece], from: o.from ^ 56, to: o.to ^ 56 }));
  }
  moves(sqs, stm, buf, ep = -1) {
    const m = this.inner.moves(this.turn(sqs), 1 - stm, buf, ep < 0 ? -1 : ep ^ 56);
    for (let x = 0; x < m; x++) { buf[x * 4] = this.back[buf[x * 4]]; buf[x * 4 + 1] ^= 56; if (buf[x * 4 + 3] >= 0) buf[x * 4 + 3] = this.back[buf[x * 4 + 3]]; }
    return m;
  }
}
const views = new WeakMap();
/** The flipped view of a table (one per table). */
function flipped(T) { let v = views.get(T); if (!v) { v = new Flipped(T); views.set(T, v); } return v; }

module.exports = { flipped, flipName, stored };
