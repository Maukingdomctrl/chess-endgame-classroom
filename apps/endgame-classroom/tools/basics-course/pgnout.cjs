// Writes the course PGN: lesson texts, move notes and board marks derived from the verified lines.
// Then reads the file back and checks every line again (verify.cjs) before declaring success.
const fs = require('fs');
const path = require('path');
const { Chess } = require('chess.js');
const E = require('./engine.cjs');
const { M, KP, ring, onEdge, isCorner, directOpp, box, isWait } = E;
const { verifyLine } = require('./verify.cjs');
const { file, rank, dist, sqName: n } = M;
const lines = require('./.out/lines.json');

const OUT = path.join(__dirname, '../../courses/endgame-basics-course.pgn');
const ORDER = ['king', 'patterns', 'queen', 'rook', 'stalemate', 'exam'];

const LESSONS = {
  king: { title: 'The king is a fighting piece',
    intro: 'Welcome to Endgame Basics! First principle: in the endgame the king is a fighting piece. With so few pieces left it is safe, so bring it to the centre and in front of your pawn.',
    colours: 'Green: the key squares (with your king on one, the pawn will queen). Red arrow: the push that would only draw.' },
  patterns: { title: 'Mating patterns on the edge and in the corner',
    intro: 'First learn what the finish looks like. On the edge or in the corner a king has only a few squares, so a queen or a rook can mate it with the help of your king.',
    colours: 'Blue: the squares the black king can step to. Find the check that takes them all away.' },
  queen: { title: 'Checkmate with the queen',
    intro: 'King and queen against king always wins, in at most 10 moves. The plan: shrink the black king\'s box with the queen, bring your king, mate on the edge. Every move here is the fastest mate.',
    colours: 'Blue: the box, every square the black king can still reach. It shrinks and never grows.' },
  rook: { title: 'Checkmate with the rook',
    intro: 'King and rook against king wins too, but takes longer. The plan: cut the king off with the rook, bring your king, and check on the edge when the kings stand face to face. Every move here is the fastest mate.',
    colours: 'Blue: the box, every square the black king can still reach. It never grows.' },
  stalemate: { title: 'Don\'t stalemate!',
    intro: 'Stalemate: the side to move is not in check but has no legal move, and the game is a draw. It throws away many won endings, usually on the last moves. Count the black king\'s squares before every move!',
    colours: 'Blue: the squares the black king can step to. Red arrow: the natural move that would be stalemate.' },
  exam: { title: 'Final exam',
    intro: 'Final exam! No coloured squares this time. Use it all: an active king, the box, the opposition, and no stalemate. Then try Practice mode without hints.',
    colours: '' },
};

