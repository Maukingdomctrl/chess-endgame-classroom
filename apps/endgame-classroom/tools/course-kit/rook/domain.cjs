// Rook and pawn against rook for the teaching layer (../teach/): the facts the board shows in K+R+P vs K+R
// (either side may have the pawn), the words for them, and how the conversion goal's outcomes are said. The
// teaching layer stays generic; everything about rook endings is here.
//
//   const { createExplainer } = require('../teach/explain.cjs');
//   const ex = createExplainer({ verify, domain: require('./domain.cjs') });
//
// Facts, read from the board (the attacker has the pawn; `side` is whom a fact helps):
//   cutOff      the attacker's rook stands on a file between the defending king and the pawn
//   drive       a rook check along the defending king's file after which, whatever the reply, the king is cut off
//               (every reply tried on the board)
//   bridge      the pawn on its 7th rank with its king in front of it, the rook on the 4th rank, not behind the pawn
//               (the Lucena)
//   kingOut     the pawn on its 7th rank, its king beside it (off the queening square, protecting the pawn)
//   shield      the pawn on its 7th rank, the rook on the 4th rank on its king's file, below the king (it blocks
//               checks along that file; not the pawn's file, where the pawn blocks them)
//   noChecks    the defending rook has no check against the attacking king (the defender not in check)
//   skewer      a rook checks the king with that king's rook behind it on the same line, and after every
//               reply the rook can be taken (both plies tried on the board); also once the pawn is gone
//   skewerTrap  if the defending rook takes the pawn, a rook check makes such a skewer
//   rookFar     the defending rook stands two ranks or more behind the attacking king (checks from a distance), and
//               the attacker to move cannot take it
//   kingFront   the defending king stands on the pawn's file in front of it
// A claim of a continuation (the skewer winning the rook, the check cutting the king off) is tried on the board
// move by move, never assumed.
// plausible(fen): the moves a learner would consider: all but those that hang the rook (the opponent takes it and
// it cannot be taken back) and promotions to a knight or a bishop.
//
// Phrases are written for the learner as White: attacking with the pawn (the Lucena, the skewer) or defending
// against Black's pawn (the Philidor). gain: the learner's move creates the fact; keep: it was there and
// stays; give: the opponent gets it; lose: a learner's fact disappears.
'use strict';
const { Chess } = require('chess.js');
const { file, rank, sqName } = require('../board.cjs');

const other = (c) => (c === 'w' ? 'b' : 'w');
/** The pieces of a FEN by letter (squares 0-63, a1 = 0) and the side to move. */
function pieces(fen) {
  const [board, turn] = fen.split(' ');
  const out = { turn };
  let r = 7, f = 0;
  for (const c of board) {
    if (c === '/') { r--; f = 0; } else if (c >= '1' && c <= '8') f += +c;
    else { (out[c] ??= []).push(r * 8 + f); f++; }
  }
  return out;
}
/** K+R+P vs K+R with either side's pawn: { att, def, aK, dK, aR, dR, pawn, rel } or null. */
function rookEnding(fen) {
  const p = pieces(fen);
  const one = (c) => p[c]?.length === 1;
  if (!(one('K') && one('k') && one('R') && one('r')) || p.Q || p.q || p.B || p.b || p.N || p.n) return null;
  const att = one('P') && !p.p ? 'w' : one('p') && !p.P ? 'b' : null;
  if (!att) return null;
  const w = att === 'w';
  return {
    att, def: other(att), turn: p.turn,
    aK: w ? p.K[0] : p.k[0], dK: w ? p.k[0] : p.K[0], aR: w ? p.R[0] : p.r[0], dR: w ? p.r[0] : p.R[0],
    pawn: w ? p.P[0] : p.p[0],
    rel: (s) => (w ? rank(s) : 7 - rank(s)), // ranks counted from the attacker's side: the pawn promotes on 7
  };
}
/** The position with `side` to move, or null when that is not a legal position (the other side in check). */
function withTurn(fen, side) {
  const f = fen.split(' ');
  if (f[1] === side) return new Chess(fen);
  try { return new Chess([f[0], side, '-', '-', '0', '1'].join(' ')); } catch { return null; }
}
const sanOf = (g, m) => { const c = new Chess(g.fen()); return c.move(m.san).san; };

/**
 * The attacker's rook gives check (g: the defender to move, in check) with the defending rook on the same line
 * behind the king, and after every reply the attacker can take that rook and keep it (no recapture): the
 * skewer, tried on the board.
 */
