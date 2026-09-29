import { Chess, validateFen } from "chess.js";
import type { Move } from "chess.js";
import type { Line, Side } from "../types";

export const DEFAULT_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const PIECE_NAMES: Record<string, string> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};

export function sanitizeSan(san: string) {
  return san.replace(/[+#!?]/g, "").trim();
}

export function sameSan(a: string, b: string) {
  return sanitizeSan(a) === sanitizeSan(b);
}

export function sideToColor(side: Side) {
  return side === "white" ? "w" : "b";
}

export function colorToSide(color: "w" | "b"): Side {
  return color === "w" ? "white" : "black";
}

/** Accepts a full FEN or just the piece-placement part and returns a full FEN, or an error. */
export function normalizeFen(input: string): { fen?: string; error?: string } {
  let fen = input.trim().replace(/\s+/g, " ");
  if (!fen) return { error: "Enter a FEN." };
  const parts = fen.split(" ");
  const defaults = ["", "w", "-", "-", "0", "1"];
  for (let i = parts.length; i < 6; i++) parts.push(defaults[i]);
  fen = parts.slice(0, 6).join(" ");
  const res = validateFen(fen);
  if (!res.ok) return { error: res.error };
  try {
    new Chess(fen);
  } catch (e) {
    return { error: (e as Error).message };
  }
  return { fen };
}

export function looksLikeFen(text: string) {
  const first = text.trim().split(/\s+/)[0] ?? "";
  return /^[pnbrqkPNBRQK1-8]+(\/[pnbrqkPNBRQK1-8]+){7}$/.test(first);
}

/** "Play pawn to c5.", "Take on d4 with the pawn.", "Castle kingside." */
export function moveInstruction(move: Move) {
  if (move.isKingsideCastle()) return "Castle kingside.";
  if (move.isQueensideCastle()) return "Castle queenside.";
  const piece = PIECE_NAMES[move.piece];
  if (move.isPromotion()) {
    const to = PIECE_NAMES[move.promotion ?? "q"];
    return move.isCapture()
      ? `Take on ${move.to} and promote to a ${to}.`
      : `Push the pawn to ${move.to} and promote to a ${to}.`;
  }
  if (move.isCapture()) return `Take on ${move.to} with the ${piece}.`;
  return `Play ${piece} to ${move.to}.`;
}

/** Plays a SAN move on a copy of `fen`. Returns the Move, or null if illegal. */
export function tryMove(fen: string, san: string): Move | null {
  try {
    return new Chess(fen).move(san);
  } catch {
    return null;
  }
}

/** FEN after each move of a line: fens[0] is the start, fens[i] is after move i. */
export function lineFens(line: Pick<Line, "startFen" | "moves">): string[] {
  const g = new Chess(line.startFen);
  const fens = [g.fen()];
  for (const m of line.moves) {
    try {
      g.move(m.san);
    } catch {
      break;
    }
    fens.push(g.fen());
  }
  return fens;
}

/** Verbose moves of a line, for last-move highlights. */
export function lineVerboseMoves(line: Pick<Line, "startFen" | "moves">): Move[] {
  const g = new Chess(line.startFen);
  const out: Move[] = [];
  for (const m of line.moves) {
    try {
      out.push(g.move(m.san));
    } catch {
      break;
    }
  }
  return out;
}

const VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/** Material balance from `side`'s point of view plus the pieces it is up. */
export function materialEdge(fen: string, side: Side) {
  const board = new Chess(fen).board();
  const count: Record<string, number> = {};
  let score = 0;
  for (const row of board) {
    for (const sq of row) {
      if (!sq) continue;
      const sign = sq.color === sideToColor(side) ? 1 : -1;
      count[sq.type] = (count[sq.type] ?? 0) + sign;
      score += sign * VALUES[sq.type];
    }
  }
  return { score, count };
}

export function moveNumberLabel(startFen: string, ply: number) {
  const parts = startFen.split(" ");
  const startMove = Number(parts[5]) || 1;
  const blackFirst = parts[1] === "b";
  const absolutePly = ply + (blackFirst ? 1 : 0);
  const moveNo = startMove + Math.floor(absolutePly / 2);
  const whiteToMove = absolutePly % 2 === 0;
  return { moveNo, whiteToMove };
}
