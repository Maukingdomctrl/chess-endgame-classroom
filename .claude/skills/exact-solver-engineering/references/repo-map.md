# This repository: the solver's map, test matrix, costs and knobs

Paths are relative to `apps/endgame-classroom/`. Numbers were measured in October 2026 on the 4-core, 16 GB
cloud machine; re-measure before quoting them as current.

## Contents

1. Engines and their contracts
2. Test matrix
3. Measured costs
4. Knobs
5. Cache identity
6. Six pieces: the design and what is left

## 1. Engines and their contracts

| Code | Role | Contract to keep |
|---|---|---|
| `tools/course-kit/solver.cjs` | the classic engine: up to 4 pieces, pawns on one side at most; also the router (`classic(name)`) that hands every other material, and every `goal: 'conversion'` table, to egtb | built-in courses depend on its tables **and their order**: generators such as `ladder-course/search.cjs` and `pawn/enumerate.cjs` walk `T.val` in index order and use `T.size`, `T.decode`, `T.index`; keep its code paths byte-for-byte; `table/probe/probePromotion/probeConversion/fenPieces/normalise/classic` API |
| `tools/course-kit/egtb/` | the five- and six-piece engine (see its README): `geometry` (attack tables, king pairs, combinations), `layout` (index), `engine` (forward counting pass, retrograde levels, en passant search, goals), `index` (registry, sub-tables, memory budget, storage and width per table), `parallel` (workers, shared memory), `store` (values on disk read in pages, page cache) | same API as `solver.cjs` tables: `value(sqs, stm)`, `valueEp`, `options`, `moves`, `legal`, `inCheck`, `index`, `decode`, `valueAt`, `stores`, `size` |
| `egtb/check.cjs` | the independent checker (own 8x8 board, moves, attack scan, e.p. and goal rules) | must share no board logic with the engine |
| `egtb/parallel.cjs` | worker pool; tables on shared memory (or on disk, opened by their file), attached to the workers by `name:goal` | a second table object with the same name and goal is silently skipped by `attach`: never build one while the first is attached (`egtb.reset()` or `detach` first), or the workers solve into the old one |
| `egtb/flip.cjs` | colour-swapped views (mate goal): `table('KRKRP')` reads `table('KRPKR')` | the stored side has more material |
| `egtb/positions.cjs`, `egtb/survey.cjs` | finding teaching positions; what an ending offers a course | deterministic (index order, seeded samples) |
| `tools/course-kit/pawn/oracle.cjs` | pawn oracle (promotion goal), used by the pawn course and its checker | |
| `tools/course-kit/cache.cjs` | disk cache (`KIT_CACHE`) | see section 5 |
| `verify.cjs`, `line.cjs`, `pgn.cjs`, `teach/` | the course pipeline on top of `probe`/`table` | goals `mate`, `promotion`, `conversion`; objectives win/hold |

Value encoding (both engines): `v > 0` the side to move mates in `v` plies, `v < 0` it is mated in `-v - 1`
plies, `0` a draw. Stored in egtb as plies + 1, 0 = draw: one byte up to five pieces (deeper than 254 plies
throws), two from six (65,534).

## 2. Test matrix

| Command (`npm run ...`) | What it proves | Independent of the engine? | Time |
|---|---|---|---|
| `kit:selftest` | classic engine: moves = chess.js, retro step inverts every move, values consistent on samples, published maxima, lines, promotion goal = kpk solver | yes (chess.js, kpk.cjs) | 4-4.5 min |
| `kit:test` | toolkit unit tests (course-kit, pawn, teach, opposition curricula), incl. broken lines the verifier must reject, the fifty-move flag | partly | about 1 min |
| `kit:test5` | egtb: index round trips (six-piece layouts included), moves (engine's and checker's) = chess.js incl. e.p. and pins, routing, flip views, egtb = solver.cjs on small tables, checker runs, mutation test (14 corruptions), threads = serial byte for byte, storage and widths (memory or disk, one thread or workers, two-byte values, 64-bit lists: the same values, each in a fresh process), e.p., lines | yes | @@TEST5-TIME |
| `kit:test5 -- --budget` | the same with a fresh disk cache, a 1 MB memory budget and a 1 MB page cache: every table dropped and read back (the eviction path), pawn tables solved and read from disk | - | @@BUDGET-TIME |
| `kit:selftest5` | part 1: egtb = solver.cjs on every position (`--all`: 62 tables, 247 M positions, 9 min); part 2: the checker on every position (KPKP, conversion tables, KNNNK, KPPPK promotion, KQQKR, KBBKN, KRBKR; `--heavy` KRPKR 483 M); part 3: published maxima (Thompson KBBKN 66, KRBKR 59; KNNKP 115) and theory positions; part 4: lines (mate, conversion, a Philidor draw held) | yes | about half an hour default on four cores; `--heavy` adds about 20 minutes of checking; split with `--parts 1` / `--parts 2,3,4` |
| `kit:check5 -- KRBKR [--goal g] [--sample f]` | the checker on one table, all threads | yes | 5-9x the build time |
| `kit:bench5 -- KRPKR [--goal g] [--json f]` | build cost and census of a table and its sub-tables; peak memory (VmHWM) | - | the build time |
| `kit:regress [-- --twice]` | every built-in course PGN byte for byte (twice: determinism) | - | 5 min (kpk 4 s, basics 33 s, ladder 53 s, pawns 217 s); `--twice` 10 min |
| `npm run build`, `npm run lint` | the app compiles; ESLint on `.ts`/`.tsx` only (lint the `.cjs` tools with a temporary config outside the repo) | - | about a minute |
| `kit:cache [-- prune\|clear]` | list / prune stale cache files | - | seconds |

