/** Pure film-catalog bookkeeping (no React, no native calls) so it can be tested without the app:
 *  copies of one film as one group, watch state per film, "continue" info for a card, why a search matched,
 *  the surprise pick, the poster failure memory, tolerant metadata and the right-click menu order. */
import type { Item, Meta, Recent } from "./library";
import { compareFactsFor, itemFacts, libraryYear, matchesWords, matchReason, queryWords, workIdentity } from "./libraryTools";
import type { LibraryFilter, LibrarySort, LibraryView, MatchReason } from "./libraryTools";

export type WatchState = "unwatched" | "started" | "watched";
export const WATCHED_FRACTION = 0.95;

// ---------- which "kind" of catalog a view is, for its saved preferences ----------
/** "movie" or "tv" for the saved view of a catalog page. The records themselves decide; only an empty list falls back to the page title. */
export function catalogKind(items: Pick<Item, "parsed">[], titleIsSeries: boolean): "movie" | "tv" {
  const first = items.find((i) => i && i.parsed && (i.parsed.kind === "movie" || i.parsed.kind === "tv"));
  return first ? first.parsed.kind : titleIsSeries ? "tv" : "movie";
}
export const viewStorageKey = (kind: "movie" | "tv") => "lunaLibraryView:" + kind;

// ---------- recent / finished lookups ----------
export type Progress = { rec: Recent; rank: number };
export function recentIndex(rows: unknown): Map<string, Progress> {
  const out = new Map<string, Progress>();
  if (!Array.isArray(rows)) return out;
  rows.forEach((r: Recent, rank) => { if (r && typeof r.path === "string" && !out.has(r.path)) out.set(r.path, { rec: r, rank }); });
  return out;
}
const fraction = (r?: Recent) => (r && Number.isFinite(r.time) && Number.isFinite(r.duration) && r.duration > 0 ? Math.max(0, Math.min(1, r.time / r.duration)) : 0);
/** 0 = not started, 1 = started, 2 = finished (to the end, or marked by hand). */
export function fileState(rec: Recent | undefined, finished: boolean): 0 | 1 | 2 {
  if (finished || fraction(rec) >= WATCHED_FRACTION) return 2;
  return rec && Number.isFinite(rec.time) && rec.time > 0 ? 1 : 0;
}

// ---------- groups: every copy of one film is one result ----------
/** Copies of a film share a TMDB id; everything else (series, unmatched files) stands alone. */
export function groupId(item: Item): string {
  return item.parsed?.kind === "movie" && itemFacts(item).matched ? workIdentity(item) : "item:" + item.key;
}
export type ResumeInfo = {
  /** The file to continue with, and the card (record) that holds it; null when nothing is half-watched. */
  path: string | null; itemKey: string; fraction: number; remaining: number; episode?: { season?: number; episode?: number };
  /** Series: episodes finished / episodes known. 0 / 0 for films. */
  watched: number; total: number;
};
export type CatalogGroup = {
  id: string; members: Item[]; rep: Item; files: number;
  /** Series: distinct episodes (two copies of an episode count once); 0 for films. */
  episodes: number;
  state: WatchState; reason: MatchReason | null; resume: ResumeInfo | null;
};
export type CatalogParams = {
  query: string; sort: LibrarySort; filter: LibraryFilter; genre: string; decade: string; minRating: number;
  runtime: LibraryView["runtime"]; watch: LibraryView["watch"]; locale: string;
};
export type CatalogContext = { recent: unknown; finished: (path: string) => boolean };
export type CatalogResult = { groups: CatalogGroup[]; list: Item[]; titles: number; files: number; copies: Map<string, number> };

const filesOf = (item: Item) => (Array.isArray(item.files) ? item.files : []);

function groupState(members: Item[], idx: Map<string, Progress>, finished: (p: string) => boolean): WatchState {
  const states = members.flatMap((m) => filesOf(m).map((f) => fileState(idx.get(f.path)?.rec, finished(f.path))));
  if (!states.length) return "unwatched";
  const tv = members[0].parsed.kind === "tv";
  if (tv ? states.every((n) => n === 2) : states.some((n) => n === 2)) return "watched";
  return states.some((n) => n > 0) ? "started" : "unwatched";
}

