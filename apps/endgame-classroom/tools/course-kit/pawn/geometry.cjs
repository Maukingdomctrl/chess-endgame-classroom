// Board geometry for White's pawns against the lone black king, shared by the search, the notes and the
// checker. A position is a square list in the solver's table order: [white king, black king, pawn, pawn],
// with -1 for a pawn that has been taken. White's pawns move up (towards rank 8).
const { file, rank, dist } = require('../board.cjs');

/** The pawns still on the board. */
const pawns = (s) => (s[3] === undefined || s[3] < 0 ? [s[2]] : [s[2], s[3]]);
/** The most advanced pawn (the first one listed when both stand on the same rank). */
const front = (s) => pawns(s).reduce((a, b) => (rank(b) > rank(a) ? b : a));
/** The square a pawn promotes on. */
const queenSq = (p) => 56 + file(p);
/** Does a white pawn on q protect square p (diagonally in front of it)? */
const pawnGuards = (q, p) => rank(p) === rank(q) + 1 && Math.abs(file(p) - file(q)) === 1;
/** Can the black king take the pawn on p next move (next to it and not protected)? */
const hangs = (s, p) => dist(s[1], p) === 1 && !(dist(s[0], p) === 1 || pawns(s).some((q) => q !== p && pawnGuards(q, p)));
/** The white king's distance to its nearest pawn (two pawns). */
const kingToPawns = (s) => Math.min(dist(s[0], s[2]), dist(s[0], s[3]));
/** Two pawns on neighbouring files, at most one rank apart. */
const connected = (s) => Math.abs(file(s[2]) - file(s[3])) === 1 && Math.abs(rank(s[2]) - rank(s[3])) <= 1;
const sideBySide = (s) => rank(s[2]) === rank(s[3]);
/** The black king stands in front of the pawns: further up, on their files or next to them. */
const blocks = (s) => rank(s[1]) > Math.max(rank(s[2]), rank(s[3])) &&
  file(s[1]) >= Math.min(file(s[2]), file(s[3])) - 1 && file(s[1]) <= Math.max(file(s[2]), file(s[3])) + 1;
/** The black king within d squares of a pawn. */
const kingNear = (s, d = 2) => pawns(s).some((p) => dist(s[1], p) <= d);
/** The white king takes no part: it controls no square on the pawns' way to the 8th rank. */
const kingAway = (s) => pawns(s).every((p) => { for (let t = p + 8; t < 64; t += 8) if (dist(s[0], t) < 2) return false; return true; });
/** The rule of the square with White to move (the pawn steps first): can the black king still catch a lone pawn on p? */
const catches = (bk, p) => dist(bk, queenSq(p)) <= 7 - rank(p);
/**
 * Key squares of a white pawn on p: if the white king stands on one, the pawn promotes whatever Black does
 * (rook pawns aside: the two squares on the next file at the edge). A pawn on rank 2-4: the three squares
 * two ranks ahead; rank 5-6: the three squares one and two ranks ahead.
 */
function keySquares(p) {
  const f = file(p), r = rank(p), out = [];
  if (f === 0) return [6 * 8 + 1, 7 * 8 + 1]; // a-pawn: b7, b8
  if (f === 7) return [6 * 8 + 6, 7 * 8 + 6]; // h-pawn: g7, g8
  const rows = r <= 3 ? [r + 2] : r <= 5 ? [r + 1, r + 2] : [];
  for (const rr of rows) for (let ff = f - 1; ff <= f + 1; ff++) if (rr < 8) out.push(rr * 8 + ff);
  return out;
}
/** The same position with files a <-> h exchanged. */
const mirror = (s) => s.map((q) => (q < 0 ? q : q ^ 7));

module.exports = { pawns, front, queenSq, pawnGuards, hangs, kingToPawns, connected, sideBySide, blocks, kingNear, kingAway, catches, keySquares, mirror };
