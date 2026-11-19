/** Pure helpers for the assistant's provider layer (no Tauri / React imports, so they can be tested directly):
 *  OpenAI-compatible and Anthropic answers in Gemini's shape, and the checks that keep a broken payload
 *  from turning into a silent empty answer or an empty tool call. */

export type AnswerMeta = { truncated?: boolean; reasoningOnly?: boolean; refusal?: string; droppedCalls?: number };

/** Tool arguments as a provider sent them. Broken JSON is reported, never silently turned into {}. */
export function parseToolArgs(raw: unknown): { args: Record<string, unknown>; error?: string } {
  if (raw === undefined || raw === null || raw === "") return { args: {} };
  let value: unknown = raw;
  if (typeof raw === "string") {
    const text = raw.trim();
    if (!text) return { args: {} };
    try { value = JSON.parse(text); } catch { return { args: {}, error: "Argümanlar geçerli JSON değil" }; }
    // some providers encode the arguments twice
    if (typeof value === "string") { try { value = JSON.parse(value); } catch { return { args: {}, error: "Argümanlar geçerli JSON değil" }; } }
  }
  if (value === null) return { args: {} };
  if (typeof value !== "object" || Array.isArray(value)) return { args: {}, error: "Argümanlar bir nesne olmalı" };
  return { args: value as Record<string, unknown> };
}

/** Text of an OpenAI-style message content: a string, or an array of text parts. */
export function openAiText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((c: any) => typeof c === "string" ? c
    : c && typeof c === "object" && (c.type === undefined || c.type === "text" || c.type === "output_text") && typeof c.text === "string" ? c.text : "").join("");
}

/** A provider that answers 200 with an error body (or nothing usable) must fail loudly, not as "(empty answer)". */
export function providerPayloadError(r: unknown): string | null {
  if (r === null || r === undefined || typeof r !== "object" || Array.isArray(r))
    return "Sağlayıcı geçersiz bir yanıt döndürdü (JSON nesnesi değil).";
  const o = r as any;
  const err = o.error ?? (o.type === "error" ? o : undefined);
  if (err) {
    if (typeof err === "string") return err.slice(0, 500);
    const msg = err.message ?? err.type ?? err.status ?? JSON.stringify(err);
    return `${err.code ?? err.status ?? ""} ${String(msg)}`.trim().slice(0, 500);
  }
  return null;
}

const part = (name: string, args: Record<string, unknown>, error?: string) => ({ functionCall: { name, args }, ...(error ? { lunaArgsError: error } : {}) });

