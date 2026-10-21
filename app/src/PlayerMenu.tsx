import { tt, DEC } from "./i18n";
import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  applySubOpts, loadSubOpts, mpv, MpvState, setProp, SUB_COLORS, SUB_FONTS, SUB_PRESETS, SubOpts, Track,
} from "./mpv";

const LANGS: Record<string, string> = {
  tr: tt("Türkçe"), tur: tt("Türkçe"), en: tt("İngilizce"), eng: tt("İngilizce"), de: tt("Almanca"), ger: tt("Almanca"), deu: tt("Almanca"),
  fr: tt("Fransızca"), fre: tt("Fransızca"), fra: tt("Fransızca"), es: tt("İspanyolca"), spa: tt("İspanyolca"), it: tt("İtalyanca"),
  ita: tt("İtalyanca"), ru: tt("Rusça"), rus: tt("Rusça"), ja: tt("Japonca"), jpn: tt("Japonca"), ko: tt("Korece"), kor: tt("Korece"),
  ar: tt("Arapça"), ara: tt("Arapça"), pt: tt("Portekizce"), por: tt("Portekizce"), zh: tt("Çince"), chi: tt("Çince"), zho: tt("Çince"),
  nl: tt("Hollandaca"), dut: tt("Hollandaca"), pl: tt("Lehçe"), pol: tt("Lehçe"), gr: tt("Yunanca"), gre: tt("Yunanca"), ell: tt("Yunanca"),
  hi: tt("Hintçe"), hin: tt("Hintçe"), az: tt("Azerice"), aze: tt("Azerice"), fa: tt("Farsça"), per: tt("Farsça"),
};

export function trackLabel(t: Track & Record<string, any>) {
  const lang = t.lang ? LANGS[t.lang.toLowerCase()] ?? t.lang.toUpperCase() : "";
  const parts = [lang, t.title].filter(Boolean);
  let name = parts.join(" · ") || tt("Parça {0}", t.id);
  if (t.type === "audio" && t["demux-channel-count"]) {
    const ch = t["demux-channel-count"];
    name += ch >= 6 ? ` (${ch - 1}.1)` : ch === 2 ? " (Stereo)" : "";
  }
  if (t.forced) name += tt(" [zorunlu]");
  if (t.external) name += tt(" [harici]");
  return name;
}

// ---------- per-video picture settings ----------
export type VideoSet = {
  brightness: number; contrast: number; saturation: number; gamma: number; hue: number;
  sharpen: number; denoise: number; deband: boolean; zoom: number; rotate: number; aspect: string; fill: boolean;
};
export const VIDEO_DEFAULTS: VideoSet = {
  brightness: 0, contrast: 0, saturation: 0, gamma: 0, hue: 0, sharpen: 0, denoise: 0, deband: false, zoom: 0, rotate: 0, aspect: "no", fill: false,
};
export const loadVideoSet = (path: string): VideoSet => {
  try { return { ...VIDEO_DEFAULTS, ...JSON.parse(localStorage.getItem("vset:" + path) ?? "{}") }; }
  catch { return { ...VIDEO_DEFAULTS }; }
};
export function applyVideoSet(v: VideoSet) {
  for (const k of ["brightness", "contrast", "saturation", "gamma", "hue"] as const) setProp(k, v[k]);
  setProp("video-zoom", v.zoom);
  setProp("video-rotate", v.rotate);
  setProp("video-aspect-override", v.aspect);
  // Fill = zoom until the black bars are gone, cropping the edges; the picture keeps its shape.
  setProp("panscan", v.fill ? 1 : 0);
  setProp("deband", v.deband);
  // Sharpness (CAS) and grain removal (hqdn3d) are FFmpeg filters: they need the frames in
  // memory, so decoding switches to copy-back mode only while one of them is on.
  const vf: string[] = [];
  if (v.denoise > 0) {
    const d = (v.denoise / 100) * 10;
    vf.push(`@dn:lavfi=[hqdn3d=${d.toFixed(1)}:${(d * 0.75).toFixed(1)}:${(d * 1.5).toFixed(1)}:${(d * 1.1).toFixed(1)}]`);
  }
  if (v.sharpen > 0) vf.push(`@sharp:lavfi=[cas=${Math.min(1, v.sharpen / 100).toFixed(2)}]`);
  const hw = vf.length ? "auto-copy-safe" : "auto-safe";
  if (hw !== lastHwdec) { setProp("hwdec", hw); lastHwdec = hw; }
  setProp("vf", vf.join(","));
}
let lastHwdec = "auto-safe";

