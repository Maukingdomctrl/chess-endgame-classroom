import { Chess } from "chess.js";
import type { Line, LineMove } from "../types";
import { DEFAULT_FEN, looksLikeFen, moveNumberLabel, normalizeFen } from "./chess";
import { createLine } from "./storage";

interface Node {
  san: string;
  comment: string;
  parent: Node | null;
  children: Node[];
}

interface ParsedGame {
  headers: Record<string, string>;
  root: Node;
}

export interface ImportResult {
  lines: Line[];
  warnings: string[];
}

const RESULT_RE = /^(1-0|0-1|1\/2-1\/2|\*)$/;

function newNode(san: string, parent: Node | null): Node {
  return { san, comment: "", parent, children: [] };
}

function appendComment(existing: string, extra: string) {
  const t = extra.trim();
  if (!t) return existing;
  return existing ? `${existing} ${t}` : t;
}

/** Splits PGN text into games and builds a move tree for each. */
function parsePgnGames(text: string): ParsedGame[] {
  const games: ParsedGame[] = [];
  let game: ParsedGame | null = null;
  let cur: Node | null = null;
  let seenMoves = false;
  let pendingComment = "";
  let justOpened = false;
  const stack: Node[] = [];

  const start = () => {
    const root = newNode("", null);
    game = { headers: {}, root };
    games.push(game);
    cur = root;
    seenMoves = false;
    pendingComment = "";
    stack.length = 0;
  };

  let i = 0;
  const s = text.replace(/\r\n?/g, "\n");
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === "[") {
      const end = s.indexOf("]", i);
      const body = s.slice(i + 1, end === -1 ? s.length : end);
      i = end === -1 ? s.length : end + 1;
      const m = body.match(/^\s*(\w+)\s+"((?:[^"\\]|\\.)*)"/);
      if (!m) continue;
      if (!game || seenMoves) start();
      game!.headers[m[1]] = m[2].replace(/\\(.)/g, "$1");
      continue;
    }
    if (!game) start();
    if (ch === "{") {
      const end = s.indexOf("}", i);
      const body = s.slice(i + 1, end === -1 ? s.length : end);
      i = end === -1 ? s.length : end + 1;
      if (justOpened || (cur === game!.root && seenMoves)) pendingComment = appendComment(pendingComment, body);
      else cur!.comment = appendComment(cur!.comment, body);
      continue;
    }
    if (ch === ";") {
      const end = s.indexOf("\n", i);
      const body = s.slice(i + 1, end === -1 ? s.length : end);
      i = end === -1 ? s.length : end + 1;
      cur!.comment = appendComment(cur!.comment, body);
      continue;
    }
    if (ch === "(") {
      i++;
      if (cur && cur.parent) {
        stack.push(cur);
        cur = cur.parent;
        justOpened = true;
      }
      continue;
    }
    if (ch === ")") {
      i++;
      cur = stack.pop() ?? cur;
      justOpened = false;
      pendingComment = "";
      continue;
    }
    // A plain token: move number, NAG, result or SAN.
    let j = i;
    while (j < s.length && !/[\s{}();[\]]/.test(s[j])) j++;
    let tok = s.slice(i, j);
    i = j;
    if (RESULT_RE.test(tok)) {
      // A result ends the game; any later movetext without headers starts a new one.
      if (seenMoves) game = null;
      continue;
    }
    if (/^\$\d+$/.test(tok) || /^[!?]+$/.test(tok)) continue;
    tok = tok.replace(/^\d+\.+/, "");
    if (!tok || /^\d+$/.test(tok)) continue;
    const san = tok.replace(/[!?]+$/, "").replace(/^0-0-0/, "O-O-O").replace(/^0-0/, "O-O");
    const node = newNode(san, cur);
    if (pendingComment) {
      node.comment = pendingComment;
      pendingComment = "";
    }
    cur!.children.push(node);
    cur = node;
    seenMoves = true;
    justOpened = false;
  }
  return games;
}

function leafPaths(root: Node): Node[][] {
  const out: Node[][] = [];
  const walk = (n: Node, path: Node[]) => {
    if (n.children.length === 0) {
      out.push(path);
      return;
    }
    for (const c of n.children) walk(c, [...path, c]);
  };
  walk(root, []);
  return out;
}

/**
 * Names a variation after the moves where it leaves the main line, e.g. "2...c5" or "2...c5 4...Qc7".
 * Returns "" for the main line (every move is its parent's first choice).
 */
function branchLabel(path: Node[], startFen: string) {
  const parts: string[] = [];
  path.forEach((node, i) => {
    if (node.parent && node.parent.children[0] !== node) {
      const { moveNo, whiteToMove } = moveNumberLabel(startFen, i);
      parts.push(`${moveNo}${whiteToMove ? "." : "..."}${node.san}`);
    }
  });
  return parts.join(" ");
}

