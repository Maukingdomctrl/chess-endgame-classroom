// The Direct Opposition course (the first of the Opposition curriculum, see README.md), as data: its
// measure, the words it may use, and the blueprint of its 100 positions (stages and slots). The generator
// (Prompt 3) reads this file; direct-opposition.md explains it and shows the slot table (toMarkdown()).
const solver = require('../../solver.cjs');
const domain = require('../../pawn/domain.cjs');
const { createExplainer } = require('../../teach/explain.cjs');

/** The measure: plies to a safe promotion (one pawn: the King & Pawn solver, as the other King & Pawn lessons). */
const VERIFY = { goal: 'promotion', probe: solver.probe };

/**
 * What an explanation in this course may name: the direct opposition taken by a king move, the solver's
 * zugzwang (said as "Black must give way"), the pawn protected, attacked or blocked, a pawn that runs, and
 * events on the board. Not yet: key squares (course 2), the distant and the diagonal opposition (courses 4
 * and 5), the opposition won by a pawn move (a tempo move, course 6).
 */
const VOCABULARY = (f) => f.id !== 'keySquare' && !(f.id === 'opposition' && (f.kind !== 'direct' || f.move?.piece === 'p'));

const createCourseExplainer = () => createExplainer({ verify: VERIFY, domain, vocabulary: VOCABULARY });

/**
 * The order among equally fast learner moves when a line is played (../../line.cjs learnerOrder): first the
 * moves the course can explain (a reason within the vocabulary), then the usual fixed order. The others
 * become the move's [%also], exactly as verify.cjs requires.
 */
const learnerOrder = (ex) => (a, b, ctx) => (ex.explainMove(ctx.fen, a.san).facts.length ? 0 : 1) - (ex.explainMove(ctx.fen, b.san).facts.length ? 0 : 1);

/**
 * Help before the learner's move (what the app shows in Learn mode). Feedback after the move (the note
 * that explains it, from teach/explain.cjs) is always given, except in the assessment: closing note only.
 */
const HELP = {
  3: 'the idea named in the intro, a cue, board marks',
  2: 'a cue and board marks (the intro states only the goal)',
  1: 'a cue only',
  0: 'nothing before the move',
};

const I = 'Intermediate', M = 'Around 1500', H = 'Around 1800';

