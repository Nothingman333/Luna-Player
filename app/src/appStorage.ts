/** Synchronous Storage API backed by memory after the transactional SQLite bootstrap.
 * Before bootstrap (and in isolated tests), delegates to the browser's original storage.
 * No Tauri globals or DOM properties are replaced. */
let memory: Map<string, string> | null = null;
let changed: ((key: string, value: string | null) => void) | undefined;
const original = () => globalThis.localStorage;
const api: Storage = {
  get length() { return memory?.size ?? original().length; },
  key(index: number) { return memory ? (Array.from(memory.keys())[index] ?? null) : original().key(index); },
  getItem(key: string) { return memory ? (memory.get(String(key)) ?? null) : original().getItem(key); },
  setItem(key: string, value: string) { key=String(key);value=String(value); if (!memory) {original().setItem(key,value);return;} if (memory.get(key)===value)return; memory.set(key,value);changed?.(key,value); },
  removeItem(key: string) { key=String(key);if (!memory) {original().removeItem(key);return;} if(memory.delete(key))changed?.(key,null); },
  clear() { if (!memory) {original().clear();return;} for(const key of [...memory.keys()])api.removeItem(key); },
};
export const appStorage = new Proxy(api, {
  ownKeys: () => memory ? [...memory.keys()] : Object.keys(original()),
  getOwnPropertyDescriptor: (_, key) => typeof key === "string" && api.getItem(key) != null ? {enumerable:true,configurable:true,value:api.getItem(key)} : undefined,
});
export function activateStorage(data: Record<string,string>, onChange: (key: string,value: string|null) => void) {
  if(memory)throw new Error("Application storage is already initialized");
  memory=new Map(Object.entries(data));changed=onChange;
}
