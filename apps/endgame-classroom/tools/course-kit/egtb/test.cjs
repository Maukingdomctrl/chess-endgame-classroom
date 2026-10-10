// Tests of the egtb engine (npm run kit:test5, a few minutes): index, move generation against chess.js (the
// engine's and the independent checker's), en passant, the goals, the solver.cjs routing, lines with best
// play on five pieces, and the egtb values against solver.cjs and the checker on small tables. Fails loudly.
//   npm run kit:test5 -- --budget   the same tests with a fresh disk cache and a 1 MB memory budget, so that
//                                   tables are dropped and read back from the disk all the time (the eviction
//                                   path of index.cjs, which ordinary runs never reach)
'use strict';
// every table of this test is solved on the worker threads (when there are several), small ones included, so
// that the parallel code is what the tests exercise; section 4c compares it with the one-thread solve
process.env.EGTB_PARALLEL_FROM ??= '1';
const budget = process.argv.includes('--budget');
if (budget) {
  const tmp = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'egtb-budget-'));
  Object.assign(process.env, { KIT_CACHE: tmp, EGTB_MEMORY: '1' }); // read when index.cjs is loaded
  process.on('exit', () => require('fs').rmSync(tmp, { recursive: true, force: true }));
}
const { Chess } = require('chess.js');
const egtb = require('./index.cjs');
const solver = require('../solver.cjs');
const { Layout } = require('./layout.cjs');
const { pseudoMoves, attackedBy, code } = require('./check.cjs');
const { checkParallel } = require('./parallel.cjs');
const { boardFen, sqName } = require('../board.cjs');
const { playLine } = require('../line.cjs');
const { verifyLine } = require('../verify.cjs');

let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failures++; };
// mulberry32: every bit is random (an LCG's low bits repeat with a short period, which correlates positions)
let seed = 4242;
const rnd = (n) => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
};
const LETTERS = (T) => [...T.typ].map((t, k) => { const ch = 'KQRBNP'[t]; return T.col[k] ? ch.toLowerCase() : ch; });
const fenOf = (T, sqs, stm, ep = '-') => `${boardFen([...sqs].map((s, k) => [s, LETTERS(T)[k]]))} ${stm ? 'b' : 'w'} - ${ep} 0 1`;

// ---- 1. the index: a random slot's position indexes to a slot holding the same position or a mirror image ----
const { SYM, MIRROR } = require('./geometry.cjs');
/** Is b an image of a under one of the symmetries (identical pieces in any order)? */
function imageOf(L, a, b) {
  const syms = L.pawns ? [0, MIRROR] : [0, 1, 2, 3, 4, 5, 6, 7];
  const set = (sq, T) => [...sq].map((s, k) => `${L.col[k]}${L.typ[k]}@${T ? T[s] : s}`).sort().join();
  return syms.some((y) => set(a, SYM[y]) === set(b));
}
for (const name of ['KQKR', 'KRRK', 'KBBKN', 'KQQQK', 'KRPKR', 'KPPKP', 'KPPPK', 'KNNKP']) {
  const L = new Layout(name);
  const sqs = new Int8Array(L.n), back = new Int8Array(L.n);
  let tried = 0, bad = 0;
  for (let t = 0; t < 4000; t++) {
    const i = rnd(L.size);
    const stm = L.decode(i, sqs);
    if (!L.valid(sqs)) continue;
    tried++;
    const j = L.index(sqs, stm);
    if (j < 0 || j >= L.size || L.decode(j, back) !== stm || !imageOf(L, sqs, back) || L.index(back, stm) !== j) bad++;
  }
  check(!bad && tried > 1000, `index ${name}: ${tried} random slots index to a slot with the same position or a mirror image (${bad} wrong); size ${L.size}, ${L.slices} slice(s)`);
}

