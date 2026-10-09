// Exact outcomes of moves, from the course's own measure (../verify.cjs with the course's verify-opts):
// the same numbers that decide which move a line plays and which moves go into [%also]. Nothing here
// knows about pawns, kings or any chess idea; it only asks the solver.
//
//   moveOutcomes(fen, opts)    every move of the side to move (the learner), classified against the fastest
//   replyOutcomes(fen, opts)   every reply of the opponent: the most stubborn, shorter, or one that escapes
//   resultFor(fen, opts, learner)   'win' | 'draw' | 'loss' for the learner, with the plies the measure gives
//   zugzwang(fen, opts, learner)    the side to move would rather pass: having to move changes its result
//
// Two modes. 'win' (the learner can win): kinds of a learner move:
//   best     a fastest win: exactly verify.fastestMoves (the line's move and its [%also])
//   slower   still a win by the measure, delta plies slower (delta null when the two are measured in
//            different phases, e.g. one promotes now and the other later)
//   draws    no win any more, and the measure gives a draw (stalemate, insufficient material, or the solver)
//   loses    the opponent now wins
//   notGoal  goal 'promotion' only: a promotion the course does not count (a bishop or knight, or a piece
//            the king can take at once) whose result the measure cannot tell (another pawn is still there)
// "draw" under goal 'promotion' means: no safe promotion can be forced (for one pawn, a draw).
// 'hold' (the learner cannot win, e.g. a defending lesson): best = the moves that keep the draw (all of
// them are equally good), loses = the opponent now wins. If every move loses: best = the longest
// resistance, slower = loses sooner (delta plies).
const { Chess } = require('chess.js');
const { afterLearner, afterOpponent, cmp } = require('../verify.cjs');

const hasPawn = (fen) => /p/i.test(fen.split(' ')[0]);
const pawnPhase = (fen) => hasPawn(fen) && !/[qrbn]/i.test(fen.split(' ')[0]);
const fenAfter = (fen, san) => { const g = new Chess(fen); g.move(san); return g.fen(); };

/**
 * Result for the learner in a position where the opponent is to move and afterLearner gave no win:
 * { kind: 'draws' | 'loses' | 'notGoal', why: 'stalemate' | 'insufficient' | 'underpromotion' | 'pieceTaken' | 'measure' }.
 */
function notWin(fen, opts) {
  const g = new Chess(fen);
  if (g.isStalemate()) return { kind: 'draws', why: 'stalemate' };
  if (g.isInsufficientMaterial()) return { kind: 'draws', why: 'insufficient' };
  if (opts.goal === 'promotion' && hasPawn(fen) && !pawnPhase(fen)) {
    const why = /[BN]/.test(fen.split(' ')[0]) ? 'underpromotion' : 'pieceTaken';
    // the new piece taken, and only the kings left: that is a draw whatever the measure
    const bare = why === 'pieceTaken' && g.moves({ verbose: true }).some((m) => m.captured && m.captured !== 'p' && new Chess(fenAfter(fen, m.san)).isInsufficientMaterial());
    return { kind: bare ? 'draws' : 'notGoal', why };
  }
  if (opts.goal === 'promotion' && pawnPhase(fen)) return { kind: 'draws', why: 'measure' }; // the lone king cannot win
  return { kind: opts.probe(fen).result === 'win' ? 'loses' : 'draws', why: 'measure' };
}

/**
 * Every legal move of the side to move, measured as verify.cjs measures a learner move.
 * Returns { learner, best (sort key of the fastest win, or null), moves: [{ san, from, to, piece, captured,
 * promotion, fen (after), value (sort key | null), kind, delta, why }] } in chess.js move order.
 */
