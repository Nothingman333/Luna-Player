/**
 * Parts of a video worth skipping, like Netflix's "Skip intro": from the file's own chapter names
 * and from intro times the user marked for a series. (SponsorBlock for YouTube links lives in
 * playbackExtrasModel / PlaybackRuntime.) Pure functions only (covered by scripts/subtitle-studio-regression.cjs).
 */

export type SegKind = "intro" | "recap" | "credits" | "preview";
export type Segment = { kind: SegKind; start: number; end: number; source: "chapter" | "mark" | "aniskip" | "fingerprint" };
export type Marks = { introStart?: number; introEnd?: number };

const CHAPTER_KINDS: [SegKind, RegExp][] = [
  ["recap", /\b(recap|previously|résumé|rückblick)\b|önceki bölüm|önceki bölümlerde|özet/i],
  // "OP" / "ED" (anime) only as the whole title ("OP", "ED 2"): "Ed Sheeran" or a character named Ed is not the credits
  ["intro", /^\s*op\s*[-:#]?\s*\d{0,2}\s*$/i],
  ["intro", /\b(intro|opening|title sequence|opening credits|main titles?|vorspann)\b|giriş jeneriği|açılış|jenerik başı/i],
  ["preview", /\b(preview|next episode|next time|sneak peek)\b|gelecek bölüm|sonraki bölümde|fragman/i],
  ["credits", /^\s*ed\s*[-:#]?\s*\d{0,2}\s*$/i],
  ["credits", /\b(credits|ending|end titles|end credits|outro|abspann)\b|kapanış|jenerik/i],
];

/** A chapter title's kind ("Opening" → intro, "Previously on…" → recap); null for ordinary chapters. */
export function chapterKind(title: string | undefined): SegKind | null {
  const t = String(title ?? "").trim();
  if (!t || t.length > 80) return null;
  for (const [kind, re] of CHAPTER_KINDS) if (re.test(t)) return kind;
  return null;
}

/** Skippable spans from mpv's chapter list (each chapter runs to the next one or the end). */
export function chapterSegments(chapters: { title?: string; time: number }[] | undefined, duration: number): Segment[] {
  const list = (chapters ?? []).filter((c) => Number.isFinite(c?.time) && c.time >= 0 && (!(duration > 0) || c.time < duration)).slice().sort((a, b) => a.time - b.time);
  const out: Segment[] = [];
  list.forEach((c, i) => {
    const kind = chapterKind(c.title);
    const end = i + 1 < list.length ? list[i + 1].time : duration;
    if (kind && Number.isFinite(end) && end - c.time >= 5 && end - c.time <= 600) out.push({ kind, start: c.time, end, source: "chapter" });
  });
  return out;
}

/** The intro a user marked for a series (same times in every episode). */
export function markSegments(m: Marks | null | undefined, duration: number): Segment[] {
  if (typeof m?.introStart !== "number" || typeof m.introEnd !== "number") return [];
  const s = Number(m?.introStart), e = Number(m?.introEnd);
  if (!Number.isFinite(s) || !Number.isFinite(e) || e - s < 3 || e - s > 600 || s < 0) return [];
  if (duration > 0 && s >= duration) return [];
  return [{ kind: "intro", start: s, end: duration > 0 ? Math.min(e, duration) : e, source: "mark" }];
}

/** All sources together, sorted; a later source's overlapping span of the same kind is dropped. */
export function mergeSegments(...lists: Segment[][]): Segment[] {
  const out: Segment[] = [];
  for (const s of lists.flat()) {
    if (out.some((o) => o.kind === s.kind && s.start < o.end && s.end > o.start)) continue;
    out.push(s);
  }
  return out.sort((a, b) => a.start - b.start);
}

/** The segment the playhead is in; not during its last second (nothing left to skip). */
export function activeSegment(segs: Segment[], time: number): Segment | null {
  return segs.find((s) => time >= s.start && time < s.end - 1) ?? null;
}

export const segmentKey = (s: Segment) => `${s.kind}@${Math.round(s.start)}`;

export function fingerprintSegments(value:unknown,duration:number):Segment[]{if(!Array.isArray(value))return[];return value.filter((s):s is Segment=>!!s&&typeof s==="object"&&(s.kind==="intro"||s.kind==="credits")&&Number.isFinite(s.start)&&Number.isFinite(s.end)&&s.start>=0&&s.end-s.start>=15&&s.end-s.start<=120&&(!(duration>0)||s.end<=duration+1)).map(s=>({...s,source:"fingerprint"}));}
