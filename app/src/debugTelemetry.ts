import {invoke} from "@tauri-apps/api/core";
import {listen} from "@tauri-apps/api/event";
import {createDebugBuffer,debugSanitize,debugCategory} from "./debugModel";
import type {DebugCategory} from "./debugModel";
const buffer=createDebugBuffer(),subscribers=new Set<()=>void>();
let secretValues=()=>[] as string[],installed=false,notifyTimer:ReturnType<typeof setTimeout>|undefined,flushTimer:ReturnType<typeof setTimeout>|undefined,writing=false;
let pending:string[]=[],diskError="",dropped=0;
export function debugSecrets(read:()=>string[]){secretValues=read;}
const clean=(value:unknown)=>debugSanitize(value,secretValues().filter(s=>s.length>=4));
export const debugRows=()=>buffer.rows();
export const debugDiskStatus=()=>({error:diskError,pending:pending.length,dropped});
export const subscribeDebug=(fn:()=>void)=>{subscribers.add(fn);return()=>{subscribers.delete(fn);};};
function notify(){if(!notifyTimer)notifyTimer=setTimeout(()=>{notifyTimer=undefined;subscribers.forEach(fn=>fn());},60);}
export function clearDebug(){buffer.clear();notify();}
export function logDebug(category:DebugCategory,name:string,detail:unknown={},level:"info"|"error"="info",duration?:number,persist=true){
 let safe:unknown;try{safe=clean(detail);const json=JSON.stringify(safe);if(json&&json.length>6000)safe={preview:json.slice(0,5500),truncated:true};}catch{safe="[unreadable details]";}
 const entry=buffer.add({at:Date.now(),category,level,name:String(clean(name)),detail:safe,...(duration!==undefined?{duration:Math.round(Math.max(0,duration)*10)/10}:{})});
 if(persist){pending.push(JSON.stringify(entry));if(pending.length>1000){dropped+=pending.length-1000;pending=pending.slice(-1000);}scheduleFlush();}notify();return entry;
}
function scheduleFlush(){if(!flushTimer&&!writing)flushTimer=setTimeout(()=>{flushTimer=undefined;void flushDebug();},700);}
export async function flushDebug(){if(writing||!pending.length)return;writing=true;const lines=pending.splice(0,100);try{await invoke("debug_log",{lines});diskError="";}catch(e){diskError=String(clean(e));dropped+=lines.length;}finally{writing=false;if(pending.length)scheduleFlush();notify();}}
const quiet=new Set(["debug_log","diagnostic_snapshot","debug_open_log","reveal_file"]);
const throttle=new Map<string,number>();
export function logDebugEvent(event:any){
 const name=typeof event?.event==="string"?event.event:"";if(!/mpv|music|browser|download|native-debug/i.test(name))return;
 if(name==="luna-native-debug"){logDebug("browser","native",{native:clean(event.payload)},"info",undefined,false);return;}
 const payload=event.payload,kind=String(payload?.event||payload?.kind||"changed"),key=name+":"+(payload?.id??"")+":"+(payload?.name||kind),now=Date.now();
 if((kind==="property-change"||/bounds|position|progress|downloads-changed/.test(kind+name))&&now-(throttle.get(key)||0)<1000)return;
 throttle.set(key,now);if(throttle.size>300)throttle.delete(throttle.keys().next().value!);
 const detail=kind==="context"||kind==="title"?{id:payload?.id,kind,value:"[private]"}:kind==="property-change"&&/sub-text|media-title|metadata/.test(payload?.name||"")?{event:kind,name:payload.name,data:"[private]"}:payload;
 const category=debugCategory(name);logDebug(category,name+" / "+kind,detail,/error|failed|blocked|rejected/.test(kind)?"error":"info");
}
export function installDebugTelemetry(){
 if(installed)return;installed=true;
 const internals=(window as any).__TAURI_INTERNALS__;
 if(internals?.invoke){
  const original=internals.invoke;
  internals.invoke=function(command:string,args?:any,...rest:any[]){
   if(quiet.has(command))return original.call(this,command,args,...rest);
   const start=performance.now(),category=debugCategory(command);
   const info=category==="ai"?{provider:command==="gemini"?"gemini":args?.kind,model:args?.model||args?.body?.model,endpoint:args?.url}:command==="mpv"?{operation:args?.args?.[0]||args?.command,argumentCount:args?.args?.length}:args;
   logDebug(category,command+" →",info);
   try{return Promise.resolve(original.call(this,command,args,...rest)).then(result=>{logDebug(category,command+" ✓",{resultType:result===null?"null":Array.isArray(result)?"array":typeof result,count:Array.isArray(result)?result.length:undefined},"info",performance.now()-start);return result;},error=>{logDebug(category,command+" ✕",error,"error",performance.now()-start);throw error;});}
   catch(error){logDebug(category,command+" ✕",error,"error",performance.now()-start);throw error;}
  };
  const transform=internals.transformCallback;
  if(transform)internals.transformCallback=function(callback:(value:any)=>void,...rest:any[]){return transform.call(this,(value:any)=>{try{logDebugEvent(value);}catch{}return callback(value);},...rest);};
 }
 window.addEventListener("error",(event:Event)=>{if(event instanceof ErrorEvent)logDebug("error","JavaScript",event.error||{error:event.message},"error");else{const target=event.target as HTMLImageElement;logDebug("network","Resource failed",{resource:target?.tagName,url:target?.src},"error");}},true);
 window.addEventListener("unhandledrejection",event=>logDebug("error","Unhandled promise",event.reason,"error"));
 void listen("luna-native-debug",()=>{}).catch(()=>{});
 logDebug("app","Debug capture started",{capacity:5000});
 window.addEventListener("pagehide",()=>{void flushDebug();});
}
