// How hard a line is, as signals a person can check: counted from the solver's outcomes on every learner
// move of the line, not guessed and not an Elo. A composite score (0-100) and a broad label exist only to
// sort and to talk about a course; the signals stay in the result so the reason for a label is visible.
// The weights are a starting point set by judgement on the built-in courses, not a calibration against
// learners: change them per course (analyzeLine(..., { weights })).
//
//   const d = analyzeLine(line, ex, { learner: 'w' });   // line: { fen, moves: [{ san }] }, ex: createExplainer(...)
//   d.signals    see below;  d.score 0-100;  d.why  the signals that weigh most;  d.partial  signals unknown here
//   d.label      'Foundational' | 'Intermediate' | 'Around 1500' | 'Around 1800' | 'Difficult (approaching 2000)'
//
// Signals (all from the solver; "likely" = the domain's plausible-move heuristic, null when it has none):
//   learnerMoves          moves the learner has to find
//   uniqueShare           share of them with one accepted move (no [%also])
//   failShare             average share of legal moves that let the result go: how narrow the path is
//   rejectShare           average share of legal moves the app does not accept (slower ones included)
//   critical              learner moves where a likely move lets the result go (unknown heuristic: any move)
//   traps                 first move: likely moves that let the result go
//   trapsInLine           the same summed over every learner move; trapRate = per learner move
//   counterIntuitive      learner moves where no accepted move is among the likely ones; ...Share = per move
//   zugzwangs             positions of the line where the side to move is in zugzwang (passing would help it)
//   concepts              the concepts that explain the critical moves (explain.cjs reasons), in order
const { Chess } = require('chess.js');

/** [cap, points]: a signal at or above its cap gives all its points. They add up to 100. */
const WEIGHTS = {
  trapRate: [3, 25],
  counterIntuitiveShare: [0.4, 25],
  zugzwangs: [4, 15],
  learnerMoves: [20, 15],
  failShare: [1, 10],
  uniqueShare: [1, 10],
};
const BANDS = [[20, 'Foundational'], [40, 'Intermediate'], [60, 'Around 1500'], [80, 'Around 1800'], [Infinity, 'Difficult (approaching 2000)']];
const label = (score) => BANDS.find(([hi]) => score < hi)[1];
const round2 = (x) => Math.round(x * 100) / 100;

/** The solver's signals for a line (see the header). learner: 'w' | 'b' (default: the side to move at the start). */
function signals(line, ex, { learner } = {}) {
  const g = new Chess(line.fen);
  learner ??= g.turn();
  const s = { learnerMoves: 0, uniqueShare: 0, failShare: 0, rejectShare: 0, critical: 0, firstCritical: false, traps: 0, trapsInLine: 0, trapRate: 0, counterIntuitive: 0, counterIntuitiveShare: 0, zugzwangs: 0, concepts: [], firstConcept: null };
  let unique = 0, fail = 0, reject = 0, known = true;
  for (const m of line.moves) {
    const fen = g.fen();
    if (ex.zugzwang(fen, learner)) s.zugzwangs++;
    if (g.turn() === learner) {
      const out = ex.outcomes(fen);
      const n = out.moves.length;
      const first = s.learnerMoves === 0;
      const best = out.moves.filter((x) => x.kind === 'best');
      const lets = out.moves.filter((x) => x.kind === 'draws' || x.kind === 'loses' || x.kind === 'notGoal');
      const plausible = ex.plausible(fen);
      if (!plausible) known = false;
      const traps = plausible ? lets.filter((x) => plausible.includes(x.san)).length : 0;
      s.learnerMoves++;
      if (best.length === 1) unique++;
      fail += lets.length / n;
      reject += (n - best.length) / n;
      s.trapsInLine += traps;
      if (first) s.traps = traps;
      if (plausible && !best.some((x) => plausible.includes(x.san))) s.counterIntuitive++;
      if (plausible ? traps : lets.length) {
        s.critical++;
        if (first) s.firstCritical = true;
        const e = ex.explainMove(fen, m.san);
        if (e.parts.concept) { s.concepts.push(e.parts.concept); if (first) s.firstConcept = e.parts.concept; }
      }
    }
    g.move(m.san);
  }
  const per = (x) => (s.learnerMoves ? round2(x / s.learnerMoves) : 0);
  Object.assign(s, { uniqueShare: per(unique), failShare: per(fail), rejectShare: per(reject), trapRate: per(s.trapsInLine), counterIntuitiveShare: per(s.counterIntuitive) });
  // without a plausible-move heuristic these are unknown, not zero
  if (!known) for (const k of ['traps', 'trapsInLine', 'trapRate', 'counterIntuitive', 'counterIntuitiveShare']) s[k] = null;
  return s;
}

/** The composite score from the signals: { score, label, why (the signals with the most points), partial (unknown signals) }. */
function composite(s, weights = WEIGHTS) {
  const parts = Object.entries(weights).map(([k, [cap, pts]]) => [k, s[k] === null ? 0 : Math.min(s[k] ?? 0, cap) / cap * pts]);
  const score = Math.round(parts.reduce((a, [, p]) => a + p, 0));
  const why = parts.filter(([, p]) => p > 0).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 2).map(([k]) => `${k} ${s[k]}`);
  const partial = Object.keys(weights).filter((k) => s[k] === null);
  return { score, label: label(score), why, partial };
}

/** Signals and composite for a line. */
function analyzeLine(line, ex, { weights, learner } = {}) {
  const s = signals(line, ex, { learner });
  return { signals: s, ...composite(s, weights) };
}

module.exports = { WEIGHTS, BANDS, label, signals, composite, analyzeLine };
