/** Pure helpers for the one-word-at-a-time reader (RSVP). No imports: the regression script loads it as it is. */

/** Words in reading order; punctuation stays with its word. */
export function rsvpWords(text: string): string[] {
  return String(text ?? "").replace(/\u00ad/g, "").split(/\s+/).map((w) => w.trim()).filter(Boolean);
}

/** The letter the eye should land on (optimal recognition point), counted from the first letter or digit. */
export function orpIndex(word: string): number {
  const lead = word.search(/[\p{L}\p{N}]/u);
  const start = lead < 0 ? 0 : lead;
  const core = word.slice(start).replace(/[^\p{L}\p{N}'’-]+$/u, "");
  const n = core.length;
  const off = n <= 1 ? 0 : n <= 5 ? 1 : n <= 9 ? 2 : n <= 13 ? 3 : 4;
  return Math.min(word.length - 1, start + off);
}

/** The word split around its recognition letter: [before, letter, after]. */
export function splitAtOrp(word: string): [string, string, string] {
  if (!word) return ["", "", ""];
  const i = orpIndex(word);
  return [word.slice(0, i), word.charAt(i), word.slice(i + 1)];
}

/** How long a word stays (ms): longer after a comma, longer still at the end of a sentence or for a long word. */
export function wordDelay(word: string, wpm: number): number {
  const base = 60000 / Math.max(100, Math.min(1000, wpm || 300));
  let k = 1;
  if (/[.!?…]["'”’)»]*$/.test(word)) k = 2.2;
  else if (/[,;:—–]["'”’)»]*$/.test(word)) k = 1.5;
  if (word.replace(/[^\p{L}\p{N}]/gu, "").length > 8) k += 0.3;
  return Math.round(base * k);
}

/** Minutes left at this speed. */
export function minutesLeft(words: number, wpm: number): number {
  return Math.max(0, Math.ceil(words / Math.max(100, wpm || 300)));
}
