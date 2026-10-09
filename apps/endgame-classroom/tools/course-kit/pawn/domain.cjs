// The pawn endings' vocabulary for the teaching layer (../teach/): which facts the board shows (teach.cjs
// pawnFacts), how to say them in a few words, which concepts they stand for, and where a usual rule has an
// exception. The teaching layer stays generic; everything about pawns is here.
//
//   const { createExplainer } = require('../teach/explain.cjs');
//   const ex = createExplainer({ verify, domain: require('./domain.cjs') });
//
// Phrases are written for the learner as White (the owner's rule), with the pawns (attacking) or against
// Black's pawns (defending). gain: the learner's move creates the fact (said as advice); keep: it was
// there and stays; give: the opponent gets it (after a mistake, or by its reply); lose: a fact of the
// learner's that disappears. A phrase may return undefined to fall back to the generic one.
//
// Black's pawns against the lone white king are read by turning the board round (ranks reversed, colours
// swapped): the facts are the same facts with the sides swapped back.
const { file } = require('../board.cjs');
const { pawnFacts, plausibleMoves, pos } = require('./teach.cjs');
const { createConcepts } = require('../teach/concepts.cjs');

const board = (fen) => fen.split(' ')[0];
/** Only White's pawns against the lone black king. */
const isPawnEnding = (fen) => /^[KkP1-8/]+$/.test(board(fen)) && /P/.test(board(fen));
/** The side with the pawns, when only one side has pawns and nothing but kings besides: 'w' | 'b' | null. */
const pawnSide = (fen) => (isPawnEnding(fen) ? 'w' : /^[Kkp1-8/]+$/.test(board(fen)) && /p/.test(board(fen)) ? 'b' : null);
const other = (c) => (c === 'w' ? 'b' : 'w');
/** The board turned round: ranks reversed, colours swapped (Black's pawns become White's, moving up). */
function flipFen(fen) {
  const [b, stm] = fen.split(' ');
  const rows = b.split('/').reverse().map((r) => r.replace(/[a-zA-Z]/g, (c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())));
  return `${rows.join('/')} ${other(stm)} - - 0 1`;
}
const flipSquares = (text) => text.replace(/([a-h])([1-8])/g, (_, f, r) => f + (9 - +r));
/** A fact read on the turned board, told for the real one. */
const unflip = (f) => ({
  ...f, side: other(f.side), key: f.key.replace(/:([wb])$/, (_, c) => `:${other(c)}`),
  ...(f.pawn && { pawn: flipSquares(f.pawn) }), ...(f.square && { square: flipSquares(f.square) }),
  ...(f.moves && { moves: f.moves.map(flipSquares) }), ...(f.by && { by: f.by === 'your king' ? "Black's king" : f.by }),
});
function facts(fen) {
  const side = pawnSide(fen);
  return side === 'w' ? pawnFacts(fen) : side === 'b' ? pawnFacts(flipFen(fen)).map(unflip) : [];
}
function plausible(fen) {
  const side = pawnSide(fen);
  return side === 'w' ? plausibleMoves(fen) : side === 'b' ? plausibleMoves(flipFen(fen)).map(flipSquares) : null; // null: no heuristic for other material
}
const kindWord = (f) => (f.kind === 'direct' ? '' : `${f.kind} `);
const fileOf = (f) => `${f.pawn[0]}-pawn`;
const cap = (t) => t[0].toUpperCase() + t.slice(1);
/** The learner (side f.side) has the direct opposition in the position the fact belongs to. */
const withDirectOpposition = (f, ctx) => ctx?.facts?.some((x) => x.id === 'opposition' && x.kind === 'direct' && x.side === f.side);

const phrases = {
  // the order a reason is chosen in, when a move creates several
  priority: ['keySquare', 'opposition', 'outsideSquare', 'pawnAttacked', 'pawnProtected', 'blockade'],
  gain: {
    opposition: (f) => `Take the ${kindWord(f)}opposition.`,
    keySquare: () => 'Your king reaches a key square.',
    outsideSquare: (f) => `The ${fileOf(f)} runs: the king cannot catch it.`,
    pawnProtected: (f) => (f.by === 'your king' ? `Your king protects the ${fileOf(f)}.` : `${cap(f.by)} protects the ${fileOf(f)}.`),
    // defending against Black's pawn
    blockade: (f) => `Your king blocks the ${fileOf(f)}.`,
    pawnAttacked: (f) => `Your king attacks the ${fileOf(f)}.`,
    // the solver's zugzwang right after taking the direct opposition: the other king has to step aside
    zugzwang: (f, ctx) => (withDirectOpposition(f, ctx) ? 'Black must give way.' : undefined),
  },
  keep: {
    opposition: (f) => `Keep the ${kindWord(f)}opposition.`,
    keySquare: () => 'Your king stays on a key square.',
    pawnProtected: (f) => (f.by === 'your king' ? `Your king keeps the ${fileOf(f)} protected.` : `${cap(f.by)} keeps the ${fileOf(f)} protected.`),
    blockade: (f) => `Your king stays in front of the ${fileOf(f)}.`,
  },
  give: {
    opposition: (f) => `Black gets the ${kindWord(f)}opposition.`,
    pawnAttacked: (f) => `Black's king attacks the ${fileOf(f)}.`,
    blockade: (f) => `Black's king blocks the ${fileOf(f)}.`,
    // attacking with Black's pawn
    keySquare: () => "Black's king reaches a key square.",
    outsideSquare: (f) => `The ${fileOf(f)} runs: your king cannot catch it.`,
    pawnProtected: (f) => `${cap(f.by)} protects the ${fileOf(f)}.`,
  },
  lose: {
    opposition: () => 'You give up the opposition.',
    keySquare: () => 'Your king leaves the key squares.',
    outsideSquare: (f) => `Now the king can catch the ${fileOf(f)}.`,
    pawnProtected: (f) => `The ${fileOf(f)} is left unprotected.`,
    blockade: (f) => `Your king steps out of the ${fileOf(f)}'s way.`,
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
  if (!pawnSide(fen)) return [];
  return pos(fen).pawns.some((p) => file(p) === 0 || file(p) === 7)
    ? [{ id: 'rookPawn', concepts: ['opposition', 'keySquare'], text: 'An a- or h-pawn: the usual rules change.' }]
    : [];
}

module.exports = { facts, plausible, phrases, concepts, exceptions, isPawnEnding, pawnSide, flipFen };
