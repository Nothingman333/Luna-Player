import { useState } from "react";
import { invoke } from "./nativeCore";
import { open } from "@tauri-apps/plugin-dialog";
import { readCollections } from "./collectionStorage";
import { store } from "./library";
import { exportExtra, extraText } from "./Extras";
export function CollectionRecovery({ changed }: { changed: () => void }) {
  const raw=store.get("collections"), parsed=readCollections(raw);
  const [busy,setBusy]=useState(false), [msg,setMsg]=useState("");
  if(!parsed.damaged) return null;
  const run=async(fn:()=>Promise<void>)=>{setBusy(true);setMsg("");try{await fn();}catch(e){setMsg(String(e));}finally{setBusy(false);}};
  const backup=()=>exportExtra("Luna-koleksiyon-hasarli-kayit.json",JSON.stringify({luna:"collection-recovery",at:new Date().toISOString(),raw},null,2));
  const write=(next:string)=>{if(store.get("collections")!==raw)throw Error(extraText("Kayıt değişti. Ekranı yeniden aç.","Data changed. Reopen this screen."));if(!store.set("collections",next))throw Error(extraText("Kaydedilemedi.","Could not save."));changed();};
  return <section className="luna-extra" role="alert"><h3>{extraText("Koleksiyon kaydında hasar bulundu", "Damaged collection data detected")}</h3><p className="extra-warning">{extraText(`Özgün kayıt korunuyor. ${parsed.collections.length} koleksiyon okunabildi. Kurtarma yapana kadar koleksiyonlara yazma engellendi.`, `The original record is preserved. ${parsed.collections.length} collections are readable. Writes are blocked until recovery.`)}</p><div className="extra-row"><button className="chip" disabled={busy} onClick={()=>void run(async()=>{await backup();})}>{extraText("Ham kaydı dışa aktar", "Export original record")}</button><button className="chip" disabled={busy||!parsed.collections.length} onClick={()=>void run(async()=>{if(!await backup())return;if(confirm(extraText("Okunabilen koleksiyonlar kurtarılsın mı? Hasarlı parçalar dışa aktardığın ham kayıtta kalır.","Recover readable collections? Damaged parts remain in the exported original.")))write(JSON.stringify(parsed.collections));})}>{extraText("Okunabilenleri kurtar", "Recover readable collections")}</button><button className="chip" disabled={busy} onClick={()=>void run(async()=>{
    const path=await open({multiple:false,filters:[{name:"JSON",extensions:["json"]}]});if(typeof path!=="string")return;
    const content=JSON.parse(await invoke<string>("backup_read",{path}));
    const value=Array.isArray(content)?content:content?.data?.collections??content?.collections;
    const text=typeof value==="string"?value:JSON.stringify(value);if(typeof text!=="string")throw Error("No collections in this backup");
    const checked=readCollections(text);if(checked.damaged||!Array.isArray(JSON.parse(text)))throw Error(extraText("Yedekteki koleksiyonlar geçersiz.","Invalid collections in backup."));
    if(!confirm(extraText(`${checked.collections.length} koleksiyon bu kaydın yerini alacak. Devam edilsin mi?`, `${checked.collections.length} collections will replace this record. Continue?`)))return;
    if(!await backup())return;write(JSON.stringify(checked.collections));
  })}>{extraText("Yedekten koleksiyonları yükle", "Restore collections from backup")}</button></div>{msg&&<p role="status">{msg}</p>}</section>;
}
