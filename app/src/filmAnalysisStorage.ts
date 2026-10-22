import {store} from "./library";
import {filmKey,normalizeText} from "./filmReviewModel";
import type {FilmTarget} from "./filmReviewModel";
import {cleanRun} from "./reviewAnalysis";
import type {AiRun} from "./reviewAnalysis";
const prefix="filmDecision:ai:";
export type SavedFilmAnalysis={key:string;run:AiRun};
export function filmAnalysisRecords():SavedFilmAnalysis[]{
 const out:SavedFilmAnalysis[]=[];
 try{for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(!key?.startsWith(prefix))continue;const run=cleanRun(store.json(key,null));if(run)out.push({key,run});}}catch{}
 return out;
}
/** Prefer exact TMDB identity. Title fallback requires a year and a unique identity,
 * so remakes, movies/TV and two known but different IDs cannot share a review. */
export function savedFilmAnalysis(film:FilmTarget,records?:SavedFilmAnalysis[]):AiRun|null{
 const key=prefix+filmKey(film),exact=records?records.find(x=>x.key===key)?.run:cleanRun(store.json(key,null));if(exact)return exact;
 const year=String(film.year??"").slice(0,4),title=normalizeText(film.title).trim();if(!/^\d{4}$/.test(year)||!title)return null;
 const kind=film.kind==="tv"?"tv":"movie",knownId=Number.isSafeInteger(film.id)&&film.id!>0;
 const hits=(records??filmAnalysisRecords()).filter(x=>x.key.startsWith(prefix+kind+":")&&(!knownId||!x.key.includes(":tmdb:"))&&normalizeText(x.run.title??"").trim()===title&&x.run.year===year);
 const ids=new Set(hits.map(x=>x.key));return ids.size===1?hits[0].run:null;
}
