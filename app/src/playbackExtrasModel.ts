/** Pure helpers behind the playback extras: SponsorBlock segments, the sound filters (normalising,
 *  night mode, clearer voices, equaliser), the A-B loop and the music sleep timer.
 *  No imports on purpose: `scripts/extras-plus-regression.cjs` loads this file as it is. */

/** The 11-character video id of a YouTube address (watch, youtu.be, shorts, embed, live, music). */
export function youtubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  let u: URL;
  try { u = new URL(String(url).trim()); } catch { return null; }
  const host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
  const ok = (id: string | null | undefined) => (id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null);
  if (host === "youtu.be") return ok(u.pathname.split("/")[1]);
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (u.pathname === "/watch") return ok(u.searchParams.get("v"));
    const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/);
    return ok(m?.[1]);
  }
  return null;
}

// ---------- SponsorBlock ----------
/** The SponsorBlock categories Luna offers, in the order they are listed. */
export const SPONSOR_CATEGORIES = ["sponsor", "selfpromo", "interaction", "intro", "outro", "preview", "filler", "music_offtopic"];
export type SponsorSegment = { start: number; end: number; category: string; uuid: string };

/** Privacy-friendly lookup: only the first 4 hex digits of the id's SHA-256 leave the computer. */
export function sponsorUrl(hashPrefix: string, categories: string[]): string {
  return "https://sponsor.ajay.app/api/skipSegments/" + encodeURIComponent(hashPrefix.slice(0, 4).toLowerCase())
    + "?categories=" + encodeURIComponent(JSON.stringify(categories)) + "&actionTypes=" + encodeURIComponent(JSON.stringify(["skip"]));
}

/** Segments of one video from a hash-prefix answer (a list of videos) or a plain answer (a list of segments). */
export function parseSponsorSegments(json: unknown, videoId: string, categories: string[]): SponsorSegment[] {
  if (!Array.isArray(json)) return [];
  const rows: any[] = json.some((x: any) => x && Array.isArray(x.segments))
    ? json.filter((x: any) => x && x.videoID === videoId).flatMap((x: any) => x.segments)
    : json;
  const out: SponsorSegment[] = [];
  for (const r of rows) {
    const seg = r?.segment;
    if (!Array.isArray(seg) || seg.length < 2) continue;
    const start = Number(seg[0]), end = Number(seg[1]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end - start < 1 || start < 0) continue;
    if (r.actionType && r.actionType !== "skip") continue;
    if (!categories.includes(String(r.category))) continue;
    out.push({ start, end, category: String(r.category), uuid: String(r.UUID ?? r.uuid ?? start + ":" + end) });
  }
  return out.sort((a, b) => a.start - b.start);
}

/** The segment to jump over now: playback is inside it, not in its last half second, and it was not skipped (or undone) yet. */
export function segmentToSkip(segments: SponsorSegment[], time: number, done: string[]): SponsorSegment | null {
  if (!Number.isFinite(time)) return null;
  return segments.find((s) => time >= s.start - 0.05 && time < s.end - 0.5 && !done.includes(s.uuid)) ?? null;
}

// ---------- sound ----------
export type SoundFx = { normalize: boolean; night: boolean; voice: boolean; bands: number[] };
export const EQ_BANDS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
export const EQ_PRESETS: Record<string, number[]> = {
  flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  bass: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0],
  treble: [0, 0, 0, 0, 0, 1, 2, 4, 5, 6],
  vocal: [-2, -1, 0, 1, 3, 4, 4, 3, 1, 0],
  rock: [4, 3, 2, 0, -1, -1, 1, 3, 4, 4],
  electronic: [5, 4, 1, 0, -2, 1, 0, 1, 4, 5],
  classical: [3, 2, 1, 0, 0, 0, -1, -1, 1, 2],
  jazz: [3, 2, 1, 2, -1, -1, 0, 1, 2, 3],
  speech: [-4, -3, -1, 1, 3, 4, 4, 3, 1, -1],
};
export const SOUND_DEFAULTS: SoundFx = { normalize: false, night: false, voice: false, bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] };
/** mpv filter labels Luna owns; only these are added or removed, so other filters stay. */
export const SOUND_LABELS = ["@luna_voice", "@luna_eq", "@luna_night", "@luna_norm"];

