import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { ExtraModal, exportExtra } from "./Extras";
import { lang } from "./i18n";
import { BrowserIcon as WebIcon } from "./BrowserIcons";
import { groupVisitsByDay, hostLabel, searchVisits, siteHue } from "./browserHistoryModel";
import { BANGS } from "./browserSearchModel";
import type { Suggestion, WebVisit } from "./browserHistoryModel";
import { readerBlocks, readerPlainText, readingStats, READER_KEY, readReaderPrefs } from "./browserReaderModel";
import type { ReaderPrefs } from "./browserReaderModel";
import type { BrowserPage } from "./browserModel";

export const label = (tr: string, en: string) => lang() === "tr" ? tr : en;
const isTr = () => lang() === "tr";

/** A site's letter on its own stable colour; the real favicon replaces it once it loads. */
export function SiteAvatar({ url, size = 34, icon = true }: { url: string; size?: number; icon?: boolean }) {
  const host = hostLabel(url), [ok, setOk] = useState(false);
  let src = ""; try { src = new URL("/favicon.ico", url).href; } catch { /* not a web address */ }
  useEffect(() => setOk(false), [src]);
  const hue = siteHue(host);
  return <span className="web-avatar" style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.42)), "--hue": hue } as CSSProperties} aria-hidden="true">
    <b style={{ opacity: ok ? 0 : 1 }}>{(host.match(/[\p{L}\p{N}]/u)?.[0] ?? "•").toLocaleUpperCase()}</b>
    {icon && src && <img src={src} alt="" referrerPolicy="no-referrer" loading="lazy" onLoad={e => setOk(e.currentTarget.naturalWidth > 1)} onError={() => setOk(false)} style={{ opacity: ok ? 1 : 0 }}/>}
  </span>;
}

const timeOf = (t: number) => new Date(t).toLocaleTimeString(isTr() ? "tr-TR" : "en-GB", { hour: "2-digit", minute: "2-digit" });