function gameTitle(h: Record<string, string>, index: number) {
  if (h.LineName) return h.LineName;
  const clean = (v?: string) => (v && v !== "?" ? v : "");
  const event = clean(h.Event);
  if (event) return event;
  const w = clean(h.White);
  const b = clean(h.Black);
  if (w || b) return `${w || "?"} – ${b || "?"}`;
  return `Line ${index + 1}`;
}

/** Imports PGN text (one or many games) or a list of FENs (one per line). */
export function importText(text: string): ImportResult {
  const trimmed = text.trim();
  if (!trimmed) return { lines: [], warnings: ["Nothing to import."] };

  const rows = trimmed.split(/\n+/).map((r) => r.trim()).filter(Boolean);
  const isPgn = rows.some((r) => r.startsWith("[") || /(^|\s)\d+\.\s*\S/.test(r));
  if (!isPgn && rows.some(looksLikeFen)) return importFens(rows);
  return importPgn(trimmed);
}

export function importFens(rows: string[]): ImportResult {
  const lines: Line[] = [];
  const warnings: string[] = [];
  rows.forEach((row, idx) => {
    const { fen, error } = normalizeFen(row);
    if (!fen) {
      warnings.push(`FEN ${idx + 1} skipped: ${error}`);
      return;
    }
    lines.push(createLine({ name: `Position ${idx + 1}`, startFen: fen }));
  });
  if (lines.length) warnings.push(`${lines.length} position(s) added without moves. Open each one in the builder to record its moves.`);
  return { lines, warnings };
}

export function importPgn(text: string): ImportResult {
  const lines: Line[] = [];
  const warnings: string[] = [];
  const games = parsePgnGames(text);
  if (games.length === 0) return { lines, warnings: ["No PGN games found."] };

  games.forEach((g, gi) => {
    let startFen = DEFAULT_FEN;
    if (g.headers.FEN) {
      const { fen, error } = normalizeFen(g.headers.FEN);
      if (!fen) {
        warnings.push(`Game ${gi + 1} skipped: bad FEN (${error}).`);
        return;
      }
      startFen = fen;
    }
    const title = gameTitle(g.headers, gi);
    const paths = leafPaths(g.root);
    paths.forEach((path) => {
      const chess = new Chess(startFen);
      const moves: LineMove[] = [];
      for (const node of path) {
        try {
          const m = chess.move(node.san);
          moves.push({ san: m.san, comment: node.comment });
        } catch {
          warnings.push(
            `${title}${branchLabel(path, startFen) ? ` · ${branchLabel(path, startFen)}` : ""}: stopped at illegal move "${node.san}".`,
          );
          break;
        }
      }
      lines.push(
        createLine({
          name: branchLabel(path, startFen) ? `${title} · ${branchLabel(path, startFen)}` : title,
          description: g.headers.LineDescription ?? "",
          startFen,
          intro: g.root.comment,
          moves,
        }),
      );
    });
  });
  return { lines, warnings };
}

function escTag(v: string) {
  return v.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function escComment(v: string) {
  return v.replace(/}/g, ")");
}

export function lineToPgn(line: Line, courseName = ""): string {
  const tags: [string, string][] = [
    ["Event", line.name || courseName || "?"],
    ["Site", "Endgame Classroom"],
    ["White", "?"],
    ["Black", "?"],
    ["Result", "*"],
  ];
  if (line.startFen !== DEFAULT_FEN) {
    tags.push(["SetUp", "1"], ["FEN", line.startFen]);
  }
  if (line.name) tags.push(["LineName", line.name]);
  if (line.description) tags.push(["LineDescription", line.description]);

  const parts: string[] = [];
  if (line.intro) parts.push(`{${escComment(line.intro)}}`);
  let needNumber = true;
  line.moves.forEach((m, idx) => {
    const { moveNo, whiteToMove } = moveNumberLabel(line.startFen, idx);
    if (whiteToMove) parts.push(`${moveNo}. ${m.san}`);
    else if (needNumber) parts.push(`${moveNo}... ${m.san}`);
    else parts.push(m.san);
    needNumber = false;
    if (m.comment) {
      parts.push(`{${escComment(m.comment)}}`);
      needNumber = true;
    }
  });
  parts.push("*");

  // Wrap movetext at ~80 columns as PGN readers expect.
  const wrapped: string[] = [];
  let row = "";
  for (const p of parts) {
    if (row && row.length + p.length + 1 > 80) {
      wrapped.push(row);
      row = p;
    } else row = row ? `${row} ${p}` : p;
  }
  if (row) wrapped.push(row);

  return `${tags.map(([k, v]) => `[${k} "${escTag(v)}"]`).join("\n")}\n\n${wrapped.join("\n")}\n`;
}

export function linesToPgn(lines: Line[], courseName = ""): string {
  return lines.map((l) => lineToPgn(l, courseName)).join("\n");
}
