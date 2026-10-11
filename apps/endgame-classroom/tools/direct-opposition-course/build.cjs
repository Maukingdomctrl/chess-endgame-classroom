// Turns the picked positions into real lines (FEN, SAN, [%also]) with chess.js, mirrored where the search
// asked for it, and checks them: every line with ../course-kit/verify.cjs on its real FENs (objective
// 'auto': a winning start is checked as a win to the safe promotion, a drawn one as a hold to a draw on the
// board; the learner is White, also when Black moves first), every line still fits its slot (matches() on
// the real line's analysis), the explanations of every learner move (the course's words), and the
// progression rules on the whole course (teach/progression.cjs checkSequence). Fails loudly.
// Writes .out/lines.json.
const fs = require('fs');
const path = require('path');
const { Chess } = require('chess.js');
const B = require('../course-kit/curricula/opposition/direct-opposition.cjs');
const { classify } = require('../course-kit/curricula/opposition/tasks.cjs');
const { verifyLine, summary } = require('../course-kit/verify.cjs');
const { explainLine } = require('../course-kit/teach/analyze.cjs');
const { analyzeLine } = require('../course-kit/teach/difficulty.cjs');
const { createProgression } = require('../course-kit/teach/progression.cjs');
const { pattern, mirrorFen, mirrorSquare } = require('./keys.cjs');
const VERIFY = require('./verify-opts.cjs');

const picked = require('./.out/picked.json');
const TOLERANCE = 20;
const ex = B.createCourseExplainer();
const problems = [];
const fail = (n, msg) => problems.push(`slot ${n}: ${msg}`);

/** The picked line on the real board: mirrored if asked, every move with what the notes and marks need. */
function realize(pk) {
  const fen = pk.mirror ? mirrorFen(pk.fen) : pk.fen;
  const src = new Chess(pk.fen), g = new Chess(fen);
  const tr = (o) => (pk.mirror ? { from: mirrorSquare(o.from), to: mirrorSquare(o.to), promotion: o.promotion } : { from: o.from, to: o.to, promotion: o.promotion });
  const moves = pk.moves.map((m) => {
    const fenBefore = g.fen();
    const also = m.also.map((a) => new Chess(fenBefore).move(tr(new Chess(src.fen()).move(a))).san);
    const r = g.move(tr(src.move(m.san)));
    return { san: r.san, side: r.color, piece: r.piece, from: r.from, to: r.to, promotion: r.promotion ?? '', captured: r.captured ?? '', also, fenBefore, fenAfter: g.fen() };
  });
  return { fen: new Chess(fen).fen(), moves };
}

