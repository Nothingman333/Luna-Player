import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "./nativeCore";
import { tt, lang } from "./i18n";
import { isRemote, isUrl, Item } from "./library";
import { fmtTime } from "./mpv";
import { parseSubtitle } from "./subtitleModel";
import { Entry, Hit, indexFilm, searchIndex, segments } from "./lineSearchModel";

// what was read stays in memory for the session, so reopening the search is instant
const cache = new Map<string, Entry>();
const LIMIT = 2000;

type Film = { path: string; title: string };
const filmsOf = (items: Item[]): Film[] =>
  items.flatMap((it) => {
    const base = it.meta?.title ?? it.parsed.title;
    return it.files.filter((f) => !isUrl(f.path) && !isRemote(f.path)).map((f) => ({ path: f.path, title: f.season != null ? `${base} · S${f.season}B${f.episode ?? "?"}` : base }));
  }).slice(0, LIMIT);

/** Ctrl+K › "Replik ara": type what was said, get the films and moments where it is said. Reads the subtitle files that sit beside the films. */
export function LineSearch({ items, onClose }: { items: Item[]; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [prog, setProg] = useState({ done: 0, total: 0, found: 0, working: true });
  const [at, setAt] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const live = useRef<Entry[]>([]);
  useEffect(() => {
    let alive = true;
    const films = filmsOf(items);
    (async () => {
      const subs: (string | null)[] = [];
      for (let i = 0; i < films.length; i += 400) {
        const part = await invoke<(string | null)[]>("library_subtitles", { paths: films.slice(i, i + 400).map((f) => f.path), lang: lang() }).catch(() => films.slice(i, i + 400).map(() => null));
        subs.push(...part);
      }
      const todo = films.map((f, i) => ({ f, sub: subs[i] })).filter((x): x is { f: Film; sub: string } => !!x.sub);
      if (!alive) return;
      setProg({ done: 0, total: todo.length, found: 0, working: todo.length > 0 });
      let done = 0, next = 0;
      const flush = () => { if (alive) { setEntries(live.current.slice()); setProg({ done, total: todo.length, found: live.current.length, working: done < todo.length }); } };
      let last = 0;
      const worker = async () => {
        for (;;) {
          const i = next++;
          if (i >= todo.length || !alive) return;
          const { f, sub } = todo[i];
          let e = cache.get(f.path + "|" + sub);
          if (!e) {
            try { e = indexFilm(f.path, f.title, parseSubtitle(await invoke<string>("subtitle_text", { file: sub }))); cache.set(f.path + "|" + sub, e); } catch { e = undefined; }
          } else e = { ...e, title: f.title };
          done++;
          if (e && e.lines.length) live.current.push(e);
          if (Date.now() - last > 300) { last = Date.now(); flush(); }
        }
      };
      await Promise.all([worker(), worker(), worker(), worker()]);
      flush();
    })();
    return () => { alive = false; };
  }, []);
  const hits = useMemo<Hit[]>(() => searchIndex(entries, deferred), [entries, deferred]);
  useEffect(() => setAt(0), [deferred]);
  useEffect(() => { list.current?.querySelector<HTMLElement>(`[data-i="${at}"]`)?.scrollIntoView({ block: "nearest" }); }, [at]);
  const open = (h: Hit | undefined) => {
    if (!h) return;
    onClose();
    window.dispatchEvent(new CustomEvent("luna-open-note", { detail: { path: h.path, time: Math.max(0, h.start - 2) } }));
  };
  const key = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setAt((a) => Math.min(hits.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setAt((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); open(hits[at]); }
  };
  const q = deferred.trim();
  return createPortal(
    <div className="qc-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ls glass" role="dialog" aria-modal="true" aria-label={tt("Replik ara")} onKeyDown={key}>
        <div className="ls-head">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></svg>
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tt("Hangi sahnede… ne denildi?")} aria-label={tt("Replik ara")} spellCheck={false} />
          <button className="rc-icon" onClick={onClose} aria-label={tt("Kapat")}>×</button>
        </div>
        <div className="ls-state" role="status">
          {prog.working
            ? <><span>{tt("Altyazılar okunuyor… {0}/{1}", prog.done, prog.total)}</span><i style={{ width: (prog.total ? (prog.done / prog.total) * 100 : 0) + "%" }} /></>
            : prog.total === 0
              ? tt("Filmlerinin yanında altyazı dosyası bulunamadı. Altyazı stüdyosundan Whisper ile üretebilir ya da altyazı indirebilirsin.")
              : tt("{0} filmin altyazısı arandı.", prog.found)}
        </div>
        <div className="ls-list" ref={list}>
          {q.length < 2 && <p className="ls-hint">{tt("Bir cümle ya da birkaç kelime yaz: “köprüde buluşalım”. Büyük küçük harf, Türkçe harfler ve noktalama fark etmez.")}</p>}
          {q.length >= 2 && !hits.length && !prog.working && <p className="ls-hint">{tt("“{0}” hiçbir altyazıda geçmiyor.", q)}</p>}
          {hits.map((h, i) => (
            <button key={h.path + h.start} data-i={i} className={"ls-hit" + (i === at ? " on" : "")} onClick={() => open(h)} onMouseMove={() => setAt(i)}>
              <span className="ls-film">{h.title}<small>{fmtTime(h.start)}</small></span>
              {h.before && <span className="ls-ctx">{h.before}</span>}
              <span className="ls-line">{segments(h.text, h.ranges).map((s, k) => (s.hit ? <mark key={k}>{s.t}</mark> : <span key={k}>{s.t}</span>))}</span>
              {h.after && <span className="ls-ctx">{h.after}</span>}
            </button>
          ))}
        </div>
        <div className="ls-foot">{tt("Yalnızca videonun yanındaki altyazı dosyalarına bakılır; videonun içine gömülü altyazılar okunmaz. ↑↓ gez, Enter ile o ana git.")}</div>
      </div>
    </div>,
    document.body,
  );
}
