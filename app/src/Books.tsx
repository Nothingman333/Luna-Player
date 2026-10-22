// Kitap modu: the user's own books (EPUB, PDF, comics), books from open libraries (Project
// Gutenberg) and free audiobooks (LibriVox, played by the music player), plus the reader.
import { lang, tt } from "./i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { store } from "./library";
import { I, Icon, MenuEntry, openMenu } from "./Screens";
import { askAssistant, openAssistant, TrText } from "./Taste";
import { MiniMusic, playQueue, QItem, useMusic } from "./Music";
import { collectEntry } from "./Mine";
import { ReviewAiCard } from "./FilmReviewAi";
import { cleanProfile, filmKey } from "./filmReviewModel";
import { ReasonPicker, TastePanel } from "./TastePanel";
import { TasteProfile } from "./TasteProfile";
import { aspectsOf, profileKeyOf } from "./reviewTaste";
import type { Aspect } from "./filmReviewModel";
import "./FilmDecision.css";
import { attachTts, loadVoices, voiceChoices, setRate, setSleep, setVoice, setTtsVolume, setTtsMuted, Sleep, takeHeard, TTS_CSS, ttsNoted, ttsPause, ttsSkip, ttsStart, ttsStop, ttsToggle, useTts, Voice } from "./ReadAloud";
import { addSource, SourceHelp, fetchFeed, gutenbergBooks, gutenbergPopular, gutenbergSearch, kindOf, loadSources, OEntry, OFeed, saveSources, searchUrl, Source } from "./Opds";
import literata400 from "@fontsource/literata/files/literata-latin-400-normal.woff2?url";
import literata400x from "@fontsource/literata/files/literata-latin-ext-400-normal.woff2?url";
import literata400i from "@fontsource/literata/files/literata-latin-400-italic.woff2?url";
import literata600 from "@fontsource/literata/files/literata-latin-600-normal.woff2?url";
import literata600x from "@fontsource/literata/files/literata-latin-ext-600-normal.woff2?url";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// ---------- library ----------
export type Book = { path: string; kind: "epub" | "pdf" | "cbz"; title: string; author: string; lang?: string; cover?: string | null };
type Pos = { loc?: string | number; pct: number; at: number; chapter?: string };
const posKey = (p: string) => "bookPos:" + p;
export const getPos = (p: string) => store.json<Pos | null>(posKey(p), null);
const setPos = (p: string, v: Pos) => store.set(posKey(p), JSON.stringify(v));
export const loadBookFolders = () => store.json<string[]>("bookFolders", []);
let libCache: { sig: string; books: Book[] } | null = null;
const libSubs = new Set<() => void>();
const libChanged = () => { libCache = null; libSubs.forEach((f) => f()); };
/** The book library (scanned once; the index keeps it quick). */
export async function loadBookLibrary(): Promise<Book[]> {
  const f = loadBookFolders();
  if (libCache?.sig === f.join("|")) return libCache.books;
  // a failed scan isn't kept as an empty library: the next ask scans again
  let ok = true;
  const books = f.length ? await invoke<Book[]>("books_scan", { folders: f }).catch(() => { ok = false; return [] as Book[]; }) : [];
  if (ok) libCache = { sig: f.join("|"), books };
  return books;
}

// opening a book from anywhere (the assistant): the books page opens it when it's on screen
let openHandler: ((b: Book) => void) | null = null;
let pendingOpen: Book | null = null;
export function requestOpenBook(b: Book) {
  const recent = [b.path, ...store.json<string[]>("bookRecent", []).filter((p) => p !== b.path)].slice(0, 20);
  store.set("bookRecent", JSON.stringify(recent));
  // what the book is, also when it lives outside the book folders (opened with "Open file")
  const known = store.json<Record<string, Book>>("bookOpened", {});
  known[b.path] = b;
  store.set("bookOpened", JSON.stringify(Object.fromEntries(recent.filter((p) => known[p]).map((p) => [p, known[p]]))));
  if (openHandler) openHandler(b); else pendingOpen = b;
  // a page over the app (the collections) steps aside for the reader
  window.dispatchEvent(new Event("luna-book-open"));
}
/** A book from a catalog goes into the first book folder (or Documents\Luna Books), then opens. */
/** The file's name in a link, for when nothing better is known. */
const linkName = (u: string) => { try { return decodeURIComponent(new URL(u).pathname.split("/").pop() ?? "").replace(/\.[^.]+$/, "").replace(/[._]+/g, " ").trim(); } catch { return ""; } };
export async function fetchAndOpenBook(url: string, title: string, author: string, kind?: string): Promise<Book> {
  const b = await fetchBook(url, title, author, kind);
  requestOpenBook(b);
  return b;
}
/** The library's own copy of a catalog book (same title, the author's names overlapping), so it isn't downloaded twice. */
export function ownedBook(title: string, author: string): Book | undefined {
  const norm = (x: string) => x.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const t = norm(title);
  if (t.length < 3) return undefined;
  const names = new Set(norm(author).split(" ").filter((w) => w.length > 2));
  return libCache?.books.find((b) => {
    const bt = norm(b.title);
    // "Frankenstein" and "Frankenstein; or, The Modern Prometheus" are one book
    const same = bt === t || (bt.length >= 4 && t.startsWith(bt + " ")) || (t.length >= 4 && bt.startsWith(t + " "));
    return same && (!names.size || !b.author || norm(b.author).split(" ").some((w) => names.has(w)));
  });
}
/** Downloads a book into the library (the first book folder) without opening it; one already there is used as it is. */
export async function fetchBook(url: string, title: string, author: string, kind?: string): Promise<Book> {
  const have = ownedBook(title, author);
  if (have) return have;
  const folders = loadBookFolders();
  const dir = folders[0] ?? (await invoke<string | null>("books_default_dir")) ?? "";
  // Vikikaynak (Wikisource): Luna makes the EPUB itself from the pages ("wikisource:<lang>:<title>")
  const ws = url.match(/^wikisource:([a-z]{2,3}):(.+)$/);
  const d = ws ? await invoke<{ path: string; kind: Book["kind"]; title: string; author: string }>("ws_book", { lang: ws[1], title: ws[2], dir })
    : await invoke<{ path: string; kind: Book["kind"]; title: string; author: string }>("book_download", { url, dir, title, author, kind: kind || null, fallback: linkName(url) || tt("Kitap") });
  if (!folders.includes(dir)) store.set("bookFolders", JSON.stringify([...folders, dir]));
  libChanged();
  return { path: d.path, kind: d.kind, title: d.title, author: d.author };
}

function useBookLibrary() {
  const [folders, setFoldersState] = useState<string[]>(loadBookFolders);
  useEffect(() => {
    const f = () => { setFoldersState(loadBookFolders()); setTick((n) => n + 1); };
    libSubs.add(f);
    return () => { libSubs.delete(f); };
  }, []);
  const [books, setBooks] = useState<Book[] | null>(() => (libCache?.sig === loadBookFolders().join("|") ? libCache.books : null));
  const [scanning, setScanning] = useState(false);
  const [tick, setTick] = useState(0);
  const sig = folders.join("|");
  useEffect(() => {
    if (!folders.length) { libCache = { sig, books: [] }; setBooks([]); setScanning(false); return; }
    if (libCache?.sig === sig && tick === 0) { setBooks(libCache.books); return; }
    let alive = true;
    setScanning(true);
    invoke<Book[]>("books_scan", { folders })
      .then((b) => { libCache = { sig, books: b }; if (alive) setBooks(b); })
      .catch(() => alive && setBooks([]))
      .finally(() => alive && setScanning(false));
    return () => { alive = false; };
  }, [sig, tick]);
  const setFolders = (f: string[]) => { store.set("bookFolders", JSON.stringify(f)); setFoldersState(f); };
  return { folders, setFolders, books, scanning, rescan: () => setTick((n) => n + 1) };
}
type Lib = ReturnType<typeof useBookLibrary>;

