# Ladder mate course generator

Builds `courses/ladder-mate-course.pgn` (the built-in *The Ladder Mate: Two Rooks, Queen and Rook*
course) from scratch, so every move in it is provably correct. Built on the shared toolkit in
`../course-kit/` (exact solver for K+R+R vs K and K+Q+R vs K, checker, PGN writer).

```bash
npm run course:ladder      # from apps/endgame-classroom (about a minute)
npm run course:e2e -- ladder-mate-two-rooks-queen-rook     # browser test
```

| File | What it does |
|---|---|
| `search.cjs` | Takes every position with White to move and a single fastest first move, plays the line with best play (White a fastest mate, preferring piece moves, the smallest box and pieces out of the king's reach among equal ones; Black the longest defence), and turns it so that the mate is on the 8th rank. Lesson groups pick positions where the lesson's idea is the first move (a clean ladder where the white king never moves, an attacked rook switching to the far side, a stalemate trap), ranked by unique moves and natural starts (white king at home), kept varied (no repeated stretches of play, no black king walking another line's path, different kings in the short lessons). |
| `geometry.cjs` | The box (every square the black king can still reach) and whether a piece is protected. |
| `build.cjs` | Real FEN/SAN with chess.js; every line checked by `../course-kit/verify.cjs` (settings in `verify-opts.cjs`): each learner move a fastest mate, `[%also]` exactly the equally fast moves, each opponent move the most stubborn defence, the line ending in checkmate. Fails loudly. |
| `pgnout.cjs` | Lesson texts; a teaching note on every learner move, worked out from the position (check and climb, the wall moving up, the rook switching to the far side or stepping to a protected square, clearing the line for the other piece's check, getting ready to check or mate, cutting the king off, waiting moves, stalemate traps, the final picture; checks that don't force a climb are told from Black's toughest reply) and cues on Black's moves (the king attacks a rook); board marks; writes the PGN, reads it back and checks every line again. |

Lessons: 1 the final picture (8 lines), 2 the ladder with two rooks (12), 3 the king attacks a rook:
switch sides (8), 4 the ladder with queen and rook (10), 5 don't stalemate (8), 6 final exam (8, no
marks, only the closing note), 7 extra practice (24, no explanations, no marks).

Marks: blue = the box (or, in the pictures and the stalemate lesson, the squares the king can step
to), red = danger (the move that would be stalemate, the mated king).

To change the course, edit the lesson groups in `search.cjs` or the texts in `pgnout.cjs` and rerun.
The output is deterministic: the same code always writes the same file, byte for byte.
