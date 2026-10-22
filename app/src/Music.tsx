import {logDebug} from "./debugTelemetry";
import {MusicPlaylistTools,PlaylistUtilities,SaveQueuePlaylist} from "./MusicPlaylistTools";
import {validPlaylist,playlistCollection,uniquePlaylistName,reorderPlaylist,audioResume,storedAudioPosition} from "./musicWorkspaceModel";
import {extraText,ExtraModal} from "./Extras";
import {editMusicQueue,searchQueue} from "./queueEditModel";
import type {QueueEdit} from "./queueEditModel";
import "./QueueTools.css";
// Müzik modu: the user's own music folders (albums, artists, songs), live radio, a mini player
// and a "now playing" screen with synced lyrics. Playback goes through the same mpv as video,
// with the picture track off.
import { lang, tt } from "./i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { open } from "@tauri-apps/plugin-dialog";
import { fmtTime, mpv, MpvState, setProp } from "./mpv";
import { BarMarks, MusicSoundButton } from "./PlaybackExtras";
import { PodcastExtras } from "./PodcastExtras";
import { store } from "./library";
import { I, Icon, MenuEntry, openMenu } from "./Screens";
import { ReasonPicker, TastePanel } from "./TastePanel";
import { TasteProfile } from "./TasteProfile";
import { filmKey } from "./filmReviewModel";
import { askAssistant, openAssistant } from "./Taste";
import { collectEntry } from "./Mine";
import { matchesSearch, playingRowIndex, restoreIndex, searchFold, seekKeyDelta } from "./musicModel";
import "./BookMusic.css";

// ---------- library ----------
export type Track = {
  path: string; title: string; artist: string; album: string; albumArtist: string;
  track?: number; disc?: number; year?: number; genre?: string; duration: number; cover?: string | null;
  /** not a file: a song from a Luna list or one played from a link (YouTube through yt-dlp) */
  online?: boolean; yt?: boolean; page?: string;
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
  const [scanError, setScanError] = useState(false);
  const [tick, setTick] = useState(0);
  // the folder watcher found new or removed music files
  useEffect(() => {
    const f = (e: Event) => { if (((e as CustomEvent).detail?.kinds ?? ["music"]).includes("music")) { libCache = null; setTick((n) => n + 1); } };
    window.addEventListener("luna-rescan", f);
    return () => window.removeEventListener("luna-rescan", f);
  }, []);
  const sig = folders.join("|");
  useEffect(()=>{const update=()=>{libCache=null;setFoldersState(loadMusicFolders());setTick(n=>n+1);};window.addEventListener("luna-library",update);return()=>window.removeEventListener("luna-library",update);},[]);
  useEffect(() => {
    const f = () => setTracks(libCache?.tracks ?? null);
    libSubs.add(f);
    return () => { libSubs.delete(f); };
  }, []);
  useEffect(() => {
    // (a scan cancelled by these early returns never reaches its own finally: "scanning" is switched off here,
    // or "Taranıyor…" stayed on and the add-folder button stayed disabled)
    if (!folders.length) { libCache = { sig, tracks: [] }; setTracks([]); setScanning(false); setScanError(false); return; }
    if (libCache?.sig === sig && tick === 0) { setTracks(libCache.tracks); setScanning(false); setScanError(false); return; }
    let alive = true;
    setScanning(true);
    setScanError(false);
    invoke<Track[]>("music_scan", { folders })
      // a scan for folders that changed meanwhile is dropped, not written over the newer one
      .then((t) => {
        if (sig !== loadMusicFolders().join("|")) return;
        libCache = { sig, tracks: t };
        if (alive) setTracks(t);
        libSubs.forEach((f) => f());
      })
      // a failed scan (a drive that is unplugged) is told, with a way to try again; it is not kept as an empty library
      .catch(() => { if (alive) { setTracks([]); setScanError(true); } })
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
  return { folders, setFolders, tracks, albums, scanning, scanError, rescan: () => setTick((n) => n + 1) };
}

/** Songs deleted from disk leave the library and the playlists at once (no rescan). */
export function forgetTracks(paths: string[]) {
  const gone = new Set(paths);
  if (libCache) libCache = { ...libCache, tracks: libCache.tracks.filter((t) => !gone.has(t.path)) };
  libSubs.forEach((f) => f());
  const lists = loadMusicPlaylists();
  if (lists.some((p) => p.items.some((t) => gone.has(t.src)))) saveMusicPlaylists(lists.map((p) => ({ ...p, items: p.items.filter((t) => !gone.has(t.src)) })));
  // and from the home page's "most played" and "where you left off"
  const plays = loadPlays();
  if (Object.keys(plays).some((k) => gone.has(k))) store.set("musicPlays", JSON.stringify(Object.fromEntries(Object.entries(plays).filter(([k]) => !gone.has(k)))));
  if (gone.has(store.json<QItem | null>("musicLast", null)?.src ?? "")) { try { localStorage.removeItem("musicLast"); } catch {} }
}

/** The music library for the assistant (scanned once; the index keeps it quick). */
export async function loadMusicLibrary(): Promise<Track[]> {
  const f = loadMusicFolders();
  if (libCache?.sig === f.join("|")) return libCache.tracks;
  // a failed scan isn't kept as an empty library: the next ask scans again
  let ok = true;
  const tracks = f.length ? await invoke<Track[]>("music_scan", { folders: f }).catch(() => { ok = false; return [] as Track[]; }) : [];
  if (ok) libCache = { sig: f.join("|"), tracks };
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
  book?: string; chapter?:number;
  /** a podcast episode (its show's feed): where you stopped is remembered */
  podcast?: string; start?: number;
  /** a podcast episode's own description (shown in place of lyrics) and when it came out */
  about?: string; date?: number;
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
  repeat: (["off","all","one"].includes(store.get("musicRepeat")||"")?store.get("musicRepeat"):"off") as Repeat,
  view: false, // the "now playing" screen
  paused: false, // mpv's pause, reported by the dock
  from: "", // the playlist the queue was started from ("" for anything else)
  loading: false, // a song was asked for and its sound hasn't started yet (found on the web first)
  volume: 100, // mpv's volume, reported by the dock (the reader's music popup has its own slider)
};
const subs = new Set<() => void>();
let debugQueueSignature="";
const changed = () => {const signature=JSON.stringify([P.queue.length,P.index,P.paused,P.repeat,P.shuffle]);if(signature!==debugQueueSignature){debugQueueSignature=signature;logDebug("player","Music queue",{count:P.queue.length,index:P.index,paused:P.paused,repeat:P.repeat,shuffle:P.shuffle});}subs.forEach((f) => f());};
let loadGeneration = 0;
let wantsPlayback = true;
export const beginMusicSelection=()=>++loadGeneration;
export const isMusicSelectionCurrent=(generation:number)=>generation===loadGeneration;
export function pauseMusic(paused: boolean) {
  wantsPlayback = !paused;
  P.paused = paused;
  setProp("pause", paused);
  changed();
}
export function toggleMusicPause() { pauseMusic(!P.paused); }

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
/** A song (or episode, or radio) is playing now, not paused. */
export const musicPlaying = () => P.index >= 0 && !P.paused;

type Plays = Record<string, { n: number; at: number; q: QItem }>;
const loadPlays = () => store.json<Plays>("musicPlays", {});
function countPlay(c: QItem) {
  const plays = loadPlays();
  plays[c.src] = { n: (plays[c.src]?.n ?? 0) + 1, at: Date.now(), q: { ...c, start: undefined } };
  // the 300 most played are kept
  const keep = Object.entries(plays).sort((a, b) => b[1].n - a[1].n || b[1].at - a[1].at).slice(0, 300);
  store.set("musicPlays", JSON.stringify(Object.fromEntries(keep)));
}
// ---------- likes ("Beğendiklerim", like Spotify's Liked Songs) and the listening history ----------
type Liked = { q: QItem; at: number };
export const loadLikes = () => store.json<Liked[]>("musicLikes", []);
export const isLiked = (src?: string) => !!src && loadLikes().some((x) => x.q.src === src);
/** Likes or un-likes; true when it is liked now. */
export function toggleLike(q: QItem): boolean {
  const l = loadLikes();
  const on = l.some((x) => x.q.src === q.src);
  store.set("musicLikes", JSON.stringify(on ? l.filter((x) => x.q.src !== q.src) : [{ q: { ...q, start: undefined }, at: Date.now() }, ...l]));
  if (!on) store.set("musicDislikes", JSON.stringify(loadDislikes().filter((x) => x.q.src !== q.src)));
  changed();
  return !on;
}
/** The user's points for songs (1-10, like films): asked right after a like or dislike. */
export const songRatings = () => store.json<Record<string, number>>("musicRatings", {});
export const songRating = (src?: string) => (src ? songRatings()[src] : undefined);
export function setSongRating(q: QItem, n: number | null) {
  const r = songRatings();
  if (n == null) delete r[q.src]; else r[q.src] = n;
  store.set("musicRatings", JSON.stringify(r));
  // a low score on a liked song (or a high one on a disliked song) turns the vote round, as for films
  if (n != null && n <= 4 && isLiked(q.src)) toggleDislike(q);
  else if (n != null && n >= 7 && isDisliked(q.src)) toggleLike(q);
  changed();
}
let rateAsk: { q: QItem; x: number; y: number } | null = null;
const rateSubs = new Set<() => void>();
/** Opens "out of 10?" beside the button that was pressed. */
export function askSongRating(q: QItem, el: Element) {
  const r = el.getBoundingClientRect();
  rateAsk = { q, x: r.left + r.width / 2, y: r.bottom };
  rateSubs.forEach((f) => f());
}
/** Mounted once (in the app): the small 1-10 picker. */
export function SongRatePop() {
  const [, bump] = useState(0);
  useEffect(() => { const f = () => bump((n) => n + 1); rateSubs.add(f); return () => { rateSubs.delete(f); }; }, []);
  const box = useRef<HTMLDivElement>(null);
  const close = () => { rateAsk = null; bump((n) => n + 1); };
  useEffect(() => {
    if (!rateAsk) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) close(); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    const t = setTimeout(() => document.addEventListener("mousedown", away), 0);
    window.addEventListener("keydown", esc, true);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", away); window.removeEventListener("keydown", esc, true); };
  });
  if (!rateAsk) return null;
  const { q, x, y } = rateAsk;
  const cur = songRating(q.src);
  const left = Math.max(12, Math.min(window.innerWidth - 332, x - 160));
  const top = y + 150 > window.innerHeight ? y - 130 : y + 8;
  return createPortal(
    <div className="song-rate" ref={box} style={{ left, top }} role="dialog" aria-label={tt("10 üzerinden kaç?")}>
      <b className="ellipsis">{q.title}</b>
      <span className="muted small">{isDisliked(q.src) ? tt("Beğenmedin · 10 üzerinden kaç?") : tt("Beğendin · 10 üzerinden kaç?")}</span>
      <div className="song-rate-n">{Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
        <button key={n} className={"seg sm" + (cur === n ? " on" : "")} onClick={() => { setSongRating(q, n); close(); }}>{n}</button>))}</div>
      <div className="song-rate-b">{cur != null && <button className="chip" onClick={() => { setSongRating(q, null); close(); }}>{tt("Puanı kaldır")}</button>}
        <button className="chip" onClick={close}>{tt("Şimdi değil")}</button></div>
    </div>,
    document.body,
  );
}
/** Songs the user said they don't like: the assistant keeps away from them and their kind. */
export const loadDislikes = () => store.json<Liked[]>("musicDislikes", []);
export const isDisliked = (src?: string) => !!src && loadDislikes().some((x) => x.q.src === src);
export function toggleDislike(q: QItem): boolean {
  const l = loadDislikes();
  const on = l.some((x) => x.q.src === q.src);
  store.set("musicDislikes", JSON.stringify(on ? l.filter((x) => x.q.src !== q.src) : [{ q: { ...q, start: undefined }, at: Date.now() }, ...l].slice(0, 500)));
  if (!on) store.set("musicLikes", JSON.stringify(loadLikes().filter((x) => x.q.src !== q.src)));
  changed();
  return !on;
}
type Heard = { q: QItem; at: number };
export const loadHistory = () => store.json<Heard[]>("musicHistory", []);
function addHistory(c: QItem) {
  const l = loadHistory();
  // the same song again within a few minutes (a restart, going back) is one listen
  if (l[0]?.q.src === c.src && Date.now() - l[0].at < 5 * 60e3) return;
  store.set("musicHistory", JSON.stringify([{ q: { ...c, start: undefined }, at: Date.now() }, ...l].slice(0, 500)));
}
/** The most played songs (from the library, playlists or links), most first. */
export const mostPlayed = (n = 12) => Object.values(loadPlays()).sort((a, b) => b.n - a.n || b.at - a.at).slice(0, n);

