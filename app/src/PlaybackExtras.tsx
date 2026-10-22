import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { tt } from "./i18n";
import { fmtTime, mpv, setProp } from "./mpv";
import { store } from "./library";
import {
  abNext, cleanSoundFx, SponsorSegment, EQ_BANDS, EQ_PRESETS, presetOf, SleepChoice, sleepDeadline, SOUND_DEFAULTS, SOUND_LABELS, SoundFx, soundFilters, SPONSOR_CATEGORIES,
} from "./playbackExtrasModel";
import "./ExtrasPlus.css";

// ---------- a tiny shared store (panels, the runtime and Settings read the same values) ----------
let version = 0;
const listeners = new Set<() => void>();
const emit = () => { version++; listeners.forEach((f) => f()); };
const subscribe = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };
/** Re-renders when any playback extra changes (sound, sleep timer, SponsorBlock settings). */
export const useExtras = () => useSyncExternalStore(subscribe, () => version);

// ---------- sound: a profile for films and one for music ----------
export type SoundMode = "film" | "music";
export const loadSound = (m: SoundMode): SoundFx => cleanSoundFx(store.json<unknown>("soundFx:" + m, null));
export function saveSound(m: SoundMode, fx: SoundFx) {
  store.set("soundFx:" + m, JSON.stringify(cleanSoundFx(fx)));
  emit();
  if (applied === m) void applySound(m, true);
}
let applied: SoundMode | null = null;
let lastSent = "";
let chain: Promise<void> = Promise.resolve();
/** Puts this profile's filters into mpv. Only Luna's labelled filters are removed and added, one call
 *  after the other, so a filter someone else added stays and two quick changes cannot interleave. */
export function applySound(m: SoundMode, force = false): Promise<void> {
  if (!force && applied === m) return chain;
  applied = m;
  const filters = soundFilters(loadSound(m));
  const key = JSON.stringify(filters);
  // nothing was on and nothing is on: mpv is not touched at all
  if (!filters.length && !lastSent) return chain;
  lastSent = filters.length ? key : "";
  chain = chain.catch(() => {}).then(async () => {
    for (const label of SOUND_LABELS) await mpv("af", "remove", label).catch(() => {});
    for (const f of filters) await mpv("af", "add", `${f.label}:${f.value}`).catch(() => {});
  });
  return chain;
}
/** mpv was restarted or a new file opened: the next apply must really send the filters. */
export const soundStale = () => { applied = null; };
const isOn = (fx: SoundFx) => fx.normalize || fx.night || fx.voice || fx.bands.some((g) => g !== 0);
export const soundIsOn = (m: SoundMode) => isOn(loadSound(m));

// ---------- SponsorBlock settings ----------
export type SponsorSet = { on: boolean; auto: boolean; cats: string[] };
const SPONSOR_DEFAULT: SponsorSet = { on: true, auto: true, cats: ["sponsor", "selfpromo", "interaction", "music_offtopic"] };
export function loadSponsor(): SponsorSet {
  const r = store.json<any>("sponsorBlock", null);
  if (!r || typeof r !== "object") return { ...SPONSOR_DEFAULT, cats: [...SPONSOR_DEFAULT.cats] };
  const cats = Array.isArray(r.cats) ? r.cats.filter((c: unknown) => SPONSOR_CATEGORIES.includes(String(c))) : SPONSOR_DEFAULT.cats;
  return { on: r.on !== false, auto: r.auto !== false, cats };
}
export function saveSponsor(s: SponsorSet) { store.set("sponsorBlock", JSON.stringify(s)); emit(); }
export const sponsorLabel = (c: string): string => ({
  sponsor: tt("Sponsor"), selfpromo: tt("Kendi reklamı"), interaction: tt("Abone ol / beğen hatırlatması"), intro: tt("Giriş animasyonu"),
  outro: tt("Kapanış ve jenerik"), preview: tt("Önizleme / özet"), filler: tt("Konu dışı dolgu"), music_offtopic: tt("Müzik videosunda müzik olmayan kısım"),
} as Record<string, string>)[c] ?? c;

