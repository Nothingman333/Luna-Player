/**
 * Settings › General additions of the subtitle studio: what the player skips by itself (intros and
 * recaps from chapters or series marks) and a diagnostics report to copy into a bug report (no
 * keys, no user name in paths). SponsorBlock and the sound profiles live in PlaybackExtras.
 */
import { tt, lang } from "./i18n";
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { store } from "./library";
import { aiName, aiReady, captureAiUse } from "./ai";
import { SegKind } from "./segmentModel";
import { aniskipOn } from "./aniskip";
import { VERSION_LABEL } from "./version";
import * as S from "./studioBridge";

export type AutoSkip = Partial<Record<SegKind, boolean>>;
export const autoSkip = (): AutoSkip => { const v = store.json<AutoSkip>("autoSkip", {}); return v && typeof v === "object" ? v : {}; };
export const setAutoSkip = (k: SegKind, on: boolean) => store.set("autoSkip", JSON.stringify({ ...autoSkip(), [k]: on }));

const KINDS: [SegKind, string][] = [
  ["intro", tt("İntrolar")], ["recap", tt("Önceki bölüm özetleri")], ["preview", tt("Gelecek bölüm fragmanları")], ["credits", tt("Kapanış jenerikleri")],
];

export function StudioSettings() {
  const [, bump] = useState(0);
  const skip = autoSkip();
  return (
    <div className="set-card">
      <div className="field">
        <span>{tt("Atlama")}</span>
        <div className="set-hint">{tt("Videonun bölüm adlarından (Intro, Opening, Recap, Credits…) ya da bir dizi için işaretlediğin intro süresinden bulunan kısımlarda \"İntroyu atla\" düğmesi çıkar (kısayol: I). İşaretlediklerin kendiliğinden atlanır.")}</div>
        {KINDS.map(([k, l]) => (
          <label key={k} className="look-check">
            <input type="checkbox" checked={!!skip[k]} onChange={(e) => { setAutoSkip(k, e.target.checked); bump((n) => n + 1); }} />
            {tt("Kendiliğinden atla: {0}", l)}
          </label>
        ))}
        <label className="look-check" title={tt("Dizinin adı, bölüm numarası ve bölümün uzunluğu AniList ve AniSkip'e gönderilir.")}>
          <input type="checkbox" checked={aniskipOn()} onChange={(e) => { store.set("aniskip", e.target.checked ? "1" : "0"); bump((n) => n + 1); }} />
          {tt("Anime için açılış ve kapanış sürelerini topluluk verisinden bul (AniSkip)")}
        </label>
        <div className="set-hint">{tt("Yalnızca animasyon türündeki dizilerin 1. sezonu ve adında sezon yazan sonraki sezonlar için; süresi dosyanla uyuşmayan veri kullanılmaz. Senin işaretlediğin ya da bölüm adından bulunan kısım varsa o geçerli olur.")}</div>
      </div>
    </div>
  );
}

// ---------- diagnostics ----------
const redact = (s: string) => s.replace(/[A-Za-z]:\\Users\\[^\\/]+/gi, "%USERPROFILE%").replace(/\/(home|Users)\/[^/]+/g, "~");

export async function diagnosticsText(): Promise<string> {
  const lines: string[] = [`Luna Player ${VERSION_LABEL} · UI ${lang()} · ${navigator.userAgent}`];
  try {
    const c = await invoke<any>("system_check");
    lines.push(`mpv: ${c.mpv ? "ok" : "MISSING"} · Vulkan: ${c.vulkan ? "ok" : "missing"} · WebView2: ${c.webview ?? "?"} · Lossless Scaling: ${c.lossless ? "found" : "no"}`);
    lines.push(`GPU: ${(c.gpus ?? []).join(" | ") || "?"}`);
  } catch (e) { lines.push("system_check failed: " + String(e)); }
  try {
    const w = await S.whisperStatus();
    lines.push(`Whisper engines: ${w.engines.map(redact).join(" | ") || "none"}`);
    lines.push(`Whisper models: ${w.models.map((m) => `${m.name} (${Math.round(m.size / 1e6)} MB)`).join(", ") || "none"}`);
  } catch (e) { lines.push("whisper_status failed: " + String(e)); }
  lines.push(`Anime4K shaders: ${(await S.loadShaders()).length}`);
  const use = captureAiUse();
  lines.push(`Assistant AI: ${aiReady() ? `${aiName()} · ${use.provider} · ${use.model}` : "not set"} (keys are never included)`);
  let bytes = 0;
  try { for (const k of Object.keys(localStorage)) bytes += (localStorage.getItem(k) ?? "").length * 2; lines.push(`Storage: ${Object.keys(localStorage).length} keys, ~${Math.round(bytes / 1024)} KB`); } catch {}
  const at = (k: string) => { const n = Number(store.get(k) ?? 0); return n > 0 ? new Date(n).toISOString() : "never"; };
  lines.push(`Backup: manual ${at("backupAt")} · automatic ${store.get("autoBackupEvery") ?? "off"} ${at("autoBackupAt")}${store.get("autoBackupErr") ? " · last error: " + redact(store.get("autoBackupErr") ?? "") : ""}`);
  lines.push(`Auto-skip: ${JSON.stringify(autoSkip())}`);
  return lines.join("\n");
}

export function DiagnosticsCard() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const make = async () => {
    setBusy(true); setCopied(false);
    try {
      const t = await diagnosticsText();
      setText(t);
      await navigator.clipboard.writeText(t).then(() => setCopied(true), () => {});
    } finally { setBusy(false); }
  };
  return (
    <div className="set-card">
      <div className="field">
        <span>{tt("Tanılama raporu")}</span>
        <div className="set-hint">{tt("Hata bildirirken eklemen için sürüm, mpv/Vulkan durumu, Whisper ve shader kurulumu, seçili yapay zekâ servisi ve depolama boyutu. API anahtarları ve kullanıcı adın rapora girmez.")}</div>
        <div className="backup-row">
          <button className="chip" disabled={busy} onClick={make}>{busy ? tt("Hazırlanıyor…") : tt("Raporu oluştur ve kopyala")}</button>
          {copied && <span className="muted small">{tt("Panoya kopyalandı")}</span>}
        </div>
        {text && <textarea className="diag-text" readOnly value={text} rows={8} aria-label={tt("Tanılama raporu")} />}
      </div>
    </div>
  );
}
