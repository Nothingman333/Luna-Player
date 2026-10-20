// Müzik modu: the user's own music folders (albums, artists, songs), live radio, a mini player
// and a "now playing" screen with synced lyrics. Playback goes through the same mpv as video,
// with the picture track off.
import { lang, tt } from "./i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { open } from "@tauri-apps/plugin-dialog";
import { fmtTime, mpv, MpvState, setProp } from "./mpv";
import { store } from "./library";
import { I, Icon, MenuEntry, openMenu } from "./Screens";
import { askAssistant, openAssistant } from "./Taste";

// ---------- library ----------
export type Track = {
  path: string; title: string; artist: string; album: string; albumArtist: string;
  track?: number; disc?: number; year?: number; genre?: string; duration: number; cover?: string | null;
};
export type Album = { key: string; title: string; artist: string; year?: number; cover?: string | null; tracks: Track[] };

const albumKey = (t: Track) => (t.albumArtist || t.artist).toLowerCase() + "|" + t.album.toLowerCase();
export const loadMusicFolders = () => store.json<string[]>("musicFolders", []);
let libCache: { sig: string; tracks: Track[] } | null = null;
const libSubs = new Set<() => void>();

/** The music library, scanned once per session (and again on request). */
function useMusicLibrary() {
  const [folders, setFoldersState] = useState<string[]>(loadMusicFolders);
  const [tracks, setTracks] = useState<Track[] | null>(() => (libCache?.sig === loadMusicFolders().join("|") ? libCache.tracks : null));
  const [scanning, setScanning] = useState(false);
  const [tick, setTick] = useState(0);
  const sig = folders.join("|");
  useEffect(() => {
    const f = () => setTracks(libCache?.tracks ?? null);
    libSubs.add(f);
    return () => { libSubs.delete(f); };
  }, []);
  useEffect(() => {
    if (!folders.length) { libCache = { sig, tracks: [] }; setTracks([]); return; }
    if (libCache?.sig === sig && tick === 0) { setTracks(libCache.tracks); return; }
    let alive = true;
    setScanning(true);
    invoke<Track[]>("music_scan", { folders })
      .then((t) => { libCache = { sig, tracks: t }; if (alive) setTracks(t); libSubs.forEach((f) => f()); })
      .catch(() => alive && setTracks([]))
      .finally(() => alive && setScanning(false));
    return () => { alive = false; };
  }, [sig, tick]);
  const setFolders = (f: string[]) => { store.set("musicFolders", JSON.stringify(f)); setFoldersState(f); };
  const albums = useMemo(() => {
    const m = new Map<string, Album>();
    for (const t of tracks ?? []) {
      const k = albumKey(t);
      const a = m.get(k) ?? { key: k, title: t.album || tt("Bilinmeyen albüm"), artist: t.albumArtist || t.artist || tt("Bilinmeyen sanatçı"), year: t.year, cover: t.cover, tracks: [] };
      a.tracks.push(t);
      a.cover ??= t.cover;
      a.year ??= t.year;
      m.set(k, a);
    }
    return [...m.values()];
  }, [tracks]);
  return { folders, setFolders, tracks, albums, scanning, rescan: () => setTick((n) => n + 1) };
}

/** Songs deleted from disk leave the library and the playlists at once (no rescan). */
export function forgetTracks(paths: string[]) {
  const gone = new Set(paths);
  if (libCache) libCache = { ...libCache, tracks: libCache.tracks.filter((t) => !gone.has(t.path)) };
  libSubs.forEach((f) => f());
  const lists = loadMusicPlaylists();
  if (lists.some((p) => p.items.some((t) => gone.has(t.src)))) saveMusicPlaylists(lists.map((p) => ({ ...p, items: p.items.filter((t) => !gone.has(t.src)) })));
}

/** The music library for the assistant (scanned once; the index keeps it quick). */
export async function loadMusicLibrary(): Promise<Track[]> {
  const f = loadMusicFolders();
  if (libCache?.sig === f.join("|")) return libCache.tracks;
  const tracks = f.length ? await invoke<Track[]>("music_scan", { folders: f }).catch(() => []) : [];
  libCache = { sig: f.join("|"), tracks };
  return tracks;
}
export function groupAlbums(tracks: Track[]): Album[] {
  const m = new Map<string, Album>();
  for (const t of tracks) {
    const k = albumKey(t);
    const a = m.get(k) ?? { key: k, title: t.album, artist: t.albumArtist || t.artist, year: t.year, cover: t.cover, tracks: [] };
    a.tracks.push(t);
    m.set(k, a);
  }
  return [...m.values()];
}

// ---------- the player (one queue for the whole app) ----------
export type QItem = { src: string; title: string; artist?: string; album?: string; albumKey?: string; cover?: string | null; duration?: number; radio?: boolean; favicon?: string;
  /** an audiobook (its archive.org id): which chapter was playing is remembered */
  book?: string;
  /** a podcast episode (its show's feed): where you stopped is remembered */
  podcast?: string; start?: number;
  /** the song's page where it came from (Spotify) */
  page?: string;
  /** a page link (YouTube…) that mpv plays through yt-dlp: audio only */
  yt?: boolean };
type Repeat = "off" | "all" | "one";
const P = {
  queue: [] as QItem[],
  original: [] as QItem[],
  index: -1,
  shuffle: false,
  repeat: (store.get("musicRepeat") as Repeat) || "off",
  view: false, // the "now playing" screen
  paused: false, // mpv's pause, reported by the dock
};
const subs = new Set<() => void>();
const changed = () => subs.forEach((f) => f());

export function useMusic() {
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => bump((n) => n + 1);
    subs.add(f);
    return () => { subs.delete(f); };
  }, []);
  return { ...P, now: P.queue[P.index] as QItem | undefined };
}
/** What music is loaded in mpv right now (so the app doesn't treat it as a video). */
export const musicSrc = () => P.queue[P.index]?.src ?? null;
export const nowPlaying = (): QItem | undefined => P.queue[P.index];

type Plays = Record<string, { n: number; at: number; q: QItem }>;
const loadPlays = () => store.json<Plays>("musicPlays", {});
function countPlay(c: QItem) {
  const plays = loadPlays();
  plays[c.src] = { n: (plays[c.src]?.n ?? 0) + 1, at: Date.now(), q: { ...c, start: undefined } };
  // the 300 most played are kept
  const keep = Object.entries(plays).sort((a, b) => b[1].n - a[1].n || b[1].at - a[1].at).slice(0, 300);
  store.set("musicPlays", JSON.stringify(Object.fromEntries(keep)));
}
/** The most played songs (from the library, playlists or links), most first. */
export const mostPlayed = (n = 12) => Object.values(loadPlays()).sort((a, b) => b.n - a.n || b.at - a.at).slice(0, n);

function loadCurrent() {
  const c = P.queue[P.index];
  if (!c) return;
  // the audio only: no cover art as a "video", no window
  // a podcast episode carries on where it was left
  const resume = c.podcast ? Number(store.get("podPos:" + c.src) ?? 0) : 0;
  const opts = ["vid=no", ...(c.yt ? ["ytdl-format=bestaudio/best"] : []), ...(resume > 30 ? [`start=+${Math.floor(resume - 5)}`] : [])];
  mpv("loadfile", c.src, "replace", "-1", opts.join(","));
  setProp("pause", false);
  if (c.book) store.set("abPos:" + c.book, String(P.index));
  else if (c.podcast) { /* episodes keep their own place (podPos) */ }
  else if (!c.radio) {
    countPlay(c);
    store.set("musicLast", JSON.stringify(c));
    if (c.albumKey) store.set("musicRecentAlbums", JSON.stringify([c.albumKey, ...store.json<string[]>("musicRecentAlbums", []).filter((k) => k !== c.albumKey)].slice(0, 16)));
  } else {
    store.set("musicRecentRadio", JSON.stringify([c, ...store.json<QItem[]>("musicRecentRadio", []).filter((r) => r.src !== c.src)].slice(0, 12)));
  }
  changed();
}
export function playQueue(items: QItem[], start = 0, shuffle = false) {
  if (!items.length) return;
  let q = [...items];
  if (shuffle) {
    // Keep the order the user started from, so turning shuffle off can restore it.
    P.original = [...q];
    for (let i = q.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [q[i], q[j]] = [q[j], q[i]]; }
    start = 0;
  } else {
    P.original = [];
  }
  P.queue = q;
  P.index = Math.min(start, q.length - 1);
  P.shuffle = shuffle;
  loadCurrent();
}
export function nextTrack(auto = false) {
  const c = P.queue[P.index];
  if (!c) return;
  if (auto && P.repeat === "one") { mpv("seek", 0, "absolute"); setProp("pause", false); return; }
  if (P.index + 1 < P.queue.length) P.index++;
  else if (P.repeat === "all" || !auto) P.index = 0;
  else { mpv("seek", 0, "absolute"); setProp("pause", true); changed(); return; }
  loadCurrent();
}
export function prevTrack(time: number) {
  if (time > 4 || P.index === 0) { mpv("seek", 0, "absolute"); return; }
  P.index--;
  loadCurrent();
}
export function stopMusic() {
  if (P.index < 0) return;
  P.queue = [];
  P.index = -1;
  P.view = false;
  changed();
}
const setRepeat = (r: Repeat) => { P.repeat = r; store.set("musicRepeat", r); changed(); };
const setView = (v: boolean) => { P.view = v; changed(); };
export const trackItem = (t: Track): QItem => ({ src: t.path, title: t.title, artist: t.artist, album: t.album, albumKey: albumKey(t), cover: t.cover, duration: t.duration });

// ---------- radio (radio-browser.info, a free open directory) ----------
type Station = { stationuuid: string; name: string; url_resolved: string; favicon: string; tags: string; country: string; countrycode: string; codec: string; bitrate: number };
async function getJson(url: string): Promise<any> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (r.ok) return await r.json();
  } catch { /* fall back to the native fetch below */ }
  return invoke("addon_get", { url });
}
const RADIO = "https://de1.api.radio-browser.info/json";
async function stations(path: string): Promise<Station[]> {
  const l: Station[] = await getJson(RADIO + path);
  return (l ?? []).filter((s) => s.url_resolved && s.name.trim());
}
/** Radio stations by name, else by genre tag (for the assistant). */
export async function findStations(q: string): Promise<QItem[]> {
  const e = encodeURIComponent(q.trim());
  let l = await stations(`/stations/search?name=${e}&order=votes&reverse=true&hidebroken=true&limit=8`);
  if (!l.length) l = await stations(`/stations/search?tag=${e}&order=votes&reverse=true&hidebroken=true&limit=8`);
  return l.map(stationItem);
}
const stationItem = (s: Station): QItem => ({
  src: s.url_resolved, title: s.name.trim(), artist: [s.country, s.tags.split(",").slice(0, 2).join(", ")].filter(Boolean).join(" · "),
  radio: true, favicon: s.favicon || undefined,
});

