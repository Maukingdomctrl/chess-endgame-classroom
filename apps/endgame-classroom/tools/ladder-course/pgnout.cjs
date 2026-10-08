// Writes the ladder-mate course PGN: lesson texts, a teaching note on every learner move (and on the
// opponent's moves where they matter), and board marks, all derived from the verified lines. Then it
// reads the file back and checks every line again.
const path = require('path');
const { Chess } = require('chess.js');
const { table } = require('../course-kit/solver.cjs');
const { file, rank, dist, sqName: n, sqIdx, isCorner } = require('../course-kit/board.cjs');
const { formatMarks, moveComment, writePgn, checkCourse } = require('../course-kit/pgn.cjs');
const { box, guarded } = require('./geometry.cjs');
const VERIFY = require('./verify-opts.cjs');
const lines = require('./.out/lines.json');

const OUT = path.join(__dirname, '../../courses/ladder-mate-course.pgn');
const ORDER = ['picture', 'ladder-rr', 'switch', 'ladder-qr', 'stalemate', 'exam', 'practice'];
const MATERIAL = { rr: 'KRRK', qr: 'KQRK' };
const NAME = { rr: ['rook', 'rook'], qr: ['queen', 'rook'] }; // the pieces 2 and 3

const LESSONS = {
  picture: { title: 'The final picture',
    intro: 'Welcome to the ladder mate! Two heavy pieces (two rooks, or a queen and a rook) can mate the lone king without any help from your own king. First the goal: what the mate looks like on the edge of the board.',
    colours: 'Blue: the squares the black king can step to. Find the check that takes them all away.' },
  'ladder-rr': { title: 'The ladder with two rooks',
    intro: 'The ladder (also called the lawnmower): one rook holds a row, the "wall", so the king cannot go back; the other rook gives check one row further, so the king has to climb. Then the rooks swap roles, row by row, until the king is mated on the edge. Your king stays at home.',
    colours: 'Blue: the box, every square the black king can still reach. Watch it shrink row by row.' },
  switch: { title: 'The king attacks a rook: switch sides',
    intro: 'The black king will try to catch a rook that stands near it. Don\'t defend the rook and don\'t give up the row: move it along the same row to the far side of the board, out of the king\'s reach. The wall stays, and the ladder goes on.',
    colours: 'Blue: the box, every square the black king can still reach.' },
  'ladder-qr': { title: 'The ladder with queen and rook',
    intro: 'Queen and rook climb the same ladder, only faster: the queen covers rows, columns and diagonals at once. One piece holds the wall, the other checks one row further, until the king is mated on the edge.',
    colours: 'Blue: the box, every square the black king can still reach.' },
  stalemate: { title: 'Don\'t stalemate!',
    intro: 'With two heavy pieces it is easy to take every square from the king without giving check: that is stalemate, and the game is a draw. Before each quiet move, make sure the king still has a square, or that your move gives check.',
    colours: 'Blue: the squares the black king can step to. Red arrow: a natural move that would be stalemate.' },
  exam: { title: 'Final exam',
    intro: 'Final exam! No colours and no hints this time. Usually the pieces do it alone, but now and then the fastest mate needs your king. Find the fastest mate.',
    colours: '' },
  practice: { title: 'Extra practice',
    intro: 'Extra practice: no explanations, just positions. Mate as fast as you can.',
    colours: '' },
};