// first = first line of the group, again = the next ones, desc = the takeaway shown when the line is done
const GROUPS = {
  'king-far': { first: 'Your king is far away: march it to the centre first. Pushing the pawn now would only draw.',
    again: 'Far away again: centralise the king first, the pawn can wait.',
    desc: 'A far-away king walks to the centre first: from there it gets in front of its pawn.' },
  'king-near': { first: 'The king stands next to its pawn. Pushing now would only draw: the king goes first and clears the way.',
    again: 'King first, pawn later.',
    desc: 'The king leads and the pawn follows: the king clears the way to the queening square.' },
  'pat-q-kiss': { first: 'Mate in 1 with the queen right next to the black king, protected by your king.',
    desc: 'Queen next to the king and protected by your king: checkmate.' },
  'pat-q-edge': { first: 'Mate in 1. The kings face each other: your king covers the squares in front of the black king, so the queen only has to check along the edge.',
    desc: 'Edge mate: your king takes the squares in front, the queen checks along the edge.' },
  'pat-q-corner': { first: 'Mate in 1. In the corner the black king has only three squares: your king takes two of them. Find the queen check that does the rest.',
    desc: 'In the corner the king has only three squares: your king covers two, the queen gives check.' },
  'pat-r-edge': { first: 'Mate in 1. The rook mates on the edge the same way: kings face to face, rook check along the edge.',
    desc: 'Rook mate on the edge: kings face to face, rook check along the edge.' },
  'pat-r-corner': { first: 'Mate in 1 in the corner: your king stands a knight\'s jump away and covers the squares in front of the black king.',
    desc: 'Corner mate: your king a knight\'s jump away, the rook checks along the edge.' },
  'pat-r-wait': { first: 'Mate in 2. A rook check now would let the king escape. Make a quiet waiting move with the rook: the black king has to step in front of yours, and then the rook mates.',
    desc: 'A waiting move forces the black king to step in front of yours: then the rook mates.' },
  'queen-knight': { first: 'The key move: put the queen a knight\'s jump away from the black king. It takes away a whole block of squares without giving check.',
    again: 'Find the queen move a knight\'s jump from the black king.',
    desc: 'Queen a knight\'s jump from the black king: the box shrinks without a check.' },
  'queen-king': { first: 'The black king is already on the edge, but the queen cannot mate on its own. Bring your king!',
    desc: 'With the black king on the edge, the queen holds the box while your king comes to help.' },
  'queen-full': { first: 'From the middle of the board: shrink the box with the queen, bring your king, then mate.',
    again: 'The whole plan again: box, king, mate.',
    desc: 'Shrink the box, bring the king, mate on the edge.' },
  'rook-cut': { first: 'The rook cuts the black king off along a rank or a file. Each rook move then shrinks the box, while your king comes closer and protects the rook.',
    again: 'Cut the king off and shrink the box.',
    desc: 'The rook cuts the king off; with your king\'s help the box shrinks row by row.' },
  'rook-opp': { first: 'Bring your king in front of the black king: the opposition. When Black has to move, his king must give way, or step in front of yours and be mated.',
    desc: 'When the kings face each other on the edge, a rook check is mate.' },
  'rook-wait': { first: 'Look out for the waiting move: when the kings are a knight\'s jump apart, the rook slides along its rank and Black has to move.',
    desc: 'A waiting rook move: Black must step into the opposition (and is mated) or step back.' },
  'rook-full': { first: 'The whole method from the middle of the board: cut off, bring the king, take the opposition, check on the edge.',
    desc: 'Cut off, bring the king, take the opposition, check on the edge: mate.' },
  'stale-q-knight': { first: 'The knight\'s-jump trick can backfire: with the black king near the corner it may leave no square at all.',
    desc: 'When the black king has few squares left, make sure it still has one after your move (unless it is mate).' },
  'stale-q-king': { first: 'Bringing your king closer can stalemate too.',
    desc: 'Even a king move can stalemate: count the black king\'s squares first.' },
  'stale-r': { first: 'The rook can stalemate as well.',
    desc: 'Before every move with the rook or the king, count the black king\'s squares.' },
  'stale-promo': { first: 'Which piece should the pawn become? Count the black king\'s squares first.',
    desc: 'When a new queen would stalemate, promote to a rook: it still wins.' },
  'stale-push': { first: 'The pawn push looks natural, but count Black\'s moves first!',
    desc: 'A pawn push that leaves Black without a move is stalemate: move the king first.' },
  'exam-p': { first: 'King and pawn: win it.', again: 'Another pawn ending.',
    desc: 'Active king, key squares, opposition: the pawn queens.' },
  'exam-q': { first: 'King and queen: mate as fast as you can.', again: 'King and queen again.',
    desc: 'Box, king, mate: the queen mate.' },
  'exam-r': { first: 'King and rook: mate as fast as you can.', again: 'King and rook again.',
    desc: 'Cut off, opposition, check on the edge: the rook mate.' },
};

// ---------- geometry from a FEN ----------
function pos(fen) {
  const { pcs } = M.parseFen(fen);
  return { wk: pcs.K, bk: pcs.k, x: pcs.Q ?? pcs.R, p: pcs.P };
}
const fenAfter = (fen, san) => { const g = new Chess(fen); g.move(san); return g.fen(); };
/** White moves that would be stalemate. */
const stalemateMoves = (fen) => new Chess(fen).moves({ verbose: true }).filter((mv) => { const t = new Chess(fen); t.move(mv.san); return t.isStalemate(); });
/** Squares the black king could move to if it were Black's turn. */
function kingSquares(fen) {
  const parts = fen.split(' ');
  parts[1] = 'b'; parts[3] = '-';
  try { return [...new Set(new Chess(parts.join(' ')).moves({ verbose: true }).map((mv) => mv.to))]; } catch { return []; }
}
const sq = (list, c) => list.map((s) => `${c}${typeof s === 'number' ? n(s) : s}`);
const PIECE = { q: 'queen', r: 'rook' };

