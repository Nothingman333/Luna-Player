import { invoke } from "@tauri-apps/api/core";
import { store } from "./library";

/** Which service answers for the assistant. Everything in Luna speaks Gemini's request format;
 *  for the others it is translated here, and the answer translated back. */
export type AiProvider = "gemini" | "openai" | "claude" | "custom";
export const AI_PROVIDERS: { id: AiProvider; name: string; keyName: string; model: string; keyUrl?: string }[] = [
  { id: "gemini", name: "Gemini", keyName: "geminiKey", model: "gemini-3.1-flash-lite", keyUrl: "https://aistudio.google.com/app/apikey" },
  { id: "openai", name: "OpenAI", keyName: "openaiKey", model: "gpt-4.1-mini", keyUrl: "https://platform.openai.com/api-keys" },
  { id: "claude", name: "Claude", keyName: "claudeKey", model: "claude-haiku-5-5", keyUrl: "https://console.anthropic.com/settings/keys" },
  { id: "custom", name: "Base URL", keyName: "customAiKey", model: "" },
];
export const aiProvider = (): AiProvider => (store.get("aiProvider") as AiProvider) || "gemini";
const spec = (p = aiProvider()) => AI_PROVIDERS.find((x) => x.id === p) ?? AI_PROVIDERS[0];
export const aiModel = (p = aiProvider()) => (p === "gemini" ? store.get("geminiModel") : store.get("aiModel:" + p)) || spec(p).model;
/** "https://openrouter.ai/api/v1", "http://localhost:11434/v1"… (OpenAI-compatible) */
export const aiBase = () => (store.get("aiBase") ?? "").trim().replace(/\/+$/, "").replace(/\/chat\/completions$/, "");
/** The assistant can answer: a key for the chosen service (a local server at a base URL may need none). */
export function aiKey(): string {
  const p = aiProvider();
  const k = store.get(spec(p).keyName) ?? "";
  if (p === "custom") return aiBase() ? k || "-" : "";
  return k;
}
export const aiReady = () => !!aiKey();
export const aiName = () => (aiProvider() === "custom" ? aiBase().replace(/^https?:\/\//, "").split("/")[0] || "Base URL" : spec().name);

const URLS = {
  openai: "https://api.openai.com/v1",
  claude: "https://api.anthropic.com/v1",
};
const endpoint = (p: AiProvider) => (p === "claude" ? URLS.claude : p === "custom" ? aiBase() : URLS.openai);

/** The models of a provider, for the settings list. */
export async function aiModels(p: AiProvider, key: string, base?: string): Promise<string[]> {
  const url = (p === "custom" ? (base ?? aiBase()).trim().replace(/\/+$/, "") : endpoint(p)) + "/models";
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
const declarations = (body: any): any[] => (body.tools ?? []).flatMap((t: any) => t.functionDeclarations ?? []);
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

const parseArgs = (s: any) => { if (typeof s !== "string") return s ?? {}; try { return JSON.parse(s || "{}"); } catch { return {}; } };
/** The answer back in Gemini's shape: candidates[0].content.parts with text and functionCall. */
function fromOpenAi(r: any) {
  const m = r?.choices?.[0]?.message ?? {};
  const parts: any[] = [];
  const text = typeof m.content === "string" ? m.content : Array.isArray(m.content) ? m.content.map((c: any) => c.text ?? "").join("") : "";
  if (text) parts.push({ text });
  for (const c of m.tool_calls ?? []) if (c.function?.name) parts.push({ functionCall: { name: c.function.name, args: parseArgs(c.function.arguments) } });
  return { candidates: [{ content: { role: "model", parts } }] };
}
function fromAnthropic(r: any) {
  const parts: any[] = [];
  for (const b of r?.content ?? []) {
    if (b.type === "text" && b.text) parts.push({ text: b.text });
    else if (b.type === "tool_use") parts.push({ functionCall: { name: b.name, args: b.input ?? {} } });
  }
  return { candidates: [{ content: { role: "model", parts } }] };
}

/** One request to the chosen non-Gemini provider, in and out in Gemini's format. Google Search
 *  (a Gemini-only tool) is left out; the caller sees no groundingMetadata and treats it as unsourced. */
export async function otherAi(body: any): Promise<{ r: any; id: string; noSearch: boolean }> {
  const p = aiProvider();
  const model = aiModel(p);
  if (!model) throw new Error(p === "custom" ? "Ayarlar › Hesaplar ve anahtarlar: model adını yaz" : "Model yok");
  const noSearch = (body.tools ?? []).some((t: any) => t.google_search || t.googleSearch);
  const key = aiKey() === "-" ? "" : aiKey();
  if (p === "claude") {
    const r = await invoke<any>("llm_post", { kind: "anthropic", url: endpoint(p) + "/messages", key, body: toAnthropic(body, model) });
    return { r: fromAnthropic(r), id: model, noSearch };
  }
  const r = await invoke<any>("llm_post", { kind: "openai", url: endpoint(p) + "/chat/completions", key, body: toOpenAi(body, model) });
  return { r: fromOpenAi(r), id: model, noSearch };
}
