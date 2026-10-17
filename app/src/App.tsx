import { defaultSubLangs, tt } from "./i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import { applySubOpts, fmtTime, isImageSub, isPgs, loadSubOpts, mpv, setProp, useMpv } from "./mpv";
import { listen } from "@tauri-apps/api/event";
import { customMeta, details, isRemote, torrentSrc, pinFile, relinkFile, isFinished, setFinished, nearEnd, Episode, Item, loadRecent, parseName, Recent, store, useLibrary } from "./library";
import { SubtitleDialog } from "./Subtitles";
import { Added, DownloadPanel, Downloads, DownloadsSection, downloadDir, RemoveMode, isOpenableLink, isTorrentSource, TorrentDialog, TorrentLoader, useTorrents } from "./Torrent";
import {
  Actions, Browse, CardMenu, Confirm, Details, Folders, Header, Home, I, Icon, MenuEntry, pct, Rematch,
  Settings, Target, View, MissingPanel,
} from "./Screens";
import SubTimeline from "./SubTimeline";
import { ChatPanel, diaryGet, diarySet, migrateDiary, RecsPage } from "./Taste";
import { WebResults } from "./Web";
import { pushSubs, UpscalerSettings } from "./Upscaler";

/** Draw subtitles in a separate capture-free window while the Upscaler runs (experimental, off). */
const SUBS_LAYER = false;
import { applyVideoSet, ContextMenu, loadVideoSet, TracksPanel, VideoPanel } from "./PlayerMenu";

/** Per-video dub/subtitle choice: track ids, an external subtitle file, or subtitles off. */
type TrackPref = { aid?: number; sid?: number | "no"; sidExt?: string };
import { Tour, tourSeen } from "./Tour";
import "./App.css";

const VIDEO_EXT = ["mkv", "mp4", "avi", "mov", "wmv", "webm", "m4v", "ts", "flv", "mpg", "mpeg"];
const SUB_EXT = ["srt", "ass", "ssa", "vtt", "sub"];
const ext = (p: string) => p.split(".").pop()?.toLowerCase() ?? "";

type Toast = { text: string; kind: "ok" | "info" | "warn" } | null;

