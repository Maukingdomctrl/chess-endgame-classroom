// The words of the Direct Opposition course: lesson titles and intros (one lesson per phase of the blueprint),
// what each line asks for, the idea named at full help, the cues, and the takeaway of every slot. Every claim
// a text makes about its position is checked against the line's classification and the solver (claims()),
// so a takeaway such as "Black must give way" only appears where the solver shows it.
const { createConcepts } = require('../course-kit/teach/concepts.cjs');
const domain = require('../course-kit/pawn/domain.cjs');
const { squares, F, R } = require('./keys.cjs');

const COURSE_INTRO = 'Welcome! This course teaches one idea: the direct opposition. Two kings on one file with one square between them cannot step forward, so the side that has to move must give way. You play White in every line, to the end.';

const LESSONS = {
  introduction: { title: 'What the opposition is',
    intro: 'Every help is on in this lesson: the idea in words, a question to guide you, and colours on the board.' },
  guided: { title: 'How to take the opposition',
    intro: 'Now you find the move that takes the opposition. It is not always straight ahead: sometimes it is a diagonal step, sometimes a step to the side.' },
  reinforcement: { title: 'From every position',
    intro: 'The same idea from new places: the black king beside the pawn\'s file, Black moving first, longer walks. Sometimes several moves win, and one of them takes the opposition.' },
  application: { title: 'On the way to the queen',
    intro: 'Use the opposition on the way to the queen: take it again each time Black gives way. But first check two things: does the pawn need protection, and can it simply run?' },
  variation: { title: 'Along a rank, and in defence',
    intro: 'The kings can also face each other along a rank, side by side. And the defender uses the same idea: against Black\'s pawn, the opposition holds the draw.' },
  independent: { title: 'On your own',
    intro: 'From here on there are no hints before your move. Each position asks for something else; you still get feedback after each move.' },
  calculation: { title: 'Long lines',
    intro: 'Long lines with tempting moves at many moments. Stay accurate all the way to the queen, or to the draw.' },
  assessment: { title: 'Final assessment',
    intro: 'Final assessment: eight positions, one of each kind. No hints, and no feedback until the end of each line.' },
};

/** The colours, said once where marks first appear (the marks are red arrows on tempting moves that fail). */
const legend = (l) => (l.task === 'defend' ? 'Red arrows: tempting moves that lose.' : 'Red arrows: tempting moves that only draw.');

const pawnSquare = (fen) => { const s = squares(fen); return 'abcdefgh'[F(s.p)] + (R(s.p) + 1); };
/** What the line asks for, without a hint. */
function situation(l) {
  const sq = pawnSquare(l.fen);
  if (l.task === 'defend') return `Black's pawn is on ${sq}. You are White: hold the draw.`;
  if (l.task === 'retake') return `Pawn on ${sq}. Black moves first; then win.`;
  return `Pawn on ${sq}. White to move and win.`;
}

/** The idea named, at full help (3). Slot-specific where the slot's point is the shape of the step. */
const IDEA = {
  3: 'Take the opposition. This time the step is not straight.',
  12: 'Take the opposition. The straight step is not the right one here.',
  13: 'Take the opposition. The right king move does not always go forward.',
  15: 'Take the opposition with the step that leaves Black to move.',
};
function idea(l) {
  if (IDEA[l.n]) return IDEA[l.n];
  if (l.task === 'retake') {
    const z = l.zugzwang;
    if (!z || z.side !== 'b' || z.withMove !== 'win') throw new Error(`slot ${l.n}: a Black-moves-first line without the solver's zugzwang`);
    return `You have the opposition: Black must move and give way. When Black steps aside, take it again.${z.ifPassed === 'draw' ? ' If it were your move, it would only be a draw.' : ''}`;
  }
  if (l.task === 'defend') return 'The defender uses the same idea: take the opposition to hold the draw.';
  return 'Take the opposition: face the black king with one square between, and Black to move.';
}

/**
 * Cues come from the concept that explains the first move. Protecting the pawn has no concept in the pawn
 * domain yet, so the course brings its own, tied to the same fact (the cues are checked by createConcepts:
 * questions, no square, no move).
 */
const COURSE_CONCEPTS = createConcepts([{
  id: 'protection', fact: 'pawnProtected', name: 'protecting the pawn',
  notes: { introduce: 'Protect the pawn first; the opposition can wait.' },
  cues: ['Is your pawn safe?', 'Can the black king reach your pawn?'],
  remember: 'Protect a pawn the black king can reach.',
}]);
/** The cue for a help level (2-3: the more specific question, 1: the general one), or null. */
function cue(note, help) {
  const level = help >= 2 ? 2 : 1;
  if (note.concept) return domain.concepts.cue(note.concept, level);
  if (note.facts[0] === 'pawnProtected') return COURSE_CONCEPTS.cue('protection', level);
  return null;
}