// ---------- small pieces ----------
const hue = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; };
function Cover({ src, name, size, radius = 12, icon }: { src?: string | null; name: string; size: number | string; radius?: number; icon?: string }) {
  const [bad, setBad] = useState(false);
  const url = src && !bad ? (/^https?:/.test(src) ? src : convertFileSrc(src)) : null;
  return (
    <div className="mu-cover" style={{ width: size, height: size, borderRadius: radius, background: url ? undefined : `hsl(${hue(name)} 32% 24%)` }}>
      {url ? <img src={url} alt="" loading="lazy" onError={() => setBad(true)} /> : <Icon d={icon ?? NOTE} size={typeof size === "number" ? Math.max(16, size / 4) : 32} />}
    </div>
  );
}
const NOTE = "M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z";
const RADIO_ICON = "M4 10h16v10H4zM8 10l9-6M8 15h.01M12 15h5";
const SHUFFLE = "M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5";
const REPEAT = "M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3";
const PREV = "M19 5L9 12l10 7zM5 5h2v14H5z";
const NEXT = "M5 5l10 7-10 7zM17 5h2v14h-2z";
const LYRICS = "M4 6h16M4 12h10M4 18h7M18 14v6M15 17h6";

// ---------- the music pages ----------
export type MusicView = "home" | "library" | "radio" | "podcast";
// ---------- playlists made in Luna (e.g. from a Spotify list), kept in order ----------
export type MPlaylist = { id: string; name: string; from?: string; url?: string; cover?: string | null; at: number; items: QItem[] };
const plSubs = new Set<() => void>();
export const loadMusicPlaylists = () => store.json<MPlaylist[]>("musicPlaylists", []);
/** Music links that once slipped into the film library are taken out again. */
export function purgeMusicFromFilms(): boolean {
  const music = new Set<string>();
  for (const k of Object.keys(store.json<Record<string, unknown>>("musicPlays", {}))) music.add(k);
  for (const p of loadMusicPlaylists()) for (const t of p.items) if (t.src) music.add(t.src);
  const last = store.json<QItem | null>("musicLast", null);
  if (last?.src) music.add(last.src);
  // stream URLs mpv reported instead of the item's own address are music too
  const linkLike = /^https?:\/\/([^/]*\.)?(youtube\.com|youtu\.be|googlevideo\.com|spotify\.com)\//i;
  const isMusicPath = (p: string) => p.startsWith("ytdl://") || music.has(p) || linkLike.test(p);
  let changed = false;
  for (const k of ["files", "pinned"]) {
    const l = store.json<string[]>(k, []);
    const f = l.filter((p) => !isMusicPath(p));
    if (f.length !== l.length) { store.set(k, JSON.stringify(f)); changed = true; }
  }
  const rec = store.json<{ path: string }[]>("recent", []);
  const f = rec.filter((r) => !isMusicPath(r.path));
  if (f.length !== rec.length) { store.set("recent", JSON.stringify(f)); changed = true; }
  return changed;
}
export function saveMusicPlaylists(l: MPlaylist[]) { store.set("musicPlaylists", JSON.stringify(l)); plSubs.forEach((f) => f()); }
function useMusicPlaylists() {
  const [, bump] = useState(0);
  useEffect(() => { const f = () => bump((n) => n + 1); plSubs.add(f); return () => { plSubs.delete(f); }; }, []);
  return loadMusicPlaylists();
}
/** Opens a playlist's sheet (set while the music page is shown). */
let openPlaylist: ((id: string) => void) | null = null;
/** A sheet to open once the library page (re)mounts: switching pages remounts the music page. */
let pendingPl: string | null = null;
/** Opens a playlist's page from anywhere (the assistant): now if the music page is up, else when it comes up. */
export function showPlaylist(id: string) {
  if (openPlaylist) openPlaylist(id); else pendingPl = id;
}

export function MusicPage({ view, setView: setPage, query }: { view: MusicView; setView: (v: MusicView) => void; query: string }) {
  const lib = useMusicLibrary();
  const [album, setAlbum] = useState<Album | null>(null);
  const [pl, setPl] = useState<string | null>(() => { const p = pendingPl; pendingPl = null; return p; });
  useEffect(() => {
    openPlaylist = (id) => {
      store.set("musicLibTab", "lists");
      if (view === "library") setPl(id);
      else { pendingPl = id; setPage("library"); }
    };
    return () => { openPlaylist = null; };
  }, [view]);
  const addFolder = async () => {
    const d = await open({ directory: true, multiple: false });
    if (typeof d === "string" && !lib.folders.includes(d)) lib.setFolders([...lib.folders, d]);
  };
  return (
    <div className="page music">
      {view === "home" && <MusicHome lib={lib} onAlbum={setAlbum} onAddFolder={addFolder} goRadio={() => setPage("radio")} />}
      {view === "library" && <MusicLibrary lib={lib} query={query} onAlbum={setAlbum} onAddFolder={addFolder} />}
      {view === "radio" && <RadioPage query={query} />}
      {view === "podcast" && <Podcasts query={query} />}
      {album && <AlbumSheet a={album} onClose={() => setAlbum(null)} />}
      {pl && <PlaylistPage id={pl} onClose={() => setPl(null)} />}
    </div>
  );
}

type Lib = ReturnType<typeof useMusicLibrary>;

function NoMusic({ onAddFolder, scanning }: { onAddFolder: () => void; scanning: boolean }) {
  return (
    <section className="hero empty mu-empty">
      <h1>{tt("Müzik arşivini ekle")}</h1>
      <div className="muted">{tt("Müzik klasörünü seç: albümler, kapaklar ve sanatçılar dosyaların etiketlerinden çıkar. MP3, FLAC, M4A, OGG, OPUS, WAV…")}</div>
      <button className="primary" onClick={onAddFolder} disabled={scanning}><Icon d={I.folder} size={18} />  {tt("Müzik klasörü ekle")}</button>
    </section>
  );
}

const ASK = "✦  ";
// right-click menus: the assistant's ready questions come first
const albumMenu = (a: Album, onOpen?: () => void): MenuEntry[] => [
  { label: ASK + tt("Bu albüm hakkında"), act: () => askAssistant(tt("“{0}” ({1}) albümü hakkında bilgi ver", a.title, a.artist)) },
  { label: ASK + tt("Bu albümün şarkıları hangi film ve dizilerde geçiyor?"), act: () => askAssistant(tt("“{0}” ({1}) albümünün şarkıları hangi film ve dizilerde geçiyor?", a.title, a.artist)) },
  { label: ASK + tt("Buna benzer albümler"), act: () => askAssistant(tt("“{0}” ({1}) albümüne benzer albümler öner; arşivimde olanları önce söyle", a.title, a.artist)) },
  { label: ASK + tt("Sanatçı hakkında"), act: () => askAssistant(tt("{0} hakkında kısaca bilgi ver; belgeseli ya da filmi var mı?", a.artist)) },
  "sep",
  { label: tt("Çal"), act: () => playQueue(a.tracks.map(trackItem)) },
  { label: tt("Karışık çal"), act: () => playQueue(a.tracks.map(trackItem), 0, true) },
  ...(onOpen ? [{ label: tt("Şarkıları göster"), act: onOpen }] : []),
];
const songMenu = (t: Track, play: () => void): MenuEntry[] => [
  { label: ASK + tt("Bu şarkı hangi film ve dizilerde geçiyor?"), act: () => askAssistant(tt("“{0}” ({1}) şarkısı hangi film ve dizilerde geçiyor?", t.title, t.artist)) },
  { label: ASK + tt("Bu şarkının hikayesi"), act: () => askAssistant(tt("“{0}” ({1}) şarkısının hikayesi ve ilginç bilgiler", t.title, t.artist)) },
  { label: ASK + tt("Buna benzer şarkılar"), act: () => askAssistant(tt("“{0}” ({1}) şarkısına benzer şarkılar öner", t.title, t.artist)) },
  "sep",
  { label: tt("Çal"), act: play },
];
const showMenu = (s: { title: string; author: string }, open: () => void): MenuEntry[] => [
  { label: ASK + tt("Bu podcast hakkında"), act: () => askAssistant(tt("“{0}” ({1}) podcasti hakkında bilgi ver; hangi bölümlerden başlamalıyım?", s.title, s.author)) },
  { label: ASK + tt("Buna benzer podcastler"), act: () => askAssistant(tt("“{0}” podcastine benzer podcastler öner", s.title)) },
  "sep",
  { label: tt("Bölümleri göster"), act: open },
];

function AlbumCard({ a, onOpen }: { a: Album; onOpen: () => void }) {
  return (
    <button className="mu-album" onClick={onOpen} title={`${a.title} · ${a.artist}`} onContextMenu={(e) => openMenu(e, albumMenu(a, onOpen))}>
      <div className="mu-album-art">
        <Cover src={a.cover} name={a.title} size="100%" />
        <span className="mu-album-play" role="button" aria-label={tt("Çal")} tabIndex={0}
          onClick={(e) => { e.stopPropagation(); playQueue(a.tracks.map(trackItem)); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); playQueue(a.tracks.map(trackItem)); } }}>
          <Icon d={I.play} fill size={18} />
        </span>
      </div>
      <b className="ellipsis">{a.title}</b>
      <span className="muted small ellipsis">{a.artist}{a.year ? ` · ${a.year}` : ""}</span>
    </button>
  );
}

