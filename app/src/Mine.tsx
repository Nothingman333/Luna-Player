import { readCollections } from "./collectionStorage";
// Collections (a theme across films, music and books: "everything Dune") and one history of
// what was watched, listened to and read. Both open from the top bar in every part of Luna.
import { loadReadHistory } from "./Books";
import { tt } from "./i18n";
import { store } from "./library";
import { loadHistory } from "./Music";
import { menuAgain,MenuEntry } from "./Screens";

import { uniqueCollectionItems } from "./safety";

// ---------- collections ----------
export type CKind = "film" | "music" | "book";
export type CItem = { kind: CKind; title: string; by?: string; year?: string; note?: string; path?: string; src?: string; cover?: string | null;
  /** a free edition found for a book (downloaded on a click) and where it is from */
  url?: string; from?: string };
export type Collection = { id: string; name: string; about?: string; at: number; items: CItem[] };

export const subs = new Set<() => void>();
export const loadCollections = () => readCollections(store.get("collections")).collections;
export function saveCollections(l: Collection[]) { if (readCollections(store.get("collections")).damaged) throw new Error(tt("Koleksiyon kaydı hasarlı; mevcut veriyi korumak için kaydetme durduruldu. Önce yedeğini dışa aktar.")); if (!store.set("collections", JSON.stringify(l))) throw new Error(tt("Depolama dolu: son değişiklikler kaydedilemedi.")); subs.forEach((f) => f()); }
/** Tells the open pages that something changed outside them (the assistant, an undo). */
export const collectionsChanged = () => subs.forEach((f) => f());

/** Adds to the collection with this name (made if missing); returns how many were new. */
/** Where "take me there" goes: the assistant closes and Luna shows the place (App listens). */
export const goPlace = (place: string, id?: string) => window.dispatchEvent(new CustomEvent("luna-go", { detail: { place, id } }));
export const collectionId = (name: string) => loadCollections().find((x) => x.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase())?.id;
export function addToCollection(name: string, items: CItem[], about?: string): number {
  if (!name.trim()) return 0;
  const l = loadCollections();
  let c = l.find((x) => x.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase());
  if (!c) { c = { id: "c" + crypto.randomUUID(), name: name.trim(), about, at: Date.now(), items: [] }; l.unshift(c); }
  else if (about && !c.about) c.about = about;
  const fresh = uniqueCollectionItems(c.items, items);
  c.items.push(...fresh);
  saveCollections(l);
  return fresh.length;
}

/** "Add to a collection…": a second menu with the collections and a new one. */
export const collectEntry = (item: CItem): MenuEntry => ({
  label: tt("Koleksiyona ekle…"),
  act: () => menuAgain([
    ...loadCollections().slice(0, 12).map((c) => ({ label: c.name, act: () => { addToCollection(c.name, [item]); } })),
    ...(loadCollections().length ? ["sep" as const] : []),
    { label: tt("Yeni koleksiyon…"), act: () => { const n = prompt(tt("Koleksiyonun adı")); if (n?.trim()) addToCollection(n, [item]); } },
  ]),
});

// ---------- one history ----------
type FilmSeen = { id: number; path: string; title: string; poster?: string | null; at: number; mins: number; from: number; to: number };
export const loadFilmHistory = () => store.json<FilmSeen[]>("filmHistory", []);
let sess: { id: number; path: string; from: number } | null = null;
/** Called as a film plays: one entry per sitting (a minute or more), kept up to date. */
export function noteFilm(p: { path: string; title: string; time: number; duration: number; poster?: string | null }) {
  if (!sess || sess.path !== p.path) sess = { id: Date.now(), path: p.path, from: p.time };
  const mins = Math.max(0, (p.time - sess.from) / 60);
  if (mins < 1) return;
  const e: FilmSeen = { id: sess.id, path: p.path, title: p.title, poster: p.poster, at: sess.id, mins, from: sess.from / p.duration, to: p.time / p.duration };
  const l = loadFilmHistory();
  const i = l.findIndex((x) => x.id === e.id);
  if (i >= 0) l[i] = e; else l.unshift(e);
  store.set("filmHistory", JSON.stringify(l.slice(0, 500)));
}
export const endFilmSitting = () => { sess = null; };

// ---------- what the assistant knows (every part) ----------
export function mineContext(): string {
  const sec = (h: string, l: string[]) => `## ${h}\n${l.length ? l.map((x) => "- " + x).join("\n") : "(yok)"}`;
  const kindName: Record<CKind, string> = { film: "film", music: "müzik", book: "kitap" };
  const since = Date.now() - 14 * 86400_000;
  const hist = [
    ...loadFilmHistory().filter((x) => x.at > since).map((x) => ({ at: x.at, t: `film: ${x.title} (${Math.round(x.mins)} dk)` })),
    ...loadHistory().filter((x) => x.at > since).slice(0, 40).map((x) => ({ at: x.at, t: `müzik: ${x.q.title}${x.q.artist ? " — " + x.q.artist : ""}` })),
    ...loadReadHistory().filter((x) => x.at > since).map((x) => ({ at: x.at, t: `kitap: ${x.b.title} (${Math.max(1, Math.round(x.mins))} dk)` })),
  ].sort((a, b) => b.at - a.at).slice(0, 50);
  return [
    sec("Koleksiyonları (film + müzik + kitap karışık; make_collection ile yapılır/eklenir)", loadCollections().map((c) =>
      `${c.name}${c.about ? ` (${c.about})` : ""}: ${c.items.slice(0, 30).map((x) => `[${kindName[x.kind]}] ${x.title}${x.by ? " — " + x.by : ""}`).join("; ")}`)),
    sec("Ortak geçmiş, son 14 gün (izleme, dinleme, okuma; yeniden eskiye)", hist.map((x) => `${new Date(x.at).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} ${x.t}`)),
  ].join("\n\n");
}

export type MineTab = "collections" | "history";
export const STACK = "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5";
