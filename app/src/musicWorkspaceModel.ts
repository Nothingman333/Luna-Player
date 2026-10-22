import type{MPlaylist,QItem}from"./Music";
export function validQueueItem(raw:unknown):raw is QItem{
 if(!raw||typeof raw!=="object")return false;const q=raw as QItem;
 return typeof q.src==="string"&&!!q.src.trim()&&typeof q.title==="string"&&[q.artist,q.album,q.cover,q.favicon,q.book,q.podcast,q.about,q.page].every(x=>x===undefined||x===null||typeof x==="string")&&(q.duration===undefined||(typeof q.duration==="number"&&Number.isFinite(q.duration)&&q.duration>=0));
}
export function validPlaylist(raw:unknown):raw is MPlaylist{
 if(!raw||typeof raw!=="object")return false;const p=raw as MPlaylist;return typeof p.id==="string"&&!!p.id&&typeof p.name==="string"&&!!p.name.trim()&&typeof p.at==="number"&&Number.isFinite(p.at)&&[p.from,p.url,p.cover].every(x=>x===undefined||x===null||typeof x==="string")&&Array.isArray(p.items)&&p.items.every(validQueueItem);
}
export function playlistCollection(raw:unknown):MPlaylist[]{if(!Array.isArray(raw)||!raw.every(validPlaylist)||new Set(raw.map(p=>p.id)).size!==raw.length)throw Error("Playlist data is damaged; save a backup before editing.");return raw;}
const publicUrl=(raw:unknown)=>{try{const u=new URL(String(raw));return ["http:","https:"].includes(u.protocol)&&!u.username&&!u.password?u.href:undefined;}catch{return undefined;}};
export function portablePlaylist(p:MPlaylist){return{luna:"playlist",version:1,name:p.name,items:p.items.map(q=>({src:q.src,title:q.title,...(q.artist?{artist:q.artist}:{}),...(q.album?{album:q.album}:{}),...(typeof q.duration==="number"&&Number.isFinite(q.duration)?{duration:q.duration}:{}),...(q.yt?{yt:true}:{}),...(publicUrl(q.page)?{page:publicUrl(q.page)}:{})}))};}
export function importPlaylist(raw:unknown,id:string,at:number):MPlaylist{
 const x=raw as ReturnType<typeof portablePlaylist>;
 if(!x||x.luna!=="playlist"||x.version!==1||typeof x.name!=="string"||!x.name.trim()||x.name.length>120||!Array.isArray(x.items)||x.items.length>5000)throw Error("Invalid Luna playlist (maximum 5000 songs).");
 const items=x.items.map(q=>{if(!validQueueItem(q)||q.src.length>12000||q.title.length>1000)throw Error("Invalid playlist song.");const src=q.src.trim();
 if(!publicUrl(src)&&!/^ytdl:\/\/ytsearch\d*:[^\r\n]+$/i.test(src)&&!/^(?:[a-z]:[\\/]|\\\\)/i.test(src))throw Error("Unsupported playlist source.");
 const url=publicUrl(src);if(/^https?:/i.test(src)&&!url)throw Error("Invalid playlist URL.");
 return{src:url||src,title:q.title.trim()||src,artist:q.artist?.slice(0,500),album:q.album?.slice(0,500),duration:q.duration,yt:q.yt===true||/^ytdl:/i.test(src),page:publicUrl(q.page)};
 });return{id,at,name:x.name.trim(),from:"Luna",items};
}
export function uniquePlaylistName(name:string,lists:MPlaylist[]){let next=name.trim().slice(0,100)||"Playlist",n=2;const names=new Set(lists.map(p=>p.name.toLocaleLowerCase()));const stem=next;while(names.has(next.toLocaleLowerCase()))next=stem+" ("+(n++)+")";return next;}
export function dedupePlaylist(items:QItem[]){const seen=new Set<string>();return items.filter(q=>{if(seen.has(q.src))return false;seen.add(q.src);return true;});}
export function reorderPlaylist<T>(items:T[],from:number,to:number):T[]{if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<0||from>=items.length||to>=items.length||from===to)return items;const next=[...items],row=next.splice(from,1)[0];next.splice(to,0,row);return next;}
export function audioResume(raw:unknown,duration?:number):number{const n=Number(raw);if(!Number.isFinite(n)||n<=0||(duration&&Number.isFinite(duration)&&n>=duration))return 0;return Math.max(0,Math.floor(n-5));}
export function storedAudioPosition(time:number,duration:number):number|null{if(!Number.isFinite(time)||!Number.isFinite(duration)||duration<=0||time<=0)return null;return duration-time<Math.min(60,duration/10)?-1:Math.floor(Math.min(time,duration)/5)*5;}
