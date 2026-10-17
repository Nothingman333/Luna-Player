import { defaultSubLangs, lang, setLang, tt } from "./i18n";
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { TasteButtons, TrText, youtubeTrailer } from "./Taste";
import { PluginSettings } from "./Web";
import { UpscalerSettings } from "./Upscaler";
import { openUrl } from "@tauri-apps/plugin-opener";
import { fmtTime } from "./mpv";
import { SubAppearance } from "./PlayerMenu";
import {
  Episode, fmtSize, IMG, Item, qualityBadges, Recent, SearchHit, searchTmdb, seasonEpisodes, store,
  useMediaInfo, useThumb,
  isRemote, isFinished, setFinished,
} from "./library";

export const Icon = ({ d, fill, size = 22 }: { d: string; fill?: boolean; size?: number }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24"
    fill={fill ? "currentColor" : "none"} stroke={fill ? "none" : "currentColor"}
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
/** The Luna mark: a play triangle with a moon bite. */
export const LunaMark = ({ size = 28 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 240 240" aria-hidden="true">
    <defs>
      <linearGradient id="lm-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFB070" /><stop offset="0.6" stopColor="#E8701A" /><stop offset="1" stopColor="#B4470C" /></linearGradient>
      <mask id="lm-k"><rect width="240" height="240" fill="#fff" /><circle cx="38" cy="120" r="58" fill="#000" /></mask>
    </defs>
    <path d="M64 36 Q50 28 50 44 L50 196 Q50 212 64 204 L204 130 Q218 120 204 110 Z" fill="url(#lm-g)" mask="url(#lm-k)" />
    <circle cx="44" cy="120" r="18" fill="#FFB070" />
  </svg>
);

export const I = {
  play: "M7 4l13 8-13 8z",
  pause: "M6 5h4v14H6zM14 5h4v14h-4z",
  back: "M3 12a9 9 0 1 0 3-6.7M3 4v5h5",
  fwd: "M21 12a9 9 0 1 1-3-6.7M21 4v5h-5",
  vol: "M11 5L6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 0 1 0 7",
  mute: "M11 5L6 9H2v6h4l5 4V5zM22 9l-6 6M16 9l6 6",
  full: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  left: "M15 18l-6-6 6-6",
  right: "M9 18l6-6-6-6",
  arrowLeft: "M20 12H4M10 6l-6 6 6 6",
  next: "M5 5l10 7-10 7zM19 5v14",
  subs: "M3 5h18v14H3zM7 12h4M13 12h4M7 15h10",
  timeline: "M3 17h18M5 13h3M10 13h5M17 13h2M12 3v18",
  magnet: "M6 3v8a6 6 0 0 0 12 0V3h-4v8a2 2 0 0 1-4 0V3zM6 7h4M14 7h4",
  lock: "M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4",
  timer: "M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 9v4l2.5 2.5M10 2h4",
  unlock: "M6 11h12v10H6zM8 11V7a4 4 0 0 1 7.5-1.9",
  check: "M20 6L9 17l-5-5",
  plus: "M12 5v14M5 12h14",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.3-4.3",
  folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  film: "M4 4h16v16H4zM8 4v16M16 4v16M4 9h4M4 15h4M16 9h4M16 15h4",
  x: "M18 6L6 18M6 6l12 12",
  down: "M12 4v12M6 10l6 6 6-6M4 20h16",
  chat: "M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12zM8.5 12h.01M12 12h.01M15.5 12h.01",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
};

export const pct = (r?: Recent) => (r && r.duration ? Math.min(100, (r.time / r.duration) * 100) : 0);
const fileName = (p: string) => p.split(/[\\/]/).pop()!;
const epLabel = (s?: number, e?: number) =>
  s != null ? `S${String(s).padStart(2, "0")} · B${String(e).padStart(2, "0")}` : "";

/** What "Continue" plays for an item: last watched file, or the next one if it was finished. */
export function resumeTarget(it: Item, recent: Recent[]) {
  const watched = recent.find((r) => it.files.some((f) => f.path === r.path));
  if (!watched) return { file: it.files[0], rec: undefined };
  const idx = it.files.findIndex((f) => f.path === watched.path);
  if (pct(watched) > 92 && idx + 1 < it.files.length) return { file: it.files[idx + 1], rec: undefined };
  return { file: it.files[idx], rec: watched };
}

/** What the right-click menu on a card acts on. */
export type Target = { path: string; item?: Item };
export type Actions = {
  play: (path: string, fromStart?: boolean) => void;
  details: (key: string) => void;
  menu: (e: React.MouseEvent, t: Target) => void;
  /** Name / match a title by hand (when TMDB didn't find it). */
  rematch?: (t: Target) => void;
  /** Library videos whose file is no longer on disk. */
  missing: Set<string>;
};

export function Badges({ path, big, compact }: { path?: string; big?: boolean; compact?: boolean }) {
  // Reads the cached result, or waits for the background probe of this file.
  const info = useMediaInfo(path);
  const all = qualityBadges(info, path);
  // On small cards only what matters at a glance: resolution and HDR type.
  const list = compact ? all.filter((b) => /^(4K|8K|2K|1080p|720p|480p|SD)$|HDR|HLG|Dolby/.test(b)).slice(0, 2) : all;
  if (!list.length) return null;
  return (
    <div className={"badges" + (big ? " big" : "")}>
      {list.map((b) => (
        <span key={b} className={"qb" + (/HDR|HLG|Dolby/.test(b) ? " hdr" : b === "4K" ? " uhd" : "")}>{b}</span>
      ))}
    </div>
  );
}

// ---------- header ----------
export type View = "home" | "movies" | "shows" | "folders" | "downloads" | "recs";

export function Header({ view, setView, query, setQuery, scanning, onOpen, onSettings, onTorrent, downloading, onChat }: {
  view: View; setView: (v: View) => void; query: string; setQuery: (q: string) => void;
  scanning: boolean; onOpen: () => void; onSettings: () => void; onTorrent: () => void; downloading: number; onChat: () => void;
}) {
  const tabs: [View, string][] = [["home", tt("Ana sayfa")], ["movies", tt("Filmler")], ["shows", tt("Diziler")], ["folders", tt("Klasörler")], ["downloads", tt("İndirmeler")], ["recs", tt("Öneriler")]];
  return (
    <header className="app-header">
      <div className="brand"><LunaMark />  {tt("Luna Player")}</div>
      <nav className="tabs">
        {tabs.map(([v, l]) => (
          <button key={v} className={"tab" + (v === view ? " on" : "")} onClick={() => setView(v)}>
            {l}{v === "downloads" && downloading > 0 && <span className="tab-badge">{downloading}</span>}
          </button>
        ))}
      </nav>
      <span className="grow" />
      {scanning && <span className="muted small pulse">{tt("Taranıyor…")}</span>}
      <label className="search">
        <Icon d={I.search} size={18} />
        <input value={query} placeholder={tt("Ara")} aria-label={tt("Kütüphanede ara")}
          onChange={(e) => { setQuery(e.target.value); if (e.target.value && view === "home") setView("movies"); }} />
      </label>
      <button className="ghost sm hdr-btn" onClick={onChat} title={tt("Film asistanı (Gemini)")} aria-label={tt("Asistan")}>
        <Icon d={I.chat} size={18} /><span className="lbl">{tt("Asistan")}</span>
      </button>
      <button className="ghost sm hdr-btn" onClick={onTorrent} title={tt("Bağlantı aç: magnet, torrent ya da video adresi (Ctrl+N)")} aria-label={tt("Bağlantı aç")}>
        <Icon d={I.magnet} size={18} /><span className="lbl">{tt("Bağlantı")}</span>
      </button>
      <button className="round gear" aria-label={tt("Ayarlar")} title={tt("Ayarlar")} onClick={onSettings}><Icon d={I.gear} /></button>
      <button className="primary hdr-open" onClick={onOpen} title={tt("Dosya aç (Ctrl+O)")}><Icon d={I.folder} size={18} /><span className="lbl">{tt("Dosya aç")}</span></button>
    </header>
  );
}

// ---------- cards ----------
function Poster({ it, a }: { it: Item; a: Actions }) {
  const m = it.meta;
  const thumb = useThumb(it.files[0].path, !m?.poster);
  return (
    <button className="poster" onClick={() => a.details(it.key)}
      onContextMenu={(e) => a.menu(e, { path: it.files[0].path, item: it })}>
      <div className={"poster-img" + (it.files.every((f) => isRemote(f.path) || a.missing.has(f.path)) ? " remote" : "")}
        title={it.files.every((f) => isRemote(f.path)) ? tt("İnik değil · detaylardan indirebilirsin")
          : it.files.every((f) => a.missing.has(f.path)) ? tt("Dosya bulunamadı · detaylardan yeniden bağlayabilirsin") : undefined}>
        {it.files.every((f) => isFinished(f.path)) && <span className="done-badge" title={tt("Bitirdin")}>✓</span>}
        {m?.poster ? <img src={IMG + "w342" + m.poster} alt="" loading="lazy" />
          : thumb ? <img src={thumb} alt="" />
          : <span>{it.parsed.title}</span>}
        <div className="poster-badges"><Badges path={it.files[0].path} compact /></div>
      </div>
      <div className="card-title">{m?.title ?? it.parsed.title}</div>
      <div className="muted small">
        {it.parsed.kind === "tv" ? tt("{0} bölüm", it.files.length) : m?.year ?? it.parsed.year ?? ""}
      </div>
    </button>
  );
}

/** The small "i" in a card's corner: opens the details page instead of playing. */
function InfoBtn({ onClick }: { onClick: () => void }) {
  return (
    <span className="info-btn" role="button" tabIndex={0} aria-label={tt("Detaylar")} title={tt("Detaylar")}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onClick(); } }}>i</span>
  );
}

