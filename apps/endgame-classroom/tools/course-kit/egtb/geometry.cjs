// Geometry tables for the egtb engine: move targets, rays, lines and the squares between two squares,
// pawn attacks, the board's symmetries, the king-pair tables the indexes are built on, and combinations
// (identical pieces stored once, in square order). A square is 0..63 = rank * 8 + file (a1 = 0, h8 = 63).
'use strict';

const file = (s) => s & 7, rank = (s) => s >> 3;
const onBoard = (f, r) => f >= 0 && f < 8 && r >= 0 && r < 8;

// ---------- moves and lines ----------
const KING = [], KNIGHT = [];
const KADJ = new Uint8Array(4096), KNJ = new Uint8Array(4096);
const LINE = new Uint8Array(4096); // 1: same rank or file, 2: same diagonal
const BLO = new Int32Array(4096), BHI = new Int32Array(4096); // squares strictly between, as two 32-bit masks
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]; // 0-3 rook, 4-7 bishop
const RAY = DIRS.map(() => []); // RAY[d][s]: squares from s in direction d, nearest first
const DIRIDX = new Int8Array(4096).fill(-1); // DIRIDX[s * 64 + t]: the direction d with t on RAY[d][s], or -1
const PATT = [new Uint8Array(4096), new Uint8Array(4096)]; // PATT[c][s * 64 + t]: a pawn of colour c on s attacks t
for (let s = 0; s < 64; s++) {
  const k = [], n = [];
  for (let df = -2; df <= 2; df++) for (let dr = -2; dr <= 2; dr++) {
    const f = file(s) + df, r = rank(s) + dr;
    if (!onBoard(f, r)) continue;
    const t = r * 8 + f;
    if (Math.max(Math.abs(df), Math.abs(dr)) === 1) { k.push(t); KADJ[s * 64 + t] = 1; }
    if (Math.abs(df * dr) === 2) { n.push(t); KNJ[s * 64 + t] = 1; }
  }
  KING.push(Int8Array.from(k));
  KNIGHT.push(Int8Array.from(n));
  DIRS.forEach(([df, dr], d) => {
    const ray = [];
    let f = file(s) + df, r = rank(s) + dr, lo = 0, hi = 0;
    while (onBoard(f, r)) {
      const t = r * 8 + f;
      ray.push(t);
      LINE[s * 64 + t] = d < 4 ? 1 : 2;
      DIRIDX[s * 64 + t] = d;
      BLO[s * 64 + t] = lo; BHI[s * 64 + t] = hi;
      if (t < 32) lo |= 1 << t; else hi |= 1 << (t - 32);
      f += df; r += dr;
    }
    RAY[d][s] = Int8Array.from(ray);
  });
  for (const [c, dr] of [[0, 1], [1, -1]]) for (const df of [-1, 1]) {
    const f = file(s) + df, r = rank(s) + dr;
    if (onBoard(f, r)) PATT[c][s * 64 + r * 8 + f] = 1;
  }
}

// ray masks: RLO/RHI[d * 64 + s] = the squares of RAY[d][s] as two 32-bit masks; directions 0 (+1), 2 (+8),
// 4 (+9), 6 (+7) go up the square numbers (the nearest blocker is the lowest bit), 1, 3, 5, 7 down
const RLO = new Int32Array(512), RHI = new Int32Array(512);
const KLO = new Int32Array(64), KHI = new Int32Array(64), NLO = new Int32Array(64), NHI = new Int32Array(64);
const PLO = [new Int32Array(64), new Int32Array(64)], PHI = [new Int32Array(64), new Int32Array(64)];
const setBit = (lo, hi, i, t) => { if (t < 32) lo[i] |= 1 << t; else hi[i] |= 1 << (t - 32); };
for (let s = 0; s < 64; s++) {
  for (let d = 0; d < 8; d++) for (const t of RAY[d][s]) setBit(RLO, RHI, d * 64 + s, t);
  for (const t of KING[s]) setBit(KLO, KHI, s, t);
  for (const t of KNIGHT[s]) setBit(NLO, NHI, s, t);
  for (let t = 0; t < 64; t++) for (const c of [0, 1]) if (PATT[c][s * 64 + t]) setBit(PLO[c], PHI[c], s, t);
}
const UP = Uint8Array.from(DIRS, ([df, dr]) => (dr * 8 + df > 0 ? 1 : 0));
const CHEB = new Uint8Array(4096); // king distance
for (let s = 0; s < 64; s++) for (let t = 0; t < 64; t++) CHEB[s * 64 + t] = Math.max(Math.abs(file(s) - file(t)), Math.abs(rank(s) - rank(t)));

