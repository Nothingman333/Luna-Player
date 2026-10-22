import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { lang } from "./i18n";
import { BrowserIcon as WebIcon } from "./BrowserIcons";
import { ExtraModal } from "./Extras";
import { historyGroups, hostKey, siteHue } from "./browserStartModel";
import type { RecentVisit } from "./browserSuggest";

const label = (tr: string, en: string) => (lang() === "tr" ? tr : en);

/**
 * Luna Web's history (Ctrl+H): every remembered visit grouped by day, with a search that ignores accents and case.
 * A row opens the page; the × forgets it. Everything is local (localStorage "lunaWebRecent").
 */
export function BrowserHistory({ rows, remember, onOpen, onForget, onClear, close }: {
  rows: RecentVisit[]; remember: boolean; onOpen: (url: string) => void; onForget: (url: string) => void; onClear: () => void; close: () => void;
}) {
  const [query, setQuery] = useState(""), [confirm, setConfirm] = useState(false), search = useRef<HTMLInputElement>(null);
  // A removed row or the confirm buttons take the keyboard with them: it goes back to the search box (so Esc still closes).
  const refocus = () => requestAnimationFrame(() => search.current?.focus());
  // Until that happens the keyboard is on <body> (the clicked button is gone): Esc must still close the panel.
  useEffect(() => {
    const onBody = (e: KeyboardEvent) => { const a = document.activeElement; if (e.key === "Escape" && (!a || a === document.body)) { e.preventDefault(); close(); } };
    document.addEventListener("keydown", onBody); return () => document.removeEventListener("keydown", onBody);
  }, [close]);
  const tr = lang() === "tr", now = Date.now();
  const groups = useMemo(() => historyGroups(rows, now, tr, query), [rows, query, tr]);
  const shown = groups.reduce((n, g) => n + g.rows.length, 0);
  const time = (at: number) => new Date(at).toLocaleTimeString(tr ? "tr-TR" : "en-GB", { hour: "2-digit", minute: "2-digit" });
  return <ExtraModal title={label("Geçmiş", "History")} close={close}><div className="luna-extra browser-history">
    <div className="browser-history-bar">
      <label className="browser-history-search"><WebIcon name="search" size={15}/><input ref={search} value={query} onChange={e => setQuery(e.target.value)} aria-label={label("Geçmişte ara", "Search history")} placeholder={label("Başlık ya da adres ara…", "Search titles or addresses…")} spellCheck={false}/></label>
      <span className="browser-history-count" aria-live="polite">{query.trim() ? label(`${shown} sonuç`, `${shown} found`) : label(`${rows.length} sayfa`, `${rows.length} pages`)}</span>
      {confirm
        ? <span className="browser-history-confirm"><button className="danger" onClick={() => { onClear(); setConfirm(false); refocus(); }}>{label("Evet, hepsini sil", "Yes, delete all")}</button><button onClick={() => { setConfirm(false); refocus(); }}>{label("Vazgeç", "Cancel")}</button></span>
        : <button className="browser-history-clear" disabled={!rows.length} onClick={() => setConfirm(true)}><WebIcon name="trash" size={14}/>{label("Geçmişi temizle", "Clear history")}</button>}
    </div>
    {!remember && <p className="browser-history-note">{label("Son ziyaretleri hatırlama kapalı; yeni sayfalar buraya eklenmiyor (Araçlar menüsünden açabilirsin).", "Remembering recent visits is off, so new pages are not added (turn it on in the Tools menu).")}</p>}
    <div className="browser-history-list">
      {groups.map(g => <section key={g.key} aria-label={g.label}><h4>{g.label}<small>{g.rows.length}</small></h4>
        {g.rows.map(r => { const host = hostKey(r.url); return <div className="browser-history-row" key={r.url}>
          <span className="bh-time">{time(r.at)}</span>
          <button className="bh-open" onClick={() => onOpen(r.url)} title={r.url}>
            <span className="bh-letter" style={{ "--site-hue": siteHue(host) } as CSSProperties}>{(r.title || host).charAt(0).toLocaleUpperCase()}</span>
            <span className="bh-text"><b>{r.title}</b><small>{host}{r.visits > 1 ? " · " + label(`${r.visits} ziyaret`, `${r.visits} visits`) : ""}</small></span>
          </button>
          <button className="bh-forget" aria-label={label(r.title + " geçmişten kaldır", "Remove " + r.title + " from history")} onClick={() => { onForget(r.url); refocus(); }}><WebIcon name="close" size={13}/></button>
        </div>; })}
      </section>)}
      {!shown && <p className="browser-history-empty"><WebIcon name="clock" size={26}/><span>{query.trim() ? label("Bu aramayla eşleşen sayfa yok.", "No page matches this search.") : label("Henüz geçmiş yok. Ziyaret ettiğin sayfalar burada gün gün listelenir.", "No history yet. Pages you visit are listed here, day by day.")}</span></p>}
    </div>
  </div></ExtraModal>;
}
