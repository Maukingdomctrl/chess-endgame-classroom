import type { Course } from "../types";
import { progressOf } from "./storage";

export function courseStats(course: Course) {
  const playable = course.lines.filter((l) => l.moves.length > 0);
  const learned = playable.filter((l) => progressOf(course, l.id).learned).length;
  const perfected = playable.filter((l) => progressOf(course, l.id).perfected).length;
  return { total: playable.length, drafts: course.lines.length - playable.length, learned, perfected };
}

export function pct(n: number, total: number) {
  return total ? `${(n / total) * 100}%` : "0%";
}
