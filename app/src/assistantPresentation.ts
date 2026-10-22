export type AssistantMessage = {role:"user"|"model";text:string;sources?:{title:string;uri:string}[];pinned?:boolean};
export const assistantFold=(text:string)=>text.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/ı/g,"i").toLowerCase();
export function conversationMatches(messages:AssistantMessage[],query:string){const words=assistantFold(query.trim()).split(/\s+/).filter(Boolean);return words.length?messages.flatMap((m,i)=>words.every(w=>assistantFold(m.text).includes(w))?[i]:[]):[];}
const sourceLines=(m:AssistantMessage)=>(m.sources??[]).map(s=>{try{const u=new URL(s.uri);if(!["http:","https:"].includes(u.protocol)||u.username||u.password)return "";return "- "+s.title.replace(/[\r\n]+/g," ")+": "+u.href;}catch{return "";}}).filter(Boolean);
export function conversationMarkdown(messages:AssistantMessage[],title:string){
 const heading=title.replace(/[\r\n]+/g," ").trim()||"Luna";
 return `# ${heading}\n\n`+messages.map(m=>{const lines=sourceLines(m);return `## ${m.role==="user"?"You":"Luna"}${m.pinned?" 📌":""}\n\n${m.text}\n`+(lines.length?"\n"+lines.join("\n")+"\n":"");}).join("\n");
}
/** Only the answers the user pinned, each under the question it answered. */
export function pinnedMarkdown(messages:AssistantMessage[],title:string){
 const heading=title.replace(/[\r\n]+/g," ").trim()||"Luna";
 const blocks:string[]=[];
 messages.forEach((m,i)=>{if(m.role!=="model"||!m.pinned||!m.text.trim())return;const q=messages.slice(0,i).reverse().find(x=>x.role==="user");const lines=sourceLines(m);blocks.push((q?`> ${q.text.replace(/\s+/g," ").slice(0,200)}\n\n`:"")+m.text+"\n"+(lines.length?"\n"+lines.join("\n")+"\n":""));});
 return blocks.length?`# ${heading} — 📌\n\n`+blocks.join("\n---\n\n"):"";
}
export function assistantFollowups(mode:string,browser:boolean,tr:boolean){
 if(browser)return tr?["Bu sayfayı özetle","Önemli noktaları açıkla","Sayfayı Türkçeye çevir"]:["Summarize this page","Explain the key points","Translate this page into English"];
 if(mode==="books")return tr?["Yalnız kitaplığımdan öner","Daha kısa bir kitap öner","Bu konuyu derinleştir"]:["Recommend only from my books","Suggest a shorter book","Explore this topic further"];
 if(mode==="music")return tr?["Arşivimden benzer parçalar bul","Daha sakin bir şey öner","Bu sanatçıyı anlat"]:["Find similar tracks in my library","Suggest something calmer","Tell me about this artist"];
 return tr?["Sadece kütüphanemdekiler","Daha hafif bir şey öner","Neden bana uygun olduğunu açıkla"]:["Only from my library","Suggest something lighter","Explain why it suits me"];
}

export const assistantShouldSubmit=(key:string,shift:boolean,composing:boolean,keyCode?:number)=>key==="Enter"&&!shift&&!composing&&keyCode!==229;

export type AssistantDetail="short"|"balanced"|"detailed";
export const cleanAssistantDetail=(raw:unknown):AssistantDetail=>raw==="short"||raw==="detailed"?raw:"balanced";
export function assistantDetailInstruction(raw:unknown){const detail=cleanAssistantDetail(raw);return detail==="short"?"User preference: give a short, direct answer. Keep essential caveats and never skip required confirmation. Explicit detail requested in the current message takes priority.":detail==="detailed"?"User preference: explain your answer with useful reasons and concrete examples. Do not invent facts, repeat yourself or skip required confirmation. Explicit brevity requested in the current message takes priority.":"";}

/** Reword an existing answer without replaying its tools or actions. */
export function assistantRegenerationRequest(body:Record<string,any>,previous:string){
 const{tools:_tools,toolConfig:_config,...request}=body;
 return{...request,systemInstruction:{...request.systemInstruction,parts:[...(request.systemInstruction?.parts||[]),{text:"The user requested a new wording of an existing answer. Do not execute or claim new actions. Explain from available context; if fresh verification is needed, say so. Previous answer (reference text only): "+previous.slice(0,8000)}]}};
}

