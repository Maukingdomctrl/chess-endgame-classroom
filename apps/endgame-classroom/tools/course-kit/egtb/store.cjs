// A table's values on disk, read in pages through one page cache: how a table bigger than the memory (six
// pieces) is solved and probed. The file is the cache file of the table (cache.cjs: header,
// then the values in index order, one or two bytes each); a page of a pawn table is one pawn slice, the unit
// the engine solves and writes, so a solve holds only the slice it works on, the slices its pawn moves lead
// to, and pages of the tables its captures and promotions lead to.
//
//   const v = new PagedValues({ file, offset, count, width, page });   // read-only
//   v.get(i)                       // the stored value at index i
//   new PagedValues({ ..., writable: true }).putPage(p, values)        // the builder writes whole pages
//
// EGTB_PAGE_CACHE (MB, default a quarter of the memory) caps the pages kept by one process (a worker thread
// gets its share). Pages are never changed once written, so a page dropped from the cache is read back as it
// was.
'use strict';
const fs = require('fs');
const os = require('os');
const valuesType = (width) => (width === 2 ? Uint16Array : Uint8Array);

/** Slots per page of a pawnless table read from disk (a pawn table's page is one slice). */
const PAGE = 1 << 22;
let budget = (+process.env.EGTB_PAGE_CACHE || os.totalmem() / 4 / 1048576) * 1048576;
const pages = new Map(); // "store id:page" -> { store, p, a }, the oldest first (the clock's order)
let bytes = 0, nextId = 0;
const stats = { reads: 0, hits: 0, writes: 0, dropped: 0 };

/** Sets the page cache budget in bytes (worker threads: their share of the process budget). */
function setBudget(b) { budget = b; trim(); }
// Eviction by the clock algorithm, close to least recently used: the oldest page goes, unless it was used since
// the clock last passed it (its ref flag), in which case it moves to the end with the flag cleared. A hit only
// sets the flag. (Exact LRU, a hit re-inserted at the end of the map, cost time growing with the number of pages
// cached: 6.7 microseconds a hit with 10,000, most of a build from disk with thousands of slices.)
function trim() {
  while (bytes > budget && pages.size) {
    const [k, e] = pages.entries().next().value;
    pages.delete(k);
    if (e.store.ref[e.p]) { e.store.ref[e.p] = 0; pages.set(k, e); continue; }
    e.store.cached[e.p] = null; bytes -= e.a.byteLength; stats.dropped++;
  }
}
function remember(store, p, a) {
  const k = `${store.id}:${p}`, old = pages.get(k);
  if (old) { bytes -= old.a.byteLength; pages.delete(k); }
  pages.set(k, { store, p, a }); bytes += a.byteLength;
  store.cached[p] = a; store.ref[p] = 0;
  trim();
}

class PagedValues {
  /**
   * file: the table's file; offset: where its values start (after the header); count: index slots; width: 1 or
   * 2 bytes per value; page: slots per page; writable: open for writing pages (the builder).
   */
  constructor({ file, offset, count, width, page, writable = false }) {
    this.file = file; this.offset = offset; this.count = count; this.width = width; this.page = page;
    this.Values = valuesType(width);
    this.writable = writable;
    this.fd = fs.openSync(file, writable ? 'r+' : 'r');
    this.id = nextId++;
    this.lastP = -1; this.lastArr = null; this.lastBase = 0;
    const n = Math.ceil(count / page);
    this.cached = new Array(n).fill(null); // page -> its values while in the cache
    this.ref = new Uint8Array(n); // used since the clock last passed it
  }
  /** The stored value at index i. */
  get(i) {
    const p = Math.floor(i / this.page);
    if (p !== this.lastP) { this.lastArr = this.fetch(p); this.lastP = p; this.lastBase = p * this.page; }
    return this.lastArr[i - this.lastBase];
  }
  /** Slots in page p. */
  pageLength(p) { return Math.min(this.page, this.count - p * this.page); }
  /** Page p's values (from the cache, else read from the file). */
  fetch(p) {
    const hit = this.cached[p];
    if (hit) { stats.hits++; this.ref[p] = 1; return hit; }
    const len = this.pageLength(p);
    if (!(len > 0)) throw new Error(`${this.file}: page ${p} outside the table`);
    const a = new this.Values(len), view = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
    const at = this.offset + p * this.page * this.width;
    let done = 0;
    while (done < view.length) {
      const n = fs.readSync(this.fd, view, done, Math.min(1 << 26, view.length - done), at + done);
      if (n <= 0) throw new Error(`${this.file}: short read of page ${p}`);
      done += n;
    }
    stats.reads++;
    remember(this, p, a);
    return a;
  }
  /** Writes page p (the builder: a solved slice), and keeps it in the cache. */
  putPage(p, a) {
    if (!this.writable) throw new Error(`${this.file}: not open for writing`);
    if (a.length !== this.pageLength(p)) throw new Error(`${this.file}: page ${p} has ${this.pageLength(p)} slots, not ${a.length}`);
    const view = new Uint8Array(a.buffer, a.byteOffset, a.byteLength), at = this.offset + p * this.page * this.width;
    for (let done = 0; done < view.length;) done += fs.writeSync(this.fd, view, done, Math.min(1 << 26, view.length - done), at + done);
    stats.writes++;
    if (p === this.lastP) this.lastArr = a;
    remember(this, p, a);
  }
  /** Every page in order: [first index, values] (for scans of a whole table). */
  *pageList() { for (let p = 0; p * this.page < this.count; p++) yield [p * this.page, this.fetch(p)]; }
  /** Forget the cached pages and close the file. */
  close() {
    for (let p = 0; p < this.cached.length; p++) {
      if (this.cached[p]) { bytes -= this.cached[p].byteLength; pages.delete(`${this.id}:${p}`); this.cached[p] = null; }
    }
    this.lastArr = null; this.lastP = -1;
    if (this.fd >= 0) { fs.closeSync(this.fd); this.fd = -1; }
  }
}

module.exports = { PagedValues, PAGE, setBudget, stats, cachedBytes: () => bytes };