const plMenu = (p: MPlaylist): MenuEntry[] => [
  { label: tt("Çal"), act: () => playQueue(p.items) },
  { label: tt("Karışık çal"), act: () => playQueue(p.items, 0, true) },
  "sep",
  { label: tt("Listeyi sil"), danger: true, act: () => { if (confirm(tt("“{0}” listesi silinsin mi?", p.name))) saveMusicPlaylists(loadMusicPlaylists().filter((x) => x.id !== p.id)); } },
];
function PlaylistCard({ p }: { p: MPlaylist }) {
  return (
    <button className="mu-album" onClick={() => openPlaylist?.(p.id)} title={p.name} onContextMenu={(e) => openMenu(e, plMenu(p))}>
      <div className="mu-album-art">
        <Cover src={p.cover} name={p.name} size="100%" icon={NOTE} />
        <span className="mu-album-play" role="button" aria-label={tt("Çal")} tabIndex={0}
          onClick={(e) => { e.stopPropagation(); playQueue(p.items); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); playQueue(p.items); } }}><Icon d={I.play} fill size={18} /></span>
      </div>
      <b className="ellipsis">{p.name}</b>
      <span className="muted small ellipsis">{[p.from, tt("{0} şarkı", p.items.length)].filter(Boolean).join(" · ")}</span>
    </button>
  );
}
const EQ = <span className="pl-eq" aria-hidden="true"><i /><i /><i /></span>;
const copy = (u: string) => { navigator.clipboard.writeText(u).catch(() => {}); };
/** A song's pages: where it plays from (YouTube) and where it came from (Spotify). */
const songLinks = (t: QItem): MenuEntry[] => [
  ...(/^https?:/.test(t.src) ? [{ label: tt("YouTube'da aç"), act: () => openUrl(t.src) }, { label: tt("YouTube bağlantısını kopyala"), act: () => copy(t.src) }] : []),
  ...(t.page ? [{ label: tt("Spotify'da aç"), act: () => openUrl(t.page!) }, { label: tt("Spotify bağlantısını kopyala"), act: () => copy(t.page!) }] : []),
];
/** A playlist as a whole page: its cover as the backdrop, a big play button, the songs as a table you can play, search, reorder and edit. */
function PlaylistPage({ id, onClose }: { id: string; onClose: () => void }) {
  const all = useMusicPlaylists();
  const m = useMusic();
  const [q, setQ] = useState("");
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const p = all.find((x) => x.id === id);
  useEffect(() => {
    document.body.classList.add("pl-open");
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" && !(e.target instanceof HTMLInputElement)) { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", k, true);
    return () => { document.body.classList.remove("pl-open"); window.removeEventListener("keydown", k, true); };
  }, []);
  if (!p) return null;
  const save = (items: QItem[], patch: Partial<MPlaylist> = {}) => saveMusicPlaylists(loadMusicPlaylists().map((x) => (x.id === id ? { ...x, ...patch, items } : x)));
  const total = p.items.reduce((n, t) => n + (t.duration || 0), 0);
  const ours = !!m.now && p.items.some((t) => t.src === m.now!.src);
  const playing = ours && !m.paused;
  const needle = q.trim().toLocaleLowerCase();
  const shown = p.items.map((t, i) => ({ t, i })).filter(({ t }) => !needle || `${t.title} ${t.artist ?? ""}`.toLocaleLowerCase().includes(needle));
  const playAt = (i: number) => {
    if (m.now?.src === p.items[i].src) { mpv("cycle", "pause"); return; }
    playQueue(p.items, i);
  };
  const bigPlay = () => (ours ? mpv("cycle", "pause") : playQueue(p.items));
  const move = (from: number, to: number) => {
    if (from === to) return;
    const items = [...p.items];
    const [x] = items.splice(from, 1);
    items.splice(to, 0, x);
    save(items);
  };
  const rename = () => { const n = prompt(tt("Listenin adı"), p.name)?.trim(); if (n) save(p.items, { name: n }); };
  const remove = () => { if (confirm(tt("“{0}” listesi silinsin mi?", p.name))) { saveMusicPlaylists(loadMusicPlaylists().filter((x) => x.id !== id)); onClose(); } };
  // "⋯": the playlist's own link (the address it was imported from) first, then edit/delete
  const moreMenu = (): MenuEntry[] => {
    const link: MenuEntry[] = p.url
      ? [
        { label: tt("Tarayıcıda aç"), act: () => openUrl(p.url!) },
        { label: tt("Bağlantıyı kopyala"), act: () => copy(p.url!) },
        "sep",
      ]
      : [];
    return [...link, { label: tt("Adını değiştir"), act: rename }, "sep", { label: tt("Listeyi sil"), danger: true, act: remove }];
  };
  const hours = Math.floor(total / 3600), mins = Math.round((total % 3600) / 60);
  return createPortal(
    <>
      <div className="chat-scrim" onMouseDown={onClose} />
      <div className="pl-page pl-card glass page-anim" role="dialog" aria-modal="true" aria-label={p.name}>
        <div className="pl-bg" style={p.cover ? { backgroundImage: `url(${p.cover})` } : undefined} />
        <header className="pl-top">
          <button className="round" aria-label={tt("Geri")} onClick={onClose}><Icon d={I.left} /></button>
        </header>
        <section className="pl-head">
          <Cover src={p.cover} name={p.name} size={224} icon={NOTE} />
          <div className="pl-head-txt">
            <span className="eyebrow">{tt("LİSTE")}</span>
            <h1 title={tt("Adını değiştir")} onClick={rename}>{p.name}</h1>
            <span className="muted pl-meta">{[p.from ? tt("{0}'dan aktarıldı", p.from) : "", tt("{0} şarkı", p.items.length),
              total ? (hours ? tt("{0} sa {1} dk", hours, mins) : tt("{0} dk", mins)) : ""].filter(Boolean).join(" · ")}</span>
          </div>
        </section>
        <div className="pl-bar">
          <button className="pl-big" aria-label={playing ? tt("Duraklat") : tt("Çal")} disabled={!p.items.length} onClick={bigPlay}>
            <Icon d={playing ? I.pause : I.play} fill size={26} /></button>
          <button className={"act" + (ours && m.shuffle ? " on" : "")} data-tip={tt("Karışık çal")} aria-label={tt("Karışık çal")} disabled={!p.items.length}
            onClick={() => playQueue(p.items, 0, true)}><Icon d={SHUFFLE} size={20} /></button>
          <button className="act" data-tip={tt("Diğer seçenekler")} aria-label={tt("Diğer seçenekler")}
            onClick={(e) => openMenu(e, moreMenu())}>
            <Icon d={I.more} size={22} /></button>
          <button className="act" data-tip={tt("Asistana sor")} aria-label={tt("Asistana sor")}
            onClick={openAssistant}><Icon d={I.chat} size={20} /></button>
          <span className="grow" />
          <label className="pl-search"><Icon d={I.search} size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tt("Listede ara")} /></label>
        </div>
        <div className="pl-table">
          <div className="pl-row pl-th"><span>#</span><span>{tt("Başlık")}</span><span className="pl-alb">{tt("Albüm")}</span><span className="pl-dur"><Icon d="M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" size={15} /></span><span /></div>
          {shown.map(({ t, i }) => {
            const cur = m.now?.src === t.src;
            return (
              <div key={i} className={"pl-row" + (cur ? " cur" : "") + (over === i && drag != null && drag !== i ? (drag < i ? " drop-after" : " drop-before") : "")}
                draggable={!needle} onDragStart={() => setDrag(i)} onDragEnd={() => { setDrag(null); setOver(null); }}
                onDragOver={(e) => { if (drag != null) { e.preventDefault(); setOver(i); } }}
                onDrop={(e) => { e.preventDefault(); if (drag != null) move(drag, i); setDrag(null); setOver(null); }}
                onClick={(e) => { if ((e.target as HTMLElement).closest("button")) return; playAt(i); }}
                onContextMenu={(e) => openMenu(e, [...songMenu({ title: t.title, artist: t.artist ?? "" } as Track, () => playQueue(p.items, i)),
                  "sep", ...songLinks(t), "sep",
                  { label: tt("Listeden çıkar"), act: () => save(p.items.filter((_, j) => j !== i)) }])}>
                <button className="pl-n" aria-label={cur && !m.paused ? tt("Duraklat") : tt("Çal")} onClick={() => playAt(i)}>
                  <span className="pl-num">{cur && !m.paused ? EQ : i + 1}</span>
                  <span className="pl-hover"><Icon d={cur && !m.paused ? I.pause : I.play} fill size={14} /></span>
                </button>
                <span className="pl-title">
                  <Cover src={t.cover} name={t.title} size={42} radius={6} icon={NOTE} />
                  <span className="mu-song-t"><b className="ellipsis">{t.title}</b><span className="muted small ellipsis">{t.artist}</span></span>
                </span>
                <span className="pl-alb muted small ellipsis">{t.album ?? ""}</span>
                <span className="pl-dur muted small">{t.duration ? fmtTime(t.duration) : ""}</span>
                <button className="pl-x" aria-label={tt("Listeden çıkar")} title={tt("Listeden çıkar")} onClick={() => save(p.items.filter((_, j) => j !== i))}><Icon d={I.x} size={14} /></button>
              </div>
            );
          })}
          {!shown.length && <div className="muted empty-note">{needle ? tt("Bu aramayla şarkı yok") : tt("Bu liste boş")}</div>}
        </div>
      </div>
    </>,
    document.querySelector(".root") ?? document.body,
  );
}

function SongTile({ q, n, onPlay }: { q: QItem; n: number; onPlay: () => void }) {
  return (
    <button className="mu-album" onClick={onPlay} title={`${q.title}${q.artist ? " · " + q.artist : ""}`}
      onContextMenu={(e) => openMenu(e, songMenu({ title: q.title, artist: q.artist ?? "" } as Track, onPlay))}>
      <div className="mu-album-art">
        <Cover src={q.cover} name={q.title} size="100%" icon={NOTE} />
        <span className="mu-album-play" aria-hidden="true"><Icon d={I.play} fill size={18} /></span>
      </div>
      <b className="ellipsis">{q.title}</b>
      <span className="muted small ellipsis">{[q.artist, tt("{0} kez", n)].filter(Boolean).join(" · ")}</span>
    </button>
  );
}
function HomeLists() {
  const lists = useMusicPlaylists();
  useMusic(); // the counts change as songs play
  const most = mostPlayed();
  return (
    <>
      {lists.length > 0 && (
        <section className="row"><h2>{tt("Listelerin")}</h2>
          <div className="mu-grid">{lists.slice(0, 12).map((p) => <PlaylistCard key={p.id} p={p} />)}</div>
        </section>
      )}
      {most.length > 0 && (
        <section className="row"><h2>{tt("En çok dinlediklerin")}</h2>
          <div className="mu-grid">{most.map((x, i) => <SongTile key={x.q.src} q={x.q} n={x.n} onPlay={() => playQueue(most.map((m) => m.q), i)} />)}</div>
        </section>
      )}
    </>
  );
}

function MusicHome({ lib, onAlbum, onAddFolder, goRadio }: { lib: Lib; onAlbum: (a: Album) => void; onAddFolder: () => void; goRadio: () => void }) {
  const m = useMusic();
  const last = store.json<QItem | null>("musicLast", null);
  const recentKeys = store.json<string[]>("musicRecentAlbums", []);
  const recent = recentKeys.map((k) => lib.albums.find((a) => a.key === k)).filter(Boolean) as Album[];
  const others = lib.albums.filter((a) => !recentKeys.includes(a.key)).slice(0, 18);
  const lastAlbum = last?.albumKey ? lib.albums.find((a) => a.key === last.albumKey) : undefined;
  const resume = () => {
    if (!lastAlbum || !last) return;
    const i = lastAlbum.tracks.findIndex((t) => t.path === last.src);
    playQueue(lastAlbum.tracks.map(trackItem), Math.max(0, i));
  };
  const [top, setTop] = useState<Station[] | null>(null);
  useEffect(() => {
    let alive = true;
    stations(`/stations/bycountrycodeexact/${lang() === "tr" ? "TR" : "US"}?order=votes&reverse=true&hidebroken=true&limit=12`)
      .then((l) => alive && setTop(l)).catch(() => alive && setTop([]));
    return () => { alive = false; };
  }, []);
  if (lib.tracks && !lib.tracks.length && !lib.folders.length) return (
    <>
      <HomeLists />
      <NoMusic onAddFolder={onAddFolder} scanning={lib.scanning} />
      <RadioRow list={top} title={tt("Canlı radyo")} more={goRadio} />
    </>
  );
  return (
    <>
      <section className="mu-top">
        <div className="mu-card mu-mix">
          <div>
            <div className="eyebrow">{tt("BUGÜN İÇİN")}</div>
            <h2>{tt("Karışık çal")}</h2>
            <div className="muted">{lib.tracks == null ? tt("Arşivin okunuyor…") : tt("Arşivindeki {0} şarkıdan rastgele", lib.tracks.length)}</div>
          </div>
          <button className="primary" disabled={!lib.tracks?.length} onClick={() => playQueue(lib.tracks!.map(trackItem), 0, true)}>
            <Icon d={SHUFFLE} size={16} />  {tt("Karışık çal")}</button>
        </div>
        {last && lastAlbum ? (
          <button className="mu-card mu-resume" onClick={resume}>
            <Cover src={last.cover} name={last.album ?? last.title} size={112} />
            <div className="mu-resume-txt">
              <div className="eyebrow">{m.now?.src === last.src ? tt("ŞİMDİ ÇALIYOR") : tt("KALDIĞIN YERDEN")}</div>
              <b>{last.title}</b>
              <span className="muted">{[last.artist, last.album].filter(Boolean).join(" · ")}</span>
            </div>
          </button>
        ) : (
          <button className="mu-card mu-resume" onClick={goRadio}>
            <Cover name="radio" size={112} icon={RADIO_ICON} />
            <div className="mu-resume-txt">
              <div className="eyebrow">{tt("CANLI")}</div>
              <b>{tt("Radyo dinle")}</b>
              <span className="muted">{tt("Dünyanın her yerinden binlerce istasyon")}</span>
            </div>
          </button>
        )}
      </section>
      {lib.scanning && !lib.tracks?.length && <div className="muted small pulse">{tt("Müzik arşivin taranıyor…")}</div>}
      <HomeLists />
      {recent.length > 0 && (
        <section className="row"><h2>{tt("Son dinlenen albümler")}</h2>
          <div className="mu-grid">{recent.slice(0, 12).map((a) => <AlbumCard key={a.key} a={a} onOpen={() => onAlbum(a)} />)}</div>
        </section>
      )}
      {others.length > 0 && (
        <section className="row"><h2>{recent.length ? tt("Arşivinden") : tt("Albümlerin")}</h2>
          <div className="mu-grid">{others.map((a) => <AlbumCard key={a.key} a={a} onOpen={() => onAlbum(a)} />)}</div>
        </section>
      )}
      <RadioRow list={top} title={tt("Canlı radyo")} more={goRadio} />
    </>
  );
}

