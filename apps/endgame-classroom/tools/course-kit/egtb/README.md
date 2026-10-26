# egtb: exact endgame tables with up to six pieces

The toolkit's engine for five- and six-piece endings, and for four-piece endings with pawns on both sides (en
passant). `../solver.cjs` hands it every material it does not build itself and has the same API, so the course
tools work unchanged: `probe(fen)`, `table(name)`, `line.cjs`, `verify.cjs`, the teaching layer. A six-piece
ending worth a lesson takes a bigger machine than the 16 GB one it was written on (see "Six pieces"): here
only the smallest six-piece tables were built.

```js
const { probe, probeConversion, table } = require('../solver.cjs');
probe('1K6/1P1k4/8/8/8/8/r7/2R5 w - - 0 1');           // Lucena: { result: 'win', dtm: 41 }
probeConversion('1K6/1P1k4/8/8/8/8/r7/2R5 w - - 0 1'); // plies until White captures or promotes into a won position
const T = table('KRPKR');  // value(sqs, stm), options(sqs, stm, ep), moves(), legal(), inCheck(), size, decode(), valueAt()
table('KRKRP');            // the same table seen with the colours swapped (flip.cjs): defending lessons share it
```

```bash
npm run kit:test5                                   # unit tests (about 11 minutes)
npm run kit:test5 -- --budget                       # 1 MB memory and page budgets: tables dropped, read back, on disk
npm run kit:selftest5                               # the full check, see "How it is checked" (-- --quick, --heavy, --all, --parts 2,3)
npm run kit:check5 -- KRBKR                         # the independent checker on every position of a table
npm run kit:bench5 -- KRPKR                         # build a table and its sub-tables: time, memory, contents
npm run kit:positions -- KRPKR --goal conversion --result win --plies 7-15 --unique --limit 20
node tools/course-kit/egtb/survey.cjs KRKRP --objective hold   # what an ending offers a course (sampled)
KIT_CACHE=1 ...                                     # keep solved tables on disk (strongly advised for five pieces)
KIT_CACHE=/big/disk ...                             # six pieces: the tables solved on disk are written there
EGTB_THREADS=1 ...                                  # one thread (default: every core, at most 8)
```

## What it covers

- **Materials**: any with up to six pieces (the two kings and up to four more, at most four of them
  identical), either colour, pawns included, pawns on both sides included. A FEN's en passant square is used
  when the capture is legal (chess.js writes it only then).
- **Goals** (`table(name, { goal })`):
  - `'mate'` (default): distance to mate, in plies, both sides playing their best (the winner the fastest
    mate, the loser the longest defence).
  - `'conversion'` (new, any material): plies until White makes a capture or a promotion after which the
    position is still won (by the mate table of what is left), or mates. Black's captures and promotions do
    not end the count. White is never lost and Black never wins in these tables: a position is won for
    White or it is not. It is the natural end of a lesson in a five-piece ending (the Lucena: the safe
    promotion; a skewer: the rook won), where the mate can be 30 more moves of a different ending.
    `verify.cjs` and `line.cjs` take `goal: 'conversion'`: the line ends with the learner's conversion.
  - `'promotion'`: White's pawns against the lone king, plies to a safe queen or rook promotion (as in
    `solver.cjs`, now also with three pawns).
- **Colours**: a mate table serves its colour-swapped twin (`flip.cjs`): `table('KRKRP')` reads
  `table('KRPKR')`. The stored side is the one with more material.
- **Not covered**: castling; the fifty-move rule (the tables ignore it; `verify.cjs` reports a line in which 50
  moves pass without a capture or a pawn move, because five-piece wins can need more: two bishops against a
  knight up to 66 moves to the conversion).

## What it costs

Measured on the 4-core cloud machine (16 GB), all threads, nothing cached; times include every table a
capture or promotion leads to. Longest = the longest win in moves (to mate, or to the conversion).

| Table(s) | Positions | Time | Peak memory | Longest |
|---|---|---|---|---|
| K+R+P vs K+R, with K+Q+R, K+R+R, K+R+B, K+R+N vs K+R and every smaller table | 483 M (1.56 G with the others) | 334 s (K+R+P vs K+R itself 130 s) | 3.2 GB | 74 (mate) |
| K+N+N vs K+P, with its four promotion tables | 279 M (0.83 G) | 131 s | 2.2 GB | 115 (mate) |
| K+Q+Q vs K+R | 63 M | 42 s; 102 s on one thread | 1.0 GB; 0.6 GB | 35 (mate) |
| K+B+B vs K+N, K+R+B vs K+R, goal conversion | 85 M, 153 M | 68-76 s for both | 1.7 GB | 66, 59 (to the conversion) |
| K+N+N+N+N vs K (six pieces, two-byte values) | 430 M | 260 s (the table itself 246 s) | 4.0 GB | 18 (mate) |
| K+P+P+P+P vs K, goal promotion (six pieces) | 586 M | 148 s (the table itself 128-130 s); from disk 160 s (148 s) | 1.9 GB; from disk 6.2 GB (page caches) | 24 (to the promotion) |

