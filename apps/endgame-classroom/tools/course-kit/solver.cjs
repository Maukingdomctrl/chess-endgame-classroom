// Exact endgame solver for any material with up to 5 pieces (the two kings and up to three more, either
// colour, pawns included), by retrograde analysis. Builds a table of distance to mate (DTM) for every
// position; a capture or a promotion leads into another table (fewer pieces, or the promoted piece),
// which is built on first use. Not covered: castling and the fifty-move rule.
//
// This file builds the tables with up to 4 pieces and pawns on one side at most, exactly as it always has
// (the courses depend on these tables and their order). Every other material (five pieces, and pawns on
// both sides, where en passant matters) is built by the egtb engine (egtb/, see its README), which has the
// same API; table(), probe() and probePromotion() choose the engine by the material. Such a mate table is
// built once for a material and its colour-swapped twin: table('KRKRP') is a view of table('KRPKR')
// (egtb/flip.cjs), so defending and attacking lessons share it.
//
//   const { probe, table } = require('./solver.cjs');
//   probe('8/8/8/8/8/2k5/8/K2R1R2 w - - 0 1')  // { result: 'win', dtm: 7 }  dtm = plies to mate
//   probe('8/8/8/8/1k6/8/1KRP4/7r w - - 0 1')  // { result: 'draw', dtm: -1 }  five pieces: the egtb engine
//   probePromotion('8/8/8/4k3/8/8/3PP3/4K3 w - - 0 1')  // { result: 'win', dtc: 27 }  plies to a safe promotion
//   probeConversion('1K1k4/1P6/8/8/8/8/r7/5R2 w - - 0 1')  // { result: 'win', dtc: 15 }  plies to a capture or
//                                                          // promotion that keeps the win
//
// Goal 'conversion' (any material, egtb engine; table(name, { goal: 'conversion' })): plies until White makes a
// capture or a promotion after which the position is still won for White (by the mate table of the material
// left), or mates. Black's captures and promotions do not end the count: it goes on in the material left.
// White is never lost and Black never wins in these tables: a position is won for White or it is not.
// For lines that end when the stronger side converts (Lucena: the safe promotion, a skewer: the rook won).
//
// Goal 'promotion' (table(name, { goal: 'promotion' }), for White's pawns against the lone king): the
// values count plies to a safe promotion instead of mate. A promotion ends the game when it makes a queen
// or a rook that cannot be taken at once and the new position is still won for White (by the mate table
// of that material), as in ../kpk-course/kpk.cjs; a capture leads into the promotion table of the
// material left. Checkmate before any promotion also counts as reaching the goal. A bishop or a knight
// does not count, even where it would still win (with two pawns that happens): the lessons promise a
// queen (a rook where the queen would stalemate), and the checker (pawn/oracle.cjs) measures the same.
//
// Material names: White's pieces then Black's, each starting with the king, other pieces in the order
// Q R B N P: 'KQK', 'KRRK', 'KQKR', 'KRKP' (Black has the pawn), 'KPK'.
//
// Stored value for the side to move: 0 = draw, v > 0 = wins, mate in v plies (odd), v < 0 = loses,
// mated in -v - 1 plies (even; -1 = checkmated now).
//
// Each position is stored once for all its mirror images (8 without pawns, 2 with pawns): the white
// king is moved into a1-d1-d4 (without pawns) or onto files a-d, and the smallest of those images is
// the one kept. Two identical pieces are kept in square order.
//
// KIT_CACHE (optional, see cache.cjs) keeps solved tables on disk between runs, for generators that are
// run again and again while a course is being written. A table is reused only while this file and
// board.cjs are unchanged.
const cache = require('./cache.cjs');
const { kingAdj, knightAdj, SYM8 } = require('./board.cjs');

const ORDER = 'QRBNP';
const K = 0, Q = 1, R = 2, B = 3, N = 4, P = 5;
const TYPE_OF = { K, Q, R, B, N, P };
const LETTER = 'KQRBNP';
const PROMOS = [Q, R, B, N];

