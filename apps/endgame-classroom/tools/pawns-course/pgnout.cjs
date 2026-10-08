// Writes the two-connected-pawns course PGN: lesson texts, a teaching note on every learner move (and on
// the opponent's moves where they matter), and board marks, all derived from the verified lines. Then it
// reads the file back and checks every line again.
const path = require('path');
const { Chess } = require('chess.js');
const { file, rank, dist, sqName: n, sqIdx, directOpp } = require('../course-kit/board.cjs');
const { pos, fenAfter, queenSq, pawnName, protectedBy, catches, kingSquares, stalemateMoves, orList, sq, oneColourPerSquare, withoutHiddenArrows, failedQueenNotes } = require('../course-kit/pawn/teach.cjs');
const { probePromotion } = require('../course-kit/solver.cjs');
const { moveComment, formatMarks, writePgn, checkCourse } = require('../course-kit/pgn.cjs');
const VERIFY = require('./verify-opts.cjs');
const lines = require('./.out/lines.json');

const OUT = path.join(__dirname, '../../courses/connected-pawns-course.pgn');
const ORDER = ['finish', 'side', 'grab', 'chain', 'escort', 'stalemate', 'exam', 'practice'];

const LESSONS = {
  finish: { title: 'Promote safely',
    intro: 'Welcome! Two connected pawns stand side by side, or one diagonally behind the other, so they can protect each other. Every line ends when a pawn becomes a safe queen: the black king cannot take it, and the black king still has a move (otherwise it is stalemate, only a draw). First the finish: which pawn goes, and when?',
    colours: 'Green: the queening squares. Blue: the squares the black king can step to.' },
  side: { title: 'Side by side: the king cannot stop both',
    intro: 'Two pawns side by side guard the squares in front of each other. When the black king comes up beside them, push the pawn it cannot reach: it cannot stop both, and your own king does not even need to help.',
    colours: 'Green: the queening squares. Blue: the squares the black king can step to.' },
  grab: { title: 'If the king takes one, the other runs',
    intro: 'The black king can win one of your pawns. Let it! While it is busy taking one, the other pawn runs to the queening square, and the king is too far behind to catch it. Push the right pawn and count the moves.',
    colours: 'Green: the runner\'s way to the queening square. Red: the pawn the king is going to take.' },
  chain: { title: 'The chain protects itself: bring your king',
    intro: 'With the black king in front of them, two pawns cannot promote on their own. But they do not need help to survive: the back pawn protects the front one, and when the king goes for the back pawn, the front one runs. So the pawns wait, and your king walks over to help.',
    colours: 'Blue: the squares the black king can step to. Green: where your king is heading.' },
  escort: { title: 'Escort them with your king',
    intro: 'With your king next to them, the pawns march up together. The king goes in front or beside them and takes squares away from the black king; the pawns move up when it is safe.',
    colours: 'Green: the queening square. Blue: the squares the black king can step to.' },
  stalemate: { title: 'Don\'t stalemate!',
    intro: 'Near the edge, the lone king is often short of squares. Before every move ask: does the black king still have a move? If it has none and is not in check, it is stalemate, and the game is only a draw.',
    colours: 'Blue: the squares the black king can step to. Red arrow: a natural move that would be stalemate.' },
  exam: { title: 'Final exam',
    intro: 'Final exam! No colours and no hints this time. Sometimes the pawns run alone, sometimes your king has to help. Make a safe queen as fast as you can.',
    colours: '' },
  practice: { title: 'Extra practice',
    intro: 'Extra practice: no explanations, just positions. Make a safe queen as fast as you can.',
    colours: '' },
};

