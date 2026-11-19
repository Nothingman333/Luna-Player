import { LOCAL_TRANSLATION_LANGUAGES, localTranslateRows } from "./localWebTranslation";
import type { BrowserPage } from "./browserModel";
import { invoke, isTauri } from "./nativeCore";

export const TRANSLATION_LANGUAGES = Object.keys(LOCAL_TRANSLATION_LANGUAGES);
export type TranslationRow = { id: number; text: string };
export type TranslationSummary = { applied: number; skipped: number; truncated?: boolean };
let translator: ((target: string) => Promise<TranslationSummary>) | null = null;
export type BrowserReadOptions={provider?:string;videoSummary?:boolean};
let reader: ((options?:BrowserReadOptions) => Promise<BrowserPage>) | null = null;
export function registerBrowserReader(handler: typeof reader) { reader = handler; }
export async function readActiveBrowserPage(options?:BrowserReadOptions): Promise<BrowserPage | undefined> { return reader ? reader(options) : undefined; }
export function registerBrowserTranslator(handler: typeof translator) { translator = handler; }
export async function translateActiveBrowser(target: string) {
  if (!translator) throw new Error("Önce Web bölümünde bir sayfa aç.");
  return translator(target);
}
export function translationIntent(text: string, fallback = "Türkçe"): string | null {
  const q = text.toLocaleLowerCase("tr").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i");
  // Only a short, plain command changes the page. A question about it ("is the translation right?",
  // "who is the original author?"), a refusal ("do not translate") or a request for something else is not one.
  if (q.length > 160 || q.trim().split(/\s+/).length > 18) return null;
  if (/\b(cevirme\w*|tercume etme\w*|do not translate|don'?t translate|dont translate|stop translat\w*|without translat\w*|no translation)\b/.test(q)) return null;
  if (/^\s*(does|do|is|are|was|were|how|why|what|which|where|who|when|neden|niye|nicin|nasil|hangi|kim|kac|nerede)\b/.test(q)) return null;
  if (/\b(ozet\w*|summar\w*|anlat\w*|acikla\w*|explain)\b/.test(q)) return null;
  const words = q.trim().split(/\s+/).length, page = /\b(sayfa\w*|site\w*|page|pages|website|makale\w*|article)\b/.test(q);
  if(/\b(?:donme|donmeyin|gosterme|gostermeyin|geri alma)\b/.test(q))return null;
  const restore = /\b(?:orijinal|ozgun)\w*\s+(?:hal|dil|metin|sayfa|don|goster)\w*|\b(?:sayfayi|ceviriyi|ceviri)\s+geri\s+al|\bceviri\w*\s+(?:kaldir|iptal)\w*|\b(?:show|restore|revert to|switch to|go back to|return to)\s+(?:the\s+)?original\s+(?:page|text|language|version|content|website|site|article)\b|\b(?:show|restore)\s+(?:the\s+)?original\s*(?:please|now)?[.!]*\s*$|\b(?:undo|remove|cancel|revert)\s+(?:the\s+)?translat\w*/.test(q);
  if (restore && (page || words <= 6)) return "restore";
  const translate = /\bcevir(?:ir\s+misin(?:iz)?|ebilir\s+misin(?:iz)?|ebilirsin(?:iz)?|ebilir|sene|sen|elim|in)?\b|\btercume\s+et\w*|\bceviri\w*\s+(?:yap|et|baslat|goster)\w*|\btranslate\b/.test(q);
  if (!translate || !page) return null;
  const targets: [RegExp, string][] = [[/turkce|turkish/, "Türkçe"], [/ingiliz|english/, "English"], [/almanca|german|deutsch/, "Deutsch"], [/fransiz|french/, "Français"], [/ispanyol|spanish/, "Español"], [/italyan|italian/, "Italiano"], [/japon|japanese/, "日本語"], [/korece|korean/, "한국어"], [/arapca|arabic/, "العربية"], [/rusca|russian/, "Русский"]];
  // "from German into English" / "İngilizceden Türkçeye": the language to leave is not the target.
  const wanted = targets.filter(([re]) => { const m = re.exec(q); if (!m) return false; const before = q.slice(0, m.index), after = q.slice(m.index + m[0].length); return !(/\bfrom\s+$/.test(before) || /^\w*(?:den|dan|ten|tan)\b/.test(after)); });
  if(!wanted.length&&/\b(?:into|to)\s+[a-z]+|\b[a-z]+(?:ceye|caya)\b/.test(q))return null;
  return wanted[0]?.[1] ?? fallback;
}
export function translationBatches(rows: TranslationRow[]) {
  const batches: TranslationRow[][] = []; let current: TranslationRow[] = [], size = 0;
  for (const row of rows) {
    if (current.length && size + row.text.length > 4500) { batches.push(current); current = []; size = 0; }
    current.push(row); size += row.text.length;
  }
  if (current.length) batches.push(current);
  return batches;
}
export function validateTranslationResult(raw: unknown, rows: TranslationRow[]): TranslationRow[] {
  const list = (raw as { translations?: unknown })?.translations;
  if (!Array.isArray(list) || list.length !== rows.length) throw new Error("Model eksik çeviri döndürdü; sayfa değiştirilmedi.");
  const expected = new Set(rows.map(r => r.id)), seen = new Set<number>();
  let size = 0;
  return list.map(r => {
    if (!r || !Number.isInteger(r.id) || !expected.has(r.id) || seen.has(r.id) || typeof r.text !== "string" || !r.text.trim() || r.text.length > 6000)
      throw new Error("Model geçersiz çeviri döndürdü; sayfa değiştirilmedi.");
    size += r.text.length; if (size > 100000) throw new Error("Çeviri yanıtı çok büyük.");
    seen.add(r.id); return { id: r.id, text: r.text };
  });
}
/** Google trims each row and returns punctuation-only rows empty; keep the page's own spacing around links and,
 *  for rows with nothing to translate, the original text. */
export function keepSpacing(original:string,translated:unknown):string{
  const text=typeof translated==="string"?translated.trim():"";
  if(!text)return original;
  return (original.match(/^\s*/)?.[0]||"")+text+(original.match(/\s*$/)?.[0]||"");
}
export async function translateRows(rows: TranslationRow[], target: string, source='en', progress?:(text:string)=>void): Promise<TranslationRow[]> {
  // Like Chrome: Google Translate does the work and detects each row's language; offline, the local model takes over.
  const code=(LOCAL_TRANSLATION_LANGUAGES as Record<string,string>)[target]||target;
  let translated:TranslationRow[];
  try{
    if(!isTauri())throw Error("no native");
    const texts=await invoke<string[]>("web_translate",{texts:rows.map(r=>r.text),target:code});
    translated=rows.map((r,i)=>({id:r.id,text:keepSpacing(r.text,texts[i])}));
  }catch{
    if(!(source in LOCAL_TRANSLATION_LANGUAGES))throw new Error("Google Çeviri'ye ulaşılamadı ve bu sayfanın dili yerel çeviride yok.");
    translated=await localTranslateRows(rows,target,source,progress);
  }
  return validateTranslationResult({translations:translated},rows);
}

/** Explicitly a selected-text request, never the whole-page translation intent. */
export function selectionTranslatePrompt(language:string):string{const target=TRANSLATION_LANGUAGES.includes(language)?language:"English";return `Translate only the selected text into ${target}. Yalnız seçili metni çevir; sayfanın tamamını çevirme.`;}
