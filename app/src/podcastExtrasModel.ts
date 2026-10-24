/** Pure helpers for Podcasting 2.0 episode extras: <podcast:chapters> (JSON chapters) and
 *  <podcast:transcript> (VTT, SRT, JSON or text). */
import { decodeTextEntities } from "./textEntities";

export type PodChapter = { start: number; title: string; img?: string; url?: string };
export type PodCue = { start: number; end: number; text: string; speaker?: string };
export type PodLink = { url: string; type: string; lang?: string; rel?: string };

/** Keep episode-identifying query parameters; only expiring CDN signatures are ignored. */
export function sameEpisodeAudio(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const identity = (raw: string) => {
    const u = new URL(raw); u.hash = "";
    for (const key of [...u.searchParams.keys()]) {
      if (/^(?:x-amz-|x-goog-)/i.test(key) || /^(signature|expires|key-pair-id|policy)$/i.test(key)) u.searchParams.delete(key);
    }
    u.searchParams.sort(); return u.href;
  };
  try { return identity(a) === identity(b); } catch { return false; }
}

/** "01:02:03.5", "02:03,250", "63.5" → seconds (NaN when unreadable). */
export function parseTimestamp(s: string): number {
  const t = String(s ?? "").trim().replace(",", ".");
  if (!t) return NaN;
  const parts = t.split(":");
  if (parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return NaN;
  if (parts.slice(0, -1).some(p => p.includes(".")) || (parts.length > 1 && Number(parts[parts.length - 1]) >= 60) || (parts.length === 3 && Number(parts[1]) >= 60)) return NaN;
  const time = parts.reduce((n, p) => n * 60 + Number(p), 0);
  return Number.isFinite(time) ? time : NaN;
}

const numericTime = (value: unknown): number | null => {
  if (!(typeof value === "number" || typeof value === "string" && value.trim())) return null;
  const n = Number(value); return Number.isFinite(n) && n >= 0 ? n : null;
};

/** JSON chapters (podcastindex "application/json+chapters"): in order, untitled and hidden (toc:false) ones left out. */
export function parseChaptersJson(json: unknown): PodChapter[] {
  const list: any[] = Array.isArray((json as any)?.chapters) ? (json as any).chapters : [];
  return list
    .filter((c) => c && c.toc !== false && numericTime(c.startTime) !== null && typeof c.title === "string" && c.title.trim())
    .map((c) => ({ start: Number(c.startTime), title: String(c.title).trim().slice(0, 200),
      ...(typeof c.img === "string" && /^https?:/i.test(c.img) ? { img: c.img } : {}),
      ...(typeof c.url === "string" && /^https?:/i.test(c.url) ? { url: c.url } : {}) }))
    .sort((a, b) => a.start - b.start);
}

/** WebVTT or SRT cues; voice tags (<v Name>) become the speaker, other tags are dropped. */
export function parseCues(text: string): PodCue[] {
  const out: PodCue[] = [];
  const blocks = String(text ?? "").replace(/\r\n?/g, "\n").replace(/^\uFEFF/, "").split(/\n[ \t]*\n/);
  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim() !== "");
    if (/^(NOTE|STYLE|REGION)\b/.test(lines[0]?.trim() ?? "")) continue;
    const timing = (line: string) => {
      const parts = line.split("-->"); if (parts.length !== 2) return null;
      const start = parseTimestamp(parts[0]), end = parseTimestamp(parts[1].trim().split(/\s+/)[0]);
      return Number.isFinite(start) && Number.isFinite(end) && end > start ? { start, end } : null;
    };
    const positions = lines.flatMap((line, i) => timing(line) ? [i] : []);
    positions.forEach((at, i) => {
      let stop = positions[i + 1] ?? lines.length;
      if (i + 1 < positions.length && /^\d+$/.test(lines[stop - 1]?.trim())) stop--;
      let raw = lines.slice(at + 1, stop).join(" ");
      const voice = raw.match(/<v(?:\.[^\s>]+)?\s+([^>]+)>/);
      raw = decodeTextEntities(raw.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
      if (raw) out.push({ ...timing(lines[at])!, text: raw, ...(voice ? { speaker: decodeTextEntities(voice[1]).trim() } : {}) });
    });
  }
  return out.sort((x, y) => x.start - y.start);
}

/** The Podcasting 2.0 JSON transcript: { segments: [{ speaker, startTime, endTime, body }] }. */
export function parseTranscriptJson(json: unknown): PodCue[] {
  const segs: any[] = Array.isArray((json as any)?.segments) ? (json as any).segments : [];
  return segs
    .filter((s) => s && numericTime(s.startTime) !== null && typeof s.body === "string" && s.body.trim()
      && (s.endTime === undefined || numericTime(s.endTime) !== null && Number(s.endTime) >= Number(s.startTime)))
    .map((s) => ({ start: Number(s.startTime), end: s.endTime === undefined ? Number(s.startTime) : Number(s.endTime), text: String(s.body).trim(),
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
    const base = (s: string) => s.toLowerCase().replace(/_/g, "-").split("-")[0];
    const sameLang = l.lang && lang && base(l.lang) === base(lang) ? 0 : 1;
    return fmt * 10 + sameLang;
  };
  const ok = links.filter((l) => /^https?:\/\//i.test(l.url));
  return ok.length ? ok.slice().sort((a, b) => rank(a) - rank(b))[0] : null;
}

/** Plain or HTML text (no timing) as paragraphs, so it can still be read and searched. */
export function textParagraphs(text: string, html = false): string[] {
  let t = String(text ?? "");
  if (html) t = decodeTextEntities(t.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ").replace(/<(br|\/p|\/div|\/li|\/h\d)[^>]*>/gi, "\n").replace(/<[^>]+>/g, " "));
  return t.split(/\n\s*\n|\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 4000);
}
