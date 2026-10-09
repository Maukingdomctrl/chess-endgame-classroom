---
name: endgame-course
description: Build, extend or regenerate a built-in endgame course for the Endgame Classroom app (apps/endgame-classroom) the provably-correct way - exact solver, search for teaching positions, independent verification, PGN with notes and board marks, registration, browser test. Use when asked for a new course (e.g. two-rook mate, rook vs pawn, bishop + knight, five-piece endings such as rook and pawn vs rook with the Lucena and Philidor positions), to add or change lessons in a generated course, or to check or regenerate one.
---

# Building an endgame course

Courses are generated, never written by hand: an exact solver decides every move, a search picks the
positions, an independent checker verifies every line, and the PGN is written by a script that
regenerates it byte for byte. Everything shared lives in `apps/endgame-classroom/tools/course-kit/`
(read its README); each course has its own generator in `tools/<course>/`. The working examples are
`tools/basics-course/` (mates with K+Q and K+R, K+P lines), `tools/kpk-course/` (King & Pawn),
`tools/ladder-course/` (two heavy pieces) and `tools/pawns-course/` (two connected pawns). **For pawn
courses (White's pawns against the lone king, lines to the promotion) also use the pawn-endgame-course
skill**: it has the pawn toolkit, the independent checker and what was learned there.

## Rules (the owner's, non-negotiable)

1. **Lesson list first.** Before writing any position, show the proposed lessons (title, number of
   lines, what the learner must find, the marks) and wait for the owner's OK. Suggest changes if
   something is missing or out of order, and check feasibility with the solver before proposing.
2. **No moves from memory.** Use the exact solver (`course-kit/solver.cjs`, any material up to 5
   pieces, en passant included; `kpk-course/kpk.cjs` for K+P lines measured to the promotion).
3. **Best play.** Every learner move keeps the win and is a fastest one (lowest distance to mate, or
   quickest safe promotion in K+P lessons). The opponent always plays the most stubborn defence
   (longest DTM).
4. **Every line to its real end**: checkmate in mating lessons, the promotion in K+P lessons, the capture or
   promotion that keeps the win in five-piece lessons whose mate belongs to another ending (goal
   `'conversion'`: the Lucena ends with the safe promotion, not 30 moves later in K+Q vs K+R), a draw on the
   board (the pawn taken, stalemate, repetition) in a defending line. Never stop halfway. A defending line
   (`objective: 'hold'` in `line.cjs` and `verify.cjs`) accepts only moves that keep the draw against the
   opponent's best play; its `[%also]` lists exactly the other moves that keep it.
5. **The idea should be the only correct move.** Prefer positions where it is. Where other moves are
   exactly as good (same DTM; for a defence, also holds), list them as `[%also Kd6,Ke7]` in that
   move's comment. Never list slower moves. Report the share of unique learner moves and how many have
   `[%also]` alternatives.
6. **Verify twice and fail loudly**: once on the generated lines, once on the PGN read back from disk
   (`course-kit/verify.cjs`, `pgn.checkCourse`). Any problem stops the run with a non-zero exit.
7. **The learner plays White** in every line.
8. **Generator in `tools/<course>/`** with a README and an npm script `course:<name>`; it must
   regenerate the PGN byte for byte (deterministic: no randomness, no time, stable sort keys).
9. **Don't change the board's look or the colour theme.**
10. **Ship**: PGN in `courses/`, registered in `src/lib/builtinCourses.ts`, `npm run build` and
    `npm run lint` pass, browser test passes. Commit on a new branch and push; open a pull request only
    when the owner asks (they merge pull requests themselves). The owner runs the app on Windows (Git
    Bash, `npm run dev`).

## PGN format (match `courses/king-and-pawn-course.pgn`)

- One game per line: `[Event]` = `[LineName "NN. Lesson title (i/n)"]`, `[Site "Endgame Classroom"]`,
  `[White "?"] [Black "?"] [Result "*"]`, `[SetUp "1"]`, `[FEN]`, `[LineDescription "the one-sentence
  takeaway shown when the line is completed"]`. `course-kit/pgn.cjs` writes exactly this.
- `{intro}` before the first move: the idea in plain, short, learner-friendly English. The first line of
  a lesson also says what the colours mean. The intro is shown in Practice too, so it must not give
  the answer away.
- Notes on moves where they teach something; don't repeat the same note move after move (say it in
  full once, then a short reminder at most, unless it carries news such as a box size). The final move
  always gets a clear note ("Checkmate! ...", "Queen! ...").