// ---------- open libraries ----------
async function getJson(url: string): Promise<any> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (r.ok) return await r.json();
  } catch { /* the native fetch below doesn't need CORS */ }
  return invoke("addon_get", { url });
}
export type Ab = { identifier: string; title: string; creator?: string | string[]; downloads?: number };
/** Recently played audiobooks, newest first (the books home shows them). */
export const loadAbRecent = () => store.json<Ab[]>("abRecent", []);
export function rememberAb(a: Ab) {
  const list = loadAbRecent().filter((x) => x.identifier !== a.identifier);
  store.set("abRecent", JSON.stringify([{ ...a }, ...list].slice(0, 12)));
  window.dispatchEvent(new Event("luna-ab"));
}
export async function librivox(q: string): Promise<Ab[]> {
  const words = q.trim().replace(/[()":]/g, " ").trim();
  // (audio only: the collection also holds the cover makers' picture sets, "Thumbs 12" and the like)
  const query = "collection:librivoxaudio AND mediatype:audio" + (words ? ` AND (title:(${words}) OR creator:(${words}))` : "");
  const p = new URLSearchParams({ q: query, output: "json", rows: "36", "sort[]": "downloads desc" });
  ["identifier", "title", "creator", "downloads"].forEach((f) => p.append("fl[]", f));
  const r = await getJson("https://archive.org/advancedsearch.php?" + p);
  const docs: Ab[] = r?.response?.docs ?? [];
  // the most listened list: a book read more than once ("version 2", "version 3") shows its most listened
  // reading only (a search keeps them all: one may want another reader)
  if (words) return docs;
  const seen = new Set<string>();
  return docs.filter((a) => {
    const k = abTitle(a.title).replace(/,?\s*by\s+.*$/i, "").toLowerCase() + "|" + abAuthor(a).toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
const abCover = (id: string) => `https://archive.org/services/img/${encodeURIComponent(id)}`;
export const abAuthor = (a: Ab) => (Array.isArray(a.creator) ? a.creator[0] : a.creator) ?? "";
export const abTitle = (t: string) => t.replace(/\s*\(version \d+\)\s*/i, " ").replace(/\s+/g, " ").trim();
export async function abChapters(a: Ab): Promise<QItem[]> {
  const meta = await getJson(`https://archive.org/metadata/${encodeURIComponent(a.identifier)}`);
  const files: any[] = meta?.files ?? [];
  // one file per chapter; LibriVox uploads each in two qualities, the smaller one is plenty for speech
  // (chosen chapter by chapter: a chapter uploaded only in the big quality is kept, not dropped)
  const byChapter = new Map<string, any>();
  for (const f of files.filter((f) => /\.mp3$/i.test(f.name))) {
    const key = String(f.name).replace(/_64kb\.mp3$/i, ".mp3").toLowerCase();
    if (!byChapter.has(key) || /_64kb\.mp3$/i.test(f.name)) byChapter.set(key, f);
  }
  const list = [...byChapter.values()].sort((x, y) => String(x.name).localeCompare(String(y.name), undefined, { numeric: true }));
  return list.map((f) => ({
    src: `https://archive.org/download/${encodeURIComponent(a.identifier)}/${encodeURIComponent(f.name)}`,
    title: f.title || String(f.name).replace(/_64kb\.mp3$|\.mp3$/i, "").replace(/_/g, " "),
    artist: abAuthor(a), album: abTitle(a.title), cover: abCover(a.identifier), duration: Number(f.length) || undefined, book: a.identifier,
  } as QItem));
}

// ---------- "Dosya aç" and "Bağlantı" in the books part ----------
export async function openBookFile() {
  const f = await open({ multiple: false, filters: [{ name: tt("Kitap"), extensions: ["epub", "pdf", "cbz"] }] });
  if (typeof f !== "string") return;
  const ext = f.split(".").pop()!.toLowerCase();
  const stem = f.split(/[\\/]/).pop()!.replace(/\.[^.]+$/, "");
  // "Author - Title - Subtitle": only the first dash parts the author; the rest stays the title
  const cut = stem.indexOf(" - ");
  const [author, title] = cut > 0 ? [stem.slice(0, cut), stem.slice(cut + 3)] : ["", stem];
  requestOpenBook({ path: f, kind: ext === "pdf" ? "pdf" : ext === "cbz" ? "cbz" : "epub", title: title.trim(), author: author.trim() });
}
export function BookLinkDialog({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"file" | "opds">("file");
  const [v, setV] = useState("");
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [kind, setKind] = useState<"" | "epub" | "pdf" | "cbz">("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const go = async () => {
    const t = v.trim();
    if (!t) return;
    setBusy(true); setMsg(null);
    try {
      const u = /^https?:\/\//i.test(t) ? t : "https://" + t;
      if (tab === "file") {
        await fetchAndOpenBook(u, title.trim(), author.trim(), kind);
        onClose();
        return;
      }
      const src = await addSource(u);
      setMsg({ text: tt("Kitap kaynağı eklendi: {0} · Keşfet'te sekmesi var", src.name) });
    } catch (e) {
      setMsg({ text: String(e).replace(/^Error: /, ""), err: true });
    } finally { setBusy(false); }
  };
  return createPortal(
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal wide mu-link bk-link">
        <h2>{tt("Kitap bağlantısı")}</h2>
        <div className="seg-row">
          <button className={"seg" + (tab === "file" ? " on" : "")} onClick={() => { setTab("file"); setMsg(null); }}>{tt("Kitap dosyası linki")}</button>
          <button className={"seg" + (tab === "opds" ? " on" : "")} onClick={() => { setTab("opds"); setMsg(null); }}>{tt("Katalog (OPDS)")}</button>
        </div>
        <div className="muted small">{tab === "file"
          ? tt("Bir EPUB, PDF ya da CBZ dosyasına giden link. Luna sadece bu linki indirir, hiçbir siteyi tanımaz. Başlık ve yazar boşsa kitabın içinden, o da yoksa dosya adından alınır.")
          : tt("Bir kitap kataloğunun adresi. Kaynak olarak eklenir; kitapları Keşfet'te kendi sekmesinde görürsün.")}</div>
        <form className="bk-link-form" onSubmit={(e) => { e.preventDefault(); go(); }}>
          <label><span>{tt("Link")} <span className="muted">*</span></span>
            <input autoFocus value={v} onChange={(e) => setV(e.target.value)} placeholder={tab === "file" ? "https://…/kitap.epub" : "https://…/opds"} />
          </label>
          {tab === "file" && (
            <>
              <div className="bk-link-two">
                <label>{tt("Başlık")}<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tt("boşsa kitaptan alınır")} /></label>
                <label>{tt("Yazar")}<input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder={tt("boşsa kitaptan alınır")} /></label>
              </div>
              <label>{tt("Biçim")}
                <div className="seg-row">
                  {([["", tt("Otomatik")], ["epub", "EPUB"], ["pdf", "PDF"], ["cbz", "CBZ"]] as const).map(([k, l]) => (
                    <button type="button" key={k} className={"seg" + (kind === k ? " on" : "")} onClick={() => setKind(k)}>{l}</button>
                  ))}
                </div>
              </label>
            </>
          )}
          {msg && <div className={"plugin-msg small" + (msg.err ? " err" : "")}>{msg.text}</div>}
          <div className="modal-actions">
            <button type="button" className="chip" onClick={onClose}>{tt("Kapat")}</button>
            <button className="primary sm" disabled={!v.trim() || busy}>{busy ? (tab === "file" ? tt("İndiriliyor…") : tt("Ekleniyor…")) : tab === "file" ? tt("İndir ve aç") : tt("Kaynak ekle")}</button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

// ---------- small pieces ----------
const hue = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; };
/** A picture as a backdrop: a web address as it is, a cached cover file through Luna's file server. */
const heroBg = (src?: string | null) => (src ? { backgroundImage: `url("${/^https?:/.test(src) ? src : convertFileSrc(src)}")` } : undefined);
function BookCover({ src, title, author, w = 132 }: { src?: string | null; title: string; author?: string; w?: number | string }) {
  const [bad, setBad] = useState(false);
  useEffect(() => setBad(false), [src]); // a new picture gets its own chance
  const url = src && !bad ? (/^https?:/.test(src) ? src : convertFileSrc(src)) : null;
  return (
    <div className="bk-cover" style={{ width: w, background: url ? undefined : `hsl(${hue(title)} 30% 26%)` }}>
      {url ? <img src={url} alt="" loading="lazy" onError={() => setBad(true)} /> : (
        <div className="bk-cover-txt"><b>{title}</b>{author && <span>{author}</span>}</div>
      )}
    </div>
  );
}
const pctText = (p: number) => (lang() === "tr" ? "%" + Math.round(p * 100) : Math.round(p * 100) + "%");

const ASK = "✦  ";
const bookAsks = (b: { title: string; author: string }): [string, string][] => {
  const who = b.author ? ` (${b.author})` : "";
  return [
    [tt("Ayrıntılı inceleme"), tt("“{0}”{1} kitabı hakkında ayrıntılı bir inceleme yaz. Şunları ayrı başlıklarla ver: 1) internetteki inceleme ve yorumların ortak görüşü (Goodreads, 1000Kitap, gazete ve dergi incelemeleri); 2) bu kitap üzerine öne çıkan YouTube inceleme videoları; 3) makaleler ve akademik yorumlar; 4) büyük düşünürlerin ve eleştirmenlerin bu kitap hakkındaki çıkarımları (kim ne demiş, hangi açıdan bakmış); 5) kitabın neden önemli olduğu ve kimlere hitap ettiği. Her bilginin kaynağını bağlantısıyla göster; olay örgüsünün sonunu verme, spoiler gerekiyorsa önce uyar.", b.title, who)],
    [tt("Bu kitap ne hakkında?"), tt("“{0}”{1} kitabı ne hakkında? Spoiler vermeden anlat", b.title, who)],
    [tt("Bu kitabın filmi ya da dizisi var mı?"), tt("“{0}”{1} kitabının filmi ya da dizisi var mı?", b.title, who)],
    [tt("Buna benzer kitaplar"), tt("“{0}”{1} kitabına benzer kitaplar öner; kitaplığımda olanları önce söyle", b.title, who)],
    [tt("Yazarı hakkında"), b.author ? tt("{0} hakkında kısaca bilgi ver ve başka hangi kitapları var?", b.author) : tt("“{0}” kitabının yazarı kim, hakkında kısaca bilgi ver", b.title)],
    [tt("Okurken ne dinlesem?"), tt("“{0}”{1} kitabını okurken ne dinlesem? Arşivimden ya da bir radyo öner", b.title, who)],
  ];
};
// right-click menus: the assistant's ready questions come first
const askEntries = (b: { title: string; author: string }): MenuEntry[] => bookAsks(b).map(([l, q]) => ({ label: ASK + l, act: () => askAssistant(q) }));
const bookMenu = (b: Book, read: () => void, details: () => void): MenuEntry[] => [
  ...askEntries(b),
  "sep",
  { label: tt("Oku"), act: read },
  { label: tt("Detaylar"), act: details },
  collectEntry({ kind: "book", title: b.title, by: b.author, path: b.path, cover: b.cover }),
  "sep",
  ...deleteEntries(b),
];
/** Right-click delete, the same everywhere a book of the library shows. */
const deleteEntries = (b: Book, after?: () => void): MenuEntry[] => [
  { label: tt("Okuma kaydını sil"), act: () => { if (confirm(tt("“{0}” için kaldığın yer, beğeni, puan ve notun silinsin mi? (Dosya ve vurgular kalır.)", b.title))) clearBookRecord(b); } },
  { label: tt("Dosyayı sil (Geri Dönüşüm Kutusu'na)"), danger: true, act: () => deleteBookFile(b).then((ok) => ok && after?.()) },
];
async function deleteBookFile(b: Book) {
  if (!confirm(tt("“{0}” diskten silinip Geri Dönüşüm Kutusu'na taşınsın mı?", b.title))) return false;
  try { await invoke<number>("delete_file", { path: b.path }); }
  catch (e) { alert(tt("Silinemedi: {0}", String(e))); return false; }
  clearBookRecord(b);
  forgetBooks();
  return true;
}

function BookCard({ b, onOpen, onRead }: { b: Book; onOpen: () => void; onRead?: () => void }) {
  const pos = getPos(b.path);
  // like films: a book being read opens to its page, any other one shows its details
  const reading = !!onRead && !!pos && pos.pct > 0.01 && pos.pct < 0.99;
  return (
    <button className="bk-card" onClick={reading ? onRead : onOpen} title={`${b.title}${b.author ? " · " + b.author : ""}`}
      onContextMenu={(e) => openMenu(e, bookMenu(b, onRead ?? onOpen, onOpen))}>
      <span className="bk-cov-wrap"><BookCover src={b.cover} title={b.title} author={b.author} w="100%" />
        <span className="info-btn" role="button" tabIndex={0} aria-label={tt("Detaylar")} title={tt("Detaylar")}
          onClick={(e) => { e.stopPropagation(); onOpen(); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onOpen(); } }}>i</span>
</span>
      <b className="bk-t">{b.title}</b>
      <span className="muted small ellipsis">{b.author || b.kind.toUpperCase()}</span>
      <span className="bk-prog muted small">{pos ? (pos.pct >= 0.99 ? tt("bitti") : pctText(pos.pct)) : tt("yeni")}</span>
    </button>
  );
}

/** The book on screen (open in the reader, or its details page): the assistant can talk about it. */
let onScreen: { b: Book; reading: boolean } | null = null;
export const bookOnScreen = () => onScreen;
function showBook(v: typeof onScreen) {
  onScreen = v;
  window.dispatchEvent(new Event("luna-book-screen"));
}

// ---------- pages ----------
export type BooksView = "home" | "library" | "taste" | "discover" | "audio";
export function BooksPage({ view, setView, query }: { view: BooksView; setView: (v: BooksView) => void; query: string }) {
  const lib = useBookLibrary();
  const [reading, setReading] = useState<Book | null>(null);
  const [detail, setDetail] = useState<Book | null>(null);
  const addFolder = async () => {
    const d = await open({ directory: true, multiple: false });
    if (typeof d === "string" && !lib.folders.includes(d)) lib.setFolders([...lib.folders, d]);
  };
  const openBook = (b: Book) => requestOpenBook(b);
  useEffect(() => {
    openHandler = setReading;
    if (pendingOpen) { setReading(pendingOpen); pendingOpen = null; }
    return () => { openHandler = null; };
  }, []);
  const fetchBook = async (url: string, title: string, author: string, kind?: string) => { await fetchAndOpenBook(url, title, author, kind); };
  useEffect(() => { showBook(reading ? { b: reading, reading: true } : detail ? { b: detail, reading: false } : null); }, [reading, detail]);
  useEffect(() => () => showBook(null), []);
  return (
    <div className="page books">
      {view === "home" && <BooksHome lib={lib} onOpen={openBook} onDetail={setDetail} onAddFolder={addFolder} onFetch={fetchBook} go={setView} />}
      {view === "library" && <BookLibrary lib={lib} query={query} onOpen={openBook} onDetail={setDetail} onAddFolder={addFolder} />}
      {detail && <BookDetail b={detail} onClose={() => setDetail(null)} onRead={() => { setDetail(null); openBook(detail); }} />}
      {view === "discover" && <Catalogs query={query} onFetch={fetchBook} />}
      {view === "taste" && <>
        <TasteProfile kind="book" page />
        <section className="la mu-taste"><TastePanel kind="book" open={false} /></section>
      </>}
      {view === "audio" && <Audiobooks query={query} />}
      {reading && <Reader key={reading.path} b={reading} onClose={() => setReading(null)} />}
    </div>
  );
}

type Fetch = (url: string, t: string, a: string, kind?: string) => Promise<void>;
function BooksHome({ lib, onOpen, onDetail, onAddFolder, onFetch, go }: {
  lib: Lib; onOpen: (b: Book) => void; onDetail: (b: Book) => void; onAddFolder: () => void; onFetch: Fetch; go: (v: BooksView) => void;
}) {
  const opened = store.json<Record<string, Book>>("bookOpened", {});
  const recent = store.json<string[]>("bookRecent", []).map((p) => lib.books?.find((b) => b.path === p) ?? opened[p]).filter(Boolean) as Book[];
  const [, setAbTick] = useState(0);
  useEffect(() => { const f = () => setAbTick((n) => n + 1); window.addEventListener("luna-ab", f); return () => window.removeEventListener("luna-ab", f); }, []);
  const abRecent = loadAbRecent().slice(0, 8);
  const cur = recent.find((b) => (getPos(b.path)?.pct ?? 0) < 0.99);
  const pos = cur ? getPos(cur.path) : null;
  const rest = (lib.books ?? []).filter((b) => b !== cur);
  const notesAll = loadBookNotes();
  const known = [...(lib.books ?? []), ...Object.values(opened).filter((b) => !(lib.books ?? []).some((x) => x.path === b.path))];
  const doneShelf = known.filter(isFinishedBook).slice(0, 14);
  const likedShelf = known.filter((b) => notesAll[bkKey(b)]?.vote === "like").slice(0, 14);
  const toShelf = (x: Shelf) => { store.set("bookShelf", x); go("library"); };
  return (
    <>
      {cur ? (
        <section className="bk-hero" onClick={() => onDetail(cur)}>
          {/* the same backdrop as the book's details page (its painting once found there, else the cover) */}
          <div className="bk-hero-bg" style={heroBg(store.json<{ url?: string } | null>("art2:" + bkKey(cur), null)?.url || cur.cover)} />
          <button className="bk-hero-cov" onClick={() => onDetail(cur)} onContextMenu={(e) => openMenu(e, bookMenu(cur, () => onOpen(cur), () => onDetail(cur)))} title={tt("Detaylar")}><BookCover src={cur.cover} title={cur.title} author={cur.author} w={124} /></button>
          <div className="bk-hero-txt">
            <span className="eyebrow">{tt("OKUMAYA DEVAM ET")}</span>
            <h1>{cur.title}</h1>
            <span className="muted">{[cur.author, pos?.chapter].filter(Boolean).join(" · ")}</span>
            <div className="bk-bar"><div style={{ width: (pos?.pct ?? 0) * 100 + "%" }} /></div>
            <span className="muted small">{pctText(pos?.pct ?? 0)}</span>
            <div className="seg-row" onClick={(e) => e.stopPropagation()}>
              <button className="primary light" onClick={() => onOpen(cur)}><Icon d={I.play} fill size={16} />  {(pos?.pct ?? 0) > 0.01 ? tt("Devam et") : tt("Oku")}</button>
              <button className="ghost" onClick={() => onDetail(cur)}>{tt("Detaylar")}</button>
            </div>
          </div>
        </section>
      ) : lib.books && !lib.books.length ? (
        <section className="hero empty bk-empty">
          <h1>{tt("Kitaplığını ekle")}</h1>
          <div className="muted">{tt("Kitap klasörünü seç (EPUB, PDF, çizgi roman CBZ) ya da aşağıdaki açık kütüphanelerden ücretsiz bir kitap indir.")}</div>
          <button className="primary" onClick={onAddFolder}><Icon d={I.folder} size={18} />  {tt("Kitap klasörü ekle")}</button>
        </section>
      ) : null}
      {abRecent.length > 0 && (
        <section className="row">
          <div className="row-head"><h2>{tt("Son dinlenen sesli kitaplar")}</h2><button className="chip" onClick={() => go("audio")}>{tt("Tümü")}</button></div>
          <div className="bk-grid">{abRecent.map((a) => <AbCard key={a.identifier} a={a} />)}</div>
        </section>
      )}
      {rest.length > 0 && (
        <section className="row"><div className="row-head"><h2>{tt("Kitaplığım")}</h2><button className="chip" onClick={() => go("library")}>{tt("Tümü")}</button></div>
          <div className="bk-grid">{rest.slice(0, 14).map((b) => <BookCard key={b.path} b={b} onOpen={() => onDetail(b)} onRead={() => onOpen(b)} />)}</div>
        </section>
      )}
      {likedShelf.length > 0 && (
        <section className="row"><div className="row-head"><h2>{tt("Beğendiklerin")}</h2><button className="chip" onClick={() => toShelf("liked")}>{tt("Tümü")}</button></div>
          <div className="bk-grid">{likedShelf.map((b) => <BookCard key={b.path} b={b} onOpen={() => onDetail(b)} onRead={() => onOpen(b)} />)}</div>
        </section>
      )}
      {doneShelf.length > 0 && (
        <section className="row"><div className="row-head"><h2>{tt("Bitirdiklerin")}</h2><button className="chip" onClick={() => toShelf("done")}>{tt("Tümü")}</button>
          <button className="chip" onClick={() => toShelf("history")}>{tt("Okuma geçmişi")}</button></div>
          <div className="bk-grid">{doneShelf.map((b) => <BookCard key={b.path} b={b} onOpen={() => onDetail(b)} onRead={() => onOpen(b)} />)}</div>
        </section>
      )}
      <GutRow title={tt("Açık kütüphanelerden: en çok okunan klasikler")} onFetch={onFetch} more={() => go("discover")} />
      <AbRow title={tt("Ücretsiz sesli kitaplar")} q="" more={() => go("audio")} />
      <section className="row">
        <h2>{tt("Açık kütüphaneler")} <span className="muted small">· {tt("ücretsiz ve yasal")}</span></h2>
        <div className="bk-sources">
          <button className="bk-src" onClick={() => go("discover")}><b>Project Gutenberg</b><span className="muted small">{tt("75.000+ klasik e-kitap")}</span></button>
          <button className="bk-src" onClick={() => go("audio")}><b>LibriVox</b><span className="muted small">{tt("gönüllülerin seslendirdiği kitaplar")}</span></button>
          <button className="bk-src dashed" onClick={() => go("discover")}><b>{tt("+ Kaynak ekle")}</b><span className="muted small">{tt("kendi eklediğin OPDS kataloğu")}</span></button>
        </div>
      </section>
    </>
  );
}

type Shelf = "all" | "reading" | "done" | "liked" | "disliked" | "history";
function BookLibrary({ lib, query, onOpen, onDetail, onAddFolder }: { lib: Lib; query: string; onOpen: (b: Book) => void; onDetail: (b: Book) => void; onAddFolder: () => void }) {
  const [sort, setSort] = useState<"recent" | "title" | "author">("recent");
  const [shelf, setShelfState] = useState<Shelf>(() => (store.get("bookShelf") as Shelf) || "all");
  const setShelf = (x: Shelf) => { setShelfState(x); store.set("bookShelf", x); };
  const q = query.trim().toLocaleLowerCase();
  const recent = store.json<string[]>("bookRecent", []);
  const notes = loadBookNotes();
  const opened = store.json<Record<string, Book>>("bookOpened", {});
  // books read from a link or "Open file" count too, not only the folder's
  const all = useMemo(() => {
    const m = new Map((lib.books ?? []).map((b) => [b.path, b]));
    for (const b of Object.values(opened)) if (!m.has(b.path)) m.set(b.path, b);
    for (const x of loadReadHistory()) if (!m.has(x.b.path)) m.set(x.b.path, x.b);
    return [...m.values()];
  }, [lib.books]);
  const inShelf = (b: Book) => {
    const n = notes[bkKey(b)];
    const pct = getPos(b.path)?.pct ?? 0;
    return shelf === "all" ? (lib.books ?? []).some((x) => x.path === b.path)
      : shelf === "reading" ? pct > 0.005 && !isFinishedBook(b)
      : shelf === "done" ? isFinishedBook(b)
      : shelf === "liked" ? n?.vote === "like"
      : shelf === "disliked" ? n?.vote === "dislike" : true;
  };
  const list = useMemo(() => all
    .filter(inShelf)
    .filter((b) => !q || b.title.toLocaleLowerCase().includes(q) || b.author.toLocaleLowerCase().includes(q))
    .sort((x, y) => sort === "title" ? x.title.localeCompare(y.title) : sort === "author" ? x.author.localeCompare(y.author) || x.title.localeCompare(y.title)
      : (recent.indexOf(x.path) + 1 || 999) - (recent.indexOf(y.path) + 1 || 999)), [all, q, sort, shelf]);
  const count = (x: Shelf) => x === "history" ? loadReadHistory().length : all.filter((b) => {
    const n = notes[bkKey(b)]; const pct = getPos(b.path)?.pct ?? 0;
    return x === "reading" ? pct > 0.005 && !isFinishedBook(b) : x === "done" ? isFinishedBook(b) : x === "liked" ? n?.vote === "like" : x === "disliked" ? n?.vote === "dislike" : true;
  }).length;
  return (
    <>
      <div className="seg-row bk-shelves">
        {([["all", tt("Tümü")], ["reading", tt("Okuyorum")], ["done", tt("Bitirdiklerim")], ["liked", tt("Beğendiklerim")], ["disliked", tt("Beğenmediklerim")], ["history", tt("Geçmiş")]] as const).map(([k, l]) => {
          const n = k === "all" ? 0 : count(k);
          return <button key={k} className={"seg sm" + (shelf === k ? " on" : "")} onClick={() => setShelf(k)}>{l}{n ? ` ${n}` : ""}</button>;
        })}
      </div>
      <div className="row-head mu-lib-head">
        {shelf !== "history" && <div className="seg-row">
          {([["recent", tt("Son okunan")], ["title", tt("Ada göre")], ["author", tt("Yazara göre")]] as const).map(([k, l]) => (
            <button key={k} className={"seg sm" + (sort === k ? " on" : "")} onClick={() => setSort(k)}>{l}</button>
          ))}
        </div>}
        <span className="grow" />
        {lib.scanning ? <span className="muted small pulse">{tt("Taranıyor…")}</span> : <span className="muted small">{tt("{0} kitap", lib.books?.length ?? 0)}</span>}
        <button className="chip" onClick={lib.rescan} disabled={lib.scanning}>{tt("Yeniden tara")}</button>
        <button className="chip" onClick={onAddFolder}><Icon d={I.plus} size={14} />  {tt("Klasör")}</button>
      </div>
      <div className="mu-folders">
        {lib.folders.map((f) => (
          <span key={f} className="mu-folder" title={f}><Icon d={I.folder} size={14} /><span className="ellipsis">{f}</span>
            <button aria-label={tt("Kaldır")} title={tt("Kaldır")} onClick={() => lib.setFolders(lib.folders.filter((x) => x !== f))}><Icon d={I.x} size={12} /></button></span>
        ))}
      </div>
      {shelf === "history" ? <ReadHistory onOpen={onOpen} onDetail={onDetail} /> : (
        <>
          {lib.books && !list.length && <div className="muted empty-note">{q ? tt("Kitaplığında bulunamadı.")
            : shelf === "reading" ? tt("Şu an okuduğun bir kitap yok.")
            : shelf === "done" ? tt("Bitirdiğin kitaplar burada toplanır (sonuna gelince ya da detay sayfasında “Okudum” deyince).")
            : shelf === "liked" ? tt("Beğendiğin kitaplar burada toplanır: kitabın detay sayfasında 👍.")
            : shelf === "disliked" ? tt("Beğenmediğin kitaplar burada toplanır: kitabın detay sayfasında 👎.")
            : tt("Henüz kitap yok. Bir klasör ekle ya da Keşfet'ten ücretsiz kitap indir.")}</div>}
          <div className="bk-grid">{list.map((b) => <BookCard key={b.path} b={b} onOpen={() => onDetail(b)} onRead={() => onOpen(b)} />)}</div>
        </>
      )}
    </>
  );
}

/** "Geçmiş": the sittings with books, day by day (how long, from where to where). */
function ReadHistory({ onOpen, onDetail }: { onOpen: (b: Book) => void; onDetail: (b: Book) => void }) {
  const [l, setL] = useState(loadReadHistory);
  if (!l.length) return <div className="muted empty-note">{tt("Okuma geçmişin burada birikecek: hangi gün hangi kitabı ne kadar okudun.")}</div>;
  const day = (t: number) => {
    const d = new Date(t), today = new Date(), y = new Date(); y.setDate(today.getDate() - 1);
    return d.toDateString() === today.toDateString() ? tt("Bugün") : d.toDateString() === y.toDateString() ? tt("Dün")
      : d.toLocaleDateString(lang() === "tr" ? "tr-TR" : "en-US", { weekday: "long", day: "numeric", month: "long" });
  };
  const groups: { day: string; items: Sitting[] }[] = [];
  for (const x of l) { const d = day(x.at); if (groups[groups.length - 1]?.day !== d) groups.push({ day: d, items: [] }); groups[groups.length - 1].items.push(x); }
  const total = Math.round(l.reduce((n, x) => n + x.mins, 0));
  return (
    <>
      <div className="row-head"><span className="muted small">{tt("Toplam {0} saat {1} dakika okuma", Math.floor(total / 60), total % 60)}</span><span className="grow" />
        <button className="chip" onClick={() => { if (confirm(tt("Okuma geçmişi silinsin mi? (Kitapların, notların ve kaldığın yerler kalır.)"))) { store.remove("bookHistory"); setL([]); } }}>{tt("Geçmişi temizle")}</button></div>
      {groups.map((g) => (
        <section key={g.day} className="row mu-hist">
          <h3>{g.day} · {tt("{0} dk", Math.round(g.items.reduce((n, x) => n + x.mins, 0)))}</h3>
          <div className="bk-hist">
            {g.items.map((x) => (
              <button key={x.at} className="bk-hist-row" onClick={() => onDetail(x.b)}
                onContextMenu={(e) => openMenu(e, [{ label: tt("Okumaya devam et"), act: () => onOpen(x.b) }, { label: tt("Detaylar"), act: () => onDetail(x.b) }, "sep",
                  ...deleteEntries(x.b), "sep",
                  { label: tt("Geçmişten kaldır"), danger: true, act: () => { const n = loadReadHistory().filter((y) => y.at !== x.at); store.set("bookHistory", JSON.stringify(n)); setL(n); } }])}>
                <BookCover src={x.b.cover} title={x.b.title} author={x.b.author} w={44} />
                <span className="mu-song-t"><b className="ellipsis">{x.b.title}</b><span className="muted small ellipsis">{x.b.author}</span></span>
                <span className="muted small bk-hist-r">{new Date(x.at).toLocaleTimeString(lang() === "tr" ? "tr-TR" : "en-US", { hour: "2-digit", minute: "2-digit" })} · {tt("{0} dk", Math.max(1, Math.round(x.mins)))}{x.aloud ? " · 🔊 " + tt("{0} dk", Math.max(1, Math.round(x.aloud))) : ""}<br />{pctText(x.from)} → {pctText(x.to)}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

/** Vikikaynak's works as catalog entries (downloaded as an EPUB Luna makes). */
export async function wikisourceBooks(lang: string, q: string): Promise<OEntry[]> {
  const l = await invoke<{ title: string; author: string; year: string }[]>("ws_search", { lang, q });
  return l.map((h) => ({ id: "ws:" + h.title, title: h.title, author: h.author, summary: h.year || undefined, acq: [{ href: `wikisource:${lang}:${h.title}`, type: "application/epub+zip", open: true }] }));
}

/** A book in a catalog: a click downloads it into the library and opens it. */
function EntryCard({ e, onFetch }: { e: OEntry; onFetch: Fetch }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // a free download first (a free PDF beats an EPUB to buy), then the best format: EPUB, PDF, comics
  const pick = [...e.acq].sort((x, y) => Number(!!y.open) - Number(!!x.open) || "epub pdf cbz".indexOf(kindOf(x.type)) - "epub pdf cbz".indexOf(kindOf(y.type)))[0];
  const go = async () => {
    if (!pick) return;
    if (have) { requestOpenBook(have); return; } // already in the library: no second copy
    if (!pick.open) { openUrl(pick.href).catch(() => {}); return; } // to buy / borrow: on the source's site
    setBusy(true); setErr("");
    try { await onFetch(pick.href, e.title, e.author, kindOf(pick.type)); } catch (x) { setErr(String(x)); } finally { setBusy(false); }
  };
  const have = ownedBook(e.title, e.author ?? "");
  return (
    <button className="bk-card" onClick={go} disabled={busy || !pick} title={err || e.summary?.slice(0, 300) || (have ? tt("Kitaplığında: oku") : tt("İndir ve oku"))}
      onContextMenu={(ev) => openMenu(ev, [...askEntries(e), ...(pick ? ["sep" as const, { label: pick.open ? tt("İndir ve oku") : tt("Sitesinde aç"), act: go }] : [])])}>
      <BookCover src={e.cover} title={e.title} author={e.author} w="100%" />
      <b className="bk-t">{e.title}</b>
      <span className="muted small ellipsis">{e.author}</span>
      <span className={"bk-prog small" + (err ? " err" : " muted")}>
        {busy ? tt("İndiriliyor…") : err ? tt("İndirilemedi") : have ? tt("Kitaplığında · oku") : pick && !pick.open ? tt("Kaynakta aç ↗") : tt("İndir ve oku")}
      </span>
    </button>
  );
}

function Shelf({ list, err, onRetry, onFetch, n = 14 }: { list: OEntry[] | null; err?: boolean; onRetry?: () => void; onFetch: Fetch; n?: number }) {
  if (err) return <div className="bk-err muted">{tt("Kütüphaneye şu an ulaşılamıyor.")} {onRetry && <button className="chip" onClick={onRetry}>{tt("Tekrar dene")}</button>}</div>;
  return (
    <div className="bk-grid">
      {list == null && Array.from({ length: Math.min(n, 7) }, (_, i) => <div key={i} className="bk-card ghost-card"><div className="bk-cover" /></div>)}
      {list?.map((e) => <EntryCard key={e.id} e={e} onFetch={onFetch} />)}
    </div>
  );
}

function GutRow({ title, onFetch, more }: { title: string; onFetch: Fetch; more?: () => void }) {
  const [list, setList] = useState<OEntry[] | null>(null);
  const [err, setErr] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setErr(false); setList(null);
    gutenbergPopular().then((l) => alive && setList(l.slice(0, 14))).catch(() => alive && setErr(true));
    return () => { alive = false; };
  }, [tick]);
  return (
    <section className="row">
      <div className="row-head"><h2>{title}</h2>{more && <button className="chip" onClick={more}>{tt("Tümü")}</button>}</div>
      <Shelf list={list} err={err} onRetry={() => setTick((n) => n + 1)} onFetch={onFetch} />
    </section>
  );
}

/** Keşfet: Project Gutenberg and the catalogs the user added (any OPDS address). */
function Catalogs({ query, onFetch }: { query: string; onFetch: Fetch }) {
  const [sources, setSources] = useState<Source[]>(loadSources);
  const [src, setSrc] = useState<string>("gutenberg");
  const [adding, setAdding] = useState(false);
  const [addUrl, setAddUrl] = useState("");
  const [addMsg, setAddMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const [q, setQ] = useState(query);
  const [deb, setDeb] = useState(query);
  useEffect(() => { setQ(query); setDeb(query); }, [query]);
  useEffect(() => { const t = setTimeout(() => setDeb(q.trim()), 450); return () => clearTimeout(t); }, [q]);
  // where we are inside the catalog (its shelves are pages of their own)
  const [stack, setStack] = useState<string[]>([]);
  const [feed, setFeed] = useState<OFeed | null>(null);
  const [list, setList] = useState<OEntry[] | null>(null);
  const [err, setErr] = useState(false);
  const [tick, setTick] = useState(0);
  const [more, setMore] = useState(false);
  const gut = src === "gutenberg";
  const vk = src === "vikikaynak";
  const cur = sources.find((x) => x.url === src);
  // a new source or a new search starts at the top, not inside the shelf that was open
  useEffect(() => { setStack([]); }, [src, deb]);
  // which list is on screen: a "more" page that arrives after a switch is dropped
  const gen = useRef(0);
  useEffect(() => {
    let alive = true;
    gen.current++;
    setList(null); setErr(false); setFeed(null);
    (async () => {
      if (vk) { const l = await wikisourceBooks("tr", deb); if (alive) setList(l); return; }
      let url = stack[stack.length - 1];
      if (!url) {
        if (gut) url = deb ? gutenbergSearch(deb) : "";
        else if (cur) {
          const root = await fetchFeed(cur.url);
          url = deb ? (await searchUrl(root, deb)) ?? cur.url : cur.url;
          if (!deb || url === cur.url) { if (alive) { setFeed(root); setList(root.entries); } return; }
        }
      }
      if (!url && gut) { const l = await gutenbergPopular(); if (alive) setList(l); return; }
      const f = await fetchFeed(url);
      if (!alive) return;
      setFeed(f);
      setList(gut ? gutenbergBooks(f) : f.entries);
    })().catch(() => alive && setErr(true));
    return () => { alive = false; };
  }, [src, deb, stack.join("|"), tick]);
  const loadMore = async () => {
    if (!feed?.next) return;
    const g = gen.current;
    setMore(true);
    try {
      const f = await fetchFeed(feed.next);
      if (g !== gen.current) return;
      setFeed(f);
      setList((l) => [...(l ?? []), ...(gut ? gutenbergBooks(f) : f.entries)]);
    } catch { /* the button stays for another try */ } finally { setMore(false); }
  };
  const add = async () => {
    if (!addUrl.trim()) return;
    setAddMsg({ text: tt("Katalog okunuyor…") });
    try {
      const s = await addSource(addUrl);
      setSources(loadSources()); setSrc(s.url); setAdding(false); setAddUrl(""); setAddMsg(null);
    } catch (e) { setAddMsg({ text: String(e).replace(/^Error: /, ""), err: true }); }
  };
  const remove = (u: string) => { saveSources(loadSources().filter((x) => x.url !== u)); setSources(loadSources()); if (src === u) setSrc("gutenberg"); };
  const books = list?.filter((e) => e.acq.length) ?? null;
  const shelves = list?.filter((e) => !e.acq.length && e.nav) ?? [];
  return (
    <>
      <div className="bk-cat-tabs">
        <button className={"seg sm" + (gut ? " on" : "")} onClick={() => setSrc("gutenberg")}>Project Gutenberg</button>
        <button className={"seg sm" + (vk ? " on" : "")} onClick={() => setSrc("vikikaynak")} title={tt("Telifi dolmuş Türkçe eserler (Wikisource)")}>{tt("Vikikaynak (Türkçe)")}</button>
        {sources.map((x) => (
          <span key={x.url} className={"seg sm bk-cat-src" + (src === x.url ? " on" : "")}>
            <button onClick={() => setSrc(x.url)} title={x.url}>{x.name}</button>
            <button className="bk-cat-x" aria-label={tt("Kaldır")} title={tt("Kaldır")} onClick={() => remove(x.url)}><Icon d={I.x} size={12} /></button>
          </span>
        ))}
        <button className="seg sm" onClick={() => setAdding((v) => !v)}><Icon d={I.plus} size={13} />  {tt("Kaynak ekle")}</button>
      </div>
      {adding && (
        <form className="bk-add" onSubmit={(e) => { e.preventDefault(); add(); }}>
          <input autoFocus value={addUrl} onChange={(e) => setAddUrl(e.target.value)} placeholder={tt("Katalog ya da site adresi: https://…")} />
          <button className="primary sm" disabled={!addUrl.trim()}>{tt("Ekle")}</button>
          <span className="muted small">{tt("Bir OPDS kataloğunun adresini gir (Calibre sunucusu, Kavita, Komga, kütüphanelerin katalogları…). Hangi kaynağı eklediğin ve indirdiğin içerik senin sorumluluğunda.")}</span>
          <SourceHelp onPick={setAddUrl} />
          {addMsg && <span className={"small " + (addMsg.err ? "bk-errtxt" : "muted")}>{addMsg.text}</span>}
        </form>
      )}
      <div className="row-head mu-lib-head">
        {stack.length > 0 && <button className="chip" onClick={() => setStack((s) => s.slice(0, -1))}>← {tt("Geri")}</button>}
        {(gut || vk || feed?.search || !feed) && (
          <label className="search mu-radio-search"><Icon d={I.search} size={18} />
            <input value={q} onChange={(e) => { setQ(e.target.value); setStack([]); }} placeholder={tt("Kitap ya da yazar ara (her dilde)")} /></label>
        )}
        {feed?.title && stack.length > 0 && <b>{feed.title}</b>}
      </div>
      {shelves.length > 0 && (
        <div className="bk-shelves">
          {shelves.map((e) => <button key={e.id + e.nav} className="bk-shelf" onClick={() => setStack((s) => [...s, e.nav!])}><b>{e.title}</b>{e.summary && <span className="muted small ellipsis">{e.summary}</span>}</button>)}
        </div>
      )}
      <section className="row">
        {!stack.length && <h2>{deb ? tt("“{0}” için sonuçlar", deb) : gut ? tt("En çok okunanlar") : vk ? tt("Romanlar ve kitaplar") : cur?.name}</h2>}
        {books && !books.length && !shelves.length && !err && <div className="muted">{tt("Kitap bulunamadı.")}</div>}
        <Shelf list={books} err={err} onRetry={() => setTick((n) => n + 1)} onFetch={onFetch} />
        {feed?.next && books && <button className="chip bk-more" disabled={more} onClick={loadMore}>{more ? tt("Yükleniyor…") : tt("Daha fazla")}</button>}
        <div className="muted small mu-credit">{gut ? tt("Kaynak: Project Gutenberg (telif süresi dolmuş, ücretsiz kitaplar)") : vk ? tt("Kaynak: Vikikaynak (Wikisource; telif süresi dolmuş, yasal ve ücretsiz eserler). Luna eseri sayfalarından EPUB'a çevirir; uzun eserler bir dakika kadar sürebilir.") : tt("Kaynak: {0} (senin eklediğin katalog)", cur?.name ?? "")}</div>
      </section>
    </>
  );
}

function AbCard({ a }: { a: Ab }) {
  const m = useMusic();
  const [busy, setBusy] = useState(false);
  const on = m.now?.book === a.identifier;
  const play = async () => {
    setBusy(true);
    try {
      const ch = await abChapters(a);
      const last = Number(store.get("abPos:" + a.identifier) ?? 0);
      if (ch.length) { rememberAb(a); playQueue(ch, Math.min(last, ch.length - 1)); }
    } finally { setBusy(false); }
  };
  return (
    <button className={"bk-card ab" + (on ? " on" : "")} onClick={play} disabled={busy} title={tt("Dinle")}
      onContextMenu={(e) => openMenu(e, [...askEntries({ title: abTitle(a.title), author: abAuthor(a) }), "sep", { label: tt("Dinle"), act: play }])}>
      <div className="bk-cover sq"><img src={abCover(a.identifier)} alt="" loading="lazy" /></div>
      <b className="bk-t">{abTitle(a.title)}</b>
      <span className="muted small ellipsis">{abAuthor(a)}</span>
      <span className="bk-prog muted small">{busy ? tt("Hazırlanıyor…") : on ? tt("Çalıyor") : store.get("abPos:" + a.identifier) ? tt("Devam et") : tt("Dinle")}</span>
    </button>
  );
}

function AbRow({ title, q, more }: { title: string; q: string; more?: () => void }) {
  const [list, setList] = useState<Ab[] | null>(null);
  useEffect(() => {
    let alive = true;
    librivox(q).then((l) => alive && setList(l.slice(0, 14))).catch(() => alive && setList([]));
    return () => { alive = false; };
  }, [q]);
  if (list && !list.length) return null;
  return (
    <section className="row">
      <div className="row-head"><h2>{title}</h2>{more && <button className="chip" onClick={more}>{tt("Tümü")}</button>}</div>
      <div className="bk-grid">
        {list == null && Array.from({ length: 7 }, (_, i) => <div key={i} className="bk-card ghost-card"><div className="bk-cover sq" /></div>)}
        {list?.map((a) => <AbCard key={a.identifier} a={a} />)}
      </div>
    </section>
  );
}

function Audiobooks({ query }: { query: string }) {
  const [q, setQ] = useState(query);
  const [deb, setDeb] = useState(query);
  useEffect(() => { setQ(query); setDeb(query); }, [query]);
  useEffect(() => { const t = setTimeout(() => setDeb(q), 450); return () => clearTimeout(t); }, [q]);
  return (
    <>
      <div className="row-head mu-lib-head">
        <label className="search mu-radio-search"><Icon d={I.search} size={18} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tt("Sesli kitap ya da yazar ara (LibriVox)")} /></label>
      </div>
      <AbRow key={deb} title={deb.trim() ? tt("“{0}” için sesli kitaplar", deb.trim()) : tt("En çok dinlenenler")} q={deb} />
      <div className="muted small mu-credit">{tt("Kaynak: LibriVox gönüllüleri, archive.org üzerinden (kamu malı, ücretsiz). Çoğu İngilizce.")}</div>
    </>
  );
}

// ---------- a book's page (like a film's): what it is, your verdict, questions for the assistant ----------
type BookNote = { vote?: "like" | "dislike"; rating?: number; note?: string; read?: number; at: number };
const bkKey = (b: { title: string; author: string }) => (b.title + "|" + b.author).toLocaleLowerCase();
export const loadBookNotes = () => store.json<Record<string, BookNote & { title: string; author: string }>>("bookDiary", {});
/** Clears what Luna kept about a book: where you were, likes, points and note. The file stays. */
export function clearBookRecord(b: { path: string; title: string; author: string }) {
  try { localStorage.removeItem(posKey(b.path)); } catch {}
  const d = loadBookNotes();
  delete d[bkKey(b)];
  store.set("bookDiary", JSON.stringify(d));
  store.set("bookRecent", JSON.stringify(store.json<string[]>("bookRecent", []).filter((p) => p !== b.path)));
  libSubs.forEach((f) => f());
}
/** A deleted book file leaves the library (rescanned). */
export const forgetBooks = () => libChanged();
function setBookNote(b: { title: string; author: string }, patch: Partial<BookNote>) {
  const d = loadBookNotes();
  const cur = d[bkKey(b)] ?? { title: b.title, author: b.author, at: Date.now() };
  const next = { ...cur, ...patch, at: Date.now() };
  for (const k of Object.keys(patch) as (keyof BookNote)[]) if (patch[k] === undefined) delete next[k];
  d[bkKey(b)] = next;
  store.set("bookDiary", JSON.stringify(d));
}
type OlInfo = { year?: number; subjects: string[]; pages?: number; about?: string; rating?: number; editions?: number; url?: string; cover?: string };
/** What Open Library (free and open) knows about a book, kept once found. */
async function openLibrary(b: { title: string; author: string }): Promise<OlInfo | null> {
  const k = "olInfo:" + bkKey(b);
  const c = store.json<OlInfo | null | undefined>(k, undefined);
  if (c !== undefined) return c;
  const p = new URLSearchParams({ title: b.title.replace(/[;:].*$/, ""), limit: "1", fields: "key,title,first_publish_year,subject,number_of_pages_median,ratings_average,edition_count,cover_i" });
  if (b.author) p.set("author", b.author);
  const r = await getJson("https://openlibrary.org/search.json?" + p).catch(() => null);
  const d = r?.docs?.[0];
  // only the same book: "test" must not turn into "The Psychopath Test"
  const n = (x: string) => x.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const want = n(b.title.replace(/[;:].*$/, "")), got = n(String(d?.title ?? ""));
  if (!d || !(got === want || (want.length >= 6 && (got.startsWith(want) || want.startsWith(got))))) { store.set(k, "null"); return null; }
  const w = await getJson(`https://openlibrary.org${d.key}.json`).catch(() => null);
  const about = typeof w?.description === "string" ? w.description : w?.description?.value;
  const info: OlInfo = {
    year: d.first_publish_year, subjects: (d.subject ?? []).slice(0, 8), pages: d.number_of_pages_median,
    rating: d.ratings_average ? Math.round(d.ratings_average * 10) / 10 : undefined, editions: d.edition_count,
    about: about ? String(about).split(/\n-{3,}|\r?\n\r?\n\(/)[0].slice(0, 1500) : undefined,
    url: `https://openlibrary.org${d.key}`, cover: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : undefined,
  };
  store.set(k, JSON.stringify(info));
  return info;
}

/** A public-domain artwork for the book's page: open museum collections, no key, cached per book. */
type Art = { url: string; title: string; artist: string; source: string };
const clean = (h: string) => h.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
async function metArt(q: string): Promise<Art | null> {
  const ids = JSON.parse(await invoke<string>("http_text", { url: `https://collectionapi.metmuseum.org/public/collection/v1.1/search?q=${encodeURIComponent(q)}&hasImages=true&isPublicDomain=true&offset=0&limit=20` }))?.objectIDs;
  if (!Array.isArray(ids)) return null;
  for (const id of ids.slice(0, 2)) {
    const o = JSON.parse(await invoke<string>("http_text", { url: `https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}` }));
    if (o?.isPublicDomain && o?.primaryImageSmall) return { url: o.primaryImageSmall, title: clean(o.title ?? ""), artist: clean(o.artistDisplayName ?? ""), source: "The Metropolitan Museum of Art" };
  }
  return null;
}
/** Wikimedia Commons: paintings and prints, only public-domain/CC0 files (upload.wikimedia.org serves them directly). */
async function commonsArt(q: string): Promise<Art | null> {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=${encodeURIComponent(q + " painting")}&gsrnamespace=6&gsrlimit=8&prop=imageinfo&iiprop=url%7Cextmetadata&iiurlwidth=1200`;
  const j = JSON.parse(await invoke<string>("http_text", { url }));
  const pages = Object.values(j?.query?.pages ?? {}) as { index?: number; title?: string; imageinfo?: { thumburl?: string; extmetadata?: { LicenseShortName?: { value?: string }; Artist?: { value?: string } } }[] }[];
  pages.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  for (const p of pages) {
    const ii = p.imageinfo?.[0];
    const lic = ii?.extmetadata?.LicenseShortName?.value ?? "";
    if (!ii?.thumburl || !/public domain|cc0|\bpd\b|pd-art/i.test(lic)) continue;
    return {
      url: ii.thumburl,
      title: clean((p.title ?? "").replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, "").replace(/_/g, " ")),
      artist: clean(ii.extmetadata?.Artist?.value ?? ""),
      source: "Wikimedia Commons",
    };
  }
  return null;
}
async function artFor(b: { title: string; author: string }, subjects: string[]): Promise<Art | null> {
  const k = "art2:" + bkKey(b);
  const c = store.json<(Art & { at?: number }) | { url: ""; at?: number } | undefined>(k, undefined);
  if (c) {
    if (c.url) return c as Art;
    // no match: try again after a day (the network may have been down)
    if (c.at && Date.now() - c.at < 86400e3) return null;
  }
  const boring = /^(fiction|general|history|literature|classics|english literature|juvenile fiction|young adult|large type books|american|english|horror|horror stories|horror tales|thriller|thrillers|monsters|fantasy|science fiction|drama|poetry|romance|adventure|mystery|suspense|gothic|gothic fiction|psychological fiction|adaptations|criticism and interpretation|history and criticism|fiction, general)$/i;
  const topics = subjects.map((s) => s.trim()).filter((s) => s && s.length < 48 && !boring.test(s));
  const title = b.title.replace(/[;:].*$/, "").trim();
  let out: Art | null = null;
  // museum art for a concrete subject first (titles match objects too loosely in museum searches),
  // then public-domain paintings from Commons (subjects, then the title)
  for (const q of topics.slice(0, 2)) { out = await metArt(q).catch(() => null); if (out) break; }
  if (!out) for (const q of [...topics.slice(0, 2), title]) { out = await commonsArt(q).catch(() => null); if (out) break; }
  store.set(k, JSON.stringify(out ? { ...out, at: Date.now() } : { url: "", at: Date.now() }));
  return out;
}

/** Luna Analiz names the six topics for books. */
const BOOK_ASPECTS: Record<Aspect, string> = { story: "Kurgu", pace: "Tempo", acting: "Üslup", visuals: "Atmosfer ve dünya", emotion: "Karakter ve duygu", sound: "Fikirler ve derinlik" };
function BookDetail({ b, onClose, onRead }: { b: Book; onClose: () => void; onRead: () => void }) {
  const bookProfile = cleanProfile(store.json(profileKeyOf("book"), null));
  const [info, setInfo] = useState<OlInfo | null | undefined>(undefined);
  const [, bump] = useState(0);
  const note = loadBookNotes()[bkKey(b)];
  const [text, setText] = useState(note?.note ?? "");
  const [rate, setRate] = useState<"like" | "dislike" | null>(null);
  const [art, setArt] = useState<Art | null>(null);
  useEffect(() => {
    if (info === undefined) return;
    let alive = true;
    artFor(b, info?.subjects ?? []).then((a) => { if (alive) setArt(a); });
    return () => { alive = false; };
  }, [b.path, info]);
  useEffect(() => {
    let alive = true;
    openLibrary(b).then((i) => alive && setInfo(i)).catch(() => alive && setInfo(null));
    return () => { alive = false; };
  }, [b.path]);
  const set = (p: Partial<BookNote>) => { setBookNote(b, p); bump((n) => n + 1); };
  const pos = getPos(b.path);
  const vote = (v: "like" | "dislike") => {
    const on = note?.vote !== v;
    set({ vote: on ? v : undefined, ...(on && note?.vote && note.vote !== v ? { rating: undefined } : {}) });
    setRate(on ? v : null);
  };
  const [more, setMore] = useState(false);
  const cover = b.cover ?? info?.cover;
  const going = !!pos && pos.pct > 0.01 && pos.pct < 0.99;
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, []);
  // the same page as a film's details: a full screen, the cover as the backdrop
  return createPortal(
    <div className="details page-anim bk-page">
      <section className="d-hero">
        <div className="hero-bg bk-d-bg" style={(art?.url ?? cover) ? { backgroundImage: `url("${art?.url ?? cover}")` } : undefined} />
        <div className="d-shade" />
        <header>
          <button className="round" aria-label={tt("Geri")} onClick={onClose}><Icon d={I.left} /></button>
          <div className="brand">{tt("Kitaplar")}</div>
        </header>
        <div className="d-body bk-d-body">
          <div className="bk-d-cov" onContextMenu={(e) => openMenu(e, [{ label: tt("Oku"), act: onRead }, "sep", ...deleteEntries(b, onClose)])}><BookCover src={cover} title={b.title} author={b.author} w={170} /></div>
          <div className="bk-d-main">
            <span className="eyebrow">{b.kind === "cbz" ? tt("ÇİZGİ ROMAN") : tt("KİTAP")}</span>
            <h1>{b.title}</h1>
            <div className="d-meta">
              {info?.rating ? <button className="rating" title={tt("Open Library'de aç")} onClick={() => info.url && openUrl(info.url)}>★ {String(info.rating).replace(".", lang() === "tr" ? "," : ".")}</button> : null}
              {b.author && <span>{b.author}</span>}
              {info?.year ? <span>{info.year}</span> : null}
              {info?.pages ? <span>{tt("{0} sayfa", info.pages)}</span> : null}
              <span>{b.kind.toUpperCase()}</span>
            </div>
            {pos && <div className="bk-d-prog"><div className="bk-bar"><div style={{ width: pos.pct * 100 + "%" }} /></div><span className="muted small">{pos.pct >= 0.99 ? tt("bitti") : pctText(pos.pct)}{pos.chapter ? " · " + pos.chapter : ""}</span></div>}
            {info?.about ? (
              <div>
                <TrText className={"overview" + (more ? " open" : "")} text={info.about} />
                {info.about.length > 260 && <button className="more-btn" onClick={() => setMore((v) => !v)}>{more ? tt("Daha az göster") : tt("Devamını oku")}</button>}
              </div>
            ) : info === undefined ? <p className="overview muted">{tt("Bilgiler getiriliyor…")}</p> : null}
            <div className="hero-actions">
              <button className="primary light" onClick={onRead}><Icon d={I.play} fill size={18} /> {going ? tt("Okumaya devam et") : tt("Oku")}</button>
              <span className="act-sep" aria-hidden="true" />
              <button className={"act" + (note?.read ? " on good" : "")} data-tip={note?.read ? tt("Okumadım") : tt("Okudum")} aria-label={tt("Okudum")}
                onClick={() => set({ read: note?.read ? undefined : Date.now() })}><Icon d={I.check} size={20} /></button>
              <span className="vote-wrap">
                <button className={"act" + (note?.vote === "like" ? " on" : "")} data-tip={note?.vote === "like" && note.rating ? tt("Beğendim · {0}/10", note.rating) : tt("Beğendim")} aria-label={tt("Beğendim")} onClick={() => vote("like")}>
                  <Icon d="M7 10v11H3V10zM7 10l4-8a3 3 0 0 1 3 3v4h6a2 2 0 0 1 2 2.3l-1.4 8A2 2 0 0 1 18.6 21H7" size={20} />{note?.vote === "like" && note.rating ? <span className="vote-n">{note.rating}</span> : null}</button>
              </span>
              <span className="vote-wrap">
                <button className={"act" + (note?.vote === "dislike" ? " on bad" : "")} data-tip={note?.vote === "dislike" && note.rating ? tt("Beğenmedim · {0}/10", note.rating) : tt("Beğenmedim")} aria-label={tt("Beğenmedim")} onClick={() => vote("dislike")}>
                  <Icon d="M17 14V3h4v11zM17 14l-4 8a3 3 0 0 1-3-3v-4H4a2 2 0 0 1-2-2.3l1.4-8A2 2 0 0 1 5.4 3H17" size={20} />{note?.vote === "dislike" && note.rating ? <span className="vote-n">{note.rating}</span> : null}</button>
              </span>
              <button className="act" data-tip={tt("Asistana sor")} aria-label={tt("Asistana sor")} onClick={() => { onClose(); askAssistant(bookAsks(b)[0][1]); }}><Icon d={I.chat} size={20} /></button>
              {info?.url && <button className="act" data-tip={tt("Open Library'de aç")} aria-label="Open Library" onClick={() => openUrl(info.url!)}><Icon d="M14 3h7v7M21 3l-9 9M5 5h5M5 5v14h14v-5" size={18} /></button>}
            </div>
            {rate && (
              <div className="bk-rate">
                <span className="muted small">{tt("Kaç puan verirsin?")}</span>
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <button key={n} className={"chip" + (note?.rating === n ? " on" : "")} onClick={() => { set({ rating: n }); setRate(null); }}>{n}</button>
                ))}
                <button className="chip" onClick={() => setRate(null)}>{tt("Geç")}</button>
              </div>
            )}
          </div>
        </div>
      </section>
      {info?.subjects.length ? (
        <section className="row"><h2>{tt("Konular")}</h2><div className="bk-d-subs">{info.subjects.map((s) => <span key={s} className="chip">{s}</span>)}</div></section>
      ) : null}
      {/* Luna Analiz: what 1000Kitap's readers say, read one by one */}
      <section className="row la bk-la">
        <ReviewAiCard medium="book" author={b.author || undefined} film={{ title: b.title, year: info?.year ?? undefined }} profile={bookProfile} mood="any" setMood={() => {}}
          label={(a) => tt(BOOK_ASPECTS[a])} onReviews={() => {}} onRun={() => bump((n) => n + 1)} />
        {/* the reading taste: only books, kept apart from films and music */}
        <details className="la-sec" open={!!note?.vote}>
          <summary><h3>{tt("Okuduktan sonra")}</h3><span>{note?.vote === "like" ? tt("Beğendin") : note?.vote === "dislike" ? tt("Beğenmedin") : tt("Önce yukarıdan beğen ya da beğenme")}</span></summary>
          {note?.vote
            ? <ReasonPicker kind="book" itemKey={filmKey({ title: b.title, year: info?.year ?? undefined })} vote={note.vote} name={b.title + (b.author ? " — " + b.author : "")} />
            : <p className="la-muted">{tt("Kitabı beğendiğini ya da beğenmediğini işaretleyince, seni neyin etkilediğini burada seçersin; kitap zevkin bundan öğrenir.")}</p>}
        </details>
        <TastePanel kind="book" open={false} scores={aspectsOf({ title: b.title, year: info?.year ?? undefined }, "book") ?? {}} />
      </section>
      <section className="row">
        <h2>{tt("Asistana sor")}</h2>
        <div className="bk-d-subs">{bookAsks(b).map(([l, q]) => <button key={l} className="chip" onClick={() => { onClose(); askAssistant(q); }}>✦ {l}</button>)}</div>
      </section>
      <section className="row">
        <h2>{tt("Notun")}</h2>
        <input className="bk-d-note" value={text} onChange={(e) => { setText(e.target.value); set({ note: e.target.value.trim() || undefined }); }} onBlur={() => set({ note: text.trim() || undefined })} placeholder={tt("ör. sonu çok etkileyiciydi, ikinci yarısı yavaş")} />
        {art && <small className="muted bk-art-credit">{art.title}{art.artist ? ` — ${art.artist}` : ""} · {art.source} · {tt("Kamu malı")}</small>}
      </section>
    </div>,
    document.querySelector(".root") ?? document.body,
  );
}

// ---------- reading history: every sitting with a book (when, how long, from where to where) ----------
type Sitting = { b: Book; at: number; mins: number; from: number; to: number; aloud?: number };
export const loadReadHistory = () => store.json<Sitting[]>("bookHistory", []);
function addSitting(b: Book, start: number, from: number, to: number, aloudSecs = 0) {
  const mins = (Date.now() - start) / 60000;
  if (mins < 0.3) return;
  const l = loadReadHistory();
  const last = l[0];
  const aloud = aloudSecs / 60;
  // back to the same book within half an hour: one sitting
  if (last && last.b.path === b.path && start - (last.at + last.mins * 60000) < 30 * 60000) {
    l[0] = { ...last, mins: last.mins + mins, to, aloud: (last.aloud ?? 0) + aloud || undefined };
  } else l.unshift({ b, at: start, mins, from, to, aloud: aloud >= 0.1 ? aloud : undefined });
  store.set("bookHistory", JSON.stringify(l.slice(0, 300)));
}
const isFinishedBook = (b: { path: string; title: string; author: string }) => (getPos(b.path)?.pct ?? 0) >= 0.99 || !!loadBookNotes()[bkKey(b)]?.read;

// ---------- the reader ----------
type Theme = "day" | "quiet" | "sepia" | "dusk" | "night" | "forest";
type Spacing = "tight" | "normal" | "loose";
type ReaderSet = { theme: Theme; size: number; font: "serif" | "sans"; spread: boolean; spacing: Spacing; bold: boolean; scroll: boolean;
  /** 0–0.7: the page darkened (Windows' own brightness isn't touched) */
  dim: number;
  /** 0–1: a warm tint for the evening (less blue light) */
  warm: number };
const THEMES: Record<Theme, { bg: string; fg: string; label: string }> = {
  day: { bg: "#ffffff", fg: "#1d1d1f", label: "Orijinal" },
  quiet: { bg: "#ececec", fg: "#2b2b2e", label: "Sakin" },
  sepia: { bg: "#f4ecdc", fg: "#3b2f22", label: "Kâğıt" },
  dusk: { bg: "#2d2a26", fg: "#e9e1d2", label: "Akşam" },
  night: { bg: "#121016", fg: "#d9d4e0", label: "Gece" },
  forest: { bg: "#1d2a24", fg: "#dfeee5", label: "Orman" },
};
const LINE: Record<Spacing, number> = { tight: 1.45, normal: 1.7, loose: 1.95 };
const loadSet = (): ReaderSet => {
  const s = { theme: "sepia" as Theme, size: 100, font: "serif" as const, spread: true, spacing: "normal" as Spacing, bold: false, scroll: false, dim: 0, warm: 0,
    ...store.json<Partial<ReaderSet> & { theme?: string }>("readerSet", {}) } as ReaderSet;
  // the earlier themes: "gray" became "Akşam"
  if (!(s.theme in THEMES)) s.theme = (s.theme as string) === "gray" ? "dusk" : "sepia";
  return s;
};
type Toc = { label: string; href: string; subitems?: Toc[] };

// ---------- highlights, notes and bookmarks (per book, on this computer) ----------
type HlColor = "yellow" | "green" | "blue" | "pink" | "line";
const HL: Record<Exclude<HlColor, "line">, string> = { yellow: "#f7d154", green: "#8fd17a", blue: "#7ab8f5", pink: "#f28cb3" };
type Hl = { id: string; cfi: string; text: string; color: HlColor; note?: string; chapter?: string; at: number };
type Mark = { id: string; loc?: string; pct: number; label: string; chapter?: string; at: number };
type PageNote = { id: string; text: string; loc?: string; pct: number; chapter?: string; at: number };
type Ann = { hl: Hl[]; marks: Mark[]; notes: PageNote[] };
const annKey = (b: { path: string }) => "bkAnnPath:" + b.path;
function cleanAnn(value: unknown): Ann {
  const x = value && typeof value === "object" ? value as Partial<Ann> : {};
  const basic = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && typeof (v as any).id === "string" && typeof (v as any).at === "number" && Number.isFinite((v as any).at) && ((v as any).chapter === undefined || typeof (v as any).chapter === "string");
  const position = (v: unknown) => basic(v) && typeof v.pct === "number" && Number.isFinite(v.pct) && v.pct >= 0 && v.pct <= 1 && (v.loc === undefined || typeof v.loc === "string");
  return {
    hl: Array.isArray(x.hl) ? x.hl.filter(v => basic(v) && typeof v.cfi === "string" && typeof v.text === "string" && ["yellow", "green", "blue", "pink", "line"].includes(v.color) && (v.note === undefined || typeof v.note === "string")) : [],
    marks: Array.isArray(x.marks) ? x.marks.filter(v => position(v) && typeof v.label === "string") : [],
    notes: Array.isArray(x.notes) ? x.notes.filter(v => position(v) && typeof v.text === "string") : [],
  };
}
const loadAnn = (b: { path: string }): Ann => cleanAnn(store.json(annKey(b), {}));
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
type Here = { pct: number; label: string; chapter?: string; loc?: string; left?: number };
type Found = { cfi: string; excerpt: string; chapter?: string };
type Nav = {
  next: () => void; prev: () => void; go?: (href: string) => void; seek?: (pct: number) => void;
  /** EPUB only: draw these highlights; search the whole book */
  paint?: (hl: Hl[]) => void; find?: (q: string) => Promise<Found[]>;
};
type Sel = { cfi: string; text: string; x: number; y: number; bottom?: number; id?: string };
type Side = "" | "toc" | "marks" | "notes" | "find";

function Reader({ b, onClose }: { b: Book; onClose: () => void }) {
  const [set, setSetState] = useState<ReaderSet>(loadSet);
  const setSet = (p: Partial<ReaderSet>) => setSetState((s) => { const n = { ...s, ...p }; store.set("readerSet", JSON.stringify(n)); return n; });
  const [panel, setPanelNow] = useState<"" | "aa" | "music" | "side">("");
  // a popup that closes fades out instead of vanishing
  const [leaving, setLeaving] = useState<"" | "aa" | "music">("");
  const leaveT = useRef(0);
  const setPanel = (v: "" | "aa" | "music" | "side") => {
    if (panel !== v && (panel === "aa" || panel === "music")) {
      setLeaving(panel); clearTimeout(leaveT.current);
      leaveT.current = window.setTimeout(() => setLeaving(""), 180);
    }
    setPanelNow(v);
  };
  const [side, setSide] = useState<Side>("toc");
  const [here, setHere] = useState<Here>({ pct: getPos(b.path)?.pct ?? 0, label: "" });
  // this sitting goes into the reading history when the book is closed
  const hereRef = useRef(here);
  hereRef.current = here;
  useEffect(() => {
    const start = Date.now(), from = getPos(b.path)?.pct ?? 0;
    return () => addSitting(b, start, from, hereRef.current.pct, takeHeard());
  }, [b.path]);
  const [err, setErr] = useState("");
  const [toc, setToc] = useState<Toc[]>([]);
  const [ann, setAnnState] = useState<Ann>(() => loadAnn(b));
  const [annError, setAnnError] = useState("");
  const [legacyAnn, setLegacyAnn] = useState(() => !store.get(annKey(b)) && !!store.get("bkAnn:" + bkKey(b)));
  const setAnn = (f: (a: Ann) => Ann) => {
    const n = f(ann);
    if (!store.set(annKey(b), JSON.stringify(n))) { setAnnError(tt("Not kaydedilemedi. Depolama alanını kontrol et.")); return false; }
    setAnnError(""); setAnnState(n); return true;
  };
  const [sel, setSel] = useState<Sel | null>(null);
  const [noteFor, setNoteFor] = useState<{ id?: string; hlId?: string; text: string } | null>(null);
  const nav = useRef<Nav>({ next: () => {}, prev: () => {} });
  // the bars fade while you read; a move of the mouse brings them back
  const [idle, setIdle] = useState(false);
  const idleT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const poke = () => { setIdle(false); clearTimeout(idleT.current); idleT.current = setTimeout(() => setIdle(true), 3500); };
  useEffect(() => { poke(); return () => clearTimeout(idleT.current); }, []);
  const closeAll = () => { setPanel(""); setSel(null); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Keys from inside the EPUB frame are passed on to the window, so the target isn't always an element.
      const el = e.target instanceof Element ? (e.target as HTMLElement) : null;
      // A focused button keeps Space for its own activation, but arrow/page keys should still
      // turn pages (after closing the Aa / contents panel, focus stays on its button).
      // (Esc still closes a panel from a one-line box, e.g. the search field; a note being written isn't thrown away)
      if (el && (el.closest("input, textarea, select") || el.isContentEditable) && (e.key !== "Escape" || !el.closest("input"))) return;
      if (e.key === " " && el?.closest("button")) return;
      // read aloud, as in Edge
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "u") { e.preventDefault(); e.stopPropagation(); if (b.kind === "epub") ttsToggle(); return; }
      if (e.key === "Escape") { e.stopPropagation(); if (noteFor) setNoteFor(null); else if (panel || sel) closeAll(); else onClose(); }
      else if (["ArrowRight", "PageDown", " "].includes(e.key)) { e.preventDefault(); e.stopPropagation(); setSel(null); nav.current.next(); }
      else if (["ArrowLeft", "PageUp"].includes(e.key)) { e.preventDefault(); e.stopPropagation(); setSel(null); nav.current.prev(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [panel, sel, noteFor]);
  useEffect(() => { nav.current.paint?.(ann.hl); }, [ann.hl]);
  const th = THEMES[set.theme];
  const music = useMusic();
  const tts = useTts();
  // music started while the book is being read aloud: the reading waits
  useEffect(() => { if (music.now && !music.paused && tts.playing) ttsPause(); }, [music.paused, music.now?.src]);
  const marked = ann.marks.find((m) => (here.loc && m.loc === here.loc) || (!here.loc && Math.abs(m.pct - here.pct) < 0.0005));
  const toggleMark = () => setAnn((a) => marked ? { ...a, marks: a.marks.filter((m) => m !== marked) }
    : { ...a, marks: [{ id: newId(), loc: here.loc, pct: here.pct, label: here.label, chapter: here.chapter, at: Date.now() }, ...a.marks] });
  const goTo = (x: { loc?: string; pct: number }) => { if (x.loc && b.kind === "epub") nav.current.go?.(x.loc); else nav.current.seek?.(x.pct); };
  const mark = (color: HlColor) => {
    if (!sel) return;
    if (sel.id) setAnn((a) => ({ ...a, hl: a.hl.map((h) => (h.id === sel.id ? { ...h, color } : h)) }));
    else setAnn((a) => ({ ...a, hl: [...a.hl, { id: newId(), cfi: sel.cfi, text: sel.text, color, chapter: here.chapter, at: Date.now() }] }));
    setSel(null);
  };
  const ask = (text: string) => askAssistant(tt("“{0}” kitabından ({1}) şu bölüm: “{2}”. Bunu açıklar mısın? Anlamı, bağlamı ve varsa göndermeleri.", b.title, b.author || tt("yazarı bilinmiyor"), text.slice(0, 600)));
  const askChapter = () => askAssistant(here.chapter
    ? tt("“{0}” ({1}) kitabını okuyorum, şu an “{2}” bölümündeyim. Bu bölüme kadar spoiler vermeden ne olduğunu kısaca hatırlatır mısın?", b.title, b.author || "?", here.chapter)
    : tt("“{0}” ({1}) kitabını okuyorum (%{2}). Buraya kadar spoiler vermeden kısaca hatırlatır mısın?", b.title, b.author || "?", Math.round(here.pct * 100)));
  const saveNote = () => {
    if (!noteFor) return;
    const text = noteFor.text.trim();
    let saved = true;
    if (noteFor.hlId) saved = setAnn((a) => ({ ...a, hl: a.hl.map((h) => (h.id === noteFor.hlId ? { ...h, note: text || undefined } : h)) }));
    else if (noteFor.id) saved = setAnn((a) => ({ ...a, notes: text ? a.notes.map((n) => (n.id === noteFor.id ? { ...n, text } : n)) : a.notes.filter((n) => n.id !== noteFor.id) }));
    else if (text) saved = setAnn((a) => ({ ...a, notes: [{ id: newId(), text, loc: here.loc, pct: here.pct, chapter: here.chapter, at: Date.now() }, ...a.notes] }));
    if (saved) setNoteFor(null);
  };
  const openSide = (s: Side) => { setSide(s); setPanel("side"); setSel(null); };
  const curHl = sel?.id ? ann.hl.find((h) => h.id === sel.id) : undefined;
  return createPortal(
    <div className={"bk-reader t-" + set.theme + (idle && !panel && !sel && !noteFor ? " idle" : "")} onMouseMove={poke}
      style={{ ["--pg-bg" as string]: th.bg, ["--pg-fg" as string]: th.fg }}>
      <div className="bk-r-top">
        <button className="round" aria-label={tt("Kitaplığa dön")} onClick={onClose}><Icon d={I.left} size={20} /></button>
        <button className={"rb" + (panel === "side" ? " on" : "")} aria-label={tt("İçindekiler, yer imleri ve notlar")} title={tt("İçindekiler, yer imleri ve notlar")}
          onClick={() => (panel === "side" ? setPanel("") : openSide(side === "find" ? (toc.length ? "toc" : "marks") : side))}><Icon d="M4 6h16M4 12h16M4 18h10" size={16} /></button>
        <div className="bk-r-title"><b className="ellipsis">{b.title}</b><span className="muted small ellipsis">{[b.author, here.chapter].filter(Boolean).join(" · ")}</span></div>
        <span className="grow" />
        {b.kind === "epub" && <button className={"rb" + (tts.active ? " on" : "")} aria-label={tt("Sesli oku")} title={tt("Sesli oku (Ctrl+Shift+U)")}
          onClick={() => { closeAll(); if (tts.active) ttsStop(); else ttsStart(); }}>
          <Icon d="M4 9v6h4l5 4V5L8 9H4zM16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" size={16} /></button>}
        {b.kind === "epub" && <button className="rb" aria-label={tt("Kitapta ara")} title={tt("Kitapta ara")} onClick={() => openSide("find")}>
          <Icon d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.5-3.5" size={16} /></button>}
        <button className="rb" aria-label={tt("Bu sayfaya not ekle")} title={tt("Bu sayfaya not ekle")} onClick={() => { closeAll(); setNoteFor({ text: "" }); }}>
          <Icon d="M4 20h4L19 9l-4-4L4 16zM13 7l4 4" size={16} /></button>
        <button className="rb" aria-label={tt("Asistan")} title={tt("Asistan")} onClick={(e) => { closeAll(); openMenu(e, [
          { label: tt("Asistanı aç"), act: openAssistant },
          "sep",
          { label: "✦  " + tt("Buraya kadar olanları hatırlat (spoilersız)"), act: askChapter },
          { label: "✦  " + tt("Bu kitap hakkında konuşalım"), act: () => askAssistant(tt("“{0}” ({1}) kitabını okuyorum. Yazarı, dönemi ve neden önemli olduğu hakkında spoiler vermeden konuşalım.", b.title, b.author || "?")) },
          { label: "✦  " + tt("Bunu okurken ne dinlesem?"), act: () => askAssistant(tt("“{0}” ({1}) kitabını okurken arka planda ne dinlesem? Birkaç şarkı ya da albüm öner ve birini çal.", b.title, b.author || "?")) },
        ]); }}><Icon d={I.chat} size={16} /></button>
        <button className={"rb" + (panel === "music" ? " on" : "") + (music.now && !music.paused ? " playing" : "")} aria-label={tt("Müzik")} title={tt("Müzik")}
          onClick={() => { setSel(null); setPanel(panel === "music" ? "" : "music"); }}><Icon d="M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" size={16} /></button>
        <button className={"rb aa" + (panel === "aa" ? " on" : "")} aria-label={tt("Temalar ve ayarlar")} title={tt("Temalar ve ayarlar")} onClick={() => { setSel(null); setPanel(panel === "aa" ? "" : "aa"); }}>Aa</button>
        <button className={"rb" + (marked ? " on marked" : "")} aria-label={marked ? tt("Yer imini kaldır") : tt("Yer imi ekle")} title={marked ? tt("Yer imini kaldır") : tt("Yer imi ekle")} onClick={toggleMark}>
          <Icon d="M6 3h12v18l-6-4-6 4z" size={16} fill={!!marked} /></button>
      </div>
      <div className="bk-r-page">
        {err ? <div className="bk-r-err">{err}</div>
          : b.kind === "epub" ? <EpubView b={b} set={set} nav={nav} onState={setHere} onToc={setToc} onErr={setErr} hl={ann.hl}
              onSelect={(s) => { setPanel(""); setSel(s); }} onTap={() => { closeAll(); poke(); }} onMove={poke} />
          : b.kind === "pdf" ? <PdfView b={b} set={set} nav={nav} onState={setHere} onErr={setErr} />
          : <CbzView b={b} set={set} nav={nav} onState={setHere} onErr={setErr} />}
        {/* brightness and warmth: over the page, clicks go through */}
        {set.dim > 0 && <div className="bk-r-dim" style={{ background: `rgba(0,0,0,${set.dim})` }} />}
        {set.warm > 0 && <div className="bk-r-warm" style={{ background: `rgba(255,140,40,${set.warm * 0.28})` }} />}
        <button className="bk-r-side l" aria-label={tt("Önceki sayfa")} onClick={() => { setSel(null); nav.current.prev(); }}><Icon d={I.left} size={26} /></button>
        <button className="bk-r-side r" aria-label={tt("Sonraki sayfa")} onClick={() => { setSel(null); nav.current.next(); }}><Icon d={I.right} size={26} /></button>
      </div>
      <div className="bk-r-foot">
        <span>{here.left != null ? (here.left > 0 ? tt("Bölümde {0} sayfa kaldı", here.left) : tt("Bölümün son sayfası")) : here.label}</span>
        <input type="range" min={0} max={1000} value={Math.round(here.pct * 1000)} aria-label={tt("Kitapta ilerle")}
          onChange={(e) => nav.current.seek?.(Number(e.target.value) / 1000)} disabled={!nav.current.seek} />
        <span>{pctText(here.pct)}</span>
      </div>

      {annError && <div className="bk-ann-error" role="alert">{annError}<button onClick={() => setAnnError("")}>{tt("Kapat")}</button></div>}
      {legacyAnn && <div className="bk-legacy-ann" role="status"><span>{tt("Bu başlığa ait eski notlar var. Yalnız bu baskıyla eşleşiyorsa içe aktar.")}</span><button onClick={() => {
        if (!confirm(tt("Eski notları bu dosyaya kopyalamak istiyor musun? Başka baskıların konumları uymayabilir. Eski kayıt korunur."))) return;
        const old = cleanAnn(store.json("bkAnn:" + bkKey(b), {}));
        if (setAnn(a => ({ hl: [...a.hl, ...old.hl.filter(v => !a.hl.some(n => n.id === v.id))], marks: [...a.marks, ...old.marks.filter(v => !a.marks.some(n => n.id === v.id))], notes: [...a.notes, ...old.notes.filter(v => !a.notes.some(n => n.id === v.id))] }))) setLegacyAnn(false);
      }}>{tt("Eski notları kopyala")}</button><button onClick={() => setLegacyAnn(false)}>{tt("Şimdilik kapat")}</button></div>}

      {/* also after the reading ended by itself, to say why (end of the book, Edge's voice down…) */}
      {(tts.active || (!!tts.note && tts.note !== "privacy")) && <ReadAloudBar />}

      {/* a click anywhere else closes what is open */}
      {(panel || sel) && <div className="bk-r-catch" onMouseDown={closeAll} />}

      {sel && (
        // above the selected text when there is room, else under it: never over it
        <div className={"bk-sel" + (sel.y - 120 < 64 ? " below" : "")} role="toolbar" aria-label={tt("Seçili metin")}
          style={{ left: Math.max(180, Math.min(window.innerWidth - 180, sel.x)), top: sel.y - 120 < 64 ? (sel.bottom ?? sel.y + 24) + 12 : sel.y - 12 }}>
          <div className="bk-sel-row">
            {(Object.keys(HL) as (keyof typeof HL)[]).map((c) => (
              <button key={c} className={"bk-dot" + (curHl?.color === c ? " on" : "")} style={{ background: HL[c] }} aria-label={tt("Vurgula: {0}", tt(c === "yellow" ? "sarı" : c === "green" ? "yeşil" : c === "blue" ? "mavi" : "pembe"))} onClick={() => mark(c)} />
            ))}
            <button className={"bk-dot line" + (curHl?.color === "line" ? " on" : "")} aria-label={tt("Altını çiz")} title={tt("Altını çiz")} onClick={() => mark("line")}>U</button>
          </div>
          <div className="bk-sel-row acts">
            <button onClick={() => { ttsStart(sel.cfi); setSel(null); }}>🔊 {tts.active ? tt("Buradan devam et") : tt("Buradan oku")}</button>
            <button onClick={() => {
              if (curHl) setNoteFor({ hlId: curHl.id, text: curHl.note ?? "" });
              else { const id = newId(); setAnn((a) => ({ ...a, hl: [...a.hl, { id, cfi: sel.cfi, text: sel.text, color: "yellow", chapter: here.chapter, at: Date.now() }] })); setNoteFor({ hlId: id, text: "" }); }
              setSel(null);
            }}>{curHl?.note ? tt("Notu düzenle") : tt("Not ekle")}</button>
            <button onClick={() => { navigator.clipboard.writeText(sel.text).catch(() => {}); setSel(null); }}>{tt("Kopyala")}</button>
            <button onClick={() => { ask(sel.text); setSel(null); }}>✦ {tt("Asistana sor")}</button>
            {curHl && <button className="danger" onClick={() => { setAnn((a) => ({ ...a, hl: a.hl.filter((h) => h.id !== curHl.id) })); setSel(null); }}>{tt("Sil")}</button>}
          </div>
        </div>
      )}

      {noteFor && (
        <div className="bk-note-bg" onMouseDown={(e) => e.target === e.currentTarget && setNoteFor(null)}>
          <div className="bk-note" role="dialog" aria-label={tt("Not")}>
            <b>{noteFor.hlId ? tt("Vurguya not") : tt("Bu sayfaya not")}</b>
            {noteFor.hlId && <blockquote>{ann.hl.find((h) => h.id === noteFor.hlId)?.text}</blockquote>}
            <textarea autoFocus value={noteFor.text} onChange={(e) => setNoteFor({ ...noteFor, text: e.target.value })} placeholder={tt("Aklından geçenleri yaz…")}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) saveNote(); }} />
            <div className="bk-note-b"><span className="muted small">{tt("Ctrl+Enter ile kaydet")}</span><span className="grow" />
              <button className="chip" onClick={() => setNoteFor(null)}>{tt("Vazgeç")}</button><button className="primary sm" onClick={saveNote}>{tt("Kaydet")}</button></div>
          </div>
        </div>
      )}

      {(panel === "music" || leaving === "music") && <div className={"bk-panel bk-music-panel" + (panel !== "music" ? " -out" : "")}><MiniMusic /></div>}
      {(panel === "aa" || leaving === "aa") && (
        <div className={"bk-panel bk-aa" + (panel !== "aa" ? " -out" : "")}>
          {b.kind !== "cbz" && (
            <div className="bk-size2">
              <button aria-label={b.kind === "pdf" ? tt("Uzaklaştır") : tt("Yazıyı küçült")} onClick={() => setSet({ size: Math.max(70, set.size - 10) })}><span style={{ fontSize: 15 }}>A</span></button>
              <b>{pctText(set.size / 100)}</b>
              <button aria-label={b.kind === "pdf" ? tt("Yakınlaştır") : tt("Yazıyı büyüt")} onClick={() => setSet({ size: Math.min(200, set.size + 10) })}><span style={{ fontSize: 22 }}>A</span></button>
            </div>
          )}
          <div className="bk-themes2">
            {(Object.keys(THEMES) as Theme[]).map((k) => (
              <button key={k} className={"bk-th2" + (set.theme === k ? " on" : "")} style={{ background: THEMES[k].bg, color: THEMES[k].fg }} aria-pressed={set.theme === k} onClick={() => setSet({ theme: k })}>
                <span>Aa</span><small>{tt(THEMES[k].label)}</small></button>
            ))}
          </div>
          <label className="bk-slider"><span><Icon d="M12 3v2M12 19v2M5 12H3M21 12h-2M6.3 6.3 4.9 4.9M19.1 19.1l-1.4-1.4M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" size={15} /> {tt("Parlaklık")}</span>
            <input type="range" min={0} max={70} value={70 - Math.round(set.dim * 100)} onChange={(e) => setSet({ dim: (70 - Number(e.target.value)) / 100 })} /></label>
          <label className="bk-slider"><span><Icon d="M12 3a6 6 0 0 0 0 12 6 6 0 0 0 0-12zM8 21h8" size={15} /> {tt("Sıcak ışık")}</span>
            <input type="range" min={0} max={100} value={Math.round(set.warm * 100)} onChange={(e) => setSet({ warm: Number(e.target.value) / 100 })} /></label>
          {b.kind === "epub" && (
            <>
              <div className="bk-opt"><span>{tt("Yazı tipi")}</span>
                <div className="seg-row">
                  <button className={"seg sm" + (set.font === "serif" ? " on" : "")} style={{ fontFamily: "Literata, serif" }} onClick={() => setSet({ font: "serif" })}>Literata</button>
                  <button className={"seg sm" + (set.font === "sans" ? " on" : "")} onClick={() => setSet({ font: "sans" })}>Sans</button>
                </div></div>
              <div className="bk-opt"><span>{tt("Satır aralığı")}</span>
                <div className="seg-row">
                  {(["tight", "normal", "loose"] as Spacing[]).map((k) => <button key={k} className={"seg sm" + (set.spacing === k ? " on" : "")} onClick={() => setSet({ spacing: k })}>{k === "tight" ? tt("Sıkı") : k === "normal" ? tt("Rahat") : tt("Geniş")}</button>)}
                </div></div>
              <label className="bk-opt"><span>{tt("Kalın yazı")}</span><input type="checkbox" checked={set.bold} onChange={(e) => setSet({ bold: e.target.checked })} /></label>
              <label className="bk-opt"><span>{tt("Kaydırarak oku")}</span><input type="checkbox" checked={set.scroll} onChange={(e) => setSet({ scroll: e.target.checked })} /></label>
            </>
          )}
          {!set.scroll && <label className="bk-opt"><span>{tt("Geniş ekranda iki sayfa")}</span><input type="checkbox" checked={set.spread} onChange={(e) => setSet({ spread: e.target.checked })} /></label>}
        </div>
      )}
      {panel === "side" && (
        <div className="bk-panel bk-sidep">
          <div className="seg-row bk-side-tabs">
            {toc.length > 0 && <button className={"seg sm" + (side === "toc" ? " on" : "")} onClick={() => setSide("toc")}>{tt("İçindekiler")}</button>}
            <button className={"seg sm" + (side === "marks" ? " on" : "")} onClick={() => setSide("marks")}>{tt("Yer imleri")}{ann.marks.length ? ` ${ann.marks.length}` : ""}</button>
            <button className={"seg sm" + (side === "notes" ? " on" : "")} onClick={() => setSide("notes")}>{tt("Notlar")}{ann.hl.length + ann.notes.length ? ` ${ann.hl.length + ann.notes.length}` : ""}</button>
            {b.kind === "epub" && <button className={"seg sm" + (side === "find" ? " on" : "")} onClick={() => setSide("find")}>{tt("Ara")}</button>}
          </div>
          <div className="bk-side-body">
            {side === "toc" && (toc.length ? <TocList items={toc} onGo={(h) => { nav.current.go?.(h); setPanel(""); }} /> : <div className="muted small">{tt("Bu kitapta içindekiler yok.")}</div>)}
            {side === "marks" && (ann.marks.length ? ann.marks.map((m) => (
              <div key={m.id} className="bk-ann">
                <button className="bk-ann-main" onClick={() => { goTo(m); setPanel(""); }}>
                  <b>{m.chapter || m.label || pctText(m.pct)}</b><span className="muted small">{pctText(m.pct)} · {new Date(m.at).toLocaleDateString()}</span></button>
                <button className="bk-ann-x" aria-label={tt("Sil")} onClick={() => setAnn((a) => ({ ...a, marks: a.marks.filter((x) => x.id !== m.id) }))}><Icon d={I.x} size={13} /></button>
              </div>
            )) : <div className="muted small">{tt("Yer imi yok. Sağ üstteki işaretle bu sayfayı işaretleyebilirsin.")}</div>)}
            {side === "notes" && (ann.hl.length + ann.notes.length ? (
              <>
                {ann.notes.map((n) => (
                  <div key={n.id} className="bk-ann">
                    <button className="bk-ann-main" onClick={() => { goTo(n); setPanel(""); }}>
                      <span className="bk-ann-note">{n.text}</span><span className="muted small">{tt("Sayfa notu")} · {n.chapter || pctText(n.pct)}</span></button>
                    <button className="bk-ann-x" aria-label={tt("Düzenle")} onClick={() => { setPanel(""); setNoteFor({ id: n.id, text: n.text }); }}><Icon d="M4 20h4L19 9l-4-4L4 16z" size={13} /></button>
                  </div>
                ))}
                {[...ann.hl].sort((x, y) => y.at - x.at).map((h) => (
                  <div key={h.id} className="bk-ann">
                    <button className="bk-ann-main" onClick={() => { nav.current.go?.(h.cfi); setPanel(""); }}>
                      <span className={"bk-ann-q" + (h.color === "line" ? " line" : "")} style={h.color !== "line" ? { borderColor: HL[h.color] } : undefined}>{h.text}</span>
                      {h.note && <span className="bk-ann-note">{h.note}</span>}
                      <span className="muted small">{h.chapter ?? ""}</span></button>
                    <button className="bk-ann-x" aria-label={tt("Sil")} onClick={() => setAnn((a) => ({ ...a, hl: a.hl.filter((x) => x.id !== h.id) }))}><Icon d={I.x} size={13} /></button>
                  </div>
                ))}
              </>
            ) : <div className="muted small">{b.kind === "epub" ? tt("Henüz vurgu ya da not yok. Bir metni seçince renk, not ve asistan seçenekleri çıkar.") : tt("Henüz not yok. Üstteki kalemle bu sayfaya not ekleyebilirsin.")}</div>)}
            {side === "find" && <BookFind nav={nav} onGo={() => setPanel("")} />}
          </div>
        </div>
      )}
    </div>,
    document.querySelector(".root") ?? document.body,
  );
}

/** Reading aloud: play / pause, a paragraph back or on, speed, voice, sleep timer. */
const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
function ReadAloudBar() {
  const t = useTts();
  const [voices, setVoices] = useState<Voice[]>([]);
  useEffect(() => { loadVoices().then(setVoices); }, []);
  const [, tick] = useState(0);
  useEffect(() => { if (!t.sleepAt) return; const i = setInterval(() => tick((n) => n + 1), 20000); return () => clearInterval(i); }, [t.sleepAt]);
  // the best voices first; old copies and children's voices left out (see voiceChoices)
  const tag = (v: Voice) => (v.kinds?.includes("Copilot") ? " · " + tt("en yeni") : /Multilingual/.test(v.name) ? " · " + tt("çok dilli") : "");
  const vItem = (v: Voice) => ({ label: (v.name === t.voice ? ok : "") + `${v.label} · ${gender(v.gender)}${tag(v)} (${v.locale})`, act: () => setVoice(v.name) });
  const voiceMenu = (e: React.MouseEvent | typeof at.current, full = false) => {
    const ch = voiceChoices(voices, t.lang, full ? 999 : 10);
    openMenu(e as React.MouseEvent, [
    ...ch.own.map(vItem),
    ...(ch.more ? [{ label: tt("Bu dildeki diğer sesler ({0})…", ch.more), act: () => setTimeout(() => voiceMenu(at.current, true), 0) }] : []),
    ...(ch.multi.length ? ["sep" as const, ...ch.multi.map(vItem)] : []),
    "sep",
    { label: (t.voice === "win" ? ok : "") + tt("Windows sesi (internetsiz)"), act: () => setVoice("win") },
  ]);
  };
  const at = useRef({ clientX: 0, clientY: 0, preventDefault() {}, stopPropagation() {} });
  const vLabel = (n: string) => n === "win" ? tt("Windows sesi") : voices.find((v) => v.name === n)?.label ?? n.split("-").pop()?.replace(/Neural$|Multilingual/g, "") ?? n;
  const gender = (g: string) => (g === "Female" ? tt("kadın") : g === "Male" ? tt("erkek") : "");
  const left = t.sleepAt ? Math.max(1, Math.round((t.sleepAt - Date.now()) / 60000)) : 0;
  const ok = "✓  ";
  return (
    <div className="bk-tts" role="toolbar" aria-label={tt("Sesli okuma")}>
      {t.note && (
        <div className="bk-tts-note">
          {t.note === "privacy"
            ? <><span>{tt("Sesli okumada sayfanın metni, Edge'deki gibi Microsoft'un seslendirme hizmetine gönderilir.")}</span><button className="chip" onClick={ttsNoted}>{tt("Tamam")}</button></>
            : <><span>{t.note}</span><button className="bk-ann-x" aria-label={tt("Kapat")} onClick={ttsNoted}><Icon d={I.x} size={12} /></button></>}
        </div>
      )}
      <div className="bk-tts-row">
        <button className="mu-ib" aria-label={tt("Önceki paragraf")} title={tt("Önceki paragraf")} onClick={() => ttsSkip(-1)}><Icon d="M6 5v14M19 5 9 12l10 7z" size={16} /></button>
        <button className="bk-tts-pp" aria-label={t.loading ? tt("Yükleniyor…") : t.playing ? tt("Duraklat") : tt("Oku")} onClick={ttsToggle}>
          {t.loading && t.playing ? <span className="mu-spin sm" /> : <Icon d={t.playing ? I.pause : I.play} fill size={18} />}</button>
        <button className="mu-ib" aria-label={tt("Sonraki paragraf")} title={tt("Sonraki paragraf")} onClick={() => ttsSkip(1)}><Icon d="M18 5v14M5 5l10 7-10 7z" size={16} /></button>
        <span className="bk-tts-sep" />
        <button className="chip" title={tt("Okuma hızı")} onClick={(e) => openMenu(e, RATES.map((r) => ({ label: (r === t.rate ? ok : "") + r.toLocaleString() + "×", act: () => setRate(r) })))}>{t.rate.toLocaleString()}×</button>
        <button className="chip" aria-label={t.muted ? tt("Sesli okumanın sesini aç") : tt("Sesli okumayı sessize al")} aria-pressed={t.muted} onClick={() => setTtsMuted(!t.muted)}><Icon d={t.muted ? I.mute : I.vol} size={14}/></button>
        <input className="bk-tts-volume" type="range" min="0" max="100" step="10" value={t.volume} aria-label={tt("Sesli okuma ses seviyesi")} aria-valuetext={String(t.volume) + "%"} onChange={e => setTtsVolume(Number(e.target.value), false)}/>
        <button className="chip" title={tt("Ses")} onClick={(e) => { at.current = { ...at.current, clientX: e.clientX, clientY: e.clientY }; voiceMenu(e); }}>{t.win && t.voice !== "win" ? tt("Windows sesi") : vLabel(t.voice)}</button>
        <button className={"chip" + (t.sleep ? " on" : "")} title={tt("Uyku zamanlayıcısı")} onClick={(e) => openMenu(e, ([0, 15, 30, 60, "chapter"] as Sleep[]).map((x) => ({
          label: (t.sleep === x ? ok : "") + (x === 0 ? tt("Kapalı") : x === "chapter" ? tt("Bölüm sonunda dur") : tt("{0} dakika sonra dur", x)), act: () => setSleep(x) })))}>
          <Icon d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z" size={14} />{t.sleep === "chapter" ? " " + tt("bölüm sonu") : left ? " " + tt("{0} dk", left) : ""}</button>
        <button className="mu-ib" aria-label={tt("Sesli okumayı kapat")} title={tt("Sesli okumayı kapat")} onClick={() => { ttsStop(); ttsNoted(); }}><Icon d={I.x} size={15} /></button>
      </div>
    </div>
  );
}

/** Search inside an EPUB: every place the words appear, with a bit of the text around. */
function BookFind({ nav, onGo }: { nav: React.MutableRefObject<Nav>; onGo: () => void }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Found[] | null>(null);
  const [busy, setBusy] = useState(false);
  const run = useRef(0);
  const changeQuery = (next: string) => { run.current++; setQ(next); setRes(null); setBusy(false); };
  useEffect(() => () => { run.current++; }, []);
  const go = async () => {
    if (!q.trim() || !nav.current.find) return;
    const my = ++run.current;
    setBusy(true); setRes(null);
    const r = await nav.current.find(q.trim()).catch(() => [] as Found[]);
    if (my === run.current) { setRes(r); setBusy(false); }
  };
  return (
    <>
      <form className="bk-find" onSubmit={(e) => { e.preventDefault(); go(); }}>
        <input autoFocus value={q} onChange={(e) => changeQuery(e.target.value)} placeholder={tt("Kitapta ara")} aria-label={tt("Kitapta ara")} />
        <button className="primary sm" disabled={!q.trim() || busy}>{tt("Ara")}</button>
      </form>
      {busy && <div className="muted small pulse">{tt("Kitap taranıyor…")}</div>}
      {res && !res.length && <div className="muted small">{tt("Bulunamadı.")}</div>}
      {res && res.length > 0 && <div className="muted small">{tt("{0} yer", res.length)}</div>}
      {res?.map((r, i) => (
        <button key={i} className="bk-ann-main bk-find-r" onClick={() => { nav.current.go?.(r.cfi); onGo(); }}>
          <span className="bk-ann-note">…{r.excerpt.trim()}…</span>{r.chapter && <span className="muted small">{r.chapter}</span>}</button>
      ))}
    </>
  );
}

function TocList({ items, onGo, depth = 0 }: { items: Toc[]; onGo: (href: string) => void; depth?: number }) {
  return (
    <>
      {items.map((t, i) => (
        <div key={i}>
          <button className="bk-toc" style={{ paddingLeft: 12 + depth * 16 }} onClick={() => onGo(t.href)}>{t.label.trim()}</button>
          {t.subitems?.length ? <TocList items={t.subitems} onGo={onGo} depth={depth + 1} /> : null}
        </div>
      ))}
    </>
  );
}

type ViewProps = {
  b: Book; set: ReaderSet; nav: React.MutableRefObject<Nav>;
  onState: (s: Here) => void; onErr: (e: string) => void;
};

// EPUB: epub.js lays the book out in pages inside a sandboxed frame (no scripts from the book)
const FONT_CSS = [
  [literata400, 400, "normal"], [literata400x, 400, "normal"], [literata400i, 400, "italic"], [literata600, 600, "normal"], [literata600x, 600, "normal"],
].map(([u, w, s]) => `@font-face{font-family:"Literata";src:url("${new URL(u as string, location.href).href}") format("woff2");font-weight:${w};font-style:${s};font-display:swap}`).join("");

function EpubView({ b, set, nav, onState, onToc, onErr, hl, onSelect, onTap, onMove }: ViewProps & {
  onToc: (t: Toc[]) => void; hl: Hl[]; onSelect: (s: Sel) => void; onTap: () => void; onMove: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const r = useRef<any>(null);
  const bookRef = useRef<any>(null);
  // the latest settings and callbacks, for the async setup (a theme picked while the book is loading must stick)
  const setRef = useRef(set);
  setRef.current = set;
  const cb = useRef({ onSelect, onTap, onMove, hl });
  cb.current = { onSelect, onTap, onMove, hl };
  const painted = useRef<Hl[]>([]);
  const paint = (list: Hl[]) => {
    const rd = r.current;
    if (!rd) return;
    for (const h of painted.current) { try { rd.annotations.remove(h.cfi, h.color === "line" ? "underline" : "highlight"); } catch {} }
    painted.current = [];
    for (const h of list) {
      // a click on a highlight opens its menu (colour, note, delete)
      const open = (e: MouseEvent) => cb.current.onSelect({ cfi: h.cfi, text: h.text, id: h.id, x: e?.clientX ?? window.innerWidth / 2, y: e?.clientY ?? 200 });
      try {
        if (h.color === "line") rd.annotations.underline(h.cfi, { id: h.id }, open, "luna-ul", { stroke: setRef.current.theme === "night" || setRef.current.theme === "dusk" || setRef.current.theme === "forest" ? "#c4b5fd" : "#7c5cd6", "stroke-opacity": "0.9", "stroke-width": "2" });
        else rd.annotations.highlight(h.cfi, { id: h.id }, open, "luna-hl", { fill: HL[h.color], "fill-opacity": "0.38", "mix-blend-mode": "multiply" });
        painted.current.push(h);
      } catch {}
    }
  };
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { default: ePub } = await import("epubjs");
        const buf = await invoke<ArrayBuffer>("book_bytes", { path: b.path });
        if (!alive || !box.current) return;
        const book = ePub(buf as any);
        bookRef.current = book;
        const s0 = setRef.current;
        const rendition = book.renderTo(box.current, { width: "100%", height: "100%", flow: s0.scroll ? "scrolled-doc" : "paginated", spread: s0.spread && !s0.scroll ? "auto" : "none", allowScriptedContent: false } as any);
        r.current = rendition;
        rendition.hooks.content.register((contents: any) => {
          const st = contents.document.createElement("style");
          st.textContent = FONT_CSS + TTS_CSS;
          contents.document.head.appendChild(st);
        });
        applyTheme(rendition, setRef.current);
        rendition.on("keydown", (e: KeyboardEvent) => window.dispatchEvent(new KeyboardEvent("keydown", { key: e.key, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey, metaKey: e.metaKey })));
        // a click in the page closes open panels; moving the mouse shows the bars
        rendition.on("click", () => {
          // a click that ends a selection isn't a tap
          setTimeout(() => { const w = (rendition as any).getContents?.()[0]?.window; if (!w?.getSelection()?.toString()) cb.current.onTap(); }, 0);
        });
        rendition.on("mousemove", () => cb.current.onMove());
        // text selected: the colour / note / assistant menu next to it, once the mouse button is up
        // (epub.js reports a selection while it is still being dragged)
        let dragging = false;
        let pending: { cfi: string; contents: any } | null = null;
        const show = (cfi: string, contents: any) => {
          const s = contents.window.getSelection();
          const text = s?.toString().trim() ?? "";
          if (!text || !s.rangeCount) return;
          const rect = s.getRangeAt(0).getBoundingClientRect();
          const frame = (contents.document.defaultView.frameElement as HTMLElement).getBoundingClientRect();
          cb.current.onSelect({ cfi, text, x: frame.left + rect.left + rect.width / 2, y: frame.top + rect.top, bottom: frame.top + rect.bottom });
        };
        rendition.on("mousedown", () => { dragging = true; pending = null; });
        rendition.on("mouseup", () => {
          dragging = false;
          // the selection event comes a moment after the button is released
          setTimeout(() => { if (pending) { show(pending.cfi, pending.contents); pending = null; } }, 260);
        });
        rendition.on("selected", (cfi: string, contents: any) => { if (dragging) pending = { cfi, contents }; else show(cfi, contents); });
        const nav2 = await book.loaded.navigation.catch(() => null);
        if (!alive) return;
        if (nav2?.toc) onToc(nav2.toc as Toc[]);
        const saved = getPos(b.path);
        await rendition.display(typeof saved?.loc === "string" ? saved.loc : undefined);
        if (!alive) return;
        paint(cb.current.hl);
        let located = false;
        const flat: Toc[] = [];
        const walk = (l: Toc[]) => l.forEach((t) => { flat.push(t); if (t.subitems) walk(t.subitems); });
        walk((nav2?.toc ?? []) as Toc[]);
        const chapterOf = (href: string) => flat.find((t) => href && t.href.split("#")[0].endsWith(href.split("#")[0]))?.label.trim();
        rendition.on("relocated", (loc: any) => {
          const cfi = loc.start.cfi;
          const pct = located ? book.locations.percentageFromCfi(cfi) : loc.start.percentage ?? saved?.pct ?? 0;
          const chapter = chapterOf(loc.start.href);
          const d = loc.start.displayed;
          const page = d ? tt("Bölümde {0}/{1}", d.page, d.total) : "";
          onState({ pct, label: page, chapter, loc: cfi, left: d && !setRef.current.scroll ? Math.max(0, d.total - d.page) : undefined });
          setPos(b.path, { loc: cfi, pct, at: Date.now(), chapter });
        });
        nav.current = {
          next: () => rendition.next(), prev: () => rendition.prev(), go: (h) => rendition.display(h),
          seek: (p) => {
            if (located) { rendition.display(book.locations.cfiFromPercentage(p)); return; }
            // page positions not ready (or failed): jump to the chapter at that point
            const sp = (book as any).spine;
            const item = sp?.length ? sp.get(Math.min(sp.length - 1, Math.floor(p * sp.length))) : null;
            if (item?.href) rendition.display(item.href);
          },
          paint,
          find: async (q) => {
            const out: Found[] = [];
            for (const item of (book as any).spine.spineItems as any[]) {
              if (out.length >= 200) break;
              try {
                await item.load(book.load.bind(book));
                for (const f of item.find(q) as { cfi: string; excerpt: string }[]) out.push({ ...f, chapter: chapterOf(item.href) });
              } catch {} finally { try { item.unload(); } catch {} }
            }
            return out;
          },
        };
        // reading aloud: the voice finds the text here and turns the pages
        attachTts({
          docs: () => (((rendition as any).getContents?.() ?? []) as any[]).map((c) => ({
            doc: c.document as Document, index: c.sectionIndex as number,
            range: (cfi: string) => c.range(cfi) as Range | null, cfi: (rg: Range) => c.cfiFromRange(rg) as string,
          })),
          pageStart: () => (rendition.currentLocation() as any)?.start?.cfi,
          show: (cfi) => rendition.display(cfi),
          visible: (rg) => {
            const fe = rg.startContainer.ownerDocument?.defaultView?.frameElement;
            if (!fe || !box.current) return true;
            const rc = rg.getClientRects()[0] ?? rg.getBoundingClientRect();
            const f = fe.getBoundingClientRect(), bx = box.current.getBoundingClientRect();
            const x = f.left + rc.left + 1, y = f.top + rc.top;
            return x >= bx.left && x < bx.right && y >= bx.top && y + rc.height <= bx.bottom - (setRef.current.scroll ? 60 : 0);
          },
          scrolled: () => setRef.current.scroll,
          nextSection: async (i) => {
            const it = (book as any).spine.get(i + 1);
            if (!it) return false;
            await rendition.display(it.href);
            return true;
          },
        }, { path: b.path, title: b.title, lang: b.lang });
        // page positions across the whole book, for the progress bar (in the background)
        book.locations.generate(1200).then(() => { if (alive) { located = true; const c = rendition.currentLocation() as any; if (c?.start) rendition.emit("relocated", c); } })
          // if that fails the book still reads; the bar just keeps each chapter's own position
          .catch((e: unknown) => console.warn("epub locations", e));
      } catch (e) {
        onErr(tt("Kitap açılamadı: ") + String(e));
      }
    })();
    return () => { alive = false; attachTts(null); try { r.current?.destroy(); bookRef.current?.destroy(); } catch {} };
  }, [b.path]);
  useEffect(() => { try { r.current?.spread(set.spread && !set.scroll ? "auto" : "none"); } catch {} }, [set.spread, set.scroll]);
  // reading by scrolling or by pages: the same place is shown again after the switch
  useEffect(() => {
    const rd = r.current;
    if (!rd) return;
    try {
      const at = (rd.currentLocation() as any)?.start?.cfi;
      rd.flow(set.scroll ? "scrolled-doc" : "paginated");
      if (at) rd.display(at).then(() => paint(cb.current.hl));
    } catch {}
  }, [set.scroll]);
  useEffect(() => { if (r.current) { applyTheme(r.current, set); paint(cb.current.hl); } }, [set.theme, set.size, set.font, set.spacing, set.bold]);
  return <div className={"bk-epub" + (set.scroll ? " scroll" : "")} ref={box} />;
}
function applyTheme(rendition: any, set: ReaderSet) {
  const t = THEMES[set.theme];
  rendition.themes.default({
    body: { background: `${t.bg} !important`, color: `${t.fg} !important`, "font-family": set.font === "serif" ? "Literata, Georgia, serif !important" : "'IBM Plex Sans', system-ui, sans-serif !important",
      "line-height": `${LINE[set.spacing]} !important`, "font-weight": set.bold ? "600 !important" : "inherit" },
    "p, li, blockquote": { "font-family": "inherit !important", "line-height": "inherit !important" },
    a: { color: `${t.fg} !important` },
    img: { "max-width": "100% !important" },
    "::selection": { background: "rgba(167,139,250,.35)" },
  });
  rendition.themes.fontSize(set.size + "%");
}

// PDF: pdf.js draws each page; themes tint the page
function PdfView({ b, set, nav, onState, onErr }: ViewProps) {
  const [doc, setDoc] = useState<any>(null);
  const [page, setPage] = useState(() => Number(getPos(b.path)?.loc ?? 1) || 1);
  const box = useRef<HTMLDivElement>(null);
  const canvases = [useRef<HTMLCanvasElement>(null), useRef<HTMLCanvasElement>(null)];
  const [size, setSize] = useState({ w: 0, h: 0 });
  const pdfTask = useRef<any>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
        const buf = await invoke<ArrayBuffer>("book_bytes", { path: b.path });
        // closed while the bytes were coming: don't start a task nobody would destroy
        if (!alive) return;
        const task = pdfjs.getDocument({ data: new Uint8Array(buf) });
        pdfTask.current = task;
        const d = await task.promise;
        if (!alive) return;
        // a saved page past the end (the file was replaced by a shorter one) opens the last page
        setPage((p) => Math.max(1, Math.min(d.numPages, p)));
        setDoc(d);
      } catch (e) { onErr(tt("Kitap açılamadı: ") + String(e)); }
    })();
    return () => {
      alive = false;
      try { pdfTask.current?.destroy(); } catch {}
      pdfTask.current = null;
    };
  }, [b.path]);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const n = doc?.numPages ?? 0;
  const two = set.spread && size.w > size.h * 1.25 && n > 1;
  const step = two ? 2 : 1;
  useEffect(() => {
    if (!doc || !size.w) return;
    let alive = true;
    const tasks: any[] = [];
    (async () => {
      for (let i = 0; i < (two ? 2 : 1); i++) {
        const c = canvases[i].current;
        const num = page + i;
        if (!c) continue;
        if (num > n) { c.width = 0; continue; }
        // a damaged page says so instead of leaving the old drawing
        const p = await doc.getPage(num).catch((e: unknown) => { if (alive) onErr(tt("Sayfa {0} açılamadı: ", num) + String(e)); return null; });
        if (!alive || !p) return;
        const v1 = p.getViewport({ scale: 1 });
        const fit = Math.min((size.h - 16) / v1.height, (two ? size.w / 2 - 12 : size.w - 16) / v1.width) * (set.size / 100);
        const dpr = window.devicePixelRatio || 1;
        const vp = p.getViewport({ scale: fit * dpr });
        c.width = vp.width; c.height = vp.height;
        c.style.width = vp.width / dpr + "px"; c.style.height = vp.height / dpr + "px";
        const t = p.render({ canvasContext: c.getContext("2d")!, viewport: vp });
        tasks.push(t);
        await t.promise.catch(() => {});
      }
    })();
    const pct = n > 1 ? (page - 1) / (n - 1) : 1;
    onState({ pct: Math.min(1, two && page + 1 >= n ? 1 : pct), label: tt("Sayfa {0} / {1}", two && page < n ? `${page}–${page + 1}` : page, n) });
    setPos(b.path, { loc: page, pct: two && page + 1 >= n ? 1 : pct, at: Date.now() });
    return () => { alive = false; tasks.forEach((t) => t.cancel?.()); };
  }, [doc, page, size.w, size.h, set.size, two]);
  nav.current = {
    next: () => setPage((p) => Math.min(Math.max(1, n - step + 1), p + step)),
    prev: () => setPage((p) => Math.max(1, p - step)),
    seek: (f) => setPage(Math.max(1, Math.min(n, Math.round(f * (n - 1)) + 1))),
  };
  return (
    <div className="bk-pdf" ref={box}>
      {!doc && <div className="muted pulse">{tt("Açılıyor…")}</div>}
      <canvas ref={canvases[0]} />
      {two && <canvas ref={canvases[1]} />}
    </div>
  );
}

// Comics: one or two pages at a time, fitted to the window
function CbzView({ b, set, nav, onState, onErr }: ViewProps) {
  const [pages, setPages] = useState<string[] | null>(null);
  const [page, setPage] = useState(() => Number(getPos(b.path)?.loc ?? 0) || 0);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const urlsRef = useRef<Record<string, string>>({});
  const [bad, setBad] = useState<Record<string, true>>({});
  const gone = useRef(false);
  const box = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);
  useEffect(() => {
    invoke<string[]>("cbz_pages", { path: b.path }).then(setPages).catch((e) => onErr(tt("Kitap açılamadı: ") + String(e)));
  }, [b.path]);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWide(el.clientWidth > el.clientHeight * 1.25));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const n = pages?.length ?? 0;
  useEffect(() => { if (pages?.length) setPage((p) => Math.max(0, Math.min(pages.length - 1, p))); }, [pages]);
  const two = set.spread && wide && page > 0; // the cover stands alone
  const step = two ? 2 : 1;
  useEffect(() => {
    if (!pages) return;
    // Keep only the pages around the current spread. Without this, every page ever visited
    // stays as a blob URL in memory for the whole reading session.
    const keep = new Set(pages.slice(Math.max(0, page - 1), page + 5));
    let pruned = false;
    const next = { ...urlsRef.current };
    for (const [nm, u] of Object.entries(next)) {
      if (keep.has(nm)) continue;
      URL.revokeObjectURL(u);
      delete next[nm];
      pruned = true;
    }
    if (pruned) { urlsRef.current = next; setUrls(next); }
    const want = [page, page + 1, page + 2, page + 3].filter((i) => i < n).map((i) => pages[i]).filter((nm) => !urls[nm]);
    want.forEach((nm) => {
      if (urlsRef.current[nm]) return;
      invoke<ArrayBuffer>("cbz_page", { path: b.path, name: nm })
        .then((buf) => {
          // the reader was closed meanwhile: a new blob URL would never be freed
          if (gone.current || urlsRef.current[nm]) return;
          const u = URL.createObjectURL(new Blob([buf]));
          urlsRef.current[nm] = u;
          setUrls((x) => ({ ...x, [nm]: u }));
        }).catch(() => { if (!gone.current) setBad((x) => ({ ...x, [nm]: true })); });
    });
    // the last spread shows the last page too, so it counts as the end
    const last = two ? page + 1 : page;
    const pct = n > 1 ? Math.min(1, last / (n - 1)) : 1;
    onState({ pct, label: tt("Sayfa {0} / {1}", page + 1, n) });
    setPos(b.path, { loc: page, pct, at: Date.now() });
  }, [pages, page, two]);
  useEffect(() => {
    // (set again on mount: React's dev check mounts twice, and a "gone" left over dropped every page)
    gone.current = false;
    return () => {
      gone.current = true;
      Object.values(urlsRef.current).forEach((u) => URL.revokeObjectURL(u));
      urlsRef.current = {};
    };
  }, []);
  nav.current = {
    next: () => setPage((p) => (n <= 0 ? 0 : Math.max(0, Math.min(n - 1, p + (p === 0 ? 1 : step))))),
    prev: () => setPage((p) => Math.max(0, p - step)),
    seek: (f) => setPage(() => (n <= 0 ? 0 : Math.max(0, Math.min(n - 1, Math.round(f * (n - 1)))))),
  };
  const shown = pages ? [pages[page], two ? pages[page + 1] : undefined].filter(Boolean) as string[] : [];
  return (
    <div className="bk-cbz" ref={box}>
      {!pages && <div className="muted pulse">{tt("Açılıyor…")}</div>}
      {shown.map((nm) => urls[nm] ? <img key={nm} src={urls[nm]} alt="" style={{ maxWidth: shown.length > 1 ? "50%" : "100%" }} />
        : bad[nm] ? <div key={nm} className="muted">{tt("Bu sayfa okunamadı")}</div>
        : <div key={nm} className="muted pulse">…</div>)}
    </div>
  );
}