function skewerWins(g, e) {
  if (!g.inCheck() || g.turn() !== e.def) return false;
  const { aR, dK, dR } = e;
  // the defending rook on the far side of the king, on the checking rook's rank or file
  const sameRank = rank(aR) === rank(dK) && rank(dK) === rank(dR) && (file(dK) - file(aR)) * (file(dR) - file(dK)) > 0;
  const sameFile = file(aR) === file(dK) && file(dK) === file(dR) && (rank(dK) - rank(aR)) * (rank(dR) - rank(dK)) > 0;
  if (!sameRank && !sameFile) return false;
  const target = sqName(dR);
  const keeps = (h, m) => { const k = new Chess(h.fen()); k.move(m.san); return !k.moves({ verbose: true }).some((x) => x.to === target); };
  for (const reply of g.moves({ verbose: true })) {
    const h = new Chess(g.fen());
    h.move(reply.san);
    if (!h.moves({ verbose: true }).some((m) => m.to === target && m.captured === 'r' && keeps(h, m))) return false;
  }
  return true;
}

/** Rook against rook, with or without one pawn: the side to move in check from the other rook, its own rook behind. */
function skewerNow(fen) {
  const p = pieces(fen);
  const one = (c) => p[c]?.length === 1;
  if (!(one('K') && one('k') && one('R') && one('r')) || p.Q || p.q || p.B || p.b || p.N || p.n || (p.P?.length ?? 0) + (p.p?.length ?? 0) > 1) return null;
  const def = p.turn, by = other(def);
  const g = new Chess(fen);
  const e = { def, dK: def === 'w' ? p.K[0] : p.k[0], dR: def === 'w' ? p.R[0] : p.r[0], aR: def === 'w' ? p.r[0] : p.R[0] };
  return skewerWins(g, e) ? { id: 'skewer', key: `skewer:${by}`, side: by } : null;
}

function facts(fen) {
  const out = [];
  const sk = skewerNow(fen);
  if (sk) out.push(sk);
  const e = rookEnding(fen);
  if (!e) return out;
  const { att, def, aK, dK, aR, dR, pawn, rel } = e;
  const add = (id, side, extra = {}) => out.push({ id, key: `${id}:${side}`, side, ...extra });
  const cut = (r, k) => (file(r) - file(pawn)) * (file(r) - file(k)) < 0;
  if (cut(aR, dK)) add('cutOff', att, { files: Math.abs(file(dK) - file(pawn)) - 1 });
  const queening = pawn + (att === 'w' ? 8 : -8);
  const beside = Math.max(Math.abs(file(aK) - file(pawn)), Math.abs(rank(aK) - rank(pawn))) === 1;
  if (rel(pawn) === 6 && rel(aR) === 3 && aK === queening && file(aR) !== file(pawn)) add('bridge', att);
  if (rel(pawn) === 6 && beside && aK !== queening) add('kingOut', att);
  if (rel(pawn) === 6 && rel(aR) === 3 && file(aR) === file(aK) && file(aK) !== file(pawn) && rel(aK) > rel(aR)) add('shield', att, { file: 'abcdefgh'[file(aK)] });
  // (with the attacker to move: not if it can take the rook at once)
  const hangs = () => fen.split(' ')[1] === att && new Chess(fen).moves({ verbose: true }).some((m) => m.to === sqName(dR));
  if (rel(aK) - rel(dR) >= 2 && !hangs()) add('rookFar', def);
  if (file(dK) === file(pawn) && rel(dK) > rel(pawn)) add('kingFront', def);
  // what the defender can do now, tried on the board (the defender to move; skipped where that is not legal)
  const g = withTurn(fen, def);
  if (g) {
    const moves = g.moves({ verbose: true });
    // the rook checks along the king's file (without the rook there would be no check), and after every reply
    // the king is cut off, the rook still standing
    const noRook = new Chess(g.fen());
    noRook.remove(sqName(aR));
    if (fen.split(' ')[1] === def && g.inCheck() && !noRook.inCheck() && file(aR) === file(dK) && moves.every((m) => {
      const c = new Chess(g.fen());
      c.move(m.san);
      const h = rookEnding(c.fen());
      return h && h.aR === aR && cut(h.aR, h.dK);
    })) add('drive', att);
    if (!g.inCheck() && !moves.some((m) => m.piece === 'r' && /\+/.test(m.san))) add('noChecks', att);
    if (fen.split(' ')[1] === def) {
      // the defending rook takes the pawn: does a rook check then win it?
      for (const take of moves.filter((m) => m.piece === 'r' && m.to === sqName(pawn))) {
        const h = new Chess(g.fen());
        h.move(take.san);
        const e2 = { ...e, dR: pawn };
        const check = h.moves({ verbose: true }).find((m) => {
          if (m.piece !== 'r' || !/\+/.test(m.san)) return false;
          const k = new Chess(h.fen());
          k.move(m.san);
          return skewerWins(k, { ...e2, aR: (m.to.charCodeAt(1) - 49) * 8 + (m.to.charCodeAt(0) - 97) });
        });
        if (check) { add('skewerTrap', att, { take: take.san, check: sanOf(h, check) }); break; }
      }
    }
  }
  return out;
}

