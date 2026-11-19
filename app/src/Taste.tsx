import { uiBusy } from "./databaseStorage";
import type { AiUse } from "./ai";
import { appStorage as localStorage } from "./appStorage";
import { answerNote,geminiBlockReason } from "./assistantProviderModel";
import { aiErrorPlan,classifyAiError,explainAiError,safeAiError,withoutAssistantTools } from "./assistantReliability";
import { extraText } from "./Extras";
import { listDelta,writeDelta } from "./extrasModel";
import { lbUser,saveFriendRatings } from "./tasteEngine";
// Taste data (likes, dislikes, watchlist), recommendations from friends and the Gemini chat.
import { useEffect,useRef,useState } from "react";
import { aiKey,aiModel,captureAiUse,otherAi } from "./ai";
import { lang,tt } from "./i18n";
import { details,Item,SearchHit,searchTmdb,store,tmdbGenresOf,tmdbKeywords } from "./library";
import { invoke } from "./nativeCore";
import { I,Icon } from "./Screens";

import { isLetterboxdUrl,sameTitleYear,validStars } from "./safety";
import { logDebug } from "./debugTelemetry";

// ---------- taste store ----------
export type Vote = "like" | "dislike";
export type TasteEntry = { title: string; year?: string; kind: "movie" | "tv"; vote?: Vote; want?: boolean; at: number };
export type Rec = {
  id: string; title: string; year?: string; kind: "movie" | "tv"; from: string; note: string; at: number;
  tmdbId?: number; poster?: string | null; status?: "watched" | "dismissed"; vote?: Vote; rating?: number; noPoster?: boolean;
  /** where it came from on the friend's Letterboxd: "İzledi", "Beğendi", "İzlemek istiyor", "Liste: …" */
  tags?: string[]; stars?: number;
};

/** Titles the user ticked as "watched" in the assistant's answers. */
export const loadSeen = () => store.json<string[]>("seenList", []);
export const seenKey = (t: string) => t.trim().toLocaleLowerCase("tr");
/** Titles the user wants to watch later (from the assistant, the import or by hand). */
export const loadLater = () => store.json<string[]>("laterList", []);
export const has = (l: string[], t: string) => l.some((x) => seenKey(x) === seenKey(t));
export function toggleList(key: string, t: string, on?: boolean): string[] {
  const cur = store.json<string[]>(key, []);
  const want = on ?? !has(cur, t);
  const next = want ? (has(cur, t) ? cur : [...cur, t.trim()]) : cur.filter((x) => seenKey(x) !== seenKey(t));
  store.set(key, JSON.stringify(next));
  listeners.forEach((f) => f());
  return next;
}
export const markSeen = (t: string, on?: boolean) => {
  const l = toggleList("seenList", t, on);
  diarySet(t, undefined, { watched: has(l, t) ? Date.now() : undefined });
  return l;
};
export const markLater = (t: string, on?: boolean) => toggleList("laterList", t, on);
/** Takes a title off "Sonra izle" whether it was saved with its year or without (11). */
export function laterOff(title: string, year?: string) {
  const plain = seenKey(title.replace(/\s*\(\d{4}\)\s*$/, ""));
  const next = loadLater().filter((x) => {
    const y = x.match(/\((\d{4})\)\s*$/)?.[1];
    return !(seenKey(x.replace(/\s*\(\d{4}\)\s*$/, "")) === plain && (!y || !year || y === year));
  });
  store.set("laterList", JSON.stringify(next));
  listeners.forEach((f) => f());
}
/** The library title a film or series is: the same TMDB id AND kind, else the same name (and year when both are known) (10). */
export function libMatch(items: Item[], t: { title: string; year?: string | number; tmdbId?: number; kind?: "movie" | "tv" }): Item | undefined {
  const byId = t.tmdbId ? items.find((i) => i.meta && i.meta.id === t.tmdbId && i.meta.kind === (t.kind ?? "movie")) : undefined;
  if (byId) return byId;
  const name = seenKey(t.title.replace(/\s*\(\d{4}\)\s*$/, ""));
  return items.find((i) => {
    if (t.kind && (i.meta?.kind ?? i.parsed.kind) !== t.kind) return false;
    if (seenKey(i.meta?.title ?? i.parsed.title) !== name) return false;
    const iy = i.meta?.year || (i.parsed.year ? String(i.parsed.year) : "");
    return !t.year || !iy || String(t.year) === iy;
  });
}
export const youtubeTrailer = (t: string) =>
  "https://www.youtube.com/results?search_query=" + (encodeURIComponent(t.replace(/\s*\((\d{4})\)\s*$/, " $1") + tt(" türkçe fragman")));

/** Adds a friend's recommendation (matched on TMDB when possible). Returns false if it was already there. */
export async function addRecommendation(title: string, year?: string, from?: string, note?: string, quick = false): Promise<boolean> {
  const name = title.trim();
  const who = seenKey((from ?? "").trim() || "Biri");
  if (!name || loadRecs().some((r) => seenKey(r.from) === who && seenKey(r.title) === seenKey(name) && (!year || !r.year || r.year === year))) return false;
  let hit: SearchHit | undefined;
  if (!quick && store.get("tmdbKey")) {
    const y = year ? Number(year) : undefined;
    const [m, tv] = await Promise.all([searchTmdb(name, "movie", y).catch(() => []), searchTmdb(name, "tv", y).catch(() => [])]);
    hit = m[0] ?? tv[0];
  }
  const r: Rec = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title: hit?.title ?? name, year: hit?.year || year,
    kind: hit?.kind ?? "movie", from: (from ?? "").trim() || "Biri", note: (note ?? "").trim(), at: Date.now(), tmdbId: hit?.id, poster: hit?.poster, rating: hit?.rating,
  };
  saveRecs([r, ...loadRecs()]);
  return true;
}

// ---------- the taste diary: one record per title, library or not ----------
export type DiaryEntry = {
  review?: string; tags?: string[]; rewatch?: number; lb?: string; lbr?: number;
  title: string; year?: string; watched?: number; vote?: Vote; rating?: number; note?: string;
  genres?: string[]; at: number;
  /** what the user's own Letterboxd last said (so a later change there replaces it, but a rating given in Luna stays) */
  lbRating?: number; lbLike?: boolean;
};
export const dKey = (title: string, year?: string) => seenKey(title.replace(/\s*\((\d{4})\)\s*$/, "")) + "|" + (year ?? (title.match(/\((\d{4})\)\s*$/)?.[1] ?? ""));
// Every poster on Keşfet asks for its diary entry, its warning mark and the taste list on each render: parsing the whole
// stored JSON for each card made rows stutter while new posters came in. The parsed value is kept until the stored text changes.
const parsed = new Map<string, { raw: string | null; value: unknown }>();
function readJson<T>(k: string, fallback: T): T {
  const raw = localStorage.getItem(k);
  const hit = parsed.get(k);
  if (hit && hit.raw === raw) return hit.value as T;
  const value = store.json<T>(k, fallback);
  parsed.set(k, { raw, value });
  return value;
}
export const loadDiary = () => readJson<Record<string, DiaryEntry>>("diary", {});
export function diaryGet(title: string, year?: string): DiaryEntry | undefined {
  const d = loadDiary();
  const y = year ?? title.match(/\((\d{4})\)\s*$/)?.[1];
  const name = seenKey(title.replace(/\s*\(\d{4}\)\s*$/, ""));
  // without a year on either side the name decides; two known years that differ are two films
  return d[dKey(title, year)] ?? Object.values(d).find((e) => seenKey(e.title) === name && (!y || !e.year || e.year === y));
}
export function diarySet(title: string, year: string | undefined, patch: Partial<DiaryEntry>) {
  const clean = title.replace(/\s*\((\d{4})\)\s*$/, "").trim();
  const y = year ?? title.match(/\((\d{4})\)\s*$/)?.[1];
  const d = loadDiary();
  const k = Object.keys(d).find((x) => x === dKey(clean, y)) ??
    Object.keys(d).find((x) => seenKey(d[x].title) === seenKey(clean) && (!y || !d[x].year || d[x].year === y)) ?? dKey(clean, y);
  const cur = d[k] ?? { title: clean, year: y, at: Date.now() };
  if (y && !cur.year) cur.year = y;
  const next = { ...cur, ...patch, at: Date.now() };
  for (const f of Object.keys(patch) as (keyof DiaryEntry)[]) if (patch[f] === undefined) delete next[f];
  // A new personal vote/rating also records that this title was watched. Clearing a vote does not undo watching.
  const evaluated = patch.vote === "like" || patch.vote === "dislike" || (typeof patch.rating === "number" && Number.isFinite(patch.rating) && patch.rating >= 1 && patch.rating <= 10);
  if (evaluated) next.watched = cur.watched ?? Date.now();
  d[k] = next;
  if (!store.set("diary", JSON.stringify(d))) return false;
  if (next.watched) {
    const label = next.year ? `${next.title} (${next.year})` : next.title;
    const seen = loadSeen();
    if (!has(seen, label)) store.set("seenList", JSON.stringify([...seen, label]));
  }
  listeners.forEach((f) => f());
  return true;
}
/** Moves the older, scattered records (library thumbs, ticks, recommendation votes) into the diary once. */
export function migrateDiary() {
  if (store.get("diaryV") === "1") return;
  const d = loadDiary();
  const put = (title: string, year: string | undefined, patch: Partial<DiaryEntry>) => {
    const k = dKey(title, year);
    d[k] = { ...(d[k] ?? { title, year, at: Date.now() }), ...patch };
  };
  for (const e of Object.values(store.json<Record<string, TasteEntry>>("taste", {}))) if (e.vote) put(e.title, e.year, { vote: e.vote });
  for (const t of store.json<string[]>("seenList", [])) put(t.replace(/\s*\(\d{4}\)\s*$/, ""), t.match(/\((\d{4})\)\s*$/)?.[1], { watched: Date.now() });
  for (const r of store.json<Rec[]>("recs", [])) if (r.status === "watched") put(r.title, r.year, { watched: r.at, ...(r.vote ? { vote: r.vote } : {}) });
  store.set("diary", JSON.stringify(d));
  store.set("diaryV", "1");
}

