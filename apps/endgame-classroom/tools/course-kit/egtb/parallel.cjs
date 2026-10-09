// Worker threads for the egtb engine. The tables live on shared memory; the main thread hands out work and
// waits for it synchronously (Atomics.wait + receiveMessageOnPort), so table() and probe() stay synchronous.
//
// Pawn tables: the slices of one advancement do not depend on each other (a pawn push always goes to a more
// advanced slice), so each worker solves whole slices, wave after wave, writing only its own slices.
// Pawnless tables (one domain): the first step is cut into chunks; then each level's positions are shared
// out, and the workers update the values and counters with atomic operations (compare-exchange for a win,
// atomic decrement for a counter), so every position is resolved exactly once.
//
// EGTB_THREADS=n sets the number of threads (1: no workers); the default is the number of cores, at most 8.
'use strict';
const os = require('os');
const { Worker, MessageChannel, receiveMessageOnPort, isMainThread, workerData } = require('worker_threads');

function threads() {
  const v = process.env.EGTB_THREADS;
  if (v !== undefined && v !== '') return Math.max(1, Math.floor(+v) || 1);
  return Math.max(1, Math.min(8, os.availableParallelism ? os.availableParallelism() : os.cpus().length));
}
/** A typed array of the same kind on shared memory (the values copied). */
function shared(arr) {
  if (arr.buffer instanceof SharedArrayBuffer) return arr;
  const out = new arr.constructor(new SharedArrayBuffer(arr.byteLength));
  out.set(arr);
  return out;
}
const sharedZeros = (Type, n) => new Type(new SharedArrayBuffer(n * Type.BYTES_PER_ELEMENT));

/** The goal of the table a capture or promotion leads to (the checker's view): the table's own goal, mate tables for a promotion goal's queen. */
const childGoal = (T, name) => (T.goal === 'promotion' && /[QRBN]/.test(name) ? 'mate' : T.goal);
/** Registry key of a table, the same in every thread. */
const keyOf = (T) => `${T.name}:${T.goal}`;

class Pool {
  constructor(n) {
    this.signal = new Int32Array(new SharedArrayBuffer(4));
    this.workers = [];
    this.attached = new Set();
    for (let i = 0; i < n; i++) {
      const { port1, port2 } = new MessageChannel();
      const w = new Worker(__filename, { workerData: { egtbWorker: true, port: port2, signal: this.signal }, transferList: [port2] });
      w.unref();
      this.workers.push({ w, port: port1 });
    }
  }
  get size() { return this.workers.length; }
  /** Waits for one message from any worker; returns { wi, msg }. */
  receive() {
    for (;;) {
      const seen = Atomics.load(this.signal, 0);
      for (let wi = 0; wi < this.workers.length; wi++) {
        const m = receiveMessageOnPort(this.workers[wi].port);
        if (m) { if (m.message.error) throw new Error(`egtb worker: ${m.message.error}`); return { wi, msg: m.message }; }
      }
      Atomics.wait(this.signal, 0, seen, 2000);
    }
  }
  /** The same message to every worker, waiting until all have handled it. */
  broadcast(msg) {
    for (const w of this.workers) w.port.postMessage(msg);
    for (let k = 0; k < this.workers.length; k++) this.receive();
  }
  /** Runs the tasks on the workers (each worker takes the next one when it is free); results in task order. */
  run(tasks, transfer = () => []) {
    const results = new Array(tasks.length);
    let next = 0, done = 0;
    const give = (wi) => { if (next < tasks.length) { const t = tasks[next]; this.workers[wi].port.postMessage({ ...t, task: next }, transfer(t)); next++; } };
    for (let wi = 0; wi < this.workers.length; wi++) give(wi);
    while (done < tasks.length) { const { wi, msg } = this.receive(); results[msg.task] = msg.result; done++; give(wi); }
    return results;
  }
  /** The workers forget these tables (the main thread dropped them). */
  detach(list) {
    const keys = list.filter((T) => T && T.n !== 2 && this.attached.has(keyOf(T))).map(keyOf);
    if (!keys.length) return;
    for (const k of keys) this.attached.delete(k);
    this.broadcast({ kind: 'detach', keys });
  }
  /** Makes tables available in the workers (their values on shared memory). */
  attach(list) {
    const fresh = [];
    for (const T of list) {
      if (!T || !T.val || T.n === 2) continue;
      const key = keyOf(T);
      if (this.attached.has(key)) continue;
      T.val = shared(T.val);
      this.attached.add(key);
      fresh.push({ key, name: T.name, goal: T.goal, val: T.val });
    }
    if (fresh.length) this.broadcast({ kind: 'attach', tables: fresh });
  }
}
let pool = null;
/** The worker pool (created on first use), or null when running on one thread. */
function getPool() {
  if (!isMainThread) return null;
  const n = threads();
  if (n <= 1) return null;
  if (!pool || pool.size !== n) pool = new Pool(n);
  return pool;
}

