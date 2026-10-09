// Checks a course line move by move on its real FENs with chess.js and an exact solver. A course runs it
// twice: on the generated lines, and on the PGN file read back from disk.
//
// The learner is the side to move in the line's start position (or opts.learner: 'w' | 'b', for a line
// that starts with the opponent's move, e.g. "Black must move and give way"). A learner move must be a fastest win,
// its [%also] list must be exactly the other equally fast moves, every opponent move must be the most
// stubborn defence, and the line must end in checkmate (or, with goal 'promotion', a safe promotion).
//
// opts.probe(fen) -> { result: 'win' | 'loss' | 'draw', dtm }: exact value for the side to move, dtm in
//   plies to mate (the toolkit's solver.cjs).
// opts.goal: 'mate' (default) or 'promotion': while only the kings and pawns are on the board, "fastest"
//   means the quickest safe promotion, then the piece that mates fastest.
// opts.promotionProbe(fen) -> { result, dtc }: the measure for goal 'promotion' (dtc = plies to a safe
//   promotion). Default: ../kpk-course/kpk.cjs (K+P vs K); solver.cjs's probePromotion covers two pawns.
// opts.goal 'conversion' (any material up to five pieces, the learner is White): "fastest" means the quickest
//   capture or promotion after which the position is still won (by opts.probe, the mate measure), or mate;
//   the line ends with that move. opts.conversionProbe(fen) -> { result, dtc } (dtc = plies until White
//   converts; default: solver.cjs's probeConversion). Black's captures do not end the line.
// The fifty-move rule is not part of the measures (the tables ignore it): a line in which 100 plies pass
// without a capture or a pawn move (counted from the FEN's halfmove clock) is a problem, because the
// defender could claim a draw there (five-piece wins can need more, e.g. two bishops against a knight).
// opts.objective: 'win' (default, all of the above), 'hold' or 'auto'.
//   'hold' (a drawn position, e.g. defending against a pawn): every learner move must keep the draw (after it
//   the opponent cannot win, by the same measure), its [%also] must be exactly the other moves that keep it
//   (a draw is a draw: they are all equally good), every opponent move must be the opponent's best play (it
//   never lets the learner win), and the line must end in a draw on the board: stalemate, insufficient
//   material, threefold repetition, or the last pawn taken with a draw left by the measure (K+R vs K+R
//   after the pawn: the same as insufficient material when only kings and pawns are on the board).
//   'auto': 'win' when the learner can win from the start position, 'hold' when it is a draw (either side to
//   move); a lost start position is a problem. For a course with both kinds of line. With goal 'conversion'
//   (White's wins only) a holding line is measured by the mate tables (opts.probe).
const { Chess } = require('chess.js');

let kpk; // loaded on first use: the King & Pawn solver
const hasPawn = (fen) => /p/i.test(fen.split(' ')[0]);
/** Only kings and pawns on the board: the part of a line measured to the promotion. */
const pawnPhase = (fen) => hasPawn(fen) && !/[qrbn]/i.test(fen.split(' ')[0]);
/** After a promotion (the opponent to move): can the new piece (the only one besides kings and pawns) be taken? */
const newPieceTaken = (g) => g.moves({ verbose: true }).some((m) => m.captured && m.captured !== 'p');
const promotionProbe = (opts) => opts.promotionProbe ?? (kpk ??= require('../kpk-course/kpk.cjs')).probe;
const conversionProbe = (opts) => opts.conversionProbe ?? require('./solver.cjs').probeConversion;
/** Goal 'conversion': is the learner's move (chess.js move) a capture or promotion that keeps the win? fen: after it. */
const converts = (fen, opts, move) => !!move && !!(move.captured || move.promotion) && opts.probe(fen).result === 'loss';
const cmp = (a, b) => a[0] - b[0] || a[1] - b[1];

/**
 * Value of the position after a learner move (the opponent to move), as a sort key: lower = faster.
 * [0, plies] mate or a won position (plies to mate), [1, plies] a K+P win measured to the promotion
 * (goal 'promotion'), null = no longer a win (stalemate, draw, loss).
 */
function afterLearner(fen, opts, move) {
  const g = new Chess(fen);
  if (g.isCheckmate()) return [0, 0];
  if (g.isStalemate() || g.isInsufficientMaterial()) return null;
  if (opts.goal === 'conversion') {
    // a capture or promotion ends the line when it keeps the win (a losing one is no win); without the move
    // (the position alone) it is measured from here on
    if (move && (move.captured || move.promotion)) return converts(fen, opts, move) ? [0, 0] : null;
    const r = conversionProbe(opts)(fen);
    return r.result === 'loss' ? [0, r.dtc] : null;
  }
  // goal 'promotion' with a pawn left: a promotion only counts when it makes a queen or a rook that cannot
  // be taken at once (a bishop or a knight is not the goal; without a pawn left they never win anyway)
  if (opts.goal === 'promotion' && hasPawn(fen) && !pawnPhase(fen) && (/[BN]/.test(fen.split(' ')[0]) || newPieceTaken(g))) return null;
  if (opts.goal === 'promotion' && pawnPhase(fen)) {
    const r = promotionProbe(opts)(fen);
    return r.result === 'loss' ? [1, r.dtc] : null;
  }
  const r = opts.probe(fen);
  return r.result === 'loss' ? [0, r.dtm] : null;
}
/** Value of the position after an opponent move (the learner to move): plies the learner still needs; null = no longer a win. */
function afterOpponent(fen, opts) {
  const g = new Chess(fen);
  if (g.isInsufficientMaterial()) return null;
  if (opts.goal === 'conversion') {
    const r = conversionProbe(opts)(fen);
    return r.result === 'win' ? r.dtc : null;
  }
  if (opts.goal === 'promotion' && pawnPhase(fen)) {
    const r = promotionProbe(opts)(fen);
    return r.result === 'win' ? r.dtc : null;
  }
  const r = opts.probe(fen);
  return r.result === 'win' ? r.dtm : null;
}