function WideCard({ path, item, title, sub, progress, a, still }: {
  path: string; item?: Item; title: string; sub?: string; progress?: number; a: Actions; still?: string | null;
}) {
  const thumb = useThumb(path, !still);
  const bg = still ?? thumb;
  return (
    <button className="card" onClick={() => a.play(path)} onContextMenu={(e) => a.menu(e, { path, item })}>
      <div className={"thumb" + (isRemote(path) || a.missing.has(path) ? " remote" : "")} style={bg ? { backgroundImage: `url("${bg}")` } : undefined}
        title={isRemote(path) ? tt("İnik değil · oynatınca torrent'ten akar") : undefined}>
        <div className="thumb-play"><Icon d={I.play} fill size={28} /></div>
        {item && <InfoBtn onClick={() => a.details(item.key)} />}
        {progress != null && <div className="progress"><div style={{ width: progress + "%" }} /></div>}
      </div>
      <div className="card-title">{title}</div>
      {sub && <div className="muted small">{sub}</div>}
    </button>
  );
}

// ---------- home ----------
type Slide = { kind: "continue" | "new"; path: string; item?: Item; rec?: Recent };

/** A slide's background: the TMDB backdrop, or a frame from the video when there is none. */
function HeroBg({ on, path, backdrop }: { on: boolean; path: string; backdrop?: string | null }) {
  const frame = useThumb(path, !backdrop);
  const url = backdrop ? `${IMG}w1280${backdrop}` : frame;
  return <div className={"hero-bg" + (on ? " on" : "") + (isRemote(path) ? " remote" : "") + (!backdrop && frame ? " frame" : "")}
    style={url ? { backgroundImage: `url("${url}")` } : undefined} />;
}

