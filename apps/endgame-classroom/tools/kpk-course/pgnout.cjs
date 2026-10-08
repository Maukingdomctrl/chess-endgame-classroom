// Writes the course PGN: lesson texts + move notes derived from the verified geometry.
const path = require('path');
const { Chess } = require('chess.js');
const E = require('./engine.cjs');
const { K, keySquares, directOpp, distantOpp, diagOpp, promoSq } = E;
const { file, rank, dist } = K;
const lines = require('./.out/lines.json');

const ORDER = ['key4', 'key23', 'key5', 'finish6', 'opp', 'giveway', 'distant', 'diag', 'kingfirst',
  'defopp', 'straight', 'stalemate', 'rookwin', 'rookdef', 'race', 'square', 'exam'];

const T = {
  key4: { title: 'Key squares: pawn on the 4th rank',
    intro: 'Welcome! This course masters ONE idea: king and pawn against king. Rule 1: every pawn has KEY SQUARES. If your king reaches one of them, the pawn will queen whatever Black does. For a pawn on the 4th rank they are the three squares two ranks in front of it.',
    again: 'Same rule: walk your king to a key square. Black may stand in the way, so go around him.',
    desc: 'Key squares of a pawn on the 2nd-4th rank: the three squares two ranks ahead of it.' },
  key23: { title: 'Key squares: pawn on the 2nd or 3rd rank',
    intro: 'For a pawn on the 2nd or 3rd rank the key squares are still two ranks ahead of the pawn. The pawn does not need to move at all yet: bring the king up first.',
    again: 'The pawn stays at home. Your king does the walking.',
    desc: 'Pawn on the 2nd or 3rd rank: the key squares are two ranks in front. The king goes first.' },
  key5: { title: 'Key squares: pawn on the 5th rank',
    intro: 'Once the pawn reaches the 5th rank it has SIX key squares: the three squares on the 6th rank in front of it and the three on the 7th. That makes the win much easier.',
    again: 'Six key squares this time. Find the quickest way onto one of them.',
    desc: 'Pawn on the 5th rank: six key squares, on the 6th and 7th ranks.' },
  finish6: { title: 'Finishing: pawn on the 6th rank',
    intro: 'A pawn on the 6th rank with your king beside it wins against any defence. Watch how king and pawn work together all the way to the queening square.',
    again: 'Escort the pawn home. Keep your king close to it.',
    desc: 'King next to a 6th-rank pawn: escort it in, and promote only when the queening square is safe.' },
  opp: { title: 'The opposition',
    intro: 'Rule 2: when the kings stand on the same file with ONE square between them, the side that does NOT have to move has the OPPOSITION. The other king must step aside and let yours through. Take the opposition, then walk forward to a key square.',
    again: 'Take the opposition, then march to a key square.',
    desc: 'Opposition: kings face to face, one square apart, and the opponent has to move.' },
  giveway: { title: 'With the opposition, Black must give way',
    intro: 'Here you already have the opposition and it is Black to move. Whichever way Black steps, your king walks past on the side he has just left open.',
    again: 'Black must step aside. Go past on the other side.',
    desc: 'When the defender gives way, step past him on the side he left.' },
  distant: { title: 'Distant opposition',
    intro: 'Opposition also works from far away: the same file with three (or five) squares between the kings. Take it at a distance and it turns into the direct opposition as the kings come closer.',
    again: 'Take the opposition from a distance.',
    desc: 'Distant opposition: same file, an odd number of squares between the kings.' },
  diag: { title: 'Diagonal opposition',
    intro: 'Kings on the same diagonal with one square between them are also in opposition. Use it to shadow the defending king and step onto a key square.',
    again: 'The diagonal opposition again.',
    desc: 'Diagonal opposition turns into direct opposition or a key square.' },
  kingfirst: { title: 'King first, pawn later',
    intro: 'The most common mistake in these endings is pushing the pawn too early. A pawn that runs ahead of its king gives the defender time to block it. Bring the king in front first, and only then push.',
    again: 'Resist the pawn move. King first!',
    desc: 'Lead with the king; the pawn follows later.' },
  defopp: { title: 'Defending: keep the opposition',
    intro: 'Now YOU defend: Black has the pawn. If you keep the opposition in front of the pawn, the black king can never reach a key square and the game is a draw.',
    again: 'Hold the opposition and Black gets nowhere.',
    desc: "Defender's rule: stay in front of the pawn and keep the opposition." },
  straight: { title: 'Defending: retreat straight back',
    intro: 'When you have to retreat, go STRAIGHT BACK in front of the pawn, never to the side. Then, as soon as the pawn advances, you can take the opposition again.',
    again: 'Straight back, in front of the pawn.',
    desc: 'Retreat straight back, so you can take the opposition when the pawn moves.' },
  stalemate: { title: 'Defending: the stalemate trap',
    intro: 'With the pawn already on the 2nd rank, step in front of it. If Black protects the pawn, it is stalemate!',
    again: 'Block the queening square and look for stalemate.',
    desc: 'Blocking the queening square often ends in stalemate.' },
  rookwin: { title: 'Rook pawn: the key square next to the corner',
    intro: 'Rook pawns are special: the defender draws if his king reaches the corner in front of the pawn. To win, your king must reach the key square next to the queening corner (b7/b8 for an a-pawn, g7/g8 for an h-pawn).',
    again: 'Head for the key square beside the corner.',
    desc: 'Rook pawn: the key squares are b7/b8 (a-pawn) or g7/g8 (h-pawn).' },
  rookdef: { title: 'Rook pawn: run to the corner',
    intro: 'Defending against a rook pawn: get your king to the corner in front of it. From there it can never be driven out, and Black can only stalemate you.',
    again: 'Into the corner!',
    desc: 'Against a rook pawn, the corner in front of it is a fortress.' },
  race: { title: 'The rule of the square',
    intro: "When the kings are far apart, count! Imagine a square from the pawn to the queening rank. If the enemy king is outside that square after your move, the pawn simply runs and queens.",
    again: 'Is the king outside the square? Then run!',
    desc: 'Defending king outside the square: the pawn runs on its own.' },
  square: { title: 'Defending: catch the pawn',
    intro: "Now you are the one chasing. Step into the pawn's square and your king will catch it in time.",
    again: 'Into the square, then catch the pawn.',
    desc: 'A king inside the square catches the pawn.' },
  exam: { title: 'Final exam',
    intro: 'Put it all together. Which squares are key? Who has the opposition? When should the pawn move? Try this one in Practice mode without hints.',
    again: 'One more: use everything you have learned.',
    desc: 'Key squares + opposition = won king and pawn endings. Well done!' },
};

