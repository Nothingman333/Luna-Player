import {useEffect,useMemo,useRef,useState} from "react";
import {ExtraModal,extraText as tr} from "./Extras";
import {invoke} from "./nativeCore";
import {flushDatabaseStorage} from "./databaseStorage";
import {isFinished,renameVideo,store} from "./library";
import type {Item} from "./library";
import {cleanSmartLists,renamePreview,smartMatches} from "./libraryAutomationModel";
import type {SmartList,SmartRule} from "./libraryAutomationModel";
type Undo={from:string;to:string;done:boolean};
const base=(p:string)=>p.split(/[\\/]/).pop()??p;
export function LibraryAutomation({items,activePath,play,close}:{items:Item[];activePath:string|null;play:(path:string)=>void;close:()=>void}){
  "use memo";
  const [tab,setTab]=useState<"lists"|"rename">("lists"),[lists,setLists]=useState(()=>cleanSmartLists(store.json("smartLists",[])));
  const [draft,setDraft]=useState<SmartList>({id:crypto.randomUUID(),name:"",mode:"all",rules:[{field:"rating",op:"gte",value:"7"}]}),[pattern,setPattern]=useState("{title} ({year}){episode} - {resolution}");
  const [checked,setChecked]=useState<Set<string>>(new Set()),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[undo,setUndo]=useState<Undo[]>(()=>{const raw=store.json<unknown>("bulkRenameUndo",[]);return Array.isArray(raw)?raw.filter((r):r is Undo=>!!r&&typeof r==="object"&&typeof r.from==="string"&&typeof r.to==="string"&&typeof r.done==="boolean").slice(0,1000):[];});
  const stop=useRef(false);useEffect(()=>()=>{stop.current=true;},[]);
  const rows=useMemo(()=>renamePreview(items,pattern,activePath),[items,pattern,activePath]);
  useEffect(()=>setChecked(new Set()),[pattern]);
  const matches=useMemo(()=>items.filter(item=>smartMatches(item,draft,isFinished)),[items,draft]);
  const rule=(at:number,value:Partial<SmartRule>)=>setDraft(d=>({...d,rules:d.rules.map((r,i)=>i===at?{...r,...value}:r)}));
  const saveList=async()=>{
    if(!draft.name.trim()||!draft.rules.length)return;
    try{const next=cleanSmartLists([...lists.filter(x=>x.id!==draft.id),{...draft,name:draft.name.trim()}]);store.set("smartLists",JSON.stringify(next));await flushDatabaseStorage();setLists(next);setMessage(tr("Liste kaydedildi; kütüphane değiştikçe sonuçlar yenilenir.","List saved; results follow library changes."));}catch(e){setMessage(String(e));}
  };
  const journal=async(records:Undo[])=>{store.set("bulkRenameUndo",JSON.stringify(records));await flushDatabaseStorage();setUndo([...records]);};
  const apply=async()=>{
    const selected=rows.filter(row=>checked.has(row.from)&&!row.error&&row.from!==row.to);
    if(!selected.length||busy)return;
    if(undo.length){setMessage(tr("Önce önceki işlemi geri alın veya geri alma kaydını kapatın.","Undo the previous operation or dismiss its undo record first."));return;}
    setBusy(true);setMessage("");stop.current=false;
    const records:Undo[]=[];
    try{
      const exists=await invoke<boolean[]>("paths_exist",{paths:selected.map(row=>row.to)});
      if(exists.some((yes,i)=>yes&&selected[i].to.toLowerCase()!==selected[i].from.toLowerCase()))throw Error(tr("Bir hedef zaten var. Önizlemeyi yenileyin.","A destination already exists. Refresh the preview."));
      for(const row of selected){
        if(stop.current)break;
        // A crash between native rename and renderer acknowledgement still leaves an undo intent.
        records.push({from:row.from,to:row.to,done:false});await journal(records);
        const to=await renameVideo(row.from,row.name);records[records.length-1]={from:row.from,to,done:true};await journal(records);
        setMessage(tr("{0} dosya yeniden adlandırıldı.","Renamed {0} files.").replace("{0}",String(records.filter(r=>r.done).length)));
      }
      setChecked(new Set());
    }catch(e){setMessage(String(e));}finally{setBusy(false);}
  };
  const reverse=async()=>{
    if(busy)return;setBusy(true);setMessage("");const remaining=[...undo];stop.current=false;
    try{for(let i=remaining.length-1;i>=0;i--){
      if(stop.current)break;const row=remaining[i];
      const [oldExists,newExists]=await invoke<boolean[]>("paths_exist",{paths:[row.from,row.to]});
      const caseOnly=row.from.toLowerCase()===row.to.toLowerCase();
      if(oldExists&&!newExists&&!caseOnly){remaining.splice(i,1);await journal(remaining);continue;}
      if(!newExists||oldExists&&!caseOnly)throw Error(tr("Dosyalar değişmiş; geri alma durduruldu: ","Files changed; undo stopped: ")+base(row.to));
      await renameVideo(row.to,base(row.from));remaining.splice(i,1);await journal(remaining);
    }setMessage(tr("Geri alma tamamlandı.","Undo completed."));}catch(e){setMessage(String(e));}finally{setBusy(false);}
  };
  return <ExtraModal title={tr("Kütüphane araçları","Library tools")} close={()=>{if(!busy)close();}}><div className="luna-extra everyday-form">
    <div className="extra-row"><button className={"chip"+(tab==="lists"?" on":"")} onClick={()=>setTab("lists")}>{tr("Akıllı listeler","Smart lists")}</button><button className={"chip"+(tab==="rename"?" on":"")} onClick={()=>setTab("rename")}>{tr("Toplu adlandırma","Bulk rename")}</button></div>
    {tab==="lists"?<>
      <select aria-label={tr("Kayıtlı liste","Saved list")} value={lists.some(l=>l.id===draft.id)?draft.id:""} onChange={e=>{const list=lists.find(l=>l.id===e.target.value);setDraft(list?structuredClone(list):{id:crypto.randomUUID(),name:"",mode:"all",rules:[{field:"rating",op:"gte",value:"7"}]});}}><option value="">{tr("Yeni liste","New list")}</option>{lists.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select>
      <input aria-label={tr("Liste adı","List name")} placeholder={tr("Liste adı","List name")} value={draft.name} maxLength={120} onChange={e=>setDraft({...draft,name:e.target.value})}/>
      <select aria-label={tr("Kural birleştirme","Combine rules")} value={draft.mode} onChange={e=>setDraft({...draft,mode:e.target.value as SmartList["mode"]})}><option value="all">{tr("Tüm kurallar (VE)","All rules (AND)")}</option><option value="any">{tr("Herhangi biri (VEYA)","Any rule (OR)")}</option></select>
      {draft.rules.map((r,i)=><div className="extra-row" key={i}><select aria-label="Field" value={r.field} onChange={e=>rule(i,{field:e.target.value as SmartRule["field"]})}>{["title","year","rating","genre","kind","runtime","watched"].map(x=><option key={x} value={x}>{({title:tr("Başlık","Title"),year:tr("Yıl","Year"),rating:tr("Puan","Rating"),genre:tr("Tür","Genre"),kind:tr("Medya türü","Media kind"),runtime:tr("Süre","Runtime"),watched:tr("İzlendi","Watched"),contains:tr("İçerir","Contains"),equals:tr("Eşittir","Equals"),gte:tr("En az","At least"),lte:tr("En çok","At most")} as Record<string,string>)[x]}</option>)}</select><select aria-label="Operator" value={r.op} onChange={e=>rule(i,{op:e.target.value as SmartRule["op"]})}>{["contains","equals","gte","lte"].map(x=><option key={x}>{x}</option>)}</select><input aria-label="Value" value={r.value} maxLength={200} onChange={e=>rule(i,{value:e.target.value})}/><button className="chip" onClick={()=>setDraft(d=>({...d,rules:d.rules.filter((_,n)=>n!==i)}))}>×</button></div>)}
      <div className="extra-row"><button className="chip" disabled={draft.rules.length>=20} onClick={()=>setDraft({...draft,rules:[...draft.rules,{field:"genre",op:"contains",value:""}]})}>{tr("Kural ekle","Add rule")}</button><button className="primary" onClick={()=>void saveList()}>{tr("Listeyi kaydet","Save list")}</button>{lists.some(l=>l.id===draft.id)&&<button className="chip" onClick={async()=>{try{const next=lists.filter(l=>l.id!==draft.id);store.set("smartLists",JSON.stringify(next));await flushDatabaseStorage();setLists(next);}catch(e){setMessage(String(e));}}}>{tr("Listeyi sil","Delete list")}</button>}</div>
      <p className="muted">{matches.length} {tr("eşleşme · kind: movie/tv, watched: true/false, runtime: dakika","matches · kind: movie/tv, watched: true/false, runtime: minutes")}</p>
      <div className="extra-list">{matches.slice(0,100).map(item=><button className="extra-item" key={item.key} onClick={()=>{if(item.files[0]){close();play(item.files[0].path);}}}>{item.meta?.title??item.parsed.title} · {item.meta?.year??item.parsed.year}</button>)}</div>
    </>:<>
      <p className="muted">{tr("Aynı klasörde yeniden adlandırır; altyazı ve .nfo dosyalarını birlikte taşır. Oynayan dosya değiştirilemez. Önizlemeden seçtiklerin uygulanır.","Renames within the same folder, including subtitles and .nfo sidecars. The playing file is excluded. Only selected preview rows are applied.")}</p>
      <input aria-label={tr("Adlandırma şablonu","Rename template")} value={pattern} disabled={busy} maxLength={240} onChange={e=>setPattern(e.target.value)}/><small>{"{title} · {year} · {episode} · {resolution}"}</small>
      <div className="extra-row"><button className="chip" disabled={busy} onClick={()=>setChecked(new Set(rows.slice(0,1000).filter(r=>!r.error&&r.from!==r.to).map(r=>r.from)))}>{tr("Uygun olanları seç","Select eligible")}</button><button className="primary" disabled={busy||!checked.size} onClick={()=>void apply()}>{tr("Seçilenleri yeniden adlandır","Rename selected")}</button>{busy&&<button className="chip" onClick={()=>{stop.current=true;}}>{tr("Bu dosyadan sonra dur","Stop after this file")}</button>}</div>
      {!!undo.length&&<div className="extra-row"><button className="chip" disabled={busy} onClick={()=>void reverse()}>{tr("Son işlemi geri al","Undo last operation")} ({undo.length})</button><button className="chip" disabled={busy} onClick={()=>void journal([]).catch(e=>setMessage(String(e)))}>{tr("Geri alma kaydını kapat","Dismiss undo record")}</button></div>}
      <div className="extra-list">{rows.slice(0,1000).map(row=><label className="extra-item" key={row.from}><input type="checkbox" disabled={busy||!!row.error||row.from===row.to} checked={checked.has(row.from)} onChange={e=>setChecked(old=>{const next=new Set(old);if(e.target.checked)next.add(row.from);else next.delete(row.from);return next;})}/><span><small>{base(row.from)}</small><b>→ {base(row.to)}</b>{row.error&&<small>{({"Invalid template":tr("Geçersiz şablon","Invalid template"),"Reserved Windows filename":tr("Windows için ayrılmış ad","Reserved Windows filename"),"Currently playing":tr("Şu anda oynatılıyor","Currently playing"),"Duplicate destination":tr("Çakışan hedef adı","Duplicate destination")} as Record<string,string>)[row.error]??row.error}</small>}</span></label>)}</div>
    </>}{message&&<p role="status" className="lp-msg">{message}</p>}
  </div></ExtraModal>;
}
