// OPDS: the open standard book catalogs speak (Atom feeds of books with download links).
// Project Gutenberg is read this way, and so is any catalog the user adds by address.
import { tt } from "./i18n";
import { useState } from "react";
import { invoke } from "./nativeCore";
import { store } from "./library";

export type Acq = { href: string; type: string; open: boolean };
export type OEntry = {
  id: string; title: string; author: string; summary?: string; cover?: string;
  /** download links (EPUB, PDF, comics) */
  acq: Acq[];
  /** a sub-catalog (a shelf, an author, a page of results) */
  nav?: string;
};
export type OFeed = { url: string; title: string; entries: OEntry[]; next?: string; search?: string };

const ACQ = "http://opds-spec.org/acquisition";
const BOOK_TYPES = /epub|pdf|cbz|comicbook/i;
export const kindOf = (type: string) => (/pdf/i.test(type) ? "pdf" : /cbz|comicbook/i.test(type) ? "cbz" : "epub");

export async function fetchText(url: string): Promise<string> {
  return invoke<string>("http_text", { url });
}

const kids = (el: Element, name: string) => Array.from(el.children).filter((c) => c.localName === name);
const kid = (el: Element, name: string) => kids(el, name)[0];
const text = (el?: Element) => el?.textContent?.trim() ?? "";
const XML_NS = "http://www.w3.org/XML/1998/namespace";
/** The base a link inside `el` resolves against: the feed's address, then each xml:base on the way down. */
function baseOf(el: Element | null, url: string): string {
  const chain: string[] = [];
  for (let e = el; e; e = e.parentElement) {
    const b = e.getAttributeNS(XML_NS, "base") ?? e.getAttribute("xml:base");
    if (b) chain.unshift(b);
  }
  return chain.reduce((acc, b) => { try { return new URL(b, acc).href; } catch { return acc; } }, url);
}

export function parseFeed(xml: string, url: string): OFeed {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const root = doc.documentElement;
  if (!root || root.localName !== "feed" || doc.getElementsByTagName("parsererror").length) throw new Error(tt("Bu adres bir OPDS kataloğu değil"));
  // (xml:base on the feed, an entry or the link itself moves where relative links point)
  const absAt = (el: Element, h: string) => { try { return new URL(h, baseOf(el, url)).href; } catch { return h; } };
  const feedLinks = kids(root, "link");
  const entries: OEntry[] = kids(root, "entry").map((e) => {
    const links = kids(e, "link").map((l) => ({ rel: l.getAttribute("rel") ?? "", href: absAt(l, l.getAttribute("href") ?? ""), type: l.getAttribute("type") ?? "" }));
    const acq = links.filter((l) => l.rel.startsWith(ACQ) && BOOK_TYPES.test(l.type))
      .map((l) => ({ href: l.href, type: l.type, open: l.rel === ACQ || l.rel === ACQ + "/open-access" }));
    const img = links.find((l) => l.rel === "http://opds-spec.org/image" || l.rel === "x-stanza-cover-image")
      ?? links.find((l) => /opds-spec\.org\/image\/thumbnail|x-stanza-cover-image-thumbnail/.test(l.rel));
    const nav = !acq.length ? links.find((l) => /opds-catalog|atom\+xml/.test(l.type) && l.rel !== "alternate")?.href : undefined;
    return {
      id: text(kid(e, "id")) || text(kid(e, "title")),
      title: text(kid(e, "title")),
      author: kids(e, "author").map((a) => text(kid(a, "name"))).filter(Boolean).join(", "),
      summary: text(kid(e, "summary")) || text(kid(e, "content")) || undefined,
      cover: img && !img.href.startsWith("data:") ? img.href : undefined,
      acq,
      nav,
    };
  });
  const next = feedLinks.find((l) => l.getAttribute("rel") === "next");
  const search = feedLinks.find((l) => l.getAttribute("rel") === "search");
  // a search template keeps its {searchTerms} as written: URL parsing would percent-encode it
  const tplAt = (el: Element) => { const h = el.getAttribute("href") ?? ""; return h.includes("{") ? keepBraces(absAt(el, h)) : absAt(el, h); };
  return {
    url, title: text(kid(root, "title")), entries,
    next: next ? absAt(next, next.getAttribute("href") ?? "") : undefined,
    search: search ? tplAt(search) + (/opensearchdescription/.test(search.getAttribute("type") ?? "") ? "#osd" : "") : undefined,
  };
}