// ---------- geometry tables ----------
const file = (s) => s & 7, rank = (s) => s >> 3;
const KADJ = new Uint8Array(4096), KNJ = new Uint8Array(4096), LINE = new Uint8Array(4096);
const BLO = new Uint32Array(4096), BHI = new Uint32Array(4096); // squares strictly between two squares
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]; // 0-3 rook, 4-7 bishop
const RAYS = DIRS.map(() => []);
const KT = kingAdj.map((a) => Int8Array.from(a)), NT = knightAdj.map((a) => Int8Array.from(a));
for (let s = 0; s < 64; s++) {
  for (const t of kingAdj[s]) KADJ[s * 64 + t] = 1;
  for (const t of knightAdj[s]) KNJ[s * 64 + t] = 1;
  DIRS.forEach(([df, dr], d) => {
    const ray = [];
    let f = file(s) + df, r = rank(s) + dr, lo = 0, hi = 0;
    while (f >= 0 && f < 8 && r >= 0 && r < 8) {
      const t = r * 8 + f;
      ray.push(t);
      LINE[s * 64 + t] = d < 4 ? 1 : 2;
      BLO[s * 64 + t] = lo; BHI[s * 64 + t] = hi;
      if (t < 32) lo |= 1 << t; else hi |= 1 << (t - 32);
      f += df; r += dr;
    }
    RAYS[d][s] = Int8Array.from(ray);
  });
}
const between = (s, t, q) => (q < 32 ? (BLO[s * 64 + t] >>> q) & 1 : (BHI[s * 64 + t] >>> (q - 32)) & 1);

// ---------- symmetry ----------
const SYMT = SYM8.map((f) => Int8Array.from({ length: 64 }, (_, s) => f(s))); // SYMT[0] is the identity
const MIRROR = 4; // SYM8[4] mirrors the files (a <-> h), the only symmetry that keeps pawns legal
function symmetry(pawns) {
  const inRegion = pawns ? (s) => file(s) <= 3 : (s) => file(s) <= 3 && rank(s) <= file(s);
  const syms = pawns ? [0, MIRROR] : [0, 1, 2, 3, 4, 5, 6, 7];
  const region = [], slot = new Int8Array(64).fill(-1);
  for (let s = 0; s < 64; s++) if (inRegion(s)) { slot[s] = region.length; region.push(s); }
  // for each square of the white king: the symmetries that bring it into the region
  const cands = Array.from({ length: 64 }, (_, s) => Int8Array.from(syms.filter((y) => inRegion(SYMT[y][s]))));
  return { region: Int8Array.from(region), slot, cands };
}
const SYMMETRY = [symmetry(false), symmetry(true)];

// ---------- materials ----------
function normalise(name) {
  const i = name.indexOf('K', 1);
  if (name[0] !== 'K' || i < 0) throw new Error(`bad material "${name}" (expected e.g. KRRK, KRKP)`);
  const side = (s) => 'K' + [...s.slice(1)].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)).join('');
  return side(name.slice(0, i)) + side(name.slice(i));
}
/**
 * Material name and pieces (in table order: white king, black king, White's others, Black's others) of a FEN,
 * the side to move, and the en passant square (-1 when the FEN has none).
 */
function fenPieces(fen) {
  const [board, turn, , epField] = fen.split(' ');
  const found = [];
  board.split('/').forEach((row, ri) => {
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) f += +ch;
      else { found.push({ c: ch === ch.toUpperCase() ? 0 : 1, t: TYPE_OF[ch.toUpperCase()], sq: (7 - ri) * 8 + f }); f++; }
    }
  });
  const key = (p) => (p.t === K ? (p.c === 0 ? 0 : 1) : 2 + p.c * 10 + ORDER.indexOf(LETTER[p.t]));
  found.sort((a, b) => key(a) - key(b) || a.sq - b.sq);
  const name = found.filter((p) => p.c === 0).map((p) => LETTER[p.t]).join('') + found.filter((p) => p.c === 1).map((p) => LETTER[p.t]).join('');
  const ep = epField && epField !== '-' ? (epField.charCodeAt(1) - 49) * 8 + (epField.charCodeAt(0) - 97) : -1;
  return { name, pieces: found, stm: turn === 'b' ? 1 : 0, ep };
}

/** Is the material built here (up to 4 pieces, pawns on one side at most)? Else the egtb engine builds it. */
function classic(name) {
  const i = name.indexOf('K', 1);
  return name.length <= 4 && !(name.slice(1, i).includes('P') && name.slice(i + 1).includes('P'));
}

const tables = new Map();
/**
 * The solved table for a material (built on first use, then kept). opts.goal: 'mate' (default), 'promotion' or
 * 'conversion' (the egtb engine).
 */