/** User playlists ("Hafta sonu maratonu"…), built by hand or by the assistant. */
export type PlItem = { title: string; year?: string; poster?: string | null; tmdbId?: number; kind?: "movie" | "tv"; stars?: number; rating?: number; noPoster?: boolean };
/** `parent`: the folder it sits in (e.g. a friend). `source`: a Letterboxd page it is filled from ("Güncelle"). */
export type Playlist = { id: string; name: string; items: PlItem[]; at: number; parent?: string; source?: { url: string; minStars?: number } };

type LbFilm = { title: string; year?: string; stars?: number };
type LbSection = { name: string; kind: "watched" | "liked" | "watchlist" | "list"; url: string; films: LbFilm[] };
export type TaggedFilm = LbFilm & { tags?: string[] };
const lbTag = (sc: LbSection) => sc.kind === "watched" ? "İzledi" : sc.kind === "liked" ? "Beğendi" : sc.kind === "watchlist" ? "İzlemek istiyor" : "Liste: " + sc.name;
/** All films of the sections, one entry per film, with every place it appears in as a tag. */
export function lbFlatten(secs: LbSection[]): TaggedFilm[] {
  const map = new Map<string, TaggedFilm>();
  for (const sc of secs) for (const f of sc.films) {
    const k = seenKey(f.title) + "|" + (f.year ?? "");
    const ex = map.get(k);
    if (ex) { if (!ex.tags!.includes(lbTag(sc))) ex.tags!.push(lbTag(sc)); ex.stars = ex.stars ?? f.stars; }
    else map.set(k, { ...f, tags: [lbTag(sc)] });
  }
  return [...map.values()];
}
export const isLetterboxd = isLetterboxdUrl;
export const readLetterboxd = (url: string, pages = 30, lists = true) => invoke<LbSection[]>("letterboxd_read", { url, maxPages: pages, lists });

/** The user's own Letterboxd: what they watched (with their stars), liked and want to watch goes into
 *  Luna's records (the diary, "Watch later"), so friends' lists can hide it and the assistant knows it. */
export const myLetterboxd = () => store.get("myLetterboxd") || "";
export async function linkMyLetterboxd(url: string): Promise<string> {
  const secs = await readLetterboxd(url, 100, false);
  const d = loadDiary();
  const byName = new Map<string, string>();
  for (const [k, e] of Object.entries(d)) byName.set(seenKey(e.title), k);
  const keyOf = (f: LbFilm) => {
    const k = dKey(f.title, f.year);
    if (d[k]) return k;
    const other = byName.get(seenKey(f.title));
    return other && (!f.year || !d[other].year || d[other].year === f.year) ? other : k;
  };
  let watched = 0, liked = 0, later = 0, changed = 0;
  const likedNow = new Set<string>();
  const hasLiked = secs.some((s) => s.kind === "liked");
  for (const sc of secs) for (const f of sc.films) {
    if (sc.kind !== "watched" && sc.kind !== "liked") continue;
    const k = keyOf(f);
    const cur = d[k] ?? { title: f.title, year: f.year, at: Date.now() };
    if (!cur.watched) watched++;
    const next: DiaryEntry = { ...cur, watched: cur.watched ?? Date.now(), at: cur.at };
    const stars = f.stars ? Math.max(1, Math.min(10, Math.round(f.stars * 2))) : undefined;
    // a rating that came from Letterboxd follows Letterboxd (changed or taken off there); one given in Luna stays
    if (stars != null && (!cur.rating || cur.rating === cur.lbRating || cur.rating === stars)) { if (cur.rating && cur.rating !== stars) changed++; next.rating = stars; next.lbRating = stars; }
    else if (sc.kind === "watched" && stars == null && cur.lbRating && cur.rating === cur.lbRating) { next.rating = undefined; next.lbRating = undefined; changed++; }
    if (sc.kind === "liked") {
      likedNow.add(k);
      if (!cur.vote) { next.vote = "like"; next.lbLike = true; liked++; }
    }
    d[k] = next;
    byName.set(seenKey(f.title), k);
  }
  // a heart taken off on Letterboxd takes back the like it gave (only when the liked films were read)
  if (hasLiked) for (const [k, e] of Object.entries(d)) if (e.lbLike && e.vote === "like" && !likedNow.has(k)) { d[k] = { ...e, vote: undefined, lbLike: undefined }; changed++; }
  store.set("diary", JSON.stringify(d));
  // films that came without genres get them from TMDB in the background (guarded: the tests run this function alone)
  if (typeof fillDiaryGenres === "function") void fillDiaryGenres();
  const wl = secs.find((s) => s.kind === "watchlist")?.films ?? [];
  if (wl.length) {
    const cur = loadLater();
    const add = wl.filter((f) => !cur.some((x) => sameTitleYear(x, f.title, f.year)) && !d[keyOf(f)]?.watched)
      .map((f) => (f.year ? `${f.title} (${f.year})` : f.title));
    later = add.length;
    store.set("laterList", JSON.stringify([...cur, ...add]));
  }
  recordLbChange("my:"+url.trim(),extraText("Benim Letterboxd profilim", "My Letterboxd profile"),[...new Map(secs.filter(sc=>sc.kind==="watched").flatMap(sc=>sc.films).map(f=>[seenKey(f.title)+"|"+(f.year||""),{title:f.title,year:f.year}])).values()],[],seenKey);
  store.set("myLetterboxd", url.trim());
  store.set("myLetterboxdAt", String(Date.now()));
  listeners.forEach((f) => f());
  const total = secs.find((s) => s.kind === "watched")?.films.length ?? 0;
  return tt("Senin Letterboxd'un bağlandı: {0} izlediğin film ({1} yeni), {2} beğeni, izleme listenden {3} film “Sonra izle”ye eklendi.", total, watched, liked, later)
    + (changed ? " " + tt("Letterboxd'da değişen {0} puan ya da beğeni güncellendi.", changed) : "");
}
/** Films in the diary without genres (from Letterboxd): their genres from TMDB, a few at a time, liked and rated first. */
let fillingGenres = false;
export async function fillDiaryGenres(max = 40) {
  if (fillingGenres || !store.get("tmdbKey")) return;
  fillingGenres = true;
  try {
    const d = loadDiary();
    const todo = Object.entries(d).filter(([, e]) => !e.genres && (e.vote || e.rating))
      .sort((a, b) => Number(b[1].vote === "like") - Number(a[1].vote === "like") || (b[1].rating ?? 0) - (a[1].rating ?? 0)).slice(0, max);
    for (const [k, e] of todo) {
      const g = await tmdbGenresOf(e.title, e.year).catch(() => null);
      if (g == null) continue;
      const now = loadDiary();
      if (now[k]) { now[k] = { ...now[k], genres: g }; store.set("diary", JSON.stringify(now)); }
    }
  } finally { fillingGenres = false; listeners.forEach((f) => f()); }
}
/** The user's own Letterboxd, read again by itself once a day (so it stays current when they forget). */
export async function autoUpdateMyLetterboxd(): Promise<string | null> {
  const url = myLetterboxd();
  if (!url || Date.now() - Number(store.get("myLetterboxdAt") ?? 0) < 20 * 3600 * 1000) return null;
  return linkMyLetterboxd(url).catch(() => null);
}
/** Watched by the user: in the diary (ticked, rated, from their Letterboxd) or on the old "seen" list. */
export const iWatched = (t: { title: string; year?: string }) => !!diaryGet(t.title, t.year)?.watched || loadSeen().some((saved) => sameTitleYear(saved, t.title, t.year));
/** "Hide what I watched" on friends' recommendations and lists (one switch for all of them). */
export function useHideWatched(): [boolean, () => void] {
  const [on, setOn] = useState(() => store.get("hideWatched") === "1");
  useEffect(() => { const f = () => setOn(store.get("hideWatched") === "1"); window.addEventListener("luna-hide-watched", f); return () => window.removeEventListener("luna-hide-watched", f); }, []);
  return [on, () => { store.set("hideWatched", on ? "0" : "1"); window.dispatchEvent(new Event("luna-hide-watched")); }];
}
const lbLine = (f: TaggedFilm) => `${f.title}${f.year ? ` (${f.year})` : ""}${f.stars ? ` ★${f.stars}` : ""}${f.tags?.length ? ` [${f.tags.join(", ")}]` : ""}`;

