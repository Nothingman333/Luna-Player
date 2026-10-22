import type { Collection, CItem } from "./Mine";
export function readCollections(raw: string | null): { collections: Collection[]; damaged: boolean } {
  if (!raw) return { collections: [], damaged: false };
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return { collections: [], damaged: true }; }
  if (!Array.isArray(data)) return { collections: [], damaged: true };
  let damaged = false;
  const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
  const item = (x: unknown): x is CItem => record(x) && ["film", "music", "book"].includes(x.kind as string) && typeof x.title === "string"
    && ["by", "year", "note", "path", "src", "url", "from"].every(k => x[k] === undefined || typeof x[k] === "string")
    && (x.cover === undefined || x.cover === null || typeof x.cover === "string");
  const ids = new Set<string>(), collections: Collection[] = [];
  for (const c of data) {
    if (!record(c) || typeof c.id !== "string" || !c.id || ids.has(c.id) || typeof c.name !== "string" || !Array.isArray(c.items)
      || (c.about !== undefined && typeof c.about !== "string") || (c.at !== undefined && (typeof c.at !== "number" || !Number.isFinite(c.at)))) { damaged = true; continue; }
    const items = c.items.filter(item);
    if (items.length !== c.items.length) damaged = true;
    ids.add(c.id);
    collections.push({ id: c.id, name: c.name, about: c.about as string | undefined, at: typeof c.at === "number" ? c.at : 0, items });
  }
  return { collections, damaged };
}