// ---------- symmetry ----------
// The 8 symmetries of the board; SYM[0] is the identity, SYM[MIRROR] swaps the a- and h-files (the only
// one that keeps pawns legal), SYM[DIAG] reflects in the a1-h8 diagonal.
const SYM = [];
for (const tr of [0, 1]) for (const fx of [0, 1]) for (const fy of [0, 1])
  SYM.push(Int8Array.from({ length: 64 }, (_, s) => { let f = file(s), r = rank(s); if (tr) [f, r] = [r, f]; if (fx) f = 7 - f; if (fy) r = 7 - r; return r * 8 + f; }));
const MIRROR = 2; // tr 0, fx 1, fy 0
const DIAG = 4; // tr 1, fx 0, fy 0
if (SYM[MIRROR][0] !== 7 || SYM[MIRROR][8] !== 15 || SYM[DIAG][1] !== 8 || SYM[DIAG][10] !== 17) throw new Error('egtb: symmetry table');
/** The squares of the a1-d1-d4 triangle (the white king's squares in a pawnless table). */
const inTriangle = (s) => file(s) <= 3 && rank(s) <= file(s);
/** For each square: the symmetries that bring it into the triangle (two for a1, b2, c3, d4). */
const CANDS8 = Array.from({ length: 64 }, (_, s) => Int8Array.from([0, 1, 2, 3, 4, 5, 6, 7].filter((y) => inTriangle(SYM[y][s]))));

// ---------- king pairs ----------
// KK8: the white king in the triangle, the black king anywhere legal; when the white king is on the a1-d4
// diagonal, the black king on or below the a1-h8 diagonal (the reflection in it gives the other half).
// 462 pairs. KK64: every legal pair (3612), for tables with pawns.
function pairs(accept) {
  const id = new Int16Array(4096).fill(-1), w = [], b = [];
  for (let wk = 0; wk < 64; wk++) for (let bk = 0; bk < 64; bk++) {
    if (wk === bk || KADJ[wk * 64 + bk] || !accept(wk, bk)) continue;
    id[wk * 64 + bk] = w.length; w.push(wk); b.push(bk);
  }
  return { id, w: Int8Array.from(w), b: Int8Array.from(b), count: w.length };
}
const KK8 = pairs((wk, bk) => inTriangle(wk) && (file(wk) !== rank(wk) || rank(bk) <= file(bk)));
const KK64 = pairs(() => true);
if (KK8.count !== 462 || KK64.count !== 3612) throw new Error('egtb: king pair tables');

// ---------- combinations ----------
// Identical pieces are stored once: k squares a < b < c from 0..n-1 get the index C(a,1) + C(b,2) + C(c,3)
// (the combinatorial number system), so the index of a sorted list does not depend on n.
const binom = (n, k) => { let r = 1; for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1); return Math.round(r); };
class Combos {
  constructor(n, k) {
    this.n = n; this.k = k; this.count = binom(n, k);
    this.sq = new Int8Array(this.count * k); // the sorted squares of each index
    const cur = [];
    const rec = (lo, depth) => {
      if (depth === k) { const i = this.index(cur); for (let j = 0; j < k; j++) this.sq[i * k + j] = cur[j]; return; }
      for (let s = lo; s < n; s++) { cur[depth] = s; rec(s + 1, depth + 1); }
    };
    rec(0, 0);
  }
  /** Index of k distinct squares given in increasing order. */
  index(s) { let i = 0; for (let j = 0; j < this.k; j++) i += binom(s[j], j + 1); return i; }
}
// fast versions for 2 and 3 squares (any order)
const c2 = (a, b) => (a < b ? (b * (b - 1)) / 2 + a : (a * (a - 1)) / 2 + b);
function c3(a, b, c) {
  let t;
  if (a > b) { t = a; a = b; b = t; }
  if (b > c) { t = b; b = c; c = t; }
  if (a > b) { t = a; a = b; b = t; }
  return (c * (c - 1) * (c - 2)) / 6 + (b * (b - 1)) / 2 + a;
}

module.exports = {
  file, rank, KING, KNIGHT, KADJ, KNJ, LINE, BLO, BHI, DIRS, RAY, DIRIDX, PATT, RLO, RHI, KLO, KHI, NLO, NHI, PLO, PHI, UP, CHEB,
  SYM, MIRROR, DIAG, inTriangle, CANDS8, KK8, KK64, Combos, binom, c2, c3,
};
