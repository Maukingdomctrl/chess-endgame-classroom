import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { Arrow } from "react-chessboard";
import type { Course, Line } from "../types";
import type { UpdateCourse } from "../App";
import Board from "../components/Board";
import Material from "../components/Material";
import Confetti from "../components/Confetti";
import { lineFens, lineVerboseMoves, moveInstruction, sideToColor } from "../lib/chess";
import { progressOf } from "../lib/storage";
import { navigate } from "../lib/router";
import { setSoundEnabled, soundEnabled, sounds } from "../lib/sound";
import { courseStats } from "../lib/stats";

type Mode = "learn" | "practice";

interface Props {
  course: Course;
  mode: Mode;
  startLineId: string | null;
  updateCourse: UpdateCourse;
}

interface Run {
  idx: number;
  ply: number;
  /** Wrong moves + hints used in this line. */
  mistakes: number;
  wrongAtPly: number;
  hintLevel: number;
  /** Coach notes gathered since the trainee's last turn. */
  notes: string[];
  flash: { square: string; text: string } | null;
  status: "playing" | "done";
  viewPly: number | null;
  celebrate: number;
}

const OPPONENT_DELAY_MS = 550;
const AUTO_NEXT_MS = 2600;

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
  };
}

export default function Trainer({ course, mode, startLineId, updateCourse }: Props) {
  // The queue is fixed when a session starts so finishing lines doesn't reshuffle it.
  const [queue, setQueue] = useState(() => buildQueue(course, mode, startLineId));
  const [run, setRun] = useState<Run>(() => freshRun(0));
  const [allDone, setAllDone] = useState(false);
  const [sound, setSound] = useState(soundEnabled);

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
            notes: [...r.notes, line.moves[r.ply]?.comment ?? ""],
          }));
        },
        run.ply === 0 ? 800 : OPPONENT_DELAY_MS,
      );
      return () => window.clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line, run.ply, run.status]);

  // Move on to the next line automatically after a completed one.
  useEffect(() => {
    if (run.status !== "done") return;
    const t = window.setTimeout(nextLine, AUTO_NEXT_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.status, run.idx]);

  // Clear the wrong-move flash.
  useEffect(() => {
    if (!run.flash) return;
    const t = window.setTimeout(() => setRun((r) => ({ ...r, flash: null })), 900);
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
        notes: [line.moves[r.ply]?.comment ?? ""],
        hintLevel: 0,
        wrongAtPly: 0,
        flash: null,
      }));
      return true;
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

  const arrows: Arrow[] = [];
  const marks: Record<string, CSSProperties> = {};
  if (expected && live && run.status === "playing") {
    if (mode === "learn" || run.hintLevel >= 2) {
      arrows.push({ startSquare: expected.from, endSquare: expected.to, color: "rgba(255, 170, 0, 0.85)" });
    } else if (run.hintLevel === 1) {
      marks[expected.from] = { boxShadow: "inset 0 0 0 4px rgba(255, 170, 0, 0.9)" };
    }
  }
  if (run.flash && live) marks[run.flash.square] = { backgroundColor: "rgba(220, 60, 60, 0.6)" };

  const notes = run.notes.filter((n) => n.trim());
  const progress = allDone
    ? 1
    : (run.idx + (run.status === "done" ? 1 : total ? run.ply / total : 0)) / queue.length;

  let coachMain: string[];
  let coachAction = "";
  if (allDone) {
    coachMain = [
      mode === "learn"
        ? `You've gone through all ${queue.length} line${queue.length === 1 ? "" : "s"}. Time to practice them from memory!`
        : `Practice round complete: ${queue.length} line${queue.length === 1 ? "" : "s"}.`,
    ];
  } else if (run.status === "done") {
    coachMain = ["Well done!", line?.description ?? ""].filter(Boolean);
    if (mode === "practice") coachAction = run.mistakes === 0 ? "Perfect — no mistakes." : `${run.mistakes} mistake${run.mistakes === 1 ? "" : "s"} — this line will come back.`;
  } else if (!live) {
    coachMain = [line?.moves[viewing - 1]?.comment || "Reviewing earlier moves."];
    coachAction = "Press › or → to return to the game.";
  } else {
    coachMain = run.ply === 0 && !notes.length ? [line?.intro || line?.name || ""] : notes;
    if (run.flash) coachAction = run.flash.text;
    else if (expected) {
      if (mode === "learn") coachAction = moveInstruction(expected);
      else if (run.hintLevel >= 1) coachAction = run.hintLevel >= 2 ? moveInstruction(expected) : "Move the highlighted piece.";
      else coachAction = "Your move.";
    } else coachAction = "";
  }

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
            <div className={`bubble${run.flash && live ? " wrong" : ""}`}>
              {coachMain.map((t, i) => (
                <p key={i}>{t}</p>
              ))}
              {coachAction && <p className="action">{coachAction}</p>}
              {mode === "learn" && run.hintLevel > 0 && expected && live && run.status === "playing" && (
                <p className="action">The move is {expected.san}.</p>
              )}
            </div>
          </div>

          {(run.status === "done" || allDone) && (
            <div className="stack">
              {allDone ? (
                <>
                  {mode === "learn" ? (
                    <button className="btn primary wide" onClick={() => navigate(`/course/${course.id}/practice`)}>
                      🎯 Practice these lines
                    </button>
                  ) : (
                    <button className="btn primary wide" onClick={newSession}>
                      🎯 Practice again
                    </button>
                  )}
                  <button className="btn wide" onClick={() => navigate("/")}>
                    Back to courses
                  </button>
                </>
              ) : (
                <button className="btn primary wide next-btn" onClick={nextLine}>
                  {run.idx + 1 >= queue.length ? "Finish" : "Next line →"}
                  <span className="countdown" key={run.idx} />
                </button>
              )}
            </div>
          )}

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