Run the heavy ones in the background with their output in a file (see SKILL.md, "Long runs").

## 3. Measured costs (all threads, nothing cached unless said)

| Build | Positions | Time | Peak memory |
|---|---|---|---|
| K+R+P vs K+R with its family (K+Q+R, K+R+R, K+R+B, K+R+N vs K+R, all smaller tables) | 483 M (1.56 G) | 334 s (the KRPKR table itself 130 s) | 3.2 GB |
| K+N+N vs K+P with its four promotion tables | 279 M (0.83 G) | 131 s | 2.2 GB |
| K+Q+Q vs K+R | 63 M | 42 s; 102 s on one thread | 1.0 GB; 0.6 GB |
| K+B+B vs K+N and K+R+B vs K+R, goal conversion | 85 M, 153 M | 68-76 s both | 1.7 GB |
| classic engine, for comparison: K+Q vs K+R; K+P+P vs K promotion | 2.5 M; 3.8 M | 13-15 s (egtb about 3 s on one thread); 135-160 s (egtb 1-3 s) | |

Checker on every position (four threads; times vary up to 40% with other jobs running): KPKP 10 s, KNNNK
47 s, KPPPK promotion 128-147 s, KQQKR 151-232 s, KBBKN 153 s, KRBKR 283-359 s, KRPKR 790-1116 s.
On disk: one byte per index up to five pieces (KRPKR 677 MB; a pawnless five-piece table 114-231 MB), two
from six; the cache directory reached 12 GB in the five-piece work.

@@SIX-COSTS

Families that were sized and not built: K+R vs K+P+P (15 five-piece tables, 5 G positions), three pawns with
the mate goal (35, 9.3 G), pawns against a pawn (K+P+P vs K+P: 75 tables, 28 G); with six pieces, K+R+P vs
K+R+P (120 tables, 25 six-piece, 559 G slots, 1.1 TB; its biggest solve, the pawnless K+Q+R vs K+Q+R, 78 GB in
memory), K+R+P+P vs K+R (71 tables, 280 G slots), K+N+N+N vs K+P (23 tables, 18 G slots, 35 GB), K+P+P vs
K+P+P (440 tables, 9.6 TB): `scripts/egtb-family.cjs`.

## 4. Knobs

| Variable | Effect |
|---|---|
| `KIT_CACHE=1` (or a directory) | keep solved tables on disk in `tools/.kit-cache`; strongly advised for five pieces |
| `EGTB_THREADS=n` | worker threads (default: cores, at most 8); `1` = no workers (profile with this) |
| `EGTB_PARALLEL_FROM=n` | index size from which a table is solved on workers (default 4e6; `kit:test5` sets 1 so small tables exercise the parallel code) |
| `EGTB_MEMORY=MB` | with the cache on, tables in memory stay under this budget (default 60% of RAM, at least 2 GB); least recently used tables no build needs are dropped and read back from disk. The table just asked for, tables being built or fetching a sub-table, and the tables they lead to are never dropped (a soft limit). No ordinary run reaches the budget: `npm run kit:test5 -- --budget` runs the unit tests with a fresh cache and 1 MB. A pawn table whose values take more than half of it is kept on disk |
| `EGTB_STORAGE=disk\|memory` | forces where pawn tables are kept (tests); pawnless tables are always solved in memory |
| `EGTB_PAGE_CACHE=MB` | pages of tables on disk kept in memory per process (default a quarter of RAM; the workers share it out); slices solved at once fit in 60% of RAM less this |
| `EGTB_WIDTH=1\|2` | bytes per value of every table (default 1 up to five pieces, 2 from six); one width per material in a run |
| `EGTB_LIST64=1` | 64-bit position lists for every domain (tests; used anyway past 2^32 slots) |

