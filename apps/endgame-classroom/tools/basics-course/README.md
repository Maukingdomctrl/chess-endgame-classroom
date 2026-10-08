# Endgame Basics course generator

Builds `courses/endgame-basics-course.pgn` (the built-in *Endgame Basics: First Principles* course)
from scratch, so every move in it is provably correct.

```bash
npm run course:basics     # from apps/endgame-classroom (about 35 s)
```

It is built on the shared toolkit in `../course-kit/` (exact solver, checker, PGN writer, browser test:
`npm run course:e2e -- endgame-basics-first-principles`).

| File | What it does |
|---|---|
| `kxk.cjs` | King + Queen / King + Rook vs King in the lessons' shape (white king, black king, piece): move lists and attack maps, with the distance to mate (DTM) from the toolkit's exact solver (`../course-kit/solver.cjs`; the longest mates are 10 and 16 moves, the known values). |
| `engine.cjs` | Plays lines with best play: the learner (White) a fastest mate, the opponent the longest defence. Also the geometry the lessons talk about: the black king's *box* (every square it can still reach), the opposition, the rook's waiting move. King + pawn lines use `../kpk-course/` (`kpk.cjs` + its engine): fastest safe promotion, most stubborn defence. |
| `search.cjs` | Lesson definitions. Searches all positions for ones where the lesson's idea is the *only* fastest move and the box never grows (in the lessons the mate comes on the 8th rank, the edge the learner faces), ranks them by the share of unique learner moves, keeps them varied (no repeated stretches of play, no position from the King & Pawn course), and plays every line to its end. |
| `build.cjs` | Converts lines to real FEN/SAN with chess.js and checks every move again with the toolkit's checker (`../course-kit/verify.cjs`, settings in `verify-opts.cjs`): every learner move is a fastest win; its `[%also]` list is *exactly* the other equally fast moves; every opponent move is the most stubborn defence; the line ends in checkmate (or a safe promotion in a king + pawn line). Fails loudly (`problems: N`) on any error. |
| `pgnout.cjs` | Lesson texts, move notes, `[%csl]`/`[%cal]` marks and `[%also]` alternatives; writes the PGN (`../course-kit/pgn.cjs`), then reads the file back and checks every line once more. |

"Fastest" means the lowest distance to mate for K+Q/K+R, and the quickest safe promotion for K+P
(then the promotion piece that mates fastest, e.g. a rook when a queen would stalemate). Among
equally fast moves the line shows the one that fits the method (smallest box, the rook's waiting
move); the others are listed as `[%also]` so the app accepts them without a mistake. Slower moves
are never listed.

Marks: green = target squares (key squares), red = danger (the push that only draws, the move
that stalemates, the mated king), blue = zones (the box, or the squares the king can step to).
The exam has none.

To change the course, edit the lesson groups in `search.cjs` or the texts in `pgnout.cjs` and rerun.
The output is deterministic: the same code always writes the same file, byte for byte.