For comparison, `solver.cjs`'s engine builds K+Q vs K+R in 13-15 s (the egtb engine: about 3 s on one thread)
and K+P+P vs K with the promotion goal in 135-160 s (egtb: 1-3 s, without the mate tables it does not need).
Checking a table on every position with `check.cjs` takes five to nine times as long as building it (K+R+P vs
K+R: 13 to 19 minutes on four threads, depending on what else runs).

A pawnless table is solved in one piece; a table with pawns slice by slice (one slice per placement of the
pawns, the most advanced first), so its working memory is one slice per thread. On disk (`KIT_CACHE`) a table
takes one byte per index up to five pieces (K+R+P vs K+R 677 MB, a pawnless five-piece table 114-231 MB) and
two from six.

What a family of tables needs, for planning (five-piece tables in it, their indexes):

| Ending | Five-piece tables | Size |
|---|---|---|
| pawnless (K+B+B vs K+N, K+R+B vs K+R, K+Q vs K+R+R ...) | 1 | 0.1-0.24 G |
| piece and pawn against a piece (K+R+P vs K+R, K+Q+P vs K+Q, K+B+P vs K+B, K+N+N vs K+P) | 5 | 0.8-1.6 G |
| K+R vs K+P+P | 15 | 5 G |
| three pawns (K+P+P+P vs K, mate) | 35 | 9.3 G |
| pawns against a pawn (K+P+P vs K+P, K+P vs K+P+P) | 75 | 28 G |

Every promotion leads to an ending with a queen that has to be solved too (exact values after a promotion
need it), which is what makes the last rows big. The goal `'promotion'` (pawns against the lone king) needs
none of that. With `KIT_CACHE` on, the tables in memory stay under a budget (`EGTB_MEMORY` in MB, default 60%
of the machine): the least recently used ones are dropped and read back from the disk when needed. The table
just asked for, the tables being built or fetching a table they lead to, and the tables those lead to are never
dropped, so the budget is a soft limit. Without the cache every table stays in memory.

## How it works

- **Index** (`layout.cjs`). Pawnless: the 8 symmetries of the board, the white king in the a1-d1-d4 triangle
  and, on the diagonal, the black king on or below it: 462 king pairs. With pawns: one slice per placement of
  the pawns, a placement and its mirror image (a <-> h) stored once (a placement that is its own mirror image
  in full); in a slice, any of the 3612 legal king pairs. Identical pieces are stored once, as a combination
  (two rooks: 2016 placements instead of 4096; up to four identical pieces). Indexes are plain numbers, exact
  past 2^32 (the layout refuses a table of more than 2^52 slots). Values: plies to mate + 1, 0 for a draw, in
  one byte up to five pieces (254 plies at most) and two from six (65,534); a deeper table throws instead of
  storing a wrong value.
- **Storage** (`index.cjs`, `store.cjs`): a table is kept in memory, unless it is a pawn table whose values
  take more than half the memory budget (six pieces): then it is solved slice by slice into its cache file and
  read back in pages, one page per slice, through a page cache (see "Six pieces").
- **Solve** (`engine.cjs`), per domain (a pawnless table, or one slice, most advanced first):
  1. every position: checkmate, stalemate; the moves that stay in the domain (a piece move without a capture)
     are counted; every other move (a capture, a pawn move, a promotion) leads to a solved table or slice, so
     its value is known now. A winning one schedules the win; a drawing one means the position is never lost.
  2. retrograde, level by level (plies to mate): from a position lost in L, every predecessor wins in L + 1;
     from a position won in L, every predecessor has one move fewer that does not lose, and when none is left
     it is lost in 1 + its longest losing move. Each move is processed once (counters, not re-checking every
     move); a position whose moves lead to symmetric positions (everything on a diagonal) is counted with
     weights so that each move is counted exactly as often as it is found backwards. Each level's positions
     are sorted first, so that their predecessors are read in memory order.
  3. en passant: a double step next to an enemy pawn leads to a position with the en passant capture, which is
     not stored; its value comes from its moves, a one-ply search over solved positions.
