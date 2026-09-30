import { useState } from "react";
import { Chessboard } from "react-chessboard";
import type { Course } from "../types";
import { navigate } from "../lib/router";
import { courseStats, pct } from "../lib/stats";
import { categoryInfo } from "../lib/categories";
import { DEFAULT_FEN } from "../lib/chess";
import { exportCourseJson, exportCoursePgn } from "../lib/exporting";

interface Props {
  courses: Course[];
  onDelete: (id: string) => void;
  /** Show which section each course belongs to (used for mixed lists like search results). */
  showCategory?: boolean;
}

export default function CourseGrid({ courses, onDelete, showCategory }: Props) {
  const [menu, setMenu] = useState<string | null>(null);

  return (
    <div className="grid">
      {courses.map((c) => {
        const s = courseStats(c);
        const first = c.lines[0];
        const cat = categoryInfo(c.category);
        return (
          <article className={`card cat-${c.category}`} key={c.id}>
            <div className="card-board">
              <Chessboard
                options={{
                  id: `mini-${c.id}`,
                  position: first?.startFen ?? DEFAULT_FEN,
                  boardOrientation: c.playAs,
                  allowDragging: false,
                  showNotation: false,
                  darkSquareStyle: { backgroundColor: "#b58863" },
                  lightSquareStyle: { backgroundColor: "#f0d9b5" },
                }}
              />
            </div>
            <div className="card-body">
              <div className="card-head">
                <div className="grow">
                  {showCategory && (
                    <span className="cat-chip">
                      {cat.icon} {cat.title}
                    </span>
                  )}
                  <h2>{c.name}</h2>
                </div>
                <div className="menu-wrap">
                  <button className="icon-btn" aria-label="Course menu" onClick={() => setMenu(menu === c.id ? null : c.id)}>
                    ⋮
                  </button>
                  {menu === c.id && (
                    <div className="menu" onMouseLeave={() => setMenu(null)}>
                      <button onClick={() => navigate(`/course/${c.id}/build`)}>Edit course</button>
                      <button onClick={() => exportCoursePgn(c)}>Export PGN</button>
                      <button onClick={() => exportCourseJson(c)}>Export backup (.json)</button>
                      <button
                        className="danger"
                        onClick={() => {
                          if (confirm(`Delete "${c.name}" and all its lines? This can't be undone.`)) onDelete(c.id);
                          setMenu(null);
                        }}
                      >
                        Delete course
                      </button>
                    </div>
                  )}
                </div>
              </div>
              {c.description && <p className="muted clamp">{c.description}</p>}
              <p className="small muted">
                Play as {c.playAs} · {s.total} line{s.total === 1 ? "" : "s"}
                {s.drafts > 0 && ` · ${s.drafts} without moves`}
              </p>
              <div className="stack-bar" title={`${s.perfected} perfected, ${s.learned} learned of ${s.total}`}>
                <span className="bar-learned" style={{ width: pct(s.learned, s.total) }} />
                <span className="bar-perfected" style={{ width: pct(s.perfected, s.total) }} />
              </div>
              <p className="small muted">
                {s.learned}/{s.total} learned · {s.perfected}/{s.total} perfected
              </p>
              <div className="row">
                {s.total > 0 ? (
                  <>
                    <button className="btn primary" onClick={() => navigate(`/course/${c.id}/learn`)}>
                      {s.learned === 0 ? "Start learning →" : "Learn →"}
                    </button>
                    <button
                      className="btn"
                      disabled={s.learned === 0}
                      title={s.learned === 0 ? "Learn a line first" : ""}
                      onClick={() => navigate(`/course/${c.id}/practice`)}
                    >
                      Practice
                    </button>
                  </>
                ) : (
                  <button className="btn primary" onClick={() => navigate(`/course/${c.id}/build`)}>
                    Add lines →
                  </button>
                )}
                <button className="btn ghost" onClick={() => navigate(`/course/${c.id}/build`)}>
                  Edit
                </button>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