const GROUPS = {
  'fin-1': { first: 'Both pawns can become a queen right now, but only one of the new queens is safe.',
    again: ['One move to a queen. Which one is safe?', 'Two queens to choose from: one of them would be stalemate.'],
    desc: 'Before you promote, check that the new queen is safe and that the black king still has a move.' },
  'fin-2': { first: 'Two moves to a queen. Which pawn gets there first?',
    again: ['Two moves to a queen again.', 'The black king is coming. Which pawn wins the race?'],
    desc: 'Push the pawn that reaches the queening square first, out of the king\'s reach.' },
  'fin-3': { first: 'Three moves to a queen.', again: 'Three moves to a queen again.',
    desc: 'Count the moves: the pawn that gets there first, safely.' },
  'side-2': { first: 'The black king is next to your pawns. Which pawn goes forward?',
    again: ['Which pawn can the king not reach?', 'Push the pawn the king cannot stop.', 'The king is beside the pawns again.'],
    desc: 'Side by side: push the pawn the king cannot reach; it cannot stop both.' },
  'side-3': { first: 'One step further from the queening squares. The same question: which pawn?',
    again: ['Which pawn is out of the king\'s reach?', 'Count the moves of both pawns and of the king.', 'Side by side again: which pawn runs?'],
    desc: 'Side by side: push the pawn the king cannot reach; it cannot stop both.' },
  grab: { first: 'The black king is close to your pawns. Push the pawn that runs away from it.',
    again: ['The king will take one pawn. Make sure it is the slow one.', 'Which pawn runs, and which one do you leave behind?', 'Let the king have one pawn: the other one queens.'],
    desc: 'If the king takes one pawn, the other runs: push the pawn that is out of its reach.' },
  chain: { first: 'The black king blocks your pawns. They can wait: bring your king.',
    again: ['The pawns hold on their own. Where does your king go?', 'Your king is far away. Walk it over; the pawns can wait.', 'The black king is in front again: king first, pawns later.'],
    desc: 'The chain holds on its own: the pawns wait while the king walks over to help.' },
  escort: { first: 'King and pawns together: march them up.',
    again: ['Escort the pawns to the queening square.', 'King in front, pawns behind: up the board.', 'Your king is next to the pawns. Bring them home.'],
    desc: 'The king takes squares from the black king; the pawns move up when it is safe.' },
  stalemate: { first: 'The black king is in the corner with hardly a square. One careless move and it is stalemate.',
    again: ['Short of squares again: leave the king a move.', 'Count the black king\'s squares before you move.'],
    desc: 'Before a quiet move near the corner, check that the black king still has a move.' },
  'st-rook': { first: 'Promote right now, but count the black king\'s squares first.',
    desc: 'If a new queen would be stalemate, take a rook: it wins just as surely.' },
  'ex-far': { first: 'Your king is far away.', again: 'Your king is far away again.', desc: 'Pawns alone, or bring the king: count first.' },
  'ex-esc': { first: 'Your king is near its pawns.', again: 'King and pawns together.', desc: 'Escort the pawns with your king.' },
  'ex-grab': { first: 'The black king is after your pawns.', again: 'The black king is close again.', desc: 'One pawn may fall; the other one queens.' },
  'pr-near': { first: 'King and two pawns.', again: 'King and two pawns.', desc: 'Two connected pawns: a safe queen.' },
  'pr-far': { first: 'Two pawns, the king far away.', again: 'Two pawns, the king far away.', desc: 'Two connected pawns: a safe queen.' },
};

// ---------- marks (shown before the learner's move) ----------
function marksFor(l, i) {
  const m = l.moves[i], fen = m.fenBefore, s = pos(fen);
  const none = { squares: [], arrows: [] };
  if (l.lesson === 'exam' || l.lesson === 'practice') return none;
  const blue = sq(kingSquares(fen), 'B');
  if (l.lesson === 'finish' || l.lesson === 'side') return { squares: [...sq(s.pawns.map(queenSq), 'G'), ...blue], arrows: [] };
  if (l.lesson === 'escort') return { squares: [...sq([queenSq(sqIdx(l.moves[l.moves.length - 1].from))], 'G'), ...blue], arrows: [] };
  if (l.lesson === 'stalemate') return { squares: blue, arrows: [...new Set(stalemateMoves(fen).map((t) => `R${t.from}${t.to}`))] };
  if (l.lesson === 'grab') {
    // the runner (the pawn that promotes) and the pawn the king takes later in the line
    const runnerFile = l.moves[l.moves.length - 1].from[0];
    const runner = s.pawns.find((p) => 'abcdefgh'[file(p)] === runnerFile);
    const path = [];
    for (let t = runner + 8; t < 64; t += 8) path.push(t);
    const later = l.moves.slice(i).find((x) => x.capture);
    return { squares: [...sq(path, 'G'), ...(later ? sq([later.to], 'R') : [])], arrows: [] };
  }
  if (l.lesson === 'chain') {
    // while the king is still walking: where it is heading (its square when the first pawn moves)
    const firstPawn = l.moves.findIndex((x) => x.side === 'w' && x.piece === 'p');
    if (i >= firstPawn) return { squares: blue, arrows: [] };
    return { squares: [...sq([pos(l.moves[firstPawn].fenBefore).wk], 'G'), ...blue], arrows: [] };
  }
  return none;
}

