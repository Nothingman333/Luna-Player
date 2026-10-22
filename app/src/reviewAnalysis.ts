import { ASPECTS } from "./filmReviewModel";
import type { Aspect, FilmTarget, Mood, Profile } from "./filmReviewModel";

/** The detailed review analysis behind "Worth watching?" › Letterboxd, after the review-analysis
 *  app the user shared: every review is first read in small batches (tone, depth, one-line gist,
 *  what it talks about), then the whole set is summed up — score with reasons, what most reviewers
 *  agree on, where they split, themes, feelings, who it is for. */
export type LbReview = { author: string; stars: number | null; spoiler: boolean; text: string };
export type Tone = "positive" | "mixed" | "negative" | "unclear";
export type ItemTone = "positive" | "mixed" | "negative" | "neutral";
export type Topic = Aspect | "general";
export type ReadItem = { tone: ItemTone; quality: number; gist: string; topic: Topic };
export type Share = { name: string; share: number };
export type Consensus = { point: string; share: number; tone: Tone };
export type AiVerdict = {
  lean: Tone; score: number | null; scoreWhy: string; summary: string; editorNote: string;
  forYou: string; likeIf: string; skipIf: string; praise: string[]; criticism: string[];
  consensus: Consensus[]; debates: string[]; themes: Share[]; emotions: Share[]; audience: string[];
  similar: { title: string; year?: number | null; why: string }[];
  aspects: { aspect: Aspect; tone: Tone; score: number | null; note: string }[];
};
/** One review as kept with the run (text shortened). */
export type RunReview = LbReview & { read: ReadItem | null; best?: boolean; worst?: boolean };
export type AiRun = {
  at: number; url: string; count: number; spoilers: number; stars: number | null; model: string;
  community: number | null; counts: Record<ItemTone, number>; topics: Partial<Record<Topic, number>>;
  verdict: AiVerdict; reviews: RunReview[];
  /** books: 1000Kitap's own score (out of 10) and how many read it */
  siteScore?: number | null; readers?: number | null;
  /** what was analysed (older runs have none) */
  title?: string; year?: string;
};

export const BATCH = 10;
const TONES: Tone[] = ["positive", "mixed", "negative", "unclear"];
const ITEM_TONES: ItemTone[] = ["positive", "mixed", "negative", "neutral"];
const TOPICS: Topic[] = [...ASPECTS, "general"];
const str = (x: unknown, n: number) => (typeof x === "string" ? x.replace(/\s+/g, " ").trim().slice(0, n) : "");
const list = (x: unknown, n = 6, len = 300) => (Array.isArray(x) ? x.map((s) => str(s, len)).filter(Boolean).slice(0, n) : []);
const num = (x: unknown, lo: number, hi: number) => { const v = typeof x === "number" ? x : typeof x === "string" ? Number(x.replace(",", ".")) : NaN; return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : null; };
const tone = (t: unknown): Tone => (TONES.includes(t as Tone) ? (t as Tone) : "unclear");
const shares = (x: unknown): Share[] => (Array.isArray(x) ? x : []).map((s: any) => ({ name: str(s?.name, 60), share: Math.round(num(s?.share, 0, 100) ?? 0) })).filter((s) => s.name && s.share > 0).slice(0, 6);

const ASPECT_EN: Record<Aspect, string> = { story: "story", pace: "pace", acting: "acting", visuals: "visuals", emotion: "characters and emotion", sound: "music and sound" };
/** A book is judged on the same six slots, named for books. */
const ASPECT_BOOK: Record<Aspect, string> = { story: "plot", pace: "pace", acting: "writing style", visuals: "atmosphere and world", emotion: "characters and emotion", sound: "ideas and depth" };
/** Where the reviews come from: films from Letterboxd, books from 1000Kitap. */
export type Medium = "film" | "book";
const site = (m: Medium) => (m === "book" ? "1000Kitap" : "Letterboxd");
const MOOD_EN: Record<Mood, string> = { any: "a general verdict", easy: "pace first", deep: "story and characters", visual: "a visual journey" };
const lang = (tr: boolean) => (tr ? "Turkish" : "English");
const label = (film: FilmTarget, m: Medium = "film") => `${film.title}${film.year ? ` (${String(film.year).slice(0, 4)})` : ""} — ${m === "book" ? "book" : film.kind === "tv" ? "series" : "film"}`;

