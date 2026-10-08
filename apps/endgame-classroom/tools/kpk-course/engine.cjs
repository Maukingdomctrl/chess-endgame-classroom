// Line generation + geometry on top of the KPK solver (normalised coords: attacker = white pawn moving up).
const K = require('./kpk.cjs');
const { dtc, idx, whiteMoves, blackMoves, pawnAttacks, dist, file, rank } = K;

const val = (wk, bk, p, stm) => dtc[idx(wk, bk, p, stm)];

function keySquares(p) {
  const f = file(p), r = rank(p), out = [];
  if (f === 0) return [6 * 8 + 1, 7 * 8 + 1];          // a-pawn: b7, b8
  if (f === 7) return [6 * 8 + 6, 7 * 8 + 6];          // h-pawn: g7, g8
  const rows = r <= 3 ? [r + 2] : r <= 5 ? [r + 1, r + 2] : [];
  for (const rr of rows) for (let ff = f - 1; ff <= f + 1; ff++) if (rr < 8) out.push(rr * 8 + ff);
  return out;
}
const directOpp = (a, b) =>
  (file(a) === file(b) && Math.abs(rank(a) - rank(b)) === 2) || (rank(a) === rank(b) && Math.abs(file(a) - file(b)) === 2);
const distantOpp = (a, b) =>
  (file(a) === file(b) && [4, 6].includes(Math.abs(rank(a) - rank(b)))) ||
  (rank(a) === rank(b) && [4, 6].includes(Math.abs(file(a) - file(b))));
const diagOpp = (a, b) => Math.abs(file(a) - file(b)) === 2 && Math.abs(rank(a) - rank(b)) === 2;
const promoSq = (p) => 56 + file(p);

/** Attacker (stm 0) options with outcome. */
function attackerOptions(s) {
  return whiteMoves(s.wk, s.bk, s.p).map((m) => {
    if (m.kind === 'promo') return { ...m, win: m.result === 'win', d: m.result === 'win' ? 0 : -1 };
    const d = val(m.child[0], m.child[1], m.child[2], 1);
    return { ...m, win: d > 0, d };
  });
}
/** Defender (stm 1) options; holds = draw for defender. */
function defenderOptions(s) {
  return blackMoves(s.wk, s.bk, s.p).map((m) => {
    if (m.capture) return { ...m, holds: true, d: 0 };
    const d = val(m.child[0], m.child[1], m.child[2], 0);
    return { ...m, holds: d === 0, d };
  });
}
const losingRepliesFor = (child) => defenderOptions({ wk: child[0], bk: child[1], p: child[2] }).filter((o) => !o.holds).length;

/**
 * Plays a line. mode 'win': trainee = attacker; mode 'draw': trainee = defender.
 * Returns { plies:[{side,move,unique,alts,end?}], end }.
 */
