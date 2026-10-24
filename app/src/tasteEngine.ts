// Luna's film taste engine, the connected part: TMDB look-ups (cached), the stored model,
// Letterboxd RSS, friends' ratings, recommendations and the optional AI reading of reviews.
// The maths lives in tasteCore.ts; nothing here imports Taste.tsx at run time (no import cycle).
import { invoke } from "./nativeCore";
import { lang, locale } from "./i18n";
import { searchTmdb, store, tmdbGet, tmdbList } from "./library";
import type { SearchHit } from "./library";
import * as C from "./tasteCore";
import type { DiaryLike, Feat, Kind, LbEntry, Match, TasteModel } from "./tasteCore";

const KEY = {
  ids: "tasteIds:v1", feat: "tasteFeat:v1", names: "tasteNames:v1", model: "tasteModel:v1",
  no: "tasteNo:v1", friends: "friendRatings:v1", ai: "tasteAi:v1", recs: "tasteRecs:v1", me: "lbMe",
} as const;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- caches (one storage key each)
let idsMem: Record<string, string> | null = null;
let featMem: Record<string, Feat | 0> | null = null;
let namesMem: Record<string, string> | null = null;
const ids = () => (idsMem ??= store.json<Record<string, string>>(KEY.ids, {}));
const feats = () => (featMem ??= store.json<Record<string, Feat | 0>>(KEY.feat, {}));
const names = () => (namesMem ??= store.json<Record<string, string>>(KEY.names, {}));
let engineGeneration=0;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
/** Writes the caches to storage (batched: a build looks up hundreds of films). */
export function flushCaches() {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  if (idsMem) store.set(KEY.ids, JSON.stringify(idsMem));
  if (featMem) store.set(KEY.feat, JSON.stringify(featMem));
  if (namesMem) store.set(KEY.names, JSON.stringify(namesMem));
}
const later = () => { if (!flushTimer) flushTimer = setTimeout(flushCaches, 2500); };
const listeners = new Set<() => void>();
/** Re-render hook target: called when the model, picks or friends change. */
export const onTasteEngine = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };
const changed = () => listeners.forEach((f) => f());

/** Forgets everything the engine learned (the diary itself is not touched). */
export function resetTasteEngine() {
  engineGeneration++;if(flushTimer){clearTimeout(flushTimer);flushTimer=null;}
  for (const k of [KEY.ids, KEY.feat, KEY.names, KEY.model, KEY.recs, KEY.ai]) store.remove(k);
  idsMem = featMem = namesMem = null;
  changed();
}
export const hasTmdb = () => !!store.get("tmdbKey");

// ---------------------------------------------------------------- feature names
const dn = (type: "language" | "region", code: string) => {
  try { return new Intl.DisplayNames([locale()], { type }).of(type === "region" ? code.toUpperCase() : code) ?? code; } catch { return code; }
};
const LEN: Record<string, [string, string]> = { short: ["Kısa (95 dk altı)", "Short (under 95 min)"], mid: ["Orta uzunluk", "Mid-length"], long: ["Uzun (135 dk üstü)", "Long (over 135 min)"] };
/** A feature key as a reader sees it: "d:525" → "Christopher Nolan", "y:1970" → "1970'ler". */
export function featName(key: string): string {
  const [t, v] = [key.slice(0, 1), key.slice(2)];
  if (t === "y") return lang() === "en" ? `${v}s` : `${v}'ler`;
  if (t === "l") return dn("language", v);
  if (t === "c") return dn("region", v);
  if (t === "r") return (LEN[v] ?? [v, v])[lang() === "en" ? 1 : 0];
  return names()[key] ?? v;
}
export const TYPE_LABEL: Record<C.FeatType, [string, string]> = {
  g: ["Tür", "Genre"], k: ["Tema", "Theme"], d: ["Yönetmen", "Director"], w: ["Senarist", "Writer"], a: ["Oyuncu", "Actor"],
  y: ["Dönem", "Era"], l: ["Dil", "Language"], c: ["Ülke", "Country"], r: ["Süre", "Length"],
};
export const typeLabel = (t: C.FeatType) => TYPE_LABEL[t][lang() === "en" ? 1 : 0];

