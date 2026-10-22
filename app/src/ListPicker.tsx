import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { tt } from "./i18n";
import { createPlaylist, type Playlist } from "./Taste";

/** "+ Listeye": only the user's own lists ("Listelerim") and a new one; friends' lists are theirs and are never changed here. */
export function ListPicker({ lists, onPick, round, btnClass }: { lists: Playlist[]; onPick: (id: string) => Promise<unknown> | void; round?: boolean; btnClass?: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [naming, setNaming] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pos, setPos] = useState<React.CSSProperties>({});
  const box = useRef<HTMLDivElement>(null), menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node) && !menu.current?.contains(e.target as Node)) setOpen(false); };
    const gone = () => setOpen(false);
    window.addEventListener("resize", gone);
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); window.removeEventListener("resize", gone); };
  }, [open]);
  // drawn over the page (a card's poster would clip it), below the button or above it when there is no room
  useLayoutEffect(() => {
    if (!open || !box.current) return;
    const r = box.current.getBoundingClientRect();
    const w = Math.min(340, window.innerWidth - 32);
    const left = Math.max(16, Math.min(r.left, window.innerWidth - w - 16));
    // below the button when it fits, else on the side with more room; never taller than that room
    const below = window.innerHeight - r.bottom - 16, above = r.top - 16;
    setPos(below >= 380 || below >= above ? { left, top: r.bottom + 8, width: w, maxHeight: Math.min(380, below) } : { left, bottom: window.innerHeight - r.top + 8, width: w, maxHeight: Math.min(380, above) });
  }, [open]);

  // the same lists Öneriler shows under "Listelerim": not a friend's folder, not inside one
  const mine = lists.filter((p) => !p.parent && !lists.some((x) => x.parent === p.id));
  const needle = q.trim().toLocaleLowerCase();
  const hit = (p: Playlist) => !needle || p.name.toLocaleLowerCase().includes(needle);
  const pick = async (p: Playlist) => {
    await onPick(p.id);
    setDone(p.id);
    setTimeout(() => { setOpen(false); setDone(null); }, 700);
  };
  const row = (p: Playlist) => <button key={p.id} role="menuitem" className="lp-item" onClick={() => pick(p)}>
    <span>{p.name}</span><small>{done === p.id ? "✓ " + tt("Eklendi") : p.items.length}</small>
  </button>;

  return <div className="lp" ref={box}>
    {round
      ? <button className={"round" + (open ? " on" : "")} title={tt("Listeye ekle")} aria-label={tt("Listeye ekle")} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((x) => !x)}>+</button>
      : <button className={(btnClass ?? "lp-btn") + (open ? " on" : "")} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((x) => !x)}>{tt("+ Listeye")}<span aria-hidden>▾</span></button>}
    {open && createPortal(<div className="lp-menu" role="menu" ref={menu} style={pos} onWheel={(e) => e.stopPropagation()}>
      {naming === null
        ? <button role="menuitem" className="lp-item -new" onClick={() => setNaming("")}><span>{tt("+ Yeni liste oluştur")}</span></button>
        : <form className="lp-newf" onSubmit={(e) => { e.preventDefault(); const n = naming.trim(); if (!n) return; setNaming(null); pick(createPlaylist(n)); }}>
          <input className="lp-search" autoFocus value={naming} onChange={(e) => setNaming(e.target.value)} placeholder={tt("Listenin adı")} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setNaming(null); } }} />
          <button className="chip sm" type="submit" disabled={!naming.trim()}>{tt("Oluştur ve ekle")}</button>
        </form>}
      {mine.length > 8 && <input className="lp-search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={tt("Listelerde ara")} />}
      <div className="lp-head">{tt("Listelerim")}</div>
      {mine.filter(hit).map((p) => row(p))}
      {!mine.length && <div className="muted small lp-empty">{tt("Henüz listen yok; yukarıdan bir tane oluştur.")}</div>}
    </div>, document.body)}
  </div>;
}