function table(name, opts = {}) {
  name = normalise(name);
  if (!classic(name) || opts.goal === 'conversion') {
    // a mate table is built once for a material and its colour-swapped twin (K+R vs K+R+P from K+R+P vs K+R)
    const flip = require('./egtb/flip.cjs');
    if ((opts.goal ?? 'mate') === 'mate' && !flip.stored(name)) return flip.flipped(require('./egtb/index.cjs').table(flip.flipName(name), opts));
    return require('./egtb/index.cjs').table(name, opts);
  }
  const goal = opts.goal ?? 'mate';
  const key = goal === 'mate' ? name : `${name}:${goal}`;
  let T = tables.get(key);
  if (!T) {
    T = new Table(name, goal);
    tables.set(key, T);
    T.val = cache.load('solver', key, T.size, Int16Array);
    if (!T.val) {
      T.solve();
      cache.save('solver', key, T.val);
    }
  }
  return T;
}

class Table {
  constructor(name, goal = 'mate') {
    this.name = name;
    this.goal = goal;
    const i = name.indexOf('K', 1);
    const w = name.slice(0, i), b = name.slice(i);
    const list = [{ c: 0, t: K }, { c: 1, t: K }, ...[...w.slice(1)].map((ch) => ({ c: 0, t: TYPE_OF[ch] })), ...[...b.slice(1)].map((ch) => ({ c: 1, t: TYPE_OF[ch] }))];
    this.n = list.length;
    if (this.n > 4) throw new Error(`${name}: at most 4 pieces are supported`);
    this.col = Int8Array.from(list.map((p) => p.c));
    this.typ = Int8Array.from(list.map((p) => p.t));
    if (list.some((p) => p.t === P && p.c === 0) && list.some((p) => p.t === P && p.c === 1))
      throw new Error(`${name}: pawns on both sides (en passant) are not supported`);
    if (goal === 'promotion' && list.slice(2).some((p) => p.c !== 0 || p.t !== P))
      throw new Error(`${name}: the promotion goal is for White's pawns against the lone king`);
    if (goal !== 'mate' && goal !== 'promotion') throw new Error(`${name}: unknown goal "${goal}"`);
    this.sym = SYMMETRY[list.some((p) => p.t === P) ? 1 : 0];
    this.same = this.n === 4 && this.col[2] === this.col[3] && this.typ[2] === this.typ[3]; // two identical pieces
    this.size = 2 * this.sym.region.length * 64 ** (this.n - 1);
    this.val = null;
    this.exits = new Map();
    this.stats = null;
  }
  /** Table index of a position (any of its mirror images gives the same index). */
  index(sqs, stm) {
    const cands = this.sym.cands[sqs[0]], n = this.n;
    let best = -1;
    for (let c = 0; c < cands.length; c++) {
      const T = SYMT[cands[c]];
      let i = this.sym.slot[T[sqs[0]]];
      if (n === 4 && this.same) {
        const a = T[sqs[2]], b = T[sqs[3]];
        i = ((i * 64 + T[sqs[1]]) * 64 + (a < b ? a : b)) * 64 + (a < b ? b : a);
      } else for (let k = 1; k < n; k++) i = i * 64 + T[sqs[k]];
      i = i * 2 + stm;
      if (best < 0 || i < best) best = i;
    }
    return best;
  }
  /** Squares of the position stored at index i (in its stored orientation); returns the side to move. */
  decode(i, sqs) {
    const stm = i & 1;
    i = (i - stm) / 2;
    for (let k = this.n - 1; k >= 1; k--) { sqs[k] = i & 63; i = (i - (i & 63)) / 64; }
    sqs[0] = this.sym.region[i];
    return stm;
  }
  /** Raw stored value (see the top of the file) of the position: squares in table order, stm 0 = White. */
  value(sqs, stm) { return this.val[this.index(sqs, stm)]; }

