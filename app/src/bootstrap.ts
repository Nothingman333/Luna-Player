import { appStorage as localStorage } from "./appStorage";
import {startDatabaseStorage} from "./databaseStorage";
import {invoke} from "./nativeCore";
import {durableState} from "./safety";
import {SECRET_KEYS} from "./secretKeys";
import {startupPhase} from "./startupStatus";
export async function bootstrapStorage() {
  if(new URLSearchParams(location.search).has("subs"))return;
  startupPhase("database_open · Kütüphane veritabanı / Library database");
  const legacy: Record<string,string> = Object.create(null);
  for (let i=0;i<localStorage.length;i++) { const key=localStorage.key(i);if(key)legacy[key]=localStorage.getItem(key)??""; }
  const raw=await invoke<string|null>("state_load");
  const saved=raw ? durableState(JSON.parse(raw)) : {};
  const seed: Record<string,string> = Object.create(null);
  const force=saved.__seed === "force", fill=saved.__seed === "1";
  const empty=!legacy.lunaMark;
  for(const [key,value] of Object.entries(saved)) {
    if(key==="__seed"||SECRET_KEYS.includes(key))continue;
    if(empty||force||(fill&&legacy[key]==null))legacy[key]=value;
    if(fill||force)seed[key]=value;
  }
  const clean=Object.fromEntries(Object.entries(legacy).filter(([key])=>!SECRET_KEYS.includes(key)&&key!=="__seed"));
  const data=await invoke<Record<string,string>>("database_open",{legacy:clean,seed,force});
  // Legacy credentials stay in memory just long enough for loadSecrets to move them to Windows.
  for(const key of SECRET_KEYS)if(legacy[key])data[key]=legacy[key];
  startDatabaseStorage(data,SECRET_KEYS);
}
