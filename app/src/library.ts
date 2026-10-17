import { locale, DEC } from "./i18n";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";

// ---------- small persistent store ----------
export const store = {
  get: (k: string) => {
    try { return localStorage.getItem(k); } catch { return null; }
  },
  set: (k: string, v: string) => {
    try { localStorage.setItem(k, v); } catch {}
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

const JUNK = /\b(2160p|1080p|720p|480p|4k|uhd|bluray|blu-ray|brrip|bdrip|web-?dl|webrip|web|hdtv|dvdrip|hdrip|x264|x265|h\.?264|h\.?265|hevc|10bit|aac|ac3|dts|remux|proper|repack|extended|unrated|türkçe|turkce|dublaj|altyazili|altyazılı)\b.*$/i;

const clean = (s: string) =>
  s.replace(/[._]/g, " ").replace(/\[[^\]]*\]|\([^)]*\)/g, " ").replace(JUNK, "")
    .replace(/[-\s]+$/, "").replace(/\s+/g, " ").trim();

/** The file name in a network address: a name / file query parameter (torrent streaming servers put it there), else the last path part. */
export function urlFileName(u: string): string | null {
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) return null;
  try {
    const url = new URL(u);
    const dec = (x: string) => { try { return decodeURIComponent(x.replace(/\+/g, " ")); } catch { return x; } };
    for (const k of ["torrent_name", "name", "filename", "file", "fn", "title", "dn", "n"]) {
      const v = url.searchParams.get(k);
      if (v && v.trim().length > 2) return dec(v).split(/[\\/]/).pop()!;
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
    let title = clean(ep[1]).replace(/\s(19|20)\d{2}$/, "");
    if (!title) {
      // "Show/Season 1/S01E02.mkv" or "Show/S01E02.mkv"
      const dir = parentDir(path);
      title = clean(/season|sezon|^s\d+$/i.test(dir) ? parentDir(path, 2) : dir);
    }
    return { kind: "tv", title, season: +ep[2], episode: +ep[3] };
  }
  const y = name.match(/^(.*?)[\s._([-]+((?:19|20)\d{2})(?!\d)/);
  if (y && clean(y[1])) return { kind: "movie", title: clean(y[1]), year: +y[2] };
  return { kind: "movie", title: clean(name) || clean(parentDir(path)) };
}

export const groupKey = (p: Parsed) =>
  p.kind === "tv" ? "tv:" + p.title.toLowerCase() : "movie:" + p.title.toLowerCase() + ":" + (p.year ?? "");

// ---------- TMDB ----------
export const IMG = "https://image.tmdb.org/t/p/";

export type Person = { id?: number; name: string; character: string; profile: string | null };

/** A title the user typed in place of the TMDB match: text only, no pictures. */
export const customMeta = (title: string, kind: "movie" | "tv"): Meta => ({
  id: 0, kind, title, year: "", overview: "", poster: null, backdrop: null, rating: 0, genres: [], cast: [],
});
export type Meta = {
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

export type SearchHit = { id: number; kind: "movie" | "tv"; title: string; year: string; poster: string | null; rating?: number };

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
export const loadFinished = () => store.json<Record<string, number>>("finished", {});
export const isFinished = (path: string) => !!loadFinished()[path];
export function setFinished(paths: string[], on: boolean) {
  const f = loadFinished();
  for (const p of paths) { if (on) f[p] = Date.now(); else delete f[p]; }
  store.set("finished", JSON.stringify(f));
  window.dispatchEvent(new Event("luna-library"));
}
export const nearEnd = (time: number, duration: number) =>
  duration > 0 && duration - time <= Math.min(300, Math.max(60, duration * 0.08));

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

// ---------- library ----------
export type LibFile = { path: string; season?: number; episode?: number };
export type Item = { key: string; parsed: Parsed; files: LibFile[]; meta: Meta | null };

export function useLibrary(opened: string[] = []) {
  const [folders, setFoldersState] = useState<string[]>(() => store.json("folders", []));
  const [files, setFiles] = useState<string[]>(() => store.json("files", []));
  const [pinned, setPinned] = useState<string[]>(loadPinned);
  const [missing, setMissing] = useState<Set<string>>(new Set());
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => { setPinned(loadPinned()); setFiles(store.json("files", [])); bump((n) => n + 1); };
    window.addEventListener("luna-library", f);
    return () => window.removeEventListener("luna-library", f);
  }, []);
  const [meta, setMeta] = useState<Record<string, Meta | null>>(() => store.json("meta", {}));
  const [scanning, setScanning] = useState(false);
  const [tick, setTick] = useState(0);

  const setFolders = (f: string[]) => {
    store.set("folders", JSON.stringify(f));
    setFoldersState(f);
  };

  // Show the cached library instantly, refresh from disk in the background.
  useEffect(() => {
    if (!folders.length) { setFiles([]); setScanning(false); return; }
    let alive = true;
    setScanning(true);
    invoke<string[]>("scan_folders", { folders }).then((f) => {
      if (!alive) return;
      store.set("files", JSON.stringify(f));
      setFiles(f);
    }).finally(() => alive && setScanning(false));
    return () => { alive = false; };
  }, [folders, tick]);

  const items = useMemo(() => {
    const map = new Map<string, Item>();
    // Files opened directly (outside library folders) get posters and details too.
    for (const path of [...new Set([...files, ...pinned, ...opened])]) {
      const parsed = parseName(path);
      const key = groupKey(parsed);
      const it = map.get(key) ?? { key, parsed, files: [], meta: meta[key] ?? null };
      it.files.push({ path, season: parsed.season, episode: parsed.episode });
      map.set(key, it);
    }
    for (const it of map.values())
      it.files.sort((a, b) => (a.season ?? 0) - (b.season ?? 0) || (a.episode ?? 0) - (b.episode ?? 0));
    return [...map.values()];
  }, [files, pinned, meta, opened.join("\n")]);

  // Which videos are gone from disk (moved, deleted, drive unplugged).
  useEffect(() => {
    const paths = items.flatMap((i) => i.files.map((f) => f.path)).filter((p) => !isUrl(p));
    if (!paths.length) return;
    invoke<boolean[]>("paths_exist", { paths })
      .then((ok) => setMissing(new Set(paths.filter((_, i) => ok[i] === false))))
      .catch(() => {});
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
          batch.forEach((it, j) => { if (res[j] !== undefined) next[it.key] = res[j]!; });
          store.set("meta", JSON.stringify(next));
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
      const next = { ...cur, [key]: m };
      store.set("meta", JSON.stringify(next));
      return next;
    });

  return {
    folders, setFolders, items, scanning,
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
    if (!enabled || src || isUrl(path)) return;
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
