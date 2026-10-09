// Materials and table layouts for the egtb engine.
//
// A material is named like the toolkit's solver names it: White's pieces then Black's, each starting with
// the king, other pieces in the order Q R B N P ('KRPKR', 'KBBKN', 'KPPKP'). Pieces are kept in that
// order: white king, black king, White's other pieces, Black's other pieces. Identical pieces (same colour
// and kind, always next to each other) form a group stored once, in square order.
//
// Pawnless tables use the 8 symmetries of the board: the white king in the a1-d1-d4 triangle and, when it is
// on the a1-d4 diagonal, the black king on or below the a1-h8 diagonal (462 king pairs); of two images left
// (both kings on the diagonal), the one with the smaller index is kept.
//   index = ((kk * R1 + g1) * R2 + g2 ...) * 2 + stm        (R = 64 for one piece, C(64, k) for k identical)
//
// Tables with pawns are cut into slices, one per placement of the pawns (a pawn move is irreversible and
// leaves its slice). Only the a<->h mirror keeps pawns legal: of a placement and its mirror image the one
// with the smaller key is stored; a placement that is its own mirror image is stored in full. Inside a slice
// the kings are any legal pair (3612) and the other pieces as above.
//   index = (slice * LOCAL + local) * 2 + stm,   local = (kk * R1 + g1) * R2 ...
// Slices are numbered in the order they are solved: the pawns furthest advanced first, so that every pawn
// push leads into a slice that is already solved.
'use strict';
const { rank, SYM, MIRROR, CANDS8, KK8, KK64, Combos, c2, c3 } = require('./geometry.cjs');

const K = 0, Q = 1, R = 2, B = 3, N = 4, P = 5;
const LETTER = 'KQRBNP', ORDER = 'QRBNP';
const TYPE_OF = { K, Q, R, B, N, P };

/** Normalised material name ('KRKRP' -> 'KRPKR'); throws on a bad name. */
function normalise(name) {
  const i = name.indexOf('K', 1);
  if (name[0] !== 'K' || i < 0 || /[^KQRBNP]/.test(name) || name.indexOf('K', i + 1) >= 0) throw new Error(`bad material "${name}" (expected e.g. KRPKR, KBBKN)`);
  const side = (s) => 'K' + [...s.slice(1)].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)).join('');
  return side(name.slice(0, i)) + side(name.slice(i));
}
/** Pieces of a material in table order: [{ c, t }]. */
function piecesOf(name) {
  const i = name.indexOf('K', 1);
  return [{ c: 0, t: K }, { c: 1, t: K }, ...[...name.slice(1, i)].map((ch) => ({ c: 0, t: TYPE_OF[ch] })), ...[...name.slice(i + 1)].map((ch) => ({ c: 1, t: TYPE_OF[ch] }))];
}
/** Material name of a piece list (any order). */
function nameOf(list) {
  const order = (x) => (x.t === K ? x.c : 2 + x.c * 10 + ORDER.indexOf(LETTER[x.t]));
  const s = [...list].sort((a, b) => order(a) - order(b));
  return s.filter((x) => x.c === 0).map((x) => LETTER[x.t]).join('') + s.filter((x) => x.c === 1).map((x) => LETTER[x.t]).join('');
}

const COMBOS64 = [null, new Combos(64, 1), new Combos(64, 2), new Combos(64, 3)];
const COMBOS48 = [null, new Combos(48, 1), new Combos(48, 2), new Combos(48, 3)];

