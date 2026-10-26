# What is known about each ending

Measured in October 2026 on the 4-core, 16 GB cloud machine (all threads, nothing cached unless said).
"Checked" means the independent checker accepted every stored position; "built" means the table exists and
its published maximum or theory positions agree, without a full check. Re-measure before quoting times as
current.

## Contents

1. Rook and pawn against rook
2. Pawnless five-piece endings
3. Two knights against a pawn
4. Pawn endings and en passant
5. Four-piece tables
6. Not built, and why (six-piece families included)
7. Six-piece tables built here
8. Verified positions

## 1. Rook and pawn against rook (K+R+P vs K+R; defending: K+R vs K+R+P)

- **Tables**: K+R+P vs K+R, 483,352,468 positions in 710 M slots (24 pawn slices), 677 MB on disk. Its family:
  21 tables, 5 of them five-piece (K+Q+R, K+R+R, K+R+B, K+R+N vs K+R and K+R+P vs K+R), 1.61 G slots in all.
- **Cost**: the family in 334 s (K+R+P vs K+R itself 130 s; K+Q+R vs K+R 69 s, K+R+R 33 s, K+R+B 38 s,
  K+R+N 38 s), peak 3.2 GB. The conversion table of K+R+P vs K+R is built the same way (the survey and the
  prototypes use it).
- **Checked**: the mate table on every position (0 wrong, 0 index errors; 790-1116 s on four threads). The
  conversion table: built, not fully checked.
- **Longest win**: mate in 74 moves.
- **Survey, White to move wins, measured to the conversion** (0.2% seeded sample): about 159 M positions; a
  single fastest move in 70-81% of every depth band (1-5 plies 70%, 21-40 plies 77%, more than 40: 81%). That
  move is a capture 52%, a pawn move 19%, a king move 11%, a check 9%, a quiet rook move 8%, a promotion 1%,
  an underpromotion in about 9,000 positions (a8=R where a8=Q stalemates or loses the queen). Half of them also
  have a tempting check, capture or promotion that does not win: traps worth a lesson.
- **Survey, White to move holds (K+R vs K+R+P)**: about 133 M drawn positions; exactly one move holds in 19%
  (about 25 M defensive resources): a capture 55%, a quiet rook move 18%, a king move 17%, a check 11%; a
  tempting move that loses sits next to it in 71%.
- **Prototypes** (`tools/course-kit/curricula/rook-endings/`): 10 lines (4 Lucena, 3 skewer, 3 Philidor), all
  verified on the generated lines and on the PGN read back; 33 of 59 learner moves unique (56%), 26 with
  `[%also]`; 71 s with the tables cached. The search criteria that worked:
  - Lucena: the pawn on the 7th (files b-g), the king in front of it, the white rook between the black king and
    the pawn (king cut off), 9-31 plies to the conversion, sample 0.02.
  - Skewer: the rook in front of its a-pawn on a7, the black rook behind the pawn on the a-file, the black king
    on f7-h7, 3-31 plies.
  - Philidor (K+R vs K+R+P, mate table, draws): the black pawn on the 4th rank (files c-f) with its king beside
    it, White's king on the pawn's file on the 1st or 2nd rank, White's rook on the 3rd rank three files or more
    from the black king, the black rook on Black's half; sample 0.05.
- **Teaching notes**: the skewer is found and proven (if the rook takes the pawn, a check along the 7th wins the
  rook). The Philidor defence holds to its end (after ...c3 the rook goes behind with checks); holding moves
  have many equals. In Lucena positions the fastest conversion is often winning Black's rook rather than
  building the bridge: a bridge lesson needs a filter or a promotion-only goal (not built).

## 2. Pawnless five-piece endings