/** Adds many recommendations at once without TMDB look-ups (posters are fetched lazily). */
export function addRecommendationsBulk(films: TaggedFilm[], from: string, note = ""): number {
  const cur = loadRecs();
  const who = seenKey(from);
  const byKey = new Map(cur.filter((r) => seenKey(r.from) === who).map((r) => [seenKey(r.title) + "|" + (r.year ?? ""), r]));
  const add: Rec[] = [];
  for (const f of films) {
    const k = seenKey(f.title) + "|" + (f.year ?? "");
    if (!f.title.trim()) continue;
    const ex = byKey.get(k);
    if (ex) { // already there: just learn where else it appears
      for (const t of f.tags ?? []) if (!(ex.tags ?? []).includes(t)) ex.tags = [...(ex.tags ?? []), t];
      if (f.stars && !ex.stars) ex.stars = f.stars;
      continue;
    }
    const r: Rec = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), title: f.title.trim(), year: f.year, kind: "movie",
      from: from.trim(), note, at: Date.now(), tags: f.tags, stars: f.stars };
    byKey.set(k, r);
    add.push(r);
  }
  saveRecs([...add, ...cur]);
  return add.length;
}

/** Looks up missing posters (and TMDB ids / ratings) for the first `limit` entries, one by one. */
export async function fillPosters<T extends { title: string; year?: string; poster?: string | null; tmdbId?: number; rating?: number; noPoster?: boolean; kind?: "movie" | "tv" }>(
  list: T[], save: () => void, limit = 24) {
  if (!store.get("tmdbKey")) return;
  const todo = list.filter((it) => !((it.poster && it.rating != null) || it.noPoster)).slice(0, limit);
  let n = 0;
  const one = async (it: T) => {
    const y = it.year ? Number(it.year) : undefined;
    try {
      // its TMDB id is already known: that exact title's poster, not a name search's first hit
      if (it.tmdbId) {
        const d = await details(it.kind ?? "movie", it.tmdbId).catch(() => null);
        if (d) {
          it.poster = it.poster ?? d.poster; it.rating = d.rating ?? 0;
          if (!it.poster) it.noPoster = true;
          if (++n % 8 === 0) save();
          return;
        }
        return;
      }
      // prefer a hit with a poster (and the right year); episode titles like "Show: Episode" fall back to the show
      const good = (l: SearchHit[]) => l.find((x) => x.poster && (!it.year || x.year === it.year) && (!it.kind || x.kind === it.kind));
      const tries: [string, "movie" | "tv", number?][] = [[it.title, "movie", y], [it.title, "movie"], [it.title, "tv"]];
      if (it.title.includes(":")) tries.push([it.title.split(":")[0], "tv"], [it.title.split(":")[0], "movie"]);
      let h: SearchHit | undefined;
      for (const [q, k, yy] of tries) { h = good(await searchTmdb(q, k, yy)); if (h) break; }
      if (h) {
        if (!it.tmdbId) { it.tmdbId = h.id; it.kind = h.kind; }
        it.poster = it.poster ?? h.poster; it.rating = h.rating ?? 0;
      } else it.noPoster = true;
    } catch { /* network / rate limit: try again next time instead of giving up on the poster */ }
    if (++n % 8 === 0) save();
  };
  // 4 at a time, in list order (what's on screen first)
  const queue = [...todo];
  await Promise.all(Array.from({ length: 4 }, async () => { while (queue.length) await one(queue.shift()!); }));
  if (n) save();
}

/** Reads any link for the assistant: Letterboxd is read film by film (with ratings), other pages as text. */
export async function readLink(url: string): Promise<string> {
  if (isLetterboxd(url)) {
    const secs = await readLetterboxd(url);
    return secs.map((sc) => {
      const top = [...sc.films].sort((x, y) => (y.stars ?? 0) - (x.stars ?? 0)).slice(0, 40);
      return `## ${sc.name} (${lbTag(sc)}): ${sc.films.length} film (en yüksek puanlı/ilk 40 aşağıda; tamamı için import_link kullan)\n${top.map(lbLine).join("\n")}`;
    }).join("\n\n");
  }
  return (await invoke<string>("fetch_page_text", { url })).slice(0, 15000);
}

