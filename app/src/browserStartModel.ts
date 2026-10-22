/**
 * Luna Web's start page and tab strip: pure helpers with no imports, so the regression scripts can load
 * this file on its own (npm run test:browser-magic). Nothing here touches the network or storage.
 */
export type VisitLike = { url: string; title: string; at: number; visits: number };
export type TopSite = { host: string; name: string; url: string; title: string; visits: number; at: number; score: number };

const DAY = 86_400_000;
/** "en.wikipedia.org" → "wikipedia.org"-like key without the www. */
export const hostKey = (url: string): string => { try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };

const SECOND_LEVEL = new Set(["co", "com", "org", "net", "gov", "ac", "edu", "gen", "bel", "web", "info", "k12", "nom", "ltd", "plc", "or", "ne", "go"]);
const KNOWN_NAMES: Record<string, string> = { imdb: "IMDb", themoviedb: "TMDB", youtube: "YouTube", youtu: "YouTube", github: "GitHub", gitlab: "GitLab", linkedin: "LinkedIn", duckduckgo: "DuckDuckGo", librivox: "LibriVox",
  stackoverflow: "Stack Overflow", openstreetmap: "OpenStreetMap", tiktok: "TikTok", whatsapp: "WhatsApp", soundcloud: "SoundCloud", nytimes: "NYTimes", x: "X", wikimedia: "Wikimedia", bandcamp: "Bandcamp", ebay: "eBay", paypal: "PayPal" };
/** A short display name for a host: "letterboxd.com" → "Letterboxd", "en.wikipedia.org" → "Wikipedia", "imdb.com" → "IMDb", "bbc.co.uk" → "Bbc". */
export function siteName(host: string): string {
  const labels = (host || "").replace(/^www\./, "").split(".").filter(Boolean);
  if (!labels.length) return "";
  if (labels.length === 1 || /^\d+$/.test(labels[labels.length - 1])) return labels.join(".");
  let at = labels.length - 2;
  if (at > 0 && labels[labels.length - 1].length === 2 && SECOND_LEVEL.has(labels[at])) at--;
  const name = labels[Math.max(0, at)];
  if (KNOWN_NAMES[name.toLowerCase()]) return KNOWN_NAMES[name.toLowerCase()];
  return name.charAt(0).toLocaleUpperCase("en-US") + name.slice(1);
}

/** A stable hue (0–359) for a host, so a site's letter tile always has the same colour. */
export function siteHue(host: string): number {
  let h = 2166136261;
  for (const ch of host || "") { h ^= ch.codePointAt(0)!; h = Math.imul(h, 16777619) >>> 0; }
  return h % 360;
}

/**
 * The sites the user really goes back to, from the recent-visit list: visits are summed per site and weighed by how
 * recent they are (today counts fully, last week 70 %, last month 40 %, older 20 %). One page of a site opens that
 * page; several pages of the same site open the site's home page.
 */
export function topSites(rows: VisitLike[], now: number, limit = 8): TopSite[] {
  if (!Array.isArray(rows) || !Number.isFinite(now)) return [];
  const sites = new Map<string, { pages: VisitLike[]; score: number; visits: number; at: number }>();
  for (const r of rows) {
    if (!r || typeof r.url !== "string" || !Number.isFinite(r.at)) continue;
    const host = hostKey(r.url); if (!host) continue;
    const age = Math.max(0, now - r.at), weight = age < DAY ? 1 : age < 7 * DAY ? 0.7 : age < 30 * DAY ? 0.4 : 0.2;
    const visits = Number.isFinite(r.visits) && r.visits > 0 ? Math.min(9999, r.visits) : 1;
    const site = sites.get(host) ?? { pages: [], score: 0, visits: 0, at: 0 };
    site.pages.push(r); site.score += visits * weight; site.visits += visits; site.at = Math.max(site.at, r.at);
    sites.set(host, site);
  }
  const out: TopSite[] = [];
  for (const [host, s] of sites) {
    const single = s.pages.length === 1;
    let url = s.pages[0].url;
    if (!single) { try { url = new URL(s.pages[0].url).origin + "/"; } catch { /* keep the page */ } }
    out.push({ host, name: siteName(host), url, title: single ? (s.pages[0].title || siteName(host)) : siteName(host), visits: s.visits, at: s.at, score: Math.round(s.score * 100) / 100 });
  }
  out.sort((a, b) => b.score - a.score || b.at - a.at || a.host.localeCompare(b.host));
  return out.slice(0, Math.max(0, Math.min(24, Math.floor(limit))));
}

/** Removes every visit of one site (the start page's "forget this site"). */
export const forgetSite = <T extends { url: string }>(rows: T[], host: string): T[] => rows.filter(r => hostKey(r.url) !== host);

