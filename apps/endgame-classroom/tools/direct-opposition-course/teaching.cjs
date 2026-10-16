// Teaching written by hand (teaching.md): intros, notes, marks and takeaways for some lines, used by pgnout.cjs
// in place of the generated texts. The file is matched to the course by line name, start FEN and moves (a
// mismatch stops the build), and every claim a note makes that the board can show is checked against the
// line: the opposition and the square between the kings, "Black must give way" (the oracle's zugzwang),
// check, which king protects, guards or attacks what, in front of / ahead of / behind the pawn, the only
// move, the race to the promotion square, and the words course 1 does not use yet.
//
//   const teaching = require('./teaching.cjs');
//   const all = teaching.parse();                 // Map line name -> { fen, intro, introMarks, takeaway, moves }
//   teaching.problems(all.get(name), l)           // [] when the teaching fits line l (lines.json) and is true
const fs = require('fs');
const path = require('path');
const { Chess } = require('chess.js');
const oracle = require('../course-kit/pawn/oracle.cjs');
const { readable } = require('../course-kit/teach/explain.cjs');
const { squares, F, R, sqIdx } = require('./keys.cjs');
const { UNTAUGHT } = require('./texts.cjs');

const FILE = path.join(__dirname, 'teaching.md');
/** Words of later courses (texts.cjs UNTAUGHT), and two that hand-written notes bring in. */
const LATER = /tempo|odd number/i;
const TAKEAWAY = { sentences: 2, wordsPerSentence: 20, words: 20 };
/** A learner's turn shows the note on their move and on Black's reply together (Trainer.tsx). */
const TURN_WORDS = 24;

// ---------- reading teaching.md ----------
const COLOURS = { green: 'G', red: 'R', blue: 'B', yellow: 'Y' };
/** "green d6, e6; red f5; arrow red e4-f5" -> { squares: ['Gd6', 'Ge6', 'Rf5'], arrows: ['Re4f5'] } */
function parseMarks(text, where) {
  const out = { squares: [], arrows: [] };
  for (const part of text.split(';').map((s) => s.trim()).filter(Boolean)) {
    const m = part.match(/^(arrows? )?(green|red|blue|yellow) (.+)$/i);
    if (!m) throw new Error(`${where}: marks "${part}": a colour, then squares or arrows (green d6, e6; arrow red e4-f5)`);
    const c = COLOURS[m[2].toLowerCase()];
    for (const item of m[3].split(/,\s*|\s+and\s+/).map((s) => s.trim()).filter(Boolean)) {
      if (/^[a-h][1-8]-[a-h][1-8]$/.test(item)) out.arrows.push(`${c}${item.replace('-', '')}`);
      else if (!m[1] && /^[a-h][1-8]$/.test(item)) out.squares.push(`${c}${item}`);
      else throw new Error(`${where}: marks "${part}": "${item}" is not a square${m[1] ? ' pair (e4-f5)' : ''}`);
    }
  }
  return out;
}

