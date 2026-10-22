import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "./nativeCore";
import { tt } from "./i18n";
import { fmtTime } from "./mpv";
import { CARD_SIZE, CardFormat, CardStyle, cleanQuote, fitQuote } from "./quoteCardModel";
import { pickTint } from "./posterTint";
import { copyCanvas, drawCover, loadImage, saveCanvas } from "./shareImage";
import literataI from "@fontsource/literata/files/literata-latin-400-italic.woff2?url";
import literataIx from "@fontsource/literata/files/literata-latin-ext-400-italic.woff2?url";

// the quote is set in Literata italic (bundled with the reader); Turkish letters come from the latin-ext file
let fontsReady: Promise<void> | null = null;
function loadQuoteFont(): Promise<void> {
  return (fontsReady ??= (async () => {
    try {
      const faces = [
        new FontFace("LunaQuote", `url(${literataI})`, { style: "normal", unicodeRange: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2212" }),
        new FontFace("LunaQuote", `url(${literataIx})`, { style: "normal", unicodeRange: "U+0100-02AF, U+0304, U+0308, U+0329, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF" }),
      ];
      for (const f of faces) { await f.load(); document.fonts.add(f); }
    } catch { /* falls back to Georgia */ }
  })());
}

export type QuoteSource = { path: string; title: string; year?: string; start: number; text: string };

/** Turns one subtitle line into a picture: the frame where it is said, the line, the film. */
export function QuoteCard({ src, onClose }: { src: QuoteSource; onClose: () => void }) {
  const [style, setStyle] = useState<CardStyle>("cinema");
  const [format, setFormat] = useState<CardFormat>("story");
  const [text, setText] = useState(() => cleanQuote(src.text));
  const [frame, setFrame] = useState<HTMLImageElement | null | "loading">("loading");
  const [showTime, setShowTime] = useState(true);
  const [msg, setMsg] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let alive = true;
    invoke<string>("still_frame", { path: src.path, secs: Math.max(0, src.start + 0.4) })
      .then((d) => loadImage(d)).then((img) => alive && setFrame(img)).catch(() => alive && setFrame(null));
    return () => { alive = false; };
  }, [src.path, src.start]);
  useEffect(() => {
    if (frame === "loading" || !canvas.current) return;
    let alive = true;
    void loadQuoteFont().then(() => { if (alive && canvas.current) drawQuoteCard(canvas.current, { img: frame, text, title: src.title, year: src.year, time: showTime ? src.start : null, style: frame ? style : "minimal", format }); });
    return () => { alive = false; };
  }, [frame, text, style, format, showTime]);
  const name = `${src.title} — ${text.split(/\s+/).slice(0, 5).join(" ")}`;
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, []);
  return createPortal(
    <div className="qc-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="qc-win glass" role="dialog" aria-modal="true" aria-label={tt("Replik kartı")} onKeyDown={(e) => e.stopPropagation()}>
      <div className="qc-head"><b>{tt("Replik kartı")}</b><span className="lp-hint">{src.title}{src.year ? ` (${src.year})` : ""} · {fmtTime(src.start)}</span><button className="rc-icon" onClick={onClose} aria-label={tt("Kapat")}>×</button></div>
      <div className="qc">
        <div className={"qc-preview " + format}>
          {frame === "loading" && <div className="qc-wait">{tt("Kare hazırlanıyor…")}</div>}
          <canvas ref={canvas} className={frame === "loading" ? "hidden" : ""} aria-label={tt("Kart önizlemesi")} />
        </div>
        <div className="qc-side">
          <label className="qc-label" htmlFor="qc-text">{tt("Replik")}</label>
          <textarea id="qc-text" className="qc-text" rows={4} value={text} maxLength={280} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
          <div className="qc-label">{tt("Görünüm")}</div>
          <div className="seg-row">
            {([["cinema", tt("Sinema")], ["poster", tt("Afiş")], ["minimal", tt("Yalın")]] as [CardStyle, string][]).map(([k, l]) => (
              <button key={k} className={"seg sm" + ((frame ? style : "minimal") === k ? " on" : "")} disabled={!frame && k !== "minimal"} onClick={() => setStyle(k)}>{l}</button>
            ))}
          </div>
          <div className="qc-label">{tt("Boyut")}</div>
          <div className="seg-row">
            <button className={"seg sm" + (format === "story" ? " on" : "")} onClick={() => setFormat("story")}>4:5</button>
            <button className={"seg sm" + (format === "wide" ? " on" : "")} onClick={() => setFormat("wide")}>16:9</button>
          </div>
          <label className="look-check lp-check"><input type="checkbox" checked={showTime} onChange={(e) => setShowTime(e.target.checked)} /><span>{tt("Zamanı göster ({0})", fmtTime(src.start))}</span></label>
          {frame === null && <p className="lp-hint">{tt("Bu videodan kare alınamadı; yalın görünüm kullanılıyor.")}</p>}
          <div className="qc-actions">
            <button className="primary" disabled={frame === "loading" || !text.trim()} onClick={async () => { try { const f = await saveCanvas(canvas.current!, name, tt("PNG görseli")); if (f) setMsg(tt("Kaydedildi: {0}", f)); } catch (e) { setMsg(String(e)); } }}>{tt("Kaydet…")}</button>
            <button className="chip" disabled={frame === "loading" || !text.trim()} onClick={async () => setMsg((await copyCanvas(canvas.current!)) ? tt("Panoya kopyalandı.") : tt("Pano bu görseli kabul etmedi; kaydetmeyi dene."))}>{tt("Panoya kopyala")}</button>
          </div>
          {msg && <div className="lp-msg" role="status">{msg}</div>}
        </div>
      </div>
      </div>
    </div>,
    document.body,
  );
}

