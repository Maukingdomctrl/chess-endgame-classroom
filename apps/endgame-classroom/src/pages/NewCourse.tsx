import { useState } from "react";
import type { Category, Course, Line, Side } from "../types";
import { createCourse } from "../lib/storage";
import { CATEGORIES, categoryInfo } from "../lib/categories";
import { navigate } from "../lib/router";
import ImportBox from "../components/ImportBox";

interface Props {
  onCreate: (c: Course) => void;
  /** Section the user came from, if any. */
  initialCategory: Category | null;
}

export default function NewCourse({ onCreate, initialCategory }: Props) {
  const [category, setCategory] = useState<Category>(initialCategory ?? "endgame");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [playAs, setPlayAs] = useState<Side>("white");

  function create(lines: Line[] = []) {
    const course = { ...createCourse(name, description, playAs, category), lines };
    onCreate(course);
    navigate(`/course/${course.id}/build${lines.length ? "?tab=lines" : ""}`);
  }

  return (
    <div className="page narrow">
      <nav className="crumbs">
        {initialCategory ? (
          <a href={`#/section/${initialCategory}`}>← {categoryInfo(initialCategory).title}</a>
        ) : (
          <a href="#/">← All sections</a>
        )}
      </nav>
      <div className="panel">
        <div className="panel-head">
          <span className="panel-icon">🛠</span>
          <div>
            <h1>New Course</h1>
            <p className="muted">Build your own {categoryInfo(category).singular.toLowerCase()} course</p>
          </div>
        </div>

        <span className="label">Section</span>
        <div className="segmented three">
          {CATEGORIES.map((c) => (
            <button key={c.id} className={category === c.id ? "active" : ""} onClick={() => setCategory(c.id)}>
              {c.icon} {c.title}
            </button>
          ))}
        </div>

        <label className="label" htmlFor="course-name">Name</label>
        <input
          id="course-name"
          className="field"
          placeholder={categoryInfo(category).namePlaceholder}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <label className="label" htmlFor="course-desc">Description</label>
        <textarea
          id="course-desc"
          className="field"
          rows={3}
          placeholder={categoryInfo(category).descPlaceholder}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <span className="label">Play as</span>
        <div className="segmented">
          {(["white", "black"] as const).map((s) => (
            <button key={s} className={playAs === s ? "active" : ""} onClick={() => setPlayAs(s)}>
              {s === "white" ? "♔ White" : "♚ Black"}
            </button>
          ))}
        </div>

        <button className="btn primary wide" onClick={() => create()}>
          Start Building →
        </button>

        <div className="divider">
          <span>or import</span>
        </div>
        <ImportBox onImport={(lines) => create(lines)} />
      </div>
    </div>
  );
}
