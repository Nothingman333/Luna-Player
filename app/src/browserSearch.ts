/**
 * Search engines for Luna Web's address bar. Self-contained on purpose (no imports) so that
 * browserModel.ts and the regression scripts can load it on its own.
 * A template is a plain https address with one %s where the encoded query goes.
 */
export type SearchEngine = { id: string; name: string; template: string };

export const SEARCH_ENGINES: SearchEngine[] = [
  { id: "google", name: "Google", template: "https://www.google.com/search?q=%s" },
  { id: "duckduckgo", name: "DuckDuckGo", template: "https://duckduckgo.com/?q=%s" },
  { id: "bing", name: "Bing", template: "https://www.bing.com/search?q=%s" },
  { id: "brave", name: "Brave Search", template: "https://search.brave.com/search?q=%s" },
  { id: "startpage", name: "Startpage", template: "https://www.startpage.com/do/search?q=%s" },
  { id: "ecosia", name: "Ecosia", template: "https://www.ecosia.org/search?q=%s" },
  { id: "yandex", name: "Yandex", template: "https://yandex.com/search/?text=%s" },
];

export const DEFAULT_SEARCH_ENGINE = "google";

/** Anything that is not a known engine id (old, damaged or hand-edited storage) means the default. */
export function cleanEngineId(raw: unknown): string {
  return typeof raw === "string" && SEARCH_ENGINES.some(engine => engine.id === raw) ? raw : DEFAULT_SEARCH_ENGINE;
}

export function searchTemplate(id: unknown): string {
  const wanted = cleanEngineId(id);
  return (SEARCH_ENGINES.find(engine => engine.id === wanted) ?? SEARCH_ENGINES[0]).template;
}

/** The address of a search for `query`. Only a template with exactly one %s and an https scheme is accepted. */
export function searchAddress(query: string, template: string = searchTemplate(DEFAULT_SEARCH_ENGINE)): string {
  const ok = typeof template === "string" && /^https:\/\//.test(template) && template.split("%s").length === 2;
  const use = ok ? template : searchTemplate(DEFAULT_SEARCH_ENGINE);
  const encoded = encodeURIComponent(query);
  return use.replace("%s", () => encoded);
}

/**
 * Quick searches ("bangs"): "!yt dune" or "dune !yt" searches YouTube for "dune", "!w moon" searches Wikipedia.
 * A bang on its own ("!yt") opens the site. Every template is https with exactly one %s (checked by the tests).
 */
export type SearchBang = { key: string; name: string; template: string; aliases?: string[]; tr?: string; en?: string };
export const SEARCH_BANGS: SearchBang[] = [
  { key: "yt", name: "YouTube", template: "https://www.youtube.com/results?search_query=%s", aliases: ["youtube"], tr: "Video", en: "Videos" },
  { key: "w", name: "Wikipedia", template: "https://en.wikipedia.org/w/index.php?search=%s", aliases: ["wiki", "wen"], tr: "Ansiklopedi (İngilizce)", en: "Encyclopedia" },
  { key: "wtr", name: "Vikipedi", template: "https://tr.wikipedia.org/w/index.php?search=%s", aliases: ["vikipedi", "vp"], tr: "Türkçe Vikipedi", en: "Turkish Wikipedia" },
  { key: "tmdb", name: "TMDB", template: "https://www.themoviedb.org/search?query=%s", tr: "Film ve dizi", en: "Films and series" },
  { key: "imdb", name: "IMDb", template: "https://www.imdb.com/find/?q=%s", tr: "Film ve oyuncu", en: "Films and cast" },
  { key: "lb", name: "Letterboxd", template: "https://letterboxd.com/search/%s/", aliases: ["letterboxd"], tr: "Film günlüğü", en: "Film diary" },
  { key: "gr", name: "Goodreads", template: "https://www.goodreads.com/search?q=%s", aliases: ["goodreads"], tr: "Kitap", en: "Books" },
  { key: "gut", name: "Project Gutenberg", template: "https://www.gutenberg.org/ebooks/search/?query=%s", aliases: ["gutenberg"], tr: "Ücretsiz klasikler", en: "Free classics" },
  { key: "lv", name: "LibriVox", template: "https://librivox.org/search?q=%s&search_form=advanced", aliases: ["librivox"], tr: "Ücretsiz sesli kitap", en: "Free audiobooks" },
  { key: "sp", name: "Spotify", template: "https://open.spotify.com/search/%s", aliases: ["spotify"], tr: "Müzik", en: "Music" },
  { key: "m", name: "Google Maps", template: "https://www.google.com/maps/search/%s", aliases: ["maps", "harita"], tr: "Harita", en: "Maps" },
  { key: "i", name: "Google Görseller", template: "https://www.google.com/search?tbm=isch&q=%s", aliases: ["img", "images", "gorsel"], tr: "Görseller", en: "Images" },
  { key: "r", name: "Reddit", template: "https://www.reddit.com/search/?q=%s", aliases: ["reddit"], tr: "Tartışmalar", en: "Discussions" },
  { key: "gh", name: "GitHub", template: "https://github.com/search?q=%s", aliases: ["github"], tr: "Kod", en: "Code" },
  { key: "g", name: "Google", template: "https://www.google.com/search?q=%s", aliases: ["google"] },
  { key: "ddg", name: "DuckDuckGo", template: "https://duckduckgo.com/?q=%s", aliases: ["duck"] },
  { key: "b", name: "Bing", template: "https://www.bing.com/search?q=%s", aliases: ["bing"] },
];

export function findBang(key: string): SearchBang | null {
  const k = (key || "").toLowerCase();
  return SEARCH_BANGS.find(b => b.key === k || (b.aliases ?? []).includes(k)) ?? null;
}

/** The site's home page of a bang: the template's origin. */
export const bangHome = (bang: SearchBang): string => new URL(bang.template.replace("%s", "")).origin + "/";

/** "!yt dune", "dune !yt" or a lone "!yt": the address to open, or null when the text has no known bang. */
export function resolveBang(input: string): { url: string; name: string; key: string; query: string } | null {
  const text = typeof input === "string" ? input.trim() : "";
  if (!text.includes("!") || text.length > 2000) return null;
  let key = "", query = "";
  const lead = /^!([\p{L}\p{N}]{1,12})(?:\s+([\s\S]*))?$/u.exec(text), tail = /^([\s\S]*?)\s+!([\p{L}\p{N}]{1,12})$/u.exec(text);
  if (lead) { key = lead[1]; query = (lead[2] || "").trim(); }
  else if (tail) { key = tail[2]; query = tail[1].trim(); }
  else return null;
  const bang = findBang(key);
  if (!bang) return null;
  if (!query) return { url: bangHome(bang), name: bang.name, key: bang.key, query: "" };
  return { url: searchAddress(query, bang.template), name: bang.name, key: bang.key, query };
}