function RadioRow({ list, title, more }: { list: Station[] | null; title: string; more?: () => void }) {
  const m = useMusic();
  if (list && !list.length) return null;
  return (
    <section className="row">
      <div className="row-head"><h2>{title}</h2>{more && <button className="chip" onClick={more}>{tt("Tümü")}</button>}</div>
      <div className="mu-stations">
        {list == null && Array.from({ length: 8 }, (_, i) => <div key={i} className="mu-station ghost-card" />)}
        {list?.map((s) => <StationCard key={s.stationuuid} s={stationItem(s)} on={m.now?.src === s.url_resolved} />)}
      </div>
    </section>
  );
}

function StationCard({ s, on }: { s: QItem; on: boolean }) {
  const favs = store.json<QItem[]>("musicRadioFav", []);
  const fav = favs.some((f) => f.src === s.src);
  const [, bump] = useState(0);
  const toggleFav = () => {
    store.set("musicRadioFav", JSON.stringify(fav ? favs.filter((f) => f.src !== s.src) : [s, ...favs]));
    bump((n) => n + 1);
  };
  return (
    <div className={"mu-station" + (on ? " on" : "")}>
      <button className="mu-station-main" onClick={() => playQueue([s])} title={s.title}
        onContextMenu={(e) => openMenu(e, [
          { label: ASK + tt("Buna benzer radyolar"), act: () => askAssistant(tt("“{0}” radyosuna benzer istasyonlar öner ve birini aç", s.title)) },
          "sep",
          { label: tt("Dinle"), act: () => playQueue([s]) },
          { label: fav ? tt("Favorilerden çıkar") : tt("Favorilere ekle"), act: toggleFav },
        ])}>
        <Cover src={s.favicon} name={s.title} size={44} radius={10} icon={RADIO_ICON} />
        <span className="mu-station-txt"><b className="ellipsis">{s.title}</b><span className="muted small ellipsis">{s.artist}</span></span>
        {on && <span className="mu-live">{tt("CANLI")}</span>}
      </button>
      <button className={"mu-fav" + (fav ? " on" : "")} aria-label={fav ? tt("Favorilerden çıkar") : tt("Favorilere ekle")} title={fav ? tt("Favorilerden çıkar") : tt("Favorilere ekle")} onClick={toggleFav}>
        <Icon d="M12 21l-8.5-8.6a5 5 0 0 1 7-7.1L12 6.8l1.5-1.5a5 5 0 0 1 7 7.1z" size={16} fill={fav} />
      </button>
    </div>
  );
}

type LibTab = "albums" | "artists" | "songs" | "lists";
function MusicLibrary({ lib, query, onAlbum, onAddFolder }: { lib: Lib; query: string; onAlbum: (a: Album) => void; onAddFolder: () => void }) {
  const [tab, setTab] = useState<LibTab>(() => (store.get("musicLibTab") as LibTab) || "albums");
  const pick = (t: LibTab) => { setTab(t); store.set("musicLibTab", t); };
  const [artist, setArtist] = useState<string | null>(null);
  const q = query.trim().toLocaleLowerCase(lang() === "tr" ? "tr" : "en");
  const hit = (...xs: (string | undefined)[]) => !q || xs.some((x) => x?.toLocaleLowerCase(lang() === "tr" ? "tr" : "en").includes(q));
  const albums = lib.albums.filter((a) => hit(a.title, a.artist) && (!artist || a.artist === artist))
    .sort((x, y) => x.artist.localeCompare(y.artist) || (x.year ?? 0) - (y.year ?? 0));
  const artists = [...new Set(lib.albums.map((a) => a.artist))].filter((a) => hit(a)).sort((x, y) => x.localeCompare(y));
  const songs = (lib.tracks ?? []).filter((t) => hit(t.title, t.artist, t.album)).slice(0, 500);
  const lists = useMusicPlaylists().filter((p) => hit(p.name));
  if (lib.tracks && !lib.tracks.length && !lib.folders.length && tab !== "lists" && !lists.length) return <NoMusic onAddFolder={onAddFolder} scanning={lib.scanning} />;
  return (
    <>
      <div className="row-head mu-lib-head">
        <div className="seg-row">
          {([["albums", tt("Albümler")], ["artists", tt("Sanatçılar")], ["songs", tt("Şarkılar")], ["lists", tt("Listeler")]] as const).map(([k, l]) => (
            <button key={k} className={"seg sm" + (tab === k ? " on" : "")} onClick={() => { pick(k); setArtist(null); }}>{l}</button>
          ))}
        </div>
        <span className="grow" />
        {lib.scanning ? <span className="muted small pulse">{tt("Taranıyor…")}</span> : <span className="muted small">{tt("{0} şarkı · {1} albüm", lib.tracks?.length ?? 0, lib.albums.length)}</span>}
        <button className="chip" onClick={lib.rescan} disabled={lib.scanning}>{tt("Yeniden tara")}</button>
        <button className="chip" onClick={onAddFolder}><Icon d={I.plus} size={14} />  {tt("Klasör")}</button>
      </div>
      <div className="mu-folders">
        {lib.folders.map((f) => (
          <span key={f} className="mu-folder" title={f}><Icon d={I.folder} size={14} /><span className="ellipsis">{f}</span>
            <button aria-label={tt("Kaldır")} title={tt("Kaldır")} onClick={() => lib.setFolders(lib.folders.filter((x) => x !== f))}><Icon d={I.x} size={12} /></button></span>
        ))}
      </div>
      {tab === "albums" && (
        <>
          {artist && <div className="mu-crumb"><button className="chip" onClick={() => setArtist(null)}>← {tt("Tüm albümler")}</button><b>{artist}</b></div>}
          <div className="mu-grid">{albums.map((a) => <AlbumCard key={a.key} a={a} onOpen={() => onAlbum(a)} />)}</div>
        </>
      )}
      {tab === "artists" && (
        <div className="mu-artists">
          {artists.map((name) => {
            const theirs = lib.albums.filter((a) => a.artist === name);
            return (
              <button key={name} className="mu-artist" onClick={() => { setArtist(name); pick("albums"); }}>
                <Cover src={theirs.find((a) => a.cover)?.cover} name={name} size={120} radius={60} />
                <b className="ellipsis">{name}</b>
                <span className="muted small">{tt("{0} albüm", theirs.length)}</span>
              </button>
            );
          })}
        </div>
      )}
      {tab === "songs" && <SongList tracks={songs} showAlbum />}
      {tab === "lists" && (lists.length
        ? <div className="mu-grid">{lists.map((p) => <PlaylistCard key={p.id} p={p} />)}</div>
        : <div className="muted empty-note">{tt("Henüz listen yok. Üstteki bağlantı düğmesine bir Spotify liste linki yapıştır: şarkıların YouTube karşılıkları bulunur ve aynı sırayla buraya liste olarak eklenir.")}</div>)}
    </>
  );
}

function SongList({ tracks, showAlbum }: { tracks: Track[]; showAlbum?: boolean }) {
  const m = useMusic();
  return (
    <div className="mu-songs">
      {tracks.map((t, i) => {
        const on = m.now?.src === t.path;
        return (
          <button key={t.path} className={"mu-song" + (on ? " on" : "")} onClick={() => playQueue(tracks.map(trackItem), i)}
            onContextMenu={(e) => openMenu(e, songMenu(t, () => playQueue(tracks.map(trackItem), i)))}>
            <span className="mu-n">{on ? <Icon d={NOTE} size={14} /> : showAlbum ? i + 1 : t.track ?? i + 1}</span>
            {showAlbum && <Cover src={t.cover} name={t.album} size={36} radius={6} />}
            <span className="mu-song-t"><b className="ellipsis">{t.title}</b><span className="muted small ellipsis">{showAlbum ? `${t.artist} · ${t.album}` : t.artist}</span></span>
            <span className="muted small">{t.duration ? fmtTime(t.duration) : ""}</span>
          </button>
        );
      })}
    </div>
  );
}

function AlbumSheet({ a, onClose }: { a: Album; onClose: () => void }) {
  const total = a.tracks.reduce((n, t) => n + (t.duration || 0), 0);
  return createPortal(
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal wide mu-sheet">
        <div className="mu-sheet-head">
          <Cover src={a.cover} name={a.title} size={168} />
          <div className="mu-sheet-txt">
            <span className="eyebrow">{tt("ALBÜM")}</span>
            <h2>{a.title}</h2>
            <span className="muted">{a.artist}{a.year ? ` · ${a.year}` : ""} · {tt("{0} şarkı", a.tracks.length)}{total ? ` · ${fmtTime(total)}` : ""}</span>
            <div className="seg-row">
              <button className="primary" onClick={() => { playQueue(a.tracks.map(trackItem)); onClose(); }}><Icon d={I.play} fill size={16} />  {tt("Çal")}</button>
              <button className="chip" onClick={() => { playQueue(a.tracks.map(trackItem), 0, true); onClose(); }}><Icon d={SHUFFLE} size={14} />  {tt("Karışık")}</button>
            </div>
          </div>
          <button className="round" aria-label={tt("Kapat")} onClick={onClose}><Icon d={I.x} size={18} /></button>
        </div>
        <SongList tracks={a.tracks} />
      </div>
    </div>,
    document.body,
  );
}

