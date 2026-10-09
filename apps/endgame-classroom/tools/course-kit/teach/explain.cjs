// Short explanations of moves, built only from verified facts: what the board shows (the domain's facts,
// e.g. ../pawn/teach.cjs pawnFacts) and what the solver proves (./outcome.cjs). Nothing is written from
// memory and nothing is guessed; when no fact explains a move, the text falls back to what the solver
// says (the quickest win, still wins but slower, only a draw now) and the move is flagged for review.
//
//   const ex = createExplainer({ verify, domain, vocabulary });
//   ex.explainMove(fen, 'Kf4')   // { san, kind, mark, text: 'Kf4! — Take the opposition.', parts, facts, review }
//   ex.acceptedMoves(fen)        // exactly verify.fastestMoves: teaching never changes which moves are accepted
//
// verify: the course's verify-opts (goal, probe, promotionProbe). domain (all optional):
//   facts(fen)      -> [{ id, key, side ('w' | 'b': whom it helps), ... }] read from the board
//   plausible(fen)  -> [san] | null: the moves a learner is likely to consider (a heuristic, for the
//                      "natural alternative", "!" and difficulty only; never for correctness). null: unknown
//   phrases         -> { priority: [fact ids], gain: {id: (fact, ctx) => text}, keep, give, lose: {...} }
//                      gain: the learner's move creates the fact; keep: it was there and stays (falls
//                      back to gain); give: the opponent gets it; lose: a fact of the learner's disappears.
//                      ctx.facts: every fact of the position the fact belongs to. A phrase returning
//                      undefined falls back to the generic one.
//   concepts        -> a createConcepts(...) set (./concepts.cjs): cues and takeaways for reason facts
//   exceptions(fen) -> [{ id, concepts: [concept ids], text }]: where a usual rule does not hold
// vocabulary (optional): (fact) => bool, the facts a course may name (e.g. not "key squares" before the
//   course that teaches them). A reason outside it is not used; if that leaves none, the text says only
//   what the solver proves and the move is flagged 'outside-vocabulary'. A reason of the learner's move
//   carries that move (fact.move: { san, piece }), so a course can also leave out, say, a pawn move that
//   takes the opposition (a tempo idea).
//
// Why a move works (the reason) is a fact the learner has after the move that NONE of the moves that fail
// leaves: if a losing move gives the same fact, the fact cannot be why the move wins (contrast). Facts the
// move creates come before facts it keeps. With nothing to contrast with (every move equally good) no
// fact is a reason. A zugzwang counts only when the solver shows it. A move is important (marked "!")
// when a move the learner is likely to consider (domain.plausible) lets the win go. Why a move fails is
// either an event on the board (stalemate, the new piece can be taken) or what the opponent's refutation
// creates; the refutation is a reply the solver proves escapes. A slower win gets only its delta, never a
// made-up cause.
const { fastestMoves } = require('../verify.cjs');
const { moveOutcomes, replyOutcomes, resultFor, zugzwang } = require('./outcome.cjs');

