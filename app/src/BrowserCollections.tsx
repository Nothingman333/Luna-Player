import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CItem } from "./Mine";
import { loadCollections, saveCollections, subs } from "./Mine";
import { label, SiteAvatar } from "./BrowserPanels";
import { BrowserIcon } from "./BrowserIcons";
import { webHttpUrl, collectionMediaUrl, collectionSourceUrl } from "./webCollectionModel";
import { collectionSource, groupCollectionItems, mergeCollectionQuotes } from "./webCollectionGroups";
import "./BrowserCollections.css";

export const webSource=collectionSource;
export function webTypeLabel(item:CItem) {
  const names={page:label("Sayfa","Page"),link:label("Bağlantı","Link"),text:label("Alıntı","Quote"),image:label("Resim","Image"),video:label("Video","Video"),audio:label("Ses","Audio")};
  return names[item.webType||"page"];
}
type Removal={id:string;index?:number;fingerprint:string;name:string};
export function BrowserCollections({close,add,open}:{close:()=>void;add?:()=>void;open:(url:string)=>void}) {
  const [collections,setCollections]=useState(loadCollections),[selected,setSelected]=useState<string|null>(null),[query,setQuery]=useState("");
  const [picked,setPicked]=useState<Set<number>>(new Set()),[removal,setRemoval]=useState<Removal|null>(null),[error,setError]=useState("");
  const [viewing,setViewing]=useState<CItem|null>(null);
  const panel=useRef<HTMLDivElement>(null);
  const [position,setPosition]=useState({top:100,right:24});
  useLayoutEffect(()=>{const place=()=>{const rect=document.querySelector("[data-browser-collections]")?.getBoundingClientRect();if(rect)setPosition({top:rect.bottom+10,right:Math.max(12,Math.min(innerWidth-rect.right,innerWidth-462))});};place();window.addEventListener("resize",place);return()=>window.removeEventListener("resize",place);},[]);
  useEffect(()=>{const update=()=>{setCollections(loadCollections());setPicked(new Set());};subs.add(update);return()=>{subs.delete(update);};},[]);
  useEffect(()=>{
    panel.current?.querySelector<HTMLInputElement>("input")?.focus();
    const key=(e:KeyboardEvent)=>{if(e.key==="Escape"){e.preventDefault();e.stopPropagation();close();}};
    const outside=(e:PointerEvent)=>{if(!(e.target as Element).closest(".browser-collections-pop,[data-browser-collections]"))close();};
    document.addEventListener("keydown",key,true);document.addEventListener("pointerdown",outside,true);
    return()=>{document.removeEventListener("keydown",key,true);document.removeEventListener("pointerdown",outside,true);};
  },[close]);
  const current=collections.find(c=>c.id===selected);
  const contains=(value:string)=>value.toLocaleLowerCase().includes(query.toLocaleLowerCase());
  const navigate=(item:CItem)=>{const url=collectionSourceUrl(item);if(url)open(url);};
  function remove(){
    if(!removal)return;
    try{
      const fresh=loadCollections(),c=fresh.find(x=>x.id===removal.id);
      if(!c||JSON.stringify(removal.index===undefined?c:c.items[removal.index])!==removal.fingerprint)throw Error(label("Kayıt değişti; lütfen yeniden seç.","The record changed; please select it again."));
      if(removal.index===undefined){saveCollections(fresh.filter(x=>x.id!==c.id));if(selected===c.id)setSelected(null);}
      else saveCollections(fresh.map(x=>x.id===c.id?{...x,items:x.items.filter((_,i)=>i!==removal.index)}:x));
      setRemoval(null);setError("");
    }catch(e){setError(String(e));}
  }
  function merge(){
    if(!current)return;
    try{
      const fresh=loadCollections(),c=fresh.find(x=>x.id===current.id);
      if(!c||JSON.stringify(c.items)!==JSON.stringify(current.items))throw Error("changed");
      const items=mergeCollectionQuotes(c.items,[...picked]);
      saveCollections(fresh.map(x=>x.id===c.id?{...x,items}:x));setError("");
    }catch{setError(label("Birleştirmek için aynı sayfadan en az iki alıntı seç. Diğer kayıtlar ayrı kalır.","Select at least two quotes from the same page to merge. Other records stay separate."));}
  }
  const groups=current?groupCollectionItems(current.items).map(g=>({...g,items:g.items.filter(({item})=>contains([item.title,item.note,item.from,g.source].join(" ")))})).filter(g=>g.items.length):[];
  return <div ref={panel} style={{...position,maxHeight:`min(620px,calc(100dvh - ${position.top+14}px))`}} className="browser-collections-pop" role="region" aria-label={label("Web koleksiyonları","Web collections")}>
    <header>{current&&<button type="button" className="round" aria-label={viewing?label("Kayıtlara dön","Back to items"):label("Koleksiyonlara dön","Back to collections")} onClick={()=>{if(viewing){setViewing(null);return;}setSelected(null);setQuery("");setPicked(new Set());setRemoval(null);}}><BrowserIcon name="back" size={16}/></button>}<div><b>{current?.name||label("Koleksiyonlar","Collections")}</b><small className="muted">{label("Sayfadan ayrılmadan göz at","Browse without leaving the page")}</small></div><button type="button" className="round" aria-label={label("Kapat","Close")} onClick={close}><BrowserIcon name="close" size={16}/></button></header>
    {viewing ? <CollectionContent item={viewing} open={open}/> : <>
    <input aria-label={label("Koleksiyonlarda ara","Search collections")} placeholder={label("Koleksiyonlarda ara…","Search collections…")} value={query} onChange={e=>setQuery(e.target.value)}/>
    {removal&&<div className="browser-collection-confirm" role="alert"><b>{label("Silinsin mi?","Delete?")}</b><span>{removal.name}</span><small>{removal.index===undefined?label("Koleksiyon ve içindeki kayıtlar kaldırılır. Kaynak dosyalar silinmez.","The collection and its records are removed. Source files are kept."):label("Yalnız bu kayıt koleksiyondan kaldırılır.","Only this record is removed from the collection.")}</small><div><button className="chip" onClick={remove}>{label("Sil","Delete")}</button><button className="chip" onClick={()=>setRemoval(null)}>{label("Vazgeç","Cancel")}</button></div></div>}
    {error&&<p role="alert" className="small">{error}</p>}
    <div className="browser-collections-list">
      {!current ? collections.filter(c=>contains(c.name)).map(c=><div className="browser-collection-folder-row" key={c.id}><button type="button" className="browser-collection-folder" onClick={()=>{setSelected(c.id);setQuery("");setPicked(new Set());setRemoval(null);}}><BrowserIcon name="collection" size={20}/><span><b>{c.name}</b><small className="muted">{c.items.length} {label("öğe","items")}</small></span><BrowserIcon name="forward" size={16}/></button><button className="browser-collection-delete" aria-label={label(c.name+" koleksiyonunu sil","Delete collection "+c.name)} onClick={()=>setRemoval({id:c.id,name:c.name,fingerprint:JSON.stringify(c)})}><BrowserIcon name="trash" size={16}/></button></div>) : groups.map(group=><details className="browser-collection-group" key={group.key} open>
        <summary><BrowserIcon name="globe" size={15}/><b>{group.source||label("Diğer kayıtlar","Other records")}</b><small className="muted">{group.items.length}</small></summary>
        {group.items.map(({item,index})=>{
          const url=webHttpUrl(item.url);
          return <div className="browser-collection-item-row" key={index}>
            {item.webType==="text"&&<input type="checkbox" aria-label={label(item.title+" alıntısını seç","Select quote "+item.title)} checked={picked.has(index)} onChange={e=>setPicked(old=>{const next=new Set(old);e.target.checked?next.add(index):next.delete(index);return next;})}/>}
            <button type="button" className="browser-collection-entry" disabled={!url} onClick={()=>item.kind==="web"&&["text","image","video","audio"].includes(item.webType||"")?setViewing(item):navigate(item)} title={label("Kaydı aç","Open saved item")}>
              <span className="browser-collection-preview"><SiteAvatar url={item.from||url||""}/>{item.cover&&webHttpUrl(item.cover)&&<img className="browser-collection-cover" src={item.cover} alt="" loading="lazy" referrerPolicy="no-referrer" onError={e=>{e.currentTarget.style.display="none";}}/>}</span>
              <span className="browser-collection-copy"><b>{item.title}</b><small className="muted">{item.kind==="web"?webTypeLabel(item):item.kind}</small>{item.note&&<span className="browser-collection-quote">{item.note}</span>}</span><BrowserIcon name="external" size={14}/>
            </button>
            <button className="browser-collection-delete" aria-label={label(item.title+" kaydını sil","Delete record "+item.title)} onClick={()=>setRemoval({id:current.id,index,name:item.title,fingerprint:JSON.stringify(item)})}><BrowserIcon name="trash" size={15}/></button>
          </div>;
        })}
      </details>)}
      {(!current&&!collections.filter(c=>contains(c.name)).length||current&&!groups.length)&&<p className="muted">{label("Henüz gösterilecek öğe yok.","No items to show yet.")}</p>}
    </div>
    <footer>{picked.size>0&&<button type="button" className="chip" disabled={picked.size<2} onClick={merge}>{label("Seçili alıntıları birleştir","Merge selected quotes")} ({picked.size})</button>}{add&&<button type="button" className="chip" onClick={add}><BrowserIcon name="plus" size={15}/>{label("Bu sayfayı koleksiyona ekle","Add this page to a collection")}</button>}</footer></>}
  </div>;
}

