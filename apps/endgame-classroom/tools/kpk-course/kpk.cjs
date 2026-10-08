// Exact solver for King + Pawn vs King (pawn side normalised to White, moving up).
// dtc = plies until a safe promotion (KQK/KRK that cannot be captured or stalemated), 0 = draw.
const N = 64;
const file = (s) => s & 7, rank = (s) => s >> 3;
const dist = (a, b) => Math.max(Math.abs(file(a) - file(b)), Math.abs(rank(a) - rank(b)));
const kingAdj = [];
for (let s = 0; s < N; s++) {
  kingAdj[s] = [];
  for (let df = -1; df <= 1; df++) for (let dr = -1; dr <= 1; dr++) {
    if (!df && !dr) continue;
    const f = file(s) + df, r = rank(s) + dr;
    if (f >= 0 && f < 8 && r >= 0 && r < 8) kingAdj[s].push(r * 8 + f);
  }
}
const pawnAttacks = (p, t) => rank(t) === rank(p) + 1 && Math.abs(file(t) - file(p)) === 1;
const idx = (wk, bk, p, stm) => ((wk * 64 + bk) * 64 + p) * 2 + stm; // stm 0 = white
const legal = (wk, bk, p, stm) => {
  if (wk === bk || wk === p || bk === p) return false;
  if (rank(p) === 0 || rank(p) === 7) return false;
  if (dist(wk, bk) <= 1) return false;
  if (stm === 0 && pawnAttacks(p, bk)) return false; // black can't be in check on white's turn
  return true;
};

// Queen/rook attack with the white king as the only blocker (the black king is "transparent").
function slideAttacks(q, t, wk, diag) {
  const df = Math.sign(file(t) - file(q)), dr = Math.sign(rank(t) - rank(q));
  const straight = file(t) === file(q) || rank(t) === rank(q);
  const diagonal = Math.abs(file(t) - file(q)) === Math.abs(rank(t) - rank(q));
  if (!(straight || (diag && diagonal)) || q === t) return false;
  let f = file(q) + df, r = rank(q) + dr;
  while (f !== file(t) || r !== rank(t)) {
    if (r * 8 + f === wk) return false;
    f += df; r += dr;
  }
  return true;
}
/** After promoting on q (black to move): 'win' | 'draw'. */
function promotionResult(wk, bk, q, piece) {
  const diag = piece === 'q';
  const qProtected = dist(wk, q) <= 1;
  if (dist(bk, q) <= 1 && !qProtected) return 'draw'; // queen/rook gets taken
  const inCheck = slideAttacks(q, bk, wk, diag);
  let hasMove = false;
  for (const t of kingAdj[bk]) {
    if (dist(t, wk) <= 1) continue;
    if (t === q) { if (!qProtected) hasMove = true; continue; }
    if (slideAttacks(q, t, wk, diag)) continue;
    hasMove = true;
  }
  if (!hasMove) return inCheck ? 'win' : 'draw';
  return 'win';
}

function whiteMoves(wk, bk, p) {
  const out = []; // {kind:'k'|'p'|'promo', to, child?, promo?}
  for (const t of kingAdj[wk]) {
    if (t === p || dist(t, bk) <= 1) continue;
    out.push({ kind: 'k', from: wk, to: t, child: [t, bk, p] });
  }
  const one = p + 8;
  if (one !== wk && one !== bk) {
    if (rank(one) === 7) {
      for (const pc of ['q', 'r']) out.push({ kind: 'promo', from: p, to: one, promo: pc, result: promotionResult(wk, bk, one, pc) });
    } else {
      out.push({ kind: 'p', from: p, to: one, child: [wk, bk, one] });
      if (rank(p) === 1) {
        const two = p + 16;
        if (two !== wk && two !== bk) out.push({ kind: 'p', from: p, to: two, child: [wk, bk, two] });
      }
    }
  }
  return out;
}
function blackMoves(wk, bk, p) {
  const out = []; // {to, capture?, child?}
  for (const t of kingAdj[bk]) {
    if (dist(t, wk) <= 1) continue;
    if (t === p) { if (dist(p, wk) > 1) out.push({ from: bk, to: t, capture: true }); continue; }
    if (pawnAttacks(p, t)) continue;
    out.push({ from: bk, to: t, child: [wk, t, p] });
  }
  return out;
}

