import { store } from "./library";
import { ASPECTS, filmKey, normalizeText } from "./filmReviewModel";
import type { Aspect, FilmTarget, Profile } from "./filmReviewModel";

/** "Zevklerim": the user's taste per topic (story, pace, acting…), built the way the shared
 *  review-analysis app builds it (recommendation_engine.py):
 *  - the weights the user sets by hand are a weak signal (35%);
 *  - why they liked titles is the strong one (65%): the topics ticked in "after watching" plus the
 *    topics Luna Analiz found strongest in titles they liked;
 *  - why they disliked titles pulls a topic down (down to ×0.6).
 *  The more the user has said, the more "for you" leans on these topics instead of the community
 *  score. Each analysis also keeps its topic scores here, for the assistant. */
export type AspectScores = Partial<Record<Aspect, number>>;
type Entry = { title: string; year: string; kind: string; fk: string; aspects: AspectScores; at: number };
/** Films, books and music each have their own taste: the same six slots, named for each. */
export type TasteKind = "film" | "book" | "music";
export const TASTE_NAMES: Record<TasteKind, Record<Aspect, string>> = {
  film: { story: "Hikâye", pace: "Tempo", acting: "Oyunculuk", visuals: "Görsellik", emotion: "Karakter ve duygu", sound: "Müzik ve ses" },
  book: { story: "Kurgu", pace: "Tempo", acting: "Üslup", visuals: "Atmosfer ve dünya", emotion: "Karakter ve duygu", sound: "Fikirler ve derinlik" },
  music: { story: "Söz ve anlam", pace: "Ritim ve enerji", acting: "Vokal", visuals: "Prodüksiyon ve ses", emotion: "Duygu ve atmosfer", sound: "Melodi" },
};
const NAMES_EN: Record<TasteKind, Record<Aspect, string>> = {
  film: { story: "story", pace: "pace", acting: "acting", visuals: "visuals", emotion: "characters and emotion", sound: "music and sound" },
  book: { story: "plot", pace: "pace", acting: "writing style", visuals: "atmosphere and world", emotion: "characters and emotion", sound: "ideas and depth" },
  music: { story: "lyrics and meaning", pace: "rhythm and energy", acting: "vocals", visuals: "production and sound", emotion: "mood and atmosphere", sound: "melody" },
};
/** Where each part keeps its taste: weights, the analysed titles' topic scores, the "after" verdicts. */
export const profileKeyOf = (k: TasteKind) => "filmDecision:profile:" + (k === "film" ? "movie" : k);
const scoresKey = (k: TasteKind) => (k === "film" ? "reviewAspects" : "reviewAspects:" + k);
export const workPrefix = (k: TasteKind) => (k === "film" ? "filmDecision:work:" : k === "book" ? "bookTaste:work:" : "musicTaste:work:");
const MAX = 400;

const norm = (t: string) => normalizeText(t).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const keyOf = (f: { title: string; year?: string | number }) => norm(f.title) + "|" + String(f.year ?? "").slice(0, 4);
export const loadAspectScores = (k: TasteKind = "film") => store.json<Record<string, Entry>>(scoresKey(k), {});

export function rememberAspects(film: FilmTarget, aspects: { aspect: Aspect; score: number | null }[], k: TasteKind = "film") {
  const got: AspectScores = {};
  for (const a of aspects) if (a.score != null && ASPECTS.includes(a.aspect)) got[a.aspect] = a.score;
  if (!Object.keys(got).length) return;
  const all = loadAspectScores(k);
  all[keyOf(film)] = { title: film.title, year: String(film.year ?? "").slice(0, 4), kind: film.kind === "tv" ? "tv" : "movie", fk: filmKey(film), aspects: got, at: Date.now() };
  const keep = Object.entries(all).sort((a, b) => b[1].at - a[1].at).slice(0, MAX);
  store.set(scoresKey(k), JSON.stringify(Object.fromEntries(keep)));
}
export const aspectsOf = (film: { title: string; year?: string | number }, k: TasteKind = "film"): AspectScores | null => loadAspectScores(k)[keyOf(film)]?.aspects ?? null;

