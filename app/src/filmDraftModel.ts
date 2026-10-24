import { ASPECTS, type Aspect } from "./filmReviewModel";
export type FilmDraft = { note: string; draft: string; reasons: Aspect[] };
export function readFilmDraft(raw: unknown): (FilmDraft & { version: 1; at: number }) | null {
  if (!raw || typeof raw !== "object") return null;
  const x = raw as any;
  if (x.version !== 1 || !Number.isFinite(x.at) || x.at < 0 || typeof x.note !== "string" || x.note.length > 2000 || typeof x.draft !== "string" || x.draft.length > 6000 || !Array.isArray(x.reasons) || x.reasons.length > ASPECTS.length || x.reasons.some((r: unknown) => !ASPECTS.includes(r as Aspect))) return null;
  return { version: 1, at: x.at, note: x.note, draft: x.draft, reasons: ASPECTS.filter(a => x.reasons.includes(a)) };
}
export const filmDraftEqual = (a: FilmDraft, b: FilmDraft) => a.note === b.note && a.draft === b.draft && ASPECTS.every(r => a.reasons.includes(r) === b.reasons.includes(r));
