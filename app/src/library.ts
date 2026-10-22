import { scanChanges } from "./everydayModel";
import type { ScanSummary } from "./everydayModel";
import { naturalPath } from "./playbackModel";
import { locale, DEC } from "./i18n";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";

// ---------- small persistent store ----------
/** API keys: kept by Windows (Credential Manager), held here in memory, never in localStorage, the
 *  state file or a backup. */
/** (aiProfileKey1…8: the keys of the API profiles, see ai.ts) */
export const SECRET_KEYS = ["geminiKey", "tmdbKey", "osKey", "openaiKey", "claudeKey", "customAiKey", ...Array.from({ length: 8 }, (_, i) => "aiProfileKey" + (i + 1))];
const secrets = new Map<string, string>();
const secretWrites = new Map<string, Promise<void>>();
function queueSecret(key: string, value: string) {
  const previous = secretWrites.get(key) ?? Promise.resolve();
  const task = previous.catch(() => {}).then(async () => {
    await invoke("secret_set", { name: key, value });
    if (value) secrets.set(key, value); else secrets.delete(key);
  });
  secretWrites.set(key, task);
  // Observed here to avoid unhandled rejection; flushSecrets still propagates the failure.
  void task.catch((error) => window.dispatchEvent(new CustomEvent("luna-secret-error", { detail: String(error) })));
}
/** Settings must not reload until every Credential Manager write has completed. */
export async function flushSecrets(): Promise<void> {
  const pending = [...secretWrites];
  const results = await Promise.allSettled(pending.map(([, task]) => task));
  const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
  if (failed) throw failed.reason;
  for (const [key, task] of pending) if (secretWrites.get(key) === task) secretWrites.delete(key);
}
/** At start, before anything reads a key; an old plain-text key is moved into Windows and removed. */
export async function loadSecrets() {
  try {
    const got = await invoke<Record<string, string>>("secrets_load", { names: SECRET_KEYS });
    for (const [k, v] of Object.entries(got)) secrets.set(k, v);
  } catch {}
  for (const k of SECRET_KEYS) {
    let old: string | null = null;
    try { old = localStorage.getItem(k); } catch {}
    if (old == null) continue;
    if (!secrets.has(k) && old) {
      secrets.set(k, old);
      // only once Windows has it is the plain copy removed
      try { await invoke("secret_set", { name: k, value: old }); } catch { continue; }
    }
    try { localStorage.removeItem(k); } catch {}
  }
}
const isSecret = (k: string) => SECRET_KEYS.includes(k);

export const store = {
  get: (k: string) => {
    if (isSecret(k)) return secrets.get(k) || null;
    try { return localStorage.getItem(k); } catch { return null; }
  },
  set: (k: string, v: string) => {
    if (isSecret(k)) {
      queueSecret(k, v);
      return true;
    }
    try { localStorage.setItem(k, v); return true; } catch {
      try { window.dispatchEvent(new Event("luna-storage-full")); } catch {}
      return false;
    }
  },
  remove: (k: string) => {
    if (isSecret(k)) { store.set(k, ""); return; }
    try { localStorage.removeItem(k); } catch {}
  },
  json<T>(k: string, fallback: T): T {
    try { return JSON.parse(localStorage.getItem(k) ?? "") ?? fallback; } catch { return fallback; }
  },
};

/** A network address (http, rtsp, rtmp…) rather than a file on disk. */
export const isUrl = (p: string) => /^[a-z][a-z0-9+.-]*:\/\//i.test(p);
/** Magnet / .torrent a video came from, if any. */
export const torrentSrc = (path: string) => store.get("tsrc:" + path) || null;
/** A torrent video whose file isn't (fully) on disk: shown faded and greyed out. */
export const isRemote = (path: string) => !!torrentSrc(path) && store.get("tdone:" + path) !== "1";

export type Recent = { path: string; title: string; time: number; duration: number };
export const loadRecent = (): Recent[] => store.json("recent", []);

// ---------- file name parsing ----------
export type Parsed = { kind: "movie" | "tv"; title: string; year?: number; season?: number; episode?: number };

// (a bare "web" isn't here: "The Web (1947)" is a title; WEB releases carry 1080p / WEB-DL anyway)
const JUNK = /\b(2160p|1080p|720p|480p|4k|uhd|bluray|blu-ray|brrip|bdrip|web-?dl|webrip|hdtv|dvdrip|hdrip|x264|x265|h\.?264|h\.?265|hevc|10bit|aac|ac3|dts|remux|proper|repack|extended|unrated|türkçe|turkce|dublaj|altyazili|altyazılı)\b.*$/i;

