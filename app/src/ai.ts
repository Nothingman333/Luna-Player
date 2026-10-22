import { invoke } from "@tauri-apps/api/core";
import { store, flushSecrets } from "./library";
import { fromAnthropic, fromOpenAi, providerPayloadError } from "./assistantProviderModel";

/** Which service answers for the assistant. Everything in Luna speaks Gemini's request format;
 *  for the others it is translated here, and the answer translated back. */
export type AiProvider = "gemini" | "openai" | "claude" | "custom";
export const AI_PROVIDERS: { id: AiProvider; name: string; keyName: string; model: string; keyUrl?: string }[] = [
  { id: "gemini", name: "Gemini", keyName: "geminiKey", model: "gemini-3.1-flash-lite", keyUrl: "https://aistudio.google.com/app/apikey" },
  { id: "openai", name: "OpenAI", keyName: "openaiKey", model: "gpt-4.1-mini", keyUrl: "https://platform.openai.com/api-keys" },
  { id: "claude", name: "Claude", keyName: "claudeKey", model: "claude-haiku-5-5", keyUrl: "https://console.anthropic.com/settings/keys" },
  { id: "custom", name: "Base URL", keyName: "customAiKey", model: "" },
];
// ---------- API profiles ----------
/** Named sets of service + key + model (+ base URL): "Work OpenAI", "Local Ollama"… The assistant
 *  and the review AI can each use one. Keys sit in Windows' store under fixed slot names. */
