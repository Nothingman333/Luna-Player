import type { Item } from "./library";
import type { Playlist, Rec } from "./Taste";
import type { Candidate } from "./tonightModel";
export type FriendNote = { name: string; stars?: number; note?: string };
export type FriendCandidate = Candidate & { friendNotes: FriendNote[] };
const norm = (s: string) => s.trim().toLocaleLowerCase("tr");
export function friendPool(items: Item[], recs: Rec[], lists: Playlist[], selected: string[] | null) {
  const folders = lists.filter(p => !p.parent && lists.some(child => child.parent === p.id && /^https:\/\/letterboxd\.com\//i.test(child.source?.url ?? "")));
  const people = [...new Set([...recs.map(r => r.from.trim()), ...folders.map(p => p.name.trim())].filter(Boolean))].sort((a,b) => a.localeCompare(b, "tr"));
  const allowed = selected === null ? null : new Set(selected.map(norm));
  const out = new Map<string, FriendCandidate>();
  const add = (film: { title: string; year?: string; tmdbId?: number; kind?: "movie" | "tv"; poster?: string | null; rating?: number; stars?: number }, name: string, note?: string) => {
    if (allowed && !allowed.has(norm(name))) return;
    const kind = film.kind ?? "movie";
    const local = items.find(it => (it.meta?.kind ?? it.parsed.kind) === kind && (film.tmdbId && it.meta?.id ? film.tmdbId === it.meta.id : norm(it.meta?.title ?? it.parsed.title) === norm(film.title) && (!film.year || !it.meta?.year || film.year === it.meta.year)));
    const meta = local?.meta;
    const id = film.tmdbId ?? meta?.id;
    const identity = `${kind}:${id && id > 0 ? id : norm(film.title) + "|" + (film.year ?? "")}`;
    const current = out.get(identity);
    const source: FriendNote = { name, stars: typeof film.stars === "number" && film.stars > 0 && film.stars <= 5 ? film.stars : undefined, note: note?.trim() || undefined };
    if (current) {
      const prior = current.friendNotes.find(n => norm(n.name) === norm(name));
      if (prior) { if (source.stars) prior.stars = source.stars;if (source.note && !prior.note) prior.note = source.note; }
      else current.friendNotes.push(source);
      return;
    }
    out.set(identity, { key: "friend:" + identity, title: meta?.title ?? film.title, year: meta?.year ?? film.year, tmdbId: id, kind, runtime: meta?.runtime ?? 0, genres: meta?.genres ?? [], rating: meta?.rating ?? film.rating ?? 0, poster: meta?.poster ?? film.poster ?? null, backdrop: meta?.backdrop ?? null, path: local?.files[0]?.path ?? "", order: out.size, friendNotes: [source] });
  };
  for (const rec of recs) if (rec.status !== "dismissed") add(rec, rec.from, rec.note);
  for (const folder of folders) for (const list of lists.filter(p => p.parent === folder.id)) for (const film of list.items) add(film, folder.name);
  return { people, candidates: [...out.values()] };
}
