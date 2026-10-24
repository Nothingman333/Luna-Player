/**
 * Finding the scene by what is said in it: the subtitle lines of the whole library, searched without
 * caring about case, Turkish letters or punctuation ("kopruede bulusalim" finds "Köprüde buluşalım.").
 * Pure; the reading of the files is in LineSearch.tsx.
 */
import { decodeTextEntities } from "./textEntities";
export type Line = { start: number; text: string; fold: string };
export type Entry = { path: string; title: string; lines: Line[] };
export type Hit = { path: string; title: string; start: number; text: string; before?: string; after?: string; score: number; ranges: [number, number][] };

const MAP: Record<string, string> = { "ı": "i", "İ": "i", "I": "i", "ş": "s", "Ş": "s", "ğ": "g", "Ğ": "g", "ü": "u", "Ü": "u", "ö": "o", "Ö": "o", "ç": "c", "Ç": "c", "â": "a", "Â": "a", "î": "i", "Î": "i", "û": "u", "Û": "u", "é": "e", "è": "e", "ê": "e", "á": "a", "à": "a", "ä": "a", "ñ": "n", "ß": "s" };
/** Lower case with Turkish and common Latin accents flattened, one character in, one out (so positions stay valid). */
export function foldKeep(s: string): string {
  let out = "";
  for (const ch of s) out += MAP[ch] ?? (ch.length === 1 ? ch.toLowerCase() : ch);
  return out;
}

/** A subtitle line as plain text: styling tags, ASS codes and line breaks removed. */
export function cleanLine(text: string): string {
  return decodeTextEntities(String(text ?? "").replace(/\{[^}]*\}/g, "").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, "")).replace(/\\N|\\n|\r?\n/g, " ").replace(/\s+/g, " ").trim();
}

/** Lines of one film (empty ones dropped). */
export function indexFilm(path: string, title: string, cues: { start: number; text: string }[], alreadyPlain = false): Entry {
  const lines: Line[] = [];
  for (const c of cues) { const text = alreadyPlain ? c.text.replace(/\s+/g, " ").trim() : cleanLine(c.text); if (text) lines.push({ start: c.start, text, fold: foldKeep(text) }); }
  return { path, title, lines };
}

export function tokens(query: string): string[] {
  return foldKeep(query).split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 2).slice(0, 12);
}
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Where the query's words sit in a line (for highlighting): the phrase if it is there, else each word. */
export function highlightRanges(line: Line, query: string): [number, number][] {
  const t = tokens(query);
  if (!t.length) return [];
  const out: [number, number][] = [];
  const phrase = new RegExp(t.map(esc).join("[^\\p{L}\\p{N}]+"), "gu");
  for (const m of line.fold.matchAll(phrase)) out.push([m.index!, m.index! + m[0].length]);
  for (const w of new Set(t)) {
    let at = 0, i: number;
    while ((i = line.fold.indexOf(w, at)) >= 0) { out.push([i, i + w.length]); at = i + 1; }
  }
  const merged: [number, number][] = [];
  for (const range of out.sort((a, b) => a[0] - b[0] || b[1] - a[1])) {
    const last = merged[merged.length - 1];
    if (last && range[0] < last[1]) last[1] = Math.max(last[1], range[1]); else merged.push([...range]);
  }
  return merged;
}

const PER_FILM = 5;
/** The best lines for a query, best first; at most five per film so one film can't fill the list. */
export function searchIndex(entries: Entry[], query: string, limit = 60): Hit[] {
  const t = tokens(query);
  if (!t.length) return [];
  const phrase = new RegExp(t.map(esc).join("[^\\p{L}\\p{N}]+"), "u");
  const need = t.length >= 3 ? Math.ceil(t.length * 0.6) : t.length;
  const hits: Hit[] = [];
  for (const e of entries) {
    const mine: Hit[] = [];
    for (let i = 0; i < e.lines.length; i++) {
      const l = e.lines[i];
      let score = 0;
      const m = phrase.exec(l.fold);
      if (m) score = 100 + (m.index === 0 ? 6 : 0) + (m[0].length >= l.fold.length - 2 ? 8 : 0);
      else {
        const next = e.lines[i + 1];
        if (next) { const joined = l.fold + " " + next.fold, j = phrase.exec(joined); if (j && j.index < l.fold.length && next.start - l.start < 8) score = 72; }
        if (!score) {
          const have = t.filter((w) => l.fold.includes(w)).length;
          if (have === t.length) score = 50; else if (t.length >= 3 && have >= need) score = 25 + have;
        }
      }
      if (score) mine.push({ path: e.path, title: e.title, start: l.start, text: l.text, before: e.lines[i - 1]?.text, after: e.lines[i + 1]?.text, score, ranges: highlightRanges(l, query) });
    }
    mine.sort((a, b) => b.score - a.score || a.start - b.start);
    hits.push(...mine.slice(0, PER_FILM));
  }
  hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title) || a.start - b.start);
  return hits.slice(0, limit);
}

/** Splits text at the ranges for display. */
export function segments(text: string, ranges: [number, number][]): { t: string; hit: boolean }[] {
  const out: { t: string; hit: boolean }[] = [];
  let at = 0;
  for (const [a, b] of ranges) { if (a < at || b > text.length) continue; if (a > at) out.push({ t: text.slice(at, a), hit: false }); out.push({ t: text.slice(a, b), hit: true }); at = b; }
  if (at < text.length) out.push({ t: text.slice(at), hit: false });
  return out;
}
