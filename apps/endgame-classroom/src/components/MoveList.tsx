import type { LineMove } from "../types";
import { moveNumberLabel } from "../lib/chess";

interface Props {
  startFen: string;
  moves: LineMove[];
  /** Number of moves played in the current view (0 = start). */
  cursor: number;
  onSelect?: (cursor: number) => void;
  saved?: boolean;
}

export default function MoveList({ startFen, moves, cursor, onSelect, saved }: Props) {
  if (moves.length === 0) return null;
  return (
    <div className={`movelist${saved ? " saved" : ""}`}>
      {moves.map((m, i) => {
        const { moveNo, whiteToMove } = moveNumberLabel(startFen, i);
        const label = whiteToMove ? `${moveNo}.` : i === 0 ? `${moveNo}...` : "";
        return (
          <span key={i} className="ml-item">
            {label && <span className="ml-no">{label}</span>}
            <button
              className={`ml-move${cursor === i + 1 ? " current" : ""}${m.comment ? " has-comment" : ""}`}
              onClick={() => onSelect?.(i + 1)}
              title={m.comment || undefined}
            >
              {m.san}
            </button>
          </span>
        );
      })}
    </div>
  );
}
