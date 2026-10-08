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
/** The rule of the square: can the black king (to move) still catch a lone pawn on p? */
const catches = (bk, p) => dist(bk, queenSq(p)) <= 7 - rank(p);
/** The same position with files a <-> h exchanged. */
const mirror = (s) => s.map((q) => (q < 0 ? q : q ^ 7));

module.exports = { pawns, front, queenSq, pawnGuards, hangs, kingToPawns, connected, sideBySide, blocks, kingNear, kingAway, catches, mirror };
