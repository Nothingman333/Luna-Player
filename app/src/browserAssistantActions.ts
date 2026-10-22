export type BrowserActionName="list"|"open"|"focus"|"close"|"reload"|"find"|"mute"|"bookmark"|"read_later"|"note";
export type BrowserActionContext={id:number|null;revision:number;url:string;title:string;tabs:{id:number;title:string;url:string}[]};
let getContext:(()=>BrowserActionContext)|null=null;
let handler:((action:BrowserActionName,args:Record<string,any>)=>Promise<string>)|null=null;
export function registerBrowserActions(read:()=>BrowserActionContext,run:(action:BrowserActionName,args:Record<string,any>)=>Promise<string>){getContext=read;handler=run;return()=>{if(handler===run){getContext=null;handler=null;}};}
export function browserActionContext(){if(!getContext)throw Error("Web bölümü açık değil; önce Web'e geç.");return getContext();}
export async function executeBrowserAction(action:BrowserActionName,args:Record<string,any>,expected?:BrowserActionContext){
 const now=browserActionContext();if(!handler)throw Error("Web bölümü kapandı.");
 if(expected&&(now.id!==expected.id||now.revision!==expected.revision||now.url!==expected.url))throw Error("Sekme onay sırasında değişti; yeni sekmeye işlem uygulanmadı.");
 if(!["list","open","focus"].includes(action)&&args.tabId!==undefined&&args.tabId!==now.id)throw Error("İstenen sekme etkin değil; önce o sekmeye geç.");
 return handler(action,args);
}
/** Only the user's explicit Web operation activates local tools; page text never invokes this. */
export function webActionIntent(text:string):boolean{
 const domain=/(?:sekme|favori|yer imi|okuma (?:kuyru|liste)|sayfa(?:da|ya|yı|yi| not)|tab\b|bookmark|reading (?:queue|list)|page note|(?:this|the) page)/i.test(text);
 const action=/(?:aç|\bac\b|kapat|ekle|kaydet|not al|not bırak|not birak|yaz|yenile|sessiz|sesini|göster|goster|listele|geç|gec|\bara\b|\bbul\b|kuyru.{0,16}\bal\b|\b(?:open|close|save|add|bookmark|reload|mute|unmute|find|list|show|switch)\b)/i.test(text);
 return domain&&action;
}
