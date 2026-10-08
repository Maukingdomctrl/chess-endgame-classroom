// Picks the lines of a course from the candidate positions: per lesson group, a filter on the position
// (pre), an even sample, the line played out, a filter on the line (post), ranking, and the variety rules.
//
//   const picked = pickLines(groups, cands, { lineOf, firstMove });
//
// A group: { id, lesson, v: [lo, hi] (plies to the promotion), count, scarce (higher picks first),
// minScore (least share of unique learner moves), pre(c), post(line), sample (overrides opts.sample) }.
//
// Ranking: the share of unique learner moves, then longer lines, then the table index (stable).
//
// Variety (all mirror images alike, see structure.cjs):
// - every line its own white king and pawns (setupKey), across the whole course;
// - a new line may not start where another starts or passes, the black king may not walk another
//   line's path, and at most `overlap` of its positions (at least one) may appear elsewhere;
// - short lessons (pictures, traps: opts.short) need other kings, other pawns and another walk in every
//   line instead (their lines are too short for the rules above);
// - at most `share(group)` lines of a group on the same pair of files, or with the same pattern
//   (shapeKey). The default, a third of the group (two of a small one), lets a lesson whose idea is one
//   pattern still fill up, while a group that could vary does.
const { posKey, pathKey, kingsKey, setupKey, pawnSetKey, shapeKey, wingKey } = require('./structure.cjs');

/** Every k-th element, so that at most `limit` remain, spread evenly over the list (deterministic). */
function sampleEvenly(list, limit) {
  const step = Math.max(1, Math.ceil(list.length / limit));
  return list.filter((_, k) => k % step === 0);
}
/** An even sample per stratum (e.g. per shapeKey), so that no stratum crowds out the others. */
function sampleStratified(list, limit, keyOf) {
  const strata = new Map();
  for (const x of list) { const k = keyOf(x); if (!strata.has(k)) strata.set(k, []); strata.get(k).push(x); }
  const per = Math.max(1, Math.floor(limit / Math.max(1, strata.size)));
  const keep = new Set([...strata.values()].flatMap((xs) => sampleEvenly(xs, per)));
  return list.filter((x) => keep.has(x));
}

/** Learner moves of a line, and how many have no equally fast alternative. */
const evaluate = (L) => { const w = L.plies.filter((p) => p.side === 'w'); const u = w.filter((p) => !p.others.length).length; return { n: w.length, uniq: u, score: u / w.length }; };

function pickLines(groups, cands, opts) {
  const { lineOf, firstMove, sample = 3000, short = ['finish', 'stalemate'], overlap = 1 / 4,
    share = (g) => Math.max(2, Math.ceil(g.count / 3)), sampler = sampleEvenly, log = console.log } = opts;
  const used = new Set(), seen = new Set(), starts = new Set(), paths = new Set(), setups = new Set();
  const picked = [];
  const order = [...groups].sort((a, b) => (b.scarce ?? 0) - (a.scarce ?? 0));
  for (const g of order) {
    const [lo, hi] = g.v;
    const found = [];
    const pool = cands.filter((c) => c.v >= lo && c.v <= hi && firstMove(c) && (!g.pre || g.pre(c)));
    for (const c of sampler(pool, g.sample ?? sample)) {
      const L = lineOf(c);
      if (!L || (g.post && !g.post(L))) continue;
      const ev = evaluate(L);
      if (g.minScore && ev.score < g.minScore) continue;
      const wp = L.plies.filter((p) => p.side === 'w');
      const positions = wp.map((p) => posKey(p.before));
      found.push({ c, L, ev, positions, path: pathKey(wp.map((p) => p.before[1])), kings: kingsKey(c.sqs), setup: setupKey(c.sqs),
        pawnSet: pawnSetKey(c.sqs), shape: shapeKey(c.sqs), files: wingKey(c.sqs), key: positions[0] });
    }
    found.sort((a, b) => b.ev.score - a.ev.score || b.ev.n - a.ev.n || a.c.i - b.c.i);
    const isShort = short.includes(g.lesson);
    const cap = share(g);
    const chosen = [];
    for (const x of found) {
      if (chosen.length >= g.count) break;
      if (used.has(x.key) || setups.has(x.setup)) continue;
      if (chosen.filter((y) => y.files === x.files).length >= cap) continue;
      const mine = picked.filter((p) => p.lesson === g.lesson).map((p) => p.x).concat(chosen);
      if (chosen.filter((y) => y.shape === x.shape).length >= cap) continue;
      if (isShort) {
        if (mine.some((y) => y.kings === x.kings || y.pawnSet === x.pawnSet || (x.positions.length > 1 && y.path === x.path))) continue;
      } else {
        if (seen.has(x.positions[0]) || x.positions.some((k) => starts.has(k)) || paths.has(x.path)) continue;
        if (x.positions.filter((k) => seen.has(k)).length > Math.max(1, Math.floor(x.positions.length * overlap))) continue;
      }
      chosen.push(x);
      used.add(x.key);
      setups.add(x.setup);
      if (isShort) continue;
      starts.add(x.positions[0]);
      paths.add(x.path);
      for (const k of x.positions) seen.add(k);
    }
    if (chosen.length < g.count) throw new Error(`${g.id}: only ${chosen.length} of ${g.count} positions found (${found.length} candidates)`);
    log(`${g.id.padEnd(10)} candidates=${String(found.length).padStart(6)} picked=${chosen.length} unique=${chosen.map((x) => `${x.ev.uniq}/${x.ev.n}`).join(' ')}`);
    for (const x of chosen) picked.push({ lesson: g.lesson, group: g.id, line: x.L, ev: x.ev, x });
  }
  picked.sort((a, b) => groups.findIndex((g) => g.id === a.group) - groups.findIndex((g) => g.id === b.group));
  return picked;
}

/** Show the lines on both wings: every second line of a lesson mirrored (files a <-> h). */
function alternateMirror(picked) {
  const nth = {};
  for (const p of picked) {
    const k = (nth[p.lesson] = (nth[p.lesson] ?? -1) + 1);
    p.mirror = k % 2 === 1;
  }
  return picked;
}

module.exports = { pickLines, sampleEvenly, sampleStratified, alternateMirror, evaluate };
