import { appStorage as localStorage } from "./appStorage";
import { flushDatabaseStorage, storageVersion } from "./databaseStorage";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {startupPhase,startupFailure,startupReady} from "./startupStatus";
import {installDebugTelemetry,debugSecrets} from "./debugTelemetry";
import { createSnapshotWriter } from "./snapshotWriter";
import { applyAccessibility } from "./Extras";
import React from "react";
import { installMenuPlate } from "./menuPlate";
import { installExitGhosts } from "./exitGhosts";
import { installRubberBand, installScrollCalm } from "./rubberBand";
import ReactDOM from "react-dom/client";
// Fonts ship with the app: no network wait, no flash of fallback text, works offline.
import "@fontsource/sora/500.css";
import "@fontsource/sora/600.css";
import "@fontsource/sora/700.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import App from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import { loadedLang } from "./i18n";
import { SubsOverlay } from "./Upscaler";
import { invoke } from "./nativeCore";
import { loadSecrets, SECRET_KEYS, store } from "./library";
import { storageRestoreInProgress } from "./safety";

// Every image fades in once it has loaded; one that fails to load is hidden instead of
// showing the browser's broken-image icon.
document.addEventListener("load", (e) => {
  const t = e.target as HTMLElement;
  if (t instanceof HTMLImageElement) t.classList.add("loaded");
}, true);
document.addEventListener("error", (e) => {
  const t = e.target as HTMLElement;
  if (t instanceof HTMLImageElement) t.classList.add("broken");
}, true);

// Esc closes the window on top, as a click beside it does (every window closes that way). Registered
// first and in the capture phase, so the page under it (the player, a reader) doesn't take the Esc too.
window.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || e.defaultPrevented) return;
  const bgs = document.querySelectorAll<HTMLElement>(".modal-bg");
  const top = Array.from(bgs).reverse().find(bg=>bg.getClientRects().length&&getComputedStyle(bg).visibility!=="hidden"&&!bg.inert);
  if (!top) return;
  // An analysis menu handles its own Escape and restores focus; keep its preview open.
  const analysisMenu = top.querySelector<HTMLElement>(".la-opts");
  if (analysisMenu?.getClientRects().length) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  top.click();
}, true);

const isSubs = new URLSearchParams(location.search).has("subs");
if(!isSubs){debugSecrets(()=>SECRET_KEYS.map(key=>store.get(key)||""));installDebugTelemetry();}

// ---------- durable state ----------
// WebView2 keeps localStorage in a database it may throw away after a crash. Luna mirrors it to
// luna-state.json and restores from there when the webview's copy is gone.
const saveSnapshot = createSnapshotWriter(json => invoke<void>("state_save", { json }));
// The copy is the whole of localStorage (7 MB here) read and turned into one string on the page's thread: done every
// 20 s it froze Keşfet's rows for 100–500 ms mid-drag. It now runs only after a change, and when the page is idle.
let snappedAt = -1;
const snapshotNow = () => {
  if (storageRestoreInProgress()) return;
  snappedAt = storageVersion;
  try {
    const o: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i)!; if (!SECRET_KEYS.includes(k)) o[k] = localStorage.getItem(k) ?? ""; }
    if (Object.keys(o).length > 2) void saveSnapshot(o).catch(() => {});
  } catch {}
};
const snapshot = (now = false) => {
  if (!now && snappedAt === storageVersion) return;
  if (now || typeof requestIdleCallback !== "function") return snapshotNow();
  requestIdleCallback(() => { if (snappedAt !== storageVersion) snapshotNow(); }, { timeout: 15000 });
};

(async () => {
  if (!isSubs) {
    // the API keys from Windows (an old plain copy, also one the state file just brought back, moves there)
    startupPhase("secrets_load · Anahtarlar / Credentials");
    await loadSecrets();
    startupPhase("preferences · Görünüm ayarları / Display preferences");
    applyAccessibility();
    // a restored backup can carry another language than the one the texts were loaded in
    if (localStorage.getItem("lang") === "tr" ? loadedLang !== "tr" : loadedLang !== "en") { location.reload(); return; }
    invoke("set_lang", { lang: localStorage.getItem("lang") === "tr" ? "tr" : "en" }).catch(() => {});
    try { localStorage.setItem("lunaMark", "1"); } catch {}
    await flushDatabaseStorage();
    let closing = false;
    void getCurrentWindow().onCloseRequested(async event => {
      if(closing)return;
      event.preventDefault();
      try { await flushDatabaseStorage(); closing=true;await getCurrentWindow().close(); }
      catch { startupFailure(new Error("Kayıtlar diske yazılamadı. Pencere açık tutuldu; boş alanı kontrol edip yeniden kapatın.")); }
    });
    setInterval(snapshot, 20000);
    window.addEventListener("beforeunload", () => snapshot(true));
    document.addEventListener("visibilitychange", () => { snapshot(document.visibilityState === "hidden");void flushDatabaseStorage().catch(()=>{}); });
    setTimeout(snapshot, 5000);
  }
  startupPhase("react_render · Arayüz / Interface");
  installMenuPlate();
  installExitGhosts();
  installRubberBand();
  installScrollCalm();
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      {isSubs ? <SubsOverlay /> : <ErrorBoundary><App /></ErrorBoundary>}
      <StartupComplete/>
    </React.StrictMode>,
  );
})().catch(error=>{startupFailure(error);console.error("Luna startup failed",error);});

function StartupComplete(){React.useEffect(()=>{startupReady();},[]);return null;}