/** The eight phases (learning progression, not difficulty). */
const PHASES = [
  {
    id: 'introduction', from: 1, to: 10, name: 'Introduction',
    taught: 'The problem the opposition solves: two kings face each other with one square between, and the side to move has to step aside. With Black to move, Black must give way and your king gets forward; with White to move in the same picture it is only a draw (shown by the solver, said in the intro).',
    practised: 'Taking the direct opposition with one king move (straight, then diagonal), keeping it after Black steps aside, and seeing the line through to the queen.',
    newDifficulty: 'None: short lines first (pawn on the 4th-6th rank), the classic far-back pawn only at the end.',
    help: 'Full help (3) on every position: the idea named, a cue, marks.',
    advance: 'Plays the first move of each line correctly with full help and can say who has to move after it.',
    misconception: 'Walking straight at the black king, or pushing the pawn first, is as good.',
  },
  {
    id: 'guided', from: 11, to: 25, name: 'Guided acquisition',
    taught: 'How to obtain the opposition from different starting steps: straight, diagonal, sideways.',
    practised: 'The first move that takes the opposition, then keeping it; positions where Black moves first.',
    newDifficulty: 'The square that takes the opposition is not always straight ahead; the pawn further back (longer lines).',
    help: 'Full help (3) for 11-15, then cue and marks (2) for 16-25: the idea is no longer named.',
    advance: 'Finds the opposition square with only the cue and the marks, whatever the shape of the step.',
    misconception: 'Every good king move goes forward; close to the queening square anything wins.',
  },
  {
    id: 'reinforcement', from: 26, to: 40, name: 'Reinforcement',
    taught: 'The same idea from new king placements (black king on or beside the pawn\'s file) and move orders, and that sometimes several moves win (one of them taking the opposition).',
    practised: 'Taking and keeping the opposition on longer walks; accepting either of two equal moves.',
    newDifficulty: 'The black king beside the pawn\'s file; equal moves; marks removed from 33 on.',
    help: 'Cue and marks (2) for 26-32, cue only (1) for 33-40.',
    advance: 'Takes and keeps the opposition with the cue alone, from any king placement.',
    misconception: 'The opposition is always on the pawn\'s file; there is only one right move.',
  },
  {
    id: 'application', from: 41, to: 55, name: 'Practical application',
    taught: 'The opposition as a tool on the way: taken several times on a long approach, getting the king in front of the pawn, and two cases where it is not the first concern (the pawn hangs; the pawn runs).',
    practised: 'Long lines with more than one decisive moment; protecting the pawn first; pushing a pawn that runs.',
    newDifficulty: 'Several decisions per line (the solver shows a zugzwang more than once); contrast positions.',
    help: 'Cue only (1); the two contrast ideas are met with cue and marks (2) the first time.',
    advance: 'Wins long lines with the cue alone and does not take the opposition when the pawn hangs or runs.',
    misconception: 'The opposition is always the first thing to do.',
  },
  {
    id: 'variation', from: 56, to: 70, name: 'Variation',
    taught: 'The opposition along a rank (kings side by side), and the defender\'s use of it: against Black\'s pawn, taking the opposition in front of the pawn holds the draw.',
    practised: 'Horizontal opposition; defending; far-advanced pawns; other files.',
    newDifficulty: 'New geometry and a new role (defender), each introduced with more help, then less.',
    help: 'Horizontal: cue and marks (2), then cue (1). Defending: full help (3), then 2, then 1.',
    advance: 'Takes the opposition along a rank and holds the draw as the defender with the cue alone.',
    misconception: 'The opposition is only on a file; only the attacker needs it.',
  },
  {
    id: 'independent', from: 71, to: 82, name: 'Independent recognition',
    taught: 'Nothing new: recognising which positions ask for the opposition and which do not.',
    practised: 'All task types interleaved: take, keep, defend, protect first, push, equal moves.',
    newDifficulty: 'No help before the move; the task is not announced.',
    help: 'None (0); the explanation after each move stays.',
    advance: 'Mostly correct first moves without help across all task types.',
    misconception: 'Every pawn ending is an opposition problem.',
  },
  {
    id: 'calculation', from: 83, to: 92, name: 'Calculation challenges',
    taught: 'Accuracy over many moves: the opposition has to be taken again and again, tempting alternatives at several moments.',
    practised: 'The longest and most demanding lines the solver offers for this course.',
    newDifficulty: 'Around 1800 by the framework: more traps, more zugzwangs per line.',
    help: 'None (0); the explanation after each move stays.',
    advance: 'Completes long lines without help.',
    misconception: 'Once the opposition is taken, the rest plays itself.',
  },
  {
    id: 'assessment', from: 93, to: 100, name: 'Mixed assessment',
    taught: 'Nothing new: one position of each task, not announced.',
    practised: 'The whole course.',
    newDifficulty: 'No feedback during the line: the closing note only (as the other courses\' exams).',
    help: 'None (0), closing note only.',
    advance: 'End of the course.',
    misconception: 'Recognising the pattern without knowing why it works.',
  },
];

// slot(n, phase, purpose, concepts, task, help, band, objective, skill, constraints, requires)
const slot = (n, phase, purpose, concepts, task, help, band, objective, skill, constraints = {}, requires = []) =>
  ({ n, phase, purpose, concepts, task, help, feedback: phase === 'assessment' ? 'closing' : 'notes', band, objective, skill, constraints, requires });
const O = ['opposition'], SIDE = ['sideways'], DEF = ['defend'], ALL = ['opposition', 'sideways', 'defend'];
const V = { orientation: 'vertical' }, Hz = { orientation: 'horizontal' };

/**
 * The 100 slots. constraints (all checked by matches()): orientation, shape (of the first learner move:
 * straight, diagonal, sideways), givesWay (the solver's zugzwang right after: "Black must give way"),
 * defender (the defending king at the start: onFile, besideFile, away from the pawn's file), ranks (the
 * pawn's rank counted from its own side), files (b = the b- or g-file), moves (learner moves in the line),
 * minZugzwangs (zugzwangs the learner sets in the line), trapGivesOpposition (a tempting move hands Black
 * the opposition), trapIsPush (a tempting pawn push draws).
 */