function RadioPage({ query }: { query: string }) {
  const m = useMusic();
  const [q, setQ] = useState(query);
  const [scope, setScope] = useState<"local" | "world">("local");
  const [list, setList] = useState<Station[] | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => { setQ(query); }, [query]);
  useEffect(() => {
    let alive = true;
    setList(null);
    setErr(false);
    const t = setTimeout(() => {
      const cc = lang() === "tr" ? "TR" : "US";
      const path = q.trim()
        ? `/stations/search?name=${encodeURIComponent(q.trim())}&order=votes&reverse=true&hidebroken=true&limit=60${scope === "local" ? "&countrycode=" + cc : ""}`
        : scope === "local" ? `/stations/bycountrycodeexact/${cc}?order=votes&reverse=true&hidebroken=true&limit=60` : `/stations/topvote/60`;
      stations(path).then((l) => alive && setList(l)).catch(() => { if (alive) { setList([]); setErr(true); } });
    }, q.trim() ? 400 : 0);
    return () => { alive = false; clearTimeout(t); };
  }, [q, scope]);
  const favs = store.json<QItem[]>("musicRadioFav", []);
  const recent = store.json<QItem[]>("musicRecentRadio", []);
  return (
    <>
      <div className="row-head mu-lib-head">
        <label className="search mu-radio-search"><Icon d={I.search} size={18} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tt("İstasyon ara: ad, tür (jazz, rock)…")} /></label>
        <div className="seg-row">
          <button className={"seg sm" + (scope === "local" ? " on" : "")} onClick={() => setScope("local")}>{lang() === "tr" ? tt("Türkiye") : tt("Ülkem")}</button>
          <button className={"seg sm" + (scope === "world" ? " on" : "")} onClick={() => setScope("world")}>{tt("Dünya")}</button>
        </div>
      </div>
      {!q.trim() && favs.length > 0 && (
        <section className="row"><h2>{tt("Favorilerin")}</h2>
          <div className="mu-stations">{favs.map((s) => <StationCard key={s.src} s={s} on={m.now?.src === s.src} />)}</div></section>
      )}
      {!q.trim() && recent.length > 0 && (
        <section className="row"><h2>{tt("Son dinlediklerin")}</h2>
          <div className="mu-stations">{recent.map((s) => <StationCard key={s.src} s={s} on={m.now?.src === s.src} />)}</div></section>
      )}
      <section className="row">
        <h2>{q.trim() ? tt("“{0}” için istasyonlar", q.trim()) : tt("En sevilen istasyonlar")}</h2>
        {err && <div className="muted">{tt("Radyo listesi alınamadı; internet bağlantını kontrol et.")}</div>}
        {list && !list.length && !err && <div className="muted">{tt("İstasyon bulunamadı.")}</div>}
        <div className="mu-stations">
          {list == null && Array.from({ length: 12 }, (_, i) => <div key={i} className="mu-station ghost-card" />)}
          {list?.map((s) => <StationCard key={s.stationuuid} s={stationItem(s)} on={m.now?.src === s.url_resolved} />)}
        </div>
        <div className="muted small mu-credit">{tt("İstasyon listesi: radio-browser.info (açık ve ücretsiz)")}</div>
      </section>
    </>
  );
}

// ---------- podcasts (Apple's free directory to find them; the shows' own RSS feeds to play them) ----------
type Show = { feed: string; title: string; author: string; art?: string };
type Episode = { src: string; title: string; date?: number; duration?: number; about?: string };
const loadSubs = () => store.json<Show[]>("podcasts", []);
async function searchShows(q: string): Promise<Show[]> {
  const r = await getJson(`https://itunes.apple.com/search?media=podcast&limit=30&term=${encodeURIComponent(q)}`);
  return (r?.results ?? []).filter((x: any) => x.feedUrl).map((x: any) => ({ feed: x.feedUrl, title: x.collectionName, author: x.artistName, art: x.artworkUrl600 ?? x.artworkUrl100 }));
}
type Top = { id: string; title: string; author: string; art?: string };
async function topShows(): Promise<Top[]> {
  const k = "podTop:" + lang();
  const c = store.json<{ at: number; l: Top[] } | null>(k, null);
  if (c && Date.now() - c.at < 86400e3) return c.l;
  const r = await getJson(`https://rss.marketingtools.apple.com/api/v2/${lang() === "tr" ? "tr" : "us"}/podcasts/top/30/podcasts.json`);
  const l: Top[] = (r?.feed?.results ?? []).map((x: any) => ({ id: x.id, title: x.name, author: x.artistName, art: x.artworkUrl100?.replace("100x100", "600x600") }));
  store.set(k, JSON.stringify({ at: Date.now(), l }));
  return l;
}
async function feedOf(t: Top): Promise<Show | null> {
  const r = await getJson(`https://itunes.apple.com/lookup?id=${t.id}`);
  const x = r?.results?.[0];
  return x?.feedUrl ? { feed: x.feedUrl, title: t.title, author: t.author, art: x.artworkUrl600 ?? t.art } : null;
}
const durSecs = (d: string) => { const p = d.split(":").map(Number); return p.some(isNaN) ? undefined : p.reduce((n, x) => n * 60 + x, 0); };
async function episodes(feed: string): Promise<{ show: Partial<Show>; eps: Episode[] }> {
  const xml = await invoke<string>("http_text", { url: feed });
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const ch = doc.getElementsByTagName("channel")[0];
  const txt = (el: Element | undefined, name: string) => el ? Array.from(el.children).find((c) => c.localName === name || c.tagName === name)?.textContent?.trim() : undefined;
  const img = ch ? Array.from(ch.children).find((c) => c.localName === "image" && c.getAttribute("href"))?.getAttribute("href") ?? txt(Array.from(ch.children).find((c) => c.localName === "image"), "url") : undefined;
  const eps = Array.from(doc.getElementsByTagName("item")).flatMap((it) => {
    const enc = Array.from(it.children).find((c) => c.localName === "enclosure");
    const src = enc?.getAttribute("url");
    if (!src) return [];
    const d = txt(it, "pubDate");
    const dur = Array.from(it.children).find((c) => c.localName === "duration")?.textContent?.trim();
    return [{ src, title: txt(it, "title") ?? "", date: d ? Date.parse(d) : undefined, duration: dur ? durSecs(dur) : undefined,
      about: (txt(it, "description") ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 400) }];
  });
  return { show: { title: txt(ch, "title"), author: txt(ch, "author"), art: img ?? undefined }, eps };
}

/** A podcast by name with its episodes (for the assistant). */
export async function findPodcast(q: string): Promise<{ show: Show; items: QItem[] } | null> {
  const show = (await searchShows(q))[0];
  if (!show) return null;
  const { show: s, eps } = await episodes(show.feed);
  const art = show.art ?? s.art;
  return { show: { ...show, art }, items: eps.map((e) => ({ src: e.src, title: e.title, artist: show.title, album: show.title, cover: art, duration: e.duration, podcast: show.feed })) };
}

function ShowCard({ s, onOpen }: { s: { title: string; author: string; art?: string }; onOpen: () => void }) {
  return (
    <button className="mu-album" onClick={onOpen} title={s.title} onContextMenu={(e) => openMenu(e, showMenu(s, onOpen))}>
      <div className="mu-album-art"><Cover src={s.art} name={s.title} size="100%" icon={MIC} /></div>
      <b className="ellipsis">{s.title}</b>
      <span className="muted small ellipsis">{s.author}</span>
    </button>
  );
}
const MIC = "M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3";

function Podcasts({ query }: { query: string }) {
  const [q, setQ] = useState(query);
  const [deb, setDeb] = useState(query);
  useEffect(() => { setQ(query); setDeb(query); }, [query]);
  useEffect(() => { const t = setTimeout(() => setDeb(q.trim()), 450); return () => clearTimeout(t); }, [q]);
  const [subs, setSubs] = useState<Show[]>(loadSubs);
  const [found, setFound] = useState<Show[] | null>(null);
  const [top, setTop] = useState<Top[] | null>(null);
  const [err, setErr] = useState(false);
  const [show, setShow] = useState<Show | null>(null);
  useEffect(() => {
    let alive = true;
    setErr(false);
    if (deb) { setFound(null); searchShows(deb).then((l) => alive && setFound(l)).catch(() => alive && setErr(true)); }
    else { setFound(null); topShows().then((l) => alive && setTop(l)).catch(() => alive && setErr(true)); }
    return () => { alive = false; };
  }, [deb]);
  const openTop = async (t: Top) => { const s = await feedOf(t).catch(() => null); if (s) setShow(s); };
  if (show) return <ShowPage s={show} onBack={() => { setShow(null); setSubs(loadSubs()); }} />;
  return (
    <>
      <div className="row-head mu-lib-head">
        <label className="search mu-radio-search"><Icon d={I.search} size={18} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tt("Podcast ara")} /></label>
      </div>
      {!deb && subs.length > 0 && (
        <section className="row"><h2>{tt("Abone olduklarım")}</h2>
          <div className="mu-grid">{subs.map((x) => <ShowCard key={x.feed} s={x} onOpen={() => setShow(x)} />)}</div></section>
      )}
      <section className="row">
        <h2>{deb ? tt("“{0}” için podcastler", deb) : tt("Öne çıkan podcastler")}</h2>
        {err && <div className="muted">{tt("Podcast listesi alınamadı; internet bağlantını kontrol et.")}</div>}
        <div className="mu-grid">
          {(deb ? found : top) == null && !err && Array.from({ length: 8 }, (_, i) => <div key={i} className="mu-album ghost-card"><div className="mu-album-art" /></div>)}
          {deb ? found?.map((x) => <ShowCard key={x.feed} s={x} onOpen={() => setShow(x)} />)
            : top?.map((t) => <ShowCard key={t.id} s={t} onOpen={() => openTop(t)} />)}
        </div>
        {deb && found && !found.length && <div className="muted">{tt("Podcast bulunamadı.")}</div>}
        <div className="muted small mu-credit">{tt("Podcast dizini: Apple Podcasts (arama) · bölümler podcastin kendi RSS beslemesinden")}</div>
      </section>
    </>
  );
}

function ShowPage({ s, onBack }: { s: Show; onBack: () => void }) {
  const m = useMusic();
  const [data, setData] = useState<{ show: Partial<Show>; eps: Episode[] } | null>(null);
  const [err, setErr] = useState("");
  const [subbed, setSubbed] = useState(() => loadSubs().some((x) => x.feed === s.feed));
  const [n, setN] = useState(30);
  useEffect(() => {
    let alive = true;
    episodes(s.feed).then((d) => alive && setData(d)).catch((e) => alive && setErr(String(e)));
    return () => { alive = false; };
  }, [s.feed]);
  const art = s.art ?? data?.show.art;
  const toggleSub = () => {
    const l = loadSubs();
    store.set("podcasts", JSON.stringify(subbed ? l.filter((x) => x.feed !== s.feed) : [{ ...s, art }, ...l]));
    setSubbed(!subbed);
  };
  const item = (e: Episode): QItem => ({ src: e.src, title: e.title, artist: s.title, album: s.title, cover: art, duration: e.duration, podcast: s.feed });
  const play = (i: number) => data && playQueue(data.eps.slice(i).map(item));
  const fmtDate = (t?: number) => (t ? new Date(t).toLocaleDateString(lang() === "tr" ? "tr-TR" : "en-US", { day: "numeric", month: "short", year: "numeric" }) : "");
  return (
    <>
      <div className="row-head mu-lib-head"><button className="chip" onClick={onBack}>← {tt("Podcastler")}</button></div>
      <div className="mu-sheet-head pod-head">
        <Cover src={art} name={s.title} size={168} icon={MIC} />
        <div className="mu-sheet-txt">
          <span className="eyebrow">{tt("PODCAST")}</span>
          <h2>{data?.show.title ?? s.title}</h2>
          <span className="muted">{s.author || data?.show.author}{data ? ` · ${tt("{0} bölüm", data.eps.length)}` : ""}</span>
          <div className="seg-row">
            <button className="primary" disabled={!data?.eps.length} onClick={() => play(0)}><Icon d={I.play} fill size={16} />  {tt("En yeni bölümü çal")}</button>
            <button className={"chip" + (subbed ? " on" : "")} onClick={toggleSub}>{subbed ? tt("✓ Abonesin") : tt("+ Abone ol")}</button>
          </div>
        </div>
      </div>
      {err && <div className="muted">{tt("Podcast okunamadı: ") + err}</div>}
      {!data && !err && <div className="muted pulse">{tt("Bölümler getiriliyor…")}</div>}
      <div className="mu-songs pod-eps">
        {data?.eps.slice(0, n).map((e, i) => {
          const pos = Number(store.get("podPos:" + e.src) ?? 0);
          const on = m.now?.src === e.src;
          return (
            <button key={e.src} className={"mu-song pod-ep" + (on ? " on" : "") + (pos === -1 ? " heard" : "")} onClick={() => play(i)}>
              <span className="mu-n">{on ? <Icon d={NOTE} size={14} /> : <Icon d={I.play} fill size={12} />}</span>
              <span className="mu-song-t">
                <b className="ellipsis">{e.title}</b>
                <span className="muted small ellipsis">{[fmtDate(e.date), e.about].filter(Boolean).join(" · ")}</span>
              </span>
              <span className="muted small pod-dur">{pos === -1 ? tt("dinlendi") : pos > 0 && e.duration ? tt("{0} kaldı", fmtTime(e.duration - pos)) : e.duration ? fmtTime(e.duration) : ""}</span>
            </button>
          );
        })}
      </div>
      {data && data.eps.length > n && <button className="chip bk-more" onClick={() => setN(n + 30)}>{tt("Daha fazla bölüm")}</button>}
    </>
  );
}