class Layout {
  constructor(name) {
    this.name = normalise(name);
    const list = piecesOf(this.name);
    this.n = list.length;
    if (this.n < 3) throw new Error(`${this.name}: at least one piece besides the kings`);
    this.col = Int8Array.from(list.map((p) => p.c));
    this.typ = Int8Array.from(list.map((p) => p.t));
    this.byColor = [0, 1].map((c) => Int8Array.from(list.map((p, k) => k).filter((k) => list[k].c === c)));
    // groups of identical non-king pieces
    const groups = [];
    for (let k = 2; k < this.n; k++) {
      const g = groups[groups.length - 1];
      if (g && g.c === this.col[k] && g.t === this.typ[k]) g.size++;
      else groups.push({ start: k, size: 1, c: this.col[k], t: this.typ[k] });
    }
    if (groups.some((g) => g.size > 3)) throw new Error(`${this.name}: at most three identical pieces`);
    this.pawns = groups.some((g) => g.t === P);
    this.pieceGroups = groups.filter((g) => g.t !== P); // indexed with 64 squares each
    this.pawnGroups = groups.filter((g) => g.t === P); // the slice (pawns on 48 squares)
    for (const g of this.pieceGroups) g.radix = COMBOS64[g.size].count;
    this.radix = this.pieceGroups.reduce((r, g) => r * g.radix, 1);
    if (!this.pawns) {
      this.slices = 1;
      this.local = KK8.count * this.radix;
    } else {
      this.local = KK64.count * this.radix;
      this.buildSlices();
    }
    this.size = this.slices * this.local * 2;
    if (this.size > 2 ** 32) throw new Error(`${this.name}: ${this.size} positions is more than the engine indexes`);
    // flat group descriptors for the hot paths
    this.gStart = Int8Array.from(this.pieceGroups.map((g) => g.start));
    this.gSize = Int8Array.from(this.pieceGroups.map((g) => g.size));
    this.gRadix = Float64Array.from(this.pieceGroups.map((g) => g.radix));
    // digits of the local index: digit 0 the king pair, digit g + 1 group g; local = sum of digit * mul
    const G = this.pieceGroups.length;
    this.mul = new Float64Array(G + 1);
    this.mul[G] = 1;
    for (let g = G - 1; g >= 0; g--) this.mul[g] = this.mul[g + 1] * this.gRadix[g];
    this.digitRadix = Float64Array.from([(this.pawns ? KK64 : KK8).count, ...this.gRadix]);
    this.groupOf = new Int8Array(this.n).fill(-1); // the group of each piece (kings and pawns: -1)
    this.pieceGroups.forEach((g, gi) => { for (let j = 0; j < g.size; j++) this.groupOf[g.start + j] = gi; });
  }
  /**
   * Like decode(), and the digits of the local index into dig (dig[0] king pair, dig[g + 1] group g).
   * Returns the side to move.
   */
  decodeDigits(i, sqs, dig) {
    const stm = i % 2;
    let local = (i - stm) / 2;
    if (this.pawns) {
      const l = local % this.local, slice = (local - l) / this.local;
      local = l;
      const np = this.pawnCount, pi = this.pawnIdx;
      for (let j = 0; j < np; j++) sqs[pi[j]] = this.sliceSq[slice * np + j];
    }
    const gs = this.gStart, gz = this.gSize, gr = this.gRadix;
    for (let g = gs.length - 1; g >= 0; g--) {
      const x = local % gr[g];
      local = (local - x) / gr[g];
      dig[g + 1] = x;
      const s = gs[g], z = gz[g];
      if (z === 1) sqs[s] = x;
      else { const cs = COMBOS64[z].sq; for (let j = 0; j < z; j++) sqs[s + j] = cs[x * z + j]; }
    }
    dig[0] = local;
    const KK = this.pawns ? KK64 : KK8;
    sqs[0] = KK.w[local]; sqs[1] = KK.b[local];
    return stm;
  }
  /** Squares of digit g (0: the kings) into sqs. */
  setDigit(sqs, g, x) {
    if (g === 0) { const KK = this.pawns ? KK64 : KK8; sqs[0] = KK.w[x]; sqs[1] = KK.b[x]; return; }
    const s = this.gStart[g - 1], z = this.gSize[g - 1];
    if (z === 1) sqs[s] = x;
    else { const cs = COMBOS64[z].sq; for (let j = 0; j < z; j++) sqs[s + j] = cs[x * z + j]; }
  }

