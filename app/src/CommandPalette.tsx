import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { lang } from "./i18n";
import { BrowserIcon } from "./BrowserIcons";
import type { BrowserIconName } from "./BrowserIcons";
import { mergeTyped, rankPalette } from "./commandPaletteModel";
import type { PaletteEntry } from "./commandPaletteModel";
import "./CommandPalette.css";

export type PaletteCommand = PaletteEntry & { icon?: BrowserIconName; hint?: string; run: () => void };
const label = (tr: string, en: string) => (lang() === "tr" ? tr : en);

/**
 * Luna's command palette: one box that finds commands, places and titles. Arrow keys move, Enter runs, Esc closes.
 * It is a modal dialog, so Luna Web hides its native page layer while it is open (Browser.tsx looks for role="dialog").
 * `extra` adds rows that depend on the typed text (e.g. "Search the web for …"); see mergeTyped for where they go.
 */
export function CommandPalette({ commands, onClose, placeholder, title, extra, footer }: {
  commands: PaletteCommand[]; onClose: () => void; placeholder?: string; title?: string;
  extra?: (query: string) => PaletteCommand[]; footer?: string;
}) {
  const [query, setQuery] = useState(""), [at, setAt] = useState(0);
  const input = useRef<HTMLInputElement>(null), list = useRef<HTMLUListElement>(null), composing = useRef(false);
  const rows = useMemo(() => mergeTyped(rankPalette(commands, query, 80), extra ? extra(query) : [], query), [commands, query, extra]);
  const usable = rows.map((r, i) => (r.disabled ? -1 : i)).filter(i => i >= 0);
  const active = usable.includes(at) ? at : usable[0] ?? -1;
  useEffect(() => { setAt(0); }, [query]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    input.current?.focus(); // at once: the first keys typed right after Ctrl+K must not get lost
    return () => { if (previous && previous !== document.body && previous.isConnected) previous.focus(); };
  }, []);
  useEffect(() => { list.current?.querySelector<HTMLElement>(`[data-row="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [active]);
  const run = (i: number) => { const row = rows[i]; if (!row || row.disabled) return; onClose(); requestAnimationFrame(() => row.run()); };
  const step = (n: number) => {
    if (!usable.length) return;
    const pos = Math.max(0, usable.indexOf(active));
    setAt(usable[Math.max(0, Math.min(usable.length - 1, pos + n))]);
  };
  const keys = (e: ReactKeyboardEvent) => {
    e.stopPropagation(); // the screen behind waits while the palette has the keyboard
    if (composing.current || e.nativeEvent.isComposing) return;
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); if (usable.length) setAt(usable[(usable.indexOf(active) + 1) % usable.length]); }
    else if (e.key === "ArrowUp") { e.preventDefault(); if (usable.length) setAt(usable[(usable.indexOf(active) - 1 + usable.length) % usable.length]); }
    else if (e.key === "PageDown") { e.preventDefault(); step(8); }
    else if (e.key === "PageUp") { e.preventDefault(); step(-8); }
    else if (e.key === "Enter") { e.preventDefault(); if (active >= 0) run(active); }
    else if (e.key === "Tab") { e.preventDefault(); input.current?.focus(); }
  };
  let lastGroup = "";
  return createPortal(<div className="lp-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="lp-panel" role="dialog" aria-modal="true" aria-label={title ?? label("Komut paleti", "Command palette")} onKeyDown={keys}>
      <div className="lp-search"><BrowserIcon name="command" size={18}/>
        <input ref={input} autoFocus role="combobox" aria-expanded="true" aria-controls="lp-list" aria-autocomplete="list" aria-activedescendant={active >= 0 ? "lp-row-" + active : undefined}
          aria-label={title ?? label("Komut paleti", "Command palette")} placeholder={placeholder ?? label("Bir komut, yer ya da başlık yaz…", "Type a command, a place or a title…")}
          value={query} onChange={e => setQuery(e.target.value)} spellCheck={false} autoComplete="off"
          onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}/>
        <kbd>Esc</kbd></div>
      <ul className="lp-list" id="lp-list" role="listbox" ref={list} aria-label={label("Sonuçlar", "Results")}>
        {rows.flatMap((r, i) => {
          const head = r.group !== lastGroup ? r.group : ""; lastGroup = r.group;
          return [head ? <li key={"g" + i + head} className="lp-group" role="presentation">{head}</li> : null,
            <li key={r.id + ":" + i} id={"lp-row-" + i} data-row={i} role="option" aria-selected={i === active} aria-disabled={r.disabled || undefined}
              className={"lp-row" + (i === active ? " on" : "") + (r.disabled ? " off" : "")}
              onMouseMove={() => { if (!r.disabled && at !== i) setAt(i); }} onMouseDown={e => e.preventDefault()} onClick={() => run(i)}>
              <span className="lp-icon"><BrowserIcon name={r.icon ?? "arrow"} size={16}/></span>
              <span className="lp-main"><b>{r.title}</b>{r.detail && <small>{r.detail}</small>}</span>
              {r.hint && <kbd className="lp-hint">{r.hint}</kbd>}
            </li>];
        })}
        {!rows.length && <li className="lp-empty" role="presentation">{label("Eşleşen bir şey yok.", "Nothing matches.")}</li>}
      </ul>
      <footer className="lp-foot"><span><kbd>↑</kbd><kbd>↓</kbd> {label("gez", "move")}</span><span><kbd>Enter</kbd> {label("çalıştır", "run")}</span><span><kbd>Esc</kbd> {label("kapat", "close")}</span>{footer && <em>{footer}</em>}</footer>
    </section>
  </div>, document.body);
}