function resumeOf(members: Item[], idx: Map<string, Progress>, finished: (p: string) => boolean): ResumeInfo | null {
  const tv = members[0].parsed.kind === "tv";
  let best: { path: string; itemKey: string; rank: number; rec: Recent; season?: number; episode?: number } | null = null;
  const episodes = new Map<string, boolean>(); // episode key -> finished (any copy)
  for (const m of members) for (const f of filesOf(m)) {
    const p = idx.get(f.path), fin = fileState(p?.rec, finished(f.path)) === 2;
    if (tv) { const k = f.episode != null ? `${f.season ?? 0}:${f.episode}` : "f:" + f.path; episodes.set(k, (episodes.get(k) ?? false) || fin); }
    if (p && !fin && fileState(p.rec, false) === 1 && (!best || p.rank < best.rank)) best = { path: f.path, itemKey: m.key, rank: p.rank, rec: p.rec, season: f.season, episode: f.episode };
  }
  const watched = tv ? [...episodes.values()].filter(Boolean).length : 0, total = tv ? episodes.size : 0;
  if (!best && !(tv && watched > 0)) return null;
  if (!best) return { path: null, itemKey: members[0].key, fraction: 0, remaining: 0, watched, total };
  const fr = fraction(best.rec);
  return { path: best.path, itemKey: best.itemKey, fraction: fr, remaining: Math.max(0, best.rec.duration - best.rec.time), episode: tv ? { season: best.season, episode: best.episode } : undefined, watched, total };
}

/** Distinct episodes of a series: copies of one episode are one, a file without an episode number counts by itself. */
export function episodeCount(members: Item[]): number {
  const seen = new Set<string>();
  for (const m of members) for (const f of filesOf(m)) seen.add(f.episode != null ? `${f.season ?? 0}:${f.episode}` : "f:" + f.path);
  return seen.size;
}

export function buildGroups(items: Item[]): { id: string; members: Item[] }[] {
  const byId = new Map<string, { id: string; members: Item[] }>();
  for (const item of items) {
    const id = groupId(item);
    const g = byId.get(id);
    if (g) g.members.push(item); else byId.set(id, { id, members: [item] });
  }
  return [...byId.values()];
}

/** The catalog as the page shows it: filtered, sorted, copies of one film together and consistent with each other. */
export function selectCatalog(items: Item[], p: CatalogParams, ctx: CatalogContext): CatalogResult {
  const idx = recentIndex(ctx.recent), words = queryWords(p.query), start = Number(p.decade);
  const out: CatalogGroup[] = [];
  for (const g of buildGroups(items)) {
    const rep = g.members.find((m) => itemFacts(m).matched) ?? g.members[0], f = itemFacts(rep);
    const files = g.members.reduce((n, m) => n + filesOf(m).length, 0);
    // the same film has one genre / year / rating / length, whichever copy is looked at
    if (p.genre && !f.genres.includes(p.genre)) continue;
    if (p.filter === "unmatched" && f.matched) continue;
    if (p.filter === "versions" && !(rep.parsed.kind === "movie" && files > 1)) continue;
    if (p.decade && !(f.year >= start && f.year < start + 10)) continue;
    if (p.minRating === -1 ? f.rating : p.minRating && f.rating < p.minRating) continue;
    if (p.runtime && !(f.runtime > 0 && (p.runtime === "short" ? f.runtime <= 90 : p.runtime === "medium" ? f.runtime > 90 && f.runtime <= 150 : f.runtime > 150))) continue;
    // a search finds the film when any of its copies matches; all copies then stay together
    let reason: MatchReason | null = null;
    if (words.length) {
      const hits = g.members.filter((m) => matchesWords(m, words));
      if (!hits.length) continue;
      const reasons = hits.map((m) => matchReason(m, words));
      reason = reasons.some((r) => r === null) ? null : reasons.find((r) => r && r.kind !== "mixed") ?? reasons[0];
    }
    const state = groupState(g.members, idx, ctx.finished);
    if (p.watch !== "all" && state !== p.watch) continue;
    // the copy where the user stopped comes first
    const rank = (m: Item) => Math.min(...filesOf(m).map((x) => idx.get(x.path)?.rank ?? Infinity));
    const members = g.members.length > 1 ? [...g.members].sort((a, b) => rank(a) - rank(b)) : g.members;
    out.push({ id: g.id, members, rep, files, episodes: rep.parsed.kind === "tv" ? episodeCount(members) : 0, state, reason, resume: resumeOf(members, idx, ctx.finished) });
  }
  const cmp = compareFactsFor(p.sort, p.locale);
  out.sort((a, b) => cmp({ item: a.rep, f: itemFacts(a.rep) }, { item: b.rep, f: itemFacts(b.rep) }));
  const list = out.flatMap((g) => g.members);
  const copies = new Map<string, number>();
  for (const g of out) if (g.rep.parsed.kind === "movie") for (const m of g.members) copies.set(m.key, new Set(g.members.flatMap((x) => filesOf(x).map((f) => f.path))).size);
  return { groups: out, list, titles: out.length, files: out.reduce((n, g) => n + g.files, 0), copies };
}

