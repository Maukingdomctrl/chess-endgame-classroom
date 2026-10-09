// Runs the teaching and difficulty layers over the built-in courses and reports what they find: difficulty
// per line and per lesson, how many important moves have a grounded explanation, what is flagged for
// review, whether every [%also] matches the equal moves, and how long it took. It only reads the courses;
// no PGN is changed.
//
//   npm run teach:report                    # every course
//   npm run teach:report -- kpk ladder      # some of them
//   npm run teach:report -- kpk --lines     # also print every line's first-move explanation
//
// The full analysis (every explanation) goes to tools/course-kit/teach/.out/<course>.json.
const fs = require('fs');
const path = require('path');
const { readPgn } = require('../pgn.cjs');
const { createExplainer } = require('./explain.cjs');
const { analyzeLine } = require('./analyze.cjs');
const { BANDS } = require('./difficulty.cjs');
const solver = require('../solver.cjs');
const pawnDomain = require('../pawn/domain.cjs');

const APP = path.join(__dirname, '../../..');
const COURSES = {
  // the King & Pawn course checks its lines with its own engine (some start with Black's move, some defend)
  kpk: { pgn: 'courses/king-and-pawn-course.pgn', verify: { goal: 'promotion', probe: solver.probe }, correctness: false },
  basics: { pgn: 'courses/endgame-basics-course.pgn', verify: () => require('../../basics-course/verify-opts.cjs') },
  ladder: { pgn: 'courses/ladder-mate-course.pgn', verify: () => require('../../ladder-course/verify-opts.cjs') },
  pawns: { pgn: 'courses/connected-pawns-course.pgn', verify: () => require('../../pawns-course/verify-opts.cjs') },
};

const args = process.argv.slice(2);
const names = args.filter((a) => !a.startsWith('--'));
const showLines = args.includes('--lines');
const unknown = names.filter((x) => !COURSES[x]);
if (unknown.length) { console.error(`unknown course(s): ${unknown.join(', ')} (known: ${Object.keys(COURSES).join(', ')})`); process.exit(2); }
const OUT = path.join(__dirname, '.out');
fs.mkdirSync(OUT, { recursive: true });

const lessonOf = (name) => name.replace(/ \(\d+\/\d+\)$/, '');
const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : '-');
let bad = 0;
for (const name of names.length ? names : Object.keys(COURSES)) {
  const c = COURSES[name];
  const verify = typeof c.verify === 'function' ? c.verify() : c.verify;
  const ex = createExplainer({ verify, domain: pawnDomain }); // pawn facts only in pawn endings; elsewhere the solver alone
  const games = readPgn(fs.readFileSync(path.join(APP, c.pgn), 'utf8'));
  const t0 = Date.now();
  const lines = games.map((gm) => {
    const t = Date.now();
    const a = analyzeLine({ fen: gm.tags.FEN, moves: gm.moves }, { ex, verify, learner: 'w', correctness: c.correctness !== false });
    return { name: gm.tags.LineName, lesson: lessonOf(gm.tags.LineName), ms: Date.now() - t, ...a };
  });
  const ms = Date.now() - t0;
  const sum = (f) => lines.reduce((s, l) => s + f(l), 0);
  const important = sum((l) => l.teaching.important), grounded = sum((l) => l.teaching.grounded);
  const review = lines.flatMap((l) => l.teaching.review.map((r) => `${l.name}: ${r}`));
  const tooLong = review.filter((r) => /too long/.test(r));
  const wrong = lines.filter((l) => l.correctness.ok === false || !l.teaching.alsoMatches);
  bad += wrong.length + tooLong.length;
  console.log(`\n== ${name}: ${lines.length} lines, ${sum((l) => l.teaching.learnerMoves)} learner moves, ${ms} ms (${Math.round(ms / lines.length)} ms per line)`);
  console.log(`   ${c.correctness === false ? '(lines checked by the course itself) ' : 'verify.cjs and '}[%also] = equal moves: ${lines.length - wrong.length}/${lines.length}${wrong.length ? `  PROBLEMS: ${wrong.map((l) => `${l.name} ${l.explanations.filter((e) => !e.alsoMatches).map((e) => `${e.san}: also ${e.equal.join(',') || '-'}`).join(' ')}`).join('; ')}` : ''}`);
  console.log(`   important moves (a likely move lets the result go): ${important}, with a grounded reason: ${grounded} (${pct(grounded, important)}), flagged for review: ${review.length - tooLong.length}, too long: ${tooLong.length}`);
  console.log(`   labels: ${BANDS.map(([, l]) => `${l} ${lines.filter((x) => x.difficulty.label === l).length}`).join(', ')}`);
  const lessons = [...new Set(lines.map((l) => l.lesson))];
  for (const ls of lessons) {
    const own = lines.filter((l) => l.lesson === ls);
    const scores = own.map((l) => l.difficulty.score);
    const purposes = [...new Set(own.flatMap((l) => l.purpose))];
    console.log(`   ${ls.padEnd(52).slice(0, 52)} ${String(own.length).padStart(3)} lines  score ${Math.min(...scores)}-${Math.max(...scores)} (mean ${Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)})  ${purposes.join(' ')}`);
  }
  if (showLines) for (const l of lines) console.log(`   ${l.name}: ${l.difficulty.score} ${l.difficulty.label} [${l.difficulty.why.join(', ')}]  ${l.explanations[0].text}`);
  for (const r of tooLong) console.log(`   TOO LONG ${r}`);
  fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(lines, null, 1));
}
process.exit(bad ? 1 : 0);
