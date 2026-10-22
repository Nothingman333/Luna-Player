/** Pure helpers for the command palette (Ctrl+K): Turkish-aware folding and fuzzy ranking.
 *  No imports: the regression script loads this file as it is. */

/** Lower case without accents; Turkish ı/İ/ş/ğ/ç/ö/ü fold to plain Latin letters. */
export function fold(s: string): string {
  return String(s ?? "").replace(/İ/g, "i").replace(/I/g, "ı").toLowerCase()
    .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ç/g, "c").replace(/ö/g, "o").replace(/ü/g, "u")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

/** How well `query` matches `text` (0 = not at all). Whole prefix > word start > anywhere > letters in order. */
export function fuzzyScore(query: string, text: string): number {
  const q = fold(query), t = fold(text);
  if (!q) return 1;
  if (!t) return 0;
  if (t === q) return 1000;
  if (t.startsWith(q)) return 800 - Math.min(200, t.length - q.length);
  const words = t.split(/[\s\-_/·:.,()]+/);
  if (words.some((w) => w.startsWith(q))) return 600 - Math.min(200, t.length - q.length);
  const at = t.indexOf(q);
  if (at >= 0) return 400 - Math.min(200, at);
  // every letter in order (initials: "gec" → "Geçmiş")
  let i = 0, gaps = 0, last = -1;
  for (let j = 0; j < t.length && i < q.length; j++) if (t[j] === q[i]) { if (last >= 0) gaps += j - last - 1; last = j; i++; }
  return i === q.length ? Math.max(1, 200 - gaps * 5) : 0;
}

export type PaletteRow = { id: string; label: string; hint?: string; keywords?: string; group: string };

/** Rows matching the query, best first (ties keep their group order), at most `limit`. */
export function rankRows<T extends PaletteRow>(rows: T[], query: string, limit = 40): T[] {
  const q = query.trim();
  if (!q) return rows.slice(0, limit);
  return rows
    .map((r, i) => ({ r, i, s: Math.max(fuzzyScore(q, r.label), fuzzyScore(q, r.keywords ?? "") * 0.8, fuzzyScore(q, r.hint ?? "") * 0.5) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.r);
}
