// Board helpers shared by the course generators. A square is a number 0..63 = rank * 8 + file (a1 = 0, h8 = 63).
const file = (s) => s & 7, rank = (s) => s >> 3;
const dist = (a, b) => Math.max(Math.abs(file(a) - file(b)), Math.abs(rank(a) - rank(b)));
const sqName = (s) => 'abcdefgh'[file(s)] + (rank(s) + 1);
const sqIdx = (n) => (n.charCodeAt(1) - 49) * 8 + (n.charCodeAt(0) - 97);

const kingAdj = [], knightAdj = [];
for (let s = 0; s < 64; s++) {
  kingAdj[s] = [];
  knightAdj[s] = [];
  for (let df = -2; df <= 2; df++) for (let dr = -2; dr <= 2; dr++) {
    const f = file(s) + df, r = rank(s) + dr;
    if (f < 0 || f > 7 || r < 0 || r > 7) continue;
    if (Math.max(Math.abs(df), Math.abs(dr)) === 1) kingAdj[s].push(r * 8 + f);
    if (Math.abs(df * dr) === 2) knightAdj[s].push(r * 8 + f);
  }
}
const ROOK_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISHOP_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const QUEEN_DIRS = [...ROOK_DIRS, ...BISHOP_DIRS];
/** Squares a slider on x attacks, up to the edge or the first blocker (blockers: array of squares). */
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

// ---------- geometry the lessons talk about ----------
/** Ring of a square counted from the centre: 0 = d4/e4/d5/e5 ... 3 = the edge. */
const ring = (s) => Math.max(Math.abs(file(s) - 3.5), Math.abs(rank(s) - 3.5)) - 0.5;
const onEdge = (s) => ring(s) === 3;
const isCorner = (s) => (file(s) === 0 || file(s) === 7) && (rank(s) === 0 || rank(s) === 7);
/** Kings on the same file or rank with one square between them. */
const directOpp = (a, b) =>
  (file(a) === file(b) && Math.abs(rank(a) - rank(b)) === 2) || (rank(a) === rank(b) && Math.abs(file(a) - file(b)) === 2);
/** Kings on the same file or rank with three or five squares between them. */
const distantOpp = (a, b) =>
  (file(a) === file(b) && [4, 6].includes(Math.abs(rank(a) - rank(b)))) ||
  (rank(a) === rank(b) && [4, 6].includes(Math.abs(file(a) - file(b))));
/** Kings on the same diagonal with one square between them. */
const diagOpp = (a, b) => Math.abs(file(a) - file(b)) === 2 && Math.abs(rank(a) - rank(b)) === 2;
const knightJump = (a, b) => {
  const df = Math.abs(file(a) - file(b)), dr = Math.abs(rank(a) - rank(b));
  return (df === 1 && dr === 2) || (df === 2 && dr === 1);
};

// ---------- symmetry: the same position mirrored or rotated ----------
/** The 8 symmetries of the board (pawnless positions); the first one is the identity. */
const SYM8 = [];
for (const fx of [0, 1]) for (const fy of [0, 1]) for (const tr of [0, 1])
  SYM8.push((s) => { let f = file(s), r = rank(s); if (tr) [f, r] = [r, f]; if (fx) f = 7 - f; if (fy) r = 7 - r; return r * 8 + f; });
/** A key that is the same for all 8 symmetric versions of a set of squares (in this order). */
const canon8 = (...sqs) => SYM8.map((t) => sqs.map(t).join('-')).sort()[0];
/** The same for positions with pawns: only the left-right mirror keeps the rules. */
const canon2 = (...sqs) => [sqs, sqs.map((s) => s ^ 7)].map((a) => a.join('-')).sort()[0];

// ---------- FEN ----------
/** Pieces of a FEN: [{ ch: 'K', sq }, ...] in board order (a8 .. h1), plus the side to move. */
function parseFen(fen) {
  const [board, turn] = fen.split(' ');
  const pieces = [];
  board.split('/').forEach((row, ri) => {
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) f += +ch;
      else { pieces.push({ ch, sq: (7 - ri) * 8 + f }); f++; }
    }
  });
  // pcs: piece letter -> square (for positions with at most one piece of each kind)
  const pcs = {};
  for (const p of pieces) pcs[p.ch] = p.sq;
  return { pieces, pcs, turn };
}
/** Board part of a FEN from [[square, 'K'], [square, 'k'], ...]. */
function boardFen(list) {
  const b = Array(64).fill(null);
  for (const [sq, c] of list) b[sq] = c;
  const rows = [];
  for (let r = 7; r >= 0; r--) {
    let row = '', e = 0;
    for (let f = 0; f < 8; f++) { const c = b[r * 8 + f]; if (!c) e++; else { if (e) row += e; e = 0; row += c; } }
    if (e) row += e;
    rows.push(row);
  }
  return rows.join('/');
}

module.exports = {
  file, rank, dist, sqName, sqIdx, kingAdj, knightAdj, ROOK_DIRS, BISHOP_DIRS, QUEEN_DIRS, rays,
  ring, onEdge, isCorner, directOpp, distantOpp, diagOpp, knightJump, SYM8, canon8, canon2, parseFen, boardFen,
};