export default function App() {
  const [recent, setRecent] = useState<Recent[]>(loadRecent);
  const lib = useLibrary(recent.map((r) => r.path));
  const [toast, setToast] = useState<Toast>(null);
  const [showSync, setShowSync] = useState(false);
  const [showTracks, setShowTracks] = useState(false);
  const [showUp, setShowUp] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [showUi, setShowUi] = useState(true);
  const [settings, setSettings] = useState(false);
  const [tour, setTour] = useState(() => !tourSeen());
  const [detailsKey, setDetailsKey] = useState<string | null>(null);
  const [cues, setCues] = useState<[number, number][]>([]);
  const tracksRef = useRef<any[]>([]);
  const pathRef = useRef<string | null>(null);
  const fromStart = useRef(false);

  const flash = (text: string, kind: "ok" | "info" | "warn" = "info", ms = 4000) => {
    setToast({ text, kind });
    if (ms) setTimeout(() => setToast((t) => (t?.text === text ? null : t)), ms);
  };

  const [subDlg, setSubDlg] = useState<string | null>(null);
  const [showVset, setShowVset] = useState(false);
  // Keyboard lock: keys do nothing while watching (no accidental skips); the mouse keeps working.
  const [kbLock, setKbLock] = useState(false);
  // 3-2-1 then play (pressing again cancels).
  const [chat, setChat] = useState(false);
  // a title outside the library the chat is about (from the recommendation details)
  const [chatTopic, setChatTopic] = useState<Item | null>(null);
  // "How was it?" after a film is finished, shown once back in the library.
  const askRating = useRef<string | null>(null);
  const [rateFor, setRateFor] = useState<{ path: string; title: string; year?: string; genres?: string[] } | null>(null);
  useEffect(() => { migrateDiary(); }, []);
  // ---------- Upscaler (Lossless Scaling) ----------
  // The Upscaler never starts on by itself: it is switched on per video (UP menu or Q) and
  // switches off again when the player is left.
  const [upOn, setUpOn] = useState(() => { store.set("upscaler", "0"); return false; });
  const upActive = useRef(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const startCountdown = () => {
    if (countdown != null) { setCountdown(null); return; }
    setProp("pause", true);
    setCountdown(3);
  };
  useEffect(() => {
    if (countdown == null) return;
    if (countdown === 0) { setCountdown(null); setProp("pause", false); return; }
    const id = setTimeout(() => setCountdown((c) => (c == null ? null : c - 1)), 1000);
    return () => clearTimeout(id);
  }, [countdown]);
  const restoring = useRef(false);
  const [trackTick, setTrackTick] = useState(0);
  const streamMap = useRef<Record<string, string>>({});
  const [onTop, setOnTop] = useState(false);
  const [nextUp, setNextUp] = useState<{ path: string; title: string; count: number } | null>(null);

  const autoSubtitles = async (path: string) => {
    if (tracksRef.current.some((t) => t.type === "sub")) {
      store.set("hasSub:" + path, "1");
      return;
    }
    const key = store.get("osKey");
    if (!key) {
      flash(tt("Altyazı yok. Bulmak için S tuşuna ya da altyazı butonu › Altyazı ara'ya bas."), "warn", 7000);
      return;
    }
    flash(tt("Altyazı aranıyor…"), "info", 0);
    try {
      const p = parseName(path);
      const r: any = await invoke("find_subtitles", {
        path, apiKey: key, langs: store.get("langs") ?? defaultSubLangs(),
        query: { title: lib.itemFor(path)?.meta?.title ?? p.title, year: p.year, season: p.season, episode: p.episode },
      });
      if (pathRef.current !== path) return;
      await mpv("sub-add", r.file, "select");
      store.set("hasSub:" + path, "1");
      flash(tt("Altyazı bulundu · OpenSubtitles · {0}{1}", r.language.toUpperCase(), r.hashMatch ? tt(" · hash eşleşmesi") : ""), "ok", 6000);
    } catch (e) {
      flash(String(e), "warn", 7000);
    }
  };

  const sRaw = useMpv((name, ev) => {
    // Track lists arrive before "file-loaded": don't save mpv's defaults as the user's choice
    // until this video's saved choice has been restored.
    if (name === "start-file") restoring.current = true;
    if (name === "playback-restart" || (name === "end-file" && ev.reason === "error")) setTLoad(null);
    if (name === "end-file" && ev.reason === "error") {
      flash(tt("Bu dosya açılamadı: ") + (ev.file_error ?? "bilinmeyen hata"), "warn", 8000);
    }
    if (name === "file-loaded") {
      setNextUp(null);
      getCurrentWebview().setFocus();
      const p = pathRef.current;
      if (!p) return;
      const d = store.get("delay:" + p);
      setProp("sub-delay", d ? Number(d) : 0);
      const pos = loadRecent().find((r) => r.path === p);
      if (!fromStart.current && pos && pos.time > 10 && pos.time < pos.duration - 30)
        mpv("seek", pos.time, "absolute");
      fromStart.current = false;
      // Everything chosen for this video last time: picture, audio delay, dub and subtitle.
      applyVideoSet(loadVideoSet(p));
      setProp("audio-delay", Number(store.get("adelay:" + p) ?? 0));
      restoring.current = true;
      const pref = store.json<TrackPref | null>("trk:" + p, null);
      const ext = pref?.sidExt ?? store.get("extSub:" + p);
      setTimeout(() => {
        if (pathRef.current !== p) return;
        if (pref?.aid) setProp("aid", pref.aid);
        if (pref?.sid === "no") setProp("sid", "no");
        else if (ext) {
          const loaded = tracksRef.current.find((t) => t.type === "sub" && t["external-filename"] === ext);
          if (loaded) setProp("sid", loaded.id); else mpv("sub-add", ext, "select");
        } else if (typeof pref?.sid === "number") setProp("sid", pref.sid);
        // Look online only when nothing was chosen for this video before.
        if (!pref?.sid && !ext) setTimeout(() => autoSubtitles(p), 100);
        // From now on changes are the user's: save once right away (e.g. an auto-found subtitle).
        setTimeout(() => { restoring.current = false; setTrackTick((n) => n + 1); }, 1500);
      }, 350);
    }
  });

  // Torrent streams play from a local http URL; everything else (resume, per-video settings,
  // subtitles, library) uses the file being written on disk.
  const s = { ...sRaw, path: sRaw.path ? streamMap.current[sRaw.path] ?? sRaw.path : null };
  tracksRef.current = s.tracks;
  pathRef.current = s.path;
  const playing = !!s.path;

  // Remember the dub / subtitle picked for this video (only this one).
  useEffect(() => {
    const p = s.path;
    if (!p || restoring.current) return;
    const audio = s.tracks.find((t) => t.type === "audio" && t.selected);
    const subs = s.tracks.filter((t) => t.type === "sub");
    const sub = subs.find((t) => t.selected);
    const pref: TrackPref = { ...store.json<TrackPref>("trk:" + p, {}) };
    if (audio) pref.aid = audio.id;
    if (sub?.external && sub["external-filename"]) { pref.sidExt = sub["external-filename"]; delete pref.sid; }
    else if (sub) { pref.sid = sub.id; delete pref.sidExt; }
    else if (subs.length) { pref.sid = "no"; delete pref.sidExt; } // turned off on purpose
    store.set("trk:" + p, JSON.stringify(pref));
  }, [s.path, trackTick, JSON.stringify(s.tracks.map((t) => [t.id, t.type, t.selected]))]);
  useEffect(() => {
    if (s.path && !restoring.current) store.set("adelay:" + s.path, String(s.audioDelay ?? 0));
  }, [s.audioDelay]);

  // ---------- torrents ----------
  const [torrentDlg, setTorrentDlg] = useState(false);
  const [linkInit, setLinkInit] = useState<string | undefined>();
  // Like VLC: Ctrl+N opens a link; pasting a link anywhere (outside a text box) opens it too.
  useEffect(() => {
    const typing = (e: Event) => { const el = e.target as HTMLElement; return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable; };
    const onPaste = (e: ClipboardEvent) => {
      if (typing(e)) return;
      const txt = e.clipboardData?.getData("text")?.trim() ?? "";
      if (isOpenableLink(txt)) { e.preventDefault(); setLinkInit(txt); setTorrentDlg(true); }
    };
    const onKey = (e: KeyboardEvent) => { if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "n" && !typing(e)) { e.preventDefault(); setLinkInit(undefined); setTorrentDlg(true); } };
    window.addEventListener("paste", onPaste);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("paste", onPaste); window.removeEventListener("keydown", onKey); };
  }, []);
  const [tLoad, setTLoad] = useState<{ phase: "meta" | "buffer"; name: string; id?: number } | null>(null);
  const [tSources, setTSources] = useState<Record<number, string>>({});
  const [askStream, setAskStream] = useState<{ path: string; src: string; start: boolean } | null>(null);
  const [tLocal, setTLocal] = useState<Record<number, string>>({});
  const [dlPending, setDlPending] = useState<string[]>([]);
  const tCancel = useRef(0);
  const loadRef = useRef<(p: string, start?: boolean, confirmed?: boolean) => void>(() => {});
  // A torrent's file joins the library; a library entry that was waiting for this magnet
  // (its old file was lost) is moved over to the new file, keeping its settings and progress.
  const adoptTorrentFile = (src: string, local: string) => {
    for (const k of Object.keys(localStorage)) {
      const old = k.startsWith("tsrc:") ? k.slice(5) : null;
      if (old && old !== local && store.get(k) === src && (lib.missing.has(old) || isRemote(old))) relinkFile(old, local);
    }
    store.set("tsrc:" + local, src);
    pinFile(local);
  };
  const openTorrent = async (src: string, start = false) => {
    const token = ++tCancel.current;
    setTorrentDlg(false);
    setTLoad({ phase: "meta", name: "" });
    try {
      const r = await invoke<Added>("torrent_add", { source: src, outDir: await downloadDir() });
      if (token !== tCancel.current) return;
      setTSources((m) => ({ ...m, [r.id]: src }));
      if (r.localPath) setTLocal((m) => ({ ...m, [r.id]: r.localPath! }));
      if (!r.url || !r.localPath) { setTLoad(null); flash(tt("Bu torrentte oynatılacak video yok; indiriliyor."), "warn", 6000); return; }
      streamMap.current[r.url] = r.localPath;
      adoptTorrentFile(src, r.localPath);
      setTLoad({ phase: "buffer", name: r.name, id: r.id });
      loadRef.current(r.url, start);
    } catch (e) {
      if (token === tCancel.current) { setTLoad(null); flash(String(e), "warn", 8000); }
    }
  };
  const torrents = useTorrents(Object.keys(tSources).length > 0);
  const playTorrent = (id: number) => { if (tSources[id]) openTorrent(tSources[id]); };
  // Download a torrent title without playing it (details page "İndir").
  const downloadTorrent = async (src: string) => {
    setDlPending((l) => [...l, src]);
    try {
      const r = await invoke<Added>("torrent_add", { source: src, outDir: await downloadDir() });
      setTSources((m) => ({ ...m, [r.id]: src }));
      if (r.localPath) {
        const local = r.localPath;
        setTLocal((m) => ({ ...m, [r.id]: local }));
        adoptTorrentFile(src, local);
      }
    } catch (e) {
      flash(String(e), "warn", 8000);
    } finally {
      setDlPending((l) => l.filter((x) => x !== src));
    }
  };
  // Removing the torrent that is playing stops playback first, so its files can be deleted.
  const torrentRemoved = (id: number, mode: RemoveMode) => {
    if (sRaw.path?.includes(`/torrents/${id}/`)) mpv("stop");
    const local = tLocal[id] ?? Object.keys(localStorage).find((k) => k.startsWith("tsrc:") && store.get(k) === tSources[id])?.slice(5);
    if (!local) return;
    if (mode !== "list") store.set("tdone:" + local, "0");
    if (mode === "all") {
      removeRecent([local]);
      lib.forgetFiles([local]);
      try { localStorage.removeItem("tsrc:" + local); } catch {}
    }
    setRecent((r) => [...r]);
  };
  // Finished downloads play straight from disk next time (and stop looking faded).
  useEffect(() => {
    let changed = false;
    for (const t of torrents) {
      const local = tLocal[t.id];
      if (t.finished && local && store.get("tdone:" + local) !== "1") { store.set("tdone:" + local, "1"); changed = true; }
    }
    if (changed) setRecent((r) => [...r]);
  }, [torrents]);

  const load = useCallback((p: string, start = false, confirmed = false) => {
    if (isTorrentSource(p)) return openTorrent(p, start);
    // A torrent video that wasn't finished: stream it again instead of the partial file.
    const src = store.get("tsrc:" + p);
    if (src && store.get("tdone:" + p) !== "1" && !p.startsWith("http")) {
      if (!confirmed) { setAskStream({ path: p, src, start }); return; }
      return openTorrent(src, start);
    }
    if (SUB_EXT.includes(ext(p))) {
      mpv("sub-add", p, "select");
      flash(tt("Altyazı yüklendi"), "ok");
    } else {
      fromStart.current = start;
      restoring.current = true;
      mpv("loadfile", p, "replace");
      setProp("pause", false);
      if (store.get("autoFull") !== "0") getCurrentWindow().setFullscreen(true);
    }
  }, []);
  loadRef.current = load;

  // Opened via double-click / "Open with": start playing immediately.
  useEffect(() => {
    applySubOpts(loadSubOpts());
    // German joined the default subtitle languages.
    if (store.get("langs") === "tr,en") store.set("langs", "tr,en,de");
    setProp("screenshot-directory", "~~desktop/");
    // This is a desktop app: no browser context menu, reload, find or zoom.
    const noMenu = (e: MouseEvent) => e.preventDefault();
    const noBrowserKeys = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "f5" || k === "f3" || k === "f7" || k === "f12" ||
        ((e.ctrlKey || e.metaKey) && ["r", "f", "g", "p", "u", "s", "j", "h", "+", "-", "=", "0"].includes(k)) ||
        (e.ctrlKey && e.shiftKey && ["i", "c"].includes(k)) || (e.altKey && (k === "arrowleft" || k === "arrowright")))
        e.preventDefault();
    };
    window.addEventListener("contextmenu", noMenu);
    window.addEventListener("keydown", noBrowserKeys, true);
    invoke<string | null>("startup_file").then((p) => { if (p) load(p); });
    // Another video double-clicked while Luna is already open.
    const unOpen = listen<string>("open-file", (e) => load(e.payload));
    const un = getCurrentWebview().onDragDropEvent((e) => {
      if (e.payload.type === "drop" && e.payload.paths[0]) load(e.payload.paths[0]);
    });
    return () => {
      un.then((f) => f());
      unOpen.then((f) => f());
      window.removeEventListener("contextmenu", noMenu);
      window.removeEventListener("keydown", noBrowserKeys, true);
    };
  }, [load]);

  // Remember where we are, for "continue watching".
  useEffect(() => {
    if (!s.path || !s.duration) return;
    const id = setTimeout(() => {
      // Anything played stays in the library; the last few minutes (credits) count as finished.
      pinFile(s.path!);
      if (nearEnd(s.time, s.duration) && !isFinished(s.path!)) { setFinished([s.path!], true); askRating.current = s.path!; }
      const list = [{ path: s.path!, title: s.title, time: s.time, duration: s.duration },
        ...loadRecent().filter((r) => r.path !== s.path)].slice(0, 30);
      store.set("recent", JSON.stringify(list));
      setRecent(list);
    }, 2000);
    return () => clearTimeout(id);
  }, [Math.floor(s.time / 5), s.path]);

  useEffect(() => {
    if (s.path) store.set("delay:" + s.path, String(s.subDelay));
  }, [s.subDelay]);

  const subFile = s.sub?.["external-filename"];
  useEffect(() => {
    if (!subFile) { setCues([]); return; }
    invoke<[number, number][]>("subtitle_cues", { file: subFile }).then(setCues).catch(() => setCues([]));
  }, [subFile]);

  // Prefer the TMDB name ("Dizi — S01B03") over the raw file name.
  const current = s.path ? lib.itemFor(s.path) : undefined;
  const curFile = current?.files.find((f) => f.path === s.path);
  const displayTitle = current
    ? (current.meta?.title ?? current.parsed.title) +
      (curFile?.season != null ? ` — S${String(curFile.season).padStart(2, "0")}B${String(curFile.episode).padStart(2, "0")}` : "")
    : s.title;

  // Netflix-style centre title: "Show  S1:B3  Episode name".
  const curIdx = current?.files.findIndex((f) => f.path === s.path) ?? -1;
  const nextFile = current?.parsed.kind === "tv" && curIdx >= 0 ? current.files[curIdx + 1] : undefined;
  const prevFile = current?.parsed.kind === "tv" && curIdx > 0 ? current.files[curIdx - 1] : undefined;
  const epName = current?.meta && curFile?.season != null
    ? store.json<Episode[]>(`season:${current.meta.id}:${curFile.season}`, []).find((e) => e.episode === curFile.episode)?.name
    : undefined;
  const titleParts = {
    show: current ? current.meta?.title ?? current.parsed.title : s.title,
    code: curFile?.season != null ? `S${curFile.season}:B${curFile.episode}` : "",
    episode: epName ?? "",
  };

  // Netflix-style "next episode" when an episode ends: plays by itself after 8 seconds.
  useEffect(() => {
    if (!s.eof || !nextFile) return;
    const f = current?.files.find((x) => x.path === nextFile.path);
    const title = (current?.meta?.title ?? current?.parsed.title ?? "") + (f?.season != null ? ` · S${f.season}:B${f.episode}` : "");
    setNextUp({ path: nextFile.path, title, count: 8 });
  }, [s.eof]);
  useEffect(() => {
    if (!nextUp) return;
    if (nextUp.count <= 0) { setNextUp(null); load(nextUp.path); return; }
    const id = setTimeout(() => setNextUp((n) => n && { ...n, count: n.count - 1 }), 1000);
    return () => clearTimeout(id);
  }, [nextUp]);

  useEffect(() => {
    getCurrentWindow().setTitle(displayTitle ? `${displayTitle} — Luna Player` : "Luna Player");
  }, [displayTitle]);

  // Controls fade out while playing and the mouse is still.
  useEffect(() => {
    let t: number;
    const wake = () => {
      setShowUi(true);
      clearTimeout(t);
      t = window.setTimeout(() => setShowUi(false), 2500);
    };
    wake();
    window.addEventListener("mousemove", wake);
    return () => { window.removeEventListener("mousemove", wake); clearTimeout(t); };
  }, []);
  const uiVisible = !playing || showUi || s.paused || showSync || showTracks || showUp || showVset || !!menu;
  useEffect(() => { if (!playing) setShowUp(false); }, [playing]);

  // Lift subtitles above the controls while they're shown, like Netflix.
  useEffect(() => {
    if (!playing) return;
    const h = window.innerHeight;
    const covered = showSync ? 460 : uiVisible ? 190 : 0;
    setProp("sub-pos", Math.round(100 - (covered / h) * 100));
  }, [playing, uiVisible, showSync]);

  // Window mode: Windows' maximize button goes straight to fullscreen, so there are only two modes.
  const [isFull, setIsFull] = useState(false);
  useEffect(() => {
    const w = getCurrentWindow();
    const sync = async () => {
      if (await w.isMaximized()) { await w.unmaximize(); await w.setFullscreen(true); }
      setIsFull(await w.isFullscreen());
    };
    sync();
    const un = w.onResized(() => { sync(); });
    return () => { un.then((f) => f()); };
  }, []);
  // While a video plays with the Upscaler on: subtitles move to the capture-proof window and
  // Lossless Scaling scales Luna. Leaving the player undoes both.
  useEffect(() => {
    const want = playing && upOn;
    if (want === upActive.current) return;
    upActive.current = want;
    if (want) {
      // Subtitles stay with mpv (always visible). The separate capture-free subtitle layer
      // (SUBS_LAYER) is switched off until it can be made reliable.
      if (SUBS_LAYER) { invoke("subs_window", { show: true }).catch(() => {}); pushSubs(s.osd); }
      else setProp("sub-visibility", true);
      const t = setTimeout(() => {
        invoke<boolean>("upscaler_scale", { on: true })
          .then((ok) => { if (!ok) flash(tt("Lossless Scaling ölçeklemeyi başlatmadı"), "warn", 5000); })
          .catch((e) => flash(String(e), "warn", 7000));
      }, 900);
      return () => clearTimeout(t);
    } else {
      setProp("sub-visibility", true);
      if (SUBS_LAYER) invoke("subs_window", { show: false }).catch(() => {});
      invoke("upscaler_scale", { on: false }).catch(() => {});
    }
  }, [playing, upOn]);
  // Picture subtitles in the Upscaler: Blu-ray PGS tracks are read and decoded by the core and
  // shown in the subtitle layer; until that is ready (and for other picture formats) mpv keeps drawing them.
  const [pgsReady, setPgsReady] = useState<string | null>(null);
  const pgsSource = () => {
    const local = s.path && !/^https?:/i.test(s.path) ? s.path : null;
    const id = s.sub?.["src-id"];
    return local && /\.(mkv|mka|mks)$/i.test(local) && id != null ? { file: local, track: id, key: `${local}#${id}` } : null;
  };
  useEffect(() => {
    const unR = listen<string>("pgs-ready", (e) => { setPgsReady(e.payload); showOsd(tt("Altyazı hazır")); });
    const unP = listen<number>("pgs-progress", (e) => { if (e.payload < 1) showOsd(tt("Altyazı hazırlanıyor %{0}", Math.round(e.payload * 100)), 3000); });
    const unE = listen<string>("pgs-error", (e) => flash(tt("Altyazı okunamadı: ") + e.payload, "warn", 7000));
    return () => { unR.then((f) => f()); unP.then((f) => f()); unE.then((f) => f()); };
  }, []);
  useEffect(() => {
    if (!SUBS_LAYER || !upActive.current) return;
    const src = isPgs(s.sub) ? pgsSource() : null;
    if (src) {
      if (pgsReady !== src.key) invoke("pgs_prepare", { file: src.file, track: src.track }).catch(() => {});
    } else {
      invoke("pgs_clear").catch(() => {});
    }
    const pgsOn = !!src && pgsReady === src.key;
    // mpv draws only picture subtitles the layer can't show (yet)
    setProp("sub-visibility", isImageSub(s.sub) && !pgsOn);
  }, [playing, upOn, s.sub?.id, s.sub?.codec, s.path, pgsReady]);
  useEffect(() => { if (SUBS_LAYER && upActive.current) pushSubs(s.osd); }, [s.osd?.w, s.osd?.h, s.osd?.mt, s.osd?.mb, s.osd?.ml, s.osd?.mr]);


  // "Uygula" in the UP menu: close it, pause and count 3-2-1 while Lossless Scaling takes the new
  // settings, then the video starts with the effect on.
  const applyUpscaler = (save: () => Promise<void>, on: boolean) => {
    setShowUp(false);
    if (!on) {
      // Turned off in the menu: keep the settings, leave the mode, no countdown.
      save().catch((e) => flash(String(e), "warn", 7000));
      if (upOn) exitUpscaler();
      return;
    }
    setProp("pause", true);
    setCountdown(3);
    save()
      .then(() => {
        store.set("upscaler", "1");
        if (upActive.current) invoke("upscaler_scale", { on: true }).catch(() => {});
        else setUpOn(true);
      })
      .catch((e) => { setCountdown(null); flash(String(e), "warn", 7000); });
  };
  const exitUpscaler = () => {
    store.set("upscaler", "0");
    setUpOn(false);
    showOsd(tt("Upscaler kapatıldı"));
  };
  // Q: straight on or off, no countdown.
  const toggleUpscalerQ = () => {
    if (upOn) return exitUpscaler();
    store.set("upscaler", "1");
    setUpOn(true);
    showOsd(tt("Upscaler açılıyor…"));
  };
  useEffect(() => {
    if (playing || !askRating.current) return;
    const path = askRating.current;
    askRating.current = null;
    const it = lib.itemFor(path);
    const title = it?.meta?.title ?? it?.parsed.title;
    if (!title || it?.parsed.kind === "tv") return;
    const year = it?.meta?.year || undefined;
    if (diaryGet(title, year)?.vote || diaryGet(title, year)?.rating) return;
    setRateFor({ path, title, year, genres: it?.meta?.genres });
  }, [playing]);
  useEffect(() => {
    if (!playing && upOn) { setUpOn(false); store.set("upscaler", "0"); }
  }, [playing]);

  const toggleFull = async () => {
    const w = getCurrentWindow();
    await w.setFullscreen(!(await w.isFullscreen()));
  };
  const nudge = (d: number) => setProp("sub-delay", Math.round((s.subDelay + d) * 1000) / 1000);

  // Short on-screen message at the top (speed, volume, delays…), like VLC's OSD.
  const [osd, setOsd] = useState<string | null>(null);
  const osdTimer = useRef<number>(0);
  // Big visual feedback for arrow keys / wheel: a volume bar or a seek ripple.
  type Hud = { kind: "vol"; v: number; mute: boolean; n: number } | { kind: "seek"; secs: number; to: number; n: number };
  const [hud, setHud] = useState<Hud | null>(null);
  const hudTimer = useRef<number>(0);
  const hudN = useRef(0);
  const showHud = (h: Hud) => {
    setOsd(null);
    setHud(h);
    clearTimeout(hudTimer.current);
    hudTimer.current = window.setTimeout(() => setHud(null), 900);
  };
  const showVol = (v: number) => showHud({ kind: "vol", v: Math.max(0, Math.min(130, Math.round(v))), mute: false, n: ++hudN.current });
  const showSeek = (secs: number) => setHud((h) => {
    // Repeated presses in the same direction add up: "+30 sn".
    const prev = h?.kind === "seek" && Math.sign(h.secs) === Math.sign(secs) ? h.secs : 0;
    const total = prev + secs;
    clearTimeout(hudTimer.current);
    hudTimer.current = window.setTimeout(() => setHud(null), 900);
    setOsd(null);
    const from = prev && h?.kind === "seek" ? h.to : s.time;
    return { kind: "seek", secs: total, to: Math.max(0, Math.min(s.duration || 0, from + secs)), n: ++hudN.current };
  });
  const showOsd = (text: string, ms = 1200) => {
    setOsd(text);
    clearTimeout(osdTimer.current);
    if (ms) osdTimer.current = window.setTimeout(() => setOsd(null), ms);
  };
  const sec = (v: number) => (v > 0 ? "+" : "") + Math.round(v * 1000) + " ms";

  // Space: tap = play/pause, hold = 2× while held (YouTube style).
  const hold = useRef<{ timer: number; boosted: boolean; speed: number } | null>(null);

  useEffect(() => {
    const seek = (secs: number) => { mpv("seek", secs); showSeek(secs); };
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (!playing) {
        if (e.ctrlKey && e.key.toLowerCase() === "o") { e.preventDefault(); openFile(); }
        return;
      }
      if (kbLock) {
        e.preventDefault();
        if (!e.repeat) showOsd(tt("Klavye kilitli · açmak için kilide tıkla"), 1600);
        return;
      }
      const k = e.key.toLowerCase();
      const ctrl = e.ctrlKey, alt = e.altKey, shift = e.shiftKey;
      if (k === " ") {
        e.preventDefault();
        if (e.repeat || hold.current) return;
        const h = { timer: 0, boosted: false, speed: s.speed ?? 1 };
        h.timer = window.setTimeout(() => {
          h.boosted = true;
          if (s.paused) setProp("pause", false);
          setProp("speed", 2);
          showOsd("2× ▸▸", 0);
        }, 350);
        hold.current = h;
        return;
      }
      if (["arrowleft", "arrowright", "arrowup", "arrowdown", "o", "q", "h", "s"].includes(k) && (ctrl || alt)) e.preventDefault();
      // ---- VLC hotkeys ----
      if (k === "arrowleft" || k === "arrowright") {
        const dir = k === "arrowleft" ? -1 : 1;
        seek(dir * (ctrl && alt ? 300 : ctrl ? 60 : alt ? 10 : shift ? 3 : 10));
      }
      else if (k === "arrowup" || k === "arrowdown") {
        const v = Math.max(0, Math.min(130, (s.volume ?? 100) + (k === "arrowup" ? 5 : -5)));
        setProp("volume", v);
        showVol(v);
      }
      else if (k === "f" || k === "f11") toggleFull();
      else if (k === "escape") close(); // back to the library
      else if (k === "m") { mpv("cycle", "mute"); showOsd(s.mute ? tt("Ses açık") : tt("Sessiz")); }
      else if (k === "s" && shift) { mpv("screenshot", "video"); showOsd(tt("Ekran görüntüsü masaüstüne kaydedildi"), 2000); }
      else if (k === "s" && !ctrl) setShowSync((v) => !v); // subtitle timeline (VLC: stop)
      else if (k === "n") { if (nextFile) load(nextFile.path); }
      else if (k === "p") { if (prevFile) load(prevFile.path); }
      else if (k === "e") mpv("frame-step");
      else if (k === "v") { mpv("cycle", "sid", alt ? "down" : "up"); showOsd(tt("Altyazı değişti")); }
      else if (k === "b") { mpv("cycle", "aid"); showOsd(tt("Ses parçası değişti")); }
      else if (k === "g") { nudge(-0.05); showOsd(tt("Altyazı gecikmesi ") + sec(s.subDelay - 0.05)); }
      else if (k === "h" && !ctrl) { nudge(0.05); showOsd(tt("Altyazı gecikmesi ") + sec(s.subDelay + 0.05)); }
      else if (k === "j") { mpv("add", "audio-delay", -0.05); showOsd(tt("Ses gecikmesi ") + sec((s.audioDelay ?? 0) - 0.05)); }
      else if (k === "k") { mpv("add", "audio-delay", 0.05); showOsd(tt("Ses gecikmesi ") + sec((s.audioDelay ?? 0) + 0.05)); }
      else if (k === "[" || k === "-") { mpv("multiply", "speed", 1 / 1.1); showOsd(tt("Hız ") + ((s.speed ?? 1) / 1.1).toFixed(2) + "×"); }
      else if (k === "]" || k === "+") { mpv("multiply", "speed", 1.1); showOsd(tt("Hız ") + ((s.speed ?? 1) * 1.1).toFixed(2) + "×"); }
      else if (k === "=") { setProp("speed", 1); showOsd(tt("Normal hız")); }
      else if (k === "a") { mpv("cycle-values", "video-aspect-override", "16:9", "4:3", "2.35:1", "no"); showOsd(tt("En-boy oranı değişti")); }
      else if (k === "c") { mpv("cycle-values", "panscan", "1", "0"); showOsd(tt("Doldur (kırp) / Orijinal")); }
      else if (k === "z") { mpv("cycle-values", "video-zoom", "0.15", "0.3", "0"); showOsd(tt("Yakınlaştırma")); }
      else if (k === "d") { mpv("cycle", "deinterlace"); showOsd("Deinterlace"); }
      else if (k === "l") { setProp("loop-file", s.loop === "inf" ? "no" : "inf"); showOsd(s.loop === "inf" ? tt("Tekrar kapalı") : tt("Tekrarla")); }
      else if (k === "t") showOsd(fmtTime(s.time) + " / " + fmtTime(s.duration), 2000);
      else if (k === "o" && ctrl) openFile();
      else if (k === "q" && ctrl) getCurrentWindow().close();
      else if (k === "q" && !ctrl && !alt) toggleUpscalerQ();
      // ---- Luna extras ----
      else if (k === "u" && s.path) setSubDlg(s.path);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== " " || !hold.current) return;
      e.preventDefault(); // a focused button would otherwise also "click" on Space release
      const h = hold.current;
      hold.current = null;
      clearTimeout(h.timer);
      if (h.boosted) { setProp("speed", h.speed); setOsd(null); }
      else mpv("cycle", "pause");
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("keyup", onKeyUp); };
  });

  const openFile = async () => {
    const p = await open({ multiple: false, filters: [
      { name: "Video", extensions: VIDEO_EXT },
      { name: tt("Altyazı"), extensions: SUB_EXT },
      { name: "Torrent", extensions: ["torrent"] },
    ] });
    if (typeof p === "string") load(p);
  };

  const close = () => { mpv("stop"); setShowSync(false); getCurrentWindow().setFullscreen(false); };

  // Mouse back button (and Alt+←): close what's on top, else go one step back.
  const goBack = () => {
    if (subDlg) return setSubDlg(null);
    if (settings) return setSettings(false);
    if (cardMenu || menu) { setCardMenu(null); setMenu(null); return; }
    if (playing) return close();
    if (detailsKey) return setDetailsKey(null);
    const ev = new CustomEvent("luna-back", { cancelable: true });
    window.dispatchEvent(ev);
    if (!ev.defaultPrevented && view !== "home") { setView("home"); setQuery(""); }
  };
  useEffect(() => {
    const onMouse = (e: MouseEvent) => {
      if (e.button === 3 || e.button === 4) e.preventDefault();
      if (e.type === "mouseup" && e.button === 3) goBack();
    };
    // In the player Alt+← is VLC's 10 s jump, so it only means "back" in the library.
    const onAlt = (e: KeyboardEvent) => { if (!playing && e.altKey && e.key === "ArrowLeft") goBack(); };
    window.addEventListener("mousedown", onMouse);
    window.addEventListener("mouseup", onMouse);
    window.addEventListener("keydown", onAlt);
    return () => {
      window.removeEventListener("mousedown", onMouse);
      window.removeEventListener("mouseup", onMouse);
      window.removeEventListener("keydown", onAlt);
    };
  });
  const seekTo = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons !== 1 && e.type !== "pointerdown") return;
    const r = e.currentTarget.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    mpv("seek", f * 100, "absolute-percent");
  };

  // Seek-bar hover preview: a hidden second mpv renders a small frame per request (~70 ms).
  // Only one request runs at a time; when it returns, the latest hovered spot is fetched next.
  const [hover, setHover] = useState<{ f: number; secs: number; img?: string } | null>(null);
  const want = useRef<{ path: string; secs: number } | null>(null);
  const busy = useRef(false);
  const imgCache = useRef(new Map<string, string>());
  const pump = () => {
    if (busy.current || !want.current) return;
    const { path, secs } = want.current;
    want.current = null;
    const show = (img: string) => setHover((h) => (h && h.secs === secs ? { ...h, img } : h && !h.img ? { ...h, img } : h));
    const k = path + "|" + secs;
    const hit = imgCache.current.get(k);
    if (hit) { show(hit); pump(); return; }
    busy.current = true;
    invoke<string>("seek_preview", { path, secs })
      .then((file) => { const u = convertFileSrc(file); imgCache.current.set(k, u); setHover((h) => (h ? { ...h, img: u } : h)); })
      .catch(() => {})
      .finally(() => { busy.current = false; pump(); });
  };
  const onBarMove = (e: React.PointerEvent<HTMLDivElement>) => {
    seekTo(e);
    if (!s.duration || !sRaw.path) return;
    const r = e.currentTarget.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    // Nearby seconds share a keyframe anyway; snapping makes the cache hit far more often.
    const step = Math.max(1, Math.floor(s.duration / 800));
    const secs = Math.floor((f * s.duration) / step) * step;
    setHover((h) => ({ f, secs, img: h?.img }));
    want.current = { path: sRaw.path, secs };
    pump();
  };
  // Open the video in the preview worker shortly after playback starts, so the first hover is instant too.
  useEffect(() => {
    const path = sRaw.path;
    if (!path) { invoke("preview_release").catch(() => {}); return; }
    const t = setTimeout(() => invoke("seek_preview", { path, secs: 0 }).catch(() => {}), 2500);
    return () => clearTimeout(t);
  }, [sRaw.path]);

  // While streaming a torrent: which parts of the file are downloaded (shown on the seek bar).
  const [haves, setHaves] = useState<[number, number][]>([]);
  useEffect(() => {
    const m = sRaw.path?.match(/\/torrents\/(\d+)\/stream\/(\d+)/);
    setHaves([]);
    if (!m) return;
    const tick = () => invoke<[number, number][]>("torrent_haves", { id: +m[1], idx: +m[2] }).then(setHaves).catch(() => {});
    tick();
    const t = setInterval(tick, 2000);
    return () => clearInterval(t);
  }, [sRaw.path]);
  const downloadedPct = Math.round(haves.reduce((n, [a, b]) => n + b - a, 0) * 100);

  const subLabel = s.sub
    ? (s.sub.lang ? s.sub.lang.toUpperCase() : tt("Altyazı")) + (s.sub.external ? " · harici" : "")
    : tt("Altyazı yok");
  const detailsItem = detailsKey ? lib.items.find((i) => i.key === detailsKey) : undefined;
  const detailsMissing = detailsItem ? detailsItem.files.map((f) => f.path).filter((p) => lib.missing.has(p) && !isRemote(p)) : [];
  const detailsMissingPanel = detailsMissing.length ? (
    <MissingPanel
      onRelink={(np) => { relinkFile(detailsMissing[0], np); setRecent(loadRecent()); flash(tt("Dosya yeniden bağlandı"), "ok"); }}
      onMagnet={(src) => { store.set("tsrc:" + detailsMissing[0], src); store.set("tdone:" + detailsMissing[0], "0"); window.dispatchEvent(new Event("luna-library")); setRecent((r) => [...r]); }}
      onForget={() => { lib.forgetFiles(detailsMissing); removeRecent(detailsMissing); setDetailsKey(null); }} />
  ) : null;
  const detailsSrc = detailsItem?.files.map((f) => torrentSrc(f.path)).find(Boolean) ?? null;
  const detailsStat = detailsSrc ? torrents.find((t) => tSources[t.id] === detailsSrc) : undefined;
  const detailsDownload = detailsSrc && (detailsItem!.files.some((f) => isRemote(f.path)) || detailsStat) ? (
    <DownloadPanel pending={dlPending.includes(detailsSrc)} stat={detailsStat} onDownload={() => downloadTorrent(detailsSrc)}
      onCancel={(id) => { torrentRemoved(id, "files"); invoke("torrent_remove", { id, deleteFiles: true }).catch(() => {}); }} />
  ) : null;

  // ---------- library actions (right-click menu on cards) ----------
  const setRecentList = (list: Recent[]) => { store.set("recent", JSON.stringify(list)); setRecent(list); };
  const removeRecent = (paths: string[]) => setRecentList(loadRecent().filter((r) => !paths.includes(r.path)));
  const markWatched = (path: string, watched: boolean) => {
    const list = loadRecent();
    const r = list.find((x) => x.path === path);
    const dur = r?.duration || store.json<{ duration: number } | null>("info:" + path, null)?.duration || 1;
    const entry = { path, title: r?.title ?? path.split(/[\\/]/).pop()!, time: watched ? dur : 0, duration: dur };
    setRecentList(watched ? [entry, ...list.filter((x) => x.path !== path)] : list.filter((x) => x.path !== path));
  };
  const addSubtitle = (path: string) => setSubDlg(path);
  const attachSubtitle = (path: string, file: string, label: string) => {
    setSubDlg(null);
    store.set("extSub:" + path, file);
    store.set("hasSub:" + path, "1");
    if (s.path === path) {
      mpv("sub-add", file, "select");
      flash(tt("Altyazı yüklendi · {0}", label), "ok");
    } else flash(tt("Altyazı eklendi · {0} · oynatınca yüklenecek", label), "ok");
    setRecent((r) => [...r]);
  };
  const [cardMenu, setCardMenu] = useState<{ x: number; y: number; t: Target } | null>(null);
  const [confirmDel, setConfirmDel] = useState<Target | null>(null);
  const [rematch, setRematch] = useState<Target | null>(null);
  const [view, setView] = useState<View>("home");
  const [query, setQuery] = useState("");
  const actions: Actions = {
    play: (p, start) => load(p, start),
    details: (k) => setDetailsKey(k),
    menu: (e, t) => { e.preventDefault(); e.stopPropagation(); setCardMenu({ x: e.clientX, y: e.clientY, t }); },
    rematch: (t) => setRematch(t),
    missing: lib.missing,
  };
  const menuEntries = (t: Target): MenuEntry[] => {
    const r = recent.find((x) => x.path === t.path);
    const watched = pct(r) > 92;
    return [
      { label: r && !watched ? tt("Devam et") : tt("Oynat"), act: () => load(t.path) },
      ...(r && !watched ? [{ label: tt("Baştan oynat"), act: () => load(t.path, true) }] : []),
      ...(t.item && t.item.key !== detailsKey ? [{ label: tt("Detaylar"), act: () => setDetailsKey(t.item!.key) }] : []),
      "sep",
      { label: watched ? tt("İzlenmedi olarak işaretle") : tt("İzlendi olarak işaretle"), act: () => markWatched(t.path, !watched) },
      ...(r ? [{ label: tt("İzlemeye devam et listesinden kaldır"), act: () => removeRecent([t.path]) }] : []),
      { label: tt("Altyazı ekle…"), act: () => addSubtitle(t.path) },
      ...(t.item ? [{ label: tt("Adını değiştir / eşleştir…"), act: () => setRematch(t) }] : []),
      "sep",
      { label: tt("Adını kopyala"), act: () => { navigator.clipboard.writeText(t.item?.meta?.title ?? t.item?.parsed.title ?? t.path.split(/[\\/]/).pop()!); flash(tt("Ad kopyalandı"), "ok"); } },
      { label: tt("Dosya konumunu aç"), act: () => invoke("reveal_file", { path: t.path }) },
      { label: tt("Dosya yolunu kopyala"), act: () => { navigator.clipboard.writeText(t.path); flash(tt("Yol kopyalandı"), "ok"); } },
      "sep",
      { label: tt("Sil…"), danger: true, act: () => setConfirmDel(t) },
    ];
  };
  const doDelete = async (t: Target) => {
    setConfirmDel(null);
    try {
      const n = await invoke<number>("delete_file", { path: t.path });
      removeRecent([t.path]);
      lib.forgetFiles([t.path]);
      if (detailsItem && detailsItem.files.length <= 1 && detailsItem.files[0]?.path === t.path) setDetailsKey(null);
      flash(n > 1 ? tt("Silindi (altyazılarıyla birlikte {0} dosya, Geri Dönüşüm Kutusu'nda)", n) : tt("Silindi (Geri Dönüşüm Kutusu'nda)"), "ok");
    } catch (e) {
      flash(tt("Silinemedi: ") + e, "warn", 7000);
    }
  };

  return (
    <div className={"root" + (playing ? " playing" : "") + (uiVisible ? "" : " idle")}
      onDoubleClick={(e) => playing && e.target === e.currentTarget && toggleFull()}
      onClick={(e) => playing && e.target === e.currentTarget && mpv("cycle", "pause")}
      onContextMenu={(e) => { if (playing) { setShowTracks(false); setMenu({ x: e.clientX, y: e.clientY }); } }}
      onWheel={(e) => {
        // Mouse wheel over the video = volume, like VLC.
        if (!playing || e.target !== e.currentTarget) return;
        const v = Math.max(0, Math.min(130, Math.round(s.volume + (e.deltaY < 0 ? 5 : -5))));
        setProp("volume", v);
        showVol(v);
      }}>
      {osd && playing && <div className="osd">{osd}</div>}
      {hud && playing && hud.kind === "vol" && (
        <div className="hud-vol" key="vol">
          <Icon d={hud.v === 0 ? I.mute : I.vol} size={26} />
          <div className="hud-vol-bar"><div style={{ height: Math.min(100, (hud.v / 130) * 100) + "%" }} className={hud.v > 100 ? "boost" : ""} /></div>
          <b>{hud.v}</b>
        </div>
      )}
      {hud && playing && hud.kind === "seek" && (
        <div className={"hud-seek " + (hud.secs < 0 ? "l" : "r")} key={"seek" + Math.sign(hud.secs)}>
          <div className="hud-ripple" key={hud.n} />
          <div className="hud-seek-in">
            <div className="hud-arrows"><span>{hud.secs < 0 ? "◀" : "▶"}</span><span>{hud.secs < 0 ? "◀" : "▶"}</span><span>{hud.secs < 0 ? "◀" : "▶"}</span></div>
            <b>{(hud.secs > 0 ? "+" : "−") + (Math.abs(hud.secs) >= 60 ? fmtTime(Math.abs(hud.secs)) : Math.abs(hud.secs) + tt(" sn"))}</b>
            <span className="hud-to">{fmtTime(hud.to)} / {fmtTime(s.duration)}</span>
          </div>
        </div>
      )}
      {countdown != null && countdown > 0 && playing && <div className="countdown" key={countdown}>{countdown}</div>}

      {!playing && !detailsItem && (
        <div className="shell" onScroll={(e) => e.currentTarget.classList.toggle("scrolled", e.currentTarget.scrollTop > 8)}>
          <Header view={view} setView={(v) => { setView(v); if (v === "home") setQuery(""); }} query={query} setQuery={setQuery}
            scanning={lib.scanning} onOpen={openFile} onSettings={() => setSettings(true)}
            onTorrent={() => setTorrentDlg(true)} downloading={torrents.filter((t) => !t.finished).length} onChat={() => setChat((v) => !v)} />
          <div className="shell-body" key={view}>
            {view === "home" && <Home items={lib.items} recent={recent} hasFolders={lib.folders.length > 0} a={actions}
              onSettings={() => setView("folders")}
              downloads={torrents.length > 0 && <DownloadsSection list={torrents} onPlay={playTorrent} onRemoved={torrentRemoved} />} />}
            {view === "movies" && <Browse title={tt("Filmler")} items={lib.items.filter((i) => i.parsed.kind === "movie")} query={query} a={actions} />}
            {view === "shows" && <Browse title={tt("Diziler")} items={lib.items.filter((i) => i.parsed.kind === "tv")} query={query} a={actions} />}
            {view === "folders" && <Folders roots={lib.folders} setRoots={(f) => { lib.setFolders(f); lib.refresh(); }}
              items={lib.items} recent={recent} a={actions} />}
            {(view === "movies" || view === "shows") && query.trim() && (
              <div className="page web-page">
                <WebResults query={query} onStream={(src) => openTorrent(src)}
                  onDownload={(src) => { downloadTorrent(src); flash(tt("İndirme başladı · İndirmeler'den takip edebilirsin"), "ok", 4000); }} />
              </div>
            )}
            {view === "recs" && <RecsPage items={lib.items} onPlay={(p) => load(p)} onTorrent={() => setTorrentDlg(true)} onAsk={(it) => { setChatTopic(it); setChat(true); }} />}
            {view === "downloads" && <Downloads list={torrents} onPlay={playTorrent} onRemoved={torrentRemoved} />}
          </div>
        </div>
      )}
      {!playing && detailsItem && (
        <Details key={detailsItem.key} it={detailsItem} recent={recent} a={actions} onBack={() => setDetailsKey(null)}
          onAddSub={addSubtitle} download={detailsDownload} onAsk={() => setChat(true)} missingPanel={detailsMissingPanel} />
      )}
      {chat && !playing && <ChatPanel key={"chat:" + (detailsItem?.key ?? chatTopic?.key ?? "general")} items={lib.items} recent={recent} viewing={detailsItem ?? chatTopic ?? undefined} onClose={() => { setChat(false); setChatTopic(null); }}
        onPlay={(p) => { setDetailsKey(null); load(p); }} onOpenSource={(src) => { setDetailsKey(null); setChat(false); openTorrent(src); }} />}
      {cardMenu && !playing && (
        <CardMenu x={cardMenu.x} y={cardMenu.y} entries={menuEntries(cardMenu.t)} onClose={() => setCardMenu(null)} />
      )}
      {confirmDel && (
        <Confirm title={tt("Dosya silinsin mi?")} danger ok="Evet, sil" onCancel={() => setConfirmDel(null)} onOk={() => doDelete(confirmDel)}
          text={tt("“{0}” diskten silinecek ve Geri Dönüşüm Kutusu'na taşınacak. Aynı adlı altyazı dosyaları da silinir.", confirmDel.path.split(/[\\/]/).pop())} />
      )}
      {rematch?.item && (
        <Rematch it={rematch.item} onClose={() => setRematch(null)}
          onCustom={(title, kind) => { setRematch(null); lib.setMeta(rematch.item!.key, customMeta(title, kind)); flash(tt("Ad kaydedildi"), "ok"); }}
          onPick={async (h) => {
          setRematch(null);
          try { lib.setMeta(rematch.item!.key, await details(h.kind, h.id)); flash(tt("Eşleşme güncellendi"), "ok"); }
          catch (e) { flash(String(e), "warn"); }
        }} />
      )}

      {playing && (
        <>
          <div className="top">
            <button className="nf" aria-label={tt("Geri")} onClick={close}><Icon d={I.arrowLeft} size={36} /></button>
            <span className="grow" />
            <button className={"nf lockbtn" + (kbLock ? " on" : "")} aria-pressed={kbLock}
              aria-label={kbLock ? tt("Klavye kilidini aç") : tt("Klavyeyi kilitle")}
              title={kbLock ? tt("Klavye kilitli · açmak için tıkla") : tt("Klavyeyi kilitle (yanlışlıkla tuşa basmaya karşı)")}
              onClick={() => { setKbLock((v) => !v); showOsd(kbLock ? tt("Klavye açıldı") : tt("Klavye kilitlendi · fare çalışır")); }}>
              <Icon d={kbLock ? I.lock : I.unlock} size={30} />
            </button>
          </div>

          <div className="bottom">
            {upOn && <div className="up-hint"><span className="up-ico">{tt("UP")}</span>  {tt("Upscaler açık · kapatmak için")} <kbd>Q</kbd>  {tt("tuşuna bas")}</div>}
            <div className="seek">
              <span className="t">{fmtTime(s.time)}</span>
              <div className="bar" onPointerDown={seekTo} onPointerMove={onBarMove} onPointerLeave={() => { want.current = null; setHover(null); }}>
                {hover && (
                  <div className="seek-preview" style={{ left: `clamp(110px, ${hover.f * 100}%, calc(100% - 110px))` }}>
                    {hover.img ? <img src={hover.img} alt="" /> : <div className="ph" />}
                    <span>{fmtTime(hover.secs)}</span>
                    {haves.length > 0 && !haves.some(([a, b]) => hover.f >= a && hover.f <= b) && <span className="nodl">{tt("Henüz inmedi")}</span>}
                  </div>
                )}
                {haves.map(([a, b], i) => (
                  <div key={i} className="have" style={{ left: a * 100 + "%", width: (b - a) * 100 + "%" }} />
                ))}
                <div className="fill" style={{ width: (s.duration ? (s.time / s.duration) * 100 : 0) + "%" }} />
              </div>
              <span className="t right">{fmtTime(s.duration - s.time)}</span>
              {haves.length > 0 && downloadedPct < 100 && <span className="dl-pct" title={tt("İnen kısım")}>↓ %{downloadedPct}</span>}
            </div>
            <div className="controls">
              <div className="c-side">
                <button className="nf" aria-label={s.paused ? tt("Oynat") : tt("Duraklat")} onClick={() => mpv("cycle", "pause")}>
                  <Icon d={s.paused ? I.play : I.pause} fill size={38} />
                </button>
                <button className="nf" aria-label="10 saniye geri" onClick={() => mpv("seek", -10)}>
                  <Icon d={I.back} size={38} /><span className="ten">10</span>
                </button>
                <button className="nf" aria-label="10 saniye ileri" onClick={() => mpv("seek", 10)}>
                  <Icon d={I.fwd} size={38} /><span className="ten">10</span>
                </button>
                <button className={"nf" + (countdown != null ? " on" : "")} aria-label={tt("3'ten geri say ve başlat")}
                  title={tt("3'ten geri say ve başlat")} onClick={startCountdown}>
                  <Icon d={I.timer} size={34} />
                </button>
                <div className="volume">
                  <button className="nf" aria-label={tt("Sessiz")} onClick={() => mpv("cycle", "mute")}>
                    <Icon d={s.mute || s.volume === 0 ? I.mute : I.vol} size={36} />
                  </button>
                  <input className="vol" type="range" min={0} max={130} value={s.volume} aria-label={tt("Ses düzeyi")}
                    onChange={(e) => setProp("volume", Number(e.target.value))} />
                </div>
              </div>
              <div className="c-title">
                <span className="show">{titleParts.show}</span>
                {titleParts.code && <span className="code">{titleParts.code}</span>}
                {titleParts.episode && <span className="ep">{titleParts.episode}</span>}
              </div>
              <div className="c-side right">
                <div className="tracks-anchor">
                  <button className={"nf up-btn" + (upOn ? " on" : "") + (showUp ? " open" : "")} aria-expanded={showUp} aria-label={tt("Upscaler ayarları")}
                    title={tt("Upscaler (Lossless Scaling) ayarları")} onClick={() => { setShowUp((v) => !v); setShowTracks(false); }}>
                    <span className="up-ico">{tt("UP")}</span>
                  </button>
                  {showUp && (
                    <div className="tracks up-panel" onClick={(e) => e.stopPropagation()}>
                      <UpscalerSettings inPlayer
                        onSaved={() => { if (upActive.current) invoke("upscaler_scale", { on: true }).catch(() => {}); }}
                        onApply={applyUpscaler} />
                    </div>
                  )}
                </div>
                {nextFile && (
                  <button className="nf" aria-label={tt("Sonraki bölüm")} title={tt("Sonraki bölüm")} onClick={() => load(nextFile.path)}>
                    <Icon d={I.next} size={36} />
                  </button>
                )}
                <div className="tracks-anchor">
                  <button className={"nf" + (showTracks ? " on" : "")} aria-label={tt("Ses ve altyazılar")}
                    title={subLabel + tt(" · Ses ve altyazılar")} onClick={() => setShowTracks((v) => !v)}>
                    <Icon d={I.subs} size={36} />
                  </button>
                  {showTracks && (
                    <TracksPanel s={s} onClose={() => setShowTracks(false)}
                      onSearch={() => { setShowTracks(false); setSubDlg(s.path); }}
                      onSync={() => { setShowTracks(false); setShowSync(true); }} />
                  )}
                </div>
                <div className="tracks-anchor vset-anchor">
                  <button className={"nf" + (showVset ? " on" : "")} aria-label={tt("Video ayarları")} title={tt("Video ayarları (bu videoya özel)")}
                    onClick={() => { setShowTracks(false); setShowVset((v) => !v); }}>
                    <Icon d={I.gear} size={34} />
                  </button>
                  {showVset && s.path && <VideoPanel path={s.path} onClose={() => setShowVset(false)} />}
                </div>
                <button className={"nf" + (showSync ? " on" : "")} aria-label={tt("Altyazı zaman çizelgesi")}
                  title={tt("Altyazı zaman çizelgesi · senkron (S)")} onClick={() => { setShowTracks(false); setShowSync((v) => !v); }}>
                  <Icon d={I.timeline} size={36} />
                </button>
                <button className="nf" aria-label={tt("Tam ekran")} onClick={toggleFull}><Icon d={I.full} size={36} /></button>
              </div>
            </div>
            {showSync && (
              <SubTimeline cues={cues} time={s.time} delay={s.subDelay}
                embedded={!!s.sub && !s.sub.external}
                onReset={() => setProp("sub-delay", 0)}
                onOther={() => setSubDlg(s.path)}
                onClose={() => setShowSync(false)} />
            )}
          </div>
        </>
      )}

      {!playing && isFull && (
        // Top-centre hot zone on the library screens: a round X that quits the app.
        <div className="quit-zone">
          <button className="quit-btn win" aria-label={tt("Pencere / tam ekran")} title={tt("Pencere modu / tam ekran")} onClick={() => toggleFull()}>
            <Icon d={I.full} size={18} />
          </button>
          <button className="quit-btn" aria-label={tt("Programdan çık")} title={tt("Çık")} onClick={() => getCurrentWindow().close()}>
            <Icon d={I.x} size={20} />
          </button>
        </div>
      )}
      {rateFor && !playing && (
        <div className="rate-card">
          <div className="rate-head"><b>{rateFor.title}</b>  {tt("nasıldı?")}<button className="rate-x" aria-label={tt("Kapat")} onClick={() => setRateFor(null)}>×</button></div>
          <div className="rate-votes">
            <button className="chip" onClick={() => { diarySet(rateFor.title, rateFor.year, { vote: "like", watched: Date.now(), genres: rateFor.genres }); setRateFor(null); showOsd(tt("Beğendin olarak kaydedildi")); }}>{tt("👍 Beğendim")}</button>
            <button className="chip" onClick={() => { diarySet(rateFor.title, rateFor.year, { vote: "dislike", watched: Date.now(), genres: rateFor.genres }); setRateFor(null); }}>{tt("👎 Beğenmedim")}</button>
          </div>
          <div className="rate-stars">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <button key={n} onClick={() => { diarySet(rateFor.title, rateFor.year, { rating: n, vote: n >= 7 ? "like" : n <= 4 ? "dislike" : undefined, watched: Date.now(), genres: rateFor.genres }); setRateFor(null); }}>{n}</button>
            ))}
          </div>
        </div>
      )}
      {askStream && (
        <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && setAskStream(null)}>
          <div className="modal">
            <h2>{tt("Bu film bilgisayarında yok")}</h2>
            <p className="modal-text">{tt("İzlemek için torrent'ten indirilmesi gerekiyor. İndirirken hemen izlemeye başlayabilir ya da sadece indirip sonra izleyebilirsin.")}</p>
            <div className="modal-actions">
              <button className="chip" onClick={() => setAskStream(null)}>{tt("Vazgeç")}</button>
              <button className="ghost sm" onClick={() => { const a = askStream; setAskStream(null); downloadTorrent(a.src); flash(tt("İndirme başladı · İndirmeler'den takip edebilirsin"), "ok", 4000); }}>{tt("Sadece indir")}</button>
              <button className="primary" autoFocus onClick={() => { const a = askStream; setAskStream(null); loadRef.current(a.path, a.start, true); }}>{tt("İndirerek izle")}</button>
            </div>
          </div>
        </div>
      )}
      {torrentDlg && <TorrentDialog initial={linkInit} onOpen={(src) => { setTorrentDlg(false); setLinkInit(undefined); load(src); }} onClose={() => { setTorrentDlg(false); setLinkInit(undefined); }} />}
      {tLoad && (
        <TorrentLoader phase={tLoad.phase} name={tLoad.name} stat={torrents.find((t) => t.id === tLoad.id)}
          onCancel={() => { tCancel.current++; setTLoad(null); mpv("stop"); }} />
      )}
      {subDlg && (
        <SubtitleDialog path={subDlg} onClose={() => setSubDlg(null)}
          onAttach={(file, label) => attachSubtitle(subDlg, file, label)} />
      )}
      {nextUp && (
        <div className="next-up">
          <div className="muted small">{tt("Sonraki bölüm")}</div>
          <div className="next-title">{nextUp.title}</div>
          <div className="next-actions">
            <button className="primary light" onClick={() => { setNextUp(null); load(nextUp.path); }}>
              <Icon d={I.play} fill size={18} />  {tt("Oynat")} {nextUp.count > 0 ? `(${nextUp.count})` : ""}
            </button>
            <button className="ghost sm" onClick={() => setNextUp(null)}>{tt("İptal")}</button>
          </div>
        </div>
      )}
      {menu && playing && (
        <ContextMenu s={s} x={menu.x} y={menu.y} onClose={() => setMenu(null)} extra={[
          ...(nextFile ? [{ label: tt("Sonraki bölüm"), act: () => load(nextFile.path) }] : []),
          { label: tt("Altyazı ara…"), hint: "U", act: () => setSubDlg(s.path) },
          { label: tt("Altyazı senkronu"), hint: "S", act: () => setShowSync(true) },
          { label: tt("Her zaman üstte"), on: onTop, act: () => { getCurrentWindow().setAlwaysOnTop(!onTop); setOnTop(!onTop); } },
          { label: tt("Tam ekran"), hint: "F", act: toggleFull },
          { label: tt("Adını kopyala"), act: () => { navigator.clipboard.writeText(titleParts.show + (titleParts.code ? " " + titleParts.code : "")); showOsd(tt("Ad kopyalandı")); } },
          { label: tt("Dosya aç…"), act: openFile },
        ]} />
      )}
      {toast && <div className={"toast " + toast.kind}>{toast.kind === "ok" && <Icon d={I.check} />}{toast.text}</div>}
      {settings && (
        <Settings onTour={() => { setSettings(false); setTour(true); }}
          onClose={() => setSettings(false)} />
      )}
      {tour && !playing && <Tour onClose={() => setTour(false)} onSettings={() => setSettings(true)} posters={lib.items.map((x) => x.meta?.poster ?? null).filter(Boolean).slice(0, 12)} />}
    </div>
  );
}
