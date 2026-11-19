import {publicReleaseNotes} from "./publicReleaseNotes";
import {developerSessionActive} from "./devSession";
import {visibleReleaseText,releaseChangeLine} from "./changeOrigin";
import {RELEASE_HISTORY} from "./releaseHistory";
import {unseenReleases} from "./releaseHistoryModel";
// Luna updates itself from GitHub, like any installed program: it looks once in a while, says
// "a new version is ready", and on a click downloads, checks the signature, installs and reopens.
// Betas (GitHub pre-releases) only when the user turns them on, after a warning.
import { useEffect, useState } from "react";
import { invoke } from "./nativeCore";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { lang,tt } from "./i18n";
import { store } from "./library";
import { Icon, I } from "./Screens";
import { APP_VERSION, VERSION_LABEL } from "./version";

type Info = { version: string; notes: string; date: string; beta: boolean; page: string; installable: boolean };
type State = { found: Info | null; checking: boolean; err: string; checkedAt: number; got: number; total: number; installing: boolean; hidden: boolean };

let S: State = { found: null, checking: false, err: "", checkedAt: Number(store.get("updChecked") ?? 0), got: 0, total: 0, installing: false, hidden: false };
const subs = new Set<() => void>();
const set = (p: Partial<State>) => { S = { ...S, ...p }; subs.forEach((f) => f()); };
function useUpd() {
  const [, bump] = useState(0);
  useEffect(() => { const f = () => bump((n) => n + 1); subs.add(f); return () => { subs.delete(f); }; }, []);
  return S;
}

export const updAuto = () => store.get("updAuto") !== "0";
export const updBeta = () => store.get("updBeta") === "1";

/** Looks for a newer version (quiet: no error shown, a skipped version stays hidden). */
export async function checkUpdate(quiet = false) {
  if (S.checking || S.installing) return;
  set({ checking: true, err: "" });
  const beta = updBeta();
  try {
    const f = await invoke<Info | null>("update_check", { beta });
    if (beta !== updBeta() || (quiet && !updAuto())) return;
    const now = Date.now();
    store.set("updChecked", String(now));
    const skipped = quiet && f && store.get("updSkip") === f.version;
    set({ found: f, checkedAt: now, hidden: !!skipped });
  } catch (e) {
    set({ err: quiet ? "" : String(e) });
  }
  finally { set({ checking: false }); }
}

/** At start: a look a little after opening, at most twice a day. */
export function startUpdateChecks() {
  if (!updAuto()) return;
  const due = Date.now() - S.checkedAt > 12 * 3600_000;
  if (due) setTimeout(() => { if (updAuto()) checkUpdate(true); }, 15_000);
}

async function install() {
  if (S.installing || S.checking || !S.found) return;
  set({ installing: true, err: "", got: 0, total: 0 });
  let un: (() => void) | undefined;
  try {
    un = await listen<[number, number | null]>("update-progress", (e) => set({ got: e.payload[0], total: e.payload[1] ?? 0 }));
    // Recheck also repopulates native Pending after a failed download consumed it.
    const f = await invoke<Info | null>("update_check", { beta: updBeta() });
    if (!f || (f.beta && !updBeta())) { set({ found: null }); return; }
    set({ found: f });
    await invoke("update_install");
  } catch (e) { set({ err: String(e) }); }
  finally { un?.(); set({ installing: false }); }
}

const mb = (n: number) => (n / 1048576).toFixed(1);

function Progress() {
  const s = useUpd();
  return (
    <div className="upd-prog">
      <div className="bk-bar"><div style={{ width: s.total ? Math.min(100, (s.got / s.total) * 100) + "%" : "8%" }} /></div>
      <span className="muted small">{s.total ? tt("İndiriliyor: {0} / {1} MB", mb(s.got), mb(s.total)) : tt("İndiriliyor…")} · {tt("bitince Luna kapanıp yeni sürümle açılır")}</span>
    </div>
  );
}