// ---- 2. move generation against chess.js: the engine's and the checker's ----
function randomPosition(T, wantEp) {
  const sqs = new Int8Array(T.n);
  for (let tries = 0; tries < 100000; tries++) {
    const stm = rnd(2);
    for (let k = 0; k < T.n; k++) sqs[k] = T.typ[k] === 5 ? 8 + rnd(48) : rnd(64);
    if (!T.legal(sqs, stm)) continue;
    let ep = -1;
    if (wantEp) {
      // the side that just moved (1 - stm) made a double step with a pawn next to an enemy pawn
      const mover = 1 - stm, rank = mover === 0 ? 3 : 4;
      const cand = [...sqs.keys()].filter((k) => T.typ[k] === 5 && T.col[k] === mover && sqs[k] >> 3 === rank);
      if (!cand.length) continue;
      const k = cand[0], s = sqs[k], behind = s + (mover === 0 ? -8 : 8), start = s + (mover === 0 ? -16 : 16);
      if ([...sqs].includes(behind) || [...sqs].includes(start)) continue;
      const nextTo = [...sqs.keys()].some((o) => T.typ[o] === 5 && T.col[o] === stm && sqs[o] >> 3 === rank && Math.abs((sqs[o] & 7) - (s & 7)) === 1);
      if (!nextTo) continue;
      ep = behind;
    }
    return { sqs, stm, ep };
  }
  return null;
}
for (const [name, wantEp] of [['KQKR', false], ['KRPKR', false], ['KPPKP', false], ['KPKPP', true], ['KPPKP', true], ['KRPKP', true], ['KNNKP', false], ['KPPPK', false]]) {
  const T = new (require('./engine.cjs').EgtbTable)(name, 'mate', () => null);
  let n = 0, badEngine = 0, badChecker = 0, sample = '';
  const buf = new Int16Array(4 * 256), cbuf = new Int16Array(5 * 256);
  for (let t = 0; t < 600; t++) {
    const p = randomPosition(T, wantEp);
    if (!p) break;
    const fen = fenOf(T, p.sqs, p.stm, p.ep >= 0 ? sqName(p.ep) : '-');
    let theirs;
    try { theirs = new Chess(fen).moves({ verbose: true }).map((m) => m.from + m.to + (m.promotion ?? '')).sort().join(); } catch { continue; } // chess.js refuses some legal-by-rule FENs
    n++;
    const m = T.moves(p.sqs, p.stm, buf, p.ep);
    const mine = [];
    for (let x = 0; x < m; x++) mine.push(sqName(p.sqs[buf[x * 4]]) + sqName(buf[x * 4 + 1]) + (buf[x * 4 + 2] >= 0 ? 'kqrbnp'[buf[x * 4 + 2]] : ''));
    if (mine.sort().join() !== theirs) { badEngine++; if (!sample) sample = `${fen}: engine ${mine.join(',')} / chess.js ${theirs}`; }
    // the checker's own generator (pseudo-legal moves, then its own king-safety test)
    const board = new Int8Array(64);
    p.sqs.forEach((s, k) => { board[s] = code(T.col[k], T.typ[k]); });
    const cm = pseudoMoves(board, p.stm, p.ep, cbuf), legal = [];
    for (let x = 0; x < cm; x++) {
      const b = Int8Array.from(board), fr = cbuf[x * 5], to = cbuf[x * 5 + 1], pr = cbuf[x * 5 + 2], cs = cbuf[x * 5 + 3];
      if (cs >= 0) b[cs] = 0;
      b[to] = pr >= 0 ? code(p.stm, pr) : b[fr]; b[fr] = 0;
      if (!attackedBy(b, b.indexOf(code(p.stm, 0)), 1 - p.stm)) legal.push(sqName(fr) + sqName(to) + (pr >= 0 ? 'kqrbnp'[pr] : ''));
    }
    if (legal.sort().join() !== theirs) { badChecker++; if (!sample) sample = `${fen}: checker ${legal.join(',')} / chess.js ${theirs}`; }
  }
  check(n > 100 && !badEngine && !badChecker, `moves ${name}${wantEp ? ' with en passant' : ''}: ${n} random positions, engine = chess.js (${badEngine} wrong), checker = chess.js (${badChecker} wrong)${sample ? `  e.g. ${sample}` : ''}`);
}

// ---- 3. routing: solver.cjs builds what it always built, the egtb engine the rest ----
check(!solver.table('KQK').layout && !!solver.table('KPKP').layout && !!solver.table('KQK', { goal: 'conversion' }).layout,
  'routing: KQK by solver.cjs (unchanged), KPKP (pawns on both sides) and every conversion table by the egtb engine');

// ---- 3b. a colour-swapped material is answered from its stored twin (mate tables) ----
{
  const V = solver.table('KKNNN');
  const turnFen = (fen) => { const [b, s] = fen.split(' '); return `${b.split('/').reverse().map((r) => [...r].map((c) => (/[a-z]/.test(c) ? c.toUpperCase() : /[A-Z]/.test(c) ? c.toLowerCase() : c)).join('')).join('/')} ${s === 'w' ? 'b' : 'w'} - - 0 1`; };
  const sqs = new Int8Array(5);
  let n = 0, badValue = 0, badMoves = 0;
  while (n < 2000) {
    for (let k = 0; k < 5; k++) sqs[k] = rnd(64);
    const stm = rnd(2);
    if (!V.legal(sqs, stm)) continue;
    n++;
    const fen = `${boardFen([...sqs].map((s, k) => [s, 'Kknnn'[k]]))} ${stm ? 'b' : 'w'} - - 0 1`;
    if (JSON.stringify(solver.probe(fen)) !== JSON.stringify(solver.probe(turnFen(fen)))) badValue++;
    const mine = V.options(sqs, stm).map((o) => sqName(o.from) + sqName(o.to)).sort().join();
    if (mine !== new Chess(fen).moves({ verbose: true }).map((m) => m.from + m.to).sort().join()) badMoves++;
  }
  check(V.inner && V.inner.name === 'KNNNK' && !badValue && !badMoves, `colours swapped: KKNNN is a view of KNNNK; ${n} positions: value = the turned position's (${badValue} wrong), moves = chess.js (${badMoves} wrong)`);
}