const phrases = {
  // the order a reason is chosen in, when a move creates several
  priority: ['skewer', 'skewerTrap', 'drive', 'shield', 'bridge', 'kingOut', 'noChecks', 'cutOff', 'rookFar', 'kingFront'],
  gain: {
    skewer: () => 'Check: the rook behind the king falls.',
    skewerTrap: (f) => `If ...${f.take}, ${f.check} wins the rook.`,
    drive: () => 'Check: the black king steps away and is cut off.',
    // the rook moves in front of the king's file, or the king steps behind the rook
    shield: (f) => (f.move?.piece === 'k' ? `Your king steps behind the rook: no checks on the ${f.file}-file.` : `Shield your king: the rook blocks checks on the ${f.file}-file.`),
    // said only of the rook's move (a king move back in front of the pawn does not build anything)
    bridge: (f) => (f.move?.piece === 'r' ? 'Build the bridge: your rook goes to the 4th rank.' : null),
    kingOut: () => 'Your king steps out, still next to the pawn.',
    noChecks: () => 'Black has no checks left.',
    cutOff: () => 'Cut the black king off from the pawn.',
    rookFar: () => 'Go far behind the king: check from a distance.',
    kingFront: () => 'Step in front of the pawn.',
    // the solver's zugzwang (results for the learner): Black to move loses, or (holding a draw) cannot win
    zugzwang: (f) => (f.solver?.withMove === 'win' ? 'Black is in zugzwang: every move loses.' : 'Black is in zugzwang: it must move, so it cannot win.'),
  },
  keep: {
    cutOff: () => 'The black king stays cut off.',
    shield: () => 'The rook still shields your king.',
    kingOut: () => 'Your king stays next to the pawn.',
    bridge: () => 'Your rook stays on the 4th rank.',
    rookFar: () => 'Keep the rook far away.',
    kingFront: () => 'Your king stays in front of the pawn.',
  },
  give: {
    // the learner attacking: what Black's defence gets
    rookFar: () => 'Black can check from a distance.',
    kingFront: () => "Black's king gets in front of the pawn.",
    // the learner defending: what Black's attack gets
    cutOff: () => 'Your king is cut off from the pawn.',
    drive: () => "Black's check cuts your king off.",
    bridge: () => 'Black builds the bridge.',
    noChecks: () => 'You have no checks left.',
    skewer: () => 'A skewer: your rook falls.',
    zugzwang: () => 'You end up in zugzwang.',
  },
  lose: {
    cutOff: () => 'The black king gets back to the pawn.',
    kingFront: () => "Your king leaves the pawn's path.",
    rookFar: () => 'The rook comes too close to check.',
  },
  // goal 'conversion': a line ends with the capture or promotion that keeps the win, so "mate" is the wrong word
  outcome: {
    best: (v, m) => (v[0] === 0 && v[1] === 0
      ? (m.promotion ? 'Promote: the win is safe.' : m.captured ? 'Take it: the win is safe.' : 'Checkmate!')
      : `The quickest way: ${Math.ceil(v[1] / 2)} more ${Math.ceil(v[1] / 2) === 1 ? 'move' : 'moves'}.`),
  },
};

/** The moves a learner would consider (see the header): all but those that hang the rook, and no knight or bishop promotion. */
function plausible(fen) {
  const g = new Chess(fen);
  return g.moves({ verbose: true }).filter((m) => {
    if (m.promotion === 'n' || m.promotion === 'b') return false;
    const h = new Chess(fen);
    h.move(m.san);
    // the opponent takes a rook and it cannot be taken back
    return !h.moves({ verbose: true }).some((x) => {
      if (x.captured !== 'r') return false;
      const k = new Chess(h.fen());
      k.move(x.san);
      return !k.moves({ verbose: true }).some((y) => y.to === x.to);
    });
  }).map((m) => m.san);
}

module.exports = { facts, phrases, plausible, rookEnding, skewerWins };
