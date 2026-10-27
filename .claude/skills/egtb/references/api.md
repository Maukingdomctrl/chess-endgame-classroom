# The tables' API and tools

Paths relative to `apps/endgame-classroom/`. Everything here is synchronous (worker threads run behind it, the
main thread waits), so it can be called from any script.

## Contents

1. solver.cjs: probing and tables
2. A table object
3. positions.cjs: scan, analyse, fenOf
4. line.cjs and verify.cjs with the egtb measures
5. pgn.cjs: writing and re-checking a course file
6. Command lines
7. Environment variables

## 1. solver.cjs: probing and tables

```js
const solver = require('./tools/course-kit/solver.cjs');
```

| Call | Returns |
|---|---|
| `probe(fen)` | `{ result: 'win' \| 'loss' \| 'draw', dtm }` for the side to move: plies to mate (win), until mated (loss), `-1` for a draw. Up to 6 pieces (a six-piece family needs a big machine); throws `illegal position` (e.g. the side not to move in check) |
| `probeConversion(fen)` | `{ result, dtc }`: plies until White's capture or promotion that keeps the win, or mate (egtb conversion table) |
| `probePromotion(fen)` | `{ result, dtc }`: plies to a safe queen or rook promotion; White's pawns against the lone king (up to three pawns) |
| `table(name, { goal })` | the solved table (built on first use, then kept); goal `'mate'` (default), `'conversion'`, `'promotion'`. A material with less for White, goal mate, comes back as a colour-swapped view of its stored twin |
| `fenPieces(fen)` | `{ name, pieces: [{ c, t, sq }] in table order, stm: 0 \| 1, ep: square or -1 }`; squares for a table: `Int8Array.from(pieces.map((p) => p.sq))` |
| `normalise(name)` | the canonical material name (`'KRPKR'`: White's pieces then Black's, each led by the king, order Q R B N P) |
| `classic(name)` | true when the classic engine builds it (up to 4 pieces, pawns on one side at most); everything else, and every conversion table, is egtb |

Squares are 0..63 with a1 = 0, b1 = 1, ..., h8 = 63 (`file = sq & 7`, `rank = sq >> 3`).

Examples with their verified results:

```js
probe('8/8/8/8/8/2k5/8/K2R1R2 w - - 0 1')               // { result: 'win', dtm: 7 }
probe('8/8/8/8/1k6/8/1KRP4/7r w - - 0 1')               // { result: 'draw', dtm: -1 }  (five pieces: egtb)
probePromotion('8/8/8/4k3/8/8/3PP3/4K3 w - - 0 1')      // { result: 'win', dtc: 27 }
probeConversion('1K1k4/1P6/8/8/8/8/r7/5R2 w - - 0 1')   // { result: 'win', dtc: 15 }
probe('8/8/8/8/Pp6/8/8/K3k3 b - a3 0 1')                // { result: 'draw', dtm: -1 }: with bxa3 e.p.; lost in 30 without it
```

## 2. A table object

| Member | Meaning |
|---|---|
| `T.value(sqs, stm)` | the value (`v > 0` side to move mates in `v` plies, `v < 0` mated in `-v - 1`, `0` draw) |
| `T.valueEp(sqs, stm, ep)` | the same with en passant rights (`ep` square or -1): a one-ply search, these positions are not stored |
| `T.options(sqs, stm, ep = -1)` | every legal move with its value for the mover: `{ piece, from, to, promo, capture, ep, v }` |
| `T.moves(sqs, stm, buf, ep)` | legal moves only, into `buf` (4 numbers each): no values, builds nothing else (use it on unsolved tables) |
| `T.legal(sqs, stm)`, `T.inCheck(sqs, stm)` | legality (no two pieces on a square, kings apart, the side not to move not in check), check |
| `T.size`, `T.n`, `T.col[k]`, `T.typ[k]` | index slots, pieces, colour (0 White) and type (K Q R B N P = 0..5) of piece k |
| `T.index(sqs, stm)`, `T.decode(i, sqs)` | position to slot (its stored image), slot to position (returns stm) |
| `T.valueAt(i)`, `T.stores(i, sqs)` | value at slot i; whether slot i is a legal stored position (fills sqs) |
| `T.stats` | build statistics (`ms`, `forwardMs`, `retroMs`, `positions`, `maxLevel`, `threads`; `{ cached: true }` when loaded) |
| `T.inner` (views) | the stored table behind a colour-swapped view (`table('KRKRP').inner.name === 'KRPKR'`) |

## 3. positions.cjs: scan, analyse, fenOf

```js
const { scan, analyse, fenOf } = require('./tools/course-kit/egtb/positions.cjs');
```

- `scan(T, opts)` yields `{ i, sqs, stm, v }` for stored positions in index order (deterministic), cheapest test
  first (value, then `pre`, then legality). `opts`: `stm` 0 | 1; `result` `'win' | 'draw' | 'loss'` (for the
  side to move); `plies` `[lo, hi]`; `pre(sqs, stm) -> bool`; `sample` (0..1, seeded: the same share every
  run); `limit`; `from` / `to` (slot range). For a conversion table, plies count to White's conversion.