| Ending | Positions | Build | Checked | Longest win |
|---|---|---|---|---|
| K+Q+Q vs K+R | 62,698,841 | 42 s on 4 threads (998 MB), 102 s on one (624 MB) | yes (151-232 s) | mate in 35 |
| K+B+B vs K+N | 85,412,684 | conversion goal with K+R+B vs K+R: 68-76 s, 1.7 GB | yes, mate table (153 s) | 66 moves to the conversion (= Thompson) |
| K+R+B vs K+R | 152,620,510 | (with the above) | yes, mate table (283-359 s) | 59 moves to the conversion (= Thompson); mate in 65 |
| K+N+N+N vs K | 30,261,917 | about 15 s on 4 threads | yes (47-66 s) | mate in 21 |

In K+B+B vs K+N and K+R+B vs K+R the conversion goal measures exactly Thompson's distance to conversion, and
both published maxima come out exactly. A pawnless five-piece table is one domain of 119-242 M slots (114-231
MB on disk).

## 3. Two knights against a pawn (K+N+N vs K+P)

- 279 M positions in 349.5 M slots (24 slices); family 17 tables, 5 of them five-piece (with the four
  promotion tables K+N+N vs K+Q, K+R, K+B, K+N), 0.85 G slots.
- Family in 131 s (K+N+N vs K+P itself 51 s), peak 2.2 GB.
- Longest mate 115 moves (229 plies), the figure cited for the Troitzky ending and the deepest five-piece mate:
  it fits the one-byte values (254 plies at most). Built, not fully checked.

## 4. Pawn endings and en passant

- **K+P vs K+P** (four pieces, pawns on both sides, so egtb): 7,436,088 positions, checked with the mate and the
  conversion goal. En passant counts: `8/8/8/8/Pp6/8/8/K3k3 b - a3 0 1` is a draw with bxa3 e.p. and lost in 30
  plies without it; a pinned pawn may not take en passant (a unit test in `egtb/test.cjs`).
- **K+P+P+P vs K, promotion goal**: 54,450,420 positions, checked; built in seconds (the promotion goal needs no
  mate tables). K+P+P vs K with the promotion goal: 1-3 s in egtb, 135-160 s in the classic engine.
- Conversion tables checked on every position: K+Q vs K+R, K+R vs K+P, K+P vs K+P. In K+R vs K+P
  (`8/8/8/8/8/2k5/3p4/K4R2 w - - 0 1`) the conversion line ends with the rook taking the pawn; Black's capture
  would not end it.

## 5. Four-piece tables

Every three- and four-piece material (62 tables, two of them with the promotion goal; 247,440,201 positions)
has the same value in egtb as in the classic engine, which shares no code with it. Longest mates (classic self-test, egtb
equal): K+Q vs K+R 35, K+R vs K+N 40, K+R vs K+B 29, K+R vs K+R 19. The classic engine still builds these for
the built-in courses (their bytes and order must not change); egtb builds its own copies for its exits.

## 6. Not built, and why

| Ending | Needs | Status |
|---|---|---|
| K+R vs K+P+P | 15 five-piece tables, 5 G slots | not built (fits, but hours of building and checking) |
| K+P+P+P vs K, mate goal | 35 five-piece tables, 9.3 G | not built (the promotion goal covers the lessons) |
| Pawns against a pawn (K+P+P vs K+P, K+P vs K+P+P) | 75 five-piece tables (every promotion leads to a queen ending), 28 G | not built: does not fit this machine; index and move generation tested |
| K+R+P vs K+R+P (also K+B+P vs K+N+P, K+Q+P vs K+Q+P) | 120 tables, 25 of them six-piece, 559 G slots: 1.1 TB at two bytes per six-piece slot; its pawnless six-piece tables (K+Q+R vs K+Q+R, 15.5 G slots) are solved in memory at 5 bytes per slot, 78 GB | the engine supports it; needs about 128 GB of memory and over a terabyte of disk |
| K+R+P+P vs K+R, K+R vs K+B+P+P | 71 tables (15 six-piece), 280 G slots, 0.55 TB; 78 GB for the biggest solve | as above |
| K+N+N+N vs K+P | 23 tables (5 six-piece), 18 G slots, 35 GB; its own table 7.2 G slots, solved from disk; K+N+N+N vs K+Q needs 12 GB in memory | by its sizes a 32 GB machine with 50 GB of free disk; not this one |
| K+R+R vs K+N+N, K+Q+Q vs K+R+R, K+B+B vs K+N+N | 3.76 G slots (8 GB), solved in memory: 19 GB | a 32 GB machine |
| K+P+P vs K+P+P | 440 tables, 225 of them six-piece, 4.8 T slots, 9.6 TB | out of reach |

