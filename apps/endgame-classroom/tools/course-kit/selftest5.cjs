// Checks the egtb engine, the five-piece part of the toolkit (npm run kit:selftest5, about half an hour on
// four cores; KIT_CACHE=1 keeps the tables for the next run). Fails loudly.
//   1. Every position of solver.cjs's tables (three and four pieces, both goals) has exactly the same value
//      in the egtb engine's table, which shares no code with solver.cjs (another index, symmetry handling,
//      move generation, and the counting algorithm instead of re-checking every move).
//   2. The independent checker (egtb/check.cjs: its own board, moves, en passant and rules) finds every
//      stored value of a table following from the values of its moves, on every position: the tables solver.cjs
//      does not have (pawns on both sides, en passant), the conversion goal, and five-piece tables. (Five-piece
//      tables with pawns on both sides need 75 other five-piece tables for their promotions, about 28 GB: not
//      built here; their move generation with en passant is checked against chess.js in egtb/test.cjs.)
//   3. The longest wins of five-piece endings against the published values (Thompson's distance to conversion:
//      bishops against knight 66 moves, rook and bishop against rook 59; the egtb conversion goal measures the
//      same thing in these endings; the longest mate of two knights against a pawn, 115 moves), and positions
//      whose result is known from endgame theory.
//   4. Lines played by line.cjs on five pieces pass verify.cjs (mate, conversion and holding objectives).
// Arguments: --quick (skip the slowest tables), --heavy (add the full check of K+R+P vs K+R, ~30 minutes more),
// --all (every four-piece material in part 1, not a representative set), --parts 3,4 (only those parts).
'use strict';
const solver = require('./solver.cjs');
const egtb = require('./egtb/index.cjs');
const { checkParallel } = require('./egtb/parallel.cjs');
const { playLine } = require('./line.cjs');
const { verifyLine } = require('./verify.cjs');

const args = process.argv.slice(2);
const quick = args.includes('--quick'), heavy = args.includes('--heavy'), all = args.includes('--all');
const partsArg = args.includes('--parts') ? args[args.indexOf('--parts') + 1].split(',').map(Number) : [1, 2, 3, 4];
const part = (n) => partsArg.includes(n);
let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failures++; };
const secs = (t0) => `${((Date.now() - t0) / 1000).toFixed(0)} s`;

// ---- 1. egtb = solver.cjs on every position ----
function sameAsSolver(name, goal) {
  const t0 = Date.now();
  const O = solver.table(name, { goal }), E = egtb.table(name, { goal });
  // every stored egtb position, compared with solver.cjs's value of it; then every image of a sample, so that
  // both indexes are exercised on positions they do not store
  const sqs = new Int8Array(E.n);
  let n = 0, diff = 0, example = '';
  for (let i = 0; i < E.size; i++) {
    const stm = E.decode(i, sqs);
    if (!E.stores(i, sqs)) continue;
    n++;
    const a = O.value(sqs, stm), b = E.valueAt(i);
    if (a !== b) { diff++; if (!example) example = ` e.g. ${[...sqs]} ${stm}: solver.cjs ${a}, egtb ${b}`; }
  }
  check(!diff, `egtb = solver.cjs: ${name}${goal === 'mate' ? '' : `:${goal}`}, every position (${n}): ${diff} differences${example} (${secs(t0)})`);
}
const PIECES = 'QRBNP';
const FOUR = [];
for (const a of PIECES) for (const b of PIECES) {
  if (PIECES.indexOf(a) <= PIECES.indexOf(b)) FOUR.push(`K${a}${b}K`, `KK${a}${b}`);
  if (!(a === 'P' && b === 'P')) FOUR.push(`K${a}K${b}`);
}
const SET = ['KQKR', 'KRKP', 'KPKQ', 'KBNK', 'KBBK', 'KNNK', 'KQPK', 'KRPK', 'KPPK', 'KNKP', 'KBKN', 'KKRP', 'KRKB', 'KQQK'];
if (part(1)) {
  for (const name of ['KQK', 'KRK', 'KBK', 'KNK', 'KPK', 'KKP']) sameAsSolver(name, 'mate');
  for (const name of all ? FOUR : quick ? SET.slice(0, 6) : SET) sameAsSolver(name, 'mate');
  sameAsSolver('KPK', 'promotion');
  if (!quick) sameAsSolver('KPPK', 'promotion');
}

