import { useEffect, useRef, useState } from "react";
import { extraText, exportExtra } from "./Extras";
import { lang } from "./i18n";
import { store } from "./library";
import { invoke } from "./nativeCore";
import { parseCues, type PodCue } from "./podcastExtrasModel";
import { I, Icon } from "./Screens";

/** Subtitles of one audiobook / podcast item: the ones Luna made for it (kept as a small list per item), the files beside a local
 *  audio file, and "off". The chosen one is remembered per item; the default is the newest one made, else the best one beside the file. */
export type AudioSub = { file: string; label: string };
export type AudioSubItem = AudioSub & { cached: boolean; made: boolean };
const base = (p: string) => p.split(/[\\/]/).pop() || p;
const AUDIO_EXT = /\.(mp3|m4a|m4b|aac|ogg|oga|opus|flac|wav|wma)$/i;
const marked = new Set<string>();
/** "Whisper · Türkçe" reads better as "Türkçe · Whisper"; the file name is only in the tooltip */
const prettyLabel = (l: string) => { const m = l.match(/^(Whisper|Çeviri|Translation)\s*·\s*(.+)$/); return m ? m[2] + " · " + m[1] : l; };
const labelOf = (items: AudioSubItem[], file: string) => items.find((i) => i.file === file)?.label ?? base(file);
/** the audio screen tells which items are audio, so later subtitle attachments for them are listed */
export const markAudioSubPath = (p: string) => { marked.add(p); };

const readList = (key: string): string[] | AudioSub[] => { const v = store.json<unknown>(key, []); return Array.isArray(v) ? v : []; };
export const audioSubList = (src: string): AudioSub[] => (readList("audioSubs:" + src) as AudioSub[]).filter((x) => x && typeof x.file === "string");
const hiddenList = (src: string): string[] => (readList("audioSubHidden:" + src) as unknown[]).filter((x): x is string => typeof x === "string");

/** Called whenever a subtitle is attached for `src` (studio: created, translated, cleaned); it becomes the shown one. */
export function rememberAudioSub(src: string, file: string, label: string) {
  if (!marked.has(src) && !AUDIO_EXT.test(src.split("?")[0])) return;
  const list = audioSubList(src).filter((x) => x.file !== file);
  list.push({ file, label: label || base(file) });
  store.set("audioSubs:" + src, JSON.stringify(list.slice(-24)));
  store.set("audioSubHidden:" + src, JSON.stringify(hiddenList(src).filter((f) => f !== file)));
  store.remove("audioSubSel:" + src);
  window.dispatchEvent(new Event("luna-audio-subs"));
}

/** The subtitle shown for an audio item (the chosen one, else the newest Luna made), for the studio's other tabs. */
export function currentAudioSub(src: string): string | undefined {
  const sel = store.get("audioSubSel:" + src);
  if (sel && sel !== "off") return sel;
  return audioSubList(src).pop()?.file ?? store.get("extSub:" + src) ?? undefined;
}

/** A translation made for dual subtitles: listed, and shown under the main one (the main choice stays). */
export function addAudioSecond(src: string, file: string, label: string) {
  const list = audioSubList(src).filter((x) => x.file !== file);
  list.unshift({ file, label: label || base(file) }); // first = oldest made: the newest-made default stays the main subtitle
  store.set("audioSubs:" + src, JSON.stringify(list.slice(-24)));
  if (!store.get("audioSubSel:" + src)) { const main = audioSubList(src).filter((x) => x.file !== file).pop()?.file; if (main) store.set("audioSubSel:" + src, main); }
  store.set("audioSubSel2:" + src, file);
  window.dispatchEvent(new Event("luna-audio-subs"));
}

