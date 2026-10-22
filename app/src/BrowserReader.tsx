import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { lang } from "./i18n";
import { BrowserIcon as WebIcon } from "./BrowserIcons";
import type { BrowserPage } from "./browserModel";
import { blockText, cleanReaderPrefs, findInBlocks, nextReaderSize, readerBlocks, readerOutline, readingStats, splitHighlights } from "./browserReaderContent";
import type { ReaderBlock, ReaderHit, ReaderPrefs } from "./browserReaderContent";
import { ttsActive, ttsStop } from "./ReadAloud";
import { musicPlaying, pauseMusic } from "./Music";

const RATES = [0.8, 1, 1.2, 1.5];
const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
/** The voice for the page's language (the Windows voices WebView2 offers), else the system default. */
function voiceFor(langTag: string): SpeechSynthesisVoice | null {
  try {
    const voices = window.speechSynthesis.getVoices(), want = (langTag || "").toLowerCase(), base = want.split("-")[0];
    return voices.find(v => v.lang.toLowerCase() === want) ?? voices.find(v => v.lang.toLowerCase().startsWith(base + "-") || v.lang.toLowerCase() === base) ?? null;
  } catch { return null; }
}

const label = (tr: string, en: string) => lang() === "tr" ? tr : en;
const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };
const THEMES: { id: ReaderPrefs["theme"]; tr: string; en: string }[] = [
  { id: "luna", tr: "Luna", en: "Luna" }, { id: "night", tr: "Gece", en: "Night" }, { id: "sepia", tr: "Sepya", en: "Sepia" }, { id: "paper", tr: "Kâğıt", en: "Paper" },
];

/**
 * A calm reading view of the open page, drawn by Luna from the text the page reader returned (no page script runs here,
 * no link is live). It is a dialog, so Browser.tsx hides the native page layer while it is open.
 */
