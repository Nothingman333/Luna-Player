import type { CItem } from "./Mine";
export type WebCollectionTarget = { page: string; title: string; url?: string; source?: string; type?: CItem["webType"]; text?: string };
export function webHttpUrl(raw: unknown): string | undefined {
  if (typeof raw !== "string" || raw.length > 8192) return;
  try { const u = new URL(raw); if (["http:","https:"].includes(u.protocol) && !u.username && !u.password) return u.href; } catch {}
}
export function collectionMediaUrl(item:CItem):string|undefined {
  const cover=webHttpUrl(item.cover),url=webHttpUrl(item.url),page=webHttpUrl(item.from);
  return cover || (url && url!==page ? url : undefined);
}
export function collectionSourceUrl(item:CItem):string|undefined {
  const source=webHttpUrl(item.from)||webHttpUrl(item.url);if(!source)return;
  if(item.webType!=="text"||!item.note?.trim())return source;
  const url=new URL(source),text=item.note.trim().replace(/\s+/g," ");
  // Merged quotes need not be contiguous. Anchor the first saved passage.
  const passage=item.note.split(/\n\s*\n/)[0].trim().replace(/\s+/g," ");
  const fragment=(passage||text).slice(0,240);
  const encode=(value:string)=>encodeURIComponent(value).replace(/-/g,"%2D");
  url.hash=url.hash.split(":~:")[0]+":~:text="+encode(fragment);
  return url.href;
}
export function webCollectionItem(target: WebCollectionTarget): CItem | null {
  const page = webHttpUrl(target.page); if (!page) return null;
  const text=target.text?.trim().slice(0,8000);
  const type = text && (!target.type || target.type === "page" || target.type === "link") ? "text" : target.type ?? (target.url ? "link" : "page");
  const url = webHttpUrl(target.source) ?? webHttpUrl(target.url) ?? page;
  return {kind:"web", webType:type, title:(type === "text" ? text!.slice(0,100) : target.title.trim().slice(0,300)) || new URL(url).hostname, url, from:page,
    cover:type === "image" && url!==page ? url : undefined,
    note:[target.text?.trim().slice(0,8000), url === page && ["image","video","audio"].includes(type) ? "Medya bağlantısı kalıcı değil; kaynak sayfa kaydedildi." : ""].filter(Boolean).join("\n\n") || undefined};
}