- **Threads** (`parallel.cjs`): the tables are on shared memory and the main thread waits synchronously, so
  `table()` and `probe()` stay synchronous. Slices of one advancement do not depend on each other: each worker
  solves whole slices. A pawnless table's levels are shared out and the workers update values and counters
  with atomic operations (compare-exchange for a win, atomic decrement for a counter). A table on disk is
  opened by its file in every worker, which writes the slices it solves.
- **Exits**: the engine builds every table it needs itself, down to two kings. Its tables with up to four
  pieces hold exactly `solver.cjs`'s values (checked position by position), but `solver.cjs` keeps building
  its own for the courses, so nothing they depend on changes.

## How it is checked

`npm run kit:selftest5` (and `kit:test5`), results in the last run:

1. **Against `solver.cjs`**, a separate implementation (another index and symmetry handling, another move
   generator, another algorithm): every position of the three-piece tables and of fourteen four-piece tables
   chosen to cover every kind of piece on both sides (`--all`: all 54 four-piece materials) has the same value,
   goal `'promotion'` included.
2. **The independent checker** (`check.cjs`): its own 8x8 board, move generation, attack test (scanning out
   from the king), en passant and goal rules; it uses only what a table stores. Every stored value must follow
   from the values of its moves (win = 1 + the fastest losing reply, loss = 1 + the slowest winning reply,
   else a draw; mate and stalemate when there is no move), and every mirror image of a position must find it.
   By induction on the distance to mate, a table that passes on every position holds exactly the true values.
   Checked on every position: K+P vs K+P (en passant, 7.4 M), the conversion goal (K+Q vs K+R, K+R vs K+P,
   K+P vs K+P), K+N+N+N vs K (30 M), K+P+P+P vs K with the promotion goal (54 M), K+Q+Q vs K+R (63 M), K+B+B vs
   K+N (85 M), K+R+B vs K+R (153 M), and with `--heavy` K+R+P vs K+R (483 M): no value wrong, no index error.
   Each of 14 deliberately corrupted values (a win, a loss, a draw, a mate, each changed) is found (mutation
   test).
3. **Published values**: Thompson's longest wins to the conversion, two bishops against a knight 66 moves and
   rook and bishop against rook 59, come out exactly; so do the longest mates two knights against a pawn 115,
   K+Q vs K+R 35, K+R vs K+N 40, K+R vs K+B 29, K+R vs K+R 19 and K+R+B vs K+R 65. Lucena wins, Philidor
   draws.
4. **Move generation against chess.js**, the engine's and the checker's, on random five-piece positions,
   en passant ones included (and a pinned pawn that may not take en passant).
5. **Lines** played by `line.cjs` on five pieces pass `verify.cjs` (mate, conversion, and a Philidor draw held).
6. **Threads change nothing**: a table solved on the worker threads equals the one-thread solve byte for byte
   (a pawnless table, whose levels are shared out with atomics, and a pawn table, solved slice by slice; both
   solved from scratch, never read from the disk cache).
7. **The memory budget**: `kit:test5 -- --budget` runs every unit test with a fresh disk cache and a 1 MB
   budget, so tables are dropped and read back all the time: 240 tables dropped, every test passes. (Its first
   run found a bug: the budget dropped the very table being probed, every probe read it back from the disk,
   and the process ran out of memory. Tables in use are now kept.) Since the six-piece engine it also caps
   the page cache at 1 MB and keeps every pawn table bigger than half a megabyte on disk.
8. **Six pieces**: see "Six pieces" below: the reference set identical in memory and from disk, two six-piece
   tables checked on every position.

The course regression (`npm run kit:regress`) shows the built-in courses unchanged byte for byte.

## Finding teaching positions

- `positions.cjs`: `scan(T, filters)` walks the stored positions in index order (deterministic; a seeded
  `sample`), cheapest test first; `analyse(T, sqs, stm)` reads every move from the table: its exact value, the
  fastest wins (or every drawing move, or the longest defences), whether exactly one move keeps the result (a
  defensive resource), the kind of each move (capture, promotion, underpromotion, en passant, check, quiet),
  stalemate, zugzwang. The command line prints candidates with their traps ("a8=Q draws").
- `survey.cjs`: what an ending offers before a lesson list is proposed: wins by depth, the share with a
  single fastest move and its kind, tempting moves that fail; or, with `--objective hold`, the draws with a
  single holding move.

### What K+R+P vs K+R offers a course (surveys of a 0.2% sample, seeded)

