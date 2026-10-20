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
import { askAssistant, TrText } from "./Taste";
import { playQueue, QItem, useMusic } from "./Music";
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
  const books = f.length ? await invoke<Book[]>("books_scan", { folders: f }).catch(() => []) : [];
  libCache = { sig: f.join("|"), books };
  return books;
}

// opening a book from anywhere (the assistant): the books page opens it when it's on screen
let openHandler: ((b: Book) => void) | null = null;
let pendingOpen: Book | null = null;
export function requestOpenBook(b: Book) {
  store.set("bookRecent", JSON.stringify([b.path, ...store.json<string[]>("bookRecent", []).filter((p) => p !== b.path)].slice(0, 20)));
  if (openHandler) openHandler(b); else pendingOpen = b;
}
/** A book from a catalog goes into the first book folder (or Documents\Luna Books), then opens. */
/** The file's name in a link, for when nothing better is known. */
const linkName = (u: string) => { try { return decodeURIComponent(new URL(u).pathname.split("/").pop() ?? "").replace(/\.[^.]+$/, "").replace(/[._]+/g, " ").trim(); } catch { return ""; } };
export async function fetchAndOpenBook(url: string, title: string, author: string, kind?: string): Promise<Book> {
  const folders = loadBookFolders();
  const dir = folders[0] ?? (await invoke<string | null>("books_default_dir")) ?? "";
  const d = await invoke<{ path: string; kind: Book["kind"]; title: string; author: string }>("book_download", { url, dir, title, author, kind: kind || null, fallback: linkName(url) || tt("Kitap") });
  if (!folders.includes(dir)) store.set("bookFolders", JSON.stringify([...folders, dir]));
  libChanged();
  const b: Book = { path: d.path, kind: d.kind, title: d.title, author: d.author };
  requestOpenBook(b);
  return b;
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
  const query = "collection:librivoxaudio" + (words ? ` AND (title:(${words}) OR creator:(${words}))` : "");
  const p = new URLSearchParams({ q: query, output: "json", rows: "36", "sort[]": "downloads desc" });
  ["identifier", "title", "creator", "downloads"].forEach((f) => p.append("fl[]", f));
  const r = await getJson("https://archive.org/advancedsearch.php?" + p);
  return r?.response?.docs ?? [];
}
const abCover = (id: string) => `https://archive.org/services/img/${encodeURIComponent(id)}`;
export const abAuthor = (a: Ab) => (Array.isArray(a.creator) ? a.creator[0] : a.creator) ?? "";
export const abTitle = (t: string) => t.replace(/\s*\(version \d+\)\s*/i, " ").replace(/\s+/g, " ").trim();
export async function abChapters(a: Ab): Promise<QItem[]> {
  const meta = await getJson(`https://archive.org/metadata/${encodeURIComponent(a.identifier)}`);
  const files: any[] = meta?.files ?? [];
  // one file per chapter; LibriVox uploads each in two qualities, the smaller one is plenty for speech
  const mp3s = files.filter((f) => /\.mp3$/i.test(f.name));
  const small = mp3s.filter((f) => /_64kb\.mp3$/i.test(f.name));
  const list = (small.length ? small : mp3s).sort((x, y) => String(x.name).localeCompare(String(y.name), undefined, { numeric: true }));
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
  const [author, title] = stem.includes(" - ") ? stem.split(" - ", 2) : ["", stem];
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
function BookCover({ src, title, author, w = 132 }: { src?: string | null; title: string; author?: string; w?: number | string }) {
  const [bad, setBad] = useState(false);
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
];

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

// ---------- pages ----------
export type BooksView = "home" | "library" | "discover" | "audio";
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
  return (
    <div className="page books">
      {view === "home" && <BooksHome lib={lib} onOpen={openBook} onDetail={setDetail} onAddFolder={addFolder} onFetch={fetchBook} go={setView} />}
      {view === "library" && <BookLibrary lib={lib} query={query} onOpen={openBook} onDetail={setDetail} onAddFolder={addFolder} />}
      {detail && <BookDetail b={detail} onClose={() => setDetail(null)} onRead={() => { setDetail(null); openBook(detail); }} />}
      {view === "discover" && <Catalogs query={query} onFetch={fetchBook} />}
      {view === "audio" && <Audiobooks query={query} />}
      {reading && <Reader key={reading.path} b={reading} onClose={() => setReading(null)} />}
    </div>
  );
}

