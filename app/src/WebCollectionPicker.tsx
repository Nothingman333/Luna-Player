import { useState } from "react";
import { ExtraModal } from "./Extras";
import { addToCollection, loadCollections } from "./Mine";
import type { CItem } from "./Mine";
import { label, SiteAvatar } from "./BrowserPanels";
export function WebCollectionPicker({item,close,saved}:{item:CItem;close:()=>void;saved:(message:string)=>void}) {
  const [query,setQuery]=useState(""),[name,setName]=useState(""),[error,setError]=useState("");
  const collections=loadCollections().filter(c=>c.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const add=(name:string)=>{try {const n=addToCollection(name,[item]);saved(n?label("Koleksiyona eklendi.","Added to collection."):label("Bu öğe koleksiyonda zaten var.","This item is already in the collection."));close();}catch(e){setError(String(e));}};
  return <ExtraModal title={label("Koleksiyona ekle","Add to collection")} close={close}>
    <div style={{display:"grid",gap:16,minWidth:0}}>
      <div style={{display:"flex",alignItems:"center",gap:12,minWidth:0}}><SiteAvatar url={item.from||item.url!}/><div style={{minWidth:0}}><b style={{overflowWrap:"anywhere"}}>{item.title}</b><div className="muted small" style={{overflowWrap:"anywhere"}}>{item.url}</div></div></div>
      {item.note&&<p className="muted small" style={{whiteSpace:"pre-wrap",maxHeight:100,overflow:"auto"}}>{item.note}</p>}
      <input aria-label={label("Koleksiyonlarda ara","Search collections")} placeholder={label("Koleksiyonlarda ara…","Search collections…")} value={query} onChange={e=>setQuery(e.target.value)}/>
      <div style={{display:"grid",gap:8,maxHeight:"30vh",overflowY:"auto"}}>{collections.map(c=><button key={c.id} className="chip" style={{display:"flex",gap:12,textAlign:"left",justifyContent:"space-between",whiteSpace:"normal",overflowWrap:"anywhere"}} onClick={()=>add(c.name)}>{c.name}<span className="muted small">{c.items.length}</span></button>)}{!collections.length&&<p className="muted">{label("Eşleşen koleksiyon yok. Yeni bir tane oluşturabilirsin.","No matching collections. You can create one below.")}</p>}</div>
      <form onSubmit={e=>{e.preventDefault();if(name.trim())add(name.trim());}} style={{display:"flex",gap:8,flexWrap:"wrap"}}><input style={{flex:"1 1 180px",minWidth:0}} aria-label={label("Yeni koleksiyon adı","New collection name")} placeholder={label("Yeni koleksiyon adı","New collection name")} value={name} onChange={e=>setName(e.target.value)} maxLength={120}/><button className="primary sm" disabled={!name.trim()}>{label("Oluştur ve ekle","Create and add")}</button></form>
      {error&&<p role="alert">{error}</p>}
    </div>
  </ExtraModal>;
}
