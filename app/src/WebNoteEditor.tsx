import {appStorage as localStorage} from "./appStorage";
import { useEffect, useRef, useState } from "react";
import { extraText as t, putExtra } from "./Extras";
import { browserRows, mergePageNote, validPageNote } from "./browserRecords";
import { noteBaseUnchanged } from "./webNotebookModel";
import { copyAssistantText } from "./AssistantTools";
const drafts=new Map<string,{text:string;base:string}>();
function keep(url:string,text:string,base:string){drafts.set(url,{text,base});}
export function WebNoteEditor({url,text,disabled,onStatus}:{url:string;text:string;disabled:boolean;onStatus:(message:string)=>void}){
 const [draft,setDraft]=useState(()=>drafts.get(url)?.text??text),[editing,setEditing]=useState(()=>drafts.has(url)),[status,setStatus]=useState(""),[busy,setBusy]=useState(false);
 const base=useRef(drafts.get(url)?.base??text),alive=useRef(true),editButton=useRef<HTMLButtonElement>(null);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const report=(message:string)=>{if(alive.current)setStatus(message);onStatus(message);};
 const focusEdit=()=>requestAnimationFrame(()=>editButton.current?.focus({preventScroll:true}));
 const cancel=()=>{if(draft!==base.current&&!confirm(t("Kaydedilmemiş not taslağı silinsin mi?","Discard the unsaved note draft?")))return;drafts.delete(url);setEditing(false);setStatus("");focusEdit();};
 const save=()=>{try{
   const latest=browserRows(localStorage,"lunaWebNotes",validPageNote);
   if(!noteBaseUnchanged(latest,url,base.current))throw Error(t("Bu not başka bir yerde değişti. Taslağın korundu; önce kopyalayıp güncel notu incele.","This note changed elsewhere. Your draft was kept; copy it before reviewing the current note."));
   const next=draft.trim();if(!next&&base.current&&!confirm(t("Bu sayfanın kayıtlı notu silinsin mi?","Delete this page's saved note?")))return;
   putExtra("lunaWebNotes",mergePageNote(latest,url,next,Date.now()));drafts.delete(url);base.current=next;setEditing(false);report(t("Sayfa notu kaydedildi.","Page note saved."));focusEdit();
 }catch(e){report(String(e).replace(/^Error: /,""));}};
 const copy=async()=>{setBusy(true);try{await copyAssistantText(editing?draft:text);report(t("Not kopyalandı.","Note copied."));}catch(e){report(String(e));}finally{if(alive.current)setBusy(false);}};
 return <div className="web-note-editor">
 {!editing&&text&&<p className="web-notebook-full-note">{text}</p>}
 {editing&&<><label className="web-note-label">{t("Sayfa notu","Page note")}<textarea autoFocus maxLength={5000} value={draft} onChange={e=>{const value=e.target.value;setDraft(value);keep(url,value,base.current);}} onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&e.key==="Enter"&&!e.nativeEvent.isComposing){e.preventDefault();save();}if(e.key==="Escape"){e.stopPropagation();e.preventDefault();cancel();}}}/></label><small>{t("Kaydedilmemiş taslak · Bu oturumda korunur · Ctrl+Enter kaydeder","Unsaved draft · Kept in this session · Ctrl+Enter saves")}</small></>}
 <div className="extra-row">{editing?<><button type="button" className="chip" disabled={disabled} onClick={save}>{t("Notu kaydet","Save note")}</button><button type="button" className="chip" onClick={cancel}>{t("Vazgeç","Cancel")}</button></>:<button ref={editButton} type="button" className="chip" disabled={disabled} onClick={()=>{if(!drafts.has(url)&&drafts.size>=20){report(t("20 notta açık taslak var. Önce birini kaydet veya vazgeç; eski taslakların korundu.","You have drafts for 20 notes. Save or discard one first; your existing drafts were kept."));return;}base.current=text;setDraft(text);keep(url,text,text);setEditing(true);setStatus("");}}>{text?t("Notu düzenle","Edit note"):t("Not ekle","Add note")}</button>}<button type="button" className="chip" disabled={busy||!(editing?draft:text).trim()} onClick={()=>void copy()}>{editing?t("Taslağı kopyala","Copy draft"):t("Notu kopyala","Copy note")}</button></div>{status&&<p role="status" className="web-note-status">{status}</p>}
 </div>;
}