export function BrowserReader({ page, onClose, onAsk, onCopy, onSave }: { page: BrowserPage; onClose: () => void; onAsk?: () => void; onCopy?: (text: string) => void; onSave?: () => void }) {
  const blocks = useMemo(() => readerBlocks(page.text), [page.text]);
  const stats = useMemo(() => readingStats(blocks), [blocks]);
  const outline = useMemo(() => readerOutline(blocks), [blocks]);
  const [prefs, setPrefs] = useState<ReaderPrefs>(() => { try { return cleanReaderPrefs(JSON.parse(localStorage.getItem("lunaWebReaderPrefs") || localStorage.getItem("lunaWebReader") || "null")); } catch { return cleanReaderPrefs(null); } });
  useEffect(() => { try { localStorage.setItem("lunaWebReaderPrefs", JSON.stringify(prefs)); } catch { /* the choice just is not kept */ } }, [prefs]);
  const [findOpen, setFindOpen] = useState(false), [query, setQuery] = useState(""), [at, setAt] = useState(0), [progress, setProgress] = useState(0);
  const hits = useMemo(() => (findOpen ? findInBlocks(blocks, query) : []), [blocks, query, findOpen]);
  const current = hits.length ? Math.min(at, hits.length - 1) : -1;
  const byBlock = useMemo(() => { const m = new Map<number, { first: number; hits: ReaderHit[] }>(); hits.forEach((h, i) => { const row = m.get(h.block); if (row) row.hits.push(h); else m.set(h.block, { first: i, hits: [h] }); }); return m; }, [hits]);
  const panel = useRef<HTMLElement>(null), scroller = useRef<HTMLDivElement>(null), findInput = useRef<HTMLInputElement>(null), listenButton = useRef<HTMLButtonElement>(null);
  // Listen: the page read aloud block by block with the system voices; the block being read is lit and kept in view.
  const [speakAt, setSpeakAt] = useState(-1), [paused, setPaused] = useState(false);
  const [rate, setRate] = useState(() => { try { const r = Number(localStorage.getItem("lunaWebReaderRate")); return RATES.includes(r) ? r : 1; } catch { return 1; } });
  const session = useRef(0), rateRef = useRef(rate); rateRef.current = rate;
  const speechLang = page.lang || (lang() === "tr" ? "tr-TR" : "en-US");
  function stopSpeaking() { session.current++; try { window.speechSynthesis.cancel(); } catch { /* nothing to stop */ } setSpeakAt(-1); setPaused(false); }
  function speakFrom(index: number) {
    if (!canSpeak()) return;
    if (ttsActive()) ttsStop(); // a book being read aloud gives way
    if (musicPlaying()) pauseMusic(true);
    const token = ++session.current;
    try { window.speechSynthesis.cancel(); window.speechSynthesis.resume(); /* a paused engine stays paused after cancel */ } catch { /* ignore */ }
    const next = (i: number, offset = 0) => {
      if (token !== session.current) return;
      while (i < blocks.length && !blockText(blocks[i]).trim()) i++;
      if (i >= blocks.length) { setSpeakAt(-1); setPaused(false); return; }
      const text = blockText(blocks[i]), chunk = text.slice(offset, offset + 4000);
      const u = new SpeechSynthesisUtterance(chunk);
      u.lang = speechLang; u.rate = rateRef.current; const v = voiceFor(speechLang); if (v) u.voice = v;
      u.onend = () => { if (offset + chunk.length < text.length) next(i, offset + chunk.length); else next(i + 1); };
      u.onerror = (e: SpeechSynthesisErrorEvent) => { if (token === session.current && e.error !== "interrupted" && e.error !== "canceled") { setSpeakAt(-1); setPaused(false); } };
      setSpeakAt(i); setPaused(false);
      window.speechSynthesis.speak(u);
    };
    next(Math.max(0, index));
  }
  /** Starts at the first block that is on screen, so "Listen" continues where the reader is looking. */
  function firstVisibleBlock(): number {
    const box = scroller.current?.getBoundingClientRect();
    if (!box) return 0;
    for (const el of Array.from(scroller.current!.querySelectorAll<HTMLElement>("[data-b]"))) { const r = el.getBoundingClientRect(); if (r.bottom > box.top + 8) return Number(el.dataset.b) || 0; }
    return 0;
  }
  function toggleSpeech() {
    if (speakAt < 0) { speakFrom(firstVisibleBlock()); return; }
    try { if (paused) { window.speechSynthesis.resume(); setPaused(false); } else { window.speechSynthesis.pause(); setPaused(true); } } catch { stopSpeaking(); }
  }
  useEffect(() => () => { session.current++; try { if (canSpeak()) window.speechSynthesis.cancel(); } catch { /* ignore */ } }, []);
  useEffect(() => { if (speakAt >= 0) scroller.current?.querySelector<HTMLElement>(`[data-b="${speakAt}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }); }, [speakAt]);
  useEffect(() => { try { localStorage.setItem("lunaWebReaderRate", String(rate)); } catch { /* not kept */ } }, [rate]);
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; scroller.current?.focus(); return () => { if (previous && previous !== document.body && previous.isConnected) previous.focus(); }; }, []);
  useEffect(() => { if (findOpen) requestAnimationFrame(() => { findInput.current?.focus(); findInput.current?.select(); }); }, [findOpen]);
  useEffect(() => { setAt(0); }, [query]);
  useEffect(() => { if (current >= 0) panel.current?.querySelector<HTMLElement>(`mark[data-hit="${current}"]`)?.scrollIntoView({ block: "center" }); }, [current, hits]);
  const move = (step: 1 | -1) => { if (hits.length) setAt(i => (Math.min(i, hits.length - 1) + step + hits.length) % hits.length); };
  const setSize = (direction: 1 | -1) => setPrefs(p => ({ ...p, size: nextReaderSize(p.size, direction) }));
  const closeFind = () => { setFindOpen(false); scroller.current?.focus(); };
  const keys = (e: { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; preventDefault(): void; stopPropagation(): void }) => {
    e.stopPropagation(); // the library's own shortcuts wait while the reading view has the keyboard
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if ((mod && k === "f") || e.key === "F3") {
      e.preventDefault();
      if (e.key === "F3" && findOpen) move(e.shiftKey ? -1 : 1);
      else if (findOpen) { findInput.current?.focus(); findInput.current?.select(); } else setFindOpen(true);
      return;
    }
    if (mod && (k === "+" || k === "=")) { e.preventDefault(); setSize(1); return; }
    if (mod && k === "-") { e.preventDefault(); setSize(-1); return; }
    if (e.key === "Escape" || e.key === "F9") { e.preventDefault(); if (findOpen && e.key === "Escape") closeFind(); else onClose(); return; }
    if (e.key === "Tab") {
      const nodes = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,[tabindex="0"]') ?? []);
      if (!nodes.length) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  // If the focused control disappears (a removed button) the keyboard falls to <body>: Esc, F9 and Ctrl+F must still reach the reader.
  const keysRef = useRef(keys); keysRef.current = keys;
  useEffect(() => {
    const onBody = (e: KeyboardEvent) => { const a = document.activeElement; if (a && a !== document.body) return; keysRef.current(e); };
    document.addEventListener("keydown", onBody); return () => document.removeEventListener("keydown", onBody);
  }, []);
  const marked = (text: string, list: ReaderHit[], first: number): ReactNode =>
    list.length ? splitHighlights(text, list, first).map((part, i) => part.hit === null ? <span key={i}>{part.text}</span> : <mark key={i} data-hit={part.hit} className={part.hit === current ? "on" : undefined}>{part.text}</mark>) : text;
  const textOf = (index: number, text: string) => { const row = byBlock.get(index); return row ? marked(text, row.hits, row.first) : text; };
  const cellsOf = (index: number, cells: string[]) => {
    const row = byBlock.get(index); let offset = 0;
    return cells.map((cell, c) => {
      const from = offset; offset += cell.length + 2;
      if (!row) return <td key={c}>{cell}</td>;
      const inside = row.hits.filter(h => h.start >= from && h.end <= from + cell.length);
      const first = inside.length ? row.first + row.hits.indexOf(inside[0]) : 0;
      return <td key={c}>{marked(cell, inside.map(h => ({ ...h, start: h.start - from, end: h.end - from })), first)}</td>;
    });
  };
  const body: ReactNode[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b: ReaderBlock = blocks[i];
    if (b.kind === "li") {
      const items: ReactNode[] = [];
      for (; i < blocks.length && blocks[i].kind === "li"; i++) items.push(<li key={i} data-b={i} className={speakAt === i ? "speaking" : undefined}>{textOf(i, blockText(blocks[i]))}</li>);
      i--; body.push(<ul key={"ul" + i}>{items}</ul>);
    } else if (b.kind === "row") {
      const rows: ReactNode[] = [];
      for (; i < blocks.length && blocks[i].kind === "row"; i++) { const r = blocks[i]; if (r.kind === "row") rows.push(<tr key={i} data-b={i} className={speakAt === i ? "speaking" : undefined}>{cellsOf(i, r.cells)}</tr>); }
      i--; body.push(<div className="reader-table" key={"t" + i}><table><tbody>{rows}</tbody></table></div>);
    } else if (b.kind === "h") {
      const Tag = ("h" + Math.min(6, b.level + 1)) as "h2" | "h3" | "h4" | "h5" | "h6";
      body.push(<Tag key={i} id={b.id} data-b={i} className={"rh rh-" + b.level + (speakAt === i ? " speaking" : "")}>{textOf(i, b.text)}</Tag>);
    } else body.push(<p key={i} data-b={i} className={speakAt === i ? "speaking" : undefined}>{textOf(i, b.text)}</p>);
  }
  const first = blocks[0], titleIsFirst = !!first && first.kind === "h" && first.level === 1 && (page.title || "").includes(first.text);
  return <section ref={panel} className={"browser-reader reader-" + prefs.theme + (prefs.font === "sans" ? " reader-sans" : "") + (prefs.width === "wide" ? " reader-wide" : "")}
    role="dialog" aria-modal="true" aria-label={label("Okuma görünümü", "Reading view")} onKeyDown={keys} style={{ "--reader-size": prefs.size + "px" } as CSSProperties}>
    <div className="reader-progress" style={{ transform: `scaleX(${progress})` }} aria-hidden="true"/>
    <header className="reader-bar">
      <div className="reader-source"><WebIcon name="book" size={17}/><span><b>{label("Okuma görünümü", "Reading view")}</b>
        <small>{hostOf(page.url)} · {label(`${stats.minutes} dk okuma`, `${stats.minutes} min read`)} · {label(`${stats.words.toLocaleString("tr-TR")} kelime`, `${stats.words.toLocaleString("en-US")} words`)}</small></span></div>
      <div className="reader-tools">
        <div className="reader-themes" role="group" aria-label={label("Tema", "Theme")}>{THEMES.map(t => <button key={t.id} className={"reader-swatch sw-" + t.id + (prefs.theme === t.id ? " on" : "")} aria-pressed={prefs.theme === t.id} aria-label={label(t.tr, t.en)} title={label(t.tr, t.en)} onClick={() => setPrefs(p => ({ ...p, theme: t.id }))}/>)}</div>
        <button aria-label={label("Yazıyı küçült", "Smaller text")} title="Ctrl −" onClick={() => setSize(-1)}>A−</button><output aria-label={label("Yazı boyutu", "Text size")}>{prefs.size}</output>
        <button aria-label={label("Yazıyı büyüt", "Larger text")} title="Ctrl +" onClick={() => setSize(1)}>A+</button>
        <button aria-pressed={prefs.font === "sans"} title={label("Yazı tipi", "Typeface")} onClick={() => setPrefs(p => ({ ...p, font: p.font === "serif" ? "sans" : "serif" }))}>{prefs.font === "serif" ? "Serif" : "Sans"}</button>
        <button aria-pressed={prefs.width === "wide"} title={label("Sayfa genişliği", "Page width")} onClick={() => setPrefs(p => ({ ...p, width: p.width === "wide" ? "narrow" : "wide" }))}>{prefs.width === "wide" ? label("Geniş", "Wide") : label("Dar", "Narrow")}</button>
        {canSpeak() && blocks.length > 0 && <span className={"reader-listen" + (speakAt >= 0 ? " on" : "")} role="group" aria-label={label("Sesli dinle", "Listen")}>
          <button ref={listenButton} className="reader-listen-main" aria-pressed={speakAt >= 0 && !paused} title={label("Sesli dinle (ekrandaki yerden başlar)", "Listen (starts where you are)")} onClick={toggleSpeech}><WebIcon name="speaker" size={15}/>{speakAt < 0 ? label("Dinle", "Listen") : paused ? label("Sürdür", "Resume") : label("Duraklat", "Pause")}</button>
          {speakAt >= 0 && <button aria-label={label("Dinlemeyi durdur", "Stop listening")} title={label("Durdur", "Stop")} onClick={() => { stopSpeaking(); listenButton.current?.focus(); }}><WebIcon name="close" size={13}/></button>}
          <select aria-label={label("Okuma hızı", "Reading speed")} value={rate} onChange={e => { const r = Number(e.target.value); rateRef.current = r; setRate(r); if (speakAt >= 0) speakFrom(speakAt); }}>{RATES.map(r => <option key={r} value={r}>{r.toLocaleString(lang() === "tr" ? "tr-TR" : "en-US")}×</option>)}</select>
        </span>}
        <button aria-pressed={findOpen} aria-label={label("Sayfada ara", "Find in page")} title="Ctrl+F" onClick={() => (findOpen ? closeFind() : setFindOpen(true))}><WebIcon name="search" size={15}/></button>
        {onCopy && <button title={label("Metni kopyala", "Copy the text")} onClick={() => onCopy([page.title, ...blocks.map(blockText)].filter(Boolean).join("\n\n"))}>{label("Kopyala", "Copy")}</button>}
        {onSave && <button onClick={onSave}><WebIcon name="book" size={15}/>{label("Sonra oku", "Read later")}</button>}
        {onAsk && <button className="reader-ask" onClick={onAsk}><WebIcon name="spark" size={15}/>{label("Asistana sor", "Ask Luna")}</button>}
        <button className="reader-close" aria-label={label("Okuma görünümünü kapat", "Close reading view")} title="Esc · F9" onClick={onClose}><WebIcon name="close" size={16}/></button>
      </div>
    </header>
    {findOpen && <div className="reader-find" role="search"><WebIcon name="search" size={14}/>
      <input ref={findInput} value={query} aria-label={label("Okuma görünümünde ara", "Find in reading view")} placeholder={label("Sayfada ara…", "Find in page…")} spellCheck={false}
        onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); move(e.shiftKey ? -1 : 1); } else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeFind(); } }}/>
      <output aria-live="polite">{query.trim() ? (hits.length ? `${current + 1} / ${hits.length}` : label("Bulunamadı", "No matches")) : ""}</output>
      <button aria-label={label("Önceki", "Previous")} title="Shift+Enter" disabled={!hits.length} onClick={() => move(-1)}><WebIcon name="back" size={15}/></button>
      <button aria-label={label("Sonraki", "Next")} title="Enter" disabled={!hits.length} onClick={() => move(1)}><WebIcon name="forward" size={15}/></button>
      <button aria-label={label("Aramayı kapat", "Close search")} onClick={closeFind}><WebIcon name="close" size={14}/></button></div>}
    <div className="reader-scroll" ref={scroller} tabIndex={-1} onScroll={e => { const el = e.currentTarget, room = el.scrollHeight - el.clientHeight; setProgress(room > 0 ? Math.min(1, el.scrollTop / room) : 1); }}>
      {outline.length >= 3 && <nav className="reader-toc" aria-label={label("İçindekiler", "Contents")}><b>{label("İçindekiler", "Contents")}</b>
        {outline.map(o => <button key={o.id} className={"lvl-" + o.level} onClick={() => scroller.current?.querySelector<HTMLElement>("#" + o.id)?.scrollIntoView({ block: "start" })}>{o.text}</button>)}</nav>}
      <article className="reader-article" lang={page.lang}>
        {titleIsFirst ? body[0] : <h1 className="reader-title">{page.title || hostOf(page.url)}</h1>}
        <p className="reader-url">{page.url}</p>
        {blocks.length ? (titleIsFirst ? body.slice(1) : body) : <p className="reader-note">{label("Bu sayfada okunabilir metin bulunamadı.", "No readable text was found on this page.")}</p>}
        {page.truncated && <p className="reader-note">{label("Sayfa uzun olduğu için yalnız bir bölümü gösteriliyor.", "This page is long, so only part of it is shown.")}</p>}
        {page.loading && <p className="reader-note">{label("Sayfa tam yüklenmeden okundu; eksik bölümler olabilir.", "The page was read before it finished loading; parts may be missing.")}</p>}
      </article>
    </div>
  </section>;
}
