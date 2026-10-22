/** Chat history safety and the size of what is sent to a model (pure, no Tauri / React). */

const CTX_KINDS = ["general", "film", "recs", "music", "books"];
const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };

export type SalvageResult = { convs: any[]; dropped: number; repaired: number; damaged: boolean };

/** Reads the saved conversations leniently: a conversation missing its title or context is repaired instead of
 *  dropped (and then lost the next time the history is saved). Only what has no readable message is dropped. */
export function salvageConversations(raw: unknown, cleanMessages: (m: unknown) => any[]): SalvageResult {
  if (raw === null || raw === undefined) return { convs: [], dropped: 0, repaired: 0, damaged: false };
  if (!Array.isArray(raw)) return { convs: [], dropped: 1, repaired: 0, damaged: true };
  const convs: any[] = []; const ids = new Set<string>();
  let dropped = 0, repaired = 0;
  raw.forEach((entry: any, i: number) => {
    if (!entry || typeof entry !== "object" || !Array.isArray(entry.msgs)) { dropped++; return; }
    const msgs = cleanMessages(entry.msgs);
    if (!msgs.length) { dropped++; return; }
    let fixed = msgs.length !== Math.min(entry.msgs.length, 60);
    const firstUser = msgs.find((m) => m?.role === "user")?.text ?? "Sohbet";
    const id = typeof entry.id === "string" && entry.id ? entry.id : (fixed = true, "recovered-" + i + "-" + hash(JSON.stringify(msgs).slice(0, 300)));
    if (ids.has(id)) { dropped++; return; }
    ids.add(id);
    const title = typeof entry.title === "string" && entry.title ? entry.title : (fixed = true, String(firstUser).slice(0, 60));
    const ctx = typeof entry.ctx === "string" ? entry.ctx : (fixed = true, "Genel");
    const at = Number.isFinite(entry.at) ? entry.at : (fixed = true, 0);
    const ctxKind = CTX_KINDS.includes(entry.ctxKind) ? entry.ctxKind : (fixed = true, "general");
    if (fixed) repaired++;
    convs.push({ ...entry, id, title, ctx, at, ctxKind, msgs });
  });
  return { convs: convs.slice(0, 60), dropped, repaired, damaged: dropped > 0 || repaired > 0 };
}

/** The saved text is not JSON at all: nothing can be read, so the text itself must be kept. */
export function unreadableHistory(rawText: string | null | undefined): boolean {
  if (!rawText || !rawText.trim()) return false;
  try { JSON.parse(rawText); return false; } catch { return true; }
}

export type ModelTurn = { role: string; parts?: { text?: string }[] };
const textLen = (c: ModelTurn) => (c.parts ?? []).reduce((n, p) => n + (typeof p?.text === "string" ? p.text.length : 0), 0);
const MARK = "…[kısaltıldı]";
const shrink = (c: ModelTurn, max: number): ModelTurn => textLen(c) <= max ? c
  : { ...c, parts: (c.parts ?? []).map((p) => typeof p?.text === "string" && p.text.length > max ? { ...p, text: p.text.slice(0, max) + MARK } : p) };

/** Keeps what is sent to a model inside a budget without touching the saved conversation: very long old
 *  messages are shortened, the oldest turns are left out (never the newest question), and the request still
 *  starts with a user turn. Returns how many turns were left out. */
export function budgetContents<T extends ModelTurn>(contents: T[], o: { maxChars?: number; maxMessage?: number } = {}): { contents: T[]; dropped: number; shortened: number } {
  const max = o.maxChars ?? 60000, per = o.maxMessage ?? 8000;
  if (!Array.isArray(contents) || !contents.length) return { contents: contents ?? [], dropped: 0, shortened: 0 };
  let shortened = 0;
  const list = contents.map((c, i) => { if (i === contents.length - 1) return c; const s = shrink(c, per); if (s !== c) shortened++; return s as T; });
  let total = list.reduce((n, c) => n + textLen(c), 0), start = 0;
  while (total > max && list.length - start > 1) { total -= textLen(list[start]); start++; }
  while (start > 0 && start < list.length - 1 && list[start].role !== "user") { total -= textLen(list[start]); start++; }
  const kept = list.slice(start);
  if (start > 0 && kept[0]?.role === "user") {
    const note = `[Bu sohbetin önceki ${start} mesajı model isteğinin boyut sınırı için bu çağrıya dahil edilmedi; sohbet geçmişi saklı.]\n`;
    const first = kept[0];
    kept[0] = { ...first, parts: [{ text: note + (first.parts?.[0]?.text ?? "") }, ...(first.parts ?? []).slice(1)] } as T;
  }
  return { contents: kept, dropped: start, shortened };
}

const PREF = /(bundan sonra|her zaman|hep |asla |bir daha |yalnızca|sadece .{0,40}(öner|ver|yaz)|istemiyorum|olmasın|kısa (tut|yaz|cevap)|ayrıntılı (anlat|yaz)|from now on|always |never |don'?t (ever )?(suggest|recommend|show|use)|only (suggest|recommend|from))/i;
/** Standing wishes the user stated earlier in a long chat ("always short answers", "no horror"): when the
 *  old messages no longer fit, these few lines still go along. */
export function extractStandingPreferences(userTexts: string[], max = 5): string[] {
  const out: string[] = [];
  for (const t of userTexts) {
    const s = String(t ?? "").replace(/\s+/g, " ").trim();
    if (!s || s.length > 400 || s.startsWith("/") || !PREF.test(s)) continue;
    if (!out.includes(s)) out.push(s.slice(0, 200));
  }
  return out.slice(-max);
}
