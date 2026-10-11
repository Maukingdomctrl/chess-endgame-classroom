// Fills the 100 slots of the Direct Opposition blueprint (../course-kit/curricula/opposition/: the slots,
// their tasks and constraints in direct-opposition.cjs, the rules for the generator in direct-opposition.md)
// with positions the solver offers. Nothing here decides chess: the candidates are the feasibility check's
// (every King & Pawn position classified by tasks.cjs, its line played with best play and analysed), the
// lines are line.cjs's, the explanations teach/explain.cjs's with the course's words.
//
//   node search.cjs              # enumerates the candidates (about 12 minutes), then fills the slots
//   node search.cjs --from-json  # reuses ../course-kit/curricula/opposition/.out/feasibility.json
//                                # (written by the full run, or by npm run curriculum:opposition -- --json)
//
// The rules (direct-opposition.md, "Rules for the generator", and the variety the pawn courses ask for):
// - per slot the candidates that match() it, starts of the other built-in courses excluded; protecting the
//   pawn means a king move that protects it (one candidate protects it by a pawn push: left out);
// - variety, mirror images alike: no start twice; no line that is another one shifted along the board (the
//   start seen from the pawn and the same moves: lineShape(); only three different protect lines exist for
//   four slots, so one of them may come back reflected); no two lines that reach the same position after the
//   learner's first move; within a task, the head of a line (its start to the position after the learner's
//   first move) appears nowhere in the opening (first FRONT plies) of another line of that task, so one line
//   is never another's continuation. Across tasks a line may meet another one later (a "take" walk passes
//   positions where a Black-moves-first line starts: the first decision differs), and finishes may meet.
//   Stricter rules leave slots empty (measured: the 57 Black-moves-first lines are 18 families of one walk
//   each, the blueprint asks for 15, and every long walk passes their starts; at most a quarter of the
//   positions shared, as in the two-pawn course, fails two thirds of the slots: single-pawn lines converge on
//   the same walks and promotion pictures). The ranking prefers lines that do neither; both are reported;
// - every candidate's line is played first (about 80 seconds), so the conflicts are known. Then a depth-first
//   search: the slot with the fewest lines left first; a pick is taken only while every open slot can still
//   get a line of its own (a bipartite matching; lines of one task that conflict with each other are grouped
//   in cliques, one resource each, so the matching sees those conflicts in advance); stuck: back up;
// - ranking within a slot: the progression's rules (at most one band easier than the line before in the same
//   stage, teach/progression.cjs checkSequence; not the same coarse picture as a neighbour), no start on
//   another line and no line through another's start, the least overlap, a line shape not used yet, the
//   fewest important learner moves without a reason in the course's words (the line's analysis: critical
//   moves whose reason has no concept; the explanations themselves are checked in build.cjs), the slot's band
//   and fewer learner moves (introduction and guided phase), variety (not the pawn of a neighbour, patterns
//   not repeated within a phase), more unique learner moves, the difficulty score (easier first in phases 1-2,
//   harder first in the calculation phase and the last assessment position), the position (a fixed key);
// - every second line of a phase is shown mirrored (pawn on the e-g file), so the files vary.
// Writes .out/picked.json.
const fs = require('fs');
const path = require('path');
const { Chess } = require('chess.js');
const B = require('../course-kit/curricula/opposition/direct-opposition.cjs');
const { candidates } = require('../course-kit/curricula/opposition/feasibility.cjs');
const { playLine } = require('../course-kit/line.cjs');
const { canonical, lineShape, pattern, pawnKey } = require('./keys.cjs');

const { VERIFY, SLOTS, PHASES, matches, otherCourseStarts, createCourseExplainer, learnerOrder } = B;
const SAVED = path.join(__dirname, '../course-kit/curricula/opposition/.out/feasibility.json');
const OUT = path.join(__dirname, '.out');
const TOLERANCE = 20; // one band, as the blueprint's own progression check (curricula/opposition/test.cjs)
const FRONT = 4; // plies: the opening of a line, which no other line of its task may start in or join

const t0 = Date.now();
let list;
if (process.argv.includes('--from-json')) {
  list = JSON.parse(fs.readFileSync(SAVED, 'utf8'));
  console.log(`search: ${list.length} candidates from ${path.relative(process.cwd(), SAVED)}`);
} else {
  list = candidates({ log: (m) => process.stderr.write(`  ${m}\n`) });
  fs.mkdirSync(path.dirname(SAVED), { recursive: true });
  fs.writeFileSync(SAVED, JSON.stringify(list, null, 1));
  console.log(`search: ${list.length} candidates enumerated in ${Math.round((Date.now() - t0) / 1000)} s (saved for --from-json)`);
}
const others = otherCourseStarts();
const pool = list.filter((c) => !others.has(canonical(c.fen)));
for (const c of pool) { c.key = canonical(c.fen); c.pattern = pattern(c.fen); c.pawnKey = pawnKey(c.fen); }

