import {useEffect,useState} from "react";
import {invoke} from "./nativeCore";
import {extraText as tr} from "./Extras";
type Status={enabled:boolean;blocked:number;complete:boolean;error:boolean};
export function AdblockSiteControls({origin}:{origin:string}){
  "use memo";
  const [status,setStatus]=useState<Status|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  useEffect(()=>{let alive=true;setStatus(null);invoke<Status>("browser_adblock",{site:origin}).then(s=>{if(alive)setStatus(s);}).catch(()=>{if(alive)setError(tr("Reklam engelleyici durumu okunamadı.","Could not read ad blocker status."));});return()=>{alive=false;};},[origin]);
  const toggle=async()=>{
    if(!status||busy)return;setBusy(true);setError("");
    try{setStatus(await invoke<Status>("browser_adblock",{site:origin,enabled:!status.enabled}));}
    catch{setError(tr("Tercih kaydedilemedi.","Could not save preference."));}finally{setBusy(false);}
  };
  return <section><label className="extra-check"><input type="checkbox" checked={status?.enabled??true} disabled={!status||busy} onChange={()=>void toggle()}/>{tr("Bu sitede reklam ve takip isteklerini engelle","Block ads and tracking requests on this site")}</label>
    {status&&<p className="muted small">{status.blocked} {tr("istek engellendi · EasyList / EasyPrivacy","requests blocked · EasyList / EasyPrivacy")}{!status.complete?" · "+tr("Listeler hazırlanırken temel filtreler etkin.","Basic filters are active while lists are prepared."):""}{status.error?" · "+tr("Liste güncellemesi veya tarayıcı bağlantısı başarısız; mevcut filtreler korunuyor.","List update or browser connection failed; existing filters are retained."):""}</p>}
    <p className="muted small">{tr("Listeler haftalık yenilenir. Önceden yüklenmiş reklamları kaldırmak için sayfayı yenileyin.","Lists update weekly. Reload the page to remove ads already loaded.")}</p>{error&&<p role="alert" className="lp-msg warn">{error}</p>}</section>;
}
