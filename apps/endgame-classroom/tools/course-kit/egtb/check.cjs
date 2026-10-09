// Independent check of a solved table: every stored value must follow from the values of the position's
// moves (win = 1 + the fastest losing reply, loss = 1 + the slowest winning reply, else a draw; checkmate and
// stalemate when there is no move). It shares no board logic with the engine: its own 8x8 board, move
// generation, attack test (scanning outward from the king), en passant rule, safe-promotion rule and
// material bookkeeping; it uses only what a table stores (value(), valueAt(), index(), decode()) and the
// values of the tables its captures and promotions lead to.
//
// Why that is enough: by induction on the distance to mate, a table in which every position agrees with its
// moves holds exactly the true values: a stored win needs a reply stored as a shorter loss, and so on down
// to checkmate; a true win in d plies has a reply truly lost in d - 1, stored correctly by induction, so it
// cannot be stored as a draw. The index is checked too: every stored position is found again from all its
// mirror images.
//
//   node tools/course-kit/egtb/check.cjs KRPKR [--goal promotion] [--sample 0.01] [--from i --to j]
//   const { checkTable } = require('./check.cjs'); checkTable(table, { resolve, sample, from, to })
// The command line checks on all threads (EGTB_THREADS); the function checks on the calling thread.
'use strict';

// ---------- board ----------
const KING = 0, QUEEN = 1, ROOK = 2, BISHOP = 3, KNIGHT = 4, PAWN = 5;
const LETTERS = 'KQRBNP';
const code = (c, t) => 1 + t + 8 * c; // 0 = empty
const colourOf = (x) => (x - 1) >> 3, typeOf = (x) => (x - 1) & 7;
const F = (s) => s % 8, Rk = (s) => Math.floor(s / 8);
const inside = (f, r) => f >= 0 && f < 8 && r >= 0 && r < 8;
const steps = (deltas) => Array.from({ length: 64 }, (_, s) => deltas.map(([df, dr]) => [F(s) + df, Rk(s) + dr]).filter(([f, r]) => inside(f, r)).map(([f, r]) => r * 8 + f));
const KSTEP = steps([[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]);
const NSTEP = steps([[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]);
const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]], DIAGS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
// the squares along each direction from each square
const LINES = (dirs) => Array.from({ length: 64 }, (_, s) => dirs.map(([df, dr]) => { const out = []; let f = F(s) + df, r = Rk(s) + dr; while (inside(f, r)) { out.push(r * 8 + f); f += df; r += dr; } return out; }));
const OLINES = LINES(ORTHO), DLINES = LINES(DIAGS);

/** Is square s attacked by colour c? (scanned from s outwards) */
function attackedBy(board, s, c) {
  const f = F(s), r = Rk(s);
  const pr = c === 0 ? r - 1 : r + 1; // a white pawn attacks from one rank below, a black pawn from one rank above
  if (pr >= 0 && pr < 8) {
    if (f > 0 && board[pr * 8 + f - 1] === code(c, PAWN)) return true;
    if (f < 7 && board[pr * 8 + f + 1] === code(c, PAWN)) return true;
  }
  const n = code(c, KNIGHT), k = code(c, KING), q = code(c, QUEEN), ro = code(c, ROOK), b = code(c, BISHOP);
  for (const t of NSTEP[s]) if (board[t] === n) return true;
  for (const t of KSTEP[s]) if (board[t] === k) return true;
  for (const line of OLINES[s]) for (const t of line) { const p = board[t]; if (p) { if (p === ro || p === q) return true; break; } }
  for (const line of DLINES[s]) for (const t of line) { const p = board[t]; if (p) { if (p === b || p === q) return true; break; } }
  return false;
}

/**
 * Pseudo-legal moves of colour c into out (5 numbers each: from, to, promotion type or -1, square of the
 * captured piece or -1, 1 for a double step); ep: the en passant square or -1. Returns the count.
 */