/** Ctrl+H: the local history, grouped by day, searchable, with per-row and time-range removal. */
export function HistoryPanel({ rows, paused, setPaused, open, remove, clearSince, close }: {
  rows: WebVisit[]; paused: boolean; setPaused: (paused: boolean) => void; open: (url: string, newTab: boolean) => void;
  remove: (url: string) => void; clearSince: (since: number) => void; close: () => void;
}) {
  const [query, setQuery] = useState(""), [limit, setLimit] = useState(120), [status, setStatus] = useState("");
  const found = useMemo(() => searchVisits(rows, query), [rows, query]);
  const groups = useMemo(() => groupVisitsByDay(found.slice(0, limit), Date.now(), isTr()), [found, limit]);
  const dayStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
  return <ExtraModal title={label("Geçmiş", "History")} close={close}><div className="luna-extra web-history">
    <div className="web-history-head">
      <div><small>LUNA WEB</small><h3>{label("Gezdiğin sayfalar", "Where you have been")} <span>{rows.length}</span></h3></div>
      <label className="web-switch"><input type="checkbox" checked={!paused} onChange={e => setPaused(!e.target.checked)}/><span/>{label("Geçmişi kaydet", "Keep history")}</label>
    </div>
    <p className="web-history-note">{label("Geçmiş yalnız bu bilgisayarda, Luna'nın içinde tutulur; hiçbir yapay zekâ isteğine eklenmez.", "History stays on this computer, inside Luna; it is never added to an AI request.")}</p>
    <div className="web-history-search"><WebIcon name="search" size={15}/><input autoFocus aria-label={label("Geçmişte ara", "Search history")} placeholder={label("Başlık veya adres ara…", "Search titles or addresses…")} value={query} onChange={e => { setQuery(e.target.value); setLimit(120); }}/></div>
    <div className="extra-row web-history-actions">
      <button className="chip" disabled={!rows.length} onClick={() => { clearSince(Date.now() - 3_600_000); setStatus(label("Son bir saat silindi.", "The last hour was removed.")); }}>{label("Son 1 saati sil", "Remove last hour")}</button>
      <button className="chip" disabled={!rows.length} onClick={() => { clearSince(dayStart()); setStatus(label("Bugünün geçmişi silindi.", "Today's history was removed.")); }}>{label("Bugünü sil", "Remove today")}</button>
      <button className="chip" disabled={!rows.length} onClick={() => { if (confirm(label("Bütün Luna Web geçmişi silinsin mi?", "Remove all Luna Web history?"))) { clearSince(0); setStatus(label("Geçmiş temizlendi.", "History cleared.")); } }}>{label("Tümünü sil", "Remove all")}</button>
      <button className="chip" disabled={!rows.length} onClick={() => void exportExtra("Luna-web-gecmisi.json", JSON.stringify({ version: 1, history: rows }, null, 2)).then(ok => ok && setStatus(label("Geçmiş dışa aktarıldı.", "History exported.")))}>{label("Dışa aktar", "Export")}</button>
    </div>
    {status && <div className="extra-status" role="status">{status}</div>}
    <div className="web-history-list">
      {groups.map(g => <section key={g.key}><h4>{g.label}</h4>{g.rows.map(v => <div className="web-history-row" key={v.url}>
        <time>{timeOf(v.at)}</time>
        <button className="web-history-open" title={v.url + "\n" + label("Orta tık veya Ctrl+tık: yeni sekme", "Middle-click or Ctrl+click: new tab")} onClick={e => open(v.url, e.ctrlKey || e.metaKey)} onAuxClick={e => { if (e.button === 1) { e.preventDefault(); open(v.url, true); } }}>
          <SiteAvatar url={v.url} size={26}/><span><b>{v.title}</b><small>{hostLabel(v.url)}{v.count > 1 ? " · " + label(`${v.count} kez`, `${v.count} visits`) : ""}</small></span>
        </button>
        <button className="web-history-remove" aria-label={label(v.title + " kaydını sil", "Remove " + v.title)} title={label("Geçmişten sil", "Remove from history")} onClick={() => remove(v.url)}><WebIcon name="close" size={13}/></button>
      </div>)}</section>)}
      {!rows.length && <div className="web-empty"><WebIcon name="globe" size={30}/><p>{paused ? label("Geçmiş kaydı kapalı. Açınca ziyaret ettiğin sayfalar burada görünür.", "History is paused. Turn it on to see the pages you visit here.") : label("Henüz geçmiş yok. Açtığın sayfalar burada birikir.", "No history yet. The pages you open will gather here.")}</p></div>}
      {rows.length > 0 && !found.length && <p className="web-history-note">{label("Eşleşen kayıt yok.", "No matching entries.")}</p>}
      {found.length > limit && <button className="chip web-history-more" onClick={() => setLimit(n => n + 200)}>{label(`Daha fazla göster (${found.length - limit})`, `Show more (${found.length - limit})`)}</button>}
    </div>
  </div></ExtraModal>;
}

