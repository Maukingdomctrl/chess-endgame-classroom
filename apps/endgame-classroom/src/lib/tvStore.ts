import { useSyncExternalStore } from "react";
import type { TvCollection, TvGame } from "../types";
import { newId } from "./storage";
import { cleanMarks } from "./marks";

const KEY = "endgame-classroom.tv.v1";

function load(): TvCollection[] {
  try {
    const raw = localStorage.getItem(KEY);
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data.map(normalizeCollection) : [];
  } catch {
    return [];
  }
}

export function normalizeCollection(input: unknown): TvCollection {
  const c = (input ?? {}) as Partial<TvCollection>;
  return {
    id: typeof c.id === "string" && c.id ? c.id : newId(),
    name: typeof c.name === "string" && c.name ? c.name : "Untitled collection",
    description: typeof c.description === "string" ? c.description : "",
    cover: isCover(c.cover) ? c.cover : undefined,
    createdAt: typeof c.createdAt === "number" ? c.createdAt : Date.now(),
    games: Array.isArray(c.games)
      ? c.games
          .filter((g) => g && Array.isArray(g.moves))
          .map((g) => ({
            id: typeof g.id === "string" && g.id ? g.id : newId(),
            headers: g.headers && typeof g.headers === "object" ? g.headers : {},
            startFen: String(g.startFen ?? ""),
            intro: String(g.intro ?? ""),
            introMarks: cleanMarks(g.introMarks),
            moves: g.moves.map((m) => ({ san: String(m?.san ?? ""), comment: String(m?.comment ?? ""), marks: cleanMarks(m?.marks) })),
          }))
      : [],
  };
}

function isCover(v: unknown): v is string {
  return typeof v === "string" && (/^data:image\/(jpeg|png|webp|gif);base64,/.test(v) || /^https?:\/\//.test(v));
}

let state = { collections: load(), saveError: false };
const listeners = new Set<() => void>();

export function setCollections(fn: (cs: TvCollection[]) => TvCollection[]) {
  const collections = fn(state.collections);
  let saveError = false;
  try {
    localStorage.setItem(KEY, JSON.stringify(collections));
  } catch {
    saveError = true;
  }
  state = { collections, saveError };
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useTvStore() {
  return useSyncExternalStore(subscribe, () => state);
}

export function addGames(collectionId: string, games: Omit<TvGame, "id">[]) {
  setCollections((cs) =>
    cs.map((c) => (c.id === collectionId ? { ...c, games: [...c.games, ...games.map((g) => ({ ...g, id: newId() }))] } : c)),
  );
}

/** "Capablanca – Marshall", falling back to the event name. */
export function gameTitle(g: TvGame) {
  const clean = (v?: string) => (v && v !== "?" ? v : "");
  const w = clean(g.headers.White);
  const b = clean(g.headers.Black);
  if (w || b) return `${w || "?"} – ${b || "?"}`;
  return clean(g.headers.Event) || "Untitled game";
}

/** "New York 1918 · 1-0" style subtitle. */
export function gameSubtitle(g: TvGame) {
  const clean = (v?: string) => (v && !/^[?.]+$/.test(v) ? v : "");
  const year = clean(g.headers.Date).slice(0, 4).replace(/\?/g, "");
  const place = clean(g.headers.Event) || clean(g.headers.Site);
  const result = clean(g.headers.Result) && g.headers.Result !== "*" ? g.headers.Result : "";
  return [place, year, result].filter(Boolean).join(" · ");
}

const BACKUP_TYPE = "chess-tv-backup";

/** Downloadable JSON for one or more collections (games, comments and cover photos included). */
export function tvBackupJson(collections: TvCollection[]) {
  return JSON.stringify({ type: BACKUP_TYPE, version: 1, exportedAt: new Date().toISOString(), collections }, null, 2);
}

/**
 * Reads a Chess TV backup. Accepts the backup format, a bare array or a single collection.
 * Fresh ids are assigned so importing twice never overwrites anything.
 */
export function parseTvBackup(text: string): TvCollection[] {
  const data = JSON.parse(text);
  const list: unknown[] = Array.isArray(data) ? data : Array.isArray(data?.collections) ? data.collections : [data];
  const out = list
    .filter((c) => c && typeof c === "object" && Array.isArray((c as TvCollection).games))
    .map((raw) => {
      const c = normalizeCollection(raw);
      return { ...c, id: newId(), games: c.games.map((g) => ({ ...g, id: newId() })) };
    });
  if (!out.length) throw new Error("No Chess TV collections in this file.");
  return out;
}

export function updateCollection(id: string, patch: Partial<Omit<TvCollection, "id" | "games">>) {
  setCollections((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
}
