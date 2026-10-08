// Unit tests of the pawn toolkit (npm run kit:test, under a minute): geometry, structural keys, sampling,
// the cache and its invalidation, the independent oracle, and the checker, which must accept the real
// course and catch every kind of broken line. Fails loudly (exit code 1).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { sqIdx: q } = require('../board.cjs');
const G = require('./geometry.cjs');
const S = require('./structure.cjs');
const { sampleEvenly, sampleStratified } = require('./select.cjs');

let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failures++; };
const P = (...names) => names.map((x) => (x === '-' ? -1 : q(x))); // [wk, bk, p1, p2] from square names
const shift = (s, df, dr) => s.map((x) => (x < 0 ? x : x + df + 8 * dr));

// ---- geometry ----
check(G.pawns(P('a1', 'h8', 'c4', '-')).length === 1 && G.front(P('a1', 'h8', 'c4', 'd5')) === q('d5'), 'pawns() skips a taken pawn; front() is the most advanced pawn');
check(G.hangs(P('h1', 'c6', 'c5', '-'), q('c5')) && !G.hangs(P('h1', 'c6', 'c5', 'b4'), q('c5')) && !G.hangs(P('d4', 'c6', 'c5', '-'), q('c5')),
  'hangs(): an unprotected pawn next to the black king; not when a pawn or the king protects it');
check(G.catches(q('d5'), q('a5')) && !G.catches(q('e5'), q('a5')), 'catches(): the rule of the square (a5 pawn: d5 is inside, e5 outside)');
check(G.kingAway(P('h1', 'a8', 'c4', 'd4')) && !G.kingAway(P('d6', 'a8', 'c4', 'd4')), 'kingAway(): the white king off the pawns\' way');
check(G.blocks(P('h1', 'd7', 'c4', 'd5')) && !G.blocks(P('h1', 'g7', 'c4', 'd5')) && !G.blocks(P('h1', 'd3', 'c4', 'd5')), 'blocks(): the black king in front of the pawns');
check(G.connected(P('h1', 'a8', 'c4', 'd5')) && G.connected(P('h1', 'a8', 'c4', 'd4')) && !G.connected(P('h1', 'a8', 'c4', 'e4')) && !G.connected(P('h1', 'a8', 'c3', 'd5')), 'connected(): neighbouring files, at most a rank apart');

// ---- structural keys ----
const s1 = P('b1', 'e6', 'c4', 'd5');
const swap = [s1[0], s1[1], s1[3], s1[2]];
for (const [name, key] of Object.entries({ posKey: S.posKey, setupKey: S.setupKey, pawnSetKey: S.pawnSetKey, kingsKey: S.kingsKey, shapeKey: S.shapeKey, wingKey: S.wingKey })) {
  check(key(s1) === key(G.mirror(s1)) && key(s1) === key(swap), `${name}: the mirror image and the order of the pawns make no difference`);
}
check(S.pathKey([q('e6'), q('c6')]) !== S.pathKey([q('c6'), q('e6')]) && S.pathKey([q('e6'), q('c6')]) === S.pathKey([q('d6'), q('f6')]), 'pathKey: a mirrored walk is the same walk (the order counts)');
check(S.posKey(s1) !== S.posKey(shift(s1, 1, 0)), 'posKey is exact: one file further is another position');
check(S.shapeKey(s1) === S.shapeKey(shift(s1, 1, 0)) && S.shapeKey(s1) === S.shapeKey(shift(s1, 0, 1)), 'shapeKey is coarse: the same picture a file or a rank further is the same pattern');
check(S.shapeKey(s1) === S.shapeKey(P('b1', 'e7', 'c4', 'd5')), 'shapeKey: the black king one rank further ahead is still the same pattern');
check(S.shapeKey(s1) !== S.shapeKey(P('b1', 'e6', 'c5', 'd5')), 'shapeKey: side by side is another pattern than a chain');
check(S.shapeKey(P('c3', 'e6', 'c4', 'd5')) !== S.shapeKey(s1), 'shapeKey: a white king next to its pawns is another pattern than a far one');
check(S.shapeKey(P('h1', 'c8', 'c4', 'd5')) !== S.shapeKey(P('h1', 'h8', 'c4', 'd5')), 'shapeKey: the black king in front and far to the side are other patterns');
check(S.wingKey(P('h1', 'a8', 'a4', 'b5')) === S.wingKey(P('h1', 'a8', 'g4', 'h5')) && S.wingKey(P('h1', 'a8', 'a4', 'b5')) === 0, 'wingKey: a+b and g+h are the same pair of files');
const d = S.describe(s1);
check(d.formation === 'chain' && d.whiteKing === 'far' && /ahead/.test(d.blackKing), `describe(): ${JSON.stringify(d)}`);

