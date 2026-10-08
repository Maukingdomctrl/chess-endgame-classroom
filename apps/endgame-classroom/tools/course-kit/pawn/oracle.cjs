// An independent solver for White's pawns (one or two) against the lone black king, measured to a safe
// promotion. It exists to check ../solver.cjs (goal 'promotion') and the courses built on it, so it shares
// no code with it: its own board logic and move generation, full tables without mirror images, and the
// classic retrograde algorithm with move counters (the toolkit solver uses symmetric storage and checks
// every move of a candidate instead).
//
// The measure: plies until White promotes to a queen or a rook that the black king cannot take at once,
// without stalemate (such a position is always won: K+Q or K+R, maybe with a pawn, against the lone king).
// A pawn move that mates also reaches the goal. Black's king may take an unprotected pawn: the game goes on
// with one pawn (or is a draw without pawns). Promotions to a bishop or a knight do not count.
//
//   const oracle = require('./oracle.cjs');
//   oracle.probe('8/8/8/4k3/8/8/3PP3/4K3 w - - 0 1')  // { result: 'win' | 'loss' | 'draw', dtc }
//   oracle.value([wk, bk, p1, p2], stm)               // plies to the goal, or -1 for a draw
//
// Squares 0..63 (a1 = 0, h8 = 63); stm 0 = White to move. Building the two-pawn table takes about half a
// minute; it is kept in memory (and on disk with KIT_CACHE, see ../cache.cjs).

const cache = require('../cache.cjs');

const F = (s) => s & 7, R = (s) => s >> 3;
const ADJ = [];
for (let s = 0; s < 64; s++) {
  const a = [];
  for (let df = -1; df <= 1; df++) for (let dr = -1; dr <= 1; dr++) {
    if (!df && !dr) continue;
    const f = F(s) + df, r = R(s) + dr;
    if (f >= 0 && f < 8 && r >= 0 && r < 8) a.push(r * 8 + f);
  }
  ADJ.push(a);
}
const near = (a, b) => a !== b && Math.abs(F(a) - F(b)) <= 1 && Math.abs(R(a) - R(b)) <= 1;
/** Does a white pawn on p attack square t? */
const pawnHits = (p, t) => R(t) === R(p) + 1 && Math.abs(F(t) - F(p)) === 1;

// ---------- indexing: n pawns (1 or 2), the pair of pawns stored once (lower square first) ----------
const PAIR = new Int16Array(64 * 64).fill(-1), PAIRS = [];
for (let a = 8; a < 56; a++) for (let b = a + 1; b < 56; b++) { PAIR[a * 64 + b] = PAIRS.length; PAIRS.push([a, b]); }
const PAWN_SLOTS = [0, 48, PAIRS.length];
function index(n, wk, bk, ps, stm) {
  const slot = n === 1 ? ps[0] - 8 : ps[0] < ps[1] ? PAIR[ps[0] * 64 + ps[1]] : PAIR[ps[1] * 64 + ps[0]];
  return ((wk * 64 + bk) * PAWN_SLOTS[n] + slot) * 2 + stm;
}

/** Is the position legal (Black to move may be in check by a pawn; White to move never leaves Black in check)? */
function legal(wk, bk, ps, stm) {
  if (wk === bk || near(wk, bk)) return false;
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    if (p < 8 || p > 55 || p === wk || p === bk) return false;
    for (let j = i + 1; j < ps.length; j++) if (ps[j] === p) return false;
    if (stm === 0 && pawnHits(p, bk)) return false;
  }
  return true;
}
const occupied = (wk, bk, ps, t) => t === wk || t === bk || ps.includes(t);
/** Squares the black king may step to (own legality), with the pawn it takes there, if any. */
function blackMoves(wk, bk, ps) {
  const out = [];
  for (const t of ADJ[bk]) {
    if (near(t, wk) || t === wk) continue;
    if (ps.some((p) => pawnHits(p, t))) continue;
    const taken = ps.indexOf(t);
    out.push({ to: t, taken });
  }
  return out;
}
const blackInCheck = (bk, ps) => ps.some((p) => pawnHits(p, bk));

