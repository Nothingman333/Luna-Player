import {browserAddress} from "./browserModel";
export type SavedWebTab={title:string;url:string};
export function cleanWebTabs(raw:unknown,limit=8):SavedWebTab[]{
 if(!Array.isArray(raw)||!Number.isFinite(limit)||limit<1)return [];
 limit=Math.min(200,Math.floor(limit));
 const seen=new Set<string>(),rows:SavedWebTab[]=[];
 for(const x of raw){if(!x||typeof x.url!=="string"||typeof x.title!=="string")continue;
  try{const url=browserAddress(x.url);if(seen.has(url))continue;seen.add(url);rows.push({url,title:x.title.trim().slice(0,120)||new URL(url).hostname});if(rows.length>=limit)break;}catch{}
 }return rows;
}
export function missingWebTabs(saved:SavedWebTab[],open:SavedWebTab[],capacity=8){const existing=new Set(open.map(t=>t.url));return cleanWebTabs(saved).filter(t=>!existing.has(t.url)).slice(0,Math.max(0,capacity-open.length));}

export const browserTabSearch=(text:string)=>text.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/ı/g,"i").toLowerCase();
export function matchingWebTabs<T extends SavedWebTab>(tabs:T[],query:string):T[]{const words=browserTabSearch(query).trim().split(/\s+/).filter(Boolean);return tabs.filter(t=>words.every(w=>browserTabSearch(t.title+" "+t.url).includes(w)));}
export function moveWebTab<T extends {id:number}>(tabs:T[],id:number,direction:1|-1):T[]{const at=tabs.findIndex(t=>t.id===id),to=at+direction;if(at<0||to<0||to>=tabs.length)return tabs;const next=[...tabs];[next[at],next[to]]=[next[to],next[at]];return next;}

/** Explicit import: validate the complete file before changing any stored favourites. */
export function mergeWebBookmarks(existing:SavedWebTab[],raw:unknown):SavedWebTab[]{
 const input=Array.isArray(raw)?raw:(raw&&typeof raw==="object"?(raw as {bookmarks?:unknown}).bookmarks:null);
 if(!Array.isArray(input)||input.length>200)throw Error("Invalid bookmark file (maximum 200 entries).");
 const imported=cleanWebTabs(input,200);
 if(imported.length!==new Set(input.map(x=>{if(!x||typeof x.url!=="string"||typeof x.title!=="string")throw Error("Invalid bookmark entry.");return browserAddress(x.url);})).size)throw Error("Invalid bookmark entry.");
 const merged=new Map(cleanWebTabs(existing,40).map(t=>[t.url,t]));
 for(const tab of imported)merged.set(tab.url,{...tab,title:tab.title.slice(0,80)});
 if(merged.size>40)throw Error("Maximum 40 favourites. Remove some before importing.");
 return [...merged.values()];
}
export function upsertWebBookmark(rows:SavedWebTab[],tab:SavedWebTab):SavedWebTab[]{
 const clean=cleanWebTabs([tab],1)[0];if(!clean)throw Error("Invalid favourite.");
 if(!rows.some(t=>t.url===clean.url)&&rows.length>=40)throw Error("Maximum 40 favourites. Remove one before adding another.");
 return rows.some(t=>t.url===clean.url)?rows.map(t=>t.url===clean.url?{...clean,title:clean.title.slice(0,80)}:t):[...rows,{...clean,title:clean.title.slice(0,80)}];
}

/** Moves a favourite in its saved order; searches never change the source index. */
export function moveWebBookmark<T extends SavedWebTab>(rows:T[],url:string,direction:-1|1):T[]{
 const at=rows.findIndex(r=>r.url===url),to=at+direction;if(at<0||to<0||to>=rows.length)return rows;
 const next=[...rows];[next[at],next[to]]=[next[to],next[at]];return next;
}
