import { invoke } from "@tauri-apps/api/core";
import { searchTmdb, store, tmdbKeywords } from "./library";
import { matchKey } from "./textMatch";
import { reviewAi, reviewAiJson } from "./ai";
import { ASPECTS } from "./filmReviewModel";
import type { Aspect } from "./filmReviewModel";
import { TASTE_NAMES, loadAspectScores, rememberAspects } from "./reviewTaste";

/**
 * Books and songs get the same six-topic scores films get from Luna Analiz, so a plain like or dislike
 * teaches the taste map too. The AI only looks each work up once (genre, maker, the six topics out of 10),
 * twenty works in one short message; films have their own small analysis below.
 */
type Kind = "book" | "music";
type Work = { title: string; by?: string; year?: string };

/** The title a work is kept under: a song with its artist (so two songs of the same name stay apart). */
export const musicTitle = (q: { title: string; artist?: string }) => q.title + " | " + (q.artist ?? "");

/** How many liked or disliked works have no scores yet (nothing to send when 0). */
export const pendingCount = (kind: Kind) => pending(kind).length;
function pending(kind: Kind): Work[] {
  const have = loadAspectScores(kind);
  // scored ones, and ones the AI was asked about once but didn't know (not asked again)
  const known = new Set([...Object.values(have).map((e) => e.title), ...store.json<string[]>("tasteTried:" + kind, [])].map((t) => matchKey(t)));
  const out: Work[] = [];
  if (kind === "music") {
    const l = [...store.json<{ q: { title: string; artist?: string; podcast?: boolean } }[]>("musicLikes", []), ...store.json<{ q: { title: string; artist?: string } }[]>("musicDislikes", [])];
    for (const x of l) if (!(x.q as any).podcast && !known.has(matchKey(musicTitle(x.q)))) out.push({ title: musicTitle(x.q), by: x.q.artist });
  } else {
    for (const e of Object.values(store.json<Record<string, { title: string; author?: string; vote?: string; rating?: number }>>("bookDiary", {})))
      if ((e.vote || e.rating) && !known.has(matchKey(e.title))) out.push({ title: e.title, by: e.author });
  }
  return out;
}

/** Genres the AI named for each work, by title (for the "favourite genres" card). */
export const tasteGenres = (kind: Kind) => store.json<Record<string, string[]>>("tasteGenres:" + kind, {});

let busy = false;
let active:{kind:Kind|"film";count:number}|null=null;
export const tasteFillState=()=>active;
const notifyFill=()=>window.dispatchEvent(new Event("luna-taste-measuring"));
/** Scores the works that have none yet: at most two messages of twenty per run, at most every ten minutes. */
export async function fillTaste(kind: Kind, force = false): Promise<number> {
  const stamp = "tasteFillAt:" + kind;
  if (busy || !reviewAi().use.key) return 0;
  if (!force && Date.now() - Number(store.get(stamp) ?? 0) < 10 * 60 * 1000) return 0;
  const todo = pending(kind).slice(0, 40);
  if (!todo.length) return 0;
  busy = true;active={kind,count:todo.length};notifyFill();
  store.set(stamp, String(Date.now()));
  let done = 0;
  try {
    const names = TASTE_NAMES[kind];
    const topics = ASPECTS.map((a) => `${a}=${names[a]}`).join(", ");
    for (let i = 0; i < todo.length; i += 20) {
      const part = todo.slice(i, i + 20);
      const sys = `Sen bir ${kind === "music" ? "müzik" : "edebiyat"} uzmanısın. Her ${kind === "music" ? "şarkı" : "kitap"} için genel bilgine göre: türü (1-3 kısa Türkçe tür) ve şu altı konuda 1-10 arası puan (eserin o konuda ne kadar güçlü olduğu): ${topics}. Bilmiyorsan o eseri atla. SADECE JSON: {"items":[{"n":1,"genres":["..."],"scores":{"story":7,...}}]}`;
      const user = part.map((w, j) => `${j + 1}. ${w.title.replace(" | ", " — ")}${w.by && !w.title.includes(w.by) ? " — " + w.by : ""}`).join("\n");
      const r = await reviewAiJson(sys, user).catch(() => null);
      if (r) store.set("tasteTried:" + kind, JSON.stringify([...store.json<string[]>("tasteTried:" + kind, []), ...part.map((w) => w.title)].slice(-2000)));
      const g = tasteGenres(kind);
      for (const it of Array.isArray(r?.items) ? r.items : []) {
        const w = part[Number(it?.n) - 1];
        if (!w || !it?.scores) continue;
        const sc = ASPECTS.map((a) => ({ aspect: a as Aspect, score: Number.isFinite(Number(it.scores[a])) ? Math.max(1, Math.min(10, Number(it.scores[a]))) : null }));
        rememberAspects({ title: w.title }, sc, kind);
        if (Array.isArray(it.genres)) g[w.title] = it.genres.map(String).slice(0, 3);
        done++;
      }
      store.set("tasteGenres:" + kind, JSON.stringify(g));
    }
  } finally {
    busy = false;active=null;notifyFill();
    if (done) window.dispatchEvent(new CustomEvent("film-decision-changed", { detail: { key: "fill:" + kind, origin: "fill" } }));
  }
  return done;
}

