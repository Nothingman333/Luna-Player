/** Pure request translation for the assistant's provider layer (no Tauri / React imports, so it can be tested
 *  directly). Everything in Luna speaks Gemini's request format; for OpenAI, Claude and OpenAI-compatible base
 *  URLs it is translated here. The answers are translated back in assistantProviderModel.ts. */

export type RequestTarget = "openai" | "custom";

/** Gemini's schema ("OBJECT", "STRING"…) in JSON Schema (lower-case types). */
export function toJsonSchema(s: any): any {
  if (!s || typeof s !== "object") return s;
  if (Array.isArray(s)) return s.map(toJsonSchema);
  const out: any = {};
  for (const [k, v] of Object.entries(s)) {
    if (k === "type" && typeof v === "string") out.type = v.toLowerCase();
    else if (k === "nullable") continue;
    else if (k === "properties") out.properties = Object.fromEntries(Object.entries(v as any).map(([n, x]) => [n, toJsonSchema(x)]));
    else if (k === "items") out.items = toJsonSchema(v);
    else out[k] = v;
  }
  if (out.type === "object" && !out.properties) out.properties = {};
  return out;
}

/** The tools offered. When Luna requires one of a few ("call show_film"), only those are offered: OpenAI's
 *  "required" and Claude's "any" would otherwise let the model pick any of the forty. */
export function requestDeclarations(body: any): any[] {
  const all = (body?.tools ?? []).flatMap((t: any) => t?.functionDeclarations ?? []);
  const fc = body?.toolConfig?.functionCallingConfig;
  const only: string[] | undefined = fc?.mode === "ANY" ? fc.allowedFunctionNames : undefined;
  return only?.length ? all.filter((d: any) => only.includes(d.name)) : all;
}
export const systemText = (body: any): string => (body?.systemInstruction?.parts ?? []).map((p: any) => p?.text ?? "").join("\n");
export const wantsJson = (body: any) => body?.generationConfig?.responseMimeType === "application/json";

/** Gemini's turns as a list of {role, parts}, with ids given to each function call so the results can point back at them. */
export function requestTurns(body: any): { role: "model" | "user"; parts: any[] }[] {
  const pending: { id: string; name: string }[] = [];
  return (body?.contents ?? []).map((c: any, i: number) => {
    const parts = (c?.parts ?? []).map((p: any, j: number) => {
      if (p?.functionCall) { const id = `call_${i}_${j}`; pending.push({ id, name: p.functionCall.name }); return { ...p, _id: id }; }
      if (p?.functionResponse) {
        const at = pending.findIndex((x) => x.name === p.functionResponse.name);
        const hit = at >= 0 ? pending.splice(at, 1)[0] : pending.shift();
        return { ...p, _id: hit?.id ?? `call_${p.functionResponse.name}` };
      }
      return p;
    });
    return { role: c?.role === "model" ? "model" : "user", parts };
  });
}

/** OpenAI's reasoning families (o1/o3/o4…, gpt-5…) refuse a custom temperature and the old max_tokens field. */
export const isOpenAiReasoningModel = (model: string) => /^(o\d|gpt-5)/i.test(String(model ?? "").trim());

const finite = (n: unknown): number | undefined => (typeof n === "number" && Number.isFinite(n) ? n : undefined);
/** The generation settings Luna sets on a Gemini request: temperature and the output limit. */
export function generationSettings(body: any): { temperature?: number; maxOutputTokens?: number } {
  const g = body?.generationConfig ?? {};
  const t = finite(g.temperature), m = finite(g.maxOutputTokens);
  return {
    ...(t !== undefined ? { temperature: Math.max(0, Math.min(2, t)) } : {}),
    ...(m !== undefined && m >= 1 ? { maxOutputTokens: Math.min(Math.round(m), 128000) } : {}),
  };
}

const IMAGE_MIME = /^image\/(png|jpe?g|gif|webp)$/i;

/** A Gemini-shaped request as an OpenAI chat/completions body. `target` "openai" is api.openai.com, "custom"
 *  any OpenAI-compatible server (Ollama, LM Studio, OpenRouter…), where only the widely supported fields are set. */
