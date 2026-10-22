import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { tt, lang } from "./i18n";
import { IMG, Item, loadFinished } from "./library";
import { loadDiary } from "./Taste";
import { loadHistory } from "./Music";
import { getPos } from "./Books";
import { buildRecap, heatWeeks, Period, Persona, Recap, RecapInput } from "./recapModel";
import { copyCanvas, drawCover, loadImage, roundRect, saveCanvas } from "./shareImage";

const fileTitle = (p: string) => (p.split(/[\\/]/).pop() ?? p).replace(/\.[^.]+$/, "").replace(/[._]+/g, " ").trim();

/** Everything the recap needs, read from what Luna keeps (finished films, the diary, listening history, book positions). */
export function collectRecapInput(items: Item[], now = Date.now()): RecapInput {
  const byPath = new Map<string, Item>();
  for (const it of items) for (const f of it.files) byPath.set(f.path, it);
  const films = Object.entries(loadFinished()).map(([path, at]) => {
    const it = byPath.get(path), m = it?.meta;
    const tv = (m?.kind ?? it?.parsed.kind) === "tv";
    return { key: tv ? path : it?.key ?? path, title: m?.title ?? it?.parsed.title ?? fileTitle(path), year: m?.year, poster: m?.poster ? IMG + "w342" + m.poster : null, genres: m?.genres ?? [], runtime: m?.runtime ?? 0, at };
  });
  const ratings = Object.values(loadDiary()).map((e) => ({ title: e.title + (e.year ? ` (${e.year})` : ""), at: e.watched ?? e.at, rating: e.rating, vote: e.vote as string | undefined, genres: e.genres }));
  const listens = loadHistory().filter((h) => !h.q.radio && !h.q.book && !h.q.podcast).map((h) => ({ at: h.at, title: h.q.title, artist: h.q.artist, cover: h.q.cover && /^https?:/.test(h.q.cover) ? h.q.cover : null, duration: h.q.duration }));
  const reads: RecapInput["reads"] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith("bookPos:")) continue;
      const pos = getPos(k.slice(8));
      if (pos?.at) reads.push({ title: fileTitle(k.slice(8)), at: pos.at, pct: pos.pct ?? 0 });
    }
  } catch { /* storage unavailable */ }
  return { now, films, ratings, listens, reads };
}

