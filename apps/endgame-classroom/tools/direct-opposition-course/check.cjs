// The independent check of the written course, by another path than the one that made it: chess.js for the
// moves and the rules, the separate pawn solver (../course-kit/pawn/oracle.cjs) for every claim; it never
// calls solver.cjs, verify.cjs, line.cjs or the teaching layer.
//
// - Winning lines (White's pawn): the pawn checker (../course-kit/pawn/checker.cjs): every learner move a
//   fastest way to a safe promotion, [%also] exactly the equally fast moves, every opponent move a longest
//   defence, the line ends in a safe queen or rook, no arrow on the move to play. A line where Black moves
//   first is checked from the position after that move, and that move as the longest defence.
// - Defending lines (Black's pawn): on the board turned round (Black's pawn becomes White's), every learner
//   move keeps the draw, [%also] is exactly the other moves that keep it, the start is a draw, and the line
//   ends in a draw on the board (the pawn taken, stalemate or repetition).
// - The course: 100 lines in the blueprint's eight lessons; the task of every line read again from the board
//   and the moves (the blueprint's counts per task, 12 defending lines among them); no marks in the
//   lessons without help; a variety report.
const fs = require('fs');
const path = require('path');
const { Chess } = require('chess.js');
const { readPgn } = require('../course-kit/pgn.cjs');
const oracle = require('../course-kit/pawn/oracle.cjs');
const { checkGames, blackValue, squaresOf } = require('../course-kit/pawn/checker.cjs');
const { SLOTS, PHASES } = require('../course-kit/curricula/opposition/direct-opposition.cjs');
const { F, R, squares, canonical, lineShape } = require('./keys.cjs');

const FILE = path.join(__dirname, '../../courses/direct-opposition-course.pgn');
const text = fs.readFileSync(FILE, 'utf8');
const games = readPgn(text);
const texts = text.split(/\n\n(?=\[Event )/);
const problems = [];
const fail = (name, msg) => problems.push(`${name}: ${msg}`);

// ---------- the board turned round: Black's pawn becomes White's, moving up ----------
function turnRound(fen) {
  const [b, stm] = fen.split(' ');
  const rows = b.split('/').reverse().map((r) => r.replace(/[a-zA-Z]/g, (c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())));
  return `${rows.join('/')} ${stm === 'w' ? 'b' : 'w'} - - 0 1`;
}
/** After a move of the defender (White, against Black's pawn), Black to move: can Black still win? (oracle) */
function blackWins(fen) {
  const g = new Chess(fen);
  if (g.isStalemate() || g.isInsufficientMaterial()) return false;
  const s = squaresOf(turnRound(fen)); // in the turned position the pawn's side is White, to move
  return !!s && s.length === 3 && oracle.value(s, 0) >= 0;
}
const direct = (fen) => { const s = squares(fen); return (F(s.wk) === F(s.bk) && Math.abs(R(s.wk) - R(s.bk)) === 2) || (R(s.wk) === R(s.bk) && Math.abs(F(s.wk) - F(s.bk)) === 2); };
const after = (fen, san) => { const g = new Chess(fen); g.move(san); return g.fen(); };

// ---------- every game read by chess.js gives the course reader's moves ----------
games.forEach((gm, i) => {
  const c = new Chess();
  try { c.loadPgn(texts[i]); } catch (e) { fail(gm.tags.LineName, `chess.js cannot read the game: ${e.message}`); return; }
  if (c.history().join(' ') !== gm.moves.map((m) => m.san).join(' ')) fail(gm.tags.LineName, 'chess.js reads other moves');
});

// ---------- winning lines: the pawn checker; Black's first move checked here ----------
const winning = [];
const tasks = [];
games.forEach((gm, i) => {
  const name = gm.tags.LineName, fen = gm.tags.FEN;
  const s = squares(fen);
  if (s.pc === 'b') { tasks.push(null); return; } // defending, below
  if (s.stm === 'b') {
    const first = gm.moves[0];
    const g = new Chess(fen);
    const vals = g.moves().map((san) => ({ san, v: blackValue(fen, san) }));
    if (vals.some((x) => x.v === Infinity)) fail(name, `Black can escape at the start (${vals.filter((x) => x.v === Infinity).map((x) => x.san).join(',')})`);
    if (vals.find((x) => x.san === first.san)?.v !== Math.max(...vals.map((x) => x.v))) fail(name, `Black's first move ${first.san} is not a longest defence`);
    if (!direct(fen)) fail(name, 'Black moves first, but the kings do not face each other');
    winning.push({ tags: { ...gm.tags, FEN: after(fen, first.san) }, intro: first.comment, moves: gm.moves.slice(1) });
  } else winning.push({ ...gm, text: texts[i] });
  tasks.push(i);
});
const pawnCheck = checkGames(winning);
for (const p of pawnCheck.problems) problems.push(p);

// ---------- defending lines ----------
let holdMoves = 0;
games.forEach((gm) => {
  const name = gm.tags.LineName, fen = gm.tags.FEN;
  if (squares(fen).pc !== 'b') return;
  const g = new Chess(fen);
  if (g.turn() !== 'w') fail(name, 'a defending line where Black moves first');
  if (!g.moves().some((san) => !blackWins(after(fen, san)))) fail(name, 'the start is lost');
  const comments = [gm.intro, ...gm.moves.map((m) => m.comment)];
  gm.moves.forEach((m, i) => {
    const before = g.fen();
    if (!g.moves().includes(m.san)) { fail(name, `illegal move ${m.san} in ${before}`); return; }
    if (g.turn() === 'w') {
      holdMoves++;
      const holding = g.moves().filter((san) => !blackWins(after(before, san)));
      if (!holding.includes(m.san)) fail(name, `${m.san} lets Black win in ${before}`);
      const want = holding.filter((x) => x !== m.san).sort().join(), got = [...m.also].sort().join();
      if (want !== got) fail(name, `[%also] for ${m.san} is ${got || 'empty'}, the other holding moves are ${want || 'none'}`);
      const mv = new Chess(before).move(m.san);
      for (const [, args] of (comments[i] ?? '').matchAll(/\[%cal ([^\]]*)\]/g)) for (const a of args.split(',')) if (a.slice(1) === `${mv.from}${mv.to}`) fail(name, `the arrow ${a} lies on the move to play`);
    } else if (m.also.length) fail(name, '[%also] on a move of the opponent');
    g.move(m.san);
  });
  if (!(g.isStalemate() || g.isInsufficientMaterial() || g.isThreefoldRepetition())) fail(name, `does not end in a draw on the board: ${g.fen()}`);
});

