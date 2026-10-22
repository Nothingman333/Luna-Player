import { useEffect, useState } from "react";
import { invoke } from "./nativeCore";
import { openUrl } from "@tauri-apps/plugin-opener";
import { store } from "./library";
import { lang, setLang, tt } from "./i18n";
import { I, Icon, LunaMark } from "./Screens";

/** First-run check: what Luna needs on this computer, with download links for anything missing. */
type SysCheck = { mpv: boolean; vulkan: boolean; gpus: string[]; lossless: boolean; webview: string | null };
type State = "ok" | "missing" | "optional" | "wait";

export const setupSeen = () => store.get("setupDone") === "1";

/** Driver download page for the graphics card that's in the computer. */
function driverLink(gpus: string[]) {
  const g = gpus.join(" ").toLowerCase();
  if (g.includes("nvidia")) return { name: "NVIDIA", url: "https://www.nvidia.com/Download/index.aspx" };
  if (g.includes("amd") || g.includes("radeon")) return { name: "AMD", url: "https://www.amd.com/en/support/download/drivers.html" };
  if (g.includes("intel")) return { name: "Intel", url: "https://www.intel.com/content/www/us/en/support/detect.html" };
  return { name: "Windows Update", url: "https://support.microsoft.com/windows/update-drivers-manually-in-windows-ec62f46c-ff14-c91d-eead-d7126dc1f7b6" };
}

const KEYS = [
  { id: "tmdbKey", name: "TMDB", what: "Afiş, özet, oyuncular, öneriler", url: "https://www.themoviedb.org/settings/api" },
  { id: "geminiKey", name: "Gemini", what: "Asistan ve çeviriler", url: "https://aistudio.google.com/apikey" },
  { id: "osKey", name: "OpenSubtitles", what: "Altyazı arama", url: "https://www.opensubtitles.com/consumers" },
];

function Row({ state, title, text, action }: { state: State; title: string; text: string; action?: { label: string; url: string } }) {
  return (
    <div className={"su-row " + state}>
      <div className="su-ic">{state === "wait" ? <i className="su-spin" /> : state === "ok" ? <Icon d={I.check} size={16} /> : state === "missing" ? "!" : "+"}</div>
      <div className="su-txt"><b>{title}</b><span>{text}</span></div>
      {action && <button className="su-act" onClick={() => openUrl(action.url)}>{action.label} <Icon d={I.right} size={14} /></button>}
    </div>
  );
}

