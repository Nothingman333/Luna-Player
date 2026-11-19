import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "./nativeCore";
import { fmtSize, store } from "./library";
import { I, Icon } from "./Screens";
import { extraText as t } from "./Extras";
import { lang } from "./i18n";

/** A file inside one of Luna's own download folders (from the native downloads_inventory command). */
type Entry = { path: string; name: string; size: number; modified: number };
export type FileKind = "video" | "music" | "book" | "other";
type Filter = "all" | FileKind;
type Sort = "new" | "size" | "name";

const EXT: Record<Exclude<FileKind, "other">, string[]> = {
  video: ["mkv", "mp4", "avi", "mov", "webm", "m4v", "wmv", "ts", "flv"],
  music: ["mp3", "m4a", "opus", "ogg", "aac", "flac", "wav", "m4b", "wma"],
  book: ["epub", "pdf", "cbz", "cbr", "mobi", "azw3", "fb2"],
};
export const fileKind = (path: string): FileKind => {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return (Object.keys(EXT) as (keyof typeof EXT)[]).find((k) => EXT[k].includes(ext)) ?? "other";
};
const KIND_ICON: Record<FileKind, string> = { video: I.film, music: "M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm12-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0z", book: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5zM20 17v4H6.5", other: "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6" };
const kindLabel = (k: Filter) => ({ all: t("Tümü", "All"), video: t("Video", "Video"), music: t("Müzik", "Music"), book: t("Kitap", "Books"), other: t("Diğer", "Other") })[k];

/** Luna's own download folders: the add-on/yt-dlp video and music folders and the books folder. */
async function lunaFolders(torrentFiles: string[]): Promise<{ dirs: string[]; files: string[] }> {
  const dl = (store.get("dlDir") || await invoke<string | null>("downloads_dir").catch(() => null) || "").replace(/[\\/]+$/, "");
  const books = await invoke<string | null>("books_default_dir").catch(() => null);
  const dirs = [...(dl ? [dl + "\\Luna Video", dl + "\\Luna Müzik"] : []), ...(books ? [books] : [])], files: string[] = [];
  // torrents save straight into the download folder: a one-file torrent is that file, a many-file one its own folder
  const low = dl.toLowerCase();
  for (const f of torrentFiles) {
    const parent = f.replace(/[\\/][^\\/]*$/, "").toLowerCase();
    if (dl && parent !== low && parent.startsWith(low + "\\")) {
      const top = dl + "\\" + f.slice(dl.length + 1).split(/[\\/]/)[0];
      if (!dirs.some((d) => d.toLowerCase() === top.toLowerCase())) dirs.push(top);
    } else files.push(f);
  }
  return { dirs: dirs.slice(0, 16), files };
}

/**
 * Everything Luna downloaded, in one list: filter by kind, search, sort by date / size / name, open, show in the
 * folder, and delete one or many at once (to the Recycle Bin, so a mistake can be undone there).
 * Torrents keep their own section above (pausing, and their own "remove" choices).
 */
export function DownloadsLibrary({ start = "all", refreshKey = 0, torrentFiles = [], onPlay, onOpenBook }: {
  start?: Filter; refreshKey?: number;
  /** finished torrents' main files: listed too (they sit in the download folder itself) */
  torrentFiles?: string[];
  onPlay: (path: string) => void; onOpenBook: (path: string) => void;
}) {
  const [rows, setRows] = useState<Entry[] | null>(null), [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>(start), [sort, setSort] = useState<Sort>("new"), [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set()), [ask, setAsk] = useState<Entry[] | null>(null), [busy, setBusy] = useState(false);
  useEffect(() => setFilter(start), [start]);
  const torrentKey = torrentFiles.join("\n");
  const load = useCallback(async () => {
    try { const { dirs, files } = await lunaFolders(torrentKey ? torrentKey.split("\n") : []); const got = await invoke<Entry[] | null>("downloads_inventory", { dirs, files }); setRows(Array.isArray(got) ? got : []); setError(""); }
    catch (e) { setRows([]); setError(String(e)); }
  }, [torrentKey]);
  useEffect(() => { void load(); }, [load, refreshKey]);
  const all = rows ?? [];
  const shown = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    const list = all.filter((e) => (filter === "all" || fileKind(e.path) === filter) && (!q || e.name.toLocaleLowerCase().includes(q)));
    return list.sort((a, b) => sort === "size" ? b.size - a.size : sort === "name" ? a.name.localeCompare(b.name) : b.modified - a.modified);
  }, [all, filter, sort, query]);
  const total = all.reduce((s, e) => s + e.size, 0);
  const counts = useMemo(() => { const c: Record<Filter, number> = { all: all.length, video: 0, music: 0, book: 0, other: 0 }; for (const e of all) c[fileKind(e.path)]++; return c; }, [all]);
  const pickedRows = shown.filter((e) => picked.has(e.path));
  const toggle = (p: string) => setPicked((s) => { const n = new Set(s); if (n.has(p)) n.delete(p); else n.add(p); return n; });
  const open = (e: Entry) => fileKind(e.path) === "book" ? onOpenBook(e.path) : onPlay(e.path);
  const remove = async (list: Entry[]) => {
    setBusy(true); setError("");
    const failed: string[] = [];
    for (const e of list) { try { await invoke("delete_file", { path: e.path }); } catch (err) { failed.push(e.name + ": " + String(err)); } }
    setBusy(false); setAsk(null); setPicked(new Set());
    if (failed.length) setError(t("Silinemeyenler: ", "Could not delete: ") + failed.join(" · "));
    void load();
  };
  const date = (s: number) => s ? new Date(s * 1000).toLocaleDateString(lang() === "tr" ? "tr-TR" : "en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
  const askBytes = (ask ?? []).reduce((s, e) => s + e.size, 0);
  return (
    <section className="row dl-library">
      <div className="dl-lib-head">
        <h2>{t("Luna'nın indirdikleri", "Downloaded by Luna")}</h2>
        <span className="dl-lib-total">{rows ? t(`${fmtSize(total)} · ${all.length} dosya`, `${fmtSize(total)} · ${all.length} files`) : t("Taranıyor…", "Scanning…")}</span>
      </div>
      <div className="dl-lib-tools">
        <div className="seg-row" role="tablist" aria-label={t("Türe göre süz", "Filter by kind")}>
          {(["all", "video", "music", "book", "other"] as Filter[]).filter((k) => k === "all" || counts[k] > 0 || filter === k).map((k) =>
            <button key={k} role="tab" aria-selected={filter === k} className={"chip" + (filter === k ? " on" : "")} onClick={() => { setFilter(k); setPicked(new Set()); }}>{kindLabel(k)} <span className="muted">{counts[k]}</span></button>)}
        </div>
        <input className="dl-lib-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("İndirilenlerde ara", "Search downloads")} aria-label={t("İndirilenlerde ara", "Search downloads")} />
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label={t("Sıralama", "Sort")}>
          <option value="new">{t("En yeni", "Newest")}</option><option value="size">{t("En büyük", "Largest")}</option><option value="name">{t("Ada göre", "By name")}</option>
        </select>
      </div>
      {pickedRows.length > 0 && <div className="dl-lib-bulk" role="status">
        <span>{t(`${pickedRows.length} seçili · ${fmtSize(pickedRows.reduce((s, e) => s + e.size, 0))}`, `${pickedRows.length} selected · ${fmtSize(pickedRows.reduce((s, e) => s + e.size, 0))}`)}</span>
        <button className="chip" onClick={() => setPicked(new Set())}>{t("Seçimi kaldır", "Clear selection")}</button>
        <button className="primary danger sm" onClick={() => setAsk(pickedRows)}>{t("Seçilenleri sil", "Delete selected")}</button>
      </div>}
      {error && <div className="plugin-msg small err" role="alert">{error}</div>}
      {rows && !shown.length && <div className="muted empty-note downloads-empty"><Icon d={I.down} size={24} /><p>{all.length ? t("Bu süzgeçte dosya yok.", "No files match this filter.") : t("Luna henüz bir şey indirmedi. Web'den video, müzik ya da kitap indirdiğinde hepsi burada toplanır.", "Luna hasn't downloaded anything yet. Videos, music and books you download from the web all gather here.")}</p></div>}
      <div className="dl-list">
        {shown.map((e) => {
          const k = fileKind(e.path), on = picked.has(e.path);
          return (
            <div key={e.path} className={"dl-row dl-file" + (on ? " on" : "")}>
              <input type="checkbox" checked={on} onChange={() => toggle(e.path)} aria-label={t(`${e.name} seç`, `Select ${e.name}`)} />
              <span className={"dl-kind -" + k} aria-hidden="true"><Icon d={KIND_ICON[k]} size={16} /></span>
              <div className="dl-main">
                <button className="dl-name ellipsis" title={k === "other" ? t("Klasörde göster", "Show in folder") : t("Aç", "Open")} onClick={() => k === "other" ? void invoke("reveal_file", { path: e.path }).catch(() => {}) : open(e)}>{e.name}</button>
                <div className="muted small dl-meta">{fmtSize(e.size)} · {date(e.modified)} · {kindLabel(k)}</div>
              </div>
              <button className="round" aria-label={t("Klasörde göster", "Show in folder")} title={t("Klasörde göster", "Show in folder")} onClick={() => void invoke("reveal_file", { path: e.path }).catch(() => {})}><Icon d={I.folder} size={17} /></button>
              <button className="round" aria-label={t("Sil", "Delete")} title={t("Sil (Geri Dönüşüm Kutusu'na)", "Delete (to the Recycle Bin)")} onClick={() => setAsk([e])}><Icon d={I.x} size={18} /></button>
            </div>
          );
        })}
      </div>
      {ask && createPortal(
        <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && !busy && setAsk(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label={t("Silinsin mi?", "Delete?")}>
            <h2>{ask.length === 1 ? t("Bu dosya silinsin mi?", "Delete this file?") : t(`${ask.length} dosya silinsin mi?`, `Delete ${ask.length} files?`)}</h2>
            <p className="modal-text ellipsis">{ask.length === 1 ? ask[0].name : fmtSize(askBytes)}</p>
            <p className="muted small">{t("Dosyalar Geri Dönüşüm Kutusu'na taşınır; yanlışlıkla sildiysen oradan geri alabilirsin. Kütüphanedeki kaydı yerinde kalır, dosyası yok diye görünür.", "The files go to the Recycle Bin, so you can restore them from there. Their library entries stay and show as missing.")}</p>
            <div className="modal-actions">
              <button className="chip" disabled={busy} onClick={() => setAsk(null)}>{t("Vazgeç", "Cancel")}</button>
              <button className="primary danger" disabled={busy} onClick={() => void remove(ask)}>{busy ? t("Siliniyor…", "Deleting…") : t(`Sil · ${fmtSize(askBytes)}`, `Delete · ${fmtSize(askBytes)}`)}</button>
            </div>
          </div>
        </div>, document.body)}
    </section>
  );
}