// ---------- every candidate's line, as the feasibility check played it ----------
const ex = createCourseExplainer();
const moveOrder = learnerOrder(ex);
/** { moves: [{ san, also }], positions: Set of canonical keys (the start included) }. */
function lineOf(c) {
  let moves;
  if (c.task === 'defend') {
    const p = playLine(c.fen, { ...VERIFY, objective: 'hold', learnerOrder: moveOrder });
    if (p.end !== 'draw') throw new Error(`${c.fen}: the holding line ends in ${p.end}`);
    moves = p.plies.map((x) => ({ san: x.san, also: x.also ?? [] }));
  } else {
    const g = new Chess(c.fen);
    if (c.task === 'retake') g.move(c.reply);
    // several equally fast moves ('either'): the line plays the one that takes the opposition (the task's
    // move), the others become its [%also]
    const start = g.fen();
    const order = c.task === 'either' ? (a, b, ctx) => (ctx.fen === start ? (b.san === c.first) - (a.san === c.first) : 0) || moveOrder(a, b, ctx) : moveOrder;
    const p = playLine(start, { ...VERIFY, learnerOrder: order });
    if (p.end !== 'promotion') throw new Error(`${c.fen}: the line ends in ${p.end}`);
    moves = [...(c.task === 'retake' ? [{ san: c.reply, also: [] }] : []), ...p.plies.map((x) => ({ san: x.san, also: x.also ?? [] }))];
  }
  const g = new Chess(c.fen);
  const positions = new Set([c.key]);
  for (const m of moves) { g.move(m.san); positions.add(canonical(g.fen())); }
  return { moves, positions };
}
for (const c of pool) {
  c.line = lineOf(c);
  c.shapeKey = lineShape(c.fen, c.line.moves.map((m) => m.san));
  // protecting the pawn: only three different lines exist for four slots, so there a shifted or reflected copy
  // may come back (ranked after every other choice); everywhere else the shape is used once
  c.lineKey = c.task === 'protect' ? c.key : c.shapeKey;
}
for (const c of pool) {
  // the head: the start up to the position after the learner's first move (Black's move first in a retake line)
  const g = new Chess(c.fen);
  c.head = new Set([c.key]);
  for (const m of c.line.moves.slice(0, c.task === 'retake' ? 2 : 1)) { g.move(m.san); c.head.add(canonical(g.fen())); }
  c.afterFirst = canonical(g.fen());
  const f = new Chess(c.fen);
  c.front = new Set([c.key]);
  for (const m of c.line.moves.slice(0, FRONT)) { f.move(m.san); c.front.add(canonical(f.fen())); }
}
console.log(`search: ${pool.length} lines played in ${Math.round((Date.now() - t0) / 1000)} s`);

/** Important learner moves whose reason the course cannot name (the line's analysis: critical moves without a concept). */
const unexplained = (c) => c.difficulty.signals.critical - c.difficulty.signals.concepts.length;

// ---------- conflicts, and the matching: can every open slot still get a line of its own? ----------
const meets = (set, m) => { for (const q of set) if (m.get(q)) return true; return false; };
const asCounts = (set) => new Map([...set].map((q) => [q, 1]));
for (const c of pool) c.frontCounts = asCounts(c.front);
/** Two lines of one task that may not both be in the course: the head of one meets the opening of the other. */
const conflict = (a, b) => meets(a.head, b.frontCounts) || meets(b.head, a.frontCounts);
// The resource a pick uses up: a clique of lines of one task that conflict with each other (two of them can
// never both be in the course), so the matching sees those conflicts before they happen. The cliques are
// built greedily, the candidates of the tightest slots first (the Black-moves-first walks, the longest walks
// of the hardest slots); a line in no clique is its own resource.
const fits = new Map(SLOTS.map((s) => [s.n, pool.filter((c) => matches(s, c) && (c.task !== 'protect' || /^K/.test(c.first)))]));
{
  const tight = new Map(pool.map((c) => [c, Math.min(Infinity, ...SLOTS.filter((s) => fits.get(s.n).includes(c)).map((s) => fits.get(s.n).length))]));
  const byTask = new Map();
  for (const c of [...pool].sort((x, y) => tight.get(x) - tight.get(y) || (x.key < y.key ? -1 : 1))) {
    if (!byTask.has(c.task)) byTask.set(c.task, []);
    const cliques = byTask.get(c.task);
    const home = cliques.find((q) => q.every((x) => conflict(x, c)));
    if (home) home.push(c); else cliques.push([c]);
  }
  for (const [task, cliques] of byTask) cliques.forEach((q, i) => { for (const c of q) c.resource = q.length > 1 ? `${task} clique ${i}` : c.lineKey; });
}
// what the picks so far use up, counted (so a pick can be taken back), per task where the rule is per task:
// resources and line keys, the openings of the picked lines and their heads (tagged by task), their starts,
// the positions after the learner's first moves, and all their positions (for the softer rules in the ranking)
const state = { used: new Map(), fronts: new Map(), heads: new Map(), starts: new Map(), firsts: new Map(), positions: new Map() };
const tagged = (task, set) => [...set].map((q) => `${task} ${q}`);
const bump = (m, keys, d) => { for (const k of keys) m.set(k, (m.get(k) ?? 0) + d); };
function apply(c, d) {
  bump(state.used, [c.resource, c.lineKey], d);
  bump(state.fronts, tagged(c.task, c.front), d);
  bump(state.heads, tagged(c.task, c.head), d);
  bump(state.starts, [c.key], d);
  bump(state.positions, c.line.positions, d);
  bump(state.firsts, [c.afterFirst], d);
}
/** A candidate that can no longer be picked by the rules above, given the picks so far. */
const blocked = (c) => state.used.get(c.resource) || state.used.get(c.lineKey) || state.starts.get(c.key) || state.firsts.get(c.afterFirst)
  || meets(c.tHead ??= tagged(c.task, c.head), state.fronts) || meets(c.tFront ??= tagged(c.task, c.front), state.heads);
