import { useEffect, useState } from "react";
import { invoke } from "./nativeCore";
import { open } from "@tauri-apps/plugin-dialog";
import { tt } from "./i18n";
import { store } from "./library";
import { applySearchEngine } from "./searchEngine";
import { ENGINES, validTemplate } from "./webSearch";
import { parseAutoEq } from "./autoEq";
import { autoEqName, replayGainPref } from "./ShellRuntime";
import { autostartOn, NOTIFY_KINDS, NotifyKind, notifyAllowed, setAutostart, shellPrefs } from "./shellBridge";

const NOTE: Record<NotifyKind, () => string> = {
  whisper: () => tt("Whisper altyazıyı bitirince"),
  library: () => tt("Kütüphaneye yeni dosya gelince"),
  episode: () => tt("Takip ettiğin dizinin yeni bölümü çıkınca"),
  backup: () => tt("Otomatik yedek alınınca"),
};

function Check({ on, set, children, hint }: { on: boolean; set: (v: boolean) => void; children: React.ReactNode; hint?: string }) {
  return (
    <label className="look-check lp-check">
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} />
      <span>{children}{hint && <small className="lp-hint">{hint}</small>}</span>
    </label>
  );
}

/** Settings › General: Luna and Windows (tray, media keys, start with Windows, notifications, folder watching). */
export function ShellSettings() {
  const [, bump] = useState(0);
  const [auto, setAuto] = useState<boolean | null>(null);
  const [msg, setMsg] = useState("");
  useEffect(() => { void autostartOn().then(setAuto); }, []);
  const re = () => bump((n) => n + 1);
  const flag = (k: "shellTray" | "shellMedia" | "shellWatch" | "shellAutoWhisper", on: boolean) => { shellPrefs.set(k, on); re(); };
  return (
    <div className="set-card lp-set">
      <h3>{tt("Luna ve Windows")}</h3>
      <Check on={shellPrefs.tray()} set={(v) => flag("shellTray", v)} hint={tt("Pencereyi kapatınca Luna çalmaya devam eder; saatin yanındaki simgeden açılır ve kullanılır. Film oynuyorsa duraklar.")}>{tt("Kapatınca sistem tepsisine küçül")}</Check>
      <Check on={shellPrefs.mediaKeys()} set={(v) => flag("shellMedia", v)} hint={tt("Klavyenin ve kulaklığın oynat, sonraki, önceki tuşları başka uygulamadayken de Luna'yı yönetir. Başka bir program o tuşları tutuyorsa onlar atlanır.")}>{tt("Medya tuşları her yerde çalışsın")}</Check>
      <Check on={auto === true} set={(v) => { setAuto(v); setMsg(""); void setAutostart(v).then((r) => { setAuto(r); if (r !== v) setMsg(tt("Windows ile başlatma değiştirilemedi.")); }); }} hint={tt("Luna açılışta tepsiye iner, pencere açmaz.")}>{tt("Windows açılınca başlat")}</Check>
      <Check on={shellPrefs.watch()} set={(v) => flag("shellWatch", v)} hint={tt("Film, müzik ve kitap klasörlerine yeni dosya gelince ya da silinince kütüphane kendiliğinden yenilenir (kopyalama bitince, birkaç saniye sonra).")}>{tt("Klasörleri izle")}</Check>
      {shellPrefs.watch() && <div className="lp-sub">
        <Check on={shellPrefs.autoWhisper()} set={(v) => flag("shellAutoWhisper", v)} hint={tt("Altyazısı olmayan yeni filmler Whisper kuyruğuna girer. Motor ve model daha önce indirilmiş olmalı.")}>{tt("Yeni filmlere Whisper ile altyazı üret")}</Check>
      </div>}
      <h4 className="lp-h">{tt("Bildirimler")}</h4>
      <div className="lp-hint">{tt("Yalnızca Luna arka plandayken gösterilir.")}</div>
      {NOTIFY_KINDS.map((k) => (
        <Check key={k} on={shellPrefs.notify(k)} set={(v) => {
          // the switch moves at once; when Windows then refuses the permission it goes back
          shellPrefs.setNotify(k, v); re(); setMsg("");
          if (v) void notifyAllowed(true).then((ok) => { if (!ok) { shellPrefs.setNotify(k, false); re(); setMsg(tt("Windows bildirim iznini vermedi (Ayarlar › Sistem › Bildirimler).")); } });
        }}>{NOTE[k]()}</Check>
      ))}
      {msg && <div className="lp-msg" role="status">{msg}</div>}
    </div>
  );
}

