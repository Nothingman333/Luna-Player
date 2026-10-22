import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { convertFileSrc, invoke } from "./nativeCore";
import { tt } from "./i18n";
import { fmtTime } from "./mpv";
import type { Cue } from "./subtitleModel";

const CELLS = 36;
const cache = new Map<string, string>();

/** Press Ctrl+G: the film as a sheet of small pictures, one every few minutes; click one to go there. */
/** The subtitle line said at `t` (or starting within 8 s after it, or just ended), cleaned to one short line. */
export function lineAt(cues: Cue[] | undefined, t: number): string {
  if (!cues?.length) return "";
  const c = cues.find((x) => x.start <= t && t < x.end) ?? cues.find((x) => x.start > t && x.start - t <= 8) ?? [...cues].reverse().find((x) => x.end <= t && t - x.end <= 3);
  return c ? c.text.replace(/\{[^}]*\}/g, "").replace(/<[^>]+>|\\N/g, " ").replace(/\s+/g, " ").trim() : "";
}

export function SceneGrid({ path, duration, time, cues, onSeek, onClose }: { path: string; duration: number; time: number; cues?: Cue[]; onSeek: (t: number) => void; onClose: () => void }) {
  const times = useRef(Array.from({ length: CELLS }, (_, i) => Math.floor(((i + 0.5) / CELLS) * duration)));
  const [imgs, setImgs] = useState<Record<number, string>>(() => {
    const o: Record<number, string> = {};
    times.current.forEach((t, i) => { const u = cache.get(path + "|" + t); if (u) o[i] = u; });
    return o;
  });
  const [fail, setFail] = useState(0);
  const [at, setAt] = useState(() => Math.max(0, times.current.findIndex((_, i) => time < (times.current[i + 1] ?? Infinity))));
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      for (let i = 0; i < CELLS && alive; i++) {
        const t = times.current[i], k = path + "|" + t;
        if (cache.has(k)) continue;
        try { const f = await invoke<string>("seek_preview", { path, secs: t }); const u = convertFileSrc(f); cache.set(k, u); if (alive) setImgs((m) => ({ ...m, [i]: u })); }
        catch { if (alive) setFail((n) => n + 1); }
      }
    })();
    return () => { alive = false; void invoke("preview_release").catch(() => {}); };
  }, [path]);
  useEffect(() => { root.current?.querySelector<HTMLElement>(`[data-i="${at}"]`)?.focus({ preventScroll: false }); }, [at]);
  const cols = () => { const g = root.current?.querySelector(".sg-grid"); return g ? Math.max(1, getComputedStyle(g).gridTemplateColumns.split(" ").length) : 6; };
  const key = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    const c = cols();
    const move = (d: number) => { e.preventDefault(); setAt((a) => Math.max(0, Math.min(CELLS - 1, a + d))); };
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
    else if (e.key === "ArrowRight") move(1); else if (e.key === "ArrowLeft") move(-1);
    else if (e.key === "ArrowDown") move(c); else if (e.key === "ArrowUp") move(-c);
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSeek(times.current[at]); onClose(); }
  };
  return createPortal(
    <div className="sg-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sg glass" role="dialog" aria-modal="true" aria-label={tt("Sahne ızgarası")} ref={root} onKeyDown={key}>
        <div className="sg-head"><b>{tt("Sahne ızgarası")}</b><span className="lp-hint">{tt("Ok tuşlarıyla gez, Enter ile git, Esc ile kapat")}</span><button className="chip" onClick={onClose}>{tt("Kapat")}</button></div>
        <div className="sg-grid">
          {times.current.map((t, i) => {
            const now = time >= t && time < (times.current[i + 1] ?? Infinity);
            return (
              <button key={i} data-i={i} className={"sg-cell" + (now ? " now" : "") + (i === at ? " at" : "")} onClick={() => { onSeek(t); onClose(); }} aria-label={fmtTime(t)} tabIndex={i === at ? 0 : -1}>
                {imgs[i] ? <img src={imgs[i]} alt="" draggable={false} /> : <i className="sg-wait" />}
                <span>{fmtTime(t)}</span>
                {lineAt(cues, t) && <em className="sg-cap">{lineAt(cues, t)}</em>}
              </button>
            );
          })}
        </div>
        {fail > 3 && <div className="lp-msg warn">{tt("Bazı kareler alınamadı.")}</div>}
      </div>
    </div>, document.body);
}
