// Tests of the teaching layer (npm run kit:test runs them after the pawn toolkit's). Every position is a
// real King & Pawn position; every claim an explanation makes is checked against the independent oracle
// (../pawn/oracle.cjs: no code shared with the solver the explainer uses) and against geometry written
// again here, not imported. Then real course lines: [%also] untouched, text short, analysis repeatable.
// Fails loudly (exit code 1).
const fs = require('fs');
const path = require('path');
const { Chess } = require('chess.js');
const oracle = require('../pawn/oracle.cjs');
const solver = require('../solver.cjs');
const { fastestMoves } = require('../verify.cjs');
const { readPgn } = require('../pgn.cjs');
const domain = require('../pawn/domain.cjs');
const { createExplainer, readable, equalPhrase } = require('./explain.cjs');
const { verifyLine } = require('../verify.cjs');
const { moveOutcomes, zugzwang, resultFor } = require('./outcome.cjs');
const { createConcepts, cueProblems } = require('./concepts.cjs');
const { analyzeLine: difficultyOf, label, BANDS, composite } = require('./difficulty.cjs');
const { analyzeLine, explainLine } = require('./analyze.cjs');
const { STAGES, createProgression, purposeHints } = require('./progression.cjs');

let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failures++; };
const throws = (f) => { try { f(); return false; } catch { return true; } };
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

// King & Pawn: the measure of the King & Pawn course (plies to a safe promotion)
const verify = { goal: 'promotion', probe: solver.probe };
const ex = createExplainer({ verify, domain });
const after = (fen, san) => { const g = new Chess(fen); g.move(san); return g.fen(); };
const after2 = after;
// ---- written again here, on purpose: geometry and results that do not come from the code under test ----
const at = (fen, type, color) => { for (const row of new Chess(fen).board()) for (const p of row) if (p && p.type === type && p.color === color) return [p.square.charCodeAt(0) - 97, +p.square[1]]; return null; };
function oppositionKind(fen) {
  const [wf, wr] = at(fen, 'k', 'w'), [bf, br] = at(fen, 'k', 'b');
  const df = Math.abs(wf - bf), dr = Math.abs(wr - br);
  if ((df === 0 && dr === 2) || (dr === 0 && df === 2)) return 'direct';
  if ((df === 0 && (dr === 4 || dr === 6)) || (dr === 0 && (df === 4 || df === 6))) return 'distant';
  if (df === 2 && dr === 2) return 'diagonal';
  return null;
}
// the oracle covers White's pawns; Black's pawns are read on the board turned round (written again here):
// the side to move stays the same player, so the result for the side to move is unchanged
const turnRound = (fen) => { const [b, stm] = fen.split(' '); return `${b.split('/').reverse().map((r) => [...r].map((c) => (/[a-z]/.test(c) ? c.toUpperCase() : c.toLowerCase())).join('')).join('/')} ${stm === 'w' ? 'b' : 'w'} - - 0 1`; };
const oracleResult = (fen) => oracle.probe(/p/.test(fen.split(' ')[0]) ? turnRound(fen) : fen); // { result for the side to move, dtc }
const whiteWins = (fen) => { const r = oracleResult(fen); return new Chess(fen).turn() === 'w' ? r.result === 'win' : r.result === 'loss'; };

// ---- outcomes: the same moves as verify.cjs, classified by the oracle's numbers too ----
{
  const fen = '8/8/4k3/8/8/4K3/4P3/8 w - - 0 1'; // pawn e2, kings e3 and e6
  const out = moveOutcomes(fen, verify);
  check(same(out.moves.filter((m) => m.kind === 'best').map((m) => m.san), fastestMoves(fen, verify)), 'outcomes: "best" is exactly verify.fastestMoves');
  const dtc = (san) => oracleResult(after(fen, san)).dtc;
  const best = out.moves.find((m) => m.kind === 'best');
  check(out.moves.every((m) => (m.kind === 'draws') === !whiteWins(after(fen, m.san))), 'outcomes: "draws" exactly where the oracle says White no longer wins');
  check(out.moves.filter((m) => m.kind === 'slower').every((m) => m.delta === dtc(m.san) - dtc(best.san) && m.delta > 0), 'outcomes: "slower" with the oracle\'s difference in plies');
}

