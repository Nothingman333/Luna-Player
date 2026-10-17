import { useRef } from "react";
import { setProp } from "./mpv";

const SPAN = 40; // seconds visible on the strip

type Props = {
  cues: [number, number][];
  time: number;
  delay: number;
  embedded: boolean;
  onReset: () => void;
  onOther: () => void;
  onClose: () => void;
};

const fmtDelay = (d: number) =>
  (d > 0 ? "+" : d < 0 ? "−" : "") + Math.abs(d).toFixed(3).replace(".", ",") + " sn";

export default function SubTimeline({ cues, time, delay, embedded, onReset, onOther, onClose }: Props) {
  const strip = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; delay: number } | null>(null);

  const nudge = (d: number) => setProp("sub-delay", Math.round((delay + d) * 1000) / 1000);

  const start = time - SPAN / 2;
  const visible = cues.filter(([s, e]) => e + delay > start && s + delay < start + SPAN);
  const pct = (t: number) => ((t - start) / SPAN) * 100;

  // "Next line is being spoken now": align the first upcoming cue to the playhead.
  const next = cues.find(([s]) => s + delay > time);
  const syncNext = () => next && setProp("sub-delay", Math.round((time - next[0]) * 1000) / 1000);

  const onDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, delay };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current || !strip.current) return;
    const dx = e.clientX - drag.current.x;
    const sec = (dx / strip.current.clientWidth) * SPAN;
    setProp("sub-delay", Math.round((drag.current.delay + sec) * 20) / 20);
  };
  const onUp = () => (drag.current = null);

  return (
    <div className="sync">
      <div className="sync-head">
        <span className="sync-title">Altyazı zaman çizelgesi</span>
        <span className="muted">
          {embedded
            ? "Gömülü altyazı · kaydırma çalışır, bloklar gösterilemiyor"
            : "Blokları sürükle ya da butonlarla kaydır · turuncu çizgi = şu an"}
        </span>
        <span className="grow" />
        <span className="muted">Kaydırma</span>
        <span className="sync-value">{fmtDelay(delay)}</span>
        <button className="chip" onClick={onReset}>Sıfırla</button>
        <button className="icon sm" aria-label="Kapat" title="Kapat (S)" onClick={onClose}>✕</button>
      </div>
      <div className="sync-row">
        <button className="step big" aria-label="500 ms geri" onClick={() => nudge(-0.5)}>−500</button>
        <button className="step" aria-label="50 ms geri" onClick={() => nudge(-0.05)}>−50</button>
        <div
          className="strip"
          ref={strip}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
        >
          {visible.map(([s, e], i) => {
            const l = pct(s + delay);
            const w = pct(e + delay) - l;
            const past = e + delay < time;
            const active = !past && s + delay <= time;
            return (
              <div
                key={i}
                className={"cue" + (past ? " past" : "") + (active ? " active" : "")}
                style={{ left: l + "%", width: Math.max(w, 0.3) + "%" }}
              />
            );
          })}
          <div className="playhead" />
        </div>
        <button className="step" aria-label="50 ms ileri" onClick={() => nudge(0.05)}>+50</button>
        <button className="step big" aria-label="500 ms ileri" onClick={() => nudge(0.5)}>+500</button>
      </div>
      <div className="sync-foot">
        <span className="muted">Bu ayar bu dosya için kaydedilir. Kısayol: G / H (VLC gibi, 50 ms)</span>
        <span className="grow" />
        <button className="chip" disabled={!next} onClick={syncNext}>
          Sıradaki replik şimdi söylendi
        </button>
        <button className="chip" onClick={onOther}>Başka altyazı seç…</button>
      </div>
    </div>
  );
}
