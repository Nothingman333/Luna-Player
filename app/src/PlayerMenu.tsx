import {colorSignal} from "./hdrInfo";
import {store} from "./library";
import {extraText} from "./Extras";
import {LunaSelect} from "./LunaSelect";import {mediaQualityLabel,cleanWebPlayback,type WebMediaTrack} from "./browserMediaModel";
import {createPortal} from "react-dom";
import {gpuCapabilities,systemProfile} from "./hardwareProfile";
import { appStorage as localStorage } from "./appStorage";
import { tt, DEC } from "./i18n";
import { useEffect, useRef, useState } from "react";
import { invoke } from "./nativeCore";
import { open } from "@tauri-apps/plugin-dialog";
import {
  applySubOpts, loadSubOpts, mainSubTrack, mpv, MpvState, setProp, SUB_COLORS, SUB_FONTS, SUB_PRESETS, SubOpts, Track,
} from "./mpv";
import { anime4kChain, downloadShaders, loadShaders, newJob, onJob, shaders } from "./studioBridge";

const LANGS: Record<string, string> = {
  tr: tt("Türkçe"), tur: tt("Türkçe"), en: tt("İngilizce"), eng: tt("İngilizce"), de: tt("Almanca"), ger: tt("Almanca"), deu: tt("Almanca"),
  fr: tt("Fransızca"), fre: tt("Fransızca"), fra: tt("Fransızca"), es: tt("İspanyolca"), spa: tt("İspanyolca"), it: tt("İtalyanca"),
  ita: tt("İtalyanca"), ru: tt("Rusça"), rus: tt("Rusça"), ja: tt("Japonca"), jpn: tt("Japonca"), ko: tt("Korece"), kor: tt("Korece"),
  ar: tt("Arapça"), ara: tt("Arapça"), pt: tt("Portekizce"), por: tt("Portekizce"), zh: tt("Çince"), chi: tt("Çince"), zho: tt("Çince"),
  nl: tt("Hollandaca"), dut: tt("Hollandaca"), pl: tt("Lehçe"), pol: tt("Lehçe"), gr: tt("Yunanca"), gre: tt("Yunanca"), ell: tt("Yunanca"),
  hi: tt("Hintçe"), hin: tt("Hintçe"), az: tt("Azerice"), aze: tt("Azerice"), fa: tt("Farsça"), per: tt("Farsça"),
};

/** A dub picked by the user: switched and announced, so the app remembers it as a choice (not a guess from track changes). */
const pickAudio = (t: Track) => { void setProp("aid", t.id); window.dispatchEvent(new CustomEvent("luna-audio-pick", { detail: t })); };

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
  /** sharper scaling in mpv (ewa_lanczossharp) */
  hq: boolean;
  /** Anime4K shader chain for drawn animation */
  a4k: "off" | "fast" | "hq";
  /** frame interpolation synced to the display (smoother camera moves in 24 fps films) */
  smooth: boolean;
  vsr: "off" | "nvidia" | "intel";
};
export const VIDEO_DEFAULTS: VideoSet = {
  brightness: 0, contrast: 0, saturation: 0, gamma: 0, hue: 0, sharpen: 0, denoise: 0, deband: false, zoom: 0, rotate: 0, aspect: "no", fill: false, hq: false, a4k: "off", smooth: false, vsr: "off",
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
  const vsr = v.vsr === "nvidia" || v.vsr === "intel" ? v.vsr : "off";
  // VSR requires D3D11 hardware frames; CPU-only denoise/sharpen cannot share this chain.
  if (vsr !== "off") { vf.length = 0; vf.push(`@vsr:d3d11vpp=format=nv12:scale=2:scaling-mode=${vsr}`); }
  const hw = vsr !== "off" ? "d3d11va" : vf.length ? "auto-copy-safe" : "auto-safe";
  if (hw !== lastHwdec) { setProp("hwdec", hw); lastHwdec = hw; }
  void setProp("vf", vf.join(",")).catch(error => {
    if (vsr !== "off") { void setProp("vf", "").catch(() => {}); void setProp("hwdec", "auto-safe").catch(() => {}); lastHwdec = "auto-safe"; }
    window.dispatchEvent(new CustomEvent("luna-extra-error", { detail: String(error) }));
  });
  // Scaling and shaders change only when they differ (each change rebuilds mpv's render chain).
  const hq = !!v.hq;
  if (hq !== lastHq) {
    setProp("scale", hq ? "ewa_lanczossharp" : "lanczos");
    setProp("cscale", hq ? "ewa_lanczossharp" : "lanczos");
    setProp("dscale", hq ? "mitchell" : "hermite");
    lastHq = hq;
  }
  // interpolation only works with a display-synced video-sync mode (mpv silently ignores it otherwise), so both go together
  const smooth = !!v.smooth;
  if (smooth !== lastSmooth) {
    setProp("video-sync", smooth ? "display-resample" : "audio");
    setProp("interpolation", smooth);
    if (smooth) setProp("tscale", "oversample");
    lastSmooth = smooth;
  }
  const chain = vsr === "off" && (v.a4k === "fast" || v.a4k === "hq") ? anime4kChain(v.a4k) : [];
  const key = chain.join("|");
  if (key !== lastShaders) { setProp("glsl-shaders", chain); lastShaders = key; }
}
let lastHwdec = "auto-safe";
let lastHq = false;
let lastSmooth = false;
let lastShaders = "";

