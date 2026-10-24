import {appStorage} from "./appStorage";
export type TokenUsage={input:number;output:number;total:number;cached:number;requests:number;unreported:number;since:number};
const KEY="lunaAiTokenUsage";
const count=(n:unknown)=>typeof n==="number"&&Number.isFinite(n)&&n>=0?Math.min(Number.MAX_SAFE_INTEGER,Math.floor(n)):0;
export function usageFromResponse(response:any):Pick<TokenUsage,"input"|"output"|"total"|"cached">|null {
 const u=response?.usageMetadata??response?.usage;
 if(!u||typeof u!=="object")return null;
 const input=count(u.promptTokenCount??u.prompt_tokens??u.input_tokens)+(u.input_tokens!==undefined?count(u.cache_read_input_tokens)+count(u.cache_creation_input_tokens):0),output=count(u.candidatesTokenCount??u.completion_tokens??u.output_tokens);
 const total=count(u.totalTokenCount??u.total_tokens)||(input+output+count(u.thoughtsTokenCount));
 if(![u.promptTokenCount,u.prompt_tokens,u.input_tokens,u.candidatesTokenCount,u.completion_tokens,u.output_tokens,u.totalTokenCount,u.total_tokens].some(v=>typeof v==="number"&&Number.isFinite(v)&&v>=0))return null;
 return {input,output,total:Math.max(total,input+output),cached:count(u.cachedContentTokenCount??u.prompt_tokens_details?.cached_tokens??u.cache_read_input_tokens)};
}
export function readTokenUsage():TokenUsage {
 let raw:any;try{raw=JSON.parse(appStorage.getItem(KEY)??"null");}catch{}
 return {input:count(raw?.input),output:count(raw?.output),total:count(raw?.total),cached:count(raw?.cached),requests:count(raw?.requests),unreported:count(raw?.unreported),since:count(raw?.since)||Date.now()};
}
export function recordTokenUsage(response:unknown){
 const previous=readTokenUsage(),usage=usageFromResponse(response);
 const next={...previous,requests:previous.requests+1,unreported:previous.unreported+(usage?0:1)};
 if(usage)for(const key of ["input","output","total","cached"] as const)next[key]=Math.min(Number.MAX_SAFE_INTEGER,next[key]+usage[key]);
 appStorage.setItem(KEY,JSON.stringify(next));window.dispatchEvent(new Event("luna-ai-usage"));
}
export function resetTokenUsage(){appStorage.removeItem(KEY);window.dispatchEvent(new Event("luna-ai-usage"));}
