import { store } from "./library";
import { reviewAi, reviewAiJson } from "./ai";
import { ASPECTS } from "./filmReviewModel";
import type { Aspect } from "./filmReviewModel";
import { TASTE_NAMES, loadAspectScores, rememberAspects } from "./reviewTaste";

/**
 * Books and songs get the same six-topic scores films get from Luna Analiz, so a plain like or dislike
 * teaches the taste map too. The AI only looks each work up once (genre, maker, the six topics out of 10),
 * twenty works in one short message; films are not touched.
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
  const known = new Set([...Object.values(have).map((e) => e.title), ...store.json<string[]>("tasteTried:" + kind, [])].map((t) => t.toLocaleLowerCase("tr")));
  const out: Work[] = [];
  if (kind === "music") {
    const l = [...store.json<{ q: { title: string; artist?: string; podcast?: boolean } }[]>("musicLikes", []), ...store.json<{ q: { title: string; artist?: string } }[]>("musicDislikes", [])];
    for (const x of l) if (!(x.q as any).podcast && !known.has(musicTitle(x.q).toLocaleLowerCase("tr"))) out.push({ title: musicTitle(x.q), by: x.q.artist });
  } else {
    for (const e of Object.values(store.json<Record<string, { title: string; author?: string; vote?: string; rating?: number }>>("bookDiary", {})))
      if ((e.vote || e.rating) && !known.has(e.title.toLocaleLowerCase("tr"))) out.push({ title: e.title, by: e.author });
  }
  return out;
}

/** Genres the AI named for each work, by title (for the "favourite genres" card). */
export const tasteGenres = (kind: Kind) => store.json<Record<string, string[]>>("tasteGenres:" + kind, {});

let busy = false;
/** Scores the works that have none yet: at most two messages of twenty per run, at most every ten minutes. */
export async function fillTaste(kind: Kind, force = false): Promise<number> {
  const stamp = "tasteFillAt:" + kind;
  if (busy || !reviewAi().use.key) return 0;
  if (!force && Date.now() - Number(store.get(stamp) ?? 0) < 10 * 60 * 1000) return 0;
  const todo = pending(kind).slice(0, 40);
  if (!todo.length) return 0;
  busy = true;
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
    busy = false;
    if (done) window.dispatchEvent(new CustomEvent("film-decision-changed", { detail: { key: "fill:" + kind, origin: "fill" } }));
  }
  return done;
}