const SLIDERS: [keyof VideoSet, string, number, number][] = [
  ["brightness", tt("Parlaklık"), -100, 100], ["contrast", tt("Kontrast"), -100, 100], ["saturation", tt("Doygunluk"), -100, 100],
  ["gamma", tt("Gama"), -100, 100], ["hue", tt("Renk tonu"), -100, 100], ["sharpen", tt("Keskinlik"), 0, 100],
  ["denoise", tt("Gren giderme"), 0, 100],
];

/** Gear panel: picture settings for the current video, saved for that video only. */
export function VideoPanel({ path, onClose, onScenes, onClip, enhancements = false, embedded = false }: { path: string; onClose: () => void; onScenes?: () => void; onClip?: () => void; enhancements?: boolean; embedded?: boolean }) {
  const [web,setWeb]=useState(()=>cleanWebPlayback(store.json("web-playback:"+path,null)));
  const [hdr,setHdr]=useState("");
  const [outputHdr,setOutputHdr]=useState("");
  const [currentHeight,setCurrentHeight]=useState<number|null>(null);
  useEffect(()=>{let live=true;setCurrentHeight(null);setHdr("");setOutputHdr("");const read=()=>{void mpv("get_property","height").then(value=>{if(live)setCurrentHeight(typeof value==="number"&&Number.isFinite(value)&&value>0&&value<=16384?Math.round(value):null);}).catch(()=>{});void mpv("get_property","video-params").then((raw)=>{if(!live)return;setHdr(colorSignal(raw));}).catch(()=>{});void mpv("get_property","video-target-params").then(raw=>{if(!live)return;setOutputHdr(colorSignal(raw));}).catch(()=>{});};read();const timer=window.setInterval(read,2000);return()=>{live=false;clearInterval(timer);};},[path]);

  useEffect(()=>{const sync=(event:Event)=>{if((event as CustomEvent).detail===path){setWeb(cleanWebPlayback(store.json("web-playback:"+path,null)));setCurrentHeight(null);}};window.addEventListener("luna-web-source-state",sync);return()=>window.removeEventListener("luna-web-source-state",sync);},[path]);
  const [v, setV] = useState<VideoSet>(() => loadVideoSet(path));
  const [frame, setFrame] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const pending = useRef<Partial<VideoSet>>({});
  const dirty = useRef<Partial<VideoSet>>({});
  useEffect(()=>{const sync=(event:Event)=>{if((event as CustomEvent).detail===path)setV(loadVideoSet(path));};setV(loadVideoSet(path));window.addEventListener("luna-video-settings",sync);return()=>window.removeEventListener("luna-video-settings",sync);},[path]);
  const timer = useRef(0);
  useEffect(() => {
    const down = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (box.current && !box.current.contains(t) && !t.closest(".vset-anchor, .up-anchor")) onClose();
    };
    window.addEventListener("mousedown", down);
    return () => { window.removeEventListener("mousedown", down); clearTimeout(timer.current); };
  }, []);

  const save = (next: VideoSet) => {
    try {
      if (JSON.stringify(next) === JSON.stringify(VIDEO_DEFAULTS)) localStorage.removeItem("vset:" + path);
      else localStorage.setItem("vset:" + path, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent("luna-video-settings",{detail:path}));
    } catch {}
  };
  // Picture properties are cheap but a drag fires dozens of events: send at most ~20/s.
  const live = (k: keyof VideoSet, val: number) => {
    dirty.current[k]=val as never;
    if((k==="sharpen"||k==="denoise")&&val>0)dirty.current.vsr="off";
    setV((cur) => ({ ...cur, [k]: val }));
    if ((k === "sharpen" || k === "denoise") && val > 0) setV(cur => ({ ...cur, vsr: "off" }));
    pending.current[k] = val as never;
    if (timer.current) return;
    timer.current = window.setTimeout(() => {
      timer.current = 0;
      for (const [pk, pv] of Object.entries(pending.current)) if (pk !== "sharpen" && pk !== "denoise") setProp(pk, pv);
      pending.current = {};
    }, 50);
  };
  // Sharpness and grain removal rebuild a video filter (expensive): applied when the slider is released.
  const commit = () => {clearTimeout(timer.current);timer.current=0;pending.current={};const next={...loadVideoSet(path),...dirty.current};dirty.current={};setV(next);applyVideoSet(next);save(next);};
  const set = (patch: Partial<VideoSet>) => {
    // a slider value still waiting to be sent would land after this and undo it (e.g. Reset)
    clearTimeout(timer.current);
    timer.current = 0;
    pending.current = {};
    dirty.current={};
    const next = { ...loadVideoSet(path), ...patch };
    setV(next);
    applyVideoSet(next);
    save(next);
  };

  return (
    <div className={"vset" + (embedded ? " embedded" : " tracks")} ref={box}>
      <div className="vset-head">
        <h3>{enhancements ? tt("Luna iyileştirmeleri") : tt("Görüntü")}</h3><span className="grow" />
        <button className="chip" onClick={() => set(enhancements ? {hq:false,a4k:"off",vsr:"off",smooth:false} : {...VIDEO_DEFAULTS,hq:v.hq,a4k:v.a4k,vsr:v.vsr,smooth:v.smooth})}>{tt("Sıfırla")}</button>
      </div>
      {!enhancements&&web&&<div className="web-source-quality"><span>{tt("Kalite")}</span>{qualityChoices(web.variants||[],web.streamUrl).length>1?<LunaSelect label={tt("Kalite")} value={web.streamUrl||""} options={qualityChoices(web.variants!,web.streamUrl).map((v,i)=>({value:v.url,label:mediaQualityLabel(v)||(v.url===web.streamUrl&&currentHeight?`${currentHeight}p`:extraText(`Kalite bilinmiyor · Akış ${i+1}`,`Quality unknown · Stream ${i+1}`))}))} onChange={url=>{const variant=web.variants?.find(v=>v.url===url);const next={...web,streamUrl:url,audio:variant?.audioUrl?[{url:variant.audioUrl}]:[]};store.set("web-playback:"+path,JSON.stringify(next));setWeb(next);window.dispatchEvent(new CustomEvent("luna-web-quality",{detail:path}));}}/>:<small>{currentHeight?`${currentHeight}p`:mediaQualityLabel(web.variants?.[0]||{url:web.streamUrl||""})||extraText("Kalite bilinmiyor","Quality unknown")}</small>}{currentHeight&&(web.variants?.length||0)>1&&<small className="web-current-quality">{extraText(`Şu an: ${currentHeight}p`,`Now playing: ${currentHeight}p`)}</small>}{outputHdr&&<small className="web-current-quality" title={extraText("Bu, oynatıcının renk çıkışıdır. Ekranda HDR için Windows HDR ve HDR destekli ekran gerekir.","This is the player’s color output. Displaying HDR requires Windows HDR and an HDR-capable screen.")}>{extraText("Oynatıcı çıkışı:","Player output:")} {outputHdr}</small>}{hdr&&<small className="web-current-quality">{extraText("Kaynak:","Source:")} {hdr}</small>}</div>}
      {!enhancements && <div className="vs-card">{SLIDERS.map(([k, label, min, max]) => {
        const val = v[k] as number, pct = ((val - min) / (max - min)) * 100, zero = ((0 - min) / (max - min)) * 100;
        return (
        <label key={k} className={"vslider" + (val !== 0 ? " moved" : "")} style={{ "--p": pct + "%", "--z": zero + "%" } as React.CSSProperties}>
          <span className="vs-top"><span>{label}</span><span className="vval">{val > 0 && min < 0 ? "+" + val : val}</span></span>
          <input type="range" min={min} max={max} value={val}
            onChange={(e) => live(k, Number(e.target.value))}
            onPointerUp={commit} onKeyUp={commit}
            onDoubleClick={() => set({ [k]: 0 } as Partial<VideoSet>)} />
        </label>
        );
      })}
      <label className="look-check vs-switch">
        <input type="checkbox" role="switch" checked={v.deband} onChange={(e) => set({ deband: e.target.checked })} />
        {tt("Bant giderme (renk geçişlerindeki basamaklanma)")}
      </label>
      </div>}
      {enhancements && <QualityBlock v={v} set={set} />}
      {!enhancements && <>
      {(onScenes || onClip) && (
        <div className="look-row">
          {onScenes && <button className="chip" onClick={() => { onClose(); onScenes(); }}>{tt("Sahne ızgarası (Ctrl+G)")}</button>}
          {onClip && <button className="chip" onClick={() => { onClose(); onClip(); }}>{tt("Klip kes (X)")}</button>}
        </div>
      )}
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
      </>}
      <div className="muted small">{tt("Sadece bu video için kaydedilir · çift tık sıfırlar")}</div>
    </div>
  );
}

