---
name: egtb
description: How to use the Endgame Classroom's exact endgame tables (the egtb engine in tools/course-kit/egtb/, via solver.cjs; five pieces here, six on a big machine) - probe positions and get the best moves, pick the measure (mate, conversion, promotion; winning or holding), use colour-swapped views for defending lessons, plan what an ending costs before promising it, find teaching positions (survey, scan, analyse), play and verify lines to the conversion or a held draw, check tables, and avoid the known traps. Use it whenever a task needs exact values, best moves or positions for an ending with five or six pieces or pawns on both sides - rook endings (Lucena, Philidor, the skewer), two bishops or rook and bishop against a piece, two knights against a pawn, queen endings - or asks "is this won, what is the best move, how long", whether an ending fits a course or a machine, or for its lesson positions. For changing the engine itself use exact-solver-engineering; for the course rules and PGN format use endgame-course.
---

# Using the endgame tables (egtb)

The egtb engine solves any material with up to six pieces (the two kings and up to four more, either colour,
pawns on both sides included, en passant included) by retrograde analysis, and every value of its tables is
exact: proved position by position by a checker that shares no code with it. Five-piece endings build here in
minutes; a six-piece ending worth a lesson needs a machine with about 128 GB of memory and a terabyte of disk
(see "Costs"), so on this one only the smallest six-piece tables exist. It sits behind `solver.cjs`, which
keeps building the classic tables (up to four pieces, pawns on one side) exactly as before and hands every other
material to egtb with the same API. So `probe()`, `table()`, `line.cjs`, `verify.cjs` and the course pipeline
work on five pieces unchanged.

Paths below are relative to `apps/endgame-classroom/` (where the npm scripts run). Read
`tools/course-kit/egtb/README.md` for the full picture; `references/api.md` here has every call and option;
`references/endings.md` has what is known about each ending (costs, longest wins, verified positions, survey
numbers, teaching notes).

Three skills share this ground: **endgame-course** (the owner's rules for a course: a lesson list approved
first, no moves from memory, the PGN format), **this one** (using the tables), **exact-solver-engineering**
(changing the engine: a new goal, bigger tables, speed, memory; it also has the scripts that size a build).

## Quick start

```js
const solver = require('./tools/course-kit/solver.cjs');
solver.probe('1K6/1P1k4/8/8/8/8/r7/2R5 w - - 0 1');            // Lucena { result: 'win', dtm: 41 } (plies to mate)
solver.probeConversion('1K6/1P1k4/8/8/8/8/r7/2R5 w - - 0 1');  // plies until White converts (15 in this position)
solver.probe('3k4/7R/r7/3PK3/8/8/8/8 b - - 0 1');              // Philidor { result: 'draw', dtm: -1 }

// every move with its exact value, the best ones, the only move that keeps the result, traps
const { analyse } = require('./tools/course-kit/egtb/positions.cjs');
const f = solver.fenPieces(fen);                                 // { name: 'KRPKR', pieces, stm, ep }
const T = solver.table(f.name);                                  // or solver.table(f.name, { goal: 'conversion' })
const a = analyse(T, Int8Array.from(f.pieces.map((p) => p.sq)), f.stm);
// a.result, a.plies, a.best[], a.unique, a.only, a.zugzwang, a.moves[{ san, v, kind, check, stalemate, keeps }]
```

- `probe(fen)` returns the result for the side to move: `win` with `dtm` plies to mate, `loss` with `dtm` plies
  until mated, `draw` with `dtm: -1`. It throws on more than six pieces and on an illegal position (e.g. the
  side not to move in check).
- Table values: `v > 0` the side to move mates in `v` plies, `v < 0` it is mated in `-v - 1`, `0` a draw.
- En passant: a FEN's en passant square counts (chess.js writes it only when the capture is legal; `probe`
  uses it). Positions with en passant rights are not stored; `analyse()` and `fenOf()` ignore them, so for such
  a FEN use `probe()` for the value and `T.options(sqs, stm, ep)` for the moves.
