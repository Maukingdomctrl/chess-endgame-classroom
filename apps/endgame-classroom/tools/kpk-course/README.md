# King & Pawn course generator

Builds `courses/king-and-pawn-course.pgn` (the built-in *King & Pawn: Opposition and Key Squares*
course) from scratch, so every move in it is provably correct.

```bash
npm run course:kpk     # from apps/endgame-classroom
```

| File | What it does |
|---|---|
| `kpk.cjs` | Exact solver for every King + Pawn vs King position (retrograde analysis, ~1 s). `probe(fen)` returns win/draw/loss and plies to a safe promotion. |
| `engine.cjs` | Plays lines with best play: the trainee keeps the win (or draw), the opponent picks the most stubborn defence; geometry helpers (key squares, opposition). |
| `search.cjs` | Lesson definitions. Searches all positions for ones where the lesson's idea is the *only* correct move, scores and picks varied positions. |
| `build.cjs` | Converts lines to real FEN/SAN with chess.js and re-verifies every trainee move against the solver. Fails loudly (`problems: N`) on any error. |
| `pgnout.cjs` | Lesson texts, move notes and `[%csl]` key-square colours; writes the PGN. |

To change the course, edit the lesson list in `search.cjs` or the texts in `pgnout.cjs` and rerun.
The same approach (exact solver → search for unique-move positions → verify → annotate) works for
other endgames with few pieces, e.g. the basic mates (KQK, KRK, KBBK, KBNK).
