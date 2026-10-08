// Finds the teaching positions of the two-connected-pawns course (K+P+P vs K): lesson groups, ranking and
// variety. The lines themselves are played by ./lines.cjs.
const fs = require('fs');
const path = require('path');
const { file, rank, dist } = require('../course-kit/board.cjs');
const { T2, pawns, whiteMoves, playLine, stalemates, candidates } = require('./lines.cjs');

const cands = candidates();
/** The single fastest first move of a candidate, or null when there are several. */
function firstMove(c) {
  if (c.first === null && c.v === 1) { const w = whiteMoves([...c.sqs]); c.first = w && w.tops.length === 1 ? w.tops[0] : false; }
  return c.first || null;
}

// ---------- lesson groups ----------
// v = [min, max] plies to the promotion; count = lines; scarce groups pick first
const GROUPS = [];
const G = (o) => GROUPS.push({ count: 1, ...o });
const pd = (s) => Math.min(dist(s[0], s[2]), dist(s[0], s[3])); // the white king's distance to its pawns
const side = (s) => rank(s[2]) === rank(s[3]);
const inFront = (s) => rank(s[1]) > Math.max(rank(s[2]), rank(s[3])) && file(s[1]) >= Math.min(file(s[2]), file(s[3])) - 1 && file(s[1]) <= Math.max(file(s[2]), file(s[3])) + 1;
const whiteK = (L) => L.plies.filter((p) => p.side === 'w' && p.piece === 0);
const captured = (L) => L.plies.some((p) => p.capture);
const queen = (L) => L.promo === 'q';
// the white king takes no part: it controls no square on the pawns' way to the 8th rank, all line long
const away = (s) => pawns(s).every((p) => { for (let t = p + 8; t < 64; t += 8) if (dist(s[0], t) < 2) return false; return true; });
const alone = (L) => L.plies.every((p) => p.side === 'b' || away(p.before));
// 1. Promote safely: short finishes; for the one-movers, the other pawn's queen would be lost or stalemate
const otherFails = (c) => T2.options(Int8Array.from(c.sqs), 0).some((o) => o.promo === 'q' && o.v <= 0 && o.piece !== firstMove(c).piece);
G({ lesson: 'finish', id: 'fin-1', v: [1, 1], count: 3, scarce: 2, pre: (c) => firstMove(c)?.promo === 'q' && otherFails(c), post: (L) => !captured(L) && queen(L) });
G({ lesson: 'finish', id: 'fin-2', v: [3, 3], count: 3, scarce: 2, post: (L) => !captured(L) && queen(L) });
G({ lesson: 'finish', id: 'fin-3', v: [5, 5], count: 2, scarce: 2, post: (L) => !captured(L) && queen(L) });
// The solver finds no line where the pawns promote on their own against a king standing in front of them:
// then they need their king (lessons 4 and 5). In lessons 2 and 3 the black king stands next to them.
const near = (s, d = 2) => pawns(s).some((p) => dist(s[1], p) <= d);
// 2. Side by side: the pawns run on their own, the white king far away (two and three moves to the queen)
const sideRun = { lesson: 'side', scarce: 2, minScore: 0.75,
  pre: (c) => side(c.sqs) && pd(c.sqs) >= 3 && near(c.sqs, 3) && !inFront(c.sqs) && c.first.piece !== 0,
  post: (L) => !captured(L) && !whiteK(L).length && alone(L) && queen(L) };
G({ ...sideRun, id: 'side-2', v: [3, 3], count: 4 });
G({ ...sideRun, id: 'side-3', v: [5, 5], count: 4 });
// 3. If the king takes one, the other runs (the white king far away all line long)
G({ lesson: 'grab', id: 'grab', v: [3, 9], count: 8, scarce: 2, minScore: 0.6,
  pre: (c) => pd(c.sqs) >= 3 && near(c.sqs) && c.first.piece !== 0,
  post: (L) => captured(L) && !whiteK(L).length && alone(L) && queen(L) });
// 4. The chain protects itself: the white king walks over while the pawns hold
G({ lesson: 'chain', id: 'chain', v: [7, 25], count: 8, scarce: 2, minScore: 0.5,
  pre: (c) => !side(c.sqs) && pd(c.sqs) >= 3 && inFront(c.sqs) && c.first.piece === 0,
  post: (L) => !captured(L) && L.plies.filter((p) => p.side === 'w').slice(0, 2).every((p) => p.piece === 0) && queen(L) });