  // ----- pawn slices -----
  buildSlices() {
    const w = this.pawnGroups.find((g) => g.c === 0), b = this.pawnGroups.find((g) => g.c === 1);
    this.wp = w ? { start: w.start, size: w.size, combos: COMBOS48[w.size] } : null;
    this.bp = b ? { start: b.start, size: b.size, combos: COMBOS48[b.size] } : null;
    const CW = this.wp ? this.wp.combos.count : 1, CB = this.bp ? this.bp.combos.count : 1;
    this.CB = CB;
    const squares = (grp, i) => (grp ? Array.from(grp.combos.sq.subarray(i * grp.size, (i + 1) * grp.size), (s) => s + 8) : []);
    const mirrorIdx = (grp) => {
      if (!grp) return Int32Array.of(0);
      const m = new Int32Array(grp.combos.count);
      for (let i = 0; i < m.length; i++) m[i] = grp.combos.index(squares(grp, i).map((s) => (s ^ 7) - 8).sort((x, y) => x - y));
      return m;
    };
    this.mirW = mirrorIdx(this.wp); this.mirB = mirrorIdx(this.bp);
    const found = [];
    for (let cw = 0; cw < CW; cw++) for (let cb = 0; cb < CB; cb++) {
      const ws = squares(this.wp, cw), bs = squares(this.bp, cb);
      if (ws.some((s) => bs.includes(s))) continue; // a white and a black pawn on one square
      const key = cw * CB + cb, mkey = this.mirW[cw] * CB + this.mirB[cb];
      if (mkey < key) continue; // stored as its mirror image
      const adv = ws.reduce((a, s) => a + rank(s) - 1, 0) + bs.reduce((a, s) => a + 6 - rank(s), 0);
      found.push({ key, adv, ws, bs, self: mkey === key });
    }
    found.sort((x, y) => y.adv - x.adv || x.key - y.key); // most advanced first
    this.slices = found.length;
    this.sliceOf = new Int32Array(CW * CB).fill(-1);
    this.sliceSq = new Int8Array(found.length * (this.n - 2 - this.pieceGroups.reduce((a, g) => a + g.size, 0)));
    this.sliceAdv = new Int16Array(found.length);
    this.sliceSelf = new Uint8Array(found.length);
    const np = this.sliceSq.length / Math.max(1, found.length);
    this.pawnCount = np;
    found.forEach((f, i) => {
      this.sliceOf[f.key] = i;
      this.sliceAdv[i] = f.adv;
      this.sliceSelf[i] = f.self ? 1 : 0;
      [...f.ws, ...f.bs].forEach((s, j) => { this.sliceSq[i * np + j] = s; });
    });
    // the piece indices the slice squares belong to (white pawns, then black pawns)
    this.pawnIdx = Int8Array.from([...(this.wp ? Array.from({ length: this.wp.size }, (_, j) => this.wp.start + j) : []), ...(this.bp ? Array.from({ length: this.bp.size }, (_, j) => this.bp.start + j) : [])]);
  }
  /** Key of the pawn placement of a position and of its mirror image. */
  pawnKey(sqs) {
    let cw = 0, mw = 0, cb = 0, mb = 0;
    const wp = this.wp, bp = this.bp;
    if (wp) {
      const s = wp.start;
      if (wp.size === 1) cw = sqs[s] - 8;
      else if (wp.size === 2) cw = c2(sqs[s] - 8, sqs[s + 1] - 8);
      else cw = c3(sqs[s] - 8, sqs[s + 1] - 8, sqs[s + 2] - 8);
      mw = this.mirW[cw];
    }
    if (bp) {
      const s = bp.start;
      if (bp.size === 1) cb = sqs[s] - 8;
      else if (bp.size === 2) cb = c2(sqs[s] - 8, sqs[s + 1] - 8);
      else cb = c3(sqs[s] - 8, sqs[s + 1] - 8, sqs[s + 2] - 8);
      mb = this.mirB[cb];
    }
    this._mkey = mw * this.CB + mb;
    return cw * this.CB + cb;
  }