/** Rows of a CSV text (quotes and line breaks inside quotes handled). */
export function csvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (q) { if (c === '"' && csv[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && csv[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/** The films of one export CSV: the last header row with Name and Year starts the table
 *  (list files have a small header table of their own above it, whose Name is the list's name). */
export function lbCsv(text: string): { films: LbFilm[]; listName?: string } {
  const rows = csvRows(text.replace(/^\uFEFF/, ""));
  const low = rows.map((r) => r.map((c) => c.trim().toLowerCase()));
  let h = -1;
  low.forEach((r, i) => { if (r.includes("name") && r.includes("year")) h = i; });
  if (h < 0) return { films: [] };
  const first = low.findIndex((r) => r.includes("name"));
  const listName = first >= 0 && first < h ? rows[first + 1]?.[low[first].indexOf("name")]?.trim() : undefined;
  const ni = low[h].indexOf("name"), yi = low[h].indexOf("year"), ri = low[h].indexOf("rating");
  const films = rows.slice(h + 1).filter((r) => r[ni]?.trim()).map((r) => {
    const stars = ri >= 0 ? validStars(r[ri] ?? "") : undefined;
    return { title: r[ni].trim(), year: r[yi]?.trim() || undefined, stars };
  });
  return { films, listName };
}

/** A Letterboxd data export (Settings → Data → Export) as sections: rated / watched, liked, watchlist and each list. */
export async function readLetterboxdExport(paths: string[]): Promise<LbSection[]> {
  const files = await invoke<[string, string][]>("read_export", { paths });
  const watched = new Map<string, LbFilm>();
  const secs: LbSection[] = [];
  for (const [name, text] of files) {
    const n = name.toLowerCase().replace(/\\/g, "/");
    const base = n.split("/").pop()!;
    const { films, listName } = lbCsv(text);
    if (!films.length) continue;
    if (base === "ratings.csv" || base === "watched.csv") {
      for (const f of films) { const k = seenKey(f.title) + "|" + (f.year ?? ""); watched.set(k, { ...watched.get(k), ...f, stars: f.stars ?? watched.get(k)?.stars }); }
    } else if (n.endsWith("likes/films.csv")) secs.push({ name: tt("Beğendikleri"), kind: "liked", url: "", films });
    else if (base === "watchlist.csv") secs.push({ name: tt("İzleme listesi"), kind: "watchlist", url: "", films });
    else if (n.includes("lists/")) secs.push({ name: listName || base.replace(/\.csv$/, "").replace(/-/g, " "), kind: "list", url: "", films });
  }
  if (watched.size) secs.unshift({ name: tt("İzledikleri"), kind: "watched", url: "", films: [...watched.values()] });
  if (!secs.length) throw new Error(tt("Bu dosyada Letterboxd listesi bulunamadı. Letterboxd'da Ayarlar → Veri → Dışa aktar ile indirilen ZIP dosyasını seç."));
  return secs;
}

/** A friend's folder with lists linked to their Letterboxd: watchlist and the films they rated 4★+.
 *  From an export (`secs` given) the lists aren't linked: they are filled once, "Güncelle" skips them. */
export async function followLetterboxd(person: string, url: string, given?: LbSection[]): Promise<string> {
  const secs = given ?? await readLetterboxd(url, 80);
  saveFriendRatings(person,secs.filter(x=>x.kind==="watched").flatMap(x=>x.films),(url&&lbUser(url))||undefined);
  const all = loadPlaylists();
  let folder = all.find((p) => !p.parent && seenKey(p.name) === seenKey(person));
  if (!folder) { folder = { id: Date.now().toString(36), name: person.trim(), items: [], at: Date.now() }; all.push(folder); }
  const made: string[] = [];
  const put = (name: string, src: { url: string; minStars?: number }, films: LbFilm[]) => {
    // the same list is found by its Letterboxd address (a custom list called "Watchlist" isn't the watchlist)
    let pl = all.find((p) => p.parent === folder!.id && (src.url ? p.source?.url === src.url && (p.source?.minStars ?? 0) === (src.minStars ?? 0) : !p.source && p.name === name));
    if (!pl) { pl = { id: Date.now().toString(36) + made.length, name, items: [], at: Date.now(), parent: folder!.id }; all.push(pl); }
    pl.source = src.url ? src : undefined;
    pl.items = films.filter((f) => !src.minStars || (f.stars ?? 0) >= src.minStars).map((f) => ({ title: f.title, year: f.year, stars: f.stars }));
    made.push(`${name}: ${pl.items.length}`);
  };
  for (const sc of secs) {
    // everything they watched, and their favourites (4★+) apart
    if (sc.kind === "watched") { put(tt("İzledikleri"), { url: sc.url }, sc.films); put(tt("Yüksek puanladıkları (4★+)"), { url: sc.url, minStars: 4 }, sc.films); }
    else if (sc.films.length) put(sc.kind === "list" ? sc.name : sc.name, { url: sc.url }, sc.films);
  }
  savePlaylists(all);
  return tt("“{0}” klasörü: {1}", person.trim(), made.join(" · "));
}

export type LbChange = { id:string;name:string;at:number;added:{title:string;year?:string}[];missing:{title:string;year?:string}[];addedCount:number;missingCount:number };
function recordLbChange(id:string,name:string,films:{title:string;year?:string}[],fallback:{title:string;year?:string}[],norm?:(title:string)=>string) {
  const raw=store.json<Record<string,{title:string;year?:string}[]>>("lunaLbSnapshots",{});
  const snapshots=raw&&typeof raw==="object"&&!Array.isArray(raw)?raw:{};
  const previous=Array.isArray(snapshots[id])?snapshots[id].filter(x=>x&&typeof x.title==="string"):null;
  // `norm` is the caller's own title key (Turkish casing), so a film the refresh merges is not reported as "new"
  const delta=listDelta(previous??fallback,films,norm);
  const history=store.json<LbChange[]>("lunaLbChanges",[]);
  const entry:LbChange={id:crypto.randomUUID(),name,at:Date.now(),added:delta.added.slice(0,500),missing:previous?delta.removed.slice(0,500):[],addedCount:delta.added.length,missingCount:previous?delta.removed.length:0};
  // the very first read of a profile is the starting point, not a change; and an unchanged read adds no
  // "+0 / −0" row (the daily refresh would otherwise push every real change out of the 30 kept)
  const worth=!(previous===null&&!fallback.length)&&(entry.addedCount>0||entry.missingCount>0);
  try {
    writeDelta(localStorage,[{key:"lunaLbSnapshots",before:store.get("lunaLbSnapshots"),after:JSON.stringify({...snapshots,[id]:films.map(x=>({title:x.title,year:x.year}))})},...(worth?[{key:"lunaLbChanges",before:store.get("lunaLbChanges"),after:JSON.stringify([entry,...(Array.isArray(history)?history:[])].slice(0,30))}]:[])]);
    window.dispatchEvent(new Event("luna-extras"));
  } catch(error) { window.dispatchEvent(new CustomEvent("luna-extra-error",{detail:extraText("Liste güncellendi, fakat değişiklik özeti kaydedilemedi: ","List updated, but the change summary could not be saved: ")+String(error)})); }
}

/** "Güncelle": refills every list that is linked to Letterboxd; new films are added, nothing is lost. */
export async function refreshLinkedPlaylists(progress?: (m: string) => void): Promise<string> {
  // a friend connected before 1.4.0 only had their 4★+ films: their whole "watched" list is added
  const pls = loadPlaylists();
  let addedLists = false;
  for (const fav of pls.filter((p) => p.source?.minStars && p.parent)) {
    if (pls.some((x) => x.parent === fav.parent && x.source?.url === fav.source!.url && !x.source?.minStars)) continue;
    pls.splice(pls.indexOf(fav), 0, { id: Date.now().toString(36) + "w" + pls.length, name: tt("İzledikleri"), items: [], at: Date.now(), parent: fav.parent, source: { url: fav.source!.url } });
    addedLists = true;
  }
  if (addedLists) savePlaylists(pls);
  const linked = loadPlaylists().filter((p) => p.source);
  const byUrl = new Map<string, LbFilm[]>();
  // read everything first; the lists are changed only at the end, on what is saved by then
  // (a list renamed or made while the pages were loading stays as it is)
  const got = new Map<string, LbFilm[]>();
  let failed = 0;
  for (const [i, pl] of linked.entries()) {
    progress?.(tt("Güncelleniyor {0}/{1}: {2}", i + 1, linked.length, pl.name));
    try {
      const u = pl.source!.url;
      if (!byUrl.has(u)) byUrl.set(u, (await readLetterboxd(u, 80, false)).flatMap((sc) => sc.films));
      got.set(pl.id, byUrl.get(u)!);
    } catch { failed++; /* keep the old content if the page can't be read */ }
  }
  const all = loadPlaylists();
  let added = 0;
  for (const pl of all) {
    const films = got.get(pl.id);
    if (!films || !pl.source) continue;
    recordLbChange(pl.id,pl.name,films.filter(f=>!pl.source?.minStars||(f.stars??0)>=pl.source.minStars),pl.items,seenKey);
    for (const f of films) {
      if (pl.source.minStars && (f.stars ?? 0) < pl.source.minStars) continue;
      const ex = pl.items.find((x) => seenKey(x.title) === seenKey(f.title) && (!x.year || !f.year || x.year === f.year));
      if (ex) ex.stars = f.stars ?? ex.stars;
      else { pl.items.push({ title: f.title, year: f.year, stars: f.stars }); added++; }
    }
  }
  savePlaylists(all);
  if (!linked.length) return tt("Letterboxd'a bağlı liste yok");
  if (failed === linked.length) throw new Error(tt("Hiçbir liste okunamadı; internet bağlantını kontrol et."));
  return tt("{0} liste güncellendi, {1} yeni film", linked.length - failed, added) + (failed ? tt(" · {0} liste okunamadı", failed) : "");
}
export const loadPlaylists = () => store.json<Playlist[]>("playlists", []);
export let plNames: { id: string; name: string }[] | null = null;
export const savePlaylists = (l: Playlist[]) => { plNames = null; store.set("playlists", JSON.stringify(l)); listeners.forEach((f) => f()); };
/** A list by id, "Friend › List", or a name that only one list has (9). */
export function resolvePl(all: Playlist[], ref: string): Playlist | undefined {
  const byId = all.find((p) => p.id === ref);
  if (byId) return byId;
  const full = (p: Playlist) => (p.parent ? `${all.find((x) => x.id === p.parent)?.name ?? "?"} › ` : "") + p.name;
  const q = seenKey(ref.replace(/\s*[›>]\s*/g, " › "));
  const exact = all.find((p) => seenKey(full(p)) === q);
  if (exact) return exact;
  const same = all.filter((p) => seenKey(p.name) === q);
  return same.length === 1 ? same[0] : same.find((p) => !p.parent);
}
const findPl = (name: string) => resolvePl(loadPlaylists(), name);
export function createPlaylist(name: string): Playlist {
  const ex = findPl(name);
  if (ex) return ex;
  const pl: Playlist = { id: Date.now().toString(36), name: name.trim(), items: [], at: Date.now() };
  savePlaylists([...loadPlaylists(), pl]);
  return pl;
}
/** Is this film in that list (same name, and the same year when both know one)? */
export function inPlaylist(p: Playlist, title: string, year?: string) {
  const t = seenKey(title.replace(/\s*\((\d{4})\)\s*$/, "").trim());
  return p.items.some((x) => seenKey(x.title) === t && (!year || !x.year || x.year === year));
}
/** Takes a film out of one of the user's lists (the way back from "+ Listeye"). */
export function removeFromPlaylist(id: string, title: string, year?: string) {
  const all = loadPlaylists(), p = all.find((x) => x.id === id);
  if (!p) return;
  const t = seenKey(title.replace(/\s*\((\d{4})\)\s*$/, "").trim());
  p.items = p.items.filter((x) => !(seenKey(x.title) === t && (!year || !x.year || x.year === year)));
  savePlaylists(all);
}
export async function addToPlaylist(name: string, items: { title: string; year?: string }[]): Promise<number> {
  const target = createPlaylist(name);
  let added = 0;
  const all = loadPlaylists();
  const pl = all.find((p) => p.id === target.id)!;
  for (const it of items) {
    const t = it.title.replace(/\s*\((\d{4})\)\s*$/, "").trim();
    const y = it.year ?? it.title.match(/\((\d{4})\)\s*$/)?.[1];
    // the same name from another year (a remake) is another film
    if (!t || pl.items.some((x) => seenKey(x.title) === seenKey(t) && (!y || !x.year || x.year === y))) continue;
    const rec = loadRecs().find((r) => seenKey(r.title) === seenKey(t) && (!y || !r.year || r.year === y));
    let hit: SearchHit | undefined;
    if (!rec?.poster && store.get("tmdbKey")) {
      const [m, tv] = await Promise.all([searchTmdb(t, "movie", y ? Number(y) : undefined).catch(() => []), searchTmdb(t, "tv", y ? Number(y) : undefined).catch(() => [])]);
      hit = m[0] ?? tv[0];
    }
    pl.items.push({ title: hit?.title ?? rec?.title ?? t, year: hit?.year || y || rec?.year, poster: hit?.poster ?? rec?.poster, tmdbId: hit?.id ?? rec?.tmdbId, kind: hit?.kind ?? rec?.kind });
    added++;
  }
  const fresh = loadPlaylists();
  const target2 = fresh.find((p) => p.id === target.id);
  if (target2) {
    for (const it of pl.items) {
      if (!target2.items.some((x) => seenKey(x.title) === seenKey(it.title) && (x.year ?? "") === (it.year ?? ""))) target2.items.push(it);
    }
    savePlaylists(fresh);
  } else {
    fresh.push(pl);
    savePlaylists(fresh);
  }
  return added;
}

/** Notes the assistant keeps about the user's taste ("korku sevmez"…). */
export const loadNotes = () => store.json<string[]>("userNotes", []);
export const saveNotes = (n: string[]) => { store.set("userNotes", JSON.stringify(n)); listeners.forEach((f) => f()); };

/** How well each friend's recommendations matched the user's taste. */
export function friendAffinity() {
  const out: Record<string, { liked: number; rated: number; total: number }> = {};
  const d = loadDiary();
  const byTitle = new Map(Object.values(d).map((e) => [seenKey(e.title), e]));
  for (const r of loadRecs()) {
    const o = (out[r.from] ??= { liked: 0, rated: 0, total: 0 });
    o.total++;
    const e = d[dKey(r.title, r.year)] ?? byTitle.get(seenKey(r.title));
    // the diary is where a vote is changed later, so it wins over the one the recommendation was saved with
    const v = e?.vote ?? r.vote;
    const rating = e?.rating;
    if (v || rating) {
      o.rated++;
      if (v === "like" || (rating ?? 0) >= 7) o.liked++;
    }
  }
  return out;
}

export const listeners = new Set<() => void>();
export const changed = () => listeners.forEach((f) => f());
export const loadTaste = () => readJson<Record<string, TasteEntry>>("taste", {});
export const loadRecs = () => readJson<Rec[]>("recs", []);
const saveTaste = (t: Record<string, TasteEntry>) => { store.set("taste", JSON.stringify(t)); changed(); };
export const saveRecs = (r: Rec[]) => { store.set("recs", JSON.stringify(r)); changed(); };

/** Re-renders when taste or recommendations change anywhere in the app. */
export function useTaste() {
  const [version, bump] = useState(0);
  useEffect(() => {
    const f = () => bump((n) => n + 1);
    listeners.add(f);
    return () => { listeners.delete(f); };
  }, []);
  return { taste: loadTaste(), recs: loadRecs(), version };
}

export const tasteKey = (it: Item) => it.meta && it.meta.id > 0 ? `${it.meta.kind}:${it.meta.id}` : `${it.parsed.kind}:${it.parsed.title.toLowerCase()}`;

export function setTaste(it: Item, patch: Partial<TasteEntry>) {
  const t = loadTaste();
  const k = tasteKey(it);
  const cur = t[k] ?? { title: it.meta?.title ?? it.parsed.title, year: it.meta?.year, kind: it.parsed.kind, at: Date.now() };
  t[k] = { ...cur, ...patch, at: Date.now() };
  if (!t[k].vote && !t[k].want) delete t[k];
  saveTaste(t);
  if (patch.vote === "like" || patch.vote === "dislike") {
    const title = it.meta?.title ?? it.parsed.title, year = it.meta?.year ?? (it.parsed.year ? String(it.parsed.year) : undefined);
    const entry = diaryGet(title, year);
    if (!entry?.watched || entry.vote !== patch.vote) diarySet(title, year, { vote: patch.vote });
  }
}
export const THUMB = "M7 10v11H3V10zM7 10l4-8a3 3 0 0 1 3 3v4h6a2 2 0 0 1 2 2.3l-1.4 8A2 2 0 0 1 18.6 21H7";
export const THUMB_DOWN = "M17 14V3h4v11zM17 14l-4 8a3 3 0 0 1-3-3v-4H4a2 2 0 0 1-2-2.3l1.4-8A2 2 0 0 1 5.4 3H17";

export function TasteButtons({ it, votesOnly=false }: { it: Item; votesOnly?:boolean }) {
  const { taste } = useTaste();
  const e = taste[tasteKey(it)];
  const title = it.meta?.title ?? it.parsed.title;
  const year = it.meta?.year || (it.parsed.year ? String(it.parsed.year) : undefined);
  const d = diaryGet(title, year);
  // like / dislike asks for points out of 10, the same as on the recommendations
  const [ask, setAsk] = useState<Vote | null>(null);
  const label = year ? `${title} (${year})` : title;
  const later = has(loadLater(), label) || has(loadLater(), title) || !!e?.want;
  const toggleLater = () => {
    if (later) { laterOff(title, year); if (e?.want) setTaste(it, { want: false }); }
    else markLater(label, true);
  };
  const vote = (v: Vote) => {
    // already voted: the first press opens the score bubble to change it, a second press removes the vote
    if (d?.vote === v && ask !== v) { setAsk(v); return; }
    const nv = d?.vote === v ? undefined : v;
    diarySet(title, year, { vote: nv, ...(nv && d?.vote && d.vote !== nv ? { rating: undefined } : {}), ...(it.meta?.genres?.length ? { genres: it.meta.genres } : {}) });
    setTaste(it, { vote: nv });
    setAsk(nv ?? null);
  };
  return (
    <>
      {!votesOnly&&<button className={"act" + (later ? " on" : "")} data-tip={later ? tt("Sonra izle listesinden çıkar") : tt("Sonra izle")}
        aria-label={tt("Sonra izle")} onClick={toggleLater}>
        <Icon d={later ? I.check : I.plus} size={20} />
      </button>}
      <span className="vote-wrap">
        <button className={"act" + (d?.vote === "like" ? " on" : "")} aria-pressed={d?.vote === "like"} aria-label={tt("Beğendim")} data-tip={d?.vote === "like" && d.rating ? tt("Beğendim · {0}/10", d.rating) : tt("Beğendim")} onClick={() => vote("like")}>
          <Icon d={THUMB} size={20} />{d?.vote === "like" && d.rating ? <span className="vote-n">{d.rating}</span> : null}
        </button>
        {ask === "like" && <RateAsk title={title} year={year} vote="like" onDone={() => setAsk(null)} />}
      </span>
      <span className="vote-wrap">
        <button className={"act" + (d?.vote === "dislike" ? " on bad" : "")} aria-pressed={d?.vote === "dislike"} aria-label={tt("Beğenmedim")} data-tip={d?.vote === "dislike" && d.rating ? tt("Beğenmedim · {0}/10", d.rating) : tt("Beğenmedim")} onClick={() => vote("dislike")}>
          <Icon d={THUMB_DOWN} size={20} />{d?.vote === "dislike" && d.rating ? <span className="vote-n">{d.rating}</span> : null}
        </button>
        {ask === "dislike" && <RateAsk title={title} year={year} vote="dislike" onDone={() => setAsk(null)} />}
      </span>
    </>
  );
}

/** Every title tied to a person: their recommendations and everything in their folder, once each. */
export function personTitles(who: string): { title: string; year?: string; tmdbId?: number; kind?: "movie" | "tv" }[] {
  const k = seenKey(who);
  const out = new Map<string, { title: string; year?: string; tmdbId?: number; kind?: "movie" | "tv" }>();
  const put = (x: { title: string; year?: string; tmdbId?: number; kind?: "movie" | "tv" }) => {
    // (a film and a series can share a TMDB number: the kind is part of the key)
    const key = x.tmdbId ? (x.kind ?? "movie") + x.tmdbId : seenKey(x.title) + "|" + (x.year ?? "");
    if (!out.has(key)) out.set(key, x);
  };
  loadRecs().filter((r) => seenKey(r.from) === k).forEach(put);
  const pls = loadPlaylists();
  const folder = pls.find((p) => !p.parent && seenKey(p.name) === k);
  if (folder) [folder, ...pls.filter((p) => p.parent === folder.id)].forEach((p) => p.items.forEach(put));
  return [...out.values()];
}

/* ---------- Moderation: content warnings from TMDB keywords ---------- */
const CW_RULES: [RegExp, string][] = [
  [/cannibal/, "Yamyamlık"],
  [/\brape\b|rapist|sexual (assault|abuse|violence)|molest/, "Tecavüz / cinsel şiddet"],
  [/pedophil|paedophil|child (sexual )?abuse/, "Çocuk istismarı"],
  [/incest/, "Ensest"],
  [/necrophil/, "Nekrofili"],
  [/bestiality|zoophil/, "Zoofili"],
  [/nudity|unsimulated sex|explicit sex|graphic sex|pornograph|softcore|hardcore|sex scene|erotic/, "Ağır çıplaklık / cinsellik"],
  [/torture/, "İşkence"],
  [/\bgore\b|splatter|extreme violence|graphic violence|mutilation|dismember|disembowel/, "Aşırı vahşet"],
  [/animal (cruelty|abuse|killing|death)|killing (an )?animal/, "Hayvana şiddet"],
];
/** Topics the user doesn't want to read at all: shown only as a code. */
export const CW_CODE = "KOD:KZ#4";
const CW_HIDDEN = new Set(["Çocuk istismarı", "Ensest", "Nekrofili", "Zoofili"]);
export const cwLabel = (c: string) => (CW_HIDDEN.has(c) ? CW_CODE : tt(c));
export const cwLabels = (l: string[]) => [...new Set(l.map(cwLabel))];
export const modOn = () => store.get("moderation") === "1";
export const setMod = (on: boolean) => { store.set("moderation", on ? "1" : "0"); listeners.forEach((f) => f()); };
let cwMemo: Record<string, string[]> | null = null;
const cwMap = () => (cwMemo ??= store.json<Record<string, string[]>>("cwCache", {}));
const cwKey = (kind: string | undefined, id: number) => `${kind ?? "movie"}:${id}`;
/** Warnings for a title, [] when clean, undefined when not checked yet. */
export const cwOf = (id?: number, kind?: string): string[] | undefined => (id ? cwMap()[cwKey(kind, id)] : undefined);
const cwQueue: { id: number; kind: "movie" | "tv" }[] = [];
let cwActive = 0;
let cwDirty = false;
export { uiBusy };
let cwNotifyDue = false, cwNotifyTimer = 0;
/** Tells the screens about new warnings at most every 2 s, never in the middle of a drag (each call re-renders every row). */
function cwNotify() {
  cwNotifyDue = true;
  if (cwNotifyTimer) return;
  cwNotifyTimer = window.setTimeout(function fire() {
    if (uiBusy.drag) { cwNotifyTimer = window.setTimeout(fire, 400); return; }
    cwNotifyTimer = 0;
    if (cwNotifyDue) { cwNotifyDue = false; listeners.forEach((f) => f()); }
  }, 2000);
}
// the cache is written to storage in batches, when the app is idle and nothing is being dragged
const idle = (f: () => void) => ("requestIdleCallback" in window ? (window as any).requestIdleCallback(f, { timeout: 10000 }) : setTimeout(f, 200));
setInterval(() => { if (cwDirty && cwMemo && !uiBusy.drag) idle(() => { if (!cwDirty || !cwMemo || uiBusy.drag) return; cwDirty = false; store.set("cwCache", JSON.stringify(cwMemo)); }); }, 15000);
/** Moderation progress for the UI: checked / asked for in this session. */
export const cwProgress = { done: 0, total: 0 };
function cwPump() {
  while (cwActive < 8 && cwQueue.length) {
    const { id, kind } = cwQueue.shift()!;
    if (cwMap()[cwKey(kind, id)]) { cwProgress.done++; continue; }
    cwActive++;
    tmdbKeywords(kind, id)
      .then((kw) => {
        const map = cwMap();
        map[cwKey(kind, id)] = CW_RULES.filter(([re]) => kw.some((k) => re.test(k))).map(([, label]) => label);
        cwDirty = true;
      })
      .catch(() => {})
      .finally(() => {
        cwActive--; cwProgress.done++;
        if (cwProgress.done % 10 === 0 || (!cwQueue.length && !cwActive)) cwNotify();
        cwPump();
      });
  }
}
/** Checks (in the background, 8 at a time, in list order) the titles that have a TMDB id but no verdict yet. */
export function useContentWarnings(list: { tmdbId?: number; kind?: "movie" | "tv" }[]) {
  const on = modOn();
  const todo = on ? list.filter((x) => x.tmdbId && cwOf(x.tmdbId, x.kind) === undefined) : [];
  useEffect(() => {
    if (!todo.length || !store.get("tmdbKey")) return;
    const fresh = todo.filter((x) => !cwQueue.some((q) => q.id === x.tmdbId));
    // what's on screen goes to the front of the queue
    cwQueue.unshift(...fresh.map((x) => ({ id: x.tmdbId!, kind: x.kind ?? "movie" })));
    cwProgress.total += fresh.length;
    cwNotify();
    cwPump();
  }, [on, todo.map((x) => x.tmdbId).join(",")]);
}
/** The red star next to a flagged title. */
/* Titles the user marked as fine for them despite a warning: what's sensitive for them and what isn't. */
type SafeMark = { title: string; year?: string; cats: string[]; at: number };
export const loadSafe = () => readJson<Record<string, SafeMark>>("cwSafe", {});
export const isSafe = (id?: number, kind?: string) => !!id && !!loadSafe()[cwKey(kind, id)];
export function markSafe(id: number, kind: string | undefined, mark: SafeMark | null) {
  const all = loadSafe();
  if (mark) all[cwKey(kind, id)] = mark; else delete all[cwKey(kind, id)];
  store.set("cwSafe", JSON.stringify(all));
  listeners.forEach((f) => f());
}
/** For each warning: how many times it was marked safe vs. still flagged among the titles the user has met. */
export function sensitivity() {
  const safe = Object.values(loadSafe());
  const count: Record<string, number> = {};
  for (const m of safe) for (const c of cwLabels(m.cats)) count[c] = (count[c] ?? 0) + 1;
  return Object.entries(count).sort((a, b) => b[1] - a[1]);
}
export function CwStar({ id, kind }: { id?: number; kind?: string }) {
  const w = modOn() && !isSafe(id, kind) ? cwOf(id, kind) : undefined;
  if (!w?.length) return null;
  return <span className="cw-star" title={tt("İçerik uyarısı: ") + cwLabels(w).join(", ")} aria-label={tt("İçerik uyarısı: ") + cwLabels(w).join(", ")}>★</span>;
}
export function ModToggle() {
  useTaste();
  const on = modOn();
  return (
    <button className={"chip mod-toggle" + (on ? " on" : "")} title={tt("Yamyamlık, tecavüz, ağır çıplaklık gibi içerikleri olan filmlerin kapağını bulanıklaştırır ve adının yanına kırmızı yıldız koyar")}
      onClick={() => setMod(!on)}>{tt("🛡 Moderasyon")} {on ? tt("açık") : tt("kapalı")}{on && cwProgress.done < cwProgress.total ? <span className="mod-prog"> · {cwProgress.done}/{cwProgress.total}</span> : null}</button>
  );
}

/** After 👍 / 👎: a small "how many points?" bubble instead of a permanent 1–10 row. */
export function RateAsk({ title, year, vote, onDone }: { title: string; year?: string; vote: Vote; onDone: () => void }) {
  const cur = diaryGet(title, year)?.rating;
  const nums = vote === "like" ? [6, 7, 8, 9, 10] : [1, 2, 3, 4, 5];
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = setTimeout(onDone, 8000);
    // what sits on top of the bubble's middle (a covering layer swallows the clicks)
    requestAnimationFrame(() => { const r = box.current?.getBoundingClientRect(); if (!r) return; const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      logDebug("app", "rate_ask_open", { top: top ? top.tagName.toLowerCase() + "." + String(top.className || "").slice(0, 60) : "none", inside: !!top && !!box.current?.contains(top) }); });
    return () => clearTimeout(t);
  }, []);
  const pick = (n: number) => { diarySet(title, year, { rating: n, watched: diaryGet(title, year)?.watched ?? Date.now() }); logDebug("app", "rate_ask_pick", { n }); onDone(); };
  return (
    <div ref={box} className={"rate-ask " + vote} onClick={(e) => e.stopPropagation()} onPointerDown={(e) => { e.stopPropagation(); logDebug("app", "rate_ask_pointer", { on: (e.target as HTMLElement).tagName.toLowerCase() }); }}>
      <span>{vote === "like" ? tt("Kaç puan?") : tt("Kaç puan?")}</span>
      {nums.map((n) => (
        <button key={n} className={cur === n ? "on" : ""} onPointerDown={(e) => { if (e.button === 0) { e.preventDefault(); pick(n); } }} onClick={(e) => { if (e.detail === 0) pick(n); }}>{n}</button>
      ))}
      <button className="skip" onClick={onDone}>{tt("Geç")}</button>
    </div>
  );
}

export type DetailTarget = {
  title: string; year?: string; kind?: "movie" | "tv"; tmdbId?: number; from?: string; note?: string; stars?: number;
  /** from a Stremio catalog: the IMDb id, or the addon's own id when it isn't one */
  imdbId?: string; stremio?: { type: string; id: string };
  /** release / first air date when the card knew it: the window can say "not out yet" before the details load */
  date?: string;
};
export type SourceProps = { onSource?: (src: string, name?: string) => void; onDownload?: (src: string) => void };
/* ---------- sharing a film list: a Luna file another Luna reads back, or plain text for anywhere ---------- */
export const LUNA_LIST = "#LUNA-LIST v1";
/** A shared list read back: Luna's own format, or plain lines like "1. Dune (2021) · …". */
export function parseSharedList(text: string): { name: string; items: PlItem[] } | null {
  const s = text.trim();
  if (s.startsWith(LUNA_LIST)) {
    try {
      const j = JSON.parse(s.slice(LUNA_LIST.length).trim());
      const items = (Array.isArray(j.items) ? j.items : []).filter((x: any) => x?.title).map((x: any) => ({ title: String(x.title), year: x.year ? String(x.year) : undefined, tmdbId: Number(x.tmdbId) || undefined, kind: x.kind === "tv" ? "tv" as const : x.kind === "movie" ? "movie" as const : undefined, rating: typeof x.rating === "number" ? x.rating : undefined }));
      return items.length ? { name: String(j.name || tt("Paylaşılan liste")), items } : null;
    } catch { return null; }
  }
  const lines = s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const items: PlItem[] = [];
  for (const l of lines) {
    const m = l.replace(/^\d+[.)]\s*/, "").split(" · ")[0].match(/^(.+?)\s*\((\d{4})\)\s*$/);
    if (m) items.push({ title: m[1].trim(), year: m[2] });
  }
  if (!items.length) return null;
  const head = lines[0].match(/^(.+?)\s+—\s+\d+\s+film/);
  return { name: head ? head[1] : tt("Paylaşılan liste"), items };
}

/** Models to try in order: the chosen one, then the free-tier ones with the highest daily limits. */
/* ---------- film summaries in Turkish ---------- */
const looksEnglish = (t: string) => !/[ğışİçöüÇÖÜ]/.test(t) && (t.match(/\b(the|and|of|to|is|his|her|with|their|when|after)\b/gi)?.length ?? 0) >= 3;
const looksTurkish = (t: string) => /[ğışİ]/.test(t) || (t.match(/\b(ve|bir|bu|ile|için|olan|onun|ama|daha)\b/gi)?.length ?? 0) >= 3;
const trKey = (t: string) => { let h = 0; for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return (lang() === "en" ? "enOv:" : "trOv:") + (h >>> 0).toString(36) + t.length; };
const trWaiting = new Map<string, Promise<string | null>>();
/** Turkish version of a summary (Gemini, cached for good); null when there's no key or it fails. */
function translateTr(text: string): Promise<string | null> {
  const k = trKey(text);
  const hit = store.get(k);
  if (hit) return Promise.resolve(hit);
  const key = aiKey();
  if (!key) return Promise.resolve(null);
  if (!trWaiting.has(k)) trWaiting.set(k, (async () => {
    try {
      const { r } = await geminiWithFallback(key, {
        systemInstruction: { parts: [{ text: lang() === "en" ? "Translate the given film/series summary into natural, fluent English. Write only the translation; keep names and titles as they are, add nothing." : "Verilen film/dizi özetini doğal, akıcı Türkçeye çevir. Sadece çeviriyi yaz; özel adları ve film adlarını değiştirme, ekleme yapma." }] },
        contents: [{ role: "user", parts: [{ text }] }],
      });
      const out = (r?.candidates?.[0]?.content?.parts ?? []).map((x: any) => x.text ?? "").join("").trim();
      if (out) store.set(k, out);
      return out || null;
    } catch { return null; } finally { trWaiting.delete(k); }
  })());
  return trWaiting.get(k)!;
}
/** A summary shown in Turkish: foreign ones are translated, with a button to see the original. */
export function TrText({ text, className }: { text: string; className?: string }) {
  const foreign = !!text && !(lang() === "en" ? looksEnglish(text) : looksTurkish(text));
  const [tr, setTr] = useState<string | null>(() => (foreign ? store.get(trKey(text)) : null));
  const [orig, setOrig] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setOrig(false);
    setBusy(false);
    setTr(null);
    if (!foreign) return;
    const c = store.get(trKey(text));
    if (c) { setTr(c); return; }
    let alive = true;
    setBusy(true);
    translateTr(text).then((x) => { if (alive) { setTr(x); setBusy(false); } });
    return () => { alive = false; };
  }, [text]);
  return (
    <>
      <p className={className}>{tr && !orig ? tr : text}</p>
      {foreign && (busy ? <span className="tr-note">{tt("Türkçeye çevriliyor…")}</span> : tr ? (
        <button className="tr-toggle" onClick={() => setOrig((v) => !v)}>{orig ? tt("Türkçesini göster") : tt("Orijinalini göster")} <span>{tt("· otomatik çeviri")}</span></button>
      ) : null)}
    </>
  );
}

