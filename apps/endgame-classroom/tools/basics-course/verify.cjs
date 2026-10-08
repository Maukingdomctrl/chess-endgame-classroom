// Checks a line move by move on its real FENs with chess.js and the exact solvers. Used twice:
// by build.cjs on the generated lines, and by pgnout.cjs on the PGN file read back from disk.
const { Chess } = require('chess.js');
const M = require('./mate3.cjs');
const { K } = require('../kpk-course/engine.cjs');

const has = (fen, ch) => fen.split(' ')[0].includes(ch);

/**
 * Value of the position after a White move (Black to move), as a sort key: lower = faster win.
 * [0, dtm] mate or a promotion that wins (dtm: plies to mate after it), [1, plies] a K+P win
 * (plies to a safe promotion), null = no longer a win (stalemate, piece lost, draw).
 */
function afterWhite(fen) {
  const g = new Chess(fen);
  if (g.isCheckmate()) return [0, 0];
  if (g.isStalemate() || g.isInsufficientMaterial()) return null;
  if (has(fen, 'P')) { const r = K.probe(fen); return r.result === 'loss' ? [1, r.dtc] : null; }
  const r = M.probe(fen);
  return r.result === 'loss' ? [0, r.dtm] : null;
}
/** Value of the position after a Black move (White to move): plies White still needs; null = no longer a win. */
function afterBlack(fen) {
  const g = new Chess(fen);
  if (g.isInsufficientMaterial()) return null; // the piece or the pawn was taken
  if (has(fen, 'P')) { const r = K.probe(fen); return r.result === 'win' ? r.dtc : null; }
  const r = M.probe(fen);
  return r.result === 'win' ? r.dtm : null;
}
const cmp = (a, b) => a[0] - b[0] || a[1] - b[1];

/** Every learner move's fastest set on the real FEN (SAN list) - the line move and its [%also] must be exactly this. */
function fastestMoves(fen) {
  const vals = new Chess(fen).moves().map((san) => { const t = new Chess(fen); t.move(san); return { san, v: afterWhite(t.fen()) }; }).filter((x) => x.v);
  vals.sort((a, b) => cmp(a.v, b.v));
  return vals.length ? vals.filter((x) => cmp(x.v, vals[0].v) === 0).map((x) => x.san) : [];
}

/**
 * line: { fen, moves: [{ san, also }] }. Returns a list of problems (empty = fine) and, per learner
 * move, whether it is unique. White = the learner: every move a fastest win, [%also] = exactly the
 * other fastest moves. Black: the most stubborn defence. The end: checkmate, or a safe promotion
 * in a K+P line.
 */
function verifyLine(line) {
  const problems = [];
  const unique = [];
  let g;
  try { g = new Chess(line.fen); } catch (e) { return { problems: [`bad FEN ${line.fen}: ${e.message}`], unique }; }
  const pawnLine = has(line.fen, 'P');
  if (g.turn() !== 'w') problems.push(`White (the learner) does not start: ${line.fen}`);
  for (const m of line.moves) {
    const fen = g.fen();
    if (g.turn() === 'w') {
      const fastest = fastestMoves(fen);
      if (!fastest.includes(m.san)) problems.push(`${fen}: ${m.san} is not a fastest win (fastest: ${fastest.join(',') || 'none'})`);
      for (const a of m.also ?? []) if (!fastest.includes(a)) problems.push(`${fen}: [%also] ${a} is not as fast as ${m.san}`);
      const missing = fastest.filter((s) => s !== m.san && !(m.also ?? []).includes(s));
      if (missing.length) problems.push(`${fen}: [%also] for ${m.san} misses ${missing.join(',')}`);
      unique.push(fastest.length === 1);
    } else {
      const vals = g.moves().map((san) => { const t = new Chess(fen); t.move(san); return { san, v: afterBlack(t.fen()) }; });
      if (vals.some((x) => x.v === null)) problems.push(`${fen}: Black can escape (${vals.filter((x) => x.v === null).map((x) => x.san).join(',')})`);
      const longest = Math.max(...vals.map((x) => x.v ?? -1));
      const mine = vals.find((x) => x.san === m.san);
      if (!mine || mine.v !== longest) problems.push(`${fen}: ${m.san} is not the most stubborn defence`);
      if (m.also?.length) problems.push(`${fen}: [%also] on a move of the opponent`);
    }
    try { g.move(m.san); } catch { problems.push(`${fen}: illegal move ${m.san}`); return { problems, unique }; }
  }
  const last = line.moves[line.moves.length - 1];
  if (pawnLine) {
    if (!last || !/=[QR]/.test(last.san) || afterWhite(g.fen())?.[0] !== 0) problems.push(`does not end in a safe promotion: ${g.fen()}`);
  } else if (!g.isCheckmate()) problems.push(`does not end in checkmate: ${g.fen()}`);
  return { problems, unique };
}

module.exports = { afterWhite, afterBlack, cmp, fastestMoves, verifyLine };
