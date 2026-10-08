// Finds the teaching positions of the ladder-mate course (K+R+R vs K, K+Q+R vs K) and plays every line
// to mate with the exact solver: White a fastest mate, Black the longest defence. Every line is then
// turned so that the mate happens on the 8th rank, the edge the learner faces.
const fs = require('fs');
const path = require('path');
const { table } = require('../course-kit/solver.cjs');
const { file, rank, dist, ring, isCorner, SYM8, canon8 } = require('../course-kit/board.cjs');

const SYMT = SYM8.map((f) => Int8Array.from({ length: 64 }, (_, s) => f(s)));
const MATERIAL = { rr: 'KRRK', qr: 'KQRK' };
// piece index in the tables: 0 white king, 1 black king, 2 and 3 the two pieces (KQRK: 2 queen, 3 rook)

const { box, guarded } = require('./geometry.cjs');

// ---------- lines with best play ----------
/**
 * White: a fastest mate; among equally fast moves a piece move before a king move (the ladder needs no
 * king), then the smallest box, then the pieces furthest from the black king (out of its reach). The
 * others are kept as just as good. Black: the longest defence; among equally long ones the king stays
 * central, then it goes for an unguarded piece. Returns null if Black would capture a piece.
 */
function playLine(T, start) {
  const sqs = Int8Array.from(start);
  const plies = [];
  for (let n = 0; n < 20; n++) {
    const os = T.options(sqs, 0).filter((o) => o.v > 0);
    if (!os.length) return null;
    const best = Math.min(...os.map((o) => o.v));
    const tops = os.filter((o) => o.v === best).map((o) => {
      const c = Int8Array.from(sqs); c[o.piece] = o.to;
      return { ...o, boxN: box(T, c).length, reach: Math.min(dist(c[2], c[1]), dist(c[3], c[1])) };
    });
    tops.sort((a, b) => (a.piece === 0) - (b.piece === 0) || a.boxN - b.boxN || b.reach - a.reach || a.from - b.from || a.to - b.to);
    const p = tops[0];
    plies.push({ side: 'w', piece: p.piece, from: p.from, to: p.to, others: tops.slice(1).map((o) => ({ piece: o.piece, from: o.from, to: o.to })), before: [...sqs] });
    sqs[p.piece] = p.to;
    if (best === 1) return { plies, final: [...sqs] };
    const bo = T.options(sqs, 1);
    if (bo.some((o) => o.v >= 0)) return null;
    const worst = Math.min(...bo.map((o) => o.v));
    const bt = bo.filter((o) => o.v === worst).map((o) => {
      const c = Int8Array.from(sqs); c[1] = o.to;
      const hits = [2, 3].some((k) => dist(c[k], o.to) === 1 && !guarded(T, c, k));
      return { ...o, hits };
    });
    bt.sort((a, b) => ring(a.to) - ring(b.to) || b.hits - a.hits || a.to - b.to);
    if (bt[0].capture) return null;
    plies.push({ side: 'b', piece: 1, from: sqs[1], to: bt[0].to, before: [...sqs] });
    sqs[1] = bt[0].to;
  }
  return null;
}

/** Turn a line so that the mate is on the 8th rank (the mating piece on it if it mates along it); null if the mate is not on an edge. */
function orient(line) {
  const fin = line.final, last = line.plies[line.plies.length - 1];
  const cands = [];
  for (let y = 0; y < 8; y++) {
    const T = SYMT[y];
    if (rank(T[fin[1]]) !== 7) continue;
    const along = rank(T[fin[last.piece]]) === 7 ? 0 : rank(T[fin[last.piece]]) === 6 ? 1 : 2;
    const key = line.plies[0].before.map((s) => String(T[s]).padStart(2, '0')).join('');
    cands.push({ y, along, key });
  }
  if (!cands.length) return null; // a mate away from the edge: not what this course teaches
  cands.sort((a, b) => a.along - b.along || (a.key < b.key ? -1 : 1));
  const T = SYMT[cands[0].y];
  const tr = (s) => T[s];
  return {
    plies: line.plies.map((p) => ({ ...p, from: tr(p.from), to: tr(p.to), before: p.before.map(tr),
      others: p.others?.map((o) => ({ ...o, from: tr(o.from), to: tr(o.to) })) })),
    final: fin.map(tr),
  };
}

// ---------- candidate positions: White to move, a single fastest first move ----------
function candidates(name) {
  const T = table(name);
  const sqs = new Int8Array(4);
  const out = [];
  for (let i = 0; i < T.size; i += 2) {
    const v = T.val[i];
    if (v <= 0 || v > 13) continue;
    T.decode(i, sqs);
    if (!T.legal(sqs, 0) || T.index(sqs, 0) !== i) continue;
    const os = T.options(sqs, 0);
    const tops = os.filter((o) => o.v === v);
    if (tops.length !== 1) continue;
    out.push({ i, v, sqs: [...sqs], first: tops[0], stalemates: os.filter((o) => o.v === 0 && stalemate(T, sqs, o)).length });
  }
  return { T, out };
}
function stalemate(T, sqs, o) {
  const c = Int8Array.from(sqs); c[o.piece] = o.to;
  return T.moves(c, 1, new Int16Array(1024)) === 0 && !T.inCheck(c, 1);
}