export function toOpenAiRequest(body: any, model: string, target: RequestTarget = "openai") {
  const messages: any[] = [];
  let sys = systemText(body);
  if (wantsJson(body)) sys += "\n\nAnswer with JSON only.";
  // small local models (Qwen especially) drift into Chinese characters mid-sentence and copy Luna's [ALINTI …] markers
  // DeepSeek: a short note of its own (few tokens); thinking follows Luna's "Thinking" switch
  const deepseek = target === "custom" && /deepseek/i.test(model);
  if (deepseek) sys = (sys.trim() ? sys + "\n\n" : "") + "Be brief. Reply in the user's language. When a tool can do what is asked, call it instead of describing it; never invent tool results.";
  else if (target === "custom") sys = (sys.trim() ? sys + "\n\n" : "") + "Write only in the language of the user's question, using its own alphabet. Never insert Chinese, Japanese or Korean characters unless the user writes in them. Never repeat bracketed markers such as [ALINTI …] or [ALINTI SONU …].";
  if (sys.trim()) messages.push({ role: "system", content: sys });
  for (const t of requestTurns(body)) {
    const texts = t.parts.filter((p: any) => typeof p.text === "string" && p.text).map((p: any) => p.text);
    if (t.role === "model") {
      const calls = t.parts.filter((p: any) => p.functionCall).map((p: any) => ({ id: p._id, type: "function", function: { name: p.functionCall.name, arguments: JSON.stringify(p.functionCall.args ?? {}) } }));
      // DeepSeek's thinking mode wants its reasoning back on a tool-calling turn (400 without it)
      const reasoning = t.parts.find((p: any) => typeof p.lunaReasoning === "string")?.lunaReasoning;
      messages.push({ role: "assistant", content: texts.join("\n") || null, ...(calls.length ? { tool_calls: calls } : {}), ...(reasoning && target === "custom" ? { reasoning_content: reasoning } : {}) });
      continue;
    }
    for (const p of t.parts.filter((p: any) => p.functionResponse))
      messages.push({ role: "tool", tool_call_id: p._id, content: JSON.stringify(p.functionResponse.response ?? {}) });
    // only pictures go as image parts; another kind of attachment would be rejected by the API
    const pics = t.parts.filter((p: any) => p.inlineData && IMAGE_MIME.test(String(p.inlineData.mimeType ?? ""))).map((p: any) => ({ type: "image_url", image_url: { url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}` } }));
    if (pics.length) messages.push({ role: "user", content: [...texts.map((x: string) => ({ type: "text", text: x })), ...pics] });
    else if (texts.length) messages.push({ role: "user", content: texts.join("\n") });
  }
  // Qwen3 on a local server (LM Studio, Ollama…) writes a long hidden "thinking" pass before every answer. Its own switch,
  // /no_think, goes at the end of the user's latest message (its model card's instruction); simple questions come back
  // several times faster. The assistant's "Thinking" switch (lunaThink) leaves it out.
  if (target === "custom" && !body?.lunaThink && /qwen[\s_-]*3/i.test(model)) {
    const last = [...messages].reverse().find((m) => m.role === "user");
    if (last && typeof last.content === "string") last.content += " /no_think";
    else if (last && Array.isArray(last.content)) { const t = [...last.content].reverse().find((c: any) => c.type === "text"); if (t) t.text += " /no_think"; else last.content.push({ type: "text", text: "/no_think" }); }
  }
  const tools = requestDeclarations(body).map((d) => ({ type: "function", function: { name: d.name, description: d.description ?? "", parameters: toJsonSchema(d.parameters ?? { type: "OBJECT" }) } }));
  const out: any = { model, messages };
  if (tools.length) {
    out.tools = tools;
    const fc = body?.toolConfig?.functionCallingConfig;
    if (fc?.mode === "ANY") out.tool_choice = fc.allowedFunctionNames?.length === 1 ? { type: "function", function: { name: fc.allowedFunctionNames[0] } } : "required";
    else if (fc?.mode === "NONE") out.tool_choice = "none";
  }
  // Settings Luna asked for (subtitle translation at 0.2, comparisons capped at 1500 tokens…) used to be dropped here.
  const g = generationSettings(body);
  const reasoning = target === "openai" && isOpenAiReasoningModel(model);
  // Gemma 4 ignores /no_think; on LM Studio reasoning_effort "none" is what turns its thinking off (measured: 510 hidden tokens to 0).
  if (target === "custom" && !body?.lunaThink && /gemma[\s_-]*4/i.test(model)) out.reasoning_effort = "none";
  if (deepseek) out.thinking = { type: body?.lunaThink ? "enabled" : "disabled" };
  // an effort chosen for this job (subtitle translation): OpenAI's reasoning models take it as is ("off" = the least they allow)
  const effort = body?.lunaEffort as string | undefined;
  if (reasoning && effort) out.reasoning_effort = effort === "off" ? (/^gpt-5/i.test(model) ? "minimal" : "low") : effort;
  if (g.temperature !== undefined && !reasoning) out.temperature = g.temperature;
  if (g.maxOutputTokens !== undefined) {
    if (reasoning) out.max_completion_tokens = g.maxOutputTokens; else out.max_tokens = g.maxOutputTokens;
  } else if (target === "custom") {
    // a small local model can fall into a loop and write until the context is full: an answer has a ceiling
    out.max_tokens = body?.lunaThink ? 6000 : 2500;
  }
  // JSON mode on the official API only: OpenAI-compatible servers do not all accept response_format.
  if (wantsJson(body) && target === "openai" && !tools.length) out.response_format = { type: "json_object" };
  return out;
}

/** A Gemini-shaped request as an Anthropic messages body. */
export function toAnthropicRequest(body: any, model: string) {
  const messages: { role: "user" | "assistant"; content: any[] }[] = [];
  const push = (role: "user" | "assistant", blocks: any[]) => {
    if (!blocks.length) return;
    const last = messages[messages.length - 1];
    if (last?.role === role) last.content.push(...blocks); else messages.push({ role, content: blocks });
  };
  for (const t of requestTurns(body)) {
    const blocks: any[] = [];
    for (const p of t.parts) {
      if (typeof p.text === "string" && p.text.trim()) blocks.push({ type: "text", text: p.text });
      else if (p.functionCall) blocks.push({ type: "tool_use", id: p._id, name: p.functionCall.name, input: p.functionCall.args ?? {} });
      else if (p.functionResponse) blocks.push({ type: "tool_result", tool_use_id: p._id, content: JSON.stringify(p.functionResponse.response ?? {}) });
      else if (p.inlineData && IMAGE_MIME.test(String(p.inlineData.mimeType ?? ""))) blocks.push({ type: "image", source: { type: "base64", media_type: p.inlineData.mimeType, data: p.inlineData.data } });
    }
    // the results of tool calls come first in their turn
    blocks.sort((a, b) => (b.type === "tool_result" ? 1 : 0) - (a.type === "tool_result" ? 1 : 0));
    push(t.role === "model" ? "assistant" : "user", blocks);
  }
  if (messages[0]?.role !== "user") messages.unshift({ role: "user", content: [{ type: "text", text: "…" }] });
  let sys = systemText(body);
  if (wantsJson(body)) sys += "\n\nAnswer with JSON only.";
  const g = generationSettings(body);
  const out: any = { model, max_tokens: g.maxOutputTokens ?? 8192, messages, ...(sys.trim() ? { system: sys } : {}) };
  // Anthropic accepts 0–1; Gemini-style values up to 2 are clamped
  if (g.temperature !== undefined) out.temperature = Math.min(1, g.temperature);
  // Claude's extended thinking for a chosen effort: a budget on top of the answer (it does not take a temperature then)
  const effort = body?.lunaEffort as string | undefined;
  if (effort === "medium" || effort === "high") { const budget = effort === "high" ? 8000 : 2048; out.thinking = { type: "enabled", budget_tokens: budget }; out.max_tokens = (g.maxOutputTokens ?? 8192) + budget; delete out.temperature; }
  const tools = requestDeclarations(body).map((d) => ({ name: d.name, description: d.description ?? "", input_schema: toJsonSchema(d.parameters ?? { type: "OBJECT" }) }));
  if (tools.length) {
    out.tools = tools;
    const fc = body?.toolConfig?.functionCallingConfig;
    if (fc?.mode === "ANY") out.tool_choice = fc.allowedFunctionNames?.length === 1 ? { type: "tool", name: fc.allowedFunctionNames[0] } : { type: "any" };
    else if (fc?.mode === "NONE") out.tool_choice = { type: "none" };
  }
  return out;
}
