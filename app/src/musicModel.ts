// Pure helpers of the music page (no React, no Tauri), kept apart so they can be tested on their own.

/** Lower case without accents or Turkish dots: "Şarkı", "SARKI" and "sarki" are one word when searching. */
export function searchFold(s: unknown): string {
  return String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Every word of the (already folded) search is somewhere in the fields together, so "tarkan simarik" finds a song by title and artist. */
export function matchesSearch(folded: string, ...fields: (string | undefined | null)[]): boolean {
  if (!folded) return true;
  const hay = fields.map((f) => (f ? searchFold(f) : "")).join(" ");
  return folded.split(" ").every((w) => hay.includes(w));
}

type Playable = { src: string };

/** Shuffle turned off: where the song playing now stands in the order it came from.
 *  The same song can be in a queue twice, so the very item is looked for first, the address only after that. */
export function restoreIndex<T extends Playable>(original: T[], cur: T | undefined): number {
  if (!cur) return 0;
  const same = original.indexOf(cur);
  if (same >= 0) return same;
  const bySrc = original.findIndex((x) => x.src === cur.src);
  return bySrc >= 0 ? bySrc : 0;
}

/** Which row of a playlist is the one playing: none unless the queue was started from this very list, and
 *  the exact row (a song can be in a list twice; another list holding the same song is not "playing"). */
export function playingRowIndex(items: Playable[], now: Playable | undefined, queueIndex: number, ours: boolean, shuffled: boolean): number {
  if (!ours || !now) return -1;
  if (!shuffled && items[queueIndex]?.src === now.src) return queueIndex;
  const exact=items.indexOf(now);if(exact>=0)return exact;
  return items.findIndex((x) => x.src === now.src);
}

/** How far a key press moves the play position, in seconds (null: not a seek key). */
export function seekKeyDelta(key: string, shift = false): number | null {
  switch (key) {
    case "ArrowRight": return shift ? 15 : 5;
    case "ArrowLeft": return shift ? -15 : -5;
    case "PageUp": return 30;
    case "PageDown": return -30;
    default: return null;
  }
}