// ---------- "Dosya aç" and "Bağlantı" in the music part ----------
const AUDIO_EXT = ["mp3", "flac", "m4a", "aac", "ogg", "opus", "wav", "wma", "aiff", "ape", "wv"];
export async function openMusicFiles() {
  const f = await open({ multiple: true, filters: [{ name: tt("Müzik"), extensions: AUDIO_EXT }] });
  const files = Array.isArray(f) ? f : typeof f === "string" ? [f] : [];
  if (!files.length) return;
  playQueue(files.map((p) => {
    const stem = p.split(/[\\/]/).pop()!.replace(/\.[^.]+$/, "");
    const [artist, title] = stem.includes(" - ") ? stem.split(" - ", 2) : ["", stem];
    return { src: p, title: title.trim(), artist: artist.replace(/^\d+[\s.-]*/, "").trim() || undefined };
  }));
}
type YtHit = { url: string; title: string; channel: string; duration?: number; thumb?: string };
const ytItem = (h: YtHit): QItem => ({ src: h.url, title: h.title, artist: h.channel, cover: h.thumb, duration: h.duration, yt: true });
/** A YouTube link opened from anywhere plays in the music part, never as a film. */
export async function playYouTubeLink(url: string): Promise<boolean> {
  stopMusic();
  const hits = await invoke<YtHit[]>("yt_info", { url }).catch(() => [] as YtHit[]);
  if (!hits.length) { mpv("stop"); return false; }
  playQueue(hits.map(ytItem));
  return true;
}
const isYouTube = (u: string) => /^(https?:\/\/)?((www|m|music)\.)?(youtube\.com|youtu\.be)\//i.test(u);
const AUDIO_URL = /^https?:\/\/\S+\.(mp3|m4a|aac|ogg|opus|flac|wav)(\?\S*)?$/i;
/** What a music page (Spotify, Apple Music, Deezer…) is about: "Artist Title", read from its preview tags. */
async function pageQuery(url: string): Promise<string | null> {
  const html = await invoke<string>("http_text", { url });
  const doc = new DOMParser().parseFromString(html, "text/html");
  const meta = (p: string) => doc.querySelector(`meta[property="${p}"], meta[name="${p}"]`)?.getAttribute("content")?.trim() ?? "";
  const title = meta("og:title"), desc = meta("og:description");
  if (!title) return null;
  // Spotify: "Pink Floyd · Wish You Were Here · Song · 1975"; an album page: "Listen to X - Album by Y | Spotify"
  const album = title.match(/^Listen to (.+?) - (?:Album|Single|EP) by (.+?) \|/i);
  if (album) return `${album[2]} ${album[1]}`;
  const artist = desc.split(" · ")[0];
  return artist && artist !== title && desc.includes(" · ") ? `${artist} ${title}` : title.replace(/\s*[|–-]\s*(Spotify|Apple Music|Deezer).*$/i, "");
}

/** The songs of a Spotify playlist or album, from Spotify's embed page (no account, up to 100 songs).
 *  Nothing is downloaded: each song is found on YouTube by mpv when its turn comes (ytdl://ytsearch1:). */
/** `more`: the ids of the songs after the first 100 (the embed page stops there), read one by one later. */
type SpList = { name: string; by: string; url: string; cover?: string; tracks: QItem[]; total?: number; more?: string[] };
async function spotifyList(url: string): Promise<SpList | null> {
  const m = url.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(playlist|album)\/([A-Za-z0-9]+)/i);
  if (!m) return null;
  const [html, page] = await Promise.all([
    invoke<string>("http_text", { url: `https://open.spotify.com/embed/${m[1].toLowerCase()}/${m[2]}` }),
    invoke<string>("http_text", { url: `https://open.spotify.com/${m[1].toLowerCase()}/${m[2]}` }).catch(() => ""),
  ]);
  const total = Number(page.match(/name="music:song_count" content="(\d+)"/)?.[1]) || undefined;
  const json = new DOMParser().parseFromString(html, "text/html").getElementById("__NEXT_DATA__")?.textContent;
  const e = json ? JSON.parse(json)?.props?.pageProps?.state?.data?.entity : null;
  if (!e?.trackList?.length) return null;
  const cover: string | undefined = e.coverArt?.sources?.[0]?.url ?? e.visualIdentity?.image?.[0]?.url;
  const tracks: QItem[] = e.trackList.map((t: { title: string; subtitle?: string; duration?: number; uri?: string }) => {
    const artist = (t.subtitle ?? "").replace(/\u00a0/g, " ");
    return { src: `ytdl://ytsearch1:${artist.split(",")[0]} ${t.title} audio`, title: t.title, artist, album: m[1] === "album" ? e.name : undefined,
      cover, duration: t.duration ? t.duration / 1000 : undefined, yt: true,
      page: t.uri?.startsWith("spotify:track:") ? `https://open.spotify.com/track/${t.uri.split(":")[2]}` : undefined };
  });
  // the embed page gives 100 songs at most; Spotify's list service (with the page's anonymous token) gives every id
  let more: string[] | undefined;
  const token = html.match(/"accessToken":"([^"]+)"/)?.[1];
  if (m[1].toLowerCase() === "playlist" && tracks.length >= 100 && token) {
    // page by page until the list's own length: the service says how long the list is and pages on request
    const ids: string[] = [];
    try {
      for (let from = 0, length = Infinity, page = 0; from < length && page < 200; page++) {
        const d = JSON.parse(await invoke<string>("http_text", { url: `https://spclient.wg.spotify.com/playlist/v2/playlist/${m[2]}?from=${from}&length=500`, bearer: token }));
        const items: { uri?: string }[] = d?.contents?.items ?? [];
        length = Number(d?.length) || 0;
        if (!items.length) break;
        ids.push(...items.map((x) => x.uri ?? "").filter((u) => u.startsWith("spotify:track:")).map((u) => u.split(":")[2]));
        from += items.length;
      }
    } catch { /* what was read so far; the note says how many */ }
    if (ids.length > tracks.length) more = ids.slice(tracks.length);
  }
  return { name: e.name, by: e.subtitle ?? "", url: `https://open.spotify.com/${m[1].toLowerCase()}/${m[2]}`, cover, tracks, total, more };
}
/** One song's name, artists and length, from its embed page. */
async function spotifyTrack(id: string): Promise<QItem | null> {
  const html = await invoke<string>("http_text", { url: `https://open.spotify.com/embed/track/${id}` }).catch(() => "");
  const json = new DOMParser().parseFromString(html, "text/html").getElementById("__NEXT_DATA__")?.textContent;
  const e = json ? JSON.parse(json)?.props?.pageProps?.state?.data?.entity : null;
  if (!e?.name) return null;
  const artist = (e.artists ?? []).map((a: { name: string }) => a.name).join(", ");
  return { src: "", title: e.name, artist, duration: e.duration ? e.duration / 1000 : undefined, yt: true, page: `https://open.spotify.com/track/${id}` };
}