// ---- 4. egtb against solver.cjs on every position of small tables, and the checker ----
for (const [name, goal] of [['KQK', 'mate'], ['KPK', 'mate'], ['KPK', 'promotion'], ['KRKN', 'mate'], ['KBNK', 'mate']]) {
  const O = solver.table(name, { goal }), E = egtb.table(name, { goal });
  const n = O.n, sqs = new Int8Array(n);
  let cnt = 0, diff = 0;
  const rec = (k) => {
    if (k === n) { for (let stm = 0; stm < 2; stm++) if (O.legal(sqs, stm)) { cnt++; if (O.value(sqs, stm) !== E.value(sqs, stm)) diff++; } return; }
    for (let s = 0; s < 64; s++) { sqs[k] = s; rec(k + 1); }
  };
  rec(0);
  check(!diff, `egtb = solver.cjs: ${name}${goal === 'mate' ? '' : `:${goal}`}, every position (${cnt}), ${diff} differences`);
}
for (const [name, goal] of [['KPKP', 'mate'], ['KQKR', 'conversion'], ['KRKP', 'conversion'], ['KPPK', 'promotion']]) {
  const r = checkParallel(egtb.table(name, { goal }));
  check(!r.wrong && !r.symmetry, `checker: ${name}:${goal}, every position (${r.checked}) follows from its moves (${r.wrong} wrong, ${r.symmetry} index errors)`);
}

// ---- 4b. the checker finds a corrupted value (each kind of value, made one ply longer, shorter, or a draw) ----
{
  const T = egtb.table('KRK');
  const sqs = new Int8Array(T.n);
  const kinds = { win: (v) => v > 1, loss: (v) => v < -1, draw: (v) => v === 0, mated: (v) => v === -1 };
  let tried = 0, missed = 0;
  for (const want of Object.values(kinds)) {
    let i = 0;
    while (i < T.size && !(T.stores(i, sqs) && want(T.valueAt(i)))) i++;
    const orig = T.val[i];
    for (const nv of [orig + 1, orig - 1, orig + 2, 0]) {
      if (nv < 0 || nv > 255 || nv === orig) continue;
      T.val[i] = nv; tried++;
      const r = require('./check.cjs').checkTable(T, { resolve: (name, goal) => egtb.table(name, { goal: goal ?? 'mate' }) });
      if (!r.wrong) missed++;
      T.val[i] = orig;
    }
  }
  check(tried >= 12 && !missed, `checker: ${tried} corrupted values (a win, a loss, a draw, a mate, each changed), ${missed} not found`);
}

// ---- 4c. threads change nothing: the tables solved on the worker threads equal a one-thread solve, byte for byte ----
// Both are solved here from scratch, never read from the disk cache (a cached table would make the test vacuous).
// The workers know tables by name: forget every table first, so that the new one is the one they solve into.
{
  const { EgtbTable } = require('./engine.cjs');
  const parallel = require('./parallel.cjs');
  const sub = (n, goal) => (n.length === 2 ? egtb.BARE : egtb.table(n, { goal }));
  for (const name of ['KQKR', 'KPKP']) { // pawnless: levels shared out with atomics; pawns: slices per worker
    egtb.reset();
    const pool = parallel.getPool();
    if (!pool) { console.log(`skip threads: ${name}: one thread only (EGTB_THREADS), nothing to compare`); continue; }
    const P = new EgtbTable(name, 'mate', sub);
    P.prepareExits();
    P.val = parallel.sharedZeros(Uint8Array, P.size);
    parallel.solveParallel(P, pool);
    const S = new EgtbTable(name, 'mate', sub);
    S.prepareExits(); S.solve();
    parallel.detach([P]);
    check(Buffer.compare(Buffer.from(P.val.buffer, P.val.byteOffset, P.val.byteLength), Buffer.from(S.val.buffer)) === 0,
      `threads: ${name} solved on ${pool.size} worker threads equals the one-thread solve byte for byte`);
  }
}