/** Slider attack from s to t through empty squares (the black king does not block a line through its own square when it moves along it). */
function slides(s, t, dirs, blockers) {
  for (const [df, dr] of dirs) {
    let f = F(s) + df, r = R(s) + dr;
    while (f >= 0 && f < 8 && r >= 0 && r < 8) {
      const q = r * 8 + f;
      if (q === t) return true;
      if (blockers.includes(q)) break;
      f += df; r += dr;
    }
  }
  return false;
}
const ROOK = [[1, 0], [-1, 0], [0, 1], [0, -1]], QUEEN = [...ROOK, [1, 1], [1, -1], [-1, 1], [-1, -1]];
/**
 * After White promotes on square q (piece 'q' or 'r'), with the other pawns ps: is it a safe promotion
 * (the king cannot take the new piece, and it is not stalemate)?
 */
function safePromotion(wk, bk, q, piece, ps) {
  const dirs = piece === 'q' ? QUEEN : ROOK;
  const hit = (t) => near(t, wk) || ps.some((p) => pawnHits(p, t)) || slides(q, t, dirs, [wk, ...ps]);
  // can the king take the new piece?
  if (near(bk, q) && !near(wk, q) && !ps.some((p) => pawnHits(p, q))) return false;
  // stalemate: no square for the king (a pawn it could take counts as a square) and not in check
  if (hit(bk)) return true; // check, or mate: not stalemate
  for (const t of ADJ[bk]) if (t !== wk && t !== q && !hit(t)) return true;
  return false;
}

// ---------- the tables ----------
const tables = [null, null, null];
function build(n) {
  const size = 64 * 64 * PAWN_SLOTS[n] * 2;
  const key = `p${n}`;
  const cached = cache.load('oracle', key, size, Uint8Array);
  if (cached) return cached;
  const val = new Uint8Array(size); // 0 = not a win (draw or illegal), else plies to the goal + 1
  const left = new Uint8Array(size); // Black to move: moves not yet known to lose
  const worst = new Uint8Array(size); // Black to move: the longest loss among them so far (plies + 1)
  const hold = new Uint8Array(size); // Black to move: a move that does not lose (a draw), or stalemate
  const buckets = [];
  const put = (d, i) => (buckets[d] ??= []).push(i);
  const less = n === 2 ? tables[1] ?? (tables[1] = build(1)) : null;
  const ps = new Array(n);
  const each = (fn) => {
    for (let wk = 0; wk < 64; wk++) for (let bk = 0; bk < 64; bk++) for (let slot = 0; slot < PAWN_SLOTS[n]; slot++) {
      if (n === 1) ps[0] = slot + 8; else { ps[0] = PAIRS[slot][0]; ps[1] = PAIRS[slot][1]; }
      for (let stm = 0; stm < 2; stm++) if (legal(wk, bk, ps, stm)) fn(wk, bk, ps, stm, ((wk * 64 + bk) * PAWN_SLOTS[n] + slot) * 2 + stm);
    }
  };
  // 1. what is known at once: promotions, mates, stalemates, and Black's captures (they leave this table)
  each((wk, bk, ps, stm, i) => {
    if (stm === 0) {
      for (const p of ps) {
        if (R(p) !== 6 || occupied(wk, bk, ps, p + 8)) continue;
        const rest = ps.filter((x) => x !== p);
        if (safePromotion(wk, bk, p + 8, 'q', rest) || safePromotion(wk, bk, p + 8, 'r', rest)) { val[i] = 2; put(1, i); return; }
      }
      return;
    }
    const ms = blackMoves(wk, bk, ps);
    if (!ms.length) { if (blackInCheck(bk, ps)) { val[i] = 1; put(0, i); } else hold[i] = 1; return; }
    let inside = 0, longest = 0;
    for (const m of ms) {
      if (m.taken < 0) { inside++; continue; }
      const rest = ps.filter((x) => x !== m.to);
      const v = rest.length ? less[index(1, wk, m.to, rest, 0)] : 0; // no pawn left: a draw
      if (!v) hold[i] = 1; else longest = Math.max(longest, v);
    }
    left[i] = inside;
    worst[i] = longest;
    if (!inside && !hold[i]) put(longest, i); // every move takes a pawn and loses: lost in 1 + the longest
  });
  // 2. retrograde, level by level (d = plies to the goal)
  const tmp = new Array(n);
  for (let d = 0; d < buckets.length; d++) {
    for (const i of buckets[d] ?? []) {
      const stm = i & 1;
      if (stm === 1 && !val[i]) val[i] = d + 1; // a Black position whose last losing move was just counted
      if (val[i] !== d + 1) continue;
      let rest = (i - stm) / 2;
      const slot = rest % PAWN_SLOTS[n]; rest = (rest - slot) / PAWN_SLOTS[n];
      const bk = rest % 64, wk = (rest - bk) / 64;
      if (n === 1) tmp[0] = slot + 8; else { tmp[0] = PAIRS[slot][0]; tmp[1] = PAIRS[slot][1]; }
      if (stm === 1) {
        // White moved into this lost position: its predecessors win in d + 1 (a king move, or a pawn push)
        const win = (pwk, pps) => {
          if (!legal(pwk, bk, pps, 0)) return;
          const j = index(n, pwk, bk, pps, 0);
          if (!val[j]) { val[j] = d + 2; put(d + 1, j); }
        };
        if (!blackInCheck(bk, tmp)) for (const q of ADJ[wk]) if (!occupied(wk, bk, tmp, q) && !near(q, bk)) win(q, tmp);
        for (let k = 0; k < n; k++) {
          const p = tmp[k];
          if (R(p) < 2) continue;
          const back = (q) => { const pps = tmp.slice(); pps[k] = q; win(wk, pps); };
          if (!occupied(wk, bk, tmp, p - 8)) {
            back(p - 8);
            if (R(p) === 3 && !occupied(wk, bk, tmp, p - 16)) back(p - 16);
          }
        }
      } else {
        // Black moved into this won position: one more of its predecessors' moves loses
        for (const q of ADJ[bk]) {
          if (occupied(wk, bk, tmp, q) || near(q, wk)) continue;
          const j = index(n, wk, q, tmp, 1);
          if (val[j] || hold[j] || !legal(wk, q, tmp, 1)) continue;
          if (d + 1 > worst[j]) worst[j] = d + 1;
          if (--left[j] === 0) put(worst[j], j);
        }
      }
    }
  }
  cache.save('oracle', key, val);
  return val;
}
const table = (n) => tables[n] ?? (tables[n] = build(n));

