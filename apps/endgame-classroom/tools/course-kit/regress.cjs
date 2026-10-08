// Regression check for the built-in courses: regenerates them and checks that every PGN comes out byte for
// byte the same as the file in the working tree (what is committed, unless you changed it on purpose).
//
//   npm run kit:regress                      # every course
//   npm run kit:regress -- pawns ladder      # some of them
//   npm run kit:regress -- --twice           # also run each generator a second time (determinism)
//
// Exit code 1 if any course changed or a generator failed; the regenerated file stays in place, so
// `git diff courses/` shows what changed. Set KIT_CACHE to reuse solved tables (see cache.cjs).
// A new course: add it to COURSES.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const APP = path.join(__dirname, '../..');
const COURSES = [
  { name: 'kpk', script: 'course:kpk', pgn: 'courses/king-and-pawn-course.pgn' },
  { name: 'basics', script: 'course:basics', pgn: 'courses/endgame-basics-course.pgn' },
  { name: 'ladder', script: 'course:ladder', pgn: 'courses/ladder-mate-course.pgn' },
  { name: 'pawns', script: 'course:pawns', pgn: 'courses/connected-pawns-course.pgn' },
];
const sha1 = (file) => crypto.createHash('sha1').update(fs.readFileSync(path.join(APP, file))).digest('hex');

const args = process.argv.slice(2);
const twice = args.includes('--twice');
const names = args.filter((a) => !a.startsWith('--'));
const unknown = names.filter((x) => !COURSES.some((c) => c.name === x));
if (unknown.length) { console.error(`unknown course(s): ${unknown.join(', ')} (known: ${COURSES.map((c) => c.name).join(', ')})`); process.exit(2); }
let bad = 0;
for (const c of COURSES.filter((x) => !names.length || names.includes(x.name))) {
  const before = sha1(c.pgn);
  const runs = [];
  for (let k = 0; k < (twice ? 2 : 1); k++) {
    const t0 = Date.now();
    const r = spawnSync('npm', ['run', '--silent', c.script], { cwd: APP, encoding: 'utf8', shell: process.platform === 'win32' });
    if (r.status !== 0) { console.log(`FAIL  ${c.name}: npm run ${c.script} exited with ${r.status}\n${(r.stdout + r.stderr).split('\n').slice(-15).join('\n')}`); bad++; runs.length = 0; break; }
    runs.push({ sum: sha1(c.pgn), s: ((Date.now() - t0) / 1000).toFixed(0) });
  }
  if (!runs.length) continue;
  const same = runs.every((x) => x.sum === before);
  if (!same) bad++;
  console.log(`${same ? 'ok  ' : 'FAIL'}  ${c.name.padEnd(7)} ${c.pgn.padEnd(36)} ${same ? 'unchanged' : `CHANGED (${runs.map((x) => x.sum.slice(0, 8)).join(', ')} instead of ${before.slice(0, 8)})`}  ${runs.map((x) => `${x.s} s`).join(' + ')}  sha1 ${before.slice(0, 12)}`);
}
console.log(bad ? `regress: ${bad} course(s) FAILED` : 'regress: every course regenerates byte for byte');
process.exit(bad ? 1 : 0);
