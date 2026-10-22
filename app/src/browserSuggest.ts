/**
 * Address-bar suggestions and the "recently visited" list of Luna Web (the last 200 pages; Ctrl+H shows them all).
 * Pure functions only, and no imports: the regression scripts load this file on its own.
 * Everything stays on this computer (localStorage "lunaWebRecent"); nothing here touches the network.
 */
export type RecentVisit = { url: string; title: string; at: number; visits: number };
export type SuggestTab = { id: number; title: string; url: string };
export type SuggestMark = { title: string; url: string };
export type Suggestion = { kind: "go" | "search" | "tab" | "bookmark" | "recent"; title: string; url: string; id?: number; engine?: string };
export type SuggestContext = {
  tabs: SuggestTab[];
  bookmarks: SuggestMark[];
  recent: RecentVisit[];
  /** How the address bar would treat the typed text (an address to open, or a web search). */
  resolve: (text: string) => { url: string; kind: "go" | "search"; engine?: string } | null;
  now?: number;
};

export const MAX_RECENT = 200;
const SEARCH_HOSTS = /(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|brave\.com|startpage\.com|ecosia\.org|yandex\.[a-z]+)$/i;

/** Case, accents and the Turkish dotted/dotless i do not matter when matching. */
const fold = (text: string) => text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i").toLowerCase();

/** A plain web address without credentials or a fragment, or null. Luna's own origins never count as a visit. */
export function visitAddress(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 2048) return null;
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password || !url.hostname) return null;
  if (url.hostname === "tauri.localhost" || url.hostname.endsWith(".tauri.localhost")) return null;
  if (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && url.port === "1420") return null;
  url.hash = "";
  return url.href;
}

export const hostName = (url: string): string => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };

/** A search engine's results page is not a place worth coming back to. */
export function isSearchResultUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (!SEARCH_HOSTS.test(u.hostname)) return false;
    return /^\/(?:search|do\/search)\/?$/.test(u.pathname) || ((u.pathname === "/" || u.pathname === "/search/") && (u.searchParams.has("q") || u.searchParams.has("text")));
  } catch { return false; }
}

const placeholderTitle = (title: string, url: string) => !title || title === hostName(url) || title === new URL(url).hostname;
const tidyTitle = (value: unknown) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 160) : "");

/** Reads stored visits defensively: bad rows are dropped, duplicates merged, newest first, at most `limit`. */
export function cleanRecent(raw: unknown, limit: number = MAX_RECENT): RecentVisit[] {
  if (!Array.isArray(raw) || !Number.isFinite(limit) || limit < 1) return [];
  const rows: RecentVisit[] = [];
  const seen = new Set<string>();
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const url = visitAddress((x as any).url);
    if (!url || isSearchResultUrl(url) || !Number.isFinite((x as any).at) || (x as any).at < 0) continue;
    const visits = Number.isInteger((x as any).visits) && (x as any).visits >= 1 ? Math.min(9999, (x as any).visits) : 1;
    rows.push({ url, title: tidyTitle((x as any).title) || hostName(url), at: (x as any).at, visits });
  }
  rows.sort((a, b) => b.at - a.at);
  return rows.filter(r => !seen.has(r.url) && seen.add(r.url)).slice(0, Math.min(200, Math.floor(limit)));
}

/** Notes that a page finished loading. Reloads within ten seconds count once. */
export function recordVisit(rows: RecentVisit[], visit: { url: string; title?: string }, now: number, limit: number = MAX_RECENT): RecentVisit[] {
  const url = visitAddress(visit.url);
  if (!url || isSearchResultUrl(url) || !Number.isFinite(now)) return rows;
  const title = tidyTitle(visit.title);
  const at = rows.findIndex(r => r.url === url);
  if (at >= 0) {
    const old = rows[at], quick = now - old.at < 10_000;
    const next: RecentVisit = { ...old, title: placeholderTitle(title, url) ? old.title : title, at: now, visits: quick ? old.visits : Math.min(9999, old.visits + 1) };
    return [next, ...rows.filter((_, i) => i !== at)].slice(0, limit);
  }
  return [{ url, title: placeholderTitle(title, url) ? hostName(url) : title, at: now, visits: 1 }, ...rows].slice(0, limit);
}