// ---------- step 1: read each batch ----------
export function batchPrompt(film: FilmTarget, batch: LbReview[], offset: number, tr: boolean, m: Medium = "film") {
  const names = m === "book" ? ASPECT_BOOK : ASPECT_EN;
  const system = [
    `You read ${site(m)} reviews one by one and label each. Judge every review on its own.`,
    "tone: positive = mostly praise (4★ or more and the text agrees); negative = mostly complaints (2★ or less and the text agrees); mixed = clearly names strengths AND weaknesses; neutral = no opinion, a joke or a one-liner with no stance.",
    "A light reservation in a happy review (\"great but a bit long\") stays positive.",
    "quality 1-5: 1 = spam, emoji or a joke; 2 = very short; 3 = an ordinary impression; 4 = gives reasons; 5 = long, analytical, concrete.",
    `topic: what the review mostly talks about: ${ASPECTS.map((a) => `${a} (${names[a]})`).join(" | ")} | general.`,
    `gist: one short sentence in ${lang(tr)} with the review's main point, no spoilers (say how they felt, not what happens).`,
    "best: up to 2 review numbers that explain their view best; worst: up to 2 with the sharpest complaint. A review can't be in both.",
    'Answer with JSON only: {"items":[{"n":1,"tone":"positive|mixed|negative|neutral","quality":3,"topic":"story","gist":"…"}],"best":[1],"worst":[2]}',
  ].join("\n");
  const user = [`Title: ${label(film, m)}`, "", ...batch.map((r, i) => `[${offset + i + 1}]${r.stars ? ` ${r.stars}★` : ""}${r.spoiler ? " (spoiler)" : ""} ${r.text.replace(/\s+/g, " ").slice(0, 2500)}`)].join("\n");
  return { system, user };
}
/** The batch's answer, by review number (only numbers in this batch). */
export function cleanBatch(x: any, offset: number, size: number): { items: Map<number, ReadItem>; best: number[]; worst: number[] } {
  const items = new Map<number, ReadItem>();
  const inBatch = (n: unknown) => typeof n === "number" && Number.isInteger(n) && n > offset && n <= offset + size;
  for (const it of Array.isArray(x?.items) ? x.items : []) {
    if (!inBatch(it?.n) || items.has(it.n)) continue;
    const q = num(it.quality, 1, 5);
    items.set(it.n, { tone: ITEM_TONES.includes(it.tone) ? it.tone : "neutral", quality: q ? Math.round(q) : 2, gist: str(it.gist, 240), topic: TOPICS.includes(it.topic) ? it.topic : "general" });
  }
  const nums = (l: unknown) => (Array.isArray(l) ? l.filter(inBatch).slice(0, 2) as number[] : []);
  const best = nums(x?.best), worst = nums(x?.worst).filter((n) => !best.includes(n));
  return { items, best, worst };
}

// ---------- local numbers ----------
const VALUE: Record<ItemTone, number | null> = { positive: 9, mixed: 5.5, negative: 2, neutral: null };
/** A 0-10 community score: each opinion weighed by its depth, blended with the stars when enough rated. */
export function communityScore(reviews: RunReview[]): number | null {
  let sum = 0, w = 0;
  for (const r of reviews) {
    const v = r.read ? VALUE[r.read.tone] : null;
    if (v == null) continue;
    const wt = 0.5 + r.read!.quality / 2;
    sum += v * wt; w += wt;
  }
  const rated = reviews.filter((r) => r.stars);
  const stars = rated.length ? (rated.reduce((s, r) => s + r.stars!, 0) / rated.length) * 2 : null;
  if (!w) return stars == null ? null : Math.round(stars * 10) / 10;
  const opinion = sum / w;
  return Math.round((stars != null && rated.length >= 5 ? opinion * 0.55 + stars * 0.45 : opinion) * 10) / 10;
}
export function tally(reviews: RunReview[]) {
  const counts: Record<ItemTone, number> = { positive: 0, mixed: 0, negative: 0, neutral: 0 };
  const topics: Partial<Record<Topic, number>> = {};
  for (const r of reviews) if (r.read) { counts[r.read.tone]++; topics[r.read.topic] = (topics[r.read.topic] ?? 0) + 1; }
  return { counts, topics };
}