/** All fastest learner moves in a position (SAN). The line's move and its [%also] must be exactly these. */
function fastestMoves(fen, opts) {
  const vals = new Chess(fen).moves().map((san) => { const t = new Chess(fen); const mv = t.move(san); return { san, v: afterLearner(t.fen(), opts, mv) }; }).filter((x) => x.v);
  vals.sort((a, b) => cmp(a.v, b.v));
  return vals.length ? vals.filter((x) => cmp(x.v, vals[0].v) === 0).map((x) => x.san) : [];
}

/** The side to move wins by the measure (opponent or learner alike: afterOpponent reads the side to move). */
const stmWins = (fen, opts) => afterOpponent(fen, opts) !== null;
/**
 * All learner moves that keep the draw (SAN): after them the opponent cannot win. In a drawn position a
 * holding line's move and its [%also] must be exactly these.
 */
function holdingMoves(fen, opts) {
  return new Chess(fen).moves().filter((san) => { const t = new Chess(fen); t.move(san); return !stmWins(t.fen(), opts); });
}
/** The result of fen for the learner with best play: 'win' | 'draw' | 'loss'. */
function resultFor(fen, opts, learner) {
  const g = new Chess(fen);
  if (g.isCheckmate()) return g.turn() === learner ? 'loss' : 'win';
  if (g.isStalemate() || g.isInsufficientMaterial()) return 'draw';
  if (stmWins(fen, opts)) return g.turn() === learner ? 'win' : 'loss';
  if (afterLearner(fen, opts)) return g.turn() === learner ? 'loss' : 'win'; // the side that just moved wins
  return 'draw';
}
/** The objective of a line from its start: 'win' or 'hold' (opts.objective 'auto'), or null when it is lost. */
function objectiveOf(line, opts, learner) {
  if (opts.objective !== 'auto') return opts.objective ?? 'win';
  const r = resultFor(line.fen, opts, learner);
  return r === 'win' ? 'win' : r === 'draw' ? 'hold' : null;
}
const drawnOnBoard = (g) => g.isStalemate() || g.isInsufficientMaterial() || g.isThreefoldRepetition();
/**
 * A holding line's end: a draw on the board, or the last pawn taken with a draw left by the tables (rook
 * endings: K+R vs K+R is no dead position, but the pawn is gone and nothing is left to defend). With only
 * kings and pawns the two are the same: taking the last pawn leaves the bare kings.
 */
function holdEnded(g, opts, learner, startPawns) {
  if (drawnOnBoard(g)) return true;
  return startPawns && !hasPawn(g.fen()) && !g.isCheckmate() && resultFor(g.fen(), opts, learner) === 'draw';
}

/** The 'hold' objective (see the header): the learner keeps the draw against the opponent's best play. */
function verifyHold(line, opts, g, learner) {
  const startPawns = hasPawn(line.fen);
  const problems = [];
  const unique = [];
  const start = resultFor(line.fen, opts, learner);
  if (start !== 'draw') problems.push(`${line.fen}: not a draw with best play (the learner ${start === 'win' ? 'wins' : 'loses'})`);
  for (const m of line.moves) {
    const fen = g.fen();
    if (holdEnded(g, opts, learner, startPawns)) { problems.push(`${fen}: the game is already drawn on the board before ${m.san}`); return { problems, unique }; }
    if (g.turn() === learner) {
      const holding = holdingMoves(fen, opts);
      if (!holding.includes(m.san)) problems.push(`${fen}: ${m.san} does not hold the draw (holding: ${holding.join(',') || 'none'})`);
      for (const a of m.also ?? []) if (!holding.includes(a)) problems.push(`${fen}: [%also] ${a} does not hold the draw`);
      const missing = holding.filter((s) => s !== m.san && !(m.also ?? []).includes(s));
      if (missing.length) problems.push(`${fen}: [%also] for ${m.san} misses ${missing.join(',')}`);
      unique.push(holding.length === 1);
    } else {
      // the opponent's best play: whatever it tries, it never lets the learner win
      const t = new Chess(fen);
      try { t.move(m.san); } catch { /* reported below */ }
      if (t.fen() !== fen && resultFor(t.fen(), opts, learner) === 'win') problems.push(`${fen}: ${m.san} lets the learner win: not the opponent's best play`);
      if (m.also?.length) problems.push(`${fen}: [%also] on a move of the opponent`);
    }
    try { g.move(m.san); } catch { problems.push(`${fen}: illegal move ${m.san}`); return { problems, unique }; }
  }
  if (!holdEnded(g, opts, learner, startPawns)) problems.push(`does not end in a draw on the board (stalemate, insufficient material, repetition, or the last pawn taken into a draw): ${g.fen()}`);
  return { problems, unique };
}

