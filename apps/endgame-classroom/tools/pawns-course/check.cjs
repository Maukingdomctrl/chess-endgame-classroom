// The independent check of the written course (../course-kit/pawn/checker.cjs): chess.js and a separate
// solver re-check every move, the ending, the marks and the variety per group. Any problem stops the run.
const fs = require('fs');
const path = require('path');
const { checkPgn } = require('../course-kit/pawn/checker.cjs');

const file = path.join(__dirname, '../../courses/connected-pawns-course.pgn');
const lines = require('./.out/lines.json');
const { problems, stats } = checkPgn(fs.readFileSync(file, 'utf8'), { lines });
for (const p of problems) console.log('PROBLEM', p);
console.log(`independent check: ${stats.lines} lines, ${stats.learnerMoves} learner moves, ${stats.unique} unique (${stats.pct}%); problems: ${problems.length}`);
if (problems.length) {
  console.error(`check: ${problems.length} problem(s) in the written course`);
  process.exit(1);
}