  // ----- board logic on a square list (sqs[k] = -1: piece k is gone) -----
  clear(sqs, s, t) {
    for (let k = 0; k < this.n; k++) { const q = sqs[k]; if (q >= 0 && q !== s && q !== t && between(s, t, q)) return false; }
    return true;
  }
  /** Is square t attacked by side c? */
  attacked(sqs, t, c) {
    for (let k = 0; k < this.n; k++) {
      if (this.col[k] !== c) continue;
      const s = sqs[k];
      if (s < 0 || s === t) continue;
      switch (this.typ[k]) {
        case K: if (KADJ[s * 64 + t]) return true; break;
        case N: if (KNJ[s * 64 + t]) return true; break;
        case P: if (Math.abs(file(s) - file(t)) === 1 && rank(t) - rank(s) === (c === 0 ? 1 : -1)) return true; break;
        case R: if (LINE[s * 64 + t] === 1 && this.clear(sqs, s, t)) return true; break;
        case B: if (LINE[s * 64 + t] === 2 && this.clear(sqs, s, t)) return true; break;
        case Q: if (LINE[s * 64 + t] && this.clear(sqs, s, t)) return true; break;
      }
    }
    return false;
  }
  legal(sqs, stm) {
    const n = this.n;
    for (let a = 0; a < n; a++) {
      if (sqs[a] < 0) return false;
      if (this.typ[a] === P && (rank(sqs[a]) === 0 || rank(sqs[a]) === 7)) return false;
      for (let b = a + 1; b < n; b++) if (sqs[a] === sqs[b]) return false;
    }
    if (KADJ[sqs[0] * 64 + sqs[1]]) return false;
    return !this.attacked(sqs, sqs[1 - stm], stm); // the side not to move is not in check
  }
  inCheck(sqs, stm) { return this.attacked(sqs, sqs[stm], 1 - stm); }

  /** Would the side to move be safe after piece k moves to `to` (capturing piece cap, or -1)? */
  safe(sqs, stm, k, to, cap) {
    const from = sqs[k];
    sqs[k] = to;
    let capSq = -1;
    if (cap >= 0) { capSq = sqs[cap]; sqs[cap] = -1; }
    const ok = !this.attacked(sqs, sqs[stm], 1 - stm);
    sqs[k] = from;
    if (cap >= 0) sqs[cap] = capSq;
    return ok;
  }
  /** -2: own piece or the enemy king on t (no move there), -1: empty, else the piece that would be captured. */
  target(sqs, stm, t) {
    for (let o = 0; o < this.n; o++) {
      if (sqs[o] !== t) continue;
      return this.col[o] === stm || this.typ[o] === K ? -2 : o;
    }
    return -1;
  }

  /**
   * Legal moves of the side to move, in a fixed order, into buf (4 numbers per move: piece, to,
   * promotion type or -1, captured piece or -1). Returns the number of moves.
   */
  moves(sqs, stm, buf) {
    let m = 0;
    const n = this.n, col = this.col, typ = this.typ;
    const ks = sqs[stm];
    const check = this.attacked(sqs, ks, 1 - stm);
    for (let k = 0; k < n; k++) {
      if (col[k] !== stm) continue;
      const s = sqs[k], ty = typ[k];
      // out of check, a piece that is not on a line with its own king cannot expose it
      const free = !check && ty !== K && LINE[ks * 64 + s] === 0;
      if (ty === K || ty === N) {
        const ts = ty === K ? KT[s] : NT[s];
        for (let x = 0; x < ts.length; x++) {
          const t = ts[x], o = this.target(sqs, stm, t);
          if (o === -2 || !(free || this.safe(sqs, stm, k, t, o))) continue;
          buf[m * 4] = k; buf[m * 4 + 1] = t; buf[m * 4 + 2] = -1; buf[m * 4 + 3] = o; m++;
        }
      } else if (ty === P) {
        const dir = stm === 0 ? 8 : -8;
        const one = s + dir;
        const promote = rank(one) === (stm === 0 ? 7 : 0);
        for (let c = -1; c <= 1; c++) { // c = 0: push, -1/+1: capture towards that side
          if (c && (file(s) + c < 0 || file(s) + c > 7)) continue;
          const t = one + c, o = this.target(sqs, stm, t);
          if (c ? o < 0 : o !== -1) continue;
          if (free || this.safe(sqs, stm, k, t, o)) {
            if (promote) for (const pt of PROMOS) { buf[m * 4] = k; buf[m * 4 + 1] = t; buf[m * 4 + 2] = pt; buf[m * 4 + 3] = o; m++; }
            else { buf[m * 4] = k; buf[m * 4 + 1] = t; buf[m * 4 + 2] = -1; buf[m * 4 + 3] = o; m++; }
          }
          // the double step is judged on its own: in check, it may block where the single step cannot
          const two = t + dir;
          if (!c && rank(s) === (stm === 0 ? 1 : 6) && this.target(sqs, stm, two) === -1 && (free || this.safe(sqs, stm, k, two, -1))) {
            buf[m * 4] = k; buf[m * 4 + 1] = two; buf[m * 4 + 2] = -1; buf[m * 4 + 3] = -1; m++;
          }
        }
      } else {
        const d0 = ty === B ? 4 : 0, d1 = ty === R ? 4 : 8;
        for (let d = d0; d < d1; d++) {
          const ray = RAYS[d][s];
          for (let x = 0; x < ray.length; x++) {
            const t = ray[x], o = this.target(sqs, stm, t);
            if (o === -2) break;
            if (free || this.safe(sqs, stm, k, t, o)) { buf[m * 4] = k; buf[m * 4 + 1] = t; buf[m * 4 + 2] = -1; buf[m * 4 + 3] = o; m++; }
            if (o >= 0) break;
          }
        }
      }
    }
    return m;
  }

