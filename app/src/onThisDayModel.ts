/** "A year ago today": what you finished on this day of the year in earlier years. Pure. */
export type Done = { key: string; title: string; poster?: string | null; at: number; kind: "movie" | "tv" };
export type Memory = { key: string; title: string; poster: string | null; yearsAgo: number; kind: "movie" | "tv"; count: number };

export function onThisDay(done: Done[], now: number): Memory[] {
  const n = new Date(now);
  const byKey = new Map<string, Memory>();
  for (const d of done) {
    const t = new Date(d.at);
    const yearsAgo = n.getFullYear() - t.getFullYear();
    if (yearsAgo < 1 || t.getMonth() !== n.getMonth() || t.getDate() !== n.getDate()) continue;
    const id = d.key + "@" + yearsAgo;
    const cur = byKey.get(id);
    if (cur) cur.count++; else byKey.set(id, { key: d.key, title: d.title, poster: d.poster ?? null, yearsAgo, kind: d.kind, count: 1 });
  }
  return [...byKey.values()].sort((a, b) => a.yearsAgo - b.yearsAgo || b.count - a.count || a.title.localeCompare(b.title)).slice(0, 4);
}
