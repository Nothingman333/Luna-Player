import {useEffect,useRef,useState} from "react";
import {Clocked} from "./ClockedPlayback";
import {SoundPanel} from "./PlaybackExtras";
import {VideoPanel} from "./PlayerMenu";
import {tt} from "./i18n";
export function PlayerSettingsPanel({path,onClose,onScenes,onClip}:{path:string;onClose:()=>void;onScenes:()=>void;onClip:()=>void}){
 const [tab,setTab]=useState<"picture"|"sound">("picture");const box=useRef<HTMLDivElement>(null);
 useEffect(()=>{const down=(event:MouseEvent)=>{const target=event.target as HTMLElement;if(box.current&&!box.current.contains(target)&&!target.closest(".vset-anchor"))onClose();};window.addEventListener("mousedown",down);return()=>window.removeEventListener("mousedown",down);},[onClose]);
 return <div className="tracks vset player-gear" ref={box} role="dialog" aria-label={tt("Oynatıcı ayarları")}><div className="player-settings-nav" role="tablist" aria-label={tt("Oynatıcı ayarları")}>{([["picture",tt("Görüntü")],["sound",tt("Ses")]] as const).map(([key,label])=><button key={key} role="tab" aria-selected={tab===key} className={"chip"+(tab===key?" on":"")} onClick={()=>setTab(key)}>{label}</button>)}</div><div role="tabpanel">{tab==="picture"?<VideoPanel key={path} embedded path={path} onClose={onClose} onScenes={onScenes} onClip={onClip}/>:<Clocked>{time=><SoundPanel embedded time={time} onClose={onClose}/>}</Clocked>}</div></div>;
}
