---
name: pawn-endgame-course
description: Build, extend, check or regenerate a pawn-endgame course for the Endgame Classroom app (apps/endgame-classroom) - White's pawns against the lone king, every line played to a safe promotion - with the pawn toolkit in tools/course-kit/pawn/. Covers the promotion measure, candidate search and sampling, structural variety, stalemate, the solver cache, independent verification and the failure modes found so far. Use for a new pawn course or lesson, when changing a pawn course, the promotion goal, the pawn toolkit, its cache or its variety rules. Use together with the endgame-course skill (its owner rules and PGN format apply).
---

# Building a pawn-endgame course

This skill holds the method: what to decide and why. The code is in `apps/endgame-classroom/tools/course-kit/pawn/`
(read its README: modules, interfaces, workflows); the working example is `tools/pawns-course/` (*Two
Connected Pawns*). The general owner rules of the **endgame-course** skill apply unchanged: lesson list
first and wait for the OK, never moves from memory, verify twice and fail loudly, the PGN format, ship.

## Skill or code?

- **Code** (toolkit, then the checker): anything a future course would compute again, and every rule that
  must never be broken. A must-hold rule lives in the generator *and* in `checker.cjs`, so a mistake in one
  is caught by the other.
- **Skill** (here): judgement and its reasons: which lessons, which filters, how much repetition is fine,
  when to trust a sample, what went wrong before.
- Test: "Will the next course need to run this?" → code. "Will the next author need to know why?" → skill.
  If you write the same helper twice, move it into the toolkit; if a note keeps explaining a rule, it is a
  checker rule.

## The measure

- **Solver goal `'promotion'`** (`table(name, { goal: 'promotion' })`): plies to a *safe promotion*: a queen
  or a rook that the black king cannot take at once, no stalemate, and the position still won. A pawn
  move that mates also reaches the goal. A bishop or knight never counts, even where it would still win.
  If Black takes a pawn, the line goes on with the other one (the one-pawn table).
- **Learner**: always a fastest move (fewest plies). **Opponent**: always a longest defence; it may take a
  pawn. **Every line ends in the promotion** (a queen; a rook where the queen would stalemate).
- **Never assume the queen.** Among moves that reach the goal at once, the line plays the one with the
  fastest mate afterwards (`promotion.bestFinishes`, the same order `verify.cjs` uses). That picks a
  rook where a queen stalemates and the right pawn where the other pawn's queen fails. Explain the
  alternative in the note ("b8=Q would have been stalemate").
- **Fastest is not the textbook.** Letting the king take one pawn while the other runs is often fastest;
  the most stubborn defence often grabs a pawn. Build lessons around what the solver does, and filter
  with `post` when a lesson must avoid it.

## Workflow (the order matters)

1. **Lesson concept**: one idea per lesson, stated as something the learner finds on the first move.
2. **Ask the solver whether it exists** before promising it: a scratch script on `enumerate` + `playLine`
   with the lesson's filters, counting positions, line lengths and unique-move share. (Two connected
   pawns *never* promote alone against a king standing in front of them; the lesson had to be reshaped.)
   Then propose the lesson list and wait for the OK.
3. **Structural constraints**: `pre(c)` on the start (who stands where: `geometry.cjs`), `post(line)` on
   the whole line (no capture, the white king never moves, a queen at the end, `kingAway` on every ply).