// ---------- surprise pick ----------
/** Groups with at least one file that is really on disk: not missing, not a link, not a download that has not happened. */
export function playablePool(groups: CatalogGroup[], unusable: (path: string) => boolean): CatalogGroup[] {
  return groups.filter((g) => g.members.some((m) => filesOf(m).some((f) => !unusable(f.path))));
}
/** Watched films are left out only while something unwatched exists among the results. */
export function surprisePool(groups: CatalogGroup[], unusable: (path: string) => boolean): { pool: CatalogGroup[]; skippedWatched: number } {
  const local = playablePool(groups, unusable), fresh = local.filter((g) => g.state !== "watched");
  return fresh.length ? { pool: fresh, skippedWatched: local.length - fresh.length } : { pool: local, skippedWatched: 0 };
}
export function pickSurprise<T extends { id: string }>(pool: T[], lastId: string | null, rand: () => number = Math.random): T | null {
  const others = pool.length > 1 ? pool.filter((g) => g.id !== lastId) : pool;
  if (!others.length) return null;
  const at = Math.floor(rand() * others.length);
  return others[Math.min(others.length - 1, Math.max(0, Number.isFinite(at) ? at : 0))];
}

// ---------- poster failures: remembered for a while, retried when the network is back ----------
export class FailureMemo {
  private at = new Map<string, number>();
  constructor(private now: () => number = Date.now, private ttl = 5 * 60_000, private cap = 4000) {}
  fail(key: string) {
    if (!key) return;
    this.at.delete(key); this.at.set(key, this.now());
    if (this.at.size > this.cap) { const first = this.at.keys().next().value; if (first !== undefined) this.at.delete(first); }
  }
  blocked(key: string): boolean {
    const t = this.at.get(key);
    if (t === undefined) return false;
    if (this.now() - t >= this.ttl) { this.at.delete(key); return false; }
    return true;
  }
  clear() { this.at.clear(); }
  get size() { return this.at.size; }
}
export function versionStore() {
  let v = 0; const subs = new Set<() => void>();
  return { get: () => v, subscribe: (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; }, bump: () => { v++; subs.forEach((f) => f()); } };
}
export const posterFailures = new FailureMemo();
export const posterRetry = versionStore();
/** The scan flag of the library, relayed from the header so the catalog can say what is really going on. */
export const scanState = (() => { let on = false; const s = versionStore(); return { get: () => on, subscribe: s.subscribe, set: (b: boolean) => { if (b !== on) { on = b; s.bump(); } } }; })();
if (typeof window !== "undefined" && typeof window.addEventListener === "function")
  window.addEventListener("online", () => { posterFailures.clear(); posterRetry.bump(); });

