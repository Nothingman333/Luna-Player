/** "What should I watch tonight?": a film from your own library that fits the time you have and the mood you're in. Pure. */
export type Mood = "any" | "tense" | "light" | "deep" | "epic" | "heart";
export type Candidate = { key: string; title: string; kind: "movie" | "tv"; runtime: number; genres: string[]; rating: number; poster: string | null; backdrop: string | null; path: string; episode?: string; order: number };
export type Reason = { kind: "time" | "mood" | "rating" | "waiting" | "episode"; value: string | number };
export type Pick = { pick: Candidate; reasons: Reason[]; others: Candidate[] };

/** Genre names TMDB uses in Turkish and English (lower case) for each mood. */
export const MOOD_GENRES: Record<Exclude<Mood, "any">, string[]> = {
  tense: ["gerilim", "korku", "gizem", "suç", "thriller", "horror", "mystery", "crime"],
  light: ["komedi", "animasyon", "aile", "müzik", "comedy", "animation", "family", "music"],
  deep: ["dram", "tarih", "belgesel", "savaş", "drama", "history", "documentary", "war"],
  epic: ["aksiyon", "macera", "bilim-kurgu", "bilim kurgu", "fantastik", "vahşi batı", "action", "adventure", "science fiction", "fantasy", "western", "action & adventure", "sci-fi & fantasy", "aksiyon & macera", "bilim kurgu & fantazi"],
  heart: ["romantik", "aile", "dram", "romance", "family", "drama"],
};

export function moodMatch(genres: string[], mood: Mood): boolean {
  if (mood === "any") return true;
  const want = MOOD_GENRES[mood];
  return genres.some((g) => want.includes(g.toLocaleLowerCase("tr").trim()));
}

/** Deterministic 0–1 noise from a seed and a key (so "another one" changes the order, tests stay stable). */
export function noise(seed: number, key: string): number {
  let h = 2166136261 ^ seed;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}

/** How well a runtime fits the minutes available: 1 for a snug fit, less for a short one, 0 when it clearly doesn't fit. */
export function timeFit(runtime: number, minutes: number): number {
  if (!(minutes > 0)) return 0.6;
  if (!(runtime > 0)) return 0.45; // unknown length: possible, not preferred
  if (runtime > minutes * 1.08) return 0;
  return 1 - Math.min(0.6, ((minutes - Math.min(runtime, minutes)) / minutes) * 0.8);
}

export function pickTonight(cands: Candidate[], o: { minutes: number; mood: Mood; seed: number; avoid?: string[] }): Pick | null {
  const avoid = new Set(o.avoid ?? []);
  const scored = cands
    .map((c) => {
      const fit = timeFit(c.runtime, o.minutes);
      const mood = moodMatch(c.genres, o.mood) ? 1 : 0;
      const score = fit * 0.38 + (o.mood === "any" ? 0.5 : mood) * 0.34 + Math.min(1, Math.max(0, c.rating / 10)) * 0.16 + noise(o.seed, c.key) * 0.12 - (avoid.has(c.key) ? 1 : 0);
      return { c, fit, mood, score };
    })
    .filter((x) => x.fit > 0 && (o.mood === "any" || x.mood > 0))
    .sort((a, b) => b.score - a.score);
  if (!scored.length) return null;
  const best = scored[0];
  const reasons: Reason[] = [];
  if (best.c.episode) reasons.push({ kind: "episode", value: best.c.episode });
  if (best.c.runtime > 0) reasons.push({ kind: "time", value: best.c.runtime });
  if (o.mood !== "any") reasons.push({ kind: "mood", value: o.mood });
  if (best.c.rating >= 7) reasons.push({ kind: "rating", value: Math.round(best.c.rating * 10) / 10 });
  const oldest = Math.max(...cands.map((c) => c.order));
  if (best.c.order >= oldest * 0.7 && cands.length > 4) reasons.push({ kind: "waiting", value: 0 });
  return { pick: best.c, reasons, others: scored.slice(1, 4).map((x) => x.c) };
}
