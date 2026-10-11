// Keys this course compares positions by (King & Pawn: two kings and one pawn, either colour), mirror images
// (files a <-> h) alike. Read from the FEN's board alone, so the generator and the independent check use the
// same definitions.
//
//   canonical(fen)  the exact position and the side to move (direct-opposition.cjs canonical)
//   lineShape(fen, sans)  the start seen from the pawn (its rank, both kings' offsets from it, the side to
//                   move) and every move as a step (piece, files, ranks): two lines with the same shape are
//                   the same line shifted along the board, one lesson.
//   pattern(fen)    a coarse picture: each king ahead of / level with / behind the pawn, on its file,
//                   beside it or away, and the side to move. Two lines in a row with the same pattern
//                   read as a repetition (the progression's variety key).
const { Chess } = require('chess.js');
const { canonical } = require('../course-kit/curricula/opposition/direct-opposition.cjs');

const F = (q) => q & 7, R = (q) => q >> 3;

/** { wk, bk, p (-1 without a pawn), pc ('w' | 'b'), stm } of a FEN with two kings and at most one pawn. */
function squares(fen) {
  const [board, stm] = fen.split(' ');
  const s = { wk: -1, bk: -1, p: -1, pc: null, stm };
  let r = 7, f = 0;
  for (const ch of board) {
    if (ch === '/') { r--; f = 0; continue; }
    if (/\d/.test(ch)) { f += +ch; continue; }
    const q = r * 8 + f;
    if (ch === 'K') s.wk = q; else if (ch === 'k') s.bk = q;
    else if (ch === 'P' || ch === 'p') { s.p = q; s.pc = ch === 'P' ? 'w' : 'b'; } else throw new Error(`not a King & Pawn position: ${fen}`);
    f++;
  }
  return s;
}

function lineShape(fen, sans) {
  const g = new Chess(fen);
  const steps = sans.map((san) => { const m = g.move(san); const a = sqIdx(m.from), b = sqIdx(m.to); return [m.piece, F(b) - F(a), R(b) - R(a), m.promotion ?? '']; });
  const s = squares(fen);
  const form = (k) => [s.pc, R(s.p), s.stm, k * (F(s.wk) - F(s.p)), R(s.wk) - R(s.p), k * (F(s.bk) - F(s.p)), R(s.bk) - R(s.p), ...steps.map(([p, df, dr, q]) => `${p}${k * df}:${dr}${q}`)].join(',');
  return [form(1), form(-1)].sort()[0];
}
const sqIdx = (n) => (n.charCodeAt(1) - 49) * 8 + (n.charCodeAt(0) - 97);

function pattern(fen) {
  const s = squares(fen);
  const up = s.pc === 'w' ? 1 : -1;
  const zone = (k) => {
    const dr = up * (R(k) - R(s.p)), df = Math.abs(F(k) - F(s.p));
    return `${dr > 0 ? 'ahead' : dr === 0 ? 'level' : 'behind'}-${['file', 'beside', 'away'][Math.min(df, 2)]}`;
  };
  return `${zone(s.wk)}/${zone(s.bk)}/${s.stm}`;
}

/** The pawn's square with the mirror image on files a-d (b-d in this course): which pawn a line uses. */
const pawnKey = (fen) => { const s = squares(fen); const f = F(s.p); return `${s.pc}${'abcdefgh'[Math.min(f, 7 - f)]}${R(s.p) + 1}`; };

/** The board mirrored (files a <-> h); side to move and the rest unchanged. */
const mirrorFen = (fen) => { const [b, ...rest] = fen.split(' '); return [b.split('/').map((r) => [...r].reverse().join('')).join('/'), ...rest].join(' '); };
const mirrorSquare = (s) => 'abcdefgh'[7 - (s.charCodeAt(0) - 97)] + s[1];

module.exports = { F, R, sqIdx, squares, canonical, lineShape, pattern, pawnKey, mirrorFen, mirrorSquare };