// ---------- lesson groups ----------
// m = which material, M = [min, max] mate in M moves, clean = the white king never moves
const GROUPS = [];
const G = (o) => GROUPS.push({ count: 1, clean: true, ...o });
const far = (c) => dist(c.sqs[0], c.sqs[1]) >= 3; // the white king is not helping
const finalOf = (L) => L.final;
const matedBy = (L) => L.plies[L.plies.length - 1].piece;
// 1. The final picture
G({ lesson: 'picture', id: 'pic-rr-edge', m: 'rr', M: [1, 1], count: 2, pre: far,
  post: (L) => { const f = finalOf(L), k = matedBy(L); return !isCorner(f[1]) && rank(f[k]) === 7 && rank(f[5 - k]) === 6; } });
G({ lesson: 'picture', id: 'pic-rr-corner', m: 'rr', M: [1, 1], pre: far, post: (L) => isCorner(finalOf(L)[1]) });
G({ lesson: 'picture', id: 'pic-qr-kiss', m: 'qr', M: [1, 1], pre: far,
  post: (L) => matedBy(L) === 2 && dist(finalOf(L)[2], finalOf(L)[1]) === 1 });
G({ lesson: 'picture', id: 'pic-qr-qedge', m: 'qr', M: [1, 1], pre: far,
  post: (L) => { const f = finalOf(L); return matedBy(L) === 2 && rank(f[2]) === 7 && dist(f[2], f[1]) > 1 && rank(f[3]) === 6; } });
G({ lesson: 'picture', id: 'pic-qr-redge', m: 'qr', M: [1, 1], pre: far,
  post: (L) => { const f = finalOf(L); return matedBy(L) === 3 && rank(f[3]) === 7 && dist(f[3], f[1]) > 1; } });
G({ lesson: 'picture', id: 'pic-rr-m2', m: 'rr', M: [2, 2], pre: far });
G({ lesson: 'picture', id: 'pic-qr-m2', m: 'qr', M: [2, 2], pre: far });
// 2. The ladder with two rooks
G({ lesson: 'ladder-rr', id: 'lad-rr', m: 'rr', M: [4, 6], count: 12, minScore: 0.6, scarce: 1, pre: (c) => ring(c.sqs[1]) <= 2 && far(c) });
// 3. The king attacks a rook: it switches to the far side
const switches = (c) => {
  const k = c.first.piece;
  if (k === 0) return false;
  const T = table(MATERIAL[c.m]);
  return dist(c.sqs[k], c.sqs[1]) === 1 && !guarded(T, c.sqs, k) && dist(c.first.to, c.sqs[1]) >= 4 &&
    (rank(c.first.to) === rank(c.sqs[k]) || file(c.first.to) === file(c.sqs[k]));
};
G({ lesson: 'switch', id: 'sw-rr', m: 'rr', M: [3, 6], count: 8, scarce: 2, pre: (c) => far(c) && switches(c) });
// 4. The ladder with queen and rook
G({ lesson: 'ladder-qr', id: 'lad-qr', m: 'qr', M: [3, 5], count: 10, minScore: 0.6, scarce: 1, pre: (c) => ring(c.sqs[1]) <= 2 && far(c) });
// 5. Don't stalemate
// one or two moves stalemate (the trap is a real temptation, and the red arrows stay readable)
G({ lesson: 'stalemate', id: 'st-rr', m: 'rr', M: [2, 4], count: 4, pre: (c) => c.stalemates > 0 && c.stalemates <= 2 });
G({ lesson: 'stalemate', id: 'st-qr', m: 'qr', M: [2, 4], count: 4, pre: (c) => c.stalemates > 0 && c.stalemates <= 2 });
// 6. Final exam (the white king may help)
G({ lesson: 'exam', id: 'ex-rr', m: 'rr', M: [5, 7], count: 3, clean: false, minScore: 0.5, pre: (c) => ring(c.sqs[1]) <= 1 });
G({ lesson: 'exam', id: 'ex-qr', m: 'qr', M: [4, 6], count: 3, clean: false, minScore: 0.5, pre: (c) => ring(c.sqs[1]) <= 1 });
G({ lesson: 'exam', id: 'ex-sw', m: 'rr', M: [4, 7], count: 2, clean: false, scarce: 2, pre: switches });
// 7. Extra practice
G({ lesson: 'practice', id: 'pr-rr', m: 'rr', M: [3, 7], count: 12, clean: false });
G({ lesson: 'practice', id: 'pr-qr', m: 'qr', M: [3, 6], count: 12, clean: false });

