// Tests a built-in course in a real browser (Chromium via Playwright), like a learner would.
//
//   npm run course:e2e -- endgame-basics-first-principles          # from apps/endgame-classroom
//   npm run course:e2e -- endgame-basics-first-principles --all    # play every line, not a selection
//
// It starts the app's dev server itself, then checks:
//   - a fresh device lists the course (★ Built-in), and a device that never had it gets it on the next start;
//   - Learn: lines played to the end by clicking the board (the first line of every lesson, every line with
//     a promotion - chosen in the promotion picker - and a line with an [%also] move), with the board marks
//     drawn where the PGN has them (and none where it has none), and the line's takeaway shown at the end;
//   - Practice: an [%also] move is accepted as "good too" without counting a mistake ("Perfect");
//   - no console errors or warnings.
// Needs Playwright (npm i -D playwright, or a global install) and a Chromium: set CHROMIUM_PATH, or let
// Playwright use its own (npx playwright install chromium).
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { Chess } = require('chess.js');

const APP = path.join(__dirname, '../..');
const KEY = 'endgame-classroom.courses.v1', OFFERED = 'endgame-classroom.builtins.v1';
const ARROW = { G: '30, 150, 95', R: '200, 50, 50', Y: '230, 170, 20', B: '50, 110, 220' };
const GLYPH = { q: '♕', r: '♖', b: '♗', n: '♘' };

function loadPlaywright() {
  try { return require('playwright'); } catch { /* not installed locally */ }
  try { return require(path.join(execSync('npm root -g').toString().trim(), 'playwright')); } catch { /* nor globally */ }
  console.error('Playwright is not installed: npm i -D playwright (or npm i -g playwright), then npx playwright install chromium');
  process.exit(2);
}

