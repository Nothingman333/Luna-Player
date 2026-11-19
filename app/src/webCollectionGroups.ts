import type { CItem } from "./Mine";
import { webHttpUrl } from "./webCollectionModel";

export function collectionSource(item:CItem):string {
  const url=webHttpUrl(item.from)||webHttpUrl(item.url);
  return url?new URL(url).hostname.replace(/^www\./,""):"";
}
export function groupCollectionItems(items:CItem[]) {
  const groups=new Map<string,{source:string;items:{item:CItem;index:number}[]}>();
  items.forEach((item,index)=>{
    const source=item.kind==="web"?collectionSource(item):"";
    const key=source||item.kind;
    if(!groups.has(key))groups.set(key,{source,items:[]});
    groups.get(key)!.items.push({item,index});
  });
  return [...groups.entries()].map(([key,value])=>({key,...value}));
}
/** Merge only quotes from the same page: media and each quote's source remain intact. */
export function mergeCollectionQuotes(items:CItem[],indices:number[]):CItem[] {
  const sorted=[...new Set(indices)].sort((a,b)=>a-b),quotes=sorted.map(i=>items[i]);
  if(quotes.length<2||quotes.some(x=>!x||x.kind!=="web"||x.webType!=="text"))throw Error("quotes-required");
  const source=webHttpUrl(quotes[0].from)||webHttpUrl(quotes[0].url);
  if(!source||quotes.some(x=>(webHttpUrl(x.from)||webHttpUrl(x.url))!==source))throw Error("same-page-required");
  const note=[...new Set(quotes.map(x=>(x.note||x.title).trim()).filter(Boolean))].join("\n\n");
  const merged={...quotes[0],title:note.slice(0,100),note};
  return items.flatMap((item,index)=>index===sorted[0]?[merged]:sorted.includes(index)?[]:[item]);
}