/** The fifty-move rule along a line: a problem when 100 plies pass without a capture or a pawn move. */
function fiftyMoves(line) {
  let g;
  try { g = new Chess(line.fen); } catch { return null; }
  for (const m of line.moves) {
    try { g.move(m.san); } catch { return null; } // illegal moves are reported by the line check
    if (Number(g.fen().split(' ')[4]) >= 100) return `${g.fen()}: 50 moves without a capture or a pawn move (the fifty-move rule: a draw can be claimed)`;
  }
  return null;
}

/** line: { fen, moves: [{ san, also }] }. Returns { problems: [...], unique: [bool per learner move] }. */
function verifyLine(line, opts) {
  const r = verifyLineMoves(line, opts);
  const fifty = fiftyMoves(line);
  if (fifty) r.problems.push(fifty);
  return r;
}
function verifyLineMoves(line, opts) {
  const problems = [];
  const unique = [];
  let g;
  try { g = new Chess(line.fen); } catch (e) { return { problems: [`bad FEN ${line.fen}: ${e.message}`], unique }; }
  const learner = opts.learner ?? g.turn();
  const objective = objectiveOf(line, opts, learner);
  if (!objective) return { problems: [`${line.fen}: lost for the learner with best play: neither a win nor a draw to hold`], unique };
  // the conversion goal measures White's wins only: a draw to hold is measured by the mate tables
  if (objective === 'hold') return verifyHold(line, opts.goal === 'conversion' ? { ...opts, goal: 'mate' } : opts, g, learner);
  const pawnLine = hasPawn(line.fen);
  let converted = false;
  for (const m of line.moves) {
    const fen = g.fen();
    if (converted) { problems.push(`${fen}: the line goes on after the learner's conversion`); break; }
    if (g.turn() === learner) {
      const fastest = fastestMoves(fen, opts);
      if (!fastest.includes(m.san)) problems.push(`${fen}: ${m.san} is not a fastest win (fastest: ${fastest.join(',') || 'none'})`);
      for (const a of m.also ?? []) if (!fastest.includes(a)) problems.push(`${fen}: [%also] ${a} is not as fast as ${m.san}`);
      const missing = fastest.filter((s) => s !== m.san && !(m.also ?? []).includes(s));
      if (missing.length) problems.push(`${fen}: [%also] for ${m.san} misses ${missing.join(',')}`);
      unique.push(fastest.length === 1);
    } else {
      const vals = g.moves().map((san) => { const t = new Chess(fen); t.move(san); return { san, v: afterOpponent(t.fen(), opts) }; });
      if (vals.some((x) => x.v === null)) problems.push(`${fen}: the opponent can escape (${vals.filter((x) => x.v === null).map((x) => x.san).join(',')})`);
      const longest = Math.max(...vals.map((x) => x.v ?? -1));
      const mine = vals.find((x) => x.san === m.san);
      if (!mine || mine.v !== longest) problems.push(`${fen}: ${m.san} is not the most stubborn defence`);
      if (m.also?.length) problems.push(`${fen}: [%also] on a move of the opponent`);
    }
    let mv;
    try { mv = g.move(m.san); } catch { problems.push(`${fen}: illegal move ${m.san}`); return { problems, unique }; }
    if (opts.goal === 'conversion' && mv.color === learner && converts(g.fen(), opts, mv)) converted = true;
  }
  const last = line.moves[line.moves.length - 1];
  if (opts.goal === 'conversion') {
    if (!g.isCheckmate() && !converted) problems.push(`does not end in checkmate or a capture or promotion that keeps the win: ${g.fen()}`);
  } else if (opts.goal === 'promotion' && pawnLine) {
    // a pawn can also mate before it promotes: that ends the line too
    if (!g.isCheckmate() && (!last || !/=[QR]/.test(last.san) || afterLearner(g.fen(), opts)?.[0] !== 0)) problems.push(`does not end in a safe promotion: ${g.fen()}`);
  } else if (!g.isCheckmate()) problems.push(`does not end in checkmate: ${g.fen()}`);
  return { problems, unique };
}

/** One-line summary of verified lines: learner moves, unique ones, moves with [%also] alternatives. */
function summary(results) {
  const n = results.reduce((s, r) => s + r.unique.length, 0);
  const u = results.reduce((s, r) => s + r.unique.filter(Boolean).length, 0);
  return { learnerMoves: n, unique: u, pct: n ? Math.round((100 * u) / n) : 0 };
}

module.exports = { afterLearner, afterOpponent, cmp, fastestMoves, holdingMoves, resultFor, holdEnded, verifyLine, summary };