  /**
   * Every legal move of a position with what it leads to, for fast searches: [{ piece, from, to, promo,
   * capture, v }], promo '' or 'q'/'r'/'b'/'n'; v is the value the move gives the mover, encoded like the
   * stored values (v > 0 mate in v plies, v < 0 mated in -v - 1 plies, 0 draw).
   */
  options(sqs, stm) {
    const buf = new Int16Array(4 * 256), out = [];
    const m = this.moves(sqs, stm, buf);
    for (let x = 0; x < m; x++) {
      const k = buf[x * 4], to = buf[x * 4 + 1], promo = buf[x * 4 + 2], cap = buf[x * 4 + 3];
      let c;
      if (promo >= 0 || cap >= 0) c = this.exitValue(sqs, stm, k, to, promo, cap);
      else { const from = sqs[k]; sqs[k] = to; c = this.value(sqs, 1 - stm); sqs[k] = from; }
      out.push({ piece: k, from: sqs[k], to, promo: promo >= 0 ? LETTER[promo].toLowerCase() : '', capture: cap >= 0, v: c < 0 ? -c : c > 0 ? -c - 2 : 0 });
    }
    return out;
  }

  /**
   * Value of the child after a capture or a promotion (from the child's side to move), via its own table.
   * Goal 'promotion': a safe promotion (a queen or a rook that cannot be taken at once, and the position stays won)
   * ends the game (as if the opponent were mated now, -1), any other promotion counts as a draw; a capture
   * leads into the promotion table of what is left.
   */
  exitValue(sqs, stm, k, to, promo, cap) {
    const key = cap * 64 + k * 8 + promo;
    let ex = this.exits.get(key);
    if (!ex) {
      const kept = [];
      for (let p = 0; p < this.n; p++) if (p !== cap) kept.push({ p, c: this.col[p], t: p === k && promo >= 0 ? promo : this.typ[p] });
      const order = (x) => (x.t === K ? x.c : 2 + x.c * 10 + ORDER.indexOf(LETTER[x.t]));
      kept.sort((a, b) => order(a) - order(b));
      const name = kept.filter((x) => x.c === 0).map((x) => LETTER[x.t]).join('') + kept.filter((x) => x.c === 1).map((x) => LETTER[x.t]).join('');
      const ends = this.goal === 'promotion' && promo >= 0;
      ex = { table: table(name, { goal: ends ? 'mate' : this.goal }), ends, from: Int8Array.from(kept.map((x) => x.p)), sqs: new Int8Array(kept.length) };
      this.exits.set(key, ex);
    }
    for (let i = 0; i < ex.from.length; i++) ex.sqs[i] = ex.from[i] === k ? to : sqs[ex.from[i]];
    const v = ex.table.value(ex.sqs, 1 - stm);
    if (!ex.ends) return v;
    if (promo !== Q && promo !== R) return 0; // a bishop or a knight is not the goal
    if (KADJ[ex.sqs[1] * 64 + to] && !ex.table.attacked(ex.sqs, to, 0)) return 0; // the king takes the new piece
    return v < 0 ? -1 : 0;
  }