const SLIDERS: [keyof VideoSet, string, number, number][] = [
  ["brightness", tt("Parlaklık"), -100, 100], ["contrast", tt("Kontrast"), -100, 100], ["saturation", tt("Doygunluk"), -100, 100],
  ["gamma", tt("Gama"), -100, 100], ["hue", tt("Renk tonu"), -100, 100], ["sharpen", tt("Keskinlik"), 0, 100],
  ["denoise", tt("Gren giderme"), 0, 100],
];

/** Gear panel: picture settings for the current video, saved for that video only. */
export function VideoPanel({ path, onClose }: { path: string; onClose: () => void }) {
  const [v, setV] = useState<VideoSet>(() => loadVideoSet(path));
  const [frame, setFrame] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const pending = useRef<Partial<VideoSet>>({});
  const timer = useRef(0);
  useEffect(() => {
    const down = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (box.current && !box.current.contains(t) && !t.closest(".vset-anchor")) onClose();
    };
    window.addEventListener("mousedown", down);
    return () => { window.removeEventListener("mousedown", down); clearTimeout(timer.current); };
  }, []);

  const save = (next: VideoSet) => {
    try {
      if (JSON.stringify(next) === JSON.stringify(VIDEO_DEFAULTS)) localStorage.removeItem("vset:" + path);
      else localStorage.setItem("vset:" + path, JSON.stringify(next));
    } catch {}
  };
  // Picture properties are cheap but a drag fires dozens of events: send at most ~20/s.
  const live = (k: keyof VideoSet, val: number) => {
    setV((cur) => ({ ...cur, [k]: val }));
    pending.current[k] = val as never;
    if (timer.current) return;
    timer.current = window.setTimeout(() => {
      timer.current = 0;
      for (const [pk, pv] of Object.entries(pending.current)) if (pk !== "sharpen" && pk !== "denoise") setProp(pk, pv);
      pending.current = {};
    }, 50);
  };
  // Sharpness and grain removal rebuild a video filter (expensive): applied when the slider is released.
  const commit = () => setV((cur) => { applyVideoSet(cur); save(cur); return cur; });
  const set = (patch: Partial<VideoSet>) => {
    // a slider value still waiting to be sent would land after this and undo it (e.g. Reset)
    clearTimeout(timer.current);
    timer.current = 0;
    pending.current = {};
    const next = { ...v, ...patch };
    setV(next);
    applyVideoSet(next);
    save(next);
  };

  return (
    <div className="tracks vset" ref={box}>
      <div className="vset-head">
        <h3>{tt("Görüntü")}</h3><span className="grow" />
        <button className="chip" onClick={() => set(VIDEO_DEFAULTS)}>{tt("Sıfırla")}</button>
      </div>
      {SLIDERS.map(([k, label, min, max]) => (
        <label key={k} className="vslider">
          <span>{label}</span>
          <input type="range" min={min} max={max} value={v[k] as number}
            onChange={(e) => live(k, Number(e.target.value))}
            onPointerUp={commit} onKeyUp={commit}
            onDoubleClick={() => set({ [k]: 0 } as Partial<VideoSet>)} />
          <span className="vval">{v[k] as number}</span>
        </label>
      ))}
      <label className="look-check">
        <input type="checkbox" checked={v.deband} onChange={(e) => set({ deband: e.target.checked })} />
        
        {tt("Bant giderme (renk geçişlerindeki basamaklanma)")}
      </label>
      <button className="vset-more" onClick={() => setFrame((f) => !f)} aria-expanded={frame}>
        
        {tt("Kadraj")} {frame ? "▾" : "▸"}
      </button>
      {frame && (
        <div className="vset-frame">
          <div className="look-row">
            <button className={"seg sm" + (v.aspect === "no" && !v.fill ? " on" : "")} onClick={() => set({ aspect: "no", fill: false })}>{tt("Orijinal")}</button>
            <button className={"seg sm" + (v.fill ? " on" : "")} onClick={() => set({ aspect: "no", fill: true })}>{tt("Doldur (kırp)")}</button>
          </div>
          <div className="look-row">
            <span className="muted small">{tt("Uzat")}</span>
            {[["16:9", "16:9"], ["4:3", "4:3"], ["2.35:1", "21:9"]].map(([val, l]) => (
              <button key={val} className={"seg sm" + (v.aspect === val ? " on" : "")} onClick={() => set({ aspect: val, fill: false })}>{l}</button>
            ))}
          </div>
          <div className="muted small">{tt("Orijinal: siyah bantlı · Doldur: bükmeden kenarları kırpar · Uzat: görüntüyü o orana zorlar")}</div>
          <div className="look-row">
            <span className="muted small">{tt("Yakınlaştır")}</span>
            <button className="chip" aria-label={tt("Uzaklaştır")} onClick={() => set({ zoom: Math.round((v.zoom - 0.05) * 100) / 100 })}>−</button>
            <span className="vval">{Math.round(Math.pow(2, v.zoom) * 100)}%</span>
            <button className="chip" aria-label={tt("Yakınlaştır")} onClick={() => set({ zoom: Math.round((v.zoom + 0.05) * 100) / 100 })}>+</button>
          </div>
          <div className="look-row">
            <span className="muted small">{tt("Döndür")}</span>
            {[0, 90, 180, 270].map((r) => (
              <button key={r} className={"seg sm" + (v.rotate === r ? " on" : "")} onClick={() => set({ rotate: r })}>{r}°</button>
            ))}
          </div>
        </div>
      )}
      <div className="muted small">{tt("Sadece bu video için kaydedilir · çift tık sıfırlar")}</div>
    </div>
  );
}

