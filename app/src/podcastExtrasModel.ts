/** Pure helpers for Podcasting 2.0 episode extras: <podcast:chapters> (JSON chapters) and
 *  <podcast:transcript> (VTT, SRT, JSON or text). No imports: the regression script loads it as it is. */

export type PodChapter = { start: number; title: string; img?: string; url?: string };
export type PodCue = { start: number; end: number; text: string; speaker?: string };
export type PodLink = { url: string; type: string; lang?: string; rel?: string };

/** "01:02:03.5", "02:03,250", "63.5" → seconds (NaN when unreadable). */
export function parseTimestamp(s: string): number {
  const t = String(s ?? "").trim().replace(",", ".");
  if (!t) return NaN;
  const parts = t.split(":");
  if (parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return NaN;
  return parts.reduce((n, p) => n * 60 + Number(p), 0);
}

/** JSON chapters (podcastindex "application/json+chapters"): in order, untitled and hidden (toc:false) ones left out. */
export function parseChaptersJson(json: unknown): PodChapter[] {
  const list: any[] = Array.isArray((json as any)?.chapters) ? (json as any).chapters : [];
  return list
    .filter((c) => c && c.toc !== false && Number.isFinite(Number(c.startTime)) && String(c.title ?? "").trim())
    .map((c) => ({ start: Math.max(0, Number(c.startTime)), title: String(c.title).trim().slice(0, 200),
      ...(typeof c.img === "string" && /^https?:/i.test(c.img) ? { img: c.img } : {}),
      ...(typeof c.url === "string" && /^https?:/i.test(c.url) ? { url: c.url } : {}) }))
    .sort((a, b) => a.start - b.start);
}

/** WebVTT or SRT cues; voice tags (<v Name>) become the speaker, other tags are dropped. */
export function parseCues(text: string): PodCue[] {
  const out: PodCue[] = [];
  const blocks = String(text ?? "").replace(/\r/g, "").replace(/^\uFEFF/, "").split(/\n\s*\n/);
  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim() !== "");
    const at = lines.findIndex((l) => l.includes("-->"));
    if (at < 0) continue;
    const [a, b] = lines[at].split("-->");
    const start = parseTimestamp(a), end = parseTimestamp(String(b ?? "").trim().split(/\s+/)[0]);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    let raw = lines.slice(at + 1).join(" ");
    const voice = raw.match(/<v(?:\.[^\s>]+)?\s+([^>]+)>/);
    raw = raw.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
    if (!raw) continue;
    out.push({ start, end: Math.max(start, end), text: raw, ...(voice ? { speaker: voice[1].trim() } : {}) });
  }
  return out.sort((x, y) => x.start - y.start);
}

/** The Podcasting 2.0 JSON transcript: { segments: [{ speaker, startTime, endTime, body }] }. */
export function parseTranscriptJson(json: unknown): PodCue[] {
  const segs: any[] = Array.isArray((json as any)?.segments) ? (json as any).segments : [];
  return segs
    .filter((s) => Number.isFinite(Number(s?.startTime)) && String(s?.body ?? "").trim())
    .map((s) => ({ start: Number(s.startTime), end: Number.isFinite(Number(s.endTime)) ? Number(s.endTime) : Number(s.startTime), text: String(s.body).trim(),
      ...(s.speaker ? { speaker: String(s.speaker).trim() } : {}) }))
    .sort((a, b) => a.start - b.start);
}

/** Short cues joined into readable paragraphs: a new one when the speaker changes, after a pause of 2 s or about 320 characters. */
export function mergeCues(cues: PodCue[], maxLen = 320): PodCue[] {
  const out: PodCue[] = [];
  for (const c of cues) {
    const last = out[out.length - 1];
    if (last && last.speaker === c.speaker && c.start - last.end <= 2 && last.text.length + c.text.length < maxLen) {
      last.text += " " + c.text; last.end = Math.max(last.end, c.end);
    } else out.push({ ...c });
  }
  return out;
}

/** The index of the cue (or chapter) playing at `t`: the last one that started, -1 before the first. */
export function indexAt(list: { start: number }[], t: number): number {
  let lo = 0, hi = list.length - 1, at = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].start <= t) { at = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return at;
}

/** Which transcript to load: timed formats first (VTT, SRT, JSON), then the user's language. */
export function pickTranscript(links: PodLink[], lang: string): PodLink | null {
  const rank = (l: PodLink) => {
    const t = l.type.toLowerCase();
    const fmt = t.includes("vtt") ? 0 : t.includes("subrip") || t.includes("srt") ? 1 : t.includes("json") ? 2 : t.includes("html") ? 4 : 3;
    const sameLang = l.lang && lang && l.lang.toLowerCase().startsWith(lang.toLowerCase()) ? 0 : 1;
    return sameLang * 10 + fmt;
  };
  const ok = links.filter((l) => /^https?:\/\//i.test(l.url));
  return ok.length ? ok.slice().sort((a, b) => rank(a) - rank(b))[0] : null;
}

/** Plain or HTML text (no timing) as paragraphs, so it can still be read and searched. */
export function textParagraphs(text: string, html = false): string[] {
  let t = String(text ?? "");
  if (html) t = t.replace(/<(br|\/p|\/div|\/li|\/h\d)[^>]*>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  return t.split(/\n\s*\n|\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 4000);
}