| | |
|---|---|
| White to move, White wins (measured to the conversion) | about 159 M positions; a single fastest move in 70-81% of every depth band (1-5 plies 70%, 21-40 plies 77%, more than 40: 81%) |
| that single move | a capture 52%, a pawn move 19%, a king move 11%, a check 9%, a quiet rook move 8%, a promotion 1%, an underpromotion about 9 000 positions (a8=R where a8=Q stalemates or loses the queen) |
| with a tempting check, capture or promotion that does not win | 50% of them: traps worth a lesson |
| White to move, a draw White must hold (K+R vs K+R+P) | about 133 M positions; exactly one move holds in 19% (about 25 M defensive resources): a capture 55%, a quiet rook move 18%, a king move 17%, a check 11%; a tempting move that loses next to it in 71% |

The prototypes in `../curricula/rook-endings/` run real positions of three kinds (Lucena, the skewer behind the
pawn, the Philidor defence) through the whole pipeline, and show what a course still has to decide (a
rook-endings domain for the explanations; method filters where the fastest conversion is not the textbook one).

## Six pieces

The engine solves six-piece tables with the same algorithm; what changed is where the values live and how
wide they are:

- **Index**: plain numbers, exact past 2^32 (K+R+P vs K+R+P has 33.4 G slots); groups of up to four identical
  pieces (C(64, 4) placements; four pawns: C(48, 4)).
- **Values**: two bytes from six pieces on, so depths up to 65,534 plies (a five-piece mate already takes 229);
  one byte up to five pieces as before, so their tables did not change. `EGTB_WIDTH=1|2` sets the width of
  every table (tests).
- **Each domain on its own**: a pawnless table or one pawn slice is solved on its own values, with indexes
  counted from its start, so the position lists stay 32-bit unless one domain passes 2^32 slots (then 64-bit;
  `EGTB_LIST64=1` forces them). A predecessor outside its domain throws.
- **Solving from disk** (`store.cjs`): a pawn table whose values take more than half the memory budget
  (`EGTB_MEMORY`; `EGTB_STORAGE=disk|memory` forces the choice) is built slice by slice into a temporary file in
  the cache directory, each solved slice written as one page, and renamed into place when complete. It is read in
  pages through a page cache (clock eviction, close to least recently used; `EGTB_PAGE_CACHE` in MB, default a
  quarter of the memory, shared out among the worker threads); it must hold a few slices per thread, or a solve
  reads a page back at almost every pawn move (correct, but slow: a unit test that gave two-byte one-pawn tables,
  whose slices are 0.9 MB, a 1 MB cache was stopped after half an hour). A solve holds the slice it works on, the
  pages its pawn moves lead to and the tables its captures and promotions lead to. Each worker opens the file and
  writes the slices it solves; as many slices are solved at once as their working memory (values, longest exits,
  counters: 2 x width + 1 bytes per slot) fits in 60% of the memory less the page cache.
- **Cache format 2** (`../cache.cjs`): a 64-bit count in the header, so every table cached by an older version
  is stale (rebuilt when needed; `npm run kit:cache -- prune` deletes the old files). Temporary files carry
  the process number: `kit:cache list` shows one left by a killed build, `prune` deletes it once that process
  is gone. Without `KIT_CACHE` a table on disk goes to a scratch directory in the system's temporary directory
  (`TMPDIR`), deleted when the process ends.
- **Probing**: `solver.cjs` takes FENs with up to six pieces.

What six-piece endings need (`node .claude/skills/exact-solver-engineering/scripts/egtb-family.cjs <material>`
lists every table of a family with its size, bytes, storage and the memory its solve needs):

| Ending | Its table | Tables in the family (six-piece) | Disk | Biggest solve in memory |
|---|---|---|---|---|
| K+R+P vs K+R+P (and K+B+P vs K+N+P, K+Q+P vs K+Q+P: the same shape) | 33.4 G slots | 120 (25), 559 G slots | 1.1 TB | K+Q+R vs K+Q+R: 78 GB |
| K+R+P+P vs K+R, K+R vs K+B+P+P | 17.0 G | 71 (15), 280 G | 0.55 TB | 78 GB |
| K+N+N+N vs K+P | 7.2 G | 23 (5), 18 G | 35 GB | K+N+N+N vs K+Q: 12 GB |
| K+R+R vs K+N+N, K+Q+Q vs K+R+R, K+B+B vs K+N+N | 3.8 G | 8 (1), 4 G | 8 GB | the table itself: 19 GB |
| K+P+P vs K+P+P | 4.2 G | 440 (225), 4.8 T | 9.6 TB | 78 GB |
| K+N+N+N+N vs K | 0.59 G | 4 (1), 0.63 G | 1.2 GB | built and checked here: 260 s, peak 4.0 GB |
| K+P+P+P+P vs K, goal promotion | 0.70 G | 4 (1), 0.77 G | 1.5 GB | built and checked here: 148 s, peak 1.9 GB |

