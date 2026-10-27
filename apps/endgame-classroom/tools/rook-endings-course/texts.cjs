// The course's words: lessons (which group's lines each takes, how many, which marks), intros, colours, takeaways
// and closing notes. Notes on the moves come from the teaching layer (build.cjs); pgnout.cjs puts it all together.
// Intros are shown in Practice too: they name the idea, never the move. Short where possible; a lesson's first
// intro may be longer when the words teach the idea (the owner's rule: short is better, longer if it teaches).
'use strict';

/** marks: 'full' (the lesson's colours), 'target' (only the rook's target squares), 'none' (the exam). */
const LESSONS = [
  {
    id: 'lucena', title: 'The Lucena: build a bridge', take: [{ group: 'lucena', count: 4 }], marks: 'full',
    intro: [
      'Welcome! Rook and pawn against rook: three ideas every player needs. You play White in every line. First the ' +
        'Lucena. Your pawn is one step from queening, your king stands in front of it. The king must step out, and ' +
        'then the black rook checks it from behind. So first put your rook on the 4th rank: later it can block the ' +
        'checks. That is the bridge.',
      'Again the king must step out. Shelter first.',
      'The same plan on another file.',
      'One more: shelter, king out, queen.',
    ],
    // later lines: what is different in this kind of position (by the line's pattern)
    byPattern: {
      'b-right': 'Your king will hide at the edge of the board: build the shelter for it there.',
      'c-right': 'The black king is cut off. Your king steps out towards the edge, and the rook shelters it there.',
    },
    colours: 'Blue: the file that keeps the black king away. Green: where your rook goes.',
    takeaway: 'Rook to the 4th rank: the bridge shelters your king from the checks, and the pawn queens.',
  },
  {
    id: 'lucena-own', title: 'The Lucena on your own', take: [{ group: 'lucena', count: 3 }], marks: 'target',
    intro: ['Now on your own: the same plan, with only the rook\'s target squares in green.', 'Find the plan yourself.', 'The last one.'],
    takeaway: 'Rook to the 4th rank: the bridge shelters your king from the checks, and the pawn queens.',
  },
  {
    id: 'skewer', title: 'The skewer', take: [{ group: 'skewer', count: 4 }], marks: 'full',
    intro: [
      'Your rook stands in front of your pawn, the black rook behind it. While your rook blocks the pawn, it cannot ' +
        'queen. Move the rook off the queening square, but choose the square well: if the black rook then takes the ' +
        'pawn, your rook should check along the 7th rank, and the black rook behind the king falls.',
      'The same trap, another king.',
      'Where does the rook go this time?',
      'One more trap.',
    ],
    byPattern: {
      'kd7-long': 'Black checks before it takes the pawn: walk your king out of the checks.',
      'ke7-long': 'Black checks first again. Then the trap.',
      'kf7-long': 'One more: set the trap, escape the checks, win the rook.',
    },
    colours: 'Blue: the 7th rank, where the trap is sprung. Green: the square of the winning check.',
    takeaway: 'Clear the queening square: if the black rook takes the pawn, a check on the 7th rank wins it.',
  },
  {
    id: 'philidor', title: 'The Philidor: check from behind', take: [{ group: 'philidor', count: 4 }], marks: 'full',
    intro: [
      'Now you defend: Black has the pawn, you hold the draw. While the pawn is on your 4th rank, your rook on the ' +
        '3rd rank keeps the black king out. Once the pawn steps to the 3rd rank, the king can no longer hide in front ' +
        'of it: send your rook far up the board and check from behind. If the king walks towards your rook, it ' +
        'leaves its pawn.',
      'Hold the draw: the pawn has advanced again.',
      'Another file, the same defence.',
      'The last one before the exam.',
    ],
    byPattern: {
      'c-file': 'Keep checking from behind until the pawn falls.',
      'd-file': 'If Black blocks a check with its rook, a trade may be your answer: your king is close enough to stop the pawn.',
    },
    colours: 'Green: every square from where your rook holds the draw.',
    takeaway: 'Once the pawn reaches your 3rd rank, check from far behind: the black king cannot hide.',
  },
  {
    id: 'exam', title: 'Final exam', take: [{ group: 'lucena', count: 2 }, { group: 'skewer', count: 2 }, { group: 'philidor', count: 2 }], marks: 'none',
    intro: ['Final exam: six positions, two of each idea, no colours and no notes until the end.'],
    task: { lucena: 'White to play and win.', skewer: 'White to play and win.', philidor: 'Black has the pawn. Hold the draw.' },
    takeaway: null, // the group's own takeaway
  },
];
const TAKEAWAY = { lucena: LESSONS[0].takeaway, skewer: LESSONS[2].takeaway, philidor: LESSONS[3].takeaway };

/** The closing note on the line's last move. */
function closing(m) {
  if (m.promotion) return `${m.san} — Queen! The win is safe.`;
  if (m.captured === 'r') return `${m.san} — The rook is won: the win is safe.`;
  if (m.captured === 'p') return `${m.san} — The pawn falls: a draw.`;
  throw new Error(`no closing note for ${m.san}`);
}
const FINAL_NOTE = /^(\[%[^\]]*\] )*\S+ — (Queen! The win is safe\.|The rook is won: the win is safe\.|The pawn falls: a draw\.)$/;

module.exports = { LESSONS, TAKEAWAY, closing, FINAL_NOTE };
