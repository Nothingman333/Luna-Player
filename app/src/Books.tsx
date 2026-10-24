import { appStorage as localStorage } from "./appStorage";
import { withBookInfo } from "./BookData";
import { bookIdentity } from "./bookDataModel";
import { bookPaths,cleanBookPosition,mergeBookSources,validListedBook } from "./bookLibraryModel";
import "./BookMusic.css";
// Kitap modu: the user's own books (EPUB, PDF, comics), books from open libraries (Project
// Gutenberg) and free audiobooks (LibriVox, played by the music player), plus the reader.
import { open } from "@tauri-apps/plugin-dialog";
import "./FilmDecision.css";
import { tt } from "./i18n";
import { store } from "./library";
import { QItem } from "./Music";
import { invoke } from "./nativeCore";
import { OEntry } from "./Opds";
export type Book = { path: string; kind: "epub" | "pdf" | "cbz" | "mobi" | "azw3" | "fb2"; title: string; author: string; lang?: string; cover?: string | null; isbn?:string; identityTitle?:string; identityAuthor?:string; originalCover?: string | null };
export const posKey = (p: string) => "bookPos:" + p;
export const getPos = (p: string) => cleanBookPosition(store.json<unknown>(posKey(p), null));
export const loadBookFolders = () => store.json<string[]>("bookFolders", []);
export let libCache: { sig: string; books: Book[] } | null = null;
export const libSubs = new Set<() => void>();
export const libChanged = () => { libCache = null; libSubs.forEach((f) => f()); };
/** The book library (scanned once; the index keeps it quick). */
export async function loadBookLibrary(): Promise<Book[]> {
  const f = loadBookFolders();
  if (libCache?.sig === f.join("|")) return libCache.books.map(withBookInfo);
  // a failed scan isn't kept as an empty library: the next ask scans again
  let ok = true;
  const books = f.length ? await invoke<Book[]>("books_scan", { folders: f }).catch(() => { ok = false; return [] as Book[]; }) : [];
  if (ok) libCache = { sig: f.join("|"), books };
  return books.map(withBookInfo);
}

// opening a book from anywhere (the assistant): the books page opens it when it's on screen
export let openHandler: ((b: Book) => void) | null = null;
export let pendingOpen: Book | null = null;
export function requestOpenBook(b: Book) {
  b=withBookInfo(b);
  const recent = [b.path, ...bookPaths(store.json("bookRecent", [])).filter((p) => p !== b.path)].slice(0, 20);
  store.set("bookRecent", JSON.stringify(recent));
  // what the book is, also when it lives outside the book folders (opened with "Open file")
  const known = Object.fromEntries(mergeBookSources<Book>(store.json("bookOpened", {})).map(x=>[x.path,x]));
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

// ---------- open libraries ----------
export async function getJson(url: string): Promise<any> {
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
export const abCover = (id: string) => `https://archive.org/services/img/${encodeURIComponent(id)}`;
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
  return list.map((f,chapter) => ({
    src: `https://archive.org/download/${encodeURIComponent(a.identifier)}/${encodeURIComponent(f.name)}`,
    title: f.title || String(f.name).replace(/_64kb\.mp3$|\.mp3$/i, "").replace(/_/g, " "),
    artist: abAuthor(a), album: abTitle(a.title), cover: abCover(a.identifier), duration: Number(f.length) || undefined, book: a.identifier, chapter,
  } as QItem));
}

// ---------- "Dosya aç" and "Bağlantı" in the books part ----------
export async function openBookFile() {
  const f = await open({ multiple: false, filters: [{ name: tt("Kitap"), extensions: ["epub", "pdf", "cbz", "mobi", "azw3", "fb2"] }] });
  if (typeof f !== "string") return;
  const ext = f.split(".").pop()!.toLowerCase();
  const stem = f.split(/[\\/]/).pop()!.replace(/\.[^.]+$/, "");
  // "Author - Title - Subtitle": only the first dash parts the author; the rest stays the title
  const cut = stem.indexOf(" - ");
  const [author, title] = cut > 0 ? [stem.slice(0, cut), stem.slice(cut + 3)] : ["", stem];
  requestOpenBook({ path: f, kind: (["epub","pdf","cbz","mobi","azw3","fb2"].includes(ext)?ext:"epub") as Book["kind"], title: title.trim(), author: author.trim() });
}

/** The book on screen (open in the reader, or its details page): the assistant can talk about it. */
export let onScreen: { b: Book; reading: boolean } | null = null;
export const bookOnScreen = () => onScreen;

// ---------- pages ----------
export type BooksView = "home" | "library" | "taste" | "discover" | "audio";

/** Vikikaynak's works as catalog entries (downloaded as an EPUB Luna makes). */
export async function wikisourceBooks(lang: string, q: string): Promise<OEntry[]> {
  const l = await invoke<{ title: string; author: string; year: string }[]>("ws_search", { lang, q });
  return l.map((h) => ({ id: "ws:" + h.title, title: h.title, author: h.author, summary: h.year || undefined, acq: [{ href: `wikisource:${lang}:${h.title}`, type: "application/epub+zip", open: true }] }));
}

// ---------- a book's page (like a film's): what it is, your verdict, questions for the assistant ----------
export type BookNote = { vote?: "like" | "dislike"; rating?: number; note?: string; read?: number; at: number };
export const bkKey = bookIdentity;
export const loadBookNotes = () => store.json<Record<string, BookNote & { title: string; author: string }>>("bookDiary", {});
/** Clears what Luna kept about a book: where you were, likes, points and note. The file stays. */
export function clearBookRecord(b: { path: string; title: string; author: string }) {
  try { localStorage.removeItem(posKey(b.path)); } catch {}
  const d = loadBookNotes();
  delete d[bkKey(b)];
  store.set("bookDiary", JSON.stringify(d));
  store.set("bookRecent", JSON.stringify(bookPaths(store.json("bookRecent", [])).filter((p) => p !== b.path)));
  libSubs.forEach((f) => f());
}
/** A deleted book file leaves the library (rescanned). */
export const forgetBooks = () => libChanged();

// ---------- reading history: every sitting with a book (when, how long, from where to where) ----------
export type Sitting = { b: Book; at: number; mins: number; from: number; to: number; aloud?: number };
export const loadReadHistory = ():Sitting[] => {const raw=store.json<unknown>("bookHistory",[]);return Array.isArray(raw)?raw.filter((x):x is Sitting=>!!x&&validListedBook(x.b)&&[x.at,x.mins,x.from,x.to].every(n=>typeof n==="number"&&Number.isFinite(n))&&x.at>0&&x.mins>=0&&x.from>=0&&x.from<=1&&x.to>=0&&x.to<=1&&(x.aloud===undefined||(typeof x.aloud==="number"&&Number.isFinite(x.aloud)&&x.aloud>=0))):[];};
export function setSplit_libCache<T extends typeof libCache>(value:T):T{libCache=value;return value;}
export function setSplit_onScreen<T extends typeof onScreen>(value:T):T{onScreen=value;return value;}
export function setSplit_openHandler<T extends typeof openHandler>(value:T):T{openHandler=value;return value;}
export function setSplit_pendingOpen<T extends typeof pendingOpen>(value:T):T{pendingOpen=value;return value;}
