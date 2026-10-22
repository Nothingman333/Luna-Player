/** Pure playback bookkeeping, kept apart from React so it can be tested without a player. */
export type Progress = { path: string; title: string; time: number; duration: number };
type EpisodeFile = { path: string; season?: number; episode?: number };

/** Natural file-name order ("Episode 2" before "Episode 10"). */
export const naturalPath = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

/** The place that may be written for the file on screen. mpv announces a new path before that file's own time and
 *  duration, so until its resume point has been read (`ready`), nothing may be recorded for it: film A's place
 *  must never be saved onto film B. */
export function recordableProgress(path: string | null, title: string, time: number, duration: number, ready: string | null, music: boolean): Progress | null {
  return path && duration > 0 && !music && ready === path ? { path, title, time: Number.isFinite(time) && time > 0 ? time : 0, duration } : null;
}

/** The last place to write when playback leaves `before` (for another file, or for none). Nothing is written for a
 *  file the user took off "Continue watching" meanwhile (`stillListed`), so a removal is never undone. */
export function leftBehind(before: string | null, now: string | null, last: Progress | null, stillListed: boolean): Progress | null {
  return before && before !== now && last?.path === before && stillListed ? last : null;
}

/** The episode after (1) or before (-1) the one at `path` in a show's sorted files. Two copies of the same
 *  episode (720p and 1080p) are one step, so "next" never replays the same episode. */
export function episodeNeighbor<T extends EpisodeFile>(files: T[], path: string, dir: 1 | -1): T | undefined {
  const at = files.findIndex((f) => f.path === path);
  if (at < 0) return undefined;
  const cur = files[at];
  const same = (f: T) => cur.episode != null && f.episode != null && f.episode === cur.episode && (f.season ?? 0) === (cur.season ?? 0);
  for (let i = at + dir; i >= 0 && i < files.length; i += dir) if (!same(files[i])) return files[i];
  return undefined;
}
