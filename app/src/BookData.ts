import {reorderReadingPlan} from "./bookLibraryModel";
import{invoke}from"./nativeCore";
import{store}from"./library";
import type{Book}from"./Books";
import{writeDelta}from"./extrasModel";
import{validIsbn,cleanBookQuery,olCandidates,googleCandidates,bookIdentity,publicImage,plainBookText}from"./bookDataModel";
import type{BookDetails,BookCandidate}from"./bookDataModel";
export type{BookDetails,BookCandidate}from"./bookDataModel";
function objectData<T>(key:string):Record<string,T>{const x=store.json<unknown>(key,{});return x&&typeof x==="object"&&!Array.isArray(x)?x as Record<string,T>:{};}
export const bookDetails=(path:string):BookDetails|undefined=>{const d=objectData<BookDetails>("bookDetailsByPath")[path];return d&&[d.title,d.author,d.isbn,d.cover,d.description].every(x=>typeof x==="string")&&Array.isArray(d.subjects)&&d.subjects.every(x=>typeof x==="string")&&(d.source===undefined||typeof d.source==="string")&&(d.url===undefined||typeof d.url==="string")&&(d.year===undefined||Number.isInteger(d.year))?d:undefined;};
export function withBookInfo(b:Book):Book{
 const info=bookDetails(b.path),legacy=store.json<{cover?:string}|null>("olInfo:"+bookIdentity(b),null);
 const originalCover=b.originalCover!==undefined?b.originalCover:b.cover??null;
 return {...b,originalCover,identityTitle:b.identityTitle??b.title,identityAuthor:b.identityAuthor??b.author,title:info?.title||b.identityTitle||b.title,author:info?.author??b.identityAuthor??b.author,isbn:info?.isbn||b.isbn,cover:info?(info.cover||originalCover):(originalCover||legacy?.cover||null)};
}
export const shelfMap=()=>{const raw=objectData<unknown>("bookShelves");return Object.fromEntries(Object.entries(raw).filter(([,v])=>Array.isArray(v)&&v.every(x=>typeof x==="string"))) as Record<string,string[]>;};
export function shelfNames(){const names=store.json<unknown>("bookShelfNames",[]);return [...new Set([...(Array.isArray(names)?names.filter((x):x is string=>typeof x==="string"):[]),...Object.values(shelfMap()).flat()])].sort((a,b)=>a.localeCompare(b));}
export function laterBooks():string[]{const x=store.json<unknown>("bookWantToRead",[]);return Array.isArray(x)?x.filter((s):s is string=>typeof s==="string"):[];}
export const bookDataChanged=()=>window.dispatchEvent(new Event("luna-book-data"));
function guard(key:string,kind:"object"|"array"){const raw=store.get(key);if(raw===null)return;let v:unknown;try{v=JSON.parse(raw);}catch{throw Error("Kitap kaydı hasarlı; önce yedekle: "+key);}if(kind==="array"?!Array.isArray(v):!v||typeof v!=="object"||Array.isArray(v))throw Error("Kitap kaydı beklenmeyen biçimde: "+key);
 if((key==="bookShelves"&&!Object.values(v as object).every(x=>Array.isArray(x)&&x.every(s=>typeof s==="string")))||((key==="bookShelfNames"||key==="bookWantToRead")&&!(v as unknown[]).every(s=>typeof s==="string")))throw Error("Kitap kaydı hasarlı; önce yedekle: "+key);}
