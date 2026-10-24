import { foldText } from "./libraryTools";
import { safeHttpUrl } from "./assistantPresentation";
export type ComparisonFacts={title:string;year:number;runtime:number;rating:number;genres:string[];files:number;overview?:string};
export function comparisonSummary(rows:Pick<ComparisonFacts,"runtime"|"genres">[]){
 const known=rows.map(r=>r.runtime).filter(n=>Number.isFinite(n)&&n>0),min=known.length?Math.min(...known):0,max=known.length?Math.max(...known):0;
 const first=new Map<string,string>();for(const name of rows[0]?.genres??[]){const key=foldText(name.trim());if(key&&!first.has(key))first.set(key,name.trim());}
 const sharedGenres=rows.length<2?[]:[...first].filter(([key])=>rows.slice(1).every(r=>r.genres.some(g=>foldText(g.trim())===key))).map(([,name])=>name);
 return {min,max,difference:known.length>=2?max-min:null,known:known.length,sharedGenres};
}
export function comparisonArtwork(poster:unknown):string|null{
 if(typeof poster!=="string"||!poster)return null;
 return poster.startsWith("/")&&!poster.startsWith("//")?safeHttpUrl("https://image.tmdb.org/t/p/w185"+poster):safeHttpUrl(poster);
}
/** A local clipboard summary. Plot text is included only through the user's explicit option. */
export function comparisonText(rows:ComparisonFacts[],includePlots:boolean,tr:boolean):string{
 const one=(s:unknown)=>typeof s==="string"?s.replace(/[\r\n]+/g," ").trim():"";
 return [tr?"Luna · Film karşılaştırması":"Luna · Film comparison",tr?"TMDB: topluluk puanı; kişisel uygunluk puanı değil.":"TMDB: community score, not personal fit.",...rows.map(r=>[
  `${one(r.title)}${r.year?` (${r.year})`:""}`,
  `${tr?"Süre":"Runtime"}: ${r.runtime?r.runtime+ (tr?" dk":" min"):"—"}`,
  `TMDB: ${r.rating||"—"}`,
  `${tr?"Türler":"Genres"}: ${r.genres.map(one).join(", ")||"—"}`,
  `${tr?"Dosya":"Files"}: ${r.files}`,
  ...(includePlots?[`${tr?"Konu":"Plot"}: ${one(r.overview||"")||"—"}`]:[]),
 ].join("\n"))].join("\n\n");
}
