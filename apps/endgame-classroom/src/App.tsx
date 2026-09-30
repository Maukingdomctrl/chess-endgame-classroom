import type { Course } from "./types";
import { setCourses, useCourseStore } from "./lib/store";
import { navigate, useRoute } from "./lib/router";
import Home from "./pages/Home";
import Section from "./pages/Section";
import { CATEGORIES, isCategory } from "./lib/categories";
import NewCourse from "./pages/NewCourse";
import Builder from "./pages/Builder";
import Trainer from "./pages/Trainer";

export type UpdateCourse = (id: string, fn: (c: Course) => Course) => void;

const updateCourse: UpdateCourse = (id, fn) =>
  setCourses((cs) => cs.map((c) => (c.id === id ? { ...fn(c), updatedAt: Date.now() } : c)));
const addCourse = (c: Course) => setCourses((cs) => [c, ...cs]);
const deleteCourse = (id: string) => setCourses((cs) => cs.filter((c) => c.id !== id));

export default function App() {
  const { courses, saveError } = useCourseStore();
  const { parts, query } = useRoute();

  let page;
  const course = parts[0] === "course" ? courses.find((c) => c.id === parts[1]) : undefined;
  const category = query.get("category");
  const activeSection = parts[0] === "section" ? parts[1] : course?.category;
  if (parts[0] === "new") {
    page = <NewCourse key={category ?? ""} onCreate={addCourse} initialCategory={isCategory(category) ? category : null} />;
  } else if (parts[0] === "section" && isCategory(parts[1])) {
    page = <Section category={parts[1]} courses={courses} onDelete={deleteCourse} />;
  } else if (parts[0] === "course" && !course) {
    page = (
      <div className="empty">
        <p>That course doesn't exist on this device.</p>
        <button className="btn" onClick={() => navigate("/")}>Back to courses</button>
      </div>
    );
  } else if (course && parts[2] === "build") {
    page = <Builder key={course.id} course={course} updateCourse={updateCourse} initialLineId={query.get("line")} initialTab={query.get("tab")} />;
  } else if (course && (parts[2] === "learn" || parts[2] === "practice")) {
    page = (
      <Trainer
        key={`${course.id}-${parts[2]}-${query.get("line") ?? ""}`}
        course={course}
        mode={parts[2]}
        startLineId={query.get("line")}
        updateCourse={updateCourse}
      />
    );
  } else {
    page = <Home courses={courses} onAdd={addCourse} onDelete={deleteCourse} />;
  }

  return (
    <div className="shell">
      <header className="topbar">
        <a className="brand" href="#/">
          <span className="brand-icon">♚</span> Endgame Classroom
        </a>
        <nav className="topnav" aria-label="Sections">
          {CATEGORIES.map((c) => (
            <a
              key={c.id}
              href={`#/section/${c.id}`}
              className={`cat-${c.id}${activeSection === c.id ? " active" : ""}`}
              aria-current={activeSection === c.id ? "page" : undefined}
            >
              {c.title}
            </a>
          ))}
        </nav>
      </header>
      {saveError && (
        <div className="banner error">
          Couldn't save to this browser's storage (private window or storage full). Export your courses to keep them.
        </div>
      )}
      <main>{page}</main>
    </div>
  );
}