// ---------- notes ----------
function finalNote(l, m) {
  const a = pos(fenAfter(m.fenBefore, m.san)), to = sqIdx(m.to);
  if (m.promotion === 'r') return 'Rook! A new queen would have taken the black king\'s last square: stalemate. The rook leaves it a square, and the rook wins just as surely.';
  const guard = protectedBy(a, to);
  const why = guard ? `${guard[0].toUpperCase()}${guard.slice(1)} protects the new queen` : 'The black king is too far away to take the new queen';
  const not = l.lesson === 'exam' || l.lesson === 'practice' ? [] : failedQueenNotes(m.fenBefore, m.from);
  return [`Queen! ${why}${m.san.endsWith('#') ? ', and it is even checkmate!' : '. With a queen, the win is easy from here.'}`, ...not].join(' ');
}

function notesFor(l) {
  const notes = l.moves.map(() => []);
  const said = new Map();
  const say = (i, key, first, again) => { const k = said.get(key) ?? 0; said.set(key, k + 1); notes[i].push(k === 0 || !again ? first : again); };
  const capAt = l.moves.findIndex((x) => x.capture);
  // a pawn the black king attacked is protected now (by the move just played)
  const also = (i, b, a) => {
    for (const p of b.pawns) if (a.pawns.includes(p) && dist(b.bk, p) === 1 && !protectedBy(b, p) && protectedBy(a, p)) notes[i].push(`It also protects the pawn on ${n(p)}, which the king attacked.`);
  };
  const lastFrom = sqIdx(l.moves[l.moves.length - 1].from);
  l.moves.forEach((m, i) => {
    const b = pos(m.fenBefore), aFen = fenAfter(m.fenBefore, m.san), a = pos(aFen);
    if (m.side === 'b') {
      if (m.capture) {
        const runner = a.pawns[0];
        const rest = l.moves.slice(i + 1).filter((x) => x.side === 'w');
        if (rest.every((x) => x.piece === 'p') && !catches({ ...a, bk: a.bk }, runner))
          notes[i].push(`The king takes the pawn on ${m.to}, but now the ${pawnName(runner)} runs, and the king is too far behind to catch it.`);
        else notes[i].push(`The king takes the pawn on ${m.to}. One pawn is still enough here.`);
        return;
      }
      const promotesNext = !!l.moves[i + 1]?.promotion;
      if (!promotesNext && l.lesson !== 'finish' && l.lesson !== 'side') for (const p of a.pawns) if (dist(a.bk, p) === 1 && !protectedBy(a, p)) { say(i, 'attack', `The king attacks the pawn on ${n(p)}!`, `The pawn on ${n(p)} is attacked again.`); break; }
      if (l.lesson === 'stalemate' && i < l.moves.length - 1) {
        const traps = stalemateMoves(aFen).map((t) => t.san);
        if (traps.length) notes[i].push(`Careful: ${orList(traps)} would be stalemate.`);
      }
      return;
    }
    if (i === 0 && l.lesson === 'stalemate' && m.promotion !== 'r') {
      const traps = stalemateMoves(m.fenBefore).map((t) => t.san);
      if (!traps.length) throw new Error(`${l.fen}: a stalemate line without a stalemate trap`);
      notes[i].push(`Not ${orList(traps)}: ${traps.length === 1 ? 'that leaves' : 'each of them leaves'} the black king without a move, and it is stalemate!`);
    }
    if (m.promotion) { notes[i].push(finalNote(l, m)); return; }
    if (m.piece === 'k') {
      const near = (s) => Math.min(...s.pawns.map((p) => dist(s.wk, p)));
      const lead = Math.max(...a.pawns.map(rank));
      const leader = a.pawns.find((p) => rank(p) === lead);
      if (rank(leader) === 6 && dist(a.wk, queenSq(leader)) === 1) { notes[i].push(`Your king guards ${n(queenSq(leader))}: now the pawn can promote safely.`); also(i, b, a); return; }
      if (near(a) >= 2 && l.lesson !== 'escort' && a.pawns.length === 2) {
        // the pawns hold while the king walks over: say only what is true right now
        const [p1, p2] = a.pawns;
        const front = rank(p1) > rank(p2) ? p1 : p2, back = front === p1 ? p2 : p1;
        let why = 'the black king is too far away to harm them';
        if (Math.min(dist(a.bk, p1), dist(a.bk, p2)) <= 2) {
          const parts = [];
          if (rank(front) === rank(back) + 1) parts.push(`the king cannot take the ${pawnName(front)}, the ${pawnName(back)} protects it`);
          if (dist(a.bk, back) === 1 && !protectedBy(a, back)) {
            // if it took the back pawn: is it still a win (the front pawn runs, or your king comes)?
            const g = new Chess(aFen); g.move({ from: n(a.bk), to: n(back) });
            if (probePromotion(g.fen()).result === 'win') parts.push(`and taking the ${pawnName(back)} would not save Black`);
          }
          if (parts.length) why = parts.join(', ');
          else why = 'the black king cannot take either of them';
        }
        // in the chain lesson the walk has a target: the king's square when the first pawn moves
        const firstPawn = l.moves.findIndex((x) => x.side === 'w' && x.piece === 'p');
        const target = l.lesson === 'chain' && firstPawn > i ? pos(l.moves[firstPawn].fenBefore).wk : -1;
        const steps = (k) => `${k} step${k === 1 ? '' : 's'}`;
        if (target < 0) { say(i, 'walk', `The pawns hold on their own: ${why}. So your king walks over to help.`, near(a) <= 2 ? 'The king is almost there.' : 'The king keeps walking towards the pawns.'); return; }
        const d0 = dist(b.wk, target), d1 = dist(a.wk, target);
        if (!said.has('walk')) { say(i, 'walk', `The pawns hold on their own: ${why}. So your king walks over to help: it is heading for ${n(target)}${d1 ? `, ${steps(d1)} away` : ''}.`); return; }
        if (d1 === 0) notes[i].push(`The king has arrived on ${n(target)}: now the pawns can move up.`);
        else if (d1 < d0) notes[i].push(`The king keeps walking: ${steps(d1)} from ${n(target)}.`);
        else if (dist(b.bk, target) === 1) notes[i].push(`Your king goes round: the black king guards ${n(target)}.`);
        else notes[i].push(`Your king goes round on its way to ${n(target)}.`);
        return;
      }
      if (directOpp(a.wk, a.bk) && near(a) <= 1 && rank(a.bk) > lead) { say(i, 'opp', 'Opposition! The kings face each other with one square between them, and the black king has to give way.', 'Opposition again: the black king has to give way.'); also(i, b, a); return; }
      if (rank(a.wk) > lead) { say(i, 'lead', 'The king goes ahead of the pawns: it clears the way and takes squares from the black king.', 'The king leads the way again.'); also(i, b, a); return; }
      if (near(a) < near(b)) { say(i, 'closer', 'Your king comes closer to its pawns.', 'The king comes closer again.'); also(i, b, a); return; }
      say(i, 'wait', 'A king move: the pawns stay protected, and now Black has to move.', 'Another king move: Black has to move again.');
      also(i, b, a);
      return;
    }
    // a pawn move
    const to = sqIdx(m.to);
    const other = a.pawns.find((p) => p !== to);
    if (m.san.includes('+')) { say(i, 'check', 'Check! The pawn drives the black king back.', 'Check again: the king has to step back.'); return; }
    if (l.lesson === 'grab' && capAt > i) {
      say(i, 'runner', `Push the runner! The king may take the ${pawnName(other)}, but then the ${pawnName(to)} is too far ahead for it.`, 'Forward again: the king is busy with the other pawn.');
      return;
    }
    if (other === undefined || l.lesson === 'side' || l.lesson === 'finish') {
      // a pawn that runs: out of the king's reach (the rule of the square), or covered by the other pawn or the king
      if (!catches(a, to)) { say(i, 'run', `The ${pawnName(to)} goes: the black king is too far from ${n(queenSq(to))} to stop it.`, `The ${pawnName(to)} keeps running.`); return; }
      const guard = protectedBy(a, to);
      if (guard) { say(i, 'covered', `The ${pawnName(to)} moves up, protected by ${guard}.`, `Up again, protected by ${guard}.`); return; }
    }
    const guard = protectedBy(a, to);
    if (rank(to) === 6) { notes[i].push(`The ${pawnName(to)} reaches the 7th rank${guard ? `, protected by ${guard}` : ''}: one more step.`); also(i, b, a); return; }
    if (guard) { say(i, 'up-guarded', `The ${pawnName(to)} moves up, protected by ${guard}.`, `Up again, protected by ${guard}.`); also(i, b, a); return; }
    if (to === lastFrom) { say(i, 'up', `The ${pawnName(to)} moves up: it will be the one to queen.`, `The ${pawnName(to)} moves up again.`); return; }
    say(i, 'up', `The ${pawnName(to)} moves up.`, `The ${pawnName(to)} moves up again.`);
  });
  return notes;
}