// ---------- quicker starts ----------
// mpv starts yt-dlp for a YouTube song when it is loaded, a few seconds of silence (more for a
// Spotify song, which is searched first). The next song's audio address is found while this one plays.
type Direct = { url: string; ua?: string | null; exp: number };
const direct = new Map<string, Direct>();
const resolving = new Map<string, Promise<void>>();
/** Songs Luna couldn't find itself this session: mpv tries them (not asked again in a loop). */
const findFailed = new Set<string>();
/** The song loaded from an address found ahead: if that address fails, it's loaded the usual way. */
let directFor: string | null = null;
function prefetch(c?: QItem, max = 99) {
  if (!c?.yt || !c.src || resolving.has(c.src) || (direct.get(c.src)?.exp ?? 0) > Date.now() || resolving.size >= max) return;
  const src = c.src;
  resolving.set(src, invoke<{ url: string; ua?: string | null }>("yt_stream", { url: src.replace(/^ytdl:\/\//, "") })
    .then((r) => {
      // YouTube's addresses carry when they stop working
      const exp = Number(new URL(r.url).searchParams.get("expire")) * 1000 || Date.now() + 3600e3;
      direct.set(src, { ...r, exp: exp - 10 * 60e3 });
    })
    .catch(() => {})
    .finally(() => resolving.delete(src)));
}
/** Resting the mouse on a song starts finding it, so a click plays at once (a few at a time). */
let hoverTimer: ReturnType<typeof setTimeout> | undefined;
export const hoverSong = (c?: QItem) => ({
  onMouseEnter: () => { clearTimeout(hoverTimer); hoverTimer = setTimeout(() => prefetch(c, 4), 120); },
  onMouseLeave: () => clearTimeout(hoverTimer),
});
const nextUp = () => P.queue[P.index + 1] ?? (P.repeat === "all" ? P.queue[0] : undefined);
/** A failed early address is retried quietly (no "couldn't open" warning). */
export const musicRetrying = () => directFor !== null;
/** Songs in a row that wouldn't open: a few (a drive unplugged) and Luna stops trying the rest. */
let failedInRow = 0;
/** A song that won't open (missing, broken) is skipped, like a scratched track; a station just stops. */
function skipFailed() {
  const c = P.queue[P.index];
  if (!c) return;
  const last = P.index + 1 >= P.queue.length && P.repeat !== "all";
  if (c.radio || last || ++failedInRow >= Math.min(3, P.queue.length)) { failedInRow = 0; setProp("pause", true); return; }
  const generation = loadGeneration;
  // a moment, so the "couldn't open" warning is seen before the next one starts
  setTimeout(() => {
    if (generation !== loadGeneration || !wantsPlayback || P.queue[P.index] !== c) return;
    P.index = (P.index + 1) % P.queue.length;
    loadCurrent();
  }, 1200);
}
listen<any>("mpv", ({ payload }) => {
  // it started: from here on an error is a real one
  if (payload.event === "playback-restart") { directFor = null; failedInRow = 0; }
  const failedToStart = payload.event === "end-file" && payload.reason === "error" && P.loading;
  if ((payload.event === "playback-restart" || (payload.event === "end-file" && payload.reason === "error")) && P.loading) { P.loading = false; changed(); }
  if (payload.event !== "end-file" || payload.reason !== "error") return;
  if (!directFor) { if (failedToStart) skipFailed(); return; }
  const failed = directFor;
  const generation = loadGeneration;
  direct.delete(failed);
  findFailed.add(failed); // try the original page once, never resolve the same broken direct URL forever
  // after the other listeners have seen musicRetrying()
  setTimeout(() => {
    if (generation !== loadGeneration) return;
    directFor = null;
    if (P.queue[P.index]?.src === failed) loadCurrent(true);
  });
});

/** Every address music was loaded from (also the found YouTube ones): such a path in mpv is music. */
const musicPaths = new Set<string>(store.json<string[]>("musicStreamPaths", []));
/** The address mpv really plays can differ from the item's (a podcast episode redirects to a CDN): remembered as music too. */
export function markMusicPath(p: string | null) {
  if (!p || musicPaths.has(p)) return;
  musicPaths.add(p);
  if (/^https?:/i.test(p)) store.set("musicStreamPaths", JSON.stringify([p, ...store.json<string[]>("musicStreamPaths", []).filter((x) => x !== p)].slice(0, 300)));
}
/** An address that is plainly sound (podcast episodes, radio): never a film. */
const audioLike = (p: string) => /^https?:\/\/[^?#]+\.(mp3|m4a|aac|ogg|oga|opus|wav|flac)([?#]|$)/i.test(p);
/** Music, never a film: also in the moment between two songs (or while a film takes over) when the queue is empty. */
export const isMusicPath = (p: string | null) => !!p && (musicPaths.has(p) || p.startsWith("ytdl://") || /^https?:\/\/[^/]*googlevideo\.com\//i.test(p) || audioLike(p));

function loadCurrent(preserveIntent = false) {
  const generation = ++loadGeneration;
  if (!preserveIntent) { wantsPlayback = true; P.paused = false; }
  const c = P.queue[P.index];
  if (!c) return;
  musicPaths.add(c.src);
  P.loading = true;
  // the audio only: no cover art as a "video", no window
  // a podcast episode carries on where it was left
  const resume = audioResume(c.podcast?store.get("podPos:"+c.src):c.book?store.get("audioPos:"+c.src):0,c.duration);
  const d = c.yt ? direct.get(c.src) : undefined;
  const ready = !!d && d.exp > Date.now();
  // A YouTube song is always found by Luna first (its audio-only address) and then given to mpv:
  // left to mpv, a search ("ytdl://ytsearch1:") became a new entry that lost the audio-only
  // settings and fetched the 1080p video too. Being found already (the mouse rested on it): wait for that.
  if (!ready && c.yt && !findFailed.has(c.src)) {
    if (P.queue[P.index] !== undefined) setProp("pause", true); // the song before doesn't play on meanwhile
    changed();
    prefetch(c);
    const finding = resolving.get(c.src);
    if (finding) {
      finding.then(() => {
        if (!direct.has(c.src)) findFailed.add(c.src);
        if (generation === loadGeneration && P.queue[P.index] === c) loadCurrent(true);
      });
      return;
    }
  }
  directFor = ready ? c.src : null;
  if (c.yt && !ready) {
    // Luna couldn't find it: mpv tries itself, still sound only (also for the entry a search becomes)
    setProp("ytdl-format", "bestaudio/best");
    setProp("vid", "no");
  }
  // (speed and file loop set for a film don't carry over to music: these hold for this file only)
  const opts = ["vid=no", "speed=1", "loop-file=no", `pause=${wantsPlayback ? "no" : "yes"}`, ...(c.yt && !ready ? ["ytdl-format=bestaudio/best"] : []),
    ...(ready && d!.ua ? [`user-agent=%${new TextEncoder().encode(d!.ua).length}%${d!.ua}`] : []),
    ...(resume > 0 ? [`start=+${resume}`] : [])];
  if (ready) musicPaths.add(d!.url);
  mpv("loadfile", ready ? d!.url : c.src, "replace", "-1", opts.join(","));
  // a few seconds in, so finding the next one doesn't slow this one's start
  setTimeout(() => { if (P.queue[P.index] === c) prefetch(nextUp()); }, 4000);
  setProp("pause", !wantsPlayback);
  if (c.book) store.set("abPos:" + c.book, String(Number.isInteger(c.chapter)&&c.chapter!>=0?c.chapter:P.index));
  if (!c.radio && !c.book) addHistory(c);
  if (c.book) { /* above */ }
  else if (c.podcast) {
    // episodes keep their own place (podPos); the show's last episode goes to "recently listened"
    store.set("podRecent", JSON.stringify([{ q: { ...c, start: undefined }, at: Date.now() },
      ...store.json<PodRecent[]>("podRecent", []).filter((r) => r.q.podcast !== c.podcast)].slice(0, 12)));
  }
  else if (!c.radio) {
    countPlay(c);
    store.set("musicLast", JSON.stringify(c));
    if (c.albumKey) store.set("musicRecentAlbums", JSON.stringify([c.albumKey, ...store.json<string[]>("musicRecentAlbums", []).filter((k) => k !== c.albumKey)].slice(0, 16)));
  } else {
    store.set("musicRecentRadio", JSON.stringify([c, ...store.json<QItem[]>("musicRecentRadio", []).filter((r) => r.src !== c.src)].slice(0, 12)));
  }
  changed();
}
export function playQueue(items: QItem[], start = 0, shuffle = false, from = "") {
  if (!items.length) return;
  P.from = from;
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
  P.index = Number.isFinite(start) ? Math.max(0, Math.min(Math.trunc(start), q.length - 1)) : 0;
  P.shuffle = shuffle;
  loadCurrent();
}
/** Shuffle on: the song playing keeps playing, the rest of the whole queue is mixed after it.
 *  Off: the order it was in comes back, at the same song. */
export function setShuffle(on: boolean) {
  if (on) {
    const cur = P.queue[P.index];
    if (!cur || P.shuffle) return;
    P.original = [...P.queue];
    const rest = P.queue.filter((_, i) => i !== P.index);
    for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
    P.queue = [cur, ...rest];
    P.index = 0;
    P.shuffle = true;
  } else {
    P.shuffle = false;
    if (P.original.length) {
      const cur = P.queue[P.index];
      // the very item (a song can be in the queue twice), not the first one with the same address
      const i = restoreIndex(P.original, cur);
      P.queue = [...P.original];
      P.index = i;
      P.original = [];
    }
  }
  changed();
}
export function updateMusicQueue(action:QueueEdit){
 const next=editMusicQueue(P.queue,P.index,action);if(next.queue===P.queue)return;
 P.queue=next.queue;P.index=next.index;
 // A manually edited order becomes the new queue; toggling shuffle must not resurrect removed items.
 P.original=[];P.shuffle=false;P.from="";changed();
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
/** Where the music was when a film took over: it comes back, paused, when the film is closed. */
let suspended: { queue: QItem[]; original: QItem[]; index: number; shuffle: boolean; from: string; time: number } | null = null;
/** The position of the song playing (kept by the dock), for coming back after a film. */
let musicTime = 0;
export function suspendMusic() {
  if (P.index < 0) return;
  const c = P.queue[P.index];
  // live radio has no place to come back to; it simply stops
  const snapshot = c?.radio ? null : { queue: P.queue, original: P.original, index: P.index, shuffle: P.shuffle, from: P.from, time: musicTime };
  stopMusic();
  suspended = snapshot;
}
/** After the film: the song is loaded again where it was, paused (no headset key starts it during the film). */
export function resumeSuspendedMusic() {
  const s = suspended;
  suspended = null;
  if (!s || P.index >= 0) return;
  Object.assign(P, { queue: s.queue, original: s.original, index: s.index, shuffle: s.shuffle, from: s.from });
  const c = P.queue[P.index];
  if (!c) return;
  musicPaths.add(c.src);
  const d = c.yt ? direct.get(c.src) : undefined;
  const ready = !!d && d.exp > Date.now();
  if (ready) musicPaths.add(d!.url);
  directFor = ready ? c.src : null;
  if (c.yt && !ready) { setProp("ytdl-format", "bestaudio/best"); setProp("vid", "no"); }
  const opts = ["vid=no", "speed=1", "loop-file=no", "pause=yes", ...(c.yt && !ready ? ["ytdl-format=bestaudio/best"] : []),
    ...(ready && d!.ua ? [`user-agent=%${new TextEncoder().encode(d!.ua).length}%${d!.ua}`] : []),
    ...(s.time > 3 && !c.radio ? [`start=${Math.floor(s.time)}`] : [])];
  mpv("loadfile", ready ? d!.url : c.src, "replace", "-1", opts.join(","));
  wantsPlayback = false;
  setProp("pause", true);
  P.paused = true;
  changed();
}
export function stopMusic() {
  suspended = null;
  loadGeneration++;
  wantsPlayback = false;
  if (P.index < 0) return;
  directFor = null;
  P.loading = false;
  P.queue = [];
  P.index = -1;
  P.view = false;
  changed();
}
const setRepeat = (r: Repeat) => { P.repeat = r; store.set("musicRepeat", r); changed(); };
const setView = (v: boolean) => { P.view = v; changed(); };
export const trackItem = (t: Track): QItem => t.online
  ? { src: t.path, title: t.title, artist: t.artist, album: t.album || undefined, cover: t.cover, duration: t.duration, yt: t.yt, page: t.page }
  : { src: t.path, title: t.title, artist: t.artist, album: t.album, albumKey: albumKey(t), cover: t.cover, duration: t.duration };
/** A YouTube channel name as an artist: "Duke Ellington - Topic", "AdeleVEVO" → "Duke Ellington", "Adele". */
const cleanArtist = (a: string) => a.replace(/\s*-\s*Topic$/i, "").replace(/\s*(VEVO|Official|Resmi)$/i, "").replace(/\s*\(official\)$/i, "").trim();
/** Songs that aren't files: those in Luna's lists and those played from links, so Albums / Artists /
 *  Songs work without a music folder too. */
function onlineTracks(): Track[] {
  const seen = new Set<string>();
  const out: Track[] = [];
  const add = (q: QItem) => {
    if (!q.src || seen.has(q.src) || q.radio || q.podcast || q.book || !/^(https?|ytdl):/i.test(q.src)) return;
    seen.add(q.src);
    const artist = cleanArtist((q.artist ?? "").split(",")[0]) || tt("Bilinmeyen sanatçı");
    out.push({ path: q.src, title: q.title, artist, album: q.album ?? "", albumArtist: artist, duration: q.duration ?? 0, cover: q.cover, online: true, yt: q.yt, page: q.page });
  };
  for (const p of loadMusicPlaylists()) p.items.forEach(add);
  for (const x of mostPlayed(300)) add(x.q);
  return out;
}

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
  useEffect(() => setBad(false), [src]); // a new picture gets its own chance
  const url = src && !bad ? (/^https?:/.test(src) ? src : convertFileSrc(src)) : null;
  return (
    <div className="mu-cover" style={{ width: size, height: size, borderRadius: radius, background: url ? undefined : `hsl(${hue(name)} 32% 24%)` }}>
      {url ? <img src={url} alt="" loading="lazy" onError={() => setBad(true)} /> : <Icon d={icon ?? NOTE} size={typeof size === "number" ? Math.max(16, size / 4) : 32} />}
    </div>
  );
}
const NOTE = "M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z";
const srcUrl = (src: string) => (/^https?:/.test(src) ? src : convertFileSrc(src));
/** A list's picture when it has none of its own: four of its songs' covers, else one of them under
 *  the list's name, else a colour made from the name (a plain grey square looked unfinished). */
function PlaylistArt({ p, size, radius = 12 }: { p: MPlaylist; size: number | string; radius?: number }) {
  if (p.cover) return <Cover src={p.cover} name={p.name} size={size} radius={radius} icon={NOTE} />;
  const covers = [...new Set(p.items.map((i) => i.cover).filter((c): c is string => !!c))].slice(0, 4);
  const h = hue(p.name);
  const big = typeof size === "number" ? size >= 120 : true;
  return (
    <div className="pl-art" style={{ width: size, height: size, borderRadius: radius, ["--h" as string]: String(h) }}>
      {covers.length >= 4 ? <div className="pl-art-grid">{covers.map((c) => <img key={c} src={srcUrl(c)} alt="" loading="lazy" />)}</div>
        : covers.length ? <img className="pl-art-one" src={srcUrl(covers[0])} alt="" loading="lazy" />
        : <div className="pl-art-fill" />}
      {covers.length < 4 && big && <span className="pl-art-name">{p.name}</span>}
      {!covers.length && !big && <Icon d={NOTE} size={16} />}
    </div>
  );
}
const RADIO_ICON = "M4 10h16v10H4zM8 10l9-6M8 15h.01M12 15h5";
const SHUFFLE = "M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5";
const REPEAT = "M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3";
const PREV = "M19 5L9 12l10 7zM5 5h2v14H5z";
const NEXT = "M5 5l10 7-10 7zM17 5h2v14h-2z";
const LYRICS = "M4 6h16M4 12h10M4 18h7M18 14v6M15 17h6";

// ---------- the music pages ----------
export type MusicView = "home" | "discover" | "library" | "taste" | "radio" | "podcast";
// ---------- playlists made in Luna (e.g. from a Spotify list), kept in order ----------
export type MPlaylist = { id: string; name: string; from?: string; url?: string; cover?: string | null; at: number; items: QItem[] };
const plSubs = new Set<() => void>();
export const loadMusicPlaylists = ():MPlaylist[] => {const raw=store.json<unknown>("musicPlaylists",[]);return Array.isArray(raw)?raw.filter(validPlaylist):[];};
/** Music links that once slipped into the film library are taken out again. */
export function purgeMusicFromFilms(): boolean {
  const music = new Set<string>();
  for (const k of Object.keys(store.json<Record<string, unknown>>("musicPlays", {}))) music.add(k);
  for (const p of loadMusicPlaylists()) for (const t of p.items) if (t.src) music.add(t.src);
  const last = store.json<QItem | null>("musicLast", null);
  if (last?.src) music.add(last.src);
  // stream URLs mpv reported instead of the item's own address are music too
  const linkLike = /^https?:\/\/([^/]*\.)?(youtube\.com|youtu\.be|googlevideo\.com|spotify\.com)\//i;
  for (const r of store.json<{ q?: { src?: string } }[]>("podRecent", [])) if (r.q?.src) music.add(r.q.src);
  const isMusicPath = (p: string) => p.startsWith("ytdl://") || music.has(p) || linkLike.test(p) || musicPaths.has(p) || audioLike(p);
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
export function saveMusicPlaylists(l: MPlaylist[]):boolean {
 try{playlistCollection(JSON.parse(store.get("musicPlaylists")||"[]"));playlistCollection(l);if(!store.set("musicPlaylists",JSON.stringify(l)))throw Error(extraText("Liste kaydedilemedi; önceki kayıt korundu.","Playlist could not be saved; the previous data was kept."));plSubs.forEach(f=>f());return true;}
 catch(e){window.dispatchEvent(new CustomEvent("luna-playlist-error",{detail:String(e)}));return false;}
}
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

/** Switches the music page (set while it is shown): a podcast link opens the podcast page. */
let goMusicPage: ((v: MusicView) => void) | null = null;
export function MusicPage({ view, setView: setPage, query }: { view: MusicView; setView: (v: MusicView) => void; query: string }) {
  const lib = useMusicLibrary();
  useEffect(() => { goMusicPage = setPage; return () => { goMusicPage = null; }; }, [setPage]);
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
      {view === "home" && <MusicHome lib={lib} onAlbum={setAlbum} onAddFolder={addFolder} goRadio={() => setPage("radio")}
        goShow={(sh) => { pendingShow = sh; setPage("podcast"); }} />}
      {view === "library" && <MusicLibrary lib={lib} query={query} onAlbum={setAlbum} onAddFolder={addFolder} />}
      {view === "taste" && <>
        <TasteProfile kind="music" page />
        <section className="la mu-taste"><TastePanel kind="music" open={false} /></section>
      </>}
      {view === "radio" && <RadioPage query={query} />}
      {view === "podcast" && <Podcasts query={query} />}
      {view === "discover" && <MusicDiscover query={query} />}
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
/** "Find songs like this": the assistant lists them first; the user then grows a list with them or makes a new one. */
export const likeThisSongs = (title: string, artist?: string, list?: string) =>
  tt("“{0}”{1} şarkısına benzeyen 15 şarkı bul: aynı ruh hâli, tempo ve tarzda; aynı sanatçıdan en fazla 2 şarkı. Önce metin olarak listeleme: hemen make_music_playlist'i titles ile çağır (“Şarkı — Sanatçı”), adı “{0} gibi” olsun{2}. Kullanıcı açılan kartta şarkıları seçer, yeni liste mi yapılacağını yoksa var olan bir listesinin mi genişletileceğini kendisi seçer. Sonra kısaca neye göre seçtiğini söyle.", title, artist ? " (" + artist + ")" : "", list ? tt("; extend alanına “{0}” yaz (şu an bu listeden çalıyor; kullanıcı kartta değiştirebilir)", list) : "");
/** The request for "a playlist of songs like this one": the assistant builds a real list (make_music_playlist). */
export const likeThisList = (title: string, artist?: string) =>
  tt("“{0}”{1} şarkısına benzeyen 15 şarkıdan bir çalma listesi yap: aynı ruh hâli, tempo ve tarzda; aynı sanatçıdan en fazla 2 şarkı, gerisi başka sanatçılardan. make_music_playlist ile listeyi gerçekten oluştur (titles alanına “Şarkı — Sanatçı” yaz), adı “{0} gibi” olsun.", title, artist ? ` (${artist})` : "");
const songMenu = (t: Track, play: () => void): MenuEntry[] => [
  { label: ASK + tt("Bu şarkı hangi film ve dizilerde geçiyor?"), act: () => askAssistant(tt("“{0}” ({1}) şarkısı hangi film ve dizilerde geçiyor?", t.title, t.artist)) },
  { label: ASK + tt("Bu şarkının hikayesi"), act: () => askAssistant(tt("“{0}” ({1}) şarkısının hikayesi ve ilginç bilgiler", t.title, t.artist)) },
  { label: ASK + tt("Buna benzer şarkılar"), act: () => askAssistant(tt("“{0}” ({1}) şarkısına benzer şarkılar öner", t.title, t.artist)) },
  { label: ASK + tt("Bunun gibi şarkılardan liste yap"), act: () => askAssistant(likeThisList(t.title, t.artist), tt("“{0}” gibi şarkılardan liste yap", t.title)) },
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
  { label: tt("Çal"), act: () => playQueue(p.items, 0, false, p.id) },
  { label: tt("Karışık çal"), act: () => playQueue(p.items, 0, true, p.id) },
  "sep",
  { label: tt("Listeyi sil"), danger: true, act: () => { if (confirm(tt("“{0}” listesi silinsin mi?", p.name))) saveMusicPlaylists(loadMusicPlaylists().filter((x) => x.id !== p.id)); } },
];
function PlaylistCard({ p }: { p: MPlaylist }) {
  return (
    <button className="mu-album" onClick={() => openPlaylist?.(p.id)} title={p.name} onContextMenu={(e) => openMenu(e, plMenu(p))}>
      <div className="mu-album-art">
        <PlaylistArt p={p} size="100%" />
        <span className="mu-album-play" role="button" aria-label={tt("Çal")} tabIndex={0}
          onClick={(e) => { e.stopPropagation(); playQueue(p.items, 0, false, p.id); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); playQueue(p.items, 0, false, p.id); } }}><Icon d={I.play} fill size={18} /></span>
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
  const [saveError,setSaveError]=useState("");
  useEffect(()=>{const f=(e:Event)=>setSaveError(String((e as CustomEvent).detail));window.addEventListener("luna-playlist-error",f);return()=>window.removeEventListener("luna-playlist-error",f);},[]);
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const p = all.find((x) => x.id === id);
  useEffect(() => {
    // the first songs are ready before they are clicked
    p?.items.slice(0, 3).forEach((t) => prefetch(t, 3));
    document.body.classList.add("pl-open");
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector(".extra-modal") && !(e.target instanceof HTMLInputElement)) { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", k, true);
    return () => { document.body.classList.remove("pl-open"); window.removeEventListener("keydown", k, true); };
  }, []);
  if (!p) return <ExtraModal title={extraText("Listeye erişilemiyor","Playlist unavailable")} close={onClose}><p role="alert" className="playlist-save-error">{saveError||extraText("Liste artık mevcut değil veya kayıt hasarlı. Mevcut verilerin üzerine yazılmadı.","The playlist is no longer available or its data is damaged. Existing data was not overwritten.")}</p></ExtraModal>;
  const save = (items: QItem[], patch: Partial<MPlaylist> = {}) => {const current=loadMusicPlaylists();if(!current.some(x=>x.id===id)){setSaveError(extraText("Bu liste artık mevcut değil.","This playlist no longer exists."));return false;}const ok=saveMusicPlaylists(current.map(x=>x.id===id?{...x,...patch,items}:x));if(ok){if(P.from===id){P.from="";changed();}setSaveError("");}return ok;};
  const total = p.items.reduce((n, t) => n + (t.duration || 0), 0);
  // this list is the one playing (not just another list that shares the song)
  const ours = !!m.now && m.from === p.id;
  const playing = ours && !m.paused;
  const needle = searchFold(q);
  const shown = p.items.map((t, i) => ({ t, i })).filter(({ t }) => matchesSearch(needle, t.title, t.artist, t.album));
  // the row playing: only in the list the queue was started from, and only that one row when a song is in the list twice
  const nowAt = playingRowIndex(p.items, m.now, m.index, ours, m.shuffle);
  const playAt = (i: number) => {
    if (i === nowAt) { toggleMusicPause(); return; }
    playQueue(p.items, i, false, p.id);
  };
  const bigPlay = () => (ours ? toggleMusicPause() : playQueue(p.items, 0, false, p.id));
  const move = (from: number, to: number) => {const items=reorderPlaylist(p.items,from,to);if(items!==p.items)save(items);};
  const duplicate=()=>{const rows=loadMusicPlaylists();const id=crypto.randomUUID();if(saveMusicPlaylists([{...p,id,name:uniquePlaylistName(p.name,rows),items:p.items.map(q=>({...q})),at:Date.now()},...rows]))setSaveError(extraText("Listenin kopyası kütüphaneye eklendi.","A copy of the playlist was added to your library."));};
  const rename = () => { const n = prompt(tt("Listenin adı"), p.name)?.trim(); if (n) save(p.items, { name: n.slice(0,120) }); };
  const remove = () => { if (confirm(tt("“{0}” listesi silinsin mi?", p.name))) { if(saveMusicPlaylists(loadMusicPlaylists().filter((x) => x.id !== id)))onClose(); } };
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
        <div className="pl-bg-clip"><div className="pl-bg" style={p.cover ? { backgroundImage: `url(${p.cover})` } : undefined} /></div>
        <header className="pl-top">
          <button className="round" aria-label={tt("Geri")} onClick={onClose}><Icon d={I.left} /></button>
        </header>
        <section className="pl-head">
          <PlaylistArt p={p} size={224} radius={16} />
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
            onClick={() => (ours ? setShuffle(!m.shuffle) : playQueue(p.items, 0, true, p.id))}><Icon d={SHUFFLE} size={20} /></button>
          <button className="act" data-tip={tt("Diğer seçenekler")} aria-label={tt("Diğer seçenekler")}
            onClick={(e) => openMenu(e, moreMenu())}>
            <Icon d={I.more} size={22} /></button>
          <button className="act" data-tip={tt("Asistana sor")} aria-label={tt("Asistana sor")}
            onClick={openAssistant}><Icon d={I.chat} size={20} /></button>
          <span className="grow" />
          <label className="pl-search"><Icon d={I.search} size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tt("Listede ara")} /></label>
        </div>
        <PlaylistUtilities playlist={p} onDuplicate={duplicate} onReplace={items=>save(items)}/>
        {saveError&&<p className="playlist-save-error" role="status">{saveError}</p>}
        {needle&&<div className="playlist-search-meta">{shown.length} / {p.items.length} {extraText("parça","tracks")} · {extraText("Çalma ve düzenleme asıl liste sırasını kullanır.","Playback and edits use the original playlist order.")}</div>}
        <div className="pl-table">
          <div className="pl-row pl-th"><span>#</span><span>{tt("Başlık")}</span><span className="pl-alb">{tt("Albüm")}</span><span /><span className="pl-dur"><Icon d="M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" size={15} /></span><span /></div>
          {shown.map(({ t, i }) => {
            const cur = i === nowAt;
            return (
              <div key={i} aria-current={cur ? "true" : undefined} className={"pl-row" + (cur ? " cur" : "") + (over === i && drag != null && drag !== i ? (drag < i ? " drop-after" : " drop-before") : "")}
                draggable={!needle} onDragStart={() => setDrag(i)} onDragEnd={() => { setDrag(null); setOver(null); }} {...hoverSong(t)}
                onDragOver={(e) => { if (drag != null) { e.preventDefault(); setOver(i); } }}
                onDrop={(e) => { e.preventDefault(); if (drag != null) move(drag, i); setDrag(null); setOver(null); }}
                onClick={(e) => { if ((e.target as HTMLElement).closest("button")) return; playAt(i); }}
                onContextMenu={(e) => openMenu(e, songActions(t, () => playQueue(p.items, i, false, p.id),
                  [{ label: tt("Listeden çıkar"), danger: true, act: () => save(p.items.filter((_, j) => j !== i)) }]))}>
                <button className="pl-n" aria-label={cur && !m.paused ? tt("Duraklat") : tt("Çal")} onClick={() => playAt(i)}>
                  <span className="pl-num">{cur && m.loading ? <span className="mu-spin sm" aria-label={tt("Yükleniyor…")} /> : cur && !m.paused ? EQ : i + 1}</span>
                  <span className="pl-hover"><Icon d={cur && !m.paused ? I.pause : I.play} fill size={14} /></span>
                </button>
                <span className="pl-title">
                  <Cover src={t.cover} name={t.title} size={42} radius={6} icon={NOTE} />
                  <span className="mu-song-t"><b className="ellipsis">{t.title}</b><span className="muted small ellipsis">{t.artist}</span></span>
                </span>
                <span className="pl-alb muted small ellipsis">{t.album ?? ""}</span>
                <SongVote q={t} />
                <span className="pl-dur muted small">{t.duration ? fmtTime(t.duration) : ""}</span>
                <div className="playlist-move-actions"><button disabled={i===0} aria-label={extraText(t.title+" listede yukarı taşı","Move "+t.title+" up in playlist")} onClick={()=>move(i,i-1)}>↑</button><button disabled={i===p.items.length-1} aria-label={extraText(t.title+" listede aşağı taşı","Move "+t.title+" down in playlist")} onClick={()=>move(i,i+1)}>↓</button><button className="pl-x" aria-label={tt("Listeden çıkar")} title={tt("Listeden çıkar")} onClick={() => save(p.items.filter((_, j) => j !== i))}><Icon d={I.x} size={14} /></button></div>
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

/** A song's own links: its YouTube / Spotify pages, or a search for one that is found when played. */
function linkMenu(q: QItem): MenuEntry[] {
  const own = songLinks(q);
  if (own.length) return own;
  if (q.src.startsWith("ytdl://ytsearch")) {
    const url = "https://www.youtube.com/results?search_query=" + encodeURIComponent(q.src.replace(/^ytdl:\/\/ytsearch\d*:/, ""));
    return [{ label: tt("YouTube'da ara"), act: () => openUrl(url) }];
  }
  return [];
}
/** Plays it right after the song playing, or at the end of the queue. */
function enqueue(q: QItem, next: boolean) {
  if (P.index < 0) { playQueue([q]); return; }
  P.queue = [...P.queue];
  P.queue.splice(next ? P.index + 1 : P.queue.length, 0, q);
  if (P.original.length) P.original = [...P.original, q];
  changed();
}
/** The same right-click menu for a song everywhere: questions, play, queue, like, add to a list, its links. */
export function songActions(q: QItem, onPlay: () => void, extra: MenuEntry[] = []): MenuEntry[] {
  const lists = loadMusicPlaylists().filter((p) => !p.items.some((t) => t.src === q.src)).slice(0, 6);
  return [
    ...(q.podcast ? [] : songMenu({ title: q.title, artist: q.artist ?? "" } as Track, onPlay)),
    ...(q.podcast ? [{ label: tt("Çal"), act: onPlay }] : []),
    { label: tt("Sıradaki olarak çal"), act: () => enqueue(q, true) },
    { label: tt("Sıranın sonuna ekle"), act: () => enqueue(q, false) },
    "sep",
    { label: isLiked(q.src) ? "♥  " + tt("Beğendiklerimden çıkar") : "♡  " + tt("Beğendiklerime ekle"), act: () => toggleLike(q) },
    ...(q.radio || q.podcast ? [] : [collectEntry({ kind: "music", title: q.title, by: q.artist, src: q.src, cover: q.cover })]),
    ...lists.map((p): MenuEntry => ({ label: tt("Listeye ekle: {0}", p.name), act: () => saveMusicPlaylists(loadMusicPlaylists().map((x) => (x.id === p.id ? { ...x, items: [...x.items, q] } : x))) })),
    ...(linkMenu(q).length ? ["sep" as const, ...linkMenu(q)] : []),
    ...(extra.length ? ["sep" as const, ...extra] : []),
  ];
}
/** Takes a song out of "most played" / "recently played" (and "where you left off"). */
function forgetPlayed(q: QItem) {
  const plays = loadPlays();
  delete plays[q.src];
  store.set("musicPlays", JSON.stringify(plays));
  if (store.json<QItem | null>("musicLast", null)?.src === q.src) store.remove("musicLast");
  changed();
}
/** Right click on a played song: the assistant's questions, play, its links, take it off the list. */
const playedMenu = (q: QItem, onPlay: () => void): MenuEntry[] =>
  songActions(q, onPlay, [{ label: tt("Listeden kaldır"), danger: true, act: () => forgetPlayed(q) }]);

function SongTile({ q, n, onPlay }: { q: QItem; n: number; onPlay: () => void }) {
  return (
    <button className="mu-album" onClick={onPlay} title={`${q.title}${q.artist ? " · " + q.artist : ""}`} {...hoverSong(q)}
      onContextMenu={(e) => openMenu(e, playedMenu(q, onPlay))}>
      <div className="mu-album-art">
        <Cover src={q.cover} name={q.title} size="100%" icon={NOTE} />
        <span className="mu-album-play" aria-hidden="true"><Icon d={I.play} fill size={18} /></span>
      </div>
      <b className="ellipsis">{q.title}</b>
      <span className="muted small ellipsis">{[q.artist, tt("{0} kez", n)].filter(Boolean).join(" · ")}</span>
    </button>
  );
}
/** "Beğendiğin şarkılar" among the lists (always first, can't be deleted). */
function LikedCard({ onOpen }: { onOpen: () => void }) {
  const n = loadLikes().length;
  return (
    <button className="mu-album" onClick={onOpen} title={tt("Beğendiklerim")}>
      <div className="mu-album-art mu-liked-card"><Icon d={HEART} size={44} fill /></div>
      <b className="ellipsis">{tt("Beğendiklerim")}</b>
      <span className="muted small ellipsis">{tt("{0} öğe", n)}</span>
    </button>
  );
}
function HomeLists() {
  const lists = useMusicPlaylists();
  useMusic(); // the counts change as songs play
  const most = mostPlayed();
  const liked = loadLikes().length > 0;
  return (
    <>
      {/* "Beğendiklerim" always heads the lists, even while it is empty */}
      {(lists.length > 0 || liked) && (
        <section className="row"><h2>{tt("Listelerin")}</h2>
          <div className="mu-grid"><LikedCard onOpen={() => { store.set("musicLibTab", "liked"); goMusicPage?.("library"); }} />{lists.slice(0, 11).map((p) => <PlaylistCard key={p.id} p={p} />)}</div>
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

function MusicHome({ lib, onAlbum, onAddFolder, goRadio, goShow }: { lib: Lib; onAlbum: (a: Album) => void; onAddFolder: () => void; goRadio: () => void; goShow: (s: Show) => void }) {
  const pods = <PodcastRow onOpen={goShow} />;
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
      {pods}
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
      {pods}
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

type LibTab = "albums" | "artists" | "songs" | "lists" | "liked" | "history";
function MusicLibrary({ lib, query, onAlbum, onAddFolder }: { lib: Lib; query: string; onAlbum: (a: Album) => void; onAddFolder: () => void }) {
  const [tab, setTab] = useState<LibTab>(() => (store.get("musicLibTab") as LibTab) || "albums");
  const pick = (t: LibTab) => { setTab(t); store.set("musicLibTab", t); };
  const [artist, setArtist] = useState<string | null>(null);
  // accents and Turkish dots don't matter ("sarki" finds "Şarkı"); every word may be in a different field (title + artist)
  const q = searchFold(query);
  const hit = (...xs: (string | undefined)[]) => matchesSearch(q, ...xs);
  const allLists = useMusicPlaylists();
  // the folder's songs, then those from lists and links (a song that is also a file isn't shown twice)
  const online = useMemo(() => {
    const files = new Set((lib.tracks ?? []).map((t) => `${t.artist}|${t.title}`.toLowerCase()));
    return onlineTracks().filter((t) => !files.has(`${t.artist}|${t.title}`.toLowerCase()));
  }, [lib.tracks, allLists]);
  const allTracks = [...(lib.tracks ?? []), ...online];
  const allAlbums = [...lib.albums, ...groupAlbums(online.filter((t) => t.album))];
  const albums = allAlbums.filter((a) => hit(a.title, a.artist) && (!artist || a.artist === artist))
    .sort((x, y) => x.artist.localeCompare(y.artist) || (x.year ?? 0) - (y.year ?? 0));
  const byArtist = new Map<string, Track[]>();
  for (const t of allTracks) { const k = t.albumArtist || t.artist; byArtist.set(k, [...(byArtist.get(k) ?? []), t]); }
  const artists = [...byArtist.keys()].filter((a) => hit(a)).sort((x, y) => x.localeCompare(y));
  const songMatches = allTracks.filter((t) => hit(t.title, t.artist, t.album) && (!artist || (t.albumArtist || t.artist) === artist));
  const songs = songMatches.slice(0, 500);
  const lists = allLists.filter((p) => hit(p.name));
  if (lib.tracks && !lib.tracks.length && !lib.folders.length && tab !== "lists" && tab !== "liked" && tab !== "history" && !lists.length && !online.length) return <NoMusic onAddFolder={onAddFolder} scanning={lib.scanning} />;
  return (
    <>
      <div className="row-head mu-lib-head">
        <div className="seg-row">
          {([["liked", tt("Beğendiklerim")], ["lists", tt("Listeler")], ["albums", tt("Albümler")], ["artists", tt("Sanatçılar")], ["songs", tt("Şarkılar")], ["history", tt("Geçmiş")]] as const).map(([k, l]) => (
            <button key={k} className={"seg sm" + (tab === k ? " on" : "")} onClick={() => { pick(k); setArtist(null); }}>{l}</button>
          ))}
        </div>
        <span className="grow" />
        {lib.scanning ? <span className="muted small pulse">{tt("Taranıyor…")}</span> : <span className="muted small">{tt("{0} şarkı · {1} albüm", allTracks.length, allAlbums.length)}</span>}
        <button className="chip" onClick={lib.rescan} disabled={lib.scanning}>{tt("Yeniden tara")}</button>
        <button className="chip" onClick={onAddFolder}><Icon d={I.plus} size={14} />  {tt("Klasör")}</button>
      </div>
      <div className="mu-folders">
        {lib.folders.map((f) => (
          <span key={f} className="mu-folder" title={f}><Icon d={I.folder} size={14} /><span className="ellipsis">{f}</span>
            <button aria-label={tt("Kaldır")} title={tt("Kaldır")} onClick={() => lib.setFolders(lib.folders.filter((x) => x !== f))}><Icon d={I.x} size={12} /></button></span>
        ))}
      </div>
      {lib.scanError && !lib.scanning && <div className="mu-note warn" role="alert"><span>{tt("Müzik klasörleri taranamadı. Sürücü bağlı mı, klasör yerinde mi?")}</span><button className="chip" onClick={lib.rescan}>{tt("Yeniden dene")}</button></div>}
      {tab === "albums" && (
        <>
          {artist && <div className="mu-crumb"><button className="chip" onClick={() => setArtist(null)}>← {tt("Tüm albümler")}</button><b>{artist}</b></div>}
          <div className="mu-grid">{albums.map((a) => <AlbumCard key={a.key} a={a} onOpen={() => onAlbum(a)} />)}</div>
          {/* an artist's songs that aren't on an album (YouTube singles) */}
          {artist && songs.some((t) => !t.album) && <><h3 className="mu-sub-h">{tt("Şarkılar")}</h3><SongList tracks={songs.filter((t) => !t.album)} showAlbum /></>}
          {!albums.length && !artist && <div className="muted empty-note">{tt("Albüm bilgisi olan şarkı yok. Sanatçılar ve Şarkılar sekmelerinde listelerindeki ve dinlediğin şarkılar da var.")}</div>}
        </>
      )}
      {tab === "artists" && (
        <div className="mu-artists">
          {artists.map((name) => {
            const theirs = allAlbums.filter((a) => a.artist === name);
            const tracks = byArtist.get(name) ?? [];
            return (
              <button key={name} className="mu-artist" onClick={() => { setArtist(name); pick(theirs.length ? "albums" : "songs"); }}
                onContextMenu={(e) => openMenu(e, [{ label: tt("Karışık çal"), act: () => playQueue(tracks.map(trackItem), 0, true) },
                  { label: ASK + tt("Buna benzer sanatçılar"), act: () => askAssistant(tt("{0} gibi sanatçılar öner", name)) }])}>
                <Cover src={theirs.find((a) => a.cover)?.cover ?? tracks.find((t) => t.cover)?.cover} name={name} size={120} radius={60} />
                <b className="ellipsis">{name}</b>
                <span className="muted small">{theirs.length ? tt("{0} albüm", theirs.length) : tt("{0} şarkı", tracks.length)}</span>
              </button>
            );
          })}
        </div>
      )}
      {tab === "songs" && (
        <>
          {artist && <div className="mu-crumb"><button className="chip" onClick={() => setArtist(null)}>← {tt("Tüm şarkılar")}</button><b>{artist}</b></div>}
          <SongList tracks={songs} showAlbum />
          {songMatches.length > songs.length && <div className="muted small mu-cap-note">{tt("İlk {0} şarkı gösteriliyor ({1} eşleşme). Daraltmak için üstteki arama kutusunu kullan.", songs.length, songMatches.length)}</div>}
        </>
      )}
      {tab === "liked" && <LikedView />}
      {tab === "history" && <HistoryView />}
      {tab === "lists"&&<MusicPlaylistTools lists={allLists} save={saveMusicPlaylists} open={id=>openPlaylist?.(id)}/>}
      {tab === "lists" && (lists.length || loadLikes().length
        ? <div className="mu-grid"><LikedCard onOpen={() => pick("liked")} />{lists.map((p) => <PlaylistCard key={p.id} p={p} />)}</div>
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
          <button key={t.path} aria-current={on ? "true" : undefined} className={"mu-song" + (on ? " on" : "")} onClick={() => playQueue(tracks.map(trackItem), i)} {...(t.online ? hoverSong(trackItem(t)) : {})}
            onContextMenu={(e) => openMenu(e, songActions(trackItem(t), () => playQueue(tracks.map(trackItem), i)))}>
            <span className="mu-n">{on && m.loading ? <span className="mu-spin sm" aria-label={tt("Yükleniyor…")} /> : on ? <Icon d={NOTE} size={14} /> : showAlbum ? i + 1 : t.track ?? i + 1}</span>
            {showAlbum && <Cover src={t.cover} name={t.album} size={36} radius={6} />}
            <span className="mu-song-t"><b className="ellipsis">{t.title}</b><span className="muted small ellipsis">{showAlbum && t.album ? `${t.artist} · ${t.album}` : t.artist}</span></span>
            <SongVote q={trackItem(t)} />
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

// ---------- Keşfet: what's popular in a country, songs of the artists you listen to, genres ----------
// Apple's open charts and search (no account, no key); each song plays from YouTube when its turn
// comes, like a Spotify list (nothing is downloaded).
const CHART_LANDS: [string, string][] = [
  ["tr", "Türkiye"], ["us", "ABD"], ["gb", "İngiltere"], ["de", "Almanya"], ["fr", "Fransa"], ["es", "İspanya"],
  ["it", "İtalya"], ["br", "Brezilya"], ["mx", "Meksika"], ["jp", "Japonya"], ["kr", "Kore"], ["in", "Hindistan"],
  ["ru", "Rusya"], ["az", "Azerbaycan"], ["sa", "Arap dünyası"], ["gr", "Yunanistan"],
];
const GENRES = ["Pop", "Rock", "Jazz", "Hip-hop", "Lo-fi", "Klasik müzik", "Elektronik", "Türk sanat müziği", "Anadolu rock", "Film müzikleri", "Metal", "R&B"];
const searchItem = (title: string, artist: string, cover?: string, duration?: number): QItem =>
  ({ src: `ytdl://ytsearch1:${artist} ${title} audio`, title, artist, cover, duration, yt: true });
async function chartSongs(cc: string): Promise<QItem[]> {
  const k = "muChart:" + cc;
  const c = store.json<{ at: number; l: QItem[] } | null>(k, null);
  if (c && Date.now() - c.at < 6 * 3600e3 && c.l.length) return c.l;
  const r = await getJson(`https://rss.marketingtools.apple.com/api/v2/${cc}/music/most-played/50/songs.json`);
  const l: QItem[] = (r?.feed?.results ?? []).map((x: any) => searchItem(x.name, x.artistName, x.artworkUrl100?.replace("100x100", "400x400")));
  if (l.length) store.set(k, JSON.stringify({ at: Date.now(), l }));
  return l;
}
async function songSearch(q: string): Promise<QItem[]> {
  const r = await getJson(`https://itunes.apple.com/search?entity=song&limit=30&country=${lang() === "tr" ? "tr" : "us"}&term=${encodeURIComponent(q)}`);
  return (r?.results ?? []).map((x: any) => searchItem(x.trackName, x.artistName, x.artworkUrl100?.replace("100x100", "400x400"), x.trackTimeMillis ? x.trackTimeMillis / 1000 : undefined));
}
async function artistSongs(artist: string): Promise<QItem[]> {
  const r = await getJson(`https://itunes.apple.com/search?entity=song&limit=12&country=${lang() === "tr" ? "tr" : "us"}&term=${encodeURIComponent(artist)}`);
  const want = artist.toLocaleLowerCase();
  return (r?.results ?? []).filter((x: any) => String(x.artistName ?? "").toLocaleLowerCase().includes(want))
    .map((x: any) => searchItem(x.trackName, x.artistName, x.artworkUrl100?.replace("100x100", "400x400"), x.trackTimeMillis ? x.trackTimeMillis / 1000 : undefined));
}
/** The artists you listen to most (plays and lists), for "from artists you like". */
function topArtists(n: number): string[] {
  const count = new Map<string, number>();
  const add = (a: string | undefined, w: number) => {
    const k = cleanArtist((a ?? "").split(",")[0]);
    if (k && k.length > 1) count.set(k, (count.get(k) ?? 0) + w);
  };
  for (const x of mostPlayed(200)) if (!x.q.radio && !x.q.podcast && !x.q.book) add(x.q.artist, x.n);
  for (const p of loadMusicPlaylists()) for (const t of p.items) add(t.artist, 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([a]) => a);
}
function SongTiles({ items }: { items: QItem[] | null }) {
  const m = useMusic();
  return (
    <div className="mu-tiles">
      {items == null && Array.from({ length: 10 }, (_, i) => <div key={i} className="mu-tile ghost-card" />)}
      {items?.map((t, i) => (
        <button key={t.src} className={"mu-tile" + (m.now?.src === t.src ? " on" : "")} title={`${t.title} · ${t.artist}`} {...hoverSong(t)}
          onClick={() => playQueue(items, i)}
          onContextMenu={(e) => openMenu(e, songActions(t, () => playQueue(items, i), [{ label: tt("Listeye ekle: Luna'ya eklenenler"), act: () => addToAdded(t) }]))}>
          <span className="mu-tile-n">{m.now?.src === t.src && m.loading ? <span className="mu-spin sm" aria-label={tt("Yükleniyor…")} /> : i + 1}</span>
          <Cover src={t.cover} name={t.title} size={48} radius={8} />
          <span className="mu-song-t"><b className="ellipsis">{t.title}</b><span className="muted small ellipsis">{t.artist}</span></span>
        </button>
      ))}
    </div>
  );
}
/** "Luna'ya eklenenler": the list songs found outside the library go to. */
function addToAdded(t: QItem) {
  const lists = loadMusicPlaylists();
  const id = "luna-added";
  const cur = lists.find((p) => p.id === id);
  if (cur) { if (!cur.items.some((x) => x.src === t.src)) saveMusicPlaylists(lists.map((p) => (p.id === id ? { ...p, items: [...p.items, t] } : p))); }
  else saveMusicPlaylists([{ id, name: tt("Luna'ya eklenenler"), from: "Luna", at: Date.now(), items: [t] }, ...lists]);
}
function MusicDiscover({ query }: { query: string }) {
  const [q, setQ] = useState(query);
  const [deb, setDeb] = useState(query.trim());
  useEffect(() => { setQ(query); }, [query]);
  useEffect(() => { const t = setTimeout(() => setDeb(q.trim()), 450); return () => clearTimeout(t); }, [q]);
  const [found, setFound] = useState<QItem[] | null>(null);
  useEffect(() => {
    if (!deb) { setFound(null); return; }
    let alive = true;
    setFound(null);
    songSearch(deb).then((l) => alive && setFound(l)).catch(() => alive && setFound([]));
    return () => { alive = false; };
  }, [deb]);
  const [cc, setCc] = useState(() => store.get("muChartLand") || (lang() === "tr" ? "tr" : "us"));
  const [chart, setChart] = useState<QItem[] | null>(null);
  const [err, setErr] = useState(false);
  const artists = useMemo(() => topArtists(4), []);
  const [byArtist, setByArtist] = useState<Record<string, QItem[] | null>>({});
  useEffect(() => {
    let alive = true;
    setChart(null); setErr(false);
    chartSongs(cc).then((l) => { if (!alive) return; setChart(l); l.slice(0, 3).forEach((t) => prefetch(t, 3)); }).catch(() => { if (alive) { setChart([]); setErr(true); } });
    return () => { alive = false; };
  }, [cc]);
  useEffect(() => {
    let alive = true;
    for (const a of artists) artistSongs(a).then((l) => alive && setByArtist((m) => ({ ...m, [a]: l }))).catch(() => alive && setByArtist((m) => ({ ...m, [a]: [] })));
    return () => { alive = false; };
  }, [artists.join("|")]);
  const land = CHART_LANDS.find(([k]) => k === cc)?.[1] ?? cc.toUpperCase();
  const search = (
    <div className="row-head mu-lib-head">
      <label className="search mu-radio-search"><Icon d={I.search} size={18} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tt("Şarkı ya da sanatçı ara")} /></label>
    </div>
  );
  if (deb) return (
    <>
      {search}
      <section className="row">
        <div className="row-head">
          <h2>{tt("“{0}” için şarkılar", deb)}</h2>
          <span className="grow" />
          {!!found?.length && <button className="primary sm" onClick={() => playQueue(found)}><Icon d={I.play} fill size={14} />  {tt("Hepsini çal")}</button>}
        </div>
        {found && !found.length && <div className="muted">{tt("Şarkı bulunamadı. Müzik › Bağlantı'dan YouTube'da da arayabilirsin.")}</div>}
        <SongTiles items={found} />
      </section>
    </>
  );
  return (
    <>
      {search}
      <section className="row">
        <div className="row-head">
          <h2>{tt("Şu an popüler: {0}", tt(land))}</h2>
          <span className="grow" />
          {!!chart?.length && <button className="primary sm" onClick={() => playQueue(chart)}><Icon d={I.play} fill size={14} />  {tt("Hepsini çal")}</button>}
          {!!chart?.length && <button className="chip" onClick={() => playQueue(chart, 0, true)}><Icon d={SHUFFLE} size={14} />  {tt("Karışık")}</button>}
        </div>
        <div className="mu-lands">
          {CHART_LANDS.map(([k, name]) => (
            <button key={k} className={"seg sm" + (k === cc ? " on" : "")} onClick={() => { setCc(k); store.set("muChartLand", k); }}>{tt(name)}</button>
          ))}
        </div>
        {chart == null && !err && <div className="muted small mu-loading-row"><span className="mu-spin sm" /> {tt("{0} listesi yükleniyor…", tt(land))}</div>}
        {err && <div className="muted">{tt("Liste alınamadı; internet bağlantını kontrol et.")}</div>}
        {chart && !chart.length && !err && <div className="muted">{tt("Bu ülke için liste yok.")}</div>}
        <SongTiles items={chart} />
        <div className="muted small mu-credit">{tt("Liste: Apple Music'te en çok dinlenenler (herkese açık). Şarkılar YouTube'dan çalınır; hiçbir şey indirilmez.")}</div>
      </section>
      {artists.map((a) => byArtist[a] === undefined || byArtist[a]!.length ? (
        <section className="row" key={a}>
          <div className="row-head">
            <h2>{tt("{0} dinlediğin için", a)}</h2>
            <span className="grow" />
            <button className="chip" onClick={() => askAssistant(tt("{0} gibi sanatçılar öner; kütüphanemde olanlar ve olmayanlar", a))}>{ASK + tt("Benzer sanatçılar")}</button>
          </div>
          <SongTiles items={byArtist[a] ?? null} />
        </section>
      ) : null)}
      {!artists.length && <div className="muted empty-note">{tt("Biraz müzik dinledikçe burada sevdiğin sanatçıların şarkıları da çıkacak.")}</div>}
      <section className="row">
        <h2>{tt("Türler")}</h2>
        <div className="mu-genres">
          {GENRES.map((g) => (
            <button key={g} className="mu-genre" onClick={() => askAssistant(tt("{0} türünde 15 şarkılık bir çalma listesi yap", tt(g)))}>{tt(g)}</button>
          ))}
        </div>
        <div className="muted small">{tt("Bir türe tıklayınca asistan sana o türde bir liste hazırlar.")}</div>
      </section>
    </>
  );
}

function RadioPage({ query }: { query: string }) {
  const m = useMusic();
  const [q, setQ] = useState(query);
  const [scope, setScope] = useState<"local" | "world">("local");
  const [list, setList] = useState<Station[] | null>(null);
  const [err, setErr] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => { setQ(query); }, [query]);
  useEffect(() => {
    let alive = true;
    setList(null);
    setErr(false);
    const t = setTimeout(() => {
      const cc = lang() === "tr" ? "TR" : "US";
      const where = `&order=votes&reverse=true&hidebroken=true&limit=60${scope === "local" ? "&countrycode=" + cc : ""}`;
      const e = encodeURIComponent(q.trim());
      // a search is by name and by genre (a jazz station needn't have "jazz" in its name)
      const found = q.trim()
        ? Promise.all([stations(`/stations/search?name=${e}${where}`), stations(`/stations/search?tag=${e}${where}`).catch(() => [] as Station[])])
          .then(([byName, byTag]) => [...byName, ...byTag.filter((s) => !byName.some((x) => x.stationuuid === s.stationuuid))])
        : stations(scope === "local" ? `/stations/bycountrycodeexact/${cc}?order=votes&reverse=true&hidebroken=true&limit=60` : `/stations/topvote/60`);
      found.then((l) => alive && setList(l)).catch(() => { if (alive) { setList([]); setErr(true); } });
    }, q.trim() ? 400 : 0);
    return () => { alive = false; clearTimeout(t); };
  }, [q, scope, retry]);
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
        {err && <div className="mu-note warn" role="alert"><span>{tt("Radyo listesi alınamadı; internet bağlantını kontrol et.")}</span><button className="chip" onClick={() => setRetry((n) => n + 1)}>{tt("Yeniden dene")}</button></div>}
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
/** The last episode of each show you listened to (newest first). */
type PodRecent = { q: QItem; at: number };
const loadPodRecent = () => store.json<PodRecent[]>("podRecent", []);
const showOf = (q: QItem): Show => {
  const sub = loadSubs().find((x) => x.feed === q.podcast);
  return sub ?? { feed: q.podcast!, title: q.artist ?? q.album ?? "", author: "", art: q.cover ?? undefined };
};
/** Right click on a recently played episode: play, its links, take it off the list. */
function podMenu(q: QItem, onShow?: () => void): MenuEntry[] {
  return [
    { label: tt("Kaldığın yerden dinle"), act: () => playEpisodeInShow(q) },
    ...(onShow ? [{ label: tt("Bölümler"), act: onShow }] : []),
    "sep",
    { label: tt("Bölümü tarayıcıda aç"), act: () => openUrl(q.src) },
    { label: tt("Bölüm bağlantısını kopyala"), act: () => copy(q.src) },
    ...(q.podcast ? [{ label: tt("Podcast beslemesini (RSS) kopyala"), act: () => copy(q.podcast!) }] : []),
    "sep",
    { label: tt("Listeden kaldır"), danger: true, act: () => { store.set("podRecent", JSON.stringify(loadPodRecent().filter((r) => r.q.src !== q.src))); changed(); } },
  ];
}
/** "Kaldığın yerden": each card carries on with its episode; "Bölümler" opens the show's other episodes. */
function PodcastRecent({ onShow, title }: { onShow: (s: Show) => void; title: string }) {
  const m = useMusic();
  const l = loadPodRecent();
  if (!l.length) return null;
  return (
    <section className="row"><h2>{title}</h2>
      <div className="pod-recent">
        {l.slice(0, 8).map(({ q }) => {
          const pos = Number(store.get("podPos:" + q.src) ?? 0);
          const pct = pos === -1 ? 100 : q.duration && pos > 0 ? Math.min(100, (pos / q.duration) * 100) : 0;
          const on = m.now?.src === q.src;
          return (
            <div key={q.src} className={"pod-rc" + (on ? " on" : "")} onContextMenu={(e) => openMenu(e, podMenu(q, () => onShow(showOf(q))))}>
              <button className="pod-rc-main" onClick={() => playEpisodeInShow(q)} title={q.title}>
                <Cover src={q.cover} name={q.artist ?? q.title} size={64} radius={10} icon={MIC} />
                <span className="pod-rc-t">
                  <span className="muted small ellipsis">{q.artist}</span>
                  <b className="ellipsis">{q.title}</b>
                  <span className="bk-bar pod-rc-bar"><span style={{ width: pct + "%" }} /></span>
                  <span className="muted small">{pos === -1 ? tt("dinlendi") : pos > 0 && q.duration ? tt("{0} kaldı", fmtTime(q.duration - pos)) : tt("Başla")}</span>
                </span>
              </button>
              <button className="chip pod-rc-eps" onClick={() => onShow(showOf(q))}>{tt("Bölümler")} →</button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
/** A show to open when the podcast page appears (from the home page or a link). */
let pendingShow: Show | null = null;
/** The shows you follow, on the music home page. */
function PodcastRow({ onOpen }: { onOpen: (s: Show) => void }) {
  const subs = loadSubs();
  return (
    <>
      <PodcastRecent onShow={onOpen} title={tt("Podcast'te kaldığın yerden")} />
      {subs.length > 0 && (
        <section className="row"><h2>{tt("Podcastlerin")}</h2>
          <div className="mu-grid">{subs.slice(0, 12).map((s) => <ShowCard key={s.feed} s={s} onOpen={() => onOpen(s)} />)}</div>
        </section>
      )}
    </>
  );
}
/** Is this link a podcast? An RSS feed with audio episodes, an Apple Podcasts page or a Spotify show
 *  (found again in Apple's open directory by its name, since Spotify gives no feed). */
export async function podcastFromLink(url: string): Promise<Show | null> {
  const apple = url.match(/podcasts\.apple\.com\/.*\bid(\d+)/i)?.[1];
  if (apple) {
    const x = (await getJson(`https://itunes.apple.com/lookup?id=${apple}`))?.results?.[0];
    return x?.feedUrl ? { feed: x.feedUrl, title: x.collectionName, author: x.artistName, art: x.artworkUrl600 ?? x.artworkUrl100 } : null;
  }
  if (/open\.spotify\.com\/(intl-[a-z-]+\/)?(show|episode)\//i.test(url)) {
    const html = await invoke<string>("http_text", { url }).catch(() => "");
    const name = html.match(/<meta property="og:title" content="([^"]+)"/)?.[1];
    return name ? (await searchShows(name.replace(/&amp;/g, "&")))[0] ?? null : null;
  }
  if (/^https?:\/\//i.test(url) && !AUDIO_URL.test(url)) {
    const { show, eps } = await episodes(url).catch(() => ({ show: {} as Partial<Show>, eps: [] as Episode[] }));
    if (eps.length && show.title) return { feed: url, title: show.title, author: show.author ?? "", art: show.art };
  }
  return null;
}
/** Follows the show (it appears on the home page) and opens it on the podcast page. */
export function followPodcast(s: Show) {
  const l = loadSubs();
  if (!l.some((x) => x.feed === s.feed)) store.set("podcasts", JSON.stringify([s, ...l]));
  pendingShow = s;
  window.dispatchEvent(new Event("luna-podcast"));
}
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
      about: (txt(it, "description") ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 4000) }];
  });
  // newest first, whatever order the feed lists them in (some list the oldest first)
  if (eps.length > 1 && eps.every((e) => e.date && !isNaN(e.date))) eps.sort((a, b) => b.date! - a.date!);
  return { show: { title: txt(ch, "title"), author: txt(ch, "author"), art: img ?? undefined }, eps };
}

const epItem = (e: Episode, s: { title: string; feed: string }, art?: string | null): QItem =>
  ({ src: e.src, title: e.title, artist: s.title, album: s.title, cover: art, duration: e.duration, podcast: s.feed, about: e.about, date: e.date });
/** An episode from "recently played": the show's episodes are queued from it on (so "Up next" has the rest). */
async function playEpisodeInShow(q: QItem) {
  const generation=beginMusicSelection();
  const d = q.podcast ? await episodes(q.podcast).catch(() => null) : null;
  if(!isMusicSelectionCurrent(generation))return;
  const i = d ? d.eps.findIndex((e) => e.src === q.src) : -1;
  if (!d || i < 0) { playQueue([q]); return; }
  playQueue(d.eps.slice(i).map((e) => epItem(e, { title: q.artist ?? d.show.title ?? "", feed: q.podcast! }, q.cover ?? d.show.art)));
}
/** A podcast by name with its episodes (for the assistant). */
export async function findPodcast(q: string): Promise<{ show: Show; items: QItem[] } | null> {
  const show = (await searchShows(q))[0];
  if (!show) return null;
  const { show: s, eps } = await episodes(show.feed);
  const art = show.art ?? s.art;
  return { show: { ...show, art }, items: eps.map((e) => epItem(e, show, art)) };
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
  const [retry, setRetry] = useState(0);
  const [show, setShow] = useState<Show | null>(() => { const p = pendingShow; pendingShow = null; return p; });
  // a podcast link while this page is already open
  useEffect(() => {
    const f = () => { if (pendingShow) { setShow(pendingShow); pendingShow = null; setSubs(loadSubs()); } };
    window.addEventListener("luna-podcast", f);
    return () => window.removeEventListener("luna-podcast", f);
  }, []);
  useEffect(() => {
    let alive = true;
    setErr(false);
    if (deb) { setFound(null); searchShows(deb).then((l) => alive && setFound(l)).catch(() => alive && setErr(true)); }
    else { setFound(null); topShows().then((l) => alive && setTop(l)).catch(() => alive && setErr(true)); }
    return () => { alive = false; };
  }, [deb, retry]);
  // a featured podcast's feed can take a while: say so instead of looking frozen
  const [opening, setOpening] = useState<Top | null>(null);
  const [openErr, setOpenErr] = useState("");
  const openRef = useRef<Top | null>(null);
  const openTop = async (t: Top) => {
    openRef.current = t; setOpening(t); setOpenErr("");
    const s = await feedOf(t).catch(() => null);
    if (openRef.current !== t) return; // cancelled, or another one was clicked
    openRef.current = null; setOpening(null);
    if (s) setShow(s); else setOpenErr(tt("“{0}” açılamadı; podcastin beslemesine ulaşılamadı.", t.title));
  };
  const cancelOpen = () => { openRef.current = null; setOpening(null); };
  if (opening && !show) return <div className="mu-pod-wait"><div className="mu-pod-spin" /><b>{tt("Podcast açılıyor…")}</b><span className="muted small">{opening.title}</span><span className="muted small">{tt("Bölümler podcastin kendi beslemesinden alınıyor")}</span><button className="chip sm" onClick={cancelOpen}>{tt("İptal")}</button></div>;
  if (show) return <ShowPage s={show} onBack={() => { setShow(null); setSubs(loadSubs()); }} />;
  return (
    <>
      <div className="row-head mu-lib-head">
        <label className="search mu-radio-search"><Icon d={I.search} size={18} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tt("Podcast ara")} /></label>
      </div>
      {!deb && <PodcastRecent onShow={setShow} title={tt("Son dinlediklerin")} />}
      {!deb && subs.length > 0 && (
        <section className="row"><h2>{tt("Abone olduklarım")}</h2>
          <div className="mu-grid">{subs.map((x) => <ShowCard key={x.feed} s={x} onOpen={() => setShow(x)} />)}</div></section>
      )}
      <section className="row">
        <h2>{deb ? tt("“{0}” için podcastler", deb) : tt("Öne çıkan podcastler")}</h2>
        {openErr && <div className="muted">{openErr}</div>}
        {err && <div className="mu-note warn" role="alert"><span>{tt("Podcast listesi alınamadı; internet bağlantını kontrol et.")}</span><button className="chip" onClick={() => setRetry((n) => n + 1)}>{tt("Yeniden dene")}</button></div>}
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
  const item = (e: Episode): QItem => epItem(e, s, art);
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
              {pos > 0 && <span className="pod-ep-dot" title={tt("Kaldığın bölüm")} />}
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

const HEART = "M12 21l-8.5-8.6a5 5 0 0 1 7-7.1L12 6.8l1.5-1.5a5 5 0 0 1 7 7.1z";
function LikeBtn({ q, big }: { q: QItem; big?: boolean }) {
  useMusic(); // redraws when it changes
  const on = isLiked(q.src);
  return (
    <button className={"mu-ib mu-like" + (on ? " on" : "") + (big ? " big" : "")} aria-pressed={on}
      aria-label={on ? tt("Beğendiklerimden çıkar") : tt("Beğendiklerime ekle")} title={on ? tt("Beğendiklerimden çıkar") : tt("Beğendiklerime ekle")}
      onClick={(e) => { e.stopPropagation(); if (toggleLike(q)) askSongRating(q, e.currentTarget); }}><Icon d={THUMB_UP} size={big ? 22 : 17} />{on && songRating(q.src) ? <span className="vote-n">{songRating(q.src)}</span> : null}</button>
  );
}

const THUMB_UP = "M7 10v11H3V10zM7 10l4-8a3 3 0 0 1 3 3v4h6a2 2 0 0 1 2 2.3l-1.4 8A2 2 0 0 1 18.6 21H7";
const THUMB_DOWN = "M10 15v4a3 3 0 0 0 3 3l4-9V2H5.7a2 2 0 0 0-2 1.7l-1.4 9a2 2 0 0 0 2 2.3zM17 2h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3";
/** Like and dislike on a song row: shown on hover, or always once set. (Spans, as the row itself is often a button.) */
export function SongVote({ q }: { q: QItem }) {
  useMusic();
  if (q.radio) return null;
  const like = isLiked(q.src), dis = isDisliked(q.src);
  const n = songRating(q.src);
  const btn = (on: boolean, label: string, d: string, act: () => boolean, cls: string) => (
    <span role="button" tabIndex={0} aria-pressed={on} aria-label={label} title={label} className={"mu-ib mu-vote-b " + cls + (on ? " on" : "")}
      onClick={(e) => { e.stopPropagation(); if (act() && !q.podcast) askSongRating(q, e.currentTarget); }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); if (act() && !q.podcast) askSongRating(q, e.currentTarget); } }}>
      <Icon d={d} size={15} />{on && n ? <span className="vote-n">{n}</span> : null}</span>
  );
  return (
    <span className={"mu-vote" + (like || dis ? " set" : "")}>
      {btn(like, like ? tt("Beğendiklerimden çıkar") : tt("Beğendiklerime ekle"), THUMB_UP, () => toggleLike(q), "mu-like")}
      {!q.podcast && btn(dis, dis ? tt("Beğenmediklerimden çıkar") : tt("Beğenmedim"), THUMB_DOWN, () => toggleDislike(q), "mu-dis")}
    </span>
  );
}

/** Rows of songs or episodes that aren't files (likes, history): play from here, the song menu on right click. */
function QRows({ items, extra, when }: { items: QItem[]; extra?: (q: QItem) => MenuEntry[]; when?: (i: number) => string }) {
  const m = useMusic();
  return (
    <div className="mu-songs">
      {items.map((q, i) => {
        const on = m.now?.src === q.src;
        const play = () => (q.podcast ? playEpisodeInShow(q) : playQueue(items.filter((x) => !x.podcast), Math.max(0, items.filter((x) => !x.podcast).indexOf(q))));
        return (
          <button key={q.src + i} className={"mu-song" + (on ? " on" : "")} onClick={play} {...hoverSong(q)}
            onContextMenu={(e) => openMenu(e, songActions(q, play, extra?.(q)))}>
            <span className="mu-n">{on && m.loading ? <span className="mu-spin sm" /> : on ? <Icon d={NOTE} size={14} /> : i + 1}</span>
            <Cover src={q.cover} name={q.album ?? q.title} size={36} radius={6} icon={q.podcast ? MIC : NOTE} />
            <span className="mu-song-t"><b className="ellipsis">{q.title}</b><span className="muted small ellipsis">{[q.artist, q.album && q.album !== q.artist ? q.album : ""].filter(Boolean).join(" · ")}</span></span>
            <SongVote q={q} />
            <span className="muted small">{when ? when(i) : q.duration ? fmtTime(q.duration) : ""}</span>
          </button>
        );
      })}
    </div>
  );
}

/** "Beğendiklerim": every song and episode you liked, newest first. Like Spotify's Liked Songs it can't
 *  be deleted; a song leaves it when you un-like it. */
/** One song for the music taste: its name and artist, whatever address it plays from. */
export const songKey = (q: { title: string; artist?: string }) => filmKey({ title: q.title + " | " + (q.artist ?? "") });
function LikedView() {
  useMusic();
  const all = loadLikes();
  const [kind, setKind] = useState<"songs" | "pods">("songs");
  const songs = all.filter((x) => !x.q.podcast).map((x) => x.q);
  const pods = all.filter((x) => x.q.podcast).map((x) => x.q);
  const list = kind === "songs" ? songs : pods;
  return (
    <>
      <section className="mu-liked-head">
        <div className="mu-liked-art"><Icon d={HEART} size={54} fill /></div>
        <div className="mu-liked-txt">
          <span className="eyebrow">{tt("LİSTE")}</span>
          <h1>{tt("Beğendiklerim")}</h1>
          <span className="muted">{tt("{0} şarkı · {1} podcast bölümü", songs.length, pods.length)}</span>
          <div className="seg-row">
            <button className="primary" disabled={!songs.length} onClick={() => playQueue(songs)}><Icon d={I.play} fill size={16} />  {tt("Çal")}</button>
            <button className="chip" disabled={!songs.length} onClick={() => playQueue(songs, 0, true)}><Icon d={SHUFFLE} size={14} />  {tt("Karışık")}</button>
          </div>
        </div>
      </section>
      {kind === "songs" && <section className="la mu-taste"><TastePanel kind="music" open={false} /></section>}
      <div className="seg-row mu-liked-tabs">
        <button className={"seg sm" + (kind === "songs" ? " on" : "")} onClick={() => setKind("songs")}>{tt("Şarkılar")} {songs.length || ""}</button>
        <button className={"seg sm" + (kind === "pods" ? " on" : "")} onClick={() => setKind("pods")}>{tt("Podcast bölümleri")} {pods.length || ""}</button>
      </div>
      {list.length ? <QRows items={list} />
        : <div className="muted empty-note">{kind === "songs" ? tt("Henüz beğendiğin şarkı yok. Çalan şarkının yanındaki ♥'e ya da bir şarkıya sağ tıklayıp “Beğendiklerime ekle”ye bas.") : tt("Beğendiğin podcast bölümü yok. Bir bölüm çalarken ♥'e bas.")}</div>}
    </>
  );
}

/** "Geçmiş": what you listened to, day by day. */
function HistoryView() {
  useMusic();
  const h = loadHistory();
  const day = (t: number) => {
    const d = new Date(t), today = new Date();
    const y = new Date(); y.setDate(today.getDate() - 1);
    return d.toDateString() === today.toDateString() ? tt("Bugün") : d.toDateString() === y.toDateString() ? tt("Dün")
      : d.toLocaleDateString(lang() === "tr" ? "tr-TR" : "en-US", { weekday: "long", day: "numeric", month: "long" });
  };
  const groups: { day: string; items: Heard[] }[] = [];
  for (const x of h) { const d = day(x.at); if (groups[groups.length - 1]?.day !== d) groups.push({ day: d, items: [] }); groups[groups.length - 1].items.push(x); }
  const remove = (x: Heard) => { store.set("musicHistory", JSON.stringify(loadHistory().filter((y) => !(y.at === x.at && y.q.src === x.q.src)))); changed(); };
  if (!h.length) return <div className="muted empty-note">{tt("Dinleme geçmişin burada birikecek.")}</div>;
  return (
    <>
      <div className="row-head"><span className="muted small">{tt("{0} dinleme", h.length)}</span><span className="grow" />
        <button className="chip" onClick={() => { if (confirm(tt("Dinleme geçmişi silinsin mi? (Beğendiklerin ve listelerin kalır.)"))) { store.remove("musicHistory"); changed(); } }}>{tt("Geçmişi temizle")}</button></div>
      {groups.map((g) => (
        <section key={g.day} className="row mu-hist">
          <h3>{g.day}</h3>
          <QRows items={g.items.map((x) => x.q)} when={(i) => new Date(g.items[i].at).toLocaleTimeString(lang() === "tr" ? "tr-TR" : "en-US", { hour: "2-digit", minute: "2-digit" })}
            extra={(q) => { const x = g.items.find((y) => y.q === q)!; return [{ label: tt("Geçmişten kaldır"), danger: true, act: () => remove(x) }]; }} />
        </section>
      ))}
    </>
  );
}

// ---------- a small music panel for pages that hide the dock (the book reader) ----------
type MiniTab = "lists" | "recent" | "pods";
/** What's playing with its buttons, and your lists / recent songs / podcasts to start something
 *  without leaving the page. */
/** The volume as a small drop-down: a button with the level, a slider under it. */
function MiniVolume({ vol }: { vol: number }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const last = useRef(70);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    document.addEventListener("mousedown", away);
    window.addEventListener("keydown", esc, true);
    return () => { document.removeEventListener("mousedown", away); window.removeEventListener("keydown", esc, true); };
  }, [open]);
  const v = Math.round(Math.min(100, vol));
  return (
    <div className="mini-vol" ref={box}>
      <button className={"mu-ib" + (open ? " on" : "")} aria-label={tt("Ses düzeyi")} title={tt("Ses düzeyi")} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon d={I.vol} size={16} />{v === 0 && <span className="mu-mute" aria-hidden />}
      </button>
      {open && (
        <div className="mini-vol-pop" role="dialog" aria-label={tt("Ses düzeyi")}>
          <button className="mu-ib" aria-label={v > 0 ? tt("Sesi kapat") : tt("Sesi aç")} title={v > 0 ? tt("Sesi kapat") : tt("Sesi aç")}
            onClick={() => { if (v > 0) { last.current = v; setProp("volume", 0); } else setProp("volume", last.current || 70); }}>
            <Icon d={I.vol} size={15} />{v === 0 && <span className="mu-mute" aria-hidden />}
          </button>
          <input className="vol" type="range" min={0} max={100} value={v} aria-label={tt("Ses düzeyi")} onChange={(e) => setProp("volume", Number(e.target.value))} />
          <span className="mini-vol-n">{v}</span>
        </div>
      )}
    </div>
  );
}
export function MiniMusic() {
  const m = useMusic();
  const c = m.now;
  const [tab, setTab] = useState<MiniTab>(() => (store.get("miniMusicTab") as MiniTab) || "lists");
  const pick = (t: MiniTab) => { setTab(t); store.set("miniMusicTab", t); };
  const lists = useMusicPlaylists();
  const recent = Object.values(loadPlays()).sort((a, b) => b.at - a.at).slice(0, 15).map((x) => x.q);
  const pods = loadPodRecent();
  return (
    <div className="mini-mu">
      {c ? (
        <div className="mini-now">
          <Cover src={c.radio ? c.favicon : c.cover} name={c.album ?? c.title} size={52} radius={8} icon={c.radio ? RADIO_ICON : c.podcast ? MIC : NOTE} />
          <span className="mini-t"><b className="ellipsis">{c.title}</b><span className="muted small ellipsis">{m.loading ? tt("Yükleniyor…") : c.radio ? tt("Canlı radyo") : c.artist}</span></span>
          {!c.radio && <LikeBtn q={c} />}
          {!c.radio && <button className="mu-ib" aria-label={tt("Önceki")} onClick={() => prevTrack(0)}><Icon d={PREV} size={16} /></button>}
          <button className="mu-ib mini-pp" aria-label={m.paused ? tt("Çal") : tt("Duraklat")} onClick={() => toggleMusicPause()}>
            <Icon d={m.paused ? I.play : I.pause} fill size={16} /></button>
          {!c.radio && <button className="mu-ib" aria-label={tt("Sonraki")} onClick={() => nextTrack()}><Icon d={NEXT} size={16} /></button>}
          <MiniVolume vol={m.volume} />
        </div>
      ) : <div className="muted small mini-none">{tt("Şu an müzik çalmıyor. Aşağıdan bir şey seç:")}</div>}
      <div className="seg-row mini-tabs">
        <button className={"seg sm" + (tab === "lists" ? " on" : "")} onClick={() => pick("lists")}>{tt("Listelerim")}</button>
        <button className={"seg sm" + (tab === "recent" ? " on" : "")} onClick={() => pick("recent")}>{tt("Son dinlenenler")}</button>
        <button className={"seg sm" + (tab === "pods" ? " on" : "")} onClick={() => pick("pods")}>{tt("Podcast")}</button>
      </div>
      <div className="mini-list">
        {tab === "lists" && (lists.length ? lists.map((p) => (
          <button key={p.id} className={"mini-row" + (m.from === p.id ? " on" : "")} onClick={() => playQueue(p.items, 0, false, p.id)} {...hoverSong(p.items[0])}>
            <PlaylistArt p={p} size={36} radius={6} />
            <span className="mini-t"><b className="ellipsis">{p.name}</b><span className="muted small">{tt("{0} şarkı", p.items.length)}</span></span>
          </button>
        )) : <div className="muted small">{tt("Henüz listen yok.")}</div>)}
        {tab === "recent" && (recent.length ? recent.map((q, i) => (
          <button key={q.src} className={"mini-row" + (c?.src === q.src ? " on" : "")} onClick={() => playQueue(recent, i)} {...hoverSong(q)}
            onContextMenu={(e) => openMenu(e, playedMenu(q, () => playQueue(recent, i)))}>
            {c?.src === q.src && m.loading ? <span className="mini-spin"><span className="mu-spin sm" /></span> : <Cover src={q.cover} name={q.album ?? q.title} size={36} radius={6} icon={NOTE} />}
            <span className="mini-t"><b className="ellipsis">{q.title}</b><span className="muted small ellipsis">{q.artist}</span></span>
          </button>
        )) : <div className="muted small">{tt("Henüz bir şey dinlemedin.")}</div>)}
        {tab === "pods" && (pods.length ? pods.map(({ q }) => (
          <button key={q.src} className={"mini-row" + (c?.src === q.src ? " on" : "")} onClick={() => playEpisodeInShow(q)}
            onContextMenu={(e) => openMenu(e, podMenu(q))}>
            <Cover src={q.cover} name={q.artist ?? q.title} size={36} radius={6} icon={MIC} />
            <span className="mini-t"><b className="ellipsis">{q.title}</b><span className="muted small ellipsis">{q.artist}</span></span>
          </button>
        )) : <div className="muted small">{tt("Henüz podcast dinlemedin.")}</div>)}
      </div>
    </div>
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
  const hits = await invoke<YtHit[]>("yt_info", { url }).catch(() => [] as YtHit[]);
  if (!hits.length) return false;
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
  const [cancelled, setCancelled] = useState(false);
  useEffect(() => {
    let alive = true;
    spotifyList(url).then((l) => { if (!alive) return; setList(l); if (!l) setErr(tt("Bu listenin şarkıları okunamadı (gizli bir liste olabilir)")); })
      .catch((e) => { if (alive) { setList(null); setErr(String(e)); } });
    return () => { alive = false; };
  }, [url]);
  if (cancelled) return <div className="muted small">{tt("Liste aktarımı iptal edildi.")}</div>;
  if (list === undefined) return <div className="sp-wait"><span className="muted small pulse">{tt("Listedeki şarkılar okunuyor…")}</span><button className="chip sm" onClick={() => setCancelled(true)}>{tt("İptal")}</button></div>;
  if (!list) return <div className="plugin-msg small err">{err}</div>;
  return <div className="sp-in-chat"><SpotifyImport list={list} onDone={(id) => onDone(list.name, id)} onCancel={() => setCancelled(true)} /></div>;
}

function SpotifyImport({ list, onDone, onCancel }: { list: SpList; onDone: (id: string) => void; onCancel: () => void }) {
  // "Aramayı durdur": the songs not searched yet stay unmatched; the list can be made from what was found
  const stopped = useRef(false);
  const [halted, setHalted] = useState(false);
  const [rows, setRowsState] = useState<ShiftRow[]>(() => list.tracks.map((sp) => ({ sp, on: true })));
  const rowsRef = useRef(rows);
  const setRows = (f: (r: ShiftRow[]) => ShiftRow[]) => setRowsState((r) => (rowsRef.current = f(r)));
  const upd = (i: number, p: Partial<ShiftRow>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const [moreLeft, setMoreLeft] = useState(list.more?.length ?? 0);
  useEffect(() => {
    let alive = true, next = 0, reading = !!list.more?.length;
    const worker = async () => {
      while (alive && !stopped.current) {
        if (next < rowsRef.current.length) {
          const i = next++;
          const sp = rowsRef.current[i].sp;
          const hits = await shiftSearch(sp, 3);
          // a box the user unticked while this was searching stays unticked
          if (alive) setRows((r) => r.map((x, j) => (j === i ? { ...x, hit: hits.length ? bestHit(hits, sp.duration) : null, on: hits.length > 0 && x.on } : x)));
        } else if (reading) await new Promise((r) => setTimeout(r, 300));
        else break;
      }
    };
    // the songs after the first 100: read in small batches, added in the list's order
    const readMore = async () => {
      const ids = list.more ?? [];
      try {
        for (let k = 0; alive && !stopped.current && k < ids.length; k += 6) {
          // one song that can't be read is skipped, not the end of the move
          const got = await Promise.all(ids.slice(k, k + 6).map((id) => spotifyTrack(id).catch(() => null)));
          if (!alive) return;
          setRows((r) => [...r, ...got.filter(Boolean).map((sp) => ({ sp: sp!, on: true }))]);
          setMoreLeft(Math.max(0, ids.length - k - 6));
        }
      } finally {
        reading = false;
        if (alive) setMoreLeft(0);
      }
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
  const searching = !halted && (moreLeft > 0 || searched < rows.length);
  const halt = () => { stopped.current = true; setHalted(true); setMoreLeft(0); setRows((r) => r.map((x) => (x.hit === undefined ? { ...x, hit: null, on: false } : x))); };
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
        <button className="chip" onClick={() => { stopped.current = true; onCancel(); }}>{tt("İptal")}</button>
        {searching && <button className="chip" onClick={halt}>{tt("Aramayı durdur")}</button>}
        {!searching && missing.length > 0 && <button className="chip" onClick={goMissing}>{tt("Bulunamayan şarkıya git ({0})", missing.length)}</button>}
        <button className="primary" disabled={searching || !chosen.length} onClick={save}>
          {searching ? tt("Aranıyor…") : tt("Devam · {0} şarkıyla “{1}” listesini oluştur", chosen.length, list.name)}</button>
      </div>
    </>
  );
}

export function MusicLinkDialog({ onClose, initial }: { onClose: () => void; initial?: string }) {
  const [v, setV] = useState(initial ?? "");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [choices, setChoices] = useState<{ q: string; hits: YtHit[] } | null>(null);
  const [list, setList] = useState<SpList | null>(null);
  // an answer that comes after the window was closed (or after a newer try) does nothing
  const run = useRef(0);
  useEffect(() => () => { run.current = -1; }, []);
  const go = async () => {
    const t = v.trim();
    if (!t) return;
    const my = ++run.current;
    const stale = () => run.current !== my;
    setErr(""); setChoices(null); setList(null);
    try {
      if (/open\.spotify\.com\/(intl-[a-z-]+\/)?(playlist|album)\//i.test(t)) {
        setBusy(tt("Listedeki şarkılar okunuyor…"));
        const l = await spotifyList(/^https?:/.test(t) ? t : "https://" + t);
        if (stale()) return;
        if (!l) throw new Error(tt("Bu listenin şarkıları okunamadı (gizli bir liste olabilir)"));
        setList(l);
        return;
      }
      if (isYouTube(t)) {
        setBusy(tt("Bağlantı okunuyor…"));
        const l = await invoke<YtHit[]>("yt_info", { url: /^https?:/.test(t) ? t : "https://" + t });
        if (stale()) return;
        if (!l.length) throw new Error(tt("Bu bağlantıda çalınacak bir şey yok"));
        playQueue(l.map(ytItem)); onClose(); return;
      }
      if (AUDIO_URL.test(t)) { playQueue([{ src: t, title: decodeURIComponent(t.split("/").pop()!.split("?")[0]) }]); onClose(); return; }
      let q = t;
      if (/^https?:\/\//i.test(t)) {
        setBusy(tt("Bağlantı okunuyor…"));
        const pod = await podcastFromLink(t).catch(() => null);
        if (stale()) return;
        if (pod) { followPodcast(pod); onClose(); goMusicPage?.("podcast"); return; }
        setBusy(tt("Şarkı bilgisi okunuyor…"));
        const found = await pageQuery(t).catch(() => null);
        if (stale()) return;
        if (!found) {
          // a radio stream or another direct address: just play it
          playQueue([{ src: t, title: t.replace(/^https?:\/\//, ""), radio: true }]); onClose(); return;
        }
        q = found;
      }
      setBusy(tt("YouTube'da aranıyor…"));
      const hits = await invoke<YtHit[]>("yt_search", { query: q, n: 6 });
      if (stale()) return;
      if (!hits.length) throw new Error(tt("YouTube'da bulunamadı: {0}", q));
      setChoices({ q, hits });
    } catch (e) { if (!stale()) setErr(String(e).replace(/^Error: /, "")); } finally { if (!stale()) setBusy(""); }
  };
  // a link given from outside (a copied link's "İçe aktar") is opened right away
  useEffect(() => { if (initial) go(); }, []);
  return createPortal(
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={"modal wide mu-link" + (list ? " shifting" : "")}>
        <h2>{tt("Müzik bağlantısı")}</h2>
        <div className="muted small">{tt("YouTube linki, Spotify / Apple Music şarkı ya da albüm linki, bir yayın adresi ya da sadece şarkının adı.")}</div>
        <form className="addon-add" onSubmit={(e) => { e.preventDefault(); go(); }}>
          <input autoFocus value={v} onChange={(e) => setV(e.target.value)} placeholder={tt("https://… ya da şarkı adı")} />
          <button className="primary sm" disabled={!v.trim() || !!busy}>{tt("Aç")}</button>
        </form>
        {busy && <div className="sp-wait"><span className="muted small pulse">{busy}</span><button className="chip sm" onClick={() => { run.current++; setBusy(""); }}>{tt("İptal")}</button></div>}
        {err && <div className="plugin-msg small err">{err}</div>}
        {list && <SpotifyImport key={list.name + list.tracks.length} list={list} onDone={(id) => { onClose(); openPlaylist?.(id); }} onCancel={() => setList(null)} />}
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
  // a live take and the studio one differ in album and length, so they don't share lyrics
  const k = `${q.artist}|${q.title}|${q.album ?? ""}|${Math.round(q.duration ?? 0)}`;
  if (lyricsMem.has(k)) return lyricsMem.get(k)!;
  let failed = 0;
  const p = new URLSearchParams({ track_name: q.title, artist_name: q.artist ?? "" });
  if (q.album) p.set("album_name", q.album);
  if (q.duration) p.set("duration", String(Math.round(q.duration)));
  let r: any = await getJson("https://lrclib.net/api/get?" + p).catch(() => { failed++; return null; });
  if (!r?.syncedLyrics && !r?.plainLyrics) {
    const l: any[] = await getJson("https://lrclib.net/api/search?" + new URLSearchParams({ track_name: q.title, artist_name: q.artist ?? "" })).catch(() => { failed++; return []; });
    r = l?.find((x) => x.syncedLyrics) ?? l?.[0];
  }
  const synced: Line[] = [];
  for (const line of String(r?.syncedLyrics ?? "").split(/\r?\n/)) {
    // a repeated line may carry several times: [00:10.00][00:30.00]Chorus
    const tags = line.match(/^(\[\d+:\d+(?:\.\d+)?\])+/);
    if (!tags) continue;
    const text = line.slice(tags[0].length).trim();
    for (const t of tags[0].matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)) synced.push({ t: +t[1] * 60 + +t[2], text });
  }
  synced.sort((a, b) => a.t - b.t);
  const out = synced.length || r?.plainLyrics ? { synced, plain: String(r?.plainLyrics ?? "") } : null;
  // "no lyrics" is remembered; a dropped connection is not, so the next try asks again
  if (out || !failed) lyricsMem.set(k, out);
  return out;
}

// ---------- mini player (bottom of every page while music plays) ----------
type MP = Pick<MpvState, "time" | "duration" | "paused" | "eof" | "title" | "volume" | "path">;
export function MusicDock({ mp }: { mp: MP }) {
  const m = useMusic();
  const c = m.now;
  // the end of a song: the next one (or the same, on repeat one)
  useEffect(() => { if (!P.loading && P.paused !== mp.paused) { P.paused = mp.paused; changed(); } }, [mp.paused, m.loading]);
  useEffect(() => { if (P.volume !== mp.volume) { P.volume = mp.volume; changed(); } }, [mp.volume]);
  useEffect(() => { if (c && !c.radio) musicTime = mp.time; }, [Math.floor(mp.time)]);
  const endedFor = useRef<string | null>(null);
  const lastVol = useRef(70);
  // mpv may report a YouTube song by the media address yt-dlp resolved, not the page link
  const isNow = (path: string | null) => !!c && !!path && (path === c.src || (!!c.yt && /googlevideo\.com/i.test(path)));
  useEffect(() => {
    if (!c || c.radio) return;
    if (mp.eof && isNow(mp.path) && endedFor.current !== c.src + m.index) { endedFor.current = c.src + m.index; nextTrack(true); }
    if (!mp.eof) endedFor.current = null;
  }, [mp.eof, mp.path]);
  useEffect(() => {
    if (!c || (!c.podcast&&!c.book) || mp.path!==c.src || P.loading) return;
    const position=storedAudioPosition(mp.time,mp.duration);
    if(position!==null)store.set((c.podcast?"podPos:":"audioPos:")+c.src,String(position));
  }, [Math.floor(mp.time / 5), c?.src,mp.path,mp.duration,m.loading]);
  // keys while music plays: Space = pause, Ctrl+→/← = next/previous
  useEffect(() => {
    if (!c) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable) return;
      if (e.key === " ") { e.preventDefault(); if (!e.repeat) toggleMusicPause(); } // held down: once
      else if (e.ctrlKey && e.key === "ArrowRight") { e.preventDefault(); nextTrack(); }
      else if (e.ctrlKey && e.key === "ArrowLeft") { e.preventDefault(); prevTrack(mp.time); }
      else if (e.key === "Escape" && m.view) setView(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [c?.src, mp.time, m.view]);
  // the mouse back button (and Alt+←) closes the big player first
  useEffect(() => {
    if (!m.view) return;
    const back = (e: Event) => { e.preventDefault(); setView(false); };
    window.addEventListener("luna-back", back);
    return () => window.removeEventListener("luna-back", back);
  }, [m.view]);
  if (!c) return null;
  // radio: the station sends what's on air as the stream title
  const onAir = c.radio && mp.title && mp.title !== c.src && !/^https?:/.test(mp.title) ? mp.title : null;
  return (
    <>
      <div className="mu-dock">
        {/* the song and its heart share the first column (a heart of its own pushed the volume out of the bar) */}
        <div className="mu-dock-left">
        <button className="mu-dock-now" onClick={() => setView(true)} title={tt("Şimdi çalıyor")}
          onContextMenu={(e) => { if (!c.radio) openMenu(e, songActions(c, () => pauseMusic(false))); }}>
          <Cover src={c.radio ? c.favicon : c.cover} name={c.album ?? c.title} size={48} radius={8} icon={c.radio ? RADIO_ICON : NOTE} />
          <span className="mu-dock-txt"><b className="ellipsis">{onAir ?? c.title}</b><span className="muted small ellipsis">{m.loading ? <span className="mu-loading-t">{tt("Yükleniyor…")}</span> : c.radio ? (onAir ? c.title : c.artist) : [c.artist, c.album].filter(Boolean).join(" · ")}</span></span>
        </button>
        {!c.radio && <LikeBtn q={c} />}
        </div>
        <div className="mu-dock-mid">
          <div className="mu-ctl">
            {!c.radio && <button className={"mu-ib" + (m.shuffle ? " on" : "")} aria-label={tt("Karışık")} title={tt("Karışık")}
              onClick={() => setShuffle(!m.shuffle)}><Icon d={SHUFFLE} size={16} /></button>}
            {!c.radio && <button className="mu-ib" aria-label={tt("Önceki")} onClick={() => prevTrack(mp.time)}><Icon d={PREV} fill size={18} /></button>}
            <button className={"mu-play" + (m.loading ? " loading" : "")} aria-label={m.loading ? tt("Yükleniyor…") : mp.paused ? tt("Oynat") : tt("Duraklat")} onClick={() => toggleMusicPause()}>
              {m.loading ? <span className="mu-spin" aria-hidden="true" /> : <Icon d={mp.paused ? I.play : I.pause} fill size={18} />}</button>
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
          {!c.radio && <button className={"mu-ib mu-ly" + (m.view ? " on" : "")} aria-label={tt("Sözler")} title={tt("Sözler")} onClick={() => setView(!m.view)}><Icon d={LYRICS} size={17} /></button>}
          <button className="mu-ib" aria-label={mp.volume > 0 ? tt("Sesi kapat") : tt("Sesi aç")} title={mp.volume > 0 ? tt("Sesi kapat") : tt("Sesi aç")}
            onClick={() => { if (mp.volume > 0) { lastVol.current = mp.volume; setProp("volume", 0); } else setProp("volume", lastVol.current || 70); }}><Icon d={mp.volume === 0 ? I.mute : I.vol} size={16} /></button>
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
  // arrows seek 5 s (Shift 15 s), Page Up/Down 30 s, Home the start; Ctrl/Alt/Meta combinations stay with next/previous song and back
  const key = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.altKey || e.metaKey || !mp.duration) return;
    if (e.key === "Home") { e.preventDefault(); e.stopPropagation(); mpv("seek", 0, "absolute"); return; }
    const d = seekKeyDelta(e.key, e.shiftKey);
    if (d == null) return;
    e.preventDefault(); e.stopPropagation();
    mpv("seek", d, "relative");
  };
  return (
    <div className={"mu-seek" + (big ? " big" : "")}>
      <span>{fmtTime(mp.time)}</span>
      <div className="mu-bar" role="slider" tabIndex={0} aria-label={tt("Çalma konumu")} aria-valuemin={0} aria-valuemax={Math.max(0, Math.round(mp.duration))}
        aria-valuenow={Math.max(0, Math.round(mp.time))} aria-valuetext={`${fmtTime(mp.time)} / ${fmtTime(mp.duration)}`}
        onPointerDown={go} onPointerMove={go} onKeyDown={key}><BarMarks duration={mp.duration} /><div style={{ width: f * 100 + "%" }} /></div>
      <span>{fmtTime(mp.duration)}</span>
    </div>
  );
}

function NowPlaying({ mp, onAir }: { mp: MP; onAir: string | null }) {
  const m = useMusic();
  const c = m.now!;
  const lastVol = useRef(70);
  const [tab, setTab] = useState<"lyrics" | "queue">("lyrics");
  const [queueQuery,setQueueQuery]=useState("");
  const [ly, setLy] = useState<{ synced: Line[]; plain: string } | null | undefined>(undefined);
  const [epAbout, setEpAbout] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (!c.podcast) return;
    if (c.about) { setEpAbout(c.about); return; }
    let alive = true;
    setEpAbout(undefined);
    episodes(c.podcast).then((d) => alive && setEpAbout(d.eps.find((e) => e.src === c.src)?.about || null)).catch(() => alive && setEpAbout(null));
    return () => { alive = false; };
  }, [c.src]);
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
            <button className={"seg sm" + (tab === "lyrics" ? " on" : "")} onClick={() => setTab("lyrics")}>{c.podcast ? tt("Bölüm hakkında") : tt("Sözler")}</button>
            <button className={"seg sm" + (tab === "queue" ? " on" : "")} onClick={() => setTab("queue")}>{tt("Sıradakiler")}</button>
          </div>
        )}
        {!c.radio && !c.podcast && !c.book && <button className="chip mu-np-like" title={tt("Asistan bu şarkıya benzeyen şarkıları bulur; istersen bir listeni onlarla genişletir ya da yeni liste yapar")} onClick={() => askAssistant(likeThisSongs(c.title, c.artist, loadMusicPlaylists().find((p) => p.id === m.from)?.name), tt("“{0}” gibi şarkılar bul", c.title))}>✦ {tt("Bunun gibi şarkılar bul")}</button>}
        {(c.podcast||c.book)&&<button className="chip" onClick={()=>{store.set((c.podcast?"podPos:":"audioPos:")+c.src,"0");loadCurrent();}} title={extraText("Bu bölümdeki dinleme konumunu sıfırla","Reset listening position for this chapter")}>{extraText("Bölümü baştan dinle","Restart this chapter")}</button>}
        {!c.radio && <MusicSoundButton />}
        <button className="round" aria-label={tt("Asistana sor")} title={tt("Asistana sor")} onClick={openAssistant}>
          <Icon d={I.chat} size={19} />
        </button>
      </div>
      <div className="mu-np-body">
        <div className="mu-np-left">
          <Cover src={c.radio ? c.favicon : c.cover} name={c.album ?? c.title} size="min(400px, 38vh)" radius={20} icon={c.radio ? RADIO_ICON : NOTE} />
          <div className="mu-np-title">
            {!c.radio && <span className="mu-np-votes"><LikeBtn q={c} big />
              {!c.podcast && <button className={"mu-ib mu-dis big" + (isDisliked(c.src) ? " on" : "")} aria-pressed={isDisliked(c.src)}
                aria-label={isDisliked(c.src) ? tt("Beğenmediklerimden çıkar") : tt("Beğenmedim")} title={isDisliked(c.src) ? tt("Beğenmediklerimden çıkar") : tt("Beğenmedim")}
                onClick={(e) => { if (toggleDislike(c)) askSongRating(c, e.currentTarget); }}><Icon d={THUMB_DOWN} size={20} />{isDisliked(c.src) && songRating(c.src) ? <span className="vote-n">{songRating(c.src)}</span> : null}</button>}</span>}
            <h1>{onAir ?? c.title}</h1>
            <div className="muted">{c.radio ? c.title : [c.artist, c.album].filter(Boolean).join(" · ")}</div>
            {/* a liked song: what made it — the music taste learns from this, apart from films and books */}
            {!c.radio && !c.podcast && !c.book && (isLiked(c.src) || isDisliked(c.src)) && <ReasonPicker key={isLiked(c.src) ? "like" : "dislike"} kind="music" itemKey={songKey(c)} vote={isLiked(c.src) ? "like" : "dislike"} compact name={c.title + (c.artist ? " — " + c.artist : "")} />}
          </div>
        </div>
        <div className="mu-np-right" ref={box}>
          {c.radio ? <div className="muted">{tt("Canlı yayında şarkı sözü gösterilmiyor.")}</div>
            : c.book && tab === "lyrics" ? <div className="muted">{tt("Sesli kitap: bölümler “Sıradakiler” sekmesinde.")}</div>
            : c.podcast && tab === "lyrics" ? (
              <div className="pod-about">
                {c.date ? <div className="muted small">{new Date(c.date).toLocaleDateString(lang() === "tr" ? "tr-TR" : "en-US", { day: "numeric", month: "long", year: "numeric" })}</div> : null}
                <h3>{c.title}</h3>
                {epAbout === undefined ? <div className="muted pulse">{tt("Bölüm bilgisi getiriliyor…")}</div>
                  : epAbout ? <p>{epAbout}</p> : <div className="muted">{tt("Bu bölüm için açıklama yok.")}</div>}
                <PodcastExtras feed={c.podcast} src={c.src} time={mp.time} />
              </div>
            )
            : tab === "queue" ? (
              <div className="mu-queue">
                <div className="music-queue-tools">{!c.book&&!c.podcast&&!c.radio&&<SaveQueuePlaylist items={m.queue} lists={loadMusicPlaylists} save={saveMusicPlaylists}/>}<label><span>{extraText("Kuyrukta ara","Find in queue")}</span><input value={queueQuery} onChange={e=>setQueueQuery(e.target.value)} placeholder={extraText("Şarkı veya sanatçı…","Song or artist…")}/></label><div><small>{searchQueue(m.queue,queueQuery).length} / {m.queue.length}</small><button className="chip" disabled={m.index>=m.queue.length-1} onClick={()=>updateMusicQueue({kind:"trim"})}>{extraText("Sonrakileri temizle","Clear upcoming")}</button></div><p>{extraText("Düzenleme çalan parçayı kesmez. Sıra değişirse karışık çalma kapanır; kayıtlı listen değişmez.","Editing keeps the current track playing. Manual edits turn shuffle off; your saved playlist stays unchanged.")}</p></div>
                {searchQueue(m.queue,queueQuery).map(({q,index:i}) => (
                  <div className={"music-queue-row"+(i===m.index?" is-current":"")} key={i+q.src}>
                  <button className={"mu-song" + (i === m.index ? " on" : "")} aria-current={i===m.index?"true":undefined} onClick={() => { P.index = i; loadCurrent(); }}>
                    <span className="mu-n">{i === m.index ? <Icon d={NOTE} size={14} /> : i + 1}</span>
                    <span className="mu-song-t"><b className="ellipsis">{q.title}</b><span className="muted small ellipsis">{q.artist}</span></span>
                    <span className="muted small">{q.duration ? fmtTime(q.duration) : ""}</span>
                  </button><div className="music-queue-actions"><button disabled={i<=m.index+1} aria-label={extraText(q.title+" yukarı taşı","Move "+q.title+" up")} onClick={()=>updateMusicQueue({kind:"move",at:i,direction:-1})}>↑</button><button disabled={i<=m.index||i===m.queue.length-1} aria-label={extraText(q.title+" aşağı taşı","Move "+q.title+" down")} onClick={()=>updateMusicQueue({kind:"move",at:i,direction:1})}>↓</button><button disabled={i===m.index} aria-label={extraText(q.title+" kuyruktan kaldır","Remove "+q.title+" from queue")} onClick={()=>updateMusicQueue({kind:"remove",at:i})}>×</button></div></div>
                ))}
                {!searchQueue(m.queue,queueQuery).length&&<p className="muted">{extraText("Kuyrukta eşleşen parça yok.","No queue entries match.")}</p>}
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
          <button className="mu-play big" aria-label={mp.paused ? tt("Oynat") : tt("Duraklat")} onClick={() => toggleMusicPause()}><Icon d={mp.paused ? I.play : I.pause} fill size={24} /></button>
          {!c.radio && <button className="mu-ib" aria-label={tt("Sonraki")} onClick={() => nextTrack()}><Icon d={NEXT} fill size={22} /></button>}
          <div className="mu-np-vol">
            <button className="mu-ib" aria-label={mp.volume > 0 ? tt("Sesi kapat") : tt("Sesi aç")} title={mp.volume > 0 ? tt("Sesi kapat") : tt("Sesi aç")}
              onClick={() => { if (mp.volume > 0) { lastVol.current = mp.volume; setProp("volume", 0); } else setProp("volume", lastVol.current || 70); }}>
              <Icon d={I.vol} size={18} />{mp.volume === 0 && <span className="mu-mute" aria-hidden />}
            </button>
            <input className="vol" type="range" min={0} max={100} value={Math.min(100, mp.volume)} aria-label={tt("Ses düzeyi")} onChange={(e) => setProp("volume", Number(e.target.value))} />
            <span className="mu-np-volnum">{Math.round(Math.min(100, mp.volume))}</span>
          </div>
        </div>
      </div>
    </div>,
    document.querySelector(".root") ?? document.body,
  );
}
