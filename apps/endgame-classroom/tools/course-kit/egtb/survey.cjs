// What an ending offers a course, before a lesson list is proposed (the endgame-course skill: check
// feasibility with the solver first). For a seeded sample of the positions with White to move:
//   objective 'win' (default): the wins, by depth band; how many have a single fastest move (the courses'
//     standard) and what kind of move it is (capture, promotion, underpromotion, check, king move, piece move,
//     pawn move); how many also have a tempting move that fails (a check, capture or promotion that only
//     draws or loses: a trap worth a lesson); examples of each.
//   objective 'hold': the draws; how many have exactly one move that keeps the draw (a defensive resource)
//     and of what kind; how many have a tempting move that loses; examples.
// Counts are of the sample; "about N in the table" scales them up by the share sampled.
//
//   node tools/course-kit/egtb/survey.cjs KRPKR --goal conversion             (wins measured to the conversion)
//   node tools/course-kit/egtb/survey.cjs KRKRP --objective hold              (White defends: Philidor and co.)
//   node tools/course-kit/egtb/survey.cjs KBBKN --goal conversion --sample 0.01 --examples 2 [--json file]
'use strict';
const fs = require('fs');
const { Chess } = require('chess.js');
const solver = require('../solver.cjs');
const { scan, fenOf } = require('./positions.cjs');
const { attackedBy, code } = require('./check.cjs');
const { sqName } = require('../board.cjs');

const K = 0, P = 5;
/** Does the move (an option of T.options) give check? (on an 8x8 board, the checker's attack test) */
function givesCheck(T, sqs, stm, o) {
  const board = new Int8Array(64);
  for (let k = 0; k < T.n; k++) if (sqs[k] >= 0) board[sqs[k]] = code(T.col[k], T.typ[k]);
  const promo = o.promo ? 'kqrbnp'.indexOf(o.promo) : -1;
  if (o.ep) board[o.to + (stm === 0 ? -8 : 8)] = 0;
  board[o.to] = promo >= 0 ? code(stm, promo) : board[o.from];
  board[o.from] = 0;
  return attackedBy(board, board.indexOf(code(1 - stm, K)), stm);
}
/** The kind of a move, for teaching: promotion / underpromotion / capture / check / king / pawn / piece. */
function kindOf(T, sqs, stm, o) {
  if (o.promo) return o.promo === 'q' ? 'promotion' : 'underpromotion';
  if (o.capture) return 'capture';
  if (givesCheck(T, sqs, stm, o)) return 'check';
  return T.typ[o.piece] === K ? 'king move' : T.typ[o.piece] === P ? 'pawn move' : 'piece move';
}
const tempting = (k) => k === 'promotion' || k === 'capture' || k === 'check';

