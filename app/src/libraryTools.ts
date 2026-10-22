import type { Item, Recent } from "./library";
export type LibrarySort = "az" | "new" | "old" | "rating" | "short";
export type LibraryFilter = "all" | "unmatched" | "versions";

const str = (x: unknown): string => (typeof x === "string" ? x : typeof x === "number" && Number.isFinite(x) ? String(x) : "");

// ---------- values read from catalog data that may be missing or damaged ----------
export function libraryNumber(raw: unknown): number {
  const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() ? Number(raw) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}
/** A release year (1850–2200) from "2019", 2019 or "2019-05-01"; 0 when it is missing or not a year. */
export function libraryYear(raw: unknown): number {
  const text = typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw.trim() : "";
  const m = /^(\d{4})(?!\d)/.exec(text);
  const y = m ? Number(m[1]) : 0;
  return y >= 1850 && y <= 2200 ? y : 0;
}
/** A TMDB community rating: above 0 and at most 10; anything else counts as "no rating". */
export function libraryRating(raw: unknown): number { const n = libraryNumber(raw); return n > 0 && n <= 10 ? n : 0; }
/** A running time in minutes (1 – 1440); 0 when unknown or absurd. */
export function libraryRuntime(raw: unknown): number { const n = libraryNumber(raw); return n >= 1 && n <= 1440 ? n : 0; }

const collators = new Map<string, Intl.Collator>();
/** One shared collator per locale: `a.localeCompare(b, locale, …)` builds a new one on every call, which dominates sorting thousands of titles. */
export function libraryCollator(locale: string): Intl.Collator {
  let c = collators.get(locale);
  if (!c) { try { c = new Intl.Collator(locale, { numeric: true }); } catch { c = new Intl.Collator(undefined, { numeric: true }); } collators.set(locale, c); }
  return c;
}

/** Text for searching: no case, no accents ("Işık" / "isik", "Amélie" / "amelie", "İstanbul" / "istanbul", "Ørsted" / "orsted"). */
export const foldText = (s: string) => s.normalize("NFD").replace(/\p{M}+/gu, "").replace(/ı/g, "i").replace(/ø/gi, "o").replace(/æ/gi, "ae").replace(/œ/gi, "oe").replace(/ß/g, "ss").replace(/ł/gi, "l").replace(/đ/gi, "d").toLowerCase();
export const queryWords = (query: string): string[] => foldText(query.trim()).split(/\s+/).filter(Boolean);

// ---------- per-item facts, computed once per catalog record ----------
export type ItemFacts = { title: string; year: number; runtime: number; rating: number; genres: string[]; matched: boolean };
const factsCache = new WeakMap<Item, { meta: unknown; parsed: unknown; facts: ItemFacts }>();
export function itemFacts(item: Item): ItemFacts {
  const hit = factsCache.get(item);
  if (hit && hit.meta === item.meta && hit.parsed === item.parsed) return hit.facts;
  const m = item.meta, p = item.parsed;
  const facts: ItemFacts = {
    title: str(m?.title).trim() || str(p?.title),
    year: libraryYear(m?.year) || libraryYear(p?.year),
    runtime: libraryRuntime(m?.runtime),
    rating: libraryRating(m?.rating),
    genres: Array.isArray(m?.genres) ? m!.genres.filter((g): g is string => typeof g === "string" && !!g.trim()) : [],
    matched: !!m && Number.isFinite(m.id) && m.id > 0,
  };
  factsCache.set(item, { meta: item.meta, parsed: item.parsed, facts });
  return facts;
}

export function workIdentity(item: Item): string {
  const kind = item.meta?.kind ?? item.parsed.kind;
  return item.meta?.id ? `${kind}:${item.meta.id}` : `file:${item.key}`;
}
export function libraryStats(items: Item[]) {
  const counts = new Map<string, number>(), ids = new Array<string>(items.length);
  let files = 0, unmatched = 0;
  items.forEach((item, i) => {
    const id = ids[i] = workIdentity(item), n = Array.isArray(item.files) ? item.files.length : 0;
    counts.set(id, (counts.get(id) ?? 0) + n);
    files += n;
    if (!itemFacts(item).matched) unmatched++;
  });
  const versions = new Set<string>();
  items.forEach((item, i) => { if (item.parsed.kind === "movie" && (counts.get(ids[i]) ?? 0) > 1) versions.add(ids[i]); });
  return { files, unmatched, versions, counts };
}

