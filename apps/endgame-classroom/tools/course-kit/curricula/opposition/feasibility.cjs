// What the solver offers for each task of the Direct Opposition course, before any position is chosen:
// every King & Pawn position (pawn on the b-, c- or d-file, mirror images e-g alike; no rook pawns in this
// course) is classified (tasks.cjs); each candidate's line is played with best play (../../line.cjs) and
// analysed (../../teach/difficulty.cjs), so the counts per task and per difficulty band are real.
//
//   npm run curriculum:opposition                  # about 8 minutes; prints the table the blueprint relies on
//   npm run curriculum:opposition -- --json        # also writes .out/feasibility.json (every candidate)
//   npm run curriculum:opposition -- --from-json   # the counts and the fill check again from that file
//                                                  # (after a change to the slots only)
//
// Defending candidates get a holding line (line.cjs objective 'hold': the learner keeps the draw, the
// opponent tries hardest, the line ends in a draw on the board); a candidate whose line does not end
// that way is left out.
const fs = require('fs');
const path = require('path');
const { Chess } = require('chess.js');
const { playLine } = require('../../line.cjs');
const { analyzeLine } = require('../../teach/difficulty.cjs');
const { TASKS, classify } = require('./tasks.cjs');
const { createCourseExplainer, learnerOrder, VERIFY } = require('./direct-opposition.cjs');
const { BANDS } = require('../../teach/difficulty.cjs');

const sq = (s) => 'abcdefgh'[s & 7] + ((s >> 3) + 1);
const F = (s) => s & 7, R = (s) => s >> 3;
const dist = (a, b) => Math.max(Math.abs(F(a) - F(b)), Math.abs(R(a) - R(b)));
function make(wk, bk, p, pawn, stm) {
  const g = new Chess(); g.clear();
  g.put({ type: 'k', color: 'w' }, sq(wk)); g.put({ type: 'k', color: 'b' }, sq(bk)); g.put({ type: 'p', color: pawn }, sq(p));
  const fen = stm === 'w' ? g.fen() : g.fen().replace(' w ', ' b ');
  try { const t = new Chess(fen); return t.isGameOver() || attacked(t, stm) ? null : fen; } catch { return null; }
}
/** The side not to move must not be in check. */
function attacked(g, stm) { const f = g.fen().split(' '); f[1] = stm === 'w' ? 'b' : 'w'; try { return new Chess(f.join(' ')).inCheck(); } catch { return true; } }

/** Every candidate: { fen, task, ... , line?, difficulty? }. */
function candidates({ log = () => {} } = {}) {
  let ex = createCourseExplainer();
  const out = [];
  let n = 0;
  const visit = (fen) => {
    if (!fen) return;
    if (++n % 3000 === 0) { ex = createCourseExplainer(); log(`${n} positions, ${out.length} candidates`); }
    const c = classify(fen, ex);
    if (!c) return;
    let line;
    if (c.task === 'defend') {
      const played = playLine(fen, { ...VERIFY, objective: 'hold', learnerOrder: learnerOrder(ex) });
      if (played.end !== 'draw') return;
      line = { fen, moves: played.plies.map((p) => ({ san: p.san, also: p.also })) };
    } else {
      const start = c.task === 'retake' ? new Chess(fen) : null;
      if (start) start.move(c.reply);
      const played = playLine(start ? start.fen() : fen, { ...VERIFY, learnerOrder: learnerOrder(ex) });
      line = { fen, moves: [...(start ? [{ san: c.reply }] : []), ...played.plies.map((p) => ({ san: p.san, also: p.also }))] };
    }
    out.push({ fen, ...c, learnerMoves: line.moves.filter((_, i) => (c.task === 'retake' ? i % 2 === 1 : i % 2 === 0)).length, difficulty: analyzeLine(line, ex, { learner: 'w' }) });
  };
  for (const f of [1, 2, 3]) for (let r = 1; r <= 5; r++) for (let wk = 0; wk < 64; wk++) for (let bk = 0; bk < 64; bk++) {
    if (wk === bk || dist(wk, bk) < 2) continue;
    const p = r * 8 + f, bp = (7 - r) * 8 + f;
    if (p !== wk && p !== bk) { visit(make(wk, bk, p, 'w', 'w')); visit(make(wk, bk, p, 'w', 'b')); }
    if (bp !== wk && bp !== bk) visit(make(wk, bk, bp, 'b', 'w'));
  }
  return out;
}

