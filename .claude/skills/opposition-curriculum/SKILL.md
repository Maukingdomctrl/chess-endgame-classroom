---
name: opposition-curriculum
description: Build the next course of the Opposition curriculum (courses 2-10 in apps/endgame-classroom/tools/course-kit/curricula/opposition/README.md - key squares, opposition + key squares, distant and diagonal opposition, zugzwang and triangulation, when not to take the opposition, pawn races, mixed practice, final exam) the way course 1, Direct Opposition, was built - blueprint as data, feasibility, slot filling with variety rules that work for one pawn, texts with checked claims, and the full checks - and avoid what cost time there. Use when asked to design, generate, extend or check any Opposition-curriculum course, or a King & Pawn course filled from a slot blueprint. Use together with endgame-course (owner rules, PGN format) and pawn-endgame-course (the pawn toolkit).
---

# Building an Opposition-curriculum course

Course 1 (*Direct Opposition*, 100 lines) is the worked example: blueprint
`tools/course-kit/curricula/opposition/direct-opposition.{md,cjs}`, generator `tools/direct-opposition-course/`
(read its README). The owner rules of **endgame-course** apply unchanged: lesson list (the blueprint) first and
wait for the OK, no moves from memory, fastest moves and most stubborn defence, every line to its real end, exact
`[%also]`, the learner plays White, verify twice, deterministic, wait for the browser test before committing.

## What exists, and what each new course writes itself

