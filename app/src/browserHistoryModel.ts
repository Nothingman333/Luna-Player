import { browserAddress } from "./browserModel";
import { browserTabSearch, cleanWebTabs } from "./browserWorkspaceModel";
import type { SavedWebTab } from "./browserWorkspaceModel";
import { BANGS, parseBang, searchedWords } from "./browserSearchModel";
import type { SearchEngine } from "./browserSearchModel";

/**
 * Luna Web's own history: pages that finished loading, kept only on this computer (localStorage
 * "lunaWebHistory"), paused with one switch. Pure helpers; Browser.tsx reads and writes the rows.
 */
export type WebVisit = { url: string; title: string; at: number; first: number; count: number; lastAdded?:boolean };
export const HISTORY_KEY = "lunaWebHistory", HISTORY_PAUSED_KEY = "lunaWebHistoryPaused", SESSION_KEY = "lunaWebLastSession", HIDDEN_SITES_KEY = "lunaWebHiddenSites";
export const HISTORY_LIMIT = 1000;

const plainUrl = (url: string) => { try { return browserAddress(url) === url; } catch { return false; } };
export const validVisit = (x: any): x is WebVisit => !!x && typeof x.url === "string" && x.url.length <= 2048 && plainUrl(x.url)
  && typeof x.title === "string" && x.title.length <= 300 && Number.isFinite(x.at) && Number.isFinite(new Date(x.at).getTime()) && Number.isFinite(x.first) && x.first <= x.at
  && Number.isInteger(x.count) && x.count >= 1;

/** Damaged rows are dropped one by one, never the whole history. */
export function readVisits(raw: string | null): WebVisit[] {
  if (!raw) return [];
  try {
    const rows:unknown=JSON.parse(raw);if(!Array.isArray(rows))return [];
    const merged=new Map<string,WebVisit>();
    for(const row of rows.filter(validVisit).sort((a,b)=>b.at-a.at)){const old=merged.get(row.url);if(old)old.count=Math.max(old.count,row.count);else merged.set(row.url,{...row});}
    return [...merged.values()].slice(0,HISTORY_LIMIT);
  }catch{return [];}

}

const cleanTitle = (title: string, url: string) => title.replace(/\s+/g, " ").trim().slice(0, 300) || hostLabel(url);
export const hostLabel = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };

/** One finished page load. The newest visit comes first; repeated loads raise the count. */
export function recordVisit(rows: WebVisit[], url: string, title: string, at: number, limit = HISTORY_LIMIT): WebVisit[] {
  if (!plainUrl(url) || url.length > 2048) return rows;
  const old = rows.find(v => v.url === url);
  // A reload or a redirect landing seconds later is the same visit, not a new one.
  const repeat = old && at>=old.at && at - old.at < 30_000;
  const visit: WebVisit = { url, title: cleanTitle(title || old?.title || "", url), at, first: Math.min(old?.first??at,at), lastAdded:!repeat, count: (old?.count ?? 0) + (repeat ? 0 : 1) || 1 };
  return [visit, ...rows.filter(v => v.url !== url)].slice(0, limit);
}

/** The title usually arrives after the load event: it names the newest visit of that address. */
export function retitleVisit(rows: WebVisit[], url: string, title: string): WebVisit[] {
  const clean = title.replace(/\s+/g, " ").trim().slice(0, 300);
  if (!clean || !rows.some(v => v.url === url && v.title !== clean)) return rows;
  return rows.map(v => v.url === url ? { ...v, title: clean } : v);
}

/** A failed load (error page) right after it was recorded is taken back out. */
export function forgetFailedVisit(rows: WebVisit[], url: string, now: number): WebVisit[] {
  const v = rows.find(r => r.url === url);
  if (!v || v.lastAdded===false || now - v.at > 60_000) return rows;
  return v.count <= 1 ? rows.filter(r => r.url !== url) : rows.map(r => r.url === url ? { ...r, count: r.count - 1 } : r);
}