function HeroSlider({ slides, a }: { slides: Slide[]; a: Actions }) {
  const [i, setI] = useState(0);
  const [hover, setHover] = useState(false);
  const n = slides.length;
  const go = (d: number) => setI((x) => (x + d + n) % n);
  useEffect(() => {
    if (hover || n < 2) return;
    const id = setTimeout(() => go(1), 7000);
    return () => clearTimeout(id);
  }, [i, hover, n]);
  const s = slides[Math.min(i, n - 1)];
  const it = s.item;
  const f = it?.files.find((x) => x.path === s.path);
  const title = it?.meta?.title ?? it?.parsed.title ?? s.rec?.title ?? "";
  return (
    <section className="hero clickable" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onClick={() => (it ? a.details(it.key) : a.play(s.path))} onContextMenu={(e) => a.menu(e, { path: s.path, item: it })}>
      {slides.map((sl, k) => (
        <HeroBg key={sl.kind + sl.path} on={k === i} path={sl.path} backdrop={sl.item?.meta?.backdrop} />
      ))}
      <div className="hero-shade" />
      <div className="hero-body" key={s.kind + s.path}>
        <div className="eyebrow">{s.kind === "continue" ? tt("KALDIĞIN YERDEN DEVAM ET") : tt("HENÜZ İZLEMEDİN")}</div>
        <h1>{title}</h1>
        <Badges path={s.path} />
        {s.rec ? (
          <>
            <div className="muted">
              {f?.season != null && epLabel(f.season, f.episode) + " — "}
              {fmtTime(s.rec.duration - s.rec.time)}  {tt("kaldı")}
            </div>
            <div className="progress"><div style={{ width: pct(s.rec) + "%" }} /></div>
          </>
        ) : (
          <div className="muted hero-meta">
            {it?.meta?.rating ? `★ ${String(it.meta.rating).replace(".", ",")} · ` : ""}{it?.meta?.year}
            {it?.meta?.genres.length ? " · " + it.meta.genres.slice(0, 3).join(", ") : ""}
            {it?.meta?.overview && <p className="hero-ov">{it.meta.overview}</p>}
          </div>
        )}
        <div className="hero-actions" onClick={(e) => e.stopPropagation()}>
          <button className="primary light" onClick={() => a.play(s.path)}>
            <Icon d={I.play} fill size={18} /> {s.kind === "continue" ? tt("Devam et") : tt("Oynat")}
          </button>
          {it && <button className="ghost" onClick={() => a.details(it.key)}>{tt("Detaylar")}</button>}
        </div>
      </div>
      {n > 1 && (
        <>
          <button className="hero-arrow l" aria-label={tt("Önceki")} onClick={(e) => { e.stopPropagation(); go(-1); }}><Icon d={I.left} size={28} /></button>
          <button className="hero-arrow r" aria-label={tt("Sonraki")} onClick={(e) => { e.stopPropagation(); go(1); }}><Icon d={I.right} size={28} /></button>
          <div className="hero-dots" onClick={(e) => e.stopPropagation()}>
            {slides.map((sl, k) => (
              <button key={k} aria-label={tt("{0}. öğe", k + 1)} className={"hero-dot" + (k === i ? " on" : "") + (sl.kind === "new" ? " new" : "")}
                onClick={() => setI(k)}>{k === i && !hover && <span className="hero-dot-fill" />}</button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

export function Home({ items, recent, hasFolders, a, onSettings, downloads }: {
  items: Item[]; recent: Recent[]; hasFolders: boolean; a: Actions; onSettings: () => void; downloads?: React.ReactNode;
}) {
  const itemOf = (p: string) => items.find((i) => i.files.some((f) => f.path === p));
  const continuing = recent.filter((r) => pct(r) < 95 && !isFinished(r.path)).slice(0, 12);
  const finishedItems = items.filter((i) => i.files.length && i.files.every((f) => isFinished(f.path)));
  // Slider: what you are in the middle of, then things you haven't started yet.
  const watched = new Set(recent.map((r) => r.path));
  const fresh = items
    .filter((i) => i.meta?.backdrop && !i.files.some((f) => watched.has(f.path)))
    .sort((x, y) => (y.meta?.rating ?? 0) - (x.meta?.rating ?? 0))
    .slice(0, 5);
  const slides: Slide[] = [
    ...continuing.slice(0, 5).map((r) => ({ kind: "continue" as const, path: r.path, rec: r, item: itemOf(r.path) })),
    ...fresh.map((it) => ({ kind: "new" as const, path: it.files[0].path, item: it })),
  ];
  const movies = items.filter((i) => i.parsed.kind === "movie");
  const shows = items.filter((i) => i.parsed.kind === "tv");

  return (
    <div className="page">
      {slides.length ? <HeroSlider slides={slides} a={a} /> : (
        <section className="hero empty">
          <h1>{tt("Bir video sürükle bırak")}</h1>
          <div className="muted">{tt("ya da “Dosya aç”a bas. Altyazı yoksa otomatik bulunur.")}</div>
          {!hasFolders && <button className="ghost" onClick={onSettings}><Icon d={I.folder} size={18} />  {tt("Kütüphaneye klasör ekle")}</button>}
        </section>
      )}

      {downloads}

      {continuing.length > 0 && (
        <section className="row">
          <h2>{tt("İzlemeye devam et")}</h2>
          <div className="grid wide">
            {continuing.map((r) => {
              const it = itemOf(r.path);
              const f = it?.files.find((x) => x.path === r.path);
              return (
                <WideCard key={r.path} path={r.path} item={it} a={a} progress={pct(r)}
                  still={it?.meta?.backdrop ? `${IMG}w500${it.meta.backdrop}` : null}
                  title={it?.meta?.title ?? it?.parsed.title ?? r.title}
                  sub={(f?.season != null ? epLabel(f.season, f.episode) + " · " : "") + fmtTime(r.duration - r.time) + tt(" kaldı")} />
              );
            })}
          </div>
        </section>
      )}
      {shows.length > 0 && <PosterRow title={tt("Diziler")} items={shows} a={a} />}
      {movies.length > 0 && <PosterRow title={tt("Filmler")} items={movies} a={a} />}
      {finishedItems.length > 0 && <PosterRow title={tt("Bitirdiklerim")} items={finishedItems} a={a} />}
    </div>
  );
}

function PosterRow({ title, items, a }: { title: string; items: Item[]; a: Actions }) {
  return (
    <section className="row">
      <h2>{title}</h2>
      <div className="grid">{items.map((it) => <Poster key={it.key} it={it} a={a} />)}</div>
    </section>
  );
}

export function Browse({ title, items, query, a }: { title: string; items: Item[]; query: string; a: Actions }) {
  const q = query.trim().toLocaleLowerCase("tr");
  const list = items
    .filter((i) => !q || (i.meta?.title ?? i.parsed.title).toLocaleLowerCase("tr").includes(q) ||
      i.parsed.title.toLowerCase().includes(q) || i.meta?.cast.some((c) => c.name.toLowerCase().includes(q)))
    .sort((x, y) => (x.meta?.title ?? x.parsed.title).localeCompare(y.meta?.title ?? y.parsed.title, "tr"));
  return (
    <div className="page">
      <section className="row">
        <h2>{q ? tt("Yerel dosyalar · “{0}”", query) : title} <span className="muted small">{list.length}</span></h2>
        {list.length ? <div className="grid">{list.map((it) => <Poster key={it.key} it={it} a={a} />)}</div>
          : <div className="muted empty-note">{q ? tt("Kütüphanende bulunamadı.") : tt("Bir şey bulunamadı. Klasörler sekmesinden kütüphaneye klasör ekleyebilirsin.")}</div>}
      </section>
    </div>
  );
}

// ---------- folders ----------
type Entry = { name: string; path: string; isDir: boolean; size: number; videos: number };

export function Folders({ roots, setRoots, items, recent, a }: {
  roots: string[]; setRoots: (r: string[]) => void; items: Item[]; recent: Recent[]; a: Actions;
}) {
  const [cwd, setCwd] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [rootInfo, setRootInfo] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!cwd) return;
    invoke<Entry[]>("list_dir", { path: cwd }).then(setEntries).catch(() => setEntries([]));
  }, [cwd]);
  // Mouse back button: one folder up.
  useEffect(() => {
    const back = (e: Event) => {
      if (!cwd) return;
      e.preventDefault();
      const isRoot = roots.some((r) => r.toLowerCase() === cwd.toLowerCase());
      setCwd(isRoot ? null : cwd.replace(/[\\/][^\\/]+[\\/]?$/, ""));
    };
    window.addEventListener("luna-back", back);
    return () => window.removeEventListener("luna-back", back);
  }, [cwd, roots.join("|")]);
  useEffect(() => {
    roots.forEach((r) => invoke<Entry[]>("list_dir", { path: r })
      .then((e) => setRootInfo((m) => ({ ...m, [r]: e.reduce((n, x) => n + (x.isDir ? x.videos : 1), 0) })))
      .catch(() => {}));
  }, [roots.join("|")]);

  const addRoot = async () => {
    const d = await open({ directory: true, multiple: false });
    if (typeof d === "string" && !roots.includes(d)) setRoots([...roots, d]);
  };
  const root = cwd ? roots.find((r) => cwd.toLowerCase().startsWith(r.toLowerCase())) : undefined;
  const crumbs = cwd && root ? [root, ...cwd.slice(root.length).split(/[\\/]/).filter(Boolean)] : [];
  const crumbPath = (i: number) => i === 0 ? root! : root + "\\" + crumbs.slice(1, i + 1).join("\\");

  if (!cwd)
    return (
      <div className="page">
        <section className="row">
          <div className="row-head"><h2>{tt("Klasörler")}</h2><span className="grow" />
            <button className="ghost sm" onClick={addRoot}><Icon d={I.plus} size={18} />  {tt("Klasör ekle")}</button>
          </div>
          {roots.length === 0 && <div className="muted empty-note">{tt("Film ve dizilerinin olduğu klasörleri ekle; içindekiler kütüphaneye girer.")}</div>}
          <div className="grid folders">
            {roots.map((r) => (
              <div key={r} className="folder-tile" role="button" tabIndex={0} onClick={() => setCwd(r)}
                onKeyDown={(e) => e.key === "Enter" && setCwd(r)}>
                <Icon d={I.folder} size={40} />
                <div className="ellipsis folder-name">{fileName(r) || r}</div>
                <div className="muted small ellipsis">{r}</div>
                <div className="muted small">{rootInfo[r] != null ? tt("{0} video", rootInfo[r]) : "…"}</div>
                <button className="icon sm tile-x" aria-label={tt("Kütüphaneden çıkar")}
                  onClick={(e) => { e.stopPropagation(); setRoots(roots.filter((x) => x !== r)); }}>
                  <Icon d={I.x} size={16} />
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    );

  const dirs = entries.filter((e) => e.isDir);
  const vids = entries.filter((e) => !e.isDir);
  return (
    <div className="page">
      <section className="row">
        <div className="crumbs">
          <button className="crumb" onClick={() => setCwd(null)}>{tt("Klasörler")}</button>
          {crumbs.map((c, i) => (
            <span key={i} className="crumb-wrap"><Icon d={I.right} size={16} />
              <button className="crumb" onClick={() => setCwd(crumbPath(i))}>{i === 0 ? fileName(c) || c : c}</button>
            </span>
          ))}
        </div>
        {dirs.length > 0 && (
          <div className="grid folders">
            {dirs.map((d) => (
              <button key={d.path} className="folder-tile" onClick={() => setCwd(d.path)}>
                <Icon d={I.folder} size={36} />
                <div className="ellipsis folder-name">{d.name}</div>
                <div className="muted small">{d.videos}  {tt("video")}</div>
              </button>
            ))}
          </div>
        )}
        {vids.length > 0 && (
          <div className="grid wide" style={{ marginTop: dirs.length ? 28 : 0 }}>
            {vids.map((v) => {
              const it = items.find((i) => i.files.some((f) => f.path === v.path));
              const f = it?.files.find((x) => x.path === v.path);
              const r = recent.find((x) => x.path === v.path);
              return <FileCard key={v.path} e={v} it={it} season={f?.season} episode={f?.episode} rec={r} a={a} />;
            })}
          </div>
        )}
        {!entries.length && <div className="muted empty-note">{tt("Bu klasörde video yok.")}</div>}
      </section>
    </div>
  );
}

function FileCard({ e, it, season, episode, rec, a }: {
  e: Entry; it?: Item; season?: number; episode?: number; rec?: Recent; a: Actions;
}) {
  const thumb = useThumb(e.path, true);
  return (
    <button className="card" onClick={() => a.play(e.path)} onContextMenu={(ev) => a.menu(ev, { path: e.path, item: it })}>
      <div className="thumb" style={thumb ? { backgroundImage: `url("${thumb}")` } : undefined}>
        <div className="thumb-play"><Icon d={I.play} fill size={28} /></div>
        {it && <InfoBtn onClick={() => a.details(it.key)} />}
        <div className="thumb-badges"><Badges path={e.path} compact /></div>
        {rec && <div className="progress"><div style={{ width: pct(rec) + "%" }} /></div>}
      </div>
      <div className="card-title">{it?.meta ? it.meta.title + (season != null ? " · " + epLabel(season, episode) : "") : e.name}</div>
      <div className="muted small ellipsis">{it?.meta ? e.name + " · " : ""}{fmtSize(e.size)}</div>
    </button>
  );
}

// ---------- details ----------
export function Details({ it, recent, a, onBack, onAddSub, download, onAsk, missingPanel }: {
  it: Item; recent: Recent[]; a: Actions; onBack: () => void; onAddSub: (path: string) => void; download?: React.ReactNode;
  onAsk?: () => void; missingPanel?: React.ReactNode;
}) {
  const [, rerender] = useState(0);
  const allDone = it.files.every((f) => isFinished(f.path));
  const m = it.meta;
  const isTv = it.parsed.kind === "tv";
  const seasons = [...new Set(it.files.map((f) => f.season ?? 1))].sort((x, y) => x - y);
  const { file, rec } = resumeTarget(it, recent);
  const [season, setSeason] = useState(file.season ?? seasons[0] ?? 1);
  const [eps, setEps] = useState<Episode[]>([]);
  const [more, setMore] = useState(false);
  const info = useMediaInfo(file.path);

  useEffect(() => {
    if (isTv && m && m.id > 0) seasonEpisodes(m.id, season).then(setEps);
  }, [isTv, m?.id, season]);

  const extSub = store.get("extSub:" + file.path);
  const hasSub = store.get("hasSub:" + file.path) === "1";
  const playLabel = rec ? (isTv ? tt("{0} · Devam et", epLabel(file.season, file.episode)) : tt("Devam et"))
    : isTv ? tt("{0} · Oynat", epLabel(file.season, file.episode)) : tt("Oynat");
  const longText = (m?.overview.length ?? 0) > 260;

  return (
    <div className="details page-anim">
      <section className="d-hero">
        <div className={"hero-bg" + (it.files.every((f) => isRemote(f.path)) ? " remote" : "")} style={m?.backdrop ? { backgroundImage: `url(${IMG}w1280${m.backdrop})` } : undefined} />
        <div className="d-shade" />
        <header>
          <button className="round" aria-label={tt("Geri")} onClick={onBack}><Icon d={I.left} /></button>
          <div className="brand"><LunaMark />  {tt("Luna Player")}</div>
        </header>
        <div className="d-body">
          <h1>{m?.title ?? it.parsed.title}</h1>
          <div className="d-meta">
            {m && m.rating > 0 && (
              <button className="rating" title={tt("TMDB sayfasını aç")}
                onClick={() => openUrl(m.id > 0 ? `https://www.themoviedb.org/${m.kind}/${m.id}?language=${lang()}` : `https://www.themoviedb.org/search?query=${encodeURIComponent(m.title)}`)}>
                ★ {String(m.rating).replace(".", ",")}
              </button>
            )}
            {m?.year && <span>{m.year}</span>}
            {m?.seasons && <span>{m.seasons}  {tt("sezon")}</span>}
            {m?.runtime ? <span>{Math.floor(m.runtime / 60)}  {tt("sa")} {m.runtime % 60}  {tt("dk")}</span> : null}
            {m?.genres.length ? <span>{m.genres.slice(0, 3).join(", ")}</span> : null}
          </div>
          <Badges path={file.path} big />
          {m?.overview ? (
            <div>
              <TrText className={"overview" + (more ? " open" : "")} text={m.overview} />
              {longText && <button className="more-btn" onClick={() => setMore((v) => !v)}>{more ? tt("Daha az göster") : tt("Devamını oku")}</button>}
            </div>
          ) : m === null && store.get("tmdbKey") ? (
            <div className="name-ask">
              <span>{tt("Bunun adını bulamadım")}{it.files[0]?.path.includes("://") ? tt(" (bağlantıdan açıldı)") : ""}{tt(". Adını söylersen sayfası, afişi ve altyazısı gelir.")}</span>
              {a.rematch && <button className="primary sm" onClick={() => a.rematch!({ path: it.files[0].path, item: it })}>{tt("Adını gir")}</button>}
            </div>
          ) : <p className="overview muted">{tt("Özet ve oyuncular için ayarlardan TMDB anahtarını gir.")}</p>}
          <div className="hero-actions">
            <button className="primary light" onClick={() => a.play(file.path)}><Icon d={I.play} fill size={18} /> {playLabel}</button>
            {rec && <button className="ghost" onClick={() => a.play(file.path, true)}>{tt("Baştan başla")}</button>}
            <span className="act-sep" aria-hidden="true" />
            <button className={"act" + (allDone || (isTv && isFinished(file.path)) ? " on good" : "")}
              data-tip={isTv ? (isFinished(file.path) ? tt("Bölümü izlemedim") : tt("Bölümü bitirdim")) : allDone ? tt("Bitirmedim") : tt("Bitirdim")}
              aria-label={isTv ? tt("Bölümü bitirdim") : tt("Bitirdim")}
              onClick={() => { setFinished(isTv ? [file.path] : it.files.map((f) => f.path), !allDone && !(isTv && isFinished(file.path))); rerender((n) => n + 1); }}>
              <Icon d={I.check} size={20} />
            </button>
            <TasteButtons it={it} />
            <button className="act" data-tip={tt("Altyazı ekle")} aria-label={tt("Altyazı ekle")} onClick={() => onAddSub(file.path)}>
              <Icon d={I.subs} size={20} />
            </button>
            <button className="act" data-tip={tt("YouTube'da Türkçe fragman")} aria-label={tt("Fragman")}
              onClick={() => { const t = m?.title ?? it.parsed.title; const y = m?.year ?? it.parsed.year; openUrl(youtubeTrailer(y ? `${t} (${y})` : t)); }}>
              <Icon d={I.play} fill size={16} />
            </button>
            {onAsk && (
              <button className="act" data-tip={tt("Asistana sor")} aria-label={tt("Asistana sor")} onClick={onAsk}>
                <Icon d={I.chat} size={20} />
              </button>
            )}
            <button className="act" data-tip={tt("Diğer seçenekler")} aria-label={tt("Diğer seçenekler")} onClick={(e) => a.menu(e, { path: file.path, item: it })}>
              <Icon d={I.more} size={22} />
            </button>
          </div>
          {missingPanel}
          {download}
          <div className="muted small">
            {extSub ? tt("Altyazı: {0}", fileName(extSub)) : hasSub ? tt("Altyazı mevcut") : tt("Altyazı yok · oynatınca internetten aranır")}
            {info?.size ? ` · ${fmtSize(info.size)}` : ""}
          </div>
        </div>
      </section>

      {m && m.cast.length > 0 && (
        <section className="row">
          <h2>{tt("Oyuncular")}</h2>
          <div className="cast">
            {m.cast.map((c) => (
              <button key={c.name + c.character} className="person" title={tt("{0} · TMDB'de aç", c.name)}
                onClick={() => openUrl(c.id ? `https://www.themoviedb.org/person/${c.id}?language=${lang()}`
                  : `https://www.themoviedb.org/search/person?query=${encodeURIComponent(c.name)}`)}>
                <div className="face">{c.profile ? <img src={IMG + "w185" + c.profile} alt="" loading="lazy" /> : c.name[0]}</div>
                <div className="p-name">{c.name}</div>
                <div className="muted small">{c.character}</div>
              </button>
            ))}
          </div>
        </section>
      )}

      {isTv && (
        <section className="row">
          <div className="row-head">
            <h2>{tt("Bölümler")}</h2>
            {seasons.map((n) => (
              <button key={n} className={"seg" + (n === season ? " on" : "")} onClick={() => setSeason(n)}>{tt("Sezon")} {n}</button>
            ))}
          </div>
          <div className="grid wide">
            {it.files.filter((f) => (f.season ?? 1) === season).map((f) => {
              const e = eps.find((x) => x.episode === f.episode);
              const r = recent.find((x) => x.path === f.path);
              const p = pct(r);
              return (
                <WideCard key={f.path} path={f.path} item={it} a={a} progress={r ? p : undefined}
                  still={e?.still ? `${IMG}w300${e.still}` : null}
                  title={`${f.episode}. ${e?.name ?? fileName(f.path)}`}
                  sub={[e?.runtime ? e.runtime + tt(" dk") : "", p > 92 ? tt("İzlendi") : r ? tt("{0} kaldı", fmtTime(r.duration - r.time)) : ""].filter(Boolean).join(" · ")} />
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

// ---------- menus & dialogs ----------
export type MenuEntry = { label: string; act: () => void; danger?: boolean } | "sep";

export function CardMenu({ x, y, entries, onClose }: { x: number; y: number; entries: MenuEntry[]; onClose: () => void }) {
  const W = 260;
  const left = Math.min(x, window.innerWidth - W - 8);
  const top = Math.min(y, window.innerHeight - entries.length * 36 - 16);
  return (
    <div className="cm-bg" onMouseDown={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }}>
      <div className="cm" style={{ left, top, width: W }} onMouseDown={(e) => e.stopPropagation()}>
        {entries.map((e, i) => e === "sep" ? <div key={i} className="cm-sep" /> : (
          <button key={i} className={"cm-item" + (e.danger ? " danger" : "")} onClick={() => { onClose(); e.act(); }}>
            <span className="cm-check" /><span className="grow">{e.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function Confirm({ title, text, ok, danger, onOk, onCancel }: {
  title: string; text: string; ok: string; danger?: boolean; onOk: () => void; onCancel: () => void;
}) {
  return (
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal" role="alertdialog" aria-modal="true">
        <h2>{title}</h2>
        <p className="modal-text">{text}</p>
        <div className="modal-actions">
          <button className="chip" onClick={onCancel} autoFocus>{tt("Vazgeç")}</button>
          <button className={"primary" + (danger ? " danger" : "")} onClick={onOk}>{ok}</button>
        </div>
      </div>
    </div>
  );
}

export function Rematch({ it, onPick, onCustom, onClose }: {
  it: Item; onPick: (h: SearchHit) => void; onCustom: (title: string, kind: "movie" | "tv") => void; onClose: () => void;
}) {
  const [q, setQ] = useState(it.meta?.title ?? it.parsed.title);
  const [kind, setKind] = useState<"movie" | "tv">(it.parsed.kind);
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [err, setErr] = useState("");
  // Results follow the typing; Enter / "Kaydet" keeps just the typed name, no picture needed.
  useEffect(() => {
    if (!q.trim() || !store.get("tmdbKey")) { setHits([]); return; }
    setErr("");
    setHits(null);
    const id = setTimeout(() => searchTmdb(q, kind).then(setHits).catch((e) => { setErr(String(e)); setHits([]); }), 350);
    return () => clearTimeout(id);
  }, [q, kind]);
  const saveName = () => q.trim() && onCustom(q.trim(), kind);
  return (
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal wide" onKeyDown={(e) => e.stopPropagation()}>
        <h2>{tt("Adını değiştir / eşleştir")}</h2>
        <div className="muted small ellipsis">{fileName(it.files[0].path)}</div>
        <div className="rm-row">
          <input value={q} autoFocus onChange={(e) => setQ(e.target.value)} aria-label={tt("Ad")}
            onKeyDown={(e) => e.key === "Enter" && saveName()} />
          <button className={"seg" + (kind === "movie" ? " on" : "")} onClick={() => setKind("movie")}>{tt("Film")}</button>
          <button className={"seg" + (kind === "tv" ? " on" : "")} onClick={() => setKind("tv")}>{tt("Dizi")}</button>
          <button className="primary" disabled={!q.trim()} onClick={saveName}>{tt("Kaydet")}</button>
        </div>
        <div className="muted small">{tt("Enter ya da Kaydet: sadece bu adı kullanır. Afişli bilgi istersen aşağıdan doğru olanı seç.")}</div>
        {err && <div className="muted">{err}</div>}
        <div className="rm-grid">
          {hits === null && !err && <div className="muted">{tt("Aranıyor…")}</div>}
          {hits?.length === 0 && <div className="muted">{tt("Sonuç yok.")}</div>}
          {hits?.map((h) => (
            <button key={h.id} className="poster" onClick={() => onPick(h)}>
              <div className="poster-img">{h.poster ? <img src={IMG + "w185" + h.poster} alt="" /> : <span>{h.title}</span>}</div>
              <div className="card-title">{h.title}</div>
              <div className="muted small">{h.year}</div>
            </button>
          ))}
        </div>
        <div className="modal-actions"><button className="chip" onClick={onClose}>{tt("Kapat")}</button></div>
      </div>
    </div>
  );
}

export function Settings({ onClose, onTour }: { onClose: () => void; onTour?: () => void }) {
  const [osKey, setOsKey] = useState(store.get("osKey") ?? "");
  const [tmdbKey, setTmdbKey] = useState(store.get("tmdbKey") ?? "");
  const [langs, setLangs] = useState(store.get("langs") ?? defaultSubLangs());
  const [autoFull, setAutoFull] = useState(store.get("autoFull") !== "0");
  const [dlDir, setDlDir] = useState(store.get("dlDir") ?? "");
  const [gemKey, setGemKey] = useState(store.get("geminiKey") ?? "");
  const [gemModel, setGemModel] = useState(store.get("geminiModel") ?? "gemini-3.1-flash-lite");
  const [models, setModels] = useState<[string, string][]>([]);
  const [modelsMsg, setModelsMsg] = useState(tt("Önce API anahtarını gir"));
  const loadModels = () => {
    if (!gemKey.trim()) return;
    setModelsMsg(tt("Modeller yükleniyor…"));
    invoke<[string, string][]>("gemini_models", { key: gemKey.trim() })
      .then((l) => { setModels(l.sort((x, y) => y[0].localeCompare(x[0]))); store.set("geminiModelIds", JSON.stringify(l.map(([id]) => id))); setModelsMsg(l.length ? "" : tt("Model bulunamadı")); })
      .catch((e) => { setModels([]); setModelsMsg(String(e).slice(0, 80)); });
  };
  useEffect(() => { if (store.get("geminiKey")) loadModels(); }, []);
  useEffect(() => { if (!dlDir) invoke<string | null>("downloads_dir").then((d) => d && setDlDir(d)); }, []);
  const pickDl = async () => {
    const d = await open({ directory: true, multiple: false });
    if (typeof d === "string") setDlDir(d);
  };
  const save = () => {
    const keyChanged = tmdbKey.trim() !== (store.get("tmdbKey") ?? "");
    if (keyChanged) {
      // Forget earlier "not found" results so everything is looked up again with the new key.
      const meta = store.json<Record<string, unknown>>("meta", {});
      for (const k of Object.keys(meta)) if (meta[k] == null) delete meta[k];
      store.set("meta", JSON.stringify(meta));
    }
    store.set("osKey", osKey.trim());
    store.set("tmdbKey", tmdbKey.trim());
    store.set("langs", langs.trim());
    store.set("autoFull", autoFull ? "1" : "0");
    if (dlDir) store.set("dlDir", dlDir);
    store.set("geminiKey", gemKey.trim());
    store.set("geminiModel", gemModel.trim() || "gemini-flash-latest");
    onClose();
    // Reload so the library, posters and details pick up the new settings right away.
    window.location.reload();
  };
  return (
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>{tt("Ayarlar")}{onTour && <button className="tour-again" onClick={onTour}>{tt("Tanıtımı göster")}</button>}</h2>
        <div className="field">
          <span>{tt("Dil")}</span>
          <div className="seg-row">
            <button className={"seg" + (lang() === "en" ? " on" : "")} onClick={() => lang() !== "en" && setLang("en")}>English</button>
            <button className={"seg" + (lang() === "tr" ? " on" : "")} onClick={() => lang() !== "tr" && setLang("tr")}>Türkçe</button>
          </div>
        </div>
        <label>{tt("TMDB API anahtarı (afiş, özet, oyuncular)")}
          <input value={tmdbKey} onChange={(e) => setTmdbKey(e.target.value)} placeholder={tt("themoviedb.org › Ayarlar › API")} />
        </label>
        <label>{tt("OpenSubtitles API anahtarı (otomatik altyazı)")}
          <input value={osKey} onChange={(e) => setOsKey(e.target.value)} placeholder="opensubtitles.com › Profil › API consumers" />
        </label>
        <label>{tt("Gemini API anahtarı (film asistanı)")}
          <input value={gemKey} onChange={(e) => setGemKey(e.target.value)} placeholder="aistudio.google.com › Get API key" />
        </label>
        <div className="field">
          <span>{tt("Gemini modeli")}</span>
          <div className="gem-model">
            <select value={models.some(([id]) => id === gemModel) ? gemModel : ""} onChange={(e) => { if (e.target.value) { setGemModel(e.target.value); store.set("geminiModel", e.target.value); } }}>
              <option value="">{models.length ? tt("Listeden seç…") : modelsMsg}</option>
              {models.map(([id, name]) => <option key={id} value={id}>{name} ({id})</option>)}
            </select>
            <button className="chip" onClick={loadModels} disabled={!gemKey.trim()}>{tt("Listeyi yenile")}</button>
          </div>
          <input value={gemModel} onChange={(e) => setGemModel(e.target.value)} placeholder={tt("ya da model adını yaz: gemini-flash-latest")} />
        </div>
        <div className="field">
          <span>{tt("Altyazı görünümü")}</span>
          <SubAppearance />
        </div>
        <UpscalerSettings />
        <PluginSettings />
        <div className="field">
          <span>{tt("Torrent indirme klasörü")}</span>
          <div className="dir"><Icon d={I.folder} size={18} /><span className="grow ellipsis">{dlDir || "…"}</span>
            <button className="chip" onClick={pickDl}>{tt("Değiştir…")}</button></div>
        </div>
        <label className="look-check">
          <input type="checkbox" checked={autoFull} onChange={(e) => setAutoFull(e.target.checked)} />
          
          {tt("Oynatınca tam ekran başlat")}
        </label>
        <label>{tt("Altyazı dilleri (öncelik sırasıyla)")}
          <input value={langs} onChange={(e) => setLangs(e.target.value)} />
        </label>
        <div className="muted small">{tt("Kütüphane klasörleri artık “Klasörler” sekmesinde.")}</div>
        <div className="modal-actions">
          <button className="chip" onClick={onClose}>{tt("Vazgeç")}</button>
          <button className="primary" onClick={save}>{tt("Kaydet")}</button>
        </div>
      </div>
    </div>
  );
}

/** Details-page block for a library title whose video file is gone. */
export function MissingPanel({ onRelink, onMagnet, onForget }: {
  onRelink: (newPath: string) => void; onMagnet: (src: string) => void; onForget: () => void;
}) {
  const [mag, setMag] = useState<string | null>(null);
  const pick = async () => {
    const f = await open({ multiple: false, filters: [{ name: "Video", extensions: ["mkv", "mp4", "avi", "mov", "wmv", "webm", "m4v", "ts", "m2ts", "mpg", "mpeg"] }] });
    if (typeof f === "string") onRelink(f);
  };
  return (
    <div className="dlp missing">
      <div className="dlp-head"><b>{tt("Dosya bulunamadı")}</b><span className="muted small">{tt("taşınmış, silinmiş ya da disk takılı değil")}</span></div>
      {mag == null ? (
        <div className="missing-actions">
          <button className="ghost sm" onClick={pick}><Icon d={I.folder} size={16} />  {tt("Dosyayı göster")}</button>
          <button className="ghost sm" onClick={() => setMag("")}><Icon d={I.magnet} size={16} />  {tt("Magnet ekle")}</button>
          <button className="chip" onClick={onForget}>{tt("Kütüphaneden kaldır")}</button>
        </div>
      ) : (
        <form className="missing-actions" onSubmit={(e) => { e.preventDefault(); if (mag.trim()) onMagnet(mag.trim()); }}>
          <input className="missing-input" autoFocus value={mag} onChange={(e) => setMag(e.target.value)} placeholder={tt("magnet:?xt=… ya da .torrent adresi")} />
          <button className="primary sm" disabled={!mag.trim()}>{tt("Kaydet")}</button>
          <button type="button" className="chip" onClick={() => setMag(null)}>{tt("Vazgeç")}</button>
        </form>
      )}
      <div className="muted small">{tt("Altyazı, ses/görüntü ayarları ve kaldığın yer yeni dosyaya taşınır.")}</div>
    </div>
  );
}
