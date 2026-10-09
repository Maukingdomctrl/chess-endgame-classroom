// Facts for notes and board marks, read from a FEN with chess.js: who stands where, who protects what,
// which squares the black king has, which moves would stalemate. The wording of a course stays in its
// own pgnout.cjs; these helpers only make sure every note states what is true on the board.
//
// pawnFacts(fen) gives the same knowledge as structured facts for the teaching layer (../teach/): each
// fact says only what the board shows. Who wins, and how fast, comes from the solver (../teach/outcome.cjs).
const { Chess } = require('chess.js');
const { file, rank, dist, sqName: n, sqIdx, directOpp, distantOpp, diagOpp } = require('../board.cjs');
const { failedQueens, safeByRule } = require('./promotion.cjs');
const { keySquares } = require('./geometry.cjs');

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
/** The rule of the square with White to move (the pawn steps first): can the black king still catch a lone pawn on p? */
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

/**
 * Facts about a pawn ending (White's pawns against the black king), read from the board alone:
 * [{ id, key (to compare two positions: a pawn is named by its file, so a pawn move keeps its facts' keys),
 *    side ('w' | 'b': whom it helps), ...details }].
 *   opposition      kind 'direct' | 'distant' | 'diagonal'; side = the king that does NOT have to move. Only
 *                   while the black king stands in front of a pawn and inside its square (it can still reach
 *                   the pawn's way): then the kings fight for the squares the pawn needs. Elsewhere (the pawn
 *                   simply runs, or the king is behind it) it is just geometry and not reported
 *   keySquare       the white king stands on a key square of a pawn (pawn, square)
 *   blockade        the black king stands in front of a pawn, on its file
 *   pawnAttacked    the black king is next to a pawn nobody protects
 *   pawnProtected   a pawn protected by the white king or the other pawn (by)
 *   outsideSquare   rule of the square: the black king cannot catch this pawn in a race (whoever is to move;
 *                   a double step counted), and its own king does not stand in its way (pawn)
 *   promotes        White to move can promote safely now
 *   stalemateTrap   White to move has moves that would stalemate (moves)
 *   stalemate       the position is stalemate
 */
function pawnFacts(fen) {
  const g = new Chess(fen);
  const s = pos(fen);
  const stm = g.turn();
  const facts = [];
  const has = stm === 'w' ? 'b' : 'w';
  const contested = []; // pawns whose way the black king can still reach, standing in front of them
  for (const p of s.pawns) {
    const pawn = n(p), f = pawn[0];
    if (keySquares(p).includes(s.wk)) facts.push({ id: 'keySquare', side: 'w', pawn, square: n(s.wk), key: `keySquare:${f}` });
    if (file(s.bk) === file(p) && rank(s.bk) > rank(p)) facts.push({ id: 'blockade', side: 'b', pawn, key: `blockade:${f}` });
    const by = protectedBy(s, p);
    if (by) facts.push({ id: 'pawnProtected', side: 'w', pawn, by, key: `pawnProtected:${f}` });
    else if (dist(s.bk, p) === 1) facts.push({ id: 'pawnAttacked', side: 'b', pawn, key: `pawnAttacked:${f}` });
    // the race: the pawn needs `need` moves (a double step saves one). With White to move the pawn steps
    // first, so the king must already be within `need` of the queening square; with Black to move it gets
    // one step more. A king on the pawn's way spoils the race.
    let clear = true;
    for (let t = p + 8; t < 64; t += 8) if (t === s.wk) clear = false;
    const double = rank(p) === 1 && !g.get(n(p + 8)) && !g.get(n(p + 16));
    const need = 7 - rank(p) - (double ? 1 : 0);
    const reach = stm === 'w' && !g.get(n(p + 8)) ? need : need + 1;
    const outside = dist(s.bk, queenSq(p)) > reach;
    if (clear && outside) facts.push({ id: 'outsideSquare', side: 'w', pawn, key: `outsideSquare:${f}` });
    if (!outside && rank(s.bk) > rank(p)) contested.push(p);
  }
  const kind = directOpp(s.wk, s.bk) ? 'direct' : distantOpp(s.wk, s.bk) ? 'distant' : diagOpp(s.wk, s.bk) ? 'diagonal' : '';
  if (kind && contested.length) facts.unshift({ id: 'opposition', kind, side: has, key: `opposition:${kind}:${has}` });
  if (stm === 'w') {
    if (g.moves({ verbose: true }).some((m) => { if (!m.promotion) return false; const t = new Chess(fen); return safeByRule(t, t.move(m.san)); })) facts.push({ id: 'promotes', side: 'w', key: 'promotes' });
    const traps = stalemateMoves(fen);
    if (traps.length) facts.push({ id: 'stalemateTrap', side: 'b', moves: traps.map((m) => m.san), key: 'stalemateTrap' });
  }
  if (g.isStalemate()) facts.push({ id: 'stalemate', side: 'b', key: 'stalemate' });
  return facts;
}

/**
 * The moves a player is likely to consider in a pawn ending (a heuristic, never used for correctness):
 * pawn pushes, and king moves that do not retreat (no further from the front pawn's queening square:
 * forward, or sideways round the other king). The same rule for either side: White with the pawns heads
 * for the queening square, the black king defends it. Used to find tempting mistakes and as a
 * difficulty signal.
 */
function plausibleMoves(fen) {
  const g = new Chess(fen);
  const s = pos(fen);
  if (!s.pawns.length) return g.moves();
  const goal = queenSq(s.pawns.reduce((a, b) => (rank(b) > rank(a) ? b : a)));
  return g.moves({ verbose: true }).filter((m) => m.piece === 'p' || dist(sqIdx(m.to), goal) <= dist(sqIdx(m.from), goal)).map((m) => m.san);
}

module.exports = { pos, fenAfter, queenSq, pawnName, protectedBy, catches, kingSquares, stalemateMoves, orList, sq, oneColourPerSquare, withoutHiddenArrows, failedQueenNotes, pawnFacts, plausibleMoves };