/** Marks for the position where the learner is to move. */
function marksFor(l, fen, first) {
  if (l.lesson === 'exam') return { squares: [], arrows: [] };
  const s = pos(fen);
  if (l.kind === 'p') {
    if (l.lesson === 'king') {
      const keys = KP.keySquares(s.p);
      const squares = sq(keys.length ? keys : [KP.promoSq(s.p)], 'G');
      // the drawing pawn push, on the first move only
      const arrows = first ? new Chess(fen).moves({ verbose: true }).filter((mv) => mv.piece === 'p' && KP.K.probe(fenAfter(fen, mv.san)).result !== 'loss').map((mv) => `R${mv.from}${mv.to}`) : [];
      return { squares, arrows };
    }
    // stalemate lesson: the black king's free squares and the stalemating move (unless it is the promotion square itself)
    const traps = stalemateMoves(fen).filter((mv) => !mv.promotion);
    return { squares: sq(kingSquares(fen), 'B'), arrows: traps.map((mv) => `R${mv.from}${mv.to}`) };
  }
  const S = M.solver(l.kind);
  // patterns and stalemate traps: the squares the king can step to; the mating lessons: the whole box
  const squares = sq(['patterns', 'stalemate'].includes(l.lesson) ? kingSquares(fen) : box(S, s.wk, s.bk, s.x), 'B');
  const arrows = l.lesson === 'stalemate' ? [...new Set(stalemateMoves(fen).map((mv) => `R${mv.from}${mv.to}`))] : [];
  return { squares, arrows };
}
const fmt = (mk) => [mk.squares.length ? `[%csl ${mk.squares.join(',')}]` : '', mk.arrows.length ? `[%cal ${mk.arrows.join(',')}]` : ''].filter(Boolean).join(' ');

// ---------- move notes ----------
function mateText(kind, a) {
  const piece = PIECE[kind];
  if (dist(a.x, a.bk) === 1) return `Checkmate! The ${piece} stands right next to the black king, and your king protects it.`;
  if (isCorner(a.bk)) return `Checkmate in the corner! The ${piece} gives check and your king covers the other squares.`;
  const alongEdge = ((rank(a.bk) === 0 || rank(a.bk) === 7) && rank(a.x) === rank(a.bk)) || ((file(a.bk) === 0 || file(a.bk) === 7) && file(a.x) === file(a.bk));
  if (onEdge(a.bk) && alongEdge) return `Checkmate on the edge! The ${piece} checks along the edge and your king covers the squares in front.`;
  return 'Checkmate! Every square around the black king is covered.';
}

