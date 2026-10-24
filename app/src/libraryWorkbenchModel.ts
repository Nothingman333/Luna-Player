import { cleanLibraryView, foldText, type LibraryView } from "./libraryTools";
export type SavedLibraryView = { id: string; name: string; view: LibraryView };
export function readLibraryViews(raw: unknown): SavedLibraryView[] {
  if (!Array.isArray(raw) || raw.length > 12) throw Error("Invalid saved filters.");
  const names=new Set<string>(),ids=new Set<string>();
  return raw.map(row=>{
    if(!row||typeof row.id!=="string"||!/^[a-zA-Z0-9_-]{1,80}$/.test(row.id)||typeof row.name!=="string"||!row.name.trim()||row.name.trim().length>60||names.has(foldText(row.name.trim()))||ids.has(row.id)||!row.view||typeof row.view!=="object"||Array.isArray(row.view))throw Error("Invalid saved filter.");
    const view=cleanLibraryView(row.view);
    if(Object.keys(view).some(k=>row.view[k]!==view[k as keyof LibraryView]))throw Error("Invalid saved filter settings.");
    names.add(foldText(row.name.trim()));ids.add(row.id);return {id:row.id,name:row.name.trim(),view};
  });
}
export function saveLibraryView(rows: SavedLibraryView[], name: string, view: LibraryView, id?: string): SavedLibraryView[] {
  if(id&&!rows.some(r=>r.id===id))throw Error("Filter no longer exists.");
  if(rows.some(r=>r.id!==id&&foldText(r.name)===foldText(name.trim())))throw Error("Duplicate filter name.");
  const row={id:id??crypto.randomUUID(),name:name.trim(),view:cleanLibraryView(view)};
  return readLibraryViews(id?rows.map(r=>r.id===id?row:r):[...rows,row]);
}
export const sameLibraryView=(a:LibraryView,b:LibraryView)=>Object.keys(cleanLibraryView(a)).every(k=>a[k as keyof LibraryView]===b[k as keyof LibraryView]);
export function readCompareIds(raw:unknown):string[]{
  if(!Array.isArray(raw)||raw.length>3||raw.some(id=>typeof id!=="string"||!id||id.length>4096)||new Set(raw).size!==raw.length)throw Error("Invalid comparison selection.");return [...raw];
}
export function toggleCompareId(ids:string[],id:string):string[]{
  readCompareIds(ids);if(ids.includes(id))return ids.filter(x=>x!==id);return readCompareIds([...ids,id]);
}
