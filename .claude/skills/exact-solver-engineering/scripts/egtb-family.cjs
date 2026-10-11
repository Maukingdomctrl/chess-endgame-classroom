#!/usr/bin/env node
// Sizes a build before it is started: every table a material needs (the tables its captures and promotions
// lead to, recursively, in the order the build solves them), with index sizes, slices and whether workers solve
// it, and the totals: memory if every table stays in memory, disk with KIT_CACHE (one byte per index slot).
// Nothing is solved: the tables are constructed with a resolver that only records and recurses.
//
//   node <skill dir>/scripts/egtb-family.cjs KRPKR                  # run from apps/endgame-classroom
//   node <skill dir>/scripts/egtb-family.cjs KRPKR --goal conversion
//   node <skill dir>/scripts/egtb-family.cjs KPPKP --json family.json
//
// Uses the engine's own exit rules (EgtbTable.prepareExits), so the family is exactly what a build resolves.
// A table needing more than 2^32 slots throws in the layout: the message says so. Read-only.
'use strict';
const fs = require('fs');
const path = require('path');

/** The course-kit directory: KIT_DIR, or found from the current directory upwards. */
function kitDir() {
  if (process.env.KIT_DIR) return path.resolve(process.env.KIT_DIR);
  for (let d = process.cwd(); ; d = path.dirname(d)) {
    for (const c of ['tools/course-kit', 'apps/endgame-classroom/tools/course-kit']) {
      if (fs.existsSync(path.join(d, c, 'egtb/engine.cjs'))) return path.join(d, c);
    }
    if (path.dirname(d) === d) throw new Error('course-kit not found: run inside the repository or set KIT_DIR');
  }
}

const args = process.argv.slice(2);
const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const names = args.filter((a, i) => /^K[QRBNP]*K[QRBNP]*$/.test(a) && !['--goal', '--json'].includes(args[i - 1]));
const goal = opt('--goal') ?? 'mate';
if (!names.length) { console.error('usage: node egtb-family.cjs <material>... [--goal mate|promotion|conversion] [--json file]'); process.exit(2); }

const KIT = kitDir();
const { EgtbTable } = require(path.join(KIT, 'egtb/engine.cjs'));
const { piecesOf, normalise } = require(path.join(KIT, 'egtb/layout.cjs'));
const PARALLEL_FROM = +(process.env.EGTB_PARALLEL_FROM || 4e6);
const BARE = { name: 'KK', n: 2, value: () => 0 };

const seen = new Map(); // key -> row
const order = []; // children first: the order a build solves them in
function visit(name, g) {
  const key = `${name}:${g}`;
  if (seen.has(key)) return seen.get(key).stub;
  let T;
  try {
    T = new EgtbTable(name, g, (child, cg) => (piecesOf(child).length === 2 ? BARE : visit(child, cg)));
  } catch (e) {
    console.error(`${key}: cannot be laid out: ${e.message}`);
    process.exit(1);
  }
  const row = { table: key, pieces: T.n, size: T.size, slices: T.layout.slices, pawns: T.layout.pawns, threads: T.size >= PARALLEL_FROM, stub: { name: T.name } };
  seen.set(key, row);
  T.prepareExits(); // resolves every exit through the recording resolver above: builds nothing
  order.push(key);
  return row.stub;
}
for (const n of names) visit(normalise(n), goal);

const rows = order.map((k) => seen.get(k));
const gb = (n) => `${(n / 1e9).toFixed(2)} G`;
console.log(`${'table'.padEnd(18)}${'pieces'.padStart(7)}${'index slots'.padStart(15)}${'slices'.padStart(8)}  solved on`);
for (const r of rows) console.log(`${r.table.padEnd(18)}${String(r.pieces).padStart(7)}${String(r.size).padStart(15)}${String(r.slices).padStart(8)}  ${r.threads ? 'worker threads' : 'one thread'}`);
const total = rows.reduce((a, r) => a + r.size, 0);
const byPieces = {};
for (const r of rows) byPieces[r.pieces] = (byPieces[r.pieces] ?? 0) + 1;
const biggest = rows.reduce((a, r) => (r.size > a.size ? r : a), rows[0]);
console.log(`\n${rows.length} tables (${Object.entries(byPieces).map(([p, c]) => `${c} with ${p} pieces`).join(', ')}); ${gb(total)} index slots in all`);
console.log(`memory if every table stays: about ${gb(total)}B (one byte per slot, plus working state per thread); disk with KIT_CACHE: the same`);
console.log(`largest: ${biggest.table}, ${gb(biggest.size)} slots (${(biggest.size / 2 ** 32 * 100).toFixed(1)}% of the 2^32 index limit)`);
if (opt('--json')) fs.writeFileSync(opt('--json'), JSON.stringify({ names, goal, total, rows: rows.map(({ stub, ...r }) => r) }, null, 2));
