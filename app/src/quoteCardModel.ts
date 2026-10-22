/** Quote cards: a subtitle line set over a frame of the film, sized to fit. Pure (text measuring is passed in). */
export type CardFormat = "story" | "wide";
export type CardStyle = "cinema" | "poster" | "minimal";
export const CARD_SIZE: Record<CardFormat, [number, number]> = { story: [1080, 1350], wide: [1600, 900] };

/** A subtitle line as a quote: styling tags, sound notes ([DOOR SLAMS]), speaker labels and dialogue dashes go; at most 280 characters. */
export function cleanQuote(text: string): string {
  const lines = String(text ?? "")
    .replace(/\{\\[^}]*\}/g, "")
    .replace(/<\/?[a-z][^>]*>/gi, "")
    .replace(/\[[^\]]*\]|\([A-ZÇĞİÖŞÜ\s]{3,}\)/g, "")
    .split(/\r?\n|\\N/)
    .map((l) => l.replace(/^\s*[-–—]\s*/, "").replace(/^[A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜ .'-]{1,24}:\s*/, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const out = lines.join("\n");
  return out.length > 280 ? out.slice(0, 279).replace(/\s+\S*$/, "") + "…" : out;
}

/** Word-wraps text to a width; explicit line breaks are kept; a single overlong word stays on its own line. */
export function wrapText(text: string, width: number, measure: (s: string) => number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const w of para.split(/\s+/).filter(Boolean)) {
      const next = line ? line + " " + w : w;
      if (!line || measure(next) <= width) line = next;
      else { out.push(line); line = w; }
    }
    if (line) out.push(line);
  }
  return out;
}

/** The largest font size (from max down to min, step 2) whose wrapped lines fit the box; at min the lines are cut with an ellipsis. */
export function fitQuote(text: string, box: { w: number; h: number }, measure: (s: string, size: number) => number, o: { max: number; min: number; lineHeight: number }): { size: number; lines: string[] } {
  for (let size = o.max; size >= o.min; size -= 2) {
    const lines = wrapText(text, box.w, (s) => measure(s, size));
    if (lines.length * size * o.lineHeight <= box.h) return { size, lines };
  }
  const size = o.min;
  const max = Math.max(1, Math.floor(box.h / (size * o.lineHeight)));
  const lines = wrapText(text, box.w, (s) => measure(s, size));
  if (lines.length <= max) return { size, lines };
  const kept = lines.slice(0, max);
  kept[max - 1] = kept[max - 1].replace(/\s*\S*$/, "") + "…";
  return { size, lines: kept };
}
