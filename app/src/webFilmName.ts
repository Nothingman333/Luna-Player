export function webFilmYear(raw:unknown,explicit?:unknown):number|undefined{const max=new Date().getFullYear()+2;const valid=(n:unknown)=>typeof n==='number'&&Number.isInteger(n)&&n>=1870&&n<=max;return valid(explicit)?explicit as number:typeof raw==='string'?[...raw.matchAll(/(?:^|[^\d])(18\d{2}|19\d{2}|20\d{2})(?!\d)/g)].map(m=>Number(m[1])).find(valid):undefined;}
/** Remove viewing/site suffixes without changing meaningful film words. */
export function webFilmName(raw:unknown):string|null{if(typeof raw!=='string')return null;let title=raw.slice(0,500).replace(/\s*[|–—]\s*.*$/,'').replace(/\s+-\s+.*$/,'').replace(/\b(?:full\s*hd|4k|1080p|720p)\b/gi,'').replace(/(?:^|[\s._-])(?:filmi|film|dizi)?\s*(?:[iİı]zle|seyret|watch\s+online)(?:\s|$).*$/i,'').replace(/[_]+/g,' ').replace(/\s+/g,' ').trim();if(!title.includes(' ')&&title.includes('-'))title=title.replace(/-\d+$/,'').replace(/-/g,' ');return title.length>=2?title:null;}

export function webEpisode(raw:unknown):{season:number;episode:number;title:string}|null{
 if(typeof raw!=="string")return null;const text=raw.slice(0,500);const match=/(?:\bS(\d{1,2})[ ._-]*E(\d{1,3})\b)|(\d{1,2})\s*\.?\s*(?:sezon|season)\s*[ ._-]*(\d{1,3})\s*\.?\s*(?:bölüm|bolum|episode)/i.exec(text);
 if(!match)return null;const season=Number(match[1]??match[3]),episode=Number(match[2]??match[4]);const title=webFilmName(text.slice(0,match.index));return title&&season>0&&episode>0?{season,episode,title}:null;
}
