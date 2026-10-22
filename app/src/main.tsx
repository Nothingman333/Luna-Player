import {installDebugTelemetry,debugSecrets} from "./debugTelemetry";
import { durableState } from "./safety";
import { applyAccessibility } from "./Extras";
import React from "react";
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
import { invoke } from "@tauri-apps/api/core";
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
  e.preventDefault();
  e.stopImmediatePropagation();
  top.click();
}, true);

const isSubs = new URLSearchParams(location.search).has("subs");
if(!isSubs){debugSecrets(()=>SECRET_KEYS.map(key=>store.get(key)||""));installDebugTelemetry();}

// ---------- durable state ----------
// WebView2 keeps localStorage in a database it may throw away after a crash. Luna mirrors it to
// luna-state.json and restores from there when the webview's copy is gone.
const snapshot = () => {
  if (storageRestoreInProgress()) return;
  try {
    const o: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i)!; if (!SECRET_KEYS.includes(k)) o[k] = localStorage.getItem(k) ?? ""; }
    if (Object.keys(o).length > 2) invoke("state_save", { json: JSON.stringify(o) }).catch(() => {});
  } catch {}
};
async function restore() {
  try {
    const raw = await invoke<string | null>("state_load");
    if (!raw) return;
    const o = durableState(JSON.parse(raw));
    const seed = o.__seed === "1", force = o.__seed === "force";
    const empty = !localStorage.getItem("lunaMark");
    for (const [k, v] of Object.entries(o)) {
      if (k === "__seed") continue;
      if (empty || force || (seed && localStorage.getItem(k) == null)) localStorage.setItem(k, v);
    }
  } catch {}
}

(async () => {
  if (!isSubs) {
    await restore();
    // the API keys from Windows (an old plain copy, also one the state file just brought back, moves there)
    await loadSecrets();
    applyAccessibility();
    // a restored backup can carry another language than the one the texts were loaded in
    if (localStorage.getItem("lang") === "tr" ? loadedLang !== "tr" : loadedLang !== "en") { location.reload(); return; }
    invoke("set_lang", { lang: localStorage.getItem("lang") === "tr" ? "tr" : "en" }).catch(() => {});
    try { localStorage.setItem("lunaMark", "1"); } catch {}
    setInterval(snapshot, 20000);
    window.addEventListener("beforeunload", snapshot);
    document.addEventListener("visibilitychange", snapshot);
    setTimeout(snapshot, 5000);
  }
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      {isSubs ? <SubsOverlay /> : <ErrorBoundary><App /></ErrorBoundary>}
    </React.StrictMode>,
  );
})();
