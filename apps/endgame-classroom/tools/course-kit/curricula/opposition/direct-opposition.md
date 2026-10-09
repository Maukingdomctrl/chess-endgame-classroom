# Direct Opposition — blueprint (course 1 of the Opposition curriculum)

The design of the course's 100 positions, before any of them is chosen. The data is
`direct-opposition.cjs` (the generator reads it); this page explains it and shows the slot table (made
from the data; `test.cjs` keeps the two the same). The curriculum it belongs to is in `README.md`.

## Teaching goal

The learner understands, in this order:

1. **The problem.** Two kings face each other with one square between; the side to move cannot go forward
   and has to step aside. Whoever has to move gives way.
2. **Why the side to move matters.** The same picture wins with Black to move and only draws with White
   to move (the solver's zugzwang; the intro of the first lines says it, and the claim is checked).
3. **How to obtain it.** One king move (straight, diagonal, sideways, even back) that leaves the kings
   facing each other with Black to move.
4. **How to keep it.** When Black steps aside, take it again; the king walks forward step by step.
5. **What it is for.** The king gets in front of its pawn and the pawn promotes; the defender uses the same
   idea to hold the draw against Black's pawn.
6. **When it is not the point.** The pawn hangs (protect it first) or the pawn simply runs (push it).

The first ten positions teach 1-5 with full help before the learner is asked anything alone. No
terminology before the picture it names; no quiz that assumes the idea.

## Words (vocabulary of course 1)

Explanations come from `teach/explain.cjs` with `VOCABULARY` (in `direct-opposition.cjs`): the direct
opposition taken by a king move ("Take the opposition."), the solver's zugzwang right after it ("Black
must give way."), the pawn protected, attacked or blocked, a pawn that runs, events on the board. Not in
this course: key squares (course 2), the distant and the diagonal opposition (4, 5), the opposition won by a
pawn move and the word "zugzwang" (6). A move whose only reason lies outside these words is said with the
solver's words and flagged `outside-vocabulary`; the generator gives it no note (see the rules below).

Examples the framework produces on real positions (all checked in `test.cjs`):

- `Ke4! — Take the opposition.` / `Ke4! — Take the opposition. Black must give way.`
- `Kf3? — Black gets the opposition. Only a draw now.` (it hands Black the opposition; a draw)
- `Kd4?! — Still wins, but 2 moves slower.` (not a loss, not a blunder)
- `Ke5! — Take the opposition. Kd5 and Kf5 win just as fast.` (equal moves are named)
- `Kc2! — Take the opposition. Black must give way.` (defending against Black's pawn)
- `Kc6! — Your king protects the d-pawn.` / `b6! — The b-pawn runs: the king cannot catch it.`

## Tasks

What the learner decides, decided by the solver and the board (`tasks.cjs`, `classify`):

| Task | The position | Slots |
|---|---|---|
| `take` | White to move: the only fastest move is a king move that takes the direct opposition (the explainer's reason), and a likely move draws | 59 |
| `retake` | Black to move: White has the direct opposition, the solver shows Black in zugzwang; after Black's most stubborn move, the learner takes it again (only fastest move) | 15 |
| `either` | Several moves win equally fast, one takes the direct opposition (the line plays that one; the others are its `[%also]`) | 5 |
| `defend` | Black has the pawn: the only move that holds takes the direct opposition, a likely move loses | 12 |
| `protect` | The only fastest move protects the pawn; a likely move that takes the opposition draws | 4 |
| `push` | The only fastest move pushes a pawn that runs; a likely move that takes the opposition draws or is slower | 5 |

## Phases

Learning progression, not difficulty: a later position may be easier when it teaches something new (the
first defending and the first sideways positions come with more help again).

| Phase | Slots | Taught | Practised | New difficulty | Help, and when it goes | Before moving on | Misconception |
|---|---|---|---|---|---|---|---|
| Introduction | 1-10 | The problem the opposition solves: two kings face each other with one square between, and the side to move has to step aside. With Black to move, Black must give way and your king gets forward; with White to move in the same picture it is only a draw (shown by the solver, said in the intro). | Taking the direct opposition with one king move (straight, then diagonal), keeping it after Black steps aside, and seeing the line through to the queen. | None: short lines first (pawn on the 4th-6th rank), the classic far-back pawn only at the end. | Full help (3) on every position: the idea named, a cue, marks. | Plays the first move of each line correctly with full help and can say who has to move after it. | Walking straight at the black king, or pushing the pawn first, is as good. |
| Guided acquisition | 11-25 | How to obtain the opposition from different starting steps: straight, diagonal, sideways. | The first move that takes the opposition, then keeping it; positions where Black moves first. | The square that takes the opposition is not always straight ahead; the pawn further back (longer lines). | Full help (3) for 11-15, then cue and marks (2) for 16-25: the idea is no longer named. | Finds the opposition square with only the cue and the marks, whatever the shape of the step. | Every good king move goes forward; close to the queening square anything wins. |
| Reinforcement | 26-40 | The same idea from new king placements (black king on or beside the pawn's file) and move orders, and that sometimes several moves win (one of them taking the opposition). | Taking and keeping the opposition on longer walks; accepting either of two equal moves. | The black king beside the pawn's file; equal moves; marks removed from 33 on. | Cue and marks (2) for 26-32, cue only (1) for 33-40. | Takes and keeps the opposition with the cue alone, from any king placement. | The opposition is always on the pawn's file; there is only one right move. |
| Practical application | 41-55 | The opposition as a tool on the way: taken several times on a long approach, getting the king in front of the pawn, and two cases where it is not the first concern (the pawn hangs; the pawn runs). | Long lines with more than one decisive moment; protecting the pawn first; pushing a pawn that runs. | Several decisions per line (the solver shows a zugzwang more than once); contrast positions. | Cue only (1); the two contrast ideas are met with cue and marks (2) the first time. | Wins long lines with the cue alone and does not take the opposition when the pawn hangs or runs. | The opposition is always the first thing to do. |
| Variation | 56-70 | The opposition along a rank (kings side by side), and the defender's use of it: against Black's pawn, taking the opposition in front of the pawn holds the draw. | Horizontal opposition; defending; far-advanced pawns; other files. | New geometry and a new role (defender), each introduced with more help, then less. | Horizontal: cue and marks (2), then cue (1). Defending: full help (3), then 2, then 1. | Takes the opposition along a rank and holds the draw as the defender with the cue alone. | The opposition is only on a file; only the attacker needs it. |
| Independent recognition | 71-82 | Nothing new: recognising which positions ask for the opposition and which do not. | All task types interleaved: take, keep, defend, protect first, push, equal moves. | No help before the move; the task is not announced. | None (0); the explanation after each move stays. | Mostly correct first moves without help across all task types. | Every pawn ending is an opposition problem. |
| Calculation challenges | 83-92 | Accuracy over many moves: the opposition has to be taken again and again, tempting alternatives at several moments. | The longest and most demanding lines the solver offers for this course. | Around 1800 by the framework: more traps, more zugzwangs per line. | None (0); the explanation after each move stays. | Completes long lines without help. | Once the opposition is taken, the rest plays itself. |
| Mixed assessment | 93-100 | Nothing new: one position of each task, not announced. | The whole course. | No feedback during the line: the closing note only (as the other courses' exams). | None (0), closing note only. | End of the course. | Recognising the pattern without knowing why it works. |

Help levels (before the learner's move): 3 = the idea named in the intro, a cue, board marks; 2 = a cue
and board marks; 1 = a cue only; 0 = nothing. The explanation after the move is always shown, except in
the assessment (closing note only). Cues come from the concept of the move's reason and never name a
square or a move ("Which king will have to give way?").

## Variety

Within each phase, positions differ in: the pawn's file (b-g; rook pawns excluded) and rank (2-6), which
side moves first, the shape of the first king move (straight, diagonal, sideways, back), where the
defending king stands (on the pawn's file, beside it, away), vertical or horizontal opposition, and the
line's length. The task varies across the course (gain, keep, defend, use another move). Mirror images are
one position; no start position of another built-in course is reused (`otherCourseStarts`), and the
generator's duplicate checks (`pawn/structure.cjs` keys) apply as in the other pawn courses.

## Difficulty

By `teach/difficulty.cjs` on the real lines (every line played to the promotion): course 1 spans
**Intermediate to Around 1500**, with Around 1800 lines for the calculation phase. No line is Foundational
(King & Pawn endings are full of tempting moves that draw, and each line goes to the queen), and none
reaches Difficult (approaching 2000): the blueprint does not promise bands the solver does not offer. The
bands are an ordering aid inside a phase, not a rating. Defending lines have no measured band yet
(holding lines are not played by `line.cjs` today; see the rules).

## Feasibility (measured)

`npm run curriculum:opposition` classifies every King & Pawn position with the pawn on the b-, c- or
d-file (mirror images alike), plays each candidate's line and analyses it, then checks that each of the
100 slots can get its own position:

(the measured counts and the fill check follow from the run in progress; `npm run curriculum:opposition` prints them)

## Prototypes

`prototypes.cjs`: twelve real positions run through the whole pipeline (classification, explanations,
equal moves, `[%also]`, a line that starts with Black's move through `verify.cjs`, difficulty, the
zugzwang both ways), each claim checked against the independent oracle. They found these gaps in the
teaching layer, now fixed and tested (`teach/test.cjs` section 12, `test.cjs` here):

| Found on | Gap | Fix |
|---|---|---|
| `take-classic` | "Your king reaches a key square" in a course that has not taught key squares | `vocabulary` option of `createExplainer`: reasons outside it are not used; flag `outside-vocabulary` |
| `defend-*` | "This holds the draw." only: the pawn facts covered White's pawns only | `pawn/domain.cjs` reads Black's pawns on the board turned round; phrases for the defender; likely moves for either side |
| `side-to-move` | every move of a position where all moves are equal got a fact as its "reason" | no reason without a move to contrast with ("Every move keeps the draw."); `explainPosition` tells the learner's own zugzwang ("If Black had to move, you would win.") |
| `long-approach` | "Black is in zugzwang: every move loses." uses a term of course 6 | the pawn domain says "Black must give way." when the solver's zugzwang follows the direct opposition |
| a retake line | a pawn move "takes the opposition" (a tempo move) | reasons carry their move; course 1's vocabulary leaves pawn moves out |
| `equal-moves` | the line played the unexplained equal move | `learnerOrder` plays the explained one first; the others stay `[%also]` |
| `retake` | `verify.cjs` took the side to move as the learner | `opts.learner` |
| defending lines | unknown difficulty signals counted as 0 (looked easy) | a score range, no label across bands, ordering by the top of the range; zugzwangs set by the learner kept apart from those faced |
| the progression check | items without a variety key were taken as repeats | fixed in `progression.sequence` |

`not-enough` stays a guard rail: the direct opposition draws there while Kc2 wins, and nothing in course
1's facts says why, so the explainer flags it instead of inventing a reason (course 7 needs a new fact).

## Rules for the generator (Prompt 3)

1. **Candidates and slots.** Enumerate with `feasibility.candidates()` (or the same `classify` on the same
   positions), keep those that `matches(slot, candidate)` for each slot, exclude `otherCourseStarts()`,
   one position per slot (mirror images count as one), scarce slots first. Rank within a slot by: every
   important learner move of the line explained within the vocabulary, then the slot's band (lower first in
   introduction and guided phases), then fewer learner moves in phases 1-2, then a fixed key.
2. **Lines.** White's lines with `line.cjs` and `learnerOrder(ex)`; `retake` lines start with Black's most
   stubborn move (the one `classify` used) and are verified with `verifyLine(line, { ...VERIFY, learner:
   'w' })`. `defend` lines need a holding mode first: in `line.cjs` (the learner keeps the draw, the
   attacker plays its most testing try, the line ends when the pawn is taken or stalemate) and in
   `verify.cjs` (every learner move holds; `[%also]` exactly the other holding moves). Add both, with tests,
   before generating; then measure their bands.
3. **Words.** Notes from `createCourseExplainer()`: a note on the first learner move always (the task's
   point), on later moves only when grounded within the vocabulary and important; a closing note on the
   last move; nothing flagged `outside-vocabulary` or `no-grounded-reason` is shown. Intro texts state only
   what is checked (for `retake`: "If it were your move, it would only be a draw", from `zugzwang`).
4. **Help.** As the slot says (3, 2, 1, 0); marks only in Learn mode and never on the squares of the move to
   play (the app hides them, `teach.withoutHiddenArrows`); cues from the concept of the first move's reason.
5. **Checks.** Everything the other pawn courses run: verify twice, the independent checker where it
   applies, `kit:regress -- --twice` (the other four courses unchanged), build, lint, `course:e2e --all`;
   and `checkSequence` on the generated course (built from the real lines' difficulty).
6. **Owner's rules.** Lesson list first (this blueprint) and wait for the OK; the learner plays White;
   `[%also]` exactly the equal moves; every line to its real end; deterministic.

## The 100 slots

Constraints are checked by `matches()`: orientation, shape of the first move, `givesWay` (the solver's
zugzwang right after: "Black must give way"), `defender` (where the defending king starts), `ranks` (the
pawn's rank from its own side), `files` (b = the b- or g-file), `moves` (learner moves in the line),
`minZugzwangs` (zugzwangs the learner sets), `trapGivesOpposition`, `trapIsPush`.

<!-- slots:start -->
| # | Phase / purpose | Task | Objective | Skill or misconception | Help | Band | Constraints | After slots |
|---|---|---|---|---|---|---|---|---|
| 1 | Introduction / introduce | retake | See the problem it solves: the kings face each other, Black has to move and must give way, so your king gets forward. | The side to move must give way (with White to move it would only be a draw). | 3 | Intermediate, Around 1500 | orientation vertical, moves 7-10 | - |
| 2 | Introduction / introduce | take | Obtain it: step straight forward so the kings face each other with Black to move. | Choose the square that leaves Black to move; misconception: any step towards the black king will do. | 3 | Intermediate | orientation vertical, shape straight, ranks 5-6, moves 1-6 | 1 |
| 3 | Introduction / introduce | take | Obtain it with a diagonal step. | The opposition square is not always straight ahead. | 3 | Intermediate, Around 1500 | orientation vertical, shape diagonal, ranks 4-6, moves 1-6 | 2 |
| 4 | Introduction / introduce | retake | Keep it: when Black steps aside, take the opposition again. | Follow the black king; one opposition is rarely enough. | 3 | Intermediate, Around 1500 | orientation vertical, moves 7-10 | 1, 2 |
| 5 | Introduction / introduce | take | Black must give way: after your move every Black move lets your king forward. | Look at the position after your move from Black's side. | 3 | Intermediate, Around 1500 | orientation vertical, givesWay true, ranks 4-6, moves 1-8 | 2 |
| 6 | Introduction / introduce | take | Compare the right step with the wrong one: the wrong one hands Black the opposition, and it is only a draw. | Misconception: close to the black king is good enough. | 3 | Intermediate, Around 1500 | orientation vertical, trapGivesOpposition true, ranks 3-5, moves 1-10 | 2, 5 |
| 7 | Introduction / introduce | take | King first: the opposition gets the king in front of the pawn; pushing the pawn now only draws. | Misconception: push the pawn as soon as possible. | 3 | Intermediate, Around 1500 | orientation vertical, trapIsPush true, ranks 3-5, moves 1-10 | 2 |
| 8 | Introduction / introduce | retake | Black has to move again and again: walk forward, keeping the opposition each time. | Take it, Black gives way, take it again. | 3 | Intermediate, Around 1500 | orientation vertical, moves 7-12 | 4 |
| 9 | Introduction / introduce | take | The classic start: the pawn far back, the kings in front of it; take the opposition at once. | Misconception: with the pawn far back there is time to wait. | 3 | Intermediate, Around 1500 | orientation vertical, ranks 2-3, moves 1-12 | 6 |
| 10 | Introduction / introduce | take | The whole picture: take the opposition, Black gives way, your king goes in front, the pawn queens. | Putting the steps together. | 3 | Intermediate, Around 1500 | orientation vertical, givesWay true, ranks 2-4, moves 1-12 | 1, 2, 3, 4, 5, 6, 7, 8, 9 |
| 11 | Guided acquisition / reinforce | take | Take it straight ahead with the pawn on its 2nd or 3rd rank. | Find the square in front of the black king with one square between. | 3 | Intermediate, Around 1500 | orientation vertical, shape straight, ranks 2-3, moves 1-10 | 2, 9 |
| 12 | Guided acquisition / reinforce | take | Take it with a diagonal step when the straight square is wrong. | Misconception: always step straight. | 3 | Intermediate, Around 1500 | orientation vertical, shape diagonal, ranks 2-3, moves 1-10 | 3 |
| 13 | Guided acquisition / reinforce | take | Take it with a sideways step: the right king move does not always go forward. | Misconception: every good king move goes forward. | 3 | Intermediate, Around 1500 | orientation vertical, shape sideways, ranks 3-4, moves 1-10 | 11 |
| 14 | Guided acquisition / reinforce | retake | Black gives way to one side: answer on the same side. | Mirror Black's step to keep the opposition. | 3 | Intermediate, Around 1500 | orientation vertical, moves 7-12 | 4 |
| 15 | Guided acquisition / reinforce | take | A diagonal step, and Black must give way. | The step and its consequence together. | 3 | Intermediate, Around 1500 | orientation vertical, shape diagonal, givesWay true, ranks 4-5, moves 1-8 | 12 |
| 16 | Guided acquisition / reinforce | take | Find the opposition square with the cue and the marks only. | The idea is no longer named. | 2 | Intermediate, Around 1500 | orientation vertical, shape straight, ranks 3-4, moves 1-8 | 11 |
| 17 | Guided acquisition / reinforce | take | A sideways step with the pawn far back. | Sideways is right when the black king is to the side. | 2 | Intermediate, Around 1500 | orientation vertical, shape sideways, ranks 2-3, moves 1-10 | 13 |
| 18 | Guided acquisition / reinforce | take | A diagonal step with the pawn far back. | Diagonal from further away. | 2 | Intermediate, Around 1500 | orientation vertical, shape diagonal, ranks 2-3, moves 1-10 | 12 |
| 19 | Guided acquisition / reinforce | retake | Black moves first: keep the opposition without the idea being named. | Keeping it is part of obtaining it. | 2 | Intermediate, Around 1500 | orientation vertical, moves 7-12 | 14 |
| 20 | Guided acquisition / reinforce | take | King before pawn again: the push draws. | Misconception: push the pawn first. | 2 | Intermediate, Around 1500 | orientation vertical, trapIsPush true, ranks 3-5, moves 1-10 | 7 |
| 21 | Guided acquisition / reinforce | take | A diagonal step that leaves Black to give way, pawn on the 3rd or 4th rank. | The consequence without being told. | 2 | Intermediate, Around 1500 | orientation vertical, shape diagonal, givesWay true, ranks 3-4, moves 1-10 | 15 |
| 22 | Guided acquisition / reinforce | take | Close to promotion the opposition still decides. | Misconception: near the queening square anything wins. | 2 | Intermediate, Around 1500 | orientation vertical, shape sideways, ranks 4-6, moves 1-6 | 13 |
| 23 | Guided acquisition / reinforce | take | Straight ahead, pawn far back, and Black must give way. | The classic picture without the idea named. | 2 | Intermediate, Around 1500 | orientation vertical, shape straight, givesWay true, ranks 2-3, moves 1-12 | 16 |
| 24 | Guided acquisition / reinforce | retake | Keep the opposition again after Black's step aside. | Repetition with a new placement. | 2 | Intermediate, Around 1500 | orientation vertical, moves 7-12 | 19 |
| 25 | Guided acquisition / reinforce | take | Consolidation: the wrong step hands Black the opposition; find the right one. | Misconception: close enough is good enough. | 2 | Intermediate, Around 1500 | orientation vertical, trapGivesOpposition true, ranks 2-5, moves 1-10 | 6 |
| 26 | Reinforcement / reinforce | take | The black king on the pawn's file: take the opposition in front of it. | Read where the black king stands. | 2 | Intermediate, Around 1500 | orientation vertical, defender onFile, ranks 2-4, moves 1-12 | 11 |
| 27 | Reinforcement / reinforce | take | The black king beside the pawn's file: the opposition square moves with it. | Misconception: the opposition is always on the pawn's file. | 2 | Intermediate, Around 1500 | orientation vertical, defender besideFile, ranks 2-4, moves 1-12 | 26 |
| 28 | Reinforcement / reinforce | retake | Black moves first from beside the pawn's file: keep the opposition. | Keeping it from a new placement. | 2 | Intermediate, Around 1500 | orientation vertical, moves 7-12 | 24 |
| 29 | Reinforcement / reinforce | take | A diagonal step with the pawn far advanced. | Short line, same idea. | 2 | Intermediate, Around 1500 | orientation vertical, shape diagonal, ranks 5-6, moves 1-6 | 21 |
| 30 | Reinforcement / reinforce | either | Two (or more) moves win equally fast; one takes the opposition. Either is right. | The opposition is one way among several here; [%also] lists the others. | 2 | Intermediate, Around 1500 | moves 1-12 | 10 |
| 31 | Reinforcement / reinforce | take | Straight ahead and Black must give way, pawn on the 3rd-5th rank. | Same idea, new placement. | 2 | Intermediate, Around 1500 | orientation vertical, shape straight, givesWay true, ranks 3-5, moves 1-12 | 23 |
| 32 | Reinforcement / reinforce | take | A sideways step, pawn on the 2nd-4th rank. | Sideways from a new placement. | 2 | Intermediate, Around 1500 | orientation vertical, shape sideways, ranks 2-4, moves 1-12 | 17 |
| 33 | Reinforcement / reinforce | take | The black king beside the pawn's file, with the cue only. | Marks are gone: see the squares yourself. | 1 | Intermediate, Around 1500 | orientation vertical, defender besideFile, ranks 3-5, moves 1-12 | 27 |
| 34 | Reinforcement / reinforce | retake | A long walk: keep the opposition all the way. | Patience: the same step many times. | 1 | Around 1500 | orientation vertical, moves 11-30 | 28 |
| 35 | Reinforcement / reinforce | take | A diagonal step with the pawn far back, cue only. | Diagonal without marks. | 1 | Intermediate, Around 1500 | orientation vertical, shape diagonal, ranks 2-3, moves 1-12 | 18 |
| 36 | Reinforcement / reinforce | take | Straight ahead with the pawn far advanced, cue only. | Short line without marks. | 1 | Intermediate, Around 1500 | orientation vertical, shape straight, ranks 4-6, moves 1-8 | 16 |
| 37 | Reinforcement / reinforce | either | Equal moves again, cue only: either is right. | Do not look for the one magic move when several win. | 1 | Intermediate, Around 1500 | moves 1-12 | 30 |
| 38 | Reinforcement / reinforce | take | Black must give way, pawn on the 2nd-4th rank, cue only. | The consequence without marks. | 1 | Intermediate, Around 1500 | orientation vertical, givesWay true, ranks 2-4, moves 1-12 | 31 |
| 39 | Reinforcement / reinforce | take | A sideways step, pawn on the 3rd-5th rank, cue only. | Sideways without marks. | 1 | Intermediate, Around 1500 | orientation vertical, shape sideways, ranks 3-5, moves 1-12 | 32 |
| 40 | Reinforcement / reinforce | retake | Black moves first, cue only: keep the opposition. | Keeping it without marks. | 1 | Intermediate, Around 1500 | orientation vertical, moves 7-14 | 34 |
| 41 | Practical application / reinforce | take | Use it on the way: the opposition is taken more than once before the pawn queens. | Retake it at every chance on a long approach. | 1 | Around 1500, Around 1800 | orientation vertical, ranks 2-3, moves 11-30, minZugzwangs 2 | 10 |
| 42 | Practical application / reinforce | take | Approach: take the opposition, then walk in front of the pawn. | The opposition opens the way for the king. | 1 | Intermediate, Around 1500 | orientation vertical, defender onFile, ranks 2-4, moves 9-30 | 26 |
| 43 | Practical application / reinforce | retake | A long walk with Black moving first. | Keep it over many moves. | 1 | Around 1500, Around 1800 | orientation vertical, moves 11-30 | 40 |
| 44 | Practical application / reinforce | take | Support the pawn: the king leads and the pawn follows; pushing early draws. | Misconception: the pawn should lead. | 1 | Intermediate, Around 1500 | orientation vertical, trapIsPush true, ranks 3-4, moves 9-30 | 20 |
| 45 | Practical application / misconception | protect | Not always first: the black king attacks the pawn; protect it, the opposition can wait. | Misconception: always take the opposition first. | 2 | Intermediate, Around 1500 | - | 10 |
| 46 | Practical application / reinforce | take | Black must give way, pawn on the 4th-5th rank, a longer line. | The idea inside a longer line. | 1 | Intermediate, Around 1500 | orientation vertical, givesWay true, ranks 4-5, moves 7-30 | 38 |
| 47 | Practical application / reinforce | take | A diagonal step on a long approach. | Diagonal as part of a walk. | 1 | Intermediate, Around 1500 | orientation vertical, shape diagonal, ranks 2-3, moves 9-30 | 35 |
| 48 | Practical application / misconception | push | Not needed: the pawn runs and the black king cannot catch it; push. | Misconception: every pawn ending needs the opposition. | 2 | Intermediate, Around 1500 | - | 10 |
| 49 | Practical application / reinforce | take | A sideways step on a long approach. | Sideways as part of a walk. | 1 | Intermediate, Around 1500 | orientation vertical, shape sideways, ranks 3-4, moves 9-30 | 39 |
| 50 | Practical application / reinforce | retake | Black moves first; keep the opposition to the end. | Keeping it as a routine. | 1 | Around 1500, Around 1800 | orientation vertical, moves 7-30 | 43 |
| 51 | Practical application / reinforce | take | The classic long win: pawn far back, Black must give way. | Endurance with the same idea. | 1 | Around 1500, Around 1800 | orientation vertical, givesWay true, ranks 2-3, moves 11-30 | 41 |
| 52 | Practical application / reinforce | protect | Protect first again, with the cue only. | Check whether the pawn hangs before anything else. | 1 | Intermediate, Around 1500 | - | 45 |
| 53 | Practical application / reinforce | take | The pawn far advanced: a short decisive opposition. | Short line, cue only. | 1 | Intermediate, Around 1500 | orientation vertical, ranks 4-6, moves 1-8 | 36 |
| 54 | Practical application / reinforce | take | Two zugzwangs on the way: take the opposition, then again. | More than one decisive moment. | 1 | Around 1500, Around 1800 | orientation vertical, ranks 2-4, moves 9-30, minZugzwangs 2 | 41 |
| 55 | Practical application / reinforce | push | Count before you walk: the pawn runs. | The race is checked before the kings. | 1 | Intermediate, Around 1500 | - | 48 |
| 56 | Variation / introduce | take | The opposition along a rank: the kings side by side with one square between. | Misconception: the opposition is only on a file. | 2 | Intermediate, Around 1500 | orientation horizontal, ranks 2-4, moves 1-12 | 10 |
| 57 | Variation / reinforce | take | Along a rank again, pawn on the 3rd-5th rank. | Recognise the sideways picture. | 1 | Intermediate, Around 1500 | orientation horizontal, ranks 3-5, moves 1-12 | 56 |
| 58 | Variation / variation | take | A pawn far advanced: the same fight in fewer moves. | The idea does not depend on the pawn's rank. | 1 | Intermediate, Around 1500 | orientation vertical, ranks 5-6, moves 1-6 | 53 |
| 59 | Variation / reinforce | take | Along a rank with the pawn far back. | Sideways opposition on a long walk. | 1 | Intermediate, Around 1500 | orientation horizontal, ranks 2-3, moves 1-14 | 57 |
| 60 | Variation / variation | take | The black king away from the pawn's file. | The opposition square from an unusual placement. | 1 | Intermediate, Around 1500 | orientation vertical, defender away, moves 1-12 | 33 |
| 61 | Variation / introduce | defend | Defending: Black has the pawn. Take the opposition in front of it and Black cannot get past. | Misconception: the defender just waits. | 3 | Intermediate, Around 1500 | orientation vertical | 10 |
| 62 | Variation / reinforce | defend | Defending again: the move that holds takes the opposition. | The same idea from the other side. | 2 | Intermediate, Around 1500 | orientation vertical | 61 |
| 63 | Variation / reinforce | defend | Defending: after your move Black must give way and cannot win. | The attacker also has to move. | 2 | Intermediate, Around 1500 | orientation vertical, givesWay true | 62 |
| 64 | Variation / reinforce | take | Along a rank: the wrong step hands Black the opposition. | Contrast inside the new geometry. | 1 | Intermediate, Around 1500 | orientation horizontal, trapGivesOpposition true, moves 1-12 | 59 |
| 65 | Variation / reinforce | defend | Defending along a rank. | The defender's sideways opposition. | 1 | Intermediate, Around 1500 | orientation horizontal | 63 |
| 66 | Variation / variation | take | A pawn on the b- or g-file. | The idea on another file. | 1 | Intermediate, Around 1500 | orientation vertical, files b, moves 1-12 | 58 |
| 67 | Variation / reinforce | defend | Defending with the cue only. | Holding without marks. | 1 | Intermediate, Around 1500 | orientation vertical | 65 |
| 68 | Variation / variation | either | Equal moves in a new placement. | Several right moves, none magic. | 1 | Intermediate, Around 1500 | moves 1-12 | 37 |
| 69 | Variation / reinforce | take | Along a rank with the pawn far advanced. | Short sideways decision. | 1 | Intermediate, Around 1500 | orientation horizontal, ranks 4-6, moves 1-8 | 64 |
| 70 | Variation / reinforce | defend | Defending: Black must give way, cue only. | The defender's zugzwang without marks. | 1 | Intermediate, Around 1500 | orientation vertical, givesWay true | 67 |
| 71 | Independent recognition / independent_application | take | Take the opposition without any help. | Recognise it unannounced. | 0 | Intermediate, Around 1500 | orientation vertical, moves 1-14 | 40 |
| 72 | Independent recognition / independent_application | push | Recognise that the pawn simply runs. | Not every position asks for the opposition. | 0 | Intermediate, Around 1500 | - | 55 |
| 73 | Independent recognition / independent_application | defend | Defend without help. | The defender's opposition unannounced. | 0 | Intermediate, Around 1500 | orientation vertical | 70 |
| 74 | Independent recognition / independent_application | retake | Black moves first: keep the opposition without help. | Keeping it unannounced. | 0 | Around 1500, Around 1800 | orientation vertical, moves 7-30 | 50 |
| 75 | Independent recognition / independent_application | protect | The pawn hangs: protect it without being told. | Priority check unannounced. | 0 | Intermediate, Around 1500 | - | 52 |
| 76 | Independent recognition / independent_application | take | Along a rank, without help. | Sideways opposition unannounced. | 0 | Intermediate, Around 1500 | orientation horizontal, moves 1-14 | 69 |
| 77 | Independent recognition / independent_application | either | Equal moves, without help. | Accept that several moves win. | 0 | Intermediate, Around 1500 | moves 1-14 | 68 |
| 78 | Independent recognition / independent_application | defend | Defend along a rank or a file, without help. | The defender in any geometry. | 0 | Intermediate, Around 1500 | - | 73 |
| 79 | Independent recognition / independent_application | take | A far-advanced pawn, without help. | Short decision unannounced. | 0 | Intermediate, Around 1500 | orientation vertical, ranks 5-6, moves 1-8 | 58 |
| 80 | Independent recognition / independent_application | push | The pawn runs, without help. | The race before the kings. | 0 | Intermediate, Around 1500 | - | 72 |
| 81 | Independent recognition / independent_application | take | Along a rank with the pawn far back, without help. | Sideways on a long walk. | 0 | Intermediate, Around 1500 | orientation horizontal, ranks 2-3, moves 1-16 | 76 |
| 82 | Independent recognition / independent_application | defend | Defending: Black must give way, without help. | The defender's zugzwang unannounced. | 0 | Intermediate, Around 1500 | givesWay true | 78 |
| 83 | Calculation challenges / calculation | take | A long line with tempting moves at several moments. | Accuracy over many moves. | 0 | Around 1800 | orientation vertical, moves 11-30 | 71 |
| 84 | Calculation challenges / calculation | retake | Black moves first; keep the opposition through a long line. | Keeping it under pressure. | 0 | Around 1800 | orientation vertical, moves 11-30 | 74 |
| 85 | Calculation challenges / calculation | take | Three or more zugzwangs on the way. | Every opposition counts. | 0 | Around 1800 | orientation vertical, moves 11-30, minZugzwangs 3 | 54 |
| 86 | Calculation challenges / calculation | take | Along a rank on a long line. | Sideways opposition under pressure. | 0 | Around 1500, Around 1800 | orientation horizontal, moves 9-30 | 81 |
| 87 | Calculation challenges / calculation | defend | A long defence. | Holding over many moves. | 0 | Around 1500, Around 1800 | orientation vertical | 82 |
| 88 | Calculation challenges / calculation | take | The wrong step hands Black the opposition, deep in a long line. | Spot the decisive moment. | 0 | Around 1800 | orientation vertical, trapGivesOpposition true, moves 11-30 | 83 |
| 89 | Calculation challenges / calculation | retake | Black moves first, the longest lines. | Endurance. | 0 | Around 1800 | orientation vertical, moves 11-30 | 84 |
| 90 | Calculation challenges / calculation | take | The pawn on its 2nd or 3rd rank, the longest walk. | From far back to the queen. | 0 | Around 1500, Around 1800 | orientation vertical, ranks 2-3, moves 13-30 | 85 |
| 91 | Calculation challenges / calculation | defend | Defending: Black must give way, the hardest cases. | The defender under pressure. | 0 | Around 1500, Around 1800 | givesWay true | 87 |
| 92 | Calculation challenges / calculation | take | The hardest direct-opposition line of the course. | Everything at once. | 0 | Around 1800 | orientation vertical, moves 11-30 | 90 |
| 93 | Mixed assessment / mixed_review | take | Assessment: take the opposition. | Unannounced, no feedback until the end. | 0 (closing note only) | Around 1500 | orientation vertical, moves 1-14 | 92 |
| 94 | Mixed assessment / mixed_review | defend | Assessment: hold the draw. | Unannounced. | 0 (closing note only) | Around 1500 | - | 91 |
| 95 | Mixed assessment / mixed_review | push | Assessment: the pawn runs. | Unannounced. | 0 (closing note only) | Around 1500 | - | 80 |
| 96 | Mixed assessment / mixed_review | retake | Assessment: Black moves first. | Unannounced. | 0 (closing note only) | Around 1500 | orientation vertical, moves 7-30 | 89 |
| 97 | Mixed assessment / mixed_review | protect | Assessment: the pawn hangs. | Unannounced. | 0 (closing note only) | Around 1500 | - | 75 |
| 98 | Mixed assessment / mixed_review | take | Assessment: along a rank. | Unannounced. | 0 (closing note only) | Around 1500 | orientation horizontal, moves 1-14 | 86 |
| 99 | Mixed assessment / mixed_review | either | Assessment: equal moves. | Unannounced. | 0 (closing note only) | Around 1500 | moves 1-14 | 77 |
| 100 | Mixed assessment / mixed_review | take | Assessment: a long line with the opposition at several moments. | Unannounced, the final position of the course. | 0 (closing note only) | Around 1800 | orientation vertical, moves 11-30 | 92 |
<!-- slots:end -->