const KEYS: { group: [string, string]; rows: [string, string, string][] }[] = [
  { group: ["Sekmeler", "Tabs"], rows: [
    ["Ctrl+T", "Yeni sekme", "New tab"], ["Ctrl+W", "Sekmeyi kapat", "Close tab"], ["Ctrl+Shift+T", "Kapatılan sekmeyi geri aç", "Reopen closed tab"],
    ["Ctrl+Tab · Ctrl+Shift+Tab", "Sonraki / önceki sekme", "Next / previous tab"], ["Ctrl+1 … 8 · Ctrl+9", "Sekmeye git · son sekme", "Go to tab · last tab"],
    ["Ctrl+K", "Komut paleti", "Command palette"], ["Ctrl+PgUp · Ctrl+PgDn", "Sekmeler arasında geç", "Switch tabs"], ["Ctrl+Shift+PgUp · Ctrl+Shift+PgDn", "Sekmeyi taşı", "Move tab"], ["Shift+F10", "Sekme menüsü", "Tab menu"], ["Ctrl+Shift+A", "Sekmeler ve favoriler", "Tabs and favourites"], ["Alt+Home", "Başlangıç sayfası", "Start page"], ["Ctrl+M", "Sekmeyi sessize al", "Mute tab"] ] },
  { group: ["Adres ve sayfa", "Address and page"], rows: [
    ["Ctrl+L · F6", "Adres çubuğu", "Address bar"], ["Alt+Enter", "Adres çubuğundakini yeni sekmede aç", "Open what is in the address bar in a new tab"], ["Ctrl+D", "Favorilere ekle / çıkar", "Add / remove favourite"], ["F5 · Ctrl+R", "Yenile", "Reload"],
    ["Alt+← · Alt+→", "Geri · ileri", "Back · forward"], ["Ctrl + · Ctrl − · Ctrl 0", "Yakınlaştır · uzaklaştır · sıfırla", "Zoom in · out · reset"],
    ["Ctrl+F", "Sayfada bul (Enter / Shift+Enter)", "Find in page (Enter / Shift+Enter)"], ["F9 · Ctrl+Shift+R", "Okuma modu", "Reading view"] ] },
  { group: ["Geçmiş ve veriler", "History and data"], rows: [
    ["Ctrl+H", "Geçmiş", "History"], ["Ctrl+Shift+Del", "Gezinme verilerini temizle", "Clear browsing data"], ["Ctrl+J", "İndirmeler", "Downloads"],
    ["Shift+Delete", "Seçili geçmiş önerisini sil", "Remove the chosen history suggestion"], ["F1 · Ctrl+/", "Bu liste", "This list"] ] },
  { group: ["Luna genelinde", "Everywhere in Luna"], rows: [
    ["Alt+A", "Asistanı aç / kapat", "Open / close the assistant"], ["Ctrl+O", "Dosya aç", "Open a file"], ["Ctrl+N", "Bağlantı aç", "Open a link"],
    ["Space · ← →", "Oynat / duraklat · atla", "Play / pause · skip"], ["F", "Tam ekran", "Full screen"], ["Esc", "Pencereyi ya da paneli kapat", "Close a window or panel"] ] },
];
/** Ctrl+/ : every shortcut of Luna Web in one list, with the "!" search shortcuts. */
export function ShortcutsPanel({ close }: { close: () => void }) {
  return <ExtraModal title={label("Klavye kısayolları", "Keyboard shortcuts")} close={close}><div className="luna-extra web-keys">
    {KEYS.map(g => <section key={g.group[1]}><h4>{label(g.group[0], g.group[1])}</h4>{g.rows.map(([keys, tr, en]) => <div className="web-keys-row" key={keys}><span>{label(tr, en)}</span><span>{keys.split(" · ").map((k, i) => <kbd key={i}>{k}</kbd>)}</span></div>)}</section>)}
    <section><h4>{label("Adres çubuğunda siteye özel arama", "Site search from the address bar")}</h4><p className="web-keys-bangs">{BANGS.map(b => <span key={b.key} title={b.name}><b>!{b.key}</b> {b.name}</span>)}</p>
      <p className="web-history-note">{label("Örnek: !yt dune fragman · !w Ay · dune !lb", "Example: !yt dune trailer · !w Moon · dune !lb")}</p></section>
  </div></ExtraModal>;
}