function modelChain(chosen = aiModel("gemini")): string[] {
  const known = store.json<string[]>("geminiModelIds", []);
  const pick = (re: RegExp) => known.filter((id) => re.test(id)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  const auto = known.length
    ? [...pick(/^gemini-[\d.]+-flash-lite$/), ...pick(/^gemini-[\d.]+-flash$/)]
    : ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite", "gemini-2.5-flash-lite", "gemini-flash-latest", "gemini-2.5-flash"];
  // 3.1 Flash Lite first among the fallbacks: it has the largest free daily quota.
  const order = ["gemini-3.1-flash-lite", ...auto];
  return [...new Set([chosen, ...order])].slice(0, 6);
}

/** Calls the chosen service. A failure another model can fix (quota, a model that is gone, server trouble) moves on
 *  to the next model; one it cannot (a rejected key, a too-long chat, a blocked prompt, a dead network) stops at once
 *  with a short message that says what to do. Nothing is retried on its own beyond that. A search- or tool-request that
 *  keeps failing is finally asked once more without them, so the user still gets an (unsourced) answer. */
export async function geminiWithFallback(key: string, body: any, use:AiUse=captureAiUse()): Promise<{ r: any; model: { id: string; note?: string } }> {
  const tr = lang() === "tr";
  const fail = (e: unknown) => Object.assign(new Error(explainAiError(e, { tr, label: use.label, model: use.model, secrets: [use.key, key] })), { friendly: true });
  const lengthNote = (r: any) => answerNote(r?.lunaMeta, r?.candidates?.[0]?.finishReason, tr);
  if (use.provider !== "gemini") {
    // OpenAI, Claude or a base URL: one model, the request translated (ai.ts). A model that can't take
    // Luna's tools (some local / base-URL models) is asked again without them, like Gemini below.
    try {
      const { r, id, noSearch } = await otherAi(body,use);
      return { r, model: { id, note: [noSearch ? tt("{0} ile Google araması yok; bilgiler kaynaksız, kontrol edilmedi", use.label) : "", lengthNote(r) ?? ""].filter(Boolean).join(" · ") || undefined } };
    } catch (e) {
      const why = safeAiError(e,[use.key]);
      if (!body.tools || aiErrorPlan(e) !== "without-tools") throw fail(e);
      const { r, id } = await otherAi(withoutAssistantTools(body),use).catch((e2) => { throw fail(e2); });
      return { r, model: { id, note: tt("{0} Luna'nın araçlarını kabul etmedi; sadece bilgi verildi, hiçbir şey yapılmadı ({1})", use.label, why.replace(/^Error: /, "").slice(0, 140)) } };
    }
  }
  const chain = modelChain(use.model);
  let lastErr: unknown = null;
  // without its tools the model must not pretend it did something (or write the call out as text)
  const attempts: [any, boolean][] = body.tools ? [[body, true], [withoutAssistantTools(body), false]] : [[body, false]];
  outer: for (const [b, grounded] of attempts) {
    for (const id of chain) {
      let r: any;
      try { r = await invoke<any>("gemini", { key: use.key || key, model: id, body: b }); }
      catch (e) {
        lastErr = e;
        const plan = aiErrorPlan(e);
        if (plan === "stop") throw fail(e);
        if (plan === "without-tools") { if (!grounded) throw fail(e); continue outer; }
        continue;
      }
      const blocked = geminiBlockReason(r);
      if (blocked) throw fail(new Error("blocked: " + blocked));
      const notes = [];
      if (id !== chain[0]) notes.push(tt("{0} yanıt vermedi, {1} ile cevaplandı", chain[0], id));
      if (body.tools && !grounded) notes.push(body.tools.some((t: any) => t.google_search) ? tt("Google araması kullanılamadı; bilgiler kaynaksız, kontrol edilmedi")
        : tt("Luna'nın araçları kullanılamadı, hiçbir şey yapılmadı ({0})", safeAiError(lastErr,[use.key]).replace(/^Error: /, "").slice(0, 160)));
      const cut = lengthNote(r); if (cut) notes.push(cut);
      return { r, model: { id, note: notes.join(" · ") || undefined } };
    }
    // the same quota answers the second round too: no point asking again
    if (classifyAiError(lastErr) === "quota") break;
  }
  if (classifyAiError(lastErr) === "quota") throw Object.assign(new Error(tt("Tüm modellerin ücretsiz kotası şu an dolu. Birkaç dakika sonra (günlük sınırsa yarın) tekrar dene.")), { friendly: true });
  throw fail(lastErr);
}

export let pendingAsk: { text: string; show?: string; voice?: boolean } | null = null;
/** Opens the assistant and asks it this (only on the user's click: nothing runs on its own). */
/** Asks the assistant; `show` is the short line the chat shows when `text` is a long instruction for the model. */
/** `voice`: asked by the voice assistant (the chat stays hidden unless the answer needs it, and the answer is short). */
export function askAssistant(text: string, show?: string, voice = false) { pendingAsk = { text, show, voice }; window.dispatchEvent(new Event("luna-ask")); }
/** Opens the assistant without a question (the header/playlist buttons). */
export function openAssistant() { pendingAsk = null; window.dispatchEvent(new Event("luna-ask")); }

/** The title pages open on screen right now, newest last: the assistant reads the top one. */
export const openTitles: { title: string; year?: string; kind?: string; overview?: string; extra?: string }[] = [];
export const topOpenTitle = () => openTitles[openTitles.length - 1];
/* the open title windows have their own listeners: they used to wake every taste listener, so opening a title
   re-drew all of Keşfet's cards (~60 ms) just as its window started to rise */
export const openTitleListeners = new Set<() => void>();
export function useOpenTitle() {
  const [, bump] = useState(0);
  useEffect(() => { const f = () => bump((n) => n + 1); openTitleListeners.add(f); return () => { openTitleListeners.delete(f); }; }, []);
  return topOpenTitle();
}

/** What the Öneriler page shows right now (a friend's recommendations or one of their lists). */
export type RecsView = { who: string; list: string; films: { title: string; year?: string; rating?: number; stars?: number; tmdbId?: number; kind?: "movie" | "tv" }[] };
let recsView: RecsView | null = null;
export const getRecsView = () => recsView;
export function setRecsView(v: RecsView | null) {
  const same = JSON.stringify(v && { w: v.who, l: v.list, n: v.films.length }) === JSON.stringify(recsView && { w: recsView.who, l: recsView.list, n: recsView.films.length });
  recsView = v;
  if (!same) listeners.forEach((f) => f());
}
export function setSplit_plNames<T extends typeof plNames>(value:T):T{plNames=value;return value;}
export function setSplit_pendingAsk<T extends typeof pendingAsk>(value:T):T{pendingAsk=value;return value;}

export function saveDiaryBulk(d:Record<string,DiaryEntry>){if(!store.set("diary",JSON.stringify(d)))throw Error(extraText("Zevk defteri kaydedilemedi.","Could not save the taste diary."));listeners.forEach(f=>f());}
export let renderDiary:Record<string,DiaryEntry>={};

export function setSplit_renderDiary(value:Record<string,DiaryEntry>){renderDiary=value;return value;}