/** The SponsorBlock segments of what plays now (the runtime fills it; the seek bars draw them). */
export const sponsorNow = { segs: [] as SponsorSegment[] };
export function setSponsorNow(segs: SponsorSegment[]) { sponsorNow.segs = segs; emit(); }
export const SPONSOR_COLORS: Record<string, string> = {
  sponsor: "#2fbf71", selfpromo: "#e5c63a", interaction: "#b35cf0", intro: "#2ac9d6", outro: "#4f6df0",
  preview: "#3aa0e8", filler: "#8a5cf0", music_offtopic: "#f0943a",
};

// ---------- music sleep timer ----------
export const sleep = { choice: "off" as SleepChoice, deadline: null as number | null };
export function setSleep(choice: SleepChoice) {
  sleep.choice = choice;
  sleep.deadline = sleepDeadline(choice, Date.now());
  emit();
}
export const sleepTick = () => emit();

// ---------- A-B loop (kept while the panel is closed; a new file clears it) ----------
export const abLoop = { a: null as number | null, b: null as number | null };
export function setAbLoop(n: { a: number | null; b: number | null }) {
  abLoop.a = n.a; abLoop.b = n.b;
  setProp("ab-loop-a", n.a ?? "no");
  setProp("ab-loop-b", n.b ?? "no");
  emit();
}
export function resetAbLoop() { if (abLoop.a != null || abLoop.b != null) setAbLoop({ a: null, b: null }); }

// ---------- small UI pieces ----------
const PRESET_NAMES = (): [string, string][] => [
  ["flat", tt("Düz")], ["bass", tt("Bas")], ["treble", tt("Tiz")], ["vocal", tt("Vokal")], ["rock", tt("Rock")],
  ["electronic", tt("Elektronik")], ["classical", tt("Klasik")], ["jazz", tt("Caz")], ["speech", tt("Konuşma")],
];
const hzShort = (f: number) => (f >= 1000 ? f / 1000 + "k" : String(f));
const hz = (f: number) => (f >= 1000 ? f / 1000 + " kHz" : f + " Hz");
export const SvgIcon = ({ d, size = 20, fill = false }: { d: string; size?: number; fill?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? "currentColor" : "none"} stroke={fill ? "none" : "currentColor"} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
export const EQ_ICON = "M4 18v-5M4 9V6M12 18v-9M12 5V6M20 18v-3M20 11V6M2 13h4M10 9h4M18 15h4";
const SLEEP_ICON = "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z";
const FX_ICONS = {
  normalize: "M3 12h3l2-5 4 10 3-7 2 2h4",
  night: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z",
  voice: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM19 11a7 7 0 0 1-14 0M12 18v3",
};

/** A smooth line through the band points that never swings past them (monotone cubic, Fritsch–Carlson). */
function curve(pts: [number, number][]): string {
  const n = pts.length;
  if (!n) return "";
  if (n < 3) return pts.map(([x, y], i) => (i ? "L" : "M") + x + "," + y).join(" ");
  const dx = pts.slice(1).map((p, i) => p[0] - pts[i][0]);
  const m = pts.slice(1).map((p, i) => (p[1] - pts[i][1]) / dx[i]);
  const t = pts.map((_, i) => (i === 0 ? m[0] : i === n - 1 ? m[n - 2] : m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2));
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i], b = t[i + 1] / m[i], h = a * a + b * b;
    if (h > 9) { const k = 3 / Math.sqrt(h); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  let d = `M${pts[0][0]},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${(pts[i][0] + h).toFixed(1)},${(pts[i][1] + t[i] * h).toFixed(1)} ${(pts[i + 1][0] - h).toFixed(1)},${(pts[i + 1][1] - t[i + 1] * h).toFixed(1)} ${pts[i + 1][0]},${pts[i + 1][1].toFixed(1)}`;
  }
  return d;
}

/** The equaliser as a curve: drag a point (or across several), use the arrow keys on a focused point,
 *  double-click to flatten it. Changes are heard while dragging (at most every 150 ms). */