// ---------------------------------------------------------------- TMDB
/** A TMDB GET that waits and retries on 429; a 404 gives null. */
async function tmdbTry(path: string, params: Record<string, string>): Promise<any | null> {
  for (let i = 0; ; i++) {
    try { return await tmdbGet(path, params); } catch (e) {
      const m = String(e);
      if (/404/.test(m)) return null;
      if (/429/.test(m) && i < 4) { await sleep(1200 * (i + 1)); continue; }
      throw e;
    }
  }
}
/** What a film is made of (genres, themes, people, era, language…), from one TMDB call, cached for good. */
export async function filmFeat(kind: Kind, id: number): Promise<Feat | null> {
  const epoch=engineGeneration;
  const k = `${kind}:${id}`;
  const c = feats()[k];
  if (c !== undefined) return c || null;
  const d = await tmdbTry(`/${kind}/${id}`, { language: locale(), append_to_response: "keywords,credits" });
  if(epoch!==engineGeneration)return null;
  if (!d) { feats()[k] = 0; later(); return null; }
  const nm = names();
  const put = (p: string, list: { id: number; name: string }[]) => list.map((x) => { nm[p + x.id] = x.name; return x.id; });
  const crew: any[] = d.credits?.crew ?? [];
  const uniq = (l: { id: number; name: string }[]) => l.filter((x, i) => x && l.findIndex((y) => y.id === x.id) === i);
  const directors = uniq(kind === "movie" ? crew.filter((x) => x.job === "Director") : (d.created_by ?? [])).slice(0, 3);
  const writers = uniq(crew.filter((x) => ["Screenplay", "Writer", "Story", "Novel", "Author", "Characters"].includes(x.job))).slice(0, 3);
  const f: Feat = {
    t: d.title ?? d.name ?? "",
    y: Number((d.release_date ?? d.first_air_date ?? "").slice(0, 4)) || undefined,
    g: put("g:", d.genres ?? []),
    k: put("k:", (d.keywords?.keywords ?? d.keywords?.results ?? []).slice(0, 20)),
    d: put("d:", directors),
    w: put("w:", writers),
    a: put("a:", (d.credits?.cast ?? []).slice(0, 5)),
    l: d.original_language || undefined,
    c: (kind === "movie" ? (d.production_countries ?? []).map((x: any) => x.iso_3166_1) : d.origin_country ?? []).slice(0, 3),
    rt: d.runtime || d.episode_run_time?.[0] || undefined,
    va: Math.round((d.vote_average ?? 0) * 10) / 10, vc: d.vote_count ?? 0, pop: Math.round(d.popularity ?? 0),
    p: d.poster_path ?? null,
  };
  feats()[k] = f;
  later();
  return f;
}
/** The TMDB id behind a diary title (searched once; the answer, even "not found", is kept). */
export async function resolveId(title: string, year?: string): Promise<{ kind: Kind; id: number } | null> {
  const epoch=engineGeneration;
  const key = C.diaryKey(title, year);
  const known = ids()[key];
  if (known !== undefined) return known ? { kind: known.split(":")[0] as Kind, id: Number(known.split(":")[1]) } : null;
  const y = year ? Number(year) : undefined;
  const clean = title.replace(/\s*\(\d{4}\)\s*$/, "");
  let h: SearchHit | undefined = (await searchTmdb(clean, "movie", y).catch(() => [] as SearchHit[])).find((x) => !year || x.year === year);
  // festival year vs release year: one year off is the same film
  if (!h && y) h = (await searchTmdb(clean, "movie").catch(() => [] as SearchHit[])).find((x) => Math.abs(Number(x.year) - y) <= 1);
  if (!h) h = (await searchTmdb(clean, "tv", y).catch(() => [] as SearchHit[]))[0];
  if(epoch!==engineGeneration)return null;
  ids()[key] = h ? `${h.kind}:${h.id}` : "";
  later();
  return h ? { kind: h.kind, id: h.id } : null;
}
/** The cached features of a diary title, without any network (undefined when not looked up yet). */
export function featOf(title: string, year?: string): Feat | undefined {
  const id = ids()[C.diaryKey(title, year)];
  const f = id ? feats()[id] : undefined;
  return f || undefined;
}
/** A title whose TMDB id is already known (from RSS, the library, a recommendation). */
export function rememberId(title: string, year: string | undefined, kind: Kind, id: number) {
  const key = C.diaryKey(title, year);
  if (!ids()[key]) { ids()[key] = `${kind}:${id}`; later(); }
}
export const knownId = (title: string, year?: string) => ids()[C.diaryKey(title, year)] || undefined;

