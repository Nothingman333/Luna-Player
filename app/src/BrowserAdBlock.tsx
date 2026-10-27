import {useEffect,useSyncExternalStore} from "react";
import {invoke} from "./nativeCore";
import {extraText as t} from "./Extras";

type Extension={id:string;name:string;enabled:boolean};
type State={rows:Extension[];known:boolean;busy:boolean;error:string};
let state:State={rows:[],known:false,busy:false,error:""};
let pending:Promise<void>|null=null;
const subscribers=new Set<()=>void>();
const subscribe=(f:()=>void)=>{subscribers.add(f);return()=>{subscribers.delete(f);};};
const publish=(patch:Partial<State>)=>{state={...state,...patch};subscribers.forEach(f=>f());};
const blockers=(rows:Extension[])=>rows.filter(e=>/uBlock.*Lite/i.test(e.name));
async function read(){const rows=await invoke<Extension[]>("browser_extension_manage",{action:"list"});publish({rows,known:true});}
function run(work:()=>Promise<void>){
 if(pending)return pending;
 publish({busy:true,error:""});
 pending=work().catch(e=>{publish({error:String(e)});}).finally(()=>{pending=null;publish({busy:false});});
 return pending;
}
const refresh=()=>run(read);
export function BrowserAdBlock(){
 const snapshot=useSyncExternalStore(subscribe,()=>state);
 useEffect(()=>{void refresh();},[]);
 const all=blockers(snapshot.rows),extension=all.find(e=>e.enabled)??all[0];
 const toggle=()=>run(async()=>{
  if(!state.known)return;
  const installed=blockers(state.rows),active=installed.some(e=>e.enabled);
  if(installed.length){
   // Older builds could install the same unpacked package more than once. Keep every source intact.
   const targets=active?installed.filter(e=>e.enabled):installed.slice(0,1);
   for(const row of targets)await invoke("browser_extension_manage",{action:"enable",id:row.id,enabled:!active});
  }else{
   const preview=await invoke<{token:string}>("browser_extension_prepare",{source:"ublock",kind:"bundled"});
   const row=await invoke<Extension>("browser_extension_manage",{action:"install",id:preview.token});
   if(!row.enabled)await invoke("browser_extension_manage",{action:"enable",id:row.id,enabled:true});
  }
  await read();
 });
 return <div className="browser-adblock"><label className="look-check browser-menu-action"><input type="checkbox" disabled={snapshot.busy||!snapshot.known} checked={all.some(e=>e.enabled)} onChange={()=>void toggle()}/><span>{t("Reklam engelleyici","Ad blocker")}<small>uBlock Origin Lite · {snapshot.busy?t("İşleniyor…","Working…"):!snapshot.known?t("Durum okunamadı","Status unavailable"):extension?t("Yüklü","Installed"):t("Açınca kurulur","Install when enabled")}</small></span></label>{snapshot.error&&<><p role="alert" className="browser-adblock-error">{/0x80070032/i.test(snapshot.error)?t("Bu WebView2 oturumunda eklenti API’si desteklenmiyor. Luna’yı tamamen kapatıp yeniden aç; sürerse WebView2 Runtime sürümünü kontrol et.","This WebView2 session does not support the extension API. Fully restart Luna; if it persists, check the WebView2 Runtime version."):snapshot.error}</p><button className="chip" disabled={snapshot.busy} onClick={()=>void refresh()}>{t("Yeniden dene","Retry")}</button></>}</div>;
}