// 5. Escort them with your king
G({ lesson: 'escort', id: 'escort', v: [9, 25], count: 10, scarce: 1, minScore: 0.5,
  pre: (c) => pd(c.sqs) <= 1 && inFront(c.sqs), post: (L) => !captured(L) && whiteK(L).length >= 2 && queen(L) });
// 6. Don't stalemate: a stalemate trap on the first move, and once a rook instead of a queen
G({ lesson: 'stalemate', id: 'stalemate', v: [3, 9], count: 5, scarce: 3, pre: (c) => (c.traps ??= stalemates(c.sqs)).length > 0, post: (L) => !captured(L) && queen(L) });
G({ lesson: 'stalemate', id: 'st-rook', v: [1, 1], count: 1, scarce: 3, pre: (c) => firstMove(c)?.promo === 'r', post: (L) => L.promo === 'r' });
// 7. Final exam (no marks)
G({ lesson: 'exam', id: 'ex-far', v: [11, 25], count: 3, minScore: 0.5, pre: (c) => pd(c.sqs) >= 3 && inFront(c.sqs), post: (L) => !captured(L) && queen(L) });
G({ lesson: 'exam', id: 'ex-esc', v: [11, 25], count: 3, minScore: 0.5, pre: (c) => pd(c.sqs) <= 2 && inFront(c.sqs), post: (L) => !captured(L) && queen(L) });
G({ lesson: 'exam', id: 'ex-grab', v: [9, 21], count: 2, minScore: 0.5, pre: (c) => pd(c.sqs) >= 2, post: (L) => captured(L) && queen(L) });
// 8. Extra practice
G({ lesson: 'practice', id: 'pr-near', v: [5, 21], count: 12, minScore: 0.5, pre: (c) => pd(c.sqs) <= 2, post: queen });
G({ lesson: 'practice', id: 'pr-far', v: [5, 21], count: 12, minScore: 0.5, pre: (c) => pd(c.sqs) >= 3, post: queen });

// ---------- search ----------
const lines = new Map();
const lineOf = (c) => { if (!lines.has(c.i)) lines.set(c.i, playLine(c.sqs)); return lines.get(c.i); };
const evaluate = (L) => { const w = L.plies.filter((p) => p.side === 'w'); const u = w.filter((p) => !p.others.length).length; return { n: w.length, uniq: u, score: u / w.length }; };
// the same position under the mirror image (files a <-> h), the two pawns in either order
const posKey = (s) => [s, s.map((q) => (q < 0 ? q : q ^ 7))].map((t) => {
  const p = t[3] < 0 ? [t[2]] : [Math.min(t[2], t[3]), Math.max(t[2], t[3])];
  return [t[0], t[1], ...p].join('-');
}).sort()[0];

