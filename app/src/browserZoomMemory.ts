/**
 * Page zoom remembered per site, like other browsers: zoom a site once and it opens at that zoom again.
 * Pure functions and no imports. Stored in localStorage "lunaWebSiteZoom" (host → factor); 1 is never stored.
 */
export type ZoomMap = Record<string, number>;
export const MAX_ZOOM_SITES = 200;

export function siteKey(url: unknown): string | null {
  if (typeof url !== "string") return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.hostname.toLowerCase().replace(/^www\./, "") || null;
  } catch { return null; }
}

const validZoom = (z: unknown): z is number => typeof z === "number" && Number.isFinite(z) && z >= 0.25 && z <= 5;

export function cleanZoomMap(raw: unknown): ZoomMap {
  const out: ZoomMap = Object.create(null);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  let n = 0;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (n >= MAX_ZOOM_SITES) break;
    if (!/^[a-z0-9.\-[\]:]{1,253}$/.test(key) || key === "__proto__" || !validZoom(value) || Math.abs(value - 1) < 0.001) continue;
    out[key] = Math.round(value * 100) / 100; n++;
  }
  return out;
}

/** The newest choice goes last; the oldest sites fall off past the cap. */
export function rememberZoom(map: ZoomMap, url: string, zoom: number): ZoomMap {
  const key = siteKey(url);
  if (!key || !validZoom(zoom)) return map;
  const value = Math.round(zoom * 100) / 100;
  if (Math.abs(value - 1) < 0.001) { if (!(key in map)) return map; const next = { ...map }; delete next[key]; return next; }
  if (map[key] === value) return map;
  const next: ZoomMap = {};
  for (const [k, v] of Object.entries(map)) if (k !== key) next[k] = v;
  next[key] = value;
  const keys = Object.keys(next);
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_ZOOM_SITES))) delete next[k];
  return next;
}

export function zoomFor(map: ZoomMap, url: string): number {
  const key = siteKey(url);
  return key && Object.prototype.hasOwnProperty.call(map, key) && validZoom(map[key]) ? map[key] : 1;
}