// ---- sampling ----
const list = Array.from({ length: 10000 }, (_, i) => i);
const a = sampleEvenly(list, 3000), b = sampleEvenly(list, 3000);
check(a.length <= 3000 && a.length > 2000 && a[0] === 0 && a[a.length - 1] > 9990 && a.join() === b.join(), `sampleEvenly: ${a.length} of 10000, from the first to the last, the same every time`);
check(sampleEvenly(list, 500).length <= 500 && sampleEvenly(list.slice(0, 40), 3000).length === 40 && sampleEvenly([], 3000).length === 0, 'sampleEvenly: the limit is a parameter; a short list is kept whole');
const strat = sampleStratified([...Array(5000).fill('big'), ...Array(50).fill('small')].map((k, i) => ({ k, i })), 1000, (x) => x.k);
check(strat.filter((x) => x.k === 'small').length === 50 && strat.length <= 1050, `sampleStratified: the small stratum is kept (${strat.filter((x) => x.k === 'small').length} of 50), the big one sampled`);

// ---- the cache: round trip and invalidation ----
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-cache-test-'));
  const saved = process.env.KIT_CACHE;
  process.env.KIT_CACHE = '';
  const cache = require('../cache.cjs');
  cache.save('oracle', 'unit', Uint8Array.of(1, 2, 3));
  check(cache.load('oracle', 'unit', 3, Uint8Array) === null && fs.readdirSync(tmp).length === 0, 'cache: off without KIT_CACHE (nothing read or written)');
  process.env.KIT_CACHE = tmp;
  const vals = Int16Array.of(-5, 0, 7, 300);
  cache.save('solver', 'unit', vals);
  const back = cache.load('solver', 'unit', 4, Int16Array);
  check(back && back.join() === vals.join(), 'cache: what is saved is loaded back');
  check(cache.load('solver', 'unit', 5, Int16Array) === null && cache.load('solver', 'unit', 4, Uint8Array) === null && cache.load('oracle', 'unit', 4, Int16Array) === null,
    'cache: another size, value type or producer is not a hit');
  // a table from other code: the same file with another identity in its header must be ignored and reported stale
  const file = fs.readdirSync(tmp).map((f) => path.join(tmp, f))[0];
  const buf = fs.readFileSync(file);
  buf.write('0000000000000000', 24, 'latin1');
  fs.writeFileSync(file, buf);
  check(cache.load('solver', 'unit', 4, Int16Array) === null, 'cache: a file written by other code (another identity) is not used');
  check(cache.entries().length === 1 && !cache.entries()[0].current, 'cache: such a file is listed as stale');
  const r = spawnSync(process.execPath, [path.join(__dirname, '../cache.cjs'), 'prune'], { env: { ...process.env, KIT_CACHE: tmp }, encoding: 'utf8' });
  check(r.status === 0 && fs.readdirSync(tmp).length === 0, `cache prune removes stale files (${r.stdout.trim()})`);
  check(/^[0-9a-f]{16}$/.test(cache.identity('solver')) && cache.identity('solver') !== cache.identity('oracle'), 'cache: each producer has its own identity (a checksum of its code)');
  fs.rmSync(tmp, { recursive: true, force: true });
  process.env.KIT_CACHE = saved ?? '';
  if (saved === undefined) delete process.env.KIT_CACHE;
}

