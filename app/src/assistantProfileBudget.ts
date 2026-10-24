/** Deterministic prompt budgets; persisted library/profile data is never truncated. */
export function profileSection(title:string,rows:string[],maxRows=60,maxChars=3600):string{
 const kept:string[]=[];let used=0;
 for(const row of rows.slice(0,maxRows)){const text=String(row).replace(/\s+/g," ").slice(0,320);if(used+text.length+3>maxChars)break;kept.push(text);used+=text.length+3;}
 const omitted=rows.length-kept.length;
 return `## ${title}\n`+(kept.length?kept.map(x=>"- "+x).join("\n"):"(yok)")+(omitted?`\n- … (+${omitted} kayıt daha / more records; ayrıntılar için liste araçlarını kullan / use list tools for details)`:"");
}
export function boundedProfile(sections:string[],limit=28000):string{
 let out="";for(let i=0;i<sections.length;i++){if(out.length+sections[i].length+2>limit){return out+`\n\n… (${sections.length-i} bölüm daha / more sections; gerektiğinde araçlarla oku / inspect with tools as needed)`;}out+=(out?"\n\n":"")+sections[i];}return out;
}