/** Runs `job` over `list`, `n` at a time, in list order. */
async function pool<T>(list: T[], n: number, job: (t: T, i: number) => Promise<void>, signal?: AbortSignal) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => {
    while (next < list.length && !signal?.aborted) { const i = next++; await job(list[i], i); }
  }));
}

// ---------------------------------------------------------------- the model
export const loadModel = (): TasteModel | null => {
  const m = store.json<TasteModel | null>(KEY.model, null);
  return m&&m.v===1&&m.f&&typeof m.f==="object"&&!Array.isArray(m.f)&&Object.values(m.f).every(x=>Array.isArray(x)&&x.length===4&&x.every(Number.isFinite))&&Array.isArray(m.cal)&&m.cal.length>0&&m.cal.every(Number.isFinite)&&m.stats&&Array.isArray(m.stats.hist)&&Array.isArray(m.stats.q)&&m.acc&&Number.isFinite(m.films)?m:null;
};
export type BuildProgress = { done: number; total: number; found: number; title?: string };
/** Builds the taste model from the diary: looks every rated, liked or watched title up on TMDB (most
 *  telling first, cached, so a stopped build continues where it was), then learns the weights.
 *  Returns null when there are too few films (at least 5 with a signal are needed). */
export async function buildTaste(diary: Record<string, DiaryLike>, onProgress?: (p: BuildProgress) => void, signal?: AbortSignal): Promise<TasteModel | null> {
  if (!hasTmdb()) throw new Error(lang() === "en" ? "Enter your TMDB key in Settings first." : "Önce Ayarlar'dan TMDB anahtarını gir.");
  const epoch=engineGeneration;
  const all = Object.values(diary);
  const stats = C.ratingStats(all.filter((e) => e.rating).map((e) => e.rating!));
  const now = Date.now();
  const todo = all.map((e) => ({ e, sig: C.signalOf(e, stats) }))
    .filter((x): x is { e: DiaryLike; sig: number } => x.sig !== null)
    .sort((a, b) => (b.e.rating || b.e.vote ? 1 : 0) - (a.e.rating || a.e.vote ? 1 : 0) || Math.abs(b.sig) - Math.abs(a.sig) || (b.e.watched ?? b.e.at) - (a.e.watched ?? a.e.at));
  const samples: C.Sample[] = [];
  let done = 0;
  await pool(todo, 6, async ({ e, sig }) => {
    try {
      const id = await resolveId(e.title, e.year);
      const feat = id ? await filmFeat(id.kind, id.id) : null;
      if (feat) samples.push({ key: C.diaryKey(e.title, e.year), sig, w: C.recency(e.watched ?? e.at, now), rating: e.rating, feat });
    } catch { /* network: this one is skipped, the next build tries again */ }
    done++;
    if (done % 4 === 0 || done === todo.length) onProgress?.({ done, total: todo.length, found: samples.length, title: e.title });
  }, signal);
  flushCaches();
  if(signal?.aborted||epoch!==engineGeneration)return null;
  if (samples.length < 5) return null;
  const model = C.buildModel(samples, stats, now);
  store.set(KEY.model, JSON.stringify(model));
  changed();
  return model;
}
/** A film against the stored model (its features are looked up when needed). */
export async function matchFor(kind: Kind, id: number): Promise<{ match: Match; feat: Feat } | null> {
  const model = loadModel();
  if (!model || !hasTmdb()) return null;
  const feat = await filmFeat(kind, id).catch(() => null);
  return feat ? { match: C.matchFilm(model, feat), feat } : null;
}
/** The model as a few lines for the chat assistant ("" when there is none yet). */
export function tasteDigest(): string {
  const m = loadModel();
  return m ? C.digest(m, featName) : "";
}