export const clearVisitsSince = (rows: WebVisit[], since: number) => rows.filter(v => v.at < since);
export const removeVisit = (rows: WebVisit[], url: string) => rows.filter(v => v.url !== url);
export const removeSite = (rows: WebVisit[], host: string) => rows.filter(v => hostLabel(v.url) !== host);

/** Frequency × recency: a page visited often lately beats one visited once long ago. */
export function frecency(v: WebVisit, now: number): number {
  const days = Math.max(0, now - v.at) / 86_400_000;
  const recency = days < 1 ? 100 : days < 4 ? 70 : days < 14 ? 50 : days < 31 ? 30 : days < 90 ? 10 : 2;
  return Math.log2(1 + v.count) * recency + (v.count > 1 ? 5 : 0);
}

export type TopSite = { host: string; url: string; title: string; score: number };
/** Most visited sites (one tile per host). The tile opens the address visited most on that host. */
export function topSites(rows: WebVisit[], now: number, limit = 8, hidden: string[] = []): TopSite[] {
  const sites = new Map<string, { best: WebVisit; bestScore: number; score: number }>();
  for (const v of rows) {
    const host = hostLabel(v.url);
    if (hidden.includes(host) || searchedWords(v.url)) continue; // results pages are not places
    const score = frecency(v, now), site = sites.get(host);
    if (!site) sites.set(host, { best: v, bestScore: score, score });
    else { site.score += score; if (score > site.bestScore) { site.best = v; site.bestScore = score; } }
  }
  return [...sites.entries()].map(([host, s]) => ({ host, url: s.best.url, title: s.best.title, score: s.score }))
    .sort((a, b) => b.score - a.score || a.host.localeCompare(b.host)).slice(0, limit);
}

/** History search: every word must appear in the title or address (accents and İ/ı ignored). */
export function searchVisits(rows: WebVisit[], query: string): WebVisit[] {
  const words = browserTabSearch(query).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return rows;
  return rows.filter(v => { const hay = browserTabSearch(v.title + " " + v.url); return words.every(w => hay.includes(w)); });
}

export type DayGroup = { key: string; label: string; rows: WebVisit[] };
/** History grouped by local day, newest first: Today, Yesterday, then dates. */
export function groupVisitsByDay(rows: WebVisit[], now: number, tr: boolean): DayGroup[] {
  const startOf = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const today = startOf(now), groups = new Map<string, DayGroup>();
  for (const v of [...rows].sort((a, b) => b.at - a.at)) {
    const day = startOf(v.at), key = String(day);
    const label = day === today ? (tr ? "Bugün" : "Today") : day === startOf(today - 1) ? (tr ? "Dün" : "Yesterday")
      : new Date(day).toLocaleDateString(tr ? "tr-TR" : "en-GB", { weekday: "long", day: "numeric", month: "long", ...(new Date(day).getFullYear() !== new Date(now).getFullYear() ? { year: "numeric" } : {}) });
    if (!groups.has(key)) groups.set(key, { key, label, rows: [] });
    groups.get(key)!.rows.push(v);
  }
  return [...groups.values()];
}

export type Suggestion =
  | { kind: "tab"; id: number; title: string; url: string }
  | { kind: "bookmark" | "history"; title: string; url: string }
  | { kind: "search"; title: string; query: string }
  | { kind: "bang"; title: string; key: string; query: string };

/** How strongly a page matches what was typed: the start of the host counts most. */
function matchScore(input: string, title: string, url: string): number {
  const words = browserTabSearch(input).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 0;
  const host = browserTabSearch(hostLabel(url)), hay = browserTabSearch(title + " " + url.replace(/^https?:\/\/(www\.)?/, ""));
  if (!words.every(w => hay.includes(w))) return 0;
  const first = words[0];
  return (host.startsWith(first) ? 60 : 0) + (browserTabSearch(url.replace(/^https?:\/\/(www\.)?/, "")).startsWith(browserTabSearch(input.trim())) ? 40 : 0)
    + (browserTabSearch(title).startsWith(first) ? 15 : 0) + 10;
}

/**
 * Address-bar suggestions: a bang hint, open tabs (switch instead of opening twice), favourites, then
 * history by match and frecency, and the search itself last. At most `limit` rows, no address twice.
 */
