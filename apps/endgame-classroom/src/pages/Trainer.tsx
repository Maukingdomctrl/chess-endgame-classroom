import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Chess } from "chess.js";
import type { Arrow } from "react-chessboard";
import type { Course, Line } from "../types";
import type { UpdateCourse } from "../App";
import Board from "../components/Board";
import Material from "../components/Material";
import Confetti from "../components/Confetti";
import { lineFens, lineVerboseMoves, moveInstruction, sameSan, sideToColor } from "../lib/chess";
import { progressOf } from "../lib/storage";
import { navigate } from "../lib/router";
import { setSoundEnabled, soundEnabled, sounds } from "../lib/sound";
import { courseStats } from "../lib/stats";
import { marksToArrows } from "../lib/marks";

type Mode = "learn" | "practice";

interface Props {
  course: Course;
  mode: Mode;
  startLineId: string | null;
  updateCourse: UpdateCourse;
}

/** A coach note: the comment of the move at `ply`. */
interface Note {
  ply: number;
  text: string;
}

/** A paragraph of the coach's bubble; a move's note carries the move as a label and the side that played it. */
interface CoachText {
  key: string;
  text: string;
  label?: string;
  side?: "w" | "b";
}

interface Run {
  idx: number;
  ply: number;
  /** Wrong moves + hints used in this line. */
  mistakes: number;
  wrongAtPly: number;
  hintLevel: number;
  /** Coach notes gathered since the trainee's last turn: the trainee's move, then the opponent's reply. */
  notes: Note[];
  /** Feedback on a move that wasn't the line's move; `good` = it was one of the line's [%also] moves. */
  flash: { square: string; text: string; good?: boolean } | null;
  status: "playing" | "done";
  viewPly: number | null;
  celebrate: number;
  /** The learner pressed "Stay": don't move on automatically. */
  stay: boolean;
}

const OPPONENT_DELAY_MS = 550;
// A line that starts with the opponent's move: its first reply (the intro stays on screen meanwhile).
const FIRST_REPLY_MS = 1000;
// After a note the opponent waits a little longer, so it can be read before the board changes.
const READ_MS_PER_WORD = 120;
const READ_MAX_EXTRA_MS = 2000;

// The browser test (tools/course-kit/e2e.cjs) turns the reading pause off, so it can play every line quickly.
const readingPause = () => !(window as Window & { __ecFastReplies?: boolean }).__ecFastReplies;

/** How long the opponent waits before replying: longer when the notes on screen have more to read. */
function replyDelay(notes: Note[]) {
  if (!readingPause()) return OPPONENT_DELAY_MS;
  const words = notes.reduce((n, x) => n + x.text.split(/\s+/).filter(Boolean).length, 0);
  return OPPONENT_DELAY_MS + Math.min(READ_MAX_EXTRA_MS, words * READ_MS_PER_WORD);
}
// Time to read the final notes before the next line starts (the learner can skip or stay).
const AUTO_NEXT_MS = 15000;

function buildQueue(course: Course, mode: Mode, startLineId: string | null): Line[] {
  const playable = course.lines.filter((l) => l.moves.length > 0);
  let queue: Line[];
  if (mode === "learn") {
    const unlearned = playable.filter((l) => !progressOf(course, l.id).learned);
    queue = unlearned.length ? unlearned : playable;
  } else {
    queue = playable
      .filter((l) => progressOf(course, l.id).learned)
      .map((l, i) => ({ l, i, p: progressOf(course, l.id) }))
      .sort((a, b) => Number(a.p.perfected) - Number(b.p.perfected) || b.p.lastMistakes - a.p.lastMistakes || a.i - b.i)
      .map((x) => x.l);
  }
  const start = startLineId ? playable.find((l) => l.id === startLineId) : undefined;
  if (start) {
    if (mode === "learn") {
      // Start at the chosen line and continue through the course in order.
      const i = playable.indexOf(start);
      queue = [...playable.slice(i), ...playable.slice(0, i)];
    } else {
      queue = [start, ...queue.filter((l) => l.id !== start.id)];
    }
  }
  return queue;
}

function freshRun(idx: number): Run {
  return {
    idx,
    ply: 0,
    mistakes: 0,
    wrongAtPly: 0,
    hintLevel: 0,
    notes: [],
    flash: null,
    status: "playing",
    viewPly: null,
    celebrate: 0,
    stay: false,
  };
}

