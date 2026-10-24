import {useEffect,useState,useSyncExternalStore} from "react";
import {listen} from "@tauri-apps/api/event";
import {invoke} from "./nativeCore";
import {usePlaybackTime} from "./playbackClock";
import {parseSubtitle,cueAt} from "./subtitleModel";
import type {Cue} from "./subtitleModel";
import {extraText as tr} from "./Extras";
type Status={running:boolean;path:string;generation:number;error:string};
let state:Status={running:false,path:"",generation:0,error:""},installation:Promise<void>|null=null,epoch=-1,statusRevision=0;
const chunks=new Map<number,Cue[]>(),subscribers=new Set<()=>void>();
const changed=()=>subscribers.forEach(fn=>fn());
function install(){if(installation)return installation;installation=(async()=>{const unlisten:(()=>void)[]=[];try{
  unlisten.push(await listen<Status>("live-caption-status",({payload})=>{statusRevision++;if(payload.generation!==state.generation||!payload.running){chunks.clear();epoch=-1;}state=payload;changed();if(payload.error)window.dispatchEvent(new CustomEvent("luna-extra-error",{detail:payload.error}));}));
  unlisten.push(await listen<{generation:number;epoch:number;offset:number;text:string}>("live-caption",({payload})=>{if(payload.generation!==state.generation||!state.running||payload.epoch<epoch)return;if(epoch!==payload.epoch){chunks.clear();epoch=payload.epoch;}chunks.set(payload.offset,parseSubtitle(payload.text).map(c=>({...c,start:c.start+payload.offset,end:c.end+payload.offset})));while(chunks.size>12)chunks.delete(chunks.keys().next().value!);changed();}));
  const before=statusRevision,next=await invoke<Status>("live_caption_status");if(before===statusRevision){state=next;changed();}
  }catch(e){unlisten.forEach(fn=>fn());installation=null;throw e;}})();return installation;
}
function useLive(){const status=useSyncExternalStore(fn=>{subscribers.add(fn);return()=>{subscribers.delete(fn)};},()=>state);const[,bump]=useState(0);useEffect(()=>{const fn=()=>bump(n=>n+1);subscribers.add(fn);void install().catch(()=>{});return()=>{subscribers.delete(fn)};},[]);return status;}
export function LiveCaptionOverlay(){
  const status=useLive(),time=usePlaybackTime();if(!status.running)return null;
  const cues=Array.from(chunks.values()).flat().sort((a,b)=>a.start-b.start),index=cueAt(cues,time),text=index>=0?cues[index]?.text:"";
  return <div style={{position:"absolute",left:"15%",right:"15%",bottom:"20%",zIndex:12,pointerEvents:"none",textAlign:"center"}}><button className="chip" style={{pointerEvents:"auto",fontSize:11}} onClick={()=>void invoke("live_caption_stop").catch(e=>window.dispatchEvent(new CustomEvent("luna-extra-error",{detail:String(e)})))}>{tr("Canlı altyazı · durdur","Live captions · stop")}</button>{text&&<div style={{whiteSpace:"pre-line",fontSize:"clamp(20px,2.2vw,38px)",lineHeight:1.35,color:"white",textShadow:"0 2px 3px black, 1px 0 3px black,-1px 0 3px black",fontWeight:600}}>{text}</div>}</div>;
}
export function LiveCaptionControl({path,engine,model,language}:{path:string;engine:string;model:string;language:string}){
  const status=useLive(),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  const toggle=async()=>{setError("");setBusy(true);try{if(status.running)await invoke("live_caption_stop");else await invoke("live_caption_start",{input:path,engine,model,lang:language});}catch(e){setError(String(e));}finally{setBusy(false);}};
  return <div className="studio-result"><strong>{tr("Dosyadan canlı altyazı","Live captions from file")}</strong><p className="muted small">{tr("Oynayan yerel videoyu kısa parçalarla önceden yazıya döker. Whisper motoru ve modeli seçilmiş olmalı; hız bilgisayarınıza bağlıdır.","Transcribes short chunks ahead of the playing local video. Select a Whisper engine and model; speed depends on your computer.")}</p><button className="chip" disabled={busy||!status.running&&(!engine||!model||/^[a-z][\w+.-]*:\/\//i.test(path))} onClick={()=>void toggle()}>{status.running?tr("Canlı altyazıyı durdur","Stop live captions"):tr("Canlı altyazıyı başlat","Start live captions")}</button>{error&&<p className="extra-status" role="alert">{error}</p>}</div>;
}