type Draw = { img: HTMLImageElement | null; text: string; title: string; year?: string; time: number | null; style: CardStyle; format: CardFormat };

/** Draws the card. The accent colour comes from the frame itself, so every card matches its film. */
export function drawQuoteCard(c: HTMLCanvasElement, d: Draw) {
  const [W, H] = CARD_SIZE[d.format];
  c.width = W; c.height = H;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;
  let accent = "232, 112, 26";
  if (d.img) {
    const s = document.createElement("canvas"); s.width = 32; s.height = 18;
    const sx = s.getContext("2d", { willReadFrequently: true });
    if (sx) { sx.drawImage(d.img, 0, 0, 32, 18); const t = pickTint(sx.getImageData(0, 0, 32, 18).data); if (t) accent = t.map((v) => Math.min(255, Math.round(v * 1.35))).join(", "); }
  }
  const pad = d.format === "story" ? 84 : 96;
  ctx.fillStyle = "#0b0b0e"; ctx.fillRect(0, 0, W, H);
  let box = { x: pad, y: H * 0.5, w: W - pad * 2, h: H * 0.5 - 220 };
  if (d.style === "cinema" && d.img) {
    drawCover(ctx, d.img, 0, 0, W, H);
    const g = ctx.createLinearGradient(0, H * 0.3, 0, H);
    g.addColorStop(0, "rgba(6,6,8,0)"); g.addColorStop(0.55, "rgba(6,6,8,.72)"); g.addColorStop(1, "rgba(6,6,8,.94)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    box = { x: pad, y: H * (d.format === "story" ? 0.5 : 0.42), w: W - pad * 2, h: H * (d.format === "story" ? 0.5 : 0.58) - 200 };
  } else if (d.style === "poster" && d.img) {
    const ih = Math.round(H * (d.format === "story" ? 0.56 : 0.6));
    const iw = d.format === "story" ? W : Math.round(W * 0.52);
    drawCover(ctx, d.img, 0, 0, iw, d.format === "story" ? ih : H);
    ctx.fillStyle = `rgba(${accent}, 1)`;
    if (d.format === "story") { ctx.fillRect(0, ih, W, 6); box = { x: pad, y: ih + 70, w: W - pad * 2, h: H - ih - 280 }; }
    else { ctx.fillRect(iw, 0, 6, H); box = { x: iw + 80, y: 120, w: W - iw - 160, h: H - 380 }; }
  } else {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, `rgba(${accent}, .55)`); g.addColorStop(0.6, "#121216"); g.addColorStop(1, "#08080a");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    box = { x: pad, y: H * 0.24, w: W - pad * 2, h: H * 0.5 };
  }
  // the quote
  const fam = "LunaQuote, Literata, Georgia, serif";
  const fit = fitQuote(d.text.trim() || "…", { w: box.w, h: box.h }, (s, size) => { ctx.font = `italic 400 ${size}px ${fam}`; return ctx.measureText(s).width; }, { max: d.format === "story" ? 76 : 70, min: 34, lineHeight: 1.28 });
  ctx.font = `600 ${Math.round(fit.size * 2.1)}px Sora, Georgia, serif`;
  ctx.fillStyle = `rgba(${accent}, .95)`;
  ctx.fillText("“", box.x - 6, box.y + fit.size * 0.62);
  ctx.font = `italic 400 ${fit.size}px ${fam}`;
  ctx.fillStyle = "#fff";
  ctx.shadowColor = "rgba(0,0,0,.55)"; ctx.shadowBlur = d.style === "cinema" ? 18 : 0;
  fit.lines.forEach((l, i) => ctx.fillText(l, box.x, box.y + fit.size * 1.32 + i * fit.size * 1.28));
  ctx.shadowBlur = 0;
  // the film
  const by = Math.min(H - 120, box.y + fit.size * 1.32 + fit.lines.length * fit.size * 1.28 + 40);
  ctx.fillStyle = `rgba(${accent}, 1)`; ctx.fillRect(box.x, by, 54, 5);
  ctx.font = "600 34px Sora, 'IBM Plex Sans', sans-serif"; ctx.fillStyle = "#fff";
  const head = d.title + (d.year ? ` (${d.year})` : "");
  ctx.fillText(head, box.x, by + 56, box.w);
  if (d.time != null) { ctx.font = "400 26px 'IBM Plex Sans', sans-serif"; ctx.fillStyle = "rgba(255,255,255,.66)"; ctx.fillText(fmtTime(d.time), box.x, by + 98); }
  // Luna's mark
  ctx.textAlign = "right"; ctx.font = "600 24px Sora, sans-serif"; ctx.fillStyle = "rgba(255,255,255,.55)";
  ctx.fillText("Luna", W - pad + 4, H - 46);
  ctx.beginPath(); ctx.arc(W - pad - 72, H - 54, 9, 0, Math.PI * 2); ctx.fillStyle = `rgba(${accent}, .9)`; ctx.fill();
  ctx.textAlign = "left";
}
