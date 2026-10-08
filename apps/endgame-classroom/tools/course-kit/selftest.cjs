// Checks the toolkit's solver and line player (npm run kit:selftest, a few minutes). Fails loudly.
// Optional arguments limit it to some tables: node tools/course-kit/selftest.cjs KRRK KQRK
//   1. K+P vs K: win/draw agrees with the separate King & Pawn solver (../kpk-course/kpk.cjs) on every position.
//   2. For each table, on sampled positions (random ones, positions in check, and with pawns, positions in
//      check with a pawn on its starting square):
//      - the solver's legal moves are exactly chess.js's;
//      - every move can be taken back by the solver's retrograde step (the position is found again);
//      - the stored value follows from the values its moves lead to, with chess.js's moves (win = 1 +
//        fastest losing reply, loss = 1 + slowest winning reply, else draw; mate and stalemate agree).
//   3. The longest mates, compared with the published values.
//   4. Lines played by line.cjs pass verify.cjs.
//   5. Goal 'promotion' (plies to a safe promotion): K+P vs K gives exactly the King & Pawn solver's values
//      on every position; on sampled K+P+P vs K positions the moves are chess.js's and every value follows
//      from its moves (a promotion counts when it makes a queen or a rook that cannot be taken, it is not
//      stalemate and the position stays won); a line played with this measure passes verify.cjs.
//      And the whole K+P vs K and K+P+P vs K tables equal pawn/oracle.cjs, a separate implementation
//      (full tables, move counters, its own move generation), on every position.
//      Run alone with: node tools/course-kit/selftest.cjs promotion
const { Chess } = require('chess.js');
const { table, probe, probePromotion } = require('./solver.cjs');
const { boardFen, sqName } = require('./board.cjs');
const { playLine } = require('./line.cjs');
const { verifyLine } = require('./verify.cjs');

const only = process.argv.slice(2);
let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failures++; };

// ---- 1. K+P vs K against the King & Pawn course's own solver ----
if (!only.length || only.includes('KPK')) {
  const KPK = require('../kpk-course/kpk.cjs');
  const T = table('KPK');
  const sqs = new Int8Array(3);
  let n = 0, diff = 0;
  for (let wk = 0; wk < 64; wk++) for (let bk = 0; bk < 64; bk++) for (let p = 8; p < 56; p++) for (const stm of [0, 1]) {
    if (!KPK.legal(wk, bk, p, stm)) continue;
    sqs[0] = wk; sqs[1] = bk; sqs[2] = p;
    const v = T.value(sqs, stm);
    if ((KPK.dtc[KPK.idx(wk, bk, p, stm)] > 0) !== (stm === 0 ? v > 0 : v < 0)) diff++;
    n++;
  }
  check(diff === 0, `KPK: ${n} positions, win/draw agrees with kpk.cjs (${diff} differences)`);
}