These sizes come from `exact-solver-engineering/scripts/egtb-family.cjs` (exact counts of the engine's own
tables; the times are not measured: by the five-piece rates, 0.7-1.4 microseconds per slot and core, the
K+R+P vs K+R+P family is 110-220 core-hours to build, and checking takes five to nine times as long).

A closed part of K+R+P vs K+R+P would fit here (both pawns on one file, White's below Black's: no promotion and
no en passant without a capture first, every capture leads to a five-piece table): about 1.8 G slots plus 9-19
G of five-piece exits, by two independent planning estimates. It is an idea, not built (the engine has no way
to build part of a table).

## 7. Six-piece tables built here

@@SIX-ENDINGS

## 8. Verified positions

Each value below came out of a run in this work (the solver's header examples, the self-tests, the
prototypes). Use them as known-good examples and test fixtures.

| FEN | Material | Value |
|---|---|---|
| `8/8/8/8/8/2k5/8/K2R1R2 w - - 0 1` | K+R+R vs K | win, mate in 7 plies |
| `8/8/8/8/1k6/8/1KRP4/7r w - - 0 1` | K+R+P vs K+R | draw |
| `8/8/8/4k3/8/8/3PP3/4K3 w - - 0 1` | K+P+P vs K | promotion goal: safe promotion in 27 plies |
| `1K1k4/1P6/8/8/8/8/r7/5R2 w - - 0 1` | K+R+P vs K+R | conversion in 15 plies |
| `1K6/1P1k4/8/8/8/8/r7/2R5 w - - 0 1` | Lucena | win, mate in 41 plies; the conversion line is 15 plies |
| `3k4/7R/r7/3PK3/8/8/8/8 b - - 0 1` | Philidor, Black to move | draw |
| `5r2/8/8/8/1kp5/6R1/2K5/8 w - - 0 1` | K+R vs K+R+P, White holds | draw; the holding line is 19 plies |
| `R7/P4k2/8/8/8/r7/8/K7 w - - 0 1` | skewer | win: 1.Kb2 Ra6 2.Rh8! Rb6+ 3.Ka3 Ra6+ 4.Kb4 Rxa7 5.Rh7+ Ke6 6.Rxa7 |
| `1K6/1P1k4/8/2R5/5r2/8/8/8 w - - 0 1` | K+R+P vs K+R | win; fastest conversion wins the rook: 1.Ra5 Rf8+ 2.Ka7 Kc7 3.Ra1 Rb8 4.Rb1 Kc6 5.Kxb8 |
| `8/8/5k2/8/8/8/1K6/QQ5r b - - 0 1` | K+Q+Q vs K+R, Black to move | loss, mated in 18 plies |
| `8/8/8/8/3k4/8/1K6/QQ5r w - - 0 1` | K+Q+Q vs K+R | win; the mating line is 7 plies |
| `8/8/8/3k4/8/8/2NNN3/4K3 w - - 0 1` | K+N+N+N vs K | win; the mating line is 31 plies |
| `8/8/8/8/Pp6/8/8/K3k3 b - a3 0 1` | K+P vs K+P | draw with bxa3 e.p.; lost in 30 plies without it |
| `8/8/8/8/8/2k5/3p4/K4R2 w - - 0 1` | K+R vs K+P | conversion line ends with the rook taking the pawn |

A hand-written FEN is checked before use: two written from memory in this work were wrong (one illegal, the
rook already giving check; one an unverified "draw").
