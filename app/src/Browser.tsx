import { SitePreferencesPanel, RecoveryPanel, PageLibrarySignal } from "./BrowserDaily";
import { cleanSitePreferences, siteOrigin, recoveryTabs } from "./everydayModel";
import type { SitePreference, RecoveryTab } from "./everydayModel";
import type { Item } from "./library";
import { askAssistant } from "./Taste";
import { mergePageNote, validPageNote } from "./browserRecords";
import "./Everyday.css";
import { BrowserReader } from "./BrowserReader";
import { CommandPalette } from "./CommandPalette";
import type { PaletteCommand } from "./CommandPalette";
import { pinTab, stepTab, dropTab } from "./browserStartModel";
import { cleanZoomMap, rememberZoom, zoomFor } from "./browserZoomMemory";
import {BrowserManager} from "./BrowserManager";
import {copyAssistantText} from "./AssistantTools";
import {moveWebTab,cleanWebTabs,upsertWebBookmark,missingWebTabs} from "./browserWorkspaceModel";
import { BrowserWorkspace } from "./BrowserWorkspace";
import type { SavedWebTab } from "./browserWorkspaceModel";
import { localList, validReading } from "./extrasModel";
import { BrowserExtras, rememberReadingPosition } from "./BrowserExtras";
import { dropNative, freshNative, navFailure, nextZoom, parseAudio, parseHistory, parseNavDone, parseZoom, patchNative, permissionNotice } from "./browserNativeModel";
import type { TabNative } from "./browserNativeModel";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { lang } from "./i18n";
import { BrowserIcon as WebIcon } from "./BrowserIcons";
import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { browserAddress, cleanBrowserPage, friendlyBrowserError } from "./browserModel";
import type { BrowserPage, WebTab } from "./browserModel";
import { registerBrowserReader, registerBrowserTranslator, TRANSLATION_LANGUAGES, translateRows, translationBatches } from "./browserTranslation";
import type { TranslationRow, TranslationSummary } from "./browserTranslation";
import { aiReady } from "./ai";
import "./Browser.css";
import "./BrowserPlus.css";
import { store } from "./library";
import { putExtra } from "./Extras";
import { browserRows, mergeReadingEntry } from "./browserRecords";
import { ClearDataPanel, FindBar, HistoryPanel, ShortcutsPanel, SiteAvatar, SuggestList, WebMenu } from "./BrowserPanels";
import type { TabMenuItem } from "./BrowserPanels";
import { BrowserStart } from "./BrowserStart";
import { clearVisitsSince, forgetFailedVisit, HIDDEN_SITES_KEY, HISTORY_KEY, HISTORY_PAUSED_KEY, readSession, readVisits, recordVisit, removeVisit, retitleVisit, SESSION_KEY, sessionTabs, topSites, webSuggestions } from "./browserHistoryModel";
import type { Suggestion, WebVisit } from "./browserHistoryModel";
import { ENGINE_KEY, resolveWebInput, searchEngine, searchedWords } from "./browserSearchModel";
import type { SearchEngineId } from "./browserSearchModel";
import { playableInLuna, prettyAddress } from "./browserReaderModel";

