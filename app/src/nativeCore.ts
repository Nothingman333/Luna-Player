export * from "@tauri-apps/api/core";
import {invoke as debugInvoke} from "./debugTelemetry";
import {recordTokenUsage} from "./aiUsage";
export const invoke:typeof debugInvoke=async(command,args,options)=>{
 const result=await debugInvoke(command,args,options);
 if(command==="gemini"||command==="llm_post")try{recordTokenUsage(result);}catch{}
 return result as any;
};