- Board marks go in the comment of the move *before* the learner's turn (they are shown in Learn mode
  when it is the learner's move): `[%csl Gd6,Re6]` squares, `[%cal Ge2e4]` arrows. G = target squares,
  R = danger (the move that only draws or stalemates, the mated king), B = zones (the box the king is
  trapped in, or the squares it can step to). No marks in the exam.

## Five-piece endings (`tools/course-kit/egtb/`)

Read `egtb/README.md`. `solver.cjs` routes five-piece materials (and pawns on both sides) to the egtb engine
with the same API, so `line.cjs`, `verify.cjs` and the course pipeline work unchanged.

- **Check the cost first** (`egtb/README.md`, "What it costs"): a pawnless ending is one table (about a
  minute); piece and pawn against a piece is five (K+R+P vs K+R: about 6 minutes on four cores, 3.2 GB, 1.5 GB on disk); pawns
  against pawns need 75 five-piece tables (28 GB): do not promise such a course without the owner's OK on that.
- `KIT_CACHE=1` while iterating (a five-piece family takes minutes to build); the final run without it, as for
  the pawn courses, or with it if the owner agrees to the disk space.
- **Goal `'conversion'`** for winning lines (`verify-opts`: `{ goal: 'conversion', probe }`): the learner's
  fastest way to a capture or promotion that keeps the win. `[%also]` is exactly the equally fast moves, as
  always. Defending lines: `objective: 'hold'` with goal `'mate'`.
- **The learner plays White**: a defending lesson is the colour-swapped material (Philidor: K+R vs K+R+P);
  `table('KRKRP')` is a view of `table('KRPKR')`, nothing is built twice.
- **Feasibility**: `node tools/course-kit/egtb/survey.cjs KRPKR --goal conversion` (or `KRKRP --objective
  hold`) counts what a lesson can use (a single fastest move, its kind, tempting moves that fail) before the
  lesson list is proposed; `npm run kit:positions` lists candidates with their traps.
- **The fifty-move rule** is not in the tables; `verify.cjs` rejects a line with 50 moves without a capture or
  a pawn move (two bishops against a knight can need 66).

## Teaching, difficulty and progression (`tools/course-kit/teach/`)

Read `teach/README.md`. The layer explains moves, tags difficulty and orders lines for learning, on the
same solver as the course. Its rules are owner rules too:

- **Never invent a reason.** A note says why a move works only with a fact the move leaves that no
  failing move leaves (contrast), or a zugzwang the solver shows; why a move fails, only with an event on
  the board or what the solver's refutation gains. Otherwise say only what the solver proves ("Black
  answers Kc6 and holds the draw.") and flag the move for review. Never claim a forced continuation the
  solver has not checked.
- **Teaching never changes the accepted moves.** `[%also]` stays exactly `verify.fastestMoves`; equal moves
  are named ("Kd5 and Kf5 win just as fast."), not explained away. `analyze.cjs` checks it.
- **Short**: one sentence, two at most, 12 words each, 20 in all (`readable()`), read in 4-5 seconds.
  "Kf4! — Take the opposition. Black is in zugzwang: every move loses." Not every mistake is a blunder:
  `?!` still wins but slower, `?` the win is gone, `??` only when it is gone at once.
- **Cues** come from the concept that explains the move, are questions, and name no square and no move.
  No concept, no cue.
- **Difficulty** is signals (traps a learner would consider, counter-intuitive moves, zugzwangs, length,
  narrowness); the composite and its label (Foundational ... Difficult, approaching 2000) are a sorting
  aid, not an Elo. Report the signals with any label.
