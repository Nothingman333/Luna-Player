// Settings › Backup: everything Luna remembers (library records, lists, notes, settings; not the
// media files and not the API keys) as one file the user keeps where they like. No cloud link:
// the cloud buttons only open the site, the user uploads the file there themselves.
import { tt } from "./i18n";
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { SECRET_KEYS, store } from "./library";
import { VERSION_LABEL } from "./version";

const CLOUDS: [string, string][] = [
  ["Google Drive", "https://drive.google.com/drive/my-drive"],
  ["OneDrive", "https://onedrive.live.com/"],
  ["Dropbox", "https://www.dropbox.com/home"],
];

function snapshot(): Record<string, string> {
  const o: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)!;
    if (!SECRET_KEYS.includes(k)) o[k] = localStorage.getItem(k) ?? "";
  }
  return o;
}

export function BackupSettings() {
  const [file, setFile] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const last = Number(store.get("backupAt") ?? 0);

  const make = async () => {
    setMsg("");
    const day = new Date().toISOString().slice(0, 10);
    const path = await save({ defaultPath: `Luna ${tt("yedek")} ${day}.json`, filters: [{ name: tt("Luna yedeği"), extensions: ["json"] }] });
    if (!path) return;
    setBusy(true);
    try {
      store.set("backupAt", String(Date.now()));
      const json = JSON.stringify({ luna: "backup", version: VERSION_LABEL, at: new Date().toISOString(), data: snapshot() });
      await invoke("backup_write", { path, json });
      setFile(path);
    } catch (e) { setMsg(String(e)); } finally { setBusy(false); }
  };

  const restore = async () => {
    setMsg("");
    const path = await open({ multiple: false, filters: [{ name: tt("Luna yedeği"), extensions: ["json"] }] });
    if (typeof path !== "string") return;
    setBusy(true);
    try {
      const o = JSON.parse(await invoke<string>("backup_read", { path }));
      if (o?.luna !== "backup" || typeof o.data !== "object") throw new Error(tt("Bu bir Luna yedek dosyası değil"));
      const when = o.at ? new Date(o.at).toLocaleString() : "?";
      if (!confirm(tt("{0} tarihli yedek geri yüklensin mi? Luna'daki şu anki kayıtların yerini alır (API anahtarların yerinde kalır).", when))) return;
      localStorage.clear();
      for (const [k, v] of Object.entries(o.data as Record<string, string>)) if (!SECRET_KEYS.includes(k)) localStorage.setItem(k, String(v));
      // the copy Luna restores from after a crash gets the backup too
      await invoke("state_save", { json: JSON.stringify(snapshot()) }).catch(() => {});
      location.reload();
    } catch (e) { setMsg(String(e).replace(/^(Error|SyntaxError): /, "")); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="set-card">
        <div className="field">
          <span>{tt("Yedek dosyası")}</span>
          <div className="set-hint">{tt("Kütüphanendeki kayıtlar, izlediklerin, listelerin, notların, okuma yerlerin ve ayarların tek bir dosyada. Filmler, şarkılar ve kitapların kendisi yedeğe girmez; API anahtarların da güvenlik için girmez.")}</div>
          <div className="backup-row">
            <button className="primary" disabled={busy} onClick={make}>{busy ? tt("Hazırlanıyor…") : tt("Yedek dosyasını kaydet")}</button>
            <button className="chip" disabled={busy} onClick={restore}>{tt("Yedekten geri yükle")}</button>
          </div>
          {last > 0 && !file && <div className="set-hint">{tt("Son yedek: {0}", new Date(last).toLocaleString())}</div>}
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
              <button className="chip" onClick={() => invoke("reveal_file", { path: file }).catch(() => {})}>{tt("Klasörde göster")}</button>
              {CLOUDS.map(([name, url]) => <button key={name} className="chip" onClick={() => openUrl(url)}>{tt("{0}'a yükle", name)} ↗</button>)}
            </div>
            <div className="set-hint">{tt("Düğme siteyi tarayıcıda açar; dosyayı oraya sürükleyip bırakman yeter. Luna hesabına bağlanmaz.")}</div>
          </div>
        </div>
      )}
    </>
  );
}
