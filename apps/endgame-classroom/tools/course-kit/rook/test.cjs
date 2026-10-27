// Unit tests of the rook-endings domain (npm run kit:test, a second): the facts on positions checked by hand,
// both colours and both wings, the skewer tried on the board (a protected rook is not won), and the phrases'
// length. No tables: the facts are read from the board. Fails loudly (exit code 1).
'use strict';
const D = require('./domain.cjs');

let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failures++; };
const ids = (fen) => D.facts(fen).map((f) => f.id).sort().join(',');
const has = (fen, want, msg) => { const got = ids(fen); check(got === [...want].sort().join(','), `${msg}: ${got || 'none'}`); };

// ---- K+R+P vs K+R, White's pawn (the Lucena, the skewer) ----
has('1K1k4/1P6/8/8/2R5/8/r7/8 w - - 0 1', ['cutOff', 'bridge', 'rookFar'],
  'Lucena: the rook on c4 cuts the king off and stands on the 4th rank, the black rook far below (it can still check: Ra8+)');
has('1K1k4/1P6/8/2R5/8/8/r7/8 w - - 0 1', ['cutOff', 'rookFar'], 'the rook on the 5th rank: cut-off, but no bridge yet');
has('1K6/1P1k4/8/8/R7/8/8/r7 w - - 0 1', ['bridge', 'noChecks'],
  'Black has no rook check (Ra4 blocks the a-file, the pawn the b-file); no cut-off; the far rook hangs (Rxa1): no rookFar');
has('1K6/1P1k4/8/8/R7/8/8/r7 b - - 0 1', ['bridge', 'rookFar', 'noChecks'], 'the same with Black to move: the rook far away does not hang');
has('1K6/1P1k4/8/8/3R4/8/8/1r6 b - - 0 1', ['bridge', 'rookFar'], 'no "no checks" while Black is in check (Rd4+): it has to answer the check first');
has('r7/8/8/3P4/3k4/8/7R/7K w - - 0 1', [], 'the black king behind the pawn (d4, pawn d5) is not in front of it');
has('7R/P4k2/r7/8/8/8/1K6/8 b - - 0 1', ['skewerTrap'], 'the skewer trap: Black to move, Rxa7 is met by a check on the 7th rank');

// ---- the Lucena's steps: the check that cuts the king off, the king out, the rook shielding it ----
has('3K1k2/3P4/8/8/5R2/2r5/8/8 b - - 0 1', ['bridge', 'drive', 'rookFar'], 'Rf4+: every king move (Kg7, Kg8) leaves the black king cut off');
has('3K4/3P1k2/8/8/5R2/2r5/8/8 b - - 0 1', ['bridge', 'rookFar'], 'not a drive when the king can step to the pawn\'s side (Ke6)');
has('8/3PK1k1/8/8/5R2/2r5/8/8 b - - 0 1', ['cutOff', 'kingOut', 'rookFar'], 'Ke7: the king out of the queening square, next to the pawn');
has('6k1/3P4/2K5/8/2R5/3r4/8/8 b - - 0 1', ['kingOut', 'shield', 'rookFar'], 'Rc4: the rook below the king on the c-file shields it');
has('3K2k1/3P4/8/8/3R4/2r5/8/8 b - - 0 1', ['rookFar'], 'no bridge and no shield with the rook behind its own pawn on the pawn\'s file');
const shield = D.facts('6k1/3P4/2K5/8/2R5/3r4/8/8 b - - 0 1').find((f) => f.id === 'shield');
check(shield?.file === 'c' && D.phrases.gain.shield({ ...shield, move: { piece: 'r' } }) === 'Shield your king: the rook blocks checks on the c-file.' &&
  D.phrases.gain.shield({ ...shield, move: { piece: 'k' } }) === 'Your king steps behind the rook: no checks on the c-file.', `the shield names its file (${shield?.file}), said for the rook's move and the king's`);
check(D.phrases.gain.bridge({ move: { piece: 'r' } }) && D.phrases.gain.bridge({ move: { piece: 'k' } }) === null, 'the bridge is said of a rook move only');

