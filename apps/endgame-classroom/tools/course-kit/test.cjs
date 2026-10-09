// Tests of the shared line player and verifier (npm run kit:test): the draw-holding objective of
// line.cjs and verify.cjs on real King & Pawn positions, with every "holds" and "loses" checked against the
// independent oracle (pawn/oracle.cjs, no code shared with the solver), and the winning objective unchanged.
// Fails loudly (exit code 1).
const { Chess } = require('chess.js');
const solver = require('./solver.cjs');
const oracle = require('./pawn/oracle.cjs');
const { playLine } = require('./line.cjs');
const { verifyLine, holdingMoves, fastestMoves } = require('./verify.cjs');
const { createExplainer } = require('./teach/explain.cjs');
const domain = require('./pawn/domain.cjs');

let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failures++; };
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const V = { goal: 'promotion', probe: solver.probe }; // the King & Pawn measure (plies to a safe promotion)
const HOLD = { ...V, objective: 'hold' };
const after = (fen, ...sans) => { const g = new Chess(fen); for (const s of sans) g.move(s); return g.fen(); };
// the oracle covers White's pawns; Black's pawns on the board turned round (written again here)
const turnRound = (fen) => { const [b, stm] = fen.split(' '); return `${b.split('/').reverse().map((r) => [...r].map((c) => (/[a-z]/.test(c) ? c.toUpperCase() : c.toLowerCase())).join('')).join('/')} ${stm === 'w' ? 'b' : 'w'} - - 0 1`; };
/** White's result in fen by the oracle: 'win' | 'draw' | 'loss'. */
function white(fen) {
  const g = new Chess(fen);
  if (g.isStalemate() || g.isInsufficientMaterial()) return 'draw';
  const r = oracle.probe(/p/.test(fen.split(' ')[0]) ? turnRound(fen) : fen).result;
  return r === 'draw' ? 'draw' : (r === 'win') === (g.turn() === 'w') ? 'win' : 'loss';
}
const lineOf = (fen, opts) => { const l = playLine(fen, opts); return { line: { fen, moves: l.plies.map((p) => ({ san: p.san, also: p.also ?? [] })) }, played: l }; };

// ---- one drawing move ----
const ONE = '8/8/3p4/8/8/1k6/3K4/8 w - - 0 1'; // Black's d-pawn: only Kd3 holds
{
  check(same(holdingMoves(ONE, V), ['Kd3']), 'one drawing move: only Kd3 holds');
  const all = new Chess(ONE).moves();
  check(all.every((m) => (white(after(ONE, m)) === 'draw') === (m === 'Kd3')), `one drawing move: the oracle agrees on all ${all.length} moves (Kd3 draws, the others lose)`);
  const { line, played } = lineOf(ONE, HOLD);
  check(played.end === 'draw' && line.moves[0].san === 'Kd3' && line.moves[0].also.length === 0, `one drawing move: the line plays Kd3 with no [%also] (${line.moves.map((m) => m.san).join(' ')})`);
  check(verifyLine(line, HOLD).problems.length === 0, 'one drawing move: the line passes verify.cjs (objective hold)');
  check(new Chess(after(ONE, ...line.moves.map((m) => m.san))).isInsufficientMaterial(), 'one drawing move: the line ends in a draw on the board (the pawn taken)');
}

// ---- several equally valid drawing moves ----
const TWO = '8/3k4/8/3p4/8/8/8/K7 w - - 0 1'; // Kb2 and Kb1 both reach the pawn in time; Ka2 does not
{
  check(same(holdingMoves(TWO, V), ['Kb1', 'Kb2']) && ['Kb1', 'Kb2'].every((m) => white(after(TWO, m)) === 'draw'), 'several drawing moves: Kb1 and Kb2 hold (oracle)');
  const { line, played } = lineOf(TWO, HOLD);
  const first = line.moves[0];
  check(played.end === 'draw' && same([first.san, ...first.also], ['Kb1', 'Kb2']), `several drawing moves: the line plays ${first.san} with [%also] ${first.also.join(',')}: exactly the other one`);
  check(verifyLine(line, HOLD).problems.length === 0, 'several drawing moves: the line passes verify.cjs');
  check(same(createExplainer({ verify: V, domain }).acceptedMoves(TWO), holdingMoves(TWO, V)), 'several drawing moves: the explainer accepts exactly the same moves as the verifier');
}