// ---- 1. a correct move explained by a grounded fact: the opposition (and the zugzwang behind it) ----
{
  const fen = '8/4k3/8/8/3KP3/8/8/8 w - - 0 1'; // Kd4, e4 against Ke7: Ke5 is the only win
  const e = ex.explainMove(fen, 'Ke5');
  check(same(ex.acceptedMoves(fen), ['Ke5']) && same(fastestMoves(fen, verify), ['Ke5']), 'opposition: Ke5 is the only fastest win (solver and verify.cjs)');
  check(e.text === 'Ke5! — Take the opposition. Black must give way.', `opposition: "${e.text}"`);
  const a = after(fen, 'Ke5');
  check(oppositionKind(a) === 'direct' && new Chess(a).turn() === 'b', 'opposition: true on the board (kings on one file, one square between, Black to move)');
  const failing = moveOutcomes(fen, verify).moves.filter((m) => m.kind === 'draws');
  check(failing.length > 0 && failing.every((m) => !whiteWins(after(fen, m.san))), 'opposition: the moves that fail really draw (oracle)');
  check(failing.every((m) => !(oppositionKind(after(fen, m.san)) && new Chess(after(fen, m.san)).turn() === 'b' && whiteWins(after(fen, m.san)))),
    'opposition: contrast holds: no failing move leaves White with the opposition and a win');
  const pass = a.replace(' b ', ' w ');
  check(whiteWins(a) && !whiteWins(pass), 'zugzwang: with Black to move White wins, with White to move it is a draw (oracle)');
  check(e.parts.notice === 'Which king will have to give way?' && e.parts.concept === 'opposition' && e.parts.remember, 'opposition: the cue and the takeaway come from the concept');
}

// ---- 2. a wrong move that draws, and why: Black's reply takes the opposition ----
{
  const fen = '8/8/4k3/8/8/4K3/4P3/8 w - - 0 1';
  const e = ex.explainMove(fen, 'Kf3');
  check(e.kind === 'draws' && e.mark === '?' && e.text === 'Kf3? — Black gets the opposition. Only a draw now.', `wrong move: "${e.text}"`);
  const r = after(after(fen, 'Kf3'), e.reply);
  check(!whiteWins(after(fen, 'Kf3')) && !whiteWins(r), `wrong move: after Kf3 and Black's reply ${e.reply} it is a draw (oracle)`);
  check(oppositionKind(r) === 'direct' && new Chess(r).turn() === 'w', `wrong move: after ${e.reply} the kings face each other with White to move (Black has the opposition)`);
  check(e.severity === 'turns the win into a draw' && !e.immediate, 'wrong move: called a draw, not a blunder');
}

// ---- 3. a lost win is not a slower win ----
{
  const fen = '8/8/4k3/8/8/4K3/4P3/8 w - - 0 1';
  const slow = ex.explainMove(fen, 'Kd4'), lost = ex.explainMove(fen, 'Kf3'), best = ex.explainMove(fen, 'Ke4');
  const plies = (san) => oracleResult(after(fen, san)).dtc;
  check(slow.kind === 'slower' && slow.delta === plies('Kd4') - plies('Ke4') && slow.delta === 4, `slower: Kd4 needs ${slow.delta} plies more (oracle: ${plies('Kd4')} against ${plies('Ke4')})`);
  check(slow.text === 'Kd4?! — Still wins, but 2 moves slower.' && slow.mark === '?!' && slow.severity === 'still wins, but slower', `slower: "${slow.text}"`);
  check(lost.mark !== slow.mark && lost.severity !== slow.severity && !/slower/.test(lost.text) && !/draw/.test(slow.text), 'slower and lost win get different marks and words');
  check(slow.facts.length === 0, 'slower: no cause claimed, only the solver\'s delta');
  check(best.important && best.mark === '!', 'the fastest move of a position with a tempting draw is marked "!"');
}

// ---- 4. equal moves: the text names them, and the accepted moves stay exactly the solver's ----
{
  const fen = '8/4k3/8/8/4K3/8/4P3/8 w - - 0 1'; // Kd5, Ke5 and Kf5 all win equally fast
  const acc = ex.acceptedMoves(fen);
  check(same(acc, ['Kd5', 'Ke5', 'Kf5']) && same(acc, fastestMoves(fen, verify)), 'equal moves: Kd5, Ke5, Kf5 accepted, the same as verify.fastestMoves');
  for (const san of acc) {
    const e = ex.explainMove(fen, san);
    const others = acc.filter((x) => x !== san);
    check(same(e.equal, others) && e.text.includes(equalPhrase(e.equal)), `equal moves: ${san} lists exactly ${others.join(', ')} ("${e.text}")`);
  }
  check(ex.explainMove(fen, 'Ke5').facts[0] === 'opposition' && ex.explainMove(fen, 'Kd5').facts.length === 0, 'equal moves: only Ke5 claims the opposition; Kd5 has no grounded reason and does not borrow one');
  check(ex.explainMove(fen, 'Kd5').review.includes('no-grounded-reason'), 'equal moves: a move without a grounded reason is flagged for review');
}