const SLOTS = [
  // ---- 1-10 Introduction: why it matters and how to obtain it, full help ----
  slot(1, 'introduction', 'introduce', O, 'retake', 3, [I, M], 'See the problem it solves: the kings face each other, Black has to move and must give way, so your king gets forward.', 'The side to move must give way (with White to move it would only be a draw).', { ...V, moves: [7, 12] }),
  slot(2, 'introduction', 'introduce', O, 'take', 3, [I, M], 'Obtain it: step straight forward so the kings face each other with Black to move.', 'Choose the square that leaves Black to move; misconception: any step towards the black king will do.', { ...V, shape: 'straight', ranks: [4, 6], moves: [1, 6] }, [1]),
  slot(3, 'introduction', 'introduce', O, 'take', 3, [I, M], 'Obtain it with a diagonal step.', 'The opposition square is not always straight ahead.', { ...V, shape: 'diagonal', ranks: [4, 6], moves: [1, 6] }, [2]),
  slot(4, 'introduction', 'introduce', O, 'retake', 3, [I, M], 'Keep it: when Black steps aside, take the opposition again.', 'Follow the black king; one opposition is rarely enough.', { ...V, moves: [7, 12] }, [1, 2]),
  slot(5, 'introduction', 'introduce', O, 'take', 3, [I, M], 'Black must give way: after your move every Black move lets your king forward.', 'Look at the position after your move from Black\'s side.', { ...V, givesWay: true, ranks: [4, 6], moves: [1, 8] }, [2]),
  slot(6, 'introduction', 'introduce', O, 'take', 3, [I, M], 'Compare the right step with the wrong one: the wrong one hands Black the opposition, and it is only a draw.', 'Misconception: close to the black king is good enough.', { ...V, trapGivesOpposition: true, ranks: [3, 5], moves: [1, 10] }, [2, 5]),
  slot(7, 'introduction', 'introduce', O, 'take', 3, [I, M], 'King first: the opposition gets the king in front of the pawn; pushing the pawn now only draws.', 'Misconception: push the pawn as soon as possible.', { ...V, trapIsPush: true, ranks: [3, 5], moves: [1, 10] }, [2]),
  slot(8, 'introduction', 'introduce', O, 'retake', 3, [I, M], 'Black has to move again and again: walk forward, keeping the opposition each time.', 'Take it, Black gives way, take it again.', { ...V, moves: [7, 12] }, [4]),
  slot(9, 'introduction', 'introduce', O, 'take', 3, [I, M], 'The classic start: the pawn far back, the kings in front of it; take the opposition at once.', 'Misconception: with the pawn far back there is time to wait.', { ...V, ranks: [2, 3], moves: [1, 12] }, [6]),
  slot(10, 'introduction', 'introduce', O, 'take', 3, [I, M], 'The whole picture: take the opposition, Black gives way, your king goes in front, the pawn queens.', 'Putting the steps together.', { ...V, givesWay: true, ranks: [2, 4], moves: [1, 12] }, [1, 2, 3, 4, 5, 6, 7, 8, 9]),
  // ---- 11-25 Guided acquisition: obtain it from different steps; help 3, then 2 ----
  slot(11, 'guided', 'reinforce', O, 'take', 3, [I, M], 'Take it straight ahead with the pawn on its 2nd or 3rd rank.', 'Find the square in front of the black king with one square between.', { ...V, shape: 'straight', ranks: [2, 3], moves: [1, 12] }, [2, 9]),
  slot(12, 'guided', 'reinforce', O, 'take', 3, [I, M], 'Take it with a diagonal step when the straight square is wrong.', 'Misconception: always step straight.', { ...V, shape: 'diagonal', ranks: [2, 3], moves: [1, 10] }, [3]),
  slot(13, 'guided', 'reinforce', O, 'take', 3, [I, M], 'Take it with a sideways step: the right king move does not always go forward.', 'Misconception: every good king move goes forward.', { ...V, shape: 'sideways', ranks: [3, 4], moves: [1, 10] }, [11]),
  slot(14, 'guided', 'reinforce', O, 'retake', 3, [I, M], 'Black gives way to one side: answer on the same side.', 'Mirror Black\'s step to keep the opposition.', { ...V, moves: [7, 12] }, [4]),
  slot(15, 'guided', 'reinforce', O, 'take', 3, [I, M], 'A diagonal step, and Black must give way.', 'The step and its consequence together.', { ...V, shape: 'diagonal', givesWay: true, ranks: [4, 5], moves: [1, 10] }, [12]),
  slot(16, 'guided', 'reinforce', O, 'take', 2, [I, M], 'Find the opposition square with the cue and the marks only.', 'The idea is no longer named.', { ...V, shape: 'straight', ranks: [3, 4], moves: [1, 10] }, [11]),
  slot(17, 'guided', 'reinforce', O, 'take', 2, [I, M], 'A sideways step with the pawn far back.', 'Sideways is right when the black king is to the side.', { ...V, shape: 'sideways', ranks: [2, 3], moves: [1, 10] }, [13]),
  slot(18, 'guided', 'reinforce', O, 'take', 2, [I, M], 'A diagonal step with the pawn far back.', 'Diagonal from further away.', { ...V, shape: 'diagonal', ranks: [2, 3], moves: [1, 10] }, [12]),
  slot(19, 'guided', 'reinforce', O, 'retake', 2, [I, M], 'Black moves first: keep the opposition without the idea being named.', 'Keeping it is part of obtaining it.', { ...V, moves: [7, 12] }, [14]),
  slot(20, 'guided', 'reinforce', O, 'take', 2, [I, M], 'King before pawn again: the push draws.', 'Misconception: push the pawn first.', { ...V, trapIsPush: true, ranks: [3, 5], moves: [1, 10] }, [7]),
  slot(21, 'guided', 'reinforce', O, 'take', 2, [I, M], 'A diagonal step that leaves Black to give way, pawn on the 3rd or 4th rank.', 'The consequence without being told.', { ...V, shape: 'diagonal', givesWay: true, ranks: [3, 4], moves: [1, 10] }, [15]),
  slot(22, 'guided', 'reinforce', O, 'take', 2, [I, M], 'Close to promotion the opposition still decides.', 'Misconception: near the queening square anything wins.', { ...V, shape: 'sideways', ranks: [4, 6], moves: [1, 6] }, [13]),
  slot(23, 'guided', 'reinforce', O, 'take', 2, [I, M], 'Straight ahead, pawn far back, and Black must give way.', 'The classic picture without the idea named.', { ...V, shape: 'straight', givesWay: true, ranks: [2, 4], moves: [1, 12] }, [16]),
  slot(24, 'guided', 'reinforce', O, 'retake', 2, [I, M], 'Keep the opposition again after Black\'s step aside.', 'Repetition with a new placement.', { ...V, moves: [7, 12] }, [19]),
  slot(25, 'guided', 'reinforce', O, 'take', 2, [I, M], 'Consolidation: the wrong step hands Black the opposition; find the right one.', 'Misconception: close enough is good enough.', { ...V, trapGivesOpposition: true, ranks: [2, 5], moves: [1, 10] }, [6]),
  // ---- 26-40 Reinforcement: new placements and move orders; help 2, then 1 ----
  slot(26, 'reinforcement', 'reinforce', O, 'take', 2, [I, M], 'The black king on the pawn\'s file: take the opposition in front of it.', 'Read where the black king stands.', { ...V, defender: 'onFile', ranks: [2, 4], moves: [1, 12] }, [11]),
  slot(27, 'reinforcement', 'reinforce', O, 'take', 2, [I, M], 'The black king beside the pawn\'s file: the opposition square moves with it.', 'Misconception: the opposition is always on the pawn\'s file.', { ...V, defender: 'besideFile', ranks: [2, 4], moves: [1, 12] }, [26]),
  slot(28, 'reinforcement', 'reinforce', O, 'retake', 2, [I, M], 'Black moves first from beside the pawn\'s file: keep the opposition.', 'Keeping it from a new placement.', { ...V, moves: [7, 12] }, [24]),
  slot(29, 'reinforcement', 'reinforce', O, 'take', 2, [I, M], 'A diagonal step with the pawn far advanced.', 'Short line, same idea.', { ...V, shape: 'diagonal', ranks: [5, 6], moves: [1, 6] }, [21]),
  slot(30, 'reinforcement', 'reinforce', O, 'either', 2, [I, M], 'Two (or more) moves win equally fast; one takes the opposition. Either is right.', 'The opposition is one way among several here; [%also] lists the others.', { moves: [1, 12] }, [10]),
  slot(31, 'reinforcement', 'reinforce', O, 'take', 2, [I, M], 'Straight ahead and Black must give way, pawn on the 3rd-5th rank.', 'Same idea, new placement.', { ...V, shape: 'straight', givesWay: true, ranks: [3, 5], moves: [1, 12] }, [23]),
  slot(32, 'reinforcement', 'reinforce', O, 'take', 2, [I, M], 'A sideways step, pawn on the 2nd-4th rank.', 'Sideways from a new placement.', { ...V, shape: 'sideways', ranks: [2, 4], moves: [1, 12] }, [17]),
  slot(33, 'reinforcement', 'reinforce', O, 'take', 1, [I, M], 'The black king beside the pawn\'s file, with the cue only.', 'Marks are gone: see the squares yourself.', { ...V, defender: 'besideFile', ranks: [3, 5], moves: [1, 12] }, [27]),
  slot(34, 'reinforcement', 'reinforce', O, 'retake', 1, [M], 'A long walk: keep the opposition all the way.', 'Patience: the same step many times.', { ...V, moves: [11, 30] }, [28]),
  slot(35, 'reinforcement', 'reinforce', O, 'take', 1, [I, M], 'A diagonal step with the pawn far back, cue only.', 'Diagonal without marks.', { ...V, shape: 'diagonal', ranks: [2, 3], moves: [1, 12] }, [18]),
  slot(36, 'reinforcement', 'reinforce', O, 'take', 1, [I, M], 'Straight ahead with the pawn far advanced, cue only.', 'Short line without marks.', { ...V, shape: 'straight', ranks: [4, 6], moves: [1, 10] }, [16]),
  slot(37, 'reinforcement', 'reinforce', O, 'either', 1, [I, M], 'Equal moves again, cue only: either is right.', 'Do not look for the one magic move when several win.', { moves: [1, 12] }, [30]),
  slot(38, 'reinforcement', 'reinforce', O, 'take', 1, [I, M], 'Black must give way, pawn on the 2nd-4th rank, cue only.', 'The consequence without marks.', { ...V, givesWay: true, ranks: [2, 4], moves: [1, 12] }, [31]),
  slot(39, 'reinforcement', 'reinforce', O, 'take', 1, [I, M], 'A sideways step, pawn on the 3rd-5th rank, cue only.', 'Sideways without marks.', { ...V, shape: 'sideways', ranks: [3, 5], moves: [1, 12] }, [32]),
  slot(40, 'reinforcement', 'reinforce', O, 'retake', 1, [I, M], 'Black moves first, cue only: keep the opposition.', 'Keeping it without marks.', { ...V, moves: [7, 14] }, [34]),
  // ---- 41-55 Practical application: a tool on the way; contrasts ----
  slot(41, 'application', 'reinforce', O, 'take', 1, [M, H], 'Use it on the way: the opposition is taken more than once before the pawn queens.', 'Retake it at every chance on a long approach.', { ...V, ranks: [2, 3], moves: [11, 30], minZugzwangs: 2 }, [10]),
  slot(42, 'application', 'reinforce', O, 'take', 1, [I, M], 'Approach: take the opposition, then walk in front of the pawn.', 'The opposition opens the way for the king.', { ...V, defender: 'onFile', ranks: [2, 4], moves: [9, 30] }, [26]),
  slot(43, 'application', 'reinforce', O, 'retake', 1, [M, H], 'A long walk with Black moving first.', 'Keep it over many moves.', { ...V, moves: [11, 30] }, [40]),
  slot(44, 'application', 'reinforce', O, 'take', 1, [I, M], 'Support the pawn: the king leads and the pawn follows; pushing early draws.', 'Misconception: the pawn should lead.', { ...V, trapIsPush: true, ranks: [3, 4], moves: [9, 30] }, [20]),
  slot(45, 'application', 'misconception', O, 'protect', 2, [I, M], 'Not always first: the black king attacks the pawn; protect it, the opposition can wait.', 'Misconception: always take the opposition first.', {}, [10]),
  slot(46, 'application', 'reinforce', O, 'take', 1, [I, M], 'Black must give way, pawn on the 4th-5th rank, a longer line.', 'The idea inside a longer line.', { ...V, givesWay: true, ranks: [4, 5], moves: [7, 30] }, [38]),
  slot(47, 'application', 'reinforce', O, 'take', 1, [I, M], 'A diagonal step on a long approach.', 'Diagonal as part of a walk.', { ...V, shape: 'diagonal', ranks: [2, 3], moves: [9, 30] }, [35]),
  slot(48, 'application', 'misconception', O, 'push', 2, [I, M], 'Not needed: the pawn runs and the black king cannot catch it; push.', 'Misconception: every pawn ending needs the opposition.', {}, [10]),
  slot(49, 'application', 'reinforce', O, 'take', 1, [I, M], 'A sideways step on a long approach.', 'Sideways as part of a walk.', { ...V, shape: 'sideways', ranks: [3, 4], moves: [9, 30] }, [39]),
  slot(50, 'application', 'reinforce', O, 'retake', 1, [M, H], 'Black moves first; keep the opposition to the end.', 'Keeping it as a routine.', { ...V, moves: [7, 30] }, [43]),
  slot(51, 'application', 'reinforce', O, 'take', 1, [M, H], 'The classic long win: pawn far back, Black must give way.', 'Endurance with the same idea.', { ...V, givesWay: true, ranks: [2, 3], moves: [11, 30] }, [41]),
  slot(52, 'application', 'reinforce', O, 'protect', 1, [I, M], 'Protect first again, with the cue only.', 'Check whether the pawn hangs before anything else.', {}, [45]),
  slot(53, 'application', 'reinforce', O, 'take', 1, [I, M], 'The pawn far advanced: a short decisive opposition.', 'Short line, cue only.', { ...V, ranks: [4, 6], moves: [1, 8] }, [36]),
  slot(54, 'application', 'reinforce', O, 'take', 1, [M, H], 'Two zugzwangs on the way: take the opposition, then again.', 'More than one decisive moment.', { ...V, ranks: [2, 4], moves: [9, 30], minZugzwangs: 2 }, [41]),
  slot(55, 'application', 'reinforce', O, 'push', 1, [I, M], 'Count before you walk: the pawn runs.', 'The race is checked before the kings.', {}, [48]),
  // ---- 56-70 Variation: along a rank, and the defender ----
  slot(56, 'variation', 'introduce', SIDE, 'take', 2, [I, M], 'The opposition along a rank: the kings side by side with one square between.', 'Misconception: the opposition is only on a file.', { ...Hz, ranks: [2, 4], moves: [1, 12] }, [10]),
  slot(57, 'variation', 'reinforce', SIDE, 'take', 1, [I, M], 'Along a rank again, pawn on the 3rd-5th rank.', 'Recognise the sideways picture.', { ...Hz, ranks: [3, 5], moves: [1, 12] }, [56]),
  slot(58, 'variation', 'variation', O, 'take', 1, [I, M], 'A pawn far advanced: the same fight in fewer moves.', 'The idea does not depend on the pawn\'s rank.', { ...V, ranks: [5, 6], moves: [1, 6] }, [53]),
  slot(59, 'variation', 'reinforce', SIDE, 'take', 1, [I, M], 'Along a rank with the pawn far back.', 'Sideways opposition on a long walk.', { ...Hz, ranks: [2, 3], moves: [1, 14] }, [57]),
  slot(60, 'variation', 'variation', O, 'take', 1, [I, M], 'The black king away from the pawn\'s file.', 'The opposition square from an unusual placement.', { ...V, defender: 'away', moves: [1, 12] }, [33]),
  slot(61, 'variation', 'introduce', DEF, 'defend', 3, [I, M], 'Defending: Black has the pawn. Take the opposition in front of it and Black cannot get past.', 'Misconception: the defender just waits.', { ...V }, [10]),
  slot(62, 'variation', 'reinforce', DEF, 'defend', 2, [I, M], 'Defending again: the move that holds takes the opposition.', 'The same idea from the other side.', { ...V }, [61]),
  slot(63, 'variation', 'reinforce', DEF, 'defend', 2, [I, M], 'Defending: after your move Black must give way and cannot win.', 'The attacker also has to move.', { ...V, givesWay: true }, [62]),
  slot(64, 'variation', 'reinforce', SIDE, 'take', 1, [I, M], 'Along a rank: the wrong step hands Black the opposition.', 'Contrast inside the new geometry.', { ...Hz, trapGivesOpposition: true, moves: [1, 12] }, [59]),
  slot(65, 'variation', 'reinforce', DEF, 'defend', 1, [I, M], 'Defending along a rank.', 'The defender\'s sideways opposition.', { ...Hz }, [63]),
  slot(66, 'variation', 'variation', O, 'take', 1, [I, M], 'A pawn on the b- or g-file.', 'The idea on another file.', { ...V, files: ['b'], moves: [1, 12] }, [58]),
  slot(67, 'variation', 'reinforce', DEF, 'defend', 1, [I, M], 'Defending with the cue only.', 'Holding without marks.', { ...V }, [65]),
  slot(68, 'variation', 'variation', O, 'either', 1, [I, M], 'Equal moves in a new placement.', 'Several right moves, none magic.', { moves: [1, 12] }, [37]),
  slot(69, 'variation', 'reinforce', SIDE, 'take', 1, [I, M], 'Along a rank with the pawn far advanced.', 'Short sideways decision.', { ...Hz, ranks: [4, 6], moves: [1, 8] }, [64]),
  slot(70, 'variation', 'reinforce', DEF, 'defend', 1, [I, M], 'Defending: Black must give way, cue only.', 'The defender\'s zugzwang without marks.', { ...V, givesWay: true }, [67]),
  // ---- 71-82 Independent recognition: no help, tasks interleaved ----
  slot(71, 'independent', 'independent_application', O, 'take', 0, [I, M], 'Take the opposition without any help.', 'Recognise it unannounced.', { ...V, moves: [1, 14] }, [40]),
  slot(72, 'independent', 'independent_application', O, 'push', 0, [I, M], 'Recognise that the pawn simply runs.', 'Not every position asks for the opposition.', {}, [55]),
  slot(73, 'independent', 'independent_application', DEF, 'defend', 0, [I, M], 'Defend without help.', 'The defender\'s opposition unannounced.', { ...V }, [70]),
  slot(74, 'independent', 'independent_application', O, 'retake', 0, [M, H], 'Black moves first: keep the opposition without help.', 'Keeping it unannounced.', { ...V, moves: [7, 30] }, [50]),
  slot(75, 'independent', 'independent_application', O, 'protect', 0, [I, M], 'The pawn hangs: protect it without being told.', 'Priority check unannounced.', {}, [52]),
  slot(76, 'independent', 'independent_application', SIDE, 'take', 0, [I, M], 'Along a rank, without help.', 'Sideways opposition unannounced.', { ...Hz, moves: [1, 14] }, [69]),
  slot(77, 'independent', 'independent_application', O, 'either', 0, [I, M], 'Equal moves, without help.', 'Accept that several moves win.', { moves: [1, 14] }, [68]),
  slot(78, 'independent', 'independent_application', DEF, 'defend', 0, [I, M], 'Defend along a rank or a file, without help.', 'The defender in any geometry.', {}, [73]),
  slot(79, 'independent', 'independent_application', O, 'take', 0, [I, M], 'A far-advanced pawn, without help.', 'Short decision unannounced.', { ...V, ranks: [5, 6], moves: [1, 8] }, [58]),
  slot(80, 'independent', 'independent_application', O, 'push', 0, [I, M], 'The pawn runs, without help.', 'The race before the kings.', {}, [72]),
  slot(81, 'independent', 'independent_application', SIDE, 'take', 0, [I, M], 'Along a rank with the pawn far back, without help.', 'Sideways on a long walk.', { ...Hz, ranks: [2, 3], moves: [1, 16] }, [76]),
  slot(82, 'independent', 'independent_application', DEF, 'defend', 0, [I, M], 'Defending: Black must give way, without help.', 'The defender\'s zugzwang unannounced.', { givesWay: true }, [78]),
  // ---- 83-92 Calculation challenges: the longest, most demanding lines ----
  slot(83, 'calculation', 'calculation', O, 'take', 0, [H], 'A long line with tempting moves at several moments.', 'Accuracy over many moves.', { ...V, moves: [11, 30] }, [71]),
  slot(84, 'calculation', 'calculation', O, 'retake', 0, [M, H], 'Black moves first; keep the opposition through a long line.', 'Keeping it under pressure.', { ...V, moves: [11, 30] }, [74]),
  slot(85, 'calculation', 'calculation', O, 'take', 0, [H], 'Three or more zugzwangs on the way.', 'Every opposition counts.', { ...V, moves: [11, 30], minZugzwangs: 3 }, [54]),
  slot(86, 'calculation', 'calculation', SIDE, 'take', 0, [M, H], 'Along a rank on a long line.', 'Sideways opposition under pressure.', { ...Hz, moves: [9, 30] }, [81]),
  slot(87, 'calculation', 'calculation', DEF, 'defend', 0, [M, H], 'A long defence.', 'Holding over many moves.', { ...V }, [82]),
  slot(88, 'calculation', 'calculation', O, 'take', 0, [H], 'The wrong step hands Black the opposition, deep in a long line.', 'Spot the decisive moment.', { ...V, trapGivesOpposition: true, moves: [11, 30] }, [83]),
  slot(89, 'calculation', 'calculation', O, 'retake', 0, [M, H], 'Black moves first, the longest lines.', 'Endurance.', { ...V, moves: [11, 30] }, [84]),
  slot(90, 'calculation', 'calculation', O, 'take', 0, [M, H], 'The pawn on its 2nd or 3rd rank, the longest walk.', 'From far back to the queen.', { ...V, ranks: [2, 3], moves: [13, 30] }, [85]),
  slot(91, 'calculation', 'calculation', DEF, 'defend', 0, [M, H], 'Defending: Black must give way, the hardest cases.', 'The defender under pressure.', { givesWay: true }, [87]),
  slot(92, 'calculation', 'calculation', O, 'take', 0, [H], 'The hardest direct-opposition line of the course.', 'Everything at once.', { ...V, moves: [11, 30] }, [90]),
  // ---- 93-100 Mixed assessment: one of each task, closing note only ----
  slot(93, 'assessment', 'mixed_review', ALL, 'take', 0, [M], 'Assessment: take the opposition.', 'Unannounced, no feedback until the end.', { ...V, moves: [1, 14] }, [92]),
  slot(94, 'assessment', 'mixed_review', ALL, 'defend', 0, [M], 'Assessment: hold the draw.', 'Unannounced.', {}, [91]),
  slot(95, 'assessment', 'mixed_review', ALL, 'push', 0, [M], 'Assessment: the pawn runs.', 'Unannounced.', {}, [80]),
  slot(96, 'assessment', 'mixed_review', ALL, 'retake', 0, [M], 'Assessment: Black moves first.', 'Unannounced.', { ...V, moves: [7, 30] }, [89]),
  slot(97, 'assessment', 'mixed_review', ALL, 'protect', 0, [I, M], 'Assessment: the pawn hangs.', 'Unannounced.', {}, [75]),
  slot(98, 'assessment', 'mixed_review', ALL, 'take', 0, [M], 'Assessment: along a rank.', 'Unannounced.', { ...Hz, moves: [1, 14] }, [86]),
  slot(99, 'assessment', 'mixed_review', ALL, 'either', 0, [M], 'Assessment: equal moves.', 'Unannounced.', { moves: [1, 14] }, [77]),
  slot(100, 'assessment', 'mixed_review', ALL, 'take', 0, [H], 'Assessment: a long line with the opposition at several moments.', 'Unannounced, the final position of the course.', { ...V, moves: [11, 30] }, [92]),
];

