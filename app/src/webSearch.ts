/**
 * Luna Web's address bar: which search engine a typed phrase goes to, and "bang" shortcuts
 * ("!w dune", "!yt trailer", "!imdb arrival") that go straight to another site's search.
 * Pure: the chosen engine is set from Settings (see browserModel.setSearchEngine).
 */
export type Engine = { id: string; name: string; url: string };

export const ENGINES: Engine[] = [
  { id: "google", name: "Google", url: "https://www.google.com/search?q=%s" },
  { id: "ddg", name: "DuckDuckGo", url: "https://duckduckgo.com/?q=%s" },
  { id: "bing", name: "Bing", url: "https://www.bing.com/search?q=%s" },
  { id: "brave", name: "Brave Search", url: "https://search.brave.com/search?q=%s" },
  { id: "startpage", name: "Startpage", url: "https://www.startpage.com/do/search?q=%s" },
  { id: "kagi", name: "Kagi", url: "https://kagi.com/search?q=%s" },
];

/** Short names for the film, music and book part of Luna, plus the usual ones. `{lang}` is the interface language. */
export const BANGS: Record<string, { name: string; url: string }> = {
  w: { name: "Wikipedia", url: "https://www.wikipedia.org/search-redirect.php?family=wikipedia&language={lang}&search=%s" },
  yt: { name: "YouTube", url: "https://www.youtube.com/results?search_query=%s" },
  imdb: { name: "IMDb", url: "https://www.imdb.com/find/?q=%s" },
  tmdb: { name: "TMDB", url: "https://www.themoviedb.org/search?query=%s" },
  lb: { name: "Letterboxd", url: "https://letterboxd.com/search/%s/" },
  gr: { name: "Goodreads", url: "https://www.goodreads.com/search?q=%s" },
  gh: { name: "GitHub", url: "https://github.com/search?q=%s" },
  maps: { name: "Google Maps", url: "https://www.google.com/maps/search/%s" },
  tr: { name: "Google Translate", url: "https://translate.google.com/?sl=auto&text=%s&op=translate" },
  g: { name: "Google", url: "https://www.google.com/search?q=%s" },
  ddg: { name: "DuckDuckGo", url: "https://duckduckgo.com/?q=%s" },
};

/** A custom engine address: https (or http on this computer), exactly one %s. */
export function validTemplate(t: string): boolean {
  const s = String(t ?? "").trim();
  if ((s.match(/%s/g) ?? []).length !== 1) return false;
  try {
    const u = new URL(s.replace("%s", "x"));
    return !u.username&&!u.password&&(u.protocol === "https:" || (u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname)));
  } catch { return false; }
}

/** The template for a saved choice: a known id, or "custom:<address>" (a SearXNG on your own server, say). */
export function templateFor(choice: string | null | undefined): string {
  const c = String(choice ?? "");
  if (c.startsWith("custom:") && validTemplate(c.slice(7))) return c.slice(7).trim();
  if(c==="yandex")return "https://yandex.com/search/?text=%s";
  if(c==="ecosia")return "https://www.ecosia.org/search?q=%s";
  return (ENGINES.find((e) => e.id === c) ?? ENGINES[0]).url;
}

/** "!w dune" → { bang: "w", rest: "dune" }; null when the phrase doesn't start with a known bang. */
export function parseBang(text: string): { bang: string; rest: string } | null {
  const m = text.trim().match(/^!([a-z0-9]{1,8})\s+(.+)$/i);
  if (!m) return null;
  const bang = m[1].toLowerCase();
  return BANGS[bang] ? { bang, rest: m[2].trim() } : null;
}

/** The search address for a typed phrase. */
export function searchAddress(text: string, template: string, lang = "en"): string {
  const b = parseBang(text);
  const tpl = b ? BANGS[b.bang].url.replace("{lang}", lang === "tr" ? "tr" : "en") : template;
  return tpl.replace("%s", encodeURIComponent(b ? b.rest : text.trim()));
}

/** The function browserModel calls for a typed phrase: the chosen engine (or custom address) plus bangs. */
export const makeResolver = (choice: string | null | undefined, lang = "en") => { const tpl = templateFor(choice); return (text: string) => searchAddress(text, tpl, lang); };
