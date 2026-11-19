import type { ExtensionRequest } from "./browserExtensionFlow";
import {useEffect,useRef,useState} from "react";
import {invoke,isTauri} from "./nativeCore";
import {open} from "@tauri-apps/plugin-dialog";
import {extraText as t} from "./Extras";
import {BrowserIcon} from "./BrowserIcons";
import "./BrowserExtensionsPage.css";
type Row={id:string;name:string;enabled:boolean;icon?:string;popup?:boolean;version?:string;description?:string;worker?:boolean};
type Command={name:string;description:string;key:string};
type Details={id:string;name:string;enabled:boolean;icon:string|null;version:string;versionName:string;description:string;manifestVersion:number;permissions:string[];hosts:string[];optional:string[];sites:string[];commands:Command[];homepage:string;author:string;minimumChrome:string;incognito:string;worker:string|null;options:boolean;popup:boolean;source:"store"|"local";storeUrl:string;path:string;bytes:number};
type Preview={token:string;name:string;version:string;description:string;permissions:string[];hosts:string[];manifestVersion:number;source:string;bytes:number;signatureVerified:boolean};
type View={kind:"list"}|{kind:"details";id:string}|{kind:"shortcuts"};
const size=(n:number)=>n>=1048576?(n/1048576).toFixed(1)+" MB":n>=1024?Math.round(n/1024)+" KB":n+" B";
const DEV_KEY="luna.extensions.developerMode";
/** Chrome's own wording for the permission warnings users actually recognise; anything else is shown as declared. */
const PERMISSION:Record<string,[string,string]>={
 tabs:["Tarama geçmişinizi okuma","Read your browsing history"],history:["Tarama geçmişinizi okuma ve değiştirme","Read and change your browsing history"],
 bookmarks:["Yer işaretlerinizi okuma ve değiştirme","Read and change your bookmarks"],downloads:["İndirmelerinizi yönetme","Manage your downloads"],
 clipboardRead:["Panoya kopyaladığınız verileri okuma","Read data you copy and paste"],clipboardWrite:["Panoya veri yazma","Modify data you copy and paste"],
 notifications:["Bildirimleri görüntüleme","Display notifications"],geolocation:["Fiziksel konumunuzu tespit etme","Detect your physical location"],
 cookies:["Çerezleri okuma ve değiştirme","Read and change cookies"],storage:["Veri depolama","Store data"],contextMenus:["Sağ tık menüsüne öğe ekleme","Add items to the right-click menu"],
 webRequest:["Ağ isteklerini izleme","Observe network requests"],declarativeNetRequest:["Sayfa içeriğini engelleme","Block content on any page"],
 declarativeNetRequestWithHostAccess:["Erişebildiği sitelerde içerik engelleme","Block content on sites it can access"],scripting:["Sayfalara betik ekleme","Insert scripts into pages"],
 activeTab:["Tıkladığınızda geçerli sayfaya erişme","Access the current page when you click it"],management:["Uygulamalarınızı ve uzantılarınızı yönetme","Manage your apps and extensions"],
 privacy:["Gizlilikle ilgili ayarları değiştirme","Change your privacy-related settings"],proxy:["Ara sunucu ayarlarını değiştirme","Change proxy settings"],
 nativeMessaging:["İş birliği yapan yerel uygulamalarla iletişim kurma","Communicate with cooperating native applications"],unlimitedStorage:["Sınırsız depolama","Unlimited storage"],
 alarms:["Zamanlanmış işler","Scheduled tasks"],offscreen:["Arka planda belge kullanma","Use offscreen documents"],sidePanel:["Yan panel","Side panel"],identity:["Hesabınızla oturum açma","Sign in with your account"],
};
const permissionText=(p:string)=>PERMISSION[p]?t(...PERMISSION[p]):p;
const allSites=(hosts:string[])=>hosts.some(h=>h==="<all_urls>"||/^\*:\/\/\*\/\*$|^https?:\/\/\*\/\*$/.test(h));
function Switch({on,label,disabled,change}:{on:boolean;label:string;disabled?:boolean;change:(v:boolean)=>void}){
 return <label className="web-switch bxp-switch" title={label}><input type="checkbox" role="switch" aria-label={label} checked={on} disabled={disabled} onChange={e=>change(e.target.checked)}/><span/></label>;
}
function Icon({row,size=40}:{row:{icon?:string|null;name:string};size?:number}){
 return row.icon?<img className="bxp-icon" src={row.icon} alt="" width={size} height={size}/>:<span className="bxp-icon bxp-letter" style={{width:size,height:size}} aria-hidden="true">{row.name.trim().charAt(0).toUpperCase()||"?"}</span>;
}
/** Chrome-like chrome://extensions inside Luna: search, developer mode, card grid, a full Details page and
 *  keyboard shortcuts. Everything is read from the WebView2 profile and the installed manifests. */