/** Scaling quality and the optional Anime4K shaders (downloaded on request, verified). */
function QualityBlock({ v, set }: { v: VideoSet; set: (p: Partial<VideoSet>) => void }) {
  const [files, setFiles] = useState<string[]>(shaders);
  const [caps,setCaps]=useState(gpuCapabilities(null));
  useEffect(()=>{let alive=true;void systemProfile().then(p=>{if(alive)setCaps(gpuCapabilities(p.gpus));}).catch(()=>{});return()=>{alive=false;};},[]);
  const [dl, setDl] = useState<number | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { void loadShaders().then(setFiles); }, []);
  const have = anime4kChain("hq", files).length > 0 && anime4kChain("fast", files).length > 0;
  const get = async () => {
    setErr(""); setDl(0);
    const job = newJob();
    const off = await onJob(job, (e) => setDl(e.pct ?? 0));
    try { setFiles(await downloadShaders(job)); } catch (e) { setErr(String(e)); } finally { off(); setDl(null); }
  };
  return (
    <div className="vset-quality">
      <div className="look-row">
        <span className="muted small">{tt("Süper çözünürlük")}</span>
        {([["off", tt("Kapalı")], ["nvidia", "NVIDIA RTX"], ["intel", "Intel VSR"]] as const).map(([key, label]) => (
          <button key={key} className={"seg sm" + (v.vsr === key ? " on" : "")} disabled={key !== "off" && caps.known && !caps[key]} title={key !== "off" && caps.known && !caps[key] ? tt("Bu üreticiye ait ekran kartı algılanmadı") : tt("Kart ve sürücü desteği ayrıca gerekir")} onClick={() => set({ vsr: key, ...(key !== "off" ? { sharpen: 0, denoise: 0, a4k: "off" as const } : {}) })}>{label}</button>
        ))}
      </div>
      <div className="muted small">{tt("Uyumlu ekran kartı ve sürücü gerekir. VSR, keskinleştirme ve Anime4K ile birlikte kullanılmaz.")}</div>
      <label className="look-check">
        <input type="checkbox" checked={v.hq} onChange={(e) => set({ hq: e.target.checked })} />
        {tt("Yüksek kalite ölçekleme (mpv, ekran kartını biraz daha yorar)")}
      </label>
      <div className="look-row">
        <span className="muted small">{tt("Anime4K")}</span>
        {([["off", tt("Kapalı")], ["fast", tt("Hızlı")], ["hq", tt("Kaliteli")]] as const).map(([k, l]) => (
          <button key={k} className={"seg sm" + (v.a4k === k ? " on" : "")} disabled={k !== "off" && !have} onClick={() => set({ a4k: k, ...(k !== "off" ? { vsr: "off" as const } : {}) })}>{l}</button>
        ))}
        {!have && <button className="chip" disabled={dl !== null} onClick={get}>{dl !== null ? tt("İndiriliyor… {0}%", Math.round(dl)) : tt("Shaderları indir (0,8 MB)")}</button>}
      </div>
      <div className="muted small">{tt("Anime4K çizgi film ve anime için gerçek zamanlı keskinleştirme ve büyütmedir (MIT lisanslı, bloc97/Anime4K v4.0.1). Lossless Scaling gerekmez.")}</div>
      {err && <div className="muted small">{err}</div>}
      <label className="look-check">
        <input type="checkbox" checked={!!v.smooth} onChange={(e) => set({ smooth: e.target.checked })} />
        {tt("Akıcı hareket · mpv ara değerleme (AI kare üretimi değildir)")}
      </label>
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
      <button className="tlink look-addfont" onClick={addFonts}>{tt("+ Font ekle (.ttf, .otf, .zip)")}</button>
      {fontMsg && <div className="muted small">{fontMsg}</div>}
<div className="look-pair">
      <div className="look-field">{tt("Boyut")}
        <div className="stepper">
          <button className="chip" aria-label={tt("Küçült")} onClick={() => set({ size: Math.max(24, o.size - 4) })}>A−</button>
          <span>{o.size}</span>
          <button className="chip" aria-label={tt("Büyüt")} onClick={() => set({ size: Math.min(96, o.size + 4) })}>A+</button>
        </div>
      </div>
      <div className="look-field">{tt("Konum")}
        <div className="stepper">
          <button className="chip" aria-label={tt("Aşağı")} onClick={() => set({ margin: Math.max(0, o.margin - 12) })}>↓</button>
          <span>{o.margin}</span>
          <button className="chip" aria-label={tt("Yukarı")} onClick={() => set({ margin: Math.min(300, o.margin + 12) })}>↑</button>
        </div>
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
          {([["none", tt("Yok")], ["shadow", tt("Gölge")], ["box", tt("Kutu")]] as const).map(([v, l]) => (
            <button key={v} className={"seg sm" + (o.bg === v ? " on" : "")} onClick={() => set({ bg: v })}>{l}</button>
          ))}
        </div>
      </div>
      <label className="look-check">
        <input type="checkbox" checked={o.bold} onChange={(e) => set({ bold: e.target.checked })} />  {tt("Kalın")}
      </label>
    </div>
  );
}

