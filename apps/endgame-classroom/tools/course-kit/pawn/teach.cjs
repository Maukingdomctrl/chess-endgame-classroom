// Facts for notes and board marks, read from a FEN with chess.js: who stands where, who protects what,
// which squares the black king has, which moves would stalemate. The wording of a course stays in its
// own pgnout.cjs; these helpers only make sure every note states what is true on the board.
const { Chess } = require('chess.js');
const { file, rank, dist, sqName: n, sqIdx } = require('../board.cjs');
const { failedQueens } = require('./promotion.cjs');

/** { wk, bk, pawns: [...], piece (a promoted piece's square, or -1) } */
function pos(fen) {
  const g = new Chess(fen);
  const s = { wk: -1, bk: -1, pawns: [], piece: -1 };
  for (const row of g.board()) for (const p of row) {
    if (!p) continue;
    const sq = sqIdx(p.square);
    if (p.type === 'k') s[p.color === 'w' ? 'wk' : 'bk'] = sq;
    else if (p.type === 'p') s.pawns.push(sq);
    else s.piece = sq;
  }
  return s;
}
const fenAfter = (fen, san) => { const g = new Chess(fen); g.move(san); return g.fen(); };
const queenSq = (p) => 56 + file(p);
const pawnName = (p) => `${'abcdefgh'[file(p)]}-pawn`;
/** Who protects square q: 'your king', 'the c-pawn', or '' (the king first). */
const protectedBy = (s, q) => {
  if (dist(s.wk, q) === 1) return 'your king';
  const guard = s.pawns.find((p) => p !== q && rank(q) === rank(p) + 1 && Math.abs(file(q) - file(p)) === 1);
  return guard !== undefined ? `the ${pawnName(guard)}` : '';
};
/** The rule of the square: can the black king (to move) still catch a lone pawn on p? */
const catches = (s, p) => dist(s.bk, queenSq(p)) <= 7 - rank(p);
/** Squares the black king could step to if it were Black's turn. */
function kingSquares(fen) {
  const parts = fen.split(' ');
  parts[1] = 'b'; parts[3] = '-';
  try { return [...new Set(new Chess(parts.join(' ')).moves({ verbose: true }).filter((m) => m.piece === 'k').map((m) => m.to))]; } catch { return []; }
}
/** The moves (chess.js, verbose) that would stalemate. */
const stalemateMoves = (fen) => new Chess(fen).moves({ verbose: true }).filter((m) => { const t = new Chess(fen); t.move(m.san); return t.isStalemate(); });
const orList = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}`);
/** Marks for a list of squares in one colour: ['Gd8', ...]. */
const sq = (list, c) => list.map((x) => `${c}${typeof x === 'number' ? n(x) : x}`);
/** One colour per square: the first one listed wins. */
function oneColourPerSquare(marks) {
  const seen = new Set();
  marks.squares = marks.squares.filter((x) => !seen.has(x.slice(1)) && seen.add(x.slice(1)));
  return marks;
}
/**
 * Arrows the app could not show: in Learn mode it draws the expected move as its own arrow and keeps one
 * arrow per pair of squares, so a mark on the same squares as the move to play disappears (e.g. a red
 * "b8=Q would be stalemate" arrow when the move is b8=R). Drops them; the note has to say it instead.
 */
function withoutHiddenArrows(marks, next) {
  if (next) marks.arrows = marks.arrows.filter((a) => a.slice(1) !== `${next.from}${next.to}`);
  return marks;
}
/** Sentences on the other pawn's queen moves that would fail, for the note on a promotion. */
const failedQueenNotes = (fen, from) => failedQueens(fen, from).map((x) =>
  (x.why === 'stalemate' ? `${x.san} would have been stalemate.` : `After ${x.san} the king would have taken the new queen.`));

module.exports = { pos, fenAfter, queenSq, pawnName, protectedBy, catches, kingSquares, stalemateMoves, orList, sq, oneColourPerSquare, withoutHiddenArrows, failedQueenNotes };
