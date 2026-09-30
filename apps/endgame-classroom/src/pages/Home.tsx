import { useMemo, useState } from "react";
import { Chessboard } from "react-chessboard";
import type { Course } from "../types";
import { navigate } from "../lib/router";
import { pct } from "../lib/stats";
import { CATEGORIES, categoryStats } from "../lib/categories";
import { parseCourseBackup } from "../lib/exporting";
import { searchCourses } from "../lib/search";
import CourseGrid from "../components/CourseGrid";

interface Props {
  courses: Course[];
  onAdd: (c: Course) => void;
  onDelete: (id: string) => void;
}

export default function Home({ courses, onAdd, onDelete }: Props) {
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const searching = query.trim() !== "";
  const result = useMemo(() => (searching ? searchCourses(courses, query) : null), [courses, query, searching]);
  const matchedCourses = result ? courses.filter((c) => result.courseIds.has(c.id)) : [];

  async function importBackup(files: FileList | null) {
    if (!files?.length) return;
    try {
      for (const f of files) parseCourseBackup(await f.text()).forEach(onAdd);
      setError("");
    } catch {
      setError("That file isn't a valid course backup (.json). To import PGN, create a course first.");
    }
  }

  return (
    <div className="page">
      <section className="hero">
        <p className="eyebrow">Your chess classroom</p>
        <h1>Study every phase of the game</h1>
        <p className="muted">Build courses from PGNs and FENs, then learn and practice them line by line.</p>
        <div className="row center wrap">
          <button className="btn primary" onClick={() => navigate("/new")}>
            ＋ Create a Course
          </button>
          <label className="btn ghost file-btn">
            Import course backup (.json)
            <input
              type="file"
              accept=".json,application/json"
              multiple
              onChange={(e) => {
                importBackup(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        {error && <p className="error-text">{error}</p>}
        {courses.length > 0 && (
          <div className="search">
            <span className="search-icon" aria-hidden="true">⌕</span>
            <input
              type="search"
              className="field"
              placeholder="Search lines, notes and courses — or paste a FEN to find a position"
              aria-label="Search courses, lines and positions"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setQuery("")}
            />
            {searching && (
              <button className="icon-btn search-clear" aria-label="Clear search" onClick={() => setQuery("")}>
                ✕
              </button>
            )}
          </div>
        )}
      </section>

      {result ? (
        <section className="results">
          <h2 className="results-title">
            {result.hits.length === 0
              ? result.isPosition
                ? "No line reaches this position."
                : "No lines match."
              : `${result.hits.length} line${result.hits.length === 1 ? "" : "s"}${result.isPosition ? (result.hits.length === 1 ? " reaches this position" : " reach this position") : " found"}`}
          </h2>
          {result.hits.length > 0 && (
            <ul className="hit-list">
              {result.hits.slice(0, 40).map((h) => {
                const playable = h.line.moves.length > 0;
                return (
                  <li key={`${h.course.id}-${h.line.id}`} className={`hit cat-${h.course.category}`}>
                    <div className="hit-board">
                      <Chessboard
                        options={{
                          id: `hit-${h.line.id}`,
                          position: h.fen,
                          boardOrientation: h.course.playAs,
                          allowDragging: false,
                          showNotation: false,
                          darkSquareStyle: { backgroundColor: "#b58863" },
                          lightSquareStyle: { backgroundColor: "#f0d9b5" },
                        }}
                      />
                    </div>
                    <div className="hit-body">
                      <div className="hit-title">
                        {h.line.name || "Untitled line"} <span className="muted small">· {h.course.name} #{h.index + 1}</span>
                      </div>
                      <div className="small muted">Matched in {h.where}</div>
                      {h.snippet && <div className="small clamp1">{h.snippet}</div>}
                      <div className="row wrap">
                        <button
                          className="btn small primary"
                          disabled={!playable}
                          onClick={() => navigate(`/course/${h.course.id}/learn?line=${h.line.id}`)}
                        >
                          Learn
                        </button>
                        <button
                          className="btn small"
                          disabled={!playable}
                          onClick={() => navigate(`/course/${h.course.id}/practice?line=${h.line.id}`)}
                        >
                          Practice
                        </button>
                        <button
                          className="btn small ghost"
                          onClick={() => navigate(`/course/${h.course.id}/build?line=${h.line.id}`)}
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {result.hits.length > 40 && <p className="small muted">Showing the first 40 — refine your search to see more.</p>}
          {matchedCourses.length > 0 && (
            <>
              <h2 className="results-title">Courses</h2>
              <CourseGrid courses={matchedCourses} onDelete={onDelete} showCategory />
            </>
          )}
        </section>
      ) : (
        <section className="sections" aria-label="Sections">
          {CATEGORIES.map((cat) => {
            const s = categoryStats(courses, cat.id);
            return (
              <a key={cat.id} className={`section-tile cat-${cat.id}`} href={`#/section/${cat.id}`}>
                <span className="tile-icon" aria-hidden="true">
                  {cat.icon}
                </span>
                <span className="tile-title">{cat.title}</span>
                <span className="tile-blurb">{cat.blurb}</span>
                <span className="tile-stats">
                  <span>
                    <b>{s.courses}</b> course{s.courses === 1 ? "" : "s"}
                  </span>
                  <span>
                    <b>{s.total}</b> line{s.total === 1 ? "" : "s"}
                  </span>
                </span>
                <span className="tile-progress">
                  <span className="stack-bar">
                    <span className="bar-learned" style={{ width: pct(s.learned, s.total) }} />
                    <span className="bar-perfected" style={{ width: pct(s.perfected, s.total) }} />
                  </span>
                  <span className="small muted">
                    {s.total ? `${s.learned} learned · ${s.perfected} perfected` : "No lines yet"}
                  </span>
                </span>
                <span className="tile-cta">Open {cat.title} →</span>
              </a>
            );
          })}
        </section>
      )}
    </div>
  );
}