// Variety: a new line may not start where another line starts or passes, the black king may not walk
// another line's path (or its mirror image), and at most a quarter of its positions (at least one) may
// appear elsewhere. Short lessons (finishes, stalemate traps) need other kings and other pawns in every
// line. Everywhere: every line its own white king and pawns, and at most a third of a group (two of a
// small one) on the same pair of files or with the same pattern (see shape below).
const used = new Set(), seen = new Set(), starts = new Set(), paths = new Set(), setups = new Set();
const picked = [];
const order = [...GROUPS].sort((a, b) => (b.scarce ?? 0) - (a.scarce ?? 0));
for (const g of order) {
  const [lo, hi] = g.v;
  const found = [];
  // big groups: an even sample of at most 3000 positions is played out (enough to choose from, and quick)
  const pool = cands.filter((c) => c.v >= lo && c.v <= hi && firstMove(c) && (!g.pre || g.pre(c)));
  const step = Math.ceil(pool.length / 3000);
  for (const c of pool.filter((_, k) => k % step === 0)) {
    const L = lineOf(c);
    if (!L || (g.post && !g.post(L))) continue;
    const ev = evaluate(L);
    if (g.minScore && ev.score < g.minScore) continue;
    const positions = L.plies.filter((p) => p.side === 'w').map((p) => posKey(p.before));
    const bk = L.plies.filter((p) => p.side === 'w').map((p) => p.before[1]);
    const path = [bk.join('-'), bk.map((q) => q ^ 7).join('-')].sort()[0];
    const kings = [[c.sqs[0], c.sqs[1]], [c.sqs[0] ^ 7, c.sqs[1] ^ 7]].map((k) => k.join('-')).sort()[0];
    // the white king and the pawns (mirror images alike), and the pawns alone, by files (b+c = f+g)
    const setup = [c.sqs, c.sqs.map((q) => q ^ 7)].map((t) => [t[0], Math.min(t[2], t[3]), Math.max(t[2], t[3])].join('-')).sort()[0];
    const pawnSet = [c.sqs, c.sqs.map((q) => q ^ 7)].map((t) => [Math.min(t[2], t[3]), Math.max(t[2], t[3])].join('-')).sort()[0];
    // the pattern, seen from the front pawn (mirror images alike): side by side or a chain, and where the
    // kings stand (ahead, level or behind; on the other pawn's side, the same file or the far side); a
    // white king more than two squares from its pawns counts as far
    const shape = [c.sqs, c.sqs.map((q) => q ^ 7)].map((t) => {
      const [fp, op] = rank(t[2]) > rank(t[3]) || (rank(t[2]) === rank(t[3]) && t[2] < t[3]) ? [t[2], t[3]] : [t[3], t[2]];
      const zone = (q) => `${Math.sign(rank(q) - rank(fp))}${Math.sign((file(q) - file(fp)) * (file(op) - file(fp)))}`;
      return [rank(op) - rank(fp), zone(t[1]), pd(t) <= 2 ? zone(t[0]) : 'far'].join('|');
    }).sort()[0];
    const files = Math.min(Math.min(file(c.sqs[2]), file(c.sqs[3])), 7 - Math.max(file(c.sqs[2]), file(c.sqs[3])));
    found.push({ c, L, ev, positions, path, kings, setup, pawnSet, shape, files, key: positions[0] });
  }
  found.sort((a, b) => b.ev.score - a.ev.score || b.ev.n - a.ev.n || a.c.i - b.c.i);
  const short = g.lesson === 'finish' || g.lesson === 'stalemate';
  const chosen = [];
  const sameFiles = Math.max(2, Math.ceil(g.count / 3)); // at most a third of a group (two of a small one) on the same pair of files
  for (const x of found) {
    if (chosen.length >= g.count) break;
    if (used.has(x.key) || setups.has(x.setup)) continue;
    if (chosen.filter((y) => y.files === x.files).length >= sameFiles) continue;
    const mine = picked.filter((p) => p.lesson === g.lesson).map((p) => p.x).concat(chosen);
    if (chosen.filter((y) => y.shape === x.shape).length >= sameFiles) continue; // the same pattern: at most a third of a group
    if (short) {
      // the short lessons: other kings, another walk of the king, and other pawns in every line
      if (mine.some((y) => y.kings === x.kings || y.pawnSet === x.pawnSet || (x.positions.length > 1 && y.path === x.path))) continue;
    } else {
      if (seen.has(x.positions[0]) || x.positions.some((k) => starts.has(k)) || paths.has(x.path)) continue;
      if (x.positions.filter((k) => seen.has(k)).length > Math.max(1, Math.floor(x.positions.length / 4))) continue;
    }
    chosen.push(x);
    used.add(x.key);
    setups.add(x.setup);
    if (short) continue;
    starts.add(x.positions[0]);
    paths.add(x.path);
    for (const k of x.positions) seen.add(k);
  }
  if (chosen.length < g.count) throw new Error(`${g.id}: only ${chosen.length} of ${g.count} positions found (${found.length} candidates)`);
  console.log(`${g.id.padEnd(10)} candidates=${String(found.length).padStart(6)} picked=${chosen.length} unique=${chosen.map((x) => `${x.ev.uniq}/${x.ev.n}`).join(' ')}`);
  for (const x of chosen) picked.push({ lesson: g.lesson, group: g.id, line: x.L, ev: x.ev, traps: x.c.traps ?? [], x });
}
picked.sort((a, b) => GROUPS.findIndex((g) => g.id === a.group) - GROUPS.findIndex((g) => g.id === b.group));
// show the lines on both wings: every second line of a lesson is mirrored (files a <-> h)
const nth = {};
for (const p of picked) {
  const k = (nth[p.lesson] = (nth[p.lesson] ?? -1) + 1);
  p.mirror = k % 2 === 1;
}
fs.mkdirSync(path.join(__dirname, '.out'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '.out/picked.json'), JSON.stringify(picked, (k, v) => (k === 'x' ? undefined : v))); // x: search-only data
console.log('total', picked.length);
