---
name: exact-solver-engineering
description: The workflow for extending, speeding up or re-architecting an exact solver without giving up exactness - inspect the architecture, baseline, size the target, profile, implement in gated increments, verify independently (a second implementation, a checker that shares no code, external references, mutation tests), benchmark, manage memory and caching, run regressions, document the limits. Learned growing the Endgame Classroom's four-piece solver into the five-piece egtb engine. Use it whenever a task touches tools/course-kit/solver.cjs, tools/course-kit/egtb/, the pawn oracle, cache.cjs or table generation - six pieces, a new goal or metric, new materials or rules, faster or leaner builds, threads, a new checker - and for any other computation whose answers must be exactly right (tablebases, retrograde analysis, exhaustive search, game or puzzle solvers), even when the request only says "make it faster" or "support X".
---

# Extending an exact solver without losing exactness

This is how the course-kit's four-piece endgame solver became the five-piece `egtb` engine: K+Q vs K+R built in
3 s instead of 13-15 s, K+Q+Q vs K+R taken from 265 s to 42 s in five measured rounds, families of 1.5 G
positions in under six minutes on four cores, every value of the big tables proved by a checker that shares no
code with the engine, and not one byte of the built-in courses changed. Follow the same order for the next
step (six pieces, a new goal, new rules, a faster or leaner build), and for any exact computation where a
wrong answer is worse than a slow one.

The idea behind every step: **a result is exactly as trustworthy as the evidence that it is right**, and that
evidence has to come from something that cannot share the code's mistakes. Speed, memory and convenience are
bought only with changes that keep the evidence intact. When a check fails, the code is guilty until the
check is shown wrong on a concrete case; checks are never loosened to get green.

In this repository: if the work serves a course, the **endgame-course** skill's owner rules still apply (a
new built-in course needs its lesson list approved first; moves only from the solver).
`references/repo-map.md` has the files, contracts, test matrix with times, measured costs, knobs and cache
rules; read it before planning.

## The workflow

| # | Step | Done when |
|---|---|---|
| 1 | Inspect the architecture | you can name the contracts that must not change, the hard limits, and where the new code joins the old |
| 2 | Baseline | every suite has passed on the untouched tree, with times saved to files |
| 3 | Size the target | positions, memory, disk and dependent tables are computed, and you know what fits |
| 4 | Profile | time is measured per phase, then per function and line, before anything is optimised |
| 5 | Implement in gated increments | each increment passed the comparison that gates it, and is committed |
| 6 | Preserve exactness | nothing wraps, rounds or approximates silently; impossible states throw; runs are deterministic |
| 7 | Verify independently | a checker sharing no code accepts every value; the checker itself caught planted errors |
| 8 | Benchmark | time, CPU, peak memory and sizes are measured cleanly on a named machine and written down |
| 9 | Manage memory and caching | peak memory fits with margin; the cache key covers every input; eviction is tested |
| 10 | Run regressions | old outputs are byte-identical; every suite passes on the final tree |
| 11 | Document and report | the README says what it covers, costs, how it works, how it is checked, its limits; every example was run |

Steps 4-9 repeat for each increment; 1-3 come first because they decide what is worth building at all.

### 1. Inspect the architecture

Read before designing: the READMEs, the engine, its callers, the regression harness, the existing skills
(here: `tools/course-kit/README.md`, `solver.cjs`, `board.cjs`, `cache.cjs`, `verify.cjs`, `line.cjs`,
`selftest.cjs`, `regress.cjs`, `egtb/README.md`). Write down four things, because every later decision is
checked against them:

- **Contracts.** Not only the documented API but everything callers touch: grep for internals
  (`grep -rn "\.val\b\|\.size\b\|\.decode(\|\.index(" tools/`). Here two course generators walk `T.val` in
  index order, so the classic tables had to keep their layout and order, not just their values; the course
  regression compares the generated PGNs byte for byte.
