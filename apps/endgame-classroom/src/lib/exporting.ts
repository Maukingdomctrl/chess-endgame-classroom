import type { Course } from "../types";
import { linesToPgn } from "./pgn";
import { downloadFile, newId, normalizeCourse, slugify } from "./storage";

export function exportCoursePgn(course: Course) {
  downloadFile(`${slugify(course.name)}.pgn`, linesToPgn(course.lines, course.name), "application/x-chess-pgn");
}

export function exportCourseJson(course: Course) {
  downloadFile(`${slugify(course.name)}.json`, JSON.stringify(course, null, 2), "application/json");
}

/** Reads a course backup (.json). Always assigns fresh ids so re-importing never overwrites. */
export function parseCourseBackup(text: string): Course[] {
  const data = JSON.parse(text);
  const list = Array.isArray(data) ? data : [data];
  return list.map((raw) => {
    const c = normalizeCourse(raw);
    const idMap = new Map<string, string>();
    const lines = c.lines.map((l) => {
      const id = newId();
      idMap.set(l.id, id);
      return { ...l, id };
    });
    const progress: Course["progress"] = {};
    for (const [oldId, p] of Object.entries(c.progress)) {
      const id = idMap.get(oldId);
      if (id) progress[id] = p;
    }
    return { ...c, id: newId(), lines, progress };
  });
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