/** Words course 1 does not use yet (courses 2, 4, 5, 6 teach them): a note that needs them is not shown. */
const UNTAUGHT = /zugzwang|key square|distant|diagonal opposition/i;

/** The takeaway shown when a line is completed, per slot. ${file}: the pawn's file. */
const TAKEAWAY = {
  1: 'Whoever has to move must give way: here Black had to move, and your king got through.',
  2: 'Step straight forward to face the black king, one square between, with Black to move.',
  3: 'A diagonal step can take the opposition too.',
  4: 'When Black steps aside, take the opposition again.',
  5: 'After your move every Black move lets your king forward: Black must give way.',
  6: 'Close to the black king is not enough: the wrong step hands Black the opposition.',
  7: 'King first: pushing the pawn too early only draws.',
  8: 'Take it, Black gives way, take it again: that is how the king walks forward.',
  9: 'With the pawn far back, take the opposition at once.',
  10: 'Take the opposition, Black gives way, your king goes in front, and the pawn queens.',
  11: 'Straight ahead: face the black king with one square between.',
  12: 'When the straight step is wrong, step diagonally.',
  13: 'The right king move does not always go forward: a sideways step can take the opposition.',
  14: 'Answer Black\'s step to the side and keep the opposition.',
  15: 'A diagonal step that takes the opposition makes Black give way.',
  16: 'You found the opposition square without the idea being named.',
  17: 'A sideways step is right when the black king stands to the side.',
  18: 'A diagonal step works with the pawn far back too.',
  19: 'Keeping the opposition is part of taking it.',
  20: 'King before pawn: the early push only draws.',
  21: 'Take the opposition with a diagonal step, and Black must give way.',
  22: 'Even close to the queening square, the opposition decides.',
  23: 'A straight step that leaves Black to move: Black must give way.',
  24: 'Keep the opposition after every step Black takes aside.',
  25: 'The step that only comes close hands Black the opposition: take it yourself.',
  26: 'With the black king on the pawn\'s file, take the opposition in front of it.',
  27: 'The opposition square moves with the black king, even beside the pawn\'s file.',
  28: 'Black moved first: you kept the opposition.',
  29: 'A diagonal step with the pawn far advanced: the same idea, a shorter line.',
  30: 'Several moves win here; taking the opposition is one of them.',
  31: 'Straight ahead, and Black must give way.',
  32: 'A sideways step can start the whole walk.',
  33: 'Read where the black king stands, then take the opposition.',
  34: 'A long walk: take the opposition again after every step aside.',
  35: 'A diagonal step with the pawn far back, found with the question alone.',
  36: 'One straight step decides the whole line.',
  37: 'When several moves win, there is no one magic move.',
  38: 'Take the opposition and Black must give way, even with the pawn far back.',
  39: 'A sideways step, found without marks.',
  40: 'Black moved first: keep the opposition step by step.',
  41: 'On a long approach, take the opposition at every chance.',
  42: 'The opposition opens the way: your king walks in front of the pawn.',
  43: 'Keep the opposition over many moves.',
  44: 'The king leads and the pawn follows: pushing early only draws.',
  45: 'Not always first: protect the pawn, the opposition can wait.',
  46: 'Inside a longer line the opposition still decides: Black must give way.',
  47: 'A diagonal step on the way, then keep the opposition.',
  48: 'If the pawn simply runs, push it: no opposition needed.',
  49: 'A sideways step on the way, then the opposition decides.',
  50: 'Keeping the opposition is a routine: do it to the end.',
  51: 'The classic long win: take the opposition, Black gives way, again and again.',
  52: 'Check whether the pawn needs protection before anything else.',
  53: 'A short line: the opposition decides it in a few moves.',
  54: 'Black had to give way more than once: take the opposition each time.',
  55: 'Count the race before you walk: this pawn runs alone.',
  56: 'The kings can face each other along a rank too.',
  57: 'The opposition along a rank: the same idea, turned sideways.',
  58: 'The idea does not depend on how far the pawn has come.',
  59: 'Along a rank, with the pawn far back.',
  60: 'The opposition square, even with the black king away from the pawn\'s file.',
  61: 'The defender takes the opposition too: it holds the draw.',
  62: 'Defending: the move that holds takes the opposition.',
  63: 'Defending: after your move Black must give way, and the draw holds.',
  64: 'Along a rank, the wrong step hands Black the opposition.',
  65: 'The defender\'s opposition works along a rank too.',
  66: 'The same idea with the pawn on the ${file}-file.',
  67: 'You held the draw with the opposition, without marks.',
  68: 'Several right moves again, and none of them is magic.',
  69: 'Along a rank, with the pawn far advanced.',
  70: 'Defending: after your move Black must give way.',
  71: 'This position asked for the opposition, and you found it alone.',
  72: 'Here the pawn simply ran: no opposition needed.',
  73: 'Defending: the opposition held the draw.',
  74: 'Black moved first: you kept the opposition.',
  75: 'The pawn needed protection first.',
  76: 'The opposition along a rank, found alone.',
  77: 'Several moves won here; the opposition was one of them.',
  78: 'The defender\'s opposition, found alone.',
  79: 'With the pawn far advanced, the opposition still decides.',
  80: 'The pawn ran on its own.',
  81: 'Along a rank with the pawn far back, found alone.',
  82: 'Defending: after your move Black had to give way.',
  83: 'Accuracy over many moves: the opposition again and again.',
  84: 'Black moved first: you kept the opposition all the way.',
  85: 'Every opposition counted: Black had to give way again and again.',
  86: 'The opposition along a rank, in a long line.',
  87: 'A long defence: the opposition held all the way.',
  88: 'One wrong step hands Black the opposition: accuracy from the first move.',
  89: 'Endurance: you kept the opposition to the end.',
  90: 'From far back all the way to the queen.',
  91: 'Defending under pressure: after your move Black had to give way.',
  92: 'Everything at once: take the opposition, keep it, escort the pawn.',
  93: 'The opposition decided this one.',
  94: 'The defender\'s opposition held the draw.',
  95: 'The pawn ran by itself.',
  96: 'Black moved first; keeping the opposition won.',
  97: 'Protecting the pawn came first.',
  98: 'The opposition along a rank decided this one.',
  99: 'Several moves won; the opposition was one of them.',
  100: 'A long line with the opposition at several moments.',
};
function takeaway(l) {
  const t = TAKEAWAY[l.n];
  if (!t) throw new Error(`slot ${l.n}: no takeaway`);
  return t.replace('${file}', pawnSquare(l.fen)[0]);
}

