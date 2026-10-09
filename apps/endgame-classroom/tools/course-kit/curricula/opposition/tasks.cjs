// The tasks of the Direct Opposition course: what the learner has to decide in a position, decided by the
// solver and the board, never by a heuristic alone. The blueprint (direct-opposition.cjs) names a task for
// every slot; the generator (Prompt 3) searches positions with classify() and fills the slots.
//
//   const { classify } = require('./tasks.cjs');
//   classify(fen, ex)   // { task, learner, first, orientation, givesWay, pawn, ... } | null
//
// ex: a teach/explain.cjs explainer with the course's vocabulary (direct-opposition.cjs VOCABULARY), so the
// reasons are the ones the course can name. The learner plays White (the owner's rule).
const { Chess } = require('chess.js');
const { sqIdx, file, rank } = require('../../board.cjs');
const { pawnSide } = require('../../pawn/domain.cjs');

const TASKS = {
  take: 'Take the direct opposition: the only fastest move, and a likely move draws',
  retake: 'Black has to move and give way; take the direct opposition again',
  either: 'Several moves win equally fast; one of them takes the direct opposition',
  defend: 'Defend against Black\'s pawn: the only move that holds takes the direct opposition',
  protect: 'Protect the pawn first: the only fastest move; a likely move that takes the opposition draws',
  push: 'Push the pawn, it runs: the only fastest move; a likely move that takes the opposition draws or is slower',
};

const king = (fen, color) => { for (const row of new Chess(fen).board()) for (const p of row) if (p && p.type === 'k' && p.color === color) return sqIdx(p.square); return -1; };
/** 'vertical' (same file) or 'horizontal' (same rank) when the kings stand in direct opposition, else null. */
function directOrientation(fen) {
  const w = king(fen, 'w'), b = king(fen, 'b');
  if (file(w) === file(b) && Math.abs(rank(w) - rank(b)) === 2) return 'vertical';
  if (rank(w) === rank(b) && Math.abs(file(w) - file(b)) === 2) return 'horizontal';
  return null;
}
/** The learner has the direct opposition in fen by the domain's facts (the opponent to move, the pawn's way contested). */
const hasDirect = (ex, fen, side) => ex.facts(fen).some((f) => f.id === 'opposition' && f.kind === 'direct' && f.side === side);
const pawnOf = (fen) => { for (const row of new Chess(fen).board()) for (const p of row) if (p && p.type === 'p') return p.square; return null; };
/** The learner's first king move: 'straight' (towards the other side), 'diagonal', 'sideways' or 'back'. */
function shapeOf(m, learner) {
  if (m.piece !== 'k') return 'pawn';
  const f = sqIdx(m.from), t = sqIdx(m.to), up = (rank(t) - rank(f)) * (learner === 'w' ? 1 : -1);
  return file(f) === file(t) ? (up > 0 ? 'straight' : 'back') : up > 0 ? 'diagonal' : up === 0 ? 'sideways' : 'back';
}
/** Where the defending king stands at the start, from the pawn's file: 'onFile', 'besideFile' or 'away'. */
function defenderPlace(fen) {
  const p = pawnOf(fen);
  if (!p) return null;
  const d = king(fen, pawnSide(fen) === 'w' ? 'b' : 'w');
  const df = Math.abs(file(d) - file(sqIdx(p)));
  return df === 0 ? 'onFile' : df === 1 ? 'besideFile' : 'away';
}

/** The decision at fen for the learner to move: one of TASKS, or null when the position fits none. */
function decide(fen, ex) {
  const out = ex.outcomes(fen);
  const learner = out.learner;
  const best = out.moves.filter((m) => m.kind === 'best');
  const plausible = ex.plausible(fen) ?? [];
  const lets = out.moves.filter((m) => m.kind === 'draws' || m.kind === 'loses');
  const traps = lets.filter((m) => plausible.includes(m.san));
  const takes = (m) => m.piece === 'k' && hasDirect(ex, m.fen, learner);
  // what the tempting mistakes are: a step that hands Black the opposition, a premature pawn push
  const trapReasons = traps.map((m) => ex.explainMove(fen, m.san).facts[0] ?? null);
  const base = {
    learner, mode: out.mode, traps: traps.map((m) => m.san), pawn: pawnOf(fen), defender: defenderPlace(fen),
    trapGivesOpposition: trapReasons.includes('opposition'), trapIsPush: traps.some((m) => m.piece === 'p'),
  };
  if (out.mode === 'hold') {
    if (best.length !== 1 || !traps.length || !takes(best[0])) return null;
    const e = ex.explainMove(fen, best[0].san);
    return e.facts[0] === 'opposition' ? { ...base, task: 'defend', first: best[0].san, shape: shapeOf(best[0], learner), orientation: directOrientation(best[0].fen), givesWay: e.facts.includes('zugzwang'), text: e.text } : null;
  }
  if (out.mode !== 'win' || !traps.length) return null;
  if (best.length > 1) {
    const grounded = best.filter(takes).map((m) => ({ m, e: ex.explainMove(fen, m.san) })).find((x) => x.e.facts[0] === 'opposition');
    return grounded ? { ...base, task: 'either', first: grounded.m.san, shape: shapeOf(grounded.m, learner), also: best.filter((m) => m !== grounded.m).map((m) => m.san), orientation: directOrientation(grounded.m.fen), text: grounded.e.text } : null;
  }
  const b = best[0];
  const e = ex.explainMove(fen, b.san);
  if (takes(b) && e.facts[0] === 'opposition') return { ...base, task: 'take', first: b.san, shape: shapeOf(b, learner), orientation: directOrientation(b.fen), givesWay: e.facts.includes('zugzwang'), text: e.text };
  const oppTraps = out.moves.filter((m) => m.kind !== 'best' && plausible.includes(m.san) && takes(m));
  if (e.facts[0] === 'pawnProtected' && oppTraps.some((m) => m.kind === 'draws')) return { ...base, task: 'protect', first: b.san, text: e.text, contrast: oppTraps.map((m) => m.san) };
  if (b.piece === 'p' && e.facts[0] === 'outsideSquare' && oppTraps.length) return { ...base, task: 'push', first: b.san, text: e.text, contrast: oppTraps.map((m) => m.san) };
  return null;
}

/**
 * The task a start position poses. White to move: the decision now. Black to move ('retake'): White has the
 * direct opposition, the solver shows Black in zugzwang (to move it loses, with White to move it would be
 * a draw), Black plays its most stubborn defence (the first in chess.js order, as a line would), and the
 * learner's decision is then to take the direct opposition again.
 */
function classify(fen, ex) {
  const g = new Chess(fen);
  if (!pawnSide(fen) || g.isGameOver()) return null;
  if (g.turn() === 'w') return decide(fen, ex);
  if (pawnSide(fen) !== 'w' || !hasDirect(ex, fen, 'w')) return null;
  const z = ex.zugzwang(fen, 'w');
  if (!z || z.side !== 'b' || z.withMove !== 'win') return null;
  const reply = ex.replies(fen).find((r) => r.kind === 'stubborn');
  const d = reply && decide(reply.fen, ex);
  return d && d.task === 'take' ? { ...d, task: 'retake', reply: reply.san, defender: defenderPlace(fen), startOrientation: directOrientation(fen) } : null;
}

module.exports = { TASKS, classify, decide, directOrientation, shapeOf, defenderPlace };