/** The "a new version is ready" card at the top (not over a playing film). */
export function UpdateBanner() {
  const s = useUpd();
  const [dismissed,setDismissed]=useState(()=>store.get("updatePopupSeen")??"");
  const dismissPopup=(version:string)=>{store.set("updatePopupSeen",version);setDismissed(version);};
  const f = s.found;
  if (!f || s.hidden) return null;
  return (
    <>{!s.installing && dismissed !== f.version && <section className="update-popup" role="dialog" aria-label={tt("Yeni sürüm hazır")}><h3>{tt("Luna {0} hazır", f.version)}</h3><p>{tt("Güncelleme hazır. İstersen şimdi yükleyebilir ya da daha sonra devam edebilirsin.")}</p><div className="upd-row">{f.installable ? <button className="primary sm" onClick={()=>{dismissPopup(f.version);void install();}}>{tt("Güncelle")}</button> : <button className="primary sm" onClick={()=>{dismissPopup(f.version);void openUrl(f.page);}}>{tt("İndirme sayfası")}</button>}<button className="chip" onClick={()=>dismissPopup(f.version)}>{tt("Sonra")}</button></div></section>}<div className="clip-offer glass upd-offer" role="status">
      <span className="clip-ic"><Icon d={I.down} size={16} /></span>
      <span className="clip-t">
        <b>{f.beta ? tt("Luna {0} (beta) hazır", f.version) : tt("Luna {0} hazır", f.version)}</b>
        {s.installing ? <Progress /> : <span className="muted small">{s.err ? tt("Güncellenemedi: {0}", s.err) : tt("Şu an {0} kullanıyorsun", VERSION_LABEL)}</span>}
      </span>
      {!s.installing && (
        <>
          {f.installable ? <button className="primary sm" onClick={install}>{tt("Güncelle")}</button>
            : <button className="primary sm" onClick={() => openUrl(f.page)}>{tt("İndirme sayfası")}</button>}
          <button className="chip" onClick={() => openUrl(f.page)}>{tt("Neler yeni")}</button>
          <button className="chip" onClick={() => set({ hidden: true })}>{tt("Sonra")}</button>
          <button className="chip" onClick={() => { store.set("updSkip", f.version); set({ hidden: true }); }}>{tt("Bu sürümü atla")}</button>
        </>
      )}
    </div></>
  );
}

/** Settings › General: the update card. */
export function UpdateSettings({ onBackup, bare = false }: { onBackup: () => void; bare?: boolean }) {
  const s = useUpd();
  const [auto, setAuto] = useState(updAuto);
  const [beta, setBeta] = useState(updBeta);
  const [warn, setWarn] = useState(false);
  const f = s.found;
  const betaOn = (on: boolean) => {
    if (on) { setWarn(true); return; }
    if (S.installing) return;
    setWarn(false); store.set("updBeta", "0"); setBeta(false); set({ found: null });
  };
  const confirmBeta = () => { store.set("updBeta", "1"); setBeta(true); setWarn(false); checkUpdate(); };
  return (
    <div className={bare ? "set-update-part" : "set-card"}>
      <div className="field">
        <span>{tt("Güncellemeler")}</span>
        <div className="upd-row">
          {s.checking ? <span className="muted small">{tt("Bakılıyor…")}</span>
            : f ? <span className="small"><b>{f.beta ? tt("Luna {0} (beta) hazır", f.version) : tt("Luna {0} hazır", f.version)}</b></span>
            : s.err ? <span className="small upd-err">{tt("Bakılamadı: {0}", s.err)}</span>
            : s.checkedAt ? <span className="muted small">{tt("Luna güncel · son bakış {0}", new Date(s.checkedAt).toLocaleString())}</span>
            : null}
          <span className="grow" />
          {f && !s.installing && (f.installable ? <button className="primary sm" onClick={install}>{tt("Güncelle")}</button>
            : <button className="primary sm" onClick={() => openUrl(f.page)}>{tt("İndirme sayfası")}</button>)}
          {!s.installing && <button className="chip" disabled={s.checking} onClick={() => checkUpdate()}>{tt("Şimdi bak")}</button>}
        </div>
        {s.installing && <Progress />}
        {f && !f.installable && <div className="set-hint">{tt("Bu kopya kendini kuramaz (taşınabilir zip ya da geliştirici sürümü); yeni sürümü indirme sayfasından al.")}</div>}
      </div>
      <label className="look-check">
        <input type="checkbox" checked={auto} onChange={(e) => { setAuto(e.target.checked); store.set("updAuto", e.target.checked ? "1" : "0"); }} />
        {tt("Yeni sürüm çıkınca haber ver")}
      </label>
      <label className="look-check">
        <input type="checkbox" checked={beta || warn} disabled={s.installing} onChange={(e) => betaOn(e.target.checked)} />
        {tt("Beta sürümlerini de al")}
      </label>
      {warn && (
        <div className="upd-warn">
          <b>{tt("Dikkat: betalar deneme sürümüdür")}</b>
          <div className="small">{tt("Yeni özellikleri herkesten önce alırsın ama hatalar olabilir; bir şey bozulabilir ya da Luna kapanabilir. Açmadan önce kütüphaneni, listelerini ve notlarını yedeklemeni öneririz; bir sorun olursa yedekten geri dönersin.")}</div>
          <div className="seg-row">
            <button className="primary sm" onClick={onBackup}>{tt("Önce yedek al")}</button>
            <button className="chip" onClick={confirmBeta}>{tt("Anladım, betaları aç")}</button>
            <button className="chip" onClick={() => setWarn(false)}>{tt("Vazgeç")}</button>
          </div>
        </div>
      )}
      <div className="set-hint">{tt("Luna yeni sürümü GitHub'dan alır; indirilen dosyanın imzası kontrol edilir, sonra kurulup Luna yeniden açılır. Verilerin yerinde kalır.")}</div>
    </div>
  );
}