// [groups] go; (brackets) only when they hold a year or release tags: "(500) Days of Summer" keeps its "(500)"
// …but when nothing with a letter is left without them, the brackets are the title: "[REC] (2007)", "[REC] 2"
const tidy = (s: string, dropGroups: boolean) =>
  s.replace(/[._]/g, " ").replace(/\[[^\]]*\]/g, (m) => (dropGroups ? " " : m))
    .replace(/\(([^)]*)\)/g, (m, inner: string) => (/^\s*(19|20)\d{2}\s*$/.test(inner) || JUNK.test(inner) || !inner.trim() ? " " : m))
    .replace(JUNK, "")
    .replace(/[-\s]+$/, "").replace(/\s+/g, " ").trim();
const clean = (s: string) => {
  const t = tidy(s, true);
  return /\p{L}/u.test(t) ? t : tidy(s, false) || t;
};

/** The file name in a network address: a name / file query parameter (torrent streaming servers put it there), else the last path part. */
export function urlFileName(u: string): string | null {
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) return null;
  try {
    const url = new URL(u);
    const dec = (x: string) => { try { return decodeURIComponent(x.replace(/\+/g, " ")); } catch { return x; } };
    for (const k of ["torrent_name", "name", "filename", "file", "fn", "title", "dn", "n"]) {
      // searchParams has decoded it already: decoding again would turn "C++" into "C  "
      const v = url.searchParams.get(k);
      if (v && v.trim().length > 2) return v.split(/[\\/]/).pop()!;
    }
    const last = url.pathname.split("/").filter(Boolean).pop();
    return last ? dec(last) : url.hostname;
  } catch { return null; }
}
const base = (p: string) => (urlFileName(p) ?? p.split(/[\\/]/).pop()!).replace(/\.[a-z0-9]{2,4}$/i, "");
const parentDir = (p: string, up = 1) => p.split(/[\\/]/).slice(0, -up).pop() ?? "";

export function parseName(path: string): Parsed {
  const name = base(path);
  const ep = name.match(/^(.*?)[\s._-]*[Ss](\d{1,2})[\s._-]*[Ee](\d{1,3})/) ??
    name.match(/^(.*?)[\s._-]+(\d{1,2})x(\d{2,3})\b/);
  if (ep) {
    // "Show.2005.S01E01" and "Show.2018.S01E01" are two shows: the year is kept apart
    const shown = clean(ep[1]);
    const yr = shown.match(/\s((?:19|20)\d{2})$/)?.[1];
    let title = shown.replace(/\s(19|20)\d{2}$/, "");
    if (!title) {
      // "Show/Season 1/S01E02.mkv" or "Show/S01E02.mkv"
      const dir = parentDir(path);
      title = clean(/season|sezon|^s\d+$/i.test(dir) ? parentDir(path, 2) : dir);
    }
    return { kind: "tv", title, ...(yr ? { year: +yr } : {}), season: +ep[2], episode: +ep[3] };
  }
  const maxYear = new Date().getFullYear() + 2;
  // "1920x1080" is a resolution, not a year: remove it before looking for the year
  const scrubbed = name.replace(/\b\d{3,4}\s*[x×]\s*\d{3,4}\b/gi, " ");
  let y: { at: number; year: number } | null = null;
  for (const m of scrubbed.matchAll(/[\s._([-]+((?:19|20)\d{2})(?![\dx×])/g))
    if (+m[1] <= maxYear && clean(scrubbed.slice(0, m.index))) y = { at: m.index!, year: +m[1] };
  if (y) return { kind: "movie", title: clean(scrubbed.slice(0, y.at)), year: y.year };
  return { kind: "movie", title: clean(scrubbed) || clean(parentDir(path)) };
}
/** A video in a folder the user added as "series": the show is the first folder under it, the season
 *  a "Season 2" / "Sezon 2" folder, the episode the number in the name ("03 - Pilot.mkv", "Bölüm 3"). */
export function parseInSeries(path: string, root: string): Parsed {
  const p = parseName(path);
  if (p.kind === "tv") return p;
  const rel = path.slice(root.replace(/[\\/]+$/, "").length).replace(/^[\\/]+/, "").split(/[\\/]/);
  const dirs = rel.slice(0, -1);
  const seasonRe = /^(?:season|sezon|s)\s*(\d{1,2})\b|(\d{1,2})\.?\s*(?:sezon|season)\b/i;
  const show = dirs.find((d) => !seasonRe.test(d.trim()));
  const sm = dirs.map((d) => d.trim().match(seasonRe)).find(Boolean);
  // the episode: the last 1–3 digit number that isn't a year, a resolution or a codec
  const name = base(path).replace(/\b(19|20)\d{2}\b|\b\d{3,4}p\b|\b[xh]\.?26[45]\b/gi, " ");
  const nums = [...name.matchAll(/(?<![\d.])(\d{1,3})(?![\d.])/g)].map((m) => +m[1]);
  // An explicit marker wins ("Bölüm 5 - Part 2" is episode 5, "Episode 12 - The 100 Days" is 12), then a leading
  // number ("05 - Chapter 12"); only without either is the last number taken.
  const marked = name.match(/(?<![\p{L}\d])(?:bölüm|bolum|episode|ep|e|b)[\s._-]*(\d{1,3})(?!\d)/iu);
  const lead = name.match(/^\s*(\d{1,3})\s*[-._)\]]/);
  const episode = marked ? +marked[1] : lead ? +lead[1] : nums.length ? nums[nums.length - 1] : undefined;
  return { kind: "tv", title: show ? clean(show) : p.title, season: sm ? +(sm[1] ?? sm[2]) : 1, ...(episode != null ? { episode } : {}) };
}
export const groupKey = (p: Parsed) =>
  p.kind === "tv" ? "tv:" + p.title.toLowerCase() + (p.year ? ":" + p.year : "") : "movie:" + p.title.toLowerCase() + ":" + (p.year ?? "");