// ---- the independent oracle ----
const oracle = require('./oracle.cjs');
check(JSON.stringify(oracle.probe('8/8/8/4k3/8/8/3PP3/4K3 w - - 0 1')) === '{"result":"win","dtc":27}', 'oracle: d2+e2 against Ke5 promotes in 27 plies');
check(!oracle.safePromotion(q('f1'), q('h1'), q('b8'), 'q', [q('c6')]) && oracle.safePromotion(q('f1'), q('h1'), q('b8'), 'r', [q('c6')]), 'oracle: b8=Q is stalemate there, b8=R is safe');
check(!oracle.safePromotion(q('h1'), q('b7'), q('c8'), 'q', []) && oracle.safePromotion(q('h1'), q('b7'), q('c8'), 'q', [q('d7')]), 'oracle: a queen the king can take is not safe, unless a pawn protects it');
{
  const KPK = require('../../kpk-course/kpk.cjs');
  let n = 0, diff = 0, seed = 7;
  const rnd = (m) => { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return seed % m; };
  while (n < 3000) {
    const wk = rnd(64), bk = rnd(64), p = 8 + rnd(48), stm = rnd(2);
    if (!KPK.legal(wk, bk, p, stm) || !oracle.legal(wk, bk, [p], stm)) continue;
    n++;
    if (Math.max(0, oracle.value([wk, bk, p], stm)) !== KPK.dtc[KPK.idx(wk, bk, p, stm)]) diff++;
  }
  check(diff === 0, `oracle: one pawn agrees with the King & Pawn solver on ${n} random positions (${diff} differences)`);
}