- `analyse(T, sqs, stm)` returns `{ fen, value, result, plies, moves, best, unique, keep, only, zugzwang }`.
  `moves[]`: `{ san, from, to, promo, piece, v, kind ('capture' | 'promotion' | 'underpromotion' | 'en passant'
  | 'quiet'), check, stalemate, best, keeps }`. `best`: the fastest wins (in a draw every drawing move, in a
  loss the longest defences); `keep`: the moves that keep the result; `only`: exactly one keeps it; `unique`:
  exactly one best move; `zugzwang`: the side to move would do better if the other side moved.
- `fenOf(T, sqs, stm)`: the FEN (no castling, no en passant rights).

## 4. line.cjs and verify.cjs with the egtb measures

```js
const { playLine } = require('./tools/course-kit/line.cjs');
const { verifyLine, fastestMoves, summary } = require('./tools/course-kit/verify.cjs');
const VERIFY = { goal: 'conversion', probe: solver.probe, objective: 'auto' };   // the rook-endings setting
const l = playLine(fen, { goal: 'conversion', objective: 'hold' | undefined });  // { plies: [{ san, also, ... }], end }
const r = verifyLine({ fen, moves: l.plies.map((p) => ({ san: p.san, also: p.also ?? [] })) }, VERIFY);
// r.problems (empty = verified), r.unique (per learner move)
```

- `goal`: `'mate'`, `'promotion'`, `'conversion'` (learner White; the line ends with the learner's capture or
  promotion that keeps the win, `end: 'conversion'`). `conversionProbe` defaults to `solver.probeConversion`.
- `objective`: `'win'` (default), `'hold'` (every learner move keeps the draw; `[%also]` lists every move that
  keeps it; ends in a draw on the board or the last pawn taken with a draw left), `'auto'` (win or hold from
  the start position; a lost start is a problem). With goal conversion a hold is measured by the mate tables.
- `fastestMoves(fen, VERIFY)`: the learner's fastest moves by the course's measure (filter for one).
- A line with 100 plies and no capture or pawn move is reported (fifty-move rule).

## 5. pgn.cjs: writing and re-checking a course file

```js
const { writePgn, checkCourse, moveComment } = require('./tools/course-kit/pgn.cjs');
writePgn(file, games);   // games: [{ name, description, fen, intro, moves: [{ san, comment }] }]
const back = checkCourse(file, { verify: VERIFY, learner: 'w', finalNote: /A draw|Done/ });   // back.problems, back.stats
```

`moveComment(null, also, text)` writes the `[%also]` list and a note. `tools/course-kit/curricula/rook-endings/prototypes.cjs`
uses all of this end to end.

## 6. Command lines

| Command | Does |
|---|---|
| `npm run kit:positions -- KRPKR --goal conversion --result win --plies 9-25 --unique --limit 20` | candidates with best moves and traps; also `--stm w\|b`, `--only` (defensive resources), `--kind capture\|promotion\|underpromotion\|quiet\|check`, `--zugzwang`, `--sample 0.01` |
| `node tools/course-kit/egtb/survey.cjs KRPKR --goal conversion` | what an ending offers (wins by depth, single fastest move and its kind, traps); `--objective hold` for draws with one holding move; `--sample 0.01 --examples 2 --json file` |
| `npm run kit:bench5 -- KRPKR [--goal g] [--json f]` | builds a table and its family: time, threads, positions, longest win, wins/draws/losses, peak memory |
| `npm run kit:check5 -- KRPKR [--goal g] [--sample f] [--from i --to j]` | the independent checker, all threads |
| `npm run kit:test5 [-- --budget]` | the egtb unit tests (`--budget`: fresh cache, 1 MB memory budget) |
| `npm run kit:selftest5 [-- --quick \| --heavy \| --all \| --parts 2,3]` | the full check |
| `npm run kit:cache [-- prune \| clear]` | list the cache (current / stale), delete stale or all files |
| `node ../../.claude/skills/exact-solver-engineering/scripts/egtb-family.cjs KRPKR [--goal g]` | every table a build needs, sizes and totals, nothing built |

## 7. Environment variables

| Variable | Effect |
|---|---|
| `KIT_CACHE=1` (or a directory) | keep tables on disk (`tools/.kit-cache`), reuse them while the engine files are unchanged |
| `EGTB_THREADS=n` | worker threads (default: cores, at most 8); `1` = none |
| `EGTB_PARALLEL_FROM=n` | index size from which workers are used (default 4 M slots) |
| `EGTB_MEMORY=MB` | with the cache on, a soft cap on the tables kept in memory (default 60% of RAM, at least 2 GB); tables in use always stay |
| `EGTB_STORAGE=disk\|memory` | where pawn tables are kept while solved and probed (default: on disk only when their values take more than half of `EGTB_MEMORY`, i.e. six pieces); pawnless tables are always in memory |
| `EGTB_PAGE_CACHE=MB` | pages of tables on disk kept in memory (default a quarter of RAM, shared out among the worker threads); keep room for a few slices per thread, or the solve reads pages back at almost every pawn move |
| `EGTB_WIDTH=1\|2` | bytes per stored value for every table (default 1 up to five pieces, 2 from six; tests) |
| `EGTB_LIST64=1` | 64-bit position lists even for small domains (tests; they are used anyway past 2^32 slots) |
