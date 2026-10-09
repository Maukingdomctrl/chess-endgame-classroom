// Tests of the Opposition curriculum's design (npm run kit:test runs them after the teaching layer's):
// the Direct Opposition blueprint (100 slots, phases, help, prerequisites, the progression rules), its
// Markdown table, and the prototypes run through the real pipeline, every claim checked against the
// independent oracle (../../pawn/oracle.cjs) and against geometry written again here. Fails loudly.
const fs = require('fs');
const path = require('path');
const { Chess } = require('chess.js');
const oracle = require('../../pawn/oracle.cjs');
const { verifyLine, fastestMoves } = require('../../verify.cjs');
const { playLine } = require('../../line.cjs');
const { analyzeLine, BANDS } = require('../../teach/difficulty.cjs');
const { explainLine } = require('../../teach/analyze.cjs');
const { createExplainer } = require('../../teach/explain.cjs');
const { createProgression } = require('../../teach/progression.cjs');
const { cueProblems } = require('../../teach/concepts.cjs');
const domain = require('../../pawn/domain.cjs');
const B = require('./direct-opposition.cjs');
const { TASKS, classify } = require('./tasks.cjs');
const { PROTOTYPES } = require('./prototypes.cjs');

let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failures++; };
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

// ---- the blueprint ----
const { SLOTS, PHASES, HELP } = B;
const bands = BANDS.map(([, l]) => l);
check(SLOTS.length === 100 && SLOTS.every((s, i) => s.n === i + 1), 'blueprint: exactly 100 slots, numbered 1-100');
const ranges = { introduction: [1, 10], guided: [11, 25], reinforcement: [26, 40], application: [41, 55], variation: [56, 70], independent: [71, 82], calculation: [83, 92], assessment: [93, 100] };
check(PHASES.every((p) => ranges[p.id][0] === p.from && ranges[p.id][1] === p.to) && SLOTS.every((s) => s.n >= ranges[s.phase][0] && s.n <= ranges[s.phase][1]),
  'blueprint: the eight phases cover 1-10, 11-25, 26-40, 41-55, 56-70, 71-82, 83-92, 93-100');
check(PHASES.every((p) => ['taught', 'practised', 'newDifficulty', 'help', 'advance', 'misconception'].every((k) => typeof p[k] === 'string' && p[k].length > 10)),
  'blueprint: every phase says what is taught, practised, the new difficulty, the help, how to advance, the misconception');
check(SLOTS.every((s) => s.objective && s.skill && TASKS[s.task] && HELP[s.help] && s.band.length && s.band.every((b) => bands.includes(b)) && Array.isArray(s.requires)),
  'blueprint: every slot has an objective, a skill or misconception, a known task, a help level, bands and prerequisites');
check(SLOTS.every((s) => s.requires.every((r) => r < s.n)), 'blueprint: prerequisites always come earlier');
check(SLOTS.filter((s) => s.n <= 10).every((s) => s.help === 3 && s.purpose === 'introduce'), 'blueprint: the first ten teach with full help before anything is asked alone');
check(SLOTS.every((s) => s.help > 0 || s.n >= 71), 'blueprint: no position without help before the independent phase');
check(SLOTS.filter((s) => s.task === 'push' || s.task === 'protect').every((s) => s.n > 40), 'blueprint: the "not the opposition" contrasts come after the rule is established (from 41)');
check(SLOTS.filter((s) => s.phase === 'assessment').every((s) => s.feedback === 'closing' && s.help === 0), 'blueprint: the assessment gives no help and only the closing note');
check(SLOTS.filter((s) => s.phase === 'calculation').every((s) => s.band.includes('Around 1800')), 'blueprint: the calculation phase asks for the hardest band this course has');
const byTask = {}; for (const s of SLOTS) byTask[s.task] = (byTask[s.task] ?? 0) + 1;
check(byTask.protect <= 5 && byTask.take >= 50, `blueprint: tasks within what the solver offers (${JSON.stringify(byTask)}; protect-first has only 6 distinct positions)`);
// the progression rules (teach/progression.cjs) on the slots: order of stages per concept, help only going down
const bandScore = (s) => s.band.reduce((a, b) => a + bands.indexOf(b) * 20 + 10, 0) / s.band.length;
const items = SLOTS.map((s) => ({ stage: s.purpose, concepts: s.concepts, hints: s.help, difficulty: { score: bandScore(s) } }));
// the bands are coarse targets: inside a run a slot may step back by one band (a shorter line after a long
// one serves the lesson); the generator orders the real positions inside each slot's band
const problems = createProgression().checkSequence(items, { tolerance: 20 });
check(problems.length === 0, `blueprint: passes the progression rules (introduce before reinforce, help does not come back, mixed review last, at most one band back inside a run)${problems.length ? `: ${problems.slice(0, 3).join('; ')}` : ''}`);
check(createProgression().checkSequence([items[10], ...items]).some((p) => /before introduce/.test(p)), 'blueprint check: a reinforcement before the introduction would be caught');
// the Markdown table is the data
const md = fs.readFileSync(path.join(__dirname, 'direct-opposition.md'), 'utf8');
const table = md.split('<!-- slots:start -->')[1]?.split('<!-- slots:end -->')[0]?.trim();
check(table === B.toMarkdown(), 'direct-opposition.md: its slot table is exactly toMarkdown() of the data (regenerate it after a change)');

