import {ExtraModal,extraText} from "./Extras";
import {preserveApiConnections,backupComparison,backupDate,localBackupDay,sameBackupPath} from "./backupModel";
import "./BackupTools.css";
// Settings › Backup: everything Luna remembers (library records, lists, notes, settings; not the
// media files and not the API keys) as one file the user keeps where they like. No cloud link:
// the cloud buttons only open the site, the user uploads the file there themselves.
import { tt } from "./i18n";
import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { SECRET_KEYS, store } from "./library";
import { backupData, replaceStorage, storageSnapshot } from "./safety";
import { VERSION_LABEL } from "./version";

const CLOUDS: [string, string][] = [
  ["Google Drive", "https://drive.google.com/drive/my-drive"],
  ["OneDrive", "https://onedrive.live.com/"],
  ["Dropbox", "https://www.dropbox.com/home"],
];

const snapshot = () => storageSnapshot(localStorage, SECRET_KEYS);

export function BackupSettings() {
  const [file, setFile] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const last = Number(store.get("backupAt") ?? 0);
  const [preview,setPreview]=useState<{path:string;data:Record<string,string>;at:unknown;version:string}|null>(null);
  const [safetyCopy,setSafetyCopy]=useState(true);
  const lock=useRef(false),alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const run=async(action:()=>Promise<void>)=>{if(lock.current)return;lock.current=true;setBusy(true);setMsg("");try{await action();}catch(e){if(alive.current)setMsg(String(e).replace(/^(Error|SyntaxError): /,""));}finally{lock.current=false;if(alive.current)setBusy(false);}};
  const writeBackup=async(path:string)=>{const at=Date.now();const json=JSON.stringify({luna:"backup",version:VERSION_LABEL,at:new Date(at).toISOString(),data:snapshot()});await invoke("backup_write",{path,json});return at;};

  const make = () => run(async()=>{
    const path=await save({defaultPath:`Luna ${tt("yedek")} ${localBackupDay()}.json`,filters:[{name:tt("Luna yedeği"),extensions:["json"]}]});
    if(!path||!alive.current)return;
    const at=await writeBackup(path);store.set("backupAt",String(at));if(alive.current)setFile(path);
  });
  const restore = () => run(async()=>{
    const path=await open({multiple:false,filters:[{name:tt("Luna yedeği"),extensions:["json"]}]});
    if(typeof path!=="string"||!alive.current)return;
    const o=JSON.parse(await invoke<string>("backup_read",{path}));
    const data=backupData(o,SECRET_KEYS);if(!alive.current)return;
    setSafetyCopy(true);setPreview({path,data,at:o.at,version:typeof o.version==="string"?o.version:"—"});
  });
  const applyRestore=()=>run(async()=>{
    if(!preview)return;
    if(safetyCopy){
      const path=await save({defaultPath:`Luna ${extraText("geri-yukleme-oncesi","before-restore")} ${localBackupDay()}.json`,filters:[{name:tt("Luna yedeği"),extensions:["json"]}]});
      if(!path||!alive.current)return;
      if(sameBackupPath(path,preview.path))throw Error(extraText("Güvenlik kopyası için seçtiğin yedekten farklı bir dosya seç.","Choose a different file for the safety copy so the selected backup is not overwritten."));
      await writeBackup(path);if(!alive.current)return;
    }
    const data=preserveApiConnections(preview.data,snapshot());data.lunaMark="1";
    await replaceStorage(localStorage,data,next=>invoke("state_save",{json:JSON.stringify(next)}));
    location.reload();
  });
  const comparison=preview?backupComparison(snapshot(),preserveApiConnections(preview.data,snapshot())):null;

  return (
    <>
      {preview&&comparison&&<ExtraModal title={extraText("Yedeği geri yüklemeden önce","Review backup before restoring")} close={()=>{if(!lock.current)setPreview(null);}}><div className="luna-extra backup-preview"><p>{extraText("Bu işlem mevcut kütüphane kayıtları, listeler ve ayarların yerini seçtiğin yedekle değiştirir. Medya dosyalarını değiştirmez.","This replaces the current library records, lists and settings with the selected backup. Media files stay unchanged.")}</p><div className="backup-preview-file" title={preview.path}>{preview.path}</div><dl><div><dt>{extraText("Tarih","Date")}</dt><dd>{backupDate(preview.at)}</dd></div><div><dt>{extraText("Luna sürümü","Luna version")}</dt><dd>{preview.version}</dd></div></dl><p className="backup-profile-note">{extraText("Bu bilgisayarın API profilleri, sağlayıcı bağlantıları ve anahtarları korunur. Böylece kayıtlı bir anahtar yedekteki farklı bir adrese gönderilmez.","This computer’s API profiles, provider connections and keys are kept, so an existing key is not paired with a different endpoint from the backup.")}</p><details><summary>{extraText("Kayıt gruplarındaki değişiklikler","Changes to stored record groups")}</summary><div className="backup-diff-counts"><span>+ {comparison.added} {extraText("yeni","new")}</span><span>↻ {comparison.changed} {extraText("değişecek","changed")}</span><span>− {comparison.removed} {extraText("yedekte yok","absent from backup")}</span></div></details><label className="backup-safety-option"><input type="checkbox" checked={safetyCopy} disabled={busy} onChange={e=>setSafetyCopy(e.target.checked)}/><span>{extraText("Önce mevcut kayıtlarımın güvenlik kopyasını kaydet","Save a safety copy of my current records first")}</span></label>{msg&&<p role="alert" className="plugin-msg small err">{msg}</p>}<div className="extra-row"><button className="primary" disabled={busy} onClick={()=>void applyRestore()}>{busy?extraText("İşleniyor…","Working…"):extraText("Yedeği geri yükle","Restore this backup")}</button><button className="chip" disabled={busy} onClick={()=>setPreview(null)}>{extraText("Vazgeç","Cancel")}</button></div></div></ExtraModal>}
      <div className="set-card">
        <div className="field">
          <span>{tt("Yedek dosyası")}</span>
          <div className="set-hint">{tt("Kütüphanendeki kayıtlar, izlediklerin, listelerin, notların, okuma yerlerin ve ayarların tek bir dosyada. Filmler, şarkılar ve kitapların kendisi yedeğe girmez; API anahtarların da güvenlik için girmez.")}</div>
          <div className="backup-row">
            <button className="primary" disabled={busy} onClick={make}>{busy ? tt("Hazırlanıyor…") : tt("Yedek dosyasını kaydet")}</button>
            <button className="chip" disabled={busy} onClick={restore}>{tt("Yedekten geri yükle")}</button>
          </div>
          {Number.isFinite(last) && last > 0 && !file && <div className="set-hint">{tt("Son yedek: {0}", new Date(last).toLocaleString())}</div>}
          {msg && <div className="plugin-msg small err">{msg}</div>}
        </div>
      </div>
      {file && (
        <div className="set-card backup-done">
          <div className="field">
            <span>{tt("Yedeğin hazır")}</span>
            <div className="set-hint">{tt("Bunu sakla: kütüphaneni geri getirecek dosya bu. Başka bir yere de koymak istersen buluta kendin yükleyebilirsin.")}</div>
            <div className="backup-file ellipsis" title={file}>{file}</div>
            <div className="backup-row">
              <button className="chip" onClick={() => void invoke("reveal_file", { path: file }).catch(e=>setMsg(String(e)))}>{tt("Klasörde göster")}</button>
              {CLOUDS.map(([name, url]) => <button key={name} className="chip" onClick={() => void openUrl(url).catch(e=>setMsg(String(e)))}>{tt("{0}'a yükle", name)} ↗</button>)}
            </div>
            <div className="set-hint">{tt("Düğme siteyi tarayıcıda açar; dosyayı oraya sürükleyip bırakman yeter. Luna hesabına bağlanmaz.")}</div>
          </div>
        </div>
      )}
    </>
  );
}