/** Settings › General: sound extras and the address bar of Luna Web. */
export function SoundWebSettings() {
  const [rg, setRg] = useState(replayGainPref());
  const [eqName, setEqName] = useState(autoEqName());
  const [eqOn, setEqOn] = useState(store.get("autoEqOn") === "1");
  const [eqMsg, setEqMsg] = useState("");
  const [engine, setEngine] = useState(store.get("webSearch") ?? "google");
  const [custom, setCustom] = useState((store.get("webSearch") ?? "").startsWith("custom:") ? (store.get("webSearch") ?? "").slice(7) : "");
  const [customErr, setCustomErr] = useState(false);
  const snd = () => window.dispatchEvent(new Event("luna-sound-prefs"));
  const pickEq = async () => {
    const f = await open({ multiple: false, filters: [{ name: "AutoEq ParametricEQ", extensions: ["txt"] }] }).catch(() => null);
    if (typeof f !== "string") return;
    const text = await invoke<string>("text_file_read", { path: f }).catch(() => "");
    const eq = parseAutoEq(text);
    if (!eq) { setEqMsg(tt("Bu bir AutoEq ParametricEQ dosyasına benzemiyor.")); return; }
    const name = (f.split(/[\\/]/).pop() ?? f).replace(/\s*ParametricEQ\.txt$/i, "").replace(/\.txt$/i, "");
    store.set("autoEq", text); store.set("autoEqName", name); store.set("autoEqOn", "1");
    setEqName(name); setEqOn(true); setEqMsg(tt("{0} süzgeç yüklendi.", eq.filters.length) + (eq.skipped ? " " + tt("{0} süzgeç desteklenmediği için atlandı.", eq.skipped) : "")); snd();
  };
  const choose = (v: string) => {
    setEngine(v); setCustomErr(false);
    if (v === "custom") return;
    store.set("webSearch", v); applySearchEngine(v);
  };
  const saveCustom = () => {
    if (!validTemplate(custom)) { setCustomErr(true); return; }
    setCustomErr(false); store.set("webSearch", "custom:" + custom.trim()); applySearchEngine("custom:" + custom.trim());
  };
  return (
    <>
      <div className="set-card lp-set">
        <h3>{tt("Ses seviyesi ve kulaklık düzeltmesi")}</h3>
        <div className="lp-row">
          <span>{tt("ReplayGain (şarkıların etiketindeki ses düzeyi)")}</span>
          <select value={rg} onChange={(e) => { setRg(e.target.value as typeof rg); store.set("replayGain", e.target.value); snd(); }} aria-label={tt("ReplayGain")}>
            <option value="no">{tt("Kapalı")}</option>
            <option value="track">{tt("Parça")}</option>
            <option value="album">{tt("Albüm")}</option>
          </select>
        </div>
        <div className="lp-hint">{tt("Etiketinde ReplayGain olan dosyalarda şarkılar arası ses farkını giderir. Etiketsiz dosyalara dokunmaz.")}</div>
        <div className="lp-row">
          <span>{tt("Kulaklık düzeltmesi (AutoEq)")}{eqName && <b className="lp-name"> · {eqName}</b>}</span>
          <span className="lp-btns">
            <button className="chip" onClick={() => void pickEq()}>{eqName ? tt("Başka dosya…") : tt("Dosya seç…")}</button>
            {eqName && <button className="chip" onClick={() => { store.remove("autoEq"); store.remove("autoEqName"); store.set("autoEqOn", "0"); setEqName(""); setEqOn(false); setEqMsg(""); snd(); }}>{tt("Kaldır")}</button>}
          </span>
        </div>
        {eqName && <Check on={eqOn} set={(v) => { setEqOn(v); store.set("autoEqOn", v ? "1" : "0"); snd(); }}>{tt("Film ve müzikte uygula")}</Check>}
        <div className="lp-hint">{tt("Kulaklığının modeline göre hazırlanmış düzeltmeyi autoeq.app ya da github.com/jaakkopasanen/AutoEq adresinden “ParametricEQ.txt” olarak indirip buradan seç. Ses panelindeki ekolayzerle birlikte çalışır.")}</div>
        {eqMsg && <div className="lp-msg" role="status">{eqMsg}</div>}
      </div>
      <div className="set-card lp-set">
        <h3>{tt("Luna Web: arama")}</h3>
        <div className="lp-row">
          <span>{tt("Adres çubuğuna yazılan arama nereye gitsin?")}</span>
          <select value={engine.startsWith("custom") ? "custom" : engine} onChange={(e) => choose(e.target.value)} aria-label={tt("Arama motoru")}>
            {ENGINES.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            <option value="custom">{tt("Kendi adresim")}</option>
          </select>
        </div>
        {(engine === "custom" || engine.startsWith("custom")) && (
          <div className="lp-row">
            <input className="lp-input" value={custom} placeholder="https://searx.ornek.com/search?q=%s" onChange={(e) => setCustom(e.target.value)} aria-invalid={customErr} />
            <button className="chip" onClick={saveCustom}>{tt("Kaydet")}</button>
          </div>
        )}
        {customErr && <div className="lp-msg warn" role="alert">{tt("Adres https ile başlamalı ve bir tane %s içermeli.")}</div>}
        <div className="lp-hint">{tt("Kısa yollar: !w Vikipedi · !yt YouTube · !imdb IMDb · !tmdb TMDB · !lb Letterboxd · !gr Goodreads · !gh GitHub · !maps Haritalar · !tr Çeviri. Örnek: !yt dune fragman")}</div>
      </div>
    </>
  );
}