/** the quality list: picture streams that carry sound (a silent one only when nothing else is there), one per label, the playing one kept */
function qualityChoices(rows:WebMediaTrack[],current?:string){const video=rows.filter(v=>v.mediaKind!=="audio");const heard=video.filter(v=>!v.silent||v.url===current);const list=heard.some(v=>!v.silent)?heard:video;const seen=new Map<string,WebMediaTrack>();for(const v of list){const k=mediaQualityLabel(v)||v.url;const had=seen.get(k);if(!had||v.url===current)seen.set(k,v);}return[...seen.values()];}
/** A track's short name for the panel: its language, plus one small tag (forced, file, original, channels); the full label is the tooltip. */
const LANG_IN_NAME: [RegExp, string][] = [[/(?:^|[-_. \[(])(tr|tur)(?=[-_. \])]|$)|türkçe|turkish/i, "tr"], [/(?:^|[-_. \[(])(en|eng)(?=[-_. \])]|$)|ingilizce|english/i, "en"], [/(?:^|[-_. \[(])(pt|por|pob)(?=[-_. \])]|$)|portugu/i, "pt"], [/(?:^|[-_. \[(])(fr|fre|fra)(?=[-_. \])]|$)|french|fransızca/i, "fr"], [/(?:^|[-_. \[(])(de|ger|deu)(?=[-_. \])]|$)|german|almanca/i, "de"], [/(?:^|[-_. \[(])(es|spa)(?=[-_. \])]|$)|spanish|ispanyolca/i, "es"], [/(?:^|[-_. \[(])(it|ita)(?=[-_. \])]|$)|italian/i, "it"], [/(?:^|[-_. \[(])(ru|rus)(?=[-_. \])]|$)|russian/i, "ru"], [/(?:^|[-_. \[(])(ar|ara)(?=[-_. \])]|$)|arabic/i, "ar"]];
export function trackShort(t: Track & Record<string, any>): { name: string; tag?: string } {
  const text = (t.title ?? "") + " " + String(t["external-filename"] ?? "").split(/[\/]/).pop();
  const code = t.lang?.toLowerCase() || LANG_IN_NAME.find(([re]) => re.test(text))?.[1];
  const name = (code && LANGS[code]) || (t.title && t.title.length <= 28 ? t.title : "") || tt("Parça {0}", t.id);
  const ch = t["demux-channel-count"];
  const tag = t.forced || /forced|zorunlu/i.test(text) ? tt("Zorunlu")
    : t.type === "audio" && /original|orijinal/i.test(text) ? tt("Orijinal")
    : t.external ? tt("Dosya")
    : t.type === "audio" && ch ? (ch >= 6 ? `${ch - 1}.1` : ch === 2 ? "Stereo" : undefined) : undefined;
  return { name, tag };
}
function TrackRow({ t, on, onPick }: { t: Track & Record<string, any>; on: boolean; onPick: () => void }) {
  const { name, tag } = trackShort(t);
  return <button className={"titem" + (on ? " on" : "")} title={trackLabel(t)} onClick={onPick}>
    <span className={"tck" + (on ? " on" : "")} aria-hidden /><span className="track-title">{name}</span>{tag && <span className="ttag">{tag}</span>}
  </button>;
}

