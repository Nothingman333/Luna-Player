/** TMDB extras for a title page: where it can be watched (JustWatch data, attribution required) and its title logo. Pure. */
export type Provider = { id: number; name: string; logo: string | null };
export type Providers = { link: string | null; flatrate: Provider[]; rent: Provider[]; buy: Provider[] };

const list = (x: unknown): Provider[] =>
  Array.isArray(x) ? x.filter((p) => p && Number.isInteger(p.provider_id) && typeof p.provider_name === "string")
    .map((p) => ({ id: p.provider_id, name: String(p.provider_name).slice(0, 60), logo: typeof p.logo_path === "string" ? p.logo_path : null }))
    .filter((p, i, rows) => rows.findIndex(row => row.id === p.id) === i) : [];

function providerLink(raw: unknown): string | null {
  try { const u = new URL(typeof raw === "string" ? raw : ""); return u.protocol === "https:" && !u.username && !u.password ? u.href : null; } catch { return null; }
}

/** /{kind}/{id}/watch/providers → the first region (in the given order) that has any offer. */
export function parseProviders(json: unknown, regions: string[]): { region: string; providers: Providers } | null {
  const results = (json as { results?: Record<string, Record<string, unknown>> })?.results;
  if (!results || typeof results !== "object") return null;
  for (const region of regions) {
    const r = results[region];
    if (!r) continue;
    const p: Providers = { link: providerLink(r.link), flatrate: list(r.flatrate), rent: list(r.rent), buy: list(r.buy) };
    if (p.flatrate.length || p.rent.length || p.buy.length) return { region, providers: p };
  }
  return null;
}

/** The best title logo of /{kind}/{id}/images: the UI language first, then English, then no language; the widest wins. Returns the TMDB path or null. */
export function pickLogo(images: unknown, lang: string): string | null {
  const logos = (images as { logos?: { file_path?: string; iso_639_1?: string | null; width?: number; vote_average?: number }[] })?.logos;
  if (!Array.isArray(logos)) return null;
  const rank = (l: { iso_639_1?: string | null }) => (l.iso_639_1 === lang ? 0 : l.iso_639_1 === "en" ? 1 : !l.iso_639_1 ? 2 : 9);
  const ok = logos.filter((l) => l && typeof l.file_path === "string" && /^\/[\w-]+\.(png|svg)$/i.test(l.file_path) && rank(l) < 9);
  const finite = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0;
  ok.sort((a, b) => rank(a) - rank(b) || finite(b.width) - finite(a.width) || finite(b.vote_average) - finite(a.vote_average));
  return ok[0]?.file_path ?? null;
}
/** TMDB serves SVG logos only at the original size. */
export const logoUrl = (path: string, img: string) => img + (path.toLowerCase().endsWith(".svg") ? "original" : "w500") + path;
