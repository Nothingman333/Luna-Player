// Luna's film taste engine, the pure part: no network, no storage, no React.
// Everything here is deterministic, so it can be checked in Node (scripts/taste-core-test.mjs).
//
// What it does:
//  - reads the user's own Letterboxd export (watched, ratings, diary, reviews, likes, watchlist)
//    and a Letterboxd RSS feed, and merges them into Luna's taste diary without overwriting what
//    the user changed in Luna;
//  - turns the diary into a taste model: every genre, theme (TMDB keyword), director, writer,
//    actor, decade, language, country and length gets a weight learned from the user's ratings;
//  - scores any film against that model (match %, expected stars, the reasons);
//  - measures how well the model predicts the user's own ratings (k-fold, Spearman and AUC);
//  - reads the user's own reviews (what they talk about, what they praise and criticise);
//  - compares the user with friends (Pearson on films both rated) and spreads picks out (MMR).

export type Kind = "movie" | "tv";

// ---------------------------------------------------------------- keys and small helpers
/** Same normalisation as Taste.tsx's seenKey. */
export const seenKey = (t: string) => t.trim().toLocaleLowerCase("tr");
const stripYear = (t: string) => t.replace(/\s*\((\d{4})\)\s*$/, "");
/** Same key as Taste.tsx's dKey: "title|year". */
export function diaryKey(title: string, year?: string): string {
  return seenKey(stripYear(title)) + "|" + (year ?? (title.match(/\((\d{4})\)\s*$/)?.[1] ?? ""));
}
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const DAY = 86400000;
/** "2024-05-31" → ms (UTC noon, so time zones never move it to another day). */
export function isoDay(s: string | undefined): number | undefined {
  const m = s?.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return undefined;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3], 12);
  const date=new Date(t);return date.getUTCFullYear()===+m[1]&&date.getUTCMonth()===+m[2]-1&&date.getUTCDate()===+m[3]?t:undefined;
}

