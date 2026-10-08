// Finds clean teaching positions for each lesson and plays out the lines.
const E = require('./engine.cjs');
const { K, val, keySquares, directOpp, distantOpp, diagOpp, promoSq, attackerOptions, defenderOptions, playLine } = E;
const { dist, file, rank, legal, pawnAttacks } = K;

const onKey = (wk, p) => keySquares(p).includes(wk);
const inSquare = (bk, p, attackerToMove) => {
  // "Rule of the square": the defending king catches the pawn if it is inside the pawn's square.
  const pr = rank(p) === 1 ? 2 : rank(p); // a pawn on the 2nd rank can jump
  const stepsToQueen = 7 - pr;
  const reach = Math.max(Math.abs(file(bk) - file(p)), 7 - rank(bk));
  return reach <= stepsToQueen + (attackerToMove ? 0 : 1) - (attackerToMove ? 0 : 0) && rank(bk) >= rank(p) - 1;
};

/** Trim a 'win' line so it ends right after the attacker reaches a key square (stop:'key'). */
function trimToKey(line) {
  for (let i = 0; i < line.plies.length; i++) {
    const pl = line.plies[i];
    if (pl.side === 'att' && pl.move.kind === 'k' && onKey(pl.move.to, pl.before.p)) {
      return { plies: line.plies.slice(0, i + 1), end: 'key' };
    }
  }
  return line;
}

function evaluate(line, mode) {
  const trainee = line.plies.filter((p) => (mode === 'win' ? p.side === 'att' : p.side === 'def'));
  const uniq = trainee.filter((p) => p.unique).length;
  return { n: trainee.length, uniq, score: trainee.length ? uniq / trainee.length : 0 };
}

const LESSONS = [];
const L = (o) => LESSONS.push(o);

// ---- Part 1: key squares ----
L({ id: 'key4', count: 3, mode: 'win', stm: 0, stop: 'key', minN: 2, maxN: 5, files: [2, 3, 4, 5],
  pre: (s) => rank(s.p) === 3 && !onKey(s.wk, s.p) && dist(s.bk, s.p) <= 3 && dist(s.wk, s.p) <= 2 });
L({ id: 'key23', count: 3, mode: 'win', stm: 0, stop: 'key', minN: 2, maxN: 5, files: [2, 3, 4, 5],
  pre: (s) => (rank(s.p) === 1 || rank(s.p) === 2) && !onKey(s.wk, s.p) && dist(s.bk, s.p) <= 3 && dist(s.wk, s.p) <= 2 });
L({ id: 'key5', count: 2, mode: 'win', stm: 0, stop: 'key', minN: 1, maxN: 4, files: [2, 3, 4, 5],
  pre: (s) => rank(s.p) === 4 && !onKey(s.wk, s.p) && dist(s.bk, s.p) <= 3 && dist(s.wk, s.p) <= 2 });
L({ id: 'finish6', count: 3, mode: 'win', stm: 0, stop: 'promo', minN: 2, maxN: 6, files: [2, 3, 4, 5],
  pre: (s) => rank(s.p) === 5 && dist(s.bk, promoSq(s.p)) <= 1 && dist(s.wk, s.p) <= 1 });
// ---- Part 2: opposition ----
L({ id: 'opp', count: 5, mode: 'win', stm: 0, stop: 'key', minN: 2, maxN: 6, files: [2, 3, 4, 5],
  pre: (s) => rank(s.p) <= 3 && !onKey(s.wk, s.p) && dist(s.wk, s.p) <= 2 && dist(s.bk, s.p) <= 3,
  first: (m, s) => m.kind === 'k' && file(m.to) === file(s.bk) && Math.abs(rank(m.to) - rank(s.bk)) === 2 });
L({ id: 'giveway', count: 3, mode: 'win', stm: 1, stop: 'key', minN: 1, maxN: 5, files: [2, 3, 4, 5],
  pre: (s) => rank(s.p) <= 3 && !onKey(s.wk, s.p) && file(s.wk) === file(s.bk) && rank(s.bk) - rank(s.wk) === 2 && dist(s.wk, s.p) <= 2 });
