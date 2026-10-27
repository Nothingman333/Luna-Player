import { appStorage as localStorage } from "./appStorage";
import { logDebug } from "./debugTelemetry";
import { extraText } from "./Extras";
import { cleanMusicIdentities } from "./musicIdentityModel";
import { SaveQueuePlaylist } from "./MusicPlaylistTools";
import { audioResume,playlistCollection,storedAudioPosition,validPlaylist } from "./musicWorkspaceModel";
import type { QueueEdit } from "./queueEditModel";
import { editMusicQueue,searchQueue } from "./queueEditModel";
import "./QueueTools.css";
// Müzik modu: the user's own music folders (albums, artists, songs), live radio, a mini player
// and a "now playing" screen with synced lyrics. Playback goes through the same mpv as video,
// with the picture track off.
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "./linkOpen";
import { useEffect,useRef,useState } from "react";
import { createPortal } from "react-dom";
import "./BookMusic.css";
import { filmKey } from "./filmReviewModel";
import { lang,tt } from "./i18n";
import { store } from "./library";
import { collectEntry } from "./Mine";
import { fmtTime,mpv,MpvState,setProp } from "./mpv";
import { restoreIndex,seekKeyDelta } from "./musicModel";
import { convertFileSrc,invoke } from "./nativeCore";
import { BarMarks,MusicSoundButton } from "./PlaybackExtras";
import { PodcastExtras } from "./PodcastExtras";
import { I,Icon,MenuEntry,openMenu } from "./Screens";
import { askAssistant,openAssistant } from "./Taste";
import { ReasonPicker } from "./TastePanel";

// ---------- library ----------
export type Track = {
  path: string; title: string; artist: string; album: string; albumArtist: string;
  track?: number; disc?: number; year?: number; genre?: string; duration: number; cover?: string | null;
  /** not a file: a song from a Luna list or one played from a link (YouTube through yt-dlp) */
  online?: boolean; yt?: boolean; page?: string;
};
export type Album = { key: string; title: string; artist: string; year?: number; cover?: string | null; tracks: Track[] };