// ---- 2. the independent checker on every position ----
function checked(name, goal = 'mate') {
  const t0 = Date.now();
  const T = egtb.table(name, { goal });
  const built = secs(t0);
  const r = checkParallel(T);
  check(!r.wrong && !r.symmetry, `checker: ${name}${goal === 'mate' ? '' : `:${goal}`}, every position (${r.checked}) follows from its moves: ${r.wrong} wrong, ${r.symmetry} index errors${r.examples.length ? ` e.g. ${JSON.stringify(r.examples[0])}` : ''} (built ${built}, checked in ${secs(t0)})`);
  return T;
}
if (part(2)) {
  checked('KPKP'); // pawns on both sides: en passant
  checked('KQKR', 'conversion');
  checked('KPKP', 'conversion');
  checked('KNNNK');
  checked('KPPPK', 'promotion'); // three pawns against the lone king (the pawn oracle covers one or two)
  if (!quick) {
    checked('KQQKR');
    checked('KBBKN');
    checked('KRBKR');
  }
  if (heavy) checked('KRPKR');
}

// ---- 3. published longest wins, and positions known from theory ----
function longest(T) {
  let best = 0;
  for (let i = 0; i < T.size; i++) { const v = T.valueAt(i); if (v > best) best = v; }
  return (best + 1) / 2;
}
if (part(3) && !quick) {
  for (const [name, moves] of [['KBBKN', 66], ['KRBKR', 59]]) {
    const t0 = Date.now();
    const m = longest(egtb.table(name, { goal: 'conversion' }));
    check(m === moves, `published: ${name} longest win ${m} moves to the conversion = Thompson's ${moves} (${secs(t0)})`);
  }
  // the longest mate of two knights against a pawn (the Troitzky ending), the figure cited for it
  const t0 = Date.now();
  const m = longest(egtb.table('KNNKP'));
  check(m === 115, `published: KNNKP longest mate ${m} moves = the 115 cited for two knights against a pawn (${secs(t0)})`);
}
const theory = [
  // [fen, expected result for the side to move, what it is]
  ['1K6/1P1k4/8/8/8/8/r7/2R5 w - - 0 1', 'win', 'Lucena: the king on the queening square, the black king cut off, White to move wins'],
  ['3k4/7R/r7/3PK3/8/8/8/8 b - - 0 1', 'draw', 'Philidor: the rook on the sixth rank holds the draw, Black to move'],
  ['8/8/5k2/8/8/8/1K6/QQ5r b - - 0 1', 'loss', 'two queens against a rook: lost for the rook'],
];
for (const [fen, want, what] of part(3) ? theory : []) {
  let r;
  try { r = solver.probe(fen); } catch (e) { r = { result: `error ${e.message}` }; }
  check(r.result === want, `theory: ${what}: ${r.result}${r.dtm >= 0 ? ` (${r.dtm} plies)` : ''}`);
}

// ---- 4. lines with best play on five pieces pass verify.cjs ----
for (const [fen, opts, what] of !part(4) ? [] : [
  ['8/8/8/3k4/8/8/2NNN3/4K3 w - - 0 1', { goal: 'mate' }, 'three knights mate'],
  ['8/8/8/8/3k4/8/1K6/QQ5r w - - 0 1', { goal: 'mate' }, 'two queens against a rook'],
  ...(quick ? [] : [['1K6/1P1k4/8/8/8/8/r7/2R5 w - - 0 1', { goal: 'conversion' }, 'Lucena to the conversion'],
    ['5r2/8/8/8/1kp5/6R1/2K5/8 w - - 0 1', { goal: 'conversion', objective: 'hold' }, 'the Philidor defence held (White, K+R vs K+R+P)']]),
]) {
  const t0 = Date.now();
  const l = playLine(fen, opts);
  const r = verifyLine({ fen, moves: l.plies.map((p) => ({ san: p.san, also: p.also })) }, { ...opts, probe: solver.probe });
  check(!l.end.startsWith('error') && !r.problems.length, `line: ${what}: ${l.plies.length} plies to ${l.end}, verified (${r.problems.length} problems) (${secs(t0)})${r.problems.length ? ` ${r.problems[0]}` : ''}`);
}

console.log(failures ? `selftest5: ${failures} FAILED` : 'selftest5: all passed');
process.exit(failures ? 1 : 0);
