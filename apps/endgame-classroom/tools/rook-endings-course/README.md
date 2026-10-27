# Rook endings course generator

Builds `courses/rook-endings-course.pgn` (the built-in *Rook Endings: Lucena, Skewer, Philidor* course) from
scratch: rook and pawn against rook, five pieces, every move decided by the exact tables of `../course-kit/egtb/`.
The learner plays White in every line: attacking with the pawn (the Lucena, the skewer) or defending against
Black's pawn (the Philidor).

```bash
KIT_CACHE=1 npm run course:rook     # from apps/endgame-classroom; about 7 minutes with the tables cached
npm run course:e2e -- rook-endings --all     # browser test
```

The first run builds the K+R+P vs K+R tables (the conversion table for the wins and the mate table for the
defence, with the tables they lead to): about 10 minutes on four cores, 3.2 GB of memory, 1.5 GB on disk with
`KIT_CACHE=1`.

| File | What it does |
|---|---|
| `search.cjs` | Three groups of positions from the solved tables, each with criteria on the board (where to look) and on the solver's line (what it must show); the solver plays every line (`../course-kit/line.cjs`). A win's first move must be the only fastest one and of the lesson's kind: read from the table's own values first (cheap), then confirmed by the course's measure. Ranked by the share of unique learner moves, then length, then the FEN; varied: no two lines share a position or play the same moves, and each group spreads over its patterns. |
| `build.cjs` | Lessons get their lines; every other line of a lesson is mirrored to the other wing (the tables store the pawn on files a-d). Real FEN and SAN with chess.js; every line checked by `../course-kit/verify.cjs` (settings in `verify-opts.cjs`); every learner move explained by the teaching layer with the rook-endings domain (`../course-kit/rook/domain.cjs`), whose equal moves must be the line's `[%also]`. Fails loudly. |
| `texts.cjs` | Lesson titles, intros (the first of a lesson explains the idea; later ones say what is different in that kind of position), colours, takeaways, closing notes. |
| `pgnout.cjs` | Notes, marks, the PGN; reads the file back and checks every line again (`pgn.checkCourse`). |

## The groups

| Group | Where it looks | What the line must show | Patterns |
|---|---|---|---|
| `lucena` (9 lines) | The pawn on the 7th, its king in front of it, the black king two files or more away on the 6th-8th rank. | The first move puts the rook on the 4th rank; the king walks out; the line ends with the queen, and just before it the rook on the 4th rank stands below its king on the king's file (the bridge shields it). | d-pawn with the black king on the kingside (the classic), b-pawn (the king hides at the edge), c-pawn (the king steps out towards the edge) |
| `skewer` (6) | The rook in front of its rook's pawn on the 7th, the black rook behind the pawn, the black king on the 6th-8th rank. | The first move takes the rook off the queening square along the 8th rank (no check); a rook check with the black king between it and the black rook; the line ends with the rook won. | the black king on d7, e7 or f7; Black taking at once, or checking first |
| `philidor` (6) | White defends: the black pawn just arrived on White's 3rd rank (c- or d-pawn) with its king beside it, White's king in front of the pawn, White's rook on the 3rd rank. | Every move that holds sends the rook along its file two ranks or more beyond the black king; at most 17 plies, at least one check from behind, no move with more than 9 equal moves; the line ends with White taking the pawn. | where the black king stands (beside the pawn or on its file) |

Among equal moves the line plays, for the learner, a rook check first and then the farthest rook move in the
Philidor (the others are `[%also]`); for the opponent, a queen before an underpromotion.

**What the solver allows.** Measured to the conversion (the safe queen or the rook won), the fastest lines show
the textbook Lucena (bridge, king out, the rook shielding it) only from positions where the bridge is the first
move: 203 lines in three patterns, each in a few setups (the black rook on another rank, the white rook starting
elsewhere). So the nine Lucena lines repeat those three pictures, on both wings. A defence has many equal moves
(a draw is a draw): the Philidor lines accept up to 9 alternatives on a move, and some end with a rook trade into
a drawn pawn ending, which the line plays to the pawn taken.

## Notes and marks

A learner move gets a note when the teaching layer has a reason the board shows (contrast: no failing move leaves
the same fact), said once per line: the bridge, the check that cuts the king off, the king stepping out, the rook
shielding the king, the skewer trap ("If ...Rxa7, Rh7+ wins the rook."), the skewer itself, the rook far behind,
the solver's zugzwang. Without a reason, a move where a likely mistake loses the result names that mistake and what
the refutation does on the board ("Not Ke5: Black takes the pawn."), once per line; giving a rook away is not a
likely mistake (the domain's plausible moves). Other moves get no note: the solver's "the quickest way" is not a
lesson. The last move gets the closing note; the exam has only the closing notes.

Marks (Learn mode): blue = the file that cuts the black king off (the first time it does), or the 7th rank of the
skewer; green = where the rook goes on the 4th rank (the bridge, the shield), the square of the skewering check,
the squares from where the rook holds (Philidor). Lesson 2 shows only the green squares; the exam none.

Last run: 21 lines, 126 learner moves, 99 unique (79%), 27 with `[%also]` (75 alternatives); every line verified
on the generated lines and again on the PGN read back.