export function saveBookDetails(entries:{path:string;details:BookDetails}[]){
 guard("bookDetailsByPath","object");const before=store.get("bookDetailsByPath"),all=objectData<BookDetails>("bookDetailsByPath");
 for(const {path,details:d}of entries){if(!path||!d.title.trim())throw Error("Kitap adı gerekli.");if(d.isbn&&!validIsbn(d.isbn))throw Error("ISBN geçersiz.");if(d.cover&&!publicImage(d.cover)&&!/^(?:[a-z]:[\\/]|\\\\)/i.test(d.cover))throw Error("Geçerli bir kapak adresi/dosyası seç.");all[path]={...d,locked:d.locked!==false,editedAt:Date.now(),title:d.title.trim().slice(0,500),author:d.author.trim().slice(0,500),isbn:validIsbn(d.isbn),description:plainBookText(d.description),subjects:d.subjects.map(s=>s.trim()).filter(Boolean).slice(0,30)};}
 writeDelta(localStorage,[{key:"bookDetailsByPath",before,after:JSON.stringify(all)}]);bookDataChanged();
}
export function organizeBooks(entries:{path:string;shelves:string[];readLater?:boolean}[],remove=false){
 for(const key of["bookShelves","bookShelfNames","bookWantToRead"])guard(key,key==="bookShelves"?"object":"array");
 const map:Record<string,string[]>=Object.assign(Object.create(null),shelfMap()),names=shelfNames(),later=new Set(laterBooks());
 for(const e of entries){const wanted=e.shelves.map(s=>s.trim()).filter(Boolean);if(!e.path||wanted.some(s=>s.length>60))throw Error("Geçersiz kitap/raf.");map[e.path]=remove?(map[e.path]||[]).filter(s=>!wanted.includes(s)):[...new Set([...(map[e.path]||[]),...wanted])];if(!remove)for(const s of wanted)if(!names.includes(s))names.push(s);if(e.readLater===true)later.add(e.path);else if(e.readLater===false)later.delete(e.path);}
 const next:Record<string,unknown>={bookShelves:map,bookShelfNames:names,bookWantToRead:[...later]};writeDelta(localStorage,Object.entries(next).map(([key,value])=>({key,before:store.get(key),after:JSON.stringify(value)})));bookDataChanged();
}
export function createShelf(name:string){const clean=name.trim();if(!clean||clean.length>60)throw Error("Raf adı 1–60 karakter olmalı.");guard("bookShelfNames","array");guard("bookShelves","object");if(!store.set("bookShelfNames",JSON.stringify([...new Set([...shelfNames(),clean])])))throw Error("Raf kaydedilemedi.");bookDataChanged();}
export function renameShelf(from:string,to:string){
 const a=from.trim(),b=to.trim();if(!a||!b)throw Error("Raf adı gerekli.");if(b.length>60)throw Error("Raf adı 1–60 karakter olmalı.");if(a===b)return;
 for(const key of["bookShelves","bookShelfNames"])guard(key,key==="bookShelves"?"object":"array");
 const map=shelfMap(),names=shelfNames();if(!names.includes(a))throw Error("Raf bulunamadı: "+a);if(names.includes(b))throw Error("Bu adda bir raf zaten var: "+b);
 for(const p of Object.keys(map))if(map[p].includes(a))map[p]=map[p].map(s=>s===a?b:s);
 writeDelta(localStorage,[{key:"bookShelves",before:store.get("bookShelves"),after:JSON.stringify(map)},{key:"bookShelfNames",before:store.get("bookShelfNames"),after:JSON.stringify(names.map(n=>n===a?b:n))}]);bookDataChanged();
}
/** Removes a shelf label from every book. Reading progress, finished status, the reading plan, notes and the files stay as they are. */
export function deleteShelf(name:string){
 const a=name.trim();if(!a)throw Error("Raf seçilmedi.");
 for(const key of["bookShelves","bookShelfNames"])guard(key,key==="bookShelves"?"object":"array");
 const map=shelfMap(),names=shelfNames();if(!names.includes(a))throw Error("Raf bulunamadı: "+a);
 for(const p of Object.keys(map)){const rest=map[p].filter(s=>s!==a);if(rest.length)map[p]=rest;else delete map[p];}
 writeDelta(localStorage,[{key:"bookShelves",before:store.get("bookShelves"),after:JSON.stringify(map)},{key:"bookShelfNames",before:store.get("bookShelfNames"),after:JSON.stringify(names.filter(n=>n!==a))}]);bookDataChanged();
}
const json=(url:string)=>invoke<any>("addon_get",{url});
export async function searchBookInfo(book:{title:string;author:string;isbn?:string}):Promise<{candidates:BookCandidate[];warning:string}>{return lookupBookInfo(book,true);}
async function lookupBookInfo(book:{title:string;author:string;isbn?:string},tryIsbn:boolean):Promise<{candidates:BookCandidate[];warning:string}>{
 if(book.isbn?.trim()&&!validIsbn(book.isbn))throw Error("ISBN geçersiz; düzelt veya boş bırak.");
 const isbn=tryIsbn?(validIsbn(book.isbn||"")||validIsbn((book.title.match(/\b97[89](?:[ -]?\d){10}\b/)||[])[0]||"")):"";
 const title=cleanBookQuery(isbn?book.title.replace(/\b97[89](?:[ -]?\d){10}\b/g,raw=>validIsbn(raw)===isbn?"":raw):book.title),author=book.author.trim();if(!isbn&&title.length<2)throw Error("Aramak için kitap adı veya ISBN gir.");
 const params=new URLSearchParams({limit:"6",fields:"key,title,author_name,isbn,first_publish_year,subject,cover_i"});
 if(isbn)params.set("q","isbn:"+isbn);else{params.set("title",title);if(author)params.set("author",author);}
 let candidates:BookCandidate[]=[],warning="";
 try{candidates=olCandidates(await json("https://openlibrary.org/search.json?"+params));}catch{warning="Open Library yanıt vermedi.";}
 if(!candidates.length){const q=isbn?"isbn:"+isbn:`intitle:${title}${author?" inauthor:"+author:""}`;try{candidates=googleCandidates(await json("https://www.googleapis.com/books/v1/volumes?"+new URLSearchParams({q,maxResults:"6",printType:"books"})));}catch{warning+=(warning?" ":"")+"Google Books yanıt vermedi veya kota/anahtar istedi.";}}
 if(!candidates.length&&isbn&&title.length>=2){const fallback=await lookupBookInfo({title,author},false);candidates=fallback.candidates;warning=[warning,fallback.warning].filter(Boolean).join(" ");}
 if(isbn)candidates.sort((a,b)=>Number(b.isbns.includes(isbn))-Number(a.isbns.includes(isbn)));
 return{candidates,warning};
}
export async function candidateDetails(c:BookCandidate):Promise<BookDetails>{let description=c.description;if(!description&&c.work&&/^\/works\/OL\d+W$/.test(c.work)){try{const data=await json("https://openlibrary.org"+c.work+".json");description=plainBookText(typeof data?.description==="string"?data.description:data?.description?.value);}catch{}}
 return{title:c.title,author:c.author,isbn:c.isbn,cover:c.cover,description,subjects:c.subjects,source:c.source,url:c.url,year:c.year};}

/** Reorders only the existing reading plan. Never drops hidden or unavailable books. */
export function movePlannedBook(path:string,direction:-1|1){
 guard("bookWantToRead","array");const before=store.get("bookWantToRead");
 const next=reorderReadingPlan(laterBooks(),path,direction);
 writeDelta(localStorage,[{key:"bookWantToRead",before,after:JSON.stringify(next)}]);bookDataChanged();
}
