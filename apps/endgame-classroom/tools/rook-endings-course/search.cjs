// Finds the course's positions and plays their lines (the learner is White in every line). Three groups:
//   lucena    K+R+P vs K+R: the pawn on the 7th with its king in front of it, the black king two files or more
//             away on the 6th-8th rank. The line puts the rook on the 4th rank (not behind the pawn), walks the king
//             out and queens, with the rook on the 4th rank shielding the king on its file when the pawn queens: the
//             bridge. (The solver's fastest lines show it in three patterns; see the README.)
//   skewer    the rook in front of its a-pawn on the 7th, the black rook behind the pawn, the black king on the
//             6th-8th rank. The first move takes the rook off the queening square along the 8th rank (no check), and
//             the line wins the black rook with a skewer: a rook check with the black king between it and its rook.
//   philidor  K+R vs K+R+P, White defends: the black pawn has just reached White's 3rd rank with its king beside
//             it, White's king in front of the pawn and the rook on the 3rd rank. Every move that holds sends the
//             rook along its file at least two ranks beyond the black king, to check from behind; the line holds
//             the draw until White takes the pawn: at most 17 plies, a check from behind on the way, no move with
//             more than 9 equal moves (a defence has many: a draw is a draw).
// The criteria only say where to look and what a line must show; the solver decides every move (line.cjs: the
// learner a fastest win or a move that holds, the opponent the most stubborn defence). The tables store the pawn
// on files a-d (build.cjs mirrors every other line to the other wing). A win's first move is the only fastest one,
// of the lesson's kind (read from the table's values first, which is cheap, then by the course's measure).
// Ranking: the share of unique learner moves, then the line's length, then the FEN (stable). Variety: no two
// lines share a position or play the same moves; a group's lines are spread over its patterns (at most its share
// of each while others are left) and listed in turn by pattern, so each lesson gets different ones.
// Writes .out/picked.json: [{ group, pattern, fen, moves: [{ san, also }] }].
'use strict';
const fs = require('fs');
const path = require('path');
const { Chess } = require('chess.js');
const solver = require('../course-kit/solver.cjs');
const { scan, analyse, fenOf } = require('../course-kit/egtb/positions.cjs');
const { playLine } = require('../course-kit/line.cjs');
const { fastestMoves } = require('../course-kit/verify.cjs');
const { file, rank, sqIdx } = require('../course-kit/board.cjs');
const domain = require('../course-kit/rook/domain.cjs');
const VERIFY = require('./verify-opts.cjs');

const OUT = path.join(__dirname, '.out');
const t0 = Date.now();
const promoOrder = (m) => ({ q: 0, r: 1, b: 2, n: 3 })[m.promotion] ?? 4;
const positionKey = (fen) => fen.split(' ').slice(0, 2).join(' ');
/** Where the black king stands from the pawn: 'left', 'right' or 'file' (on the pawn's file). */
const sideOf = (pawnFile, kingFile) => (kingFile < pawnFile ? 'left' : kingFile > pawnFile ? 'right' : 'file');

