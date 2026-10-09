# Rook and pawn against rook: prototypes (five pieces)

Not a course: real five-piece positions run through the whole course pipeline, to show what the five-piece
engine (`../../egtb/`) gives a rook-endings course and what such a course would still need. A lesson list
needs the owner's OK first (the endgame-course skill); this folder is the evidence for proposing one.

```bash
node tools/course-kit/curricula/rook-endings/prototypes.cjs     # KIT_CACHE=1 keeps the tables (about 6 minutes to build)
node tools/course-kit/egtb/survey.cjs KRPKR --goal conversion  # what the attacking side offers
node tools/course-kit/egtb/survey.cjs KRKRP --objective hold   # what the defending side offers
```

`prototypes.cjs` finds positions by criteria on the board (where to look), lets the solver decide everything
else, plays the lines with `line.cjs`, checks them with `verify.cjs`, writes a PGN (`.out/`), reads it back
and checks every line again (`pgn.checkCourse`). One verify setting covers both kinds of line: `{ goal:
'conversion', objective: 'auto' }`: a win ends with the learner's capture or promotion that keeps it (the
Lucena: the safe promotion, not 30 moves later in K+Q vs K+R); a draw is held, measured by the mate tables,
to a draw on the board or the last pawn taken with a draw left.

| Kind | Where it looks | The line |
|---|---|---|
| Lucena | the pawn on the 7th (files b-g), the king in front of it, the white rook between the black king and the pawn; 9-31 plies to the conversion | White wins: to the conversion |
| Skewer | the rook in front of its a-pawn on a7, the black rook behind the pawn, the black king on f7-h7 | White wins: to the conversion |
| Philidor | White defends (K+R vs K+R+P): the pawn (files c-f) on the 4th rank with its king beside it, White's king on the pawn's file, its rook on the 3rd rank three files or more from the black king, the black rook on Black's half | a draw held to its end |

## Results (last run: 71 s with the tables cached)

10 lines (4 Lucena, 3 skewer, 3 Philidor), every one verified on the generated lines and again on the PGN
read back from disk; 33 of 59 learner moves unique (56%), 26 learner moves with `[%also]`. Read as a
learner, they show what the solver gives and what a course still has to decide:

- **The skewer is found and proven.** `R7/P4k2/8/8/8/r7/8/K7 w`: 1.Kb2 Ra6 2.Rh8! Rb6+ 3.Ka3 Ra6+ 4.Kb4 Rxa7
  5.Rh7+ Ke6 6.Rxa7: if the rook takes the pawn, the check along the 7th rank wins it.
- **The Philidor defence holds to its end.** `5r2/8/8/8/1kp5/6R1/2K5/8 w`: White keeps the draw; after ...c3 the
  rook goes behind with checks (Rg5, Rb5+), and the line ends when the pawn falls into a drawn K+R vs K+R (the
  last pawn taken with a draw left: a draw on the board for a holding line). Defending moves have many
  equals (a draw is a draw: `[%also]` lists every move that holds), so few learner moves are unique (4 of 10).
- **The fastest conversion is not always the textbook method.** In the Lucena positions the quickest capture or
  promotion that keeps the win is often winning Black's rook (`1K6/1P1k4/8/2R5/5r2/8/8/8 w`: 1.Ra5 Rf8+ 2.Ka7
  Kc7 3.Ra1 Rb8 4.Rb1 Kc6 5.Kxb8): measured to the conversion, Black's most stubborn defence gives up the rook
  rather than allow a quicker promotion. A lesson on building the bridge needs either a filter (lines that end
  with the promotion) or a goal that counts only the promotion; the skill's "fastest is not always the
  textbook method" applies to five pieces too.
- **Criteria decide the quality.** The first run took positions in index order with loose criteria and got
  one-move captures (a rook simply hanging) and only a-pawn Philidors. Scanning the conversion table with a
  depth band (at least 9 plies), the patterns made precise (the rook between the king and the pawn; the
  rook in front of its a-pawn with the black king on f7-h7; the black king beside its pawn and White's rook
  away from it) and a seeded sample gave the positions above, in 71 s instead of 12 minutes.

Measured feasibility (seeded samples, `survey.cjs`): see the last section of `../../egtb/README.md`.

## What a course would still need

- **A rook-endings domain for the teaching layer** (`../../teach/`): the facts a note may name (the king cut
  off by a file, the bridge, the rook behind the pawn, checks from behind, the third-rank defence) read from
  the board, with the contrast rule. Without it the explainer says only what the solver proves and flags
  the move for review, which is honest but not a lesson.
- **The lesson list**, from the survey numbers (how many positions have a single fastest move of the
  lesson's kind, by depth) and the owner's OK.
- **Marks** for the ideas (the file the king is cut off on, the bridge's rank, the third rank).
