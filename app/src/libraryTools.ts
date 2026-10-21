import type { Item } from "./library";
export type LibrarySort = "az" | "new" | "rating";
export type LibraryFilter = "all" | "unmatched" | "versions";
export function workIdentity(item: Item): string {
  const kind = item.meta?.kind ?? item.parsed.kind;
  return item.meta?.id ? `${kind}:${item.meta.id}` : `file:${item.key}`;
}
export function libraryStats(items: Item[]) {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(workIdentity(item), (counts.get(workIdentity(item)) ?? 0) + item.files.length);
  return { files: items.reduce((n, i) => n + i.files.length, 0), unmatched: items.filter((i) => !i.meta || i.meta.id <= 0).length,
    versions: new Set(items.filter((i) => i.parsed.kind === "movie" && (counts.get(workIdentity(i)) ?? 0) > 1).map(workIdentity)), counts };
}
export function selectLibrary(items: Item[], query: string, sort: LibrarySort, filter: LibraryFilter, genre: string, locale: string): Item[] {
  const q = query.trim().toLocaleLowerCase(locale);
  const stats = libraryStats(items);
  return items.filter((i) => {
    const searchable = [i.meta?.title, i.parsed.title, i.meta?.year, i.parsed.year, ...(i.meta?.cast.map((c) => c.name) ?? [])].join(" ").toLocaleLowerCase(locale);
    return (!q || searchable.includes(q)) && (!genre || i.meta?.genres.includes(genre))
      && (filter !== "unmatched" || !i.meta || i.meta.id <= 0) && (filter !== "versions" || stats.versions.has(workIdentity(i)));
  }).sort((a, b) => {
    const byTitle = (a.meta?.title ?? a.parsed.title).localeCompare(b.meta?.title ?? b.parsed.title, locale, { numeric: true });
    if (sort === "new") return Number(b.meta?.year || b.parsed.year || 0) - Number(a.meta?.year || a.parsed.year || 0) || byTitle;
    if (sort === "rating") return (b.meta?.rating ?? 0) - (a.meta?.rating ?? 0) || byTitle;
    return byTitle;
  });
}
