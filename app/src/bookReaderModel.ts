// Pure helpers of the book reader (no React, no epub.js), kept apart so they can be tested on their own.

/** Opens the first place that still exists in the file. A saved place (or a quoted one from another
 *  edition of the book) can point past the end of a file that was replaced; epub.js then rejects with
 *  "No Section Found". That must not make the whole book unreadable: the next place is tried and, last,
 *  the start of the book. `skipped` counts the places that could not be shown. */
export async function displayFirstWorking(display: (target?: string) => Promise<unknown>, targets: (string | undefined)[]): Promise<{ target?: string; skipped: number }> {
  let skipped = 0;
  for (const t of targets) {
    if (!t) continue;
    try { await display(t); return { target: t, skipped }; } catch { skipped++; }
  }
  // a book whose very start cannot be shown really is broken: that error is the caller's
  await display();
  return { skipped };
}

/** The reading position (0..1) estimated from the chapter file and the page in it, for the time before the
 *  page positions of the whole book are known (they are generated in the background and are not there
 *  when the book is closed again quickly). undefined: nothing to estimate from. */
export function spineProgress(index: unknown, count: unknown, page?: number, pages?: number, atEnd?: boolean): number | undefined {

  if (typeof index !== "number" || typeof count !== "number" || !Number.isFinite(index) || !Number.isFinite(count) || !Number.isInteger(index) || !Number.isInteger(count) || !(count > 0) || index < 0 || index >= count) return undefined;
  if(atEnd)return 1;
  const within = pages && pages > 0 && page && page > 0 ? Math.min(1, (page - 1) / pages) : 0;
  return Math.max(0, Math.min(1, (index + within) / count));
}
