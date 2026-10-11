# Independent verification of an exact solver

## Contents

1. The layers of evidence
2. Designing a checker that shares no code
3. Checking the index
4. Checking the checker: mutation tests
5. A second implementation on the overlap
6. External references
7. Equivalences: threads, cache, views, reruns
8. When the checker and the engine disagree
9. What each layer caught in the five-piece work
10. Wording the claims

## 1. The layers of evidence

From weakest to strongest; use all that are practical, because each is blind where another sees.

| Layer | Sees | Blind to |
|---|---|---|
| Famous positions (the Lucena wins, the Philidor draws) | gross errors, wrong rules for whole classes of positions | almost every local error |
| Published maxima (longest win of an ending) | rule errors that shift depths (promotion, en passant, a goal's definition) | errors that do not touch the longest line |
| Sampled consistency (moves vs chess.js, values vs moves on random positions) | move generation bugs that are common | rare cases: under-sampled squares, pins, en passant |
| A second implementation, every position of the overlap | any disagreement where both can compute | errors both make; tables only the new one builds |
| A checker that shares no code, every position | any stored value inconsistent with its moves, any index slot that cannot be found again | a rule the checker gets wrong in the same way (so validate the checker's rules: layers 3, 4, 5) |

The checker is the layer that turns "no difference found" into "exactly right": section 2 says why.

## 2. Designing a checker that shares no code

- **Share only the stored values.** Its own board representation (an 8x8 board, where the engine works on
  index digits and precomputed geometry), its own move generation, its own attack test (scanning outward
  from the king, where the engine uses attack tables), its own en passant rule, its own goal rules, its own
  bookkeeping of which table a capture or promotion leads to. It reads the table only through
  `value()`, `valueAt()`, `index()`, `decode()`.
- **Check the local equation at every stored position.** Generate the legal moves; read each child's value
  (in this table; in the table of the material left after a capture or promotion; for a double step that
  gives en passant rights, by a one-ply search because those positions are not stored); recompute the value
  (win in d = 1 + the fastest reply lost in d - 1; loss in d = 1 + the slowest reply that wins; otherwise a
  draw; no legal move: mate or stalemate) and compare with the stored one.
- **Why that proves the whole table** (put this argument in the checker's header): by induction on the
  depth. A stored win in d needs a reply stored as a loss in d - 1, which is true by induction, so the win is
  real and not shorter (no reply is a faster loss); a true win in d has a reply truly lost in d - 1, stored
  correctly by induction, so it cannot be stored as a draw or as a longer win. Draws follow because every
  true win and loss is accounted for. The same argument works for any metric defined by a local equation
  (distance to conversion, to promotion) once its terminal rule is written down.
- **Goal variants change only the terminal rule.** Promotion goal: a queen or rook promotion that cannot be
  taken at once, is not stalemate and stays won ends the count. Conversion goal: White's capture or promotion
  into a position still won by the mate table ends it, or mate; Black's captures and promotions continue in
  the conversion table of the material left; White is never lost there. Write the rule in both the engine
  and the checker, independently.
- **Make it fast enough to run on everything**, still without sharing code: in-place make/unmake, no
  allocation in the loop, index ranges on all cores, counts plus the first few examples returned. The first
  version cost 33-70 us per position (K+P vs K+P: 133 s); the rewrite took 9.9 s. Even so a check costs five
  to nine times the build.

## 3. Checking the index

- Every stored position must be found again from each of its symmetric images (8 board symmetries without
  pawns, the a-h mirror with pawns). This catches canonicalisation and decoding errors that the value check
  cannot see (a wrong slot holding a right-looking value).
- Placements that are their own mirror image are stored in full: both images are stored, possibly at
  different slots. The check accepts exactly "the index holds this exact image, with the same value", not
  any slot with any value.
- Round trip: `decode(index(p))` is `p` or an image of `p`, for random and for edge positions.

## 4. Checking the checker: mutation tests

Corrupt one stored value at a time and require the checker to flag it: a win made shorter and longer, a win
made a draw, a loss made a draw, a draw made a win, a mate made a non-mate, in different tables and goals. It
started as a scratch script on K+R vs K and K+P vs K (every corruption by +1, +2, -1 and to 0 found) and became
14 cases in `egtb/test.cjs`. Do the same for every verifier in the pipeline: `verify.cjs` must reject a line
stopped before its goal, a non-fastest move, a wrong `[%also]`. A checker that has never failed has not
shown that it can.

## 5. A second implementation on the overlap

When a new engine replaces or extends an old one, the tables both can build are a free, strong check: compare
every stored position, and also every image of a sample, so that both indexes are exercised on positions
they do not store themselves. Here the two engines differ in index, symmetry handling, move generation and
algorithm (re-checking every move vs counters), so agreement on 247 M positions in 62 tables (every three-
and four-piece material, both goals) is real evidence. Keep the comparison in the self-test (`kit:selftest5`
part 1, `--all` for every material).

## 6. External references

- **chess.js** for move generation: the engine's and the checker's move lists equal chess.js's on 600 random
  positions each of K+Q vs K+R, K+R+P vs K+R, K+P+P vs K+P, K+N+N vs K+P, K+P+P+P vs K and three en passant
  sets (including a pinned pawn that may not take en passant). Confirm first what the reference itself does:
  chess.js 1.4.0 writes a FEN's en passant square only when the capture is legal, which `probe()` relies on.
  Random positions come from a seeded mulberry32.
- **Hand-written expectations** (theory FENs, expected results) are claims, not references: check each FEN's
  legality with chess.js and each result against the solver and a second source. Two written from memory were
  wrong here (an illegal FEN: the rook already gave check; an unverified K+N+N vs K+P "draw") and were
  dropped.
- **Published maxima**: Thompson's distance-to-conversion maxima (K+B+B vs K+N 66 moves, K+R+B vs K+R 59)
  matched the conversion goal exactly; the longest mates K+Q vs K+R 35, K+R vs K+N 40, K+R vs K+B 29, K+R vs
  K+R 19, K+R+B vs K+R 65, K+N+N vs K+P 115. A maximum is a single number, but it moves when a rule is wrong.
- **Theory positions** with known results, written as FENs in the self-test.
- **Network sources**: only when the environment allows them. A 403 is the network policy, not a puzzle;
  build the evidence locally and say which reference was not available.

## 7. Equivalences: threads, cache, views, reruns

- Threads = serial, byte for byte, on a table of each parallel scheme (pawnless levels shared out with
  atomics; pawn slices in waves). Make sure the compared tables were really built both ways: the first version
  of this test took the threaded table from the registry, which reads the disk cache when it is on, and passed
  vacuously (its log said "(cache)"). The test now solves both from scratch, after resetting the workers.
- Loaded from the cache = built (the cache identity includes the producer code).
- A colour-swapped view answers as the direct table does: 2000-3000 random positions, values equal to the
  colour-turned FEN's probe, moves equal to chess.js's.
- Every generated course twice, byte for byte (`kit:regress -- --twice`).

## 8. When the checker and the engine disagree

1. Take the first example the checker reports; make it a single position (FEN, side to move).
2. Print both sides' legal moves, each child's value and the table each child was read from.
3. Decide from the rules of chess which one is wrong, never from which code is newer.
4. Fix that side, add the position to a unit test, rerun the full check of the table.
5. If the checker was wrong because a legitimate representation surprised it, make its acceptance exact
   (section 3) rather than wider.

## 9. What each layer caught in the five-piece work

| Error | Caught by |
|---|---|
| Nested searches sharing one scratch board | reading the code (self-review) |
| A depth of 256 plies would wrap to 0 (a draw) in a one-byte value | reading the whole engine before freezing it; now a throw |
| False alarm: 158,120 self-mirror pawn placements "not found" (K+P+P vs K, promotion goal) | the checker's index test; acceptance made exact |
| Random test positions correlated by an LCG's low bits: zero en passant cases generated | the move generation test failing for lack of cases; mulberry32 |
| The new engine borrowed the old engine's sub-tables (comparison partly circular) | profiling a slow build; the engine made self-contained |
| `scan()` assumed index parity = side to move, wrong for colour-swapped views | code review; parity read from `decode(0)` |
| The colour-swapped view exposed the inner table's layout | code review; removed |
| The thread test compared cached tables | its own log line; rerun uncached |
| Holding lines could not end in rook endings | building a real Philidor line through `line.cjs` and `verify.cjs` |
| An illegal FEN in a header example; wrong numbers in the README | running every example; checking every claim against the final runs |

What found no engine bug: the second implementation (never a difference), the checker (one false alarm), the
chess.js comparison (only the test's own random generator). That is the expected outcome when increments are
small and gated; it is the evidence, not wasted effort. Two real exactness bugs were found by reading.

## 10. Wording the claims

Each claim names the check, its scope and the result of the last run: "the checker, every position of
K+R+P vs K+R (483,352,468): 0 wrong, 0 index errors". Say "every position" only when it ran on every
position; otherwise give the sample rate or the tables. Do not let a layer's result stand for another's:
"matches the published maximum" is not "checked". List what was not verified (tables not built, references
not reachable) next to what was.