const GROUPS = {
  'pic-rr-edge': { first: 'Mate in 1 with two rooks: one rook holds the 7th rank, so the other only has to check along the 8th.',
    again: 'Mate in 1 again: the wall on the 7th rank, the check on the 8th.',
    desc: 'The ladder\'s last rung: one rook on the 7th rank, the other checks on the 8th.' },
  'pic-rr-corner': { first: 'Mate in 1 in the corner: the same picture, with the king in the corner.',
    desc: 'Two rooks mate in the corner just as on the edge: wall on the 7th, check on the 8th.' },
  'pic-qr-kiss': { first: 'Mate in 1 with queen and rook: the queen can mate right next to the king when the rook protects it.',
    desc: 'The queen next to the king, protected by the rook: checkmate.' },
  'pic-qr-qedge': { first: 'Mate in 1: the rook holds the 7th rank, the queen checks along the 8th.',
    desc: 'Rook on the 7th, queen on the 8th: checkmate on the edge.' },
  'pic-qr-redge': { first: 'Mate in 1: this time the queen holds the 7th rank and the rook gives the check.',
    desc: 'Queen on the 7th, rook on the 8th: either piece can give the final check.' },
  'pic-rr-m2': { first: 'Mate in 2 with two rooks: first build the picture, then mate.',
    desc: 'Mate in 2: put one rook on the 7th rank, then mate on the 8th.' },
  'pic-qr-m2': { first: 'Mate in 2 with queen and rook: first build the picture, then mate.',
    desc: 'Mate in 2: one piece takes the 7th rank, the other mates.' },
  'lad-rr': { first: 'Climb the ladder: check, then let the other rook take the next row, and so on up to the 8th rank.',
    again: ['Another ladder: wall, check, wall, check, up to the edge.', 'Which rook holds the wall, and which one checks next?',
      'Push the king up row by row. Keep both rooks out of its reach.', 'One rook guards the row, the other climbs past it.'],
    desc: 'The ladder: one rook holds the wall, the other checks one row further; repeat up to the edge.' },
  'sw-rr': { first: 'The black king is next to one of your rooks. Move that rook along its row to the far side of the board.',
    again: ['A rook is under attack again: switch it to the far side, keeping its row.', 'The king has reached a rook. Where does it go?',
      'Keep the row, leave the king behind: the far side of the board.'],
    desc: 'An attacked rook goes to the far side along its row: the wall stays and the king cannot reach it.' },
  'lad-qr': { first: 'Climb the ladder with queen and rook: one piece holds the wall, the other checks one row further.',
    again: ['Another ladder with queen and rook.', 'Queen and rook: which piece holds the wall, which one checks?',
      'Push the king to the edge with queen and rook, row by row.'],
    desc: 'Queen and rook climb the ladder like two rooks, only faster.' },
  'st-rr': { first: 'Two rooks near the king in the corner: one careless quiet move and it is stalemate.',
    again: 'Two rooks again: check, or leave the king a square.',
    desc: 'Before a quiet move with two rooks, check that the king still has a square.' },
  'st-qr': { first: 'The queen takes so many squares that a quiet queen move easily stalemates.',
    again: 'Queen and rook again: careful with quiet queen moves.',
    desc: 'The queen is the piece that stalemates most easily: count the king\'s squares first.' },
  'ex-rr': { first: 'Two rooks: mate as fast as you can.', again: 'Two rooks again.',
    desc: 'Wall and check, row by row: the two-rook mate.' },
  'ex-qr': { first: 'Queen and rook: mate as fast as you can.', again: 'Queen and rook again.',
    desc: 'Queen and rook: the fastest ladder.' },
  'ex-sw': { first: 'Two rooks, and the king is coming for one of them.', again: 'Two rooks, and the king is near a rook again.',
    desc: 'Attacked rook: to the far side, keep the row, keep climbing.' },
  'pr-rr': { first: 'Two rooks.', again: 'Two rooks.', desc: 'Two rooks: checkmate.' },
  'pr-qr': { first: 'Queen and rook.', again: 'Queen and rook.', desc: 'Queen and rook: checkmate.' },
};