// ---------------------------------------------------------------- Letterboxd: the user and friends
/** "https://letterboxd.com/ali_veli/films/" or "@ali_veli" → "ali_veli". */
export function lbUser(s: string): string | null {
  const t = s.trim().replace(/^@/, "");
  const m = t.match(/letterboxd\.com\/([A-Za-z0-9_]+)/i);
  const u = m ? m[1] : t;
  return /^[A-Za-z0-9_]{2,40}$/.test(u) && !["film", "films", "list", "lists", "members", "journal"].includes(u.toLowerCase()) ? u : null;
}
export const myLbUser = () => store.get(KEY.me) || "";
export const setMyLbUser = (u: string) => store.set(KEY.me, u);
/** The latest ~50 diary entries of a public profile, from its RSS feed (Letterboxd's own sanctioned
 *  machine-readable page: no scraping, TMDB ids included). */
export async function readRss(user: string): Promise<LbEntry[]> {
  const xml = await invoke<string>("http_text", { url: `https://letterboxd.com/${user}/rss/` });
  const list = C.parseLbRss(xml);
  for (const e of list) if (e.tmdbId && e.kind) rememberId(e.title, e.year, e.kind, e.tmdbId);
  return list;
}

export type FriendRatings = { user?: string; at: number; r: Record<string, number>; t: Record<string, string> };
export const loadFriendRatings = () => store.json<Record<string, FriendRatings>>(KEY.friends, {});
/** Keeps what a friend rated (diary key → stars) next to their Letterboxd folder: used for taste
 *  compatibility and for "friends like you loved this". Existing ratings are updated, none lost. */
export function saveFriendRatings(name: string, films: { title: string; year?: string; stars?: number }[], user?: string) {
  const all = loadFriendRatings();
  const k = Object.keys(all).find((x) => C.seenKey(x) === C.seenKey(name)) ?? name.trim();
  const cur: FriendRatings = all[k] ?? { at: 0, r: {}, t: {} };
  for (const f of films) {
    if (!f.stars) continue;
    const key = C.diaryKey(f.title, f.year);
    cur.r[key] = f.stars;
    cur.t[key] = f.year ? `${f.title} (${f.year})` : f.title;
  }
  cur.at = Date.now();
  if (user) cur.user = user;
  all[k] = cur;
  store.set(KEY.friends, JSON.stringify(all));
  changed();
}
export function forgetFriendRatings(name: string) {
  const all = loadFriendRatings();
  for (const k of Object.keys(all)) if (C.seenKey(k) === C.seenKey(name)) delete all[k];
  store.set(KEY.friends, JSON.stringify(all));
  changed();
}
/** Fetches a friend's latest entries from RSS and adds their ratings. */
export async function syncFriend(name: string, user: string): Promise<number> {
  const list = await readRss(user);
  saveFriendRatings(name, list, user);
  return list.filter((e) => e.stars).length;
}
/** Every friend with ratings, against the user's diary. */
export function friendCompat(diary: Record<string, DiaryLike>): { name: string; user?: string; rated: number; c: C.Compat }[] {
  const mine = new Map(Object.values(diary).filter(e=>e.rating).map(e=>[C.diaryKey(e.title,e.year),e.rating!] as [string,number]));
  // the diary may hold a yearless key for a film the friend has with its year
  const byTitle = new Map<string,[string,number][]>();for(const [key,value] of mine){const title=key.split("|")[0];byTitle.set(title,[...(byTitle.get(title)||[]),[key,value]]);}
  return Object.entries(loadFriendRatings()).map(([name, fr]) => {
    const theirs = new Map(Object.entries(fr.r));
    const mineFor = new Map([...theirs.keys()].map((k) => [k, mine.get(k) ?? (()=>{const [title,year]=k.split("|");const choices=(byTitle.get(title)||[]).filter(([key])=>!year||!key.split("|")[1]);return choices.length===1?choices[0][1]:undefined;})()] as [string, number | undefined]).filter((x): x is [string, number] => x[1] != null));
    return { name, user: fr.user, rated: theirs.size, c: C.compat(mineFor, theirs, new Map(Object.entries(fr.t))) };
  }).sort((a, b) => (b.c.pct ?? -1) - (a.c.pct ?? -1));
}