function pseudoMoves(board, c, ep, out) {
  let m = 0;
  const put = (from, to, promo, capSq, dbl) => { out[m * 5] = from; out[m * 5 + 1] = to; out[m * 5 + 2] = promo; out[m * 5 + 3] = capSq; out[m * 5 + 4] = dbl; m++; };
  const enemy = (t) => board[t] !== 0 && colourOf(board[t]) !== c && typeOf(board[t]) !== KING;
  for (let s = 0; s < 64; s++) {
    const p = board[s];
    if (!p || colourOf(p) !== c) continue;
    const t0 = typeOf(p);
    if (t0 === KING || t0 === KNIGHT) {
      for (const t of (t0 === KING ? KSTEP : NSTEP)[s]) if (!board[t]) put(s, t, -1, -1, 0); else if (enemy(t)) put(s, t, -1, t, 0);
    } else if (t0 === PAWN) {
      const dr = c === 0 ? 1 : -1, r1 = Rk(s) + dr, f = F(s);
      const last = r1 === 0 || r1 === 7;
      if (!board[r1 * 8 + f]) {
        if (last) for (let pr = QUEEN; pr <= KNIGHT; pr++) put(s, r1 * 8 + f, pr, -1, 0); else put(s, r1 * 8 + f, -1, -1, 0);
        const r2 = Rk(s) + 2 * dr;
        if (Rk(s) === (c === 0 ? 1 : 6) && !board[r2 * 8 + f]) put(s, r2 * 8 + f, -1, -1, 1);
      }
      for (const df of [-1, 1]) {
        if (!inside(f + df, r1)) continue;
        const t = r1 * 8 + f + df;
        if (enemy(t)) { if (last) for (let pr = QUEEN; pr <= KNIGHT; pr++) put(s, t, pr, t, 0); else put(s, t, -1, t, 0); }
        else if (t === ep && !board[t]) {
          const behind = Rk(s) * 8 + f + df; // the pawn that has just made the double step
          if (board[behind] === code(1 - c, PAWN)) put(s, t, -1, behind, 0);
        }
      }
    } else {
      const lines = t0 === ROOK ? OLINES[s] : t0 === BISHOP ? DLINES[s] : [...OLINES[s], ...DLINES[s]];
      for (const line of lines) for (const t of line) { if (!board[t]) put(s, t, -1, -1, 0); else { if (enemy(t)) put(s, t, -1, t, 0); break; } }
    }
  }
  return m;
}

/** Legal moves as objects (for tests): [{ from, to, promo, capSq, double }]. */
function legalMoves(board, c, ep) {
  const buf = new Int16Array(5 * 256), out = [];
  const m = pseudoMoves(board, c, ep, buf);
  for (let x = 0; x < m; x++) {
    const mv = { from: buf[x * 5], to: buf[x * 5 + 1], promo: buf[x * 5 + 2], capSq: buf[x * 5 + 3], double: buf[x * 5 + 4] === 1 };
    const b = Int8Array.from(board);
    if (mv.capSq >= 0) b[mv.capSq] = 0;
    b[mv.to] = mv.promo >= 0 ? code(c, mv.promo) : b[mv.from];
    b[mv.from] = 0;
    if (!attackedBy(b, b.indexOf(code(c, KING)), 1 - c)) out.push(mv);
  }
  return out;
}

// ---------- materials ----------
const ORD = 'QRBNP';
/** The material name of a board and its pieces' squares in table order (kings, White's Q R B N P, Black's). */
function material(board) {
  const ps = [];
  for (let s = 0; s < 64; s++) if (board[s]) ps.push({ c: colourOf(board[s]), t: typeOf(board[s]), s });
  const key = (p) => (p.t === KING ? p.c : 2 + p.c * 10 + ORD.indexOf(LETTERS[p.t]));
  ps.sort((a, b) => key(a) - key(b) || a.s - b.s);
  const name = ps.filter((p) => p.c === 0).map((p) => LETTERS[p.t]).join('') + ps.filter((p) => p.c === 1).map((p) => LETTERS[p.t]).join('');
  return { name, sqs: Int8Array.from(ps.map((p) => p.s)) };
}

// the 7 non-trivial symmetries of the board, written out (not taken from the engine)
const SYMS = [
  (s) => (s & 56) | (7 - (s & 7)), // a <-> h
  (s) => ((7 - (s >> 3)) << 3) | (s & 7), // rank 1 <-> 8
  (s) => ((7 - (s >> 3)) << 3) | (7 - (s & 7)), // half turn
  (s) => ((s & 7) << 3) | (s >> 3), // a1-h8 diagonal
  (s) => ((7 - (s & 7)) << 3) | (7 - (s >> 3)), // a8-h1 diagonal
  (s) => ((s & 7) << 3) | (7 - (s >> 3)), // quarter turn
  (s) => ((7 - (s & 7)) << 3) | (s >> 3), // quarter turn back
].map((f) => Int8Array.from({ length: 64 }, (_, s) => f(s)));

