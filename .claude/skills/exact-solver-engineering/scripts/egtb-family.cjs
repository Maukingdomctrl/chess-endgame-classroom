#!/usr/bin/env node
// Sizes a build before it is started: every table a material needs (the tables its captures and promotions
// lead to, recursively, in the order the build solves them), with index sizes, slices, bytes per value (one up
// to five pieces, two from six: EGTB_WIDTH overrides), where the engine keeps it (memory, or disk for a pawn
// table bigger than half the memory budget: EGTB_MEMORY, EGTB_STORAGE) and the memory its solve needs (the
// values of a table in memory, plus the longest exits and counters, width + 1 bytes per slot, of the domain
// being solved: the whole pawnless table, or one slice per thread; a slice on disk: 2 x width + 1 bytes per
// slot), and the totals: disk with KIT_CACHE, the biggest solve. Nothing is solved: the tables are constructed with a
// resolver that only records and recurses.
//
//   node <skill dir>/scripts/egtb-family.cjs KRPKR                  # run from apps/endgame-classroom
//   node <skill dir>/scripts/egtb-family.cjs KRPKR --goal conversion
//   node <skill dir>/scripts/egtb-family.cjs KRPKRP --json family.json
//
// Uses the engine's own exit rules (EgtbTable.prepareExits) and storage rule (index.cjs storageOf), so the
// family is exactly what a build resolves. A layout the engine cannot index throws: the message says so.
// Read-only.
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
const storageOf = require(path.join(KIT, 'egtb/index.cjs')).storageOf ?? (() => 'memory'); // five-piece engines: memory
const PARALLEL_FROM = +(process.env.EGTB_PARALLEL_FROM || 4e6);
const widthOf = (name) => +process.env.EGTB_WIDTH || (piecesOf(name).length >= 6 ? 2 : 1); // as index.cjs
const BARE = { name: 'KK', n: 2, value: () => 0 };

const seen = new Map(); // key -> row
const order = []; // children first: the order a build solves them in
function visit(name, g) {
  const key = `${name}:${g}`;
  if (seen.has(key)) return seen.get(key).stub;
  let T;
  try {
    T = new EgtbTable(name, g, (child, cg) => (piecesOf(child).length === 2 ? BARE : visit(child, cg)), { width: widthOf(name) });
  } catch (e) {
    console.error(`${key}: cannot be laid out: ${e.message}`);
    process.exit(1);
  }
  const width = T.width ?? 1, storage = storageOf(T);
  const domain = T.layout.pawns ? 2 * T.layout.local : T.size; // slots solved at once by one thread
  const solveBytes = storage === 'disk' ? (2 * width + 1) * domain : width * T.size + (width + 1) * domain;
  const row = { table: key, pieces: T.n, size: T.size, slices: T.layout.slices, pawns: T.layout.pawns, width, storage, solveBytes, threads: T.size >= PARALLEL_FROM, stub: { name: T.name } };
  seen.set(key, row);
  T.prepareExits(); // resolves every exit through the recording resolver above: builds nothing
  order.push(key);
  return row.stub;
}
for (const n of names) visit(normalise(n), goal);

const rows = order.map((k) => seen.get(k));
const gb = (n) => `${(n / 1e9).toFixed(2)} G`;
console.log(`${'table'.padEnd(18)}${'pieces'.padStart(7)}${'index slots'.padStart(15)}${'slices'.padStart(8)}${'bytes'.padStart(6)}  kept in  ${'solve needs'.padStart(11)}  solved on`);
for (const r of rows) console.log(`${r.table.padEnd(18)}${String(r.pieces).padStart(7)}${String(r.size).padStart(15)}${String(r.slices).padStart(8)}${String(r.width).padStart(6)}  ${r.storage.padEnd(7)}  ${`${gb(r.solveBytes)}B`.padStart(11)}  ${r.threads ? 'worker threads' : 'one thread'}`);
const total = rows.reduce((a, r) => a + r.size, 0), bytes = rows.reduce((a, r) => a + r.size * r.width, 0);
const byPieces = {};
for (const r of rows) byPieces[r.pieces] = (byPieces[r.pieces] ?? 0) + 1;
const biggest = rows.reduce((a, r) => (r.size > a.size ? r : a), rows[0]);
const hungriest = rows.reduce((a, r) => (r.solveBytes > a.solveBytes ? r : a), rows[0]);
console.log(`\n${rows.length} tables (${Object.entries(byPieces).map(([p, c]) => `${c} with ${p} pieces`).join(', ')}); ${gb(total)} index slots in all`);
console.log(`disk with KIT_CACHE: about ${gb(bytes)}B; in memory if every table stayed: the same`);
console.log(`largest: ${biggest.table}, ${gb(biggest.size)} slots; the biggest solve: ${hungriest.table}, about ${gb(hungriest.solveBytes)}B of working memory (${hungriest.storage === 'disk' ? 'per slice; one slice per thread' : hungriest.pawns ? 'the table and a slice; one more slice per thread' : 'the whole table'}), plus the tables it leads to`);
if (opt('--json')) fs.writeFileSync(opt('--json'), JSON.stringify({ names, goal, total, bytes, rows: rows.map(({ stub, ...r }) => r) }, null, 2));