/** Solves table T (its exits built, T.val on shared memory) with the pool. */
function solveParallel(T, P) {
  const t0 = Date.now();
  T.stats = { positions: 0, domains: 0, maxLevel: 0, ms: 0, forwardMs: 0, retroMs: 0, unmoves: 0, threads: P.size };
  P.attach([...[...T.exits.values()].map((ex) => ex.table), T]);
  const key = keyOf(T), ds = T.domains();
  // (for pawn tables forwardMs / retroMs add up the workers' time)
  const add = (r) => { T.stats.positions += r.positions; T.stats.unmoves += r.unmoves; if (r.maxLevel > T.stats.maxLevel) T.stats.maxLevel = r.maxLevel; T.stats.domains += r.domains ?? 0; T.stats.forwardMs += r.forwardMs ?? 0; T.stats.retroMs += r.retroMs ?? 0; };
  if (T.pawns) {
    // waves of slices with the same advancement, most advanced first
    for (let a = 0; a < ds.length;) {
      let b = a;
      while (b < ds.length && ds[b].adv === ds[a].adv) b++;
      for (const r of P.run(ds.slice(a, b).map((d) => ({ kind: 'slice', key, slice: d.slice })))) add(r);
      a = b;
    }
  } else {
    const d = ds[0], size = d.hi - d.lo, L = T.layout;
    const cnt = sharedZeros(Uint8Array, size), exm = sharedZeros(Uint8Array, size);
    const { Schedule, List } = require('./engine.cjs');
    const sched = new Schedule(T.name);
    // step 1 in chunks
    const tf = Date.now();
    const parts = Math.min(L.local, P.size * 16), step = Math.ceil(L.local / parts), chunks = [];
    for (let from = 0; from < L.local; from += step) chunks.push({ kind: 'forward', key, from, to: Math.min(L.local, from + step), cnt, exm });
    for (const r of P.run(chunks)) { T.stats.positions += r.positions; sched.merge(r.sched); }
    const tr = Date.now();
    T.stats.forwardMs = tr - tf;
    // step 2, level by level
    let next = null;
    for (let lev = 0; ; lev++) {
      const cur = sched.take(lev, T.val, next);
      if (!cur) { if (lev >= sched.last) break; next = null; continue; }
      T.stats.maxLevel = lev;
      next = new List();
      const list = new Uint32Array(new SharedArrayBuffer(cur.byteLength));
      list.set(cur);
      const n = Math.max(1, Math.min(P.size * 4, Math.ceil(cur.length / 4096))), per = Math.ceil(cur.length / n), tasks = [];
      for (let s = 0; s < cur.length; s += per) tasks.push({ kind: 'retro', key, list, start: s, end: Math.min(cur.length, s + per), lev, cnt, exm });
      for (const r of P.run(tasks)) {
        for (let y = 0; y < r.next.length; y++) next.push(r.next[y]);
        sched.merge(r.sched);
        T.stats.unmoves += r.unmoves;
      }
    }
    T.stats.retroMs = Date.now() - tr;
    T.stats.domains = 1;
  }
  T.stats.ms = Date.now() - t0;
}

/**
 * The independent check (check.cjs) of table T on all threads: the index range cut into pieces. Returns the
 * summed result: { checked, wrong, symmetry, examples, ms, threads }.
 */