// ---------------------------------------------------------------- recommendations
export type Mood = "any" | "light" | "tense" | "mind" | "heart";
const MOOD_GENRES: Record<Exclude<Mood, "any">, number[]> = {
  light: [35, 16, 10751, 10749, 12, 10402], tense: [53, 27, 80, 9648, 28], mind: [878, 9648, 99, 36, 18], heart: [18, 10749, 10402, 10751],
};
export type PickSource = { kind: "seed" | "theme" | "director" | "friend" | "friendlike" | "later"; label: string };
export type Pick = {
  kind: Kind; id: number; title: string; year?: string; poster: string | null;
  match: Match; score: number; quality: number; sources: PickSource[]; owned?: boolean; onList?: boolean; rt?: number;
};
export type RecContext = {
  diary: Record<string, DiaryLike>;
  /** "movie:123" of what is in the library */
  owned: Set<string>;
  /** "Sonra izle" titles ("Title (Year)") */
  later: string[];
  /** friends' recommendations not looked at yet */
  friendRecs: { title: string; year?: string; tmdbId?: number; kind?: Kind; from: string }[];
  /** titles the user waved away on the recommendations page */
  dismissedTitles: Set<string>;
};
export type RecOptions = { mood?: Mood; maxRuntime?: number; gems?: boolean; onProgress?: (msg: string) => void; signal?: AbortSignal };
export const loadNo = () => store.json<string[]>(KEY.no, []);
/** "Not for me" on a pick: it never comes back, and its features count a little against. */
export function sayNo(kind: Kind, id: number) {
  const l = loadNo();
  if (!l.includes(`${kind}:${id}`)) store.set(KEY.no, JSON.stringify([...l, `${kind}:${id}`].slice(-2000)));
  const saved = loadPicks();
  if (saved) store.set(KEY.recs, JSON.stringify({ ...saved, picks: saved.picks.filter((p) => !(p.kind === kind && p.id === id)) }));
  changed();
}
export const loadPicks = () => store.json<{ at: number; opts: RecOptions; picks: Pick[] } | null>(KEY.recs, null);

/** Films for the user: candidates from TMDB (what their favourites point to, their themes and
 *  directors), friends and the watch-later list; each scored against the taste model, quality and
 *  how many sources agree; then spread out so the list isn't ten versions of one film. */
