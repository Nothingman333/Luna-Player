import {copyAssistantText} from "./AssistantTools";
import {moveWebTab,cleanWebTabs,upsertWebBookmark} from "./browserWorkspaceModel";
import { BrowserWorkspace } from "./BrowserWorkspace";
import type { SavedWebTab } from "./browserWorkspaceModel";
import { localList, validReading } from "./extrasModel";
import { BrowserExtras, rememberReadingPosition } from "./BrowserExtras";
import { dropNative, freshNative, navFailure, nextZoom, parseAudio, parseHistory, parseNavDone, parseZoom, patchNative, permissionNotice } from "./browserNativeModel";
import type { TabNative } from "./browserNativeModel";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { lang } from "./i18n";
import { BrowserIcon as WebIcon } from "./BrowserIcons";
import { useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { browserAddress, cleanBrowserPage, friendlyBrowserError } from "./browserModel";
import type { BrowserPage, WebTab } from "./browserModel";
import { registerBrowserReader, registerBrowserTranslator, TRANSLATION_LANGUAGES, translateRows, translationBatches } from "./browserTranslation";
import type { TranslationRow, TranslationSummary } from "./browserTranslation";
import { aiReady } from "./ai";
import "./Browser.css";

type WebEvent = { id: number; kind: string; value: string };
type Bookmark = { title: string; url: string };
const HOME = "https://www.google.com/";
const label = (tr: string, en: string) => lang() === "tr" ? tr : en;
/** One line into luna-debug.log (Luna's data folder): the page layer, menus, downloads and errors. */
const dlog = (...parts: unknown[]) => { if (isTauri()) void native("debug_log", { lines: [parts.map(p => typeof p === "string" ? p : JSON.stringify(p)).join(" ")] }).catch(() => {}); };
type WebDownload = { url: string; path: string; name: string; state: "running" | "done" | "failed" };
const fileName = (p: string) => p.split(/[\\/]/).pop() || p;
const SHORTCUTS = [
  { name: "YouTube", url: "https://www.youtube.com/", style: "youtube", mark: "play", tr: "İzle & dinle", en: "Watch & listen" },
  { name: "Letterboxd", url: "https://letterboxd.com/", style: "letterboxd", mark: "dots", tr: "Film dünyana göz at", en: "Your world of film" },
  { name: "TMDB", url: "https://www.themoviedb.org/", style: "tmdb", mark: "tm", tr: "Sıradaki filmini keşfet", en: "Find your next film" },
  { name: "Wikipedia", url: "https://www.wikipedia.org/", style: "wikipedia", mark: "W", tr: "Merakının peşinden git", en: "Follow your curiosity" },
];
// One native mutation at a time, including cleanup after React StrictMode's effect replay.
let operations = Promise.resolve();
function native<T>(command: string, args: Record<string, unknown>, allowed:()=>boolean=()=>true): Promise<T> {
  const job = operations.then(() => {if(!allowed())throw Error("Operation canceled before execution");return invoke<T>(command, args);});
  operations = job.then(() => {}, () => {});
  return job;
}
export type ActiveWebTab = { title: string; url: string; loading: boolean };
const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };
export function Browser({ active, onClose, onPage, onInvalidate, onAssistant, onActiveTab }: {
  onAssistant?: () => void; active: boolean; onClose: () => void; onPage: (page: BrowserPage) => void; onInvalidate: () => void;
  onActiveTab?: (tab: ActiveWebTab | null) => void;
}) {
  const [tabs, setTabs] = useState<WebTab[]>([]), [selected, setSelected] = useState<number | null>(null);
  const [address, setAddress] = useState(""), [error, setError] = useState("");
  const [creating, setCreating] = useState(false), [reading, setReading] = useState(false);
  const [needsRoom, setNeedsRoom] = useState(false);
  const [tabNative, setTabNative] = useState<Record<number, TabNative>>({});
  // Tabs whose load the user stopped: that cancelled navigation is not an error.
  const stopping = useRef(new Set<number>()), composing = useRef(false);
  const [targetLanguage, setTargetLanguage] = useState(()=>{try{const saved=localStorage.getItem("lunaWebTranslationLanguage");if(saved&&TRANSLATION_LANGUAGES.includes(saved))return saved;}catch{}return lang()==="tr"?"Türkçe":"English";}), [translating, setTranslating] = useState(false);
  const [translationNote, setTranslationNote] = useState("");
  const retryTranslation = useRef<{id:number;revision:number;target:string;token:string;truncated:boolean;batches:TranslationRow[][];rows:TranslationRow[];next:number}|null>(null);
  const [canRetry,setCanRetry] = useState(false);
  const cancelTranslation = useRef(false);
  const pendingScroll = useRef<{id:number|null;url:string;progress:number}|null>(null);
  const translationBusy = useRef(false), shown = useRef(active); shown.current = active;
  const [toolsOpen, setToolsOpen] = useState(false);
  const [downloads, setDownloads] = useState<WebDownload[]>([]);
  const [extensions, setExtensions] = useState<{ dir: string; items: { name: string; version: string; folder: string }[] } | null>(null);
  useEffect(() => { dlog("tools", toolsOpen ? "open" : "closed"); if (toolsOpen && isTauri()) void native<any>("browser_extensions", { action: "list" }).then(setExtensions).catch(e => dlog("extensions error", String(e))); }, [toolsOpen]);
  useEffect(() => {
    const err = (e: ErrorEvent) => dlog("window error", e.message, e.filename, e.lineno);
    const rej = (e: PromiseRejectionEvent) => dlog("unhandled", String(e.reason?.message ?? e.reason));
    window.addEventListener("error", err); window.addEventListener("unhandledrejection", rej);
    return () => { window.removeEventListener("error", err); window.removeEventListener("unhandledrejection", rej); };
  }, []);
  const [browserNotice,setBrowserNotice]=useState("");
  useEffect(()=>{if(!browserNotice)return;const id=setTimeout(()=>setBrowserNotice(""),4000);return()=>clearTimeout(id);},[browserNotice]);
  const [workspaceOpen,setWorkspaceOpen]=useState(false),[closedTabs,setClosedTabs]=useState<SavedWebTab[]>([]);
  const closingTabs=useRef(new Set<number>()),reopening=useRef(false);
  const [shortcutForm, setShortcutForm] = useState(false), [shortcutTitle, setShortcutTitle] = useState(""), [shortcutUrl, setShortcutUrl] = useState("");
  const [popup, setPopup] = useState<{ id: number; url: string } | null>(null);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(() => {
    try { const raw: unknown = JSON.parse(localStorage.getItem("lunaWebBookmarks") || "[]");
      return cleanWebTabs(raw,40);
    } catch { return []; }
  });
  const slot = useRef<HTMLDivElement>(null), addressInput = useRef<HTMLInputElement>(null), tabStrip = useRef<HTMLDivElement>(null);
  const alive = useRef(true), known = useRef(new Set<number>()), chosen = useRef(selected), revisions = useRef(new Map<number, number>());
  const assistantRef = useRef(onAssistant); assistantRef.current = onAssistant;
  const invalidator = useRef(onInvalidate); invalidator.current = onInvalidate; chosen.current = selected;
  const activeTabRef = useRef(onActiveTab); activeTabRef.current = onActiveTab;
  // Last URL each tab really finished loading; a blocked download must not leave its address behind.
  const committed = useRef(new Map<number, string>()), syncing = useRef(new Set<number>());
  const tabsRef = useRef(tabs); tabsRef.current = tabs;
  const creatingRef = useRef(false), addressDirty = useRef(false), lastSelected = useRef(selected);
  const current = tabs.find(t => t.id === selected);
  const nowNative: TabNative = (current && tabNative[current.id]) || freshNative();
  useEffect(() => {
    // A redirect or in-page URL change must not wipe what the user is typing; switching tabs always resets it.
    const switched = lastSelected.current !== selected; lastSelected.current = selected;
    if (switched || !addressDirty.current) { addressDirty.current = false; setAddress(current?.url || ""); }
    setBrowserNotice(""); setPopup(null); setToolsOpen(false); setTranslationNote(""); setCanRetry(false); retryTranslation.current=null; cancelTranslation.current=true; invalidator.current();
  }, [selected, current?.url]);
  // The tab in use is always brought into view (a long strip scrolls inside itself, e.g. at 480 px).
  useEffect(() => {
    if (!active) return;
    let id = 0;
    const reveal = () => { cancelAnimationFrame(id); id = requestAnimationFrame(() => tabStrip.current?.querySelector<HTMLElement>(".on")?.scrollIntoView({ inline: "nearest", block: "nearest" })); };
    reveal(); window.addEventListener("resize", reveal); // narrowing the window must not hide the tab in use
    return () => { cancelAnimationFrame(id); window.removeEventListener("resize", reveal); };
  }, [active, selected, tabs.length]);
  useEffect(() => { activeTabRef.current?.(active && current ? { title: current.title, url: current.url, loading: current.loading } : null); }, [active, current?.id, current?.title, current?.url, current?.loading]);
  useEffect(() => () => activeTabRef.current?.(null), []);
  /** Stop keeps the page that was showing: the address goes back to it, and the cancelled load is not reported as an error. */
  function stopLoading() {
    if (selected === null) return;
    const id = selected, shown = committed.current.get(id);
    stopping.current.add(id);
    setTabs(ts => ts.map(t => t.id !== id ? t : { ...t, loading: false, url: shown ?? t.url }));
    void native("browser_action", { id, action: "stop" }).catch(showError);
  }
  /** Native page zoom (WebView2 ZoomFactor): the engine scales the page; the UI does not fake it with CSS. */
  function setPageZoom(factor: number) {
    if (selected === null) return;
    const id = selected;
    void native("browser_action", { id, action: "zoom", zoom: factor })
      .then(() => { if (alive.current && known.current.has(id)) setTabNative(m => patchNative(m, id, { zoom: factor })); })
      .catch(showError);
  }
  function zoomBy(direction: 1 | -1) {
    if (selected === null) return;
    setPageZoom(nextZoom(tabNative[selected]?.zoom ?? 1, direction));
  }
  function chooseTab(id:number|null){setError("");setBrowserNotice("");setSelected(id);}
  function showError(e: unknown) { if (alive.current) setError(friendlyBrowserError(e, lang() === "tr")); }
  async function add(raw = HOME):Promise<boolean> {
    if (creatingRef.current) return false; // a second click while the first tab is still opening
    if (known.current.size >= 8) { setError(label("En fazla 8 sekme açabilirsin.", "You can open up to 8 tabs.")); return false; }
    let url: string; try { url = browserAddress(raw); } catch (e) { showError(e); return false; }
    const id = crypto.getRandomValues(new Uint32Array(1))[0];
    const previous = chosen.current;
    if(pendingScroll.current?.id===null&&pendingScroll.current.url===url)pendingScroll.current.id=id;
    known.current.add(id); creatingRef.current = true; setCreating(true); setError(""); addressDirty.current = false;
    setTabs(ts => [...ts, { id, title: new URL(url).hostname, url, loading: true }]);
    setSelected(id);
    try {
      if (!isTauri()) throw new Error("Bu önizleme yalnız arayüzü gösterir. Siteleri açmak için Luna Web Yerel.cmd ile masaüstü sürümünü başlat.");
      await native("browser_create", { id, url });
      return alive.current;
    } catch (e) {
      known.current.delete(id);if(pendingScroll.current?.id===id)pendingScroll.current=null;
      if (alive.current) { setTabs(ts => ts.filter(t => t.id !== id)); setSelected(current => current === id ? (previous !== null && known.current.has(previous) ? previous : null) : current); }
      showError(e);return false;
    }
    finally { creatingRef.current = false; if (alive.current) setCreating(false); }
  }
  async function closeTab(id: number) {
    if(closingTabs.current.has(id)||!known.current.has(id))return;
    closingTabs.current.add(id);
    const tab=tabsRef.current.find(t=>t.id===id);
    try {
      await native("browser_action", { id, action: "close" });
      known.current.delete(id); revisions.current.delete(id); committed.current.delete(id);if(pendingScroll.current?.id===id)pendingScroll.current=null;
      setTabNative(m => dropNative(m, id)); stopping.current.delete(id);
      // Like other browsers: the neighbour on the right takes over, else the one on the left.
      const list = tabsRef.current, at = list.findIndex(t => t.id === id), left = list.filter(t => t.id !== id);
      setTabs(ts => ts.filter(t => t.id !== id));
      if (chosen.current === id) {setSelected((left[at] ?? left[at - 1])?.id ?? null);invalidator.current();}
      if(tab&&alive.current)setClosedTabs(rows=>[{title:tab.title,url:tab.url},...rows].slice(0,12));
    } catch (e) { showError(e); }finally{closingTabs.current.delete(id);}
  }
  async function reopenClosed(index=0){if(reopening.current||!closedTabs[index])return;reopening.current=true;const tab=closedTabs[index];try{if(await add(tab.url))setClosedTabs(rows=>{const at=rows.indexOf(tab);return at<0?rows:rows.filter((_,i)=>i!==at);});}finally{reopening.current=false;}}
  async function action(action: string, raw?: string) {
    if (selected === null) { if (raw) await add(raw); return; }
    if (action === "navigate" || action === "reload") stopping.current.delete(selected);
    const id = selected;
    try {
      const url = raw === undefined ? undefined : browserAddress(raw);
      if(pendingScroll.current?.id===id&&(action!=="navigate"||pendingScroll.current.url!==url))pendingScroll.current=null;
      invalidator.current(); revisions.current.set(id, (revisions.current.get(id) || 0) + 1);
      await native("browser_action", { id, action, url });
      if (chosen.current === id) setError("");
    } catch (e) { if(pendingScroll.current?.id===id)pendingScroll.current=null;if (chosen.current === id) showError(e); } // an old tab's answer stays with that tab
  }
  /** In-page (history API) navigation fires no load event: ask the native view for its real address. */
  async function syncUrl(id: number) {
    if (syncing.current.has(id) || !isTauri()) return;
    syncing.current.add(id);
    try {
      const { url } = await native<{ url: string }>("browser_position", { id, action: "url", expectedUrl: "" });
      const tab = tabsRef.current.find(t => t.id === id);
      if (!alive.current || !known.current.has(id) || !tab || tab.loading || tab.url === url) return;
      browserAddress(url); // only plain web addresses reach the UI
      revisions.current.set(id, (revisions.current.get(id) || 0) + 1); committed.current.set(id, url);
      if (chosen.current === id) invalidator.current();
      setTabs(ts => ts.map(t => t.id === id && !t.loading ? { ...t, url } : t));
    } catch { /* older native builds or a closed tab: keep the last known address */ }
    finally { syncing.current.delete(id); }
  }
  const syncRef = useRef(syncUrl); syncRef.current = syncUrl;
  const transcripts = useRef(new Map<string, string>()).current;
  async function capturePage(): Promise<BrowserPage> {
    if (chosen.current === null || !shown.current) throw new Error("Önce bir web sayfası aç.");
    const id = chosen.current, revision = revisions.current.get(id) || 0;
    const page = await native<Omit<BrowserPage, "capturedAt">>("browser_read", { id });
    if (!alive.current || !shown.current || chosen.current !== id || revision !== (revisions.current.get(id) || 0)) throw new Error("Sayfa değişti; yeniden oku.");
    const clean = cleanBrowserPage(page, !!tabsRef.current.find(t => t.id === id)?.loading);
    // A YouTube video: what is said in it (its subtitles, fetched once per video) instead of only the page around it.
    if (/^https:\/\/(www\.|m\.)?youtube\.com\/(watch|shorts\/)|^https:\/\/youtu\.be\//.test(clean.url)) {
      let said = transcripts.get(clean.url);
      if (said === undefined) {
        said = await native<string>("yt_transcript", { url: clean.url }).catch(() => "");
        transcripts.set(clean.url, said);
      }
      if (said) return { ...clean, text: label("Videonun altyazısı (konuşulanlar):\n", "The video's subtitles (what is said):\n") + said.slice(0, 40000) + "\n\n" + label("Sayfa metni:\n", "Page text:\n") + clean.text.slice(0, 4000), truncated: said.length > 40000 || clean.truncated, capturedAt: Date.now() };
    }
    return { ...clean, capturedAt: Date.now() };
  }
  const readerRef = useRef(capturePage); readerRef.current = capturePage;
  useEffect(() => {
    registerBrowserReader(active && selected !== null ? () => readerRef.current() : null);
    return () => registerBrowserReader(null);
  }, [active, selected]);
  async function readPage() {
    if (selected === null || reading) return;
    setReading(true); setError("");
    const id=selected;
    try { onPage(await capturePage());
    } catch (e) { if(chosen.current===id)showError(e); } finally { if (alive.current) setReading(false); }
  }
  async function translatePage(target: string): Promise<TranslationSummary> {
    if (translationBusy.current) throw new Error(label("Bir çeviri zaten sürüyor.","A translation is already running."));
    if (selected === null || !shown.current) throw new Error(label("Önce Web bölümünde bir sayfa aç.","Open a page in Web first."));
    if (target !== "restore" && !aiReady()) throw new Error(label("Çeviri için Ayarlar › Hesaplar ve anahtarlar bölümünde bir API profili seç.","Choose an API profile in Settings › Accounts and keys to translate."));
    const id = selected, revision = revisions.current.get(id) || 0;
    const stillHere = () => alive.current && shown.current && chosen.current === id && revision === (revisions.current.get(id) || 0);
    translationBusy.current = true; cancelTranslation.current=false; setCanRetry(false); setTranslating(true); setError(""); setTranslationNote("");
    try {
      if (target === "restore") {
        retryTranslation.current=null;setCanRetry(false);
        const result = await native<{ restored: number }>("browser_translation", { id, action: "restore" });
        if (!stillHere()) throw new Error(label("Sayfa değişti.","The page changed."));
        invalidator.current();
        setTranslationNote(label(`${result.restored} metin alanı özgün diline döndürüldü.`,`${result.restored} text areas restored to the original.`));
        return { applied: result.restored, skipped: 0 };
      }
      let work=retryTranslation.current;
      if(!work || work.id!==id || work.revision!==revision || work.target!==target){
        const snapshot=await native<{token:string;truncated:boolean;rows:TranslationRow[]}>("browser_translation",{id,action:"snapshot"});
        if(!stillHere()||cancelTranslation.current)throw new Error(label("Çeviri iptal edildi.","Translation canceled."));
        if(!snapshot.rows.length)throw new Error(label("Çevrilebilir sayfa metni bulunamadı. Video ve dış çerçeveler çevrilemez.","No translatable page text found. Video and external frames cannot be translated."));
        work={id,revision,target,token:snapshot.token,truncated:snapshot.truncated,batches:translationBatches(snapshot.rows),rows:[],next:0};retryTranslation.current=work;
      }
      for(let i=work.next;i<work.batches.length;i++){
        if(!stillHere())throw new Error(label("Sayfa veya sekme değişti; çeviri iptal edildi.","The page or tab changed; translation canceled."));
        if(cancelTranslation.current)throw new Error(label("Çeviri durduruldu; tamamlanan bölümler yeniden istenmeyecek.","Translation stopped; finished sections will not be requested again."));
        setTranslationNote(label(`Sayfa ${target} diline çevriliyor · ${i+1}/${work.batches.length}`,`Translating the page into ${target} · ${i+1}/${work.batches.length}`));
        const translated=await translateRows(work.batches[i],target);
        if(!stillHere() || cancelTranslation.current)throw new Error(label("Çeviri durduruldu; eski yanıt uygulanmadı.","Translation stopped; the late reply was not applied."));
        work.rows.push(...translated);work.next=i+1;
      }
      if(!stillHere()||cancelTranslation.current)throw new Error(label("Çeviri iptal edildi.","Translation canceled."));
      let result:TranslationSummary;
      // The snapshot token is single-use: if the page rejects it (changed address/document), the
      // stored row ids cannot be reused, so do not offer a retry that would fail the same way.
      try{result=await native<TranslationSummary>("browser_translation",{id,action:"apply",payload:{token:work.token,translations:work.rows}},()=>stillHere()&&!cancelTranslation.current);}
      catch(error){retryTranslation.current=null;throw error;}
      if(!stillHere())throw new Error(label("Sayfa değişti.","The page changed."));
      const snapshot={truncated:work.truncated};retryTranslation.current=null;
      invalidator.current();
      setTranslationNote(label(`${result.applied} metin alanı ${target} diline çevrildi.${result.skipped ? ` ${result.skipped} değişen alan atlandı.` : ""}${snapshot.truncated ? " Uzun sayfanın bir bölümü çevrildi." : ""}`,`${result.applied} text areas translated into ${target}.${result.skipped ? ` ${result.skipped} changed areas skipped.` : ""}${snapshot.truncated ? " Only part of the long page was translated." : ""}`));
      return { ...result, truncated: snapshot.truncated };
    } catch (e) { const here=stillHere(); if(here && retryTranslation.current){setCanRetry(true);setTranslationNote(label("Çeviri tamamlanmadı. Başarılı bölümler korunuyor; yeniden deneyebilirsin.","Translation did not finish. Completed sections are kept; you can retry."));} else if(here||chosen.current===id) {retryTranslation.current=null;setCanRetry(false);setTranslationNote("");} if(here) showError(e); throw e; }
    finally { translationBusy.current = false; if (alive.current) setTranslating(false); }
  }
  const translateRef = useRef(translatePage); translateRef.current = translatePage;
  useEffect(() => {
    registerBrowserTranslator(active && selected !== null ? target => translateRef.current(target) : null);
    return () => registerBrowserTranslator(null);
  }, [active, selected]);
  function saveShortcut() {
    try {
      const url = browserAddress(shortcutUrl);
      const title = shortcutTitle.trim().slice(0, 80) || new URL(url).hostname;
      const next = upsertWebBookmark(bookmarks,{title,url});
      localStorage.setItem("lunaWebBookmarks", JSON.stringify(next)); setBookmarks(next);
      setShortcutForm(false); setShortcutTitle(""); setShortcutUrl(""); setError("");
    } catch (e) { showError(e); }
  }
  function bookmark() {
    if (!current) return;
    try {
      const next = bookmarks.some(b => b.url === current.url) ? bookmarks.filter(b => b.url !== current.url) : upsertWebBookmark(bookmarks,current);
      localStorage.setItem("lunaWebBookmarks", JSON.stringify(next)); setBookmarks(next);
      setBrowserNotice(label(next.length<bookmarks.length?"Favori kaldırıldı.":"Favori kaydedildi.",next.length<bookmarks.length?"Favourite removed.":"Favourite saved."));
    } catch(e) { showError(e); }
  }
  useEffect(()=>{
    if(!toolsOpen)return;
    const outside=(e:PointerEvent)=>{if(!(e.target as Element)?.closest?.('.browser-tools-anchor,[role="dialog"]'))setToolsOpen(false);};
    document.addEventListener("pointerdown",outside);return()=>document.removeEventListener("pointerdown",outside);
  },[toolsOpen]);

  useEffect(() => {
    alive.current = true;
    let dispose: (() => void) | undefined, cancelled = false;
    if (isTauri()) listen<WebEvent>("luna-browser-event", ({ payload: e }) => {
      if (e.kind === "assistant") { void getCurrentWebview().setFocus().then(() => assistantRef.current?.(), () => assistantRef.current?.()); return; }
      if (!known.current.has(e.id)) return;
      if (e.kind === "loaded") committed.current.set(e.id, e.value);
      if (e.kind === "navigate" || e.kind === "loading") {
        revisions.current.set(e.id, (revisions.current.get(e.id) || 0) + 1);
        if (chosen.current === e.id) invalidator.current();
        if (chosen.current === e.id) setTranslationNote("");
      }
      if(e.kind === "loaded" && pendingScroll.current?.url === e.value && pendingScroll.current.id===e.id){const pending=pendingScroll.current;pendingScroll.current=null;void native("browser_position",{id:e.id,action:"scroll",expectedUrl:e.value,fraction:pending.progress}).catch(showError);}
      if(e.kind==="loaded" && pendingScroll.current?.id===e.id && pendingScroll.current.url!==e.value)pendingScroll.current=null;
      if (e.kind === "popup") { if (chosen.current === e.id) setPopup({ id: e.id, url: e.value }); return; }
      if (e.kind !== "title" && e.kind !== "history") dlog("event", e.id, e.kind, e.value.slice(0, 300));
      if (e.kind === "download-start" || e.kind === "download-done") {
        let v: any = {}; try { v = JSON.parse(e.value); } catch { /* ignore */ }
        const back = committed.current.get(e.id);
        setTabs(ts => ts.map(t => t.id !== e.id ? t : { ...t, url: back ?? t.url, loading: false }));
        if (e.kind === "download-start") {
          setDownloads(d => [{ url: v.url, path: v.path, name: fileName(v.path || v.url), state: "running" as const }, ...d.filter(x => x.path !== v.path)].slice(0, 30));
          setBrowserNotice(label("İndiriliyor: ", "Downloading: ") + fileName(v.path || v.url));
        } else {
          setDownloads(d => d.map(x => x.url === v.url && x.state === "running" ? { ...x, path: v.path || x.path, name: fileName(v.path || x.path), state: v.success ? "done" : "failed" } : x));
          setBrowserNotice(v.success ? label("İndirildi: ", "Downloaded: ") + fileName(v.path || v.url) : label("İndirme başarısız oldu.", "The download failed."));
        }
        return;
      }
      if (e.kind === "download-blocked") {
        // The download link was announced as a navigation, but the page itself never changed.
        const back = committed.current.get(e.id);
        setTabs(ts => ts.map(t => t.id !== e.id ? t : { ...t, url: back ?? t.url, loading: false }));
        if (chosen.current === e.id) showError(label("Web bölümünde dosya indirme kapalı. İndirmek için sayfayı dış tarayıcıda açabilirsin.", "Downloads are off in Luna Web. Open the page in your browser to download."));
        return;
      }
      if (e.kind === "blocked") { if (chosen.current === e.id) showError(label("Bu bağlantı güvenli bir web sayfası değil; açılmadı.", "This link is not a regular web page, so it was not opened.")); return; }
      if (e.kind === "history") { const h = parseHistory(e.value); if (h) setTabNative(m => patchNative(m, e.id, h)); return; }
      if (e.kind === "audio") { const audio = parseAudio(e.value); if (audio !== null) setTabNative(m => patchNative(m, e.id, { audio })); return; }
      if (e.kind === "zoom") { const zoom = parseZoom(e.value); if (zoom !== null) setTabNative(m => patchNative(m, e.id, { zoom })); return; }
      if (e.kind === "permission") { if (chosen.current === e.id) setBrowserNotice(permissionNotice(e.value, lang() === "tr")); return; }
      if (e.kind === "nav-done") {
        // A late answer of an older navigation carries another address: it must not touch the page in use.
        const done = parseNavDone(e.value), tab = tabsRef.current.find(t => t.id === e.id);
        if (!done || !tab || tab.url !== done.url) return;
        const wasStopped = stopping.current.delete(e.id);
        setTabs(ts => ts.map(t => t.id === e.id ? { ...t, loading: false } : t));
        const failure = navFailure(done, lang() === "tr", wasStopped);
        if (failure && chosen.current === e.id) showError(failure);
        return;
      }
      // Newer native signals (nav-done, history, audio, zoom, permission) are not address changes.
      if (e.kind !== "title" && e.kind !== "loaded" && e.kind !== "loading" && e.kind !== "navigate") return;
      setTabs(ts => ts.map(t => t.id !== e.id ? t : { ...t,
        ...(e.kind === "title" ? { title: e.value.trim() || hostOf(t.url) } : { url: e.value, loading: e.kind !== "loaded" }) }));
      if (e.kind === "title") void syncRef.current(e.id);
    }).then(fn => { if (cancelled) fn(); else dispose = fn; }).catch(showError);
    return () => {
      alive.current = false; cancelled = true; dispose?.();
      for (const id of known.current) void native("browser_action", { id, action: "close" }).catch(() => {});
      known.current.clear();
      void native("browser_bubble", { visible: false }).catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (!isTauri()) return;
    let last = "", busy = false, disposed = false;
    const place = async () => {
      if (busy || disposed) return;
      const r = slot.current?.getBoundingClientRect();
      // The tools menu is cut out of the page like the small chat, so the page stays visible beside it.
      const chatElement = document.querySelector<HTMLElement>(".chat-panel") ?? document.querySelector<HTMLElement>(".browser-tools-pop");
      const chat = chatElement?.getBoundingClientRect();
      const covered = !!document.querySelector('.modal-bg,.chat-ws,.menu-pop,.card-menu,.bk-reader,.mu-np,[role="dialog"]:not(.browser-tools-pop)');
      const right = r?.right ?? 0;
      setNeedsRoom(!!(active && r && right - r.left < 240));
      const visible = active && !document.hidden && r && right - r.left >= 240 && r.height >= 100 && !covered;
      const dpr = window.devicePixelRatio;
      const bounds = visible && r ? { x: Math.round(r.left * dpr), y: Math.round(r.top * dpr), width: Math.floor((right - r.left) * dpr), height: Math.floor(r.height * dpr),
        overlay: chat && chatElement ? {
          x: Math.round(chat.left * dpr), y: Math.round(chat.top * dpr),
          width: Math.ceil(chat.width * dpr), height: Math.ceil(chat.height * dpr),
          radius: Math.ceil((parseFloat(getComputedStyle(chatElement).borderTopLeftRadius) || 0) * dpr),
        } : null,
      } : null;
      const bubble = document.querySelector<HTMLElement>(".ai-bubble")?.getBoundingClientRect();
      const bubbleSize = bubble ? Math.ceil((bubble.width + 16) * dpr) : 0;
      const bubbleBounds = visible && selected !== null && bubble ? {
        visible: true, x: Math.max(0, Math.round((bubble.left - 8) * dpr)), y: Math.max(0, Math.round((bubble.top - 8) * dpr)), size: bubbleSize,
        color: getComputedStyle(document.documentElement).getPropertyValue("--accent").trim(),
      } : { visible: false };
      const signature = JSON.stringify([selected, bounds, [...known.current], bubbleBounds]);
      if (last === signature) return; last = signature; busy = true;
      const cover = document.querySelector('.modal-bg,.chat-ws,.menu-pop,.card-menu,.bk-reader,.mu-np,[role="dialog"]:not(.browser-tools-pop)');
      dlog("layer", { selected, visible, covered: cover ? cover.className || cover.tagName : null, cut: chatElement?.className ?? null, bounds, bubble: bubbleBounds, tabs: [...known.current], dpr });
      try {
        for (const id of known.current) {
          if (id === selected && bounds) await native("browser_bounds", { id, ...bounds });
          else await native("browser_action", { id, action: "hide" });
        }
        await native("browser_bubble", bubbleBounds);
      } catch (e) { last = ""; dlog("layer error", String((e as any)?.message ?? e)); showError(e); } finally { busy = false; }
    };
    const interval = window.setInterval(place, 160); void place();
    return () => { disposed = true; clearInterval(interval); };
  }, [active, selected, tabs.length]);
  useEffect(()=>{
    if(!active||!current||!isTauri())return;
    let disposed=false,busy=false;
    const tick=async()=>{if(busy||document.hidden||!localList(localStorage,"lunaWebReading",validReading).some(x=>x.url===current.url))return;busy=true;try{const point=await native<{url:string;progress:number}>("browser_position",{id:current.id,action:"read",expectedUrl:current.url});if(!disposed)rememberReadingPosition(point.url,point.progress);}catch{}finally{busy=false;}};
    const timer=window.setInterval(tick,5000);return()=>{disposed=true;clearInterval(timer);};
  },[active,current?.id,current?.url]);
  useEffect(() => {
    if (!active || selected === null || !isTauri()) return;
    const id = selected, timer = window.setInterval(() => { if (!document.hidden) void syncRef.current(id); }, 3000);
    return () => clearInterval(timer);
  }, [active, selected]);
  const keysRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keysRef.current = (e: KeyboardEvent) => {
    // Only while Luna's own UI has the keyboard (a focused web page keeps its own keys) and nothing is on top.
    if (document.querySelector('.modal-bg,.chat-ws,[role="dialog"]:not(.browser-tools-pop)')) return;
    const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
    const el = e.target as HTMLElement | null, typing = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
    const inChat = !!el?.closest?.(".chat-panel");
    if (mod && k === "l") { e.preventDefault(); addressInput.current?.focus(); addressInput.current?.select(); return; }
    if (inChat) return;
    if(mod&&e.shiftKey&&k==="a"){e.preventDefault();setToolsOpen(false);setWorkspaceOpen(true);return;}
    if(mod&&k==="d"){e.preventDefault();bookmark();return;}
    if(e.key==="Escape"&&toolsOpen){e.preventDefault();setToolsOpen(false);document.querySelector<HTMLButtonElement>(".browser-tools-toggle")?.focus();return;}
    if(mod&&!e.shiftKey&&/^[1-9]$/.test(k)){const at=k==="9"?tabs.length-1:Number(k)-1;if(tabs[at]){e.preventDefault();chooseTab(tabs[at].id);}return;}
    if(mod&&e.shiftKey&&k==="t"){e.preventDefault();void reopenClosed();return;}
    if (mod && k === "t") { e.preventDefault(); chooseTab(null); requestAnimationFrame(() => addressInput.current?.focus()); return; }
    if (mod && k === "w" && chosen.current !== null) { e.preventDefault(); void closeTab(chosen.current); return; }
    if (mod && k === "tab" && tabsRef.current.length) {
      e.preventDefault();
      const list = tabsRef.current, at = list.findIndex(t => t.id === chosen.current), step = e.shiftKey ? -1 : 1;
      chooseTab(list[((at < 0 ? (step > 0 ? -1 : 0) : at) + step + list.length) % list.length].id); return;
    }
    if (chosen.current === null || (typing && k !== "f5")) return;
    if (k === "f5" || (mod && k === "r")) { e.preventDefault(); void action("reload"); }
    else if (e.altKey && k === "arrowleft") { e.preventDefault(); void action("back"); }
    else if (e.altKey && k === "arrowright") { e.preventDefault(); void action("forward"); }
    else if (mod && (k === "+" || k === "=")) { e.preventDefault(); zoomBy(1); }
    else if (mod && k === "-") { e.preventDefault(); zoomBy(-1); }
    else if (mod && k === "0") { e.preventDefault(); setPageZoom(1); }
  };
  useEffect(() => {
    if (!active) return;
    const key = (e: KeyboardEvent) => keysRef.current(e);
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, [active]);
  return <section className={"browser-shell" + (!current ? " is-start" : "")} hidden={!active} aria-label="Luna Web">
    {workspaceOpen&&<BrowserWorkspace tabs={tabs} selected={selected} select={chooseTab} move={(id,direction)=>setTabs(rows=>moveWebTab(rows,id,direction))} closeTab={closeTab} closed={closedTabs} reopen={reopenClosed} add={add} close={()=>setWorkspaceOpen(false)} bookmarks={bookmarks} saveBookmarks={rows=>{localStorage.setItem("lunaWebBookmarks",JSON.stringify(rows));setBookmarks(rows);}}/>}
    <div className="browser-chrome">
      <div className="browser-tabstrip">
        <div className="browser-tabs" role="tablist" aria-label={label("Web sekmeleri", "Web tabs")} ref={tabStrip} onKeyDown={e=>{if(!(e.target as Element).matches('[role="tab"]')||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const ids=[null,...tabs.map(t=>t.id)],at=ids.indexOf(selected);const next=e.key==='Home'?0:e.key==='End'?ids.length-1:(at+(e.key==='ArrowRight'?1:-1)+ids.length)%ids.length;chooseTab(ids[next]);requestAnimationFrame(()=>tabStrip.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus());}}>
          <button className={"browser-start-tab" + (selected === null ? " on" : "")} role="tab" tabIndex={selected===null?0:-1} aria-selected={selected === null} onClick={() => chooseTab(null)}><WebIcon name="home" size={14}/>{label("Başlangıç", "Start page")}</button>
          {tabs.map(t => <div className={"browser-tab" + (selected === t.id ? " on" : "")} key={t.id}><button role="tab" tabIndex={selected===t.id?0:-1} onAuxClick={e=>{if(e.button===1){e.preventDefault();void closeTab(t.id);}}} onMouseDown={e=>{if(e.button===1)e.preventDefault();}} aria-selected={selected === t.id} onClick={() => chooseTab(t.id)} title={t.title + "\n" + t.url}><SiteIcon url={t.url} loading={t.loading}/><span>{t.title}</span>{tabNative[t.id]?.audio && <span className="browser-tab-audio" role="img" aria-label={label("Ses çalıyor", "Playing audio")} title={label("Ses çalıyor", "Playing audio")}><WebIcon name="speaker" size={12}/></span>}</button><button className="browser-tab-close" aria-label={label(t.title + " sekmesini kapat", "Close " + t.title)} onClick={() => closeTab(t.id)}><WebIcon name="close" size={12}/></button></div>)}
          <button className="browser-new" onClick={() => { setSelected(null); addressInput.current?.focus(); }} disabled={creating || tabs.length >= 8} aria-label={label("Yeni sekme", "New tab")} title={label("Yeni sekme · Ctrl+T", "New tab · Ctrl+T")}><WebIcon name="plus" size={16}/></button>
        </div>
        <button className="browser-return" onClick={onClose} title={label("Kütüphaneye dön", "Back to library")}><WebIcon name="film" size={14}/><span>{label("Kütüphanem", "My library")}</span><WebIcon name="external" size={12}/></button>
      </div>
      <div className="browser-toolbar">
        <div className="browser-nav"><button aria-label={label("Geri", "Back")} title={label("Geri", "Back")} disabled={!current || !nowNative.canBack} onClick={() => action("back")}><WebIcon name="back"/></button><button aria-label={label("İleri", "Forward")} title={label("İleri", "Forward")} disabled={!current || !nowNative.canForward} onClick={() => action("forward")}><WebIcon name="forward"/></button>{current?.loading
              ? <button aria-label={label("Yüklemeyi durdur", "Stop loading")} title={label("Yüklemeyi durdur", "Stop loading")} onClick={stopLoading}><WebIcon name="close" size={16}/></button>
              : <button aria-label={label("Yenile", "Reload")} title={label("Yenile", "Reload")} disabled={!current} onClick={() => action("reload")}><WebIcon name="reload" size={16}/></button>}</div>
        <form className="browser-address" onSubmit={e => { e.preventDefault(); addressDirty.current = false; void action("navigate", address); }}><WebIcon name={current?.url.startsWith("https:") ? "lock" : "search"} size={15}/><input ref={addressInput} aria-label={label("Web adresi veya arama", "Web address or search")} placeholder={label("Bir adres yaz veya web’de ara", "Search the web or enter an address")} value={address} onChange={e => { addressDirty.current = true; setAddress(e.target.value); }} onKeyDown={e => { if (e.key === "Escape" && current && !composing.current && !e.nativeEvent.isComposing) { e.preventDefault(); addressDirty.current = false; setAddress(current.url); e.currentTarget.select(); } }} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} autoComplete="off" spellCheck={false}/>{!current && <kbd>Ctrl L</kbd>}{current && <button type="button" className={bookmarks.some(b => b.url === current.url) ? "saved" : ""} aria-label={label("Yer imini değiştir", "Toggle bookmark")} title={label("Yer imi", "Bookmark")} onClick={bookmark}><WebIcon name="star" size={16}/></button>}<button type="submit" aria-label={label("Adrese git", "Go")}><WebIcon name="arrow" size={16}/></button></form>
        <div className="browser-tools-anchor"><button className={"browser-tools-toggle" + (toolsOpen ? " on" : "")} aria-label={label("Sayfa araçları", "Page tools")} aria-expanded={toolsOpen} title={label("Çeviri ve sayfa araçları", "Translation and page tools")} onClick={() => setToolsOpen(v => !v)}><WebIcon name="translate" size={18}/><span>{label("Araçlar", "Tools")}</span></button>
          {toolsOpen && <div className="browser-tools-pop extra-browser-tools" role="dialog" aria-label={label("Sayfa araçları", "Page tools")}>
            <details className="browser-drop" open={downloads.some(d => d.state === "running") || undefined}><summary><WebIcon name="external" size={17}/>{label("İndirmeler", "Downloads")}{downloads.length ? <small>{downloads.length}</small> : null}</summary>
              {!downloads.length && <p className="browser-drop-empty">{label("Henüz indirme yok. Sayfadaki indirme bağlantıları İndirilenler klasörüne kaydedilir.", "No downloads yet. Download links on pages save to your Downloads folder.")}</p>}
              {downloads.map(d => <div key={d.path || d.url} className={"browser-dl " + d.state}><span className="ellipsis" title={d.path}>{d.name}</span><small>{d.state === "running" ? label("İniyor…", "Downloading…") : d.state === "done" ? label("Bitti", "Done") : label("Başarısız", "Failed")}</small>
                {d.state === "done" && <><button onClick={() => void native("browser_download_open", { path: d.path, reveal: false }).catch(showError)}>{label("Aç", "Open")}</button><button onClick={() => void native("browser_download_open", { path: d.path, reveal: true }).catch(showError)}>{label("Klasörde göster", "Show in folder")}</button></>}</div>)}
              {downloads.some(d => d.state !== "running") && <button className="browser-drop-clear" onClick={() => setDownloads(ds => ds.filter(d => d.state === "running"))}>{label("Listeyi temizle", "Clear list")}</button>}
            </details>
            <details className="browser-drop"><summary><WebIcon name="plus" size={17}/>{label("Eklentiler", "Extensions")}{extensions?.items.length ? <small>{extensions.items.length}</small> : null}</summary>
              {extensions?.items.map(x => <div key={x.folder} className="browser-dl done"><span className="ellipsis">{x.name}</span><small>{x.version}</small></div>)}
              {!extensions?.items.length && <p className="browser-drop-empty">{label("Yüklü eklenti yok.", "No extensions installed.")}</p>}
              <p className="browser-drop-empty">{label("Chrome/Edge eklentisinin açılmış (manifest.json içeren) klasörünü eklenti klasörüne koy; yeni açılan sekmelerde çalışır. Luna'yı yeniden başlatman gerekebilir.", "Put an unpacked Chrome/Edge extension folder (with its manifest.json) into the extensions folder; new tabs load it. Luna may need a restart.")}</p>
              <button className="browser-drop-clear" onClick={() => void native("browser_extensions", { action: "open-folder" }).catch(showError)}>{label("Eklenti klasörünü aç", "Open extensions folder")}</button>
            </details><hr/>
            <button className="browser-menu-action" onClick={()=>{setToolsOpen(false);setWorkspaceOpen(true);}}><WebIcon name="book" size={17}/>{label("Sekmeler ve favoriler","Tabs and favourites")}</button><button className="browser-menu-action" disabled={!closedTabs.length||creating||tabs.length>=8} onClick={()=>{setToolsOpen(false);void reopenClosed();}}><WebIcon name="reload" size={17}/>{label("Kapatılan sekmeyi geri aç","Reopen closed tab")}<small>Ctrl+Shift+T</small></button><button className="browser-menu-action" disabled={!current||creating||tabs.length>=8} onClick={()=>{setToolsOpen(false);if(current)void add(current.url);}}><WebIcon name="plus" size={17}/>{label("Sekmeyi çoğalt","Duplicate tab")}</button><button className="browser-menu-action" disabled={!current} onClick={()=>{setToolsOpen(false);if(current)void copyAssistantText(current.url).then(()=>{if(alive.current)setBrowserNotice(label("Sayfa bağlantısı kopyalandı.","Page link copied."));}).catch(showError);}}><WebIcon name="external" size={17}/>{label("Sayfa bağlantısını kopyala","Copy page link")}</button><hr/><div className="browser-pop-head"><b>{label("Bu sayfa", "This page")}</b><button aria-label={label("Kapat", "Close")} onClick={() => setToolsOpen(false)}><WebIcon name="close" size={15}/></button></div><label className="browser-language-label">{label("Çeviri dili", "Translate into")}<select aria-label={label("Sayfa çeviri dili", "Page translation language")} value={targetLanguage} onChange={e => {setTargetLanguage(e.target.value);try{localStorage.setItem("lunaWebTranslationLanguage",e.target.value);}catch(e){showError(e);}}}>{TRANSLATION_LANGUAGES.map(language => <option key={language}>{language}</option>)}</select></label><button className="browser-menu-action" disabled={!current || translating} onClick={() => { setToolsOpen(false); void translatePage(targetLanguage).catch(showError); }}><WebIcon name="translate" size={17}/>{translating ? label("Çevriliyor…", "Translating…") : label("Sayfayı çevir", "Translate page")}</button><button className="browser-menu-action" disabled={!current || translating} onClick={() => { setToolsOpen(false); void translatePage("restore").catch(showError); }}><WebIcon name="reload" size={17}/>{label("Özgün sayfaya dön", "Restore original")}</button><hr/><div className="browser-zoom-row" role="group" aria-label={label("Sayfa yakınlığı", "Page zoom")}><button disabled={!current} aria-label={label("Uzaklaştır", "Zoom out")} title="Ctrl -" onClick={() => zoomBy(-1)}>−</button><output aria-live="polite">{Math.round(nowNative.zoom * 100)}%</output><button disabled={!current} aria-label={label("Yakınlaştır", "Zoom in")} title="Ctrl +" onClick={() => zoomBy(1)}>+</button><button disabled={!current || nowNative.zoom === 1} onClick={() => setPageZoom(1)}>{label("Sıfırla", "Reset")}</button></div><hr/><button className="browser-menu-action" disabled={!current || reading} onClick={() => { setToolsOpen(false); void readPage(); }}><WebIcon name="spark" size={17}/>{label("Sayfayı asistana ver", "Share page with Luna")}</button><button className="browser-menu-action" disabled={!current} onClick={() => current && openUrl(current.url).catch(showError)}><WebIcon name="external" size={17}/>{label("Dış tarayıcıda aç", "Open in your browser")}</button><small>{label("Çeviri ve sayfa okuma seçili AI profilini kullanır.", "Translation and page questions use your selected AI profile.")}</small><hr/><BrowserExtras key={current?.url||"home"} url={current?.url} title={current?.title} position={async()=>{if(!current)throw Error("Önce sayfa aç.");return native<{url:string;progress:number}>("browser_position",{id:current.id,action:"read",expectedUrl:current.url});}} openReading={(url,progress)=>{pendingScroll.current={id:current?.id??null,url,progress};setToolsOpen(false);if(current?.url===url){pendingScroll.current=null;void native("browser_position",{id:current.id,action:"scroll",expectedUrl:url,fraction:progress}).catch(showError);}else void action("navigate",url);}}/></div>}
        </div>
      </div>
      {current?.loading && <div className="browser-progress" role="progressbar" aria-label={label("Sayfa yükleniyor", "Page loading")}/>}
      {current && bookmarks.length > 0 && <div className="browser-bookmarks">{bookmarks.slice(0, 12).map(b => <button key={b.url} title={b.url} onClick={() => action("navigate", b.url)}><WebIcon name="star" size={12}/>{b.title}</button>)}</div>}
    </div>
    {browserNotice&&<div className="browser-notice" role="status"><WebIcon name="star" size={13}/>{browserNotice}</div>}
    {error && <div className="browser-alert" role="alert"><span>{error}</span><button onClick={() => setError("")} aria-label={label("Uyarıyı kapat", "Dismiss")}><WebIcon name="close" size={16}/></button></div>}
    {popup && <div className="browser-alert"><span title={popup.url}>{label("Yeni sayfa isteği:", "New page request:")} {hostOf(popup.url)}</span><button onClick={() => { void add(popup.url); setPopup(null); }}>{label("Yeni sekmede aç", "Open in new tab")}</button><button onClick={() => setPopup(null)} aria-label={label("İsteği yok say", "Dismiss request")}><WebIcon name="close" size={15}/></button></div>}
    {(translationNote||translating) && <div className="browser-translation-status" role="status"><WebIcon name="translate" size={14}/><span>{translationNote}</span>{translating&&<button className="chip" onClick={()=>{cancelTranslation.current=true;setTranslationNote(label("Durduruluyor; gönderilmiş isteğin yanıtı uygulanmayacak.","Stopping; the in-flight reply will not be applied."));}}>{label("İptal","Cancel")}</button>}{canRetry&&!translating&&<button className="chip" onClick={()=>void translatePage(retryTranslation.current?.target||targetLanguage).catch(showError)}>{label("Başarısız bölümden devam et","Retry remaining sections")}</button>}</div>}
    <div className="browser-surface" ref={slot} aria-busy={!!current?.loading}>
      {current && needsRoom && <div className="browser-space-note"><WebIcon name="globe" size={32}/><p>{label("Sayfaya yer açmak için asistanı küçült veya pencereyi genişlet.", "Minimize the assistant or widen the window to show the page.")}</p></div>}
      {!current && <div className="browser-start-page"><div className="browser-start-content">
        <div className="browser-start-topline"><span><span className="browser-live-dot"/>LUNA WEB</span><span>{label("Kendine bir keşif alanı aç.", "A little room for curiosity.")}</span></div>
        <div className="browser-start-hero"><div className="browser-start-copy"><h1>{label("Biraz merak.", "A little curiosity.")}<br/><span>{label("Yeni dünyalar.", "A whole new world.")}</span></h1><p>{label("Sevdiğin siteler, yeni keşifler ve yanında Luna.", "Your favourite places. Your next discovery. Luna by your side.")}</p></div><div className="browser-start-art" aria-hidden="true"><div className="web-art-ring ring-one"/><div className="web-art-ring ring-two"/><div className="web-art-orbit"/><span className="web-art-star star-one">✦</span><span className="web-art-star star-two">+</span><div className="web-art-moon"/><span className="web-art-coordinate">LUNA / WEB</span></div></div>
        <form className="browser-start-search" onSubmit={e => { e.preventDefault(); void action("navigate", address); }}><WebIcon name="search" size={21}/><input aria-label={label("Başlangıç sayfasında ara", "Search from start page")} placeholder={label("Bugün ne keşfetmek istersin?", "Where would you like to go today?")} value={address} onChange={e => setAddress(e.target.value)} autoComplete="off"/><button type="submit">{label("Keşfet", "Explore")}<WebIcon name="arrow" size={17}/></button></form>
        <div className="browser-section-heading"><h2>{label("Bir tık uzağında", "One click away")}</h2><span>{label("Küçük bir başlangıç noktası", "A few good places to start")}</span></div>
        <div className="browser-destinations">{SHORTCUTS.map(site => <button className={"browser-destination " + site.style} key={site.name} disabled={creating} onClick={() => action("navigate", site.url)}><span className="destination-arrow"><WebIcon name="external" size={14}/></span><span className="destination-mark">{site.mark === "play" ? <svg width="29" height="24" viewBox="0 0 29 24" aria-hidden="true"><rect x="0" y="2" width="29" height="20" rx="6" fill="currentColor"/><path d="m12 8 7 4-7 4Z" fill="#201316"/></svg> : site.mark === "dots" ? <span className="letterboxd-dots"><i/><i/><i/></span> : site.mark === "tm" ? <b>TM<span>DB</span></b> : <span className="wiki-w">W</span>}</span><strong>{site.name}</strong><small>{label(site.tr, site.en)}</small></button>)}</div>
        <div className="browser-lower-grid"><section className="browser-saved-section"><div className="browser-section-heading"><h2>{label("Senin köşen", "Your corner")}</h2><button onClick={() => setShortcutForm(v => !v)}><WebIcon name="plus" size={13}/>{label("Site ekle", "Add a site")}</button></div>
          {shortcutForm && <form className="browser-shortcut-form" onSubmit={e => { e.preventDefault(); saveShortcut(); }}><input aria-label={label("Kısayol adı", "Shortcut name")} placeholder={label("Site adı", "Site name")} value={shortcutTitle} onChange={e => setShortcutTitle(e.target.value)}/><input aria-label={label("Kısayol adresi", "Shortcut address")} placeholder="https://…" value={shortcutUrl} onChange={e => setShortcutUrl(e.target.value)} required/><button type="submit">{label("Ekle", "Add")}</button></form>}
          <div className="browser-saved-list">{bookmarks.length ? bookmarks.slice(0, 6).map(b => <div className="browser-saved-item" key={b.url}><button onClick={() => action("navigate", b.url)}><span className="saved-site-icon">{b.title.charAt(0).toLocaleUpperCase()}</span><span><strong>{b.title}</strong><small>{new URL(b.url).hostname.replace(/^www\./, "")}</small></span><WebIcon name="arrow" size={15}/></button><button className="saved-remove" aria-label={label(b.title + " kısayolunu kaldır", "Remove " + b.title)} onClick={() => { try { const next = bookmarks.filter(x => x.url !== b.url); localStorage.setItem("lunaWebBookmarks", JSON.stringify(next)); setBookmarks(next); } catch (e) { showError(e); } }}><WebIcon name="close" size={13}/></button></div>) : <button className="browser-saved-empty" onClick={() => setShortcutForm(true)}><span className="saved-site-icon"><WebIcon name="star" size={19}/></span><span><strong>{label("Hep döndüğün yerleri buraya ekle.", "Keep your favourite places close.")}</strong><small>{label("Kendi sitelerin, kendi düzenin.", "Your sites, arranged your way.")}</small></span><WebIcon name="plus" size={16}/></button>}</div>
        </section><aside className="browser-assistant-card"><div className="browser-assistant-title"><span><WebIcon name="spark" size={18}/></span><b>Luna Asistan</b><small>{label("YANINDA", "BY YOUR SIDE")}</small></div><p>{label("Bir sayfa aç. Gerisini birlikte keşfedelim.", "Open a page. Let's explore it together.")}</p><div className="browser-assistant-prompts"><button onClick={onAssistant}>{label("Bu sayfayı özetle", "Summarize this page")}<WebIcon name="arrow" size={13}/></button><button onClick={onAssistant}>{label("Türkçeye çevir", "Translate this page")}<WebIcon name="translate" size={13}/></button></div><small>{label("Sağ alttaki Luna’ya tıkla ve sayfa hakkında sor.", "Ask about the page using Luna in the bottom-right corner.")}</small></aside></div>
      </div></div>}
    </div>

  </section>;
}

function SiteIcon({url,loading}:{url:string;loading:boolean}){const [failed,setFailed]=useState(false);let src="";try{src=new URL("/favicon.ico",url).href;}catch{}useEffect(()=>setFailed(false),[src]);return loading?<WebIcon name="reload" size={14}/>:failed||!src?<WebIcon name="globe" size={14}/>:<img className="browser-favicon" src={src} alt="" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>;}
