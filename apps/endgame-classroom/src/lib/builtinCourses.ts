import kingAndPawnPgn from "../../courses/king-and-pawn-course.pgn?raw";
import type { Category, Course, Line, Side } from "../types";
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

/** Short fingerprint of a course's PGN, so a changed file (a newer app version) can be detected. */
export function pgnHash(text: string) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function builtinToCourse(b: BuiltinCourse): Course {
  const { lines } = importPgn(b.pgn);
  return { ...createCourse(b.name, b.description, b.playAs, b.category), lines, builtinId: b.id, builtinHash: pgnHash(b.pgn) };
}

const PLACEHOLDER_NAMES = new Set(["", "Untitled course"]);

/**
 * Brings a copy of a built-in course up to date with the bundled PGN. Lines are matched by name:
 * a matching line keeps its id (and so its progress, unless its moves changed); lines the user
 * added themselves are kept at the end.
 */
function refreshBuiltin(c: Course, b: BuiltinCourse): Course {
  const fresh = importPgn(b.pgn).lines;
  const oldByName = new Map(c.lines.map((l) => [l.name, l]));
  const freshNames = new Set(fresh.map((l) => l.name));
  const progress: Course["progress"] = {};
  const lines: Line[] = fresh.map((l) => {
    const old = oldByName.get(l.name);
    if (!old) return l;
    const sameMoves = old.startFen === l.startFen && old.moves.map((m) => m.san).join(" ") === l.moves.map((m) => m.san).join(" ");
    if (sameMoves && c.progress[old.id]) progress[old.id] = c.progress[old.id];
    return { ...l, id: old.id };
  });
  const own = c.lines.filter((l) => !freshNames.has(l.name));
  for (const l of own) if (c.progress[l.id]) progress[l.id] = c.progress[l.id];
  return {
    ...c,
    name: PLACEHOLDER_NAMES.has(c.name.trim()) ? b.name : c.name,
    description: c.description || b.description,
    lines: [...lines, ...own],
    progress,
    builtinHash: pgnHash(b.pgn),
  };
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
  // Refresh copies built from an older version of the bundled PGN (or adopted hand imports).
  for (const b of BUILTIN_COURSES) {
    const hash = pgnHash(b.pgn);
    if (out.some((c) => c.builtinId === b.id && c.builtinHash !== hash)) {
      out = out.map((c) => (c.builtinId === b.id && c.builtinHash !== hash ? refreshBuiltin(c, b) : c));
      changed = true;
    }
  }
  saveOffered(offered);
  return changed ? out : null;
}

/** Built-in courses of a section that are not in the user's library (e.g. after deleting them). */
export function missingBuiltins(courses: Course[], category: Category) {
  return BUILTIN_COURSES.filter((b) => b.category === category && !courses.some((c) => c.builtinId === b.id));
}
