import {redactDiagnostic} from "./everydayModel";
export type DebugCategory="error"|"browser"|"player"|"ai"|"network"|"app";
export type DebugEntry={id:number;at:number;category:DebugCategory;level:"info"|"error";name:string;duration?:number;detail:unknown};
const privateKey=/(?:key|token|auth|password|secret|cookie|prompt|content|body|json|selection|html|subtitle|subText|notes?|query|title|messages?|text|path|filename|src)/i;
export function debugSanitize(raw:unknown,secrets:string[]=[],depth=0,seen=new WeakSet<object>()):unknown{
 if(depth>5)return "[depth limit]";
 if(raw instanceof Error)return {name:raw.name,error:redactDiagnostic(raw.message,secrets).slice(0,1000),stack:redactDiagnostic(raw.stack||"",secrets).slice(0,2000)};
 if(typeof raw==="string")return redactDiagnostic(raw,secrets).slice(0,1500);
 if(raw===null||typeof raw==="boolean"||typeof raw==="number")return typeof raw==="number"&&!Number.isFinite(raw)?String(raw):raw;
 if(typeof raw!=="object")return String(raw);
 if(seen.has(raw))return "[circular]";seen.add(raw);
 if(Array.isArray(raw))return raw.slice(0,30).map(x=>debugSanitize(x,secrets,depth+1,seen));
 const result:Record<string,unknown>=Object.create(null);
 for(const[k,v]of Object.entries(raw).slice(0,40))result[k]=privateKey.test(k)?"[private]":debugSanitize(v,secrets,depth+1,seen);
 return result;
}
export function filterDebug(rows:DebugEntry[],category:string,query:string,errorsOnly=false){const q=query.trim().toLocaleLowerCase();return rows.filter(r=>(!category||(category==="error"?r.level==="error":r.category===category))&&(!errorsOnly||r.level==="error")&&(!q||JSON.stringify(r).toLocaleLowerCase().includes(q)));}
export function createDebugBuffer(cap=5000){let seq=0;const rows:DebugEntry[]=[];return{add(value:Omit<DebugEntry,"id">){const row={...value,id:++seq};rows.push(row);if(rows.length>cap)rows.splice(0,rows.length-cap);return row;},rows:()=>rows.slice(),clear(){rows.length=0;}};}
export function debugCategory(command:string):DebugCategory{return /gemini|llm_|ai_/.test(command)?"ai":/mpv|music|tts_|pgs_/.test(command)?"player":/browser|download/.test(command)?"browser":/http|fetch|torrent|yt_|tmdb|transcript/.test(command)?"network":"app";}
export function debugExport(rows:DebugEntry[],context:Record<string,unknown>){return "Luna debug report\n"+JSON.stringify(context,null,2)+"\n\n"+rows.map(r=>JSON.stringify(r)).join("\n");}
