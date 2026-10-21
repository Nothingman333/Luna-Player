// Collections (a theme across films, music and books: "everything Dune") and one history of
// what was watched, listened to and read. Both open from the top bar in every part of Luna.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { lang, tt } from "./i18n";
import { IMG, Item, store } from "./library";
import { I, Icon, MenuEntry, menuAgain, openMenu } from "./Screens";
import { askAssistant, libMatch, youtubeTrailer } from "./Taste";
import { loadHistory, playQueue, QItem, useMusic } from "./Music";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Book, fetchBook, loadBookLibrary, loadReadHistory, requestOpenBook } from "./Books";

// ---------- collections ----------
export type CKind = "film" | "music" | "book";
export type CItem = { kind: CKind; title: string; by?: string; year?: string; note?: string; path?: string; src?: string; cover?: string | null;
  /** a free edition found for a book (downloaded on a click) and where it is from */
  url?: string; from?: string };
export type Collection = { id: string; name: string; about?: string; at: number; items: CItem[] };

const subs = new Set<() => void>();
export const loadCollections = () => store.json<Collection[]>("collections", []);
export function saveCollections(l: Collection[]) { store.set("collections", JSON.stringify(l)); subs.forEach((f) => f()); }
/** Tells the open pages that something changed outside them (the assistant, an undo). */
export const collectionsChanged = () => subs.forEach((f) => f());
function useTick() {
  const [, bump] = useState(0);
  useEffect(() => { const f = () => bump((n) => n + 1); subs.add(f); return () => { subs.delete(f); }; }, []);
}
const same = (a: CItem, b: CItem) => a.kind === b.kind && a.title.toLocaleLowerCase() === b.title.toLocaleLowerCase() && (a.by ?? "").toLocaleLowerCase() === (b.by ?? "").toLocaleLowerCase();

