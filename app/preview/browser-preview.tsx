import "@fontsource/sora/500.css";
import "@fontsource/sora/600.css";
import "@fontsource/sora/700.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Browser } from "../src/Browser";
import "../src/App.css";
import "../src/Refinements.css";

/* Dev-only fixture: /browser-preview.html?demo=extensions renders one Web tab with two pinned extensions and keeps
 * the native extension API in memory. The real Windows window is tested by the user; this page only checks layout. */
const PARAMS = new URLSearchParams(location.search);
const DEMO = PARAMS.get("demo") === "extensions";
const DARK = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", UBLOCK = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const icon = (body: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${body}</svg>`)}`;
const DARK_ICON = icon(`<rect width="32" height="32" rx="7" fill="#10252b"/><circle cx="11" cy="15" r="5.4" fill="none" stroke="#f6a15a" stroke-width="2.2"/><circle cx="23" cy="15" r="5.4" fill="none" stroke="#f6a15a" stroke-width="2.2"/><path d="M16.4 14h1.2" stroke="#f6a15a" stroke-width="2.2"/><path d="M10 23h12" stroke="#7eb3c4" stroke-width="2" stroke-linecap="round"/>`);
const UBLOCK_ICON = icon(`<rect width="32" height="32" rx="7" fill="#172033"/><path d="M16 4l9 4v8c0 6-4 10-9 12-5-2-9-6-9-12V8z" fill="#c33" opacity=".9"/><path d="M11 16l3 3 7-7" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`);

function installDemo() {
  const callbacks = new Map<number, (value: unknown) => void>();
  const listeners: { id: number; cb: (event: unknown) => void }[] = [];
  let next = 1, listenId = 1;
  const tabs: Record<number, { url: string }> = {};
  const emit = (id: number, kind: string, value: string) => listeners.forEach(l => l.cb({ event: "luna-browser-event", id: l.id, payload: { id, kind, value } }));
  const visit = (id: number, url: string) => {
    tabs[id] = { url };
    emit(id, "navigate", url); emit(id, "loading", url);
    setTimeout(() => { emit(id, "title", "YouTube"); emit(id, "loaded", url); emit(id, "nav-done", JSON.stringify({ url, ok: true, status: 0, http: 200 })); emit(id, "history", "10"); }, 30);
  };
  const view = window as unknown as Record<string, unknown>;
  view.isTauri = true;
  view.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
  view.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: "main" }, currentWebview: { windowLabel: "main", label: "main" } },
    transformCallback(cb: (value: unknown) => void) { const id = next++; callbacks.set(id, cb); return id; },
    unregisterCallback(id: number) { callbacks.delete(id); },
    convertFileSrc: (p: string) => p,
    async invoke(cmd: string, args: Record<string, unknown> = {}) {
      switch (cmd) {
        case "plugin:event|listen": { const id = listenId++; listeners.push({ id, cb: callbacks.get(args.handler as number)! }); return id; }
        case "plugin:event|unlisten": return null;
        case "browser_create": visit(args.id as number, args.url as string); return null;
        case "browser_action": { const tab = tabs[args.id as number]; if (!tab) throw "Tab closed"; if (args.action === "navigate") visit(args.id as number, args.url as string); return null; }
        case "browser_position": return { url: tabs[args.id as number]?.url ?? "", progress: 0 };
        case "browser_read": return { title: "YouTube", url: tabs[args.id as number]?.url ?? "", lang: "en", truncated: false, text: "A page used only for the browser layout preview." };
        case "browser_extension_manage": {
          if (args.action !== "list") return null;
          return [
            { id: DARK, name: "Dark Reader", enabled: true, icon: DARK_ICON, popup: true, version: "4.9.96", description: "Her web sitesi için karanlık mod. Gece göz yorgunluğuna dikkat edin.", worker: true },
            { id: UBLOCK, name: "uBlock Origin Lite", enabled: false, icon: UBLOCK_ICON, popup: true, version: "2026.1021", description: "İzin gerektirmeyen içerik engelleyici.", worker: true },
          ];
        }
        case "browser_extension_details": return { id: args.id, name: args.id === DARK ? "Dark Reader" : "uBlock Origin Lite", enabled: true, icon: args.id === DARK ? DARK_ICON : UBLOCK_ICON, version: "4.9.96", versionName: "", description: "Her web sitesi için karanlık mod.", manifestVersion: 3, permissions: ["storage", "tabs", "contextMenus", "alarms"], hosts: ["<all_urls>"], optional: [], sites: ["<all_urls>"], commands: [{ name: "toggle", description: "Aç/kapat", key: "Alt+Shift+D" }, { name: "addSite", description: "Bu siteyi listeye ekle", key: "" }], homepage: "https://darkreader.org/", author: "", minimumChrome: "106", incognito: "", worker: "background/index.js", options: true, popup: true, source: "store", storeUrl: "https://chromewebstore.google.com/detail/x", path: "C:\Users\demo\AppData\Local\com.modernplayer.app\web-extension-packages\abc", bytes: 1834221 };
        case "browser_extension_popup": view.__popupAnchor = args.anchor; return null;
        default: return null;
      }
    },
  };
  localStorage.setItem("lang", "tr");
  localStorage.setItem("lunaWebPinnedExtensions", JSON.stringify([DARK, UBLOCK]));
  if (PARAMS.get("layout") === "classic") localStorage.setItem("webCompact", "0");
  else localStorage.removeItem("webCompact");
}

if (DEMO) installDemo();

function Preview() {
  const [active, setActive] = useState(true);
  useEffect(() => {
    if (!DEMO) return;
    const timer = window.setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>(".browser-start-search input");
      const form = input?.closest("form");
      if (!input || !form) return;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "https://www.youtube.com/watch?v=abc123xyz&list=PL1234567890");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      window.setTimeout(() => form.requestSubmit(), 80);
      if (PARAMS.get("panel") === "1") window.setTimeout(() => document.querySelector<HTMLButtonElement>(".browser-extension-toolbar > button:last-child")?.click(), 700);
    }, 350);
    return () => window.clearTimeout(timer);
  }, []);
  return <main className="root" style={{ "--acc-rgb": "232,112,26" } as React.CSSProperties}>
    <header className="app-header" style={{ height: 76, padding: "0 24px" }}><b style={{ fontSize: 24, letterSpacing: -1 }}>luna<span style={{ color: "var(--accent)" }}>.</span></b><nav className="mode-switch"><button className="mode-btn">Film</button><button className="mode-btn">Müzik</button><button className="mode-btn">Kitap</button><button className="mode-btn on" onClick={() => setActive(true)}>◎ Web</button></nav><span className="grow"/><small className="muted">Luna Web · Tasarım önizlemesi</small></header>
    <Browser active={active} onClose={() => setActive(false)} onPage={page => { (window as unknown as { __page?: unknown }).__page = page; }} onInvalidate={() => {}} onPlay={url => { (window as unknown as { __played?: string }).__played = url; }}/>
    {!active && <div className="page"><h2>Luna Web</h2><p>Önizlemeye dönmek için üstteki Web düğmesine tıkla.</p></div>}
  </main>;
}
createRoot(document.getElementById("root")!).render(<React.StrictMode><Preview/></React.StrictMode>);
