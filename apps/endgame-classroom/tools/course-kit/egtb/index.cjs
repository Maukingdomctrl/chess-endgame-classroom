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
// dropped and read back from the disk when they are needed again. The table just asked for and the tables its
// captures and promotions lead to always stay, even over the budget (dropping them would read them back on
// every probe). Without the cache every table stays.
const BUDGET = (+process.env.EGTB_MEMORY || Math.max(2048, (0.6 * os.totalmem()) / 1048576)) * 1048576;

// Storage: a table is kept in memory, unless it is a pawn table whose values take more than half the memory
// budget (six pieces): then it is solved slice by slice and read in pages from its file (store.cjs).
// EGTB_STORAGE=disk|memory forces one or the other for pawn tables (tests); pawnless tables are one domain and
// are always solved in memory.
const STORAGE = process.env.EGTB_STORAGE || '';
const storageOf = (T) => (!T.pawns ? 'memory' : STORAGE === 'disk' || STORAGE === 'memory' ? STORAGE : T.size * T.width > BUDGET / 2 ? 'disk' : 'memory');

// Values: one byte per position up to five pieces (the deepest five-piece mate is 229 plies), two bytes from six
// pieces on (six-piece mates run past 254 plies). EGTB_WIDTH=1|2 sets the width of every table (tests).
const WIDTH = process.env.EGTB_WIDTH ? +process.env.EGTB_WIDTH : 0;
const widthOf = (name) => WIDTH || (piecesOf(name).length >= 6 ? 2 : 1);

const tables = new Map(); // key -> table, in order of last use (the most recent last)
const busy = []; // the tables being built or fetching a table they lead to (they and their exits must stay)
let dropped = 0; // tables dropped under the budget so far (tests)
/** The table of two bare kings: always a draw. */
const BARE = { name: 'KK', n: 2, value: () => 0 };

/** The table a capture or a promotion of table `from` leads to; `from` and its exits stay in memory meanwhile. */
function resolveFor(from, name, goal) {
  if (piecesOf(name).length === 2) return BARE;
  busy.push(from);
  try { return table(name, { goal }); } finally { busy.pop(); }
}

/**
 * The solved table of a material. opts.goal: 'mate' (default), 'promotion' or 'conversion'; opts.width: bytes
 * per value (default: 1 up to five pieces, 2 from six).
 */
function table(name, opts = {}) {
  name = normalise(name);
  const goal = opts.goal ?? 'mate', width = opts.width ?? widthOf(name);
  const key = `${name}:${goal}${width === 2 ? ':w2' : ''}`;
  let T = tables.get(key);
  if (T) { tables.delete(key); tables.set(key, T); return T; } // most recently used
  T = new EgtbTable(name, goal, (n, g) => resolveFor(T, n, g), { width });
  // big tables are solved by worker threads (on shared memory); small ones are not worth starting them
  const pool = T.size >= PARALLEL_FROM ? parallel.getPool() : null;
  if (storageOf(T) === 'disk') build(T, key, pool);
  else {
    const make = pool ? (n) => parallel.sharedZeros(T.Values, n) : undefined;
    T.val = cache.load('egtb', key, T.size, T.Values, { make });
    if (!T.val) {
      busy.push(T);
      try {
        T.prepareExits(); // every table a capture or promotion leads to, built first
        if (pool) { T.val = make(T.size); parallel.solveParallel(T, pool); } else T.solve();
      } finally { busy.pop(); }
      cache.save('egtb', key, T.val);
    } else T.stats = { cached: true };
  }
  tables.set(key, T);
  trim(T);
  return T;
}

/**
 * A table kept on disk: its cache file read in pages, or built slice by slice into a new file (each solved
 * slice written as it is done; the file is renamed into place when the table is complete).
 */
function build(T, key, pool) {
  const ref = cache.openRead('egtb', key, T.size, T.width);
  if (ref) { T.useStore(ref); T.stats = { cached: true }; return; }
  const w = cache.createWrite('egtb', key, T.size, T.width);
  busy.push(T);
  try {
    T.useStore({ file: w.file, offset: w.offset, writable: true });
    T.prepareExits();
    if (pool) parallel.solveParallel(T, pool); else T.solve();
  } catch (e) { w.abort(); throw e; } finally { busy.pop(); }
  parallel.detach([T]); // the workers knew it by its temporary file
  const stats = T.stats;
  T.useStore({ file: w.commit(), offset: w.offset });
  T.stats = stats;
}

/**
 * Drops the least recently used tables while the ones in memory are over the budget (disk cache on only), but
 * never a busy table (being built, or fetching a table it leads to), the table just asked for (keep), or a
 * table one of them leads to.
 */
function trim(keep) {
  if (!cache.dir()) return;
  let bytes = 0;
  for (const T of tables.values()) bytes += T.memoryBytes();
  if (bytes <= BUDGET) return;
  const needed = new Set();
  for (const B of [...busy, keep]) { needed.add(B); for (const ex of B.exits.values()) needed.add(ex.table); }
  const gone = [];
  for (const [key, T] of tables) { // oldest first
    if (bytes <= BUDGET) break;
    if (needed.has(T)) continue;
    if (!T.val) continue; // on disk: its pages are the page cache's (store.cjs)
    tables.delete(key); gone.push(T); bytes -= T.val.byteLength;
  }
  if (!gone.length) return;
  dropped += gone.length;
  // forget them everywhere: the exits that lead to them are resolved again (from the disk) when used
  const out = new Set(gone);
  for (const T of [...tables.values(), ...busy]) for (const [k, ex] of T.exits) if (out.has(ex.table)) T.exits.delete(k);
  parallel.detach(gone);
}

/** Forget the tables built so far (tests, memory). */
function reset() { parallel.detach([...tables.values()]); tables.clear(); }

module.exports = { table, reset, tables, BARE, evictions: () => dropped, storageOf };