// ---------- TMDB ----------
export const IMG = "https://image.tmdb.org/t/p/";

export type Person = { id?: number; name: string; character: string; profile: string | null };

/** A title the user typed in place of the TMDB match: text only, no pictures. */
export const customMeta = (title: string, kind: "movie" | "tv"): Meta => ({
  id: 0, kind, title, year: "", overview: "", poster: null, backdrop: null, rating: 0, genres: [], cast: [],
});
export type Meta = {
  locked?: boolean; provenance?: "tmdb" | "manual"; editedAt?: number;
  id: number;
  kind: "movie" | "tv";
  title: string;
  year: string;
  overview: string;
  poster: string | null;
  backdrop: string | null;
  rating: number;
  genres: string[];
  runtime?: number;
  seasons?: number;
  cast: Person[];
};
export type Episode = { episode: number; name: string; overview: string; still: string | null; runtime: number | null };

async function tmdb(path: string, params: Record<string, string> = {}) {
  const key = store.get("tmdbKey") ?? "";
  const url = new URL("https://api.themoviedb.org/3" + path);
  const bearer = key.length > 40; // v4 read token vs v3 api key
  if (!bearer) url.searchParams.set("api_key", key);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const r = await fetch(url, { headers: bearer ? { Authorization: "Bearer " + key } : {} });
  if (!r.ok) throw new Error("TMDB " + r.status);
  return r.json();
}

export type SearchHit = { id: number; kind: "movie" | "tv"; title: string; year: string; poster: string | null; rating?: number; backdrop?: string | null; overview?: string };

/** A film's genres by its name and year (for films that came from Letterboxd without them); [] when not found. */
export async function tmdbGenresOf(title: string, year?: string): Promise<string[]> {
  const ck = "tmdbGenreNames:" + locale();
  let names = store.json<Record<string, string> | null>(ck, null);
  if (!names) {
    const r = await tmdb("/genre/movie/list", { language: locale() });
    names = Object.fromEntries((r.genres ?? []).map((g: any) => [String(g.id), String(g.name)]));
    store.set(ck, JSON.stringify(names));
  }
  const r = await tmdb("/search/movie", { query: title, language: locale(), ...(year ? { year: year.slice(0, 4) } : {}) });
  const hit = r.results?.[0];
  return hit ? (hit.genre_ids ?? []).map((id: number) => names![String(id)]).filter(Boolean) : [];
}

const toHit = (h: any, kind?: "movie" | "tv"): SearchHit => ({
  id: h.id, kind: kind ?? (h.media_type === "tv" ? "tv" : "movie"), title: h.title ?? h.name,
  year: (h.release_date ?? h.first_air_date ?? "").slice(0, 4), poster: h.poster_path,
  rating: Math.round((h.vote_average ?? 0) * 10) / 10, backdrop: h.backdrop_path, overview: h.overview,
});

/** A TMDB list (trending, popular, now playing…), cached for a few hours. */
export async function tmdbList(path: string, kind?: "movie" | "tv", params: Record<string, string> = {}): Promise<SearchHit[]> {
  const k = `tlist:${locale()}:${path}:${JSON.stringify(params)}`;
  const c = store.json<{ at: number; hits: SearchHit[] } | null>(k, null);
  if (c && Date.now() - c.at < 6 * 3600e3) return c.hits;
  const r = await tmdb(path, { language: locale(), ...params });
  const hits = (r.results ?? []).filter((h: any) => h.media_type !== "person" && h.poster_path).map((h: any) => toHit(h, kind));
  // lists not opened for two days go (localStorage is mirrored to disk; keep it small)
  try {
    for (const old of Object.keys(localStorage))
      if (old.startsWith("tlist:") && Date.now() - (store.json<{ at: number }>(old, { at: 0 }).at ?? 0) > 2 * 86400e3) localStorage.removeItem(old);
  } catch {}
  store.set(k, JSON.stringify({ at: Date.now(), hits }));
  return hits;
}

