// Luna updates itself from GitHub, like any installed program: it looks once in a while, says
// "a new version is ready", and on a click downloads, checks the signature, installs and reopens.
// Betas (GitHub pre-releases) only when the user turns them on, after a warning.
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { tt } from "./i18n";
import { store } from "./library";
import { Icon, I } from "./Screens";
import { VERSION_LABEL } from "./version";

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
  const f = s.found;
  if (!f || s.hidden) return null;
  return (
    <div className="clip-offer glass upd-offer" role="status">
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
    </div>
  );
}

/** Settings › General: the update card. */
export function UpdateSettings({ onBackup }: { onBackup: () => void }) {
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
    <div className="set-card">
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