- **Progression is not difficulty.** Stages (introduce, reinforce, variation, independent application,
  misconception, calculation, exception, mixed review) and their help levels are the course's plan;
  difficulty only orders positions within a step. A course passes its own plan; `checkSequence` checks it.
- **Where things go**: generic mechanisms in `teach/`; the ideas of one kind of ending (facts, words,
  concepts, exceptions) in a domain (`pawn/domain.cjs`); one course's plan, stages and texts in its own
  `tools/<course>/`. A rule for one course never goes into the toolkit.
- **Cheap first**: the analysis is the expensive step; run it on the lines that survive the filters and
  the selection, never on every candidate. Measure the generator before and after.
- `npm run teach:report` shows what the layer finds in the built-in courses (read only); `npm run kit:test`
  includes its tests.
- **A course's words**: pass the course's `vocabulary` to `createExplainer` so explanations name only what
  the course (and the ones before it) has taught; a move whose only reason is outside it gets no note.

## Curricula: designing a series of courses (`tools/course-kit/curricula/`)

For a series (the Opposition curriculum: `curricula/opposition/README.md`), design before generating:
the courses and what each excludes; then, per course, a blueprint as data (phases, slots with task,
objective, misconception, help level, target band, prerequisites, solver-checkable constraints), a task
classifier built on the solver and the board, real prototypes run through the whole pipeline with every
claim checked against the oracle, and a feasibility check that counts candidates per task and band and
proves every slot can get its own position (`npm run curriculum:opposition`). Promise only bands and tasks
the solver offers (the Direct Opposition lines are Intermediate to Around 1800; none Foundational, none
Difficult). The blueprint is the lesson list the owner approves; the generator reads it.

## Steps

1. Read `tools/course-kit/README.md` and the example generator. Run `npm ci` in `apps/endgame-classroom`.
2. Check feasibility with the solver (how many positions have a unique fastest move with the lesson's
   idea, line lengths, published longest mates) and propose the lesson list. **Wait for the OK.**
3. Write `tools/<course>/`:
   - `search.cjs`: lesson groups, each with filters (`pre` on the position, `first` on the unique
     fastest first move, `post` on the whole line), a count, and ranking (share of unique learner moves,
     then natural-looking starts, then a stable key). Play lines with `course-kit/line.cjs` (or a faster
     course-specific player built on `table(...).options()`), with tie-breaks that pick the move that
     fits the method; the others become `[%also]`.
   - `build.cjs`: FEN/SAN with chess.js, `verifyLine` on every line, report the statistics.
   - `pgnout.cjs`: texts, notes from the geometry, marks; `writePgn`, then `checkCourse` (count, learner
     White, marks syntax, no marks in the exam, closing note on the last move, every line re-verified).
   - `run.cjs`, `verify-opts.cjs` (`{ goal: 'mate' | 'promotion', probe }`), `README.md`, `.gitignore`
     with `.out/`, and the npm script.
4. Read the whole generated course as a learner would (texts, notes, marks) and fix what reads badly.
5. Register the course in `src/lib/builtinCourses.ts` (`category: "endgame"`, `playAs: "white"`,
   `signature` = the first LineName, a description with the number of positions and lessons) and add it
   to the app README's "Built-in courses". Copies already on a device refresh themselves when the PGN
   changes (`builtinHash`); a new course is added on the next start.
6. Check: add the course to `tools/course-kit/regress.cjs`; `npm run kit:regress -- --twice` (every course
   byte for byte, twice), `npm run build`, `npm run lint`, `npm run course:e2e -- <builtin id> --all`.
   If the solver or the toolkit was changed: `npm run kit:selftest` and `npm run kit:test` (and for the egtb
   engine `npm run kit:test5` and `npm run kit:selftest5`). Wait for the browser test to finish before
   committing.
7. Commit, push, report: lessons, line counts, unique share, `[%also]` counts, what was verified, and
   any judgement calls the owner should know about.

## Lessons learned

