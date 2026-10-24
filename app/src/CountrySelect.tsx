import {useSyncExternalStore} from "react";
import {lang,tt} from "./i18n";
import {WATCH_COUNTRIES,setWatchCountry,subscribeWatchCountry,watchCountry} from "./watchCountry";
export function useWatchCountry(){return useSyncExternalStore(subscribeWatchCountry,watchCountry);}
export function countryName(code:string){try{return new Intl.DisplayNames([lang()],{type:"region"}).of(code)??code;}catch{return code;}}
export function CountrySelect(){const value=useWatchCountry();const options=WATCH_COUNTRIES.map(code=>({code,name:countryName(code)})).sort((a,b)=>a.name.localeCompare(b.name,lang()));return <label className="country-field"><span>{tt("İzleme ülkesi")}</span><select aria-label={tt("İzleme ülkesi")} value={value} onChange={e=>setWatchCountry(e.target.value)}>{options.map(option=><option key={option.code} value={option.code}>{option.name} ({option.code})</option>)}</select><small>{tt("JustWatch izleme seçenekleri bu ülkeye göre gösterilir. Arayüz dilini değiştirmez.")}</small></label>;}
