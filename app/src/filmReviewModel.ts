/** Local, transparent review workspace. No network requests or invented model scores. */
export const ASPECTS = ["story", "pace", "acting", "visuals", "emotion", "sound"] as const;
export type Aspect = typeof ASPECTS[number];
export type Medium = "movie" | "tv";
export type Mood = "any" | "easy" | "deep" | "visual";
export type FilmTarget = { title: string; year?: string | number; kind?: string; id?: number; rating?: number };
export type Review = { text: string; source: string };
export type Evidence = { review: number; excerpt: string; sentiment: "positive" | "negative" | "unclear" };
export type AspectResult = { aspect: Aspect; evidence: Evidence[]; positive: number; negative: number };
export type Analysis = { id: string; at: number; reviews: Review[]; aspects: AspectResult[]; method: "keywords-v1" };
export type Profile = { weights: Record<Aspect, number>; avoid: Aspect[] };
export type Feedback = { vote: "like" | "dislike" | "none"; reasons: Aspect[]; note: string };
export type Workspace = { history: Analysis[]; feedback: Feedback; draft: string };
export const freshProfile = (): Profile => ({ weights: { story: 3, pace: 3, acting: 3, visuals: 3, emotion: 3, sound: 3 }, avoid: [] });
export const freshWorkspace = (): Workspace => ({ history: [], feedback: { vote: "none", reasons: [], note: "" }, draft: "" });
const object = (x: unknown): Record<string, unknown> => x && typeof x === "object" && !Array.isArray(x) ? x as Record<string, unknown> : {};
const aspectsOnly = (x: unknown): Aspect[] => Array.isArray(x) ? ASPECTS.filter(a => x.includes(a)) : [];
export const normalizeText = (s: string) => s.normalize("NFKC").toLocaleLowerCase("tr").normalize("NFKD").replace(/\p{M}/gu, "").replace(/ı/g, "i");
export function filmKey(f: FilmTarget): string {
  const kind = f.kind === "tv" ? "tv" : "movie";
  // Unidentified films are separate by release year; movie and TV IDs never share a key.
  return kind + ":" + (Number.isSafeInteger(f.id) && f.id! > 0 ? "tmdb:" + f.id : "title:" + encodeURIComponent(normalizeText(f.title).trim()) + ":" + (f.year ?? ""));
}
export function cleanProfile(input: unknown): Profile {
  const x = object(input), weights = object(x.weights), result = freshProfile();
  for (const a of ASPECTS) if (typeof weights[a] === "number" && Number.isFinite(weights[a])) result.weights[a] = Math.max(0, Math.min(5, Math.round(weights[a] as number)));
  result.avoid = aspectsOnly(x.avoid); return result;
}
export function parseReviews(raw: string, json = false): Review[] {
  if (raw.length > 120000) throw new Error("size");
  let rows: unknown[];
  if (json) {
    const parsed: unknown = JSON.parse(raw.replace(/^\uFEFF/, ""));
    const list = Array.isArray(parsed) ? parsed : object(parsed).reviews;
    if (!Array.isArray(list)) throw new Error("format");
    rows = list;
  } else rows = raw.split(/\r?\n\s*\r?\n/).filter(s => s.trim());
  return reviewRows(rows);
}
function reviewRows(rows: unknown[]): Review[] {
  if (!rows.length || rows.length > 200) throw new Error("count");
  const seen = new Set<string>(), out: Review[] = []; let size = 0;
  for (const row of rows) {
    const x = typeof row === "string" ? { text: row } : object(row);
    if (typeof x.text !== "string" || !x.text.trim() || x.text.length > 4000 || (x.source !== undefined && (typeof x.source !== "string" || x.source.length > 200))) throw new Error("review");
    size += x.text.length + (typeof x.source === "string" ? x.source.length : 0);
    if (size > 120000) throw new Error("size");
    const text = x.text.trim(), signature = normalizeText(text).replace(/\s+/g, " ");
    if (seen.has(signature)) continue;
    seen.add(signature); out.push({ text, source: typeof x.source === "string" ? x.source.trim() : "" });
  }
  return out;
}
const topic: Record<Aspect, RegExp> = {
  story: /\b(hikaye\w*|senaryo\w*|kurgu\w*|story\w*|plot\w*|script\w*)\b/,
  pace: /\b(tempo\w*|ritim\w*|pace\w*|pacing|yavas\w*|slow\w*)\b/,
  acting: /\b(oyuncu\w*|performans\w*|acting|actor\w*|performance\w*)\b/,
  visuals: /\b(gorsel\w*|sinematografi\w*|visual\w*|cinematograph\w*|photography)\b/,
  emotion: /\b(duyg\w*|karakter\w*|emotion\w*|character\w*)\b/,
  sound: /\b(muzik\w*|ses\w*|sound\w*|music\w*)\b/,
};
const positive = /\b(iyi|guzel\w*|harika\w*|etkileyici\w*|basarili\w*|sevdim|mukemmel\w*|great|good|excellent|beautiful|impressive|loved)\b/;
const negative = /\b(kotu\w*|sikici\w*|basarisiz\w*|zayif\w*|sevmedim|berbat\w*|bad|boring|poor|awful|weak|hated)\b/;
const uncertain = /\b(degil\w*|degildi\w*|ama|fakat|ancak|yok|not|never|no|but|although|isn.t|wasn.t|don.t|didn.t)\b/;
export function analyzeReviews(reviews: Review[], at = Date.now()): Analysis {
  // Validate before analysis too; callers cannot bypass import limits.
  const checked = reviewRows(reviews);
  const results: AspectResult[] = ASPECTS.map(aspect => ({ aspect, evidence: [], positive: 0, negative: 0 }));
  checked.forEach((review, index) => {
    // A review counts at most once per aspect, regardless of repeated keywords/sentences.
    const sentences = review.text.match(/[^.!?。！？\n]+[.!?。！？]?/g) ?? [review.text];
    for (const result of results) {
      const matches = sentences.filter(s => topic[result.aspect].test(normalizeText(s)));
      if (!matches.length) continue;
      const sentiments = matches.map(s => {
        const n = normalizeText(s), p = positive.test(n), m = negative.test(n);
        return uncertain.test(n) || p === m ? "unclear" : p ? "positive" : "negative";
      });
      const sentiment = sentiments.every(s => s === "positive") ? "positive" : sentiments.every(s => s === "negative") ? "negative" : "unclear";
      const excerpt = matches[0].trim().slice(0, 280);
      result.evidence.push({ review: index, excerpt, sentiment });
      if (sentiment === "positive") result.positive++;
      if (sentiment === "negative") result.negative++;
    }
  });
  return { id: crypto.randomUUID(), at, reviews: checked, aspects: results, method: "keywords-v1" };
}
export function cleanWorkspace(input: unknown): Workspace {
  const x = object(input), result = freshWorkspace(), f = object(x.feedback);
  result.feedback = { vote: f.vote === "like" || f.vote === "dislike" ? f.vote : "none", reasons: aspectsOnly(f.reasons), note: typeof f.note === "string" ? f.note.slice(0, 2000) : "" };
  result.draft = typeof x.draft === "string" ? x.draft.slice(0, 6000) : "";
  // Recompute derived fields from reviews; imported/stored scores and evidence aren't trusted.
  if (Array.isArray(x.history)) for (const row of x.history.slice(0, 8)) {
    const h = object(row);
    if (h.method !== "keywords-v1" || typeof h.at !== "number" || !Number.isFinite(h.at)) continue;
    if (!Array.isArray(h.reviews)) continue;
    try { const a = analyzeReviews(reviewRows(h.reviews), h.at); a.id = typeof h.id === "string" ? h.id.slice(0, 80) : a.id; result.history.push(a); } catch { /* leave malformed history out */ }
  }
  return result;
}
export function personalFit(a: Analysis | undefined, profile: Profile, mood: Mood) {
  if (!a) return { score: null, covered: 0, caution: [] as Aspect[] };
  let total = 0, weight = 0, covered = 0;
  const caution: Aspect[] = [];
  for (const r of a.aspects) {
    const n = r.positive + r.negative;
    if (!n) continue;
    const emphasis = mood === "easy" && r.aspect === "pace" || mood === "deep" && (r.aspect === "story" || r.aspect === "emotion") || mood === "visual" && r.aspect === "visuals";
    const w = profile.weights[r.aspect] * (emphasis ? 1.5 : 1);
    if (w > 0) { total += r.positive / n * w; weight += w; covered++; }
    if (profile.avoid.includes(r.aspect) && r.negative > 0) caution.push(r.aspect);
  }
  // Positive/negative keyword ratio is a rough signal, NOT a movie rating or probability.
  return { score: weight && covered >= 2 ? Math.round(total / weight * 100) : null, covered, caution };
}
export function addAnalysis(workspace: Workspace, reviews: Review[]): Workspace {
  return { ...workspace, history: [analyzeReviews(reviews), ...workspace.history].slice(0, 8) };
}
