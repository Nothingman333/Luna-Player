import type {RecentVisit} from "./browserSuggest";
export type HistoryDeleteKind="all"|"site"|"hour"|"today";
export type HistoryDeletePlan={kind:HistoryDeleteKind;site:string;since:number};
export function historyDeletePlan(kind:HistoryDeleteKind,site:string,now:number):HistoryDeletePlan{
 const midnight=new Date(now);midnight.setHours(0,0,0,0);
 return {kind,site:kind==="site"?site:"",since:kind==="hour"?now-3600000:kind==="today"?midnight.getTime():0};
}
export function historyDeleteCount(rows:RecentVisit[],plan:HistoryDeletePlan):number{
 return rows.filter(r=>{if(plan.kind==="site"){try{return new URL(r.url).hostname.replace(/^www\./,"")===plan.site;}catch{return false;}}return r.at>=plan.since;}).length;
}
