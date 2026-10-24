import type {Item} from "./library";
export type SmartField="title"|"year"|"rating"|"genre"|"kind"|"runtime"|"watched";
export type SmartRule={field:SmartField;op:"contains"|"equals"|"gte"|"lte";value:string};
export type SmartList={id:string;name:string;mode:"all"|"any";rules:SmartRule[]};
const fields:SmartField[]=["title","year","rating","genre","kind","runtime","watched"];
const fold=(s:string)=>s.normalize("NFKD").replace(/\p{M}/gu,"").replace(/ı/g,"i").toLowerCase();
export function cleanSmartLists(raw:unknown):SmartList[]{
  if(!Array.isArray(raw))return[];
  return raw.slice(0,100).flatMap(x=>{
    if(!x||typeof x!=="object"||typeof x.id!=="string"||typeof x.name!=="string"||!Array.isArray(x.rules))return[];
    const rules=x.rules.slice(0,20).filter((r:SmartRule)=>r&&fields.includes(r.field)&&["contains","equals","gte","lte"].includes(r.op)&&typeof r.value==="string").map((r:SmartRule)=>({...r,value:r.value.slice(0,200)}));
    return [{id:x.id.slice(0,100),name:x.name.slice(0,120),mode:x.mode==="any"?"any" as const:"all" as const,rules}];
  });
}
export function smartMatches(item:Item,list:SmartList,watched:(path:string)=>boolean):boolean{
  const test=(r:SmartRule)=>{
    const value=r.field==="title"?(item.meta?.title??item.parsed.title):r.field==="year"?(item.meta?.year??item.parsed.year??""):r.field==="rating"?(item.meta?.rating??0):r.field==="genre"?(item.meta?.genres??[]).join(" "):r.field==="kind"?item.parsed.kind:r.field==="runtime"?(item.meta?.runtime??0):item.files.some(f=>watched(f.path))?"true":"false";
    if(r.op==="gte"||r.op==="lte"){if(!r.value.trim()||!Number.isFinite(Number(r.value)))return false;return r.op==="gte"?Number(value)>=Number(r.value):Number(value)<=Number(r.value);}
    return r.op==="contains"?fold(String(value)).includes(fold(r.value)):fold(String(value))===fold(r.value);
  };
  return !!list.rules.length&&(list.mode==="all"?list.rules.every(test):list.rules.some(test));
}
export type RenameRow={from:string;to:string;name:string;error:string};
export function renamePreview(items:Item[],template:string,activePath:string|null):RenameRow[]{
  const rows:RenameRow[]=[];const seen=new Set<string>();
  for(const item of items)for(const file of item.files){
    if(/^[a-z][\w+.-]*:\/\//i.test(file.path))continue;
    const separator=file.path.includes("\\")?"\\":"/",folder=file.path.slice(0,file.path.lastIndexOf(separator)+1),ext=file.path.match(/\.[^.\\/]+$/)?.[0]??"";
    const resolution=item.parsed.release?.resolution??file.path.match(/\b(2160|1080|720|480)p\b/i)?.[0]??"";
    const episode=file.episode!=null?` S${String(file.season??1).padStart(2,"0")}E${String(file.episode).padStart(2,"0")}`:"";
    const values:Record<string,string>={title:item.meta?.title??item.parsed.title,year:String(item.meta?.year??item.parsed.year??""),resolution,episode};
    const expanded=template.replace(/\{(title|year|resolution|episode)\}/g,(_,key)=>values[key]);
    const name=expanded.replace(/[<>:"/\\|?*\x00-\x1f]/g," ").replace(/\(\s*\)/g,"").replace(/\s+/g," ").trim().replace(/[ .-]+$/,"").slice(0,180);
    const to=folder+name+ext,normalized=to.replace(/\\/g,"/").toLowerCase();
    let error=!name||/\{[^}]+\}/.test(name)?"Invalid template":"";
    if(/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(name))error="Reserved Windows filename";
    if(activePath&&file.path.replace(/\\/g,"/").toLowerCase()===activePath.replace(/\\/g,"/").toLowerCase())error="Currently playing";
    if(seen.has(normalized))error="Duplicate destination";
    seen.add(normalized);rows.push({from:file.path,to,name,error});
  }
  // Mark both sides of a collision, including a destination from an earlier row.
  const counts=new Map<string,number>();for(const row of rows){const k=row.to.toLowerCase();counts.set(k,(counts.get(k)??0)+1);}
  return rows.map(row=>(counts.get(row.to.toLowerCase())??0)>1?{...row,error:"Duplicate destination"}:row);
}