/** Ctrl+Shift+Delete: Luna's own lists and, while a tab is open, the shared web profile's site data. */
export function ClearDataPanel({ canClearSite, clear, close }: {
  canClearSite: boolean; close: () => void;
  clear: (what: { history: "none" | "hour" | "today" | "all"; site: boolean; closed: boolean; downloads: boolean }) => Promise<string>;
}) {
  const [history, setHistory] = useState<"none" | "hour" | "today" | "all">("hour"), [site, setSite] = useState(false), [closed, setClosed] = useState(true), [downloads, setDownloads] = useState(true);
  const [busy, setBusy] = useState(false), [status, setStatus] = useState("");
  const nothing = history === "none" && !site && !closed && !downloads;
  return <ExtraModal title={label("Gezinme verilerini temizle", "Clear browsing data")} close={close}><div className="luna-extra web-clear">
    <label className="web-clear-row"><span><b>{label("Geçmiş", "History")}</b><small>{label("Luna Web'in yerel ziyaret listesi", "Luna Web's local list of visits")}</small></span>
      <select value={history} onChange={e => setHistory(e.target.value as typeof history)} aria-label={label("Geçmiş aralığı", "History range")}>
        <option value="none">{label("Silme", "Keep")}</option><option value="hour">{label("Son 1 saat", "Last hour")}</option><option value="today">{label("Bugün", "Today")}</option><option value="all">{label("Tüm zamanlar", "All time")}</option>
      </select></label>
    <label className="web-clear-row"><span><b>{label("Çerezler, önbellek ve site verileri", "Cookies, cache and site data")}</b><small>{canClearSite ? label("Sitelerden çıkış yapılır. Favoriler, notlar ve okuma listesi korunur.", "You are signed out of sites. Favourites, notes and the reading list are kept.") : label("Bunun için en az bir sekme açık olmalı.", "Open at least one tab to clear this.")}</small></span><input type="checkbox" disabled={!canClearSite} checked={site && canClearSite} onChange={e => setSite(e.target.checked)}/></label>
    <label className="web-clear-row"><span><b>{label("Son kapatılan sekmeler", "Recently closed tabs")}</b><small>{label("Bu oturumdaki geri açma listesi", "This session's reopen list")}</small></span><input type="checkbox" checked={closed} onChange={e => setClosed(e.target.checked)}/></label>
    <label className="web-clear-row"><span><b>{label("İndirme listesi", "Download list")}</b><small>{label("Yalnız liste; indirilen dosyalar silinmez", "Only the list; downloaded files stay")}</small></span><input type="checkbox" checked={downloads} onChange={e => setDownloads(e.target.checked)}/></label>
    <div className="extra-row"><button className="chip web-danger" disabled={busy || nothing} onClick={() => { setBusy(true); setStatus(""); void clear({ history, site: site && canClearSite, closed, downloads }).then(setStatus, e => setStatus(String(e?.message ?? e))).finally(() => setBusy(false)); }}>{busy ? label("Temizleniyor…", "Clearing…") : label("Temizle", "Clear")}</button><button className="chip" onClick={close}>{label("Kapat", "Close")}</button></div>
    {status && <div className="extra-status" role="status">{status}</div>}
  </div></ExtraModal>;
}

/** The find bar under the toolbar (no overlap with the page, so it never hides behind it). */
export function FindBar({ query, setQuery, result, matchCase, setMatchCase, step, close, busy }: {
  query: string; setQuery: (q: string) => void; result: { count: number; index: number; capped: boolean } | null; busy: boolean;
  matchCase: boolean; setMatchCase: (on: boolean) => void; step: (direction: 1 | -1) => void; close: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); input.current?.select(); }, []);
  const none = !!query.trim() && result && !busy && result.count === 0;
  return <div className={"web-find" + (none ? " is-none" : "")} role="search" aria-label={label("Sayfada bul", "Find in page")}>
    <WebIcon name="search" size={15}/>
    <input ref={input} value={query} maxLength={200} aria-label={label("Sayfada aranacak metin", "Text to find in page")} placeholder={label("Sayfada bul…", "Find in page…")} spellCheck={false}
      onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); step(e.shiftKey ? -1 : 1); } else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); } }}/>
    <output aria-live="polite">{!query.trim() ? "" : busy && !result ? "…" : result ? (result.count ? `${result.index}/${result.count}${result.capped ? "+" : ""}` : label("Bulunamadı", "No matches")) : ""}</output>
    <button className={"web-find-case" + (matchCase ? " on" : "")} aria-pressed={matchCase} title={label("Büyük/küçük harf duyarlı", "Match case")} onClick={() => setMatchCase(!matchCase)}>Aa</button>
    <button aria-label={label("Önceki eşleşme", "Previous match")} title="Shift+Enter" disabled={!result?.count} onClick={() => step(-1)}><WebIcon name="back" size={15}/></button>
    <button aria-label={label("Sonraki eşleşme", "Next match")} title="Enter" disabled={!result?.count} onClick={() => step(1)}><WebIcon name="forward" size={15}/></button>
    <button aria-label={label("Bul çubuğunu kapat", "Close find bar")} title="Esc" onClick={close}><WebIcon name="close" size={14}/></button>
  </div>;
}