| Reuse as is | Write per course |
|---|---|
| `solver.cjs`, `line.cjs`, `verify.cjs`, `pgn.cjs`, the pawn toolkit and its oracle | the blueprint (`<course>.cjs` + `.md`: phases, slots, constraints, vocabulary) |
| `teach/` (explainer, concepts, difficulty, progression `checkSequence`) | a task classifier like `tasks.cjs` (course 1's is specific to its six tasks) |
| `pawn/domain.cjs` facts: direct, distant and diagonal opposition, key squares, protected/attacked pawn, blockade, the square of the pawn | a feasibility script like `feasibility.cjs` (`--json` / `--from-json`) |
| `course-kit/read.cjs` (`npm run course:read`) | the generator: copy `tools/direct-opposition-course/` and adapt `texts.cjs`, the task-specific parts of `search.cjs`, `build.cjs` and `check.cjs` |

`otherCourseStarts()` in `direct-opposition.cjs` lists four PGNs: a later course must also exclude the starts of
the opposition courses before it (add their files to its own list).

## Workflow (with what each step costs on a 4-core cloud machine)

1. **Blueprint and classifier**, with the solver deciding every task (`classify(fen, ex)` returns null where a
   position fits no task). Prototypes through the whole pipeline first (`prototypes.cjs`, `test.cjs`).
2. **Feasibility**: count candidates per task and band and fill-check the slots. Course 1: about 12 minutes for
   every K+P position (single-threaded). Save with `--json`; slot-only changes reuse it with `--from-json`.
   **Also count distinct lines per task before promising slots** (see Variety): course 1's blueprint asked for 15
   Black-moves-first lines where only 18 truly different ones existed, and for 4 protect lines where only 3
   existed; the counts per task looked ample (57 and 6).
3. **Lesson list = blueprint**: show it, wait for the OK.
4. **Generator**: `search` (fill the slots), `build` (real FENs, `verify.cjs`, re-classify, `checkSequence`),
   `pgnout` (texts, notes, marks, read back), `check` (independent). Iterate with `--from-json` (about 2
   minutes; 80 s of it replays every candidate's line).
5. **Read the course as a learner**: `npm run course:read -- <course>` (seconds), then read every line. Course 1's
   real problems were all found this way (below).
6. **Checks**: `npm run course:<name>` (0 problems in build, read-back and independent check),
   `npm run kit:regress -- <name> --twice` (two full runs from scratch: about 28 minutes for course 1),
   `npm run build`, `npm run lint`, the curriculum `test.cjs`, `npm run course:e2e -- <id> --all` (about 12 s a
   line: 20 minutes for 100). If no shared toolkit code changed, the other courses need no regression.

## Selecting positions (the hard part)

- **Fill with a matching, not greedily.** A greedy pass in slot order starves the scarce slots late. Course 1
  takes a pick only while a bipartite matching says every open slot can still get a line, picks the slot with
  the fewest lines left first, and backs up when stuck (`search.cjs`).
- **Make conflicts visible to the matching.** Lines that conflict pairwise (one is the other's continuation) are
  grouped in cliques and each clique counts as one resource; without that the matching is optimistic and the
  search thrashes. Even with cliques it stalled at about a third of the slots until the variety rules were
  ones the candidates can meet (below): then it filled all 100 without backing up once.
- **Rank, don't filter, what the slots cannot always give**: the run order (at most one band easier than the
  line before in the same stage; `checkSequence` tolerance 20), not the same coarse picture as a neighbour, no
  start on another line, the least overlap, then the blueprint's keys (explained moves, band, length).
- **"Every important move explained" is almost never true** for lines to the promotion (about a third of K&P
  moves have no fact that explains them, and course 1's words exclude key squares): rank by the number of
  unexplained important moves (`signals.critical - signals.concepts.length` is a cheap proxy).
- **The line must play the task's move.** With several equally fast moves the default tie-break may play another
  move that also has a reason (protecting the pawn beats taking the opposition alphabetically): force the
  task's first move and keep the others as `[%also]`.

## Variety with one pawn

The two-pawn course's rules (no line through another's start, at most a quarter of a line shared) leave slots
empty with one pawn: K+P lines converge (a long walk passes the starts of the shorter walks; most lines end in the
same promotion pictures). Course 1 measured it and kept what matters:

- no start twice; no line that is another one shifted along the board (`keys.cjs` `lineShape`: the start seen
  from the pawn plus every move as a step; mirror images alike);
- no two lines that reach the same position after the **learner's** first move (ply 2 when Black moves first:
  comparing ply 1 let a Black-moves-first line and a take line become the same line);
- within a task, no line that starts in or joins another line's first two moves;
- report the rest: the share of positions in more than one line (62% in course 1), starts that lie on another
  task's walk (4). Rules that sound right ("no shared first half", "same picture one file over is a repeat")
  turned out infeasible or too coarse when measured: measure a rule on the candidates before adopting it.

## Texts

- **Help levels** (blueprint): 3 = idea named + cue + marks, 2 = cue + marks, 1 = cue, 0 = nothing; the
  explanation after the move stays except in the assessment (closing note only).
- **Cues come from the concept of the first move's reason.** "Protect the pawn" had no concept in the pawn domain;
  course 1 defines one locally (`texts.cjs`). Move it to `pawn/domain.cjs` when convenient (it changes
  `signals.concepts`, so the saved candidates are stale afterwards).
- **Check every claim a text makes** against the real line (`texts.cjs` `claims()`: "diagonal step", "along a
  rank", "Black must give way", "pawn far back"...). It caught "pawn far advanced" for a pawn on its 4th rank and
  "straight" in a negated sentence.
- **Show the mistake the slot is about**, not the explainer's default alternative: a premature push for a
  push-trap slot, the step that hands Black the opposition, and for protect/push the move that takes the
  opposition ("Kf8? — Taking the opposition only draws here. Black answers Kd7.").
- **Untaught words leak.** `VOCABULARY` lets a zugzwang through when it does not follow the direct opposition, and
  the generic phrase says "zugzwang"; a pawn move can be explained by "Black must give way" (a tempo move, course
  6). Course 1's generator hides both and fails if one reaches the PGN. Fixing `VOCABULARY` changes tie-breaks,
  so do it together with a new feasibility run.
- Say a reason in full once, then "Take the opposition again." at most twice per line; long walks otherwise
  repeat it seven times. Keep the course's first intro short (it carries the welcome, the lesson and the line).

## Notes for the next courses (to check with the solver before promising)

- **2 Key Squares**: the `keySquare` fact and concept exist (`geometry.keySquares`; rook pawns come with the
  domain's `rookPawn` exception); allow them in the vocabulary. Tasks are new ("walk to a key square"), so a
  new classifier.
- **3 Opposition + Key Squares**: the explainer already ranks key squares before the opposition (domain
  priority); the task is choosing between keeping the opposition and stepping past.
- **4 Distant / 5 Diagonal**: the facts exist (`kind: 'distant' | 'diagonal'`, only while the black king
  contests the pawn's way); course 1's vocabulary excludes them, so open them up.
- **6 Zugzwang and Triangulation**: the curriculum README says the solver refused K+P vs K+P; since then the egtb
  engine solves four pieces with pawns on both sides (`course-kit/README.md`). Check the cost and the measure
  (the promotion measure covers White's pawns against the lone king only), and note that `pawn/domain.cjs`
  reads one side's pawns only: with pawns on both sides there are no facts or likely moves, so no
  explanations or traps without extending it.
- **7 When NOT to take the opposition**: needs rook pawns (course 1's `matches()` excludes them) and a new fact,
  "the black king reaches the pawn first", tested against the oracle (`prototypes.cjs` `not-enough` is the
  guard rail that must stay flagged until then).
- **8 Pawn races**: one pawn is the king against the pawn (`ruleOfSquare` concept); two-sided races are egtb
  materials, as for course 6.
- **9 Mixed practice / 10 Final exam**: draw from the earlier courses' candidates, exclude every earlier start,
  order by review spacing (9) or with no notes but the closing one (10).

## Failure modes found in course 1

| What happened | Now |
|---|---|
| Feasibility file missing in a fresh clone (`.out/` is gitignored) | one full run (12 min), then `--from-json` |
| Greedy slot filling starved the scarce slots | matching + cliques + most constrained first + backtracking |
| Variety rules from the two-pawn course left slots empty | the one-pawn rules above, measured first |
| A field name clash (`shape`) silently emptied the slots with a shape constraint | keep the classifier's fields; name your own apart |
| An "either" line played the protecting move, not the opposition | force the task's first move |
| Two lines identical after the learner's first move | compare after the learner's move, not ply 1 |
| "Black is in zugzwang" and tempo-move notes in course 1 | filtered; fix `VOCABULARY` with the next feasibility run |
| Notes showing a different mistake than the slot teaches | the slot's mistake chosen in `build.cjs` |
| `pkill -f <script>` also killed the calling shell | find the pid (`pgrep`) and wait on it with `tail --pid` |
