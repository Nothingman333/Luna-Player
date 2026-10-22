/**
 * Ranking for Luna's command palette (Ctrl+K, in the library and in Web). Pure and import-free, so the regression
 * scripts load it on its own. Matching ignores case, accents and the Turkish dotted/dotless i.
 */
export type PaletteEntry = { id: string; title: string; group: string; detail?: string; keywords?: string; disabled?: boolean; top?: boolean };

export const paletteFold = (text: string): string => (text || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i").toLowerCase();

/** Letters of `needle` appear in `hay` in order ("rdv" → "reading view"); the score prefers letters that start words. */
function subsequence(needle: string, hay: string): number {
  let at = 0, score = 0;
  for (const ch of needle) {
    const found = hay.indexOf(ch, at);
    if (found < 0) return -1;
    score += found === 0 || hay[found - 1] === " " ? 3 : found === at ? 2 : 1;
    at = found + 1;
  }
  return score;
}

/**
 * Entries that contain every typed word (in the title, detail or keywords) come first, best title matches on top;
 * a single short word may also match the title's letters in order. Without a query the order is kept.
 * Disabled entries stay visible but sink below the others. At most `limit` entries.
 */
export function rankPalette<T extends PaletteEntry>(entries: T[], query: string, limit = 60): T[] {
  const cap = Math.max(1, Math.min(500, Math.floor(limit) || 60));
  const words = paletteFold(query).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return entries.filter(e => e && e.title).slice(0, cap);
  const scored: { e: T; score: number; i: number }[] = [];
  entries.forEach((e, i) => {
    if (!e || !e.title) return;
    const title = paletteFold(e.title), extra = paletteFold((e.detail || "") + " " + (e.keywords || "") + " " + (e.group || ""));
    let score = 0;
    if (words.every(w => title.includes(w) || extra.includes(w))) {
      const phrase = words.join(" ");
      if (title === phrase) score += 400; else if (title.startsWith(phrase)) score += 200;
      for (const w of words) {
        if (title.split(/[\s\-·:/]+/).some(part => part.startsWith(w))) score += 60;
        else if (title.includes(w)) score += 25;
        else score += 6;
      }
    } else if (words.length === 1 && words[0].length >= 2) {
      const s = subsequence(words[0], title);
      if (s < 0) return;
      score = 1 + s;
    } else return;
    if (e.disabled) score -= 1000;
    scored.push({ e, score, i });
  });
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  return scored.slice(0, cap).map(x => x.e);
}

/**
 * Where the rows built from the typed text go (e.g. "Search the web for …"): first when they were asked for outright
 * (`top`, e.g. an address or a quick search like "!yt"), otherwise right after the entries whose title has a word that
 * starts with the query (at most `strong` of them), so "duckduckgo" still runs the engine command with Enter.
 */
export function mergeTyped<T extends PaletteEntry & { top?: boolean }>(ranked: T[], typed: T[], query: string, strong = 5): T[] {
  if (!typed.length) return ranked;
  if (typed.some(t => t.top) || !ranked.length) return [...typed, ...ranked];
  const words = paletteFold(query).trim().split(/\s+/).filter(Boolean);
  let lead = 0;
  while (lead < Math.min(strong, ranked.length) && !ranked[lead].disabled
    && words.every(w => paletteFold(ranked[lead].title).split(/[\s\-·:/]+/).some(part => part.startsWith(w)))) lead++;
  return [...ranked.slice(0, lead), ...typed, ...ranked.slice(lead)];
}