export type MoonPhase = { phase: number; illumination: number; waxing: boolean; age: number; index: number; tr: string; en: string };
const SYNODIC = 29.530588853;
// A known new moon: 2000-01-06 18:14 UTC.
const NEW_MOON_2000 = Date.UTC(2000, 0, 6, 18, 14);
const PHASES: [string, string][] = [
  ["Yeni Ay", "New moon"], ["Büyüyen hilal", "Waxing crescent"], ["İlk dördün", "First quarter"], ["Büyüyen şişkin ay", "Waxing gibbous"],
  ["Dolunay", "Full moon"], ["Küçülen şişkin ay", "Waning gibbous"], ["Son dördün", "Last quarter"], ["Küçülen hilal", "Waning crescent"],
];
/** Today's moon (mean synodic month; within about half a day of the real phase), for Luna's start page. */
export function moonPhase(at: number): MoonPhase {
  const days = (at - NEW_MOON_2000) / DAY;
  const age = ((days % SYNODIC) + SYNODIC) % SYNODIC, phase = age / SYNODIC;
  const illumination = (1 - Math.cos(2 * Math.PI * phase)) / 2;
  const index = Math.floor(phase * 8 + 0.5) % 8;
  return { phase, illumination, waxing: phase < 0.5, age, index, tr: PHASES[index][0], en: PHASES[index][1] };
}
/** The lit part of the moon as an SVG path (northern-hemisphere view: a waxing moon is lit on the right). */
export function moonPath(phase: number, cx: number, cy: number, r: number): string {
  const p = ((phase % 1) + 1) % 1, k = Math.cos(2 * Math.PI * p), waxing = p < 0.5;
  const rx = Math.abs(k) * r, limb = waxing ? 1 : 0, term = (k > 0) === waxing ? 0 : 1;
  const n = (v: number) => Math.round(v * 100) / 100;
  return `M${n(cx)} ${n(cy - r)}A${n(r)} ${n(r)} 0 0 ${limb} ${n(cx)} ${n(cy + r)}A${n(rx)} ${n(r)} 0 0 ${term} ${n(cx)} ${n(cy - r)}Z`;
}

/** A greeting for the hour of the day. */
export function greeting(hour: number, tr: boolean): string {
  const h = Number.isFinite(hour) ? ((Math.floor(hour) % 24) + 24) % 24 : 12;
  if (h >= 5 && h < 12) return tr ? "Günaydın" : "Good morning";
  if (h >= 12 && h < 18) return tr ? "İyi günler" : "Good afternoon";
  if (h >= 18 && h < 23) return tr ? "İyi akşamlar" : "Good evening";
  return tr ? "İyi geceler" : "Good night";
}

const fold = (text: string) => text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i").toLowerCase();
export type HistoryGroup<T> = { key: string; label: string; rows: T[] };
/**
 * The history panel: visits grouped by calendar day in local time ("Today", "Yesterday", the weekday within a week,
 * then the date), newest first. `query` keeps visits whose title or address contains every word (accents, case and
 * the Turkish dotted/dotless i do not matter).
 */
export function historyGroups<T extends { url: string; title: string; at: number }>(rows: T[], now: number, tr: boolean, query = ""): HistoryGroup<T>[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const keep = rows.filter(r => r && Number.isFinite(r.at) && words.every(w => fold((r.title || "") + " " + r.url).includes(w))).sort((a, b) => b.at - a.at);
  const dayStart = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const today = dayStart(now), groups: HistoryGroup<T>[] = [];
  const locale = tr ? "tr-TR" : "en-GB";
  for (const r of keep) {
    const start = dayStart(r.at), key = String(start);
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      const daysAgo = Math.round((today - start) / DAY);
      const label = daysAgo <= 0 ? (tr ? "Bugün" : "Today") : daysAgo === 1 ? (tr ? "Dün" : "Yesterday")
        : daysAgo < 7 ? new Date(start).toLocaleDateString(locale, { weekday: "long" })
        : new Date(start).toLocaleDateString(locale, { day: "numeric", month: "long", year: new Date(start).getFullYear() === new Date(now).getFullYear() ? undefined : "numeric" });
      group = { key, label: label.charAt(0).toLocaleUpperCase(locale) + label.slice(1), rows: [] }; groups.push(group);
    }
    group.rows.push(r);
  }
  return groups;
}

/**
 * Pinned tabs always come first, in the order they were pinned. Pinning moves a tab to the end of the pinned block,
 * unpinning moves it to the start of the others; nothing else changes place.
 */
export function pinTab<T extends { id: number }>(tabs: T[], pinned: ReadonlySet<number>, id: number, pin: boolean): { tabs: T[]; pinned: Set<number> } {
  const next = new Set([...pinned].filter(x => tabs.some(t => t.id === x)));
  const tab = tabs.find(t => t.id === id);
  if (!tab || next.has(id) === pin) return { tabs, pinned: next };
  if (pin) next.add(id); else next.delete(id);
  const rest = tabs.filter(t => t.id !== id), lead = rest.filter(t => next.has(t.id)), tail = rest.filter(t => !next.has(t.id));
  return { tabs: pin ? [...lead, tab, ...tail] : [...lead, tab, ...tail], pinned: next };
}

/**
 * Drag and drop in the tab strip: `id` goes before or after `target`. A tab never crosses the line between pinned and
 * other tabs (it is kept at the nearest end of its own block instead).
 */
export function dropTab<T extends { id: number }>(tabs: T[], id: number, target: number, side: "before" | "after", pinned: ReadonlySet<number> = new Set()): T[] {
  const from = tabs.findIndex(t => t.id === id);
  if (from < 0 || id === target || !tabs.some(t => t.id === target)) return tabs;
  const moving = tabs[from], rest = tabs.filter(t => t.id !== id);
  let to = rest.findIndex(t => t.id === target) + (side === "after" ? 1 : 0);
  const pinnedCount = rest.filter(t => pinned.has(t.id)).length;
  to = pinned.has(id) ? Math.min(to, pinnedCount) : Math.max(to, pinnedCount);
  const next = [...rest.slice(0, to), moving, ...rest.slice(to)];
  return next.every((t, i) => t === tabs[i]) ? tabs : next;
}

/** Ctrl+Shift+PageUp / PageDown: one step left or right inside the tab's own block (pinned or not). */
export function stepTab<T extends { id: number }>(tabs: T[], id: number, direction: 1 | -1, pinned: ReadonlySet<number> = new Set()): T[] {
  const at = tabs.findIndex(t => t.id === id), to = at + direction;
  if (at < 0 || to < 0 || to >= tabs.length || pinned.has(tabs[to].id) !== pinned.has(id)) return tabs;
  const next = [...tabs]; [next[at], next[to]] = [next[to], next[at]]; return next;
}