// ---------- the course ----------
if (games.length !== SLOTS.length) problems.push(`expected ${SLOTS.length} lines, found ${games.length}`);
// lessons: the blueprint's phases, in order, with their sizes
const lessonOf = (name) => +name.slice(0, 2);
PHASES.forEach((p, k) => {
  const own = games.filter((gm) => lessonOf(gm.tags.LineName) === k + 1);
  if (own.length !== p.to - p.from + 1) problems.push(`lesson ${k + 1} has ${own.length} lines, the blueprint's ${p.name} ${p.to - p.from + 1}`);
  own.forEach((gm, j) => { if (!gm.tags.LineName.endsWith(`(${j + 1}/${own.length})`)) problems.push(`${gm.tags.LineName}: numbered out of order`); });
});
games.forEach((gm, i) => { if (lessonOf(gm.tags.LineName) !== PHASES.findIndex((p) => i + 1 >= p.from && i + 1 <= p.to) + 1) problems.push(`${gm.tags.LineName}: in the wrong lesson for slot ${i + 1}`); });
// the task of every line, read from the board and the moves alone
function taskOf(gm) {
  const fen = gm.tags.FEN, s = squares(fen), m0 = gm.moves[0];
  if (s.pc === 'b') return direct(after(fen, m0.san)) ? 'defend' : null;
  if (s.stm === 'b') { const a = after(fen, m0.san), m1 = gm.moves[1]; return direct(fen) && direct(after(a, m1.san)) ? 'retake' : null; }
  const a = after(fen, m0.san), t = squares(a);
  if (m0.san[0] !== 'K') return 'push';
  const guarded = (k) => Math.max(Math.abs(F(k) - F(s.p)), Math.abs(R(k) - R(s.p))) === 1;
  if (direct(a)) return m0.also.length ? 'either' : 'take';
  if (!guarded(s.wk) && guarded(t.wk)) return 'protect';
  return null;
}
const counts = {}, want = {};
games.forEach((gm, i) => {
  const t = taskOf(gm), slot = SLOTS[i];
  counts[t] = (counts[t] ?? 0) + 1;
  if (slot && t !== slot.task) fail(gm.tags.LineName, `the board shows the task ${t}, slot ${slot.n} asks for ${slot.task}`);
  if (slot?.help === 0 && [gm.intro, ...gm.moves.map((m) => m.comment)].some((c) => /\[%c(sl|al) /.test(c))) fail(gm.tags.LineName, 'marks in a line without help');
  if (slot?.feedback === 'closing' && gm.moves.slice(0, -1).some((m) => m.comment.replace(/\[%[^\]]*\]/g, '').trim())) fail(gm.tags.LineName, 'notes during an assessment line');
});
for (const s of SLOTS) want[s.task] = (want[s.task] ?? 0) + 1;
for (const t of Object.keys(want)) if (counts[t] !== want[t]) problems.push(`task ${t}: ${counts[t] ?? 0} lines, the blueprint ${want[t]}`);
// variety: every line's positions, its head (start to the position after the learner's first move) and opening
for (const [i, gm] of games.entries()) {
  const g = new Chess(gm.tags.FEN), keys = [canonical(gm.tags.FEN)];
  for (const m of gm.moves) { g.move(m.san); keys.push(canonical(g.fen())); }
  const learnerFirst = squares(gm.tags.FEN).stm === 'b' ? 2 : 1;
  Object.assign(gm, { keys: new Set(keys), head: keys.slice(0, learnerFirst + 1), opening: new Set(keys.slice(0, 5)), task: SLOTS[i]?.task,
    shape: lineShape(gm.tags.FEN, gm.moves.map((m) => m.san)) });
}
const startOf = new Map(), shapeOf = new Map(), firstOf = new Map();
for (const gm of games) {
  const name = gm.tags.LineName, start = gm.head[0], first = gm.head[gm.head.length - 1];
  if (startOf.has(start)) fail(name, `the same start as ${startOf.get(start)}`); else startOf.set(start, name);
  if (firstOf.has(first)) fail(name, `the same position after the first move as ${firstOf.get(first)}`); else firstOf.set(first, name);
  if (shapeOf.has(gm.shape) && gm.task !== 'protect') fail(name, `the same line, shifted along the board, as ${shapeOf.get(gm.shape)}`);
  if (!shapeOf.has(gm.shape)) shapeOf.set(gm.shape, name);
}
for (const a of games) for (const b of games) {
  if (a === b || a.task !== b.task) continue;
  if (a.head.some((q) => b.opening.has(q))) fail(a.tags.LineName, `starts in or joins the first two moves of ${b.tags.LineName}`);
}
let shared = 0, total = 0;
const seenIn = new Map();
for (const gm of games) for (const k of gm.keys) seenIn.set(k, (seenIn.get(k) ?? 0) + 1);
for (const gm of games) { total += gm.keys.size; shared += [...gm.keys].filter((k) => seenIn.get(k) > 1).length; }
const inside = games.filter((gm) => seenIn.get(gm.head[0]) > 1).map((gm) => gm.tags.LineName);