function survey(name, opts = {}) {
  const goal = opts.goal ?? 'mate', objective = opts.objective ?? 'win';
  const sample = opts.sample ?? 0.002, nEx = opts.examples ?? 2;
  const T = solver.table(name, { goal: objective === 'hold' ? 'mate' : goal });
  const bands = goal === 'conversion' || goal === 'promotion' ? [[1, 5], [6, 10], [11, 20], [21, 40], [41, 255]] : [[1, 9], [10, 19], [20, 39], [40, 79], [80, 255]];
  const out = { name: T.name, goal: objective === 'hold' ? 'mate' : goal, objective, sample, total: 0, bands: [], kinds: {}, traps: 0, examples: {} };
  for (const b of bands) out.bands.push({ plies: b, positions: 0, single: 0 });
  const example = (key, sqs, best, extra) => {
    const list = (out.examples[key] ??= []);
    if (list.length >= nEx) return;
    const fen = fenOf(T, sqs, 0);
    const g = new Chess(fen);
    const san = (o) => g.moves({ verbose: true }).find((m) => m.from === sqName(o.from) && m.to === sqName(o.to) && (m.promotion ?? '') === o.promo)?.san;
    list.push({ fen, move: san(best), ...(extra ? { tempting: extra.map(san) } : {}) });
  };
  for (const c of scan(T, { stm: 0, result: objective === 'hold' ? 'draw' : 'win', sample, seed: opts.seed })) {
    out.total++;
    const os = T.options(c.sqs, 0);
    if (objective === 'hold') {
      const keep = os.filter((o) => o.v === 0);
      const lose = os.filter((o) => o.v < 0);
      const b = out.bands[0];
      b.positions++;
      if (keep.length !== 1) continue;
      b.single++;
      const k = kindOf(T, c.sqs, 0, keep[0]);
      out.kinds[k] = (out.kinds[k] ?? 0) + 1;
      const bait = lose.filter((o) => tempting(kindOf(T, c.sqs, 0, o)));
      if (bait.length) out.traps++;
      example(k, c.sqs, keep[0], bait.length ? bait.slice(0, 2) : null);
    } else {
      const wins = os.filter((o) => o.v > 0), fast = Math.min(...wins.map((o) => o.v));
      const best = wins.filter((o) => o.v === fast);
      const b = out.bands.find((x) => c.v >= x.plies[0] && c.v <= x.plies[1]);
      b.positions++;
      if (best.length !== 1) continue;
      b.single++;
      const k = kindOf(T, c.sqs, 0, best[0]);
      out.kinds[k] = (out.kinds[k] ?? 0) + 1;
      const bait = os.filter((o) => o.v <= 0 && tempting(kindOf(T, c.sqs, 0, o)));
      if (bait.length) out.traps++;
      example(k, c.sqs, best[0], bait.length ? bait.slice(0, 2) : null);
    }
  }
  return out;
}

module.exports = { survey, kindOf, givesCheck };

if (require.main === module) {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const name = args.find((a) => /^K[QRBNP]*K[QRBNP]*$/.test(a));
  if (!name) { console.error('usage: node tools/course-kit/egtb/survey.cjs <material> [--goal mate|conversion] [--objective win|hold] [--sample 0.002] [--examples 2] [--json file]'); process.exit(2); }
  const t0 = Date.now();
  const r = survey(name, { goal: opt('--goal', 'mate'), objective: opt('--objective', 'win'), sample: +opt('--sample', 0.002), examples: +opt('--examples', 2) });
  const scale = (n) => Math.round(n / r.sample);
  const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : '-');
  console.log(`${r.name} (${r.objective === 'hold' ? 'White holds the draw' : `White wins, measured to ${r.goal === 'conversion' ? 'the conversion' : r.goal}`}): ${r.total} positions with White to move in a ${r.sample} sample (about ${scale(r.total)} in the table)`);
  const single = r.bands.reduce((a, b) => a + b.single, 0);
  if (r.objective === 'hold') console.log(`  a single move keeps the draw: ${single} (${pct(single, r.total)}), about ${scale(single)} in the table`);
  else for (const b of r.bands) console.log(`  ${String(b.plies[0]).padStart(3)}-${String(b.plies[1]).padEnd(3)} plies: ${String(b.positions).padStart(7)} positions, a single fastest move in ${String(b.single).padStart(6)} (${pct(b.single, b.positions)})`);
  console.log(`  that move: ${Object.entries(r.kinds).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n} (${pct(n, single)})`).join(', ')}`);
  console.log(`  with a tempting check, capture or promotion that ${r.objective === 'hold' ? 'loses' : 'does not win'}: ${r.traps} (${pct(r.traps, single)})`);
  for (const [k, list] of Object.entries(r.examples)) for (const e of list) console.log(`  e.g. ${k}: ${e.fen}  ${e.move}${e.tempting ? `  (not ${e.tempting.join(', ')})` : ''}`);
  console.log(`  (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  const json = opt('--json');
  if (json) fs.writeFileSync(json, JSON.stringify(r, null, 2));
}
