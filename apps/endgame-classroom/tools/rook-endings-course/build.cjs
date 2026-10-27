// Turns the picked lines into the course's lines: lessons assigned, every other line of a lesson mirrored to the
// other wing (the tables store the pawn on files a-d), real FEN and SAN with chess.js, every line checked with
// ../course-kit/verify.cjs (a win to the conversion, a drawn start as a hold), and every learner move explained by
// the teaching layer with the rook-endings domain (../course-kit/rook/domain.cjs), whose [%also] must be the
// explainer's equal moves. Fails loudly. Writes .out/lines.json.
'use strict';
const fs = require('fs');
const path = require('path');
const { Chess } = require('chess.js');
const solver = require('../course-kit/solver.cjs');
const { verifyLine, summary } = require('../course-kit/verify.cjs');
const { createExplainer } = require('../course-kit/teach/explain.cjs');
const { explainLine } = require('../course-kit/teach/analyze.cjs');
const domain = require('../course-kit/rook/domain.cjs');
const VERIFY = require('./verify-opts.cjs');
const { LESSONS } = require('./texts.cjs');

const picked = require('./.out/picked.json');
// a win is explained by the conversion measure; a draw to hold by the mate tables (as verify.cjs checks it)
const explainers = {
  win: createExplainer({ verify: { goal: 'conversion', probe: solver.probe }, domain }),
  hold: createExplainer({ verify: { goal: 'mate', probe: solver.probe }, domain }),
};
const problems = [];

const mirrorFen = (fen) => { const [b, ...rest] = fen.split(' '); return [b.split('/').map((r) => [...r].reverse().join('')).join('/'), ...rest].join(' '); };
const mirrorSquare = (s) => 'abcdefgh'[7 - (s.charCodeAt(0) - 97)] + s[1];

/** The line on the real board, mirrored if asked: every move with the positions around it. */
function realize(pk, mirror) {
  const fen = mirror ? mirrorFen(pk.fen) : pk.fen;
  const src = new Chess(pk.fen), g = new Chess(fen);
  const tr = (o) => (mirror ? { from: mirrorSquare(o.from), to: mirrorSquare(o.to), promotion: o.promotion } : { from: o.from, to: o.to, promotion: o.promotion });
  const moves = pk.moves.map((m) => {
    const fenBefore = g.fen();
    const also = m.also.map((a) => new Chess(fenBefore).move(tr(new Chess(src.fen()).move(a))).san);
    const r = g.move(tr(src.move(m.san)));
    return { san: r.san, side: r.color, piece: r.piece, from: r.from, to: r.to, promotion: r.promotion ?? '', captured: r.captured ?? '', check: r.san.includes('+'), also, fenBefore, fenAfter: g.fen() };
  });
  return { fen: new Chess(fen).fen(), moves };
}

// the lessons take their lines from the groups in the search's order (the clearest first)
const byGroup = {};
for (const pk of picked) (byGroup[pk.group] ??= []).push(pk);
const lines = [];
const results = [];
for (const L of LESSONS) {
  L.take.forEach(({ group, count }) => {
    const pool = byGroup[group] ?? [];
    if (pool.length < count) throw new Error(`lesson ${L.id}: ${count} lines of ${group} wanted, ${pool.length} left`);
    for (const pk of pool.splice(0, count)) {
      const i = lines.filter((l) => l.lesson === L.id).length;
      const line = realize(pk, i % 2 === 1); // every other line on the other wing
      const res = verifyLine(line, VERIFY);
      results.push(res);
      for (const p of res.problems) problems.push(`${L.id} ${line.fen}: ${p}`);
      const mode = pk.group === 'philidor' ? 'hold' : 'win';
      const notes = explainLine(line, explainers[mode], { learner: 'w' });
      if (!notes.every((e) => e.alsoMatches)) problems.push(`${L.id} ${line.fen}: [%also] differs from the explainer's equal moves`);
      let k = 0;
      lines.push({
        lesson: L.id, group: pk.group, pattern: pk.pattern, mode, fen: line.fen, mirror: i % 2 === 1,
        moves: line.moves.map((m) => {
          if (m.side !== 'w') return m;
          const e = notes[k++];
          return { ...m, note: { text: e.text, mark: e.mark, kind: e.kind, important: e.important, facts: e.facts, review: e.review, equal: e.equal, alternative: e.parts.alternative } };
        }),
      });
    }
  });
}
// the exam mixes the groups: one line of each in turn
const exam = lines.filter((l) => l.lesson === 'exam');
const mixed = [];
for (let k = 0; mixed.length < exam.length; k++) {
  for (const g of ['lucena', 'philidor', 'skewer']) { const l = exam.filter((x) => x.group === g)[k]; if (l) mixed.push(l); }
}
const out = [...lines.filter((l) => l.lesson !== 'exam'), ...mixed];

for (const p of problems) console.log('PROBLEM', p);
const st = summary(results);
const withAlso = out.flatMap((l) => l.moves.filter((m) => m.side === 'w' && m.also.length)).length;
console.log(`build: verified ${out.length} lines, ${st.learnerMoves} learner moves: ${st.unique} unique (${st.pct}%), ${withAlso} with [%also]; problems: ${problems.length}`);
if (problems.length) {
  console.error(`build: ${problems.length} problem(s) found, the course was not written`);
  process.exit(1);
}
fs.writeFileSync(path.join(__dirname, '.out/lines.json'), JSON.stringify(out, null, 1));
