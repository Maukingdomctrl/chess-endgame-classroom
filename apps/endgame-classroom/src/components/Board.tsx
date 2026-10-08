import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Chess } from "chess.js";
import type { Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import type { Arrow, PieceDropHandlerArgs, SquareHandlerArgs } from "react-chessboard";
import type { MarkColor, Side } from "../types";
import { MARK_TINT } from "../lib/marks";

export interface BoardProps {
  fen: string;
  orientation: Side;
  /** Return true if the move was accepted. */
  onMove?: (from: string, to: string, promotion: string) => boolean;
  interactive?: boolean;
  lastMove?: { from: string; to: string } | null;
  arrows?: Arrow[];
  markSquares?: Record<string, CSSProperties>;
  /** Only pieces of this color can be moved (defaults to side to move). */
  movableColor?: "w" | "b";
  /** When false, promotions default to a queen instead of asking. */
  askPromotion?: boolean;
  /** Teaching highlights (e.g. key squares) drawn as a soft tint over the square. */
  highlights?: { square: string; color: MarkColor }[];
}

const LAST_MOVE: CSSProperties = { backgroundColor: "rgba(235, 215, 80, 0.55)" };
const SELECTED: CSSProperties = { backgroundColor: "rgba(120, 180, 255, 0.55)" };
const DOT: CSSProperties = {
  backgroundImage: "radial-gradient(circle, rgba(20,20,20,0.35) 22%, transparent 24%)",
};
const RING: CSSProperties = {
  backgroundImage: "radial-gradient(circle, transparent 62%, rgba(20,20,20,0.35) 64%)",
};

export default function Board({
  fen,
  orientation,
  onMove,
  interactive = true,
  lastMove,
  arrows = [],
  markSquares = {},
  movableColor,
  askPromotion = true,
  highlights = [],
}: BoardProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState<{ from: string; to: string; color: "w" | "b" } | null>(null);
  const [selectedFen, setSelectedFen] = useState(fen);

  // Drop the selection whenever the position changes.
  if (selectedFen !== fen) {
    setSelectedFen(fen);
    setSelected(null);
    setPending(null);
  }

  const game = useMemo(() => new Chess(fen), [fen]);
  const moverColor = movableColor ?? game.turn();

  const targets = useMemo(() => {
    if (!selected) return [];
    return game.moves({ square: selected as Square, verbose: true });
  }, [game, selected]);

  function attempt(from: string, to: string) {
    if (!onMove || !interactive) return false;
    const legal = game
      .moves({ square: from as Square, verbose: true })
      .filter((m) => m.to === to);
    if (legal.length === 0) return false;
    if (legal[0].isPromotion() && askPromotion) {
      setPending({ from, to, color: legal[0].color });
      setSelected(null);
      return false;
    }
    setSelected(null);
    return onMove(from, to, "q");
  }

  function ownPiece(square: string) {
    const p = game.get(square as Square);
    return !!p && p.color === moverColor && p.color === game.turn();
  }

  function onSquareClick({ square }: SquareHandlerArgs) {
    if (!interactive || pending) return;
    if (selected && selected !== square && targets.some((t) => t.to === square)) {
      attempt(selected, square);
      return;
    }
    setSelected(ownPiece(square) && selected !== square ? square : null);
  }

  function onPieceDrop({ sourceSquare, targetSquare }: PieceDropHandlerArgs) {
    if (!targetSquare || sourceSquare === targetSquare) return false;
    return attempt(sourceSquare, targetSquare);
  }

  const squareStyles: Record<string, CSSProperties> = {};
  if (lastMove) {
    squareStyles[lastMove.from] = LAST_MOVE;
    squareStyles[lastMove.to] = LAST_MOVE;
  }
  for (const [sq, st] of Object.entries(markSquares)) squareStyles[sq] = { ...squareStyles[sq], ...st };
  if (selected) squareStyles[selected] = { ...squareStyles[selected], ...SELECTED };
  // Layer background images so a highlight tint and a legal-move dot can share a square.
  const layers: Record<string, string[]> = {};
  const rings: Record<string, string> = {};
  if (selected) for (const t of targets) (layers[t.to] ??= []).push(String((t.captured ? RING : DOT).backgroundImage));
  for (const h of highlights) {
    const c = MARK_TINT[h.color];
    (layers[h.square] ??= []).push(`linear-gradient(${c.tint}, ${c.tint})`);
    rings[h.square] = `inset 0 0 0 2px ${c.ring}`;
  }
  for (const [sq, imgs] of Object.entries(layers)) squareStyles[sq] = { ...squareStyles[sq], backgroundImage: imgs.join(", ") };
  for (const [sq, ring] of Object.entries(rings)) {
    const prev = squareStyles[sq]?.boxShadow;
    squareStyles[sq] = { ...squareStyles[sq], boxShadow: prev ? `${prev}, ${ring}` : ring };
  }

  return (
    <div className="board">
      <Chessboard
        options={{
          position: fen,
          boardOrientation: orientation,
          onPieceDrop,
          onSquareClick,
          canDragPiece: ({ square }) => interactive && !pending && !!square && ownPiece(square),
          squareStyles,
          arrows,
          allowDrawingArrows: true,
          animationDurationInMs: 200,
          darkSquareStyle: { backgroundColor: "#b58863" },
          lightSquareStyle: { backgroundColor: "#f0d9b5" },
        }}
      />
      {pending && (
        <div className="promo" role="dialog" aria-label="Choose promotion piece">
          <div className="promo-box">
            <span>Promote to</span>
            <div className="promo-row">
              {(["q", "r", "b", "n"] as const).map((p) => (
                <button
                  key={p}
                  className="promo-piece"
                  onClick={() => {
                    const { from, to } = pending;
                    setPending(null);
                    onMove?.(from, to, p);
                  }}
                >
                  {PROMO_GLYPHS[pending.color][p]}
                </button>
              ))}
            </div>
            <button className="btn ghost small" onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const PROMO_GLYPHS = {
  w: { q: "♕", r: "♖", b: "♗", n: "♘" },
  b: { q: "♛", r: "♜", b: "♝", n: "♞" },
};