(async () => {
  const id = process.argv[2];
  if (!id || id.startsWith('--')) { console.error('usage: npm run course:e2e -- <builtin course id> [--all]'); process.exit(2); }
  const all = process.argv.includes('--all');
  const { chromium } = loadPlaywright();
  const { createServer } = await import('vite');
  const server = await createServer({ root: APP, logLevel: 'error', server: { port: 0 } });
  await server.listen();
  const BASE = server.resolvedUrls.local[0];
  const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  let failures = 0;
  const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) failures++; };
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    const errors = [];
    page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errors.push(`${m.type()}: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    const courses = () => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '[]'), KEY);

    // ---- the course appears on a fresh device, and on a device that never had it ----
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    let course = (await courses()).find((c) => c.builtinId === id);
    check(!!course, `fresh device: the course "${id}" is installed`);
    if (!course) throw new Error('course not found: is it registered in src/lib/builtinCourses.ts?');
    await page.goto(`${BASE}#/section/${course.category}`);
    await page.waitForSelector('article.card h2');
    const card = page.locator('article.card', { hasText: course.name });
    check((await card.count()) === 1 && (await card.locator('.builtin-chip').count()) === 1, `"${course.name}" is listed in ${course.category}, marked ★ Built-in`);
    await page.evaluate(([k, o, b]) => {
      localStorage.setItem(k, JSON.stringify(JSON.parse(localStorage.getItem(k)).filter((c) => c.builtinId !== b)));
      localStorage.setItem(o, JSON.stringify(JSON.parse(localStorage.getItem(o) ?? '[]').filter((x) => x !== b)));
    }, [KEY, OFFERED, id]);
    await page.reload();
    await page.waitForSelector('article.card h2');
    course = (await courses()).find((c) => c.builtinId === id);
    check(!!course, 'a device that did not have the course gets it on the next start');

    // ---- which lines to play ----
    const learner = course.playAs === 'black' ? 'b' : 'w'; // a line may start with the opponent's move
    const lessonOf = (l) => l.name.slice(0, 3);
    const learnerMoves = (l) => { const g = new Chess(l.startFen); return l.moves.filter((m) => { const mine = g.turn() === learner; g.move(m.san); return mine; }); };
    const alsoLine = course.lines.findIndex((l) => learnerMoves(l).some((m) => m.also?.length));
    const pick = course.lines.map((l, i) => i).filter((i) => all ||
      i === course.lines.findIndex((l) => lessonOf(l) === lessonOf(course.lines[i])) ||
      course.lines[i].moves.some((m) => m.san.includes('=')) || i === alsoLine);

    const tinted = () => page.locator('[data-square]').evaluateAll((els) =>
      els.filter((e) => [e, ...e.querySelectorAll('*')].some((x) => /linear-gradient/.test(x.ownerDocument.defaultView.getComputedStyle(x).backgroundImage))).length);
    const arrows = (rgb) => page.locator(`svg [stroke*="${rgb}"]`).count();

    async function play(i, mode, onLearnerMove) {
      const line = course.lines[i];
      await page.goto(`${BASE}#/course/${course.id}/${mode}?line=${line.id}`);
      await page.waitForSelector('[data-square="e4"]');
      await page.waitForTimeout(300);
      const g = new Chess(line.startFen);
      const moves = line.moves.map((m) => g.move(m.san));
      if (mode === 'learn') {
        const want = line.introMarks?.squares?.length ?? 0;
        const got = await tinted();
        const arrowsOk = await Promise.all((line.introMarks?.arrows ?? []).map(async (a) => (await arrows(ARROW[a.color])) > 0));
        check(got === want && arrowsOk.every(Boolean), `  marks at the start: ${got} coloured squares (PGN: ${want}), ${arrowsOk.length} arrow(s) drawn`);
      }
      for (let k = 0; k < moves.length; k++) {
        const mv = moves[k];
        if (mv.color !== learner) {
          await page.waitForSelector(`[data-square="${mv.to}"] [data-piece="${mv.color}${mv.piece.toUpperCase()}"]`, { timeout: 5000 });
          continue;
        }
        await page.waitForTimeout(150);
        if (onLearnerMove) await onLearnerMove(k, line);
        await page.click(`[data-square="${mv.from}"]`);
        await page.click(`[data-square="${mv.to}"]`);
        if (mv.promotion) {
          await page.waitForSelector('.promo-piece');
          await page.locator('.promo-piece', { hasText: GLYPH[mv.promotion] }).click();
        }
        await page.waitForSelector(`[data-square="${mv.to}"] [data-piece="${mv.color}${(mv.promotion ?? mv.piece).toUpperCase()}"]`, { timeout: 5000 });
      }
      await page.waitForSelector('.done-actions .next-btn', { timeout: 5000 });
      return { line, moves, bubble: await page.locator('.bubble').innerText() };
    }

    // ---- Learn ----
    for (const i of pick) {
      const r = await play(i, 'learn');
      const promos = r.moves.filter((m) => m.promotion).map((m) => m.san);
      check(r.bubble.includes('Well done!') && r.bubble.includes(r.line.description),
        `Learn: "${r.line.name}" played to the end (${r.line.moves.length} ${r.line.moves.length === 1 ? 'ply' : 'plies'}${promos.length ? `, promotion in the picker: ${promos.join(', ')}` : ''})`);
    }

    // ---- Practice: an [%also] move is not a mistake ----
    if (alsoLine >= 0) {
      let said = '';
      const r = await play(alsoLine, 'practice', async (k, line) => {
        const alt = line.moves[k].also?.[0];
        if (!alt || said) return;
        const g = new Chess(line.startFen);
        for (let j = 0; j < k; j++) g.move(line.moves[j].san);
        const am = g.move(alt);
        await page.click(`[data-square="${am.from}"]`);
        await page.click(`[data-square="${am.to}"]`);
        if (am.promotion) await page.locator('.promo-piece', { hasText: GLYPH[am.promotion] }).click();
        await page.waitForSelector('.bubble.good', { timeout: 3000 });
        said = (await page.locator('.bubble').innerText()).split('\n').find((t) => t.includes('good too')) ?? '';
      });
      check(said.includes('good too'), `Practice: the [%also] move gets "${said}"`);
      check(r.bubble.includes('Perfect'), `Practice: "${r.line.name}" finished without a mistake ("Perfect")`);
    } else console.log('(no line with an [%also] move: Practice check skipped)');

    check(errors.length === 0, `no console errors or warnings${errors.length ? `: ${errors.slice(0, 5).join(' | ')}` : ''}`);
  } catch (e) {
    check(false, `test stopped: ${e.message}`);
  } finally {
    await browser.close();
    await server.close();
  }
  console.log(failures ? `e2e: ${failures} FAILED` : 'e2e: all passed');
  process.exit(failures ? 1 : 0);
})();