export type TabMenuItem = { label: string; icon?: Parameters<typeof WebIcon>[0]["name"]; hint?: string; disabled?: boolean; run: () => void } | "sep";
/** Right-click menu of a tab (or any small menu): arrow keys, Enter and Esc work like a native menu. */
export function WebMenu({ x, y, items, close }: { x: number; y: number; items: TabMenuItem[]; close: () => void }) {
  const box = useRef<HTMLDivElement>(null), [pos, setPos] = useState({ x, y });
  useEffect(() => {
    const el = box.current; if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ x: Math.max(8, Math.min(x, innerWidth - r.width - 8)), y: Math.max(8, Math.min(y, innerHeight - r.height - 8)) });
    el.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    const outside = (e: PointerEvent) => { if (!el.contains(e.target as Node)) close(); };
    const blur = () => close();
    document.addEventListener("pointerdown", outside, true); window.addEventListener("blur", blur); window.addEventListener("resize", blur);
    return () => { document.removeEventListener("pointerdown", outside, true); window.removeEventListener("blur", blur); window.removeEventListener("resize", blur); };
  }, [x, y]);
  const keys = (e: ReactKeyboardEvent) => {
    const buttons = [...(box.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])], at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); buttons[(at + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus(); }
    else if (e.key === "Home" || e.key === "End") { e.preventDefault(); buttons[e.key === "Home" ? 0 : buttons.length - 1]?.focus(); }
    else if (e.key === "Tab") { e.preventDefault(); close(); }
  };
  return <div ref={box} className="browser-tab-menu" role="menu" style={{ left: pos.x, top: pos.y }} onKeyDown={keys} onContextMenu={e => e.preventDefault()}>
    {items.map((item, i) => item === "sep" ? <hr key={i}/> : <button key={i} role="menuitem" disabled={item.disabled} onClick={() => { close(); item.run(); }}>
      {item.icon ? <WebIcon name={item.icon} size={15}/> : <i/>}<span>{item.label}</span>{item.hint && <small>{item.hint}</small>}</button>)}
  </div>;
}

/** The address-bar drop-down: open tabs, favourites, history and the search itself. */
export function SuggestList({ items, active, pick, hover, remove }: { items: Suggestion[]; active: number; pick: (s: Suggestion) => void; hover: (i: number) => void; remove: (s: Suggestion) => void }) {
  if (!items.length) return null;
  const kindLabel = (s: Suggestion) => s.kind === "tab" ? label("Sekmeye geç", "Switch to tab") : s.kind === "bookmark" ? label("Favori", "Favourite") : s.kind === "history" ? label("Geçmiş", "History") : s.kind === "bang" ? label("Kısayol", "Shortcut") : "";
  return <div className="browser-suggest" role="listbox" id="browser-suggest" aria-label={label("Öneriler", "Suggestions")} onMouseDown={e => e.preventDefault()}>
    {items.map((s, i) => <div key={i + s.kind + ("url" in s ? s.url : s.title)} id={"browser-suggest-" + i} role="option" aria-selected={i === active} className={"browser-suggest-row is-" + s.kind + (i === active ? " on" : "")} onMouseEnter={() => hover(i)} onClick={() => pick(s)}>
      {"url" in s ? <SiteAvatar url={s.url} size={22}/> : <span className="browser-suggest-icon"><WebIcon name={s.kind === "bang" ? "spark" : "search"} size={14}/></span>}
      <span className="browser-suggest-text"><b>{s.title}</b>{"url" in s && <small>{s.url.replace(/^https?:\/\/(www\.)?/, "")}</small>}</span>
      {kindLabel(s) && <em>{kindLabel(s)}</em>}
      {s.kind === "history" && <button tabIndex={-1} className="browser-suggest-remove" aria-label={label("Geçmişten sil", "Remove from history")} title={label("Geçmişten sil · Shift+Delete", "Remove from history · Shift+Delete")} onClick={e => { e.stopPropagation(); remove(s); }}><WebIcon name="close" size={12}/></button>}
    </div>)}
  </div>;
}