// ---- a tempting move that loses instead of drawing ----
{
  check(domain.plausible(TWO).includes('Ka2') && white(after(TWO, 'Ka2')) === 'loss', 'tempting loss: Ka2 looks natural (a likely move) and loses (oracle)');
  const bad = { fen: TWO, moves: [{ san: 'Ka2', also: [] }] };
  check(verifyLine(bad, HOLD).problems.some((p) => /Ka2 does not hold the draw \(holding: Kb2,Kb1\)/.test(p)), 'tempting loss: verify.cjs rejects Ka2 and names the holding moves');
  check(domain.plausible(ONE).includes('Kd1') && white(after(ONE, 'Kd1')) === 'loss' && verifyLine({ fen: ONE, moves: [{ san: 'Kd1' }] }, HOLD).problems.some((p) => /Kd1 does not hold/.test(p)),
    'tempting loss: the natural retreat Kd1 (to the queening square) loses and is rejected');
}

// ---- incorrect [%also] entries ----
{
  const { line } = lineOf(TWO, HOLD);
  const wrong = (also) => verifyLine({ fen: line.fen, moves: [{ ...line.moves[0], also }, ...line.moves.slice(1)] }, HOLD).problems;
  const other = line.moves[0].also[0];
  check(wrong([other, 'Ka2']).some((p) => /\[%also\] Ka2 does not hold the draw/.test(p)), '[%also] with a losing move is rejected');
  check(wrong([]).some((p) => new RegExp(`\\[%also\\] for ${line.moves[0].san} misses ${other}`).test(p)), '[%also] missing a holding move is rejected');
  check(wrong([other]).length === 0, '[%also] exactly the other holding move passes');
  const opp = verifyLine({ fen: line.fen, moves: line.moves.map((m, i) => (i === 1 ? { ...m, also: ['Kd6'] } : m)) }, HOLD).problems;
  check(opp.some((p) => /\[%also\] on a move of the opponent/.test(p)), '[%also] on an opponent move is rejected');
}

// ---- a line that begins with the opponent's move ----
{
  const start = after(ONE, 'Kd3'); // Black to move, White holds
  const { line, played } = lineOf(start, { ...HOLD, learner: 'w' });
  check(played.end === 'draw' && played.plies[0].learner === false && white(start) === 'draw', `opponent first: the line starts with Black's ${line.moves[0].san}; the position is a draw (oracle)`);
  check(verifyLine(line, { ...HOLD, learner: 'w' }).problems.length === 0, 'opponent first: passes verify.cjs with the learner as White');
  check(verifyLine(line, HOLD).problems.length > 0, 'opponent first: without the learner option the side to move would be checked as the learner (and fails)');
  check(line.moves.every((m, i) => i % 2 === 1 || white(after(start, ...line.moves.slice(0, i + 1).map((x) => x.san))) === 'draw'), 'opponent first: no move of the opponent lets White win (oracle)');
}

// ---- the opponent's best play: it never lets the learner win ----
{
  const MZ = '8/8/4k3/8/4K3/4P3/8/8 w - - 0 1'; // White's pawn, White to move: only a draw (mutual zugzwang)
  check(white(MZ) === 'draw' && holdingMoves(MZ, V).length === new Chess(MZ).moves().length, 'opponent: White cannot win here and cannot lose (every move holds)');
  const blunder = new Chess(after(MZ, 'Kd4')).moves().find((m) => white(after(MZ, 'Kd4', m)) === 'win');
  const bad = { fen: MZ, moves: [{ san: 'Kd4', also: holdingMoves(MZ, V).filter((m) => m !== 'Kd4') }, { san: blunder }] };
  check(blunder && verifyLine(bad, HOLD).problems.some((p) => new RegExp(`${blunder.replace('+', '\\+')} lets the learner win`).test(p)), `opponent: a reply that lets White win (${blunder}) is not the opponent's best play`);
  const { line, played } = lineOf(MZ, HOLD);
  check(played.end === 'draw' && verifyLine(line, HOLD).problems.length === 0, `opponent: the played line keeps the draw to the end (${played.plies.length} plies)`);
}

