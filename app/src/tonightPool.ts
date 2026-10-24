import {tmdbGet} from "./library";
import {locale} from "./i18n";
import type {Candidate,Mood} from "./tonightModel";
const cache=new Map<string,{at:number;promise:Promise<Candidate[]>}>();
const genres:Record<Mood,string>={any:"",tense:"53",light:"35",deep:"18",epic:"12",heart:"10749"};
/** Discovery already filters runtime; do not fetch eight credits/overview bundles just to show posters. */
export function outsideTonightPool(minutes:number,mood:Mood,page=1):Promise<Candidate[]>{
 const key=locale()+":"+minutes+":"+mood+":"+page,hit=cache.get(key);if(hit&&Date.now()-hit.at<10*60*1000)return hit.promise;
 const promise=Promise.all([tmdbGet("/discover/movie",{language:locale(),page:String(page),"sort_by":"popularity.desc","vote_count.gte":"100","include_adult":"false",...(minutes?{"with_runtime.lte":String(minutes)}:{}),...(genres[mood]?{with_genres:genres[mood]}:{})}),tmdbGet("/genre/movie/list",{language:locale()})]).then(([data,names])=>{
  const map=new Map<number,string>((names.genres??[]).map((g:{id:number;name:string})=>[g.id,g.name]));
  return (data.results??[]).filter((h:{id?:number;title?:string})=>Number.isSafeInteger(h.id)&&h.id!>0&&typeof h.title==="string").slice(0,20).map((h:{id:number;title:string;release_date?:string;genre_ids?:number[];vote_average?:number;poster_path?:string;backdrop_path?:string},i:number):Candidate=>({key:"external:"+h.id,tmdbId:h.id,year:h.release_date?.slice(0,4),title:h.title,kind:"movie",runtime:0,genres:(h.genre_ids??[]).flatMap(id=>map.has(id)?[map.get(id)!]:[]),rating:h.vote_average??0,poster:h.poster_path??null,backdrop:h.backdrop_path??null,path:"",order:i}));
 }).catch(e=>{cache.delete(key);throw e;});
 cache.set(key,{at:Date.now(),promise});return promise;
}
export function outsideLibrary(rows:Candidate[],known:Set<number>){return rows.filter(c=>!known.has(Number(c.key.slice(9))));}
