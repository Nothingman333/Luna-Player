// Taste data (likes, dislikes, watchlist), recommendations from friends and the Gemini chat.
import { lang, locale, tt } from "./i18n";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { details, IMG, isFinished, Item, Meta, Recent, SearchHit, searchTmdb, store, tmdbGet, tmdbKeywords } from "./library";
import { I, Icon, pct } from "./Screens";

// ---------- taste store ----------
export type Vote = "like" | "dislike";
export type TasteEntry = { title: string; year?: string; kind: "movie" | "tv"; vote?: Vote; want?: boolean; at: number };
export type Rec = {
  id: string; title: string; year?: string; kind: "movie" | "tv"; from: string; note: string; at: number;
  tmdbId?: number; poster?: string | null; status?: "watched" | "dismissed"; vote?: Vote; rating?: number; noPoster?: boolean;
  /** where it came from on the friend's Letterboxd: "İzledi", "Beğendi", "İzlemek istiyor", "Liste: …" */
  tags?: string[]; stars?: number;
};

/** Titles the user ticked as "watched" in the assistant's answers. */
export const loadSeen = () => store.json<string[]>("seenList", []);
const seenKey = (t: string) => t.trim().toLocaleLowerCase("tr");
/** Titles the user wants to watch later (from the assistant, the import or by hand). */
export const loadLater = () => store.json<string[]>("laterList", []);
const stars = (n: number) => "★".repeat(Math.floor(n)) + (n % 1 ? "½" : "");
const has = (l: string[], t: string) => l.some((x) => seenKey(x) === seenKey(t));
function toggleList(key: string, t: string, on?: boolean): string[] {
  const cur = store.json<string[]>(key, []);
  const want = on ?? !has(cur, t);
  const next = want ? (has(cur, t) ? cur : [...cur, t.trim()]) : cur.filter((x) => seenKey(x) !== seenKey(t));
  store.set(key, JSON.stringify(next));
  listeners.forEach((f) => f());
  return next;
}
export const markSeen = (t: string, on?: boolean) => {
  const l = toggleList("seenList", t, on);
  diarySet(t, undefined, { watched: has(l, t) ? Date.now() : undefined });
  return l;
};
export const markLater = (t: string, on?: boolean) => toggleList("laterList", t, on);
export const youtubeTrailer = (t: string) =>
  "https://www.youtube.com/results?search_query=" + (encodeURIComponent(t.replace(/\s*\((\d{4})\)\s*$/, " $1") + tt(" türkçe fragman")));

/** Adds a friend's recommendation (matched on TMDB when possible). Returns false if it was already there. */
export async function addRecommendation(title: string, year?: string, from?: string, note?: string, quick = false): Promise<boolean> {
  const name = title.trim();
  if (!name || loadRecs().some((r) => seenKey(r.title) === seenKey(name) && (!year || !r.year || r.year === year))) return false;
  let hit: SearchHit | undefined;
  if (!quick && store.get("tmdbKey")) {
    const y = year ? Number(year) : undefined;
    const [m, tv] = await Promise.all([searchTmdb(name, "movie", y).catch(() => []), searchTmdb(name, "tv", y).catch(() => [])]);
    hit = m[0] ?? tv[0];
  }
  const r: Rec = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title: hit?.title ?? name, year: hit?.year || year,
    kind: hit?.kind ?? "movie", from: (from ?? "").trim() || "Biri", note: (note ?? "").trim(), at: Date.now(), tmdbId: hit?.id, poster: hit?.poster, rating: hit?.rating,
  };
  saveRecs([r, ...loadRecs()]);
  return true;
}

// ---------- the taste diary: one record per title, library or not ----------
export type DiaryEntry = {
  title: string; year?: string; watched?: number; vote?: Vote; rating?: number; note?: string;
  genres?: string[]; at: number;
};
const dKey = (title: string, year?: string) => seenKey(title.replace(/\s*\((\d{4})\)\s*$/, "")) + "|" + (year ?? (title.match(/\((\d{4})\)\s*$/)?.[1] ?? ""));
export const loadDiary = () => store.json<Record<string, DiaryEntry>>("diary", {});
export function diaryGet(title: string, year?: string): DiaryEntry | undefined {
  const d = loadDiary();
  return d[dKey(title, year)] ?? Object.values(d).find((e) => seenKey(e.title) === seenKey(title.replace(/\s*\(\d{4}\)\s*$/, "")));
}
export function diarySet(title: string, year: string | undefined, patch: Partial<DiaryEntry>) {
  const clean = title.replace(/\s*\((\d{4})\)\s*$/, "").trim();
  const y = year ?? title.match(/\((\d{4})\)\s*$/)?.[1];
  const d = loadDiary();
  const k = Object.keys(d).find((x) => x === dKey(clean, y)) ?? Object.keys(d).find((x) => seenKey(d[x].title) === seenKey(clean)) ?? dKey(clean, y);
  const cur = d[k] ?? { title: clean, year: y, at: Date.now() };
  const next = { ...cur, ...patch, at: Date.now() };
  for (const f of Object.keys(patch) as (keyof DiaryEntry)[]) if (patch[f] === undefined) delete next[f];
  d[k] = next;
  store.set("diary", JSON.stringify(d));
  listeners.forEach((f) => f());
}
/** Moves the older, scattered records (library thumbs, ticks, recommendation votes) into the diary once. */
export function migrateDiary() {
  if (store.get("diaryV") === "1") return;
  const d = loadDiary();
  const put = (title: string, year: string | undefined, patch: Partial<DiaryEntry>) => {
    const k = dKey(title, year);
    d[k] = { ...(d[k] ?? { title, year, at: Date.now() }), ...patch };
  };
  for (const e of Object.values(store.json<Record<string, TasteEntry>>("taste", {}))) if (e.vote) put(e.title, e.year, { vote: e.vote });
  for (const t of store.json<string[]>("seenList", [])) put(t.replace(/\s*\(\d{4}\)\s*$/, ""), t.match(/\((\d{4})\)\s*$/)?.[1], { watched: Date.now() });
  for (const r of store.json<Rec[]>("recs", [])) if (r.status === "watched") put(r.title, r.year, { watched: r.at, ...(r.vote ? { vote: r.vote } : {}) });
  store.set("diary", JSON.stringify(d));
  store.set("diaryV", "1");
}

/** User playlists ("Hafta sonu maratonu"…), built by hand or by the assistant. */
export type PlItem = { title: string; year?: string; poster?: string | null; tmdbId?: number; kind?: "movie" | "tv"; stars?: number; rating?: number; noPoster?: boolean };
/** `parent`: the folder it sits in (e.g. a friend). `source`: a Letterboxd page it is filled from ("Güncelle"). */
export type Playlist = { id: string; name: string; items: PlItem[]; at: number; parent?: string; source?: { url: string; minStars?: number } };

type LbFilm = { title: string; year?: string; stars?: number };
type LbSection = { name: string; kind: "watched" | "liked" | "watchlist" | "list"; url: string; films: LbFilm[] };
export type TaggedFilm = LbFilm & { tags?: string[] };
const lbTag = (sc: LbSection) => sc.kind === "watched" ? "İzledi" : sc.kind === "liked" ? "Beğendi" : sc.kind === "watchlist" ? "İzlemek istiyor" : "Liste: " + sc.name;
/** All films of the sections, one entry per film, with every place it appears in as a tag. */
export function lbFlatten(secs: LbSection[]): TaggedFilm[] {
  const map = new Map<string, TaggedFilm>();
  for (const sc of secs) for (const f of sc.films) {
    const k = seenKey(f.title) + "|" + (f.year ?? "");
    const ex = map.get(k);
    if (ex) { if (!ex.tags!.includes(lbTag(sc))) ex.tags!.push(lbTag(sc)); ex.stars = ex.stars ?? f.stars; }
    else map.set(k, { ...f, tags: [lbTag(sc)] });
  }
  return [...map.values()];
}
export const isLetterboxd = (u: string) => /letterboxd\.com\/|boxd\.it\//i.test(u);
export const readLetterboxd = (url: string, pages = 30) => invoke<LbSection[]>("letterboxd_read", { url, maxPages: pages });
const lbLine = (f: TaggedFilm) => `${f.title}${f.year ? ` (${f.year})` : ""}${f.stars ? ` ★${f.stars}` : ""}${f.tags?.length ? ` [${f.tags.join(", ")}]` : ""}`;

/** Adds many recommendations at once without TMDB look-ups (posters are fetched lazily). */
export function addRecommendationsBulk(films: TaggedFilm[], from: string, note = ""): number {
  const cur = loadRecs();
  const byKey = new Map(cur.map((r) => [seenKey(r.title) + "|" + (r.year ?? ""), r]));
  const add: Rec[] = [];
  for (const f of films) {
    const k = seenKey(f.title) + "|" + (f.year ?? "");
    if (!f.title.trim()) continue;
    const ex = byKey.get(k);
    if (ex) { // already there: just learn where else it appears
      for (const t of f.tags ?? []) if (!(ex.tags ?? []).includes(t)) ex.tags = [...(ex.tags ?? []), t];
      if (f.stars && !ex.stars) ex.stars = f.stars;
      continue;
    }
    const r: Rec = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), title: f.title.trim(), year: f.year, kind: "movie",
      from: from.trim(), note, at: Date.now(), tags: f.tags, stars: f.stars };
    byKey.set(k, r);
    add.push(r);
  }
  saveRecs([...add, ...cur]);
  return add.length;
}

/** Looks up missing posters (and TMDB ids / ratings) for the first `limit` entries, one by one. */
export async function fillPosters<T extends { title: string; year?: string; poster?: string | null; tmdbId?: number; rating?: number; noPoster?: boolean }>(
  list: T[], save: () => void, limit = 24) {
  if (!store.get("tmdbKey")) return;
  const todo = list.filter((it) => !((it.poster && it.rating != null) || it.noPoster)).slice(0, limit);
  let n = 0;
  const one = async (it: T) => {
    const y = it.year ? Number(it.year) : undefined;
    try {
      // prefer a hit with a poster (and the right year); episode titles like "Show: Episode" fall back to the show
      const good = (l: SearchHit[]) => l.find((x) => x.poster && (!it.year || x.year === it.year)) ?? l.find((x) => x.poster);
      const tries: [string, "movie" | "tv", number?][] = [[it.title, "movie", y], [it.title, "movie"], [it.title, "tv"]];
      if (it.title.includes(":")) tries.push([it.title.split(":")[0], "tv"], [it.title.split(":")[0], "movie"]);
      let h: SearchHit | undefined;
      for (const [q, k, yy] of tries) { h = good(await searchTmdb(q, k, yy)); if (h) break; }
      if (h) { it.poster = it.poster ?? h.poster; it.tmdbId = it.tmdbId ?? h.id; it.rating = h.rating ?? 0; } else it.noPoster = true;
    } catch { /* network / rate limit: try again next time instead of giving up on the poster */ }
    if (++n % 8 === 0) save();
  };
  // 4 at a time, in list order (what's on screen first)
  const queue = [...todo];
  await Promise.all(Array.from({ length: 4 }, async () => { while (queue.length) await one(queue.shift()!); }));
  if (n) save();
}

/** Reads any link for the assistant: Letterboxd is read film by film (with ratings), other pages as text. */
export async function readLink(url: string): Promise<string> {
  if (isLetterboxd(url)) {
    const secs = await readLetterboxd(url);
    return secs.map((sc) => {
      const top = [...sc.films].sort((x, y) => (y.stars ?? 0) - (x.stars ?? 0)).slice(0, 40);
      return `## ${sc.name} (${lbTag(sc)}): ${sc.films.length} film (en yüksek puanlı/ilk 40 aşağıda; tamamı için import_link kullan)\n${top.map(lbLine).join("\n")}`;
    }).join("\n\n");
  }
  return (await invoke<string>("fetch_page_text", { url })).slice(0, 15000);
}

/** A friend's folder with lists linked to their Letterboxd: watchlist and the films they rated 4★+. */
export async function followLetterboxd(person: string, url: string): Promise<string> {
  const secs = await readLetterboxd(url, 80);
  const all = loadPlaylists();
  let folder = all.find((p) => !p.parent && seenKey(p.name) === seenKey(person));
  if (!folder) { folder = { id: Date.now().toString(36), name: person.trim(), items: [], at: Date.now() }; all.push(folder); }
  const made: string[] = [];
  const put = (name: string, src: { url: string; minStars?: number }, films: LbFilm[]) => {
    let pl = all.find((p) => p.parent === folder!.id && p.name === name);
    if (!pl) { pl = { id: Date.now().toString(36) + made.length, name, items: [], at: Date.now(), parent: folder!.id, source: src }; all.push(pl); }
    pl.source = src;
    pl.items = films.filter((f) => !src.minStars || (f.stars ?? 0) >= src.minStars).map((f) => ({ title: f.title, year: f.year, stars: f.stars }));
    made.push(`${name}: ${pl.items.length}`);
  };
  for (const sc of secs) {
    if (sc.kind === "watched") put("Yüksek puanladıkları (4★+)", { url: sc.url, minStars: 4 }, sc.films);
    else if (sc.films.length) put(sc.kind === "list" ? sc.name : sc.name, { url: sc.url }, sc.films);
  }
  savePlaylists(all);
  return `“${person}” klasörü: ${made.join(" · ")}`;
}

/** "Güncelle": refills every list that is linked to Letterboxd; new films are added, nothing is lost. */
export async function refreshLinkedPlaylists(progress?: (m: string) => void): Promise<string> {
  const all = loadPlaylists();
  const linked = all.filter((p) => p.source);
  let added = 0;
  for (const [i, pl] of linked.entries()) {
    progress?.(tt("Güncelleniyor {0}/{1}: {2}", i + 1, linked.length, pl.name));
    try {
      const films = (await readLetterboxd(pl.source!.url, 80)).flatMap((sc) => sc.films);
      for (const f of films) {
        if (pl.source!.minStars && (f.stars ?? 0) < pl.source!.minStars) continue;
        const ex = pl.items.find((x) => seenKey(x.title) === seenKey(f.title) && (!x.year || !f.year || x.year === f.year));
        if (ex) ex.stars = f.stars ?? ex.stars;
        else { pl.items.push({ title: f.title, year: f.year, stars: f.stars }); added++; }
      }
    } catch { /* keep the old content if the page can't be read */ }
  }
  savePlaylists(all);
  return linked.length ? tt("{0} liste güncellendi, {1} yeni film", linked.length, added) : tt("Letterboxd'a bağlı liste yok");
}
export const loadPlaylists = () => store.json<Playlist[]>("playlists", []);
let plNames: { id: string; name: string }[] | null = null;
/** Just the names, cached: used by every card's "+ Listeye" picker. */
const playlistNames = () => (plNames ??= loadPlaylists().map((p) => ({ id: p.id, name: p.name })));
export const savePlaylists = (l: Playlist[]) => { plNames = null; store.set("playlists", JSON.stringify(l)); listeners.forEach((f) => f()); };
const findPl = (name: string) => loadPlaylists().find((p) => seenKey(p.name) === seenKey(name));
export function createPlaylist(name: string): Playlist {
  const ex = findPl(name);
  if (ex) return ex;
  const pl: Playlist = { id: Date.now().toString(36), name: name.trim(), items: [], at: Date.now() };
  savePlaylists([...loadPlaylists(), pl]);
  return pl;
}
export async function addToPlaylist(name: string, items: { title: string; year?: string }[]): Promise<number> {
  createPlaylist(name);
  let added = 0;
  const all = loadPlaylists();
  const pl = all.find((p) => seenKey(p.name) === seenKey(name))!;
  for (const it of items) {
    const t = it.title.replace(/\s*\((\d{4})\)\s*$/, "").trim();
    const y = it.year ?? it.title.match(/\((\d{4})\)\s*$/)?.[1];
    if (!t || pl.items.some((x) => seenKey(x.title) === seenKey(t))) continue;
    const rec = loadRecs().find((r) => seenKey(r.title) === seenKey(t));
    let hit: SearchHit | undefined;
    if (!rec?.poster && store.get("tmdbKey")) {
      const [m, tv] = await Promise.all([searchTmdb(t, "movie", y ? Number(y) : undefined).catch(() => []), searchTmdb(t, "tv", y ? Number(y) : undefined).catch(() => [])]);
      hit = m[0] ?? tv[0];
    }
    pl.items.push({ title: hit?.title ?? rec?.title ?? t, year: hit?.year || rec?.year || y, poster: hit?.poster ?? rec?.poster, tmdbId: hit?.id ?? rec?.tmdbId, kind: hit?.kind ?? rec?.kind });
    added++;
  }
  savePlaylists(all);
  return added;
}

/** Notes the assistant keeps about the user's taste ("korku sevmez"…). */
export const loadNotes = () => store.json<string[]>("userNotes", []);
export const saveNotes = (n: string[]) => { store.set("userNotes", JSON.stringify(n)); listeners.forEach((f) => f()); };

/** How well each friend's recommendations matched the user's taste. */
export function friendAffinity() {
  const out: Record<string, { liked: number; rated: number; total: number }> = {};
  const d = loadDiary();
  const byTitle = new Map(Object.values(d).map((e) => [seenKey(e.title), e]));
  for (const r of loadRecs()) {
    const o = (out[r.from] ??= { liked: 0, rated: 0, total: 0 });
    o.total++;
    const e = d[dKey(r.title, r.year)] ?? byTitle.get(seenKey(r.title));
    const v = r.vote ?? e?.vote;
    const rating = e?.rating;
    if (v || rating) {
      o.rated++;
      if (v === "like" || (rating ?? 0) >= 7) o.liked++;
    }
  }
  return out;
}

const listeners = new Set<() => void>();
const changed = () => listeners.forEach((f) => f());
export const loadTaste = () => store.json<Record<string, TasteEntry>>("taste", {});
export const loadRecs = () => store.json<Rec[]>("recs", []);
const saveTaste = (t: Record<string, TasteEntry>) => { store.set("taste", JSON.stringify(t)); changed(); };
const saveRecs = (r: Rec[]) => { store.set("recs", JSON.stringify(r)); changed(); };

/** Re-renders when taste or recommendations change anywhere in the app. */
export function useTaste() {
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => bump((n) => n + 1);
    listeners.add(f);
    return () => { listeners.delete(f); };
  }, []);
  return { taste: loadTaste(), recs: loadRecs() };
}

export const tasteKey = (it: Item) => it.meta && it.meta.id > 0 ? `${it.meta.kind}:${it.meta.id}` : `${it.parsed.kind}:${it.parsed.title.toLowerCase()}`;

export function setTaste(it: Item, patch: Partial<TasteEntry>) {
  const t = loadTaste();
  const k = tasteKey(it);
  const cur = t[k] ?? { title: it.meta?.title ?? it.parsed.title, year: it.meta?.year, kind: it.parsed.kind, at: Date.now() };
  t[k] = { ...cur, ...patch, at: Date.now() };
  if (!t[k].vote && !t[k].want) delete t[k];
  saveTaste(t);
}

// ---------- details page buttons ----------
const ASK_ICON = "M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12z";
const THUMB = "M7 10v11H3V10zM7 10l4-8a3 3 0 0 1 3 3v4h6a2 2 0 0 1 2 2.3l-1.4 8A2 2 0 0 1 18.6 21H7";
const THUMB_DOWN = "M17 14V3h4v11zM17 14l-4 8a3 3 0 0 1-3-3v-4H4a2 2 0 0 1-2-2.3l1.4-8A2 2 0 0 1 5.4 3H17";

export function TasteButtons({ it }: { it: Item }) {
  const { taste } = useTaste();
  const e = taste[tasteKey(it)];
  const title = it.meta?.title ?? it.parsed.title;
  const year = it.meta?.year || (it.parsed.year ? String(it.parsed.year) : undefined);
  const d = diaryGet(title, year);
  // like / dislike asks for points out of 10, the same as on the recommendations
  const [ask, setAsk] = useState<Vote | null>(null);
  const vote = (v: Vote) => {
    const nv = d?.vote === v ? undefined : v;
    diarySet(title, year, { vote: nv, ...(it.meta?.genres?.length ? { genres: it.meta.genres } : {}) });
    setTaste(it, { vote: nv });
    setAsk(nv ?? null);
  };
  return (
    <>
      <button className={"act" + (e?.want ? " on" : "")} data-tip={e?.want ? tt("İzleyeceklerimden çıkar") : tt("İzleyeceklerime ekle")}
        aria-label={tt("İzleyeceklerime ekle")} onClick={() => setTaste(it, { want: !e?.want })}>
        <Icon d={e?.want ? I.check : I.plus} size={20} />
      </button>
      <span className="vote-wrap">
        <button className={"act" + (d?.vote === "like" ? " on" : "")} aria-label={tt("Beğendim")} data-tip={d?.vote === "like" && d.rating ? tt("Beğendim · {0}/10", d.rating) : tt("Beğendim")} onClick={() => vote("like")}>
          <Icon d={THUMB} size={20} />{d?.vote === "like" && d.rating ? <span className="vote-n">{d.rating}</span> : null}
        </button>
        {ask === "like" && <RateAsk title={title} year={year} vote="like" onDone={() => setAsk(null)} />}
      </span>
      <span className="vote-wrap">
        <button className={"act" + (d?.vote === "dislike" ? " on bad" : "")} aria-label={tt("Beğenmedim")} data-tip={d?.vote === "dislike" && d.rating ? tt("Beğenmedim · {0}/10", d.rating) : tt("Beğenmedim")} onClick={() => vote("dislike")}>
          <Icon d={THUMB_DOWN} size={20} />{d?.vote === "dislike" && d.rating ? <span className="vote-n">{d.rating}</span> : null}
        </button>
        {ask === "dislike" && <RateAsk title={title} year={year} vote="dislike" onDone={() => setAsk(null)} />}
      </span>
    </>
  );
}

// ---------- recommendations page ----------
/** Imports friends' recommendations: Letterboxd / IMDb CSV exports, or any pasted text (Gemini picks out the titles). */
/** Film titles out of any text: CSV exports directly, otherwise the assistant picks them out. */
async function extractTitles(t: string): Promise<{ title: string; year?: string }[]> {
  const key = store.get("geminiKey");
  if (key) {
    const body = {
      systemInstruction: { parts: [{ text: "Verilen metindeki film ve dizi adlarını bul. Sadece JSON dizi döndür: [{\"title\":\"...\",\"year\":\"YYYY\"}]. Yıl yoksa year alanını boş bırak. Film olmayanları alma." }] },
      contents: [{ role: "user", parts: [{ text: t.slice(0, 30000) }] }],
      generationConfig: { responseMimeType: "application/json" },
    };
    const { r } = await geminiWithFallback(key, body);
    const out = (r?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? "").join("");
    try { const arr = JSON.parse(out.slice(out.indexOf("["), out.lastIndexOf("]") + 1)); if (Array.isArray(arr)) return arr.filter((x) => x?.title); } catch {}
  }
  return t.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 1 && l.length < 120).map((l) => {
    const m = l.match(/^(.*?)[\s(]*((?:19|20)\d{2})\)?\s*$/);
    return m ? { title: m[1].trim(), year: m[2] } : { title: l };
  });
}