L({ id: 'distant', count: 3, mode: 'win', stm: 0, stop: 'key', minN: 2, maxN: 7, files: [2, 3, 4, 5],
  pre: (s) => rank(s.p) <= 3 && !onKey(s.wk, s.p) && dist(s.wk, s.p) <= 3,
  first: (m, s) => m.kind === 'k' && distantOpp(m.to, s.bk) });
L({ id: 'diag', count: 2, mode: 'win', stm: 0, stop: 'key', minN: 2, maxN: 6, files: [2, 3, 4, 5],
  pre: (s) => rank(s.p) <= 3 && !onKey(s.wk, s.p) && dist(s.wk, s.p) <= 2 && dist(s.bk, s.p) <= 4,
  first: (m, s) => m.kind === 'k' && diagOpp(m.to, s.bk) });
L({ id: 'kingfirst', count: 4, mode: 'win', stm: 0, stop: 'key', minN: 2, maxN: 6, files: [2, 3, 4, 5],
  pre: (s) => rank(s.p) <= 3 && !onKey(s.wk, s.p) && dist(s.wk, s.p) <= 1 && dist(s.bk, s.p) <= 3,
  first: (m, s, os) => m.kind === 'k' && os.some((o) => o.kind === 'p' && !o.win) && !directOpp(m.to, s.bk) });
// ---- Part 3: the spare tempo ----
// ---- Part 4: defence (trainee is the side WITHOUT the pawn) ----
L({ id: 'defopp', count: 5, mode: 'draw', stm: 1, maxPlies: 8, files: [2, 3, 4, 5],
  pre: (s) => rank(s.p) <= 3 && dist(s.bk, s.p) <= 3 && dist(s.wk, s.p) <= 2 && rank(s.bk) > rank(s.p),
  first: (m, s) => !m.capture && directOpp(m.to, s.wk) && file(m.to) === file(s.wk) });
L({ id: 'straight', count: 3, mode: 'draw', stm: 1, maxPlies: 8, files: [2, 3, 4, 5],
  pre: (s) => file(s.bk) === file(s.p) && rank(s.bk) >= 5 && rank(s.p) >= 3 && dist(s.wk, s.p) <= 1,
  first: (m, s) => !m.capture && file(m.to) === file(s.p) && rank(m.to) === rank(s.bk) + 1 });
L({ id: 'stalemate', count: 2, mode: 'draw', stm: 1, maxPlies: 10, files: [2, 3, 4, 5], needEnd: ['stalemate', 'captured'],
  pre: (s) => rank(s.p) >= 5 && dist(s.bk, promoSq(s.p)) <= 1 && dist(s.wk, s.p) <= 1 });
L({ id: 'rookdef', count: 3, mode: 'draw', stm: 1, maxPlies: 14, files: [0, 7], anyFirst: true, minScore: 0.5,
  pre: (s) => rank(s.p) >= 2 && rank(s.p) <= 4 && dist(s.wk, s.p) <= 2 && dist(s.bk, promoSq(s.p)) >= 2 && dist(s.bk, promoSq(s.p)) <= 4,
  first: (m, s) => !m.capture && dist(m.to, promoSq(s.p)) < dist(s.bk, promoSq(s.p)),
  // the defending king must actually reach the corner in front of the pawn
  post: (line) => line.plies.some((pl) => pl.side === 'def' && !pl.move.capture && (pl.move.to === promoSq(pl.before.p) || (rank(pl.move.to) === 7 && Math.abs(file(pl.move.to) - file(pl.before.p)) === 1))) });
// ---- Part 5: winning with a rook pawn ----
L({ id: 'rookwin', count: 3, mode: 'win', stm: 0, stop: 'key', minN: 2, maxN: 6, files: [0, 7],
  pre: (s) => rank(s.p) >= 3 && rank(s.p) <= 5 && !onKey(s.wk, s.p) && dist(s.wk, s.p) <= 2 && dist(s.bk, promoSq(s.p)) <= 3 && dist(s.bk, promoSq(s.p)) >= 1 });
// ---- Part 6: the square ----
L({ id: 'race', count: 3, mode: 'win', stm: 0, stop: 'promo', minN: 3, maxN: 6, files: [2, 3, 4, 5],
  pre: (s) => dist(s.wk, s.p) >= 4 && rank(s.p) >= 2 && rank(s.p) <= 4 && dist(s.bk, promoSq(s.p)) >= 3 && dist(s.bk, promoSq(s.p)) <= 5,
  first: (m) => m.kind === 'p' });
