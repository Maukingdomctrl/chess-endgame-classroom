import type { Side } from "../types";
import { materialEdge } from "../lib/chess";

const GLYPHS: Record<string, string> = { q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };

/** Shows the pieces `side` is up, e.g. "♟ +1". Renders an empty row when level. */
export default function Material({ fen, side }: { fen: string; side: Side }) {
  let edge;
  try {
    edge = materialEdge(fen, side);
  } catch {
    return <div className="material" />;
  }
  const up = (["q", "r", "b", "n", "p"] as const).flatMap((t) =>
    Array.from({ length: Math.max(0, edge.count[t] ?? 0) }, () => GLYPHS[t]),
  );
  return (
    <div className="material" aria-label="Material balance">
      {up.join("")}
      {edge.score > 0 && <span> +{edge.score}</span>}
    </div>
  );
}