/** The positions of teaching.md by line name. Theme lines are for the writer and are not read. */
function parse(text = fs.readFileSync(FILE, 'utf8')) {
  const all = new Map();
  let cur = null, move = null;
  text.split('\n').forEach((raw, k) => {
    const row = raw.trim(), where = `teaching.md:${k + 1}`;
    let m;
    if ((m = row.match(/^## Position \d+: (.+)$/))) {
      cur = { name: m[1].trim(), fen: null, intro: '', introMarks: null, takeaway: '', moves: [], where };
      if (all.has(cur.name)) throw new Error(`${where}: "${cur.name}" twice`);
      all.set(cur.name, cur);
      move = null;
      return;
    }
    if (!cur) return;
    if ((m = row.match(/^FEN: `([^`]+)`/))) { cur.fen = m[1]; return; }
    if ((m = row.match(/^\*\*\d+\.(?:\.\.)? (\S+)\*\* \((White|Black)/))) {
      move = { san: m[1], side: m[2] === 'White' ? 'w' : 'b', note: '', marks: null, where };
      cur.moves.push(move);
      return;
    }
    if (!(m = row.match(/^- (Intro|Marks at the start|Note|Marks|Takeaway|Theme):\s*(.*)$/))) return;
    const [, field, value] = m;
    const v = value.trim();
    if (field === 'Intro') cur.intro = v;
    else if (field === 'Marks at the start') cur.introMarks = v ? parseMarks(v, where) : null;
    else if (field === 'Takeaway') cur.takeaway = v;
    else if (field === 'Note' || field === 'Marks') {
      if (!move) throw new Error(`${where}: a ${field} before the first move`);
      if (field === 'Note') move.note = v;
      else move.marks = v ? parseMarks(v, where) : null;
    }
  });
  return all;
}

/** A White note as written, without the move in front if the writer put it there ("Kd4! We claim ..."). */
const noteBody = (san, text) => text.replace(new RegExp(`^${san.replace(/[+=]/g, '\\$&')}[!?]*\\s*(— )?`), '').trim();
const isNone = (text) => /^none$/i.test(text);

// ---------- what the board shows ----------
const dist = (a, b) => Math.max(Math.abs(F(a) - F(b)), Math.abs(R(a) - R(b)));
const name = (q) => 'abcdefgh'[F(q)] + (R(q) + 1);
/** The square between the kings when they stand in direct opposition (file or rank), else null. */
const between = (s) => ((F(s.wk) === F(s.bk) && Math.abs(R(s.wk) - R(s.bk)) === 2) || (R(s.wk) === R(s.bk) && Math.abs(F(s.wk) - F(s.bk)) === 2) ? (s.wk + s.bk) / 2 : null);
/** Does White win with stm to move (the oracle; White's pawn only)? An illegal position counts as no. */
function wins(s, stm) { try { return oracle.value([s.wk, s.bk, s.p], stm) >= 0; } catch { return false; } }
/** The oracle's zugzwang: White wins with Black to move, not with White to move. */
const zugzwang = (s) => wins(s, 1) && !wins(s, 0);
/** Moves the pawn still needs to promote (a pawn on its 2nd rank steps twice at once). */
const stepsLeft = (p) => 7 - R(p) - (R(p) === 1 ? 1 : 0);
/** Can the black king still catch the pawn (the rule of the square), with the side to move in s? */
const catches = (s) => dist(s.bk, 56 + F(s.p)) <= stepsLeft(s.p) + (s.stm === 'b' ? 1 : 0);

/** The claims of one note about its move, and what is wrong with them. ctx: the move from lines.json and the line. */
function noteClaims(text, m, l, last) {
  const out = [];
  // after a promotion the new piece stands where the pawn would (squares() reads kings and pawns only)
  const before = squares(m.fenBefore), after = squares(m.promotion ? m.fenAfter.replace(/[QRBNqrbn]/, (c) => (c === c.toUpperCase() ? 'P' : 'p')) : m.fenAfter);
  const say = (msg) => out.push(`${m.san}: "${text}": ${msg}`);
  if (UNTAUGHT.test(text) || LATER.test(text)) say(`a word course 1 does not use yet ("${text.match(UNTAUGHT) ?? text.match(LATER)}")`);
  if (/rook pawn|corner pawn|[ah]-pawn/i.test(text) && ![0, 7].includes(F(after.p >= 0 ? after.p : before.p))) say('the pawn is not a rook pawn');
  if (last) {
    const want = m.promotion === 'q' ? 'Queen' : m.promotion === 'r' ? 'Rook' : 'Draw';
    if (!text.startsWith(`${want}! `)) say(`the closing note must start with "${want}! "`);
  }
  // the pieces the note talks about (a pawn promoted on the last move: the new piece)
  const pawn = after.p >= 0 ? after.p : sqIdx(m.to);
  if (after.pc === 'b' || before.pc === 'b') {
    if (/protect|guard|watch|in front|ahead|behind|give way|too late|cannot (stop|reach|catch)/i.test(text)) say("teaching.cjs checks these words for White's pawn only");
    return out;
  }
  const king = (side) => (side === 'w' ? after.wk : after.bk);
  const queenSq = 56 + F(pawn);
  if (/\baccepted\b/i.test(text)) say('"accepted" is the worksheet\'s word; the course adds "... wins just as fast." itself');
  if (m.side === 'b' && /^[KQRBN]?[a-h]?x?[a-h][1-8]\S*[!?]/.test(text)) say('a note on a White move, written on Black\'s move?');
  // per clause, who the subject is: "your king" White, "Black" Black, else the side that moved
  for (const clause of text.split(/[.;!?]\s*/).filter(Boolean)) {
    const who = (upto) => (/your king/i.test(upto) ? 'w' : /black/i.test(upto) ? 'b' : m.side);
    // guards / watches / covers / controls / protects squares (or the promotion square)
    const verb = clause.match(/\b(guard(s|ing)?|watch(es|ing)?|cover(s|ing)?|control(s|ling)?|protect(s|ing)?(?= [a-h][1-8]\b| the promotion square))\b/i);
    if (verb) {
      const side = who(clause.slice(0, verb.index)), rest = clause.slice(verb.index);
      const targets = [...rest.matchAll(/\b[a-h][1-8]\b/g)].map((x) => x[0]);
      if (!targets.length && /the promotion square/i.test(rest)) targets.push(name(queenSq));
      for (const sq of targets) if (dist(king(side), sqIdx(sq)) !== 1) say(`${side === 'w' ? 'your' : "Black's"} king on ${name(king(side))} does not guard ${sq}`);
    }
    const att = clause.match(/\battacks? (the|your) pawn\b(?!['’])/i);
    if (att) { const side = who(clause.slice(0, att.index)); if (dist(king(side), pawn) !== 1) say(`the king on ${name(king(side))} does not attack the pawn`); }
    for (const re of [/\b(the square )?in front of (the|your) pawn\b(?!['’])/i, /\bahead of (the|your) pawn\b(?!['’])/i, /\bbehind the pawn\b(?!['’])/i, /\bfar from (it|the pawn|your pawn|black's king)\b(?!['’])/i]) {
      const hit = clause.match(re);
      if (!hit) continue;
      const side = /black's king/i.test(hit[0]) ? 'b' : who(clause.slice(0, hit.index));
      const k = king(side), up = R(k) - R(pawn);
      const ok = hit[0].startsWith('the square') ? k === pawn + 8
        : /in front/i.test(hit[0]) ? F(k) === F(pawn) && up > 0
          : /ahead/i.test(hit[0]) ? up > 0 : /behind/i.test(hit[0]) ? up < 0 : dist(k, pawn) >= 3;
      if (!ok) say(`the king on ${name(k)} is not ${hit[0].replace(/^the square /, '')}`);
    }
    for (const [, f] of clause.matchAll(/\b(?:toward|away from) the ([a-h])-file\b/gi)) {
      const fx = f.charCodeAt(0) - 97, was = Math.abs(F(before[m.side === 'w' ? 'wk' : 'bk']) - fx), now = Math.abs(F(king(m.side)) - fx);
      if (/away/i.test(clause) ? now <= was : now >= was) say(`the king does not move ${/away/i.test(clause) ? 'away from' : 'toward'} the ${f}-file`);
    }
    const onto = clause.match(/\bonto the ([a-h])-file\b/i);
    if (onto && F(king(who(clause.slice(0, onto.index)))) !== onto[1].charCodeAt(0) - 97) say(`the king is not on the ${onto[1]}-file`);
    // where Black's king goes: said on Black's own move, and true
    const goes = clause.match(/\b(moves|steps|heads|goes|retreats|returns|shifts|approaches|takes)(?: aside| back| away)?(?: (to|toward|towards|into))? ([a-h][1-8])\b/i);
    if (goes && who(clause.slice(0, goes.index)) === 'b') {
      const to = sqIdx(goes[3]);
      if (m.side !== 'b') say(`a note on Black's move ${goes[0]}, written on a White move?`);
      else if (to !== after.bk && !(/toward/i.test(goes[2] ?? '') && dist(after.bk, to) < dist(before.bk, to))) say(`Black's king goes to ${name(after.bk)}, not ${goes[3]}`);
    }
    if (/\b(takes|reaches|occupies|on) a central square\b/i.test(clause) && ![27, 28, 35, 36].includes(king(who(clause)))) say(`the king on ${name(king(who(clause)))} is not on a central square`);
  }
  for (const [, sq] of text.matchAll(/\bgives? up ([a-h][1-8])\b/g)) if (m.side !== 'b' || before.bk !== sqIdx(sq)) say(`Black's king was not on ${sq}`);
  const protects = /\bprotect(s|ing)? (it\b|your pawn|the (new )?(queen|rook)|the ([a-h]-)?pawn\b(?!['’]))|\bprotected by your king|\b(pawn|it) protected\b/i;
  if (protects.test(text)) {
    const target = last && /queen|rook/i.test(text) ? sqIdx(m.to) : pawn;
    if (dist(after.wk, target) !== 1) say(`your king on ${name(after.wk)} does not protect ${name(target)}`);
  }
  if (/next to your king|beside your king/i.test(text) && dist(after.wk, pawn) !== 1) say('the pawn is not next to your king');
  for (const [, sq] of text.matchAll(/\b([a-h][1-8]) is guarded\b/g)) {
    const by = m.side === 'w' ? after.bk : after.wk;
    if (dist(by, sqIdx(sq)) !== 1) say(`${sq} is not guarded by the other king`);
  }
  for (const [, sq] of text.matchAll(/\b([a-h][1-8]), the promotion square\b/g)) if (sqIdx(sq) !== queenSq) say(`${sq} is not the promotion square`);
  for (const [w, sq] of text.matchAll(/\breach(?:es|ing)? ([a-h][1-8])\b/g)) {
    if (/reaches/.test(w) && m.piece === 'p' ? sqIdx(sq) !== sqIdx(m.to) : sqIdx(sq) === before.p) say(/reaches/.test(w) && m.piece === 'p' ? `the pawn does not reach ${sq}` : `the pawn already stands on ${sq}`);
  }
  for (const [, n] of text.matchAll(/\b(\d)th rank\b/g)) if (R(pawn) + 1 !== +n) say(`the pawn is not on the ${n}th rank`);
  // the opposition, and the square between the kings
  const gap = between(after);
  if (/opposition|face each other|kings face|\bfacing\b/i.test(text) && gap === null) say('the kings do not stand in direct opposition after this move');
  for (const [, sq] of text.matchAll(/\bacross ([a-h][1-8])\b/g)) if (gap !== sqIdx(sq)) say(`${sq} is not the square between the kings`);
  if (/must give way/i.test(text) && (m.side !== 'w' || gap === null || !zugzwang(after))) say('the oracle shows no zugzwang after this move (with White to move it would not win)');
  if (/\b(has|have) to move\b|\bmust move\b/i.test(text) && !zugzwang(m.side === 'w' ? after : before)) say(`Black ${m.side === 'w' ? 'is not in zugzwang after this move' : 'was not in zugzwang before this move'}`);
  // check: given by White's move, or the one Black steps out of
  if (m.side === 'w' && /\bcheck\b/i.test(text) && !m.san.includes('+')) say('the move gives no check');
  if (m.side === 'b' && /\b(out of|in) check\b/i.test(text) && !new Chess(m.fenBefore).inCheck()) say('Black was not in check');
  // the black king's step and its moves
  if (m.side === 'b') {
    if (/\bsteps? aside\b/i.test(text) && R(after.bk) !== R(before.bk)) say('the black king does not step sideways');
    if (/\bsteps? back\b/i.test(text) && R(after.bk) <= R(before.bk)) say('the black king does not step back');
    if (/\b(heads for|comes closer|closer to)\b/i.test(text) && dist(after.bk, pawn) >= dist(before.bk, pawn)) say('the black king does not come closer to the pawn');
    const legal = new Chess(m.fenBefore).moves({ verbose: true });
    if (/\bonly (one )?move\b/i.test(text) && legal.length !== 1) say(`Black has ${legal.length} moves`);
    if (/cannot (step|go|move) forward/i.test(text) && legal.some((x) => R(sqIdx(x.to)) < R(sqIdx(x.from)))) say('the black king can step forward');
  }
  for (const [, sq] of text.matchAll(/\bcan only go (?:back )?to ([a-h][1-8])\b/g)) {
    const replies = new Chess(m.fenAfter).moves({ verbose: true });
    if (replies.length !== 1 || replies[0].to !== sq) say(`Black has ${replies.length} moves (${replies.map((x) => x.san).join(', ')})`);
  }
  // the race: too late, cannot stop / reach / catch, nothing can stop the pawn
  if (!last && /too (late|slow|far)|cannot (stop|reach|catch)|nothing can stop/i.test(text) && catches(after)) say('the black king can still catch the pawn (the rule of the square)');
  return out;
}

/** Claims of an intro about the start position. */
function introClaims(text, l) {
  const out = [];
  const s = squares(l.fen), gap = between(s);
  const say = (msg) => out.push(`intro "${text}": ${msg}`);
  if (UNTAUGHT.test(text) || LATER.test(text)) say('a word course 1 does not use yet');
  if (/rook pawn|corner pawn/i.test(text) && ![0, 7].includes(F(s.p))) say('the pawn is not a rook pawn');
  if (/face each other|one square between/i.test(text) && gap === null) say('the kings are not in direct opposition');
  for (const [, sq] of text.matchAll(/\b(?:across|with) ([a-h][1-8])(?: between)?\b/g)) if (gap !== sqIdx(sq)) say(`${sq} is not the square between the kings`);
  for (const [, f] of text.matchAll(/\bon the ([a-h])-file\b/g)) if (F(s.wk) !== f.charCodeAt(0) - 97 || F(s.bk) !== f.charCodeAt(0) - 97) say(`the kings are not on the ${f}-file`);
  if (/your king is far from/i.test(text) && dist(s.wk, s.p) < 3) say('your king is near the pawn');
  return out;
}

/** Everything wrong with the teaching t of line l (lines.json): [] when it fits the line and is true. */
function problems(t, l) {
  const out = [];
  const where = `${t.where} (${t.name})`;
  if (t.fen !== l.fen) return [`${where}: FEN ${t.fen}, but the line starts from ${l.fen}`];
  const want = l.moves.map((m) => m.san).join(' '), got = t.moves.map((m) => m.san).join(' ');
  if (want !== got) return [`${where}: the moves are ${got}, but the line is ${want}`];
  t.moves.forEach((tm, i) => {
    const m = l.moves[i];
    if (tm.side !== m.side) out.push(`${tm.where}: ${tm.san} is ${m.side === 'w' ? 'White' : 'Black'}'s move`);
    if (!tm.note || isNone(tm.note)) return;
    const text = m.side === 'w' && i < l.moves.length - 1 ? noteBody(m.san, tm.note) : tm.note;
    for (const p of noteClaims(text, m, l, i === l.moves.length - 1)) out.push(`${tm.where}: ${p}`);
    // what one learner turn shows: the note on your move and on Black's reply
    const reply = l.moves[i + 1], replyNote = t.moves[i + 1]?.note;
    if (m.side === 'w' && reply && replyNote && !isNone(replyNote)) {
      const n = `${text} ${replyNote}`.split(/\s+/).length;
      if (n > TURN_WORDS) out.push(`${tm.where}: ${m.san} and ${reply.san} show ${n} words together (at most ${TURN_WORDS})`);
    }
  });
  if (t.intro) for (const p of introClaims(t.intro, l)) out.push(`${where}: ${p}`);
  if (t.takeaway) {
    const r = readable(t.takeaway, TAKEAWAY);
    if (r.length) out.push(`${where}: takeaway too long: ${r.join('; ')}`);
    if (UNTAUGHT.test(t.takeaway) || LATER.test(t.takeaway)) out.push(`${where}: takeaway: a word course 1 does not use yet`);
  }
  if (l.feedback === 'closing' && t.moves.slice(0, -1).some((x) => x.note && !isNone(x.note))) out.push(`${where}: an assessment line shows no notes before the last move`);
  return out;
}

module.exports = { FILE, parse, parseMarks, problems, noteBody, isNone };