// ---------- geometry from a FEN (squares in the solver's table order) ----------
const ord = (r) => ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'][r];
function pos(m, fen) {
  const g = new Chess(fen);
  const s = [-1, -1, -1, -1];
  const second = m === 'qr' ? 'q' : 'r';
  for (const row of g.board()) for (const p of row) {
    if (!p) continue;
    const sq = sqIdx(p.square);
    if (p.type === 'k') s[p.color === 'w' ? 0 : 1] = sq;
    else if (p.type === second && s[2] < 0) s[2] = sq;
    else s[3] = sq;
  }
  return s;
}
const fenAfter = (fen, san) => { const g = new Chess(fen); g.move(san); return g.fen(); };
/** Squares the black king could move to if it were Black's turn. */
function kingSquares(fen) {
  const parts = fen.split(' ');
  parts[1] = 'b'; parts[3] = '-';
  try { return [...new Set(new Chess(parts.join(' ')).moves({ verbose: true }).map((mv) => mv.to))]; } catch { return []; }
}
const stalemateMoves = (fen) => new Chess(fen).moves({ verbose: true }).filter((mv) => { const t = new Chess(fen); t.move(mv.san); return t.isStalemate(); });
/** The rows the black king can still use (counting from its lowest reachable row up to the 8th). */
const rowsLeft = (T, s) => 8 - Math.min(...box(T, s).map(rank));
/** Whether square s lies strictly between x and y on one rank, file or diagonal. */
function between(s, x, y) {
  const df = Math.sign(file(y) - file(x)), dr = Math.sign(rank(y) - rank(x));
  if (df && dr && Math.abs(file(y) - file(x)) !== Math.abs(rank(y) - rank(x))) return false;
  for (let f = file(x) + df, r = rank(x) + dr; f !== file(y) || r !== rank(y); f += df, r += dr) if (f === file(s) && r === rank(s)) return true;
  return false;
}
const orList = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}`);
const sq = (list, c) => list.map((x) => `${c}${typeof x === 'number' ? n(x) : x}`);

function marksFor(l, fen) {
  if (l.lesson === 'exam' || l.lesson === 'practice') return { squares: [], arrows: [] };
  if (l.lesson === 'picture' || l.lesson === 'stalemate') {
    const arrows = l.lesson === 'stalemate' ? [...new Set(stalemateMoves(fen).map((mv) => `R${mv.from}${mv.to}`))] : [];
    return { squares: sq(kingSquares(fen), 'B'), arrows };
  }
  return { squares: sq(box(table(MATERIAL[l.m]), pos(l.m, fen)), 'B'), arrows: [] };
}

// ---------- notes ----------
function mateText(l, a, k) {
  const [p2, p3] = NAME[l.m];
  const name = (j) => (j === 2 ? p2 : p3);
  const other = 5 - k;
  const on = (j) => `the ${name(j)} on ${n(a[j])}`;
  if (dist(a[k], a[1]) === 1 && name(k) === 'queen')
    return `Checkmate! The queen on ${n(a[k])} stands right next to the king, protected by ${on(other)}: the king can neither take it nor run.`;
  if (rank(a[k]) === 7 && rank(a[other]) === 6)
    return `Checkmate! ${cap(on(k))} checks along the 8th rank and ${on(other)} holds the 7th: the king has no square left.`;
  if (rank(a[k]) === 7)
    return `Checkmate! ${cap(on(k))} checks along the 8th rank, and ${on(other)} covers the squares in front of the king.`;
  if (isCorner(a[1])) return `Checkmate in the corner! ${cap(on(k))} gives check and ${on(other)} covers the king's last squares.`;
  return `Checkmate! ${cap(on(k))} gives check and every square around the king is covered.`;
}
const cap = (t) => t[0].toUpperCase() + t.slice(1);