export function webSuggestions(input: string, sources: { tabs: { id: number; title: string; url: string }[]; bookmarks: SavedWebTab[]; history: WebVisit[] },
  engine: SearchEngine, now: number, tr: boolean, limit = 7): Suggestion[] {
  const text = input.trim();
  if (!text) return [];
  const rows: Suggestion[] = [], seen = new Set<string>();
  if (text.startsWith("!")) {
    const hit = parseBang(text);
    if (hit) rows.push({ kind: "bang", key: hit.bang.key, query: hit.query, title: hit.query ? (tr ? `${hit.bang.name} içinde ara: ${hit.query}` : `Search ${hit.bang.name} for ${hit.query}`) : (tr ? `${hit.bang.name} sitesine git` : `Go to ${hit.bang.name}`) });
    else {
      const typed = text.slice(1).toLocaleLowerCase("en-US");
      for (const b of BANGS.filter(b => b.key.startsWith(typed)).slice(0, limit))
        rows.push({ kind: "bang", key: b.key, query: "", title: `!${b.key} · ${b.name}` });
    }
    return rows.slice(0, limit);
  }
  for (const t of sources.tabs) if (matchScore(text, t.title, t.url) && !seen.has(t.url)) { seen.add(t.url); rows.push({ kind: "tab", id: t.id, title: t.title, url: t.url }); }
  const marks = sources.bookmarks.map(b => ({ b, s: matchScore(text, b.title, b.url) })).filter(x => x.s).sort((a, b) => b.s - a.s);
  for (const { b } of marks) if (!seen.has(b.url)) { seen.add(b.url); rows.push({ kind: "bookmark", title: b.title, url: b.url }); }
  const past = sources.history.map(v => ({ v, s: matchScore(text, v.title, v.url) })).filter(x => x.s && !searchedWords(x.v.url))
    .sort((a, b) => (b.s + frecency(b.v, now)) - (a.s + frecency(a.v, now)));
  for (const { v } of past) if (!seen.has(v.url)) { seen.add(v.url); rows.push({ kind: "history", title: v.title, url: v.url }); }
  const pages = rows.slice(0, limit - 1);
  // Past searches with the same start come right after the pages ("dune" → "dune part two").
  const searches = new Set<string>();
  for (const v of sources.history) {
    const words = searchedWords(v.url);
    if (words && words.toLocaleLowerCase() !== text.toLocaleLowerCase() && browserTabSearch(words).startsWith(browserTabSearch(text))) searches.add(words);
    if (searches.size >= 2) break;
  }
  const search: Suggestion = { kind: "search", query: text, title: tr ? `${engine.name} ile ara: ${text}` : `Search ${engine.name} for ${text}` };
  return [...pages, search, ...[...searches].map(s => ({ kind: "search" as const, query: s, title: s }))].slice(0, limit);
}

/** The open tabs as they were, to offer "continue where you left off" next time. */
export const sessionTabs = (tabs: { title: string; url: string }[]) => (Array.isArray(tabs)?tabs:[]).flatMap(tab=>cleanWebTabs([tab],1)).slice(0,8);
export function readSession(raw: string | null): SavedWebTab[] {
  try { const data = JSON.parse(raw || "null"); return sessionTabs(Array.isArray(data) ? data : data?.tabs); } catch { return []; }
}

/** A stable hue per host for the letter avatars (no network needed). */
export function siteHue(host: string): number {
  let h = 0;
  for (const ch of host) h = (h * 31 + ch.codePointAt(0)!) % 360;
  return h;
}

/** Morning / afternoon / evening / night greeting for the start page. */
export function greeting(hour: number, tr: boolean): string {
  if (hour >= 5 && hour < 12) return tr ? "Günaydın" : "Good morning";
  if (hour >= 12 && hour < 18) return tr ? "İyi günler" : "Good afternoon";
  if (hour >= 18 && hour < 23) return tr ? "İyi akşamlar" : "Good evening";
  return tr ? "İyi geceler" : "Good night";
}