/** The IMDb id of a TMDB title (what Stremio addons go by). */
export async function imdbOf(kind: "movie" | "tv", id: number): Promise<string | null> {
  const k = `imdb:${kind}:${id}`;
  const c = store.get(k);
  if (c) return c;
  const r = await tmdb(`/${kind}/${id}/external_ids`).catch(() => null);
  const imdb: string | null = r?.imdb_id || null;
  if (imdb) store.set(k, imdb);
  return imdb;
}

/** The TMDB title behind an IMDb id. */
export async function fromImdb(imdb: string): Promise<SearchHit | null> {
  const r = await tmdb(`/find/${imdb}`, { external_source: "imdb_id", language: locale() }).catch(() => null);
  const h = r?.movie_results?.[0] ?? r?.tv_results?.[0];
  return h ? toHit(h, r.movie_results?.[0] ? "movie" : "tv") : null;
}

export async function searchTmdb(query: string, kind: "movie" | "tv", year?: number): Promise<SearchHit[]> {
  const r = await tmdb(`/search/${kind}`, {
    query, language: locale(),
    ...(year ? { [kind === "movie" ? "year" : "first_air_date_year"]: String(year) } : {}),
  });
  return (r.results ?? []).slice(0, 12).map((h: any) => ({
    id: h.id, kind, title: h.title ?? h.name,
    year: (h.release_date ?? h.first_air_date ?? "").slice(0, 4), poster: h.poster_path,
    rating: Math.round((h.vote_average ?? 0) * 10) / 10,
  }));
}

async function lookup(p: Parsed): Promise<Meta | null> {
  const hit = (await searchTmdb(p.title, p.kind, p.year))[0];
  return hit ? details(p.kind, hit.id) : null;
}

export async function details(kind: "movie" | "tv", id: number): Promise<Meta> {
  const d = await tmdb(`/${kind}/${id}`, { language: locale() });
  // Turkish credits sometimes carry names in the original script (e.g. Japanese); English is always Latin.
  d.credits = await tmdb(`/${kind}/${id}/credits`, { language: "en-US" }).catch(() => ({ cast: [] }));
  let overview: string = d.overview;
  if (!overview) overview = (await tmdb(`/${kind}/${id}`, { language: "en-US" })).overview ?? "";
  return {
    id: d.id,
    kind,
    title: d.title ?? d.name,
    year: (d.release_date ?? d.first_air_date ?? "").slice(0, 4),
    overview,
    poster: d.poster_path,
    backdrop: d.backdrop_path,
    rating: Math.round((d.vote_average ?? 0) * 10) / 10,
    genres: (d.genres ?? []).map((g: any) => g.name),
    runtime: d.runtime ?? undefined,
    seasons: d.number_of_seasons ?? undefined,
    cast: (d.credits?.cast ?? []).slice(0, 12).map((c: any) => ({
      id: c.id, name: c.name, character: c.character ?? "", profile: c.profile_path,
    })),
  };
}

/** Where a season's episode list is cached (per language). */
export const seasonKey = (tvId: number, season: number) => `season:${locale()}:${tvId}:${season}`;
export async function seasonEpisodes(tvId: number, season: number): Promise<Episode[]> {
  const k = seasonKey(tvId, season);
  const cached = store.json<Episode[] | null>(k, null);
  if (cached) return cached;
  if (!store.get("tmdbKey")) return [];
  try {
    const d = await tmdb(`/tv/${tvId}/season/${season}`, { language: locale() });
    const eps: Episode[] = (d.episodes ?? []).map((e: any) => ({
      episode: e.episode_number, name: e.name, overview: e.overview,
      still: e.still_path, runtime: e.runtime,
    }));
    store.set(k, JSON.stringify(eps));
    return eps;
  } catch {
    return [];
  }
}

// ---------- kept files, finished titles, relinking ----------
/** Videos added to the library outside the library folders (opened from Windows, torrents). They stay
 *  in the library even after they drop off the play history. */
export const loadPinned = () => store.json<string[]>("pinned", []);
export function pinFile(path: string) {
  if (!path || isUrl(path)) return;
  const l = loadPinned();
  if (l.includes(path)) return;
  store.set("pinned", JSON.stringify([...l, path]));
  window.dispatchEvent(new Event("luna-library"));
}