// ---------- tolerant metadata for the details page ----------
export type SafeMeta = {
  id: number; kind: "movie" | "tv"; title: string; year: string; overview: string; poster: string | null; backdrop: string | null;
  rating: number; genres: string[]; runtime: number; seasons: number; cast: { id?: number; name: string; character: string; profile: string | null }[];
};
const text = (x: unknown) => (typeof x === "string" ? x : typeof x === "number" && Number.isFinite(x) ? String(x) : "");
const path = (x: unknown) => (typeof x === "string" && x.startsWith("/") ? x : null);
/** A catalog record's metadata with every field in the type the page expects, so a missing or damaged field cannot blank the screen. */
export function safeMeta(meta: Meta | null | undefined, fallbackKind: "movie" | "tv"): SafeMeta | null {
  if (!meta || typeof meta !== "object") return null;
  const m = meta as unknown as Record<string, unknown>;
  const rating = Number(m.rating);
  const cast = Array.isArray(m.cast) ? m.cast.filter((c): c is Record<string, unknown> => !!c && typeof c === "object" && !!text((c as Record<string, unknown>).name)) : [];
  return {
    id: Number.isFinite(Number(m.id)) ? Number(m.id) : 0,
    kind: m.kind === "tv" || m.kind === "movie" ? m.kind : fallbackKind,
    title: text(m.title), year: text(m.year), overview: text(m.overview), poster: path(m.poster), backdrop: path(m.backdrop),
    rating: Number.isFinite(rating) && rating > 0 && rating <= 10 ? rating : 0,
    genres: Array.isArray(m.genres) ? m.genres.filter((g): g is string => typeof g === "string" && !!g.trim()) : [],
    runtime: (() => { const n = Number(m.runtime); return Number.isFinite(n) && n >= 1 && n <= 1440 ? Math.round(n) : 0; })(),
    seasons: (() => { const n = Number(m.seasons); return Number.isInteger(n) && n > 0 && n < 1000 ? n : 0; })(),
    cast: cast.map((c) => ({ id: Number.isFinite(Number(c.id)) && Number(c.id) > 0 ? Number(c.id) : undefined, name: text(c.name), character: text(c.character), profile: path(c.profile) })),
  };
}
/** "1 h 33 min" / "45 min": no "0 h" and no fractions. */
export function formatRuntime(minutes: number, hour: string, min: string): string {
  const n = Math.round(minutes);
  if (!(n > 0)) return "";
  return n < 60 ? `${n} ${min}` : n % 60 ? `${Math.floor(n / 60)} ${hour} ${n % 60} ${min}` : `${n / 60} ${hour}`;
}
/** Time left on a half-watched file: "38 min", "1 h 12 min". */
export function formatRemaining(seconds: number, hour: string, min: string): string {
  const m = Math.max(1, Math.ceil(seconds / 60));
  return formatRuntime(m, hour, min);
}
export const yearOf = libraryYear;

// ---------- right-click menu order ----------
export type MenuLike = { label: string; act: () => void; danger?: boolean } | "sep";
/** Puts menu entries into the given groups (list of label lists, in display order) with one separator between groups.
 *  A label that is in no list stays with the entry before it; entries marked danger go last, on their own. */
export function arrangeMenu<E extends MenuLike>(entries: E[], groups: string[][]): E[] {
  const where = new Map<string, number>();
  groups.forEach((g, i) => g.forEach((l) => where.set(l, i)));
  const buckets: E[][] = [...groups.map(() => []), []];
  let current = 0;
  for (const e of entries) {
    if (e === "sep") continue;
    const entry = e as Exclude<E, "sep">;
    if (entry.danger) { buckets[groups.length].push(e); continue; }
    const w = where.get(entry.label);
    if (w !== undefined) current = w;
    buckets[current].push(e);
  }
  const out: E[] = [];
  for (const b of buckets) if (b.length) { if (out.length) out.push("sep" as E); out.push(...b); }
  return out;
}