- `KIT_CACHE=1` for anything five-piece (see "Costs"): without it every process builds its tables again.

## Pick the measure

| You want | Goal (and objective) | What the number means |
|---|---|---|
| The exact result and the fastest mate | `goal: 'mate'` (default) | plies to mate, both sides best (the loser the longest defence) |
| A winning lesson that ends when the win is secured (Lucena: the safe promotion; skewer: the rook won) | `goal: 'conversion'` | plies until White makes a capture or promotion after which the position is still won by the mate table, or mates; Black's captures do not end it |
| White's pawns against the lone king, to a safe promotion | `goal: 'promotion'` | plies to a queen or rook promotion that cannot be taken at once, not stalemate, still won |
| A defending lesson (hold the draw) | goal `'mate'` (or `'conversion'` in a course setting) with `objective: 'hold'` | every learner move keeps the draw; the line ends in a draw on the board or when the last pawn falls with a draw left |
| A course with both kinds of line | `{ goal: 'conversion', objective: 'auto' }` | wins to the conversion, draws held (measured by the mate tables) |

Why conversion: measured to mate, a Lucena line runs 30 more moves into K+Q vs K+R, which is a different lesson.
Measured to the conversion, it ends where the idea ends. The conversion tables are White's: White is never lost
and Black never wins there (a position is won for White or it is not), and a mated White counts as no win.

## Colours: defending lessons

The learner plays White. A defending lesson is the colour-swapped material: the Philidor is K+R vs K+R+P with
White to hold. `solver.table('KRKRP')` is a view of `table('KRPKR')` (`egtb/flip.cjs`): board turned, colours and
side to move swapped, nothing built twice. The stored side is the one with more material. Views exist for the
mate goal only; conversion and promotion are White's goals, so for a defending line use the mate measure with
`objective: 'hold'`.

## Costs: check before promising anything

Measured on the 4-core, 16 GB cloud machine, all threads, nothing cached (details in `references/endings.md`):

| Ending (with every table it needs) | Positions | Build | Peak memory | Full independent check |
|---|---|---|---|---|
| K+R+P vs K+R (21 tables, 5 of them five-piece) | 483 M (1.61 G slots in all) | 334 s | 3.2 GB | 13-19 min |
| K+N+N vs K+P | 279 M (0.85 G) | 131 s | 2.2 GB | |
| K+Q+Q vs K+R | 63 M | 42 s (102 s on one thread) | 1.0 GB | 2.5-4 min |
| K+B+B vs K+N and K+R+B vs K+R, conversion goal | 85 M, 153 M | 68-76 s for both | 1.7 GB | 2.5 min, 5-6 min (mate tables) |
| K+R vs K+P+P | 15 five-piece tables, 5 G | not built | | |
| Pawns against a pawn (K+P+P vs K+P) | 75 five-piece tables, 28 G | not built: does not fit here | | |
| K+N+N+N+N vs K (six pieces) | 430 M (0.59 G slots, two bytes each) | 260 s | 4.0 GB | 9.4 min (no value wrong); mate in 18 at most |
| K+P+P+P+P vs K, promotion goal (six pieces) | 586 M (0.70 G slots) | 148 s (from disk: 34 min) | 1.9 GB | 17.4 min (no value wrong); 24 moves to promote at most |
| K+R+P vs K+R+P (120 tables, 25 of them six-piece) | 559 G slots | not built: 1.1 TB of disk, 78 GB of memory for its biggest solve (K+Q+R vs K+Q+R) | | |

- Size any ending first: `node ../../.claude/skills/exact-solver-engineering/scripts/egtb-family.cjs KRPKR`
  lists every table the build needs, with sizes, bytes, memory or disk, and the memory each solve needs,
  without solving anything. Six-piece families: `references/endings.md`, section 6.