const lines = [];
const results = [];
for (const pk of picked) {
  const slot = B.SLOTS[pk.n - 1];
  const line = realize(pk);
  const res = verifyLine(line, VERIFY);
  results.push(res);
  for (const p of res.problems) fail(pk.n, p);
  // the real line still poses the slot's task and fits the slot
  const c = classify(line.fen, ex);
  const difficulty = analyzeLine(line, ex, { learner: 'w' });
  const learnerMoves = line.moves.filter((m) => m.side === 'w').length;
  if (!c || c.task !== slot.task) fail(pk.n, `the real position is classified ${c?.task ?? 'as no task'}, the slot asks for ${slot.task}`);
  else if (!B.matches(slot, { ...c, fen: line.fen, learnerMoves, difficulty })) fail(pk.n, 'the real line does not fit the slot');
  if (c && line.moves[c.reply ? 1 : 0].san !== c.first) fail(pk.n, `the line's first learner move ${line.moves[c.reply ? 1 : 0].san} is not the task's ${c.first}`);
  const notes = explainLine(line, ex, { learner: 'w' });
  if (!notes.every((e) => e.alsoMatches)) fail(pk.n, '[%also] differs from the explainer\'s equal moves');
  // the tempting mistake the first note shows, the one the slot is about: for protect and push the move that
  // takes the opposition (it only draws, or is slower: the solver's verdict, and the board shows the
  // opposition); where the slot's point is a premature push or a step that hands Black the opposition, that
  // trap; else the explainer's natural alternative
  const firstIdx = c?.reply ? 1 : 0, firstFen = line.moves[firstIdx].fenBefore;
  let mistake = null;
  if (c && (slot.task === 'protect' || slot.task === 'push')) {
    const san = c.contrast[0], e = ex.explainMove(firstFen, san);
    if (e.kind === 'slower') mistake = `${san}?! — Taking the opposition is ${Math.ceil(e.delta / 2)} ${Math.ceil(e.delta / 2) === 1 ? 'move' : 'moves'} slower.`;
    else if (e.kind === 'draws') mistake = `${san}? — Taking the opposition only draws here.${e.reply ? ` Black answers ${e.reply}.` : ''}`;
    else fail(pk.n, `the contrast ${san} neither draws nor is slower (${e.kind})`);
  } else if (c && (slot.constraints.trapIsPush || slot.constraints.trapGivesOpposition)) {
    const want = (san) => (slot.constraints.trapIsPush ? new Chess(firstFen).move(san).piece === 'p' : ex.explainMove(firstFen, san).facts[0] === 'opposition');
    const san = c.traps.find(want);
    if (!san) fail(pk.n, 'the slot\'s tempting mistake is not among the first move\'s traps');
    else mistake = ex.explainMove(firstFen, san).text;
  }
  // retake: what the intro may say about Black having to move (the solver's zugzwang)
  const zz = c?.task === 'retake' ? ex.zugzwang(line.fen, 'w') : null;
  let k = 0;
  lines.push({
    n: pk.n, phase: pk.phase, task: slot.task, help: slot.help, feedback: slot.feedback, fen: line.fen, mirror: pk.mirror,
    classified: c && { shape: c.shape, orientation: c.orientation, givesWay: !!c.givesWay, defender: c.defender, traps: c.traps, trapGivesOpposition: c.trapGivesOpposition, trapIsPush: c.trapIsPush, contrast: c.contrast ?? [], also: c.also ?? [] },
    zugzwang: zz, mistake,
    difficulty: { label: difficulty.label, score: difficulty.score, sortScore: difficulty.sortScore, signals: difficulty.signals },
    moves: line.moves.map((m) => {
      if (m.side !== 'w') return m;
      const e = notes[k++];
      // the tempting moves here (likely ones) that let the result go: the red arrows of the marks
      const plausible = ex.plausible(m.fenBefore) ?? [];
      const traps = ex.outcomes(m.fenBefore).moves.filter((x) => (x.kind === 'draws' || x.kind === 'loses') && plausible.includes(x.san))
        .map((x) => { const mv = new Chess(m.fenBefore).move(x.san); return { san: x.san, from: mv.from, to: mv.to, kind: x.kind }; });
      return { ...m, unique: !m.also.length, traps, note: { text: e.text, mark: e.mark, kind: e.kind, mode: e.mode, important: e.important, facts: e.facts, review: e.review, equal: e.equal, concept: e.parts.concept, cue: e.parts.notice, alternative: e.parts.alternative } };
    }),
  });
}

// the progression of the whole course, on the real lines' difficulty
const items = lines.map((l) => {
  const s = B.SLOTS[l.n - 1];
  return { id: l.n, stage: s.purpose, concepts: s.concepts, hints: s.help, difficulty: l.difficulty, variety: pattern(l.fen) };
});
for (const p of createProgression().checkSequence(items, { tolerance: TOLERANCE })) problems.push(`progression: ${p}`);

for (const p of problems) console.log('PROBLEM', p);
const st = summary(results);
const withAlso = lines.flatMap((l) => l.moves.filter((m) => m.side === 'w' && m.also.length)).length;
console.log(`build: verified ${lines.length} lines, ${st.learnerMoves} learner moves: ${st.unique} unique (${st.pct}%), ${withAlso} with [%also]; problems: ${problems.length}`);
if (problems.length) {
  console.error(`build: ${problems.length} problem(s) found, the course was not written`);
  process.exit(1);
}
fs.writeFileSync(path.join(__dirname, '.out/lines.json'), JSON.stringify(lines, null, 1));
