import { SEARCH_BANGS, bangHome } from "./browserSearch";
import { browserAddress } from "./browserModel";

/**
 * Luna Web search: which engine answers plain words, and the "!" shortcuts that jump straight to a
 * site's own search ("!yt dune trailer", "!w Ay"). Pure helpers; Browser.tsx stores the choice.
 */
export type SearchEngineId = "google" | "duckduckgo" | "bing" | "brave" | "startpage" | "ecosia" | "yandex";
export type SearchEngine = { id: SearchEngineId; name: string; mark: string; home: string; search: (query: string) => string };

const q = encodeURIComponent;
export const SEARCH_ENGINES: SearchEngine[] = [
  { id: "google", name: "Google", mark: "G", home: "https://www.google.com/", search: s => "https://www.google.com/search?q=" + q(s) },
  { id: "duckduckgo", name: "DuckDuckGo", mark: "D", home: "https://duckduckgo.com/", search: s => "https://duckduckgo.com/?q=" + q(s) },
  { id: "bing", name: "Bing", mark: "B", home: "https://www.bing.com/", search: s => "https://www.bing.com/search?q=" + q(s) },
  { id: "brave", name: "Brave Search", mark: "Br", home: "https://search.brave.com/", search: s => "https://search.brave.com/search?q=" + q(s) },
  { id: "startpage", name: "Startpage", mark: "S", home: "https://www.startpage.com/", search: s => "https://www.startpage.com/do/search?q=" + q(s) },
  { id: "ecosia", name: "Ecosia", mark: "E", home: "https://www.ecosia.org/", search: s => "https://www.ecosia.org/search?q=" + q(s) },
];
SEARCH_ENGINES.push({ id: "yandex", name: "Yandex", mark: "Y", home: "https://yandex.com/", search: s => "https://yandex.com/search/?text=" + q(s) });
export const ENGINE_KEY = "lunaWebSearchEngine";

export function searchEngine(id: unknown): SearchEngine {
  return SEARCH_ENGINES.find(e => e.id === id) ?? SEARCH_ENGINES[0];
}

/** "!yt …" shortcuts. `tr` is the interface language: Wikipedia and Translate follow it. */
export type Bang = { key: string; name: string; home: (tr: boolean) => string; search: (query: string, tr: boolean) => string };
export const BANGS: Bang[] = [
  { key: "yt", name: "YouTube", home: () => "https://www.youtube.com/", search: s => "https://www.youtube.com/results?search_query=" + q(s) },
  { key: "w", name: "Wikipedia", home: tr => `https://${tr ? "tr" : "en"}.wikipedia.org/`, search: (s, tr) => `https://${tr ? "tr" : "en"}.wikipedia.org/w/index.php?search=` + q(s) },
  { key: "lb", name: "Letterboxd", home: () => "https://letterboxd.com/", search: s => "https://letterboxd.com/search/" + q(s) + "/" },
  { key: "tmdb", name: "TMDB", home: () => "https://www.themoviedb.org/", search: s => "https://www.themoviedb.org/search?query=" + q(s) },
  { key: "imdb", name: "IMDb", home: () => "https://www.imdb.com/", search: s => "https://www.imdb.com/find/?q=" + q(s) },
  { key: "gr", name: "Goodreads", home: () => "https://www.goodreads.com/", search: s => "https://www.goodreads.com/search?q=" + q(s) },
  { key: "1000k", name: "1000Kitap", home: () => "https://1000kitap.com/", search: s => "https://1000kitap.com/ara?q=" + q(s) },
  { key: "eksi", name: "Ekşi Sözlük", home: () => "https://eksisozluk.com/", search: s => "https://eksisozluk.com/?q=" + q(s) },
  { key: "r", name: "Reddit", home: () => "https://www.reddit.com/", search: s => "https://www.reddit.com/search/?q=" + q(s) },
  { key: "gh", name: "GitHub", home: () => "https://github.com/", search: s => "https://github.com/search?q=" + q(s) },
  { key: "maps", name: "Google Maps", home: () => "https://www.google.com/maps", search: s => "https://www.google.com/maps/search/" + q(s) },
  { key: "tr", name: "Google Translate", home: () => "https://translate.google.com/", search: (s, tr) => `https://translate.google.com/?sl=auto&tl=${tr ? "tr" : "en"}&text=` + q(s) },
  { key: "g", name: "Google", home: () => "https://www.google.com/", search: s => "https://www.google.com/search?q=" + q(s) },
  { key: "ddg", name: "DuckDuckGo", home: () => "https://duckduckgo.com/", search: s => "https://duckduckgo.com/?q=" + q(s) },
];

// Keep the two deliveries' shortcuts together; Web Plus owns shared keys (notably localized Wikipedia).
for (const bang of SEARCH_BANGS) { const key = bang.key;
  if (!BANGS.some(b => b.key === key)) BANGS.push({ key, name: bang.name, home: () => bangHome(bang), search: query => bang.template.replace("%s", () => encodeURIComponent(query)) });
}

/** "!yt dune" / "dune !yt" → the bang and the words; anything else → null. Keys are case-insensitive. */
export function parseBang(input: string): { bang: Bang; query: string } | null {
  const text = input.trim();
  const lead = /^!([\p{L}\p{N}]+)(?:\s+([\s\S]*))?$/u.exec(text), tail = /^([\s\S]*?)\s+!([\p{L}\p{N}]+)$/u.exec(text);
  const [key, query] = lead ? [lead[1], lead[2] ?? ""] : tail ? [tail[2], tail[1]] : ["", ""];
  const wanted = key.toLocaleLowerCase("en-US"), canonical = SEARCH_BANGS.find(b => (b.aliases ?? []).includes(wanted))?.key ?? wanted;
  const bang = key ? BANGS.find(b => b.key === canonical) : undefined;
  return bang ? { bang, query: query.trim() } : null;
}

/** What the address bar opens for this text: a bang target, an address, or a search with the chosen engine. */
export function resolveWebInput(input: string, engine: SearchEngine, tr: boolean): string {
  const hit = parseBang(input);
  if (hit) return browserAddress(hit.query ? hit.bang.search(hit.query, tr) : hit.bang.home(tr));
  return browserAddress(input, engine.search);
}

/** The words of a results page this engine (or a bang site) made, to show instead of a long URL. */
export function searchedWords(url: string): string | null {
  try {
    const u = new URL(url), host = u.hostname.replace(/^www\./, "");
    const key = host === "yandex.com" ? "text" : host === "youtube.com" ? "search_query" : host === "themoviedb.org" ? "query" : /(^|\.)wikipedia\.org$/.test(host) ? "search" : "q";
    const isResults = /(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|search\.brave\.com|startpage\.com|ecosia\.org|yandex\.com)$/.test(host)
      || (host === "youtube.com" && u.pathname === "/results") || (host === "themoviedb.org" && u.pathname.startsWith("/search"))
      || (/(^|\.)wikipedia\.org$/.test(host) && u.pathname === "/w/index.php");
    const words = isResults ? u.searchParams.get(key) : null;
    return words && words.trim() ? words.trim().slice(0, 200) : null;
  } catch { return null; }
}
