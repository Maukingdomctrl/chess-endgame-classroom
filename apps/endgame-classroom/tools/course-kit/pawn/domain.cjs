// The pawn endings' vocabulary for the teaching layer (../teach/): which facts the board shows (teach.cjs
// pawnFacts), how to say them in a few words, which concepts they stand for, and where a usual rule has an
// exception. The teaching layer stays generic; everything about pawns is here.
//
//   const { createExplainer } = require('../teach/explain.cjs');
//   const ex = createExplainer({ verify, domain: require('./domain.cjs') });
//
// Phrases are written for the learner as White against the black king (the owner's rule). gain: the
// learner's move creates the fact (said as advice); give: the opponent gets it (after a mistake, or by its
// reply); lose: a fact of the learner's that disappears.
const { file } = require('../board.cjs');
const { pawnFacts, plausibleMoves, pos } = require('./teach.cjs');
const { createConcepts } = require('../teach/concepts.cjs');

/** Only White's pawns against the lone black king: the positions these facts are about. */
const isPawnEnding = (fen) => /^[KkP1-8/]+$/.test(fen.split(' ')[0]) && /P/.test(fen.split(' ')[0]);
const kindWord = (f) => (f.kind === 'direct' ? '' : `${f.kind} `);
const fileOf = (f) => `${f.pawn[0]}-pawn`;
const cap = (t) => t[0].toUpperCase() + t.slice(1);

const phrases = {
  // the order a reason is chosen in, when a move creates several
  priority: ['keySquare', 'opposition', 'outsideSquare', 'pawnAttacked', 'pawnProtected', 'blockade'],
  gain: {
    opposition: (f) => `Take the ${kindWord(f)}opposition.`,
    keySquare: () => 'Your king reaches a key square.',
    outsideSquare: (f) => `The ${fileOf(f)} runs: the king cannot catch it.`,
    pawnProtected: (f) => (f.by === 'your king' ? `Your king protects the ${fileOf(f)}.` : `${cap(f.by)} protects the ${fileOf(f)}.`),
  },
  keep: {
    opposition: (f) => `Keep the ${kindWord(f)}opposition.`,
    keySquare: () => 'Your king stays on a key square.',
    pawnProtected: (f) => (f.by === 'your king' ? `Your king keeps the ${fileOf(f)} protected.` : `${cap(f.by)} keeps the ${fileOf(f)} protected.`),
  },
  give: {
    opposition: (f) => `Black gets the ${kindWord(f)}opposition.`,
    pawnAttacked: (f) => `Black's king attacks the ${fileOf(f)}.`,
    blockade: (f) => `Black's king blocks the ${fileOf(f)}.`,
  },
  lose: {
    opposition: () => 'You give up the opposition.',
    keySquare: () => 'Your king leaves the key squares.',
    outsideSquare: (f) => `Now the king can catch the ${fileOf(f)}.`,
    pawnProtected: (f) => `The ${fileOf(f)} is left unprotected.`,
  },
};

/** The concepts of pawn endings that the facts can show. More are added the same way, one fact each. */
const concepts = createConcepts([
  {
    id: 'opposition', fact: 'opposition', name: 'the opposition',
    notes: {
      introduce: 'The kings face each other. The side to move must give way.',
      reinforce: 'Take the opposition: make Black move first.',
      exception: 'With a rook pawn, the opposition is not always enough.',
    },
    cues: ['Which king will have to give way?', 'When the kings face each other, who should be to move?'],
    remember: 'The side that does not have to move has the opposition.',
  },
  {
    id: 'keySquare', fact: 'keySquare', name: 'key squares',
    notes: {
      introduce: 'Key squares: with your king there, the pawn promotes.',
      reinforce: 'Head for a key square, not for the pawn.',
      exception: 'A rook pawn has its own key squares.',
    },
    cues: ['Where does your king need to stand?', 'Which squares in front of the pawn win?'],
    remember: 'A king on a key square wins whoever is to move.',
  },
  {
    id: 'ruleOfSquare', fact: 'outsideSquare', name: 'the rule of the square',
    notes: {
      introduce: 'Outside the pawn\'s square, the king cannot catch it.',
      reinforce: 'Count the race before you move.',
    },
    cues: ['Can the black king catch the pawn?', 'How many moves does each side need in the race?'],
    remember: 'Outside the square, the king cannot catch the pawn.',
  },
]);

/** Where a usual rule does not hold: a rook pawn (a- or h-file) for the opposition and the key squares. */
function exceptions(fen) {
  if (!isPawnEnding(fen)) return [];
  return pos(fen).pawns.some((p) => file(p) === 0 || file(p) === 7)
    ? [{ id: 'rookPawn', concepts: ['opposition', 'keySquare'], text: 'An a- or h-pawn: the usual rules change.' }]
    : [];
}

module.exports = {
  facts: (fen) => (isPawnEnding(fen) ? pawnFacts(fen) : []),
  plausible: (fen) => (isPawnEnding(fen) ? plausibleMoves(fen) : null), // null: no heuristic for other material
  phrases, concepts, exceptions, isPawnEnding,
};
