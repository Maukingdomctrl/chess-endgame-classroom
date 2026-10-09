# Teaching and difficulty layer

Generic code for explaining moves, introducing ideas, measuring how hard a line is, and ordering lines
for learning. It works on the same exact solver as the generators (through the course's `verify-opts`),
so every explanation rests on what the board shows and what the solver proves. It never changes which
moves a line accepts: `[%also]` stays exactly `verify.fastestMoves`.

Nothing in this folder knows about pawns, kings or the opposition. A **domain** brings that: facts read
from the board, the words for them, the concepts, the exceptions. The pawn endings' domain is
`../pawn/domain.cjs`.

```bash
npm run kit:test                         # pawn toolkit tests, then teach/test.cjs (about a minute)
npm run teach:report                     # difficulty and explanations of every built-in course (read only)
npm run teach:report -- kpk --lines      # one course, with the first explanation of every line
```

## Modules

| Module | What it does |
|---|---|
| `outcome.cjs` | Exact outcome of every move from the course's measure: `moveOutcomes` (best / slower by n plies / draws / loses / notGoal; a "hold" mode when the learner defends), `replyOutcomes` (the opponent's replies: stubborn, shorter, escapes), `resultFor` (win / draw / loss for the learner, either side to move), `zugzwang` (the side to move would rather pass: the solver compares both sides to move). |
| `explain.cjs` | `createExplainer({ verify, domain, vocabulary })` → `explainMove(fen, san)`, `explainPosition(fen)` (every move, and the learner's own zugzwang), `acceptedMoves(fen)`. Short text plus structured parts: why, what changes, the natural alternative and the opponent's answer to it, a cue, a takeaway, review flags. `readable()` checks the length rules. `vocabulary`: the facts a course may name. |
| `concepts.cjs` | `createConcepts([...])`: a concept is tied to one fact; its notes per stage, its cues (questions, progressively more specific) and its takeaway. A note is only returned where the fact is on the board. Bad texts and cues throw when the set is created. |
| `difficulty.cjs` | `analyzeLine(line, ex, { learner })` → visible signals, a composite score 0-100 (a range when a signal is unknown), a broad label (none when the range spans bands), the signals that weigh most, the signals that are unknown. |
| `progression.cjs` | `STAGES` (configurable), `purposeHints(analysis)` (which stages a position can serve), `createProgression().sequence(plan, pool)` (fill a plan, easiest first, no repeated variety) and `checkSequence(seq)` (the order rules). |
| `analyze.cjs` | The pipeline's analyze step for one line: correctness (`verify.cjs`), difficulty, purpose, teaching quality (grounded share, review flags, `[%also]` check), all kept apart. |
| `report.cjs` | `npm run teach:report`: the layer over the built-in courses; writes `.out/<course>.json`. Reads only. |
| `test.cjs` | Tests on real King & Pawn positions and on the real courses, every claim checked against the independent oracle. |

## How an explanation is grounded

- **A correct move.** The reason is a fact the learner has after the move (a domain fact, or the solver's
  zugzwang) that **no failing move leaves**. If a losing move gives the same fact, it cannot be why the
  move wins, so it is not used (contrast). Facts the move creates come before facts it keeps. With no
  failing move, the slower moves are the contrast.
- **A wrong move.** Either an event on the board (stalemate; the new queen can be taken), or what the
  move gives up itself (contrast with the fastest moves), or what the opponent's **refutation** gains.
  The refutation is a reply the solver proves escapes (or wins, when the learner is defending).
- **A slower win** gets only its delta ("Still wins, but 2 moves slower."). No cause is claimed.
- **Nothing to contrast with** (every move equally good): no fact is a reason ("Every move keeps the
  draw."); `explainPosition` says when the learner to move is in zugzwang ("If Black had to move, you
  would win."), apart from a zugzwang the learner's move puts the opponent in (a reason of that move).
- **A course's words:** `vocabulary(fact)` says what a course may name (course 1 of the Opposition
  curriculum: no key squares yet, no distant or diagonal opposition, no opposition won by a pawn move; a
  reason carries its move, `fact.move`). A reason outside it is not used; with none left the move is
  flagged `outside-vocabulary`.
- **No fact explains it:** the text says only what the solver proves ("The quickest way: it promotes in 9
  moves.", "Black answers Kc6 and holds the draw.") and the move is flagged `no-grounded-reason` for
  review. A wrong reason is worse than none.
- **Equal moves** are named ("Kd5 and Kf5 win just as fast.") and are exactly the accepted moves.
- **Marks:** `!` an important move (a move the learner is likely to consider lets the win go), `?` the
  win (or the draw) is gone, `??` only when it is gone at once (stalemate, the piece or pawn taken), `?!`
  still wins but slower. Not every mistake is a blunder.
- **Severity** (`e.severity`): turns the win into a draw / throws the win away at once / turns the win (or
  the draw) into a loss / still wins, but slower / misses the goal (a promotion the course does not count).

## Language

At most two sentences, at most 12 words each, at most 20 in all, not counting the move ("Kf4! — "): read
in 4-5 seconds. `readable()` checks it; explanations over the limit are flagged, concept texts over it
throw. Advice for the move played ("Take the opposition."), facts for what the opponent gets ("Black gets
the opposition."), the outcome in plain words ("Only a draw now.").

## Concepts and cues

A concept (`createConcepts`) names one fact id. Its notes exist per stage (`introduce`, `reinforce`,
`exception`, ...), its cues go from general to specific, and a cue must be a question that names no square
and no move, so it can be shown before the move without giving it away. A cue is only offered when the
concept explains the move (no generic "think carefully"). Help is removed step by step: the stage's
`hints` level (3 = note + cue + marks, 2 = cue + marks, 1 = cue, 0 = nothing).

**Adding a concept:** give the domain a fact for it first (read from the board, or proved by the solver);
then add `{ id, fact, name, notes, cues, remember }` to the domain's concept list; then a test on a real
position where the fact is present and one where it is absent. Never add a concept whose fact the code
cannot check.

## Difficulty

Signals, all from the solver ("likely" = the domain's plausible-move heuristic; without one those signals
are `null` and listed in `partial`, never guessed as 0):

| Signal | Meaning |
|---|---|
| `learnerMoves`, `uniqueShare` | moves to find; share with one accepted move |
| `failShare`, `rejectShare` | average share of legal moves that lose the result / that the app rejects |
| `critical`, `traps`, `trapsInLine`, `trapRate` | likely moves that lose the result: per position, first move, whole line, per move |
| `counterIntuitive`, `counterIntuitiveShare` | learner moves where no accepted move is a likely one |
| `zugzwangsSet`, `zugzwangsFaced` | positions where the opponent to move is in zugzwang (the learner's move made it; scored) / where the learner to move is (reported) |
| `concepts`, `firstConcept` | the concepts that explain the critical moves |

**Unknown is not easy.** A signal that cannot be known is `null`: `score` counts the known signals,
`scoreMax` adds the unknown ones at their cap, `label` is given only when both fall in one band (else
`labelRange`), and ordering (`sortScore`, used by `progression.sequence`) takes the top of the range, so a
line is never scheduled earlier than the evidence allows. Length alone gives at most 15 points.

The composite (`WEIGHTS`: trap rate 25, counter-intuitive share 25, zugzwangs set 15, length 15, narrowness 10,
unique share 10) is a sorting aid set by judgement on the built-in courses, **not** a calibration against
learners and **not** an Elo. Labels are broad bands: Foundational (<20), Intermediate (<40), Around 1500
(<60), Around 1800 (<80), Difficult (approaching 2000). Pass `weights` to change them per course; keep the
signals in any report so a label can be checked.

**Adding a signal:** compute it in `signals()` from the solver or the domain (never from the wording), give
it a `null` when it cannot be known, add it to `WEIGHTS` only if it should move the score, and add a test
that it is deterministic on a real line.

## Learning progression is not difficulty

Progression is the order of *learning*: introduce → reinforce → vary → apply alone → meet the tempting
mistake → calculate → the exception → mixed review, with less help each step. Difficulty is how hard a
single position is. They are separate on purpose: a misconception position may be easy, a review may be
easier than the last reinforcement. Within one run of a stage and a concept, positions go easiest first;
across stages, the plan decides. A course passes its own plan (and may pass its own stage table):

```js
const P = createProgression();
const seq = P.sequence([
  { stage: 'introduce', concept: 'opposition', count: 3 },
  { stage: 'reinforce', concept: 'opposition', count: 5, maxScore: 50 },
  { stage: 'misconception', concept: 'opposition', count: 2 },
  { stage: 'mixed_review', concepts: ['opposition', 'keySquare'], count: 4 },
], pool);                       // pool: analysed positions { id, concepts, purposes, difficulty, variety }
P.checkSequence(seq);           // [] or the broken rules; seq.short lists steps that could not be filled
```

Correctness (`verify.cjs`), difficulty, purpose, variety (the course's keys) and teaching quality stay
separate fields (`analyze.cjs`), so one never hides another.

## Where it fits in a generator

```
candidates (enumerate) -> solve (playLine) -> cheap filters (pre / post) -> sample -> select (pickLines)
  -> analyze (analyze.cjs: difficulty, purpose, explanations) -> balance (progression.sequence)
  -> notes from the explanations -> verify (PGN read back) -> checker -> regression -> browser
```

The analysis is the expensive part (every legal move of every learner position, plus the opponent's
replies to the failing ones). Run it only on what survives the cheap filters and the selection. The
existing generators do not call this layer: their output and speed are unchanged.

## Toolkit, skill, course spec

| Where | What |
|---|---|
| This folder | Generic mechanisms: outcomes, grounding rules, length rules, concepts, difficulty, progression. |
| A domain (`../pawn/domain.cjs`) | The facts of one kind of ending, their words, its concepts and exceptions. |
| The skills (`.claude/skills/`) | Judgement: which concepts, which stages, how much help, what went wrong before. |
| A course spec (`tools/<course>/`) | Its lessons, its plan (stages per concept), its weights if they differ, its texts. Rules for one course (for example how an Opposition course is staged) belong there, not here. |

## Limitations

- The pawn domain covers one side's pawns against the lone king, either side (Black's pawns are read on
  the board turned round). `line.cjs` and `verify.cjs` play and check winning lines only: holding lines
  (defending lessons) are analysed position by position, their difficulty is not measured yet.
- Mating material (K+Q, K+R, two rooks) has no domain yet: explanations are the solver's (mate in n,
  stalemate, the piece taken), the likely-move signals are unknown.
- The weights and the plausible-move heuristic are judgement, not data from learners.
- Phrases name the opponent "Black": the learner plays White in every course (the owner's rule).