export async function recommend(ctx: RecContext, opts: RecOptions = {}): Promise<Pick[]> {
  const epoch=engineGeneration;
  const model = loadModel();
  if (!model) throw new Error(lang() === "en" ? "Build your taste profile first." : "Önce zevk profilini oluştur.");
  const say = opts.onProgress ?? (() => {});
  const en = lang() === "en";
  const stats = model.stats;
  const entries = Object.values(ctx.diary);
  // what not to suggest: anything in the diary with a signal, waved away, or said no to
  const seenIds = new Set<string>(), seenTitles = new Set<string>();
  for (const e of entries) {
    if (!(e.watched || e.vote || e.rating)) continue;
    const id = knownId(e.title, e.year);
    if (id) seenIds.add(id);
    seenTitles.add(C.seenKey(e.title));
  }
  for (const x of loadNo()) seenIds.add(x);
  const skip = (kind: Kind, id: number, title: string) => seenIds.has(`${kind}:${id}`) || seenTitles.has(C.seenKey(title)) || ctx.dismissedTitles.has(C.seenKey(title));

  type Cand = { kind: Kind; id: number; title: string; year?: string; poster: string | null; support: number; sources: PickSource[]; friend: number; onList?: boolean };
  const cands = new Map<string, Cand>();
  const add = (h: { kind: Kind; id: number; title: string; year?: string; poster?: string | null }, w: number, src: PickSource, friend = 0) => {
    if (skip(h.kind, h.id, h.title)) return;
    const k = `${h.kind}:${h.id}`;
    const c = cands.get(k) ?? { kind: h.kind, id: h.id, title: h.title, year: h.year || undefined, poster: h.poster ?? null, support: 0, sources: [], friend: 0 };
    c.support += w; c.friend += friend;
    if (!c.sources.some((s) => s.kind === src.kind && s.label === src.label)) c.sources.push(src);
    cands.set(k, c);
  };

  // 1) seeds: the strongest positive entries (recent ones count more), a few less obvious ones for variety
  const strong = entries.map((e) => ({ e, s: (C.signalOf(e, stats) ?? 0) * C.recency(e.watched ?? e.at), id: knownId(e.title, e.year) }))
    .filter((x) => x.s > 0.4 && x.id).sort((a, b) => b.s - a.s);
  const seeds = [...strong.slice(0, 12), ...strong.slice(12, 40).sort(() => Math.random() - 0.5).slice(0, 4)];
  say(en ? `Looking at what ${seeds.length} favourites point to…` : `${seeds.length} sevdiğin filmin benzerlerine bakılıyor…`);
  await pool(seeds, 4, async (x) => {
    const [kind, id] = x.id!.split(":");
    const list = await tmdbList(`/${kind}/${id}/recommendations`, kind as Kind).catch(() => [] as SearchHit[]);
    list.slice(0, 20).forEach((h, rank) => add(h, (1 - rank / 25) * Math.min(1.5, 0.5 + x.s / 2), { kind: "seed", label: x.e.title }));
  }, opts.signal);

  // 2) the user's own themes and directors, straight from TMDB's catalogue
  const themes = C.topFeatures(model, "k", 6, 2).plus.map((x) => x[0].slice(2));
  const directors = C.topFeatures(model, "d", 4, 1.5).plus.map((x) => x[0].slice(2));
  say(en ? "Searching your themes and directors…" : "Temaların ve yönetmenlerin taranıyor…");
  if (themes.length) {
    const l = await tmdbList("/discover/movie", "movie", { with_keywords: themes.join("|"), sort_by: "vote_average.desc", "vote_count.gte": "250" }).catch(() => [] as SearchHit[]);
    l.forEach((h, rank) => add(h, 0.8 * (1 - rank / 30), { kind: "theme", label: themes.slice(0, 3).map((t) => featName("k:" + t)).join(", ") }));
  }
  for (const d of directors) {
    const l = await tmdbList("/discover/movie", "movie", { with_crew: d, sort_by: "vote_average.desc", "vote_count.gte": "80" }).catch(() => [] as SearchHit[]);
    l.forEach((h, rank) => add(h, 0.9 * (1 - rank / 30), { kind: "director", label: featName("d:" + d) }));
  }

  // 3) friends: their recommendations, and films that friends who rate like the user loved
  for (const r of ctx.friendRecs) if (r.tmdbId) add({ kind: r.kind ?? "movie", id: r.tmdbId, title: r.title, year: r.year }, 0.6, { kind: "friend", label: r.from }, 0.5);
  const close = friendCompat(ctx.diary).filter((f) => (f.c.pct ?? 0) >= 62 && f.c.n >= 5);
  for (const f of close) {
    const fr = loadFriendRatings()[f.name];
    const loved = Object.entries(fr?.r ?? {}).filter(([, s]) => s >= 4).sort((a, b) => b[1] - a[1]).slice(0, 25);
    await pool(loved, 4, async ([key, s]) => {
      const [t, y] = [key.split("|")[0], key.split("|")[1] || undefined];
      if (seenTitles.has(t)) return;
      const title = fr.t[key]?.replace(/\s*\(\d{4}\)\s*$/, "") ?? t;
      const id = await resolveId(title, y).catch(() => null);
      if (id) add({ ...id, title, year: y }, 0.5, { kind: "friendlike", label: `${f.name} ${s}★` }, ((f.c.pct! - 50) / 50) * (s / 5));
    }, opts.signal);
  }

  // 4) the watch-later list: which of these first?
  await pool(ctx.later.slice(0, 40), 4, async (l) => {
    const y = l.match(/\((\d{4})\)\s*$/)?.[1];
    const title = l.replace(/\s*\(\d{4}\)\s*$/, "");
    const id = await resolveId(title, y).catch(() => null);
    if (id) { add({ ...id, title, year: y }, 0.4, { kind: "later", label: en ? "your watch-later list" : "Sonra izle listen" }); const c = cands.get(`${id.kind}:${id.id}`); if (c) c.onList = true; }
  }, opts.signal);
  flushCaches();

  // 5) the strongest candidates get their features and a match
  const first = [...cands.values()].sort((a, b) => b.support + b.friend - (a.support + a.friend)).slice(0, 90);
  say(en ? `Scoring ${first.length} candidates against your taste…` : `${first.length} aday zevkine göre puanlanıyor…`);
  const scored: (Pick & { keys: string[] })[] = [];
  let n = 0;
  await pool(first, 6, async (c) => {
    const feat = await filmFeat(c.kind, c.id).catch(() => null);
    if (++n % 15 === 0) say(en ? `Scored ${n}/${first.length}…` : `${n}/${first.length} puanlandı…`);
    if (!feat) return;
    if (opts.maxRuntime && feat.rt && feat.rt > opts.maxRuntime) return;
    if (opts.mood && opts.mood !== "any") {
      const want = MOOD_GENRES[opts.mood];
      if (!feat.g.some((g) => want.includes(g))) return;
      if (opts.mood === "light" && feat.g.some((g) => g === 27 || g === 10752)) return;
    }
    const match = C.matchFilm(model, feat);
    const quality = Math.max(0, Math.min(1, (C.bayes(feat.va, feat.vc) - 5.5) / 2.5));
    const support = Math.min(1, c.support / 3);
    const friend = Math.max(0, Math.min(1, c.friend));
    const gem = opts.gems ? (feat.vc ?? 0) < 4000 && (feat.vc ?? 0) > 60 ? 0.12 : -0.05 : 0;
    const score = 0.58 * (match.pct / 100) + 0.14 * quality + 0.12 * support + 0.1 * friend + (c.onList ? 0.06 : 0) + gem;
    scored.push({
      kind: c.kind, id: c.id, title: feat.t || c.title, year: feat.y ? String(feat.y) : c.year, poster: feat.p ?? c.poster,
      match, score, quality, sources: c.sources, owned: ctx.owned.has(`${c.kind}:${c.id}`), onList: c.onList, rt: feat.rt,
      keys: C.featKeys(feat).filter((k) => /^[gkd]:/.test(k)),
    });
  }, opts.signal);
  flushCaches();
  if(opts.signal?.aborted||epoch!==engineGeneration)return [];
  const picks = C.mmr(scored, (p) => p.score, (a, b) => C.jaccard(a.keys, b.keys), 30, 0.75).map(({ keys: _keys, ...p }) => p);
  store.set(KEY.recs, JSON.stringify({ at: Date.now(), opts: { mood: opts.mood, maxRuntime: opts.maxRuntime, gems: opts.gems }, picks }));
  changed();
  return picks;
}