type ShiftRow = { sp: QItem; hit?: YtHit | null; on: boolean; open?: boolean; alts?: YtHit[] | null };
/** The closest-length video among the results (a live version or a long video is usually the wrong one). */
const bestHit = (hits: YtHit[], dur?: number) => (dur && hits.find((h) => h.duration && Math.abs(h.duration - dur) <= 12)) || hits[0];
const plain = (x: string) => x.replace(/[^\p{L}\p{N}'&]+/gu, " ").replace(/\s+/g, " ").trim();
const shiftQueries = (sp: QItem) => {
  const artists = (sp.artist ?? "").split(/,\s*/).filter(Boolean);
  return [...new Set([plain(`${artists[0] ?? ""} ${sp.title}`), plain(`${artists.join(" ")} ${sp.title}`), plain(sp.title)])].filter(Boolean);
};
async function shiftSearch(sp: QItem, n: number): Promise<YtHit[]> {
  for (const q of shiftQueries(sp)) {
    const hits = await invoke<YtHit[]>("yt_search", { query: q, n }).catch(() => [] as YtHit[]);
    if (hits.length) return hits;
  }
  return [];
}
/** A Spotify list moved over: each song's YouTube match side by side, wrong ones fixed by hand, then saved as a playlist in the same order. */
/** A Spotify link handed to the assistant: the same move, inside the chat. */
export const isSpotifyList = (u: string) => /open\.spotify\.com\/(intl-[a-z-]+\/)?(playlist|album)\//i.test(u);
export function SpotifyMove({ url, onDone }: { url: string; onDone: (name: string, id: string) => void }) {
  const [list, setList] = useState<SpList | null | undefined>(undefined);
  const [err, setErr] = useState("");
  useEffect(() => {
    let alive = true;
    spotifyList(url).then((l) => { if (!alive) return; setList(l); if (!l) setErr(tt("Bu listenin şarkıları okunamadı (gizli bir liste olabilir)")); })
      .catch((e) => { if (alive) { setList(null); setErr(String(e)); } });
    return () => { alive = false; };
  }, [url]);
  if (list === undefined) return <div className="muted small pulse">{tt("Listedeki şarkılar okunuyor…")}</div>;
  if (!list) return <div className="plugin-msg small err">{err}</div>;
  return <div className="sp-in-chat"><SpotifyImport list={list} onDone={(id) => onDone(list.name, id)} /></div>;
}

function SpotifyImport({ list, onDone }: { list: SpList; onDone: (id: string) => void }) {
  const [rows, setRowsState] = useState<ShiftRow[]>(() => list.tracks.map((sp) => ({ sp, on: true })));
  const rowsRef = useRef(rows);
  const setRows = (f: (r: ShiftRow[]) => ShiftRow[]) => setRowsState((r) => (rowsRef.current = f(r)));
  const upd = (i: number, p: Partial<ShiftRow>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const [moreLeft, setMoreLeft] = useState(list.more?.length ?? 0);
  useEffect(() => {
    let alive = true, next = 0, reading = !!list.more?.length;
    const worker = async () => {
      while (alive) {
        if (next < rowsRef.current.length) {
          const i = next++;
          const sp = rowsRef.current[i].sp;
          const hits = await shiftSearch(sp, 3);
          if (alive) upd(i, { hit: hits.length ? bestHit(hits, sp.duration) : null, on: hits.length > 0 });
        } else if (reading) await new Promise((r) => setTimeout(r, 300));
        else break;
      }
    };
    // the songs after the first 100: read in small batches, added in the list's order
    const readMore = async () => {
      const ids = list.more ?? [];
      for (let k = 0; alive && k < ids.length; k += 6) {
        const got = await Promise.all(ids.slice(k, k + 6).map(spotifyTrack));
        if (!alive) return;
        setRows((r) => [...r, ...got.filter(Boolean).map((sp) => ({ sp: sp!, on: true }))]);
        setMoreLeft(Math.max(0, ids.length - k - 6));
      }
      reading = false;
    };
    if (reading) readMore();
    for (let k = 0; k < 8; k++) worker();
    return () => { alive = false; };
  }, []);
  const notThis = async (i: number) => {
    if (rows[i].open) { upd(i, { open: false }); return; }
    upd(i, { open: true, alts: undefined });
    const hits = await shiftSearch(rows[i].sp, 8);
    upd(i, { alts: hits });
  };
  const searched = rows.filter((r) => r.hit !== undefined).length;
  const searching = moreLeft > 0 || searched < rows.length;
  const found = rows.filter((r) => r.hit).length;
  const cut = list.total && list.total > rows.length && !moreLeft ? list.total : 0;
  const chosen = rows.filter((r) => r.on && r.hit);
  const allOn = rows.every((r) => r.on || !r.hit);
  const listRef = useRef<HTMLDivElement>(null);
  const missing = rows.map((r, i) => (r.hit === null ? i : -1)).filter((i) => i >= 0);
  const goMissing = () => {
    const cur = rows.findIndex((r) => r.open);
    const i = missing.find((x) => x > cur) ?? missing[0];
    if (i == null) return;
    if (cur >= 0 && cur !== i) upd(cur, { open: false });
    if (!rows[i].open) notThis(i);
    setTimeout(() => listRef.current?.querySelector(`[data-i="${i}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 30);
  };
  const save = () => {
    const id = Date.now().toString(36);
    const items: QItem[] = chosen.map((r) => ({ src: r.hit!.url, page: r.sp.page, title: r.sp.title, artist: r.sp.artist, album: r.sp.album,
      cover: r.sp.album ? list.cover : r.hit!.thumb ?? list.cover, duration: r.sp.duration ?? r.hit!.duration, yt: true }));
    saveMusicPlaylists([{ id, name: list.name, from: "Spotify", url: list.url, cover: list.cover, at: Date.now(), items }, ...loadMusicPlaylists()]);
    onDone(id);
  };
  return (
    <>
      <div className="mu-sp-head">
        {list.cover ? <img src={list.cover} alt="" /> : null}
        <span className="mu-song-t"><b className="ellipsis">{list.name}</b>
          <span className="muted small">{list.by ? list.by + " · " : ""}{searching
            ? <span className="pulse">{tt("YouTube'da aranıyor… {0} şarkı bulundu", found)}{moreLeft ? " · " + tt("listenin devamı okunuyor") : ""}</span>
            : <>{tt("{0} şarkı eşleşti", found)}{rows.length - found ? " · " + tt("{0} bulunamadı", rows.length - found) : ""}</>}</span></span>
        <label className="sp-all"><input type="checkbox" checked={allOn} onChange={() => setRows((r) => r.map((x) => ({ ...x, on: !allOn && !!x.hit })))} /> {tt("Hepsi")}</label>
      </div>
      {cut && !searching ? <div className="plugin-msg small">{tt("Bu listede {0} şarkı var, ama Spotify'dan sadece {1} tanesi okunabildi. Liste bu {1} şarkıyla oluşur.", cut, rows.length)}</div> : null}
      <div className="sp-list" ref={listRef}>
        {rows.map((r, i) => (
          <div key={i} data-i={i} className={"sp-item" + (r.on ? "" : " off") + (r.hit === null ? " missing" : "")}>
            <div className="sp-row">
              <input type="checkbox" checked={r.on} disabled={!r.hit} onChange={() => upd(i, { on: !r.on })} aria-label={r.sp.title} />
              <span className="mu-song-t"><b className="ellipsis">{r.sp.title}</b><span className="muted small ellipsis">{r.sp.artist}{r.sp.duration ? " · " + fmtTime(r.sp.duration) : ""}</span></span>
              <span className="sp-arrow muted">→</span>
              <span className="sp-yt">
                {r.hit === undefined ? <span className="muted small pulse">{tt("Aranıyor…")}</span>
                  : r.hit === null ? <span className="muted small">{tt("Bulunamadı")}</span>
                  : <>{r.hit.thumb ? <img src={r.hit.thumb} alt="" /> : <span className="mu-yt-ph" />}
                    <span className="mu-song-t"><b className="ellipsis">{r.hit.title}</b><span className="muted small ellipsis">{r.hit.channel}{r.hit.duration ? " · " + fmtTime(r.hit.duration) : ""}</span></span></>}
              </span>
              <button className="chip sm" disabled={r.hit === undefined} onClick={() => notThis(i)}>{r.open ? tt("Vazgeç") : r.hit ? tt("Bu değil") : tt("Ara")}</button>
            </div>
            {r.open && (
              <div className="sp-alts">
                {r.alts === undefined ? <span className="muted small pulse">{tt("“{0}” YouTube'da aranıyor…", r.sp.title)}</span>
                  : !r.alts?.length ? <span className="muted small">{tt("Sonuç yok")}</span>
                  : r.alts.map((h) => (
                    <button key={h.url} className={"mu-yt-hit" + (h.url === r.hit?.url ? " on" : "")} onClick={() => upd(i, { hit: h, open: false, on: true })}>
                      {h.thumb ? <img src={h.thumb} alt="" /> : <span className="mu-yt-ph" />}
                      <span className="mu-song-t"><b className="ellipsis">{h.title}</b><span className="muted small ellipsis">{h.channel}{h.duration ? " · " + fmtTime(h.duration) : ""}</span></span>
                    </button>
                  ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="muted small">{tt("Hiçbir şey indirilmez: liste YouTube linklerinden oluşur, şarkılar oradan çalınır (yt-dlp ile). Ne dinlediğin senin sorumluluğunda.")}</div>
      <div className="modal-actions">
        {!searching && missing.length > 0 && <button className="chip" onClick={goMissing}>{tt("Bulunamayan şarkıya git ({0})", missing.length)}</button>}
        <button className="primary" disabled={searching || !chosen.length} onClick={save}>
          {searching ? tt("Aranıyor…") : tt("Devam · {0} şarkıyla “{1}” listesini oluştur", chosen.length, list.name)}</button>
      </div>
    </>
  );
}

export function MusicLinkDialog({ onClose }: { onClose: () => void }) {
  const [v, setV] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [choices, setChoices] = useState<{ q: string; hits: YtHit[] } | null>(null);
  const [list, setList] = useState<SpList | null>(null);
  const go = async () => {
    const t = v.trim();
    if (!t) return;
    setErr(""); setChoices(null); setList(null);
    try {
      if (/open\.spotify\.com\/(intl-[a-z-]+\/)?(playlist|album)\//i.test(t)) {
        setBusy(tt("Listedeki şarkılar okunuyor…"));
        const l = await spotifyList(/^https?:/.test(t) ? t : "https://" + t);
        if (!l) throw new Error(tt("Bu listenin şarkıları okunamadı (gizli bir liste olabilir)"));
        setList(l);
        return;
      }
      if (isYouTube(t)) {
        setBusy(tt("Bağlantı okunuyor…"));
        const l = await invoke<YtHit[]>("yt_info", { url: /^https?:/.test(t) ? t : "https://" + t });
        if (!l.length) throw new Error(tt("Bu bağlantıda çalınacak bir şey yok"));
        playQueue(l.map(ytItem)); onClose(); return;
      }
      if (AUDIO_URL.test(t)) { playQueue([{ src: t, title: decodeURIComponent(t.split("/").pop()!.split("?")[0]) }]); onClose(); return; }
      let q = t;
      if (/^https?:\/\//i.test(t)) {
        setBusy(tt("Şarkı bilgisi okunuyor…"));
        const found = await pageQuery(t).catch(() => null);
        if (!found) {
          // a radio stream or another direct address: just play it
          playQueue([{ src: t, title: t.replace(/^https?:\/\//, ""), radio: true }]); onClose(); return;
        }
        q = found;
      }
      setBusy(tt("YouTube'da aranıyor…"));
      const hits = await invoke<YtHit[]>("yt_search", { query: q, n: 6 });
      if (!hits.length) throw new Error(tt("YouTube'da bulunamadı: {0}", q));
      setChoices({ q, hits });
    } catch (e) { setErr(String(e).replace(/^Error: /, "")); } finally { setBusy(""); }
  };
  return createPortal(
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={"modal wide mu-link" + (list ? " shifting" : "")}>
        <h2>{tt("Müzik bağlantısı")}</h2>
        <div className="muted small">{tt("YouTube linki, Spotify / Apple Music şarkı ya da albüm linki, bir yayın adresi ya da sadece şarkının adı.")}</div>
        <form className="addon-add" onSubmit={(e) => { e.preventDefault(); go(); }}>
          <input autoFocus value={v} onChange={(e) => setV(e.target.value)} placeholder={tt("https://… ya da şarkı adı")} />
          <button className="primary sm" disabled={!v.trim() || !!busy}>{tt("Aç")}</button>
        </form>
        {busy && <div className="muted small pulse">{busy}</div>}
        {err && <div className="plugin-msg small err">{err}</div>}
        {list && <SpotifyImport key={list.name + list.tracks.length} list={list} onDone={(id) => { onClose(); openPlaylist?.(id); }} />}
        {choices && (
          <>
            <div className="mu-ask">{tt("Bu mu? “{0}” için YouTube'da bulunanlar:", choices.q)}</div>
            <div className="mu-yt">
              {choices.hits.map((h) => (
                <button key={h.url} className="mu-yt-hit" onClick={() => { playQueue([ytItem(h)]); onClose(); }}>
                  {h.thumb ? <img src={h.thumb} alt="" /> : <span className="mu-yt-ph" />}
                  <span className="mu-song-t"><b className="ellipsis">{h.title}</b><span className="muted small ellipsis">{h.channel}{h.duration ? " · " + fmtTime(h.duration) : ""}</span></span>
                </button>
              ))}
            </div>
            <div className="muted small">{tt("Ses YouTube'dan çalınır (yt-dlp ile). Ne dinlediğin senin sorumluluğunda.")}</div>
          </>
        )}
        {!list && <div className="modal-actions"><button className="chip" onClick={onClose}>{tt("Kapat")}</button></div>}
      </div>
    </div>,
    document.body,
  );
}

// ---------- lyrics (LRCLIB, free and open) ----------
type Line = { t: number; text: string };
const lyricsMem = new Map<string, { synced: Line[]; plain: string } | null>();
async function lyricsFor(q: QItem): Promise<{ synced: Line[]; plain: string } | null> {
  const k = `${q.artist}|${q.title}`;
  if (lyricsMem.has(k)) return lyricsMem.get(k)!;
  const p = new URLSearchParams({ track_name: q.title, artist_name: q.artist ?? "" });
  if (q.album) p.set("album_name", q.album);
  if (q.duration) p.set("duration", String(Math.round(q.duration)));
  let r: any = await getJson("https://lrclib.net/api/get?" + p).catch(() => null);
  if (!r?.syncedLyrics && !r?.plainLyrics) {
    const l: any[] = await getJson("https://lrclib.net/api/search?" + new URLSearchParams({ track_name: q.title, artist_name: q.artist ?? "" })).catch(() => []);
    r = l?.find((x) => x.syncedLyrics) ?? l?.[0];
  }
  const synced: Line[] = [];
  for (const line of String(r?.syncedLyrics ?? "").split(/\r?\n/)) {
    const m = line.match(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/);
    if (m) synced.push({ t: +m[1] * 60 + +m[2], text: m[3].trim() });
  }
  const out = synced.length || r?.plainLyrics ? { synced, plain: String(r?.plainLyrics ?? "") } : null;
  lyricsMem.set(k, out);
  return out;
}

// ---------- mini player (bottom of every page while music plays) ----------
type MP = Pick<MpvState, "time" | "duration" | "paused" | "eof" | "title" | "volume" | "path">;
export function MusicDock({ mp }: { mp: MP }) {
  const m = useMusic();
  const c = m.now;
  // the end of a song: the next one (or the same, on repeat one)
  useEffect(() => { if (P.paused !== mp.paused) { P.paused = mp.paused; changed(); } }, [mp.paused]);
  const endedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!c || c.radio) return;
    if (mp.eof && mp.path === c.src && endedFor.current !== c.src + m.index) { endedFor.current = c.src + m.index; nextTrack(true); }
    if (!mp.eof) endedFor.current = null;
  }, [mp.eof, mp.path]);
  useEffect(() => {
    if (!c?.podcast || mp.path !== c.src || !mp.duration) return;
    const t = Math.floor(mp.time / 5) * 5;
    if (t > 0) store.set("podPos:" + c.src, String(mp.duration - mp.time < 60 ? -1 : t)); // -1: listened to the end
  }, [Math.floor(mp.time / 5), c?.src]);
  // keys while music plays: Space = pause, Ctrl+→/← = next/previous
  useEffect(() => {
    if (!c) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable) return;
      if (e.key === " ") { e.preventDefault(); mpv("cycle", "pause"); }
      else if (e.ctrlKey && e.key === "ArrowRight") { e.preventDefault(); nextTrack(); }
      else if (e.ctrlKey && e.key === "ArrowLeft") { e.preventDefault(); prevTrack(mp.time); }
      else if (e.key === "Escape" && m.view) setView(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [c?.src, mp.time, m.view]);
  if (!c) return null;
  // radio: the station sends what's on air as the stream title
  const onAir = c.radio && mp.title && mp.title !== c.src && !/^https?:/.test(mp.title) ? mp.title : null;
  return (
    <>
      <div className="mu-dock">
        <button className="mu-dock-now" onClick={() => setView(true)} title={tt("Şimdi çalıyor")}>
          <Cover src={c.radio ? c.favicon : c.cover} name={c.album ?? c.title} size={48} radius={8} icon={c.radio ? RADIO_ICON : NOTE} />
          <span className="mu-dock-txt"><b className="ellipsis">{onAir ?? c.title}</b><span className="muted small ellipsis">{c.radio ? (onAir ? c.title : c.artist) : [c.artist, c.album].filter(Boolean).join(" · ")}</span></span>
        </button>
        <div className="mu-dock-mid">
          <div className="mu-ctl">
            {!c.radio && <button className={"mu-ib" + (m.shuffle ? " on" : "")} aria-label={tt("Karışık")} title={tt("Karışık")}
              onClick={() => { if (!m.shuffle) playQueue(m.queue.slice(m.index), 0, true); else {
            P.shuffle = false;
            if (P.original.length) {
              const cur = P.queue[P.index];
              const i = P.original.findIndex((x) => x.src === cur?.src);
              P.queue = [...P.original];
              P.index = i >= 0 ? i : 0;
              P.original = [];
            }
            changed();
          } }}><Icon d={SHUFFLE} size={16} /></button>}
            {!c.radio && <button className="mu-ib" aria-label={tt("Önceki")} onClick={() => prevTrack(mp.time)}><Icon d={PREV} fill size={18} /></button>}
            <button className="mu-play" aria-label={mp.paused ? tt("Oynat") : tt("Duraklat")} onClick={() => mpv("cycle", "pause")}>
              <Icon d={mp.paused ? I.play : I.pause} fill size={18} /></button>
            {!c.radio && <button className="mu-ib" aria-label={tt("Sonraki")} onClick={() => nextTrack()}><Icon d={NEXT} fill size={18} /></button>}
            {!c.radio && <button className={"mu-ib" + (m.repeat !== "off" ? " on" : "")} aria-label={tt("Tekrarla")}
              title={m.repeat === "one" ? tt("Bu şarkıyı tekrarla") : m.repeat === "all" ? tt("Listeyi tekrarla") : tt("Tekrar kapalı")}
              onClick={() => setRepeat(m.repeat === "off" ? "all" : m.repeat === "all" ? "one" : "off")}>
              <Icon d={REPEAT} size={16} />{m.repeat === "one" && <span className="mu-one">1</span>}</button>}
            {c.radio && <span className="mu-live">{tt("CANLI")}</span>}
          </div>
          {!c.radio && <Seek mp={mp} />}
        </div>
        <div className="mu-dock-right">
          {!c.radio && <button className={"mu-ib" + (m.view ? " on" : "")} aria-label={tt("Sözler")} title={tt("Sözler")} onClick={() => setView(!m.view)}><Icon d={LYRICS} size={17} /></button>}
          <Icon d={I.vol} size={16} />
          <input className="vol mu-vol" type="range" min={0} max={100} value={Math.min(100, mp.volume)} aria-label={tt("Ses düzeyi")}
            onChange={(e) => setProp("volume", Number(e.target.value))} />
          <button className="mu-ib" aria-label={tt("Kapat")} title={tt("Müziği kapat")} onClick={() => { mpv("stop"); stopMusic(); }}><Icon d={I.x} size={16} /></button>
        </div>
      </div>
      {m.view && <NowPlaying mp={mp} onAir={onAir} />}
    </>
  );
}

function Seek({ mp, big }: { mp: MP; big?: boolean }) {
  const f = mp.duration ? Math.min(1, mp.time / mp.duration) : 0;
  const go = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.type === "pointerdown" ? e.button !== 0 : e.buttons !== 1) return;
    const r = e.currentTarget.getBoundingClientRect();
    mpv("seek", Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * 100, "absolute-percent");
  };
  return (
    <div className={"mu-seek" + (big ? " big" : "")}>
      <span>{fmtTime(mp.time)}</span>
      <div className="mu-bar" onPointerDown={go} onPointerMove={go}><div style={{ width: f * 100 + "%" }} /></div>
      <span>{fmtTime(mp.duration)}</span>
    </div>
  );
}

function NowPlaying({ mp, onAir }: { mp: MP; onAir: string | null }) {
  const m = useMusic();
  const c = m.now!;
  const [tab, setTab] = useState<"lyrics" | "queue">("lyrics");
  const [ly, setLy] = useState<{ synced: Line[]; plain: string } | null | undefined>(undefined);
  useEffect(() => {
    if (c.radio || c.book || c.podcast) { setLy(null); return; }
    let alive = true;
    setLy(undefined);
    lyricsFor(c).then((x) => alive && setLy(x)).catch(() => alive && setLy(null));
    return () => { alive = false; };
  }, [c.src]);
  const cur = ly?.synced.length ? ly.synced.reduce((n, l, i) => (l.t <= mp.time + 0.25 ? i : n), -1) : -1;
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current?.querySelector(".ly.on") as HTMLElement | null;
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [cur]);
  const coverUrl = c.cover ? (/^https?:/.test(c.cover) ? c.cover : convertFileSrc(c.cover)) : c.favicon;
  return createPortal(
    <div className="mu-np" style={{ ["--np-hue" as string]: String(hue(c.album ?? c.title)) }}>
      {coverUrl && <div className="mu-np-bg" style={{ backgroundImage: `url("${coverUrl}")` }} />}
      <div className="mu-np-top">
        <button className="round" aria-label={tt("Geri")} onClick={() => setView(false)}><Icon d={I.left} size={20} /></button>
        <span className="muted small">{c.radio ? tt("Canlı radyo") : c.podcast ? tt("Podcast · {0}", c.album ?? "") : c.book ? tt("Sesli kitap · {0}", c.album ?? "") : c.album ? tt("Albümden çalıyor · {0}", c.album) : ""}</span>
        <span className="grow" />
        {!c.radio && (
          <div className="seg-row">
            <button className={"seg sm" + (tab === "lyrics" ? " on" : "")} onClick={() => setTab("lyrics")}>{tt("Sözler")}</button>
            <button className={"seg sm" + (tab === "queue" ? " on" : "")} onClick={() => setTab("queue")}>{tt("Sıradakiler")}</button>
          </div>
        )}
        <button className="round" aria-label={tt("Asistana sor")} title={tt("Asistana sor")} onClick={openAssistant}>
          <Icon d={I.chat} size={19} />
        </button>
      </div>
      <div className="mu-np-body">
        <div className="mu-np-left">
          <Cover src={c.radio ? c.favicon : c.cover} name={c.album ?? c.title} size="min(400px, 38vh)" radius={20} icon={c.radio ? RADIO_ICON : NOTE} />
          <div>
            <h1>{onAir ?? c.title}</h1>
            <div className="muted">{c.radio ? c.title : [c.artist, c.album].filter(Boolean).join(" · ")}</div>
          </div>
        </div>
        <div className="mu-np-right" ref={box}>
          {c.radio ? <div className="muted">{tt("Canlı yayında şarkı sözü gösterilmiyor.")}</div>
            : c.book && tab === "lyrics" ? <div className="muted">{tt("Sesli kitap: bölümler “Sıradakiler” sekmesinde.")}</div>
            : c.podcast && tab === "lyrics" ? <div className="muted">{tt("Podcast: sıradaki bölümler “Sıradakiler” sekmesinde.")}</div>
            : tab === "queue" ? (
              <div className="mu-queue">
                {m.queue.map((q, i) => (
                  <button key={i + q.src} className={"mu-song" + (i === m.index ? " on" : "")} onClick={() => { P.index = i; loadCurrent(); }}>
                    <span className="mu-n">{i === m.index ? <Icon d={NOTE} size={14} /> : i + 1}</span>
                    <span className="mu-song-t"><b className="ellipsis">{q.title}</b><span className="muted small ellipsis">{q.artist}</span></span>
                    <span className="muted small">{q.duration ? fmtTime(q.duration) : ""}</span>
                  </button>
                ))}
              </div>
            )
            : ly === undefined ? <div className="muted pulse">{tt("Sözler aranıyor…")}</div>
            : !ly ? <div className="muted">{tt("Bu şarkının sözleri bulunamadı.")}</div>
            : ly.synced.length ? (
              <div className="lyrics">
                {ly.synced.map((l, i) => (
                  <button key={i} className={"ly" + (i === cur ? " on" : i < cur ? " past" : "")} onClick={() => mpv("seek", l.t, "absolute")}>{l.text || "♪"}</button>
                ))}
              </div>
            )
            : <div className="lyrics plain">{ly.plain}</div>}
          {!c.radio && tab === "lyrics" && ly && <div className="muted small mu-credit">{tt("Sözler: LRCLIB · satıra tıkla, oraya atla")}</div>}
        </div>
      </div>
      <div className="mu-np-ctl">
        {!c.radio && <Seek mp={mp} big />}
        <div className="mu-ctl big">
          {!c.radio && <button className="mu-ib" aria-label={tt("Önceki")} onClick={() => prevTrack(mp.time)}><Icon d={PREV} fill size={22} /></button>}
          <button className="mu-play big" aria-label={mp.paused ? tt("Oynat") : tt("Duraklat")} onClick={() => mpv("cycle", "pause")}><Icon d={mp.paused ? I.play : I.pause} fill size={24} /></button>
          {!c.radio && <button className="mu-ib" aria-label={tt("Sonraki")} onClick={() => nextTrack()}><Icon d={NEXT} fill size={22} /></button>}
        </div>
      </div>
    </div>,
    document.querySelector(".root") ?? document.body,
  );
}
