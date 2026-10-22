export type QueueEdit={kind:"remove";at:number}|{kind:"move";at:number;direction:1|-1}|{kind:"trim"};
/** Queue edits never reload the current item. Occurrences are identified by index, not URL. */
export function editMusicQueue<T>(queue:T[],index:number,action:QueueEdit):{queue:T[];index:number}{
 const same={queue,index};if(!Number.isInteger(index)||index<0||index>=queue.length)return same;
 if(action.kind==="trim")return index===queue.length-1?same:{queue:queue.slice(0,index+1),index};
 const at=action.at;if(!Number.isInteger(at)||at<0||at>=queue.length)return same;
 if(action.kind==="remove"){if(at===index)return same;return {queue:queue.filter((_,i)=>i!==at),index:at<index?index-1:index};}
 const to=at+action.direction;if(at<=index||to<=index||to>=queue.length)return same;
 const next=[...queue];[next[at],next[to]]=[next[to],next[at]];return {queue:next,index};
}
export const queueText=(text:string)=>text.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/ı/g,"i").toLowerCase();
export function searchQueue<T extends {title:string;artist?:string}>(queue:T[],query:string){const words=queueText(query).trim().split(/\s+/).filter(Boolean);return queue.flatMap((q,index)=>words.every(w=>queueText(q.title+" "+(q.artist||"")).includes(w))?[{q,index}]:[]);}