/** Every "after watching" verdict: vote and the topics ticked as the reason. */
function verdicts(kind: TasteKind): Map<string, { vote: "like" | "dislike"; reasons: Aspect[] }> {
  const out = new Map<string, { vote: "like" | "dislike"; reasons: Aspect[] }>();
  const pre = workPrefix(kind);
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(pre)) continue;
      const w = store.json<any>(k, null)?.feedback;
      if (w?.vote !== "like" && w?.vote !== "dislike") continue;
      out.set(k.slice(pre.length), { vote: w.vote, reasons: Array.isArray(w.reasons) ? ASPECTS.filter((a) => w.reasons.includes(a)) : [] });
    }
  } catch {}
  return out;
}
/** Music has no diary: its likes and dislikes are one (titles kept as "song | artist", like its scores). */
function musicVotes(): Record<string, any> {
  const out: Record<string, any> = {};
  const pts = store.json<Record<string, number>>("musicRatings", {});
  for (const [k, vote] of [["musicLikes", "like"], ["musicDislikes", "dislike"]] as const)
    for (const x of store.json<{ q: { src: string; title: string; artist?: string } }[]>(k, [])) out[x.q.title + " | " + (x.q.artist ?? "")] = { title: x.q.title + " | " + (x.q.artist ?? ""), vote, rating: pts[x.q.src] };
  return out;
}
/** +1 liked, -1 disliked, 0 unknown, from the taste diary. */
function diaryVote(e: Entry, diary: Record<string, any>): number {
  for (const d of Object.values(diary)) {
    if (!d || norm(String(d.title ?? "").replace(/\s*\(\d{4}\)\s*$/, "")) !== norm(e.title)) continue;
    if (d.year && e.year && String(d.year).slice(0, 4) !== e.year) continue;
    if (d.vote === "like" || (d.rating ?? 0) >= 7) return 1;
    if (d.vote === "dislike" || (d.rating && d.rating <= 4)) return -1;
  }
  return 0;
}

export type Learned = {
  liked: number; disliked: number;
  /** ×1.0–2.0 from why titles were liked, ×0.6–1.0 from why they were disliked */
  boost: Partial<Record<Aspect, number>>; penalty: Partial<Record<Aspect, number>>;
  /** how strongly what the user has said counts against the community score (0.38–0.8) */
  personal: number;
};
/** The reasons behind likes and dislikes; null while there are none. */
export function learnedTaste(kind: TasteKind = "film"): Learned | null {
  // the reading diary keeps books, the taste diary films; music has no analysed titles
  const diary = kind === "music" ? musicVotes() : store.json<Record<string, any>>(kind === "book" ? "bookDiary" : "diary", {});
  const seen = new Map<string, { vote: number; reasons: Set<Aspect> }>();
  for (const [fk, v] of verdicts(kind)) seen.set(fk, { vote: v.vote === "like" ? 1 : -1, reasons: new Set(v.reasons) });
  // titles with an analysis: their strongest (liked) or weakest (disliked) topics count as reasons too
  for (const e of Object.values(loadAspectScores(kind))) {
    const had = seen.get(e.fk);
    const vote = had?.vote ?? diaryVote(e, diary);
    if (!vote) continue;
    const r = had?.reasons ?? new Set<Aspect>();
    for (const a of ASPECTS) {
      const sc = e.aspects[a];
      if (sc == null) continue;
      if (vote > 0 && sc >= 7.5) r.add(a);
      if (vote < 0 && sc <= 5) r.add(a);
    }
    seen.set(e.fk, { vote, reasons: r });
  }
  const liked = [...seen.values()].filter((x) => x.vote > 0 && x.reasons.size);
  const disliked = [...seen.values()].filter((x) => x.vote < 0 && x.reasons.size);
  if (!liked.length && !disliked.length) return null;
  const boost: Learned["boost"] = {}, penalty: Learned["penalty"] = {};
  for (const a of ASPECTS) {
    const l = liked.filter((x) => x.reasons.has(a)).length, d = disliked.filter((x) => x.reasons.has(a)).length;
    if (l) boost[a] = Math.round((1 + Math.min((l / liked.length) * 1.5, 1)) * 100) / 100;
    if (d) penalty[a] = Math.round(Math.max(0.6, 1 - (d / disliked.length) * 0.5) * 100) / 100;
  }
  const signal = Math.min(1, liked.length * 0.12 + disliked.length * 0.09);
  return { liked: liked.length, disliked: disliked.length, boost, penalty, personal: Math.round((0.38 + Math.min(0.42, signal * 0.42)) * 1000) / 1000 };
}

/** How much a topic counts for the user (0 = left out, 0.6–2.2 otherwise): own weight 35%, likes 65%, dislikes and warnings pull down. */
export function effectiveWeight(a: Aspect, profile: Profile, l: Learned | null): number {
  if (profile.weights[a] === 0) return 0;
  const base = profile.weights[a] / 3;
  const liked = l?.boost[a] ?? base;
  let w = (base * 0.35 + liked * 0.65) * (l?.penalty[a] ?? 1);
  if (profile.avoid.includes(a)) w *= 0.85;
  return Math.round(Math.max(0.6, Math.min(2.2, w)) * 100) / 100;
}
/** The 0-5 weights the learned taste suggests (for "Apply"). */
export const suggestedWeights = (profile: Profile, l: Learned | null) =>
  Object.fromEntries(ASPECTS.map((a) => [a, profile.weights[a] === 0 ? 0 : Math.max(1, Math.min(5, Math.round(effectiveWeight(a, profile, l) * 2.5)))])) as Record<Aspect, number>;

