// Disk cache for solved tables, so a course generator that is run again and again does not rebuild them
// (the pawn tables take minutes). Off unless KIT_CACHE is set:
//
//   KIT_CACHE=1 npm run course:pawns          # cache in apps/endgame-classroom/tools/.kit-cache
//   KIT_CACHE=/tmp/kit npm run course:pawns   # or in a directory of your choice
//   npm run kit:cache                         # list the cache (current / stale entries)
//   npm run kit:cache -- prune                # delete stale entries;  -- clear: delete everything
//
// Invalidation: every file records the code that produced it, as a checksum of the producer's source
// files (PRODUCERS below) and of FORMAT. A file is used only when its producer, checksum, key and size all
// match the running code; anything else is ignored and rebuilt. So a change to the solver, the board
// helpers or the oracle can never be answered by an old table. Bump FORMAT when the file layout changes.
//
// File layout: "KITC" | format (u32) | producer (16 bytes) | identity (16 hex) | key (32 bytes) |
// bytes per value (u32) | count (u32) | the values.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FORMAT = 1;
const DEFAULT_DIR = path.join(__dirname, '..', '.kit-cache');
/** The source files whose content decides each producer's results. */
const PRODUCERS = {
  solver: ['solver.cjs', 'board.cjs'],
  oracle: ['pawn/oracle.cjs'],
};
const HEAD = 4 + 4 + 16 + 16 + 32 + 4 + 4;

/** The cache directory, or null when caching is off. */
function dir() {
  const v = process.env.KIT_CACHE;
  if (!v || v === '0') return null;
  return v === '1' ? DEFAULT_DIR : path.resolve(v);
}
const ids = new Map();
/** Checksum of the producer's code (FORMAT included). */
function identity(producer) {
  if (!PRODUCERS[producer]) throw new Error(`cache: unknown producer "${producer}"`);
  if (!ids.has(producer)) {
    const h = crypto.createHash('sha1').update(`format ${FORMAT}\n`);
    for (const f of PRODUCERS[producer]) h.update(fs.readFileSync(path.join(__dirname, f)));
    ids.set(producer, h.digest('hex').slice(0, 16));
  }
  return ids.get(producer);
}
const fileOf = (producer, key) => path.join(dir(), `${producer}-${key.replace(/[^\w-]/g, '-')}-${identity(producer)}.bin`);
const pad = (s, n) => Buffer.from(s.padEnd(n, '\0').slice(0, n), 'latin1');

/** Reads the header of a cache file: { format, producer, id, key, bytes, count } or null. */
function header(buf) {
  if (buf.length < HEAD || buf.toString('latin1', 0, 4) !== 'KITC') return null;
  const str = (o, n) => buf.toString('latin1', o, o + n).replace(/\0+$/, '');
  return { format: buf.readUInt32LE(4), producer: str(8, 16), id: str(24, 16), key: str(40, 32), bytes: buf.readUInt32LE(72), count: buf.readUInt32LE(76) };
}

/** The cached values (a new typed array of the given type), or null if there is no matching entry. */
function load(producer, key, count, Type) {
  if (!dir()) return null;
  const file = fileOf(producer, key);
  if (!fs.existsSync(file)) return null;
  const buf = fs.readFileSync(file);
  const h = header(buf);
  if (!h || h.format !== FORMAT || h.producer !== producer || h.id !== identity(producer) || h.key !== key.slice(0, 32) ||
    h.bytes !== Type.BYTES_PER_ELEMENT || h.count !== count || buf.length !== HEAD + count * h.bytes) return null;
  const out = new Type(count);
  new Uint8Array(out.buffer).set(buf.subarray(HEAD));
  return out;
}
/** Stores the values (atomically: written to a temporary file, then renamed). No-op when caching is off. */
function save(producer, key, values) {
  if (!dir()) return;
  const h = Buffer.concat([Buffer.from('KITC', 'latin1'), Buffer.alloc(4), pad(producer, 16), pad(identity(producer), 16), pad(key, 32), Buffer.alloc(8)]);
  h.writeUInt32LE(FORMAT, 4);
  h.writeUInt32LE(values.BYTES_PER_ELEMENT, 72);
  h.writeUInt32LE(values.length, 76);
  const file = fileOf(producer, key);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, Buffer.concat([h, Buffer.from(values.buffer, values.byteOffset, values.byteLength)]));
  fs.renameSync(`${file}.tmp`, file);
}

/** Every file in the cache directory: { file, size, producer, key, current }. */
function entries() {
  const d = dir();
  if (!d || !fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter((f) => f.endsWith('.bin')).map((f) => {
    const file = path.join(d, f);
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(HEAD);
    fs.readSync(fd, buf, 0, HEAD, 0);
    fs.closeSync(fd);
    const h = header(buf);
    const current = !!h && h.format === FORMAT && !!PRODUCERS[h.producer] && h.id === identity(h.producer);
    return { file, size: fs.statSync(file).size, producer: h?.producer ?? '?', key: h?.key ?? '?', current };
  });
}

module.exports = { load, save, identity, entries, dir, FORMAT, PRODUCERS };

if (require.main === module) {
  const cmd = process.argv[2] ?? 'list';
  if (!dir()) { console.log('KIT_CACHE is not set: caching is off (KIT_CACHE=1 uses tools/.kit-cache).'); process.exit(0); }
  const all = entries();
  const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;
  if (cmd === 'list') {
    for (const e of all) console.log(`${e.current ? 'current' : 'STALE  '}  ${e.producer.padEnd(7)} ${e.key.padEnd(20)} ${mb(e.size).padStart(9)}  ${path.basename(e.file)}`);
    console.log(`${all.length} file(s), ${mb(all.reduce((s, e) => s + e.size, 0))} in ${dir()}; ${all.filter((e) => !e.current).length} stale`);
  } else if (cmd === 'prune' || cmd === 'clear') {
    const gone = all.filter((e) => cmd === 'clear' || !e.current);
    for (const e of gone) fs.unlinkSync(e.file);
    console.log(`removed ${gone.length} file(s), ${mb(gone.reduce((s, e) => s + e.size, 0))}`);
  } else { console.error('usage: node tools/course-kit/cache.cjs [list|prune|clear]'); process.exit(2); }
}