function checkParallel(T, opts = {}) {
  const t0 = Date.now();
  const from = opts.from ?? 0, to = Math.min(opts.to ?? T.size, T.size), sample = opts.sample ?? 1;
  const P = getPool();
  const egtb = require('./index.cjs');
  const resolve = (name, goal) => (name.length === 2 ? egtb.BARE : egtb.table(name, { goal: goal ?? childGoal(T, name) }));
  const res = { checked: 0, wrong: 0, symmetry: 0, examples: [], threads: P ? P.size : 1 };
  const addUp = (r) => { res.checked += r.checked; res.wrong += r.wrong; res.symmetry += r.symmetry; res.examples.push(...r.examples.slice(0, 10 - res.examples.length)); };
  if (!P) addUp(require('./check.cjs').checkTable(T, { resolve, sample, from, to }));
  else {
    T.prepareExits();
    P.attach([...[...T.exits.values()].map((ex) => ex.table), T]);
    const parts = P.size * 16, step = Math.ceil((to - from) / parts / 2) * 2, tasks = [];
    for (let a = from; a < to; a += step) tasks.push({ kind: 'check', key: keyOf(T), from: a, to: Math.min(to, a + step), sample });
    for (const r of P.run(tasks)) addUp(r);
  }
  res.ms = Date.now() - t0;
  return res;
}

/** The workers (if any) forget these tables. */
function detach(list) { if (pool) pool.detach(list); }

module.exports = { threads, getPool, solveParallel, checkParallel, detach, shared, sharedZeros, keyOf };

// ---------- the worker ----------
if (!isMainThread && workerData && workerData.egtbWorker) {
  const { port, signal } = workerData;
  const { EgtbTable, Schedule, List } = require('./engine.cjs');
  const { piecesOf } = require('./layout.cjs');
  const { checkTable } = require('./check.cjs');
  const BARE = { name: 'KK', n: 2, value: () => 0 };
  const tables = new Map();
  const resolve = (name, goal) => {
    if (piecesOf(name).length === 2) return BARE;
    const T = tables.get(`${name}:${goal}`);
    if (!T) throw new Error(`table ${name}:${goal} is not attached`);
    return T;
  };
  const toLevels = (sched) => {
    const out = [];
    sched.buckets.forEach((b, level) => { if (b) out.push([level, b.flat()]); });
    return out;
  };
  const handle = (msg) => {
    if (msg.kind === 'attach') {
      for (const t of msg.tables) {
        if (tables.has(t.key)) continue;
        const T = new EgtbTable(t.name, t.goal, resolve);
        T.val = t.val;
        tables.set(t.key, T);
      }
      return null;
    }
    if (msg.kind === 'detach') {
      for (const k of msg.keys) tables.delete(k);
      for (const T of tables.values()) T.exits.clear(); // they may lead to a dropped table: resolved again when used
      return null;
    }
    const T = tables.get(msg.key);
    if (!T) throw new Error(`table ${msg.key} is not attached`);
    if (msg.kind === 'check') return checkTable(T, { resolve: (name, goal) => resolve(name, goal ?? childGoal(T, name)), sample: msg.sample, from: msg.from, to: msg.to });
    if (msg.kind === 'slice') {
      const d = T.domains()[msg.slice];
      T.stats = { positions: 0, domains: 0, maxLevel: 0, ms: 0, forwardMs: 0, retroMs: 0, unmoves: 0 };
      T.solveDomain(d);
      return { positions: T.stats.positions, unmoves: T.stats.unmoves, maxLevel: T.stats.maxLevel, domains: 1, forwardMs: T.stats.forwardMs, retroMs: T.stats.retroMs };
    }
    const d = { ...T.domains()[0], cnt: msg.cnt, exm: msg.exm };
    if (msg.kind === 'forward') {
      const sched = new Schedule(T.name);
      const r = T.forward(d, msg.from, msg.to, sched);
      return { positions: r.positions, sched: toLevels(sched) };
    }
    if (msg.kind === 'retro') {
      const sched = new Schedule(T.name), next = new List();
      T.unmoves = 0;
      T.retro(d, msg.list.subarray(msg.start, msg.end), msg.end - msg.start, msg.lev, next, sched, true);
      return { next: next.flat(), sched: toLevels(sched), unmoves: T.unmoves };
    }
    throw new Error(`unknown task ${msg.kind}`);
  };
  port.on('message', (msg) => {
    let out, transfer = [];
    try {
      const result = handle(msg);
      out = { task: msg.task, result };
      if (result && result.next) transfer.push(result.next.buffer);
      if (result && result.sched) for (const [, a] of result.sched) transfer.push(a.buffer);
    } catch (e) { out = { task: msg.task, error: e.stack || String(e) }; transfer = []; }
    port.postMessage(out, transfer);
    Atomics.add(signal, 0, 1);
    Atomics.notify(signal, 0);
  });
}