// ---- where a holding line has to end ----
{
  const { line } = lineOf(ONE, HOLD);
  check(verifyLine({ ...line, moves: line.moves.slice(0, -1) }, HOLD).problems.some((p) => /does not end in a draw on the board/.test(p)), 'end: a line stopped before the draw on the board is rejected');
  check(verifyLine({ fen: after(ONE, 'Ke3'), moves: [] }, { ...HOLD, learner: 'w' }).problems.some((p) => /not a draw with best play/.test(p)), 'start: a lost position is not a holding line');
}

// ---- the objective chosen from the start ('auto'), and winning lines unchanged ----
{
  const WIN = '8/8/4k3/8/8/4K3/4P3/8 w - - 0 1';
  const win = lineOf(WIN, V);
  const hold = lineOf(ONE, HOLD);
  check(win.played.end === 'promotion' && verifyLine(win.line, V).problems.length === 0, 'win: the winning line is played and verified as before (default objective)');
  check(verifyLine(win.line, { ...V, objective: 'auto' }).problems.length === 0 && verifyLine(hold.line, { ...V, objective: 'auto' }).problems.length === 0, "auto: a winning line is checked as 'win', a drawn one as 'hold'");
  check(verifyLine(hold.line, V).problems.some((p) => /is not a fastest win/.test(p)), "win: a holding line still fails the default (winning) objective, as before");
  check(verifyLine({ fen: after(ONE, 'Ke3'), moves: [{ san: 'Kc4' }] }, { ...V, objective: 'auto', learner: 'w' }).problems.some((p) => /lost for the learner/.test(p)), 'auto: a lost start is a problem');
  check(same(fastestMoves(WIN, V), ['Ke4']) && JSON.stringify(playLine(WIN, V)) === JSON.stringify(win.played), 'win: fastest moves and the played line are unchanged and repeatable');
}

// ---- deterministic ----
{
  const runs = [ONE, TWO, after(ONE, 'Kd3')].map((f) => JSON.stringify(playLine(f, { ...HOLD, learner: 'w' })));
  const again = [ONE, TWO, after(ONE, 'Kd3')].map((f) => JSON.stringify(playLine(f, { ...HOLD, learner: 'w' })));
  check(runs.every((r, i) => r === again[i]), 'deterministic: the same holding lines twice');
  const { line } = lineOf(TWO, HOLD);
  check(JSON.stringify(verifyLine(line, HOLD)) === JSON.stringify(verifyLine(line, HOLD)), 'deterministic: the same verification twice');
}

// ---- the fifty-move rule (the tables ignore it; a line that runs into it is a problem) ----
{
  const opts = { goal: 'mate', probe: solver.probe };
  const moves = [{ san: 'Rc2' }, { san: 'Kb8' }];
  const near = verifyLine({ fen: 'k7/8/8/8/8/8/8/K1R5 w - - 98 50', moves }, opts).problems.filter((p) => /fifty-move rule/.test(p));
  const fresh = verifyLine({ fen: 'k7/8/8/8/8/8/8/K1R5 w - - 0 1', moves }, opts).problems.filter((p) => /fifty-move rule/.test(p));
  check(near.length === 1 && fresh.length === 0, 'fifty-move rule: 50 moves without a capture or a pawn move are reported (the halfmove clock counts), fewer are not');
}

console.log(failures ? `line and verifier tests: ${failures} FAILED` : 'line and verifier tests: all passed');
process.exit(failures ? 1 : 0);