const PIECE = { q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn', k: 'king' };
const SEVERITY = { loses: 0, draws: 1, notGoal: 2, slower: 3, best: 4 };

/** Generic phrases: outcomes, events on the board, and the solver's zugzwang. A domain adds its facts. */
const DEFAULT_PHRASES = {
  priority: ['stalemate', 'pieceTaken', 'underpromotion', 'stalemated', 'capture', 'zugzwang'],
  // the solver's zugzwang: f.solver = { side, withMove, ifPassed } (results for the learner)
  gain: { zugzwang: (f) => (f.solver?.withMove === 'win' ? 'Black is in zugzwang: every move loses.' : 'Black is in zugzwang: moving costs the win.') },
  give: {
    zugzwang: () => 'Now you are in zugzwang.',
    capture: (f) => `Black takes the ${PIECE[f.piece]}.`,
    stalemate: () => 'Stalemate!',
    stalemated: (f) => `After ${f.reply} you are stalemated.`,
    pieceTaken: (f) => `The king can take the new ${PIECE[f.piece]}.`,
    underpromotion: () => 'Only a queen or a rook counts here.',
  },
  lose: {},
  outcome: {
    draws: () => 'Only a draw now.',
    loses: () => 'Now Black wins.',
    slower: (moves) => (moves ? `Still wins, but ${moves} ${moves === 1 ? 'move' : 'moves'} slower.` : 'Still wins, but slower.'),
    sooner: (moves) => `Loses ${moves} ${moves === 1 ? 'move' : 'moves'} sooner.`,
    notGoal: () => '',
    holds: (reply, kind) => (kind === 'loses' ? `Black answers ${reply} and wins.` : `Black answers ${reply} and holds the draw.`),
    hold: () => 'This holds the draw.',
    allEqual: (mode) => (mode === 'win' ? 'Every move wins just as fast.' : 'Every move keeps the draw.'),
    // the learner to move is in zugzwang (z: outcome.zugzwang, results for the learner)
    zugzwangHere: (z) => (z.ifPassed === 'win' ? 'If Black had to move, you would win.' : z.ifPassed === 'draw' ? 'If Black had to move, it would be a draw.' : null),
    resist: () => 'The longest resistance.',
    // v: the measure after the move ([0, plies to mate] or [1, plies to a safe promotion]); m: the move
    best: (v, m) => (v[0] === 0 && v[1] === 0 ? 'Checkmate!'
      : m.promotion ? 'A safe promotion.'
      : v[0] === 1 ? `The quickest way: it promotes in ${v[1] / 2 + 1} moves.`
      : `The quickest mate: mate in ${v[1] / 2 + 1}.`),
  },
};

/** "Kf6", "Kf6 and Kd6", "Kf6, Kd6 and Ke5" */
const listSans = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
/** The equal moves, in one sentence: the line's move is accepted together with exactly these. */
const equalPhrase = (others, mode = 'win') => (mode === 'hold'
  ? (others.length === 1 ? `${others[0]} also holds.` : `${listSans(others)} also hold.`)
  : others.length === 1 ? `${others[0]} wins just as fast.` : `${listSans(others)} win just as fast.`);

/** Text limits, so a learner reads it in 4-5 seconds: at most 2 sentences, 12 words each, 20 in all. */
const LIMITS = { sentences: 2, wordsPerSentence: 12, words: 20 };
/** Problems with a text ([] = readable). The move in front ("Kf4! — ") is not counted. */
function readable(text, limits = LIMITS) {
  const body = text.replace(/^\S+ — /, '').trim();
  if (!body) return ['empty'];
  const sentences = body.split(/(?<=[.!?:])\s+(?=[A-Z])/).filter(Boolean);
  const words = (s) => s.split(/\s+/).filter(Boolean).length;
  const out = [];
  if (sentences.length > limits.sentences) out.push(`${sentences.length} sentences`);
  for (const s of sentences) if (words(s) > limits.wordsPerSentence) out.push(`${words(s)} words: "${s}"`);
  if (words(body) > limits.words) out.push(`${words(body)} words in all`);
  return out;
}

function mergePhrases(domain) {
  const d = domain ?? {};
  return {
    base: { gain: DEFAULT_PHRASES.gain, keep: DEFAULT_PHRASES.gain, give: DEFAULT_PHRASES.give, lose: DEFAULT_PHRASES.lose },
    priority: [...DEFAULT_PHRASES.priority.slice(0, -1), ...(d.priority ?? []), 'zugzwang'],
    gain: { ...DEFAULT_PHRASES.gain, ...d.gain },
    keep: { ...DEFAULT_PHRASES.gain, ...d.gain, ...d.keep },
    give: { ...DEFAULT_PHRASES.give, ...d.give },
    lose: { ...DEFAULT_PHRASES.lose, ...d.lose },
    outcome: { ...DEFAULT_PHRASES.outcome, ...d.outcome },
  };
}

function createExplainer({ verify, domain = {}, vocabulary = () => true }) {
  const P = mergePhrases(domain.phrases);
  const factsOf = domain.facts ?? (() => []);
  const plausibleOf = domain.plausible ?? (() => null);
  const memo = new Map();
  const cached = (kind, fen, f) => { const k = `${kind} ${fen}`; if (!memo.has(k)) memo.set(k, f()); return memo.get(k); };
  const outcomes = (fen) => cached('o', fen, () => moveOutcomes(fen, verify));
  const replies = (fen) => cached('r', fen, () => replyOutcomes(fen, verify));
  const facts = (fen) => cached('f', fen, () => factsOf(fen));
  const zz = (fen, learner) => cached(`z${learner}`, fen, () => zugzwang(fen, verify, learner));
  const rank = (id) => { const i = P.priority.indexOf(id); return i < 0 ? P.priority.length : i; };
  const byPriority = (a, b) => rank(a.id) - rank(b.id);
  const has = (list, key) => list.some((f) => f.key === key);
  const other = (c) => (c === 'w' ? 'b' : 'w');

  /**
   * The learner's facts after move m (gained: not there before), with the solver's zugzwang on the opponent.
   * Each carries the move that led to it ({ san, piece }), for a vocabulary or a phrase that depends on it.
   */
  function learnerFacts(learner, before, m) {
    const move = { san: m.san, piece: m.piece };
    const list = facts(m.fen).filter((f) => f.side === learner).map((f) => ({ ...f, gained: !has(before, f.key), at: m.fen, move }));
    const z = zz(m.fen, learner);
    if (z && z.side === other(learner)) list.push({ id: 'zugzwang', side: learner, key: 'zugzwang', solver: z, gained: true, at: m.fen, move });
    return list;
  }
  /** The words for a fact in a role (gain, keep, give, lose): the domain's, else the generic ones; null if none. */
  const phrase = (role, f) => {
    const ctx = { facts: f.at ? facts(f.at) : [] };
    return P[role][f.id]?.(f, ctx) ?? P.base[role][f.id]?.(f, ctx) ?? null;
  };
  const sayReason = (f) => phrase(f.gained ? 'gain' : 'keep', f);

  /**
   * What a move that lets the win go does by itself: learner facts it gives up that every fastest move keeps,
   * and opponent facts it hands over that no fastest move hands over (contrast, as for reasons).
   */
  function directEffects(fen, m, out, learner) {
    const before = facts(fen), after = facts(m.fen);
    const bests = out.moves.filter((x) => x.kind === 'best').map((x) => facts(x.fen));
    const list = [];
    for (const f of before) if (f.side === learner && !has(after, f.key) && bests.every((b) => has(b, f.key))) list.push({ ...f, lost: true, at: fen });
    for (const f of after) if (f.side !== learner && !has(before, f.key) && bests.every((b) => !has(b, f.key))) list.push({ ...f, at: m.fen });
    return list.filter((f) => textOf(f)).sort(byPriority);
  }
  /**
   * The opponent's way to punish a mistake: among the replies the solver proves escape (or, holding a draw, win),
   * the one whose effect is best explained (what the opponent gains: a fact, a capture, a zugzwang on the learner).
   */
  function refutation(afterFen, learner, mode) {
    const opp = other(learner);
    const base = facts(afterFen);
    // win mode: the replies after which the learner no longer wins; hold mode: those after which the opponent wins
    const punishes = (r) => (mode === 'win' ? r.kind === 'escapes' : cached('R', r.fen, () => resultFor(r.fen, verify, learner)).result === 'loss');
    const options = replies(afterFen).filter(punishes).map((r) => {
      // a stalemate after the reply is the learner stalemated by it, not a stalemate the learner made
      const why = facts(r.fen).map((f) => ({ ...(f.id === 'stalemate' ? { ...f, id: 'stalemated', reply: r.san } : f), at: r.fen }))
        .filter((f) => f.side === opp && !has(base, f.key) && phrase('give', f));
      if (r.captured) why.push({ id: 'capture', side: opp, key: `capture:${r.to}`, piece: r.captured, square: r.to });
      const z = zz(r.fen, learner);
      if (z && z.side === learner) why.push({ id: 'zugzwang', side: opp, key: 'zugzwang', solver: z, at: r.fen });
      return { san: r.san, why: why.sort(byPriority) };
    });
    const top = (o) => (o.why.length ? rank(o.why[0].id) : 1e9);
    options.sort((a, b) => top(a) - top(b));
    return options[0] ?? null;
  }
  function textOf(f) { return f.lost ? phrase('lose', f) : phrase('give', f); }

  /** Exceptions the domain reports in this position for the concepts a text relies on. */
  const exceptionsFor = (fen, ids) => (domain.exceptions ? domain.exceptions(fen).filter((e) => e.concepts.some((c) => ids.includes(c))) : []);
  const conceptOf = (id) => domain.concepts?.byFact(id) ?? null;

  function explainWrong(fen, m, out) {
    const learner = out.learner;
    const review = [];
    let reason = null, reply = null, immediate = false;
    const letsGo = m.kind === 'draws' || m.kind === 'loses';
    if (m.why === 'stalemate') { reason = { id: 'stalemate', side: other(learner), key: 'stalemate' }; immediate = true; }
    else if (m.why === 'pieceTaken' || m.why === 'underpromotion') { reason = { id: m.why, side: other(learner), key: m.why, piece: m.promotion }; immediate = m.why === 'pieceTaken'; }
    else if (letsGo) {
      // what the move gives up itself, or what the opponent's refutation gains: whichever the domain ranks first
      const r = refutation(m.fen, learner, out.mode);
      reply = r?.san ?? null;
      const candidates = [...directEffects(fen, m, out, learner), ...(r?.why ?? [])].sort(byPriority);
      reason = candidates.find(vocabulary) ?? null;
      immediate = reason?.id === 'capture';
      if (!reason) review.push(candidates.length ? 'outside-vocabulary' : 'no-grounded-reason');
    }
    const moves = m.kind === 'slower' && m.delta !== null ? Math.ceil(m.delta / 2) : null;
    let first = reason ? textOf(reason) : null;
    let second = m.kind === 'slower' ? (out.mode === 'resist' ? P.outcome.sooner(moves) : P.outcome.slower(moves))
      : m.kind === 'draws' ? P.outcome.draws() : m.kind === 'loses' ? P.outcome.loses() : P.outcome.notGoal();
    // nothing to explain it with: say what the solver proves, the reply that holds
    if (!reason && letsGo && reply) { first = P.outcome.holds(reply, m.kind); second = ''; }
    // "??" only when it throws the result away at once (stalemate, the piece or pawn taken); a slower win is not a blunder
    const mark = m.kind === 'slower' ? '?!' : immediate ? '??' : '?';
    const sentences = [first, second].filter(Boolean);
    const text = `${m.san}${mark} — ${sentences.join(' ')}`;
    const ids = reason ? [reason.id] : [];
    return {
      san: m.san, kind: m.kind, mode: out.mode, mark, text, immediate,
      severity: {
        loses: out.mode === 'win' ? 'turns the win into a loss' : 'turns the draw into a loss',
        draws: immediate ? 'throws the win away at once' : 'turns the win into a draw',
        slower: out.mode === 'resist' ? 'loses sooner' : 'still wins, but slower',
        notGoal: 'misses the goal',
      }[m.kind],
      delta: m.delta, reply, facts: ids, exceptions: exceptionsFor(fen, ids.map((id) => conceptOf(id)?.id).filter(Boolean)),
      parts: { move: `${m.san}${mark}`, why: first, outcome: second || null, reply },
      review,
    };
  }

  function explainBest(fen, m, out) {
    const learner = out.learner;
    const review = [];
    const before = facts(fen);
    const mine = learnerFacts(learner, before, m).filter((f) => sayReason(f));
    const failing = out.moves.filter((x) => x.kind === 'draws' || x.kind === 'loses' || x.kind === 'notGoal');
    const slower = out.moves.filter((x) => x.kind === 'slower');
    // contrast: a reason must separate this move from every move that fails (or, if none fails, from the
    // slower ones); when every move is as good, nothing separates and no fact is a reason
    const against = failing.length ? failing : slower;
    const separating = !against.length ? [] : mine.filter((f) => against.every((a) => (f.id === 'zugzwang' ? zz(a.fen, learner)?.side !== other(learner) : !has(facts(a.fen), f.key))))
      .sort((a, b) => b.gained - a.gained || byPriority(a, b));
    const reasons = separating.filter(vocabulary);
    const gained = mine.filter((f) => f.gained);
    const equal = out.moves.filter((x) => x.kind === 'best' && x.san !== m.san).map((x) => x.san);
    // important: a move the learner is likely to consider lets the win go (only slower moves, or only
    // far-fetched mistakes: the quickest way is still worth a word, not a "!")
    const plausible = plausibleOf(fen); // unknown (null): every move counts
    const likely = (san) => !plausible || plausible.includes(san);
    const important = failing.some((x) => likely(x.san));
    const mark = important ? '!' : '';
    const sentences = [];
    const used = [];
    const allEqual = !against.length;
    if (reasons.length) { sentences.push(sayReason(reasons[0])); used.push(reasons[0]); }
    else if (allEqual) sentences.push(P.outcome.allEqual(out.mode));
    else {
      sentences.push(out.mode === 'hold' ? P.outcome.hold() : out.mode === 'resist' ? P.outcome.resist() : P.outcome.best(m.value, m));
      if (important) review.push(separating.length ? 'outside-vocabulary' : 'no-grounded-reason');
    }
    // a second sentence only for the equal moves, or for the solver's zugzwang behind the reason
    const zzReason = reasons.find((f, i) => i > 0 && f.id === 'zugzwang');
    if (equal.length && !allEqual) sentences.push(equalPhrase(equal, out.mode));
    else if (zzReason) { sentences.push(sayReason(zzReason)); used.push(zzReason); }
    let text = `${m.san}${mark} — ${sentences.filter(Boolean).join(' ')}`;
    if (readable(text).length && sentences.length > 1) { text = `${m.san}${mark} — ${sentences[0]}`; used.splice(1); }
    // the natural alternative that fails, and what the opponent does against it
    const order = plausible ?? out.moves.map((x) => x.san);
    const alt = out.moves.filter((x) => x.kind !== 'best' && likely(x.san))
      .sort((a, b) => SEVERITY[a.kind] - SEVERITY[b.kind] || order.indexOf(a.san) - order.indexOf(b.san))[0];
    const alternative = alt ? explainWrong(fen, alt, out) : null;
    const concept = used.map((f) => conceptOf(f.id)).find(Boolean) ?? null;
    const ids = used.map((f) => f.id);
    return {
      san: m.san, kind: 'best', mode: out.mode, mark, text, important, equal, delta: 0,
      facts: ids, exceptions: exceptionsFor(fen, concept ? [concept.id] : []),
      parts: {
        move: `${m.san}${mark}`,
        why: sentences[0],
        changes: { gained: gained.map((f) => f.key), lost: before.filter((f) => f.side === learner && !has(facts(m.fen), f.key)).map((f) => f.key) },
        alternative: alternative && { san: alternative.san, text: alternative.text, reply: alternative.reply },
        opponentIdea: alternative?.reply ? { reply: alternative.reply, why: alternative.parts.why } : null,
        notice: concept ? concept.cue(1) : null,
        remember: concept ? concept.remember : null,
        concept: concept?.id ?? null,
      },
      review,
    };
  }

  /** The explanation of one move of the side to move (the learner) in fen. */
  function explainMove(fen, san) {
    const out = outcomes(fen);
    const m = out.moves.find((x) => x.san === san);
    if (!m) throw new Error(`${san} is not legal in ${fen}`);
    const e = m.kind === 'best' ? explainBest(fen, m, out) : explainWrong(fen, m, out);
    const r = readable(e.text);
    if (r.length) e.review.push(`too long: ${r.join('; ')}`);
    return e;
  }
  /**
   * The moves a line may play here: the fastest wins, exactly as verify.cjs accepts them (holding a draw:
   * every move that keeps it). The explanations' equal moves are always these minus the move itself.
   */
  const acceptedMoves = (fen) => (outcomes(fen).mode === 'win' ? fastestMoves(fen, verify) : outcomes(fen).moves.filter((x) => x.kind === 'best').map((x) => x.san));
  /**
   * Every move of the position explained, best first: { best: [...], wrong: [...], zugzwang }. zugzwang: the
   * learner to move is in zugzwang (the solver: handing over the move would be better), with its words;
   * null otherwise. (A zugzwang the learner's move puts the opponent in is a reason of that move.)
   */
  function explainPosition(fen) {
    const out = outcomes(fen);
    const all = out.moves.map((m) => explainMove(fen, m.san));
    const z = zz(fen, out.learner);
    return {
      best: all.filter((e) => e.kind === 'best'),
      wrong: all.filter((e) => e.kind !== 'best').sort((a, b) => SEVERITY[a.kind] - SEVERITY[b.kind]),
      zugzwang: z && z.side === out.learner ? { ...z, who: 'learner', text: P.outcome.zugzwangHere(z) } : null,
    };
  }
  return { explainMove, explainPosition, acceptedMoves, outcomes, replies, facts, zugzwang: zz, plausible: (fen) => cached('p', fen, () => plausibleOf(fen)) };
}

module.exports = { createExplainer, readable, equalPhrase, listSans, LIMITS, DEFAULT_PHRASES, PIECE };