- **Fastest is not always the textbook method** (e.g. in K+R vs K the fastest mate often lets the box
  grow). Filter for positions where they coincide (the box never grows), choose method moves among
  equal ones (smallest box, the rook's waiting move), and say so in the report.
- **Some ideas are rarely the only fastest move** (the rook's waiting move has several equal squares).
  Allow `[%also]` for that move but keep the line's first move unique.
- **Variety**: lines converge on the same final positions. Compare long lines by full positions (no
  repeated stretches), short ones by where the kings stand (the same pattern with the piece elsewhere is
  the same lesson); lessons of mating patterns and stalemate traps may end in the same pictures; let
  scarce groups pick first.
- **Marks**: the full box is noisy while the king is not yet boxed in; for mate-in-1 patterns and
  stalemate traps show only the squares the king can step to.
- **Exclude positions of other built-in courses** (read their FENs) so courses don't repeat each other.
- **Solver pitfalls already fixed** (the self-test guards them): a pawn's double step can block a check
  when the single step cannot; JavaScript integer overflow in a random generator (use `Math.imul`); an LCG's
  low bits repeat with a short period (`seed % n` correlated the random positions of a test until none of
  the wanted kind came up: take the high bits, or mulberry32); en passant can be illegal because both pawns
  leave the rank (a pinned pawn); chess.js writes a FEN's en passant square only when the capture is legal,
  and `probe()` uses it.
- **An independent checker that passes every position is a proof**: by induction on the distance to mate, a
  table whose every value follows from its moves is exact. The egtb checker (`egtb/check.cjs`) found a wrong
  symmetry assumption of its own (two pawns placed symmetrically: the slice is stored in full) and nothing
  in the engine; a mutation test shows it finds a corrupted value. Run it on a new kind of table.
- **Pawn endings are measured to the promotion** (solver goal `'promotion'`, `probePromotion`; pass it to
  verify as `promotionProbe`): a promotion counts only when it makes a queen or a rook that cannot be taken
  at once, without stalemate, and the position stays won. Lines end in a queen (a rook when the queen would
  stalemate). Details: the pawn-endgame-course skill.
- **Let the solver say what is possible before promising a lesson.** Two connected pawns never promote
  on their own against a king standing in front of them: lessons that "run alone" need the king beside them.
  Ask the solver with a quick experiment (a few filters on the candidate lines) before tuning a search.
- **Variety beyond positions**: lines can differ square by square and still teach the same picture. Also
  compare a pattern (the pieces seen from one of them, mirror images alike) and the files used, and cap
  each at about a third of a group.
- **Notes must be true in the position**: derive them from the board and the solver (who protects what,
  can the king catch the pawn, does taking a pawn save Black), and leave out what the line does not show.
  Read the course as a learner: misplaced "Opposition!" or "attacks the pawn" cues are the usual noise.
- Slow tables (pawns, several promotions): set `KIT_CACHE=1` while iterating (identity-checked, see
  `tools/course-kit/cache.cjs`); run the final generator once without it.
- **Check a solver against a second, independent implementation** where you can (`kpk.cjs`,
  `pawn/oracle.cjs`): the pawn oracle found a wrong goal definition in 3,816 positions that every other
  check had passed.
- **A fact can be true and still not be the reason.** The opposition flips with every move, so a pawn
  push in a pure race "took the opposition"; it now counts only while the black king is in front of the
  pawn and inside its square. Check every reason against the moves that fail (contrast), and test the
  claims on thousands of positions against the independent oracle (`teach/test.cjs`).
- **Prototypes find what a design misses.** Running a dozen real positions through the pipeline before
  generating showed a course naming ideas it had not taught, defending positions with no facts, "reasons"
  where every move was equal, unknown difficulty read as easy, and a progression check that took items
  without a variety key as repeats. Fix the general mechanism (with a test), not the one position.
- **Some losing move almost always exists** in a pawn ending: "important" and difficulty count only the
  moves a learner is likely to consider (the domain's heuristic), and say "unknown" where there is none.
- The browser test needs Playwright and a Chromium (`CHROMIUM_PATH`; in the cloud container it is
  `/opt/pw-browsers/chromium` with Playwright installed globally).
