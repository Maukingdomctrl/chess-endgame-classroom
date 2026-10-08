// Converts the picked lines into real FENs + SAN with chess.js (every second line of a lesson mirrored,
// files a <-> h) and checks every move a second time, on the real FEN, with chess.js and the exact solver
// (../course-kit/verify.cjs, measured to the promotion): every learner move is a fastest way to a safe
// promotion, its [%also] list is exactly the other equally fast moves, every opponent move is the most
// stubborn defence, and the line ends in a safe promotion. Any problem stops the build.
const fs = require('fs');
const path = require('path');
const { realize } = require('../course-kit/pawn/realize.cjs');
const VERIFY = require('./verify-opts.cjs');
const picked = require('./.out/picked.json');

const { lines, problems, stats } = realize(picked, VERIFY);
for (const p of problems) console.log('PROBLEM', p);
console.log(`verified ${lines.length} lines, ${stats.learnerMoves} learner moves: ${stats.unique} unique (${stats.pct}%), ${stats.withAlso} with [%also] alternatives; problems: ${problems.length}`);
for (const l of lines) console.log(`${l.group.padEnd(10)} ${l.fen.padEnd(30)} ${l.moves.map((m) => (m.also.length ? `${m.san}[${m.also.join(',')}]` : m.san)).join(' ')}`);
if (problems.length) {
  console.error(`build: ${problems.length} problem(s) found, the course was not written`);
  process.exit(1);
}
fs.writeFileSync(path.join(__dirname, '.out/lines.json'), JSON.stringify(lines, null, 1));