// ---- 5. the rook pawn: where the usual rule does not hold ----
{
  const fen = '8/K2k4/8/8/P7/8/8/8 w - - 0 1'; // Kb7! takes the opposition, a rook pawn on the board
  const e = ex.explainMove(fen, 'Kb7');
  check(e.facts[0] === 'opposition' && e.exceptions.some((x) => x.id === 'rookPawn'), `rook pawn: "${e.text}" carries the rookPawn exception for the course to handle`);
  const drawn = 'k7/8/K7/P7/8/8/8/8 b - - 0 1'; // White has the opposition, and it is still a draw
  const facts = domain.facts(drawn);
  check(facts.some((f) => f.id === 'opposition' && f.side === 'w') && oracleResult(drawn).result === 'draw', 'rook pawn: White has the opposition and it is a draw (oracle)');
  check(domain.concepts.note('opposition', 'exception', facts) === 'With a rook pawn, the opposition is not always enough.' && domain.exceptions(drawn).length === 1, 'rook pawn: the concept\'s exception note and the exception flag are there');
  check(same(require('../pawn/geometry.cjs').keySquares(32), [49, 57]), 'rook pawn: its key squares are b7 and b8 (not the three squares ahead)');
}

// ---- 6. zugzwang, solver-backed both ways ----
{
  const zz = '8/8/4k3/8/4K3/4P3/8/8 b - - 0 1'; // kings e4 and e6, pawn e3, Black to move
  const z = zugzwang(zz, verify, 'w');
  check(z && z.side === 'b' && z.withMove === 'win' && z.ifPassed === 'draw', 'zugzwang: Black to move loses, White to move would only draw');
  check(whiteWins(zz) && !whiteWins(zz.replace(' b ', ' w ')), 'zugzwang: confirmed by the oracle');
  const not = '4k3/8/4K3/4P3/8/8/8/8 b - - 0 1';
  check(zugzwang(not, verify, 'w') === null && whiteWins(not) && whiteWins(not.replace(' b ', ' w ')), 'not zugzwang: White wins whoever is to move');
  check(zugzwang('8/8/8/8/8/3k4/4P3/4K3 b - - 0 1', verify, 'w') === null, 'zugzwang: never claimed when handing over the move is impossible (Black is in check)');
  check(resultFor(zz, verify, 'w').result === 'win' && resultFor(zz, verify, 'b').result === 'loss', 'resultFor: the same position, seen by each side');
}

// ---- 7. cues: from the position's concept, never the answer, never generic ----
{
  for (const c of domain.concepts.list) for (const q of c.cues) check(cueProblems(q).length === 0, `cue "${q}" asks without naming a square or a move`);
  check(throws(() => createConcepts([{ id: 'x', fact: 'opposition', cues: ['Is Kf4 the move?'] }])), 'a cue naming a move is refused');
  check(throws(() => createConcepts([{ id: 'x', fact: 'opposition', cues: ['Look at e4.'] }])), 'a cue naming a square (and not a question) is refused');
  const e = ex.explainMove('8/4k3/8/8/3KP3/8/8/8 w - - 0 1', 'Ke5');
  check(e.parts.notice && !e.parts.notice.includes('Ke5') && !/[a-h][1-8]/.test(e.parts.notice), `the cue before Ke5 does not give it away ("${e.parts.notice}")`);
  check(domain.concepts.cue('opposition', 2) !== domain.concepts.cue('opposition', 1) && domain.concepts.cue('opposition', 0) === null, 'cues: level 0 is none, higher levels say more');
  const plain = ex.explainMove('8/8/8/1k1KP3/8/8/8/8 w - - 0 1', 'e6'); // no grounded reason: no cue either
  check(plain.parts.notice === null, 'no generic cue when no concept explains the move');
}