// ---- 5. en passant ----
{
  // the first position (search order) after White's double step where the capture en passant changes Black's
  // result: its value must be the best of its moves (chess.js's, the capture included) and differ without it
  let found = null;
  for (let p = 24; p < 32 && !found; p++) for (const df of [-1, 1]) {
    const q = p + df;
    if ((p & 7) + df < 0 || (p & 7) + df > 7) continue;
    for (let wk = 0; wk < 64 && !found; wk++) for (let bk = 0; bk < 64 && !found; bk++) {
      if (new Set([wk, bk, p, q, p - 8, p - 16]).size < 6) continue;
      const fen = `${boardFen([[wk, 'K'], [bk, 'k'], [p, 'P'], [q, 'p']])} b - ${sqName(p - 8)} 0 1`;
      let g;
      try { g = new Chess(fen); } catch { continue; }
      if (!g.moves().some((m) => m.includes('x')) || !solver.table('KPKP').legal(Int8Array.of(wk, bk, p, q), 1)) continue;
      const a = solver.probe(fen), b = solver.probe(fen.replace(` ${sqName(p - 8)} `, ' - '));
      if (a.result !== b.result) found = { fen, a, b };
    }
  }
  if (!found) check(false, 'en passant: no position found where the capture changes the result');
  else {
    const { fen, a, b } = found;
    const kids = new Chess(fen).moves().map((san) => { const t = new Chess(fen); t.move(san); return { san, r: solver.probe(t.fen()) }; });
    const enc = (r) => (r.result === 'win' ? r.dtm : r.result === 'loss' ? -r.dtm - 1 : 0);
    const vals = kids.map((k) => enc(k.r));
    const lost = vals.filter((v) => v < 0), drawn = vals.some((v) => v === 0);
    const expect = lost.length ? Math.min(...lost.map((v) => -v)) : drawn ? 0 : -Math.max(...vals) - 2;
    const ep = kids.find((k) => /x/.test(k.san) && k.san.length === 4);
    check(enc(a) === expect && !!ep, `en passant: ${fen}: ${JSON.stringify(a)} with the capture (= the best of its ${kids.length} moves, ${ep?.san} included), ${JSON.stringify(b)} without it`);
  }
  // a pinned pawn cannot take en passant (both pawns leave the rank: the rook on h5 would check the king on a5)
  const pin = new Chess('7k/2p5/8/KP5r/8/8/8/8 b - - 0 1'); pin.move('c5');
  // (move generation only: solving K+P vs K+R+P would need every table its promotions lead to)
  const T = new (require('./engine.cjs').EgtbTable)('KPKRP', 'mate', () => null);
  const { pieces, stm } = solver.fenPieces(pin.fen());
  const buf = new Int16Array(4 * 256);
  const m = T.moves(Int8Array.from(pieces.map((x) => x.sq)), stm, buf, 42 /* c6 */);
  const theirs = new Chess(pin.fen()).moves();
  let toC6 = false;
  for (let x = 0; x < m; x++) if (buf[x * 4 + 1] === 42) toC6 = true;
  check(!toC6 && m === theirs.length && !theirs.includes('bxc6'), `en passant: a pinned pawn may not take en passant (${m} moves, as chess.js: ${theirs.join(' ')})`);
}

// ---- 6. lines with best play on five pieces pass the independent verification ----
{
  for (const [fen, goal] of [['8/8/8/3k4/8/8/2NNN3/4K3 w - - 0 1', 'mate'], ['8/8/8/8/3k4/8/1K6/QQ5r w - - 0 1', 'mate']]) {
    const l = playLine(fen, { goal });
    const r = verifyLine({ fen, moves: l.plies.map((p) => ({ san: p.san, also: p.also })) }, { goal, probe: solver.probe });
    check(!l.end.startsWith('error') && !r.problems.length, `line ${fen} (${goal}): ${l.plies.length} plies to ${l.end}, verified (${r.problems.length} problems)`);
  }
  // goal 'conversion' on four pieces (the rook wins the pawn; Black's capture does not end the line)
  const fen = '8/8/8/8/8/2k5/3p4/K4R2 w - - 0 1';
  const l = playLine(fen, { goal: 'conversion' });
  const r = verifyLine({ fen, moves: l.plies.map((p) => ({ san: p.san, also: p.also })) }, { goal: 'conversion', probe: solver.probe });
  check(l.end === 'conversion' && /x/.test(l.plies[l.plies.length - 1].san) && !r.problems.length, `conversion line ${fen}: ${l.plies.map((p) => p.san).join(' ')} (${l.end}), verified`);
  const short = verifyLine({ fen, moves: l.plies.slice(0, -2).map((p) => ({ san: p.san, also: p.also })) }, { goal: 'conversion', probe: solver.probe });
  check(short.problems.some((p) => /does not end in checkmate or a capture or promotion that keeps the win/.test(p)), 'conversion line: stopped before the conversion it is rejected');
}

if (budget) check(egtb.evictions() > 0, `memory budget: ${egtb.evictions()} tables dropped and read back from the disk (budget 1 MB), every test above still passed`);
console.log(failures ? `egtb tests: ${failures} FAILED` : 'egtb tests: all passed');
process.exit(failures ? 1 : 0);