const NL=String.fromCharCode(10);
export function ReleaseNews(){
 const [developer,setDeveloper]=useState(developerSessionActive);
 const [video]=useState(()=>"/release-media/background-"+(Math.random()<.5?1:2)+".mp4");
 useEffect(()=>{const update=()=>setDeveloper(developerSessionActive());window.addEventListener("luna-dev-session",update);return()=>window.removeEventListener("luna-dev-session",update);},[]);
 // Dev build only (Luna Dev), once per version: show the screen as if updating from 1.6.3, to check it. Never in releases.
 const [open,setOpen]=useState(()=>{if(import.meta.env.DEV&&store.get("devNewsDemo")!==APP_VERSION){store.set("devNewsDemo",APP_VERSION);store.set("releaseNewsSeen","1.6.3");}return store.get("releaseNewsSeen")!==APP_VERSION;});
 if(!open)return null;
 const unseen=unseenReleases(RELEASE_HISTORY,store.get("releaseNewsSeen"),APP_VERSION);
 // Every version between the last one seen and this one, each with its own changes ([dev] lines only for developers).
 const releases=unseen.map(row=>({...row,text:visibleReleaseText(row.text,developer)})).filter(row=>row.text.replace(/^#+.*$/gm,"").trim());
 const seen=store.get("releaseNewsSeen");
 const publicNotes=publicReleaseNotes(unseen,lang()==="en");
 const close=()=>{store.set("releaseNewsSeen",APP_VERSION);setOpen(false);};
 return <div className="modal-bg release-news-bg" onClick={e=>{if(e.target===e.currentTarget)close();}} onKeyDown={e=>{if(e.key==="Escape"){e.stopPropagation();close();}}}><section className="modal release-news" role="dialog" aria-modal="true" aria-labelledby="release-news-title"><video className="release-news-video" src={video} autoPlay loop muted playsInline preload="metadata" aria-hidden="true"/><div className="release-news-scrim"/><h2 id="release-news-title">{tt("Luna {0} · Neler yeni?",VERSION_LABEL)}</h2>{!developer?<>{seen&&unseen.length>1&&<p className="release-span">{tt("{0} sürümünden bu yana {1} güncelleme",seen,String(unseen.length))}</p>}<div className="release-history release-summary"><ul>{publicNotes.map(note=><li key={note}>{note}</li>)}</ul></div></>:<>{seen&&releases.length>1&&<p className="release-span">{tt("{0} sürümünden bu yana {1} güncelleme",seen,String(releases.length))}</p>}<div className="release-history release-timeline">{releases.map((release,n)=><section key={release.version} className={n===0?"latest":""}><h3><span className="release-ver">{release.version}</span>{n===0&&<span className="release-now">{tt("Şimdi")}</span>}</h3><ul>{release.text.split(NL).filter(line=>line.trim()&&!/^#/.test(line)).map((line,k)=><li key={k}>{releaseChangeLine(line.replace(/^\s*-\s*/,""),lang()==="en")}</li>)}</ul></section>)}</div></>}<div className="modal-actions"><button className="primary" autoFocus onClick={close}>{tt("Başlayalım")}</button></div></section></div>;
}