function playLine(start, mode, opts = {}) {
  let s = { ...start };
  const plies = [];
  const max = opts.maxPlies ?? (mode === 'win' ? 90 : 16);
  // opts.finish (draw mode): instead of repeating moves, the attacker pushes the pawn, so the line
  // ends in something the learner can see (stalemate, or the pawn or new queen being taken).
  const seen = new Set();
  const key = (q) => `${q.wk}-${q.bk}-${q.p}-${q.stm}`;
  for (let n = 0; n < max; n++) {
    seen.add(key(s));
    if (s.stm === 0) {
      const os = attackerOptions(s);
      if (!os.length) return { plies, end: 'stalemate-att' }; // the side with the pawn is stalemated
      let pick, unique = null, alts = 0, others = [];
      if (mode === 'win') {
        const winners = os.filter((o) => o.win);
        if (!winners.length) return { plies, end: 'error:no-win' };
        // distinct winning moves (queen/rook promotion on the same square count once)
        const keys = new Set(winners.map((o) => `${o.from}-${o.to}`));
        alts = keys.size; unique = keys.size === 1;
        winners.sort((a, b) => (a.kind === 'promo' ? -1 : 0) - (b.kind === 'promo' ? -1 : 0) || a.d - b.d || (a.kind === 'k' ? 0 : 1) - (b.kind === 'k' ? 0 : 1) || (a.promo === 'q' ? -1 : 1));
        pick = winners[0];
        // other moves that win just as fast (one per from/to: a rook promotion beside the queen one is not offered)
        others = [...new Map(winners.map((o) => [`${o.from}-${o.to}`, o])).values()].filter(
          (o) => (o.from !== pick.from || o.to !== pick.to) && o.kind !== 'promo' && pick.kind !== 'promo' && o.d === pick.d);
      } else {
        if (os.some((o) => o.win)) return { plies, end: 'error:attacker-wins' };
        const stalemates = (o) =>
          o.kind !== 'promo' && defenderOptions({ wk: o.child[0], bk: o.child[1], p: o.child[2] }).length === 0 && !pawnAttacks(o.child[2], o.child[1]);
        const scored = os.map((o) => ({ o, sm: stalemates(o) ? 1 : 0, traps: o.kind === 'promo' ? -1 : losingRepliesFor(o.child) }));
        // The attacker shows the most instructive try: a stalemate finish, else the move that sets the most traps.
        scored.sort((a, b) => b.sm - a.sm || b.traps - a.traps || (a.o.kind === 'p' ? 0 : 1) - (b.o.kind === 'p' ? 0 : 1) || dist(a.o.to, promoSq(s.p)) - dist(b.o.to, promoSq(s.p)));
        pick = scored[0].o;
        const repeats = (o) => o.kind !== 'promo' && seen.has(key({ wk: o.child[0], bk: o.child[1], p: o.child[2], stm: 1 }));
        if (opts.finish && repeats(pick)) {
          const fresh = scored.map((x) => x.o).filter((o) => !repeats(o));
          pick = fresh.find((o) => o.kind === 'p') ?? fresh.find((o) => o.kind === 'promo') ?? fresh[0];
          if (!pick) return { plies, end: 'max' };
        }
      }
      plies.push({ side: 'att', move: pick, unique, alts, others: others.map(({ from, to, promo }) => ({ from, to, promo })), before: { ...s } });
      if (pick.kind === 'promo' && pick.result === 'win') return { plies, end: 'promoted' };
      if (pick.kind === 'promo') {
        // A drawn promotion: the defender takes the new piece, or has no move (stalemate).
        const q = pick.to, bk = s.bk;
        if (dist(bk, q) <= 1 && dist(s.wk, q) > 1) {
          plies.push({ side: 'def', move: { from: bk, to: q, capture: true, takesPromoted: true }, unique: true, alts: 1, before: { ...s, p: q, stm: 1 } });
          return { plies, end: 'captured-promo' };
        }
        return { plies, end: 'stalemate' };
      }
      s = { wk: pick.child[0], bk: pick.child[1], p: pick.child[2], stm: 1 };
    } else {
      const os = defenderOptions(s);
      if (!os.length) return { plies, end: pawnAttacks(s.p, s.bk) ? 'mate' : 'stalemate' };
      let pick, unique = null, alts = 0, others = [];
      const front = s.p + 8;
      if (mode === 'win') {
        if (os.some((o) => o.holds)) return { plies, end: 'error:defender-holds' };
        os.sort((a, b) => b.d - a.d || dist(a.to, front) - dist(b.to, front) || dist(a.to, s.p) - dist(b.to, s.p));
        pick = os[0];
      } else {
        const holders = os.filter((o) => o.holds);
        if (!holders.length) return { plies, end: 'error:defender-loses' };
        alts = holders.length; unique = holders.length === 1;
        const score = (o) => (o.capture ? -100 : 0) + (directOpp(o.to, s.wk) ? -10 : 0) + dist(o.to, promoSq(s.p)) + dist(o.to, front) * 0.5;
        holders.sort((a, b) => score(a) - score(b));
        pick = holders[0];
        others = pick.capture ? [] : holders.slice(1); // when the pawn can be taken, take it
      }
      plies.push({ side: 'def', move: pick, unique, alts, others: others.map(({ from, to }) => ({ from, to })), before: { ...s } });
      if (pick.capture) return { plies, end: 'captured' };
      s = { wk: pick.child[0], bk: pick.child[1], p: pick.child[2], stm: 0 };
    }
  }
  return { plies, end: 'max' };
}
module.exports = { K, val, keySquares, directOpp, distantOpp, diagOpp, promoSq, attackerOptions, defenderOptions, playLine };
