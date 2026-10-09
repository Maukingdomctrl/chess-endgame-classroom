// The egtb engine: exact distance-to-mate tables for up to five pieces by retrograde analysis (see
// README.md in this folder). The toolkit's solver.cjs hands it every material it does not build itself
// (five pieces, and pawns on both sides, where en passant matters).
//
// Values, as everywhere in the toolkit, for the side to move: v > 0 mates in v plies, v < 0 is mated in
// -v - 1 plies (-1: checkmated now), 0 draw. Stored in one byte as level + 1 (level = plies to mate, odd when
// the side to move mates), 0 for a draw; a deeper table throws instead of storing a wrong value.
//
// The solve, per domain (a pawnless table, or one pawn slice; slices most advanced first):
//   1. every position: checkmate / stalemate; moves that stay in the domain are counted (a piece move
//      without a capture); every other move (a capture, a pawn move, a promotion) leads into a table or slice
//      that is already solved, so its value is known now: a winning one schedules the win, a drawing one
//      means the position can never be lost, a losing one is remembered (the longest).
//   2. retrograde, level by level (level = plies to mate): from a position lost in L, every position that
//      can move into it wins in L + 1; from a position won in L, every position that can move into it has
//      one move fewer that does not lose; when none is left it is lost in 1 + its longest losing move.
// Mirror images: a position whose moves lead to symmetric positions (pawnless tables, everything on a
// diagonal) is counted with weights, so that each move is counted exactly as often as it is found backwards.
// En passant: a double step next to an enemy pawn leads to a position with the en passant capture, which is
// not stored; its value comes from its moves (a one-ply search over solved positions).
'use strict';
const { KING, KNIGHT, KADJ, KNJ, LINE, BLO, BHI, RAY, DIRIDX, PATT, RLO, RHI, KLO, KHI, NLO, NHI, PLO, PHI, UP, CHEB, SYM, DIAG, KK8, KK64, c2, c3, file, rank } = require('./geometry.cjs');
const { Layout, piecesOf, nameOf, K, Q, R, B, N, P, LETTER } = require('./layout.cjs');

const PROMOS = [Q, R, B, N];
const HOLD = 255; // counter value of a position that can never be lost
const MAX_STORED = 255; // level + 1 must fit in a byte
const DOUBLE = 1, EP = 2; // move flags
const antiDiag = (s) => (7 - file(s)) * 8 + (7 - rank(s)); // reflection in the a8-h1 diagonal
const ANTI_T = Int8Array.from({ length: 64 }, (_, s) => antiDiag(s));
// scratch boards: each entry point has its own range (a search nests one board per double step)
const FORWARD = 0, OPTIONS = 16, PROBE = 32, CHECK = 48;

/** Stored byte -> value (see the top of the file). */
const toValue = (s) => (s === 0 ? 0 : s & 1 ? -s : s - 1);
/** Value -> stored byte. */
const toStored = (v) => (v > 0 ? v + 1 : v < 0 ? -v : 0);

/** Is square q strictly between squares s and t (on a line)? */
const between = (s, t, q) => (q < 32 ? (BLO[s * 64 + t] >>> q) & 1 : (BHI[s * 64 + t] >>> (q - 32)) & 1) === 1;
/** The nearest occupied square on ray d from s (occupancy lo / hi), or -1. */
function blocker(d, s, lo, hi) {
  const i = d * 64 + s, ml = RLO[i] & lo, mh = RHI[i] & hi;
  if (UP[d]) { if (ml) return 31 - Math.clz32(ml & -ml); if (mh) return 63 - Math.clz32(mh & -mh); return -1; }
  if (mh) return 63 - Math.clz32(mh);
  if (ml) return 31 - Math.clz32(ml);
  return -1;
}
const RAYLEN = Uint8Array.from({ length: 512 }, (_, i) => RAY[i >> 6][i & 63].length);
const bit = (lo, hi, t) => (t < 32 ? (lo >>> t) & 1 : (hi >>> (t - 32)) & 1) === 1;

class List {
  constructor() { this.chunks = []; this.a = new Uint32Array(4096); this.n = 0; this.total = 0; }
  push(x) {
    if (this.n === this.a.length) { this.chunks.push(this.a); this.a = new Uint32Array(Math.min(this.a.length * 4, 1 << 22)); this.n = 0; }
    this.a[this.n++] = x; this.total++;
  }
  /** The stored values as arrays [typed array, length]. */
  parts() { return [...this.chunks.map((c) => [c, c.length]), [this.a, this.n]]; }
  /** All values in one typed array. */
  flat() { const out = new Uint32Array(this.total); let at = 0; for (const [a, len] of this.parts()) { out.set(a.subarray(0, len), at); at += len; } return out; }
}
/** Positions scheduled for later levels (a win through a capture, a loss once every move loses). */
class Schedule {
  constructor(name) { this.name = name; this.buckets = []; this.last = 0; }
  add(level, i) {
    if (level + 1 > MAX_STORED) throw new Error(`${this.name}: a mate deeper than ${MAX_STORED - 1} plies does not fit the one-byte values`);
    (this.buckets[level] ??= new List()).push(i);
    if (level >= this.last) this.last = level + 1;
  }
  /** Merges another schedule (a worker's: [[level, Uint32Array], ...]) into this one. */
  merge(levels) {
    for (const [level, arr] of levels) {
      if (!arr.length) continue;
      if (level + 1 > MAX_STORED) throw new Error(`${this.name}: a mate deeper than ${MAX_STORED - 1} plies does not fit the one-byte values`);
      const b = (this.buckets[level] ??= new List());
      b.chunks.push(b.a.subarray(0, b.n), arr); b.a = new Uint32Array(4096); b.n = 0; b.total += arr.length;
      if (level >= this.last) this.last = level + 1;
    }
  }
  /**
   * The positions resolved at `level`, sorted (for memory locality): those scheduled for it that are not
   * resolved yet (now stored), and `next` (already stored). null when there are none.
   */
  take(level, val, next) {
    const b = this.buckets[level];
    this.buckets[level] = null;
    const fresh = new List();
    if (b) for (const [a, len] of b.parts()) for (let y = 0; y < len; y++) { const i = a[y]; if (val[i] === 0) { val[i] = level + 1; fresh.push(i); } }
    const total = fresh.total + (next ? next.total : 0);
    if (!total) return null;
    const out = new Uint32Array(total);
    let at = 0;
    for (const L of next ? [fresh, next] : [fresh]) for (const [a, len] of L.parts()) { out.set(a.subarray(0, len), at); at += len; }
    return out.sort();
  }
}

