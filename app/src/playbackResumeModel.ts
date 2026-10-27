import type {Recent,Item} from "./library";
/** History is newest-first: the latest position belongs to the film, irrespective of the copy. */
export function sharedPosition(identity:string,items:Item[],recent:Recent[],saved?:Recent|null){
 const item=items.find(i=>i.files.some(f=>f.path===identity));
 const paths=new Set(item?.meta?.kind==="movie"&&item.meta.id>0?items.filter(i=>i.meta?.kind==="movie"&&i.meta.id===item.meta!.id).flatMap(i=>i.files.map(f=>f.path)):[identity]);
 return recent.find(r=>paths.has(r.path))??saved??undefined;
}
export function pendingResumeReached(target:{path:string;time:number}|null,path:string|null,time:number){return !target||target.path!==path||time>=target.time-1;}