/** Plies to the goal for the side to move, or -1 when it is a draw; squares [wk, bk, ...pawns]. */
function value(sqs, stm) {
  const [wk, bk, ...ps] = sqs.filter((s, k) => k < 2 || s >= 0);
  if (!ps.length) return -1;
  if (ps.length > 2) throw new Error('the oracle covers one or two pawns');
  if (!legal(wk, bk, ps, stm)) throw new Error(`illegal position ${sqs} (${stm ? 'Black' : 'White'} to move)`);
  const v = table(ps.length)[index(ps.length, wk, bk, ps, stm)];
  return v ? v - 1 : -1;
}
/** A FEN with only the kings and White's pawns: { result, dtc } for the side to move, like solver.probePromotion. */
function probe(fen) {
  const [board, turn] = fen.split(' ');
  let wk = -1, bk = -1;
  const ps = [];
  board.split('/').forEach((row, ri) => {
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) { f += +ch; continue; }
      const s = (7 - ri) * 8 + f++;
      if (ch === 'K') wk = s; else if (ch === 'k') bk = s; else if (ch === 'P') ps.push(s);
      else throw new Error(`the oracle covers White's pawns against the lone king only: ${fen}`);
    }
  });
  const stm = turn === 'b' ? 1 : 0;
  const d = value([wk, bk, ...ps], stm);
  return d < 0 ? { result: 'draw', dtc: 0 } : { result: stm === 0 ? 'win' : 'loss', dtc: d };
}

module.exports = { value, probe, legal, safePromotion, table, index, PAWN_SLOTS };