- **Hard limits.** Index width (2^32), value range (one byte: 254 plies), RAM and cores (`free -g`,
  `nproc`), the disk allowance, the platform's array limits (probe them: `node -e "new Uint8Array(3e9)"`),
  the environment's time limits for commands.
- **Existing independent references.** Anything that computes the same thing another way (chess.js, the K+P
  solver, the pawn oracle, published maxima). They become verification layers.
- **The seam.** The five-piece work kept `solver.cjs` byte-for-byte for the materials it already served and
  routed every other material to a new engine with the same API (`classic(name)`). That left the courses
  untouched, and the overlap (every three- and four-piece table) became a free comparison of two
  implementations that share no code. Prefer such a seam to a rewrite.

Generalise the core data structures (the index takes any number of pieces, groups of identical pieces,
pawn slices) but not the features: nothing was built for six pieces, and nothing blocks them.

### 2. Baseline

Run every existing suite on the untouched tree, in the background with the output in files, before the first
edit: here `kit:selftest` (4.5 min; it also gives the old engine's build times: K+Q vs K+R 13.8 s, K+P+P vs K
promotion 140 s), `kit:test` (1 min), `kit:regress` (5 min, with each course's checksum). A failing baseline
is information: note it, never "fix" it by changing expectations. When an output may change because of your
work (a report, a generated file), keep a pristine copy of the base commit and diff old against new:

```bash
git worktree add <scratchpad>/base <base-commit>   # symlink node_modules into it if needed
git worktree remove <scratchpad>/base              # at the end
```

### 3. Size the target before building it

Count positions per table and per family (every capture or promotion leads into a table that must exist
first), then memory (bytes per value x index size, plus working state per thread) and disk. Get the family
from the code instead of by hand: construct the table objects with a resolver that records instead of solving,
and list their exits. `node <skill dir>/scripts/egtb-family.cjs KRPKR` does exactly that with the engine's own
exit rules: K+R+P vs K+R needs 21 tables, 5 of them five-piece, 1.61 G slots (3.2 GB peak when built);
K+N+N vs K+P 0.85 G; K+P+P vs K+P 125 tables, 75 of them five-piece, 28 G: not built; K+R+P vs K+R+P is 33.4 G
slots on its own, past the 32-bit index (the script says so). Decide from the numbers what to build, and say
what you did not build and why, in the README and the report.

### 4. Profile, do not guess

1. **Phase timers with per-unit costs.** Time each phase (initial pass, retrograde, en passant searches, I/O)
   and divide by the work done: microseconds per position, nanoseconds per predecessor ("unmove"). Units
   compare across tables of different sizes; totals do not. `EGTB_THREADS=1 node <skill dir>/scripts/egtb-phases.cjs
   KRPK` prints them per table, and for pawn tables what the slice schedule would cost on N workers.
2. **Isolate.** Build every sub-table before the clock starts (lazy builds made one table's "initial pass"
   9.7 of its 10.5 s), time a phase alone by calling it directly on part of the index range, and profile on
   one thread (`EGTB_THREADS=1`) so the profile shows the algorithm, not the scheduling.
3. **Profile**: `node --cpu-prof --cpu-prof-dir=prof <build>`, then
   `node <skill dir>/scripts/cpuprofile-top.cjs prof/*.cpuprofile --lines` (self and inclusive time per
   function, the hottest lines; `--under retro` keeps only one function's subtree).
4. **Change one thing**, rerun the equality gate (steps 5 and 7), re-measure the small table and then the
   target: one round here sped up the four-piece tables and did nothing for K+Q+Q vs K+R. An optimisation
   that changes one value is a bug, however fast.
5. **Parallelise last**, once the serial algorithm is right and fast, and prove threads = serial byte for
   byte.

The rounds, what each profile showed and what each change gained are in `references/performance.md`.

### 5. Implement in gated increments

Each increment ends with a comparison against something independent, and is committed when it passes. The
order used for the five-piece engine:

1. Geometry and index: every index decodes to a position that indexes back to itself or to a mirror image.
2. Three-piece, then four-piece tables: equal to the old engine on every position and every orientation (a
   scratch comparison harness, later `kit:selftest5` part 1).
3. The independent checker on small tables, and a mutation test of the checker.
4. Integration early (routing, FEN probing with en passant, the cache producer with chunked I/O), so callers
   exercise the new engine from the start.
5. The first five-piece tables (pawnless), then optimisation rounds (each gated by the old-vs-new
   comparison), then threads (= serial).
6. Full checks of five-piece tables; the new goal (conversion) in engine and checker independently; the pawn
   families (K+R+P vs K+R); published maxima.
7. Unit tests of everything, the course regression, lint and a read-through of the engine; freeze the producer
   files (step 9); then tools, views and documentation in other files.

Keep the new engine self-contained: at first it borrowed the old engine's sub-tables, which made the
comparison partly circular and made K+P vs K+P take 251 s; building its own took it to 54 s and made the
comparison independent. Where a check needs a big table, gate on a small one of the same kind first (K+Q vs
K+R before K+Q+Q vs K+R; K+P vs K+P before K+R+P vs K+R).

### 6. Preserve exactness

- **Overflow throws, never wraps.** A one-byte value of level + 2 = 256 would have become 0, a draw. No test
  found it: reading the whole engine slowly before freezing it did (an earlier read had found nested searches
  sharing one scratch board). Do that read-through; it finds what tests do not reach.
- **Impossible states throw**: a counter below zero, a symmetry weight that is not an integer, a depth past
  the storable maximum. A loud failure in a 30-minute build beats a silent wrong value.
- **Exact shortcuts only.** Symmetry, counters instead of re-checking every move, positions not stored (en
  passant rights: valued by a one-ply search over stored positions) are fine when exact; a counter that counts
  moves into symmetric positions needs weights so every move is counted exactly as often as it is found
  backwards.
- **Deterministic everything.** Iterate in index order; sample with a seeded generator whose every bit is
  random (mulberry32; an LCG's low bits repeat with a short period, and a test generated zero en passant
  positions because of it). Threads may change speed, never bytes.
- **Name the rule boundaries.** The tables ignore the fifty-move rule and castling; `verify.cjs` flags a line
  that passes 100 plies without a capture or pawn move. A boundary nobody wrote down becomes a wrong lesson.

### 7. Verify independently

Use layers, because each one is blind where another sees (designs, numbers and what each caught:
`references/verification.md`):

1. **A second implementation on the overlap**: old engine vs new on every position of every table both can
   build (62 tables, 247 M positions, 0 differences). It gated every optimisation round.
2. **A checker that shares no code**: its own board, move generation, attack test and rules; for every stored
   position the value must follow from the values of its moves (win = 1 + fastest losing reply, loss = 1 +
   slowest winning reply, else draw; mate or stalemate without moves), and every mirror image must find it. By
   induction on the depth, a table that passes everywhere holds exactly the true values (K+R+P vs K+R: 483 M
   positions, none wrong). Make it fast without sharing code (in-place make/unmake, no allocation, index
   ranges on all cores: K+P vs K+P 133 s -> 10 s), or it will not be run on everything.
3. **External references**: move lists against chess.js on random positions (600 per material, en passant
   sets included), published maxima (Thompson's 66 and 59 moves to conversion; 115 for K+N+N vs K+P),
   positions known from theory.
4. **Check the checker**: corrupt stored values of each kind (win, loss, draw, mate) and require the checker
   to flag every one. A checker that has never failed has not shown that it can.
5. **Equivalences**: threads = serial, loaded = built, a colour-swapped view = the direct table, two runs =
   identical outputs. Make sure both sides really ran (a thread test compared two cached tables and passed
   vacuously; its log said "(cache)").

Test expectations are claims too: two theory positions written from memory were wrong (an illegal FEN, an
unverified draw) and were dropped. Check every hand-written FEN for legality and every expected result
against the solver and a second source before it goes into a test.

When the checker and the engine disagree, reduce it to one position, print both sides' moves and child values,
and decide from the rules of the game which one is wrong. A false alarm is fixed by making the checker's
acceptance exact, not wider: pawn placements that are their own mirror image are stored in full, so the fix
accepts exactly "this slot decodes to the exact image, with the same value".

If an external source is unavailable (the Lichess tablebase API answered 403 at the proxy here), do not route
around the network policy; build the evidence locally and say which reference was not used.

### 8. Benchmark

Measure cleanly: a fresh cache directory, nothing else running, default settings, on a named machine; wall
time, CPU time (CPU/wall shows the parallelism actually used), peak memory, positions and bytes; one thread
and all. Two README numbers were wrong until re-measured: a K+Q vs K+R time taken with a non-default
threshold, and a family build first recorded as 430 s (334 s in a clean rerun).

```bash
python3 <skill dir>/scripts/measure.py --label 'KRPKR family, 4 threads, fresh cache' --log bench.jsonl -- node tools/course-kit/egtb/bench.cjs KRPKR
```

(`kit:bench5` adds a census per table and the peak memory from `VmHWM`.) Put the numbers in the README's cost
table with the machine, and re-measure after every engine change.

### 9. Manage memory and caching

- One byte per position; working memory per slice and per thread; tables on shared memory so workers never
  copy them; read cached files straight into that memory in chunks, write them to a temporary file and rename.
- Evict under a budget only what can be read back exactly (`EGTB_MEMORY`, least recently used, never a table
  in use), and test the eviction path on purpose: run the suite with a tiny budget and a fresh cache
  directory (`npm run kit:test5 -- --budget`). A path no run exercises is not known to work: the first such
  run here was killed out of memory, because the budget dropped the very table being probed and every probe
  read 30 MB back from the disk. Now the table just asked for, every table being built or fetching a
  sub-table, and the tables they lead to are never dropped.
- The cache key must cover every input of the values: here a checksum of the producer source files plus a
  format version. Any byte change to a producer file, a lint fix included, invalidates every cached table
  (gigabytes, an hour or more to rebuild). So finish the engine, review it (step 6), lint it, record the
  checksums, and freeze those files; later features go into other files (views, checks, tools). If values
  start to depend on a new option or file, add it to the key.
- Watch the disk allowance: the five-piece cache reached 12 GB (`npm run kit:cache -- prune`).

### 10. Run regressions

On the final tree, not the one before the last edit: `kit:regress` (courses byte for byte, 5 min; `--twice`
for determinism, 10 min), `kit:selftest`, `kit:test`, `kit:test5`, `kit:selftest5` (`--all`, `--heavy`), and
`npm run build`/`npm run lint` for the app. ESLint here covers only `.ts`/`.tsx`: lint the `.cjs` tools with a
temporary config outside the repo (it found two unused imports). A comment-only edit to a producer file still
changes cache identities: rerun what reads the cache.

### 11. Document the limits and report

The README answers five questions: what it covers, what it costs (measured), how it works, how it is checked
(each claim with its scope and the last run's numbers), and its limits with what the next step would need.
Run every example in the docs and file headers (an illegal FEN sat in `solver.cjs`'s header until they were
run), and re-read every number against the final runs (a depth, a time ratio, a speed and a size were wrong).
Search the other docs and skills for the old numbers too.

The report: what was built; what was verified (check, scope, result); what was not verified and why;
performance with the machine; limitations; remaining work. Numbers from the final runs only; a step that was
skipped is reported as skipped.

## Long runs in this environment

- A background command stops at its time limit (30 minutes unless set; at most 2 hours): set the timeout, or
  split the run (`kit:selftest5 --parts 1`, `--parts 2,3,4`), with `> file 2>&1; echo exit $? >> file`.
- Watch output files with a filter that also matches failures (`FAIL|Error|Killed|exit`), and check that the
  job you are waiting for is still alive: two waiters once watched a killed job's file until they timed out.
- Usage limits, worker restarts and context compaction happen in long sessions: background jobs die, memory
  of results fades. Keep results in files, commit and push checkpoints, and rerun interrupted jobs.
- Know which version of a script a long run loaded: editing it while it runs changes nothing for that run
  (`git show HEAD:<file>` shows what a run started from a commit is executing).
- Never `pkill -f` a pattern that also matches your own shell command (it killed the shell, and the edit in
  the same command never ran); kill by PID.
- Heavy jobs side by side distort each other's times and can exhaust memory; probes without `KIT_CACHE`
  silently rebuild five-piece tables.
- Edit files with a script that asserts the old text occurs exactly once; a failed assert has caught stale text.

## Failure modes found so far

| What happened | Caught by | Now |
|---|---|---|
| A depth of 256 plies would wrap to 0 (a draw) in one byte | reading the engine before freezing it | the retrograde step throws past the largest depth |
| Nested searches overwrote each other's scratch board | reading the code | separate scratch ranges per caller |
| Checker reported 158,120 mirror images "not found" (self-mirror pawn placements) | the checker, a false alarm | exact acceptance: same image, same value |
| Random test positions correlated (LCG low bits): zero en passant cases | a test that generated nothing | mulberry32 |
| New engine borrowed the old engine's sub-tables: partly circular checks, 251 s builds | profiling K+P vs K+P | self-contained engine (54 s) |
| Position scan assumed index parity = side to move, wrong for colour-swapped views | code review | parity from the table's own decode |
| Thread test compared two cached tables: it passed without testing threads | its log said "(cache)" | the test solves both tables from scratch (workers reset first) |
| A unit test triggered a hidden cascade of promotion tables (3.5 GB) | memory and CPU of the test | tests call moves() on unsolved tables |
| Holding lines could never end in a rook ending (no insufficient material) | building a real line | ends when the last pawn falls with a draw left |
| The memory budget dropped the table being probed: every probe read it back, memory ran out (killed) | a stress test with a 1 MB budget | tables in use and their sub-tables kept; `kit:test5 -- --budget` |
| Background check killed at 30 minutes | missing results | `--parts`, explicit timeouts |
| Engine edits after the big builds (memory budget, overflow fix, a lint fix) invalidated gigabytes of cached tables | an unexpectedly long rerun | lint and review first, then freeze the producer files |
| Illegal FEN in a header; wrong depth, ratio, speed and size in the README | running every example, re-measuring | examples run, numbers from the final runs |

## Files of this skill

`<skill dir>` is the directory of this file: `.claude/skills/exact-solver-engineering` from the repository root,
`../../.claude/skills/exact-solver-engineering` from `apps/endgame-classroom`, where the npm scripts run.

- `references/repo-map.md`: this repository's engines, contracts, test matrix and times, measured costs,
  knobs, cache identity, and what six pieces would change. Read it before planning work here.
- `references/verification.md`: designing the independent checker, the induction argument, mutation tests,
  what each layer caught, how to word verification claims. Read it when adding a goal, rule or table kind.
- `references/performance.md`: the profiling recipe, the optimisation rounds with their measured gains, the
  parallel design, memory and benchmarks. Read it before optimising.
- `scripts/egtb-family.cjs`: every table a build needs, with sizes and totals, without solving anything.
- `scripts/egtb-phases.cjs`: phase times and per-unit costs of a build, per table (one thread, no cache).
- `scripts/measure.py`: wall time, CPU time and peak memory of any command, optionally logged as JSON lines.
- `scripts/cpuprofile-top.cjs`: summarises `node --cpu-prof` output by function and line (`--under fn`).