/** Netflix-style "Audio & Subtitles" panel. */
export function TracksPanel({ s, onSearch, onSync, onClose, onTranscript }: {
  s: MpvState; onSearch: () => void; onSync: () => void; onClose: () => void; onStudio?: () => void; onTranscript?: () => void;
}) {
  const audio = s.tracks.filter((t) => t.type === "audio");
  const subs = s.tracks.filter((t) => t.type === "sub");
  // mpv marks both the main and the second subtitle "selected": the main one is current-tracks/sub
  const second = typeof s.secondarySid === "number" ? s.secondarySid : null;
  const mainId = mainSubTrack(s.tracks, s.secondarySid)?.id ?? null;
  const subOff = mainId == null;
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
    <div className="tracks audio-sub-panel compact" ref={box}>
      <div className="tcol">
        <h3>{tt("Ses")}</h3>
        {audio.length === 0 && <div className="muted small">{tt("Ses parçası yok")}</div>}
        {audio.map((t) => <TrackRow key={t.id} t={t} on={!!t.selected} onPick={() => pickAudio(t)} />)}
      </div>
      <div className="tcol">
        <h3>{tt("Altyazı")}</h3>
        <button className={"titem" + (subOff ? " on" : "")} onClick={() => setProp("sid", "no")}><span className={"tck" + (subOff ? " on" : "")} aria-hidden />{tt("Kapalı")}</button>
        {subs.map((t) => <TrackRow key={t.id} t={t} on={t.id === mainId} onPick={() => { if (t.id === second) setProp("secondary-sid", "no"); setProp("sid", t.id); }} />)}
        <div className="tfoot">
          {subs.length > 1 && <label className="tsecond"><span>{tt("İkinci altyazı")}</span>
            <LunaSelect compact label={tt("İkinci altyazı")} value={second == null ? "" : String(second)}
              options={[{ value: "", label: tt("Kapalı") }, ...subs.filter((t) => t.id !== mainId).map((t) => { const x = trackShort(t); return { value: String(t.id), label: x.name + (x.tag ? " · " + x.tag : "") }; })]}
              onChange={(v) => setProp("secondary-sid", v ? Number(v) : "no")} /></label>}
          <div className="tlinks">
            <button className="tlink" onClick={onSearch}>{tt("Ara / yükle")}</button>
            <button className="tlink" onClick={onSync}>{tt("Senkron")}</button>
            {onTranscript && <button className="tlink" onClick={onTranscript}>{tt("Replikler (R)")}</button>}
          </div>
        </div>
      </div>
      <div className="tcol look">
        <h3>{tt("Görünüm")}</h3>
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
    { label: tt("Ses parçası"), sub: audio.length ? audio.map((t) => ({ label: trackLabel(t), on: t.selected, act: () => pickAudio(t) })) : [{ label: tt("Yok"), act: () => {} }] },
    { label: tt("Altyazı parçası"), sub: [
      { label: tt("Kapalı"), on: !mainSubTrack(s.tracks, s.secondarySid), act: () => setProp("sid", "no") },
      ...subs.map((t) => ({ label: trackLabel(t), on: t.id === mainSubTrack(s.tracks, s.secondarySid)?.id, act: () => setProp("sid", t.id) })),
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

  const root = useRef<HTMLDivElement>(null), subBox = useRef<HTMLDivElement>(null);
  const [anchor,setAnchor]=useState({left:0,top:0});
  const W=Math.min(280,window.innerWidth-16);
  const left=Math.max(8,Math.min(x,window.innerWidth-W-8));
  const [top,setTop]=useState(Math.max(8,y));
  useEffect(()=>{const place=()=>{setTop(Math.max(8,Math.min(y,window.innerHeight-(root.current?.offsetHeight??0)-8)));setOpen(null);setAnchor(a=>({...a}));};place();window.addEventListener("resize",place);return()=>window.removeEventListener("resize",place);},[x,y]);
  useEffect(()=>{if(open===null)return;const sub=subBox.current;if(!sub)return;const rect=sub.getBoundingClientRect();sub.style.top=Math.max(8,Math.min(anchor.top,window.innerHeight-rect.height-8))+"px";},[open,anchor]);
  const reveal=(index:number,el:HTMLElement)=>{const r=el.getBoundingClientRect();setAnchor({left:left+W+260>window.innerWidth?Math.max(8,left-260):left+W,top:r.top});setOpen(index);};
  const selected=open===null?null:entries[open];
  return createPortal(<div className="cm-bg" onMouseDown={onClose} onKeyDown={e=>{if(e.key==="Escape"){e.stopPropagation();onClose();}if(e.key==="ArrowLeft")setOpen(null);}} onContextMenu={e=>{e.preventDefault();onClose();}}>
    <div ref={root} className="cm player-menu-root" role="menu" style={{left,top,width:W}} onMouseDown={e=>e.stopPropagation()}>
      {entries.map((entry,i)=>entry==="sep"?<div key={i} className="cm-sep"/>:"sub" in entry?<button key={i} type="button" className="cm-item has-sub" role="menuitem" aria-haspopup="menu" aria-expanded={open===i} onMouseEnter={e=>reveal(i,e.currentTarget)} onFocus={e=>reveal(i,e.currentTarget)} onClick={e=>reveal(i,e.currentTarget)} onKeyDown={e=>{if(e.key==="ArrowRight"){e.preventDefault();reveal(i,e.currentTarget);requestAnimationFrame(()=>subBox.current?.querySelector<HTMLButtonElement>("button")?.focus());}}}><span>{entry.label}</span><span aria-hidden>›</span></button>:<button key={i} className="cm-item" role="menuitem" onFocus={()=>setOpen(null)} onMouseEnter={()=>setOpen(null)} onClick={()=>{entry.act();onClose();}}><span className="cm-check">{entry.on?"✓":""}</span><span className="grow">{entry.label}</span>{entry.hint&&<span className="muted small">{entry.hint}</span>}</button>)}
    </div>
    {selected&&selected!=="sep"&&"sub" in selected&&<div ref={subBox} className="cm player-submenu" role="menu" aria-label={selected.label} style={{left:Math.min(anchor.left,window.innerWidth-268),top:anchor.top,width:Math.min(260,window.innerWidth-16)}} onMouseDown={e=>e.stopPropagation()}>{selected.sub.map((entry,i)=>entry==="sep"?<div key={i} className="cm-sep"/>:"act" in entry&&<button key={i} className="cm-item" role="menuitem" onClick={()=>{entry.act();onClose();}}><span className="cm-check">{entry.on?"✓":""}</span><span className="grow ellipsis">{entry.label}</span>{entry.hint&&<span className="muted small">{entry.hint}</span>}</button>)}</div>}
  </div>,document.body);
}
