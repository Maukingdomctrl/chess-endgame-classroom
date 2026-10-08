// Converts picked (normalised) lines into real FENs + SAN using chess.js, and re-verifies every
// position independently with K.probe on the real FEN.
const path = require('path');
const { Chess } = require('chess.js');
const E = require('./engine.cjs');
const { K } = E;
const picked = require('./.out/picked.json');

function toActual(pk) {
  const flip = pk.mode === 'draw'; // trainee defends → attacker is Black
  const a = (sq) => (flip ? sq ^ 56 : sq);
  const n = (sq) => K.sqName(a(sq));
  const s = pk.s;
  const board = Array(64).fill(null);
  board[a(s.wk)] = flip ? 'k' : 'K';
  board[a(s.bk)] = flip ? 'K' : 'k';
  board[a(s.p)] = flip ? 'p' : 'P';
  let rows = [];
  for (let r = 7; r >= 0; r--) {
    let row = '', e = 0;
    for (let f = 0; f < 8; f++) {
      const pc = board[r * 8 + f];
      if (!pc) e++; else { if (e) row += e; e = 0; row += pc; }
    }
    if (e) row += e;
    rows.push(row);
  }
  const attackerColor = flip ? 'b' : 'w';
  const defenderColor = flip ? 'w' : 'b';
  const turn = s.stm === 0 ? attackerColor : defenderColor;
  const fen = `${rows.join('/')} ${turn} - - 0 1`;
  const g = new Chess(fen);
  const moves = [];
  for (const pl of pk.line.plies) {
    const m = pl.move;
    const from = n(m.from), to = n(m.to);
    const mv = g.move({ from, to, promotion: m.promo || undefined });
    moves.push({ san: mv.san, side: pl.side, unique: pl.unique, alts: pl.alts, raw: m, before: pl.before, fenAfter: g.fen() });
  }
  return { fen, flip, moves, n };
}

const out = [];
let problems = 0;
for (const pk of picked) {
  const act = toActual(pk);
  // independent verification on real FENs
  const g = new Chess(act.fen);
  for (const m of act.moves) {
    const fenBefore = g.fen();
    const mover = g.turn();
    g.move(m.san);
    const trainee = mover === 'w';
    if (trainee) {
      const after = g.fen();
      const isPromo = m.san.includes('=');
      if (pk.mode === 'win') {
        if (!isPromo) {
          const r = K.probe(after); // black to move: must be lost for black
          if (r.result !== 'loss') { problems++; console.log('PROBLEM win', pk.lesson, fenBefore, m.san, r); }
        }
      } else {
        const r = after.split(' ')[0].includes('p') ? K.probe(after) : { result: 'draw' };
        if (r.result !== 'draw') { problems++; console.log('PROBLEM draw', pk.lesson, fenBefore, m.san, r); }
      }
    }
  }
  out.push({ lesson: pk.lesson, mode: pk.mode, fen: act.fen, end: pk.line.end, ev: pk.ev, moves: act.moves.map(({ san, side, unique, alts, raw, before }) => ({ san, side, unique, alts, raw, before })), flip: act.flip });
}
require('fs').writeFileSync(path.join(__dirname, '.out/lines.json'), JSON.stringify(out, null, 1));
console.log('verified', out.length, 'lines; problems:', problems);
for (const l of out) {
  const g = new Chess(l.fen);
  let txt = '';
  l.moves.forEach((m, i) => { txt += (m.side === (l.mode === 'win' ? 'att' : 'def') ? (m.unique ? '' : `(${m.alts})`) : '') + m.san + ' '; });
  console.log(`${l.lesson.padEnd(10)} ${l.fen.padEnd(32)} ${txt}=> ${l.end}`);
}