// ---- 8. no invented facts, over many real positions ----
{
  let n = 0, bad = [];
  const files = [0, 3, 4]; // a, d, e
  for (const f of files) for (let r = 2; r <= 5; r += 1) for (let wk = 0; wk < 64; wk += 3) for (let bk = 1; bk < 64; bk += 5) {
    const sq = (s) => 'abcdefgh'[s % 8] + (Math.floor(s / 8) + 1);
    const p = (r - 1) * 8 + f;
    if (new Set([wk, bk, p]).size < 3 || Math.max(Math.abs((wk % 8) - (bk % 8)), Math.abs(Math.floor(wk / 8) - Math.floor(bk / 8))) < 2) continue;
    const g = new Chess(); g.clear();
    g.put({ type: 'k', color: 'w' }, sq(wk)); g.put({ type: 'k', color: 'b' }, sq(bk)); g.put({ type: 'p', color: 'w' }, sq(p));
    const fen = g.fen();
    if (new Chess(fen).isGameOver() || new Chess(fen.replace(' w ', ' b ')).inCheck() || !whiteWins(fen)) continue;
    for (const m of moveOutcomes(fen, verify).moves) {
      const e = ex.explainMove(fen, m.san);
      n++;
      const a = after(fen, m.san);
      if (/Take the .*opposition/.test(e.text) && !(oppositionKind(a) && whiteWins(a))) bad.push(`${fen} ${e.text}`);
      if (/Black gets the .*opposition/.test(e.text) && !(e.reply && oppositionKind(after(a, e.reply)) && !whiteWins(after(a, e.reply)))) bad.push(`${fen} ${e.text}`);
      if (/zugzwang: every move loses|Black must give way/.test(e.text) && !(whiteWins(a) && !whiteWins(a.replace(' b ', ' w ')))) bad.push(`${fen} ${e.text}`);
      if (/Black must give way/.test(e.text) && oppositionKind(a) !== 'direct') bad.push(`${fen} ${e.text}`);
      if (/Only a draw now/.test(e.text) && whiteWins(a)) bad.push(`${fen} ${e.text}`);
      if (/^\S+! /.test(e.text) && !whiteWins(a)) bad.push(`${fen} ${e.text}`);
      if (readable(e.text).length) bad.push(`${fen} too long: ${e.text}`);
    }
  }
  check(n > 1000 && bad.length === 0, `no invented facts: ${n} explanations checked against the oracle and the board${bad.length ? `; ${bad.length} wrong, e.g. ${bad.slice(0, 3).join(' | ')}` : ''}`);
  const none = '8/8/8/8/8/1k6/4P3/4K3 w - - 0 1';
  check(!oppositionKind(none) && domain.concepts.note('opposition', 'introduce', domain.facts(none)) === null, 'a concept note is refused where its fact is absent');
}

// ---- 9. short text ----
{
  check(readable('Kf4! — Take the opposition. Black must move first.').length === 0 && readable('Kf4! — Take the opposition. Black must give way.').length === 0, 'readable: the owner\'s examples pass');
  check(readable('Kf4! — One. Two. Three.').length > 0 && readable('Kf4! — This sentence is far too long for a learner to take in at one quick glance.').length > 0, 'readable: three sentences or a long sentence fail');
  for (const c of domain.concepts.list) for (const t of [...Object.values(c.notes), c.remember]) check(readable(t).length === 0, `concept text is short: "${t}"`);
}

// ---- 10. real course lines: [%also] untouched, difficulty repeatable ----
const APP = path.join(__dirname, '../../..');
const kpkLines = readPgn(fs.readFileSync(path.join(APP, 'courses/king-and-pawn-course.pgn'), 'utf8'));
{
  const all = kpkLines.map((gm) => explainLine({ fen: gm.tags.FEN, moves: gm.moves }, ex, { learner: 'w' })).flat();
  check(all.length > 300 && all.every((e) => e.alsoMatches), `King & Pawn course: ${all.length} learner moves, every [%also] is exactly the equal moves (or, defending, only moves that hold)`);
  const basics = readPgn(fs.readFileSync(path.join(APP, 'courses/endgame-basics-course.pgn'), 'utf8'));
  const bv = require('../../basics-course/verify-opts.cjs');
  const bx = createExplainer({ verify: bv, domain });
  const res = basics.map((gm) => analyzeLine({ fen: gm.tags.FEN, moves: gm.moves }, { ex: bx, verify: bv, learner: 'w' }));
  check(res.every((r) => r.correctness.ok && r.teaching.alsoMatches), `Basics course: ${res.length} lines pass verify.cjs and keep their [%also] with the teaching layer loaded`);
  const line = { fen: kpkLines[0].tags.FEN, moves: kpkLines[0].moves };
  const d1 = difficultyOf(line, ex, { learner: 'w' });
  const d2 = difficultyOf(line, createExplainer({ verify, domain }), { learner: 'w' });
  check(JSON.stringify(d1) === JSON.stringify(d2), `difficulty: the same line gives the same signals and score twice (score ${d1.score}, ${d1.label})`);
  check(d1.label === label(d1.score) && BANDS.some(([, l]) => l === d1.label) && d1.why.length > 0 && d1.signals.learnerMoves === 8, 'difficulty: the label follows from the score; the signals stay visible');
  const mate = { fen: basics[0].tags.FEN, moves: basics[0].moves };
  check(Array.isArray(difficultyOf(mate, bx, { learner: 'w' }).partial), 'difficulty: reports which signals are unknown (no plausible-move heuristic)');
}