function mateNotes(l) {
  const S = M.solver(l.kind);
  const piece = PIECE[l.kind];
  const notes = l.moves.map(() => []);
  // a note is said in full the first time; a short reminder only where it carries news (a box size)
  // or once for the rest
  const said = new Map();
  const say = (i, key, first, again, repeat = false) => {
    const k = said.get(key) ?? 0;
    said.set(key, k + 1);
    if (k === 0) notes[i].push(first);
    else if (again && (repeat || k === 1)) notes[i].push(again);
  };
  l.moves.forEach((m, i) => {
    const b = pos(m.fenBefore), a = pos(fenAfter(m.fenBefore, m.san));
    if (m.side === 'w') {
      if (i === 0 && l.lesson === 'stalemate') {
        const traps = stalemateMoves(m.fenBefore).map((t) => t.san);
        if (!traps.length) throw new Error(`${l.fen}: a stalemate line without a stalemate trap`);
        notes[i].push(`Not ${traps.join(' or ')}: that would be stalemate!`);
      }
      if (m.san.endsWith('#')) { notes[i].push(mateText(l.kind, a)); return; }
      const b0 = box(S, b.wk, b.bk, b.x).length, b1 = box(S, a.wk, a.bk, a.x).length;
      const o = { kind: m.kind === 'piece' ? 'x' : 'k', check: m.san.includes('+'), child: [a.wk, a.bk, a.x] };
      if (m.kind === 'piece') {
        if (o.check) say(i, 'check', `Check! The black king has to step back${b1 < b0 ? `: ${b1} squares left in its box` : ''}.`, b1 < b0 ? `Check: ${b1} squares left.` : '', true);
        else if (l.kind === 'r' && isWait(S, o, b)) say(i, 'wait', 'A waiting move! The rook keeps the king locked in, and now Black has to move: step in front of your king (and be mated) or step back.', 'Another waiting move.');
        else if (l.kind === 'q' && E.knightJump(a.x, b.bk) && b1 < b0) say(i, 'knight', `The queen goes a knight's jump away from the black king: the box shrinks to ${b1} squares.`, `A knight's jump again: ${b1} squares left.`, true);
        else if (b1 < b0) say(i, 'shrink', l.kind === 'r' ? `The rook cuts the king off: the box shrinks to ${b1} squares.` : `The queen takes more squares: the box shrinks to ${b1}.`, `The box shrinks to ${b1} squares.`, true);
        else if (dist(b.bk, b.x) === 1) say(i, 'escape', `The ${piece} steps away from the black king without opening the box.`, '');
      } else if (dist(b.bk, b.x) === 1 && dist(b.wk, b.x) > 1 && dist(a.wk, a.x) === 1) {
        say(i, 'protect', `Your king protects the ${piece}${l.kind === 'r' && directOpp(a.wk, b.bk) ? ' and faces the black king' : ''}.`, `The king protects the ${piece} again.`);
      } else if (l.kind === 'r' && directOpp(a.wk, b.bk)) {
        say(i, 'opp', 'Opposition: the kings face each other with one square between them.', 'Opposition again.');
      } else {
        say(i, 'king', `Your king comes closer: the ${piece} cannot mate on its own.`, '');
      }
    } else if (dist(a.bk, a.x) === 1 && dist(a.wk, a.x) > 1) {
      say(i, 'attack', `Black attacks the ${piece}!`, `The ${piece} is attacked again.`, true);
    }
  });
  return notes;
}

function pawnNotes(l) {
  const notes = l.moves.map(() => []);
  let keyReached = false, leads = false, pushes = 0;
  l.moves.forEach((m, i) => {
    if (m.side !== 'w') return;
    const b = pos(m.fenBefore), a = pos(fenAfter(m.fenBefore, m.san));
    if (m.kind === 'promo') {
      if (m.san.includes('=R')) {
        const q = new Chess(m.fenBefore);
        q.move({ from: m.from, to: m.to, promotion: 'q' });
        if (!q.isStalemate()) throw new Error(`${l.fen}: the rook promotion is explained by a stalemate that is not there`);
        const free = new Chess(fenAfter(m.fenBefore, m.san)).moves({ verbose: true }).map((mv) => mv.to);
        notes[i].push(`Rook! A queen on ${m.to} would cover every square the black king can go to: stalemate. The rook leaves it ${free.join(' and ')}, and king and rook against king is a win (lesson 4).`);
      } else notes[i].push('Queen! The pawn has promoted safely, and king and queen against king is a win (lesson 3).');
      return;
    }
    if (i === 0 && l.lesson === 'king') {
      const draws = new Chess(m.fenBefore).moves({ verbose: true }).filter((mv) => mv.piece === 'p' && KP.K.probe(fenAfter(m.fenBefore, mv.san)).result !== 'loss');
      const toCentre = ring(a.wk) < ring(b.wk);
      notes[i].push(`${toCentre ? 'The king heads for the centre.' : 'The king steps forward.'}${draws.length ? ` (${draws.map((d) => d.san).join(' or ')} would only draw.)` : ''}`);
    }
    if (i === 0 && l.lesson === 'stalemate') {
      const traps = stalemateMoves(m.fenBefore).filter((mv) => !mv.promotion);
      if (traps.length) notes[i].push(`${traps.map((t) => t.san).join(' or ')} would be stalemate: the black king would have no move. The king goes first.`);
    }
    if (m.kind === 'king') {
      if (!keyReached && KP.keySquares(b.p).includes(a.wk) && !KP.keySquares(b.p).includes(b.wk)) {
        keyReached = true;
        notes[i].push(`Key square ${m.to}! With your king here the pawn will queen whatever Black does.`);
      } else if (directOpp(a.wk, b.bk)) notes[i].push('Opposition: the kings face each other, and Black has to give way.');
      else if (keyReached && !leads && rank(a.wk) > rank(b.p) + 1) { leads = true; notes[i].push('The king walks ahead of the pawn and clears the way.'); }
    } else if (m.kind === 'pawn') {
      if (rank(a.p) === 6 && dist(a.wk, KP.promoSq(a.p)) <= 1) notes[i].push('The pawn reaches the 7th rank, and your king guards the queening square.');
      else if (pushes === 0) notes[i].push('Now the pawn advances, escorted by the king.');
      else if (m.san.includes('+')) notes[i].push('Pawn forward, with check.');
      pushes++;
    }
  });
  return notes;
}