/** Rows of a CSV text (quotes, doubled quotes and line breaks inside quotes handled). */
export function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (q) {
      if (c === '"' && csv[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && csv[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// ---------------------------------------------------------------- the user's own Letterboxd
/** One film as Letterboxd knows it for the user. Stars are 0.5–5. */
export type LbEntry = {
  title: string; year?: string; uri?: string;
  stars?: number; liked?: boolean;
  /** latest watched date (ms) */
  watched?: number;
  /** how many diary entries (viewings) and how many of them were rewatches */
  logs?: number; rewatches?: number;
  review?: string; tags?: string[];
  watchlist?: boolean;
  /** TMDB id when the source carries it (RSS does, the export doesn't) */
  tmdbId?: number; kind?: Kind;
  spoiler?: boolean;
};
export type LbExport = { films: LbEntry[]; watchlist: LbEntry[]; files: string[]; skipped: string[] };

type Table = { head: string[]; rows: string[][] };
/** The film table of one export CSV: the last header row that has Name and Year. */
function table(text: string): Table | null {
  const rows = parseCsv(text.replace(/^\uFEFF/, ""));
  let h = -1;
  rows.forEach((r, i) => {
    const low = r.map((c) => c.trim().toLowerCase());
    if (low.includes("name") && low.includes("year")) h = i;
  });
  if (h < 0) return null;
  return { head: rows[h].map((c) => c.trim().toLowerCase()), rows: rows.slice(h + 1).filter((r) => r.some((c) => c.trim())) };
}
const col = (t: Table, r: string[], name: string) => {
  const i = t.head.indexOf(name);
  return i >= 0 ? (r[i] ?? "").trim() : "";
};
const yes = (s: string) => /^(yes|true|1)$/i.test(s.trim());
const starsOf = (s: string) => {
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? clamp(Math.round(n * 2) / 2, 0.5, 5) : undefined;
};
const tagsOf = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

/** Reads every CSV of a Letterboxd data export (Settings › Data › Export your data).
 *  `files` are [path inside the zip, text] pairs, as Luna's read_export returns them. */
export function readLbExport(files: [string, string][]): LbExport {
  const films = new Map<string, LbEntry>();
  const watchlist: LbEntry[] = [];
  const used: string[] = [], skipped: string[] = [];
  const get = (t: Table, r: string[]): LbEntry | null => {
    const title = col(t, r, "name");
    if (!title) return null;
    const year = col(t, r, "year") || undefined;
    const k = diaryKey(title, year);
    let e = films.get(k);
    if (!e) { e = { title, year }; films.set(k, e); }
    const uri = col(t, r, "letterboxd uri");
    if (uri && !e.uri) e.uri = uri;
    return e;
  };
  // ratings.csv holds the current rating; diary/review ratings are older snapshots, so it goes last
  const order = (n: string) => (/(^|\/)ratings\.csv$/.test(n) ? 2 : /(^|\/)(diary|reviews)\.csv$/.test(n) ? 1 : 0);
  const sorted = [...files].map(([n, t]) => [n.replace(/\\/g, "/").toLowerCase(), t] as [string, string]).sort((a, b) => order(a[0]) - order(b[0]));
  for (const [name, text] of sorted) {
    // deleted and orphaned entries are not the user's current history
    if (/(^|\/)(deleted|orphaned)\//.test(name)) { skipped.push(name); continue; }
    const base = name.split("/").pop() ?? name;
    const t = table(text);
    if (!t) { skipped.push(name); continue; }
    if (/(^|\/)likes\/films\.csv$/.test(name)) {
      for (const r of t.rows) { const e = get(t, r); if (e) e.liked = true; }
    } else if (base === "watchlist.csv") {
      for (const r of t.rows) {
        const title = col(t, r, "name");
        if (title) watchlist.push({ title, year: col(t, r, "year") || undefined, uri: col(t, r, "letterboxd uri") || undefined, watchlist: true });
      }
    } else if (base === "watched.csv") {
      for (const r of t.rows) { const e = get(t, r); if (e) e.watched = Math.max(e.watched ?? 0, isoDay(col(t, r, "date")) ?? 0) || undefined; }
    } else if (base === "ratings.csv") {
      for (const r of t.rows) { const e = get(t, r); const s = starsOf(col(t, r, "rating")); if (e && s) e.stars = s; }
    } else if (base === "diary.csv" || base === "reviews.csv") {
      for (const r of t.rows) {
        const e = get(t, r);
        if (!e) continue;
        const day = isoDay(col(t, r, "watched date")) ?? isoDay(col(t, r, "date"));
        if (base === "diary.csv") {
          e.logs = (e.logs ?? 0) + 1;
          if (yes(col(t, r, "rewatch"))) e.rewatches = (e.rewatches ?? 0) + 1;
        }
        if (day && day >= (e.watched ?? 0)) {
          e.watched = day;
          const s = starsOf(col(t, r, "rating"));
          if (s && e.stars == null) e.stars = s;
        } else if (e.stars == null) e.stars = starsOf(col(t, r, "rating"));
        const tags = tagsOf(col(t, r, "tags"));
        if (tags.length) e.tags = [...new Set([...(e.tags ?? []), ...tags])];
        const review = col(t, r, "review");
        if (review) {
          // several reviews of one film: the newest first, all kept
          e.review = e.review ? (day && day >= (e.watched ?? 0) ? review + "\n\n" + e.review : e.review + "\n\n" + review) : review;
        }
      }
    } else { skipped.push(name); continue; }
    used.push(name);
  }
  return { films: [...films.values()], watchlist, files: used, skipped };
}

// ---------------------------------------------------------------- RSS (anyone's latest 50 entries)
const unxml = (s: string) => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0*39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, "&");
const tag = (item: string, name: string) => {
  const m = item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? unxml(m[1]).trim() : "";
};
/** Plain text of an RSS description: paragraphs kept, the poster and "Watched on …" line dropped. */
export function reviewText(html: string): { text: string; spoiler: boolean } {
  const paras = [...html.matchAll(/<p>([\s\S]*?)<\/p>/g)].map((m) => m[1]);
  const list = (paras.length ? paras : [html])
    .map((p) => unxml(p.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")).replace(/[ \t]+/g, " ").trim())
    .filter((p) => p && !/^(watched|rewatched|added) on /i.test(p));
  const spoiler = list.some((p) => /^this review may contain spoilers\.?$/i.test(p));
  return { text: list.filter((p) => !/^this review may contain spoilers\.?$/i.test(p)).join("\n\n"), spoiler };
}
/** The diary entries of a Letterboxd RSS feed (letterboxd.com/USER/rss/). Lists are left out. */
export function parseLbRss(xml: string): LbEntry[] {
  const out: LbEntry[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const it = m[1];
    const title = tag(it, "letterboxd:filmTitle");
    if (!title) continue; // a list, not a film
    const movie = Number(tag(it, "tmdb:movieId")), tv = Number(tag(it, "tmdb:tvId"));
    const { text, spoiler } = reviewText(tag(it, "description"));
    out.push({
      title, year: tag(it, "letterboxd:filmYear") || undefined, uri: tag(it, "link") || undefined,
      stars: starsOf(tag(it, "letterboxd:memberRating")), liked: yes(tag(it, "letterboxd:memberLike")),
      watched: isoDay(tag(it, "letterboxd:watchedDate")), logs: 1, rewatches: yes(tag(it, "letterboxd:rewatch")) ? 1 : 0,
      review: text || undefined, spoiler: spoiler || undefined,
      tmdbId: movie > 0 ? movie : tv > 0 ? tv : undefined, kind: movie > 0 ? "movie" : tv > 0 ? "tv" : undefined,
    });
  }
  return out;
}

// ---------------------------------------------------------------- merging into Luna's diary
/** The fields of Taste.tsx's DiaryEntry this module reads and writes. */
export type DiaryLike = {
  title: string; year?: string; watched?: number; vote?: "like" | "dislike"; rating?: number; note?: string;
  genres?: string[]; at: number;
  review?: string; tags?: string[]; rewatch?: number; lb?: string;
  /** the rating last brought in from Letterboxd: when the diary still has it, the user didn't change it in Luna */
  lbr?: number;
};
export type MergeResult = { diary: Record<string, DiaryLike>; added: number; updated: number; reviews: number; rated: number };

/** Puts Letterboxd's entries into the diary. Letterboxd fills what is missing; a rating it brought in
 *  earlier is updated, a rating the user set in Luna is kept. Nothing is ever deleted. */
export function mergeIntoDiary(diary: Record<string, DiaryLike>, films: LbEntry[], now = Date.now()): MergeResult {
  const d: Record<string, DiaryLike> = { ...diary };
  const byTitle = new Map<string, string[]>();
  for (const k of Object.keys(d)) {
    const t = seenKey(d[k].title);
    byTitle.set(t, [...(byTitle.get(t) ?? []), k]);
  }
  let added = 0, updated = 0, reviews = 0, rated = 0;
  for (const f of films) {
    const exact = diaryKey(f.title, f.year);
    const k = d[exact] ? exact : (byTitle.get(seenKey(f.title)) ?? []).find((x) => !d[x].year || !f.year || d[x].year === f.year) ?? exact;
    const cur = d[k];
    const rating = f.stars ? Math.round(f.stars * 2) : undefined;
    if (!cur) {
      if (!f.stars && !f.liked && !f.watched && !f.logs && !f.review) continue;
      const e: DiaryLike = { title: f.title, year: f.year, at: f.watched ?? now, watched: f.watched ?? now };
      if (rating) { e.rating = rating; e.lbr = rating; rated++; }
      if (f.liked) e.vote = "like";
      if (f.review) { e.review = f.review; reviews++; }
      if (f.tags?.length) e.tags = f.tags;
      if (f.rewatches) e.rewatch = f.rewatches;
      if (f.uri) e.lb = f.uri;
      d[k] = e;
      byTitle.set(seenKey(f.title), [...(byTitle.get(seenKey(f.title)) ?? []), k]);
      added++;
      continue;
    }
    const e: DiaryLike = { ...cur };
    let changed = false;
    const set = <K extends keyof DiaryLike>(key: K, v: DiaryLike[K]) => { if (e[key] !== v) { e[key] = v; changed = true; } };
    if (f.year && !e.year) set("year", f.year);
    if (rating && (e.rating == null || e.rating === e.lbr) && e.rating !== rating) { set("rating", rating); set("lbr", rating); rated++; }
    else if (rating && e.lbr !== rating && e.rating === rating) set("lbr", rating);
    if (f.liked && !e.vote) set("vote", "like");
    if (f.watched && f.watched > (e.watched ?? 0)) set("watched", f.watched);
    else if (!e.watched && (f.logs || f.stars || f.liked)) set("watched", f.watched ?? now);
    if (f.review && f.review !== e.review && (!e.review || e.review.length < f.review.length || f.review.indexOf(e.review) >= 0)) { set("review", f.review); reviews++; }
    if (f.tags?.length) { const t = [...new Set([...(e.tags ?? []), ...f.tags])]; if (t.length !== (e.tags ?? []).length) set("tags", t); }
    if (f.rewatches && f.rewatches > (e.rewatch ?? 0)) set("rewatch", f.rewatches);
    if (f.uri && !e.lb) set("lb", f.uri);
    if (changed) { d[k] = e; updated++; }
  }
  return { diary: d, added, updated, reviews, rated };
}

// ---------------------------------------------------------------- film features (from TMDB)
/** What a film is made of, compact (ids, not names: names live in a separate dictionary). */
export type Feat = {
  t: string; y?: number; g: number[]; k: number[]; d: number[]; w: number[]; a: number[];
  l?: string; c: string[]; rt?: number; va?: number; vc?: number; pop?: number; p?: string | null;
};
export type FeatType = "g" | "k" | "d" | "w" | "a" | "y" | "l" | "c" | "r";
export const FEAT_TYPES: FeatType[] = ["g", "k", "d", "w", "a", "y", "l", "c", "r"];
/** How much each kind of feature counts in a match, and how much evidence it needs before it is trusted. */
export const TYPE_WEIGHT: Record<FeatType, number> = { g: 0.55, k: 1, d: 1.35, w: 0.9, a: 0.6, y: 0.35, l: 0.45, c: 0.35, r: 0.2 };
const SHRINK: Record<FeatType, number> = { g: 4, k: 3, d: 1.5, w: 2, a: 2.5, y: 4, l: 4, c: 4, r: 6 };
export const decadeOf = (y?: number) => (y ? Math.floor(y / 10) * 10 : undefined);
export const lengthOf = (rt?: number) => (!rt ? undefined : rt < 95 ? "short" : rt <= 135 ? "mid" : "long");
/** Every feature of a film as "type:value" keys. */
export function featKeys(f: Feat): string[] {
  const out: string[] = [];
  for (const x of f.g) out.push("g:" + x);
  for (const x of f.k) out.push("k:" + x);
  for (const x of f.d) out.push("d:" + x);
  for (const x of f.w) if (!f.d.includes(x)) out.push("w:" + x);
  for (const x of f.a) out.push("a:" + x);
  const dec = decadeOf(f.y);
  if (dec) out.push("y:" + dec);
  if (f.l) out.push("l:" + f.l);
  for (const x of f.c.slice(0, 2)) out.push("c:" + x);
  const len = lengthOf(f.rt);
  if (len) out.push("r:" + len);
  return out;
}
const typeOf = (key: string) => key.slice(0, 1) as FeatType;

// ---------------------------------------------------------------- signals
export type RatingStats = { n: number; mean: number; sd: number; hist: number[]; q: number[] };
/** Mean, spread, a 10-bucket histogram (½★ … 5★) and 21 quantiles of the user's ratings (1–10). */
export function ratingStats(ratings: number[]): RatingStats {
  const n = ratings.length;
  const mean = n ? ratings.reduce((s, x) => s + x, 0) / n : 7;
  const sd = n > 1 ? Math.sqrt(ratings.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1)) : 1.6;
  const hist = Array.from({ length: 10 }, () => 0);
  for (const r of ratings) hist[clamp(Math.round(r) - 1, 0, 9)]++;
  const sorted = [...ratings].sort((a, b) => a - b);
  const q = Array.from({ length: 21 }, (_, i) => (n ? sorted[Math.min(n - 1, Math.round((i / 20) * (n - 1)))] : 7));
  return { n, mean, sd: Math.max(1, sd), hist, q };
}
/** How strongly one diary entry says "more like this" (+) or "less like this" (−); null when it says nothing. */
export function signalOf(e: DiaryLike, st: RatingStats): number | null {
  let s: number | null = null;
  if (e.rating) {
    s = clamp((e.rating - st.mean) / st.sd, -2.5, 2.5);
    if (e.vote === "like") s = Math.max(s, 0) + 0.35;
    if (e.vote === "dislike") s = Math.min(s, 0) - 0.35;
  } else if (e.vote === "like") s = 0.9;
  else if (e.vote === "dislike") s = -1.2;
  else if (e.watched) s = 0.12; // chose to watch it: a weak "yes"
  if (s != null && e.rewatch) s += Math.min(2, e.rewatch) * 0.3;
  return s;
}
/** Older entries count a little less (taste moves slowly): half weight after 4 years, never below 0.35. */
export const recency = (when: number | undefined, now = Date.now()) =>
  when ? Math.max(0.35, Math.pow(0.5, Math.max(0, now - when) / (4 * 365 * DAY))) : 0.6;

// ---------------------------------------------------------------- the model
export type Sample = { key: string; sig: number; w: number; rating?: number; feat: Feat };
export type FeatStat = { s: number; n: number; r: number; rn: number };
export type TasteModel = {
  v: 1; at: number;
  /** feature key → [score, evidence, sum of ratings, rated count] */
  f: Record<string, [number, number, number, number]>;
  stats: RatingStats;
  /** out-of-fold raw scores of rated films, as 21 quantiles: turns a raw score into a percentile */
  cal: number[];
  acc: { rho: number | null; auc: number | null; n: number };
  films: number; rated: number;
};
function accumulate(samples: Sample[]): Map<string, FeatStat> {
  const m = new Map<string, FeatStat>();
  for (const s of samples) {
    for (const k of featKeys(s.feat)) {
      let x = m.get(k);
      if (!x) { x = { s: 0, n: 0, r: 0, rn: 0 }; m.set(k, x); }
      x.s += s.sig * s.w; x.n += s.w;
      if (s.rating) { x.r += s.rating; x.rn++; }
    }
  }
  return m;
}
const scoreOf = (k: string, x: FeatStat) => x.s / (x.n + SHRINK[typeOf(k)]);
type Scores = (k: string) => number | undefined;
/** Raw match of a film: per kind of feature, the average known score (unknown ones pull towards 0). */
export function rawScore(feat: Feat, score: Scores): number {
  const sum: Partial<Record<FeatType, [number, number]>> = {};
  for (const k of featKeys(feat)) {
    const v = score(k);
    if (v === undefined) continue;
    const t = typeOf(k);
    const cur = sum[t] ?? [0, 0];
    sum[t] = [cur[0] + v, cur[1] + 1];
  }
  let raw = 0;
  for (const t of FEAT_TYPES) { const x = sum[t]; if (x) raw += TYPE_WEIGHT[t] * (x[0] / (x[1] + 1)); }
  return raw;
}
function quantiles(xs: number[], n = 21): number[] {
  const s = [...xs].sort((a, b) => a - b);
  return Array.from({ length: n }, (_, i) => (s.length ? s[Math.min(s.length - 1, Math.round((i / (n - 1)) * (s.length - 1)))] : 0));
}
/** Spearman rank correlation. */
export function spearman(a: number[], b: number[]): number | null {
  if (a.length < 5) return null;
  const rank = (x: number[]) => {
    const idx = x.map((v, i) => [v, i] as [number, number]).sort((p, q) => p[0] - q[0]);
    const r = new Array<number>(x.length);
    for (let i = 0; i < idx.length;) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
      for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2;
      i = j + 1;
    }
    return r;
  };
  return pearson(rank(a), rank(b));
}
export function pearson(a: number[], b: number[]): number | null {
  const n = a.length;
  if (n < 3) return null;
  const ma = a.reduce((s, x) => s + x, 0) / n, mb = b.reduce((s, x) => s + x, 0) / n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
  return saa && sbb ? sab / Math.sqrt(saa * sbb) : null;
}
/** Probability that a random liked film scores above a random disliked one (0.5 = guessing). */
export function auc(pos: number[], neg: number[]): number | null {
  if (pos.length < 3 || neg.length < 3) return null;
  const all = [...pos.map((v) => [v, 1]), ...neg.map((v) => [v, 0])].sort((a, b) => a[0] - b[0]);
  let rankSum = 0;
  for (let i = 0; i < all.length;) {
    let j = i;
    while (j + 1 < all.length && all[j + 1][0] === all[i][0]) j++;
    const r = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) if (all[k][1]) rankSum += r;
    i = j + 1;
  }
  return (rankSum - (pos.length * (pos.length + 1)) / 2) / (pos.length * neg.length);
}
/** Builds the taste model. Accuracy and calibration come from 5-fold cross validation, so the
 *  percentages describe films the model has not seen. */
export function buildModel(samples: Sample[], stats: RatingStats, now = Date.now(), folds = 5): TasteModel {
  const rated = samples.filter((s) => s.rating);
  const oof: { raw: number; s: Sample }[] = [];
  if (rated.length >= 10) {
    for (let f = 0; f < folds; f++) {
      const test = rated.filter((_, i) => i % folds === f);
      const testKeys = new Set(test.map((s) => s.key));
      const m = accumulate(samples.filter((s) => !testKeys.has(s.key)));
      const sc: Scores = (k) => { const x = m.get(k); return x ? scoreOf(k, x) : undefined; };
      for (const s of test) oof.push({ raw: rawScore(s.feat, sc), s });
    }
  }
  const full = accumulate(samples);
  // keep what carries information: features seen twice or more, and strong single ones
  const f: TasteModel["f"] = {};
  const entries = [...full.entries()].map(([k, x]) => [k, x, scoreOf(k, x)] as [string, FeatStat, number])
    .filter(([, x, sc]) => x.n >= 1.5 || Math.abs(sc) >= 0.12)
    .sort((a, b) => Math.abs(b[2]) - Math.abs(a[2])).slice(0, 6000);
  for (const [k, x, sc] of entries) f[k] = [Math.round(sc * 1000) / 1000, Math.round(x.n * 100) / 100, x.r, x.rn];
  const hi = stats.q[14], lo = stats.q[6];
  const pos = oof.filter((o) => (o.s.rating ?? 0) >= hi && o.s.rating! > stats.q[10]).map((o) => o.raw);
  const neg = oof.filter((o) => (o.s.rating ?? 99) <= lo && o.s.rating! < stats.q[10]).map((o) => o.raw);
  return {
    v: 1, at: now, f, stats,
    cal: quantiles(oof.length ? oof.map((o) => o.raw) : samples.map((s) => rawScore(s.feat, (k) => (f[k] ? f[k][0] : undefined)))),
    acc: { rho: spearman(oof.map((o) => o.raw), oof.map((o) => o.s.rating!)), auc: auc(pos, neg), n: oof.length },
    films: samples.length, rated: rated.length,
  };
}

// ---------------------------------------------------------------- matching a film
export type Reason = { key: string; type: FeatType; v: number };
export type Match = { pct: number; stars: number; raw: number; known: number; plus: Reason[]; minus: Reason[] };
/** Where a raw score sits among the model's calibration quantiles, 0–1 (linear between them). */
export function percentile(cal: number[], raw: number): number {
  if (!cal.length) return 0.5;
  if (raw <= cal[0]) return 0;
  if (raw >= cal[cal.length - 1]) return 1;
  for (let i = 1; i < cal.length; i++) {
    if (raw <= cal[i]) {
      const span = cal[i] - cal[i - 1];
      return (i - 1 + (span > 0 ? (raw - cal[i - 1]) / span : 0.5)) / (cal.length - 1);
    }
  }
  return 1;
}
/** Match of a film against the model: percentile among the user's own films, the stars the user would
 *  likely give (same percentile of their own rating spread) and the features that pushed it up or down. */
export function matchFilm(model: TasteModel, feat: Feat): Match {
  const score: Scores = (k) => (model.f[k] ? model.f[k][0] : undefined);
  const raw = rawScore(feat, score);
  const per: Partial<Record<FeatType, number>> = {};
  for (const k of featKeys(feat)) if (score(k) !== undefined) per[typeOf(k)] = (per[typeOf(k)] ?? 0) + 1;
  const reasons: Reason[] = [];
  for (const k of featKeys(feat)) {
    const v = score(k);
    if (v === undefined) continue;
    const t = typeOf(k);
    reasons.push({ key: k, type: t, v: (TYPE_WEIGHT[t] * v) / ((per[t] ?? 0) + 1) });
  }
  const p = percentile(model.cal, raw);
  const qi = p * (model.stats.q.length - 1), lo = Math.floor(qi), hi = Math.min(model.stats.q.length - 1, lo + 1);
  const rating = model.stats.q[lo] + (model.stats.q[hi] - model.stats.q[lo]) * (qi - lo);
  const known = Object.values(per).reduce((s, n) => s + (n ?? 0), 0);
  return {
    pct: Math.round(p * 100), stars: Math.round(rating) / 2, raw, known,
    plus: reasons.filter((r) => r.v > 0.01).sort((a, b) => b.v - a.v).slice(0, 4),
    minus: reasons.filter((r) => r.v < -0.01).sort((a, b) => a.v - b.v).slice(0, 3),
  };
}

/** The strongest features of each kind, both ways. `min` is the evidence (weighted films) needed. */
export function topFeatures(model: TasteModel, type: FeatType, n = 8, min = 2): { plus: [string, number, number, number | null][]; minus: [string, number, number, number | null][] } {
  const all = Object.entries(model.f).filter(([k, x]) => typeOf(k) === type && x[1] >= min)
    .map(([k, x]) => [k, x[0], x[1], x[3] ? Math.round((x[2] / x[3]) * 10) / 10 : null] as [string, number, number, number | null]);
  return {
    plus: all.filter((x) => x[1] > 0.02).sort((a, b) => b[1] - a[1]).slice(0, n),
    minus: all.filter((x) => x[1] < -0.02).sort((a, b) => a[1] - b[1]).slice(0, n),
  };
}

// ---------------------------------------------------------------- quality, diversity
/** IMDb-style weighted rating: few votes pull towards the prior. */
export const bayes = (va = 0, vc = 0, prior = 6.6, weight = 400) => (va * vc + prior * weight) / (vc + weight);
export function jaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const sa = new Set(a);
  let inter = 0;
  const sb = new Set(b);
  for (const x of sb) if (sa.has(x)) inter++;
  return inter / (sa.size + sb.size - inter);
}
/** Maximal marginal relevance: picks `k` items, each the best trade-off between its own score and
 *  how different it is from what is already picked (λ = 1: score only). */
export function mmr<T>(items: T[], score: (t: T) => number, sim: (a: T, b: T) => number, k: number, lambda = 0.72): T[] {
  const left = [...items], out: T[] = [];
  while (out.length < k && left.length) {
    let best = 0, bestV = -Infinity;
    left.forEach((it, i) => {
      const maxSim = out.length ? Math.max(...out.map((o) => sim(it, o))) : 0;
      const v = lambda * score(it) - (1 - lambda) * maxSim;
      if (v > bestV) { bestV = v; best = i; }
    });
    out.push(left.splice(best, 1)[0]);
  }
  return out;
}

// ---------------------------------------------------------------- friends
export type Compat = { n: number; r: number | null; pct: number | null; agree: string[]; split: string[] };
/** How alike two people rate: Pearson on the films both rated, shrunk towards 0 when there are few. */
export function compat(mine: Map<string, number>, theirs: Map<string, number>, names: Map<string, string> = new Map()): Compat {
  const a: number[] = [], b: number[] = [], keys: string[] = [];
  for (const [k, v] of theirs) { const m = mine.get(k); if (m != null) { a.push(m / 2); b.push(v); keys.push(k); } }
  const r = pearson(a, b);
  const shrunk = r == null ? null : (r * a.length) / (a.length + 8);
  const diff = keys.map((k, i) => [k, Math.abs(a[i] - b[i]), a[i] + b[i]] as [string, number, number]);
  const label = (k: string) => names.get(k) ?? k.split("|")[0];
  return {
    n: a.length, r: shrunk == null ? null : Math.round(shrunk * 100) / 100,
    pct: shrunk == null ? null : Math.round(((shrunk + 1) / 2) * 100),
    agree: diff.filter((d) => d[1] <= 0.5 && d[2] >= 7).sort((x, y) => y[2] - x[2]).slice(0, 5).map((d) => label(d[0])),
    split: diff.filter((d) => d[1] >= 2).sort((x, y) => y[1] - x[1]).slice(0, 5).map((d) => label(d[0])),
  };
}

// ---------------------------------------------------------------- the user's own reviews
export const ASPECTS = ["story", "acting", "visuals", "sound", "pace", "emotion", "ending", "direction", "humor"] as const;
export type Aspect = (typeof ASPECTS)[number];
// "=x" exact word, "x*" word starting with x (Turkish suffixes), plain: exact
const ASPECT_TERMS: Record<Aspect, string[]> = {
  story: ["senaryo*", "hikaye*", "hikâye*", "öykü*", "konu*", "kurgu*", "olay*", "plot*", "story", "stories", "script*", "screenplay*", "writing", "written", "narrative*", "premise"],
  acting: ["oyuncu*", "oyunculu*", "performans*", "=rol", "rolü*", "acting", "actor*", "actress*", "performance*", "cast", "casting"],
  visuals: ["görüntü*", "görsel*", "sinematograf*", "kamera*", "çekim*", "renk*", "ışık*", "kadraj*", "cinematograph*", "visual*", "shot*", "frame*", "camera*", "colou*", "lighting", "photograph*"],
  sound: ["müzik*", "=ses", "sesi*", "soundtrack*", "=score", "music*", "sound*"],
  pace: ["tempo*", "ritim*", "ritmi*", "temposu*", "yavaş*", "uzun", "uzundu", "pacing", "=pace", "paced", "slow*", "runtime", "drag*", "long"],
  emotion: ["duygu*", "ağla*", "dokunak*", "hüzün*", "etkiledi*", "emotion*", "=cry", "cried", "crying", "moving", "heartbreak*", "tears", "touching"],
  ending: ["=son", "=sonu", "sonunu", "sonuyla", "final*", "ending*", "=twist", "=end", "climax"],
  direction: ["yönetmen*", "yönetim*", "reji*", "director*", "direction", "directed", "directing", "filmmaking"],
  humor: ["komik*", "güldür*", "mizah*", "espri*", "kahkaha*", "funny", "humo*", "laugh*", "joke*", "hilarious", "comedy"],
};
const POS = ["harika", "muhteşem", "mükemmel", "güzel*", "iyi", "iyiydi", "başarılı*", "etkileyici*", "sevdim", "bayıldım", "şahane", "efsane*", "enfes", "çarpıcı*", "büyüleyici*", "başyapıt*", "kusursuz*", "eğlenceli*", "keyifli*", "akıcı*", "sürükleyici*", "nefis", "olağanüstü*", "dahice", "zekice", "great", "amazing", "brilliant*", "beautiful*", "perfect*", "masterpiece*", "stunning*", "loved", "love", "excellent*", "gorgeous*", "incredible*", "fantastic*", "best", "wonderful*", "compelling", "gripping", "fun", "superb*", "phenomenal*", "breathtaking", "flawless", "delight*", "enjoy*", "good", "strong"];
const NEG = ["kötü*", "berbat*", "sıkıcı*", "sıkıldım", "vasat*", "zayıf*", "gereksiz*", "saçma*", "abartı*", "rezalet*", "kırıklığı*", "sevmedim", "beğenmedim", "sığ", "klişe*", "yorucu*", "boş", "boştu", "anlamsız*", "bad", "boring", "bored", "awful", "terrible", "weak*", "dull", "mess*", "worst", "hate*", "overrated", "bland", "cliché*", "cliche*", "predictable", "tedious", "forgettable", "disappoint*", "shallow", "waste*", "pointless", "lazy", "annoying", "cringe*"];
const NEGATORS_AFTER = new Set(["değil", "değildi", "değilmiş", "yok", "yoktu"]);
const NEGATORS_BEFORE = new Set(["not", "no", "never", "hardly", "hiç", "pek"]);
const STOP = new Set(("ve ile ama bir bu şu o da de çok daha en için gibi kadar ki mi mı mu mü ne ben sen biz siz onlar beni bana benim filmi film filmde filmin filme diye olan oldu olarak sonra önce her şey hiç yine bile artık ise ya veya hem zaten sadece neden nasıl şey şeyi fakat ancak var yok değil " +
  "the and a an of to is in it that this was for with as on but be are have has had not you i my me so at by from or they he she his her their its film movie just really one about all what when who out up more some like would can if which there been also than very much even into only no").split(" "));
const term = (t: string, w: string) => (t.startsWith("=") ? w === t.slice(1) : t.endsWith("*") ? w.startsWith(t.slice(0, -1)) && t.length > 3 : w === t);
const hits = (terms: string[], w: string) => terms.some((t) => term(t, w));
export const tokens = (s: string) => s.toLocaleLowerCase("tr").replace(/n['’]t\b/g, " not").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
/** Sentiment of one sentence: positive and negative words, flipped by a nearby negation. */
export function polarity(words: string[]): number {
  let p = 0;
  words.forEach((w, i) => {
    const v = hits(POS, w) ? 1 : hits(NEG, w) ? -1 : 0;
    if (!v) return;
    const flipped = words.slice(Math.max(0, i - 3), i).some((x) => NEGATORS_BEFORE.has(x)) || words.slice(i + 1, i + 3).some((x) => NEGATORS_AFTER.has(x));
    p += flipped ? -v : v;
  });
  return p;
}
export type AspectStat = { aspect: Aspect; mentions: number; pos: number; neg: number; share: number; ratingWhenPraised: number | null; ratingWhenCriticised: number | null };
export type ReviewInsight = {
  n: number; words: number; avgLen: number; turkish: number;
  aspects: AspectStat[];
  /** words the user uses a lot that set their reviews apart */
  vocab: [string, number][];
  /** sentiment of each review against its rating: do words and stars agree? */
  toneVsRating: number | null;
  /** short positive/negative sentences quoted from the user's own reviews, per aspect */
  quotes: Partial<Record<Aspect, { pos?: string; neg?: string }>>;
};
/** Reads the user's own reviews (text + rating out of 10). Local and free: no AI needed. */
export function analyseReviews(reviews: { text: string; rating?: number }[]): ReviewInsight {
  const per = new Map<Aspect, { m: number; p: number; n: number; rp: number[]; rn: number[] }>(ASPECTS.map((a) => [a, { m: 0, p: 0, n: 0, rp: [], rn: [] }]));
  const df = new Map<string, number>(), tf = new Map<string, number>();
  const tone: number[] = [], stars: number[] = [];
  const quotes: ReviewInsight["quotes"] = {};
  let words = 0, turkish = 0;
  for (const r of reviews) {
    const text = r.text.trim();
    if (!text) continue;
    if (/[ğışİçöüÇÖÜĞŞ]/.test(text)) turkish++;
    let total = 0;
    const seen = new Set<string>();
    for (const sentence of text.split(/(?<=[.!?…])\s+|\n+/)) {
      const ws = tokens(sentence);
      if (!ws.length) continue;
      words += ws.length;
      const p = polarity(ws);
      total += p;
      for (const a of ASPECTS) {
        if (!ws.some((w) => hits(ASPECT_TERMS[a], w))) continue;
        const x = per.get(a)!;
        x.m++;
        if (p > 0) { x.p++; if (r.rating) x.rp.push(r.rating); }
        if (p < 0) { x.n++; if (r.rating) x.rn.push(r.rating); }
        const q = sentence.trim();
        if (q.length >= 12 && q.length <= 140) {
          const slot = (quotes[a] ??= {});
          if (p > 0 && !slot.pos) slot.pos = q;
          if (p < 0 && !slot.neg) slot.neg = q;
        }
      }
      for (const w of ws) {
        if (w.length < 4 || STOP.has(w) || /^\d+$/.test(w)) continue;
        tf.set(w, (tf.get(w) ?? 0) + 1);
        if (!seen.has(w)) { seen.add(w); df.set(w, (df.get(w) ?? 0) + 1); }
      }
    }
    if (r.rating) { tone.push(total); stars.push(r.rating); }
  }
  const n = reviews.filter((r) => r.text.trim()).length;
  const avg = (l: number[]) => (l.length ? Math.round((l.reduce((s, x) => s + x, 0) / l.length) * 10) / 10 : null);
  const aspects = ASPECTS.map((a) => {
    const x = per.get(a)!;
    return { aspect: a, mentions: x.m, pos: x.p, neg: x.n, share: n ? Math.round((x.m / n) * 100) / 100 : 0, ratingWhenPraised: avg(x.rp), ratingWhenCriticised: avg(x.rn) };
  }).sort((a, b) => b.mentions - a.mentions);
  // a word used in many reviews but not in nearly all of them
  const vocab = [...tf.entries()].filter(([w]) => (df.get(w) ?? 0) >= 2)
    .map(([w, c]) => [w, c * Math.log(1 + n / (df.get(w) ?? 1))] as [string, number])
    .sort((a, b) => b[1] - a[1]).slice(0, 18).map(([w, s]) => [w, Math.round(s * 10) / 10] as [string, number]);
  return { n, words, avgLen: n ? Math.round(words / n) : 0, turkish, aspects, vocab, toneVsRating: pearson(tone, stars), quotes };
}

// ---------------------------------------------------------------- text for the assistant
/** A few lines the chat assistant gets about the model (the names are looked up by the caller). */
export function digest(model: TasteModel, name: (k: string) => string): string {
  const line = (t: FeatType, label: string, n: number) => {
    const { plus, minus } = topFeatures(model, t, n, t === "g" || t === "y" ? 3 : 2);
    const p = plus.map((x) => name(x[0])).filter(Boolean), m = minus.slice(0, 3).map((x) => name(x[0])).filter(Boolean);
    return p.length || m.length ? `- ${label}: ${p.join(", ") || "—"}${m.length ? ` | sevmediği: ${m.join(", ")}` : ""}` : "";
  };
  const st = model.stats;
  return [
    `- ${model.films} film, ${model.rated} puanlı; ortalama ${(st.mean / 2).toFixed(1)}★, sapma ${(st.sd / 2).toFixed(1)}★` +
      (model.acc.rho != null ? `; model isabeti ρ=${model.acc.rho.toFixed(2)}` : ""),
    line("g", "Türler", 5), line("k", "Temalar", 8), line("d", "Yönetmenler", 6), line("w", "Senaristler", 4),
    line("a", "Oyuncular", 6), line("y", "Dönemler", 3), line("l", "Diller", 3),
  ].filter(Boolean).join("\n");
}
