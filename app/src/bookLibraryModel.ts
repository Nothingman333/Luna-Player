// Pure helpers of the book library lists (shelves, topic shelves, search, order), kept apart so they can be tested.
import { bookFold } from "./bookDataModel";

export type BookShelfKey = "all" | "later" | "reading" | "done" | "liked" | "disliked" | "history";
export type ListedBook = { path: string; title: string; author: string; kind?: string; cover?: string | null };
export type ShelfEnv<B extends ListedBook> = {
  /** the books of the scanned folders (the "all" shelf; books opened from elsewhere are only in the others) */
  inLibrary: Set<string>;
  /** "Okunacaklar": its own list, apart from the topic shelves and from started / finished */
  later: string[];
  /** the topic shelves (Psikoloji, Felsefe…) of each book path */
  shelves: Record<string, string[]>;
  progress: (b: B) => number;
  finished: (b: B) => boolean;
  vote: (b: B) => "like" | "dislike" | undefined;
};

export function inBookShelf<B extends ListedBook>(b: B, shelf: BookShelfKey, env: ShelfEnv<B>): boolean {
  switch (shelf) {
    case "all": return env.inLibrary.has(b.path);
    case "later": return env.later.includes(b.path);
    case "reading": return env.progress(b) > 0.005 && !env.finished(b);
    case "done": return env.finished(b);
    case "liked": return env.vote(b) === "like";
    case "disliked": return env.vote(b) === "dislike";
    default: return true;
  }
}

/** Every word of the search (accents and punctuation ignored) is in the title or the author. */
export function matchesBook(folded: string, b: ListedBook): boolean {
  if (!folded) return true;
  const hay = bookFold(b.title + " " + b.author);
  return folded.split(" ").every((w) => hay.includes(w));
}

/** The list a shelf, a topic shelf, a search and an order give. Computed from the current records every time:
 *  a list kept from earlier showed a book that was finished or un-liked meanwhile. */
export function visibleBooks<B extends ListedBook>(all: B[], o: { shelf: BookShelfKey; topic: string; query: string; sort: BookOrder; format?: string; covers?: string; recent: string[]; env: ShelfEnv<B> }): B[] {
  const q = bookFold(o.query);
  const order = o.sort === "plan" ? o.env.later : o.recent;
  const ranks = new Map<string,number>();order.forEach((p,i)=>{if(!ranks.has(p))ranks.set(p,i);});
  const rank = (p: string) => ranks.get(p) ?? Number.MAX_SAFE_INTEGER;
  return all
    .filter((b) => inBookShelf(b, o.shelf, o.env))
    .filter((b) => !o.topic || (o.env.shelves[b.path] ?? []).includes(o.topic))
    .filter((b) => matchesBook(q, b))
    .filter((b) => !o.format || o.format === "all" || b.kind === o.format)
    .filter((b) => !o.covers || o.covers === "all" || (o.covers === "with" ? !!b.cover : !b.cover))
    .sort((x, y) => o.sort === "title" ? x.title.localeCompare(y.title)
      : o.sort === "author" ? x.author.localeCompare(y.author) || x.title.localeCompare(y.title)
      : o.sort === "progress" ? o.env.progress(y)-o.env.progress(x) || x.title.localeCompare(y.title)
      : rank(x.path) - rank(y.path) || x.title.localeCompare(y.title));
}

/** How many of the books are on each topic shelf (every name appears, also an empty shelf). */
export function topicCounts(paths: string[], shelves: Record<string, string[]>, names: string[]): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(names.map((n) => [n, 0]));
  for (const p of new Set(paths)) for (const s of new Set(shelves[p] ?? [])) if (Object.prototype.hasOwnProperty.call(out,s)) out[s]++;
  return out;
}

/** A topic filter kept from before whose shelf is gone shows everything instead of an empty list. */
export const activeTopic = (topic: string, names: string[]) => (topic && names.includes(topic) ? topic : "");

/** Merge current sources on every render. Open-file books can change without a folder scan. */
export function validListedBook(raw:unknown):raw is ListedBook{return !!raw&&typeof raw==="object"&&["path","title","author"].every(k=>typeof (raw as Record<string,unknown>)[k]==="string")&&!!(raw as ListedBook).path;}
export function mergeBookSources<T extends ListedBook>(...sources:unknown[]):T[]{
 const out=new Map<string,T>();for(const source of sources){const rows=Array.isArray(source)?source:source&&typeof source==="object"?Object.values(source):[];for(const b of rows)if(validListedBook(b)&&!out.has(b.path))out.set(b.path,b as T);}return [...out.values()];
}

export function bookPaths(raw:unknown):string[]{return Array.isArray(raw)?raw.filter((p):p is string=>typeof p==="string"&&!!p):[];}

export type BookOrder = "recent" | "title" | "author" | "progress" | "plan";
export function libraryView(raw:unknown){
 const x=raw&&typeof raw==="object"&&!Array.isArray(raw)?raw as Record<string,unknown>:{};
 return {sort:(["recent","title","author","progress","plan"].includes(String(x.sort))?x.sort:"recent") as BookOrder,
 topic:typeof x.topic==="string"?x.topic:"",format:["epub","pdf","cbz"].includes(String(x.format))?String(x.format):"all",
 covers:["with","without"].includes(String(x.covers))?String(x.covers):"all"};
}
export function cleanBookPosition(raw:unknown):{loc?:string|number;pct:number;at:number;chapter?:string}|null{
 if(!raw||typeof raw!=="object"||Array.isArray(raw))return null;
 const x=raw as Record<string,unknown>;
 if(typeof x.pct!=="number"||!Number.isFinite(x.pct)||x.pct<0||x.pct>1)return null;
 const loc=typeof x.loc==="string"&&x.loc.length<=20000?x.loc:typeof x.loc==="number"&&Number.isFinite(x.loc)&&x.loc>=0?x.loc:undefined;
 return {pct:x.pct,at:typeof x.at==="number"&&Number.isFinite(x.at)&&x.at>=0?x.at:0,...(loc!==undefined?{loc}:{}),...(typeof x.chapter==="string"?{chapter:x.chapter}:{})};
}
export function reorderReadingPlan(paths:string[],path:string,direction:-1|1):string[]{
 const rows=[...new Set(paths)],i=rows.indexOf(path),j=i+direction;
 if(i<0||j<0||j>=rows.length)return rows;
 [rows[i],rows[j]]=[rows[j],rows[i]];return rows;
}
