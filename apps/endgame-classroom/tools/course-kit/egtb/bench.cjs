// Builds tables and reports what it cost and what they hold (npm run kit:bench5 -- KRPKR KBBKN ...):
// for every table the run built (the ones a capture or promotion leads to included): time, threads,
// positions, the longest win, wins / draws / losses for the side to move; then the peak memory of the run.
//
//   node tools/course-kit/egtb/bench.cjs KRPKR                  # mate tables
//   node tools/course-kit/egtb/bench.cjs KRPKR --goal conversion
//   EGTB_THREADS=1 node tools/course-kit/egtb/bench.cjs KQQKR   # on one thread
//   KIT_CACHE=1 ...                                               # keep the tables on disk (cache.cjs)
//   --json file                                                   # also write the report as JSON
'use strict';
const fs = require('fs');
const os = require('os');
const egtb = require('./index.cjs');
const { threads } = require('./parallel.cjs');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const goal = opt('--goal', 'mate');
const names = args.filter((a, i) => /^K[QRBNP]*K[QRBNP]*$/.test(a) && args[i - 1] !== '--goal');
if (!names.length) { console.error('usage: node tools/course-kit/egtb/bench.cjs <material>... [--goal mate|conversion|promotion] [--json file]'); process.exit(2); }

/** Peak resident memory of this process in MB (Linux: the kernel's high-water mark), else the current one. */
function peakMB() {
  try { const m = /VmHWM:\s+(\d+) kB/.exec(fs.readFileSync('/proc/self/status', 'utf8')); if (m) return +m[1] / 1024; } catch { /* not Linux */ }
  return process.memoryUsage().rss / 1048576;
}
/**
 * What a table holds: positions, the longest win, wins / draws / losses for the side to move. Wins and losses
 * are read off the stored bytes (level + 1: even for a win); draws are the positions the solve counted minus
 * those (a table read from the disk cache has no count: its draws are counted slot by slot, slower).
 */
function census(T) {
  const val = T.val;
  let win = 0, loss = 0, longest = 0;
  for (let i = 0; i < val.length; i++) {
    const s = val[i];
    if (!s) continue;
    if (s & 1) loss++; else { win++; if (s - 1 > longest) longest = s - 1; }
  }
  let positions = T.stats?.positions;
  if (positions === undefined) {
    const sqs = new Int8Array(T.n);
    positions = win + loss;
    for (let i = 0; i < val.length; i++) if (!val[i] && T.stores(i, sqs)) positions++;
  }
  return { positions, win, draw: positions - win - loss, loss, longestPlies: longest, longestMoves: (longest + 1) / 2 };
}

const t0 = Date.now();
for (const name of names) egtb.table(name, { goal });
const total = (Date.now() - t0) / 1000;
const rows = [];
for (const [key, T] of egtb.tables) {
  const c = census(T);
  rows.push({ table: key, size: T.size, seconds: T.stats?.cached ? 'cache' : +(T.stats.ms / 1000).toFixed(1), threads: T.stats?.threads ?? 1, ...c, mb: +(T.size / 1048576).toFixed(0) });
}
const w = (s, n) => String(s).padStart(n);
console.log(`${'table'.padEnd(18)}${w('index', 12)}${w('MB', 6)}${w('s', 8)}${w('thr', 4)}${w('positions', 12)}${w('wins', 12)}${w('draws', 12)}${w('losses', 12)}${w('longest', 9)}`);
for (const r of rows) console.log(`${r.table.padEnd(18)}${w(r.size, 12)}${w(r.mb, 6)}${w(r.seconds, 8)}${w(r.threads, 4)}${w(r.positions, 12)}${w(r.win, 12)}${w(r.draw, 12)}${w(r.loss, 12)}${w(r.longestMoves, 9)}`);
const peak = peakMB();
console.log(`${names.join(', ')} (${goal}): ${total.toFixed(1)} s in all on ${threads()} thread(s) (${os.cpus().length} cores), peak memory ${peak.toFixed(0)} MB; longest = moves to mate (to the conversion for goal conversion), side to move winning`);
const json = opt('--json');
if (json) fs.writeFileSync(json, JSON.stringify({ names, goal, seconds: total, threads: threads(), cores: os.cpus().length, peakMB: Math.round(peak), tables: rows }, null, 2));
