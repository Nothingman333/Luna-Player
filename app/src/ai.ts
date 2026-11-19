import { invoke } from "./nativeCore";
import { store, flushSecrets } from "./library";
import { extractJsonObject, fromAnthropic, fromOpenAi, providerPayloadError } from "./assistantProviderModel";
import { toAnthropicRequest, toOpenAiRequest } from "./assistantRequestModel";

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
function getProviderUse(pr: AiProfile): AiUse {
  const key = store.get(profileKeyName(pr.slot)) ?? "";
  const base = cleanBase(pr.base);
  return { provider: pr.provider, model: pr.model || spec(pr.provider).model, key: pr.provider === "custom" ? (base ? key || "-" : "") : key, base, label: pr.name };
}
/** A saved profile as the service, model, key and base URL a request uses. */
export const getAiProfileUse = (pr: AiProfile): AiUse => getProviderUse(pr);
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
  if (pr && pr.provider === p) return getProviderUse(pr).key;
  const k = store.get(spec(p).keyName) ?? "";
  if (p === "custom") return aiBase() ? k || "-" : "";
  return k;
}
export const aiReady = () => !!aiKey();
export const aiName = () => activeProfile()?.name ?? (aiProvider() === "custom" ? aiBase().replace(/^https?:\/\//, "").split("/")[0] || "Base URL" : spec().name);

/** A turn keeps its provider, model, base URL and key even if Settings change meanwhile. */
export function captureAiUse():AiUse{
 const profile=activeProfile();if(profile)return getProviderUse(profile);
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
// The translation itself is pure and tested: assistantRequestModel.ts (it also carries temperature,
// the output limit and JSON mode over, which used to be dropped for every non-Gemini provider).

/** One request to the chosen non-Gemini provider, in and out in Gemini's format. Google Search
 *  (a Gemini-only tool) is left out; the caller sees no groundingMetadata and treats it as unsourced. */
/** Flash mode's choice for the current message (null: the "Thinking" switch decides). */
let thinkOverride: boolean | null = null;
export function setThinkOverride(value: boolean | null) { thinkOverride = value; }
export async function otherAi(body: any, use?: Partial<AiUse> & { provider: AiProvider }, think?: boolean): Promise<{ r: any; id: string; noSearch: boolean }> {
  const p = use?.provider ?? aiProvider();
  const model = use?.model || aiModel(p);
  if (!model) throw new Error(p === "custom" ? "Ayarlar › Hesaplar ve anahtarlar: model adını yaz" : "Model yok");
  const noSearch = (body.tools ?? []).some((t: any) => t.google_search || t.googleSearch);
  const k = use?.key ?? aiKey(p);
  const key = k === "-" ? "" : k;
  if (p === "claude") {
    const raw = await invoke<any>("llm_post", { kind: "anthropic", url: endpoint(p) + "/messages", key, body: toAnthropicRequest(body, model) });
    const failure = providerPayloadError(raw);
    if (failure) throw new Error(failure);
    return { r: fromAnthropic(raw), id: model, noSearch };
  }
  const raw = await invoke<any>("llm_post", { kind: "openai", url: endpoint(p, use?.base) + "/chat/completions", key, body: toOpenAiRequest(p === "custom" && (think ?? thinkOverride ?? store.get("aiThink") === "1") ? { ...body, lunaThink: true } : body, model, p === "custom" ? "custom" : "openai") });
  const failure = providerPayloadError(raw);
  if (failure) throw new Error(failure);
  const r = fromOpenAi(raw);
  if (p === "custom") cleanLocalAnswer(r, JSON.stringify(body.contents ?? ""));
  return { r, id: model, noSearch };
}

/** A local model's answer without stray Chinese / Japanese / Korean characters (unless the conversation itself has them)
 *  and without Luna's own [ALINTI …] quote markers copied back. */
const CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff\uff66-\uff9f]+/g;
function cleanLocalAnswer(r: any, asked: string) {
  const keepCjk = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/.test(asked);
  for (const part of r?.candidates?.[0]?.content?.parts ?? []) {
    if (typeof part.text !== "string") continue;
    let t = part.text.replace(/^[ \t]*\[ALINTI(?: SONU)?[^\]\n]*\][ \t]*\n?/gim, "");
    if (!keepCjk) t = t.replace(CJK, "").replace(/[ \t]{2,}/g, " ").replace(/ ([,.;:!?])/g, "$1");
    part.text = t.trim();
  }
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
  if (pr) { const use = getProviderUse(pr); return { provider: pr.provider, model: use.model, count, note, spoilers, use }; }
  const p = AI_PROVIDERS.some((x) => x.id === choice) ? (choice as AiProvider) : aiProvider();
  const model = (store.get("reviewAiModel") ?? "").trim() || aiModel(p);
  const base = p === "custom" ? aiBase() : "";
  const label = !choice && activeProfile() ? aiName() : p === "custom" ? base.replace(/^https?:\/\//, "").split("/")[0] || "Base URL" : spec(p).name;
  return { provider: p, model, count, note, spoilers, use: { provider: p, model, key: aiKey(p), base, label } };
}
export const reviewAiName = (r = reviewAi()) => r.use.label + " · " + r.model;

/** One JSON answer from the review AI: the request in Gemini's shape, sent to whichever service is chosen. */
export async function reviewAiJson(system: string, user: string, r = reviewAi(), think = true): Promise<any> {
  if (!r.use.key) throw new Error("nokey");
  const body = { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.3 } };
  const res = r.provider === "gemini"
    ? await invoke<any>("gemini", { key: r.use.key, model: r.model, body })
    // a local model's thinking is decided by the analysis (careful for few reviews, quick for many), never by the chat's setting or Flash
    : (await otherAi(body, r.use, think)).r;
  const text = (res?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? "").join("");
  return extractJsonObject(text);
}

/** One JSON answer from the assistant's own service (Settings › Accounts), e.g. for the subtitle
 *  studio's translations and word explanations. The request is in Gemini's shape. */
/** How hard the model may think: "" = the provider's default. */
export type AiEffort = "" | "off" | "low" | "medium" | "high";
const GEMINI_BUDGET = { off: 0, low: 1024, medium: 4096, high: 12000 } as const;
export async function assistantJson(system: string, user: string, use: AiUse = captureAiUse(), temperature = 0.2, opts: { effort?: AiEffort; maxTokens?: number } = {}): Promise<any> {
  if (!use.key) throw new Error("nokey");
  const effort = opts.effort || "";
  const gen: any = { responseMimeType: "application/json", temperature };
  if (opts.maxTokens) gen.maxOutputTokens = opts.maxTokens;
  // Gemini 2.5: a thinking budget (Pro cannot switch it off: its smallest one)
  if (effort && use.provider === "gemini") gen.thinkingConfig = { thinkingBudget: effort === "off" && /pro/i.test(use.model) ? 128 : GEMINI_BUDGET[effort] };
  const body: any = { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }], generationConfig: gen, ...(effort ? { lunaEffort: effort } : {}) };
  const res = use.provider === "gemini"
    ? await invoke<any>("gemini", { key: use.key, model: use.model, body: { ...body, lunaEffort: undefined } })
    // DeepSeek and other OpenAI-compatible servers only know thinking on/off
    : (await otherAi(body, use, effort ? effort === "medium" || effort === "high" : undefined)).r;
  const text = (res?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? "").join("");
  return extractJsonObject(text);
}
