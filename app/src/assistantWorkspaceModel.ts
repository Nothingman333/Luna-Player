import type { Item, Parsed } from "./library";
export type MediaOverride={kind:"movie"|"tv";title:string;year?:number;season?:number;episode?:number};
export type MediaOverrides=Record<string,MediaOverride>;
export function cleanOverrides(raw:unknown):MediaOverrides{
 if(!raw||typeof raw!=="object"||Array.isArray(raw))throw Error("Sınıflandırma kaydı hasarlı; üzerine yazılmadı.");
 const out:MediaOverrides=Object.create(null);
 for(const[path,value]of Object.entries(raw)){
  const v=value as MediaOverride;if(!path||!v||!["movie","tv"].includes(v.kind)||typeof v.title!=="string"||!v.title.trim()||v.title.length>500)throw Error("Geçersiz sınıflandırma kaydı.");
  for(const key of ["year","season","episode"] as const)if(v[key]!==undefined&&(!Number.isInteger(v[key])||v[key]!<(key==="year"?1:0)||v[key]!>9999))throw Error("Geçersiz yıl/sezon/bölüm.");
  out[path]={kind:v.kind,title:v.title.trim(),...(v.year?{year:v.year}:{}),...(v.kind==="tv"?{season:v.season??1,...(v.episode!==undefined?{episode:v.episode}:{})}:{})};
 }return out;
}
export function applyMediaOverride(_base:Parsed,override:MediaOverride):Parsed{return {kind:override.kind,title:override.title,...(override.year?{year:override.year}:{}),...(override.kind==="tv"?{season:override.season??1,...(override.episode!==undefined?{episode:override.episode}:{})}:{})};}
export type ClassificationInput={key?:string;path?:string;kind:"movie"|"tv";title?:string;year?:number;season?:number;episode?:number};
export function classificationPlan(items:Item[],entries:ClassificationInput[]):{path:string;before:Parsed;after:MediaOverride;label:string}[]{
 if(!Array.isArray(entries)||!entries.length||entries.length>200)throw Error("Bir işlemde 1–200 kayıt seç.");
 const out:{path:string;before:Parsed;after:MediaOverride;label:string}[]=[];const seen=new Set<string>();
 for(const entry of entries){
  const found=items.filter(item=>entry.path?item.files.some(f=>f.path===entry.path)&&(!entry.key||item.key===entry.key):entry.key?item.key===entry.key:false);
  if(found.length!==1)throw Error("Kayıt tekil eşleşmedi; denetimdeki key veya path kullanılmalı.");
  const item=found[0];if(!["movie","tv"].includes(entry.kind))throw Error("Tür movie veya tv olmalı.");
  if(entry.kind==="tv"&&!entry.title?.trim()&&item.parsed.kind!=="tv")throw Error("Dizi adı gerekli; numaralı dosya adı tek başına dizi kanıtı değildir.");
  for(const key of ["year","season","episode"] as const)if(entry[key]!==undefined&&(!Number.isInteger(entry[key])||entry[key]!<(key==="year"?1:0)||entry[key]!>9999))throw Error("Geçersiz yıl/sezon/bölüm.");
  const title=entry.title?.trim()||item.parsed.title;
  const selected=item.files.filter(f=>!entry.path||f.path===entry.path);
  if(entry.kind==="tv"&&entry.episode!==undefined&&new Set(selected.map(f=>`${f.season??0}:${f.episode??f.path}`)).size>1)throw Error("Farklı bölümlere tek bölüm numarası verilemez; dosyaları ayrı ayrı belirt.");
  for (const file of selected){
  const value={kind:entry.kind,title,...((entry.year??(!entry.title||title===item.parsed.title?item.parsed.year:undefined))?{year:entry.year??item.parsed.year}:{}),...(entry.kind==="tv"?{season:entry.season??file.season??item.parsed.season??1,...(entry.episode!==undefined?{episode:entry.episode}:(file.episode??item.parsed.episode)!==undefined?{episode:file.episode??item.parsed.episode}:{})}:{})};

   if(seen.has(file.path))throw Error("Aynı dosya birden fazla kez seçilmiş.");seen.add(file.path);
   const after=cleanOverrides({[file.path]:value})[file.path];out.push({path:file.path,before:item.parsed,after,label:item.meta?.title||item.parsed.title});
  }
 }return out;
}
export function inspectMedia(items:Item[],args:{query?:string;kind?:string;suspectsOnly?:boolean;offset?:number;limit?:number}){
 const q=String(args.query||"").toLocaleLowerCase("tr");
 const rows=items.flatMap(item=>{if(args.kind&&args.kind!=="all"&&item.parsed.kind!==args.kind)return[];
 const files=item.files.map(f=>f.path);if(q&&![item.meta?.title,item.parsed.title,...files].some(x=>x?.toLocaleLowerCase("tr").includes(q)))return[];
 const hints:string[]=[];if(item.parsed.kind==="movie"&&files.some(p=>/(?:^|[\\/])\d{1,3}[ ._-]+[^\\/]+$/.test(p)))hints.push("Numaralı dosya adı; film de olabilir, doğrulama gerekli.");
 if(item.parsed.kind==="movie"&&files.some(p=>/(?:s\d{1,2}e\d{1,3}|season|sezon|episode|bölüm)/i.test(p)))hints.push("Dosya/klasörde bölüm işareti var.");
 if(item.meta&&item.meta.kind!==item.parsed.kind)hints.push("Eşleşme ile sınıflandırma farklı.");
 if(args.suspectsOnly&&!hints.length)return[];
 return[{key:item.key,title:item.meta?.title||item.parsed.title,kind:item.parsed.kind,year:item.meta?.year||item.parsed.year,files:item.files,hints}];});
 const offset=Math.max(0,Math.floor(args.offset||0)),limit=Math.max(1,Math.min(50,Math.floor(args.limit||30)));
 return {total:rows.length,offset,limit,hasMore:offset+limit<rows.length,rows:rows.slice(offset,offset+limit)};
}