/** A board to work on: squares, occupancy (piece on each square, -1 empty), occupied-square masks, move buffer. */
class Board {
  constructor(n) { this.sqs = new Int8Array(n); this.occ = new Int8Array(64).fill(-1); this.lo = 0; this.hi = 0; this.buf = new Int16Array(5 * 256); this.pinned = new Uint8Array(n); this.n = n; }
  /** Put the pieces of sqs on the board (pieces with square -1 are gone). */
  place() {
    let lo = 0, hi = 0;
    for (let k = 0; k < this.n; k++) { const s = this.sqs[k]; if (s < 0) continue; this.occ[s] = k; if (s < 32) lo |= 1 << s; else hi |= 1 << (s - 32); }
    this.lo = lo; this.hi = hi;
  }
  clear() { for (let k = 0; k < this.n; k++) { const s = this.sqs[k]; if (s >= 0) this.occ[s] = -1; } }
}

class EgtbTable {
  /**
   * name: material; goal 'mate' (default), 'promotion' (White's pawns against the lone king, plies to a
   * safe queen or rook promotion, as in solver.cjs) or 'conversion' (any material: plies until White
   * captures or promotes into a position that stays won, or mates; see convert()); resolve(name, goal): the
   * table for an exit.
   */
  constructor(name, goal, resolve) {
    const L = new Layout(name);
    this.layout = L;
    this.name = L.name;
    this.goal = goal;
    this.resolve = resolve;
    this.n = L.n; this.col = L.col; this.typ = L.typ; this.byColor = L.byColor;
    this.size = L.size;
    this.pawns = L.pawns;
    if (goal === 'promotion' && piecesOf(this.name).slice(2).some((p) => p.c !== 0 || p.t !== P)) throw new Error(`${this.name}: the promotion goal is for White's pawns against the lone king`);
    if (goal !== 'mate' && goal !== 'promotion' && goal !== 'conversion') throw new Error(`${this.name}: unknown goal "${goal}"`);
    // White's goals: White is never lost and Black never wins in these tables (a position is won for White
    // or it is not); a checkmated White is just "not a win"
    this.whiteGoal = goal !== 'mate';
    this.val = null;
    this.exits = new Map();
    this.boards = []; // scratch boards by recursion depth (en passant searches)
    this.stats = null;
  }
  board(depth) { return (this.boards[depth] ??= new Board(this.n)); }