function EqGraph({ bands, onChange }: { bands: number[]; onChange: (b: number[], final: boolean) => void }) {
  const W = 300, H = 132, L = 26, R = 10, T = 12, B = 22;
  const xs = EQ_BANDS.map((_, i) => L + (i * (W - L - R)) / (EQ_BANDS.length - 1));
  const y = (g: number) => T + ((12 - g) / 24) * (H - T - B);
  const [live, setLive] = useState<number[] | null>(null);
  const [act, setAct] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const last = useRef(0);
  const shown = live ?? bands;
  const at = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W, py = ((e.clientY - r.top) / r.height) * H;
    const i = xs.reduce((best, x, k) => (Math.abs(x - px) < Math.abs(xs[best] - px) ? k : best), 0);
    const g = Math.max(-12, Math.min(12, Math.round(12 - ((py - T) / (H - T - B)) * 24)));
    return { i, g };
  };
  const put = (i: number, g: number, final: boolean) => {
    const next = [...(live ?? bands)]; next[i] = g;
    setLive(final ? null : next); setAct(final ? null : i);
    const now = Date.now();
    if (final || now - last.current > 150) { last.current = now; onChange(next, final); }
  };
  const pts = shown.map((g, i) => [xs[i], y(g)] as [number, number]);
  const line = curve(pts);
  const zero = y(0);
  return (
    <svg ref={svg} className={"lx-eq" + (act != null ? " drag" : "")} viewBox={`0 0 ${W} ${H}`} role="group" aria-label={tt("Ekolayzer bantları")}
      onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); const { i, g } = at(e); put(i, g, false); }}
      onPointerMove={(e) => { if (act == null) return; const { i, g } = at(e); put(i, g, false); }}
      onPointerUp={(e) => { if (act == null) return; const { i, g } = at(e); put(i, g, true); }}
      onPointerCancel={() => { if (live) onChange(live, true); setLive(null); setAct(null); }}>
      <defs>
        <linearGradient id="lxEqFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.38" /><stop offset="1" stopColor="var(--accent)" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {[12, 6, 0, -6, -12].map((g) => (
        <g key={g}>
          <line x1={L} x2={W - R} y1={y(g)} y2={y(g)} className={g === 0 ? "lx-eq-zero" : "lx-eq-grid"} />
          {g % 12 === 0 && <text x={L - 6} y={y(g) + 3} className="lx-eq-db" textAnchor="end">{g > 0 ? "+" + g : g === 0 ? "0" : "−" + -g}</text>}
        </g>
      ))}
      <path d={`${line} L${xs[xs.length - 1]},${zero} L${xs[0]},${zero} Z`} fill="url(#lxEqFill)" />
      <path d={line} className="lx-eq-line" />
      {pts.map(([x, py], i) => (
        <g key={i}>
          <text x={x} y={H - 6} textAnchor="middle" className="lx-eq-hz">{hzShort(EQ_BANDS[i])}</text>
          <circle cx={x} cy={py} r={act === i ? 7 : 5.5} className={"lx-eq-knob" + (shown[i] !== 0 ? " on" : "")} tabIndex={0} role="slider"
            aria-label={hz(EQ_BANDS[i])} aria-valuemin={-12} aria-valuemax={12} aria-valuenow={shown[i]} aria-valuetext={shown[i] + " dB"}
            onDoubleClick={() => put(i, 0, true)}
            onKeyDown={(e) => {
              const step = e.key === "ArrowUp" ? 1 : e.key === "ArrowDown" ? -1 : e.key === "PageUp" ? 3 : e.key === "PageDown" ? -3 : 0;
              if (e.key === "Home") { e.preventDefault(); put(i, 0, true); return; }
              if (!step) return;
              e.preventDefault(); e.stopPropagation();
              put(i, Math.max(-12, Math.min(12, shown[i] + step)), true);
            }} />
          {act === i && <text x={x} y={Math.max(10, py - 11)} textAnchor="middle" className="lx-eq-val">{shown[i] > 0 ? "+" + shown[i] : shown[i]} dB</text>}
        </g>
      ))}
    </svg>
  );
}

