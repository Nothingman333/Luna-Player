/** "Upcoming episodes" for the shows in the library, from TMDB's next_episode_to_air. Pure. */
export type NextEp = { season: number; episode: number; name: string; date: string };
export type Upcoming = NextEp & { key: string; title: string; poster: string | null; days: number };

/** TMDB's /tv/{id} answer → its next episode, or null (ended shows, no date yet, malformed). */
export function parseNext(tv: unknown): NextEp | null {
  const n = (tv as { next_episode_to_air?: Record<string, unknown> | null })?.next_episode_to_air;
  if (!n || typeof n !== "object") return null;
  const date = String(n.air_date ?? ""), season = Number(n.season_number), episode = Number(n.episode_number);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(season) || !Number.isInteger(episode) || episode < 1) return null;
  return { season, episode, name: String(n.name ?? "").slice(0, 200), date };
}

/** Whole calendar days from `now` (local date) to the air date; 0 = today, negative = already out. */
export function daysUntil(date: string, now: Date): number {
  const [y, m, d] = date.split("-").map(Number);
  const a = Date.UTC(y, m - 1, d), b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((a - b) / 86400000);
}

export type CalendarGroup = "today" | "tomorrow" | "week" | "later";
/** Upcoming episodes sorted by date and put into today / tomorrow / this week / later (already-aired ones are left out). */
export function groupUpcoming(list: Upcoming[]): { group: CalendarGroup; rows: Upcoming[] }[] {
  const sorted = list.filter((u) => u.days >= 0).sort((a, b) => a.days - b.days || a.title.localeCompare(b.title));
  const pick = (g: CalendarGroup) => sorted.filter((u) => (u.days === 0 ? "today" : u.days === 1 ? "tomorrow" : u.days <= 7 ? "week" : "later") === g);
  return (["today", "tomorrow", "week", "later"] as CalendarGroup[]).map((group) => ({ group, rows: pick(group) })).filter((g) => g.rows.length);
}
