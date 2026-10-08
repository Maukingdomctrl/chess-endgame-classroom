import type { Arrow } from "react-chessboard";
import type { MarkColor, Marks } from "../types";

/*
 * Board annotations embedded in PGN comments, in the format used by Lichess, ChessBase and others:
 *   [%csl Gd6,Ge6,Rf6]   coloured squares
 *   [%cal Ge2e4,Rd8h4]   arrows
 * G = green, R = red, Y = yellow, B = blue.
 */

const SQ = "[a-h][1-8]";
const COLORS = "RGYB";

/** Splits a raw PGN comment into readable text and board marks. Other [%…] commands (clock, eval) are dropped. */
export function parseCommentMarks(raw: string): { text: string; marks?: Marks } {
  const squares: Marks["squares"] = [];
  const arrows: Marks["arrows"] = [];
  const text = raw
    .replace(/\[%(\w+)\s*([^\]]*)\]/g, (_, cmd: string, args: string) => {
      const items = args.split(/[\s,]+/).filter(Boolean);
      if (cmd === "csl") {
        for (const it of items) {
          const m = it.match(new RegExp(`^([${COLORS}])(${SQ})$`));
          if (m) squares.push({ square: m[2], color: m[1] as MarkColor });
        }
      } else if (cmd === "cal") {
        for (const it of items) {
          const m = it.match(new RegExp(`^([${COLORS}])(${SQ})(${SQ})$`));
          if (m) arrows.push({ from: m[2], to: m[3], color: m[1] as MarkColor });
        }
      }
      return " ";
    })
    .replace(/\s+/g, " ")
    .trim();
  return { text, marks: squares.length || arrows.length ? { squares, arrows } : undefined };
}

/** Writes marks back into PGN comment syntax (empty string when there are none). */
export function formatMarks(marks?: Marks): string {
  if (!marks) return "";
  const parts: string[] = [];
  if (marks.squares?.length) parts.push(`[%csl ${marks.squares.map((s) => `${s.color}${s.square}`).join(",")}]`);
  if (marks.arrows?.length) parts.push(`[%cal ${marks.arrows.map((a) => `${a.color}${a.from}${a.to}`).join(",")}]`);
  return parts.join(" ");
}

export function hasMarks(marks?: Marks) {
  return !!(marks?.squares?.length || marks?.arrows?.length);
}

/** Keeps only well-formed marks (for data loaded from storage or backups). */
export function cleanMarks(input: unknown): Marks | undefined {
  if (!input || typeof input !== "object") return undefined;
  const m = input as Partial<Marks>;
  const sqOk = (s: unknown) => typeof s === "string" && /^[a-h][1-8]$/.test(s);
  const colOk = (c: unknown) => typeof c === "string" && COLORS.includes(c) && c.length === 1;
  const squares = Array.isArray(m.squares) ? m.squares.filter((s) => s && sqOk(s.square) && colOk(s.color)) : [];
  const arrows = Array.isArray(m.arrows) ? m.arrows.filter((a) => a && sqOk(a.from) && sqOk(a.to) && colOk(a.color)) : [];
  return squares.length || arrows.length ? { squares, arrows } : undefined;
}

/** Soft overlay tints (the wood colour of the square stays visible) and a matching ring. */
export const MARK_TINT: Record<MarkColor, { tint: string; ring: string }> = {
  G: { tint: "rgba(46, 160, 110, 0.42)", ring: "rgba(28, 120, 80, 0.85)" },
  R: { tint: "rgba(214, 72, 72, 0.38)", ring: "rgba(170, 40, 40, 0.85)" },
  Y: { tint: "rgba(240, 196, 60, 0.42)", ring: "rgba(190, 140, 20, 0.85)" },
  B: { tint: "rgba(70, 130, 230, 0.34)", ring: "rgba(40, 90, 190, 0.8)" },
};

const ARROW_COLOR: Record<MarkColor, string> = {
  G: "rgba(30, 150, 95, 0.85)",
  R: "rgba(200, 50, 50, 0.85)",
  Y: "rgba(230, 170, 20, 0.85)",
  B: "rgba(50, 110, 220, 0.85)",
};

export function marksToArrows(marks?: Marks): Arrow[] {
  return (marks?.arrows ?? []).map((a) => ({ startSquare: a.from, endSquare: a.to, color: ARROW_COLOR[a.color] }));
}

const emptyToUndefined = (m: Marks): Marks | undefined => (m.squares.length || m.arrows.length ? m : undefined);

/** Click behaviour of the builder's mark tool: same colour removes, another colour replaces, new square adds. */
export function toggleSquareMark(marks: Marks | undefined, square: string, color: MarkColor): Marks | undefined {
  const squares = [...(marks?.squares ?? [])];
  const i = squares.findIndex((s) => s.square === square);
  if (i >= 0 && squares[i].color === color) squares.splice(i, 1);
  else if (i >= 0) squares[i] = { square, color };
  else squares.push({ square, color });
  return emptyToUndefined({ squares, arrows: [...(marks?.arrows ?? [])] });
}

export function toggleArrowMark(marks: Marks | undefined, from: string, to: string, color: MarkColor): Marks | undefined {
  const arrows = [...(marks?.arrows ?? [])];
  const i = arrows.findIndex((a) => a.from === from && a.to === to);
  if (i >= 0 && arrows[i].color === color) arrows.splice(i, 1);
  else if (i >= 0) arrows[i] = { from, to, color };
  else arrows.push({ from, to, color });
  return emptyToUndefined({ squares: [...(marks?.squares ?? [])], arrows });
}

export function sameMarks(a?: Marks, b?: Marks) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export const MARK_COLOR_NAMES: Record<MarkColor, string> = { G: "Green", R: "Red", Y: "Yellow", B: "Blue" };
