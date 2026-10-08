import type { Category, Course, Line, LineProgress, Side } from "../types";
import { DEFAULT_FEN } from "./chess";
import { cleanAlso, cleanMarks } from "./marks";

const KEY = "endgame-classroom.courses.v1";

export function newId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function loadCourses(): Course[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(normalizeCourse) : [];
  } catch {
    return [];
  }
}

export function saveCourses(courses: Course[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(courses));
    return true;
  } catch {
    return false;
  }
}

export function createCourse(
  name: string,
  description: string,
  playAs: Side,
  category: Category = "endgame",
): Course {
  const now = Date.now();
  return {
    id: newId(),
    name: name.trim() || "Untitled course",
    description: description.trim(),
    playAs,
    category,
    lines: [],
    progress: {},
    createdAt: now,
    updatedAt: now,
  };
}

export function createLine(partial: Partial<Line> = {}): Line {
  return {
    id: newId(),
    name: "",
    description: "",
    startFen: DEFAULT_FEN,
    intro: "",
    moves: [],
    ...partial,
  };
}

export const EMPTY_PROGRESS: LineProgress = {
  learned: false,
  perfected: false,
  lastMistakes: 0,
  practiceRuns: 0,
};

export function progressOf(course: Course, lineId: string): LineProgress {
  return course.progress[lineId] ?? EMPTY_PROGRESS;
}

/** Fills in missing fields so older or hand-edited JSON still loads. */
export function normalizeCourse(input: unknown): Course {
  const c = (input ?? {}) as Partial<Course>;
  const now = Date.now();
  return {
    id: typeof c.id === "string" && c.id ? c.id : newId(),
    name: typeof c.name === "string" && c.name ? c.name : "Untitled course",
    description: typeof c.description === "string" ? c.description : "",
    playAs: c.playAs === "black" ? "black" : "white",
    // Courses made before sections existed were all endgame courses.
    category: c.category === "opening" || c.category === "middlegame" ? c.category : "endgame",
    lines: Array.isArray(c.lines)
      ? c.lines.map((l) =>
          createLine({
            ...l,
            id: typeof l?.id === "string" && l.id ? l.id : newId(),
            introMarks: cleanMarks(l?.introMarks),
            moves: Array.isArray(l?.moves)
              ? l.moves.map((m) => ({
                  san: String(m?.san ?? ""),
                  comment: String(m?.comment ?? ""),
                  marks: cleanMarks(m?.marks),
                  also: cleanAlso(m?.also),
                }))
              : [],
          }),
        )
      : [],
    progress: c.progress && typeof c.progress === "object" ? c.progress : {},
    ...(typeof c.builtinId === "string" && c.builtinId ? { builtinId: c.builtinId } : {}),
    ...(typeof c.builtinHash === "string" && c.builtinHash ? { builtinHash: c.builtinHash } : {}),
    createdAt: typeof c.createdAt === "number" ? c.createdAt : now,
    updatedAt: typeof c.updatedAt === "number" ? c.updatedAt : now,
  };
}

export function downloadFile(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "course";
}