export function cleanSoundFx(raw: unknown): SoundFx {
  const r: any = raw && typeof raw === "object" ? raw : {};
  const bands = Array.isArray(r.bands) && r.bands.length === 10
    ? r.bands.map((g: unknown) => { const n = Math.round(Number(g)); return Number.isFinite(n) ? Math.max(-12, Math.min(12, n)) : 0; })
    : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  return { normalize: r.normalize === true, night: r.night === true, voice: r.voice === true, bands };
}

/** The preset the bands match, or "custom". */
export function presetOf(bands: number[]): string {
  const presets: Record<string, number[]> = {
    flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], bass: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0], treble: [0, 0, 0, 0, 0, 1, 2, 4, 5, 6],
    vocal: [-2, -1, 0, 1, 3, 4, 4, 3, 1, 0], rock: [4, 3, 2, 0, -1, -1, 1, 3, 4, 4], electronic: [5, 4, 1, 0, -2, 1, 0, 1, 4, 5],
    classical: [3, 2, 1, 0, 0, 0, -1, -1, 1, 2], jazz: [3, 2, 1, 2, -1, -1, 0, 1, 2, 3], speech: [-4, -3, -1, 1, 3, 4, 4, 3, 1, -1],
  };
  for (const [name, p] of Object.entries(presets)) if (p.length === bands.length && p.every((g, i) => g === bands[i])) return name;
  return "custom";
}

/** The labelled mpv audio filters for these settings, in playing order (voice → EQ → night → level). */
export function soundFilters(fx: SoundFx): { label: string; value: string }[] {
  const freqs = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
  const out: { label: string; value: string }[] = [];
  if (fx.voice) out.push({ label: "@luna_voice", value: "lavfi=[highpass=f=80,equalizer=f=250:t=q:w=1:g=-2,equalizer=f=2500:t=q:w=1.1:g=5]" });
  const eq = fx.bands.map((g, i) => ({ g: Math.max(-12, Math.min(12, Math.round(g))), f: freqs[i] })).filter((b) => b.g !== 0 && b.f);
  if (eq.length) out.push({ label: "@luna_eq", value: "lavfi=[" + eq.map((b) => `equalizer=f=${b.f}:t=o:w=1:g=${b.g}`).join(",") + "]" });
  if (fx.night) out.push({ label: "@luna_night", value: "lavfi=[acompressor=threshold=0.1:ratio=4:attack=10:release=250:makeup=2]" });
  if (fx.normalize) out.push({ label: "@luna_norm", value: "lavfi=[dynaudnorm=f=250:g=15:p=0.9:m=8]" });
  return out;
}

// ---------- A-B loop ----------
/** One press of the A-B key: set A, then B, then clear. B before (or right on) A starts over from here. */
export function abNext(a: number | null, b: number | null, t: number): { a: number | null; b: number | null } {
  if (a == null) return { a: t, b: null };
  if (b == null) return t > a + 0.5 ? { a, b: t } : { a: t, b: null };
  return { a: null, b: null };
}

// ---------- music sleep timer ----------
/** "off", "song" (end of this song) or a number of minutes. */
export type SleepChoice = "off" | "song" | number;
export function sleepDeadline(choice: SleepChoice, now: number): number | null {
  return typeof choice === "number" && choice > 0 ? now + choice * 60000 : null;
}
/** Volume in the last `fade` seconds before the timer stops the music (a gentle fade instead of a cut). */
export function sleepFadeVolume(base: number, leftSec: number, fade = 20): number {
  if (!(leftSec < fade)) return base;
  return Math.max(0, Math.round(base * Math.max(0, leftSec) / fade));
}
