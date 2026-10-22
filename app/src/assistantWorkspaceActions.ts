import {store} from "./library";
import type{Item}from"./library";
import{classificationPlan,cleanOverrides,inspectMedia}from"./assistantWorkspaceModel";
import{renameShelf,deleteShelf,shelfMap,shelfNames}from"./BookData";
import{loadCollections,saveCollections}from"./Mine";
import{loadMusicPlaylists,saveMusicPlaylists}from"./Music";
import{browserActionContext,executeBrowserAction}from"./browserAssistantActions";
import type{BrowserActionContext,BrowserActionName}from"./browserAssistantActions";
const string={type:"STRING"},integer={type:"INTEGER"};
const def=(name:string,description:string,properties:Record<string,any>,required:string[]=[])=>({name,description,parameters:{type:"OBJECT",properties,required}});
export const WORKSPACE_DECLARATIONS=[
 def("inspect_media_library","Gerçek yerel film/dizi kayıtlarını key/path, tür ve bölüm şüpheleriyle sayfalı listeler. Boş sorgu tüm kütüphanedir. Şüphe kesin sınıflandırma değildir; sıradaki sayfayı offset ile al.",{query:string,kind:{type:"STRING",enum:["all","movie","tv"]},suspectsOnly:{type:"BOOLEAN"},offset:integer,limit:integer}),
 def("classify_library_items","Bilinen kayıtları film/dizi olarak düzeltir. Önce inspect_media_library ile key/path al. Diziye dönüşte gerçek dizi adı gerekli; yalnız numaralı dosyayı kesin bölüm sayma. Belirsiz adı kullanıcıya sor. Dosyaya dokunmaz; onay ve geri alma vardır.",{assignments:{type:"ARRAY",items:{type:"OBJECT",properties:{key:string,path:string,kind:{type:"STRING",enum:["movie","tv"]},title:string,year:integer,season:integer,episode:integer},required:["kind"]}}},["assignments"]),
 def("reset_library_classification","Bilinen dosyaların elle sınıflandırmasını kaldırıp dosya/klasör algısına döndürür. Önizleme, onay ve geri alma gerekir.",{paths:{type:"ARRAY",items:string}},["paths"]),
 def("set_library_metadata_lock","Bilinen film/dizi kayıtlarının başlık/kapak/özet kilidini değiştirir. Kimlik ya da başlık uydurmaz.",{keys:{type:"ARRAY",items:string},locked:{type:"BOOLEAN"}},["keys","locked"]),
 def("inspect_workspace","Gerçek raf, müzik listesi veya koleksiyon adlarını ve ID'lerini listeler. Uzun bir listenin id değerini ver; offset/limit ile öğelerini sayfala. Düzenleme indices değerleri dönen mutlak index olmalı. hasMore bitmeden tüm liste incelendi deme.",{section:{type:"STRING",enum:["book_shelves","music_playlists","collections"]},id:string,offset:integer,limit:integer},["section"]),
 def("manage_book_shelf","Mevcut konu rafını yeniden adlandırır veya raf etiketini kaldırır. Kitap, okuma geçmişi ve dosya silinmez; onay ve geri alma vardır.",{action:{type:"STRING",enum:["rename","delete"]},name:string,newName:string},["action","name"]),
 def("edit_music_playlist","Mevcut müzik listesinde ad değiştirir veya belirtilen sıralardaki şarkıları listeden çıkarır. index 0 tabanlıdır; önce inspect_workspace ile gerçek ID/sıra al. Dosya silinmez.",{id:string,action:{type:"STRING",enum:["rename","remove_tracks"]},name:string,indices:{type:"ARRAY",items:integer}},["id","action"]),
 def("edit_collection","Gerçek koleksiyonda ad değiştirir, seçili öğeleri çıkarır veya koleksiyon kaydını kaldırır. Öğelerin dosyalarına dokunmaz; onay ve geri alma vardır. index 0 tabanlıdır.",{id:string,action:{type:"STRING",enum:["rename","remove_items","delete"]},name:string,indices:{type:"ARRAY",items:integer}},["id","action"]),
 def("manage_web","Kullanıcının açıkça istediği Web işlemi: sekmeleri listele/aç/odağı değiştir/kapat/yenile, sayfada bul, sustur, favori/okuma kuyruğu/sayfa notu. Açık sayfa işlemlerinde geçerli sekme onay sırasında değişirse uygulanmaz. close dosyaları silmez.",{action:{type:"STRING",enum:["list","open","focus","close","reload","find","mute","bookmark","read_later","note"]},url:string,tabId:integer,text:string,muted:{type:"BOOLEAN"}},["action"]),
];
export const WORKSPACE_NAMES=new Set(WORKSPACE_DECLARATIONS.map(d=>d.name));
export const WORKSPACE_MUTATIONS=new Set(["classify_library_items","reset_library_classification","set_library_metadata_lock","manage_book_shelf","edit_music_playlist","edit_collection"]);
export const WEB_SAVED=new Set(["bookmark","read_later","note"]);
export const WORKSPACE_KEYS=["lunaMediaOverrides","meta","bookShelves","bookShelfNames","bookWantToRead","musicPlaylists","collections","lunaWebBookmarks","lunaWebReading","lunaWebNotes"];
export type ActionPreview={label:string;rows?:{title:string;sub?:string;note?:string}[];expected:Record<string,string|null>;web?:BrowserActionContext};
const original=(keys:string[])=>Object.fromEntries(keys.map(k=>[k,store.get(k)]));
const dataObject=(key:string)=>{const v=JSON.parse(store.get(key)||"{}");if(!v||typeof v!=="object"||Array.isArray(v))throw Error("Kayıt hasarlı: "+key);return v as Record<string,any>;};
const nameOf=(x:unknown)=>{if(typeof x!=="string"||!x.trim()||x.trim().length>150)throw Error("Geçerli bir ad gerekli.");return x.trim();};
const indicesOf=(raw:unknown,size:number)=>{if(!Array.isArray(raw)||!raw.length||raw.length>200||raw.some(x=>!Number.isInteger(x)||x<0||x>=size)||new Set(raw).size!==raw.length)throw Error("Öğe sırası geçersiz; önce güncel listeyi oku.");return raw as number[];};
const checkExpected=(expected:Record<string,string|null>)=>{for(const[k,v]of Object.entries(expected))if(store.get(k)!==v)throw Error("Kayıt onay sırasında değişti; işlem uygulanmadı. Önce yeniden incele.");};
export function workspaceActionTitle(name:string,a:any){return ({classify_library_items:`Film/dizi sınıflandırması: ${a.assignments?.length||0} seçim`,reset_library_classification:`Elle sınıflandırmayı kaldır: ${a.paths?.length||0} dosya`,set_library_metadata_lock:`Bilgi kilidi: ${a.locked?"kilitle":"kilidi aç"}`,manage_book_shelf:`Raf ${a.name}: ${a.action}`,edit_music_playlist:`Müzik listesi ${a.id}: ${a.action}`,edit_collection:`Koleksiyon ${a.id}: ${a.action}`,manage_web:`Web: ${a.action}`,inspect_workspace:"Çalışma alanına bak",inspect_media_library:"Film/dizi kütüphanesine bak"} as Record<string,string>)[name]||name;}
export function prepareWorkspaceAction(name:string,a:any,items:Item[]):ActionPreview{
 let label=workspaceActionTitle(name,a),rows:ActionPreview["rows"],keys:string[]=[];let web:BrowserActionContext|undefined;
 if(name==="classify_library_items"){
  const plan=classificationPlan(items,a.assignments);if(plan.length>200)throw Error("Bir seferde en fazla 200 dosya seç.");
  a.assignments=plan.map(p=>({path:p.path,...p.after}));
  rows=plan.map(p=>({title:p.label,sub:p.path,note:`${p.before.kind} → ${p.after.kind} · ${p.after.title}${p.after.kind==="tv"?` · S${p.after.season}${p.after.episode!==undefined?` E${p.after.episode}`:""}`:""}`}));keys=["lunaMediaOverrides"];
 }
 if(name==="reset_library_classification"){
  if(!Array.isArray(a.paths)||!a.paths.length||a.paths.length>200||new Set(a.paths).size!==a.paths.length)throw Error("1–200 tekil dosya seç.");
  const paths=new Set(items.flatMap(i=>i.files.map(f=>f.path)));if(a.paths.some((p:any)=>!paths.has(p)))throw Error("Kütüphanede olmayan dosya seçildi.");
  rows=a.paths.map((path:string)=>({title:path,note:"Dosya/klasör algısına geri dönecek"}));keys=["lunaMediaOverrides"];
 }
 if(name==="set_library_metadata_lock"){
  if(!Array.isArray(a.keys)||!a.keys.length||a.keys.length>100||new Set(a.keys).size!==a.keys.length)throw Error("1–100 tekil kayıt seç.");const meta=dataObject("meta");
  const found=a.keys.map((key:string)=>{const item=items.find(i=>i.key===key);if(!item||!meta[key])throw Error("Eşleşmiş kayıt bulunamadı: "+key);return item;});rows=found.map((i:Item)=>({title:i.meta?.title||i.parsed.title,note:a.locked?"Bilgileri kilitle":"Bilgi kilidini aç"}));keys=["meta"];
 }
 if(name==="manage_book_shelf"){
  const map=shelfMap(),count=Object.values(map).filter(list=>list.includes(a.name)).length;const savedNames=JSON.parse(store.get("bookShelfNames")||"[]");if(!Array.isArray(savedNames)||savedNames.some(x=>typeof x!=="string"))throw Error("Raf adları hasarlı.");const names=shelfNames();if(!names.includes(a.name))throw Error("Raf bulunamadı.");
  if(a.action==="rename"){const target=nameOf(a.newName);if(target.length>60||target!==a.name&&names.includes(target))throw Error("Raf adı en fazla 60 karakter olmalı ve başka bir rafla çakışmamalı.");}label=`${a.name} rafı ${a.action==="rename"?a.newName+" olarak yeniden adlandırılacak":"kaldırılacak"} · ${count} kitap etiketi; dosyalar korunur.`;keys=["bookShelves","bookShelfNames","bookWantToRead"];
 }
 if(name==="edit_music_playlist"){
  const pl=loadMusicPlaylists().find(x=>x.id===a.id);if(!pl)throw Error("Müzik listesi bulunamadı.");if(a.action==="rename")nameOf(a.name);else indicesOf(a.indices,pl.items.length);
  label=`${pl.name}: ${a.action==="rename"?a.name+" olarak yeniden adlandırılacak":a.indices.map((i:number)=>pl.items[i].title).join(", ")+" listeden çıkarılacak"}. Dosyalar korunur.`;keys=["musicPlaylists"];
 }
 if(name==="edit_collection"){
  const col=loadCollections().find(x=>x.id===a.id);if(!col)throw Error("Koleksiyon bulunamadı.");if(a.action==="rename")nameOf(a.name);if(a.action==="remove_items")indicesOf(a.indices,col.items.length);
  label=`${col.name}: ${a.action==="rename"?a.name+" olarak yeniden adlandırılacak":a.action==="delete"?"koleksiyon kaydı kaldırılacak":a.indices.map((i:number)=>col.items[i].title).join(", ")+" koleksiyondan çıkarılacak"}. Dosyalar korunur.`;keys=["collections"];
 }
 if(name==="manage_web"){
  web=browserActionContext();if(a.action!=="open"&&a.action!=="list"&&web.id===null)throw Error("Önce bir Web sekmesi aç.");
  if(!["list","open","focus"].includes(a.action)&&a.tabId!==undefined&&a.tabId!==web.id)throw Error("İstenen sekme etkin değil; önce o sekmeye geç ve yeniden onayla.");
  if(a.action==="mute"&&typeof a.muted!=="boolean")throw Error("Sessiz durumu gerekli.");
  if(a.action==="open"&&!a.url?.trim())throw Error("Açılacak adres veya arama gerekli.");
  if(["note","find"].includes(a.action)&&!a.text?.trim())throw Error("Not veya aranacak metin gerekli.");
  if(a.action==="focus"&&!web.tabs.some(t=>t.id===a.tabId))throw Error("Sekme bulunamadı.");
  label=`Web ${a.action}${a.action==="mute"?(a.muted?" (sesi kapat)":" (sesi aç)"):a.action==="close"?" (sekme kapanacak)":""}: ${a.action==="open"?a.url:a.action==="focus"?web.tabs.find(t=>t.id===a.tabId)?.title:web.title||web.url}${a.text?" · "+a.text.slice(0,300):""}`;
  keys=a.action==="bookmark"?["lunaWebBookmarks"]:a.action==="read_later"?["lunaWebReading"]:a.action==="note"?["lunaWebNotes"]:[];
 }return {label,rows,expected:original(keys),web};
}
export async function runWorkspaceAction(name:string,a:any,items:Item[],preview?:ActionPreview):Promise<string>{
 if(name==="inspect_media_library")return JSON.stringify(inspectMedia(items,a));
 if(name==="inspect_workspace"){
  if(a.section==="book_shelves")return JSON.stringify({names:shelfNames(),counts:Object.fromEntries(Object.values(shelfMap()).flat().map(s=>[s,Object.values(shelfMap()).filter(v=>v.includes(s)).length]))});
  const lists=a.section==="music_playlists"?loadMusicPlaylists():loadCollections();
  const list=a.id?lists.filter(p=>p.id===a.id):lists;if(a.id&&!list.length)throw Error("Liste bulunamadı; önce gerçek ID'leri incele.");
  const offset=Math.max(0,Math.floor(a.offset||0)),limit=Math.max(1,Math.min(200,Math.floor(a.limit||50)));
  return JSON.stringify(list.map(p=>({id:p.id,name:p.name,total:p.items.length,offset,limit,items:p.items.slice(offset,offset+limit).map((v,i)=>({index:offset+i,title:v.title})),truncated:offset>0||offset+limit<p.items.length,hasMore:offset+limit<p.items.length})));
 }
 const plan=preview||prepareWorkspaceAction(name,a,items);checkExpected(plan.expected);
 if(name==="manage_web")return executeBrowserAction(a.action as BrowserActionName,a,plan.web);
 // Revalidate current identities immediately before an approved storage mutation.
 prepareWorkspaceAction(name,a,items);
 if(name==="classify_library_items"){
  const current=cleanOverrides(dataObject("lunaMediaOverrides"));for(const entry of classificationPlan(items,a.assignments))current[entry.path]=entry.after;
  if(!store.set("lunaMediaOverrides",JSON.stringify(current)))throw Error("Sınıflandırma kaydedilemedi.");window.dispatchEvent(new Event("luna-library"));return `${a.assignments.length} dosyanın film/dizi sınıflandırması güncellendi. Dosyalar taşınmadı.`;
 }
 if(name==="reset_library_classification"){
  const current=cleanOverrides(dataObject("lunaMediaOverrides"));for(const path of a.paths)delete current[path];if(!store.set("lunaMediaOverrides",JSON.stringify(current)))throw Error("Kaydedilemedi.");window.dispatchEvent(new Event("luna-library"));return `${a.paths.length} dosyanın elle sınıflandırması kaldırıldı.`;
 }
 if(name==="set_library_metadata_lock"){
  const meta=dataObject("meta");for(const key of a.keys)meta[key]={...meta[key],locked:a.locked};if(!store.set("meta",JSON.stringify(meta)))throw Error("Kaydedilemedi.");window.dispatchEvent(new Event("luna-library"));return `${a.keys.length} kaydın bilgi kilidi güncellendi.`;
 }
 if(name==="manage_book_shelf"){if(a.action==="rename")renameShelf(a.name,a.newName);else deleteShelf(a.name);return plan.label;}
 if(name==="edit_music_playlist"){
  const lists=loadMusicPlaylists(),pl=lists.find(x=>x.id===a.id)!;if(a.action==="rename")pl.name=nameOf(a.name);else pl.items=pl.items.filter((_,i)=>!a.indices.includes(i));if(!saveMusicPlaylists(lists))throw Error("Müzik listesi kaydedilemedi.");return plan.label;
 }
 if(name==="edit_collection"){
  let lists=loadCollections();const col=lists.find(x=>x.id===a.id)!;if(a.action==="rename")col.name=nameOf(a.name);else if(a.action==="delete")lists=lists.filter(x=>x.id!==a.id);else col.items=col.items.filter((_,i)=>!a.indices.includes(i));saveCollections(lists);return plan.label;
 }
 throw Error("Bilinmeyen çalışma alanı işlemi.");
}