// ---- the prototypes through the real pipeline ----
const ex = B.createCourseExplainer();
const after = (fen, san) => { const g = new Chess(fen); g.move(san); return g.fen(); };
// written again here: the board turned round, kings, the direct opposition
const turnRound = (fen) => { const [b, stm] = fen.split(' '); return `${b.split('/').reverse().map((r) => [...r].map((c) => (/[a-z]/.test(c) ? c.toUpperCase() : c.toLowerCase())).join('')).join('/')} ${stm === 'w' ? 'b' : 'w'} - - 0 1`; };
const probe = (fen) => oracle.probe(/p/.test(fen.split(' ')[0]) ? turnRound(fen) : fen);
/** White's result in fen by the oracle: 'win' | 'draw' | 'loss'. */
const white = (fen) => { const r = probe(fen).result; const w = new Chess(fen).turn() === 'w'; return r === 'draw' ? 'draw' : (r === 'win') === w ? 'win' : 'loss'; };
const kingAt = (fen, c) => { for (const row of new Chess(fen).board()) for (const p of row) if (p && p.type === 'k' && p.color === c) return [p.square.charCodeAt(0) - 97, +p.square[1]]; return null; };
const direct = (fen) => { const [a, b] = kingAt(fen, 'w'), [c, d] = kingAt(fen, 'b'); return (a === c && Math.abs(b - d) === 2) || (b === d && Math.abs(a - c) === 2); };
const passed = (fen) => fen.replace(/ ([wb]) /, (_, c) => (c === 'w' ? ' b ' : ' w '));
const P = Object.fromEntries(PROTOTYPES.map((p) => [p.id, p]));