/** What a played line shows, read on the board: the learner's moves, and the picture before the last move. */
function features(fen, l, pawnFile) {
  const g = new Chess(fen);
  const f = { bridge: false, walk: false, skewer: false, quietFirst: false, shield: false, checks: 0, maxAlso: 0, plies: l.plies.length, last: null };
  l.plies.forEach((p, i) => {
    const mv = g.move(p.san);
    // the picture when the pawn is about to queen: after the opponent's last move
    if (i === l.plies.length - 2) f.shield = domain.facts(g.fen()).some((x) => x.id === 'shield' && x.side === 'w');
    if (!p.learner) return;
    const from = sqIdx(mv.from), to = sqIdx(mv.to);
    if (mv.piece === 'r' && mv.san.includes('+')) f.checks++;
    f.maxAlso = Math.max(f.maxAlso, p.also.length);
    if (mv.piece === 'r' && rank(to) === 3 && file(to) !== pawnFile) f.bridge = true; // White's rook on the 4th rank
    if (mv.piece === 'k' && rank(from) === 7 && rank(to) < 7) f.walk = true; // the king steps out in front of the pawn
    if (mv.piece === 'r' && mv.san.includes('+') && domain.facts(g.fen()).some((x) => x.id === 'skewer')) f.skewer = true;
    if (i === 0 && mv.piece === 'r' && !/[+#x]/.test(mv.san) && rank(from) === 7 && rank(to) === 7) f.quietFirst = true;
  });
  const last = l.plies[l.plies.length - 1];
  f.last = last?.learner ? last.move : null;
  return f;
}

// pieces: KRPKR = [wK, bK, wR, wP, bR]; KRKRP (White defends, the colour-swapped view) = [wK, bK, wR, bR, bP]
const GROUPS = [
  {
    id: 'lucena', count: 9, material: 'KRPKR', goal: 'conversion', result: 'win', plies: [7, 41], pawn: 3,
    pre: (s) => rank(s[3]) === 6 && file(s[3]) >= 1 && s[0] === s[3] + 8 && Math.abs(file(s[1]) - file(s[3])) >= 2 && rank(s[1]) >= 5,
    // the first move puts the rook on the 4th rank (piece 2: White's rook), not behind the pawn
    firstMove: (o, s) => o.piece === 2 && rank(o.to) === 3 && file(o.to) !== file(s[3]),
    keep: (f) => f.bridge && f.walk && f.shield && f.last?.promotion === 'q',
    // the pawn's file and the side the black king is cut off on; the classic one (a d-pawn, the black king on the
    // kingside) first
    pattern: (s) => `${'abcdefgh'[file(s[3])]}-${sideOf(file(s[3]), file(s[1]))}`,
    patternOrder: ['d-right', 'b-right', 'c-right', 'd-left'],
  },
  {
    id: 'skewer', count: 6, material: 'KRPKR', goal: 'conversion', result: 'win', plies: [3, 41], pawn: 3,
    pre: (s) => s[3] === 48 && s[2] === 56 && file(s[4]) === 0 && rank(s[4]) < 6 && rank(s[1]) >= 5,
    firstMove: (o) => o.piece === 2 && rank(o.to) === 7 && !o.capture,
    keep: (f) => f.quietFirst && f.skewer && f.last?.captured === 'r',
    // where the black king stands, and whether Black checks before taking the pawn (a longer line); the shortest
    // first (the trap at once), then the longer ones
    pattern: (s, l) => `k${'abcdefgh'[file(s[1])]}${rank(s[1]) + 1}-${l.plies.length <= 5 ? 'short' : 'long'}`,
    patternOrder: ['kf7-short', 'kd7-long', 'ke7-long', 'kf7-long', 'kd7-short', 'ke7-short'],
  },
  {
    id: 'philidor', count: 6, material: 'KRKRP', goal: 'mate', result: 'draw', pawn: 4,
    pre: (s) => rank(s[4]) === 2 && file(s[4]) >= 2 && file(s[4]) <= 3 && rank(s[1]) === 3 && Math.abs(file(s[1]) - file(s[4])) <= 1 &&
      rank(s[0]) === 0 && Math.abs(file(s[0]) - file(s[4])) <= 1 && rank(s[2]) === 2,
    // every move that holds is the rook going along its file, two ranks or more beyond the black king
    first: (sqs, keep) => keep.length > 0 && keep.every((m) => m.piece === 'r' && file(m.from) === file(m.to) && rank(m.to) - rank(sqs[1]) >= 2),
    keep: (f) => f.last?.captured === 'p' && f.plies <= 17 && f.checks >= 1 && f.maxAlso <= 9,
    maxPlies: 17,
    // among the moves that hold: a rook check first (check from behind), then the rook as far away as it goes
    learnerOrder: (a, b) => (b.piece === 'r' && b.san.includes('+') ? 1 : 0) - (a.piece === 'r' && a.san.includes('+') ? 1 : 0) ||
      (a.piece === 'r' && b.piece === 'r' ? rank(sqIdx(b.to)) - rank(sqIdx(a.to)) : 0),
    pattern: (s) => `${'abcdefgh'[file(s[4])]}-${sideOf(file(s[4]), file(s[1]))}`,
  },
];

const picked = [];
for (const G of GROUPS) {
  const T = solver.table(G.material, { goal: G.goal });
  const lines = [];
  let candidates = 0, first = 0;
  for (const c of scan(T, { stm: 0, result: G.result, plies: G.plies, pre: G.pre })) {
    candidates++;
    if (G.result === 'win') {
      const wins = T.options(c.sqs, 0).filter((o) => o.v > 0), fast = Math.min(...wins.map((o) => o.v));
      const best = wins.filter((o) => o.v === fast);
      if (best.length !== 1 || !G.firstMove(best[0], c.sqs)) continue;
      if (fastestMoves(fenOf(T, c.sqs, 0), VERIFY).length !== 1) continue;
    } else if (!G.first(c.sqs, analyse(T, c.sqs, 0).keep)) continue;
    const fen = fenOf(T, c.sqs, 0);
    first++;
    const l = playLine(fen, {
      goal: VERIFY.goal, objective: G.result === 'draw' ? 'hold' : undefined, learnerOrder: G.learnerOrder, maxPlies: G.maxPlies,
      // the opponent's equal choices: a queen before a rook, a bishop or a knight
      opponentOrder: (a, b) => promoOrder(a) - promoOrder(b),
    });
    if (G.maxPlies && l.end === 'error: no draw on the board within maxPlies') continue; // longer than a lesson line
    if (l.end.startsWith('error') || l.end === 'max') throw new Error(`${G.id}: ${fen}: ${l.end}`);
    if (!G.keep(features(fen, l, file(c.sqs[G.pawn])))) continue;
    const learner = l.plies.filter((p) => p.learner);
    lines.push({
      group: G.id, pattern: G.pattern(c.sqs, l), fen, plies: l.plies.length, unique: learner.filter((p) => p.unique).length / learner.length,
      positions: new Set(l.plies.map((p) => positionKey(p.fen))),
      moves: l.plies.map((p) => ({ san: p.san, also: p.learner ? p.also : [] })),
    });
  }
  // the clearest lines first: most unique learner moves, then shorter, then the FEN
  lines.sort((a, b) => b.unique - a.unique || a.plies - b.plies || (a.fen < b.fen ? -1 : 1));
  const patterns = [...new Set(lines.map((l) => l.pattern))];
  const share = Math.ceil(G.count / Math.max(1, patterns.length));
  const chosen = [];
  const sans = (l) => l.moves.map((m) => m.san).join(' ');
  const fits = (l) => !chosen.some((x) => sans(x) === sans(l) || [...l.positions].some((k) => x.positions.has(k)));
  // first at most each pattern's share, then whatever fits
  for (const capped of [true, false]) {
    for (const l of lines) {
      if (chosen.length >= G.count) break;
      if (chosen.includes(l) || !fits(l)) continue;
      if (capped && chosen.filter((x) => x.pattern === l.pattern).length >= share) continue;
      chosen.push(l);
    }
  }
  if (chosen.length < G.count) throw new Error(`${G.id}: only ${chosen.length} of ${G.count} lines (${lines.length} show the idea)`);
  // in turn by pattern (each in its ranking order), so the lessons that take them in order get different ones
  const rankOf = (p) => { const i = (G.patternOrder ?? []).indexOf(p); return i < 0 ? Infinity : i; };
  const order = patterns.filter((p) => chosen.some((l) => l.pattern === p)).sort((a, b) => rankOf(a) - rankOf(b));
  const turns = [];
  for (let k = 0; turns.length < chosen.length; k++) for (const p of order) { const l = chosen.filter((x) => x.pattern === p)[k]; if (l) turns.push(l); }
  console.log(`search ${G.id}: ${candidates} candidates, ${first} with the lesson's first move, ${lines.length} lines show the idea ` +
    `(${patterns.length} pattern${patterns.length === 1 ? '' : 's'}); picked ${turns.map((l) => `${l.pattern} ${l.plies}p`).join(', ')}`);
  picked.push(...turns.map(({ group, pattern, fen, moves }) => ({ group, pattern, fen, moves })));
}
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'picked.json'), JSON.stringify(picked, null, 1));
console.log(`search: ${picked.length} lines in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