const PERSONA: Record<Persona, () => [string, string]> = {
  "night-owl": () => [tt("Gece kuşu"), tt("En sevdiğin saatler herkes uyurken başlıyor.")],
  marathoner: () => [tt("Maratoncu"), tt("Jenerik akarken bir sonrakini çoktan seçmiştin.")],
  bookworm: () => [tt("Kitap kurdu"), tt("Sayfalar arasında kaybolmayı seviyorsun.")],
  melomane: () => [tt("Melomane"), tt("Günün film müziği hep sende çaldı.")],
  critic: () => [tt("Eleştirmen"), tt("Her filme bir puan, her puana bir gerekçe.")],
  explorer: () => [tt("Kâşif"), tt("Tek türe sığmıyorsun; her akşam başka bir dünya.")],
  dreamer: () => [tt("Hayalperest"), tt("Az ama öz: seçtiklerin seninle kaldı.")],
};
const PERSONA_ICON: Record<Persona, string> = {
  "night-owl": "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z",
  marathoner: "M4 6h16v12H4zM8 6v12M16 6v12M4 10h4M4 14h4M16 10h4M16 14h4",
  bookworm: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5",
  melomane: "M9 18V6l10-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM19 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  critic: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z",
  explorer: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM16 8l-2 6-6 2 2-6z",
  dreamer: "M7 18a5 5 0 0 1-.5-10A6 6 0 0 1 18 9a4.5 4.5 0 0 1-1 9z",
};
const periodLabel = (p: Period, now: number) => (p === "year" ? tt("{0} yılı", new Date(now).getFullYear()) : p === "month" ? tt("Son 30 gün") : tt("Tüm zamanlar"));
const hoursText = (min: number) => (min >= 120 ? tt("{0} saat", Math.round(min / 60)) : tt("{0} dakika", Math.round(min)));
const dateText = (d: string) => new Date(d + "T12:00:00").toLocaleDateString(lang() === "tr" ? "tr-TR" : "en-GB", { day: "numeric", month: "long" });
const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A number that counts up when it appears. */
function Count({ to, suffix = "" }: { to: number; suffix?: string }) {
  const [n, setN] = useState(reduced() ? to : 0);
  useEffect(() => {
    if (reduced()) { setN(to); return; }
    let raf = 0; const t0 = performance.now();
    const step = (t: number) => { const k = Math.min(1, (t - t0) / 900); setN(Math.round(to * (1 - Math.pow(1 - k, 3)))); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <>{n.toLocaleString(lang() === "tr" ? "tr-TR" : "en-GB")}{suffix}</>;
}

function Bars({ rows, unit }: { rows: [string, number][]; unit: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return (
    <div className="rc-bars-list">
      {rows.map(([name, n], i) => (
        <div className="rc-bar" key={name} style={{ animationDelay: `${0.25 + i * 0.08}s` }}>
          <span className="rc-bar-name">{name}</span>
          <span className="rc-bar-track"><i style={{ width: `${(n / max) * 100}%`, animationDelay: `${0.35 + i * 0.08}s` }} /></span>
          <span className="rc-bar-n">{unit(n)}</span>
        </div>
      ))}
    </div>
  );
}

/** 24 wedges around a dial: when in the day the music played. */
function HourClock({ hours, peak }: { hours: number[]; peak: number | null }) {
  const max = Math.max(1, ...hours);
  const R0 = 34, R1 = 92;
  const wedge = (h: number) => {
    const r = R0 + ((R1 - R0) * hours[h]) / max;
    const a0 = ((h - 6) / 24) * Math.PI * 2 + 0.03, a1 = ((h - 5) / 24) * Math.PI * 2 - 0.03;
    const p = (rad: number, a: number) => `${100 + rad * Math.cos(a)},${100 + rad * Math.sin(a)}`;
    return `M${p(R0, a0)} L${p(r, a0)} A${r},${r} 0 0 1 ${p(r, a1)} L${p(R0, a1)} A${R0},${R0} 0 0 0 ${p(R0, a0)}Z`;
  };
  return (
    <svg className="rc-clock" viewBox="-12 -12 224 224" role="img" aria-label={peak != null ? tt("En çok saat {0}:00 civarında dinledin", peak) : ""}>
      <circle cx="100" cy="100" r={R1} className="rc-clock-ring" />
      {hours.map((_, h) => { const a = ((h - 6) / 24) * Math.PI * 2, long = h % 6 === 0; return <line key={"t" + h} className="rc-tick" x1={100 + (R1 + 3) * Math.cos(a)} y1={100 + (R1 + 3) * Math.sin(a)} x2={100 + (R1 + (long ? 9 : 6)) * Math.cos(a)} y2={100 + (R1 + (long ? 9 : 6)) * Math.sin(a)} />; })}
      {hours.map((v, h) => v > 0 && <path key={h} d={wedge(h)} className={h === peak ? "peak" : ""} style={{ animationDelay: `${h * 0.02}s` }} />)}
      {[0, 6, 12, 18].map((h) => { const a = ((h - 6) / 24) * Math.PI * 2; return <text key={h} x={100 + 22 * Math.cos(a)} y={104 + 22 * Math.sin(a)} textAnchor="middle">{h}</text>; })}
    </svg>
  );
}

function Heat({ days, to, weeks }: { days: Record<string, number>; to: number; weeks: number }) {
  const cols = useMemo(() => heatWeeks(days, to, weeks), [days, to, weeks]);
  const max = Math.max(1, ...Object.values(days));
  const months = cols.map((col, w) => { const d = new Date(col[0].date + "T12:00:00"); return w === 0 || d.getDate() <= 7 ? { w, label: d.toLocaleDateString(lang() === "tr" ? "tr-TR" : "en-GB", { month: "short" }) } : null; }).filter((m): m is { w: number; label: string } => !!m);
  return (
    <svg className="rc-heat" viewBox={`0 -14 ${weeks * 13} ${7 * 13 + 14}`} role="img" aria-label={tt("Etkinlik haritası")}>
      {months.map((m) => <text key={m.w} x={m.w * 13} y={-4} className="rc-month">{m.label}</text>)}
      {cols.map((col, w) => col.map((d, i) => (
        <rect key={d.date} x={w * 13} y={i * 13} width={11} height={11} rx={2.5}
          className={d.future ? "future" : d.n ? "on" : ""} style={d.n ? { opacity: 0.28 + 0.72 * Math.min(1, d.n / max) } : undefined}>
          <title>{d.date}{d.n ? ` · ${d.n}` : ""}</title>
        </rect>
      )))}
    </svg>
  );
}

type SlideId = "cover" | "films" | "ratings" | "music" | "books" | "rhythm" | "share";
const SLIDE_MS = 8000;

/** Ctrl+K › "Luna Özet": the period as a short story, with a card to keep or share. */
export function LunaRecap({ items, onClose }: { items: Item[]; onClose: () => void }) {
  const [period, setPeriod] = useState<Period>("year");
  const input = useMemo(() => collectRecapInput(items), [items]);
  const r = useMemo(() => buildRecap(input, period), [input, period]);
  const slides = useMemo<SlideId[]>(() => {
    const s: SlideId[] = ["cover"];
    if (r.films.count) s.push("films");
    if (r.ratings.rated) s.push("ratings");
    if (r.music.listens) s.push("music");
    if (r.books.finished) s.push("books");
    if (Object.keys(r.days).length > 1) s.push("rhythm");
    s.push("share");
    return s;
  }, [r]);
  const [at, setAt] = useState(0);
  const [paused, setPaused] = useState(false);
  const cur = slides[Math.min(at, slides.length - 1)];
  const go = (d: number) => setAt((a) => Math.max(0, Math.min(slides.length - 1, a + d)));
  useEffect(() => { setAt(0); }, [period]);
  useEffect(() => {
    if (paused || at >= slides.length - 1 || reduced()) return;
    const t = window.setTimeout(() => go(1), SLIDE_MS);
    return () => clearTimeout(t);
  }, [at, paused, slides.length]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
      else if (e.key === " ") { e.preventDefault(); setPaused((p) => !p); }
      e.stopPropagation();
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [slides.length]);
  const label = periodLabel(period, r.to);
  const [pTitle, pLine] = PERSONA[r.persona]();
  const theme = cur === "films" || cur === "ratings" ? "film" : cur === "music" ? "music" : cur === "books" ? "books" : "mix";

  return createPortal(
    <div className={"rc rc-" + theme} role="dialog" aria-modal="true" aria-label={tt("Luna Özet")}>
      <div className="rc-glow a" /><div className="rc-glow b" />
      <div className="rc-top">
        <div className="rc-progress" aria-hidden="true">
          {slides.map((s, i) => <span key={s + period} className={i < at ? "done" : i === at ? "now" + (paused || reduced() || i === slides.length - 1 ? " still" : "") : ""}><i style={{ animationDuration: SLIDE_MS + "ms" }} /></span>)}
        </div>
        <div className="rc-tools">
          <span className="rc-brand">{tt("Luna Özet")} · {label}</span>
          <button className="rc-icon" onClick={() => setPaused((p) => !p)} aria-label={paused ? tt("Devam et") : tt("Duraklat")}>{paused ? "▶" : "❚❚"}</button>
          <button className="rc-icon" onClick={onClose} aria-label={tt("Kapat")}>×</button>
        </div>
      </div>
      <button className="rc-nav prev" onClick={() => go(-1)} aria-label={tt("Önceki")} disabled={at === 0} />
      <button className="rc-nav next" onClick={() => go(1)} aria-label={tt("Sonraki")} disabled={at >= slides.length - 1} />
      <div className="rc-stage" key={cur + period}>
        {cur === "cover" && (
          <section className="rc-slide rc-cover">
            <div className="rc-kicker">{label}</div>
            <h1 className="rc-h1">{tt("Luna'da geçen zamanın")}</h1>
            {r.empty
              ? <p className="rc-lead">{tt("Bu dönemde henüz bir şey yok. Bir film bitir, birkaç şarkı dinle; özetin kendiliğinden dolar.")}</p>
              : <div className="rc-big"><Count to={Math.round(r.totalMinutes / 60)} /><small>{tt("saat film ve müzik")}</small></div>}
            <div className="rc-persona">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d={PERSONA_ICON[r.persona]} /></svg>
              <span><b>{pTitle}</b><small>{pLine}</small></span>
            </div>
            {(r.films.posters.length + r.music.covers.length) > 0 && (
              <div className="rc-orbit" aria-hidden="true">
                {[...r.films.posters.slice(0, 4), ...r.music.covers.slice(0, 2)].slice(0, 6).map((p, i) => <img key={p} src={p} alt="" className={"o" + i} />)}
              </div>
            )}
            <div className="rc-periods" role="tablist" aria-label={tt("Dönem")}>
              {(["year", "month", "all"] as Period[]).map((p) => <button key={p} role="tab" aria-selected={period === p} className={"rc-chip" + (period === p ? " on" : "")} onClick={() => setPeriod(p)}>{periodLabel(p, r.to)}</button>)}
            </div>
          </section>
        )}
        {cur === "films" && (
          <section className="rc-slide rc-split">
            <div>
              <div className="rc-kicker">{tt("Filmler ve diziler")}</div>
              <div className="rc-big"><Count to={r.films.count} /><small>{tt("film ve bölüm bitirdin")}</small></div>
              {r.films.minutes > 0 && <p className="rc-lead">{tt("Ekran başında {0}.", hoursText(r.films.minutes))}</p>}
              {r.films.genres.length > 0 && <Bars rows={r.films.genres.slice(0, 5)} unit={(n) => String(n)} />}
              {r.films.longest && <p className="rc-note">{tt("En uzunu: {0} ({1} dk)", r.films.longest.title, r.films.longest.runtime)}</p>}
              {r.films.bingeDay && r.films.bingeDay.count > 1 && <p className="rc-note">{tt("{0} günü {1} tane birden izledin.", dateText(r.films.bingeDay.date), r.films.bingeDay.count)}</p>}
            </div>
            <div className="rc-mosaic" aria-hidden="true">
              {r.films.posters.slice(0, r.films.posters.length >= 9 ? 9 : r.films.posters.length >= 6 ? 6 : 3).map((p, i) => <img key={p} src={p} alt="" style={{ animationDelay: `${0.15 + i * 0.07}s` }} />)}
            </div>
          </section>
        )}
        {cur === "ratings" && (
          <section className="rc-slide rc-center">
            <div className="rc-kicker">{tt("Günlüğün")}</div>
            <div className="rc-big"><Count to={r.ratings.rated} /><small>{tt("film günlüğüne girdi")}</small></div>
            {r.ratings.avg != null && (
              <div className="rc-stars" aria-label={tt("Ortalama puan {0}", r.ratings.avg)}>
                {[1, 2, 3, 4, 5].map((k) => <svg key={k} viewBox="0 0 24 24" className={r.ratings.avg! >= k - 0.25 ? "on" : r.ratings.avg! >= k - 0.75 ? "half" : ""}><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" /></svg>)}
                <b>{String(r.ratings.avg).replace(".", lang() === "tr" ? "," : ".")}</b>
              </div>
            )}
            {r.ratings.loved.length > 0 && <div className="rc-list">{r.ratings.loved.map((l, i) => <div key={l.title} className="rc-li" style={{ animationDelay: `${0.3 + i * 0.12}s` }}><span>{i + 1}</span>{l.title}<b>★ {l.rating}</b></div>)}</div>}
            {r.ratings.likes > 0 && <p className="rc-note">{tt("{0} filmi beğendin.", r.ratings.likes)}</p>}
          </section>
        )}
        {cur === "music" && (
          <section className="rc-slide rc-split">
            <div>
              <div className="rc-kicker">{tt("Müzik")}</div>
              <div className="rc-big"><Count to={r.music.listens} /><small>{tt("kez dinledin · {0}", hoursText(r.music.minutes))}</small></div>
              {r.music.artists.length > 0 && <Bars rows={r.music.artists} unit={(n) => String(n)} />}
              {r.music.songs[0] && <p className="rc-note">{tt("En çok çalan: {0}", r.music.songs[0].title + (r.music.songs[0].artist ? " · " + r.music.songs[0].artist : ""))}</p>}
            </div>
            <div className="rc-clockbox">
              <HourClock hours={r.music.hours} peak={r.music.peakHour} />
              {r.music.peakHour != null && <p className="rc-note">{tt("En çok {0}:00 civarında dinledin.", r.music.peakHour)}</p>}
            </div>
          </section>
        )}
        {cur === "books" && (
          <section className="rc-slide rc-center">
            <div className="rc-kicker">{tt("Kitaplar")}</div>
            <div className="rc-big"><Count to={r.books.finished} /><small>{tt("kitabı bitirdin")}</small></div>
            <div className="rc-list">{r.books.titles.map((b, i) => <div key={b} className="rc-li" style={{ animationDelay: `${0.25 + i * 0.1}s` }}><span>{i + 1}</span>{b}</div>)}</div>
          </section>
        )}
        {cur === "rhythm" && (
          <section className="rc-slide rc-center">
            <div className="rc-kicker">{tt("Ritmin")}</div>
            <div className="rc-big"><Count to={Object.keys(r.days).length} /><small>{tt("gün Luna açıktı")}</small></div>
            <Heat days={r.days} to={r.to} weeks={period === "month" ? 6 : 26} />
            <div className="rc-facts">
              {r.streak > 1 && <span><b>{r.streak}</b>{tt("gün üst üste")}</span>}
              {r.busiest && <span><b>{dateText(r.busiest.date)}</b>{tt("en dolu günün")}</span>}
            </div>
          </section>
        )}
        {cur === "share" && <ShareSlide r={r} label={label} persona={[pTitle, pLine]} onRestart={() => setAt(0)} />}
      </div>
    </div>,
    document.body,
  );
}

function ShareSlide({ r, label, persona, onRestart }: { r: Recap; label: string; persona: [string, string]; onRestart: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [msg, setMsg] = useState("");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    void drawRecapCard(canvas.current!, r, label, persona).then(() => alive && setReady(true));
    return () => { alive = false; };
  }, [r, label]);
  return (
    <section className="rc-slide rc-share">
      <div className="rc-kicker">{tt("Saklamak ya da paylaşmak için")}</div>
      <canvas ref={canvas} className={"rc-card" + (ready ? " ready" : "")} aria-label={tt("Özet kartı")} />
      <div className="rc-actions">
        <button className="primary" disabled={!ready} onClick={async () => { try { const f = await saveCanvas(canvas.current!, `Luna Özet ${label}`, tt("PNG görseli")); if (f) setMsg(tt("Kaydedildi: {0}", f)); } catch (e) { setMsg(String(e)); } }}>{tt("Görsel olarak kaydet")}</button>
        <button className="chip" disabled={!ready} onClick={async () => setMsg((await copyCanvas(canvas.current!)) ? tt("Panoya kopyalandı.") : tt("Pano bu görseli kabul etmedi; kaydetmeyi dene."))}>{tt("Panoya kopyala")}</button>
        <button className="chip" onClick={onRestart}>{tt("Baştan izle")}</button>
      </div>
      {msg && <div className="rc-msg" role="status">{msg}</div>}
    </section>
  );
}

/** The 1080×1350 card: totals, the portrait, top genre and artist, a strip of posters. */
async function drawRecapCard(c: HTMLCanvasElement, r: Recap, label: string, [pTitle, pLine]: [string, string]) {
  const W = 1080, H = 1350;
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  if (!ctx) return;
  try { await (document as Document & { fonts?: FontFaceSet }).fonts?.ready; } catch { /* fonts are a nicety */ }
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#1a0f08"); bg.addColorStop(0.55, "#0c0c10"); bg.addColorStop(1, "#08130f");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const glow = (x: number, y: number, rad: number, rgb: string, a: number) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  };
  glow(180, 160, 520, "232,112,26", 0.42); glow(980, 720, 460, "34,199,154", 0.3); glow(240, 1260, 440, "167,139,250", 0.3);
  ctx.fillStyle = "#fff"; ctx.textBaseline = "alphabetic";
  ctx.font = "600 70px Sora, 'IBM Plex Sans', sans-serif"; ctx.fillText(tt("Luna Özet"), 80, 160);
  ctx.font = "400 34px 'IBM Plex Sans', sans-serif"; ctx.fillStyle = "rgba(255,255,255,.72)"; ctx.fillText(label, 82, 214);
  // portrait pill
  ctx.font = "600 34px Sora, sans-serif";
  const pw = ctx.measureText(pTitle).width + 64;
  roundRect(ctx, 80, 262, pw, 64, 32); ctx.fillStyle = "rgba(232,112,26,.92)"; ctx.fill();
  ctx.fillStyle = "#140a04"; ctx.fillText(pTitle, 112, 306);
  ctx.font = "400 28px 'IBM Plex Sans', sans-serif"; ctx.fillStyle = "rgba(255,255,255,.78)"; ctx.fillText(pLine, 80, 372, W - 160);
  // four tiles
  const tiles: [string, string, string][] = [
    [String(Math.round(r.totalMinutes / 60)), tt("saat"), "232,112,26"],
    [String(r.films.count), tt("film ve bölüm"), "232,112,26"],
    [String(r.music.listens), tt("dinleme"), "34,199,154"],
    [String(r.books.finished), tt("kitap"), "167,139,250"],
  ];
  tiles.forEach(([n, l, rgb], i) => {
    const x = 80 + (i % 2) * 470, y = 420 + Math.floor(i / 2) * 230;
    roundRect(ctx, x, y, 450, 200, 28); ctx.fillStyle = "rgba(255,255,255,.06)"; ctx.fill();
    ctx.strokeStyle = `rgba(${rgb},.45)`; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.font = "600 92px Sora, sans-serif"; ctx.fillText(n, x + 36, y + 118);
    ctx.fillStyle = `rgba(${rgb},1)`; ctx.font = "500 30px 'IBM Plex Sans', sans-serif"; ctx.fillText(l, x + 38, y + 166);
  });
  // highlights
  ctx.font = "400 32px 'IBM Plex Sans', sans-serif"; ctx.fillStyle = "rgba(255,255,255,.85)";
  let y = 910;
  const line = (k: string, v?: string) => { if (!v) return; ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.fillText(k, 80, y); ctx.fillStyle = "#fff"; ctx.fillText(v, 380, y, W - 460); y += 46; };
  line(tt("En sevdiğin tür"), r.films.genres[0]?.[0]);
  line(tt("En çok dinlediğin"), r.music.artists[0]?.[0]);
  line(tt("En uzun seri"), r.streak > 1 ? tt("{0} gün", r.streak) : undefined);
  // poster strip
  const posters = (await Promise.all(r.films.posters.slice(0, 5).map(loadImage))).filter((p): p is HTMLImageElement => !!p);
  posters.forEach((img, i) => {
    const pw2 = 160, ph = 232, x = 80 + i * (pw2 + 22), py = 1056;
    ctx.save(); roundRect(ctx, x, py, pw2, ph, 16); ctx.clip(); drawCover(ctx, img, x, py, pw2, ph); ctx.restore();
  });
  ctx.font = "600 26px Sora, sans-serif"; ctx.fillStyle = "rgba(255,255,255,.5)"; ctx.textAlign = "right"; ctx.fillText("Luna Player", W - 80, H - 34); ctx.textAlign = "left";
}
