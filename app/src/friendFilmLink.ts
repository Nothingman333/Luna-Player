import {invoke} from "./nativeCore";
import {openUrl} from "./linkOpen";
import {friendProfileUrl} from "./FriendProfile";
import {store} from "./library";
type Film={title:string;year?:string;id?:number;kind:"movie"|"tv"};
export function filmSlug(raw:string):string|null{try{const u=new URL(raw,"https://letterboxd.com");return u.protocol==="https:"&&u.hostname==="letterboxd.com"&&/^\/film\/[^/]+\/?$/.test(u.pathname)?u.pathname.split("/")[2]:null;}catch{return null;}}
/** Never invent a slug or send the user to a profile when they asked for a film entry. */
export async function openFriendFilm(name:string,film:Film){
 const profile=friendProfileUrl(name);if(!profile)throw Error("Letterboxd profile not connected");
 const key="friendFilmSlug:"+film.kind+":"+(film.id||film.title+":"+(film.year||""));
 let slug=filmSlug(store.get(key)||"");
 if(!slug&&film.id&&film.kind==="movie"){
  const [url,html]=await invoke<[string,string]>("http_text_at",{url:"https://letterboxd.com/tmdb/"+film.id+"/"});
  slug=filmSlug(url);if(!slug){const doc=new DOMParser().parseFromString(html,"text/html");slug=filmSlug(doc.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href||"");}
 }
 if(!slug){
  const query=encodeURIComponent([film.title,film.year].filter(Boolean).join(" "));
  const html=await invoke<string>("http_text",{url:"https://letterboxd.com/s/search/films/"+query+"/"});
  const doc=new DOMParser().parseFromString(html,"text/html");
  const matches=Array.from(doc.querySelectorAll('[data-item-link^="/film/"]')).filter(el=>!film.year||[el.getAttribute("data-item-name"),el.getAttribute("data-item-full-display-name"),el.closest("li")?.textContent].some(value=>value?.includes(film.year!)));
  if(matches.length)slug=filmSlug(matches[0].getAttribute("data-item-link")||"");
 }
 if(!slug)throw Error("Letterboxd film entry could not be resolved");
 store.set(key,"https://letterboxd.com/film/"+slug+"/");
 await openUrl(profile.replace(/\/$/,"")+"/film/"+slug+"/");
}