  /**
   * Moves that could have led to (sqs, stm) inside this table: the other side moved piece k from square
   * f without capturing or promoting. Writes pairs (k, f) into buf and returns how many. The caller
   * still checks that the position before the move is legal (predecessorLegal).
   */
  unmoves(sqs, stm, buf) {
    const mover = 1 - stm, n = this.n;
    let m = 0;
    for (let k = 0; k < n; k++) {
      if (this.col[k] !== mover) continue;
      const t = sqs[k], ty = this.typ[k];
      if (ty === K || ty === N) {
        const ts = ty === K ? KT[t] : NT[t];
        for (let x = 0; x < ts.length; x++) if (this.target(sqs, mover, ts[x]) === -1) { buf[m++] = k; buf[m++] = ts[x]; }
      } else if (ty === P) {
        const dir = mover === 0 ? -8 : 8; // backwards
        const r = rank(t);
        if (mover === 0 ? r >= 2 : r <= 5) {
          const one = t + dir;
          if (this.target(sqs, mover, one) === -1) {
            buf[m++] = k; buf[m++] = one;
            if ((mover === 0 ? r === 3 : r === 4) && this.target(sqs, mover, one + dir) === -1) { buf[m++] = k; buf[m++] = one + dir; }
          }
        }
      } else {
        const d0 = ty === B ? 4 : 0, d1 = ty === R ? 4 : 8;
        for (let d = d0; d < d1; d++) {
          const ray = RAYS[d][t];
          for (let x = 0; x < ray.length; x++) { if (this.target(sqs, mover, ray[x]) !== -1) break; buf[m++] = k; buf[m++] = ray[x]; }
        }
      }
    }
    return m >> 1;
  }
  /** With the piece moved back: kings apart, and the side that moves next (stm of the later position) not in check. */
  predecessorLegal(sqs, stm) {
    return !KADJ[sqs[0] * 64 + sqs[1]] && !this.attacked(sqs, sqs[stm], 1 - stm);
  }

  solve() {
    const t0 = Date.now();
    const size = this.size, n = this.n;
    const val = new Int16Array(size);
    const flag = new Uint8Array(size); // 1 never lost (stalemate, or a capture/promotion holds), 2 wins by a capture/promotion
    const exMax = new Uint8Array(size); // 1 + longest opponent win among captures/promotions (0: none)
    const checked = new Uint8Array(size); // level + 1 at which the position was last checked for a loss
    this.val = val;
    const sqs = new Int8Array(n), vsqs = new Int8Array(n), buf = new Int16Array(4 * 256), ubuf = new Int8Array(2 * 128);
    const buckets = [];
    const schedule = (level, i) => { (buckets[level] ??= []).push(i); };
    let cur = [];
    // ---- 1. every position: mates, stalemates, and moves that leave the table ----
    for (let i = 0; i < size; i++) {
      const stm = this.decode(i, sqs);
      if (!this.legal(sqs, stm) || this.index(sqs, stm) !== i) continue; // illegal, or stored under another image
      const m = this.moves(sqs, stm, buf);
      if (!m) {
        if (this.inCheck(sqs, stm)) { val[i] = -1; cur.push(i); } else flag[i] = 1; // checkmate / stalemate
        continue;
      }
      let inside = 0, win = 0, oppMax = -1, holds = false;
      for (let x = 0; x < m; x++) {
        const k = buf[x * 4], to = buf[x * 4 + 1], promo = buf[x * 4 + 2], cap = buf[x * 4 + 3];
        if (cap < 0 && promo < 0) { inside++; continue; }
        const v = this.exitValue(sqs, stm, k, to, promo, cap);
        if (v < 0) { const d = -v; if (!win || d < win) win = d; } // the opponent loses in -v-1: we win in -v
        else if (v > 0) oppMax = Math.max(oppMax, v);
        else holds = true;
      }
      if (holds) flag[i] |= 1;
      if (oppMax >= 0) exMax[i] = oppMax + 1;
      if (win) { flag[i] |= 2; schedule(win, i); }
      else if (!inside && !holds) schedule(oppMax + 1, i); // every move leaves the table and loses
    }
    // ---- 2. retrograde, level by level (level = plies to mate) ----
    const t1 = Date.now();
    let maxLevel = 0, resolved = 0;
    for (let L = 0; ; L++) {
      // positions scheduled for this level (wins by a capture/promotion, losses once every move loses)
      for (const i of buckets[L] ?? []) if (val[i] === 0) { val[i] = L % 2 ? L : -(L + 1); cur.push(i); }
      if (!cur.length) { if (L > buckets.length) break; continue; }
      maxLevel = L;
      resolved += cur.length;
      const next = [];
      const lost = L % 2 === 0; // positions in cur: the side to move is mated in L plies (even) or mates in L (odd)
      for (const qi of cur) {
        const stm = this.decode(qi, sqs);
        const u = this.unmoves(sqs, stm, ubuf);
        for (let x = 0; x < u; x++) {
          const k = ubuf[2 * x], t = sqs[k];
          sqs[k] = ubuf[2 * x + 1];
          const pi = this.index(sqs, 1 - stm);
          if (val[pi] === 0 && this.predecessorLegal(sqs, stm)) {
            if (lost) { val[pi] = L + 1; next.push(pi); } // a move into a lost position wins
            else if (!(flag[pi] & 3) && checked[pi] !== L + 1) {
              // a move of this position now loses: does every move lose? Then it is lost in 1 + the longest of them.
              checked[pi] = L + 1;
              if (this.allMovesLose(pi, vsqs, buf)) schedule(Math.max(L, exMax[pi] - 1) + 1, pi);
            }
          }
          sqs[k] = t;
        }
      }
      cur = next;
    }
    this.stats = { ms: Date.now() - t0, firstPassMs: t1 - t0, maxLevel, resolved };
    return this;
  }
  /** Do all moves inside the table from position i lead to positions the opponent wins (already solved)? */
  allMovesLose(i, sqs, buf) {
    const stm = this.decode(i, sqs), val = this.val;
    const m = this.moves(sqs, stm, buf);
    for (let x = 0; x < m; x++) {
      const k = buf[x * 4], to = buf[x * 4 + 1];
      if (buf[x * 4 + 2] >= 0 || buf[x * 4 + 3] >= 0) continue; // captures/promotions: known to lose (flags)
      const from = sqs[k];
      sqs[k] = to;
      const v = val[this.index(sqs, 1 - stm)];
      sqs[k] = from;
      if (v <= 0) return false;
    }
    return true;
  }
}

