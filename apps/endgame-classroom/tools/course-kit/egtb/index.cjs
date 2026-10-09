// The egtb engine's tables, built on first use and kept for the run (see README.md).
//
//   const egtb = require('./egtb/index.cjs');
//   egtb.table('KRPKR')                     // the solved table
//   egtb.table('KPPPK', { goal: 'promotion' })
//
// The engine builds every table it needs itself, down to the smallest: a capture or a promotion leads to the
// table of the material left. Its tables with up to four pieces hold exactly the values of solver.cjs's own
// tables (checked position by position by kit:selftest5), but solver.cjs keeps building those for the
// courses, so that nothing they depend on changes.
'use strict';
const os = require('os');
const cache = require('../cache.cjs');
const { EgtbTable } = require('./engine.cjs');
const { normalise, piecesOf } = require('./layout.cjs');
const parallel = require('./parallel.cjs');

// index size from which a table is solved on worker threads (EGTB_PARALLEL_FROM: tests run small tables on them)
const PARALLEL_FROM = +(process.env.EGTB_PARALLEL_FROM || 4e6);

// Memory: with the disk cache on (KIT_CACHE), the tables kept in memory stay under a budget (EGTB_MEMORY in MB,
// default 60% of the machine's memory): the least recently used ones that no build in progress needs are
// dropped and read back from the disk when they are needed again. Without the cache every table stays.
const BUDGET = (+process.env.EGTB_MEMORY || Math.max(2048, (0.6 * os.totalmem()) / 1048576)) * 1048576;

const tables = new Map(); // key -> table, in order of last use (the most recent last)
const building = []; // the tables being built (their exits must stay)
/** The table of two bare kings: always a draw. */
const BARE = { name: 'KK', n: 2, value: () => 0 };

/** The table a capture or a promotion leads to. */
const resolve = (name, goal) => (piecesOf(name).length === 2 ? BARE : table(name, { goal }));

/** The solved table of a material. opts.goal: 'mate' (default), 'promotion' or 'conversion'. */
function table(name, opts = {}) {
  name = normalise(name);
  const goal = opts.goal ?? 'mate';
  const key = `${name}:${goal}`;
  let T = tables.get(key);
  if (T) { tables.delete(key); tables.set(key, T); return T; } // most recently used
  T = new EgtbTable(name, goal, resolve);
  // big tables are solved by worker threads (on shared memory); small ones are not worth starting them
  const pool = T.size >= PARALLEL_FROM ? parallel.getPool() : null;
  const make = pool ? (n) => parallel.sharedZeros(Uint8Array, n) : undefined;
  T.val = cache.load('egtb', key, T.size, Uint8Array, { make });
  if (!T.val) {
    building.push(T);
    try {
      T.prepareExits(); // every table a capture or promotion leads to, built first
      if (pool) { T.val = make(T.size); parallel.solveParallel(T, pool); } else T.solve();
    } finally { building.pop(); }
    cache.save('egtb', key, T.val);
  } else T.stats = { cached: true };
  tables.set(key, T);
  trim();
  return T;
}

/** Drops the least recently used tables while the ones in memory are over the budget (disk cache on only). */
function trim() {
  if (!cache.dir()) return;
  let bytes = 0;
  for (const T of tables.values()) bytes += T.val.byteLength;
  if (bytes <= BUDGET) return;
  const needed = new Set();
  for (const B of building) { needed.add(B); for (const ex of B.exits.values()) needed.add(ex.table); }
  const gone = [];
  for (const [key, T] of tables) { // oldest first
    if (bytes <= BUDGET) break;
    if (needed.has(T)) continue;
    tables.delete(key); gone.push(T); bytes -= T.val.byteLength;
  }
  if (!gone.length) return;
  // forget them everywhere: the exits that lead to them are resolved again (from the disk) when used
  const dropped = new Set(gone);
  for (const T of [...tables.values(), ...building]) for (const [k, ex] of T.exits) if (dropped.has(ex.table)) T.exits.delete(k);
  parallel.detach(gone);
}

/** Forget the tables built so far (tests, memory). */
function reset() { parallel.detach([...tables.values()]); tables.clear(); }

module.exports = { table, reset, tables, BARE };
