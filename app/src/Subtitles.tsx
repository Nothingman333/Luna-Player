import { defaultSubLangs, lang, locale, tt } from "./i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { groupKey, parseName, store, flushSecrets } from "./library";

export type SubHit = {
  fileId: number; language: string; release: string; fileName: string; downloads: number; rating: number;
  hashMatch: boolean; hearingImpaired: boolean; machineTranslated: boolean; aiTranslated: boolean;
  fps: number; uploader: string;
};

const LANG_NAMES: Record<string, string> = {
  tr: tt("Türkçe"), en: tt("İngilizce"), de: tt("Almanca"), fr: tt("Fransızca"), es: tt("İspanyolca"), it: tt("İtalyanca"),
  ru: tt("Rusça"), ar: tt("Arapça"), "pt-br": tt("Portekizce (BR)"), "pt-pt": tt("Portekizce"), nl: tt("Hollandaca"),
  pl: tt("Lehçe"), ja: tt("Japonca"), ko: tt("Korece"), "zh-cn": tt("Çince"), el: tt("Yunanca"), az: tt("Azerice"), fa: tt("Farsça"),
};
const SUB_EXT = ["srt", "ass", "ssa", "vtt", "sub"];

/** Searches OpenSubtitles as soon as it opens; pick a result or load a file from disk. */
export function SubtitleDialog({ path, onAttach, onClose, onWhisper }: {
  path: string; onAttach: (file: string, label: string) => void; onClose: () => void;
  /** opens the subtitle studio to make one from the audio (Whisper) */
  onWhisper?: () => void;
}) {
  const [key, setKey] = useState(store.get("osKey") ?? "");
  const [keyDraft, setKeyDraft] = useState("");
  const [langs, setLangs] = useState(store.get("langs") ?? defaultSubLangs());
  const [hits, setHits] = useState<SubHit[] | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [filter, setFilter] = useState<string>(lang());

  const parsed = useMemo(() => parseName(path), [path]);
  const title = store.json<Record<string, { title?: string; year?: string } | null>>("meta", {});
  const metaTitle = title[groupKey(parsed)] ?? undefined;

  const runId = useRef(0);
  const run = (k = key, l = langs) => {
    if (!k) return;
    const my = ++runId.current;
    setErr("");
    setHits(null);
    invoke<SubHit[]>("search_subtitles", {
      path, apiKey: k, langs: l,
      query: {
        title: metaTitle?.title ?? parsed.title,
        year: parsed.year ?? (metaTitle?.year ? Number(metaTitle.year) : undefined),
        season: parsed.season, episode: parsed.episode,
      },
    }).then((h) => my === runId.current && setHits(h)).catch((e) => { if (my === runId.current) { setErr(String(e)); setHits([]); } });
  };
  useEffect(() => { run(); }, []);

  const saveKey = async () => {
    const k = keyDraft.trim();
    if (!k) return;
    store.set("osKey", k);
    try { await flushSecrets(); } catch (e) { setErr(String(e)); return; }
    setKey(k);
    run(k);
  };
  const pick = async (h: SubHit) => {
    setBusy(h.fileId);
    setErr("");
    try {
      const file = await invoke<string>("download_subtitle", { path, apiKey: key, fileId: h.fileId, language: h.language });
      onAttach(file, LANG_NAMES[h.language] ?? h.language.toUpperCase());
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(null);
    }
  };
  const fromDisk = async () => {
    const f = await open({ multiple: false, filters: [{ name: tt("Altyazı"), extensions: SUB_EXT }] });
    if (typeof f === "string") onAttach(f, f.split(/[\\/]/).pop()!);
  };

  const shownLangs = [...new Set((hits ?? []).map((h) => h.language))];
  // Turkish is selected by default; fall back to all results when there is no Turkish one.
  const effective = filter !== "all" && !(hits ?? []).some((h) => h.language === filter) ? "all" : filter;
  const list = (hits ?? []).filter((h) => effective === "all" || h.language === effective);

  return (
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal wide subdlg" onKeyDown={(e) => e.stopPropagation()}>
        <div className="row-head" style={{ margin: 0 }}>
          <h2>{tt("Altyazı ekle")}</h2>
          <span className="grow" />
          {onWhisper && <button className="ghost sm" onClick={onWhisper} title={tt("Konuşmayı bilgisayarında yazıya döker (whisper.cpp)")}>{tt("Sesten oluştur…")}</button>}
          <button className="ghost sm" onClick={fromDisk}>{tt("Bilgisayardan yükle…")}</button>
        </div>
        <div className="muted small ellipsis">{path.split(/[\\/]/).pop()}</div>

        {!key ? (
          <div className="sub-key">
            <p>{tt("İnternetten aramak için bir kere OpenSubtitles API anahtarını gir.")}
              <br /><span className="muted small">{tt("opensubtitles.com › üye ol › opensubtitles.com/consumers › New Consumer › API Key")}</span></p>
            <div className="rm-row">
              <input value={keyDraft} placeholder={tt("API anahtarı")} aria-label={tt("OpenSubtitles API anahtarı")} autoFocus
                onChange={(e) => setKeyDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveKey()} />
              <button className="primary" disabled={!keyDraft.trim()} onClick={saveKey}>{tt("Kaydet ve ara")}</button>
            </div>
          </div>
        ) : (
          <>
            <div className="seg-row">
              <button className={"seg" + (effective === "all" ? " on" : "")} onClick={() => setFilter("all")}>
                
                {tt("Hepsi")} {hits ? `(${hits.length})` : ""}
              </button>
              {shownLangs.map((l) => (
                <button key={l} className={"seg" + (effective === l ? " on" : "")} onClick={() => setFilter(l)}>
                  {LANG_NAMES[l] ?? l.toUpperCase()} ({hits!.filter((h) => h.language === l).length})
                </button>
              ))}
              <span className="grow" />
              <select className="lang-select" value={langs} aria-label={tt("Aranacak diller")}
                onChange={(e) => { setLangs(e.target.value); run(key, e.target.value); }}>
                <option value="tr,en,de">{tt("Türkçe + İngilizce + Almanca")}</option>
                <option value="tr,en">{tt("Türkçe + İngilizce")}</option>
                <option value="tr">{tt("Sadece Türkçe")}</option>
                <option value="en">{tt("Sadece İngilizce")}</option>
                <option value="de">{tt("Sadece Almanca")}</option>
                <option value="tr,en,de,fr,es,it,ru,ar">{tt("Birçok dil")}</option>
              </select>
            </div>
            {err && <div className="sub-err">{err}</div>}
            <div className="sub-list">
              {hits === null && <div className="sub-loading"><span className="spinner" />  {tt("OpenSubtitles'ta aranıyor…")}</div>}
              {hits && !list.length && !err && <div className="muted">{onWhisper ? tt("Altyazı bulunamadı. Bilgisayardan yükleyebilir ya da Sesten oluştur ile Whisper'a yazdırabilirsin.") : tt("Altyazı bulunamadı. Bilgisayardan yükleyebilirsin.")}</div>}
              {list.map((h) => (
                <button key={h.fileId} className="sub-row" disabled={busy !== null} onClick={() => pick(h)}>
                  <span className="sub-lang">{(h.language || "?").toUpperCase()}</span>
                  <span className="sub-main">
                    <span className="sub-rel ellipsis">{h.release || h.fileName || tt("İsimsiz")}</span>
                    <span className="sub-tags">
                      {h.hashMatch && <span className="tag good">{tt("Bu dosyaya tam uyuyor")}</span>}
                      {h.hearingImpaired && <span className="tag">{tt("İşitme engelli")}</span>}
                      {(h.machineTranslated || h.aiTranslated) && <span className="tag warn">{tt("Makine çevirisi")}</span>}
                      {h.fps > 0 && <span className="tag">{h.fps}  {tt("fps")}</span>}
                      <span className="muted small">{h.downloads.toLocaleString(locale())}  {tt("indirme")}{h.uploader ? ` · ${h.uploader}` : ""}</span>
                    </span>
                  </span>
                  <span className="sub-act">{busy === h.fileId ? <span className="spinner" /> : tt("Ekle")}</span>
                </button>
              ))}
            </div>
          </>
        )}
        <div className="modal-actions"><button className="chip" onClick={onClose}>{tt("Kapat")}</button></div>
      </div>
    </div>
  );
}
