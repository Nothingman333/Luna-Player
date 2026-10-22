/** Pure helpers for scrobbling (ListenBrainz and Last.fm): when a play counts, the request bodies and
 *  Last.fm's MD5 signature. No imports: the regression script loads this file as it is. */

export type ScrobbleTrack = { artist: string; title: string; album?: string; duration?: number };

/** A play counts after half the song or 4 minutes (the rule both services use); songs under 30 s never. */
export function scrobbleDue(played: number, duration: number): boolean {
  if (!(duration > 30) || !(played > 0)) return false;
  return played >= Math.min(duration / 2, 240);
}

/** Artist and title from a queue item; a YouTube title "Artist - Song (Official Video)" is split. */
export function scrobbleTrack(q: { title?: string; artist?: string; album?: string; duration?: number; radio?: boolean; podcast?: string; book?: string }): ScrobbleTrack | null {
  if (!q || q.radio || q.podcast || q.book) return null;
  let title = String(q.title ?? "").trim(), artist = String(q.artist ?? "").replace(/\s*-\s*Topic$/i, "").replace(/VEVO$/i, "").trim();
  const dash = title.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (dash && (!artist || dash[1].toLowerCase().includes(artist.toLowerCase()) || artist.toLowerCase().includes(dash[1].toLowerCase()))) { artist = dash[1].trim(); title = dash[2].trim(); }
  title = title.replace(/\s*[([](official|resmi|lyric|lyrics|audio|video|music video|klip|hd|4k)[^)\]]*[)\]]/gi, "").trim();
  if (!title || !artist) return null;
  return { artist, title, album: q.album && q.album !== q.title ? String(q.album) : undefined, duration: Number.isFinite(q.duration) && (q.duration ?? 0) > 0 ? Math.round(q.duration!) : undefined };
}

/** ListenBrainz submit-listens body: "single" (a finished listen) or "playing_now". */
export function listenBrainzBody(kind: "single" | "playing_now", t: ScrobbleTrack, listenedAt: number): any {
  const meta: any = { artist_name: t.artist, track_name: t.title, additional_info: { media_player: "Luna Player", submission_client: "Luna Player" } };
  if (t.album) meta.release_name = t.album;
  if (t.duration) meta.additional_info.duration_ms = t.duration * 1000;
  const listen: any = { track_metadata: meta };
  if (kind === "single") listen.listened_at = Math.floor(listenedAt / 1000);
  return { listen_type: kind, payload: [listen] };
}

/** MD5 of a string's UTF-8 bytes, as lower-case hex (Last.fm signs its calls with it). */
export function md5(text: string): string {
  const bytes = Array.from(new TextEncoder().encode(text));
  const len = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 0; i < 8; i++) bytes.push(i < 4 ? (len >>> (8 * i)) & 0xff : Math.floor(len / 2 ** (8 * i)) & 0xff);
  const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);
  const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  for (let off = 0; off < bytes.length; off += 64) {
    const M = Array.from({ length: 16 }, (_, i) => bytes[off + i * 4] | (bytes[off + i * 4 + 1] << 8) | (bytes[off + i * 4 + 2] << 16) | (bytes[off + i * 4 + 3] << 24));
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F: number, g: number;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      F = (F + A + K[i] + M[g]) | 0;
      A = D; D = C; C = B;
      B = (B + ((F << S[i]) | (F >>> (32 - S[i])))) | 0;
    }
    a0 = (a0 + A) | 0; b0 = (b0 + B) | 0; c0 = (c0 + C) | 0; d0 = (d0 + D) | 0;
  }
  return [a0, b0, c0, d0].map((n) => Array.from({ length: 4 }, (_, i) => ((n >>> (8 * i)) & 0xff).toString(16).padStart(2, "0")).join("")).join("");
}

/** Last.fm api_sig: every parameter except format/callback, sorted by name, name+value joined, then the secret. */
export function lastfmSignature(params: Record<string, string>, secret: string): string {
  const keys = Object.keys(params).filter((k) => k !== "format" && k !== "callback").sort();
  return md5(keys.map((k) => k + params[k]).join("") + secret);
}

// ---------- Trakt (films and series) ----------
export type TraktTarget = { kind: "movie"; tmdb: number } | { kind: "episode"; tmdb: number; season: number; episode: number };

/** What Trakt should hear about from a library item and the file playing: a film by its TMDB id, an episode by its show's id, season and number. */
export function traktTarget(item: { meta?: { id?: number; kind?: string } | null; parsed?: { kind?: string; season?: number; episode?: number }; files?: { path: string; season?: number; episode?: number }[] } | null | undefined, path: string | null): TraktTarget | null {
  const id = Number(item?.meta?.id);
  if (!item || !Number.isInteger(id) || id <= 0) return null;
  const kind = item.meta?.kind ?? item.parsed?.kind;
  if (kind === "movie") return { kind: "movie", tmdb: id };
  if (kind !== "tv") return null;
  const f = item.files?.find((x) => x.path === path);
  const season = Number(f?.season ?? item.parsed?.season), episode = Number(f?.episode ?? item.parsed?.episode);
  return Number.isInteger(season) && Number.isInteger(episode) && episode > 0 ? { kind: "episode", tmdb: id, season, episode } : null;
}

/** The body of a Trakt scrobble call; progress is kept within 0–100 with two decimals. */
export function traktBody(t: TraktTarget, progress: number): any {
  const p = Math.round(Math.max(0, Math.min(100, Number.isFinite(progress) ? progress : 0)) * 100) / 100;
  return t.kind === "movie"
    ? { movie: { ids: { tmdb: t.tmdb } }, progress: p }
    : { show: { ids: { tmdb: t.tmdb } }, episode: { season: t.season, number: t.episode }, progress: p };
}

// ---------- Discord presence ----------
export type PresenceInput = { mode: "film" | "music"; title: string; artist?: string; paused: boolean; time: number; duration: number; now: number; labels: { film: string; music: string; paused: string } };
/** The activity Discord shows: what plays, by whom, and (while it plays) the time left. */
export function presenceActivity(p: PresenceInput): any {
  const cut = (s: string) => (s.length > 120 ? s.slice(0, 117) + "…" : s);
  const title = cut(p.title.trim() || "Luna Player");
  const a: any = {
    type: p.mode === "music" ? 2 : 3,
    details: title,
    state: cut(p.paused ? p.labels.paused : p.mode === "music" ? (p.artist?.trim() || p.labels.music) : p.labels.film),
    assets: { large_image: "luna", large_text: "Luna Player" },
  };
  if (!p.paused && p.duration > 0 && p.time >= 0 && p.time <= p.duration) {
    a.timestamps = { start: Math.round(p.now - p.time * 1000), end: Math.round(p.now + (p.duration - p.time) * 1000) };
  }
  return a;
}
