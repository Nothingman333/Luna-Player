import type { Rec, Playlist } from "./Taste";
import type { FriendRatings } from "./tasteEngine";

type Title = { title: string; year?: string; id?: number; kind: "movie" | "tv"; aliases?: string[] };
export type WatchingFriend = { name: string; stars?: number; note?: string };
export function friendRatingSummary(friends: WatchingFriend[]): { average: number | null; rated: number } {
  const rated = friends.flatMap(friend => typeof friend.stars === "number" && Number.isFinite(friend.stars) && friend.stars > 0 && friend.stars <= 5 ? [friend.stars] : []);
  return { average: rated.length ? rated.reduce((sum, stars) => sum + stars, 0) / rated.length : null, rated: rated.length };
}
const key = (s: string) => s.trim().toLocaleLowerCase("tr");
const split = (s: string) => { const m = s.match(/^(.*?)\s*\((\d{4})\)\s*$/); return { title: m ? m[1].trim() : s.trim(), year: m?.[2] }; };

/** A recommender is not automatically a viewer. Only their own watched/liked/rated evidence counts. */
export function friendsWhoWatched(title: Title, recs: Rec[], ratings: Record<string, FriendRatings>, lists: Playlist[]): WatchingFriend[] {
  const names = new Map<string, string>();
  for (const rec of recs) if (rec.from?.trim()) names.set(key(rec.from), rec.from.trim());
  const watchedList = (list: Playlist) => /^(izledikleri|watched|liked|beğendi[kğ]leri|yüksek puanladıkları(?:\s|$))/i.test(key(list.name));
  for (const list of lists) if (list.parent && watchedList(list)) {
    const parent = lists.find(p => p.id === list.parent);
    if (parent?.name.trim()) names.set(key(parent.name), parent.name.trim());
  }
  const titles = new Set([title.title, ...(title.aliases ?? [])].map(t => key(split(t).title)));
  const matches = (other: { title: string; year?: string; tmdbId?: number; kind?: "movie" | "tv" }) => {
    if ((other.kind ?? "movie") !== title.kind) return false;
    if (title.id && other.tmdbId) return title.id === other.tmdbId;
    const parsed = split(other.title), year = other.year || parsed.year;
    return titles.has(key(parsed.title)) && (!title.year || !year || title.year === year);
  };
  const star = (s: unknown): s is number => typeof s === "number" && Number.isFinite(s) && s > 0 && s <= 5;
  const found = new Map<string, WatchingFriend>();
  const put = (name: string, stars?: number, note?: string) => {
    const k = key(name), display = names.get(k);
    if (!display) return;
    const prev = found.get(k);
    found.set(k, { name: display, stars: star(stars) ? stars : prev?.stars, note: note?.trim() || prev?.note });
  };
  for (const rec of recs) if (matches(rec) && (star(rec.stars) || rec.tags?.some(tag => /^(izledi|watched|beğendi|liked)$/i.test(key(tag))))) put(rec.from, rec.stars, rec.note);
  for (const [name, data] of Object.entries(ratings)) {
    if (!names.has(key(name)) || title.kind !== "movie" || !data?.r || !data?.t) continue;
    for (const [id, stars] of Object.entries(data.r)) {
      if (!star(stars)) continue;
      const label = data.t[id];
      if (typeof label === "string" && matches(split(label))) put(name, stars);
    }
  }
  for (const list of lists) {
    if (!list.parent || !watchedList(list)) continue;
    const parent = lists.find(p => p.id === list.parent);
    if (!parent) continue;
    const film = list.items.find(matches);
    if (film) put(parent.name, film.stars);
  }
  for(const rec of recs)if(matches(rec)&&found.has(key(rec.from))&&rec.note?.trim())put(rec.from,rec.stars,rec.note);
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name, "tr"));
}

export function remainingMinutes(rec?: { duration: number; time: number }): number | null {
  return rec && Number.isFinite(rec.duration) && rec.duration > 0 && Number.isFinite(rec.time)
    ? Math.ceil(Math.max(0, rec.duration - Math.max(0, rec.time)) / 60) : null;
}