// ---------- assemble ----------
const out = [];
let lessonNo = 0;
for (const id of ORDER) {
  lessonNo++;
  const group = lines.filter((l) => l.lesson === id);
  if (!group.length) throw new Error(`lesson ${id} has no lines`);
  const L = LESSONS[id];
  group.forEach((l, gi) => {
    const G = GROUPS[l.group];
    const firstOfGroup = group.findIndex((x) => x.group === l.group) === gi;
    // ---- intro ----
    const parts = [];
    if (gi === 0) parts.push(L.intro);
    parts.push(firstOfGroup || !G.again ? G.first : G.again);
    if (gi === 0 && L.colours) parts.push(L.colours);
    const intro = parts.join(' ');

    // ---- notes ----
    let notes = l.kind === 'p' ? pawnNotes(l) : mateNotes(l);
    if (id === 'exam') notes = notes.map((arr, i) => (i === l.moves.length - 1 ? arr : [])); // the exam only comments on the result

    // ---- marks: shown where the learner is to move, so they go on the move before ----
    const moveMarks = l.moves.map(() => ({ squares: [], arrows: [] }));
    let introMarks = { squares: [], arrows: [] };
    l.moves.forEach((m, i) => {
      if (m.side !== 'w') return;
      const mk = marksFor(l, m.fenBefore, i === 0);
      if (i === 0) introMarks = mk; else moveMarks[i - 1] = mk;
    });
    // the final picture of a mate: the mated king in red
    const last = l.moves[l.moves.length - 1];
    if (last.san.endsWith('#') && ['patterns', 'queen', 'rook'].includes(id)) {
      moveMarks[l.moves.length - 1] = { squares: [`R${n(pos(fenAfter(last.fenBefore, last.san)).bk)}`], arrows: [] };
    }

    // ---- movetext ----
    const g = new Chess(l.fen);
    let mt = `{${[fmt(introMarks), intro].filter(Boolean).join(' ')}}`;
    let needNumber = true;
    l.moves.forEach((m, i) => {
      const num = g.moveNumber();
      if (g.turn() === 'w') mt += ` ${num}. ${m.san}`;
      else mt += needNumber ? ` ${num}... ${m.san}` : ` ${m.san}`;
      g.move(m.san);
      const also = m.also.length ? `[%also ${m.also.join(',')}]` : '';
      const c = [fmt(moveMarks[i]), also, notes[i].filter(Boolean).join(' ')].filter(Boolean).join(' ');
      needNumber = !!c;
      if (c) mt += ` {${c}}`;
    });
    mt += ' *';
    const name = `${String(lessonNo).padStart(2, '0')}. ${L.title} (${gi + 1}/${group.length})`;
    const tags = [['Event', name], ['Site', 'Endgame Classroom'], ['White', '?'], ['Black', '?'], ['Result', '*'],
      ['SetUp', '1'], ['FEN', l.fen], ['LineName', name], ['LineDescription', G.desc]];
    const words = mt.split(' ');
    const rows = [];
    let row = '';
    for (const w of words) { if (row && row.length + w.length + 1 > 80) { rows.push(row); row = w; } else row = row ? `${row} ${w}` : w; }
    rows.push(row);
    out.push(tags.map(([k, v]) => `[${k} "${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`).join('\n') + '\n\n' + rows.join('\n') + '\n');
  });
}
fs.writeFileSync(OUT, out.join('\n'));