type WebEvent = { id: number; kind: string; value: string };
type Bookmark = { title: string; url: string };
const HOME = "https://www.google.com/";
const label = (tr: string, en: string) => lang() === "tr" ? tr : en;
/** "ctrl+shift+t", "alt+home"…: the shortcut a key press stands for, in the names the native key hook also uses. */
function shortcutName(e: KeyboardEvent): string {
  const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
  if (mod && !e.altKey) return (e.shiftKey ? "ctrl+shift+" : "ctrl+") + k;
  if (e.altKey && !mod && !e.shiftKey && k === "home") return "alt+home";
  if (!mod && !e.altKey && !e.shiftKey && ["f6", "f9", "f1"].includes(k)) return k;
  return "";
}
/** One line into luna-debug.log (Luna's data folder): the page layer, menus, downloads and errors. */
const dlog = (...parts: unknown[]) => { if (isTauri()) void native("debug_log", { lines: [parts.map(p => typeof p === "string" ? p : JSON.stringify(p)).join(" ")] }).catch(() => {}); };
type FindResult = { count: number; index: number; capped: boolean };
// One native mutation at a time, including cleanup after React StrictMode's effect replay.
let operations = Promise.resolve();
function native<T>(command: string, args: Record<string, unknown>, allowed:()=>boolean=()=>true): Promise<T> {
  const job = operations.then(() => {if(!allowed())throw Error("Operation canceled before execution");return invoke<T>(command, args);});
  operations = job.then(() => {}, () => {});
  return job;
}
export type ActiveWebTab = { id?: number; revision?: number; title: string; url: string; loading: boolean };
const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };
export function Browser({ active, onClose, onPage, onInvalidate, onAssistant, onActiveTab, onPlay, items = [], onLibraryOpen, onVideoFullscreen }: {
  /** Plays a video page or media address in Luna's own player (mpv + yt-dlp). */
  onPlay?: (url: string) => void; items?: Item[]; onLibraryOpen?: (key:string)=>void; onVideoFullscreen?: (on:boolean)=>void;
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
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [pinned, setPinned] = useState<Set<number>>(() => new Set());
  const pinnedRef = useRef(pinned); pinnedRef.current = pinned;
  const zoomMemory = useRef((() => { try { return cleanZoomMap(JSON.parse(localStorage.getItem("lunaWebSiteZoom") || "null")); } catch { return cleanZoomMap(null); } })());
  const [sitePrefs,setSitePrefs]=useState(()=>{try{return cleanSitePreferences(JSON.parse(store.get("lunaWebSitePreferences")||"{}"));}catch{return cleanSitePreferences(null);}});
  const prefsRef=useRef(sitePrefs);prefsRef.current=sitePrefs;
  const [siteSettings,setSiteSettings]=useState(false),[focusMode,setFocusMode]=useState(false),[fullTabs,setFullTabs]=useState<Set<number>>(()=>new Set());
  const [pageMenu,setPageMenu]=useState<{id:number;revision:number;url:string;text:string;page:string;x:number;y:number}|null>(null);
  const selectedText=useRef<{id:number;revision:number;page:BrowserPage}|null>(null);
  const [recover,setRecover]=useState<RecoveryTab[]>(()=>{try{const saved=JSON.parse(store.get("lunaWebRecovery")||"null");return saved?.dirty?recoveryTabs(saved.tabs):[];}catch{return [];}});
  const [recoveryBusy,setRecoveryBusy]=useState(false);const recoveryStopped=useRef(false),lastCreated=useRef<number|null>(null);
  const addRef=useRef<(url:string)=>Promise<boolean>>(async()=>false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [manager,setManager]=useState<"extensions"|"downloads"|null>(null);
  const [downloadCount,setDownloadCount]=useState(0);
  useEffect(()=>{if(!active)setManager(null);},[active]);
  useEffect(()=>{
    let disposed=false,off:(()=>void)|undefined;
    const update=()=>{void invoke<{state:string}[]>("browser_downloads",{action:"list"}).then(rows=>{if(!disposed)setDownloadCount(rows.filter(r=>r.state==="running").length);}).catch(()=>{});};
    if(isTauri()){update();void listen("luna-downloads-changed",update).then(f=>{if(disposed)f();else off=f;}).catch(()=>{});}
    return()=>{disposed=true;off?.();};
  },[]);
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
  const [popup, setPopup] = useState<{ id: number; url: string } | null>(null);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(() => {
    try { const raw: unknown = JSON.parse(localStorage.getItem("lunaWebBookmarks") || "[]");
      return cleanWebTabs(raw,40);
    } catch { return []; }
  });
  const [engineId, setEngineId] = useState<SearchEngineId>(() => { try { return searchEngine(localStorage.getItem(ENGINE_KEY)).id; } catch { return "google"; } });
  const engine = searchEngine(engineId), engineRef = useRef(engine); engineRef.current = engine;
  const [history, setHistory] = useState<WebVisit[]>(() => { try { return readVisits(localStorage.getItem(HISTORY_KEY)); } catch { return []; } });
  const [historyPaused, setHistoryPaused] = useState(() => { try { return localStorage.getItem(HISTORY_PAUSED_KEY) === "1"; } catch { return false; } });
  const [hiddenSites, setHiddenSites] = useState<string[]>(() => { try { const raw: unknown = JSON.parse(localStorage.getItem(HIDDEN_SITES_KEY) || "[]"); return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string").slice(0, 100) : []; } catch { return []; } });
  const [lastSession, setLastSession] = useState<SavedWebTab[]>(() => { try { return readSession(localStorage.getItem(SESSION_KEY)); } catch { return []; } });
  const historyRef = useRef(history), pausedRef = useRef(historyPaused);
  historyRef.current = history; pausedRef.current = historyPaused;
  // Synchronous per-tab facts for the native event listener (React state is one render behind there).
  const titles = useRef(new Map<number, string>()), loadingNow = useRef(new Set<number>()), failedNav = useRef(new Map<string, number>());
  const restoringSession = useRef(false),sessionTouched=useRef(false);
  const tabMuteChoice=useRef(new Map<number,{origin:string;muted:boolean}>());
  const [mutedTabs, setMutedTabs] = useState<number[]>([]);
  const [menu, setMenu] = useState<{ x: number; y: number; id: number } | null>(null);
  const [findOpen, setFindOpen] = useState(false), [findQuery, setFindQuery] = useState(""), [findCase, setFindCase] = useState(false);
  const [findResult, setFindResult] = useState<FindResult | null>(null), [findBusy, setFindBusy] = useState(false);
  const findTab = useRef<number | null>(null), findSeq = useRef(0), findOpenRef = useRef(false); findOpenRef.current = findOpen;
  const [reader, setReader] = useState<{ page: BrowserPage; url: string } | null>(null), [readerBusy, setReaderBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false), [clearOpen, setClearOpen] = useState(false), [keysOpen, setKeysOpen] = useState(false);
  const [focusSource, setFocusSource] = useState<"bar" | "start" | null>(null), [addressEdited, setAddressEdited] = useState(false), [suggestAt, setSuggestAt] = useState(-1);
  const [readingRows, setReadingRows] = useState(() => localList(localStorage, "lunaWebReading", validReading));
  const dragCleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => { dragCleanup.current?.(); }, []);
  const dragState = useRef<{ id: number; x: number; active: boolean } | null>(null), justDragged = useRef(false), focusSelect = useRef(false);
  const slot = useRef<HTMLDivElement>(null), addressInput = useRef<HTMLInputElement>(null), tabStrip = useRef<HTMLDivElement>(null);
  const alive = useRef(true), known = useRef(new Set<number>()), chosen = useRef(selected), revisions = useRef(new Map<number, number>());
  const assistantRef = useRef(onAssistant); assistantRef.current = onAssistant;
  const invalidator = useRef(onInvalidate); invalidator.current = onInvalidate; chosen.current = selected;
  const activeTabRef = useRef(onActiveTab); activeTabRef.current = onActiveTab;
  // Last URL each tab really finished loading; a blocked download must not leave its address behind.
  const committed = useRef(new Map<number, string>()), syncing = useRef(new Set<number>());
  const tabsRef = useRef(tabs); tabsRef.current = tabs;
  const creatingRef = useRef(false), addressDirty = useRef(false), lastSelected = useRef(selected);
  useEffect(() => {
    if (!active) { selectedText.current=null;setPaletteOpen(false); setHistoryOpen(false); setClearOpen(false); setKeysOpen(false); setReader(null); setMenu(null); setToolsOpen(false); setWorkspaceOpen(false); setPageMenu(null); setSiteSettings(false);setFocusMode(false);recoveryStopped.current=true; dragCleanup.current?.(); }
  }, [active]);
  const current = tabs.find(t => t.id === selected);
  const fullscreen=active&&selected!==null&&fullTabs.has(selected),cinema=!!current&&(focusMode||fullscreen);
  useEffect(()=>{document.documentElement.classList.toggle("luna-web-video-fullscreen",fullscreen);onVideoFullscreen?.(fullscreen);return()=>{document.documentElement.classList.remove("luna-web-video-fullscreen");onVideoFullscreen?.(false);};},[fullscreen,onVideoFullscreen]);
  const storePage=(()=>{try{const url=new URL(current?.url||"");return url.protocol==="https:"&&["chromewebstore.google.com","chrome.google.com"].includes(url.hostname)&&/\/[a-p]{32}\/?$/.test(url.pathname);}catch{return false;}})();
  const nowNative: TabNative = (current && tabNative[current.id]) || freshNative();
  useEffect(() => {
    // A redirect or in-page URL change must not wipe what the user is typing; switching tabs always resets it.
    const switched = lastSelected.current !== selected; lastSelected.current = selected;
    if (switched || !addressDirty.current) { addressDirty.current = false; setAddress(current?.url || ""); setAddressEdited(false); }
    if (switched) { selectedText.current=null;setPageMenu(null);setFocusMode(false); if (findOpenRef.current) closeFind(); setReader(null); setMenu(null); }
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
  const currentRevision=current?revisions.current.get(current.id)||0:0;
  useEffect(() => { activeTabRef.current?.(active && current ? { id:current.id,revision:revisions.current.get(current.id)||0,title: current.title, url: current.url, loading: current.loading } : null); }, [active, current?.id, current?.title, current?.url, current?.loading,currentRevision]);
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
    const id = selected, url = tabsRef.current.find(t => t.id === id)?.url;
    void native("browser_action", { id, action: "zoom", zoom: factor })
      .then(() => { if (alive.current && known.current.has(id)) { setTabNative(m => patchNative(m, id, { zoom: factor })); if (url) { zoomMemory.current = rememberZoom(zoomMemory.current, url, factor); try { localStorage.setItem("lunaWebSiteZoom", JSON.stringify(zoomMemory.current)); } catch {} } } })
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
    let url: string; try { url = resolveWebInput(raw, engineRef.current, lang() === "tr"); } catch (e) { showError(e); return false; }
    if (!restoringSession.current) setLastSession(rows => rows.length ? [] : rows);
    const id = crypto.getRandomValues(new Uint32Array(1))[0];
    const previous = chosen.current;
    if(pendingScroll.current?.id===null&&pendingScroll.current.url===url)pendingScroll.current.id=id;
    lastCreated.current=id;
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
  addRef.current=add;
  async function closeTab(id: number) {
    if(closingTabs.current.has(id)||!known.current.has(id))return;
    closingTabs.current.add(id);
    const tab=tabsRef.current.find(t=>t.id===id);
    try {
      await native("browser_action", { id, action: "close" });
      known.current.delete(id); revisions.current.delete(id); committed.current.delete(id);if(pendingScroll.current?.id===id)pendingScroll.current=null;
      titles.current.delete(id); loadingNow.current.delete(id); setMutedTabs(m => m.filter(x => x !== id));
      setTabNative(m => dropNative(m, id)); stopping.current.delete(id); setPinned(old => new Set([...old].filter(x => x !== id)));setFullTabs(old=>new Set([...old].filter(x=>x!==id)));tabMuteChoice.current.delete(id);
      // Like other browsers: the neighbour on the right takes over, else the one on the left.
      const list = tabsRef.current, at = list.findIndex(t => t.id === id), left = list.filter(t => t.id !== id);
      setTabs(ts => ts.filter(t => t.id !== id));
      if (chosen.current === id) {setSelected((left[at] ?? left[at - 1])?.id ?? null);invalidator.current();}
      if(tab&&alive.current)setClosedTabs(rows=>[{title:tab.title,url:tab.url},...rows].slice(0,12));
    } catch (e) { showError(e); }finally{closingTabs.current.delete(id);}
  }
  async function reopenClosed(index=0){if(reopening.current||!closedTabs[index])return;reopening.current=true;const tab=closedTabs[index];try{if(await add(tab.url))setClosedTabs(rows=>{const at=rows.indexOf(tab);return at<0?rows:rows.filter((_,i)=>i!==at);});}finally{reopening.current=false;}}
  async function action(action: string, raw?: string) {
    if (action === "navigate" && raw !== undefined && !raw.trim()) { addressInput.current?.focus(); return; }
    if (selected === null) { if (raw) await add(raw); return; }
    if (action === "navigate" || action === "reload") stopping.current.delete(selected);
    const id = selected;
    try {
      const url = raw === undefined ? undefined : action === "navigate" ? resolveWebInput(raw, engineRef.current, lang() === "tr") : browserAddress(raw);
      if (action === "navigate") { setAddressEdited(false); setSuggestAt(-1); }
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
  async function capturePage(plain = false): Promise<BrowserPage> {
    if (chosen.current === null || !shown.current) throw new Error("Önce bir web sayfası aç.");
    const id = chosen.current, revision = revisions.current.get(id) || 0;
    const selection=selectedText.current;
    if(!plain&&selection&&selection.id===id&&selection.revision===revision&&selection.page.url===tabsRef.current.find(t=>t.id===id)?.url)return selection.page;
    const page = await native<Omit<BrowserPage, "capturedAt">>("browser_read", { id });
    if (!alive.current || !shown.current || chosen.current !== id || revision !== (revisions.current.get(id) || 0)) throw new Error("Sayfa değişti; yeniden oku.");
    const clean = cleanBrowserPage(page, !!tabsRef.current.find(t => t.id === id)?.loading);
    // A YouTube video: what is said in it (its subtitles, fetched once per video) instead of only the page around it.
    if (!plain && /^https:\/\/(www\.|m\.)?youtube\.com\/(watch|shorts\/)|^https:\/\/youtu\.be\//.test(clean.url)) {
      let said = transcripts.get(clean.url);
      if (said === undefined) {
        said = await invoke<string>("yt_transcript", { url: clean.url }).catch(() => "");
        if(said){if(transcripts.size>=20)transcripts.delete(transcripts.keys().next().value!);transcripts.set(clean.url,said);}

      }
      if (!alive.current || !shown.current || chosen.current !== id || revision !== (revisions.current.get(id) || 0)) throw new Error("Sayfa değişti; yeniden oku.");
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
  function addBookmarkFrom(titleText: string, rawUrl: string): boolean {
    try {
      const url = browserAddress(rawUrl);
      const next = upsertWebBookmark(bookmarks, { title: titleText.trim().slice(0, 80) || new URL(url).hostname, url });
      localStorage.setItem("lunaWebBookmarks", JSON.stringify(next)); setBookmarks(next); setError(""); return true;
    } catch (e) { showError(e); return false; }
  }
  function removeBookmark(url: string) {
    try { const next = bookmarks.filter(x => x.url !== url); localStorage.setItem("lunaWebBookmarks", JSON.stringify(next)); setBookmarks(next); } catch (e) { showError(e); }
  }
  function bookmark(tab: { title: string; url: string } | undefined = current) {
    if (!tab) return;
    try {
      const next = bookmarks.some(b => b.url === tab.url) ? bookmarks.filter(b => b.url !== tab.url) : upsertWebBookmark(bookmarks, tab);
      localStorage.setItem("lunaWebBookmarks", JSON.stringify(next)); setBookmarks(next);
      setBrowserNotice(label(next.length<bookmarks.length?"Favori kaldırıldı.":"Favori kaydedildi.",next.length<bookmarks.length?"Favourite removed.":"Favourite saved."));
    } catch(e) { showError(e); }
  }
  function persistJournal(clean=false){
    if(pausedRef.current){store.remove("lunaWebRecovery");return;}
    const rows=tabsRef.current.map(t=>({title:t.title,url:t.url,pinned:pinnedRef.current.has(t.id)}));
    store.set("lunaWebRecovery",JSON.stringify({dirty:!clean,tabs:recoveryTabs([...rows,...recover]),at:Date.now()}));
  }
  useEffect(()=>{persistJournal();},[tabs,pinned,historyPaused,recover]);
  const journalRef=useRef(persistJournal);journalRef.current=persistJournal;
  useEffect(()=>{const clean=()=>journalRef.current(true);window.addEventListener("beforeunload",clean);return()=>window.removeEventListener("beforeunload",clean);},[]);
  useEffect(()=>{const reset=()=>{selectedText.current=null;invalidator.current();};window.addEventListener("luna-browser-refresh-context",reset);return()=>window.removeEventListener("luna-browser-refresh-context",reset);},[]);
  async function recoverSelected(rows:RecoveryTab[]){
    recoveryStopped.current=false;restoringSession.current=true;setRecoveryBusy(true);setRecover(rows);
    const pending=[...rows].sort((a,b)=>Number(b.pinned)-Number(a.pinned));let completed=0;
    try{for(const row of pending){
      if(recoveryStopped.current||!shown.current||!alive.current||known.current.size>=8)break;
      if(tabsRef.current.some(t=>t.url===row.url)){completed++;continue;}
      if(!await addRef.current(row.url))break;const id=lastCreated.current;
      if(id!==null&&row.pinned){setPinned(old=>new Set([...old,id]));}
      completed++;
      const start=Date.now();while(!recoveryStopped.current&&shown.current&&alive.current&&Date.now()-start<8000){const tab=tabsRef.current.find(t=>t.id===id);if(tab&&!tab.loading)break;await new Promise(resolve=>setTimeout(resolve,120));}
    }}finally{restoringSession.current=false;setRecoveryBusy(false);setRecover(pending.slice(completed));setLastSession([]);}
  }
  function closeRecovery(){recoveryStopped.current=true;if(!recoveryBusy){setRecover([]);store.set("lunaWebRecovery",JSON.stringify({dirty:true,tabs:tabsRef.current.map(t=>({title:t.title,url:t.url,pinned:pinnedRef.current.has(t.id)})),at:Date.now()}));}}
  function saveSitePreference(origin:string,value:SitePreference){
    const next=cleanSitePreferences({...prefsRef.current,[origin]:value});
    if(!store.set("lunaWebSitePreferences",JSON.stringify(next))){showError(label("Tercihler kaydedilemedi.","Could not save preferences."));return;}
    setSitePrefs(next);setSiteSettings(false);
    for(const tab of tabsRef.current)if(siteOrigin(tab.url)===origin)toggleMute(tab.id,value.muted);
  }
  function selectionAction(kind:"explain"|"translate"|"note"){
    const context=pageMenu;if(!context||!context.text||chosen.current!==context.id||(revisions.current.get(context.id)||0)!==context.revision)return;
    if(kind==="note"){
      try{const rows=browserRows(localStorage,"lunaWebNotes",validPageNote),old=rows.find(r=>r.url===context.page)?.text||"";putExtra("lunaWebNotes",mergePageNote(rows,context.page,[old,context.text].filter(Boolean).join("\n\n"),Date.now()));setBrowserNotice(label("Seçili metin sayfa notuna eklendi.","Selected text was added to the page note."));}catch(error){showError(error);}
    }else{
      const tab=tabsRef.current.find(t=>t.id===context.id);const page:BrowserPage={title:tab?.title||context.page,url:context.page,text:context.text,selection:context.text,truncated:false,capturedAt:Date.now()};
      selectedText.current={id:context.id,revision:context.revision,page};onPage(page);
      askAssistant(kind==="explain"?label("Yalnız seçtiğim metni açıkla.","Explain only the selected text."):label("Yalnız seçtiğim metni Türkçeye çevir.","Translate only the selected text into English."));
    }setPageMenu(null);
  }
  function pageMenuItems():TabMenuItem[]{
    if(!pageMenu)return [];const rows:TabMenuItem[]=[];
    if(pageMenu.url)rows.push({label:label("Bağlantıyı yeni sekmede aç","Open link in new tab"),icon:"plus",disabled:tabs.length>=8||creating,run:()=>{void add(pageMenu.url);}},
      {label:label("Bağlantıyı sonra oku","Read link later"),icon:"book",run:()=>saveReading(pageMenu.url,hostOf(pageMenu.url))},
      {label:label("Bağlantıyı kopyala","Copy link"),icon:"copy",run:()=>{void copyAssistantText(pageMenu.url).catch(showError);}});
    if(pageMenu.url&&onPlay&&playableInLuna(pageMenu.url))rows.push({label:label("Luna'da oynat","Play in Luna"),icon:"play",run:()=>onPlay(pageMenu.url)});
    if(pageMenu.text){if(rows.length)rows.push("sep");rows.push({label:label("Seçili metni açıkla","Explain selected text"),icon:"spark",run:()=>selectionAction("explain")},{label:label("Seçili metni çevir","Translate selected text"),icon:"translate",run:()=>selectionAction("translate")},{label:label("Seçili metni notlara ekle","Add selected text to notes"),icon:"book",run:()=>selectionAction("note")});}return rows;
  }
  // ---- history, search engine, session ------------------------------------------------------------
  function commitHistory(rows: WebVisit[]) {
    historyRef.current = rows; setHistory(rows);
    if (!store.set(HISTORY_KEY, JSON.stringify(rows))) store.set(HISTORY_KEY, JSON.stringify(rows.slice(0, 300)));
  }
  const commitRef = useRef(commitHistory); commitRef.current = commitHistory;
  function rememberVisit(id: number, url: string) {
    if (pausedRef.current) return;
    const failed = failedNav.current.get(url);
    if (failed && Date.now() - failed < 15_000) return; // an error page is not a visit
    commitRef.current(recordVisit(historyRef.current, url, titles.current.get(id) || "", Date.now()));
  }
  function retitleVisitFor(id: number) {
    if (pausedRef.current || loadingNow.current.has(id)) return;
    const url = committed.current.get(id), title = titles.current.get(id);
    if (!url || !title) return;
    const next = retitleVisit(historyRef.current, url, title);
    if (next !== historyRef.current) commitRef.current(next);
  }
  const rememberRef = useRef(rememberVisit); rememberRef.current = rememberVisit;
  const retitleRef = useRef(retitleVisitFor); retitleRef.current = retitleVisitFor;
  function forgetFailed(url: string) {
    failedNav.current.set(url, Date.now());
    if (failedNav.current.size > 50) failedNav.current.clear();
    if (pausedRef.current) return;
    const next = forgetFailedVisit(historyRef.current, url, Date.now());
    if (next !== historyRef.current) commitRef.current(next);
  }
  const forgetRef = useRef(forgetFailed); forgetRef.current = forgetFailed;
  function chooseEngine(id: SearchEngineId) { setEngineId(id); store.set(ENGINE_KEY, id); }
  function setPaused(paused: boolean) { setHistoryPaused(paused); store.set(HISTORY_PAUSED_KEY, paused ? "1" : "0"); }
  function hideSite(host: string) { const next = [...hiddenSites.filter(h => h !== host), host].slice(-100); setHiddenSites(next); store.set(HIDDEN_SITES_KEY, JSON.stringify(next)); }
  useEffect(() => {
    // The open tabs are kept for "pick up where you left off"; with history paused nothing is kept.
    if(historyPaused)return;
    if(tabs.length)sessionTouched.current=true;else{if(sessionTouched.current)store.set(SESSION_KEY,"[]");return;}
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(sessionTabs(tabs))); } catch { /* storage full: the next change tries again */ }
  }, [tabs, historyPaused]);
  useEffect(() => {
    const refresh = () => setReadingRows(localList(localStorage, "lunaWebReading", validReading));
    refresh(); window.addEventListener("luna-extras", refresh); return () => window.removeEventListener("luna-extras", refresh);
  }, [selected === null]);
  async function restoreSession() {
    restoringSession.current = true;
    try { for (const t of missingWebTabs(lastSession, tabsRef.current, 8)) { if (!await add(t.url)) break; } }
    finally { restoringSession.current = false; setLastSession([]); }
  }
  async function clearData(what: { history: "none" | "hour" | "today" | "all"; site: boolean; closed: boolean; downloads: boolean }): Promise<string> {
    const done: string[] = [];
    if (what.history !== "none") {
      const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
      const since = what.history === "hour" ? Date.now() - 3_600_000 : what.history === "today" ? midnight.getTime() : 0;
      commitHistory(clearVisitsSince(historyRef.current, since));
      if (what.history === "all") { setLastSession([]); try { localStorage.removeItem(SESSION_KEY); } catch { /* nothing to remove */ } }
      done.push(label("geçmiş", "history"));
    }
    if (what.site) {
      const id = tabsRef.current[0]?.id;
      if (id === undefined) throw Error(label("Site verilerini temizlemek için bir sekme açık olmalı.", "Open a tab to clear site data."));
      await native("browser_action", { id, action: "clear-data" });
      done.push(label("çerezler ve site verileri", "cookies and site data"));
    }
    if (what.closed) { setClosedTabs([]); done.push(label("kapatılan sekmeler", "closed tabs")); }
    if (what.downloads) { await invoke("browser_downloads", { action: "clear" }); done.push(label("indirme listesi", "download list")); }
    return done.length ? label("Temizlendi: ", "Cleared: ") + done.join(", ") + "." : label("Silinecek bir şey seçilmedi.", "Nothing was selected.");
  }
  // ---- address suggestions -------------------------------------------------------------------------
  const suggestions = useMemo(() => focusSource && addressEdited
    ? webSuggestions(address, { tabs: tabs.filter(t => t.id !== selected), bookmarks, history }, engine, Date.now(), lang() === "tr") : [],
  [focusSource, addressEdited, address, tabs, selected, bookmarks, history, engine]);
  function removeSuggestion(s: Suggestion) { if (s.kind === "history") commitHistory(removeVisit(historyRef.current, s.url)); }
  function pickSuggestion(s: Suggestion) {
    setAddressEdited(false); setSuggestAt(-1);
    if (s.kind === "tab") { chooseTab(s.id); return; }
    if (s.kind === "bang") {
      if (s.query) void action("navigate", "!" + s.key + " " + s.query);
      else { addressDirty.current = true; setAddress("!" + s.key + " "); setAddressEdited(true); }
      return;
    }
    void action("navigate", s.kind === "search" ? engineRef.current.search(s.query) : s.url);
  }
  /** Arrow keys, Enter on a chosen row, Shift+Delete on a history row, Esc to close. True when the key was used. */
  function suggestKeys(e: ReactKeyboardEvent<HTMLInputElement>): boolean {
    if (e.nativeEvent.isComposing || composing.current) return false;
    const n = suggestions.length, chosenRow = suggestAt >= 0 ? suggestions[suggestAt] : undefined;
    if (n && (e.key === "ArrowDown" || e.key === "ArrowUp")) { e.preventDefault(); setSuggestAt(i => e.key === "ArrowDown" ? (i + 1 >= n ? -1 : i + 1) : (i <= -1 ? n - 1 : i - 1)); return true; }
    if (chosenRow && e.key === "Enter") { e.preventDefault(); pickSuggestion(chosenRow); return true; }
    if (chosenRow?.kind === "history" && e.key === "Delete" && e.shiftKey) { e.preventDefault(); removeSuggestion(chosenRow); setSuggestAt(-1); return true; }
    if (n && e.key === "Escape") { e.preventDefault(); setAddressEdited(false); setSuggestAt(-1); return true; }
    return false;
  }
  const suggestList = <SuggestList items={suggestions} active={suggestAt} pick={pickSuggestion} hover={setSuggestAt} remove={removeSuggestion}/>;
  const topList = useMemo(() => selected === null ? topSites(history, Date.now(), 8, hiddenSites) : [], [selected === null, history, hiddenSites]);
  const restoreList = selected === null ? missingWebTabs(lastSession, tabs, 8) : [];
  function openReadingFrom(url: string, progress: number) { pendingScroll.current = { id: null, url, progress }; void action("navigate", url); }
  // ---- find in page --------------------------------------------------------------------------------
  function closeFind() {
    findSeq.current++;
    const id = findTab.current; findTab.current = null;
    setFindOpen(false); setFindResult(null); setFindBusy(false);
    if (id !== null && known.current.has(id)) void native("browser_find", { id, action: "clear" }).catch(() => {});
  }
  async function runFind(step: "find" | "next" | "prev") {
    if (selected === null || !isTauri()) return;
    const id = selected, seq = ++findSeq.current;
    if (!findQuery.trim()) { setFindResult(null); setFindBusy(false); if (findTab.current === id) void native("browser_find", { id, action: "clear" }).catch(() => {}); return; }
    findTab.current = id; setFindBusy(true);
    try {
      const result = await native<FindResult>("browser_find", { id, action: step, query: findQuery, matchCase: findCase });
      if (seq === findSeq.current && alive.current) setFindResult(result);
    } catch (e) { if (seq === findSeq.current && alive.current) { setFindResult({ count: 0, index: 0, capped: false }); dlog("find error", String((e as any)?.message ?? e)); } }
    finally { if (seq === findSeq.current && alive.current) setFindBusy(false); }
  }
  useEffect(() => {
    if (!findOpen) return;
    const timer = window.setTimeout(() => void runFind("find"), 180);
    return () => clearTimeout(timer);
  }, [findOpen, findQuery, findCase]);
  function openFind() {
    if (selected === null) return;
    setToolsOpen(false);
    if (findOpen) requestAnimationFrame(() => document.querySelector<HTMLInputElement>(".web-find input")?.select());
    else setFindOpen(true);
  }
  // ---- reading view ---------------------------------------------------------------------------------
  async function openReader() {
    if (selected === null || readerBusy || !current) return;
    const id = selected, url = current.url;
    setReaderBusy(true); setError(""); setToolsOpen(false);
    try { const page = await capturePage(true); if (alive.current && chosen.current === id) setReader({ page, url }); }
    catch (e) { if (chosen.current === id) showError(e); }
    finally { if (alive.current) setReaderBusy(false); }
  }
  function saveReading(url: string, title: string) {
    try {
      const rows = browserRows(localStorage, "lunaWebReading", validReading), old = rows.find(r => r.url === url);
      putExtra("lunaWebReading", mergeReadingEntry(rows, { url, title: title || hostOf(url), progress: old?.progress ?? 0, done: false, at: Date.now() }));
      setBrowserNotice(label("Okuma listesine eklendi.", "Added to your reading queue."));
    } catch (e) { showError(e); }
  }
  // ---- tabs: mute, reload, play in Luna, menu, drag --------------------------------------------------
  function toggleMute(id: number, on?: boolean) {
    const muted = on ?? !mutedTabs.includes(id);
    const origin=siteOrigin(tabsRef.current.find(t=>t.id===id)?.url||"");
    void native("browser_action", { id, action: muted ? "mute" : "unmute" })
      .then(() => { if (alive.current && known.current.has(id)) {tabMuteChoice.current.set(id,{origin,muted});setMutedTabs(m => muted ? [...new Set([...m, id])] : m.filter(x => x !== id));} })
      .catch(showError);
  }
  function reloadTab(id: number) { stopping.current.delete(id); revisions.current.set(id, (revisions.current.get(id) || 0) + 1); void native("browser_action", { id, action: "reload" }).catch(showError); }
  function playInLuna(tab: { id: number; url: string }) {
    if (!onPlay) return;
    onPlay(tab.url);
    // The page may still be playing the same video: silence it while Luna plays (Ctrl+M or the badge turns it back on).
    if (!mutedTabs.includes(tab.id)) { toggleMute(tab.id, true); setBrowserNotice(label("Luna oynatıyor; sayfanın sesi kapatıldı.", "Luna is playing it; the page was muted.")); }
  }
  async function closeMany(ids: number[]) { for (const id of ids) await closeTab(id); }
  function togglePin(id: number) {
    const result = pinTab(tabsRef.current, pinnedRef.current, id, !pinnedRef.current.has(id));
    setPinned(result.pinned); setTabs(result.tabs);
  }
  function tabMenuItems(id: number): TabMenuItem[] {
    const list = tabsRef.current, tab = list.find(t => t.id === id);
    if (!tab) return [];
    const at = list.indexOf(tab), muted = mutedTabs.includes(id), full = list.length >= 8 || creating, canPlay = !!onPlay && !!playableInLuna(tab.url);
    const items: TabMenuItem[] = [
      { label: pinned.has(id) ? label("Sabitlemeyi kaldır", "Unpin tab") : label("Sekmeyi sabitle", "Pin tab"), icon: "pin", run: () => togglePin(id) },
      { label: label("Yenile", "Reload"), icon: "reload", hint: "F5", run: () => reloadTab(id) },
      { label: label("Sekmeyi çoğalt", "Duplicate tab"), icon: "duplicate", disabled: full, run: () => void add(tab.url) },
      { label: muted ? label("Sekmenin sesini aç", "Unmute tab") : label("Sekmeyi sessize al", "Mute tab"), icon: muted ? "speaker" : "muted", hint: id === chosen.current ? "Ctrl+M" : undefined, run: () => toggleMute(id) },
    ];
    if (canPlay) items.push({ label: label("Luna'da oynat", "Play in Luna"), icon: "play", run: () => playInLuna(tab) });
    items.push("sep",
      { label: bookmarks.some(b => b.url === tab.url) ? label("Favorilerden çıkar", "Remove favourite") : label("Favorilere ekle", "Add to favourites"), icon: "star", hint: id === chosen.current ? "Ctrl+D" : undefined, run: () => bookmark(tab) },
      { label: label("Bağlantıyı kopyala", "Copy link"), icon: "copy", run: () => void copyAssistantText(tab.url).then(() => { if (alive.current) setBrowserNotice(label("Sayfa bağlantısı kopyalandı.", "Page link copied.")); }).catch(showError) },
      { label: label("Dış tarayıcıda aç", "Open in your browser"), icon: "external", run: () => { openUrl(tab.url).catch(showError); } },
      "sep",
      { label: label("Sola taşı", "Move left"), disabled: at <= 0, run: () => setTabs(rows => stepTab(rows, id, -1, pinnedRef.current)) },
      { label: label("Sağa taşı", "Move right"), disabled: at >= list.length - 1, run: () => setTabs(rows => stepTab(rows, id, 1, pinnedRef.current)) },
      "sep",
      { label: label("Sekmeyi kapat", "Close tab"), icon: "close", hint: id === chosen.current ? "Ctrl+W" : undefined, run: () => void closeTab(id) },
      { label: label("Diğer sekmeleri kapat", "Close other tabs"), disabled: list.length < 2, run: () => void closeMany(list.filter(t => t.id !== id && !pinnedRef.current.has(t.id)).map(t => t.id)) },
      { label: label("Sağdaki sekmeleri kapat", "Close tabs to the right"), disabled: at >= list.length - 1, run: () => void closeMany(list.slice(at + 1).filter(t => !pinnedRef.current.has(t.id)).map(t => t.id)) },
    );
    if (closedTabs.length) items.push("sep", { label: label("Kapatılan sekmeyi geri aç", "Reopen closed tab"), icon: "reload", hint: "Ctrl+Shift+T", disabled: full, run: () => void reopenClosed() });
    return items;
  }
  /** Pointer-based reordering: HTML drag and drop is taken over by the window's file-drop handler. */
  function startTabDrag(e: ReactPointerEvent<HTMLElement>, id: number) {
    if (e.button !== 0) return;
    dragCleanup.current?.();
    dragState.current = { id, x: e.clientX, active: false };
    const move = (ev: PointerEvent) => {
      const d = dragState.current; if (!d) return;
      if (!d.active && Math.abs(ev.clientX - d.x) < 6) return;
      d.active = true; document.body.classList.add("web-tab-dragging");
      const over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>("[data-tab-id]"), target = over ? Number(over.dataset.tabId) : NaN;
      if (Number.isFinite(target) && target !== d.id) setTabs(rows => dropTab(rows, d.id, target, rows.findIndex(t => t.id === d.id) < rows.findIndex(t => t.id === target) ? "after" : "before", pinnedRef.current));
    };
    const up = () => {
      document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); document.removeEventListener("pointercancel", up);
      document.body.classList.remove("web-tab-dragging");
      if (dragState.current?.active) { justDragged.current = true; window.setTimeout(() => { justDragged.current = false; }, 60); }
      dragState.current = null; dragCleanup.current = null;
    };
    dragCleanup.current = up;
    document.addEventListener("pointermove", move); document.addEventListener("pointerup", up); document.addEventListener("pointercancel", up);
  }
  // ---- shortcuts (the same names arrive from the page through the native key hook) --------------------
  function runShortcut(name: string): boolean {
    const digit = /^ctrl\+([1-9])$/.exec(name);
    if (digit) { const at = digit[1] === "9" ? tabs.length - 1 : Number(digit[1]) - 1; if (tabs[at]) { chooseTab(tabs[at].id); return true; } return false; }
    switch (name) {
      case "ctrl+k": setToolsOpen(false); setPaletteOpen(true); return true;
      case "ctrl+l": case "f6": addressInput.current?.focus(); addressInput.current?.select(); return true;
      case "ctrl+shift+a": setToolsOpen(false); setWorkspaceOpen(true); return true;
      case "ctrl+d": if (!current) return false; bookmark(); return true;
      case "ctrl+shift+t": void reopenClosed(); return true;
      case "ctrl+t": chooseTab(null); requestAnimationFrame(() => addressInput.current?.focus()); return true;
      case "ctrl+w": if (chosen.current === null) return false; void closeTab(chosen.current); return true;
      case "ctrl+tab": case "ctrl+shift+tab": {
        const list = tabsRef.current; if (!list.length) return false;
        const at = list.findIndex(t => t.id === chosen.current), step = name.includes("shift") ? -1 : 1;
        chooseTab(list[((at < 0 ? (step > 0 ? -1 : 0) : at) + step + list.length) % list.length].id); return true;
      }
      case "ctrl+f": if (!current) return false; openFind(); return true;
      case "ctrl+h": setToolsOpen(false); setHistoryOpen(true); return true;
      case "ctrl+shift+delete": setToolsOpen(false); setClearOpen(true); return true;
      case "f9": case "ctrl+shift+r": if (!current) return false; void openReader(); return true;
      case "ctrl+m": if (!current) return false; toggleMute(current.id); return true;
      case "ctrl+j": setManager("downloads"); return true;
      case "ctrl+pageup": case "ctrl+pagedown": case "ctrl+shift+pageup": case "ctrl+shift+pagedown": {
        const list = tabsRef.current, id = chosen.current; if (!list.length) return false;
        const step = name.endsWith("pageup") ? -1 : 1;
        if (name.includes("shift")) { if (id !== null) setTabs(rows => stepTab(rows, id, step, pinnedRef.current)); }
        else { const at = list.findIndex(t => t.id === id); chooseTab(list[(at + step + list.length) % list.length].id); }
        return true;
      }
      case "f1": case "ctrl+/": case "ctrl+shift+/": case "ctrl+shift+?": setToolsOpen(false); setKeysOpen(true); return true;
      case "alt+home": chooseTab(null); return true;
    }
    return false;
  }
  const shortcutRef = useRef(runShortcut); shortcutRef.current = runShortcut;
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
      // A shortcut pressed while the page had the keyboard: bring Luna's own UI forward, then run it.
      if(e.kind==="fullscreen"){setFullTabs(old=>{const next=new Set(old);if(e.value==="1")next.add(e.id);else next.delete(e.id);return next;});return;}
      if(e.kind==="context"){
        if(chosen.current!==e.id||!shown.current)return;
        try{const data=JSON.parse(e.value),tab=tabsRef.current.find(t=>t.id===e.id);if(!tab||data.page!==tab.url)return;
          let url="";try{if(data.url)url=browserAddress(data.url);}catch{}
          const text=typeof data.text==="string"?data.text.slice(0,8000):"";if(!url&&!text)return;
          const r=slot.current?.getBoundingClientRect(),dpr=window.devicePixelRatio||1;
          const x=r?r.left+Number(data.x)/dpr:20,y=r?r.top+Number(data.y)/dpr:100;
          if(!Number.isFinite(x)||!Number.isFinite(y))return;
          setMenu(null);setPageMenu({id:e.id,revision:revisions.current.get(e.id)||0,url,text,page:tab.url,x,y});void getCurrentWebview().setFocus().catch(()=>{});
        }catch{}return;
      }
      if (e.kind === "key") { if (chosen.current === e.id) void getCurrentWebview().setFocus().catch(() => {}).then(() => shortcutRef.current(e.value)); return; }
      if (e.kind === "navigate" || e.kind === "loading") { if(chosen.current===e.id){selectedText.current=null;setPageMenu(null);} loadingNow.current.add(e.id); titles.current.delete(e.id); }
      if (e.kind === "title") { titles.current.set(e.id, e.value.trim()); retitleRef.current(e.id); }
      if (e.kind === "loaded") { committed.current.set(e.id, e.value); if(selectedText.current?.id===e.id&&selectedText.current.page.url!==e.value)selectedText.current=null;
        const origin=siteOrigin(e.value),pref=prefsRef.current[origin],choice=tabMuteChoice.current.get(e.id);const muted=choice?.origin===origin?choice.muted:pref?.muted??false;void native("browser_action",{id:e.id,action:muted?"mute":"unmute"},()=>alive.current&&known.current.has(e.id)&&committed.current.get(e.id)===e.value).then(()=>{if(alive.current)setMutedTabs(old=>muted?[...new Set([...old,e.id])]:old.filter(id=>id!==e.id));}).catch(()=>{});
        loadingNow.current.delete(e.id); rememberRef.current(e.id, e.value);
        const want = zoomFor(zoomMemory.current, e.value);
        void native("browser_action", { id: e.id, action: "zoom", zoom: want }, () => alive.current && known.current.has(e.id) && committed.current.get(e.id) === e.value).then(() => { if (alive.current && committed.current.get(e.id) === e.value) setTabNative(m => patchNative(m, e.id, { zoom: want })); }).catch(() => {});
      }
      if (e.kind === "navigate" || e.kind === "loading") {
        revisions.current.set(e.id, (revisions.current.get(e.id) || 0) + 1);
        if (chosen.current === e.id) invalidator.current();
        if (chosen.current === e.id) setTranslationNote("");
      }
      if(e.kind === "loaded" && pendingScroll.current?.url === e.value && pendingScroll.current.id===e.id){const pending=pendingScroll.current;pendingScroll.current=null;void native("browser_position",{id:e.id,action:"scroll",expectedUrl:e.value,fraction:pending.progress}).catch(showError);}
      if(e.kind==="loaded" && pendingScroll.current?.id===e.id && pendingScroll.current.url!==e.value)pendingScroll.current=null;
      if (e.kind === "popup") { const tab=tabsRef.current.find(t=>t.id===e.id),pref=prefsRef.current[siteOrigin(tab?.url||"")];if(pref?.popups==="block")return;if(pref?.popups==="tab"&&chosen.current===e.id&&shown.current){void addRef.current(e.value);return;} if(chosen.current===e.id)setPopup({id:e.id,url:e.value}); return; }
      if (e.kind !== "title" && e.kind !== "history") dlog("event", e.id, e.kind);
      if (e.kind === "download-rejected") {showError(e.value);return;}
      if (e.kind === "download-start") {const back=committed.current.get(e.id);setTabs(ts=>ts.map(t=>t.id===e.id?{...t,url:back??t.url,loading:false}:t));setBrowserNotice(label("İndirme başladı. Araçlar › İndirmeler bölümünden yönetebilirsin.","Download started. Manage it in Tools › Downloads."));return;}
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
        // History bookkeeping does not wait for the tab state: a failed address is never a visit, a loaded one is again allowed.
        if (done) { if (done.ok) failedNav.current.delete(done.url); else if (!stopping.current.has(e.id)) forgetRef.current(done.url); }
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
      for (const id of known.current) void native("browser_action", { id, action: "close", force: true }).catch(() => {});
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
      const chatElement = Array.from(document.querySelectorAll<HTMLElement>(".chat-panel,.browser-tools-pop,.browser-suggest,.browser-tab-menu")).find(el=>el.getClientRects().length>0);
      const chat = chatElement?.getBoundingClientRect();
      const extraOverlays=Array.from(document.querySelectorAll<HTMLElement>(".chat-panel,.browser-tools-pop,.browser-suggest,.browser-tab-menu")).filter(el=>el!==chatElement&&el.getClientRects().length).slice(0,7).map(el=>{const r=el.getBoundingClientRect(),dpr=window.devicePixelRatio;return{x:Math.round((r.left-6)*dpr),y:Math.round((r.top-6)*dpr),width:Math.ceil((r.width+12)*dpr),height:Math.ceil((r.height+12)*dpr),radius:14*dpr};});
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
      const bubbleBounds = visible && selected !== null && bubble && bubble.width>0 ? {
        visible: true, x: Math.max(0, Math.round((bubble.left - 8) * dpr)), y: Math.max(0, Math.round((bubble.top - 8) * dpr)), size: bubbleSize,
        color: getComputedStyle(document.documentElement).getPropertyValue("--accent").trim(),
      } : { visible: false };
      const signature = JSON.stringify([selected, bounds, [...known.current], bubbleBounds,extraOverlays]);
      if (last === signature) return; last = signature; busy = true;
      const cover = document.querySelector('.modal-bg,.chat-ws,.menu-pop,.card-menu,.bk-reader,.mu-np,[role="dialog"]:not(.browser-tools-pop)');
      dlog("layer", { selected, visible, covered: cover ? cover.className || cover.tagName : null, cut: chatElement?.className ?? null, bounds, bubble: bubbleBounds, tabs: [...known.current], dpr });
      try {
        for (const id of known.current) {
          if (id === selected && bounds) await native("browser_bounds", { id, ...bounds,overlays:extraOverlays });
          else await native("browser_action", { id, action: "hide" });
        }
        await native("browser_bubble", bubbleBounds);
      } catch (e) { last = ""; dlog("layer error", String((e as any)?.message ?? e)); showError(e); } finally { busy = false; }
    };
    const interval = active ? window.setInterval(place, 160) : 0; void place();
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
    const name = shortcutName(e);
    if (name === "ctrl+l") { e.preventDefault(); runShortcut(name); return; }
    if (inChat) return;
    if(e.key==="Escape"&&toolsOpen){e.preventDefault();setToolsOpen(false);document.querySelector<HTMLButtonElement>(".browser-tools-toggle")?.focus();return;}
    if(e.key==="Escape"&&findOpen&&!el?.closest?.(".web-find")){e.preventDefault();closeFind();return;}
    if (name && runShortcut(name)) { e.preventDefault(); return; }
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
  function webCommands(): PaletteCommand[] {
    const command = (id: string, title: string, run: () => void, icon: PaletteCommand["icon"] = "command"): PaletteCommand => ({ id, title, icon, group: "Luna Web", run });
    return [
      command("new", label("Yeni sekme", "New tab"), () => chooseTab(null), "plus"),
      command("history", label("Geçmiş", "History"), () => setHistoryOpen(true), "history"),
      command("downloads", label("İndirmeler", "Downloads"), () => setManager("downloads"), "download"),
      command("extensions", label("Eklentileri yönet", "Manage extensions"), () => setManager("extensions"), "grid"),
      command("clear", label("Gezinme verilerini temizle", "Clear browsing data"), () => setClearOpen(true), "trash"),
      command("assistant", label("Luna Asistan", "Luna Assistant"), () => onAssistant?.(), "spark"),
      ...(current ? [command("reader", label("Okuma görünümü", "Reading view"), () => { void openReader(); }, "book"), command("find", label("Sayfada bul", "Find in page"), openFind, "find"), command("pin", pinned.has(current.id) ? label("Sabitlemeyi kaldır", "Unpin tab") : label("Sekmeyi sabitle", "Pin tab"), () => togglePin(current.id), "pin")] : []),
      ...tabs.map(tab => ({ ...command("tab:"+tab.id, tab.title, () => chooseTab(tab.id), "globe"), group: label("Açık sekmeler", "Open tabs"), detail: tab.url })),
      ...bookmarks.map(book => ({ ...command("bookmark:"+book.url, book.title, () => { void action("navigate", book.url); }, "star"), group: label("Favoriler", "Favourites"), detail: book.url })),
      ...history.slice(0, 100).map(visit => ({ ...command("history:"+visit.url, visit.title, () => { void action("navigate", visit.url); }, "clock"), group: label("Geçmiş", "History"), detail: visit.url })),
    ];
  }
  const insecure = !!current && current.url.startsWith("http:") && !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(current.url);
  const showPretty = !!current && focusSource !== "bar" && address === current.url, searchWords = current ? searchedWords(current.url) : null, pretty = current ? prettyAddress(current.url) : null;
  return <section className={"browser-shell" + (!current ? " is-start" : "") + (cinema?" is-cinema":"")} hidden={!active} aria-label="Luna Web">
    {workspaceOpen&&<BrowserWorkspace tabs={tabs} selected={selected} select={chooseTab} move={(id,direction)=>setTabs(rows=>moveWebTab(rows,id,direction))} closeTab={closeTab} closed={closedTabs} reopen={reopenClosed} add={add} close={()=>setWorkspaceOpen(false)} bookmarks={bookmarks} saveBookmarks={rows=>{localStorage.setItem("lunaWebBookmarks",JSON.stringify(rows));setBookmarks(rows);}}/>}
    {cinema&&<div className="browser-cinema-bar"><span>{current?.title}</span><button className="chip" onClick={()=>{setFocusMode(false);if(fullscreen&&current)void native("browser_action",{id:current.id,action:"exit-fullscreen"}).catch(showError);}}>{label("İzleme görünümünden çık","Exit watch view")}</button></div>}
    <div className="browser-chrome">
      <div className="browser-tabstrip">
        <div className="browser-tabs" role="tablist" aria-label={label("Web sekmeleri", "Web tabs")} ref={tabStrip} onKeyDown={e=>{if(e.shiftKey && e.key==="F10"){const tab=(e.target as Element).closest<HTMLElement>('[data-tab-id]');if(tab){e.preventDefault();const rect=tab.getBoundingClientRect();setMenu({id:Number(tab.dataset.tabId),x:rect.left,y:rect.bottom});return;}}if(!(e.target as Element).matches('[role="tab"]')||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const ids=[null,...tabs.map(t=>t.id)],at=ids.indexOf(selected);const next=e.key==='Home'?0:e.key==='End'?ids.length-1:(at+(e.key==='ArrowRight'?1:-1)+ids.length)%ids.length;chooseTab(ids[next]);requestAnimationFrame(()=>tabStrip.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus());}}>
          <button className={"browser-start-tab" + (selected === null ? " on" : "")} role="tab" tabIndex={selected===null?0:-1} aria-selected={selected === null} onClick={() => chooseTab(null)}><WebIcon name="home" size={14}/>{label("Başlangıç", "Start page")}</button>
          {tabs.map(t => <div className={"browser-tab" + (selected === t.id ? " on" : "") + (mutedTabs.includes(t.id) ? " is-muted" : "") + (pinned.has(t.id) ? " is-pinned" : "")} key={t.id} data-tab-id={t.id} onPointerDown={e => { if (!(e.target as Element).closest(".browser-tab-close,.browser-tab-mute")) startTabDrag(e, t.id); }} onContextMenu={e => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, id: t.id }); }}><button role="tab" tabIndex={selected===t.id?0:-1} onAuxClick={e=>{if(e.button===1){e.preventDefault();void closeTab(t.id);}}} onMouseDown={e=>{if(e.button===1)e.preventDefault();}} aria-selected={selected === t.id} onClick={() => { if (!justDragged.current) chooseTab(t.id); }} title={t.title + "\n" + t.url}><SiteIcon url={t.url} loading={t.loading}/><span>{t.title}</span></button>{(tabNative[t.id]?.audio || mutedTabs.includes(t.id)) && <button className={"browser-tab-audio browser-tab-mute" + (mutedTabs.includes(t.id) ? " on" : "")} aria-pressed={mutedTabs.includes(t.id)} aria-label={mutedTabs.includes(t.id) ? label(t.title + " sekmesinin sesini aç", "Unmute " + t.title) : label(t.title + " sekmesini sessize al", "Mute " + t.title)} title={mutedTabs.includes(t.id) ? label("Sessizde · sesi aç (Ctrl+M)", "Muted · click to unmute (Ctrl+M)") : label("Ses çalıyor · sessize al (Ctrl+M)", "Playing audio · click to mute (Ctrl+M)")} onClick={() => toggleMute(t.id)}><WebIcon name={mutedTabs.includes(t.id) ? "muted" : "speaker"} size={13}/></button>}<button className="browser-tab-close" aria-label={label(t.title + " sekmesini kapat", "Close " + t.title)} onClick={() => closeTab(t.id)}><WebIcon name="close" size={12}/></button></div>)}
          <button className="browser-new" onClick={() => { setSelected(null); addressInput.current?.focus(); }} disabled={creating || tabs.length >= 8} aria-label={label("Yeni sekme", "New tab")} title={label("Yeni sekme · Ctrl+T", "New tab · Ctrl+T")}><WebIcon name="plus" size={16}/></button>
        </div>
        <button className="browser-return" onClick={onClose} title={label("Kütüphaneye dön", "Back to library")}><WebIcon name="film" size={14}/><span>{label("Kütüphanem", "My library")}</span><WebIcon name="external" size={12}/></button>
      </div>
      <div className="browser-toolbar">
        <div className="browser-nav"><button aria-label={label("Geri", "Back")} title={label("Geri", "Back")} disabled={!current || !nowNative.canBack} onClick={() => action("back")}><WebIcon name="back"/></button><button aria-label={label("İleri", "Forward")} title={label("İleri", "Forward")} disabled={!current || !nowNative.canForward} onClick={() => action("forward")}><WebIcon name="forward"/></button>{current?.loading
              ? <button aria-label={label("Yüklemeyi durdur", "Stop loading")} title={label("Yüklemeyi durdur", "Stop loading")} onClick={stopLoading}><WebIcon name="close" size={16}/></button>
              : <button aria-label={label("Yenile", "Reload")} title={label("Yenile", "Reload")} disabled={!current} onClick={() => action("reload")}><WebIcon name="reload" size={16}/></button>}</div>
        <div className="browser-address-wrap"><form className={"browser-address" + (showPretty ? " is-pretty" : "") + (insecure ? " is-insecure" : "")} role="search" onSubmit={e => { e.preventDefault(); addressDirty.current = false; setAddressEdited(false); void action("navigate", address); }}>
          <WebIcon name={insecure ? "warning" : current?.url.startsWith("https:") ? "lock" : "search"} size={15}/>
          <input ref={addressInput} role="combobox" aria-autocomplete="list" aria-expanded={focusSource === "bar" && suggestions.length > 0} aria-controls="browser-suggest" aria-activedescendant={focusSource === "bar" && suggestAt >= 0 ? "browser-suggest-" + suggestAt : undefined}
            aria-label={label("Web adresi veya arama", "Web address or search")} placeholder={label("Bir adres yaz veya web’de ara", "Search the web or enter an address")} value={address}
            onChange={e => { addressDirty.current = true; setAddress(e.target.value); setAddressEdited(true); setSuggestAt(-1); }}
            onFocus={e => { setFocusSource("bar"); focusSelect.current = true; e.currentTarget.select(); }} onMouseUp={e => { if (focusSelect.current) { e.preventDefault(); focusSelect.current = false; } }}
            onBlur={() => { focusSelect.current = false; setFocusSource(null); setAddressEdited(false); setSuggestAt(-1); }}
            onKeyDown={e => { if (e.key === "Enter" && e.altKey && address.trim() && !e.nativeEvent.isComposing && !composing.current) { e.preventDefault(); addressDirty.current = false; setAddressEdited(false); setSuggestAt(-1); void add(address); return; } if (suggestKeys(e)) return; if (e.key === "Escape" && current && !composing.current && !e.nativeEvent.isComposing) { e.preventDefault(); addressDirty.current = false; setAddress(current.url); e.currentTarget.select(); } }}
            onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} autoComplete="off" spellCheck={false}/>
          {showPretty && <span className="browser-address-view" aria-hidden="true">{searchWords ? <><b>{searchWords}</b><i>{hostOf(current!.url)}</i></> : pretty ? <><b>{pretty.host}</b><i>{pretty.rest}</i></> : null}</span>}
          {!current && <kbd>Ctrl L</kbd>}
          {current && nowNative.zoom !== 1 && <button type="button" className="browser-zoom-chip" aria-label={label(`Yakınlaştırma %${Math.round(nowNative.zoom * 100)}; sıfırlamak için tıkla`, `Zoom ${Math.round(nowNative.zoom * 100)}%; click to reset`)} title={label("Yakınlaştırmayı sıfırla · Ctrl+0", "Reset zoom · Ctrl+0")} onClick={() => setPageZoom(1)}>{Math.round(nowNative.zoom * 100)}%</button>}
          {current && <button type="button" disabled={readerBusy} aria-label={label("Okuma modu", "Reading view")} title={label("Okuma modu · Ctrl+Shift+R", "Reading view · Ctrl+Shift+R")} onClick={() => void openReader()}><WebIcon name="reader" size={16}/></button>}
          {current && <button type="button" className={bookmarks.some(b => b.url === current.url) ? "saved" : ""} aria-label={label("Yer imini değiştir", "Toggle bookmark")} title={label("Yer imi · Ctrl+D", "Bookmark · Ctrl+D")} onClick={() => bookmark()}><WebIcon name="star" size={16}/></button>}
          <button type="submit" aria-label={label("Adrese git", "Go")}><WebIcon name="arrow" size={16}/></button></form>
          {focusSource === "bar" && suggestions.length > 0 && suggestList}</div>
        {current && onPlay && playableInLuna(current.url) && <button className="browser-play-luna" title={label("Bu sayfayı Luna'nın kendi oynatıcısında aç", "Open this in Luna's own player")} onClick={() => playInLuna(current)}><WebIcon name="play" size={13}/><span>{label("Luna'da oynat", "Play in Luna")}</span></button>}
        <div className="browser-tools-anchor"><button className={"browser-tools-toggle" + (toolsOpen ? " on" : "")} aria-label={label("Sayfa araçları", "Page tools")} aria-expanded={toolsOpen} title={label("Çeviri ve sayfa araçları", "Translation and page tools")} onClick={() => setToolsOpen(v => !v)}><WebIcon name="translate" size={18}/><span>{label("Araçlar", "Tools")}</span></button>
          {toolsOpen && <div className="browser-tools-pop extra-browser-tools" role="dialog" aria-label={label("Sayfa araçları", "Page tools")}>
            <button className="browser-menu-action" disabled={!current} onClick={()=>{setToolsOpen(false);setSiteSettings(true);}}><WebIcon name="settings" size={17}/>{label("Bu sitenin tercihleri","Site preferences")}</button><button className="browser-menu-action" disabled={!current} onClick={()=>{setToolsOpen(false);setFocusMode(true);}}><WebIcon name="film" size={17}/>{label("İzleme görünümü","Watch view")}</button>
            <button className="browser-menu-action" onClick={()=>{setToolsOpen(false);setManager("extensions");}}><WebIcon name="plus" size={17}/>{label("Eklentileri yönet","Manage extensions")}</button>
            <button className="browser-menu-action" onClick={()=>{setToolsOpen(false);setManager("downloads");}}><WebIcon name="external" size={17}/>{label("İndirmeler","Downloads")}{downloadCount>0&&<small>{downloadCount} {label("devam ediyor","in progress")}</small>}</button><hr/>
            <button className="browser-menu-action" disabled={!current} onClick={() => openFind()}><WebIcon name="find" size={17}/>{label("Sayfada bul", "Find in page")}<small>Ctrl+F</small></button>
            <button className="browser-menu-action" disabled={!current || readerBusy} onClick={() => void openReader()}><WebIcon name="reader" size={17}/>{label("Okuma modu", "Reading view")}<small>Ctrl+Shift+R</small></button>
            <button className="browser-menu-action" disabled={!current} onClick={() => { setToolsOpen(false); if (current) toggleMute(current.id); }}><WebIcon name={current && mutedTabs.includes(current.id) ? "speaker" : "muted"} size={17}/>{current && mutedTabs.includes(current.id) ? label("Sekmenin sesini aç", "Unmute tab") : label("Sekmeyi sessize al", "Mute tab")}<small>Ctrl+M</small></button>
            <button className="browser-menu-action" disabled={!current} onClick={() => { setToolsOpen(false); if (current) void native("browser_action", { id: current.id, action: "print" }).catch(showError); }}><WebIcon name="print" size={17}/>{label("Yazdır", "Print")}</button>
            <button className="browser-menu-action" onClick={() => { setToolsOpen(false); setHistoryOpen(true); }}><WebIcon name="history" size={17}/>{label("Geçmiş", "History")}<small>Ctrl+H</small></button>
            <button className="browser-menu-action" onClick={() => { setToolsOpen(false); setClearOpen(true); }}><WebIcon name="trash" size={17}/>{label("Gezinme verilerini temizle", "Clear browsing data")}<small>Ctrl+Shift+Del</small></button>
            <button className="browser-menu-action" onClick={() => { setToolsOpen(false); setKeysOpen(true); }}><WebIcon name="keyboard" size={17}/>{label("Klavye kısayolları", "Keyboard shortcuts")}<small>Ctrl+/</small></button><hr/>
            <button className="browser-menu-action" onClick={()=>{setToolsOpen(false);setWorkspaceOpen(true);}}><WebIcon name="book" size={17}/>{label("Sekmeler ve favoriler","Tabs and favourites")}</button><button className="browser-menu-action" disabled={!closedTabs.length||creating||tabs.length>=8} onClick={()=>{setToolsOpen(false);void reopenClosed();}}><WebIcon name="reload" size={17}/>{label("Kapatılan sekmeyi geri aç","Reopen closed tab")}<small>Ctrl+Shift+T</small></button><button className="browser-menu-action" disabled={!current||creating||tabs.length>=8} onClick={()=>{setToolsOpen(false);if(current)void add(current.url);}}><WebIcon name="plus" size={17}/>{label("Sekmeyi çoğalt","Duplicate tab")}</button><button className="browser-menu-action" disabled={!current} onClick={()=>{setToolsOpen(false);if(current)void copyAssistantText(current.url).then(()=>{if(alive.current)setBrowserNotice(label("Sayfa bağlantısı kopyalandı.","Page link copied."));}).catch(showError);}}><WebIcon name="external" size={17}/>{label("Sayfa bağlantısını kopyala","Copy page link")}</button><hr/><div className="browser-pop-head"><b>{label("Bu sayfa", "This page")}</b><button aria-label={label("Kapat", "Close")} onClick={() => setToolsOpen(false)}><WebIcon name="close" size={15}/></button></div><label className="browser-language-label">{label("Çeviri dili", "Translate into")}<select aria-label={label("Sayfa çeviri dili", "Page translation language")} value={targetLanguage} onChange={e => {setTargetLanguage(e.target.value);try{localStorage.setItem("lunaWebTranslationLanguage",e.target.value);}catch(e){showError(e);}}}>{TRANSLATION_LANGUAGES.map(language => <option key={language}>{language}</option>)}</select></label><button className="browser-menu-action" disabled={!current || translating} onClick={() => { setToolsOpen(false); void translatePage(targetLanguage).catch(showError); }}><WebIcon name="translate" size={17}/>{translating ? label("Çevriliyor…", "Translating…") : label("Sayfayı çevir", "Translate page")}</button><button className="browser-menu-action" disabled={!current || translating} onClick={() => { setToolsOpen(false); void translatePage("restore").catch(showError); }}><WebIcon name="reload" size={17}/>{label("Özgün sayfaya dön", "Restore original")}</button><hr/><div className="browser-zoom-row" role="group" aria-label={label("Sayfa yakınlığı", "Page zoom")}><button disabled={!current} aria-label={label("Uzaklaştır", "Zoom out")} title="Ctrl -" onClick={() => zoomBy(-1)}>−</button><output aria-live="polite">{Math.round(nowNative.zoom * 100)}%</output><button disabled={!current} aria-label={label("Yakınlaştır", "Zoom in")} title="Ctrl +" onClick={() => zoomBy(1)}>+</button><button disabled={!current || nowNative.zoom === 1} onClick={() => setPageZoom(1)}>{label("Sıfırla", "Reset")}</button></div><hr/><button className="browser-menu-action" disabled={!current || reading} onClick={() => { setToolsOpen(false); void readPage(); }}><WebIcon name="spark" size={17}/>{label("Sayfayı asistana ver", "Share page with Luna")}</button><button className="browser-menu-action" disabled={!current} onClick={() => current && openUrl(current.url).catch(showError)}><WebIcon name="external" size={17}/>{label("Dış tarayıcıda aç", "Open in your browser")}</button><small>{label("Çeviri ve sayfa okuma seçili AI profilini kullanır.", "Translation and page questions use your selected AI profile.")}</small><hr/><BrowserExtras key={current?.url||"home"} url={current?.url} title={current?.title} position={async()=>{if(!current)throw Error("Önce sayfa aç.");return native<{url:string;progress:number}>("browser_position",{id:current.id,action:"read",expectedUrl:current.url});}} openReading={(url,progress)=>{pendingScroll.current={id:current?.id??null,url,progress};setToolsOpen(false);if(current?.url===url){pendingScroll.current=null;void native("browser_position",{id:current.id,action:"scroll",expectedUrl:url,fraction:progress}).catch(showError);}else void action("navigate",url);}}/></div>}
        </div>
      </div>
      {current?.loading && <div className="browser-progress" role="progressbar" aria-label={label("Sayfa yükleniyor", "Page loading")}/>}
      {current && bookmarks.length > 0 && <div className="browser-bookmarks">{bookmarks.slice(0, 12).map(b => <button key={b.url} title={b.url + "\n" + label("Ctrl+tık veya orta tık: yeni sekme", "Ctrl+click or middle-click: new tab")} onClick={e => { if (e.ctrlKey || e.metaKey) void add(b.url); else void action("navigate", b.url); }} onAuxClick={e => { if (e.button === 1) { e.preventDefault(); void add(b.url); } }} onMouseDown={e => { if (e.button === 1) e.preventDefault(); }}><SiteAvatar url={b.url} size={16}/>{b.title}</button>)}</div>}
    </div>
    {!cinema&&current&&items.length>0&&<PageLibrarySignal url={current.url} title={current.title} items={items} open={onLibraryOpen}/>}
    {storePage&&<div className="browser-notice"><WebIcon name="plus" size={15}/><span>{label("Bu eklentiyi Luna'ya ekleyebilirsin.","You can add this extension to Luna.")}</span><button className="chip" onClick={()=>setManager("extensions")}>{label("Kurulumunu incele","Review installation")}</button></div>}
    {findOpen && current && <FindBar query={findQuery} setQuery={setFindQuery} result={findResult} busy={findBusy} matchCase={findCase} setMatchCase={setFindCase} step={d => void runFind(d > 0 ? "next" : "prev")} close={closeFind}/>}
    {browserNotice&&<div className="browser-notice" role="status"><WebIcon name="star" size={13}/>{browserNotice}</div>}
    {error && <div className="browser-alert" role="alert"><span>{error}</span>{current&&<button disabled={current.loading} onClick={()=>void action("reload")}>{label("Tekrar dene","Retry")}</button>}<button onClick={() => setError("")} aria-label={label("Uyarıyı kapat", "Dismiss")}><WebIcon name="close" size={16}/></button></div>}
    {popup && <div className="browser-alert"><span title={popup.url}>{label("Yeni sayfa isteği:", "New page request:")} {hostOf(popup.url)}</span><button onClick={() => { void add(popup.url); setPopup(null); }}>{label("Yeni sekmede aç", "Open in new tab")}</button><button onClick={() => setPopup(null)} aria-label={label("İsteği yok say", "Dismiss request")}><WebIcon name="close" size={15}/></button></div>}
    {(translationNote||translating) && <div className="browser-translation-status" role="status"><WebIcon name="translate" size={14}/><span>{translationNote}</span>{translating&&<button className="chip" onClick={()=>{cancelTranslation.current=true;setTranslationNote(label("Durduruluyor; gönderilmiş isteğin yanıtı uygulanmayacak.","Stopping; the in-flight reply will not be applied."));}}>{label("İptal","Cancel")}</button>}{canRetry&&!translating&&<button className="chip" onClick={()=>void translatePage(retryTranslation.current?.target||targetLanguage).catch(showError)}>{label("Başarısız bölümden devam et","Retry remaining sections")}</button>}</div>}
    <div className="browser-surface" ref={slot} aria-busy={!!current?.loading}>
      {current && needsRoom && <div className="browser-space-note"><WebIcon name="globe" size={32}/><p>{label("Web sayfasını göstermek için pencereyi biraz genişlet.", "Widen the window a little to show the web page.")}</p></div>}
      {!current && <BrowserStart query={address} setQuery={v => { addressDirty.current = true; setAddress(v); setAddressEdited(true); setSuggestAt(-1); }}
        submit={() => { setAddressEdited(false); void action("navigate", address); }} onKeyDown={e => { suggestKeys(e); }}
        onFocusChange={f => { setFocusSource(f ? "start" : null); if (!f) { setAddressEdited(false); setSuggestAt(-1); } }}
        suggest={focusSource === "start" && suggestions.length > 0 ? suggestList : null} suggestOpen={focusSource === "start" && suggestions.length > 0} activeOption={suggestAt}
        engine={engine} setEngine={chooseEngine} creating={creating} go={url => void action("navigate", url)} topSites={topList} hideSite={hideSite}
        bookmarks={bookmarks} addBookmark={addBookmarkFrom} removeBookmark={removeBookmark} restore={restoreList} restoreSession={() => void restoreSession()}
        dismissRestore={() => setLastSession([])} capacity={8 - tabs.length} reading={readingRows} openReading={openReadingFrom}
        closed={closedTabs} reopen={i => void reopenClosed(i)} historyPaused={historyPaused} openHistory={() => setHistoryOpen(true)} openClear={() => setClearOpen(true)} onAssistant={onAssistant}/>}
      {reader && <BrowserReader page={reader.page} onClose={() => setReader(null)} onAsk={() => { const page = reader.page; setReader(null); onPage(page); }}
        onCopy={text => void copyAssistantText(text).then(() => { if (alive.current) setBrowserNotice(label("Metin kopyalandı.", "Text copied.")); }).catch(showError)} onSave={() => saveReading(reader.url, reader.page.title)}/>}
    </div>

    {active&&recover.length>0&&<RecoveryPanel tabs={recover} busy={recoveryBusy} restore={recoverSelected} close={closeRecovery}/>}
    {active&&siteSettings&&current&&<SitePreferencesPanel origin={siteOrigin(current.url)} value={sitePrefs[siteOrigin(current.url)]||{muted:false,popups:"ask"}} zoom={nowNative.zoom} resetZoom={()=>setPageZoom(1)} save={value=>saveSitePreference(siteOrigin(current.url),value)} close={()=>setSiteSettings(false)}/>}
    {pageMenu&&<WebMenu x={pageMenu.x} y={pageMenu.y} items={pageMenuItems()} close={()=>setPageMenu(null)}/>}
    {active && paletteOpen && <CommandPalette title={label("Web komutları", "Web commands")} commands={webCommands()} onClose={() => setPaletteOpen(false)} footer="Ctrl+K" extra={query => {
      if (!query.trim()) return []; let url: string; try { url = resolveWebInput(query, engine, lang() === "tr"); } catch { return []; }
      return [{ id: "web-query", title: label("Aç veya ara: ", "Open or search: ") + query, detail: url, icon: "search", group: "Web", run: () => { void action("navigate", query); } }];
    }}/>}
    {active&&manager&&<BrowserManager initial={manager} storeUrl={/^https:\/\/(chromewebstore.google.com|chrome.google.com)\//.test(current?.url||"")?current!.url:""} hasTab={tabs.length>0} close={()=>setManager(null)} openStore={()=>{setManager(null);void add("https://chromewebstore.google.com/");}}/>}
    {menu && tabs.some(t => t.id === menu.id) && <WebMenu x={menu.x} y={menu.y} items={tabMenuItems(menu.id)} close={() => setMenu(null)}/>}
    {historyOpen && <HistoryPanel rows={history} paused={historyPaused} setPaused={setPaused} close={() => setHistoryOpen(false)}
      open={(url, newTab) => { setHistoryOpen(false); if (newTab) void add(url); else void action("navigate", url); }}
      remove={url => commitHistory(removeVisit(historyRef.current, url))} clearSince={since => commitHistory(clearVisitsSince(historyRef.current, since))}/>}
    {keysOpen && <ShortcutsPanel close={() => setKeysOpen(false)}/>}
    {clearOpen && <ClearDataPanel canClearSite={tabs.length > 0} clear={clearData} close={() => setClearOpen(false)}/>}
  </section>;
}

function SiteIcon({url,loading}:{url:string;loading:boolean}){const [failed,setFailed]=useState(false);let src="";try{src=new URL("/favicon.ico",url).href;}catch{}useEffect(()=>setFailed(false),[src]);return loading?<WebIcon name="reload" size={14}/>:failed||!src?<WebIcon name="globe" size={14}/>:<img className="browser-favicon" src={src} alt="" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>;}