// ---------- search ----------
const pools = {};
for (const m of Object.keys(MATERIAL)) {
  const { T, out } = candidates(MATERIAL[m]);
  for (const c of out) c.m = m;
  pools[m] = { T, out, lines: new Map() };
}
const lineOf = (c) => {
  const p = pools[c.m];
  if (!p.lines.has(c.i)) { const l = playLine(p.T, c.sqs); p.lines.set(c.i, l && orient(l)); }
  return p.lines.get(c.i);
};
const evaluate = (L) => { const w = L.plies.filter((p) => p.side === 'w'); const u = w.filter((p) => !p.others.length).length; return { n: w.length, uniq: u, score: u / w.length }; };

// Variety: a new line may not start where another line starts or passes, the black king may not walk
// another line's path (or its mirror image), and at most a quarter of its positions (at least one) may
// appear elsewhere. Lessons 1 and 5 (short pictures and traps) only differ from each other.
const used = new Set(), seen = new Set(), starts = new Set(), paths = new Set();
// the same position under any mirror image; two rooks are interchangeable, so their order does not count
const posKey = (m, s) => m + SYMT.map((T) => { const t = s.map((x) => T[x]); if (m === 'rr' && t[2] > t[3]) [t[2], t[3]] = [t[3], t[2]]; return t.join('-'); }).sort()[0];
const picked = [];
const order = [...GROUPS].sort((a, b) => (b.scarce ?? 0) - (a.scarce ?? 0));
for (const g of order) {
  const [lo, hi] = g.M;
  const cands = [];
  for (const c of pools[g.m].out) {
    const M = (c.v + 1) / 2;
    if (M < lo || M > hi || (g.pre && !g.pre(c))) continue;
    if (g.clean && c.first.piece === 0) continue;
    const L = lineOf(c);
    if (!L) continue;
    if (g.clean && L.plies.some((p) => p.side === 'w' && p.piece === 0)) continue;
    if (g.post && !g.post(L)) continue;
    const ev = evaluate(L);
    if (g.minScore && ev.score < g.minScore) continue;
    // natural starts (as the learner sees them, mate on the 8th rank): the white king at home, far from
    // the mating edge; the pieces not next to the black king (unless the lesson is about that)
    const o = L.plies[0].before;
    const look = (rank(o[0]) <= 2 ? 0 : rank(o[0]) <= 4 ? 1 : 3) + (g.id.includes('sw') ? 0 : [2, 3].filter((k) => dist(o[k], o[1]) === 1).length);
    const positions = L.plies.filter((p) => p.side === 'w').map((p) => posKey(g.m, p.before));
    const bkPath = L.plies.filter((p) => p.side === 'w').map((p) => p.before[1]);
    const path = [bkPath.join('-'), bkPath.map((s) => s ^ 7).join('-')].sort()[0];
    cands.push({ c, L, ev, look, positions, path, key: positions[0], kings: g.m + canon8(o[0], o[1]) });
  }
  cands.sort((a, b) => b.ev.score - a.ev.score || a.look - b.look || b.ev.n - a.ev.n || a.c.i - b.c.i);
  const short = g.lesson === 'picture' || g.lesson === 'stalemate';
  const chosen = [];
  for (const x of cands) {
    if (chosen.length >= g.count) break;
    if (used.has(x.key)) continue;
    // inside the short lessons: other kings and another king's walk for every line
    // (a mate in 1 has no walk to compare: only its kings)
    if (short && picked.concat(chosen.map((y) => ({ lesson: g.lesson, x: y }))).some((p) => p.lesson === g.lesson && p.x &&
      (p.x.kings === x.kings || (x.positions.length > 1 && p.x.path === x.path)))) continue;
    if (!short) {
      if (seen.has(x.positions[0]) || x.positions.some((k) => starts.has(k)) || paths.has(x.path)) continue;
      if (x.positions.filter((k) => seen.has(k)).length > Math.max(1, Math.floor(x.positions.length / 4))) continue;
    }
    chosen.push(x);
    used.add(x.key);
    if (short) continue;
    starts.add(x.positions[0]);
    paths.add(x.path);
    for (const k of x.positions) seen.add(k);
  }
  if (chosen.length < g.count) throw new Error(`${g.id}: only ${chosen.length} of ${g.count} positions found (${cands.length} candidates)`);
  console.log(`${g.id.padEnd(13)} candidates=${String(cands.length).padStart(6)} picked=${chosen.length} unique=${chosen.map((x) => `${x.ev.uniq}/${x.ev.n}`).join(' ')}`);
  for (const x of chosen) picked.push({ lesson: g.lesson, group: g.id, m: g.m, line: x.L, ev: x.ev, x });
}
picked.sort((a, b) => GROUPS.findIndex((g) => g.id === a.group) - GROUPS.findIndex((g) => g.id === b.group));
fs.mkdirSync(path.join(__dirname, '.out'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '.out/picked.json'), JSON.stringify(picked, (k, v) => (k === 'x' ? undefined : v))); // x: search-only data
console.log('total', picked.length);
