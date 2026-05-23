export type Side = "white" | "black";

export interface MoveStep {
  san: string;
  note: string;
}

export interface EndgameLine {
  id: string;
  title: string;
  startFen: string;
  sideToTrain: Side;
  difficultyElo: number; // 800..2500
  starred?: boolean;
  moves: MoveStep[];
  result: "victory";
}
