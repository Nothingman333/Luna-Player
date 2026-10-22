import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { tt } from "./i18n";
import { isUrl, Item, store } from "./library";
import { ExtraModal } from "./Extras";
import { duplicateGroups, Fp, humanSize, looksLikeSample, wastedBytes } from "./healthModel";
import { cancelJob, newJob, onJob } from "./studioBridge";
import * as S from "./studioBridge";
import { enqueueWhisper } from "./SubtitleStudio";

type Report = {
  total: number; dups: Fp[][]; samples: Fp[]; gone: string[]; noSub: string[]; unmatched: string[];
};
const nameOf = (p: string) => p.split(/[\\/]/).pop() ?? p;

/** Settings / Ctrl+K: what is wrong with the film library, with a safe fix beside each finding. */
export function LibraryHealth({ items, onClose }: { items: Item[]; onClose: () => void }) {
  const [phase, setPhase] = useState<"idle" | "scan" | "done">("idle");
  const [pct, setPct] = useState(0);
  const [rep, setRep] = useState<Report | null>(null);
  const [err, setErr] = useState("");
  const [ask, setAsk] = useState("");
  const [note, setNote] = useState("");
  const job = useRef(0);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; if (job.current) void cancelJob(job.current); }, []);

  const scan = async () => {
    setErr(""); setNote(""); setPhase("scan"); setPct(0); setRep(null);
    const paths = [...new Set(items.flatMap((i) => i.files.map((f) => f.path)))].filter((p) => !isUrl(p));
    const j = job.current = newJob();
    const off = await onJob(j, (e) => alive.current && setPct(e.pct ?? 0));
    try {
      const exists = await invoke<boolean[]>("paths_exist", { paths }).catch(() => paths.map(() => true));
      const gone = paths.filter((_, i) => exists[i] === false);
      const here = paths.filter((_, i) => exists[i] !== false);
      const fps = await invoke<Fp[]>("library_fingerprints", { job: j, paths: here });
      const side = await invoke<number[]>("subs_beside", { paths: here }).catch(() => here.map(() => 1));
      const noSub = here.filter((p, i) => !side[i] && store.get("hasSub:" + p) !== "1");
      const unmatched = items.filter((i) => !i.meta && i.files.some((f) => !isUrl(f.path))).map((i) => i.files[0].path);
      if (!alive.current) return;
      setRep({ total: here.length, dups: duplicateGroups(fps), samples: fps.filter((f) => looksLikeSample(f.path, f.size)), gone, noSub, unmatched });
      setPhase("done");
    } catch (e) {
      if (alive.current) { setErr(String((e as Error)?.message ?? e)); setPhase("idle"); }
    } finally { off(); job.current = 0; }
  };

  const reveal = (path: string) => void invoke("reveal_file", { path }).catch((e) => setErr(String(e)));
  const trash = async (path: string) => {
    setAsk("");
    try {
      await invoke<number>("delete_file", { path });
      setNote(tt("{0} Geri Dönüşüm Kutusu'na gönderildi.", nameOf(path)));
      setRep((r) => r && { ...r, dups: r.dups.map((g) => g.filter((f) => f.path !== path)).filter((g) => g.length > 1), samples: r.samples.filter((f) => f.path !== path) });
      window.dispatchEvent(new CustomEvent("luna-rescan", { detail: { kinds: ["film"] } }));
    } catch (e) { setErr(String(e)); }
  };
  const whisperAll = () => {
    const todo = rep!.noSub.slice(0, 50);
    enqueueWhisper(todo.map((p) => ({ path: p, title: nameOf(p).replace(/\.[^.]+$/, "") })), S.prefs.lang(), false, { prompt: "", tidy: true });
    setNote(tt("{0} film Whisper kuyruğuna eklendi.", todo.length));
  };

  const FileRow = ({ f, kind }: { f: Fp; kind: string }) => (
    <div className="lh-file">
      <span className="lh-name" title={f.path}>{nameOf(f.path)}<small>{f.path.slice(0, f.path.length - nameOf(f.path).length)}</small></span>
      <span className="lh-size">{humanSize(f.size)}</span>
      <button className="chip" onClick={() => reveal(f.path)}>{tt("Klasörde göster")}</button>
      {ask === kind + f.path
        ? <><button className="chip danger" onClick={() => void trash(f.path)}>{tt("Evet, Geri Dönüşüm Kutusu'na gönder")}</button><button className="chip" onClick={() => setAsk("")}>{tt("Vazgeç")}</button></>
        : <button className="chip" onClick={() => setAsk(kind + f.path)}>{tt("Sil…")}</button>}
    </div>
  );

  return (
    <ExtraModal title={tt("Kütüphane sağlığı")} close={onClose}>
      <div className="lh">
        {phase === "idle" && <>
          <p className="lp-hint">{tt("Film kütüphanendeki dosyalara bakar: aynı dosyanın kopyaları, örnek (sample) klipler, kaybolan dosyalar, altyazısız ve eşleşmeyen filmler. Her dosyadan yalnızca 128 KB okunur; hiçbir şey kendiliğinden silinmez.")}</p>
          <button className="primary" onClick={() => void scan()}>{tt("Taramayı başlat")}</button>
        </>}
        {phase === "scan" && <div className="lh-prog" role="progressbar" aria-valuenow={Math.round(pct)}><i style={{ width: pct + "%" }} /><span>{tt("Taranıyor… %{0}", Math.round(pct))}</span><button className="chip" onClick={() => void cancelJob(job.current)}>{tt("Vazgeç")}</button></div>}
        {err && <div className="lp-msg warn" role="alert">{err}</div>}
        {note && <div className="lp-msg" role="status">{note}</div>}
        {rep && phase === "done" && <>
          <div className="lh-sum">{tt("{0} dosya tarandı.", rep.total)}</div>
          <section className="lh-sec"><h4>{tt("Aynı dosyanın kopyaları")} <small>{rep.dups.length ? tt("{0} grup · {1} boşa gidiyor", rep.dups.length, humanSize(wastedBytes(rep.dups))) : ""}</small></h4>
            {!rep.dups.length && <p className="lp-hint">{tt("Kopya yok.")}</p>}
            {rep.dups.slice(0, 40).map((g, i) => <div className="lh-group" key={i}>{g.map((f) => <FileRow key={f.path} f={f} kind="d" />)}</div>)}
            {rep.dups.length > 0 && <p className="lp-hint">{tt("Boyutu ve içeriğin başı ile sonu aynı olan dosyalar. Hangisini tutacağını sen seç.")}</p>}
          </section>
          <section className="lh-sec"><h4>{tt("Örnek (sample) klipler")}</h4>
            {!rep.samples.length && <p className="lp-hint">{tt("Yok.")}</p>}
            {rep.samples.slice(0, 40).map((f) => <FileRow key={f.path} f={f} kind="s" />)}
          </section>
          <section className="lh-sec"><h4>{tt("Kaybolan dosyalar")} <small>{rep.gone.length || ""}</small></h4>
            {!rep.gone.length && <p className="lp-hint">{tt("Yok.")}</p>}
            {rep.gone.slice(0, 40).map((p) => <div className="lh-file" key={p}><span className="lh-name" title={p}>{nameOf(p)}<small>{p}</small></span></div>)}
            {rep.gone.length > 0 && <p className="lp-hint">{tt("Taşınmış, silinmiş ya da çıkarılmış bir sürücüde olabilir.")}</p>}
          </section>
          <section className="lh-sec"><h4>{tt("Altyazı dosyası olmayan filmler")} <small>{rep.noSub.length || ""}</small></h4>
            {!rep.noSub.length && <p className="lp-hint">{tt("Hepsinin yanında altyazı var.")}</p>}
            {rep.noSub.length > 0 && <><p className="lp-hint">{tt("Videonun içine gömülü altyazılar sayılmaz.")}</p><button className="chip" onClick={whisperAll}>{tt("İlk {0} filme Whisper ile altyazı üret", Math.min(50, rep.noSub.length))}</button></>}
          </section>
          <section className="lh-sec"><h4>{tt("Eşleşmeyen filmler")} <small>{rep.unmatched.length || ""}</small></h4>
            {!rep.unmatched.length && <p className="lp-hint">{tt("Hepsi TMDB ile eşleşmiş.")}</p>}
            {rep.unmatched.slice(0, 30).map((p) => <div className="lh-file" key={p}><span className="lh-name" title={p}>{nameOf(p)}</span><button className="chip" onClick={() => reveal(p)}>{tt("Klasörde göster")}</button></div>)}
          </section>
          <button className="chip" onClick={() => void scan()}>{tt("Yeniden tara")}</button>
        </>}
      </div>
    </ExtraModal>
  );
}
