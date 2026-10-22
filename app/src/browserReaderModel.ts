/**
 * Luna Web reading view and page kinds. The reader shows the text the explicit page reader
 * (browserPage.js) returns: "# " headings, "- " list items and " | " table cells, one block per line.
 */
export type ReaderBlock =
  | { kind: "heading"; level: number; text: string }
  | { kind: "item"; text: string }
  | { kind: "row"; cells: string[] }
  | { kind: "para"; text: string };

export function readerBlocks(text: string, title = ""): ReaderBlock[] {
  const blocks: ReaderBlock[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) { blocks.push({ kind: "heading", level: heading[1].length, text: heading[2] }); continue; }
    if (/^- \S/.test(line)) { blocks.push({ kind: "item", text: line.slice(2) }); continue; }
    if (line.includes(" | ")) { const cells = line.split(" | ").map(c => c.trim()).filter(Boolean); if (cells.length > 1) { blocks.push({ kind: "row", cells: cells.slice(0, 12) }); continue; } }
    blocks.push({ kind: "para", text: line });
  }
  // A first heading that only restates the page title adds nothing under the reader's own title.
  const same = (a: string) => a.replace(/\s+/g, " ").trim().toLocaleLowerCase();
  if (title && blocks[0]?.kind === "heading" && (same(title).startsWith(same(blocks[0].text)) || same(blocks[0].text) === same(title))) blocks.shift();
  return blocks;
}

/** Words and minutes at an unhurried pace (about 220 words a minute; at least one minute). */
export function readingStats(text: string, wordsPerMinute = 220): { words: number; minutes: number } {
  const words = (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;
  return { words, minutes: Math.max(1, Math.round(words / wordsPerMinute)) };
}

/** Plain text of the blocks for copying or reading aloud. */
export const readerPlainText = (blocks: ReaderBlock[]) => blocks.map(b => b.kind === "row" ? b.cells.join(" · ") : b.kind === "item" ? "• " + b.text : b.text).join("\n\n");

export type ReaderPrefs = { size: number; width: "narrow" | "wide"; theme: "luna" | "sepia" | "paper" | "night"; font: "serif" | "sans" };
export const READER_KEY = "lunaWebReader";
export const defaultReaderPrefs: ReaderPrefs = { size: 18, width: "narrow", theme: "luna", font: "serif" };
export function readReaderPrefs(raw: string | null): ReaderPrefs {
  try {
    const x = JSON.parse(raw || "{}");
    return {
      size: Number.isFinite(x?.size) ? Math.min(28, Math.max(14, Math.round(x.size))) : defaultReaderPrefs.size,
      width: x?.width === "wide" ? "wide" : "narrow",
      theme: ["luna", "sepia", "paper", "night"].includes(x?.theme) ? x.theme : "luna",
      font: x?.font === "sans" ? "sans" : "serif",
    };
  } catch { return { ...defaultReaderPrefs }; }
}

/**
 * A page Luna's own player can open with mpv + yt-dlp: a video page of a few well-known sites, or a
 * direct media file / stream. Only the address decides; nothing is read from the page.
 */
export function playableInLuna(url: string): "video" | "audio" | "stream" | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.replace(/^(www|m|music)\./, ""), path = u.pathname;
  if (host === "youtube.com" && (path === "/watch" && u.searchParams.get("v") || /^\/(shorts|live)\/[\w-]{6,}/.test(path))) return "video";
  if (host === "youtu.be" && /^\/[\w-]{6,}/.test(path)) return "video";
  if (host === "vimeo.com" && /^\/\d{5,}/.test(path)) return "video";
  if (host === "dailymotion.com" && path.startsWith("/video/")) return "video";
  if (host === "twitch.tv" && /^\/[\w]{3,25}\/?$/.test(path) && !/^\/(directory|downloads|jobs|p|search|settings|subscriptions|turbo|videos|wallet)\/?$/.test(path)) return "stream";
  if (host === "twitch.tv" && /^\/videos\/\d+/.test(path)) return "video";
  if (host === "soundcloud.com" && /^\/[\w-]+\/[\w-]+\/?$/.test(path) && !/^\/(discover|search|stream|you|upload)\b/.test(path)) return "audio";
  if (host === "bandcamp.com" || host.endsWith(".bandcamp.com")) return /^\/(track|album)\//.test(path) ? "audio" : null;
  if (/\.(mp4|mkv|webm|mov|m4v|avi|ts)$/i.test(path)) return "video";
  if (/\.(mp3|flac|m4a|ogg|opus|wav|aac)$/i.test(path)) return "audio";
  if (/\.(m3u8|mpd)$/i.test(path)) return "stream";
  return null;
}

/** Address shown while the field is not being edited: scheme and "www." dimmed, host emphasised. */
export function prettyAddress(url: string): { secure: boolean; host: string; rest: string } | null {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return null;
    const rest = (u.pathname === "/" ? "" : u.pathname) + u.search + u.hash;
    return { secure: u.protocol === "https:", host: u.host.replace(/^www\./, ""), rest: rest.length > 160 ? rest.slice(0, 159) + "…" : rest };
  } catch { return null; }
}