// ---------------------------------------------------------------- the AI reading of the user's reviews
export type AiTaste = {
  at: number; model?: string;
  summary: string; loves: string[]; avoids: string[]; values: { aspect: string; note: string }[];
  blindSpots: string[]; tryNext: { title: string; year?: string; why: string; tmdbId?: number; kind?: Kind }[];
};
export const loadAiTaste = () => store.json<AiTaste | null>(KEY.ai, null);
/** Sends a sample of the user's own reviews (the most telling: highest and lowest rated, longest) to
 *  Gemini and keeps its structured reading. Suggested films are checked on TMDB; ones that can't be
 *  found are dropped (no invented titles). `gemini` is Taste.tsx's call with model fallback. */
export async function aiTasteReading(diary: Record<string, DiaryLike>, gemini: (body: unknown) => Promise<{ r: any; model: { id: string } }>): Promise<AiTaste> {
  const withText = Object.values(diary).filter((e) => (e.review ?? e.note ?? "").trim().length > 20);
  if (withText.length < 3) throw new Error(lang() === "en" ? "At least 3 reviews or notes are needed." : "En az 3 yorum ya da not gerekiyor.");
  const by = (f: (e: DiaryLike) => number) => [...withText].sort((a, b) => f(b) - f(a));
  const pickSet = new Set<DiaryLike>([...by((e) => e.rating ?? 5).slice(0, 25), ...by((e) => -(e.rating ?? 5)).slice(0, 15), ...by((e) => (e.review ?? "").length).slice(0, 20)]);
  const lines = [...pickSet].slice(0, 60).map((e) => `### ${e.title}${e.year ? ` (${e.year})` : ""}${e.rating ? ` — ${e.rating / 2}★` : ""}${e.vote === "like" ? " ♥" : e.vote === "dislike" ? " 👎" : ""}\n${(e.review ?? e.note ?? "").replace(/\s+/g, " ").slice(0, 700)}`);
  const en = lang() === "en";
  const schema = {
    type: "OBJECT",
    properties: {
      summary: { type: "STRING" }, loves: { type: "ARRAY", items: { type: "STRING" } }, avoids: { type: "ARRAY", items: { type: "STRING" } },
      values: { type: "ARRAY", items: { type: "OBJECT", properties: { aspect: { type: "STRING" }, note: { type: "STRING" } }, required: ["aspect", "note"] } },
      blindSpots: { type: "ARRAY", items: { type: "STRING" } },
      tryNext: { type: "ARRAY", items: { type: "OBJECT", properties: { title: { type: "STRING" }, year: { type: "STRING" }, why: { type: "STRING" } }, required: ["title", "why"] } },
    },
    required: ["summary", "loves", "avoids", "values", "blindSpots", "tryNext"],
  };
  const sys = en
    ? "You read a film lover's own reviews and ratings and describe their taste precisely, the way a perceptive friend would. Only claim what the reviews support; quote no more than a few words. summary: 3-4 sentences. loves/avoids: 4-6 concrete items each (themes, styles, kinds of storytelling, not just genres). values: what they judge films by (story, acting, visuals, music, pace, emotion, ending…), with a note each. blindSpots: 3-4 kinds of films they haven't tried but would plausibly like. tryNext: 6 real films (original title and year) they have not reviewed, each with a one-line reason. No spoilers."
    : "Bir sinemaseverin kendi yorumlarını ve puanlarını okuyup zevkini, onu iyi tanıyan bir arkadaş gibi isabetle anlatıyorsun. Yalnızca yorumların desteklediğini söyle; en fazla birkaç kelime alıntı yap. summary: 3-4 cümle. loves/avoids: her biri 4-6 somut madde (sadece tür değil; tema, üslup, anlatım biçimi). values: filmleri neye göre değerlendirdiği (hikâye, oyunculuk, görüntü, müzik, tempo, duygu, final…), her birine kısa not. blindSpots: henüz denemediği ama muhtemelen seveceği 3-4 film türü/akımı. tryNext: yorumlamadığı 6 gerçek film (orijinal adı ve yılı), her birine tek satır gerekçe. Spoiler verme. Türkçe yaz.";
  const { r, model } = await gemini({
    systemInstruction: { parts: [{ text: sys }] },
    contents: [{ role: "user", parts: [{ text: lines.join("\n\n").slice(0, 60000) }] }],
    generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.4 },
  });
  const text = (r?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? "").join("");
  let j: any;
  try { j = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)); } catch { throw new Error(en ? "The AI answer couldn't be read; try again." : "Yapay zekâ cevabı okunamadı; tekrar dene."); }
  const strs = (x: unknown, n = 8) => (Array.isArray(x) ? x.filter((s) => typeof s === "string" && s.trim()).map((s: string) => s.trim().slice(0, 240)).slice(0, n) : []);
  const tryNext: AiTaste["tryNext"] = [];
  for (const t of (Array.isArray(j.tryNext) ? j.tryNext : []).slice(0, 8)) {
    if (!t?.title) continue;
    const id = await resolveId(String(t.title), t.year ? String(t.year).slice(0, 4) : undefined).catch(() => null);
    if (id && !Object.values(diary).some((e) => C.seenKey(e.title) === C.seenKey(String(t.title)))) tryNext.push({ title: String(t.title), year: t.year ? String(t.year).slice(0, 4) : undefined, why: String(t.why ?? "").slice(0, 240), tmdbId: id.id, kind: id.kind });
  }
  flushCaches();
  const out: AiTaste = {
    at: Date.now(), model: model.id, summary: String(j.summary ?? "").slice(0, 1200), loves: strs(j.loves), avoids: strs(j.avoids),
    values: (Array.isArray(j.values) ? j.values : []).filter((v: any) => v?.aspect && v?.note).slice(0, 9).map((v: any) => ({ aspect: String(v.aspect).slice(0, 40), note: String(v.note).slice(0, 240) })),
    blindSpots: strs(j.blindSpots, 5), tryNext,
  };
  store.set(KEY.ai, JSON.stringify(out));
  changed();
  return out;
}
