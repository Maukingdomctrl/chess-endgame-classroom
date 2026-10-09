// Real Direct Opposition positions that exercise the teaching pipeline (outcome, explain, concepts,
// difficulty, progression) before the course is generated. Each says what it tests; test.cjs checks every
// claim against the independent oracle (../../pawn/oracle.cjs) and against geometry written again there.
// The texts are what the course's explainer (direct-opposition.cjs: vocabulary of course 1) says today.
//
// fen: the start; task: what tasks.classify says (null: not a course-1 task, on purpose); first: the
// learner's first move; text: its explanation; wrong: other moves and their explanations.
const PROTOTYPES = [
  {
    id: 'take-classic', fen: '8/8/4k3/8/8/4K3/4P3/8 w - - 0 1', task: 'take', first: 'Ke4',
    tests: 'Why taking the opposition works, a tempting step that hands it to Black (a draw), and a slower win kept apart from a lost one.',
    text: 'Ke4! — Take the opposition.',
    wrong: [
      { san: 'Kf3', kind: 'draws', text: 'Kf3? — Black gets the opposition. Only a draw now.' },
      { san: 'Kd4', kind: 'slower', text: 'Kd4?! — Still wins, but 2 moves slower.' },
    ],
  },
  {
    id: 'side-to-move', fen: '8/8/4k3/8/4K3/4P3/8/8 b - - 0 1', task: null,
    tests: 'The side to move decides: with Black to move White wins, with White to move it is only a draw (the solver\'s zugzwang, either side). Not a course-1 task: after Black gives way, the fastest win steps past onto a key square (course 3).',
    whiteToMove: { zugzwang: 'If Black had to move, you would win.', every: 'Every move keeps the draw.' },
  },
  {
    id: 'retake', fen: '8/3k4/8/3K4/2P5/8/8/8 b - - 0 1', task: 'retake', reply: 'Kc7', first: 'Kc5',
    tests: 'A line that starts with Black\'s move (verify.cjs learner option): Black gives way, the learner takes the opposition again, and Black must give way (solver zugzwang).',
    text: 'Kc5! — Take the opposition. Black must give way.',
  },
  {
    id: 'horizontal', fen: '8/8/3K4/1k6/8/2P5/8/8 w - - 0 1', task: 'take', first: 'Kd5', orientation: 'horizontal', shape: 'back',
    tests: 'The direct opposition along a rank, taken with a step back.',
    text: 'Kd5! — Take the opposition.',
    wrong: [{ san: 'Kc7', kind: 'draws', text: 'Kc7? — Black gets the opposition. Only a draw now.' }],
  },
  {
    id: 'equal-moves', fen: '8/4k3/8/8/4K3/8/4P3/8 w - - 0 1', task: 'either', first: 'Ke5', also: ['Kd5', 'Kf5'],
    tests: 'Several moves win equally fast: only the one the board explains claims the opposition, the others are named and accepted ([%also] = the solver\'s equal moves), and the line plays the explained one.',
    text: 'Ke5! — Take the opposition. Kd5 and Kf5 win just as fast.',
  },
  {
    id: 'defend-give-way', fen: '8/8/8/1p6/2k5/8/3K4/8 w - - 0 1', task: 'defend', first: 'Kc2',
    tests: 'The defender\'s opposition against Black\'s pawn (the board turned round): the only move that holds, and Black must give way.',
    text: 'Kc2! — Take the opposition. Black must give way.',
  },
  {
    id: 'defend-rank', fen: '8/8/3p4/8/8/1k6/3K4/8 w - - 0 1', task: 'defend', first: 'Kd3', orientation: 'horizontal',
    tests: 'Defending along a rank; a wrong move is explained by what it gives up, not by an untaught term.',
    text: 'Kd3! — Take the opposition.',
    wrong: [{ san: 'Ke3', kind: 'loses', text: 'Ke3? — Your king steps out of the d-pawn\'s way. Now Black wins.' }],
  },
  {
    id: 'long-approach', fen: '8/8/4k3/8/8/2P1K3/8/8 w - - 0 1', task: 'take', first: 'Ke4', givesWay: true,
    tests: 'A long line where the opposition is taken again and again (the solver shows Black in zugzwang three times): calculation, scored by zugzwangs the learner sets.',
    text: 'Ke4! — Take the opposition. Black must give way.',
  },
  {
    id: 'diagonal-step', fen: '8/2k5/8/8/1K6/8/3P4/8 w - - 0 1', task: 'take', first: 'Kc5', shape: 'diagonal',
    tests: 'Taking the opposition with a diagonal step, the pawn far back; a tempting move lets Black block the pawn.',
    text: 'Kc5! — Take the opposition.',
    wrong: [{ san: 'Ka5', kind: 'draws', text: 'Ka5? — Black\'s king blocks the d-pawn. Only a draw now.' }],
  },
  {
    id: 'protect-first', fen: '3k4/1K6/8/3P4/8/8/8/8 w - - 0 1', task: 'protect', first: 'Kc6', contrast: 'Kb8',
    tests: 'Not always first: protect the pawn; the tempting move that takes the opposition only draws.',
    text: 'Kc6! — Your king protects the d-pawn.',
  },
  {
    id: 'push-first', fen: '8/8/5k2/1P6/8/4K3/8/8 w - - 0 1', task: 'push', first: 'b6', contrast: 'Kf4',
    tests: 'Not needed: the pawn runs; the tempting move that takes the opposition does not win as fast.',
    text: 'b6! — The b-pawn runs: the king cannot catch it.',
  },
  {
    id: 'not-enough', fen: '8/8/8/8/8/4k3/1P6/3K4 w - - 0 1', task: null, first: 'Kc2', tempting: 'Ke1',
    tests: 'A guard rail: Ke1 takes the direct opposition and only draws; nothing in course 1\'s facts explains why Kc2 wins, so the explainer must flag it, not invent a reason (course 7 material).',
  },
];

module.exports = { PROTOTYPES };