function notesFor(l) {
  const T = table(MATERIAL[l.m]);
  const [p2, p3] = NAME[l.m];
  const name = (j) => (j === 2 ? p2 : p3);
  const notes = l.moves.map(() => []);
  const said = new Map();
  const say = (i, key, first, again) => { const k = said.get(key) ?? 0; said.set(key, k + 1); notes[i].push(k === 0 ? first : again); };
  l.moves.forEach((m, i) => {
    const b = pos(l.m, m.fenBefore), a = pos(l.m, fenAfter(m.fenBefore, m.san));
    if (m.side === 'b') {
      // the king goes for a piece: the cue for the next move
      for (const j of [2, 3]) if (dist(a[j], a[1]) === 1 && !guarded(T, a, j)) { say(i, 'attack', `The king attacks the ${name(j)} on ${n(a[j])}!`, `The ${name(j)} on ${n(a[j])} is attacked again.`); break; }
      // in the stalemate lesson, a new trap is pointed out before the learner's move (with the red arrow)
      if (l.lesson === 'stalemate' && i < l.moves.length - 1) {
        const traps = stalemateMoves(fenAfter(m.fenBefore, m.san)).map((t) => t.san);
        if (traps.length) notes[i].push(`Careful: ${orList(traps)} would be stalemate.`);
      }
      return;
    }
    if (i === 0 && l.lesson === 'stalemate') {
      const traps = stalemateMoves(m.fenBefore).map((t) => t.san);
      if (!traps.length) throw new Error(`${l.fen}: a stalemate line without a stalemate trap`);
      const left = kingSquares(m.fenBefore).length;
      const squares = left === 1 ? "the king's last square" : left === 2 ? "both of the king's squares" : `all ${left} of the king's squares`;
      notes[i].push(left === 0 ? `Not ${orList(traps)}: the king has no square left, so a move without check is stalemate!`
        : traps.length === 1 ? `Not ${traps[0]}: that takes ${squares} without check, and it is stalemate!`
          : `Not ${orList(traps)}: each of them takes ${squares} without check, and it is stalemate!`);
    }
    const k = a.indexOf(sqIdx(m.to)); // 0 = the white king, 2/3 = the pieces (found by square: two rooks look alike)
    if (m.san.endsWith('#')) { notes[i].push(mateText(l, a, k)); return; }
    if (k === 0) { say(i, 'king', 'Your king steps in: here the fastest mate needs its help.', 'The king helps again.'); return; }
    const r0 = rowsLeft(T, b), r1 = rowsLeft(T, a);
    const other = 5 - k;
    if (m.san.includes('+')) {
      const replies = new Chess(fenAfter(m.fenBefore, m.san)).moves({ verbose: true });
      const up = replies.length && replies.every((x) => rank(sqIdx(x.to)) > rank(b[1]));
      const rk = rank(a[k]) === rank(b[1]) ? rank(a[k]) : -1; // a check along the king's row
      if (up && rk >= 0) {
        const wall = rank(a[other]) === rk - 1 ? `${cap(`the ${name(other)} on ${n(a[other])}`)} holds the ${ord(rk - 1)} rank, so the king` : 'The king';
        say(i, 'climb', `Check on the ${ord(rk)} rank! ${wall} has to climb to the ${ord(rk + 1)}.`,
          `Check on the ${ord(rk)} rank: up to the ${ord(rk + 1)}.`);
      } else {
        // told from Black's reply (the most stubborn defence): right after the check the king may still have squares further down
        const rep = l.moves[i + 1], r2 = rowsLeft(T, pos(l.m, fenAfter(rep.fenBefore, rep.san)));
        if (replies.length === 1) say(i, 'only', `Check! The king has only one square left: ${rep.to}.`, `Check: only ${rep.to} is left.`);
        else if (rank(sqIdx(rep.to)) > rank(b[1]))
          say(i, 'check-up', `Check! The king's toughest reply is to step up to ${rep.to}, where it is locked in the top ${r2} row${r2 === 1 ? '' : 's'}.`,
            `Check: up to ${rep.to}, the top ${r2} row${r2 === 1 ? '' : 's'} left.`);
        else say(i, 'check', `Check! The king has to step away; its toughest reply is ${rep.to}.`, `Check: the king goes to ${rep.to}.`);
      }
      return;
    }
    const attacked = dist(b[k], b[1]) === 1 && !guarded(T, b, k);
    const keepsRow = rank(a[k]) === rank(b[k]), keepsFile = file(a[k]) === file(b[k]);
    const who = name(other) === name(k) ? `the other ${name(other)}` : `the ${name(other)}`;
    const rows = (r) => `${r} row${r === 1 ? '' : 's'}`;
    const nextMine = l.moves.slice(i + 1).find((x) => x.side === 'w');
    quiet();
    // the move also protects the other piece, which the king was attacking
    if (dist(b[other], b[1]) === 1 && !guarded(T, b, other) && guarded(T, a, other))
      notes[i].push(`It also protects the ${name(other)} on ${n(a[other])}, which the king attacked.`);

    function quiet() {
      if (attacked && dist(a[k], a[1]) === 1) {
        // still next to the king, but now protected
        if (!guarded(T, a, k)) throw new Error(`${l.fen}: ${m.san} leaves the ${name(k)} hanging`);
        const wall = r1 < r0 ? ` From there it holds the ${ord(rank(a[k]))} rank: the wall moves up, and the king is locked in the top ${rows(r1)}.` : '';
        say(i, 'guard', `The king attacked the ${name(k)}: it steps to ${n(a[k])}, where ${who} protects it.${wall}`,
          `Attacked again: the ${name(k)} goes to ${n(a[k])}, protected by ${who}.${wall}`);
        return;
      }
      if (attacked) {
        const kept = keepsRow ? ` and still holds the ${ord(rank(a[k]))} rank` : keepsFile ? ` and still holds the ${'abcdefgh'[file(a[k])]}-file` : '';
        say(i, 'switch', `The king attacked the ${name(k)}: it moves to the far side, ${n(a[k])}, out of the king's reach${kept}.`,
          `Out of reach again: the ${name(k)} goes to ${n(a[k])}${kept}.`);
        return;
      }
      if (r1 < r0) {
        say(i, 'wall', `The ${name(k)} takes the ${ord(rank(a[k]))} rank: the wall moves up, and the king is locked in the top ${rows(r1)}.`,
          `The wall moves up to the ${ord(rank(a[k]))} rank: ${rows(r1)} left.`);
        return;
      }
      if (nextMine && sqIdx(nextMine.from) === a[other] && /[+#]$/.test(nextMine.san) && between(b[k], sqIdx(nextMine.from), sqIdx(nextMine.to))) {
        // the piece was standing in the way of the other one's next check
        const [x, y] = [sqIdx(nextMine.from), sqIdx(nextMine.to)];
        const line = file(x) === file(y) ? `${'abcdefgh'[file(x)]}-file` : rank(x) === rank(y) ? `${ord(rank(x))} rank` : 'diagonal';
        const how = keepsRow ? `slides along the ${ord(rank(a[k]))} rank to ${n(a[k])}: it keeps the wall and clears` : `steps aside to ${n(a[k])}, clearing`;
        say(i, 'clear', `The ${name(k)} ${how} the ${line} for ${who} to ${nextMine.san.endsWith('#') ? 'mate' : 'check'}.`,
          `Out of the way again: ${n(a[k])} clears the ${line}.`);
        return;
      }
      if (keepsRow && dist(a[k], a[1]) > dist(b[k], b[1]) && dist(a[k], a[1]) >= 3) {
        say(i, 'far', `A quiet move: the ${name(k)} slides along the ${ord(rank(a[k]))} rank to the far side (${n(a[k])}), so that the king cannot attack it when it gives the next check.`,
          `The ${name(k)} slides to the far side again (${n(a[k])}) before the next check.`);
        return;
      }
      if (nextMine && sqIdx(nextMine.from) === a[k] && /[+#]$/.test(nextMine.san)) {
        const what = nextMine.san.endsWith('#') ? 'to mate' : 'to give the next check';
        say(i, 'prepare', `A quiet move: the ${name(k)} goes to ${n(a[k])}, ready ${what} while ${who} keeps the king in.`,
          `The ${name(k)} gets ready on ${n(a[k])}, ${what}.`);
        return;
      }
      const n0 = box(T, b).length, n1 = box(T, a).length;
      if (n1 < n0) {
        const along = keepsRow ? `${'abcdefgh'[file(a[k])]}-file` : keepsFile ? `${ord(rank(a[k]))} rank` : `lines through ${n(a[k])}`;
        say(i, 'cut', `The ${name(k)} cuts the king off along the ${along}: the box shrinks to ${n1} squares.`,
          `The ${name(k)} takes the ${along}: ${n1} squares left.`);
        return;
      }
      say(i, 'wait', `A waiting move: the ${name(k)} goes to ${n(a[k])}. The box stays closed, and now Black has to move.`,
        `Another waiting move (${n(a[k])}): Black has to move.`);
    }
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
    if (id === 'practice') notes = notes.map((arr, i) => (i === l.moves.length - 1 ? ['Checkmate!'] : []));
    const moveMarks = l.moves.map(() => ({ squares: [], arrows: [] }));
    let introMarks = { squares: [], arrows: [] };
    l.moves.forEach((m, i) => {
      if (m.side !== 'w') return;
      const mk = marksFor(l, m.fenBefore);
      if (i === 0) introMarks = mk; else moveMarks[i - 1] = mk;
    });
    if (['picture', 'ladder-rr', 'switch', 'ladder-qr'].includes(id)) {
      const last = l.moves[l.moves.length - 1];
      moveMarks[l.moves.length - 1] = { squares: [`R${n(pos(l.m, fenAfter(last.fenBefore, last.san))[1])}`], arrows: [] };
    }
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
  finalNote: /^(\[%[^\]]*\] )*Checkmate/,
});
for (const p of problems) console.log('PROBLEM', p);
console.log(`wrote ${stats.lines} lines to ${path.relative(process.cwd(), OUT)}; read back and re-verified: ` +
  `${stats.learnerMoves} learner moves, ${stats.unique} unique (${stats.pct}%), ` +
  `${stats.withAlso} with [%also] (${stats.alsoTotal} alternatives); problems: ${problems.length}`);
if (problems.length) {
  console.error(`pgnout: ${problems.length} problem(s) in the written course`);
  process.exit(1);
}
