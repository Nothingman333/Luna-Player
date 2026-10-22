/**
 * Windows shell features, each off until switched on in Settings: tray, global media keys, start with
 * Windows, notifications, the taskbar progress bar and the library-folder watcher. Every call here
 * can fail (a key another program owns, a notification permission denied): it then does nothing.
 */
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, ProgressBarStatus } from "@tauri-apps/api/window";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { isRegistered, register, unregister } from "@tauri-apps/plugin-global-shortcut";
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
export type MediaAction = "playpause" | "next" | "prev" | "stop";
const ACTION: Record<string, MediaAction> = { MediaPlayPause: "playpause", MediaTrackNext: "next", MediaTrackPrevious: "prev", MediaStop: "stop" };
/** Registers (or releases) the media keys for the whole system. Keys another program holds are skipped. */
export async function setMediaKeys(on: boolean, handler: (a: MediaAction) => void): Promise<void> {
  for (const key of MEDIA_KEYS) {
    try {
      const has = await isRegistered(key);
      if (has) await unregister(key);
      if (on) await register(key, (e) => { if (e.state === "Pressed") handler(ACTION[key]); });
    } catch { /* held by another program */ }
  }
}

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