/** Every open slot can get a line of its own (null), or the first slot that cannot. */
function canFill(rest) {
  const owner = new Map();
  const free = new Map();
  const ok = (c) => { if (!free.has(c.key)) free.set(c.key, !blocked(c)); return free.get(c.key); };
  const assign = (i, seen) => {
    for (const c of fits.get(rest[i].n)) {
      if (seen.has(c.resource) || !ok(c)) continue;
      seen.add(c.resource);
      if (!owner.has(c.resource) || assign(owner.get(c.resource), seen)) { owner.set(c.resource, i); return true; }
    }
    return false;
  };
  for (let i = 0; i < rest.length; i++) if (!assign(i, new Set())) return rest[i].n;
  return null;
}

// ---------- fill the slots, the most constrained first (the fewest candidates left); backtrack when stuck ----------
const phaseOf = (s) => PHASES.find((p) => p.id === s.phase);
const runKey = (s) => `${s.purpose}|${s.concepts.join()}`;
const sortScore = (c) => c.difficulty.sortScore ?? c.difficulty.score;
const picks = new Map();
let steps = 0;
const BUDGET = 20000;
function ranking(s) {
  // the neighbours in the course, where already picked: the progression's run order and variety look at both
  const near = [picks.get(s.n - 1), picks.get(s.n + 1)].filter(Boolean);
  const samePhase = [...picks.values()].filter((p) => p.phase === s.phase);
  const early = s.phase === 'introduction' || s.phase === 'guided';
  const hardest = s.phase === 'calculation' || s.n === 100;
  // at most one band easier than the position before in the same run, at most one band harder than the one after
  const runOk = (c) => near.every((p) => runKey(SLOTS[p.n - 1]) !== runKey(s) || (p.n < s.n ? sortScore(c) + TOLERANCE >= p.sortScore : p.sortScore + TOLERANCE >= sortScore(c)));
  const variety = (c) => near.reduce((v, p) => v + (p.pawnKey === c.pawnKey ? 2 : 0), 0) + samePhase.filter((p) => p.pattern === c.pattern).length;
  const keys = (c) => [
    // the progression's rules: the run order, and not the same picture as the line before or after
    runOk(c) && !near.some((p) => Math.abs(p.n - s.n) === 1 && p.pattern === c.pattern) ? 0 : 1,
    // softer variety, as far as the slots allow: no start on another line, no line through another's start,
    // then the least overlap (in quarters of the line)
    (state.positions.get(c.key) ? 1 : 0) + (meets(c.line.positions, state.starts) ? 1 : 0),
    Math.floor((4 * [...c.line.positions].filter((q) => state.positions.get(q)).length) / c.line.positions.size),
    [...picks.values()].filter((p) => p.shapeKey === c.shapeKey).length,
    unexplained(c),
    early ? s.band.indexOf(c.difficulty.label) : 0,
    early ? c.learnerMoves : 0,
    variety(c),
    -c.difficulty.signals.uniqueShare,
    early ? sortScore(c) : hardest ? -sortScore(c) : 0,
  ];
  return fits.get(s.n).filter((c) => !blocked(c)).map((c) => ({ c, k: keys(c) }))
    .sort((x, y) => { for (let j = 0; j < x.k.length; j++) if (x.k[j] !== y.k[j]) return x.k[j] - y.k[j]; return x.c.key < y.c.key ? -1 : 1; });
}
let deepest = 0;
const stuckAt = new Map();
/** Depth first: the slot with the fewest lines (resources) left first, its candidates in ranking order. */
function fill() {
  const open = SLOTS.filter((x) => !picks.has(x.n));
  if (!open.length) return true;
  deepest = Math.max(deepest, picks.size);
  let s = null, least = Infinity;
  for (const x of open) { const k = new Set(fits.get(x.n).filter((c) => !blocked(c)).map((c) => c.resource)).size; if (k < least) { least = k; s = x; } }
  const rest = open.filter((x) => x !== s);
  for (const { c, k } of ranking(s)) {
    if (++steps > BUDGET) return false;
    apply(c, 1);
    picks.set(s.n, {
      n: s.n, phase: s.phase, task: s.task, fen: c.fen, reply: c.reply ?? null, first: c.first,
      moves: c.line.moves, positions: c.line.positions, label: c.difficulty.label, score: c.difficulty.score, sortScore: sortScore(c), learnerMoves: c.learnerMoves,
      zugzwangsSet: c.difficulty.signals.zugzwangsSet, uniqueShare: c.difficulty.signals.uniqueShare, unexplained: unexplained(c),
      runOk: k[0] === 0, shapeKey: c.shapeKey, pattern: c.pattern, pawnKey: c.pawnKey, candidates: fits.get(s.n).length,
    });
    const starved = canFill(rest);
    if (starved !== null) stuckAt.set(starved, (stuckAt.get(starved) ?? 0) + 1);
    if (starved === null && fill()) return true;
    picks.delete(s.n);
    apply(c, -1);
  }
  return false;
}
if (!fill()) {
  const open = SLOTS.filter((s) => !picks.has(s.n)).map((s) => s.n);
  console.error(`search: no course satisfies the rules (${steps > BUDGET ? `gave up after ${BUDGET} tries` : 'every choice tried'}; deepest: ${deepest} of ${SLOTS.length} slots, ` +
    `slots that starved most: ${[...stuckAt].sort((x, y) => y[1] - x[1]).slice(0, 8).map(([n, k]) => `${n} (${k})`).join(', ')}; open slots: ${open.join(', ')})`);
  process.exit(1);
}
// for the report: how many of each line's positions also appear in another line
const owners = new Map();
for (const p of picks.values()) for (const q of p.positions) owners.set(q, (owners.get(q) ?? 0) + 1);
const sharedOf = new Map([...picks.values()].map((p) => [p.n, [...p.positions].filter((q) => owners.get(q) > 1).length]));
const inside = [...picks.values()].filter((p) => owners.get(canonical(p.fen)) > 1).map((p) => p.n);
for (const p of picks.values()) { p.size = p.positions.size; delete p.positions; }
// every second line of a phase mirrored (pawn on the e-g file)
const picked = SLOTS.map((s) => picks.get(s.n));
for (const p of PHASES) picked.filter((x) => x.phase === p.id).forEach((x, j) => { x.mirror = j % 2 === 1; });
// the run order once more, now that every neighbour is known
for (const [i, x] of picked.entries()) x.runOk = i === 0 || runKey(SLOTS[i - 1]) !== runKey(SLOTS[i]) || x.sortScore + TOLERANCE >= picked[i - 1].sortScore;
const report = picked.map((p) => `${String(p.n).padStart(3)} ${p.task.padEnd(7)} ${phaseOf(SLOTS[p.n - 1]).name.padEnd(23)} ${String(p.candidates).padStart(4)} cand  ${p.fen.padEnd(32)} ${(p.label ?? '?').padEnd(12)} ${String(p.score).padStart(3)}  ${String(p.learnerMoves).padStart(2)} mv  unexpl ${p.unexplained}  shared ${sharedOf.get(p.n)}/${p.size}${p.runOk ? '' : '  RUN ORDER BROKEN'}  ${p.moves.map((m) => m.san).join(' ')}`);
console.log(report.join('\n'));
const broken = picked.filter((p) => !p.runOk).map((p) => p.n);
const shared = picked.reduce((a, p) => a + sharedOf.get(p.n), 0), size = picked.reduce((a, p) => a + p.size, 0);
console.log(`search: ${picked.length} slots filled (${steps} picks tried) in ${Math.round((Date.now() - t0) / 1000)} s; ` +
  `important moves without a reason in the course's words: ${picked.reduce((a, p) => a + p.unexplained, 0)}; ` +
  `run order broken: ${broken.length ? broken.join(', ') : 'none'}; positions also in another line: ${Math.round((100 * shared) / size)}%; ` +
  `starts inside another line: ${inside.length ? inside.join(', ') : 'none'}`);
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'picked.json'), JSON.stringify(picked, null, 1));
