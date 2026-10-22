import { useEffect, useRef, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { tt } from "./i18n";
import { fmtTime } from "./mpv";
import { ExtraModal } from "./Extras";
import { cancelJob, newJob, onJob } from "./studioBridge";
import { store, useMediaInfo } from "./library";

type Fmt = "mp4" | "webm" | "gif";
const CAPS: [string, number | null][] = [["Sınırsız", null], ["8 MB", 8], ["25 MB", 25], ["50 MB", 50]];

/** Press X: cuts the part between two moments into an MP4, WebM or GIF (made by mpv itself, no other program needed). */
export function ClipMaker({ path, title, time, duration, subFile, onClose }: { path: string; title: string; time: number; duration: number; subFile?: string | null; onClose: () => void }) {
  const height = useMediaInfo(path)?.height;
  const [a, setA] = useState(() => Math.max(0, Math.floor(time)));
  const [b, setB] = useState(() => Math.min(duration || Infinity, Math.floor(time) + 15));
  const [fmt, setFmt] = useState<Fmt>((store.get("clipFmt") as Fmt) || "mp4");
  const [cap, setCap] = useState<number | null>(() => { const v = store.get("clipCap"); return v ? Number(v) || null : null; });
  const [burn, setBurn] = useState(true);
  const [phase, setPhase] = useState<"form" | "work" | "done">("form");
  const [pct, setPct] = useState<number | null>(null);
  const [out, setOut] = useState("");
  const [err, setErr] = useState("");
  const job = useRef(0);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; if (job.current) void cancelJob(job.current); }, []);
  const len = b - a;
  // the first and last picture of the clip, shown while choosing (the seek-bar preview renderer, cached per second)
  const [thumbs, setThumbs] = useState<[string | null, string | null]>([null, null]);
  useEffect(() => {
    let alive = true;
    const t = window.setTimeout(() => {
      Promise.all([a, b].map((x) => invoke<string>("seek_preview", { path, secs: Math.floor(x) }).then(convertFileSrc).catch(() => null)))
        .then(([x, y]) => alive && setThumbs([x, y]));
    }, 350);
    return () => { alive = false; clearTimeout(t); };
  }, [path, Math.floor(a), Math.floor(b)]);
  const ok = len >= 0.5 && len <= 600;
  const go = async () => {
    setErr("");
    const base = title.replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 60) || "Luna";
    const target = await save({ defaultPath: `${base} ${fmtTime(a).replace(/:/g, ".")}.${fmt}`, filters: [{ name: fmt.toUpperCase(), extensions: [fmt] }] }).catch(() => null);
    if (!target) return;
    store.set("clipFmt", fmt); store.set("clipCap", cap ? String(cap) : "");
    const j = job.current = newJob();
    setPhase("work"); setPct(null);
    const off = await onJob(j, (e) => alive.current && setPct(e.pct));
    try {
      const file = await invoke<string>("make_clip", { job: j, input: path, out: target, format: fmt, start: a, end: b, subFile: subFile ?? null, burnSubs: burn, maxMb: fmt === "gif" ? null : cap, srcHeight: height ?? null });
      if (alive.current) { setOut(file); setPhase("done"); }
    } catch (e) { if (alive.current) { setErr(String((e as Error)?.message ?? e)); setPhase("form"); } }
    finally { off(); job.current = 0; }
  };
  const num = (v: number, set: (n: number) => void) => (
    <input className="lp-input cm-t" type="number" min={0} step={0.5} value={Number(v.toFixed(1))} onChange={(e) => set(Math.max(0, Number(e.target.value) || 0))} aria-label={tt("Saniye")} />
  );
  return (
    <ExtraModal title={tt("Klip kes")} close={() => { if (phase !== "work") onClose(); }}>
      <div className="cm">
        {phase === "form" && <>
          <div className="cm-frames" aria-hidden="true">
            <figure>{thumbs[0] ? <img src={thumbs[0]} alt="" /> : <i />}<figcaption>{fmtTime(a)}</figcaption></figure>
            <span className="cm-arrow">→</span>
            <figure>{thumbs[1] ? <img src={thumbs[1]} alt="" /> : <i />}<figcaption>{fmtTime(b)}</figcaption></figure>
          </div>
          <div className="cm-row"><span>{tt("Başlangıç")}</span>{num(a, setA)}<button className="chip" onClick={() => setA(Math.floor(time))}>{tt("Şimdi ({0})", fmtTime(time))}</button></div>
          <div className="cm-row"><span>{tt("Bitiş")}</span>{num(b, setB)}<button className="chip" onClick={() => setB(Math.floor(time))}>{tt("Şimdi ({0})", fmtTime(time))}</button>
            {[5, 10, 15, 30].map((d) => <button key={d} className="chip" onClick={() => setB(Math.min(duration || Infinity, a + d))}>{`+${d} ${tt("sn")}`}</button>)}</div>
          <div className={"cm-len" + (ok ? "" : " bad")}>{ok ? tt("Süre: {0} sn", len.toFixed(1)) : tt("Klip yarım saniyeden uzun, on dakikadan kısa olmalı.")}</div>
          <div className="cm-row"><span>{tt("Biçim")}</span>
            {(["mp4", "webm", "gif"] as Fmt[]).map((f) => <button key={f} className={"seg sm" + (fmt === f ? " on" : "")} onClick={() => setFmt(f)}>{f.toUpperCase()}</button>)}</div>
          {fmt !== "gif" && <div className="cm-row"><span>{tt("Boyut sınırı")}</span>
            {CAPS.map(([l, v]) => <button key={l} className={"seg sm" + (cap === v ? " on" : "")} onClick={() => setCap(v)}>{v ? l : tt("Sınırsız")}</button>)}</div>}
          <label className="look-check lp-check"><input type="checkbox" checked={burn} onChange={(e) => setBurn(e.target.checked)} /><span>{tt("Altyazıyı görüntüye göm")}</span></label>
          <p className="lp-hint">{fmt === "gif" ? tt("GIF küçük (480 piksel), sessiz ve renkleri sınırlıdır.") : tt("Görüntü en çok 720 piksel yüksekliğinde kodlanır.")}</p>
          {err && <div className="lp-msg warn" role="alert">{err}</div>}
          <div className="cm-actions"><button className="primary" disabled={!ok} onClick={() => void go()}>{tt("Kaydet…")}</button><button className="chip" onClick={onClose}>{tt("Kapat")}</button></div>
        </>}
        {phase === "work" && <div className="lh-prog" role="progressbar"><i className={pct == null ? "indet" : ""} style={{ width: pct == null ? "35%" : pct + "%" }} /><span>{tt("Klip hazırlanıyor…")}</span><button className="chip" onClick={() => void cancelJob(job.current)}>{tt("Vazgeç")}</button></div>}
        {phase === "done" && <>
          <div className="lp-msg" role="status">{tt("Klip hazır.")}</div>
          <div className="lh-file"><span className="lh-name" title={out}>{out.split(/[\\/]/).pop()}<small>{out}</small></span></div>
          <div className="cm-actions"><button className="chip" onClick={() => void invoke("reveal_file", { path: out }).catch(() => {})}>{tt("Klasörde göster")}</button><button className="primary" onClick={onClose}>{tt("Tamam")}</button></div>
        </>}
      </div>
    </ExtraModal>
  );
}