const keepBraces = (u: string) => u.replace(/%7B/gi, "{").replace(/%7D/gi, "}");

export async function fetchFeed(url: string): Promise<OFeed> {
  // relative links resolve against where the feed really came from (after redirects)
  const [at, xml] = await invoke<[string, string]>("http_text_at", { url });
  return { ...parseFeed(xml, at || url), url };
}

/** The address to search a catalog with (an OpenSearch description is read once). */
export async function searchUrl(feed: OFeed, q: string): Promise<string | null> {
  if (!feed.search) return null;
  let tpl = feed.search;
  if (tpl.endsWith("#osd")) {
    const osdUrl = tpl.slice(0, -4);
    const k = "osd:" + osdUrl;
    tpl = store.get(k) ?? "";
    if (!tpl) {
      const doc = new DOMParser().parseFromString(await fetchText(osdUrl), "application/xml");
      // any prefix (os:Url) counts
      const urls = Array.from(doc.getElementsByTagNameNS("*", "Url"));
      const u = urls.find((x) => /atom|opds/.test(x.getAttribute("type") ?? "")) ?? urls[0];
      tpl = u?.getAttribute("template") ? keepBraces(new URL(u.getAttribute("template")!, osdUrl).href) : "";
      if (tpl) store.set(k, tpl);
    }
  }
  // every {searchTerms} (a template may ask for it twice); optional {x?} parts are left out
  tpl = keepBraces(tpl);
  return tpl ? tpl.replace(/\{searchTerms\}/g, encodeURIComponent(q)).replace(/\{[^}]*\?\}/g, "") : null;
}

// ---------- Project Gutenberg (built in) ----------
export const GUTENBERG = "https://www.gutenberg.org/ebooks/search.opds/?sort_order=downloads";
/** Gutenberg lists each book as a link to its own page; the book number gives the EPUB and the cover. */
export function gutenbergBooks(feed: OFeed): OEntry[] {
  return feed.entries.flatMap((e) => {
    const n = e.id.match(/\/ebooks\/(\d+)(?:\.opds)?$/)?.[1];
    if (!n) return [];
    return [{
      ...e, nav: undefined,
      cover: `https://www.gutenberg.org/cache/epub/${n}/pg${n}.cover.medium.jpg`,
      acq: [{ href: `https://www.gutenberg.org/ebooks/${n}.epub3.images`, type: "application/epub+zip", open: true }],
    }];
  });
}
export const gutenbergSearch = (q: string) => `https://www.gutenberg.org/ebooks/search.opds/?query=${encodeURIComponent(q)}`;

/** Gutenberg's most-read books, kept for a day. */
export async function gutenbergPopular(): Promise<OEntry[]> {
  const c = store.json<{ at: number; list: OEntry[] } | null>("gutPopular", null);
  if (c && Date.now() - c.at < 86400e3 && c.list.length) return c.list;
  const list = gutenbergBooks(await fetchFeed(GUTENBERG)).map(({ summary, ...e }) => e);
  store.set("gutPopular", JSON.stringify({ at: Date.now(), list }));
  return list;
}

// ---------- the user's own catalogs ----------
export type Source = { name: string; url: string };
export const loadSources = () => store.json<Source[]>("bookSources", []);
export const saveSources = (l: Source[]) => store.set("bookSources", JSON.stringify(l));
/** The catalog a web page points to (<link rel="alternate" type="…opds-catalog…">), or common places. */
async function discover(page: string, html: string): Promise<string | null> {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const links = Array.from(doc.querySelectorAll("link[href]"));
  // an OPDS catalog first; a plain Atom feed (news, a blog) only as a last guess
  const opds = links.filter((x) => /opds-catalog/i.test(x.getAttribute("type") ?? "")).map((x) => x.getAttribute("href")!);
  const atom = links.filter((x) => /application\/atom\+xml/i.test(x.getAttribute("type") ?? "")).map((x) => x.getAttribute("href")!);
  const tries = [...opds, "/opds", "/opds/", "/feeds/opds", "/ebooks.opds/", "/opds-catalog", "/catalog", ...atom];
  for (const t of tries) {
    const u = new URL(t, page).href;
    try { await fetchFeed(u); return u; } catch { /* next guess */ }
  }
  return null;
}