function ImportPanel({ onDone }: { onDone: () => void }) {
  const [text, setText] = useState("");
  const [from, setFrom] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const parseCsv = (csv: string): { title: string; year?: string }[] | null => {
    const rows: string[][] = [];
    let row: string[] = [], cell = "", q = false;
    for (let i = 0; i < csv.length; i++) {
      const c = csv[i];
      if (q) { if (c === '"' && csv[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
      else if (c === '"') q = true;
      else if (c === ",") { row.push(cell); cell = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && csv[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
      else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    const head = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
    const ti = head.findIndex((h) => h === "name" || h === "title" || h === "original title");
    if (ti < 0) return null;
    const yi = head.findIndex((h) => h === "year");
    return rows.slice(1).filter((r) => r[ti]?.trim()).map((r) => ({ title: r[ti].trim(), year: yi >= 0 ? r[yi]?.trim() : undefined }));
  };
  const extract = async (t0: string): Promise<TaggedFilm[]> => {
    let t = t0;
    const csv = parseCsv(t);
    if (csv) return csv;
    const key = store.get("geminiKey");
    if (key) {
      const onlyUrl = /^\s*https?:\/\/\S+\s*$/i.test(t);
      if (onlyUrl && isLetterboxd(t)) {
        return lbFlatten(await readLetterboxd(t.trim(), 80));
      }
      if (onlyUrl) t = await invoke<string>("fetch_page_text", { url: t.trim() });
      const body: any = {
        systemInstruction: { parts: [{ text: "Verilen metindeki film ve dizi adlarını bul. Sadece JSON dizi döndür: [{\"title\":\"...\",\"year\":\"YYYY\"}]. Yıl yoksa year alanını boş bırak. Film olmayanları alma." }] },
        contents: [{ role: "user", parts: [{ text: t.slice(0, 30000) }] }],
        generationConfig: { responseMimeType: "application/json" },
      };
      const { r } = await geminiWithFallback(key, body);
      const out = (r?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? "").join("");
      try {
        const json = out.slice(out.indexOf("["), out.lastIndexOf("]") + 1);
        const arr = JSON.parse(json);
        if (Array.isArray(arr)) return arr.filter((x) => x?.title);
      } catch {}
      if (onlyUrl) throw new Error(tt("Sayfada film bulunamadı. Sayfayı açıp içeriğini kopyalayıp yapıştırmayı dene."));
    }
    // no assistant: one title per line, "(1999)" or "1999" at the end as the year
    return t.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 1).map((l) => {
      const m = l.match(/^(.*?)[\s(]*((?:19|20)\d{2})\)?\s*$/);
      return m ? { title: m[1].trim(), year: m[2] } : { title: l };
    });
  };
  const run = async () => {
    setBusy(true); setMsg(tt("Başlıklar okunuyor…"));
    try {
      const list = await extract(text);
      // small lists: matched on TMDB right away; long ones: added at once, posters come later
      let added = 0;
      if (list.length <= 40) {
        for (let i = 0; i < list.length; i++) {
          setMsg(tt("Ekleniyor {0} / {1}: {2}", i + 1, list.length, list[i].title));
          if (await addRecommendation(list[i].title, list[i].year || undefined, from)) added++;
        }
      } else {
        added = addRecommendationsBulk(list as { title: string; year?: string; stars?: number }[], from);
      }
      setMsg(tt("{0} öneri eklendi{1}.", added, list.length - added ? tt(", {0} tanesi zaten vardı", list.length - added) : ""));
      if (added) setText("");
    } catch (e) { setMsg(String(e)); }
    setBusy(false);
  };
  const pickFile = async (f?: File | null) => { if (f) setText(await f.text()); };
  return (
    <div className="import-panel">
      <div className="muted small">
        <b>{tt("Letterboxd:")}</b>  {tt("Ayarlar › Import & Export › Export your data ile inen")} <code>{tt("watchlist.csv")}</code>  {tt("ya da bir liste CSV'si.")}
        {" "}<b>{tt("IMDb:")}</b>  {tt("listenin ⋯ menüsünden Export. Ya da bir listenin sayfasını (arkadaşının Letterboxd/IMDb listesi, bir mesaj…) kopyalayıp aşağı yapıştır; asistan film adlarını kendisi bulur.")}
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={tt("Liste adresi (Letterboxd, IMDb…), CSV ya da herhangi bir metni buraya yapıştır…")} rows={6} />
      <div className="import-row">
        <label className="chip file-chip">{tt("CSV dosyası seç")}<input type="file" accept=".csv,.txt" onChange={(e) => pickFile(e.target.files?.[0])} /></label>
        <input className={from.trim() ? "" : "need"} value={from} onChange={(e) => setFrom(e.target.value)} placeholder={tt("Kim önerdi? (gerekli)")} />
        <span className="grow" />
        <button className="chip" onClick={onDone}>{tt("Kapat")}</button>
        <button className="primary sm" disabled={busy || !text.trim() || !from.trim()} onClick={run}
          title={!from.trim() ? tt("Önce kimin önerdiğini yaz") : undefined}>{busy ? tt("Ekleniyor…") : tt("İçe aktar")}</button>
      </div>
      {msg && <div className="small import-msg">{msg}</div>}
    </div>
  );
}

/** Every title tied to a person: their recommendations and everything in their folder, once each. */
export function personTitles(who: string): { title: string; year?: string; tmdbId?: number; kind?: "movie" | "tv" }[] {
  const k = seenKey(who);
  const out = new Map<string, { title: string; year?: string; tmdbId?: number; kind?: "movie" | "tv" }>();
  const put = (x: { title: string; year?: string; tmdbId?: number; kind?: "movie" | "tv" }) => {
    const key = x.tmdbId ? "id" + x.tmdbId : seenKey(x.title) + "|" + (x.year ?? "");
    if (!out.has(key)) out.set(key, x);
  };
  loadRecs().filter((r) => seenKey(r.from) === k).forEach(put);
  const pls = loadPlaylists();
  const folder = pls.find((p) => !p.parent && seenKey(p.name) === k);
  if (folder) [folder, ...pls.filter((p) => p.parent === folder.id)].forEach((p) => p.items.forEach(put));
  return [...out.values()];
}
function modStats(who: string) {
  const all = personTitles(who);
  const checked = all.filter((x) => cwOf(x.tmdbId, x.kind) !== undefined);
  const flagged = checked.filter((x) => cwOf(x.tmdbId, x.kind)!.length && !isSafe(x.tmdbId, x.kind));
  const cats: Record<string, number> = {};
  for (const x of flagged) for (const c of cwLabels(cwOf(x.tmdbId, x.kind)!)) cats[c] = (cats[c] ?? 0) + 1;
  return { total: all.length, checked: checked.length, flagged: flagged.length, cats: Object.entries(cats).sort((a, b) => b[1] - a[1]), list: all };
}


/** What the diary says about the user's taste, plus the assistant's notes (deletable). */
function TasteSummary({ items, onOpen }: { items: Item[]; onOpen: (t: DetailTarget) => void }) {
  useTaste();
  const [book, setBook] = useState<DiaryFilter | null>(null);
  const diary = Object.values(loadDiary());
  const notes = loadNotes();
  if (!diary.length && !notes.length) return null;
  const liked = diary.filter((e) => e.vote === "like" || (e.rating ?? 0) >= 7);
  const rated = diary.filter((e) => e.rating);
  const avg = rated.length ? (rated.reduce((n, e) => n + (e.rating ?? 0), 0) / rated.length).toFixed(1).replace(".", ",") : null;
  const genreOf = (e: DiaryEntry) => e.genres ?? items.find((i) => seenKey(i.meta?.title ?? i.parsed.title) === seenKey(e.title))?.meta?.genres ?? [];
  const g: Record<string, number> = {};
  for (const e of liked) for (const x of genreOf(e)) g[x] = (g[x] ?? 0) + 1;
  const topGenres = Object.entries(g).sort((x, y) => y[1] - x[1]).slice(0, 4).map(([x]) => x);
  const month = diary.filter((e) => e.watched && Date.now() - e.watched < 30 * 86400000).length;
  return (
    <section className="row taste-sum">
      <h2 className="recs-head">{tt("Zevk özetin")} <span className="grow" /><button className="chip" onClick={() => setBook("all")}>{tt("Zevk defterim (")}{diary.length})</button></h2>
      <div className="sum-grid">
        <button onClick={() => setBook("like")}><b>{liked.length}</b><span>{tt("beğendiğin")}</span></button>
        <button onClick={() => setBook("dislike")}><b>{diary.filter((e) => e.vote === "dislike" || (e.rating && e.rating <= 4)).length}</b><span>{tt("beğenmediğin")}</span></button>
        <button onClick={() => setBook("rated")}><b>{avg ?? "–"}</b><span>{tt("puan ortalaman")}</span></button>
        <button onClick={() => setBook("watched")}><b>{month}</b><span>{tt("son 30 günde izlediğin")}</span></button>
      </div>
      {book && <DiaryList start={book} onOpen={onOpen} onClose={() => setBook(null)} />}
      {topGenres.length > 0 && <div className="muted small">{tt("En sevdiğin türler:")} {topGenres.join(", ")}</div>}
      {sensitivity().length > 0 && <div className="muted small">{tt("Güvenli işaretlediğin içerikler:")} {sensitivity().map(([c, n]) => `${c} (${n})`).join(", ")}</div>}
      {notes.length > 0 && (
        <div className="notes">
          <span className="muted small">{tt("Asistanın senin hakkında notları:")}</span>
          {notes.map((n) => (
            <span key={n} className="note-chip">{n}<button aria-label={tt("Notu sil")} title={tt("Notu sil")} onClick={() => saveNotes(loadNotes().filter((x) => x !== n))}>×</button></span>
          ))}
        </div>
      )}
    </section>
  );
}

/* ---------- Moderation: content warnings from TMDB keywords ---------- */
const CW_RULES: [RegExp, string][] = [
  [/cannibal/, "Yamyamlık"],
  [/\brape\b|rapist|sexual (assault|abuse|violence)|molest/, "Tecavüz / cinsel şiddet"],
  [/pedophil|paedophil|child (sexual )?abuse/, "Çocuk istismarı"],
  [/incest/, "Ensest"],
  [/necrophil/, "Nekrofili"],
  [/bestiality|zoophil/, "Zoofili"],
  [/nudity|unsimulated sex|explicit sex|graphic sex|pornograph|softcore|hardcore|sex scene|erotic/, "Ağır çıplaklık / cinsellik"],
  [/torture/, "İşkence"],
  [/\bgore\b|splatter|extreme violence|graphic violence|mutilation|dismember|disembowel/, "Aşırı vahşet"],
  [/animal (cruelty|abuse|killing|death)|killing (an )?animal/, "Hayvana şiddet"],
];
/** Topics the user doesn't want to read at all: shown only as a code. */
export const CW_CODE = "KOD:KZ#4";
const CW_HIDDEN = new Set(["Çocuk istismarı", "Ensest", "Nekrofili", "Zoofili"]);
export const cwLabel = (c: string) => (CW_HIDDEN.has(c) ? CW_CODE : tt(c));
const cwLabels = (l: string[]) => [...new Set(l.map(cwLabel))];
export const modOn = () => store.get("moderation") === "1";
export const setMod = (on: boolean) => { store.set("moderation", on ? "1" : "0"); listeners.forEach((f) => f()); };
let cwMemo: Record<string, string[]> | null = null;
const cwMap = () => (cwMemo ??= store.json<Record<string, string[]>>("cwCache", {}));
const cwKey = (kind: string | undefined, id: number) => `${kind ?? "movie"}:${id}`;
/** Warnings for a title, [] when clean, undefined when not checked yet. */
export const cwOf = (id?: number, kind?: string): string[] | undefined => (id ? cwMap()[cwKey(kind, id)] : undefined);
const cwQueue: { id: number; kind: "movie" | "tv" }[] = [];
let cwActive = 0;
let cwDirty = false;
// the cache is written to storage in batches, not after every title
setInterval(() => { if (cwDirty && cwMemo) { cwDirty = false; store.set("cwCache", JSON.stringify(cwMemo)); } }, 3000);
/** Moderation progress for the UI: checked / asked for in this session. */
export const cwProgress = { done: 0, total: 0 };
function cwPump() {
  while (cwActive < 8 && cwQueue.length) {
    const { id, kind } = cwQueue.shift()!;
    if (cwMap()[cwKey(kind, id)]) { cwProgress.done++; continue; }
    cwActive++;
    tmdbKeywords(kind, id)
      .then((kw) => {
        const map = cwMap();
        map[cwKey(kind, id)] = CW_RULES.filter(([re]) => kw.some((k) => re.test(k))).map(([, label]) => label);
        cwDirty = true;
      })
      .catch(() => {})
      .finally(() => {
        cwActive--; cwProgress.done++;
        if (cwProgress.done % 10 === 0 || (!cwQueue.length && !cwActive)) listeners.forEach((f) => f());
        cwPump();
      });
  }
}
/** Checks (in the background, 8 at a time, in list order) the titles that have a TMDB id but no verdict yet. */
export function useContentWarnings(list: { tmdbId?: number; kind?: "movie" | "tv" }[]) {
  const on = modOn();
  const todo = on ? list.filter((x) => x.tmdbId && cwOf(x.tmdbId, x.kind) === undefined) : [];
  useEffect(() => {
    if (!todo.length || !store.get("tmdbKey")) return;
    const fresh = todo.filter((x) => !cwQueue.some((q) => q.id === x.tmdbId));
    // what's on screen goes to the front of the queue
    cwQueue.unshift(...fresh.map((x) => ({ id: x.tmdbId!, kind: x.kind ?? "movie" })));
    cwProgress.total += fresh.length;
    listeners.forEach((f) => f());
    cwPump();
  }, [on, todo.map((x) => x.tmdbId).join(",")]);
}
/** The red star next to a flagged title. */
/* Titles the user marked as fine for them despite a warning: what's sensitive for them and what isn't. */
type SafeMark = { title: string; year?: string; cats: string[]; at: number };
export const loadSafe = () => store.json<Record<string, SafeMark>>("cwSafe", {});
export const isSafe = (id?: number, kind?: string) => !!id && !!loadSafe()[cwKey(kind, id)];
export function markSafe(id: number, kind: string | undefined, mark: SafeMark | null) {
  const all = loadSafe();
  if (mark) all[cwKey(kind, id)] = mark; else delete all[cwKey(kind, id)];
  store.set("cwSafe", JSON.stringify(all));
  listeners.forEach((f) => f());
}
/** For each warning: how many times it was marked safe vs. still flagged among the titles the user has met. */
export function sensitivity() {
  const safe = Object.values(loadSafe());
  const count: Record<string, number> = {};
  for (const m of safe) for (const c of cwLabels(m.cats)) count[c] = (count[c] ?? 0) + 1;
  return Object.entries(count).sort((a, b) => b[1] - a[1]);
}
export function CwStar({ id, kind }: { id?: number; kind?: string }) {
  const w = modOn() && !isSafe(id, kind) ? cwOf(id, kind) : undefined;
  if (!w?.length) return null;
  return <span className="cw-star" title={tt("İçerik uyarısı: ") + cwLabels(w).join(", ")} aria-label={tt("İçerik uyarısı: ") + cwLabels(w).join(", ")}>★</span>;
}
const cwFlag = (id?: number, kind?: string) => modOn() && !!cwOf(id, kind)?.length && !isSafe(id, kind);
export function ModToggle() {
  useTaste();
  const on = modOn();
  return (
    <button className={"chip mod-toggle" + (on ? " on" : "")} title={tt("Yamyamlık, tecavüz, ağır çıplaklık gibi içerikleri olan filmlerin kapağını bulanıklaştırır ve adının yanına kırmızı yıldız koyar")}
      onClick={() => setMod(!on)}>{tt("🛡 Moderasyon")} {on ? tt("açık") : tt("kapalı")}{on && cwProgress.done < cwProgress.total ? <span className="mod-prog"> · {cwProgress.done}/{cwProgress.total}</span> : null}</button>
  );
}

/** Where a film sits on the friend's Letterboxd, said plainly. */
const tagLabel = (t: string, who: string) => t === "Beğendi" ? tt("♥ {0} beğendi", who) : t === "İzledi" ? tt("{0} izledi", who) : t === "İzlemek istiyor" ? tt("{0} izlemek istiyor", who) : tt("{0}'ın listesi: {1}", who, t.replace("Liste: ", ""));
const tagHelp = (t: string, who: string) => t === "Beğendi" ? tt("{0} bu filme Letterboxd'da kalp (beğeni) vermiş", who) : t === "İzledi" ? tt("{0} bu filmi izlemiş (senin izlediğin anlamına gelmez)", who) : t === "İzlemek istiyor" ? tt("{0}'ın Letterboxd izleme listesinde", who) : tt("{0}'ın kendi Letterboxd listesinde: “{1}”", who, t.replace("Liste: ", ""));
const tagOrder = (t: string) => t === "Beğendi" ? 0 : t.startsWith("Liste") ? 1 : t === "İzlemek istiyor" ? 2 : 3;

/** After 👍 / 👎: a small "how many points?" bubble instead of a permanent 1–10 row. */
function RateAsk({ title, year, vote, onDone }: { title: string; year?: string; vote: Vote; onDone: () => void }) {
  const cur = diaryGet(title, year)?.rating;
  const nums = vote === "like" ? [6, 7, 8, 9, 10] : [1, 2, 3, 4, 5];
  useEffect(() => {
    const t = setTimeout(onDone, 8000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className={"rate-ask " + vote} onClick={(e) => e.stopPropagation()}>
      <span>{vote === "like" ? tt("Kaç puan?") : tt("Kaç puan?")}</span>
      {nums.map((n) => (
        <button key={n} className={cur === n ? "on" : ""} onClick={() => { diarySet(title, year, { rating: n, watched: diaryGet(title, year)?.watched ?? Date.now() }); onDone(); }}>{n}</button>
      ))}
      <button className="skip" onClick={onDone}>{tt("Geç")}</button>
    </div>
  );
}

export type DetailTarget = { title: string; year?: string; kind?: "movie" | "tv"; tmdbId?: number; from?: string; note?: string; stars?: number };

/** Details of a title that may not be in the library: TMDB info plus everything Luna knows about it. */
function TitleDetail({ t, items, onClose, onPlay, onTorrent, onAsk }: { t: DetailTarget; items: Item[]; onClose: () => void; onPlay?: (path: string) => void; onTorrent?: () => void; onAsk?: (it: Item) => void }) {
  useTaste();
  const [meta, setMeta] = useState<Meta | null | undefined>(undefined);
  const [note, setNote] = useState(diaryGet(t.title, t.year)?.note ?? "");
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!store.get("tmdbKey")) { setMeta(null); return; }
      let id = t.tmdbId, kind = t.kind ?? "movie";
      if (!id) {
        const y = t.year ? Number(t.year) : undefined;
        const h = (await searchTmdb(t.title, "movie", y).catch(() => []))[0] ?? (await searchTmdb(t.title, "tv", y).catch(() => []))[0];
        if (h) { id = h.id; kind = h.kind; }
      }
      const m = id ? await details(kind, id).catch(() => null) : null;
      if (alive) setMeta(m);
    })();
    return () => { alive = false; };
  }, [t.title, t.year]);
  const d = diaryGet(t.title, t.year);
  const title = meta?.title ?? t.title;
  const year = meta?.year || t.year;
  const lib = items.find((i) => (meta && i.meta?.id === meta.id) || seenKey(i.meta?.title ?? i.parsed.title) === seenKey(t.title));
  const set = (patch: Partial<DiaryEntry>) => diarySet(t.title, t.year, { ...(meta?.genres?.length ? { genres: meta.genres } : {}), ...patch });
  const later = has(loadLater(), year ? `${t.title} (${year})` : t.title) || has(loadLater(), t.title);
  const cwId = meta?.id ?? t.tmdbId, cwKind = meta ? meta.kind ?? t.kind : t.kind;
  useContentWarnings(cwId ? [{ tmdbId: cwId, kind: cwKind as "movie" | "tv" }] : []);
  const warn = modOn() ? cwOf(cwId, cwKind) : undefined;
  const [reveal, setReveal] = useState(false);
  const [ask, setAsk] = useState<Vote | null>(null);
  const safe = isSafe(cwId, cwKind);
  const hide = !!warn?.length && !reveal && !safe;
  return createPortal(
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal wide td">
        <div className={"td-hero" + (hide ? " cw-blur-bg" : "")} style={meta?.backdrop ? { backgroundImage: `url(${IMG}w1280${meta.backdrop})` } : undefined}>
          <div className="td-shade" />
          <button className="round td-x" aria-label={tt("Kapat")} onClick={onClose}><Icon d={I.x} size={18} /></button>
          <div className="td-head">
            {meta?.poster && <img className={"td-poster" + (hide ? " cw-blur" : "")} src={`${IMG}w342${meta.poster}`} alt="" title={hide ? tt("Göstermek için tıkla") : undefined} onClick={() => setReveal(true)} />}
            <div className="td-titles">
              <h2>{title}{warn?.length ? <span className="cw-star big" title={tt("İçerik uyarısı: ") + cwLabels(warn).join(", ")}>★</span> : null}</h2>
              <div className="d-meta">
                {meta?.rating ? <span className="rating">★ {String(meta.rating).replace(".", ",")}</span> : null}
                {year && <span>{year}</span>}
                {meta?.runtime ? <span>{Math.floor(meta.runtime / 60)}  {tt("sa")} {meta.runtime % 60}  {tt("dk")}</span> : null}
                {meta?.genres.length ? <span>{meta.genres.slice(0, 3).join(", ")}</span> : null}
              </div>
              {(t.from || t.stars) && (
                <div className="td-from">{t.from && <><b>{t.from}</b>  {tt("önerdi")}</>}{t.stars ? <>  {tt("· Letterboxd'da")} <span className="td-lb">{"★".repeat(Math.floor(t.stars))}{t.stars % 1 ? "½" : ""}</span>  {tt("verdi (")}{String(t.stars).replace(".", ",")}/5)</> : ""}{t.note ? ` · “${t.note}”` : ""}</div>
              )}
            </div>
          </div>
        </div>
        <div className="td-body">
          {meta === undefined && <div className="muted small">{tt("Bilgiler getiriliyor…")}</div>}
          {meta === null && <div className="muted small">{tt("TMDB'de bulunamadı")}{!store.get("tmdbKey") ? tt(" (Ayarlar'dan TMDB anahtarını gir)") : ""}.</div>}
          {warn?.length ? (
            <div className={"cw-note" + (safe ? " safe" : "")}>
              <span className="cw-star">{safe ? "✓" : "★"}</span> {safe ? tt("Güvenli olarak işaretledin") : tt("İçerik uyarısı")}: {cwLabels(warn).join(" · ")}
              <span className="grow" />
              {hide && <button className="chip" onClick={() => setReveal(true)}>{tt("Kapağı göster")}</button>}
              {cwId ? (safe
                ? <button className="chip" onClick={() => markSafe(cwId, cwKind, null)}>{tt("Geri al")}</button>
                : <button className="chip safe-btn" title={tt("Bu film senin için sorun değil: kapak açılır, yıldız kalkar; Luna neyin senin için hassas olmadığını öğrenir")}
                    onClick={() => { markSafe(cwId, cwKind, { title, year, cats: warn, at: Date.now() }); setReveal(true); }}>{tt("✓ Güvenli olarak işaretle")}</button>) : null}
            </div>
          ) : null}
          {meta?.overview && <TrText className="td-ov" text={meta.overview} />}
          <div className="td-actions">
            {lib && onPlay ? <button className="primary light" onClick={() => { onClose(); onPlay(lib.files[0].path); }}><Icon d={I.play} fill size={16} />  {tt("İzle")}</button>
              : onTorrent && <button className="primary light" data-tip={tt("Kütüphanende yok · magnet ya da torrent gir")} onClick={() => { onClose(); onTorrent(); }}><Icon d={I.play} fill size={16} />  {tt("İzle")}</button>}
            <button className={"act" + (d?.watched ? " on good" : "")} data-tip={d?.watched ? tt("İzlemedim") : tt("İzledim")} aria-label={tt("İzledim")}
              onClick={() => markSeen(year ? `${t.title} (${year})` : t.title, !d?.watched)}><Icon d={I.check} size={20} /></button>
            <span className="vote-wrap">
              <button className={"act" + (d?.vote === "like" ? " on" : "")} data-tip={d?.rating && d.vote === "like" ? tt("Beğendim · {0}/10", d.rating) : tt("Beğendim")} aria-label={tt("Beğendim")}
                onClick={() => { const on = d?.vote !== "like"; set({ vote: on ? "like" : undefined }); setAsk(on ? "like" : null); }}><Icon d={THUMB} size={20} />{d?.vote === "like" && d.rating ? <span className="vote-n">{d.rating}</span> : null}</button>
              {ask === "like" && <RateAsk title={t.title} year={t.year} vote="like" onDone={() => setAsk(null)} />}
            </span>
            <span className="vote-wrap">
              <button className={"act" + (d?.vote === "dislike" ? " on bad" : "")} data-tip={d?.rating && d.vote === "dislike" ? tt("Beğenmedim · {0}/10", d.rating) : tt("Beğenmedim")} aria-label={tt("Beğenmedim")}
                onClick={() => { const on = d?.vote !== "dislike"; set({ vote: on ? "dislike" : undefined }); setAsk(on ? "dislike" : null); }}><Icon d={THUMB_DOWN} size={20} />{d?.vote === "dislike" && d.rating ? <span className="vote-n">{d.rating}</span> : null}</button>
              {ask === "dislike" && <RateAsk title={t.title} year={t.year} vote="dislike" onDone={() => setAsk(null)} />}
            </span>
            <button className={"act" + (later ? " on" : "")} data-tip={later ? tt("Sonra izle listesinden çıkar") : tt("Sonra izle")} aria-label={tt("Sonra izle")}
              onClick={() => markLater(year ? `${t.title} (${year})` : t.title, !later)}><Icon d={later ? I.check : I.plus} size={20} /></button>
            {onAsk && (
              <button className="act ask" data-tip={tt("Asistana sor")} aria-label={tt("Asistana sor")} onClick={() => {
                const kind = meta?.kind ?? t.kind ?? "movie";
                const who = t.from ? tt("({0} önerdi{1}{2}) ", t.from, t.stars ? tt(", Letterboxd puanı {0}/5", t.stars) : "", t.note ? `, notu: “${t.note}”` : "") : "";
                const base = meta ?? { id: t.tmdbId ?? 0, kind, title, year: year ?? "", overview: "", genres: [], cast: [] } as unknown as Meta;
                onAsk({ key: "title:" + seenKey(title) + "|" + (year ?? ""), files: [], parsed: { kind, title }, meta: { ...base, overview: who + (base.overview ?? "") } } as unknown as Item);
                onClose();
              }}><Icon d={ASK_ICON} size={19} /></button>
            )}
            <button className="act" data-tip={tt("YouTube'da Türkçe fragman")} aria-label={tt("Fragman")} onClick={() => openUrl(youtubeTrailer(year ? `${title} (${year})` : title))}><Icon d={I.play} fill size={16} /></button>
            {playlistNames().length > 0 && (
              <select className="pl-pick" value="" onChange={(e) => { if (e.target.value) addToPlaylist(e.target.value, [{ title: t.title, year }]); }}>
                <option value="">{tt("+ Listeye")}</option>
                {playlistNames().map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
            )}
          </div>
          <label className="td-note">{tt("Notun")}
            <input value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => set({ note: note.trim() || undefined })} placeholder={tt("ör. sonu zayıftı, müzikleri harika")} />
          </label>
          {meta?.cast.length ? (
            <div className="cast td-cast2">{meta.cast.slice(0, 15).map((c) => (
              <button key={c.name + c.character} className="person" title={tt("{0} · TMDB'de aç", c.name)}
                onClick={() => openUrl(c.id ? `https://www.themoviedb.org/person/${c.id}?language=${lang()}` : `https://www.themoviedb.org/search/person?query=${encodeURIComponent(c.name)}`)}>
                <div className="face">{c.profile ? <img src={IMG + "w185" + c.profile} alt="" loading="lazy" /> : c.name[0]}</div>
                <div className="p-name">{c.name}</div>
                <div className="muted small">{c.character}</div>
              </button>))}</div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}

/** "Zevk defterim": everything rated, liked, disliked or watched, filterable and editable. */
type DiaryFilter = "all" | "like" | "dislike" | "rated" | "watched";
function DiaryList({ onOpen, start, onClose }: { onOpen: (t: DetailTarget) => void; start: DiaryFilter; onClose: () => void }) {
  useTaste();
  const [f, setF] = useState<DiaryFilter>(start);
  const [q, setQ] = useState("");
  const all = Object.values(loadDiary()).sort((x, y) => y.at - x.at);
  const list = all.filter((e) => (
    f === "like" ? e.vote === "like" || (e.rating ?? 0) >= 7 :
    f === "dislike" ? e.vote === "dislike" || (!!e.rating && e.rating <= 4) :
    f === "rated" ? !!e.rating : f === "watched" ? !!e.watched : true
  ) && (!q.trim() || seenKey(e.title).includes(seenKey(q))));
  if (!all.length) return null;
  const remove = (e: DiaryEntry) => {
    const d = loadDiary();
    for (const k of Object.keys(d)) if (d[k] === d[k] && seenKey(d[k].title) === seenKey(e.title) && d[k].year === e.year) delete d[k];
    store.set("diary", JSON.stringify(d));
    markSeen(e.year ? `${e.title} (${e.year})` : e.title, false);
  };
  return createPortal(
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
    <div className="modal wide diary-modal">
      <h2 className="recs-head">{tt("Zevk defterim")} <span className="muted small">{all.length}</span><span className="grow" />
        <input className="pl-new" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tt("Ara")} />
        <button className="round sm-round" aria-label={tt("Kapat")} onClick={onClose}><Icon d={I.x} size={14} /></button>
      </h2>
      <div className="pl-tabs">
        {([["all", tt("Hepsi")], ["like", tt("Beğendiklerim")], ["dislike", tt("Beğenmediklerim")], ["rated", tt("Puanladıklarım")], ["watched", tt("İzlediklerim")]] as const).map(([k, l]) => (
          <button key={k} className={"seg sm" + (f === k ? " on" : "")} onClick={() => setF(k)}>{l}</button>
        ))}
      </div>
      <div className="pl-items">
        {list.slice(0, 200).map((e) => (
          <div key={e.title + (e.year ?? "")} className="pl-item diary-item">
            <button className="diary-open" onClick={() => { onClose(); onOpen({ title: e.title, year: e.year }); }}>
              <b className="ellipsis">{e.title}</b>
              <span className="muted small">{e.year ?? ""}{e.watched ? " · izledin" : ""}{e.note ? ` · “${e.note}”` : ""}</span>
            </button>
            <span className={"diary-vote" + (e.vote === "like" ? " like" : e.vote === "dislike" ? " dislike" : "")}>{e.vote === "like" ? "👍" : e.vote === "dislike" ? "👎" : ""}</span>
            <select className="pl-pick" value={e.rating ?? ""} onChange={(ev) => diarySet(e.title, e.year, { rating: ev.target.value ? Number(ev.target.value) : undefined })}>
              <option value="">{tt("Puan")}</option>
              {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}/10</option>)}
            </select>
            <button className="round sm-round" title={tt("Defterden sil")} aria-label={tt("Sil")} onClick={() => remove(e)}><Icon d={I.x} size={12} /></button>
          </div>
        ))}
        {!list.length && <div className="muted small">{tt("Bu filtrede kayıt yok.")}</div>}
      </div>
    </div>
    </div>,
    document.body
  );
}