// ---------- read the file back and check it all again ----------
function readPgn(text) {
  return text.split(/\n(?=\[Event )/).map((chunk) => {
    const tags = Object.fromEntries([...chunk.matchAll(/^\[(\w+) "((?:[^"\\]|\\.)*)"\]$/gm)].map((m) => [m[1], m[2].replace(/\\(.)/g, '$1')]));
    const body = chunk.slice(chunk.indexOf('\n\n') + 2).replace(/\n/g, ' ');
    const tokens = body.match(/\{[^}]*\}|[^\s{}]+/g) ?? [];
    const moves = [];
    let intro = '';
    for (const t of tokens) {
      if (t.startsWith('{')) { if (moves.length) moves[moves.length - 1].comment = t.slice(1, -1); else intro = t.slice(1, -1); continue; }
      if (t === '*' || /^\d+\.+$/.test(t)) continue;
      moves.push({ san: t, comment: '' });
    }
    for (const m of moves) m.also = (m.comment.match(/\[%also ([^\]]+)\]/)?.[1] ?? '').split(',').filter(Boolean);
    return { tags, intro, moves };
  });
}
let problems = 0;
const fail = (...a) => { problems++; console.log('PROBLEM', ...a); };
const games = readPgn(fs.readFileSync(OUT, 'utf8'));
if (games.length !== lines.length) fail(`wrote ${lines.length} lines but read back ${games.length}`);
let learnerMoves = 0, uniqueMoves = 0, withAlso = 0, alsoTotal = 0;
for (const gm of games) {
  const name = gm.tags.LineName;
  if (!/^\d\d\. .+ \(\d+\/\d+\)$/.test(name ?? '') || gm.tags.Event !== name) fail('bad LineName/Event', name);
  if (gm.tags.SetUp !== '1' || !gm.tags.FEN || !gm.tags.LineDescription) fail('missing tags', name);
  if (!gm.intro.trim()) fail('no intro comment', name);
  const comments = [gm.intro, ...gm.moves.map((m) => m.comment)];
  for (const c of comments) {
    for (const [, cmd, args] of c.matchAll(/\[%(\w+) ([^\]]*)\]/g)) {
      const ok = cmd === 'csl' ? /^[GRB][a-h][1-8](,[GRB][a-h][1-8])*$/.test(args) : cmd === 'cal' ? /^[GRB][a-h][1-8][a-h][1-8](,[GRB][a-h][1-8][a-h][1-8])*$/.test(args) : cmd === 'also';
      if (!ok) fail('bad mark', name, cmd, args);
      if (name.includes('Final exam') && cmd !== 'also') fail('marks in the exam', name);
    }
  }
  const res = verifyLine({ fen: gm.tags.FEN, moves: gm.moves });
  for (const p of res.problems) fail(name, p);
  learnerMoves += res.unique.length;
  uniqueMoves += res.unique.filter(Boolean).length;
  const learner = gm.moves.filter((_, i) => i % 2 === 0);
  withAlso += learner.filter((m) => m.also.length).length;
  alsoTotal += learner.reduce((s, m) => s + m.also.length, 0);
  const last = gm.moves[gm.moves.length - 1].comment;
  if (!/^(\[%[^\]]*\] )*(Checkmate|Queen!|Rook!)/.test(last)) fail('the final move has no closing note', name, last);
}
console.log(`wrote ${games.length} lines to ${path.relative(process.cwd(), OUT)}; read back and re-verified: ` +
  `${learnerMoves} learner moves, ${uniqueMoves} unique (${Math.round((100 * uniqueMoves) / learnerMoves)}%), ` +
  `${withAlso} with [%also] (${alsoTotal} alternatives); problems: ${problems}`);
if (problems) {
  console.error(`pgnout: ${problems} problem(s) in the written course`);
  process.exit(1);
}