// ---- the checker: accepts the course, catches broken lines ----
{
  const { checkPgn, checkGames } = require('./checker.cjs');
  const { readPgn } = require('../pgn.cjs');
  const { Chess } = require('chess.js');
  const file = path.join(__dirname, '../../../courses/connected-pawns-course.pgn');
  const text = fs.readFileSync(file, 'utf8');
  const ok = checkPgn(text);
  check(ok.problems.length === 0, `checker: the course passes (${ok.stats.lines} lines, ${ok.problems.length} problems)`);
  const games = () => readPgn(text);
  const has = (gs, re, label) => {
    const r = checkGames(gs);
    check(r.problems.some((p) => re.test(p)), `checker catches ${label}${r.problems.length ? '' : ' (no problem found!)'}`);
  };
  const long = (gs) => gs.find((g) => g.moves.length >= 7);
  const replay = (g, n) => { const c = new Chess(g.tags.FEN); g.moves.slice(0, n).forEach((m) => c.move(m.san)); return c; };
  { // a slower learner move
    const gs = games(), g = long(gs);
    const c = replay(g, 0);
    const slower = c.moves().find((san) => san !== g.moves[0].san && !g.moves[0].also.includes(san) && !new Chess(c.fen()).move(san).san.includes('='));
    g.moves = [{ ...g.moves[0], san: slower }];
    has(gs, /not a fastest move/, 'a learner move that is not the fastest');
  }
  { const gs = games(); long(gs).moves[0].also = ['Kh1']; has(gs, /\[%also\]/, 'an [%also] move that is not as fast'); }
  { const gs = games(); long(gs).moves.pop(); has(gs, /does not end in a safe promotion/, 'a line that stops before the promotion'); }
  { // a defence that is not the most stubborn: the first Black move in the course that has a weaker alternative
    const { blackValue } = require('./checker.cjs');
    const gs = games();
    let done = false;
    for (const g of gs) {
      for (let i = 1; i < g.moves.length && !done; i += 2) {
        const c = replay(g, i);
        const mine = blackValue(c.fen(), g.moves[i].san);
        const weaker = c.moves().find((san) => blackValue(c.fen(), san) < mine);
        if (!weaker) continue;
        g.moves = [...g.moves.slice(0, i), { ...g.moves[i], san: weaker }];
        has(gs, /not the most stubborn/, `a defence that is not the most stubborn (${g.tags.LineName}: ${weaker} instead of the line's move)`);
        done = true;
      }
      if (done) break;
    }
    if (!done) check(false, 'checker test: no Black move with a weaker alternative found in the course');
  }
  { // an arrow on the move to play
    const gs = games(), g = long(gs);
    const m = new Chess(g.tags.FEN).move(g.moves[0].san);
    g.intro = `[%cal R${m.from}${m.to}] ${g.intro}`;
    has(gs, /lies on the move to play/, 'an arrow the app would hide');
  }
  { const gs = games(); gs.push({ ...gs[3], tags: { ...gs[3].tags } }); has(gs, /the same start as/, 'a line used twice'); }
  { // the same line mirrored (files a <-> h)
    const gs = games(), g = gs[20];
    const flip = (f) => f.split(' ')[0].split('/').map((r) => r.replace(/\d/g, (x) => '.'.repeat(+x)).split('').reverse().join('').replace(/\.+/g, (x) => x.length)).join('/') + ' ' + f.split(' ').slice(1).join(' ');
    const c = new Chess(flip(g.tags.FEN));
    const fm = (sq) => 'hgfedcba'['abcdefgh'.indexOf(sq[0])] + sq[1];
    const mv = new Chess(g.tags.FEN);
    const moves = g.moves.map((m) => { const x = mv.move(m.san); return { ...m, san: c.move({ from: fm(x.from), to: fm(x.to), promotion: x.promotion }).san, also: [] }; });
    gs.push({ tags: { ...g.tags, FEN: flip(g.tags.FEN) }, intro: g.intro, moves });
    has(gs, /the same start as/, 'a mirrored copy of a line');
  }
  { // a rook where a safe queen was possible
    const gs = games(), g = gs.find((x) => x.moves[x.moves.length - 1].san.includes('=Q') && !x.moves[x.moves.length - 1].san.includes('#'));
    const last = g.moves[g.moves.length - 1];
    g.moves[g.moves.length - 1] = { ...last, san: new Chess(replay(g, g.moves.length - 1).fen()).move(last.san.replace('=Q', '=R').replace(/[+#]$/, '')).san };
    has(gs, /a safe queen was possible|does not promote safely/, 'a rook where a safe queen was possible');
  }
  { // a stalemating move
    const gs = games(), g = gs.find((x) => x.tags.LineName.startsWith("06. Don't stalemate!") && !x.moves[0].san.includes('='));
    const c = replay(g, 0);
    const trap = c.moves().find((san) => { const t = new Chess(c.fen()); t.move(san); return t.isStalemate(); });
    g.moves = [{ ...g.moves[0], san: trap }];
    has(gs, /does not win/, 'a move that stalemates');
  }
  { // too many lines of one group with the same pattern
    const gs = games();
    const byShape = new Map();
    gs.forEach((g, i) => { const s = require('./checker.cjs').squaresOf(g.tags.FEN); if (s.length === 4) { const k = S.shapeKey(s); if (!byShape.has(k)) byShape.set(k, []); byShape.get(k).push(i); } });
    const same = [...byShape.values()].find((v) => v.length >= 3).slice(0, 3);
    const sub = same.map((i) => gs[i]);
    const r = checkGames(sub, { lines: sub.map((g) => ({ fen: g.tags.FEN, group: 'one' })) });
    check(r.problems.some((p) => /same pattern/.test(p)), 'checker catches a group of three lines with one pattern (at most two)');
  }
  { // the PGN text says other moves than the course reader
    const gs = games();
    gs[0].text = text.split(/\n\n(?=\[Event )/)[1];
    has(gs, /chess.js reads other moves/, 'a game whose moves chess.js reads differently');
  }
}

console.log(failures ? `pawn kit tests: ${failures} FAILED` : 'pawn kit tests: all passed');
process.exit(failures ? 1 : 0);
