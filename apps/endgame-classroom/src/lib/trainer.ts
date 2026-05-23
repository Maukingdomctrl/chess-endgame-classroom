import { EndgameLine } from "../types";

export function sanitizeSan(san: string) {
  return san.replace(/[+#!?]/g, "").trim();
}

export function groupedRandomAscending(lines: EndgameLine[]) {
  const buckets = new Map<number, EndgameLine[]>();

  for (const l of lines) {
    const elo = Math.max(800, Math.min(2500, l.difficultyElo || 800));
    const key = Math.floor(elo / 100);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(l);
  }

  const keys = [...buckets.keys()].sort((a, b) => a - b);
  const result: EndgameLine[] = [];

  for (const k of keys) {
    const arr = [...(buckets.get(k) || [])];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    result.push(...arr);
  }

  return result;
}
