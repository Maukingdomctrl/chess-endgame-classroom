#!/usr/bin/env node
// Phase timings of an egtb build, per table, with per-unit costs: the numbers an optimisation is chosen by and
// judged against. One thread and no disk cache (a cached table has no build to time); refuses otherwise.
//
//   EGTB_THREADS=1 node <skill dir>/scripts/egtb-phases.cjs KQKR            # run from apps/endgame-classroom
//   EGTB_THREADS=1 node <skill dir>/scripts/egtb-phases.cjs KRPK --goal conversion --json phases.json
//
// For every table the run built (the target and the tables its captures and promotions lead to, which are
// built first, so each table's own times exclude them): index size, positions, decided (wins + losses), deepest
// level, predecessors visited ("unmoves"), total / initial pass / retrograde / level-sort ms, then ns per
// position for the initial pass and ns per unmove for the retrograde. For pawn tables also the per-slice times
// and what the worker schedule (slices of one advancement in parallel) would cost on N workers: a model of
// parallel.cjs, not a run (--workers N, default the cores).
//
// It wraps two engine methods in this process only (Schedule.take: the per-level sort; EgtbTable.solveDomain:
// per-slice times), so it depends on those names: if the engine changes, adapt the wrappers. Read-only.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

function kitDir() {
  if (process.env.KIT_DIR) return path.resolve(process.env.KIT_DIR);
  for (let d = process.cwd(); ; d = path.dirname(d)) {
    for (const c of ['tools/course-kit', 'apps/endgame-classroom/tools/course-kit']) {
      if (fs.existsSync(path.join(d, c, 'egtb/engine.cjs'))) return path.join(d, c);
    }
    if (path.dirname(d) === d) throw new Error('course-kit not found: run inside the repository or set KIT_DIR');
  }
}
if (process.env.KIT_CACHE) { console.error('refusing: unset KIT_CACHE (a table read from the cache has no build to time)'); process.exit(2); }
if (process.env.EGTB_THREADS !== '1') { console.error('refusing: run with EGTB_THREADS=1 (worker threads bypass the timers)'); process.exit(2); }

const args = process.argv.slice(2);
const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const names = args.filter((a, i) => /^K[QRBNP]*K[QRBNP]*$/.test(a) && !['--goal', '--json', '--workers'].includes(args[i - 1]));
const goal = opt('--goal') ?? 'mate';
const workers = +(opt('--workers') ?? (os.availableParallelism ? os.availableParallelism() : os.cpus().length));
if (!names.length) { console.error('usage: EGTB_THREADS=1 node egtb-phases.cjs <material>... [--goal g] [--workers N] [--json file]'); process.exit(2); }

const KIT = kitDir();
const { EgtbTable, Schedule } = require(path.join(KIT, 'egtb/engine.cjs'));
const egtb = require(path.join(KIT, 'egtb/index.cjs'));

const now = () => Number(process.hrtime.bigint()) / 1e6;
let current = null; // the table whose domain is being solved
const extra = new Map(); // table name:goal -> { takeMs, slices: [] }
const rec = (T) => { const k = `${T.name}:${T.goal}`; if (!extra.has(k)) extra.set(k, { takeMs: 0, slices: [] }); return extra.get(k); };

const take0 = Schedule.prototype.take;
Schedule.prototype.take = function (...a) {
  const t = now();
  try { return take0.apply(this, a); } finally { if (current) rec(current).takeMs += now() - t; }
};
const solveDomain0 = EgtbTable.prototype.solveDomain;
EgtbTable.prototype.solveDomain = function (d) {
  const prev = current;
  current = this;
  const t = now();
  try { solveDomain0.call(this, d); } finally { current = prev; }
  rec(this).slices.push({ slice: d.slice, adv: d.adv, ms: now() - t });
};

const t0 = now();
for (const n of names) egtb.table(n, { goal });
const wall = now() - t0;

const rows = [];
for (const [key, T] of egtb.tables) {
  if (!T.stats || T.stats.cached || T.stats.ms === undefined) continue;
  let win = 0, loss = 0;
  for (let i = 0; i < T.val.length; i++) { const s = T.val[i]; if (s) { if (s & 1) loss++; else win++; } }
  const x = rec(T), st = T.stats;
  const row = { table: key, size: T.size, positions: st.positions, decided: win + loss, maxLevel: st.maxLevel || 0, unmoves: st.unmoves || 0, ms: st.ms, forwardMs: st.forwardMs, retroMs: st.retroMs, takeMs: Math.round(x.takeMs) };
  if (T.layout.pawns && x.slices.length > 1) {
    const byAdv = new Map();
    for (const s of x.slices) { if (!byAdv.has(s.adv)) byAdv.set(s.adv, []); byAdv.get(s.adv).push(s.ms); }
    let model = 0;
    for (const ms of byAdv.values()) {
      const w = new Array(workers).fill(0);
      for (const m of ms) { const i = w.indexOf(Math.min(...w)); w[i] += m; } // slices handed out in order, as the pool does
      model += Math.max(...w);
    }
    const sum = x.slices.reduce((a, s) => a + s.ms, 0);
    row.schedule = { workers, waves: byAdv.size, slices: x.slices.length, sumMs: Math.round(sum), idealMs: Math.round(sum / workers), modelMs: Math.round(model), slowestSliceMs: Math.round(Math.max(...x.slices.map((s) => s.ms))) };
  }
  rows.push(row);
}

const w = (s, n) => String(s).padStart(n);
console.log(`${'table'.padEnd(16)}${w('index', 11)}${w('positions', 11)}${w('decided', 11)}${w('lev', 5)}${w('unmoves', 13)}${w('ms', 8)}${w('init', 8)}${w('retro', 8)}${w('sort', 6)}${w('ns/pos', 8)}${w('ns/unmove', 10)}`);
for (const r of rows) {
  const perPos = (r.forwardMs * 1e6) / Math.max(1, r.positions), perUnmove = ((r.retroMs - r.takeMs) * 1e6) / Math.max(1, r.unmoves);
  console.log(`${r.table.padEnd(16)}${w(r.size, 11)}${w(r.positions, 11)}${w(r.decided, 11)}${w(r.maxLevel, 5)}${w(r.unmoves, 13)}${w(r.ms, 8)}${w(r.forwardMs, 8)}${w(r.retroMs, 8)}${w(r.takeMs, 6)}${w(perPos.toFixed(0), 8)}${w(perUnmove.toFixed(1), 10)}`);
  if (r.schedule) {
    const s = r.schedule;
    console.log(`    ${s.slices} slices in ${s.waves} waves: ${s.sumMs} ms in all; on ${s.workers} workers ideal ${s.idealMs} ms, wave model ${s.modelMs} ms (${Math.round((s.modelMs / Math.max(1, s.idealMs) - 1) * 100)}% over ideal; slowest slice ${s.slowestSliceMs} ms)`);
  }
}
console.log(`${names.join(', ')} (${goal}): ${(wall / 1000).toFixed(1)} s wall, one thread, no cache, node ${process.version}`);
if (opt('--json')) fs.writeFileSync(opt('--json'), JSON.stringify({ names, goal, wallMs: Math.round(wall), node: process.version, rows }, null, 2));
