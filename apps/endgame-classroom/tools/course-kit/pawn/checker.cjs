// Independent checker for a pawn course (White's pawns against the lone king, every line to a safe
// promotion). It re-checks the written PGN by another path than the one that made it: chess.js for the
// moves and the rules, the separate solver in oracle.cjs for every "fastest" and "most stubborn" claim,
// and its own safe-promotion rule. It never calls ../solver.cjs, ../verify.cjs or the line player.
//
//   node tools/course-kit/pawn/checker.cjs courses/connected-pawns-course.pgn [--lines path/to/lines.json]
//   const { problems, stats } = checkPgn(text, { lines })     // lines: the generator's lines.json (groups)
//
// It checks, for every line:
// - the tags, the start (a legal position: kings and White's pawns only, White to move), the moves (the
//   PGN read by chess.js gives the same moves as the course reader);
// - every learner move is a fastest way to the goal (the oracle's plies to a safe promotion), its [%also]
//   list is exactly the other equally fast moves; where the goal can be reached at once, the move reaches
//   it (a safe queen, a rook only where no safe queen exists, a mate wherever one exists);
// - every opponent move is a longest defence, and no opponent move escapes (draws);
// - no position of the line is stalemate, and the line ends in a safe queen or rook (or mate);
// - marks: valid [%csl]/[%cal]; no arrow on the squares of the move to play (the app hides it there);
// and for the course: no start position twice (mirror images alike), every line its own white king and
// pawns, and per generator group (with --lines) at most a third (two of a small group) on the same pair of
// files or with the same pattern (structure.cjs).
//
// One thing it takes on trust: among several moves that promote safely at once, which has the fastest
// mate afterwards (that needs mate tables; the generator ranks those with the toolkit solver).
const fs = require('fs');
const { Chess } = require('chess.js');
const { readPgn } = require('../pgn.cjs');
const oracle = require('./oracle.cjs');
const { safeByRule } = require('./promotion.cjs');
const { posKey, setupKey, shapeKey, wingKey } = require('./structure.cjs');

const INF = Infinity;
const sqIdx = (s) => (s.charCodeAt(1) - 49) * 8 + (s.charCodeAt(0) - 97);
/** Squares [wk, bk, ...pawns] of a FEN with kings and White's pawns only, or null. */
function squaresOf(fen) {
  const g = new Chess(fen);
  let wk = -1, bk = -1;
  const ps = [];
  for (const row of g.board()) for (const p of row) {
    if (!p) continue;
    if (p.type === 'k') { if (p.color === 'w') wk = sqIdx(p.square); else bk = sqIdx(p.square); } else if (p.type === 'p' && p.color === 'w') ps.push(sqIdx(p.square));
    else return null;
  }
  return [wk, bk, ...ps];
}
/** White's move from fen: plies to the goal it leads to (1 = the goal now), INF if it does not win. */
function whiteValue(fen, san) {
  const g = new Chess(fen);
  const m = g.move(san);
  if (g.isCheckmate()) return 1;
  if (m.promotion) return safeByRule(g, m) ? 1 : INF;
  if (g.isStalemate()) return INF;
  const s = squaresOf(g.fen());
  const d = s && s.length > 2 ? oracle.value(s, 1) : -1;
  return d < 0 ? INF : d + 1;
}
/** Black's move from fen: plies White still needs after it, INF if it draws. */
function blackValue(fen, san) {
  const g = new Chess(fen);
  g.move(san);
  const s = squaresOf(g.fen());
  if (!s || s.length === 2) return INF; // no pawn left: a draw
  const d = oracle.value(s, 0);
  return d < 0 ? INF : d;
}

