/**
 * Windows shell features, each off until switched on in Settings: tray, global media keys, start with
 * Windows, notifications, the taskbar progress bar and the library-folder watcher. Every call here
 * can fail (a key another program owns, a notification permission denied): it then does nothing.
 */
import { invoke } from "./nativeCore";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow, ProgressBarStatus } from "@tauri-apps/api/window";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { isRegistered, unregister } from "@tauri-apps/plugin-global-shortcut";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { store } from "./library";

export type NotifyKind = "whisper" | "library" | "episode" | "backup";
export const NOTIFY_KINDS: NotifyKind[] = ["whisper", "library", "episode", "backup"];

const flag = (k: string) => store.get(k) === "1";
export const shellPrefs = {
  tray: () => flag("shellTray"),
  mediaKeys: () => flag("shellMedia"),
  watch: () => flag("shellWatch"),
  autoWhisper: () => flag("shellAutoWhisper"),
  notify: (k: NotifyKind) => store.json<Record<string, boolean>>("shellNotify", {})[k] === true,
  set: (k: "shellTray" | "shellMedia" | "shellWatch" | "shellAutoWhisper", on: boolean) => { store.set(k, on ? "1" : "0"); window.dispatchEvent(new Event("luna-shell-prefs")); },
  setNotify: (k: NotifyKind, on: boolean) => { store.set("shellNotify", JSON.stringify({ ...store.json<Record<string, boolean>>("shellNotify", {}), [k]: on })); },
};

// ---------- tray ----------
export const setTray = (on: boolean) => invoke("set_tray_mode", { on }).catch(() => {});

// ---------- notifications ----------
/** Asks Windows for permission when it isn't given yet; true when notifications may be sent. */
export async function notifyAllowed(ask = false): Promise<boolean> {
  try {
    if (await isPermissionGranted()) return true;
    return ask && (await requestPermission()) === "granted";
  } catch { return false; }
}
/** A system notification while Luna is in the background (in front, the screen already says it). */
export async function notifyUser(kind: NotifyKind, title: string, body: string): Promise<void> {
  if (!shellPrefs.notify(kind) || (typeof document !== "undefined" && document.hasFocus())) return;
  if (!(await notifyAllowed())) return;
  try { sendNotification({ title: title.slice(0, 80), body: body.slice(0, 200) }); } catch { /* nothing to do */ }
}

// ---------- taskbar progress ----------
let lastProgress: number | null | undefined;
/** 0–100 on Luna's taskbar button; null removes it. */
export function setTaskbarProgress(pct: number | null) {
  const v = pct == null ? null : Math.max(0, Math.min(100, Math.round(pct)));
  if (v === lastProgress) return;
  lastProgress = v;
  getCurrentWindow().setProgressBar(v == null ? { status: ProgressBarStatus.None } : { status: ProgressBarStatus.Normal, progress: v }).catch(() => {});
}

// ---------- global media keys ----------
const MEDIA_KEYS = ["MediaPlayPause", "MediaTrackNext", "MediaTrackPrevious", "MediaStop"] as const;
export type MediaAction = "playpause" | "play" | "pause" | "next" | "prev" | "stop" | "seek" | "seek-relative" | "volume";
let mediaListener: (() => void) | undefined;
let mediaGeneration = 0;
/** Releases legacy reservations and lets Windows route media keys to Luna's SMTC session. */
export async function setMediaKeys(on: boolean, handler: (a: MediaAction, value?: number) => void): Promise<void> {
  const generation = ++mediaGeneration;
  mediaListener?.(); mediaListener = undefined;
  for (const key of MEDIA_KEYS) {
    try { if (await isRegistered(key)) await unregister(key); } catch { /* legacy reservation absent */ }
  }
  if (generation !== mediaGeneration) return;
  if (on) {
    const unlisten = await listen<{action: MediaAction; value?: number}>("media-action", ({payload}) => handler(payload.action, payload.value));
    if (generation !== mediaGeneration) { unlisten(); return; }
    mediaListener = unlisten;
  }
  await invoke("media_controls_enable", {on});
  window.dispatchEvent(new Event("luna-media-ready"));
}
export const updateMediaControls = (playback: {title: string; artist?: string; album?: string; cover?: string | null; duration: number; position: number; paused: boolean; active: boolean}) =>
  invoke("media_controls_update", {playback}).catch(() => {});

// ---------- start with Windows ----------
export const autostartOn = () => isEnabled().catch(() => false);
export async function setAutostart(on: boolean): Promise<boolean> {
  try { if (on) await enable(); else await disable(); return await isEnabled(); } catch { return false; }
}

// ---------- library folder watcher ----------
let watchSig = "";
/** Starts (or stops) watching the film, music and book folders; the app hears `folders-changed`. */
export async function syncWatcher(force = false): Promise<number> {
  const lists = shellPrefs.watch()
    ? [store.json<string[]>("folders", []), store.json<string[]>("musicFolders", []), store.json<string[]>("bookFolders", [])] : [[], [], []];
  const sig = JSON.stringify(lists);
  if (!force && sig === watchSig) return -1;
  watchSig = sig;
  return invoke<number>("watch_folders", { film: lists[0], music: lists[1], books: lists[2] }).catch(() => 0);
}