  // ---------- board logic ----------
  /** Is square t attacked by side c on board bd? (piece skip ignored: it is being captured) */
  attacked(bd, t, c, skip) {
    const sqs = bd.sqs, lo = bd.lo, hi = bd.hi, list = this.byColor[c], typ = this.typ;
    for (let x = 0; x < list.length; x++) {
      const k = list[x];
      if (k === skip) continue;
      const s = sqs[k];
      if (s < 0) continue;
      const st = s * 64 + t;
      switch (typ[k]) {
        case K: if (KADJ[st]) return true; break;
        case N: if (KNJ[st]) return true; break;
        case P: if (PATT[c][st]) return true; break;
        case R: if (LINE[st] === 1 && (BLO[st] & lo) === 0 && (BHI[st] & hi) === 0) return true; break;
        case B: if (LINE[st] === 2 && (BLO[st] & lo) === 0 && (BHI[st] & hi) === 0) return true; break;
        case Q: if (LINE[st] !== 0 && (BLO[st] & lo) === 0 && (BHI[st] & hi) === 0) return true; break;
      }
    }
    return false;
  }
  /** After piece k moves to t (capturing piece cap, or -1; an en passant capture removes the pawn on capSq), is its own king safe? */
  safe(bd, stm, k, t, cap, capSq) {
    const sqs = bd.sqs, from = sqs[k], lo = bd.lo, hi = bd.hi;
    let l = lo, h = hi;
    if (from < 32) l &= ~(1 << from); else h &= ~(1 << (from - 32));
    if (t < 32) l |= 1 << t; else h |= 1 << (t - 32);
    if (capSq >= 0) { if (capSq < 32) l &= ~(1 << capSq); else h &= ~(1 << (capSq - 32)); }
    bd.lo = l; bd.hi = h; sqs[k] = t;
    let capFrom = -1;
    if (cap >= 0) { capFrom = sqs[cap]; sqs[cap] = -1; }
    const ok = !this.attacked(bd, sqs[stm], 1 - stm, cap);
    sqs[k] = from; bd.lo = lo; bd.hi = hi;
    if (cap >= 0) sqs[cap] = capFrom;
    return ok;
  }
  /**
   * Legal moves of the side to move on board bd (pieces placed), into bd.buf (5 numbers per move: piece, to,
   * promotion type or -1, captured piece or -1, flags DOUBLE / EP). ep: the en passant square, or -1.
   */
  gen(bd, stm, ep) {
    const sqs = bd.sqs, occ = bd.occ, buf = bd.buf, col = this.col, typ = this.typ;
    const ks = sqs[stm];
    const check = this.attacked(bd, ks, 1 - stm, -1);
    const own = this.byColor[stm], pinned = bd.pinned;
    if (!check) {
      // pinned: an own piece alone between the king and an enemy rook, bishop or queen on a line through both
      pinned.fill(0);
      const enemy = this.byColor[1 - stm];
      for (let x = 0; x < enemy.length; x++) {
        const e = enemy[x], ty = typ[e], s = sqs[e];
        if (s < 0 || ty === K || ty === N || ty === P) continue;
        const st = s * 64 + ks, line = LINE[st];
        if (!line || (ty === R && line !== 1) || (ty === B && line !== 2)) continue;
        const bl = BLO[st] & bd.lo, bh = BHI[st] & bd.hi;
        let q;
        if (bl && !bh && (bl & (bl - 1)) === 0) q = 31 - Math.clz32(bl);
        else if (bh && !bl && (bh & (bh - 1)) === 0) q = 63 - Math.clz32(bh);
        else continue;
        const o = occ[q];
        if (o >= 0 && col[o] === stm) pinned[o] = 1;
      }
    }
    let m = 0;
    for (let x = 0; x < own.length; x++) {
      const k = own[x], s = sqs[k], ty = typ[k];
      if (s < 0) continue;
      // out of check, a piece that is not pinned cannot expose its king
      const free = !check && ty !== K && pinned[k] === 0;
      if (ty === K || ty === N) {
        const ts = ty === K ? KING[s] : KNIGHT[s];
        for (let y = 0; y < ts.length; y++) {
          const t = ts[y], o = occ[t];
          if (o >= 0 && (col[o] === stm || typ[o] === K)) continue;
          if (!free && !this.safe(bd, stm, k, t, o, -1)) continue;
          buf[m] = k; buf[m + 1] = t; buf[m + 2] = -1; buf[m + 3] = o; buf[m + 4] = 0; m += 5;
        }
      } else if (ty === P) {
        const dir = stm === 0 ? 8 : -8, one = s + dir;
        const last = stm === 0 ? one >= 56 : one < 8;
        for (let c = -1; c <= 1; c++) {
          const f = file(s) + c;
          if (f < 0 || f > 7) continue;
          const t = one + c, o = occ[t];
          if (c === 0) {
            if (o >= 0) continue;
            if (free || this.safe(bd, stm, k, t, -1, -1)) {
              if (last) for (const pt of PROMOS) { buf[m] = k; buf[m + 1] = t; buf[m + 2] = pt; buf[m + 3] = -1; buf[m + 4] = 0; m += 5; }
              else { buf[m] = k; buf[m + 1] = t; buf[m + 2] = -1; buf[m + 3] = -1; buf[m + 4] = 0; m += 5; }
            }
            // the double step is judged on its own: in check, it may block where the single step cannot
            const two = t + dir;
            if (rank(s) === (stm === 0 ? 1 : 6) && occ[two] < 0 && (free || this.safe(bd, stm, k, two, -1, -1))) {
              buf[m] = k; buf[m + 1] = two; buf[m + 2] = -1; buf[m + 3] = -1; buf[m + 4] = DOUBLE; m += 5;
            }
          } else if (o >= 0) {
            if (col[o] === stm || typ[o] === K) continue;
            if (!free && !this.safe(bd, stm, k, t, o, -1)) continue;
            if (last) for (const pt of PROMOS) { buf[m] = k; buf[m + 1] = t; buf[m + 2] = pt; buf[m + 3] = o; buf[m + 4] = 0; m += 5; }
            else { buf[m] = k; buf[m + 1] = t; buf[m + 2] = -1; buf[m + 3] = o; buf[m + 4] = 0; m += 5; }
          } else if (t === ep) {
            const capSq = t - dir, cap = occ[capSq];
            // always checked in full: both pawns leave their squares (a discovered check along the rank)
            if (cap >= 0 && typ[cap] === P && col[cap] !== stm && this.safe(bd, stm, k, t, cap, capSq)) {
              buf[m] = k; buf[m + 1] = t; buf[m + 2] = -1; buf[m + 3] = cap; buf[m + 4] = EP; m += 5;
            }
          }
        }
      } else {
        const d0 = ty === B ? 4 : 0, d1 = ty === R ? 4 : 8;
        for (let d = d0; d < d1; d++) {
          const ray = RAY[d][s];
          for (let y = 0; y < ray.length; y++) {
            const t = ray[y], o = occ[t];
            if (o >= 0 && (col[o] === stm || typ[o] === K)) break;
            if (free || this.safe(bd, stm, k, t, o, -1)) { buf[m] = k; buf[m + 1] = t; buf[m + 2] = -1; buf[m + 3] = o; buf[m + 4] = 0; m += 5; }
            if (o >= 0) break;
          }
        }
      }
    }
    return m / 5;
  }

