/**
 * Luna Özet: the year (or the last 30 days, or all time) in films, music and books, worked out
 * from what Luna already keeps on this computer. Nothing is sent anywhere. Pure.
 */
export type Period = "year" | "month" | "all";
export type RecapFilm = { key: string; title: string; year?: string; poster?: string | null; genres: string[]; runtime: number; at: number };
export type RecapRating = { title: string; at: number; rating?: number; vote?: string; genres?: string[] };
export type RecapListen = { at: number; title: string; artist?: string; cover?: string | null; duration?: number };
export type RecapRead = { title: string; at: number; pct: number };
export type RecapInput = { now: number; films: RecapFilm[]; ratings: RecapRating[]; listens: RecapListen[]; reads: RecapRead[] };
export type Persona = "night-owl" | "marathoner" | "bookworm" | "melomane" | "critic" | "explorer" | "dreamer";

export type Recap = {
  period: Period; from: number; to: number;
  films: { count: number; minutes: number; genres: [string, number][]; posters: string[]; longest: { title: string; runtime: number } | null; bingeDay: { date: string; count: number } | null };
  ratings: { rated: number; avg: number | null; likes: number; loved: { title: string; rating: number }[] };
  music: { listens: number; minutes: number; artists: [string, number][]; songs: { title: string; artist?: string; n: number }[]; hours: number[]; peakHour: number | null; covers: string[] };
  books: { finished: number; titles: string[] };
  days: Record<string, number>;
  streak: number;
  busiest: { date: string; count: number } | null;
  totalMinutes: number;
  persona: Persona;
  empty: boolean;
};

const DAY = 86400000;
export function periodStart(p: Period, now: number): number {
  if (p === "year") return new Date(new Date(now).getFullYear(), 0, 1).getTime();
  if (p === "month") return now - 30 * DAY;
  return 0;
}
/** Local calendar day of a time, as yyyy-mm-dd. */
export const dayKey = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

function count<T>(list: T[], key: (x: T) => string | undefined): Map<string, number> {
  const m = new Map<string, number>();
  for (const x of list) { const k = key(x)?.trim(); if (k) m.set(k, (m.get(k) ?? 0) + 1); }
  return m;
}
const ranked = (m: Map<string, number>, n: number) => [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);

/** Longest run of consecutive days present in `days` (keys yyyy-mm-dd). */
export function longestStreak(days: string[]): number {
  const set = new Set(days);
  let best = 0;
  for (const d of set) {
    const [y, m, dd] = d.split("-").map(Number);
    const prev = dayKey(new Date(y, m - 1, dd - 1).getTime());
    if (set.has(prev)) continue; // not the start of a run
    let n = 1, t = new Date(y, m - 1, dd);
    for (;;) { t = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1); if (!set.has(dayKey(t.getTime()))) break; n++; }
    best = Math.max(best, n);
  }
  return best;
}

