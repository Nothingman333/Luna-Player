import {ExtraModal} from "./Extras";
import {CountrySelect} from "./CountrySelect";
import {setWatchCountry,watchCountry} from "./watchCountry";
import {tt} from "./i18n";
export function CountryIntro({onDone}:{onDone:()=>void}){const done=()=>{setWatchCountry(watchCountry());onDone();};return <ExtraModal title={tt("Hangi ülkeden izliyorsun?")} close={done} className="country-intro"><p className="muted">{tt("Film ve dizilerin hangi servislerde izlenebildiğini bulunduğun ülkeye göre gösterelim.")}</p><CountrySelect/><div className="modal-actions"><button className="primary" onClick={done}>{tt("Devam")}</button></div></ExtraModal>;}
