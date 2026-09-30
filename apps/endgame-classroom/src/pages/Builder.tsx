import { useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import type { Course, Line, LineMove, Side } from "../types";
import type { UpdateCourse } from "../App";
import Board from "../components/Board";
import Material from "../components/Material";
import MoveList from "../components/MoveList";
import ImportBox from "../components/ImportBox";
import { DEFAULT_FEN, lineFens, lineVerboseMoves, normalizeFen } from "../lib/chess";
import { createLine, progressOf } from "../lib/storage";
import { navigate } from "../lib/router";
import { lineToPgn } from "../lib/pgn";
import { copyText, exportCourseJson, exportCoursePgn } from "../lib/exporting";
import { courseStats } from "../lib/stats";
import { CATEGORIES, categoryInfo } from "../lib/categories";

interface Props {
  course: Course;
  updateCourse: UpdateCourse;
  initialLineId: string | null;
  initialTab: string | null;
}

interface Draft {
  lineId: string | null;
  startFen: string;
  intro: string;
  moves: LineMove[];
}

const EMPTY_DRAFT: Draft = { lineId: null, startFen: DEFAULT_FEN, intro: "", moves: [] };

function draftFromLine(line: Line): Draft {
  return {
    lineId: line.id,
    startFen: line.startFen,
    intro: line.intro,
    moves: line.moves.map((m) => ({ ...m })),
  };
}

function sameMoves(a: LineMove[], b: LineMove[]) {
  return a.length === b.length && a.every((m, i) => m.san === b[i].san);
}

export default function Builder({ course, updateCourse, initialLineId, initialTab }: Props) {
  const initialLine = course.lines.find((l) => l.id === initialLineId);
  const [tab, setTab] = useState<"build" | "lines">(
    initialTab === "lines" || (!initialLine && course.lines.length > 0 && initialTab !== "build") ? "lines" : "build",
  );
  const [draft, setDraft] = useState<Draft>(() => (initialLine ? draftFromLine(initialLine) : EMPTY_DRAFT));
  const [cursor, setCursor] = useState(initialLine?.moves.length ?? 0);
  const [flipped, setFlipped] = useState(false);
  const [fenInput, setFenInput] = useState("");
  const [fenError, setFenError] = useState("");
  const [saveForm, setSaveForm] = useState<{ name: string; description: string } | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [toast, setToast] = useState("");

  const savedLine = course.lines.find((l) => l.id === draft.lineId);
  const fens = useMemo(() => lineFens(draft), [draft]);
  const verbose = useMemo(() => lineVerboseMoves(draft), [draft]);
  const fen = fens[Math.min(cursor, fens.length - 1)];
  const lastMove = cursor > 0 ? verbose[cursor - 1] : null;
  const orientation: Side = flipped ? (course.playAs === "white" ? "black" : "white") : course.playAs;
  const stats = courseStats(course);

  const dirty = savedLine
    ? !sameMoves(savedLine.moves, draft.moves) ||
      savedLine.intro !== draft.intro ||
      savedLine.startFen !== draft.startFen ||
      savedLine.moves.some((m, i) => m.comment !== draft.moves[i]?.comment)
    : draft.moves.length > 0 || draft.intro.trim() !== "";

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(""), 2200);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") return;
      if (e.key === "ArrowLeft") setCursor((c) => Math.max(0, c - 1));
      if (e.key === "ArrowRight") setCursor((c) => Math.min(draft.moves.length, c + 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draft.moves.length]);

  function confirmDiscard() {
    return !dirty || confirm("You have unsaved changes to this line. Discard them?");
  }

  function onMove(from: string, to: string, promotion: string) {
    let san: string;
    try {
      san = new Chess(fen).move({ from, to, promotion }).san;
    } catch {
      return false;
    }
    setJustSaved(false);
    setSaveForm(null);
    setDraft((d) => {
      if (d.moves[cursor]?.san === san) return d; // same as the existing next move: just step forward
      return { ...d, moves: [...d.moves.slice(0, cursor), { san, comment: "" }] };
    });
    setCursor(cursor + 1);
    return true;
  }

  function setComment(text: string) {
    setJustSaved(false);
    setDraft((d) =>
      cursor === 0
        ? { ...d, intro: text }
        : { ...d, moves: d.moves.map((m, i) => (i === cursor - 1 ? { ...m, comment: text } : m)) },
    );
  }

  function applyFen(value: string | null) {
    let startFen = DEFAULT_FEN;
    if (value !== null) {
      const res = normalizeFen(value);
      if (!res.fen) {
        setFenError(res.error ?? "Invalid FEN");
        return;
      }
      startFen = res.fen;
    }
    if (draft.moves.length && !confirm("Changing the start position clears this line's moves. Continue?")) return;
    setFenError("");
    setFenInput("");
    setDraft((d) => ({ ...d, startFen, moves: [] }));
    setCursor(0);
    setJustSaved(false);
  }

  function openSaveForm() {
    setSaveForm({
      name: savedLine?.name ?? `Line ${course.lines.length + 1}`,
      description: savedLine?.description ?? "",
    });
  }

  function save() {
    if (!saveForm) return;
    const name = saveForm.name.trim() || `Line ${course.lines.length + 1}`;
    const description = saveForm.description.trim();
    if (savedLine) {
      const movesChanged = !sameMoves(savedLine.moves, draft.moves) || savedLine.startFen !== draft.startFen;
      updateCourse(course.id, (c) => {
        const progress = { ...c.progress };
        if (movesChanged) delete progress[savedLine.id];
        return {
          ...c,
          progress,
          lines: c.lines.map((l) =>
            l.id === savedLine.id
              ? { ...l, name, description, startFen: draft.startFen, intro: draft.intro, moves: draft.moves }
              : l,
          ),
        };
      });
    } else {
      const line = createLine({ name, description, startFen: draft.startFen, intro: draft.intro, moves: draft.moves });
      updateCourse(course.id, (c) => ({ ...c, lines: [...c.lines, line] }));
      setDraft((d) => ({ ...d, lineId: line.id }));
    }
    setSaveForm(null);
    setJustSaved(true);
  }

  function newLine(fromHere: boolean) {
    if (!fromHere && !confirmDiscard()) return;
    setDraft((d) =>
      fromHere
        ? { lineId: null, startFen: d.startFen, intro: d.intro, moves: d.moves.slice(0, cursor) }
        : { lineId: null, startFen: d.startFen, intro: "", moves: [] },
    );
    if (!fromHere) setCursor(0);
    setJustSaved(false);
    setSaveForm(null);
  }

  function editLine(line: Line) {
    if (draft.lineId !== line.id && !confirmDiscard()) return;
    setDraft(draftFromLine(line));
    setCursor(line.moves.length);
    setJustSaved(false);
    setSaveForm(null);
    setTab("build");
  }

  function deleteLine(line: Line) {
    if (!confirm(`Delete "${line.name || "this line"}"?`)) return;
    updateCourse(course.id, (c) => {
      const progress = { ...c.progress };
      delete progress[line.id];
      return { ...c, progress, lines: c.lines.filter((l) => l.id !== line.id) };
    });
    if (draft.lineId === line.id) {
      setDraft((d) => ({ ...d, lineId: null }));
    }
  }

  function moveLine(idx: number, dir: -1 | 1) {
    updateCourse(course.id, (c) => {
      const lines = [...c.lines];
      const j = idx + dir;
      if (j < 0 || j >= lines.length) return c;
      [lines[idx], lines[j]] = [lines[j], lines[idx]];
      return { ...c, lines };
    });
  }

  async function copy(text: string, what: string) {
    setToast((await copyText(text)) ? `${what} copied` : "Couldn't access the clipboard");
  }

  const commentValue = cursor === 0 ? draft.intro : (draft.moves[cursor - 1]?.comment ?? "");

  return (
    <div className="workspace">
      <div className="board-col">
        <Material fen={fen} side={orientation === "white" ? "black" : "white"} />
        <Board fen={fen} orientation={orientation} onMove={onMove} lastMove={lastMove} />
        <Material fen={fen} side={orientation} />
      </div>

      <aside className="side panel">
        <div className="panel-head">
          <span className="panel-icon">🛠</span>
          <div className="grow">
            <h1 className="title-sm">{course.name}</h1>
            <p className="muted small">
              <a className="cat-link" href={`#/section/${course.category}`}>
                {categoryInfo(course.category).title}
              </a>{" "}
              · {stats.total} line{stats.total === 1 ? "" : "s"} · play as {course.playAs}
            </p>
          </div>
          {stats.total > 0 && (
            <button className="btn small" onClick={() => confirmDiscard() && navigate(`/course/${course.id}/learn`)}>
              Play ▶
            </button>
          )}
        </div>

        <div className="tabs">
          <button className={tab === "build" ? "active" : ""} onClick={() => setTab("build")}>
            Build
          </button>
          <button className={tab === "lines" ? "active" : ""} onClick={() => setTab("lines")}>
            Lines ({course.lines.length})
          </button>
        </div>

        {tab === "build" ? (
          <div className="tab-body">
            <p className="small muted">
              {savedLine ? (
                <>
                  Editing <b>{savedLine.name || "untitled line"}</b>
                  {dirty && " · unsaved changes"}
                </>
              ) : (
                "New line"
              )}
            </p>

            {draft.moves.length === 0 && (
              <div className="fen-box">
                <label className="label" htmlFor="fen">Start position</label>
                <div className="row">
                  <input
                    id="fen"
                    className="field mono"
                    placeholder="Paste a FEN, e.g. 1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1"
                    value={fenInput}
                    onChange={(e) => setFenInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && applyFen(fenInput)}
                  />
                  <button className="btn" disabled={!fenInput.trim()} onClick={() => applyFen(fenInput)}>
                    Set
                  </button>
                </div>
                {draft.startFen !== DEFAULT_FEN && (
                  <button className="link" onClick={() => applyFen(null)}>
                    Reset to the standard starting position
                  </button>
                )}
                {fenError && <p className="error-text">{fenError}</p>}
              </div>
            )}

            {draft.moves.length === 0 ? (
              <p className="muted italic">No moves yet. Make a move on the board to start building this line.</p>
            ) : (
              <MoveList startFen={draft.startFen} moves={draft.moves} cursor={cursor} onSelect={setCursor} saved={justSaved} />
            )}

            <label className="label" htmlFor="comment">
              {cursor === 0 ? "Note before the first move" : `Note for ${draft.moves[cursor - 1]?.san}`}
            </label>
            <textarea
              id="comment"
              className="field"
              rows={3}
              placeholder={cursor === 0 ? "Introduce the position…" : "Explain this move — the coach shows it in Learn mode"}
              value={commentValue}
              onChange={(e) => setComment(e.target.value)}
            />

            {saveForm ? (
              <div className="save-form">
                <input
                  className="field"
                  placeholder="Line name"
                  value={saveForm.name}
                  autoFocus
                  onChange={(e) => setSaveForm({ ...saveForm, name: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && save()}
                />
                <textarea
                  className="field"
                  rows={2}
                  placeholder="Description (shown when the line is completed)"
                  value={saveForm.description}
                  onChange={(e) => setSaveForm({ ...saveForm, description: e.target.value })}
                />
                <div className="row">
                  <button className="btn primary" onClick={save}>
                    {savedLine ? "Save changes" : "Add to course"}
                  </button>
                  <button className="btn ghost" onClick={() => setSaveForm(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : justSaved ? (
              <div className="stack">
                <p className="success-text">✓ Line saved to the course.</p>
                <button className="btn primary wide" onClick={() => newLine(false)}>
                  ↺ Return to start and add more lines
                </button>
                {cursor > 0 && (
                  <button className="btn wide" onClick={() => newLine(true)}>
                    Branch a new line from move {cursor}
                  </button>
                )}
              </div>
            ) : (
              draft.moves.length > 0 && (
                <div className="stack">
                  <button className="btn primary wide" onClick={openSaveForm}>
                    ⚑ {savedLine ? "Save line" : "End line and add to the course"}
                  </button>
                  {savedLine && (
                    <button className="btn wide" onClick={() => newLine(false)}>
                      New line from the start position
                    </button>
                  )}
                </div>
              )
            )}

            <div className="nav-row">
              <button className="icon-btn" title="Flip board" onClick={() => setFlipped((f) => !f)}>
                ⇅
              </button>
              {cursor < draft.moves.length && (
                <button
                  className="btn ghost small"
                  onClick={() => {
                    setDraft((d) => ({ ...d, moves: d.moves.slice(0, cursor) }));
                    setJustSaved(false);
                  }}
                >
                  Delete moves after here
                </button>
              )}
              <span className="grow" />
              <button className="icon-btn" title="Start" disabled={cursor === 0} onClick={() => setCursor(0)}>
                ⏮
              </button>
              <button className="icon-btn" title="Back (←)" disabled={cursor === 0} onClick={() => setCursor(cursor - 1)}>
                ‹
              </button>
              <button
                className="icon-btn"
                title="Forward (→)"
                disabled={cursor >= draft.moves.length}
                onClick={() => setCursor(cursor + 1)}
              >
                ›
              </button>
              <button
                className="icon-btn"
                title="End"
                disabled={cursor >= draft.moves.length}
                onClick={() => setCursor(draft.moves.length)}
              >
                ⏭
              </button>
            </div>
          </div>
        ) : (
          <div className="tab-body">
            <div className="row wrap">
              <button className="btn" disabled={!course.lines.length} onClick={() => exportCoursePgn(course)}>
                ⬇ Export PGN
              </button>
              <button className="btn" onClick={() => exportCourseJson(course)}>
                ⬇ Backup (.json)
              </button>
              <button
                className="btn"
                disabled={!course.lines.length}
                onClick={() => copy(course.lines.map((l) => lineToPgn(l, course.name)).join("\n"), "Course PGN")}
              >
                Copy PGN
              </button>
            </div>

            {course.lines.length === 0 ? (
              <p className="muted italic">No lines yet. Record one in the Build tab or import below.</p>
            ) : (
              <ol className="line-list">
                {course.lines.map((l, idx) => {
                  const p = progressOf(course, l.id);
                  return (
                    <li key={l.id} className={draft.lineId === l.id ? "current" : ""}>
                      <div className="line-main" onClick={() => editLine(l)} role="button" tabIndex={0}>
                        <div className="line-title">
                          <span className="line-no">#{idx + 1}</span> {l.name || "Untitled line"}
                          {l.moves.length === 0 ? (
                            <span className="badge warn">needs moves</span>
                          ) : p.perfected ? (
                            <span className="badge good">perfected</span>
                          ) : p.learned ? (
                            <span className="badge">learned</span>
                          ) : null}
                        </div>
                        {l.description && <div className="small muted">{l.description}</div>}
                        <div className="small muted mono clamp1">
                          {l.moves.length
                            ? l.moves.map((m) => m.san).join(" ")
                            : l.startFen}
                        </div>
                      </div>
                      <div className="line-actions">
                        <button className="icon-btn" title="Edit" onClick={() => editLine(l)}>✎</button>
                        {l.moves.length > 0 && (
                          <button
                            className="icon-btn"
                            title="Learn this line"
                            onClick={() => confirmDiscard() && navigate(`/course/${course.id}/learn?line=${l.id}`)}
                          >
                            ▶
                          </button>
                        )}
                        <button className="icon-btn" title="Copy PGN" onClick={() => copy(lineToPgn(l, course.name), "PGN")}>
                          PGN
                        </button>
                        <button className="icon-btn" title="Copy start FEN" onClick={() => copy(l.startFen, "FEN")}>
                          FEN
                        </button>
                        <button className="icon-btn" title="Move up" disabled={idx === 0} onClick={() => moveLine(idx, -1)}>
                          ↑
                        </button>
                        <button
                          className="icon-btn"
                          title="Move down"
                          disabled={idx === course.lines.length - 1}
                          onClick={() => moveLine(idx, 1)}
                        >
                          ↓
                        </button>
                        <button className="icon-btn danger" title="Delete" onClick={() => deleteLine(l)}>
                          🗑
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}

            <details className="section">
              <summary>Import PGN / FEN</summary>
              <ImportBox
                compact
                onImport={(lines) => updateCourse(course.id, (c) => ({ ...c, lines: [...c.lines, ...lines] }))}
              />
            </details>

            <details className="section">
              <summary>Course details</summary>
              <CourseDetails course={course} updateCourse={updateCourse} />
            </details>
          </div>
        )}
        {toast && <div className="toast">{toast}</div>}
      </aside>
    </div>
  );
}

function CourseDetails({ course, updateCourse }: { course: Course; updateCourse: UpdateCourse }) {
  return (
    <div className="stack">
      <label className="label" htmlFor="cd-name">Name</label>
      <input
        id="cd-name"
        className="field"
        value={course.name}
        onChange={(e) => updateCourse(course.id, (c) => ({ ...c, name: e.target.value }))}
      />
      <label className="label" htmlFor="cd-desc">Description</label>
      <textarea
        id="cd-desc"
        className="field"
        rows={2}
        value={course.description}
        onChange={(e) => updateCourse(course.id, (c) => ({ ...c, description: e.target.value }))}
      />
      <span className="label">Section</span>
      <div className="segmented three">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            className={course.category === cat.id ? "active" : ""}
            onClick={() => updateCourse(course.id, (c) => ({ ...c, category: cat.id }))}
          >
            {cat.icon} {cat.title}
          </button>
        ))}
      </div>
      <span className="label">Play as</span>
      <div className="segmented">
        {(["white", "black"] as const).map((s) => (
          <button
            key={s}
            className={course.playAs === s ? "active" : ""}
            onClick={() => {
              if (course.playAs === s) return;
              if (!confirm(`Play this course as ${s}? Learn and practice progress will be reset.`)) return;
              updateCourse(course.id, (c) => ({ ...c, playAs: s, progress: {} }));
            }}
          >
            {s === "white" ? "♔ White" : "♚ Black"}
          </button>
        ))}
      </div>
      <p className="small muted">Changing sides resets learn/practice progress.</p>
    </div>
  );
}