export function buildRecap(input: RecapInput, period: Period): Recap {
  const from = periodStart(period, input.now), to = input.now;
  const inside = (t: number | undefined) => typeof t === "number" && t >= from && t <= to;
  // ---- films (finished in the period; one entry per title)
  const seen = new Set<string>();
  const films = input.films.filter((f) => inside(f.at)).sort((a, b) => b.at - a.at).filter((f) => !seen.has(f.key) && !!seen.add(f.key));
  const genres = ranked(count(films.flatMap((f) => f.genres.map((g) => ({ g }))), (x) => x.g), 6);
  const longest = films.filter((f) => f.runtime > 0).sort((a, b) => b.runtime - a.runtime)[0];
  const filmDays = ranked(count(films, (f) => dayKey(f.at)), 1)[0];
  // ---- ratings (diary)
  const rated = input.ratings.filter((r) => inside(r.at));
  const withStars = rated.filter((r) => typeof r.rating === "number" && r.rating > 0);
  const avg = withStars.length ? Math.round((withStars.reduce((s, r) => s + r.rating!, 0) / withStars.length) * 10) / 10 : null;
  const loved = withStars.filter((r) => r.rating! >= 4).sort((a, b) => b.rating! - a.rating! || b.at - a.at).slice(0, 3).map((r) => ({ title: r.title, rating: r.rating! }));
  // ---- music
  const listens = input.listens.filter((l) => inside(l.at));
  const hours = Array.from({ length: 24 }, () => 0);
  for (const l of listens) hours[new Date(l.at).getHours()]++;
  const peak = listens.length ? hours.indexOf(Math.max(...hours)) : null;
  const songCount = count(listens, (l) => l.title + "\u0000" + (l.artist ?? ""));
  const songs = ranked(songCount, 5).map(([k, n]) => { const [title, artist] = k.split("\u0000"); return { title, artist: artist || undefined, n }; });
  const covers = [...new Set(listens.map((l) => l.cover).filter((c): c is string => !!c))].slice(0, 8);
  const musicMinutes = Math.round(listens.reduce((s, l) => s + (l.duration && l.duration > 0 ? Math.min(l.duration, 1800) : 210), 0) / 60);
  // ---- books
  const doneBooks = input.reads.filter((r) => inside(r.at) && r.pct >= 0.99);
  // ---- days with anything
  const days: Record<string, number> = {};
  const mark = (t: number) => { const k = dayKey(t); days[k] = (days[k] ?? 0) + 1; };
  films.forEach((f) => mark(f.at)); listens.forEach((l) => mark(l.at)); input.reads.filter((r) => inside(r.at)).forEach((r) => mark(r.at));
  const busiest = Object.entries(days).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  const filmMinutes = films.reduce((s, f) => s + Math.max(0, f.runtime || 0), 0);
  const recap: Recap = {
    period, from, to,
    films: { count: films.length, minutes: filmMinutes, genres, posters: [...new Set(films.map((f) => f.poster).filter((p): p is string => !!p))].slice(0, 12), longest: longest ? { title: longest.title, runtime: longest.runtime } : null, bingeDay: filmDays ? { date: filmDays[0], count: filmDays[1] } : null },
    ratings: { rated: rated.length, avg, likes: rated.filter((r) => r.vote === "like").length, loved },
    music: { listens: listens.length, minutes: musicMinutes, artists: ranked(count(listens, (l) => l.artist), 5), songs, hours, peakHour: peak, covers },
    books: { finished: doneBooks.length, titles: doneBooks.sort((a, b) => b.at - a.at).map((b) => b.title).slice(0, 6) },
    days, streak: longestStreak(Object.keys(days)), busiest: busiest ? { date: busiest[0], count: busiest[1] } : null,
    totalMinutes: filmMinutes + musicMinutes,
    persona: "dreamer",
    empty: !films.length && !listens.length && !doneBooks.length && !rated.length,
  };
  recap.persona = personaOf(recap, [...films.map((f) => f.at), ...listens.map((l) => l.at)]);
  return recap;
}

/** A playful one-word portrait of the period; the first rule that fits wins. */
export function personaOf(r: Recap, times: number[]): Persona {
  const late = times.filter((t) => { const h = new Date(t).getHours(); return h >= 23 || h < 5; }).length;
  if (times.length >= 20 && late / times.length >= 0.4) return "night-owl";
  if (r.films.count >= 20 || (r.films.bingeDay?.count ?? 0) >= 3) return "marathoner";
  if (r.books.finished >= 5) return "bookworm";
  if (r.music.listens >= 300) return "melomane";
  if (r.ratings.rated >= 25) return "critic";
  if (r.films.genres.length >= 6 && r.films.count >= 8) return "explorer";
  return "dreamer";
}

/** Weeks (columns of 7 days, Monday first) for the heat map, ending with the week of `to`. */
export function heatWeeks(days: Record<string, number>, to: number, weeks: number): { date: string; n: number; future: boolean }[][] {
  const end = new Date(to);
  const monday = new Date(end.getFullYear(), end.getMonth(), end.getDate() - ((end.getDay() + 6) % 7));
  const out: { date: string; n: number; future: boolean }[][] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const col: { date: string; n: number; future: boolean }[] = [];
    for (let d = 0; d < 7; d++) {
      const t = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - w * 7 + d).getTime();
      const k = dayKey(t);
      col.push({ date: k, n: days[k] ?? 0, future: t > to });
    }
    out.push(col);
  }
  return out;
}
