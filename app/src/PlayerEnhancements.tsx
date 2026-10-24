import {useState} from "react";
import {tt} from "./i18n";
import {UpscalerSettings} from "./Upscaler";
import {VideoPanel,applyVideoSet,loadVideoSet} from "./PlayerMenu";
import {appStorage} from "./appStorage";
export function EnhancementPanel({path,losslessOn,onBuiltin,onClose,onSaved,onApply}:{path:string;losslessOn:boolean;onBuiltin:()=>void;onClose:()=>void;onSaved:()=>void;onApply:(save:()=>Promise<void>,on:boolean)=>void}){
 const [engine,setEngine]=useState(losslessOn?"lossless":"luna");
 return <div className="tracks up-panel" onClick={e=>e.stopPropagation()}><label className="enhancement-choice"><b>{tt("Görüntü iyileştirme")}</b><select aria-label={tt("İyileştirme motoru")} value={engine} onChange={e=>{setEngine(e.target.value);if(e.target.value==="luna"&&losslessOn)onBuiltin();}}><option value="luna">{tt("Luna · mpv / Anime4K / VSR")}</option><option value="lossless">Lossless Scaling</option></select></label>{engine==="luna"?<><p className="muted small">{tt("Luna içindeki seçenekler. Ayrı Lossless Scaling kurulumu gerekmez.")}</p><VideoPanel key={path} path={path} onClose={onClose} enhancements embedded/></>:<UpscalerSettings inPlayer onSaved={onSaved} onApply={(save,on)=>onApply(async()=>{await save();if(on){const current=loadVideoSet(path);const next={...current,vsr:"off" as const,a4k:"off" as const,hq:false,smooth:false};appStorage.setItem("vset:"+path,JSON.stringify(next));applyVideoSet(next);}},on)}/>}</div>;
}
