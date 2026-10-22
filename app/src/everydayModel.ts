import { browserAddress } from "./browserModel";
/** Pure models for browsing preferences, recovery, scan changes and private diagnostics. */
export type SitePreference = { muted: boolean; popups: "ask" | "block" | "tab" };
export type SitePreferences = Record<string, SitePreference>;
export const siteOrigin = (url: string): string => { try { const u=new URL(url); browserAddress(u.href); return /^https?:$/.test(u.protocol)&&!u.username&&!u.password?u.origin:""; } catch { return ""; } };
export function cleanSitePreferences(raw: unknown): SitePreferences {
 const out: SitePreferences=Object.create(null);
 if(raw&&typeof raw==="object"&&!Array.isArray(raw)) for(const [url,p] of Object.entries(raw).slice(-200)) {
  if(siteOrigin(url)!==url||!p||typeof p!=="object")continue;
  const x=p as Partial<SitePreference>;out[url]={muted:x.muted===true,popups:x.popups==="block"||x.popups==="tab"?x.popups:"ask"};
 }return out;
}
export type RecoveryTab={title:string;url:string;pinned:boolean};
export function recoveryTabs(raw:unknown):RecoveryTab[]{
 if(!Array.isArray(raw))return [];const seen=new Set<string>();
 return raw.flatMap(x=>{if(!x||typeof x.url!=="string"||x.url.length>2048||!siteOrigin(x.url)||seen.has(x.url))return [];seen.add(x.url);return [{url:x.url,title:typeof x.title==="string"?x.title.slice(0,300):new URL(x.url).hostname,pinned:x.pinned===true}];}).slice(0,8);
}
const pathKey=(p:string)=>p.replace(/\\/g,"/").toLowerCase();
const filename=(p:string)=>pathKey(p).split("/").pop()||p;
export type ScanSummary={at:number;added:string[];removed:string[];relinked:{from:string;to:string}[];offline:string[];metadata:string[];error?:string};
export function scanChanges(before:string[],after:string[],offline:string[]=[],at=Date.now()):ScanSummary{
 const old=new Map(before.map(p=>[pathKey(p),p])),next=new Map(after.map(p=>[pathKey(p),p]));
 const added=[...next].filter(([k])=>!old.has(k)).map(([,p])=>p),removed=[...old].filter(([k])=>!next.has(k)).map(([,p])=>p);
 const relinked:{from:string;to:string}[]=[];
 for(const from of removed){const candidates=added.filter(to=>filename(to)===filename(from));if(candidates.length===1&&removed.filter(x=>filename(x)===filename(from)).length===1)relinked.push({from,to:candidates[0]});}
 return {at,added:added.filter(p=>!relinked.some(r=>r.to===p)),removed:removed.filter(p=>!relinked.some(r=>r.from===p)),relinked,offline,metadata:[]};
}
/** Logs are optional; no chat text, library database or credentials enter the diagnostic envelope. */
export function redactDiagnostic(text:string,secrets:string[]=[]):string{
 let clean=String(text).slice(-100000);
 for(const key of secrets.filter(k=>k.length>=4).sort((a,b)=>b.length-a.length))clean=clean.split(key).join("[SECRET]");
 return clean.replace(/\b(?:sk|AIza)[\w-]{12,}\b/g,"[SECRET]")
 .replace(/(["']?authorization["']?\s*[:=]\s*["']?)(?:bearer\s+)?[^\s"',;}]+/gi,"$1[SECRET]")
 .replace(/(["']?(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)["']?\s*[:=]\s*["']?)[^\s"',;}]+/gi,"$1[SECRET]")
 .replace(/https?:\/\/[^\s"'<>]+/gi,raw=>{try{const u=new URL(raw);return u.origin+"/[URL]";}catch{return "[URL]";}})
 .replace(/\b[A-Za-z]:[\\/][^\r\n"<>]+/g,"[LOCAL PATH]").replace(/\\\\[^\r\n"<>]+/g,"[LOCAL PATH]");
}
export function editionLabels(path:string):string[]{
 const name=filename(path);return [[/director.?s?\W*cut/i,"Director’s cut"],[/extended/i,"Extended"],[/theatrical/i,"Theatrical"],[/remaster/i,"Remastered"],[/imax/i,"IMAX"],[/criterion/i,"Criterion"],[/\b(2160p|4k)\b/i,"4K"],[/\b1080p\b/i,"1080p"]].filter(([rx])=>(rx as RegExp).test(name)).map(([,label])=>label as string);
}
/** Compare only the edited record: unrelated background metadata changes are allowed. */
export function metadataEditUnchanged(before:string|null,after:string|null,key:string):boolean{
 try{const a=JSON.parse(before||"{}"),b=JSON.parse(after||"{}");
  if(!a||!b||typeof a!=="object"||typeof b!=="object"||Array.isArray(a)||Array.isArray(b))return false;
  return JSON.stringify(a[key]??null)===JSON.stringify(b[key]??null);
 }catch{return false;}
}
export type Matchable={key:string;parsed:{kind:string;title:string;year?:string|number};meta:{id:number;kind:string;title:string;year:string}|null};
const fold=(s:string)=>s.toLocaleLowerCase("tr").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/ı/g,"i").replace(/[^\p{L}\p{N}]+/gu," ").trim();
export function pageLibraryMatches(url:string,title:string,items:Matchable[]):{exact:boolean;keys:string[]}{
 let u:URL;try{u=new URL(url);}catch{return {exact:false,keys:[]};}
 const tm=/^(?:www\.)?themoviedb\.org$/.test(u.hostname)?u.pathname.match(/^\/(movie|tv)\/(\d+)(?:-|\/|$)/):null;
 if(tm)return {exact:true,keys:items.filter(i=>i.meta?.id===Number(tm[2])&&i.meta.kind===tm[1]).map(i=>i.key)};
 if(!/^(?:www\.)?(?:imdb\.com|letterboxd\.com)$/.test(u.hostname)||!/^\/(?:title\/tt\d+|film\/[^/]+)/.test(u.pathname))return {exact:false,keys:[]};
 const plain=fold(title.replace(/\s*[-|—]\s*(?:IMDb|Letterboxd).*$/i,"").replace(/\(\d{4}\)/g,"")),year=title.match(/\b(?:19|20)\d{2}\b/)?.[0];
 const keys=items.filter(i=>{const name=fold(i.meta?.title||i.parsed.title);return name.length>2&&(plain===name||plain.startsWith(name+" directed by "))&&(!year||String(i.meta?.year||i.parsed.year)===year);}).map(i=>i.key);
 return {exact:false,keys:[...new Set(keys)]};
}
