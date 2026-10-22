/**
 * Native WebView2 signals for Luna Web tabs (browser.rs: nav-done, history, audio, zoom, permission).
 * Pure helpers only: Browser.tsx decides what to show, these functions decide what a signal means.
 */
export type TabNative = { canBack: boolean; canForward: boolean; audio: boolean; zoom: number };
export type NavDone = { url: string; ok: boolean; status: number; http: number };

export const freshNative = (): TabNative => ({ canBack: false, canForward: false, audio: false, zoom: 1 });

/** Zoom steps for the tools menu and Ctrl +/-. The native view accepts factors from 0.25 to 5. */
export const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];

export function nextZoom(current: number, direction: 1 | -1): number {
  const at = Number.isFinite(current) ? current : 1;
  if (direction > 0) return ZOOM_STEPS.find(step => step > at + 0.001) ?? at;
  const lower = ZOOM_STEPS.filter(step => step < at - 0.001);
  return lower.length ? lower[lower.length - 1] : at;
}

/** HistoryChanged: "10" can go back, "01" can go forward, "11" both, "00" neither. */
export function parseHistory(value: string): Pick<TabNative, "canBack" | "canForward"> | null {
  if (!/^[01]{2}$/.test(value)) return null;
  return { canBack: value[0] === "1", canForward: value[1] === "1" };
}

/** IsDocumentPlayingAudio: only the native signal counts; the UI never guesses from the page. */
export function parseAudio(value: string): boolean | null {
  return value === "1" ? true : value === "0" ? false : null;
}

/** ZoomFactorChanged. */
export function parseZoom(value: string): number | null {
  const zoom = Number(value);
  return Number.isFinite(zoom) && zoom >= 0.25 && zoom <= 5 ? zoom : null;
}

/** NavigationCompleted: the last address of that navigation and whether it succeeded. */
export function parseNavDone(value: string): NavDone | null {
  try {
    const data = JSON.parse(value);
    if (!data || typeof data.url !== "string" || typeof data.ok !== "boolean") return null;
    return {
      url: data.url,
      ok: data.ok,
      status: Number.isFinite(data.status) ? data.status : 0,
      http: Number.isFinite(data.http) ? data.http : 0,
    };
  } catch {
    return null;
  }
}

const PERMISSIONS: Record<string, [string, string]> = {
  microphone: ["mikrofon", "microphone"],
  camera: ["kamera", "camera"],
  location: ["konum", "location"],
  notifications: ["bildirim", "notification"],
  clipboard: ["pano", "clipboard"],
  screen: ["ekran paylaşımı", "screen sharing"],
};

/** A permission request that was refused (permissions stay denied). This only names it; it grants nothing. */
export function permissionNotice(kind: string, tr: boolean): string {
  const name = Object.prototype.hasOwnProperty.call(PERMISSIONS, kind) ? PERMISSIONS[kind] : null;
  if (!name) return tr ? "Site bir izin istedi; izin verilmedi." : "The site asked for a permission; it was denied.";
  return tr ? `Site ${name[0]} izni istedi; izin verilmedi.` : `The site asked for ${name[1]} access; it was denied.`;
}

/** The message for a finished navigation of the page in use. A stopped load is not an error. */
export function navFailure(done: NavDone, tr: boolean, stopped: boolean): string | null {
  if (done.ok || stopped) return null;
  const code = done.http > 0 ? ` (HTTP ${done.http})` : "";
  return tr
    ? `Sayfa yüklenemedi${code}. Adresi kontrol edip yeniden dene.`
    : `The page could not be loaded${code}. Check the address and try again.`;
}

/** Changes one tab's native state; the other tabs keep theirs. */
export function patchNative(map: Record<number, TabNative>, id: number, patch: Partial<TabNative>): Record<number, TabNative> {
  const current: TabNative | undefined = map[id];
  return { ...map, [id]: { ...(current ?? freshNative()), ...patch } };
}

/** Forgets a closed tab. */
export function dropNative(map: Record<number, TabNative>, id: number): Record<number, TabNative> {
  if (!(id in map)) return map;
  const next = { ...map };
  delete next[id];
  return next;
}
