import type { Category, Course } from "../types";
import { navigate } from "../lib/router";
import { categoryInfo, categoryStats } from "../lib/categories";
import CourseGrid from "../components/CourseGrid";

interface Props {
  category: Category;
  courses: Course[];
  onDelete: (id: string) => void;
}

export default function Section({ category, courses, onDelete }: Props) {
  const cat = categoryInfo(category);
  const list = courses.filter((c) => c.category === category);
  const s = categoryStats(courses, category);

  return (
    <div className={`page cat-${category}`}>
      <nav className="crumbs">
        <a href="#/">← All sections</a>
      </nav>

      <section className="section-head">
        <span className="section-icon" aria-hidden="true">
          {cat.icon}
        </span>
        <div className="grow">
          <h1>{cat.title}</h1>
          <p className="muted">{cat.blurb}</p>
          <p className="small muted">
            {s.courses} course{s.courses === 1 ? "" : "s"} · {s.total} line{s.total === 1 ? "" : "s"} · {s.learned}{" "}
            learned · {s.perfected} perfected
          </p>
        </div>
        <button className="btn primary" onClick={() => navigate(`/new?category=${category}`)}>
          ＋ New {cat.singular.toLowerCase()} course
        </button>
      </section>

      {list.length === 0 ? (
        <div className="empty panel">
          <span className="section-icon faded" aria-hidden="true">
            {cat.icon}
          </span>
          <p>No {cat.title.toLowerCase()} courses yet.</p>
          <button className="btn primary" onClick={() => navigate(`/new?category=${category}`)}>
            Create the first one
          </button>
        </div>
      ) : (
        <CourseGrid courses={list} onDelete={onDelete} />
      )}
    </div>
  );
}