/** Exact value of a FEN position for the side to move: { result: 'win' | 'loss' | 'draw', dtm } (dtm in plies, -1 for a draw). */
function probe(fen) {
  const { name, pieces, stm, ep } = fenPieces(fen);
  if (pieces.length > 5) throw new Error(`${fen}: more than 5 pieces`);
  const T = table(name);
  const sqs = Int8Array.from(pieces.map((p) => p.sq));
  if (!T.legal(sqs, stm)) throw new Error(`illegal position ${fen}`);
  const v = T.valueEp ? T.valueEp(sqs, stm, ep) : T.value(sqs, stm); // en passant only matters with pawns on both sides
  if (v > 0) return { result: 'win', dtm: v };
  if (v < 0) return { result: 'loss', dtm: -v - 1 };
  return { result: 'draw', dtm: -1 };
}

/**
 * Plies to a safe promotion for the side to move, in a position with White's pawns against the lone king
 * (goal 'promotion'): { result: 'win' | 'loss' | 'draw', dtc } (dtc 0 for a draw), like ../kpk-course/kpk.cjs.
 */
function probePromotion(fen) {
  const { name, pieces, stm } = fenPieces(fen);
  if (pieces.length > 5) throw new Error(`${fen}: more than 5 pieces`);
  const T = table(name, { goal: 'promotion' });
  const sqs = Int8Array.from(pieces.map((p) => p.sq));
  if (!T.legal(sqs, stm)) throw new Error(`illegal position ${fen}`);
  const v = T.value(sqs, stm);
  if (v > 0) return { result: 'win', dtc: v };
  if (v < 0) return { result: 'loss', dtc: -v - 1 };
  return { result: 'draw', dtc: 0 };
}

/**
 * Goal 'conversion' (any material up to 5 pieces): { result: 'win' | 'loss' | 'draw', dtc } for the side to
 * move, dtc = plies until White converts (see the top of the file); 'draw' means White does not win.
 */
function probeConversion(fen) {
  const { name, pieces, stm, ep } = fenPieces(fen);
  if (pieces.length > 5) throw new Error(`${fen}: more than 5 pieces`);
  const T = table(name, { goal: 'conversion' });
  const sqs = Int8Array.from(pieces.map((p) => p.sq));
  if (!T.legal(sqs, stm)) throw new Error(`illegal position ${fen}`);
  const v = T.valueEp(sqs, stm, ep);
  if (v > 0) return { result: 'win', dtc: v };
  if (v < 0) return { result: 'loss', dtc: -v - 1 };
  return { result: 'draw', dtc: 0 };
}

module.exports = { table, probe, probePromotion, probeConversion, fenPieces, normalise, classic };
