import type {WebReading} from "./extrasModel";
import type {PageNote} from "./browserRecords";
import {browserTabSearch} from "./browserWorkspaceModel";

export type ReadingFilter = "all" | "unread" | "started" | "read";
export type WebOrder = "recent" | "title" | "progress";
export function selectWebReading(rows:WebReading[],notes:PageNote[],query:string,status:ReadingFilter,order:WebOrder):WebReading[]{
 const words=browserTabSearch(query).trim().split(/\s+/).filter(Boolean),byUrl=new Map(notes.map(n=>[n.url,n.text]));
 return rows.filter(r=>(status==="all"||(status==="read"?r.done:!r.done&&(status!=="started"||r.progress>0&&r.progress<1))))
 .filter(r=>words.every(w=>browserTabSearch(r.title+" "+r.url+" "+(byUrl.get(r.url)||"")).includes(w)))
 .sort((a,b)=>order==="title"?a.title.localeCompare(b.title)||a.url.localeCompare(b.url):order==="progress"?b.progress-a.progress||b.at-a.at:b.at-a.at||a.url.localeCompare(b.url));
}
export function selectPageNotes(rows:PageNote[],reading:WebReading[],query:string):PageNote[]{
 const words=browserTabSearch(query).trim().split(/\s+/).filter(Boolean),titles=new Map(reading.map(r=>[r.url,r.title]));
 return rows.filter(n=>words.every(w=>browserTabSearch(n.text+" "+n.url+" "+(titles.get(n.url)||"")).includes(w))).sort((a,b)=>b.at-a.at||a.url.localeCompare(b.url));
}
export function restoreQueuedPage(rows:WebReading[],entry:WebReading,index:number):WebReading[]{
 if(rows.some(r=>r.url===entry.url))throw Error("This page was saved again; its newer entry was kept.");
 if(rows.length>=300)throw Error("Reading list full (300)");
 const next=[...rows];next.splice(Math.max(0,Math.min(next.length,index)),0,entry);return next;
}
export function noteBaseUnchanged(rows:PageNote[],url:string,base:string):boolean{return (rows.find(n=>n.url===url)?.text||"")===base;}
export function webNotebookMarkdown(reading:WebReading[],notes:PageNote[],tr:boolean):string{
 const clean=(s:string)=>s.replace(/[\r\n]+/g," ").replace(/([\[\]\\])/g,"\\$1");
 const link=(url:string)=>url.replace(/</g,"%3C").replace(/>/g,"%3E").replace(/[\r\n]/g,"");
 const noteMap=new Map(notes.map(n=>[n.url,n]));
 const rows=reading.map(r=>`## [${clean(r.title)}](<${link(r.url)}>)\n\n${r.done?(tr?"Okundu":"Read"):(tr?"Sırada":"Queued")} · ${Math.round(r.progress*100)}%\n\n${noteMap.get(r.url)?.text||""}`);
 const included=new Set(reading.map(r=>r.url));
 for(const n of notes)if(!included.has(n.url))rows.push(`## <${link(n.url)}>\n\n${n.text}`);
 return `# Luna Web ${tr?"defterim":"notebook"}\n\n`+rows.join("\n\n---\n\n");
}
