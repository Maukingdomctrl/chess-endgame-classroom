// Finding teaching positions in a solved table (any material the toolkit solves, five pieces included).
//
//   const { scan, analyse, fenOf } = require('./egtb/positions.cjs');
//   for (const c of scan(T, { stm: 0, result: 'win', plies: [9, 25], sample: 0.01, limit: 200 })) {
//     const a = analyse(T, c.sqs, c.stm);   // every move with its exact value, what kind of move it is
//     if (a.unique && a.best[0].kind === 'quiet') ...
//   }
//
// scan() walks the stored positions in index order (deterministic), cheapest test first: the stored value,
// then opts.pre(sqs, stm) on the squares, then legality. opts.sample takes a fixed, seeded share of them (the
// same share every run); opts.limit stops early. analyse() then reads every move from the table: its value,
// whether it is a fastest win, the only move that keeps the result, a capture / promotion / underpromotion /
// en passant / check / quiet move, whether it stalemates; and zugzwang (the side to move would rather pass).
// The command line prints candidates with their properties:
//
//   node tools/course-kit/egtb/positions.cjs KRPKR --goal conversion --result win --plies 9-25 --unique --limit 20
//   node tools/course-kit/egtb/positions.cjs KRKRP --result draw --only --limit 20      (defensive resources)
//
// Values are the table's (v > 0 the side to move wins in v plies, v < 0 it is lost in -v - 1, 0 draw); for a
// conversion table, "plies" count to White's winning capture or promotion.
'use strict';
const { Chess } = require('chess.js');
const { boardFen, sqName } = require('../board.cjs');

const LETTER = 'KQRBNP';
/** FEN of a table position (no en passant rights). */
function fenOf(T, sqs, stm) {
  return `${boardFen([...sqs].map((s, k) => [s, T.col[k] ? LETTER[T.typ[k]].toLowerCase() : LETTER[T.typ[k]]]))} ${stm ? 'b' : 'w'} - - 0 1`;
}
const resultOf = (v) => (v > 0 ? 'win' : v < 0 ? 'loss' : 'draw');
const pliesOf = (v) => (v > 0 ? v : v < 0 ? -v - 1 : 0);

/**
 * Stored positions of table T matching opts, in index order: yields { i, sqs (a copy), stm, v }.
 * opts.stm 0 | 1; opts.result 'win' | 'draw' | 'loss' (for the side to move); opts.plies [lo, hi]; opts.pre(sqs,
 * stm) -> bool; opts.sample (0..1, seeded: the same positions every run); opts.limit; opts.from / opts.to.
 */
function* scan(T, opts = {}) {
  const sqs = new Int8Array(T.n);
  const from = opts.from ?? 0, to = Math.min(opts.to ?? T.size, T.size);
  const [lo, hi] = opts.plies ?? [0, Infinity];
  let seed = opts.seed ?? 1009, found = 0;
  // the side to move alternates with the index; which parity is White's depends on the table (a colour-swapped
  // view has them the other way round)
  const step = opts.stm === 0 || opts.stm === 1 ? 2 : 1;
  const flip = T.decode(0, sqs); // the side to move of index 0
  for (let i = from + (step === 2 && ((from & 1) ^ flip) !== opts.stm ? 1 : 0); i < to; i += step) {
    if (opts.sample < 1) { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; if (seed / 4294967296 >= opts.sample) continue; }
    const v = T.valueAt(i);
    if (opts.result && resultOf(v) !== opts.result) continue;
    const p = pliesOf(v);
    if (opts.result !== 'draw' && (p < lo || p > hi)) continue;
    const stm = T.decode(i, sqs);
    if (opts.pre && !opts.pre(sqs, stm)) continue;
    if (!T.stores(i, sqs)) continue; // illegal, or stored under another image
    yield { i, sqs: Int8Array.from(sqs), stm, v };
    if (opts.limit && ++found >= opts.limit) return;
  }
}

/**
 * Every move of a position with its exact value and kind: { fen, value, result, moves, best, unique, keep,
 * only, zugzwang }. moves: [{ san, from, to, promo, v (for the mover), kind, check, stalemate, best, keeps }];
 * best: the fastest wins (or every drawing move in a draw, the longest defences in a loss); keep: the moves
 * that keep the result; only: exactly one move keeps it; unique: exactly one best move.
 */
