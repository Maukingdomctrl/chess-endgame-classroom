# The Opposition curriculum

A folder of ten courses about the opposition in king and pawn endings, from understanding the idea to
applying it alone, then its exceptions. They are chapters of one curriculum: each keeps one idea
apart from the others where that helps learning, and each later course assumes the earlier ones.

This folder holds the **design** (what to teach, in what order, with which positions); the generators
that write the PGNs live in `tools/<course>/` as for every course, and follow the owner's rules in the
`endgame-course` and `pawn-endgame-course` skills (exact solver, fastest moves, most stubborn defence,
every line to its real end, exact `[%also]`, the learner plays White, verify twice).

| File | What it is |
|---|---|
| `README.md` | This curriculum: the ten courses. |
| `direct-opposition.md` | The blueprint of course 1, *Direct Opposition*: stages, tasks, the 100 slots, rules for the generator. |
| `direct-opposition.cjs` | The same blueprint as data (the generator reads it): measure, vocabulary, stages, the 100 slots. |
| `tasks.cjs` | The tasks of course 1, decided by the solver and the board (`classify`). |
| `prototypes.cjs` | Real, solver-verified positions that exercise the teaching pipeline. |
| `feasibility.cjs` | `npm run curriculum:opposition`: how many positions the solver offers per task and band, and whether the 100 slots can be filled. |
| `test.cjs` | Checks of the blueprint, the tasks and the prototypes (part of `npm run kit:test`). |

## Principles

- **Understand before recognising.** Each course first shows why the idea works (the side that has to
  move must give way), then asks the learner to obtain it with help, then without help, then to recognise
  when it is *not* the point.
- **Progression is not difficulty.** Stages say what is learnt (introduce, reinforce, vary, apply alone,
  meet the misconception, calculate, the exception, mixed review); difficulty (`teach/difficulty.cjs`)
  only orders positions inside a stage. A later position may be easier when it teaches something new.
- **One vocabulary per course.** An explanation names only ideas already taught (`vocabulary` in
  `teach/explain.cjs`): course 1 never says "key square", course 2 introduces it.
- **The solver decides.** Every claim (wins, draws, slower, zugzwang, "Black must give way") is proved by
  the solver on the real position; a move nothing explains is flagged, not given a made-up reason.
- **No memorising.** Files, pawn ranks, which side moves first, the shape of the first move and the place
  of the defending king vary; mirror images count as the same position; no start position of another
  built-in course is reused.

Difficulty bands are the framework's broad labels (Foundational, Intermediate, Around 1500, Around 1800,
Difficult (approaching 2000)): an ordering aid from solver signals, not a rating promise.

## The ten courses

### 1. Direct Opposition (100 positions) — blueprint: `direct-opposition.md`

- **Objective.** Know what the direct opposition is (the kings on one file or rank with one square
  between; the side *not* to move has it), why the side to move matters (it must give way), how to
  *obtain* it with a king move, how to keep it when the other king steps aside, how it lets the king walk
  in front of the pawn and the pawn promote, and that the defender uses the same idea to hold the draw.
- **Prerequisites.** How kings and pawns move, promotion; *Endgame Basics* lesson 1 (the king is a
  fighting piece) is the natural warm-up.
- **Before moving on.** Takes the direct opposition with the right king move without a cue; keeps it after
  Black gives way; holds a draw with it against Black's pawn; recognises the two cases where it is not the
  first concern (the pawn hangs: protect it; the pawn simply runs: push it).
