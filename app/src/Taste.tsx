// Taste data (likes, dislikes, watchlist), recommendations from friends and the Gemini chat.
import { FilmDecisionPanel } from "./FilmDecision";
import { ListPicker } from "./ListPicker";
import { TasteProfile } from "./TasteProfile";
import { lang, locale, tt, DEC, pctText } from "./i18n";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { details, Episode, renameVideo, fromImdb, IMG, imdbOf, isFinished, Item, Meta, Recent, SearchHit, searchTmdb, seasonEpisodes, store, tmdbGenresOf, tmdbGet, tmdbKeywords } from "./library";
import { StreamList, streamAddons, useAddons } from "./Addons";
import { I, Icon, Mode, pct } from "./Screens";
import { findPodcast, findStations, forgetTracks, groupAlbums, isSpotifyList, loadMusicFolders, loadMusicLibrary, loadMusicPlaylists, loadHistory, loadLikes, loadDislikes, mostPlayed, useMusic, nowPlaying, pauseMusic, nextTrack, playQueue, prevTrack, setShuffle, stopMusic, QItem, saveMusicPlaylists, showPlaylist, SpotifyMove, trackItem } from "./Music";
import { abAuthor, abChapters, abTitle, bookOnScreen, fetchAndOpenBook, fetchBook, Book, wikisourceBooks, getPos, librivox, loadAbRecent, loadBookLibrary, loadBookNotes, loadReadHistory, rememberAb, requestOpenBook, clearBookRecord, forgetBooks } from "./Books";
import { fetchFeed, gutenbergBooks, gutenbergSearch, kindOf, loadSources, OEntry, searchUrl } from "./Opds";
import { mpv, setProp } from "./mpv";
import { setTtsVolume, setTtsMuted, ttsVolume, ttsActive, ttsPause, ttsReady, ttsResume, ttsStart, ttsStop } from "./ReadAloud";
import { aiKey, aiModel, aiName, aiProvider, otherAi } from "./ai";
import { tasteForAssistant } from "./reviewTaste";
import { findSlash, helpText, slashMatches } from "./Slash";
import { addToCollection, CItem, Collection, collectionId, collectionsChanged, goPlace, loadCollections, mineContext } from "./Mine";

import { isLetterboxdUrl, sameTitleYear, validStars } from "./safety";

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
const seenKey = (t: string) => t.trim().toLocaleLowerCase("tr");
/** Titles the user wants to watch later (from the assistant, the import or by hand). */
export const loadLater = () => store.json<string[]>("laterList", []);
const stars = (n: number) => "★".repeat(Math.floor(n)) + (n % 1 ? "½" : "");
const has = (l: string[], t: string) => l.some((x) => seenKey(x) === seenKey(t));
function toggleList(key: string, t: string, on?: boolean): string[] {
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
  title: string; year?: string; watched?: number; vote?: Vote; rating?: number; note?: string;
  genres?: string[]; at: number;
  /** what the user's own Letterboxd last said (so a later change there replaces it, but a rating given in Luna stays) */
  lbRating?: number; lbLike?: boolean;
};
const dKey = (title: string, year?: string) => seenKey(title.replace(/\s*\((\d{4})\)\s*$/, "")) + "|" + (year ?? (title.match(/\((\d{4})\)\s*$/)?.[1] ?? ""));
export const loadDiary = () => store.json<Record<string, DiaryEntry>>("diary", {});
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
  d[k] = next;
  store.set("diary", JSON.stringify(d));
  listeners.forEach((f) => f());
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
function HideWatched({ hidden }: { hidden: number }) {
  const [on, toggle] = useHideWatched();
  return (
    <>
    <button className={"chip" + (on ? " on" : "")} onClick={toggle} title={tt("Senin izlediğin filmler (izledim dediklerin, puanladıkların, Letterboxd'undakiler) arkadaşlarının listelerinde görünmez")}>
      {on ? "✓ " : ""}{tt("İzlediklerimi gizle")}{on && hidden ? <span className="muted"> · {hidden}</span> : null}
    </button>
    {/* nothing of the user's own is known yet: hiding has nothing to go by */}
    {on && !myLetterboxd() && !loadSeen().length && !Object.values(loadDiary()).some((e) => e.watched) &&
      <span className="muted small hide-hint">{tt("Neyi izlediğini bilmiyorum: “Letterboxd bağla” › “Bu benim profilim” ile kendi profilini bağla.")}</span>}
    </>
  );
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

/** Copies what fillPosters learned onto the latest saved copy of the same entry (edits made meanwhile stay) (6). */
function posterInfo<T extends { poster?: string | null; tmdbId?: number; rating?: number; noPoster?: boolean; kind?: "movie" | "tv" }>(dst: T, src: T) {
  if (src.poster && !dst.poster) dst.poster = src.poster;
  if (src.tmdbId && !dst.tmdbId) { dst.tmdbId = src.tmdbId; if (src.kind) dst.kind = src.kind; }
  if (src.rating != null) dst.rating = src.rating;
  if (src.noPoster) dst.noPoster = true;
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
function lbCsv(text: string): { films: LbFilm[]; listName?: string } {
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
let plNames: { id: string; name: string }[] | null = null;
/** Just the names, cached: used by every card's "+ Listeye" picker. */
const playlistNames = () => (plNames ??= ((all) => all.map((p) => ({ id: p.id, name: (p.parent ? `${all.find((x) => x.id === p.parent)?.name ?? "?"} › ` : "") + p.name })))(loadPlaylists()));
export const savePlaylists = (l: Playlist[]) => { plNames = null; store.set("playlists", JSON.stringify(l)); listeners.forEach((f) => f()); };
/** A list by id, "Friend › List", or a name that only one list has (9). */
function resolvePl(all: Playlist[], ref: string): Playlist | undefined {
  const byId = all.find((p) => p.id === ref);
  if (byId) return byId;
  const full = (p: Playlist) => (p.parent ? `${all.find((x) => x.id === p.parent)?.name ?? "?"} › ` : "") + p.name;
  const q = seenKey(ref.replace(/\s*[›>]\s*/g, " › "));
  const exact = all.find((p) => seenKey(full(p)) === q);
  if (exact) return exact;
  const same = all.filter((p) => seenKey(p.name) === q);
  return same.length === 1 ? same[0] : same.find((p) => !p.parent);
}
const ambiguous = (all: Playlist[], ref: string) =>
  !all.some((p) => p.id === ref) && all.filter((p) => seenKey(p.name) === seenKey(ref)).length > 1 && !all.some((p) => !p.parent && seenKey(p.name) === seenKey(ref));
const findPl = (name: string) => resolvePl(loadPlaylists(), name);
export function createPlaylist(name: string): Playlist {
  const ex = findPl(name);
  if (ex) return ex;
  const pl: Playlist = { id: Date.now().toString(36), name: name.trim(), items: [], at: Date.now() };
  savePlaylists([...loadPlaylists(), pl]);
  return pl;
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

const listeners = new Set<() => void>();
const changed = () => listeners.forEach((f) => f());
export const loadTaste = () => store.json<Record<string, TasteEntry>>("taste", {});
export const loadRecs = () => store.json<Rec[]>("recs", []);
const saveTaste = (t: Record<string, TasteEntry>) => { store.set("taste", JSON.stringify(t)); changed(); };
const saveRecs = (r: Rec[]) => { store.set("recs", JSON.stringify(r)); changed(); };

/** Re-renders when taste or recommendations change anywhere in the app. */
export function useTaste() {
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => bump((n) => n + 1);
    listeners.add(f);
    return () => { listeners.delete(f); };
  }, []);
  return { taste: loadTaste(), recs: loadRecs() };
}

export const tasteKey = (it: Item) => it.meta && it.meta.id > 0 ? `${it.meta.kind}:${it.meta.id}` : `${it.parsed.kind}:${it.parsed.title.toLowerCase()}`;

export function setTaste(it: Item, patch: Partial<TasteEntry>) {
  const t = loadTaste();
  const k = tasteKey(it);
  const cur = t[k] ?? { title: it.meta?.title ?? it.parsed.title, year: it.meta?.year, kind: it.parsed.kind, at: Date.now() };
  t[k] = { ...cur, ...patch, at: Date.now() };
  if (!t[k].vote && !t[k].want) delete t[k];
  saveTaste(t);
}

// ---------- details page buttons ----------
const ASK_ICON = "M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12z";
const THUMB = "M7 10v11H3V10zM7 10l4-8a3 3 0 0 1 3 3v4h6a2 2 0 0 1 2 2.3l-1.4 8A2 2 0 0 1 18.6 21H7";
const THUMB_DOWN = "M17 14V3h4v11zM17 14l-4 8a3 3 0 0 1-3-3v-4H4a2 2 0 0 1-2-2.3l1.4-8A2 2 0 0 1 5.4 3H17";

export function TasteButtons({ it }: { it: Item }) {
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
    const nv = d?.vote === v ? undefined : v;
    diarySet(title, year, { vote: nv, ...(nv && d?.vote && d.vote !== nv ? { rating: undefined } : {}), ...(it.meta?.genres?.length ? { genres: it.meta.genres } : {}) });
    setTaste(it, { vote: nv });
    setAsk(nv ?? null);
  };
  return (
    <>
      <button className={"act" + (later ? " on" : "")} data-tip={later ? tt("Sonra izle listesinden çıkar") : tt("Sonra izle")}
        aria-label={tt("Sonra izle")} onClick={toggleLater}>
        <Icon d={later ? I.check : I.plus} size={20} />
      </button>
      <span className="vote-wrap">
        <button className={"act" + (d?.vote === "like" ? " on" : "")} aria-label={tt("Beğendim")} data-tip={d?.vote === "like" && d.rating ? tt("Beğendim · {0}/10", d.rating) : tt("Beğendim")} onClick={() => vote("like")}>
          <Icon d={THUMB} size={20} />{d?.vote === "like" && d.rating ? <span className="vote-n">{d.rating}</span> : null}
        </button>
        {ask === "like" && <RateAsk title={title} year={year} vote="like" onDone={() => setAsk(null)} />}
      </span>
      <span className="vote-wrap">
        <button className={"act" + (d?.vote === "dislike" ? " on bad" : "")} aria-label={tt("Beğenmedim")} data-tip={d?.vote === "dislike" && d.rating ? tt("Beğenmedim · {0}/10", d.rating) : tt("Beğenmedim")} onClick={() => vote("dislike")}>
          <Icon d={THUMB_DOWN} size={20} />{d?.vote === "dislike" && d.rating ? <span className="vote-n">{d.rating}</span> : null}
        </button>
        {ask === "dislike" && <RateAsk title={title} year={year} vote="dislike" onDone={() => setAsk(null)} />}
      </span>
    </>
  );
}

// ---------- recommendations page ----------
/** Imports friends' recommendations: Letterboxd / IMDb CSV exports, or any pasted text (Gemini picks out the titles). */
/** Film titles out of any text: CSV exports directly, otherwise the assistant picks them out. */
async function extractTitles(t: string): Promise<{ title: string; year?: string }[]> {
  const key = aiKey();
  if (key) {
    const body = {
      systemInstruction: { parts: [{ text: "Verilen metindeki film ve dizi adlarını bul. Sadece JSON dizi döndür: [{\"title\":\"...\",\"year\":\"YYYY\"}]. Yıl yoksa year alanını boş bırak. Film olmayanları alma." }] },
      contents: [{ role: "user", parts: [{ text: t.slice(0, 30000) }] }],
      generationConfig: { responseMimeType: "application/json" },
    };
    const { r } = await geminiWithFallback(key, body);
    const out = (r?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? "").join("");
    try { const arr = JSON.parse(out.slice(out.indexOf("["), out.lastIndexOf("]") + 1)); if (Array.isArray(arr)) return arr.filter((x) => x?.title); } catch {}
  }
  return t.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 1 && l.length < 120).map((l) => {
    const m = l.match(/^(.*?)[\s(]*((?:19|20)\d{2})\)?\s*$/);
    return m ? { title: m[1].trim(), year: m[2] } : { title: l };
  });
}

function ImportPanel({ onDone }: { onDone: () => void }) {
  const [text, setText] = useState("");
  const [from, setFrom] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const parseCsv = (csv: string): { title: string; year?: string }[] | null => {
    const rows = csvRows(csv);
    const head = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
    const ti = head.findIndex((h) => h === "name" || h === "title" || h === "original title");
    if (ti < 0) return null;
    const yi = head.findIndex((h) => h === "year");
    return rows.slice(1).filter((r) => r[ti]?.trim()).map((r) => ({ title: r[ti].trim(), year: yi >= 0 ? r[yi]?.trim() : undefined }));
  };
  const extract = async (t0: string): Promise<TaggedFilm[]> => {
    let t = t0;
    // a Letterboxd list export has a small table (name, description) above the films' table
    const lb = /(^|\n)\s*(Position,)?Name,Year/i.test(t) ? lbCsv(t).films : [];
    if (lb.length) return lb.map((f) => ({ title: f.title, year: f.year }));
    const csv = parseCsv(t);
    if (csv) return csv;
    const onlyUrl = /^\s*https?:\/\/\S+\s*$/i.test(t);
    // Letterboxd is read by Luna itself: no Gemini key needed for it
    if (onlyUrl && isLetterboxd(t)) return lbFlatten(await readLetterboxd(t.trim(), 80));
    const key = aiKey();
    if (key) {
      if (onlyUrl) t = await invoke<string>("fetch_page_text", { url: t.trim() });
      const body: any = {
        systemInstruction: { parts: [{ text: "Verilen metindeki film ve dizi adlarını bul. Sadece JSON dizi döndür: [{\"title\":\"...\",\"year\":\"YYYY\"}]. Yıl yoksa year alanını boş bırak. Film olmayanları alma." }] },
        contents: [{ role: "user", parts: [{ text: t.slice(0, 30000) }] }],
        generationConfig: { responseMimeType: "application/json" },
      };
      const { r } = await geminiWithFallback(key, body);
      const out = (r?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? "").join("");
      try {
        const json = out.slice(out.indexOf("["), out.lastIndexOf("]") + 1);
        const arr = JSON.parse(json);
        if (Array.isArray(arr)) return arr.filter((x) => x?.title);
      } catch {}
      if (onlyUrl) throw new Error(tt("Sayfada film bulunamadı. Sayfayı açıp içeriğini kopyalayıp yapıştırmayı dene."));
    }
    // no assistant: one title per line, "(1999)" or "1999" at the end as the year
    return t.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 1).map((l) => {
      const m = l.match(/^(.*?)[\s(]*((?:19|20)\d{2})\)?\s*$/);
      return m ? { title: m[1].trim(), year: m[2] } : { title: l };
    });
  };
  const run = async () => {
    setBusy(true); setMsg(tt("Başlıklar okunuyor…"));
    try {
      const list = await extract(text);
      // small lists: matched on TMDB right away; long ones: added at once, posters come later
      let added = 0;
      if (list.length <= 40) {
        for (let i = 0; i < list.length; i++) {
          setMsg(tt("Ekleniyor {0} / {1}: {2}", i + 1, list.length, list[i].title));
          if (await addRecommendation(list[i].title, list[i].year || undefined, from)) added++;
        }
      } else {
        added = addRecommendationsBulk(list as { title: string; year?: string; stars?: number }[], from);
      }
      setMsg(tt("{0} öneri eklendi{1}.", added, list.length - added ? tt(", {0} tanesi zaten vardı", list.length - added) : ""));
      if (added) setText("");
    } catch (e) { setMsg(String(e)); }
    setBusy(false);
  };
  const pickFile = async (f?: File | null) => { if (f) setText(await f.text()); };
  return (
    <div className="import-panel">
      <div className="muted small">
        <b>{tt("Letterboxd:")}</b>  {tt("Ayarlar › Import & Export › Export your data ile inen")} <code>{tt("watchlist.csv")}</code>  {tt("ya da bir liste CSV'si.")}
        {" "}<b>{tt("IMDb:")}</b>  {tt("listenin ⋯ menüsünden Export. Ya da bir listenin sayfasını (arkadaşının Letterboxd/IMDb listesi, bir mesaj…) kopyalayıp aşağı yapıştır; asistan film adlarını kendisi bulur.")}
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={tt("Liste adresi (Letterboxd, IMDb…), CSV ya da herhangi bir metni buraya yapıştır…")} rows={6} />
      <div className="import-row">
        <label className="chip file-chip">{tt("CSV dosyası seç")}<input type="file" accept=".csv,.txt" onChange={(e) => pickFile(e.target.files?.[0])} /></label>
        <input className={from.trim() ? "" : "need"} value={from} onChange={(e) => setFrom(e.target.value)} placeholder={tt("Kim önerdi? (gerekli)")} />
        <span className="grow" />
        <button className="chip" onClick={onDone}>{tt("Kapat")}</button>
        <button className="primary sm" disabled={busy || !text.trim() || !from.trim()} onClick={run}
          title={!from.trim() ? tt("Önce kimin önerdiğini yaz") : undefined}>{busy ? tt("Ekleniyor…") : tt("İçe aktar")}</button>
      </div>
      {msg && <div className="small import-msg">{msg}</div>}
    </div>
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
function modStats(who: string) {
  const all = personTitles(who);
  const checked = all.filter((x) => cwOf(x.tmdbId, x.kind) !== undefined);
  const flagged = checked.filter((x) => cwOf(x.tmdbId, x.kind)!.length && !isSafe(x.tmdbId, x.kind));
  const cats: Record<string, number> = {};
  for (const x of flagged) for (const c of cwLabels(cwOf(x.tmdbId, x.kind)!)) cats[c] = (cats[c] ?? 0) + 1;
  return { total: all.length, checked: checked.length, flagged: flagged.length, cats: Object.entries(cats).sort((a, b) => b[1] - a[1]), list: all };
}


/** What the diary says about the user's taste, plus the assistant's notes (deletable). */
function TasteSummary({ items, onOpen }: { items: Item[]; onOpen: (t: DetailTarget) => void }) {
  useTaste();
  const [book, setBook] = useState<DiaryFilter | null>(null);
  const diary = Object.values(loadDiary());
  const notes = loadNotes();
  if (!diary.length && !notes.length) return null;
  const liked = diary.filter((e) => e.vote === "like" || (e.rating ?? 0) >= 7);
  const rated = diary.filter((e) => e.rating);
  const avg = rated.length ? (rated.reduce((n, e) => n + (e.rating ?? 0), 0) / rated.length).toFixed(1).replace(".", DEC) : null;
  const genreOf = (e: DiaryEntry) => e.genres ?? items.find((i) => seenKey(i.meta?.title ?? i.parsed.title) === seenKey(e.title))?.meta?.genres ?? [];
  const g: Record<string, number> = {};
  for (const e of liked) for (const x of genreOf(e)) g[x] = (g[x] ?? 0) + 1;
  const topGenres = Object.entries(g).sort((x, y) => y[1] - x[1]).slice(0, 4).map(([x]) => x);
  const month = diary.filter((e) => e.watched && Date.now() - e.watched < 30 * 86400000).length;
  return (
    <section className="row taste-sum">
      <h2 className="recs-head">{tt("Zevk özetin")} <span className="grow" /><button className="chip" onClick={() => setBook("all")}>{tt("Zevk defterim (")}{diary.length})</button></h2>
      <div className="sum-grid">
        <button onClick={() => setBook("like")}><b>{liked.length}</b><span>{tt("beğendiğin")}</span></button>
        <button onClick={() => setBook("dislike")}><b>{diary.filter((e) => e.vote === "dislike" || (e.rating && e.rating <= 4)).length}</b><span>{tt("beğenmediğin")}</span></button>
        <button onClick={() => setBook("rated")}><b>{avg ?? "–"}</b><span>{tt("puan ortalaman")}</span></button>
        <button onClick={() => setBook("watched")}><b>{month}</b><span>{tt("son 30 günde izlediğin")}</span></button>
      </div>
      {book && <DiaryList start={book} onOpen={onOpen} onClose={() => setBook(null)} />}
      {topGenres.length > 0 && <div className="muted small">{tt("En sevdiğin türler:")} {topGenres.join(", ")}</div>}
      {sensitivity().length > 0 && <div className="muted small">{tt("Güvenli işaretlediğin içerikler:")} {sensitivity().map(([c, n]) => `${c} (${n})`).join(", ")}</div>}
      {notes.length > 0 && (
        <div className="notes">
          <span className="muted small">{tt("Asistanın senin hakkında notları:")}</span>
          {notes.map((n) => (
            <span key={n} className="note-chip">{n}<button aria-label={tt("Notu sil")} title={tt("Notu sil")} onClick={() => saveNotes(loadNotes().filter((x) => x !== n))}>×</button></span>
          ))}
        </div>
      )}
    </section>
  );
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
const cwLabels = (l: string[]) => [...new Set(l.map(cwLabel))];
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
// the cache is written to storage in batches, not after every title
setInterval(() => { if (cwDirty && cwMemo) { cwDirty = false; store.set("cwCache", JSON.stringify(cwMemo)); } }, 3000);
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
        if (cwProgress.done % 10 === 0 || (!cwQueue.length && !cwActive)) listeners.forEach((f) => f());
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
    listeners.forEach((f) => f());
    cwPump();
  }, [on, todo.map((x) => x.tmdbId).join(",")]);
}
/** The red star next to a flagged title. */
/* Titles the user marked as fine for them despite a warning: what's sensitive for them and what isn't. */
type SafeMark = { title: string; year?: string; cats: string[]; at: number };
export const loadSafe = () => store.json<Record<string, SafeMark>>("cwSafe", {});
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
const cwFlag = (id?: number, kind?: string) => modOn() && !!cwOf(id, kind)?.length && !isSafe(id, kind);
export function ModToggle() {
  useTaste();
  const on = modOn();
  return (
    <button className={"chip mod-toggle" + (on ? " on" : "")} title={tt("Yamyamlık, tecavüz, ağır çıplaklık gibi içerikleri olan filmlerin kapağını bulanıklaştırır ve adının yanına kırmızı yıldız koyar")}
      onClick={() => setMod(!on)}>{tt("🛡 Moderasyon")} {on ? tt("açık") : tt("kapalı")}{on && cwProgress.done < cwProgress.total ? <span className="mod-prog"> · {cwProgress.done}/{cwProgress.total}</span> : null}</button>
  );
}

/** Where a film sits on the friend's Letterboxd, said plainly. */
const tagLabel = (t: string, who: string) => t === "Beğendi" ? tt("♥ {0} beğendi", who) : t === "İzledi" ? tt("{0} izledi", who) : t === "İzlemek istiyor" ? tt("{0} izlemek istiyor", who) : tt("{0}'ın listesi: {1}", who, t.replace("Liste: ", ""));
const tagHelp = (t: string, who: string) => t === "Beğendi" ? tt("{0} bu filme Letterboxd'da kalp (beğeni) vermiş", who) : t === "İzledi" ? tt("{0} bu filmi izlemiş (senin izlediğin anlamına gelmez)", who) : t === "İzlemek istiyor" ? tt("{0}'ın Letterboxd izleme listesinde", who) : tt("{0}'ın kendi Letterboxd listesinde: “{1}”", who, t.replace("Liste: ", ""));
const tagOrder = (t: string) => t === "Beğendi" ? 0 : t.startsWith("Liste") ? 1 : t === "İzlemek istiyor" ? 2 : 3;

/** After 👍 / 👎: a small "how many points?" bubble instead of a permanent 1–10 row. */
function RateAsk({ title, year, vote, onDone }: { title: string; year?: string; vote: Vote; onDone: () => void }) {
  const cur = diaryGet(title, year)?.rating;
  const nums = vote === "like" ? [6, 7, 8, 9, 10] : [1, 2, 3, 4, 5];
  useEffect(() => {
    const t = setTimeout(onDone, 8000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className={"rate-ask " + vote} onClick={(e) => e.stopPropagation()}>
      <span>{vote === "like" ? tt("Kaç puan?") : tt("Kaç puan?")}</span>
      {nums.map((n) => (
        <button key={n} className={cur === n ? "on" : ""} onClick={() => { diarySet(title, year, { rating: n, watched: diaryGet(title, year)?.watched ?? Date.now() }); onDone(); }}>{n}</button>
      ))}
      <button className="skip" onClick={onDone}>{tt("Geç")}</button>
    </div>
  );
}

export type DetailTarget = {
  title: string; year?: string; kind?: "movie" | "tv"; tmdbId?: number; from?: string; note?: string; stars?: number;
  /** from a Stremio catalog: the IMDb id, or the addon's own id when it isn't one */
  imdbId?: string; stremio?: { type: string; id: string };
};
export type SourceProps = { onSource?: (src: string, name?: string) => void; onDownload?: (src: string) => void };

/** Details of a title that may not be in the library: TMDB info plus everything Luna knows about it. */
export function TitleDetail({ t, items, onClose, onPlay, onTorrent, onAsk, onSource, onDownload }: { t: DetailTarget; items: Item[]; onClose: () => void; onPlay?: (path: string) => void; onTorrent?: () => void; onAsk?: (it: Item) => void } & SourceProps) {
  useTaste();
  const [meta, setMeta] = useState<Meta | null | undefined>(undefined);
  const [gal, setGal] = useState(false);
  useEffect(() => {
    const m = meta as any;
    const e = { title: m?.title ?? t.title, year: m?.year ?? t.year, kind: m?.kind ?? t.kind, overview: m?.overview,
      extra: [m?.director && `Yönetmen: ${m.director}`, m?.genres?.length && `Türler: ${m.genres.join(", ")}`, m?.rating && `TMDB: ${m.rating}`].filter(Boolean).join(" · ") };
    openTitles.push(e);
    listeners.forEach((f) => f());
    return () => { const i = openTitles.indexOf(e); if (i >= 0) openTitles.splice(i, 1); listeners.forEach((f) => f()); };
  }, [t.title, t.year, meta]);
  const [note, setNote] = useState(diaryGet(t.title, t.year)?.note ?? "");
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!store.get("tmdbKey")) { setMeta(null); return; }
      let id = t.tmdbId, kind = t.kind ?? "movie";
      if (!id && t.imdbId) {
        const h = await fromImdb(t.imdbId);
        if (h) { id = h.id; kind = h.kind; }
      }
      if (!id) {
        const y = t.year ? Number(t.year) : undefined;
        const h = (await searchTmdb(t.title, "movie", y).catch(() => []))[0] ?? (await searchTmdb(t.title, "tv", y).catch(() => []))[0];
        if (h) { id = h.id; kind = h.kind; }
      }
      const m = id ? await details(kind, id).catch(() => null) : null;
      if (alive) setMeta(m);
    })();
    return () => { alive = false; };
  }, [t.title, t.year]);
  const d = diaryGet(t.title, t.year);
  const title = meta?.title ?? t.title;
  const year = meta?.year || t.year;
  const lib = libMatch(items, meta ? { title: meta.title, year: meta.year, tmdbId: meta.id, kind: meta.kind } : { title: t.title, year: t.year, tmdbId: t.tmdbId, kind: t.kind })
    ?? (meta ? libMatch(items, { title: t.title, year: t.year }) : undefined);
  const set = (patch: Partial<DiaryEntry>) => diarySet(t.title, t.year, { ...(meta?.genres?.length ? { genres: meta.genres } : {}), ...patch });
  const later = has(loadLater(), year ? `${t.title} (${year})` : t.title) || has(loadLater(), t.title);
  const cwId = meta?.id ?? t.tmdbId, cwKind = meta ? meta.kind ?? t.kind : t.kind;
  useContentWarnings(cwId ? [{ tmdbId: cwId, kind: cwKind as "movie" | "tv" }] : []);
  const warn = modOn() ? cwOf(cwId, cwKind) : undefined;
  const [reveal, setReveal] = useState(false);
  const [ask, setAsk] = useState<Vote | null>(null);
  const safe = isSafe(cwId, cwKind);
  const hide = !!warn?.length && !reveal && !safe;
  // Sources from the user's Stremio addons (they look titles up by IMDb id)
  const addons = useAddons();
  const canStream = !!onSource && streamAddons(addons).length > 0;
  const [srcOpen, setSrcOpen] = useState(false);
  const [imdb, setImdb] = useState<string | null | undefined>(t.imdbId ?? (t.stremio?.id.startsWith("tt") ? t.stremio.id.split(":")[0] : undefined));
  useEffect(() => {
    if (!srcOpen || imdb !== undefined || meta === undefined) return;
    if (!meta) { setImdb(null); return; }
    let alive = true;
    imdbOf(meta.kind, meta.id).then((x) => alive && setImdb(x));
    return () => { alive = false; };
  }, [srcOpen, meta]);
  const srcKind = meta?.kind ?? t.kind ?? "movie";
  const [season, setSeason] = useState(1);
  const [ep, setEp] = useState(1);
  const [eps, setEps] = useState<Episode[]>([]);
  useEffect(() => {
    if (!srcOpen || srcKind !== "tv" || !meta?.id) return;
    let alive = true;
    seasonEpisodes(meta.id, season).then((l) => alive && setEps(l));
    return () => { alive = false; };
  }, [srcOpen, season, meta?.id]);
  const baseId = imdb ?? (t.stremio && !t.stremio.id.startsWith("tt") ? t.stremio.id : null);
  const streamId = baseId ? (srcKind === "tv" ? `${baseId}:${season}:${ep}` : baseId) : null;
  const srcRef = useRef<HTMLDivElement>(null);
  const openSources = () => { setSrcOpen(true); setTimeout(() => srcRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 60); };
  return createPortal(
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal wide td">
        {gal && meta?.id && <Gallery id={meta.id} kind={meta.kind === "tv" ? "tv" : "movie"} first={meta.backdrop} onClose={() => setGal(false)} />}
        <div className={"td-hero" + (hide ? " cw-blur-bg" : "") + (meta?.id && !hide ? " -gal" : "")} onClick={(e) => { if (meta?.id && !hide && heroClick(e)) setGal(true); }} style={meta?.backdrop ? { backgroundImage: `url(${IMG}w1280${meta.backdrop})` } : undefined}>
          <div className="td-shade" />
          <button className="round td-x" aria-label={tt("Kapat")} onClick={onClose}><Icon d={I.x} size={18} /></button>
          <div className="td-head">
            {meta?.poster && <img className={"td-poster" + (hide ? " cw-blur" : "")} src={`${IMG}w342${meta.poster}`} alt="" title={hide ? tt("Göstermek için tıkla") : undefined} onClick={() => setReveal(true)} />}
            <div className="td-titles">
              <h2>{title}{warn?.length ? <span className="cw-star big" title={tt("İçerik uyarısı: ") + cwLabels(warn).join(", ")}>★</span> : null}</h2>
              <div className="d-meta">
                {meta?.rating ? <span className="rating">★ {String(meta.rating).replace(".", DEC)}</span> : null}
                {year && <span>{year}</span>}
                {meta?.runtime ? <span>{Math.floor(meta.runtime / 60)}  {tt("sa")} {meta.runtime % 60}  {tt("dk")}</span> : null}
                {meta?.genres.length ? <span>{meta.genres.slice(0, 3).join(", ")}</span> : null}
              </div>
              {(t.from || t.stars) && (
                <div className="td-from">{t.from && <><b>{t.from}</b>  {tt("önerdi")}</>}{t.stars ? <>  {tt("· Letterboxd'da")} <span className="td-lb">{"★".repeat(Math.floor(t.stars))}{t.stars % 1 ? "½" : ""}</span>  {tt("verdi (")}{String(t.stars).replace(".", DEC)}/5)</> : ""}{t.note ? ` · “${t.note}”` : ""}</div>
              )}
            </div>
          </div>
        </div>
        <div className="td-body">
          {meta === undefined && <div className="muted small">{tt("Bilgiler getiriliyor…")}</div>}
          {meta === null && <div className="muted small">{tt("TMDB'de bulunamadı")}{!store.get("tmdbKey") ? tt(" (Ayarlar'dan TMDB anahtarını gir)") : ""}.</div>}
          {warn?.length ? (
            <div className={"cw-note" + (safe ? " safe" : "")}>
              <span className="cw-star">{safe ? "✓" : "★"}</span> {safe ? tt("Güvenli olarak işaretledin") : tt("İçerik uyarısı")}: {cwLabels(warn).join(" · ")}
              <span className="grow" />
              {hide && <button className="chip" onClick={() => setReveal(true)}>{tt("Kapağı göster")}</button>}
              {cwId ? (safe
                ? <button className="chip" onClick={() => markSafe(cwId, cwKind, null)}>{tt("Geri al")}</button>
                : <button className="chip safe-btn" title={tt("Bu film senin için sorun değil: kapak açılır, yıldız kalkar; Luna neyin senin için hassas olmadığını öğrenir")}
                    onClick={() => { markSafe(cwId, cwKind, { title, year, cats: warn, at: Date.now() }); setReveal(true); }}>{tt("✓ Güvenli olarak işaretle")}</button>) : null}
            </div>
          ) : null}
          {meta?.overview && <TrText className="td-ov" text={meta.overview} />}
          <div className="td-actions">
            {lib && onPlay ? <button className="primary light" onClick={() => { onClose(); onPlay(lib.files[0].path); }}><Icon d={I.play} fill size={16} />  {tt("İzle")}</button>
              : canStream ? <button className="primary light" data-tip={tt("Eklentilerindeki kaynakları göster")} onClick={openSources}><Icon d={I.play} fill size={16} />  {tt("İzle")}</button>
              : onTorrent && <button className="primary light" data-tip={tt("Kütüphanende yok · magnet ya da torrent gir")} onClick={() => { onClose(); onTorrent(); }}><Icon d={I.play} fill size={16} />  {tt("İzle")}</button>}
            <button className={"act" + (d?.watched ? " on good" : "")} data-tip={d?.watched ? tt("İzlemedim") : tt("İzledim")} aria-label={tt("İzledim")}
              onClick={() => markSeen(year ? `${t.title} (${year})` : t.title, !d?.watched)}><Icon d={I.check} size={20} /></button>
            <span className="vote-wrap">
              <button className={"act" + (d?.vote === "like" ? " on" : "")} data-tip={d?.rating && d.vote === "like" ? tt("Beğendim · {0}/10", d.rating) : tt("Beğendim")} aria-label={tt("Beğendim")}
                onClick={() => { const on = d?.vote !== "like"; set({ vote: on ? "like" : undefined, ...(on && d?.vote === "dislike" ? { rating: undefined } : {}) }); setAsk(on ? "like" : null); }}><Icon d={THUMB} size={20} />{d?.vote === "like" && d.rating ? <span className="vote-n">{d.rating}</span> : null}</button>
              {ask === "like" && <RateAsk title={t.title} year={t.year} vote="like" onDone={() => setAsk(null)} />}
            </span>
            <span className="vote-wrap">
              <button className={"act" + (d?.vote === "dislike" ? " on bad" : "")} data-tip={d?.rating && d.vote === "dislike" ? tt("Beğenmedim · {0}/10", d.rating) : tt("Beğenmedim")} aria-label={tt("Beğenmedim")}
                onClick={() => { const on = d?.vote !== "dislike"; set({ vote: on ? "dislike" : undefined, ...(on && d?.vote === "like" ? { rating: undefined } : {}) }); setAsk(on ? "dislike" : null); }}><Icon d={THUMB_DOWN} size={20} />{d?.vote === "dislike" && d.rating ? <span className="vote-n">{d.rating}</span> : null}</button>
              {ask === "dislike" && <RateAsk title={t.title} year={t.year} vote="dislike" onDone={() => setAsk(null)} />}
            </span>
            <button className={"act" + (later ? " on" : "")} data-tip={later ? tt("Sonra izle listesinden çıkar") : tt("Sonra izle")} aria-label={tt("Sonra izle")}
              onClick={() => (later ? laterOff(t.title, year) : markLater(year ? `${t.title} (${year})` : t.title, true))}><Icon d={later ? I.check : I.plus} size={20} /></button>
            {onAsk && (
              <button className="act ask" data-tip={tt("Asistana sor")} aria-label={tt("Asistana sor")} onClick={() => {
                const kind = meta?.kind ?? t.kind ?? "movie";
                const who = t.from ? tt("({0} önerdi{1}{2}) ", t.from, t.stars ? tt(", Letterboxd puanı {0}/5", t.stars) : "", t.note ? `, notu: “${t.note}”` : "") : "";
                const base = meta ?? { id: t.tmdbId ?? 0, kind, title, year: year ?? "", overview: "", genres: [], cast: [] } as unknown as Meta;
                onAsk({ key: "title:" + seenKey(title) + "|" + (year ?? ""), files: [], parsed: { kind, title }, meta: { ...base, overview: who + (base.overview ?? "") } } as unknown as Item);
              }}><Icon d={ASK_ICON} size={19} /></button>
            )}
            <button className="act" data-tip={tt("YouTube'da Türkçe fragman")} aria-label={tt("Fragman")} onClick={() => openUrl(youtubeTrailer(year ? `${title} (${year})` : title))}><Icon d={I.play} fill size={16} /></button>
            {playlistNames().length > 0 && (
              <ListPicker lists={loadPlaylists()} onPick={(id) => addToPlaylist(id, [{ title: t.title, year }])} />
            )}
          </div>
          {lib && canStream && !srcOpen && <button className="chip td-src-more" onClick={openSources}>{tt("Eklentilerdeki kaynaklar")}</button>}
          {srcOpen && (
            <div className="td-src" ref={srcRef}>
              <div className="td-src-head">
                <b>{tt("Kaynaklar")}</b>
                {srcKind === "tv" && (
                  <>
                    <select value={season} onChange={(e) => { setSeason(Number(e.target.value)); setEp(1); setEps([]); }}>
                      {Array.from({ length: Math.max(1, meta?.seasons ?? 1) }, (_, i) => <option key={i} value={i + 1}>{tt("{0}. sezon", i + 1)}</option>)}
                    </select>
                    <select value={ep} onChange={(e) => setEp(Number(e.target.value))}>
                      {(eps.length ? eps : Array.from({ length: 30 }, (_, i) => ({ episode: i + 1, name: "" }))).map((x) => (
                        <option key={x.episode} value={x.episode}>{tt("{0}. bölüm", x.episode)}{x.name ? " · " + x.name : ""}</option>
                      ))}
                    </select>
                  </>
                )}
                <span className="grow" />
                <span className="muted small">{tt("Kaynaklar eklentilerinden gelir; ne izlediğin senin sorumluluğunda.")}</span>
              </div>
              {streamId ? (
                <StreamList type={srcKind === "tv" ? "series" : "movie"} id={streamId}
                  onPlay={(src) => { onClose(); onSource!(src, srcKind === "tv" ? `${title} — S${String(season).padStart(2, "0")}${lang() === "tr" ? "B" : "E"}${String(ep).padStart(2, "0")}` : year ? `${title} (${year})` : title); }}
                  onDownload={(src) => onDownload?.(src)} />
              ) : (
                <div className="muted small">{imdb === undefined ? tt("Hazırlanıyor…") : tt("Bu başlığın IMDb numarası bulunamadı; eklentiler başlıkları IMDb numarasıyla arar.")}</div>
              )}
            </div>
          )}
          <label className="td-note">{tt("Notun")}
            <input value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => set({ note: note.trim() || undefined })} placeholder={tt("ör. sonu zayıftı, müzikleri harika")} />
          </label>
          {meta?.cast.length ? (
            <div className="cast td-cast2">{meta.cast.slice(0, 15).map((c) => (
              <button key={c.name + c.character} className="person" title={tt("{0} · TMDB'de aç", c.name)}
                onClick={() => openUrl(c.id ? `https://www.themoviedb.org/person/${c.id}?language=${lang()}` : `https://www.themoviedb.org/search/person?query=${encodeURIComponent(c.name)}`)}>
                <div className="face">{c.profile ? <img src={IMG + "w185" + c.profile} alt="" loading="lazy" /> : c.name[0]}</div>
                <div className="p-name">{c.name}</div>
                <div className="muted small">{c.character}</div>
              </button>))}</div>
          ) : null}
          {/* "Worth watching?" with the Letterboxd reviews, here too (Discover, recommendations); once the TMDB id is known */}
          {meta !== undefined && <FilmDecisionPanel key={(meta?.id ?? t.tmdbId ?? "") + ":" + title + ":" + year}
            film={{ title, year, kind: (meta?.kind ?? t.kind) === "tv" ? "tv" : "movie", id: meta?.id ?? t.tmdbId, rating: meta?.rating }} />}
        </div>
      </div>
    </div>,
    document.body
  );
}

/** "Zevk defterim": everything rated, liked, disliked or watched, filterable and editable. */
type DiaryFilter = "all" | "like" | "dislike" | "rated" | "watched";
function DiaryList({ onOpen, start, onClose }: { onOpen: (t: DetailTarget) => void; start: DiaryFilter; onClose: () => void }) {
  useTaste();
  const [f, setF] = useState<DiaryFilter>(start);
  const [q, setQ] = useState("");
  const all = Object.values(loadDiary()).sort((x, y) => y.at - x.at);
  const list = all.filter((e) => (
    f === "like" ? e.vote === "like" || (e.rating ?? 0) >= 7 :
    f === "dislike" ? e.vote === "dislike" || (!!e.rating && e.rating <= 4) :
    f === "rated" ? !!e.rating : f === "watched" ? !!e.watched : true
  ) && (!q.trim() || seenKey(e.title).includes(seenKey(q))));
  if (!all.length) return null;
  const remove = (e: DiaryEntry) => {
    const d = loadDiary();
    for (const k of Object.keys(d)) if (d[k] === d[k] && seenKey(d[k].title) === seenKey(e.title) && d[k].year === e.year) delete d[k];
    store.set("diary", JSON.stringify(d));
    // off the "watched" ticks too, without markSeen (that would write the entry back)
    toggleList("seenList", e.year ? `${e.title} (${e.year})` : e.title, false);
    toggleList("seenList", e.title, false);
  };
  return createPortal(
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
    <div className="modal wide diary-modal">
      <h2 className="recs-head">{tt("Zevk defterim")} <span className="muted small">{all.length}</span><span className="grow" />
        <input className="pl-new" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tt("Ara")} />
        <button className="round sm-round" aria-label={tt("Kapat")} onClick={onClose}><Icon d={I.x} size={14} /></button>
      </h2>
      <div className="pl-tabs">
        {([["all", tt("Hepsi")], ["like", tt("Beğendiklerim")], ["dislike", tt("Beğenmediklerim")], ["rated", tt("Puanladıklarım")], ["watched", tt("İzlediklerim")]] as const).map(([k, l]) => (
          <button key={k} className={"seg sm" + (f === k ? " on" : "")} onClick={() => setF(k)}>{l}</button>
        ))}
      </div>
      <div className="pl-items">
        {list.slice(0, 200).map((e) => (
          <div key={e.title + (e.year ?? "")} className="pl-item diary-item">
            <button className="diary-open" onClick={() => { onClose(); onOpen({ title: e.title, year: e.year }); }}>
              <b className="ellipsis">{e.title}</b>
              <span className="muted small">{e.year ?? ""}{e.watched ? tt(" · izledin") : ""}{e.note ? ` · “${e.note}”` : ""}</span>
            </button>
            <span className={"diary-vote" + (e.vote === "like" ? " like" : e.vote === "dislike" ? " dislike" : "")}>{e.vote === "like" ? "👍" : e.vote === "dislike" ? "👎" : ""}</span>
            <select className="pl-pick" value={e.rating ?? ""} onChange={(ev) => diarySet(e.title, e.year, { rating: ev.target.value ? Number(ev.target.value) : undefined })}>
              <option value="">{tt("Puan")}</option>
              {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}/10</option>)}
            </select>
            <button className="round sm-round" title={tt("Defterden sil")} aria-label={tt("Sil")} onClick={() => remove(e)}><Icon d={I.x} size={12} /></button>
          </div>
        ))}
        {!list.length && <div className="muted small">{tt("Bu filtrede kayıt yok.")}</div>}
      </div>
    </div>
    </div>,
    document.body
  );
}

/** A list's cover: the first four posters as a collage. */
function PlCover({ items }: { items: PlItem[] }) {
  const ps = items.filter((x) => x.poster && !cwFlag(x.tmdbId, x.kind)).slice(0, 4);
  return (
    <div className={"plc-cover n" + ps.length}>
      {ps.length ? ps.map((x, i) => <div key={i} style={{ backgroundImage: `url(${IMG}w185${x.poster})` }} />) : <Icon d={I.film} size={28} />}
    </div>
  );
}

type PlSort = "order" | "tmdb" | "stars" | "new" | "old" | "az";
const PL_SORTS: [PlSort, string][] = [["order", tt("Liste sırası")], ["tmdb", tt("TMDB puanı")], ["stars", tt("Arkadaşın puanı")], ["new", tt("En yeni")], ["old", tt("En eski")], ["az", "A → Z"]];

const isFolder = (p: Playlist, all: Playlist[]) => !p.parent && all.some((x) => x.parent === p.id);
/** A friend's list (their folder or a list inside it): read-only for Luna and the assistant. */
const friendsList = (p: Playlist, all: Playlist[]) => !!p.parent || isFolder(p, all);

/** One open list: hero, tools and the poster wall. `owner` is the friend it belongs to, if any. */
/** A wall made of several lists ("Tüm filmler"): not saved, nothing to reorder or remove. */
const ALL_PREFIX = "all:";
/* ---------- sharing a film list: a Luna file another Luna reads back, or plain text for anywhere ---------- */
const LUNA_LIST = "#LUNA-LIST v1";
async function directorsOf(l: PlItem[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (!store.get("tmdbKey")) return out;
  const todo = l.filter((t) => t.tmdbId).slice(0, 80);
  for (let i = 0; i < todo.length; i += 8) {
    await Promise.all(todo.slice(i, i + 8).map(async (t) => {
      const r: any = await tmdbGet(`/${t.kind === "tv" ? "tv" : "movie"}/${t.tmdbId}/credits`).catch(() => null);
      const d = t.kind === "tv" ? null : (r?.crew ?? []).filter((c: any) => c.job === "Director").map((c: any) => c.name).join(", ");
      if (d) out[t.title + "|" + (t.year ?? "")] = d;
    }));
  }
  return out;
}
async function shareText(pl: Playlist, luna: boolean): Promise<string> {
  const dirs = await directorsOf(pl.items);
  const dir = (t: PlItem) => dirs[t.title + "|" + (t.year ?? "")];
  if (luna) return LUNA_LIST + "\n" + JSON.stringify({ name: pl.name, items: pl.items.map((t) => ({ title: t.title, year: t.year, tmdbId: t.tmdbId, kind: t.kind, rating: t.rating, director: dir(t) })) });
  return [`${pl.name} — ${pl.items.length} film`, "", ...pl.items.map((t, i) => `${i + 1}. ${t.title}${t.year ? ` (${t.year})` : ""}${t.rating ? ` · TMDB ${String(t.rating).replace(".", DEC)}` : ""}${dir(t) ? ` · ${tt("Yönetmen")}: ${dir(t)}` : ""}`), "", tt("Luna Player ile paylaşıldı")].join("\n");
}
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
function ShareList({ pl }: { pl: Playlist }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const copy = async (luna: boolean) => {
    setMsg(tt("Hazırlanıyor…"));
    try { await navigator.clipboard.writeText(await shareText(pl, luna)); setMsg(luna ? tt("Luna listesi kopyalandı: başka bir Luna'da Listelerim › İçe aktar'a yapıştırılır") : tt("Metin kopyalandı")); }
    catch { setMsg(tt("Kopyalanamadı")); }
    setTimeout(() => { setMsg(""); setOpen(false); }, 2600);
  };
  const box = useRef<HTMLSpanElement>(null);
  const [at, setAt] = useState<React.CSSProperties>({});
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  return <span className="share-l" ref={box}>
    <button className={"chip" + (open ? " on" : "")} onClick={(e) => {
      // drawn over the page (the list's box clips anything inside it), below the button or above when there is no room
      const r = e.currentTarget.getBoundingClientRect();
      setAt(window.innerHeight - r.bottom > 180 ? { top: r.bottom + 6, right: window.innerWidth - r.right } : { bottom: window.innerHeight - r.top + 6, right: window.innerWidth - r.right });
      setOpen((x) => !x);
    }}>{tt("Paylaş")} ▾</button>
    {open && <span className="share-pop" style={at}>
      <button className="lp-item" onClick={() => copy(true)}><span>{tt("Luna listesi olarak kopyala")}</span><small>{tt("Luna'ya aktarılır")}</small></button>
      <button className="lp-item" onClick={() => copy(false)}><span>{tt("Metin olarak kopyala")}</span><small>{tt("ad, yıl, puan, yönetmen")}</small></button>
      {msg && <span className="muted small share-msg">{msg}</span>}
    </span>}
  </span>;
}

function PlaylistView({ pl, owner, items, onPlay, onOpen, onClose }: {
  pl: Playlist; owner?: string; items: Item[]; onPlay?: (path: string) => void; onOpen?: (t: DetailTarget) => void; onClose?: () => void;
}) {
  const [sort, setSort] = useState<PlSort>("order");
  const [minStars, setMinStars] = useState(0);
  const [q, setQ] = useState("");
  const [onlyLib, setOnlyLib] = useState(false);
  const [hideSeen] = useHideWatched();
  const [shown, setShown] = useState(60);
  const [drag, setDrag] = useState<number | null>(null);
  useEffect(() => { setShown(60); }, [pl.id, q, onlyLib, sort, hideSeen, minStars]);
  // the search as it settles (the posters aren't looked up on every key press)
  const [dq, setDq] = useState("");
  useEffect(() => { const t = setTimeout(() => setDq(q), 400); return () => clearTimeout(t); }, [q]);
  const virtual = pl.id.startsWith(ALL_PREFIX);
  // a friend's list is theirs: shown, never reordered, emptied or deleted here
  const locked = virtual || !!owner;
  useEffect(() => {
    const all = loadPlaylists();
    const cur = virtual ? pl : all.find((p) => p.id === pl.id);
    if (!cur) return;
    // the posters of what is on screen: a search or a filter shows other films than the first ones
    let list = cur.items;
    if (dq.trim()) list = list.filter((t) => seenKey(t.title).includes(seenKey(dq)));
    if (onlyLib) list = list.filter((t) => libMatch(items, t));
    if (hideSeen) list = list.filter((t) => !iWatched(t));
    if (minStars) list = list.filter((t) => (t.stars ?? 0) >= minStars);
    // a sorted wall can put any film on top, so all of them are looked up then
    const work = sort === "order" ? list.slice(0, shown) : list;
    if (!work.some((x) => (!x.poster || x.rating == null) && !x.noPoster)) return;
    fillPosters(work, () => {
      const fresh = loadPlaylists();
      // a combined wall writes what it found back into every list that has the film
      const targets = virtual ? fresh.filter((x) => x.id === pl.id.slice(ALL_PREFIX.length) || x.parent === pl.id.slice(ALL_PREFIX.length)) : fresh.filter((x) => x.id === pl.id);
      if (!targets.length) return;
      for (const p of targets) for (const x of p.items) { const w = work.find((y) => y.title === x.title && y.year === x.year); if (w) posterInfo(x, w); }
      savePlaylists(fresh);
    }, sort === "order" ? shown : work.length);
  }, [pl.id, shown, dq, onlyLib, sort, hideSeen, minStars]);
  const inLib = (t: PlItem) => libMatch(items, t);
  const edit = (f: (p: Playlist) => void) => { const all = loadPlaylists(); const p = all.find((x) => x.id === pl.id); if (p) { f(p); savePlaylists(all); } };
  const removeItem = (t: PlItem) => edit((p) => { p.items = p.items.filter((x) => !(x.title === t.title && x.year === t.year)); });
  const moveTo = (from: number, to: number) => { if (from !== to) edit((p) => { const [x] = p.items.splice(from, 1); p.items.splice(to, 0, x); }); };
  const del = () => { if (confirm(tt("“{0}” silinsin mi?", pl.name))) { savePlaylists(loadPlaylists().filter((x) => x.id !== pl.id)); onClose?.(); } };

  const all = pl.items;
  let view = all.map((t, i) => ({ t, i }));
  if (q.trim()) view = view.filter(({ t }) => seenKey(t.title).includes(seenKey(q)));
  if (onlyLib) view = view.filter(({ t }) => inLib(t));
  if (minStars) view = view.filter(({ t }) => (t.stars ?? 0) >= minStars);
  const before = view.length;
  if (hideSeen) view = view.filter(({ t }) => !iWatched(t));
  const hiddenN = before - view.length;
  const by: Record<PlSort, (a: PlItem, b: PlItem) => number> = {
    order: () => 0,
    tmdb: (a, b) => (b.rating ?? 0) - (a.rating ?? 0),
    stars: (a, b) => (b.stars ?? 0) - (a.stars ?? 0),
    new: (a, b) => Number(b.year ?? 0) - Number(a.year ?? 0),
    old: (a, b) => Number(a.year ?? 9999) - Number(b.year ?? 9999),
    az: (a, b) => a.title.localeCompare(b.title, "tr"),
  };
  if (sort !== "order") view = [...view].sort((a, b) => by[sort](a.t, b.t));
  const rated = all.filter((x) => x.rating);
  const avg = rated.length ? rated.reduce((n, x) => n + (x.rating ?? 0), 0) / rated.length : 0;
  const libCount = all.filter((x) => inLib(x)).length;
  const hero = all.find((x) => x.poster && !cwFlag(x.tmdbId, x.kind))?.poster;
  useContentWarnings(view.slice(0, shown).map(({ t }) => t));
  const target = (t: PlItem): DetailTarget => ({ title: t.title, year: t.year, kind: t.kind, tmdbId: t.tmdbId, stars: t.stars, from: owner });

  return (
    <div className="plv">
      <div className="plv-hero" style={hero ? { backgroundImage: `url(${IMG}w780${hero})` } : undefined}>
        <div className="plv-shade" />
        {onClose && <button className="round plv-x" aria-label={tt("Kapat")} title={tt("Kapat")} onClick={onClose}><Icon d={I.x} size={16} /></button>}
        <div className="plv-head">
          <div className="plv-kicker">{owner ? `${owner} › ` : ""}{virtual ? tt("bütün listeleri ve önerileri") : pl.source ? tt("Letterboxd'dan") : tt("Listem")}</div>
          <h3>{pl.name}</h3>
          <div className="plv-stats">
            <span><b>{all.length}</b>  {tt("film")}</span>
            {avg > 0 && <span className="rating">★ {avg.toFixed(1).replace(".", DEC)}  {tt("ort.")}</span>}
            {libCount > 0 && <span><b>{libCount}</b>  {tt("kütüphanende")}</span>}
          </div>
        </div>
        <div className="plv-tools">
          <div className="plv-search"><Icon d={I.search} size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tt("Listede ara")} /></div>
          <select value={sort} onChange={(e) => setSort(e.target.value as PlSort)}>{PL_SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <button className={"chip" + (onlyLib ? " on" : "")} onClick={() => setOnlyLib((v) => !v)}>{tt("Kütüphanemdekiler")}</button>
          <HideWatched hidden={hiddenN} />
          <select aria-label={tt("En düşük arkadaş puanı")} value={minStars} onChange={(e) => setMinStars(Number(e.target.value))}>
            <option value={0}>{tt("Tüm arkadaş puanları")}</option><option value={3}>3★+</option><option value={3.5}>3½★+</option><option value={4}>4★+</option><option value={4.5}>4½★+</option>
          </select>
          {pl.source?.url && <button className="chip" onClick={() => openUrl(pl.source!.url)}>{tt("Letterboxd'da aç")}</button>}
          <span className="plv-result-count" role="status">{tt("{0} / {1} film", view.length, all.length)}</span>
          <ShareList pl={pl} />
          {!locked && <button className="chip" onClick={del}>{tt("Listeyi sil")}</button>}
        </div>
      </div>
      <div className="plg">
        {view.slice(0, shown).map(({ t, i }) => {
          const lib = inLib(t);
          const d = diaryGet(t.title, t.year);
          return (
            <div role="button" tabIndex={0} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onOpen?.(target(t)); } }} key={t.title + (t.year ?? "") + i} className={"plg-card" + (drag === i ? " dragging" : "")}
              draggable={!locked && sort === "order" && !q && !onlyLib && !hideSeen && !minStars}
              onDragStart={() => setDrag(i)} onDragEnd={() => setDrag(null)}
              onDragOver={(e) => { if (drag != null) e.preventDefault(); }}
              onDrop={() => { if (drag != null) moveTo(drag, i); setDrag(null); }}>
              <div className={"plg-poster clickable" + (cwFlag(t.tmdbId, t.kind) ? " cw-blur" : "")} onClick={() => onOpen?.(target(t))}
                style={t.poster ? { backgroundImage: `url(${IMG}w342${t.poster})` } : undefined}>
                {!t.poster && <div className="plg-blank"><Icon d={I.film} size={26} /><span>{t.title}</span></div>}
                {t.rating ? <span className="tmdb-badge">★ {t.rating.toFixed(1).replace(".", DEC)}</span> : null}
                {sort === "order" && <span className="plg-rank">{i + 1}</span>}
                {(lib || d?.watched) && <span className="plg-flags">{lib ? <span title={tt("Kütüphanende var")}>●</span> : null}{d?.watched ? <span title={tt("İzledin")}>✓</span> : null}</span>}
                <div className="plg-hover" onClick={(e) => e.stopPropagation()}>
                  {lib && onPlay && <button className="round" title={tt("Oynat")} aria-label={tt("Oynat")} onClick={() => onPlay(lib.files[0].path)}><Icon d={I.play} fill size={18} /></button>}
                  <button className="round" title={tt("YouTube'da Türkçe fragman")} aria-label={tt("Fragman")} onClick={() => openUrl(youtubeTrailer(t.year ? `${t.title} (${t.year})` : t.title))}><Icon d={I.play} fill size={14} /></button>
                  <button className="round" title={tt("Detay")} aria-label={tt("Detay")} onClick={() => onOpen?.(target(t))}>i</button>
                  {!locked && <button className="round" title={tt("Listeden çıkar")} aria-label={tt("Çıkar")} onClick={() => removeItem(t)}><Icon d={I.x} size={14} /></button>}
                </div>
              </div>
              <div className="plg-title ellipsis" title={t.title}><CwStar id={t.tmdbId} kind={t.kind} />{t.title}</div>
              <div className="plg-sub">{t.year ?? ""}{t.stars ? <span className="plg-stars" title={tt("{0} puanı", owner ? owner + tt("'ın") : "Letterboxd")}>{owner ? owner + ": " : ""}{stars(t.stars)}</span> : null}{d?.rating ? <span className="plg-mine">{tt("sen")} {d.rating}/10</span> : null}</div>
            </div>
          );
        })}
      </div>
      {view.length > shown && <div className="plg-more"><button className="chip" onClick={() => setShown((n) => n + 60)}>{tt("Daha fazla göster (")}{view.length - shown})</button></div>}
      {!all.length && <div className="muted small plg-empty">{tt("Liste boş. Öneri kartlarındaki “+ Listeye” ile ya da asistanla doldurabilirsin.")}</div>}
      {all.length > 0 && !view.length && <div className="muted small plg-empty">{tt("Eşleşen film yok.")}</div>}
    </div>
  );
}

/** "Listelerim": only the user's own lists (friends' lists live under the friend). */
function Playlists({ items, onPlay, onOpen }: { items: Item[]; onPlay?: (path: string) => void; onOpen?: (t: DetailTarget) => void }) {
  useTaste();
  const lists = loadPlaylists();
  const own = lists.filter((p) => !p.parent && !isFolder(p, lists));
  const [sel, setSel] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const cur = own.find((p) => p.id === sel);
  useEffect(() => {
    const f = (e: Event) => { const id = (e as CustomEvent<{ id: string }>).detail.id; if (loadPlaylists().some((p) => p.id === id && !p.parent)) { setSel(id); setCollapsed(false); } };
    window.addEventListener("luna-open-list", f);
    return () => window.removeEventListener("luna-open-list", f);
  }, []);
  const create = () => { if (!name.trim()) return; const p = createPlaylist(name); setSel(p.id); setName(""); setCollapsed(false); };
  return (
    <section className="row pl2">
      <h2 className="recs-head">
        <button className="sect-toggle" onClick={() => setCollapsed((v) => !v)} aria-expanded={!collapsed}>
          <span className={"caret" + (collapsed ? "" : " open")}>▸</span>  {tt("Listelerim")} <span className="muted small">{own.length}</span>
        </button>
        <span className="grow" />
        <input className="pl-new" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} placeholder={tt("Yeni liste adı")} />
        <button className="chip" onClick={create} disabled={!name.trim()}>{tt("Oluştur")}</button>
        <button className="chip" title={tt("Paylaşılan bir Luna listesini ya da film adlarını içeren metni panodan al")} onClick={async () => {
          const got = parseSharedList(await navigator.clipboard.readText().catch(() => "") || "");
          if (!got) { alert(tt("Panoda bir Luna listesi ya da “Ad (Yıl)” satırları bulunamadı.")); return; }
          const p = createPlaylist(lists.some((x) => x.name === got.name) ? got.name + " (2)" : got.name);
          savePlaylists(loadPlaylists().map((x) => (x.id === p.id ? { ...x, items: got.items } : x)));
          setSel(p.id); setCollapsed(false);
        }}>{tt("İçe aktar")}</button>
      </h2>
      {!collapsed && (
        <>
          {!own.length && <div className="muted empty-note">{tt("Kendi listen yok. Buradan oluşturabilir ya da asistana “bana hafta sonu için bir maraton listesi yap” diyebilirsin.")}</div>}
          {own.length > 0 && (
            <div className="plc-shelf">
              {own.map((p) => (
                <button key={p.id} className={"plc" + (cur?.id === p.id ? " on" : "")} onClick={() => setSel(cur?.id === p.id ? null : p.id)}>
                  <PlCover items={p.items} />
                  <div className="plc-name ellipsis">{p.name}</div>
                  <div className="plc-meta">{p.items.length}  {tt("film")}</div>
                </button>
              ))}
            </div>
          )}
          {cur && <PlaylistView key={cur.id} pl={cur} items={items} onPlay={onPlay} onOpen={onOpen} onClose={() => setSel(null)} />}
        </>
      )}
    </section>
  );
}

/** The watch-later list (from the assistant, the chat bookmarks and by hand): poster cards, looked up on TMDB once. */
type LaterMeta = { poster?: string | null; rating?: number; tmdbId?: number; kind?: "movie" | "tv"; none?: boolean };
const laterKey = (t: string) => seenKey(t);
function LaterList({ items, onOpen, onPlay }: { items: Item[]; onOpen: (t: DetailTarget) => void; onPlay?: (path: string) => void }) {
  useTaste();
  const later = loadLater();
  const meta = store.json<Record<string, LaterMeta>>("laterMeta", {});
  const [, bump] = useState(0);
  useEffect(() => {
    const todo = later.filter((t) => !meta[laterKey(t)]);
    if (!todo.length || !store.get("tmdbKey")) return;
    let alive = true;
    (async () => {
      for (const t of todo) {
        const title = t.replace(/\s*\((\d{4})\)\s*$/, "");
        const y = Number(t.match(/\((\d{4})\)\s*$/)?.[1]) || undefined;
        try {
          const good = (l: SearchHit[]) => l.find((x) => x.poster && (!y || x.year === String(y))) ?? l.find((x) => x.poster);
          const h = good(await searchTmdb(title, "movie", y)) ?? good(await searchTmdb(title, "tv", y)) ?? good(await searchTmdb(title, "movie"));
          const all = store.json<Record<string, LaterMeta>>("laterMeta", {});
          all[laterKey(t)] = h ? { poster: h.poster, rating: h.rating, tmdbId: h.id, kind: h.kind } : { none: true };
          store.set("laterMeta", JSON.stringify(all));
          if (alive) bump((n) => n + 1);
        } catch { /* try again next time */ }
      }
    })();
    return () => { alive = false; };
  }, [later.join("|")]);
  // these cards are checked for content warnings too (the poster blurs like everywhere else)
  useContentWarnings(later.map((t) => meta[laterKey(t)]).filter((m) => m?.tmdbId).map((m) => ({ tmdbId: m!.tmdbId, kind: m!.kind })));
  if (!later.length) return null;
  return (
    <section className="row">
      <h2>{tt("Sonra izleyeceklerim")} <span className="muted small">{later.length}</span></h2>
      <div className="plg later-grid">
        {later.map((t) => {
          const m = meta[laterKey(t)];
          const title = t.replace(/\s*\((\d{4})\)\s*$/, "");
          const year = t.match(/\((\d{4})\)\s*$/)?.[1];
          const lib = libMatch(items, { title, year, tmdbId: m?.tmdbId, kind: m?.kind });
          const open = () => onOpen({ title, year, kind: m?.kind, tmdbId: m?.tmdbId });
          return (
            <div key={t} className="plg-card">
              <div className={"plg-poster clickable" + (cwFlag(m?.tmdbId, m?.kind) ? " cw-blur" : "")} onClick={open}
                style={m?.poster ? { backgroundImage: `url(${IMG}w342${m.poster})` } : undefined}>
                {!m?.poster && <div className="plg-blank"><Icon d={I.film} size={26} /><span>{title}</span></div>}
                {m?.rating ? <span className="tmdb-badge">★ {m.rating.toFixed(1).replace(".", DEC)}</span> : null}
                {lib && <span className="plg-flags"><span title={tt("Kütüphanende var")}>●</span></span>}
                <div className="plg-hover" onClick={(e) => e.stopPropagation()}>
                  {lib && onPlay && <button className="round" title={tt("Oynat")} aria-label={tt("Oynat")} onClick={() => onPlay(lib.files[0].path)}><Icon d={I.play} fill size={18} /></button>}
                  <button className="round" title={tt("YouTube'da Türkçe fragman")} aria-label={tt("Fragman")} onClick={() => openUrl(youtubeTrailer(t))}><Icon d={I.play} fill size={14} /></button>
                  <button className="round" title={tt("Detay")} aria-label={tt("Detay")} onClick={open}>i</button>
                  <button className="round" title={tt("Listeden çıkar")} aria-label={tt("Çıkar")} onClick={() => markLater(t, false)}><Icon d={I.x} size={14} /></button>
                </div>
              </div>
              <div className="plg-title ellipsis" title={title}><CwStar id={m?.tmdbId} kind={m?.kind} />{title}</div>
              <div className="plg-sub">{year ?? ""}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function RecsPage({ items, onPlay, onTorrent, onAsk, onSource, onDownload }: { items: Item[]; onPlay?: (path: string) => void; onTorrent?: () => void; onAsk?: (it: Item) => void } & SourceProps) {
  const { recs } = useTaste();
  const [detail, setDetail] = useState<DetailTarget | null>(null);
  const [shown, setShown] = useState(48);
  const [doneShown, setDoneShown] = useState(24);
  // a card that was just voted on stays in place until its rating bubble closes
  const [askFor, setAskFor] = useState<{ id: string; vote: Vote } | null>(null);
  // whose recommendations are open: a name, "*" for everyone, null for none
  const [who, setWho] = useState<string | null>(null);
  const [tab, setTab] = useState<string>("recs");
  // the assistant's "open the X list": the friend's folder with that list's tab
  useEffect(() => {
    const f = (e: Event) => {
      const all = loadPlaylists();
      const pl = all.find((p) => p.id === (e as CustomEvent<{ id: string }>).detail.id);
      if (!pl) return;
      const parent = pl.parent ? all.find((p) => p.id === pl.parent) : undefined;
      if (parent) { setWho(parent.name); setTab(pl.id); }
      else if (isFolder(pl, all)) { setWho(pl.name); setTab("all"); }
    };
    window.addEventListener("luna-open-list", f);
    return () => window.removeEventListener("luna-open-list", f);
  }, []);
  const [modOpen, setModOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [lbOpen, setLbOpen] = useState(false);
  const [lb, setLb] = useState("");
  const [lbWho, setLbWho] = useState("");
  const [lbMine, setLbMine] = useState(false);
  // while Letterboxd is read: what it is doing (pages, lists) and for how long
  const [lbBusy, setLbBusy] = useState<{ msg: string; at: number } | null>(null);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!lbBusy) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    const un = listen<string>("lb-progress", (e) => setLbBusy((b) => (b ? { ...b, msg: e.payload } : b)));
    return () => { clearInterval(id); un.then((f) => f()); };
  }, [!!lbBusy]);
  const [hideSeen] = useHideWatched();
  const [busyMsg, setBusyMsg] = useState("");
  const pick = (w: string | null) => { setWho(w); setTab("recs"); setModOpen(false); setShown(48); setDoneShown(24); if (w && w !== "*") setFrom(w); };
  const [imp, setImp] = useState(false);
  const [title, setTitle] = useState("");
  const [from, setFrom] = useState("");
  const [note, setNote] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [hit, setPick] = useState<SearchHit | null>(null);

  useEffect(() => {
    setPick(null);
    if (title.trim().length < 2 || !store.get("tmdbKey")) { setHits([]); return; }
    let alive = true;
    const t = setTimeout(async () => {
      const [m, tv] = await Promise.all([searchTmdb(title, "movie").catch(() => []), searchTmdb(title, "tv").catch(() => [])]);
      if (alive) setHits([...m.slice(0, 4), ...tv.slice(0, 2)]);
    }, 350);
    return () => { alive = false; clearTimeout(t); };
  }, [title]);

  const add = () => {
    const name = hit?.title ?? title.trim();
    if (!name) return;
    const r: Rec = {
      id: Date.now().toString(36), title: name, year: hit?.year, kind: hit?.kind ?? "movie",
      from: from.trim() || "Biri", note: note.trim(), at: Date.now(), tmdbId: hit?.id, poster: hit?.poster,
    };
    saveRecs([r, ...loadRecs()]);
    setTitle(""); setNote(""); setPick(null); setHits([]);
  };
  const patch = (id: string, p: Partial<Rec>) => saveRecs(loadRecs().map((r) => (r.id === id ? { ...r, ...p } : r)));
  const remove = (id: string) => saveRecs(loadRecs().filter((r) => r.id !== id));
  const inLib = (r: Rec) => !!libMatch(items, r);
  const mine = who && who !== "*" ? recs.filter((r) => seenKey(r.from) === seenKey(who)) : recs;
  const open0 = who ? mine.filter((r) => !r.status || r.id === askFor?.id) : [];
  const open = hideSeen ? open0.filter((r) => r.id === askFor?.id || !iWatched(r)) : open0;
  const done = who ? mine.filter((r) => r.status && r.id !== askFor?.id) : [];
  useContentWarnings(open.slice(0, shown));
  // posters for the cards on screen (and the next page as they open)
  const missing = open.slice(0, shown).filter((r) => !r.poster && !r.noPoster).length;
  useEffect(() => {
    if (!missing) return;
    const work = open.slice(0, shown).map((r) => ({ ...r }));
    fillPosters(work, () => {
      const fresh = loadRecs();
      for (const r of fresh) { const w = work.find((x) => x.id === r.id); if (w) posterInfo(r, w); }
      saveRecs(fresh);
    }, shown);
  }, [shown, missing > 0, who]);

  const vote = (r: Rec, v: Vote) => {
    patch(r.id, { status: "watched", vote: v });
    const prev = diaryGet(r.title, r.year)?.vote;
    diarySet(r.title, r.year, { watched: Date.now(), vote: v, ...(prev && prev !== v ? { rating: undefined } : {}) });
    setAskFor({ id: r.id, vote: v });
  };
  const card = (r: Rec) => {
    const target: DetailTarget = { title: r.title, year: r.year, kind: r.kind, tmdbId: r.tmdbId, from: r.from, note: r.note, stars: r.stars };
    const dr = diaryGet(r.title, r.year)?.rating;
    return (
      <div key={r.id} className={"plg-card rec2" + (r.status ? " done" : "")}>
        <div className={"plg-poster clickable" + (cwFlag(r.tmdbId, r.kind) ? " cw-blur" : "")} onClick={() => setDetail(target)}
          style={r.poster ? { backgroundImage: `url(${IMG}w342${r.poster})` } : undefined}>
          {!r.poster && <div className="plg-blank"><Icon d={I.film} size={26} /><span>{r.title}</span></div>}
          {r.rating ? <span className="tmdb-badge">★ {r.rating.toFixed(1).replace(".", DEC)}</span> : null}
          {r.status && <span className={"rec-state " + (r.status === "dismissed" ? "off" : r.vote ?? "")}>{r.status === "dismissed" ? tt("İlgilenmiyorum") : r.vote === "like" ? `👍${dr ? " " + dr : ""}` : `👎${dr ? " " + dr : ""}`}</span>}
          {inLib(r) && <span className="plg-flags"><span title={tt("Kütüphanende var")}>●</span></span>}
          <div className="plg-hover" onClick={(e) => e.stopPropagation()}>
            {!r.status ? (
              <>
                <button className="round" title={tt("İzledim · beğendim")} aria-label={tt("Beğendim")} onClick={() => vote(r, "like")}><Icon d={THUMB} size={16} /></button>
                <button className="round" title={tt("İzledim · beğenmedim")} aria-label={tt("Beğenmedim")} onClick={() => vote(r, "dislike")}><Icon d={THUMB_DOWN} size={16} /></button>
                <button className="round" title={tt("İlgilenmiyorum")} aria-label={tt("İlgilenmiyorum")} onClick={() => patch(r.id, { status: "dismissed" })}>⊘</button>
              </>
            ) : (
              <button className="round" title={tt("Geri al")} aria-label={tt("Geri al")} onClick={() => patch(r.id, { status: undefined, vote: undefined })}>↺</button>
            )}
            <button className="round" title={tt("YouTube'da Türkçe fragman")} aria-label={tt("Fragman")} onClick={() => openUrl(youtubeTrailer(r.year ? `${r.title} (${r.year})` : r.title))}><Icon d={I.play} fill size={14} /></button>
            {playlistNames().length > 0 && (
              <ListPicker round lists={loadPlaylists()} onPick={(id) => addToPlaylist(id, [{ title: r.title, year: r.year }])} />
            )}
            <button className="round" title={tt("Öneriyi sil")} aria-label={tt("Sil")} onClick={() => remove(r.id)}><Icon d={I.x} size={14} /></button>
          </div>
          {askFor?.id === r.id && <RateAsk title={r.title} year={r.year} vote={askFor.vote} onDone={() => setAskFor(null)} />}
        </div>
        <div className="plg-title ellipsis" title={r.title}><CwStar id={r.tmdbId} kind={r.kind} />{r.title}</div>
        <div className="plg-sub">{r.year ?? ""}{who === "*" && <span className="rec-from">{r.from}</span>}{r.stars ? <span className="plg-stars" title={tt("{0}'ın Letterboxd puanı: {1} / 5", r.from, String(r.stars).replace(".", DEC))}>{stars(r.stars)}</span> : null}</div>
        {r.tags?.length ? <div className="rec-tags">{[...r.tags].sort((a, b) => tagOrder(a) - tagOrder(b)).slice(0, 3).map((t) => <span key={t} className={"rtag" + (t === "Beğendi" ? " like" : t === "İzlemek istiyor" ? " want" : t.startsWith("Liste") ? " list" : "")} title={tagHelp(t, r.from)}>{tagLabel(t, r.from)}</span>)}{r.tags.length > 3 ? <span className="rtag" title={r.tags.slice(3).map((t) => tagHelp(t, r.from)).join(" · ")}>+{r.tags.length - 3}</span> : null}</div> : null}
        {r.note && <div className="rec-note ellipsis" title={r.note}>“{r.note}”</div>}
      </div>
    );
  };

  // ----- people: everyone with recommendations or a Letterboxd folder
  const allPl = loadPlaylists();
  const aff = friendAffinity();
  for (const p of allPl) if (isFolder(p, allPl) && !aff[p.name]) aff[p.name] = { total: 0, rated: 0, liked: 0 } as any;
  const people = Object.entries(aff).sort((x, y) => y[1].total - x[1].total).map(([name]) => name);
  const folderOf = (w: string) => allPl.find((p) => !p.parent && seenKey(p.name) === seenKey(w) && isFolder(p, allPl));
  const coverOf = (w: string): PlItem[] => {
    const f = folderOf(w);
    return [...recs.filter((r) => seenKey(r.from) === seenKey(w)), ...(f ? allPl.filter((x) => x.parent === f.id).flatMap((x) => x.items.slice(0, 8)) : [])];
  };
  const mod = modOn();
  const stats = mod ? Object.fromEntries(people.map((w) => [w, modStats(w)])) : {} as Record<string, ReturnType<typeof modStats>>;
  useContentWarnings(mod && who && who !== "*" ? stats[who]?.list ?? [] : []);
  const folder = who && who !== "*" ? folderOf(who) : undefined;
  const subLists = folder ? allPl.filter((x) => x.parent === folder.id) : [];
  // "Tüm filmler": every film of the friend in one wall (their recommendations and all their lists, each once)
  const allFilms: Playlist | null = folder && subLists.length ? (() => {
    const seen = new Map<string, PlItem>();
    const add = (t: PlItem) => {
      const k = seenKey(t.title) + "|" + (t.year ?? "");
      const had = seen.get(k);
      if (!had) seen.set(k, { ...t });
      else seen.set(k, { ...had, poster: had.poster ?? t.poster, rating: had.rating ?? t.rating, tmdbId: had.tmdbId ?? t.tmdbId, stars: Math.max(had.stars ?? 0, t.stars ?? 0) || undefined });
    };
    for (const r of mine) add({ title: r.title, year: r.year, poster: r.poster, tmdbId: r.tmdbId, kind: r.kind, stars: r.stars, rating: r.rating, noPoster: r.noPoster });
    for (const l of [folder, ...subLists]) for (const t of l.items) add(t);
    return { id: ALL_PREFIX + folder.id, name: tt("Tüm filmler"), items: [...seen.values()], at: 0 };
  })() : null;
  const curList = tab === "all" ? allFilms : subLists.find((x) => x.id === tab);
  useEffect(() => { if (tab === "recs" && !mine.length && subLists.length) setTab("all"); }, [who, tab, mine.length, subLists.length]);
  useEffect(() => {
    if (!who) { setRecsView(null); return; }
    setRecsView(curList
      ? { who, list: curList.name, films: curList.items }
      : { who, list: who === "*" ? tt("Tüm öneriler") : tt("Önerileri"), films: mine.filter((r) => !r.status) });
  }, [who, tab, curList?.items.length, mine.length]);
  useEffect(() => () => setRecsView(null), []);
  const st = who && who !== "*" ? stats[who] : undefined;
  const followExport = async () => {
    if (!lbWho.trim()) return;
    const f = await openDialog({ multiple: true, filters: [{ name: "Letterboxd", extensions: ["zip", "csv"] }] });
    const paths = Array.isArray(f) ? f : f ? [f] : [];
    if (!paths.length) return;
    setBusyMsg(tt("Letterboxd dosyası okunuyor…"));
    try { setBusyMsg(await followLetterboxd(lbWho, "", await readLetterboxdExport(paths))); setLbOpen(false); pick(lbWho.trim()); } catch (e) { setBusyMsg(String(e).replace(/^Error: /, "")); }
  };
  const follow = async () => {
    if (!lb.trim() || (!lbMine && !lbWho.trim()) || lbBusy) return;
    setBusyMsg("");
    setLbBusy({ msg: tt("Letterboxd'a bağlanılıyor"), at: Date.now() });
    try {
      if (lbMine) { setBusyMsg(await linkMyLetterboxd(lb.trim())); setLb(""); setLbOpen(false); }
      else { setBusyMsg(await followLetterboxd(lbWho, lb.trim())); setLb(""); setLbOpen(false); pick(lbWho.trim()); }
    } catch (e) { setBusyMsg(String(e).replace(/^Error: /, "")); }
    setLbBusy(null);
  };
  const delPerson = (w: string) => {
    if (!confirm(tt("{0} ile ilgili her şey (önerileri ve Letterboxd listeleri) silinsin mi?", w))) return;
    const f = folderOf(w);
    if (f) savePlaylists(loadPlaylists().filter((p) => p.id !== f.id && p.parent !== f.id));
    saveRecs(loadRecs().filter((r) => seenKey(r.from) !== seenKey(w)));
    pick(null);
  };

  const addForm = (
    <div className="rec-form">
      <div className="rec-inputs">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tt("Film / dizi adı")} />
        <input className={from.trim() || !title.trim() ? "" : "need"} value={from} onChange={(e) => setFrom(e.target.value)} placeholder={tt("Kim önerdi? (gerekli)")} list="rec-people" />
        <datalist id="rec-people">{people.map((p) => <option key={p} value={p} />)}</datalist>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={tt("Ne dedi? (isteğe bağlı)")} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button className="primary" onClick={add} disabled={!title.trim() || !from.trim()} title={!from.trim() ? tt("Önce kimin önerdiğini yaz") : undefined}>{tt("Ekle")}</button>
      </div>
      {hits.length > 0 && (
        <div className="rec-hits">
          {hits.map((h) => (
            <button key={h.kind + h.id} className={"rec-hit" + (hit === h ? " on" : "")} onClick={() => setPick(hit === h ? null : h)}>
              {h.poster ? <img src={`${IMG}w92${h.poster}`} alt="" /> : <span className="ph" />}
              <span className="ellipsis">{h.title}</span>
              <span className="muted small">{h.year} · {h.kind === "tv" ? tt("Dizi") : tt("Film")}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const recGrid = (
    <>
      {!open.length && !done.length && <div className="muted empty-note">{who === "*" ? tt("Henüz öneri yok.") : tt("{0} henüz bir şey önermedi.", who)}</div>}
      <div className="plg rec-grid">{open.slice(0, shown).map(card)}</div>
      {open.length > shown && <div className="plg-more"><button className="chip" onClick={() => setShown((n) => n + 48)}>{tt("Daha fazla göster (")}{open.length - shown})</button></div>}
      {done.length > 0 && <><h2 className="rec-sub">{tt("Bakılanlar")}</h2><div className="plg rec-grid">{done.slice(0, doneShown).map(card)}</div>
        {done.length > doneShown && <div className="plg-more"><button className="chip" onClick={() => setDoneShown((n) => n + 48)}>{tt("Daha fazla göster (")}{done.length - doneShown})</button></div>}</>}
    </>
  );

  return (
    <div className="page">
      <TasteSummary items={items} onOpen={setDetail} />
      <TasteProfile onOpen={(t) => setDetail(t)} sync={myLetterboxd() ? { at: Number(store.get("myLetterboxdAt") ?? 0), run: () => linkMyLetterboxd(myLetterboxd()) } : undefined} />
      <section className="row">
        <h2 className="recs-head">{tt("Öneriler")} <span className="grow" />
          <ModToggle />
          <button className={"chip" + (addOpen ? " on" : "")} onClick={() => setAddOpen((v) => !v)}>{tt("+ Öneri ekle")}</button>
          <button className={"chip" + (imp ? " on" : "")} onClick={() => setImp((v) => !v)}>{tt("İçe aktar")}</button>
          <button className={"chip" + (lbOpen ? " on" : "")} onClick={() => setLbOpen((v) => !v)}>{tt("Letterboxd bağla")}</button>
          <HideWatched hidden={open0.length - open.length} />
          <button className="chip" onClick={async () => {
            setBusyMsg(tt("Güncelleniyor…"));
            let mineMsg = "";
            if (myLetterboxd()) { setBusyMsg(tt("Senin Letterboxd'un güncelleniyor…")); mineMsg = await linkMyLetterboxd(myLetterboxd()).catch((e) => String(e).replace(/^Error: /, "")); }
            const r = await refreshLinkedPlaylists(setBusyMsg).catch((e) => String(e).replace(/^Error: /, ""));
            setBusyMsg([mineMsg, r].filter(Boolean).join(" · "));
          }}>{tt("⟳ Güncelle")}</button>
        </h2>
        {addOpen && addForm}
        {imp && <ImportPanel onDone={() => setImp(false)} />}
        {lbOpen && (
          <div className="lb-box">
            <div className="lb-row">
              <label className="look-check lb-mine">
                <input type="checkbox" checked={lbMine} onChange={(e) => setLbMine(e.target.checked)} />
                {tt("Bu benim profilim")}
              </label>
              {!lbMine && <input value={lbWho} onChange={(e) => setLbWho(e.target.value)} placeholder={tt("Kimin? (ör. Ali)")} />}
              <input className="lb-url" value={lb} onChange={(e) => setLb(e.target.value)} onKeyDown={(e) => e.key === "Enter" && follow()} placeholder={tt("Letterboxd kullanıcı adı ya da bağlantısı (ör. ali ya da letterboxd.com/ali)")} spellCheck={false} />
              <button className="primary sm" onClick={follow} disabled={!lb.trim() || (!lbMine && !lbWho.trim()) || !!lbBusy}>{lbBusy ? tt("Bağlanıyor…") : tt("Bağla")}</button>
              {!lbMine && <>
                <span className="muted small">{tt("ya da")}</span>
                <button className="chip" onClick={followExport} disabled={!lbWho.trim()}
                  data-tip={tt("Letterboxd'da Ayarlar → Veri → Dışa aktar ile indirilen ZIP (ya da içindeki CSV'ler). Site okunamadığında da çalışır.")}>{tt("Dışa aktarma dosyası seç")}</button>
              </>}
            </div>
            <div className="muted small">{lbMine
              ? tt("İzlediğin filmler (puanlarınla), beğenilerin ve izleme listen Luna'ya kaydedilir: arkadaşlarının listelerinde “İzlediklerimi gizle” bunları gizler, asistan da bunları sana tekrar önermez.")
              : tt("Arkadaşının izledikleri, beğenileri, izleme listesi ve kendi listeleri onun adıyla bir klasöre gelir. Büyük profillerde 1-2 dakika sürebilir.")}</div>
            {myLetterboxd() && <div className="small lb-me">{tt("Senin Letterboxd'un:")} <b>{myLetterboxd()}</b>
              <button className="set-link" onClick={() => { store.remove("myLetterboxd"); setBusyMsg(tt("Letterboxd profilin ayrıldı; kaydedilen izlediklerin yerinde duruyor.")); }}>{tt("Ayır")}</button></div>}
          </div>
        )}
        {lbBusy && (
          <div className="lb-progress" role="status">
            <span className="mu-spin sm" />
            <div className="grow">
              <b>{tt("Letterboxd okunuyor")}</b>
              <div className="muted small">{lbBusy.msg}</div>
            </div>
            <span className="muted small">{Math.round((Date.now() - lbBusy.at) / 1000)} {tt("sn")}</span>
          </div>
        )}
        {busyMsg && !lbBusy && <div className="small import-msg">{busyMsg}</div>}
        {!people.length && <div className="muted empty-note">{tt("Arkadaşlarının önerdiği filmleri ekle ya da Letterboxd'larını bağla. Luna Asistanı bunları da hesaba katar.")}</div>}

        {people.length > 0 && (
          <div className="ppl-shelf">
            <button className={"ppl" + (who === "*" ? " on" : "")} onClick={() => pick(who === "*" ? null : "*")}>
              <PlCover items={recs.slice(0, 40)} />
              <div className="plc-name">{tt("Tüm öneriler")}</div>
              <div className="plc-meta">{recs.length}  {tt("film ·")} {people.length}  {tt("kişi")}</div>
            </button>
            {people.map((w) => {
              const a2 = aff[w];
              const f = folderOf(w);
              return (
                <button key={w} className={"ppl" + (who === w ? " on" : "")} onClick={() => pick(who === w ? null : w)}>
                  <div className="ppl-cover"><PlCover items={coverOf(w)} /><span className="ppl-initial">{w[0]?.toLocaleUpperCase("tr")}</span></div>
                  <div className="plc-name ellipsis">{w}{mod && stats[w]?.flagged ? <span className="cw-star" title={tt("Moderasyona takılan film sayısı")}>★{stats[w].flagged}</span> : null}</div>
                  <div className="plc-meta">{a2.total ? tt("{0} öneri", a2.total) : ""}{a2.total && f ? " · " : ""}{f ? tt("{0} liste", allPl.filter((x) => x.parent === f.id).length) : ""}{a2.rated ? tt(" · %{0} uyum", Math.round((a2.liked / a2.rated) * 100)) : ""}</div>
                </button>
              );
            })}
          </div>
        )}

        {who && (
          <div className="ppl-panel">
            <div className="ppl-head">
              <div className="ppl-avatar">{who === "*" ? "★" : who[0]?.toLocaleUpperCase("tr")}</div>
              <div>
                <h3>{who === "*" ? tt("Tüm öneriler") : who}</h3>
                <div className="plv-stats">
                  <span><b>{mine.length}</b>  {tt("öneri")}</span>
                  {subLists.length > 0 && <span><b>{subLists.length}</b>  {tt("Letterboxd listesi")}</span>}
                  {st && <span><b>{st.total}</b>  {tt("film toplam")}</span>}
                  {who !== "*" && aff[who]?.rated ? <span>{pctText(Math.round((aff[who].liked / aff[who].rated) * 100))}  {tt("uyum (")}{aff[who].liked}/{aff[who].rated})</span> : null}
                  {mod && st && (
                    <button className={"mod-count" + (modOpen ? " on" : "")} title={tt("Moderasyona takılan filmler · ayrıntı için tıkla")} onClick={() => setModOpen((v) => !v)}>
                      <span className="cw-star">★</span>{st.flagged}<span className="muted"> / {st.total}</span>
                    </button>
                  )}
                </div>
              </div>
              <span className="grow" />
              {who !== "*" && <button className="chip" onClick={() => delPerson(who)}>{tt("{0}'ı sil", who)}</button>}
              <button className="round" aria-label={tt("Kapat")} title={tt("Kapat")} onClick={() => pick(null)}><Icon d={I.x} size={16} /></button>
            </div>

            {mod && st && modOpen && (
              <div className="mod-panel">
                <div className="mod-head">
                  
                  {tt("toplam")} <b>{st.total}</b>  {tt("filmin")} <b className="cw-red">{st.flagged}</b>  {tt("tanesi moderasyona takılıyor")}
                  {st.total ? <span className="cw-red"> ({pctText(Math.round((st.flagged / st.total) * 100))})</span> : null}
                  {st.checked < st.total && <span className="muted small">  {tt("· kontrol ediliyor")} {st.checked}/{st.total}</span>}
                </div>
                {st.cats.length ? st.cats.map(([c, n]) => (
                  <div key={c} className="mod-row">
                    <span className="mod-cat">{c}</span>
                    <div className="mod-bar"><div style={{ width: `${(n / Math.max(1, st.total)) * 100}%` }} /></div>
                    <span className="mod-pct">{pctText(((n / Math.max(1, st.total)) * 100).toFixed(1).replace(".", DEC))}</span>
                    <span className="muted small mod-n">{n}  {tt("film")}</span>
                  </div>
                )) : <div className="muted small">{st.checked ? tt("Takılan film yok.") : tt("Henüz kontrol edilmedi.")}</div>}
                <div className="muted small">{tt("Yüzdeler {0}'ın toplam film sayısına göre. Bir film birden fazla kategoriye girebilir.", who)}</div>
              </div>
            )}

            {subLists.length > 0 && (
              <div className="ppl-tabs">
                {allFilms && <button className={"seg sm" + (tab === "all" ? " on" : "")} onClick={() => setTab("all")}>{tt("Tüm filmler")} <span className="muted">{allFilms.items.length}</span></button>}
                {mine.length > 0 && <button className={"seg sm" + (tab === "recs" ? " on" : "")} onClick={() => setTab("recs")}>{tt("Önerileri")} <span className="muted">{mine.length}</span></button>}
                {subLists.map((x) => (
                  <button key={x.id} className={"seg sm" + (tab === x.id ? " on" : "")} onClick={() => setTab(x.id)}>{x.name} <span className="muted">{x.items.length}</span></button>
                ))}
              </div>
            )}
            {curList ? <PlaylistView key={curList.id} pl={curList} owner={who} items={items} onPlay={onPlay} onOpen={setDetail} /> : recGrid}
          </div>
        )}
      </section>
      <Playlists items={items} onPlay={onPlay} onOpen={setDetail} />
      <LaterList items={items} onOpen={setDetail} onPlay={onPlay} />
      {detail && <TitleDetail t={detail} items={items} onClose={() => setDetail(null)} onPlay={onPlay} onTorrent={onTorrent} onAsk={onAsk} onSource={onSource} onDownload={onDownload} />}
    </div>
  );
}

// ---------- Gemini chat ----------
type Source = { title: string; uri: string };
type Pic = { src: string; full: string; caption?: string };
/** A film "page" inside an answer: hero, story, director, cast, buttons. */
type FilmCard = { id: number; kind: "movie" | "tv"; title: string; original?: string; year?: string; overview: string; genres: string[]; rating?: number;
  runtime?: number; poster?: string | null; backdrop?: string | null; director?: string; tagline?: string; altYear?: string };
type Face = { name: string; role?: string; photo?: string | null; url?: string };
type Lnk = { kind: string; label: string; url: string };
type SourceAsk = { title: string; year?: string; poster?: string | null };
/** A song found outside the library: the user approves adding it. */
type SongHit = { url: string; title: string; channel: string; duration?: number; thumb?: string };
type SongAsk = { query: string; hits: SongHit[] };
/** Free books found for the user (Project Gutenberg): "Is it this one?" → Save → Read. */
type BookAsk = { query: string; hits: { id: string; title: string; author: string; cover?: string; url: string; kind?: string; from: string }[] };
/** Films that share a name: the user picks the one they mean. */
type Choice = { id: number; kind: "movie" | "tv"; title: string; year: string; poster: string | null; rating?: number };
type LinkAct = { kind: "spotify" | "youtube" | "torrent" | "book"; url: string; state?: "done" | "cancel"; info?: string; pl?: string };
type Msg = { role: "user" | "model"; text: string; /** what the model gets instead of the shown text (a button's full instruction) */ ask?: string; undo?: string; act?: LinkAct; hop?: Mode[]; sources?: Source[]; note?: string; images?: Pic[]; people?: Face[]; links?: Lnk[]; film?: FilmCard; source?: SourceAsk; song?: SongAsk; book?: BookAsk; choices?: Choice[] };
type Conv = { id: string; title: string; at: number; ctx: string; ctxKind: "general" | "film" | "recs" | "music" | "books"; msgs: Msg[] };
const loadConvs = () => store.json<Conv[]>("chatHistory", []);
function saveConv(c: Conv) {
  const all = loadConvs().filter((x) => x.id !== c.id);
  store.set("chatHistory", JSON.stringify([c, ...all].slice(0, 60)));
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

function modelChain(): string[] {
  const chosen = aiModel("gemini");
  const known = store.json<string[]>("geminiModelIds", []);
  const pick = (re: RegExp) => known.filter((id) => re.test(id)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  const auto = known.length
    ? [...pick(/^gemini-[\d.]+-flash-lite$/), ...pick(/^gemini-[\d.]+-flash$/)]
    : ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite", "gemini-2.5-flash-lite", "gemini-flash-latest", "gemini-2.5-flash"];
  // 3.1 Flash Lite first among the fallbacks: it has the largest free daily quota.
  const order = ["gemini-3.1-flash-lite", ...auto];
  return [...new Set([chosen, ...order])].slice(0, 6);
}

/** Calls Gemini; on any error moves on to the next model. A search-grounded request that keeps failing
 *  is finally retried without search, so the user still gets an (unsourced) answer. */
async function geminiWithFallback(key: string, body: any): Promise<{ r: any; model: { id: string; note?: string } }> {
  if (aiProvider() !== "gemini") {
    // OpenAI, Claude or a base URL: one model, the request translated (ai.ts). A model that can't take
    // Luna's tools (some local / base-URL models) is asked again without them, like Gemini below.
    try {
      const { r, id, noSearch } = await otherAi(body);
      return { r, model: { id, note: noSearch ? tt("{0} ile Google araması yok; bilgiler kaynaksız, kontrol edilmedi", aiName()) : undefined } };
    } catch (e) {
      const why = String(e);
      if (!body.tools || !/tool|function|schema|400|unsupported|not support/i.test(why)) throw e;
      const sys = body.systemInstruction ? { parts: [{ text: body.systemInstruction.parts[0].text + "\n\n[Araçlar şu an kullanılamıyor: hiçbir şeyi yapmış, eklemiş, açmış ya da kaydetmiş gibi yazma; araç çağrısını metin olarak yazma. Sadece bilgi ver ve isteğin şu an yapılamadığını kısaca söyle.]" }] } : undefined;
      const { r, id } = await otherAi({ ...body, tools: undefined, toolConfig: undefined, systemInstruction: sys });
      return { r, model: { id, note: tt("{0} Luna'nın araçlarını kabul etmedi; sadece bilgi verildi, hiçbir şey yapılmadı ({1})", aiName(), why.replace(/^Error: /, "").slice(0, 140)) } };
    }
  }
  const chain = modelChain();
  let lastErr: unknown = null;
  // without its tools the model must not pretend it did something (or write the call out as text)
  const bare = body.systemInstruction ? { parts: [{ text: body.systemInstruction.parts[0].text + "\n\n[Araçlar şu an kullanılamıyor: hiçbir şeyi yapmış, eklemiş, açmış ya da kaydetmiş gibi yazma; araç çağrısını metin olarak yazma. Sadece bilgi ver ve isteğin şu an yapılamadığını kısaca söyle.]" }] } : undefined;
  const attempts: [any, boolean][] = body.tools ? [[body, true], [{ ...body, tools: undefined, toolConfig: undefined, systemInstruction: bare }, false]] : [[body, false]];
  for (const [b, grounded] of attempts) {
    for (const id of chain) {
      try {
        const r = await invoke<any>("gemini", { key, model: id, body: b });
        const notes = [];
        if (id !== chain[0]) notes.push(tt("{0} yanıt vermedi, {1} ile cevaplandı", chain[0], id));
        if (body.tools && !grounded) notes.push(body.tools.some((t: any) => t.google_search) ? tt("Google araması kullanılamadı; bilgiler kaynaksız, kontrol edilmedi")
          : tt("Luna'nın araçları kullanılamadı, hiçbir şey yapılmadı ({0})", String(lastErr).replace(/^Error: /, "").slice(0, 160)));
        return { r, model: { id, note: notes.join(" · ") || undefined } };
      } catch (e) {
        lastErr = e;
      }
    }
  }
  const msg = String(lastErr);
  if (/429|quota/i.test(msg)) throw new Error(tt("Tüm modellerin ücretsiz kotası şu an dolu. Birkaç dakika sonra (günlük sınırsa yarın) tekrar dene."));
  throw lastErr;
}

/** Everything the assistant should know about the user's taste, as compact text. */
function profile(items: Item[], recent: Recent[]) {
  const taste = loadTaste();
  const recs = loadRecs();
  const label = (t: string, y?: string) => (y ? `${t} (${y})` : t);
  const watched = recent.filter((r) => pct(r) >= 85 || isFinished(r.path)).map((r) => {
    const it = items.find((i) => i.files.some((f) => f.path === r.path));
    return it ? label(it.meta?.title ?? it.parsed.title, it.meta?.year) : r.title;
  });
  const started = recent.filter((r) => pct(r) > 3 && pct(r) < 85).map((r) => `${r.title} (%${Math.round(pct(r))})`);
  const vals = Object.values(taste);
  const lib = items.slice(0, 400).map((i) => {
    const m = i.meta;
    return `${label(m?.title ?? i.parsed.title, m?.year)}${i.parsed.kind === "tv" ? " [dizi]" : ""}${m?.genres.length ? " — " + m.genres.slice(0, 3).join(", ") : ""}${m?.rating ? ` ★${m.rating}` : ""}`;
  });
  const sec = (h: string, l: string[]) => `## ${h}\n${l.length ? l.map((x) => "- " + x).join("\n") : "(yok)"}`;
  const diary = Object.values(loadDiary());
  const lbl = (e: DiaryEntry) => label(e.title, e.year) + (e.rating ? ` — ${e.rating}/10` : "") + (e.note ? ` (“${e.note}”)` : "");
  const aff = Object.entries(friendAffinity()).filter(([, a]) => a.rated > 0)
    .map(([who, a]) => `${who}: ${a.liked}/${a.rated} beğendi (%${Math.round((a.liked / a.rated) * 100)} uyum), ${a.total} öneri`);
  return [
    sec("Kullanıcı hakkında notların (bunlara uy)", loadNotes()),
    sec("Letterboxd (bu bilgiler Luna'ya aktarıldı ve aşağıdaki bölümlerde; güncelini görmek için read_link ile bu adresleri oku)", letterboxdLinks()),
    sec("Zevk defteri: beğendikleri", diary.filter((e) => e.vote === "like" || (e.rating ?? 0) >= 7).map(lbl)),
    sec("Zevk defteri: beğenmedikleri", diary.filter((e) => e.vote === "dislike" || (e.rating && e.rating <= 4)).map(lbl)),
    sec("Zevk defteri: izledikleri (tekrar önerme; puanı ve notu olanlar yanında)", diary.filter((e) => e.watched).map(lbl)),
    sec("Arkadaşlarla zevk uyumu", aff),
    sec("Yorum analizlerinden öğrenilen zevk (Letterboxd yorumlarına göre eserlerin hikâye/tempo/oyunculuk… puanları, 0-10; öneri yaparken bu ağırlıkları kullan)", tasteForAssistant()),
    sec("İçerik hassasiyeti: uyarısına rağmen 'benim için güvenli' dediği filmler (bu konular onu rahatsız etmiyor)",
      Object.values(loadSafe()).map((m) => `${label(m.title, m.year)} — ${cwLabels(m.cats).join(", ")}`)),
    sec("Listeleri", loadPlaylists().map((p) => p.items.length > 40 ? `${p.name}: ${p.items.length} film (içeriği için list_playlists kullan)` : `${p.name}: ${p.items.map((x) => x.title).join(", ")}`)),
    sec("Beğendikleri", vals.filter((v) => v.vote === "like").map((v) => label(v.title, v.year))
      .concat(recs.filter((r) => r.vote === "like").map((r) => label(r.title, r.year)))),
    sec("Beğenmedikleri", vals.filter((v) => v.vote === "dislike").map((v) => label(v.title, v.year))
      .concat(recs.filter((r) => r.vote === "dislike").map((r) => label(r.title, r.year)))),
    sec("İzleyeceklerim listesi", vals.filter((v) => v.want).map((v) => label(v.title, v.year)).concat(loadLater())),
    sec("Bitirdikleri (oynatma geçmişi)", [...new Set(watched)]),
    sec("İzlediğini işaretledikleri (bunları ASLA tekrar önerme)", loadSeen()),
    sec("Yarıda kalanlar", started),
    sec("Arkadaşlarının önerileri (henüz bakılmamış)", recs.filter((r) => !r.status)
      .map((r) => `${label(r.title, r.year)} — ${r.from} önerdi${r.note ? `: "${r.note}"` : ""}`)),
    sec("Önerilip ilgilenmediği", recs.filter((r) => r.status === "dismissed").map((r) => `${r.title} (${r.from})`)),
    sec("Kütüphanesindeki (diskte, hemen izlenebilir; ilk 400)", lib),
  ].join("\n\n");
}

/** The Letterboxd accounts Luna reads: the user's own and each friend's linked lists, with their addresses. */
function letterboxdLinks(): string[] {
  const out: string[] = [];
  if (myLetterboxd()) out.push(`Kullanıcının KENDİ profili: ${myLetterboxd()} — izledikleri, puanları ve beğenileri zevk defterine, izleme listesi İzleyeceklerim'e aktarıldı`);
  const all = loadPlaylists();
  const done = new Set<string>();
  for (const p of all) {
    if (!p.source?.url || done.has(p.source.url + (p.source.minStars ?? ""))) continue;
    done.add(p.source.url + (p.source.minStars ?? ""));
    const owner = p.parent ? all.find((x) => x.id === p.parent)?.name : undefined;
    out.push(`${owner ? `${owner} (arkadaşı) › ` : ""}${p.name}: ${p.source.url}${p.source.minStars ? ` (${p.source.minStars}★ ve üstü)` : ""} — ${p.items.length} film, Listeleri'nde`);
  }
  return out;
}

/** What the user has in the music part (the assistant's data when it's open there). */
async function musicProfile(): Promise<string> {
  const tracks = await loadMusicLibrary();
  const albums = groupAlbums(tracks);
  const artists = new Map<string, number>();
  for (const x of albums) artists.set(x.artist, (artists.get(x.artist) ?? 0) + 1);
  const recent = store.json<string[]>("musicRecentAlbums", []).map((k) => albums.find((x) => x.key === k)).filter(Boolean).map((x) => `${x!.artist} — ${x!.title}`);
  const sec = (h: string, l: string[]) => `## ${h}\n${l.length ? l.map((x) => "- " + x).join("\n") : "(yok)"}`;
  return [
    sec("Kullanıcı hakkında notların (bunlara uy)", loadNotes()),
    `Arşiv: ${tracks.length} şarkı, ${albums.length} albüm, ${artists.size} sanatçı.`,
    (() => { const n = nowPlaying(); return n ? `## Şu an çalan ("bu şarkı", "çalan şarkı" bunu kasteder)\n${n.radio ? `Radyo: ${n.title}` : `${n.title} — ${n.artist ?? ""}${n.album ? ` (${n.album})` : ""}`}` : "## Şu an çalan\n(bir şey çalmıyor)"; })(),
    sec("Luna'daki çalma listeleri (play_music ile adıyla çalınır, open_playlist ile sayfası açılır)", loadMusicPlaylists().map((p) =>
      `${p.name} (${p.items.length} şarkı${p.from ? `, ${p.from}'dan` : ""}): ${p.items.slice(0, 25).map((t) => `${t.title} — ${t.artist ?? ""}`).join("; ")}${p.items.length > 25 ? " …" : ""}`)),
    sec("Müzik zevki (Zevklerim: şarkılarda neye önem verdiği; söz, ritim, vokal, prodüksiyon, duygu, melodi. Sadece müzik içindir; öneri yaparken bu ağırlıkları kullan)", tasteForAssistant("music")),
    sec("En çok dinlediği şarkılar", mostPlayed(20).map((x) => `${x.q.title} — ${x.q.artist ?? ""} (${x.n} kez)`)),
    sec("Beğendiği şarkılar ve podcast bölümleri (Beğendiklerim; zevkini en iyi bunlar gösterir)", loadLikes().slice(0, 60).map((x) => `${x.q.title} — ${x.q.artist ?? ""}${x.q.podcast ? " [podcast]" : ""}`)),
    sec("Beğenmediği şarkılar (bunları ve çok benzerlerini önerme, listeye koyma)", loadDislikes().slice(0, 60).map((x) => `${x.q.title} — ${x.q.artist ?? ""}`)),
    sec("Son dinledikleri (geçmiş, yeniden eskiye)", loadHistory().slice(0, 25).map((x) => `${x.q.title} — ${x.q.artist ?? ""} (${new Date(x.at).toLocaleDateString("tr-TR")})`)),
    sec("Son dinlenen albümler", recent.slice(0, 12)),
    sec("Sanatçılar (albüm sayısı)", [...artists].sort((x, y) => y[1] - x[1]).slice(0, 120).map(([n, c]) => `${n} (${c})`)),
    sec("Albümler", albums.slice(0, 200).map((x) => `${x.artist} — ${x.title}${x.year ? ` (${x.year})` : ""}`)),
    sec("Favori radyolar", store.json<QItem[]>("musicRadioFav", []).map((r) => r.title)),
    sec("Abone olduğu podcastler", store.json<{ title: string }[]>("podcasts", []).map((x) => x.title)),
  ].join("\n\n");
}
/** What the user has in the books part. */
async function booksProfile(): Promise<string> {
  const books = await loadBookLibrary();
  const recent = store.json<string[]>("bookRecent", []);
  const abRecent = loadAbRecent();
  const playing = nowPlaying();
  const abPlaying = playing?.book ? playing : undefined;
  const pctOf = (path: string) => Math.round((getPos(path)?.pct ?? 0) * 100);
  const sec = (h: string, l: string[]) => `## ${h}\n${l.length ? l.map((x) => "- " + x).join("\n") : "(yok)"}`;
  return [
    sec("Kullanıcı hakkında notların (bunlara uy)", loadNotes()),
    (() => { const b = books.find((x) => x.path === recent[0]); return b ? `## Şu an okuduğu ("bu kitap", "okuduğum kitap" bunu kasteder)\n${b.title}${b.author ? " — " + b.author : ""} (%${pctOf(b.path)})` : "## Şu an okuduğu\n(yok)"; })(),
    ...(abPlaying ? [`## Şu an dinlenen sesli kitap (bölümler "Sıradakiler"de)\n${abPlaying.album ?? abPlaying.title} — ${abPlaying.artist ?? ""}\nBölüm: ${abPlaying.title}`] : []),
    sec("Son dinlenen sesli kitaplar", abRecent.map((a) => `${abTitle(a.title)}${abAuthor(a) ? " — " + abAuthor(a) : ""}`)),
    sec("Okumaya devam ettikleri", recent.map((p) => books.find((b) => b.path === p)).filter((b) => b && pctOf(b.path) < 99).slice(0, 8).map((b) => `${b!.title}${b!.author ? " — " + b!.author : ""} (%${pctOf(b!.path)})`)),
    sec("Bitirdikleri", [...books.filter((b) => pctOf(b.path) >= 99).map((b) => `${b.title}${b.author ? " — " + b.author : ""}`),
      ...Object.values(loadBookNotes()).filter((n) => n.read && !books.some((b) => b.title === n.title && pctOf(b.path) >= 99)).map((n) => `${n.title}${n.author ? " — " + n.author : ""} (okudum olarak işaretli)`)]),
    sec("Okuma geçmişi (yeniden eskiye)", loadReadHistory().slice(0, 20).map((x) => `${new Date(x.at).toLocaleDateString("tr-TR")}: ${x.b.title} — ${Math.max(1, Math.round(x.mins))} dk, %${Math.round(x.from * 100)} → %${Math.round(x.to * 100)}`)),
    sec("Kitap zevki (Zevklerim: kitaplarda neye önem verdiği; kurgu, tempo, üslup, atmosfer, karakter, fikirler. Sadece kitaplar içindir; öneri yaparken bu ağırlıkları kullan)", tasteForAssistant("book")),
    sec("Beğendiği kitaplar", Object.values(loadBookNotes()).filter((n) => n.vote === "like" || (n.rating ?? 0) >= 7).map((n) => `${n.title}${n.author ? " — " + n.author : ""}${n.rating ? ` (${n.rating}/10)` : ""}${n.note ? ` “${n.note}”` : ""}`)),
    sec("Beğenmediği kitaplar", Object.values(loadBookNotes()).filter((n) => n.vote === "dislike").map((n) => `${n.title}${n.author ? " — " + n.author : ""}${n.note ? ` “${n.note}”` : ""}`)),
    sec("Kitaplığı", books.slice(0, 250).map((b) => `${b.title}${b.author ? " — " + b.author : ""} [${b.kind}]`)),
  ].join("\n\n");
}
const SYSTEM_PARTS = `
# Elindekiler (önce bunlara bak)
Aşağıdaki "Kullanıcı profili" Luna'nın kayıtlarıdır, tahmin değil: kullanıcı hakkındaki notlar, zevk defteri (Letterboxd'dan aktarılan izledikleri, puanları, beğenileri dahil), listeleri (arkadaşların Letterboxd'dan dolan listeleri dahil), önerileri, geçmişi, kütüphanesi. Her cevaptan önce ilgili bölümlerine bak; notlara her zaman uy. "Letterboxd'uma/Ali'nin Letterboxd'una bak", "izlediklerim", "notlarım" gibi isteklerde önce profildeki bilgiyi kullan; güncelini ya da tamamını görmek için Letterboxd bölümündeki adresi read_link ile oku, bir listenin bütün filmleri için list_playlists, öneriler için list_recommendations çağır. "Letterboxd'a erişemiyorum", "notlarını göremiyorum" deme: bu araçlarla erişebiliyorsun.
# Luna'nın bölümleri
Luna'nın üç bölümü var: Film, Müzik, Kitap. "X var mı / bizde var mı" sorulursa önce bulunduğun bölümde ara (search_books, search_music ya da search_film_library); araç sonucunda diğer bölümlerde bulunanlar da gelir, onları da söyle (ör. "Dune'un kitabı kitaplığında yok ama filmi film kütüphanende var"). Bir bölümdeyken diğer bölümlerden bir şey istenirse ilgili aracı kullan: film/dizi açmak için open_from_library, müzik/radyo/podcast için play_music, play_radio, play_podcast, kitap için open_book, find_free_books, get_free_book, play_audiobook. Araç bulamazsa uydurma; olduğunu söyle.
# Koleksiyonlar ve ortak geçmiş
Kullanıcı bir konu, eser ya da evren etrafında karışık bir liste isterse (ör. "Dune hakkında bir koleksiyon/liste yap: filmleri, müzikleri, kitapları") make_collection çağır: filmleri/dizileri, şarkıları ve kitapları gerçek adlarıyla, her birine tek cümlelik kısa bir not yazarak ekle. Önce kullanıcının sözlerine uy: ne istediyse onu topla. "Yeni filmler" dediyse sadece yeni uyarlamalar (eskileri ekleme); "filmler" dediyse dizi ekleme, "diziler" dediyse film ekleme; bir yönetmen, yıl, dönem ya da tür söylediyse ona göre daralt; "sadece", "birkaç tane" gibi sınırlara uy. Bu sınırların İÇİNDE eksiksiz ol, örnek olarak bir iki tane seçme. Sınır koymadıysa:
- Kitaplar: serinin/evrenin bütün kitapları, yayın sırasıyla (ana seri; başka yazarların devam ve ön hikâye kitapları da, yazarlarıyla). Bir yazar istendiyse önemli kitaplarının hepsi.
- Filmler ve diziler: bütün uyarlamalar ve yapımlar, yayın sırasıyla (eski uyarlamalar, mini diziler, yan diziler, animasyonlar dahil). Duyurulmuş ama henüz çıkmamış olanları da ekle, notuna "yakında: <vizyon tarihi>" yaz. Mesajda "İnternet araştırması" varsa listeyi ona göre yap, hafızana göre değil.
- Müzik: koleksiyona giren her film ve dizinin (sadece onların) en bilinen 3-5 film müziği parçası, TEK TEK şarkı adıyla ve bestecisiyle ("Paul's Dream | Hans Zimmer"); albüm adı yazma. Esere adanmış ya da ondan esinlenen bilinen şarkılar varsa onlar da.
Gerçekten var olduğundan emin olmadığın bir eseri uydurma; yıl ve yazar/sanatçı doğru olsun. Kütüphanede olmasalar da olur; koleksiyon bir liste ve not defteridir, dosya indirmez. Var olan bir koleksiyona eklemek için aynı adı kullan. Koleksiyonlar üst çubuktaki "Koleksiyonlar"da görünür; kütüphanede olanlar oradan tek tıkla açılır. "Dün ne izledim / bu hafta ne dinledim / ne okudum" gibi sorularda aşağıdaki "Ortak geçmiş"e bak. Koleksiyon yapınca kullanıcı oraya kendiliğinden götürülür.
# Götürme
Çok geniş bir koleksiyon istenirse (ör. bir yönetmenin, türün, dönemin ya da ülkenin "bütün" filmleri; yüzlerce eser çıkacak bir konu) make_collection'ı hemen çağırma; önce kısaca sor: "Bu çok büyük bir ölçek. İstersen senin için ana eserleri çıkarabilirim ya da tamamını çıkarmayı deneyebilirim." Kullanıcı seçince devam et.
Kullanıcı Luna'da bir yere gitmek isterse ("keşfete götür", "radyoyu aç", "koleksiyonlarımı göster", "geçmişim", "ayarlar", "indirmelere bak") go_to çağır: asistan kapanır ve o sayfa açılır. Yol tarif etme, götür.`;
const SYSTEM_MUSIC = `Sen Luna Player'ın müzik asistanısın. Kullanıcıyla Türkçe, samimi ve kısa konuş. Selamlama ve kapanış cümlesi kurma; doğrudan cevapla başla.
Kullanıcının kendi müzik arşivi aşağıda. "Çal", "dinlet", "aç" denince play_music (arşivden), play_radio (canlı radyo) ya da play_podcast kullan; arşivde ne olduğunu görmek için search_music. Tek bir şarkı istenince (önerdiğin bir şarkı da olsa) play_song'u çağır: önce arşivde ve Luna listelerinde arar, bulursa çalar; yoksa YouTube'da bulup onay kartı gösterir. O zaman "Bu şarkı arşivinde ve listelerinde yok, YouTube'da buldum; karttan ekleyip çalabilirsin" de; kullanıcı tıklamadan çaldığını söyleme, aramadan "bulunamadı" deme. Durdur, devam, geç, önceki, ses, karışık gibi isteklerde player_control çağır; çağırmadan "durdurdum" deme. Çalma listesi istenirse make_music_playlist kullan: şarkıları YouTube'dan bulur ve listeyi gerçekten oluşturur. Film listesi aracı add_to_playlist'i müzik için kullanma.
Öneri isteğinde iki kısım yaz: önce arşivinden ve listelerinden (varsa), sonra arşivinde olmayan yeni keşifler ("arşivinde yok" diye belirt); kullanıcı sadece arşivini istemedikçe ikisi de olsun. Albüm, sanatçı ve şarkı adlarını **kalın** yaz. Şarkı sözü yazma (telif).
Her cevabın EN SONUNA ayrı bir satırda 3-4 kısa hazır yanıt yaz: >> Karışık çal | Sakin bir şey | Radyo aç
KONU: müzik, radyo, podcast; ayrıca Luna'nın film ve kitap bölümleri. Başka konularda tek cümleyle "Ben müzik, film ve kitap konularında yardımcı olabiliyorum" de.`;
const SYSTEM_BOOKS = `Sen Luna Player'ın kitap asistanısın. Kullanıcıyla Türkçe, samimi ve kısa konuş. Selamlama ve kapanış cümlesi kurma; doğrudan cevapla başla.
Kullanıcının kitaplığı ve okuma durumu aşağıda. "Aç", "okumaya devam" denince open_book; kitaplığında olmayan klasikler için find_free_books, sonra kullanıcı isterse get_free_book (indirip açar); dinlemek isterse play_audiobook. Sesli kitaplar (LibriVox) ayrıdır: kitap dosyası değildir, dosya kitaplığında görünmez; bağlamdaki "şu an dinlenen sesli kitap" ve "son dinlenen sesli kitaplar" bölümlerini kullan. Dinlemek/sürdürmek için play_audiobook çağır.
Kitap adlarını **kalın** yaz. Öneri isteğinde iki kısım yaz: önce kitaplığından (varsa), sonra kitaplığında olmayanlar ("kitaplığında yok" diye belirt; ücretsiz klasikse find_free_books ile alınabileceğini söyle); kullanıcı sadece kitaplığını istemedikçe ikisi de olsun. Spoiler verme; kitaptan uzun alıntı yapma.
Her cevabın EN SONUNA ayrı bir satırda 3-4 kısa hazır yanıt yaz: >> Ne okusam? | Kaldığım kitabı aç | Ücretsiz bir klasik öner
KONU: kitaplar, yazarlar, okuma; ayrıca Luna'nın film ve müzik bölümleri. Başka konularda tek cümleyle "Ben kitap, film ve müzik konularında yardımcı olabiliyorum" de.`;
const SYSTEM_EN_PART = `

# LANGUAGE (overrides every language rule above)
The user's app is in English. Always reply in natural English, never in Turkish, whatever language the notes, tool results or profile below are in.
The quick-reply line at the very end must be in English too.`;
const MODE_QUICK: Record<Exclude<Mode, "film">, () => string[]> = {
  music: () => [
    ...(nowPlaying() && !nowPlaying()!.radio ? [tt("Çalan şarkı hangi film ve dizilerde geçiyor?"), tt("Bu sanatçının belgeseli ya da filmi var mı?")] : []),
    tt("Arşivimden karışık bir şey çal"), tt("Bu akşama göre bir albüm öner"), tt("Sakin bir radyo aç"), tt("Film müziği gibi bir şey çal"),
  ],
  books: () => [
    ...(store.json<string[]>("bookRecent", []).length ? [tt("Okuduğum kitap ne hakkında?"), tt("Okuduğum kitabın filmi ya da dizisi var mı?"), tt("Bu kitabı okurken ne dinlesem?")] : []),
    tt("Ne okusam?"), tt("Kaldığım kitabı aç"), tt("Filmi yapılmış güzel bir kitap öner"), tt("Ücretsiz bir klasik öner"), tt("Okuduğum kitap için film, müzik ve kitaplarla bir koleksiyon yap"),
  ],
};

/** Laid over the Turkish instructions when the app is in English. */
const SYSTEM_EN = `

# LANGUAGE (overrides every language rule above)
The user's app is in English. Always reply in natural English, never in Turkish, whatever language the notes, tool results or profile below are in.
Write titles as **Original Title (Year)** in bold; do not add a Turkish title next to it.
The quick-reply line at the very end must be in English too, e.g.: >> More like this | Something lighter | Only from my library | Similar series
For off-topic requests say "I can only help with films and series."`;

const SYSTEM = `Sen Luna Player'ın film asistanısın. Kullanıcıyla Türkçe, samimi ve kısa konuş.
Birden fazla film/dizi sayıyorsan ASLA paragraf içinde arka arkaya yazma: her biri ayrı satırda madde olsun, şu biçimde: "- **Ad (Yıl)** — tek cümlelik sebep (kütüphanede var/yok, kim önerdi gibi notlar bu cümlede)". Listeden önce en fazla bir kısa giriş cümlesi yaz.
Film/dizi adlarını her zaman ORİJİNAL adıyla (İngilizce/özgün dildeki adı, Latin harfli; Japonca vb. ise bilinen uluslararası adı) kalın ve yılıyla yaz: **Original Title (Yıl)**. Türkçe adı varsa kalın olmadan yanına parantezle ekle, ör. **The Conjuring (2013)** (Korku Seansı). Türkçe adı asla kalın yazma. Başlık ya da vurgu için kalın yazı kullanma. Kişi adlarını (yönetmen, oyuncu) kalın yazma ve yanlarına yıl koyma; yıl sadece film/dizi adının yanına gelir.
Tek bir film/dizi hakkında bilgi, hikaye ya da kadro sorulursa show_film kullan (sohbette filmin sayfasını açar). Kullanıcı sadece zevkini ya da bir görüşünü söylüyorsa ("vampir sevmiyorum", "korku olmasın") ya da sayfası zaten açılmış bir filmden bahsediyorsa show_film kullanma; sadece cevap ver.
Görsel, fotoğraf, afiş, sahne ya da oyuncu istenirse show_images / show_person; bağlantı ya da 'nerede izlerim' istenirse film_links kullan. Asla URL ya da görsel adresi uydurma.
Kullanıcı çocuk istismarı/pedofili, ensest, nekrofili ve zoofili konularının adını bile okumak istemiyor: bunlardan hiçbir şekilde adıyla, tarifle ya da ima ederek bahsetme; gerekirse sadece "KOD:KZ#4" yaz (ör. "bu filmde KOD:KZ#4 var"). Film özetlerini aktarırken de bu kısımları KOD:KZ#4 ile değiştir.
ÖNCE NİYETİ ANLA, sonra cevap ver:
1) BİLGİ SORUSU (ör. "bu kaçıncı film", "kim oynuyor", "ne zaman çıktı", "kaç sezon", "sonu nasıl" (spoiler uyarısıyla), "bu bana uygun mu"): SADECE soruyu kısa ve net cevapla. Film ÖNERME, öneri listesi yapma, profilden bahsetme.
2) ÖNERİ İSTEĞİ (ör. "ne izlesem", "öner", "buna benzer", "daha fazla"): aşağıdaki öneri kurallarını uygula.
Emin değilsen bilgi sorusu say ve kısa cevapla; öneri sadece istenince yapılır.
Her cevapta andığın HER film ve diziyi (bilgi sorusunda da, bir listede ya da cümle içinde geçse de) **Ad (Yıl)** biçiminde kalın yaz, ör. **Dune (2021)**: Luna onları tıklanabilir yapar; yılı olmayan ad tıklanamaz.
Bir öneriyi gerekçelendirirken "Ali'nin filmlerinin benzerleri", "beğendiklerine benzer" gibi genel ifadeler kullanma: hangi filmlere benzediğini gerçek adlarıyla yaz (ör. "Ali'nin önerdiği **Arrival (2016)** ve **Her (2013)** gibi").

Öneri kuralları (sadece öneri isteğinde). Aşağıdaki profil verisini dikkate al:
- Beğendiklerine benzeyenleri öne çıkar, beğenmediklerine benzeyenlerden kaçın. Bitirdiklerini tekrar önerme.
- Kütüphanesinde olan filmleri özellikle belirt ("kütüphanende var, hemen açabilirsin").
- Kütüphanesinde olmayan ama zevkine uyan filmleri de öner; bunları "kütüphanende yok" diye ayrıca belirt. Kullanıcı "sadece kütüphanemdekiler" demedikçe her öneri cevabında ikisi de olsun: kütüphanesinden (varsa) ve kütüphanesi dışından en az iki yeni keşif.
- Arkadaşlarının önerilerini değerlendir: zevkine uyuyorsa "X önermişti, tam senlik" de; uymuyorsa dürüstçe "pek senin tarzın değil ama X muhtemelen şu sebepten önerdi, şu yüzden sevebilirsin" gibi açıkla.
- Her öneride bir cümleyle neden önerdiğini söyle. Genelde 3-5 öneri yeter. Önerdiğin film adlarını **kalın** yaz ve yılını ekle (kalın yazı SADECE önerilen başlıklar içindir; bilgi cevaplarında başlıkları kalın yazma).
- Spoiler verme.
- Kullanıcı bir bağlantı verirse: önerilere aktarılacaksa import_link (tamamı, sınırsız), arkadaşın hesabı takip edilecekse follow_letterboxd, sadece ne olduğuna bakılacaksa read_link (özet) kullan. Uzun listeleri tek tek add_recommendation ile ekleme.
- Araçların var: add_recommendation (önerilere ekle), mark_watched (izledim), rate_title (beğeni/puan/not), add_watch_later / remove_watch_later (sonra izle), list_recommendations / update_recommendation / remove_recommendations / sort_recommendations (öneri listesini gör, düzenle, sil, sırala), list_playlists / add_to_playlist / remove_from_playlist / delete_playlist (kullanıcının listeleri), read_link (bağlantı oku), follow_letterboxd (arkadaşın Letterboxd'unu bağla), refresh_playlists (bağlı listeleri güncelle), remember_note / forget_note (kullanıcı hakkında kalıcı not), open_from_library (kütüphanedeki filmi aç).
- Bir öneriyi eklerken kimin önerdiğini bilmiyorsan ASLA tahmin etme, "Biri" yazma: önce "Bunu kim önerdi?" diye sor.
- Arkadaşının Letterboxd'unu verirse ve kimin olduğunu söylemediyse sor; sonra follow_letterboxd ile klasör ve listeler oluştur.
- Kullanıcı kalıcı bir tercihini söylerse ("korku sevmem") remember_note ile kendiliğinden not al. Bir film hakkında görüş bildirirse ("çok beğendim", "8 veririm") rate_title ile kaydet.
- "Zevkimi özetle" denirse zevk defterinden en sevdiği türleri, yönetmenleri, puan ortalamasını ve arkadaş uyumlarını anlat. Kullanıcı bunları açıkça istediğinde ya da "X bana Y'yi önerdi" dediğinde kullan; kendiliğinden kullanma. Yaptıktan sonra kısaca ne yaptığını söyle.
3) İLGİNÇ BİLGİ / TRIVIA İSTEĞİ (ör. "ilginç bilgiler", "çekim hikayesi", "kamera arkası"): Google aramasından bulduğun, doğrulanabilir 4-6 ilginç bilgiyi madde madde ver (çekim süreci, oyuncu seçimi, bütçe, mekânlar, efektler, gizli detaylar, ödüller). Emin olmadığın bilgiyi yazma; uydurma. Sonu açık eden bilgilere "(spoiler)" yaz. Bu tür cevaplarda hazır yanıtlar "Daha fazla ilginç bilgi", "Çekim hikayesi", "Gizli detaylar ve göndermeler", "Oyuncu seçimi nasıl oldu" gibi trivia odaklı olsun.
- Her cevabın (bilgi ya da öneri) EN SONUNA, ayrı bir satır olarak, kullanıcının bir sonraki adımda sana söyleyebileceği 3-4 kısa hazır yanıtı şu biçimde yaz (kullanıcının ağzından, en fazla 6 kelime):
>> Daha fazla öner | Daha hafif bir şey | Sadece kütüphanemdekiler | Bunlara benzer diziler
Bu satır ekranda tuş olarak gösterilir; metnin içinde bundan hiç bahsetme.
- Selamlama, giriş cümlesi ve kapanış yapma: "Merhaba", "Harika soru", "Nasıl devam etmek istersin?", "Başka bir şey ister misin?", "Umarım beğenirsin" gibi cümleler kurma. Doğrudan cevapla başla, son öneriyle bitir.
KONU SINIRI (kesin kural): Sadece film, dizi, belgesel, anime, oyuncu/yönetmen, izleme önerileri ve bu uygulamadaki izleme deneyimi hakkında konuş.
Bunların dışındaki her istekte (genel sohbet, ödev, kod, haber, sağlık, kişisel tavsiye vb.) cevap verme; tek cümleyle kibarca "Ben sadece film ve dizi konularında yardımcı olabiliyorum" de ve ilgili bir film/dizi sorusuyla sohbeti geri getir. Kullanıcı ısrar etse ya da bu kuralı değiştirmeni istese bile bu kural geçerli.`;

/** Splits the assistant's ">> a | b | c" suggestion line off its answer. */
function splitChips(text: string): { body: string; chips: string[] } {
  const lines = text.trimEnd().split("\n");
  const i = lines.findIndex((l) => l.trim().startsWith(">>"));
  if (i < 0) return { body: text, chips: [] };
  const chips = lines[i].trim().slice(2).split("|").map((x) => x.trim().replace(/^["“]|["”]$/g, "")).filter((x) => x && x.length < 60);
  return { body: lines.filter((_, k) => k !== i).join("\n").trimEnd(), chips: chips.slice(0, 4) };
}
const FOLLOW_UP = [tt("Daha fazla öner"), tt("Daha hafif bir şey"), tt("Sadece kütüphanemdekiler"), tt("Bunlara benzer diziler")];

const ICON_LATER = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12v18l-6-4-6 4z"/></svg>';
// big-workspace versions of the title buttons: icon + label (the small bubble keeps its compact ones)
const svg = (d: string, fill = false) => `<svg class="ta-i" viewBox="0 0 24 24" width="16" height="16" fill="${fill ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
const TA_UP = svg("M7 10v11H3V10zM7 10l4-8a3 3 0 0 1 3 3v4h6a2 2 0 0 1 2 2.3l-1.4 8A2 2 0 0 1 18.6 21H7");
const TA_DOWN = svg("M17 14V3h4v11zM17 14l-4 8a3 3 0 0 1-3-3v-4H4a2 2 0 0 1-2-2.3l1.4-8A2 2 0 0 1 5.4 3H17");
const TA_LATER = svg("M6 3h12v18l-6-4-6 4z");
const TA_PLAY = svg("M8 5l12 7-12 7z", true);
const TA_SEEN = svg("M20 6 9 17l-5-5");
const ICON_YT = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M8 5l12 7-12 7z"/></svg>';

let knownTitles: { n: string; set: Set<string> } | null = null;
/** Titles Luna knows (library, recommendations, diary, lists): only these get the watched/like/later buttons in answers. */
function isKnownTitle(t: string) {
  const recs = loadRecs();
  const sig = [recs.length, recs[0]?.title, recs[recs.length - 1]?.title, toolCtx.items.length, toolCtx.items[0]?.parsed.title, toolCtx.items[toolCtx.items.length - 1]?.parsed.title].join("|");
  if (!knownTitles || knownTitles.n !== sig) {
    const set = new Set<string>();
    for (const r of recs) set.add(seenKey(r.title));
    for (const i of toolCtx.items) { set.add(seenKey(i.meta?.title ?? i.parsed.title)); set.add(seenKey(i.parsed.title)); }
    for (const e of Object.values(loadDiary())) set.add(seenKey(e.title));
    for (const p of loadPlaylists()) for (const x of p.items) set.add(seenKey(x.title));
    knownTitles = { n: sig, set };
  }
  return knownTitles.set.has(seenKey(t.replace(/\s*\(\d{4}\)\s*$/, "")));
}
function md(text: string, seen: string[], later: string[]) {
  // Minimal markdown: **bold**, *italic*, list items, paragraphs.
  // Every bold title gets: a "watched" box, a "watch later" bookmark and a trailer link.
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const seenSet = new Set(seen.map(seenKey));
  const laterSet = new Set(later.map(seenKey));
  return esc
    .replace(/\*\*(.+?)\*\*/g, (_, t: string) => {
      const raw = t.replace(/&quot;/g, '"').replace(/&amp;/g, "&");
      // headings and emphasis stay plain bold; a film title has a year or is one Luna knows
      if (!/\((19|20)\d{2}\)/.test(raw) && !isKnownTitle(raw)) return `<b>${t}</b>`;
      const plain = seenKey(raw);
      const on = seenSet.has(plain);
      const lt = laterSet.has(plain);
      const dv = diaryGet(t.replace(/&quot;/g, '"').replace(/&amp;/g, "&"))?.vote;
      return `<button type="button" class="seen-box${on ? " on" : ""}" data-seen="${t}" aria-pressed="${on}" title="${on ? tt("İzledim işaretini kaldır") : tt("İzledim olarak işaretle")}"></button>`
        + `<b class="film-link${on ? " seen-title" : ""}" data-film="${t}" title="${tt("Filmin sayfasını aç")}">${t}</b>`
        + `<span class="title-acts"><button type="button" class="ta-more${on || dv || lt ? " set" : ""}" tabindex="-1" aria-label="${tt("Seçenekler")}">${on ? "✓" : dv === "like" ? "👍" : dv === "dislike" ? "👎" : lt ? "🔖" : "⋯"}</button><span class="ta-pop">`
        + `<button type="button" class="seen-btn${on ? " on" : ""}" data-seen="${t}" title="${on ? tt("İzledim işaretini kaldır") : tt("İzledim olarak işaretle")}">${TA_SEEN}<span class="ta-l">${tt("İzledim")}</span></button>`
        + `<button type="button" class="vote-btn${dv === "like" ? " on" : ""}" data-vote="like" data-t="${t}" title="${tt("Beğendim")}"><span class="ta-e">👍</span>${TA_UP}<span class="ta-l">${tt("Beğendim")}</span></button>`
        + `<button type="button" class="vote-btn bad${dv === "dislike" ? " on" : ""}" data-vote="dislike" data-t="${t}" title="${tt("Beğenmedim")}"><span class="ta-e">👎</span>${TA_DOWN}<span class="ta-l">${tt("Beğenmedim")}</span></button>`
        + `<button type="button" class="later-btn${lt ? " on" : ""}" data-later="${t}" aria-pressed="${lt}" title="${lt ? tt("İzleyeceklerimden çıkar") : tt("Sonra izle")}"><span class="ta-e">${ICON_LATER}</span>${TA_LATER}<span class="ta-l">${lt ? tt("Listede") : tt("Sonra izle")}</span></button>`
        + `<button type="button" class="yt-btn" data-yt="${t}" title="${tt("YouTube'da Türkçe fragman ara")}"><span class="ta-e">${ICON_YT}</span>${TA_PLAY}<span class="ta-l">${tt("Fragman")}</span></button></span></span>`;
    })
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, t: string, u: string) => `<a class="msg-link" data-url="${u}" title="${u}">${t}</a>`)
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (_, pre: string, u: string) => `${pre}<a class="msg-link" data-url="${u}" title="${u}">${u.replace(/^https?:\/\/(www\.)?/, "").slice(0, 40)}${u.length > 48 ? "…" : ""}</a>`)
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<i>$2</i>")
    .replace(/^\s*[-*] (.*)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
    .replace(/\n{2,}/g, "<br/><br/>")
    .replace(/\n(?!<)/g, "<br/>");
}

const TOOLS = [{
  functionDeclarations: [
    {
      name: "add_recommendation",
      description: "Kullanıcının 'Aldığım öneriler' listesine bir film/dizi ekler. Kullanıcı birinin ona bir film önerdiğini söylediğinde ya da 'önerilere ekle' dediğinde kullan.",
      parameters: { type: "OBJECT", properties: {
        title: { type: "STRING", description: "Film/dizi adı" }, year: { type: "STRING", description: "Yıl (biliniyorsa)" },
        from: { type: "STRING", description: "Öneren kişinin adı. Bilinmiyorsa önce kullanıcıya sor, tahmin etme." }, note: { type: "STRING", description: "Önerenin notu (varsa)" },
      }, required: ["title", "from"] },
    },
    {
      name: "mark_watched",
      description: "Bir filmi/diziyi kullanıcının izlediklerine ekler. Kullanıcı 'bunu izledim' dediğinde kullan.",
      parameters: { type: "OBJECT", properties: { title: { type: "STRING" }, year: { type: "STRING" } }, required: ["title"] },
    },
    {
      name: "add_watch_later",
      description: "Bir filmi/diziyi kullanıcının 'sonra izle' (izleyeceklerim) listesine ekler. 'Sonra izleyeceğim', 'listeme ekle' dendiğinde kullan.",
      parameters: { type: "OBJECT", properties: { title: { type: "STRING" }, year: { type: "STRING" } }, required: ["title"] },
    },
    {
      name: "rate_title",
      description: "Kullanıcının bir film/dizi hakkındaki görüşünü zevk defterine yazar: beğendi/beğenmedi, 1-10 puan, kısa not. 'Bunu beğendim', '8 veriyorum', 'sonu zayıftı' gibi durumlarda kullan.",
      parameters: { type: "OBJECT", properties: {
        title: { type: "STRING" }, year: { type: "STRING" },
        vote: { type: "STRING", enum: ["like", "dislike", "none"], description: "like/dislike; none = işareti kaldır" },
        rating: { type: "NUMBER", description: "1-10 arası puan" }, note: { type: "STRING", description: "Kısa not" },
      }, required: ["title"] },
    },
    {
      name: "remove_recommendations",
      description: "Aldığım öneriler listesinden toplu silme. 'Ali'nin önerilerinden beğenmediklerimi sil', 'izlediklerimi kaldır' gibi. from + which=all o kişinin Listelerim'deki klasörünü (Letterboxd'dan gelen listeleri) de siler.",
      parameters: { type: "OBJECT", properties: {
        from: { type: "STRING", description: "Sadece bu kişinin önerileri (boş = herkes)" },
        which: { type: "STRING", enum: ["all", "disliked", "watched", "dismissed", "titles"], description: "Hangileri silinsin (all = hepsi / o kişinin hepsi)" },
        titles: { type: "ARRAY", items: { type: "STRING" }, description: "which=titles ise silinecek adlar" },
      }, required: ["which"] },
    },
    {
      name: "read_link",
      description: "Bir bağlantıyı açıp okur. Letterboxd'da film adlarını, yıllarını ve kişinin yıldız puanlarını tek tek verir (profil bağlantısı: izledikleri + izleme listesi). Kullanıcı bir bağlantıdan bahsettiğinde ya da içeriğini yeniden görmen gerektiğinde kullan.",
      parameters: { type: "OBJECT", properties: { url: { type: "STRING" } }, required: ["url"] },
    },
    {
      name: "import_link",
      description: "Bir bağlantıdaki filmlerin TAMAMINI 'Aldığım öneriler'e aktarır; işi Luna yapar, liste sana gelmez (sınır yok). Letterboxd'da min_stars ile sadece belirli puanın üstündekiler alınabilir. Kimin önerdiği bilinmiyorsa önce sor.",
      parameters: { type: "OBJECT", properties: {
        url: { type: "STRING" }, from: { type: "STRING", description: "Öneren kişi" },
        min_stars: { type: "NUMBER", description: "Letterboxd: en az bu kadar yıldız verilenler (ör. 4)" },
        section: { type: "STRING", enum: ["all", "watched", "liked", "watchlist", "lists"], description: "Profil bağlantısında hangi kısım: watched=izledikleri, liked=beğendikleri (kalp), watchlist=izlemek istedikleri, lists=kendi listeleri (varsayılan: all)" },
      }, required: ["url", "from"] },
    },
    {
      name: "follow_letterboxd",
      description: "Bir arkadaşın Letterboxd hesabını Luna'ya bağlar: adına bir klasör ve içinde Letterboxd'dan dolan listeler oluşturur (beğendikleri, 4★ ve üstü verdikleri, izleme listesi ve kendi listelerinin her biri). 'Ali'nin Letterboxd'unu ekle/takip et' gibi durumlarda kullan.",
      parameters: { type: "OBJECT", properties: { person: { type: "STRING" }, url: { type: "STRING", description: "Letterboxd profil ya da liste bağlantısı" } }, required: ["person", "url"] },
    },
    {
      name: "refresh_playlists",
      description: "Letterboxd'a bağlı bütün listeleri günceller (yeni filmleri ekler).",
      parameters: { type: "OBJECT", properties: {} },
    },
    {
      name: "list_playlists",
      description: "Kullanıcının listelerini (playlist) ve içlerindeki filmleri getirir.",
      parameters: { type: "OBJECT", properties: {} },
    },
    {
      name: "add_to_playlist",
      description: "Bir listeye film/dizi ekler; liste yoksa oluşturur. 'Bana bir maraton listesi yap', 'şunu Ghibli listeme ekle' gibi durumlarda kullan. Filmleri izlenme sırasıyla ver. Müzik listesi için bunu değil make_music_playlist'i kullan.",
      parameters: { type: "OBJECT", properties: {
        playlist: { type: "STRING", description: "Liste adı" },
        titles: { type: "ARRAY", items: { type: "STRING" }, description: "Eklenecekler, 'Ad (Yıl)' biçiminde" },
      }, required: ["playlist", "titles"] },
    },
    {
      name: "remove_from_playlist",
      description: "Bir listeden film/dizi çıkarır.",
      parameters: { type: "OBJECT", properties: { playlist: { type: "STRING" }, titles: { type: "ARRAY", items: { type: "STRING" } } }, required: ["playlist", "titles"] },
    },
    {
      name: "delete_playlist",
      description: "Bir listeyi tamamen siler (ya da adını değiştirir: new_name verilirse).",
      parameters: { type: "OBJECT", properties: { playlist: { type: "STRING" }, new_name: { type: "STRING" } }, required: ["playlist"] },
    },
    {
      name: "list_recommendations",
      description: "Aldığım öneriler listesinin tamamını getirir (kim önerdi, not, durum, puan). Listeyle ilgili bir işlem yapmadan önce güncel hâlini görmek için kullan.",
      parameters: { type: "OBJECT", properties: { from: { type: "STRING", description: "Sadece bu kişinin önerileri (boş = hepsi)" } } },
    },
    {
      name: "update_recommendation",
      description: "Aldığım önerilerdeki bir kaydı düzenler: kimin önerdiği, not, durum (open = bakılmadı, watched = izlendi, dismissed = ilgilenmiyorum), beğeni, ad veya yıl düzeltmesi.",
      parameters: { type: "OBJECT", properties: {
        title: { type: "STRING", description: "Düzenlenecek önerinin şu anki adı" }, year: { type: "STRING" },
        new_title: { type: "STRING" }, new_year: { type: "STRING" }, from: { type: "STRING" }, note: { type: "STRING" },
        status: { type: "STRING", enum: ["open", "watched", "dismissed"] }, vote: { type: "STRING", enum: ["like", "dislike", "none"] },
      }, required: ["title"] },
    },
    {
      name: "sort_recommendations",
      description: "Aldığım öneriler listesini sıralar: TMDB puanına, yıla ya da kullanıcının zevkine göre. by=taste ise order alanına kendi sıralamanı (en uygun önce) yaz.",
      parameters: { type: "OBJECT", properties: {
        by: { type: "STRING", enum: ["rating", "year", "taste"] }, from: { type: "STRING", description: "Sadece bu kişinin önerileri (boş = hepsi)" },
        order: { type: "ARRAY", items: { type: "STRING" }, description: "by=taste: başlıklar, en uygundan başlayarak" },
      }, required: ["by"] },
    },
    {
      name: "remember_note",
      description: "Kullanıcının kalıcı bir tercihini not eder ('korku sevmez', 'Ghibli'ye bayılır', '3 saatlik filmlere sabrı yok'). Sohbette böyle kalıcı bir tercih ortaya çıktığında kullan.",
      parameters: { type: "OBJECT", properties: { note: { type: "STRING" } }, required: ["note"] },
    },
    {
      name: "forget_note",
      description: "Kullanıcı hakkındaki bir notu siler (kullanıcı 'artık öyle değil' dediğinde).",
      parameters: { type: "OBJECT", properties: { note: { type: "STRING" } }, required: ["note"] },
    },
    {
      name: "open_from_library",
      description: "Bir filmi/diziyi oynatır. Kullanıcı 'X'i aç/oynat/başlat/izle' dediğinde HER ZAMAN kullan (yıl biliniyorsa ver). Kütüphanede tam o film yoksa Luna sohbette magnet/torrent kutusu açar; benzer adlı başka filmi açmaz.",
      parameters: { type: "OBJECT", properties: { title: { type: "STRING" }, year: { type: "STRING" } }, required: ["title"] },
    },
    {
      name: "show_images",
      description: "Bir filmin/dizinin görsellerini sohbette gösterir: sahne kareleri, afişler ya da oyuncu kadrosu (fotoğraflarıyla). 'Görsellerini göster', 'afişleri', 'sahnelerden', 'oyuncuları kim' gibi isteklerde kullan. Görsel URL'si uydurma, bunu kullan.",
      parameters: { type: "OBJECT", properties: {
        title: { type: "STRING" }, year: { type: "STRING" }, kind: { type: "STRING", enum: ["movie", "tv"] },
        what: { type: "STRING", enum: ["scenes", "posters", "cast"], description: "scenes = sahne kareleri (varsayılan), posters = afişler, cast = yönetmen ve oyuncular" },
      }, required: ["title"] },
    },
    {
      name: "show_film",
      description: "Tek bir film/dizi hakkında konuşurken sohbette onun sayfasını açar: afiş, arka plan, hikaye, yönetmen, fotoğraflı oyuncular, sahneler, puan, fragman ve bağlantılar. 'X'i anlat', 'X nasıl bir film', 'konusu ne', 'X hakkında bilgi', 'kim oynuyor' gibi tek filme odaklı sorularda kullan.",
      parameters: { type: "OBJECT", properties: { title: { type: "STRING" }, year: { type: "STRING" }, kind: { type: "STRING", enum: ["movie", "tv"] },
        exact: { type: "BOOLEAN", description: "Kullanıcı yılı belirterek tam olarak hangisi olduğunu söylediyse true" } }, required: ["title"] },
    },
    {
      name: "show_person",
      description: "Bir oyuncunun/yönetmenin fotoğraflarını ve bilinen işlerini sohbette gösterir.",
      parameters: { type: "OBJECT", properties: { name: { type: "STRING" } }, required: ["name"] },
    },
    {
      name: "film_links",
      description: "Bir film/dizi için gerçek bağlantılar: IMDb, Letterboxd, TMDB, Vikipedi, Türkçe fragman, Türkiye'de nerede izlenir. Bağlantı istendiğinde ya da 'nerede izlerim' sorulduğunda kullan; adres uydurma.",
      parameters: { type: "OBJECT", properties: { title: { type: "STRING" }, year: { type: "STRING" }, kind: { type: "STRING", enum: ["movie", "tv"] } }, required: ["title"] },
    },
    {
      name: "remove_watch_later",
      description: "Bir filmi/diziyi 'sonra izle' listesinden çıkarır.",
      parameters: { type: "OBJECT", properties: { title: { type: "STRING" }, year: { type: "STRING" } }, required: ["title"] },
    },
    // ---- Müzik ----
    {
      name: "search_film_library",
      description: "Kullanıcının film/dizi kütüphanesinde (Luna'nın Film bölümü) arar. 'X var mı' sorularında ve başka bölümde bulunamayan bir ad için kullan.",
      parameters: { type: "OBJECT", properties: { query: { type: "STRING" } }, required: ["query"] },
    },
    {
      name: "search_music",
      description: "Kullanıcının kendi müzik arşivinde (Luna'nın Müzik bölümü) albüm, sanatçı ya da şarkı arar; ne olduğunu listeler.",
      parameters: { type: "OBJECT", properties: { query: { type: "STRING", description: "Albüm, sanatçı ya da şarkı adı; tüm arşiv için boş" } } },
    },
    {
      name: "play_music",
      description: "Kullanıcının müzik arşivinden çalar: bir albüm, bir sanatçının şarkıları, tek şarkı ya da her şey karışık. 'X'i çal / dinlet' denince kullan.",
      parameters: { type: "OBJECT", properties: {
        query: { type: "STRING", description: "Albüm, sanatçı ya da şarkı adı; karışık için boş" },
        what: { type: "STRING", enum: ["album", "artist", "song", "shuffle"], description: "Ne çalınacağı; emin değilsen verme" },
      } },
    },
    {
      name: "play_song",
      description: "Arşivde ya da Luna listelerinde olmayan bir şarkıyı YouTube'da bulur ve onay kartı gösterir. Kullanıcı arşivde olmayan bir şarkıyı çalmanı isterse kullan; kartı kullanıcı tıklamadan çaldığını söyleme.",
      parameters: { type: "OBJECT", properties: {
        title: { type: "STRING", description: "Şarkı adı" },
        artist: { type: "STRING", description: "Sanatçı (biliniyorsa)" },
      }, required: ["title"] },
    },
    {
      name: "make_music_playlist",
      description: "Bir sanatçının/temanın sevilen şarkılarından YouTube üzerinden GERÇEK bir Luna çalma listesi oluşturur. 'X'in en iyi 10 şarkısını getir, playlist yap' gibi isteklerde kullan. Bu araç listeyi gerçekten oluşturur; sadece liste yazma.",
      parameters: { type: "OBJECT", properties: {
        query: { type: "STRING", description: "Sanatçı, grup ya da tema" },
        name: { type: "STRING", description: "Liste adı (boşsa '<sanatçı> En İyiler')" },
        count: { type: "NUMBER", description: "Kaç şarkı (varsayılan 10)" },
        titles: { type: "ARRAY", items: { type: "STRING" }, description: "Belirli şarkı adları (varsa; o zaman query boş olabilir)" },
        extend: { type: "STRING", description: "Yeni liste yerine şarkıları eklenecek VAR OLAN çalma listesinin adı (kullanıcı 'şu listeye ekle' derse)" },
      }, required: ["query"] },
    },
    {
      name: "player_control",
      description: "Çalan müziği/videoyu yönetir: durdur, devam, kapat, sonraki, önceki, ses aç/kıs/ayarla, sessiz, karışık çalma, şu an ne çalıyor. 'Durdur', 'geç', 'sesi kıs' gibi isteklerde HER ZAMAN bunu çağır; çağırmadan 'durdurdum' deme. Açık kitabı sesli okutmak için read_aloud (Edge'in doğal sesiyle, okunan yer işaretlenir), sesli okumayı kapatmak için stop_reading. Sesli okuma sürerken pause/resume/stop okumayı yönetir.",
      parameters: { type: "OBJECT", properties: {
        action: { type: "STRING", enum: ["pause", "resume", "stop", "next", "previous", "volume_up", "volume_down", "volume_set", "mute", "unmute", "shuffle_on", "shuffle_off", "now", "read_aloud", "stop_reading"] },
        value: { type: "NUMBER", description: "volume_set için 0-130 arası ses" },
      }, required: ["action"] },
    },
    {
      name: "play_radio",
      description: "Canlı radyo istasyonu açar (adına ya da türe göre: 'jazz', 'Açık Radyo', 'haber').",
      parameters: { type: "OBJECT", properties: { query: { type: "STRING" } }, required: ["query"] },
    },
    {
      name: "play_podcast",
      description: "Bir podcastin en yeni bölümünü çalar (podcast adı ya da konusu).",
      parameters: { type: "OBJECT", properties: { query: { type: "STRING" } }, required: ["query"] },
    },
    // ---- Kitap ----
    {
      name: "search_books",
      description: "Kullanıcının kendi kitaplığında (Luna'nın Kitap bölümü: EPUB, PDF, çizgi roman) kitap arar; okuma ilerlemesiyle listeler.",
      parameters: { type: "OBJECT", properties: { query: { type: "STRING", description: "Kitap ya da yazar; tüm kitaplık için boş" } } },
    },
    {
      name: "open_book",
      description: "Kullanıcının kitaplığındaki bir kitabı okuyucuda açar (kaldığı yerden). 'X kitabını aç / okumaya devam et' denince kullan.",
      parameters: { type: "OBJECT", properties: { title: { type: "STRING", description: "Kitap adı ya da yazar; son okunan için boş" } } },
    },
    {
      name: "find_free_books",
      description: "Ücretsiz ve yasal kitapları birden çok kaynakta birlikte arar: Project Gutenberg (her dilde klasikler), Vikikaynak (telifi dolmuş Türkçe eserler: Sabahattin Ali, Ömer Seyfettin, Namık Kemal, Nutuk…) ve kullanıcının eklediği kataloglar. Kullanıcının kitaplığında olmayan kitaplar için.",
      parameters: { type: "OBJECT", properties: { query: { type: "STRING", description: "Kitap adı ya da yazar" } }, required: ["query"] },
    },
    {
      name: "get_free_book",
      description: "find_free_books ile bulunan bir kitabı indirip okuyucuda açar (sonuçtaki url ile; eski Gutenberg numarası da olur).",
      parameters: { type: "OBJECT", properties: { url: { type: "STRING", description: "find_free_books sonucundaki [url …]" }, gutenberg_id: { type: "STRING" }, title: { type: "STRING" }, author: { type: "STRING" } }, required: ["title"] },
    },
    {
      name: "rename_file",
      description: "Film kütüphanesindeki bir video dosyasının diskteki adını değiştirir (uzantı aynı kalır, yanındaki altyazı dosyaları da yeni adı alır, izleme bilgileri korunur). 'Dosyanın adını X yap', 'şu filmin adını düzelt' denince kullan. Yeni adı film adı ve yılıyla yaz: 'Alien (1979)'; dizi bölümü için 'Dizi Adı S01E02'. Kullanıcı onay kartında görür; sen sorma.",
      parameters: { type: "OBJECT", properties: {
        title: { type: "STRING", description: "Filmin/dizinin kütüphanedeki adı ya da dosya adının bir parçası" },
        year: { type: "STRING" },
        file: { type: "STRING", description: "Dizide ya da birden çok dosyada hangisi: dosya adının bir parçası (ör. 'S01E02')" },
        new_name: { type: "STRING", description: "Uzantısız yeni dosya adı" },
      }, required: ["title", "new_name"] },
    },
    {
      name: "delete_from_library",
      description: "Film kütüphanesindeki bir film/diziyi kaldırır. Kullanıcıya ne yapılacağı (dosyayı Geri Dönüşüm Kutusu'na silmek ya da sadece 'İzlemeye devam et'ten kaldırmak) onay kartında sorulur; sen sorma, aracı çağır.",
      parameters: { type: "OBJECT", properties: { title: { type: "STRING" }, year: { type: "STRING" } }, required: ["title"] },
    },
    {
      name: "open_playlist",
      description: "Luna'daki bir listenin sayfasını açar: film listeleri (arkadaşların Letterboxd listeleri dahil, Öneriler'de açılır) ve müzik çalma listeleri (Spotify'dan aktarılanlar dahil). 'X listesini aç/göster' denince BUNU çağır, film açma. Listeyi çalmak için play_music kullan.",
      parameters: { type: "OBJECT", properties: { query: { type: "STRING", description: "Listenin adı" } }, required: ["query"] },
    },
    {
      name: "delete_music",
      description: "Müzik arşivinden bir albümü ya da şarkıyı kaldırır. Ne yapılacağı (dosyaları silmek ya da sadece listelerden çıkarmak) onay kartında kullanıcıya sorulur; sen sorma, aracı çağır.",
      parameters: { type: "OBJECT", properties: { query: { type: "STRING", description: "Albüm ya da şarkı adı (gerekirse sanatçıyla)" }, what: { type: "STRING", enum: ["album", "song"] } }, required: ["query"] },
    },
    {
      name: "delete_book",
      description: "Kitaplıktan bir kitabı kaldırır. Ne yapılacağı (sadece okuma kaydını silmek ya da dosyayı silmek) onay kartında kullanıcıya sorulur; sen sorma, aracı çağır.",
      parameters: { type: "OBJECT", properties: { title: { type: "STRING" } }, required: ["title"] },
    },
    {
      name: "go_to",
      description: "Kullanıcıyı Luna'da bir yere götürür: asistan kapanır ve o sayfa açılır. 'X'e götür', 'Y sayfasını aç', 'koleksiyonlarımı göster', 'geçmişimi aç', 'ayarlara git' gibi isteklerde kullan.",
      parameters: { type: "OBJECT", properties: {
        place: { type: "STRING", enum: ["film:home", "film:discover", "film:movies", "film:shows", "film:folders", "film:downloads", "film:recs", "music:home", "music:discover", "music:library", "music:radio", "music:podcast", "books:home", "books:library", "books:discover", "books:audio", "collections", "history", "settings"], description: "Gidilecek yer (mod:sayfa)" },
        collection: { type: "STRING", description: "place collections ise açılacak koleksiyonun adı (isteğe bağlı)" },
      }, required: ["place"] },
    },
    {
      name: "make_collection",
      description: "Bir konu etrafında film, müzik ve kitapları bir arada tutan bir koleksiyon yapar ya da var olan koleksiyona ekler (aynı ad). İçerikler kütüphanede olmak zorunda değil; liste olarak kaydedilir. Kullanıcının sınırlarına uy ('yeni filmler' ise eski uyarlama ve dizi yok); o sınırların içinde eksiksiz ol: bütün kitaplar, bütün uygun film/dizi uyarlamaları, her biri için en bilinen film müziği parçaları tek tek. Kullanıcı onay kartında bazılarını çıkarabilir.",
      parameters: { type: "OBJECT", properties: {
        name: { type: "STRING", description: "Koleksiyonun adı (ör. 'Dune evreni')" },
        about: { type: "STRING", description: "Bir cümlelik açıklama" },
        films: { type: "ARRAY", items: { type: "STRING" }, description: "Filmler ve diziler, her biri: 'Ad | yıl | kısa not' (ör. 'Dune: Çöl Gezegeni | 2021 | Villeneuve uyarlaması')" },
        music: { type: "ARRAY", items: { type: "STRING" }, description: "Şarkılar tek tek (albüm değil), her biri: 'Şarkı adı | sanatçı/besteci | hangi filmden, kısa not'" },
        books: { type: "ARRAY", items: { type: "STRING" }, description: "Kitaplar, her biri: 'Ad | yazar | kısa not'" },
      }, required: ["name"] },
    },
    {
      name: "play_audiobook",
      description: "Ücretsiz bir sesli kitabı (LibriVox) çalar.",
      parameters: { type: "OBJECT", properties: { query: { type: "STRING", description: "Kitap adı ya da yazar" } }, required: ["query"] },
    },
  ],
}];

/** Which part of Luna each tool belongs to: one from another part shows that part's animation and colour. */
const TOOL_MODE: Record<string, Mode> = {
  search_film_library: "film", search_music: "music", play_music: "music", play_song: "music", make_music_playlist: "music", play_radio: "music", play_podcast: "music",
  search_books: "books", open_book: "books", find_free_books: "books", get_free_book: "books", play_audiobook: "books",
  open_from_library: "film", show_film: "film", show_images: "film", show_person: "film", film_links: "film", delete_from_library: "film",
  delete_music: "music", delete_book: "books", open_playlist: "music",
};

/* ---------- the assistant asks before it changes or opens anything, and changes can be undone ---------- */
/** Tools that change the user's records (asked every time, undoable). */
const CHANGES = new Set(["add_recommendation", "mark_watched", "add_watch_later", "remove_watch_later", "rate_title", "remove_recommendations", "import_link",
  "follow_letterboxd", "refresh_playlists", "add_to_playlist", "remove_from_playlist", "delete_playlist", "update_recommendation", "sort_recommendations",
  "remember_note", "forget_note", "get_free_book", "make_collection", "rename_file"]);
/** Tools that open or play something (asked unless the user said not to). */
const OPENS = new Set(["open_playlist", "open_from_library", "play_music", "play_song", "play_radio", "play_podcast", "open_book", "play_audiobook"]);
/** What "Undo" can put back: the changes above, but not a download (the file stays on disk), plus a
 *  music playlist made after its own preview card (asked there, so not asked twice). */
const undoable = (name: string) => (CHANGES.has(name) && name !== "get_free_book" && name !== "rename_file") || name === "make_music_playlist";
const askOpens = () => store.get("assistAskOpen") !== "0";
/** Everything those tools write: a snapshot of these is what "Undo" puts back. */
const UNDO_KEYS = ["recs", "diary", "seenList", "laterList", "playlists", "userNotes", "taste", "musicPlaylists", "bookDiary", "collections"];
type Undo = { id: string; label: string; snap: Record<string, string | null>; after: Record<string, string | null> };
const undos: Undo[] = []; // this run's last changes
const snapshot = () => Object.fromEntries(UNDO_KEYS.map((k) => [k, store.get(k)]));
function restoreSnapshot(snap: Record<string, string | null>, after: Record<string, string | null>) {
  for (const [k, v] of Object.entries(snap)) {
    // only undo the tool's own change: a value the user changed again stays as it is
    if (store.get(k) !== after[k]) continue;
    if (v == null) { try { localStorage.removeItem(k); } catch {} } else store.set(k, v);
  }
  plNames = null;
  changed();
  collectionsChanged();
  saveMusicPlaylists(loadMusicPlaylists()); // tells the music pages
}
/** make_collection's lists ("Ad | yıl/kişi | not") as collection items. */
function collectionItems(a: any): CItem[] {
  const parse = (kind: CItem["kind"], l: unknown): CItem[] => (Array.isArray(l) ? l : []).map(String).map((line) => {
    const [title, mid, ...note] = line.split("|").map((x) => x.trim());
    const year = kind === "film" && /^\d{4}$/.test(mid ?? "") ? mid : undefined;
    return { kind, title: title ?? "", year, by: year ? undefined : mid || undefined, note: note.join(" | ") || undefined };
  }).filter((x) => x.title);
  return [...parse("film", a?.films), ...parse("music", a?.music), ...parse("book", a?.books)];
}
/** What a collection will hold, named one by one, for the confirmation card. */
type AskGroup = { head: string; items: { key: string; title: string; sub?: string; note?: string }[] };
const COLL_LISTS = ["films", "music", "books"] as const;
/** Each item keyed "<call>:<list>:<index>", so the ones the user unticks can be taken out of that call's lists. */
function collectionGroups(a: any, call: number): AskGroup[] {
  const heads = [tt("Filmler"), tt("Müzikler"), tt("Kitaplar")];
  return COLL_LISTS.map((l, li) => ({ head: heads[li], items: (Array.isArray(a?.[l]) ? a[l] : []).flatMap((line: unknown, i: number) =>
    collectionItems({ [l]: [line] }).map((x) => ({ key: `${call}:${l}:${i}`, title: x.title, sub: x.year ?? x.by, note: x.note }))) }))
    .filter((g) => g.items.length);
}
/** The unticked items out of a make_collection call (their names kept in _dropped for the assistant). */
function dropCollectionItems(a: any, call: number, off: Set<string>): any {
  const dropped: string[] = [];
  const out = { ...a };
  for (const l of COLL_LISTS) if (Array.isArray(a?.[l])) out[l] = a[l].filter((line: unknown, i: number) => {
    const keep = !off.has(`${call}:${l}:${i}`);
    if (!keep) dropped.push(String(line).split("|")[0].trim());
    return keep;
  });
  if (dropped.length) out._dropped = dropped;
  return out;
}
/** One plain sentence for what a tool call is about to do. */
function describeTool(name: string, a: any): string {
  const t = (x?: string, y?: string) => `“${String(x ?? "").trim()}”${y ? ` (${y})` : ""}`;
  const list = (l?: string[]) => (l ?? []).slice(0, 6).join(", ") + ((l?.length ?? 0) > 6 ? tt(" ve {0} tane daha", l!.length - 6) : "");
  switch (name) {
    case "add_recommendation": return tt("{0} önerilere eklenecek{1}", t(a?.title, a?.year), a?.from ? tt(" ({0} önerdi)", a.from) : "");
    case "mark_watched": return tt("{0} izlendi olarak işaretlenecek", t(a?.title, a?.year));
    case "add_watch_later": return tt("{0} “Sonra izle”ye eklenecek", t(a?.title, a?.year));
    case "remove_watch_later": return tt("{0} “Sonra izle”den çıkarılacak", t(a?.title, a?.year));
    case "rate_title": return tt("{0} için zevk defterine yazılacak: {1}", t(a?.title, a?.year),
      [a?.vote === "like" ? tt("beğendin") : a?.vote === "dislike" ? tt("beğenmedin") : a?.vote === "none" ? tt("beğeni kaldırılacak") : "", a?.rating ? `${a.rating}/10` : "", a?.note ? `“${a.note}”` : ""].filter(Boolean).join(" · "));
    case "remove_recommendations": return tt("Önerilerden silinecek: {0}{1}", a?.which === "all" ? tt("hepsi") : a?.which === "disliked" ? tt("beğenmediklerin") : a?.which === "watched" ? tt("izlediklerin") : a?.which === "dismissed" ? tt("ilgilenmediklerin") : list(a?.titles), a?.from ? tt(" ({0} önerdikleri)", a.from) : "");
    case "import_link": return tt("Bu bağlantıdaki filmler önerilere aktarılacak{0}: {1}", a?.from ? tt(" ({0} önerdi)", a.from) : "", a?.url ?? "");
    case "follow_letterboxd": return tt("{0} için Letterboxd'dan dolan bir klasör ve listeler oluşturulacak", t(a?.person));
    case "refresh_playlists": return tt("Letterboxd'a bağlı listeler güncellenecek (yeni filmler eklenir)");
    case "add_to_playlist": return tt("{0} listesine eklenecek: {1}", t(a?.playlist), list(a?.titles));
    case "remove_from_playlist": return tt("{0} listesinden çıkarılacak: {1}", t(a?.playlist), list(a?.titles));
    case "delete_playlist": return a?.new_name ? tt("{0} listesinin adı {1} olacak", t(a?.playlist), t(a.new_name)) : tt("{0} listesi tamamen silinecek", t(a?.playlist));
    case "update_recommendation": return tt("{0} önerisi düzenlenecek", t(a?.title, a?.year));
    case "sort_recommendations": return tt("Öneriler sıralanacak: {0}", a?.by === "rating" ? tt("puana göre") : a?.by === "year" ? tt("yıla göre") : tt("zevkine göre"));
    case "remember_note": return tt("Senin hakkında not alınacak: “{0}”", a?.note ?? "");
    case "forget_note": return tt("Bu not silinecek: “{0}”", a?.note ?? "");
    case "get_free_book": return tt("{0} indirilip okuyucuda açılacak", t(a?.title, a?.author));
    case "open_from_library": return tt("{0} açılacak", t(a?.title, a?.year));
    case "play_music": return a?.query ? tt("{0} çalınacak", t(a.query)) : tt("Arşivinden karışık çalınacak");
    case "play_song": return tt("{0} çalınacak", t(a?.title, a?.artist));
    case "make_music_playlist": return tt("{0} çalma listesi oluşturuldu", t(a?.name || a?.query));
    case "play_radio": return tt("{0} radyosu açılacak", t(a?.query));
    case "play_podcast": return tt("{0} podcasti açılacak", t(a?.query));
    case "open_book": return tt("{0} okuyucuda açılacak", t(a?.title));
    case "make_collection": {
      const n = (k: string) => collectionItems(a).filter((x) => x.kind === k).length;
      const parts = [n("film") && tt("{0} film", n("film")), n("music") && tt("{0} şarkı", n("music")), n("book") && tt("{0} kitap", n("book"))].filter(Boolean).join(", ");
      return tt("{0} koleksiyonuna eklenecek: {1}", t(a?.name), parts || tt("boş"));
    }
    case "play_audiobook": return tt("{0} sesli kitabı çalınacak", t(a?.query));
    case "delete_from_library": return tt("{0} kütüphaneden kaldırılacak", t(a?.title, a?.year));
    case "rename_file": { const f = renameTarget(a); return tt("Dosyanın adı değişecek: {0} → {1}", f ? f.split(/[\\/]/).pop()! : t(a?.title), t(a?.new_name)); }
    case "open_playlist": return tt("{0} listesinin sayfası açılacak", t(a?.query));
    case "delete_music": return tt("{0} müzik arşivinden kaldırılacak", t(a?.query));
    case "delete_book": return tt("{0} kitaplıktan kaldırılacak", t(a?.title));
    default: return name;
  }
}
type AskCard = { kind: "change" | "open" | "delete"; lines: string[]; groups?: AskGroup[]; files?: string[]; opts?: [string, string, boolean?][]; resolve: (v: string) => void };
const DELETES = new Set(["delete_from_library", "delete_music", "delete_book"]);
const fold = (x: string) => x.toLocaleLowerCase("tr").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
async function musicTargets(a: any) {
  const q = fold(String(a?.query ?? ""));
  if (!q) return [];
  const tracks = await loadMusicLibrary();
  const albumExact = tracks.filter((t) => fold(t.album) === q || fold(`${t.albumArtist || t.artist} ${t.album}`) === q);
  const albumPart = q.length > 3 ? tracks.filter((t) => fold(t.album).includes(q)) : [];
  const songHit = tracks.filter((t) => fold(t.title) === q || fold(`${t.artist} ${t.title}`) === q);
  if (a?.what === "song") return songHit;
  if (a?.what === "album") return albumExact.length ? albumExact : albumPart;
  // exact names first: "Home" is the song Home, not the album Homecoming
  return albumExact.length ? albumExact : songHit.length ? songHit : albumPart;
}
async function bookTarget(a: any) {
  const q = fold(String(a?.title ?? ""));
  const books = await loadBookLibrary();
  return books.find((b) => fold(b.title) === q) ?? (q.length > 3 ? books.find((b) => fold(b.title).includes(q)) : undefined);
}
/** The files a delete would touch and the ways it can go. */
async function deletePlan(name: string, a: any): Promise<{ files: string[]; opts: [string, string, boolean?][] }> {
  if (name === "delete_music") {
    const l = await musicTargets(a);
    return { files: l.map((t) => t.path), opts: l.length ? [["lists", tt("Sadece listelerimden çıkar")], ["file", tt("Dosyaları sil (Geri Dönüşüm Kutusu'na)"), true]] : [] };
  }
  if (name === "delete_book") {
    const b = await bookTarget(a);
    return { files: b ? [b.path] : [], opts: b ? [["record", tt("Sadece okuma kaydını sil (ilerleme, beğeni, not)")], ["file", tt("Dosyayı sil (Geri Dönüşüm Kutusu'na)"), true]] : [] };
  }
  const it = libMatch(toolCtx.items, { title: String(a?.title ?? ""), year: a?.year });
  return { files: it?.files.map((f) => f.path) ?? [], opts: it ? [["recent", tt("Sadece “İzlemeye devam et”ten kaldır")], ["file", tt("Dosyayı sil (Geri Dönüşüm Kutusu'na)"), true]] : [] };
}
async function trashFiles(paths: string[]): Promise<{ n: number; failed: string[] }> {
  let n = 0;
  const failed: string[] = [];
  for (const p of paths) {
    try { n += await invoke<number>("delete_file", { path: p }); } catch { failed.push(p); }
  }
  return { n, failed };
}
const HOP_TEXT: Record<Mode, string> = { film: tt("Filmlerine bakıyorum"), music: tt("Müziklerine bakıyorum"), books: tt("Kitaplığına bakıyorum") };
const MODE_NAME: Record<Mode, string> = { film: tt("Film"), music: tt("Müzik"), books: tt("Kitap") };

let pendingAsk: { text: string; show?: string } | null = null;
/** Opens the assistant and asks it this (only on the user's click: nothing runs on its own). */
/** Asks the assistant; `show` is the short line the chat shows when `text` is a long instruction for the model. */
export function askAssistant(text: string, show?: string) { pendingAsk = { text, show }; window.dispatchEvent(new Event("luna-ask")); }
/** Opens the assistant without a question (the header/playlist buttons). */
export function openAssistant() { pendingAsk = null; window.dispatchEvent(new Event("luna-ask")); }

/** What the tools can reach in the app (set by the chat panel). */
const toolCtx: { mode: Mode; setMode?: (m: Mode) => void; items: Item[]; play?: (path: string) => void; remove?: (paths: string[], how: "file" | "recent") => Promise<string>; media: { images: Pic[]; people: Face[]; links: Lnk[]; film?: FilmCard; source?: SourceAsk; song?: SongAsk; book?: BookAsk; choices?: Choice[] }; pickFilm?: (c: Choice) => void; openSource?: (src: string) => void; closeChat?: () => void; musicPreview?: (name: string, items: QItem[], missing: string[], subs: string[], extend?: string) => Promise<MusicPick | null> } = { mode: "film", items: [], media: { images: [], people: [], links: [] } };
/** "This film isn't in your library": a box for a magnet link or a .torrent file, right in the answer. */
function SourceBox({ s: src }: { s: SourceAsk }) {
  const [v, setV] = useState("");
  const [sent, setSent] = useState(false);
  const ok = /^magnet:\?/i.test(v.trim()) || /\.torrent$/i.test(v.trim()) || /^https?:\/\/\S+\.torrent/i.test(v.trim());
  const go = (x: string) => { if (!toolCtx.openSource) return; toolCtx.openSource(x); setSent(true); };
  const pick = async () => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const f = await open({ multiple: false, filters: [{ name: "Torrent", extensions: ["torrent"] }] });
    if (typeof f === "string") go(f);
  };
  return (
    <div className="srcbox">
      {src.poster ? <img src={`${IMG}w185${src.poster}`} alt="" /> : <div className="srcbox-ph"><Icon d={I.film} size={22} /></div>}
      <div className="srcbox-main">
        <div className="srcbox-t"><b>{src.title}{src.year ? ` (${src.year})` : ""}</b>  {tt("kütüphanende yok")}</div>
        {sent ? <div className="srcbox-ok">{tt("✓ Torrent açılıyor…")}</div> : (
          <>
            <div className="srcbox-row">
              <input value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ok && go(v.trim())} placeholder={tt("magnet:?xt=… bağlantısını buraya yapıştır")} spellCheck={false} />
              <button className="fp-btn primary" disabled={!ok} onClick={() => go(v.trim())}><Icon d={I.play} fill size={14} />  {tt("İzle")}</button>
            </div>
            <div className="srcbox-row">
              <button className="fp-btn" onClick={pick}>{tt(".torrent dosyası seç")}</button>
              <button className="fp-btn" onClick={() => openUrl(youtubeTrailer(src.year ? `${src.title} (${src.year})` : src.title))}><Icon d={I.play} fill size={12} />  {tt("Fragman")}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** A click on a title page's backdrop (not on its buttons, poster or text) opens the pictures. */
const heroClick = (e: React.MouseEvent) => !(e.target as HTMLElement).closest("button, a, input, select, img, h1, h2, h3, .rating, .lp, .fp-dir, .td-from");
/** A title's pictures (backdrops, then posters) big, over the page but not edge to edge. */
function Gallery({ id, kind, first, onClose }: { id: number; kind: "movie" | "tv"; first?: string | null; onClose: () => void }) {
  const [pics, setPics] = useState<string[]>(first ? [first] : []);
  const [i, setI] = useState(0);
  useEffect(() => {
    tmdbGet(`/${kind}/${id}/images`, { include_image_language: "null,en,tr" }).then((r: any) => {
      const l = [...(r?.backdrops ?? []), ...(r?.posters ?? []).slice(0, 12)].map((x: any) => x.file_path as string).filter(Boolean);
      setPics([...new Set([...(first ? [first] : []), ...l])].slice(0, 60));
    }).catch(() => {});
  }, [id, kind]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
      else if (e.key === "ArrowRight") setI((x) => Math.min(x + 1, pics.length - 1));
      else if (e.key === "ArrowLeft") setI((x) => Math.max(x - 1, 0));
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [pics.length]);
  const cur = pics[i];
  return createPortal(<div className="gal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
    <div className="gal">
      <button className="round gal-x" aria-label={tt("Kapat")} onClick={onClose}><Icon d={I.x} size={18} /></button>
      <div className="gal-main">
        {cur ? <img src={`${IMG}original${cur}`} alt="" /> : <span className="muted small pulse">{tt("Görseller getiriliyor…")}</span>}
        {i > 0 && <button className="round gal-nav -l" aria-label={tt("Önceki")} onClick={() => setI(i - 1)}>‹</button>}
        {i < pics.length - 1 && <button className="round gal-nav -r" aria-label={tt("Sonraki")} onClick={() => setI(i + 1)}>›</button>}
      </div>
      {pics.length > 1 && <div className="gal-strip">{pics.map((p, j) => <img key={p} className={j === i ? "on" : ""} src={`${IMG}w185${p}`} alt="" loading="lazy" onClick={() => setI(j)} />)}</div>}
    </div>
  </div>, document.body);
}

function FilmPage({ f, onPlay }: { f: FilmCard; onPlay?: (path: string) => void }) {
  useTaste();
  const lib = libMatch(toolCtx.items, { title: f.title, year: f.year, tmdbId: f.id, kind: f.kind });
  const label = f.year ? `${f.title} (${f.year})` : f.title;
  const later = has(loadLater(), label) || has(loadLater(), f.title);
  const d = diaryGet(f.title, f.year);
  const vote = (v: Vote) => diarySet(f.title, f.year, { vote: d?.vote === v ? undefined : v });
  const [gal, setGal] = useState(false);
  return (
    <div className="fp">
      {gal && f.id > 0 && <Gallery id={f.id} kind={f.kind === "tv" ? "tv" : "movie"} first={f.backdrop} onClose={() => setGal(false)} />}
      <div className={"fp-hero" + (f.id > 0 ? " -gal" : "")} title={f.id > 0 ? tt("Görselleri büyük aç") : undefined} onClick={(e) => { if (f.id > 0 && heroClick(e)) setGal(true); }} style={f.backdrop ? { backgroundImage: `url(${IMG}w1280${f.backdrop})` } : undefined}>
        <div className="fp-shade" />
        <div className="fp-head">
          {f.poster && <img className="fp-poster" src={`${IMG}w342${f.poster}`} alt="" />}
          <div className="fp-titles">
            <h3>{f.title}{f.year && <span> ({f.year})</span>}</h3>
            {f.original && f.original !== f.title && <div className="fp-orig">{f.original}</div>}
            {f.altYear && <div className="fp-orig">{tt("Aynı film · Letterboxd'da")} {f.altYear}  {tt("olarak geçiyor (ilk gösterim / vizyon yılı farkı)")}</div>}
            <div className="fp-meta">
              {f.rating ? <span className="rating">★ {String(f.rating).replace(".", DEC)}</span> : null}
              {f.runtime ? <span>{Math.floor(f.runtime / 60) ? `${Math.floor(f.runtime / 60)} sa ` : ""}{f.runtime % 60}  {tt("dk")}</span> : null}
              {f.genres.length ? <span>{f.genres.slice(0, 3).join(", ")}</span> : null}
              {f.kind === "tv" && <span>{tt("Dizi")}</span>}
            </div>
            {f.director && <div className="fp-dir"><span>{f.kind === "tv" ? tt("Yaratıcı") : tt("Yönetmen")}</span> {f.director}</div>}
          </div>
        </div>
      </div>
      <div className="fp-body">
        {f.tagline && <div className="fp-tag">“{f.tagline}”</div>}
        {f.overview && <TrText className="fp-ov" text={f.overview} />}
        <div className="fp-acts">
          {lib && onPlay && <button className="fp-btn primary" onClick={() => onPlay(lib.files[0].path)}><Icon d={I.play} fill size={15} />  {tt("Oynat")}</button>}
          <button className="fp-btn" onClick={() => openUrl(youtubeTrailer(label))}><Icon d={I.play} fill size={13} />  {tt("Fragman")}</button>
          <button className={"fp-btn" + (later ? " on blue" : "")} onClick={() => (later ? laterOff(f.title, f.year || undefined) : markLater(label, true))}>{later ? tt("✓ Sonra izlenecek") : tt("+ Sonra izle")}</button>
          <ListPicker btnClass="fp-btn" lists={loadPlaylists()} onPick={(id) => addToPlaylist(id, [{ title: f.title, year: f.year || undefined }])} />
          <button className={"fp-btn" + (d?.vote === "like" ? " on" : "")} onClick={() => vote("like")}><Icon d={THUMB} size={15} />  {tt("Beğendim")}</button>
          <button className={"fp-btn" + (d?.vote === "dislike" ? " on red" : "")} onClick={() => vote("dislike")}><Icon d={THUMB_DOWN} size={15} />  {tt("Beğenmedim")}</button>
          {lib && <span className="fp-lib">{tt("● Kütüphanende var")}</span>}
        </div>
        <FilmDecisionPanel key={f.kind + ":" + f.id + ":" + f.title + ":" + f.year} film={f} />
      </div>
    </div>
  );
}

/** Lower-case Turkish text without its special letters, for matching what people type on any keyboard. */
const trAscii = (t: string) => t.toLocaleLowerCase("tr").replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c");

/* ---------- the player, controlled from the chat: "durdur", "sonraki", "sesi kıs"… ---------- */
type PlayerAct = "pause" | "resume" | "stop" | "next" | "previous" | "volume_up" | "volume_down" | "volume_set" | "mute" | "unmute" | "shuffle_on" | "shuffle_off" | "now" | "read_aloud" | "stop_reading";
/** Does it at once and says what was done (the words the user sees). */
function playerControl(act: PlayerAct, value?: number): string {
  const c = nowPlaying();
  const what = c ? `${c.title}${c.artist ? " — " + c.artist : ""}` : "";
  // a book being read aloud: pause / go on / stop are for the reading
  if (ttsActive() && (act === "pause" || act === "resume" || act === "stop")) {
    if (act === "pause") { ttsPause(); return tt("Sesli okuma duraklatıldı"); }
    if (act === "resume") { ttsResume(); return tt("Sesli okuma devam ediyor"); }
    ttsStop(); return tt("Sesli okuma kapatıldı");
  }
  if (ttsActive()) {
    switch (act) {
      case "mute": setTtsMuted(true); return tt("Sesli okumanın sesi kapatıldı");
      case "unmute": setTtsMuted(false); return tt("Sesli okumanın sesi açıldı");
      case "volume_up": setTtsVolume(ttsVolume() + 10, false); return tt("Sesli okumanın sesi açıldı");
      case "volume_down": setTtsVolume(ttsVolume() - 10); return tt("Sesli okumanın sesi kısıldı");
      case "volume_set": setTtsVolume(Number.isFinite(value) ? value! : 70, false); return tt("Sesli okuma: %{0}", ttsVolume());
    }
  }
  switch (act) {
    case "read_aloud":
      if (!ttsReady()) return tt("Önce okuyucuda bir EPUB kitap aç; sesli okuma orada çalışır.");
      if (ttsActive()) { ttsResume(); return tt("Sesli okuma devam ediyor"); }
      ttsStart(); return tt("Kitap sesli okunuyor (sayfanın başından)");
    case "stop_reading": if (!ttsActive()) return tt("Şu an sesli okuma yok"); ttsStop(); return tt("Sesli okuma kapatıldı");
    case "pause": if (c) pauseMusic(true); else setProp("pause", true); return tt("Durduruldu");
    case "resume": if (c) pauseMusic(false); else setProp("pause", false); return what ? tt("Devam ediyor: {0}", what) : tt("Devam ediyor");
    case "stop": mpv("stop"); stopMusic(); return tt("Kapatıldı");
    case "next": if (!c) return tt("Şu an çalan bir liste yok"); nextTrack(); return tt("Sonraki şarkı");
    case "previous": if (!c) return tt("Şu an çalan bir liste yok"); prevTrack(0); return tt("Önceki şarkı");
    case "volume_up": mpv("add", "volume", 10); setProp("mute", false); return tt("Ses açıldı");
    case "volume_down": mpv("add", "volume", -10); return tt("Ses kısıldı");
    case "volume_set": { const v = Math.max(0, Math.min(130, Math.round(Number.isFinite(value) ? value! : 70))); setProp("volume", v); setProp("mute", false); return tt("Ses: %{0}", v); }
    case "mute": setProp("mute", true); return tt("Ses kapatıldı");
    case "unmute": setProp("mute", false); return tt("Ses açıldı");
    case "shuffle_on": if (!c) return tt("Şu an çalan bir liste yok"); setShuffle(true); return tt("Karışık çalma açık");
    case "shuffle_off": setShuffle(false); return tt("Karışık çalma kapalı");
    case "now": return what ? tt("Şu an çalıyor: {0}", what) : tt("Şu an müzik çalmıyor");
    default: return tt("Bilinmeyen komut");
  }
}
/** A short player command typed in the chat: done right away, the model isn't asked. */
function quickCommand(text: string): { act: PlayerAct; value?: number } | null {
  const t = trAscii(text).replace(/[.!?,]+/g, " ")
    .replace(/\b(lutfen|please|bi|bir|ya|hadi|musun|misin|mi|abi|luna|the|music|song)\b/g, " ").replace(/\s+/g, " ").trim();
  if (!t || t.split(" ").length > 5) return null;
  const obj = "(muzigi|muzik|sarkiyi|sarki|videoyu|filmi|calani)";
  const vol = t.match(/\bses(i|in)?\b.*?%?\s*(\d{1,3})\b|\bvolume\b.*?(\d{1,3})\b/);
  if (vol) return { act: "volume_set", value: Number(vol[2] ?? vol[3]) };
  const table: [RegExp, PlayerAct][] = [
    [new RegExp(`^(${obj} )?(durdur|duraklat|dur|beklet)( ${obj})?$|^(pause|stop playing)$`), "pause"],
    [new RegExp(`^(${obj} )?(kapat)$|^stop$`), "stop"],
    [new RegExp(`^(${obj} )?(devam( et| ettir)?|surdur|oynat|cal)( ${obj})?$|^(resume|play|continue)$`), "resume"],
    [/^(sonraki|siradaki|diger)( sarki(ya)?( gec)?)?$|^(gec|atla|sarkiyi gec|bunu gec|gec bunu)$|^(next|skip)$/, "next"],
    [/^(onceki|bir onceki)( sarki(ya)?( don)?)?$|^(geri don|basa don)$|^(previous|prev|back)$/, "previous"],
    [/^ses(i)? (ac|artir|yukselt|arttir)$|^(louder|volume up)$/, "volume_up"],
    [/^ses(i)? (kis|azalt|dusur)$|^(quieter|volume down)$/, "volume_down"],
    [/^ses(i)? kapat$|^(sessize al|mute)$/, "mute"],
    [/^(sesi geri ac|unmute)$/, "unmute"],
    [/^(karistir|karisik cal|karisik)$|^shuffle( on)?$/, "shuffle_on"],
    [/^(karistirma|karisigi kapat|karisik kapat|sirayla cal)$|^shuffle off$/, "shuffle_off"],
    [/^(ne caliyor|bu ne sarki|bu sarki ne|bu hangi sarki|hangi sarki bu|calan ne)$|^what'?s playing$/, "now"],
    [/^((kitabi )?sesli oku|kitabi oku|bana oku|oku bana|okumaya basla|sesli okumaya basla)$|^read( it)? aloud$/, "read_aloud"],
    [/^(okumayi|sesli okumayi) (durdur|kapat|bitir)$|^stop reading$/, "stop_reading"],
  ];
  const hit_ = table.find(([re]) => re.test(t));
  return hit_ ? { act: hit_[1] } : null;
}

/** IMDb / Letterboxd / TMDB / Wikipedia / trailer / JustWatch cards for a title (once per answer). */
async function addLinks(h: SearchHit) {
  if (toolCtx.media.links.some((l) => l.kind === "tmdb" && l.url.includes(`/${h.kind}/${h.id}`))) return;
    const ex = await tmdbGet(`/${h.kind}/${h.id}/external_ids`).catch(() => ({}));
    const q = encodeURIComponent(h.title);
    const links: Lnk[] = [
      ...(ex.imdb_id ? [{ kind: "imdb", label: "IMDb", url: `https://www.imdb.com/title/${ex.imdb_id}/` }] : []),
      ...(h.kind === "movie" ? [{ kind: "lb", label: "Letterboxd", url: `https://letterboxd.com/tmdb/${h.id}/` }] : []),
      { kind: "tmdb", label: "TMDB", url: `https://www.themoviedb.org/${h.kind}/${h.id}?language=${lang()}` },
      { kind: "wiki", label: tt("Vikipedi"), url: `https://tr.wikipedia.org/w/index.php?search=${encodeURIComponent(`${h.title} ${h.year} ${h.kind === "tv" ? "dizi" : "film"}`)}` },
      { kind: "yt", label: tt("Türkçe fragman"), url: youtubeTrailer(`${h.title} (${h.year})`) },
      { kind: "jw", label: tt("Nerede izlenir (TR)"), url: `https://www.justwatch.com/tr/arama?q=${q}` },
    ];
  toolCtx.media.links.push(...links);
}
/** Other films with exactly this name, when the name alone doesn't say which one (no year given, or the year matches none / several). */
async function sameName(a: any): Promise<Choice[]> {
  const t = String(a?.title ?? "").replace(/\s*\((\d{4})\)\s*$/, "");
  const y = a?.year ? String(a.year) : String(a?.title ?? "").match(/\((\d{4})\)\s*$/)?.[1];
  const k = norm(t).replace(/^(the|a|an) /, "");
  const [m, tv] = await Promise.all([searchTmdb(t, "movie").catch(() => []), searchTmdb(t, "tv").catch(() => [])]);
  const all = [...m, ...tv].filter((x) => norm(x.title).replace(/^(the|a|an) /, "") === k && x.year);
  if (all.length < 2) return [];
  // a year that names exactly one of them is enough to know
  if (y && all.filter((x) => x.year === y).length === 1) return [];
  return all.slice(0, 8).map((x) => ({ id: x.id, kind: x.kind, title: x.title, year: x.year, poster: x.poster, rating: x.rating }));
}
/** TMDB hit for a title the assistant names. */
async function findTitle(a: any): Promise<SearchHit | undefined> {
  const t = String(a?.title ?? "").replace(/\s*\((\d{4})\)\s*$/, "");
  const y = a?.year ? Number(a.year) : Number(String(a?.title ?? "").match(/\((\d{4})\)\s*$/)?.[1]) || undefined;
  // A title Luna already knows (recommendations, lists, library) is that exact film: Letterboxd and TMDB years can differ (festival vs. release)
  const k = seenKey(t);
  const yearOk = (yy?: string) => !y || !yy || Math.abs(Number(yy) - y) <= 0;
  // a series asked for by name isn't the film of the same name Luna happens to know
  const kindOk = (kk?: string) => !a?.kind || (kk ?? "movie") === a.kind;
  const known = loadRecs().find((r) => r.tmdbId && seenKey(r.title) === k && yearOk(r.year) && kindOk(r.kind))
    ?? loadPlaylists().flatMap((p) => p.items).find((x) => x.tmdbId && seenKey(x.title) === k && yearOk(x.year) && kindOk(x.kind));
  if (known?.tmdbId) return { id: known.tmdbId, kind: known.kind ?? "movie", title: known.title, year: known.year ?? "", poster: known.poster ?? null, rating: known.rating };
  const lib = toolCtx.items.find((i) => i.meta?.id && seenKey(i.meta.title) === k && yearOk(i.meta.year) && kindOk(i.meta.kind));
  if (lib?.meta) return { id: lib.meta.id, kind: lib.meta.kind, title: lib.meta.title, year: lib.meta.year, poster: lib.meta.poster };
  if (a?.knownOnly) return undefined;
  const kinds: ("movie" | "tv")[] = a?.kind === "tv" ? ["tv", "movie"] : ["movie", "tv"];
  for (const kd of kinds) {
    const l = await searchTmdb(t, kd, y).catch(() => []);
    const h = l.find((x) => x.poster) ?? l[0];
    if (h) return h;
  }
  if (y) {
    // no hit in that exact year: the closest year (±2) among all hits with this name
    const l = await searchTmdb(t, kinds[0]).catch(() => []);
    const near = l.filter((x) => x.year && Math.abs(Number(x.year) - y) <= 2).sort((p, q) => Math.abs(Number(p.year) - y) - Math.abs(Number(q.year) - y))[0];
    if (near) return near;
  }
  return undefined;
}
// (letters of any script: "東京" or "Москва" must not fold down to nothing)
const norm = (t: string) => t.toLocaleLowerCase("tr").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Runs one tool call from the assistant; returns what happened (for the model and for the user). */
// an empty ask matches all; an ask that is only punctuation matches nothing
const hit = (q: string, ...xs: (string | undefined)[]) => { const n = norm(q); return n ? xs.some((x) => x && norm(x).includes(n)) : !q.trim(); };
/** Every word of the query is somewhere in the fields: "Duke Ellington Solitude" finds “Solitude” by Duke Ellington. */
const hitWords = (q: string, ...xs: (string | undefined)[]) => {
  const words = norm(q).split(" ").filter(Boolean);
  const all = " " + xs.filter(Boolean).map((x) => norm(x!)).join(" ") + " ";
  return words.length > 0 && words.every((w) => all.includes(w));
};
/** YouTube's search chokes on punctuation: letters and digits only. */
const ytQuery = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
/** A real Luna music playlist from YouTube (the film playlist tool is not used for songs). */
async function makeMusicPlaylist(a: any): Promise<string> {
  const who = String(a?.query ?? a?.artist ?? "").trim();
  const count = Math.min(30, Math.max(3, Number(a?.count) || 10));
  const titles: string[] = Array.isArray(a?.titles) ? a.titles.map((x: unknown) => String(x).trim()).filter(Boolean).slice(0, count) : [];
  const name = String(a?.name ?? a?.playlist ?? "").trim() || (who ? `${who} En İyiler` : "Luna Listesi");
  const items: QItem[] = [];
  const missing: string[] = [];
  const notFound: string[] = [];
  const used = new Set<string>();
  const add = (h?: SongHit) => {
    if (!h?.url || used.has(h.url) || items.some((i) => i.src === h.url)) return;
    used.add(h.url);
    items.push({ src: h.url, title: h.title, artist: h.channel, cover: h.thumb, duration: h.duration, yt: true });
  };
  const stop = new Set(["the", "of", "and", "a", "an", "to", "in", "on", "for", "with", "feat", "ft", "official", "video", "audio", "music", "topic", "remastered", "version", "live", "full", "album"]);
  const words = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2 && !stop.has(w));
  const good = (h: SongHit, want: string[]) => {
    if (!want.length) return true;
    const hay = new Set(words(h.title + " " + h.channel));
    return want.filter((w) => hay.has(w)).length / want.length >= 0.75;
  };
  // "1. Song — Artist - Topic" -> song "Song", artist "Artist"
  const parts = (t: string) => {
    const plain = t.replace(/^\s*\d+[.)]\s*/, "").trim();
    const seg = plain.split(/\s+[—–]\s+|\s+-\s+/);
    const song = ytQuery(seg[0] ?? plain) || plain;
    const artist = ytQuery((seg[1] ?? "").replace(/\btopic\b/gi, "")) || "";
    return { song, artist };
  };
  const artistHint = titles.length ? parts(titles[0]).artist : "";
  const nameHint = (ytQuery(name).split(" ")[0] ?? "").toLowerCase();
  const whoQ = ytQuery(who) || artistHint || (titles.length && nameHint !== "luna" ? nameHint : "");
  if (titles.length) {
    const claimed = new Set<string>();
    const found = await Promise.all(titles.map(async (t) => {
      const { song, artist } = parts(t);
      const want = words(song);
      const qs = [...new Set([whoQ && `${song} ${whoQ}`, artist && `${song} ${artist}`, song, t].filter(Boolean) as string[])];
      for (const q of qs) {
        const hits = await invoke<SongHit[]>("yt_search", { query: q, n: 8 }).catch(() => [] as SongHit[]);
        for (const h of hits) {
          if (used.has(h.url) || claimed.has(h.url) || !good(h, want)) continue;
          claimed.add(h.url);
          return { t, h };
        }
      }
      return { t, h: undefined };
    }));
    found.forEach(({ t, h }) => { if (h) add(h); else { missing.push(t); notFound.push(t); } });
  } else if (who) {
    const hits = await invoke<SongHit[]>("yt_search", { query: `${whoQ} top songs`, n: Math.max(count * 2, 20) }).catch(() => [] as SongHit[]);
    hits.slice(0, count).forEach(add);
    if (items.length < count) {
      const more = await invoke<SongHit[]>("yt_search", { query: `${whoQ} songs`, n: Math.max(count * 2, 20) }).catch(() => [] as SongHit[]);
      // only up to the number asked for
      for (const h of more) { if (items.length >= count) break; add(h); }
    }
  }
  // the requested song isn't on YouTube: fill up with the artist's other real tracks
  if (titles.length && whoQ && items.length < count) {
    let filled = 0;
    const key = (whoQ.split(" ")[0] ?? "").toLowerCase();
    const hits = await invoke<SongHit[]>("yt_search", { query: whoQ, n: 30 }).catch(() => [] as SongHit[]);
    for (const h of hits) {
      if (items.length >= count) break;
      if (!h.url || used.has(h.url)) continue;
      if (h.duration && h.duration > 900) continue;
      if (/\b(full album|live|concert|mix|interview|podcast)\b/i.test(h.title)) continue;
      if (key && !(h.title + " " + h.channel).toLowerCase().includes(key)) continue;
      add(h); filled += 1;
    }
    if (filled) missing.splice(0, Math.min(filled, missing.length));
  }
  if (!items.length) return `“${name}” için şarkı bulunamadı (${who || titles.slice(0, 3).join(", ")}).`;
  let chosen = items, listName = name;
  // "add them to my X list": the songs join an existing list (each once) instead of a new one
  const ext = String(a?.extend ?? "").trim();
  let old = ext ? loadMusicPlaylists().find((p) => norm(p.name) === norm(ext)) ?? loadMusicPlaylists().find((p) => hit(ext, p.name)) : undefined;
  if (toolCtx.musicPreview) {
    // the card lets the user choose: a new list or one of theirs grown (the one asked for comes chosen)
    const picked = await toolCtx.musicPreview(name, items, missing, notFound, old?.id);
    if (!picked?.items.length) return "Kullanıcı vazgeçti; liste oluşturulmadı.";
    chosen = picked.items; listName = picked.name;
    old = picked.extend ? loadMusicPlaylists().find((p) => p.id === picked.extend) : undefined;
  }
  if (old) {
    const fresh = chosen.filter((i) => !old.items.some((o) => o.src === i.src));
    saveMusicPlaylists(loadMusicPlaylists().map((p) => (p.id === old.id ? { ...p, items: [...p.items, ...fresh] } : p)));
    toolCtx.setMode?.("music");
    showPlaylist(old.id);
    toolCtx.closeChat?.();
    return `“${old.name}” listesine ${fresh.length} şarkı eklendi: ${fresh.map((i) => i.title).join("; ")}.`;
  }
  const list = { id: "luna-" + Date.now().toString(36), name: listName, from: "Luna", at: Date.now(), items: chosen };
  saveMusicPlaylists([list, ...loadMusicPlaylists()]);
  toolCtx.setMode?.("music");
  showPlaylist(list.id);
  toolCtx.closeChat?.();
  return `“${listName}” çalma listesi oluşturuldu (${chosen.length}${titles.length ? "/" + titles.length : ""} şarkı): ${chosen.map((i) => i.title).join("; ")}.${notFound.length ? ` Bulunamayan: ${notFound.join(", ")}.` : ""} Müzik › Listeler'de.`;
}
async function runMediaTool(name: string, a: any): Promise<string | null> {
  const q = String(a?.query ?? a?.title ?? "").trim();
  if (name === "make_music_playlist" || (name === "add_to_playlist" && toolCtx.mode === "music")) return makeMusicPlaylist(a);
  if (name === "search_film_library") {
    const l = toolCtx.items.filter((i) => hit(q, i.meta?.title, i.parsed.title, i.meta?.title?.replace(/[:\-–].*$/, "")));
    return l.length ? "Film kütüphanesinde: " + l.slice(0, 12).map((i) => `${i.meta?.title ?? i.parsed.title}${i.meta?.year ? ` (${i.meta.year})` : ""} [${i.parsed.kind === "tv" ? "dizi" : "film"}]`).join("; ")
      : `Film kütüphanesinde bulunamadı: ${q}`;
  }
  if (name === "open_playlist") {
    // a film list (own or a friend's) opens on Öneriler, a music list on its own page
    const films = loadPlaylists();
    const fl = films.find((p) => norm(p.name) === norm(q)) ?? films.find((p) => hit(q, p.name));
    const ml = loadMusicPlaylists().find((p) => norm(p.name) === norm(q));
    if (fl && !ml) {
      window.dispatchEvent(new CustomEvent("luna-go", { detail: { place: "film:recs" } }));
      setTimeout(() => window.dispatchEvent(new CustomEvent("luna-open-list", { detail: { id: fl.id } })), 120);
      return `“${fl.name}” film listesi Öneriler'de açıldı (${fl.items.length} film)`;
    }
    const pl = ml ?? loadMusicPlaylists().find((p) => hit(q, p.name));
    if (!pl) return `Böyle bir liste yok: ${q}`;
    goPlaylist(pl.id);
    return `“${pl.name}” listesinin sayfası açıldı (${pl.items.length} şarkı)`;
  }
  if (name === "play_song") {
    const title = String(a?.title ?? a?.query ?? "").trim();
    const artist = String(a?.artist ?? "").trim();
    if (!title) return "Şarkı adı yok";
    const tracks = await loadMusicLibrary();
    const local = tracks.find((t) => hit(title, t.title) && (!artist || hit(artist, t.artist, t.albumArtist)));
    if (local) { playQueue([trackItem(local)]); return `Çalıyor: ${local.title} — ${local.artist}`; }
    // in a Luna list: played inside that list (the next song follows), the artist may be a YouTube channel name
    const inLists = loadMusicPlaylists().flatMap((p) => p.items.map((t, i) => ({ p, t, i })));
    const pl = inLists.find(({ t }) => hit(title, t.title) && (!artist || hitWords(artist, t.artist, t.title)))
      ?? inLists.find(({ t }) => hitWords(`${title} ${artist}`, t.title, t.artist))
      ?? (artist ? undefined : inLists.find(({ t }) => hitWords(title, t.title, t.artist)));
    if (pl) { playQueue(pl.p.items, pl.i, false, pl.p.id); return `Çalıyor: ${pl.t.title} — ${pl.t.artist ?? ""} (“${pl.p.name}” listesinden)`; }
    const query = `${artist} ${title}`.trim();
    const hits = await invoke<SongHit[]>("yt_search", { query, n: 6 }).catch(() => [] as SongHit[]);
    if (!hits.length) return `“${title}” arşivde, listelerde ve YouTube'da bulunamadı.`;
    toolCtx.media.song = { query, hits: hits.slice(0, 3) };
    return `Arşivde ve listelerde yok. YouTube'da buldum; onay kartı gösterildi (“${hits[0].title}”). Kullanıcıya kısaca “Bu şarkı listende yok, YouTube'da buldum; karttan ekleyip çalabilirsin” de. Karta tıklamadan çaldığını söyleme.`;
  }  if (name === "search_music" || name === "play_music") {
    const tracks = await loadMusicLibrary();
    const lists = loadMusicPlaylists();
    // Luna's playlists (Spotify moves…) count as music too, with or without a music folder
    const plHit = q ? lists.find((p) => norm(p.name) === norm(q)) ?? lists.find((p) => hit(q, p.name)) : undefined;
    const inLists = q ? lists.flatMap((p) => p.items.map((t, i) => ({ p, t, i }))).filter(({ t }) => hit(q, t.title, t.artist) || hitWords(q, t.title, t.artist)) : [];
    if (name === "play_music" && plHit && a?.what !== "song" && a?.what !== "artist") { playQueue(plHit.items, 0, false, plHit.id); return `Çalıyor: “${plHit.name}” listesi (${plHit.items.length} şarkı)`; }
    if (!tracks.length && !lists.length) return loadMusicFolders().length ? "Müzik arşivi boş" : "Kullanıcı henüz müzik klasörü eklememiş ve listesi yok (Müzik › Kütüphanem › Klasör, ya da bağlantıdan bir Spotify listesi)";
    const albums = groupAlbums(tracks);
    if (name === "search_music") {
      const al = albums.filter((x) => hit(q, x.title, x.artist));
      const so = tracks.filter((t) => hit(q, t.title)).slice(0, 15);
      const pls = q ? lists.filter((p) => hit(q, p.name)) : lists;
      if (q && !al.length && !so.length && !pls.length && !inLists.length) return `Müzik arşivinde bulunamadı: ${q}`;
      return [`Arşiv: ${tracks.length} şarkı, ${albums.length} albüm. Luna'daki listeler: ${lists.length}.`,
        al.length ? "Albümler: " + al.slice(0, 40).map((x) => `${x.artist} — ${x.title}${x.year ? ` (${x.year})` : ""}`).join("; ") : "",
        q && so.length ? "Şarkılar: " + so.map((t) => `${t.title} (${t.artist})`).join("; ") : "",
        pls.length ? "Listeler: " + pls.slice(0, 30).map((p) => `${p.name} (${p.items.length} şarkı)`).join("; ") : "",
        inLists.length ? "Listelerdeki şarkılar: " + inLists.slice(0, 15).map(({ p, t }) => `${t.title} (${t.artist ?? ""}) — “${p.name}” listesinde`).join("; ") : ""].filter(Boolean).join("\n");
    }
    const what = a?.what as string | undefined;
    if (!tracks.length || (q && !tracks.some((t) => hit(q, t.title, t.artist, t.album, t.albumArtist)))) {
      if (inLists.length) { const { p, i } = inLists[0]; playQueue(p.items, i, false, p.id); return `Çalıyor: ${p.items[i].title} — ${p.items[i].artist ?? ""} (“${p.name}” listesinden)`; }
      if (!tracks.length) return q ? await runMediaTool("play_song", { title: q }) ?? `Listelerde bulunamadı: ${q}` : "Arşiv boş; bir liste adı söyle";
    }
    if (!q || what === "shuffle") { playQueue(tracks.map(trackItem), 0, true); return `Arşivin karışık çalıyor (${tracks.length} şarkı)`; }
    const album = what !== "song" && what !== "artist" ? albums.find((x) => norm(x.title) === norm(q)) ?? albums.find((x) => hit(q, x.title)) : undefined;
    if (album) { playQueue(album.tracks.map(trackItem)); return `Çalıyor: ${album.artist} — ${album.title}`; }
    const byArtist = what !== "song" ? tracks.filter((t) => hit(q, t.artist, t.albumArtist)) : [];
    if (byArtist.length) { playQueue(byArtist.map(trackItem), 0, true); return `Çalıyor: ${byArtist[0].albumArtist || byArtist[0].artist} (${byArtist.length} şarkı, karışık)`; }
    const song = tracks.findIndex((t) => hit(q, t.title));
    if (song >= 0) { const al2 = albums.find((x) => x.tracks.includes(tracks[song]))!; playQueue(al2.tracks.map(trackItem), al2.tracks.indexOf(tracks[song])); return `Çalıyor: ${tracks[song].title} — ${tracks[song].artist}`; }
    return what !== "album" && what !== "artist" ? await runMediaTool("play_song", { title: q }) ?? `Arşivde bulunamadı: ${q}` : `Arşivde bulunamadı: ${q}`;
  }
  if (name === "player_control") return "Yapıldı: " + playerControl(String(a?.action ?? "") as PlayerAct, a?.value == null ? undefined : Number(a.value));
  if (name === "play_radio") {
    const l = await findStations(q).catch(() => [] as QItem[]);
    if (!l.length) return `Radyo bulunamadı: ${q}`;
    playQueue([l[0]]);
    return `Canlı radyo açıldı: ${l[0].title}${l[0].artist ? ` (${l[0].artist})` : ""}`;
  }
  if (name === "play_podcast") {
    const p = await findPodcast(q).catch(() => null);
    if (!p?.items.length) return `Podcast bulunamadı: ${q}`;
    playQueue(p.items);
    return `Çalıyor: ${p.show.title} — ${p.items[0].title}`;
  }
  if (name === "search_books" || name === "open_book") {
    const books = await loadBookLibrary();
    const recent = store.json<string[]>("bookRecent", []);
    const pctOf = (path: string) => Math.round((getPos(path)?.pct ?? 0) * 100);
    const abHits = loadAbRecent().filter((a) => !q || hit(q, abTitle(a.title), abAuthor(a)));
    if (name === "search_books") {
      const l = books.filter((b) => hit(q, b.title, b.author));
      const out = [
        ...l.slice(0, 60).map((b) => `${b.title}${b.author ? " — " + b.author : ""} [${b.kind}, %${pctOf(b.path)}]`),
        ...abHits.slice(0, 12).map((a) => `${abTitle(a.title)}${abAuthor(a) ? " — " + abAuthor(a) : ""} [sesli kitap]`),
      ];
      return out.length ? out.join("\n") : (books.length || loadAbRecent().length ? `Kitaplıkta bulunamadı: ${q}` : "Kullanıcının kitaplığı boş (Kitap › Kitaplığım › Klasör ekle ya da Keşfet'ten ücretsiz kitap)");
    }
    const b = q ? books.find((x) => norm(x.title) === norm(q)) ?? books.find((x) => hit(q, x.title, x.author)) : books.find((x) => x.path === recent[0]);
    if (!b) {
      if (abHits[0]) return `“${abTitle(abHits[0].title)}” bir sesli kitap (LibriVox); dinlemek için play_audiobook kullan.`;
      return `Kitaplıkta bulunamadı: ${q}. Ücretsiz bir baskısı için find_free_books dene.`;
    }
    toolCtx.setMode?.("books");
    setTimeout(() => requestOpenBook(b), 60);
    return `Açılıyor: ${b.title}${b.author ? " — " + b.author : ""} (%${pctOf(b.path)})`;
  }
    if (name === "find_free_books") {
    // every free source at once (each may be slow or down): Gutenberg, Vikikaynak, the user's catalogs
    type Hit = BookAsk["hits"][number];
    const within = <X,>(p: Promise<X>, ms = 15000) => Promise.race([p, new Promise<X>((_, no) => setTimeout(() => no(new Error("timeout")), ms))]);
    const fromEntries = (from: string, l: OEntry[]): Hit[] => l.flatMap((e) => {
      const a = e.acq.find((x) => x.open && /epub/i.test(x.type)) ?? e.acq.find((x) => x.open);
      return a ? [{ id: from + ":" + e.id, title: e.title, author: e.author, cover: e.cover, url: a.href, kind: kindOf(a.type), from }] : [];
    });
    const turkish = /[çğıöşüÇĞİÖŞÜ]/.test(q) || lang() === "tr";
    const sources: [string, Promise<Hit[]>][] = [
      ["Vikikaynak", wikisourceBooks("tr", q).then((l) => fromEntries("Vikikaynak", l))],
      ["Project Gutenberg", fetchFeed(gutenbergSearch(q)).then((f) => fromEntries("Project Gutenberg", gutenbergBooks(f)))],
      ...loadSources().map((s): [string, Promise<Hit[]>] => [s.name, (async () => {
        const root = await fetchFeed(s.url);
        const u = await searchUrl(root, q);
        return u ? fromEntries(s.name, (await fetchFeed(u)).entries) : [];
      })()]),
    ];
    const got = await Promise.allSettled(sources.map(([, p]) => within(p)));
    const per = got.map((r, i) => ({ from: sources[i][0], hits: r.status === "fulfilled" ? r.value : [], failed: r.status === "rejected" }));
    // the best match first: the words asked for in the title or the author, then the source (Turkish first for Turkish)
    const score = (h: Hit) => (hitWords(q, h.title, h.author) ? 0 : 2) + (h.from === "Vikikaynak" ? (turkish ? 0 : 1) : h.from === "Project Gutenberg" ? (turkish ? 1 : 0) : 1);
    const all = per.flatMap((x) => x.hits.slice(0, 6)).sort((x, y) => score(x) - score(y));
    if (all.length) toolCtx.media.book = { query: q, hits: all.slice(0, 8) };
    // already in the library: the card shows "Read" at once instead of a second download
    if (all.length) { const lib = await loadBookLibrary().catch(() => [] as Book[]); for (const h of toolCtx.media.book!.hits) { const b = lib.find((x) => norm(x.title) === norm(h.title)); if (b && !store.get("freeBook:" + h.url)) store.set("freeBook:" + h.url, JSON.stringify(b)); } }
    const looked = per.map((x) => `${x.from}: ${x.failed ? "ulaşılamadı" : x.hits.length + " sonuç"}`).join(", ");
    return all.length ? `Bakılan kaynaklar: ${looked}. Kullanıcıya en iyi eşleşme için “Bu kitap mı?” kartı gösterildi (Evet, kaydet → Oku; “Başka baskı” ile diğerleri). Kısaca hangi kaynakta bulduğunu söyle ve karttan kaydedebileceğini belirt; kullanıcı karta tıklamadan indirdiğini söyleme. Bulunanlar:\n` + all.slice(0, 12).map((h) => `${h.title}${h.author ? " — " + h.author : ""} (${h.from}) [url ${h.url}]`).join("\n")
      : `Hiçbir ücretsiz kaynakta bulunamadı (${looked}). Telifli bir kitap olabilir; kullanıcıya kütüphanesine ya da bir kitapçıya bakmasını söyle, korsan kaynak önerme.`;
  }
  if (name === "get_free_book") {
    const id = String(a?.gutenberg_id ?? "").replace(/\D/g, "");
    const url = String(a?.url ?? "") || (id ? `https://www.gutenberg.org/ebooks/${id}.epub3.images` : "");
    if (!url) return "Kitabın adresi yok; önce find_free_books ile ara";
    toolCtx.setMode?.("books");
    await fetchAndOpenBook(url, String(a?.title ?? "Book"), String(a?.author ?? ""), "epub");
    return `İndirildi ve açılıyor: ${a?.title}`;
  }
  if (name === "go_to") {
    const place = String(a?.place ?? "");
    const id = a?.collection ? collectionId(String(a.collection)) : undefined;
    toolCtx.closeChat?.();
    setTimeout(() => goPlace(place, id), 60);
    return `Gidildi: ${place}${id ? " (" + a.collection + ")" : ""}. Asistan kapandı; kısaca “Götürdüm” de.`;
  }
  if (name === "make_collection") {
    const items = collectionItems(a);
    // what can be had is joined to its name: a film in the library, a song found on YouTube, a free book
    const within = <X,>(p: Promise<X>, ms: number) => Promise.race([p, new Promise<X>((_, no) => setTimeout(() => no(new Error("timeout")), ms))]);
    const lib = await loadBookLibrary().catch(() => [] as Book[]);
    let songs = 0, free = 0;
    // a few at a time: a complete collection can have dozens of songs to look up
    const queue = items.slice(0, 80);
    const one = async (x: CItem) => {
      if (x.kind === "film") {
        const it = libMatch(toolCtx.items, { title: x.title, year: x.year });
        if (it) x.path = it.files[0].path;
      } else if (x.kind === "music") {
        const h = (await within(invoke<SongHit[]>("yt_search", { query: `${x.by ?? ""} ${x.title}`.trim(), n: 1 }), 12000))[0];
        if (h) { x.src = h.url; x.cover = h.thumb; songs++; }
      } else {
        const own = lib.find((b) => norm(b.title) === norm(x.title));
        if (own) { x.path = own.path; return; }
        const found = (await Promise.allSettled([within(wikisourceBooks("tr", x.title), 12000), within(fetchFeed(gutenbergSearch(x.title)).then(gutenbergBooks), 12000)]))
          .flatMap((r, i) => (r.status === "fulfilled" ? r.value.map((e) => ({ e, from: i ? "Project Gutenberg" : "Vikikaynak" })) : []));
        const hit = found.find(({ e }) => norm(e.title).startsWith(norm(x.title)) || norm(x.title).startsWith(norm(e.title)));
        const acq = hit?.e.acq.find((q) => q.open);
        if (hit && acq) { x.url = acq.href; x.from = hit.from; x.cover ??= hit.e.cover; free++; }
      }
    };
    await Promise.allSettled(Array.from({ length: 6 }, async () => { for (let x = queue.shift(); x; x = queue.shift()) await one(x).catch(() => {}); }));
    const name_ = String(a?.name ?? "").trim() || tt("Koleksiyon");
    const n = addToCollection(name_, items, a?.about ? String(a.about) : undefined);
    // the user is taken to the collection (the answer stays in the chat)
    const cid = collectionId(name_);
    setTimeout(() => { toolCtx.closeChat?.(); goPlace("collections", cid); }, 1800);
    return `“${name_}” koleksiyonuna ${n} öğe eklendi (${items.length - n} tanesi zaten vardı). ${songs} şarkı YouTube'da bulunup çalınabilir hâle getirildi; ${free} kitabın ücretsiz baskısı bulundu (koleksiyondan indirilebilir); kütüphanede olmayanlar ad olarak kaydedildi.${a?._added?.length ? ` TMDB'ye bakılınca serinin eksik filmleri de eklendi: ${a._added.join(", ")} (çıkmamış olanların notunda "Çıkması bekleniyor" yazar).` : ""}${a?._dropped?.length ? ` Kullanıcı onay kartında şunları ÇIKARDI, eklenmedi (bunları eklenmiş gibi anlatma, tekrar önerme): ${a._dropped.join(", ")}.` : ""} Kullanıcıya kısaca söyle; üst çubuktaki Koleksiyonlar'dan açabilir.`;
  }
  if (name === "play_audiobook") {
    const l = await librivox(q);
    if (!l.length) return `Sesli kitap bulunamadı: ${q}`;
    const ch = await abChapters(l[0]);
    if (!ch.length) return "Bu sesli kitabın dosyaları alınamadı";
    rememberAb(l[0]);
    playQueue(ch, Math.min(Number(store.get("abPos:" + l[0].identifier) ?? 0), ch.length - 1));
    return `Çalıyor: ${abTitle(l[0].title)} — ${abAuthor(l[0])} (${ch.length} bölüm)`;
  }
  return null;
}

/** The one library file the assistant's rename means; a string listing the choices when it's not clear. */
function renameMatches(a: any): string[] {
  const q = String(a?.title ?? "").trim().toLowerCase();
  const it = libMatch(toolCtx.items, { title: String(a?.title ?? ""), year: a?.year });
  let files = it ? it.files.map((f) => f.path) : toolCtx.items.flatMap((i) => i.files.map((f) => f.path)).filter((p) => q && p.split(/[\\/]/).pop()!.toLowerCase().includes(q));
  files = files.filter((p) => !/^[a-z][a-z0-9+.-]*:\/\//i.test(p));
  const part = String(a?.file ?? "").trim().toLowerCase();
  if (part && files.length > 1) files = files.filter((p) => p.split(/[\\/]/).pop()!.toLowerCase().includes(part));
  return files;
}
const renameTarget = (a: any) => { const l = renameMatches(a); return l.length === 1 ? l[0] : null; };

async function runTool(name: string, a: any): Promise<string> {
  const media = await runMediaTool(name, a);
  if (media != null) return media;
  if (name === "delete_music") {
    const l = await musicTargets(a);
    if (!l.length) return "Müzik arşivinde bulunamadı";
    const paths = l.map((t) => t.path);
    if (a?._how === "file") {
      const r = await trashFiles(paths);
      forgetTracks(paths.filter((p) => !r.failed.includes(p)));
      return r.failed.length ? `${r.n}/${paths.length} dosya silindi; ${r.failed.length} dosya silinemedi.` : `Silindi: ${r.n} dosya Geri Dönüşüm Kutusu'na taşındı (oradan geri alınabilir).`;    }
    const gone = new Set(paths);
    saveMusicPlaylists(loadMusicPlaylists().map((p) => ({ ...p, items: p.items.filter((t) => !gone.has(t.src)) })));
    return "Listelerinden çıkarıldı; dosyalar yerinde duruyor.";
  }
  if (name === "delete_book") {
    const b = await bookTarget(a);
    if (!b) return "Kitaplıkta bulunamadı";
    if (a?._how === "file") {
      const r = await trashFiles([b.path]);
      if (r.failed.length) return "Silinemedi: " + b.path;
      clearBookRecord(b);
      forgetBooks();
      return `Silindi: “${b.title}” Geri Dönüşüm Kutusu'na taşındı (oradan geri alınabilir).`;
    }
    clearBookRecord(b);
    return `“${b.title}” için okuma kaydı silindi; dosya yerinde duruyor.`;
  }
  if (name === "rename_file") {
    const l = renameMatches(a);
    if (!l.length) return "Kütüphanede böyle bir dosya bulunamadı";
    if (l.length > 1) return `Birden çok dosya var; file ile hangisi olduğunu belirt ya da kullanıcıya sor: ${l.slice(0, 12).map((p) => p.split(/[\\/]/).pop()).join("; ")}`;
    try {
      const to = await renameVideo(l[0], String(a?.new_name ?? ""));
      return `Adı değiştirildi: ${l[0].split(/[\\/]/).pop()} → ${to.split(/[\\/]/).pop()}`;
    } catch (e) { return `Adı değiştirilemedi: ${String(e).replace(/^Error: /, "")}`; }
  }
  if (name === "delete_from_library") {
    const it = libMatch(toolCtx.items, { title: String(a?.title ?? ""), year: a?.year });
    if (!it) return "Kütüphanede bulunamadı";
    if (!toolCtx.remove) return "Bu işlem burada yapılamıyor";
    if (a?._how === "ok") return "Silinecek bir şey bulunamadı";
    return await toolCtx.remove(it.files.map((f) => f.path), a?._how === "file" ? "file" : "recent");
  }
  if (name === "rate_title") {
    const t = String(a?.title ?? "").trim();
    if (!t) return "Başlık yok";
    const patch: Partial<DiaryEntry> = { watched: diaryGet(t, a?.year)?.watched ?? Date.now() };
    if (a?.vote) patch.vote = a.vote === "none" ? undefined : a.vote;
    if (a?.rating) patch.rating = Math.max(1, Math.min(10, Math.round(Number(a.rating))));
    if (a?.note) patch.note = String(a.note);
    diarySet(t, a?.year, patch);
    return `Zevk defterine yazıldı: ${t}${patch.vote ? " · " + (patch.vote === "like" ? "beğendin" : "beğenmedin") : ""}${patch.rating ? " · " + patch.rating + "/10" : ""}`;
  }
  if (name === "remove_recommendations") {
    const who = String(a?.from ?? "").trim().toLocaleLowerCase("tr");
    const cleanTitle = (x: string) => seenKey(x.replace(/\s*\(\d{4}\)\s*$/, ""));
    // "Dune (1984)" removes only that one, not Dune (2021)
    const wanted = (a?.titles ?? []).map((x: string) => ({ k: cleanTitle(x), y: String(x).match(/\((\d{4})\)\s*$/)?.[1] }));
    const named = (r: { title: string; year?: string }) => wanted.some((w: { k: string; y?: string }) => w.k === cleanTitle(r.title) && (!w.y || !r.year || w.y === r.year));
    const before = loadRecs();
    const keep = before.filter((r) => {
      if (who && r.from.toLocaleLowerCase("tr") !== who) return true;
      const d = diaryGet(r.title, r.year);
      switch (a?.which) {
        case "all": return false;
        case "disliked": return !(r.vote === "dislike" || d?.vote === "dislike" || (d?.rating && d.rating <= 4));
        case "watched": return !(r.status === "watched" || d?.watched);
        case "dismissed": return r.status !== "dismissed";
        case "titles": return !named(r);
        default: return true;
      }
    });
    saveRecs(keep);
    let extra = "";
    if (who && a?.which === "all") {
      const pls = loadPlaylists();
      const folder = pls.find((p) => !p.parent && p.name.toLocaleLowerCase("tr") === who);
      if (folder) {
        const gone = pls.filter((p) => p.id === folder.id || p.parent === folder.id);
        savePlaylists(pls.filter((p) => !gone.includes(p)));
        extra = ` · Listelerim'deki “${folder.name}” klasörü de silindi (${gone.length - 1} liste, ${gone.reduce((n, p) => n + p.items.length, 0)} film)`;
      }
    } else if (who) {
      const folder = loadPlaylists().find((p) => !p.parent && p.name.toLocaleLowerCase("tr") === who);
      if (folder) extra = ` · Not: Listelerim'de bu kişinin “${folder.name}” klasörü de var; silmek için which=all kullan.`;
    }
    return `${before.length - keep.length} öneri silindi${extra}`;
  }
  if (name === "read_link") {
    try { return await readLink(String(a?.url ?? "")); } catch (e) { return "Bağlantı okunamadı: " + String(e); }
  }
  if (name === "import_link") {
    const who = String(a?.from ?? "").trim();
    if (!who) return "EKLENMEDİ: kimin önerdiği bilinmiyor. Kullanıcıya sor.";
    const url = String(a?.url ?? "");
    try {
      let films: TaggedFilm[];
      if (isLetterboxd(url)) {
        const secs = await readLetterboxd(url, 80);
        const want = String(a?.section ?? "all");
        const pick = secs.filter((sc) => want === "all" || (want === "lists" ? sc.kind === "list" : sc.kind === want));
        films = lbFlatten(pick).filter((f) => !a?.min_stars || (f.stars ?? 0) >= Number(a.min_stars));
      } else {
        films = await extractTitles(await invoke<string>("fetch_page_text", { url }));
      }
      const n = addRecommendationsBulk(films, who);
      return `${films.length} film bulundu, ${n} tanesi ${who} önerisi olarak eklendi${films.length - n ? ` (${films.length - n} tanesi zaten vardı)` : ""}`;
    } catch (e) { return "Bağlantı okunamadı: " + String(e); }
  }
  if (name === "follow_letterboxd") {
    const who = String(a?.person ?? "").trim();
    if (!who) return "Kişi adı yok: kullanıcıya bunun kimin hesabı olduğunu sor.";
    try { return await followLetterboxd(who, String(a?.url ?? "")); } catch (e) { return "Letterboxd okunamadı: " + String(e); }
  }
  if (name === "refresh_playlists") return await refreshLinkedPlaylists().catch((e) => String(e).replace(/^Error: /, ""));
  if (name === "list_playlists") {
    const l = loadPlaylists();
    const nameOf = (p: Playlist) => (p.parent ? `${l.find((x) => x.id === p.parent)?.name ?? "?"} › ` : "") + p.name;
    return l.length ? l.map((p) => `${nameOf(p)}${p.source ? " [Letterboxd'a bağlı]" : ""}: ${p.items.slice(0, 200).map((x) => x.title + (x.year ? ` (${x.year})` : "") + (x.stars ? ` ★${x.stars}` : "")).join(", ") || "(boş)"}`).join("\n") : "Hiç liste yok";
  }
  if (name === "add_to_playlist") {
    const pl = String(a?.playlist ?? "").trim();
    if (!pl) return "Liste adı yok";
    if (ambiguous(loadPlaylists(), pl)) return `Bu adda birden çok liste var; “Arkadaş › ${pl}” biçiminde söyle`;
    const target = resolvePl(loadPlaylists(), pl);
    if (target && friendsList(target, loadPlaylists())) return `“${target.name}” bir arkadaşın listesi; arkadaşların listelerine dokunulmaz. Kullanıcının kendi listelerinden birine ya da yeni bir listeye ekle.`;
    const n = await addToPlaylist(pl, (a?.titles ?? []).map((t: string) => ({ title: t })));
    return `“${pl}” listesine ${n} film eklendi`;
  }
  if (name === "remove_from_playlist") {
    const all = loadPlaylists();
    if (ambiguous(all, String(a?.playlist ?? ""))) return "Bu adda birden çok liste var; “Arkadaş › Liste” biçiminde söyle";
    const pl = resolvePl(all, String(a?.playlist ?? ""));
    if (!pl) return "Liste bulunamadı";
    if (friendsList(pl, all)) return `“${pl.name}” bir arkadaşın listesi; arkadaşların listelerine dokunulmaz.`;
    const wanted:{ key: string; year?: string }[] = (a?.titles ?? []).map((raw: string) => {
      const m = String(raw).match(/^(.*?)\s*\((\d{4})\)\s*$/);
      return { key: seenKey(m ? m[1] : String(raw)), year: m ? m[2] : undefined };
    });
    const before = pl.items.length;
    const done = new Set<string>();
    pl.items = pl.items.filter((x) => {
      const k = seenKey(x.title);
      const want = wanted.find((w) => w.key === k && (!w.year || String(x.year ?? "") === w.year));
      if (!want) return true;
      if (!want.year) { if (done.has(k)) return true; done.add(k); }
      return false;
    });
    savePlaylists(all);
    return `“${pl.name}” listesinden ${before - pl.items.length} film çıkarıldı`;
  }
    if (name === "delete_playlist") {
    const all = loadPlaylists();
    if (ambiguous(all, String(a?.playlist ?? ""))) return "Bu adda birden çok liste var; “Arkadaş › Liste” biçiminde söyle";
    const pl = resolvePl(all, String(a?.playlist ?? ""));
    if (!pl) return "Liste bulunamadı";
    if (a?.new_name) { pl.name = String(a.new_name); savePlaylists(all); return `Liste adı değişti: ${pl.name}`; }
    const kids = all.filter((p) => p.parent === pl.id);
    savePlaylists(all.filter((p) => p !== pl && p.parent !== pl.id));
    return `“${pl.name}” listesi silindi${kids.length ? ` (içindeki ${kids.length} liste de)` : ""}`;
  }
  if (name === "list_recommendations") {
    const who = String(a?.from ?? "").trim().toLocaleLowerCase("tr");
    const l = loadRecs().filter((r) => !who || r.from.toLocaleLowerCase("tr") === who);
    if (!l.length) return "Liste boş";
    return l.map((r) => `${r.title}${r.year ? ` (${r.year})` : ""} — ${r.from}${r.note ? ` · not: “${r.note}”` : ""} · ${r.status === "watched" ? "izlendi" : r.status === "dismissed" ? "ilgilenmiyor" : "bakılmadı"}${r.vote ? ` · kullanıcı ${r.vote === "like" ? "beğendi" : "beğenmedi"}` : ""}${r.tags?.length ? ` · ${r.from}'in Letterboxd'unda: ${r.tags.join(", ")}` : ""}${r.stars ? ` · ${r.from} ★${r.stars}` : ""}${r.rating ? ` · TMDB ${r.rating}` : ""}`).join("\n");
  }
  if (name === "update_recommendation") {
    const t = seenKey(String(a?.title ?? "").replace(/\s*\(\d{4}\)\s*$/, ""));
    const all = loadRecs();
    const r = all.find((x) => seenKey(x.title) === t && (!a?.year || !x.year || x.year === String(a.year)))
      // a partial name only when it's long enough to mean one film ("Up" must not hit "Upgrade")
      ?? (t.length >= 6 ? all.find((x) => (!a?.year || !x.year || x.year === String(a.year)) && (seenKey(x.title).includes(t) || (seenKey(x.title).length >= 6 && t.includes(seenKey(x.title))))) : undefined);
    if (!r) return `Önerilerde bulunamadı: ${a?.title}`;
    const changes: string[] = [];
    if (a?.new_title) { r.title = String(a.new_title); changes.push("ad"); }
    if (a?.new_year) { r.year = String(a.new_year); changes.push("yıl"); }
    if (a?.new_title || a?.new_year) { delete r.tmdbId; delete r.poster; delete r.rating; delete r.noPoster; }
    if (a?.from) { r.from = String(a.from); changes.push("öneren"); }
    if (a?.note != null) { r.note = String(a.note); changes.push("not"); }
    if (a?.status) { r.status = a.status === "open" ? undefined : a.status; changes.push("durum"); }
    if (a?.vote) { r.vote = a.vote === "none" ? undefined : a.vote; changes.push("beğeni"); }
    if ((a?.new_title || a?.new_year) && store.get("tmdbKey")) {
      const h = (await searchTmdb(r.title, r.kind, r.year ? Number(r.year) : undefined).catch(() => []))[0];
      const tv = h ? undefined : (await searchTmdb(r.title, "tv", r.year ? Number(r.year) : undefined).catch(() => []))[0];
      const m = h ?? tv;
      if (m) { r.tmdbId = m.id; r.kind = m.kind; r.poster = m.poster; r.rating = m.rating; r.year = r.year || m.year; }
    }
    saveRecs(all);
    if (a?.vote || a?.status === "watched") diarySet(r.title, r.year, { ...(a?.vote ? { vote: a.vote === "none" ? undefined : a.vote } : {}), ...(a?.status === "watched" ? { watched: Date.now() } : {}) });
    return `Güncellendi: ${r.title}${changes.length ? " (" + changes.join(", ") + ")" : ""}`;
  }
  if (name === "sort_recommendations") {
    const who = String(a?.from ?? "").trim().toLocaleLowerCase("tr");
    const all = loadRecs();
    const mine = all.filter((r) => !who || r.from.toLocaleLowerCase("tr") === who);
    const rest = all.filter((r) => !mine.includes(r));
    if (a?.by === "rating") {
      for (const r of mine) if (r.rating == null && store.get("tmdbKey")) {
        const h = (await searchTmdb(r.title, r.kind, r.year ? Number(r.year) : undefined).catch(() => []))[0];
        if (h) r.rating = h.rating;
      }
      mine.sort((x, y) => (y.rating ?? 0) - (x.rating ?? 0));
    } else if (a?.by === "year") {
      mine.sort((x, y) => Number(y.year ?? 0) - Number(x.year ?? 0));
    } else {
      const order: string[] = (a?.order ?? []).map((x: string) => seenKey(x.replace(/\s*\(\d{4}\)\s*$/, "")));
      const pos = (r: Rec) => { const i = order.indexOf(seenKey(r.title)); return i < 0 ? 999 : i; };
      mine.sort((x, y) => pos(x) - pos(y));
    }
    saveRecs([...mine, ...rest]);
    return `Öneriler sıralandı (${a?.by === "rating" ? "TMDB puanı" : a?.by === "year" ? "yıl" : "zevkine göre"})`;
  }
  if (name === "remember_note") {
    const n = String(a?.note ?? "").trim();
    if (!n) return "Not boş";
    const cur = loadNotes();
    if (!cur.some((x) => seenKey(x) === seenKey(n))) saveNotes([...cur, n]);
    return `Not alındı: ${n}`;
  }
  if (name === "forget_note") {
    const raw = String(a?.note ?? "").trim();
    const n = seenKey(raw);
    if (!n) return "Not boş; silinecek bir not yok.";
    const cur = loadNotes();
    // short notes only match exactly: one letter must never wipe every note that contains it
    const keep = n.length < 3
      ? cur.filter((x) => seenKey(x) !== n)
      : cur.filter((x) => !seenKey(x).includes(n) && !n.includes(seenKey(x)));
    if (keep.length === cur.length) return "Bu not bulunamadı.";
    saveNotes(keep);
    return `${cur.length - keep.length} not silindi`;
  }
  if (name === "show_film") {
    let h: SearchHit | undefined = a?.tmdb_id ? { id: Number(a.tmdb_id), kind: a?.kind === "tv" ? "tv" : "movie", title: String(a?.title ?? ""), year: String(a?.year ?? ""), poster: null } : undefined;
    // a film Luna already has (recommendation, list, library) is exactly that one
    if (!h) h = await findTitle({ ...a, knownOnly: true });
    if (!h && !a?.exact) {
      const same = await sameName(a);
      if (same.length > 1) {
        toolCtx.media.choices = same;
        return `“${a?.title}” adında ${same.length} farklı yapım var (${same.map((c) => `${c.title} ${c.year}`).join(", ")}). Sohbette seçim kartları gösterildi; kullanıcıya hangisini kastettiğini sor, sayfa açma.`;
      }
    }
    h = h ?? await findTitle(a);
    if (!h) return `TMDB'de bulunamadı: ${a?.title}`;
    const [d, cr, im] = await Promise.all([
      tmdbGet(`/${h.kind}/${h.id}`, { language: locale() }),
      tmdbGet(`/${h.kind}/${h.id}/credits`, { language: "en-US" }).catch(() => ({})),
      tmdbGet(`/${h.kind}/${h.id}/images`, { include_image_language: "null,en" }).catch(() => ({})),
    ]);
    let overview: string = d.overview ?? "";
    if (!overview) overview = (await tmdbGet(`/${h.kind}/${h.id}`, { language: "en-US" }).catch(() => ({}))).overview ?? "";
    const dirs = ((cr as any).crew ?? []).filter((c: any) => c.job === "Director");
    const director = dirs.map((c: any) => c.name).join(", ") || (d.created_by ?? []).map((c: any) => c.name).join(", ");
    toolCtx.media.film = {
      id: h.id, kind: h.kind, title: d.title ?? d.name ?? h.title, original: d.original_title ?? d.original_name, year: (d.release_date ?? d.first_air_date ?? "").slice(0, 4),
      overview, genres: (d.genres ?? []).map((g: any) => g.name), rating: d.vote_average ? Math.round(d.vote_average * 10) / 10 : undefined,
      runtime: d.runtime ?? d.episode_run_time?.[0], poster: d.poster_path, backdrop: d.backdrop_path, director, tagline: d.tagline || undefined,
    };
    // the year the user / Letterboxd knows it by, when TMDB dates it differently (festival vs. release)
    const asked = String(a?.year ?? String(a?.title ?? "").match(/\((\d{4})\)\s*$/)?.[1] ?? h.year ?? "");
    if (asked && toolCtx.media.film.year && asked !== toolCtx.media.film.year) toolCtx.media.film.altYear = asked;
    toolCtx.media.people.push(...[...dirs.slice(0, 2).map((c: any) => ({ name: c.name, role: tt("Yönetmen"), photo: c.profile_path, url: `https://www.themoviedb.org/person/${c.id}?language=${lang()}` })),
      ...((cr as any).cast ?? []).slice(0, 12).map((c: any) => ({ name: c.name, role: c.character, photo: c.profile_path, url: `https://www.themoviedb.org/person/${c.id}?language=${lang()}` }))]);
    toolCtx.media.images.push(...(((im as any).backdrops ?? []) as any[]).sort((x, y) => (y.vote_average ?? 0) - (x.vote_average ?? 0)).slice(1, 6)
      .map((x) => ({ src: `${IMG}w780${x.file_path}`, full: `${IMG}original${x.file_path}`, caption: `${h.title}${h.year ? ` (${h.year})` : ""}` })));
    await addLinks(h).catch(() => {});
    return `${toolCtx.media.film.title} (${toolCtx.media.film.year}) sayfası sohbette açıldı: afiş, hikaye, yönetmen (${director}), oyuncular, sahneler, bağlantılar. Bunları tekrar listeleme; 2-4 cümleyle kendi yorumunu ve kullanıcının zevkine uyup uymadığını yaz.`;
  }
  if (name === "show_images") {
    const h = await findTitle(a);
    if (!h) return `TMDB'de bulunamadı: ${a?.title}`;
    const what = String(a?.what ?? "scenes");
    await addLinks(h).catch(() => {});
    if (what === "cast") {
      const cr = await tmdbGet(`/${h.kind}/${h.id}/credits`, { language: "en-US" });
      const dirs = (cr.crew ?? []).filter((c: any) => c.job === "Director").slice(0, 2);
      const faces: Face[] = [...dirs.map((c: any) => ({ name: c.name, role: tt("Yönetmen"), photo: c.profile_path, url: `https://www.themoviedb.org/person/${c.id}?language=${lang()}` })),
        ...(cr.cast ?? []).slice(0, 10).map((c: any) => ({ name: c.name, role: c.character, photo: c.profile_path, url: `https://www.themoviedb.org/person/${c.id}?language=${lang()}` }))];
      toolCtx.media.people.push(...faces);
      const sc = await tmdbGet(`/${h.kind}/${h.id}/images`, { include_image_language: "null,en" }).catch(() => ({}));
      toolCtx.media.images.push(...((sc as any).backdrops ?? []).sort((x: any, y: any) => (y.vote_average ?? 0) - (x.vote_average ?? 0)).slice(0, 5)
        .map((x: any) => ({ src: `${IMG}w780${x.file_path}`, full: `${IMG}original${x.file_path}`, caption: `${h.title}${h.year ? ` (${h.year})` : ""}` })));
      return `${h.title} kadrosu gösterildi: ${faces.map((f) => `${f.name}${f.role ? ` (${f.role})` : ""}`).join(", ")}`;
    }
    const im = await tmdbGet(`/${h.kind}/${h.id}/images`, { include_image_language: lang() === "en" ? "en,null" : "tr,en,null" });
    const list: any[] = what === "posters" ? im.posters ?? [] : im.backdrops ?? [];
    const pics = list.sort((x, y) => (y.vote_average ?? 0) - (x.vote_average ?? 0)).slice(0, what === "posters" ? 8 : 9)
      .map((x) => ({ src: `${IMG}${what === "posters" ? "w342" : "w780"}${x.file_path}`, full: `${IMG}original${x.file_path}`, caption: `${h.title}${h.year ? ` (${h.year})` : ""}` }));
    toolCtx.media.images.push(...pics);
    return pics.length ? `${pics.length} görsel gösterildi (${h.title} ${h.year}). Görselleri tekrar listeleme, kısaca bahset.` : "Görsel bulunamadı";
  }
  if (name === "show_person") {
    const r = await tmdbGet("/search/person", { query: String(a?.name ?? ""), language: "en-US" });
    const p = r.results?.[0];
    if (!p) return `Bulunamadı: ${a?.name}`;
    const im = await tmdbGet(`/person/${p.id}/images`);
    const pics = (im.profiles ?? []).slice(0, 6).map((x: any) => ({ src: `${IMG}w342${x.file_path}`, full: `${IMG}original${x.file_path}`, caption: p.name }));
    toolCtx.media.images.push(...pics);
    toolCtx.media.links.push({ kind: "tmdb", label: `${p.name} · TMDB`, url: `https://www.themoviedb.org/person/${p.id}?language=${lang()}` });
    const known = (p.known_for ?? []).map((k: any) => k.title ?? k.name).filter(Boolean).join(", ");
    return `${p.name} için ${pics.length} fotoğraf gösterildi. Bilinen işleri: ${known}`;
  }
  if (name === "film_links") {
    const h = await findTitle(a);
    if (!h) return `TMDB'de bulunamadı: ${a?.title}`;
    await addLinks(h);
    return `${h.title} (${h.year}) bağlantıları sohbette kart olarak gösterildi (IMDb, Letterboxd, TMDB, Vikipedi, fragman, JustWatch). Adresleri metne yazma.`;
  }
  if (name === "open_from_library") {
    // Only the exact film: first by TMDB id, then by the exact name (and year). "Matrix" never opens "Matrix Reloaded".
    const bare = (x: string) => norm(x).replace(/^(the|a|an) /, "");
    const q = bare(String(a?.title ?? "").replace(/\s*\(\d{4}\)\s*$/, ""));
    const year = a?.year ? String(a.year) : String(a?.title ?? "").match(/\((\d{4})\)\s*$/)?.[1];
    const h = await findTitle(a).catch(() => undefined);
    const yearOk = (it: Item) => !year || !it.meta?.year || it.meta.year === year || (it.parsed.year && String(it.parsed.year) === year);
    const best = (h && toolCtx.items.find((it) => it.meta?.id === h.id && it.meta?.kind === h.kind))
      ?? toolCtx.items.find((it) => [it.meta?.title, it.parsed.title].filter(Boolean).some((n) => bare(n!) === q) && yearOk(it));
    if (!best) {
      // not in the library: the chat shows a box to give a magnet / .torrent (never typed into the chat)
      toolCtx.media.source = { title: h?.title ?? String(a?.title ?? ""), year: h?.year || year, poster: h?.poster ?? null };
      const near = toolCtx.items.filter((it) => [it.meta?.title, it.parsed.title].filter(Boolean).some((n) => bare(n!).includes(q) || q.includes(bare(n!)))).map((it) => it.meta?.title ?? it.parsed.title);
      return `Kütüphanede YOK: ${h?.title ?? a?.title}${h?.year ? ` (${h.year})` : ""}. Sohbette magnet / torrent kutusu açıldı; kullanıcıdan magnet bağlantısını ya da .torrent dosyasını o kutuya vermesini iste, sohbete yazmasını isteme.${near.length ? ` Benzer adlı ama FARKLI filmler kütüphanede var: ${[...new Set(near)].slice(0, 4).join(", ")} — bunları açma, sadece söyle.` : ""}`;
    }
    if (!toolCtx.play) return "Oynatıcı hazır değil";
    toolCtx.play(best.files[0].path);
    return `Açılıyor: ${best.meta?.title ?? best.parsed.title}${best.meta?.year ? ` (${best.meta.year})` : ""}`;
  }
  const t = String(a?.title ?? "").trim();
  const label = a?.year ? `${t} (${a.year})` : t;
  if (!t) return "Başlık yok";
  if (name === "add_recommendation") {
    if (!String(a?.from ?? "").trim()) return `EKLENMEDİ: ${label} için kimin önerdiği bilinmiyor. Kullanıcıya “Bunu kim önerdi?” diye sor, cevaba göre tekrar ekle.`;
    const m = t.match(/^(.*?)\s*\((\d{4})\)\s*$/);
    const ok = await addRecommendation((m ? m[1] : t).trim(), a?.year ?? m?.[2], a?.from, a?.note);    return ok ? `Önerilere eklendi: ${label}${a?.from ? " · " + a.from : ""}` : `Zaten önerilerde: ${label}`;
  }
  if (name === "mark_watched") { markSeen(label, true); return `İzlediklerine eklendi: ${label}`; }
  if (name === "add_watch_later") { markLater(label, true); return `Sonra izle listesine eklendi: ${label}`; }
  if (name === "remove_watch_later") { laterOff(t, a?.year ? String(a.year) : undefined); return `Sonra izle listesinden çıkarıldı: ${label}`; }
  return "Bilinmeyen işlem";
}

const URL_RE = /https?:\/\/\S+/i;
/** A link Luna can act on by itself: a Spotify list, a YouTube video, a torrent, a book file. */
function linkAct(text: string): LinkAct | null {
  const mag = text.match(/magnet:\?\S+/i)?.[0];
  if (mag) return { kind: "torrent", url: mag };
  const u = text.match(URL_RE)?.[0]?.replace(/[)\].,;!?]+$/, "");
  if (!u) return null;
  if (isSpotifyList(u)) return { kind: "spotify", url: u };
  if (/^https?:\/\/((www|m|music)\.)?(youtube\.com\/(watch|playlist|shorts)|youtu\.be\/)/i.test(u)) return { kind: "youtube", url: u };
  if (/\.torrent(\?|$)/i.test(u)) return { kind: "torrent", url: u };
  if (/\.(epub|pdf|cbz)(\?|$)/i.test(u)) return { kind: "book", url: u };
  return null;
}
const ACT_TEXT: Record<LinkAct["kind"], string> = {
  spotify: tt("Bu bir Spotify listesi. Şarkıların YouTube karşılıklarını buluyorum; kontrol edip “Devam” dersen aynı sırayla bir liste olarak kaydederim."),
  youtube: tt("Bu bir YouTube bağlantısı. Müzik olarak çalayım mı? (Hiçbir şey indirilmez.)"),
  torrent: tt("Bu bir torrent. Film olarak açayım mı? İnerken izleyebilirsin."),
  book: tt("Bu bir kitap dosyası. İndirip kitaplığına ekleyeyim ve açayım mı?"),
};

const TRIVIA = /trivia|fun facts?|behind the scenes|making of|did you know|ilginç|bilgi(ler)? ver|kamera arkası|çekim|perde arkası|gizli detay|easter egg|bilinmeyen|hangi şarkı|şarkılar(ı)? (çalıyor|var)|film müziği (ne|kim|hangi)|soundtrack|which songs|kitabı var mı|kitabı mı var|book (is it )?based|based on a book|is there a book|filmi (ya da dizisi )?var mı|dizisi var mı|is there a (film|movie|series)|hangi film(ler)?(de| ve dizilerde) geçiyor|which (films|movies|shows)|belgesel(i)? (ya da filmi )?var mı|documentar|internetteki (inceleme|yorum)|eleştirmen|düşünürler|makaleler|critics|essays/i;

/** Something to be made or done (a collection, a list, a download…): that needs Luna's tools, never a web search. */
const MAKES = /kol+e[kc]s|collect|liste|playlist|çalma|\b(yap(ar|sana|abilir|ın|)\b|oluştur|hazırla|ekle|kaydet|topla|indir|götür)|\b(make|create|add|save|gather)\b/i;

/** The collection the assistant offered to look at again ("yes" on the next message does it). */
let recheck: string | null = null;
/** A collection already on the subject of the message: a word of its name in it ("Dune Evreni" → "dune"). */
function sameCollection(text: string): Collection | undefined {
  const t = ` ${norm(text)} `;
  const plain = new Set(["evreni", "evren", "koleksiyonu", "koleksiyon", "serisi", "seri", "dünyası", "ve", "ile", "the", "and", "of", "universe", "collection", "series", "world", "film", "filmler", "kitap", "kitaplar", "müzik", "müzikler"]);
  return loadCollections().find((c) => norm(c.name).split(" ").some((w) => w.length >= 3 && !plain.has(w) && t.includes(` ${w}`)));
}
const collectionSummary = (c: Collection) => {
  const n = (k: string) => c.items.filter((x) => x.kind === k).length;
  return [n("film") && `${n("film")} film/dizi`, n("music") && `${n("music")} şarkı`, n("book") && `${n("book")} kitap`].filter(Boolean).join(", ") || "boş";
};
/** A request to make a collection (typos too). */
const COLLECT = /kol+e[kc]s|collect/i;
/** "# Bugün": the date, so the model knows what may have come out since it was trained. */
function todayNote(): string {
  return "\n\n# Bugün\n" + new Date().toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    + ". Eğitim bilgin bundan eski olabilir: yeni çıkan film, dizi, kitap ve albümleri bilmiyor olabilirsin.";
}
/** Before a collection: a Google search for the up-to-date facts (every book, every adaptation and its release, the best-known tracks). */
async function researchCollection(key: string, talk: Msg[]): Promise<string> {
  const day = new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  const ask = `Bugün ${day}. Kullanıcı aşağıdaki sohbette bir koleksiyon istiyor. Google'da arayarak bu konu için GÜNCEL ve doğru bir döküm çıkar (hafızana güvenme; son çıkanları özellikle kontrol et):
- Kitaplar: ad | yazar | ilk yayın yılı (yayın sırasıyla; ana seri ve başka yazarların devam/ön hikâye kitapları ayrı ayrı belirtilsin)
- Filmler ve diziler: ad | yıl | yönetmen | tür (film, dizi, mini dizi) | durum (çıktı / vizyon tarihi duyuruldu: tarih / yapımda)
- Film müzikleri: her film ve dizi için en bilinen 3-5 parça: parça adı | besteci | hangi yapımdan
Duyurulmuş filmlerin beklenen çıkış tarihine bak: tarih bugünü geçtiyse filmin adıyla ayrıca ara ve gerçekten çıkıp çıkmadığını yaz; çıkmadıysa "çıkması bekleniyor" yaz.
Sadece dökümü yaz, yorum ekleme.

Sohbet:
${talk.map((m) => (m.role === "user" ? "Kullanıcı: " : "Asistan: ") + m.text).join("\n")}`;
  const { r } = await geminiWithFallback(key, { contents: [{ role: "user", parts: [{ text: ask }] }], tools: [{ google_search: {} }] });
  // only a real search counts (if Google couldn't be used, the fallback answer is memory again)
  if (!r?.candidates?.[0]?.groundingMetadata) return "";
  return (r?.candidates?.[0]?.content?.parts ?? []).map((x: any) => x.text ?? "").join("").trim().slice(0, 9000);
}

/** Has a film whose expected date has passed really come out? A Google search on its name ("vizyona girdi mi"). */
async function cameOut(key: string, title: string, year: string, date: string): Promise<boolean | null> {
  const day = new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  const { r } = await geminiWithFallback(key, { contents: [{ role: "user", parts: [{ text:
    `Bugün ${day}. "${title}"${year ? ` (${year})` : ""} filminin beklenen çıkış tarihi ${date} idi. Google'da ara: bu film vizyona girdi mi ya da yayınlandı mı? İlk satıra sadece EVET ya da HAYIR yaz.` }] }], tools: [{ google_search: {} }] });
  if (!r?.candidates?.[0]?.groundingMetadata) return null; // no real search: don't guess
  const t = (r?.candidates?.[0]?.content?.parts ?? []).map((x: any) => x.text ?? "").join("").trim();
  return /^\W*evet/i.test(t) ? true : /^\W*hay[ıi]r/i.test(t) ? false : null;
}
/**
 * A collection's films checked on TMDB: each film's series is completed (the newest one too), and every film gets its
 * real state. A date still ahead: "çıkması bekleniyor". A date passed but not marked released: searched by name first.
 */
async function completeFilms(a: any, key: string): Promise<any> {
  const lines: string[] = Array.isArray(a?.films) ? a.films.map(String) : [];
  if (!lines.length || !store.get("tmdbKey")) return a;
  const today = new Date().toISOString().slice(0, 10);
  const fmt = (d: string) => new Date(d).toLocaleDateString(locale(), { day: "numeric", month: "long", year: "numeric" });
  const known = new Map<number, number>(); // TMDB id → line
  const series = new Set<number>();
  const info: any[] = [];
  await Promise.allSettled(lines.map(async (line, i) => {
    const [title, mid] = line.split("|").map((x) => x.trim());
    const year = /^\d{4}$/.test(mid ?? "") ? Number(mid) : undefined;
    const hit = (await searchTmdb(title, "movie", year))[0] ?? (year ? (await searchTmdb(title, "movie"))[0] : undefined);
    if (!hit) return;
    const d = await tmdbGet(`/movie/${hit.id}`, { language: locale() });
    // a series written in the films list must not turn into a film of the same name
    if (![d.title, d.original_title].some((x) => x && (norm(x).includes(norm(title)) || norm(title).includes(norm(x))))) return;
    known.set(hit.id, i); info[i] = d;
    if (d.belongs_to_collection?.id) series.add(d.belongs_to_collection.id);
  }));
  // the rest of each series (TMDB collections hold the announced ones too)
  const added: { line: string; date: string }[] = [];
  for (const id of series) {
    const c = await tmdbGet(`/collection/${id}`, { language: locale() }).catch(() => null);
    for (const part of c?.parts ?? []) {
      if (known.has(part.id)) continue;
      const d = await tmdbGet(`/movie/${part.id}`, { language: locale() }).catch(() => part);
      known.set(part.id, -1);
      added.push({ line: `${d.title ?? part.title} | ${(d.release_date ?? "").slice(0, 4)} | ${c.name ?? ""}`, date: d.release_date ?? "" });
      info[lines.length] = d;
      lines.push(added[added.length - 1].line);
    }
  }
  // each film's state
  const out = await Promise.all(lines.map(async (line, i) => {
    const d = info[i];
    if (!d) return line;
    const date: string = d.release_date ?? "";
    let coming = !date || date > today;
    if (!coming && d.status && d.status !== "Released") coming = (await cameOut(key, d.title, date.slice(0, 4), fmt(date)).catch(() => null)) === false;
    if (!coming) return line;
    const [title, mid, ...note] = line.split("|").map((x) => x.trim());
    const tag = date ? tt("Çıkması bekleniyor: {0}", fmt(date)) : tt("Çıkması bekleniyor (tarih belli değil)");
    return [title, mid ?? "", [tag, note.join(" | ").replace(/yakında:[^|]*/i, "").trim()].filter(Boolean).join(" · ")].join(" | ");
  }));
  return { ...a, films: out, ...(added.length ? { _added: added.map((x) => x.line.split("|")[0].trim()) } : {}) };
}

/** Ready questions, longest first: the chips fill the rows tidily (in either language). */
const byLength = (l: string[]) => [...l].sort((x, y) => y.length - x.length);
const QUICK = [tt("Bu akşam ne izlesem?"), tt("Kütüphanemde olmayan ama sevebileceğim filmler öner"), tt("Arkadaşlarımın önerilerinden hangisiyle başlayayım?"), tt("Kitabından uyarlanmış güzel bir film öner"), tt("Müzikleri çok iyi olan bir film öner"), tt("Hafif, güldüren bir şey öner"), tt("Sevdiğim bir film için filmleri, müzikleri ve kitaplarıyla bir koleksiyon yap")];

/** Posters for titles the pointer rested on in the chat (title → image address, "" when none). */
const posterCache = new Map<string, string>();

/** The title pages open on screen right now, newest last: the assistant reads the top one. */
const openTitles: { title: string; year?: string; kind?: string; overview?: string; extra?: string }[] = [];
export const topOpenTitle = () => openTitles[openTitles.length - 1];
function openTitleNote() {
  const t = topOpenTitle();
  if (!t) return "";
  return `\n\n# Ekranda açık olan eser\nKullanıcı şu an bu eserin sayfasına bakıyor; "bu film", "bu" gibi sorular bunu kasteder:\n${t.title}${t.year ? ` (${t.year})` : ""} — ${t.kind === "tv" ? "dizi" : "film"}${t.extra ? "\n" + t.extra : ""}${t.overview ? "\nÖzet: " + t.overview.slice(0, 600) : ""}`;
}

/** What the Öneriler page shows right now (a friend's recommendations or one of their lists). */
type RecsView = { who: string; list: string; films: { title: string; year?: string; rating?: number; stars?: number; tmdbId?: number; kind?: "movie" | "tv" }[] };
let recsView: RecsView | null = null;
export const getRecsView = () => recsView;
export function setRecsView(v: RecsView | null) {
  const same = JSON.stringify(v && { w: v.who, l: v.list, n: v.films.length }) === JSON.stringify(recsView && { w: recsView.who, l: recsView.list, n: recsView.films.length });
  recsView = v;
  if (!same) listeners.forEach((f) => f());
}
function recsViewNote(v: RecsView | null) {
  if (!v) return "";
  const seen = new Set([...loadSeen().map(seenKey), ...Object.values(loadDiary()).filter((e) => e.watched || e.vote).map((e) => seenKey(e.title))]);
  // what the user hasn't seen, without what moderation hides, best first; a few hundred titles is plenty to choose from
  const pool = v.films.filter((f) => !seen.has(seenKey(f.title)) && !cwFlag(f.tmdbId, f.kind))
    .sort((a, b) => (b.rating ?? 0) + (b.stars ?? 0) - ((a.rating ?? 0) + (a.stars ?? 0))).slice(0, 350);
  const line = (f: RecsView["films"][number]) => `${f.title}${f.year ? ` (${f.year})` : ""}${f.rating ? ` · TMDB ${f.rating}` : ""}${f.stars ? ` · ${v.who} ★${f.stars}/5` : ""}`;
  return `

# Şu anki sayfa: Öneriler › ${v.who === "*" ? "Tüm öneriler" : v.who} › ${v.list}
Kullanıcı şu anda ${v.who === "*" ? "arkadaşlarının bütün önerilerine" : `${v.who}'ın “${v.list}” listesine`} bakıyor (${v.films.length} film).
"Buradan ne izlesem", "bu listeden", "bunlardan hangisi" gibi isteklerde SADECE bu listeden seç:
- Önce zevk defterine bak (beğendikleri / beğenmedikleri / puanları / sevdiği türler) ve cevabın başında bunu kısaca söyle: ör. "Daha önce X ve Y gibi yavaş, atmosferik filmleri sevdiğin için…".
- 3–5 film seç, her birine neden ona uyduğunu bir cümleyle yaz (sevdiği bir filme benzerliği, türü, ${v.who === "*" ? "önereni" : v.who + "'ın puanı"}, TMDB puanı).
- Beğenmediği türlere benzeyenleri önerme. Zevk defteri boşsa önce ne tür şeyler sevdiğini kısaca sor.
Listenin izlemediği, moderasyona takılmayan filmlerinden en yüksek puanlı ${pool.length} tanesi:
${pool.map(line).join("\n")}`;
}

/**
 * What is open at the same time (a film playing or its page, a book read, a song): when there are two or more,
 * the user picks which one the chat is about (only then: one thing needs no question).
 */
type Focus = { id: string; kind: "film" | "music" | "book"; label: string; sub: string; info: string };
const FOCUS_ICON: Record<Focus["kind"], string> = {
  film: "M4 4h16v16H4zM8 4v16M16 4v16",
  music: "M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  book: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 21V5",
};
function openFocuses(watching: { title: string; item?: Item } | undefined, viewing: Item | undefined, songOnScreen = false): Focus[] {
  const out: Focus[] = [];
  const filmInfo = (it?: Item) => {
    const m = it?.meta;
    return m ? `${m.year ? ` (${m.year})` : ""}${m.genres.length ? ` — ${m.genres.join(", ")}` : ""}${m.overview ? `. Özet: ${m.overview.slice(0, 300)}` : ""}` : "";
  };
  if (watching) out.push({ id: "watch", kind: "film", label: watching.title, sub: tt("İzleniyor"), info: `Oynatıcıda izlediği film/dizi: **${watching.title}**${filmInfo(watching.item)}` });
  else if (viewing) {
    const t = viewing.meta?.title ?? viewing.parsed.title;
    out.push({ id: "page:" + viewing.key, kind: "film", label: t, sub: viewing.parsed.kind === "tv" ? tt("Dizi sayfası") : tt("Film sayfası"), info: `Detay sayfası açık olan ${viewing.parsed.kind === "tv" ? "dizi" : "film"}: **${t}**${filmInfo(viewing)}` });
  }
  const bk = bookOnScreen();
  if (bk) out.push({ id: "book:" + bk.b.path, kind: "book", label: bk.b.title, sub: bk.reading ? tt("Okunuyor") : tt("Kitap sayfası"),
    info: `${bk.reading ? "Okuyucuda açık, okuduğu kitap" : "Sayfası açık olan kitap"}: **${bk.b.title}**${bk.b.author ? " — " + bk.b.author : ""}` });
  const s = nowPlaying();
  if (s) out.push(s.book
    ? { id: "music:" + s.src, kind: "book", label: s.album ?? s.title, sub: tt("Sesli kitap"), info: `Dinlediği sesli kitap: **${s.album ?? s.title}**${s.artist ? " — " + s.artist : ""} (bölüm: ${s.title})` }
    : { id: "music:" + s.src, kind: "music", label: s.title, sub: s.radio ? tt("Radyo") : tt("Çalıyor"),
      info: s.radio ? `Çalan radyo: **${s.title}**` : `Çalan şarkı: **${s.title}**${s.artist ? " — " + s.artist : ""}${s.album ? ` (${s.album})` : ""}` });
  // the full "now playing" screen is open: the song is what's on screen, so it comes first
  if (s && songOnScreen) out.unshift(out.pop()!);
  return out;
}
/** The words of a message that name one kind ("çalan şarkı", "bu film", "kitapta"): that one is meant. */
function focusHint(text: string): Focus["kind"] | null {
  const t = text.toLocaleLowerCase("tr");
  const music = /şarkı|sarki|müzi|muzi|parça|parca|çalan|calan|albüm|album|sanatçı|sanatci|şarkıcı|radyo|song|track|music|singer|artist|lyrics|söz(ler)?i/.test(t);
  const film = /film|dizi|sahne|oyuncu|yönetmen|izledi|izlediğim|bölüm(ü|de)? |movie|series|episode|scene|actor|director/.test(t);
  const book = /kitap|okudu|okuduğum|yazar|roman|sayfa|book|novel|author|reading/.test(t);
  return [music && "music", film && "film", book && "book"].filter(Boolean).length === 1 ? (music ? "music" : film ? "film" : "book") : null;
}
function focusNote(all: Focus[], f: Focus | undefined, mode: Mode): string {
  if (!f) return "";
  if (f.id === "general") {
    const others = all.filter((x) => x !== f);
    return others.length ? `

# Aynı anda açık olan
${others.map((x) => "- " + x.info).join("\n")}
Kullanıcı sohbetin bunlardan biri hakkında değil, genel (${MODE_NAME[mode]}) olduğunu seçti. Açıkça sormadıkça bunları konu etme.` : "";
  }
  if (all.length === 1) {
    // one thing: told only when the part's own data doesn't already carry it
    if (f.id.startsWith("page:") || (mode === "music" && f.kind === "music")) return "";
    return `

# Şu an açık olan
${f.info}
"Bu", "çalan", "izlediğim", "okuduğum" gibi ifadeler bunu kasteder.`;
  }
  return `

# Şu an aynı anda açık olanlar
${all.map((x) => "- " + x.info).join("\n")}
Kullanıcı sohbetin şunun hakkında olduğunu seçti: **${f.label}** (${f.sub}). "Bu", "bunu", "bunun gibi", "şu an" gibi belirsiz ifadeler BUNU kasteder (sayfa notundaki "bu" kuralından önce gelir). Kullanıcı öbürlerinden birini açıkça sorarsa (ör. "çalan şarkı", "izlediğim film", "okuduğum kitap") ona cevap ver.`;
}

/** The page the user is looking at while chatting (details of one film / series). */
function viewingNote(it: Item | undefined) {
  if (!it) return "";
  const m = it.meta;
  const kind = it.parsed.kind === "tv" ? "dizi" : "film";
  const title = (m?.title ?? it.parsed.title) + (m?.year ? ` (${m.year})` : "");
  return `

# Şu anki sayfa
Kullanıcı şu anda şu ${kind}in detay sayfasında: **${title}**${m?.genres.length ? ` — ${m.genres.join(", ")}` : ""}${m?.rating ? `, TMDB ★${m.rating}` : ""}.
${m?.overview ? "Özet: " + m.overview.slice(0, 500) : ""}
"Bu film", "bu dizi", "bunun gibi", "bu bana uygun mu" gibi ifadeler bu ${kind}i kasteder; böyle sorularda bu ${kind}e odaklan.
Ama kullanıcı genel bir şey isterse (ör. "bana film öner", başka bir film ya da konu) bu sayfayla sınırlı kalma, normal şekilde cevap ver.`;
}
const PAGE_QUICK = (kind: string) => [
  kind === "tv" ? tt("Bu dizi ne hakkında?") : tt("Bu film ne hakkında?"),
  kind === "tv" ? tt("Bu dizinin kitabı var mı?") : tt("Bu filmin kitabı var mı?"),
  kind === "tv" ? tt("Bu dizide hangi şarkılar çalıyor?") : tt("Bu filmde hangi şarkılar çalıyor?"),
  tt("İlginç bilgiler (trivia)"), (kind === "tv" ? tt("Buna benzer diziler") : tt("Buna benzer filmler")), tt("Bu bana uygun mu?"), tt("Oyuncu ve yönetmen hakkında")];

/* ---------- what the assistant is doing, step by step, each with its own little animation ---------- */
type StepKind = "think" | "search" | "page" | "list" | "taste" | "write" | "lib" | "hop-film" | "hop-music" | "hop-books";
type Step = { kind: StepKind; text: string; done?: boolean };
const TOOL_STEP: Record<string, [StepKind, string]> = {
  read_link: ["page", tt("Sayfaya bakıyorum")],
  import_link: ["list", tt("Listeyi çıkarıyorum")],
  follow_letterboxd: ["list", tt("Letterboxd'u okuyorum")],
  refresh_playlists: ["list", tt("Listeleri güncelliyorum")],
  list_recommendations: ["list", tt("Önerilere bakıyorum")],
  list_playlists: ["list", tt("Listelere bakıyorum")],
  add_recommendation: ["write", tt("Önerilere ekliyorum")],
  update_recommendation: ["write", tt("Öneriyi düzenliyorum")],
  remove_recommendations: ["write", tt("Önerileri temizliyorum")],
  sort_recommendations: ["list", tt("Önerileri sıralıyorum")],
  add_to_playlist: ["write", tt("Listeye ekliyorum")],
  make_music_playlist: ["hop-music", tt("Şarkıları getiriyorum")],
  make_collection: ["list", tt("Koleksiyonu hazırlıyorum")],
  go_to: ["page", tt("Oraya götürüyorum")],
  remove_from_playlist: ["write", tt("Listeden çıkarıyorum")],
  delete_playlist: ["write", tt("Listeyi siliyorum")],
  mark_watched: ["taste", tt("Zevk defterine yazıyorum")],
  rate_title: ["taste", tt("Puanını kaydediyorum")],
  remember_note: ["taste", tt("Not alıyorum")],
  forget_note: ["taste", tt("Notu siliyorum")],
  add_watch_later: ["list", tt("Sonra izle listesine ekliyorum")],
  remove_watch_later: ["list", tt("Sonra izle listesini düzenliyorum")],
  open_from_library: ["lib", tt("Kütüphanende arıyorum")],
  find_free_books: ["hop-books", tt("Ücretsiz kütüphanelerde arıyorum")],
  get_free_book: ["hop-books", tt("Kitabı indiriyorum")],
  show_images: ["search", tt("Görselleri getiriyorum")],
  show_film: ["page", tt("Filmin sayfasını hazırlıyorum")],
  show_person: ["search", tt("Fotoğrafları getiriyorum")],
  film_links: ["page", tt("Bağlantıları buluyorum")],
};
function StepIcon({ kind }: { kind: StepKind }) {
  return (
    <span className={"step-ic k-" + kind} aria-hidden>
      {kind === "think" && <><i /><i /><i /></>}
      {kind === "search" && <svg viewBox="0 0 24 24"><circle cx="10" cy="10" r="6" /><path d="M14.5 14.5 20 20" /></svg>}
      {kind === "page" && <><svg viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6z" /><path d="M9 11h7M9 14h7M9 17h5" /></svg><b /></>}
      {kind === "list" && <><i /><i /><i /></>}
      {kind === "taste" && <svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></svg>}
      {kind === "write" && <><svg viewBox="0 0 24 24"><path d="M4 20l4-1 11-11-3-3L5 16z" /></svg><b /></>}
      {kind === "lib" && <><i /><i /><i /><i /></>}
      {kind === "hop-film" && <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" /><circle cx="12" cy="7.5" r="1.6" /><circle cx="12" cy="16.5" r="1.6" /><circle cx="7.5" cy="12" r="1.6" /><circle cx="16.5" cy="12" r="1.6" /></svg>}
      {kind === "hop-music" && <><i /><i /><i /><i /></>}
      {kind === "hop-books" && <><i /><i /></>}
    </span>
  );
}

const RECS_QUICK = [tt("Buradan ne izlesem?"), tt("Zevkime en uygun 5 film"), tt("Bu listeden hafif bir şey"), tt("Bu listeden en iyi bilinen klasikler"), tt("Bu listede sevmeyeceğim neler var?")];

/** What a link in the chat turns into: the move for a Spotify list, buttons for the rest. */
const goPlaylist = (id: string) => { showPlaylist(id); toolCtx.setMode?.("music"); };
const ADDED_PLAYLIST = "luna-added";
/** A song found on YouTube is kept in one playlist so it can be played again. */
function addToMusicLibrary(item: QItem) {
  const lists = loadMusicPlaylists();
  const pl = lists.find((p) => p.id === ADDED_PLAYLIST);
  if (pl) {
    if (!pl.items.some((t) => t.src === item.src)) saveMusicPlaylists(lists.map((p) => (p.id === pl.id ? { ...p, items: [...p.items, item] } : p)));
  } else {
    saveMusicPlaylists([{ id: ADDED_PLAYLIST, name: tt("Luna'ya eklenenler"), from: "Luna", at: Date.now(), items: [item] }, ...lists]);
  }
}
/** "Not in the library": the YouTube result, with an add-and-play button. */
function SongBox({ s }: { s: SongAsk }) {
  const [added, setAdded] = useState<"" | "lib" | "play">("");
  const [cancelled, setCancelled] = useState(false);
  const h = s.hits[0];
  if (cancelled) return <div className="srcbox songbox"><div className="srcbox-main"><div className="srcbox-t muted">{tt("Vazgeçildi")}</div></div></div>;
  if (!h) return null;
  return (
    <div className="srcbox songbox">
      {h.thumb ? <img src={h.thumb} alt="" /> : <div className="srcbox-ph"><Icon d={I.play} size={22} /></div>}
      <div className="srcbox-main">
        <div className="srcbox-t">
          <div className="muted small">{tt("Listende yok · YouTube'da buldum, getireyim mi?")}</div>
          <b className="ellipsis">{h.title}</b>
          <div className="muted small ellipsis">{h.channel}</div>
        </div>
        {added ? <div className="srcbox-ok">{added === "lib" ? tt("✓ Kütüphaneye eklendi ve çalınıyor") : tt("✓ Çalınıyor")}</div> : (
          <div className="srcbox-row">
            <button className="fp-btn primary" onClick={() => {
              const item: QItem = { src: h.url, title: h.title, artist: h.channel, cover: h.thumb, duration: h.duration, yt: true };
              addToMusicLibrary(item); playQueue([item]); setAdded("lib");
            }}><Icon d={I.play} fill size={14} />  {tt("Kütüphaneye ekle ve çal")}</button>
            <button className="fp-btn" onClick={() => {
              playQueue([{ src: h.url, title: h.title, artist: h.channel, cover: h.thumb, duration: h.duration, yt: true }]); setAdded("play");
            }}>{tt("Sadece çal")}</button>
            <button className="fp-btn" onClick={() => openUrl(h.url)}>{tt("YouTube'da aç")}</button>
            <button className="fp-btn" onClick={() => setCancelled(true)}>{tt("Vazgeç")}</button>
          </div>
        )}
      </div>
    </div>
  );
}
/** "Is it this one?": the first free book found, Save (downloads into the library) → Read. */
function FreeBookBox({ s }: { s: BookAsk }) {
  const [i, setI] = useState(0);
  const h = s.hits[i];
  const key = "freeBook:" + h?.url;
  const [saved, setSaved] = useState<Book | null>(() => store.json<Book | null>(key, null));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [cancelled, setCancelled] = useState(false);
  useEffect(() => {
    const b = store.json<Book | null>(key, null);
    setSaved(b); setErr("");
    // a saved book deleted since: back to "Save"
    if (b) loadBookLibrary().then((l) => { if (!l.some((x) => x.path === b.path)) { try { localStorage.removeItem(key); } catch {} setSaved(null); } }).catch(() => {});
  }, [key]);
  if (cancelled) return <div className="srcbox"><div className="srcbox-main"><div className="srcbox-t muted">{tt("Vazgeçildi")}</div></div></div>;
  if (!h) return null;
  const save = async () => {
    setBusy(true); setErr("");
    try {
      const b = await fetchBook(h.url, h.title, h.author, h.kind ?? "epub");
      store.set(key, JSON.stringify(b));
      setSaved(b);
    } catch (e) { setErr(String(e)); }
    setBusy(false);
  };
  const read = () => { toolCtx.setMode?.("books"); toolCtx.closeChat?.(); setTimeout(() => requestOpenBook(saved!), 60); };
  return (
    <div className="srcbox">
      {h.cover ? <img src={h.cover} alt="" onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} /> : <div className="srcbox-ph"><Icon d={I.folder} size={22} /></div>}
      <div className="srcbox-main">
        <div className="srcbox-t">
          <div className="muted small">{saved ? tt("Kitaplığına kaydedildi") : tt("Ücretsiz buldum ({0}) · Bu kitap mı?", h.from)}</div>
          <b className="ellipsis">{h.title}</b>
          <div className="muted small ellipsis">{h.author}</div>
        </div>
        {err && <div className="srcbox-err small">{tt("İndirilemedi: {0}", err)}</div>}
        <div className="srcbox-row">
          {saved ? <button className="fp-btn primary" onClick={read}><Icon d={I.play} fill size={14} />  {tt("Oku")}</button>
            : <button className="fp-btn primary" disabled={busy} onClick={save}>{busy ? (h.from === "Vikikaynak" ? tt("Kitap hazırlanıyor…") : tt("İndiriliyor…")) : tt("Evet, kaydet")}</button>}
          {!saved && !busy && s.hits.length > 1 && <button className="fp-btn" onClick={() => setI((i + 1) % s.hits.length)}>{tt("Başka baskı ({0}/{1})", i + 1, s.hits.length)}</button>}
          {!saved && !busy && <button className="fp-btn" onClick={() => setCancelled(true)}>{tt("Vazgeç")}</button>}
        </div>
      </div>
    </div>
  );
}
function LinkActCard({ act, onState }: { act: LinkAct; onState: (s: "done" | "cancel", info?: string, pl?: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (act.state) return (
    <div className="msg-note act-done">{act.state === "done" ? "✓ " + (act.info ?? tt("Yapıldı")) : "✕ " + tt("İptal edildi")}
      {act.pl && loadMusicPlaylists().some((p) => p.id === act.pl) && <button className="chip" onClick={() => goPlaylist(act.pl!)}>{tt("Listeye git")} →</button>}
    </div>
  );
  if (act.kind === "spotify") return <SpotifyMove url={act.url} onDone={(name, id) => onState("done", tt("“{0}” listesi müziklerine eklendi", name), id)} />;
  const go = async () => {
    setBusy(true); setErr("");
    try {
      if (act.kind === "torrent") {
        if (!toolCtx.openSource) throw new Error(tt("Bu işlem burada yapılamıyor"));
        toolCtx.openSource(act.url);
        onState("done", tt("Torrent açıldı"));
      } else if (act.kind === "youtube") {
        const l = await invoke<{ url: string; title: string; channel: string; duration?: number; thumb?: string }[]>("yt_info", { url: act.url });
        if (!l.length) throw new Error(tt("Bu bağlantıda çalınacak bir şey yok"));
        playQueue(l.map((h) => ({ src: h.url, title: h.title, artist: h.channel, cover: h.thumb, duration: h.duration, yt: true })));
        onState("done", l.length > 1 ? tt("{0} video çalıyor", l.length) : tt("Çalıyor: {0}", l[0].title));
      } else {
        const b = await fetchAndOpenBook(act.url, "", "");
        onState("done", tt("“{0}” kitaplığına eklendi ve açıldı", b.title));
      }
    } catch (e) { setErr(String(e).replace(/^Error: /, "")); } finally { setBusy(false); }
  };
  return (
    <div className="ask-card act-card">
      <div className="muted small ellipsis" title={act.url}>{act.url}</div>
      {err && <div className="plugin-msg small err">{err}</div>}
      <div className="ask-btns">
        <button className="primary sm" disabled={busy} onClick={go}>{busy ? tt("Çalışıyorum…") : act.kind === "youtube" ? tt("Çal") : act.kind === "book" ? tt("İndir ve aç") : tt("Aç")}</button>
        <button className="chip" disabled={busy} onClick={() => onState("cancel")}>{tt("İptal")}</button>
      </div>
    </div>
  );
}

/** What the preview card hands back: the songs ticked, and a new list (with its name) or an existing one to grow. */
type MusicPick = { items: QItem[]; name: string; extend?: string };
type MusicPrev = { name: string; items: QItem[]; missing: string[]; subs: string[]; extend?: string; resolve: (picked: MusicPick | null) => void };
/** The tracks that are about to be added, like the Spotify import screen. */
function MusicAddPreview({ name, items, missing, subs, extend, onDone }: { name: string; items: QItem[]; missing: string[]; subs: string[]; extend?: string; onDone: (picked: MusicPick | null) => void }) {
  const [rows, setRows] = useState(() => items.map((it) => ({ it, on: true })));
  // where they go: a new list (its name can be changed) or one of the user's own lists, grown
  const own = loadMusicPlaylists();
  const [to, setTo] = useState<"new" | "extend">(extend && own.some((p) => p.id === extend) ? "extend" : "new");
  const [listName, setListName] = useState(name);
  const [target, setTarget] = useState(() => (extend && own.some((p) => p.id === extend) ? extend : own[0]?.id ?? ""));
  const targetList = own.find((p) => p.id === target);
  const fresh = (l: QItem[]) => (to === "extend" && targetList ? l.filter((i) => !targetList.items.some((o) => o.src === i.src)) : l);
  const chosen = rows.filter((r) => r.on).map((r) => r.it);
  const all = chosen.length === rows.length;
  const listRef = useRef<HTMLDivElement>(null);
  const goMissing = () => listRef.current?.querySelector('[data-miss="1"]')?.scrollIntoView({ behavior: "smooth", block: "center" });
  return (
    <div className="sp-in-chat music-add" ref={listRef}>
      <div className="mu-sp-head">
        <span className="mu-song-t"><b className="ellipsis">{to === "extend" && targetList ? targetList.name : listName || name}</b><span className="muted small">{tt("{0}/{1} şarkı bulundu", items.length, items.length + missing.length)}</span></span>
        <label className="sp-all"><input type="checkbox" checked={all} onChange={() => setRows((r) => r.map((x) => ({ ...x, on: !all })))} /> {tt("Hepsi")}</label>
      </div>
      <div className="mu-to" role="radiogroup" aria-label={tt("Şarkılar nereye?")}>
        <button type="button" role="radio" aria-checked={to === "new"} className={"seg sm" + (to === "new" ? " on" : "")} onClick={() => setTo("new")}>{tt("Yeni liste")}</button>
        <button type="button" role="radio" aria-checked={to === "extend"} disabled={!own.length} className={"seg sm" + (to === "extend" ? " on" : "")}
          title={own.length ? undefined : tt("Henüz bir müzik listen yok")} onClick={() => setTo("extend")}>{tt("Var olan listeyi genişlet")}</button>
        {to === "new"
          ? <input className="mu-to-in" value={listName} onChange={(e) => setListName(e.target.value)} aria-label={tt("Liste adı")} placeholder={tt("Liste adı")} />
          : <select className="mu-to-in" value={target} onChange={(e) => setTarget(e.target.value)} aria-label={tt("Genişletilecek liste")}>
              {own.map((p) => <option key={p.id} value={p.id}>{tt("{0} ({1} şarkı)", p.name, p.items.length)}</option>)}
            </select>}
      </div>
      {subs.length > 0 && <div className="plugin-msg small">{tt("YouTube'da bulunamadı: {0}. Yerine sanatçının diğer parçaları eklendi.", subs.join(", "))}</div>}
      <div className="sp-list">
        {rows.map((r, i) => (
          <div key={r.it.src} className={"sp-item" + (r.on ? "" : " off")}>
            <div className="sp-row">
              <input type="checkbox" checked={r.on} onChange={() => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))} aria-label={r.it.title} />
              {r.it.cover ? <img src={r.it.cover} alt="" /> : <span className="mu-yt-ph" />}
              <span className="mu-song-t"><b className="ellipsis">{r.it.title}</b><span className="muted small ellipsis">{r.it.artist ?? ""}</span></span>
              {to === "extend" && targetList?.items.some((o) => o.src === r.it.src) && <span className="muted small nowrap">{tt("zaten listede")}</span>}
            </div>
          </div>
        ))}
      </div>
      {missing.length > 0 && (
        <div className="sp-miss-list">
          {missing.map((t) => (
            <div key={"m-" + t} className="sp-item missing" data-miss="1">
              <div className="sp-row">
                <input type="checkbox" disabled aria-label={t} />
                <span className="mu-song-t"><b className="ellipsis">{t}</b><span className="muted small">{tt("Bulunamadı")}</span></span>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="muted small">{tt("Hiçbir şey indirilmez: liste YouTube bağlantılarından oluşur.")}</div>
      <div className="modal-actions">
{missing.length > 0 && <button className="chip" onClick={goMissing}>{tt("Bulunamayan şarkıya git ({0})", missing.length)}</button>}
        <button className="chip" onClick={() => onDone(null)}>{tt("Vazgeç")}</button>
        {to === "extend" && targetList
          ? <button className="primary" disabled={!fresh(chosen).length} onClick={() => onDone({ items: chosen, name: targetList.name, extend: targetList.id })}>{tt("Devam · “{0}” listesine {1} şarkı ekle", targetList.name, fresh(chosen).length)}</button>
          : <button className="primary" disabled={!chosen.length} onClick={() => onDone({ items: chosen, name: listName.trim() || name })}>{tt("Devam · {0} şarkıyla listeyi oluştur", chosen.length)}</button>}
      </div>
    </div>
  );
}
export function ChatPanel({ items, recent, onClose, viewing, watching, onPlay, onOpenSource, mode = "film", onMode, onRemove }: {
  items: Item[]; recent: Recent[]; onClose: () => void; viewing?: Item; onPlay?: (path: string) => void; onOpenSource?: (src: string) => void;
  /** the film or episode playing in the player */
  watching?: { title: string; item?: Item };
  /** deletes a film's files (to the Recycle Bin) or only takes it off "Continue watching" */
  onRemove?: (paths: string[], how: "file" | "recent") => Promise<string>;
  /** the part of Luna that's open: its data goes with every question, the others are a tool away */
  mode?: Mode; onMode?: (m: Mode) => void;
}) {
  toolCtx.openSource = onOpenSource;
  toolCtx.closeChat = onClose;
  toolCtx.mode = mode;
  toolCtx.setMode = onMode;
  useTaste();
  const music = useMusic(); // the header follows the song that is playing
  const rv = viewing || mode !== "film" ? null : getRecsView();
  // two or more things open at once (a film and a song…): the user picks which one the chat is about
  const [, bumpBook] = useState(0);
  useEffect(() => {
    const f = () => bumpBook((n) => n + 1);
    window.addEventListener("luna-book-screen", f);
    return () => window.removeEventListener("luna-book-screen", f);
  }, []);
  const focuses = openFocuses(watching, viewing, music.view);
  // one thing open that isn't this part's own (a song playing on the books page): it is shown and can be
  // switched off, so the user always sees what "this" means
  const modeKind: Focus["kind"] = mode === "music" ? "music" : mode === "books" ? "book" : "film";
  if (focuses.length === 1 && !viewing && focuses[0].kind !== modeKind)
    focuses.push({ id: "general", kind: modeKind, label: MODE_NAME[mode], sub: tt("Genel"), info: "" });
  const [pick, setPick] = useState<string | null>(null);
  // the "now playing" screen opened (or closed): what's on screen is picked again
  useEffect(() => setPick(null), [music.view]);
  const focus = focuses.find((f) => f.id === pick) ?? focuses[0];
  toolCtx.items = items;
  toolCtx.play = onPlay;
  toolCtx.remove = onRemove;
  const [ask, setAsk] = useState<AskCard | null>(null);
  const askRef = useRef<AskCard | null>(null);
  askRef.current = ask;
  // closing the assistant while a card waits counts as "Cancel"
  useEffect(() => () => { askRef.current?.resolve("cancel"); }, []);
  const [musicPrev, setMusicPrev] = useState<MusicPrev | null>(null);
  const prevRef = useRef<MusicPrev | null>(null);
  toolCtx.musicPreview = (name, list, miss, subs, extend) => new Promise((resolve) => {
    const p = { name, items: list, missing: miss, subs, extend, resolve };
    prevRef.current = p;
    setMusicPrev(p);
  });
  // closing the assistant while the preview is open cancels it instead of leaving the answer waiting
  useEffect(() => () => { prevRef.current?.resolve(null); }, []);
  const [, bumpUndo] = useState(0);
  // the items unticked on the card (a collection's films, songs, books)
  const [askOff, setAskOff] = useState<Set<string>>(new Set());
  const askOffRef = useRef(askOff); askOffRef.current = askOff;
  const confirmCalls = (kind: AskCard["kind"], lines: string[], files?: string[], opts?: AskCard["opts"], groups?: AskGroup[]) => {
    setAskOff(new Set());
    return new Promise<string>((res) => setAsk({ kind, lines, groups, files, opts, resolve: (v) => { setAsk(null); res(v); } }));
  };
  // One conversation per context: each song, book, film page and the general part has its own.
  // A different topic starts a new chat instead of piling every question into one conversation.
  const lastBook = mode === "books" ? store.json<string[]>("bookRecent", [])[0] : undefined;
  const thread = viewing ? "chat:" + viewing.key
    : mode === "music" ? "chat:music:" + (nowPlaying()?.src ?? "general")
      : mode === "books" ? "chat:books:" + (lastBook ?? "general")
        : "chat:film";
  const [msgs, setMsgs] = useState<Msg[]>(() => {
    let sameRun = false;
    try { sameRun = sessionStorage.getItem("chatRun") === "1"; sessionStorage.setItem("chatRun", "1"); } catch {}
    const fresh = Date.now() - Number(store.get(thread + "@at") ?? 0) < 20 * 60 * 1000;
    // Page conversations are only for that visit: leaving the page throws them away.
    return !viewing && sameRun && fresh ? store.json<Msg[]>(thread, []) : [];
  });
  const saveThread = (m: Msg[]) => {
    if (viewing) return; store.set(thread, JSON.stringify(m.slice(-40))); store.set(thread + "@at", String(Date.now())); };
  // another song (or book) started while the assistant is open: its own conversation comes up,
  // so the old one isn't saved under the new song's name
  const threadRef = useRef(thread);
  useEffect(() => {
    if (threadRef.current === thread || viewing) return;
    threadRef.current = thread;
    const fresh = Date.now() - Number(store.get(thread + "@at") ?? 0) < 20 * 60 * 1000;
    const m = fresh ? store.json<Msg[]>(thread, []) : [];
    setMsgs(m);
    setConvId((m.length && store.get(thread + "@id")) || Date.now().toString(36) + Math.random().toString(36).slice(2, 5));
  }, [thread]);
  const [input, setInput] = useState("");
  // the big workspace unless the user made it small (the bubble is the narrow version of the same thing)
  const [big, setBigState] = useState(() => store.get("chatBig") !== "0");
  const setBig = (v: boolean) => { setBigState(v); store.set("chatBig", v ? "1" : "0"); };
  // the stored id belongs to the conversation that was restored; a fresh start gets a new one (or it would overwrite the old one in the history)
  const [convId, setConvId] = useState(() => (!viewing && msgs.length && store.get(thread + "@id")) || Date.now().toString(36) + Math.random().toString(36).slice(2, 5));
  const [q, setQ] = useState("");
  const [zoom, setZoom] = useState<Pic | null>(null);
  const [tipSeen] = useState(() => Number(store.get("chatBigTip") ?? 0));
  useEffect(() => { if (tipSeen < 3) store.set("chatBigTip", String(tipSeen + 1)); }, []);
  const ctxKind: Conv["ctxKind"] = viewing ? "film" : rv ? "recs" : mode === "film" ? "general" : mode;
  // in the music part the header names what is playing, like a film page's title
  const nowSong = mode === "music" ? nowPlaying() : undefined;
  const nowAb = mode === "books" && nowPlaying()?.book ? nowPlaying()! : undefined;
  const ctxFocus = focuses.length > 1 && focus && focus.id !== "general" && !viewing;
  const ctxLabel = (music.view && focus?.kind === "music") || ctxFocus ? focus!.label
    : viewing ? viewing.meta?.title ?? viewing.parsed.title
    : mode === "film" && topOpenTitle() ? topOpenTitle()!.title
    : rv ? tt("{0} › {1}", rv.who === "*" ? tt("Tüm öneriler") : rv.who, rv.list)
      : mode === "film" ? tt("Genel")
        : mode === "music" && nowSong ? nowSong.title
          : mode === "books" && nowAb ? (nowAb.album ?? nowAb.title)
            : MODE_NAME[mode];
  // every conversation goes to the history as it grows
  useEffect(() => {
    if (!msgs.length) return;
    const first = msgs.find((m) => m.role === "user")?.text ?? "Sohbet";
    const prev = loadConvs().find((c) => c.id === convId);
    saveConv({ id: convId, title: prev?.title ?? (first.length > 60 ? first.slice(0, 57) + "…" : first), at: Date.now(),
      ctx: prev?.ctx ?? ctxLabel, ctxKind: prev?.ctxKind ?? ctxKind, msgs: msgs.slice(-60) });
    if (!viewing) store.set(thread + "@id", convId);
    bumpHist((n) => n + 1); // the list on the left shows it right away
  }, [msgs]);
  const convRef = useRef(convId);
  convRef.current = convId;
  const newChat = () => { setMsgs([]); setConvId(Date.now().toString(36) + Math.random().toString(36).slice(2, 5)); setErr(""); };
  const openConv = (c: Conv) => { setMsgs(c.msgs); setConvId(c.id); setErr(""); };
  const delConv = (id: string) => {
    store.set("chatHistory", JSON.stringify(loadConvs().filter((c) => c.id !== id)));
    // its saved thread goes too, or reopening that part would bring the messages back
    try {
      for (const k of Object.keys(localStorage)) {
        if (!k.endsWith("@id") || store.get(k) !== id) continue;
        const base = k.slice(0, -3);
        [base, base + "@at", k].forEach((x) => localStorage.removeItem(x));
      }
    } catch {}
    if (id === convId) newChat(); else setQ((x) => x);
    bumpHist((n) => n + 1);
  };
  const [, bumpHist] = useState(0);
  // Luna's window is transparent, where WebView2 doesn't do backdrop blur: blur the app itself while the workspace is open
  useEffect(() => {
    document.body.classList.toggle("ws-open", big);
    return () => document.body.classList.remove("ws-open");
  }, [big]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { if (zoom) setZoom(null); else if (big) setBigState(false); } }; // Escape shrinks it only for now: it opens big again next time
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [big, zoom]);
  const [seen, setSeen] = useState<string[]>(loadSeen);
  const [later, setLater] = useState<string[]>(loadLater);
  /** A title's action menu stays inside the chat panel, sliding left when there's no room on the right. */
  // a title's poster shows while the pointer rests on it
  const [peek, setPeek] = useState<{ x: number; y: number; src: string } | null>(null);
  const peekAt = useRef<string>("");
  const showPeek = (e: React.MouseEvent) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("b.film-link");
    if (!b) return;
    const name = (b.dataset.film ?? b.textContent ?? "").trim();
    peekAt.current = name;
    // beside the panel (left of it), level with the title; the title's own menu opens below it, so never there
    const r = b.getBoundingClientRect();
    const box = b.closest(".chat-panel, .ws-main")?.getBoundingClientRect();
    const W = 160, H = 240;
    const py = Math.max(8, Math.min(window.innerHeight - H - 8, r.top + r.height / 2 - H / 2));
    const x = box && box.left > W + 20 ? box.left - W - 12 : box && window.innerWidth - box.right > W + 20 ? box.right + 12 : Math.max(8, r.left);
    const top = box && (box.left > W + 20 || window.innerWidth - box.right > W + 20) ? py : Math.max(8, r.top - H - 10);
    const at = (src: string) => { if (peekAt.current === name) setPeek({ x, y: top, src }); };
    if (posterCache.has(name)) { const s = posterCache.get(name); if (s) at(s); return; }
    const m = name.match(/^(.*?)\s*\((\d{4})\)\s*$/);
    const title = m ? m[1] : name, y = m ? Number(m[2]) : undefined;
    (async () => {
      const h = (await searchTmdb(title, "movie", y).catch(() => []))[0] ?? (await searchTmdb(title, "tv", y).catch(() => []))[0];
      const s = h?.poster ? (h.poster.startsWith("http") ? h.poster : IMG + "w342" + h.poster) : "";
      posterCache.set(name, s);
      if (s) at(s);
    })();
  };
  const hidePeek = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("b.film-link") && !(e.relatedTarget as HTMLElement | null)?.closest?.("b.film-link")) { peekAt.current = ""; setPeek(null); }
  };
  const fitPop = (e: React.MouseEvent) => {
    showPeek(e);
    const acts = (e.target as HTMLElement).closest(".title-acts") ?? (e.target as HTMLElement).closest("b.film-link")?.nextElementSibling;
    const pop = acts?.querySelector<HTMLElement>(".ta-pop");
    const box = acts?.closest(".ws-main, .chat-panel")?.getBoundingClientRect();
    if (!acts || !pop || !box) return;
    // slide it just enough to stay inside the panel
    const left = acts.getBoundingClientRect().left;
    const x = Math.max(box.left + 12 - left, Math.min(-6, box.right - 16 - left - pop.offsetWidth));
    pop.style.left = x + "px";
  };
  const toggleSeen = (e: React.MouseEvent) => {
    const el = e.target as HTMLElement;
    const fl = el.closest<HTMLElement>("[data-film]");
    if (fl) { openFilm((fl.dataset.film ?? "").replace(/&quot;/g, '"').replace(/&amp;/g, "&")); return; }
    const seenBtn = el.closest<HTMLElement>("[data-seen]");
    const laterBtn = el.closest<HTMLElement>("[data-later]");
    const yt = el.closest<HTMLElement>("[data-yt]");
    const vb = el.closest<HTMLElement>("[data-vote]");
    if (vb) {
      const t = vb.dataset.t ?? "";
      const v = vb.dataset.vote as Vote;
      diarySet(t, undefined, { vote: diaryGet(t)?.vote === v ? undefined : v });
      setSeen(loadSeen());
      return;
    }
    if (seenBtn) setSeen(markSeen(seenBtn.dataset.seen ?? ""));
    else if (laterBtn) setLater(markLater(laterBtn.dataset.later ?? ""));
    else if (yt) openUrl(youtubeTrailer(yt.dataset.yt ?? ""));
    else { const a = el.closest<HTMLElement>("[data-url]"); if (a) openUrl(a.dataset.url ?? ""); }
  };
  // a title clicked in an answer: its page comes in as a new answer, straight from TMDB (no model call)
  const pickFilm = async (c: Choice) => {
    if (busy) return;
    setBusy(true); setSteps([{ kind: "page", text: tt("Filmin sayfasını hazırlıyorum") }]);
    toolCtx.media = { images: [], people: [], links: [] };
    try {
      await runTool("show_film", { tmdb_id: c.id, kind: c.kind, title: c.title, year: c.year });
      const md_ = toolCtx.media;
      if (md_.film) setMsgs((l) => [...l, { role: "model", text: "", film: md_.film, ...(md_.images.length ? { images: md_.images } : {}),
        ...(md_.people.length ? { people: md_.people } : {}), ...(md_.links.length ? { links: md_.links } : {}) }]);
    } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  };
  toolCtx.pickFilm = pickFilm;
  const openFilm = async (t: string) => {
    if (busy) return;
    // the page opens below: follow it there, and the hover poster goes away
    stick.current = true; peekAt.current = ""; setPeek(null);
    setBusy(true); setSteps([{ kind: "page", text: tt("Filmin sayfasını hazırlıyorum") }]);
    toolCtx.media = { images: [], people: [], links: [] };
    const y = t.match(/\((\d{4})\)\s*$/)?.[1];
    try {
      const res = await runTool("show_film", { title: t.replace(/\s*\(\d{4}\)\s*$/, ""), year: y });
      const md_ = toolCtx.media;
      if (md_.choices) { setMsgs((l) => [...l, { role: "model", text: tt("Bu adda birden fazla yapım var, hangisi?"), choices: md_.choices }]); return; }
      if (!md_.film) { setErr(res); return; }
      setMsgs((l) => [...l, { role: "model", text: "", film: md_.film, ...(md_.images.length ? { images: md_.images } : {}),
        ...(md_.people.length ? { people: md_.people } : {}), ...(md_.links.length ? { links: md_.links } : {}) }]);
    } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  };
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  // a new step finishes the one before it
  const step = (kind: StepKind, text: string) => setSteps((l) => (l[l.length - 1]?.text === text ? l : [...l.map((x) => ({ ...x, done: true })), { kind, text }]));
  const [err, setErr] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const key = aiKey();

  // the answer follows as it is written; if the user scrolled up, leave them there
  useEffect(() => {
    if (!busy) saveThread(msgs);
    const el = bodyRef.current;
    if (!el || !stick.current) return;
    const id = requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
    return () => cancelAnimationFrame(id);
  }, [msgs, busy, musicPrev]);

  const send = async (text: string, base?: Msg[], ask?: string) => {
    if (!text.trim() || busy || (!key && !text.trim().startsWith("/"))) return;
    const next: Msg[] = [...(base ?? msgs), { role: "user", text: text.trim(), ...(ask ? { ask } : {}) }];
    const myConv = convId;
    setMsgs(next); setInput(""); setErr(""); setBusy(true); setSteps([]);
    toolCtx.media = { images: [], people: [], links: [] };
    // "/" commands: Luna answers them itself, so they work with every AI
    if (text.trim().startsWith("/")) {
      const c = findSlash(text);
      const say = (reply: string, keep = true) => { const done: Msg[] = [...next, { role: "model", text: reply }]; if (keep) { setMsgs(done); saveThread(done); } setBusy(false); };
      if (!c) { say(tt("“{0}” diye bir komut yok. Bütün komutlar için /help yaz.", text.trim().split(/\s+/)[0])); return; }
      if (c.id === "help") { say(helpText(aiName())); return; }
      if (c.id === "new") { setBusy(false); newChat(); return; }
      if (c.id === "model") { say(tt("Şu an {0} cevap veriyor (model: {1}). Değiştirmek için /ayarlar › Hesaplar ve anahtarlar; orada birden fazla API profili de kaydedebilirsin.", aiName(), aiModel())); return; }
      if (c.id === "big" || c.id === "small") { setBig(c.id === "big"); setMsgs(base ?? msgs); setBusy(false); return; }
      if (c.id === "settings" || c.id === "history" || c.id === "collections") { setBusy(false); setMsgs(base ?? msgs); goPlace(c.id); return; }
      const acts: Record<string, PlayerAct> = { pause: "pause", resume: "resume", next: "next", prev: "previous" };
      say(playerControl(acts[c.id])); return;
    }
    // a link Luna handles itself: a card with its own buttons, no need to ask the model
    const act = linkAct(text);
    if (act) {
      const hop: Mode = act.kind === "torrent" ? "film" : act.kind === "book" ? "books" : "music";
      const done: Msg[] = [...next, { role: "model", text: ACT_TEXT[act.kind], act, ...(hop !== mode ? { hop: [hop] } : {}) }];
      setMsgs(done); saveThread(done); setBusy(false);
      return;
    }
    // "durdur", "sonraki", "sesi kıs": done at once, no waiting for the model (and no answer it only pretends to have done)
    const qc = quickCommand(text);
    if (qc) {
      const done: Msg[] = [...next, { role: "model", text: playerControl(qc.act, qc.value) }];
      setMsgs(done); saveThread(done); setBusy(false);
      return;
    }
    try {
      // Trivia / behind-the-scenes questions are answered from a live Google search, with sources.
      // (not when something is to be made: a collection or a list needs Luna's tools, not a web search)
      // (typos too: "koleksion", "kolleksiyon"; and any "yap / ekle / topla / indir…" request)
      // (only Gemini has Google search: OpenAI, Claude and the rest answer these with Luna's tools at hand)
      const ground = TRIVIA.test(text) && !MAKES.test(text) && aiProvider() === "gemini";
      const wantsPick = /öner|ne izle|izlesem|uygun|hangisi|seç|recommend|suggest|what should i watch|pick/i.test(text);
      // a message that names one of the open things ("çalan şarkı…") is about that one; the chooser follows it
      const hint = focuses.length > 1 ? focusHint(text) : null;
      const about = (hint && focus?.kind !== hint && focuses.find((f) => f.kind === hint)) || focus;
      if (about && about !== focus) setPick(about.id);
      if (ground) step("search", tt("İnternette araştırıyorum"));
      else if (URL_RE.test(text)) step("page", tt("Bağlantıya bakıyorum"));
      else if (wantsPick && !viewing && getRecsView()) { step("list", tt("Listeyi tarıyorum")); setTimeout(() => step("taste", tt("Zevkine göre seçiyorum")), 1600); }
      else if (wantsPick) step("taste", tt("Zevkine bakıyorum"));
      else step("think", tt("Düşünüyorum"));
      const body: any = {
        // a link in the message: Gemini opens the page itself (URL context); trivia: Google search; otherwise Luna's tools
        tools: ground ? [{ google_search: {} }] : TOOLS,
        systemInstruction: { parts: [{ text: (mode === "film"
          ? SYSTEM + SYSTEM_PARTS + (lang() === "en" ? SYSTEM_EN : "") + "\n\n# Kullanıcı profili\n" + profile(items, recent) + (viewing ? viewingNote(viewing) : topOpenTitle() ? openTitleNote() : recsViewNote(getRecsView()))
          : (mode === "music" ? SYSTEM_MUSIC : SYSTEM_BOOKS) + SYSTEM_PARTS + (lang() === "en" ? SYSTEM_EN_PART : "") + "\n\n# Kullanıcı profili\n" + (mode === "music" ? await musicProfile() : await booksProfile())) + focusNote(focuses, about, mode) + "\n\n" + mineContext() + todayNote() }] },
        // what the chat showed counts too: a film page opened by a click, the same-name choices
        contents: next.slice(-20).map((m) => ({ role: m.role, parts: [{ text: [
          m.ask ?? m.text,
          m.film ? `[Sohbette şu filmin sayfası açıldı ve kullanıcı ona bakıyor: ${m.film.title}${m.film.original && m.film.original !== m.film.title ? ` / ${m.film.original}` : ""} (${m.film.year}), TMDB ${m.film.kind} ${m.film.id}${m.film.director ? `, yönetmen ${m.film.director}` : ""}. "Bu film", "bu" gibi ifadeler bunu kasteder.]` : "",
          m.choices ? `[Aynı adlı seçenekler gösterildi: ${m.choices.map((c) => `${c.title} (${c.year})`).join(", ")}]` : "",
          m.source ? `[Kütüphanede yok, kaynak kutusu gösterildi: ${m.source.title}]` : "",
          m.book ? `[Ücretsiz kitap bulundu; “Bu kitap mı?” kartı gösterildi: ${m.book.query}]` : "",
          m.song ? `[Şarkı arşivde yok, YouTube'da bulundu; onay kartı gösterildi: ${m.song.query}]` : "",
        ].filter(Boolean).join(" ") || "…" }] })),
      };
      // A link in the message: Luna downloads the page itself and hands its text to the assistant.
      const link = text.match(URL_RE)?.[0];
      if (link) {
        body.contents[body.contents.length - 1].parts[0].text += `\n\n[Mesajda bağlantı var: ${link}. Filmleri önerilere aktarmak için import_link, arkadaşın hesabını bağlamak için follow_letterboxd, sadece göz atmak için read_link kullan. Kimin olduğu belli değilse önce sor.]`;
      }
      // Questions that need pictures or links: the model is made to call the right tool (it tends to just answer from memory)
      const tn = trAscii(text);
      const force: [RegExp, string[], string][] = [
        [/\b(ac|oynat|baslat|cal|dinlet|oku)\b|\bacar misin|\bacabilir|\bcalar misin|\b(open|play|start|read|listen)\b/, ["open_from_library", "play_music", "play_radio", "play_podcast", "open_book", "get_free_book", "find_free_books", "play_audiobook"],
          mode === "film" ? "İstenen şeyi açan aracı çağır: film/dizi için open_from_library (tam o filmi; yılı biliyorsan ver), müzik için play_music/play_radio/play_podcast, kitap için open_book/play_audiobook."
            : mode === "music" ? "İstenen şeyi açan aracı çağır: müzik için play_music, radyo için play_radio, podcast için play_podcast; film ya da kitap isteniyorsa open_from_library / open_book."
            : "İstenen şeyi açan aracı çağır: kitap için open_book (kitaplıkta yoksa find_free_books), sesli kitap için play_audiobook; film ya da müzik isteniyorsa open_from_library / play_music."],
        [/\bkim(ler)?\b.{0,30}(oyn|rol|yonet|cek|yapt|yapm|cizd|yazd)|(yapt|yapm|cekt|cekm|yonett)\w* (kim|kimdir)|oyuncu|kadro|basrol|yonetmen|senarist|\bcast\b|\bwho (stars|starred|acted|directed|plays|played|is in|was in|made|wrote)\b|\bactors?\b|\bdirector\b|\bstarring\b/, ["show_film"], "show_film aracını çağır (filmin sayfası: fotoğraflı kadro, yönetmen, hikaye)."],
        [/hakkinda|anlat|\bkonusu\b|\bhikayesi\b|nasil bir (film|dizi)|ne anlatiyor|neyi anlatiyor|\bbilgi|incele|\bnedir\b|nasil bir sey|tell me about|what'?s .{0,40}\babout\b|\bplot\b|synopsis|storyline/, ["show_film"], "show_film aracını çağır (filmin sayfası), sonra sorulanı cevapla."],
        [/nere(de|den)?\s*(izle|bul|seyret)|nerden izle|hangi platform|izleyebilir|\blink|baglanti|imdb|vikipedi|wikipedia|where (can i |to |do i )?(watch|stream|find)|streaming|which platform|\blinks?\b/, ["film_links"], "film_links aracını çağır; bilmediğin platformu uydurma."],
        [/gorsel|fotograf|foto\b|resim|afis|poster|sahne|kare(ler)?|pictures?|photos?|images?|stills?|scenes?|screenshots?/, ["show_images", "show_person"], "show_images (kişi için show_person) aracını çağır."],
      ];
      // "zevkimi anlat", "listeyi anlat", "5 film öner" are not about one film
      // "vampir konusunu sevmiyorum", "korku olmasın": a taste, not a question about one film (no film page for it)
      const opinion = /\b(sev(m|di|iyor|erim|mem)|hoslan|begen|nefret|ilgimi cek|istemiyorum|olmasin|sikici|bayil|bana gore degil|tarzim degil)|\b(i (don'?t |do not )?(like|love|hate|enjoy)|not into|don'?t want|boring)\b/.test(tn);
      const notOneFilm = /zevk|liste|oneri|oner\b|kutuphan|\bbeni\b|\bbenim\b|arkadas|filmler|taste|\blists?\b|recommend|suggest|library|\bme\b|\bmy\b|friend|films|movies|shows/.test(tn);
      force.unshift([/\bvar mi\b|\bbizde\b|kutuphanemde|arsivimde|kitapligimda|do i (have|own)|is there .* in my|in my library/, ["search_books", "search_music", "search_film_library"],
        mode === "books" ? "Önce search_books ile kitaplıkta ara." : mode === "music" ? "Önce search_music ile arşivde ara." : "Önce search_film_library ile film kütüphanesinde ara."]);
      const want = ground ? undefined : force.find(([re, tools]) => re.test(tn) && (mode === "film" || tools.includes("open_book") || tools.includes("search_books")) && !(tools[0] === "show_film" && opinion)
        // a Letterboxd profile, a friend's list, a link: that is read_link / list_playlists, not one film's links
        && !(tools[0] === "film_links" && (link || /letterboxd|profil|liste|\blist|izledi|watched|arkadas|friend/.test(tn))) && !(tools[0] === "show_film" && notOneFilm && !/oyn|kadro|yonetmen|\bwho\b|\bcast\b|director/.test(tn)));
      if (want) {
        body.contents[body.contents.length - 1].parts[0].text += `

[${want[2]}]`;
        body.toolConfig = { functionCallingConfig: { mode: "ANY", allowedFunctionNames: want[1] } };
      }
      // A collection is made from what the internet says today (new films, latest books), not from memory.
      // First: is there a collection on this already? Then it says so and offers to look again for new things.
      const yes = /^\s*(evet|olur|tamam(dır)?|bak|bakalım|hadi|tabii|tabi|elbette|yes|sure|ok(ay)?|go ahead)\b/i.test(text) && text.length < 60;
      const again = recheck && yes ? loadCollections().find((c) => c.id === recheck) : undefined;
      recheck = null;
      const have = again ?? (!ground && COLLECT.test(text) ? sameCollection(text) : undefined);
      const lookAgain = !!again || (!!have && /tekrar|yeniden|güncelle|yeni (şey|çıkan|gelen)|eksik|refresh|update|again|new (ones|stuff)/i.test(text));
      const last = body.contents[body.contents.length - 1].parts[0];
      if (have && !lookAgain) {
        // nothing is made: the assistant tells the user and offers to look again (a "yes" next does it)
        step("list", tt("Koleksiyonlarına bakıyorum"));
        recheck = have.id;
        last.text += `\n\n[Bu konuda kullanıcının ZATEN bir koleksiyonu var: “${have.name}” (${collectionSummary(have)}). make_collection ÇAĞIRMA. Kısaca bunu söyle ve “İstersen yeni çıkanlar ve eksikler için internete tekrar bakayım” diye sor.]`;
      } else if (lookAgain || (!ground && COLLECT.test(text))) {
        step("search", tt("İnternette araştırıyorum"));
        const facts = aiProvider() !== "gemini" ? "" : await researchCollection(key, [...next.slice(-6), ...(have ? [{ role: "user", text: `(Konu: “${have.name}” koleksiyonu)` } as Msg] : [])]).catch(() => "");
        if (facts) last.text += `\n\n[İnternet araştırması (Google, bugün yapıldı). Koleksiyonu hafızana göre DEĞİL buna göre yap; kullanıcının sınırlarına ("yeni", "sadece filmler" gibi) yine uy:\n${facts}]`;
        if (have) last.text += `\n\n[Kullanıcı “${have.name}” koleksiyonu için tekrar bakılmasını istedi. make_collection'ı AYNI adla (“${have.name}”) çağır ve SADECE koleksiyonda olmayan yeni ya da eksik şeyleri ver. Koleksiyonda şunlar zaten var: ${have.items.map((x) => x.title).join("; ")}. Yeni bir şey yoksa make_collection çağırma, koleksiyonun güncel olduğunu söyle.]`;
        step("list", tt("Listeyi çıkarıyorum"));
      }
      let { r, model: used } = await geminiWithFallback(key, body);
      // Tool calls: run them here, hand the results back, let the model answer (a few rounds at most).
      const done_: string[] = [];
      const hops: Mode[] = [];
      const undoIds: string[] = [];
      for (let round = 0; round < 5; round++) {
        const parts: any[] = r?.candidates?.[0]?.content?.parts ?? [];
        const calls = parts.filter((p) => p.functionCall);
        if (!calls.length) break;
        const results = [];
        // what needs a yes from the user: changes always, opening unless they turned it off, deleting with its choices
        const asking = calls.filter((c) => CHANGES.has(c.functionCall.name) || DELETES.has(c.functionCall.name) || (OPENS.has(c.functionCall.name) && askOpens()));
        const refused = new Set<any>();
        if (asking.length) {
          step("think", tt("Onayını bekliyorum"));
          // each delete gets its own card with its own files and choices
          for (const del of asking.filter((c) => DELETES.has(c.functionCall.name))) {
            const plan = await deletePlan(del.functionCall.name, del.functionCall.args);
            // nothing found to delete: no card, the tool says so (the other changes are still asked about)
            if (!plan?.files.length) continue;
            const v = await confirmCalls("delete", [describeTool(del.functionCall.name, del.functionCall.args)], plan.files.map((f) => f.split(/[\\/]/).pop()!), plan.opts);
            if (v === "cancel") refused.add(del);
            else del.functionCall.args = { ...del.functionCall.args, _how: v };
          }
          const rest = asking.filter((c) => !DELETES.has(c.functionCall.name));
          if (rest.length) {
            const colls = rest.filter((c) => c.functionCall.name === "make_collection");
            // the films are checked on TMDB before the card: the whole series, the newest one, what's still to come
            if (colls.length) {
              step("hop-film", tt("Filmleri TMDB'de kontrol ediyorum"));
              for (const c of colls) c.functionCall.args = await completeFilms(c.functionCall.args, key).catch(() => c.functionCall.args);
              step("think", tt("Onayını bekliyorum"));
            }
            const v = await confirmCalls(rest.some((c) => CHANGES.has(c.functionCall.name)) ? "change" : "open", rest.map((c) => describeTool(c.functionCall.name, c.functionCall.args)), undefined, undefined,
              colls.flatMap((c, ci) => collectionGroups(c.functionCall.args, ci)));
            if (v === "cancel") rest.forEach((c) => refused.add(c));
            // what was unticked stays out
            else colls.forEach((c, ci) => { c.functionCall.args = dropCollectionItems(c.functionCall.args, ci, askOffRef.current); });
          }
        }
        const willChange = calls.some((c) => undoable(c.functionCall.name) && !refused.has(c));
        const before = willChange ? snapshot() : null;
        for (const c of calls) {
          if (refused.has(c)) {
            done_.push("✕ " + tt("İptal edildi: {0}", describeTool(c.functionCall.name, c.functionCall.args)));
            results.push({ functionResponse: { name: c.functionCall.name, response: { result: "Kullanıcı bu işlemi İPTAL ETTİ; yapılmadı. Bunu kısaca söyle, tekrar deneme." } } });
            continue;
          }
          const home = TOOL_MODE[c.functionCall.name];
          if (home && home !== mode) { step(("hop-" + home) as StepKind, HOP_TEXT[home]); if (!hops.includes(home)) hops.push(home); }
          else if (c.functionCall.name === "make_collection") {
            // a collection gathers from every part: each part's own little animation in turn
            const ks = new Set(collectionItems(c.functionCall.args).map((x) => x.kind));
            if (ks.has("film")) step("hop-film", tt("Filmleri topluyorum"));
            if (ks.has("music")) step("hop-music", tt("Müzikleri topluyorum"));
            if (ks.has("book")) step("hop-books", tt("Kitapları topluyorum"));
            step("list", tt("Koleksiyonu hazırlıyorum"));
          }
          else { const [k, t] = TOOL_STEP[c.functionCall.name] ?? (home === "music" ? ["hop-music", tt("Müziğe bakıyorum")] : home === "books" ? ["hop-books", tt("Kitaplara bakıyorum")] : ["think", tt("Çalışıyorum")]); step(k as StepKind, t); }
          // a request about songs never goes through the film list tool: it becomes a real music playlist
          const musicAsk = /şarkı|müzik|song|music|çalma listesi/i.test(text);
          let res = c.functionCall.name === "add_to_playlist" && musicAsk
            ? await makeMusicPlaylist(c.functionCall.args)
            : await runTool(c.functionCall.name, c.functionCall.args);
          const SEARCH: Record<string, Mode> = { search_film_library: "film", search_music: "music", search_books: "books", open_book: "books", play_music: "music", open_from_library: "film" };
          const where = SEARCH[c.functionCall.name];
          const q = String(c.functionCall.args?.query ?? c.functionCall.args?.title ?? "").trim();
          if (where && q && /bulunamad|bulamad|yok\b|not found/i.test(res)) {
            const others: [Mode, string][] = ([["film", "search_film_library"], ["books", "search_books"], ["music", "search_music"]] as [Mode, string][]).filter(([m]) => m !== where);
            const extra: string[] = [];
            for (const [m, tool] of others) {
              step(("hop-" + m) as StepKind, HOP_TEXT[m]);
              const r2 = await runTool(tool, { query: q }).catch(() => "");
              if (r2 && !/bulunamad|boş|eklememiş/i.test(r2)) { extra.push(`${MODE_NAME[m]}: ${r2}`); if (m !== mode && !hops.includes(m)) hops.push(m); }
            }
            res += extra.length ? `\n[Diğer bölümlerde bulunanlar — kullanıcıya söyle] ${extra.join(" | ")}` : "\n[Diğer bölümlerde de yok]";
          }
          const SHORT: Record<string, string> = { show_film: tt("Film sayfası açıldı"), show_images: tt("Görseller getirildi"), show_person: tt("Fotoğraflar getirildi"), film_links: tt("Bağlantılar bulundu") };
          // the note under the answer stays one short line: what the tool returned is for the model, not for reading
          const READ: Record<string, string> = { open_from_library: /^Açılıyor/.test(res) ? res : tt("Kütüphanede yok · kaynak istendi"), list_playlists: tt("Listelere bakıldı"), list_recommendations: tt("Önerilere bakıldı"), read_link: tt("Bağlantı okundu") };
          const short = SHORT[c.functionCall.name] && !/bulunamadı/i.test(res) ? SHORT[c.functionCall.name]
            : READ[c.functionCall.name] ?? (res.length > 120 ? res.slice(0, 110).replace(/\s+\S*$/, "") + "…" : res);
          done_.push(short);
          results.push({ functionResponse: { name: c.functionCall.name, response: { result: res } } });
        }
        if (before) {
          const id = Date.now().toString(36) + round;
          undos.unshift({ id, label: calls.filter((c) => undoable(c.functionCall.name) && !refused.has(c)).map((c) => describeTool(c.functionCall.name, c.functionCall.args)).join(" · "), snap: before, after: snapshot() });
          undos.splice(10);
          undoIds.push(id);
        }
        body.contents = [...body.contents, { role: "model", parts }, { role: "user", parts: results }];
        delete body.toolConfig; // only the first round is forced
        step("write", tt("Derliyorum"));
        ({ r, model: used } = await geminiWithFallback(key, body));
      }
      if (done_.length) { setSeen(loadSeen()); setLater(loadLater()); }
      const outText = (r?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? "").join("").trim();
      // "bir film öner" answered with one film: that film's page too
      const askedForOne = /\boner|\bizlesem|recommend|suggest|what should i watch/.test(tn);
      // a film page the model opened on its own for a taste remark, or one already shown in this chat, is left out
      const shownBefore = new Set(next.filter((m) => m.film).map((m) => m.film!.id));
      const askedAbout = /hakkinda|anlat|\bkonusu\b|oyuncu|kadro|yonetmen|\bkim\b|tell me about|\bplot\b|\bcast\b|director/.test(tn);
      if (toolCtx.media.film && (opinion || (shownBefore.has(toolCtx.media.film.id) && !askedAbout))) toolCtx.media.film = undefined;
      // only for "bir film öner" answered with exactly one film
      if (!toolCtx.media.film && !toolCtx.media.choices && !toolCtx.media.source && !ground && askedForOne && !opinion) {
        const titles = [...new Set([...outText.matchAll(/\*\*([^*]+?\((?:19|20)\d{2}\))\*\*/g)].map((x) => x[1].trim()))];
        if (titles.length === 1) {
          const t = titles[0];
          const name = t.replace(/\s*\(\d{4}\)\s*$/, "");
          const y = t.match(/\((\d{4})\)\s*$/)![1];
          step("page", tt("Filmin sayfasını hazırlıyorum"));
          // only when TMDB has a film by exactly that name (a bolded director or actor must not turn into a page)
          const h = await findTitle({ title: name, year: y }).catch(() => undefined);
          const k = norm(name).replace(/^(the|a|an) /, "");
          if (h && !shownBefore.has(h.id) && norm(h.title).replace(/^(the|a|an) /, "") === k) await runTool("show_film", { tmdb_id: h.id, kind: h.kind, title: h.title, year: h.year }).catch(() => "");
        }
      }
      const out = outText || (done_.length ? done_.join("\n") : "");
      const chunks: any[] = r?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      const sources: Source[] = chunks.map((c) => c.web).filter(Boolean).map((w: any) => ({ title: w.title || w.uri, uri: w.uri }))
        .filter((x, i, a) => a.findIndex((y) => y.title === x.title) === i).slice(0, 6);
      const md_ = toolCtx.media;
      const media = { ...(md_.choices && !md_.film ? { choices: md_.choices } : {}), ...(md_.source ? { source: md_.source } : {}), ...(md_.song ? { song: md_.song } : {}), ...(md_.book ? { book: md_.book } : {}), ...(md_.film ? { film: md_.film } : {}), ...(md_.images.length ? { images: md_.images } : {}), ...(md_.people.length ? { people: md_.people } : {}), ...(md_.links.length ? { links: md_.links } : {}) };
      const done: Msg[] = [...next, { role: "model", text: out || tt("(boş yanıt)"), ...media, ...(hops.length ? { hop: hops } : {}), ...(sources.length ? { sources } : {}), ...((used.note || done_.length) ? { note: [...done_.map((d) => (d.startsWith("✕") ? d : "✓ " + d)), used.note].filter(Boolean).join(" · ") } : {}), ...(undoIds.length ? { undo: undoIds.join(",") } : {}) }];
      if (convRef.current !== myConv) {
        // another chat is open now: the answer is kept in its own conversation
        const c = loadConvs().find((x) => x.id === myConv);
        if (c) saveConv({ ...c, at: Date.now(), msgs: done.slice(-60) });
        bumpHist((n) => n + 1);
        return;
      }
      saveThread(done); // keeps the answer even if the user already switched pages
      setMsgs(done);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  const sendRef = useRef(send);
  sendRef.current = send;
  // a question sent from a menu while an answer is being written waits for it, then goes
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const takeRef = useRef(() => {});
  useEffect(() => {
    const take = () => { const t = pendingAsk; if (!t || busyRef.current) return; pendingAsk = null; setTimeout(() => sendRef.current(t.show ?? t.text, undefined, t.show ? t.text : undefined), 60); };
    takeRef.current = take;
    take();
    window.addEventListener("luna-ask", take);
    return () => window.removeEventListener("luna-ask", take);
  }, []);
  useEffect(() => { if (!busy) takeRef.current(); }, [busy]);
  const LINK_ICON: Record<string, [string, string]> = { imdb: ["IMDb", "#f5c518"], lb: ["LB", "#00c030"], tmdb: ["TM", "#01b4e4"], wiki: ["W", "#ffffff"], yt: ["▶", "#ff3b3b"], jw: ["JW", "#ffd23f"] };
  const head = (
    <div className="chat-head">
      {!big && <><span className="chat-dot" /><div className="chat-who"><b>{tt("Luna Asistan")}</b><small className="ellipsis" title={aiName() + " · " + aiModel()}>{aiName()} · {aiModel()}</small></div></>}
      {big && <h2 className="ws-title ellipsis">{msgs.find((m) => m.role === "user")?.text.slice(0, 60) ?? tt("Yeni sohbet")}</h2>}
      <span className={"chat-ctx ellipsis" + (viewing || rv || topOpenTitle() || ctxFocus ? " page" : "")} title={viewing ? tt("Bu sohbet bu sayfaya ait") : rv ? tt("Asistan şu an açık olan öneri listesine bakıyor") : tt("Genel sohbet")}>{msgs.length && !rv && !topOpenTitle() && !ctxFocus ? loadConvs().find((c) => c.id === convId)?.ctx ?? ctxLabel : ctxLabel}</span>
      <span className="grow" />
      {!big && msgs.length > 0 && <button className="round glass-ib" aria-label={tt("Yeni sohbet")} title={tt("Yeni sohbet")} onClick={newChat}><Icon d={I.plus} size={18} /></button>}
      <button className={"round glass-ib" + (!big ? " hl" : "")} aria-label={big ? tt("Küçült") : tt("Büyüt")} title={big ? tt("Küçült") : tt("Büyük çalışma alanı")} onClick={() => setBig(!big)}>
        <svg viewBox="0 0 24 24" className="ib-svg">{big ? <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" /> : <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />}</svg>
        {!big && tipSeen < 3 && <span className="big-tip">{tt("⤢ Büyük çalışma alanı")}</span>}
      </button>
      <button className="round glass-ib" aria-label={tt("Baloncuğa küçült")} title={tt("Baloncuğa küçült · sohbet kaldığı yerden devam eder")} onClick={onClose}><svg viewBox="0 0 24 24" className="ib-svg"><path d="M5 12h14" /></svg></button>
      <button className="round glass-ib" aria-label={tt("Kapat")} title={tt("Kapat")} onClick={onClose}><Icon d={I.x} size={18} /></button>
    </div>
  );
  const body = (
    <div className="chat-body" ref={bodyRef} data-peek={peek ? 1 : undefined} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 140; }}>
      <div className="chat-col">
        {peek && createPortal(<img className="chat-peek" src={peek.src} alt="" style={{ left: peek.x, top: peek.y }} onError={() => setPeek(null)} />, document.body)}
        {!key && <div className="chat-note">{tt("Asistan için Ayarlar'a")} <b>{tt("bir yapay zekâ anahtarı")}</b>  {tt("gir: Gemini (aistudio.google.com, ücretsiz), OpenAI, Claude ya da kendi sunucun (base URL).")}</div>}
        {!msgs.length && key && (
          <div className="chat-empty">
            <div className="muted">{mode === "music" ? tt("Ne dinlemek istediğini söyle; arşivine, beğendiklerine ve geçmişine bakıp çalayım ya da önereyim. Radyo, podcast ve koleksiyon da yapabilirim.")
              : mode === "books" ? tt("Ne okumak istediğini söyle; kitaplığına, okuma geçmişine ve beğenilerine bakıp önereyim. Ücretsiz kitapları bulup kitaplığına da getirebilirim.")
              : tt("Ne izlemek istediğini söyle; beğenilerine, geçmişine ve arkadaşlarının önerilerine bakıp önereyim. Görsel ve bağlantı da getirebilirim.")}</div>
            <div className="chat-quick">{byLength((focuses.length > 1 || music.view) && focus?.kind === "music" && mode !== "music" ? MODE_QUICK.music() : viewing ? PAGE_QUICK(viewing.parsed.kind) : rv ? RECS_QUICK : mode !== "film" ? MODE_QUICK[mode]() : QUICK).map((x) => <button key={x} className="chip" onClick={() => send(x)}>{x}</button>)}</div>
          </div>
        )}
        {msgs.map((m, i) => {
          const { body, chips } = m.role === "model" ? splitChips(m.text) : { body: m.text, chips: [] };
          const last = i === msgs.length - 1 && m.role === "model" && !busy;
          return (
            <div key={i} className={"msg-wrap " + m.role}>
              {m.film && <FilmPage f={m.film} onPlay={toolCtx.play} />}
              {m.source && <SourceBox s={m.source} />}
              {m.song && <SongBox s={m.song} />}
              {m.book && <FreeBookBox s={m.book} />}
              {m.choices && (
                <div className="choices">
                  {m.choices.map((c) => (
                    <button key={c.kind + c.id} className="choice" onClick={() => toolCtx.pickFilm?.(c)} title={tt("{0} ({1}) sayfasını aç", c.title, c.year)}>
                      <div className="choice-poster" style={c.poster ? { backgroundImage: `url(${IMG}w185${c.poster})` } : undefined}>{!c.poster && <Icon d={I.film} size={20} />}</div>
                      <b className="ellipsis">{c.title}</b>
                      <span>{c.year}{c.kind === "tv" ? tt(" · Dizi") : ""}{c.rating ? ` · ★ ${String(c.rating).replace(".", DEC)}` : ""}</span>
                    </button>
                  ))}
                </div>
              )}
              {m.images && (
                <div className={"msg-gal n" + Math.min(m.images.length, 5)}>
                  {m.images.slice(0, 5).map((p, j) => (
                    <button key={p.src} className="gal-item" style={{ backgroundImage: `url(${p.src})` }} onClick={() => setZoom(p)} title={p.caption}>
                      {j === 4 && m.images!.length > 5 ? <span className="gal-more">+{m.images!.length - 5}</span> : null}
                    </button>
                  ))}
                </div>
              )}
              {(m.role === "user" || m.text) && <div className={"msg " + m.role} {...(m.role === "model" ? { dangerouslySetInnerHTML: { __html: md(body, seen, later) }, onClick: toggleSeen, onMouseOver: fitPop, onMouseOut: hidePeek } : { children: body })} />}
              {m.people && (
                <div className="msg-people">
                  {m.people.map((f) => (
                    <button key={f.name + f.role} className="msg-person" onClick={() => f.url && openUrl(f.url)} title={f.url ? tt("TMDB'de aç") : undefined}>
                      <div className="face">{f.photo ? <img src={`${IMG}w185${f.photo}`} alt="" loading="lazy" /> : f.name[0]}</div>
                      <b className="ellipsis">{f.name}</b><span className="ellipsis">{f.role}</span>
                    </button>
                  ))}
                </div>
              )}
              {m.links && (
                <div className="msg-links">
                  {m.links.map((k) => (
                    <button key={k.url} className="lk-card" onClick={() => openUrl(k.url)} title={k.url}>
                      <i style={{ background: LINK_ICON[k.kind]?.[1] ?? "#888" }}>{LINK_ICON[k.kind]?.[0] ?? "↗"}</i>{k.label}
                    </button>
                  ))}
                </div>
              )}
              {m.hop && <div className="msg-hops">{m.hop.map((h) => <span key={h} className={"hop-chip " + h}>→ {MODE_NAME[h]}</span>)}</div>}
              {m.act && <LinkActCard act={m.act} onState={(st, info, pl) => {
                const next = msgs.map((x) => (x === m ? { ...x, act: { ...x.act!, state: st, info, pl } } : x));
                setMsgs(next); saveThread(next);
              }} />}
              {m.note && <div className="msg-note">{m.note}</div>}
              {m.undo && (() => {
                const mine = m.undo.split(",").map((id) => undos.find((u) => u.id === id)).filter(Boolean) as Undo[];
                if (!mine.length) return null;
                return (
                  <div className="msg-undo">
                    <button className="chip" title={mine.map((u) => u.label).join("\n")} onClick={() => {
                      // the answer's first round holds the state before it, its last round the state after it
                      restoreSnapshot(mine[0].snap, mine[mine.length - 1].after);
                      for (const u of mine) undos.splice(undos.indexOf(u), 1);
                      const next = msgs.map((x) => (x === m ? { ...x, undo: undefined, note: [x.note, tt("↶ Geri alındı")].filter(Boolean).join(" · ") } : x));
                      setMsgs(next); saveThread(next); bumpUndo((n) => n + 1);
                    }}>↶ {tt("Geri al")}</button>
                    <span className="muted small">{tt("Bu cevaptaki değişiklikleri geri alır")}</span>
                  </div>
                );
              })()}
              {m.sources && (
                <div className="msg-sources">
                  <span>{tt("Kaynaklar:")}</span>
                  {m.sources.map((src) => (
                    <button key={src.uri} className="src-chip" title={src.uri} onClick={() => openUrl(src.uri)}>{src.title}</button>
                  ))}
                </div>
              )}
              {last && (
                <div className="chat-quick follow">
                  <button className="chip regen" title={tt("Bu yanıtı yeniden üret")} onClick={() => {
                    const ui = msgs.map((x) => x.role).lastIndexOf("user");
                    if (ui >= 0) send(msgs[ui].text, msgs.slice(0, ui), msgs[ui].ask);
                  }}>{tt("↻ Yeniden üret")}</button>
                  {byLength(chips.length ? chips : FOLLOW_UP).map((x) => <button key={x} className="chip" onClick={() => send(x)}>{x}</button>)}
                </div>
              )}
            </div>
          );
        })}
        {ask && (
          <div className={"msg model ask-card " + ask.kind}>
            <b>{ask.kind === "delete" ? tt("Bunu nasıl kaldırayım?") : ask.kind === "open" ? tt("Bunu açayım mı?") : tt("Şunları yapayım mı?")}</b>
            <ul>{ask.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
            {ask.groups?.length ? (
              <div className="ask-groups">
                {ask.groups.map((g, gi) => (
                  <div key={gi} className="ask-group">
                    <div className="ask-group-h">{g.head} <span className="muted">{g.items.filter((x) => !askOff.has(x.key)).length}/{g.items.length}</span></div>
                    {g.items.map((x) => (
                      <label key={x.key} className={"ask-item" + (askOff.has(x.key) ? " off" : "")}>
                        <input type="checkbox" checked={!askOff.has(x.key)} onChange={() => setAskOff((o) => { const n = new Set(o); if (n.has(x.key)) n.delete(x.key); else n.add(x.key); return n; })} />
                        <span>
                          <span className="ask-item-t">{x.title}</span>{x.sub && <span className="muted"> · {x.sub}</span>}
                          {x.note && <span className="muted small ask-item-n">{x.note}</span>}
                        </span>
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            ) : null}
            {ask.files?.length ? <div className="muted small ask-files">{ask.files.slice(0, 4).join(" · ")}{ask.files.length > 4 ? tt(" ve {0} dosya daha", ask.files.length - 4) : ""}</div> : null}
            {ask.kind === "delete" ? (
              <div className="ask-btns">
                {(ask.opts ?? []).map(([v, l, danger]) => <button key={v} className={"chip" + (danger ? " danger" : "")} onClick={() => ask.resolve(v)}>{l}</button>)}
                <button className="chip" onClick={() => ask.resolve("cancel")}>{tt("İptal")}</button>
              </div>
            ) : (
              <div className="ask-btns">
                <button className="primary sm" onClick={() => ask.resolve(ask.groups?.length && ask.groups.every((g) => g.items.every((x) => askOff.has(x.key))) ? "cancel" : "ok")}>{tt("Tamam")}</button>
                <button className="chip" onClick={() => ask.resolve("cancel")}>{tt("İptal")}</button>
                {ask.kind === "open" && <button className="chip ghost-chip" onClick={() => { store.set("assistAskOpen", "0"); ask.resolve("ok"); }}>{tt("Tamam, açarken bir daha sorma")}</button>}
              </div>
            )}
            {ask.kind === "change" && <div className="muted small">{tt("Yaptıktan sonra cevabın altında “Geri al” olur.")}</div>}
          </div>
        )}
        {busy && (
          <div className="msg model working">
            {steps.map((x, i) => (
              <div key={i + x.text} className={"wstep w-" + x.kind + (x.done ? " done" : "")}>
                {x.done ? <span className="step-ok">✓</span> : <StepIcon kind={x.kind} />}
                <span className="step-t">{x.text}{!x.done && <span className="step-dots"><i>.</i><i>.</i><i>.</i></span>}</span>
              </div>
            ))}
          </div>
        )}
        {err && <div className="chat-note err">{err}</div>}
                {musicPrev && <MusicAddPreview name={musicPrev.name} items={musicPrev.items} missing={musicPrev.missing} subs={musicPrev.subs} extend={musicPrev.extend} onDone={(picked) => { prevRef.current = null; musicPrev.resolve(picked); setMusicPrev(null); }} />}
        <div />
      </div>
    </div>
  );
  const inputBar = (
    <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send(input); }}>
      {focuses.length > 1 && (
        <div className="chat-focus" role="radiogroup" aria-label={tt("Ne hakkında konuşuyoruz?")}>
          <span className="chat-focus-q">{tt("Hangisi hakkında?")}</span>
          {focuses.map((f) => (
            <button type="button" key={f.id} role="radio" aria-checked={f === focus} className={"chat-focus-o" + (f === focus ? " on" : "")}
              title={`${f.label} · ${f.sub}`} onClick={() => setPick(f.id)}>
              <Icon d={FOCUS_ICON[f.kind]} size={13} /><span className="ellipsis">{f.label}</span><small>{f.sub}</small>
            </button>
          ))}
        </div>
      )}
      {input.startsWith("/") && !input.includes(" ") && slashMatches(input).length > 0 && (
        <div className="slash-list" role="listbox" aria-label={tt("Komutlar")}>
          {slashMatches(input).map((c) => <button type="button" role="option" aria-selected={false} key={c.id} onClick={() => send(c.cmd)}><b>{c.cmd}</b><span>{c.about()}</span></button>)}
        </div>
      )}
      <div className="chat-box">
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={key ? (big ? tt("Bir şey sor, bir link yapıştır ya da “… fotoğraflarını göster” de") : tt("Bir şey sor…")) : tt("Önce bir yapay zekâ anahtarı gir · /help yazabilirsin")} autoFocus />
        <button className="chat-send" aria-label={tt("Gönder")} disabled={(!key && !input.trim().startsWith("/")) || busy || !input.trim()}>
          <svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
        </button>
      </div>
      {big && <div className="chat-hint">{tt("Esc ya da dışarı tıklama: küçük balona döner · sohbetler solda saklanır")}</div>}
    </form>
  );
  const lightbox = zoom && createPortal(
    <div className="lightbox" onClick={() => setZoom(null)}>
      <img src={zoom.full} alt={zoom.caption ?? ""} />
      {zoom.caption && <div className="lb-cap">{zoom.caption}</div>}
    </div>,
    document.body,
  );

  if (!big) {
    // on body too: over the collections page (which blurs everything inside #root)
    return createPortal(
      <div className="chat-panel glass" onKeyDown={(e) => e.stopPropagation()}>
        {head}{body}{inputBar}{lightbox}
      </div>,
      document.body,
    );
  }

  // ---- the big workspace: history on the left
  const day = 86400000, today = new Date(); today.setHours(0, 0, 0, 0);
  const groupOf = (t: number) => t >= today.getTime() ? tt("Bugün") : t >= today.getTime() - day ? tt("Dün") : t >= today.getTime() - 6 * day ? tt("Bu hafta") : tt("Daha eski");
  const convs = loadConvs().filter((c) => !q.trim() || seenKey(c.title + " " + c.msgs.map((m) => m.text).join(" ")).includes(seenKey(q)));
  const groups: [string, Conv[]][] = [];
  for (const c of convs) { const g = groupOf(c.at); const e = groups.find((x) => x[0] === g); if (e) e[1].push(c); else groups.push([g, [c]]); }
  const hhmm = (t: number) => t >= today.getTime() - day ? new Date(t).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" }) : new Date(t).toLocaleDateString(locale(), { weekday: "short", day: "numeric", month: "short" });
  return createPortal(
    <>
    {/* the blur behind is a sibling, not a parent: nested backdrop filters would leave the glass with nothing to blur */}
    <div className="chat-scrim" />
    <div className="chat-ws-wrap" onMouseDown={(e) => e.target === e.currentTarget && setBig(false)} onKeyDown={(e) => e.stopPropagation()}>
      <div className="chat-ws glass">
        <aside className="ws-side">
          <div className="ws-side-head">
            <div className="ws-brand"><span className="chat-dot" />  {tt("Luna Asistan")}</div>
            <button className="ws-new" onClick={newChat}>{tt("＋ Yeni sohbet")}</button>
            <div className="ws-find"><Icon d={I.search} size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tt("Sohbetlerde ara")} /></div>
          </div>
          <div className="ws-hist">
            {!convs.length && <div className="muted small ws-empty">{q ? tt("Eşleşen sohbet yok.") : tt("Sohbetlerin burada birikecek.")}</div>}
            {groups.map(([g, list]) => (
              <div key={g}>
                <div className="ws-grp">{g}</div>
                {list.map((c) => (
                  <div key={c.id} className={"ws-h" + (c.id === convId ? " on" : "")} onClick={() => openConv(c)}>
                    <b className="ellipsis">{c.title}</b>
                    <small><span className={"ws-ctx " + c.ctxKind}>{c.ctx}</span>{hhmm(c.at)}</small>
                    <button className="ws-del" aria-label={tt("Sohbeti sil")} title={tt("Sohbeti sil")} onClick={(e) => { e.stopPropagation(); delConv(c.id); }}>×</button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </aside>
        <section className="ws-main">
          {head}{body}{inputBar}
        </section>
      </div>
    </div>
    {lightbox}
    </>,
    document.body,
  );
}