/** A model caught in a loop writes the same line again and again: a line is kept once (empty lines are left alone). */
export function dropRepeats(text: string): string {
  const seen = new Set<string>();
  const out = text.split("\n").filter((line) => {
    const k = line.trim().toLocaleLowerCase();
    if (!k || k.length < 4) return true;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** An OpenAI-compatible answer in Gemini's shape (`candidates[0].content.parts`). Covers array content,
 *  empty content with tool_calls, the legacy function_call, refusals and reasoning-only answers. */
export function fromOpenAi(r: any) {
  const choice = r?.choices?.[0];
  const m: any = choice?.message ?? (typeof choice?.text === "string" ? { content: choice.text } : {});
  const parts: any[] = [];
  const meta: AnswerMeta = {};
  // a local reasoning model (Qwen3, DeepSeek-R1…) can put its thinking inside the answer as <think>…</think>: never shown
  let text = openAiText(m.content).replace(/<think>[\s\S]*?(?:<\/think>|$)\s*/gi, "").trim();
  // a small local model sometimes writes its tool call as text (<tool_call>{…}</tool_call>) instead of a real call
  const written: any[] = [];
  if (!Array.isArray(m.tool_calls) || !m.tool_calls.length) {
    text = text.replace(/<tool_call>\s*([\s\S]*?)\s*(?:<\/tool_call>|$)/gi, (_all, body) => {
      try { const c = JSON.parse(body); if (typeof c?.name === "string") written.push({ function: { name: c.name, arguments: c.arguments ?? c.parameters ?? {} } }); } catch { /* not a call */ }
      return "";
    }).trim();
  }
  text = dropRepeats(text);
  if (text) parts.push({ text });
  const refusal = typeof m.refusal === "string" && m.refusal.trim() ? m.refusal.trim() : undefined;
  if (!text && refusal) { parts.push({ text: refusal }); meta.refusal = refusal; }
  const calls: any[] = Array.isArray(m.tool_calls) && m.tool_calls.length ? m.tool_calls : m.function_call?.name ? [{ function: m.function_call }] : written;
  for (const c of calls) {
    const name = c?.function?.name;
    if (typeof name !== "string" || !name.trim()) { meta.droppedCalls = (meta.droppedCalls ?? 0) + 1; continue; }
    const { args, error } = parseToolArgs(c.function.arguments);
    parts.push(part(name.trim(), args, error));
  }
  const finish = choice?.finish_reason;
  if (finish === "length") meta.truncated = true;
  const reasoning = [m.reasoning_content, m.reasoning].find((x) => typeof x === "string" && x.trim());
  if (!parts.length && reasoning) meta.reasoningOnly = true;
  // DeepSeek (thinking with tools) wants this reasoning back in the next request, or it answers 400: kept hidden on the first part
  if (parts.length && reasoning) parts[0] = { ...parts[0], lunaReasoning: reasoning };
  return { candidates: [{ content: { role: "model", parts }, ...(finish ? { finishReason: String(finish) } : {}) }], lunaMeta: meta };
}

/** An Anthropic answer in Gemini's shape. */
export function fromAnthropic(r: any) {
  const parts: any[] = [];
  const meta: AnswerMeta = {};
  let thinking = false;
  for (const b of Array.isArray(r?.content) ? r.content : []) {
    if (b?.type === "text" && typeof b.text === "string" && b.text) parts.push({ text: b.text });
    else if (b?.type === "tool_use") {
      if (typeof b.name !== "string" || !b.name.trim()) { meta.droppedCalls = (meta.droppedCalls ?? 0) + 1; continue; }
      const input = b.input;
      if (input && typeof input === "object" && !Array.isArray(input)) parts.push(part(b.name, input));
      else { const { args, error } = parseToolArgs(input); parts.push(part(b.name, args, error)); }
    } else if (b?.type === "thinking" || b?.type === "redacted_thinking") thinking = true;
  }
  if (r?.stop_reason === "max_tokens") meta.truncated = true;
  if (r?.stop_reason === "refusal") meta.refusal = "refusal";
  if (!parts.length && thinking) meta.reasoningOnly = true;
  return { candidates: [{ content: { role: "model", parts }, ...(r?.stop_reason ? { finishReason: String(r.stop_reason) } : {}) }], lunaMeta: meta };
}

/** Gemini itself can answer 200 with a blocked prompt and no candidates. */
export function geminiBlockReason(r: any): string | null {
  const parts = r?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts) && parts.length) return null;
  const block = r?.promptFeedback?.blockReason;
  if (typeof block === "string" && block) return block;
  const finish = r?.candidates?.[0]?.finishReason;
  return typeof finish === "string" && /SAFETY|PROHIBITED|BLOCKLIST|RECITATION|SPII/i.test(finish) ? finish : null;
}

/** A short note for an answer that stopped early or came back without text. */
export function answerNote(meta: AnswerMeta | undefined, finishReason: unknown, tr: boolean): string | undefined {
  const truncated = meta?.truncated || /^(MAX_TOKENS|length|max_tokens)$/i.test(String(finishReason ?? ""));
  if (truncated) return tr ? "Yanıt sağlayıcının çıktı sınırında kesildi; eksik olabilir" : "The answer hit the provider's output limit and may be incomplete";
  return undefined;
}
export function emptyAnswerReason(meta: AnswerMeta | undefined, tr: boolean): string | undefined {
  if (meta?.reasoningOnly) return tr ? "Model yalnız düşünme çıktısı döndürdü, yanıt metni yok. Başka bir model seç ya da çıktı sınırını artır." : "The model returned only reasoning output and no answer text. Pick another model or raise its output limit.";
  return undefined;
}

/** Small local models can forget a closing bracket (Gemma ends with `}\n}` where `}\n]\n}` belongs) or leave a
 *  trailing comma. Only the structure is repaired, never a value; text cut inside a string stays unreadable. */
function repairJsonBrackets(text: string): string | null {
  const closers: string[] = [];
  let out = "", inString = false, escaped = false;
  for (const c of text) {
    if (inString) {
      out += c;
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
    } else if (c === '"') { inString = true; out += c; }
    else if (c === "{" || c === "[") { closers.push(c === "{" ? "}" : "]"); out += c; }
    else if (c === "}" || c === "]") {
      if (!closers.includes(c)) return null;
      out = out.replace(/,\s*$/, "");
      while (closers[closers.length - 1] !== c) out += closers.pop();
      closers.pop();
      out += c;
    } else out += c;
  }
  if (inString) return null;
  out = out.replace(/,\s*$/, "");
  return out + closers.reverse().join("");
}

/** The JSON object in a model's text answer: a ```json fence is preferred, otherwise the outermost {…}.
 *  Throws a clear error (not "Unexpected end of JSON input") when there is none or it does not parse. */
export function extractJsonObject(text: unknown): any {
  const raw = String(text ?? "").replace(/^\uFEFF/, "");
  const fenced = raw.match(/```(?:json)?\s*\r?\n([\s\S]*?)\r?\n?```/i)?.[1];
  for (const candidate of [fenced, raw]) {
    if (!candidate) continue;
    const start = candidate.indexOf("{"), end = candidate.lastIndexOf("}");
    if (start < 0 || end <= start) continue;
    try {
      const value = JSON.parse(candidate.slice(start, end + 1));
      if (value && typeof value === "object" && !Array.isArray(value)) return value;
    } catch {
      const repaired = repairJsonBrackets(candidate.slice(start, end + 1));
      try {
        const value = repaired && JSON.parse(repaired);
        if (value && typeof value === "object" && !Array.isArray(value)) return value;
      } catch { /* try the next candidate */ }
    }
  }
  throw new Error(/[{}]/.test(raw) ? "The AI answer's JSON could not be read" : "The AI answer had no JSON");
}
