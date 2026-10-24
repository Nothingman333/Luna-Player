import { invoke } from "./nativeCore";
import { activateStorage } from "./appStorage";
let pending = new Map<string,string|null>();
let timer: ReturnType<typeof setTimeout> | undefined;
let writing: Promise<void> | null = null;
let excluded = new Set<string>();
export function startDatabaseStorage(data: Record<string,string>, secrets: string[]) {
  excluded=new Set(secrets);
  activateStorage(data,(key,value) => {
    if(excluded.has(key)||key==="__seed")return;
    pending.set(key,value);
    clearTimeout(timer);timer=setTimeout(()=>void flushDatabaseStorage().catch(()=>{}),150);
  });
}
/** Retain failed deltas, and always apply an older batch before a newer mutation of the same key. */
export function flushDatabaseStorage(): Promise<void> {
  clearTimeout(timer);
  if(writing)return writing.then(()=>pending.size ? flushDatabaseStorage():undefined);
  if(!pending.size)return Promise.resolve();
  const batch=pending;pending=new Map();
  writing=invoke<void>("database_apply",{changes:Object.fromEntries(batch)}).then(()=> {
    window.dispatchEvent(new Event("luna-storage-saved"));
  }).catch(error=> {
    pending=new Map([...batch,...pending]);
    window.dispatchEvent(new Event("luna-storage-error"));
    timer=setTimeout(()=>void flushDatabaseStorage().catch(()=>{}),2000);
    throw error;
  }).finally(()=>{writing=null;});
  return writing.then(()=>pending.size ? flushDatabaseStorage():undefined);
}
