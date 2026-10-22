// Storage and identity boundaries shared by imports, collections and the library.
export type StringStorage = Pick<Storage, "length" | "key" | "getItem" | "setItem" | "clear">;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
/** Durable snapshots are flat string maps, never arrays/scalars or nested values. */
export function durableState(value: unknown): Record<string,string> {
  if (!record(value) || Object.values(value).some(v=>typeof v!=="string")) throw Error("Invalid Luna state");
  return value as Record<string,string>;
}
let restoreDepth = 0;
export const storageRestoreInProgress = () => restoreDepth > 0;
export function storageSnapshot(storage: StringStorage, excluded: readonly string[] = []): Record<string, string> {
  const data: Record<string, string> = Object.create(null);
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key != null && !excluded.includes(key)) data[key] = storage.getItem(key) ?? "";
  }
  return data;
}
export function backupData(value: unknown, excluded: readonly string[]): Record<string, string> {
  if (!record(value) || value.luna !== "backup" || !record(value.data)) throw new Error("Invalid Luna backup");
  const data: Record<string, string> = Object.create(null);
  for (const [key, item] of Object.entries(value.data)) {
    if (excluded.includes(key)) continue;
    if (typeof item !== "string") throw new Error("Invalid backup value: " + key);
    data[key] = item;
  }
  // Reject wrong-shaped boot data before touching any existing records.
  const arrays = ["folders", "pinned", "recent", "collections", "playlists", "recs", "seenList", "laterList", "musicFolders", "bookFolders", "bookShelfNames", "bookWantToRead", "musicPlaylists", "musicLikes", "musicDislikes", "m3uRecent"];
  const objects = ["meta", "diary", "bookDiary", "readerSet", "ttsSet", "bookDetailsByPath", "bookShelves"];
  for (const key of [...arrays, ...objects]) {
    if (!(key in data)) continue;
    const item: unknown = JSON.parse(data[key]);
    if (arrays.includes(key) ? !Array.isArray(item) : !record(item)) throw new Error("Invalid backup field: " + key);
  }
  return data;
}
/** The caller keeps the old in-memory UI until storage AND its durable copy succeed. */
export async function replaceStorage(storage: StringStorage, data: Record<string, string>, persist: (data: Record<string, string>) => Promise<unknown>): Promise<void> {
  const before = storageSnapshot(storage);
  const write = (next: Record<string, string>) => { storage.clear(); for (const [k, v] of Object.entries(next)) storage.setItem(k, v); };
  restoreDepth++;
  try { write(data); await persist(data); }
  catch (error) {
    try { write(before); await persist(before); }
    catch (rollbackError) { throw new Error(`Restore and rollback failed; keep the backup file. ${String(error)}; ${String(rollbackError)}`); }
    throw error;
  }
  finally { restoreDepth--; }
}
export const identityText = (value: string) => value.normalize("NFC").trim().toLowerCase();
export type CollectionIdentity = { kind: string; title: string; by?: string; year?: string };
export function sameCollectionItem(a: CollectionIdentity, b: CollectionIdentity): boolean {
  return a.kind === b.kind && identityText(a.title) === identityText(b.title)
    && identityText(a.by ?? "") === identityText(b.by ?? "")
    && (a.kind !== "film" || (a.year ?? "").trim() === (b.year ?? "").trim());
}
export function uniqueCollectionItems<T extends CollectionIdentity>(existing: T[], incoming: T[]): T[] {
  const added: T[] = [];
  for (const item of incoming) if (item.title.trim() && ![...existing, ...added].some((x) => sameCollectionItem(x, item))) added.push(item);
  return added;
}
export function matchCollectionBook<T extends { path: string; title: string; author?: string }>(books: T[], item: { path?: string; title: string; by?: string }): T | undefined {
  const path = item.path && books.find((b) => b.path === item.path);
  if (path) return path;
  const matching = books.filter((b) => identityText(b.title) === identityText(item.title) && (!item.by || identityText(b.author ?? "") === identityText(item.by)));
  return matching.length === 1 ? matching[0] : undefined;
}
export function isLetterboxdUrl(input: string): boolean {
  try { const u = new URL(input); return (u.protocol === "https:" || u.protocol === "http:") && !u.username && !u.password && ["letterboxd.com", "www.letterboxd.com", "boxd.it"].includes(u.hostname.toLowerCase()); }
  catch { return false; }
}
export function sameTitleYear(saved: string, title: string, year?: string): boolean {
  const requestedYear=year?.trim()||title.match(/\((\d{4})\)\s*$/)?.[1];
  const savedYear = saved.match(/\((\d{4})\)\s*$/)?.[1];
  return identityText(saved.replace(/\s*\(\d{4}\)\s*$/, "")) === identityText(title.replace(/\s*\(\d{4}\)\s*$/, "")) && (!requestedYear || !savedYear || requestedYear === savedYear);
}
export function validStars(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const stars = Number(value.trim().replace(/^(\d+),(\d+)$/, "$1.$2"));
  return Number.isFinite(stars) && stars >= 0.5 && stars <= 5 && Number.isInteger(stars * 2) ? stars : undefined;
}