/** Font, size, colour, background and position of subtitles; changes apply live. */
export function SubAppearance() {
  const [o, setO] = useState<SubOpts>(loadSubOpts);
  // Fonts in Luna's own folder (bundled Inter + whatever the user added).
  const [userFonts, setUserFonts] = useState<{ name: string; family: string; file: string }[]>([]);
  const [fontMsg, setFontMsg] = useState("");
  const refreshFonts = () => invoke<typeof userFonts>("fonts_list").then(setUserFonts).catch(() => {});
  useEffect(() => { refreshFonts(); }, []);
  const addFonts = async () => {
    const f = await open({ multiple: true, filters: [{ name: "Font", extensions: ["ttf", "otf", "ttc", "zip"] }] });
    const paths = Array.isArray(f) ? f : typeof f === "string" ? [f] : [];
    if (!paths.length) return;
    try {
      const n = await invoke<number>("fonts_add", { paths });
      setFontMsg(tt("{0} font eklendi. Listeden seç; yeni açılan videolarda kullanılır.", n));
      refreshFonts();
    } catch (e) { setFontMsg(String(e)); }
  };
  const builtIn = SUB_FONTS.filter(([v]) => !v.startsWith("Inter") && !v.startsWith("Netflix"));
  const extra = userFonts.filter((f) => !SUB_FONTS.some(([v]) => v === f.name));
  const set = (patch: Partial<SubOpts>) => {
    const next = { ...o, ...patch };
    setO(next);
    applySubOpts(next);
  };
  return (
    <div className="sub-look">
      <div className="look-row">
        {Object.entries(SUB_PRESETS).map(([k, p]) => (
          <button key={k} className="seg sm" onClick={() => set(p.opts)}>{p.label}</button>
        ))}
      </div>
      <label className="look-field">{tt("Yazı tipi")}
        <select value={o.font} onChange={(e) => set({ font: e.target.value })}>
          <optgroup label="Luna">
            {SUB_FONTS.filter(([v]) => v.startsWith("Inter") || v.startsWith("Netflix")).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            {extra.map((f) => <option key={f.file + "|" + f.name} value={f.name}>{f.name}</option>)}
          </optgroup>
          <optgroup label="Windows">
            {builtIn.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </optgroup>
        </select>
      </label>
      <button className="chip" onClick={addFonts}>{tt("+ Font ekle (.ttf, .otf, .zip)")}</button>
      {fontMsg && <div className="muted small">{fontMsg}</div>}
      <div className="look-field">{tt("Boyut")}
        <div className="stepper">
          <button className="chip" aria-label={tt("Küçült")} onClick={() => set({ size: Math.max(24, o.size - 4) })}>A−</button>
          <span>{o.size}</span>
          <button className="chip" aria-label={tt("Büyüt")} onClick={() => set({ size: Math.min(96, o.size + 4) })}>A+</button>
        </div>
      </div>
      <div className="look-field">{tt("Renk")}
        <div className="swatches">
          {SUB_COLORS.map(([c, l]) => (
            <button key={c} className={"swatch" + (o.color === c ? " on" : "")} style={{ background: c }}
              aria-label={l} title={l} onClick={() => set({ color: c })} />
          ))}
        </div>
      </div>
      <div className="look-field">{tt("Arka plan")}
        <div className="look-row">
          {([["none", tt("Yok")], ["shadow", tt("Gölge")], ["box", tt("Siyah kutu")]] as const).map(([v, l]) => (
            <button key={v} className={"seg sm" + (o.bg === v ? " on" : "")} onClick={() => set({ bg: v })}>{l}</button>
          ))}
        </div>
      </div>
      <div className="look-field">{tt("Konum")}
        <div className="stepper">
          <button className="chip" aria-label={tt("Aşağı")} onClick={() => set({ margin: Math.max(0, o.margin - 12) })}>↓</button>
          <span>{o.margin}</span>
          <button className="chip" aria-label={tt("Yukarı")} onClick={() => set({ margin: Math.min(300, o.margin + 12) })}>↑</button>
        </div>
      </div>
      <label className="look-check">
        <input type="checkbox" checked={o.bold} onChange={(e) => set({ bold: e.target.checked })} />  {tt("Kalın")}
      </label>
    </div>
  );
}

/** Netflix-style "Audio & Subtitles" panel. */
export function TracksPanel({ s, onSearch, onSync, onClose }: {
  s: MpvState; onSearch: () => void; onSync: () => void; onClose: () => void;
}) {
  const audio = s.tracks.filter((t) => t.type === "audio");
  const subs = s.tracks.filter((t) => t.type === "sub");
  const subOff = !subs.some((t) => t.selected);
  // Close on a click outside (not on mouse-leave: the font list opens outside the panel).
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (box.current && !box.current.contains(t) && !t.closest(".tracks-anchor")) onClose();
    };
    window.addEventListener("mousedown", down);
    return () => window.removeEventListener("mousedown", down);
  }, []);
  return (
    <div className="tracks" ref={box}>
      <div className="tcol">
        <h3>{tt("Ses")}</h3>
        {audio.length === 0 && <div className="muted small">{tt("Ses parçası yok")}</div>}
        {audio.map((t) => (
          <button key={t.id} className={"titem" + (t.selected ? " on" : "")} onClick={() => setProp("aid", t.id)}>
            {trackLabel(t)}
          </button>
        ))}
      </div>
      <div className="tcol">
        <h3>{tt("Altyazılar")}</h3>
        <button className={"titem" + (subOff ? " on" : "")} onClick={() => setProp("sid", "no")}>{tt("Kapalı")}</button>
        {subs.map((t) => (
          <button key={t.id} className={"titem" + (t.selected ? " on" : "")} onClick={() => setProp("sid", t.id)}>
            {trackLabel(t)}
          </button>
        ))}
        <button className="titem link" onClick={onSearch}>{tt("Altyazı ara / yükle…")}</button>
        <button className="titem link" onClick={onSync}>{tt("Senkronu ayarla…")}</button>
      </div>
      <div className="tcol look">
        <h3>{tt("Altyazı ayarları")}</h3>
        <SubAppearance />
      </div>
    </div>
  );
}