export type Personal = { score: number; base: number; diff: number; notes: { aspect: Aspect; kind: "strong" | "weak" | "warn" }[]; penalty: number };
/** "For you" score: the community score blended with the topics the user cares about (as calculate_personalized_score). */
export function personalScore(base: number | null, aspects: AspectScores, profile: Profile, l = learnedTaste()): Personal | null {
  let sum = 0, w = 0, penalty = 0;
  const notes: Personal["notes"] = [];
  for (const a of ASPECTS) {
    const sc = aspects[a];
    if (sc == null) continue;
    const wt = effectiveWeight(a, profile, l);
    if (!wt) continue;
    sum += sc * wt; w += wt;
    if (wt > 1.2 && sc >= 8) notes.push({ aspect: a, kind: "strong" });
    else if (wt > 1.2 && sc <= 4) notes.push({ aspect: a, kind: "weak" });
    // a topic the user wants to be warned about, scored low
    if (profile.avoid.includes(a) && sc < 5) { penalty += (5 - sc) / 5; notes.push({ aspect: a, kind: "warn" }); }
  }
  if (!w && base == null) return null;
  const topic = w ? sum / w : base!;
  const b = base ?? topic;
  const personal = l?.personal ?? 0.38;
  let score = b * (1 - personal) + topic * personal;
  const cut = Math.min(1.8, penalty * 0.9);
  score = Math.max(0, Math.min(10, score - cut));
  const r = (x: number) => Math.round(x * 10) / 10;
  return { score: r(score), base: r(b), diff: r(score - b), notes, penalty: r(cut) };
}

/** One line for prompts: "values story, pace; cares little about sound". */
export function tasteLine(profile: Profile, l: Learned | null = learnedTaste(), kind: TasteKind = "film"): string {
  const NAMES = NAMES_EN[kind];
  const up = ASPECTS.filter((a) => effectiveWeight(a, profile, l) >= 1.3).map((a) => NAMES[a]);
  const down = ASPECTS.filter((a) => { const w = effectiveWeight(a, profile, l); return w > 0 && w <= 0.8; }).map((a) => NAMES[a]);
  const off = ASPECTS.filter((a) => profile.weights[a] === 0).map((a) => NAMES[a]);
  return [up.length ? "values " + up.join(", ") : "", down.length ? "cares little about " + down.join(", ") : "", off.length ? "ignores " + off.join(", ") : ""].filter(Boolean).join("; ")
    + (l ? ` (from the reasons behind ${l.liked} liked and ${l.disliked} disliked titles)` : "");
}
/** For the assistant's profile: the learned line plus the analysed titles and their topic scores. */
export function tasteForAssistant(kind: TasteKind = "film"): string[] {
  const out: string[] = [];
  const NAMES = NAMES_EN[kind];
  const profile = store.json<Profile | null>(profileKeyOf(kind), null);
  const l = learnedTaste(kind);
  if (profile?.weights || l) { const line = tasteLine(profile?.weights ? { weights: profile.weights, avoid: profile.avoid ?? [] } : { weights: { story: 3, pace: 3, acting: 3, visuals: 3, emotion: 3, sound: 3 }, avoid: [] }, l, kind); if (line) out.push("Taste: " + line); }
  // books and songs the user said why they liked or disliked (films say it in their own analyses)
  if (kind !== "film") {
    const pre = workPrefix(kind);
    try {
      for (let i = 0; i < localStorage.length && out.length < 60; i++) {
        const k = localStorage.key(i);
        if (!k?.startsWith(pre)) continue;
        const w = store.json<any>(k, null);
        const f = w?.feedback;
        if (!w?.title || (f?.vote !== "like" && f?.vote !== "dislike") || !Array.isArray(f.reasons) || !f.reasons.length) continue;
        out.push(`${w.title}: ${f.vote === "like" ? "liked for" : "disliked for"} ${ASPECTS.filter((a) => f.reasons.includes(a)).map((a) => NAMES[a]).join(", ")}`);
      }
    } catch {}
  }
  for (const e of Object.values(loadAspectScores(kind)).sort((a, b) => b.at - a.at).slice(0, 25)) {
    const parts = ASPECTS.filter((a) => e.aspects[a] != null).map((a) => `${NAMES[a]} ${e.aspects[a]}`);
    out.push(`${e.title}${e.year ? ` (${e.year})` : ""}: ${parts.join(", ")}`);
  }
  return out;
}
