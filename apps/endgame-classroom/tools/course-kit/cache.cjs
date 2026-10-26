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
// bytes per value (u32) | count, low 32 bits (u32) | count, high bits (u32) | reserved (u32) | the values.
// (Format 2: counts past 2^32, for six-piece tables.)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FORMAT = 2;
const DEFAULT_DIR = path.join(__dirname, '..', '.kit-cache');
/** The source files whose content decides each producer's results. */
const PRODUCERS = {
  solver: ['solver.cjs', 'board.cjs'],
  oracle: ['pawn/oracle.cjs'],
  egtb: ['egtb/geometry.cjs', 'egtb/layout.cjs', 'egtb/engine.cjs', 'egtb/index.cjs', 'egtb/parallel.cjs', 'egtb/store.cjs'],
};
const HEAD = 4 + 4 + 16 + 16 + 32 + 4 + 4 + 4 + 4;

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
  return { format: buf.readUInt32LE(4), producer: str(8, 16), id: str(24, 16), key: str(40, 32), bytes: buf.readUInt32LE(72), count: buf.readUInt32LE(76) + buf.readUInt32LE(80) * 2 ** 32 };
}

const CHUNK = 1 << 26; // large tables (five pieces: up to 710 MB) are read and written in pieces
/**
 * The cached values (a new typed array of the given type, or of opts.make(count) e.g. one on shared memory),
 * or null if there is no matching entry.
 */