// ---- 11. progression: stages, order, help, apart from difficulty ----
{
  const P = createProgression();
  const item = (id, concepts, purposes, score, variety) => ({ id, concepts, purposes, difficulty: { score }, variety });
  const pool = [
    item('a', ['opp'], ['introduce', 'reinforce'], 30, 'x'), item('b', ['opp'], ['introduce', 'reinforce'], 20, 'y'),
    item('c', ['opp'], ['reinforce'], 40, 'q'), item('h', ['opp'], ['reinforce'], 35, 'x'), item('d', ['opp'], ['independent_application'], 55, 'z'),
    item('e', ['key'], ['introduce'], 25, 'w'), item('f', ['opp', 'key'], ['mixed_review'], 15, 'v'),
    item('g', ['opp'], ['misconception'], 10, 'u'),
  ];
  const plan = [
    { stage: 'introduce', concept: 'opp', count: 1 }, { stage: 'reinforce', concept: 'opp', count: 2 },
    { stage: 'misconception', concept: 'opp', count: 1 }, { stage: 'independent_application', concept: 'opp', count: 1 },
    { stage: 'introduce', concept: 'key', count: 1 }, { stage: 'mixed_review', concepts: ['opp', 'key'], count: 1 },
  ];
  const seq = P.sequence(plan, pool);
  check(seq.map((x) => x.id).join('') === 'bacgdef' && seq.short.length === 0, `sequence: easiest first within a step, plan order kept, h skipped (same variety as a) (${seq.map((x) => x.id).join('')})`);
  check(P.sequence([{ stage: 'reinforce', concept: 'opp', count: 9 }], pool).short[0]?.got === 4, 'sequence: a step that cannot be filled is reported short, not padded');
  check(P.checkSequence(seq).length === 0, 'sequence: passes its own checks');
  check(seq.find((x) => x.id === 'g').difficulty.score < seq.find((x) => x.id === 'c').difficulty.score, 'progression is not difficulty: the misconception comes later and is easier');
  check(seq.map((x) => x.hints).join() === '3,2,2,2,0,3,0', 'help per stage: note + cue + marks, then less; the misconception brings a warning back');
  const bad = [seq[1], seq[0], ...seq.slice(2)];
  check(P.checkSequence(bad).some((p) => /reinforce of opp before introduce/.test(p)), 'check: reinforce before introduce is caught');
  check(P.checkSequence([seq[0], seq[4]]).some((p) => /independent_application of opp before reinforce/.test(p)), 'check: applying alone before reinforcing is caught');
  check(P.checkSequence([seq[0], seq[6]]).some((p) => /mixed_review with only 1 concept/.test(p)), 'check: mixed review before two concepts is caught');
  check(P.checkSequence([seq[0], { ...seq[4], stage: 'variation', hints: 1 }, { ...seq[2], hints: 2 }]).some((p) => /more help for opp again/.test(p)), 'check: help growing again is caught');
  check(P.checkSequence([seq[1], { ...seq[2], variety: seq[1].variety }]).some((p) => /same variety key/.test(p)), 'check: the same variety twice in a row is caught');
  const custom = createProgression({ stages: { first: { order: 0, hints: 1, requires: [] }, then: { order: 1, hints: 0, requires: ['first'] } } });
  check(custom.sequence([{ stage: 'first', concept: 'opp', count: 1 }], [item('a', ['opp'], ['first'], 1, 'x')]).length === 1 && throws(() => custom.sequence([{ stage: 'introduce', count: 1 }], pool)), 'stages are configurable: a course\'s own table replaces the default');
  check(Object.keys(STAGES).join() === 'introduce,reinforce,variation,independent_application,misconception,calculation,exception,mixed_review', 'the default stages');
  // purposes from a real line: "The rule of the square" (the pawn runs on move one)
  const rule = kpkLines.find((gm) => /rule of the square/.test(gm.tags.LineName));
  const a = analyzeLine({ fen: rule.tags.FEN, moves: rule.moves }, { ex, verify, learner: 'w', correctness: false });
  check(a.difficulty.signals.firstConcept === 'ruleOfSquare' && a.purpose.includes('introduce'), `purpose from facts: "${rule.tags.LineName}" can introduce the rule of the square (${a.purpose.join(', ')})`);
  check(purposeHints({ concepts: ['opposition'], firstConcept: 'opposition', firstCritical: true, critical: 1, traps: 1, exception: true, learnerMoves: 3, zugzwangsSet: 0 }).includes('exception'), 'purpose: an exception position is offered for the exception stage');
}