const names = (flip) => ({ n: (sq) => K.sqName(flip ? sq ^ 56 : sq), att: flip ? 'Black' : 'White', def: flip ? 'White' : 'Black' });

/** Squares of the pawn's "square" (rule of the square), drawn towards the defending king. */
function pawnSquare(p, bk, fromRank) {
  const r0 = Math.max(fromRank, 2); // a pawn on its 2nd rank can jump, so count from the 3rd
  const side = 7 - r0;
  const left = file(bk) < file(p);
  const out = [];
  for (let r = r0; r <= 7; r++)
    for (let f = left ? file(p) - side : file(p); f <= (left ? file(p) : file(p) + side); f++)
      if (f >= 0 && f <= 7) out.push(r * 8 + f);
  return out;
}
/** Teaching marks for a position where the trainee is about to move (normalised state). */
function marksFor(id, st, n) {
  const sqs = (list, c) => list.map((q) => `${c}${n(q)}`);
  switch (id) {
    case 'exam': return [];
    case 'race': return sqs(pawnSquare(st.p, st.bk, rank(st.p) + 1), 'B');
    case 'square': return sqs(pawnSquare(st.p, st.bk, rank(st.p)), 'B');
    case 'stalemate': return sqs([promoSq(st.p)], 'G');
    case 'rookdef': return sqs([promoSq(st.p), promoSq(st.p) + (file(st.p) === 0 ? 1 : -1)], 'G');
    case 'defopp': case 'straight': return sqs(keySquares(st.p), 'R');
    default: return sqs(keySquares(st.p), 'G');
  }
}
const csl = (list) => (list.length ? `[%csl ${list.join(',')}]` : '');

function keyList(p, n) {
  return keySquares(p).map(n).join(', ');
}

