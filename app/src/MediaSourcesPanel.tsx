import {useEffect,useRef,useState} from "react";
import {invoke} from "./nativeCore";
import {ExtraModal,extraText as tr} from "./Extras";
import {store,flushSecrets} from "./library";
import {flushDatabaseStorage} from "./databaseStorage";
import {playQueue} from "./Music";
import type {QItem} from "./Music";
type Profile={id:number;name:string;kind:"jellyfin"|"subsonic"|"audiobookshelf";base:string;username:string};
type Item={id:string;title:string;artist:string;album:string;kind:string;duration:number;cover?:string|null;track?:number|null};
const fresh=(id:number):Profile=>({id,name:"",kind:"jellyfin",base:"",username:""});
function profiles():Profile[]{const raw=store.json<unknown>("mediaSources",[]);return Array.isArray(raw)?raw.filter((p):p is Profile=>p&&typeof p==="object"&&Number.isInteger(p.id)&&p.id>=1&&p.id<=8&&[p.name,p.base,p.username].every(s=>typeof s==="string")&&["jellyfin","subsonic","audiobookshelf"].includes(p.kind)).slice(0,8):[];}
export function MediaSourcesPanel({play,close}:{play:(url:string)=>void;close:()=>void}){
  const [saved,setSaved]=useState(profiles),[profile,setProfile]=useState<Profile>(saved[0]??fresh(1)),[secret,setSecret]=useState(()=>store.get("mediaSourceSecret"+(saved[0]?.id??1))??""),[items,setItems]=useState<Item[]>([]),[query,setQuery]=useState(""),[library,setLibrary]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const generation=useRef(0);useEffect(()=>()=>{generation.current++;},[]);
  const save=async()=>{const base=new URL(profile.base);if(!/^https?:$/.test(base.protocol)||base.username||base.password||base.search||base.hash)throw Error(tr("Kimlik bilgisi içermeyen bir HTTP(S) sunucu adresi girin.","Enter an HTTP(S) server URL without embedded credentials."));const next=[...saved.filter(p=>p.id!==profile.id),{...profile,base:base.href,name:profile.name.trim()||profile.kind}];store.set("mediaSourceSecret"+profile.id,secret);await flushSecrets();store.set("mediaSources",JSON.stringify(next));await flushDatabaseStorage();setSaved(next);};
  const browse=async(nextLibrary=library)=>{const run=++generation.current;setBusy(true);setError("");try{await save();const rows=await invoke<Item[]>("source_browse",{profile:profile.id,query,library:nextLibrary});if(run===generation.current){setItems(rows);setLibrary(nextLibrary);}}catch(e){if(run===generation.current)setError(String(e));}finally{if(run===generation.current)setBusy(false);}};
  const queueItem=(item:Item):QItem=>({src:`luna-source://${profile.id}/${encodeURIComponent(item.id)}/${item.track??0}`,server:{profile:profile.id,id:item.id,kind:item.kind,track:item.track??undefined},title:item.title,artist:item.artist,album:item.album,cover:item.cover,duration:item.duration,...(item.kind==="book"?{book:`source:${profile.id}:${item.id}`,chapter:item.track??0}:{})});
  const choose=async(item:Item)=>{
    if(item.kind==="library"){void browse(item.id);return;}const run=++generation.current;setBusy(true);setError("");
    try{
      if(item.kind==="video"){const logical=`luna-source://${profile.id}/${encodeURIComponent(item.id)}`;store.set("srcName:"+logical,item.title);if(run===generation.current){close();play(logical);}}
      else if(item.kind==="book"){const tracks=await invoke<Item[]>("source_tracks",{profile:profile.id,id:item.id});if(run===generation.current){playQueue(tracks.map(queueItem));close();}}
      else{const songs=items.filter(i=>i.kind==="audio");const at=songs.findIndex(i=>i.id===item.id);playQueue(songs.map(queueItem),Math.max(0,at));close();}
    }catch(e){if(run===generation.current)setError(String(e));}finally{if(run===generation.current)setBusy(false);}
  };
  return <ExtraModal title={tr("Medya sunucuları","Media servers")} close={close}><div className="luna-extra everyday-form"><p className="muted">{tr("Jellyfin, OpenSubsonic ve Audiobookshelf içeriklerini Luna'nın oynatıcısında açın. Erişim anahtarları Windows'ta şifreli tutulur.","Play Jellyfin, OpenSubsonic and Audiobookshelf content in Luna. Access credentials are encrypted by Windows.")}</p>
    <select aria-label={tr("Kaynak","Source")} value={profile.id} disabled={busy} onChange={e=>{generation.current++;const id=+e.target.value;setProfile(saved.find(p=>p.id===id)??fresh(id));setSecret(store.get("mediaSourceSecret"+id)??"");setLibrary(null);setItems([]);setError("");}}>{Array.from({length:8},(_,i)=><option key={i} value={i+1}>{saved.find(p=>p.id===i+1)?.name||tr("Kaynak ","Source ")+(i+1)}</option>)}</select>
    <label>{tr("Ad","Name")}<input value={profile.name} onChange={e=>setProfile({...profile,name:e.target.value})}/></label><label>{tr("Sunucu türü","Server type")}<select value={profile.kind} onChange={e=>{setProfile({...profile,kind:e.target.value as Profile["kind"]});setLibrary(null);setItems([]);}}><option value="jellyfin">Jellyfin</option><option value="subsonic">OpenSubsonic</option><option value="audiobookshelf">Audiobookshelf</option></select></label>
    <label>{tr("Sunucu adresi","Server URL")}<input placeholder="https://…" value={profile.base} onChange={e=>setProfile({...profile,base:e.target.value})}/></label>{profile.kind==="subsonic"&&<label>{tr("Kullanıcı adı","Username")}<input value={profile.username} onChange={e=>setProfile({...profile,username:e.target.value})}/></label>}
    <label>{profile.kind==="subsonic"?tr("Parola","Password"):tr("Sunucu erişim anahtarı / token","Server API key / token")}<input type="password" value={secret} onChange={e=>setSecret(e.target.value)} autoComplete="off"/></label><div className="extra-row"><input type="search" aria-label={tr("Sunucuda ara","Search server")} value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")void browse();}}/><button className="primary" disabled={busy||!profile.base||!secret} onClick={()=>void browse()}>{busy?tr("Yükleniyor…","Loading…"):tr("Kaydet ve listele / ara","Save and browse / search")}</button>{library&&<button className="chip" disabled={busy} onClick={()=>void browse(null)}>{tr("Kütüphaneler","Libraries")}</button>}</div>
    {error&&<p className="lp-msg warn" role="alert">{error}</p>}<div className="extra-list">{items.map((item,index)=><button key={item.id+":"+index} className="extra-item" disabled={busy} onClick={()=>void choose(item)}>{item.cover&&<img src={item.cover} alt="" loading="lazy" style={{width:52,height:52,objectFit:"cover"}}/>}<span><b>{item.title}</b><small>{[item.artist,item.album].filter(Boolean).join(" · ")}</small></span></button>)}</div>
  </div></ExtraModal>;
}