/** Watched to the end (or marked by hand). Credits don't count: the last 5 minutes are enough. */
let finishedCache: Record<string, number> | null = null;
export const loadFinished = () => (finishedCache ??= store.json<Record<string, number>>("finished", {}));
export const isFinished = (path: string) => !!loadFinished()[path];
export function setFinished(paths: string[], on: boolean) {
  const f = loadFinished();
  for (const p of paths) { if (on) f[p] = Date.now(); else delete f[p]; }
  store.set("finished", JSON.stringify(f));
  window.dispatchEvent(new Event("luna-library"));
}
// the credits: the last 8% (at least a minute, at most five); a short clip only its last quarter
export const nearEnd = (time: number, duration: number) =>
  duration > 0 && duration - time <= Math.min(300, Math.max(Math.min(60, duration * 0.25), duration * 0.08));

/** Moves everything Luna remembers about `from` (settings, subtitles, progress, torrent source…) to `to`. */
export function relinkFile(from: string, to: string) {
  if (!from || !to || from === to) return;
  try {
    for (const k of Object.keys(localStorage)) {
      const m = k.match(/^([A-Za-z]+:)(.*)$/);
      if (m && m[2] === from) { localStorage.setItem(m[1] + to, localStorage.getItem(k) ?? ""); localStorage.removeItem(k); }
    }
  } catch {}
  const swap = (l: string[]) => [...new Set(l.map((x) => (x === from ? to : x)))];
  store.set("pinned", JSON.stringify(swap([...loadPinned(), to])));
  store.set("files", JSON.stringify(swap(store.json<string[]>("files", []))));
  const rec = store.json<Recent[]>("recent", []).map((r) => (r.path === from ? { ...r, path: to } : r));
  store.set("recent", JSON.stringify(rec));
  const fin = loadFinished();
  if (fin[from]) { fin[to] = fin[from]; delete fin[from]; store.set("finished", JSON.stringify(fin)); }
  window.dispatchEvent(new Event("luna-library"));
}

/** Subtitle files next to each video ("Film.srt", "Film.tr.srt"), counted on every library scan. */
let sideSubs: Record<string, number> | null = null;
export const sidecarSubs = (path: string) => (sideSubs ??= store.json<Record<string, number>>("sideSubs", {}))[path] ?? 0;
async function checkSidecarSubs(paths: string[]) {
  const local = paths.filter((p) => !isUrl(p));
  if (!local.length) return;
  const n = await invoke<number[]>("subs_beside", { paths: local }).catch(() => null);
  if (!n) return;
  const next: Record<string, number> = {};
  local.forEach((p, i) => { if (n[i]) next[p] = n[i]; });
  const before = JSON.stringify(sideSubs ??= store.json("sideSubs", {}));
  sideSubs = next;
  if (JSON.stringify(next) !== before) { store.set("sideSubs", JSON.stringify(next)); window.dispatchEvent(new Event("luna-subs")); }
}

/** Renames a video on disk (its own subtitles go along) and moves everything Luna kept for it
 *  (where you stopped, quality, finished…) to the new name. Returns the new path. */
export async function renameVideo(path: string, name: string): Promise<string> {
  const to = await invoke<string>("rename_video", { path, name });
  if (to === path) return to;
  const wasPinned = loadPinned().includes(path);
  relinkFile(path, to);
  if (!wasPinned) store.set("pinned", JSON.stringify(loadPinned().filter((x) => x !== to)));
  if (sideSubs?.[path]) { sideSubs[to] = sideSubs[path]; delete sideSubs[path]; store.set("sideSubs", JSON.stringify(sideSubs)); }
  window.dispatchEvent(new Event("luna-library"));
  return to;
}

/** Films that are the same film (two copies: a 1080p and a 4K, a different file name): one TMDB id. */
const filmId = (i: Item) => (i.parsed.kind === "movie" && i.meta && i.meta.id > 0 ? i.meta.id : null);
/** Every copy of a film in the library, this item's files first. */
export function copiesOf(it: Item, items: Item[]): string[] {
  const id = filmId(it);
  const sibs = id == null ? [] : items.filter((i) => i !== it && filmId(i) === id);
  return [...new Set([it, ...sibs].flatMap((i) => i.files.map((f) => f.path)))];
}
/** A grid order where the copies of one film sit side by side (where the first one is). */
export function besideCopies(list: Item[]): Item[] {
  const out: Item[] = [];
  const seen = new Set<Item>();
  for (const it of list) {
    if (seen.has(it)) continue;
    const id = filmId(it);
    const group = id == null ? [it] : list.filter((i) => i === it || filmId(i) === id);
    for (const g of group) { seen.add(g); out.push(g); }
  }
  return out;
}

// ---------- library ----------
export type LibFile = { path: string; season?: number; episode?: number };
export type Item = { key: string; parsed: Parsed; files: LibFile[]; meta: Meta | null };

const normDir = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();

/** "movie" or "tv" for each library folder (added from the Films or the Series side). */
export type FolderKind = "movie" | "tv";
export const loadFolderKinds = () => store.json<Record<string, FolderKind>>("folderKinds", {});

