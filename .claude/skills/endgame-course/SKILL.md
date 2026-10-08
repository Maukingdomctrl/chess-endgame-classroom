---
name: endgame-course
description: Build, extend or regenerate a built-in endgame course for the Endgame Classroom app (apps/endgame-classroom) the provably-correct way - exact solver, search for teaching positions, independent verification, PGN with notes and board marks, registration, browser test. Use when asked for a new course (e.g. two-rook mate, rook vs pawn, bishop + knight), to add or change lessons in a generated course, or to check or regenerate one.
---

# Building an endgame course

Courses are generated, never written by hand: an exact solver decides every move, a search picks the
positions, an independent checker verifies every line, and the PGN is written by a script that
regenerates it byte for byte. Everything shared lives in `apps/endgame-classroom/tools/course-kit/`
(read its README); each course has its own generator in `tools/<course>/`. The working examples are
`tools/basics-course/` (mates with K+Q and K+R, K+P lines) and `tools/kpk-course/` (King & Pawn).

## Rules (the owner's, non-negotiable)

1. **Lesson list first.** Before writing any position, show the proposed lessons (title, number of
   lines, what the learner must find, the marks) and wait for the owner's OK. Suggest changes if
   something is missing or out of order, and check feasibility with the solver before proposing.
2. **No moves from memory.** Use the exact solver (`course-kit/solver.cjs`, any material up to 4
   pieces; `kpk-course/kpk.cjs` for K+P lines measured to the promotion).
3. **Best play.** Every learner move keeps the win and is a fastest one (lowest distance to mate, or
   quickest safe promotion in K+P lessons). The opponent always plays the most stubborn defence
   (longest DTM).
4. **Every line to its real end**: checkmate in mating lessons, the promotion in K+P lessons. Never stop
   halfway.
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
6. Check: `npm run course:<name>` twice (same checksum), `npm run build`, `npm run lint`,
   `npm run course:e2e -- <builtin id>` (add `--all` for every line). If the solver was changed:
   `npm run kit:selftest`, and `npm run course:basics` / `course:kpk` must still give identical files.
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
  when the single step cannot; JavaScript integer overflow in a random generator (use `Math.imul`).
- The browser test needs Playwright and a Chromium (`CHROMIUM_PATH`; in the cloud container it is
  `/opt/pw-browsers/chromium` with Playwright installed globally).
