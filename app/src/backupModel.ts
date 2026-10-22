/** Endpoint/profile metadata must stay paired with keys in this computer's credential vault. */
export const API_CONNECTION_KEYS=["aiProfiles","aiProfile","aiProvider","aiBase","geminiModel","geminiModelIds","aiModel:openai","aiModel:claude","aiModel:custom","reviewAiProvider","reviewAiModel"] as const;
export function preserveApiConnections(incoming:Record<string,string>,current:Record<string,string>):Record<string,string>{
 const out:Record<string,string>=Object.assign(Object.create(null),incoming);
 for(const key of API_CONNECTION_KEYS){delete out[key];if(Object.prototype.hasOwnProperty.call(current,key))out[key]=current[key];}
 return out;
}
export function backupComparison(before:Record<string,string>,after:Record<string,string>){const a=Object.keys(before),b=Object.keys(after);return{added:b.filter(k=>!(k in before)).length,changed:b.filter(k=>k in before&&before[k]!==after[k]).length,removed:a.filter(k=>!(k in after)).length,unchanged:b.filter(k=>k in before&&before[k]===after[k]).length};}
export function backupDate(raw:unknown,locale?:string){if(typeof raw!=="string"&&typeof raw!=="number")return "—";const d=new Date(raw);return Number.isFinite(d.getTime())?d.toLocaleString(locale):"—";}
export function localBackupDay(now=new Date()){return [now.getFullYear(),String(now.getMonth()+1).padStart(2,"0"),String(now.getDate()).padStart(2,"0")].join("-");}
export function sameBackupPath(a:string,b:string){return a.replace(/\\/g,"/").toLowerCase()===b.replace(/\\/g,"/").toLowerCase();}