/** The three effects as tiles, the presets and the curve; shared by the film panel and the music popover. */
function SoundControls({ mode }: { mode: SoundMode }) {
  useExtras();
  const fx = loadSound(mode);
  const preset = presetOf(fx.bands);
  const put = (patch: Partial<SoundFx>) => saveSound(mode, { ...fx, ...patch });
  const tiles: [keyof typeof FX_ICONS, string, string][] = [
    ["normalize", tt("Dengele"), tt("Sessiz ve gürültülü yerler aynı duyulur")],
    ["night", tt("Gece modu"), tt("Patlamalar yumuşar, konuşma kalır")],
    ["voice", tt("Net konuşma"), tt("Sesler öne çıkar, uğultu azalır")],
  ];
  return (
    <div className="lx-sound-body">
      <div className="lx-fx-row" role="group" aria-label={tt("Ses efektleri")}>
        {tiles.map(([k, name, about]) => (
          <button key={k} className={"lx-fx" + (fx[k] ? " on" : "")} aria-pressed={fx[k]} title={about} onClick={() => put({ [k]: !fx[k] } as Partial<SoundFx>)}>
            <SvgIcon d={FX_ICONS[k]} size={18} /><b>{name}</b><small>{about}</small>
          </button>
        ))}
      </div>
      <div className="lx-eq-head">
        <b>{tt("Ekolayzer")}</b>
        <span className="muted small">{preset === "custom" ? tt("Özel ayar") : PRESET_NAMES().find(([id]) => id === preset)?.[1]}</span>
      </div>
      <EqGraph bands={fx.bands} onChange={(bands) => put({ bands })} />
      <div className="lx-presets" role="group" aria-label={tt("Ekolayzer hazır ayarları")}>
        {PRESET_NAMES().map(([id, label]) => (
          <button key={id} className={"lx-pill" + (preset === id ? " on" : "")} aria-pressed={preset === id} onClick={() => put({ bands: [...EQ_PRESETS[id]] })}>{label}</button>
        ))}
      </div>
    </div>
  );
}

/** Closes a popover on a click outside it or on Esc (Esc is not passed on: the film stays open). */
function useDismiss(onClose: () => void, ignore?: React.RefObject<HTMLElement | null>) {
  const box = useRef<HTMLDivElement>(null);
  const cb = useRef(onClose); cb.current = onClose;
  useEffect(() => {
    const down = (e: MouseEvent) => {
      const t = e.target as Node;
      if (box.current && !box.current.contains(t) && !ignore?.current?.contains(t)) cb.current();
    };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); cb.current(); } };
    const t = window.setTimeout(() => window.addEventListener("mousedown", down), 0);
    window.addEventListener("keydown", key, true);
    return () => { clearTimeout(t); window.removeEventListener("mousedown", down); window.removeEventListener("keydown", key, true); };
  }, []);
  return box;
}
const activeCount = (m: SoundMode) => { const f = loadSound(m); return [f.normalize, f.night, f.voice, f.bands.some((g) => g !== 0)].filter(Boolean).length; };

/** The film player's sound panel: effects, equaliser and the A-B loop. */
export function SoundPanel({ time, onClose }: { time: number; onClose: () => void }) {
  const box = useDismiss(onClose);
  useExtras();
  const ab = abLoop;
  const n = activeCount("film");
  return (
    <div className="tracks vset lx-sound" ref={box} role="dialog" aria-label={tt("Ses ayarları")}>
      <div className="vset-head">
        <h3>{tt("Ses")}</h3>
        {n > 0 && <span className="lx-badge">{tt("{0} açık", n)}</span>}
        <span className="grow" />
        <button className="chip" disabled={!n} onClick={() => saveSound("film", { ...SOUND_DEFAULTS, bands: [...SOUND_DEFAULTS.bands] })}>{tt("Sıfırla")}</button>
      </div>
      <SoundControls mode="film" />
      <div className="lx-ab">
        <div className="lx-ab-t"><b>{tt("A-B döngüsü")}</b>
          <span className="muted small">{ab.a == null ? tt("Bir sahneyi tekrar tekrar izlemek için") : ab.b == null ? tt("A: {0} · şimdi B noktasını koy", fmtTime(ab.a)) : tt("{0} ile {1} arası tekrarlanıyor", fmtTime(ab.a), fmtTime(ab.b))}</span></div>
        <button className={"chip" + (ab.b != null ? " lx-on" : "")} onClick={() => setAbLoop(abNext(ab.a, ab.b, time))}>
          {ab.a == null ? tt("A noktasını koy") : ab.b == null ? tt("B noktasını koy") : tt("Döngüyü kapat")}
        </button>
      </div>
      <p className="muted small lx-note">{tt("Film ve müzik ayrı ses ayarları kullanır. Ayarlar hemen uygulanır ve hatırlanır.")}</p>
    </div>
  );
}

