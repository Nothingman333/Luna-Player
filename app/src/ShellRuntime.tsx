import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { tt } from "./i18n";
import { mpv, MpvState, setProp } from "./mpv";
import { nextTrack, prevTrack, toggleMusicPause, useMusic } from "./Music";
import { store } from "./library";
import { AUTOEQ_LABEL, autoEqFilter, parseAutoEq } from "./autoEq";
import { enqueueWhisper } from "./SubtitleStudio";
import * as S from "./studioBridge";
import { applySearchEngine } from "./searchEngine";
import { MediaAction, notifyUser, setMediaKeys, setTray, shellPrefs, syncWatcher } from "./shellBridge";

export const replayGainPref = () => { const v = store.get("replayGain"); return v === "track" || v === "album" ? v : "no"; };
/** The saved headphone correction (an AutoEq file's text), or "". */
export const autoEqText = () => store.get("autoEq") ?? "";
export const autoEqName = () => store.get("autoEqName") ?? "";

const VIDEO = /\.(mkv|mp4|avi|mov|wmv|webm|m4v|ts|m2ts|flv|mpg|mpeg)$/i;
const nameOf = (p: string) => (p.split(/[\\/]/).pop() ?? p).replace(/\.[^.]+$/, "");

/**
 * Everything the Windows shell features do while Luna runs: the tray menu and the global media keys
 * control what plays, the folder watcher rescans the libraries (and may start Whisper for new films
 * without subtitles), and the sound extras (ReplayGain, headphone correction) follow every file.
 * Renders nothing; mounted once, next to the player.
 */
export function ShellRuntime({ s, film }: { s: MpvState; film: boolean }) {
  const m = useMusic();
  // the handlers always see the newest state without being registered again
  const live = useRef({ s, film, music: !!m.now });
  live.current = { s, film, music: !!m.now };

  const act = (a: MediaAction) => {
    const { s: st, film: f, music } = live.current;
    if (a === "stop") { if (f) void setProp("pause", true); else if (music) toggleMusicPause(); return; }
    if (a === "playpause") { if (f) void mpv("cycle", "pause"); else if (music) toggleMusicPause(); return; }
    if (!f && music) { if (a === "next") nextTrack(); else prevTrack(st.time); }
  };
  const actRef = useRef(act); actRef.current = act;

  // ---- start-up and every change of the Settings switches
  useEffect(() => {
    const apply = () => {
      applySearchEngine();
      void setTray(shellPrefs.tray());
      void setMediaKeys(shellPrefs.mediaKeys(), (a) => actRef.current(a));
      void syncWatcher(true);
    };
    apply();
    window.addEventListener("luna-shell-prefs", apply);
    return () => window.removeEventListener("luna-shell-prefs", apply);
  }, []);

  // ---- folders added or removed: the watcher follows
  useEffect(() => {
    let t = 0;
    const f = () => { clearTimeout(t); t = window.setTimeout(() => void syncWatcher(), 1500); };
    window.addEventListener("luna-library", f);
    return () => { clearTimeout(t); window.removeEventListener("luna-library", f); };
  }, []);

  // ---- events from the native side
  useEffect(() => {
    const subs: Promise<() => void>[] = [
      listen<string>("tray-action", (e) => { const a = e.payload === "playpause" || e.payload === "next" || e.payload === "prev" ? e.payload : null; if (a) actRef.current(a); }),
      listen("window-hidden", () => { if (live.current.film && !live.current.s.paused) void setProp("pause", true); }),
      listen<{ kinds: string[]; paths: string[] }>("folders-changed", (e) => {
        const kinds = (e.payload?.kinds ?? []).filter((k) => k === "film" || k === "music" || k === "book");
        if (!kinds.length) return;
        window.dispatchEvent(new CustomEvent("luna-rescan", { detail: { kinds } }));
        const paths = e.payload?.paths ?? [];
        void notifyUser("library", tt("Luna Player"), tt("Kütüphaneye yeni dosyalar geldi: {0}", paths.slice(0, 3).map(nameOf).join(", ") + (paths.length > 3 ? "…" : "")));
        if (kinds.includes("film") && shellPrefs.autoWhisper()) window.setTimeout(() => void whisperForNew(paths), 8000);
      }),
    ];
    return () => { subs.forEach((p) => void p.then((u) => u()).catch(() => {})); };
  }, []);

  // ---- sound extras follow every file mpv loads (films and songs)
  useEffect(() => {
    if (!s.path) return;
    void setProp("replaygain", replayGainPref());
    void mpv("af", "remove", AUTOEQ_LABEL).catch(() => {});
    const eq = store.get("autoEqOn") === "1" ? parseAutoEq(autoEqText()) : null;
    if (eq) void mpv("af", "add", `${AUTOEQ_LABEL}:${autoEqFilter(eq)}`).catch(() => {});
  }, [s.path]);
  // a change in Settings applies at once
  useEffect(() => {
    const f = () => {
      void setProp("replaygain", replayGainPref());
      void mpv("af", "remove", AUTOEQ_LABEL).catch(() => {});
      const eq = store.get("autoEqOn") === "1" ? parseAutoEq(autoEqText()) : null;
      if (eq) void mpv("af", "add", `${AUTOEQ_LABEL}:${autoEqFilter(eq)}`).catch(() => {});
    };
    window.addEventListener("luna-sound-prefs", f);
    return () => window.removeEventListener("luna-sound-prefs", f);
  }, []);
  return null;
}

/** New video files that have no subtitle yet go to the Whisper queue (only when an engine and a model are already there). */
async function whisperForNew(paths: string[]) {
  const videos = [...new Set(paths.filter((p) => VIDEO.test(p) && store.get("hasSub:" + p) !== "1"))].slice(0, 10);
  if (!videos.length) return;
  const st = await S.whisperStatus().catch(() => null);
  if (!S.pickEngine(st) || !S.pickModel(st)) return;
  const sidecar = await invoke<number[]>("subs_beside", { paths: videos }).catch(() => videos.map(() => 1));
  const todo = videos.filter((_, i) => !sidecar[i]);
  if (todo.length) enqueueWhisper(todo.map((p) => ({ path: p, title: nameOf(p) })), S.prefs.lang(), false, { prompt: "", tidy: true });
}