function summarise(list) {
  const rows = [];
  for (const task of Object.keys(TASKS)) {
    const own = list.filter((c) => c.task === task);
    const count = (f) => { const o = {}; for (const c of own) { const k = f(c); o[k] = (o[k] ?? 0) + 1; } return o; };
    rows.push({
      task, count: own.length,
      orientation: count((c) => c.orientation ?? '-'),
      pawnRank: count((c) => c.pawn?.[1] ?? '-'),
      givesWay: own.filter((c) => c.givesWay).length,
      band: count((c) => c.difficulty.label ?? 'uncertain'),
      learnerMoves: count((c) => (c.learnerMoves <= 6 ? '<=6' : c.learnerMoves <= 10 ? '7-10' : '11+')),
    });
  }
  return rows;
}

/**
 * Can every slot get its own position? Each slot's matching candidates (direct-opposition.cjs matches(),
 * no start of another built-in course), then a greedy pass, scarcest slots first, one position per slot
 * (mirror images count as one). Counts only: no line is chosen for the course here.
 */
function fillCheck(list, slots, exclude = new Set()) {
  const { matches, canonical } = require('./direct-opposition.cjs');
  const pool = list.filter((c) => !exclude.has(canonical(c.fen)));
  const per = slots.map((s) => ({ n: s.n, fits: pool.filter((c) => matches(s, c)) }));
  const used = new Set();
  const unfilled = [];
  for (const p of [...per].sort((a, b) => a.fits.length - b.fits.length || a.n - b.n)) {
    const pick = p.fits.find((c) => !used.has(canonical(c.fen)));
    if (pick) used.add(canonical(pick.fen)); else unfilled.push(p.n);
  }
  return { counts: per.map((p) => [p.n, p.fits.length]), unfilled, excluded: list.length - pool.length };
}

if (require.main === module) {
  const t0 = Date.now();
  const saved = path.join(__dirname, '.out/feasibility.json');
  const list = process.argv.includes('--from-json') ? JSON.parse(fs.readFileSync(saved, 'utf8')) : candidates({ log: (m) => process.stderr.write(`${m}\n`) });
  console.log(`Direct Opposition candidates (pawn on b-d, mirror images e-g alike), ${Math.round((Date.now() - t0) / 1000)} s`);
  for (const r of summarise(list)) {
    console.log(`\n${r.task}: ${r.count}  (${TASKS[r.task]})`);
    console.log(`  orientation ${JSON.stringify(r.orientation)}  pawn rank ${JSON.stringify(r.pawnRank)}  "Black must give way" ${r.givesWay}`);
    console.log(`  band ${JSON.stringify(r.band)}  learner moves ${JSON.stringify(r.learnerMoves)}`);
  }
  console.log(`\nbands: ${BANDS.map(([, l]) => l).join(' < ')}`);
  const { SLOTS, otherCourseStarts } = require('./direct-opposition.cjs');
  const f = fillCheck(list, SLOTS, otherCourseStarts());
  const min = f.counts.reduce((a, b) => (b[1] < a[1] ? b : a));
  console.log(`\nslots: ${f.unfilled.length ? `UNFILLED ${f.unfilled.join(', ')}` : 'all 100 can get their own position'} (fewest candidates: slot ${min[0]} with ${min[1]}; ${f.excluded} candidates are starts of other courses)`);
  console.log(f.counts.map(([n, c]) => `${n}:${c}`).join(' '));
  if (f.unfilled.length) process.exitCode = 1;
  if (process.argv.includes('--json')) {
    fs.mkdirSync(path.join(__dirname, '.out'), { recursive: true });
    fs.writeFileSync(saved, JSON.stringify(list, null, 1));
  }
}

module.exports = { candidates, summarise, fillCheck };
