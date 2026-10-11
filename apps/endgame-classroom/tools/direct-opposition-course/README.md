# Direct Opposition course generator

Builds `courses/direct-opposition-course.pgn` (the built-in *Direct Opposition* course, course 1 of the
Opposition curriculum) from its blueprint: `../course-kit/curricula/opposition/direct-opposition.cjs` (the
100 slots: phase, task, help level, band, constraints) and `direct-opposition.md` (why, and the rules for the
generator). Nothing is chosen by hand: the candidates are the curriculum's feasibility check (every King &
Pawn position classified by `tasks.cjs`, its line played with best play and analysed), the lines are
`../course-kit/line.cjs`'s, the notes the course explainer's (`teach/explain.cjs` with the course's words).

```bash
npm run course:opposition                    # from apps/endgame-classroom: enumerates the candidates (about 12 minutes)
npm run course:opposition -- --from-json     # reuses the saved candidates: about 2 minutes
npm run kit:regress -- opposition --twice    # byte for byte, twice (the full run)
npm run course:e2e -- direct-opposition --all
```

`--from-json` reads `../course-kit/curricula/opposition/.out/feasibility.json`, the same list
`npm run curriculum:opposition -- --json` writes (and the full run here writes too). Use it while changing
slots or texts; the regression and the final run go without it.

| File | What it does |
|---|---|
| `search.cjs` | Fills the 100 slots: the candidates that `matches()` each slot (starts of the other built-in courses excluded; protecting the pawn means a king move), every candidate's line played, the variety rules below, then a depth-first search, the slot with the fewest lines left first, that takes a pick only while every open slot can still get a line of its own (a bipartite matching, conflicting lines grouped in cliques). Ranking within a slot: the progression's run order (at most one band easier than the line before in the same stage; not the same picture as a neighbour), no start on another line and the least overlap, the fewest important moves without a reason in the course's words, the slot's band and fewer moves in phases 1-2, variety, unique moves, the score. Every second line of a phase is mirrored. Writes `.out/picked.json`. |
| `build.cjs` | Real FEN/SAN with chess.js; every line through `verify.cjs` (objective `'auto'`: wins to the safe promotion, defending lines to a draw on the board; the learner is White, also when Black moves first); the real line classified again and matched to its slot; the explanation of every learner move, the tempting moves (red arrows), the mistake the first note shows; `checkSequence` on the whole course. Writes `.out/lines.json`. |
| `texts.cjs` | Lesson titles and intros (one lesson per phase), what each line asks for, the idea at full help, the cues (the concept of the first move's reason; protecting the pawn has a course concept), the takeaway of every slot, and `claims()`, which checks each text's claims (diagonal, sideways, along a rank, Black must give way, pawn far back...) against the real line. |
| `pgnout.cjs` | Intros by help level (3: idea, cue, marks; 2: cue, marks; 1: cue; 0: nothing), notes after the move (the first learner move always, with the tempting mistake; later ones when important and explained within the course's words, a short reminder at most twice; nothing flagged, no untaught word, no pawn move explained by "Black must give way", which is the tempo idea of course 6), a closing note, marks in Learn mode only. Writes the PGN, reads it back and verifies every line again. |
| `check.cjs` | The independent check: the pawn checker and the separate oracle (`../course-kit/pawn/`) for every winning line (a Black-moves-first line from the position after Black's move, and that move as the longest defence), the oracle on the board turned round for the defending lines (every learner move keeps the draw, `[%also]` exactly the other holding moves, a draw on the board at the end), the task of every line read again from the board (the blueprint's counts), the lessons, no marks or notes where the slot has none, and the variety rules. |
| `keys.cjs` | Position keys (mirror images alike): `canonical`, `lineShape` (a line shifted along the board), `pattern` (where the kings stand, coarse), `pawnKey`, mirroring. |

## Variety, and what the solver allowed

- No start twice; no line that is another one shifted along the board (except protecting the pawn: only
  three different lines exist for four slots, one comes back reflected, in the assessment); no two lines that
  reach the same position after the learner's first move; within a task, no line starting in or joining
  another line of its task within that line's first two moves.
- Stricter rules leave slots empty, measured on the 1,535 candidate lines: the 57 Black-moves-first lines are
  18 families of one walk each (a long walk passes the starts of the shorter ones; the blueprint asks for 15),
  every long walk crosses them, and "at most a quarter of a line's positions shared" (the two-pawn course's
  rule) fails two thirds of the slots, because single-pawn lines converge on the same walks and promotion
  pictures. So across tasks a line may meet another one later (4 Black-moves-first starts lie on another
  lesson's walk; 62% of all positions appear in more than one line), and the search prefers lines that do
  not: both are reported by `search.cjs` and `check.cjs`.

## The course

8 lessons, 100 lines: 59 take the opposition, 15 Black moves first (keep it), 5 equal moves, 12 defending
(hold the draw against Black's pawn), 4 protect the pawn first, 5 the pawn runs. Pawns on the b- to g-files
(no rook pawns), 2nd to 6th rank; bands Intermediate 42, Around 1500 50, Around 1800 8. Help 3 on 16 lines,
2 on 22, 1 on 32, none on 30 (the assessment: closing note only).

Marks: red arrows on the tempting moves (likely ones, by the pawn domain's heuristic) that only draw, or lose
in a defending line, before each important learner move of a line with help 2 or 3; never on the move to play.
