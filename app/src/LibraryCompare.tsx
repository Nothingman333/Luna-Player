import {appStorage as localStorage} from "./appStorage";
import { useEffect, useRef, useState } from "react";
import { ExtraModal, extraText as t } from "./Extras";
import { type Item } from "./library";
import { itemFacts } from "./libraryTools";
import { readCompareIds, toggleCompareId } from "./libraryWorkbenchModel";
import { lang } from "./i18n";
import { copyAssistantText } from "./AssistantTools";
import { comparisonArtwork, comparisonSummary, comparisonText } from "./libraryComparisonModel";
import "./LibraryWorkbench.css";
const read=(key:string)=>{try{const raw=localStorage.getItem(key);return {key,raw,ids:readCompareIds(raw===null?[]:JSON.parse(raw)),error:""};}catch{return {key,raw:null,ids:[],error:t("Karşılaştırma kaydı okunamadı; özgün kayıt korundu.","The comparison selection could not be read; the original was kept.")};}};
export function useLibraryCompare(kind:"movie"|"tv"){
 const key="lunaLibraryCompare:"+kind;const [state,setState]=useState(()=>read(key)),[message,setMessage]=useState("");
 const current=state.key===key?state:read(key),latest=useRef(current);latest.current=current;
 const change=(next:string[])=>{try{if(latest.current.error)throw Error(latest.current.error);if(localStorage.getItem(key)!==latest.current.raw)throw Error(t("Karşılaştırma başka bir pencerede değişti; sayfayı yeniden aç.","The comparison changed in another window; reopen this page."));const ids=readCompareIds(next),raw=JSON.stringify(ids);localStorage.setItem(key,raw);setState({key,raw,ids,error:""});setMessage("");}catch(e){setMessage(String(e).replace(/^Error: /,""));}};
 const reset=()=>{if(!confirm(t("Hasarlı karşılaştırma seçimi sıfırlansın mı? Özgün kayıt önce ayrı bir kurtarma kopyasına alınır; filmlerin değişmez.","Reset the damaged comparison selection? The original is kept as a recovery copy first; your films are unchanged.")))return;try{const raw=localStorage.getItem(key);if(raw!==null)localStorage.setItem(key+"@damaged:"+crypto.randomUUID(),raw);localStorage.setItem(key,"[]");setState({key,raw:"[]",ids:[],error:""});setMessage(t("Karşılaştırma seçimi sıfırlandı; özgün kayıt kurtarma kopyasında.","Comparison selection reset; the original is in a recovery copy."));}catch{setMessage(t("Kurtarma kopyası veya sıfırlama yazılamadı; özgün kayıt korundu.","The recovery copy or reset could not be saved; the original was kept."));}};
 return {ids:current.ids,error:current.error||message,damaged:!!current.error,reset,toggle:(id:string)=>{try{change(toggleCompareId(latest.current.ids,id));}catch{setMessage(t("En fazla üç eser karşılaştırabilirsin. Önce birini kaldır.","Compare up to three titles. Remove one first."));}},clear:()=>change([])};
}
type Group={id:string;members:Item[]};
function CompareArtwork({poster}:{poster:string|null|undefined}){
 const [failed,setFailed]=useState(false);useEffect(()=>setFailed(false),[poster]);
 const src=comparisonArtwork(poster);
 return src&&!failed?<img src={src} onError={()=>setFailed(true)} alt="" width={72} height={108}/>:<span className="library-compare-no-cover" aria-hidden="true">▤</span>;
}
export function LibraryComparison({ids,groups,remove,clear,onDetails}:{ids:string[];groups:Group[];remove:(id:string)=>void;clear:()=>void;onDetails:(key:string)=>void}){
 const [open,setOpen]=useState(false),[summaries,setSummaries]=useState(false),[top,setTop]=useState(88),[status,setStatus]=useState(""),[copying,setCopying]=useState(false);
 const active=useRef(true);useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 useEffect(()=>{if(!ids.length)return;const header=document.querySelector('.app-header');if(!header)return;const measure=()=>setTop(header.getBoundingClientRect().height+8);measure();if(typeof ResizeObserver==='undefined')return;const observer=new ResizeObserver(measure);observer.observe(header);return()=>observer.disconnect();},[!!ids.length]);
 useEffect(()=>setStatus(""),[ids.join("|"),summaries]);
 const rows=ids.map(id=>({id,group:groups.find(g=>g.id===id&&g.members.length)}));
 const valid=rows.flatMap(({id,group})=>{if(!group)return[];const rep=group.members.find(x=>itemFacts(x).matched)??group.members[0];return[{id,group,rep,facts:{...itemFacts(rep),files:group.members.reduce((n,m)=>n+(Array.isArray(m.files)?m.files.length:0),0),overview:rep.meta?.overview}}];});
 const summary=comparisonSummary(valid.map(row=>row.facts));
 const copy=async()=>{if(copying)return;setCopying(true);setStatus("");try{await copyAssistantText(comparisonText(valid.map(row=>row.facts),summaries,lang()==="tr"));if(active.current)setStatus(t("Karşılaştırma kopyalandı.","Comparison copied."));}catch(e){if(active.current)setStatus(String(e));}finally{if(active.current)setCopying(false);}};
 if(!ids.length)return null;
 return <><div className="library-compare-tray" style={{top}} role="region" aria-label={t("Karşılaştırma rafı","Comparison shelf")}>
  <div className="library-compare-picks">{rows.map(({id,group})=><button type="button" key={id} className="chip" onClick={()=>remove(id)} title={t("Karşılaştırmadan kaldır","Remove from comparison")}>{group?itemFacts(group.members.find(x=>itemFacts(x).matched)??group.members[0]).title:t("Kütüphanede bulunamayan kayıt","Entry missing from the library")} <span>×</span></button>)}</div>
  <button type="button" className="primary sm" disabled={valid.length<2} onClick={()=>setOpen(true)}>{t("Yan yana bak","Compare side by side")} · {valid.length}/3</button><button type="button" className="chip" onClick={clear}>{t("Seçimi temizle","Clear selection")}</button>
 </div>{open&&<ExtraModal className="library-compare-dialog" title={t("Yan yana karşılaştır","Compare side by side")} close={()=>setOpen(false)}><div className="luna-extra library-compare-modal">
  <p>{t("Kütüphanendeki bilgilere göre karşılaştırma. TMDB puanı topluluk puanıdır; sana uygunluk puanı değildir.","A comparison using your library's metadata. TMDB scores are community ratings, not personal fit scores.")}</p>
  <div className="library-compare-options"><label className="look-check"><input type="checkbox" checked={summaries} onChange={e=>setSummaries(e.target.checked)}/>{t("Konu özetlerini göster","Show plot summaries")}</label><button className="chip" disabled={copying||valid.length<2} onClick={()=>void copy()}>{t("Karşılaştırmayı kopyala","Copy comparison")}</button></div>
  {valid.length<2?<p role="status">{t("Karşılaştırma için raftan en az iki eser seç.","Select at least two titles from the shelf to compare.")}</p>:<div className="library-compare-summary">
   {summary.difference!==null&&<span>{t("Süre farkı","Runtime difference")} <b>{summary.difference} {t("dk","min")}</b><small>{summary.min}–{summary.max} {t("dk","min")}{summary.known<valid.length?" · "+t("Bilinen süreler","Known runtimes"):""}</small></span>}
   <span>{t("Ortak türler","Shared genres")}<b>{summary.sharedGenres.join(" · ")||t("Ortak tür bilgisi yok","No shared genre information")}</b></span>
  </div>}
  {status&&<p role="status" className="extra-status">{status}</p>}
  <div className="library-compare-columns">{valid.map(({id,rep,facts:f})=><article className="library-compare-card" key={id}>
   <div className="library-compare-heading"><CompareArtwork poster={rep.meta?.poster}/><div><h3>{f.title}</h3><span>{f.year||"—"}</span></div></div>
   <dl><div><dt>{t("Süre","Runtime")}</dt><dd>{f.runtime?f.runtime+" "+t("dk","min"):"—"}</dd></div><div><dt>{t("TMDB topluluk puanı","TMDB community score")}</dt><dd>{f.rating?"★ "+new Intl.NumberFormat(lang()==="tr"?"tr":"en",{maximumFractionDigits:1}).format(f.rating):"—"}</dd></div><div><dt>{t("Türler","Genres")}</dt><dd>{f.genres.join(", ")||"—"}</dd></div><div><dt>{t("Kütüphanedeki dosya","Library files")}</dt><dd>{f.files}</dd></div></dl>
   {summaries&&<p>{typeof f.overview==="string"&&f.overview||t("Konu bilgisi yok.","No plot summary available.")}</p>}
   <div className="library-compare-actions"><button type="button" className="chip" onClick={()=>{setOpen(false);onDetails(rep.key);}}>{t("Detayları aç","Open details")}</button><button type="button" className="chip" onClick={()=>remove(id)} aria-label={f.title+" · "+t("Karşılaştırmadan kaldır","Remove from comparison")}>{t("Kaldır","Remove")}</button></div>
  </article>)}</div>
 </div></ExtraModal>}</>;
}
