// The "analyze" step of a course pipeline for one line, with its parts kept apart: correctness (verify.cjs),
// difficulty (difficulty.cjs), learning purpose (progression.cjs purposeHints), teaching (the explanations
// and how many are grounded), and the [%also] check (teaching never changes which moves are accepted).
// Variety stays with the course's own keys (pawn/structure.cjs), balance with progression.sequence.
//
// Where it goes (cheap first, expensive only on what survives):
//   candidates (enumerate) -> solve (playLine) -> cheap filters (pre/post) -> sample -> select (pickLines)
//   -> analyze (here) -> purpose -> balance (progression.sequence) -> explain (notes) -> verify (PGN read back)
//
//   const a = analyzeLine(line, { ex, verify });   // line: { fen, moves: [{ san, also }] }
const { Chess } = require('chess.js');
const { verifyLine } = require('../verify.cjs');
const { analyzeLine: difficultyOf } = require('./difficulty.cjs');
const { purposeHints } = require('./progression.cjs');

/**
 * Every learner move explained, with the line's [%also] compared to the explainer's equal moves: when the
 * learner wins they must be the same (verify.cjs); when the learner holds a draw, a course may accept fewer
 * of the holding moves (the King & Pawn course takes the pawn and offers nothing else), never one that loses.
 */
function explainLine(line, ex, { learner } = {}) {
  const g = new Chess(line.fen);
  learner ??= g.turn();
  const out = [];
  for (const m of line.moves) {
    const fen = g.fen();
    if (g.turn() === learner) {
      const e = ex.explainMove(fen, m.san);
      const also = [...(m.also ?? [])].sort().join();
      const matches = e.kind === 'best' && (e.mode === 'win' ? [...e.equal].sort().join() === also : (m.also ?? []).every((a) => e.equal.includes(a)));
      out.push({ fen, ...e, alsoMatches: matches });
    }
    g.move(m.san);
  }
  return out;
}

/**
 * opts: { ex, verify, learner ('w' | 'b'; default the side to move at the start), weights, correctness
 * (false: skip verify.cjs, for a course that checks its lines its own way) }.
 */
function analyzeLine(line, { ex, verify, learner, weights, correctness = true }) {
  const v = correctness ? verifyLine(line, verify) : null;
  const difficulty = difficultyOf(line, ex, { weights, learner });
  const explanations = explainLine(line, ex, { learner });
  const important = explanations.filter((e) => e.important);
  const s = difficulty.signals;
  const exception = explanations.some((e) => e.exceptions.length > 0);
  return {
    correctness: v ? { ok: v.problems.length === 0, problems: v.problems } : { ok: null, problems: [] },
    difficulty,
    purpose: purposeHints({ ...s, exception }),
    teaching: {
      learnerMoves: explanations.length,
      important: important.length,
      grounded: important.filter((e) => e.facts.length).length,
      review: explanations.flatMap((e) => e.review.map((r) => `${e.san}: ${r}`)),
      alsoMatches: explanations.every((e) => e.alsoMatches),
    },
    explanations,
  };
}

module.exports = { analyzeLine, explainLine };
