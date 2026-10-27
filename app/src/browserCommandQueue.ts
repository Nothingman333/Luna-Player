/** Keep tab mutations ordered without making them wait for independent page/media reads. */
export function browserCommandQueue(invoke:<T>(command:string,args:Record<string,unknown>)=>Promise<T>){
 let mutations:Promise<unknown>=Promise.resolve();
 return function native<T>(command:string,args:Record<string,unknown>,allowed:()=>boolean=()=>true):Promise<T>{
  const run=()=>{if(!allowed())throw Error("Operation canceled before execution");return invoke<T>(command,args);};
  const read=command==="browser_media"||command==="browser_read"||(command==="browser_position"&&(args.action==="read"||args.action==="url"));
  if(read)return Promise.resolve().then(run);
  const job=mutations.then(run);mutations=job.then(()=>{},()=>{});return job;
 };
}
