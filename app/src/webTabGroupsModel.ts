import { cleanWebTabs, browserTabSearch, type SavedWebTab } from "./browserWorkspaceModel";

export const WEB_GROUPS_KEY = "lunaWebGroups";
export type WebTabGroup = { id: string; name: string; tabs: SavedWebTab[]; updated: number };
const nameKey = (s: string) => browserTabSearch(s).trim().replace(/\s+/g, " ");
function readTabs(raw: unknown): SavedWebTab[] {
  if (!Array.isArray(raw) || raw.length > 8 || raw.some(t => !t || typeof t.url !== "string" || typeof t.title !== "string" || !/^https?:\/\//i.test(t.url))) throw Error("Invalid tab group.");
  for (const t of raw) { const u = new URL(t.url); if (u.username || u.password || t.url.length > 4096) throw Error("Invalid tab address."); }
  const rows = cleanWebTabs(raw);
  if (rows.length !== new Set(raw.map(t => new URL(t.url).href)).size) throw Error("Invalid tab group.");
  return rows;
}
/** Strict reads: a malformed group must never silently disappear on the next save. */
export function readWebGroups(raw: unknown): WebTabGroup[] {
  if (!raw || typeof raw !== "object" || (raw as any).version !== 1 || !Array.isArray((raw as any).groups) || (raw as any).groups.length > 12) throw Error("Invalid group file (maximum 12 groups).");
  const ids = new Set<string>(), names = new Set<string>();
  return (raw as any).groups.map((g: any) => {
    if (!g || typeof g.id !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(g.id) || typeof g.name !== "string" || !g.name.trim() || g.name.trim().length > 60 || !Number.isFinite(g.updated) || g.updated < 0 || ids.has(g.id) || names.has(nameKey(g.name))) throw Error("Invalid or repeated group name.");
    ids.add(g.id); names.add(nameKey(g.name));
    return { id: g.id, name: g.name.trim(), tabs: readTabs(g.tabs), updated: g.updated };
  });
}
export function mergeWebGroups(existing: WebTabGroup[], incoming: WebTabGroup[]): WebTabGroup[] {
  const next = [...existing];
  for (const group of incoming) {
    const sameName = next.find(g => nameKey(g.name) === nameKey(group.name));
    if (sameName) {
      const tabs = cleanWebTabs([...sameName.tabs, ...group.tabs], 200);
      if (tabs.length > 8) throw Error("A merged group would exceed 8 tabs.");
      next[next.indexOf(sameName)] = { ...sameName, tabs, updated: Math.max(sameName.updated, group.updated) };
    } else { next.push({ ...group, id: next.some(g => g.id === group.id) ? crypto.randomUUID() : group.id }); }
  }
  if (next.length > 12) throw Error("Maximum 12 tab groups.");
  return readWebGroups({ version: 1, groups: next });
}
export function upsertWebGroup(groups: WebTabGroup[], name: string, tabs: SavedWebTab[], id?: string): WebTabGroup[] {
  if (id && !groups.some(g => g.id === id)) throw Error("Group no longer exists.");
  const cleaned = readTabs(tabs);
  if (!cleaned.length) throw Error("No open tabs to save.");
  const same = groups.find(g => nameKey(g.name) === nameKey(name) && g.id !== id);
  if (same) throw Error("A group with this name already exists.");
  const row = { id: id ?? crypto.randomUUID(), name: name.trim(), tabs: cleaned, updated: Date.now() };
  return readWebGroups({ version: 1, groups: id ? groups.map(g => g.id === id ? row : g) : [...groups, row] });
}
