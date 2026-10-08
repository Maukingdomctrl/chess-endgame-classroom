// Checks a course line move by move on its real FENs with chess.js and an exact solver. A course runs it
// twice: on the generated lines, and on the PGN file read back from disk.
//
// The learner is the side to move in the line's start position. A learner move must be a fastest win,
// its [%also] list must be exactly the other equally fast moves, every opponent move must be the most
// stubborn defence, and the line must end in checkmate (or, with goal 'promotion', a safe promotion).
//
// opts.probe(fen) -> { result: 'win' | 'loss' | 'draw', dtm }: exact value for the side to move, dtm in
//   plies to mate (the toolkit's solver.cjs).
// opts.goal: 'mate' (default) or 'promotion': while a pawn is on the board, "fastest" means the quickest
//   safe promotion (K+P vs K, measured by ../kpk-course/kpk.cjs), then the piece that mates fastest.
const { Chess } = require('chess.js');

let kpk; // loaded on first use: the King & Pawn solver
const hasPawn = (fen) => /p/i.test(fen.split(' ')[0]);
const cmp = (a, b) => a[0] - b[0] || a[1] - b[1];

/**
 * Value of the position after a learner move (the opponent to move), as a sort key: lower = faster.
 * [0, plies] mate or a won position (plies to mate), [1, plies] a K+P win measured to the promotion
 * (goal 'promotion'), null = no longer a win (stalemate, draw, loss).
 */
function afterLearner(fen, opts) {
  const g = new Chess(fen);
  if (g.isCheckmate()) return [0, 0];
  if (g.isStalemate() || g.isInsufficientMaterial()) return null;
  if (opts.goal === 'promotion' && hasPawn(fen)) {
    kpk ??= require('../kpk-course/kpk.cjs');
    const r = kpk.probe(fen);
    return r.result === 'loss' ? [1, r.dtc] : null;
  }
  const r = opts.probe(fen);
  return r.result === 'loss' ? [0, r.dtm] : null;
}
/** Value of the position after an opponent move (the learner to move): plies the learner still needs; null = no longer a win. */
function afterOpponent(fen, opts) {
  const g = new Chess(fen);
  if (g.isInsufficientMaterial()) return null;
  if (opts.goal === 'promotion' && hasPawn(fen)) {
    kpk ??= require('../kpk-course/kpk.cjs');
    const r = kpk.probe(fen);
    return r.result === 'win' ? r.dtc : null;
  }
  const r = opts.probe(fen);
  return r.result === 'win' ? r.dtm : null;
}

/** All fastest learner moves in a position (SAN). The line's move and its [%also] must be exactly these. */
function fastestMoves(fen, opts) {
  const vals = new Chess(fen).moves().map((san) => { const t = new Chess(fen); t.move(san); return { san, v: afterLearner(t.fen(), opts) }; }).filter((x) => x.v);
  vals.sort((a, b) => cmp(a.v, b.v));
  return vals.length ? vals.filter((x) => cmp(x.v, vals[0].v) === 0).map((x) => x.san) : [];
}

/** line: { fen, moves: [{ san, also }] }. Returns { problems: [...], unique: [bool per learner move] }. */
function verifyLine(line, opts) {
  const problems = [];
  const unique = [];
  let g;
  try { g = new Chess(line.fen); } catch (e) { return { problems: [`bad FEN ${line.fen}: ${e.message}`], unique }; }
  const learner = g.turn();
  const pawnLine = hasPawn(line.fen);
  for (const m of line.moves) {
    const fen = g.fen();
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
    try { g.move(m.san); } catch { problems.push(`${fen}: illegal move ${m.san}`); return { problems, unique }; }
  }
  const last = line.moves[line.moves.length - 1];
  if (opts.goal === 'promotion' && pawnLine) {
    if (!last || !/=[QR]/.test(last.san) || afterLearner(g.fen(), opts)?.[0] !== 0) problems.push(`does not end in a safe promotion: ${g.fen()}`);
  } else if (!g.isCheckmate()) problems.push(`does not end in checkmate: ${g.fen()}`);
  return { problems, unique };
}

/** One-line summary of verified lines: learner moves, unique ones, moves with [%also] alternatives. */
function summary(results) {
  const n = results.reduce((s, r) => s + r.unique.length, 0);
  const u = results.reduce((s, r) => s + r.unique.filter(Boolean).length, 0);
  return { learnerMoves: n, unique: u, pct: n ? Math.round((100 * u) / n) : 0 };
}

module.exports = { afterLearner, afterOpponent, cmp, fastestMoves, verifyLine, summary };