export function useLibrary(opened: string[] = []) {
  const [folders, setFoldersState] = useState<string[]>(() => store.json("folders", []));
  const [kinds, setKinds] = useState<Record<string, FolderKind>>(loadFolderKinds);
  const [files, setFiles] = useState<string[]>(() => store.json("files", []));
  const [pinned, setPinned] = useState<string[]>(loadPinned);
  const [missing, setMissing] = useState<Set<string>>(new Set());
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => { setPinned(loadPinned()); setFiles(store.json("files", [])); setFoldersState(store.json("folders", [])); setKinds(loadFolderKinds()); setMeta(store.json("meta", {})); bump((n) => n + 1); };
    window.addEventListener("luna-library", f);
    return () => window.removeEventListener("luna-library", f);
  }, []);
  const [meta, setMeta] = useState<Record<string, Meta | null>>(() => store.json("meta", {}));
  const [scanning, setScanning] = useState(false);
  const [scanSummary, setScanSummary] = useState<ScanSummary | null>(null);
  const [tick, setTick] = useState(0);

  const setFolders = (f: string[]) => {
    store.set("folders", JSON.stringify(f));
    setFoldersState(f);
  };
  const setFolderKind = (dir: string, k: FolderKind) => {
    const next = { ...loadFolderKinds(), [dir]: k };
    store.set("folderKinds", JSON.stringify(next));
    setKinds(next);
  };

  // Show the cached library instantly, refresh from disk in the background.
  useEffect(() => {
    if (!folders.length) { store.set("files", "[]"); setFiles([]); setScanning(false); return; }
    let alive = true;
    setScanning(true);
    (async () => {
      let f = await invoke<string[]>("scan_folders", { folders });
      const ok = await invoke<boolean[]>("paths_exist", { paths: folders }).catch(() => folders.map(() => true));
      const gone = folders.filter((_, i) => ok[i] === false).map(normDir);
      if (gone.length) {
        const keep = store.json<string[]>("files", []).filter((p) => gone.some((r) => normDir(p).startsWith(r + "/")));
        f = [...new Set([...f, ...keep])].sort();
      }
      if (!alive) return;
      const summary=scanChanges(store.json<string[]>("files",[]),f,folders.filter((_,i)=>ok[i]===false));
      setScanSummary(summary);
      store.set("files", JSON.stringify(f));
      setFiles(f);
      checkSidecarSubs([...f, ...loadPinned()]);
    })().catch(error => { if(alive)setScanSummary({at:Date.now(),added:[],removed:[],relinked:[],offline:[],metadata:[],error:String(error).slice(0,500)}); }).finally(() => alive && setScanning(false));
    return () => { alive = false; };
  }, [folders, tick]);

  const items = useMemo(() => {
    const map = new Map<string, Item>();
    // Files opened directly (outside library folders) get posters and details too.
    const series = folders.filter((f) => kinds[f] === "tv").map((f) => [f, normDir(f)] as const);
    for (const path of [...new Set([...files, ...pinned, ...opened])]) {
      const inSeries = series.find(([, n]) => normDir(path).startsWith(n + "/"));
      const parsed = inSeries ? parseInSeries(path, inSeries[0]) : parseName(path);
      const key = groupKey(parsed);
      const it = map.get(key) ?? { key, parsed, files: [], meta: meta[key] ?? null };
      it.files.push({ path, season: parsed.season, episode: parsed.episode });
      map.set(key, it);
    }
    for (const it of map.values()) {
      if (it.meta && it.meta.kind !== it.parsed.kind) it.parsed = { ...it.parsed, kind: it.meta.kind };
    }
    // ties (two copies of an episode, files without a number) in natural name order, not in scan order
    for (const it of map.values())
      it.files.sort((a, b) => (a.season ?? 0) - (b.season ?? 0) || (a.episode ?? 0) - (b.episode ?? 0) || naturalPath(a.path, b.path));
    return [...map.values()];
  }, [files, pinned, meta, opened.join("\n"), folders, kinds]);

  // Which videos are gone from disk (moved, deleted, drive unplugged).
  useEffect(() => {
    const paths = items.flatMap((i) => i.files.map((f) => f.path)).filter((p) => !isUrl(p));
    if (!paths.length) return;
    // a slow answer to an older check doesn't overwrite a newer one
    let alive = true;
    invoke<boolean[]>("paths_exist", { paths })
      .then((ok) => { if (alive) setMissing(new Set(paths.filter((_, i) => ok[i] === false))); })
      .catch(() => {});
    return () => { alive = false; };
  }, [items, tick]);

  // Fetch missing metadata, a few at a time.
  useEffect(() => {
    if (!store.get("tmdbKey")) return;
    const todo = items.filter((i) => !(i.key in meta) && (metaRetry.get(i.key) ?? 0) <= Date.now());
    if (!todo.length) return;
    let alive = true;
    (async () => {
      for (let i = 0; i < todo.length && alive; i += 4) {
        const batch = todo.slice(i, i + 4);
        const res = await Promise.all(batch.map((it) => lookup(it.parsed).catch(() => undefined)));
        if (!alive) return;
        // undefined = network/key error: left out and asked again a few minutes later, not in a loop
        batch.forEach((it, j) => { if (res[j] === undefined) metaRetry.set(it.key, Date.now() + 5 * 60_000); });
        if (res.every((r) => r === undefined)) continue;
        setMeta((m) => {
          const next = { ...m };
          batch.forEach((it, j) => { if (res[j] !== undefined && !next[it.key]?.locked) next[it.key] = res[j] ? {...res[j]!,provenance:"tmdb"} : null; });
          store.set("meta", JSON.stringify(next));
          setScanSummary(current=>current?{...current,metadata:[...new Set([...current.metadata,...batch.filter((it,j)=>res[j]!==undefined&&!m[it.key]?.locked).map(it=>it.parsed.title)])]}:current);
          return next;
        });
      }
    })();
    return () => { alive = false; };
  }, [items, tick]);

  // Every new video gets its quality read once in the background, so badges show everywhere.
  useEffect(() => {
    const todo = [...new Set([...files, ...opened])].filter((p) => !isUrl(p) && !store.get("info:" + p));
    let alive = true;
    (async () => {
      for (const p of todo) {
        if (!alive) return;
        await getMediaInfo(p);
      }
    })();
    return () => { alive = false; };
  }, [files, opened.join("\n")]);

  const setOneMeta = (key: string, m: Meta | null) =>
    setMeta((cur) => {
      const next = { ...cur, [key]: m ? {...m,locked:true,provenance:m.id>0?"tmdb" as const:"manual" as const,editedAt:Date.now()} : null };
      store.set("meta", JSON.stringify(next));
      return next;
    });

  return {
    folders, setFolders, items, scanning, scanSummary, kinds, setFolderKind,
    /** Adds a library folder from the Films or the Series side. */
    addFolder: (dir: string, k: FolderKind) => {
      setFolderKind(dir, k);
      if (!folders.some((f) => normDir(f) === normDir(dir))) setFolders([...folders, dir]);
      setTick((t) => t + 1);
    },
    /** Looked up on TMDB and nothing was found by its file name. */
    unknown: (key: string) => key in meta && meta[key] === null,
    refresh: () => setTick((t) => t + 1),
    itemFor: (path: string) => items.find((i) => i.files.some((f) => f.path === path)),
    setMeta: setOneMeta,
    missing,
    forgetFiles: (paths: string[]) => {
      const f = files.filter((x) => !paths.includes(x));

      store.set("files", JSON.stringify(f));
      setFiles(f);
      const p = loadPinned().filter((x) => !paths.includes(x));
      store.set("pinned", JSON.stringify(p));
      setPinned(p);
    },
  };
}

