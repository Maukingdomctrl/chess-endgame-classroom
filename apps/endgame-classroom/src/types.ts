export type Side = "white" | "black";

export type Category = "opening" | "middlegame" | "endgame";

export type MarkColor = "G" | "R" | "Y" | "B";

/** Coloured squares and arrows for the position after a move (PGN [%csl]/[%cal]). */
export interface Marks {
  squares: { square: string; color: MarkColor }[];
  arrows: { from: string; to: string; color: MarkColor }[];
}

export interface LineMove {
  san: string;
  /** Coach note shown after this move is played. */
  comment: string;
  marks?: Marks;
}

export interface Line {
  id: string;
  name: string;
  description: string;
  startFen: string;
  /** Note shown before the first move. */
  intro: string;
  /** Marks for the starting position. */
  introMarks?: Marks;
  moves: LineMove[];
}

export interface LineProgress {
  learned: boolean;
  perfected: boolean;
  /** Mistakes (wrong moves or hints) in the most recent practice run. */
  lastMistakes: number;
  practiceRuns: number;
}

export interface Course {
  id: string;
  name: string;
  description: string;
  playAs: Side;
  category: Category;
  lines: Line[];
  progress: Record<string, LineProgress>;
  createdAt: number;
  updatedAt: number;
}

/** A game in the Chess TV library: stored as imported, watched rather than trained. */
export interface TvGame {
  id: string;
  /** PGN tags such as White, Black, Event, Site, Date, Result, ECO. */
  headers: Record<string, string>;
  startFen: string;
  /** Comment before the first move. */
  intro: string;
  introMarks?: Marks;
  moves: LineMove[];
}

export interface TvCollection {
  id: string;
  name: string;
  description: string;
  /** Cover photo: a small JPEG data URL, or an https image link. */
  cover?: string;
  games: TvGame[];
  createdAt: number;
}
