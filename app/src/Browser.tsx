import {BrowserExtensionToolbar} from "./BrowserExtensionToolbar";
import {BrowserStoreInstall} from "./BrowserStoreInstall";
import type {StoreInstallRequest} from "./BrowserStoreInstall";
import {BrowserLocalTranslation} from "./BrowserLocalTranslation";
import {LOCAL_TRANSLATION_LANGUAGES} from "./localWebTranslation";
import { completedExtensionPackages } from "./browserExtensionFlow";
import type { ExtensionRequest, ExtensionDownload } from "./browserExtensionFlow";
import { BrowserCollections } from "./BrowserCollections";
import { BrowserInputMenu } from "./BrowserInputMenu";
import { WebCollectionPicker } from "./WebCollectionPicker";
import { webCollectionItem, webHttpUrl } from "./webCollectionModel";
import type { CItem } from "./Mine";
import {browserCommandQueue} from "./browserCommandQueue";
import {createPortal} from "react-dom";
import {BrowserAdBlock} from "./BrowserAdBlock";
import {BrowserMediaPicker} from "./BrowserMediaPicker";
import type {WebMediaTrack} from "./browserMediaModel";
import {getCurrentWindow} from "@tauri-apps/api/window";
import {automaticVideoSources,playlistAddress,playableVideoSources,mainVideoVariants,isYouTubeVideo,webQualitySources,cleanWebMedia,mediaAddress} from "./browserMediaModel";
import type {WebMediaTransfer} from "./browserMediaModel";
import { appStorage as localStorage } from "./appStorage";
import {makeResolver,validTemplate} from "./webSearch";
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
import { cleanZoomMap, rememberZoom, zoomFor, userZoomChange } from "./browserZoomMemory";
import {BrowserManager} from "./BrowserManager";
import {copyAssistantText} from "./AssistantTools";
import {cleanWebTabs,upsertWebBookmark,missingWebTabs} from "./browserWorkspaceModel";
import { BrowserWorkspace } from "./BrowserWorkspace";
import type { SavedWebTab } from "./browserWorkspaceModel";
import { localList, validReading } from "./extrasModel";
import { BrowserExtras, rememberReadingPosition } from "./BrowserExtras";
import { dropNative, freshNative, navFailure, nextZoom, parseAudio, parseHistory, parseNavDone, parseZoom, patchNative, permissionNotice } from "./browserNativeModel";
import type { TabNative } from "./browserNativeModel";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { lang } from "./i18n";
import { BrowserIcon as WebIcon } from "./BrowserIcons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { invoke, isTauri } from "./nativeCore";
import { archivable, waybackApi, waybackSnapshot } from "./webArchive";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { browserAddress, cleanBrowserPage, friendlyBrowserError } from "./browserModel";
import type { BrowserPage, WebTab } from "./browserModel";
import { registerBrowserReader, registerBrowserTranslator, TRANSLATION_LANGUAGES, translateRows, translationBatches } from "./browserTranslation";
import type { TranslationRow, TranslationSummary } from "./browserTranslation";
import "./Browser.css";
import "./BrowserCompact.css";
import { I, Icon, LunaMark } from "./Screens";
import { fmtTime } from "./mpv";
import "./BrowserPlus.css";
import { store } from "./library";
import {registerBrowserActions} from "./browserAssistantActions";
import type {BrowserActionName,BrowserActionContext} from "./browserAssistantActions";
import { putExtra } from "./Extras";
import { browserRows, mergeReadingEntry } from "./browserRecords";
import { ClearDataPanel, FindBar, HistoryPanel, ShortcutsPanel, SiteAvatar, SuggestList, WebMenu } from "./BrowserPanels";
import type { MenuGlass, TabMenuItem } from "./BrowserPanels";
import { BrowserStart } from "./BrowserStart";
import { applySearchEngine } from "./searchEngine";
import { clearVisitsSince, forgetFailedVisit, HIDDEN_SITES_KEY, HISTORY_KEY, HISTORY_PAUSED_KEY, readSession, readVisits, recordVisit, removeSite, removeVisit, retitleVisit, SESSION_KEY, sessionTabs, topSites, webSuggestions } from "./browserHistoryModel";
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
const dlog = (...parts: unknown[]) => { if (isTauri()) void invoke("debug_log", { lines: [parts.map(p => typeof p === "string" ? p : JSON.stringify(p)).join(" ")] }).catch(() => {}); };
type FindResult = { count: number; index: number; capped: boolean };
// One native mutation at a time, including cleanup after React StrictMode's effect replay.
const native=browserCommandQueue(invoke);
export type ActiveWebTab = { id?: number; revision?: number; title: string; url: string; loading: boolean };
const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };
export type WebNavTarget = "film" | "music" | "books" | "mine" | "settings";
export function Browser({ active, onClose, onPage, onInvalidate, onAssistant, onActiveTab, onPlay, items = [], onLibraryOpen, onVideoFullscreen, onNav }: {
  /** One-row layout: the Luna logo menu reaches the other parts, collections and settings. */
  onNav?: (to: WebNavTarget) => void;
  /** Plays a video page or media address in Luna's own player (mpv + yt-dlp). */
  onPlay?: (url: string, media?:WebMediaTransfer) => void; items?: Item[]; onLibraryOpen?: (key:string)=>void; onVideoFullscreen?: (on:boolean)=>void;
  onAssistant?: () => void; active: boolean; onClose: () => void; onPage: (page: BrowserPage) => void; onInvalidate: () => void;
  onActiveTab?: (tab: ActiveWebTab | null) => void;
}) {
  const [tabs, setTabs] = useState<WebTab[]>([]), [selected, setSelected] = useState<number | null>(null);
  const [startQuery,setStartQuery]=useState("");
  const [address, setAddress] = useState(""), [error, setError] = useState("");
  const [creating, setCreating] = useState(false), [reading, setReading] = useState(false);
  const [needsRoom, setNeedsRoom] = useState(false);
  const [tabNative, setTabNative] = useState<Record<number, TabNative>>({});
  // Tabs whose load the user stopped: that cancelled navigation is not an error.
  const stopping = useRef(new Set<number>()), composing = useRef(false);
  const [targetLanguage, setTargetLanguage] = useState(()=>{try{const saved=localStorage.getItem("lunaWebTranslationLanguage");if(saved&&TRANSLATION_LANGUAGES.includes(saved))return saved;}catch{}return lang()==="tr"?"Türkçe":"English";}), [translating, setTranslating] = useState(false);
  const [translatedPages,setTranslatedPages]=useState<Record<number,number>>({});
  const [translationNote, setTranslationNote] = useState("");
  const [localSelection,setLocalSelection]=useState<{text:string;source:string;target:string}|null>(null);
  const [translationSource,setTranslationSource]=useState('English');
  // The page's translation session: later chunks, "translate the rest" and following new text reuse it.
  const retryTranslation = useRef<{id:number;revision:number;target:string;source:string;token:string}|null>(null);
  const [canRetry,setCanRetry] = useState(false);
  const cancelTranslation = useRef(false);
  const pendingScroll = useRef<{id:number|null;url:string;progress:number}|null>(null);
  const translationBusy = useRef(false), followBusy = useRef(false), shown = useRef(active); shown.current = active;
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [pinned, setPinned] = useState<Set<number>>(() => new Set());
  const pinnedRef = useRef(pinned); pinnedRef.current = pinned;
  const zoomEcho = useRef(new Map<number,{zoom:number;url:string|undefined}>());
  const zoomMemory = useRef((() => { try { return cleanZoomMap(JSON.parse(localStorage.getItem("lunaWebSiteZoom") || "null")); } catch { return cleanZoomMap(null); } })());
  const [sitePrefs,setSitePrefs]=useState(()=>{try{return cleanSitePreferences(JSON.parse(store.get("lunaWebSitePreferences")||"{}"));}catch{return cleanSitePreferences(null);}});
  const prefsRef=useRef(sitePrefs);prefsRef.current=sitePrefs;
  const [siteSettings,setSiteSettings]=useState(false),[focusMode,setFocusMode]=useState(false),[fullTabs,setFullTabs]=useState<Set<number>>(()=>new Set());
  const [collectionsOpen,setCollectionsOpen]=useState(false);
  const [collectionItem,setCollectionItem]=useState<CItem|null>(null);
  const [menuGlass,setMenuGlass]=useState<MenuGlass|null|"pending">(null);const glassToken=useRef(0);
  const [pageMenu,setPageMenu]=useState<{id:number;revision:number;url:string;text:string;page:string;source?:string;type?:CItem["webType"];targetX?:number;targetY?:number;x:number;y:number}|null>(null);
  const selectedText=useRef<{id:number;revision:number;page:BrowserPage}|null>(null);
  const [recover,setRecover]=useState<RecoveryTab[]>(()=>{try{const saved=JSON.parse(store.get("lunaWebRecovery")||"null");// opened for a link (trailer, TMDB page…): that page opens, the old session is not offered
    return saved?.dirty&&!store.get("pendingDevWatch")?recoveryTabs(saved.tabs):[];}catch{return [];}});
  const nativeHidden=useRef(new Set<number>());const [recoveryBusy,setRecoveryBusy]=useState(false);const recoveryStopped=useRef(false),lastCreated=useRef<number|null>(null);
  const addRef=useRef<(url:string)=>Promise<boolean>>(async()=>false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [manager,setManager]=useState<"extensions"|"downloads"|null>(null);
  const [downloadCount,setDownloadCount]=useState(0);
  const [extensionRequest,setExtensionRequest]=useState<ExtensionRequest|null>(null);
  const [extensionQueue,setExtensionQueue]=useState<ExtensionRequest[]>([]);
  useEffect(()=>{if(active&&!manager&&extensionQueue.length){setExtensionRequest(extensionQueue[0]);setExtensionQueue(q=>q.slice(1));setManager("extensions");}},[active,manager,extensionQueue]);
  const closeManager=()=>{setManager(null);setExtensionRequest(null);};
  useEffect(()=>{if(!active){setManager(null);setExtensionRequest(null);}},[active]);
  useEffect(()=>{
    let disposed=false,off:(()=>void)|undefined;const seen=new Set<number>(),finished=new Set<number>();
    const update=(initial=false)=>{void invoke<ExtensionDownload[]>("browser_downloads",{action:"list"}).then(rows=>{if(disposed)return;
      // a download that has just finished goes to its place in Luna (old finished ones at start are left alone)
      for(const r of rows as any[])if(r.state==="done"&&r.path&&!finished.has(r.id)){finished.add(r.id);if(!initial)window.dispatchEvent(new CustomEvent("luna-download-done",{detail:r.path}));}setDownloadCount(rows.filter(r=>r.state==="running").length);const requests=completedExtensionPackages(rows,seen,initial);if(requests.length)setExtensionQueue(q=>[...q,...requests]);}).catch(()=>{});};
    if(isTauri()){update(true);void listen("luna-downloads-changed",()=>update()).then(f=>{if(disposed)f();else off=f;}).catch(()=>{});}
    return()=>{disposed=true;off?.();};
  },[]);
  useEffect(() => {
    const err = (e: ErrorEvent) => dlog("window error", e.message, e.filename, e.lineno);
    const rej = (e: PromiseRejectionEvent) => dlog("unhandled", String(e.reason?.message ?? e.reason));
    window.addEventListener("error", err); window.addEventListener("unhandledrejection", rej);
    return () => { window.removeEventListener("error", err); window.removeEventListener("unhandledrejection", rej); };
  }, []);
  const [browserNotice,setBrowserNotice]=useState("");
  useEffect(()=>{if(!browserNotice)return;const id=setTimeout(()=>setBrowserNotice(""),compactRef.current?3000:4000);return()=>clearTimeout(id);},[browserNotice]);
  const compactRef=useRef(true);
  const [workspaceOpen,setWorkspaceOpen]=useState(false),[closedTabs,setClosedTabs]=useState<SavedWebTab[]>([]);
  const closingTabs=useRef(new Set<number>()),reopening=useRef(false);
  const [popup, setPopup] = useState<{ id: number; url: string } | null>(null);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(() => {
    try { const raw: unknown = JSON.parse(localStorage.getItem("lunaWebBookmarks") || "[]");
      return cleanWebTabs(raw,40);
    } catch { return []; }
  });
  const choiceId=(choice:string|null):SearchEngineId=>choice?.startsWith("custom:")&&validTemplate(choice.slice(7))?"custom":searchEngine(choice==="ddg"?"duckduckgo":choice).id;
  const [engineId,setEngineId]=useState<SearchEngineId>(()=>choiceId(store.get("webSearch")??store.get(ENGINE_KEY)));
  useEffect(()=>{const changed=(e:Event)=>setEngineId(choiceId((e as CustomEvent<string|null>).detail));window.addEventListener("luna-search-engine",changed);return()=>window.removeEventListener("luna-search-engine",changed);},[]);
  const engine = engineId==="custom"?{id:"custom" as const,name:lang()==="tr"?"Özel arama":"Custom search",mark:"⌕",home:"",search:makeResolver(store.get("webSearch"),lang())}:searchEngine(engineId), engineRef = useRef(engine); engineRef.current = engine;
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
  const forcedFull=useRef(false);
  useEffect(()=>{let stale=false;if(fullscreen)void getCurrentWindow().isFullscreen().then(on=>{if(!on&&!stale){forcedFull.current=true;void getCurrentWindow().setFullscreen(true).catch(showError);}}).catch(showError);else if(forcedFull.current){forcedFull.current=false;void getCurrentWindow().setFullscreen(false).catch(showError);}return()=>{stale=true;};},[fullscreen]);
  const [backgroundAudio,setBackgroundAudio]=useState<number|null>(null);
  const [backgroundPaused,setBackgroundPaused]=useState(false);
  useEffect(()=>{const row=Object.entries(tabNative).find(([id,state])=>state.audio&&!mutedTabs.includes(Number(id)));if(row){setBackgroundAudio(Number(row[0]));setBackgroundPaused(false);}},[tabNative,mutedTabs]);
  // Leaving the browser while a page plays: the page's own video becomes a mini player in the film dock's shape. The tab's
  // native window is placed over the dock's small video square and browserMini.js makes the <video> fill it.
  // Once shown, the mini player stays until the user stops it or returns to the Web: the page's audio flag drops for a
  // moment on pause/resume and buffering, and a hidden page does not always report it again.
  const [miniKeep,setMiniKeep]=useState<number|null>(null);
  const miniLive=!active&&backgroundAudio!==null&&(tabNative[backgroundAudio]?.audio||backgroundPaused)&&tabs.some(t=>t.id===backgroundAudio);
  useEffect(()=>{if(active)setMiniKeep(null);else if(miniLive)setMiniKeep(backgroundAudio);},[active,miniLive,backgroundAudio]);
  const miniTab=!active&&backgroundAudio!==null&&tabs.some(t=>t.id===backgroundAudio)&&(miniLive||miniKeep===backgroundAudio)?backgroundAudio:null;
  const [mini,setMini]=useState<{ok:boolean;time:number;duration:number;paused:boolean}|null>(null);
  useEffect(()=>{if(miniTab===null||!isTauri()){setMini(null);return;}
    let stale=false;const id=miniTab;
    const read=(action:string,value?:number)=>native<{ok:boolean;time?:number;duration?:number;paused?:boolean}>("browser_mini",{id,action,value}).then(r=>{if(!stale)setMini({ok:!!r.ok,time:r.time??0,duration:r.duration??0,paused:!!r.paused});}).catch(()=>{});
    void read("on");const timer=window.setInterval(()=>void read("on"),500);
    return()=>{stale=true;clearInterval(timer);setMini(null);void native("browser_mini",{id,action:"off"}).catch(()=>{});};
  },[miniTab]);
  const miniSeek=(action:"seek"|"seek-to",value:number)=>{if(miniTab!==null)void native<{ok:boolean;time?:number;duration?:number;paused?:boolean}>("browser_mini",{id:miniTab,action,value}).then(r=>setMini(m=>m&&{...m,time:r.time??m.time})).catch(showError);};
  const audible=Object.entries(tabNative).some(([id,state])=>state.audio&&!mutedTabs.includes(Number(id)));
  // a page's sound drops for a moment now and then (77 ms on YouTube): the dock must not rise and fall with every gap
  const [audioOut,setAudioOut]=useState(false);
  useEffect(()=>{if(audible){setAudioOut(true);return;}const id=window.setTimeout(()=>setAudioOut(false),2500);return()=>clearTimeout(id);},[audible]);
  useEffect(()=>{document.documentElement.classList.toggle("browser-audio-active",audioOut);window.dispatchEvent(new CustomEvent("luna-browser-audio",{detail:audioOut}));return()=>{document.documentElement.classList.remove("browser-audio-active");window.dispatchEvent(new CustomEvent("luna-browser-audio",{detail:false}));};},[audioOut]);
  useEffect(()=>{const pause=(e:Event)=>{const id=(e as CustomEvent<number>).detail;if(known.current.has(id))void native("browser_action",{id,action:"pause-media"}).catch(()=>{});};window.addEventListener("luna-web-playing",pause);return()=>window.removeEventListener("luna-web-playing",pause);},[]);
  useEffect(()=>{document.documentElement.classList.toggle("luna-web-video-fullscreen",fullscreen);onVideoFullscreen?.(fullscreen);return()=>{document.documentElement.classList.remove("luna-web-video-fullscreen");onVideoFullscreen?.(false);};},[fullscreen,onVideoFullscreen]);
  // The store's own install button asks through the tab; it counts only for the extension of the page on screen.
  const [storeInstall,setStoreInstall]=useState<StoreInstallRequest|null>(null);
  const closeStoreInstall=useCallback(()=>setStoreInstall(null),[]);
  useEffect(()=>{setStoreInstall(null);},[current?.id,current?.url]);
  const nowNative: TabNative = (current && tabNative[current.id]) || freshNative();
  useEffect(() => {
    // A redirect or in-page URL change must not wipe what the user is typing; switching tabs always resets it.
    const switched = lastSelected.current !== selected; lastSelected.current = selected;
    if (switched || !addressDirty.current) { addressDirty.current = false; setAddress(current?.url || ""); setAddressEdited(false); }
    if (switched) { selectedText.current=null;setPageMenu(null);setFocusMode(false); if (findOpenRef.current) closeFind(); setReader(null); setMenu(null); }
    setLocalSelection(null); setBrowserNotice(""); setPopup(null); setToolsOpen(false); setTranslationNote(""); setCanRetry(false); retryTranslation.current=null; cancelTranslation.current=true; invalidator.current();
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
    zoomEcho.current.set(id,{zoom:factor,url});
    void native("browser_action", { id, action: "zoom", zoom: factor })
      .then(() => { if (alive.current && known.current.has(id)) { setTabNative(m => patchNative(m, id, { zoom: factor })); if (url) { zoomMemory.current = rememberZoom(zoomMemory.current, url, factor); try { localStorage.setItem("lunaWebSiteZoom", JSON.stringify(zoomMemory.current)); } catch {} } } })
      .catch(error=>{zoomEcho.current.delete(id);showError(error);});
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
  async function closeTab(id: number, allowed:()=>boolean=()=>true) {
    if(closingTabs.current.has(id)||!known.current.has(id))return;
    closingTabs.current.add(id);
    const tab=tabsRef.current.find(t=>t.id===id);
    try {
      await native("browser_action", { id, action: "close" }, allowed);
      known.current.delete(id); zoomEcho.current.delete(id); revisions.current.delete(id); committed.current.delete(id);if(pendingScroll.current?.id===id)pendingScroll.current=null;
      titles.current.delete(id); loadingNow.current.delete(id); setMutedTabs(m => m.filter(x => x !== id));
      setTabNative(m => dropNative(m, id)); stopping.current.delete(id); setPinned(old => new Set([...old].filter(x => x !== id)));setFullTabs(old=>new Set([...old].filter(x=>x!==id)));tabMuteChoice.current.delete(id);
      // Like other browsers: the neighbour on the right takes over, else the one on the left.
      const list = tabsRef.current, at = list.findIndex(t => t.id === id), left = list.filter(t => t.id !== id);
      setTabs(ts => ts.filter(t => t.id !== id));
      if (chosen.current === id) {setSelected((left[at] ?? left[at - 1])?.id ?? null);invalidator.current();}
      if(tab&&alive.current)setClosedTabs(rows=>[{title:tab.title,url:tab.url},...rows].slice(0,12));
    } catch (e) { showError(e); }finally{closingTabs.current.delete(id);}
  }
  const assistantActions=useRef<(action:BrowserActionName,args:Record<string,any>)=>Promise<string>>(async()=>{throw Error("Web hazır değil.");});
  const assistantContext=():BrowserActionContext=>{
    if(!shown.current||!alive.current)throw Error("Web bölümü açık değil.");
    const id=chosen.current,tab=tabsRef.current.find(t=>t.id===id);
    return {id,revision:id===null?0:revisions.current.get(id)||0,url:tab?.url||"",title:tab?.title||"",tabs:tabsRef.current.map(t=>({id:t.id,title:t.title,url:t.url}))};
  };
  assistantActions.current=async(kind,args)=>{
    const context=assistantContext(),id=context.id,tab=tabsRef.current.find(t=>t.id===id);
    if(kind==="list")return JSON.stringify(context);
    if(kind==="open"){if(!await addRef.current(args.url))throw Error("Sekme açılamadı; sekme sınırını ve adresi kontrol et.");return "Yeni sekme açıldı.";}
    if(kind==="focus"){if(!context.tabs.some(t=>t.id===args.tabId))throw Error("Sekme bulunamadı.");chooseTab(args.tabId);return "Sekme seçildi.";}
    if(id===null||!tab)throw Error("Önce bir Web sekmesi aç.");
    if(kind==="close"){await closeTab(id,()=>shown.current&&chosen.current===id&&(revisions.current.get(id)||0)===context.revision);if(known.current.has(id))throw Error("Sekme kapatılamadı.");return "Sekme kapatıldı.";}
    if(kind==="reload"){await native("browser_action",{id,action:"reload"},()=>shown.current&&chosen.current===id&&(revisions.current.get(id)||0)===context.revision);revisions.current.set(id,context.revision+1);invalidator.current();return "Sayfaya yenileme komutu gönderildi.";}
    if(kind==="mute"){if(typeof args.muted!=="boolean")throw Error("Sessiz durumu true/false olmalı.");await native("browser_action",{id,action:args.muted?"mute":"unmute"},()=>shown.current&&chosen.current===id&&(revisions.current.get(id)||0)===context.revision);tabMuteChoice.current.set(id,{origin:siteOrigin(tab.url),muted:args.muted});setMutedTabs(m=>args.muted?[...new Set([...m,id])]:m.filter(x=>x!==id));return args.muted?"Sekmenin sesi kapatıldı.":"Sekmenin sesi açıldı.";}
    if(kind==="find"){if(!args.text?.trim())throw Error("Aranacak metin gerekli.");openFind();setFindQuery(args.text);return "Sayfada arama kutusu açıldı; aranan metin: "+args.text;}
    if(kind==="bookmark"){
      const raw=store.get("lunaWebBookmarks");const rows=raw?JSON.parse(raw):[];
      if(!Array.isArray(rows)||rows.some(v=>!v||typeof v.url!=="string"||typeof v.title!=="string"))throw Error("Favoriler kaydı hasarlı; üzerine yazılmadı.");
      const next=upsertWebBookmark(rows,tab);if(!store.set("lunaWebBookmarks",JSON.stringify(next)))throw Error("Favori kaydedilemedi.");setBookmarks(next);return "Sayfa favorilere eklendi.";
    }
    if(kind==="read_later"){const rows=browserRows(localStorage,"lunaWebReading",validReading),old=rows.find(r=>r.url===tab.url);putExtra("lunaWebReading",mergeReadingEntry(rows,{url:tab.url,title:tab.title,progress:old?.progress??0,done:false,at:Date.now()}));return "Sayfa okuma kuyruğuna eklendi.";}
    if(kind==="note"){if(!args.text?.trim()||args.text.length>5000)throw Error("Not 1–5000 karakter olmalı.");const rows=browserRows(localStorage,"lunaWebNotes",validPageNote),old=rows.find(r=>r.url===tab.url)?.text||"";const text=[old,args.text.trim()].filter(Boolean).join("\n\n");if(text.length>5000)throw Error("Sayfa notu sınırı dolu; mevcut not korunuyor.");putExtra("lunaWebNotes",mergePageNote(rows,tab.url,text,Date.now()));return "Not bu sayfanın notlarına eklendi.";}
    throw Error("Bilinmeyen Web işlemi.");
  };
  useEffect(()=>{if(!active)return;return registerBrowserActions(assistantContext,(kind,args)=>assistantActions.current(kind,args));},[active]);
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
  async function capturePage(plain = false, options?:{provider?:string;videoSummary?:boolean}): Promise<BrowserPage> {
    if (chosen.current === null || !shown.current) throw new Error("Önce bir web sayfası aç.");
    const id = chosen.current, revision = revisions.current.get(id) || 0;
    const selection=selectedText.current;
    if(!plain&&!options?.videoSummary&&selection&&selection.id===id&&selection.revision===revision&&selection.page.url===tabsRef.current.find(t=>t.id===id)?.url)return selection.page;
    const tab=tabsRef.current.find(t=>t.id===id);
    if(options?.videoSummary&&options.provider==="gemini"&&tab)return {title:tab.title,url:tab.url,text:"",truncated:false,capturedAt:Date.now()};
    const page = await native<Omit<BrowserPage, "capturedAt">>("browser_read", { id }).catch(error=>{if(!options?.videoSummary||!tab)throw error;return {title:tab.title,url:tab.url,text:"",truncated:false};});
    if (!alive.current || !shown.current || chosen.current !== id || revision !== (revisions.current.get(id) || 0)) throw new Error("Sayfa değişti; yeniden oku.");
    const clean = cleanBrowserPage(page, !!tabsRef.current.find(t => t.id === id)?.loading);
    // A YouTube video: what is said in it (its subtitles, fetched once per video) instead of only the page around it.
    if (!plain && !(options?.videoSummary&&options.provider==="gemini") && /^(?:https:\/\/(?:www\.|m\.)?youtube\.com\/(?:watch|shorts\/|live\/)|https:\/\/youtu\.be\/)/.test(clean.url)) {
      let said = transcripts.get(clean.url);
      if (said === undefined) {
        said = await invoke<string>("yt_transcript", { url: clean.url }).catch(() => "");
        if(said){if(transcripts.size>=20)transcripts.delete(transcripts.keys().next().value!);transcripts.set(clean.url,said);}

      }
      if (!alive.current || !shown.current || chosen.current !== id || revision !== (revisions.current.get(id) || 0)) throw new Error("Sayfa değişti; yeniden oku.");
      if (said) return { ...clean, transcript:true, text: label("Videonun altyazısı (konuşulanlar):\n", "The video's subtitles (what is said):\n") + said.slice(0, 40000) + "\n\n" + label("Sayfa metni:\n", "Page text:\n") + clean.text.slice(0, 4000), truncated: said.length > 40000 || clean.truncated, capturedAt: Date.now() };
    }
    return { ...clean, capturedAt: Date.now() };
  }
  const readerRef = useRef(capturePage); readerRef.current = capturePage;
  useEffect(() => {
    registerBrowserReader(active && selected !== null ? options => readerRef.current(false,options) : null);
    return () => registerBrowserReader(null);
  }, [active, selected]);
  async function readPage() {
    if (selected === null || reading) return;
    setReading(true); setError("");
    const id=selected;
    try { onPage(await capturePage());
    } catch (e) { if(chosen.current===id)showError(e); } finally { if (alive.current) setReading(false); }
  }
  /** Chrome-style: what is on screen is translated and shown first, then the rest chunk by chunk. With
   *  `follow`, only text that appeared since (scrolling feeds, opened menus) is translated, quietly. */
  async function translatePage(target: string, follow = false): Promise<TranslationSummary> {
    // A quiet follow-up pass yields to the user's own click (restore, another language).
    for (let i = 0; !follow && translationBusy.current && followBusy.current && i < 100; i++) { cancelTranslation.current = true; await new Promise(r => setTimeout(r, 100)); }
    if (translationBusy.current) { if (follow) return { applied: 0, skipped: 0 }; throw new Error(label("Bir çeviri zaten sürüyor.","A translation is already running.")); }
    if (selected === null || !shown.current) throw new Error(label("Önce Web bölümünde bir sayfa aç.","Open a page in Web first."));
    const id = selected, revision = revisions.current.get(id) || 0;
    const stillHere = () => alive.current && shown.current && chosen.current === id && revision === (revisions.current.get(id) || 0);
    translationBusy.current = true; followBusy.current = follow; cancelTranslation.current=false;
    if (!follow) { setCanRetry(false); setTranslating(true); setError(""); setTranslationNote(""); }
    try {
      if (target === "restore") {
        retryTranslation.current=null;setCanRetry(false);
        const result = await native<{ restored: number }>("browser_translation", { id, action: "restore" });
        if (!stillHere()) throw new Error(label("Sayfa değişti.","The page changed."));
        setTranslatedPages(v=>{const next={...v};delete next[id];return next;});
        invalidator.current();
        setTranslationNote(label(`${result.restored} metin alanı özgün diline döndürüldü.`,`${result.restored} text areas restored to the original.`));
        return { applied: result.restored, skipped: 0 };
      }
      const previous=retryTranslation.current;
      let work=previous&&previous.id===id&&previous.revision===revision&&previous.target===target?previous:null;
      if(follow&&!work)return{applied:0,skipped:0};
      let applied=0,skipped=0,truncated=false,first=true;
      for(;;){
        if(!stillHere())throw new Error(label("Sayfa veya sekme değişti; çeviri iptal edildi.","The page or tab changed; translation canceled."));
        if(cancelTranslation.current)throw new Error(label("Çeviri durduruldu; çevrilen bölümler sayfada kalıyor.","Translation stopped; the translated parts stay on the page."));
        const payload=work?{next:true,token:work.token,onlyIfDirty:follow&&first}:undefined;
        const snapshot=await native<{token:string;truncated:boolean;language?:string;rows:TranslationRow[]}>("browser_translation",{id,action:"snapshot",payload});
        if(!stillHere()||cancelTranslation.current)throw new Error(label("Çeviri iptal edildi.","Translation canceled."));
        if(!work){
          if(!snapshot.rows.length)throw new Error(label("Çevrilebilir sayfa metni bulunamadı. Video ve dış çerçeveler çevrilemez.","No translatable page text found. Video and external frames cannot be translated."));
          const code=(snapshot.language||'').toLowerCase().split(/[-_]/)[0];
          // Google detects the language itself; the source only matters for the offline local fallback.
          const source=Object.entries(LOCAL_TRANSLATION_LANGUAGES).find(([,c])=>c===code)?.[0]||(code||translationSource);
          work={id,revision,target,source,token:snapshot.token};retryTranslation.current=work;
        }
        first=false;truncated||=snapshot.truncated;
        if(!snapshot.rows.length)break;
        for(const batch of translationBatches(snapshot.rows)){
          if(!follow)setTranslationNote(applied?label(`Sayfa ${target} diline çevriliyor · ${applied} metin hazır`,`Translating the page into ${target} · ${applied} texts done`):label(`Sayfa ${target} diline çevriliyor…`,`Translating the page into ${target}…`));
          const translated=await translateRows(batch,target,work.source,message=>{if(stillHere()&&!follow)setTranslationNote(message);});
          if(!stillHere() || cancelTranslation.current)throw new Error(label("Çeviri durduruldu; eski yanıt uygulanmadı.","Translation stopped; the late reply was not applied."));
          // Each chunk goes onto the page as soon as it is ready, the visible part first.
          const result=await native<TranslationSummary>("browser_translation",{id,action:"apply",payload:{token:work.token,translations:translated}},()=>stillHere()&&!cancelTranslation.current);
          applied+=result.applied;skipped+=result.skipped;
          if(result.applied>0)setTranslatedPages(v=>v[id]===revision?v:{...v,[id]:revision});
        }
      }
      if(applied>0)invalidator.current();
      if(!follow)setTranslationNote(label(`${applied} metin alanı ${target} diline çevrildi. Yeni gelen yazılar da çevrilecek.${skipped ? ` ${skipped} değişen alan atlandı.` : ""}${truncated ? " Çok uzun sayfanın bir bölümü çevrilmedi." : ""}`,`${applied} text areas translated into ${target}. New text will be translated too.${skipped ? ` ${skipped} changed areas skipped.` : ""}${truncated ? " Part of the very long page was not translated." : ""}`));
      return { applied, skipped, truncated };
    } catch (e) {
      const here=stillHere();
      // Following new text is quiet: a changed page just ends the session, no error banner.
      if(follow){if(!cancelTranslation.current)retryTranslation.current=null;return{applied:0,skipped:0};}
      if(here && retryTranslation.current){setCanRetry(true);setTranslationNote(label("Çeviri tamamlanmadı. Çevrilen bölümler sayfada; kalanı çevirebilirsin.","Translation did not finish. Translated parts stay on the page; you can translate the rest."));} else if(here||chosen.current===id) {retryTranslation.current=null;setCanRetry(false);setTranslationNote("");} if(here) showError(e); throw e; }
    finally { translationBusy.current = false; followBusy.current = false; if (alive.current && !follow) setTranslating(false); }
  }
  // While a page stays translated, text that appears later (feeds, opened menus) is translated too. The page
  // marks itself dirty, so a quiet page costs one flag check per tick, not a new walk.
  useEffect(()=>{
    if(!active||selected===null||translating||canRetry)return;
    const id=selected;
    const tick=window.setInterval(()=>{
      const work=retryTranslation.current;
      if(!work||work.id!==id||translatedPages[id]!==(revisions.current.get(id)||0)||translationBusy.current)return;
      void translateRef.current(work.target,true).catch(()=>{});
    },2000);
    return()=>window.clearInterval(tick);
  },[active,selected,translating,canRetry,translatedPages]);
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
    if(restoringSession.current)return;
    recoveryStopped.current=false;restoringSession.current=true;setRecoveryBusy(true);setRecover(rows);
    const pending=[...rows].sort((a,b)=>Number(b.pinned)-Number(a.pinned));let completed=0;
    try{for(const row of pending){
      if(recoveryStopped.current||!shown.current||!alive.current||known.current.size>=8)break;
      if(tabsRef.current.some(t=>t.url===row.url)){completed++;continue;}
      if(!await addRef.current(row.url))break;const id=lastCreated.current;
      if(id!==null&&row.pinned){setPinned(old=>new Set([...old,id]));}
      completed++;
      // Creation is acknowledged; navigation continues in the tab without blocking recovery on page resources.
    }}finally{restoringSession.current=false;setRecoveryBusy(false);setRecover(pending.slice(completed));setLastSession([]);}
  }
  function closeRecovery(){recoveryStopped.current=true;if(!recoveryBusy){setRecover([]);store.set("lunaWebRecovery",JSON.stringify({dirty:true,tabs:tabsRef.current.map(t=>({title:t.title,url:t.url,pinned:pinnedRef.current.has(t.id)})),at:Date.now()}));}}
  function saveSitePreference(origin:string,value:SitePreference){
    const next=cleanSitePreferences({...prefsRef.current,[origin]:value});
    if(!store.set("lunaWebSitePreferences",JSON.stringify(next))){showError(label("Tercihler kaydedilemedi.","Could not save preferences."));return;}
    setSitePrefs(next);setSiteSettings(false);
    for(const tab of tabsRef.current)if(siteOrigin(tab.url)===origin)toggleMute(tab.id,value.muted);
  }
  async function selectionAction(kind:"explain"|"translate"|"note"){
    const context=pageMenu;if(!context||!context.text||chosen.current!==context.id||(revisions.current.get(context.id)||0)!==context.revision)return;
    if(kind==="translate"){
      setPageMenu(null);
      try{
        const info=await native<{language?:string}>("browser_translation",{id:context.id,action:"language"});
        if(!alive.current||!shown.current||chosen.current!==context.id||(revisions.current.get(context.id)||0)!==context.revision)return;
        const code=(info.language||'').toLowerCase().split(/[-_]/)[0];
        const source=Object.entries(LOCAL_TRANSLATION_LANGUAGES).find(([,c])=>c===code)?.[0]||translationSource;
        setLocalSelection({text:context.text,source,target:targetLanguage});
      }catch(e){showError(e);}return;
    }
    if(kind==="note"){
      try{const rows=browserRows(localStorage,"lunaWebNotes",validPageNote),old=rows.find(r=>r.url===context.page)?.text||"";putExtra("lunaWebNotes",mergePageNote(rows,context.page,[old,context.text].filter(Boolean).join("\n\n"),Date.now()));setBrowserNotice(label("Seçili metin sayfa notuna eklendi.","Selected text was added to the page note."));}catch(error){showError(error);}
    }else{
      const tab=tabsRef.current.find(t=>t.id===context.id);const page:BrowserPage={title:tab?.title||context.page,url:context.page,text:context.text,selection:context.text,truncated:false,capturedAt:Date.now()};
      selectedText.current={id:context.id,revision:context.revision,page};onPage(page);
      askAssistant(label("Yalnız seçtiğim metni açıkla.","Explain only the selected text."));
    }setPageMenu(null);
  }
  useEffect(()=>{setCollectionsOpen(false);setLocalSelection(null);},[active,selected]);
  function collectPage(){if(!current)return;const item=webCollectionItem({page:current.url,title:current.title,type:"page"});if(item){setCollectionsOpen(false);setCollectionItem(item);}}
  async function collectTarget(context:NonNullable<typeof pageMenu>){
    const valid=()=>shown.current&&chosen.current===context.id&&(revisions.current.get(context.id)||0)===context.revision&&tabsRef.current.some(t=>t.id===context.id&&t.url===context.page);
    if(!valid())return;
    const tab=tabsRef.current.find(t=>t.id===context.id)!;let source=context.source,title=context.type&&context.type!=="page"?(context.source||context.url||tab.title).split("/").pop()?.split("?")[0]||tab.title:tab.title,type=context.type;
    if(type&&["image","video","audio"].includes(type)&&(!source||source===context.page)){
      try{const target=await native<{source?:string;title?:string;type?:string}|null>("browser_collection_target",{id:context.id,page:context.page,x:context.targetX??0,y:context.targetY??0},valid);if(!valid())return;
        if(target?.type===type){source=webHttpUrl(target.source);if(target.title)title=target.title;}
      }catch{if(!valid())return;}
    }
    if(!valid())return;
    const item=webCollectionItem({page:context.page,title,url:context.url,source,type,text:context.text});if(item)setCollectionItem(item);
  }
  function pageMenuItems():TabMenuItem[]{
    if(!pageMenu)return [];const rows:TabMenuItem[]=[];
    if(pageMenu.url)rows.push({label:label("Bağlantıyı yeni sekmede aç","Open link in new tab"),icon:"plus",disabled:tabs.length>=8||creating,run:()=>{void add(pageMenu.url);}},
      {label:label("Bağlantıyı sonra oku","Read link later"),icon:"book",run:()=>saveReading(pageMenu.url,hostOf(pageMenu.url))},
      {label:label("Bağlantıyı kopyala","Copy link"),icon:"copy",run:()=>{void copyAssistantText(pageMenu.url).catch(showError);}});
    if(pageMenu.url&&onPlay&&playableInLuna(pageMenu.url))rows.push({label:label("Luna'da oynat","Play in Luna"),icon:"play",run:()=>onPlay(pageMenu.url)});
    if(pageMenu.text){rows.push({label:label("Kopyala","Copy"),icon:"copy",hint:"Ctrl+C",run:()=>{void copyAssistantText(pageMenu.text).catch(showError);}}, {label:label(`“${pageMenu.text.slice(0,40)}” için ${engine.name} ile ara`,`Search ${engine.name} for “${pageMenu.text.slice(0,40)}”`),icon:"search",run:()=>{void add(engine.search(pageMenu.text));}});if(rows.length)rows.push("sep");rows.push({label:label("Seçili metni açıkla","Explain selected text"),icon:"spark",run:()=>selectionAction("explain")},{label:label("Seçili metni çevir","Translate selected text"),icon:"translate",run:()=>selectionAction("translate")},{label:label("Seçili metni notlara ekle","Add selected text to notes"),icon:"book",run:()=>selectionAction("note")});}
    // Only one of the page-translation actions makes sense: restore replaces translate after the page is translated.
    if(translatedPages[pageMenu.id]===pageMenu.revision)rows.push({label:label("Orijinal dilinde göster","Restore original language"),icon:"reload",disabled:translating,run:()=>{setPageMenu(null);void translatePage("restore").catch(showError);}});
    else if(!pageMenu.text)rows.push({label:label("Sayfayı çevir","Translate page"),icon:"translate",disabled:translating,run:()=>{setPageMenu(null);void translatePage(targetLanguage).catch(showError);}});
    if(rows.length)rows.push("sep");
    rows.push({label:label("Koleksiyona ekle…","Add to collection…"),icon:"collection",run:()=>{void collectTarget(pageMenu);}});return rows;
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
  function chooseEngine(id: SearchEngineId) { setEngineId(id); store.set(ENGINE_KEY, id);const saved=id==="duckduckgo"?"ddg":id;store.set("webSearch",saved);applySearchEngine(saved); }
  function setPaused(paused: boolean) { setHistoryPaused(paused); store.set(HISTORY_PAUSED_KEY, paused ? "1" : "0"); }
  function hideSite(host: string) { const next = [...hiddenSites.filter(h => h !== host), host].slice(-100); setHiddenSites(next); store.set(HIDDEN_SITES_KEY, JSON.stringify(next)); }
  useEffect(() => {
    // The open tabs are kept for "pick up where you left off"; with history paused nothing is kept.
    if(historyPaused)return;
    if(tabs.length)sessionTouched.current=true;else{if(sessionTouched.current)store.set(SESSION_KEY,"[]");return;}
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(sessionTabs(tabs))); } catch { /* storage full: the next change tries again */ }
  }, [tabs, historyPaused]);
  useEffect(() => {
    const refresh = () => {setReadingRows(localList(localStorage, "lunaWebReading", validReading));try{setBookmarks(cleanWebTabs(JSON.parse(store.get("lunaWebBookmarks")||"[]"),40));}catch{/* Preserve damaged stored data. */}};
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
    ? webSuggestions(focusSource==="start"?startQuery:address, { tabs: tabs.filter(t => t.id !== selected), bookmarks, history }, engine, Date.now(), lang() === "tr") : [],
  [focusSource, addressEdited, startQuery, address, tabs, selected, bookmarks, history, engine]);
  function removeSuggestion(s: Suggestion) { if (s.kind === "history") commitHistory(removeVisit(historyRef.current, s.url)); }
  function pickSuggestion(s: Suggestion) {
    setAddressEdited(false); setSuggestAt(-1);
    if (s.kind === "tab") { chooseTab(s.id); return; }
    if (s.kind === "bang") {
      if (s.query) void action("navigate", "!" + s.key + " " + s.query);
      else { addressDirty.current = true; if(focusSource==="start")setStartQuery("!"+s.key+" ");else setAddress("!" + s.key + " "); setAddressEdited(true); }
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
  useEffect(()=>{if(!active)return;const consume=()=>{const url=store.get("pendingDevWatch");if(!url)return;store.remove("pendingDevWatch");setToolsOpen(false);setRecover([]);void add(url);};let timer=window.setTimeout(consume,0);const open=()=>{clearTimeout(timer);timer=window.setTimeout(consume,0);};window.addEventListener("luna-browser-open",open);return()=>{clearTimeout(timer);window.removeEventListener("luna-browser-open",open);};},[active]);
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
    // the same button (and F9) closes the reading view again
    if (reader) { setReader(null); return; }
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
  const [mediaBusy,setMediaBusy]=useState(false);const mediaJob=useRef(0);
  // One-row layout (2.7.6): Luna's header folds into a logo menu and tabs + address share one row. "0" keeps the classic
  // two-row chrome, so the new look can be turned off from Tools or the logo menu at any time.
  const [compact,setCompact]=useState(()=>store.get('webCompact')!=='0'),[lunaMenu,setLunaMenu]=useState(false);
  const setLayout=(on:boolean)=>{if(store.set('webCompact',on?'1':'0'))setCompact(on);setLunaMenu(false);};
  compactRef.current=compact;
  // One-row layout: the address capsule itself "talks" (notices, errors, requests, translation) and then turns back into
  // the address. Errors fade after 8 s, a finished translation note after 3 s. The extension store needs no hint:
  // its own install button works (BrowserStoreInstall).
  useEffect(()=>{if(!compact||!error)return;const id=setTimeout(()=>setError(""),8000);return()=>clearTimeout(id);},[compact,error]);
  useEffect(()=>{if(!compact||translating||!translationNote||canRetry)return;const id=setTimeout(()=>setTranslationNote(""),3000);return()=>clearTimeout(id);},[compact,translating,translationNote,canRetry]);
  useEffect(()=>{if(!lunaMenu)return;const out=(e:PointerEvent)=>{if(!(e.target as Element).closest?.(".browser-luna-anchor"))setLunaMenu(false);};const key=(e:KeyboardEvent)=>{if(e.key==="Escape"){setLunaMenu(false);document.querySelector<HTMLElement>(".browser-luna-logo")?.focus();}};window.addEventListener("pointerdown",out);window.addEventListener("keydown",key);return()=>{window.removeEventListener("pointerdown",out);window.removeEventListener("keydown",key);};},[lunaMenu]);
  const [autoPick,setAutoPick]=useState(()=>store.get('webAutoPick')==='1'),[autoOpen,setAutoOpen]=useState(()=>store.get('webAutoOpen')==='1');
  const autoSeen=useRef(new Set<string>()),mediaBusyRef=useRef(false);mediaBusyRef.current=mediaBusy;

  const [mediaChoice,setMediaChoice]=useState<{tab:{id:number;url:string};revision:number|undefined;media:ReturnType<typeof cleanWebMedia>;rows:WebMediaTrack[];failed?:boolean}|null>(null);
  const lastMediaRequest=useRef<typeof mediaChoice>(null),[mediaRecovery,setMediaRecovery]=useState<typeof mediaChoice>(null);
  useEffect(()=>{setMediaChoice(null);if(active&&current)void native('browser_action',{id:current.id,action:'resume-media'}).catch(()=>{});},[active,selected,current?.url]);
  useEffect(()=>{const fail=(event:Event)=>{const id=(event as CustomEvent<{id:number}>).detail?.id,request=lastMediaRequest.current;if(request?.tab.id===id){setBrowserNotice(label('Bu dosyayı oynatamadım. Başka bir video seç.','Could not play this file. Choose another video.'));setMediaRecovery({...request,failed:true});}};window.addEventListener('luna-web-open-failed',fail);return()=>window.removeEventListener('luna-web-open-failed',fail);},[]);
  useEffect(()=>{if(active&&mediaRecovery){if(current?.id===mediaRecovery.tab.id&&current.url===mediaRecovery.tab.url)setMediaChoice(mediaRecovery);setMediaRecovery(null);}},[active,mediaRecovery,current?.id,current?.url]);
  async function startMedia(tab:{id:number;url:string},media:ReturnType<typeof cleanWebMedia>,source?:WebMediaTrack){
    const revision=revisions.current.get(tab.id);const choices=playableVideoSources(media.media);lastMediaRequest.current={tab,revision,media,rows:choices.length?choices:[{url:source?.url||tab.url}]};
    await native('browser_action',{id:tab.id,action:'pause-media'}).catch(()=>{});
    if(!alive.current||chosen.current!==tab.id||tabsRef.current.find(t=>t.id===tab.id)?.url!==tab.url||revisions.current.get(tab.id)!==revision)return;
    const variants=mainVideoVariants(webQualitySources(media.media,tab.url),source);if(source&&!variants.some(v=>v.url===source.url))variants.unshift(source);
    onPlay?.(source?.url||tab.url,{referer:source?.referer||tab.url,agent:source?.agent,sourceTabId:tab.id,releaseYear:media.releaseYear,variants,pageUrl:tab.url,title:media.title||tabsRef.current.find(t=>t.id===tab.id)?.title||tab.url,subtitles:isYouTubeVideo(tab.url)?[]:media.subtitles.filter(t=>!source?.frameUrl||!t.frameUrl||t.frameUrl===source.frameUrl),audio:source?.audioUrl?[{url:source.audioUrl,referer:source.referer,agent:source.agent}]:[]});
    // Native pause-media uses a temporary mute; it must not alter the user mute preference.
  }
  async function playInLuna(tab:{id:number;url:string},automatic=false){
    if(!onPlay||mediaBusyRef.current)return;const job=++mediaJob.current,revision=revisions.current.get(tab.id);setMediaBusy(true);
    try{let media:ReturnType<typeof cleanWebMedia>={pagePlaying:false,title:'',releaseYear:undefined,media:[],subtitles:[],audio:[],variants:[]};
      if(!/\.(?:mp4|webm|mkv|m3u8|mpd|mp3|flac|m4a|ogg|opus|wav|aac)(?:[?#]|$)/i.test(tab.url))try{media=cleanWebMedia(await native('browser_media',{id:tab.id}));}catch{setBrowserNotice(label('Kaynak okunamadı; sayfa bağlantısı oynatıcıyla denenecek.','Could not read the source; trying the page in the player.'));}
      if(!alive.current||job!==mediaJob.current||chosen.current!==tab.id||revision!==revisions.current.get(tab.id)||tabsRef.current.find(t=>t.id===tab.id)?.url!==tab.url)return;
      if(isYouTubeVideo(tab.url)){await startMedia(tab,{...media,media:[],subtitles:[],audio:[]});return;}
      const rows=automatic?automaticVideoSources(media.media):playableVideoSources(media.media);if(automatic&&!rows.length&&!isYouTubeVideo(tab.url))return;if(playableInLuna(tab.url)&&rows.length<=1){await startMedia(tab,media);return;}
      if(playableInLuna(tab.url)&&rows.length>1&&!rows.some(r=>r.url===tab.url))rows.unshift({url:tab.url,label:label('Sayfa oynatıcısı','Page player')});
      if(rows.length>1&&!automatic&&!autoPick){setMediaChoice({tab,revision,media,rows});return;}await startMedia(tab,media,rows[0]);
    }catch(e){showError(e);}finally{if(alive.current&&job===mediaJob.current)setMediaBusy(false);}
  }
  useEffect(()=>{if(!active||!autoOpen||!current)return;let cancelled=false,busy=false;const tab={id:current.id,url:current.url};const poll=async()=>{if(busy||mediaBusyRef.current||document.querySelector('.modal-bg'))return;busy=true;try{const media=cleanWebMedia(await native('browser_media',{id:tab.id,probeOnly:true}));const playing=automaticVideoSources(media.media).find(row=>row.playing)||(tabNative[tab.id]?.audio||media.pagePlaying?automaticVideoSources(media.media)[0]:undefined);const key=tab.id+'|'+tab.url+'|'+(playing?.url||'');if(!cancelled&&playing&&!autoSeen.current.has(key)){if(autoSeen.current.size>64)autoSeen.current.clear();autoSeen.current.add(key);await playInLuna(tab,true);}}catch{}finally{busy=false;}};const timer=window.setInterval(()=>void poll(),1800);void poll();return()=>{cancelled=true;clearInterval(timer);};},[active,autoOpen,current?.id,current?.url,tabNative[current?.id??-1]?.audio]);
  async function closeMany(ids: number[]) { for (const id of ids) await closeTab(id); }
  function togglePin(id: number) {
    const result = pinTab(tabsRef.current, pinnedRef.current, id, !pinnedRef.current.has(id));
    setPinned(result.pinned); setTabs(result.tabs);
  }
  function tabMenuItems(id: number): TabMenuItem[] {
    const list = tabsRef.current, tab = list.find(t => t.id === id);
    if (!tab) return [];
    const at = list.indexOf(tab), muted = mutedTabs.includes(id), full = list.length >= 8 || creating, canPlay = !!onPlay && !!mediaAddress(tab.url);
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
      case "ctrl+shift+d": window.dispatchEvent(new Event("luna-open-debug"));return true;
      case "ctrl+k": setToolsOpen(false); setPaletteOpen(true); return true;
      case "alt+f3": window.dispatchEvent(new KeyboardEvent("keydown",{key:"F3",code:"F3",altKey:true,bubbles:true})); return true;
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
        else { const at = list.findIndex(t => t.id === id); chooseTab(list[((at<0?(step>0?-1:0):at) + step + list.length) % list.length].id); }
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
          const text=typeof data.text==="string"?data.text.slice(0,8000):"";const source=webHttpUrl(data.source);const type: CItem["webType"]=["image","video","audio"].includes(data.type)?data.type:url?"link":"page";
          const r=slot.current?.getBoundingClientRect(),dpr=window.devicePixelRatio||1;
          // WebView2 reports the point in the page's own (CSS) pixels: dividing it by the screen scale again put the menu
          // up and to the left of the pointer, over the selected text
          const x=r?r.left+Number(data.x):20,y=r?r.top+Number(data.y):100;
          if(!Number.isFinite(x)||!Number.isFinite(y))return;
          dlog("page menu",{x:data.x,y:data.y,dpr,text:!!text});
          // with selected text the menu opens just under the pointer's line, so the selection stays readable
          setMenu(null);setPageMenu({id:e.id,revision:revisions.current.get(e.id)||0,url,text,source,type,page:tab.url,targetX:Number(data.x),targetY:Number(data.y),x:text?x+4:x,y:text?y+14:y});void getCurrentWebview().setFocus().catch(()=>{});
          // the menu's glass: a picture of the page (the page window is above Luna's, CSS blur can't see it); the menu waits ≤300 ms
          const token=++glassToken.current,at=r;setMenuGlass(g=>{if(g&&g!=="pending")URL.revokeObjectURL(g.src);return at?"pending":null;});
          if(at){const giveUp=window.setTimeout(()=>{if(glassToken.current===token)setMenuGlass(g=>g==="pending"?null:g);},300);
            void invoke<ArrayBuffer|number[]>("browser_snapshot",{id:e.id}).then(raw=>{window.clearTimeout(giveUp);if(glassToken.current!==token)return;
              const src=URL.createObjectURL(new Blob([raw instanceof ArrayBuffer?raw:new Uint8Array(raw)],{type:"image/jpeg"}));
              setMenuGlass(g=>{if(g==="pending")return{src,x:at.left,y:at.top,w:at.width,h:at.height};URL.revokeObjectURL(src);return g;});
            }).catch(()=>{window.clearTimeout(giveUp);if(glassToken.current===token)setMenuGlass(g=>g==="pending"?null:g);});}
        }catch{}return;
      }
      if (e.kind === "key") { if (chosen.current === e.id) void getCurrentWebview().setFocus().catch(() => {}).then(() => shortcutRef.current(e.value)); return; }
      if (e.kind === "navigate" || e.kind === "loading") { if(chosen.current===e.id){selectedText.current=null;setPageMenu(null);} loadingNow.current.add(e.id); titles.current.delete(e.id); }
      if (e.kind === "title") { titles.current.set(e.id, e.value.trim()); retitleRef.current(e.id); }
      if (e.kind === "loaded") { committed.current.set(e.id, e.value); if(selectedText.current?.id===e.id&&selectedText.current.page.url!==e.value)selectedText.current=null;
        const origin=siteOrigin(e.value),pref=prefsRef.current[origin],choice=tabMuteChoice.current.get(e.id);const muted=choice?.origin===origin?choice.muted:pref?.muted??false;void native("browser_action",{id:e.id,action:muted?"mute":"unmute"},()=>alive.current&&known.current.has(e.id)&&committed.current.get(e.id)===e.value).then(()=>{if(alive.current)setMutedTabs(old=>muted?[...new Set([...old,e.id])]:old.filter(id=>id!==e.id));}).catch(()=>{});
        loadingNow.current.delete(e.id); rememberRef.current(e.id, e.value);
        const want = zoomFor(zoomMemory.current, e.value);
        zoomEcho.current.set(e.id,{zoom:want,url:e.value});
        void native("browser_action", { id: e.id, action: "zoom", zoom: want }, () => alive.current && known.current.has(e.id) && committed.current.get(e.id) === e.value).then(() => { if (alive.current && committed.current.get(e.id) === e.value) setTabNative(m => patchNative(m, e.id, { zoom: want })); }).catch(() => {});
      }
      if (e.kind === "navigate" || e.kind === "loading") {
        revisions.current.set(e.id, (revisions.current.get(e.id) || 0) + 1);
        if (chosen.current === e.id) invalidator.current();
        if (chosen.current === e.id) setTranslationNote("");
      }
      if(e.kind === "loaded" && pendingScroll.current?.url === e.value && pendingScroll.current.id===e.id){const pending=pendingScroll.current;pendingScroll.current=null;void native("browser_position",{id:e.id,action:"scroll",expectedUrl:e.value,fraction:pending.progress}).catch(showError);}
      if(e.kind==="loaded" && pendingScroll.current?.id===e.id && pendingScroll.current.url!==e.value)pendingScroll.current=null;
      if (e.kind === "popup") { const tab=tabsRef.current.find(t=>t.id===e.id),pref=prefsRef.current[siteOrigin(tab?.url||"")];if(pref?.popups==="block")return;if(chosen.current===e.id&&shown.current){void addRef.current(e.value);return;} return; }
      if (e.kind !== "title" && e.kind !== "history") dlog("event", e.id, e.kind);
      if (e.kind === "download-rejected") {showError(e.value);return;}
      if (e.kind === "download-start") {const back=committed.current.get(e.id);setTabs(ts=>ts.map(t=>t.id===e.id?{...t,url:back??t.url,loading:false}:t));setBrowserNotice(label("İndirme başladı. Araçlar › İndirmeler bölümünden yönetebilirsin.","Download started. Manage it in Tools › Downloads."));return;}
      if (e.kind === "blocked") { if (chosen.current === e.id) showError(label("Bu bağlantı güvenli bir web sayfası değil; açılmadı.", "This link is not a regular web page, so it was not opened.")); return; }
      if (e.kind === "history") { const h = parseHistory(e.value); if (h) setTabNative(m => patchNative(m, e.id, h)); return; }
      if (e.kind === "audio") { const audio = parseAudio(e.value); if (audio !== null) setTabNative(m => patchNative(m, e.id, { audio })); return; }
      if (e.kind === "zoom") {
        const zoom=parseZoom(e.value);if(zoom===null)return;
        setTabNative(m=>patchNative(m,e.id,{zoom}));
        const echo=zoomEcho.current.get(e.id),url=committed.current.get(e.id);zoomEcho.current.delete(e.id);
        if(url&&!loadingNow.current.has(e.id)&&userZoomChange(echo?.url===url?echo.zoom:undefined,zoom)){
          const next=rememberZoom(zoomMemory.current,url,zoom);if(next!==zoomMemory.current){zoomMemory.current=next;try{localStorage.setItem("lunaWebSiteZoom",JSON.stringify(next));}catch{}}
        }return;
      }
      if (e.kind === "permission") { if (chosen.current === e.id) setBrowserNotice(permissionNotice(e.value, lang() === "tr")); return; }
      if (e.kind === "store-install") {
        const url=tabsRef.current.find(t=>t.id===e.id)?.url||"";
        // The id comes from the store button or the CRX download; an empty id means "the extension of this store page".
        let ok=false;try{const u=new URL(url),page=u.pathname.split("/").find(p=>/^[a-p]{32}$/.test(p));ok=u.protocol==="https:"&&["chromewebstore.google.com","chrome.google.com"].includes(u.hostname)&&!!page&&(!e.value||e.value===page);}catch{}
        if(ok&&chosen.current===e.id&&shown.current)setStoreInstall({url,key:Date.now()});
        return;
      }
      if (e.kind === "nav-done") {
        // A late answer of an older navigation carries another address: it must not touch the page in use.
        const done = parseNavDone(e.value), tab = tabsRef.current.find(t => t.id === e.id);
        // History bookkeeping does not wait for the tab state: a failed address is never a visit, a loaded one is again allowed.
        if (done) { if (done.ok&&done.http<400) failedNav.current.delete(done.url); else if (!stopping.current.has(e.id)) forgetRef.current(done.url); }
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
    let last = "", busy = false, again = false, disposed = false, awaySince = 0;
    const place = async () => {
      if (disposed) return; if (busy) { again = true; return; }
      const r = slot.current?.getBoundingClientRect();
      // The tools menu is cut out of the page like the small chat, so the page stays visible beside it.
      const chatElement = Array.from(document.querySelectorAll<HTMLElement>(".chat-panel,.browser-tools-pop,.browser-extensions-pop,.browser-store-install,.browser-collections-pop,.browser-suggest,.browser-tab-menu:not(.is-uncut),.dev-notebook,.global-search,.browser-luna-pop,.browser-talk,.clip-offer,.toast")).find(el=>el.getClientRects().length>0);
      const chat = chatElement?.getBoundingClientRect();
      // a glass menu asks for a wider hole (data-cut-pad) so its shadow falls on the page's picture, not a hard edge
      const chatPad = Number(chatElement?.dataset.cutPad) || 0;
      const extraOverlays=Array.from(document.querySelectorAll<HTMLElement>(".chat-panel,.browser-tools-pop,.browser-extensions-pop,.browser-store-install,.browser-collections-pop,.browser-suggest,.browser-tab-menu:not(.is-uncut),.dev-notebook,.global-search,.browser-luna-pop,.voice-mode,.browser-talk,.clip-offer,.toast")).filter(el=>el!==chatElement&&el.getClientRects().length).slice(0,7).map(el=>{const r=el.getBoundingClientRect(),dpr=window.devicePixelRatio,p=Number(el.dataset.cutPad)||6;return{x:Math.round((r.left-p)*dpr),y:Math.round((r.top-p)*dpr),width:Math.ceil((r.width+2*p)*dpr),height:Math.ceil((r.height+2*p)*dpr),radius:14*dpr};});
      // The music / small film dock floats over the page: its exact shape is cut out of the page window, so the page keeps
      // its full height and nothing resizes when the dock comes or goes (the strip above it is the seek line).
      // When a web video starts (dock-away), the cut stays for the whole slide even while the dock fades, so the page never
      // covers the dock at the first frame; it is dropped only after the slide has ended.
      const away=!!document.querySelector(".root.dock-away");if(!away)awaySince=0;else if(!awaySince)awaySince=performance.now();const leaving=away&&performance.now()-awaySince<1500;
      for(const dock of Array.from(document.querySelectorAll<HTMLElement>(".mu-dock"))){if(extraOverlays.length>=7)break;const d=dock.getBoundingClientRect(),st=getComputedStyle(dock),dpr=window.devicePixelRatio;if(!d.width||(!leaving&&(Number(st.opacity)<.05||st.visibility==="hidden")))continue;// The cut reaches from the dock down to the window's bottom edge: when a web video starts, the page is busy for about
      // a second and the cut cannot follow, but the dock sliding down stays inside it the whole way.
      extraOverlays.push({x:Math.round(d.left*dpr),y:Math.round((d.top-8)*dpr),width:Math.ceil(d.width*dpr),height:Math.ceil((Math.max(d.height,window.innerHeight-d.top)+8)*dpr),radius:Math.ceil((parseFloat(st.borderTopLeftRadius)||16)*dpr)});}
      const covered = Array.from(document.querySelectorAll<HTMLElement>('.modal-bg,.chat-ws,.menu-pop,.card-menu,.bk-reader,.mu-np,.dev-crop,[role="dialog"]:not(.browser-tools-pop):not(.browser-extensions-pop)')).some(el=>el.getClientRects().length>0&&getComputedStyle(el).visibility!=="hidden"&&getComputedStyle(el).pointerEvents!=="none");
      const right = r?.right ?? 0;
      setNeedsRoom(!!(active && r && right - r.left < 240));
      const visible = active && !document.hidden && r && right - r.left >= 240 && r.height >= 100 && !covered;
      const dpr = window.devicePixelRatio;
      // the mini video sits in the dock above a book being read: only a real cover (dialog, menu…) hides it
      const coveredMini = Array.from(document.querySelectorAll<HTMLElement>('.modal-bg,.chat-ws,.menu-pop,.card-menu,.mu-np,.dev-crop,[role="dialog"]:not(.browser-tools-pop):not(.browser-extensions-pop)')).some(el=>el.getClientRects().length>0&&getComputedStyle(el).visibility!=="hidden"&&getComputedStyle(el).pointerEvents!=="none");
      const surface = !active && miniTab !== null && !coveredMini ? document.querySelector<HTMLElement>(".web-mini-surface")?.getBoundingClientRect() : undefined;
      const miniBounds = surface && surface.width >= 8 && surface.height >= 8 ? { x: Math.round(surface.left * dpr), y: Math.round(surface.top * dpr), width: Math.floor(surface.width * dpr), height: Math.floor(surface.height * dpr), overlay: null } : null;
      const bounds = visible && r ? { x: Math.round(r.left * dpr), y: Math.round(r.top * dpr), width: Math.floor((right - r.left) * dpr), height: Math.floor(r.height * dpr),
        overlay: chat && chatElement ? {
          x: Math.round((chat.left - chatPad) * dpr), y: Math.round((chat.top - chatPad) * dpr),
          width: Math.ceil((chat.width + 2 * chatPad) * dpr), height: Math.ceil((chat.height + 2 * chatPad) * dpr),
          radius: Math.ceil((parseFloat(getComputedStyle(chatElement).borderTopLeftRadius) || 0) * dpr),
        } : null,
      } : null;
      const bubble = document.querySelector<HTMLElement>(".ai-bubble")?.getBoundingClientRect();
      const bubbleSize = bubble ? Math.ceil((bubble.width + 16) * dpr) : 0;
      const bubbleBounds = visible && selected !== null && bubble && bubble.width>0 && !document.body.classList.contains("voice-on") ? {
        visible: true, x: Math.max(0, Math.round((bubble.left - 8) * dpr)), y: Math.max(0, Math.round((bubble.top - 8) * dpr)), size: bubbleSize,
        color: getComputedStyle(document.documentElement).getPropertyValue("--accent").trim(),
      } : { visible: false };
      const signature = JSON.stringify([selected, bounds, [...known.current], bubbleBounds,extraOverlays,miniTab,miniBounds]);
      // a menu waits for its hole to open (or close) before it animates: tell it once the page has it
      const menuCut = !!document.querySelector(".browser-tab-menu:not(.is-uncut)");
      const told = () => window.dispatchEvent(new CustomEvent("luna-web-layer-done", { detail: { menu: menuCut } }));
      if (last === signature) { told(); return; } last = signature; busy = true;
      const cover = document.querySelector('.modal-bg,.chat-ws,.menu-pop,.card-menu,.bk-reader,.mu-np,[role="dialog"]:not(.browser-tools-pop)');
      dlog("layer", { selected, visible, covered: cover ? cover.className || cover.tagName : null, cut: chatElement?.className ?? null, bounds, bubble: bubbleBounds, tabs: [...known.current], dpr });
      try {
        // the calls run one after another (0.2–0.5 s each while Luna is busy): the tab on screen goes first, and a tab
        // already hidden is not hidden again (leaving Web waited for every old tab before the page on screen went away)
        const order = [...known.current].sort((x, y) => Number(nativeHidden.current.has(x)) - Number(nativeHidden.current.has(y)));
        for (const id of order) {
          if (id === selected && bounds) { nativeHidden.current.delete(id); await native("browser_bounds", { id, ...bounds,overlays:extraOverlays },()=>!disposed&&alive.current&&known.current.has(id)); }
          else if (id === miniTab && miniBounds) { nativeHidden.current.delete(id); await native("browser_bounds", { id, ...miniBounds },()=>!disposed&&alive.current&&known.current.has(id)); }
          else if (!nativeHidden.current.has(id)) { await native("browser_action", { id, action: "hide" },()=>!disposed&&alive.current&&known.current.has(id)); nativeHidden.current.add(id); }
        }
        await native("browser_bubble", bubbleBounds,()=>!disposed&&alive.current);
        told();
      } catch (e) { if(disposed)return;last = ""; dlog("layer error", String((e as any)?.message ?? e)); showError(e); } finally { busy = false; if (again) { again = false; void place(); } }
    };
    // a menu opening or closing asks right away instead of waiting for the next 160 ms step
    const asked = () => { if (busy) again = true; else void place(); };
    window.addEventListener("luna-web-layer", asked);
    const interval = active || miniTab !== null ? window.setInterval(place, 160) : 0; void place();
    // While a dock slides or fades, the page cut-out follows it every frame (160 ms steps would show the page over it).
    let burst=0,until=0;const follow=()=>{if(disposed||performance.now()>until){burst=0;return;}void place();burst=requestAnimationFrame(follow);};
    const moving=(e:Event)=>{if(!(active||miniTab!==null)||!(e.target as HTMLElement|null)?.classList?.contains("mu-dock"))return;until=performance.now()+1500;if(!burst)burst=requestAnimationFrame(follow);};
    document.addEventListener("animationstart",moving,true);document.addEventListener("transitionrun",moving,true);
    return () => { disposed = true; window.removeEventListener("luna-web-layer", asked); clearInterval(interval); cancelAnimationFrame(burst); document.removeEventListener("animationstart",moving,true); document.removeEventListener("transitionrun",moving,true); };
  }, [active, selected, tabs.length, miniTab]);
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
  const playLuna = current && onPlay && mediaAddress(current.url) ? <button type="button" disabled={mediaBusy} className={compact ? "browser-play-chip" : "browser-play-luna"} aria-label={compact ? (mediaBusy ? label("Video aranıyor…","Finding video…") : label("Luna'da oynat", "Play in Luna")) : undefined} title={label("Bu sayfayı Luna'nın kendi oynatıcısında aç", "Open this in Luna's own player")} onClick={() => playInLuna(current)}><WebIcon name="play" size={13}/><span>{mediaBusy&&!compact?label("Video aranıyor…","Finding video…"):compact?(mediaBusy?"Luna…":"Luna"):label("Luna'da oynat", "Play in Luna")}</span></button> : null;
  const goTo = (to: WebNavTarget) => { setLunaMenu(false); onNav?.(to); };
  type TalkAction = { text: string; run: () => void; primary?: boolean; disabled?: boolean };
  type Talk = { kind: "info" | "error" | "ask" | "work"; icon: Parameters<typeof WebIcon>[0]["name"]; text: string; actions: TalkAction[]; close?: () => void };
  const noticeIcon = (text: string): Talk["icon"] => /favori|favourite|bookmark/i.test(text) ? "star" : /kopyala|copied/i.test(text) ? "copy" : /indirme|download/i.test(text) ? "download" : /okuma|reading/i.test(text) ? "reader" : /izin|permission|kamera|camera|mikrofon|microphone|konum|location/i.test(text) ? "warning" : "spark";
  const talk: Talk | null = !compact || focusSource === "bar" ? null
    : popup ? { kind: "ask", icon: "external", text: label("Yeni sayfa isteği: ", "New page request: ") + hostOf(popup.url), actions: [{ text: label("Yeni sekmede aç", "Open in new tab"), primary: true, run: () => { void add(popup.url); setPopup(null); } }], close: () => setPopup(null) }
    : error ? { kind: "error", icon: "warning", text: error, actions: current ? [{ text: label("Tekrar dene", "Retry"), primary: true, disabled: current.loading, run: () => { setError(""); void action("reload"); } }] : [], close: () => setError("") }
    : translating || translationNote ? { kind: "work", icon: "translate", text: translationNote || label("Sayfa çevriliyor…", "Translating the page…"),
        actions: translating ? [{ text: label("İptal", "Cancel"), run: () => { cancelTranslation.current = true; setTranslationNote(label("Durduruluyor; gönderilmiş isteğin yanıtı uygulanmayacak.", "Stopping; the in-flight reply will not be applied.")); } }]
          : canRetry ? [{ text: label("Kalanı çevir", "Translate the rest"), primary: true, run: () => void translatePage(retryTranslation.current?.target || targetLanguage).catch(showError) }] : [],
        close: translating ? undefined : () => { setTranslationNote(""); setCanRetry(false); } }
    : browserNotice ? { kind: "info", icon: noticeIcon(browserNotice), text: browserNotice, actions: [], close: () => setBrowserNotice("") }
    : null;
  useEffect(()=>{
    if(!active)return;
    const root=document.documentElement;root.classList.add('luna-web-notices');
    const placeNotices=()=>{
      const address=addressInput.current?.closest('.browser-address-wrap')?.getBoundingClientRect();
      let top=Math.max(0,address?.bottom??slot.current?.getBoundingClientRect().top??64)+10;
      for(const pop of document.querySelectorAll<HTMLElement>('.browser-extensions-pop,.browser-tools-pop,.browser-collections-pop')){if(pop.getClientRects().length)top=Math.max(top,pop.getBoundingClientRect().bottom+8);}
      for(const [selector,key] of [['.browser-talk','--luna-web-notice-top'],['.clip-offer','--luna-web-import-top'],['.toast','--luna-web-toast-top']]){
        const value=Math.round(top)+'px';if(root.style.getPropertyValue(key)!==value)root.style.setProperty(key,value);
        const el=document.querySelector<HTMLElement>(selector);if(el?.getClientRects().length)top+=el.getBoundingClientRect().height+8;
      }
    };
    placeNotices();const changes=new MutationObserver(placeNotices);changes.observe(document.body,{childList:true,subtree:true});
    const sizes=new ResizeObserver(placeNotices);if(addressInput.current)sizes.observe(addressInput.current);sizes.observe(document.body);
    window.addEventListener('resize',placeNotices);
    return()=>{changes.disconnect();sizes.disconnect();window.removeEventListener('resize',placeNotices);root.classList.remove('luna-web-notices');for(const key of ['--luna-web-notice-top','--luna-web-import-top','--luna-web-toast-top'])root.style.removeProperty(key);};
  },[active,compact,selected]);
  const talkEl = talk && <div className={"browser-talk is-" + talk.kind} key={talk.kind + talk.text} role={talk.kind === "error" ? "alert" : "status"}>
    <span className="browser-talk-icon" aria-hidden="true"><WebIcon name={talk.icon} size={14}/></span>
    <span className="browser-talk-text" title={talk.text} onClick={() => { talk.close?.(); addressInput.current?.focus(); }}>{talk.text}</span>
    {talk.actions.map(a => <button key={a.text} type="button" className={a.primary ? "is-primary" : ""} disabled={a.disabled} onClick={a.run}>{a.text}</button>)}
    {talk.close && <button type="button" className="browser-talk-close" aria-label={label("Bildirimi kapat", "Dismiss")} title={label("Kapat", "Dismiss")} onClick={talk.close}><WebIcon name="close" size={13}/></button>}
  </div>;
  // Tools: beside the address in the classic layout, at the right end of the address capsule in the one-row layout.
  const toolsEl = (
        <div className="browser-tools-anchor"><button className={"browser-tools-toggle" + (toolsOpen ? " on" : "")} aria-label={label("Sayfa araçları", "Page tools")} aria-expanded={toolsOpen} title={label("Çeviri ve sayfa araçları", "Translation and page tools")} onClick={() => setToolsOpen(v => !v)}><WebIcon name={compact ? "more" : "translate"} size={18}/><span>{label("Araçlar", "Tools")}</span></button>
          {toolsOpen && <div className="browser-tools-pop extra-browser-tools" role="dialog" aria-label={label("Sayfa araçları", "Page tools")}>
            <BrowserAdBlock/>
            <label className="look-check browser-menu-action"><input type="checkbox" checked={compact} onChange={e=>setLayout(e.target.checked)}/><span>{label('Tek satır tarayıcı görünümü','One-row browser layout')}</span></label>
            <label className="look-check browser-menu-action"><input type="checkbox" checked={autoPick} onChange={e=>{const on=e.target.checked;if(store.set('webAutoPick',on?'1':'0'))setAutoPick(on);}}/><span>{label('En uygun kaynağı otomatik seç','Automatically choose the best source')}</span></label>
            <label className="look-check browser-menu-action"><input type="checkbox" checked={autoOpen} onChange={e=>{const on=e.target.checked;if(store.set('webAutoOpen',on?'1':'0'))setAutoOpen(on);}}/><span>{label('Web videolarını Luna’da otomatik aç','Automatically open web videos in Luna')}</span></label>
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
            <button className="browser-menu-action" onClick={()=>{setToolsOpen(false);setWorkspaceOpen(true);}}><WebIcon name="book" size={17}/>{label("Sekmeler ve favoriler","Tabs and favourites")}</button><button className="browser-menu-action" disabled={!closedTabs.length||creating||tabs.length>=8} onClick={()=>{setToolsOpen(false);void reopenClosed();}}><WebIcon name="reload" size={17}/>{label("Kapatılan sekmeyi geri aç","Reopen closed tab")}<small>Ctrl+Shift+T</small></button><button className="browser-menu-action" disabled={!current||creating||tabs.length>=8} onClick={()=>{setToolsOpen(false);if(current)void add(current.url);}}><WebIcon name="plus" size={17}/>{label("Sekmeyi çoğalt","Duplicate tab")}</button><button className="browser-menu-action" disabled={!current} onClick={()=>{setToolsOpen(false);if(current)void copyAssistantText(current.url).then(()=>{if(alive.current)setBrowserNotice(label("Sayfa bağlantısı kopyalandı.","Page link copied."));}).catch(showError);}}><WebIcon name="external" size={17}/>{label("Sayfa bağlantısını kopyala","Copy page link")}</button><hr/><div className="browser-pop-head"><b>{label("Bu sayfa", "This page")}</b><button aria-label={label("Kapat", "Close")} onClick={() => setToolsOpen(false)}><WebIcon name="close" size={15}/></button></div><label className="browser-language-label">{label("Kaynak dil (sayfada belirtilmemişse)","Source language (when unspecified)")}<select value={translationSource} disabled={translating} onChange={e=>{setTranslationSource(e.target.value);retryTranslation.current=null;}}>{TRANSLATION_LANGUAGES.map(l=><option key={l}>{l}</option>)}</select></label><label className="browser-language-label">{label("Çeviri dili", "Translate into")}<select aria-label={label("Sayfa çeviri dili", "Page translation language")} value={targetLanguage} onChange={e => {setTargetLanguage(e.target.value);try{localStorage.setItem("lunaWebTranslationLanguage",e.target.value);}catch(e){showError(e);}}}>{TRANSLATION_LANGUAGES.map(language => <option key={language}>{language}</option>)}</select></label>{current&&translatedPages[current.id]===(revisions.current.get(current.id)||0)?<button className="browser-menu-action" disabled={translating} onClick={() => { setToolsOpen(false); void translatePage("restore").catch(showError); }}><WebIcon name="reload" size={17}/>{label("Özgün sayfaya dön", "Restore original")}</button>:<button className="browser-menu-action" disabled={!current || translating} onClick={() => { setToolsOpen(false); void translatePage(targetLanguage).catch(showError); }}><WebIcon name="translate" size={17}/>{translating ? label("Çevriliyor…", "Translating…") : label("Sayfayı çevir", "Translate page")}</button>}<hr/><div className="browser-zoom-row" role="group" aria-label={label("Sayfa yakınlığı", "Page zoom")}><button disabled={!current} aria-label={label("Uzaklaştır", "Zoom out")} title="Ctrl -" onClick={() => zoomBy(-1)}>−</button><output aria-live="polite">{Math.round(nowNative.zoom * 100)}%</output><button disabled={!current} aria-label={label("Yakınlaştır", "Zoom in")} title="Ctrl +" onClick={() => zoomBy(1)}>+</button><button disabled={!current || nowNative.zoom === 1} onClick={() => setPageZoom(1)}>{label("Sıfırla", "Reset")}</button></div><hr/><button className="browser-menu-action" disabled={!current || reading} onClick={() => { setToolsOpen(false); void readPage(); }}><WebIcon name="spark" size={17}/>{label("Sayfayı asistana ver", "Share page with Luna")}</button><button className="browser-menu-action" disabled={!current} onClick={() => current && openUrl(current.url).catch(showError)}><WebIcon name="external" size={17}/>{label("Dış tarayıcıda aç", "Open in your browser")}</button><small>{label("Çeviri Chrome’daki gibi Google Çeviri ile yapılır; sayfayla ilgili sorular seçili AI profilini kullanır.", "Translation uses Google Translate, like Chrome; page questions use your selected AI profile.")}</small>            <button className="browser-menu-action" disabled={!current||!archivable(current.url)} title={label("Sayfa açılmıyorsa ya da değiştiyse Internet Archive'daki son kopyasını açar","Opens the Internet Archive's newest copy when a page is gone or has changed")} onClick={async()=>{setToolsOpen(false);if(!current)return;try{const text=await invoke<string>("http_text",{url:waybackApi(current.url)});const copy=waybackSnapshot(JSON.parse(text));if(copy)action("navigate",copy);else setError(label("Bu sayfanın arşivde kopyası yok.","There is no archived copy of this page."));}catch{setError(label("Arşiv şu an yanıt vermedi.","The archive did not answer."));}}}><WebIcon name="external" size={17}/>{label("Arşiv kopyasını aç","Open archived copy")}</button><hr/><BrowserExtras key={current?.url||"home"} url={current?.url} title={current?.title} position={async()=>{if(!current)throw Error("Önce sayfa aç.");return native<{url:string;progress:number}>("browser_position",{id:current.id,action:"read",expectedUrl:current.url});}} openReading={(url,progress)=>{pendingScroll.current={id:current?.id??null,url,progress};setToolsOpen(false);if(current?.url===url){pendingScroll.current=null;void native("browser_position",{id:current.id,action:"scroll",expectedUrl:url,fraction:progress}).catch(showError);}else void action("navigate",url);}}/></div>}

        </div>
  );
  return <><section className={"browser-shell" + (!current ? " is-start" : "") + (cinema?" is-cinema":"") + (compact?" is-compact":"")} hidden={!active} aria-label="Luna Web">
    {workspaceOpen&&<BrowserWorkspace tabs={tabs} selected={selected} select={chooseTab} move={(id,direction)=>setTabs(rows=>stepTab(rows,id,direction,pinnedRef.current))} closeTab={closeTab} closed={closedTabs} reopen={reopenClosed} add={add} close={()=>setWorkspaceOpen(false)} bookmarks={bookmarks} saveBookmarks={rows=>{localStorage.setItem("lunaWebBookmarks",JSON.stringify(rows));setBookmarks(rows);}}/>}
    {cinema&&<div className="browser-cinema-bar"><span>{current?.title}</span><button className="chip" onClick={()=>{setFocusMode(false);if(fullscreen&&current)void native("browser_action",{id:current.id,action:"exit-fullscreen"}).catch(showError);}}>{label("İzleme görünümünden çık","Exit watch view")}</button></div>}
    <div className="browser-chrome">
      <div className="browser-tabstrip">
        {compact && <div className={"browser-luna-anchor" + (lunaMenu ? " is-open" : "")}>
          {/* Hovering the logo widens it into Luna's parts; a click opens the full menu. */}
          <div className="browser-luna-rail">
            <button className={"browser-luna-logo" + (lunaMenu ? " on" : "")} aria-expanded={lunaMenu} aria-label={label("Luna menüsü", "Luna menu")} onClick={() => setLunaMenu(v => !v)}><LunaMark size={26} uid="lm-web"/></button>
            <div className="browser-luna-rail-modes">
              <button tabIndex={lunaMenu ? 0 : -1} onClick={() => goTo("film")}><WebIcon name="film" size={15}/>{label("Film", "Film")}</button>
              <button tabIndex={lunaMenu ? 0 : -1} onClick={() => goTo("music")}><WebIcon name="music" size={15}/>{label("Müzik", "Music")}</button>
              <button tabIndex={lunaMenu ? 0 : -1} onClick={() => goTo("books")}><WebIcon name="book" size={15}/>{label("Kitap", "Books")}</button>
              <button tabIndex={lunaMenu ? 0 : -1} className="on" aria-current="page" onClick={() => setLunaMenu(false)}><WebIcon name="globe" size={15}/>Web</button>
              <span className="browser-luna-rail-sep" aria-hidden="true"/>
              <button tabIndex={lunaMenu ? 0 : -1} className="is-round" aria-label={label("Koleksiyonlar", "Collections")} title={label("Koleksiyonlar", "Collections")} onClick={() => goTo("mine")}><WebIcon name="grid" size={15}/></button>
              <button tabIndex={lunaMenu ? 0 : -1} className="is-round" aria-label={label("Ayarlar", "Settings")} title={label("Ayarlar", "Settings")} onClick={() => goTo("settings")}><WebIcon name="settings" size={15}/></button>
            </div>
          </div>
        </div>}
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
        <div className={"browser-address-wrap" + (focusSource === "bar" ? " is-typing" : "")}><form className={"browser-address" + (showPretty ? " is-pretty" : "") + (insecure ? " is-insecure" : "")} role="search" onSubmit={e => { e.preventDefault(); addressDirty.current = false; setAddressEdited(false); void action("navigate", address); }}>
          <WebIcon name={insecure ? "warning" : current?.url.startsWith("https:") ? "lock" : "search"} size={15}/>
          <span className="browser-addr-field">
          <input ref={addressInput} role="combobox" aria-autocomplete="list" aria-expanded={focusSource === "bar" && suggestions.length > 0} aria-controls="browser-suggest" aria-activedescendant={focusSource === "bar" && suggestAt >= 0 ? "browser-suggest-" + suggestAt : undefined}
            aria-label={label("Web adresi veya arama", "Web address or search")} placeholder={label("Bir adres yaz veya web’de ara", "Search the web or enter an address")} value={address}
            onChange={e => { addressDirty.current = true; setAddress(e.target.value); setAddressEdited(true); setSuggestAt(-1); }}
            onFocus={e => { setFocusSource("bar"); focusSelect.current = true; e.currentTarget.select(); }} onMouseUp={e => { if (focusSelect.current) { e.preventDefault(); focusSelect.current = false; } }}
            onBlur={() => { focusSelect.current = false; setFocusSource(null); setAddressEdited(false); setSuggestAt(-1); }}
            onKeyDown={e => { if (e.key === "Enter" && e.altKey && address.trim() && !e.nativeEvent.isComposing && !composing.current) { e.preventDefault(); addressDirty.current = false; setAddressEdited(false); setSuggestAt(-1); void add(address); return; } if (suggestKeys(e)) return; if (e.key === "Escape" && current && !composing.current && !e.nativeEvent.isComposing) { e.preventDefault(); addressDirty.current = false; setAddress(current.url); e.currentTarget.select(); } }}
            onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} autoComplete="off" spellCheck={false}/>
          {showPretty && <span className="browser-address-view" aria-hidden="true">{searchWords ? <><b>{searchWords}</b><i>{hostOf(current!.url)}</i></> : pretty ? <><b>{pretty.host}</b><i>{pretty.rest}</i></> : null}</span>}
          {!current && <kbd>Ctrl L</kbd>}
          </span>
          {compact && playLuna}
          {current && nowNative.zoom !== 1 && <button type="button" className="browser-zoom-chip" aria-label={label(`Yakınlaştırma %${Math.round(nowNative.zoom * 100)}; sıfırlamak için tıkla`, `Zoom ${Math.round(nowNative.zoom * 100)}%; click to reset`)} title={label("Yakınlaştırmayı sıfırla · Ctrl+0", "Reset zoom · Ctrl+0")} onClick={() => setPageZoom(1)}>{Math.round(nowNative.zoom * 100)}%</button>}
          {current && <button type="button" disabled={readerBusy} aria-pressed={!!reader} className={reader?"on":undefined} aria-label={label("Okuma modu", "Reading view")} title={label("Okuma modu · Ctrl+Shift+R", "Reading view · Ctrl+Shift+R")} onClick={() => void openReader()}><WebIcon name="reader" size={16}/></button>}
          <BrowserExtensionToolbar hasTab={tabs.length>0} tab={selected} manage={()=>setManager("extensions")}/>
          {storeInstall&&<BrowserStoreInstall request={storeInstall} close={closeStoreInstall}/>}
          {current&&translatedPages[current.id]===(revisions.current.get(current.id)||0)&&<button type="button" disabled={translating} aria-label={label("Orijinal dilinde göster","Show original language")} title={label("Orijinal dilinde göster","Show original language")} onClick={()=>void translatePage("restore").catch(showError)}><WebIcon name="translate" size={16}/></button>}
          {<button type="button" data-browser-collections aria-label={label("Web koleksiyonlarını aç", "Open web collections")} aria-expanded={collectionsOpen} title={label("Koleksiyonlar · Sağ tık: bu sayfayı ekle", "Collections · Right-click: add this page")} onClick={()=>setCollectionsOpen(v=>!v)} onContextMenu={e=>{e.preventDefault();collectPage();}}><WebIcon name="collection" size={16}/></button>}
          {current&&(playlistAddress(current.url)||(()=>{try{const u=new URL(current.url);return ((["youtube.com","www.youtube.com"].includes(u.hostname)&&u.pathname==="/watch"&&u.searchParams.has("v"))||(u.hostname==="youtu.be"&&u.pathname.length>1)||(u.hostname==="open.spotify.com"&&u.pathname.includes("/track/")));}catch{return false;}})())?<button className="browser-playlist-import" type="button" aria-label={label("Müziği içe aktar","Import music")} title={label("Müziği içe aktar","Import music")} onClick={()=>{setToolsOpen(false);window.dispatchEvent(new CustomEvent("luna-import-playlist",{detail:current.url}));}}><span style={{display:"inline-flex",transform:"rotate(90deg)"}}><WebIcon name="arrow" size={16}/></span></button>:<button type="submit" aria-label={label("Adrese git", "Go")}><WebIcon name="arrow" size={16}/></button>}</form>
          {focusSource === "bar" && suggestions.length > 0 && suggestList}{compact && toolsEl}</div>
        {!compact && playLuna}
        {!compact && toolsEl}
      </div>
      {current?.loading && <div className="browser-progress" role="progressbar" aria-label={label("Sayfa yükleniyor", "Page loading")}/>}
      {current && bookmarks.length > 0 && <div className="browser-bookmarks">{bookmarks.slice(0, 12).map(b => <button key={b.url} title={b.url + "\n" + label("Ctrl+tık veya orta tık: yeni sekme", "Ctrl+click or middle-click: new tab")} onClick={e => { if (e.ctrlKey || e.metaKey) void add(b.url); else void action("navigate", b.url); }} onAuxClick={e => { if (e.button === 1) { e.preventDefault(); void add(b.url); } }} onMouseDown={e => { if (e.button === 1) e.preventDefault(); }}><SiteAvatar url={b.url} size={16}/>{b.title}</button>)}</div>}
    </div>
    {!cinema&&current&&items.length>0&&<PageLibrarySignal url={current.url} title={current.title} items={items} open={onLibraryOpen}/>}
    {findOpen && current && <FindBar query={findQuery} setQuery={setFindQuery} result={findResult} busy={findBusy} matchCase={findCase} setMatchCase={setFindCase} step={d => void runFind(d > 0 ? "next" : "prev")} close={closeFind}/>}
    {!compact&&browserNotice&&<div className="browser-notice" role="status"><WebIcon name="star" size={13}/>{browserNotice}</div>}
    {!compact && error && <div className="browser-alert" role="alert"><span>{error}</span>{current&&<button disabled={current.loading} onClick={()=>void action("reload")}>{label("Tekrar dene","Retry")}</button>}<button onClick={() => setError("")} aria-label={label("Uyarıyı kapat", "Dismiss")}><WebIcon name="close" size={16}/></button></div>}
    {!compact && popup && <div className="browser-alert"><span title={popup.url}>{label("Yeni sayfa isteği:", "New page request:")} {hostOf(popup.url)}</span><button onClick={() => { void add(popup.url); setPopup(null); }}>{label("Yeni sekmede aç", "Open in new tab")}</button><button onClick={() => setPopup(null)} aria-label={label("İsteği yok say", "Dismiss request")}><WebIcon name="close" size={15}/></button></div>}
    {active&&talkEl&&createPortal(talkEl,document.body)}
    {localSelection&&<BrowserLocalTranslation {...localSelection} close={()=>setLocalSelection(null)}/>}
    {!compact && (translationNote||translating) && <div className="browser-translation-status" role="status"><WebIcon name="translate" size={14}/><span>{translationNote}</span>{translating&&<button className="chip" onClick={()=>{cancelTranslation.current=true;setTranslationNote(label("Durduruluyor; gönderilmiş isteğin yanıtı uygulanmayacak.","Stopping; the in-flight reply will not be applied."));}}>{label("İptal","Cancel")}</button>}{canRetry&&!translating&&<button className="chip" onClick={()=>void translatePage(retryTranslation.current?.target||targetLanguage).catch(showError)}>{label("Başarısız bölümden devam et","Retry remaining sections")}</button>}</div>}
    <div className="browser-surface" ref={slot} aria-busy={!!current?.loading}>
      {current && needsRoom && <div className="browser-space-note"><WebIcon name="globe" size={32}/><p>{label("Web sayfasını göstermek için pencereyi biraz genişlet.", "Widen the window a little to show the web page.")}</p></div>}
      {!current && <BrowserStart query={startQuery} setQuery={v => { setStartQuery(v); setAddressEdited(true); setSuggestAt(-1); }}
        submit={() => { setAddressEdited(false); void action("navigate", startQuery); }} onKeyDown={e => { suggestKeys(e); }}
        onFocusChange={f => { setFocusSource(f ? "start" : null); if (!f) { setAddressEdited(false); setSuggestAt(-1); } }}
        suggest={focusSource === "start" && suggestions.length > 0 ? suggestList : null} suggestOpen={focusSource === "start" && suggestions.length > 0} activeOption={suggestAt}
        engine={engine} setEngine={chooseEngine} creating={creating} go={url => void action("navigate", url)} topSites={topList} hideSite={hideSite}
        bookmarks={bookmarks} addBookmark={addBookmarkFrom} removeBookmark={removeBookmark} restore={restoreList} restoreSession={() => void restoreSession()}
        dismissRestore={() => setLastSession([])} capacity={8 - tabs.length} reading={readingRows} openReading={openReadingFrom}
        closed={closedTabs} reopen={i => void reopenClosed(i)} historyPaused={historyPaused} openHistory={() => setHistoryOpen(true)} openClear={() => setClearOpen(true)} onAssistant={onAssistant}/>}
      {reader && <BrowserReader page={reader.page} onClose={() => setReader(null)} onAsk={() => { const page = reader.page; setReader(null); onPage(page); }}
        onCopy={text => void copyAssistantText(text).then(() => { if (alive.current) setBrowserNotice(label("Metin kopyalandı.", "Text copied.")); }).catch(showError)} onSave={() => saveReading(reader.url, reader.page.title)}/>}
    </div>

    {active&&!recoveryBusy&&recover.length>0&&<RecoveryPanel tabs={recover} busy={recoveryBusy} restore={recoverSelected} close={closeRecovery}/>}
    {active&&siteSettings&&current&&<SitePreferencesPanel origin={siteOrigin(current.url)} value={sitePrefs[siteOrigin(current.url)]||{muted:false,popups:"tab"}} zoom={nowNative.zoom} resetZoom={()=>setPageZoom(1)} save={value=>saveSitePreference(siteOrigin(current.url),value)} close={()=>setSiteSettings(false)}/>}
    {active&&<BrowserInputMenu navigate={text=>{void action("navigate",text);}} error={showError}/>}
    {active&&collectionsOpen&&<BrowserCollections close={()=>setCollectionsOpen(false)} add={current?collectPage:undefined} open={url=>{setCollectionsOpen(false);void action("navigate",url);}}/>}
    {collectionItem&&<WebCollectionPicker item={collectionItem} close={()=>setCollectionItem(null)} saved={setBrowserNotice}/>}
    {pageMenu&&<WebMenu key={pageMenu.x+":"+pageMenu.y+":"+pageMenu.id} x={pageMenu.x} y={pageMenu.y} items={pageMenuItems()} glass={menuGlass} close={()=>{setPageMenu(null);++glassToken.current;setMenuGlass(g=>{if(g&&g!=="pending")URL.revokeObjectURL(g.src);return null;});}}/>}
    {active && paletteOpen && <CommandPalette title={label("Web komutları", "Web commands")} commands={webCommands()} onClose={() => setPaletteOpen(false)} footer="Ctrl+K" extra={query => {
      if (!query.trim()) return []; let url: string; try { url = resolveWebInput(query, engine, lang() === "tr"); } catch { return []; }
      return [{ id: "web-query", title: label("Aç veya ara: ", "Open or search: ") + query, detail: url, icon: "search", group: "Web", run: () => { void action("navigate", query); } }];
    }}/>}
    {active&&manager&&<BrowserManager initial={manager} request={extensionRequest||undefined} hasTab={tabs.length>0} close={closeManager} openUrl={url=>{setManager(null);void add(url);}}/>}
    {menu && tabs.some(t => t.id === menu.id) && <WebMenu x={menu.x} y={menu.y} items={tabMenuItems(menu.id)} close={() => setMenu(null)}/>}
    {historyOpen && <HistoryPanel rows={history} paused={historyPaused} setPaused={setPaused} close={() => setHistoryOpen(false)}
      open={(url, newTab) => { setHistoryOpen(false); if (newTab) void add(url); else void action("navigate", url); }}
      remove={url => commitHistory(removeVisit(historyRef.current, url))} removeSite={host => commitHistory(removeSite(historyRef.current, host))} clearSince={since => commitHistory(clearVisitsSince(historyRef.current, since))}/>}
    {mediaChoice&&<BrowserMediaPicker error={mediaChoice.failed} rows={mediaChoice.rows} close={()=>setMediaChoice(null)} choose={source=>{const choice=mediaChoice;setMediaChoice(null);if(!alive.current||!shown.current||chosen.current!==choice.tab.id||revisions.current.get(choice.tab.id)!==choice.revision||tabsRef.current.find(t=>t.id===choice.tab.id)?.url!==choice.tab.url){setBrowserNotice(label("Sayfa değişti; kaynakları yeniden bul.","The page changed. Find the sources again."));return;}void startMedia(choice.tab,choice.media,source);}}/>}
    {keysOpen && <ShortcutsPanel close={() => setKeysOpen(false)}/>}
    {clearOpen && <ClearDataPanel canClearSite={tabs.length > 0} clear={clearData} close={() => setClearOpen(false)}/>}
  </section>{miniTab!==null&&(()=>{const tab=tabs.find(t=>t.id===miniTab);if(!tab)return null;
    const playPause=()=>{const paused=!backgroundPaused;void native("browser_action",{id:tab.id,action:paused?"pause-media":"resume-media"}).then(()=>{setBackgroundPaused(paused);setMini(m=>m&&{...m,paused});}).catch(showError);};
    const back=()=>{chooseTab(tab.id);window.dispatchEvent(new Event("luna-browser-open"));};
    const stop=()=>{void native("browser_action",{id:tab.id,action:"pause-media"}).catch(showError);setBackgroundPaused(false);setBackgroundAudio(null);setMiniKeep(null);};
    const time=mini?.time??0,duration=mini?.duration??0,paused=mini?.ok?mini.paused:backgroundPaused;
    const seekAt=(e:React.PointerEvent<HTMLDivElement>)=>{if(e.type==="pointerdown"?e.button!==0:e.buttons!==1)return;const r=e.currentTarget.getBoundingClientRect();miniSeek("seek-to",Math.min(1,Math.max(0,(e.clientX-r.left)/r.width)));};
    return createPortal(<div className="luna-video-dock mu-dock web-mini-dock">
      <div className="mu-dock-left"><div className={"luna-video-surface web-mini-surface"+(mini?.ok?"":" is-empty")} role="button" tabIndex={0} title={label("Web’e dön","Return to Web")} aria-label={label("Web’e dön","Return to Web")} onClick={back} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();back();}}}>{!mini?.ok&&<WebIcon name="speaker" size={20}/>}</div>
        <span className="mu-dock-txt"><b className="ellipsis">{tab.title}</b><span className="muted small ellipsis">{duration?`${fmtTime(time)} / ${fmtTime(duration)}`:hostOf(tab.url)}</span></span></div>
      <div className="mu-dock-mid"><div className="mu-ctl">
        <button className="mu-ib" aria-label={label("10 sn geri","Back 10 s")} title={label("10 sn geri","Back 10 s")} disabled={!mini?.ok} onClick={()=>miniSeek("seek",-10)}><Icon d="M11 17l-5-5 5-5M18 17l-5-5 5-5" size={17}/></button>
        <button className="mu-play" aria-label={paused?label("Oynat","Play"):label("Duraklat","Pause")} onClick={playPause}><Icon d={paused?I.play:I.pause} fill size={18}/></button>
        <button className="mu-ib" aria-label={label("10 sn ileri","Forward 10 s")} title={label("10 sn ileri","Forward 10 s")} disabled={!mini?.ok} onClick={()=>miniSeek("seek",10)}><Icon d="M13 17l5-5-5-5M6 17l5-5-5-5" size={17}/></button>
      </div>{duration>0&&<div className="mu-seek"><span>{fmtTime(time)}</span><div className="mu-bar" role="slider" tabIndex={0} aria-label={label("Çalma konumu","Playback position")} aria-valuemin={0} aria-valuemax={Math.round(duration)} aria-valuenow={Math.round(time)} onPointerDown={seekAt} onPointerMove={seekAt} onKeyDown={e=>{if(e.key==="ArrowLeft"||e.key==="ArrowRight"){e.preventDefault();e.stopPropagation();miniSeek("seek",e.key==="ArrowLeft"?-5:5);}}}><div style={{width:Math.min(1,time/duration)*100+"%"}}/></div><span>{fmtTime(duration)}</span></div>}</div>
      <div className="mu-dock-right">
        <button className="chip web-mini-back" title={hostOf(tab.url)} onClick={back}><Icon d="M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3" size={15}/><span>{label("Siteye dön","Back to site")}</span></button>
        <button className="mu-ib" aria-label={label("Durdur","Stop")} title={label("Durdur","Stop")} onClick={stop}><Icon d={I.x} size={16}/></button>
      </div></div>,document.body);})()}</>;
}

function SiteIcon({url,loading}:{url:string;loading:boolean}){const [failed,setFailed]=useState(false);let src="";try{src=new URL("/favicon.ico",url).href;}catch{}useEffect(()=>setFailed(false),[src]);return loading?<WebIcon name="reload" size={14}/>:failed||!src?<WebIcon name="globe" size={14}/>:<img className="browser-favicon" src={src} alt="" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>;}