const relRank = (c) => (c.task === 'defend' ? 9 - +c.pawn[1] : +c.pawn[1]);
/** No rook pawns in this course (their exception belongs to course 7). */
const ROOK_FILES = ['a', 'h'];
/** Does a candidate (feasibility.cjs: tasks.classify + its line's analysis) fit a slot? */
function matches(s, c) {
  const k = s.constraints;
  if (c.task !== s.task || ROOK_FILES.includes(c.pawn[0])) return false;
  if (k.orientation && c.orientation !== k.orientation) return false;
  if (k.shape && c.shape !== k.shape) return false;
  if (k.givesWay !== undefined && Boolean(c.givesWay) !== k.givesWay) return false;
  if (k.defender && c.defender !== k.defender) return false;
  if (k.trapGivesOpposition && !c.trapGivesOpposition) return false;
  if (k.trapIsPush && !c.trapIsPush) return false;
  if (k.ranks && (relRank(c) < k.ranks[0] || relRank(c) > k.ranks[1])) return false;
  if (k.files && !k.files.includes(c.pawn[0])) return false;
  if (c.learnerMoves !== undefined && k.moves && (c.learnerMoves < k.moves[0] || c.learnerMoves > k.moves[1])) return false;
  if (k.minZugzwangs && (c.difficulty?.signals.zugzwangsSet ?? 0) < k.minZugzwangs) return false;
  // every candidate carries its line's analysis (defending lines too: line.cjs objective 'hold')
  if (c.difficulty && !s.band.includes(c.difficulty.label)) return false;
  return true;
}

