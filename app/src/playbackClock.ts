import {useSyncExternalStore} from "react";
let time=0;
const subscribers=new Set<()=>void>();
export function publishPlaybackTime(value:unknown){const next=typeof value==="number"&&Number.isFinite(value)?Math.max(0,value):0;if(next===time)return;time=next;subscribers.forEach(fn=>fn());}
export const playbackTime=()=>time;
const subscribe=(callback:()=>void)=>{subscribers.add(callback);return()=>{subscribers.delete(callback)};};
export const usePlaybackTime=(step=0)=>useSyncExternalStore(subscribe,()=>step>0?Math.floor(time/step)*step:time,()=>0);
