# egtb: exact endgame tables with up to five pieces

The toolkit's engine for five-piece endings, and for four-piece endings with pawns on both sides (en
passant). `../solver.cjs` hands it every material it does not build itself and has the same API, so the course
tools work unchanged: `probe(fen)`, `table(name)`, `line.cjs`, `verify.cjs`, the teaching layer.

```js
const { probe, probeConversion, table } = require('../solver.cjs');
probe('1K6/1P1k4/8/8/8/8/r7/2R5 w - - 0 1');           // Lucena: { result: 'win', dtm: 33 }
probeConversion('1K6/1P1k4/8/8/8/8/r7/2R5 w - - 0 1'); // plies until White captures or promotes into a won position
const T = table('KRPKR');  // value(sqs, stm), options(sqs, stm, ep), moves(), legal(), inCheck(), size, decode(), valueAt()
table('KRKRP');            // the same table seen with the colours swapped (flip.cjs): defending lessons share it
```

```bash
npm run kit:test5                                   # unit tests (a minute with the cache, a few without)
npm run kit:selftest5                               # the full check, see "How it is checked" (-- --quick, --heavy)
npm run kit:check5 -- KRBKR                         # the independent checker on every position of a table
npm run kit:bench5 -- KRPKR                         # build a table and its sub-tables: time, memory, contents
npm run kit:positions -- KRPKR --goal conversion --result win --plies 7-15 --unique --limit 20
node tools/course-kit/egtb/survey.cjs KRKRP --objective hold   # what an ending offers a course (sampled)
KIT_CACHE=1 ...                                     # keep solved tables on disk (strongly advised for five pieces)
EGTB_THREADS=1 ...                                  # one thread (default: every core, at most 8)
```

## What it covers

- **Materials**: any with up to five pieces (the two kings and up to three more), either colour, pawns
  included, pawns on both sides included. A FEN's en passant square is used when the capture is legal
  (chess.js writes it only then).
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
| K+R+P vs K+R (with K+Q+R, K+R+R, K+R+B, K+R+N vs K+R) | 483 M (1.56 G with the others) | 430 s | 3.2 GB | 74 (mate) |
| K+B+B vs K+N, K+R+B vs K+R, goal conversion | 85 M, 153 M | 76 s | 1.7 GB | 66, 59 |
| K+Q+Q vs K+R | 63 M | 42 s | | 35 |

A pawnless table is solved in one piece; a table with pawns slice by slice (one slice per placement of the
pawns, the most advanced first), so its working memory is one slice per thread. On disk (`KIT_CACHE`) a table
takes one byte per index: K+R+P vs K+R 677 MB, a pawnless five-piece table 114-231 MB.

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
of the machine): the least recently used ones that no build in progress needs are dropped and read back from
the disk when needed. Without the cache every table stays in memory.

## How it works

- **Index** (`layout.cjs`). Pawnless: the 8 symmetries of the board, the white king in the a1-d1-d4 triangle
  and, on the diagonal, the black king on or below it: 462 king pairs. With pawns: one slice per placement of
  the pawns, a placement and its mirror image (a <-> h) stored once (a placement that is its own mirror image
  in full); in a slice, any of the 3612 legal king pairs. Identical pieces are stored once, as a combination
  (two rooks: 2016 placements instead of 4096). Values take one byte: plies to mate + 1, 0 for a draw; a table
  deeper than 254 plies throws instead of storing a wrong value.
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
  with atomic operations (compare-exchange for a win, atomic decrement for a counter).
- **Exits**: the engine builds every table it needs itself, down to two kings. Its tables with up to four
  pieces hold exactly `solver.cjs`'s values (checked position by position), but `solver.cjs` keeps building
  its own for the courses, so nothing they depend on changes.

## How it is checked

`npm run kit:selftest5` (and `kit:test5`), results in the last run:

1. **Against `solver.cjs`**, a separate implementation (another index and symmetry handling, another move
   generator, another algorithm): every position of every three- and four-piece table of both engines has the
   same value (`--all`: every four-piece material), goal `'promotion'` included.
2. **The independent checker** (`check.cjs`): its own 8x8 board, move generation, attack test (scanning out
   from the king), en passant and goal rules; it uses only what a table stores. Every stored value must follow
   from the values of its moves (win = 1 + the fastest losing reply, loss = 1 + the slowest winning reply,
   else a draw; mate and stalemate when there is no move), and every mirror image of a position must find it.
   By induction on the distance to mate, a table that passes on every position holds exactly the true values.
   Checked on every position: K+P vs K+P (en passant, 7.4 M), the conversion goal (K+Q vs K+R, K+R vs K+P,
   K+P vs K+P), K+N+N+N vs K (30 M), K+Q+Q vs K+R (63 M), K+B+B vs K+N, K+R+B vs K+R, and with `--heavy` K+R+P
   vs K+R (483 M). A deliberately corrupted value is always found (mutation test).
3. **Published values**: Thompson's longest wins to the conversion, two bishops against a knight 66 moves and
   rook and bishop against rook 59, come out exactly; so do the longest mates K+Q vs K+R 35, K+R vs K+N 40,
   K+R vs K+B 29, K+R vs K+R 19 and K+R+B vs K+R 65. Lucena wins, Philidor draws.
4. **Move generation against chess.js**, the engine's and the checker's, on random five-piece positions,
   en passant ones included (and a pinned pawn that may not take en passant).
5. **Lines** played by `line.cjs` on five pieces pass `verify.cjs` (mate and conversion).

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

## Limits, and what six pieces would need

- Five pieces at most; a table index must fit in 2^32 (six pieces: K+R+P vs K+R+P is about 34 G positions).
  Six pieces would need an index split into parts (slices of slices), tables kept on disk while solving
  (they no longer fit in memory), two-byte values for the deepest endings, and much more time: the layout
  (groups of identical pieces, pawn slices, any number of pieces) and the algorithm carry over.
- Pawns against pawns in five pieces need the 75 tables above: the engine solves them, but not in minutes.
- Memory and time grow with the material: see the tables above before promising a course.
