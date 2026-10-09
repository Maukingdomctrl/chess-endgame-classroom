# Course toolkit

Shared tools for the built-in course generators (`tools/<course>/`): an exact endgame solver for up to
four pieces, a line player, the checker, the PGN writer, a table cache, a regression check and a browser
test. A course generator only adds its lesson list, the search for teaching positions, and its texts.
Pawn courses (White's pawns against the lone king, lines to the promotion) have their own toolkit in
`pawn/` (see its README), with an independent second solver for checking. The teaching and difficulty
layer (explanations grounded in the solver, concepts and cues, difficulty signals, learning progression)
is in `teach/` (see its README).

```bash
npm run kit:selftest                     # checks the solver (a few minutes; "-- promotion" for the pawn part)
npm run kit:test                         # unit tests of the pawn toolkit (checker, cache) and of teach/
npm run teach:report                     # difficulty and explanations of the built-in courses (read only)
npm run kit:regress                      # every built-in course regenerates byte for byte (-- --twice)
npm run kit:check -- <course.pgn>        # independent check of a pawn course
KIT_CACHE=1 npm run course:pawns         # keep solved tables on disk between runs (npm run kit:cache)
npm run course:e2e -- <builtin id>        # browser test of a built-in course (add --all for every line)
```

| File | What it gives a course |
|---|---|
| `solver.cjs` | `probe(fen)` → `{ result: 'win' \| 'loss' \| 'draw', dtm }` for the side to move (dtm = plies to mate). `table('KRRK')` → the solved table: `value(sqs, stm)`, `options(sqs, stm)` (every legal move with what it leads to, for fast searches), `legal`, `inCheck`, `moves`. Any material with up to 4 pieces: the two kings and two more, either colour, pawns included (captures and promotions lead into other tables, built on first use). |
| `line.cjs` | `playLine(fen, opts)` → a line with best play: the learner (side to move) a fastest move, the opponent the most stubborn defence; equally fast learner moves become `also`. Tie-breaks via `opts.learnerOrder` / `opts.opponentOrder`. |
| `verify.cjs` | `verifyLine(line, opts)` (`opts.learner` for a line that starts with the opponent's move): on the real FENs with chess.js and the solver, every learner move is a fastest win, its `[%also]` list is exactly the other equally fast moves, every opponent move is the most stubborn defence, and the line ends in mate (or a safe promotion with `goal: 'promotion'`; the measure to the promotion is `opts.promotionProbe`, by default the King & Pawn solver). |
| `pgn.cjs` | `writePgn(file, games)` in the app's format (tags, intro comment, `[%csl]`/`[%cal]` marks, `[%also]`, notes, 80-column rows); `checkCourse(file, opts)` reads the file back and checks it all again. |
| `board.cjs` | Squares, FEN helpers, symmetry keys (`canon8`, `canon2`), and the geometry lessons talk about (`ring`, `onEdge`, `isCorner`, `directOpp`, `distantOpp`, `diagOpp`, `knightJump`). |
| `e2e.cjs` | The browser test (Playwright + Chromium): the course appears on a fresh device and on a device that never had it, lines played to the end in Learn (every promotion via the picker), board marks drawn as in the PGN, an `[%also]` move accepted in Practice, no console errors. |
| `selftest.cjs` | Solver checks, see below. |
| `cache.cjs` | The disk cache for solved tables (`KIT_CACHE`): every file records its producer and a checksum of the producer's code, and is used only while that code is unchanged. `npm run kit:cache [-- prune\|clear]`. |
| `regress.cjs` | Regenerates the built-in courses and compares every PGN byte for byte with the working tree (`--twice`: runs each generator twice). New courses are added to its list. |
| `pawn/` | The pawn toolkit: enumeration, line player, promotion choice, structural keys, sampling and selection, teaching facts, an independent solver (`oracle.cjs`) and checker (`checker.cjs`), and the pawn endings' vocabulary for `teach/` (`domain.cjs`). |
| `teach/` | The teaching and difficulty layer: exact move outcomes, short explanations built only from verified facts, concepts and cues, difficulty signals, learning progression, the analyze step of a pipeline, a report over the courses. Generic; a domain brings the chess ideas. |
| `curricula/` | Course designs before their generators: `opposition/` holds the ten-course Opposition curriculum, the 100-slot blueprint of *Direct Opposition*, its task classifier, prototypes and feasibility check (`npm run curriculum:opposition`). |

## The solver

Retrograde analysis with distance to mate. Each position is stored once for all its mirror images (8
without pawns, 2 with pawns). Times measured on a 4-core cloud machine: 3 pieces well under a second;
4 pieces without pawns 4-15 s (e.g. KRRK 4 s, KQKR 14 s); with a pawn about a minute, because each
promotion opens another 4-piece table (KRKP builds KRKQ, KRKR, KRKB and KRKN too). Tables stay in
memory for the run (10-35 MB for a 4-piece table).

Not covered: en passant (materials with pawns on both sides are refused), castling, the fifty-move
rule.

**Goal 'promotion'** (`table('KPPK', { goal: 'promotion' })`, `probePromotion(fen)` → `{ result, dtc }`): for
White's pawns against the lone king, the values count plies to a safe promotion instead of mate, as the
King & Pawn solver does: a promotion counts when it makes a queen or a rook that cannot be taken at once,
it is not stalemate, and the new position is still won (by the mate table of that material); a captured pawn leads
into the promotion table of what is left. For K+P vs K it gives exactly the King & Pawn solver's values on
all 331,352 positions. K+P+P vs K takes about 3 minutes, because every promotion opens a 4-piece table
(K+Q+P, K+R+P, K+B+P, K+N+P vs K, each with its own promotions).

How it is checked (`npm run kit:selftest`):

- K+P vs K agrees with the separate King & Pawn solver (`../kpk-course/kpk.cjs`) on every position.
- On sampled positions of each table (random ones, positions in check, and in check with a pawn on its
  first square): the legal moves are exactly chess.js's, every move can be taken back by the
  retrograde step, and every stored value follows from the values of the positions its moves lead to.
- The longest mates match the published values (KQK 10, KRK 16, KPK 28, KQQK 4, KQRK 6, KRRK 7, KQKR 35 moves).
- Lines played by `line.cjs` pass `verify.cjs`.
- Goal 'promotion' (`node tools/course-kit/selftest.cjs promotion`): K+P vs K equals the King & Pawn solver on
  every position; on sampled K+P+P vs K positions the moves are chess.js's and every value follows from its
  moves under the safe-promotion rule; a two-pawn line passes `verify.cjs`; and both whole tables equal the
  independent `pawn/oracle.cjs` on every position.

**KIT_CACHE=1** (or a directory) keeps solved tables on disk (about 270 MB for everything K+P+P vs K
needs), so a generator that is run again and again while a course is written skips the table building.
A table is reused only while its producer's code is unchanged (see `cache.cjs`). Without it, nothing is
written to disk.

**Goal 'promotion' and the oracle.** The pawn tables are checked against `pawn/oracle.cjs`, written
separately (full tables, move counters, its own move generation): K+P vs K and K+P+P vs K agree on every
position (331,352 and 7,438,086). That comparison found that the solver used to count a safe bishop or
knight promotion as the goal (with two pawns it can still win); the goal is now a queen or a rook, as the
lessons and the King & Pawn solver say.

During development the solver was also compared position by position with a second, independent
implementation (full tables, move counters): KQKR, KBNK and KRKP agreed on every one of their 18-25
million positions. The Basics course regenerates byte for byte on it.
