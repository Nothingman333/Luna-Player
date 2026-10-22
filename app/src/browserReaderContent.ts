/**
 * Luna Web's reading view: turns the text the page reader returns (browserPage.js: "# " headings,
 * "- " list items, " | " between table cells, one block per line) into calm, readable blocks.
 * Pure functions and no imports, so the regression scripts load this file on its own.
 */
export type ReaderBlock =
  | { kind: "h"; level: number; text: string; id: string }
  | { kind: "p" | "li"; text: string }
  | { kind: "row"; cells: string[] };
export type ReaderHit = { block: number; start: number; end: number };
export type ReaderPrefs = { theme: "luna" | "night" | "sepia" | "paper"; size: number; font: "serif" | "sans"; width: "narrow" | "wide" };

export const READER_SIZES = [14, 15, 16, 17, 18, 20, 22, 24, 26];
export const DEFAULT_READER_PREFS: ReaderPrefs = { theme: "night", size: 18, font: "serif", width: "narrow" };

export function readerBlocks(text: unknown, max = 4000): ReaderBlock[] {
  if (typeof text !== "string") return [];
  const out: ReaderBlock[] = [];

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line) continue;
    const heading = /^(#{1,6}) (.+)$/.exec(line);
    if (heading) out.push({ kind: "h", level: heading[1].length, text: heading[2], id: "reader-h-" + out.length });
    else if (/^- ./.test(line)) out.push({ kind: "li", text: line.slice(2) });
    else if (line.includes(" | ") && line.split(" | ").length >= 2) out.push({ kind: "row", cells: line.split(" | ").map(c => c.trim()) });
    else out.push({ kind: "p", text: line });
    if (out.length >= max) break;
  }
  return out;
}

export const blockText = (b: ReaderBlock): string => (b.kind === "row" ? b.cells.join("  ") : b.text);

/** Words and minutes at an unhurried 220 words a minute; never "0 min". */
export function readingStats(blocks: ReaderBlock[]): { words: number; minutes: number } {
  let words = 0;
  for (const b of blocks) words += blockText(b).split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length;
  return { words, minutes: Math.max(1, Math.round(words / 220)) };
}

/** Headings worth a contents list (levels 1–3), at most 40. */
export function readerOutline(blocks: ReaderBlock[]): { id: string; text: string; level: number }[] {
  const rows: { id: string; text: string; level: number }[] = [];
  for (const b of blocks) if (b.kind === "h" && b.level <= 3) { rows.push({ id: b.id, text: b.text, level: b.level }); if (rows.length >= 40) break; }
  return rows;
}

/** One character folded for matching (accents, case, Turkish dotted/dotless i); may grow or vanish. */
const foldChar = (c: string) => c.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i").toLowerCase().replace(/[\u0300-\u036f]/g, "");
/** The folded text and, for each folded character, the index of the original character it came from. */
function folded(text: string): { text: string; map: number[] } {
  let out = ""; const map: number[] = [];
  for (let i = 0; i < text.length; ) {
    const cp = text.codePointAt(i)!; const ch = String.fromCodePoint(cp);
    const f = foldChar(ch);
    for (let k = 0; k < f.length; k++) map.push(i);
    out += f; i += ch.length;
  }
  return { text: out, map };
}

/** Every place the query appears, in reading order; positions are in the original block text. */
export function findInBlocks(blocks: ReaderBlock[], query: string, limit = 500): ReaderHit[] {
  const q = folded((query ?? "").trim()).text;
  if (!q) return [];
  const hits: ReaderHit[] = [];
  blocks.forEach((b, block) => {
    if (hits.length >= limit) return;
    const original = blockText(b), f = folded(original);
    let from = 0;
    for (;;) {
      const at = f.text.indexOf(q, from);
      if (at < 0 || hits.length >= limit) break;
      const start = f.map[at], endChar = f.map[at + q.length - 1];
      let end = endChar + String.fromCodePoint(original.codePointAt(endChar)!).length;
      while(end<original.length){const ch=String.fromCodePoint(original.codePointAt(end)!);if(!/\p{M}/u.test(ch))break;end+=ch.length;}
      hits.push({ block, start, end });
      from = at + q.length;
    }
  });
  return hits;
}

/** Cuts one block's text into plain and highlighted parts; `first` is the global number of this block's first hit. */
export function splitHighlights(text: string, hits: ReaderHit[], first = 0): { text: string; hit: number | null }[] {
  const parts: { text: string; hit: number | null }[] = [];
  let at = 0;
  hits.forEach((h, i) => {
    if (h.start < at || h.end > text.length || h.start >= h.end) return; // overlapping or stale hit
    if (h.start > at) parts.push({ text: text.slice(at, h.start), hit: null });
    parts.push({ text: text.slice(h.start, h.end), hit: first + i });
    at = h.end;
  });
  if (at < text.length) parts.push({ text: text.slice(at), hit: null });
  return parts;
}

export function cleanReaderPrefs(raw: unknown): ReaderPrefs {
  const x = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    theme: x.theme === "luna" || x.theme === "sepia" || x.theme === "paper" ? x.theme : "night",
    size: typeof x.size === "number" && READER_SIZES.includes(x.size) ? x.size : DEFAULT_READER_PREFS.size,
    font: x.font === "sans" ? "sans" : "serif",
    width: x.width === "wide" ? "wide" : "narrow",
  };
}

export function nextReaderSize(size: number, direction: 1 | -1): number {
  const at = READER_SIZES.indexOf(size);
  const i = at < 0 ? READER_SIZES.indexOf(DEFAULT_READER_PREFS.size) : at;
  return READER_SIZES[Math.max(0, Math.min(READER_SIZES.length - 1, i + direction))];
}
