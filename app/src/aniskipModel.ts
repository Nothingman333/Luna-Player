/**
 * Known opening and ending times for anime (AniSkip's community data, https://api.aniskip.com, found through the
 * show's MyAnimeList id from AniList). A wrong match would skip the wrong minute of a film, so the match is strict:
 * the title must agree, the season must be explicit, and the answer's episode length must be the length of the file.
 * Pure.
 */
import type { Segment } from "./segmentModel";

export type Cand = { idMal?: number | null; title?: { romaji?: string | null; english?: string | null; native?: string | null }; format?: string | null; episodes?: number | null; seasonYear?: number | null };

const SUFFIX = /\b(?:2160p|1080p|720p|480p|web-?dl|web-?rip|bluray|bdrip|hevc|x26[45]|10bit|aac|multi|dual)\b.*$/i;
/** A file's show title as one would type it into a search: no groups, years, quality or season words. */
export function animeQuery(title: string): string {
  return String(title ?? "").replace(/\[[^\]]*\]|\([^)]*\)/g, " ").replace(SUFFIX, " ").replace(/\b(?:s\d{1,2}|season\s*\d+|\d+(?:st|nd|rd|th)\s+season)\b/gi, " ").replace(/[._]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
}

const fold = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const words = (s: string) => new Set(fold(s).split(" ").filter((w) => w.length > 1));
const ORD = ["", "1st", "2nd", "3rd"];
/** Does a title name season `n` explicitly ("Season 2", "2nd Season", "Part 2" is NOT enough: cours differ)? */
export function mentionsSeason(title: string, n: number): boolean {
  const t = fold(title);
  const ord = n <= 3 ? ORD[n] : `${n}th`;
  return new RegExp(`\\bseason ${n}\\b|\\b${ord} season\\b|\\bs${n}\\b`).test(t);
}
const anySeason = (title: string) => /\bseason \d+\b|\b\d+(?:st|nd|rd|th) season\b|\bfinal season\b/.test(fold(title));

function similarity(query: string, c: Cand): number {
  const q = words(query);
  if (!q.size) return 0;
  let best = 0;
  for (const t of [c.title?.romaji, c.title?.english]) {
    if (!t) continue;
    const w = words(t);
    const inter = [...q].filter((x) => w.has(x)).length;
    best = Math.max(best, inter / Math.max(q.size, Math.min(w.size, q.size + 2)));
  }
  return best;
}

/** MyAnimeList ids to try for a file, best first (at most 3). Season 1 takes entries without a season word; later seasons only entries that name the season. */
export function pickMal(cands: Cand[], o: { title: string; season?: number; episode?: number }): number[] {
  const season = o.season && o.season > 1 ? o.season : 1;
  const ok = cands.filter((c) => c.idMal && ["TV", "TV_SHORT", "ONA"].includes(c.format ?? "") && (!o.episode || !c.episodes || o.episode <= c.episodes));
  const scored = ok.map((c) => {
    const names = [c.title?.romaji ?? "", c.title?.english ?? ""];
    const seasonOk = season > 1 ? names.some((n) => mentionsSeason(n, season)) : !names.some(anySeason);
    return { c, sim: similarity(o.title, c), seasonOk };
  }).filter((x) => x.seasonOk && x.sim >= 0.5);
  scored.sort((a, b) => b.sim - a.sim || (a.c.seasonYear ?? 9999) - (b.c.seasonYear ?? 9999));
  return [...new Set(scored.map((x) => x.c.idMal!))].slice(0, 3);
}

export const skipUrl = (mal: number, episode: number, duration: number) =>
  `https://api.aniskip.com/v2/skip-times/${mal}/${episode}?types=op&types=ed&types=recap&types=mixed-op&types=mixed-ed&episodeLength=${Math.round(duration)}`;

const KIND: Record<string, Segment["kind"]> = { op: "intro", "mixed-op": "intro", ed: "credits", "mixed-ed": "credits", recap: "recap" };
const ORDER = ["op", "ed", "recap", "mixed-op", "mixed-ed"];
/** AniSkip's answer as skippable parts of a file lasting `duration` seconds; anything odd is dropped. */
export function parseSkipTimes(json: unknown, duration: number): Segment[] {
  const res = (json as { found?: boolean; results?: unknown[] })?.results;
  if (!(duration > 60) || !Array.isArray(res)) return [];
  const out: { seg: Segment; order: number }[] = [];
  for (const r of res as { interval?: { startTime?: number; endTime?: number }; skipType?: string; episodeLength?: number }[]) {
    const kind = r?.skipType ? KIND[r.skipType] : undefined;
    const a = Number(r?.interval?.startTime), b = Number(r?.interval?.endTime), len = Number(r?.episodeLength);
    if (!kind || !Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b - a < 5 || b - a > 300 || a >= duration - 5) continue;
    if (Number.isFinite(len) && len > 0 && Math.abs(len - duration) > 15) continue;
    out.push({ seg: { kind, start: Math.max(0, a), end: Math.min(b, duration), source: "aniskip" }, order: ORDER.indexOf(r.skipType!) });
  }
  // "mixed" openings and endings are the fallback for episodes that have no plain one
  const has = (t: string) => out.some((x) => x.order === ORDER.indexOf(t));
  return out.filter((x) => !(x.order === ORDER.indexOf("mixed-op") && has("op")) && !(x.order === ORDER.indexOf("mixed-ed") && has("ed"))).sort((x, y) => x.order - y.order).map((x) => x.seg);
}

/** The user's own marks (chapter names, a marked intro) win: community times are kept only for kinds the file has no segment of. */
export function preferOwn(own: Segment[], community: Segment[]): Segment[] {
  return community.filter((c) => !own.some((o) => o.kind === c.kind));
}