// ---------- step 2: sum it all up ----------
export function summaryPrompt(film: FilmTarget, reviews: RunReview[], profile: Profile, mood: Mood, note: string, tasteLine: string, tr: boolean, m: Medium = "film") {
  const names = m === "book" ? ASPECT_BOOK : ASPECT_EN;
  const { counts, topics } = tally(reviews);
  const rated = reviews.filter((r) => r.stars);
  const avg = rated.length ? (rated.reduce((s, r) => s + r.stars!, 0) / rated.length).toFixed(1) : "";
  const system = [
    `You are an experienced ${m === "book" ? "literary" : "film"} critic. Below is what each of a title's ${site(m)} reviews says, already labelled.`,
    "Use only what these reviews say; add no facts, plot details or awards they don't mention. Never reveal spoilers.",
    `Write every text field in ${lang(tr)}: concrete, close to what reviewers actually said ("reviewers single out the long final shot…"), not generic labels.`,
    "score 0-10, calibrated: 5 ordinary, 6 above average, 7 a liked, solid title, 8 very good with clear strengths, 8.5+ only truly exceptional, 9+ a masterpiece. Most titles land 5.5-7.5. Use the star average as a reference, then weigh repeated complaints.",
    "consensus: the 3-6 opinions that MOST reviewers share (praise or complaint), each with the rough share of reviews that say it (0-100) and its tone.",
    "debates: 0-3 points where reviewers clearly split, each as one sentence naming both sides.",
    "themes / emotions: up to 5 each, specific to this title, shares adding up to about 100.",
    "editorNote: one sharp, unexpected critic's observation (can be negative), not a summary.",
    `aspects: only the ones reviewers talk about (${ASPECTS.map((a) => `${a} = ${names[a]}`).join(", ")}); score 0-10 or null; tone unclear when they disagree.`,
    "forYou: 2-3 sentences for this viewer, using their priorities, warnings and learned taste.",
    note ? "The viewer's extra instruction: " + note : "",
    "Answer with JSON only:",
    '{"lean":"positive|mixed|negative|unclear","score":7.1,"scoreWhy":"2-3 sentences: what pulls the score up and down","summary":"5-7 sentences","editorNote":"…","forYou":"…","likeIf":"one sentence","skipIf":"one sentence","praise":["1-2 sentences each, up to 5"],"criticism":["up to 5"],"consensus":[{"point":"…","share":60,"tone":"positive"}],"debates":["…"],"themes":[{"name":"…","share":40}],"emotions":[{"name":"…","share":50}],"audience":["who it is for, up to 3"],"similar":[{"title":"a title reviewers mention or that is clearly alike","year":1995,"why":"one sentence"}],"aspects":[{"aspect":"story|pace|acting|visuals|emotion|sound","tone":"positive|mixed|negative|unclear","score":7,"note":"one sentence"}]}',
  ].filter(Boolean).join("\n");
  const prefs = ASPECTS.map((a) => `${names[a]}: ${profile.weights[a]}/5${profile.avoid.includes(a) ? " (warn me if criticised)" : ""}`).join(", ");
  const topicLine = Object.entries(topics).sort((a, b) => b[1]! - a[1]!).map(([t, n]) => `${t} ${n}`).join(", ");
  const user = [
    `Title: ${label(film, m)}`,
    `${reviews.length} reviews · positive ${counts.positive}, mixed ${counts.mixed}, negative ${counts.negative}, no stance ${counts.neutral}${avg ? ` · star average ${avg}/5 from ${rated.length}` : ""}`,
    topicLine ? `Most talked about: ${topicLine}` : "",
    `What this viewer cares about (0 = not at all, 5 = a lot): ${prefs}`,
    m === "book" ? "" : `Today they want: ${MOOD_EN[mood]}`,
    tasteLine ? `Learned from the films they liked and disliked: ${tasteLine}` : "",
    "",
    "Each review (number, stars, tone, depth 1-5, topic: gist):",
    ...reviews.map((r, i) => r.read ? `[${i + 1}]${r.stars ? ` ${r.stars}★` : ""} ${r.read.tone} q${r.read.quality} ${r.read.topic}: ${r.read.gist}` : `[${i + 1}]${r.stars ? ` ${r.stars}★` : ""} (not labelled) ${r.text.replace(/\s+/g, " ").slice(0, 200)}`),
    "",
    "The most telling reviews in full:",
    ...reviews.map((r, i) => (r.best || r.worst ? `[${i + 1}]${r.best ? " (best argued)" : " (sharpest complaint)"} ${r.text.replace(/\s+/g, " ").slice(0, 1500)}` : "")).filter(Boolean).slice(0, 10),
  ].filter((x) => x !== "").join("\n");
  return { system, user };
}

