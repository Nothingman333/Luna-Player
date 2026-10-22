import {browserRows,mergeReadingEntry,mergePageNote,validPageNote} from "./browserRecords";
import {useEffect,useRef,useState} from "react";
import {exportExtra,extraText,putExtra} from "./Extras";
import {localList,validReading} from "./extrasModel";
import type {WebReading} from "./extrasModel";
import {store} from "./library";
import {WebNotebook} from "./WebNotebook";
import {noteBaseUnchanged} from "./webNotebookModel";

// Unsaved notes live only in this running app, never in browser history or an AI request.
const drafts=new Map<string,{text:string;base:string}>();
function keepDraft(url:string,text:string,base:string){drafts.delete(url);drafts.set(url,{text,base});if(drafts.size>20)drafts.delete(drafts.keys().next().value!);}

export function BrowserExtras({url,title,position,openReading}:{url?:string;title?:string;position:()=>Promise<{url:string;progress:number}>;openReading:(url:string,progress:number)=>void}){
 const [,bump]=useState(0),[msg,setMsg]=useState(""),[notebook,setNotebook]=useState(false);
 const list=localList(localStorage,"lunaWebReading",validReading),notes=localList(localStorage,"lunaWebNotes",validPageNote);
 const note=notes.find(n=>n.url===url)?.text||"";
 const [draft,setDraft]=useState<string|null>(()=>url?drafts.get(url)?.text??null:null);
 const base=useRef(url?drafts.get(url)?.base??note:note);
 const [busy,setBusy]=useState(false),pending=useRef(false),alive=useRef(true);
 useEffect(()=>{alive.current=true;const f=()=>bump(n=>n+1);window.addEventListener("luna-extras",f);return()=>{alive.current=false;window.removeEventListener("luna-extras",f);};},[]);
 useEffect(()=>{setDraft(url?drafts.get(url)?.text??null:null);base.current=url?drafts.get(url)?.base??note:note;setMsg("");},[url]);
 const attempt=async(fn:()=>Promise<void>|void)=>{if(pending.current)return;pending.current=true;setBusy(true);setMsg("");try{await fn();if(alive.current)bump(n=>n+1);}catch(e){if(alive.current)setMsg(String(e));}finally{pending.current=false;if(alive.current)setBusy(false);}};
 const currentReading=()=>browserRows(localStorage,"lunaWebReading",validReading);
 const currentNotes=()=>browserRows(localStorage,"lunaWebNotes",validPageNote);
 const remember=()=>attempt(async()=>{const point=await position();if(!alive.current)return;if(point.url!==url)throw Error(extraText("Sayfa değişti; araçları yeniden aç.","Page changed; reopen tools."));const entry:WebReading={url:point.url,title:title||new URL(point.url).hostname,progress:point.progress,done:false,at:Date.now()};putExtra("lunaWebReading",mergeReadingEntry(currentReading(),entry));setMsg(extraText("Okuma konumu kaydedildi.","Reading position saved."));});
 const saveNote=()=>attempt(async()=>{if(!url||draft===null)return;const point=await position();if(!alive.current)return;if(point.url!==url)throw Error(extraText("Sayfa değişti; araçları yeniden aç.","Page changed; reopen tools."));const latest=currentNotes();if(!noteBaseUnchanged(latest,url,base.current))throw Error(extraText("Not başka bir yerde değişmiş. Taslağın korundu; kopyalayıp taslağı geri alarak güncel notu incele.","This note changed elsewhere. Your draft was kept; copy it and discard the draft to review the current note."));const text=draft.trim();putExtra("lunaWebNotes",mergePageNote(latest,url,text,Date.now()));drafts.delete(url);base.current=text;setDraft(null);setMsg(extraText("Not kaydedildi.","Note saved."));});
 return <div className="luna-extra">
  <button className="chip" onClick={()=>setNotebook(true)}>{extraText("Web defterimi aç","Open my web notebook")} · {list.length} / {notes.length}</button>
  <details open><summary>{extraText("Okuma listem","Reading queue")}</summary><p>{extraText("İlerleme bu bilgisayarda tutulur. Dinamik sayfalarda konum yaklaşık olabilir.","Progress stays on this computer. Position may be approximate on dynamic pages.")}</p><button className="chip" disabled={!url||busy} onClick={remember}>{extraText("Sayfayı ve konumunu kaydet","Save page and position")}</button>
  <div className="extra-list">{list.slice(0,3).map(x=><div className="extra-item" key={x.url}><div><button className="chip" title={x.url} onClick={()=>openReading(x.url,x.progress)}>{x.title.slice(0,70)}</button><small>{Math.round(x.progress*100)}% · {x.done?extraText("Okundu","Read"):extraText("Sırada","Queued")}</small></div><button className="chip" title={extraText("Okundu durumunu değiştir","Toggle read status")} disabled={busy} onClick={()=>attempt(()=>putExtra("lunaWebReading",currentReading().map(y=>y.url===x.url?{...y,done:!y.done}:y)))}>{x.done?"↶":"✓"}</button></div>)}</div>{list.length>3&&<button className="chip" onClick={()=>setNotebook(true)}>{extraText("Bütün kuyruğu göster","Show the full queue")} · {list.length}</button>}</details>
  <hr/><details><summary>{extraText("Bu sayfanın notu","Note for this page")}</summary><textarea aria-label={extraText("Sayfa notu","Page note")} disabled={!url||busy} maxLength={5000} value={draft??note} onChange={e=>{if(!url)return;if(draft===null)base.current=note;setDraft(e.target.value);keepDraft(url,e.target.value,base.current);}} onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&e.key==="Enter"&&!e.nativeEvent.isComposing){e.preventDefault();void saveNote();}}} placeholder={extraText("Yalnız sana ait, yerel bir not…","A private local note…")}/>{draft!==null&&<small className="browser-note-draft">{extraText("Kaydedilmemiş taslak · Bu oturumda korunur · Ctrl+Enter kaydeder","Unsaved draft · Kept for this session · Ctrl+Enter saves")}</small>}
  <div className="extra-row"><button className="chip" disabled={!url||busy||draft===null} onClick={saveNote}>{extraText("Notu kaydet","Save note")}</button><button className="chip" disabled={busy||draft===null} onClick={()=>{if(url)drafts.delete(url);base.current=note;setDraft(null);setMsg("");}}>{extraText("Taslağı geri al","Discard draft")}</button><button className="chip" disabled={busy} onClick={()=>attempt(async()=>{if(await exportExtra("Luna-web-notlari.json",JSON.stringify({notes:currentNotes(),reading:currentReading()},null,2)))setMsg(extraText("Notlar dışa aktarıldı.","Notes exported."));})}>{extraText("Notları dışa aktar","Export notes")}</button></div></details>
  {msg&&<div className="extra-status" role="status">{msg}</div>}{notebook&&<WebNotebook openReading={openReading} close={()=>setNotebook(false)}/>}</div>;
}
export function rememberReadingPosition(url:string,progress:number) {
  let list:WebReading[];try{list=browserRows(localStorage,"lunaWebReading",validReading);}catch{return;}
  if(!list.some(x=>x.url===url)||!Number.isFinite(progress))return;
  const old=list.find(x=>x.url===url)!;
  if(Math.abs(old.progress-progress)<.005)return;
  if(!store.set("lunaWebReading",JSON.stringify(list.map(x=>x.url===url?{...x,progress:Math.max(0,Math.min(1,progress))}:x))))return;
  window.dispatchEvent(new Event("luna-extras"));
}