const dtc = new Int16Array(N * N * N * 2);
let level = 0, quiet = 0;
while (quiet < 2) {
  level++;
  let assigned = 0;
  const stm = level % 2 === 1 ? 0 : 1; // white wins at odd plies, black-to-move wins at even
  for (let wk = 0; wk < N; wk++) for (let bk = 0; bk < N; bk++) for (let p = 8; p < 56; p++) {
    if (!legal(wk, bk, p, stm)) continue;
    const i = idx(wk, bk, p, stm);
    if (dtc[i]) continue;
    if (stm === 0) {
      for (const m of whiteMoves(wk, bk, p)) {
        if (m.kind === 'promo') { if (m.result === 'win' && level === 1) { dtc[i] = 1; break; } continue; }
        // checkmate by a quiet move (very rare in KPK)
        const c = dtc[idx(m.child[0], m.child[1], m.child[2], 1)];
        if (c === level - 1 && c > 0) { dtc[i] = level; break; }
        if (level === 1) {
          const bm = blackMoves(...m.child);
          if (!bm.length && pawnAttacks(m.child[2], m.child[1])) { dtc[i] = 1; break; }
        }
      }
    } else {
      const ms = blackMoves(wk, bk, p);
      if (!ms.length) continue; // stalemate (or mate handled on white side)
      let worst = 0, ok = true;
      for (const m of ms) {
        if (m.capture) { ok = false; break; }
        const c = dtc[idx(m.child[0], m.child[1], m.child[2], 0)];
        if (!c || c >= level) { ok = false; break; }
        worst = Math.max(worst, c);
      }
      if (ok && worst === level - 1) dtc[i] = level;
    }
    if (dtc[i]) assigned++;
  }
  quiet = assigned ? 0 : quiet + 1;
}

// ---------- FEN interface (handles a black pawn by flipping the board) ----------
const sqName = (s) => 'abcdefgh'[file(s)] + (rank(s) + 1);
const sqIdx = (n) => (n.charCodeAt(1) - 49) * 8 + (n.charCodeAt(0) - 97);
function parseFen(fen) {
  const [board, turn] = fen.split(' ');
  const pcs = {};
  board.split('/').forEach((row, ri) => {
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) f += +ch;
      else { pcs[ch] = (7 - ri) * 8 + f; f++; }
    }
  });
  return { pcs, turn };
}
/** Normalised view: attacker = pawn side as "white". */
function normalise(fen) {
  const { pcs, turn } = parseFen(fen);
  if (pcs.P !== undefined) return { wk: pcs.K, bk: pcs.k, p: pcs.P, stm: turn === 'w' ? 0 : 1, flipped: false };
  if (pcs.p !== undefined) return { wk: pcs.k ^ 56, bk: pcs.K ^ 56, p: pcs.p ^ 56, stm: turn === 'b' ? 0 : 1, flipped: true };
  return null;
}
/** Result for the side TO MOVE: { result: 'win'|'draw'|'loss', dtc } */
function probe(fen) {
  const n = normalise(fen);
  if (!n) return { result: 'draw', dtc: 0 }; // bare kings
  if (!legal(n.wk, n.bk, n.p, n.stm)) throw new Error('illegal/unsupported position ' + fen);
  const v = dtc[idx(n.wk, n.bk, n.p, n.stm)];
  if (!v) return { result: 'draw', dtc: 0, attackerToMove: n.stm === 0 };
  return { result: n.stm === 0 ? 'win' : 'loss', dtc: v, attackerToMove: n.stm === 0 };
}
module.exports = { probe, promotionResult, sqName, sqIdx, normalise, dist, file, rank, levels: level, dtc, idx, legal, whiteMoves, blackMoves, pawnAttacks };