/** The model's answer, kept only in the expected shape (a stored copy is cleaned the same way). */
export function cleanVerdict(x: any): AiVerdict | null {
  if (!x || typeof x !== "object") return null;
  const aspects = (Array.isArray(x.aspects) ? x.aspects : [])
    .filter((a: any) => a && ASPECTS.includes(a.aspect))
    .map((a: any) => { const sc = num(a.score, 0, 10); return { aspect: a.aspect as Aspect, tone: tone(a.tone), score: sc == null ? null : Math.round(sc * 10) / 10, note: str(a.note, 400) }; })
    .filter((a: any, i: number, all: any[]) => all.findIndex((b) => b.aspect === a.aspect) === i);
  const sc = num(x.score, 0, 10);
  const v: AiVerdict = {
    lean: tone(x.lean), score: sc == null ? null : Math.round(sc * 10) / 10, scoreWhy: str(x.scoreWhy, 600),
    summary: str(x.summary, 1600), editorNote: str(x.editorNote, 300), forYou: str(x.forYou, 700), likeIf: str(x.likeIf, 400), skipIf: str(x.skipIf, 400),
    praise: list(x.praise, 5, 400), criticism: list(x.criticism, 5, 400),
    consensus: (Array.isArray(x.consensus) ? x.consensus : []).map((c: any) => ({ point: str(c?.point, 300), share: Math.round(num(c?.share, 0, 100) ?? 0), tone: tone(c?.tone) })).filter((c: Consensus) => c.point).slice(0, 6),
    debates: list(x.debates, 3, 400), themes: shares(x.themes), emotions: shares(x.emotions), audience: list(x.audience, 3, 200),
    similar: (Array.isArray(x.similar) ? x.similar : []).map((s: any) => ({ title: str(s?.title, 100), year: num(s?.year, 1880, 2100), why: str(s?.why, 250) })).filter((s: { title: string }) => s.title).slice(0, 4),
    aspects,
  };
  return v.summary ? v : null;
}
function cleanRead(x: any): ReadItem | null {
  if (!x || typeof x !== "object") return null;
  return { tone: ITEM_TONES.includes(x.tone) ? x.tone : "neutral", quality: Math.round(num(x.quality, 1, 5) ?? 2), gist: str(x.gist, 240), topic: TOPICS.includes(x.topic) ? x.topic : "general" };
}
export function cleanRun(x: any): AiRun | null {
  const verdict = cleanVerdict(x?.verdict);
  if (!verdict || typeof x.at !== "number") return null;
  const reviews: RunReview[] = (Array.isArray(x.reviews) ? x.reviews : []).slice(0, 100).map((r: any) => ({
    author: str(r?.author, 60), stars: num(r?.stars, 0.5, 5), spoiler: !!r?.spoiler, text: typeof r?.text === "string" ? r.text.slice(0, 3000) : "",
    read: cleanRead(r?.read), best: !!r?.best, worst: !!r?.worst,
  })).filter((r: RunReview) => r.text);
  const t = tally(reviews);
  return {
    at: x.at, url: str(x.url, 300), count: Number(x.count) || reviews.length, spoilers: Number(x.spoilers) || 0, stars: num(x.stars, 0, 5), model: str(x.model, 120),
    community: num(x.community, 0, 10), counts: reviews.length ? t.counts : { positive: 0, mixed: 0, negative: 0, neutral: 0 }, topics: t.topics, verdict, reviews,
    siteScore: num(x.siteScore, 0, 10), readers: typeof x.readers === "number" ? x.readers : null,
    title: str(x.title, 200) || undefined, year: str(x.year, 4) || undefined,
  };
}
/** What a run keeps of each review (long ones up to 3000 characters). */
export const keepReview = (r: RunReview): RunReview => ({ ...r, text: r.text.length > 3000 ? r.text.slice(0, 2997) + "…" : r.text });