  /**
   * The forward step's view of one position (the side to move, pieces placed on bd): the moves that stay in
   * the domain are only counted (weighted by symmetry where needed), the others valued. Same rules as gen(),
   * without writing the quiet moves out. Sets this.eInside / eWin / eOpp / eHolds; returns the number of
   * legal moves.
   */
  evaluate(bd, stm, pawnless, kingsDiag) {
    const sqs = bd.sqs, occ = bd.occ, col = this.col, typ = this.typ, lo = bd.lo, hi = bd.hi;
    const ks = sqs[stm];
    // the squares the opponent attacks, with this king lifted (a line through its square goes on)
    this.attackMap(bd, 1 - stm, ks < 32 ? lo & ~(1 << ks) : lo, ks < 32 ? hi : hi & ~(1 << (ks - 32)));
    const aLo = this.amLo, aHi = this.amHi;
    const check = bit(aLo, aHi, ks);
    const own = this.byColor[stm], pinned = bd.pinned;
    if (!check) {
      pinned.fill(0);
      const enemy = this.byColor[1 - stm];
      for (let x = 0; x < enemy.length; x++) {
        const e = enemy[x], ty = typ[e], s = sqs[e];
        if (ty === K || ty === N || ty === P) continue;
        const st = s * 64 + ks, line = LINE[st];
        if (!line || (ty === R && line !== 1) || (ty === B && line !== 2)) continue;
        const bl = BLO[st] & lo, bh = BHI[st] & hi;
        let q;
        if (bl && !bh && (bl & (bl - 1)) === 0) q = 31 - Math.clz32(bl);
        else if (bh && !bl && (bh & (bh - 1)) === 0) q = 63 - Math.clz32(bh);
        else continue;
        const o = occ[q];
        if (o >= 0 && col[o] === stm) pinned[o] = 1;
      }
    }
    this.eInside = 0; this.eWin = 0; this.eOpp = -1; this.eHolds = false;
    let legal = 0;
    for (let x = 0; x < own.length; x++) {
      const k = own[x], s = sqs[k], ty = typ[k];
      const weigh = pawnless && (kingsDiag || k < 2);
      if (ty === K) {
        const ts = KING[s];
        for (let y = 0; y < ts.length; y++) {
          const t = ts[y], o = occ[t];
          if ((o >= 0 && (col[o] === stm || typ[o] === K)) || bit(aLo, aHi, t)) continue;
          legal++;
          if (o >= 0) this.acc(this.childValue(bd, stm, k, t, -1, o, 0, FORWARD));
          else if (weigh) { sqs[k] = t; this.eInside += this.symWeight(sqs); sqs[k] = s; }
          else this.eInside++;
        }
        continue;
      }
      const free = !check && pinned[k] === 0;
      if (ty === N) {
        const ts = KNIGHT[s];
        for (let y = 0; y < ts.length; y++) {
          const t = ts[y], o = occ[t];
          if (o >= 0 && (col[o] === stm || typ[o] === K)) continue;
          if (!free && !this.safe(bd, stm, k, t, o, -1)) continue;
          legal++;
          if (o >= 0) this.acc(this.childValue(bd, stm, k, t, -1, o, 0, FORWARD));
          else if (weigh) { sqs[k] = t; this.eInside += this.symWeight(sqs); sqs[k] = s; }
          else this.eInside++;
        }
      } else if (ty === P) {
        const dir = stm === 0 ? 8 : -8, one = s + dir;
        const last = stm === 0 ? one >= 56 : one < 8;
        for (let c = -1; c <= 1; c++) {
          const f = file(s) + c;
          if (f < 0 || f > 7) continue;
          const t = one + c, o = occ[t];
          if (c === 0) {
            if (o >= 0) continue;
            if (free || this.safe(bd, stm, k, t, -1, -1)) {
              if (last) for (let pt = Q; pt <= N; pt++) { legal++; this.acc(this.childValue(bd, stm, k, t, pt, -1, 0, FORWARD)); }
              else { legal++; this.acc(this.childValue(bd, stm, k, t, -1, -1, 0, FORWARD)); }
            }
            const two = t + dir;
            if (rank(s) === (stm === 0 ? 1 : 6) && occ[two] < 0 && (free || this.safe(bd, stm, k, two, -1, -1))) { legal++; this.acc(this.childValue(bd, stm, k, two, -1, -1, DOUBLE, FORWARD)); }
          } else if (o >= 0) {
            if (col[o] === stm || typ[o] === K) continue;
            if (!free && !this.safe(bd, stm, k, t, o, -1)) continue;
            if (last) for (let pt = Q; pt <= N; pt++) { legal++; this.acc(this.childValue(bd, stm, k, t, pt, o, 0, FORWARD)); }
            else { legal++; this.acc(this.childValue(bd, stm, k, t, -1, o, 0, FORWARD)); }
          }
          // no en passant here: stored positions have no en passant rights
        }
      } else {
        const d0 = ty === B ? 4 : 0, d1 = ty === R ? 4 : 8;
        if (free && !weigh) {
          // count the empty squares up to the nearest piece on each line; take it if it is an enemy
          for (let d = d0; d < d1; d++) {
            const b = blocker(d, s, lo, hi);
            if (b < 0) { const len = RAYLEN[d * 64 + s]; this.eInside += len; legal += len; continue; }
            const len = CHEB[s * 64 + b] - 1;
            this.eInside += len; legal += len;
            const o = occ[b];
            if (col[o] !== stm && typ[o] !== K) { legal++; this.acc(this.childValue(bd, stm, k, b, -1, o, 0, FORWARD)); }
          }
          continue;
        }
        for (let d = d0; d < d1; d++) {
          const ray = RAY[d][s];
          for (let y = 0; y < ray.length; y++) {
            const t = ray[y], o = occ[t];
            if (o >= 0 && (col[o] === stm || typ[o] === K)) break;
            if (free || this.safe(bd, stm, k, t, o, -1)) {
              legal++;
              if (o >= 0) this.acc(this.childValue(bd, stm, k, t, -1, o, 0, FORWARD));
              else if (weigh) { sqs[k] = t; this.eInside += this.symWeight(sqs); sqs[k] = s; }
              else this.eInside++;
            }
            if (o >= 0) break;
          }
        }
      }
    }
    this.eCheck = check;
    return legal;
  }
  /** The squares side c attacks with occupancy lo / hi, into this.amLo / this.amHi. */
  attackMap(bd, c, lo, hi) {
    const sqs = bd.sqs, typ = this.typ, list = this.byColor[c];
    let al = 0, ah = 0;
    for (let x = 0; x < list.length; x++) {
      const k = list[x], s = sqs[k], ty = typ[k];
      if (s < 0) continue;
      if (ty === K) { al |= KLO[s]; ah |= KHI[s]; continue; }
      if (ty === N) { al |= NLO[s]; ah |= NHI[s]; continue; }
      if (ty === P) { al |= PLO[c][s]; ah |= PHI[c][s]; continue; }
      const d0 = ty === B ? 4 : 0, d1 = ty === R ? 4 : 8;
      for (let d = d0; d < d1; d++) {
        const i = d * 64 + s, b = blocker(d, s, lo, hi);
        if (b < 0) { al |= RLO[i]; ah |= RHI[i]; } else { const j = d * 64 + b; al |= RLO[i] & ~RLO[j]; ah |= RHI[i] & ~RHI[j]; }
      }
    }
    this.amLo = al; this.amHi = ah;
  }
  /** Adds the value of a move that leaves the domain (for the side to move after it) to the evaluation. */
  acc(v) {
    if (v < 0) { if (!this.eWin || -v < this.eWin) this.eWin = -v; } // the opponent is mated in -v - 1: we mate in -v
    else if (v > 0) { if (v > this.eOpp) this.eOpp = v; }
    else this.eHolds = true;
  }