let lessonNo = 0, out = [];
let total = 0;
for (const id of ORDER) {
  lessonNo++;
  const group = lines.filter((l) => l.lesson === id);
  group.forEach((l, gi) => {
    total++;
    const t = T[id];
    const { n, att } = names(l.flip);
    const s0 = l.moves[0].before;
    const pawn = n(s0.p);
    // ---- intro ----
    let intro = gi === 0 ? t.intro : t.again;
    if (l.mode === 'win' && id === 'race') {
      intro += ' The blue zone is the square of the pawn once it moves: if the black king is outside it, the pawn queens.';
    } else if (l.mode === 'win') {
      intro += ` Pawn on ${pawn}: the key squares (green) are ${keyList(s0.p, n)}.`;
    } else if (l.mode === 'draw') {
      intro += ` Black's pawn is on ${pawn}. You are White: hold the draw.`;
      if (id === 'defopp' || id === 'straight') intro += " Red squares: the key squares Black's king must never reach.";
      if (id === 'rookdef') intro += ' Green: the corner squares your king is heading for.';
      if (id === 'stalemate') intro += ' Green: the queening square you must block.';
      if (id === 'square') intro += " Blue: the pawn's square. Step into it.";
    }
    if (id === 'exam') intro = t.intro;
    if (l.moves[0].side !== (l.mode === 'win' ? 'att' : 'def')) intro += ' Black moves first.';

    // ---- per-move notes ----
    const notes = l.moves.map(() => []);
    l.moves.forEach((m, i) => {
      const b = m.before, mv = m.raw;
      const trainee = l.mode === 'win' ? m.side === 'att' : m.side === 'def';
      if (l.mode === 'win' && m.side === 'att') {
        if (mv.kind === 'promo') notes[i].push('Queen! The pawn promotes safely.');
        else if (mv.kind === 'k') {
          if (keySquares(b.p).includes(mv.to) && !keySquares(b.p).includes(b.wk))
            notes[i].push(`Key square ${n(mv.to)}! With your king here the pawn will queen, whoever is to move.`);
          else if (directOpp(mv.to, b.bk)) notes[i].push('Opposition! The kings face each other with one square between them, and Black must give way.');
          else if (distantOpp(mv.to, b.bk)) notes[i].push('Distant opposition: same file, three squares apart. Keep it and it becomes the direct opposition.');
          else if (diagOpp(mv.to, b.bk)) notes[i].push('Diagonal opposition: next move it turns into a key square or the direct opposition.');
        } else if (mv.kind === 'p') {
          if (id === 'race') notes[i].push(i === 0 ? "Run! After this push the black king is outside the pawn's square." : 'Keep running.');
          else notes[i].push('Now the pawn advances, with the king clearing the way.');
        }
        if (i === l.moves.findIndex((x) => x.side === 'att') && id === 'kingfirst') {
          // name the drawing pawn push
          const g = new Chess(l.fen);
          for (let j = 0; j < i; j++) g.move(l.moves[j].san);
          const push = g.moves({ verbose: true }).find((x) => x.piece === 'p');
          if (push) notes[i].push(`(${push.san} would only draw: king first, pawn later.)`);
        }
      } else if (l.mode === 'win' && m.side === 'def') {
        const next = l.moves[i + 1];
        const nk = mv.to;
        if (next && next.raw.kind === 'k' && directOpp(nk, b.wk) && file(next.raw.to) !== file(b.wk))
          notes[i].push('Black takes the opposition, so you go around him: outflanking.');
      } else if (l.mode === 'draw' && m.side === 'def') {
        if (mv.capture) notes[i].push('You win the pawn: draw!');
        else if (id === 'stalemate') notes[i].push('Step in front of the pawn: the queening square is blocked.');
        else if (id === 'rookdef' && (mv.to === promoSq(b.p) || (rank(mv.to) === 7 && Math.abs(file(mv.to) - file(b.p)) === 1)) && i > 0) notes[i].push('In the corner! Now Black can never drive you out.');
        else if (id === 'rookdef' && dist(mv.to, promoSq(b.p)) < dist(b.bk, promoSq(b.p))) notes[i].push('Towards the corner: against a rook pawn, a king in the corner cannot be driven out.');
        else if (id === 'square' && i <= 1) notes[i].push("Into the pawn's square: your king will catch it.");
        else if (directOpp(mv.to, b.wk)) notes[i].push(`Opposition! Black's king cannot advance.`);
        else if (file(mv.to) === file(b.p) && rank(mv.to) > rank(b.bk)) notes[i].push('Straight back, in front of the pawn. Now you can take the opposition after the pawn moves.');
      } else if (l.mode === 'draw' && m.side === 'att' && mv.kind === 'p') {
        notes[i].push('Black pushes. Keep your king in front of the pawn.');
      }
    });
    const traineeSide = l.mode === 'win' ? 'att' : 'def';
    const moveMarks = l.moves.map(() => []);
    let introMarks = [];
    l.moves.forEach((m, i) => {
      if (m.side !== traineeSide) return;
      const mk = marksFor(id, m.before, n);
      if (i === 0) introMarks = mk; else moveMarks[i - 1] = mk;
    });
    // final position: show the squares that were reached / held
    {
      const lm = l.moves[l.moves.length - 1];
      const fin = lm.raw.kind === 'promo' || lm.raw.capture ? null : lm.before;
      if (fin && id !== 'exam') {
        const after = lm.side === 'att' && lm.raw.kind !== 'promo'
          ? { wk: lm.raw.child[0], bk: lm.raw.child[1], p: lm.raw.child[2] }
          : lm.raw.child ? { wk: lm.raw.child[0], bk: lm.raw.child[1], p: lm.raw.child[2] } : null;
        if (after && !['race', 'square'].includes(id)) moveMarks[l.moves.length - 1] = marksFor(id, after, n);
      }
    }
    const last = notes.length - 1;
    if (l.end === 'stalemate') notes[last].push(`Stalemate! ${names(l.flip).def} has no legal move: the game is drawn.`);
    if (l.end === 'stalemate-att') notes[last].push(`Stalemate! ${names(l.flip).att} has no legal move: the game is drawn.`);
    // Don't repeat the same explanation move after move.
    const SHORT = { 'Opposition!': 'Opposition again.', 'In the corner': '', 'Black pushes.': '', 'Towards the corner': '', 'Into the pawn': '' };
    const seen = new Set();
    notes.forEach((arr, i) => {
      notes[i] = arr.map((c) => {
        if (!c) return c;
        const k = Object.keys(SHORT).find((p) => c.startsWith(p));
        if (!k) return c;
        if (seen.has(k)) return k === 'Opposition!' && c.includes('Stalemate') ? c.replace(/^Opposition![^.]*\.[^.]*\. ?/, '') : c.startsWith('Opposition!') ? c.replace(/^Opposition![^.]*\.(?: [^.]*\.)?/, SHORT[k]) : SHORT[k];
        seen.add(k);
        return c;
      });
    });
    if (l.end === 'max') notes[last].push(l.mode === 'draw' ? 'Black is getting nowhere. Keep this up and it is a draw.' : '');

    // ---- assemble movetext ----
    const g = new Chess(l.fen);
    let mt = `{${[csl(introMarks), intro].filter(Boolean).join(' ')}}`;
    let first = true;
    let hadComment = false;
    l.moves.forEach((m, i) => {
      const num = g.moveNumber();
      if (g.turn() === 'w') mt += ` ${num}. ${m.san}`;
      else mt += first || hadComment ? ` ${num}... ${m.san}` : ` ${m.san}`;
      g.move(m.san);
      first = false;
      const c = [csl(moveMarks[i]), notes[i].filter(Boolean).join(' ')].filter(Boolean).join(' ');
      hadComment = !!c;
      if (c) mt += ` {${c}}`;
    });
    mt += ' *';
    const name = `${String(lessonNo).padStart(2, '0')}. ${t.title}${group.length > 1 ? ` (${gi + 1}/${group.length})` : ''}`;
    const tags = [['Event', name], ['Site', 'Endgame Classroom'], ['White', '?'], ['Black', '?'], ['Result', '*'],
      ['SetUp', '1'], ['FEN', l.fen], ['LineName', name], ['LineDescription', t.desc]];
    // wrap movetext at 80 cols
    const words = mt.split(' '); const rows = []; let row = '';
    for (const w of words) { if (row && row.length + w.length + 1 > 80) { rows.push(row); row = w; } else row = row ? `${row} ${w}` : w; }
    rows.push(row);
    out.push(tags.map(([k, v]) => `[${k} "${v.replace(/"/g, '\\"')}"]`).join('\n') + '\n\n' + rows.join('\n') + '\n');
  });
}
require('fs').writeFileSync(path.join(__dirname, '../../courses/king-and-pawn-course.pgn'), out.join('\n'));
console.log('wrote', total, 'lines');