// ---- plausible moves: not those that hang the rook, no knight or bishop promotion ----
const pl = D.plausible('R7/P4k2/8/8/8/r7/8/1K6 w - - 0 1');
check(pl.includes('Rh8') && pl.includes('Rb8') && pl.includes('Kc2') && !pl.includes('Rg8') && !pl.includes('Rf8+') && !pl.includes('Re8'),
  `plausible: Rh8, Rb8 and king moves; not Rg8, Rf8+ or Re8 (the king takes the rook): ${pl.join(' ')}`);
const promo = D.plausible('8/KP6/8/3k4/8/8/6r1/7R w - - 0 1');
check(promo.includes('b8=Q') && promo.includes('b8=R') && !promo.some((m) => /=[NB]/.test(m)), `plausible: a queen or a rook, no knight or bishop (${promo.filter((m) => m.includes('=')).join(' ')})`);
const trap = D.facts('7R/P4k2/r7/8/8/8/1K6/8 b - - 0 1').find((f) => f.id === 'skewerTrap');
check(trap?.take === 'Rxa7' && trap?.check === 'Rh7+' && trap.side === 'w', `the trap names the capture and the check (${trap?.take} ${trap?.check})`);
const mirrored = D.facts('R7/2k4P/7r/8/8/8/6K1/8 b - - 0 1').find((f) => f.id === 'skewerTrap');
check(mirrored?.take === 'Rxh7' && mirrored?.check === 'Ra7+', `the same on the other wing (${mirrored?.take} ${mirrored?.check})`);

// ---- the skewer itself, also once the pawn is gone ----
has('8/r4k1R/8/8/8/8/1K6/8 b - - 0 1', ['skewer'], 'the skewer: Rh7+ with the black rook behind its king on the 7th rank');
check(D.facts('8/r4k1R/8/8/8/8/1K6/8 b - - 0 1')[0]?.side === 'w', 'the skewer helps the side that checks');
has('8/rk5R/8/8/8/8/1K6/8 b - - 0 1', [], 'no skewer when the king can stay next to its rook (Ka6, Ka8, Kb6, Kb8 protect it)');
has('8/R4K1r/8/8/8/8/1k6/8 w - - 0 1', ['skewer'], 'the colours swapped: Rh7 checks White\'s king with White\'s rook behind it');
check(D.facts('8/R4K1r/8/8/8/8/1k6/8 w - - 0 1')[0]?.side === 'b', 'that skewer is Black\'s fact');

// ---- K+R vs K+R+P, Black's pawn (the Philidor: White defends) ----
has('3r4/8/R7/8/1k6/2p5/8/1K6 b - - 0 1', ['rookFar'], 'Philidor: Ra6 stands two ranks beyond the black king, ready to check from behind');
has('3r4/8/8/R7/1k6/2p5/8/1K6 b - - 0 1', [], 'Ra5 is only one rank beyond: not far');
has('r7/8/R7/8/1k6/2p5/8/1K6 b - - 0 1', [], 'Ra6 is far, but Black\'s rook on a8 takes it: no rookFar');
has('r7/8/8/8/3k4/2p5/7R/2K5 b - - 0 1', ['kingFront'], 'White\'s king on c1 in front of the c-pawn');
check(D.facts('r7/8/8/8/3k4/2p5/7R/2K5 b - - 0 1')[0]?.side === 'w', 'the king in front helps the defender (White)');
has('8/8/8/8/2k5/1rp5/8/K6R w - - 0 1', ['cutOff'], 'Black\'s rook on b3 cuts White\'s king off from the pawn');

// ---- phrases: short, and the conversion's outcome said without "mate" ----
for (const kind of ['gain', 'keep', 'give', 'lose']) {
  for (const [id, f] of Object.entries(D.phrases[kind])) {
    const text = f({ take: 'Rxa7', check: 'Rh7+', file: 'c', move: { piece: 'r' } });
    check(text.split(/\s+/).length <= 12, `${kind}.${id} is at most 12 words: "${text}"`);
  }
}
const best = D.phrases.outcome.best;
check(best([0, 0], { promotion: 'q' }) === 'Promote: the win is safe.' && best([0, 0], { captured: 'r' }) === 'Take it: the win is safe.', 'the conversion move: promote, or take');
check(best([0, 2], {}) === 'The quickest way: 1 more move.' && best([0, 6], {}) === 'The quickest way: 3 more moves.', 'the quickest way: moves counted, one move singular');

console.log(failures ? `rook domain tests: ${failures} FAILED` : 'rook domain tests: all passed');
process.exit(failures ? 1 : 0);