  // ---------- positions ----------
  /** Kings apart, no two pieces on one square, pawns on ranks 2-7, the side not to move not in check. */
  legal(sqs, stm) {
    const L = this.layout;
    if (!L.valid(sqs) || KADJ[sqs[0] * 64 + sqs[1]]) return false;
    const bd = this.board(CHECK);
    bd.sqs.set(sqs); bd.place();
    const ok = !this.attacked(bd, bd.sqs[1 - stm], stm, -1);
    bd.clear();
    return ok;
  }
  inCheck(sqs, stm) {
    const bd = this.board(CHECK);
    bd.sqs.set(sqs); bd.place();
    const r = this.attacked(bd, bd.sqs[stm], 1 - stm, -1);
    bd.clear();
    return r;
  }
  index(sqs, stm) { return this.layout.index(sqs, stm); }
  decode(i, sqs) { return this.layout.decode(i, sqs); }
  /** Value (see the top of the file) of a legal position without en passant rights; squares in table order. */
  value(sqs, stm) { return toValue(this.val[this.layout.index(sqs, stm)]); }
  /** Value stored at index i. */
  valueAt(i) { return toValue(this.val[i]); }
  /** Is index i a position this table stores (legal, and the stored image of itself)? Fills sqs. */
  stores(i, sqs) {
    const stm = this.layout.decode(i, sqs);
    return this.layout.valid(sqs) && !KADJ[sqs[0] * 64 + sqs[1]] && this.legal(sqs, stm) && this.layout.index(sqs, stm) === i;
  }

  // ---------- moves that leave the domain ----------
  /** The table and piece mapping of a capture / promotion (built on first use). */
  exit(k, promo, cap) {
    const key = (cap + 1) * 100 + k * 10 + (promo + 1);
    let ex = this.exits.get(key);
    if (!ex) {
      const kept = [];
      for (let p = 0; p < this.n; p++) if (p !== cap) kept.push({ p, c: this.col[p], t: p === k && promo >= 0 ? promo : this.typ[p] });
      const order = (x) => (x.t === K ? x.c : 2 + x.c * 10 + 'QRBNP'.indexOf(LETTER[x.t]));
      kept.sort((a, b) => order(a) - order(b) || a.p - b.p);
      const name = nameOf(kept);
      const ends = this.goal === 'promotion' && promo >= 0;
      const convert = this.goal === 'conversion' && this.col[k] === 0;
      ex = { name, ends, convert, table: ends ? null : this.resolve(name, convert ? 'mate' : this.goal), from: Int8Array.from(kept.map((x) => x.p)), sqs: new Int8Array(kept.length) };
      this.exits.set(key, ex);
    }
    return ex;
  }
  /**
   * Value of the position after a capture or a promotion, for the side to move after it.
   * Goal 'conversion': White's capture or promotion ends the game when the position after it is still won
   * for White (by the mate table of that material: as if Black were mated now, -1), else it is no win (0);
   * Black's capture or promotion leads into the conversion table of the material left.
   */
  exitValue(bd, stm, k, to, promo, cap) {
    const ex = this.exit(k, promo, cap);
    if (ex.ends) return this.promotionGoal(bd, k, to, promo);
    const sqs = bd.sqs, out = ex.sqs, from = ex.from;
    for (let i = 0; i < from.length; i++) out[i] = from[i] === k ? to : sqs[from[i]];
    const v = ex.table.value(out, 1 - stm);
    if (ex.convert) return v < 0 ? -1 : 0;
    return v;
  }
  /**
   * Goal 'promotion' (White's pawns against the lone king): a queen or a rook that the king cannot take at
   * once, without stalemate, ends the game (as if Black were mated now: -1). Against the lone king such a
   * position is always won, so no mate table is needed. A bishop or a knight is not the goal (0).
   */
  promotionGoal(bd, k, to, promo) {
    if (promo !== Q && promo !== R) return 0;
    // the position after the promotion on a scratch board (Black has only its king: a promotion is a push)
    const nb = this.board(CHECK);
    nb.sqs.set(bd.sqs); nb.sqs[k] = to;
    const typ0 = this.typ[k];
    this.typ[k] = promo;
    nb.place();
    const sqs = nb.sqs, bk = sqs[1];
    let reached = false;
    if (KADJ[bk * 64 + to] && !this.attacked(nb, to, 0, k)) reached = false; // the king takes the new piece
    else if (this.attacked(nb, bk, 0, -1)) reached = true; // check, or mate: not stalemate
    else {
      // stalemate unless the king has a square (taking an unprotected pawn there counts)
      const ks = KING[bk];
      for (let y = 0; y < ks.length && !reached; y++) {
        const t = ks[y], o = nb.occ[t];
        if (o >= 0 && this.typ[o] !== P) continue; // the new piece (defended, see above) or a king
        let l = nb.lo, h = nb.hi;
        const l0 = l, h0 = h;
        if (bk < 32) l &= ~(1 << bk); else h &= ~(1 << (bk - 32));
        if (t < 32) l |= 1 << t; else h |= 1 << (t - 32);
        nb.lo = l; nb.hi = h; sqs[1] = t;
        let cf = -1;
        if (o >= 0) { cf = sqs[o]; sqs[o] = -1; }
        if (!this.attacked(nb, t, 0, o)) reached = true;
        sqs[1] = bk; nb.lo = l0; nb.hi = h0;
        if (o >= 0) sqs[o] = cf;
      }
    }
    nb.clear();
    this.typ[k] = typ0;
    return reached ? -1 : 0;
  }