/**
 * Checks a table. opts.resolve(name, goal) -> the table of another material (captures, promotions; goal
 * 'mate' for the mate table a conversion is judged by, else the table's own goal); opts.sample:
 * the share of positions to check (1 = all), drawn with a fixed seed; opts.from / opts.to: an index range.
 * Returns { checked, wrong, symmetry, examples, ms }.
 */
function checkTable(T, opts = {}) {
  const t0 = Date.now();
  const resolve = opts.resolve;
  const sample = opts.sample ?? 1;
  const from = opts.from ?? 0, to = Math.min(opts.to ?? T.size, T.size);
  const n = T.n, typ = T.typ, col = T.col;
  const pawns = typ.some((t) => t === PAWN);
  const goalPromotion = T.goal === 'promotion', goalConversion = T.goal === 'conversion';
  const mates = (name) => tableOf(`${name}:mate`, name, 'mate');
  const tables = new Map([[T.name, T]]);
  const tableOf = (key, name = key, goal) => { let x = tables.get(key); if (!x) { x = name.length === 2 ? { value: () => 0 } : resolve(name, goal); tables.set(key, x); } return x; };
  let seed = (opts.seed ?? 20261009) ^ from;
  const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 4294967296; };
  const res = { checked: 0, wrong: 0, symmetry: 0, examples: [] };

  const board = new Int8Array(64), at = new Int8Array(64).fill(-1); // piece codes; the table piece on each square
  const sqs = new Int8Array(n), img = new Int8Array(n), back = new Int8Array(n);
  const bufs = [];
  const kingOf = (c) => sqs[c]; // pieces 0 and 1 are the kings

  /** One-ply search of the position on the board (side c to move, en passant square ep). */
  function search(c, ep, depth) {
    const buf = (bufs[depth] ??= new Int16Array(5 * 256));
    const m = pseudoMoves(board, c, ep, buf);
    let win = 0, oppMax = -1, draw = false, legal = 0;
    for (let x = 0; x < m; x++) {
      const fr = buf[x * 5], tq = buf[x * 5 + 1], promo = buf[x * 5 + 2], capSq = buf[x * 5 + 3], dbl = buf[x * 5 + 4];
      // make
      const k = at[fr], pc = board[fr];
      const capCode = capSq >= 0 ? board[capSq] : 0, capK = capSq >= 0 ? at[capSq] : -1;
      if (capSq >= 0) { board[capSq] = 0; at[capSq] = -1; sqs[capK] = -1; }
      board[tq] = promo >= 0 ? code(c, promo) : pc; at[tq] = k; board[fr] = 0; at[fr] = -1; sqs[k] = tq;
      let v = null;
      if (!attackedBy(board, kingOf(c), 1 - c)) {
        legal++;
        if (goalPromotion && promo >= 0) v = safePromotion(tq, promo) ? -1 : 0;
        else if (goalConversion && c === 0 && (capSq >= 0 || promo >= 0)) { const mt = material(board); v = mates(mt.name).value(mt.sqs, 1) < 0 ? -1 : 0; } // White converts: is it still won?
        else if (capSq >= 0 || promo >= 0) { const mt = material(board); v = tableOf(mt.name).value(mt.sqs, 1 - c); }
        else if (dbl && nextToEnemyPawn(tq, c)) v = search(1 - c, (fr + tq) / 2, depth + 1);
        else v = T.value(sqs, 1 - c);
      }
      // unmake
      board[fr] = pc; at[fr] = k; sqs[k] = fr; board[tq] = 0; at[tq] = -1;
      if (capSq >= 0) { board[capSq] = capCode; at[capSq] = capK; sqs[capK] = capSq; }
      if (v === null) continue;
      if (v < 0) { if (!win || -v < win) win = -v; } else if (v > 0) { if (v > oppMax) oppMax = v; } else draw = true;
    }
    if (!legal) return attackedBy(board, kingOf(c), 1 - c) && !((goalPromotion || goalConversion) && c === 0) ? -1 : 0; // a mated White is no win for White
    return win ? win : draw ? 0 : -oppMax - 2;
  }
  const nextToEnemyPawn = (tq, c) => [F(tq) - 1, F(tq) + 1].some((f) => f >= 0 && f < 8 && board[Rk(tq) * 8 + f] === code(1 - c, PAWN));
  /** Goal 'promotion' (the board after White's promotion on q): a queen or a rook the lone king cannot take at once, without stalemate. */
  function safePromotion(q, promo) {
    if (promo !== QUEEN && promo !== ROOK) return false;
    const bk = kingOf(1);
    const replies = legalMoves(board, 1, -1);
    if (replies.some((r) => r.to === q)) return false; // the king takes it
    return replies.length > 0 || attackedBy(board, bk, 0); // not stalemate
  }

  for (let i = from; i < to; i++) {
    if (sample < 1 && rnd() >= sample) continue;
    const stm = T.decode(i, sqs);
    // a stored position: squares distinct, pawns on ranks 2-7, kings apart, the side not to move not in check, the stored image of itself
    let ok = true, placed = 0;
    for (; placed < n; placed++) {
      const s = sqs[placed];
      if (board[s] || (typ[placed] === PAWN && (s < 8 || s > 55))) { ok = false; break; }
      board[s] = code(col[placed], typ[placed]); at[s] = placed;
    }
    if (ok && !KSTEP[sqs[0]].includes(sqs[1]) && !attackedBy(board, sqs[1 - stm], stm) && T.index(sqs, stm) === i) {
      res.checked++;
      const stored = T.valueAt(i);
      const expect = search(stm, -1, 0);
      if (expect !== stored) { res.wrong++; if (res.examples.length < 10) res.examples.push({ i, sqs: [...sqs], stm, stored, expect }); }
      // every mirror image of the position is found at this index, or (pawns placed symmetrically, a slice that
      // is its own mirror image and stored in full) at an index that holds exactly the image, with the same value
      for (const S of pawns ? SYMS.slice(0, 1) : SYMS) {
        for (let k = 0; k < n; k++) img[k] = S[sqs[k]];
        const j = T.index(img, stm);
        if (j === i) continue;
        let same = j >= 0 && j < T.size && T.decode(j, back) === stm && T.valueAt(j) === stored;
        for (let k = 0; k < n && same; k++) { let found = false; for (let m = 0; m < n; m++) if (back[m] === img[k] && typ[m] === typ[k] && col[m] === col[k]) found = true; same = found; }
        if (!same) { res.symmetry++; if (res.examples.length < 10) res.examples.push({ i, sqs: [...sqs], stm, image: [...img], j }); }
      }
    }
    for (let k = 0; k < placed; k++) { board[sqs[k]] = 0; at[sqs[k]] = -1; }
  }
  res.ms = Date.now() - t0;
  return res;
}

module.exports = { checkTable, legalMoves, pseudoMoves, attackedBy, material, code };

if (require.main === module) {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const name = args.find((a) => /^K[QRBNP]*K[QRBNP]*$/.test(a));
  if (!name) { console.error('usage: node tools/course-kit/egtb/check.cjs <material> [--goal promotion] [--sample 0.01] [--from i] [--to j]'); process.exit(2); }
  const egtb = require('./index.cjs');
  const parallel = require('./parallel.cjs');
  const goal = opt('--goal', 'mate');
  const t0 = Date.now();
  const T = egtb.table(name, { goal });
  console.log(`${T.name}${goal === 'mate' ? '' : `:${goal}`}: built in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  const sample = +opt('--sample', 1), from = +opt('--from', 0), to = opt('--to') ? +opt('--to') : T.size;
  const r = parallel.checkParallel(T, { sample, from, to });
  console.log(`${r.checked} positions checked: ${r.wrong} values wrong, ${r.symmetry} mirror images not found (${(r.ms / 1000).toFixed(1)} s on ${r.threads} thread(s))`);
  for (const e of r.examples) console.log('  ', JSON.stringify(e));
  process.exit(r.wrong || r.symmetry ? 1 : 0);
}