- **Excluded (later courses).** The term and the targeting of key squares (2, 3), the distant and the
  diagonal opposition (4, 5), tempo moves, triangulation and the word "zugzwang" (6; course 1 says "Black
  must give way" where the solver shows it), rook pawns and the cases where the opposition is slower or not
  enough (7), real pawn races (8).
- **Difficulty.** By the framework: Intermediate to Around 1500, the calculation stage Around 1800. Every
  line is played to the promotion, and King & Pawn endings are full of tempting moves that draw, so no
  line is Foundational; none reaches the Difficult band (measured: `npm run curriculum:opposition`).
- **How it differs.** One idea, direct geometry only, the decision mostly on the first move; the other
  courses build on it.

### 2. Key Squares (60-80)

- **Objective.** The squares that win whoever is to move (pawn on the 2nd-4th rank: the three squares two
  ranks ahead; on the 5th-6th: also those one rank ahead): the goal of the king walk. Why the opposition is
  only a tool to reach them.
- **Prerequisites.** Course 1.
- **Before moving on.** Names the key squares of any non-rook pawn; walks the king to one by the shortest
  safe route; knows that standing on one wins regardless of the move.
- **Excluded.** Fights for a key square decided by the opposition (3), rook pawns (7), distant/diagonal
  approaches (4, 5).
- **Difficulty.** Intermediate to Around 1500; long walks later.
- **How it differs.** A target, not a duel: often no opposition is needed at all.

### 3. Opposition + Key Squares (60-80)

- **Objective.** Win the fight for a key square with the opposition: take it, make the other king give
  way, then step past (outflanking) onto the key square instead of taking the opposition again.
- **Prerequisites.** 1, 2.
- **Before moving on.** Chooses between keeping the opposition and stepping past; explains why stepping
  past wins when the key square is free.
- **Excluded.** Distant/diagonal opposition (4, 5), exceptions (7).
- **Difficulty.** Around 1500, some Around 1800.
- **How it differs.** Two ideas together; the learner decides which one the position asks for.

### 4. Distant Opposition (40-60)

- **Objective.** Kings on one file or rank with three or five squares between: take it from afar, keep it
  as the kings approach until it becomes the direct opposition.
- **Prerequisites.** 1 (3 recommended).
- **Before moving on.** Counts the squares between (odd number, the other side to move) and keeps the
  distant opposition move by move.
- **Excluded.** Diagonal (5), triangulation (6).
- **Difficulty.** Around 1500 to Around 1800 (more moves before the payoff).
- **How it differs.** The decision comes several moves before the kings meet.

### 5. Diagonal Opposition (40-60)

- **Objective.** Kings on a diagonal with one square between (and its distant form): use it to turn into
  the direct opposition, especially near the edge and when the direct square is not available.
- **Prerequisites.** 1, 4.
- **Before moving on.** Recognises the diagonal opposition and converts it into the direct one.
- **Excluded.** Triangulation (6), exceptions (7).
- **Difficulty.** Around 1500 to Around 1800.
- **How it differs.** Geometry the eye misses; the reasoning is the same as course 1.

### 6. Zugzwang and Triangulation (40-60)

- **Objective.** The general idea behind the opposition: the side to move would rather pass (zugzwang),
  mutual zugzwang, and losing a move on purpose (triangulation, a spare pawn move).
- **Prerequisites.** 1-5.
- **Before moving on.** Sees when the move should be handed to the other side and finds the way to do it.
- **Excluded.** Exceptions (7).
- **Difficulty.** Around 1800, some Difficult.
- **How it differs.** The idea behind all the others, named and used deliberately.
- **Solver note.** The solver covers White's pawns against the lone king (one or two pawns). Classic
  triangulation positions have pawns on both sides (K+P vs K+P), which the solver refuses today (en
  passant); with K+2P vs K a spare pawn move is available. Confirm the available material before promising
  lessons.

### 7. When NOT to Take Opposition (50-70)

- **Objective.** The opposition is a means, not the goal: positions where taking it is slower, where it
  draws while another move wins, where the pawn must be protected first, and the rook pawn (the opposition
  does not win against a king in the corner).
- **Prerequisites.** 1-5.
- **Before moving on.** Rejects a tempting opposition move for a concrete reason the board shows.
- **Excluded.** Pawn races (8).
- **Difficulty.** Around 1500 to Around 1800.
- **How it differs.** Exceptions on purpose, after the rule is solid.
- **Solver note.** The solver finds many such positions (pawn on b-d: 406 where taking the opposition is
  only slower, 179 where it draws while another move wins). Many cannot be explained with today's facts
  (the black king reaches the pawn first): add a fact for it, with a test against the oracle, before
  generating this course.

### 8. Opposition in Pawn Races (40-60)

- **Objective.** When the race decides and when the kings do: the rule of the square, shouldering the other
  king away, a pawn that runs while the kings fight.
- **Prerequisites.** 1, 4.
- **Before moving on.** Counts the race before choosing a king move.
- **Excluded.** Nothing new beyond races.
- **Difficulty.** Around 1500 to Around 1800.
- **How it differs.** Tempo counting against geometry.
- **Solver note.** Races with pawns on both sides need the solver extended (en passant); with one pawn
  the race is the defending king against the pawn.

### 9. Mixed Opposition Practice (80-120)

- **Objective.** Apply every idea of 1-8 without being told which one is relevant; spaced review.
- **Prerequisites.** 1-8.
- **Before moving on.** Mostly correct first moves across all task types without help.
- **Excluded.** New ideas.
- **Difficulty.** Mixed, interleaved; the order follows review spacing, not difficulty.
- **How it differs.** No labels, no cues.

### 10. Opposition Final Exam (30-40)

- **Objective.** Assessment of the curriculum: no hints, no marks, a closing note only.
- **Prerequisites.** 1-9.
- **Excluded.** Explanations during the line.
- **Difficulty.** Covers the whole range, the hardest positions of each course included.
- **How it differs.** Measures, does not teach.