/**
 * What the texts of a line claim about it, checked against the classification of the real line (build.cjs)
 * and the slot's task: [] or the claims that are not true.
 */
function claims(l, texts) {
  const t = texts.join(' ');
  const c = l.classified ?? {};
  const s = squares(l.fen);
  const rank = l.task === 'defend' ? 8 - R(s.p) : R(s.p) + 1;
  const zz = l.difficulty.signals.zugzwangsSet;
  const out = [];
  const need = (re, ok, what) => { if (re.test(t) && !ok) out.push(`says "${t.match(re)[0]}" but ${what}`); };
  need(/must give way/i, c.givesWay || l.task === 'retake', 'the solver shows no zugzwang after the first move');
  need(/had to give way/i, c.givesWay || zz >= 1, 'the solver shows no zugzwang in the line');
  need(/again and again|more than once/i, zz >= 2 || !/give way/.test(t), `Black is in zugzwang ${zz} time(s)`);
  need(/diagonal step|step diagonally/i, c.shape === 'diagonal', `the first step is ${c.shape}`);
  need(/sideways step/i, c.shape === 'sideways', `the first step is ${c.shape}`);
  need(/step straight|straight ahead|one straight step/i, c.shape === 'straight', `the first step is ${c.shape}`);
  need(/along a rank/i, c.orientation === 'horizontal', 'the opposition is on a file');
  need(/pushing (the pawn )?(too )?early|early push/i, c.trapIsPush, 'no tempting pawn push draws');
  need(/hands Black the opposition/i, c.trapGivesOpposition, 'no tempting step hands Black the opposition');
  need(/pawn far back/i, rank <= 3, `the pawn is on its rank ${rank}`);
  need(/pawn far advanced/i, rank >= 5, `the pawn is on its rank ${rank}`);
  need(/Black moved first|Black moves first/i, l.task === 'retake', 'White moves first');
  need(/[Ss]everal (right )?moves/i, l.task === 'either', 'only one move wins as fast');
  need(/protect/i, l.task === 'protect', 'the first move does not protect the pawn');
  need(/\b(runs|ran)\b/i, l.task === 'push', 'the pawn does not simply run');
  need(/defend|holds? the draw|held the draw|the draw holds/i, l.task === 'defend', 'this line is a win');
  need(/on the pawn's file/i, c.defender === 'onFile', 'the black king is not on the pawn\'s file');
  need(/beside the pawn's file/i, c.defender === 'besideFile', 'the black king is not beside the pawn\'s file');
  need(/away from the pawn's file/i, c.defender === 'away', 'the black king is not away from the pawn\'s file');
  return out;
}

module.exports = { COURSE_INTRO, LESSONS, legend, situation, idea, cue, UNTAUGHT, takeaway, claims, pawnSquare };
