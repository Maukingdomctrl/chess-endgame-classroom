// Exact solvers for King + Queen vs King and King + Rook vs King (retrograde analysis, < 1 s each).
// The strong side is always White. dtm = plies to checkmate with best play by both sides:
// White to move: odd number of plies (1 = mate in one); Black to move: even (0 = Black is mated).
// -1 = draw (only possible after a blunder: stalemate or the piece taken).
const N = 64;
const file = (s) => s & 7, rank = (s) => s >> 3;
const dist = (a, b) => Math.max(Math.abs(file(a) - file(b)), Math.abs(rank(a) - rank(b)));
const sqName = (s) => 'abcdefgh'[file(s)] + (rank(s) + 1);
const sqIdx = (n) => (n.charCodeAt(1) - 49) * 8 + (n.charCodeAt(0) - 97);
const kingAdj = [];
for (let s = 0; s < N; s++) {
  kingAdj[s] = [];
  for (let df = -1; df <= 1; df++) for (let dr = -1; dr <= 1; dr++) {
    if (!df && !dr) continue;
    const f = file(s) + df, r = rank(s) + dr;
    if (f >= 0 && f < 8 && r >= 0 && r < 8) kingAdj[s].push(r * 8 + f);
  }
}
const ROOK_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const QUEEN_DIRS = [...ROOK_DIRS, [1, 1], [1, -1], [-1, 1], [-1, -1]];

/** Squares the piece on x attacks, sliding until the edge or a blocker (blockers: array of squares). */
function rays(x, dirs, blockers) {
  const out = [];
  for (const [df, dr] of dirs) {
    let f = file(x) + df, r = rank(x) + dr;
    while (f >= 0 && f < 8 && r >= 0 && r < 8) {
      const t = r * 8 + f;
      out.push(t);
      if (blockers.includes(t)) break;
      f += df; r += dr;
    }
  }
  return out;
}

function makeSolver(piece) {
  const dirs = piece === 'q' ? QUEEN_DIRS : ROOK_DIRS;
  const idx = (wk, bk, x, stm) => ((wk * 64 + bk) * 64 + x) * 2 + stm; // stm 0 = White
  // Squares attacked by the piece with the white king as the only blocker: the black king does not
  // block (it cannot hide behind itself when it steps along the line).
  const attacked = (wk, x) => {
    const set = new Uint8Array(N);
    for (const t of rays(x, dirs, [wk])) set[t] = 1;
    return set;
  };
  const legal = (wk, bk, x, stm) => {
    if (wk === bk || wk === x || bk === x) return false;
    if (dist(wk, bk) <= 1) return false;
    if (stm === 0 && rays(x, dirs, [wk, bk]).includes(bk)) return false; // Black can't be in check on White's turn
    return true;
  };
  const inCheck = (wk, bk, x) => rays(x, dirs, [wk, bk]).includes(bk);
  /** Black's moves: { to, capture?, child? } */
  function blackMoves(wk, bk, x) {
    const att = attacked(wk, x);
    const out = [];
    for (const t of kingAdj[bk]) {
      if (dist(t, wk) <= 1) continue;
      if (t === x) { out.push({ from: bk, to: t, capture: true }); continue; } // x is unprotected (dist(t,wk) > 1)
      if (att[t]) continue;
      out.push({ from: bk, to: t, child: [wk, t, x] });
    }
    return out;
  }
  /** White's moves: { kind: 'k'|'x', from, to, child } */
  function whiteMoves(wk, bk, x) {
    const out = [];
    for (const t of kingAdj[wk]) {
      if (t === x || dist(t, bk) <= 1) continue;
      out.push({ kind: 'k', from: wk, to: t, child: [t, bk, x] });
    }
    for (const t of rays(x, dirs, [wk, bk])) {
      if (t === wk || t === bk) continue;
      out.push({ kind: 'x', from: x, to: t, child: [wk, bk, t] });
    }
    return out;
  }

  const dtm = new Int8Array(N * N * N * 2).fill(-1);
  // Black-to-move positions with no legal move: checkmate (dtm 0) or stalemate (stays a draw).
  for (let wk = 0; wk < N; wk++) for (let bk = 0; bk < N; bk++) for (let x = 0; x < N; x++) {
    if (!legal(wk, bk, x, 1)) continue;
    if (!blackMoves(wk, bk, x).length && inCheck(wk, bk, x)) dtm[idx(wk, bk, x, 1)] = 0;
  }
  let level = 0, quiet = 0;
  while (quiet < 2) {
    level++;
    let assigned = 0;
    const stm = level % 2 === 1 ? 0 : 1;
    for (let wk = 0; wk < N; wk++) for (let bk = 0; bk < N; bk++) for (let x = 0; x < N; x++) {
      const i = idx(wk, bk, x, stm);
      if (dtm[i] >= 0 || !legal(wk, bk, x, stm)) continue;
      if (stm === 0) {
        for (const m of whiteMoves(wk, bk, x)) {
          if (dtm[idx(m.child[0], m.child[1], m.child[2], 1)] === level - 1) { dtm[i] = level; break; }
        }
      } else {
        const ms = blackMoves(wk, bk, x);
        if (!ms.length) continue; // stalemate
        let worst = -1, ok = true;
        for (const m of ms) {
          if (m.capture) { ok = false; break; }
          const c = dtm[idx(m.child[0], m.child[1], m.child[2], 0)];
          if (c < 0) { ok = false; break; }
          worst = Math.max(worst, c);
        }
        if (ok && worst === level - 1) dtm[i] = level;
      }
      if (dtm[i] >= 0) assigned++;
    }
    quiet = assigned ? 0 : quiet + 1;
  }
  const val = (wk, bk, x, stm) => dtm[idx(wk, bk, x, stm)];
  return { piece, dirs, idx, dtm, val, legal, inCheck, attacked, whiteMoves, blackMoves, levels: level };
}

// ---------- FEN interface ----------
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

const solvers = {};
const solver = (piece) => (solvers[piece] ??= makeSolver(piece));

/** Exact result of a FEN with White K + Q/R against the bare black king: { result, dtm } for the side to move. */
function probe(fen) {
  const { pcs, turn } = parseFen(fen);
  const names = Object.keys(pcs).sort().join('');
  const piece = names === 'KQk' ? 'q' : names === 'KRk' ? 'r' : null;
  if (!piece) throw new Error('not KQK/KRK: ' + fen);
  const S = solver(piece);
  const x = pcs[piece.toUpperCase()], stm = turn === 'w' ? 0 : 1;
  if (!S.legal(pcs.K, pcs.k, x, stm)) throw new Error('illegal position ' + fen);
  const d = S.val(pcs.K, pcs.k, x, stm);
  if (d < 0) return { result: 'draw', dtm: -1 };
  return { result: stm === 0 ? 'win' : 'loss', dtm: d };
}

module.exports = { solver, probe, parseFen, sqName, sqIdx, file, rank, dist, kingAdj, rays };