  /**
   * Value (for the side to move after the move) of the position after move (k, to, promo, cap, flags) on
   * board bd at recursion depth: another table, or this table's (solved) slice; a double step next to an
   * enemy pawn gives en passant rights, valued by a one-ply search.
   */
  childValue(bd, stm, k, to, promo, cap, flags, depth) {
    if (cap >= 0 || promo >= 0) return this.exitValue(bd, stm, k, to, promo, cap);
    const sqs = bd.sqs, from = sqs[k];
    sqs[k] = to;
    let v;
    if ((flags & DOUBLE) && this.epPossible(bd, stm, to)) {
      const nb = this.board(depth + 1);
      nb.sqs.set(sqs); nb.place();
      v = this.search(nb, 1 - stm, (from + to) >> 1, depth + 1);
      nb.clear();
    } else v = toValue(this.val[this.layout.index(sqs, 1 - stm)]);
    sqs[k] = from;
    return v;
  }
  /** After a double step to `to` by side stm: does an enemy pawn stand next to it? (bd.occ still has the pawn on its old square) */
  epPossible(bd, stm, to) {
    const f = file(to);
    for (const t of [to - 1, to + 1]) {
      if ((t === to - 1 && f === 0) || (t === to + 1 && f === 7)) continue;
      const o = bd.occ[t];
      if (o >= 0 && this.typ[o] === P && this.col[o] !== stm) return true;
    }
    return false;
  }
  /** Value of the position on board bd (pieces placed) for the side to move, from the values of its moves. */
  search(bd, stm, ep, depth) {
    const m = this.gen(bd, stm, ep);
    if (!m) return this.attacked(bd, bd.sqs[stm], 1 - stm, -1) && !(this.whiteGoal && stm === 0) ? -1 : 0;
    const buf = bd.buf; // childValue never writes this board's buffer (it searches on the next board)
    let win = 0, oppMax = -1, draw = false;
    for (let x = 0; x < m * 5; x += 5) {
      const v = this.childValue(bd, stm, buf[x], buf[x + 1], buf[x + 2], buf[x + 3], buf[x + 4], depth);
      if (v < 0) { if (!win || -v < win) win = -v; } else if (v > 0) { if (v > oppMax) oppMax = v; } else draw = true;
    }
    return win ? win : draw ? 0 : -oppMax - 2;
  }

  // ---------- the solve ----------
  // A domain is a pawnless table or one pawn slice: { lo, hi (index range), slice (-1 pawnless), cnt, exm }.
  // cnt[i - lo]: moves inside the domain not yet known to lose (HOLD: the position can never be lost);
  // exm[i - lo]: 1 + the longest win the opponent gets by a move that leaves the domain (0: none).
  // forward() and retro() are also run by worker threads on parts of a domain (parallel.cjs).

  /** The domains of the table, in the order they are solved. */
  domains() {
    if (this._domains) return this._domains;
    const L = this.layout, per = 2 * L.local, out = [];
    if (!this.pawns) out.push({ lo: 0, hi: this.size, slice: -1, adv: 0 });
    else for (let s = 0; s < L.slices; s++) out.push({ lo: s * per, hi: (s + 1) * per, slice: s, adv: L.sliceAdv[s] });
    return (this._domains = out);
  }
  /** Builds (resolves) every table a capture or a promotion can lead to, before the solve starts. */
  prepareExits() {
    for (let k = 0; k < this.n; k++) {
      const promos = this.typ[k] === P ? [-1, ...PROMOS] : [-1];
      for (const cap of [-1, ...this.byColor[1 - this.col[k]].filter((c) => this.typ[c] !== K)]) {
        for (const promo of promos) if (cap >= 0 || promo >= 0) this.exit(k, promo, cap);
      }
    }
  }
  solve() {
    this.prepareExits();
    const t0 = Date.now();
    this.val ??= new Uint8Array(this.size);
    this.stats = { positions: 0, domains: 0, maxLevel: 0, ms: 0, forwardMs: 0, retroMs: 0, unmoves: 0 };
    for (const d of this.domains()) this.solveDomain(d);
    this.stats.ms = Date.now() - t0;
    return this;
  }
  /** Solves one domain on this thread. */
  solveDomain(d0) {
    const d = { ...d0 }, size = d.hi - d.lo;
    d.cnt = new Uint8Array(size); d.exm = new Uint8Array(size);
    const sched = new Schedule(this.name);
    const tf = Date.now();
    const f = this.forward(d, 0, this.layout.local, sched);
    const tr = Date.now();
    let next = null, maxLevel = 0;
    for (let lev = 0; ; lev++) {
      const cur = sched.take(lev, this.val, next);
      if (!cur) { if (lev >= sched.last) break; next = null; continue; }
      maxLevel = lev;
      next = new List();
      this.retro(d, cur, cur.length, lev, next, sched, false);
    }
    const st = this.stats;
    st.positions += f.positions; st.unmoves += this.unmoves; this.unmoves = 0;
    st.forwardMs += tr - tf; st.retroMs += Date.now() - tr; st.domains++;
    if (maxLevel > st.maxLevel) st.maxLevel = maxLevel;
  }

  /** Symmetry weight of a position (pawnless): 2 if a reflection in a diagonal maps it onto itself, else 1. */
  symWeight(sqs) {
    const wk = sqs[0], bk = sqs[1];
    let T;
    if (file(wk) === rank(wk) && file(bk) === rank(bk)) T = SYM[DIAG];
    else if (file(wk) + rank(wk) === 7 && file(bk) + rank(bk) === 7) T = ANTI_T;
    else return 1;
    const gs = this.layout.gStart, gz = this.layout.gSize;
    for (let g = 0; g < gs.length; g++) {
      const s = gs[g], z = gz[g];
      if (z === 1) { if (T[sqs[s]] !== sqs[s]) return 1; }
      else if (z === 2) { const a = sqs[s], b = sqs[s + 1]; if (!((T[a] === a && T[b] === b) || (T[a] === b && T[b] === a))) return 1; }
      else {
        const a = [sqs[s], sqs[s + 1], sqs[s + 2]].sort((x, y) => x - y), b = a.map((q) => T[q]).sort((x, y) => x - y);
        if (a[0] !== b[0] || a[1] !== b[1] || a[2] !== b[2]) return 1;
      }
    }
    return 2;
  }