export function applyMusicIdentities(tracks:Track[]):Track[]{const identities=cleanMusicIdentities(store.json("musicIdentities",{}));return tracks.map(t=>{const id=identities[t.path];return id?{...t,title:id.title,artist:id.artist,albumArtist:id.artist,...(id.album?{album:id.album}:{})}:t;});}
export const albumKey = (t: Track) => (t.albumArtist || t.artist).toLowerCase() + "|" + t.album.toLowerCase();
export const loadMusicFolders = () => store.json<string[]>("musicFolders", []);
export let libCache: { sig: string; tracks: Track[] } | null = null;
export const libSubs = new Set<() => void>();

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
  if (libCache?.sig === f.join("|")) return applyMusicIdentities(libCache.tracks);
  // a failed scan isn't kept as an empty library: the next ask scans again
  let ok = true;
  const tracks = f.length ? await invoke<Track[]>("music_scan", { folders: f }).catch(() => { ok = false; return [] as Track[]; }) : [];
  if (ok) libCache = { sig: f.join("|"), tracks:applyMusicIdentities(tracks) };
  return applyMusicIdentities(tracks);
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
export type QItem = { server?: {profile:number;id:string;kind:string;track?:number}; src: string; title: string; artist?: string; album?: string; albumKey?: string; cover?: string | null; duration?: number; radio?: boolean; favicon?: string;
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
export const P = {
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
export const changed = () => {const signature=JSON.stringify([P.queue.length,P.index,P.paused,P.repeat,P.shuffle]);if(signature!==debugQueueSignature){debugQueueSignature=signature;logDebug("player","Music queue",{count:P.queue.length,index:P.index,paused:P.paused,repeat:P.repeat,shuffle:P.shuffle});}subs.forEach((f) => f());};
let loadGeneration = 0;
let wantsPlayback = true;
let selectionResume: {src:string;time:number}|null=null;
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
export type Heard = { q: QItem; at: number };
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
export function prefetch(c?: QItem, max = 99) {
  if ((!c?.yt && !c?.server) || !c.src || resolving.has(c.src) || (direct.get(c.src)?.exp ?? 0) > Date.now() || resolving.size >= max) return;
  const src = c.src;
  resolving.set(src, (c.server ? invoke<{url:string;ua?:string|null}>("source_stream",c.server) : invoke<{ url: string; ua?: string | null }>("yt_stream", { url: src.replace(/^ytdl:\/\//, "") }))
    .then((r) => {
      // YouTube's addresses carry when they stop working
      const exp = Number(new URL(r.url).searchParams.get("expire")) * 1000 || Date.now() + 3600e3;
      direct.set(src, { ...r, exp: exp - 10 * 60e3 });
    })
    .catch(() => {})
    .finally(() => { resolving.delete(src); void prepareGapless(); }));
}
/** Resting the mouse on a song starts finding it, so a click plays at once (a few at a time). */
let hoverTimer: ReturnType<typeof setTimeout> | undefined;
export const hoverSong = (c?: QItem) => ({
  onMouseEnter: () => { clearTimeout(hoverTimer); hoverTimer = setTimeout(() => prefetch(c, 4), 120); },
  onMouseLeave: () => clearTimeout(hoverTimer),
});
// Only local songs are preloaded. Podcasts, radio and expiring URLs retain their resume/resolver path.
type GaplessPlan = { entry: number; item: QItem; generation: number; revision: number };
let gaplessPlan: GaplessPlan | null = null;
let gaplessRevision = 0;
const localSong = (q?: QItem) => !!q && !q.radio && !q.podcast && !q.book && !q.start && (!(q.yt||q.server) || (direct.get(q.src)?.exp??0)>Date.now());
const gaplessAddress = (q: QItem) => (q.yt||q.server) ? direct.get(q.src)!.url : q.src;
async function prepareGapless() {
  const revision = ++gaplessRevision, generation = loadGeneration;
  gaplessPlan = null;
  const current = P.queue[P.index];
  if (!localSong(current)) return;
  const next = P.repeat === "one" ? current : nextUp();
  try {
    const entry = await invoke<number | null>("music_queue_prepare", {current: gaplessAddress(current), next: localSong(next) ? gaplessAddress(next!) : null, nextAgent: (next?.yt||next?.server) ? (direct.get(next.src)?.ua??null) : null});
    if (revision !== gaplessRevision || generation !== loadGeneration || P.queue[P.index] !== current || entry == null || !next) return;
    markMusicPath(next.src); markMusicPath(gaplessAddress(next));
    gaplessPlan = {entry, item: next, generation, revision};
  } catch { /* missing media: the normal next-track failure path remains available */ }
}
function invalidateGapless() { gaplessRevision++; gaplessPlan = null; }
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
listen("mpv-ready", () => invalidateGapless()).catch(() => {});
listen<any>("mpv", ({ payload }) => {
  if (payload.event === "start-file" && gaplessPlan && payload.playlist_entry_id === gaplessPlan.entry) {
    const plan = gaplessPlan; gaplessPlan = null;
    if (plan.generation === loadGeneration && plan.revision === gaplessRevision) {
      const next = P.repeat === "one" ? P.index : (P.index + 1 < P.queue.length ? P.index + 1 : 0);
      if (P.queue[next] === plan.item) {
        P.index = next; P.loading = true; musicTime = 0;
        recordCurrent(plan.item); changed();
      }
    }
  }
  if (payload.event === "playback-restart" && !gaplessPlan) void prepareGapless();
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
/** A path opened as a film is never music (undoes a wrong mark from the moment a song replaced it). */
export function unmarkMusicPath(p: string) { musicPaths.delete(p); }
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
  invalidateGapless();
  if (!preserveIntent) { selectionResume=null; wantsPlayback = true; P.paused = false; }
  const c = P.queue[P.index];
  if (!c) return;
  // a film on the shared player steps aside (it waits in the dock) before anything else: a YouTube song first waits
  // for its address, and in that time the film must already be parked, not taken for music
  try { beforeMusicTakeover?.(); } catch {}
  musicPaths.add(c.src);
  P.loading = true;
  // the audio only: no cover art as a "video", no window
  // a podcast episode carries on where it was left
  const resume = selectionResume?.src===c.src?selectionResume.time:audioResume(c.podcast?store.get("podPos:"+c.src):c.book?store.get("audioPos:"+c.src):0,c.duration);
  const d = (c.yt||c.server) ? direct.get(c.src) : undefined;
  const ready = !!d && d.exp > Date.now();
  // A YouTube song is always found by Luna first (its audio-only address) and then given to mpv:
  // left to mpv, a search ("ytdl://ytsearch1:") became a new entry that lost the audio-only
  // settings and fetched the 1080p video too. Being found already (the mouse rested on it): wait for that.
  if (!ready && (c.yt||c.server) && !findFailed.has(c.src)) {
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
  if(c.server&&!ready){P.loading=false;P.paused=true;setProp("pause",true);changed();window.dispatchEvent(new CustomEvent("luna-extra-error",{detail:tt("Medya sunucusuna ulaşılamadı. Kaynak ayarlarını kontrol edip parçayı yeniden seçin.")}));return;}
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
  selectionResume=null;
  mpv("loadfile", ready ? d!.url : c.src, "replace", "-1", opts.join(","));
  // a few seconds in, so finding the next one doesn't slow this one's start
  setTimeout(() => { if (P.queue[P.index] === c) prefetch(nextUp()); }, 4000);
  setProp("pause", !wantsPlayback);
  recordCurrent(c);
  changed();
}
function recordCurrent(c: QItem) {
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
  for(const c of P.queue)if(c.server)findFailed.delete(c.src);
  loadCurrent();
}
/** Shuffle on: the song playing keeps playing, the rest of the whole queue is mixed after it.
 *  Off: the order it was in comes back, at the same song. */
export function setShuffle(on: boolean) {
  invalidateGapless();
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
  void prepareGapless();
}
export function updateMusicQueue(action:QueueEdit){
 const next=editMusicQueue(P.queue,P.index,action);if(next.queue===P.queue)return;
 P.queue=next.queue;P.index=next.index;
 // A manually edited order becomes the new queue; toggling shuffle must not resurrect removed items.
 P.original=[];P.shuffle=false;P.from="";changed();void prepareGapless();
}
export function nextTrack(auto = false) {
  if (auto && gaplessPlan) return;
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
/** Called just before a song loads into the shared player, so the app can park a film that was playing. */
let beforeMusicTakeover: (() => void) | null = null;
export function onMusicTakeover(fn: (() => void) | null) { beforeMusicTakeover = fn; }
/** The song waiting while a film plays (for the dock's tabs), or null. */
export function suspendedSong(): { title: string; artist?: string; cover?: string | null } | null {
  const c = suspended?.queue[suspended.index];
  return c ? { title: c.title, artist: c.artist, cover: c.cover } : null;
}
/** Switch back to the waiting song and play it. */
export function playSuspendedMusic() {
  resumeSuspendedMusic();
  setTimeout(() => pauseMusic(false), 250);
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
  const d = (c.yt||c.server) ? direct.get(c.src) : undefined;
  const ready = !!d && d.exp > Date.now();
  if(c.server&&!ready){wantsPlayback=false;P.paused=true;selectionResume={src:c.src,time:s.time};loadCurrent(true);return;}
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
  selectionResume=null;
  const oldCurrent = P.queue[P.index];
  invalidateGapless();
  if (localSong(oldCurrent)) void invoke("music_queue_prepare", {current: gaplessAddress(oldCurrent), next: null, nextAgent: null}).catch(() => {});
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
const setRepeat = (r: Repeat) => { P.repeat = r; store.set("musicRepeat", r); changed(); void prepareGapless(); };
const setView = (v: boolean) => { P.view = v; changed(); };
export const trackItem = (t: Track): QItem => t.online
  ? { src: t.path, title: t.title, artist: t.artist, album: t.album || undefined, cover: t.cover, duration: t.duration, yt: t.yt, page: t.page }
  : { src: t.path, title: t.title, artist: t.artist, album: t.album, albumKey: albumKey(t), cover: t.cover, duration: t.duration };

// ---------- radio (radio-browser.info, a free open directory) ----------
export type Station = { stationuuid: string; name: string; url_resolved: string; favicon: string; tags: string; country: string; countrycode: string; codec: string; bitrate: number };
export async function getJson(url: string): Promise<any> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (r.ok) return await r.json();
  } catch { /* fall back to the native fetch below */ }
  return invoke("addon_get", { url });
}
const RADIO = "https://de1.api.radio-browser.info/json";
export async function stations(path: string): Promise<Station[]> {
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
export const stationItem = (s: Station): QItem => ({
  src: s.url_resolved, title: s.name.trim(), artist: [s.country, s.tags.split(",").slice(0, 2).join(", ")].filter(Boolean).join(" · "),
  radio: true, favicon: s.favicon || undefined,
});

// ---------- small pieces ----------
const hue = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; };
export function Cover({ src, name, size, radius = 12, icon }: { src?: string | null; name: string; size: number | string; radius?: number; icon?: string }) {
  const [bad, setBad] = useState(false);
  useEffect(() => setBad(false), [src]); // a new picture gets its own chance
  const url = src && !bad ? (/^https?:/.test(src) ? src : convertFileSrc(src)) : null;
  return (
    <div className="mu-cover" style={{ width: size, height: size, borderRadius: radius, background: url ? undefined : `hsl(${hue(name)} 32% 24%)` }}>
      {url ? <img src={url} alt="" loading="lazy" onError={() => setBad(true)} /> : <Icon d={icon ?? NOTE} size={typeof size === "number" ? Math.max(16, size / 4) : 32} />}
    </div>
  );
}
export const NOTE = "M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z";
const srcUrl = (src: string) => (/^https?:/.test(src) ? src : convertFileSrc(src));
/** A list's picture when it has none of its own: four of its songs' covers, else one of them under
 *  the list's name, else a colour made from the name (a plain grey square looked unfinished). */
export function PlaylistArt({ p, size, radius = 12 }: { p: MPlaylist; size: number | string; radius?: number }) {
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
export const RADIO_ICON = "M4 10h16v10H4zM8 10l9-6M8 15h.01M12 15h5";
export const SHUFFLE = "M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5";
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
export function useMusicPlaylists() {
  const [, bump] = useState(0);
  useEffect(() => { const f = () => bump((n) => n + 1); plSubs.add(f); return () => { plSubs.delete(f); }; }, []);
  return loadMusicPlaylists();
}
/** Opens a playlist's sheet (set while the music page is shown). */
export let openPlaylist: ((id: string) => void) | null = null;
/** A sheet to open once the library page (re)mounts: switching pages remounts the music page. */
export let pendingPl: string | null = null;
/** Opens a playlist's page from anywhere (the assistant): now if the music page is up, else when it comes up. */
export function showPlaylist(id: string) {
  if (openPlaylist) openPlaylist(id); else pendingPl = id;
}

/** Switches the music page (set while it is shown): a podcast link opens the podcast page. */
export let goMusicPage: ((v: MusicView) => void) | null = null;

export const ASK = "✦  ";
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
export const copy = (u: string) => { navigator.clipboard.writeText(u).catch(() => {}); };
/** A song's pages: where it plays from (YouTube) and where it came from (Spotify). */
const songLinks = (t: QItem): MenuEntry[] => [
  ...(/^https?:/.test(t.src) ? [{ label: tt("YouTube'da aç"), act: () => openUrl(t.src) }, { label: tt("YouTube bağlantısını kopyala"), act: () => copy(t.src) }] : []),
  ...(t.page ? [{ label: tt("Spotify'da aç"), act: () => openUrl(t.page!) }, { label: tt("Spotify bağlantısını kopyala"), act: () => copy(t.page!) }] : []),
];

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
export const playedMenu = (q: QItem, onPlay: () => void): MenuEntry[] =>
  songActions(q, onPlay, [{ label: tt("Listeden kaldır"), danger: true, act: () => forgetPlayed(q) }]);

// ---------- podcasts (Apple's free directory to find them; the shows' own RSS feeds to play them) ----------
export type Show = { feed: string; title: string; author: string; art?: string };
export type Episode = { src: string; title: string; date?: number; duration?: number; about?: string };
export const loadSubs = () => store.json<Show[]>("podcasts", []);
/** The last episode of each show you listened to (newest first). */
type PodRecent = { q: QItem; at: number };
export const loadPodRecent = () => store.json<PodRecent[]>("podRecent", []);
/** Right click on a recently played episode: play, its links, take it off the list. */
export function podMenu(q: QItem, onShow?: () => void): MenuEntry[] {
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
/** A show to open when the podcast page appears (from the home page or a link). */
export let pendingShow: Show | null = null;
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
export async function searchShows(q: string): Promise<Show[]> {
  const r = await getJson(`https://itunes.apple.com/search?media=podcast&limit=30&term=${encodeURIComponent(q)}`);
  return (r?.results ?? []).filter((x: any) => x.feedUrl).map((x: any) => ({ feed: x.feedUrl, title: x.collectionName, author: x.artistName, art: x.artworkUrl600 ?? x.artworkUrl100 }));
}
const durSecs = (d: string) => { const p = d.split(":").map(Number); return p.some(isNaN) ? undefined : p.reduce((n, x) => n * 60 + x, 0); };
export async function episodes(feed: string): Promise<{ show: Partial<Show>; eps: Episode[] }> {
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

export const epItem = (e: Episode, s: { title: string; feed: string }, art?: string | null): QItem =>
  ({ src: e.src, title: e.title, artist: s.title, album: s.title, cover: art, duration: e.duration, podcast: s.feed, about: e.about, date: e.date });
/** An episode from "recently played": the show's episodes are queued from it on (so "Up next" has the rest). */
export async function playEpisodeInShow(q: QItem) {
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
export const MIC = "M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3";
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

/** "Beğendiklerim": every song and episode you liked, newest first. Like Spotify's Liked Songs it can't
 *  be deleted; a song leaves it when you un-like it. */
/** One song for the music taste: its name and artist, whatever address it plays from. */
export const songKey = (q: { title: string; artist?: string }) => filmKey({ title: q.title + " | " + (q.artist ?? "") });

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
type SpList = { source?:"YouTube"|"Spotify"; name: string; by: string; url: string; cover?: string; tracks: QItem[]; total?: number; more?: string[] };
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

function SpotifyImport({ list, onDone, onCancel,onPlay }: { list: SpList; onDone: (id: string) => void; onCancel: () => void;onPlay?:()=>void }) {
  // "Aramayı durdur": the songs not searched yet stay unmatched; the list can be made from what was found
  const stopped = useRef(false);
  const [halted, setHalted] = useState(false);
  const [rows, setRowsState] = useState<ShiftRow[]>(() => list.tracks.map((sp) => ({ sp, hit:list.source==="YouTube"?{url:sp.src,title:sp.title,channel:sp.artist??"",thumb:sp.cover??undefined,duration:sp.duration}:undefined, on: true })));
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
          if(rowsRef.current[i].hit!==undefined)continue;
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
    saveMusicPlaylists([{ id, name: list.name, from: list.source??"Spotify", url: list.url, cover: list.cover, at: Date.now(), items }, ...loadMusicPlaylists()]);
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
      <div className={"sp-list"+(list.source==="YouTube"?" youtube-list":"")} ref={listRef}>
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
        {!searching&&chosen.length>0&&<button className="chip" onClick={()=>{playQueue(chosen.map(r=>ytItem(r.hit!)));if(onPlay)onPlay();else onCancel();}}>{extraText("Seçilenleri çal","Play selected")}</button>}
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
  const [importKind,setImportKind]=useState(false);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [choices, setChoices] = useState<{ q: string; hits: YtHit[] } | null>(null);
  const [list, setList] = useState<SpList | null>(null);
  // an answer that comes after the window was closed (or after a newer try) does nothing
  const run = useRef(0);
  useEffect(() => () => { run.current = -1; }, []);
  const go = async (kind?:"track"|"playlist") => {
    let t = v.trim();
    if(isYouTube(t)){const u=new URL(/^https?:/.test(t)?t:"https://"+t);if(u.searchParams.has("list")&&(u.searchParams.has("v")||u.hostname==="youtu.be")&&!kind){setImportKind(true);return;}if(kind==="track"){u.searchParams.delete("list");u.searchParams.delete("index");t=u.href;}}
    setImportKind(false);
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
      if (isYouTube(t) && new URL(/^https?:/.test(t)?t:"https://"+t).searchParams.has("list")) {
        setBusy(tt("Listedeki şarkılar okunuyor…"));
        const u=new URL(/^https?:/.test(t)?t:"https://"+t);const playlist="https://www.youtube.com/playlist?list="+encodeURIComponent(u.searchParams.get("list")!);
        const hits=await invoke<YtHit[]>("yt_info",{url:playlist});if(stale())return;
        if(!hits.length)throw Error(tt("Bu bağlantıda çalınacak bir şey yok"));
        setList({source:"YouTube",name:extraText("YouTube listesi","YouTube playlist"),by:hits[0].channel??"",url:playlist,cover:hits[0].thumb,tracks:hits.map(ytItem),total:hits.length});return;
      }
      if (isYouTube(t)) {
        setBusy(tt("Bağlantı okunuyor…"));
        const l = await invoke<YtHit[]>("yt_info", { url: /^https?:/.test(t) ? t : "https://" + t });
        if (stale()) return;
        if (!l.length) throw new Error(tt("Bu bağlantıda çalınacak bir şey yok"));
        setList({source:"YouTube",name:l[0].title,by:l[0].channel??"",url:t,cover:l[0].thumb,tracks:l.map(ytItem),total:l.length}); return;
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
        {importKind&&<div className="modal-actions"><button className="chip" onClick={()=>void go("track")}>{extraText("Yalnız bu parça","This track only")}</button><button className="primary" onClick={()=>void go("playlist")}>{extraText("Tüm playlist","Entire playlist")}</button></div>}
        {busy && <div className="sp-wait"><span className="muted small pulse">{busy}</span><button className="chip sm" onClick={() => { run.current++; setBusy(""); }}>{tt("İptal")}</button></div>}
        {err && <div className="plugin-msg small err">{err}</div>}
        {list && <SpotifyImport key={list.name + list.tracks.length} list={list} onDone={(_id) => { onClose(); }} onCancel={() => setList(null)} onPlay={onClose}/>}
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
export function MusicDock({ mp, switcher }: { mp: MP; switcher?: React.ReactNode }) {
  const m = useMusic();
  const c = m.now;
  // the end of a song: the next one (or the same, on repeat one)
  useEffect(() => { if (!P.loading && P.paused !== mp.paused) { P.paused = mp.paused; changed(); } }, [mp.paused, m.loading]);
  useEffect(() => { if (P.volume !== mp.volume) { P.volume = mp.volume; changed(); } }, [mp.volume]);
  useEffect(() => { if (c && !c.radio) musicTime = mp.time; }, [Math.floor(mp.time)]);
  const endedFor = useRef<string | null>(null);
  const lastVol = useRef(70);
  // mpv may report a YouTube song by the media address yt-dlp resolved, not the page link
  const isNow = (path: string | null) => !!c && !!path && (path === c.src || (!!c.server && path===direct.get(c.src)?.url) || (!!c.yt && /googlevideo\.com/i.test(path)));
  useEffect(() => {
    if (!c || c.radio) return;
    if (mp.eof && isNow(mp.path) && endedFor.current !== c.src + m.index) { endedFor.current = c.src + m.index; nextTrack(true); }
    if (!mp.eof) endedFor.current = null;
  }, [mp.eof, mp.path]);
  useEffect(() => {
    if (!c || (!c.podcast&&!c.book) || !isNow(mp.path) || P.loading) return;
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
          <span className="mu-dock-txt"><b className="ellipsis">{onAir ?? c.title}</b><span className="muted small ellipsis">{m.loading ? <span className="mu-loading-t">{tt("Yükleniyor…")}</span> : c.radio ? (onAir ? c.title : c.artist) : [c.artist, c.album, mp.duration > 0 ? `${fmtTime(mp.time)} / ${fmtTime(mp.duration)}` : ""].filter(Boolean).join(" · ")}</span></span>
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
          {switcher}
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
          <div className="mu-np-art"><Cover src={c.radio ? c.favicon : c.cover} name={c.album ?? c.title} size="100%" radius={20} icon={c.radio ? RADIO_ICON : NOTE} /></div>
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
export function setSplit_libCache<T extends typeof libCache>(value:T):T{libCache=value;return value;}
export function setSplit_goMusicPage<T extends typeof goMusicPage>(value:T):T{goMusicPage=value;return value;}
export function setSplit_pendingPl<T extends typeof pendingPl>(value:T):T{pendingPl=value;return value;}
export function setSplit_openPlaylist<T extends typeof openPlaylist>(value:T):T{openPlaylist=value;return value;}
export function setSplit_pendingShow<T extends typeof pendingShow>(value:T):T{pendingShow=value;return value;}
