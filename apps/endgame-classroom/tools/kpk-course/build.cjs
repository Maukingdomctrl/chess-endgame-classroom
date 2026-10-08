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
    // other moves that are just as good here, as SAN (the trainer accepts them without a mistake)
    const also = (pl.others ?? []).map((o) => new Chess(g.fen()).move({ from: n(o.from), to: n(o.to), promotion: o.promo || undefined }).san);
    const mv = g.move({ from, to, promotion: m.promo || undefined });
    moves.push({ san: mv.san, side: pl.side, unique: pl.unique, alts: pl.alts, also, raw: m, before: pl.before, fenAfter: g.fen() });
  }
  return { fen, flip, moves, n };
}

const out = [];
let problems = 0;
for (const pk of picked) {
  const act = toActual(pk);
  // independent verification on real FENs
  const g = new Chess(act.fen);
  // A trainee move is good if it keeps the win (or the draw); a promotion must not hang the queen or stalemate.
  const good = (fenBefore, san) => {
    const t = new Chess(fenBefore);
    const mv = t.move(san);
    const after = t.fen();
    if (pk.mode === 'win') {
      if (mv.promotion) {
        const hangs = t.attackers(mv.to, t.turn()).length > 0 && t.attackers(mv.to, mv.color).length === 0;
        return !hangs && !t.isStalemate();
      }
      return K.probe(after).result === 'loss'; // black to move: must be lost for black
    }
    return (after.split(' ')[0].includes('p') ? K.probe(after) : { result: 'draw' }).result === 'draw';
  };
  for (const m of act.moves) {
    const fenBefore = g.fen();
    const trainee = g.turn() === 'w';
    if (trainee) {
      for (const san of [m.san, ...m.also]) {
        if (!good(fenBefore, san)) { problems++; console.log('PROBLEM', pk.mode, pk.lesson, fenBefore, san); }
      }
    }
    g.move(m.san);
  }
  out.push({ lesson: pk.lesson, mode: pk.mode, fen: act.fen, end: pk.line.end, ev: pk.ev, moves: act.moves.map(({ san, side, unique, alts, also, raw, before }) => ({ san, side, unique, alts, also, raw, before })), flip: act.flip });
}
require('fs').writeFileSync(path.join(__dirname, '.out/lines.json'), JSON.stringify(out, null, 1));
console.log('verified', out.length, 'lines; problems:', problems);
for (const l of out) {
  const g = new Chess(l.fen);
  let txt = '';
  l.moves.forEach((m, i) => { txt += (m.side === (l.mode === 'win' ? 'att' : 'def') ? (m.unique ? '' : `(${m.alts})`) : '') + m.san + ' '; });
  console.log(`${l.lesson.padEnd(10)} ${l.fen.padEnd(32)} ${txt}=> ${l.end}`);
}