  /**
   * Step 1 for the local indices [from, to) of domain d: checkmates, stalemates, the moves that stay in the
   * domain (counted), the moves that leave it (valued). Writes d.cnt / d.exm, schedules wins and losses.
   */
  forward(d, from, to, sched) {
    const L = this.layout, typ = this.typ, n = this.n, cnt = d.cnt, exm = d.exm;
    const bd = this.board(FORWARD), sqs = bd.sqs, occ = bd.occ;
    const pawnless = !this.pawns;
    const G = L.gStart.length, radix = L.digitRadix;
    const base = pawnless ? 0 : d.slice * L.local;
    if (!pawnless) { const np = L.pawnCount; for (let j = 0; j < np; j++) sqs[L.pawnIdx[j]] = L.sliceSq[d.slice * np + j]; }
    // the digits of `from` (an odometer from here on: no divisions)
    const dig = new Float64Array(G + 1);
    let r = from;
    for (let g = G; g >= 1; g--) { dig[g] = r % radix[g]; r = (r - dig[g]) / radix[g]; }
    dig[0] = r;
    for (let g = 0; g <= G; g++) L.setDigit(sqs, g, dig[g]);
    let positions = 0;
    for (let local = from; local < to; local++) {
      // put the pieces on the board; two on one square: not a position
      let placed = 0, ok = true;
      for (; placed < n; placed++) { const s = sqs[placed]; if (occ[s] >= 0 || (typ[placed] === P && (s < 8 || s > 55))) { ok = false; break; } occ[s] = placed; }
      if (ok) {
        let lo = 0, hi = 0;
        for (let k = 0; k < n; k++) { const s = sqs[k]; if (s < 32) lo |= 1 << s; else hi |= 1 << (s - 32); }
        bd.lo = lo; bd.hi = hi;
        const wk = sqs[0], bk = sqs[1];
        const bothOnDiag = file(wk) === rank(wk) && file(bk) === rank(bk);
        const kingsDiag = pawnless && (bothOnDiag || (file(wk) + rank(wk) === 7 && file(bk) + rank(bk) === 7));
        for (let stm = 0; stm < 2; stm++) {
          const i = (base + local) * 2 + stm;
          if (pawnless && bothOnDiag && L.index(sqs, stm) !== i) continue; // stored under the other image
          if (this.attacked(bd, sqs[1 - stm], stm, -1)) continue; // the side not to move in check
          positions++;
          const j = i - d.lo;
          const m = this.evaluate(bd, stm, pawnless, kingsDiag);
          if (!m) {
            if (this.eCheck && !(this.whiteGoal && stm === 0)) sched.add(0, i); // checkmate
            else cnt[j] = HOLD; // stalemate (or White mated: no win for White)
            continue;
          }
          const self = kingsDiag ? this.symWeight(sqs) : 1;
          let inside = this.eInside;
          const win = this.eWin, oppMax = this.eOpp, holds = this.eHolds;
          if (inside % self) throw new Error(`${this.name}: symmetry weights`);
          inside /= self;
          if (inside >= HOLD) throw new Error(`${this.name}: too many moves for the counters`);
          if (oppMax + 2 > MAX_STORED) throw new Error(`${this.name}: a mate deeper than ${MAX_STORED - 1} plies does not fit the one-byte values`);
          cnt[j] = win || holds ? HOLD : inside;
          exm[j] = oppMax >= 0 ? oppMax + 1 : 0;
          if (win) sched.add(win, i);
          else if (!inside && !holds) sched.add(oppMax + 1, i); // every move leaves the domain and loses
        }
      }
      for (let k = 0; k < placed; k++) occ[sqs[k]] = -1;
      // next local index
      for (let g = G; g >= 0; g--) {
        if (++dig[g] < radix[g]) { L.setDigit(sqs, g, dig[g]); break; }
        dig[g] = 0; L.setDigit(sqs, g, 0);
      }
    }
    return { positions };
  }