- With `KIT_CACHE=1` the tables are kept in `tools/.kit-cache` (one byte per slot up to five pieces, two from
  six: K+R+P vs K+R is 677 MB; the five-piece work filled 12 GB) and load in about a second. Any edit to an
  engine file (`egtb/geometry`, `layout`, `engine`, `index`, `parallel`, `store`) makes every cached table
  stale and the next use rebuilds it; so did the six-piece engine (cache format 2: every older file is stale).
  `npm run kit:cache` shows current and stale files, `npm run kit:cache -- prune` deletes the stale ones.
- A pawn table too big for memory (six pieces) is solved and read from its cache file: give `KIT_CACHE` a
  directory on a disk with room (without it the file goes to the system's temporary directory and is deleted
  at exit). `EGTB_PAGE_CACHE` (MB, default a quarter of RAM) caps the pages of such tables kept in memory.
- `EGTB_MEMORY` (MB, default 60% of RAM) caps the tables kept in memory when the cache is on; the tables in use
  always stay. `EGTB_THREADS=n` sets the worker threads (default: the cores, at most 8).
- Do not promise a course on an ending that is not built, or whose family does not fit the machine, without
  the owner's OK on the cost.

## Finding teaching positions

The method that worked for the rook-endings prototypes (`tools/course-kit/curricula/rook-endings/`, with its
README; the template to copy):

1. **Survey the ending first**: `node tools/course-kit/egtb/survey.cjs KRPKR --goal conversion` (wins by depth,
   the share with a single fastest move and its kind, tempting moves that fail) or `... KRKRP --objective hold`
   (draws with exactly one holding move). It tells you what a lesson can use before a lesson list is proposed.
2. **Scan the table you will measure with**, not the mate table, so the depth band costs nothing:
   `scan(T, { stm: 0, result: 'win', plies: [9, 31], pre, sample: 0.02 })`. A depth band of at least 9 plies
   rules out positions where a piece simply hangs.
3. **Make the pattern precise** in `pre(sqs, stm)` (squares in the table's piece order, e.g. KRPKR =
   `[wK, bK, wR, wP, bR]`, KRKRP = `[wK, bK, wR, bR, bP]`): "the white rook between the black king and the pawn",
   not "a rook somewhere". Loose criteria gave one-move captures and only a-pawn Philidors.
4. **Sample with the seed** (`sample`), so picks spread over the table instead of neighbours in index order,
   and the same positions come back every run.
5. **Keep a win only if it has a single fastest move** by the course's measure (`fastestMoves(fen, VERIFY)`
   from `verify.cjs`); for a draw, list the holding moves (`analyse(...).keep`).
6. **Play the line** (`playLine(fen, { goal: 'conversion', objective })` from `line.cjs`), **verify it**
   (`verifyLine`), write the PGN (`writePgn`), read it back and verify again (`checkCourse` from `pgn.cjs`).

`npm run kit:positions -- KRPKR --goal conversion --result win --plies 9-25 --unique --limit 20` prints
candidates with their best moves and traps ("a8=Q draws"); `--only` lists defensive resources, `--zugzwang`
mutual zugzwangs, `--kind underpromotion` and the like.

## Lines and what they show

- A conversion line ends with the learner's capture or promotion that keeps the win; nothing after it. A line
  stopped before it is rejected.
- A holding line ends in a draw on the board: stalemate, insufficient material, repetition, or the last pawn
  taken with a draw left (K+R vs K+R after the pawn falls). Holding moves have many equals (`[%also]` lists
  every move that keeps the draw), so few learner moves are unique (4 of 10 in the Philidor prototypes).
- `verify.cjs` reports a line in which 100 plies pass without a capture or pawn move: the tables ignore the
  fifty-move rule, and five-piece wins can need more (two bishops against a knight: 66 moves to the conversion).