// ---------- report ----------
const tally = (f) => { const o = {}; for (const gm of games) { const k = f(gm); o[k] = (o[k] ?? 0) + 1; } return Object.entries(o).sort().map(([k, v]) => `${k} ${v}`).join(', '); };
console.log(`check: tasks ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')} (blueprint: ${Object.entries(want).map(([k, v]) => `${k} ${v}`).join(', ')})`);
console.log(`check: pawn files ${tally((gm) => squares(gm.tags.FEN).p >= 0 ? 'abcdefgh'[F(squares(gm.tags.FEN).p)] : '-')}; side to move ${tally((gm) => gm.tags.FEN.split(' ')[1])}`);
console.log(`check: pawn ranks (from its own side) ${tally((gm) => { const s = squares(gm.tags.FEN); return s.pc === 'w' ? R(s.p) + 1 : 8 - R(s.p); })}`);
console.log(`check: ${pawnCheck.stats.learnerMoves} learner moves in winning lines (${pawnCheck.stats.unique} unique, ${pawnCheck.stats.pct}%), ${holdMoves} in defending lines; positions inside lines also seen in another line: ${Math.round((100 * shared) / total)}%; ` +
  `starts that another line (of another task) passes: ${inside.length}${inside.length ? ` (${inside.join('; ')})` : ''}`);
for (const p of problems) console.log('PROBLEM', p);
console.log(`independent check of ${path.relative(process.cwd(), FILE)}: ${games.length} lines; problems: ${problems.length}`);
if (problems.length) {
  console.error(`check: ${problems.length} problem(s) in the written course`);
  process.exit(1);
}
