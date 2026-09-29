import type { Course, Line } from "../types";
import { lineFens, looksLikeFen } from "./chess";

export interface LineHit {
  course: Course;
  line: Line;
  index: number;
  /** Where the match was found, e.g. "name", "note on Rd4", "position after move 3". */
  where: string;
  snippet: string;
  /** Position to preview (the matched position for FEN searches, else the start). */
  fen: string;
}

export interface SearchResult {
  courseIds: Set<string>;
  hits: LineHit[];
  isPosition: boolean;
}

function norm(s: string) {
  return s.toLowerCase();
}

function allTerms(haystack: string, terms: string[]) {
  const h = norm(haystack);
  return terms.every((t) => h.includes(t));
}

/** Compares piece placement, plus side to move when the query includes it. */
function samePosition(fen: string, query: string[]) {
  const parts = fen.split(" ");
  return parts[0] === query[0] && (!query[1] || parts[1] === query[1]);
}

export function searchCourses(courses: Course[], rawQuery: string): SearchResult {
  const q = rawQuery.trim();
  const hits: LineHit[] = [];
  const courseIds = new Set<string>();
  const isPosition = looksLikeFen(q);

  if (isPosition) {
    const query = q.split(/\s+/);
    for (const course of courses) {
      course.lines.forEach((line, index) => {
        const fens = lineFens(line);
        const ply = fens.findIndex((f) => samePosition(f, query));
        if (ply === -1) return;
        courseIds.add(course.id);
        hits.push({
          course,
          line,
          index,
          where: ply === 0 ? "start position" : `position after ${line.moves[ply - 1].san}`,
          snippet: line.description || line.intro,
          fen: fens[ply],
        });
      });
    }
    return { courseIds, hits, isPosition };
  }

  const terms = norm(q).split(/\s+/).filter(Boolean);
  if (!terms.length) return { courseIds, hits, isPosition };

  for (const course of courses) {
    if (allTerms(`${course.name} ${course.description}`, terms)) courseIds.add(course.id);
    course.lines.forEach((line, index) => {
      const moves = line.moves.map((m) => m.san).join(" ");
      const notes = [line.intro, ...line.moves.map((m) => m.comment)].filter(Boolean);
      const whole = `${course.name} ${line.name} ${line.description} ${notes.join(" ")} ${moves}`;
      if (!allTerms(whole, terms)) return;

      let where = "course";
      let snippet = line.description;
      if (allTerms(line.name, terms)) where = "name";
      else if (allTerms(line.description, terms)) where = "description";
      else {
        const noteIdx = [line.intro, ...line.moves.map((m) => m.comment)].findIndex(
          (n) => n && terms.some((t) => norm(n).includes(t)),
        );
        if (noteIdx >= 0) {
          where = noteIdx === 0 ? "intro" : `note on ${line.moves[noteIdx - 1].san}`;
          snippet = noteIdx === 0 ? line.intro : line.moves[noteIdx - 1].comment;
        } else if (terms.some((t) => norm(moves).includes(t))) {
          where = "moves";
          snippet = moves;
        }
      }
      courseIds.add(course.id);
      hits.push({ course, line, index, where, snippet, fen: line.startFen });
    });
  }
  return { courseIds, hits, isPosition };
}
