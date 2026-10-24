import {filenameParse} from "@ctrl/video-filename-parser";
import type {Parsed} from "./library";
export type ReleaseDetails={resolution?:string;source:string[];codec?:string;edition:string[];languages:string[]};
const cache=new Map<string,Parsed>();
/** Luna's title/year/episode exceptions run first; the scene parser supplies release metadata. */
export function hybridName(path:string,legacy:Parsed):Parsed{
  const key=path+"\0"+JSON.stringify(legacy),hit=cache.get(key);if(hit)return hit;
  const file=path.split(/[\\/]/).pop()??path;
  try{
    const input=file.replace(/\b(?:türkçe|turkce|dublaj|altyazılı|altyazili)\b/gi," ");
    const parsed=filenameParse(input,legacy.kind==="tv");
    const protectedTitle=/^\s*\(\d+\)\s*\p{L}|\[REC\]/iu.test(file);
    // A guessed release year never changes a title's identity established by Luna.
    const title=!protectedTitle&&legacy.kind==="movie"&&parsed.title&&parsed.year&&Number(parsed.year)===legacy.year?parsed.title.trim():legacy.title;
    const result={...legacy,title,release:{resolution:parsed.resolution?.toLowerCase(),source:parsed.sources,codec:parsed.videoCodec,edition:Object.entries(parsed.edition).filter(([,on])=>on).map(([name])=>name),languages:parsed.languages}};
    if(cache.size>=10000)cache.delete(cache.keys().next().value!);cache.set(key,result);return result;
  }catch{return legacy;}
}