// ---------- what a text search can look at ----------
export type SearchKind = "title" | "original" | "year" | "genre" | "cast" | "character" | "file";
export type SearchField = { kind: SearchKind; text: string; folded: string };
type SearchIndex = { fields: SearchField[]; all: string };
const searchCache = new WeakMap<Item, { meta: unknown; parsed: unknown; files: unknown; n: number; index: SearchIndex }>();
/** The file's own name (no folder, no query string) as shown to the user. */
export function fileBase(path: string): string {
  const last = (/^https?:\/\//i.test(path)?path.replace(/[?#].*$/, ""):path).split(/[\\/]/).pop() ?? "";
  try { return decodeURIComponent(last); } catch { return last; }
}
/** Every searchable field of a record, folded once. Only data the catalog really holds: the matched title, the name taken
 *  from the file name (often the original title), year, genres, cast and character names, and the file names. */
export function itemSearch(item: Item): SearchIndex {
  const files = Array.isArray(item.files) ? item.files : [];
  const hit = searchCache.get(item);
  if (hit && hit.meta === item.meta && hit.parsed === item.parsed && hit.files === item.files && hit.n === files.length) return hit.index;
  const fields: SearchField[] = [];
  const add = (kind: SearchKind, text: string) => { const t = text.trim(); if (t) fields.push({ kind, text: t, folded: foldText(t) }); };
  const m = item.meta, f = itemFacts(item);
  add("title", f.title);
  const own = str(item.parsed?.title);
  if (own && foldText(own) !== foldText(f.title)) add("original", own);
  add("year", f.year ? String(f.year) : str(m?.year) || str(item.parsed?.year));
  f.genres.forEach((g) => add("genre", g));
  const cast = Array.isArray(m?.cast) ? m!.cast : [];
  for (const c of cast) if (c && typeof c === "object") add("cast", str((c as { name?: unknown }).name));
  for (const c of cast) if (c && typeof c === "object") add("character", str((c as { character?: unknown }).character));
  for (const file of files) if (file && typeof file.path === "string") add("file", fileBase(file.path));
  const index = { fields, all: fields.map((x) => x.folded).join("\n") };
  searchCache.set(item, { meta: item.meta, parsed: item.parsed, files: item.files, n: files.length, index });
  return index;
}
export const matchesWords = (item: Item, words: string[]): boolean => { if (!words.length) return true; const all = itemSearch(item).all; return words.every((w) => all.includes(w)); };

/** Why a record matched a search when the title alone doesn't explain it. null = the title (and year) explain it. */
export type MatchReason = { kind: Exclude<SearchKind, "title"> | "mixed"; text: string };
export function matchReason(item: Item, words: string[]): MatchReason | null {
  if (!words.length) return null;
  const { fields } = itemSearch(item);
  if (fields.some((x) => x.kind === "title" && words.every((w) => x.folded.includes(w)))) return null;
  const head = fields.filter((x) => x.kind === "title" || x.kind === "year").map((x) => x.folded).join(" ");
  if (words.every((w) => head.includes(w))) return null;
  for (const x of fields) if (words.every((w) => x.folded.includes(w))) return { kind: x.kind as MatchReason["kind"], text: x.text };
  return { kind: "mixed", text: "" };
}

// ---------- ordering ----------
type Row = { item: Item; f: ItemFacts };
const ord = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
/** Known values first (unknown ones always last), ties by title, then by key, so the order never depends on scan order. */
function compareRows(sort: LibrarySort, col: Intl.Collator) {
  return (a: Row, b: Row): number => {
    const byTitle = () => col.compare(a.f.title, b.f.title) || ord(a.item.key, b.item.key);
    if (sort === "az") return byTitle();
    const pick = sort === "new" || sort === "old" ? "year" : sort === "short" ? "runtime" : "rating";
    const av = a.f[pick], bv = b.f[pick];
    if (!av || !bv) return !av && !bv ? byTitle() : !av ? 1 : -1;
    const diff = sort === "new" || sort === "rating" ? bv - av : av - bv;
    return diff || byTitle();
  };
}
export function sortLibrary(list: Item[], sort: LibrarySort, locale: string): Item[] {
  const rows: Row[] = list.map((item) => ({ item, f: itemFacts(item) }));
  rows.sort(compareRows(sort, libraryCollator(locale)));
  return rows.map((r) => r.item);
}
export const compareFactsFor = (sort: LibrarySort, locale: string) => compareRows(sort, libraryCollator(locale));

export function selectLibrary(items: Item[], query: string, sort: LibrarySort, filter: LibraryFilter, genre: string, locale: string): Item[] {
  const words = queryWords(query);
  const stats = filter === "versions" ? libraryStats(items) : null;
  const kept = items.filter((i) => matchesWords(i, words) && (!genre || itemFacts(i).genres.includes(genre))
    && (filter !== "unmatched" || !itemFacts(i).matched) && (filter !== "versions" || stats!.versions.has(workIdentity(i))));
  return sortLibrary(kept, sort, locale);
}

// ---------- saved view ----------
export type LibraryView = { sort: LibrarySort; filter: LibraryFilter; genre: string; decade: string; minRating: number; compact: boolean; runtime: "" | "short" | "medium" | "long"; watch: "all" | "unwatched" | "started" | "watched" };
export function cleanLibraryView(raw: unknown): LibraryView {
  const x = (raw && typeof raw === "object" ? raw : {}) as Partial<LibraryView>;
  return {
    sort: ["az", "new", "old", "rating", "short"].includes(x.sort || "") ? x.sort! : "az",
    filter: ["all", "unmatched", "versions"].includes(x.filter || "") ? x.filter! : "all",
    genre: typeof x.genre === "string" ? x.genre.slice(0, 80) : "",
    decade: typeof x.decade === "string" && /^\d{3}0$/.test(x.decade) ? x.decade : "",
    minRating: [-1, 0, 6, 7, 8].includes(x.minRating ?? 0) ? x.minRating ?? 0 : 0,
    compact: x.compact === true,
    runtime: x.runtime === "short" || x.runtime === "medium" || x.runtime === "long" ? x.runtime : "",
    watch: x.watch === "unwatched" || x.watch === "started" || x.watch === "watched" ? x.watch : "all",
  };
}
export function filterLibraryPeriod(items: Item[], decade: string, minRating: number) {
  const start = Number(decade);
  return items.filter((i) => {
    const f = itemFacts(i);
    return (!decade || (f.year >= start && f.year < start + 10)) && (minRating === -1 ? !f.rating : (!minRating || f.rating >= minRating));
  });
}
export function filterLibraryRuntime(items: Item[], runtime: LibraryView["runtime"]) {
  return !runtime ? items : items.filter((i) => { const n = itemFacts(i).runtime; return n > 0 && (runtime === "short" ? n <= 90 : runtime === "medium" ? n > 90 && n <= 150 : n > 150); });
}
/** Decades (newest first) and genres (alphabetical in the UI language) that exist in the list. */
export const libraryDecades = (items: Item[]): string[] => [...new Set(items.map((i) => itemFacts(i).year).filter(Boolean).map((y) => String(Math.floor(y / 10) * 10)))].sort((a, b) => Number(b) - Number(a));
export const libraryGenres = (items: Item[], locale: string): string[] => [...new Set(items.flatMap((i) => itemFacts(i).genres))].sort(libraryCollator(locale).compare);

export function libraryWatchState(item: Item, recent: Map<string, Recent>, finished: (path: string) => boolean): "unwatched" | "started" | "watched" {
  const states = item.files.map((f) => { const r = recent.get(f.path); return finished(f.path) || (r && Number.isFinite(r.time) && r.duration > 0 && r.time / r.duration >= .95) ? 2 : r && Number.isFinite(r.time) && r.time > 0 ? 1 : 0; });
  if (states.length && (item.parsed.kind === "movie" ? states.some((n) => n === 2) : states.every((n) => n === 2))) return "watched";
  return states.some((n) => n > 0) ? "started" : "unwatched";
}
export function validLibraryItems(items: Item[]): Item[] {
  return items.filter((i) => !!i && typeof i.key === "string" && !!i.parsed && typeof i.parsed.title === "string" && ["movie", "tv"].includes(i.parsed.kind) && Array.isArray(i.files) && i.files.length > 0 && i.files.every((f) => f && typeof f.path === "string" && !!f.path.trim()));
}