- **The fastest conversion is not always the textbook method.** In Lucena positions the quickest secure
  conversion is often winning Black's rook, not building the bridge (`1K6/1P1k4/8/2R5/5r2/8/8/8 w`: 1.Ra5 Rf8+
  2.Ka7 Kc7 3.Ra1 Rb8 4.Rb1 Kc6 5.Kxb8). A bridge lesson needs a filter (lines that end with the promotion) or a
  promotion-only goal (not built yet: see exact-solver-engineering).
- A course on these endings still needs a teaching domain for the explanations (`tools/course-kit/teach/`:
  the king cut off, the bridge, checks from behind, the third-rank defence), marks, and the owner's approval of
  the lesson list.

## How far the values can be trusted

Every egtb table with up to four pieces equals the classic engine on every position (62 tables, 247 M
positions). The independent checker found every stored value consistent with its moves on every position of
K+P vs K+P, the conversion tables of K+Q vs K+R, K+R vs K+P and K+P vs K+P, K+N+N+N vs K, K+P+P+P vs K
(promotion), K+Q+Q vs K+R, K+B+B vs K+N, K+R+B vs K+R and K+R+P vs K+R (483 M), which by induction means exact.
Thompson's longest wins (66, 59 moves to conversion) and the longest K+N+N vs K+P mate (115 moves) come out
exactly. Tables built but not fully checked (for example K+N+N vs K+P itself, the conversion tables of the rook
endings) come from the same code; check one yourself when a course rests on it:

```bash
KIT_CACHE=1 npm run kit:check5 -- KRPKR --goal conversion    # every position, all threads (5-9x the build time)
npm run kit:test5            # unit tests (-- --budget: with a 1 MB memory budget)
npm run kit:selftest5        # the full check (about half an hour; -- --quick, --heavy, --all, --parts 2,3)
```

There is no external tablebase to compare with here (the Lichess API is blocked at the proxy): the evidence is
the checker, the second engine and the published values.

## Traps found so far

| Trap | What happens | Do instead |
|---|---|---|
| Probing without `KIT_CACHE` | each process rebuilds the five-piece tables (minutes) | `KIT_CACHE=1` |
| Using the tables right after an engine edit | every cached table is stale: the first use rebuilds | `npm run kit:cache`; plan the rebuild |
| `T.options()` on a table not built yet | it builds the table and every table its promotions lead to (one test reached 3.5 GB) | `T.moves()` for move lists only |
| A theory FEN written from memory | it can be illegal (a rook already giving check) or the result wrong | check legality with chess.js and the result with `probe()` first |
| Mate measure for a winning rook-ending lesson | the line runs on into K+Q vs K+R | `goal: 'conversion'` |
| Conversion or promotion goal for a defending lesson | those are White's goals | the colour-swapped material, mate goal, `objective: 'hold'` |
| Loose search criteria | trivial positions (a hanging rook, only a-pawns) | depth band, precise pattern, seeded sample |
| Expecting unique moves in holding lines | a draw is a draw: many equals | judge them by the line, not by uniqueness |
| `fenOf()` / `analyse()` on an en passant position | en passant rights are not stored | `probe()` with the FEN's e.p. square, `T.options(sqs, stm, ep)` |
| Heavy jobs side by side | times stretch, memory can run out | one five-piece build or check at a time |
| More than six pieces | `probe()` throws | not supported |
| A six-piece family on the 16 GB machine | does not fit (K+R+P vs K+R+P: 1.1 TB, 78 GB for one solve) | size it with `egtb-family.cjs`; build on a big machine |
| A killed six-piece build | leaves its temporary file (tens of GB) in the cache directory | `npm run kit:cache` shows it; `prune` deletes it once its process is gone |

## Files of this skill

- `references/api.md`: every function, option and command line of the tables and their tools.
- `references/endings.md`: per ending, what is built and checked, costs, longest wins, verified positions with
  their values, survey numbers and teaching notes.
- `evals/evals.json`: test prompts for improving this skill.
