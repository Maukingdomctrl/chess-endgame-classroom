# Two connected pawns course generator

Builds `courses/connected-pawns-course.pgn` (the built-in *Two Connected Pawns* course) from scratch,
so every move in it is provably correct. Built on the shared toolkit: `../course-kit/` (the exact solver
measured to the promotion, goal `'promotion'`; the checker; the PGN writer) and its pawn part
`../course-kit/pawn/` (enumeration, line player, selection and variety, teaching facts, the independent
check). The method is in the skill `.claude/skills/pawn-endgame-course/`.

```bash
npm run course:pawns                          # from apps/endgame-classroom (about 4.5 minutes)
KIT_CACHE=1 npm run course:pawns              # keeps the solved tables on disk: later runs about 1 minute
npm run course:e2e -- two-connected-pawns     # browser test (add --all for every line)
```

| File | What it does |
|---|---|
| `search.cjs` | The lesson groups: for each, which plies to the promotion, a filter on the start position (`pre`) and on the line (`post`), how many lines, minimum unique-move share. Everything else is the toolkit: candidates (every White-to-move win with two connected pawns and a single fastest first move), lines with best play, an even sample of at most 3000 per group, ranking, variety, every second line mirrored. |
| `build.cjs` | Real FEN/SAN with chess.js; every line checked by `../course-kit/verify.cjs` (settings in `verify-opts.cjs`). Fails loudly. |
| `pgnout.cjs` | Lesson texts; a teaching note on every learner move, worked out from the position (which pawn runs and why the king cannot catch it, the runner while the king takes the other pawn, why the pawns hold on their own and where the king is heading, the king leading the way or guarding the queening square, the opposition, stalemate traps, why the other pawn's queen would fail) and cues on Black's moves; board marks (one colour per square, no arrow on the move to play); writes the PGN, reads it back and checks every line again. |
| `check.cjs` | The independent check (`../course-kit/pawn/checker.cjs`): another solver and chess.js re-check every move, the endings, the marks, duplicates and the variety per group. |

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
The output is deterministic: the same code always writes the same file, byte for byte
(`npm run kit:regress -- pawns --twice`).
