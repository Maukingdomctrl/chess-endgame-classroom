# Performance and memory without losing exactness

## Contents

1. Measure first, and keep the gate ready
2. The profiling recipe
3. The optimisation rounds of the five-piece engine
4. Making the checker fast too
5. Parallelism that cannot change a value
6. Memory
7. Caching
8. Benchmarks people can trust

## 1. Measure first, and keep the gate ready

Sizing (positions, bytes, the family of tables a build needs) tells you whether a target fits; timing tells
you where the time goes. Neither can be read off the code: in the five-piece engine the first profile put half
the time in the solve loop, 16% in move generation and 14% in index arithmetic, and later rounds moved the
bottleneck each time.

Before optimising anything, have the equality gate ready and fast: the old and new tables compared on every
position of a fixed set of tables. Here a scratch harness timed both engines on the same table and compared
every legal position in every orientation; every round below passed it with 0 differences before its timing
counted.

## 2. The profiling recipe

1. **Phase timers and per-unit costs** in the build (`stats.forwardMs`, `stats.retroMs`, a counter of
   predecessors visited). Divide: microseconds per position for the initial pass, nanoseconds per predecessor
   ("unmove") for the retrograde pass. K+Q vs K+R at the start: 6.35 s = initial pass 2.97 s (1.2 us per
   position) + retrograde 3.38 s (52.9 M unmoves, 64 ns each). Units compare across tables; totals do not.
   `EGTB_THREADS=1 node <skill dir>/scripts/egtb-phases.cjs KRPK` prints them for every table of a build (the
   finished engine: about 0.4 us per position and 35-55 ns per unmove on the four-piece tables).
2. **Build the sub-tables first** (`prepareExits()`), outside the timed region: lazy builds inside the timed
   pass made K+B vs K+P's "initial pass" 9.7 of its 10.5 s.
3. **Isolate a phase** by calling it directly on part of the index range (e.g.
   `T.forward(domain, 0, 12000000, schedule)`), and profile on one thread (`EGTB_THREADS=1`).
4. **CPU profile** a representative small table (seconds, not minutes; same code paths as the target: K+Q vs
   K+R for pawnless, K+P vs K+P for pawn slices), then the target itself once:

   ```bash
   EGTB_THREADS=1 node --cpu-prof --cpu-prof-dir=prof -e "require('./tools/course-kit/egtb/index.cjs').table('KQKR')"
   node <skill dir>/scripts/cpuprofile-top.cjs prof/*.cpuprofile --lines
   node <skill dir>/scripts/cpuprofile-top.cjs prof/*.cpuprofile --under forward   # one phase only
   ```

   Read self time (where the CPU is) and inclusive time (on whose behalf), then the hottest lines. `--under`
   keeps one function's subtree, for when other work (sub-tables, start-up) pollutes the profile.
5. **Change one thing**, pass the gate, re-measure the small table *and the target*, log (change, before,
   after) so the README's numbers have a source.

## 3. The optimisation rounds of the five-piece engine

Target: K+Q+Q vs K+R (63 M positions), measured on one thread unless said.