function moveOutcomes(fen, opts) {
  const g = new Chess(fen);
  const moves = g.moves({ verbose: true }).map((m) => {
    const after = fenAfter(fen, m.san);
    return { san: m.san, from: m.from, to: m.to, piece: m.piece, captured: m.captured ?? null, promotion: m.promotion ?? null, fen: after, value: afterLearner(after, opts) };
  });
  const wins = moves.filter((x) => x.value).sort((a, b) => cmp(a.value, b.value));
  if (!wins.length) return holdOutcomes(g.turn(), moves, opts);
  const best = wins[0].value;
  for (const x of moves) {
    if (x.value) {
      const c = cmp(x.value, best);
      Object.assign(x, c === 0 ? { kind: 'best', delta: 0, why: null } : { kind: 'slower', delta: x.value[0] === best[0] ? x.value[1] - best[1] : null, why: null });
    } else Object.assign(x, { delta: null }, notWin(x.fen, opts));
  }
  return { learner: g.turn(), mode: 'win', best, moves };
}
/** The learner cannot win: which moves keep the draw (value = null), and how fast the others lose (value = the opponent's plies). */
function holdOutcomes(learner, moves, opts) {
  for (const x of moves) {
    const r = resultFor(x.fen, opts, learner);
    x.value = r.result === 'loss' ? r.plies : null;
    x.result = r.result;
  }
  const holds = moves.filter((x) => x.result !== 'loss');
  if (holds.length) {
    for (const x of moves) Object.assign(x, x.result !== 'loss' ? { kind: 'best', delta: 0, why: null } : { kind: 'loses', delta: null, why: 'measure' });
    return { learner, mode: 'hold', best: 'draw', moves };
  }
  const longest = Math.max(...moves.map((x) => x.value));
  for (const x of moves) Object.assign(x, x.value === longest ? { kind: 'best', delta: 0, why: null } : { kind: 'slower', delta: longest - x.value, why: null });
  return { learner, mode: 'resist', best: longest, moves };
}

/**
 * Every reply of the opponent (to move in fen), measured as verify.cjs measures a defence: the plies the
 * learner still needs. kind 'stubborn' (the longest), 'shorter' (delta plies shorter) or 'escapes' (the
 * learner no longer wins: the move before it was a mistake).
 */
function replyOutcomes(fen, opts) {
  const g = new Chess(fen);
  const replies = g.moves({ verbose: true }).map((m) => {
    const after = fenAfter(fen, m.san);
    return { san: m.san, from: m.from, to: m.to, piece: m.piece, captured: m.captured ?? null, fen: after, value: afterOpponent(after, opts) };
  });
  const longest = Math.max(-1, ...replies.map((r) => r.value ?? -1));
  for (const r of replies) Object.assign(r, r.value === null ? { kind: 'escapes', delta: null } : r.value === longest ? { kind: 'stubborn', delta: 0 } : { kind: 'shorter', delta: longest - r.value });
  return replies;
}

/**
 * The learner's result in fen, whoever is to move and whichever side has the material:
 * { result: 'win' | 'draw' | 'loss' | 'unknown', plies (the winner's, by the measure) }. 'unknown': goal
 * 'promotion' right after a promotion the measure does not count, with a pawn still on the board.
 */
function resultFor(fen, opts, learner) {
  const g = new Chess(fen);
  const stm = g.turn();
  let winner = null, plies = null;
  if (g.isCheckmate()) { winner = stm === 'w' ? 'b' : 'w'; plies = 0; }
  else if (!g.isStalemate() && !g.isInsufficientMaterial()) {
    const v = afterOpponent(fen, opts); // the side to move wins in v plies
    if (v !== null) { winner = stm; plies = v; } else {
      const w = afterLearner(fen, opts); // the side that just moved wins
      if (w) { winner = stm === 'w' ? 'b' : 'w'; plies = w[1]; }
    }
  }
  if (!winner) {
    const off = !g.isGameOver() && opts.goal === 'promotion' && hasPawn(fen) && !pawnPhase(fen);
    return { result: off ? 'unknown' : 'draw', plies: null };
  }
  return { result: winner === learner ? 'win' : 'loss', plies };
}

const RANK = { win: 2, unknown: 1, draw: 1, loss: 0 };
/** The same position with the other side to move, or null when that is not legal (the side to move is in check). */
function passed(fen) {
  const g = new Chess(fen);
  if (g.inCheck()) return null;
  const parts = fen.split(' ');
  parts[1] = parts[1] === 'w' ? 'b' : 'w';
  parts[3] = '-';
  try { const t = new Chess(parts.join(' ')); return t.fen(); } catch { return null; }
}
/**
 * Zugzwang, solver-backed: the side to move would get a better result if it could pass. Compares the
 * learner's result with the side to move as it is and with the move handed over (only when that position is
 * legal). Returns null, or { side (in zugzwang), withMove, ifPassed } (results for the learner).
 */
function zugzwang(fen, opts, learner) {
  const flip = passed(fen);
  if (!flip) return null;
  const stm = new Chess(fen).turn();
  const a = resultFor(fen, opts, learner).result, b = resultFor(flip, opts, learner).result;
  if (a === 'unknown' || b === 'unknown' || a === b) return null;
  // the side to move suffers from moving: worse for it with the move than without
  const worseForStm = stm === learner ? RANK[a] < RANK[b] : RANK[a] > RANK[b];
  return worseForStm ? { side: stm, withMove: a, ifPassed: b } : null;
}

module.exports = { moveOutcomes, replyOutcomes, resultFor, zugzwang, passed, fenAfter, pawnPhase };
