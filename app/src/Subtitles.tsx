import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { parseName, store } from "./library";

export type SubHit = {
  fileId: number; language: string; release: string; fileName: string; downloads: number; rating: number;
  hashMatch: boolean; hearingImpaired: boolean; machineTranslated: boolean; aiTranslated: boolean;
  fps: number; uploader: string;
};

const LANG_NAMES: Record<string, string> = {
  tr: "Türkçe", en: "İngilizce", de: "Almanca", fr: "Fransızca", es: "İspanyolca", it: "İtalyanca",
  ru: "Rusça", ar: "Arapça", "pt-br": "Portekizce (BR)", "pt-pt": "Portekizce", nl: "Hollandaca",
  pl: "Lehçe", ja: "Japonca", ko: "Korece", "zh-cn": "Çince", el: "Yunanca", az: "Azerice", fa: "Farsça",
};
const SUB_EXT = ["srt", "ass", "ssa", "vtt", "sub"];

/** Searches OpenSubtitles as soon as it opens; pick a result or load a file from disk. */
export function SubtitleDialog({ path, onAttach, onClose }: {
  path: string; onAttach: (file: string, label: string) => void; onClose: () => void;
}) {
  const [key, setKey] = useState(store.get("osKey") ?? "");
  const [keyDraft, setKeyDraft] = useState("");
  const [langs, setLangs] = useState(store.get("langs") ?? "tr,en,de");
  const [hits, setHits] = useState<SubHit[] | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [filter, setFilter] = useState<string>("tr");

  const parsed = useMemo(() => parseName(path), [path]);
  const title = store.json<Record<string, { title?: string; year?: string } | null>>("meta", {});
  const metaTitle = Object.entries(title).find(([k]) => k.startsWith(parsed.kind + ":" + parsed.title.toLowerCase()))?.[1];

  const run = (k = key, l = langs) => {
    if (!k) return;
    setErr("");
    setHits(null);
    invoke<SubHit[]>("search_subtitles", {
      path, apiKey: k, langs: l,
      query: {
        title: metaTitle?.title ?? parsed.title,
        year: parsed.year ?? (metaTitle?.year ? Number(metaTitle.year) : undefined),
        season: parsed.season, episode: parsed.episode,
      },
    }).then(setHits).catch((e) => { setErr(String(e)); setHits([]); });
  };
  useEffect(() => { run(); }, []);

  const saveKey = () => {
    const k = keyDraft.trim();
    if (!k) return;
    store.set("osKey", k);
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
    const f = await open({ multiple: false, filters: [{ name: "Altyazı", extensions: SUB_EXT }] });
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
          <h2>Altyazı ekle</h2>
          <span className="grow" />
          <button className="ghost sm" onClick={fromDisk}>Bilgisayardan yükle…</button>
        </div>
        <div className="muted small ellipsis">{path.split(/[\\/]/).pop()}</div>

        {!key ? (
          <div className="sub-key">
            <p>İnternetten aramak için bir kere OpenSubtitles API anahtarını gir.
              <br /><span className="muted small">opensubtitles.com › üye ol › opensubtitles.com/consumers › New Consumer › API Key</span></p>
            <div className="rm-row">
              <input value={keyDraft} placeholder="API anahtarı" aria-label="OpenSubtitles API anahtarı" autoFocus
                onChange={(e) => setKeyDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveKey()} />
              <button className="primary" disabled={!keyDraft.trim()} onClick={saveKey}>Kaydet ve ara</button>
            </div>
          </div>
        ) : (
          <>
            <div className="seg-row">
              <button className={"seg" + (effective === "all" ? " on" : "")} onClick={() => setFilter("all")}>
                Hepsi {hits ? `(${hits.length})` : ""}
              </button>
              {shownLangs.map((l) => (
                <button key={l} className={"seg" + (effective === l ? " on" : "")} onClick={() => setFilter(l)}>
                  {LANG_NAMES[l] ?? l.toUpperCase()} ({hits!.filter((h) => h.language === l).length})
                </button>
              ))}
              <span className="grow" />
              <select className="lang-select" value={langs} aria-label="Aranacak diller"
                onChange={(e) => { setLangs(e.target.value); run(key, e.target.value); }}>
                <option value="tr,en,de">Türkçe + İngilizce + Almanca</option>
                <option value="tr,en">Türkçe + İngilizce</option>
                <option value="tr">Sadece Türkçe</option>
                <option value="en">Sadece İngilizce</option>
                <option value="de">Sadece Almanca</option>
                <option value="tr,en,de,fr,es,it,ru,ar">Birçok dil</option>
              </select>
            </div>
            {err && <div className="sub-err">{err}</div>}
            <div className="sub-list">
              {hits === null && <div className="sub-loading"><span className="spinner" /> OpenSubtitles'ta aranıyor…</div>}
              {hits && !list.length && !err && <div className="muted">Altyazı bulunamadı. Bilgisayardan yükleyebilirsin.</div>}
              {list.map((h) => (
                <button key={h.fileId} className="sub-row" disabled={busy !== null} onClick={() => pick(h)}>
                  <span className="sub-lang">{(h.language || "?").toUpperCase()}</span>
                  <span className="sub-main">
                    <span className="sub-rel ellipsis">{h.release || h.fileName || "İsimsiz"}</span>
                    <span className="sub-tags">
                      {h.hashMatch && <span className="tag good">Bu dosyaya tam uyuyor</span>}
                      {h.hearingImpaired && <span className="tag">İşitme engelli</span>}
                      {(h.machineTranslated || h.aiTranslated) && <span className="tag warn">Makine çevirisi</span>}
                      {h.fps > 0 && <span className="tag">{h.fps} fps</span>}
                      <span className="muted small">{h.downloads.toLocaleString("tr")} indirme{h.uploader ? ` · ${h.uploader}` : ""}</span>
                    </span>
                  </span>
                  <span className="sub-act">{busy === h.fileId ? <span className="spinner" /> : "Ekle"}</span>
                </button>
              ))}
            </div>
          </>
        )}
        <div className="modal-actions"><button className="chip" onClick={onClose}>Kapat</button></div>
      </div>
    </div>
  );
}