// ---- 12. Prompt 2 fixes, found on real opposition positions ----
{
  // Black's pawns: the board turned round gives the same facts with the sides swapped back
  const def = '8/8/8/1p6/2k5/8/3K4/8 w - - 0 1'; // White defends against Black's b-pawn
  const turned = domain.flipFen(def);
  check(turned === '8/3k4/8/2K5/1P6/8/8/8 b - - 0 1', `flipFen: ranks reversed, colours swapped (${turned})`);
  const after = after2(def, 'Kc2');
  const f = domain.facts(after);
  check(f.some((x) => x.id === 'opposition' && x.kind === 'direct' && x.side === 'w') && oppositionKind(after) === 'direct' && new Chess(after).turn() === 'b',
    'Black\'s pawn: after Kc2 the facts give White the direct opposition, as the board shows (kings c2/c4, Black to move)');
  const held = after2('8/8/3p4/8/8/1k6/3K4/8 w - - 0 1', 'Kd3');
  check(domain.facts(held).some((x) => x.id === 'blockade' && x.side === 'w' && x.pawn === 'd6') && !f.some((x) => x.id === 'blockade' && x.side === 'w'),
    'Black\'s pawn: the white king in front of it on its file (Kd3 against d6) is a blockade for White, named on the real board; Kc2 against b5 is not');
  check(Array.isArray(domain.plausible(def)) && domain.plausible(def).includes('Kc2') && !domain.plausible(def).includes('Ke1'), 'Black\'s pawn: likely moves for the defender (towards the pawn\'s queening square, not away)');
  const e = ex.explainMove(def, 'Kc2');
  check(e.text === 'Kc2! — Take the opposition. Black must give way.' && e.mode === 'hold', `defending: "${e.text}"`);
  check(oracleResult(after).result === 'draw' && oracleResult(after.replace(' b ', ' w ')).result === 'loss', 'defending: the oracle agrees (Black to move cannot win; if White had to move, Black would win)');
  // nothing to contrast with: no fact is a reason
  const mutual = '8/8/4k3/8/4K3/4P3/8/8 w - - 0 1';
  const p = ex.explainPosition(mutual);
  check(p.best.length === 4 && p.best.every((x) => x.text.endsWith('Every move keeps the draw.') && x.facts.length === 0), 'every move equally good: no fact is given as a reason');
  check(p.zugzwang && p.zugzwang.who === 'learner' && p.zugzwang.text === 'If Black had to move, you would win.' && !whiteWins(mutual) && whiteWins(mutual.replace(' w ', ' b ')),
    'the learner to move in zugzwang is said as such (and the oracle agrees)');
  check(ex.explainPosition('8/8/4k3/8/8/4K3/4P3/8 w - - 0 1').zugzwang === null, 'no zugzwang claimed where there is none');
  // a vocabulary: a reason outside it is not used
  const v1 = createExplainer({ verify, domain, vocabulary: (x) => x.id !== 'keySquare' });
  const plain = ex.explainMove('8/8/4k3/8/8/4K3/4P3/8 w - - 0 1', 'Ke4'), limited = v1.explainMove('8/8/4k3/8/8/4K3/4P3/8 w - - 0 1', 'Ke4');
  check(plain.facts[0] === 'keySquare' && limited.text === 'Ke4! — Take the opposition.', `vocabulary: without key squares, Ke4 is explained by the opposition ("${limited.text}")`);
  const v2 = createExplainer({ verify, domain, vocabulary: (x) => x.id !== 'opposition' && x.id !== 'keySquare' && x.id !== 'zugzwang' });
  const none = v2.explainMove('8/8/4k3/8/8/4K3/4P3/8 w - - 0 1', 'Ke4');
  check(none.facts.length === 0 && none.review.includes('outside-vocabulary') && !/opposition|key/.test(none.text), 'vocabulary: with no reason left, the solver\'s words and a review flag');
  check(ex.explainMove('8/8/4k3/8/8/4K3/4P3/8 w - - 0 1', 'Kf3').text === 'Kf3? — Black gets the opposition. Only a draw now.' && v2.explainMove('8/8/4k3/8/8/4K3/4P3/8 w - - 0 1', 'Kf3').review.includes('outside-vocabulary'), 'vocabulary: also for the reason a move fails');
  // difficulty: an unknown signal is a range, not zero
  const known = { learnerMoves: 10, uniqueShare: 1, failShare: 0.5, trapRate: 1, counterIntuitiveShare: 0, zugzwangsSet: 1 };
  const k = composite(known), u = composite({ ...known, trapRate: null, counterIntuitiveShare: null });
  check(k.label && k.partial.length === 0 && k.sortScore === k.score, 'difficulty: all signals known, one label');
  check(u.score < k.score && u.scoreMax >= k.score && u.sortScore === u.scoreMax && u.partial.join() === 'trapRate,counterIntuitiveShare' && (u.label === null) === (u.labelRange[0] !== u.labelRange[1]),
    `difficulty: unknown signals give a range ${u.score}-${u.scoreMax}, ordered by its top, no single label across bands`);
  check(composite({ learnerMoves: 30, uniqueShare: 0, failShare: 0, trapRate: 0, counterIntuitiveShare: 0, zugzwangsSet: 0 }).label === 'Foundational', 'difficulty: length alone keeps a line Foundational');
  const seq = createProgression().sequence([{ stage: 'introduce', concept: 'x', count: 2 }], [
    { id: 'p', concepts: ['x'], purposes: ['introduce'], difficulty: { score: 10, sortScore: 60 } },
    { id: 'q', concepts: ['x'], purposes: ['introduce'], difficulty: { score: 30, sortScore: 30 } }]);
  check(seq.map((x) => x.id).join() === 'q,p', 'progression: a line with unknown signals is ordered by the top of its range, never earlier (and items without a variety key are not taken as repeats)');
  // zugzwangs set by the learner, kept apart from those the learner faces
  const zline = { fen: '8/8/4k3/8/8/2P1K3/8/8 w - - 0 1', moves: ['Ke4', 'Kd6', 'Kd4', 'Kc6', 'Kc4', 'Kd6', 'Kb5'].map((san) => ({ san })) };
  const zs = difficultyOf(zline, ex, { learner: 'w' }).signals;
  check(zs.zugzwangsSet === 3 && zs.zugzwangsFaced === 0, `difficulty: three zugzwangs set by the learner, none faced (${zs.zugzwangsSet}/${zs.zugzwangsFaced})`);
  // verify.cjs: a line that starts with the opponent's move
  const giveWay = { fen: '8/3k4/8/3K4/2P5/8/8/8 b - - 0 1', moves: ['Kc7', 'Kc5', 'Kd7', 'Kb6', 'Kc8', 'Kc6', 'Kb8', 'Kd7', 'Kb7', 'c5', 'Ka6', 'c6', 'Kb5', 'c7', 'Kc4', 'c8=Q+'].map((san) => ({ san, also: [] })) };
  giveWay.moves[5].also = ['c5']; // Kc6: c5 wins just as fast
  const vr = verifyLine(giveWay, { ...verify, learner: 'w' });
  check(vr.problems.length === 0 && vr.unique.length === 8, `verify.cjs: a line starting with Black's move passes with learner 'w' (${vr.problems.join('; ')})`);
  check(verifyLine(giveWay, verify).problems.length > 0, 'verify.cjs: without the option the learner is the side to move, as before');
}

console.log(failures ? `teaching layer tests: ${failures} FAILED` : 'teaching layer tests: all passed');
process.exit(failures ? 1 : 0);