/** One key for a position and its mirror image (files a-h exchanged): board with the pawn on files a-d, side to move. */
function canonical(fen) {
  const [b, stm] = fen.split(' ');
  const rows = b.split('/').map((r) => r.replace(/\d/g, (d) => '.'.repeat(+d)));
  const col = rows.map((r) => r.search(/p/i)).find((i) => i >= 0);
  return `${(col > 3 ? rows.map((r) => [...r].reverse().join('')) : rows).join('/')} ${stm}`;
}
/** The start positions of the other built-in courses (canonical): this course must not repeat them. */
function otherCourseStarts(read = (f) => require('fs').readFileSync(require('path').join(__dirname, '../../../../courses', f), 'utf8')) {
  const { readPgn } = require('../../pgn.cjs');
  const files = ['king-and-pawn-course.pgn', 'endgame-basics-course.pgn', 'connected-pawns-course.pgn', 'ladder-mate-course.pgn'];
  return new Set(files.flatMap((f) => readPgn(read(f)).map((g) => canonical(g.tags.FEN))));
}

/** The slot table as Markdown (direct-opposition.md embeds it; the test keeps the two in step). */
function toMarkdown() {
  const help = (s) => (s.feedback === 'closing' ? `${s.help} (closing note only)` : String(s.help));
  const cons = (k) => Object.entries(k).map(([a, b]) => `${a} ${Array.isArray(b) ? b.join('-') : b}`).join(', ') || '-';
  const rows = SLOTS.map((s) => `| ${s.n} | ${PHASES.find((p) => p.id === s.phase).name} / ${s.purpose} | ${s.task} | ${s.objective} | ${s.skill} | ${help(s)} | ${s.band.join(', ')} | ${cons(s.constraints)} | ${s.requires.length ? s.requires.join(', ') : '-'} |`);
  return ['| # | Phase / purpose | Task | Objective | Skill or misconception | Help | Band | Constraints | After slots |', '|---|---|---|---|---|---|---|---|---|', ...rows].join('\n');
}

module.exports = { VERIFY, VOCABULARY, HELP, PHASES, SLOTS, ROOK_FILES, createCourseExplainer, learnerOrder, matches, relRank, canonical, otherCourseStarts, toMarkdown };