export async function addSource(url: string): Promise<Source> {
  let u = url.trim();
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  const text = await fetchText(u);
  let feed: OFeed;
  try { feed = parseFeed(text, u); }
  catch {
    // an ordinary web page: look for the catalog it names
    const found = await discover(u, text);
    if (!found) throw new Error(tt("Bu adreste bir OPDS kataloğu bulunamadı. Sitenin yardım sayfasında “OPDS” adresini ara."));
    u = found;
    feed = await fetchFeed(u);
  }
  const s = { name: feed.title || new URL(u).hostname, url: u };
  saveSources([...loadSources().filter((x) => x.url !== u), s]);
  return s;
}

// ---------- how it works (shown wherever a source is added) ----------
const EXAMPLES: [string, string][] = [
  ["Project Gutenberg", "https://www.gutenberg.org/ebooks.opds/"],
  ["Standard Ebooks", "https://standardebooks.org/feeds/opds"],
  ["Calibre", "http://192.168.1.10:8080/opds"],
  ["Komga", "http://192.168.1.10:25600/opds/v1.2/catalog"],
];
export function SourceHelp({ onPick }: { onPick: (url: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="src-help">
      <button type="button" className="src-help-t" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "▾" : "▸"}  {tt("Nasıl çalışır?")}</button>
      {open && (
        <div className="src-help-b">
          <p>{tt("Bir kitap kaynağı, kitap listesini uygulamaların okuyabileceği ortak bir dilde (OPDS) sunan bir adrestir. Adres düz bir bağlantıdır (https://…); tarayıcıda açınca sayfa yerine kitap listesi metni görünür.")}</p>
          <p>{tt("Adresi bir kez eklersin; kaynak Kitap › Keşfet'te sekme olur. Oradan raflarına göz atar, arar ve “İndir ve oku” ile istediğin kitabı kitaplığına indirirsin. Kitapları tek tek eklemen gerekmez.")}</p>
          <p>{tt("Sitenin normal adresini de girebilirsin: Luna sayfada katalog adresini arar. Bulamazsa sitenin yardım sayfasında “OPDS” geçen adresi ara. Kendi kitapların için Calibre, Kavita ya da Komga kurup onların OPDS adresini ekleyebilirsin.")}</p>
          <div className="src-ex">
            <span className="muted small">{tt("Örnekler (tıklayınca kutuya yazılır):")}</span>
            {EXAMPLES.map(([n, u]) => <button type="button" key={n} className="chip" title={u} onClick={() => onPick(u)}>{n}</button>)}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- settings section ----------
export function SourceSettings() {
  const [list, setList] = useState<Source[]>(loadSources);
  const [url, setUrl] = useState("");
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const add = async () => {
    if (!url.trim()) return;
    setMsg({ text: tt("Katalog okunuyor…") });
    try {
      const s = await addSource(url);
      setList(loadSources()); setUrl(""); setMsg({ text: tt("Eklendi: {0}", s.name) });
    } catch (e) { setMsg({ text: String(e).replace(/^Error: /, ""), err: true }); }
  };
  const remove = (u: string) => { saveSources(loadSources().filter((x) => x.url !== u)); setList(loadSources()); };
  return (
    <div className="field">
      <span>{tt("Kitap kaynakları (OPDS)")}</span>
      <div className="plugins">
        <div className="muted small">{tt("Luna hazır olarak sadece Project Gutenberg ile gelir. Başka bir kitap kataloğu eklemek için OPDS adresini yapıştır (Calibre sunucusu, Kavita, Komga, kütüphane katalogları…); Kitap › Keşfet'te sekme olarak çıkar. Hangi kaynağı eklediğin ve indirdiğin içerik senin sorumluluğunda.")}</div>
        {list.map((x) => (
          <div key={x.url} className="plugin">
            <b>{x.name}</b>
            <span className="muted small ellipsis" title={x.url}>{x.url}</span>
            <span className="grow" />
            <button className="round sm-round" aria-label={tt("Sil")} title={tt("Sil")} onClick={() => remove(x.url)}>×</button>
          </div>
        ))}
        <SourceHelp onPick={setUrl} />
        <form className="addon-add" onSubmit={(e) => { e.preventDefault(); add(); }}>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={tt("Katalog ya da site adresi: https://…")} />
          <button className="chip" disabled={!url.trim()}>{tt("+ Ekle")}</button>
        </form>
        {msg && <div className={"plugin-msg small" + (msg.err ? " err" : "")}>{msg.text}</div>}
      </div>
    </div>
  );
}