// ---------- assemble ----------
const games = [];
let lessonNo = 0;
for (const id of ORDER) {
  lessonNo++;
  const group = lines.filter((l) => l.lesson === id);
  if (!group.length) throw new Error(`lesson ${id} has no lines`);
  const L = LESSONS[id];
  group.forEach((l, gi) => {
    const G = GROUPS[l.group];
    const firstOfGroup = group.findIndex((x) => x.group === l.group) === gi;
    const parts = [];
    if (gi === 0) parts.push(L.intro);
    // later lines of a group take turns among a few intros, so they don't all start the same way
    const nth = group.slice(0, gi).filter((x) => x.group === l.group).length;
    parts.push(firstOfGroup || !G.again ? G.first : [].concat(G.again)[(nth - 1) % [].concat(G.again).length]);
    if (gi === 0 && L.colours) parts.push(L.colours);
    let notes = notesFor(l);
    // the exam comments only on the result; the extra practice has no explanations at all
    if (id === 'exam') notes = notes.map((arr, i) => (i === l.moves.length - 1 ? arr : []));
    if (id === 'practice') notes = notes.map((arr, i) => (i === l.moves.length - 1 ? ['Queen!'] : []));
    const moveMarks = l.moves.map(() => ({ squares: [], arrows: [] }));
    let introMarks = { squares: [], arrows: [] };
    l.moves.forEach((m, i) => {
      if (m.side !== 'w') return;
      // one colour per square; no arrow on the move to play (the app draws that move there and hides the mark)
      const mk = withoutHiddenArrows(oneColourPerSquare(marksFor(l, i)), m);
      if (i === 0) introMarks = mk; else moveMarks[i - 1] = mk;
    });
    games.push({
      name: `${String(lessonNo).padStart(2, '0')}. ${L.title} (${gi + 1}/${group.length})`,
      description: G.desc,
      fen: l.fen,
      intro: [formatMarks(introMarks), parts.join(' ')].filter(Boolean).join(' '),
      moves: l.moves.map((m, i) => ({ san: m.san, comment: moveComment(moveMarks[i], m.also, notes[i].filter(Boolean).join(' ')) })),
    });
  });
}
writePgn(OUT, games);

// ---------- read the file back and check it all again ----------
const { problems, stats } = checkCourse(OUT, {
  count: lines.length,
  verify: VERIFY,
  learner: 'w',
  noMarks: (name) => name.includes('Final exam') || name.includes('Extra practice'),
  finalNote: /^(\[%[^\]]*\] )*(Queen|Rook)!/,
});
for (const p of problems) console.log('PROBLEM', p);
console.log(`wrote ${stats.lines} lines to ${path.relative(process.cwd(), OUT)}; read back and re-verified: ` +
  `${stats.learnerMoves} learner moves, ${stats.unique} unique (${stats.pct}%), ` +
  `${stats.withAlso} with [%also] (${stats.alsoTotal} alternatives); problems: ${problems.length}`);
if (problems.length) {
  console.error(`pgnout: ${problems.length} problem(s) in the written course`);
  process.exit(1);
}