export function Setup({ onDone }: { onDone: () => void }) {
  const [c, setC] = useState<SysCheck | null>(null);
  const [failed, setFailed] = useState(false);
  const [n, setN] = useState(0);
  const [keys, setKeys] = useState<Record<string, string>>(() => Object.fromEntries(KEYS.map((k) => [k.id, store.get(k.id) ?? ""])));
  useEffect(() => {
    setC(null); setFailed(false);
    // if the check itself can't run, say so instead of marking everything missing
    invoke<SysCheck>("system_check").then(setC).catch(() => setFailed(true));
  }, [n]);
  const setKey = (id: string, v: string) => { setKeys((k) => ({ ...k, [id]: v })); store.set(id, v.trim()); };
  const st = (ok: boolean | undefined, optional = false): State => (failed ? "optional" : c == null ? "wait" : ok ? "ok" : optional ? "optional" : "missing");
  const drv = driverLink(c?.gpus ?? []);
  const blocking = c != null && (!c.mpv || !c.vulkan);
  const done = () => { store.set("setupDone", "1"); onDone(); };
  return (
    <div className="tour-bg su-bg">
      <div className="tour-glow g1" /><div className="tour-glow g2" />
      <div className="tour-top">
        <div className="brand"><LunaMark size={24} /> Luna Player</div>
        <div className="grow" />
        <div className="tour-lang">
          <button className={lang() === "en" ? "on" : ""} onClick={() => lang() !== "en" && setLang("en")}>EN</button>
          <button className={lang() === "tr" ? "on" : ""} onClick={() => lang() !== "tr" && setLang("tr")}>TR</button>
        </div>
      </div>
      <div className="su-body">
        <div className="tour-eyebrow"><span>00</span>{tt("Hazırlık")}</div>
        <h1>{tt("Luna'yı hazırlayalım")}</h1>
        <p className="su-lead">{tt("Bu bilgisayarda gerekenleri kontrol ettim. Eksik olan varsa yanındaki bağlantı indirme sayfasını tarayıcında açar.")}</p>

        {failed && <div className="su-row missing"><div className="su-ic">!</div><div className="su-txt"><b>{tt("Kontrol yapılamadı")}</b><span>{tt("Luna bu bilgisayarı kontrol edemedi. Videolar açılıyorsa sorun yok; devam edebilirsin.")}</span></div></div>}
        <h3>{tt("Gerekenler")}</h3>
        <Row state={st(c?.mpv)} title={tt("Video motoru (mpv)")}
          text={c?.mpv === false ? tt("Luna ile gelen video motoru çalışmadı. Luna'yı yeniden indirip kurmak bunu düzeltir.") : tt("Luna ile birlikte geliyor; neredeyse her video biçimini oynatır.")}
          action={c?.mpv === false ? { label: tt("Luna'yı indir"), url: "https://github.com/Nothingman333/Luna-Player/releases/latest" } : undefined} />
        <Row state={st(c?.vulkan)} title={tt("Ekran kartı sürücüsü")}
          text={failed ? "" : c?.vulkan === false ? tt("Video oynatmak için güncel bir ekran kartı sürücüsü (Vulkan) gerekiyor. Kurduktan sonra bilgisayarı yeniden başlat.") : c?.gpus.length ? c.gpus.join(" · ") : tt("Kontrol ediliyor…")}
          action={c?.vulkan === false ? { label: tt("{0} sürücüsünü indir", drv.name), url: drv.url } : undefined} />
        <Row state={st(!!c?.webview)} title={tt("Arayüz (WebView2)")} text={c?.webview ? tt("Sürüm {0}", c.webview) : failed ? "" : tt("Kontrol ediliyor…")} />

        <h3>{tt("İsteğe bağlı")}</h3>
        <Row state={st(c?.lossless, true)} title="Lossless Scaling"
          text={c?.lossless ? tt("Kurulu; videoları büyütmek için Upscaler'ı kullanabilirsin.") : tt("Videoları daha net büyütmek için (ücretli, Steam). Gerekli değil.")}
          action={c && !c.lossless ? { label: "Steam", url: "https://store.steampowered.com/app/993090/Lossless_Scaling/" } : undefined} />

        <h3>{tt("Ücretsiz anahtarlar")} <small>{tt("girmesen de oynatıcı çalışır")}</small></h3>
        <div className="su-keys">
          {KEYS.map((k) => (
            <div key={k.id} className={"su-key" + (keys[k.id].trim() ? " set" : "")}>
              <div className="su-txt"><b>{k.name}</b><span>{tt(k.what)}</span></div>
              <input value={keys[k.id]} onChange={(e) => setKey(k.id, e.target.value)} placeholder={tt("Anahtarı buraya yapıştır")} spellCheck={false} />
              <button className="su-act" onClick={() => openUrl(k.url)}>{tt("Ücretsiz al")} <Icon d={I.right} size={14} /></button>
            </div>
          ))}
        </div>
      </div>
      <div className="tour-foot">
        <button className="tour-back" onClick={() => setN((x) => x + 1)} disabled={c == null && !failed}>↻ {tt("Tekrar kontrol et")}</button>
        <div className="tour-count">{blocking ? tt("Eksikler giderilene kadar videolar açılmayabilir") : ""}</div>
        <div className="tour-act">
          <button className="go" onClick={done}>{blocking ? tt("Yine de devam et") : tt("Devam")} <Icon d={I.right} size={18} /></button>
        </div>
      </div>
    </div>
  );
}