// ---- 2 + 3. every table ----
// Published longest mates (moves, the stronger side to move); null = no published value checked.
const TABLES = { KQK: 10, KRK: 16, KPK: 28, KQQK: 4, KQRK: 6, KRRK: 7, KQKR: 35, KRKP: null };
const LETTERS = (name) => { const i = name.indexOf('K', 1); return [...'Kk', ...name.slice(1, i), ...name.slice(i + 1).toLowerCase()]; };
let seed = 12345;
const rnd = (n) => { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return seed % n; }; // 32-bit LCG
const valueOf = (fen) => { const r = probe(fen); return r.result === 'win' ? r.dtm : r.result === 'loss' ? -r.dtm - 1 : 0; };
const SAMPLES = 400; // per kind of position
for (const [name, published] of Object.entries(TABLES)) {
  if (only.length && !only.includes(name)) continue;
  const t0 = Date.now();
  const T = table(name);
  const ms = Date.now() - t0;
  let longest = 0;
  for (let i = 0; i < T.size; i++) if (T.val[i] > longest) longest = T.val[i];
  const letters = LETTERS(name);
  const pawn = [...T.typ].indexOf(5);
  const kinds = {
    random: () => true,
    'in check': (sqs, stm) => T.inCheck(sqs, stm),
    // a pawn on its first square, its side in check: the double step may block where the single one cannot
    ...(pawn >= 0 ? { 'in check with a pawn on its first square': (sqs, stm) =>
      T.col[pawn] === stm && (sqs[pawn] >> 3) === (stm === 0 ? 1 : 6) && T.inCheck(sqs, stm) } : {}),
  };
  const sqs = new Int8Array(T.n), buf = new Int16Array(4 * 256), ubuf = new Int8Array(256);
  let tested = 0, badMoves = 0, badBack = 0, badValue = 0;
  for (const [kind, want] of Object.entries(kinds)) {
    for (let found = 0, tries = 0; found < SAMPLES && tries < 5e6; tries++) {
      const i = rnd(T.size);
      const stm = T.decode(i, sqs);
      if (!T.legal(sqs, stm) || T.index(sqs, stm) !== i || !want(sqs, stm)) continue;
      found++; tested++;
      const fen = `${boardFen([...sqs].map((s, k) => [s, letters[k]]))} ${stm ? 'b' : 'w'} - - 0 1`;
      const g = new Chess(fen);
      // moves: the solver's list against chess.js's
      const m = T.moves(sqs, stm, buf);
      const mine = [];
      for (let x = 0; x < m; x++) mine.push(sqName(sqs[buf[x * 4]]) + sqName(buf[x * 4 + 1]) + (buf[x * 4 + 2] >= 0 ? 'qrbn'[buf[x * 4 + 2] - 1] : ''));
      const theirs = g.moves({ verbose: true }).map((mv) => mv.from + mv.to + (mv.promotion ?? ''));
      if (mine.sort().join() !== theirs.sort().join()) { if (badMoves < 3) console.log(`     ${fen}: moves ${mine.join(',')} / chess.js ${theirs.join(',')}`); badMoves++; }
      // every move inside the table can be taken back to this very position
      for (let x = 0; x < m; x++) {
        if (buf[x * 4 + 2] >= 0 || buf[x * 4 + 3] >= 0) continue;
        const k = buf[x * 4], from = sqs[k];
        sqs[k] = buf[x * 4 + 1];
        const u = T.unmoves(sqs, 1 - stm, ubuf);
        let back = false;
        for (let y = 0; y < u && !back; y++) {
          const kk = ubuf[2 * y], t = sqs[kk];
          sqs[kk] = ubuf[2 * y + 1];
          back = T.index(sqs, stm) === i && T.predecessorLegal(sqs, 1 - stm);
          sqs[kk] = t;
        }
        sqs[k] = from;
        if (!back) { if (badBack < 3) console.log(`     ${fen}: move ${sqName(from)}-${sqName(buf[x * 4 + 1])} not found backwards`); badBack++; }
      }
      // the value follows from the moves
      let expect;
      const moves = g.moves();
      if (!moves.length) expect = g.isCheckmate() ? -1 : 0;
      else {
        let win = 0, oppMax = -1, draw = false;
        for (const san of moves) {
          const c = new Chess(fen); c.move(san);
          const v = c.isCheckmate() ? -1 : c.isStalemate() || c.isInsufficientMaterial() ? 0 : valueOf(c.fen());
          if (v < 0) { if (!win || -v < win) win = -v; } else if (v > 0) oppMax = Math.max(oppMax, v); else draw = true;
        }
        expect = win ? win : draw ? 0 : -(oppMax + 1) - 1;
      }
      if (expect !== T.val[i]) { if (badValue < 3) console.log(`     ${fen} (${kind}): stored ${T.val[i]}, from its moves ${expect}`); badValue++; }
    }
  }
  const mv = (longest + 1) / 2;
  check(!badMoves && !badBack && !badValue, `${name}: ${tested} positions (${Object.keys(kinds).join(', ')}): moves = chess.js (${badMoves} wrong), ` +
    `taken back (${badBack} wrong), values consistent (${badValue} wrong); longest mate ${mv} moves; built in ${(ms / 1000).toFixed(1)} s`);
  if (published) check(mv === published, `${name}: longest mate ${mv} = published ${published}`);
}

