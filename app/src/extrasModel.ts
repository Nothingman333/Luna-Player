/** Local-only data helpers shared by the new small tools. No AI calls. */
export type SceneNote = { id: string; path: string; title: string; at: number; text: string };
export type WordNote = SceneNote & { word: string; meaning: string };
export type WebReading = { url: string; title: string; progress: number; done: boolean; at: number };
export const pathId = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "").toLocaleLowerCase("en-US");
const pathParts = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "").split("/");
const partId = (s: string) => s.toLocaleLowerCase("en-US");
export function movedPath(path: string, from: string, to: string): string | null {
  // Compare whole folder names. Lower-casing can change string length ("İ" → "i̇"),
  // so the remaining tail must not be cut by the lower-cased root length.
  const a = pathParts(path), root = pathParts(from);
  if (!root.join("") || a.length < root.length || root.some((s, i) => partId(s) !== partId(a[i]))) return null;
  return to.replace(/[\\/]+$/, "") + a.slice(root.length).map(s => "\\" + s).join("");
}
export function relinkPlan(paths: string[], from: string, to: string) {
  const absolute = (s: string) => /^(?:[a-z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+)/i.test(s) && !/[\0\r\n]/.test(s) && !s.split(/[\\/]/).includes("..");
  if (!absolute(from) || !absolute(to) || pathId(from) === pathId(to)) throw Error("Geçerli ve farklı iki mutlak klasör seç.");
  const seen = new Set<string>();
  return paths.flatMap(old => {
    const next = movedPath(old, from, to);
    if (!next || seen.has(pathId(old))) return [];
    seen.add(pathId(old)); return [{ from: old, to: next }];
  });
}
export function webAddress(raw: string): string {
  const u = new URL(raw);
  if (!/^https?:$/.test(u.protocol) || u.username || u.password) throw Error("Geçersiz sayfa adresi");
  // Preserve queries and fragments: different articles may share the same pathname.
  return u.href;
}
export const validScene = (x: any): x is SceneNote => !!x && typeof x.id === "string" && typeof x.path === "string" && typeof x.title === "string" && typeof x.text === "string" && Number.isFinite(x.at) && x.at >= 0;
export const validWord = (x: any): x is WordNote => validScene(x) && typeof (x as WordNote).word === "string" && typeof (x as WordNote).meaning === "string";
export const validReading = (x: any): x is WebReading => { try { return !!x && webAddress(x.url) === x.url && typeof x.title === "string" && Number.isFinite(x.progress) && x.progress >= 0 && x.progress <= 1 && typeof x.done === "boolean" && Number.isFinite(x.at); } catch { return false; } };
export function localList<T>(storage: Pick<Storage, "getItem">, key: string, valid: (x: any) => x is T): T[] {
  try { const x: unknown = JSON.parse(storage.getItem(key) || "[]"); return Array.isArray(x) ? x.filter(valid) : []; } catch { return []; }
}
/** What a list read added and what it no longer shows. Same title + same year is one work; a read that lost
 *  or gained the year (Letterboxd pages do not always carry it) is the same work too, as in the list refresh.
 *  Two different years stay two works (Dune 1984 / Dune 2021). `norm` must match the caller's own title key. */
export function listDelta<T extends { title: string; year?: string }>(before: T[], after: T[],
  norm: (title: string) => string = t => t.normalize("NFC").trim().toLocaleLowerCase()) {
  const name = (x: T) => norm(x.title.normalize("NFC")), exact = (x: T) => name(x) + "|" + (x.year || "");
  const open = new Map<string, number[]>(); // title → indexes of `before` not yet matched
  before.forEach((x, i) => { const k = name(x); open.set(k, [...(open.get(k) ?? []), i]); });
  const matched = new Set<number>(), seen = new Set<string>(), added: T[] = [];
  for (const x of after) {
    const free = open.get(name(x)) ?? [];
    let at = free.findIndex(i => (before[i].year || "") === (x.year || ""));
    if (at < 0) at = free.findIndex(i => !before[i].year || !x.year);
    if (at >= 0) { matched.add(free[at]); seen.add(exact(x)); free.splice(at, 1); continue; }
    // a repeated entry of a work already matched (a rewatch in a diary) is not new
    if (seen.has(exact(x)) || before.some((b, i) => matched.has(i) && name(b) === name(x) && (!b.year || !x.year || b.year === x.year))) continue;
    added.push(x); seen.add(exact(x));
  }
  return { added, removed: before.filter((_, i) => !matched.has(i) && !after.some(a => name(a) === name(before[i]) && (a.year || "") === (before[i].year || ""))) };
}
export type StorageDelta = { key: string; before: string | null; after: string | null };
export function storageRelink(snapshot: Record<string, string>, pairs: { from: string; to: string }[]): StorageDelta[] {
  const map = new Map(pairs.map(p => [pathId(p.from), p.to]));
  if (new Set(pairs.map(p => pathId(p.to))).size !== pairs.length) throw Error("İki dosya aynı hedefe bağlanamaz.");
  const replace = (s: string) => map.get(pathId(s)) || s;
  const visit = (v: any): any => {
    if (typeof v === "string") return replace(v);
    if (Array.isArray(v)) return v.map(visit);
    if (!v || typeof v !== "object") return v;
    const next: Record<string, unknown> = Object.create(null);
    for (const [k, x] of Object.entries(v)) {
      let dest = replace(k);
      try { const tuple=JSON.parse(k);if(Array.isArray(tuple)&&tuple.length===2&&typeof tuple[0]==="string"&&typeof tuple[1]==="string"&&map.has(pathId(tuple[0]))) dest=JSON.stringify([replace(tuple[0]),tuple[1]]); } catch {}
      if (Object.prototype.hasOwnProperty.call(next, dest)) throw Error("Hedefte mevcut kayıt var: " + dest);
      next[dest] = visit(x);
    }
    return next;
  };
  const next = { ...snapshot };
  for (const [key, raw] of Object.entries(snapshot)) {
    let target = key;
    for (const p of pairs) if (/^[A-Za-z]+:/.test(key) && key.endsWith(p.from)) target = key.slice(0, -p.from.length) + p.to;
    if (target !== key && target in snapshot) throw Error("Hedefin kendi ayarı var: " + target);
    let updated = replace(raw);
    try { const parsed = JSON.parse(raw), converted = visit(parsed); if (JSON.stringify(parsed) !== JSON.stringify(converted)) updated = JSON.stringify(converted); } catch (e) { if (e instanceof Error && e.message.startsWith("Hedefte")) throw e; }
    if (target !== key) delete next[key];
    next[target] = updated;
  }
  return [...new Set([...Object.keys(snapshot), ...Object.keys(next)])].flatMap(key => (snapshot[key] ?? null) === (next[key] ?? null) ? [] : [{ key, before: snapshot[key] ?? null, after: next[key] ?? null }]);
}
/** Check the complete plan first; preserve other user changes during undo. */
export function writeDelta(storage: Pick<Storage, "getItem" | "setItem" | "removeItem">, delta: StorageDelta[], reverse = false) {
  const changes = delta.map(d => ({ key: d.key, before: reverse ? d.after : d.before, after: reverse ? d.before : d.after }));
  for (const d of changes) if (storage.getItem(d.key) !== d.before) throw Error("Kayıt değişmiş; önce önizlemeyi yenile.");
  const write = (key: string, value: string | null) => value === null ? storage.removeItem(key) : storage.setItem(key, value);
  const touched: typeof changes = [];
  try { for (const d of changes) { touched.push(d); write(d.key, d.after); } }
  catch (e) { let rollbackFailed = false; for (const d of touched.reverse()) { try { write(d.key, d.before); } catch { rollbackFailed = true; } } if (rollbackFailed) throw Error("Yazma ve geri alma başarısız. Dışa aktardığın yedeği koru."); throw e; }
}