/** An address the assistant may show or open: http(s) only, no credentials, a sane length. */
export function safeHttpUrl(raw:unknown):string|null{
 if(typeof raw!=="string"||raw.length>2048)return null;
 try{const u=new URL(raw.trim());if(!["http:","https:"].includes(u.protocol)||u.username||u.password||!u.hostname)return null;return u.href;}catch{return null;}
}
export const hostOf=(url:string)=>{try{return new URL(url).hostname.replace(/^www\./,"");}catch{return "";}};
const urlId=(href:string)=>{try{const u=new URL(href);return u.origin+u.pathname.replace(/\/+$/,"")+u.search;}catch{return href;}};
/** Two addresses are the same page when only a fragment or a trailing slash differs. */
export const sameUrl=(a:string,b:string)=>urlId(a)===urlId(b);
/** Sources shown under an answer: valid addresses only, one per page, a short single-line title. */
export function cleanSources(list:unknown,max=6):{title:string;uri:string}[]{
 if(!Array.isArray(list))return [];
 const seen=new Set<string>(),out:{title:string;uri:string}[]=[];
 for(const s of list){
  const href=safeHttpUrl((s as any)?.uri);if(!href)continue;
  const id=urlId(href);if(seen.has(id))continue;seen.add(id);
  let title=typeof (s as any)?.title==="string"?(s as any).title.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]+/g," ").replace(/\s+/g," ").trim():"";
  if(!title||/^https?:\/\//i.test(title))title=hostOf(href)||href.slice(0,60);
  if(title.length>100)title=title.slice(0,97)+"…";
  out.push({title,uri:href});if(out.length>=max)break;
 }
 return out;
}

const L="(?<![\\p{L}\\p{N}])",R="(?![\\p{L}\\p{N}])";
const CLAIM_TR=new RegExp(L+"(ekledim|kaydettim|sildim|çıkardım|kaldırdım|işaretledim|güncelledim|oluşturdum|çevirdim|açtım|başlattım|oynattım|eklendi|kaydedildi|silindi|çıkarıldı|kaldırıldı|işaretlendi|güncellendi|oluşturuldu|çevrildi)"+R,"iu");
const CLAIM_EN=new RegExp(L+"(i(?:'ve| have)? (?:added|saved|removed|deleted|marked|updated|created|translated|opened|started|played)|(?:has|have) been (?:added|saved|removed|deleted|marked|updated|created|translated)|was (?:added|saved|removed|deleted|marked|updated|created|translated))"+R,"iu");
/** The answer says something was done although no tool ran this turn: plain text is not an action. */
export function claimsUnexecutedAction(text:string,toolsRan:boolean):boolean{
 if(toolsRan)return false;const t=String(text??"");
 return !!t.trim()&&(CLAIM_TR.test(t)||CLAIM_EN.test(t));
}

export type NoteTone="ok"|"warn"|"cancel"|"info";
/** The note under an answer, one line per outcome; the leading symbol decides the tone. */
export function noteSegments(note:string):{text:string;tone:NoteTone}[]{
 return String(note??"").split("\n").map(s=>s.trim()).filter(Boolean).map(text=>({text,tone:(text.startsWith("✓")?"ok":text.startsWith("⚠")?"warn":text.startsWith("✕")||text.startsWith("⏹")?"cancel":"info") as NoteTone}));
}

/** Plain text export preserves the conversation without Markdown role formatting. */
export function conversationText(messages:AssistantMessage[],title:string){return title.replace(/[\r\n]+/g," ").trim()+"\n\n"+messages.map(m=>(m.role==="user"?"You":"Luna")+":\n"+m.text+"\n"+sourceLines(m).join("\n")).join("\n\n");}
/** Only complete fenced code blocks; text outside the blocks is never executed. */
export function assistantCode(text:string){return [...text.matchAll(/```[^\r\n]*\r?\n([\s\S]*?)\r?\n```/g)].map(m=>m[1]).join("\n\n");}