A pawnless six-piece table is one domain and is solved in memory, at five bytes per slot (two-byte values, the
two-byte longest exits, a counter): K+Q+R vs K+Q+R (15.5 G slots) needs 78 GB, which sets the machine for
the rook-and-pawn families: 128 GB of memory and over a terabyte of disk. By the five-piece rates measured
here (0.7-1.4 microseconds per slot and core) the K+R+P vs K+R+P family is 110-220 core-hours to build;
six pieces have more moves per position, and the checker takes five to nine times as long as the build.
These are estimates: nothing of that size was built.

How the six-piece code was tested on this machine:

- The reference set, 74 tables (the families of K+R+P vs K+R, K+N+N vs K+P, K+Q+Q vs K+R, K+N+N+N vs K,
  K+B+N vs K, the conversion tables of K+Q vs K+R, K+R vs K+P and K+P vs K+P, the promotion tables of
  K+P+P and K+P+P+P vs K, and every table they lead to), built by this engine with the default settings and
  again solved from disk on the worker threads (`EGTB_STORAGE=disk`), is byte for byte what the five-piece
  engine before the six-piece changes builds (a pristine copy of that commit built the reference). From
  disk it took about as long as in memory (K+R+P vs K+R 131 s against 135 s, the promotion tables of K+P+P
  and K+P+P+P vs K 12.1 s against 12.2 s; runs vary by about 10%), peak memory 4.5 GB instead of 4.0 GB.
- `kit:test5`, "storage and widths change nothing": six tables (mate, conversion and promotion goals, with
  and without pawns) built in memory on one thread, on disk on one thread and on the workers, with two-byte
  values and with 64-bit lists, each in a fresh process, hold the same values.
- Two six-piece tables built and checked on every position by the independent checker: K+N+N+N+N vs K
  (430,151,371 positions: two-byte values, a group of four identical pieces, the threaded pawnless solve;
  0 values wrong, 0 mirror images not found, 564 s on four threads; longest mate 18 moves) and K+P+P+P+P vs K
  with the promotion goal (585,501,287 positions in 97,428 slices: four pawns; 0 wrong, 0 not found, 1045 s;
  longest 24 moves to a safe promotion). Built again from disk on the workers (`EGTB_STORAGE=disk`), its
  four tables are byte for byte the same, and the checker on a 1% sample of the table on disk (5,860,024
  positions, read through the page cache) finds nothing wrong. From disk the build took 148 s, in memory
  128 s. (The first page cache took 1978 s: a profile found its least-recently-used bookkeeping slowing
  down with thousands of pages, and clock eviction replaced it; `kit:test5` tests the cache.)
- The layouts of seven six-piece materials in `kit:test5` (up to K+Q+R+P vs K+R, 4.5 x 10^10 slots) find
  every decoded position again, and the retrograde update of a group of four agrees with the combination
  index on 20,000 random unmoves.
- Node holds typed arrays past 2^32 elements (a Uint16Array of 5 x 10^9 values, atomics at index
  4,999,999,999).

Not tested: a table past 2^32 slots built for real (the largest built here has 0.7 G), so the 64-bit lists
ran only when forced; a family on a big machine, its memory use and its time.

## Limits

- Six pieces at most (`solver.cjs` refuses more), at most four of them identical.
- A pawnless table is solved in memory: five bytes per slot for six pieces. It cannot be cut into independent
  domains as a pawn table is (every piece move is reversible); solving it from disk would take another
  algorithm (predecessor updates collected, sorted by index, applied while streaming the values). Not done.
- Solving from disk was measured only on files of up to 1.4 GB, which the operating system's file cache
  holds anyway: there it is about as fast as in memory, and the page cache fills its budget (K+P+P+P+P vs K:
  peak 6.2 GB on four threads, 1.9 GB in memory). How it behaves with files of tens of gigabytes, read from
  the disk itself, is not measured.
- The memory settings are separate fractions of the machine (tables kept in memory `EGTB_MEMORY` 60%, page
  cache `EGTB_PAGE_CACHE` 25%, slices at once 60% less the page cache), not one plan: on a big machine set
  them so that the tables a build keeps in memory, the page cache and the slices fit together.
- Exact distances after a promotion need the queen ending that follows, with every pawn still on the board:
  pawns against pawns grow fastest (five pieces, K+P+P vs K+P: 75 tables, 28 G slots; six, K+P+P vs K+P+P:
  9.6 TB).
- Memory and time grow with the material: see the tables above before promising a course.