/** A list's cover: the first four posters as a collage. */
function PlCover({ items }: { items: PlItem[] }) {
  const ps = items.filter((x) => x.poster && !cwFlag(x.tmdbId, x.kind)).slice(0, 4);
  return (
    <div className={"plc-cover n" + ps.length}>
      {ps.length ? ps.map((x, i) => <div key={i} style={{ backgroundImage: `url(${IMG}w185${x.poster})` }} />) : <Icon d={I.film} size={28} />}
    </div>
  );
}

type PlSort = "order" | "tmdb" | "stars" | "new" | "old" | "az";
const PL_SORTS: [PlSort, string][] = [["order", tt("Liste sırası")], ["tmdb", tt("TMDB puanı")], ["stars", tt("Arkadaşın puanı")], ["new", tt("En yeni")], ["old", tt("En eski")], ["az", "A → Z"]];

const isFolder = (p: Playlist, all: Playlist[]) => !p.parent && all.some((x) => x.parent === p.id);

/** One open list: hero, tools and the poster wall. `owner` is the friend it belongs to, if any. */
function PlaylistView({ pl, owner, items, onPlay, onOpen, onClose }: {
  pl: Playlist; owner?: string; items: Item[]; onPlay?: (path: string) => void; onOpen?: (t: DetailTarget) => void; onClose?: () => void;
}) {
  const [sort, setSort] = useState<PlSort>("order");
  const [q, setQ] = useState("");
  const [onlyLib, setOnlyLib] = useState(false);
  const [shown, setShown] = useState(60);
  const [drag, setDrag] = useState<number | null>(null);
  useEffect(() => {
    const all = loadPlaylists();
    const cur = all.find((p) => p.id === pl.id);
    if (cur && cur.items.slice(0, shown).some((x) => (!x.poster || x.rating == null) && !x.noPoster)) fillPosters(cur.items.slice(0, shown), () => savePlaylists(all), shown);
  }, [pl.id, shown]);
  const inLib = (t: PlItem) => items.find((i) => (t.tmdbId && i.meta?.id === t.tmdbId) || seenKey(i.meta?.title ?? i.parsed.title) === seenKey(t.title));
  const edit = (f: (p: Playlist) => void) => { const all = loadPlaylists(); const p = all.find((x) => x.id === pl.id); if (p) { f(p); savePlaylists(all); } };
  const removeItem = (t: PlItem) => edit((p) => { p.items = p.items.filter((x) => !(x.title === t.title && x.year === t.year)); });
  const moveTo = (from: number, to: number) => { if (from !== to) edit((p) => { const [x] = p.items.splice(from, 1); p.items.splice(to, 0, x); }); };
  const del = () => { if (confirm(tt("“{0}” silinsin mi?", pl.name))) { savePlaylists(loadPlaylists().filter((x) => x.id !== pl.id)); onClose?.(); } };

  const all = pl.items;
  let view = all.map((t, i) => ({ t, i }));
  if (q.trim()) view = view.filter(({ t }) => seenKey(t.title).includes(seenKey(q)));
  if (onlyLib) view = view.filter(({ t }) => inLib(t));
  const by: Record<PlSort, (a: PlItem, b: PlItem) => number> = {
    order: () => 0,
    tmdb: (a, b) => (b.rating ?? 0) - (a.rating ?? 0),
    stars: (a, b) => (b.stars ?? 0) - (a.stars ?? 0),
    new: (a, b) => Number(b.year ?? 0) - Number(a.year ?? 0),
    old: (a, b) => Number(a.year ?? 9999) - Number(b.year ?? 9999),
    az: (a, b) => a.title.localeCompare(b.title, "tr"),
  };
  if (sort !== "order") view = [...view].sort((a, b) => by[sort](a.t, b.t));
  const rated = all.filter((x) => x.rating);
  const avg = rated.length ? rated.reduce((n, x) => n + (x.rating ?? 0), 0) / rated.length : 0;
  const libCount = all.filter((x) => inLib(x)).length;
  const hero = all.find((x) => x.poster && !cwFlag(x.tmdbId, x.kind))?.poster;
  useContentWarnings(view.slice(0, shown).map(({ t }) => t));
  const target = (t: PlItem): DetailTarget => ({ title: t.title, year: t.year, kind: t.kind, tmdbId: t.tmdbId, stars: t.stars, from: owner });

  return (
    <div className="plv">
      <div className="plv-hero" style={hero ? { backgroundImage: `url(${IMG}w780${hero})` } : undefined}>
        <div className="plv-shade" />
        {onClose && <button className="round plv-x" aria-label={tt("Kapat")} title={tt("Kapat")} onClick={onClose}><Icon d={I.x} size={16} /></button>}
        <div className="plv-head">
          <div className="plv-kicker">{owner ? `${owner} › ` : ""}{pl.source ? tt("Letterboxd'dan") : tt("Listem")}</div>
          <h3>{pl.name}</h3>
          <div className="plv-stats">
            <span><b>{all.length}</b>  {tt("film")}</span>
            {avg > 0 && <span className="rating">★ {avg.toFixed(1).replace(".", ",")}  {tt("ort.")}</span>}
            {libCount > 0 && <span><b>{libCount}</b>  {tt("kütüphanende")}</span>}
          </div>
        </div>
        <div className="plv-tools">
          <div className="plv-search"><Icon d={I.search} size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tt("Listede ara")} /></div>
          <select value={sort} onChange={(e) => setSort(e.target.value as PlSort)}>{PL_SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <button className={"chip" + (onlyLib ? " on" : "")} onClick={() => setOnlyLib((v) => !v)}>{tt("Kütüphanemdekiler")}</button>
          <button className="chip" onClick={del}>{tt("Listeyi sil")}</button>
        </div>
      </div>
      <div className="plg">
        {view.slice(0, shown).map(({ t, i }) => {
          const lib = inLib(t);
          const d = diaryGet(t.title, t.year);
          return (
            <div key={t.title + (t.year ?? "") + i} className={"plg-card" + (drag === i ? " dragging" : "")}
              draggable={sort === "order" && !q && !onlyLib}
              onDragStart={() => setDrag(i)} onDragEnd={() => setDrag(null)}
              onDragOver={(e) => { if (drag != null) e.preventDefault(); }}
              onDrop={() => { if (drag != null) moveTo(drag, i); setDrag(null); }}>
              <div className={"plg-poster clickable" + (cwFlag(t.tmdbId, t.kind) ? " cw-blur" : "")} onClick={() => onOpen?.(target(t))}
                style={t.poster ? { backgroundImage: `url(${IMG}w342${t.poster})` } : undefined}>
                {!t.poster && <div className="plg-blank"><Icon d={I.film} size={26} /><span>{t.title}</span></div>}
                {t.rating ? <span className="tmdb-badge">★ {t.rating.toFixed(1).replace(".", ",")}</span> : null}
                {sort === "order" && <span className="plg-rank">{i + 1}</span>}
                {(lib || d?.watched) && <span className="plg-flags">{lib ? <span title={tt("Kütüphanende var")}>●</span> : null}{d?.watched ? <span title={tt("İzledin")}>✓</span> : null}</span>}
                <div className="plg-hover" onClick={(e) => e.stopPropagation()}>
                  {lib && onPlay && <button className="round" title={tt("Oynat")} aria-label={tt("Oynat")} onClick={() => onPlay(lib.files[0].path)}><Icon d={I.play} fill size={18} /></button>}
                  <button className="round" title={tt("YouTube'da Türkçe fragman")} aria-label={tt("Fragman")} onClick={() => openUrl(youtubeTrailer(t.year ? `${t.title} (${t.year})` : t.title))}><Icon d={I.play} fill size={14} /></button>
                  <button className="round" title={tt("Detay")} aria-label={tt("Detay")} onClick={() => onOpen?.(target(t))}>i</button>
                  <button className="round" title={tt("Listeden çıkar")} aria-label={tt("Çıkar")} onClick={() => removeItem(t)}><Icon d={I.x} size={14} /></button>
                </div>
              </div>
              <div className="plg-title ellipsis" title={t.title}><CwStar id={t.tmdbId} kind={t.kind} />{t.title}</div>
              <div className="plg-sub">{t.year ?? ""}{t.stars ? <span className="plg-stars" title={tt("{0} puanı", owner ? owner + tt("'ın") : "Letterboxd")}>{owner ? owner + ": " : ""}{stars(t.stars)}</span> : null}{d?.rating ? <span className="plg-mine">{tt("sen")} {d.rating}/10</span> : null}</div>
            </div>
          );
        })}
      </div>
      {view.length > shown && <div className="plg-more"><button className="chip" onClick={() => setShown((n) => n + 60)}>{tt("Daha fazla göster (")}{view.length - shown})</button></div>}
      {!all.length && <div className="muted small plg-empty">{tt("Liste boş. Öneri kartlarındaki “+ Listeye” ile ya da asistanla doldurabilirsin.")}</div>}
      {all.length > 0 && !view.length && <div className="muted small plg-empty">{tt("Eşleşen film yok.")}</div>}
    </div>
  );
}

/** "Listelerim": only the user's own lists (friends' lists live under the friend). */
function Playlists({ items, onPlay, onOpen }: { items: Item[]; onPlay?: (path: string) => void; onOpen?: (t: DetailTarget) => void }) {
  useTaste();
  const lists = loadPlaylists();
  const own = lists.filter((p) => !p.parent && !isFolder(p, lists));
  const [sel, setSel] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const cur = own.find((p) => p.id === sel);
  const create = () => { if (!name.trim()) return; const p = createPlaylist(name); setSel(p.id); setName(""); setCollapsed(false); };
  return (
    <section className="row pl2">
      <h2 className="recs-head">
        <button className="sect-toggle" onClick={() => setCollapsed((v) => !v)} aria-expanded={!collapsed}>
          <span className={"caret" + (collapsed ? "" : " open")}>▸</span>  {tt("Listelerim")} <span className="muted small">{own.length}</span>
        </button>
        <span className="grow" />
        <input className="pl-new" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} placeholder={tt("Yeni liste adı")} />
        <button className="chip" onClick={create} disabled={!name.trim()}>{tt("Oluştur")}</button>
      </h2>
      {!collapsed && (
        <>
          {!own.length && <div className="muted empty-note">{tt("Kendi listen yok. Buradan oluşturabilir ya da asistana “bana hafta sonu için bir maraton listesi yap” diyebilirsin.")}</div>}
          {own.length > 0 && (
            <div className="plc-shelf">
              {own.map((p) => (
                <button key={p.id} className={"plc" + (cur?.id === p.id ? " on" : "")} onClick={() => setSel(cur?.id === p.id ? null : p.id)}>
                  <PlCover items={p.items} />
                  <div className="plc-name ellipsis">{p.name}</div>
                  <div className="plc-meta">{p.items.length}  {tt("film")}</div>
                </button>
              ))}
            </div>
          )}
          {cur && <PlaylistView key={cur.id} pl={cur} items={items} onPlay={onPlay} onOpen={onOpen} onClose={() => setSel(null)} />}
        </>
      )}
    </section>
  );
}

