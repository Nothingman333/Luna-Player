import {bookFold} from "./bookDataModel";
export type QuoteEntry={key:string;b:{path:string;title:string;author:string};h:{id:string;cfi:string;text:string;note?:string;chapter?:string;at:number;color:string}};
export function cleanQuoteTags(raw:unknown):Record<string,string[]>{if(!raw||typeof raw!=="object"||Array.isArray(raw)||!Object.values(raw).every(v=>Array.isArray(v)&&v.every(t=>typeof t==="string")))throw Error("Quote tags are damaged; export a backup before editing.");return raw as Record<string,string[]>;}
export const quoteTags=(value:string)=>[...new Set(value.split(",").map(t=>t.trim().slice(0,40)).filter(Boolean))].slice(0,12);
export function selectQuotes<T extends QuoteEntry>(rows:T[],query:string,tag:string,path:string,sort:"new"|"old"|"book",tags:Record<string,string[]>){
 const words=bookFold(query).split(" ").filter(Boolean);return rows.filter(x=>(!path||x.b.path===path)&&(!tag||(tags[x.key]||[]).includes(tag))&&words.every(w=>bookFold([x.h.text,x.h.note,x.h.chapter,x.b.title,x.b.author,...(tags[x.key]||[])].join(" ")).includes(w))).sort((a,b)=>(sort==="book"?a.b.title.localeCompare(b.b.title,undefined,{numeric:true}):sort==="old"?a.h.at-b.h.at:b.h.at-a.h.at)||a.key.localeCompare(b.key));
}
export function quoteMarkdown(rows:QuoteEntry[],tags:Record<string,string[]>){return rows.map(x=>`> ${x.h.text.replace(/\r\n?|\n/g,"\n> ")}\n\n— ${x.b.title}, ${x.b.author}\n${x.h.chapter||""}\n${Number.isFinite(new Date(x.h.at).getTime())?new Date(x.h.at).toISOString():""}\n${x.h.note||""}\n${(tags[x.key]||[]).join(", ")}\n`).join("\n---\n\n");}
const clamp=(raw:unknown,fallback:number,min:number,max:number)=>typeof raw==="number"&&Number.isFinite(raw)?Math.max(min,Math.min(max,raw)):fallback;
export type ReadingPreferences={theme:"day"|"quiet"|"sepia"|"dusk"|"night"|"forest";size:number;font:"serif"|"sans"|"atkinson"|"dyslexic"|"lexend";spread:boolean;spacing:"tight"|"normal"|"loose";bold:boolean;scroll:boolean;dim:number;warm:number};
export function cleanReadingPreferences(raw:unknown):ReadingPreferences{
 const x=(raw&&typeof raw==="object"&&!Array.isArray(raw)?raw:{})as Partial<ReadingPreferences>;
 const theme=(["day","quiet","sepia","dusk","night","forest"].includes(x.theme||"")?x.theme:(x.theme as string)==="gray"?"dusk":"sepia")as ReadingPreferences["theme"];
 return{theme,size:clamp(x.size,100,70,200),font:x.font==="sans"||x.font==="atkinson"||x.font==="dyslexic"||x.font==="lexend"?x.font:"serif",spread:x.spread!==false,spacing:x.spacing==="tight"||x.spacing==="loose"?x.spacing:"normal",bold:x.bold===true,scroll:x.scroll===true,dim:clamp(x.dim,0,0,.7),warm:clamp(x.warm,0,0,1)};
}
export type ReadingSession<B={path:string}>={b:B;at:number;mins:number;from:number;to:number;aloud?:number;endAt?:number};
export function mergeReadingSession<B extends{path:string}>(rows:ReadingSession<B>[],entry:ReadingSession<B>):ReadingSession<B>[]{
 if(![entry.at,entry.mins,entry.from,entry.to].every(Number.isFinite)||entry.mins<.3||!Number.isFinite(new Date(entry.at+entry.mins*60000).getTime())||entry.at<=0||entry.from<0||entry.from>1||entry.to<0||entry.to>1)return rows;
 const last=rows[0],gap=last?entry.at-((Number.isFinite(last.endAt)?last.endAt!:last.at+last.mins*60000)):Infinity;
 if(last&&last.b.path===entry.b.path&&readingDayKey(last.at)===readingDayKey(entry.at)&&gap>=0&&gap<30*60000)return[{...last,endAt:entry.at+entry.mins*60000,mins:last.mins+entry.mins,to:entry.to,aloud:Math.min(last.mins+entry.mins,(last.aloud||0)+(entry.aloud||0))||undefined},...rows.slice(1)].slice(0,300);
 return[{...entry,endAt:entry.at+entry.mins*60000},...rows].slice(0,300);
}
export function readingDayKey(at:number){const d=new Date(at);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}

/** Rendering can filter damaged annotations, but an edit must not silently erase rejected rows. */
export function annotationDataWritable(raw:unknown,clean:{hl:unknown[];marks:unknown[];notes:unknown[]}):boolean{
 if(!raw||typeof raw!=="object"||Array.isArray(raw))return false;
 const x=raw as Record<string,unknown>;
 return (["hl","marks","notes"]as const).every(key=>x[key]===undefined||(Array.isArray(x[key])&&x[key].length===clean[key].length));
}