function checkGames(games, opts = {}) {
  const problems = [];
  const fail = (name, msg) => problems.push(`${name}: ${msg}`);
  let learnerMoves = 0, unique = 0, withAlso = 0;
  const starts = new Map(), setups = new Map();
  games.forEach((gm, gi) => {
    const name = gm.tags.LineName ?? `game ${gi + 1}`;
    if (gm.tags.Event !== name || !/^\d\d\. .+ \(\d+\/\d+\)$/.test(name)) fail(name, 'bad LineName/Event');
    if (gm.tags.SetUp !== '1' || !gm.tags.FEN || !gm.tags.LineDescription) fail(name, 'missing tags');
    const fen = gm.tags.FEN;
    let g;
    try { g = new Chess(fen); } catch (e) { fail(name, `bad FEN ${fen}: ${e.message}`); return; }
    const s0 = squaresOf(fen);
    if (!s0 || s0.length < 3 || s0.length > 4 || g.turn() !== 'w') { fail(name, `not a start this checker covers (White to move, kings and one or two white pawns): ${fen}`); return; }
    if (!oracle.legal(s0[0], s0[1], s0.slice(2), 0)) { fail(name, `illegal start ${fen}`); return; }
    // the PGN read by chess.js must give the same moves
    if (gm.text) {
      const c = new Chess();
      try { c.loadPgn(gm.text); } catch (e) { fail(name, `chess.js cannot read the game: ${e.message}`); }
      const sans = c.history();
      if (sans.join(' ') !== gm.moves.map((m) => m.san).join(' ')) fail(name, `chess.js reads other moves: ${sans.join(' ')}`);
    }
    // the course: no start twice, every line its own white king and pawns (mirror images alike)
    const pk = posKey(s0.length === 4 ? s0 : [...s0, -1]);
    if (starts.has(pk)) fail(name, `the same start as ${starts.get(pk)}`); else starts.set(pk, name);
    if (s0.length === 4) { const sk = setupKey(s0); if (setups.has(sk)) fail(name, `the same white king and pawns as ${setups.get(sk)}`); else setups.set(sk, name); }

    const comments = [gm.intro, ...gm.moves.map((m) => m.comment)];
    let played = null;
    gm.moves.forEach((m, i) => {
      const before = g.fen();
      if (g.isStalemate()) fail(name, `stalemate before ${m.san}: ${before}`);
      const legal = g.moves();
      if (!legal.includes(m.san)) { fail(name, `illegal move ${m.san} in ${before}`); return; }
      if (g.turn() === 'w') {
        learnerMoves++;
        const vals = legal.map((san) => ({ san, v: whiteValue(before, san) }));
        const best = Math.min(...vals.map((x) => x.v));
        const mine = vals.find((x) => x.san === m.san).v;
        if (best === INF) fail(name, `no winning move in ${before}`);
        else if (best === 1) {
          // the goal at once: the move reaches it; a mate where there is one; a rook only where no safe queen exists
          const now = vals.filter((x) => x.v === 1).map((x) => x.san);
          if (mine !== 1) fail(name, `${m.san} does not promote safely (or mate) although that is possible now (${now.join(',')})`);
          if (now.some((x) => x.endsWith('#')) && !m.san.endsWith('#')) fail(name, `${m.san} misses the mate (${now.filter((x) => x.endsWith('#')).join(',')})`);
          if (/=R/.test(m.san) && now.some((x) => /=Q/.test(x))) fail(name, `${m.san}: a safe queen was possible (${now.filter((x) => /=Q/.test(x)).join(',')})`);
          for (const a of m.also ?? []) if (!now.includes(a)) fail(name, `[%also] ${a} does not reach the goal now`);
          if (!(m.also ?? []).length) unique++;
        } else {
          const fastest = vals.filter((x) => x.v === best).map((x) => x.san);
          if (mine !== best) fail(name, `${m.san} is not a fastest move (${mine === INF ? 'it does not win' : `${mine} plies`}; fastest ${fastest.join(',')} in ${best})`);
          const also = m.also ?? [];
          const want = fastest.filter((x) => x !== m.san);
          if (also.slice().sort().join() !== want.slice().sort().join()) fail(name, `[%also] for ${m.san} is ${also.join(',') || 'empty'}, the equally fast moves are ${want.join(',') || 'none'}`);
          if (fastest.length === 1) unique++;
        }
        if ((m.also ?? []).length) withAlso++;
        // marks shown before this move: no arrow on its squares (the app draws the move there and hides the mark)
        const move = new Chess(before).move(m.san);
        for (const [, args] of (comments[i] ?? '').matchAll(/\[%cal ([^\]]*)\]/g)) {
          for (const a of args.split(',')) if (a.slice(1) === `${move.from}${move.to}`) fail(name, `the arrow ${a} lies on the move to play (${m.san}): the app does not show it`);
        }
      } else {
        const vals = legal.map((san) => ({ san, v: blackValue(before, san) }));
        const escapes = vals.filter((x) => x.v === INF);
        if (escapes.length) fail(name, `the opponent can escape in ${before} (${escapes.map((x) => x.san).join(',')})`);
        const longest = Math.max(...vals.map((x) => x.v));
        if (vals.find((x) => x.san === m.san).v !== longest) fail(name, `${m.san} is not the most stubborn defence in ${before}`);
        if (m.also?.length) fail(name, `[%also] on a move of the opponent`);
      }
      played = g.move(m.san);
    });
    if (!played || played.color !== 'w' || !(g.isCheckmate() || (played.promotion && safeByRule(g, played)))) fail(name, `does not end in a safe promotion (or mate): ${g.fen()}`);
    for (const c of comments) for (const [, cmd, args] of (c ?? '').matchAll(/\[%(\w+) ([^\]]*)\]/g)) {
      const ok = cmd === 'csl' ? /^[GRBY][a-h][1-8](,[GRBY][a-h][1-8])*$/.test(args) : cmd === 'cal' ? /^[GRBY][a-h][1-8][a-h][1-8](,[GRBY][a-h][1-8][a-h][1-8])*$/.test(args) : cmd === 'also';
      if (!ok) fail(name, `bad mark [%${cmd} ${args}]`);
    }
  });
  // per generator group: the pairs of files and the patterns are varied (the generator's promise)
  if (opts.lines) {
    if (opts.lines.length !== games.length) problems.push(`lines.json has ${opts.lines.length} lines, the PGN ${games.length}`);
    const groups = new Map();
    opts.lines.forEach((l, i) => {
      const s = squaresOf(l.fen);
      if (l.fen !== games[i]?.tags.FEN) problems.push(`line ${i + 1}: lines.json and the PGN start differently`);
      if (s?.length === 4) { if (!groups.has(l.group)) groups.set(l.group, []); groups.get(l.group).push(s); }
    });
    for (const [group, list] of groups) {
      const cap = opts.share ? opts.share(list.length) : Math.max(2, Math.ceil(list.length / 3));
      for (const [label, key] of [['pair of files', wingKey], ['pattern', shapeKey]]) {
        const counts = new Map();
        for (const s of list) counts.set(key(s), (counts.get(key(s)) ?? 0) + 1);
        for (const [k, c] of counts) if (c > cap) problems.push(`group ${group}: ${c} of ${list.length} lines with the same ${label} (${k}), at most ${cap}`);
      }
    }
  }
  return { problems, stats: { lines: games.length, learnerMoves, unique, pct: learnerMoves ? Math.round((100 * unique) / learnerMoves) : 0, withAlso } };
}

/** Checks a PGN text (every game also read by chess.js). */
function checkPgn(text, opts = {}) {
  const games = readPgn(text);
  const texts = text.split(/\n\n(?=\[Event )/);
  games.forEach((g, i) => { g.text = texts[i]; });
  return checkGames(games, opts);
}

module.exports = { checkPgn, checkGames, whiteValue, blackValue, squaresOf };

if (require.main === module) {
  const file = process.argv[2];
  if (!file) { console.error('usage: node tools/course-kit/pawn/checker.cjs <course.pgn> [--lines lines.json]'); process.exit(2); }
  const li = process.argv.indexOf('--lines');
  const lines = li > 0 ? JSON.parse(fs.readFileSync(process.argv[li + 1], 'utf8')) : undefined;
  const t0 = Date.now();
  const { problems, stats } = checkPgn(fs.readFileSync(file, 'utf8'), { lines });
  for (const p of problems) console.log('PROBLEM', p);
  console.log(`independent check of ${file}: ${stats.lines} lines, ${stats.learnerMoves} learner moves, ${stats.unique} unique (${stats.pct}%), ${stats.withAlso} with [%also]; problems: ${problems.length} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  process.exit(problems.length ? 1 : 0);
}