// ---------- media info, thumbnails, badges ----------
export type MediaInfo = {
  width: number; height: number; codec: string; gamma: string; dolbyVision: boolean;
  audioCodec: string; channels: number; duration: number; size: number;
};

// Probing and thumbnailing start a short mpv run each: queue them two at a time.
let running = 0;
const waiting: (() => void)[] = [];
async function queued<T>(job: () => Promise<T>): Promise<T> {
  if (running >= 2) await new Promise<void>((r) => waiting.push(r));
  running++;
  try { return await job(); } finally { running--; waiting.shift()?.(); }
}

const infoMem = new Map<string, Promise<MediaInfo | null>>();
/** Titles whose TMDB lookup failed (network, key): not asked again before this time. */
const metaRetry = new Map<string, number>();

export function getMediaInfo(path: string): Promise<MediaInfo | null> {
  const cached = store.json<MediaInfo | null>("info:" + path, null);
  if (cached) return Promise.resolve(cached);
  if (isUrl(path)) return Promise.resolve(null);
  if (!infoMem.has(path))
    infoMem.set(path, queued(() => invoke<MediaInfo>("probe_video", { path }))
      .then((i) => { store.set("info:" + path, JSON.stringify(i)); return i; })
      .catch(() => { setTimeout(() => infoMem.delete(path), 60_000); return null; }));
  return infoMem.get(path)!;
}

export function useMediaInfo(path?: string) {
  const [info, setInfo] = useState<MediaInfo | null>(() => path ? store.json("info:" + path, null) : null);
  useEffect(() => {
    setInfo(path ? store.json("info:" + path, null) : null);
    if (!path) return;
    let alive = true;
    getMediaInfo(path).then((i) => alive && setInfo(i));
    return () => { alive = false; };
  }, [path]);
  return info;
}