for (const p of PROTOTYPES) {
  const c = classify(p.fen, ex);
  check((c?.task ?? null) === p.task, `${p.id}: classified as ${p.task ?? 'no course-1 task'} (${c?.task ?? 'none'})`);
  if (!p.first || !p.text) continue;
  const start = p.reply ? after(p.fen, p.reply) : p.fen;
  if (p.reply) check(c.reply === p.reply, `${p.id}: Black's most stubborn first move is ${p.reply}`);
  const e = ex.explainMove(start, p.first);
  check(e.text === p.text, `${p.id}: "${e.text}"`);
  check(e.kind === 'best' && ex.acceptedMoves(start).includes(p.first), `${p.id}: ${p.first} is accepted (fastest win, or holds)`);
  const a = after(start, p.first);
  // every claim in the text, against the oracle and the board
  const wantWhite = c.task === 'defend' ? 'draw' : 'win';
  check(white(start) === wantWhite && white(a) === wantWhite, `${p.id}: the oracle says ${wantWhite} before and after ${p.first}`);
  if (/Take the opposition/.test(e.text)) check(direct(a) && new Chess(a).turn() === 'b', `${p.id}: after ${p.first} the kings face each other with one square between, Black to move`);
  if (/Black must give way/.test(e.text)) check(white(passed(a)) !== white(a), `${p.id}: "Black must give way" is a zugzwang by the oracle (with White to move instead: ${white(passed(a))})`);
  if (p.orientation) check(c.orientation === p.orientation, `${p.id}: the opposition is ${p.orientation}`);
  if (p.shape) check(c.shape === p.shape, `${p.id}: the first move is a ${p.shape} step`);
  for (const w of p.wrong ?? []) {
    const we = ex.explainMove(start, w.san);
    check(we.kind === w.kind && we.text === w.text, `${p.id}: "${we.text}"`);
    const aw = after(start, w.san);
    if (w.kind === 'draws') check(white(aw) === 'draw', `${p.id}: ${w.san} draws by the oracle`);
    if (w.kind === 'loses') check(white(aw) === 'loss', `${p.id}: ${w.san} loses by the oracle`);
    if (w.kind === 'slower') check(white(aw) === 'win' && probe(aw).dtc - probe(a).dtc === we.delta, `${p.id}: ${w.san} still wins, ${we.delta} plies slower by the oracle`);
    if (/Black gets the opposition/.test(we.text)) { const r = after(aw, we.reply); check(direct(r) && new Chess(r).turn() === 'w' && white(r) === 'draw', `${p.id}: after ${w.san} ${we.reply} Black has the opposition and holds (oracle)`); }
  }
}
{ // side to move: the solver's zugzwang, both ways
  const p = P['side-to-move'];
  const w = passed(p.fen);
  const pos = ex.explainPosition(w);
  check(white(p.fen) === 'win' && white(w) === 'draw', 'side-to-move: Black to move loses, White to move only draws (oracle)');
  check(pos.zugzwang?.text === p.whiteToMove.zugzwang && pos.best.every((x) => x.text.endsWith(p.whiteToMove.every)) && pos.best.every((x) => x.facts.length === 0),
    `side-to-move: White to move is told "${p.whiteToMove.zugzwang}" and no move is given a reason`);
  const z = ex.zugzwang(p.fen, 'w');
  check(z?.side === 'b' && ex.zugzwang(w, 'w')?.side === 'w', 'side-to-move: zugzwang told apart: Black\'s (it must move) and the learner\'s');
}
{ // a line that starts with Black's move, through analyze: verify.cjs with the learner option, the notes
  const p = P.retake;
  const g = new Chess(p.fen); g.move(p.reply);
  const played = playLine(g.fen(), { ...B.VERIFY, learnerOrder: B.learnerOrder(ex) });
  const line = { fen: p.fen, moves: [{ san: p.reply }, ...played.plies.map((x) => ({ san: x.san, also: x.also }))] };
  check(verifyLine(line, { ...B.VERIFY, learner: 'w' }).problems.length === 0, 'retake: the whole line passes verify.cjs with the learner as White');
  const notes = explainLine(line, ex, { learner: 'w' });
  check(notes[0].text === p.text && notes.every((n) => n.alsoMatches), 'retake: the explanation of the first learner move, and every [%also] equal to the solver\'s equal moves');
}
{ // equal moves: the explained one is played, the others are its [%also], exactly the solver's
  const p = P['equal-moves'];
  check(same(fastestMoves(p.fen, B.VERIFY), [p.first, ...p.also]) && same(ex.explainMove(p.fen, p.first).equal, p.also), 'equal-moves: the accepted moves are exactly the solver\'s fastest moves');
  const played = playLine(p.fen, { ...B.VERIFY, learnerOrder: B.learnerOrder(ex) });
  check(played.plies[0].san === p.first && same(played.plies[0].also, p.also), 'equal-moves: the line plays the explained move first; the others become its [%also]');
  check(ex.explainMove(p.fen, 'Kd5').review.includes('no-grounded-reason') && !/opposition/.test(ex.explainMove(p.fen, 'Kd5').text), 'equal-moves: Kd5 does not borrow a reason');
}
{ // the contrasts: what the tempting opposition move really does
  const pr = P['protect-first'], pu = P['push-first'], ne = P['not-enough'];
  check(direct(after(pr.fen, pr.contrast)) && white(after(pr.fen, pr.contrast)) === 'draw', 'protect-first: the tempting move takes the opposition and draws (oracle)');
  const pc = ex.outcomes(pu.fen).moves.find((m) => m.san === pu.contrast);
  check(direct(after(pu.fen, pu.contrast)) && (white(after(pu.fen, pu.contrast)) === 'draw' || probe(after(pu.fen, pu.contrast)).dtc > probe(after(pu.fen, pu.first)).dtc), `push-first: the tempting move takes the opposition and ${pc.kind === 'draws' ? 'only draws' : 'is slower'} (oracle)`);
  check(direct(after(ne.fen, ne.tempting)) && white(after(ne.fen, ne.tempting)) === 'draw' && white(after(ne.fen, ne.first)) === 'win', 'not-enough: the opposition move draws, Kc2 wins (oracle)');
  const k = ex.explainMove(ne.fen, ne.first);
  check(k.facts.length === 0 && k.review.length > 0, `not-enough: no reason is invented for Kc2 ("${k.text}", flagged)`);
}
{ // course-1 words: no untaught term in any prototype explanation; no pawn move "takes the opposition"
  const texts = [];
  for (const p of PROTOTYPES) {
    const start = p.reply ? after(p.fen, p.reply) : p.fen;
    if (new Chess(start).turn() !== 'w') continue;
    for (const m of ex.outcomes(start).moves) texts.push(ex.explainMove(start, m.san).text);
  }
  check(texts.length > 60 && texts.every((t) => !/key square|distant|diagonal|zugzwang/.test(t)), `vocabulary: ${texts.length} explanations, none names a key square, the distant or diagonal opposition, or "zugzwang"`);
  const g = new Chess('8/3k4/8/3K4/2P5/8/8/8 b - - 0 1');
  for (const san of ['Kc7', 'Kc5', 'Kd7', 'Kb6', 'Kc8', 'Kc6', 'Kb8', 'Kd7', 'Kb7']) g.move(san);
  // the same words as course 1 but with pawn moves allowed: c5 would be "Take the opposition"; course 1 says no such thing
  const withPawnMoves = createExplainer({ verify: B.VERIFY, domain, vocabulary: (f) => f.id !== 'keySquare' && !(f.id === 'opposition' && f.kind !== 'direct') });
  const c5 = ex.explainMove(g.fen(), 'c5');
  check(/Take the opposition/.test(withPawnMoves.explainMove(g.fen(), 'c5').text) && !/opposition/.test(c5.text) && c5.review.includes('outside-vocabulary'),
    `vocabulary: a pawn move that takes the opposition (a tempo move, course 6) is not called that in course 1 ("${c5.text}", flagged)`);
  for (const q of domain.concepts.get('opposition').cues) check(cueProblems(q).length === 0, `cue "${q}" names no square and no move`);
}
{ // matches(): a prototype's real line fits the slots it was meant for
  const p = P['long-approach'];
  const c = classify(p.fen, ex);
  const played = playLine(p.fen, { ...B.VERIFY, learnerOrder: B.learnerOrder(ex) });
  const line = { fen: p.fen, moves: played.plies.map((x) => ({ san: x.san })) };
  const cand = { fen: p.fen, ...c, learnerMoves: played.plies.filter((x) => x.learner).length, difficulty: analyzeLine(line, ex, { learner: 'w' }) };
  check(cand.difficulty.signals.zugzwangsSet === 3 && B.matches(SLOTS[40], cand), `long-approach fits slot 41 (long approach, two or more zugzwangs; ${cand.difficulty.score} ${cand.difficulty.label})`);
  check(!B.matches(SLOTS[1], cand), 'long-approach does not fit slot 2 (a short, straight first step)');
  check(!B.matches(SLOTS[40], { ...cand, pawn: 'a3' }), 'matches: a rook pawn never fits (course 7)');
  check(B.canonical('8/8/4k3/8/8/4K3/4P3/8 w - - 0 1') === B.canonical('8/8/3k4/8/8/3K4/3P4/8 w - - 0 1'), 'canonical: a mirror image is the same position');
  check(B.otherCourseStarts().has(B.canonical('8/2k5/8/8/1K1P4/8/8/8 w - - 0 1')), 'otherCourseStarts: the King & Pawn course\'s starts are excluded');
}

console.log(failures ? `opposition curriculum tests: ${failures} FAILED` : 'opposition curriculum tests: all passed');
process.exit(failures ? 1 : 0);