L({ id: 'square', count: 2, mode: 'draw', stm: 1, maxPlies: 10, files: [2, 3, 4, 5], needEnd: ['captured'],
  pre: (s) => dist(s.wk, s.p) >= 4 && rank(s.p) >= 2 && rank(s.p) <= 4 && dist(s.bk, s.p) >= 3,
  first: (m) => !m.capture });
// ---- Part 7: exam ----
L({ id: 'exam', count: 2, mode: 'win', stm: 0, stop: 'key', minN: 4, maxN: 8, files: [2, 3, 4, 5],
  pre: (s) => rank(s.p) <= 2 && !onKey(s.wk, s.p) && dist(s.wk, s.p) <= 3 && dist(s.bk, s.p) <= 3 });

const used = new Set();
const picked = [];
for (const les of LESSONS) {
  const cands = [];
  for (let wk = 0; wk < 64; wk++) for (let bk = 0; bk < 64; bk++) for (let p = 8; p < 56; p++) {
    if (!les.files.includes(file(p))) continue;
    // Use only files a-d for the mirror-symmetric search (e/f/g/h are mirrors); flip later for variety.
    const s = { wk, bk, p, stm: les.stm };
    if (!legal(wk, bk, p, les.stm)) continue;
    if (les.stm === 1 && pawnAttacks(p, bk)) continue;
    if (!les.pre(s)) continue;
    const v = val(wk, bk, p, les.stm);
    if (les.mode === 'win' ? !v : v) continue;
    // first trainee decision
    let line = playLine(s, les.mode, { maxPlies: les.maxPlies });
    if (line.end.startsWith('error')) continue;
    const firstIdx = line.plies.findIndex((pl) => (les.mode === 'win' ? pl.side === 'att' : pl.side === 'def'));
    if (firstIdx < 0) continue;
    const fp = line.plies[firstIdx];
    if (!fp.unique && !les.anyFirst) continue;
    if (les.first) {
      const os = les.mode === 'win' ? attackerOptions(fp.before) : defenderOptions(fp.before);
      if (!les.first(fp.move, fp.before, os)) continue;
    }
    if (les.stop === 'key') line = trimToKey(line);
    if (les.stop === 'key' && line.end !== 'key') continue;
    if (les.stop === 'promo' && line.end !== 'promoted') continue;
    if (les.needEnd && !les.needEnd.includes(line.end)) continue;
    if (les.post && !les.post(line)) continue;
    const ev = evaluate(line, les.mode);
    if (les.minN && ev.n < les.minN) continue;
    if (les.minScore && ev.score < les.minScore) continue;
    if (les.maxN && ev.n > les.maxN) continue;
    const spread = dist(wk, p) + dist(bk, p);
    cands.push({ s, line, ev, spread, key: `${wk}-${bk}-${p}-${les.stm}` });
  }
  cands.sort((a, b) => b.ev.score - a.ev.score || b.ev.uniq - a.ev.uniq || a.spread - b.spread || Math.abs(file(a.s.p) - 3.5) - Math.abs(file(b.s.p) - 3.5));
  const chosen = [];
  for (const c of cands) {
    if (chosen.length >= les.count) break;
    if (used.has(c.key)) continue;
    // variety: different pawn square from earlier picks in this lesson, and different king pattern
    if (chosen.some((x) => x.s.p === c.s.p || (x.s.wk - x.s.p === c.s.wk - c.s.p && x.s.bk - x.s.p === c.s.bk - c.s.p))) continue;
    chosen.push(c); used.add(c.key);
  }
  console.log(`${les.id.padEnd(10)} candidates=${String(cands.length).padStart(6)} picked=${chosen.length} scores=${chosen.map((c) => `${c.ev.uniq}/${c.ev.n}`).join(' ')}`);
  for (const c of chosen) picked.push({ lesson: les.id, mode: les.mode, s: c.s, line: c.line, ev: c.ev });
}
require('fs').mkdirSync(require('path').join(__dirname, '.out'), { recursive: true });
require('fs').writeFileSync(require('path').join(__dirname, '.out/picked.json'), JSON.stringify(picked, null, 1));
console.log('total', picked.length);