/** Reading view: the page's own text in Luna's typography, with themes, size and reading aloud. */
export function ReaderView({ page, close, ask, copy, save }: {
  page: BrowserPage; close: () => void; ask: () => void; copy: (text: string) => void; save?: () => void;
}) {
  const [prefs, setPrefs] = useState<ReaderPrefs>(() => readReaderPrefs(localStorage.getItem(READER_KEY)));
  const blocks = useMemo(() => readerBlocks(page.text, page.title), [page]);
  const stats = useMemo(() => readingStats(page.text), [page]);
  const [speaking, setSpeaking] = useState<number | null>(null), [progress, setProgress] = useState(0);
  const speakingRef = useRef<number | null>(null);
  const body = useRef<HTMLDivElement>(null), panel = useRef<HTMLElement>(null);
  const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;
  const update = (patch: Partial<ReaderPrefs>) => setPrefs(p => { const next = { ...p, ...patch }; try { localStorage.setItem(READER_KEY, JSON.stringify(next)); } catch { /* full storage: keep for this view */ } return next; });
  const stopSpeaking = () => { speakingRef.current = null; if (canSpeak) speechSynthesis.cancel(); setSpeaking(null); };
  useEffect(() => () => { if (canSpeak) speechSynthesis.cancel(); }, []);
  useEffect(() => { panel.current?.focus(); }, []);
  const speakFrom = (start: number) => {
    if (!canSpeak) return;
    speechSynthesis.cancel();
    const say = (i: number) => {
      if (i >= blocks.length) { speakingRef.current = null; setSpeaking(null); return; }
      const b = blocks[i], text = b.kind === "row" ? b.cells.join(", ") : b.text;
      const u = new SpeechSynthesisUtterance(text);
      const want = (page.lang || (isTr() ? "tr" : "en")).toLowerCase().slice(0, 2);
      const voice = speechSynthesis.getVoices().find(v => v.lang.toLowerCase().startsWith(want));
      if (voice) u.voice = voice; u.lang = voice?.lang ?? want;
      // Only the paragraph still being read may hand over to the next one (cancel() also ends utterances).
      u.onend = () => { if (speakingRef.current === i) say(i + 1); };
      u.onerror = () => { if (speakingRef.current === i) { speakingRef.current = null; setSpeaking(null); } };
      speakingRef.current = i; setSpeaking(i);
      body.current?.querySelector(`[data-block="${i}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
      speechSynthesis.speak(u);
    };
    say(start);
  };
  const plain = readerPlainText(blocks);
  const render = (b: (typeof blocks)[number], i: number): ReactNode => {
    const on = speaking === i ? " is-speaking" : "";
    const props = { "data-block": i, onDoubleClick: () => { if (canSpeak) speakFrom(i); } };
    if (b.kind === "heading") { const H = (`h${Math.min(6, Math.max(2, b.level))}`) as "h2"; return <H key={i} {...props} className={on.trim() || undefined}>{b.text}</H>; }
    if (b.kind === "item") return <p key={i} {...props} className={"reader-item" + on}>{b.text}</p>;
    if (b.kind === "row") return <div key={i} {...props} className={"reader-row" + on}>{b.cells.map((c, j) => <span key={j}>{c}</span>)}</div>;
    return <p key={i} {...props} className={on.trim() || undefined}>{b.text}</p>;
  };
  return <section ref={panel} tabIndex={-1} className={`web-reader theme-${prefs.theme} font-${prefs.font} width-${prefs.width}`} role="dialog" aria-modal="true" aria-label={label("Okuma modu", "Reading view")}
    onKeyDown={e => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); stopSpeaking(); close(); } }}>
    <header className="web-reader-bar">
      <button className="web-reader-back" onClick={() => { stopSpeaking(); close(); }} title="Esc"><WebIcon name="back" size={15}/>{label("Sayfaya dön", "Back to page")}</button>
      <div className="web-reader-progress" aria-hidden="true"><i style={{ width: `${Math.round(progress * 100)}%` }}/></div>
      <div className="web-reader-tools" role="group" aria-label={label("Okuma ayarları", "Reading settings")}>
        <button aria-label={label("Yazıyı küçült", "Smaller text")} disabled={prefs.size <= 14} onClick={() => update({ size: prefs.size - 1 })}>A−</button>
        <button aria-label={label("Yazıyı büyüt", "Larger text")} disabled={prefs.size >= 28} onClick={() => update({ size: prefs.size + 1 })}>A+</button>
        <button aria-pressed={prefs.font === "sans"} title={label("Yazı tipi", "Typeface")} onClick={() => update({ font: prefs.font === "serif" ? "sans" : "serif" })}>{prefs.font === "serif" ? "Serif" : "Sans"}</button>
        <button title={label("Satır genişliği", "Line width")} onClick={() => update({ width: prefs.width === "narrow" ? "wide" : "narrow" })}>{prefs.width === "narrow" ? "↔" : "→←"}</button>
        {(["luna", "sepia", "paper", "night"] as const).map(t => <button key={t} className={"web-reader-swatch sw-" + t + (prefs.theme === t ? " on" : "")} aria-pressed={prefs.theme === t} aria-label={({ luna: "Luna", sepia: label("Sepya", "Sepia"), paper: label("Kâğıt", "Paper"), night: label("Gece", "Night") })[t]} title={({ luna: "Luna", sepia: label("Sepya", "Sepia"), paper: label("Kâğıt", "Paper"), night: label("Gece", "Night") })[t]} onClick={() => update({ theme: t })}/>)}
        {canSpeak && (speaking === null
          ? <button className="web-reader-speak" onClick={() => speakFrom(0)} title={label("Sesli oku · bir paragrafa çift tıkla: oradan başla", "Read aloud · double-click a paragraph to start there")}><WebIcon name="speaker" size={14}/>{label("Sesli oku", "Read aloud")}</button>
          : <button className="web-reader-speak on" onClick={stopSpeaking}><WebIcon name="close" size={13}/>{label("Durdur", "Stop")}</button>)}
      </div>
    </header>
    <div ref={body} className="web-reader-scroll" onScroll={e => { const el = e.currentTarget, max = el.scrollHeight - el.clientHeight; setProgress(max > 0 ? el.scrollTop / max : 1); }}>
      <article className="web-reader-article" style={{ fontSize: prefs.size }} lang={page.lang}>
        <p className="web-reader-meta"><SiteAvatar url={page.url} size={20}/><span>{hostLabel(page.url)}</span><span>·</span><span>{label(`${stats.minutes} dk okuma`, `${stats.minutes} min read`)}</span><span>·</span><span>{stats.words.toLocaleString(isTr() ? "tr-TR" : "en-GB")} {label("kelime", "words")}</span></p>
        <h1>{page.title || hostLabel(page.url)}</h1>
        {page.truncated && <p className="web-reader-cut">{label("Bu uzun sayfanın bir bölümü gösteriliyor.", "Only part of this long page is shown.")}</p>}
        {blocks.map(render)}
        <footer className="web-reader-end">
          <button className="chip" onClick={ask}><WebIcon name="spark" size={14}/>{label("Luna'ya sor", "Ask Luna")}</button>
          <button className="chip" onClick={() => copy(plain)}>{label("Metni kopyala", "Copy text")}</button>
          {save && <button className="chip" onClick={save}>{label("Okuma listeme ekle", "Add to reading queue")}</button>}
          <button className="chip" onClick={() => { stopSpeaking(); close(); }}>{label("Özgün sayfa", "Original page")}</button>
        </footer>
      </article>
    </div>
  </section>;
}