| Round | What the profile showed | Change | Result |
|---|---|---|---|
| 0 | solve loop 50-55%, move generation 13-16%, index arithmetic 14%, attack tests 7-8% | (first working version) | 265 s |
| 1 | divisions in iteration and indexing; full legality tests for every predecessor | odometer iteration (no divisions), pin detection in move generation, incremental predecessor index (change one digit of the child's index), cheap predecessor legality from discovered-line and self-check geometry, sorted frontiers | 156 s (K+Q vs K+R 6.35 -> 4.2 s; K+N+N+N vs K 70 -> 38.5 s) |
| 2 | initial pass: move generation 46%, safety tests 14% | evaluate() counts the quiet moves that stay in the table instead of writing them out | four-piece tables faster, K+Q+Q vs K+R not (160 s): measure the target |
| 3 | evaluation 56%, safety tests 17% | one enemy attack map per position (own king lifted, for king moves); blocker counting with ray bitmasks for unpinned sliders; sub-tables built before timing | 118 s (initial pass 78.6 -> 41.6 s; K+N+N+N vs K 29 s) |
| 4 | retrograde 87%: the sheer number of predecessors (2.16 G unmoves), plus repeated attack tests on children in check | find the checking pieces once per child; test predecessors with line and between masks | 111 s (retrograde 63 s) |
| 5 | one core of four busy | worker threads on shared memory | 42 s on 4 threads (clean rerun: 101.7 s on 1 thread, 624 MB; 41.7 s on 4, 998 MB: 2.4x) |

For comparison, the old engine (re-checks every move of a candidate) builds K+Q vs K+R in 13-15 s; the new one
in about 3 s on one thread. In the finished engine's profile of K+Q vs K+R (3.3 s), the retrograde step is
45% self time, evaluation 18%, attack tests 5%, index decoding 4%; the hottest line reads each predecessor's
value: the work is the number of predecessors, so further gains need fewer predecessors visited, not faster
arithmetic.

Lessons:

- **Count, don't re-check.** A counter per position (moves that do not lose yet) makes the retrograde pass
  O(moves) instead of O(moves x levels). It needs exact weights where moves lead to symmetric positions.
- **Don't write out what you only need to count** (round 2), and compute shared facts once per position, not
  once per move (round 3) or once per predecessor (round 4).
- **Make the common case cheap and the rare case exact**: en passant positions are not stored; a one-ply
  search values them when needed.
- **A gain on small tables is a hypothesis about the big one** (round 2).

## 4. Making the checker fast too

The checker must run on every position, so its speed decides whether verification happens at all. The first
version cost 33-70 us per position on one thread (K+P vs K+P: 133 s). Rewritten with in-place make/unmake and
no allocation in the loop, and run over index ranges on all cores (`checkParallel`), it took 9.9 s, all
without sharing any code with the engine. Plan for checks of five to nine times the build time.

## 5. Parallelism that cannot change a value

- Find work that is independent by construction: pawn slices of the same advancement never depend on each
  other (a pawn move always leads to a more advanced slice), so each worker owns whole slices, wave after
  wave; no atomics.
- Where work is shared (a pawnless table: the initial pass cut into chunks, each retrograde level split into
  tasks), make every update atomic and idempotent: a win is set by compare-exchange (all writers write the same
  level), a counter is decremented atomically, and the thread that takes it to zero resolves the position.
- Keep the API synchronous if callers expect it: the main thread loops on `receiveMessageOnPort` and
  `Atomics.wait`, so `table()` and `probe()` stay synchronous.
- Don't parallelise small tables (overhead): a threshold (`EGTB_PARALLEL_FROM`, 4 M slots), overridden in the
  tests so that small tables still exercise the parallel code.
- Prove it: threads = serial byte for byte, on each scheme (K+Q vs K+R for the atomics, K+P vs K+P for slices),
  with both builds really performed, not loaded from the cache.

## 6. Memory

- One byte per position up to five pieces, two from six (depth + 1, 0 = draw); overflow throws. K+R+P vs
  K+R: 710 M slots, 677 MB.
- Probe the platform's limits before designing storage: `Uint8Array(3e9)`, `SharedArrayBuffer(2.5e9)` and
  `Uint16Array(5e9)` (atomics at index 4,999,999,999 included) work in Node 22 here. The five-piece index was
  limited to 2^32 by its `Uint32Array` frontiers; the six-piece engine keeps them per domain with local
  indexes, 32-bit unless a domain passes 2^32 slots (then `Float64Array`), and the index itself in plain
  numbers. 64-bit lists cost about a quarter more time on the small tables tried (forced with
  `EGTB_LIST64=1`).
- Working state only where it is needed: counters and frontiers per domain (one slice for pawn tables), per
  thread. Tables and counters on `SharedArrayBuffer`, attached to workers once.
- A budget for the tables kept in memory (`EGTB_MEMORY`, default 60% of RAM, at least 2 GB) with
  least-recently-used eviction, only when the evicted table can be read back exactly (the disk cache is on).
  Never evict a table in use: the first version dropped the table just asked for when it alone exceeded the
  budget, so every probe read it back (30 MB each) until the process was killed. Keep the table just asked
  for, every table being built or fetching a sub-table, and the tables they lead to; the budget is then a soft
  limit. Test the path with a tiny budget (`npm run kit:test5 -- --budget`); no ordinary run reaches it.
- Measure the peak, not the average: `VmHWM` in `/proc/self/status` at the end of a run (`bench.cjs`), or
  `scripts/measure.py` for any command. K+R+P vs K+R with its family: 3.2 GB; K+N+N vs K+P with its family:
  2.2 GB; K+Q+Q vs K+R: 1.0 GB on four threads, 0.6 GB on one.
- When the values outgrow the memory (six pieces), keep the unit of work the unit of storage: a pawn slice is
  solved alone (its pawn moves lead to slices already solved), so it is one page of the file, written once
  when solved and read through a least-recently-used page cache afterwards. Measured on the 74-table
  reference set solved from disk on four threads: K+R+P vs K+R 148 s instead of 135 s in memory, peak
  memory 4.5 GB instead of 4.0 GB; but tables of thousands of tiny slices (K+P+P+P vs K: 7,224 slots per
  slice) pay a per-lookup cost when moves alternate between pages: the promotion tables of K+P+P and
  K+P+P+P vs K took 81 s instead of 12 s. @@PROFILE

## 7. Caching

- The identity of a cached table is the checksum of the source files that produce its values plus a format
  number; anything else that can change a value (an option, a goal, a new file) must be in the key.
- Editing a producer file throws away every cached table it produced: plan engine edits in batches, lint and
  review before the long builds, then freeze those files; keep views, tools and checks outside them.
- Read big files straight into the destination array (shared memory if workers need it) in chunks; write to a
  temporary file and rename, so a killed job leaves no partial file. A cached 677 MB table loads in 0.6 s.
- Use the cache for iteration speed; benchmark and run the final checks once with a fresh cache directory, so
  nothing depends on a file only you have.

## 8. Benchmarks people can trust

- Name the machine (cores, RAM), the threads, cached or not, and what the time includes (sub-tables).
- Report wall and CPU time (their ratio is the parallelism actually achieved) and peak memory.
- Run alone, with default settings, in a fresh cache directory: a family build first recorded as 430 s took
  334 s in a clean rerun; a K+Q vs K+R time was taken with a non-default threshold; checker times varied by up
  to 40% with other jobs running (K+Q+Q vs K+R 151-232 s, K+R+P vs K+R 790-1116 s).
- Measure twice when a number will be quoted; quote a range when runs differ.
- Re-measure after every change that touches the engine, and update the README table in the same commit.
