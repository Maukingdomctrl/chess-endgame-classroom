import type { Category, Course } from "../types";
import { courseStats } from "./stats";

export interface CategoryInfo {
  id: Category;
  title: string;
  singular: string;
  blurb: string;
  icon: string;
  namePlaceholder: string;
  descPlaceholder: string;
}

export const CATEGORIES: CategoryInfo[] = [
  {
    id: "opening",
    title: "Openings",
    singular: "Opening",
    blurb: "Repertoires, move orders and the traps worth knowing.",
    icon: "♘",
    namePlaceholder: "Sicilian Najdorf repertoire",
    descPlaceholder: "Main lines and sidelines against 1.e4",
  },
  {
    id: "middlegame",
    title: "Middlegame",
    singular: "Middlegame",
    blurb: "Plans, typical structures and tactical patterns.",
    icon: "♗",
    namePlaceholder: "Isolated queen's pawn plans",
    descPlaceholder: "Attacking and blockading ideas in IQP positions",
  },
  {
    id: "endgame",
    title: "Endgame",
    singular: "Endgame",
    blurb: "Key positions, technique and converting the win.",
    icon: "♔",
    namePlaceholder: "Rook endgames essentials",
    descPlaceholder: "Lucena, Philidor and the key rook-endgame techniques",
  },
];

export function categoryInfo(id: Category): CategoryInfo {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[2];
}

export function isCategory(v: string | null | undefined): v is Category {
  return v === "opening" || v === "middlegame" || v === "endgame";
}

export function categoryStats(courses: Course[], id: Category) {
  const list = courses.filter((c) => c.category === id);
  let total = 0;
  let learned = 0;
  let perfected = 0;
  for (const c of list) {
    const s = courseStats(c);
    total += s.total;
    learned += s.learned;
    perfected += s.perfected;
  }
  return { courses: list.length, total, learned, perfected };
}