/** Adds to the collection with this name (made if missing); returns how many were new. */
/** Where "take me there" goes: the assistant closes and Luna shows the place (App listens). */
export const goPlace = (place: string, id?: string) => window.dispatchEvent(new CustomEvent("luna-go", { detail: { place, id } }));
export const collectionId = (name: string) => loadCollections().find((x) => x.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase())?.id;
export function addToCollection(name: string, items: CItem[], about?: string): number {
  const l = loadCollections();
  let c = l.find((x) => x.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase());
  if (!c) { c = { id: "c" + Date.now().toString(36), name: name.trim(), about, at: Date.now(), items: [] }; l.unshift(c); }
  else if (about && !c.about) c.about = about;
  const fresh = items.filter((x) => x.title?.trim() && !c!.items.some((y) => same(x, y)));
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

type HEntry = { kind: CKind; at: number; title: string; sub: string; cover?: string | null; mins?: number; open: () => void; remove: () => void };
function historyEntries(items: Item[], play: (path: string) => void): HEntry[] {
  const drop = (key: string, at: number, field = "at") => store.set(key, JSON.stringify(store.json<any[]>(key, []).filter((x) => x[field] !== at)));
  return [
    ...loadFilmHistory().map((x): HEntry => {
      const it = items.find((i) => i.files.some((f) => f.path === x.path));
      return { kind: "film", at: x.at, title: x.title, sub: tt("Film · %{0} → %{1}", Math.round(x.from * 100), Math.round(x.to * 100)), cover: x.poster ?? (it?.meta?.poster ? IMG + "w185" + it.meta.poster : null), mins: x.mins, open: () => play(x.path), remove: () => drop("filmHistory", x.id, "id") };
    }),
    ...loadHistory().map((x): HEntry => ({ kind: "music", at: x.at, title: x.q.title, sub: x.q.artist ?? (x.q.radio ? tt("Radyo") : ""), cover: x.q.cover ?? x.q.favicon, open: () => playQueue([x.q]), remove: () => drop("musicHistory", x.at) })),
    ...loadReadHistory().map((x): HEntry => ({ kind: "book", at: x.at, title: x.b.title, sub: x.b.author, cover: x.b.cover, mins: x.mins, open: () => requestOpenBook(x.b), remove: () => drop("bookHistory", x.at) })),
  ].sort((a, b) => b.at - a.at);
}

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

// ---------- the page ----------
const KIND_ICON: Record<CKind, string> = {
  film: "M4 4h16v16H4zM8 4v16M16 4v16",
  music: "M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  book: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 21V5",
};
const KIND_LABEL = (): Record<CKind, string> => ({ film: tt("Filmler ve diziler"), music: tt("Müzik"), book: tt("Kitaplar") });
const ASK_FOR = (x: CItem) => x.kind === "film" ? tt("“{0}”{1} filmini kütüphanemde ara; yoksa nasıl izleyebileceğimi söyle", x.title, x.year ? ` (${x.year})` : "")
  : x.kind === "music" ? tt("“{0}”{1} şarkısını çal", x.title, x.by ? ` (${x.by})` : "")
  : tt("“{0}”{1} kitabını bul", x.title, x.by ? ` (${x.by})` : "");

export type MineTab = "collections" | "history";
export function MinePage({ tab, setTab, items, play, onClose, openId }: { tab: MineTab; setTab: (t: MineTab) => void; items: Item[]; play: (path: string) => void; onClose: () => void; openId?: string | null }) {
  useTick();
  // the music bar shows over this page while something plays: the page makes room for it
  const playingMusic = !!useMusic().now;
  const [open, setOpen] = useState<string | null>(openId ?? null);
  useEffect(() => { if (openId) setOpen(openId); }, [openId]);
  const [books, setBooks] = useState<Book[]>([]);
  useEffect(() => { loadBookLibrary().then(setBooks).catch(() => {}); }, []);
  // the page behind is blurred directly, like the assistant's workspace (the glass alone lets the posters through)
  useEffect(() => { document.body.classList.add("mine-open"); return () => document.body.classList.remove("mine-open"); }, []);
  useEffect(() => {
    // (not while the assistant is open over this page: Esc is its)
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector(".chat-panel, .chat-ws-wrap:not(.mine-layer)")) { e.stopPropagation(); open ? setOpen(null) : onClose(); } };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [open, onClose]);
  const cols = loadCollections();
  const cur = cols.find((c) => c.id === open);
  const close = () => onClose();
  // the assistant opens over this page (closing it comes back here)
  const ask = (q: string) => askAssistant(q);
  // what's at hand: a film or a book on disk opens at once, anything else goes to the assistant
  const local = (x: CItem): (() => void) | null => {
    if (x.kind === "film") {
      const it = (x.path && items.find((i) => i.files.some((f) => f.path === x.path))) || libMatch(items, { title: x.title, year: x.year });
      return it ? () => { close(); play(it.files[0].path); } : null;
    }
    if (x.kind === "book") {
      const b = books.find((b) => (x.path && b.path === x.path) || b.title.toLocaleLowerCase() === x.title.toLocaleLowerCase());
      return b ? () => { close(); requestOpenBook(b); } : null;
    }
    // a song plays with the collection's other songs after it; the page stays, the bar below shows it
    if (!x.src) return null;
    const songs = (cur?.items ?? [x]).filter((y) => y.kind === "music" && y.src);
    const q = songs.map((y) => ({ src: y.src!, title: y.title, artist: y.by, cover: y.cover }) as QItem);
    return () => playQueue(q, Math.max(0, songs.findIndex((y) => same(y, x))));
  };
  const [getting, setGetting] = useState("");
  // a free book found for the collection: downloaded into the library on a click, then opened
  const fetchFree = async (c: Collection, x: CItem) => {
    setGetting(x.title);
    try {
      const b = await fetchBook(x.url!, x.title, x.by ?? "", "epub");
      setCols((l) => l.map((y) => (y.id === c.id ? { ...y, items: y.items.map((z) => (same(z, x) ? { ...z, path: b.path } : z)) } : y)));
      setBooks(await loadBookLibrary());
      close(); requestOpenBook(b);
    } catch (e) { alert(tt("İndirilemedi: {0}", String(e))); }
    setGetting("");
  };
  const go = (x: CItem, c?: Collection) => (local(x) ?? (x.kind === "book" && x.url && c ? () => fetchFree(c, x) : () => ask(ASK_FOR(x))))();
  // by hand: films, songs and books typed in (a song is looked up on YouTube so it plays)
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<{ kind: CKind; title: string; extra: string; note: string }>({ kind: "film", title: "", extra: "", note: "" });
  const [saving, setSaving] = useState(false);
  const addByHand = async () => {
    const t = form.title.trim(), e = form.extra.trim();
    if (!t || !cur) return;
    setSaving(true);
    const it: CItem = { kind: form.kind, title: t, note: form.note.trim() || undefined };
    if (form.kind === "film" && /^\d{4}$/.test(e)) it.year = e; else if (e) it.by = e;
    if (form.kind === "film") { const m = libMatch(items, { title: t, year: it.year }); if (m) it.path = m.files[0].path; }
    if (form.kind === "book") {
      // a book already on the shelf: it opens from the collection, with its cover and author
      const lo = (x: string) => x.toLocaleLowerCase().trim();
      const m = books.find((b) => lo(b.title) === lo(t)) ?? (t.length >= 3 ? books.find((b) => lo(b.title).includes(lo(t)) && (!e || lo(b.author ?? "").includes(lo(e)))) : undefined);
      if (m) { it.title = m.title; it.path = m.path; it.cover = m.cover; it.by ??= m.author; }
    }
    if (form.kind === "music") {
      try { const h = (await invoke<{ url: string; thumb?: string }[]>("yt_search", { query: `${e} ${t}`.trim(), n: 1 }))[0]; if (h) { it.src = h.url; it.cover = h.thumb; } } catch {}
    }
    addToCollection(cur.name, [it]);
    setForm((f) => ({ ...f, title: "", extra: "", note: "" }));
    setSaving(false);
  };
  const setCols = (f: (l: Collection[]) => Collection[]) => saveCollections(f(loadCollections()));
  const removeItem = (c: Collection, x: CItem) => setCols((l) => l.map((y) => (y.id === c.id ? { ...y, items: y.items.filter((z) => !same(z, x)) } : y)));
  const rename = (c: Collection) => { const n = prompt(tt("Koleksiyonun yeni adı"), c.name); if (n?.trim()) setCols((l) => l.map((y) => (y.id === c.id ? { ...y, name: n.trim() } : y))); };
  const del = (c: Collection) => { if (confirm(tt("“{0}” koleksiyonu silinsin mi? (İçindeki film, şarkı ve kitaplar yerinde kalır.)", c.name))) { setCols((l) => l.filter((y) => y.id !== c.id)); setOpen(null); } };
  const colMenu = (c: Collection): MenuEntry[] => [
    { label: tt("Aç"), act: () => setOpen(c.id) },
    { label: tt("Elle ekle…"), act: () => { setOpen(c.id); setAdding(true); } },
    { label: "✦  " + tt("Asistana bu koleksiyona ekleme yaptır"), act: () => ask(tt("“{0}” koleksiyonuma uygun birkaç film, şarkı ve kitap daha ekle", c.name)) },
    "sep",
    { label: tt("Adını değiştir…"), act: () => rename(c) },
    { label: tt("Koleksiyonu sil"), danger: true, act: () => del(c) },
  ];
  const itemMenu = (c: Collection, x: CItem): MenuEntry[] => [
    { label: local(x) ? (x.kind === "film" ? tt("Oynat") : x.kind === "book" ? tt("Oku") : tt("Çal")) : x.url ? tt("İndir ve oku") : tt("Asistanla bul"), act: () => go(x, c) },
    { label: "✦  " + tt("Bu ne hakkında?"), act: () => ask(tt("“{0}”{1} ne hakkında? Spoiler vermeden anlat", x.title, x.by ? ` (${x.by})` : x.year ? ` (${x.year})` : "")) },
    { label: tt("Google'da ara"), act: () => openUrl(googleFor(x)) },
    ...(x.kind === "film" ? [{ label: tt("YouTube'da fragman"), act: () => openUrl(youtubeTrailer(x.year ? `${x.title} (${x.year})` : x.title)) }] : []),
    "sep",
    { label: tt("Koleksiyondan çıkar"), danger: true, act: () => removeItem(c, x) },
  ];
  return createPortal(
    <>
      <div className="chat-scrim mine-layer" />
      <div className={"chat-ws-wrap mine-layer" + (playingMusic ? " with-dock" : "")} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <div className="chat-ws glass set-ws mine-ws" role="dialog" aria-label={tt("Koleksiyonlar ve geçmiş")}>
          <aside className="ws-side">
            <div className="ws-side-head"><div className="ws-brand"><Icon d={STACK} size={18} />  {tt("Benim Luna'm")}</div></div>
            <nav className="ws-hist set-nav">
              {([["collections", tt("Koleksiyonlar"), tt("Film, müzik, kitap bir arada"), STACK], ["history", tt("Geçmiş"), tt("İzlediğin, dinlediğin, okuduğun"), CLOCK]] as const).map(([id, label, sub, ic]) => (
                <button key={id} className={"set-nav-i" + (id === tab ? " on" : "")} onClick={() => { setTab(id); setOpen(null); }}>
                  <Icon d={ic} size={18} />
                  <span className="set-nav-t"><b>{label}</b><small>{sub}</small></span>
                </button>
              ))}
            </nav>
          </aside>
          <section className="ws-main">
            <div className="chat-head set-head">
              {cur && tab === "collections" && <button className="round" aria-label={tt("Geri")} title={tt("Geri")} onClick={() => setOpen(null)}><Icon d={I.left} size={18} /></button>}
              <div>
                <h2 className="ws-title">{tab === "history" ? tt("Geçmiş") : cur ? cur.name : tt("Koleksiyonlar")}</h2>
                <div className="muted small">{tab === "history" ? tt("Film, müzik ve kitap; günlere göre") : cur ? (cur.about || tt("{0} öğe", cur.items.length)) : tt("Bir konu etrafında filmler, şarkılar ve kitaplar")}</div>
              </div>
              <span className="grow" />
              {cur && tab === "collections" && <button className={"chip" + (adding ? " on" : "")} onClick={() => setAdding(!adding)}>＋ {tt("Ekle")}</button>}
              {cur && tab === "collections" && <button className="chip" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); openMenu({ ...e, clientX: r.left, clientY: r.bottom + 6, preventDefault: () => {}, stopPropagation: () => {} } as React.MouseEvent, colMenu(cur)); }}>{tt("Düzenle")}</button>}
              <button className="round" aria-label={tt("Kapat")} title={tt("Kapat")} onClick={onClose}><Icon d={I.x} size={18} /></button>
            </div>
            <div className="set-body mine-body" key={tab + (open ?? "")}>
              {tab === "history" ? <History items={items} play={(p) => { close(); play(p); }} />
                : cur ? (<>
                  {adding && (
                    <form className="mine-add" onSubmit={(e) => { e.preventDefault(); addByHand(); }}>
                      <div className="seg-row">
                        {(["film", "music", "book"] as CKind[]).map((k) => (
                          <button type="button" key={k} className={"seg sm" + (form.kind === k ? " on" : "")} onClick={() => setForm((f) => ({ ...f, kind: k }))}>
                            <Icon d={KIND_ICON[k]} size={13} />  {k === "film" ? tt("Film / dizi") : k === "music" ? tt("Şarkı") : tt("Kitap")}</button>
                        ))}
                      </div>
                      <div className="mine-add-row">
                        <input autoFocus value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder={tt("Adı")} />
                        <input value={form.extra} onChange={(e) => setForm((f) => ({ ...f, extra: e.target.value }))}
                          placeholder={form.kind === "film" ? tt("Yıl (isteğe bağlı)") : form.kind === "music" ? tt("Sanatçı") : tt("Yazar")} />
                      </div>
                      <div className="mine-add-row">
                        <input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder={tt("Not (isteğe bağlı)")} />
                        <button className="primary sm" disabled={!form.title.trim() || saving}>{saving ? tt("Ekleniyor…") : tt("Ekle")}</button>
                        <button type="button" className="chip" onClick={() => setAdding(false)}>{tt("Kapat")}</button>
                      </div>
                    </form>
                  )}
                  {cur.items.length ? (["film", "music", "book"] as CKind[]).filter((k) => cur.items.some((x) => x.kind === k)).map((k) => (
                    <section key={k} className="mine-sec">
                      <h3><Icon d={KIND_ICON[k]} size={15} />  {KIND_LABEL()[k]}</h3>
                      <div className="mine-items">
                        {cur.items.filter((x) => x.kind === k).map((x) => {
                          const here = !!local(x);
                          return (
                            <div role="button" tabIndex={0} key={x.title + (x.by ?? "")} className={"mine-item" + (getting === x.title ? " busy" : "")} onClick={() => getting !== x.title && go(x, cur)}
                              onKeyDown={(e) => e.key === "Enter" && e.currentTarget === e.target && go(x, cur)} onContextMenu={(e) => openMenu(e, itemMenu(cur, x))}
                              title={here ? tt("Kütüphanende var · aç") : x.url ? tt("Ücretsiz baskısı var ({0}) · indir ve oku", x.from ?? "") : tt("Kütüphanende yok · asistan bulsun")}>
                              <span className={"mine-ic " + k}><Icon d={KIND_ICON[k]} size={16} /></span>
                              <span className="mine-t">
                                <b className="ellipsis">{x.title}{x.year ? <span className="muted"> ({x.year})</span> : null}</b>
                                {x.by && <span className="muted small ellipsis">{x.by}</span>}
                                {x.note && <span className="small mine-note">{x.note}</span>}
                              </span>
                              <span className="mine-acts" onClick={(e) => e.stopPropagation()}>
                                {k === "film" && <button className="mine-ab yt" title={tt("YouTube'da fragman")} aria-label={tt("YouTube'da fragman")}
                                  onClick={() => openUrl(youtubeTrailer(x.year ? `${x.title} (${x.year})` : x.title))}><Icon d={YT} size={15} /></button>}
                                <button className="mine-ab g" title={tt("Google'da ara")} aria-label={tt("Google'da ara")} onClick={() => openUrl(googleFor(x))}><GoogleG /></button>
                                {!here && <button className="mine-ab" title={tt("Asistana buldur")} aria-label={tt("Asistana buldur")} onClick={() => go(x, cur)}>✦</button>}
                                {getting === x.title ? <span className="mine-ab"><span className="mu-spin sm" /></span>
                                  : here ? <button className="mine-ab on" title={k === "film" ? tt("Oynat") : k === "book" ? tt("Oku") : tt("Çal")} aria-label={k === "film" ? tt("Oynat") : k === "book" ? tt("Oku") : tt("Çal")} onClick={() => go(x, cur)}>
                                      <Icon d={k === "book" ? KIND_ICON.book : I.play} fill={k !== "book"} size={14} /></button>
                                  : x.url ? <button className="mine-ab on" title={tt("İndir ve oku")} aria-label={tt("İndir ve oku")} onClick={() => go(x, cur)}><Icon d={I.down} size={15} /></button> : null}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  )) : <div className="mine-empty muted">{tt("Bu koleksiyon boş. “＋ Ekle” ile elle ekleyebilir ya da film, şarkı ve kitapların sağ tık menüsünden “Koleksiyona ekle…” diyebilirsin.")}</div>}
                </>) : (
                  <>
                    <div className="seg-row">
                      <button className="primary sm" onClick={() => ask(tt("Zevkime göre bir konu seç ve film, müzik ve kitaplarla bir koleksiyon yap"))}>✦  {tt("Asistana yaptır")}</button>
                      <button className="chip" onClick={() => { const n = prompt(tt("Koleksiyonun adı")); if (n?.trim()) { addToCollection(n, []); const id = collectionId(n); if (id) { setOpen(id); setAdding(true); } } }}>{tt("Boş koleksiyon")}</button>
                    </div>
                    {cols.length ? (
                      <div className="mine-grid">
                        {cols.map((c) => (
                          <button key={c.id} className="mine-col" onClick={() => setOpen(c.id)} onContextMenu={(e) => openMenu(e, colMenu(c))}>
                            <b className="ellipsis">{c.name}</b>
                            <span className="muted small">{(["film", "music", "book"] as CKind[]).map((k) => [k, c.items.filter((x) => x.kind === k).length] as const).filter(([, n]) => n).map(([k, n]) => `${n} ${k === "film" ? tt("film") : k === "music" ? tt("şarkı") : tt("kitap")}`).join(" · ") || tt("boş")}</span>
                            {c.about && <span className="small mine-note">{c.about}</span>}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="mine-empty">
                        <b>{tt("Henüz koleksiyonun yok")}</b>
                        <div className="muted">{tt("Asistana “Dune hakkında bir koleksiyon yap: filmleri, müzikleri, kitapları” de; kütüphanende olmasalar da liste olarak kaydeder. Kütüphanende olanlar tek tıkla açılır, olmayanları asistan bulur.")}</div>
                      </div>
                    )}
                  </>
                )}
            </div>
          </section>
        </div>
      </div>
    </>,
    document.body,
  );
}

function History({ items, play }: { items: Item[]; play: (path: string) => void }) {
  useTick();
  const [kind, setKind] = useState<CKind | "all">("all");
  const [, bump] = useState(0);
  const all = historyEntries(items, play);
  const list = all.filter((x) => kind === "all" || x.kind === kind);
  const loc = lang() === "tr" ? "tr-TR" : "en-US";
  const days = new Map<string, HEntry[]>();
  for (const x of list.slice(0, 600)) {
    const d = new Date(x.at).toLocaleDateString(loc, { weekday: "long", day: "numeric", month: "long" });
    days.set(d, [...(days.get(d) ?? []), x]);
  }
  const clear = () => {
    if (!confirm(tt("İzleme, dinleme ve okuma geçmişinin hepsi silinsin mi? (Filmler, şarkılar, kitaplar ve kaldığın yerler kalır.)"))) return;
    for (const k of ["filmHistory", "musicHistory", "bookHistory"]) store.set(k, "[]");
    bump((n) => n + 1);
  };
  return (
    <>
      <div className="seg-row">
        {([["all", tt("Hepsi")], ["film", tt("Film")], ["music", tt("Müzik")], ["book", tt("Kitap")]] as const).map(([k, l]) => (
          <button key={k} className={"seg" + (kind === k ? " on" : "")} onClick={() => setKind(k)}>{l}</button>
        ))}
        <span className="grow" />
        {all.length > 0 && <button className="chip" onClick={clear}>{tt("Geçmişi temizle")}</button>}
      </div>
      {!list.length && <div className="mine-empty muted">{tt("Burada henüz bir şey yok. İzlediğin filmler (bir dakikadan uzun), dinlediğin şarkılar ve okuduğun kitaplar günlere göre burada görünür.")}</div>}
      {[...days].map(([d, l]) => (
        <section key={d} className="mine-sec">
          <h3>{d}</h3>
          <div className="mine-items">
            {l.map((x) => (
              <button key={x.kind + x.at} className="mine-item" onClick={x.open}
                onContextMenu={(e) => openMenu(e, [{ label: x.kind === "film" ? tt("Oynat") : x.kind === "book" ? tt("Oku") : tt("Çal"), act: x.open }, "sep", { label: tt("Geçmişten kaldır"), danger: true, act: () => { x.remove(); bump((n) => n + 1); } }])}>
                {x.cover ? <img className="mine-cov" src={x.cover} alt="" loading="lazy" /> : <span className={"mine-ic " + x.kind}><Icon d={KIND_ICON[x.kind]} size={16} /></span>}
                <span className="mine-t">
                  <b className="ellipsis">{x.title}</b>
                  <span className="muted small ellipsis">{x.sub}</span>
                </span>
                <span className="muted small mine-when">{new Date(x.at).toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" })}{x.mins ? " · " + tt("{0} dk", Math.max(1, Math.round(x.mins))) : ""}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

/** Google's "G", in its colours. */
const GoogleG = () => (
  <svg viewBox="0 0 48 48" width="15" height="15" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.6 13.3l7.9 6.1C12.4 13.7 17.7 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.8c4.3-4 6.9-9.9 6.9-17.2z" />
    <path fill="#FBBC05" d="M10.5 28.6A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.6l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.9-6.1z" />
    <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.8c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.2-13.5-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
  </svg>
);
/** A web search for an item (the film's year, the song's artist, the book's author with it). */
const googleFor = (x: CItem) => "https://www.google.com/search?q=" + encodeURIComponent(
  [x.title, x.year, x.by, x.kind === "film" ? (lang() === "tr" ? "film" : "movie") : x.kind === "book" ? (lang() === "tr" ? "kitap" : "book") : ""].filter(Boolean).join(" "));
const YT = "M22 8.6a3 3 0 0 0-2.1-2.1C18 6 12 6 12 6s-6 0-7.9.5A3 3 0 0 0 2 8.6 31 31 0 0 0 1.6 12 31 31 0 0 0 2 15.4a3 3 0 0 0 2.1 2.1C6 18 12 18 12 18s6 0 7.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .4-3.4 31 31 0 0 0-.4-3.4zM10 9.5v5l4.5-2.5z";
export const STACK = "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5";
const CLOCK = "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2";
