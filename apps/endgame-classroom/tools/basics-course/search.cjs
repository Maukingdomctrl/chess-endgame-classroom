// Finds clean teaching positions for each lesson and plays every line to its end (mate or promotion).
const fs = require('fs');
const path = require('path');
const E = require('./engine.cjs');
const { M, KP, ring, onEdge, isCorner, directOpp, knightJump, box, isWait, whiteOptions, playMate, boxSizes, monotone } = E;
const { K } = KP;
const { file, rank, dist } = M;

// ---------- symmetry: the same position mirrored or rotated is not picked twice ----------
const SYM = [];
for (const fx of [0, 1]) for (const fy of [0, 1]) for (const tr of [0, 1])
  SYM.push((s) => { let f = file(s), r = rank(s); if (tr) [f, r] = [r, f]; if (fx) f = 7 - f; if (fy) r = 7 - r; return r * 8 + f; });
const canonMate = (...sqs) => SYM.map((t) => sqs.map(t).join('-')).sort()[0];
const canonPawn = (wk, bk, p) => [[wk, bk, p], [wk ^ 7, bk ^ 7, p ^ 7]].map((a) => a.join('-')).sort()[0];

// Positions already in the King & Pawn course are not reused.
const kpCourse = fs.readFileSync(path.join(__dirname, '../../courses/king-and-pawn-course.pgn'), 'utf8');
const kpFens = new Set([...kpCourse.matchAll(/\[FEN "([^"]+)"\]/g)].map((m) => m[1].split(' ')[0]));
const boardFen = (pcs) => {
  const b = Array(64).fill(null);
  for (const [sq, c] of pcs) b[sq] = c;
  const rows = [];
  for (let r = 7; r >= 0; r--) {
    let row = '', e = 0;
    for (let f = 0; f < 8; f++) { const c = b[r * 8 + f]; if (!c) e++; else { if (e) row += e; e = 0; row += c; } }
    if (e) row += e;
    rows.push(row);
  }
  return rows.join('/');
};

// ---------- lesson groups ----------
// kind: 'q' | 'r' (mate with queen/rook) or 'p' (king + pawn, ends with a safe promotion).
// M = mate in M moves (White to move). n = number of learner moves in the line.
const GROUPS = [];
const G = (o) => GROUPS.push({ count: 1, ...o });
const top = (s) => rank(s) === 7; // lessons drive the king to the 8th rank, the side the learner faces
// Among equally fast moves, the rook lines show the rook's waiting move (engine.cjs; the others are
// listed as alternatives).
const preferWait = (o, s) => (isWait(M.solver('r'), o, s) ? 0 : 1);

// 1. The king is a fighting piece (K+P vs K): pushing the pawn only draws, the king must step up.
const kingOnly = (s, os) => {
  const win = os.filter((o) => o.win);
  return new Set(win.map((o) => `${o.from}-${o.to}`)).size === 1 && win[0].kind === 'k' && os.some((o) => o.kind === 'p' && !o.win);
};
G({ lesson: 'king', id: 'king-far', kind: 'p', count: 2, minN: 6, maxN: 10,
  pre: (s) => rank(s.p) >= 1 && rank(s.p) <= 3 && rank(s.wk) <= rank(s.p) && dist(s.wk, s.p) >= 3 && dist(s.bk, s.p) <= 4,
  first: (m, s, os) => kingOnly(s, os) && ring(m.to) < ring(s.wk) });
G({ lesson: 'king', id: 'king-near', kind: 'p', count: 2, minN: 5, maxN: 9,
  pre: (s) => rank(s.p) >= 1 && rank(s.p) <= 3 && rank(s.wk) <= rank(s.p) && dist(s.wk, s.p) <= 2 && dist(s.bk, s.p) <= 3,
  first: (m, s, os) => kingOnly(s, os) && rank(m.to) > rank(s.wk) });

// 2. Mating patterns on the edge and in the corner: the final picture, mate in 1 or 2.
const mateBy = (line) => line.plies[line.plies.length - 1];
G({ lesson: 'patterns', id: 'pat-q-kiss', kind: 'q', minM: 1, maxM: 1,
  pre: (s) => onEdge(s.bk) && !isCorner(s.bk) && top(s.bk), first: (m, s) => m.kind === 'x' && dist(m.to, s.bk) === 1 });
G({ lesson: 'patterns', id: 'pat-q-edge', kind: 'q', minM: 1, maxM: 1,
  pre: (s) => onEdge(s.bk) && !isCorner(s.bk) && top(s.bk) && directOpp(s.wk, s.bk), first: (m, s) => m.kind === 'x' && dist(m.to, s.bk) > 1 && rank(m.to) === 7 });
G({ lesson: 'patterns', id: 'pat-q-corner', kind: 'q', minM: 1, maxM: 1,
  pre: (s) => isCorner(s.bk) && top(s.bk) && !knightJump(s.wk, s.bk), first: (m, s) => m.kind === 'x' && dist(m.to, s.bk) > 1 });
G({ lesson: 'patterns', id: 'pat-r-edge', kind: 'r', minM: 1, maxM: 1,
  pre: (s) => onEdge(s.bk) && !isCorner(s.bk) && top(s.bk) && directOpp(s.wk, s.bk) });
G({ lesson: 'patterns', id: 'pat-r-corner', kind: 'r', minM: 1, maxM: 1,
  pre: (s) => isCorner(s.bk) && top(s.bk) && knightJump(s.wk, s.bk) });
G({ lesson: 'patterns', id: 'pat-r-wait', kind: 'r', minM: 2, maxM: 2,
  pre: (s) => onEdge(s.bk) && top(s.bk) && !isCorner(s.bk),
  first: (m, s) => m.kind === 'x' && !m.check && box(M.solver('r'), ...m.child).length === box(M.solver('r'), s.wk, s.bk, s.x).length,
  post: (line) => directOpp(mateBy(line).before.wk, mateBy(line).before.bk) });

// 3. Checkmate with the queen.
G({ lesson: 'queen', id: 'queen-knight', kind: 'q', count: 2, minM: 5, maxM: 7, minScore: 0.7,
  pre: (s) => ring(s.bk) <= 1, first: (m, s) => m.kind === 'x' && knightJump(m.to, s.bk) && box(M.solver('q'), ...m.child).length < box(M.solver('q'), s.wk, s.bk, s.x).length,
  end: top });
G({ lesson: 'queen', id: 'queen-king', kind: 'q', minM: 3, maxM: 4,
  pre: (s) => top(s.bk) && dist(s.wk, s.bk) >= 4, first: (m) => m.kind === 'k', end: top });
G({ lesson: 'queen', id: 'queen-full', kind: 'q', count: 2, minM: 6, maxM: 8, minScore: 0.6,
  pre: (s) => ring(s.bk) <= 1 && dist(s.wk, s.bk) >= 3, end: top });

// 4. Checkmate with the rook.
G({ lesson: 'rook', id: 'rook-cut', kind: 'r', count: 2, minM: 7, maxM: 12, minScore: 0.5,
  pre: (s) => ring(s.bk) <= 1, first: (m, s) => m.kind === 'x' && !m.check && box(M.solver('r'), ...m.child).length < box(M.solver('r'), s.wk, s.bk, s.x).length,
  end: top });
G({ lesson: 'rook', id: 'rook-opp', kind: 'r', minM: 4, maxM: 6, scarce: 1,
  pre: (s) => rank(s.bk) >= 5, first: (m, s) => m.kind === 'k' && directOpp(m.to, s.bk), end: top });
G({ lesson: 'rook', id: 'rook-wait', kind: 'r', minM: 4, maxM: 7, scarce: 2,
  pre: (s) => rank(s.bk) >= 4, post: (line) => line.plies.some((pl) => pl.side === 'w' && isWait(M.solver('r'), pl.move, pl.before)), end: top });
G({ lesson: 'rook', id: 'rook-full', kind: 'r', minM: 10, maxM: 12, minScore: 0.55,
  pre: (s) => ring(s.bk) <= 1, end: top });

// 5. Don't stalemate! The natural move (the one that takes the most squares) is stalemate.
const trap = (os) => os.filter((o) => o.stalemate);
G({ lesson: 'stalemate', id: 'stale-q-knight', kind: 'q', minM: 2, maxM: 4,
  pre: (s) => top(s.bk), first: (m, s, os) => trap(os).some((o) => o.kind === 'x' && knightJump(o.to, s.bk)), end: top });
G({ lesson: 'stalemate', id: 'stale-q-king', kind: 'q', minM: 2, maxM: 4,
  pre: (s) => top(s.bk), first: (m, s, os) => trap(os).some((o) => o.kind === 'k'), end: top });
G({ lesson: 'stalemate', id: 'stale-r', kind: 'r', minM: 2, maxM: 5,
  pre: (s) => top(s.bk), first: (m, s, os) => trap(os).length > 0, end: top });
G({ lesson: 'stalemate', id: 'stale-promo', kind: 'p', minN: 1, maxN: 4,
  pre: (s) => rank(s.p) >= 5, look: (s) => dist(s.wk, s.p) + dist(s.bk, s.p),
  post: (line) => line.plies.some((pl) => pl.move.kind === 'promo' && pl.move.promo === 'r') });
G({ lesson: 'stalemate', id: 'stale-push', kind: 'p', minN: 2, maxN: 6,
  pre: (s) => rank(s.p) >= 4,
  first: (m, s, os) => m.kind === 'k' && os.some((o) => o.kind === 'p' && K.blackMoves(...o.child).length === 0 && !K.pawnAttacks(o.child[2], o.child[1])) });

// 6. Final exam: longer positions, no marks.
G({ lesson: 'exam', id: 'exam-p', kind: 'p', count: 2, minN: 8, maxN: 12,
  pre: (s) => rank(s.p) >= 1 && rank(s.p) <= 2 && rank(s.wk) <= rank(s.p) + 1 && dist(s.bk, s.p) <= 3,
  first: (m, s, os) => new Set(os.filter((o) => o.win).map((o) => `${o.from}-${o.to}`)).size === 1 });
G({ lesson: 'exam', id: 'exam-q', kind: 'q', count: 2, minM: 8, maxM: 9, minScore: 0.6, pre: (s) => ring(s.bk) <= 1 });
G({ lesson: 'exam', id: 'exam-r', kind: 'r', count: 2, minM: 10, maxM: 14, minScore: 0.45, pre: (s) => ring(s.bk) <= 1 });

// ---------- search ----------
/** Learner moves of a line and how many of them are the only fastest move. */
function evaluate(line, learner) {
  const t = line.plies.filter((p) => p.side === learner);
  const uniq = t.filter((p) => !p.others.length).length;
  return { n: t.length, uniq, score: t.length ? uniq / t.length : 0 };
}

function mateCandidates(g) {
  const S = M.solver(g.kind);
  const out = [];
  for (let wk = 0; wk < 64; wk++) for (let bk = 0; bk < 64; bk++) for (let x = 0; x < 64; x++) {
    if (!S.legal(wk, bk, x, 0)) continue;
    const mv = (S.val(wk, bk, x, 0) + 1) / 2;
    if (mv < g.minM || mv > g.maxM) continue;
    const s = { wk, bk, x };
    if (g.pre && !g.pre(s)) continue;
    const os = whiteOptions(S, s);
    const best = Math.min(...os.filter((o) => o.d >= 0).map((o) => o.d));
    const tops = os.filter((o) => o.d === best);
    if (tops.length !== 1) continue; // the lesson's idea must be the only fastest move
    if (g.first && !g.first(tops[0], s, os)) continue;
    const line = playMate(S, s, { prefer: g.kind === 'r' ? preferWait : undefined });
    if (line.end !== 'mate') throw new Error(`${g.id}: line does not end in mate (${line.end})`);
    if (!monotone(boxSizes(S, line))) continue; // the box never grows
    const last = line.plies[line.plies.length - 1];
    const finalBk = last.before.bk;
    if (g.end && !g.end(finalBk)) continue;
    if (g.post && !g.post(line)) continue;
    const ev = evaluate(line, 'w');
    if (g.minScore && ev.score < g.minScore) continue;
    // natural-looking starts: the piece not next to a king, the white king off the edge
    const look = (dist(x, bk) === 1 ? 1 : 0) + (dist(x, wk) === 1 ? 0.5 : 0) + (onEdge(wk) ? 0.5 : 0) + (isCorner(wk) ? 0.5 : 0) + (isCorner(x) ? 0.25 : 0);
    const turns = line.plies.filter((pl) => pl.side === 'w').map((pl) => pl.before);
    const positions = turns.map((t) => g.kind + canonMate(t.wk, t.bk, t.x));
    const kings = turns.map((t) => g.kind + canonMate(t.wk, t.bk));
    out.push({ s, line, ev, look, positions, kings, pair: g.kind + canonMate(wk, bk), fen: boardFen([[wk, 'K'], [bk, 'k'], [x, g.kind.toUpperCase()]]) });
  }
  return out;
}

function pawnCandidates(g) {
  const { val, attackerOptions, playLine } = KP;
  const out = [];
  for (let wk = 0; wk < 64; wk++) for (let bk = 0; bk < 64; bk++) for (let p = 8; p < 56; p++) {
    if (file(p) === 0 || file(p) === 7) continue; // rook pawns have their own rules: not in this course
    if (!K.legal(wk, bk, p, 0) || !val(wk, bk, p, 0)) continue;
    const s = { wk, bk, p, stm: 0 };
    if (g.pre && !g.pre(s)) continue;
    const os = attackerOptions(s);
    const line = playLine(s, 'win');
    if (line.end !== 'promoted') continue;
    const fp = line.plies[0];
    if (fp.others.length) continue; // the only fastest move
    if (g.first && !g.first(fp.move, s, os)) continue;
    if (g.post && !g.post(line)) continue;
    const ev = evaluate(line, 'att');
    if (ev.n < g.minN || ev.n > g.maxN) continue;
    const fen = boardFen([[wk, 'K'], [bk, 'k'], [p, 'P']]);
    if (kpFens.has(fen)) continue;
    const positions = line.plies.filter((pl) => pl.side === 'att').map((pl) => 'p' + canonPawn(pl.before.wk, pl.before.bk, pl.before.p));
    out.push({ s, line, ev, look: g.look ? g.look(s) : 0, positions, kings: [], pair: `p${wk - p}:${bk - p}`, fen });
  }
  return out;
}

// Variety: a line may not start in a position another line goes through, nor run through another
// line's start, and at most a quarter of its positions (at least one: the last steps before mate)
// appear in other lines. A short line (up to 5 moves) must also put the kings somewhere new: the
// same king dance with the piece on another square would be the same lesson. The short lines of
// lessons 2 and 5 don't count: the other lines are meant to end in those pictures.
const used = new Set(), seen = new Set(), starts = new Set(), seenKings = new Set();
const fresh = (c) => !seen.has(c.positions[0]) && !c.positions.some((k) => starts.has(k)) &&
  c.positions.filter((k) => seen.has(k)).length <= Math.max(1, Math.floor(c.positions.length / 4)) &&
  (c.positions.length > 5 || c.kings.filter((k) => seenKings.has(k)).length <= 1);
const picked = [];
// Groups with few candidates choose first (highest `scarce` first); the course keeps the order of GROUPS.
const searchOrder = [...GROUPS].sort((a, b) => (b.scarce ?? 0) - (a.scarce ?? 0));
for (const g of searchOrder) {
  const cands = g.kind === 'p' ? pawnCandidates(g) : mateCandidates(g);
  const ideal = g.kind === 'p' ? (g.minN + g.maxN) / 2 : g.minM;
  const len = (c) => (g.kind === 'p' ? c.ev.n : (c.line.plies.length + 1) / 2);
  cands.sort((a, b) => b.ev.score - a.ev.score || a.look - b.look || Math.abs(len(a) - ideal) - Math.abs(len(b) - ideal) || (a.fen < b.fen ? -1 : 1));
  const chosen = [];
  for (const c of cands) {
    if (chosen.length >= g.count) break;
    // the short lessons (patterns, stalemate traps) only differ from each other; the others must be fresh
    const short = g.lesson === 'patterns' || g.lesson === 'stalemate';
    // (each mating pattern also puts the kings somewhere else, whatever the piece)
    const pair = g.lesson === 'patterns' ? `patterns:${c.pair.slice(1)}` : (short ? `${g.lesson}:` : '') + c.pair;
    if (used.has(pair) || (!short && !fresh(c))) continue;
    // variety inside a group: another pawn square
    if (g.kind === 'p' && chosen.some((x) => x.s.p === c.s.p || (x.s.p ^ 7) === c.s.p)) continue;
    chosen.push(c);
    used.add(pair);
    if (short) continue;
    starts.add(c.positions[0]);
    for (const k of c.positions) seen.add(k);
    for (const k of c.kings) seenKings.add(k);
  }
  if (chosen.length < g.count) throw new Error(`${g.id}: only ${chosen.length} of ${g.count} positions found (${cands.length} candidates)`);
  console.log(`${g.id.padEnd(15)} candidates=${String(cands.length).padStart(6)} picked=${chosen.length} unique=${chosen.map((c) => `${c.ev.uniq}/${c.ev.n}`).join(' ')}`);
  for (const c of chosen) picked.push({ lesson: g.lesson, group: g.id, kind: g.kind, s: c.s, line: c.line, ev: c.ev });
}
picked.sort((a, b) => GROUPS.findIndex((g) => g.id === a.group) - GROUPS.findIndex((g) => g.id === b.group));
fs.mkdirSync(path.join(__dirname, '.out'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '.out/picked.json'), JSON.stringify(picked, null, 1));
console.log('total', picked.length);
