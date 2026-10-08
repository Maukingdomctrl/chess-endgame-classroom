# Course toolkit

Shared tools for the built-in course generators (`tools/<course>/`): an exact endgame solver for up to
four pieces, a line player, the independent checker, the PGN writer, and a browser test. A course
generator only adds its lesson list, the search for teaching positions, and its texts.

```bash
npm run kit:selftest                     # checks the solver (a few minutes)
npm run course:e2e -- <builtin id>        # browser test of a built-in course (add --all for every line)
```

| File | What it gives a course |
|---|---|
| `solver.cjs` | `probe(fen)` → `{ result: 'win' \| 'loss' \| 'draw', dtm }` for the side to move (dtm = plies to mate). `table('KRRK')` → the solved table: `value(sqs, stm)`, `options(sqs, stm)` (every legal move with what it leads to, for fast searches), `legal`, `inCheck`, `moves`. Any material with up to 4 pieces: the two kings and two more, either colour, pawns included (captures and promotions lead into other tables, built on first use). |
| `line.cjs` | `playLine(fen, opts)` → a line with best play: the learner (side to move) a fastest move, the opponent the most stubborn defence; equally fast learner moves become `also`. Tie-breaks via `opts.learnerOrder` / `opts.opponentOrder`. |
| `verify.cjs` | `verifyLine(line, opts)`: on the real FENs with chess.js and the solver, every learner move is a fastest win, its `[%also]` list is exactly the other equally fast moves, every opponent move is the most stubborn defence, and the line ends in mate (or a safe promotion with `goal: 'promotion'`). |
| `pgn.cjs` | `writePgn(file, games)` in the app's format (tags, intro comment, `[%csl]`/`[%cal]` marks, `[%also]`, notes, 80-column rows); `checkCourse(file, opts)` reads the file back and checks it all again. |
| `board.cjs` | Squares, FEN helpers, symmetry keys (`canon8`, `canon2`), and the geometry lessons talk about (`ring`, `onEdge`, `isCorner`, `directOpp`, `knightJump`). |
| `e2e.cjs` | The browser test (Playwright + Chromium): the course appears on a fresh device and on a device that never had it, lines played to the end in Learn (every promotion via the picker), board marks drawn as in the PGN, an `[%also]` move accepted in Practice, no console errors. |
| `selftest.cjs` | Solver checks, see below. |

## The solver

Retrograde analysis with distance to mate. Each position is stored once for all its mirror images (8
without pawns, 2 with pawns). Times measured on a 4-core cloud machine: 3 pieces well under a second;
4 pieces without pawns 4-15 s (e.g. KRRK 4 s, KQKR 14 s); with a pawn about a minute, because each
promotion opens another 4-piece table (KRKP builds KRKQ, KRKR, KRKB and KRKN too). Tables stay in
memory for the run (10-35 MB for a 4-piece table).

Not covered: en passant (materials with pawns on both sides are refused), castling, the fifty-move
rule.

How it is checked (`npm run kit:selftest`):

- K+P vs K agrees with the separate King & Pawn solver (`../kpk-course/kpk.cjs`) on every position.
- On sampled positions of each table (random ones, positions in check, and in check with a pawn on its
  first square): the legal moves are exactly chess.js's, every move can be taken back by the
  retrograde step, and every stored value follows from the values of the positions its moves lead to.
- The longest mates match the published values (KQK 10, KRK 16, KPK 28, KQQK 4, KQRK 6, KRRK 7, KQKR 35 moves).
- Lines played by `line.cjs` pass `verify.cjs`.

During development the solver was also compared position by position with a second, independent
implementation (full tables, move counters): KQKR, KBNK and KRKP agreed on every one of their 18-25
million positions. The Basics course regenerates byte for byte on it.
