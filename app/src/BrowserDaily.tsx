import {useState} from "react";
import {ExtraModal,extraText as tr} from "./Extras";
import {isFinished,store} from "./library";
import type {Item} from "./library";
import type {RecoveryTab,SitePreference} from "./everydayModel";
import {pageLibraryMatches} from "./everydayModel";

export function SitePreferencesPanel({origin,value,zoom,save,resetZoom,close}:{origin:string;value:SitePreference;zoom:number;save:(v:SitePreference)=>void;resetZoom:()=>void;close:()=>void}){
 const [draft,setDraft]=useState(value);
 return <ExtraModal title={tr("Bu sitenin tercihleri","Site preferences")} close={close}><div className="luna-extra everyday-form"><p className="everyday-path">{origin}</p><label className="extra-check"><input type="checkbox" checked={draft.muted} onChange={e=>setDraft({...draft,muted:e.target.checked})}/>{tr("Bu siteyi sessiz aç","Mute this site by default")}</label><label>{tr("Açılır pencereler","Pop-ups")}<select value={draft.popups} onChange={e=>setDraft({...draft,popups:e.target.value as SitePreference["popups"]})}><option value="ask">{tr("Önce bana sor","Ask first")}</option><option value="block">{tr("Engelle","Block")}</option><option value="tab">{tr("Luna sekmesinde aç (en fazla 8 sekme)","Open in a Luna tab (up to 8 tabs)")}</option></select></label><div className="extra-row"><span>{tr("Hatırlanan yakınlaştırma","Remembered zoom")}: {Math.round(zoom*100)}%</span><button className="chip" onClick={resetZoom}>{tr("Yakınlaştırmayı sıfırla","Reset zoom")}</button></div><p className="muted">{tr("Tercihler yalnız bu adresin protokolü ve alan adı için saklanır. Kamera, mikrofon ve konum izinleri verilmez.","Preferences apply to this origin only. Camera, microphone and location access are not granted.")}</p><button className="primary" onClick={()=>save(draft)}>{tr("Kaydet","Save")}</button></div></ExtraModal>;
}
export function RecoveryPanel({tabs,busy,restore,close}:{tabs:RecoveryTab[];busy:boolean;restore:(rows:RecoveryTab[])=>Promise<void>;close:()=>void}){
 const [chosen,setChosen]=useState(()=>new Set(tabs.map(t=>t.url)));
 return <ExtraModal title={tr("Önceki oturumu kurtar","Recover previous session")} close={close}><div className="luna-extra"><p>{tr("Önceki Web oturumu temiz kapanmamış olabilir. Açılacak sekmeleri seç; sayfalar sırayla başlatılır.","The previous Web session may not have closed cleanly. Choose tabs to restore; pages start one at a time.")}</p><div className="extra-list">{tabs.map(t=><label className="extra-item" key={t.url}><input type="checkbox" checked={chosen.has(t.url)} disabled={busy} onChange={e=>setChosen(old=>{const next=new Set(old);if(e.target.checked)next.add(t.url);else next.delete(t.url);return next;})}/><span><b>{t.pinned?"⌖ ":""}{t.title}</b><small className="everyday-path">{t.url}</small></span></label>)}</div><div className="extra-row"><button className="primary" disabled={busy||!chosen.size} onClick={()=>void restore(tabs.filter(t=>chosen.has(t.url)))}>{busy?tr("Geri getiriliyor…","Restoring…"):tr("Seçilenleri aç","Open selected")}</button><button className="chip" onClick={close}>{busy?tr("Sırayı durdur","Stop queue"):tr("Şimdi değil","Not now")}</button></div></div></ExtraModal>;
}
export function PageLibrarySignal({url,title,items,open}:{url:string;title:string;items:Item[];open?:(key:string)=>void}){
 const match=pageLibraryMatches(url,title,items),matches=items.filter(i=>match.keys.includes(i.key));
 if(!matches.length)return null;
 const groups=new Map(matches.map(i=>[i.meta?.id?`${i.meta.kind}:${i.meta.id}`:i.key,i])),rows=[...groups.values()];
 const later=store.json<string[]>("laterList",[]);
 return <div className="browser-library-signal"><span>{match.exact?tr("Kütüphanende var","In your library"):tr("Kütüphanendeki olası eşleşme","Possible library match")}</span>{rows.slice(0,3).map(item=><button className="chip" key={item.key} onClick={()=>open?.(item.key)}>{item.meta?.title||item.parsed.title} · {item.meta?.year||item.parsed.year}{matches.some(i=>(i.key===item.key||!!item.meta?.id&&i.meta?.id===item.meta.id)&&i.files.some(f=>isFinished(f.path)))?" · ✓ "+tr("İzlendi","Watched"):later.some(t=>[item.meta?.title||item.parsed.title,`${item.meta?.title||item.parsed.title} (${item.meta?.year||item.parsed.year})`].some(title=>t.toLocaleLowerCase()===title.toLocaleLowerCase()))?" · "+tr("İzlenecek","Watch later"):""}</button>)}</div>;
}
