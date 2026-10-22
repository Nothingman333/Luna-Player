import { defaultSubLangs, lang, setLang, tt, DEC } from "./i18n";
import { BUILD_AGENT, BUILD_AGENT_NAMES, VERSION_LABEL } from "./version";
import { UpdateSettings } from "./Update";
import { STACK } from "./Mine";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { FilmDecisionPanel } from "./FilmDecision";
import { Switch } from "./FilmReviewAi";
import { askAssistant, TasteButtons, TrText, youtubeTrailer } from "./Taste";
import { PluginSettings } from "./Web";
import { AddonSettings } from "./Addons";
import { SourceSettings } from "./Opds";
import { UpscalerSettings } from "./Upscaler";
import { openUrl } from "@tauri-apps/plugin-opener";
import { fmtTime } from "./mpv";
import { SubAppearance } from "./PlayerMenu";
import { LibraryToolbar } from "./LibraryToolbar";
import { libraryStats, selectLibrary, LibrarySort, LibraryFilter } from "./libraryTools";
import { BackupSettings } from "./Backup";
import { AI_PROVIDERS, AiProvider, AiProfile, aiModels, aiProfiles, saveAiProfiles, profileKeyName, PROFILE_SLOTS } from "./ai";
import {
  besideCopies, Episode, FolderKind, fmtSize, IMG, Item, qualityBadges, Recent, renameVideo, SearchHit, searchTmdb, seasonEpisodes, sidecarSubs, store, flushSecrets,
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
      <linearGradient id="lm-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style={{ stopColor: "var(--accent-soft, #FFB070)" }} /><stop offset="0.6" style={{ stopColor: "var(--accent, #E8701A)" }} /><stop offset="1" style={{ stopColor: "var(--accent-deep, #B4470C)" }} /></linearGradient>
      <mask id="lm-k"><rect width="240" height="240" fill="#fff" /><circle cx="38" cy="120" r="58" fill="#000" /></mask>
    </defs>
    <path d="M64 36 Q50 28 50 44 L50 196 Q50 212 64 204 L204 130 Q218 120 204 110 Z" fill="url(#lm-g)" mask="url(#lm-k)" />
    <circle cx="44" cy="120" r="18" style={{ fill: "var(--accent-soft, #FFB070)" }} />
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
  s != null ? `S${String(s).padStart(2, "0")} · ${lang() === "tr" ? "B" : "E"}${String(e).padStart(2, "0")}` : "";

/** What "Continue" plays for an item: last watched file, or the next one if it was finished. */
export function resumeTarget(it: Item, recent: Recent[]) {
  const watched = recent.find((r) => it.files.some((f) => f.path === r.path));
  if (!watched) return { file: it.files[0], rec: undefined };
  const idx = it.files.findIndex((f) => f.path === watched.path);
  // finished: watched to the end, or marked "I finished this episode" by hand
  if ((pct(watched) >= 95 || isFinished(watched.path)) && idx + 1 < it.files.length) return { file: it.files[idx + 1], rec: undefined };
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
  /** All copies of a film in the library (the same film twice: 1080p and 4K…). */
  copies?: (it: Item) => string[];
};

export function Badges({ path, big, compact }: { path?: string; big?: boolean; compact?: boolean }) {
  // Reads the cached result, or waits for the background probe of this file.
  const info = useMediaInfo(path);
  const [, bump] = useState(0);
  useEffect(() => { const f = () => bump((n) => n + 1); window.addEventListener("luna-subs", f); return () => window.removeEventListener("luna-subs", f); }, []);
  const all = qualityBadges(info, path);
  // On small cards only what matters at a glance: resolution and HDR type.
  const list = compact ? all.filter((b) => /^(4K|8K|2K|1080p|720p|480p|SD)$|HDR|HLG|Dolby/.test(b)).slice(0, 2) : all;
  // a subtitle file next to the video (or one added by hand)
  if (path && (sidecarSubs(path) > 0 || store.get("extSub:" + path))) list.push("SRT");
  if (!list.length) return null;
  return (
    <div className={"badges" + (big ? " big" : "")}>
      {list.map((b) => (
        <span key={b} className={"qb" + (/HDR|HLG|Dolby/.test(b) ? " hdr" : b === "4K" ? " uhd" : b === "SRT" ? " srt" : "")} title={b === "SRT" ? tt("Altyazı dosyası var") : undefined}>{b}</span>
      ))}
    </div>
  );
}

// ---------- header ----------
export type View = "home" | "discover" | "movies" | "shows" | "folders" | "downloads" | "recs";

export type Mode = "film" | "music" | "books";
const LINK = "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1";
const MODE_ICON: Record<Mode, string> = {
  film: "M4 4h16v16H4zM8 4v16M16 4v16",
  music: "M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  books: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 21V5",
};
/** Film · Müzik · Kitap: each part of Luna has its own colour. */
export function ModeSwitch({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  const modes: [Mode, string, boolean][] = [["film", tt("Film"), true], ["music", tt("Müzik"), true], ["books", tt("Kitap"), true]];
  return (
    <nav className="mode-switch" aria-label={tt("Mod")}>
      {modes.map(([m, label, ready]) => (
        <button key={m} className={"mode-btn" + (m === mode ? " on" : "")} disabled={!ready} title={ready ? label : tt("Yakında")}
          onClick={() => setMode(m)} aria-pressed={m === mode}>
          <Icon d={MODE_ICON[m]} size={15} /><span className="lbl">{label}</span>
        </button>
      ))}
    </nav>
  );
}

export function Header({ mode, setMode, tabs: modeTabs, view, setView, query, setQuery, scanning, onOpen, onSettings, onTorrent, downloading, onMine }: {
  mode: Mode; setMode: (m: Mode) => void; tabs?: [string, string][];
  view: string; setView: (v: any) => void; query: string; setQuery: (q: string) => void;
  scanning: boolean; onOpen: () => void; onSettings: () => void; onTorrent: () => void; downloading: number; onMine: () => void;
}) {
  const film = mode === "film";
  const tabs: [string, string][] = modeTabs ?? [["home", tt("Ana sayfa")], ["discover", tt("Keşfet")], ["movies", tt("Filmler")], ["shows", tt("Diziler")], ["recs", tt("Öneriler")], ["folders", tt("Klasörler")], ["downloads", tt("İndirmeler")]];
  // On a narrow window the tabs scroll sideways: the wheel scrolls them, the edges fade where more tabs wait,
  // and the open tab is brought into view
  const nav = useRef<HTMLElement>(null);
  const [edges, setEdges] = useState("");
  useEffect(() => {
    const n = nav.current;
    if (!n) return;
    const look = () => setEdges((n.scrollLeft > 2 ? " more-l" : "") + (n.scrollLeft + n.clientWidth < n.scrollWidth - 2 ? " more-r" : ""));
    const wheel = (e: WheelEvent) => {
      if (n.scrollWidth <= n.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      n.scrollLeft += e.deltaY;
    };
    look();
    n.addEventListener("scroll", look);
    n.addEventListener("wheel", wheel, { passive: false });
    const ro = new ResizeObserver(look);
    ro.observe(n);
    return () => { n.removeEventListener("scroll", look); n.removeEventListener("wheel", wheel); ro.disconnect(); };
  }, [mode]);
  useEffect(() => { nav.current?.querySelector<HTMLElement>(".tab.on")?.scrollIntoView({ block: "nearest", inline: "nearest" }); }, [view, mode]);
  // The labels fold away one step at a time only while the tabs don't fit (any screen width, any
  // language): the buttons' words first, then the other parts' names, then "Dosya aç"'s.
  const head = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const h = head.current, n = nav.current;
    if (!h || !n) return;
    const FOLDS = ["fold-1", "fold-2", "fold-3"];
    const fit = () => {
      h.classList.remove(...FOLDS);
      for (const f of FOLDS) {
        if (n.scrollWidth <= n.clientWidth + 1) break;
        h.classList.add(f);
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(h);
    return () => ro.disconnect();
  }, [mode, tabs.length, downloading > 0, scanning]);
  return (
    <header className="app-header" ref={head}>
      <div className="brand"><LunaMark /></div>
      <ModeSwitch mode={mode} setMode={setMode} />
      <nav className={"tabs" + edges} ref={nav}>
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
        <input value={query} placeholder={film ? tt("Ara") : mode === "music" ? tt("Müzikte ara") : tt("Kitaplarda ara")} aria-label={film ? tt("Kütüphanede ara") : mode === "music" ? tt("Müzikte ara") : tt("Kitaplarda ara")}
          onChange={(e) => { setQuery(e.target.value); if (e.target.value && view === "home") setView(film ? "movies" : "library"); }} />
      </label>
      <button className="ghost sm hdr-btn" onClick={onTorrent} title={tt("Bağlantı aç: magnet, torrent ya da video adresi (Ctrl+N)")} aria-label={tt("Bağlantı aç")}>
        <Icon d={film ? I.magnet : LINK} size={18} /><span className="lbl">{tt("Bağlantı")}</span>
      </button>
      <button className="ghost sm hdr-btn" onClick={onMine} title={tt("Koleksiyonlar ve geçmiş: film, müzik, kitap bir arada")} aria-label={tt("Koleksiyonlar")}>
        <Icon d={STACK} size={18} /><span className="lbl">{tt("Koleksiyonlar")}</span>
      </button>
      <button className="round gear" aria-label={tt("Ayarlar")} title={tt("Ayarlar")} onClick={onSettings}><Icon d={I.gear} /></button>
      <button className="primary hdr-open" onClick={onOpen} title={film ? tt("Dosya aç (Ctrl+O)") : mode === "music" ? tt("Müzik dosyası aç") : tt("Kitap dosyası aç (EPUB, PDF, CBZ)")}><Icon d={I.folder} size={18} /><span className="lbl">{tt("Dosya aç")}</span></button>
    </header>
  );
}

// ---------- cards ----------
function Poster({ it, a }: { it: Item; a: Actions }) {
  const m = it.meta;
  const n = it.parsed.kind === "tv" ? 0 : (a.copies?.(it) ?? it.files.map((f) => f.path)).length;
  const thumb = useThumb(it.files[0].path, !m?.poster);
  return (
    <button className="poster" onClick={() => a.details(it.key)}
      onContextMenu={(e) => a.menu(e, { path: it.files[0].path, item: it })}>
      <div className={"poster-img" + (it.files.every((f) => isRemote(f.path) || a.missing.has(f.path)) ? " remote" : "")}
        title={it.files.every((f) => isRemote(f.path)) ? tt("İndirilmeli · detaylardan indirebilirsin")
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
        {it.parsed.kind !== "tv" && n > 1 && <span className="copies-n" title={tt("Bu filmden {0} kopya var; detaylarda hangisini izleyeceğini seçersin", n)}>{m?.year || it.parsed.year ? " · " : ""}{tt("{0} kopya", n)}</span>}
      </div>
    </button>
  );
}

/** Ready questions about a film or series: the top of its right-click menu. */
export const filmAsks = (it: Item): MenuEntry[] => titleAsks(it.meta?.title ?? it.parsed.title, it.meta?.year ?? it.parsed.year, it.parsed.kind);
export const titleAsks = (t: string, y: string | number | undefined, kind?: string): MenuEntry[] => {
  const tv = kind === "tv";
  const n = y ? `“${t}” (${y})` : `“${t}”`;
  return [
    { label: "✦  " + (tv ? tt("Bu dizi ne hakkında?") : tt("Bu film ne hakkında?")), act: () => askAssistant(tv ? tt("{0} dizisi ne hakkında? Spoiler vermeden anlat", n) : tt("{0} filmi ne hakkında? Spoiler vermeden anlat", n)) },
    { label: "✦  " + (tv ? tt("Bu dizinin kitabı var mı?") : tt("Bu filmin kitabı var mı?")), act: () => askAssistant(tv ? tt("{0} dizisinin kitabı var mı?", n) : tt("{0} filminin kitabı var mı?", n)) },
    { label: "✦  " + (tv ? tt("Bu dizide hangi şarkılar çalıyor?") : tt("Bu filmde hangi şarkılar çalıyor?")), act: () => askAssistant(tv ? tt("{0} dizisinde hangi şarkılar çalıyor?", n) : tt("{0} filminde hangi şarkılar çalıyor?", n)) },
    { label: "✦  " + tt("İlginç bilgiler (trivia)"), act: () => askAssistant(tt("{0} hakkında ilginç bilgiler", n)) },
    { label: "✦  " + (tv ? tt("Buna benzer diziler") : tt("Buna benzer filmler")), act: () => askAssistant(tv ? tt("{0} dizisine benzer diziler öner", n) : tt("{0} filmine benzer filmler öner", n)) },
    { label: "✦  " + tt("Bu bana uygun mu?"), act: () => askAssistant(tt("{0} bana uygun mu?", n)) },
  ];
};

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
        title={isRemote(path) ? tt("İndirilmeli · oynatınca torrent'ten akar") : undefined}>
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
  // (one index for the text and the picture, also after the list got shorter)
  const cur = Math.min(i, n - 1);
  const s = slides[cur];
  const it = s.item;
  const f = it?.files.find((x) => x.path === s.path);
  const title = it?.meta?.title ?? it?.parsed.title ?? s.rec?.title ?? "";
  return (
    <section className="hero clickable" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onClick={() => (it ? a.details(it.key) : a.play(s.path))} onContextMenu={(e) => a.menu(e, { path: s.path, item: it })}>
      {slides.map((sl, k) => (
        <HeroBg key={sl.kind + sl.path} on={k === cur} path={sl.path} backdrop={sl.item?.meta?.backdrop} />
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
            {it?.meta?.rating ? `★ ${String(it.meta.rating).replace(".", DEC)} · ` : ""}{it?.meta?.year}
            {it?.meta?.genres?.length ? " · " + it.meta.genres.slice(0, 3).join(", ") : ""}
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

/** No library folder yet: Luna asks where the films and the series are (one click each opens the folder picker). */
function FolderAsk({ onAdd, big }: { onAdd: (k: FolderKind) => void; big?: boolean }) {
  return (
    <section className={"folder-ask" + (big ? " big" : "")}>
      <div className="fa-ic"><Icon d={I.folder} size={big ? 34 : 24} /></div>
      <div className="fa-t">
        <h2>{tt("Filmlerin nerede?")}</h2>
        <div className="muted">{tt("Film ve dizilerinin olduğu klasörü seç; Luna içindekileri tanır, afişleri ve bilgileri getirir. Diziler ayrı bir klasördeyse onu da dizi olarak ekle.")}</div>
      </div>
      <div className="fa-b">
        <button className="primary" onClick={() => onAdd("movie")}><Icon d={I.folder} size={18} />  {tt("Film klasörü seç")}</button>
        <button className="ghost" onClick={() => onAdd("tv")}>{tt("Dizi klasörü seç")}</button>
      </div>
    </section>
  );
}

/** The folder picker for a Films / Series library folder. */
export async function pickFolder(): Promise<string | null> {
  const d = await open({ directory: true, multiple: false });
  return typeof d === "string" ? d : null;
}

export function Home({ items, recent, hasFolders, a, onAddFolder, downloads }: {
  items: Item[]; recent: Recent[]; hasFolders: boolean; a: Actions; onAddFolder: (k: FolderKind) => void; downloads?: React.ReactNode;
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
      {slides.length ? <HeroSlider slides={slides} a={a} /> : !hasFolders ? <FolderAsk onAdd={onAddFolder} big /> : (
        <section className="hero empty">
          <h1>{tt("Bir video sürükle bırak")}</h1>
          <div className="muted">{tt("ya da “Dosya aç”a bas. Altyazı yoksa otomatik bulunur.")}</div>
        </section>
      )}
      {slides.length > 0 && !hasFolders && <FolderAsk onAdd={onAddFolder} />}

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
      {movies.length > 0 && <PosterRow title={tt("Filmler")} items={besideCopies(movies)} a={a} />}
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
  const q = query.trim().toLocaleLowerCase(lang() === "tr" ? "tr" : "en");
  const [sort, setSort] = useState<LibrarySort>("az");
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const [genre, setGenre] = useState("");
  useEffect(() => { setGenre(""); setFilter("all"); setSort("az"); }, [title]);
  const stats = libraryStats(items);
  const genres = [...new Set(items.flatMap((i) => i.meta?.genres ?? []))].sort((a, b) => a.localeCompare(b, lang()));
  const list = selectLibrary(items, query, sort, filter, genre, lang());
  const shown = besideCopies(list);
  return (
    <div className="page">
      <section className="row">
        <h2>{q ? tt("Yerel dosyalar · “{0}”", query) : title} <span className="muted small">{list.length}</span></h2>
        <LibraryToolbar files={stats.files} unmatched={stats.unmatched} versions={stats.versions.size} genres={genres}
          sort={sort} filter={filter} genre={genre} setSort={setSort} setFilter={setFilter} setGenre={setGenre} />
        {list.length ? <div className="grid">{shown.map((it) => <Poster key={it.key} it={it} a={a} />)}</div>
          : <div className="muted empty-note library-empty">{q || filter !== "all" || genre ? tt("Eşleşen film yok.") : tt("Bir şey bulunamadı. Klasörler sekmesinden kütüphaneye klasör ekleyebilirsin.")}</div>}
      </section>
    </div>
  );
}

// ---------- folders ----------
type Entry = { name: string; path: string; isDir: boolean; size: number; videos: number };

export function Folders({ roots, setRoots, kinds, onAdd, setKind, items, recent, a }: {
  roots: string[]; setRoots: (r: string[]) => void; kinds: Record<string, FolderKind>; onAdd: (k: FolderKind) => void;
  setKind: (dir: string, k: FolderKind) => void; items: Item[]; recent: Recent[]; a: Actions;
}) {
  const [cwd, setCwd] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [rootInfo, setRootInfo] = useState<Record<string, number>>({});
  // a file renamed or deleted: the open folder is read again
  const [again, setAgain] = useState(0);
  useEffect(() => { const f = () => setAgain((n) => n + 1); window.addEventListener("luna-library", f); return () => window.removeEventListener("luna-library", f); }, []);

  useEffect(() => {
    if (!cwd) return;
    let alive = true;
    invoke<Entry[]>("list_dir", { path: cwd }).then((e) => alive && setEntries(e)).catch(() => alive && setEntries([]));
    return () => { alive = false; };
  }, [cwd, again]);
  useEffect(() => setEntries([]), [cwd]);
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
      .then((e) => setRootInfo((m) => ({ ...m, [r]: (e ?? []).reduce((n, x) => n + (x.isDir ? x.videos : 1), 0) })))
      .catch(() => {}));
  }, [roots.join("|")]);


  const root = cwd ? roots.find((r) => {
    const a = cwd.toLowerCase().replace(/[\\/]+$/, ""), b = r.toLowerCase().replace(/[\\/]+$/, "");
    return a === b || a.startsWith(b + "\\") || a.startsWith(b + "/");
  }) : undefined;
  const rootBare = root?.replace(/[\\/]+$/, "") ?? "";
  const crumbs = cwd && root ? [root, ...cwd.slice(rootBare.length).split(/[\\/]/).filter(Boolean)] : [];
  const crumbPath = (i: number) => i === 0 ? root! : rootBare + "\\" + crumbs.slice(1, i + 1).join("\\");

  const tiles = (list: string[]) => (
          <div className="grid folders">
            {list.map((r) => (
              <div key={r} className="folder-tile" role="button" tabIndex={0} onClick={() => setCwd(r)}
                onKeyDown={(e) => e.key === "Enter" && setCwd(r)}>
                <Icon d={I.folder} size={40} />
                <div className="ellipsis folder-name">{fileName(r) || r}</div>
                <div className="muted small ellipsis">{r}</div>
                <div className="muted small">{rootInfo[r] != null ? tt("{0} video", rootInfo[r]) : "…"}</div>
                <button className="chip sm tile-kind" title={tt("Bu klasördekiler nasıl tanınsın")}
                  onClick={(e) => { e.stopPropagation(); setKind(r, kinds[r] === "tv" ? "movie" : "tv"); }} onKeyDown={(e) => e.stopPropagation()}>
                  {kinds[r] === "tv" ? tt("Filmlere taşı") : tt("Dizilere taşı")}
                </button>
                <button className="icon sm tile-x" aria-label={tt("Kütüphaneden çıkar")}
                  onClick={(e) => { e.stopPropagation(); setRoots(roots.filter((x) => x !== r)); }}
                  onKeyDown={(e) => e.stopPropagation()}>
                  <Icon d={I.x} size={16} />
                </button>
              </div>
            ))}
          </div>
  );
  const filmRoots = roots.filter((r) => kinds[r] !== "tv");
  const tvRoots = roots.filter((r) => kinds[r] === "tv");
  if (!cwd)
    return (
      <div className="page">
        {roots.length === 0 && <FolderAsk onAdd={onAdd} big />}
        {roots.length > 0 && (
          <>
            <section className="row">
              <div className="row-head"><h2>{tt("Film klasörleri")}</h2><span className="grow" />
                <button className="ghost sm" onClick={() => onAdd("movie")}><Icon d={I.plus} size={18} />  {tt("Film klasörü ekle")}</button>
              </div>
              {filmRoots.length ? tiles(filmRoots) : <div className="muted empty-note">{tt("Filmlerin olduğu klasörü ekle.")}</div>}
            </section>
            <section className="row">
              <div className="row-head"><h2>{tt("Dizi klasörleri")}</h2><span className="grow" />
                <button className="ghost sm" onClick={() => onAdd("tv")}><Icon d={I.plus} size={18} />  {tt("Dizi klasörü ekle")}</button>
              </div>
              {tvRoots.length ? tiles(tvRoots) : <div className="muted empty-note">{tt("Diziler ayrı bir klasördeyse onu buraya ekle: her dizi kendi klasöründe, bölümler “S01E02” ya da “02” gibi numaralı olabilir.")}</div>}
            </section>
          </>
        )}
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
/** One copy of a film on the details page: its quality, subtitles, size and file name. */
function CopyChip({ path, on, gone, onPick, onMenu }: { path: string; on: boolean; gone: boolean; onPick: () => void; onMenu: (e: React.MouseEvent) => void }) {
  const info = useMediaInfo(path);
  return (
    <button className={"copy" + (on ? " on" : "") + (gone ? " gone" : "")} role="radio" aria-checked={on} onClick={onPick} onContextMenu={onMenu} title={path}>
      <span className="copy-top"><Badges path={path} compact />{info?.size ? <span className="muted small">{fmtSize(info.size)}</span> : null}</span>
      <span className="copy-name ellipsis">{gone ? tt("Dosya yok · ") : ""}{fileName(path)}</span>
    </button>
  );
}

export function Details({ it, recent, a, onBack, onAddSub, download, onAsk, missingPanel }: {
  it: Item; recent: Recent[]; a: Actions; onBack: () => void; onAddSub: (path: string) => void; download?: React.ReactNode;
  onAsk?: () => void; missingPanel?: React.ReactNode;
}) {
  const [, rerender] = useState(0);
  const allDone = it.files.every((f) => isFinished(f.path));
  const m = it.meta;
  const isTv = it.parsed.kind === "tv";
  const seasons = [...new Set(it.files.map((f) => f.season ?? 1))].sort((x, y) => x - y);
  // a film found more than once: the user picks which copy to watch (last watched one first)
  const copies = isTv ? [] : a.copies?.(it) ?? it.files.map((f) => f.path);
  const [pick, setPick] = useState<string | null>(null);
  const chosen = copies.length > 1 ? pick ?? recent.find((r) => copies.includes(r.path))?.path ?? copies[0] : null;
  const { file, rec } = chosen ? { file: { path: chosen }, rec: recent.find((r) => r.path === chosen) } as { file: { path: string; season?: number; episode?: number }; rec?: Recent } : resumeTarget(it, recent);
  const [season, setSeason] = useState(file.season ?? seasons[0] ?? 1);
  const [eps, setEps] = useState<Episode[]>([]);
  const [more, setMore] = useState(false);
  const info = useMediaInfo(file.path);

  useEffect(() => {
    setEps([]);
    if (!isTv || !m || m.id <= 0) return;
    let alive = true;
    seasonEpisodes(m.id, season).then((l) => alive && setEps(l));
    return () => { alive = false; };
  }, [isTv, m?.id, season]);

  const extSub = store.get("extSub:" + file.path);
  const hasSub = store.get("hasSub:" + file.path) === "1" || sidecarSubs(file.path) > 0;
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
                ★ {String(m.rating).replace(".", DEC)}
              </button>
            )}
            {m?.year && <span>{m.year}</span>}
            {m?.seasons && <span>{m.seasons}  {tt("sezon")}</span>}
            {m?.runtime ? <span>{Math.floor(m.runtime / 60)}  {tt("sa")} {m.runtime % 60}  {tt("dk")}</span> : null}
            {m?.genres?.length ? <span>{m.genres.slice(0, 3).join(", ")}</span> : null}
          </div>
          <Badges path={file.path} big />
          {copies.length > 1 && (
            <div className="copies">
              <div className="muted small">{tt("Bu filmden {0} kopya var; izlemek istediğini seç:", copies.length)}</div>
              <div className="copy-list" role="radiogroup" aria-label={tt("Kopyalar")}>
                {copies.map((p) => <CopyChip key={p} path={p} on={p === file.path} gone={a.missing.has(p)} onPick={() => setPick(p)} onMenu={(e) => a.menu(e, { path: p, item: it })} />)}
              </div>
            </div>
          )}
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

      <FilmDecisionPanel key={it.key} film={{ title: m?.title ?? it.parsed.title, year: m?.year ?? it.parsed.year, kind: m?.kind ?? it.parsed.kind, id: m?.id, rating: m?.rating }} />

      {m?.cast?.length ? (
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
      ) : null}

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
                  sub={[e?.runtime ? e.runtime + tt(" dk") : "", p >= 95 || isFinished(f.path) ? tt("İzlendi") : r ? tt("{0} kaldı", fmtTime(r.duration - r.time)) : ""].filter(Boolean).join(" · ")} />
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
let menuState: { x: number; y: number; entries: MenuEntry[] } | null = null;
const menuSubs = new Set<() => void>();
/** Opens a right-click menu at the mouse (music, books: covers and rows). */
export function openMenu(e: React.MouseEvent, entries: MenuEntry[]) {
  e.preventDefault(); e.stopPropagation();
  menuState = { x: e.clientX, y: e.clientY, entries };
  lastMenuAt = { x: e.clientX, y: e.clientY };
  menuSubs.forEach((f) => f());
}
/** A second menu where the last one was (e.g. "Add to a collection…" → the collections). */
export function menuAgain(entries: MenuEntry[]) {
  const at = lastMenuAt;
  setTimeout(() => { menuState = { ...at, entries }; menuSubs.forEach((f) => f()); }, 0);
}
let lastMenuAt = { x: 0, y: 0 };
export function MenuHost() {
  const [, bump] = useState(0);
  useEffect(() => { const f = () => bump((n) => n + 1); menuSubs.add(f); return () => { menuSubs.delete(f); }; }, []);
  if (!menuState) return null;
  return <CardMenu x={menuState.x} y={menuState.y} entries={menuState.entries} onClose={() => { menuState = null; menuSubs.forEach((f) => f()); }} />;
}

export function CardMenu({ x, y, entries, onClose }: { x: number; y: number; entries: MenuEntry[]; onClose: () => void }) {
  const W = 260;
  const left = Math.min(x, window.innerWidth - W - 8);
  const top = Math.min(y, window.innerHeight - entries.length * 36 - 16);
  // on body, outside #root: when a workspace blurs the app, the menu must stay sharp and on top
  return createPortal(
    <div className="cm-bg" onMouseDown={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }}>
      <div className="cm" style={{ left, top, width: W }} onMouseDown={(e) => e.stopPropagation()}>
        {entries.map((e, i) => e === "sep" ? <div key={i} className="cm-sep" /> : (
          <button key={i} className={"cm-item" + (e.danger ? " danger" : "")} onClick={() => { onClose(); e.act(); }}>
            <span className="cm-check" /><span className="grow">{e.label}</span>
          </button>
        ))}
      </div>
    </div>,
    document.body,
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

/** Renames the video file on disk (its subtitle files go along). */
export function RenameFile({ path, onDone, onClose }: { path: string; onDone: (to: string) => void; onClose: () => void }) {
  const file = fileName(path);
  const ext = file.match(/\.[a-z0-9]{2,4}$/i)?.[0] ?? "";
  const [name, setName] = useState(file.slice(0, file.length - ext.length));
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (!name.trim() || busy) return;
    setBusy(true); setErr("");
    try { onDone(await renameVideo(path, name.trim())); } catch (e) { setErr(String(e).replace(/^Error: /, "")); setBusy(false); }
  };
  return (
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" onKeyDown={(e) => e.stopPropagation()}>
        <h2>{tt("Dosya adını değiştir")}</h2>
        <div className="muted small ellipsis" title={path}>{path}</div>
        <div className="rm-row">
          <input value={name} autoFocus onFocus={(e) => e.currentTarget.select()} onChange={(e) => setName(e.target.value)} aria-label={tt("Yeni ad")} spellCheck={false}
            onKeyDown={(e) => { if (e.key === "Enter") go(); if (e.key === "Escape") onClose(); }} />
          {ext && <span className="muted">{ext}</span>}
        </div>
        <div className="muted small">{tt("Yanındaki altyazı dosyaları da yeni adı alır; kaldığın yer ve diğer bilgiler korunur. Adında yıl olursa (ör. “Alien (1979)”) afişi daha doğru bulunur.")}</div>
        {err && <div className="rm-err">{err}</div>}
        <div className="modal-actions">
          <button className="chip" onClick={onClose}>{tt("Vazgeç")}</button>
          <button className="primary" disabled={!name.trim() || busy} onClick={go}>{busy ? tt("Değiştiriliyor…") : tt("Adını değiştir")}</button>
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
    let alive = true;
    const id = setTimeout(() => searchTmdb(q, kind).then((h) => alive && setHits(h)).catch((e) => { if (alive) { setErr(String(e)); setHits([]); } }), 350);
    return () => { alive = false; clearTimeout(id); };
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
          {hits?.length === 0 && <div className="muted">{q.trim() && store.get("tmdbKey") ? tt("Bulamadık; bu bir film olmayabilir ya da adını doğru yazdığından emin ol. Yine de Kaydet ile bu adı kullanabilirsin.") : tt("Sonuç yok.")}</div>}
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

type SetSec = "general" | "keys" | "subs" | "upscaler" | "addons" | "downloads" | "backup";
const SET_ICONS: Record<SetSec, string> = {
  general: I.gear,
  keys: "M15 7a4 4 0 1 1-3.9 4.9L3 20v-3h3v-3h3l1.1-1.1A4 4 0 0 1 15 7zM16.5 10.5h.01",
  subs: I.subs,
  upscaler: "M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z",
  addons: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM16.5 13v7M13 16.5h7",
  downloads: I.down,
  backup: "M12 3v12M7 10l5 5 5-5M5 21h14",
};

/** An API key: hidden like a password, with a link to where it's made. */
function KeyField({ label, hint, value, onChange, placeholder, url }: {
  label: string; hint: string; value: string; onChange: (v: string) => void; placeholder: string; url?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="set-key">
      <div className="set-key-top">
        <b>{label}</b>
        <span className={"set-state" + (value.trim() ? " ok" : "")}>{value.trim() ? tt("✓ Girildi") : tt("Girilmedi")}</span>
        <span className="grow" />
        {url && <button className="set-link" onClick={() => openUrl(url)}>{tt("Anahtar al ↗")}</button>}
      </div>
      <div className="set-hint">{hint}</div>
      <div className="set-key-in">
        <input type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          spellCheck={false} autoComplete="off" />
        <button className="set-eye" onClick={() => setShow((s) => !s)} aria-label={show ? tt("Gizle") : tt("Göster")} title={show ? tt("Gizle") : tt("Göster")}>
          {show ? tt("Gizle") : tt("Göster")}
        </button>
      </div>
    </div>
  );
}

export function Settings({ onClose, onTour, onSetup }: { onClose: () => void; onTour?: () => void; onSetup?: () => void }) {
  const [osKey, setOsKey] = useState(store.get("osKey") ?? "");
  const [tmdbKey, setTmdbKey] = useState(store.get("tmdbKey") ?? "");
  const [langs, setLangs] = useState(store.get("langs") ?? defaultSubLangs());
  const [autoFull, setAutoFull] = useState(store.get("autoFull") !== "0");
  const [dlDir, setDlDir] = useState(store.get("dlDir") ?? "");
  const [gemKey, setGemKey] = useState(store.get("geminiKey") ?? "");
  const [gemModel, setGemModel] = useState(store.get("geminiModel") ?? "gemini-3.1-flash-lite");
  const [models, setModels] = useState<[string, string][]>([]);
  // the assistant's service: Gemini, OpenAI, Claude or any OpenAI-compatible base URL
  const [prov, setProv] = useState<AiProvider>(() => (store.get("aiProvider") as AiProvider) || "gemini");
  // API profiles: named service + key + model sets; the assistant can use one ("" = the settings below)
  const [profs, setProfs] = useState<AiProfile[]>(aiProfiles);
  const [profKeys, setProfKeys] = useState<Record<number, string>>(() => Object.fromEntries(Array.from({ length: PROFILE_SLOTS }, (_, i) => [i + 1, store.get(profileKeyName(i + 1)) ?? ""])));
  const [actProf, setActProf] = useState(() => (aiProfiles().some((x) => String(x.slot) === store.get("aiProfile")) ? store.get("aiProfile")! : ""));
  // the AI that reads Letterboxd reviews ("Worth watching?"): "" = the assistant's
  const [rvProv, setRvProv] = useState<string>(store.get("reviewAiProvider") ?? "");
  const [rvModel, setRvModel] = useState(store.get("reviewAiModel") ?? "");
  const [rvCount, setRvCount] = useState(() => { const n = Number(store.get("reviewAiCount")); return [10, 20, 30, 50, 75, 100].includes(n) ? n : n >= 10 && n <= 100 ? Math.round(n / 10) * 10 : 50; });
  const [rvNote, setRvNote] = useState(store.get("reviewAiNote") ?? "");
  const [rvSpoil, setRvSpoil] = useState(store.get("reviewAiSpoilers") !== "0");
  const [aiKeys, setAiKeys] = useState<Record<string, string>>(() => Object.fromEntries(AI_PROVIDERS.filter((x) => x.id !== "gemini").map((x) => [x.keyName, store.get(x.keyName) ?? ""])));
  const [aiModelsBy, setAiModelsBy] = useState<Record<string, string>>(() => Object.fromEntries(AI_PROVIDERS.filter((x) => x.id !== "gemini").map((x) => [x.id, store.get("aiModel:" + x.id) ?? x.model])));
  const [base, setBase] = useState(store.get("aiBase") ?? "");
  const [otherList, setOtherList] = useState<string[]>([]);
  const [otherMsg, setOtherMsg] = useState("");
  const provSpec = AI_PROVIDERS.find((x) => x.id === prov)!;
  const loadOther = () => {
    const k = aiKeys[provSpec.keyName]?.trim() ?? "";
    if (prov === "gemini" || (prov !== "custom" && !k) || (prov === "custom" && !base.trim())) { setOtherList([]); setOtherMsg(prov === "custom" ? tt("Önce base URL'yi yaz") : tt("Önce API anahtarını gir")); return; }
    setOtherMsg(tt("Modeller yükleniyor…"));
    aiModels(prov, k || "-", base).then((l) => { setOtherList(l); setOtherMsg(l.length ? "" : tt("Model bulunamadı")); })
      .catch((e) => { setOtherList([]); setOtherMsg(String(e).slice(0, 120)); });
  };
  // the model list follows the service, its key and the base URL (after typing settles)
  const otherKey = aiKeys[provSpec.keyName] ?? "";
  useEffect(() => {
    setOtherList([]); setOtherMsg("");
    if (prov === "gemini") return;
    const id = setTimeout(loadOther, 700);
    return () => clearTimeout(id);
  }, [prov, base, otherKey]);
  const [modelsMsg, setModelsMsg] = useState(tt("Önce API anahtarını gir"));
  const [sec, setSecState] = useState<SetSec>(() => (store.get("setSec") as SetSec) || "general");
  const setSec = (s: SetSec) => { setSecState(s); store.set("setSec", s); };
  const loadModels = () => {
    if (!gemKey.trim()) return;
    setModelsMsg(tt("Modeller yükleniyor…"));
    invoke<[string, string][]>("gemini_models", { key: gemKey.trim() })
      .then((l) => { setModels(l.sort((x, y) => y[0].localeCompare(x[0]))); store.set("geminiModelIds", JSON.stringify(l.map(([id]) => id))); setModelsMsg(l.length ? "" : tt("Model bulunamadı")); })
      .catch((e) => { setModels([]); setModelsMsg(String(e).slice(0, 80)); });
  };
  useEffect(() => { if (store.get("geminiKey")) loadModels(); }, []);
  useEffect(() => { if (!dlDir) invoke<string | null>("downloads_dir").then((d) => d && setDlDir(d)); }, []);
  // the page behind goes blurred, like the assistant's big view
  useEffect(() => {
    document.body.classList.add("ws-open");
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => { document.body.classList.remove("ws-open"); window.removeEventListener("keydown", esc); };
  }, []);
  const pickDl = async () => {
    const d = await open({ directory: true, multiple: false });
    if (typeof d === "string") setDlDir(d);
  };
  // everything on the form, without closing (also used before the language switch reloads the app)
  const persist = async () => {
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
    store.set("aiProvider", prov);
    for (const [k, v] of Object.entries(aiKeys)) store.set(k, v.trim());
    for (const [id, m] of Object.entries(aiModelsBy)) store.set("aiModel:" + id, m.trim());
    store.set("aiBase", base.trim());
    const keep = profs.map((x) => ({ ...x, name: x.name.trim() || tt("Profil {0}", x.slot), model: x.model.trim(), base: x.base.trim() }));
    saveAiProfiles(keep);
    for (let i = 1; i <= PROFILE_SLOTS; i++) store.set(profileKeyName(i), keep.some((x) => x.slot === i) ? (profKeys[i] ?? "").trim() : "");
    store.set("aiProfile", keep.some((x) => String(x.slot) === actProf) ? actProf : "");
    store.set("reviewAiProvider", rvProv.startsWith("profile:") && !keep.some((x) => "profile:" + x.slot === rvProv) ? "" : rvProv);
    store.set("reviewAiModel", rvModel.trim());
    store.set("reviewAiCount", String(rvCount));
    store.set("reviewAiSpoilers", rvSpoil ? "1" : "0");
    store.set("reviewAiNote", rvNote.trim().slice(0, 1000));
    store.set("geminiModel", gemModel.trim() || "gemini-flash-latest");
    await flushSecrets();
  };
  const save = async () => {
    try { await persist(); onClose(); window.location.reload(); }
    catch (error) { alert(tt("Ayarlar kaydedilemedi: {0}", String(error))); }
  };
  const secs: [SetSec, string, string][] = [
    ["general", tt("Genel"), tt("Dil, tam ekran, tanıtım")],
    ["keys", tt("Hesaplar ve anahtarlar"), tt("TMDB, OpenSubtitles, asistan")],
    ["subs", tt("Altyazı"), tt("Diller ve görünüm")],
    ["upscaler", tt("Upscaler"), tt("Lossless Scaling ile yapay zekâ")],
    ["addons", tt("Eklentiler"), tt("Stremio, arama eklentileri, kitap kaynakları")],
    ["downloads", tt("İndirmeler"), tt("Torrent klasörü")],
    ["backup", tt("Yedekleme"), tt("Tek dosya, istersen buluta")],
  ];
  const cur = secs.find((x) => x[0] === sec) ?? secs[0];
  const aiSet = prov === "gemini" ? gemKey : prov === "custom" ? base : aiKeys[provSpec.keyName] ?? "";
  const missingKeys = [tmdbKey, osKey, aiSet].filter((k) => !k.trim()).length;
  return createPortal(
    <>
      <div className="chat-scrim" />
      <div className="chat-ws-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <div className="chat-ws glass set-ws" role="dialog" aria-label={tt("Ayarlar")}>
          <aside className="ws-side">
            <div className="ws-side-head">
              <div className="ws-brand"><Icon d={I.gear} size={18} />  {tt("Ayarlar")}</div>
            </div>
            <nav className="ws-hist set-nav">
              {secs.map(([id, label, sub]) => (
                <button key={id} className={"set-nav-i" + (id === sec ? " on" : "")} onClick={() => setSec(id)}>
                  <Icon d={SET_ICONS[id]} size={18} />
                  <span className="set-nav-t"><b>{label}</b><small>{sub}</small></span>
                  {id === "keys" && missingKeys > 0 && <span className="set-dot" title={tt("{0} anahtar eksik", missingKeys)}>{missingKeys}</span>}
                </button>
              ))}
            </nav>
            <div className="set-side-foot">
              {onTour && <button className="chip" onClick={onTour}>{tt("Tanıtımı göster")}</button>}
              {onSetup && <button className="chip" onClick={onSetup}>{tt("Sistem kontrolü")}</button>}
            </div>
          </aside>
          <section className="ws-main">
            <div className="chat-head set-head">
              <div>
                <h2 className="ws-title">{cur[1]}</h2>
                <div className="muted small">{cur[2]}</div>
              </div>
              <span className="grow" />
              <button className="round" aria-label={tt("Kapat")} title={tt("Kapat")} onClick={onClose}><Icon d={I.x} size={18} /></button>
            </div>
            <div className="set-body" key={sec}>
              {sec === "general" && (
                <>
                  <div className="set-card">
                    <div className="field">
                      <span>{tt("Dil")}</span>
                      <div className="seg-row">
                        <button className={"seg" + (lang() === "en" ? " on" : "")} onClick={async () => { if (lang() !== "en") { try { await persist(); setLang("en"); } catch (error) { alert(tt("Ayarlar kaydedilemedi: {0}", String(error))); } } }}>English</button>
                        <button className={"seg" + (lang() === "tr" ? " on" : "")} onClick={async () => { if (lang() !== "tr") { try { await persist(); setLang("tr"); } catch (error) { alert(tt("Ayarlar kaydedilemedi: {0}", String(error))); } } }}>Türkçe</button>
                      </div>
                      <div className="set-hint">{tt("Dil değişince uygulama yeniden yüklenir; diğer ayarların kaydedilir.")}</div>
                    </div>
                  </div>
                  <div className="set-card">
                    <div className="field">
                      <span>{tt("Sürüm")}</span>
                      <b className="set-version">{VERSION_LABEL}</b>
                      <div className="set-hint">{tt("Son değişikliği yapan model: {0}", BUILD_AGENT_NAMES[BUILD_AGENT] ?? BUILD_AGENT)}</div>
                      {/* the notice TMDB's API terms ask for */}
                      <div className="set-hint">{tt("Bu ürün TMDB API'sini kullanır ama TMDB tarafından onaylanmış ya da sertifikalandırılmış değildir. Film afişleri ve bilgileri TMDB'den gelir.")}</div>
                    </div>
                  </div>
                  <UpdateSettings onBackup={() => setSec("backup")} />
                  <div className="set-card">
                    <label className="look-check">
                      <input type="checkbox" checked={autoFull} onChange={(e) => setAutoFull(e.target.checked)} />
                      {tt("Oynatınca tam ekran başlat")}
                    </label>
                  </div>
                  <div className="set-card">
                    <label className="look-check">
                      <input type="checkbox" defaultChecked={store.get("uiFit") !== "0"} onChange={(e) => { store.set("uiFit", e.target.checked ? "1" : "0"); window.dispatchEvent(new Event("luna-fit")); }} />
                      {tt("Görünümü ekrana uydur")}
                    </label>
                    <div className="set-hint">{tt("Küçük ya da büyütülmüş ekranlarda (Windows ölçeği %125, %150…) Luna biraz küçülür; yazılar ve boşluklar 1920 genişliğindeki ekrandaki gibi yerleşir, üst çubuk sığar.")}</div>
                  </div>
                  <div className="set-card">
                    <label className="look-check">
                      <input type="checkbox" defaultChecked={store.get("clipOffer") !== "0"} onChange={(e) => { store.set("clipOffer", e.target.checked ? "1" : "0"); invoke("clipboard_offer", { on: e.target.checked }).catch(() => {}); }} />
                      {tt("Bağlantı kopyalayınca “İçe aktar” öner")}
                    </label>
                    <div className="set-hint">{tt("Başka bir yerde Spotify, YouTube, torrent, podcast ya da kitap bağlantısı kopyaladığında üstte 30 saniyeliğine küçük bir öneri çıkar. Panodaki başka hiçbir şey okunmaz ya da saklanmaz.")}</div>
                  </div>
                </>
              )}
              {sec === "keys" && (
                <>
                  <div className="set-note">{tt("Anahtarlar ücretsiz; Windows'un Kimlik Bilgileri kasasında, şifreli olarak sadece bu bilgisayarda saklanır.")}</div>
                  <div className="set-card">
                    <KeyField label="TMDB" hint={tt("Afişler, özetler, oyuncular, Keşfet ve sana özel öneriler")} value={tmdbKey} onChange={setTmdbKey}
                      placeholder={tt("themoviedb.org › Ayarlar › API")} url="https://www.themoviedb.org/settings/api" />
                  </div>
                  <div className="set-card">
                    <KeyField label="OpenSubtitles" hint={tt("Altyazı yoksa otomatik bulunur")} value={osKey} onChange={setOsKey}
                      placeholder="opensubtitles.com › Profil › API consumers" url="https://www.opensubtitles.com/consumers" />
                  </div>
                  <div className="set-card">
                    <div className="field">
                      <span>{tt("API profilleri")}</span>
                      <div className="set-hint">{tt("Birden fazla anahtar ve model kaydet (ör. iş OpenAI'si, ev Gemini'si, yerel Ollama). Asistan ve yorum analizi ayrı ayrı bir profil kullanabilir.")}</div>
                    </div>
                    {profs.map((x) => {
                      const sp = AI_PROVIDERS.find((a) => a.id === x.provider)!;
                      const edit = (c: Partial<AiProfile>) => setProfs((l) => l.map((y) => (y.slot === x.slot ? { ...y, ...c } : y)));
                      return (
                        <div key={x.slot} className="set-prof">
                          <div className="set-prof-top">
                            <input className="set-prof-name" value={x.name} maxLength={60} onChange={(e) => edit({ name: e.target.value })} placeholder={tt("Profil {0}", x.slot)} aria-label={tt("Profil adı")} />
                            <select value={x.provider} onChange={(e) => edit({ provider: e.target.value as AiProvider, model: "" })} aria-label={tt("Servis")}>
                              {AI_PROVIDERS.map((a) => <option key={a.id} value={a.id}>{a.id === "custom" ? tt("Başka (base URL)") : a.name}</option>)}
                            </select>
                            <label className="look-check set-radio"><input type="radio" name="actProf" checked={actProf === String(x.slot)} onChange={() => setActProf(String(x.slot))} />{tt("Asistan kullansın")}</label>
                            <button className="chip" onClick={() => { setProfs((l) => l.filter((y) => y.slot !== x.slot)); if (actProf === String(x.slot)) setActProf(""); if (rvProv === "profile:" + x.slot) setRvProv(""); }}>{tt("Sil")}</button>
                          </div>
                          {x.provider === "custom" && <label>{tt("Base URL")}<input value={x.base} onChange={(e) => edit({ base: e.target.value })} placeholder="https://openrouter.ai/api/v1  ·  http://localhost:11434/v1" spellCheck={false} /></label>}
                          <KeyField label={tt("API anahtarı")} hint={x.provider === "custom" ? tt("Yerel sunucular için boş bırak") : sp.name} value={profKeys[x.slot] ?? ""} onChange={(v) => setProfKeys((m) => ({ ...m, [x.slot]: v }))} placeholder={x.provider === "openai" ? "sk-…" : x.provider === "claude" ? "sk-ant-…" : ""} url={sp.keyUrl} />
                          <label>{tt("Model")}<input value={x.model} onChange={(e) => edit({ model: e.target.value })} placeholder={sp.model || tt("model adını yaz")} spellCheck={false} /></label>
                        </div>
                      );
                    })}
                    <div className="seg-row">
                      {profs.length < PROFILE_SLOTS && <button className="chip" onClick={() => { const used = new Set(profs.map((x) => x.slot)); const slot = Array.from({ length: PROFILE_SLOTS }, (_, i) => i + 1).find((i) => !used.has(i))!; setProfs((l) => [...l, { slot, name: "", provider: "openai", model: "", base: "" }]); }}>+ {tt("Profil ekle")}</button>}
                      {profs.length > 0 && <label className="look-check set-radio"><input type="radio" name="actProf" checked={actProf === ""} onChange={() => setActProf("")} />{tt("Asistan profil kullanmasın (aşağıdaki ayar)")}</label>}
                    </div>
                  </div>
                  <div className="set-card">
                    <div className="field">
                      <span>{tt("Asistanın yapay zekâsı")}</span>
                      {actProf && <div className="set-hint">{tt("Şu an asistan \"{0}\" profilini kullanıyor; aşağıdaki ayar profil kapatılınca geçerli olur.", profs.find((x) => String(x.slot) === actProf)?.name || tt("Profil {0}", actProf))}</div>}
                      <div className="seg-row">
                        {AI_PROVIDERS.map((x) => <button key={x.id} className={"seg" + (prov === x.id ? " on" : "")} onClick={() => setProv(x.id)}>{x.id === "custom" ? tt("Başka (base URL)") : x.name}</button>)}
                      </div>
                      <div className="set-hint">{prov === "gemini" ? tt("Ücretsiz kotası olan tek seçenek; Google araması ve kaynaklı cevaplar sadece Gemini'de.")
                        : prov === "custom" ? tt("OpenAI uyumlu her sunucu: OpenRouter, Groq, DeepSeek, Mistral, ya da bilgisayarındaki Ollama / LM Studio (anahtar gerekmez).")
                        : tt("Ücretli API anahtarı ister; asistanın bütün araçları çalışır, Google araması hariç.")}</div>
                    </div>
                    {prov === "gemini" ? (
                      <>
                        <KeyField label="Gemini" hint={tt("Asistan, koleksiyonlar ve çeviriler")} value={gemKey} onChange={setGemKey}
                          placeholder="aistudio.google.com › Get API key" url="https://aistudio.google.com/app/apikey" />
                        <div className="field set-sub">
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
                      </>
                    ) : (
                      <>
                        {prov === "custom" && (
                          <label>{tt("Base URL")}
                            <input value={base} onChange={(e) => setBase(e.target.value)} placeholder="https://openrouter.ai/api/v1  ·  http://localhost:11434/v1" spellCheck={false} />
                          </label>
                        )}
                        <KeyField label={prov === "custom" ? tt("API anahtarı (gerekirse)") : provSpec.name} hint={prov === "openai" ? "platform.openai.com" : prov === "claude" ? "console.anthropic.com" : tt("Yerel sunucular için boş bırak")}
                          value={aiKeys[provSpec.keyName] ?? ""} onChange={(v) => setAiKeys((m) => ({ ...m, [provSpec.keyName]: v }))}
                          placeholder={prov === "openai" ? "sk-…" : prov === "claude" ? "sk-ant-…" : ""} url={provSpec.keyUrl} />
                        <div className="field set-sub">
                          <span>{tt("Model")}</span>
                          <div className="gem-model">
                            <select value={otherList.includes(aiModelsBy[prov] ?? "") ? aiModelsBy[prov] : ""} onChange={(e) => e.target.value && setAiModelsBy((m) => ({ ...m, [prov]: e.target.value }))}>
                              <option value="">{otherList.length ? tt("Listeden seç…") : otherMsg || tt("Önce API anahtarını gir")}</option>
                              {otherList.map((id) => <option key={id} value={id}>{id}</option>)}
                            </select>
                            <button className="chip" onClick={loadOther}>{tt("Listeyi yenile")}</button>
                          </div>
                          <input value={aiModelsBy[prov] ?? ""} onChange={(e) => setAiModelsBy((m) => ({ ...m, [prov]: e.target.value }))} placeholder={tt("ya da model adını yaz")} spellCheck={false} />
                        </div>
                        {gemKey.trim() && <div className="set-hint">{tt("Gemini anahtarın duruyor; Gemini'ye geri dönersen o kullanılır.")}</div>}
                      </>
                    )}
                  </div>
                  <div className="set-card">
                    <div className="field">
                      <span>{tt("Luna Analiz")}</span>
                      <div className="seg-row">
                        <button className={"seg" + (rvProv === "" ? " on" : "")} onClick={() => { setRvProv(""); setRvModel(""); }}>{tt("Asistanla aynı")}</button>
                        {AI_PROVIDERS.map((x) => <button key={x.id} className={"seg" + (rvProv === x.id ? " on" : "")} onClick={() => { setRvProv(x.id); setRvModel(""); }}>{x.id === "custom" ? tt("Başka (base URL)") : x.name}</button>)}
                        {profs.map((x) => <button key={"p" + x.slot} className={"seg" + (rvProv === "profile:" + x.slot ? " on" : "")} onClick={() => { setRvProv("profile:" + x.slot); setRvModel(""); }}>◆ {x.name.trim() || tt("Profil {0}", x.slot)}</button>)}
                      </div>
                      <div className="set-hint">{tt("Film sayfalarındaki Luna Analiz, Letterboxd yorumlarını bu yapay zekâyla okur. Anahtarlar yukarıdakiler; seçtiğin servisin ya da profilin anahtarı girilmiş olmalı.")}</div>
                    </div>
                    {!rvProv.startsWith("profile:") && <label className="set-sub">{tt("Model")}
                      <input value={rvModel} onChange={(e) => setRvModel(e.target.value)} placeholder={rvProv === "" ? tt("Asistanın modeli") : rvProv === "gemini" ? gemModel || "gemini-3.1-flash-lite" : aiModelsBy[rvProv] || tt("model adını yaz")} spellCheck={false} />
                    </label>}
                    <div className="set-hint">{rvProv.startsWith("profile:") ? tt("Profilin kendi anahtarı ve modeli kullanılır.") : tt("Boş bırakırsan o servis için yukarıda seçili model kullanılır.")}</div>
                    <div className="field set-sub">
                      <span>{tt("Okunacak yorum")}</span>
                      <div className="seg-row">{[10, 20, 30, 50, 75, 100].map((n) => <button key={n} className={"seg" + (rvCount === n ? " on" : "")} onClick={() => setRvCount(n)}>{n}</button>)}</div>
                    </div>
                    <div className="set-row-switch">
                      <div><b>{tt("Spoiler'lı yorumlar")}</b><span>{rvSpoil ? tt("Okunur; listede gizli durur") : tt("Hiç okunmaz, analize girmez")}</span></div>
                      <Switch on={rvSpoil} label={tt("Spoiler'lı yorumlar")} onChange={setRvSpoil} />
                    </div>
                    <label className="set-sub">{tt("Ek talimat (isteğe bağlı)")}
                      <textarea value={rvNote} maxLength={1000} rows={2} onChange={(e) => setRvNote(e.target.value)} placeholder={tt("Örn. Oyunculuğa ve senaryoya daha çok dikkat et, kısa yaz.")} />
                    </label>
                  </div>
                </>
              )}
              {sec === "subs" && (
                <>
                  <div className="set-card">
                    <label>{tt("Altyazı dilleri (öncelik sırasıyla)")}
                      <input value={langs} onChange={(e) => setLangs(e.target.value)} />
                    </label>
                    <div className="set-hint">{tt("Virgülle ayır: tr,en,de")}</div>
                  </div>
                  <div className="set-card">
                    <div className="field">
                      <span>{tt("Altyazı görünümü")}</span>
                      <SubAppearance />
                    </div>
                  </div>
                </>
              )}
              {sec === "upscaler" && <div className="set-card"><UpscalerSettings /></div>}
              {sec === "addons" && (
                <>
                  <div className="set-card"><AddonSettings /></div>
                  <div className="set-card"><PluginSettings /></div>
                  <div className="set-card"><SourceSettings /></div>
                </>
              )}
              {sec === "backup" && <BackupSettings />}
              {sec === "downloads" && (
                <div className="set-card">
                  <div className="field">
                    <span>{tt("Torrent indirme klasörü")}</span>
                    <div className="dir"><Icon d={I.folder} size={18} /><span className="grow ellipsis">{dlDir || "…"}</span>
                      <button className="chip" onClick={pickDl}>{tt("Değiştir…")}</button></div>
                  </div>
                </div>
              )}
            </div>
            <div className="set-foot">
              <span className="muted small">{tt("Kaydedince uygulama yenilenir.")}</span>
              <span className="grow" />
              <button className="chip" onClick={onClose}>{tt("Vazgeç")}</button>
              <button className="primary" onClick={save}>{tt("Kaydet")}</button>
            </div>
          </section>
        </div>
      </div>
    </>,
    document.body
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