export type AiProfile = { slot: number; name: string; provider: AiProvider; model: string; base: string };
export const PROFILE_SLOTS = 8;
export const profileKeyName = (slot: number) => "aiProfileKey" + slot;
export function aiProfiles(): AiProfile[] {
  const raw = store.json<any[]>("aiProfiles", []);
  return (Array.isArray(raw) ? raw : []).filter((x) => x && Number.isInteger(x.slot) && x.slot >= 1 && x.slot <= PROFILE_SLOTS && AI_PROVIDERS.some((p) => p.id === x.provider))
    .map((x) => ({ slot: x.slot, name: String(x.name ?? "").trim().slice(0, 60) || "Profil " + x.slot, provider: x.provider as AiProvider, model: String(x.model ?? "").trim(), base: String(x.base ?? "").trim() }))
    .filter((x, i, all) => all.findIndex((y) => y.slot === x.slot) === i);
}
export const saveAiProfiles = (l: AiProfile[]) => store.set("aiProfiles", JSON.stringify(l));
export const aiProfile = (slot: unknown) => aiProfiles().find((x) => String(x.slot) === String(slot)) ?? null;
export function normalizeApiBase(raw:string):string {
  const text=raw.trim();if(!text)return "";
  const url=new URL(text);
  if(!["http:","https:"].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw Error("Base URL: geçerli bir HTTP(S) adresi kullan; anahtarı adresin içine yazma.");
  url.pathname=url.pathname.replace(/\/+$/,"").replace(/\/(?:chat\/completions|models)$/i,"");
  if(!url.pathname||url.pathname==="/")url.pathname="/v1";
  return url.href.replace(/\/+$/,"");
}
const cleanBase=(b:string)=>{try{return normalizeApiBase(b);}catch{return "";}};
export function activateAiProfile(slot:string){
  const profile=slot?aiProfile(slot):null;if(slot&&!profile)throw Error("Profil bulunamadı.");
  if(profile?.provider==="custom"&&!normalizeApiBase(profile.base))throw Error("Base URL gerekli.");
  if(!store.set("aiProfile",slot))throw Error("Profil seçimi kaydedilemedi.");
  window.dispatchEvent(new Event("luna-ai-profile"));
}
/** Save keys to Windows first, then publish the non-secret profile metadata. */
export async function commitAiProfiles(profiles:AiProfile[],keys:Record<number,string>,active:string){
  const slots=new Set<number>();
  const next=profiles.map(p=>{
    if(!Number.isInteger(p.slot)||p.slot<1||p.slot>PROFILE_SLOTS||slots.has(p.slot)||!AI_PROVIDERS.some(x=>x.id===p.provider))throw Error("Geçersiz profil.");slots.add(p.slot);
    const base=p.provider==="custom"?normalizeApiBase(p.base):p.base.trim();
    if(p.provider==="custom"&&(!base||!p.model.trim()))throw Error("Özel sağlayıcı için Base URL ve model gerekli.");
    return {slot:p.slot,provider:p.provider,name:p.name.trim().slice(0,60)||"Profil "+p.slot,base,model:p.model.trim()};
  });
  const oldMetadata=store.get("aiProfiles"),oldActive=store.get("aiProfile");
  const before=Object.fromEntries(Array.from({length:PROFILE_SLOTS},(_,i)=>[i+1,store.get(profileKeyName(i+1))||""]));
  try{
    for(let slot=1;slot<=PROFILE_SLOTS;slot++)store.set(profileKeyName(slot),slots.has(slot)?(keys[slot]===undefined?before[slot]:keys[slot]).trim():"");
    await flushSecrets();
    if(!saveAiProfiles(next))throw Error("Profiller kaydedilemedi.");
    if(!store.set("aiProfile",next.some(p=>String(p.slot)===active)?active:""))throw Error("Aktif profil kaydedilemedi.");
  }catch(error){
    for(let slot=1;slot<=PROFILE_SLOTS;slot++)store.set(profileKeyName(slot),before[slot]);
    try{await flushSecrets();if(oldMetadata===null)store.remove("aiProfiles");else store.set("aiProfiles",oldMetadata);if(oldActive===null)store.remove("aiProfile");else store.set("aiProfile",oldActive);}catch{throw Error("Profil kaydı ve geri alma tamamlanamadı; Windows anahtar kasasını kontrol et.");}
    throw error;
  }
  window.dispatchEvent(new Event("luna-ai-profile"));
}
/** What actually answers: a service with its key, model and base URL. */
export type AiUse = { provider: AiProvider; model: string; key: string; base: string; label: string };
function useOf(pr: AiProfile): AiUse {
  const key = store.get(profileKeyName(pr.slot)) ?? "";
  const base = cleanBase(pr.base);
  return { provider: pr.provider, model: pr.model || spec(pr.provider).model, key: pr.provider === "custom" ? (base ? key || "-" : "") : key, base, label: pr.name };
}
/** The assistant's profile, if one is chosen (Settings › Accounts). */
const activeProfile = () => aiProfile(store.get("aiProfile"));

export const aiProvider = (): AiProvider => activeProfile()?.provider ?? ((store.get("aiProvider") as AiProvider) || "gemini");
const spec = (p = aiProvider()) => AI_PROVIDERS.find((x) => x.id === p) ?? AI_PROVIDERS[0];
export const aiModel = (p = aiProvider()) => {
  const pr = activeProfile();
  if (pr && pr.provider === p) return pr.model || spec(p).model;
  return (p === "gemini" ? store.get("geminiModel") : store.get("aiModel:" + p)) || spec(p).model;
};
/** "https://openrouter.ai/api/v1", "http://localhost:11434/v1"… (OpenAI-compatible) */
export const aiBase = () => { const pr = activeProfile(); return cleanBase(pr && pr.provider === "custom" ? pr.base : store.get("aiBase") ?? ""); };
/** The assistant can answer: a key for the chosen service (a local server at a base URL may need none). */
export function aiKey(p: AiProvider = aiProvider()): string {
  const pr = activeProfile();
  if (pr && pr.provider === p) return useOf(pr).key;
  const k = store.get(spec(p).keyName) ?? "";
  if (p === "custom") return aiBase() ? k || "-" : "";
  return k;
}
export const aiReady = () => !!aiKey();
export const aiName = () => activeProfile()?.name ?? (aiProvider() === "custom" ? aiBase().replace(/^https?:\/\//, "").split("/")[0] || "Base URL" : spec().name);

/** A turn keeps its provider, model, base URL and key even if Settings change meanwhile. */
export function captureAiUse():AiUse{
 const profile=activeProfile();if(profile)return useOf(profile);
 const provider=aiProvider();return {provider,model:aiModel(provider),key:aiKey(provider),base:aiBase(),label:aiName()};
}

const URLS = {
  openai: "https://api.openai.com/v1",
  claude: "https://api.anthropic.com/v1",
};
const endpoint = (p: AiProvider, base?: string) => (p === "claude" ? URLS.claude : p === "custom" ? base || aiBase() : URLS.openai);

/** The models of a provider, for the settings list. */
export async function aiModels(p: AiProvider, key: string, base?: string): Promise<string[]> {
  const url = (p === "custom" ? normalizeApiBase(base ?? aiBase()) : endpoint(p)) + "/models";
  const ids = await invoke<string[]>("llm_models", { kind: p === "claude" ? "anthropic" : "openai", url, key: key === "-" ? "" : key });
  return ids.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
}

// ---------- Gemini request → OpenAI / Anthropic ----------
/** Gemini's schema ("OBJECT", "STRING"…) in JSON Schema (lower-case types). */
function schema(s: any): any {
  if (!s || typeof s !== "object") return s;
  if (Array.isArray(s)) return s.map(schema);
  const out: any = {};
  for (const [k, v] of Object.entries(s)) {
    if (k === "type" && typeof v === "string") out.type = v.toLowerCase();
    else if (k === "nullable") continue;
    else if (k === "properties") out.properties = Object.fromEntries(Object.entries(v as any).map(([n, x]) => [n, schema(x)]));
    else if (k === "items") out.items = schema(v);
    else out[k] = v;
  }
  if (out.type === "object" && !out.properties) out.properties = {};
  return out;
}
/** The tools offered. When Luna requires one of a few ("call show_film"), only those are offered: OpenAI's
 *  "required" and Claude's "any" would otherwise let the model pick any of the forty. */
const declarations = (body: any): any[] => {
  const all = (body.tools ?? []).flatMap((t: any) => t.functionDeclarations ?? []);
  const fc = body.toolConfig?.functionCallingConfig;
  const only: string[] | undefined = fc?.mode === "ANY" ? fc.allowedFunctionNames : undefined;
  return only?.length ? all.filter((d: any) => only.includes(d.name)) : all;
};
const systemText = (body: any): string => (body.systemInstruction?.parts ?? []).map((p: any) => p.text ?? "").join("\n");
const wantsJson = (body: any) => body.generationConfig?.responseMimeType === "application/json";

/** Gemini's turns as a list of {role, parts}, with ids given to each function call so the results can point back at them. */
function turns(body: any) {
  const pending: { id: string; name: string }[] = [];
  return (body.contents ?? []).map((c: any, i: number) => {
    const parts = (c.parts ?? []).map((p: any, j: number) => {
      if (p.functionCall) { const id = `call_${i}_${j}`; pending.push({ id, name: p.functionCall.name }); return { ...p, _id: id }; }
      if (p.functionResponse) {
        const at = pending.findIndex((x) => x.name === p.functionResponse.name);
        const hit = at >= 0 ? pending.splice(at, 1)[0] : pending.shift();
        return { ...p, _id: hit?.id ?? `call_${p.functionResponse.name}` };
      }
      return p;
    });
    return { role: c.role === "model" ? "model" : "user", parts };
  });
}

function toOpenAi(body: any, model: string) {
  const messages: any[] = [];
  let sys = systemText(body);
  if (wantsJson(body)) sys += "\n\nAnswer with JSON only.";
  if (sys.trim()) messages.push({ role: "system", content: sys });
  for (const t of turns(body)) {
    const texts = t.parts.filter((p: any) => typeof p.text === "string" && p.text).map((p: any) => p.text);
    if (t.role === "model") {
      const calls = t.parts.filter((p: any) => p.functionCall).map((p: any) => ({ id: p._id, type: "function", function: { name: p.functionCall.name, arguments: JSON.stringify(p.functionCall.args ?? {}) } }));
      messages.push({ role: "assistant", content: texts.join("\n") || null, ...(calls.length ? { tool_calls: calls } : {}) });
      continue;
    }
    for (const p of t.parts.filter((p: any) => p.functionResponse))
      messages.push({ role: "tool", tool_call_id: p._id, content: JSON.stringify(p.functionResponse.response ?? {}) });
    const pics = t.parts.filter((p: any) => p.inlineData).map((p: any) => ({ type: "image_url", image_url: { url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}` } }));
    if (pics.length) messages.push({ role: "user", content: [...texts.map((x: string) => ({ type: "text", text: x })), ...pics] });
    else if (texts.length) messages.push({ role: "user", content: texts.join("\n") });
  }
  const tools = declarations(body).map((d) => ({ type: "function", function: { name: d.name, description: d.description ?? "", parameters: schema(d.parameters ?? { type: "OBJECT" }) } }));
  const out: any = { model, messages };
  if (tools.length) {
    out.tools = tools;
    const fc = body.toolConfig?.functionCallingConfig;
    if (fc?.mode === "ANY") out.tool_choice = fc.allowedFunctionNames?.length === 1 ? { type: "function", function: { name: fc.allowedFunctionNames[0] } } : "required";
    else if (fc?.mode === "NONE") out.tool_choice = "none";
  }
  return out;
}

function toAnthropic(body: any, model: string) {
  const messages: { role: "user" | "assistant"; content: any[] }[] = [];
  const push = (role: "user" | "assistant", blocks: any[]) => {
    if (!blocks.length) return;
    const last = messages[messages.length - 1];
    if (last?.role === role) last.content.push(...blocks); else messages.push({ role, content: blocks });
  };
  for (const t of turns(body)) {
    const blocks: any[] = [];
    for (const p of t.parts) {
      if (typeof p.text === "string" && p.text.trim()) blocks.push({ type: "text", text: p.text });
      else if (p.functionCall) blocks.push({ type: "tool_use", id: p._id, name: p.functionCall.name, input: p.functionCall.args ?? {} });
      else if (p.functionResponse) blocks.push({ type: "tool_result", tool_use_id: p._id, content: JSON.stringify(p.functionResponse.response ?? {}) });
      else if (p.inlineData) blocks.push({ type: "image", source: { type: "base64", media_type: p.inlineData.mimeType, data: p.inlineData.data } });
    }
    // the results of tool calls come first in their turn
    blocks.sort((a, b) => (b.type === "tool_result" ? 1 : 0) - (a.type === "tool_result" ? 1 : 0));
    push(t.role === "model" ? "assistant" : "user", blocks);
  }
  if (messages[0]?.role !== "user") messages.unshift({ role: "user", content: [{ type: "text", text: "…" }] });
  let sys = systemText(body);
  if (wantsJson(body)) sys += "\n\nAnswer with JSON only.";
  const out: any = { model, max_tokens: 8192, messages, ...(sys.trim() ? { system: sys } : {}) };
  const tools = declarations(body).map((d) => ({ name: d.name, description: d.description ?? "", input_schema: schema(d.parameters ?? { type: "OBJECT" }) }));
  if (tools.length) {
    out.tools = tools;
    const fc = body.toolConfig?.functionCallingConfig;
    if (fc?.mode === "ANY") out.tool_choice = fc.allowedFunctionNames?.length === 1 ? { type: "tool", name: fc.allowedFunctionNames[0] } : { type: "any" };
    else if (fc?.mode === "NONE") out.tool_choice = { type: "none" };
  }
  return out;
}

/** One request to the chosen non-Gemini provider, in and out in Gemini's format. Google Search
 *  (a Gemini-only tool) is left out; the caller sees no groundingMetadata and treats it as unsourced. */
export async function otherAi(body: any, use?: Partial<AiUse> & { provider: AiProvider }): Promise<{ r: any; id: string; noSearch: boolean }> {
  const p = use?.provider ?? aiProvider();
  const model = use?.model || aiModel(p);
  if (!model) throw new Error(p === "custom" ? "Ayarlar › Hesaplar ve anahtarlar: model adını yaz" : "Model yok");
  const noSearch = (body.tools ?? []).some((t: any) => t.google_search || t.googleSearch);
  const k = use?.key ?? aiKey(p);
  const key = k === "-" ? "" : k;
  if (p === "claude") {
    const raw = await invoke<any>("llm_post", { kind: "anthropic", url: endpoint(p) + "/messages", key, body: toAnthropic(body, model) });
    const failure = providerPayloadError(raw);
    if (failure) throw new Error(failure);
    return { r: fromAnthropic(raw), id: model, noSearch };
  }
  const raw = await invoke<any>("llm_post", { kind: "openai", url: endpoint(p, use?.base) + "/chat/completions", key, body: toOpenAi(body, model) });
  const failure = providerPayloadError(raw);
  if (failure) throw new Error(failure);
  return { r: fromOpenAi(raw), id: model, noSearch };
}

// ---------- The AI that reads film reviews ("Worth watching?") ----------
/** Settings › Accounts: its own service or API profile ("" = the assistant's), model, how many
 *  Letterboxd reviews to read and an extra instruction. */
export type ReviewAi = { provider: AiProvider; model: string; count: number; note: string; spoilers: boolean; use: AiUse };
export function reviewAi(): ReviewAi {
  const n = Number(store.get("reviewAiCount"));
  const count = Number.isFinite(n) && n >= 10 && n <= 100 ? Math.round(n) : 50;
  const note = (store.get("reviewAiNote") ?? "").slice(0, 1000);
  const spoilers = store.get("reviewAiSpoilers") !== "0";
  const choice = store.get("reviewAiProvider") ?? "";
  const pr = choice.startsWith("profile:") ? aiProfile(choice.slice(8)) : null;
  if (pr) { const use = useOf(pr); return { provider: pr.provider, model: use.model, count, note, spoilers, use }; }
  const p = AI_PROVIDERS.some((x) => x.id === choice) ? (choice as AiProvider) : aiProvider();
  const model = (store.get("reviewAiModel") ?? "").trim() || aiModel(p);
  const base = p === "custom" ? aiBase() : "";
  const label = !choice && activeProfile() ? aiName() : p === "custom" ? base.replace(/^https?:\/\//, "").split("/")[0] || "Base URL" : spec(p).name;
  return { provider: p, model, count, note, spoilers, use: { provider: p, model, key: aiKey(p), base, label } };
}
export const reviewAiName = (r = reviewAi()) => r.use.label + " · " + r.model;

/** One JSON answer from the review AI: the request in Gemini's shape, sent to whichever service is chosen. */
export async function reviewAiJson(system: string, user: string, r = reviewAi()): Promise<any> {
  if (!r.use.key) throw new Error("nokey");
  const body = { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.3 } };
  const res = r.provider === "gemini"
    ? await invoke<any>("gemini", { key: r.use.key, model: r.model, body })
    : (await otherAi(body, r.use)).r;
  const text = (res?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? "").join("");
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return JSON.parse(json);
}
