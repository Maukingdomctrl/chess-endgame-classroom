// Learning progression: in which order a learner meets an idea (introduce it, reinforce it, vary it,
// apply it alone, meet the tempting mistake, calculate, the exception, mixed review), and how much help
// each stage gives. This is separate from difficulty (./difficulty.cjs): a misconception position can be
// easy, and a reinforcement can be harder than the review that follows. Nothing here is fixed: a course
// passes its own plan, and may pass its own stage table.
//
//   const P = createProgression();              // or createProgression({ stages: {...} })
//   const seq = P.sequence(plan, pool);         // pick positions for each step of the plan
//   P.checkSequence(seq)                        // [] or the rules a sequence breaks
//   purposeHints(analysis)                      // which stages a position could serve
//
// plan:  [{ stage, concept (or concepts: [...] for mixed review), count, maxScore?, minScore? }]
// pool:  [{ id, concepts: [ids], purposes: [stages], difficulty: { score, sortScore?, label }, variety (a key:
//          the same key twice in a row is repetition) }]. Ordering uses sortScore when given (difficulty.cjs:
//          the top of the range when a signal is unknown), else score.
// hints: how much help a stage gives: 3 = note + cue + marks, 2 = cue + marks, 1 = cue, 0 = nothing.

/** The default stages, in their usual order. requires: a stage of the same concept that must come earlier. */
const rankOf = (x) => x.difficulty.sortScore ?? x.difficulty.score;
const STAGES = {
  introduce: { order: 0, hints: 3, requires: [] },
  reinforce: { order: 1, hints: 2, requires: ['introduce'] },
  variation: { order: 2, hints: 1, requires: ['introduce'] },
  independent_application: { order: 3, hints: 0, requires: ['reinforce'] },
  misconception: { order: 4, hints: 2, requires: ['introduce'], resetsHints: true },
  calculation: { order: 5, hints: 0, requires: ['introduce'] },
  exception: { order: 6, hints: 2, requires: ['introduce'], resetsHints: true },
  mixed_review: { order: 7, hints: 0, requires: [], minConcepts: 2 },
};

/**
 * The stages a position could serve, from its analysis (facts and solver outcomes, not wording):
 * { concepts (reason concepts of the line's learner moves, in order), firstConcept (the reason of the first
 * move), critical (learner moves where a move lets the win go), firstCritical, traps (plausible first moves
 * that fail), exception (bool), learnerMoves, zugzwangsSet }.
 */
function purposeHints(a) {
  const out = [];
  const distinct = [...new Set(a.concepts ?? [])];
  if (a.firstConcept && a.firstCritical && !a.exception && a.learnerMoves <= 6) out.push('introduce');
  if (a.firstConcept && a.firstCritical && !a.exception) out.push('reinforce', 'variation');
  if (distinct.length && !a.firstConcept && a.critical > 0) out.push('independent_application');
  if (a.firstConcept && a.traps > 0) out.push('misconception');
  if (a.critical >= 3 || a.zugzwangsSet >= 2) out.push('calculation');
  if (a.exception) out.push('exception');
  if (distinct.length >= 2) out.push('mixed_review');
  return out;
}

function createProgression({ stages = STAGES, recent = 1 } = {}) {
  const known = (s) => Object.prototype.hasOwnProperty.call(stages, s);
  const conceptsOf = (step) => step.concepts ?? (step.concept ? [step.concept] : []);

  /**
   * Picks positions for each step of the plan: those that serve the stage and the concept, easiest first
   * (score, then id), never the same variety key as the last `recent` picks, never one position twice.
   * Deterministic. A step that cannot be filled is reported in `short`, not padded.
   */
  function sequence(plan, pool) {
    const used = new Set();
    const out = [];
    const short = [];
    for (const step of plan) {
      if (!known(step.stage)) throw new Error(`unknown stage ${step.stage}`);
      const want = conceptsOf(step);
      const fits = pool.filter((x) => !used.has(x.id) && x.purposes.includes(step.stage) &&
        want.every((c) => x.concepts.includes(c)) &&
        (step.maxScore === undefined || rankOf(x) <= step.maxScore) && (step.minScore === undefined || rankOf(x) >= step.minScore))
        .sort((a, b) => rankOf(a) - rankOf(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      let n = 0;
      while (n < step.count) {
        const last = out.slice(-recent).map((x) => x.variety);
        const pick = fits.find((x) => !used.has(x.id) && !(x.variety !== undefined && last.includes(x.variety)));
        if (!pick) break;
        used.add(pick.id);
        out.push({ ...pick, stage: step.stage, concepts: want.length ? want : pick.concepts, hints: stages[step.stage].hints });
        n++;
      }
      if (n < step.count) short.push({ stage: step.stage, concepts: want, wanted: step.count, got: n });
    }
    return Object.assign(out, { short });
  }

  /**
   * The rules a sequence breaks ([] = none): unknown stages; a stage before what it requires (per concept);
   * mixed review before enough concepts were introduced; help growing again for a concept (except in stages
   * that reset it: misconception, exception); within a run of the same stage and concept, a position easier
   * than the one before by more than `tolerance`; the same variety key twice in a row.
   */
  function checkSequence(seq, { tolerance = 0 } = {}) {
    const problems = [];
    const seen = new Map(); // concept -> Set of stages so far
    const hints = new Map(); // concept -> the last help level
    const introduced = new Set();
    seq.forEach((x, i) => {
      const st = stages[x.stage];
      if (!st) { problems.push(`${i}: unknown stage ${x.stage}`); return; }
      for (const c of x.concepts) {
        const before = seen.get(c) ?? new Set();
        for (const r of st.requires) if (!before.has(r)) problems.push(`${i}: ${x.stage} of ${c} before ${r}`);
        const h = hints.get(c);
        if (h !== undefined && x.hints > h && !st.resetsHints) problems.push(`${i}: more help for ${c} again (${h} -> ${x.hints})`);
        hints.set(c, x.hints);
        before.add(x.stage);
        seen.set(c, before);
        if (x.stage === 'introduce') introduced.add(c);
      }
      if (st.minConcepts && introduced.size < st.minConcepts) problems.push(`${i}: ${x.stage} with only ${introduced.size} concept(s) introduced`);
      const prev = seq[i - 1];
      if (prev && prev.stage === x.stage && prev.concepts.join() === x.concepts.join() && rankOf(x) + tolerance < rankOf(prev)) {
        problems.push(`${i}: easier than the position before in the same ${x.stage} run (${rankOf(prev)} -> ${rankOf(x)})`);
      }
      if (prev && x.variety !== undefined && prev.variety === x.variety) problems.push(`${i}: same variety key as the position before (${x.variety})`);
    });
    return problems;
  }
  /** How much help a stage gives (3 = note + cue + marks ... 0 = nothing). */
  const hintsFor = (stage) => (known(stage) ? stages[stage].hints : null);
  return { stages, sequence, checkSequence, hintsFor };
}

module.exports = { STAGES, purposeHints, createProgression };