export function BrowserExtensionsPage({hasTab,openUrl,request}:{hasTab:boolean;openUrl:(url:string)=>void;request?:ExtensionRequest}){
 const [rows,setRows]=useState<Row[]>([]),[view,setView]=useState<View>({kind:"list"}),[details,setDetails]=useState<Details|null>(null),[shortcuts,setShortcuts]=useState<Details[]>([]);
 const [query,setQuery]=useState(""),[dev,setDev]=useState(()=>{try{return localStorage.getItem(DEV_KEY)==="1";}catch{return false;}});
 const [preview,setPreview]=useState<Preview|null>(null),[remove,setRemove]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[status,setStatus]=useState("");
 const alive=useRef(true),locked=useRef(false),prepared=useRef<Preview|null>(null),started=useRef(false);
 const discard=async(p:Preview|null)=>{if(p)await invoke("browser_extension_manage",{action:"discard",id:p.token}).catch(()=>{});};
 const run=async(fn:()=>Promise<void>)=>{if(locked.current)return;locked.current=true;setBusy(true);setError("");setStatus("");try{if(!isTauri())throw Error(t("Uzantılar masaüstü Luna'da kullanılabilir.","Extensions are available in the Luna desktop app."));await fn();}catch(e){if(alive.current)setError(String(e));}finally{locked.current=false;if(alive.current)setBusy(false);}};
 const refresh=async()=>{const list=await invoke<Row[]>("browser_extension_manage",{action:"list"});if(!alive.current)return;setRows(list);window.dispatchEvent(new Event("luna-extensions-changed"));};
 const loadDetails=async(id:string)=>{const d=await invoke<Details>("browser_extension_details",{id});if(alive.current)setDetails(d);};
 const prepare=async(source:string,kind:string)=>{const p=await invoke<Preview>("browser_extension_prepare",{source,kind});if(!alive.current){await discard(p);return;}await discard(prepared.current);prepared.current=p;setPreview(p);};
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;void discard(prepared.current);};},[]);
 useEffect(()=>{if(!hasTab)return;void run(async()=>{await refresh();if(request&&!started.current){started.current=true;await prepare(request.source,request.kind);}});},[hasTab,request?.source,request?.kind]);
 useEffect(()=>{try{localStorage.setItem(DEV_KEY,dev?"1":"0");}catch{/* per-viewer preference only */}},[dev]);
 useEffect(()=>{setRemove(null);if(view.kind==="details"){setDetails(null);void run(()=>loadDetails(view.id));}
  else if(view.kind==="shortcuts")void run(async()=>{const all:Details[]=[];for(const r of rows){try{all.push(await invoke<Details>("browser_extension_details",{id:r.id}));}catch{/* a package without a readable manifest has no shortcuts */}}if(alive.current)setShortcuts(all);});},[view]);
 const toggle=(id:string,on:boolean)=>run(async()=>{await invoke("browser_extension_manage",{action:"enable",id,enabled:on});await refresh();if(view.kind==="details")await loadDetails(id);});
 const reload=(id:string)=>run(async()=>{await invoke("browser_extension_manage",{action:"reload",id});await refresh();setStatus(t("Uzantı yeniden yüklendi.","Extension reloaded."));});
 const reloadAll=()=>run(async()=>{for(const r of rows.filter(r=>r.enabled))await invoke("browser_extension_manage",{action:"reload",id:r.id});await refresh();setStatus(t("Etkin uzantılar yeniden yüklendi.","Enabled extensions reloaded."));});
 const uninstall=(id:string)=>run(async()=>{await invoke("browser_extension_manage",{action:"remove",id});setRemove(null);await refresh();if(view.kind==="details")setView({kind:"list"});});
 const openTarget=(id:string,target:"options"|"folder")=>run(()=>invoke("browser_extension_open",{id,target}));
 const pick=(folder:boolean)=>run(async()=>{const path=await open({directory:folder,multiple:false,title:folder?t("Uzantı klasörünü seç","Choose extension folder"):t("Uzantı paketini seç","Choose extension package"),filters:folder?undefined:[{name:"Chrome extension / ZIP",extensions:["zip","crx"]}]});if(typeof path==="string")await prepare(path,folder?"folder":"file");});
 const install=()=>run(async()=>{if(!preview)return;await invoke("browser_extension_manage",{action:"install",id:preview.token});prepared.current=null;setPreview(null);setStatus(t("Uzantı eklendi. Açık sayfaları yenileyince çalışır.","Extension added. Reload open pages to apply it."));await refresh();});
 const cancelPreview=()=>run(async()=>{await discard(prepared.current);prepared.current=null;setPreview(null);});
 const q=query.trim().toLocaleLowerCase();
 const shown=rows.filter(r=>!q||`${r.name} ${r.description||""} ${r.id}`.toLocaleLowerCase().includes(q));
 const removeButtons=(id:string,label:string)=>remove===id?<span className="bxp-confirm"><button className="chip bm-danger" disabled={busy} onClick={()=>void uninstall(id)}>{t("Kaldırmayı onayla","Confirm removal")}</button><button className="chip" onClick={()=>setRemove(null)}>{t("Vazgeç","Cancel")}</button></span>:<button className="bxp-btn" disabled={busy} onClick={()=>setRemove(id)}>{label}</button>;
 const nav=(kind:"list"|"shortcuts")=><button className={view.kind===kind||(kind==="list"&&view.kind==="details")?"on":""} aria-current={view.kind===kind?"page":undefined} onClick={()=>setView({kind})}><BrowserIcon name={kind==="list"?"extension":"keyboard"} size={16}/>{kind==="list"?t("Uzantılarım","My extensions"):t("Klavye kısayolları","Keyboard shortcuts")}</button>;
 return <div className="bxp">
  <header className="bxp-top">
   <h2>{t("Uzantılar","Extensions")}</h2>
   <label className="bxp-search"><BrowserIcon name="search" size={16}/><input type="search" placeholder={t("Uzantılarda ara","Search extensions")} aria-label={t("Uzantılarda ara","Search extensions")} value={query} onChange={e=>{setQuery(e.target.value);if(view.kind!=="list")setView({kind:"list"});}}/></label>
   <span className="bxp-dev">{t("Geliştirici modu","Developer mode")}<Switch on={dev} label={t("Geliştirici modu","Developer mode")} change={setDev}/></span>
  </header>
  {dev&&<div className="bxp-devbar"><button className="bxp-btn" disabled={busy||!hasTab||!!preview} onClick={()=>void pick(true)}>{t("Paketlenmemiş öğe yükle","Load unpacked")}</button><button className="bxp-btn" disabled={busy||!hasTab||!!preview} onClick={()=>void pick(false)}>{t("ZIP / CRX yükle","Load ZIP / CRX")}</button><button className="bxp-btn" disabled={busy||!rows.some(r=>r.enabled)} onClick={()=>void reloadAll()}>{t("Güncelle","Update")}</button></div>}
  <div className="bxp-body">
   <nav className="bxp-side" aria-label={t("Uzantı bölümleri","Extension sections")}>{nav("list")}{nav("shortcuts")}<button className="bxp-store" onClick={()=>openUrl("https://chromewebstore.google.com/")}>{t("Chrome Web Store'dan uzantı ve tema edinin","Get extensions and themes from the Chrome Web Store")} <BrowserIcon name="external" size={13}/></button></nav>
   <main className="bxp-main">
    {!hasTab&&<div className="bm-info"><p>{t("Uzantıları görmek için bir web sekmesi aç. WebView2 uzantıları yalnız açık bir web sekmesi varken yönetir.","Open a web tab to see extensions. WebView2 manages extensions only while a web tab is open.")}</p><button className="chip" onClick={()=>openUrl("https://chromewebstore.google.com/")}>{t("Chrome Web Store'u aç","Open Chrome Web Store")}</button></div>}
    {preview&&<section className="bm-preview" aria-label={t("Kurulum önizlemesi","Installation preview")}><div className="bm-card-title"><h3>{t(`“${preview.name}” eklensin mi?`,`Add “${preview.name}”?`)}</h3><span>{preview.version}</span></div><p>{preview.description}</p><small>{preview.source} · {size(preview.bytes)} · Manifest {preview.manifestVersion} · {preview.signatureVerified?t("CRX3 imzası doğrulandı","CRX3 signature verified"):t("Yerel, imzasız","Local, unsigned")}</small><h4>{t("Şunlara erişebilir:","It can access:")}</h4><div className="bm-permissions">{[...preview.hosts,...preview.permissions].map((x,i)=><code key={i}>{permissionText(x)}</code>)}{!preview.permissions.length&&!preview.hosts.length&&<span>{t("Ek izin istemiyor.","It asks for no extra permissions.")}</span>}</div><div className="extra-row"><button className="chip on" disabled={busy||!hasTab} onClick={()=>void install()}>{t("Uzantıyı ekle","Add extension")}</button><button className="chip" disabled={busy} onClick={()=>void cancelPreview()}>{t("İptal","Cancel")}</button></div></section>}
    {view.kind==="list"&&<>
     <div className="bxp-grid">{shown.map(r=><article key={r.id} className={"bxp-card"+(r.enabled?"":" off")}>
      <div className="bxp-card-head"><Icon row={r}/><div className="bxp-card-text"><b>{r.name} {r.version&&<small>{r.version}</small>}</b><p>{r.description||t("Açıklama yok.","No description.")}</p>{dev&&<small className="bxp-id">{t("Kimlik","ID")}: {r.id}</small>}{dev&&r.worker&&<small className="bxp-id">{t("Görünümleri incele: hizmet çalışanı","Inspect views: service worker")}</small>}</div></div>
      <div className="bxp-card-foot"><button className="bxp-btn" disabled={busy} onClick={()=>setView({kind:"details",id:r.id})}>{t("Ayrıntılar","Details")}</button>{removeButtons(r.id,t("Kaldır","Remove"))}{dev&&<button className="bxp-round" disabled={busy||!r.enabled} title={t("Yeniden yükle","Reload")} aria-label={t("Yeniden yükle","Reload")+" · "+r.name} onClick={()=>void reload(r.id)}><BrowserIcon name="reload" size={16}/></button>}<Switch on={r.enabled} disabled={busy} label={(r.enabled?t("Kapat","Turn off"):t("Aç","Turn on"))+" · "+r.name} change={v=>void toggle(r.id,v)}/></div>
     </article>)}</div>
     {hasTab&&!shown.length&&!busy&&<p className="bm-empty">{rows.length?t("Aramayla eşleşen uzantı yok.","No extensions match your search."):t("Henüz uzantı yok. Chrome Web Store'dan bir uzantı ekleyebilirsin.","No extensions yet. Add one from the Chrome Web Store.")}</p>}
    </>}
    {view.kind==="details"&&<section className="bxp-details" aria-label={t("Uzantı ayrıntıları","Extension details")}>
     <div className="bxp-details-head"><button className="bxp-round" aria-label={t("Geri","Back")} onClick={()=>setView({kind:"list"})}><BrowserIcon name="back" size={18}/></button>{details?<><Icon row={details} size={28}/><h3>{details.name}</h3></>:<h3>{rows.find(r=>r.id===view.id)?.name||""}</h3>}</div>
     {details&&<div className="bxp-sheet">
      <div className="bxp-line"><span>{details.enabled?t("Açık","On"):t("Kapalı","Off")}</span><Switch on={details.enabled} disabled={busy} label={details.enabled?t("Kapat","Turn off"):t("Aç","Turn on")} change={v=>void toggle(details.id,v)}/></div>
      <div className="bxp-field"><h4>{t("Açıklama","Description")}</h4><p>{details.description||t("Açıklama yok.","No description.")}</p></div>
      <div className="bxp-field"><h4>{t("Sürüm","Version")}</h4><p>{details.version}{details.versionName&&details.versionName!==details.version?` (${details.versionName})`:""} · Manifest V{details.manifestVersion}</p></div>
      <div className="bxp-field"><h4>{t("Boyut","Size")}</h4><p>{size(details.bytes)}</p></div>
      <div className="bxp-field"><h4>{t("Kimlik","ID")}</h4><p className="bxp-mono">{details.id}</p></div>
      {details.author&&<div className="bxp-field"><h4>{t("Geliştirici","Developer")}</h4><p>{details.author}</p></div>}
      <div className="bxp-field"><h4>{t("Görünümleri incele","Inspect views")}</h4><p>{details.worker?<>{t("Hizmet çalışanı / arka plan","Service worker / background")}: <span className="bxp-mono">{details.worker}</span></>:t("Etkin görünüm yok","No active views")}{details.popup?" · "+t("Araç çubuğu penceresi","Toolbar popup"):""}</p></div>
      <div className="bxp-field"><h4>{t("İzinler","Permissions")}</h4>{details.permissions.length?<ul>{details.permissions.map(p=><li key={p}>{permissionText(p)}{PERMISSION[p]&&<code>{p}</code>}</li>)}</ul>:<p>{t("Bu uzantı özel izin gerektirmiyor.","This extension requires no special permissions.")}</p>}{details.optional.length>0&&<p className="bxp-sub">{t("İsteğe bağlı","Optional")}: {details.optional.map(permissionText).join(", ")}</p>}</div>
      <div className="bxp-field"><h4>{t("Site erişimi","Site access")}</h4>{details.hosts.length||details.sites.length?<>{allSites([...details.hosts,...details.sites])&&<p className="bxp-warn">{t("Tüm sitelerdeki verilerinizi okuyabilir ve değiştirebilir.","Can read and change your data on all sites.")}</p>}<ul className="bxp-sites">{[...new Set([...details.hosts,...details.sites])].slice(0,40).map(h=><li key={h} className="bxp-mono">{h}</li>)}</ul></>:<p>{t("Bu uzantının herhangi bir siteye özel erişimi yok.","This extension has no special site access.")}</p>}<p className="bxp-sub">{t("Site erişimi manifestte belirtildiği gibidir; WebView2 bunu site bazında değiştirmeye izin vermez.","Site access is as declared in the manifest; WebView2 cannot change it per site.")}</p></div>
      {details.incognito&&<div className="bxp-field"><h4>{t("Gizli mod","Incognito")}</h4><p>{details.incognito}</p></div>}
      {details.commands.length>0&&<button className="bxp-link" onClick={()=>setView({kind:"shortcuts"})}><span>{t("Klavye kısayolları","Keyboard shortcuts")}</span><BrowserIcon name="forward" size={16}/></button>}
      {details.options&&<button className="bxp-link" disabled={busy||!details.enabled} onClick={()=>void openTarget(details.id,"options")}><span>{t("Uzantı seçenekleri","Extension options")}</span><BrowserIcon name="external" size={15}/></button>}
      {details.homepage&&<button className="bxp-link" onClick={()=>openUrl(details.homepage)}><span>{t("Uzantı web sitesine git","Open extension website")}</span><BrowserIcon name="external" size={15}/></button>}
      {details.storeUrl&&<button className="bxp-link" onClick={()=>openUrl(details.storeUrl)}><span>{t("Chrome Web Store'da görüntüle","View in Chrome Web Store")}</span><BrowserIcon name="external" size={15}/></button>}
      <div className="bxp-field"><h4>{t("Kaynak","Source")}</h4><p>{details.source==="store"?"Chrome Web Store":t("Paketlenmemiş uzantı","Unpacked extension")}</p><p className="bxp-mono bxp-sub">{details.path}</p><button className="bxp-btn" disabled={busy} onClick={()=>void openTarget(details.id,"folder")}>{t("Klasörü aç","Open folder")}</button>{details.minimumChrome&&<p className="bxp-sub">{t("En düşük Chromium sürümü","Minimum Chromium version")}: {details.minimumChrome}</p>}</div>
      <div className="bxp-line bxp-remove"><span>{t("Uzantıyı kaldır","Remove extension")}</span>{removeButtons(details.id,t("Kaldır","Remove"))}</div>
     </div>}
    </section>}
    {view.kind==="shortcuts"&&<section className="bxp-details" aria-label={t("Klavye kısayolları","Keyboard shortcuts")}>
     <div className="bxp-details-head"><h3>{t("Klavye kısayolları","Keyboard shortcuts")}</h3></div>
     {shortcuts.filter(d=>d.commands.length).map(d=><div key={d.id} className="bxp-sheet"><div className="bxp-shortcut-head"><Icon row={d} size={22}/><b>{d.name}</b></div>{d.commands.map(c=><div key={c.name} className="bxp-line"><span>{c.description}</span><kbd className={c.key?"":"empty"}>{c.key||t("Ayarlanmadı","Not set")}</kbd></div>)}</div>)}
     {!busy&&!shortcuts.some(d=>d.commands.length)&&<p className="bm-empty">{t("Yüklü uzantılar klavye kısayolu tanımlamıyor.","Installed extensions define no keyboard shortcuts.")}</p>}
     <p className="bm-muted">{t("Kısayollar uzantının manifestte önerdiği tuşlardır. WebView2 kısayolları değiştirmeye izin vermez; bazı uzantı kısayolları Luna'da çalışmayabilir.","Shortcuts are the keys suggested in each manifest. WebView2 cannot change them, and some extension shortcuts may not work in Luna.")}</p>
    </section>}
    {busy&&<p className="bm-status" role="status">{t("İşleniyor…","Working…")}</p>}{error&&<p className="bm-error" role="alert">{error}</p>}{status&&<p className="bm-status" role="status">{status}</p>}
   </main>
  </div>
 </div>;
}
