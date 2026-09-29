import { useState } from "react";
import type { Course, Line, Side } from "../types";
import { createCourse } from "../lib/storage";
import { navigate } from "../lib/router";
import ImportBox from "../components/ImportBox";

interface Props {
  onCreate: (c: Course) => void;
}

export default function NewCourse({ onCreate }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [playAs, setPlayAs] = useState<Side>("white");

  function create(lines: Line[] = []) {
    const course = { ...createCourse(name, description, playAs), lines };
    onCreate(course);
    navigate(`/course/${course.id}/build${lines.length ? "?tab=lines" : ""}`);
  }

  return (
    <div className="page narrow">
      <div className="panel">
        <div className="panel-head">
          <span className="panel-icon">🛠</span>
          <div>
            <h1>New Course</h1>
            <p className="muted">Build your own endgame course</p>
          </div>
        </div>

        <label className="label" htmlFor="course-name">Name</label>
        <input
          id="course-name"
          className="field"
          placeholder="Rook endgames essentials"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <label className="label" htmlFor="course-desc">Description</label>
        <textarea
          id="course-desc"
          className="field"
          rows={3}
          placeholder="Lucena, Philidor and the key rook-endgame techniques"
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