export default function Trainer({ course, mode, startLineId, updateCourse }: Props) {
  // The queue is fixed when a session starts so finishing lines doesn't reshuffle it.
  const [queue, setQueue] = useState(() => buildQueue(course, mode, startLineId));
  const [run, setRun] = useState<Run>(() => freshRun(0));
  const [allDone, setAllDone] = useState(false);
  const [sound, setSound] = useState(soundEnabled);
  const notesRef = useRef<HTMLDivElement>(null);

  const line = queue[run.idx] as Line | undefined;
  const fens = useMemo(() => (line ? lineFens(line) : []), [line]);
  const verbose = useMemo(() => (line ? lineVerboseMoves(line) : []), [line]);
  const total = verbose.length;
  const trainee = sideToColor(course.playAs);
  const turnAt = (ply: number) => fens[ply]?.split(" ")[1];
  const traineeTurn = run.ply < total && turnAt(run.ply) === trainee;
  const stats = courseStats(course);

  // Opponent replies, and line completion.
  useEffect(() => {
    if (!line || run.status !== "playing") return;
    if (run.ply >= total) {
      const t = window.setTimeout(() => {
        const clean = run.mistakes === 0;
        updateCourse(course.id, (c) => {
          const prev = progressOf(c, line.id);
          const next =
            mode === "learn"
              ? { ...prev, learned: true }
              : {
                  ...prev,
                  learned: true,
                  perfected: clean,
                  lastMistakes: run.mistakes,
                  practiceRuns: prev.practiceRuns + 1,
                };
          return { ...c, progress: { ...c.progress, [line.id]: next } };
        });
        sounds.success();
        setRun((r) => ({ ...r, status: "done", celebrate: r.celebrate + 1, viewPly: null }));
      }, 250);
      return () => window.clearTimeout(t);
    }
    if (turnAt(run.ply) !== trainee) {
      const t = window.setTimeout(
        () => {
          sounds.move();
          setRun((r) => ({
            ...r,
            ply: r.ply + 1,
            viewPly: null,
            notes: [...r.notes, { ply: r.ply, text: line.moves[r.ply]?.comment ?? "" }],
          }));
        },
        run.ply === 0 ? FIRST_REPLY_MS : replyDelay(run.notes),
      );
      return () => window.clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line, run.ply, run.status]);

  // The opponent's reply, noted below the learner's move, is scrolled into view when the notes overflow. Only the
  // notes scroll (never the page, so the board stays put), and not while the line's intro is still shown.
  useEffect(() => {
    const el = notesRef.current;
    const last = el?.lastElementChild;
    const afterLearnerMove = run.notes.length > 0 && turnAt(run.notes[0].ply) === trainee;
    if (!el || !last || !afterLearnerMove) return;
    const over = last.getBoundingClientRect().bottom - el.getBoundingClientRect().bottom;
    if (over > 0) el.scrollBy({ top: over, behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.notes.length, run.idx]);

  // Move on to the next line automatically after a completed one.
  useEffect(() => {
    if (run.status !== "done" || run.stay) return;
    const t = window.setTimeout(nextLine, AUTO_NEXT_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.status, run.idx, run.stay]);

  // Clear the wrong-move flash (a "good too" message stays longer, so it can be read).
  useEffect(() => {
    if (!run.flash) return;
    const t = window.setTimeout(() => setRun((r) => ({ ...r, flash: null })), run.flash.good ? 4000 : 900);
    return () => window.clearTimeout(t);
  }, [run.flash]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") review(-1);
      if (e.key === "ArrowRight") review(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function nextLine() {
    if (run.idx + 1 >= queue.length) {
      setAllDone(true);
      return;
    }
    setRun(freshRun(run.idx + 1));
  }

  function newSession() {
    setQueue(buildQueue(course, mode, null));
    setAllDone(false);
    setRun(freshRun(0));
  }

  /** Jump straight to a chosen line; the session then continues from there. */
  function jumpToLine(lineId: string) {
    if (!lineId) return;
    if (!allDone && lineId === line?.id) {
      restart();
      return;
    }
    setQueue(buildQueue(course, mode, lineId));
    setAllDone(false);
    setRun(freshRun(0));
  }

  function restart() {
    setAllDone(false);
    setRun((r) => freshRun(r.idx));
  }

  function review(dir: -1 | 1) {
    setRun((r) => {
      const current = r.viewPly ?? r.ply;
      const next = Math.max(0, Math.min(r.ply, current + dir));
      return { ...r, viewPly: next === r.ply ? null : next };
    });
  }

  function onMove(from: string, to: string, promotion: string) {
    if (!line || run.status !== "playing" || !traineeTurn || run.viewPly !== null) return false;
    const expected = verbose[run.ply];
    if (expected.from === from && expected.to === to && (!expected.promotion || expected.promotion === promotion)) {
      sounds.move();
      setRun((r) => ({
        ...r,
        ply: r.ply + 1,
        notes: [{ ply: r.ply, text: line.moves[r.ply]?.comment ?? "" }],
        hintLevel: 0,
        wrongAtPly: 0,
        flash: null,
      }));
      return true;
    }
    // A move the line lists as just as good: no mistake, but the line goes on with its own move.
    const also = line.moves[run.ply]?.also;
    if (also?.length) {
      let san = "";
      try {
        san = new Chess(fens[run.ply]).move({ from, to, promotion }).san;
      } catch {
        // illegal move: handled as a wrong move below
      }
      if (san && also.some((a) => sameSan(a, san))) {
        setRun((r) => ({
          ...r,
          flash: { square: to, good: true, text: `${san} is good too! This line continues with ${expected.san}: play that to go on.` },
        }));
        return false;
      }
    }
    sounds.wrong();
    const wrongPiece = expected.from === from && expected.to === to;
    setRun((r) => {
      const wrongAtPly = r.wrongAtPly + 1;
      return {
        ...r,
        mistakes: r.mistakes + 1,
        wrongAtPly,
        hintLevel: mode === "practice" && wrongAtPly >= 2 ? 2 : r.hintLevel,
        flash: {
          square: to,
          text: wrongPiece
            ? "Right square, wrong piece — promote to a different piece."
            : mode === "practice" && wrongAtPly >= 2
              ? "Not quite — follow the arrow."
              : "That's not the move. Try again.",
        },
      };
    });
    return false;
  }

  function hint() {
    if (!traineeTurn || run.status !== "playing") return;
    setRun((r) => ({
      ...r,
      mistakes: r.hintLevel === 0 && mode === "practice" ? r.mistakes + 1 : r.mistakes,
      hintLevel: Math.min(2, r.hintLevel + 1),
    }));
  }

  if (queue.length === 0) {
    return (
      <div className="page narrow">
        <div className="panel center-text">
          <h1>{mode === "practice" ? "Nothing to practice yet" : "No lines to learn"}</h1>
          <p className="muted">
            {mode === "practice"
              ? "Learn at least one line first — then come back to practice it from memory."
              : "This course has no lines with moves. Add some in the builder."}
          </p>
          <div className="row center">
            {mode === "practice" && stats.total > 0 && (
              <button className="btn primary" onClick={() => navigate(`/course/${course.id}/learn`)}>
                Learn →
              </button>
            )}
            <button className="btn" onClick={() => navigate(`/course/${course.id}/build`)}>
              Open builder
            </button>
          </div>
        </div>
      </div>
    );
  }

  const viewing = run.viewPly ?? run.ply;
  const fen = fens[viewing];
  const lastMove = viewing > 0 ? verbose[viewing - 1] : null;
  const expected = traineeTurn ? verbose[run.ply] : null;
  const live = run.viewPly === null;

  // Teaching marks from the PGN ([%csl]/[%cal]) for the position on screen. Learn mode only:
  // in Practice they would give the answer away.
  const positionMarks = mode === "learn" && line ? (viewing === 0 ? line.introMarks : line.moves[viewing - 1]?.marks) : undefined;
  const arrows: Arrow[] = marksToArrows(positionMarks);
  const marks: Record<string, CSSProperties> = {};
  if (expected && live && run.status === "playing") {
    if (mode === "learn" || run.hintLevel >= 2) {
      arrows.push({ startSquare: expected.from, endSquare: expected.to, color: "rgba(255, 170, 0, 0.85)" });
    } else if (run.hintLevel === 1) {
      marks[expected.from] = { boxShadow: "inset 0 0 0 4px rgba(255, 170, 0, 0.9)" };
    }
  }
  if (run.flash && live)
    marks[run.flash.square] = { backgroundColor: run.flash.good ? "rgba(46, 160, 110, 0.5)" : "rgba(220, 60, 60, 0.6)" };

  /**
   * A note as the coach shows it: labelled with its move ("2. Kd4!", "2… Kc6"), so the learner's move and the
   * reply are never confused. A note that starts with its own move ("Kd4! — Take …") gives that part to the label.
   */
  function noteView(n: Note): CoachText {
    const mv = verbose[n.ply];
    let text = n.text.trim();
    if (!mv) return { key: `n${n.ply}`, text };
    let glyph = "";
    const lead = text.startsWith(mv.san) ? text.slice(mv.san.length).match(/^([!?]{0,2}) — /) : null;
    if (lead) {
      glyph = lead[1];
      text = text.slice(mv.san.length + lead[0].length);
    }
    const number = fens[n.ply]?.split(" ")[5] ?? "1";
    return { key: `n${n.ply}`, text, side: mv.color, label: `${number}${mv.color === "w" ? "." : "…"} ${mv.san}${glyph}` };
  }
  const notes = run.notes.filter((n) => n.text.trim()).map(noteView);
  const plain = (key: string, text: string): CoachText => ({ key, text });
  const progress = allDone
    ? 1
    : (run.idx + (run.status === "done" ? 1 : total ? run.ply / total : 0)) / queue.length;

  let coachMain: CoachText[];
  let coachAction = "";
  // Keeps the instruction row in place while the opponent replies, so the bubble doesn't collapse.
  let waiting = false;
  if (allDone) {
    coachMain = [
      plain(
        "all",
        mode === "learn"
          ? queue.length === 1
            ? "You've finished this line. Time to practice it from memory!"
            : `You've gone through all ${queue.length} lines. Time to practice them from memory!`
          : `Practice round complete: ${queue.length} line${queue.length === 1 ? "" : "s"}.`,
      ),
    ];
  } else if (run.status === "done") {
    // Keep the final move's note: it often explains why the line is won.
    coachMain = [...notes, plain("well", "Well done!"), plain("takeaway", line?.description ?? "")];
    if (mode === "practice") coachAction = run.mistakes === 0 ? "Perfect — no mistakes." : `${run.mistakes} mistake${run.mistakes === 1 ? "" : "s"} — this line will come back.`;
  } else if (!live) {
    const comment = line?.moves[viewing - 1]?.comment?.trim();
    coachMain = [comment ? noteView({ ply: viewing - 1, text: comment }) : plain("review", "Reviewing earlier moves.")];
    coachAction = "Press › or → to return to the game.";
  } else {
    // The intro stays until the learner's first move, also when the line starts with the opponent's move.
    const learnerMoved = verbose.slice(0, run.ply).some((m) => m.color === trainee);
    coachMain = learnerMoved ? notes : [plain("intro", line?.intro || line?.name || ""), ...notes];
    if (run.flash) coachAction = run.flash.text;
    else if (expected) {
      if (mode === "learn") coachAction = moveInstruction(expected);
      else if (run.hintLevel >= 1) coachAction = run.hintLevel >= 2 ? moveInstruction(expected) : "Move the highlighted piece.";
      else coachAction = "Your move.";
    } else if (run.ply < total) {
      coachAction = "Opponent is replying…";
      waiting = true;
    }
  }
  coachMain = coachMain.filter((t) => t.text.trim());

  return (
    <div className="trainer">
      <div className="progress-top">
        <span style={{ width: `${progress * 100}%` }} />
      </div>
      <div className="workspace">
        <div className="board-col">
          <Material fen={fen} side={course.playAs === "white" ? "black" : "white"} />
          <div className="board-stage">
            <Board
              fen={fen}
              orientation={course.playAs}
              onMove={onMove}
              interactive={live && traineeTurn && run.status === "playing" && !allDone}
              movableColor={trainee}
              lastMove={lastMove}
              arrows={arrows}
              markSquares={marks}
              highlights={positionMarks?.squares}
            />
            {run.celebrate > 0 && run.status === "done" && <Confetti key={`${run.idx}-${run.celebrate}`} />}
          </div>
          <Material fen={fen} side={course.playAs} />
        </div>

        <aside className="side panel">
          <div className="trainer-head">
            <span className={`mode-pill ${mode}`}>{mode === "learn" ? "📖 Learn" : "🎯 Practice"}</span>
            <span className="grow clamp1">{course.name}</span>
            <span className="muted small">
              {allDone ? `${queue.length}/${queue.length}` : `#${run.idx + 1}/${queue.length}`}
            </span>
          </div>
          <label className="line-picker">
            <span className="label">Line</span>
            <select
              className="field"
              value={allDone ? "" : (line?.id ?? "")}
              onChange={(e) => jumpToLine(e.target.value)}
            >
              {allDone && <option value="">Choose a line to train…</option>}
              {course.lines.map((l, i) => {
                const p = progressOf(course, l.id);
                const status = l.moves.length === 0 ? " (no moves)" : p.perfected ? "  ★ perfected" : p.learned ? "  ✓ learned" : "";
                return (
                  <option key={l.id} value={l.id} disabled={l.moves.length === 0}>
                    #{i + 1} {l.name || "Untitled line"}
                    {status}
                  </option>
                );
              })}
            </select>
          </label>

          <div className="coach">
            <span className="coach-avatar">♚</span>
            <div className={`bubble${run.flash && live ? (run.flash.good ? " good" : " wrong") : ""}`}>
              {coachMain.length > 0 && (
                // Only the notes scroll, so the instruction below stays visible even for long notes.
                <div className="bubble-notes" ref={notesRef}>
                  {coachMain.map((t) => (
                    <p key={t.key} className={t.side ? `note ${t.side}` : undefined}>
                      {t.label && <span className="note-move">{t.label}</span>}
                      {t.label && " "}
                      {t.text}
                    </p>
                  ))}
                </div>
              )}
              {coachAction && <p className={`action${waiting ? " waiting" : ""}`}>{coachAction}</p>}
              {mode === "learn" && run.hintLevel > 0 && expected && live && run.status === "playing" && (
                <p className="action">The move is {expected.san}.</p>
              )}
            </div>
          </div>

          {/* Always takes the same space (empty while playing) so the bubble above never resizes. */}
          <div className="done-actions">
            {allDone ? (
              <>
                {mode === "learn" ? (
                  <button className="btn primary" onClick={() => navigate(`/course/${course.id}/practice`)}>
                    🎯 Practice them
                  </button>
                ) : (
                  <button className="btn primary" onClick={newSession}>
                    🎯 Practice again
                  </button>
                )}
                <button className="btn" onClick={() => navigate(`/section/${course.category}`)}>
                  Back to courses
                </button>
              </>
            ) : (
              run.status === "done" && (
                <>
                  <button className="btn primary next-btn" onClick={nextLine}>
                    {run.idx + 1 >= queue.length ? "Finish" : "Next line →"}
                    {!run.stay && (
                      <span className="countdown" key={run.idx} style={{ animationDuration: `${AUTO_NEXT_MS}ms` }} />
                    )}
                  </button>
                  <button
                    className="btn stay-btn"
                    disabled={run.stay}
                    title="Stop the countdown and stay on this line"
                    onClick={() => setRun((r) => ({ ...r, stay: true }))}
                  >
                    {run.stay ? "Staying" : "⏸ Stay"}
                  </button>
                </>
              )
            )}
          </div>

          <div className="mode-cards">
            <button
              className={`mode-card${mode === "learn" ? " active learn" : ""}`}
              onClick={() => mode !== "learn" && navigate(`/course/${course.id}/learn`)}
            >
              <span className="mc-title">📖 Learn</span>
              <span className="mc-sub">discover new lines</span>
              <span className="mc-count">
                {stats.learned}/{stats.total}
                <small>discovered</small>
              </span>
            </button>
            <button
              className={`mode-card${mode === "practice" ? " active practice" : ""}`}
              disabled={stats.learned === 0}
              onClick={() => mode !== "practice" && navigate(`/course/${course.id}/practice`)}
            >
              <span className="mc-title">🎯 Practice {stats.learned === 0 && "🔒"}</span>
              <span className="mc-sub">{stats.learned === 0 ? "learn a line to unlock" : "perfect your lines"}</span>
              <span className="mc-count">
                {stats.perfected}/{stats.total}
                <small>perfected</small>
              </span>
            </button>
          </div>

          <div className="nav-row">
            <button
              className="icon-btn labeled"
              title="Sound"
              onClick={() => {
                setSoundEnabled(!sound);
                setSound(!sound);
              }}
            >
              {sound ? "🔊" : "🔈"}
              <small>Sound</small>
            </button>
            <button className="icon-btn labeled" title="Hint" onClick={hint} disabled={!traineeTurn || run.status !== "playing" || !live}>
              💡<small>Hint</small>
            </button>
            <button className="icon-btn labeled" title="Restart line" onClick={restart}>
              ↻<small>Restart</small>
            </button>
            <button className="icon-btn labeled" title="Edit course" onClick={() => navigate(`/course/${course.id}/build`)}>
              ✎<small>Edit</small>
            </button>
            <span className="grow" />
            <button className="icon-btn" title="Back (←)" disabled={viewing === 0} onClick={() => review(-1)}>
              ‹
            </button>
            <button className="icon-btn" title="Forward (→)" disabled={live} onClick={() => review(1)}>
              ›
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
