#!/usr/bin/env node
// Summarise V8 CPU profiles (node --cpu-prof) by function: self time (where the CPU is) and inclusive time
// (what it is spent on behalf of), so the next optimisation goes where the time goes, not where it is guessed.
//
//   EGTB_THREADS=1 node --cpu-prof --cpu-prof-dir=prof -e "require('./tools/course-kit/egtb/index.cjs').table('KQKR')"
//   node cpuprofile-top.cjs prof/*.cpuprofile            # top 25 functions by self time
//   node cpuprofile-top.cjs prof/*.cpuprofile --top 40 --lines   # also the hottest source lines
//   node cpuprofile-top.cjs prof/*.cpuprofile --under retro      # only samples inside retro() (percentages of those)
//
// --under keeps the samples that have the named function on their stack: use it when other work pollutes the
// profile (sub-tables built on the fly, start-up, I/O) or to study one phase. Better still, build the
// sub-tables before profiling and time phases directly; --under is for what remains.
// Several files (e.g. one per worker thread) are added together. Rows: self ms, self %, inclusive ms,
// inclusive %, function file:line. "(garbage collector)" high = allocation in a hot loop; "(program)" =
// native/runtime work outside JavaScript. A recursive function is counted once per sample in its
// inclusive time. --lines needs the profile's positionTicks (Node writes them; otherwise it says so).
'use strict';
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const top = args.includes('--top') ? Number(args[args.indexOf('--top') + 1]) : 25;
const lines = args.includes('--lines');
const under = args.includes('--under') ? args[args.indexOf('--under') + 1] : null;
const files = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--top' && args[i - 1] !== '--under');
if (!files.length) { console.error('usage: node cpuprofile-top.cjs <file.cpuprofile>... [--top N] [--lines] [--under functionName]'); process.exit(2); }

const self = new Map(), incl = new Map(), lineTime = new Map();
let total = 0, withTicks = false, skipped = 0;
const add = (m, k, v) => m.set(k, (m.get(k) ?? 0) + v);

for (const file of files) {
  const p = JSON.parse(fs.readFileSync(file, 'utf8'));
  const byId = new Map(p.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of p.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const keyOf = (n) => {
    const f = n.callFrame;
    return `${f.functionName || '(anonymous)'}  ${f.url ? `${path.basename(f.url)}:${f.lineNumber + 1}` : ''}`.trim();
  };
  // the distinct functions on each node's stack (memoised: stacks share their prefixes)
  const stackKeys = new Map();
  const keysOf = (id) => {
    let ks = stackKeys.get(id);
    if (ks) return ks;
    const up = parent.has(id) ? keysOf(parent.get(id)) : [];
    const k = keyOf(byId.get(id));
    ks = up.includes(k) ? up : [...up, k];
    stackKeys.set(id, ks);
    return ks;
  };
  // the time of sample i is the gap to the next sample (the last one gets the mean gap)
  const { samples, timeDeltas } = p;
  const mean = (p.endTime - p.startTime) / Math.max(1, samples.length);
  // with --under: does this node have the named function on its stack? (memoised)
  const inside = new Map();
  const isUnder = (id) => {
    if (!under) return true;
    if (inside.has(id)) return inside.get(id);
    const r = byId.get(id).callFrame.functionName === under || (parent.has(id) && isUnder(parent.get(id)));
    inside.set(id, r);
    return r;
  };
  for (let i = 0; i < samples.length; i++) {
    const dt = (i + 1 < samples.length ? timeDeltas[i + 1] : mean) / 1000; // ms
    const id = samples[i];
    if (!isUnder(id)) { skipped += dt; continue; }
    total += dt;
    add(self, keyOf(byId.get(id)), dt);
    for (const k of keysOf(id)) add(incl, k, dt);
  }
  if (lines) {
    // positionTicks: ticks per source line inside a function (self time only)
    for (const n of p.nodes) {
      if (!n.positionTicks?.length || !n.hitCount || !isUnder(n.id)) continue;
      withTicks = true;
      for (const t of n.positionTicks) add(lineTime, `${path.basename(n.callFrame.url)}:${t.line}  (${n.callFrame.functionName || 'anonymous'})`, (t.ticks * mean) / 1000);
    }
  }
}

const pct = (v) => `${((100 * v) / total).toFixed(1).padStart(5)}%`;
const ms = (v) => `${v.toFixed(0).padStart(8)} ms`;
console.log(`${files.length} profile(s), ${(total / 1000).toFixed(1)} s sampled${under ? ` under ${under}() (${(skipped / 1000).toFixed(1)} s elsewhere left out)` : ''}\n`);
if (!total) { console.log(under ? `no samples with ${under}() on the stack` : 'no samples'); process.exit(1); }
console.log(`${'self'.padStart(11)} ${''.padStart(6)} ${'inclusive'.padStart(11)} ${''.padStart(6)}  function`);
for (const [k, v] of [...self].sort((a, b) => b[1] - a[1]).slice(0, top)) {
  console.log(`${ms(v)} ${pct(v)} ${ms(incl.get(k) ?? 0)} ${pct(incl.get(k) ?? 0)}  ${k}`);
}
if (lines) {
  console.log(`\nhottest lines (self time)${withTicks ? '' : ': no positionTicks in these profiles'}`);
  for (const [k, v] of [...lineTime].sort((a, b) => b[1] - a[1]).slice(0, top)) console.log(`${ms(v)} ${pct(v)}  ${k}`);
}