4. **Enumerate**: each position once (the solver's canonical index merges mirror images and pawn order),
   only starts with a single fastest first move. One-move finishes are decided lazily.
5. **Group and sample** (below), **solve** each sampled start into a line, **rank** (unique-move share,
   then length, then table index), **select** with the variety rules (below). Scarce groups pick first.
6. **Realize** (chess.js; every second line of a lesson mirrored), **verify** (`verify.cjs`), write the
   PGN with notes and marks, read it back and verify again.
7. **Independent check** (`checker.cjs`), **regression** (`npm run kit:regress -- --twice`), **build, lint,
   browser test** (`course:e2e -- <id> --all`). **Wait for the browser test before committing.**

## Candidate sampling

- Line playing is the expensive step (a group can have 20,000 candidates). Filter with `pre` first (cheap),
  then take an **even sample** (`sampleEvenly`: every k-th of the pool in table-index order, spread over the
  whole list, deterministic), then play lines and apply `post`.
- The limit is a parameter (`sample`, per group `g.sample`; 3000 worked for *Two Connected Pawns*: plenty to
  choose from, about a minute per run). Raise it when a group runs short or its quality matters more.
- `sampleStratified(list, limit, shapeKey)` gives every pattern its share when one pattern dominates the pool.
- Known weakness: an even sample shifts when the pool changes (a change of the solver's rule moved 16
  practice lines). Expect that, check the result, and report it.

## Structural variety

- **Exact keys** (`posKey`, `setupKey`, `pawnSetKey`, `kingsKey`, `pathKey`) catch repeated positions and
  walks. All treat mirror images (files a<->h) and the order of identical pawns as the same.
- **The pattern** (`shapeKey`) catches repeated *ideas*: side by side or a chain, and where each king stands
  relative to the front pawn (ahead / level / behind; on the other pawn's side / the front file / the far
  side), a white king more than two squares away counting as "far". `wingKey` is the pair of files.
- **Lessons learned**: a fine pattern (exact king offsets) created *false variety*: escort lines that
  differed only by the black king's square all passed as "different". A strict cap (two per lesson)
  rejected *legitimate* lessons: "side by side" is one pattern by nature. The rule now: cap patterns and
  file pairs **per group at max(2, a third of the group)**; split a lesson into groups (e.g. 2-move and
  3-move) instead of loosening the rule; when the idea *is* one pattern, the repetition is the drill:
  vary the files and the wing (mirroring) instead.
- Course-wide: every line its own white king and pawns; no start repeated or passed through by another
  line; no black-king walk repeated; at most a quarter of a line's positions shared. Short lessons
  (1-3 moves) need other kings, other pawns and another walk in every line instead.
- Prefer instructional diversity (formation, king zones, files, wing, line length) over new FENs.

## Stalemate

- Lines never pass through stalemate (the solver measures it as a draw, the checker re-checks it).
- A stalemate lesson picks starts with a trap on the first move (`player.stalemates`); red arrows show the
  trap moves. **No arrow on the squares of the move to play**: the app draws that move as its own arrow
  and hides any mark on the same squares (`b8=R` with a red `b7b8` arrow for "b8=Q stalemates"). Say it in
  the note instead (`teach.withoutHiddenArrows`; the checker enforces it).

## Opponent and learner tie-breaks

- Learner, among equally fast moves: no pawn left hanging, pawn moves before king moves, the pawn further
  from the black king, the king nearer the front pawn; the others become `[%also]`. Keep the first move
  of every line unique; allow `[%also]` later if the idea needs it.
- Opponent, among equally long defences: take a pawn (what a real defender does), then stay near the front
  pawn. Lessons where a capture would distract filter `!captured(line)`; "if the king takes one, the other
  runs" requires it.

## Notes and marks

- Every note states what is true in the position: derive it from the board (`teach.cjs`) and, for claims
  about the future, the solver ("taking the f-pawn would not save Black" only after probing it).
- Usual noise to remove: "Opposition!" while the king is only walking over; "the king attacks the pawn"
  right before the promotion; "the king is almost there" three times. Give the walk a target and a
  distance instead.
- Marks: one colour per square (`oneColourPerSquare`); green = queening squares or where the king is heading,
  blue = the black king's squares, red = the pawn the king will take or the stalemating move. Exam: no
  marks, closing note only. Practice: no notes but "Queen!".

## The teaching layer for pawn endings

`tools/course-kit/pawn/domain.cjs` gives `../teach/` the pawn facts (`teach.pawnFacts`), their words, the
concepts and the exceptions. What to keep in mind:

- **Opposition** is reported only while the black king stands in front of a pawn and inside its square
  (the kings fight for the pawn's way). Without that rule every pawn push "took the opposition", because
  the side to move changes with every move.
- **Rule of the square**: count the side to move (White to move: the pawn steps first; Black to move: one
  step more for the king) and the double step. `teach.catches` / `geometry.catches` assume White to move.
- **Key squares**: `geometry.keySquares` (the King & Pawn course uses the same function); a rook pawn has
  b7/b8 (g7/g8) and is flagged `rookPawn` wherever a reason relies on the opposition or the key squares.
- **Likely moves** (`plausibleMoves`): pawn pushes and king moves that do not retreat. Judgement, not data;
  used for "!", traps and difficulty, never for correctness.
- About a third of the important King & Pawn moves have no fact that explains them (the king shoulders the
  other one away, the walk round). They are flagged `no-grounded-reason`, not given a made-up reason. A
  new fact (with a test against the oracle) is the way to explain more.
- **Defending** (the learner without the pawn, against Black's pawns): `domain.cjs` reads the position on
  the board turned round (`flipFen`) and swaps the sides back, so the same facts and phrases work ("Kc2! —
  Take the opposition. Black must give way."). `line.cjs` and `verify.cjs` still play and check winning lines
  only: add a holding mode (every learner move keeps the draw, `[%also]` exactly the other holding moves)
  before generating defending lines.
- **"Black must give way"** is said only when the solver's zugzwang follows the direct opposition; the
  word "zugzwang" belongs to the course that teaches it.
- **Opposition by a pawn move** is a tempo idea: a course before it leaves it out through its vocabulary
  (the reason carries its move).

## Caching

- **Use** `KIT_CACHE=1` while iterating on a generator, and for repeated self-tests and regressions: the
  two-pawn course goes from about 4.5 minutes to about 1 (the tables are the slow part).
- **Invalidation is automatic**: every cache file records its producer and a checksum of the producer's
  code (`solver.cjs` + `board.cjs`, or `oracle.cjs`); anything else is ignored and rebuilt. Bump `FORMAT`
  in `cache.cjs` when the file layout changes; if a table's values ever depend on something outside those
  files (a new option), add it to the key or to `PRODUCERS`.
- `npm run kit:cache` lists current/stale files, `-- prune` removes stale ones. Before committing a course,
  run its generator once without `KIT_CACHE`.

## Determinism

No randomness, no clock, no unordered iteration: candidates come in table-index order, ranking ends on
the table index, sampling is by position, mirroring alternates by order. Prove it with
`npm run kit:regress -- <course> --twice`; other courses must stay byte-identical unless changed on purpose
(say so in the report).

## Verification requirements

All of these pass, none is weakened to make a change pass:

| Check | Command | Independent of the generator? |
|---|---|---|
| Lines verified on real FENs, twice | inside `course:<name>` | same solver, separate code path |
| Independent course check | `course:<name>` (`check.cjs`) / `kit:check` | yes: oracle + chess.js |
| Solver against the oracle, every position | `kit:selftest -- promotion` | yes |
| Unit tests, incl. broken lines the checker must catch, and the teaching layer's claims against the oracle | `kit:test` | the teaching claims: yes (oracle) |
| Every course byte for byte, twice | `kit:regress -- --twice` | - |
| Build, lint, browser | `npm run build`, `npm run lint`, `course:e2e -- <id> --all` | - |

The checker takes one thing on trust: among several safe promotions at once, which mates fastest.

## Failure modes found so far

| What happened | Now |
|---|---|
| A queen the king could take still counted as the goal (the other pawn won anyway) | safe = cannot be taken at once |
| A safe bishop promotion counted as the goal (3,816 positions differed from the oracle) | queen or rook only |
| A lesson promised pawns winning alone against a blockading king | ask the solver first |
| Fine pattern key: false variety; strict cap: rejected lessons | coarse key, cap a third per group |
| "White king far away" but next to the queening square | `kingAway` on every ply |
| Notes claiming what the line does not show | derive from board and solver |
| Red arrow hidden by the app's move arrow; committed before the browser test ended | `withoutHiddenArrows`, checker rule, wait for e2e |
| A pawn push in a race "took the opposition" (the side to move flips every move) | opposition only while the black king contests the pawn's way |
| Rule of the square off by one with Black to move | count the side to move and the double step (`pawnFacts`) |
| 5:40 per run | cache (identity-checked) + capped sampling |

## Adding a lesson to a pawn course

1. Experiment (step 2 above); agree the lesson with the owner.
2. Add a group in `search.cjs` (`v`, `count`, `pre`, `post`, `minScore`, `scarce`), texts in `pgnout.cjs`
   (`LESSONS`, `GROUPS`), and a note case if the lesson has a new kind of move.
3. `KIT_CACHE=1 npm run course:<name>`, read the lesson as a learner, fix what reads badly.
4. The rest of the course will usually shift (shared variety sets): check, regress, report.