/** Liked films rarely have a full Luna Analiz, so each gets a small one of its own: its TMDB overview and keywords and
 *  some Letterboxd reviews, one film at a time. Only themes and feelings come out, kept apart: the film's score,
 *  its details page and the "for you" score never see them. */
export type FilmThemes = { themes: string[]; emotions: string[] };
export const filmThemeKey = (title: string, year?: string) => matchKey(title) + "|" + (year ?? "").slice(0, 4);
export const filmThemes = () => store.json<Record<string, FilmThemes>>("filmThemeAnalysis", {});
const triedFilmThemes = () => store.json<string[]>("filmThemeAnalysisTried", []);
export const filmThemesPending = (works: { title: string; year?: string }[]) => {
  const have = filmThemes(), tried = new Set(triedFilmThemes());
  return works.filter((w) => { const k = filmThemeKey(w.title, w.year); return !have[k] && !tried.has(k); });
};
async function filmSources(w: { title: string; year?: string }) {
  const year = Number(w.year?.slice(0, 4)) || undefined;
  const hit = (await searchTmdb(w.title, "movie", year).catch(() => []))[0] ?? (await searchTmdb(w.title, "tv", year).catch(() => []))[0];
  const keywords = hit ? await tmdbKeywords(hit.kind, hit.id).catch(() => [] as string[]) : [];
  const page = await invoke<{ reviews: { text?: string }[] }>("letterboxd_reviews", { tmdb: hit?.id ?? null, tv: hit?.kind === "tv", title: w.title, year: year ? String(year) : null, count: 15, spoilers: false }).catch(() => null);
  return { overview: hit?.overview ?? "", keywords: keywords.slice(0, 20), reviews: (page?.reviews ?? []).map((r) => (r.text ?? "").trim().slice(0, 400)).filter(Boolean) };
}
export type ThemeScan = { done: number; error?: "busy" | "nokey" | "failed" };
/** `again` (the Tara button) also retries titles that came back empty before. */
export async function fillFilmThemes(works: { title: string; year?: string }[], again = false): Promise<ThemeScan> {
  if (busy) return { done: 0, error: "busy" };
  if (!reviewAi().use.key) return { done: 0, error: "nokey" };
  const have0 = filmThemes();
  const todo = again ? works.filter((w) => !have0[filmThemeKey(w.title, w.year)]) : filmThemesPending(works);
  if (!todo.length) return { done: 0 };
  busy = true;active={kind:"film",count:todo.length};notifyFill();
  let done = 0, misses = 0;
  const labels = (x: unknown) => Array.isArray(x) ? x.map((t) => String(t).trim().slice(0, 40)).filter(Boolean).slice(0, 4) : [];
  const sys = 'Sen bir sinema uzmanısın. Verilen özet, anahtar kelime ve izleyici yorumlarından filmin temalarını ve bıraktığı duyguları çıkar: en fazla 4 tema, 3 duygu. Etiketler Türkçe, 1-2 kelime ve genel olsun (tema: Yas, Aile, Yozlaşma; duygu: Hüzün, Merak, Umut); filme özel isim kullanma. Duygu bir his olmalı, konu değil. Bilgi yetmiyorsa boş liste ver, uydurma. Yalnız JSON yaz: {"themes":[],"emotions":[]}';
  try {
    for (const [i, w] of todo.entries()) {
      active={kind:"film",count:todo.length-i};notifyFill();
      const src = await filmSources(w);
      const user = [`Film: ${w.title}${w.year ? ` (${w.year.slice(0, 4)})` : ""}`, src.overview && `Özet: ${src.overview}`, src.keywords.length ? `Anahtar kelimeler: ${src.keywords.join(", ")}` : "", src.reviews.length ? `Yorumlar:\n${src.reviews.join("\n---\n")}` : ""].filter(Boolean).join("\n\n");
      const r = await reviewAiJson(sys, user).catch((e) => { console.warn("film themes failed", e); return null; });
      if (!r) { if (++misses >= 3) break; continue; }
      misses = 0;
      const key = filmThemeKey(w.title, w.year);
      store.set("filmThemeAnalysisTried", JSON.stringify([...triedFilmThemes(), key].slice(-2000)));
      const row = { themes: labels(r.themes), emotions: labels(r.emotions) };
      if (row.themes.length || row.emotions.length) {
        store.set("filmThemeAnalysis", JSON.stringify({ ...filmThemes(), [key]: row }));
        done++;
        window.dispatchEvent(new CustomEvent("film-decision-changed", { detail: { key: "fill:film", origin: "fill" } }));
      }
    }
  } finally {
    busy = false;active=null;notifyFill();
  }
  return misses >= 3 || (misses && !done) ? { done, error: "failed" } : { done };
}