export function useAudioSubs(src: string, enabled: boolean) {
  const [rev, setRev] = useState(0);
  const [scan, setScan] = useState<{ entries: { file: string; exists: boolean; cached: boolean }[]; best: string | null } | null>(null);
  const [cues, setCues] = useState<PodCue[] | null>(null);
  const [cues2, setCues2] = useState<PodCue[] | null>(null);
  const bump = () => setRev((n) => n + 1);
  useEffect(() => { if (enabled) markAudioSubPath(src); }, [src, enabled]);
  useEffect(() => {
    if (!enabled) { setScan(null); return; }
    let alive = true;
    const run = () => {
      const legacy = store.get("extSub:" + src);
      const known = [...(legacy ? [legacy] : []), ...audioSubList(src).map((x) => x.file)];
      invoke<{ entries: { file: string; exists: boolean; cached: boolean }[]; best: string | null }>("audio_subs_scan", { path: src, known, lang: lang() })
        .then((r) => alive && setScan(r))
        // an older native side without the scan command: still list what Luna made for this item
        .catch(() => alive && setScan({ entries: [...new Set(known)].map((file) => ({ file, exists: true, cached: /[\\/]com\.modernplayer\.app[\\/]/i.test(file) })), best: null }));
    };
    run();
    window.addEventListener("luna-studio-closed", run);
    window.addEventListener("luna-audio-subs", run);
    return () => { alive = false; window.removeEventListener("luna-studio-closed", run); window.removeEventListener("luna-audio-subs", run); };
  }, [src, enabled, rev]);
  const list = audioSubList(src), hidden = hiddenList(src);
  const labels = new Map(list.map((x) => [x.file, x.label]));
  const order = (f: string) => list.findIndex((x) => x.file === f);
  const items: AudioSubItem[] = (scan?.entries ?? []).filter((e) => e.exists && !hidden.includes(e.file))
    .map((e) => ({ file: e.file, label: labels.get(e.file) ?? base(e.file), cached: e.cached, made: labels.has(e.file) }))
    .sort((a, b) => (a.made === b.made ? order(b.file) - order(a.file) : a.made ? -1 : 1));
  const stored = store.get("audioSubSel:" + src);
  const chosen = stored === "off" ? "off" : stored && items.some((i) => i.file === stored) ? stored : null;
  const effective = chosen ?? items.find((i) => i.made)?.file ?? (scan?.best && items.some((i) => i.file === scan.best) ? scan.best : null);
  useEffect(() => {
    if (!enabled || !effective || effective === "off") { setCues(null); return; }
    let alive = true;
    invoke<string>("subtitle_text", { file: effective })
      .then((t) => { if (alive) { const c = parseCues(t); setCues(c.length ? c : null); } }).catch(() => alive && setCues(null));
    return () => { alive = false; };
  }, [effective, enabled, rev]);
  // a second language under each line (another subtitle of the same item)
  const stored2 = store.get("audioSubSel2:" + src);
  const second = stored2 && stored2 !== effective && items.some((i) => i.file === stored2) ? stored2 : null;
  useEffect(() => {
    if (!enabled || !second) { setCues2(null); return; }
    let alive = true;
    invoke<string>("subtitle_text", { file: second })
      .then((t) => { if (alive) { const c = parseCues(t); setCues2(c.length ? c : null); } }).catch(() => alive && setCues2(null));
    return () => { alive = false; };
  }, [second, enabled, rev]);
  const setSecond = (file: string | null) => { if (file) store.set("audioSubSel2:" + src, file); else store.remove("audioSubSel2:" + src); bump(); };
  const select = (file: string) => { store.set("audioSubSel:" + src, file); bump(); };
  /** a file in Luna's cache is deleted; one beside the user's audio only after a confirmation, else it is just hidden from the list */
  /** deleteFile: also remove the file (always for Luna's own copies); a failed delete still takes it off the list */
  const remove = async (it: AudioSubItem, deleteFile: boolean) => {
    if (deleteFile) { try { await invoke("audio_sub_delete", { file: it.file, force: true }); } catch { /* already gone or not deletable: the list still forgets it */ } }
    store.set("audioSubs:" + src, JSON.stringify(audioSubList(src).filter((x) => x.file !== it.file)));
    if (store.get("extSub:" + src) === it.file) store.remove("extSub:" + src);
    if (!deleteFile) store.set("audioSubHidden:" + src, JSON.stringify([...hiddenList(src), it.file]));
    if (store.get("audioSubSel:" + src) === it.file) store.remove("audioSubSel:" + src);
    window.dispatchEvent(new Event("luna-audio-subs"));
    bump();
  };
  // how two languages show: under each line (default) or side by side
  const layout: "stack" | "side" = store.get("dualSubLayout") === "side" ? "side" : "stack";
  const setLayout = (v: "stack" | "side") => { store.set("dualSubLayout", v); bump(); };
  return { cues, cues2: cues ? cues2 : null, second, setSecond, layout, setLayout, items, effective, select, remove, off: () => select("off") };
}