type Fetch = (url: string, t: string, a: string, kind?: string) => Promise<void>;
function BooksHome({ lib, onOpen, onDetail, onAddFolder, onFetch, go }: {
  lib: Lib; onOpen: (b: Book) => void; onDetail: (b: Book) => void; onAddFolder: () => void; onFetch: Fetch; go: (v: BooksView) => void;
}) {
  const recent = store.json<string[]>("bookRecent", []).map((p) => lib.books?.find((b) => b.path === p)).filter(Boolean) as Book[];
  const [, setAbTick] = useState(0);
  useEffect(() => { const f = () => setAbTick((n) => n + 1); window.addEventListener("luna-ab", f); return () => window.removeEventListener("luna-ab", f); }, []);
  const abRecent = loadAbRecent().slice(0, 8);
  const cur = recent.find((b) => (getPos(b.path)?.pct ?? 0) < 0.99);
  const pos = cur ? getPos(cur.path) : null;
  const rest = (lib.books ?? []).filter((b) => b !== cur);
  return (
    <>
      {cur ? (
        <section className="bk-hero" onClick={() => onDetail(cur)}>
          <button className="bk-hero-cov" onClick={() => onDetail(cur)} title={tt("Detaylar")}><BookCover src={cur.cover} title={cur.title} author={cur.author} w={124} /></button>
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

function BookLibrary({ lib, query, onOpen, onDetail, onAddFolder }: { lib: Lib; query: string; onOpen: (b: Book) => void; onDetail: (b: Book) => void; onAddFolder: () => void }) {
  const [sort, setSort] = useState<"recent" | "title" | "author">("recent");
  const q = query.trim().toLocaleLowerCase();
  const recent = store.json<string[]>("bookRecent", []);
  const list = useMemo(() => (lib.books ?? [])
    .filter((b) => !q || b.title.toLocaleLowerCase().includes(q) || b.author.toLocaleLowerCase().includes(q))
    .sort((x, y) => sort === "title" ? x.title.localeCompare(y.title) : sort === "author" ? x.author.localeCompare(y.author) || x.title.localeCompare(y.title)
      : (recent.indexOf(x.path) + 1 || 999) - (recent.indexOf(y.path) + 1 || 999)), [lib.books, q, sort]);
  return (
    <>
      <div className="row-head mu-lib-head">
        <div className="seg-row">
          {([["recent", tt("Son okunan")], ["title", tt("Ada göre")], ["author", tt("Yazara göre")]] as const).map(([k, l]) => (
            <button key={k} className={"seg sm" + (sort === k ? " on" : "")} onClick={() => setSort(k)}>{l}</button>
          ))}
        </div>
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
      {lib.books && !list.length && <div className="muted empty-note">{q ? tt("Kitaplığında bulunamadı.") : tt("Henüz kitap yok. Bir klasör ekle ya da Keşfet'ten ücretsiz kitap indir.")}</div>}
      <div className="bk-grid">{list.map((b) => <BookCard key={b.path} b={b} onOpen={() => onDetail(b)} onRead={() => onOpen(b)} />)}</div>
    </>
  );
}

/** A book in a catalog: a click downloads it into the library and opens it. */
function EntryCard({ e, onFetch }: { e: OEntry; onFetch: Fetch }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // the best open format Luna reads: EPUB, then PDF, then comics
  const pick = [...e.acq].sort((x, y) => "epub pdf cbz".indexOf(kindOf(x.type)) - "epub pdf cbz".indexOf(kindOf(y.type)))[0];
  const go = async () => {
    if (!pick) return;
    if (!pick.open) { openUrl(pick.href).catch(() => {}); return; } // to buy / borrow: on the source's site
    setBusy(true); setErr("");
    try { await onFetch(pick.href, e.title, e.author, kindOf(pick.type)); } catch (x) { setErr(String(x)); } finally { setBusy(false); }
  };
  return (
    <button className="bk-card" onClick={go} disabled={busy || !pick} title={err || e.summary?.slice(0, 300) || tt("İndir ve oku")}
      onContextMenu={(ev) => openMenu(ev, [...askEntries(e), ...(pick ? ["sep" as const, { label: pick.open ? tt("İndir ve oku") : tt("Sitesinde aç"), act: go }] : [])])}>
      <BookCover src={e.cover} title={e.title} author={e.author} w="100%" />
      <b className="bk-t">{e.title}</b>
      <span className="muted small ellipsis">{e.author}</span>
      <span className={"bk-prog small" + (err ? " err" : " muted")}>
        {busy ? tt("İndiriliyor…") : err ? tt("İndirilemedi") : pick && !pick.open ? tt("Kaynakta aç ↗") : tt("İndir ve oku")}
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
  const cur = sources.find((x) => x.url === src);
  useEffect(() => { setStack([]); }, [src]);
  useEffect(() => {
    let alive = true;
    setList(null); setErr(false); setFeed(null);
    (async () => {
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
    setMore(true);
    try {
      const f = await fetchFeed(feed.next);
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
        {(gut || feed?.search || !feed) && (
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
        {!stack.length && <h2>{deb ? tt("“{0}” için sonuçlar", deb) : gut ? tt("En çok okunanlar") : cur?.name}</h2>}
        {books && !books.length && !shelves.length && !err && <div className="muted">{tt("Kitap bulunamadı.")}</div>}
        <Shelf list={books} err={err} onRetry={() => setTick((n) => n + 1)} onFetch={onFetch} />
        {feed?.next && books && <button className="chip bk-more" disabled={more} onClick={loadMore}>{more ? tt("Yükleniyor…") : tt("Daha fazla")}</button>}
        <div className="muted small mu-credit">{gut ? tt("Kaynak: Project Gutenberg (telif süresi dolmuş, ücretsiz kitaplar)") : tt("Kaynak: {0} (senin eklediğin katalog)", cur?.name ?? "")}</div>
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

function BookDetail({ b, onClose, onRead }: { b: Book; onClose: () => void; onRead: () => void }) {
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
          <div className="bk-d-cov"><BookCover src={cover} title={b.title} author={b.author} w={170} /></div>
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

// ---------- the reader ----------
type Theme = "day" | "sepia" | "gray" | "night";
type ReaderSet = { theme: Theme; size: number; font: "serif" | "sans"; spread: boolean };
const THEMES: Record<Theme, { bg: string; fg: string; label: string }> = {
  day: { bg: "#faf8f3", fg: "#1f1f1f", label: "Gündüz" },
  sepia: { bg: "#f1e4c8", fg: "#3b2f1c", label: "Sepya" },
  gray: { bg: "#3a3a40", fg: "#ececee", label: "Gri" },
  night: { bg: "#121115", fg: "#cfcbd6", label: "Gece" },
};
const loadSet = (): ReaderSet => ({ theme: "sepia", size: 100, font: "serif", spread: true, ...store.json<Partial<ReaderSet>>("readerSet", {}) });
type Toc = { label: string; href: string; subitems?: Toc[] };

function Reader({ b, onClose }: { b: Book; onClose: () => void }) {
  const [set, setSetState] = useState<ReaderSet>(loadSet);
  const setSet = (p: Partial<ReaderSet>) => setSetState((s) => { const n = { ...s, ...p }; store.set("readerSet", JSON.stringify(n)); return n; });
  const [panel, setPanel] = useState<"" | "aa" | "toc">("");
  const [state, setState] = useState<{ pct: number; label: string; chapter?: string }>({ pct: getPos(b.path)?.pct ?? 0, label: "" });
  const [err, setErr] = useState("");
  const [toc, setToc] = useState<Toc[]>([]);
  const nav = useRef<{ next: () => void; prev: () => void; go?: (href: string) => void; seek?: (pct: number) => void }>({ next: () => {}, prev: () => {} });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      // A focused button keeps Space for its own activation, but arrow/page keys should still
      // turn pages (after closing the Aa / contents panel, focus stays on its button).
      if (el.closest("input, textarea, select") || el.isContentEditable) return;
      if (e.key === " " && el.closest("button")) return;
      if (e.key === "Escape") { e.stopPropagation(); panel ? setPanel("") : onClose(); }
      else if (["ArrowRight", "PageDown", " "].includes(e.key)) { e.preventDefault(); e.stopPropagation(); nav.current.next(); }
      else if (["ArrowLeft", "PageUp"].includes(e.key)) { e.preventDefault(); e.stopPropagation(); nav.current.prev(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [panel]);
  const th = THEMES[set.theme];
  return createPortal(
    <div className={"bk-reader t-" + set.theme} style={{ ["--pg-bg" as string]: th.bg, ["--pg-fg" as string]: th.fg }}>
      <div className="bk-r-top">
        <button className="round" aria-label={tt("Kitaplığa dön")} onClick={onClose}><Icon d={I.left} size={20} /></button>
        <div className="bk-r-title"><b className="ellipsis">{b.title}</b><span className="muted small ellipsis">{[b.author, state.chapter].filter(Boolean).join(" · ")}</span></div>
        <span className="grow" />
        {toc.length > 0 && <button className={"rb" + (panel === "toc" ? " on" : "")} onClick={() => setPanel(panel === "toc" ? "" : "toc")}>
          <Icon d="M4 6h16M4 12h16M4 18h10" size={16} />  {tt("İçindekiler")}</button>}
        <button className={"rb" + (panel === "aa" ? " on" : "")} onClick={() => setPanel(panel === "aa" ? "" : "aa")}>Aa</button>
      </div>
      <div className="bk-r-page">
        {err ? <div className="bk-r-err">{err}</div>
          : b.kind === "epub" ? <EpubView b={b} set={set} nav={nav} onState={setState} onToc={setToc} onErr={setErr} />
          : b.kind === "pdf" ? <PdfView b={b} set={set} nav={nav} onState={setState} onErr={setErr} />
          : <CbzView b={b} set={set} nav={nav} onState={setState} onErr={setErr} />}
        <button className="bk-r-side l" aria-label={tt("Önceki sayfa")} onClick={() => nav.current.prev()}><Icon d={I.left} size={26} /></button>
        <button className="bk-r-side r" aria-label={tt("Sonraki sayfa")} onClick={() => nav.current.next()}><Icon d={I.right} size={26} /></button>
      </div>
      <div className="bk-r-foot">
        <span>{state.label}</span>
        <input type="range" min={0} max={1000} value={Math.round(state.pct * 1000)} aria-label={tt("Kitapta ilerle")}
          onChange={(e) => nav.current.seek?.(Number(e.target.value) / 1000)} disabled={!nav.current.seek} />
        <span>{pctText(state.pct)}</span>
      </div>
      {panel === "aa" && (
        <div className="bk-panel">
          <span className="bk-pl">{tt("Tema")}</span>
          <div className="bk-themes">
            {(Object.keys(THEMES) as Theme[]).map((k) => (
              <button key={k} className={"bk-th" + (set.theme === k ? " on" : "")} style={{ background: THEMES[k].bg, color: THEMES[k].fg }}
                aria-label={tt(THEMES[k].label)} title={tt(THEMES[k].label)} onClick={() => setSet({ theme: k })}>Aa</button>
            ))}
          </div>
          {b.kind !== "cbz" && (
            <>
              <span className="bk-pl">{b.kind === "pdf" ? tt("Yakınlaştırma") : tt("Yazı boyutu")}</span>
              <div className="bk-size">
                <button className="chip" onClick={() => setSet({ size: Math.max(70, set.size - 10) })}>A−</button>
                <b>{pctText(set.size / 100)}</b>
                <button className="chip" onClick={() => setSet({ size: Math.min(200, set.size + 10) })}>A+</button>
              </div>
            </>
          )}
          {b.kind === "epub" && (
            <>
              <span className="bk-pl">{tt("Yazı tipi")}</span>
              <div className="seg-row">
                <button className={"seg sm" + (set.font === "serif" ? " on" : "")} style={{ fontFamily: "Literata, serif" }} onClick={() => setSet({ font: "serif" })}>Literata</button>
                <button className={"seg sm" + (set.font === "sans" ? " on" : "")} onClick={() => setSet({ font: "sans" })}>Sans</button>
              </div>
            </>
          )}
          <label className="look-check"><input type="checkbox" checked={set.spread} onChange={(e) => setSet({ spread: e.target.checked })} />{tt("Geniş ekranda iki sayfa")}</label>
        </div>
      )}
      {panel === "toc" && (
        <div className="bk-panel toc">
          <TocList items={toc} onGo={(h) => { nav.current.go?.(h); setPanel(""); }} />
        </div>
      )}
    </div>,
    document.body,
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
  b: Book; set: ReaderSet; nav: React.MutableRefObject<{ next: () => void; prev: () => void; go?: (href: string) => void; seek?: (pct: number) => void }>;
  onState: (s: { pct: number; label: string; chapter?: string }) => void; onErr: (e: string) => void;
};

// EPUB: epub.js lays the book out in pages inside a sandboxed frame (no scripts from the book)
const FONT_CSS = [
  [literata400, 400, "normal"], [literata400x, 400, "normal"], [literata400i, 400, "italic"], [literata600, 600, "normal"], [literata600x, 600, "normal"],
].map(([u, w, s]) => `@font-face{font-family:"Literata";src:url("${new URL(u as string, location.href).href}") format("woff2");font-weight:${w};font-style:${s};font-display:swap}`).join("");

function EpubView({ b, set, nav, onState, onToc, onErr }: ViewProps & { onToc: (t: Toc[]) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const r = useRef<any>(null);
  const bookRef = useRef<any>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { default: ePub } = await import("epubjs");
        const buf = await invoke<ArrayBuffer>("book_bytes", { path: b.path });
        if (!alive || !box.current) return;
        const book = ePub(buf as any);
        bookRef.current = book;
        const rendition = book.renderTo(box.current, { width: "100%", height: "100%", flow: "paginated", spread: set.spread ? "auto" : "none", allowScriptedContent: false } as any);
        r.current = rendition;
        rendition.hooks.content.register((contents: any) => {
          const st = contents.document.createElement("style");
          st.textContent = FONT_CSS;
          contents.document.head.appendChild(st);
        });
        applyTheme(rendition, set);
        rendition.on("keydown", (e: KeyboardEvent) => window.dispatchEvent(new KeyboardEvent("keydown", { key: e.key })));
        const nav2 = await book.loaded.navigation.catch(() => null);
        if (!alive) return;
        if (nav2?.toc) onToc(nav2.toc as Toc[]);
        const saved = getPos(b.path);
        await rendition.display(typeof saved?.loc === "string" ? saved.loc : undefined);
        if (!alive) return;
        let located = false;
        const chapterOf = (href: string) => {
          const flat: Toc[] = [];
          const walk = (l: Toc[]) => l.forEach((t) => { flat.push(t); if (t.subitems) walk(t.subitems); });
          walk((nav2?.toc ?? []) as Toc[]);
          return flat.find((t) => href && t.href.split("#")[0].endsWith(href.split("#")[0]))?.label.trim();
        };
        rendition.on("relocated", (loc: any) => {
          const cfi = loc.start.cfi;
          const pct = located ? book.locations.percentageFromCfi(cfi) : loc.start.percentage ?? saved?.pct ?? 0;
          const chapter = chapterOf(loc.start.href);
          const page = loc.start.displayed ? tt("Bölümde {0}/{1}", loc.start.displayed.page, loc.start.displayed.total) : "";
          onState({ pct, label: page, chapter });
          setPos(b.path, { loc: cfi, pct, at: Date.now(), chapter });
        });
        nav.current = {
          next: () => rendition.next(), prev: () => rendition.prev(), go: (h) => rendition.display(h),
          seek: (p) => { if (located) rendition.display(book.locations.cfiFromPercentage(p)); },
        };
        // page positions across the whole book, for the progress bar (in the background)
        book.locations.generate(1200).then(() => { if (alive) { located = true; const c = rendition.currentLocation() as any; if (c?.start) rendition.emit("relocated", c); } });
      } catch (e) {
        onErr(tt("Kitap açılamadı: ") + String(e));
      }
    })();
    return () => { alive = false; try { r.current?.destroy(); bookRef.current?.destroy(); } catch {} };
  }, [b.path]);
  useEffect(() => { try { r.current?.spread(set.spread ? "auto" : "none"); } catch {} }, [set.spread]);
  useEffect(() => { if (r.current) applyTheme(r.current, set); }, [set.theme, set.size, set.font]);
  return <div className="bk-epub" ref={box} />;
}
function applyTheme(rendition: any, set: ReaderSet) {
  const t = THEMES[set.theme];
  rendition.themes.default({
    body: { background: `${t.bg} !important`, color: `${t.fg} !important`, "font-family": set.font === "serif" ? "Literata, Georgia, serif !important" : "'IBM Plex Sans', system-ui, sans-serif !important", "line-height": "1.7 !important" },
    "p, li, blockquote": { "font-family": "inherit !important" },
    a: { color: `${t.fg} !important` },
    img: { "max-width": "100% !important" },
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
        const task = pdfjs.getDocument({ data: new Uint8Array(buf) });
        pdfTask.current = task;
        const d = await task.promise;
        if (alive) setDoc(d);
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
        const p = await doc.getPage(num);
        if (!alive) return;
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
          if (urlsRef.current[nm]) return;
          const u = URL.createObjectURL(new Blob([buf]));
          urlsRef.current[nm] = u;
          setUrls((x) => ({ ...x, [nm]: u }));
        }).catch(() => {});
    });
    const pct = n > 1 ? page / (n - 1) : 1;
    onState({ pct, label: tt("Sayfa {0} / {1}", page + 1, n) });
    setPos(b.path, { loc: page, pct, at: Date.now() });
  }, [pages, page]);
  useEffect(() => () => {
    Object.values(urlsRef.current).forEach((u) => URL.revokeObjectURL(u));
    urlsRef.current = {};
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
      {shown.map((nm) => urls[nm] ? <img key={nm} src={urls[nm]} alt="" style={{ maxWidth: shown.length > 1 ? "50%" : "100%" }} /> : <div key={nm} className="muted pulse">…</div>)}
    </div>
  );
}