  // ----- index -----
  /** Group part of the index (the pieces other than kings and pawns), through the square map T. */
  groupIndex(sqs, T, i) {
    const gs = this.gStart, gz = this.gSize, gr = this.gRadix;
    for (let g = 0; g < gs.length; g++) {
      const s = gs[g];
      if (gz[g] === 1) i = i * 64 + T[sqs[s]];
      else if (gz[g] === 2) i = i * 2016 + c2(T[sqs[s]], T[sqs[s + 1]]);
      else i = i * gr[g] + c3(T[sqs[s]], T[sqs[s + 1]], T[sqs[s + 2]]);
    }
    return i;
  }
  /** Table index of a legal position (any mirror image of it gives the same index). */
  index(sqs, stm) {
    if (!this.pawns) {
      const cands = CANDS8[sqs[0]];
      let best = -1;
      for (let c = 0; c < cands.length; c++) {
        const T = SYM[cands[c]];
        const kk = KK8.id[T[sqs[0]] * 64 + T[sqs[1]]];
        if (kk < 0) continue;
        const i = this.groupIndex(sqs, T, kk) * 2 + stm;
        if (best < 0 || i < best) best = i;
      }
      return best;
    }
    let key = this.pawnKey(sqs);
    let T = SYM[0];
    if (this._mkey < key) { key = this._mkey; T = SYM[MIRROR]; }
    const slice = this.sliceOf[key];
    return (slice * this.local + this.groupIndex(sqs, T, KK64.id[T[sqs[0]] * 64 + T[sqs[1]]])) * 2 + stm;
  }
  /** Index inside a known slice and orientation (the position's pawns are the slice's, as stored). */
  sliceIndex(sqs, stm, slice) {
    return (slice * this.local + this.groupIndex(sqs, SYM[0], KK64.id[sqs[0] * 64 + sqs[1]])) * 2 + stm;
  }
  /**
   * The position stored at index i, in its stored orientation, into sqs; returns the side to move. The
   * squares may overlap (an unused index): check with valid().
   */
  decode(i, sqs) {
    const stm = i % 2;
    let r = (i - stm) / 2;
    let local = r;
    if (this.pawns) {
      local = r % this.local;
      const slice = (r - local) / this.local;
      const np = this.pawnCount, pi = this.pawnIdx;
      for (let j = 0; j < np; j++) sqs[pi[j]] = this.sliceSq[slice * np + j];
    }
    const gs = this.gStart, gz = this.gSize, gr = this.gRadix;
    for (let g = gs.length - 1; g >= 0; g--) {
      const x = local % gr[g];
      local = (local - x) / gr[g];
      const s = gs[g], z = gz[g];
      if (z === 1) sqs[s] = x;
      else { const cs = COMBOS64[z].sq; for (let j = 0; j < z; j++) sqs[s + j] = cs[x * z + j]; }
    }
    const KK = this.pawns ? KK64 : KK8;
    sqs[0] = KK.w[local]; sqs[1] = KK.b[local];
    return stm;
  }
  /** No two pieces on one square, pawns not on the first or last rank. */
  valid(sqs) {
    const n = this.n;
    for (let a = 0; a < n; a++) {
      const s = sqs[a];
      if (this.typ[a] === P && (s < 8 || s > 55)) return false;
      for (let b = a + 1; b < n; b++) if (sqs[b] === s) return false;
    }
    return true;
  }
  /** Slice of an index (0 for pawnless tables). */
  sliceOfIndex(i) { return this.pawns ? Math.floor(i / (2 * this.local)) : 0; }
}

module.exports = { Layout, normalise, piecesOf, nameOf, K, Q, R, B, N, P, LETTER, ORDER, TYPE_OF, COMBOS64 };