/** The saved picture at full window size (like the assistant's full screen); click, Esc or the button closes it. */
function ImageLightbox({src,title,close}:{src:string;title:string;close:()=>void}) {
  const btn=useRef<HTMLButtonElement>(null);
  useEffect(()=>{const back=document.activeElement as HTMLElement|null;btn.current?.focus();const key=(e:KeyboardEvent)=>{if(e.key==="Escape"){e.stopPropagation();close();}};window.addEventListener("keydown",key,true);return()=>{window.removeEventListener("keydown",key,true);back?.focus?.();};},[close]);
  return createPortal(<div className="browser-image-lightbox" role="dialog" aria-modal="true" aria-label={title} onClick={close}>
    <img src={src} alt={title} referrerPolicy="no-referrer" onClick={e=>e.stopPropagation()}/>
    <button ref={btn} className="round browser-image-lightbox-close" aria-label={label("Kapat","Close")} onClick={close}><BrowserIcon name="close" size={16}/></button>
  </div>,document.body);
}
function CollectionContent({item,open}:{item:CItem;open:(url:string)=>void}) {
  const [failed,setFailed]=useState(false),[loaded,setLoaded]=useState(false),[zoom,setZoom]=useState(false);
  const media=collectionMediaUrl(item),source=collectionSourceUrl(item);
  return <section className="browser-collection-content" aria-label={label("Kayıt önizlemesi","Saved item preview")}>
    <small className="muted">{webTypeLabel(item)} · {webSource(item)}</small>
    <h3>{item.title}</h3>
    <div className="browser-collection-content-body">
    {item.webType==="text" ? <blockquote>{item.note||item.title}</blockquote> : item.webType==="image" ? media&&!failed ? <>
      {!loaded&&<p role="status" className="muted">{label("Resim yükleniyor…","Loading image…")}</p>}
      <button className="browser-collection-image" aria-label={label("Resmi büyüt","Enlarge image")} onClick={()=>setZoom(true)}><img src={media} alt={item.title} referrerPolicy="no-referrer" onLoad={()=>setLoaded(true)} onError={()=>setFailed(true)}/></button>
      {zoom&&<ImageLightbox src={media} title={item.title} close={()=>setZoom(false)}/>}
    </> : <p role="status">{media?label("Resim yüklenemedi. Görsel adresini veya kaynak sayfayı açabilirsin.","The image could not load. Open the image address or source page."):label("Bu eski kayıtta görsel adresi yok. Kaynak sayfadan resme sağ tıklayıp yeniden ekleyebilirsin.","This older record has no image address. Right-click the image on its source page to save it again.")}</p> : media ? item.webType==="video" ? <video src={media} controls preload="metadata"/> : <audio src={media} controls preload="metadata"/> : <p>{label("Medya adresi kaydedilmemiş. Kaynak sayfayı açabilirsin.","No media address was saved. Open the source page.")}</p>}
    </div>
    <footer>{source&&<button className="chip" onClick={()=>open(source)}><BrowserIcon name="external" size={15}/>{item.webType==="text"?label("Sayfada bu metne git","Go to this passage"):label("Kaynak sayfaya git","Go to source page")}</button>}{media&&item.webType==="image"&&<button className="chip" onClick={()=>open(media)}>{label("Görsel adresini aç","Open image address")}</button>}</footer>
  </section>;
}
