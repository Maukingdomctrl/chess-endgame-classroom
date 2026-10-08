import kingAndPawnPgn from "../../courses/king-and-pawn-course.pgn?raw";
import type { Category, Course, Side } from "../types";
import { importPgn } from "./pgn";
import { createCourse } from "./storage";

/** A course that ships with the app (its PGN lives in `courses/` and is bundled at build time). */
export interface BuiltinCourse {
  id: string;
  name: string;
  description: string;
  category: Category;
  playAs: Side;
  pgn: string;
  /** Name of the first line, used to recognise a copy the user imported by hand. */
  signature: string;
}

export const BUILTIN_COURSES: BuiltinCourse[] = [
  {
    id: "kp-opposition-key-squares",
    name: "King & Pawn: Opposition and Key Squares",
    description:
      "50 positions in 17 lessons that master one idea: key squares and the opposition. Every move is verified with an exact endgame solver.",
    category: "endgame",
    playAs: "white",
    pgn: kingAndPawnPgn,
    signature: "01. Key squares: pawn on the 4th rank (1/3)",
  },
];

// Built-ins already offered on this device. A course the user deletes is not forced back on them.
const OFFERED_KEY = "endgame-classroom.builtins.v1";

function loadOffered(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(OFFERED_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function saveOffered(ids: string[]) {
  try {
    localStorage.setItem(OFFERED_KEY, JSON.stringify(ids));
  } catch {
    /* private window: the course is simply offered again next time */
  }
}

export function builtinToCourse(b: BuiltinCourse): Course {
  const { lines } = importPgn(b.pgn);
  return { ...createCourse(b.name, b.description, b.playAs, b.category), lines, builtinId: b.id };
}

/**
 * Adds built-in courses the first time the app runs on a device. A copy the user already imported
 * by hand is adopted (tagged) instead of duplicated. Returns null when nothing changed.
 */
export function seedBuiltins(courses: Course[]): Course[] | null {
  const offered = loadOffered();
  let out = courses;
  let changed = false;
  for (const b of BUILTIN_COURSES) {
    if (out.some((c) => c.builtinId === b.id)) {
      if (!offered.includes(b.id)) offered.push(b.id);
      continue;
    }
    if (offered.includes(b.id)) continue; // deleted on purpose: offer it via "Restore" instead
    const own = out.find((c) => !c.builtinId && c.lines.some((l) => l.name === b.signature));
    out = own ? out.map((c) => (c === own ? { ...c, builtinId: b.id } : c)) : [builtinToCourse(b), ...out];
    offered.push(b.id);
    changed = true;
  }
  saveOffered(offered);
  return changed ? out : null;
}

/** Built-in courses of a section that are not in the user's library (e.g. after deleting them). */
export function missingBuiltins(courses: Course[], category: Category) {
  return BUILTIN_COURSES.filter((b) => b.category === category && !courses.some((c) => c.builtinId === b.id));
}
