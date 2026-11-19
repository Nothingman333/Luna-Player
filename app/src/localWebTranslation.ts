/** Local Bergamot inference. Only immutable language files go over the network. */
import {invoke,isTauri} from './nativeCore';
export const LOCAL_TRANSLATION_LANGUAGES = {Türkçe:'tr',English:'en',Deutsch:'de',Français:'fr',Español:'es',Italiano:'it',Русский:'ru',Português:'pt'} as const;
export type LocalLanguage = keyof typeof LOCAL_TRANSLATION_LANGUAGES;
type Engine = {translate:(request:{from:string;to:string;text:string;html:boolean})=>Promise<{target:{text:string}}>;delete:()=>void};
type FileInfo = {name:string;size:number;expectedSha256Hash:string};
let engine:Promise<Engine>|undefined;
let status:((text:string)=>void)|undefined;
const pending = new Map<string,Promise<ArrayBuffer>>();
let queue:Promise<unknown>=Promise.resolve();
const BASE = '/translation/';
function report(text:string){status?.(text);}
async function checked(buffer:ArrayBuffer,file:FileInfo){
  if(buffer.byteLength!==file.size)throw new Error('Dil dosyası eksik indirildi. Yeniden dene.');
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)),b=>b.toString(16).padStart(2,'0')).join('');
  if(digest!==file.expectedSha256Hash)throw new Error('Dil dosyasının doğrulaması başarısız.');
  return buffer;
}
async function modelFile(file:FileInfo):Promise<ArrayBuffer>{
  const url=new URL(file.name);
  if(url.protocol!=='https:'||!['bergamot.s3.amazonaws.com','firefox-settings-attachments.cdn.mozilla.net'].includes(url.hostname)||file.size>80_000_000||!file.size||!/^[a-f0-9]{64}$/.test(file.expectedSha256Hash))throw new Error('Desteklenmeyen dil dosyası.');
  const key=file.expectedSha256Hash;
  if(pending.has(key))return pending.get(key)!;
  const job=(async()=>{
    if(isTauri()){
      report('Dil dosyası cihazdan açılıyor…');
      let bytes:ArrayBuffer|number[];
      try{bytes=await invoke<ArrayBuffer|number[]>('browser_translation_model',{hash:key,cachedOnly:true});}
      catch(error){
        if(!String(error).includes('LOCAL_MODEL_MISSING'))throw error;
        report(`Dil dosyası ilk kez indiriliyor · ${(file.size/1048576).toFixed(1)} MB`);
        bytes=await invoke<ArrayBuffer|number[]>('browser_translation_model',{hash:key,cachedOnly:false});
      }
      return checked(bytes instanceof ArrayBuffer?bytes:new Uint8Array(bytes).buffer,file);
    }
    let cache:Cache|undefined;try{cache=await caches.open('luna-local-translation-v1');}catch{}
    const cacheKey=new URL(BASE+'models/'+key,location.origin).href;
    const saved=await cache?.match(cacheKey);
    if(saved){try{const data=await checked(await saved.arrayBuffer(),file);report('Dil dosyası cihazdan açılıyor…');return data;}catch{}}
    report(`Dil dosyası ilk kez indiriliyor · ${(file.size/1048576).toFixed(1)} MB`);
    const response=await fetch(url.href,{credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(180_000)});
    if(!response.ok)throw new Error('Dil dosyası indirilemedi. Bağlantını kontrol edip yeniden dene.');
    const downloaded=await response.arrayBuffer();
    const data=await checked(downloaded,file);
    try{await cache?.put(cacheKey,new Response(data.slice(0)));}catch{report('Çeviri hazır; cihaz önbelleğine kaydedilemedi.');}
    return data;
  })();
  pending.set(key,job);try{return await job;}finally{pending.delete(key);}
}
async function getEngine():Promise<Engine>{
  if(!engine)engine=(async()=>{
    // The module and its WASM/worker are packaged locally, never loaded from a CDN.
    const path=new URL(BASE+'translator.js',location.href).href;
    const {BatchTranslator,TranslatorBacking}=await import(/* @vite-ignore */ path);
    const backing=new TranslatorBacking({registryUrl:BASE+'registry.json',downloadTimeout:180_000});
    backing.loadTranslationModel=async({from,to}:{from:string;to:string})=>{
      const model=(await backing.registry).find((m:{from:string;to:string})=>m.from===from&&m.to===to);
      if(!model)throw new Error('Bu dil çifti için yerel model bulunamadı.');
      const files=model.files as Record<string,FileInfo>;
      const parts:Record<string,ArrayBuffer>={};
      for(const name of ['model','lex','vocab'])parts[name]=await modelFile(files[name]);
      return{model:parts.model,shortlist:parts.lex,vocabs:[parts.vocab],config:{}};
    };
    return new BatchTranslator({workers:1,batchSize:4,cacheSize:500},backing) as Engine;
  })().catch(error=>{engine=undefined;throw error;});
  return engine;
}
export function localLanguageCode(value:string):string{
  const code=(LOCAL_TRANSLATION_LANGUAGES as Record<string,string>)[value]||value.toLowerCase().split(/[-_]/)[0];
  if(!Object.values(LOCAL_TRANSLATION_LANGUAGES).includes(code as never))throw new Error('Bu dil için yerel çeviri henüz desteklenmiyor. Kaynak dili seç.');
  return code;
}
export function localTranslateRows(rows:{id:number;text:string}[],target:string,source='en',progress?:(text:string)=>void,signal?:AbortSignal):Promise<{id:number;text:string}[]>{
  const job=queue.then(()=>runLocalTranslation(rows,target,source,progress,signal));
  queue=job.catch(()=>undefined);
  return job;
}
async function runLocalTranslation(rows:{id:number;text:string}[],target:string,source:string,progress?:((text:string)=>void),signal?:AbortSignal){
  signal?.throwIfAborted();
  const from=localLanguageCode(source),to=localLanguageCode(target);
  if(from===to)return rows.map(row=>({...row}));
  if(rows.length>180||rows.reduce((n,r)=>n+r.text.length,0)>24000)throw new Error('Tek seferde çevrilebilecek metin sınırı aşıldı.');
  status=progress;report(engine?'Metin cihazda çevriliyor…':'Yerel çeviri motoru açılıyor…');
  try{
    const translator=await getEngine(),out=[];
    for(const row of rows){
      signal?.throwIfAborted();
      const response=await translator.translate({from,to,text:row.text,html:false});
      if(!response?.target?.text?.trim())throw new Error('Yerel çeviri boş yanıt döndürdü.');
      out.push({id:row.id,text:response.target.text});
      report(`Cihazda çevriliyor · ${out.length}/${rows.length}`);
    }
    return out;
  }finally{status=undefined;}
}