// ---- 4. lines played with best play pass the independent check ----
if (!only.length) for (const [fen, goal] of [['8/8/8/4k3/8/8/8/R3K2R w - - 0 1', 'mate'], ['8/8/3k4/8/8/2Q5/1R6/4K3 w - - 0 1', 'mate'],
  ['8/8/8/8/8/2k5/3p4/K4R2 w - - 0 1', 'mate'], ['8/8/8/8/2k5/8/3PK3/8 w - - 0 1', 'mate'], ['4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', 'promotion']]) {
  const l = playLine(fen, { goal });
  const r = verifyLine({ fen, moves: l.plies.map((p) => ({ san: p.san, also: p.also })) }, { goal, probe });
  check(!l.end.startsWith('error') && r.problems.length === 0,
    `${fen} (${goal}): ${l.plies.length} plies to ${l.end}, verified (${r.problems.length} problems): ${l.plies.map((p) => p.san).join(' ')}`);
  for (const p of r.problems.slice(0, 3)) console.log(`     ${p}`);
}

// ---- 5. goal 'promotion' ----
if (!only.length || only.includes('promotion')) {
  const KPK = require('../kpk-course/kpk.cjs');
  const T1 = table('KPK', { goal: 'promotion' });
  const s3 = new Int8Array(3);
  let n = 0, diff = 0;
  for (let wk = 0; wk < 64; wk++) for (let bk = 0; bk < 64; bk++) for (let p = 8; p < 56; p++) for (const stm of [0, 1]) {
    if (!KPK.legal(wk, bk, p, stm)) continue;
    s3[0] = wk; s3[1] = bk; s3[2] = p;
    const v = T1.value(s3, stm);
    if ((v > 0 ? v : v < 0 ? -v - 1 : 0) !== KPK.dtc[KPK.idx(wk, bk, p, stm)]) diff++;
    n++;
  }
  check(diff === 0, `KPK, goal 'promotion': ${n} positions, plies to the promotion = kpk.cjs (${diff} differences)`);

  const t0 = Date.now();
  const T = table('KPPK', { goal: 'promotion' });
  const ms = Date.now() - t0;
  const enc = (r) => (r.result === 'win' ? r.dtc : r.result === 'loss' ? -r.dtc - 1 : 0);
  const kinds = {
    random: () => true,
    'in check': (sqs, stm) => T.inCheck(sqs, stm),
    'a promotion to play': (sqs, stm) => stm === 0 && ((sqs[2] >> 3) === 6 || (sqs[3] >> 3) === 6),
  };
  const sqs = new Int8Array(4), buf = new Int16Array(4 * 256);
  let tested = 0, badMoves = 0, badValue = 0;
  for (const [kind, want] of Object.entries(kinds)) {
    for (let found = 0, tries = 0; found < SAMPLES && tries < 5e6; tries++) {
      const i = rnd(T.size);
      const stm = T.decode(i, sqs);
      if (!T.legal(sqs, stm) || T.index(sqs, stm) !== i || !want(sqs, stm)) continue;
      found++; tested++;
      const fen = `${boardFen([...sqs].map((q, k) => [q, 'KkPP'[k]]))} ${stm ? 'b' : 'w'} - - 0 1`;
      const g = new Chess(fen);
      const m = T.moves(sqs, stm, buf);
      const mine = [];
      for (let x = 0; x < m; x++) mine.push(sqName(sqs[buf[x * 4]]) + sqName(buf[x * 4 + 1]) + (buf[x * 4 + 2] >= 0 ? 'qrbn'[buf[x * 4 + 2] - 1] : ''));
      const theirs = g.moves({ verbose: true }).map((mv) => mv.from + mv.to + (mv.promotion ?? ''));
      if (mine.sort().join() !== theirs.sort().join()) { if (badMoves < 3) console.log(`     ${fen}: moves ${mine.join(',')} / chess.js ${theirs.join(',')}`); badMoves++; }
      let expect;
      const moves = g.moves({ verbose: true });
      if (!moves.length) expect = g.isCheckmate() ? -1 : 0;
      else {
        let win = 0, oppMax = -1, draw = false;
        for (const mv of moves) {
          const c = new Chess(fen); c.move(mv.san);
          let v;
          if (c.isCheckmate()) v = -1;
          else if (c.isStalemate() || c.isInsufficientMaterial()) v = 0;
          else if (mv.promotion) v = 'qr'.includes(mv.promotion) && !c.moves({ verbose: true }).some((y) => y.to === mv.to) && probe(c.fen()).result === 'loss' ? -1 : 0; // a safe queen or rook: the goal
          else v = enc(probePromotion(c.fen()));
          if (v < 0) { if (!win || -v < win) win = -v; } else if (v > 0) oppMax = Math.max(oppMax, v); else draw = true;
        }
        expect = win ? win : draw ? 0 : -(oppMax + 1) - 1;
      }
      if (expect !== T.val[i]) { if (badValue < 3) console.log(`     ${fen} (${kind}): stored ${T.val[i]}, from its moves ${expect}`); badValue++; }
    }
  }
  // every position against the independent oracle
  {
    const oracle = require('./pawn/oracle.cjs');
    const t1 = Date.now();
    let m = 0, diff = 0;
    const s4 = new Int8Array(4);
    for (const n of [1, 2]) {
      const Tn = n === 1 ? T1 : T;
      for (let wk = 0; wk < 64; wk++) for (let bk = 0; bk < 64; bk++) for (let a = 8; a < 56; a++) for (let b = n === 1 ? 55 : a + 1; b < 56; b++) for (const stm of [0, 1]) {
        const ps = n === 1 ? [a] : [a, b];
        if (!oracle.legal(wk, bk, ps, stm)) continue;
        m++;
        const o = oracle.value([wk, bk, ...ps], stm);
        const sq = n === 1 ? Int8Array.of(wk, bk, a) : (s4[0] = wk, s4[1] = bk, s4[2] = a, s4[3] = b, s4);
        const v = Tn.value(sq, stm);
        if ((v > 0 ? v : v < 0 ? -v - 1 : -1) !== o) { if (diff < 3) console.log(`     ${[wk, bk, ...ps]} ${stm}: solver ${v}, oracle ${o}`); diff++; }
      }
    }
    check(diff === 0, `KPK and KPPK, goal 'promotion': every position (${m}) equals the independent oracle (${diff} differences, ${((Date.now() - t1) / 1000).toFixed(0)} s)`);
  }
  check(!badMoves && !badValue, `KPPK, goal 'promotion': ${tested} positions (${Object.keys(kinds).join(', ')}): moves = chess.js (${badMoves} wrong), values consistent (${badValue} wrong); built in ${(ms / 1000).toFixed(1)} s`);

  const fen = '8/8/8/4k3/8/8/3PP3/4K3 w - - 0 1';
  const opts = { goal: 'promotion', probe, promotionProbe: probePromotion };
  const l = playLine(fen, opts);
  const r = verifyLine({ fen, moves: l.plies.map((p) => ({ san: p.san, also: p.also })) }, opts);
  check(!l.end.startsWith('error') && r.problems.length === 0,
    `${fen} (promotion, two pawns): ${l.plies.length} plies to ${l.end}, verified (${r.problems.length} problems): ${l.plies.map((p) => p.san).join(' ')}`);
  for (const p of r.problems.slice(0, 3)) console.log(`     ${p}`);
}

console.log(failures ? `selftest: ${failures} FAILED` : 'selftest: all passed');
process.exit(failures ? 1 : 0);