## 5. Cache identity

A cache file is used only when its producer's checksum matches: `cache.cjs` hashes the producer's source
files (`PRODUCERS`) plus `FORMAT`.

- `solver`: `solver.cjs`, `board.cjs`. Even a comment edit in `solver.cjs` invalidates the classic tables
  (cheap to rebuild).
- `egtb`: `egtb/geometry.cjs`, `layout.cjs`, `engine.cjs`, `index.cjs`, `parallel.cjs`, `store.cjs`. An edit
  to any of them invalidates every cached egtb table (gigabytes, an hour or more for the big families). Finish engine
  changes, then treat these files as frozen; put tools, views and checks in other files (`check.cjs`,
  `flip.cjs`, `positions.cjs`, `survey.cjs`, `bench.cjs` are deliberately not producers).
- If a table's values come to depend on anything else (a new option, a new file), add it to the key or to
  `PRODUCERS`, or old files will answer for new code. Bump `FORMAT` when the file layout changes.
- Files are read straight into the table's own memory (shared memory when workers need it, `opts.make`) in
  64 MB chunks, and written to a temporary file that is then renamed: no second copy of a table of up to
  710 MB in memory, no single huge I/O call, no half-written file after a crash. A table on disk is built in
  its temporary file (`createWrite`: header, room for every value, each solved slice written at its place)
  and renamed when complete, then read in pages (`openRead`, same checks as `load`). Temporary names carry
  the process number; `prune` deletes those of processes that are gone.
- `FORMAT` 2 (the six-piece engine): a 64-bit count in the header. It made every older file stale, the
  classic engine's included.
- Stale files take disk: `npm run kit:cache -- prune`.

## 6. Six pieces: the design and what is left

Carried over unchanged: the layout (groups of identical pieces, pawn slices, any number of pieces), the
counting retrograde algorithm, the slice waves on workers, the checker and the test matrix.

Changed (the egtb README, "Six pieces", has the details):

- Index: plain numbers, exact past 2^32 (guard at 2^52 slots); groups of up to four identical pieces (`c4`,
  combinations built on first use).
- Values: two bytes from six pieces on (`Uint16Array`, deepest 65,534 plies), one byte below, so the
  five-piece tables kept their bytes and their cached files' values.
- Each domain is solved on its own values view with local indexes (`d.vals`, `j = i - d.lo`): position lists
  and schedules stay `Uint32Array` unless a domain passes 2^32 slots (`Float64Array`, exact to 2^53). A
  predecessor outside the domain throws.
- Storage: a pawn table bigger than half the memory budget lives in its cache file, built slice by slice
  (`store.cjs`: one page = one slice, a global least-recently-used page cache); workers open the file and
  write their slices; pawnless tables stay in memory (one domain).
- Cache format 2 (64-bit count), per-process temporary files.

Verified here: the 74-table reference set byte-identical to the pre-six-piece engine (by default and from
disk on the workers), the storage and width matrix in `kit:test5`, six-piece layouts, two real six-piece
tables built and checked on every position (`references/performance.md` and the egtb README have the numbers).

Left to do, in order of need:

1. A machine: the rook-and-pawn families need about 128 GB of memory (the pawnless K+Q+R vs K+Q+R solve alone
   is 78 GB at five bytes per slot) and over a terabyte of disk. Size the family first (`egtb-family.cjs`).
2. One memory plan instead of three separate fractions (`EGTB_MEMORY` 60%, `EGTB_PAGE_CACHE` 25%, slices
   60% less the page cache): until then, set them by hand for the machine.
3. Pawnless tables from disk. They cannot be cut into independent domains as pawn tables are (king and piece
   moves are reversible); it needs another algorithm, such as predecessor updates collected, sorted by index
   and applied while streaming the values from disk.
4. The real gates for a family: build the smallest six-piece pawn table of it first (gate on the small one of
   the same kind), check every table of the family with `check.cjs` (5-9x the build time), and measure the
   build rate on that machine before promising anything to a course.
