/** Followed series and films: what changed since the last look (a new episode out, a film released). Pure. */
export type Ep = { season: number; episode: number; date: string; name?: string };
export type Follow = {
  id: number; kind: "movie" | "tv"; title: string; year?: string; poster?: string | null; at: number;
  /** when TMDB was last asked; undefined = never (the first answer only sets the starting point) */
  checked?: number;
  last?: Ep | null; next?: Ep | null;
  /** a film's release date and whether it is out */
  release?: string; out?: boolean;
};
export type Notice = {
  id: string; at: number; title: string; text: string; poster?: string | null; read?: boolean;
  /** the title a click opens; or `go`, a place in Luna ("film:downloads") */
  target?: { title: string; year?: string; kind: "movie" | "tv"; tmdbId: number };
  go?: string;
  /** a new podcast episode: a click plays it (`art` is the show's picture, a full address) */
  episode?: { feed: string; src: string; title: string; show: string };
  art?: string;
};

const realDate = (s: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number), t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};

/** TMDB's last_episode_to_air / next_episode_to_air → an episode, or null. */
export function parseEp(n: unknown): Ep | null {
  if (!n || typeof n !== "object") return null;
  const o = n as Record<string, unknown>;
  const date = String(o.air_date ?? ""), season = Number(o.season_number), episode = Number(o.episode_number);
  if (!realDate(date) || !Number.isInteger(season) || !Number.isInteger(episode) || episode < 1 || season < 0) return null;
  return { season, episode, date, name: String(o.name ?? "").slice(0, 200) || undefined };
}

const newer = (a: Ep, b: Ep | null | undefined) => !b || a.season > b.season || (a.season === b.season && a.episode > b.episode);
export const epLabel = (e: Ep, tr = true) => `S${e.season}${tr ? "B" : "E"}${e.episode}`;
/** A local "YYYY-MM-DD" for today. */
export const today = (now = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

/** The follow after TMDB's answer, and a notice when something new came out since the last look. */
export function updateFollow(f: Follow, detail: unknown, now: Date, tr = true): { follow: Follow; notice: Notice | null } {
  const d = (detail ?? {}) as Record<string, unknown>;
  const first = f.checked === undefined;
  const target = { title: f.title, year: f.year, kind: f.kind, tmdbId: f.id };
  const make = (key: string, text: string): Notice => ({ id: `${f.kind}:${f.id}:${key}`, at: now.getTime(), title: f.title, text, poster: f.poster, target });
  if (f.kind === "tv") {
    const last = parseEp(d.last_episode_to_air), next = parseEp(d.next_episode_to_air);
    const follow: Follow = { ...f, checked: now.getTime(), last: last ?? f.last ?? null, next };
    const fresh = !first && last && newer(last, f.last);
    return {
      follow,
      notice: fresh ? make(epLabel(last), (tr ? "Yeni bölüm: " : "New episode: ") + epLabel(last, tr) + (last.name ? " · " + last.name : "")) : null,
    };
  }
  const release = realDate(String(d.release_date ?? "")) ? String(d.release_date) : f.release;
  const out = !!release && release <= today(now);
  const follow: Follow = { ...f, checked: now.getTime(), release, out };
  return { follow, notice: !first && !f.out && out ? make("out", tr ? "Çıktı, artık izlenebilir" : "Out now") : null };
}

/** Notices newest first, one per id, at most `max`. */
export function addNotices(list: Notice[], add: Notice[], max = 100): Notice[] {
  const seen = new Set<string>(), out: Notice[] = [];
  for (const n of [...add, ...list].sort((a, b) => b.at - a.at)) if (!seen.has(n.id)) { seen.add(n.id); out.push(n); }
  return out.slice(0, max);
}