function load(producer, key, count, Type, opts = {}) {
  if (!dir()) return null;
  const file = fileOf(producer, key);
  if (!fs.existsSync(file)) return null;
  const fd = fs.openSync(file, 'r');
  try {
    const head = Buffer.alloc(HEAD);
    fs.readSync(fd, head, 0, HEAD, 0);
    const h = header(head);
    if (!h || h.format !== FORMAT || h.producer !== producer || h.id !== identity(producer) || h.key !== key.slice(0, 32) ||
      h.bytes !== Type.BYTES_PER_ELEMENT || h.count !== count || fs.fstatSync(fd).size !== HEAD + count * h.bytes) return null;
    const out = opts.make ? opts.make(count) : new Type(count);
    const bytes = new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
    for (let at = 0; at < bytes.length; at += CHUNK) {
      const len = Math.min(CHUNK, bytes.length - at);
      if (fs.readSync(fd, bytes, at, len, HEAD + at) !== len) return null;
    }
    return out;
  } finally { fs.closeSync(fd); }
}
/** Stores the values (atomically: written to a temporary file, then renamed). No-op when caching is off. */
function save(producer, key, values) {
  if (!dir()) return;
  const h = Buffer.concat([Buffer.from('KITC', 'latin1'), Buffer.alloc(4), pad(producer, 16), pad(identity(producer), 16), pad(key, 32), Buffer.alloc(16)]);
  h.writeUInt32LE(FORMAT, 4);
  h.writeUInt32LE(values.BYTES_PER_ELEMENT, 72);
  h.writeUInt32LE(values.length % 2 ** 32, 76);
  h.writeUInt32LE(Math.floor(values.length / 2 ** 32), 80);
  const file = fileOf(producer, key);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`; // per process: two processes saving one table never share a file
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, h, 0, h.length, 0);
    const bytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
    for (let at = 0; at < bytes.length; at += CHUNK) fs.writeSync(fd, bytes, at, Math.min(CHUNK, bytes.length - at), HEAD + at);
  } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, file);
}

/**
 * For values too big to load at once (cache entries read in pages, egtb/store.cjs): the file of a valid entry
 * and where its values start, { file, offset }, or null. Same checks as load().
 */
function openRead(producer, key, count, bytes) {
  if (!dir()) return null;
  const file = fileOf(producer, key);
  if (!fs.existsSync(file)) return null;
  const fd = fs.openSync(file, 'r');
  try {
    const head = Buffer.alloc(HEAD);
    fs.readSync(fd, head, 0, HEAD, 0);
    const h = header(head);
    if (!h || h.format !== FORMAT || h.producer !== producer || h.id !== identity(producer) || h.key !== key.slice(0, 32) ||
      h.bytes !== bytes || h.count !== count || fs.fstatSync(fd).size !== HEAD + count * bytes) return null;
    return { file, offset: HEAD };
  } finally { fs.closeSync(fd); }
}
let scratch = null;
/** A directory for files written while caching is off (removed when the process exits). */
function scratchDir() {
  if (!scratch) {
    scratch = fs.mkdtempSync(path.join(require('os').tmpdir(), 'kit-scratch-'));
    process.on('exit', () => { try { fs.rmSync(scratch, { recursive: true, force: true }); } catch { /* gone */ } });
  }
  return scratch;
}
/**
 * A cache entry written in pieces (egtb/store.cjs): a temporary file with the header and room for count values
 * of `bytes` bytes, written at { file, offset }; commit() renames it into place and returns the final file
 * (atomic: a crash leaves no half-written entry). With caching off the file goes to a scratch directory.
 */
function createWrite(producer, key, count, bytes) {
  const final = dir() ? fileOf(producer, key) : path.join(scratchDir(), `${producer}-${key.replace(/[^\w-]/g, '-')}.bin`);
  fs.mkdirSync(path.dirname(final), { recursive: true });
  const tmp = `${final}.${process.pid}.tmp`; // per process: two builds of one table never share a file
  const h = Buffer.concat([Buffer.from('KITC', 'latin1'), Buffer.alloc(4), pad(producer, 16), pad(identity(producer), 16), pad(key, 32), Buffer.alloc(16)]);
  h.writeUInt32LE(FORMAT, 4);
  h.writeUInt32LE(bytes, 72);
  h.writeUInt32LE(count % 2 ** 32, 76);
  h.writeUInt32LE(Math.floor(count / 2 ** 32), 80);
  const fd = fs.openSync(tmp, 'w');
  try { fs.writeSync(fd, h, 0, h.length, 0); fs.ftruncateSync(fd, HEAD + count * bytes); } finally { fs.closeSync(fd); }
  return {
    file: tmp, offset: HEAD,
    commit() { fs.renameSync(tmp, final); return final; },
    abort() { try { fs.unlinkSync(tmp); } catch { /* gone */ } },
  };
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

/**
 * Temporary files in the cache directory ("<entry>.<pid>.tmp": a save or a build on disk in progress, or left
 * by a process that died): { file, size, pid, alive }. A six-piece build killed midway leaves one of tens of
 * gigabytes.
 */
function leftovers() {
  const d = dir();
  if (!d || !fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter((f) => /\.\d+\.tmp$/.test(f)).map((f) => {
    const file = path.join(d, f), pid = +f.match(/\.(\d+)\.tmp$/)[1];
    let alive = true;
    try { process.kill(pid, 0); } catch (e) { alive = e.code !== 'ESRCH'; }
    return { file, size: fs.statSync(file).size, pid, alive };
  });
}

module.exports = { load, save, openRead, createWrite, scratchDir, identity, entries, leftovers, dir, FORMAT, PRODUCERS };

if (require.main === module) {
  const cmd = process.argv[2] ?? 'list';
  if (!dir()) { console.log('KIT_CACHE is not set: caching is off (KIT_CACHE=1 uses tools/.kit-cache).'); process.exit(0); }
  const all = entries(), tmp = leftovers();
  const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;
  if (cmd === 'list') {
    for (const e of all) console.log(`${e.current ? 'current' : 'STALE  '}  ${e.producer.padEnd(7)} ${e.key.padEnd(20)} ${mb(e.size).padStart(9)}  ${path.basename(e.file)}`);
    for (const t of tmp) console.log(`${t.alive ? 'writing' : 'LEFT   '}  (process ${t.pid}${t.alive ? '' : ', gone'}) ${mb(t.size).padStart(9)}  ${path.basename(t.file)}`);
    console.log(`${all.length} file(s), ${mb(all.reduce((s, e) => s + e.size, 0))} in ${dir()}; ${all.filter((e) => !e.current).length} stale` +
      (tmp.length ? `; ${tmp.length} temporary, ${tmp.filter((t) => !t.alive).length} left by a process that is gone` : ''));
  } else if (cmd === 'prune' || cmd === 'clear') {
    // temporary files only of processes that are gone: a live one is still writing
    const gone = [...all.filter((e) => cmd === 'clear' || !e.current), ...tmp.filter((t) => !t.alive)];
    for (const e of gone) fs.unlinkSync(e.file);
    console.log(`removed ${gone.length} file(s), ${mb(gone.reduce((s, e) => s + e.size, 0))}`);
  } else { console.error('usage: node tools/course-kit/cache.cjs [list|prune|clear]'); process.exit(2); }
}
