import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { tt } from "./i18n";
import { store } from "./library";
import { ttsHost } from "./ReadAloud";
import { minutesLeft, splitAtOrp, wordDelay } from "./rsvpModel";
import "./ExtrasPlus.css";

type Tok = { w: string; node: Text; off: number };
const clampWpm = (n: number) => Math.max(150, Math.min(900, Math.round(n / 25) * 25 || 300));

/** The words of a chapter document with where each sits, so reading can start on the page on screen
 *  and the book can turn to the word reached when the fast reader closes. */
function tokens(doc: Document): Tok[] {
  const out: Tok[] = [];
  const walk = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest("script,style,noscript,rt") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n = walk.nextNode() as Text | null; n; n = walk.nextNode() as Text | null) {
    const text = n.data;
    for (const m of text.matchAll(/\S+/g)) out.push({ w: m[0].replace(/\u00ad/g, ""), node: n, off: m.index ?? 0 });
  }
  return out;
}

/** One word at a time at a steady pace (RSVP), starting on the page on screen; Esc turns the book to the word reached. */
export function RsvpReader({ onClose }: { onClose: () => void }) {
  const [wpm, setWpm] = useState(() => clampWpm(Number(store.get("rsvpWpm")) || 300));
  const [toks, setToks] = useState<Tok[]>([]);
  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [msg, setMsg] = useState("");
  const section = useRef<number>(-1);
  const docRef = useRef<{ cfi: (r: Range) => string } | null>(null);

  const load = (fromPage: boolean) => {
    const host = ttsHost();
    const d = host?.docs()[0];
    if (!host || !d) { setMsg(tt("Hızlı okuma için kitabın bir sayfası açık olmalı.")); return false; }
    section.current = d.index;
    docRef.current = d;
    const list = tokens(d.doc);
    let start = 0;
    const cfi = fromPage ? host.pageStart() : undefined;
    const page = cfi ? d.range(cfi) : null;
    if (page) {
      const probe = d.doc.createRange();
      const i = list.findIndex((t) => { probe.setStart(t.node, t.off); probe.collapse(true); return page.compareBoundaryPoints(Range.START_TO_START, probe) <= 0; });
      if (i >= 0) start = i;
    }
    setToks(list); setAt(start); setMsg(list.length ? "" : tt("Bu bölümde okunacak metin yok."));
    return list.length > 0;
  };
  useEffect(() => { load(true); }, []);
  useEffect(() => { store.set("rsvpWpm", String(wpm)); }, [wpm]);

  // the pace: each word stays as long as its punctuation and length ask for
  useEffect(() => {
    if (!playing) return;
    if (at >= toks.length) {
      setPlaying(false);
      const host = ttsHost();
      if (!host) return;
      void host.nextSection(section.current).then((more) => {
        if (!more) { setMsg(tt("Kitabın sonu.")); return; }
        // the next chapter is drawn a moment later
        window.setTimeout(() => { if (load(false)) setPlaying(true); }, 350);
      }).catch(() => setMsg(tt("Sonraki bölüm açılamadı.")));
      return;
    }
    const id = window.setTimeout(() => setAt((i) => i + 1), wordDelay(toks[at].w, wpm));
    return () => clearTimeout(id);
  }, [playing, at, toks, wpm]);

  const close = () => {
    setPlaying(false);
    const t = toks[Math.min(at, toks.length - 1)], host = ttsHost(), d = docRef.current;
    if (t && host && d) {
      try {
        const r = t.node.ownerDocument!.createRange();
        r.setStart(t.node, t.off); r.setEnd(t.node, Math.min(t.node.length, t.off + t.w.length));
        void host.show(d.cfi(r)).catch(() => {});
      } catch { /* the page stays where it was */ }
    }
    onClose();
  };
  const back = (n: number) => setAt((i) => Math.max(0, i - n));
  // keys while it is open; the reader's own keys wait
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const k = e.key;
      if (![" ", "Escape", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(k)) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (k === " ") setPlaying((p) => !p);
      else if (k === "Escape") close();
      else if (k === "ArrowLeft") back(e.shiftKey ? 50 : 10);
      else if (k === "ArrowRight") setAt((i) => Math.min(toks.length - 1, i + (e.shiftKey ? 50 : 10)));
      else if (k === "ArrowUp") setWpm((w) => clampWpm(w + 25));
      else setWpm((w) => clampWpm(w - 25));
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  });

  const word = toks[Math.min(at, toks.length - 1)]?.w ?? "";
  // the sentence around the word, for context while reading (or after a pause)
  const ctx = (() => {
    const i = Math.min(at, toks.length - 1);
    if (i < 0) return null;
    let a = i, b = i;
    while (a > 0 && i - a < 24 && !/[.!?…]["'”’)»]*$/.test(toks[a - 1].w)) a--;
    while (b < toks.length - 1 && b - i < 24 && !/[.!?…]["'”’)»]*$/.test(toks[b].w)) b++;
    return { before: toks.slice(a, i).map((t) => t.w).join(" "), after: toks.slice(i + 1, b + 1).map((t) => t.w).join(" ") };
  })();
  const [pre, pivot, post] = splitAtOrp(word);
  const pct = toks.length ? Math.round((Math.min(at, toks.length) / toks.length) * 100) : 0;
  return createPortal(
    <div className="lx-rsvp" role="dialog" aria-label={tt("Hızlı okuma")} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="lx-rsvp-card">
        <div className="lx-rsvp-top"><b>{tt("Hızlı okuma")}</b><span className="muted">{tt("Bölümün %{0} kısmı", pct)}</span></div>
        <div className="lx-rsvp-stage">
          <div className="lx-rsvp-word" aria-live="off" onClick={() => setPlaying((p) => !p)}>
            <span className="pre">{pre}</span><span className="pivot">{pivot}</span><span className="post">{post}</span>
          </div>
        </div>
        <div className="lx-rsvp-ctx">{!playing && ctx && word ? <>{ctx.before} <b>{word}</b> {ctx.after}</> : null}</div>
        <div className="lx-rsvp-bar" aria-hidden="true"><i style={{ width: pct + "%" }} /></div>
        {msg && <p className="muted small">{msg}</p>}
        <div className="lx-rsvp-ctl">
          <button className="chip" onClick={() => back(10)} aria-label={tt("10 kelime geri")}>−10</button>
          <button className="chip lx-rsvp-play" onClick={() => setPlaying((p) => !p)} disabled={!toks.length}>{playing ? tt("Duraklat") : tt("Oku")}</button>
          <label className="lx-rsvp-speed"><span>{tt("{0} kelime/dk", wpm)}</span>
            <input type="range" min={150} max={900} step={25} value={wpm} onChange={(e) => setWpm(clampWpm(Number(e.target.value)))} aria-label={tt("Okuma hızı")} /></label>
          <span className="muted small">{tt("Bölümde ~{0} dk kaldı", minutesLeft(Math.max(0, toks.length - at), wpm))}</span>
          <span className="grow" />
          <button className="chip" onClick={close}>{tt("Kapat ve buraya git")}</button>
        </div>
        <p className="muted small lx-note">{tt("Boşluk: oku/duraklat · ←/→: 10 kelime · ↑/↓: hız · Esc: kapat")}</p>
      </div>
    </div>,
    document.body,
  );
}
