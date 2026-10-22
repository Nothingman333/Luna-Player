/** Pure helpers for the user's own assistant commands ("/özet3 …") and the model comparison answer.
 *  No imports: the regression script loads this file as it is. */

export type UserCommand = { name: string; prompt: string };

/** A command name as stored: without the slash, lower case, letters (Turkish ones too), digits, - and _. */
export function commandName(raw: string): string | null {
  const n = String(raw ?? "").trim().replace(/^\/+/, "").toLocaleLowerCase("tr");
  return /^[\p{L}\p{N}_-]{1,24}$/u.test(n) ? n : null;
}

/** "/komut ekle özet3 = Bunu üç maddede özetle: {metin}" → the command, or an error key. */
export function parseCommandDef(arg: string, reserved: string[]): UserCommand | "format" | "name" | "reserved" | "prompt" {
  const at = String(arg ?? "").indexOf("=");
  if (at < 0) return "format";
  const name = commandName(arg.slice(0, at));
  if (!name) return "name";
  if (reserved.map((r) => r.replace(/^\//, "").toLocaleLowerCase("tr")).includes(name)) return "reserved";
  const prompt = arg.slice(at + 1).trim();
  if (!prompt || prompt.length > 2000) return "prompt";
  return { name, prompt };
}

/** The prompt a typed "/name rest" stands for: {metin}/{text} takes the rest, {seçim}/{selection} the selected text;
 *  without a {metin} place the rest is added at the end. Null when no command of that name exists. */
export function expandCommand(text: string, commands: UserCommand[], selection = ""): string | null {
  const t = String(text ?? "").trim();
  if (!t.startsWith("/")) return null;
  const word = t.split(/\s+/)[0];
  const name = commandName(word);
  const c = name ? commands.find((x) => x.name === name) : undefined;
  if (!c) return null;
  const rest = t.slice(word.length).trim();
  let out = c.prompt;
  const hasText = /\{(metin|text)\}/i.test(out);
  out = out.replace(/\{(metin|text)\}/gi, rest).replace(/\{(seçim|secim|selection)\}/gi, selection.trim());
  if (!hasText && rest) out = out + "\n\n" + rest;
  return out.trim();
}

/** Commands kept valid and unique (the last one with a name wins), at most 40. */
export function cleanCommands(raw: unknown): UserCommand[] {
  const list: any[] = Array.isArray(raw) ? raw : [];
  const map = new Map<string, UserCommand>();
  for (const x of list) {
    const name = commandName(x?.name);
    const prompt = String(x?.prompt ?? "").trim();
    if (name && prompt && prompt.length <= 2000) { map.delete(name); map.set(name, { name, prompt }); }
  }
  return [...map.values()].slice(-40);
}

export type CompareResult = { label: string; model: string; text?: string; error?: string; ms: number };
/** The comparison as one markdown answer: a section per model, its time and its answer (or what went wrong). */
export function compareMarkdown(question: string, results: CompareResult[], labels: { took: string; failed: string }): string {
  const head = "> " + question.replace(/\s+/g, " ").trim().slice(0, 300);
  const parts = results.map((r) => {
    const title = `**${r.label}** · ${r.model} · ${labels.took.replace("{0}", (r.ms / 1000).toFixed(1))}`;
    return title + "\n\n" + (r.error ? `_${labels.failed}: ${r.error.slice(0, 300)}_` : (r.text ?? "").trim() || "—");
  });
  return [head, ...parts].join("\n\n---\n\n");
}