/** SponsorBlock parts and the A-B loop drawn on a seek bar (clicks pass through to the bar). */
export function BarMarks({ duration, ab = false }: { duration: number; ab?: boolean }) {
  useExtras();
  if (!(duration > 0)) return null;
  const pct = (t: number) => Math.max(0, Math.min(100, (t / duration) * 100)) + "%";
  return (
    <span className="lx-marks" aria-hidden="true">
      {sponsorNow.segs.map((g) => (
        <i key={g.uuid} className="lx-mark" style={{ left: pct(g.start), width: `calc(${pct(g.end)} - ${pct(g.start)})`, background: SPONSOR_COLORS[g.category] ?? "#2fbf71" }} />
      ))}
      {ab && abLoop.a != null && (
        <i className="lx-mark-ab" style={{ left: pct(abLoop.a), width: abLoop.b != null ? `calc(${pct(abLoop.b)} - ${pct(abLoop.a)})` : "2px" }} />
      )}
    </span>
  );
}

const sleepChoices = (): [SleepChoice, string][] => [["off", tt("Kapalı")], ["song", tt("Şarkı bitince")], [15, tt("15 dk")], [30, tt("30 dk")], [45, tt("45 dk")], [60, tt("1 saat")]];

/** Now playing (music): one button for the equaliser and the sleep timer; shows the minutes left while the timer runs. */
export function MusicSoundButton() {
  useExtras();
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLSpanElement>(null);
  const on = soundIsOn("music") || sleep.choice !== "off";
  const left = sleep.deadline ? Math.max(0, Math.round((sleep.deadline - Date.now()) / 1000)) : null;
  return (
    <span className="lx-anchor" ref={btn}>
      <button className={"round" + (on ? " lx-on" : "")} aria-label={tt("Ses ve uyku zamanlayıcısı")} title={tt("Ses ve uyku zamanlayıcısı")} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <SvgIcon d={sleep.choice !== "off" ? SLEEP_ICON : EQ_ICON} />
      </button>
      {left != null && <span className="lx-mini-badge" aria-hidden="true">{Math.ceil(left / 60)}′</span>}
      {sleep.choice === "song" && <span className="lx-mini-badge" aria-hidden="true">♪</span>}
      {open && <MusicSoundPop left={left} anchor={btn} onClose={() => setOpen(false)} />}
    </span>
  );
}
function MusicSoundPop({ left, anchor, onClose }: { left: number | null; anchor: React.RefObject<HTMLSpanElement | null>; onClose: () => void }) {
  const box = useDismiss(onClose, anchor);
  const total = typeof sleep.choice === "number" ? sleep.choice * 60 : 0;
  const frac = left != null && total ? left / total : 0;
  const n = activeCount("music");
  return (
    <div className="lx-pop" ref={box} role="dialog" aria-label={tt("Ses ve uyku zamanlayıcısı")}>
      <div className="vset-head"><h3>{tt("Ses")}</h3>
        {n > 0 && <span className="lx-badge">{tt("{0} açık", n)}</span>}
        <span className="grow" />
        <button className="chip" disabled={!n} onClick={() => saveSound("music", { ...SOUND_DEFAULTS, bands: [...SOUND_DEFAULTS.bands] })}>{tt("Sıfırla")}</button></div>
      <SoundControls mode="music" />
      <div className="lx-sleep">
        <div className="lx-sleep-head">
          {left != null ? (
            <svg className="lx-ring" viewBox="0 0 36 36" aria-hidden="true">
              <circle cx="18" cy="18" r="15" className="lx-ring-bg" />
              <circle cx="18" cy="18" r="15" className="lx-ring-fg" style={{ strokeDasharray: `${(frac * 94.25).toFixed(1)} 94.25` }} />
            </svg>
          ) : <SvgIcon d={SLEEP_ICON} size={22} />}
          <div><b>{tt("Uyku zamanlayıcısı")}</b>
            <span className="muted small">{left != null ? tt("{0} sonra durur", fmtTime(left)) : sleep.choice === "song" ? tt("Bu şarkı bitince durur") : tt("Süre dolarken müzik yavaşça kısılır, sonra duraklar.")}</span></div>
        </div>
        <div className="lx-presets">
          {sleepChoices().map(([c, label]) => (
            <button key={String(c)} className={"lx-pill" + (sleep.choice === c ? " on" : "")} aria-pressed={sleep.choice === c} onClick={() => setSleep(c)}>{label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