  /**
   * Step 2 for the positions list[0..len) of domain d, all resolved at level lev: from a lost one (lev even)
   * every predecessor wins in lev + 1 (pushed to next); from a won one, every predecessor has one losing
   * move more (scheduled as lost when none is left). atomic: other threads work on the same domain.
   */
  retro(d, list, len, lev, next, sched, atomic) {
    const L = this.layout, val = this.val, typ = this.typ, col = this.col, cnt = d.cnt, exm = d.exm;
    const bd = this.board(FORWARD), sqs = bd.sqs, occ = bd.occ;
    const pawnless = !this.pawns, lost = lev % 2 === 0, win = lev + 2, dlo = d.lo;
    if (lost && win > MAX_STORED) throw new Error(`${this.name}: a mate deeper than ${MAX_STORED - 1} plies does not fit the one-byte values`);
    const base = pawnless ? 0 : d.slice * L.local;
    const KK = pawnless ? KK8 : KK64, mul = L.mul, groupOf = L.groupOf, gStart = L.gStart, gSize = L.gSize;
    const dig = this.digBuf ??= new Float64Array(L.mul.length);
    let unmoves = 0;
    for (let y = 0; y < len; y++) {
      const c = list[y];
      const stm = L.decodeDigits(c, sqs, dig);
      const X = 1 - stm; // the side that moved into c
      const local = (c - stm) / 2 - base;
      bd.place();
      const Yk = sqs[stm], lo0 = bd.lo, hi0 = bd.hi;
      // the X pieces giving check now (at most two)
      let ck1 = -1, ck2 = -1;
      const own = this.byColor[X];
      for (let xx = 0; xx < own.length; xx++) {
        const e = own[xx], es = sqs[e], te = typ[e], st = es * 64 + Yk;
        let hit;
        if (te === N) hit = KNJ[st]; else if (te === P) hit = PATT[X][st]; else if (te === K) hit = 0;
        else hit = LINE[st] && (te === Q || (te === R) === (LINE[st] === 1)) && (BLO[st] & lo0) === 0 && (BHI[st] & hi0) === 0;
        if (hit) { if (ck1 < 0) ck1 = e; else ck2 = e; }
      }
      const wkOff = file(sqs[0]) !== rank(sqs[0]), bkBelow = rank(sqs[1]) < file(sqs[1]);
      for (let xx = 0; xx < own.length; xx++) {
        const k = own[xx], ty = typ[k];
        if (ty === P) continue; // a pawn move comes from another slice
        // a checker other than k must be blocked by k's square of origin f: only one can be, and only a line
        const other1 = ck1 >= 0 && ck1 !== k ? ck1 : ck2 >= 0 && ck2 !== k ? ck2 : -1;
        if (other1 >= 0 && ck2 >= 0 && ck1 !== k && ck2 !== k) continue; // double check by two other pieces
        const blockSq = other1 >= 0 ? sqs[other1] : -1;
        if (blockSq >= 0 && (typ[other1] === N || typ[other1] === P)) continue; // a knight or pawn check cannot be blocked
        const t = sqs[k];
        const lt = t < 32 ? lo0 & ~(1 << t) : lo0, ht = t < 32 ? hi0 : hi0 & ~(1 << (t - 32));
        // a line from an X slider to Y's king that only this piece blocks
        let disc = -1;
        {
          const dd = DIRIDX[Yk * 64 + t];
          if (dd >= 0) {
            const ray = RAY[dd][Yk];
            let yy = 0;
            while (ray[yy] !== t) { if (occ[ray[yy]] >= 0) break; yy++; }
            if (ray[yy] === t) {
              for (yy++; yy < ray.length; yy++) {
                const o = occ[ray[yy]];
                if (o < 0) continue;
                const to = typ[o];
                if (col[o] === X && (to === Q || (to === R && dd < 4) || (to === B && dd >= 4))) disc = ray[yy];
                break;
              }
            }
          }
        }
        const g = groupOf[k], z = g >= 0 ? gSize[g] : 0, gs = g >= 0 ? gStart[g] : 0;
        const ts = ty === K ? KING[t] : ty === N ? KNIGHT[t] : null;
        const nd = ts ? 1 : ty === Q ? 8 : 4, d0 = ty === B ? 4 : 0;
        for (let di = 0; di < nd; di++) {
          const ray = ts ?? RAY[d0 + di][t];
          for (let yy = 0; yy < ray.length; yy++) {
            const f = ray[yy];
            if (occ[f] >= 0) { if (ts) continue; break; }
            if (k < 2 && KADJ[f * 64 + sqs[1 - k]]) continue; // kings apart
            unmoves++;
            // the predecessor (piece k on f, X to move) is legal when Y's king is not attacked there: no
            // other checker left unblocked, no line opened through t, no check by the piece itself from f
            if (blockSq >= 0 && !between(Yk, blockSq, f)) continue;
            if (disc >= 0 && !between(Yk, disc, f)) continue;
            const fy = f * 64 + Yk;
            if (ty === N ? KNJ[fy] : ty !== K && LINE[fy] && (ty === Q || (ty === R) === (LINE[fy] === 1)) && (BLO[fy] & lt) === 0 && (BHI[fy] & ht) === 0) continue;
            // its index: the child's digits with one changed (no new mirror image needed), else in full
            let pi;
            if (pawnless && !(k !== 0 && (wkOff || (k === 1 ? rank(f) < file(f) : bkBelow)))) {
              sqs[k] = f; pi = L.index(sqs, X); sqs[k] = t;
            } else {
              let delta;
              if (k < 2) delta = (KK.id[(k === 0 ? f : sqs[0]) * 64 + (k === 1 ? f : sqs[1])] - dig[0]) * mul[0];
              else if (z === 1) delta = (f - t) * mul[g + 1];
              else if (z === 2) delta = (c2(f, sqs[gs + (k === gs ? 1 : 0)]) - dig[g + 1]) * mul[g + 1];
              else { const o1 = k === gs ? gs + 1 : gs, o2 = k === gs + 2 ? gs + 1 : gs + 2; delta = (c3(f, sqs[o1], sqs[o2]) - dig[g + 1]) * mul[g + 1]; }
              pi = (base + local + delta) * 2 + X;
            }
            if (val[pi] !== 0) continue;
            if (lost) { // a move into a lost position: the predecessor wins in lev + 1
              if (!atomic) { val[pi] = win; next.push(pi); }
              else if (Atomics.compareExchange(val, pi, 0, win) === 0) next.push(pi);
            } else {
              const jj = pi - dlo, cj = cnt[jj];
              if (cj === HOLD) continue;
              const old = atomic ? Atomics.sub(cnt, jj, 1) : (cnt[jj] = cj - 1, cj);
              if (old === 1) sched.add(Math.max(lev + 1, exm[jj]), pi); // every move loses
              else if (old === 0) throw new Error(`${this.name}: move counter below zero at index ${pi}`);
            }
          }
        }
      }
      bd.clear();
    }
    this.unmoves = (this.unmoves ?? 0) + unmoves;
  }

  // ---------- for course tools ----------
  /**
   * Every legal move of a position with what it leads to: [{ piece, from, to, promo, capture, ep, v }], promo
   * '' or 'q'/'r'/'b'/'n'; v is the value the move gives the mover (v > 0 mates in v plies, v < 0 is mated in
   * -v - 1 plies, 0 draw). ep: the en passant square of the position, or -1.
   */
  options(sqs, stm, ep = -1) {
    const bd = this.board(OPTIONS);
    bd.sqs.set(sqs); bd.place();
    const m = this.gen(bd, stm, ep);
    const buf = bd.buf.slice(0, m * 5), out = [];
    for (let x = 0; x < m * 5; x += 5) {
      const k = buf[x], to = buf[x + 1], promo = buf[x + 2], cap = buf[x + 3], flags = buf[x + 4];
      const c = this.childValue(bd, stm, k, to, promo, cap, flags, OPTIONS);
      out.push({ piece: k, from: bd.sqs[k], to, promo: promo >= 0 ? LETTER[promo].toLowerCase() : '', capture: cap >= 0, ep: !!(flags & EP), v: c < 0 ? -c : c > 0 ? -c - 2 : 0 });
    }
    bd.clear();
    return out;
  }
  /** Legal moves into buf (4 numbers per move: piece, to, promotion type or -1, captured piece or -1), like solver.cjs. */
  moves(sqs, stm, buf, ep = -1) {
    const bd = this.board(OPTIONS);
    bd.sqs.set(sqs); bd.place();
    const m = this.gen(bd, stm, ep);
    for (let x = 0; x < m; x++) for (let j = 0; j < 4; j++) buf[x * 4 + j] = bd.buf[x * 5 + j];
    bd.clear();
    return m;
  }
  /** Value of a position with en passant rights (ep: the square the pawn passed, or -1 for none). */
  valueEp(sqs, stm, ep) {
    if (ep < 0) return this.value(sqs, stm);
    const bd = this.board(PROBE);
    bd.sqs.set(sqs); bd.place();
    const v = this.search(bd, stm, ep, PROBE);
    bd.clear();
    return v;
  }
}
module.exports = { EgtbTable, toValue, toStored, Board, List, Schedule, HOLD, DOUBLE, EP };