type Entry =
  | { label: string; hint?: string; on?: boolean; act: () => void }
  | { label: string; sub: Entry[] }
  | "sep";

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3];
const ASPECTS: [string, string][] = [[tt("Otomatik"), "no"], ["16:9", "16:9"], ["4:3", "4:3"], ["21:9", "2.33"], ["2.35:1", "2.35"], ["1:1", "1"]];
const fmtSec = (d: number) => (d > 0 ? "+" : "") + d.toFixed(2).replace(".", DEC) + tt(" sn");

/** VLC-style right-click menu over the video. */
export function ContextMenu({ s, x, y, extra, onClose }: {
  s: MpvState & Record<string, any>; x: number; y: number; extra: Entry[]; onClose: () => void;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const audio = s.tracks.filter((t) => t.type === "audio");
  const subs = s.tracks.filter((t) => t.type === "sub");
  const chapters: { title?: string; time: number }[] = s.chapters ?? [];

  const entries: Entry[] = [
    { label: s.paused ? tt("Oynat") : tt("Duraklat"), hint: tt("Boşluk"), act: () => mpv("cycle", "pause") },
    { label: tt("Durdur"), act: () => mpv("stop") },
    "sep",
    { label: tt("Ses parçası"), sub: audio.length ? audio.map((t) => ({ label: trackLabel(t), on: t.selected, act: () => setProp("aid", t.id) })) : [{ label: tt("Yok"), act: () => {} }] },
    { label: tt("Altyazı parçası"), sub: [
      { label: tt("Kapalı"), on: !subs.some((t) => t.selected), act: () => setProp("sid", "no") },
      ...subs.map((t) => ({ label: trackLabel(t), on: t.selected, act: () => setProp("sid", t.id) })),
    ] },
    ...(chapters.length ? [{ label: tt("Bölümler (chapter)"), sub: chapters.map((c, i) => ({
      label: c.title || tt("Bölüm {0}", i + 1), on: s.chapter === i, act: () => setProp("chapter", i),
    })) }] : []),
    "sep",
    { label: tt("Oynatma hızı"), sub: SPEEDS.map((v) => ({ label: v === 1 ? tt("Normal") : v + "×", on: Math.abs((s.speed ?? 1) - v) < 0.01, act: () => setProp("speed", v) })) },
    { label: tt("En-boy oranı"), sub: ASPECTS.map(([l, v]) => ({ label: l, on: String(s.aspect ?? "no") === v || (v === "no" && Number(s.aspect ?? -1) < 0), act: () => setProp("video-aspect-override", v) })) },
    { label: tt("Ses"), sub: [
      { label: tt("Ses gecikmesi −100 ms"), hint: fmtSec(s.audioDelay ?? 0), act: () => mpv("add", "audio-delay", -0.1) },
      { label: tt("Ses gecikmesi +100 ms"), act: () => mpv("add", "audio-delay", 0.1) },
      { label: tt("Ses gecikmesini sıfırla"), act: () => setProp("audio-delay", 0) },
      { label: tt("Ses yükseltme (200%'e kadar)"), on: (s.volumeMax ?? 130) >= 200, act: () => setProp("volume-max", (s.volumeMax ?? 130) >= 200 ? 130 : 200) },
      { label: tt("Sessiz"), hint: "M", on: s.mute, act: () => mpv("cycle", "mute") },
    ] },
    { label: "Video", sub: [
      { label: "Deinterlace", on: !!s.deinterlace, act: () => mpv("cycle", "deinterlace") },
      { label: tt("Döndür 90°"), act: () => setProp("video-rotate", ((s.rotate ?? 0) + 90) % 360) },
      { label: tt("Yakınlaştır +"), act: () => mpv("add", "video-zoom", 0.1) },
      { label: tt("Yakınlaştır −"), act: () => mpv("add", "video-zoom", -0.1) },
      { label: tt("Yakınlaştırmayı sıfırla"), act: () => setProp("video-zoom", 0) },
    ] },
    { label: tt("Tekrarla"), on: s.loop === "inf", act: () => setProp("loop-file", s.loop === "inf" ? "no" : "inf") },
    { label: tt("Ekran görüntüsü al (Masaüstü)"), act: () => mpv("screenshot", "video") },
    ...(extra.length ? ["sep" as const, ...extra] : []),
  ];

  const W = 280;
  const left = Math.min(x, window.innerWidth - W - 8);
  const top = Math.min(y, window.innerHeight - entries.length * 34 - 16);

  return (
    <div className="cm-bg" onMouseDown={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }}>
      <div className="cm" style={{ left, top, width: W }} onMouseDown={(e) => e.stopPropagation()}>
        {entries.map((e, i) => {
          if (e === "sep") return <div key={i} className="cm-sep" />;
          if ("sub" in e)
            return (
              <div key={i} className="cm-item has-sub" onMouseEnter={() => setOpen(i)}>
                <span>{e.label}</span><span className="muted">›</span>
                {open === i && (
                  <div className={"cm sub" + (left + W * 2 > window.innerWidth ? " flip" : "")}>
                    {e.sub.map((c, j) => c === "sep" ? <div key={j} className="cm-sep" /> : "act" in c && (
                      <button key={j} className="cm-item" onClick={() => { c.act(); onClose(); }}>
                        <span className="cm-check">{c.on ? "✓" : ""}</span>
                        <span className="grow ellipsis">{c.label}</span>
                        {c.hint && <span className="muted small">{c.hint}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          return (
            <button key={i} className="cm-item" onMouseEnter={() => setOpen(null)} onClick={() => { e.act(); onClose(); }}>
              <span className="cm-check">{e.on ? "✓" : ""}</span>
              <span className="grow">{e.label}</span>
              {e.hint && <span className="muted small">{e.hint}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
