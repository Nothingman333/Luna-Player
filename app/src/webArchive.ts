/** Dead or changed page? The Internet Archive's newest copy of an address (archive.org's availability API). Pure parts only. */
export const waybackApi = (url: string) => "https://archive.org/wayback/available?url=" + encodeURIComponent(url);

/** The copy's address from the API's answer; null when there is none or it isn't an archive.org address. */
export function waybackSnapshot(json: unknown): string | null {
  const snap = (json as { archived_snapshots?: { closest?: { available?: boolean; url?: string; status?: string } } })?.archived_snapshots?.closest;
  if (!snap?.available || typeof snap.url !== "string") return null;
  try {
    const u = new URL(snap.url.replace(/^http:/, "https:"));
    return u.protocol === "https:" && /(^|\.)archive\.org$/.test(u.hostname) ? u.href : null;
  } catch { return null; }
}
/** Only http(s) addresses can have an archived copy. */
export const archivable = (url: string) => /^https?:\/\//i.test(url) && !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(url) && !/^https?:\/\/([^/]*\.)?archive\.org\//i.test(url);