const thumbMem = new Map<string, Promise<string | null>>();
export function useThumb(path: string, enabled: boolean) {
  const [state, setState] = useState<{ path: string; src: string | null }>(() => ({ path, src: store.get("thumb:" + path) }));
  const src = state.path === path ? state.src : store.get("thumb:" + path);
  const setSrc = (u: string | null) => setState({ path, src: u });
  useEffect(() => {
    if (!enabled || !path || src || isUrl(path)) return;
    let alive = true;
    if (!thumbMem.has(path))
      thumbMem.set(path, queued(() => invoke<string>("video_thumbnail", { path }))
        .then((f) => { const u = convertFileSrc(f); store.set("thumb:" + path, u); return u; })
        .catch(() => null));
    thumbMem.get(path)!.then((u) => alive && setSrc(u));
    return () => { alive = false; };
  }, [path, enabled]);
  return src;
}

/** "4K", "HDR10", "HEVC", "5.1"… from the real streams, or the file name until probed. */
export function qualityBadges(info: MediaInfo | null, path = ""): string[] {
  const name = path.toLowerCase();
  const out: string[] = [];
  if (info && info.width) {
    const { width: w, height: h } = info;
    out.push(w >= 3800 || h >= 2100 ? "4K" : w >= 2500 || h >= 1400 ? "2K" : w >= 1900 || h >= 1000 ? "1080p" : w >= 1200 || h >= 700 ? "720p" : "SD");
    if (info.dolbyVision || /\b(dv|dovi|dolby.?vision)\b/.test(name)) out.push("Dolby Vision");
    else if (info.gamma === "pq") out.push(/hdr10\+|hdr10plus/.test(name) ? "HDR10+" : "HDR10");
    else if (info.gamma === "hlg") out.push("HLG");
    const c = info.codec.toLowerCase();
    if (c.includes("hevc") || c.includes("265")) out.push("HEVC");
    else if (c.includes("av1")) out.push("AV1");
    else if (c.includes("264")) out.push("H.264");
    else if (c) out.push(c.toUpperCase());
    if (/atmos/.test(name) && /truehd|eac3/.test(info.audioCodec)) out.push("Atmos");
    if (info.channels >= 8) out.push("7.1");
    else if (info.channels >= 6) out.push("5.1");
    else if (info.channels === 2) out.push("Stereo");
  } else {
    if (/2160p|\b4k\b|uhd/.test(name)) out.push("4K");
    else if (/1440p/.test(name)) out.push("2K");
    else if (/1080p/.test(name)) out.push("1080p");
    else if (/720p/.test(name)) out.push("720p");
    if (/\b(dv|dovi)\b/.test(name)) out.push("Dolby Vision");
    else if (/hdr/.test(name)) out.push("HDR");
  }
  return out;
}

export const fmtSize = (b: number) =>
  b >= 1e9 ? (b / 1e9).toFixed(1).replace(".", DEC) + " GB" : Math.round(b / 1e6) + " MB";

/** TMDB keywords of a title (lower-case names), used for content warnings. */
export async function tmdbKeywords(kind: "movie" | "tv", id: number): Promise<string[]> {
  const r = await tmdb(`/${kind}/${id}/keywords`);
  return ((r.keywords ?? r.results ?? []) as { name: string }[]).map((k) => k.name.toLowerCase());
}

/** Raw TMDB GET for the assistant's media tools. */
export const tmdbGet = (path: string, params: Record<string, string> = {}) => tmdb(path, params);

/** Metadata-only series lookup, initiated by the user; no AI and no automatic list changes. */
export async function seriesById(id: number): Promise<{id:number;name:string;parts:{id:number;title:string;year:string;release:string;poster:string|null}[]}> {
  if (!Number.isInteger(id) || id <= 0 || !store.get("tmdbKey")) throw Error("TMDB anahtarı gerekli.");
  const c = await tmdb(`/collection/${id}`, { language: locale() });
  if (!c || c.id!==id || !Array.isArray(c.parts)) throw Error("Invalid collection metadata");
  return { id, name: String(c.name || "Collection").slice(0,300), parts: c.parts.filter((p:any)=>Number.isInteger(p.id)&&p.id>0&&typeof p.title==="string").map((p:any)=>({ id:p.id as number,title:p.title as string,year:String(p.release_date||"").slice(0,4),release:String(p.release_date||""),poster:typeof p.poster_path==="string"?p.poster_path:null })).sort((a:{release:string},b:{release:string})=>a.release.localeCompare(b.release)) };
}
export async function seriesForMovie(id:number) { const film=await tmdb(`/movie/${id}`,{language:locale()}); return film.belongs_to_collection?.id ? seriesById(film.belongs_to_collection.id) : null; }