/** The real title often arrives after the page: it improves a known visit without counting a new one. */
export function updateVisitTitle(rows: RecentVisit[], rawUrl: string, rawTitle: string): RecentVisit[] {
  const url = visitAddress(rawUrl), title = tidyTitle(rawTitle);
  if (!url || !title || placeholderTitle(title, url)) return rows;
  const at = rows.findIndex(r => r.url === url);
  if (at < 0 || rows[at].title === title) return rows;
  return rows.map((r, i) => (i === at ? { ...r, title } : r));
}

export const forgetVisit = (rows: RecentVisit[], url: string): RecentVisit[] => rows.filter(r => r.url !== url);

/** "3 min ago" in the interface language. Used on the start page. */
export function relativeTime(at: number, now: number, tr: boolean): string {
  const seconds = Math.max(0, Math.floor((now - at) / 1000));
  if (seconds < 60) return tr ? "az önce" : "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return tr ? `${minutes} dk önce` : `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return tr ? `${hours} sa önce` : `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return tr ? `${days} gün önce` : `${days} d ago`;
  return new Date(at).toISOString().slice(0, 10);
}

const keyOf = (url: string) => url.replace(/#.*$/, "");

/**
 * What the address bar offers while typing: the typed text itself first, then open tabs, favourites and
 * recent visits that contain every typed word. A page that is open as a tab beats the same page as a
 * favourite, which beats the same page as a visit; the best match of one address is shown once.
 */
export function suggestAddresses(query: string, ctx: SuggestContext, limit: number = 8): Suggestion[] {
  const text = (query ?? "").trim(), cap = Math.max(1, Math.min(20, Math.floor(limit)));
  if (!text) return ctx.recent.slice(0, Math.min(cap, 6)).map(r => ({ kind: "recent" as const, title: r.title, url: r.url }));
  const now = Number.isFinite(ctx.now) ? (ctx.now as number) : Date.now();
  let typed: { url: string; kind: "go" | "search"; engine?: string } | null = null;
  try { typed = ctx.resolve(text); } catch { typed = null; }
  const out: Suggestion[] = typed ? [{ kind: typed.kind, title: text, url: typed.url, ...(typed.engine ? { engine: typed.engine } : {}) }] : [];
  const words = fold(text).split(/\s+/).filter(Boolean);
  const best = new Map<string, { s: Suggestion; score: number }>();
  const consider = (s: Suggestion, base: number, extra = 0) => {
    const title = typeof s.title === "string" ? s.title : "", url = typeof s.url === "string" ? s.url : "";
    if (!url || !words.every(w => fold(title + " " + url).includes(w))) return;
    let score = base + extra;
    const host = fold(hostName(url));
    if (words.some(w => host.startsWith(w))) score += 60;
    if (fold(title).startsWith(words[0])) score += 30;
    const key = keyOf(url), old = best.get(key);
    if (!old || score > old.score) best.set(key, { s: { ...s, title: title || hostName(url), url }, score });
  };
  for (const t of ctx.tabs) consider({ kind: "tab", title: t.title, url: t.url, id: t.id }, 300);
  for (const b of ctx.bookmarks) consider({ kind: "bookmark", title: b.title, url: b.url }, 200);
  for (const r of ctx.recent) {
    const age = now - r.at, fresh = age < 3_600_000 ? 20 : age < 86_400_000 ? 12 : age < 604_800_000 ? 5 : 0;
    consider({ kind: "recent", title: r.title, url: r.url }, 100, Math.min(20, r.visits) + fresh);
  }
  const typedKey = typed ? keyOf(typed.url) : "";
  for (const { s } of [...best.values()].sort((a, b) => b.score - a.score)) {
    if (out.length >= cap) break;
    if (s.kind !== "tab" && keyOf(s.url) === typedKey) continue; // the typed row already opens it
    out.push(s);
  }
  return out;
}