/** The watch-later list (from the assistant, the chat bookmarks and by hand): poster cards, looked up on TMDB once. */
type LaterMeta = { poster?: string | null; rating?: number; tmdbId?: number; kind?: "movie" | "tv"; none?: boolean };
const laterKey = (t: string) => seenKey(t);
function LaterList({ items, onOpen, onPlay }: { items: Item[]; onOpen: (t: DetailTarget) => void; onPlay?: (path: string) => void }) {
  const [later, setLater] = useState<string[]>(loadLater);
  useTaste();
  useEffect(() => setLater(loadLater()), []);
  const meta = store.json<Record<string, LaterMeta>>("laterMeta", {});
  const [, bump] = useState(0);
  useEffect(() => {
    const todo = later.filter((t) => !meta[laterKey(t)]);
    if (!todo.length || !store.get("tmdbKey")) return;
    let alive = true;
    (async () => {
      for (const t of todo) {
        const title = t.replace(/\s*\((\d{4})\)\s*$/, "");
        const y = Number(t.match(/\((\d{4})\)\s*$/)?.[1]) || undefined;
        try {
          const good = (l: SearchHit[]) => l.find((x) => x.poster && (!y || x.year === String(y))) ?? l.find((x) => x.poster);
          const h = good(await searchTmdb(title, "movie", y)) ?? good(await searchTmdb(title, "tv", y)) ?? good(await searchTmdb(title, "movie"));
          const all = store.json<Record<string, LaterMeta>>("laterMeta", {});
          all[laterKey(t)] = h ? { poster: h.poster, rating: h.rating, tmdbId: h.id, kind: h.kind } : { none: true };
          store.set("laterMeta", JSON.stringify(all));
          if (alive) bump((n) => n + 1);
        } catch { /* try again next time */ }
      }
    })();
    return () => { alive = false; };
  }, [later.join("|")]);
  if (!later.length) return null;
  return (
    <section className="row">
      <h2>{tt("Sonra izleyeceklerim")} <span className="muted small">{later.length}</span></h2>
      <div className="plg later-grid">
        {later.map((t) => {
          const m = meta[laterKey(t)];
          const title = t.replace(/\s*\((\d{4})\)\s*$/, "");
          const year = t.match(/\((\d{4})\)\s*$/)?.[1];
          const lib = items.find((i) => (m?.tmdbId && i.meta?.id === m.tmdbId) || seenKey(i.meta?.title ?? i.parsed.title) === seenKey(title));
          const open = () => onOpen({ title, year, kind: m?.kind, tmdbId: m?.tmdbId });
          return (
            <div key={t} className="plg-card">
              <div className={"plg-poster clickable" + (cwFlag(m?.tmdbId, m?.kind) ? " cw-blur" : "")} onClick={open}
                style={m?.poster ? { backgroundImage: `url(${IMG}w342${m.poster})` } : undefined}>
                {!m?.poster && <div className="plg-blank"><Icon d={I.film} size={26} /><span>{title}</span></div>}
                {m?.rating ? <span className="tmdb-badge">★ {m.rating.toFixed(1).replace(".", ",")}</span> : null}
                {lib && <span className="plg-flags"><span title={tt("Kütüphanende var")}>●</span></span>}
                <div className="plg-hover" onClick={(e) => e.stopPropagation()}>
                  {lib && onPlay && <button className="round" title={tt("Oynat")} aria-label={tt("Oynat")} onClick={() => onPlay(lib.files[0].path)}><Icon d={I.play} fill size={18} /></button>}
                  <button className="round" title={tt("YouTube'da Türkçe fragman")} aria-label={tt("Fragman")} onClick={() => openUrl(youtubeTrailer(t))}><Icon d={I.play} fill size={14} /></button>
                  <button className="round" title={tt("Detay")} aria-label={tt("Detay")} onClick={open}>i</button>
                  <button className="round" title={tt("Listeden çıkar")} aria-label={tt("Çıkar")} onClick={() => setLater(markLater(t, false))}><Icon d={I.x} size={14} /></button>
                </div>
              </div>
              <div className="plg-title ellipsis" title={title}><CwStar id={m?.tmdbId} kind={m?.kind} />{title}</div>
              <div className="plg-sub">{year ?? ""}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function RecsPage({ items, onPlay, onTorrent, onAsk }: { items: Item[]; onPlay?: (path: string) => void; onTorrent?: () => void; onAsk?: (it: Item) => void }) {
  const { recs } = useTaste();
  const [detail, setDetail] = useState<DetailTarget | null>(null);
  const [shown, setShown] = useState(48);
  const [doneShown, setDoneShown] = useState(24);
  // a card that was just voted on stays in place until its rating bubble closes
  const [askFor, setAskFor] = useState<{ id: string; vote: Vote } | null>(null);
  // whose recommendations are open: a name, "*" for everyone, null for none
  const [who, setWho] = useState<string | null>(null);
  const [tab, setTab] = useState<string>("recs");
  const [modOpen, setModOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [lbOpen, setLbOpen] = useState(false);
  const [lb, setLb] = useState("");
  const [lbWho, setLbWho] = useState("");
  const [busyMsg, setBusyMsg] = useState("");
  const pick = (w: string | null) => { setWho(w); setTab("recs"); setModOpen(false); setShown(48); setDoneShown(24); if (w && w !== "*") setFrom(w); };
  const [imp, setImp] = useState(false);
  const [title, setTitle] = useState("");
  const [from, setFrom] = useState("");
  const [note, setNote] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [hit, setPick] = useState<SearchHit | null>(null);

  useEffect(() => {
    setPick(null);
    if (title.trim().length < 2 || !store.get("tmdbKey")) { setHits([]); return; }
    const t = setTimeout(async () => {
      const [m, tv] = await Promise.all([searchTmdb(title, "movie").catch(() => []), searchTmdb(title, "tv").catch(() => [])]);
      setHits([...m.slice(0, 4), ...tv.slice(0, 2)]);
    }, 350);
    return () => clearTimeout(t);
  }, [title]);

  const add = () => {
    const name = hit?.title ?? title.trim();
    if (!name) return;
    const r: Rec = {
      id: Date.now().toString(36), title: name, year: hit?.year, kind: hit?.kind ?? "movie",
      from: from.trim() || "Biri", note: note.trim(), at: Date.now(), tmdbId: hit?.id, poster: hit?.poster,
    };
    saveRecs([r, ...loadRecs()]);
    setTitle(""); setNote(""); setPick(null); setHits([]);
  };
  const patch = (id: string, p: Partial<Rec>) => saveRecs(loadRecs().map((r) => (r.id === id ? { ...r, ...p } : r)));
  const remove = (id: string) => saveRecs(loadRecs().filter((r) => r.id !== id));
  const inLib = (r: Rec) => items.some((i) => (r.tmdbId && i.meta?.id === r.tmdbId) || (i.meta?.title ?? i.parsed.title).toLowerCase() === r.title.toLowerCase());
  const mine = who && who !== "*" ? recs.filter((r) => seenKey(r.from) === seenKey(who)) : recs;
  const open = who ? mine.filter((r) => !r.status || r.id === askFor?.id) : [];
  const done = who ? mine.filter((r) => r.status && r.id !== askFor?.id) : [];
  useContentWarnings(open.slice(0, shown));
  // posters for the cards on screen (and the next page as they open)
  const missing = open.slice(0, shown).filter((r) => !r.poster && !r.noPoster).length;
  useEffect(() => {
    if (!missing) return;
    const all = loadRecs();
    const byId = new Map(all.map((r) => [r.id, r]));
    const work = open.slice(0, shown).map((r) => byId.get(r.id)!).filter(Boolean);
    fillPosters(work, () => saveRecs(all), shown);
  }, [shown, missing > 0]);

  const vote = (r: Rec, v: Vote) => {
    patch(r.id, { status: "watched", vote: v });
    diarySet(r.title, r.year, { watched: Date.now(), vote: v });
    setAskFor({ id: r.id, vote: v });
  };
  const card = (r: Rec) => {
    const target: DetailTarget = { title: r.title, year: r.year, kind: r.kind, tmdbId: r.tmdbId, from: r.from, note: r.note, stars: r.stars };
    const dr = diaryGet(r.title, r.year)?.rating;
    return (
      <div key={r.id} className={"plg-card rec2" + (r.status ? " done" : "")}>
        <div className={"plg-poster clickable" + (cwFlag(r.tmdbId, r.kind) ? " cw-blur" : "")} onClick={() => setDetail(target)}
          style={r.poster ? { backgroundImage: `url(${IMG}w342${r.poster})` } : undefined}>
          {!r.poster && <div className="plg-blank"><Icon d={I.film} size={26} /><span>{r.title}</span></div>}
          {r.rating ? <span className="tmdb-badge">★ {r.rating.toFixed(1).replace(".", ",")}</span> : null}
          {r.status && <span className={"rec-state " + (r.status === "dismissed" ? "off" : r.vote ?? "")}>{r.status === "dismissed" ? tt("İlgilenmiyorum") : r.vote === "like" ? `👍${dr ? " " + dr : ""}` : `👎${dr ? " " + dr : ""}`}</span>}
          {inLib(r) && <span className="plg-flags"><span title={tt("Kütüphanende var")}>●</span></span>}
          <div className="plg-hover" onClick={(e) => e.stopPropagation()}>
            {!r.status ? (
              <>
                <button className="round" title={tt("İzledim · beğendim")} aria-label={tt("Beğendim")} onClick={() => vote(r, "like")}><Icon d={THUMB} size={16} /></button>
                <button className="round" title={tt("İzledim · beğenmedim")} aria-label={tt("Beğenmedim")} onClick={() => vote(r, "dislike")}><Icon d={THUMB_DOWN} size={16} /></button>
                <button className="round" title={tt("İlgilenmiyorum")} aria-label={tt("İlgilenmiyorum")} onClick={() => patch(r.id, { status: "dismissed" })}>⊘</button>
              </>
            ) : (
              <button className="round" title={tt("Geri al")} aria-label={tt("Geri al")} onClick={() => patch(r.id, { status: undefined, vote: undefined })}>↺</button>
            )}
            <button className="round" title={tt("YouTube'da Türkçe fragman")} aria-label={tt("Fragman")} onClick={() => openUrl(youtubeTrailer(r.year ? `${r.title} (${r.year})` : r.title))}><Icon d={I.play} fill size={14} /></button>
            {playlistNames().length > 0 && (
              <span className="round pl-round" title={tt("Listeye ekle")}>+
                <select value="" onChange={(e) => { if (e.target.value) addToPlaylist(e.target.value, [{ title: r.title, year: r.year }]); }}>
                  <option value="">{tt("Listeye ekle…")}</option>
                  {playlistNames().map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
                </select>
              </span>
            )}
            <button className="round" title={tt("Öneriyi sil")} aria-label={tt("Sil")} onClick={() => remove(r.id)}><Icon d={I.x} size={14} /></button>
          </div>
          {askFor?.id === r.id && <RateAsk title={r.title} year={r.year} vote={askFor.vote} onDone={() => setAskFor(null)} />}
        </div>
        <div className="plg-title ellipsis" title={r.title}><CwStar id={r.tmdbId} kind={r.kind} />{r.title}</div>
        <div className="plg-sub">{r.year ?? ""}{who === "*" && <span className="rec-from">{r.from}</span>}{r.stars ? <span className="plg-stars" title={tt("{0}'ın Letterboxd puanı: {1} / 5", r.from, String(r.stars).replace(".", ","))}>{stars(r.stars)}</span> : null}</div>
        {r.tags?.length ? <div className="rec-tags">{[...r.tags].sort((a, b) => tagOrder(a) - tagOrder(b)).slice(0, 3).map((t) => <span key={t} className={"rtag" + (t === "Beğendi" ? " like" : t === "İzlemek istiyor" ? " want" : t.startsWith("Liste") ? " list" : "")} title={tagHelp(t, r.from)}>{tagLabel(t, r.from)}</span>)}{r.tags.length > 3 ? <span className="rtag" title={r.tags.slice(3).map((t) => tagHelp(t, r.from)).join(" · ")}>+{r.tags.length - 3}</span> : null}</div> : null}
        {r.note && <div className="rec-note ellipsis" title={r.note}>“{r.note}”</div>}
      </div>
    );
  };

  // ----- people: everyone with recommendations or a Letterboxd folder
  const allPl = loadPlaylists();
  const aff = friendAffinity();
  for (const p of allPl) if (isFolder(p, allPl) && !aff[p.name]) aff[p.name] = { total: 0, rated: 0, liked: 0 } as any;
  const people = Object.entries(aff).sort((x, y) => y[1].total - x[1].total).map(([name]) => name);
  const folderOf = (w: string) => allPl.find((p) => !p.parent && seenKey(p.name) === seenKey(w) && isFolder(p, allPl));
  const coverOf = (w: string): PlItem[] => {
    const f = folderOf(w);
    return [...recs.filter((r) => seenKey(r.from) === seenKey(w)), ...(f ? allPl.filter((x) => x.parent === f.id).flatMap((x) => x.items.slice(0, 8)) : [])];
  };
  const mod = modOn();
  const stats = mod ? Object.fromEntries(people.map((w) => [w, modStats(w)])) : {} as Record<string, ReturnType<typeof modStats>>;
  useContentWarnings(mod && who && who !== "*" ? stats[who]?.list ?? [] : []);
  const folder = who && who !== "*" ? folderOf(who) : undefined;
  const subLists = folder ? allPl.filter((x) => x.parent === folder.id) : [];
  const curList = subLists.find((x) => x.id === tab);
  useEffect(() => {
    if (!who) { setRecsView(null); return; }
    setRecsView(curList
      ? { who, list: curList.name, films: curList.items }
      : { who, list: who === "*" ? tt("Tüm öneriler") : tt("Önerileri"), films: mine.filter((r) => !r.status) });
  }, [who, tab, curList?.items.length, mine.length]);
  useEffect(() => () => setRecsView(null), []);
  const st = who && who !== "*" ? stats[who] : undefined;
  const follow = async () => {
    if (!lb.trim() || !lbWho.trim()) return;
    setBusyMsg(tt("Letterboxd okunuyor… (beğenileri, izleme listesi ve kendi listeleri)"));
    try { setBusyMsg(await followLetterboxd(lbWho, lb.trim())); setLb(""); setLbOpen(false); pick(lbWho.trim()); } catch (e) { setBusyMsg(String(e)); }
  };
  const delPerson = (w: string) => {
    if (!confirm(tt("{0} ile ilgili her şey (önerileri ve Letterboxd listeleri) silinsin mi?", w))) return;
    const f = folderOf(w);
    if (f) savePlaylists(loadPlaylists().filter((p) => p.id !== f.id && p.parent !== f.id));
    saveRecs(loadRecs().filter((r) => seenKey(r.from) !== seenKey(w)));
    pick(null);
  };

  const addForm = (
    <div className="rec-form">
      <div className="rec-inputs">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tt("Film / dizi adı")} />
        <input className={from.trim() || !title.trim() ? "" : "need"} value={from} onChange={(e) => setFrom(e.target.value)} placeholder={tt("Kim önerdi? (gerekli)")} list="rec-people" />
        <datalist id="rec-people">{people.map((p) => <option key={p} value={p} />)}</datalist>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={tt("Ne dedi? (isteğe bağlı)")} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button className="primary" onClick={add} disabled={!title.trim() || !from.trim()} title={!from.trim() ? tt("Önce kimin önerdiğini yaz") : undefined}>{tt("Ekle")}</button>
      </div>
      {hits.length > 0 && (
        <div className="rec-hits">
          {hits.map((h) => (
            <button key={h.kind + h.id} className={"rec-hit" + (hit === h ? " on" : "")} onClick={() => setPick(hit === h ? null : h)}>
              {h.poster ? <img src={`${IMG}w92${h.poster}`} alt="" /> : <span className="ph" />}
              <span className="ellipsis">{h.title}</span>
              <span className="muted small">{h.year} · {h.kind === "tv" ? tt("Dizi") : tt("Film")}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const recGrid = (
    <>
      {!open.length && !done.length && <div className="muted empty-note">{who === "*" ? tt("Henüz öneri yok.") : tt("{0} henüz bir şey önermedi.", who)}</div>}
      <div className="plg rec-grid">{open.slice(0, shown).map(card)}</div>
      {open.length > shown && <div className="plg-more"><button className="chip" onClick={() => setShown((n) => n + 48)}>{tt("Daha fazla göster (")}{open.length - shown})</button></div>}
      {done.length > 0 && <><h2 className="rec-sub">{tt("Bakılanlar")}</h2><div className="plg rec-grid">{done.slice(0, doneShown).map(card)}</div>
        {done.length > doneShown && <div className="plg-more"><button className="chip" onClick={() => setDoneShown((n) => n + 48)}>{tt("Daha fazla göster (")}{done.length - doneShown})</button></div>}</>}
    </>
  );

  return (
    <div className="page">
      <TasteSummary items={items} onOpen={setDetail} />
      <section className="row">
        <h2 className="recs-head">{tt("Öneriler")} <span className="grow" />
          <ModToggle />
          <button className={"chip" + (addOpen ? " on" : "")} onClick={() => setAddOpen((v) => !v)}>{tt("+ Öneri ekle")}</button>
          <button className={"chip" + (imp ? " on" : "")} onClick={() => setImp((v) => !v)}>{tt("İçe aktar")}</button>
          <button className={"chip" + (lbOpen ? " on" : "")} onClick={() => setLbOpen((v) => !v)}>{tt("Letterboxd bağla")}</button>
          <button className="chip" onClick={async () => { setBusyMsg(tt("Güncelleniyor…")); setBusyMsg(await refreshLinkedPlaylists(setBusyMsg)); }}>{tt("⟳ Güncelle")}</button>
        </h2>
        {addOpen && addForm}
        {imp && <ImportPanel onDone={() => setImp(false)} />}
        {lbOpen && (
          <div className="lb-row">
            <input value={lbWho} onChange={(e) => setLbWho(e.target.value)} placeholder={tt("Kimin? (ör. Ali)")} />
            <input value={lb} onChange={(e) => setLb(e.target.value)} onKeyDown={(e) => e.key === "Enter" && follow()} placeholder={tt("Letterboxd profil ya da liste bağlantısı")} />
            <button className="primary sm" onClick={follow} disabled={!lb.trim() || !lbWho.trim()}>{tt("Bağla")}</button>
          </div>
        )}
        {busyMsg && <div className="small import-msg">{busyMsg}</div>}
        {!people.length && <div className="muted empty-note">{tt("Arkadaşlarının önerdiği filmleri ekle ya da Letterboxd'larını bağla. Luna asistanı bunları da hesaba katar.")}</div>}

        {people.length > 0 && (
          <div className="ppl-shelf">
            <button className={"ppl" + (who === "*" ? " on" : "")} onClick={() => pick(who === "*" ? null : "*")}>
              <PlCover items={recs.slice(0, 40)} />
              <div className="plc-name">{tt("Tüm öneriler")}</div>
              <div className="plc-meta">{recs.length}  {tt("film ·")} {people.length}  {tt("kişi")}</div>
            </button>
            {people.map((w) => {
              const a2 = aff[w];
              const f = folderOf(w);
              return (
                <button key={w} className={"ppl" + (who === w ? " on" : "")} onClick={() => pick(who === w ? null : w)}>
                  <div className="ppl-cover"><PlCover items={coverOf(w)} /><span className="ppl-initial">{w[0]?.toLocaleUpperCase("tr")}</span></div>
                  <div className="plc-name ellipsis">{w}{mod && stats[w]?.flagged ? <span className="cw-star" title={tt("Moderasyona takılan film sayısı")}>★{stats[w].flagged}</span> : null}</div>
                  <div className="plc-meta">{a2.total ? tt("{0} öneri", a2.total) : ""}{a2.total && f ? " · " : ""}{f ? tt("{0} liste", allPl.filter((x) => x.parent === f.id).length) : ""}{a2.rated ? tt(" · %{0} uyum", Math.round((a2.liked / a2.rated) * 100)) : ""}</div>
                </button>
              );
            })}
          </div>
        )}

        {who && (
          <div className="ppl-panel">
            <div className="ppl-head">
              <div className="ppl-avatar">{who === "*" ? "★" : who[0]?.toLocaleUpperCase("tr")}</div>
              <div>
                <h3>{who === "*" ? tt("Tüm öneriler") : who}</h3>
                <div className="plv-stats">
                  <span><b>{mine.length}</b>  {tt("öneri")}</span>
                  {subLists.length > 0 && <span><b>{subLists.length}</b>  {tt("Letterboxd listesi")}</span>}
                  {st && <span><b>{st.total}</b>  {tt("film toplam")}</span>}
                  {who !== "*" && aff[who]?.rated ? <span>%{Math.round((aff[who].liked / aff[who].rated) * 100)}  {tt("uyum (")}{aff[who].liked}/{aff[who].rated})</span> : null}
                  {mod && st && (
                    <button className={"mod-count" + (modOpen ? " on" : "")} title={tt("Moderasyona takılan filmler · ayrıntı için tıkla")} onClick={() => setModOpen((v) => !v)}>
                      <span className="cw-star">★</span>{st.flagged}<span className="muted"> / {st.total}</span>
                    </button>
                  )}
                </div>
              </div>
              <span className="grow" />
              {who !== "*" && <button className="chip" onClick={() => delPerson(who)}>{tt("{0}'ı sil", who)}</button>}
              <button className="round" aria-label={tt("Kapat")} title={tt("Kapat")} onClick={() => pick(null)}><Icon d={I.x} size={16} /></button>
            </div>

            {mod && st && modOpen && (
              <div className="mod-panel">
                <div className="mod-head">
                  
                  {tt("toplam")} <b>{st.total}</b>  {tt("filmin")} <b className="cw-red">{st.flagged}</b>  {tt("tanesi moderasyona takılıyor")}
                  {st.total ? <span className="cw-red"> (%{Math.round((st.flagged / st.total) * 100)})</span> : null}
                  {st.checked < st.total && <span className="muted small">  {tt("· kontrol ediliyor")} {st.checked}/{st.total}</span>}
                </div>
                {st.cats.length ? st.cats.map(([c, n]) => (
                  <div key={c} className="mod-row">
                    <span className="mod-cat">{c}</span>
                    <div className="mod-bar"><div style={{ width: `${(n / Math.max(1, st.total)) * 100}%` }} /></div>
                    <span className="mod-pct">%{((n / Math.max(1, st.total)) * 100).toFixed(1).replace(".", ",")}</span>
                    <span className="muted small mod-n">{n}  {tt("film")}</span>
                  </div>
                )) : <div className="muted small">{st.checked ? tt("Takılan film yok.") : tt("Henüz kontrol edilmedi.")}</div>}
                <div className="muted small">{tt("Yüzdeler {0}'ın toplam film sayısına göre. Bir film birden fazla kategoriye girebilir.", who)}</div>
              </div>
            )}

            {subLists.length > 0 && (
              <div className="ppl-tabs">
                <button className={"seg sm" + (tab === "recs" ? " on" : "")} onClick={() => setTab("recs")}>{tt("Önerileri")} <span className="muted">{mine.length}</span></button>
                {subLists.map((x) => (
                  <button key={x.id} className={"seg sm" + (tab === x.id ? " on" : "")} onClick={() => setTab(x.id)}>{x.name} <span className="muted">{x.items.length}</span></button>
                ))}
              </div>
            )}
            {curList ? <PlaylistView key={curList.id} pl={curList} owner={who} items={items} onPlay={onPlay} onOpen={setDetail} /> : recGrid}
          </div>
        )}
      </section>
      <Playlists items={items} onPlay={onPlay} onOpen={setDetail} />
      <LaterList items={items} onOpen={setDetail} onPlay={onPlay} />
      {detail && <TitleDetail t={detail} items={items} onClose={() => setDetail(null)} onPlay={onPlay} onTorrent={onTorrent} onAsk={onAsk} />}
    </div>
  );
}

// ---------- Gemini chat ----------
type Source = { title: string; uri: string };
type Pic = { src: string; full: string; caption?: string };
/** A film "page" inside an answer: hero, story, director, cast, buttons. */
type FilmCard = { id: number; kind: "movie" | "tv"; title: string; original?: string; year?: string; overview: string; genres: string[]; rating?: number;
  runtime?: number; poster?: string | null; backdrop?: string | null; director?: string; tagline?: string; altYear?: string };
type Face = { name: string; role?: string; photo?: string | null; url?: string };
type Lnk = { kind: string; label: string; url: string };
type SourceAsk = { title: string; year?: string; poster?: string | null };
/** Films that share a name: the user picks the one they mean. */
type Choice = { id: number; kind: "movie" | "tv"; title: string; year: string; poster: string | null; rating?: number };
type Msg = { role: "user" | "model"; text: string; sources?: Source[]; note?: string; images?: Pic[]; people?: Face[]; links?: Lnk[]; film?: FilmCard; source?: SourceAsk; choices?: Choice[] };
type Conv = { id: string; title: string; at: number; ctx: string; ctxKind: "general" | "film" | "recs"; msgs: Msg[] };
const loadConvs = () => store.json<Conv[]>("chatHistory", []);
function saveConv(c: Conv) {
  const all = loadConvs().filter((x) => x.id !== c.id);
  store.set("chatHistory", JSON.stringify([c, ...all].slice(0, 60)));
}

/** Models to try in order: the chosen one, then the free-tier ones with the highest daily limits. */
/* ---------- film summaries in Turkish ---------- */
const looksEnglish = (t: string) => !/[ğışİçöüÇÖÜ]/.test(t) && (t.match(/\b(the|and|of|to|is|his|her|with|their|when|after)\b/gi)?.length ?? 0) >= 3;
const looksTurkish = (t: string) => /[ğışİ]/.test(t) || (t.match(/\b(ve|bir|bu|ile|için|olan|onun|ama|daha)\b/gi)?.length ?? 0) >= 3;
const trKey = (t: string) => { let h = 0; for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return (lang() === "en" ? "enOv:" : "trOv:") + (h >>> 0).toString(36) + t.length; };
const trWaiting = new Map<string, Promise<string | null>>();
/** Turkish version of a summary (Gemini, cached for good); null when there's no key or it fails. */
function translateTr(text: string): Promise<string | null> {
  const k = trKey(text);
  const hit = store.get(k);
  if (hit) return Promise.resolve(hit);
  const key = store.get("geminiKey");
  if (!key) return Promise.resolve(null);
  if (!trWaiting.has(k)) trWaiting.set(k, (async () => {
    try {
      const { r } = await geminiWithFallback(key, {
        systemInstruction: { parts: [{ text: lang() === "en" ? "Translate the given film/series summary into natural, fluent English. Write only the translation; keep names and titles as they are, add nothing." : "Verilen film/dizi özetini doğal, akıcı Türkçeye çevir. Sadece çeviriyi yaz; özel adları ve film adlarını değiştirme, ekleme yapma." }] },
        contents: [{ role: "user", parts: [{ text }] }],
      });
      const out = (r?.candidates?.[0]?.content?.parts ?? []).map((x: any) => x.text ?? "").join("").trim();
      if (out) store.set(k, out);
      return out || null;
    } catch { return null; } finally { trWaiting.delete(k); }
  })());
  return trWaiting.get(k)!;
}
/** A summary shown in Turkish: foreign ones are translated, with a button to see the original. */
export function TrText({ text, className }: { text: string; className?: string }) {
  const foreign = !!text && !(lang() === "en" ? looksEnglish(text) : looksTurkish(text));
  const [tr, setTr] = useState<string | null>(() => (foreign ? store.get(trKey(text)) : null));
  const [orig, setOrig] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setOrig(false);
    if (!foreign) { setTr(null); return; }
    const c = store.get(trKey(text));
    if (c) { setTr(c); return; }
    let alive = true;
    setBusy(true);
    translateTr(text).then((x) => { if (alive) { setTr(x); setBusy(false); } });
    return () => { alive = false; };
  }, [text]);
  return (
    <>
      <p className={className}>{tr && !orig ? tr : text}</p>
      {foreign && (busy ? <span className="tr-note">{tt("Türkçeye çevriliyor…")}</span> : tr ? (
        <button className="tr-toggle" onClick={() => setOrig((v) => !v)}>{orig ? tt("Türkçesini göster") : tt("Orijinalini göster")} <span>{tt("· otomatik çeviri")}</span></button>
      ) : null)}
    </>
  );
}

function modelChain(): string[] {
  const chosen = store.get("geminiModel") || "gemini-3.1-flash-lite";
  const known = store.json<string[]>("geminiModelIds", []);
  const pick = (re: RegExp) => known.filter((id) => re.test(id)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  const auto = known.length
    ? [...pick(/^gemini-[\d.]+-flash-lite$/), ...pick(/^gemini-[\d.]+-flash$/)]
    : ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite", "gemini-2.5-flash-lite", "gemini-flash-latest", "gemini-2.5-flash"];
  // 3.1 Flash Lite first among the fallbacks: it has the largest free daily quota.
  const order = ["gemini-3.1-flash-lite", ...auto];
  return [...new Set([chosen, ...order])].slice(0, 6);
}

/** Calls Gemini; on any error moves on to the next model. A search-grounded request that keeps failing
 *  is finally retried without search, so the user still gets an (unsourced) answer. */
async function geminiWithFallback(key: string, body: any): Promise<{ r: any; model: { id: string; note?: string } }> {
  const chain = modelChain();
  let lastErr: unknown = null;
  const attempts: [any, boolean][] = body.tools ? [[body, true], [{ ...body, tools: undefined, toolConfig: undefined }, false]] : [[body, false]];
  for (const [b, grounded] of attempts) {
    for (const id of chain) {
      try {
        const r = await invoke<any>("gemini", { key, model: id, body: b });
        const notes = [];
        if (id !== chain[0]) notes.push(tt("{0} yanıt vermedi, {1} ile cevaplandı", chain[0], id));
        if (body.tools && !grounded) notes.push(tt("Google araması kullanılamadı; bilgiler kaynaksız, kontrol edilmedi"));
        return { r, model: { id, note: notes.join(" · ") || undefined } };
      } catch (e) {
        lastErr = e;
      }
    }
  }
  const msg = String(lastErr);
  if (/429|quota/i.test(msg)) throw new Error(tt("Tüm modellerin ücretsiz kotası şu an dolu. Birkaç dakika sonra (günlük sınırsa yarın) tekrar dene."));
  throw lastErr;
}

/** Everything the assistant should know about the user's taste, as compact text. */
function profile(items: Item[], recent: Recent[]) {
  const taste = loadTaste();
  const recs = loadRecs();
  const label = (t: string, y?: string) => (y ? `${t} (${y})` : t);
  const watched = recent.filter((r) => pct(r) >= 85 || isFinished(r.path)).map((r) => {
    const it = items.find((i) => i.files.some((f) => f.path === r.path));
    return it ? label(it.meta?.title ?? it.parsed.title, it.meta?.year) : r.title;
  });
  const started = recent.filter((r) => pct(r) > 3 && pct(r) < 85).map((r) => `${r.title} (%${Math.round(pct(r))})`);
  const vals = Object.values(taste);
  const lib = items.map((i) => {
    const m = i.meta;
    return `${label(m?.title ?? i.parsed.title, m?.year)}${i.parsed.kind === "tv" ? " [dizi]" : ""}${m?.genres.length ? " — " + m.genres.slice(0, 3).join(", ") : ""}${m?.rating ? ` ★${m.rating}` : ""}`;
  });
  const sec = (h: string, l: string[]) => `## ${h}\n${l.length ? l.map((x) => "- " + x).join("\n") : "(yok)"}`;
  const diary = Object.values(loadDiary());
  const lbl = (e: DiaryEntry) => label(e.title, e.year) + (e.rating ? ` — ${e.rating}/10` : "") + (e.note ? ` (“${e.note}”)` : "");
  const aff = Object.entries(friendAffinity()).filter(([, a]) => a.rated > 0)
    .map(([who, a]) => `${who}: ${a.liked}/${a.rated} beğendi (%${Math.round((a.liked / a.rated) * 100)} uyum), ${a.total} öneri`);
  return [
    sec("Kullanıcı hakkında notların (bunlara uy)", loadNotes()),
    sec("Zevk defteri: beğendikleri", diary.filter((e) => e.vote === "like" || (e.rating ?? 0) >= 7).map(lbl)),
    sec("Zevk defteri: beğenmedikleri", diary.filter((e) => e.vote === "dislike" || (e.rating && e.rating <= 4)).map(lbl)),
    sec("Zevk defteri: izledikleri (tekrar önerme)", diary.filter((e) => e.watched).map((e) => label(e.title, e.year))),
    sec("Arkadaşlarla zevk uyumu", aff),
    sec("İçerik hassasiyeti: uyarısına rağmen 'benim için güvenli' dediği filmler (bu konular onu rahatsız etmiyor)",
      Object.values(loadSafe()).map((m) => `${label(m.title, m.year)} — ${cwLabels(m.cats).join(", ")}`)),
    sec("Listeleri", loadPlaylists().map((p) => p.items.length > 40 ? `${p.name}: ${p.items.length} film (içeriği için list_playlists kullan)` : `${p.name}: ${p.items.map((x) => x.title).join(", ")}`)),
    sec("Beğendikleri", vals.filter((v) => v.vote === "like").map((v) => label(v.title, v.year))
      .concat(recs.filter((r) => r.vote === "like").map((r) => label(r.title, r.year)))),
    sec("Beğenmedikleri", vals.filter((v) => v.vote === "dislike").map((v) => label(v.title, v.year))
      .concat(recs.filter((r) => r.vote === "dislike").map((r) => label(r.title, r.year)))),
    sec("İzleyeceklerim listesi", vals.filter((v) => v.want).map((v) => label(v.title, v.year)).concat(loadLater())),
    sec("Bitirdikleri (oynatma geçmişi)", [...new Set(watched)]),
    sec("İzlediğini işaretledikleri (bunları ASLA tekrar önerme)", loadSeen()),
    sec("Yarıda kalanlar", started),
    sec("Arkadaşlarının önerileri (henüz bakılmamış)", recs.filter((r) => !r.status)
      .map((r) => `${label(r.title, r.year)} — ${r.from} önerdi${r.note ? `: "${r.note}"` : ""}`)),
    sec("Önerilip ilgilenmediği", recs.filter((r) => r.status === "dismissed").map((r) => `${r.title} (${r.from})`)),
    sec("Kütüphanesindeki (diskte, hemen izlenebilir)", lib),
  ].join("\n\n");
}

/** Laid over the Turkish instructions when the app is in English. */
const SYSTEM_EN = `

# LANGUAGE (overrides every language rule above)
The user's app is in English. Always reply in natural English, never in Turkish, whatever language the notes, tool results or profile below are in.
Write titles as **Original Title (Year)** in bold; do not add a Turkish title next to it.
The quick-reply line at the very end must be in English too, e.g.: >> More like this | Something lighter | Only from my library | Similar series
For off-topic requests say "I can only help with films and series."`;

const SYSTEM = `Sen Luna Player'ın film asistanısın. Kullanıcıyla Türkçe, samimi ve kısa konuş.
Birden fazla film/dizi sayıyorsan ASLA paragraf içinde arka arkaya yazma: her biri ayrı satırda madde olsun, şu biçimde: "- **Ad (Yıl)** — tek cümlelik sebep (kütüphanede var/yok, kim önerdi gibi notlar bu cümlede)". Listeden önce en fazla bir kısa giriş cümlesi yaz.
Film/dizi adlarını her zaman ORİJİNAL adıyla (İngilizce/özgün dildeki adı, Latin harfli; Japonca vb. ise bilinen uluslararası adı) kalın ve yılıyla yaz: **Original Title (Yıl)**. Türkçe adı varsa kalın olmadan yanına parantezle ekle, ör. **The Conjuring (2013)** (Korku Seansı). Türkçe adı asla kalın yazma. Başlık ya da vurgu için kalın yazı kullanma. Kişi adlarını (yönetmen, oyuncu) kalın yazma ve yanlarına yıl koyma; yıl sadece film/dizi adının yanına gelir.
Tek bir film/dizi hakkında bilgi, hikaye ya da kadro sorulursa show_film kullan (sohbette filmin sayfasını açar).
Görsel, fotoğraf, afiş, sahne ya da oyuncu istenirse show_images / show_person; bağlantı ya da 'nerede izlerim' istenirse film_links kullan. Asla URL ya da görsel adresi uydurma.
Kullanıcı çocuk istismarı/pedofili, ensest, nekrofili ve zoofili konularının adını bile okumak istemiyor: bunlardan hiçbir şekilde adıyla, tarifle ya da ima ederek bahsetme; gerekirse sadece "KOD:KZ#4" yaz (ör. "bu filmde KOD:KZ#4 var"). Film özetlerini aktarırken de bu kısımları KOD:KZ#4 ile değiştir.
ÖNCE NİYETİ ANLA, sonra cevap ver:
1) BİLGİ SORUSU (ör. "bu kaçıncı film", "kim oynuyor", "ne zaman çıktı", "kaç sezon", "sonu nasıl" (spoiler uyarısıyla), "bu bana uygun mu"): SADECE soruyu kısa ve net cevapla. Film ÖNERME, öneri listesi yapma, profilden bahsetme.
2) ÖNERİ İSTEĞİ (ör. "ne izlesem", "öner", "buna benzer", "daha fazla"): aşağıdaki öneri kurallarını uygula.
Emin değilsen bilgi sorusu say ve kısa cevapla; öneri sadece istenince yapılır.

Öneri kuralları (sadece öneri isteğinde). Aşağıdaki profil verisini dikkate al:
- Beğendiklerine benzeyenleri öne çıkar, beğenmediklerine benzeyenlerden kaçın. Bitirdiklerini tekrar önerme.
- Kütüphanesinde olan filmleri özellikle belirt ("kütüphanende var, hemen açabilirsin").
- Kütüphanesinde olmayan ama zevkine uyan filmleri de öner; bunları "kütüphanende yok" diye ayrıca belirt.
- Arkadaşlarının önerilerini değerlendir: zevkine uyuyorsa "X önermişti, tam senlik" de; uymuyorsa dürüstçe "pek senin tarzın değil ama X muhtemelen şu sebepten önerdi, şu yüzden sevebilirsin" gibi açıkla.
- Her öneride bir cümleyle neden önerdiğini söyle. Genelde 3-5 öneri yeter. Önerdiğin film adlarını **kalın** yaz ve yılını ekle (kalın yazı SADECE önerilen başlıklar içindir; bilgi cevaplarında başlıkları kalın yazma).
- Spoiler verme.
- Kullanıcı bir bağlantı verirse: önerilere aktarılacaksa import_link (tamamı, sınırsız), arkadaşın hesabı takip edilecekse follow_letterboxd, sadece ne olduğuna bakılacaksa read_link (özet) kullan. Uzun listeleri tek tek add_recommendation ile ekleme.
- Araçların var: add_recommendation (önerilere ekle), mark_watched (izledim), rate_title (beğeni/puan/not), add_watch_later / remove_watch_later (sonra izle), list_recommendations / update_recommendation / remove_recommendations / sort_recommendations (öneri listesini gör, düzenle, sil, sırala), list_playlists / add_to_playlist / remove_from_playlist / delete_playlist (kullanıcının listeleri), read_link (bağlantı oku), follow_letterboxd (arkadaşın Letterboxd'unu bağla), refresh_playlists (bağlı listeleri güncelle), remember_note / forget_note (kullanıcı hakkında kalıcı not), open_from_library (kütüphanedeki filmi aç).
- Bir öneriyi eklerken kimin önerdiğini bilmiyorsan ASLA tahmin etme, "Biri" yazma: önce "Bunu kim önerdi?" diye sor.
- Arkadaşının Letterboxd'unu verirse ve kimin olduğunu söylemediyse sor; sonra follow_letterboxd ile klasör ve listeler oluştur.
- Kullanıcı kalıcı bir tercihini söylerse ("korku sevmem") remember_note ile kendiliğinden not al. Bir film hakkında görüş bildirirse ("çok beğendim", "8 veririm") rate_title ile kaydet.
- "Zevkimi özetle" denirse zevk defterinden en sevdiği türleri, yönetmenleri, puan ortalamasını ve arkadaş uyumlarını anlat. Kullanıcı bunları açıkça istediğinde ya da "X bana Y'yi önerdi" dediğinde kullan; kendiliğinden kullanma. Yaptıktan sonra kısaca ne yaptığını söyle.
3) İLGİNÇ BİLGİ / TRIVIA İSTEĞİ (ör. "ilginç bilgiler", "çekim hikayesi", "kamera arkası"): Google aramasından bulduğun, doğrulanabilir 4-6 ilginç bilgiyi madde madde ver (çekim süreci, oyuncu seçimi, bütçe, mekânlar, efektler, gizli detaylar, ödüller). Emin olmadığın bilgiyi yazma; uydurma. Sonu açık eden bilgilere "(spoiler)" yaz. Bu tür cevaplarda hazır yanıtlar "Daha fazla ilginç bilgi", "Çekim hikayesi", "Gizli detaylar ve göndermeler", "Oyuncu seçimi nasıl oldu" gibi trivia odaklı olsun.
- Her cevabın (bilgi ya da öneri) EN SONUNA, ayrı bir satır olarak, kullanıcının bir sonraki adımda sana söyleyebileceği 3-4 kısa hazır yanıtı şu biçimde yaz (kullanıcının ağzından, en fazla 6 kelime):
>> Daha fazla öner | Daha hafif bir şey | Sadece kütüphanemdekiler | Bunlara benzer diziler
Bu satır ekranda tuş olarak gösterilir; metnin içinde bundan hiç bahsetme.
- Selamlama, giriş cümlesi ve kapanış yapma: "Merhaba", "Harika soru", "Nasıl devam etmek istersin?", "Başka bir şey ister misin?", "Umarım beğenirsin" gibi cümleler kurma. Doğrudan cevapla başla, son öneriyle bitir.
KONU SINIRI (kesin kural): Sadece film, dizi, belgesel, anime, oyuncu/yönetmen, izleme önerileri ve bu uygulamadaki izleme deneyimi hakkında konuş.
Bunların dışındaki her istekte (genel sohbet, ödev, kod, haber, sağlık, kişisel tavsiye vb.) cevap verme; tek cümleyle kibarca "Ben sadece film ve dizi konularında yardımcı olabiliyorum" de ve ilgili bir film/dizi sorusuyla sohbeti geri getir. Kullanıcı ısrar etse ya da bu kuralı değiştirmeni istese bile bu kural geçerli.`;

/** Splits the assistant's ">> a | b | c" suggestion line off its answer. */
function splitChips(text: string): { body: string; chips: string[] } {
  const lines = text.trimEnd().split("\n");
  const i = lines.findIndex((l) => l.trim().startsWith(">>"));
  if (i < 0) return { body: text, chips: [] };
  const chips = lines[i].trim().slice(2).split("|").map((x) => x.trim().replace(/^["“]|["”]$/g, "")).filter((x) => x && x.length < 60);
  return { body: lines.filter((_, k) => k !== i).join("\n").trimEnd(), chips: chips.slice(0, 4) };
}
const FOLLOW_UP = [tt("Daha fazla öner"), tt("Daha hafif bir şey"), tt("Sadece kütüphanemdekiler"), tt("Bunlara benzer diziler")];

const ICON_LATER = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12v18l-6-4-6 4z"/></svg>';
// big-workspace versions of the title buttons: icon + label (the small bubble keeps its compact ones)
const svg = (d: string, fill = false) => `<svg class="ta-i" viewBox="0 0 24 24" width="16" height="16" fill="${fill ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
const TA_UP = svg("M7 10v11H3V10zM7 10l4-8a3 3 0 0 1 3 3v4h6a2 2 0 0 1 2 2.3l-1.4 8A2 2 0 0 1 18.6 21H7");
const TA_DOWN = svg("M17 14V3h4v11zM17 14l-4 8a3 3 0 0 1-3-3v-4H4a2 2 0 0 1-2-2.3l1.4-8A2 2 0 0 1 5.4 3H17");
const TA_LATER = svg("M6 3h12v18l-6-4-6 4z");
const TA_PLAY = svg("M8 5l12 7-12 7z", true);
const TA_SEEN = svg("M20 6 9 17l-5-5");
const ICON_YT = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M8 5l12 7-12 7z"/></svg>';

let knownTitles: { n: number; set: Set<string> } | null = null;
/** Titles Luna knows (library, recommendations, diary, lists): only these get the watched/like/later buttons in answers. */
function isKnownTitle(t: string) {
  const recs = loadRecs();
  if (!knownTitles || knownTitles.n !== recs.length + toolCtx.items.length) {
    const set = new Set<string>();
    for (const r of recs) set.add(seenKey(r.title));
    for (const i of toolCtx.items) { set.add(seenKey(i.meta?.title ?? i.parsed.title)); set.add(seenKey(i.parsed.title)); }
    for (const e of Object.values(loadDiary())) set.add(seenKey(e.title));
    for (const p of loadPlaylists()) for (const x of p.items) set.add(seenKey(x.title));
    knownTitles = { n: recs.length + toolCtx.items.length, set };
  }
  return knownTitles.set.has(seenKey(t.replace(/\s*\(\d{4}\)\s*$/, "")));
}
function md(text: string, seen: string[], later: string[]) {
  // Minimal markdown: **bold**, *italic*, list items, paragraphs.
  // Every bold title gets: a "watched" box, a "watch later" bookmark and a trailer link.
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const seenSet = new Set(seen.map(seenKey));
  const laterSet = new Set(later.map(seenKey));
  return esc
    .replace(/\*\*(.+?)\*\*/g, (_, t: string) => {
      const raw = t.replace(/&quot;/g, '"').replace(/&amp;/g, "&");
      // headings and emphasis stay plain bold; a film title has a year or is one Luna knows
      if (!/\((19|20)\d{2}\)/.test(raw) && !isKnownTitle(raw)) return `<b>${t}</b>`;
      const plain = seenKey(raw);
      const on = seenSet.has(plain);
      const lt = laterSet.has(plain);
      const dv = diaryGet(t.replace(/&quot;/g, '"').replace(/&amp;/g, "&"))?.vote;
      return `<button type="button" class="seen-box${on ? " on" : ""}" data-seen="${t}" aria-pressed="${on}" title="${on ? tt("İzledim işaretini kaldır") : tt("İzledim olarak işaretle")}"></button>`
        + `<b class="film-link${on ? " seen-title" : ""}" data-film="${t}" title="${tt("Filmin sayfasını aç")}">${t}</b>`
        + `<span class="title-acts"><button type="button" class="ta-more${on || dv || lt ? " set" : ""}" tabindex="-1" aria-label="${tt("Seçenekler")}">${on ? "✓" : dv === "like" ? "👍" : dv === "dislike" ? "👎" : lt ? "🔖" : "⋯"}</button><span class="ta-pop">`
        + `<button type="button" class="seen-btn${on ? " on" : ""}" data-seen="${t}" title="${on ? tt("İzledim işaretini kaldır") : tt("İzledim olarak işaretle")}">${TA_SEEN}<span class="ta-l">${tt("İzledim")}</span></button>`
        + `<button type="button" class="vote-btn${dv === "like" ? " on" : ""}" data-vote="like" data-t="${t}" title="${tt("Beğendim")}"><span class="ta-e">👍</span>${TA_UP}<span class="ta-l">${tt("Beğendim")}</span></button>`
        + `<button type="button" class="vote-btn bad${dv === "dislike" ? " on" : ""}" data-vote="dislike" data-t="${t}" title="${tt("Beğenmedim")}"><span class="ta-e">👎</span>${TA_DOWN}<span class="ta-l">${tt("Beğenmedim")}</span></button>`
        + `<button type="button" class="later-btn${lt ? " on" : ""}" data-later="${t}" aria-pressed="${lt}" title="${lt ? tt("İzleyeceklerimden çıkar") : tt("Sonra izle")}"><span class="ta-e">${ICON_LATER}</span>${TA_LATER}<span class="ta-l">${lt ? tt("Listede") : tt("Sonra izle")}</span></button>`
        + `<button type="button" class="yt-btn" data-yt="${t}" title="${tt("YouTube'da Türkçe fragman ara")}"><span class="ta-e">${ICON_YT}</span>${TA_PLAY}<span class="ta-l">${tt("Fragman")}</span></button></span></span>`;
    })
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, t: string, u: string) => `<a class="msg-link" data-url="${u}" title="${u}">${t}</a>`)
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (_, pre: string, u: string) => `${pre}<a class="msg-link" data-url="${u}" title="${u}">${u.replace(/^https?:\/\/(www\.)?/, "").slice(0, 40)}${u.length > 48 ? "…" : ""}</a>`)
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<i>$2</i>")
    .replace(/^\s*[-*] (.*)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
    .replace(/\n{2,}/g, "<br/><br/>")
    .replace(/\n(?!<)/g, "<br/>");
}

const TOOLS = [{
  functionDeclarations: [
    {
      name: "add_recommendation",
      description: "Kullanıcının 'Aldığım öneriler' listesine bir film/dizi ekler. Kullanıcı birinin ona bir film önerdiğini söylediğinde ya da 'önerilere ekle' dediğinde kullan.",
      parameters: { type: "OBJECT", properties: {
        title: { type: "STRING", description: "Film/dizi adı" }, year: { type: "STRING", description: "Yıl (biliniyorsa)" },
        from: { type: "STRING", description: "Öneren kişinin adı. Bilinmiyorsa önce kullanıcıya sor, tahmin etme." }, note: { type: "STRING", description: "Önerenin notu (varsa)" },
      }, required: ["title", "from"] },
    },
    {
      name: "mark_watched",
      description: "Bir filmi/diziyi kullanıcının izlediklerine ekler. Kullanıcı 'bunu izledim' dediğinde kullan.",
      parameters: { type: "OBJECT", properties: { title: { type: "STRING" }, year: { type: "STRING" } }, required: ["title"] },
    },
    {
      name: "add_watch_later",
      description: "Bir filmi/diziyi kullanıcının 'sonra izle' (izleyeceklerim) listesine ekler. 'Sonra izleyeceğim', 'listeme ekle' dendiğinde kullan.",
      parameters: { type: "OBJECT", properties: { title: { type: "STRING" }, year: { type: "STRING" } }, required: ["title"] },
    },
    {
      name: "rate_title",
      description: "Kullanıcının bir film/dizi hakkındaki görüşünü zevk defterine yazar: beğendi/beğenmedi, 1-10 puan, kısa not. 'Bunu beğendim', '8 veriyorum', 'sonu zayıftı' gibi durumlarda kullan.",
      parameters: { type: "OBJECT", properties: {
        title: { type: "STRING" }, year: { type: "STRING" },
        vote: { type: "STRING", enum: ["like", "dislike", "none"], description: "like/dislike; none = işareti kaldır" },
        rating: { type: "NUMBER", description: "1-10 arası puan" }, note: { type: "STRING", description: "Kısa not" },
      }, required: ["title"] },
    },
    {
      name: "remove_recommendations",
      description: "Aldığım öneriler listesinden toplu silme. 'Ali'nin önerilerinden beğenmediklerimi sil', 'izlediklerimi kaldır' gibi. from + which=all o kişinin Listelerim'deki klasörünü (Letterboxd'dan gelen listeleri) de siler.",
      parameters: { type: "OBJECT", properties: {
        from: { type: "STRING", description: "Sadece bu kişinin önerileri (boş = herkes)" },
        which: { type: "STRING", enum: ["all", "disliked", "watched", "dismissed", "titles"], description: "Hangileri silinsin (all = hepsi / o kişinin hepsi)" },
        titles: { type: "ARRAY", items: { type: "STRING" }, description: "which=titles ise silinecek adlar" },
      }, required: ["which"] },
    },
    {
      name: "read_link",
      description: "Bir bağlantıyı açıp okur. Letterboxd'da film adlarını, yıllarını ve kişinin yıldız puanlarını tek tek verir (profil bağlantısı: izledikleri + izleme listesi). Kullanıcı bir bağlantıdan bahsettiğinde ya da içeriğini yeniden görmen gerektiğinde kullan.",
      parameters: { type: "OBJECT", properties: { url: { type: "STRING" } }, required: ["url"] },
    },
    {
      name: "import_link",
      description: "Bir bağlantıdaki filmlerin TAMAMINI 'Aldığım öneriler'e aktarır; işi Luna yapar, liste sana gelmez (sınır yok). Letterboxd'da min_stars ile sadece belirli puanın üstündekiler alınabilir. Kimin önerdiği bilinmiyorsa önce sor.",
      parameters: { type: "OBJECT", properties: {
        url: { type: "STRING" }, from: { type: "STRING", description: "Öneren kişi" },
        min_stars: { type: "NUMBER", description: "Letterboxd: en az bu kadar yıldız verilenler (ör. 4)" },
        section: { type: "STRING", enum: ["all", "watched", "liked", "watchlist", "lists"], description: "Profil bağlantısında hangi kısım: watched=izledikleri, liked=beğendikleri (kalp), watchlist=izlemek istedikleri, lists=kendi listeleri (varsayılan: all)" },
      }, required: ["url", "from"] },
    },
    {
      name: "follow_letterboxd",
      description: "Bir arkadaşın Letterboxd hesabını Luna'ya bağlar: adına bir klasör ve içinde Letterboxd'dan dolan listeler oluşturur (beğendikleri, 4★ ve üstü verdikleri, izleme listesi ve kendi listelerinin her biri). 'Ali'nin Letterboxd'unu ekle/takip et' gibi durumlarda kullan.",
      parameters: { type: "OBJECT", properties: { person: { type: "STRING" }, url: { type: "STRING", description: "Letterboxd profil ya da liste bağlantısı" } }, required: ["person", "url"] },
    },
    {
      name: "refresh_playlists",
      description: "Letterboxd'a bağlı bütün listeleri günceller (yeni filmleri ekler).",
      parameters: { type: "OBJECT", properties: {} },
    },
    {
      name: "list_playlists",
      description: "Kullanıcının listelerini (playlist) ve içlerindeki filmleri getirir.",
      parameters: { type: "OBJECT", properties: {} },
    },
    {
      name: "add_to_playlist",
      description: "Bir listeye film/dizi ekler; liste yoksa oluşturur. 'Bana bir maraton listesi yap', 'şunu Ghibli listeme ekle' gibi durumlarda kullan. Filmleri izlenme sırasıyla ver.",
      parameters: { type: "OBJECT", properties: {
        playlist: { type: "STRING", description: "Liste adı" },
        titles: { type: "ARRAY", items: { type: "STRING" }, description: "Eklenecekler, 'Ad (Yıl)' biçiminde" },
      }, required: ["playlist", "titles"] },
    },
    {
      name: "remove_from_playlist",
      description: "Bir listeden film/dizi çıkarır.",
      parameters: { type: "OBJECT", properties: { playlist: { type: "STRING" }, titles: { type: "ARRAY", items: { type: "STRING" } } }, required: ["playlist", "titles"] },
    },
    {
      name: "delete_playlist",
      description: "Bir listeyi tamamen siler (ya da adını değiştirir: new_name verilirse).",
      parameters: { type: "OBJECT", properties: { playlist: { type: "STRING" }, new_name: { type: "STRING" } }, required: ["playlist"] },
    },
    {
      name: "list_recommendations",
      description: "Aldığım öneriler listesinin tamamını getirir (kim önerdi, not, durum, puan). Listeyle ilgili bir işlem yapmadan önce güncel hâlini görmek için kullan.",
      parameters: { type: "OBJECT", properties: { from: { type: "STRING", description: "Sadece bu kişinin önerileri (boş = hepsi)" } } },
    },
    {
      name: "update_recommendation",
      description: "Aldığım önerilerdeki bir kaydı düzenler: kimin önerdiği, not, durum (open = bakılmadı, watched = izlendi, dismissed = ilgilenmiyorum), beğeni, ad veya yıl düzeltmesi.",
      parameters: { type: "OBJECT", properties: {
        title: { type: "STRING", description: "Düzenlenecek önerinin şu anki adı" }, year: { type: "STRING" },
        new_title: { type: "STRING" }, new_year: { type: "STRING" }, from: { type: "STRING" }, note: { type: "STRING" },
        status: { type: "STRING", enum: ["open", "watched", "dismissed"] }, vote: { type: "STRING", enum: ["like", "dislike", "none"] },
      }, required: ["title"] },
    },
    {
      name: "sort_recommendations",
      description: "Aldığım öneriler listesini sıralar: TMDB puanına, yıla ya da kullanıcının zevkine göre. by=taste ise order alanına kendi sıralamanı (en uygun önce) yaz.",
      parameters: { type: "OBJECT", properties: {
        by: { type: "STRING", enum: ["rating", "year", "taste"] }, from: { type: "STRING", description: "Sadece bu kişinin önerileri (boş = hepsi)" },
        order: { type: "ARRAY", items: { type: "STRING" }, description: "by=taste: başlıklar, en uygundan başlayarak" },
      }, required: ["by"] },
    },
    {
      name: "remember_note",
      description: "Kullanıcının kalıcı bir tercihini not eder ('korku sevmez', 'Ghibli'ye bayılır', '3 saatlik filmlere sabrı yok'). Sohbette böyle kalıcı bir tercih ortaya çıktığında kullan.",
      parameters: { type: "OBJECT", properties: { note: { type: "STRING" } }, required: ["note"] },
    },
    {
      name: "forget_note",
      description: "Kullanıcı hakkındaki bir notu siler (kullanıcı 'artık öyle değil' dediğinde).",
      parameters: { type: "OBJECT", properties: { note: { type: "STRING" } }, required: ["note"] },
    },
    {
      name: "open_from_library",
      description: "Bir filmi/diziyi oynatır. Kullanıcı 'X'i aç/oynat/başlat/izle' dediğinde HER ZAMAN kullan (yıl biliniyorsa ver). Kütüphanede tam o film yoksa Luna sohbette magnet/torrent kutusu açar; benzer adlı başka filmi açmaz.",
      parameters: { type: "OBJECT", properties: { title: { type: "STRING" }, year: { type: "STRING" } }, required: ["title"] },
    },
    {
      name: "show_images",
      description: "Bir filmin/dizinin görsellerini sohbette gösterir: sahne kareleri, afişler ya da oyuncu kadrosu (fotoğraflarıyla). 'Görsellerini göster', 'afişleri', 'sahnelerden', 'oyuncuları kim' gibi isteklerde kullan. Görsel URL'si uydurma, bunu kullan.",
      parameters: { type: "OBJECT", properties: {
        title: { type: "STRING" }, year: { type: "STRING" }, kind: { type: "STRING", enum: ["movie", "tv"] },
        what: { type: "STRING", enum: ["scenes", "posters", "cast"], description: "scenes = sahne kareleri (varsayılan), posters = afişler, cast = yönetmen ve oyuncular" },
      }, required: ["title"] },
    },
    {
      name: "show_film",
      description: "Tek bir film/dizi hakkında konuşurken sohbette onun sayfasını açar: afiş, arka plan, hikaye, yönetmen, fotoğraflı oyuncular, sahneler, puan, fragman ve bağlantılar. 'X'i anlat', 'X nasıl bir film', 'konusu ne', 'X hakkında bilgi', 'kim oynuyor' gibi tek filme odaklı sorularda kullan.",
      parameters: { type: "OBJECT", properties: { title: { type: "STRING" }, year: { type: "STRING" }, kind: { type: "STRING", enum: ["movie", "tv"] },
        exact: { type: "BOOLEAN", description: "Kullanıcı yılı belirterek tam olarak hangisi olduğunu söylediyse true" } }, required: ["title"] },
    },
    {
      name: "show_person",
      description: "Bir oyuncunun/yönetmenin fotoğraflarını ve bilinen işlerini sohbette gösterir.",
      parameters: { type: "OBJECT", properties: { name: { type: "STRING" } }, required: ["name"] },
    },
    {
      name: "film_links",
      description: "Bir film/dizi için gerçek bağlantılar: IMDb, Letterboxd, TMDB, Vikipedi, Türkçe fragman, Türkiye'de nerede izlenir. Bağlantı istendiğinde ya da 'nerede izlerim' sorulduğunda kullan; adres uydurma.",
      parameters: { type: "OBJECT", properties: { title: { type: "STRING" }, year: { type: "STRING" }, kind: { type: "STRING", enum: ["movie", "tv"] } }, required: ["title"] },
    },
    {
      name: "remove_watch_later",
      description: "Bir filmi/diziyi 'sonra izle' listesinden çıkarır.",
      parameters: { type: "OBJECT", properties: { title: { type: "STRING" }, year: { type: "STRING" } }, required: ["title"] },
    },
  ],
}];

/** What the tools can reach in the app (set by the chat panel). */
const toolCtx: { items: Item[]; play?: (path: string) => void; media: { images: Pic[]; people: Face[]; links: Lnk[]; film?: FilmCard; source?: SourceAsk; choices?: Choice[] }; pickFilm?: (c: Choice) => void; openSource?: (src: string) => void } = { items: [], media: { images: [], people: [], links: [] } };
/** "This film isn't in your library": a box for a magnet link or a .torrent file, right in the answer. */
function SourceBox({ s: src }: { s: SourceAsk }) {
  const [v, setV] = useState("");
  const [sent, setSent] = useState(false);
  const ok = /^magnet:\?/i.test(v.trim()) || /\.torrent$/i.test(v.trim()) || /^https?:\/\/\S+\.torrent/i.test(v.trim());
  const go = (x: string) => { if (!toolCtx.openSource) return; toolCtx.openSource(x); setSent(true); };
  const pick = async () => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const f = await open({ multiple: false, filters: [{ name: "Torrent", extensions: ["torrent"] }] });
    if (typeof f === "string") go(f);
  };
  return (
    <div className="srcbox">
      {src.poster ? <img src={`${IMG}w185${src.poster}`} alt="" /> : <div className="srcbox-ph"><Icon d={I.film} size={22} /></div>}
      <div className="srcbox-main">
        <div className="srcbox-t"><b>{src.title}{src.year ? ` (${src.year})` : ""}</b>  {tt("kütüphanende yok")}</div>
        {sent ? <div className="srcbox-ok">{tt("✓ Torrent açılıyor…")}</div> : (
          <>
            <div className="srcbox-row">
              <input value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ok && go(v.trim())} placeholder={tt("magnet:?xt=… bağlantısını buraya yapıştır")} spellCheck={false} />
              <button className="fp-btn primary" disabled={!ok} onClick={() => go(v.trim())}><Icon d={I.play} fill size={14} />  {tt("İzle")}</button>
            </div>
            <div className="srcbox-row">
              <button className="fp-btn" onClick={pick}>{tt(".torrent dosyası seç")}</button>
              <button className="fp-btn" onClick={() => openUrl(youtubeTrailer(src.year ? `${src.title} (${src.year})` : src.title))}><Icon d={I.play} fill size={12} />  {tt("Fragman")}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function FilmPage({ f, onPlay }: { f: FilmCard; onPlay?: (path: string) => void }) {
  useTaste();
  const lib = toolCtx.items.find((i) => i.meta?.id === f.id || seenKey(i.meta?.title ?? i.parsed.title) === seenKey(f.title));
  const label = f.year ? `${f.title} (${f.year})` : f.title;
  const later = has(loadLater(), label) || has(loadLater(), f.title);
  const d = diaryGet(f.title, f.year);
  const vote = (v: Vote) => diarySet(f.title, f.year, { vote: d?.vote === v ? undefined : v });
  return (
    <div className="fp">
      <div className="fp-hero" style={f.backdrop ? { backgroundImage: `url(${IMG}w1280${f.backdrop})` } : undefined}>
        <div className="fp-shade" />
        <div className="fp-head">
          {f.poster && <img className="fp-poster" src={`${IMG}w342${f.poster}`} alt="" />}
          <div className="fp-titles">
            <h3>{f.title}{f.year && <span> ({f.year})</span>}</h3>
            {f.original && f.original !== f.title && <div className="fp-orig">{f.original}</div>}
            {f.altYear && <div className="fp-orig">{tt("Aynı film · Letterboxd'da")} {f.altYear}  {tt("olarak geçiyor (ilk gösterim / vizyon yılı farkı)")}</div>}
            <div className="fp-meta">
              {f.rating ? <span className="rating">★ {String(f.rating).replace(".", ",")}</span> : null}
              {f.runtime ? <span>{Math.floor(f.runtime / 60) ? `${Math.floor(f.runtime / 60)} sa ` : ""}{f.runtime % 60}  {tt("dk")}</span> : null}
              {f.genres.length ? <span>{f.genres.slice(0, 3).join(", ")}</span> : null}
              {f.kind === "tv" && <span>{tt("Dizi")}</span>}
            </div>
            {f.director && <div className="fp-dir"><span>{f.kind === "tv" ? tt("Yaratıcı") : tt("Yönetmen")}</span> {f.director}</div>}
          </div>
        </div>
      </div>
      <div className="fp-body">
        {f.tagline && <div className="fp-tag">“{f.tagline}”</div>}
        {f.overview && <TrText className="fp-ov" text={f.overview} />}
        <div className="fp-acts">
          {lib && onPlay && <button className="fp-btn primary" onClick={() => onPlay(lib.files[0].path)}><Icon d={I.play} fill size={15} />  {tt("Oynat")}</button>}
          <button className="fp-btn" onClick={() => openUrl(youtubeTrailer(label))}><Icon d={I.play} fill size={13} />  {tt("Fragman")}</button>
          <button className={"fp-btn" + (later ? " on blue" : "")} onClick={() => markLater(label, !later)}>{later ? "✓ Listede" : tt("+ Sonra izle")}</button>
          <button className={"fp-btn" + (d?.vote === "like" ? " on" : "")} onClick={() => vote("like")}><Icon d={THUMB} size={15} />  {tt("Beğendim")}</button>
          <button className={"fp-btn" + (d?.vote === "dislike" ? " on red" : "")} onClick={() => vote("dislike")}><Icon d={THUMB_DOWN} size={15} />  {tt("Beğenmedim")}</button>
          {lib && <span className="fp-lib">{tt("● Kütüphanende var")}</span>}
        </div>
      </div>
    </div>
  );
}

/** Lower-case Turkish text without its special letters, for matching what people type on any keyboard. */
const trAscii = (t: string) => t.toLocaleLowerCase("tr").replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c");

/** IMDb / Letterboxd / TMDB / Wikipedia / trailer / JustWatch cards for a title (once per answer). */
async function addLinks(h: SearchHit) {
  if (toolCtx.media.links.some((l) => l.kind === "tmdb" && l.url.includes(`/${h.kind}/${h.id}`))) return;
    const ex = await tmdbGet(`/${h.kind}/${h.id}/external_ids`).catch(() => ({}));
    const q = encodeURIComponent(h.title);
    const links: Lnk[] = [
      ...(ex.imdb_id ? [{ kind: "imdb", label: "IMDb", url: `https://www.imdb.com/title/${ex.imdb_id}/` }] : []),
      ...(h.kind === "movie" ? [{ kind: "lb", label: "Letterboxd", url: `https://letterboxd.com/tmdb/${h.id}/` }] : []),
      { kind: "tmdb", label: "TMDB", url: `https://www.themoviedb.org/${h.kind}/${h.id}?language=${lang()}` },
      { kind: "wiki", label: tt("Vikipedi"), url: `https://tr.wikipedia.org/w/index.php?search=${encodeURIComponent(`${h.title} ${h.year} ${h.kind === "tv" ? "dizi" : "film"}`)}` },
      { kind: "yt", label: tt("Türkçe fragman"), url: youtubeTrailer(`${h.title} (${h.year})`) },
      { kind: "jw", label: tt("Nerede izlenir (TR)"), url: `https://www.justwatch.com/tr/arama?q=${q}` },
    ];
  toolCtx.media.links.push(...links);
}
/** Other films with exactly this name, when the name alone doesn't say which one (no year given, or the year matches none / several). */
async function sameName(a: any): Promise<Choice[]> {
  const t = String(a?.title ?? "").replace(/\s*\((\d{4})\)\s*$/, "");
  const y = a?.year ? String(a.year) : String(a?.title ?? "").match(/\((\d{4})\)\s*$/)?.[1];
  const k = norm(t).replace(/^(the|a|an) /, "");
  const [m, tv] = await Promise.all([searchTmdb(t, "movie").catch(() => []), searchTmdb(t, "tv").catch(() => [])]);
  const all = [...m, ...tv].filter((x) => norm(x.title).replace(/^(the|a|an) /, "") === k && x.year);
  if (all.length < 2) return [];
  // a year that names exactly one of them is enough to know
  if (y && all.filter((x) => x.year === y).length === 1) return [];
  return all.slice(0, 8).map((x) => ({ id: x.id, kind: x.kind, title: x.title, year: x.year, poster: x.poster, rating: x.rating }));
}
/** TMDB hit for a title the assistant names. */
async function findTitle(a: any): Promise<SearchHit | undefined> {
  const t = String(a?.title ?? "").replace(/\s*\((\d{4})\)\s*$/, "");
  const y = a?.year ? Number(a.year) : Number(String(a?.title ?? "").match(/\((\d{4})\)\s*$/)?.[1]) || undefined;
  // A title Luna already knows (recommendations, lists, library) is that exact film: Letterboxd and TMDB years can differ (festival vs. release)
  const k = seenKey(t);
  const yearOk = (yy?: string) => !y || !yy || Math.abs(Number(yy) - y) <= 0;
  const known = loadRecs().find((r) => r.tmdbId && seenKey(r.title) === k && yearOk(r.year))
    ?? loadPlaylists().flatMap((p) => p.items).find((x) => x.tmdbId && seenKey(x.title) === k && yearOk(x.year));
  if (known?.tmdbId) return { id: known.tmdbId, kind: known.kind ?? "movie", title: known.title, year: known.year ?? "", poster: known.poster ?? null, rating: known.rating };
  const lib = toolCtx.items.find((i) => i.meta?.id && seenKey(i.meta.title) === k && yearOk(i.meta.year));
  if (lib?.meta) return { id: lib.meta.id, kind: lib.meta.kind, title: lib.meta.title, year: lib.meta.year, poster: lib.meta.poster };
  if (a?.knownOnly) return undefined;
  const kinds: ("movie" | "tv")[] = a?.kind === "tv" ? ["tv", "movie"] : ["movie", "tv"];
  for (const kd of kinds) {
    const l = await searchTmdb(t, kd, y).catch(() => []);
    const h = l.find((x) => x.poster) ?? l[0];
    if (h) return h;
  }
  if (y) {
    // no hit in that exact year: the closest year (±2) among all hits with this name
    const l = await searchTmdb(t, kinds[0]).catch(() => []);
    const near = l.filter((x) => x.year && Math.abs(Number(x.year) - y) <= 2).sort((p, q) => Math.abs(Number(p.year) - y) - Math.abs(Number(q.year) - y))[0];
    if (near) return near;
  }
  return undefined;
}
const norm = (t: string) => t.toLocaleLowerCase("tr").replace(/[^a-z0-9çğıöşü]+/g, " ").trim();

/** Runs one tool call from the assistant; returns what happened (for the model and for the user). */
async function runTool(name: string, a: any): Promise<string> {
  if (name === "rate_title") {
    const t = String(a?.title ?? "").trim();
    if (!t) return "Başlık yok";
    const patch: Partial<DiaryEntry> = { watched: diaryGet(t, a?.year)?.watched ?? Date.now() };
    if (a?.vote) patch.vote = a.vote === "none" ? undefined : a.vote;
    if (a?.rating) patch.rating = Math.max(1, Math.min(10, Math.round(Number(a.rating))));
    if (a?.note) patch.note = String(a.note);
    diarySet(t, a?.year, patch);
    return `Zevk defterine yazıldı: ${t}${patch.vote ? " · " + (patch.vote === "like" ? "beğendin" : "beğenmedin") : ""}${patch.rating ? " · " + patch.rating + "/10" : ""}`;
  }
  if (name === "remove_recommendations") {
    const who = String(a?.from ?? "").trim().toLocaleLowerCase("tr");
    const titles = new Set((a?.titles ?? []).map((x: string) => seenKey(x)));
    const before = loadRecs();
    const keep = before.filter((r) => {
      if (who && r.from.toLocaleLowerCase("tr") !== who) return true;
      const d = diaryGet(r.title, r.year);
      switch (a?.which) {
        case "all": return false;
        case "disliked": return !(r.vote === "dislike" || d?.vote === "dislike" || (d?.rating && d.rating <= 4));
        case "watched": return !(r.status === "watched" || d?.watched);
        case "dismissed": return r.status !== "dismissed";
        case "titles": return !titles.has(seenKey(r.title));
        default: return true;
      }
    });
    saveRecs(keep);
    let extra = "";
    if (who && a?.which === "all") {
      const pls = loadPlaylists();
      const folder = pls.find((p) => !p.parent && p.name.toLocaleLowerCase("tr") === who);
      if (folder) {
        const gone = pls.filter((p) => p.id === folder.id || p.parent === folder.id);
        savePlaylists(pls.filter((p) => !gone.includes(p)));
        extra = ` · Listelerim'deki “${folder.name}” klasörü de silindi (${gone.length - 1} liste, ${gone.reduce((n, p) => n + p.items.length, 0)} film)`;
      }
    } else if (who) {
      const folder = loadPlaylists().find((p) => !p.parent && p.name.toLocaleLowerCase("tr") === who);
      if (folder) extra = ` · Not: Listelerim'de bu kişinin “${folder.name}” klasörü de var; silmek için which=all kullan.`;
    }
    return `${before.length - keep.length} öneri silindi${extra}`;
  }
  if (name === "read_link") {
    try { return await readLink(String(a?.url ?? "")); } catch (e) { return "Bağlantı okunamadı: " + String(e); }
  }
  if (name === "import_link") {
    const who = String(a?.from ?? "").trim();
    if (!who) return "EKLENMEDİ: kimin önerdiği bilinmiyor. Kullanıcıya sor.";
    const url = String(a?.url ?? "");
    try {
      let films: TaggedFilm[];
      if (isLetterboxd(url)) {
        const secs = await readLetterboxd(url, 80);
        const want = String(a?.section ?? "all");
        const pick = secs.filter((sc) => want === "all" || (want === "lists" ? sc.kind === "list" : sc.kind === want));
        films = lbFlatten(pick).filter((f) => !a?.min_stars || (f.stars ?? 0) >= Number(a.min_stars));
      } else {
        films = await extractTitles(await invoke<string>("fetch_page_text", { url }));
      }
      const n = addRecommendationsBulk(films, who);
      return `${films.length} film bulundu, ${n} tanesi ${who} önerisi olarak eklendi${films.length - n ? ` (${films.length - n} tanesi zaten vardı)` : ""}`;
    } catch (e) { return "Bağlantı okunamadı: " + String(e); }
  }
  if (name === "follow_letterboxd") {
    const who = String(a?.person ?? "").trim();
    if (!who) return "Kişi adı yok: kullanıcıya bunun kimin hesabı olduğunu sor.";
    try { return await followLetterboxd(who, String(a?.url ?? "")); } catch (e) { return "Letterboxd okunamadı: " + String(e); }
  }
  if (name === "refresh_playlists") return await refreshLinkedPlaylists();
  if (name === "list_playlists") {
    const l = loadPlaylists();
    const nameOf = (p: Playlist) => (p.parent ? `${l.find((x) => x.id === p.parent)?.name ?? "?"} › ` : "") + p.name;
    return l.length ? l.map((p) => `${nameOf(p)}${p.source ? " [Letterboxd'a bağlı]" : ""}: ${p.items.slice(0, 200).map((x) => x.title + (x.year ? ` (${x.year})` : "") + (x.stars ? ` ★${x.stars}` : "")).join(", ") || "(boş)"}`).join("\n") : "Hiç liste yok";
  }
  if (name === "add_to_playlist") {
    const pl = String(a?.playlist ?? "").trim();
    if (!pl) return "Liste adı yok";
    const n = await addToPlaylist(pl, (a?.titles ?? []).map((t: string) => ({ title: t })));
    return `“${pl}” listesine ${n} film eklendi`;
  }
  if (name === "remove_from_playlist") {
    const all = loadPlaylists();
    const pl = all.find((p) => seenKey(p.name) === seenKey(String(a?.playlist ?? "")));
    if (!pl) return "Liste bulunamadı";
    const rm = (a?.titles ?? []).map((t: string) => seenKey(t.replace(/\s*\(\d{4}\)\s*$/, "")));
    const before = pl.items.length;
    pl.items = pl.items.filter((x) => !rm.includes(seenKey(x.title)));
    savePlaylists(all);
    return `“${pl.name}” listesinden ${before - pl.items.length} film çıkarıldı`;
  }
  if (name === "delete_playlist") {
    const all = loadPlaylists();
    const pl = all.find((p) => seenKey(p.name) === seenKey(String(a?.playlist ?? "")));
    if (!pl) return "Liste bulunamadı";
    if (a?.new_name) { pl.name = String(a.new_name); savePlaylists(all); return `Liste adı değişti: ${pl.name}`; }
    savePlaylists(all.filter((p) => p !== pl));
    return `“${pl.name}” listesi silindi`;
  }
  if (name === "list_recommendations") {
    const who = String(a?.from ?? "").trim().toLocaleLowerCase("tr");
    const l = loadRecs().filter((r) => !who || r.from.toLocaleLowerCase("tr") === who);
    if (!l.length) return "Liste boş";
    return l.map((r) => `${r.title}${r.year ? ` (${r.year})` : ""} — ${r.from}${r.note ? ` · not: “${r.note}”` : ""} · ${r.status === "watched" ? "izlendi" : r.status === "dismissed" ? "ilgilenmiyor" : "bakılmadı"}${r.vote ? ` · kullanıcı ${r.vote === "like" ? "beğendi" : "beğenmedi"}` : ""}${r.tags?.length ? ` · ${r.from}'in Letterboxd'unda: ${r.tags.join(", ")}` : ""}${r.stars ? ` · ${r.from} ★${r.stars}` : ""}${r.rating ? ` · TMDB ${r.rating}` : ""}`).join("\n");
  }
  if (name === "update_recommendation") {
    const t = seenKey(String(a?.title ?? "").replace(/\s*\(\d{4}\)\s*$/, ""));
    const all = loadRecs();
    const r = all.find((x) => seenKey(x.title) === t && (!a?.year || !x.year || x.year === String(a.year)))
      ?? all.find((x) => seenKey(x.title).includes(t) || t.includes(seenKey(x.title)));
    if (!r) return `Önerilerde bulunamadı: ${a?.title}`;
    const changes: string[] = [];
    if (a?.new_title) { r.title = String(a.new_title); changes.push("ad"); }
    if (a?.new_year) { r.year = String(a.new_year); changes.push("yıl"); }
    if (a?.from) { r.from = String(a.from); changes.push("öneren"); }
    if (a?.note != null) { r.note = String(a.note); changes.push("not"); }
    if (a?.status) { r.status = a.status === "open" ? undefined : a.status; changes.push("durum"); }
    if (a?.vote) { r.vote = a.vote === "none" ? undefined : a.vote; changes.push("beğeni"); }
    if ((a?.new_title || a?.new_year) && store.get("tmdbKey")) {
      const h = (await searchTmdb(r.title, r.kind, r.year ? Number(r.year) : undefined).catch(() => []))[0];
      if (h) { r.tmdbId = h.id; r.poster = h.poster; r.rating = h.rating; r.year = r.year || h.year; }
    }
    saveRecs(all);
    if (a?.vote || a?.status === "watched") diarySet(r.title, r.year, { ...(a?.vote ? { vote: a.vote === "none" ? undefined : a.vote } : {}), ...(a?.status === "watched" ? { watched: Date.now() } : {}) });
    return `Güncellendi: ${r.title}${changes.length ? " (" + changes.join(", ") + ")" : ""}`;
  }
  if (name === "sort_recommendations") {
    const who = String(a?.from ?? "").trim().toLocaleLowerCase("tr");
    const all = loadRecs();
    const mine = all.filter((r) => !who || r.from.toLocaleLowerCase("tr") === who);
    const rest = all.filter((r) => !mine.includes(r));
    if (a?.by === "rating") {
      for (const r of mine) if (r.rating == null && store.get("tmdbKey")) {
        const h = (await searchTmdb(r.title, r.kind, r.year ? Number(r.year) : undefined).catch(() => []))[0];
        if (h) r.rating = h.rating;
      }
      mine.sort((x, y) => (y.rating ?? 0) - (x.rating ?? 0));
    } else if (a?.by === "year") {
      mine.sort((x, y) => Number(y.year ?? 0) - Number(x.year ?? 0));
    } else {
      const order: string[] = (a?.order ?? []).map((x: string) => seenKey(x.replace(/\s*\(\d{4}\)\s*$/, "")));
      const pos = (r: Rec) => { const i = order.indexOf(seenKey(r.title)); return i < 0 ? 999 : i; };
      mine.sort((x, y) => pos(x) - pos(y));
    }
    saveRecs([...mine, ...rest]);
    return `Öneriler sıralandı (${a?.by === "rating" ? "TMDB puanı" : a?.by === "year" ? "yıl" : "zevkine göre"})`;
  }
  if (name === "remember_note") {
    const n = String(a?.note ?? "").trim();
    if (!n) return "Not boş";
    const cur = loadNotes();
    if (!cur.some((x) => seenKey(x) === seenKey(n))) saveNotes([...cur, n]);
    return `Not alındı: ${n}`;
  }
  if (name === "forget_note") {
    const n = seenKey(String(a?.note ?? ""));
    const cur = loadNotes();
    const keep = cur.filter((x) => !seenKey(x).includes(n) && !n.includes(seenKey(x)));
    saveNotes(keep);
    return `${cur.length - keep.length} not silindi`;
  }
  if (name === "show_film") {
    let h: SearchHit | undefined = a?.tmdb_id ? { id: Number(a.tmdb_id), kind: a?.kind === "tv" ? "tv" : "movie", title: String(a?.title ?? ""), year: String(a?.year ?? ""), poster: null } : undefined;
    // a film Luna already has (recommendation, list, library) is exactly that one
    if (!h) h = await findTitle({ ...a, knownOnly: true });
    if (!h && !a?.exact) {
      const same = await sameName(a);
      if (same.length > 1) {
        toolCtx.media.choices = same;
        return `“${a?.title}” adında ${same.length} farklı yapım var (${same.map((c) => `${c.title} ${c.year}`).join(", ")}). Sohbette seçim kartları gösterildi; kullanıcıya hangisini kastettiğini sor, sayfa açma.`;
      }
    }
    h = h ?? await findTitle(a);
    if (!h) return `TMDB'de bulunamadı: ${a?.title}`;
    const [d, cr, im] = await Promise.all([
      tmdbGet(`/${h.kind}/${h.id}`, { language: locale() }),
      tmdbGet(`/${h.kind}/${h.id}/credits`, { language: "en-US" }).catch(() => ({})),
      tmdbGet(`/${h.kind}/${h.id}/images`, { include_image_language: "null,en" }).catch(() => ({})),
    ]);
    let overview: string = d.overview ?? "";
    if (!overview) overview = (await tmdbGet(`/${h.kind}/${h.id}`, { language: "en-US" }).catch(() => ({}))).overview ?? "";
    const dirs = ((cr as any).crew ?? []).filter((c: any) => c.job === "Director");
    const director = dirs.map((c: any) => c.name).join(", ") || (d.created_by ?? []).map((c: any) => c.name).join(", ");
    toolCtx.media.film = {
      id: h.id, kind: h.kind, title: d.title ?? d.name ?? h.title, original: d.original_title ?? d.original_name, year: (d.release_date ?? d.first_air_date ?? "").slice(0, 4),
      overview, genres: (d.genres ?? []).map((g: any) => g.name), rating: d.vote_average ? Math.round(d.vote_average * 10) / 10 : undefined,
      runtime: d.runtime ?? d.episode_run_time?.[0], poster: d.poster_path, backdrop: d.backdrop_path, director, tagline: d.tagline || undefined,
    };
    // the year the user / Letterboxd knows it by, when TMDB dates it differently (festival vs. release)
    const asked = String(a?.year ?? String(a?.title ?? "").match(/\((\d{4})\)\s*$/)?.[1] ?? h.year ?? "");
    if (asked && toolCtx.media.film.year && asked !== toolCtx.media.film.year) toolCtx.media.film.altYear = asked;
    toolCtx.media.people.push(...[...dirs.slice(0, 2).map((c: any) => ({ name: c.name, role: tt("Yönetmen"), photo: c.profile_path, url: `https://www.themoviedb.org/person/${c.id}?language=${lang()}` })),
      ...((cr as any).cast ?? []).slice(0, 12).map((c: any) => ({ name: c.name, role: c.character, photo: c.profile_path, url: `https://www.themoviedb.org/person/${c.id}?language=${lang()}` }))]);
    toolCtx.media.images.push(...(((im as any).backdrops ?? []) as any[]).sort((x, y) => (y.vote_average ?? 0) - (x.vote_average ?? 0)).slice(1, 6)
      .map((x) => ({ src: `${IMG}w780${x.file_path}`, full: `${IMG}original${x.file_path}`, caption: `${h.title}${h.year ? ` (${h.year})` : ""}` })));
    await addLinks(h).catch(() => {});
    return `${toolCtx.media.film.title} (${toolCtx.media.film.year}) sayfası sohbette açıldı: afiş, hikaye, yönetmen (${director}), oyuncular, sahneler, bağlantılar. Bunları tekrar listeleme; 2-4 cümleyle kendi yorumunu ve kullanıcının zevkine uyup uymadığını yaz.`;
  }
  if (name === "show_images") {
    const h = await findTitle(a);
    if (!h) return `TMDB'de bulunamadı: ${a?.title}`;
    const what = String(a?.what ?? "scenes");
    await addLinks(h).catch(() => {});
    if (what === "cast") {
      const cr = await tmdbGet(`/${h.kind}/${h.id}/credits`, { language: "en-US" });
      const dirs = (cr.crew ?? []).filter((c: any) => c.job === "Director").slice(0, 2);
      const faces: Face[] = [...dirs.map((c: any) => ({ name: c.name, role: tt("Yönetmen"), photo: c.profile_path, url: `https://www.themoviedb.org/person/${c.id}?language=${lang()}` })),
        ...(cr.cast ?? []).slice(0, 10).map((c: any) => ({ name: c.name, role: c.character, photo: c.profile_path, url: `https://www.themoviedb.org/person/${c.id}?language=${lang()}` }))];
      toolCtx.media.people.push(...faces);
      const sc = await tmdbGet(`/${h.kind}/${h.id}/images`, { include_image_language: "null,en" }).catch(() => ({}));
      toolCtx.media.images.push(...((sc as any).backdrops ?? []).sort((x: any, y: any) => (y.vote_average ?? 0) - (x.vote_average ?? 0)).slice(0, 5)
        .map((x: any) => ({ src: `${IMG}w780${x.file_path}`, full: `${IMG}original${x.file_path}`, caption: `${h.title}${h.year ? ` (${h.year})` : ""}` })));
      return `${h.title} kadrosu gösterildi: ${faces.map((f) => `${f.name}${f.role ? ` (${f.role})` : ""}`).join(", ")}`;
    }
    const im = await tmdbGet(`/${h.kind}/${h.id}/images`, { include_image_language: lang() === "en" ? "en,null" : "tr,en,null" });
    const list: any[] = what === "posters" ? im.posters ?? [] : im.backdrops ?? [];
    const pics = list.sort((x, y) => (y.vote_average ?? 0) - (x.vote_average ?? 0)).slice(0, what === "posters" ? 8 : 9)
      .map((x) => ({ src: `${IMG}${what === "posters" ? "w342" : "w780"}${x.file_path}`, full: `${IMG}original${x.file_path}`, caption: `${h.title}${h.year ? ` (${h.year})` : ""}` }));
    toolCtx.media.images.push(...pics);
    return pics.length ? `${pics.length} görsel gösterildi (${h.title} ${h.year}). Görselleri tekrar listeleme, kısaca bahset.` : "Görsel bulunamadı";
  }
  if (name === "show_person") {
    const r = await tmdbGet("/search/person", { query: String(a?.name ?? ""), language: "en-US" });
    const p = r.results?.[0];
    if (!p) return `Bulunamadı: ${a?.name}`;
    const im = await tmdbGet(`/person/${p.id}/images`);
    const pics = (im.profiles ?? []).slice(0, 6).map((x: any) => ({ src: `${IMG}w342${x.file_path}`, full: `${IMG}original${x.file_path}`, caption: p.name }));
    toolCtx.media.images.push(...pics);
    toolCtx.media.links.push({ kind: "tmdb", label: `${p.name} · TMDB`, url: `https://www.themoviedb.org/person/${p.id}?language=${lang()}` });
    const known = (p.known_for ?? []).map((k: any) => k.title ?? k.name).filter(Boolean).join(", ");
    return `${p.name} için ${pics.length} fotoğraf gösterildi. Bilinen işleri: ${known}`;
  }
  if (name === "film_links") {
    const h = await findTitle(a);
    if (!h) return `TMDB'de bulunamadı: ${a?.title}`;
    await addLinks(h);
    return `${h.title} (${h.year}) bağlantıları sohbette kart olarak gösterildi (IMDb, Letterboxd, TMDB, Vikipedi, fragman, JustWatch). Adresleri metne yazma.`;
  }
  if (name === "open_from_library") {
    // Only the exact film: first by TMDB id, then by the exact name (and year). "Matrix" never opens "Matrix Reloaded".
    const bare = (x: string) => norm(x).replace(/^(the|a|an) /, "");
    const q = bare(String(a?.title ?? "").replace(/\s*\(\d{4}\)\s*$/, ""));
    const year = a?.year ? String(a.year) : String(a?.title ?? "").match(/\((\d{4})\)\s*$/)?.[1];
    const h = await findTitle(a).catch(() => undefined);
    const yearOk = (it: Item) => !year || !it.meta?.year || it.meta.year === year || (it.parsed.year && String(it.parsed.year) === year);
    const best = (h && toolCtx.items.find((it) => it.meta?.id === h.id && it.meta?.kind === h.kind))
      ?? toolCtx.items.find((it) => [it.meta?.title, it.parsed.title].filter(Boolean).some((n) => bare(n!) === q) && yearOk(it));
    if (!best) {
      // not in the library: the chat shows a box to give a magnet / .torrent (never typed into the chat)
      toolCtx.media.source = { title: h?.title ?? String(a?.title ?? ""), year: h?.year || year, poster: h?.poster ?? null };
      const near = toolCtx.items.filter((it) => [it.meta?.title, it.parsed.title].filter(Boolean).some((n) => bare(n!).includes(q) || q.includes(bare(n!)))).map((it) => it.meta?.title ?? it.parsed.title);
      return `Kütüphanede YOK: ${h?.title ?? a?.title}${h?.year ? ` (${h.year})` : ""}. Sohbette magnet / torrent kutusu açıldı; kullanıcıdan magnet bağlantısını ya da .torrent dosyasını o kutuya vermesini iste, sohbete yazmasını isteme.${near.length ? ` Benzer adlı ama FARKLI filmler kütüphanede var: ${[...new Set(near)].slice(0, 4).join(", ")} — bunları açma, sadece söyle.` : ""}`;
    }
    if (!toolCtx.play) return "Oynatıcı hazır değil";
    toolCtx.play(best.files[0].path);
    return `Açılıyor: ${best.meta?.title ?? best.parsed.title}${best.meta?.year ? ` (${best.meta.year})` : ""}`;
  }
  const t = String(a?.title ?? "").trim();
  const label = a?.year ? `${t} (${a.year})` : t;
  if (!t) return "Başlık yok";
  if (name === "add_recommendation") {
    if (!String(a?.from ?? "").trim()) return `EKLENMEDİ: ${label} için kimin önerdiği bilinmiyor. Kullanıcıya “Bunu kim önerdi?” diye sor, cevaba göre tekrar ekle.`;
    const ok = await addRecommendation(t, a?.year, a?.from, a?.note);
    return ok ? `Önerilere eklendi: ${label}${a?.from ? " · " + a.from : ""}` : `Zaten önerilerde: ${label}`;
  }
  if (name === "mark_watched") { markSeen(label, true); return `İzlediklerine eklendi: ${label}`; }
  if (name === "add_watch_later") { markLater(label, true); return `Sonra izle listesine eklendi: ${label}`; }
  if (name === "remove_watch_later") { markLater(label, false); markLater(t, false); return `Sonra izle listesinden çıkarıldı: ${label}`; }
  return "Bilinmeyen işlem";
}

const URL_RE = /https?:\/\/\S+/i;

const TRIVIA = /trivia|fun facts?|behind the scenes|making of|did you know|ilginç|bilgi(ler)? ver|kamera arkası|çekim|perde arkası|gizli detay|easter egg|bilinmeyen/i;

const QUICK = [tt("Bu akşam ne izlesem?"), tt("Kütüphanemde olmayan ama sevebileceğim filmler öner"), tt("Arkadaşlarımın önerilerinden hangisiyle başlayayım?"), tt("Kütüphanemde izlemediğim en iyi film hangisi?"), tt("Hafif, güldüren bir şey öner")];

/** What the Öneriler page shows right now (a friend's recommendations or one of their lists). */
type RecsView = { who: string; list: string; films: { title: string; year?: string; rating?: number; stars?: number; tmdbId?: number; kind?: "movie" | "tv" }[] };
let recsView: RecsView | null = null;
export const getRecsView = () => recsView;
export function setRecsView(v: RecsView | null) {
  const same = JSON.stringify(v && { w: v.who, l: v.list, n: v.films.length }) === JSON.stringify(recsView && { w: recsView.who, l: recsView.list, n: recsView.films.length });
  recsView = v;
  if (!same) listeners.forEach((f) => f());
}
function recsViewNote(v: RecsView | null) {
  if (!v) return "";
  const seen = new Set([...loadSeen().map(seenKey), ...Object.values(loadDiary()).filter((e) => e.watched || e.vote).map((e) => seenKey(e.title))]);
  // what the user hasn't seen, without what moderation hides, best first; a few hundred titles is plenty to choose from
  const pool = v.films.filter((f) => !seen.has(seenKey(f.title)) && !cwFlag(f.tmdbId, f.kind))
    .sort((a, b) => (b.rating ?? 0) + (b.stars ?? 0) - ((a.rating ?? 0) + (a.stars ?? 0))).slice(0, 350);
  const line = (f: RecsView["films"][number]) => `${f.title}${f.year ? ` (${f.year})` : ""}${f.rating ? ` · TMDB ${f.rating}` : ""}${f.stars ? ` · ${v.who} ★${f.stars}/5` : ""}`;
  return `

# Şu anki sayfa: Öneriler › ${v.who === "*" ? "Tüm öneriler" : v.who} › ${v.list}
Kullanıcı şu anda ${v.who === "*" ? "arkadaşlarının bütün önerilerine" : `${v.who}'ın “${v.list}” listesine`} bakıyor (${v.films.length} film).
"Buradan ne izlesem", "bu listeden", "bunlardan hangisi" gibi isteklerde SADECE bu listeden seç:
- Önce zevk defterine bak (beğendikleri / beğenmedikleri / puanları / sevdiği türler) ve cevabın başında bunu kısaca söyle: ör. "Daha önce X ve Y gibi yavaş, atmosferik filmleri sevdiğin için…".
- 3–5 film seç, her birine neden ona uyduğunu bir cümleyle yaz (sevdiği bir filme benzerliği, türü, ${v.who === "*" ? "önereni" : v.who + "'ın puanı"}, TMDB puanı).
- Beğenmediği türlere benzeyenleri önerme. Zevk defteri boşsa önce ne tür şeyler sevdiğini kısaca sor.
Listenin izlemediği, moderasyona takılmayan filmlerinden en yüksek puanlı ${pool.length} tanesi:
${pool.map(line).join("\n")}`;
}

/** The page the user is looking at while chatting (details of one film / series). */
function viewingNote(it: Item | undefined) {
  if (!it) return "";
  const m = it.meta;
  const kind = it.parsed.kind === "tv" ? "dizi" : "film";
  const title = (m?.title ?? it.parsed.title) + (m?.year ? ` (${m.year})` : "");
  return `

# Şu anki sayfa
Kullanıcı şu anda şu ${kind}in detay sayfasında: **${title}**${m?.genres.length ? ` — ${m.genres.join(", ")}` : ""}${m?.rating ? `, TMDB ★${m.rating}` : ""}.
${m?.overview ? "Özet: " + m.overview.slice(0, 500) : ""}
"Bu film", "bu dizi", "bunun gibi", "bu bana uygun mu" gibi ifadeler bu ${kind}i kasteder; böyle sorularda bu ${kind}e odaklan.
Ama kullanıcı genel bir şey isterse (ör. "bana film öner", başka bir film ya da konu) bu sayfayla sınırlı kalma, normal şekilde cevap ver.`;
}
const PAGE_QUICK = (kind: string) => [tt("İlginç bilgiler (trivia)"), (kind === "tv" ? tt("Buna benzer diziler") : tt("Buna benzer filmler")), tt("Bu bana uygun mu?"), tt("Spoiler'sız ne bilmeliyim?"), tt("Oyuncu ve yönetmen hakkında")];

/* ---------- what the assistant is doing, step by step, each with its own little animation ---------- */
type StepKind = "think" | "search" | "page" | "list" | "taste" | "write" | "lib";
type Step = { kind: StepKind; text: string; done?: boolean };
const TOOL_STEP: Record<string, [StepKind, string]> = {
  read_link: ["page", tt("Sayfaya bakıyorum")],
  import_link: ["list", tt("Listeyi çıkarıyorum")],
  follow_letterboxd: ["list", tt("Letterboxd'u okuyorum")],
  refresh_playlists: ["list", tt("Listeleri güncelliyorum")],
  list_recommendations: ["list", tt("Önerilere bakıyorum")],
  list_playlists: ["list", tt("Listelere bakıyorum")],
  add_recommendation: ["write", tt("Önerilere ekliyorum")],
  update_recommendation: ["write", tt("Öneriyi düzenliyorum")],
  remove_recommendations: ["write", tt("Önerileri temizliyorum")],
  sort_recommendations: ["list", tt("Önerileri sıralıyorum")],
  add_to_playlist: ["write", tt("Listeye ekliyorum")],
  remove_from_playlist: ["write", tt("Listeden çıkarıyorum")],
  delete_playlist: ["write", tt("Listeyi siliyorum")],
  mark_watched: ["taste", tt("Zevk defterine yazıyorum")],
  rate_title: ["taste", tt("Puanını kaydediyorum")],
  remember_note: ["taste", tt("Not alıyorum")],
  forget_note: ["taste", tt("Notu siliyorum")],
  add_watch_later: ["list", tt("Sonra izle listesine ekliyorum")],
  remove_watch_later: ["list", tt("Sonra izle listesini düzenliyorum")],
  open_from_library: ["lib", tt("Kütüphanende arıyorum")],
  show_images: ["search", tt("Görselleri getiriyorum")],
  show_film: ["page", tt("Filmin sayfasını hazırlıyorum")],
  show_person: ["search", tt("Fotoğrafları getiriyorum")],
  film_links: ["page", tt("Bağlantıları buluyorum")],
};
function StepIcon({ kind }: { kind: StepKind }) {
  return (
    <span className={"step-ic k-" + kind} aria-hidden>
      {kind === "think" && <><i /><i /><i /></>}
      {kind === "search" && <svg viewBox="0 0 24 24"><circle cx="10" cy="10" r="6" /><path d="M14.5 14.5 20 20" /></svg>}
      {kind === "page" && <><svg viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6z" /><path d="M9 11h7M9 14h7M9 17h5" /></svg><b /></>}
      {kind === "list" && <><i /><i /><i /></>}
      {kind === "taste" && <svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></svg>}
      {kind === "write" && <><svg viewBox="0 0 24 24"><path d="M4 20l4-1 11-11-3-3L5 16z" /></svg><b /></>}
      {kind === "lib" && <><i /><i /><i /><i /></>}
    </span>
  );
}

const RECS_QUICK = [tt("Buradan ne izlesem?"), tt("Zevkime en uygun 5 film"), tt("Bu listeden hafif bir şey"), tt("Bu listeden en iyi bilinen klasikler"), tt("Bu listede sevmeyeceğim neler var?")];

export function ChatPanel({ items, recent, onClose, viewing, onPlay, onOpenSource }: { items: Item[]; recent: Recent[]; onClose: () => void; viewing?: Item; onPlay?: (path: string) => void; onOpenSource?: (src: string) => void }) {
  toolCtx.openSource = onOpenSource;
  useTaste();
  const rv = viewing ? null : getRecsView();
  toolCtx.items = items;
  toolCtx.play = onPlay;
  // One conversation per page: the general one, and one for each film / series details page.
  // A conversation continues only within the same app run and if it was used in the last 20 minutes.
  const thread = viewing ? "chat:" + viewing.key : "chat";
  const [msgs, setMsgs] = useState<Msg[]>(() => {
    let sameRun = false;
    try { sameRun = sessionStorage.getItem("chatRun") === "1"; sessionStorage.setItem("chatRun", "1"); } catch {}
    const fresh = Date.now() - Number(store.get(thread + "@at") ?? 0) < 20 * 60 * 1000;
    // Page conversations are only for that visit: leaving the page throws them away.
    return !viewing && sameRun && fresh ? store.json<Msg[]>(thread, []) : [];
  });
  const saveThread = (m: Msg[]) => {
    if (viewing) return; store.set(thread, JSON.stringify(m.slice(-40))); store.set(thread + "@at", String(Date.now())); };
  const [input, setInput] = useState("");
  const [big, setBigState] = useState(() => store.get("chatBig") === "1");
  const setBig = (v: boolean) => { setBigState(v); store.set("chatBig", v ? "1" : "0"); };
  // the stored id belongs to the conversation that was restored; a fresh start gets a new one (or it would overwrite the old one in the history)
  const [convId, setConvId] = useState(() => (!viewing && msgs.length && store.get(thread + "@id")) || Date.now().toString(36) + Math.random().toString(36).slice(2, 5));
  const [q, setQ] = useState("");
  const [zoom, setZoom] = useState<Pic | null>(null);
  const [tipSeen] = useState(() => Number(store.get("chatBigTip") ?? 0));
  useEffect(() => { if (tipSeen < 3) store.set("chatBigTip", String(tipSeen + 1)); }, []);
  const ctxKind: Conv["ctxKind"] = viewing ? "film" : rv ? "recs" : "general";
  const ctxLabel = viewing ? viewing.meta?.title ?? viewing.parsed.title : rv ? tt("{0} › {1}", rv.who === "*" ? tt("Tüm öneriler") : rv.who, rv.list) : tt("Genel");
  // every conversation goes to the history as it grows
  useEffect(() => {
    if (!msgs.length) return;
    const first = msgs.find((m) => m.role === "user")?.text ?? "Sohbet";
    const prev = loadConvs().find((c) => c.id === convId);
    saveConv({ id: convId, title: prev?.title ?? (first.length > 60 ? first.slice(0, 57) + "…" : first), at: Date.now(),
      ctx: prev?.ctx ?? ctxLabel, ctxKind: prev?.ctxKind ?? ctxKind, msgs: msgs.slice(-60) });
    if (!viewing) store.set(thread + "@id", convId);
    bumpHist((n) => n + 1); // the list on the left shows it right away
  }, [msgs]);
  const newChat = () => { setMsgs([]); setConvId(Date.now().toString(36) + Math.random().toString(36).slice(2, 5)); setErr(""); };
  const openConv = (c: Conv) => { setMsgs(c.msgs); setConvId(c.id); setErr(""); };
  const delConv = (id: string) => { store.set("chatHistory", JSON.stringify(loadConvs().filter((c) => c.id !== id))); if (id === convId) newChat(); else setQ((x) => x); bumpHist((n) => n + 1); };
  const [, bumpHist] = useState(0);
  // Luna's window is transparent, where WebView2 doesn't do backdrop blur: blur the app itself while the workspace is open
  useEffect(() => {
    document.body.classList.toggle("ws-open", big);
    return () => document.body.classList.remove("ws-open");
  }, [big]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { if (zoom) setZoom(null); else if (big) setBig(false); } };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [big, zoom]);
  const [seen, setSeen] = useState<string[]>(loadSeen);
  const [later, setLater] = useState<string[]>(loadLater);
  /** A title's action menu stays inside the chat panel, sliding left when there's no room on the right. */
  const fitPop = (e: React.MouseEvent) => {
    const acts = (e.target as HTMLElement).closest(".title-acts") ?? (e.target as HTMLElement).closest("b.film-link")?.nextElementSibling;
    const pop = acts?.querySelector<HTMLElement>(".ta-pop");
    const box = acts?.closest(".ws-main, .chat")?.getBoundingClientRect();
    if (!acts || !pop || !box) return;
    // slide it just enough to stay inside the panel
    const left = acts.getBoundingClientRect().left;
    const x = Math.max(box.left + 12 - left, Math.min(-6, box.right - 16 - left - pop.offsetWidth));
    pop.style.left = x + "px";
  };
  const toggleSeen = (e: React.MouseEvent) => {
    const el = e.target as HTMLElement;
    const fl = el.closest<HTMLElement>("[data-film]");
    if (fl) { openFilm((fl.dataset.film ?? "").replace(/&quot;/g, '"').replace(/&amp;/g, "&")); return; }
    const seenBtn = el.closest<HTMLElement>("[data-seen]");
    const laterBtn = el.closest<HTMLElement>("[data-later]");
    const yt = el.closest<HTMLElement>("[data-yt]");
    const vb = el.closest<HTMLElement>("[data-vote]");
    if (vb) {
      const t = vb.dataset.t ?? "";
      const v = vb.dataset.vote as Vote;
      diarySet(t, undefined, { vote: diaryGet(t)?.vote === v ? undefined : v });
      setSeen(loadSeen());
      return;
    }
    if (seenBtn) setSeen(markSeen(seenBtn.dataset.seen ?? ""));
    else if (laterBtn) setLater(markLater(laterBtn.dataset.later ?? ""));
    else if (yt) openUrl(youtubeTrailer(yt.dataset.yt ?? ""));
    else { const a = el.closest<HTMLElement>("[data-url]"); if (a) openUrl(a.dataset.url ?? ""); }
  };
  // a title clicked in an answer: its page comes in as a new answer, straight from TMDB (no model call)
  const pickFilm = async (c: Choice) => {
    if (busy) return;
    setBusy(true); setSteps([{ kind: "page", text: tt("Filmin sayfasını hazırlıyorum") }]);
    toolCtx.media = { images: [], people: [], links: [] };
    try {
      await runTool("show_film", { tmdb_id: c.id, kind: c.kind, title: c.title, year: c.year });
      const md_ = toolCtx.media;
      if (md_.film) setMsgs((l) => [...l, { role: "model", text: "", film: md_.film, ...(md_.images.length ? { images: md_.images } : {}),
        ...(md_.people.length ? { people: md_.people } : {}), ...(md_.links.length ? { links: md_.links } : {}) }]);
    } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  };
  toolCtx.pickFilm = pickFilm;
  const openFilm = async (t: string) => {
    if (busy) return;
    setBusy(true); setSteps([{ kind: "page", text: tt("Filmin sayfasını hazırlıyorum") }]);
    toolCtx.media = { images: [], people: [], links: [] };
    const y = t.match(/\((\d{4})\)\s*$/)?.[1];
    try {
      const res = await runTool("show_film", { title: t.replace(/\s*\(\d{4}\)\s*$/, ""), year: y });
      const md_ = toolCtx.media;
      if (md_.choices) { setMsgs((l) => [...l, { role: "model", text: tt("Bu adda birden fazla yapım var, hangisi?"), choices: md_.choices }]); return; }
      if (!md_.film) { setErr(res); return; }
      setMsgs((l) => [...l, { role: "model", text: "", film: md_.film, ...(md_.images.length ? { images: md_.images } : {}),
        ...(md_.people.length ? { people: md_.people } : {}), ...(md_.links.length ? { links: md_.links } : {}) }]);
    } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  };
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  // a new step finishes the one before it
  const step = (kind: StepKind, text: string) => setSteps((l) => (l[l.length - 1]?.text === text ? l : [...l.map((x) => ({ ...x, done: true })), { kind, text }]));
  const [err, setErr] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const key = store.get("geminiKey") ?? "";

  useEffect(() => { saveThread(msgs); endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);

  const send = async (text: string, base?: Msg[]) => {
    if (!text.trim() || busy) return;
    const next: Msg[] = [...(base ?? msgs), { role: "user", text: text.trim() }];
    setMsgs(next); setInput(""); setErr(""); setBusy(true); setSteps([]);
    toolCtx.media = { images: [], people: [], links: [] };
    try {
      // Trivia / behind-the-scenes questions are answered from a live Google search, with sources.
      const ground = TRIVIA.test(text);
      const wantsPick = /öner|ne izle|izlesem|uygun|hangisi|seç/i.test(text);
      if (ground) step("search", tt("İnternette araştırıyorum"));
      else if (URL_RE.test(text)) step("page", tt("Bağlantıya bakıyorum"));
      else if (wantsPick && !viewing && getRecsView()) { step("list", tt("Listeyi tarıyorum")); setTimeout(() => step("taste", tt("Zevkine göre seçiyorum")), 1600); }
      else if (wantsPick) step("taste", tt("Zevkine bakıyorum"));
      else step("think", tt("Düşünüyorum"));
      const body: any = {
        // a link in the message: Gemini opens the page itself (URL context); trivia: Google search; otherwise Luna's tools
        tools: ground ? [{ google_search: {} }] : TOOLS,
        systemInstruction: { parts: [{ text: SYSTEM + (lang() === "en" ? SYSTEM_EN : "") + "\n\n# Kullanıcı profili\n" + profile(items, recent) + (viewing ? viewingNote(viewing) : recsViewNote(getRecsView())) }] },
        // what the chat showed counts too: a film page opened by a click, the same-name choices
        contents: next.slice(-20).map((m) => ({ role: m.role, parts: [{ text: [
          m.text,
          m.film ? `[Sohbette şu filmin sayfası açıldı ve kullanıcı ona bakıyor: ${m.film.title}${m.film.original && m.film.original !== m.film.title ? ` / ${m.film.original}` : ""} (${m.film.year}), TMDB ${m.film.kind} ${m.film.id}${m.film.director ? `, yönetmen ${m.film.director}` : ""}. "Bu film", "bu" gibi ifadeler bunu kasteder.]` : "",
          m.choices ? `[Aynı adlı seçenekler gösterildi: ${m.choices.map((c) => `${c.title} (${c.year})`).join(", ")}]` : "",
          m.source ? `[Kütüphanede yok, kaynak kutusu gösterildi: ${m.source.title}]` : "",
        ].filter(Boolean).join(" ") || "…" }] })),
      };
      // A link in the message: Luna downloads the page itself and hands its text to the assistant.
      const link = text.match(URL_RE)?.[0];
      if (link) {
        body.contents[body.contents.length - 1].parts[0].text += `\n\n[Mesajda bağlantı var: ${link}. Filmleri önerilere aktarmak için import_link, arkadaşın hesabını bağlamak için follow_letterboxd, sadece göz atmak için read_link kullan. Kimin olduğu belli değilse önce sor.]`;
      }
      // Questions that need pictures or links: the model is made to call the right tool (it tends to just answer from memory)
      const tn = trAscii(text);
      const force: [RegExp, string[], string][] = [
        [/\b(ac|oynat|baslat)\b|\bacar misin|\bacabilir|\b(open|play|start)\b/, ["open_from_library"], "open_from_library aracını çağır (tam o filmi; yılı biliyorsan ver)."],
        [/\bkim(ler)?\b.{0,30}(oyn|rol|yonet|cek|yapt|yapm|cizd|yazd)|(yapt|yapm|cekt|cekm|yonett)\w* (kim|kimdir)|oyuncu|kadro|basrol|yonetmen|senarist|\bcast\b|\bwho (stars|starred|acted|directed|plays|played|is in|was in|made|wrote)\b|\bactors?\b|\bdirector\b|\bstarring\b/, ["show_film"], "show_film aracını çağır (filmin sayfası: fotoğraflı kadro, yönetmen, hikaye)."],
        [/hakkinda|anlat|konusu|hikaye|nasil bir (film|dizi)|ne anlatiyor|neyi anlatiyor|bilgi|incele|nedir\b|nasil bir sey|tell me about|what'?s .{0,40}\babout\b|\bplot\b|synopsis|storyline/, ["show_film"], "show_film aracını çağır (filmin sayfası), sonra sorulanı cevapla."],
        [/nere(de|den)?\s*(izle|bul|seyret)|nerden izle|hangi platform|izleyebilir|\blink|baglanti|imdb|letterboxd|vikipedi|wikipedia|where (can i |to |do i )?(watch|stream|find)|streaming|which platform|\blinks?\b/, ["film_links"], "film_links aracını çağır; bilmediğin platformu uydurma."],
        [/gorsel|fotograf|foto\b|resim|afis|poster|sahne|kare(ler)?|pictures?|photos?|images?|stills?|scenes?|screenshots?/, ["show_images", "show_person"], "show_images (kişi için show_person) aracını çağır."],
      ];
      // "zevkimi anlat", "listeyi anlat", "5 film öner" are not about one film
      const notOneFilm = /zevk|liste|oneri|oner\b|kutuphan|\bbeni\b|\bbenim\b|arkadas|filmler|taste|\blists?\b|recommend|suggest|library|\bme\b|\bmy\b|friend|films|movies|shows/.test(tn);
      const want = ground ? undefined : force.find(([re, tools]) => re.test(tn) && !(tools[0] === "show_film" && notOneFilm && !/oyn|kadro|yonetmen|\bwho\b|\bcast\b|director/.test(tn)));
      if (want) {
        body.contents[body.contents.length - 1].parts[0].text += `

[${want[2]}]`;
        body.toolConfig = { functionCallingConfig: { mode: "ANY", allowedFunctionNames: want[1] } };
      }
      let { r, model: used } = await geminiWithFallback(key, body);
      // Tool calls: run them here, hand the results back, let the model answer (a few rounds at most).
      const done_: string[] = [];
      for (let round = 0; round < 5; round++) {
        const parts: any[] = r?.candidates?.[0]?.content?.parts ?? [];
        const calls = parts.filter((p) => p.functionCall);
        if (!calls.length) break;
        const results = [];
        for (const c of calls) {
          const [k, t] = TOOL_STEP[c.functionCall.name] ?? ["think", tt("Çalışıyorum")];
          step(k, t);
          const res = await runTool(c.functionCall.name, c.functionCall.args);
          const SHORT: Record<string, string> = { show_film: tt("Film sayfası açıldı"), show_images: tt("Görseller getirildi"), show_person: tt("Fotoğraflar getirildi"), film_links: tt("Bağlantılar bulundu") };
          // the note under the answer stays one short line: what the tool returned is for the model, not for reading
          const READ: Record<string, string> = { open_from_library: /^Açılıyor/.test(res) ? res : tt("Kütüphanede yok · kaynak istendi"), list_playlists: tt("Listelere bakıldı"), list_recommendations: tt("Önerilere bakıldı"), read_link: tt("Bağlantı okundu") };
          const short = SHORT[c.functionCall.name] && !/bulunamadı/i.test(res) ? SHORT[c.functionCall.name]
            : READ[c.functionCall.name] ?? (res.length > 120 ? res.slice(0, 110).replace(/\s+\S*$/, "") + "…" : res);
          done_.push(short);
          results.push({ functionResponse: { name: c.functionCall.name, response: { result: res } } });
        }
        body.contents = [...body.contents, { role: "model", parts }, { role: "user", parts: results }];
        delete body.toolConfig; // only the first round is forced
        step("write", tt("Derliyorum"));
        ({ r, model: used } = await geminiWithFallback(key, body));
      }
      if (done_.length) { setSeen(loadSeen()); setLater(loadLater()); }
      const outText = (r?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? "").join("").trim();
      // "bir film öner" answered with one film: that film's page too
      const askedForOne = /oner|izlesem|recommend|suggest|what should i watch/.test(tn);
      if (!toolCtx.media.film && !toolCtx.media.choices && !toolCtx.media.source && !ground && (!notOneFilm || askedForOne)) {
        const titles = [...new Set([...outText.matchAll(/\*\*([^*]+?\((?:19|20)\d{2}\))\*\*/g)].map((x) => x[1].trim()))];
        if (titles.length === 1) {
          const t = titles[0];
          const name = t.replace(/\s*\(\d{4}\)\s*$/, "");
          const y = t.match(/\((\d{4})\)\s*$/)![1];
          step("page", tt("Filmin sayfasını hazırlıyorum"));
          // only when TMDB has a film by exactly that name (a bolded director or actor must not turn into a page)
          const h = await findTitle({ title: name, year: y }).catch(() => undefined);
          const k = norm(name).replace(/^(the|a|an) /, "");
          if (h && norm(h.title).replace(/^(the|a|an) /, "") === k) await runTool("show_film", { tmdb_id: h.id, kind: h.kind, title: h.title, year: h.year }).catch(() => "");
        }
      }
      const out = outText || (done_.length ? done_.join("\n") : "");
      const chunks: any[] = r?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      const sources: Source[] = chunks.map((c) => c.web).filter(Boolean).map((w: any) => ({ title: w.title || w.uri, uri: w.uri }))
        .filter((x, i, a) => a.findIndex((y) => y.title === x.title) === i).slice(0, 6);
      const md_ = toolCtx.media;
      const media = { ...(md_.choices && !md_.film ? { choices: md_.choices } : {}), ...(md_.source ? { source: md_.source } : {}), ...(md_.film ? { film: md_.film } : {}), ...(md_.images.length ? { images: md_.images } : {}), ...(md_.people.length ? { people: md_.people } : {}), ...(md_.links.length ? { links: md_.links } : {}) };
      const done: Msg[] = [...next, { role: "model", text: out || tt("(boş yanıt)"), ...media, ...(sources.length ? { sources } : {}), ...((used.note || done_.length) ? { note: [...done_.map((d) => "✓ " + d), used.note].filter(Boolean).join(" · ") } : {}) }];
      saveThread(done); // keeps the answer even if the user already switched pages
      setMsgs(done);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  const LINK_ICON: Record<string, [string, string]> = { imdb: ["IMDb", "#f5c518"], lb: ["LB", "#00c030"], tmdb: ["TM", "#01b4e4"], wiki: ["W", "#ffffff"], yt: ["▶", "#ff3b3b"], jw: ["JW", "#ffd23f"] };
  const head = (
    <div className="chat-head">
      {!big && <><span className="chat-dot" /> <b>{tt("Luna asistan")}</b></>}
      {big && <h2 className="ws-title ellipsis">{msgs.find((m) => m.role === "user")?.text.slice(0, 60) ?? tt("Yeni sohbet")}</h2>}
      <span className={"chat-ctx ellipsis" + (viewing || rv ? " page" : "")} title={viewing ? tt("Bu sohbet bu sayfaya ait") : rv ? tt("Asistan şu an açık olan öneri listesine bakıyor") : tt("Genel sohbet")}>{msgs.length ? loadConvs().find((c) => c.id === convId)?.ctx ?? ctxLabel : ctxLabel}</span>
      <span className="grow" />
      {!big && msgs.length > 0 && <button className="chip" onClick={newChat}>{tt("Yeni sohbet")}</button>}
      <button className={"round glass-ib" + (!big ? " hl" : "")} aria-label={big ? tt("Küçült") : tt("Büyüt")} title={big ? tt("Küçült") : tt("Büyük çalışma alanı")} onClick={() => setBig(!big)}>
        <svg viewBox="0 0 24 24" className="ib-svg">{big ? <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" /> : <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />}</svg>
        {!big && tipSeen < 3 && <span className="big-tip">{tt("⤢ Büyük çalışma alanı")}</span>}
      </button>
      <button className="round glass-ib" aria-label={tt("Kapat")} onClick={onClose}><Icon d={I.x} size={18} /></button>
    </div>
  );
  const body = (
    <div className="chat-body">
      <div className="chat-col">
        {!key && <div className="chat-note">{tt("Asistan için Ayarlar'a")} <b>{tt("Gemini API anahtarı")}</b>  {tt("gir (aistudio.google.com › Get API key, ücretsiz).")}</div>}
        {!msgs.length && key && (
          <div className="chat-empty">
            <div className="muted">{tt("Ne izlemek istediğini söyle; beğenilerine, geçmişine ve arkadaşlarının önerilerine bakıp önereyim. Görsel ve bağlantı da getirebilirim.")}</div>
            <div className="chat-quick">{(viewing ? PAGE_QUICK(viewing.parsed.kind) : rv ? RECS_QUICK : QUICK).map((x) => <button key={x} className="chip" onClick={() => send(x)}>{x}</button>)}</div>
          </div>
        )}
        {msgs.map((m, i) => {
          const { body, chips } = m.role === "model" ? splitChips(m.text) : { body: m.text, chips: [] };
          const last = i === msgs.length - 1 && m.role === "model" && !busy;
          return (
            <div key={i} className={"msg-wrap " + m.role}>
              {m.film && <FilmPage f={m.film} onPlay={toolCtx.play} />}
              {m.source && <SourceBox s={m.source} />}
              {m.choices && (
                <div className="choices">
                  {m.choices.map((c) => (
                    <button key={c.kind + c.id} className="choice" onClick={() => toolCtx.pickFilm?.(c)} title={tt("{0} ({1}) sayfasını aç", c.title, c.year)}>
                      <div className="choice-poster" style={c.poster ? { backgroundImage: `url(${IMG}w185${c.poster})` } : undefined}>{!c.poster && <Icon d={I.film} size={20} />}</div>
                      <b className="ellipsis">{c.title}</b>
                      <span>{c.year}{c.kind === "tv" ? tt(" · Dizi") : ""}{c.rating ? ` · ★ ${String(c.rating).replace(".", ",")}` : ""}</span>
                    </button>
                  ))}
                </div>
              )}
              {m.images && (
                <div className={"msg-gal n" + Math.min(m.images.length, 5)}>
                  {m.images.slice(0, 5).map((p, j) => (
                    <button key={p.src} className="gal-item" style={{ backgroundImage: `url(${p.src})` }} onClick={() => setZoom(p)} title={p.caption}>
                      {j === 4 && m.images!.length > 5 ? <span className="gal-more">+{m.images!.length - 5}</span> : null}
                    </button>
                  ))}
                </div>
              )}
              {(m.role === "user" || m.text) && <div className={"msg " + m.role} {...(m.role === "model" ? { dangerouslySetInnerHTML: { __html: md(body, seen, later) }, onClick: toggleSeen, onMouseOver: fitPop } : { children: body })} />}
              {m.people && (
                <div className="msg-people">
                  {m.people.map((f) => (
                    <button key={f.name + f.role} className="msg-person" onClick={() => f.url && openUrl(f.url)} title={f.url ? tt("TMDB'de aç") : undefined}>
                      <div className="face">{f.photo ? <img src={`${IMG}w185${f.photo}`} alt="" loading="lazy" /> : f.name[0]}</div>
                      <b className="ellipsis">{f.name}</b><span className="ellipsis">{f.role}</span>
                    </button>
                  ))}
                </div>
              )}
              {m.links && (
                <div className="msg-links">
                  {m.links.map((k) => (
                    <button key={k.url} className="lk-card" onClick={() => openUrl(k.url)} title={k.url}>
                      <i style={{ background: LINK_ICON[k.kind]?.[1] ?? "#888" }}>{LINK_ICON[k.kind]?.[0] ?? "↗"}</i>{k.label}
                    </button>
                  ))}
                </div>
              )}
              {m.note && <div className="msg-note">{m.note}</div>}
              {m.sources && (
                <div className="msg-sources">
                  <span>{tt("Kaynaklar:")}</span>
                  {m.sources.map((src) => (
                    <button key={src.uri} className="src-chip" title={src.uri} onClick={() => openUrl(src.uri)}>{src.title}</button>
                  ))}
                </div>
              )}
              {last && (
                <div className="chat-quick follow">
                  <button className="chip regen" title={tt("Bu yanıtı yeniden üret")} onClick={() => {
                    const ui = msgs.map((x) => x.role).lastIndexOf("user");
                    if (ui >= 0) send(msgs[ui].text, msgs.slice(0, ui));
                  }}>{tt("↻ Yeniden üret")}</button>
                  {(chips.length ? chips : FOLLOW_UP).map((x) => <button key={x} className="chip" onClick={() => send(x)}>{x}</button>)}
                </div>
              )}
            </div>
          );
        })}
        {busy && (
          <div className="msg model working">
            {steps.map((x, i) => (
              <div key={i + x.text} className={"wstep" + (x.done ? " done" : "")}>
                {x.done ? <span className="step-ok">✓</span> : <StepIcon kind={x.kind} />}
                <span className="step-t">{x.text}{!x.done && <span className="step-dots"><i>.</i><i>.</i><i>.</i></span>}</span>
              </div>
            ))}
          </div>
        )}
        {err && <div className="chat-note err">{err}</div>}
        <div ref={endRef} />
      </div>
    </div>
  );
  const inputBar = (
    <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send(input); }}>
      <div className="chat-box">
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={key ? (big ? tt("Bir şey sor, bir link yapıştır ya da “… fotoğraflarını göster” de") : tt("Bir şey sor…")) : tt("Önce Gemini anahtarını gir")} disabled={!key} autoFocus />
        <button className="chat-send" aria-label={tt("Gönder")} disabled={!key || busy || !input.trim()}>
          <svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
        </button>
      </div>
      {big && <div className="chat-hint">{tt("Esc ya da dışarı tıklama: küçük balona döner · sohbetler solda saklanır")}</div>}
    </form>
  );
  const lightbox = zoom && createPortal(
    <div className="lightbox" onClick={() => setZoom(null)}>
      <img src={zoom.full} alt={zoom.caption ?? ""} />
      {zoom.caption && <div className="lb-cap">{zoom.caption}</div>}
    </div>,
    document.body,
  );

  if (!big) {
    return (
      <div className="chat-panel glass" onKeyDown={(e) => e.stopPropagation()}>
        {head}{body}{inputBar}{lightbox}
      </div>
    );
  }

  // ---- the big workspace: history on the left
  const day = 86400000, today = new Date(); today.setHours(0, 0, 0, 0);
  const groupOf = (t: number) => t >= today.getTime() ? tt("Bugün") : t >= today.getTime() - day ? tt("Dün") : t >= today.getTime() - 6 * day ? tt("Bu hafta") : tt("Daha eski");
  const convs = loadConvs().filter((c) => !q.trim() || seenKey(c.title + " " + c.msgs.map((m) => m.text).join(" ")).includes(seenKey(q)));
  const groups: [string, Conv[]][] = [];
  for (const c of convs) { const g = groupOf(c.at); const e = groups.find((x) => x[0] === g); if (e) e[1].push(c); else groups.push([g, [c]]); }
  const hhmm = (t: number) => t >= today.getTime() - day ? new Date(t).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" }) : new Date(t).toLocaleDateString(locale(), { weekday: "short", day: "numeric", month: "short" });
  return createPortal(
    <>
    {/* the blur behind is a sibling, not a parent: nested backdrop filters would leave the glass with nothing to blur */}
    <div className="chat-scrim" />
    <div className="chat-ws-wrap" onMouseDown={(e) => e.target === e.currentTarget && setBig(false)} onKeyDown={(e) => e.stopPropagation()}>
      <div className="chat-ws glass">
        <aside className="ws-side">
          <div className="ws-side-head">
            <div className="ws-brand"><span className="chat-dot" />  {tt("Luna asistan")}</div>
            <button className="ws-new" onClick={newChat}>{tt("＋ Yeni sohbet")}</button>
            <div className="ws-find"><Icon d={I.search} size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tt("Sohbetlerde ara")} /></div>
          </div>
          <div className="ws-hist">
            {!convs.length && <div className="muted small ws-empty">{q ? tt("Eşleşen sohbet yok.") : tt("Sohbetlerin burada birikecek.")}</div>}
            {groups.map(([g, list]) => (
              <div key={g}>
                <div className="ws-grp">{g}</div>
                {list.map((c) => (
                  <div key={c.id} className={"ws-h" + (c.id === convId ? " on" : "")} onClick={() => openConv(c)}>
                    <b className="ellipsis">{c.title}</b>
                    <small><span className={"ws-ctx " + c.ctxKind}>{c.ctx}</span>{hhmm(c.at)}</small>
                    <button className="ws-del" aria-label={tt("Sohbeti sil")} title={tt("Sohbeti sil")} onClick={(e) => { e.stopPropagation(); delConv(c.id); }}>×</button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </aside>
        <section className="ws-main">
          {head}{body}{inputBar}
        </section>
      </div>
    </div>
    {lightbox}
    </>,
    document.body,
  );
}
