import { moonPhase, moonPath } from "./browserStartModel";
import { useEffect, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { BrowserIcon as WebIcon } from "./BrowserIcons";
import { label, SiteAvatar } from "./BrowserPanels";
import { greeting, hostLabel } from "./browserHistoryModel";
import type { TopSite } from "./browserHistoryModel";
import { BANGS, SEARCH_ENGINES } from "./browserSearchModel";
import type { SearchEngine, SearchEngineId } from "./browserSearchModel";
import type { SavedWebTab } from "./browserWorkspaceModel";
import type { WebReading } from "./extrasModel";
import { lang } from "./i18n";

export const SHORTCUTS = [
  { name: "YouTube", url: "https://www.youtube.com/", style: "youtube", mark: "play", tr: "İzle & dinle", en: "Watch & listen" },
  { name: "Letterboxd", url: "https://letterboxd.com/", style: "letterboxd", mark: "dots", tr: "Film dünyana göz at", en: "Your world of film" },
  { name: "TMDB", url: "https://www.themoviedb.org/", style: "tmdb", mark: "tm", tr: "Sıradaki filmini keşfet", en: "Find your next film" },
  { name: "Wikipedia", url: "https://www.wikipedia.org/", style: "wikipedia", mark: "W", tr: "Merakının peşinden git", en: "Follow your curiosity" },
];
const HINTS = ["yt", "w", "lb", "1000k", "imdb"];

export function BrowserStart(props: {
  query: string; setQuery: (q: string) => void; submit: () => void; onKeyDown: (e: ReactKeyboardEvent<HTMLInputElement>) => void;
  onFocusChange: (focused: boolean) => void; suggest: ReactNode; suggestOpen: boolean; activeOption: number;
  engine: SearchEngine; setEngine: (id: SearchEngineId) => void; creating: boolean; go: (url: string) => void;
  topSites: TopSite[]; hideSite: (host: string) => void;
  bookmarks: SavedWebTab[]; addBookmark: (title: string, url: string) => boolean; removeBookmark: (url: string) => void;
  restore: SavedWebTab[]; restoreSession: () => void; dismissRestore: () => void; capacity: number;
  reading: WebReading[]; openReading: (url: string, progress: number) => void;
  closed: SavedWebTab[]; reopen: (index: number) => void;
  historyPaused: boolean; openHistory: () => void; openClear: () => void; onAssistant?: () => void;
}) {
  const tr = lang() === "tr";
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = window.setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(id); }, []);
  const [form, setForm] = useState(false), [title, setTitle] = useState(""), [url, setUrl] = useState("");
  const when = now.toLocaleDateString(tr ? "tr-TR" : "en-GB", { weekday: "long", day: "numeric", month: "long" });
  const moon = moonPhase(now.getTime());
  const clock = now.toLocaleTimeString(tr ? "tr-TR" : "en-GB", { hour: "2-digit", minute: "2-digit" });
  const queue = props.reading.filter(r => !r.done).slice(0, 3);
  return <div className="browser-start-page"><div className="browser-start-content">
    <div className="browser-start-topline"><span><span className="browser-live-dot"/>LUNA WEB</span><span className="browser-start-clock"><b>{clock}</b>{when}</span></div>
    <div className="browser-start-hero"><div className="browser-start-copy"><p className="browser-start-greeting">{greeting(now.getHours(), tr)} <span aria-hidden="true">✦</span></p><h1>{label("Biraz merak.", "A little curiosity.")}<br/><span>{label("Yeni dünyalar.", "A whole new world.")}</span></h1><p>{label("Sevdiğin siteler, yeni keşifler ve yanında Luna.", "Your favourite places. Your next discovery. Luna by your side.")}</p></div><div className="browser-start-art" aria-hidden="true"><div className="web-art-ring ring-one"/><div className="web-art-ring ring-two"/><div className="web-art-orbit"><i/></div><span className="web-art-star star-one">✦</span><span className="web-art-star star-two">+</span><span className="web-art-star star-three">·</span><svg className="web-art-moon web-phase-moon" viewBox="0 0 160 160" aria-label={tr ? moon.tr : moon.en}><circle cx="80" cy="80" r="66" fill="#282125"/><path d={moonPath(moon.phase,80,80,66)} fill="#f5cfb2"/></svg><span className="web-art-coordinate">{tr ? moon.tr : moon.en}</span></div></div>
    <div className="browser-start-search-wrap">
      <form className="browser-start-search" role="search" onSubmit={e => { e.preventDefault(); props.submit(); }}>
        <label className="browser-engine-pick" title={label("Arama motoru", "Search engine")}><span className="browser-engine-mark">{props.engine.mark}</span><select aria-label={label("Arama motoru", "Search engine")} value={props.engine.id} onChange={e => props.setEngine(e.target.value as SearchEngineId)}>{props.engine.id==="custom"&&<option value="custom">{label("Özel arama","Custom search")}</option>}{SEARCH_ENGINES.map(en => <option key={en.id} value={en.id}>{en.name}</option>)}</select></label>
        <input aria-label={label("Başlangıç sayfasında ara", "Search from start page")} placeholder={label(`${props.engine.name} ile ara ya da adres yaz…`, `Search ${props.engine.name} or type an address…`)} value={props.query}
          onChange={e => props.setQuery(e.target.value)} onKeyDown={props.onKeyDown} onFocus={() => props.onFocusChange(true)} onBlur={() => props.onFocusChange(false)}
          autoComplete="off" spellCheck={false} role="combobox" aria-expanded={props.suggestOpen} aria-controls="browser-suggest" aria-activedescendant={props.suggestOpen && props.activeOption >= 0 ? "browser-suggest-" + props.activeOption : undefined}/>
        <button type="submit" disabled={props.creating}>{label("Keşfet", "Explore")}<WebIcon name="arrow" size={17}/></button>
      </form>
      {props.suggest}
    </div>
    <div className="browser-bang-hints" aria-label={label("Hızlı arama kısayolları", "Quick search shortcuts")}><span>{label("Kısayollar:", "Shortcuts:")}</span>{HINTS.map(key => { const b = BANGS.find(x => x.key === key)!; return <button key={key} type="button" title={label(`${b.name} içinde ara`, `Search ${b.name}`)} onClick={() => { props.setQuery("!" + key + " "); requestAnimationFrame(() => document.querySelector<HTMLInputElement>(".browser-start-search input")?.focus()); }}><b>!{key}</b> {b.name}</button>; })}</div>

    {props.restore.length > 0 && <div className="browser-restore" role="region" aria-label={label("Önceki oturum", "Previous session")}>
      <span className="browser-restore-icon"><WebIcon name="reload" size={18}/></span>
      <div><b>{label("Kaldığın yerden devam et", "Pick up where you left off")}</b><small>{props.restore.slice(0, 3).map(t => t.title).join(" · ")}{props.restore.length > 3 ? label(` ve ${props.restore.length - 3} sekme daha`, ` and ${props.restore.length - 3} more`) : ""}</small></div>
      <button className="browser-restore-go" disabled={props.creating || props.capacity <= 0} onClick={props.restoreSession}>{label(`${props.restore.length} sekmeyi aç`, `Open ${props.restore.length} tabs`)}</button>
      <button className="browser-restore-x" aria-label={label("Önceki oturumu unut", "Forget previous session")} onClick={props.dismissRestore}><WebIcon name="close" size={14}/></button>
    </div>}

    {props.topSites.length > 0 && <>
      <div className="browser-section-heading"><h2>{label("Sık uğradıkların", "Your frequent places")}</h2><span>{label("Geçmişinden, yalnız bu bilgisayarda", "From your history, on this computer only")}</span></div>
      <div className="browser-top-sites">{props.topSites.map(site => <div className="browser-top-site" key={site.host}>
        <button disabled={props.creating} title={site.title + "\n" + site.url} onClick={() => props.go(site.url)}><SiteAvatar url={site.url} size={40}/><strong>{site.host}</strong><small>{site.title}</small></button>
        <button className="browser-top-hide" aria-label={label(site.host + " kutucuğunu gizle", "Hide " + site.host)} title={label("Bu siteyi burada gösterme", "Don't show this site here")} onClick={() => props.hideSite(site.host)}><WebIcon name="close" size={11}/></button>
      </div>)}</div>
    </>}

    <div className="browser-section-heading"><h2>{label("Bir tık uzağında", "One click away")}</h2><span>{label("Küçük bir başlangıç noktası", "A few good places to start")}</span></div>
    <div className="browser-destinations">{SHORTCUTS.map(site => <button className={"browser-destination " + site.style} key={site.name} disabled={props.creating} onClick={() => props.go(site.url)}><span className="destination-arrow"><WebIcon name="external" size={14}/></span><span className="destination-mark">{site.mark === "play" ? <svg width="29" height="24" viewBox="0 0 29 24" aria-hidden="true"><rect x="0" y="2" width="29" height="20" rx="6" fill="currentColor"/><path d="m12 8 7 4-7 4Z" fill="#201316"/></svg> : site.mark === "dots" ? <span className="letterboxd-dots"><i/><i/><i/></span> : site.mark === "tm" ? <b>TM<span>DB</span></b> : <span className="wiki-w">W</span>}</span><strong>{site.name}</strong><small>{label(site.tr, site.en)}</small></button>)}</div>

    {queue.length > 0 && <>
      <div className="browser-section-heading"><h2>{label("Okumaya devam et", "Continue reading")}</h2><span>{label("Okuma listenden", "From your reading queue")}</span></div>
      <div className="browser-continue">{queue.map(r => <button key={r.url} disabled={props.creating} title={r.url} onClick={() => props.openReading(r.url, r.progress)}>
        <SiteAvatar url={r.url} size={30}/><span><strong>{r.title}</strong><small>{hostLabel(r.url)} · {Math.round(r.progress * 100)}%</small></span>
        <i className="browser-continue-bar" aria-hidden="true"><i style={{ width: `${Math.max(3, Math.round(r.progress * 100))}%` }}/></i>
      </button>)}</div>
    </>}

    <div className="browser-lower-grid"><section className="browser-saved-section"><div className="browser-section-heading"><h2>{label("Senin köşen", "Your corner")}</h2><button onClick={() => setForm(v => !v)}><WebIcon name="plus" size={13}/>{label("Site ekle", "Add a site")}</button></div>
      {form && <form className="browser-shortcut-form" onSubmit={e => { e.preventDefault(); if (props.addBookmark(title, url)) { setForm(false); setTitle(""); setUrl(""); } }}><input aria-label={label("Kısayol adı", "Shortcut name")} placeholder={label("Site adı", "Site name")} value={title} onChange={e => setTitle(e.target.value)}/><input aria-label={label("Kısayol adresi", "Shortcut address")} placeholder="https://…" value={url} onChange={e => setUrl(e.target.value)} required/><button type="submit">{label("Ekle", "Add")}</button></form>}
      <div className="browser-saved-list">{props.bookmarks.length ? props.bookmarks.slice(0, 8).map(b => <div className="browser-saved-item" key={b.url}><button onClick={() => props.go(b.url)}><SiteAvatar url={b.url} size={34}/><span><strong>{b.title}</strong><small>{hostLabel(b.url)}</small></span><WebIcon name="arrow" size={15}/></button><button className="saved-remove" aria-label={label(b.title + " kısayolunu kaldır", "Remove " + b.title)} onClick={() => props.removeBookmark(b.url)}><WebIcon name="close" size={13}/></button></div>) : <button className="browser-saved-empty" onClick={() => setForm(true)}><span className="saved-site-icon"><WebIcon name="star" size={19}/></span><span><strong>{label("Hep döndüğün yerleri buraya ekle.", "Keep your favourite places close.")}</strong><small>{label("Kendi sitelerin, kendi düzenin. Ctrl+D açık sayfayı ekler.", "Your sites, arranged your way. Ctrl+D adds the open page.")}</small></span><WebIcon name="plus" size={16}/></button>}</div>
      {props.closed.length > 0 && <div className="browser-closed-chips"><span>{label("Son kapatılanlar", "Recently closed")}</span>{props.closed.slice(0, 4).map((t, i) => <button key={i + t.url} disabled={props.creating || props.capacity <= 0} title={t.url} onClick={() => props.reopen(i)}><SiteAvatar url={t.url} size={16} icon={false}/>{t.title}</button>)}</div>}
    </section><aside className="browser-assistant-card"><div className="browser-assistant-title"><span><WebIcon name="spark" size={18}/></span><b>Luna Asistan</b><small>{label("YANINDA", "BY YOUR SIDE")}</small></div><p>{label("Bir sayfa aç; özetleyelim, çevirelim, birlikte okuyalım. Video sayfalarını tek tıkla Luna'da oynat.", "Open a page; summarise it, translate it, read it together. Play video pages in Luna with one click.")}</p><div className="browser-assistant-prompts"><button onClick={props.onAssistant}>{label("Bu sayfayı özetle", "Summarize this page")}<WebIcon name="arrow" size={13}/></button><button onClick={props.onAssistant}>{label("Türkçeye çevir", "Translate this page")}<WebIcon name="translate" size={13}/></button></div><small>{label("Sağ alttaki Luna’ya tıkla ve sayfa hakkında sor. Okuma modu: Ctrl+Shift+R.", "Ask about the page using Luna in the bottom-right corner. Reading view: Ctrl+Shift+R.")}</small></aside></div>

    <footer className="browser-start-footer">
      <span><i className={"browser-history-dot" + (props.historyPaused ? " off" : "")}/>{props.historyPaused ? label("Geçmiş kaydı kapalı", "History is paused") : label("Geçmiş yalnız bu bilgisayarda tutulur", "History stays on this computer")}</span>
      <button onClick={props.openHistory}>{label("Geçmiş", "History")} <kbd>Ctrl H</kbd></button>
      <button onClick={props.openClear}>{label("Verileri temizle", "Clear data")}</button>
    </footer>
  </div></div>;
}
