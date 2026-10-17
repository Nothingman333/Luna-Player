// Upscaler: Lossless Scaling driven from Luna, with subtitles kept out of frame generation.
import { useEffect, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { store } from "./library";
import { loadSubOpts, SubOpts } from "./mpv";

export type UpStatus = { installed: boolean; running: boolean; scaling: boolean; settings: Record<string, string>; hotkey: string };
export const upscalerOn = () => store.get("upscaler") === "1"; // true only while a video runs with it

// ---------- the subtitle window (index.html?subs=1) ----------
type Osd = { w: number; h: number; mt: number; mb: number; ml: number; mr: number };
type SubsStyle = { opts: SubOpts; fonts: { name: string; file: string }[]; osd?: Osd };
type Pic = { x: number; y: number; w: number; h: number; file: string };

/** Rendered alone in the "subs" window: the current line, styled like Luna's subtitle settings.
 *  Lines come straight from the core (Luna's own page is covered and may be throttled). */
export function SubsOverlay() {
  const [style, setStyle] = useState<SubsStyle | null>(null);
  const [text, setText] = useState("");
  const [pics, setPics] = useState<Pic[]>([]);
  const [h, setH] = useState(window.innerHeight);
  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    invoke<SubsStyle | null>("subs_current_style").then((st) => st && setStyle(st)).catch(() => {});
    const u1 = listen<SubsStyle>("luna-subs-style", (e) => setStyle(e.payload));
    const u2 = listen<string>("luna-subs-text", (e) => {
      setText(e.payload ?? "");
      invoke("upscaler_note", { m: `pencere satiri aldi: ${JSON.stringify((e.payload ?? "").slice(0, 30))} boyut=${window.innerWidth}x${window.innerHeight}` }).catch(() => {});
    });
    const u3 = listen<Pic[]>("luna-subs-pics", (e) => setPics(e.payload ?? []));
    const r = () => setH(window.innerHeight);
    window.addEventListener("resize", r);
    return () => { u1.then((f) => f()); u2.then((f) => f()); u3.then((f) => f()); window.removeEventListener("resize", r); };
  }, []);
  // Picture subtitles (PGS): placed on the video's on-screen rectangle, like mpv does.
  if (pics.length) {
    const osd = style?.osd;
    const k = osd && osd.w ? window.innerWidth / osd.w : 1;
    const vx = osd ? osd.ml * k : 0, vy = osd ? osd.mt * k : 0;
    const vw = osd ? (osd.w - osd.ml - osd.mr) * k : window.innerWidth;
    const vh = osd ? (osd.h - osd.mt - osd.mb) * k : window.innerHeight;
    return (
      <>
        {pics.map((p) => (
          <img key={p.file} src={convertFileSrc(p.file)} alt="" style={{
            position: "fixed", left: vx + p.x * vw, top: vy + p.y * vh, width: p.w * vw, height: p.h * vh, pointerEvents: "none",
          }} />
        ))}
      </>
    );
  }
  if (!text.trim()) return null;
  const o = style?.opts ?? loadSubOpts();
  const k = h / 720; // mpv sizes subtitles relative to a 720-pixel-high window
  const font = style?.fonts.find((f) => f.name === o.font);
  const outline = o.bg === "shadow"
    ? "0 0 3px rgba(0,0,0,.95), 0 0 2px rgba(0,0,0,.95), 1px 2px 4px rgba(0,0,0,.9)"
    : o.bg === "none" ? "0 0 2px rgba(0,0,0,.9), 0 0 1px rgba(0,0,0,.9)" : "none";
  return (
    <>
      {font && <style>{`@font-face { font-family: "${o.font}"; src: url("${convertFileSrc(font.file)}"); }`}</style>}
      <div style={{ position: "fixed", left: 0, right: 0, bottom: o.margin * k, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
        <div style={{
          maxWidth: "86%", textAlign: "center", whiteSpace: "pre-line", lineHeight: 1.22,
          fontFamily: `"${o.font}", "Segoe UI", sans-serif`, fontSize: o.size * k, fontWeight: o.bold ? 700 : undefined,
          color: o.color, textShadow: outline,
          ...(o.bg === "box" ? { background: "rgba(0,0,0,0.72)", padding: `${0.12 * o.size * k}px ${0.35 * o.size * k}px`, borderRadius: 4 } : {}),
        }}>{text}</div>
      </div>
    </>
  );
}

/** Sends Luna's subtitle look to the subtitle window (lines themselves come from the core). */
export function pushSubs(osd?: Osd) {
  invoke<{ name: string; file: string }[]>("fonts_list")
    .catch(() => [])
    .then((fonts) => invoke("subs_style", { style: { opts: loadSubOpts(), fonts: fonts ?? [], osd } }).catch(() => {}));
}

// ---------- settings ----------
const SCALERS: [string, string][] = [
  ["Off", "Kapalı"], ["LS1", "LS1"], ["FSR", "AMD FSR"], ["NIS", "NVIDIA NIS"], ["SGSR", "Snapdragon GSR"],
  ["BicubicCAS", "Bicubic CAS"], ["Anime4K", "Anime4K"], ["XBR", "xBR"], ["SharpBilinear", "Sharp Bilinear"],
  ["Integer", "Tamsayı"], ["Nearest", "En yakın komşu"],
];
const LABEL: Record<string, string> = {
  FrameGeneration: "Kare üretimi", LSFG3Mode1: "Mod", LSFG3Multiplier: "Çarpan", LSFG3Target: "Hedef FPS",
  LSFGFlowScale: "Akış ölçeği (%)", LSFGSize: "Kalite", HdrSupport: "HDR desteği", DrawFps: "FPS göstergesi",
  CaptureApi: "Yakalama yöntemi", GsyncSupport: "G-Sync / VRR", MaxFrameLatency: "En fazla kare gecikmesi",
};

/** Lossless Scaling options. `inPlayer`: the panel behind the player's UP button. */
export function UpscalerSettings({ inPlayer, onToggle, onSaved, onApply }: {
  inPlayer?: boolean; onToggle?: (on: boolean) => void; onSaved?: () => void;
  /** Player: "Uygula" hands the save over, so the player can close the menu and count down meanwhile. */
  onApply?: (save: () => Promise<void>, on: boolean) => void;
} = {}) {
  const [st, setSt] = useState<UpStatus | null>(null);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [on, setOn] = useState(upscalerOn());
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const refresh = () => invoke<UpStatus>("upscaler_status").then((s) => { setSt(s); setVals(s.settings); }).catch((e) => setMsg(String(e)));
  useEffect(() => { refresh(); }, []);

  const v = (k: string, d = "") => vals[k] ?? d;
  const put = (k: string, x: string) => setVals((cur) => ({ ...cur, [k]: x }));
  const save = async () => {
    setBusy("Kaydediliyor…"); setMsg("");
    try {
      await invoke("upscaler_save", { values: { ...vals, HdrSupport: vals.HdrSupport ?? "true" } });
      setMsg(inPlayer ? "Uygulandı." : "Kaydedildi. Lossless Scaling'deki “Luna Player” profiline yazıldı.");
      onSaved?.();
    } catch (e) { setMsg(String(e)); }
    setBusy(""); refresh();
  };
  const toggle = (x: boolean) => {
    setOn(x);
    if (onApply) return; // player menu: nothing changes until "Uygula"
    store.set("upscaler", x ? "1" : "0");
    onToggle?.(x);
  };
  const fg = v("FrameGeneration", "LSFG3");
  const st2 = v("ScalingType", "Off");
  const sharpKey = st2 === "LS1" ? "LS1Sharpness" : "Sharpness";
  const adaptive = v("LSFG3Mode1", "FIXED") === "ADAPTIVE";

  return (
    <div className={"field up" + (inPlayer ? " in-player" : "")}>
      <span>{inPlayer ? "Upscaler" : "Upscaler (Lossless Scaling)"}</span>
      {st && !st.installed ? (
        <div className="muted small">Lossless Scaling bulunamadı. Steam'den kurunca burada ayarları görünecek.</div>
      ) : (
        <div className="up-box">
          {inPlayer && (
            <label className="look-check">
              <input type="checkbox" checked={on} onChange={(e) => toggle(e.target.checked)} />
              {inPlayer ? "Upscaler'ı kullan" : "Video oynarken Upscaler'ı kullan"}
            </label>
          )}
          {inPlayer && <div className="muted small up-note">Değişiklikler en alttaki <b>Uygula</b> tuşuna basınca geçerli olur.</div>}
          <div className="muted small">
            {inPlayer
              ? "Luna, Lossless Scaling'i kendisi açar ve ölçeklemeyi başlatır. Altyazılar her zaman görünür kalır."
              : "Upscaler her filmde ayrı açılır: oynatıcıdaki UP menüsünden ya da Q tuşuyla. Buradaki ayarlar Lossless Scaling'deki “Luna Player” profiline yazılır."}
            {st ? (st.running ? (st.scaling ? " · Şu an ölçekliyor" : " · Lossless Scaling açık") : " · Lossless Scaling kapalı") : ""}
          </div>
          <h4 className="up-h">Kare üretimi</h4>
          <div className="up-grid">
            <label>Tür
              <select value={fg} onChange={(e) => put("FrameGeneration", e.target.value)}>
                <option value="LSFG3">LSFG 3</option><option value="LSFG2">LSFG 2</option><option value="LSFG1">LSFG 1</option><option value="Off">Kapalı</option>
              </select>
            </label>
            {fg === "LSFG3" && (
              <label>{LABEL.LSFG3Mode1}
                <select value={v("LSFG3Mode1", "FIXED")} onChange={(e) => put("LSFG3Mode1", e.target.value)}>
                  <option value="FIXED">Sabit çarpan</option><option value="ADAPTIVE">Uyarlamalı (hedef FPS)</option>
                </select>
              </label>
            )}
            {fg === "LSFG3" && !adaptive && (
              <label>{LABEL.LSFG3Multiplier}
                <select value={v("LSFG3Multiplier", "2")} onChange={(e) => put("LSFG3Multiplier", e.target.value)}>
                  {[2, 3, 4, 5, 6, 8, 10, 12, 16, 20].map((n) => <option key={n} value={n}>x{n}</option>)}
                </select>
              </label>
            )}
            {fg === "LSFG3" && adaptive && (
              <label>{LABEL.LSFG3Target}
                <input type="number" min={20} max={1000} value={v("LSFG3Target", "120")} onChange={(e) => put("LSFG3Target", e.target.value)} />
              </label>
            )}
            {fg === "LSFG2" && (
              <label>Çarpan
                <select value={v("LSFG2Mode", "X2")} onChange={(e) => put("LSFG2Mode", e.target.value)}>
                  <option value="X2">x2</option><option value="X3">x3</option><option value="X4">x4</option>
                </select>
              </label>
            )}
            {fg !== "Off" && (
              <label>{LABEL.LSFGFlowScale}: {v("LSFGFlowScale", "70")}
                <input type="range" min={25} max={100} step={5} value={v("LSFGFlowScale", "70")} onChange={(e) => put("LSFGFlowScale", e.target.value)} />
              </label>
            )}
            {fg !== "Off" && (
              <label>{LABEL.LSFGSize}
                <select value={v("LSFGSize", "BALANCED")} onChange={(e) => put("LSFGSize", e.target.value)}>
                  <option value="BALANCED">Dengeli</option><option value="PERFORMANCE">Performans</option>
                </select>
              </label>
            )}
          </div>

          <h4 className="up-h">Ölçekleme</h4>
          <div className="up-grid">
            <label>Tür
              <select value={st2} onChange={(e) => put("ScalingType", e.target.value)}>
                {SCALERS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </label>
            {st2 === "Anime4K" && (
              <label>Boyut
                <select value={v("Anime4kType", "S")} onChange={(e) => put("Anime4kType", e.target.value)}>
                  <option value="S">Küçük</option><option value="M">Orta</option><option value="L">Büyük</option><option value="VL">Çok büyük</option><option value="UL">En büyük</option>
                </select>
              </label>
            )}
            {st2 === "LS1" && (
              <label>Kalite
                <select value={v("LS1Type", "BALANCED")} onChange={(e) => put("LS1Type", e.target.value)}>
                  <option value="BALANCED">Dengeli</option><option value="PERFORMANCE">Performans</option>
                </select>
              </label>
            )}
            {st2 === "FSR" && (
              <label>FSR türü
                <select value={v("FSRType", "ORIGINAL")} onChange={(e) => put("FSRType", e.target.value)}>
                  <option value="ORIGINAL">Orijinal</option><option value="OPTIMIZED">Optimize</option>
                </select>
              </label>
            )}
            {["FSR", "NIS", "SGSR", "BicubicCAS", "LS1"].includes(st2) && (
              <label>Keskinlik: {v(sharpKey, "5")}
                <input type="range" min={0} max={10} value={v(sharpKey, "5")} onChange={(e) => put(sharpKey, e.target.value)} />
              </label>
            )}
            <label>Mod
              <select value={v("ScalingMode", "Auto")} onChange={(e) => put("ScalingMode", e.target.value)}>
                <option value="Auto">Otomatik</option><option value="Custom">Özel</option>
              </select>
            </label>
            {v("ScalingMode", "Auto") === "Custom" ? (
              <label>Ölçek çarpanı
                <input type="number" min={1} max={10} step={0.1} value={v("ScaleFactor", "1.5")} onChange={(e) => put("ScaleFactor", e.target.value)} />
              </label>
            ) : (
              <label>Sığdırma
                <select value={v("ScalingFitMode", "AspectRatio")} onChange={(e) => put("ScalingFitMode", e.target.value)}>
                  <option value="AspectRatio">En boy oranı</option><option value="Fullscreen">Tam ekran</option>
                </select>
              </label>
            )}
          </div>
          <label className="look-check"><input type="checkbox" checked={v("VRS") === "true"} onChange={(e) => put("VRS", String(e.target.checked))} /> VRS</label>

          <h4 className="up-h">İşleme</h4>
          <div className="up-grid">
            <label>{LABEL.CaptureApi}
              <select value={v("CaptureApi", "DXGI")} onChange={(e) => put("CaptureApi", e.target.value)}>
                <option value="DXGI">DXGI</option><option value="WGC">WGC</option><option value="GDI">GDI</option>
              </select>
            </label>
            <label>Senkronizasyon
              <select value={v("SyncMode", "DEFAULT")} onChange={(e) => put("SyncMode", e.target.value)}>
                <option value="DEFAULT">Varsayılan</option><option value="OFF">Kapalı</option>
                <option value="VSYNC1">V-Sync 1</option><option value="VSYNC2">V-Sync 2</option><option value="VSYNC3">V-Sync 3</option><option value="VSYNC4">V-Sync 4</option>
              </select>
            </label>
            <label>{LABEL.MaxFrameLatency}
              <select value={v("MaxFrameLatency", "3")} onChange={(e) => put("MaxFrameLatency", e.target.value)}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>
          <div className="up-checks">
            <label className="look-check"><input type="checkbox" checked={v("HdrSupport", "true") === "true"} onChange={(e) => put("HdrSupport", String(e.target.checked))} /> {LABEL.HdrSupport} <span className="muted small">(HDR filmler için açık kalmalı)</span></label>
            <label className="look-check"><input type="checkbox" checked={v("DrawFps") === "true"} onChange={(e) => put("DrawFps", String(e.target.checked))} /> {LABEL.DrawFps}</label>
            <label className="look-check"><input type="checkbox" checked={v("GsyncSupport") === "true"} onChange={(e) => put("GsyncSupport", String(e.target.checked))} /> {LABEL.GsyncSupport}</label>
          </div>
          <div className="up-actions">
            <button className={inPlayer ? "primary sm" : "chip"} onClick={() => (onApply ? onApply(async () => {
              await invoke("upscaler_save", { values: { ...vals, HdrSupport: vals.HdrSupport ?? "true" } });
            }, on) : save())} disabled={!!busy}>{busy || (inPlayer ? "Uygula" : "Lossless Scaling'e kaydet")}</button>
            {st?.hotkey && <span className="muted small">Kısayol: {st.hotkey}</span>}
          </div>
          {msg && <div className="small up-msg">{msg}</div>}
        </div>
      )}
    </div>
  );
}
