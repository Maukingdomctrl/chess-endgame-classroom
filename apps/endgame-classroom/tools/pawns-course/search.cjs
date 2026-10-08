// Finds the teaching positions of the two-connected-pawns course (K+P+P vs K): its lesson groups. The
// machinery is the pawn toolkit (../course-kit/pawn/): candidates, lines with best play, sampling, ranking
// and the variety rules (see its README).
const fs = require('fs');
const path = require('path');
const { createPlayer } = require('../course-kit/pawn/player.cjs');
const { enumerate, firstMove: first } = require('../course-kit/pawn/enumerate.cjs');
const { pickLines, alternateMirror } = require('../course-kit/pawn/select.cjs');
const { connected, kingToPawns, sideBySide, blocks, kingNear, kingAway } = require('../course-kit/pawn/geometry.cjs');
const VERIFY = require('./verify-opts.cjs');

const player = createPlayer({ verify: VERIFY });
// every White-to-move win with two connected pawns and a single fastest first move
const cands = enumerate(player, 'KPPK', { maxV: 25, accept: connected });
const firstMove = (c) => first(player, c);

// ---------- lesson groups ----------
// v = [min, max] plies to the promotion; count = lines; scarce groups pick first
const GROUPS = [];
const G = (o) => GROUPS.push({ count: 1, ...o });
const pd = kingToPawns, side = sideBySide, inFront = blocks;
const whiteK = (L) => L.plies.filter((p) => p.side === 'w' && p.piece === 0);
const captured = (L) => L.plies.some((p) => p.capture);
const queen = (L) => L.promo === 'q';
// the white king takes no part: it controls no square on the pawns' way to the 8th rank, all line long
const alone = (L) => L.plies.every((p) => p.side === 'b' || kingAway(p.before));
// 1. Promote safely: short finishes; for the one-movers, the other pawn's queen would be lost or stalemate
const otherFails = (c) => player.tab(c.sqs).options(player.view(c.sqs), 0).some((o) => o.promo === 'q' && o.v <= 0 && o.piece !== firstMove(c).piece);
G({ lesson: 'finish', id: 'fin-1', v: [1, 1], count: 3, scarce: 2, pre: (c) => firstMove(c)?.promo === 'q' && otherFails(c), post: (L) => !captured(L) && queen(L) });
G({ lesson: 'finish', id: 'fin-2', v: [3, 3], count: 3, scarce: 2, post: (L) => !captured(L) && queen(L) });
G({ lesson: 'finish', id: 'fin-3', v: [5, 5], count: 2, scarce: 2, post: (L) => !captured(L) && queen(L) });
// The solver finds no line where the pawns promote on their own against a king standing in front of them:
// then they need their king (lessons 4 and 5). In lessons 2 and 3 the black king stands next to them.
const near = kingNear;
// 2. Side by side: the pawns run on their own, the white king far away (two and three moves to the queen)
const sideRun = { lesson: 'side', scarce: 2, minScore: 0.75,
  pre: (c) => side(c.sqs) && pd(c.sqs) >= 3 && near(c.sqs, 3) && !inFront(c.sqs) && c.first.piece !== 0,
  post: (L) => !captured(L) && !whiteK(L).length && alone(L) && queen(L) };
G({ ...sideRun, id: 'side-2', v: [3, 3], count: 4 });
G({ ...sideRun, id: 'side-3', v: [5, 5], count: 4 });
// 3. If the king takes one, the other runs (the white king far away all line long)
G({ lesson: 'grab', id: 'grab', v: [3, 9], count: 8, scarce: 2, minScore: 0.6,
  pre: (c) => pd(c.sqs) >= 3 && near(c.sqs) && c.first.piece !== 0,
  post: (L) => captured(L) && !whiteK(L).length && alone(L) && queen(L) });
// 4. The chain protects itself: the white king walks over while the pawns hold
G({ lesson: 'chain', id: 'chain', v: [7, 25], count: 8, scarce: 2, minScore: 0.5,
  pre: (c) => !side(c.sqs) && pd(c.sqs) >= 3 && inFront(c.sqs) && c.first.piece === 0,
  post: (L) => !captured(L) && L.plies.filter((p) => p.side === 'w').slice(0, 2).every((p) => p.piece === 0) && queen(L) });
// 5. Escort them with your king
G({ lesson: 'escort', id: 'escort', v: [9, 25], count: 10, scarce: 1, minScore: 0.5,
  pre: (c) => pd(c.sqs) <= 1 && inFront(c.sqs), post: (L) => !captured(L) && whiteK(L).length >= 2 && queen(L) });
// 6. Don't stalemate: a stalemate trap on the first move, and once a rook instead of a queen
G({ lesson: 'stalemate', id: 'stalemate', v: [3, 9], count: 5, scarce: 3, pre: (c) => (c.traps ??= player.stalemates(c.sqs)).length > 0, post: (L) => !captured(L) && queen(L) });
G({ lesson: 'stalemate', id: 'st-rook', v: [1, 1], count: 1, scarce: 3, pre: (c) => firstMove(c)?.promo === 'r', post: (L) => L.promo === 'r' });
// 7. Final exam (no marks)
G({ lesson: 'exam', id: 'ex-far', v: [11, 25], count: 3, minScore: 0.5, pre: (c) => pd(c.sqs) >= 3 && inFront(c.sqs), post: (L) => !captured(L) && queen(L) });
G({ lesson: 'exam', id: 'ex-esc', v: [11, 25], count: 3, minScore: 0.5, pre: (c) => pd(c.sqs) <= 2 && inFront(c.sqs), post: (L) => !captured(L) && queen(L) });
G({ lesson: 'exam', id: 'ex-grab', v: [9, 21], count: 2, minScore: 0.5, pre: (c) => pd(c.sqs) >= 2, post: (L) => captured(L) && queen(L) });
// 8. Extra practice
G({ lesson: 'practice', id: 'pr-near', v: [5, 21], count: 12, minScore: 0.5, pre: (c) => pd(c.sqs) <= 2, post: queen });
G({ lesson: 'practice', id: 'pr-far', v: [5, 21], count: 12, minScore: 0.5, pre: (c) => pd(c.sqs) >= 3, post: queen });

// ---------- search ----------
const lines = new Map();
const lineOf = (c) => { if (!lines.has(c.i)) lines.set(c.i, player.playLine(c.sqs)); return lines.get(c.i); };
// big groups: an even sample of at most 3000 positions is played out (enough to choose from, and quick)
const picked = alternateMirror(pickLines(GROUPS, cands, { lineOf, firstMove, sample: 3000 }));
fs.mkdirSync(path.join(__dirname, '.out'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '.out/picked.json'), JSON.stringify(picked, (k, v) => (k === 'x' ? undefined : v))); // x: search-only data
console.log('total', picked.length);
