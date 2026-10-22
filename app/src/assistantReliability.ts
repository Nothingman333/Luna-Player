/** Errors are shown to the user, never echoed with credentials from a provider. */
export function safeAiError(error: unknown, secrets: string[] = []): string {
  let text = String(error);
  for (const secret of secrets) if (secret && secret !== "-" && secret.length >= 6) text = text.split(secret).join("[hidden]");
  return text
    .replace(/\bBearer\s+[^\s"'<>]+/gi, "Bearer [hidden]")
    .replace(/\bsk-[a-zA-Z0-9_-]{12,}/g, "[hidden]")
    .replace(/\bAIza[0-9A-Za-z_-]{20,}/g, "[hidden]")
    .replace(/\b(x-api-key|api-key|authorization)(["']?\s*[:=]\s*["']?)[^\s"',}]+/gi, "$1$2[hidden]")
    .replace(/([?&](?:key|api_key|token|access_token)=)[^&\s]+/gi, "$1[hidden]")
    .slice(0, 1200);
}

export type AiErrorKind = "setup" | "cancelled" | "auth" | "context" | "blocked" | "model" | "quota" | "server" | "network" | "invalid" | "unknown";
/** What kind of failure a provider error is. Order matters: the first match wins. */
export function classifyAiError(error: unknown): AiErrorKind {
  const t = String(error);
  if (/model adını yaz|model yok\b|base url gerekli|geçerli bir http\(s\)|no model|model is required|missing model/i.test(t)) return "setup";
  if (/\babort(ed|error)?\b|cancell?ed/i.test(t)) return "cancelled";
  if (/location is not supported|safety|block.?reason|content.?filter|policy violation|prohibited/i.test(t)) return "blocked";
  if (/\b(401|403)\b|unauthenticated|unauthorized|invalid.?api.?key|incorrect api key|api key not valid|api.?key.{0,20}(invalid|expired)|permission.denied|forbidden|authentication/i.test(t)) return "auth";
  if (/context.?length|context.?window|maximum context|prompt is too long|input.{0,30}too (large|long)|request too large|\b413\b|reduce the length|maximum number of tokens|exceeds? the (maximum|max|limit)|token limit/i.test(t)) return "context";
  if (/\b404\b|page not found|no route|model.{0,80}(not found|does not exist|doesn'?t exist|unavailable|deprecated|decommissioned|not supported for)|no such model|unknown model|invalid model|models\/[\w.-]+ is not found/i.test(t)) return "model";
  if (/\b429\b|quota|rate.?limit|too many requests|resource.?exhausted|insufficient_quota|billing|exceeded your current/i.test(t)) return "quota";
  if (/\b(500|502|503|504|529)\b|overloaded|internal server|bad gateway|service unavailable|gateway time/i.test(t)) return "server";
  if (/failed to fetch|network|connection (refused|reset|closed|error)|dns|timed? ?out|timeout|econn|enotfound|unreachable|offline|tls|certificate|error sending request/i.test(t)) return "network";
  if (/\b400\b|\b422\b|invalid.?argument|invalid request|bad request|unprocessable/i.test(t)) return "invalid";
  return "unknown";
}

/** What to do after a failed model call. A different model fixes quota / missing-model / server problems; a
 *  rejected key, a too-long chat, a blocked prompt or a dead network are the same for every model, so the
 *  chain stops there instead of sending more requests. */
export function aiErrorPlan(error: unknown): "stop" | "next-model" | "without-tools" {
  const kind = classifyAiError(error);
  if (kind === "quota" || kind === "model" || kind === "server") return "next-model";
  if (kind === "invalid") return "without-tools";
  if (kind === "unknown") return /tool|function|schema|unsupported|not support/i.test(String(error)) ? "without-tools" : "next-model";
  return "stop";
}
/** Changing model cannot repair authentication, cancellation or transport failures. */
export function shouldTryAiModel(error: unknown): boolean { return aiErrorPlan(error) !== "stop"; }

type ExplainOptions = { tr: boolean; label?: string; model?: string; secrets?: string[] };
/** A short message that says what to do. Provider detail follows in brackets, with keys masked. */
export function explainAiError(error: unknown, o: ExplainOptions): string {
  if ((error as any)?.friendly) return String((error as any).message);
  const kind = classifyAiError(error), tr = o.tr;
  const who = o.label || (tr ? "Sağlayıcı" : "The provider");
  const m = o.model ? ` (${o.model})` : "";
  const text: Record<AiErrorKind, [string, string]> = {
    setup: [`${who}: model adı ya da Base URL eksik. Ayarlar › Hesaplar ve anahtarlar bölümünden tamamla.`, `${who}: the model name or Base URL is missing. Fill it in under Settings › Accounts and keys.`],
    cancelled: ["İstek iptal edildi.", "The request was cancelled."],
    auth: [`${who} anahtarı reddedildi (yetki ya da geçersiz anahtar). Ayarlar › Hesaplar ve anahtarlar'dan anahtarı kontrol et; Luna otomatik yeniden denemedi.`, `${who} rejected the key (not authorised or invalid). Check it under Settings › Accounts and keys; Luna did not retry.`],
    context: [`Konuşma${m} modelin bağlam sınırını aştı. Yeni sohbet başlat ya da yanıt ayrıntısını “Kısa” yap; sohbet geçmişin silinmedi.`, `The conversation${m} exceeds the model's context limit. Start a new chat or set the answer detail to “Brief”; your history was not deleted.`],
    blocked: [`${who} isteği engelledi (güvenlik, bölge ya da politika). Soruyu değiştirip dene ya da başka bir sağlayıcı seç.`, `${who} blocked the request (safety, region or policy). Rephrase it or pick another provider.`],
    model: [`Model ya da adres bulunamadı${m}. Ayarlar'da model adını ve varsa Base URL'yi kontrol et.`, `Model or address not found${m}. Check the model name and the Base URL, if any, in Settings.`],
    quota: [`${who} kotası ya da hız sınırı doldu. Birkaç dakika sonra tekrar dene; sürerse başka bir model ya da profil seç.`, `${who}'s quota or rate limit is used up. Try again in a few minutes; if it persists pick another model or profile.`],
    server: [`${who} şu an yanıt veremiyor (geçici sunucu sorunu). Biraz sonra yeniden dene.`, `${who} cannot answer right now (a temporary server problem). Try again shortly.`],
    network: [`${who} ile bağlantı kurulamadı (ağ, adres ya da zaman aşımı). Bağlantını ve Base URL'yi kontrol et; Luna otomatik yeniden denemedi.`, `Could not reach ${who} (network, address or timeout). Check your connection and Base URL; Luna did not retry.`],
    invalid: [`${who} isteği kabul etmedi (geçersiz istek). Bu model bazı özellikleri desteklemiyor olabilir; başka bir model dene.`, `${who} did not accept the request (invalid request). The model may not support some features; try another model.`],
    unknown: [`${who} yanıt vermedi.`, `${who} did not answer.`],
  };
  const detail = safeAiError(error, o.secrets).replace(/^(Error|TypeError): /, "").replace(/\s+/g, " ").slice(0, 140);
  const head = text[kind][tr ? 0 : 1];
  return kind === "cancelled" || !detail ? head : `${head} [${detail}]`;
}

export function withoutAssistantTools(body: Record<string, any>) {
  const { tools: _tools, toolConfig: _config, ...rest } = body;
  return { ...rest, systemInstruction: { ...body.systemInstruction, parts: [...(Array.isArray(body.systemInstruction?.parts) ? body.systemInstruction.parts : []), { text: "Tools are unavailable. Do not claim to have added, changed, saved, opened or executed anything. Do not print a tool call as text. Give information only and explain when the requested action could not be performed." }] } };
}

const isText = (x: unknown) => typeof x === "string";
const isObj = (x: unknown): x is Record<string, any> => !!x && typeof x === "object" && !Array.isArray(x);
const HOPS = ["film", "music", "books"];
/** A saved message with a field of the wrong shape loses that field, not the whole chat: the render would
 *  otherwise stop on `undefined.map`. */
export function cleanChatMessage<T extends { role: string; text: string }>(m: T): T {
  const o: any = { ...m };
  for (const k of ["ask", "undo", "note", "via", "basis"]) if (k in o && !isText(o[k])) delete o[k];
  for (const k of ["local", "pinned", "stopped"]) if (k in o && typeof o[k] !== "boolean") delete o[k];
  const list = (k: string, ok: (x: any) => boolean) => { if (!(k in o)) return; if (!Array.isArray(o[k])) { delete o[k]; return; } o[k] = o[k].filter(ok); if (!o[k].length) delete o[k]; };
  list("sources", (x) => isObj(x) && isText(x.title) && isText(x.uri));
  list("images", (x) => isObj(x) && isText(x.src) && isText(x.full));
  list("people", (x) => isObj(x) && isText(x.name));
  list("links", (x) => isObj(x) && isText(x.url) && isText(x.label));
  list("hop", (x) => HOPS.includes(x));
  list("choices", (x) => isObj(x) && Number.isFinite(x.id) && isText(x.title));
  list("libChoices", (x) => isObj(x) && isText(x.path) && isText(x.title));
  if ("act" in o && !(isObj(o.act) && isText(o.act.kind) && isText(o.act.url))) delete o.act;
  if ("film" in o && !(isObj(o.film) && Number.isFinite(o.film.id) && isText(o.film.title))) delete o.film;
  else if (isObj(o.film) && !Array.isArray(o.film.genres)) o.film = { ...o.film, genres: [], overview: isText(o.film.overview) ? o.film.overview : "" };
  if ("source" in o && !(isObj(o.source) && isText(o.source.title))) delete o.source;
  if ("song" in o && !(isObj(o.song) && isText(o.song.query) && Array.isArray(o.song.hits))) delete o.song;
  if ("book" in o && !(isObj(o.book) && isText(o.book.query) && Array.isArray(o.book.hits))) delete o.book;
  if ("page" in o && !(isObj(o.page) && isText(o.page.url) && isText(o.page.title) && Number.isFinite(o.page.at))) delete o.page;
  return o as T;
}
export function cleanChatMessages<T extends { role: string; text: string }>(raw: unknown): T[] {
  return Array.isArray(raw) ? raw.filter((m): m is T => !!m && typeof m === "object" && (m.role === "user" || m.role === "model") && typeof m.text === "string").slice(-60).map((m) => cleanChatMessage(m)) : [];
}
