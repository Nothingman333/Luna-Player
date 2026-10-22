import { invoke } from "@tauri-apps/api/core";
import { aiProfiles, AiUse, captureAiUse, otherAi, useOfProfile } from "./ai";
import { lang, tt } from "./i18n";
import { store } from "./library";
import { SLASH } from "./Slash";
import { cleanCommands, compareMarkdown, CompareResult, expandCommand, parseCommandDef, UserCommand } from "./userCommandsModel";

// ---------- the user's own commands ("/özet3 …") ----------
export const loadUserCommands = (): UserCommand[] => cleanCommands(store.json<unknown>("userCommands", []));
export const saveUserCommands = (l: UserCommand[]) => store.set("userCommands", JSON.stringify(cleanCommands(l)));
const reserved = () => ["komut", "karsilastir", ...SLASH.flatMap((c) => [c.cmd, ...c.alias])];

/** The prompt a typed user command stands for, or null when the text is not one of them. */
export const expandUserCommand = (text: string, selection = ""): string | null => expandCommand(text, loadUserCommands(), selection);

/** Adds (or replaces) a command; the error text when it cannot be added. */
export function addUserCommand(name: string, prompt: string): string | null {
  const def = parseCommandDef(name + " = " + prompt, reserved());
  if (typeof def === "string") {
    return def === "name" ? tt("Komut adı harf, rakam, - veya _ içermeli (en fazla 24 karakter).")
      : def === "reserved" ? tt("Bu ad Luna’nın kendi komutlarından birine ait; başka bir ad seç.")
      : def === "prompt" ? tt("Komutun metni boş olamaz (en fazla 2000 karakter).") : tt("Biçim: /komut ekle ad = istem metni");
  }
  saveUserCommands([...loadUserCommands().filter((c) => c.name !== def.name), def]);
  return null;
}

/** "/komut", "/komut ekle ad = istem", "/komut sil ad": what Luna answers in the chat. */
export function userCommandsReply(arg: string): string {
  const [verb, ...rest] = arg.trim().split(/\s+/);
  const tail = arg.trim().slice((verb ?? "").length).trim();
  const v = (verb ?? "").toLocaleLowerCase("tr");
  if (v === "ekle" || v === "add") {
    const at = tail.indexOf("=");
    const err = at < 0 ? tt("Biçim: /komut ekle ad = istem metni") : addUserCommand(tail.slice(0, at), tail.slice(at + 1));
    if (err) return err;
    const name = tail.slice(0, at).trim().replace(/^\/+/, "").toLocaleLowerCase("tr");
    return tt("“/{0}” komutu kaydedildi. Kullanmak için /{0} ve ardından metni yaz.", name);
  }
  if (v === "sil" || v === "delete" || v === "remove") {
    const name = (rest[0] ?? "").replace(/^\/+/, "").toLocaleLowerCase("tr");
    const all = loadUserCommands();
    if (!all.some((c) => c.name === name)) return tt("“/{0}” adlı bir komutun yok.", name);
    saveUserCommands(all.filter((c) => c.name !== name));
    return tt("“/{0}” komutu silindi.", name);
  }
  const all = loadUserCommands();
  const how = tt("Yeni komut: /komut ekle ad = istem metni  (metnin gireceği yere {metin} yaz; Web bölümünde seçili metin için {seçim}). Silmek için: /komut sil ad.");
  return all.length ? tt("Komutların:") + "\n" + all.map((c) => `- **/${c.name}**: ${c.prompt.replace(/\s+/g, " ").slice(0, 90)}`).join("\n") + "\n\n" + how : tt("Henüz kendi komutun yok.") + "\n\n" + how;
}

// ---------- the same question to several models ----------
/** The assistant's own AI plus every other saved API profile that has a key, at most four. */
export function comparisonUses(): AiUse[] {
  const active = captureAiUse();
  const chosen = store.get("aiProfile") ?? "";
  const out: AiUse[] = active.key || active.provider === "custom" ? [active] : [];
  for (const p of aiProfiles()) {
    if (String(p.slot) === chosen) continue;
    const u = useOfProfile(p);
    if (u.key) out.push(u);
  }
  return out.slice(0, 4);
}

async function askOnce(use: AiUse, question: string): Promise<string> {
  const body = {
    systemInstruction: { parts: [{ text: (lang() === "tr" ? "Türkçe, " : "In English, ") + "kısa ve net cevap ver (en fazla yaklaşık 200 kelime). / Answer briefly and clearly (about 200 words at most)." }] },
    contents: [{ role: "user", parts: [{ text: question }] }],
    generationConfig: { temperature: 0.5, maxOutputTokens: 1500 },
  };
  const res = use.provider === "gemini" ? await invoke<any>("gemini", { key: use.key, model: use.model, body }) : (await otherAi(body, use)).r;
  return (res?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? "").join("").trim();
}

/** Asks every model at once and returns one markdown answer with a section per model. */
export async function compareModels(question: string): Promise<string> {
  const uses = comparisonUses();
  if (uses.length < 2) return tt("Karşılaştırmak için en az iki yapay zekâ gerekli. Ayarlar › Hesaplar ve anahtarlar bölümünde ikinci bir API profili kaydet; ilk profil de anahtarlı olmalı.");
  const results: CompareResult[] = await Promise.all(uses.map(async (u) => {
    const t0 = Date.now();
    try { return { label: u.label, model: u.model, text: await askOnce(u, question), ms: Date.now() - t0 }; }
    catch (e) { return { label: u.label, model: u.model, error: String((e as Error)?.message ?? e), ms: Date.now() - t0 }; }
  }));
  return compareMarkdown(question, results, { took: tt("{0} sn"), failed: tt("Hata") });
}
