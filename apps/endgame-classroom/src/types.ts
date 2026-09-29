export type Side = "white" | "black";

export interface LineMove {
  san: string;
  /** Coach note shown after this move is played. */
  comment: string;
}

export interface Line {
  id: string;
  name: string;
  description: string;
  startFen: string;
  /** Note shown before the first move. */
  intro: string;
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
  lines: Line[];
  progress: Record<string, LineProgress>;
  createdAt: number;
  updatedAt: number;
}