function analyse(T, sqs, stm) {
  const fen = fenOf(T, sqs, stm);
  const g = new Chess(fen);
  const opts = T.options(sqs, stm);
  const value = T.value(sqs, stm);
  const bySq = new Map(g.moves({ verbose: true }).map((m) => [m.from + m.to + (m.promotion ?? ''), m]));
  const moves = opts.map((o) => {
    const m = bySq.get(sqName(o.from) + sqName(o.to) + o.promo);
    const after = new Chess(fen); after.move(m.san);
    const kind = o.promo ? (o.promo === 'q' ? 'promotion' : 'underpromotion') : o.ep ? 'en passant' : o.capture ? 'capture' : 'quiet';
    return { san: m.san, from: o.from, to: o.to, promo: o.promo, piece: m.piece, v: o.v, kind, check: after.inCheck(), stalemate: after.isStalemate() };
  });
  const result = resultOf(value);
  for (const m of moves) m.keeps = resultOf(m.v) === result;
  let best;
  if (result === 'win') { const fast = Math.min(...moves.filter((m) => m.v > 0).map((m) => m.v)); best = moves.filter((m) => m.v === fast); }
  else if (result === 'draw') best = moves.filter((m) => m.v === 0);
  else { const slow = Math.min(...moves.map((m) => m.v)); best = moves.filter((m) => m.v === slow); }
  for (const m of moves) m.best = best.includes(m);
  const keep = moves.filter((m) => m.keeps);
  // zugzwang: with the other side to move (when that is legal) the side to move would do better
  let zugzwang = null;
  if (!g.inCheck() && T.legal(sqs, 1 - stm)) {
    const other = -T.value(sqs, 1 - stm); // the opponent's value, seen from the side to move now
    const rank = (v) => (v > 0 ? 2 : v === 0 ? 1 : 0);
    zugzwang = rank(other) > rank(value);
  }
  return { fen, value, result, plies: pliesOf(value), moves, best, unique: best.length === 1, keep, only: keep.length === 1, zugzwang };
}

module.exports = { scan, analyse, fenOf };

if (require.main === module) {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const name = args.find((a) => /^K[QRBNP]*K[QRBNP]*$/.test(a));
  if (!name) {
    console.error('usage: node tools/course-kit/egtb/positions.cjs <material> [--goal mate|conversion|promotion] [--stm w|b] [--result win|draw|loss] [--plies lo-hi] [--unique] [--only] [--kind capture|promotion|underpromotion|quiet|check] [--zugzwang] [--sample 0.01] [--limit 20]');
    process.exit(2);
  }
  const solver = require('../solver.cjs');
  const goal = opt('--goal', 'mate');
  const T = solver.table(name, { goal });
  const plies = opt('--plies') ? opt('--plies').split('-').map(Number) : undefined;
  const stm = opt('--stm') === 'b' ? 1 : opt('--stm') === 'w' ? 0 : undefined;
  const limit = +opt('--limit', 20), kind = opt('--kind');
  let shown = 0, seen = 0;
  for (const c of scan(T, { stm, result: opt('--result'), plies, sample: opt('--sample') ? +opt('--sample') : undefined })) {
    seen++;
    const a = analyse(T, c.sqs, c.stm);
    if (args.includes('--unique') && !a.unique) continue;
    if (args.includes('--only') && !a.only) continue;
    if (args.includes('--zugzwang') && !a.zugzwang) continue;
    if (kind && !a.best.some((m) => (kind === 'check' ? m.check : m.kind === kind))) continue;
    const bestTxt = a.best.map((m) => `${m.san}${m.kind !== 'quiet' ? ` (${m.kind})` : ''}`).join(', ');
    const traps = a.moves.filter((m) => !m.keeps && (m.check || m.kind !== 'quiet' || m.stalemate)).map((m) => `${m.san}${m.stalemate ? ' stalemates' : ` ${resultOf(m.v) === 'draw' ? 'draws' : 'loses'}`}`);
    console.log(`${a.fen}  ${a.result}${a.plies ? ` in ${a.plies} plies` : ''}; best ${bestTxt}${a.only ? '; the only move' : ''}${a.zugzwang ? '; zugzwang' : ''}${traps.length ? `; traps: ${traps.slice(0, 4).join(', ')}` : ''}`);
    if (++shown >= limit) break;
  }
  console.log(`${shown} shown of ${seen} candidates scanned`);
}
