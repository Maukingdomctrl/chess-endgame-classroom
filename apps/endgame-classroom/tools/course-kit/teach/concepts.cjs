// Concepts: the ideas a course teaches (the opposition, key squares, ...), each tied to a fact the board
// or the solver can show. A concept is only ever mentioned when its fact is there: note(...) returns
// null otherwise, so a course cannot claim "the opposition" in a position without it.
//
//   const C = createConcepts([{ id, fact, name, notes: { introduce: '...', reinforce: '...' }, cues: [...], remember }]);
//   C.note('opposition', 'introduce', factsAfterMove)   // the stage's text, or null when the fact is absent
//   C.cue('opposition', level)                          // a question for before the move (level 1 = the
//                                                       // most general; higher levels say more), never the answer
//
// Rules checked when the set is created (it throws, so a bad text never reaches a course):
//   - every note and the takeaway pass readable() (short enough to read in 4-5 seconds)
//   - every cue is a question, names no square and no move, so it cannot give the answer away
//   - notes are keyed by stages the progression knows (./progression.cjs STAGES), unless `stages` is given
const { readable } = require('./explain.cjs');
const { STAGES } = require('./progression.cjs');

const SQUARE = /\b[a-h][1-8]\b/;
const SAN = /\b(?:[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h]x?[a-h]?[1-8](?:=[QRBN])?|O-O(?:-O)?)\b/;
/** Problems with a cue ([] = fine): it must ask, and must not name a square or a move. */
function cueProblems(cue) {
  const out = [];
  if (!/\?$/.test(cue.trim())) out.push('not a question');
  if (SQUARE.test(cue)) out.push('names a square');
  if (SAN.test(cue)) out.push('names a move');
  out.push(...readable(cue).map((p) => `too long: ${p}`));
  return out;
}

function createConcepts(list, { stages = STAGES } = {}) {
  const byId = new Map();
  const problems = [];
  for (const c of list) {
    if (!c.id || !c.fact) problems.push(`concept without id or fact: ${JSON.stringify(c)}`);
    for (const [stage, text] of Object.entries(c.notes ?? {})) {
      if (!stages[stage]) problems.push(`${c.id}: unknown stage ${stage}`);
      for (const p of readable(text)) problems.push(`${c.id} ${stage}: ${p}`);
    }
    if (c.remember) for (const p of readable(c.remember)) problems.push(`${c.id} remember: ${p}`);
    if (!c.cues?.length) problems.push(`${c.id}: no cues`);
    for (const q of c.cues ?? []) for (const p of cueProblems(q)) problems.push(`${c.id} cue "${q}": ${p}`);
    byId.set(c.id, c);
  }
  if (problems.length) throw new Error(`bad concepts:\n  ${problems.join('\n  ')}`);
  const present = (c, facts, side) => facts.some((f) => f.id === c.fact && (!side || f.side === side));
  const api = {
    list: [...byId.values()],
    get: (id) => byId.get(id) ?? null,
    /** The concept a fact id stands for (the first one listed), with a cue(level) helper. */
    byFact(factId) {
      const c = [...byId.values()].find((x) => x.fact === factId);
      return c ? { ...c, cue: (level) => api.cue(c.id, level) } : null;
    },
    /** The concepts whose fact is in this list of facts (optionally only those helping `side`). */
    present: (facts, side) => [...byId.values()].filter((c) => present(c, facts, side)).map((c) => c.id),
    /** The stage's note, only when the concept's fact is in `facts` (and helps `side`, if given). */
    note(id, stage, facts, side) {
      const c = byId.get(id);
      if (!c || !present(c, facts, side)) return null;
      return c.notes?.[stage] ?? null;
    },
    /** A cue for before the move: level 0 = none, 1 = the most general, up to the number of cues. */
    cue(id, level = 1) {
      const c = byId.get(id);
      if (!c || level <= 0) return null;
      return c.cues[Math.min(level, c.cues.length) - 1];
    },
  };
  return api;
}

module.exports = { createConcepts, cueProblems };
