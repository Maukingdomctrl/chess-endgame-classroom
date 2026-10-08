# Two connected pawns course generator

Builds `courses/connected-pawns-course.pgn` (the built-in *Two Connected Pawns* course) from scratch,
so every move in it is provably correct. Built on the shared toolkit in `../course-kit/`: the exact
solver measured to the promotion (goal `'promotion'`: plies to a safe promotion, the way the King &
Pawn course measures it), the checker and the PGN writer.

```bash
npm run course:pawns       # from apps/endgame-classroom (about 6 minutes: the solver builds its tables)
npm run course:e2e -- two-connected-pawns     # browser test
KIT_CACHE=/tmp/kit npm run course:pawns       # keeps the solved tables on disk: later runs take about 2 minutes
```

| File | What it does |
|---|---|
| `lines.cjs` | Plays a line from a position: White the quickest safe promotion (among equally fast moves: no pawn left hanging, pawn moves before king moves, the pawn further from the black king, the king nearer the front pawn; the others become `[%also]`), Black the longest defence (it takes a pawn when that is just as good). If Black takes a pawn, the line goes on as K+P vs K. The promotion is the queen, or the piece that mates fastest afterwards when the queen would fail (the way `../course-kit/verify.cjs` measures it). Also lists every White-to-move position with two connected pawns and a single fastest first move. |
| `search.cjs` | Lesson groups: each picks positions where the lesson's idea is the first move (the pawns alone, the king taking one pawn while the other runs, the king walking over while the pawns hold, the escort, a stalemate trap), ranked by unique moves, kept varied (no repeated stretches of play, no black king walking another line's path, every line its own king and pawns, at most a third of a group on the same files or with the same pattern). Every second line of a lesson is shown mirrored, so the pawns appear on both wings. |
| `build.cjs` | Real FEN/SAN with chess.js; every line checked by `../course-kit/verify.cjs` (settings in `verify-opts.cjs`): each learner move a fastest way to a safe promotion, `[%also]` exactly the equally fast moves, each opponent move the most stubborn defence, the line ending in a safe promotion. Fails loudly. |
| `pgnout.cjs` | Lesson texts; a teaching note on every learner move, worked out from the position (which pawn runs and why the king cannot catch it, the runner while the king takes the other pawn, why the pawns hold on their own and where the king is heading, the king leading the way or guarding the queening square, the opposition, stalemate traps, why the other pawn's queen would fail) and cues on Black's moves (the king attacks or takes a pawn); board marks; writes the PGN, reads it back and checks every line again. |

Lessons: 1 promote safely (8 lines), 2 side by side: the king cannot stop both (8), 3 if the king
takes one, the other runs (8), 4 the chain protects itself: bring your king (8), 5 escort them with
your king (10), 6 don't stalemate (6, one of them a rook instead of a queen), 7 final exam (8, no
marks, only the closing note), 8 extra practice (24, no explanations, no marks).

What the solver showed, and the lessons follow: with the black king in front of them, two connected
pawns never promote without their king (no such line exists), so lessons 2 and 3 have the black
king beside the pawns, and lessons 4 and 5 bring the king.

Marks: green = the queening squares (lesson 3: the runner's way; lesson 4: where your king is
heading), blue = the squares the black king can step to, red = the pawn the king is going to take, or
the move that would be stalemate.

To change the course, edit the lesson groups in `search.cjs` or the texts in `pgnout.cjs` and rerun.
The output is deterministic: the same code always writes the same file, byte for byte.
