import type {Candidate} from "./tonightModel";
type Metadata=Partial<Pick<Candidate,"runtime"|"genres"|"rating"|"poster"|"backdrop">> & {id:number};
/** TMDB metadata only. Use local/cache data first; never wait for an entire imported list. */
export async function resolveTonightCandidates(input:Candidate[],o:{read:(c:Candidate)=>Metadata|null;load:(c:Candidate)=>Promise<Metadata|null>;accepts:(c:Candidate)=>boolean;active:()=>boolean;offset:number;budgetMs?:number}){
 const merge=(c:Candidate,m:Metadata|null):Candidate=>m?{...c,tmdbId:m.id,runtime:m.runtime||c.runtime,genres:m.genres??c.genres,rating:m.rating??c.rating,poster:m.poster||c.poster,backdrop:m.backdrop||c.backdrop}:c;
 const rows=input.map(c=>merge(c,o.read(c)));let nextOffset=o.offset;
 if(rows.some(o.accepts)||!rows.length||!o.active())return {rows,nextOffset};
 const deadline=Date.now()+(o.budgetMs??5000);
 // Four lookups at a time, at most twelve per click; continue from the next batch next time.
 for(let checked=0;checked<Math.min(12,rows.length)&&o.active()&&Date.now()<deadline;checked+=4){
  const indices=Array.from({length:Math.min(4,rows.length-checked)},(_,i)=>(o.offset+checked+i)%rows.length);
  await Promise.all(indices.map(async index=>{const c=rows[index];if(c.runtime>0&&c.genres.length)return;let timeout:ReturnType<typeof setTimeout>|undefined;try{const m=await Promise.race([o.load(c),new Promise<null>(resolve=>{timeout=setTimeout(()=>resolve(null),Math.max(0,deadline-Date.now()));})]);if(o.active())rows[index]=merge(c,m);}catch{/* Preserve the imported record if TMDB is unavailable. */}finally{clearTimeout(timeout);}}));
  nextOffset=(o.offset+checked+indices.length)%rows.length;
  if(rows.some(o.accepts))break;
 }
 return {rows,nextOffset};
}

