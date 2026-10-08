# Pawn toolkit

Reusable code for courses where White's pawns (one or two) play against the lone black king and every
line ends in a safe promotion. The first user is `tools/pawns-course/` (*Two Connected Pawns*). The
method behind it (what to choose and why) is in the skill `.claude/skills/pawn-endgame-course/`; this
folder holds the code.

```bash
npm run kit:test                                  # unit tests of this folder (under a minute)
npm run kit:check -- courses/connected-pawns-course.pgn --lines tools/pawns-course/.out/lines.json
npm run kit:selftest -- promotion                 # solver goal 'promotion' against the oracle, every position
npm run kit:regress                               # every built-in course regenerates byte for byte
KIT_CACHE=1 npm run course:pawns                  # keep solved tables on disk (see ../cache.cjs)
```

## Architecture

| Layer | Where | Responsibility |
|---|---|---|
| Method | `.claude/skills/pawn-endgame-course/` | Decision rules and lessons learned: how to define a lesson, which filters, which ranking, how much variety, what to verify. No code. |
| Exact values | `../solver.cjs` (goal `'promotion'`) | Plies to a safe promotion for every position; generation runs on it. |
| Pawn toolkit | this folder | Enumeration, line playing, promotion choice, structure keys, sampling, selection, teaching facts, the independent check. |
| Course | `tools/<course>/` | Its lesson groups (filters on positions and lines), its texts and marks. |
| Shared | `../verify.cjs`, `../pgn.cjs`, `../cache.cjs`, `../regress.cjs`, `../e2e.cjs` | Second check of every line, PGN in and out, the table cache, regression, the browser test. |

| Module | Interface |
|---|---|
| `geometry.cjs` | Square lists `[wk, bk, p1, p2]` (-1 = taken): `pawns`, `front`, `queenSq`, `hangs`, `kingToPawns`, `connected`, `sideBySide`, `blocks` (black king in front), `kingNear`, `kingAway` (white king off the pawns' way), `catches` (rule of the square), `mirror`. |
| `structure.cjs` | Variety keys, all mirror- and pawn-order-invariant: `posKey`, `setupKey` (white king + pawns), `pawnSetKey`, `kingsKey`, `pathKey` (a walk of the black king), `wingKey` (pair of files), `shapeKey` (the coarse pattern), `describe` (the pattern in words). |
| `player.cjs` | `createPlayer({ verify, whiteOrder?, blackOrder? })` → `{ whiteMoves, playLine, stalemates, tab, view, fenOf }`. White: the quickest safe promotion; Black: the longest defence; after a capture the line goes on with one pawn. |
| `promotion.cjs` | `bestFinishes` (among moves that reach the goal now, the fastest mate afterwards, as `verify.cjs` ranks them), `safeByRule` (queen or rook, not stalemate, not takeable: no solver needed), `failedQueens` (the other pawn's queen: stalemate or taken). |
| `enumerate.cjs` | `enumerate(player, material, { maxV, accept })` → every White-to-move win once (canonical index), with a single fastest first move; `firstMove(player, c)` decides the one-move finishes lazily. |
| `select.cjs` | `pickLines(groups, cands, { lineOf, firstMove, sample, sampler, share, overlap, short })` → the chosen lines; `sampleEvenly`, `sampleStratified`, `alternateMirror`, `evaluate`. |
| `realize.cjs` | `realize(picked, verify)` → real lines (FEN, SAN, `[%also]`), each checked by `verify.cjs`. |
| `teach.cjs` | Facts for notes and marks from a FEN: `pos`, `protectedBy`, `catches`, `kingSquares`, `stalemateMoves`, `failedQueenNotes`, `oneColourPerSquare`, `withoutHiddenArrows`, `orList`, `sq`. |
| `oracle.cjs` | An independent solver for the same measure (1 or 2 pawns): `value(sqs, stm)`, `probe(fen)`, `safePromotion`. Shares no code with `../solver.cjs`. |
| `checker.cjs` | `checkPgn(text, { lines })` / CLI: the independent check of a written course (see below). |
| `test.cjs` | Unit tests, including broken lines the checker must catch. |

## Generator workflow

1. **Lesson concept** → a group: `{ id, lesson, v: [lo, hi] plies, count, scarce, minScore, pre, post }`.
2. **Structural constraints**: `pre(c)` on the start (`geometry.cjs`: who stands where), `post(line)` on the
   whole line (no capture, the white king never moves, a queen at the end...).
3. **Enumerate**: `enumerate(player, 'KPPK', { accept })`: each position once, mirror images and pawn order
   merged, only those with a single fastest first move.
4. **Sample**: per group, the candidates that pass `pre` are sampled evenly (`sample`, default 3000; per
   group `g.sample`) before the expensive part. `sampleStratified` spreads the sample over strata (for
   example `shapeKey`) when one pattern would crowd out the rest.
5. **Solve**: `player.playLine` for each sampled candidate (cached per candidate).
6. **Rank and select**: unique-move share, then longer lines, then the table index; then the variety rules
   (`select.cjs` header). Scarce groups pick first.
7. **Realize** with chess.js (mirror every second line), **verify** with `verify.cjs`, write the PGN.
8. **Check independently** with `checker.cjs`, **regress** with `npm run kit:regress`, **browser** test.

## Cache workflow (`../cache.cjs`)

Off by default. `KIT_CACHE=1` (or a directory) stores every solved table (solver and oracle) with a header:
format, producer, an identity checksum of the producer's source files, key and size. A file is only used
when all of these match the running code, so any change to `solver.cjs`, `board.cjs` or `oracle.cjs`
(even a comment) invalidates its tables. `npm run kit:cache` lists them (current / stale), `-- prune`
removes stale ones, `-- clear` all. Times for *Two Connected Pawns*: about 4.5 minutes from scratch,
about 1 minute with the cache.

## Verification workflow

| Check | Path | What |
|---|---|---|
| `verify.cjs` (in `realize` and `pgn.checkCourse`) | toolkit solver + chess.js | every move, twice (generated lines, PGN read back) |
| `checker.cjs` | oracle + chess.js, no toolkit solver | every move again, the ending, stalemates, marks the app would hide, duplicates (mirror-aware), the variety per group |
| `selftest.cjs promotion` | oracle vs solver | the whole K+P and K+P+P tables, position by position |
| `regress.cjs` | the generators | every built-in PGN byte for byte (`--twice`: deterministic) |
| `e2e.cjs` | the app in Chromium | the lines play, marks show, no console errors |

The checker trusts one thing: among several moves that promote safely at once, which mates fastest
afterwards (that needs the mate tables).

## The next pawn course

1. Ask the solver first (a scratch script on `enumerate` + `playLine`): how many positions per lesson idea,
   unique-move share, line lengths. Propose the lessons; wait for the owner's OK.
2. Copy `tools/pawns-course/` to `tools/<name>-course/`. Change `search.cjs` (material, `accept`, groups),
   `pgnout.cjs` (texts, notes, marks), `check.cjs`/`run.cjs` paths, `verify-opts.cjs` stays.
3. `KIT_CACHE=1 npm run course:<name>` while iterating; read the course as a learner; fix what reads badly.
4. Register it (`src/lib/builtinCourses.ts`, README), add it to `../regress.cjs`, then: `kit:test`,
   `kit:regress -- --twice`, build, lint, `course:e2e -- <id> --all`. Wait for the browser test before
   committing.
