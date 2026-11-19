import { defaultSubLangs, lang, locale, tt } from "./i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "./nativeCore";
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
  const title = store.json<Record<string, { title?: string; year?: string; id?: number; kind?: string } | null>>("meta", {});
  const metaTitle = title[groupKey(parsed)] ?? undefined;

  const [searchTitle,setSearchTitle]=useState(metaTitle?.title ?? parsed.title);
  const [searchedTitle,setSearchedTitle]=useState(metaTitle?.title ?? parsed.title);
  const [manual,setManual]=useState(false);
  const runId = useRef(0);
  // a text selection dragged out of the dialog ends on the backdrop: only a click that also started there closes
  const downOnBg = useRef(false);
  const run = (k = key, l = langs, name = searchedTitle, byName = manual) => {
    if (!k) return;
    const my = ++runId.current;
    setErr("");
    setSearchedTitle(name);setManual(byName);
    setHits(null);
    invoke<SubHit[]>("search_subtitles", {
      path, apiKey: k, langs: l,
      query: {
        title: name.trim() || metaTitle?.title || parsed.title,
        manual: byName,
        tmdbId: byName ? undefined : metaTitle?.id, tv: metaTitle?.kind === "tv",
        year: byName ? undefined : parsed.year ?? (metaTitle?.year ? Number(metaTitle.year) : undefined),
        season: byName ? undefined : parsed.season, episode: byName ? undefined : parsed.episode,
      },
    }).then((h) => my === runId.current && setHits(h)).catch((e) => { if (my === runId.current) { setErr(String(e)); setHits([]); } });
  };
  useEffect(() => { run(); return()=>{runId.current++;}; }, []);

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
    <div className="modal-bg" onMouseDown={(e) => { downOnBg.current = e.target === e.currentTarget; }} onClick={(e) => { if (downOnBg.current && e.target === e.currentTarget) onClose(); downOnBg.current = false; }}>
      <div className="modal wide subdlg" onKeyDown={(e) => e.stopPropagation()}>
        <div className="row-head" style={{ margin: 0 }}>
          <h2>{tt("Altyazı ekle")}</h2>
          <span className="grow" />
          {onWhisper && <button className="primary sm studio-launch" onClick={onWhisper} title={tt("Konuşmayı bilgisayarında yazıya döker (whisper.cpp)")}>{tt("Altyazı stüdyosu")}</button>}
          <button className="ghost sm" onClick={fromDisk}>{tt("Bilgisayardan yükle…")}</button>
        </div>
        <div className="muted small ellipsis">{path.split(/[\\/]/).pop()}</div>

        {key && <form className="sub-search-form" onSubmit={e=>{e.preventDefault();if(searchTitle.trim())run(key,langs,searchTitle,true);}}><label>{tt("Eser adıyla ara")}<input value={searchTitle} maxLength={200} onChange={e=>setSearchTitle(e.target.value)} aria-label={tt("Altyazı aranacak eser adı")} /></label><button className="chip" disabled={!searchTitle.trim() || busy!==null}>{tt("İsimle ara")}</button><button type="button" className="chip" disabled={busy!==null} onClick={()=>{const title=metaTitle?.title??parsed.title;setSearchTitle(title);run(key,langs,title,false);}}>{tt("Dosyayla eşleştir")}</button></form>}
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
            {manual && <div className="muted small">{tt("İsimle arama: {0} · dosya eşleştirmesi kullanılmadı", searchedTitle)}</div>}
            {hits && hits.length>0 && !hits.some(h=>h.hashMatch) && <div className="muted small">{tt("Tam dosya eşleşmesi yok. Eser adını ve bölümü kontrol et; gerekirse isimle yeniden ara.")}</div>}
            {err && <div className="sub-err">{err}</div>}
            {hits && !hits.length && !err && onWhisper && <div className="sub-studio-offer" role="status"><b>{tt("Uyumlu altyazı bulunamadı")}</b><span>{tt("Konuşmayı bilgisayarında yazıya dökelim.")}</span><button className="primary sm" onClick={onWhisper}>{tt("Altyazı stüdyosunu aç")}</button></div>}
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
