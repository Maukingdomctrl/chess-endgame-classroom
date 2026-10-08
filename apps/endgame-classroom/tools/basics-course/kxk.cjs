// King + queen or king + rook against the lone king, in the shape the lessons work with (white king wk,
// black king bk, piece x). The values come from the toolkit's exact solver (../course-kit/solver.cjs);
// this file adds the move lists and attack maps the lesson search, the engine and the notes use.
const { table } = require('../course-kit/solver.cjs');
const { dist, kingAdj, rays, ROOK_DIRS, QUEEN_DIRS } = require('../course-kit/board.cjs');

function makeSolver(piece) {
  const dirs = piece === 'q' ? QUEEN_DIRS : ROOK_DIRS;
  const T = table(piece === 'q' ? 'KQK' : 'KRK');
  // Squares attacked by the piece with the white king as the only blocker: the black king does not
  // block (it cannot hide behind itself when it steps along the line).
  const attacked = (wk, x) => {
    const set = new Uint8Array(64);
    for (const t of rays(x, dirs, [wk])) set[t] = 1;
    return set;
  };
  const legal = (wk, bk, x, stm) => {
    if (wk === bk || wk === x || bk === x) return false;
    if (dist(wk, bk) <= 1) return false;
    if (stm === 0 && rays(x, dirs, [wk, bk]).includes(bk)) return false; // Black can't be in check on White's turn
    return true;
  };
  const inCheck = (wk, bk, x) => rays(x, dirs, [wk, bk]).includes(bk);
  /** Black's moves: { to, capture?, child? } */
  function blackMoves(wk, bk, x) {
    const att = attacked(wk, x);
    const out = [];
    for (const t of kingAdj[bk]) {
      if (dist(t, wk) <= 1) continue;
      if (t === x) { out.push({ from: bk, to: t, capture: true }); continue; } // x is unprotected (dist(t,wk) > 1)
      if (att[t]) continue;
      out.push({ from: bk, to: t, child: [wk, t, x] });
    }
    return out;
  }
  /** White's moves: { kind: 'k'|'x', from, to, child } */
  function whiteMoves(wk, bk, x) {
    const out = [];
    for (const t of kingAdj[wk]) {
      if (t === x || dist(t, bk) <= 1) continue;
      out.push({ kind: 'k', from: wk, to: t, child: [t, bk, x] });
    }
    for (const t of rays(x, dirs, [wk, bk])) {
      if (t === wk || t === bk) continue;
      out.push({ kind: 'x', from: x, to: t, child: [wk, bk, t] });
    }
    return out;
  }
  // Distance to mate in plies, as the lessons count it: White to move mates in an odd number of plies,
  // Black to move is mated in an even number (0 = mated now); -1 = draw (stalemate, or the piece lost).
  const sq = new Int8Array(3);
  const val = (wk, bk, x, stm) => {
    sq[0] = wk; sq[1] = bk; sq[2] = x;
    const v = T.value(sq, stm);
    return stm === 0 ? (v > 0 ? v : -1) : (v < 0 ? -v - 1 : -1);
  };
  return { piece, dirs, val, legal, inCheck, attacked, whiteMoves, blackMoves };
}

const solvers = {};
const solver = (piece) => (solvers[piece] ??= makeSolver(piece));
module.exports = { solver };
