import {webPlaybackSource} from "./webPlaybackSource";
import { useEffect, useRef, useState } from "react";
import { convertFileSrc, invoke } from "./nativeCore";
import { save } from "@tauri-apps/plugin-dialog";
import { tt } from "./i18n";
import { fmtTime } from "./mpv";
import { ExtraModal, extraText } from "./Extras";
import { cancelJob, newJob, onJob } from "./studioBridge";
import { store, useMediaInfo } from "./library";

type Fmt = "mp4" | "webm" | "gif";
const CAPS: [string, number | null][] = [["Sınırsız", null], ["8 MB", 8], ["25 MB", 25], ["50 MB", 50]];

/** Accept seconds, m:ss or h:mm:ss; fractions belong to the seconds field. */
export function parseClipTime(text:string):number|null{
 const clean=text.trim().replace(',','.');if(!/^\d+(?::\d{1,2}){0,2}(?:\.\d{1,3})?$/.test(clean))return null;
 const parts=clean.split(':').map(Number);if(parts.slice(1).some(n=>n>=60))return null;
 const seconds=parts.reduce((total,n)=>total*60+n,0);return Number.isFinite(seconds)&&seconds>=0?seconds:null;
}
export function formatClipTime(value:number):string{const n=Math.max(0,Math.round(value*1000)/1000),fraction=Number((n-Math.floor(n)).toFixed(3));return fmtTime(n)+(fraction?String(fraction).slice(1):'');}
function ClipTimeField({value,onChange,label,onInvalid}:{value:number;onChange:(n:number)=>void;label:string;onInvalid:(bad:boolean)=>void}){
 const [draft,setDraft]=useState(()=>formatClipTime(value));
 useEffect(()=>{setDraft(formatClipTime(value));},[value]);
 const invalid=parseClipTime(draft)===null;
 const commit=()=>{const n=parseClipTime(draft);if(n===null){onInvalid(true);return;}onChange(n);setDraft(formatClipTime(n));onInvalid(false);};
 return <input className="lp-input cm-t" type="text" inputMode="text" maxLength={24} value={draft} placeholder="0:00" aria-label={label} aria-invalid={invalid} onChange={e=>{setDraft(e.target.value);onInvalid(parseClipTime(e.target.value)===null);}} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();commit();}if(e.key==='Escape'){e.preventDefault();setDraft(formatClipTime(value));onInvalid(false);}}}/>;
}

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
  useEffect(() => {alive.current=true;return () => { alive.current = false; if (job.current) void cancelJob(job.current); };}, []);
  const [badTime,setBadTime]=useState([false,false]);
  const len = b - a;
  // the first and last picture of the clip, shown while choosing (the seek-bar preview renderer, cached per second)
  const [thumbs, setThumbs] = useState<[string | null, string | null]>([null, null]);
  const [pending,setPending]=useState([true,true]);
  useEffect(()=>{let live=true;setPending([true,true]);setThumbs([null,null]);const timer=window.setTimeout(()=>{[a,b].forEach((secs,i)=>{void invoke<string>('seek_preview',{...webPlaybackSource(path),secs:Math.floor(secs)}).then(convertFileSrc).then(url=>{if(live)setThumbs(old=>{const next:[string|null,string|null]=[...old];next[i]=url;return next;});}).catch(()=>{}).finally(()=>{if(live)setPending(old=>old.map((v,j)=>j===i?false:v));});});},350);return()=>{live=false;clearTimeout(timer);};},[path,Math.floor(a),Math.floor(b)]);
  const ok = len >= 0.5 && len <= 600&&!badTime.some(Boolean);
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
      const file = await invoke<string>("make_clip", { job: j, input: webPlaybackSource(path).path,referrer:webPlaybackSource(path).referrer,agent:webPlaybackSource(path).agent, out: target, format: fmt, start: a, end: b, subFile: subFile ?? null, burnSubs: burn, maxMb: fmt === "gif" ? null : cap, srcHeight: height ?? null });
      if (alive.current) { setOut(file); setPhase("done"); }
    } catch (e) { if (alive.current) { setErr(String((e as Error)?.message ?? e)); setPhase("form"); } }
    finally { off(); job.current = 0; }
  };
  return (
    <ExtraModal className="clip-maker-modal" title={tt("Klip kes")} close={() => { if (phase !== "work") onClose(); }}>
      <div className="clip-maker">
        {phase === "form" && <>
          <div className="cm-frames" aria-hidden="true">
            <figure><div className="cm-preview">{thumbs[0]?<img src={thumbs[0]!} alt=""/>:pending[0]?<div className="preview-loading" role="status"><i/>{extraText("Önizleme yükleniyor…","Loading preview…")}</div>:<span className="muted small">{extraText("Önizleme alınamadı","Preview unavailable")}</span>}</div><figcaption>{fmtTime(a)}</figcaption></figure>
            <span className="cm-arrow">→</span>
            <figure><div className="cm-preview">{thumbs[1]?<img src={thumbs[1]!} alt=""/>:pending[1]?<div className="preview-loading" role="status"><i/>{extraText("Önizleme yükleniyor…","Loading preview…")}</div>:<span className="muted small">{extraText("Önizleme alınamadı","Preview unavailable")}</span>}</div><figcaption>{fmtTime(b)}</figcaption></figure>
          </div>
          <div className="cm-row"><span>{tt("Başlangıç")}</span><ClipTimeField value={a} onChange={setA} label={extraText("Başlangıç zamanı","Start time")} onInvalid={bad=>setBadTime(old=>[bad,old[1]])}/><button className="chip" onClick={() => setA(Math.floor(time))}>{tt("Şimdi ({0})", fmtTime(time))}</button></div>
          <div className="cm-row"><span>{tt("Bitiş")}</span><ClipTimeField value={b} onChange={setB} label={extraText("Bitiş zamanı","End time")} onInvalid={bad=>setBadTime(old=>[old[0],bad])}/><button className="chip" onClick={() => setB(Math.floor(time))}>{tt("Şimdi ({0})", fmtTime(time))}</button>
            {[5, 10, 15, 30].map((d) => <button key={d} className="chip" onClick={() => setB(Math.min(duration || Infinity, a + d))}>{`+${d} ${tt("sn")}`}</button>)}</div>
          <div className={"cm-len" + (ok ? "" : " bad")}>{badTime.some(Boolean)?extraText("Zamanı 5:34 veya 1:05:34 biçiminde gir.","Enter a time such as 5:34 or 1:05:34."):ok ? tt("Süre: {0} sn", len.toFixed(1)) : tt("Klip yarım saniyeden uzun, on dakikadan kısa olmalı.")}</div>
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