/** The round button on the now-playing screen and its small list: pick, delete, regenerate, export as text. */
export function AudioSubPicker({ a, src, title }: { a: ReturnType<typeof useAudioSubs>; src: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const anchor = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!anchor.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); setOpen(false); } };
    window.addEventListener("mousedown", down);
    window.addEventListener("keydown", key, true);
    return () => { window.removeEventListener("mousedown", down); window.removeEventListener("keydown", key, true); };
  }, [open]);
  useEffect(() => setMsg(""), [open]);
  const [ask, setAsk] = useState<string | null>(null);
  const translate = () => { setOpen(false); window.dispatchEvent(new CustomEvent("luna-sub-studio", { detail: { path: src, title, tab: "translate", subFile: a.effective } })); };
  const exportText = async () => {
    const text = (a.cues ?? []).map((c) => c.text.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
    if (!text) return;
    try { setMsg((await exportExtra((title.replace(/[\\/:*?"<>|]+/g, " ").trim() || "altyazi") + ".txt", text, "txt")) ? extraText("Metin kaydedildi.", "Text saved.") : ""); }
    catch (e) { setMsg(String((e as Error)?.message ?? e)); }
  };
  const on = a.effective && a.effective !== "off" ? a.effective : null;
  return (
    <span className="lx-anchor" ref={anchor}>
      <button className={"round" + (on ? " lx-on" : "")} aria-label={extraText("Altyazı seç", "Choose subtitle")} title={extraText("Altyazı seç", "Choose subtitle")} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon d={I.subs} size={18} />
      </button>
      {open && (
        <div className="lx-pop mu-subpick" role="dialog" aria-label={extraText("Altyazılar", "Subtitles")}>
          <div className="vset-head"><h3>{extraText("Altyazılar", "Subtitles")}</h3></div>
          {a.items.length === 0 && <p className="muted small">{extraText("Bu kayıt için altyazı yok. Sesten oluşturabilirsin.", "No subtitle for this item yet. You can create one from the audio.")}</p>}
          {/* "1" = the subtitle shown, "2" = the second language under/next to it */}
          {a.items.map((it) => {
            const main = on === it.file, sec = a.second === it.file;
            return (
              <div className="mu-sp-row" key={it.file}>
                <div className={"mu-sp-item" + (main ? " on" : "")}>
                  <button className="mu-sp-pick" aria-pressed={main} title={it.file} onClick={() => a.select(it.file)}><b className="ellipsis">{prettyLabel(it.label)}</b></button>
                  {main ? <span className="mu-sp-badge one" title={extraText("Ana altyazı", "Main subtitle")}>1</span>
                    : on && <button className={"mu-sp-badge two" + (sec ? " on" : "")} aria-pressed={sec}
                      title={sec ? extraText("İkinci dili kapat", "Turn off second language") : extraText("İkinci dil olarak göster", "Show as second language")}
                      onClick={() => a.setSecond(sec ? null : it.file)}>2</button>}
                </div>
                <button className="mu-sp-x" aria-label={extraText("Sil", "Delete")} title={it.cached ? extraText("Sil", "Delete") : extraText("Listeden kaldır / dosyayı sil", "Remove from list / delete file")}
                  onClick={() => { if (it.cached) void a.remove(it, true); else setAsk(ask === it.file ? null : it.file); }}>×</button>
                {ask === it.file && <div className="mu-sp-actions">
                  <button className="lx-pill" onClick={() => { setAsk(null); void a.remove(it, true); }}>{extraText("Dosyayı sil", "Delete file")}</button>
                  <button className="lx-pill" onClick={() => { setAsk(null); void a.remove(it, false); }}>{extraText("Yalnız listeden kaldır", "Only remove from list")}</button>
                  <button className="lx-pill" onClick={() => setAsk(null)}>{extraText("Vazgeç", "Cancel")}</button>
                </div>}
              </div>
            );
          })}
          {on && <button className="mu-sp-add" onClick={translate}>+ {extraText("Başka dile çevir", "Translate to another language")}</button>}
          {on && a.second && <>
            <small className="muted mu-sp-lb">{extraText("Çifte altyazı · ", "Dual subtitles · ")}{prettyLabel(labelOf(a.items, a.second))}</small>
            <div className="mu-sp-layouts" role="group" aria-label={extraText("Görünüm", "Layout")}>
              <button className={"mu-sp-lay" + (a.layout === "stack" ? " on" : "")} aria-pressed={a.layout === "stack"} onClick={() => a.setLayout("stack")}>
                <span className="pv stack"><i /><i /></span>{extraText("Alt alta", "Stacked")}</button>
              <button className={"mu-sp-lay" + (a.layout === "side" ? " on" : "")} aria-pressed={a.layout === "side"} onClick={() => a.setLayout("side")}>
                <span className="pv side"><i /><i /></span>{extraText("Yan yana", "Side by side")}</button>
            </div>
          </>}
          <div className="mu-sp-actions">
            {a.items.length > 0 && <button className={"lx-pill mu-sp-toggle" + (on ? "" : " off")} onClick={() => (on ? a.off() : a.select(a.items[0].file))}>{on ? extraText("Kapat", "Turn off") : extraText("Aç", "Turn on")}</button>}
            <button className="lx-pill" onClick={() => { setOpen(false); window.dispatchEvent(new CustomEvent("luna-sub-studio", { detail: { path: src, title } })); }}>{a.items.length ? extraText("Yeniden oluştur", "Regenerate") : extraText("Altyazı oluştur", "Create subtitle")}</button>
            {a.items.length > 0 && <button className="lx-pill" disabled={!a.cues} onClick={() => void exportText()}>{extraText("Metin olarak dışa aktar", "Export as text")}</button>}
          </div>
          {msg && <p className="muted small" role="status">{msg}</p>}
        </div>
      )}
    </span>
  );
}
