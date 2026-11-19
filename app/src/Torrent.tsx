import { tt, DEC, pctText } from "./i18n";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "./nativeCore";
import { open } from "@tauri-apps/plugin-dialog";
import { fmtSize, store } from "./library";
import { I, Icon } from "./Screens";
import { DownloadsLibrary, type FileKind } from "./DownloadsLibrary";

export type TorrentStat = {
  id: number; name: string; state: string; error?: string | null; finished: boolean;
  /** the torrent's info hash and its biggest video file on disk (to find it again after a restart) */
  hash?: string; local?: string | null;
  progress_bytes: number; total_bytes: number; uploaded_bytes: number;
  live?: { download_speed?: { mbps: number; human_readable?: string }; upload_speed?: { mbps: number };
    snapshot?: { peer_stats?: { live?: number; seen?: number; connecting?: number } };
    time_remaining?: { human_readable?: string } | null } | null;
};
export type Added = { id: number; name: string; videoIdx: number | null; url: string | null; localPath: string | null;
  files: { idx: number; name: string; len: number }[] };

export const isTorrentSource = (s: string) => /^magnet:\?/i.test(s.trim()) || /\.torrent([?#]|$)/i.test(s.trim());

export async function downloadDir(): Promise<string> {
  return store.get("dlDir") || (await invoke<string | null>("downloads_dir")) || "C:\\";
}

/** Polls the torrent engine while anything is managed (the list is empty until the first torrent). */
export function useTorrents(active: boolean) {
  const [list, setList] = useState<TorrentStat[]>([]);
  useEffect(() => {
    if (!active) return;
    let alive = true;
    // a list that hasn't changed (finished or paused downloads) keeps the same array: a new one every second re-rendered
    // the whole app, and Keşfet's rows stuttered for 100–180 ms once a second while being dragged
    let last = "";
    const tick = () => invoke<TorrentStat[]>("torrent_list").then((l) => { const key = JSON.stringify(l); if (alive && key !== last) { last = key; setList(l); } }).catch(() => {});
    tick();
    const id = setInterval(tick, 1000);
    return () => { alive = false; clearInterval(id); };
  }, [active]);
  return list;
}

export const speed = (t?: TorrentStat) => {
  const m = t?.live?.download_speed?.mbps ?? 0;
  return m >= 1 ? m.toFixed(1).replace(".", DEC) + tt(" MB/sn") : Math.round(m * 1024) + tt(" KB/sn");
};
export const peers = (t?: TorrentStat) => t?.live?.snapshot?.peer_stats?.live ?? 0;
export const pct = (t?: TorrentStat) => (t && t.total_bytes ? (t.progress_bytes / t.total_bytes) * 100 : 0);

/** What Luna can open from a link: torrents, and anything mpv streams (http/https video, HLS, DASH, RTSP, RTMP, UDP…). */
export const isStreamLink = (s: string) => /^(https?|rtsp|rtmp|rtmps|mms|udp|rtp|srt|ftp):\/\/\S+$/i.test(s.trim());
export const isOpenableLink = (s: string) => isTorrentSource(s) || isStreamLink(s);

export function TorrentDialog({ onOpen, onClose, initial }: { onOpen: (src: string) => void; onClose: () => void; initial?: string }) {
  const [v, setV] = useState(initial ?? "");
  const [err, setErr] = useState("");
  useEffect(() => {
    // A link already on the clipboard is filled in.
    if (initial) return;
    navigator.clipboard?.readText?.().then((t) => { if (isOpenableLink(t)) setV(t.trim()); }).catch(() => {});
  }, []);
  const go = () => {
    const s = v.trim();
    if (!isOpenableLink(s)) { setErr(tt("Bu bir bağlantı değil: magnet:?…, .torrent ya da http(s)://… / rtsp://… gibi bir adres olmalı.")); return; }
    onOpen(s);
  };
  const pickFile = async () => {
    const f = await open({ multiple: false, filters: [{ name: "Torrent", extensions: ["torrent"] }] });
    if (typeof f === "string") onOpen(f);
  };
  return (
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal wide link-dialog" onKeyDown={(e) => e.stopPropagation()}>
        <h2>{tt("Bağlantı aç")}</h2>
        <p className="modal-text">{tt("VLC'deki “Ağ akışı aç” gibi:")} <b>{tt("magnet")}</b> / <b>{tt(".torrent")}</b>  {tt("bağlantısı ya da doğrudan bir video adresi (")}<b>{tt("http(s)")}</b>, <b>.m3u8</b>, <b>{tt("rtsp")}</b>{tt("…) yapıştır. Torrentler hemen oynamaya başlar, kalanı arka planda iner.")}</p>
        <div className="rm-row">
          <input value={v} autoFocus placeholder={tt("magnet:?xt=… ya da https://…/video.mp4")} aria-label={tt("Bağlantı")}
            onChange={(e) => { setV(e.target.value); setErr(""); }} onKeyDown={(e) => e.key === "Enter" && go()} />
          <button className="primary" disabled={!v.trim()} onClick={go}><Icon d={I.play} fill size={16} />  {tt("Aç")}</button>
        </div>
        {err && <div className="sub-err">{err}</div>}
        <div className="row-head" style={{ margin: 0 }}>
          <button className="ghost sm" onClick={pickFile}><Icon d={I.folder} size={18} />  {tt("Torrent dosyası seç…")}</button>
          <span className="muted small">{tt("ya da .torrent dosyasını pencereye sürükle bırak")}</span>
        </div>
        <div className="modal-actions"><button className="chip" onClick={onClose}>{tt("Kapat")}</button></div>
      </div>
    </div>
  );
}

/** Full-screen loader while a torrent is resolved and the first minutes are buffered. */
export function TorrentLoader({ phase, name, stat, onCancel }: {
  phase: "meta" | "buffer"; name: string; stat?: TorrentStat; onCancel: () => void;
}) {
  const steps = [tt("Torrent bilgileri alınıyor"), tt("Eşlere bağlanılıyor"), tt("Video hazırlanıyor")];
  const step = phase === "meta" ? 0 : peers(stat) > 0 ? 2 : 1;
  return (
    <div className="tl-bg">
      <div className="tl-box">
        <div className="tl-moon" aria-hidden="true">
          <div className="tl-ring" /><div className="tl-ring r2" />
          <svg viewBox="0 0 100 100" width="96" height="96"><defs>
            <linearGradient id="tlg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFB070" /><stop offset="1" stopColor="#E8701A" /></linearGradient>
            <mask id="tlm"><rect width="100" height="100" fill="#fff" /><circle cx="64" cy="38" r="30" fill="#000" /></mask></defs>
            <circle cx="50" cy="50" r="30" fill="url(#tlg)" mask="url(#tlm)" /></svg>
        </div>
        <div className="tl-name ellipsis">{name || "Torrent"}</div>
        <div className="tl-steps">
          {steps.map((s, i) => (
            <div key={s} className={"tl-step" + (i < step ? " done" : i === step ? " now" : "")}>
              <span className="tl-dot" />{s}{i === step && <span className="tl-dots"><i>.</i><i>.</i><i>.</i></span>}
            </div>
          ))}
        </div>
        {stat && (
          <div className="tl-stats">
            <span>{peers(stat)}  {tt("eş")}</span><span>{speed(stat)}</span><span>{pctText(pct(stat).toFixed(1).replace(".", DEC))}</span>
          </div>
        )}
        <button className="ghost sm" onClick={onCancel}>{tt("Vazgeç")}</button>
      </div>
    </div>
  );
}

/** list: keep the files · files: delete files, keep the title in the library (re-downloadable) · all: delete everything. */
export type RemoveMode = "list" | "files" | "all";
type DlProps = {
  list: TorrentStat[]; onPlay: (id: number) => void;
  /** before the engine removes it (stop playing it, so its files can be deleted) */
  onRemoving?: (id: number) => void;
  /** after the engine removed it: the library follows */
  onRemoved?: (id: number, mode: RemoveMode) => void;
};

const SEEN = "dlSeenDone";
const dlKey = (t: TorrentStat) => t.hash || t.name;
/** The home screen's downloads: a finished one shows there until the home screen has been left once (it stays on the Downloads page). */
export const homeDownloads = (list: TorrentStat[]) => {
  const seen = new Set(store.json<string[]>(SEEN, []));
  return list.filter((t) => !t.finished || !seen.has(dlKey(t)));
};
/** Marks the finished downloads as seen on the home screen. */
function markSeen(list: TorrentStat[]) {
  const done = list.filter((t) => t.finished).map(dlKey);
  if (!done.length) return;
  const seen = store.json<string[]>(SEEN, []);
  const add = done.filter((k) => !seen.includes(k));
  if (add.length) store.set(SEEN, JSON.stringify([...add, ...seen].slice(0, 300)));
}

/** A download the Chrome add-on started (YouTube video, music or a whole list), as the "yt-download" event reports it. */
export type WebDl = { id: string; title: string; percent: number; state: "run" | "done" | "error"; file?: string | null; error?: string | null; kind: string; item?: [number, number] | null };
type WebProps = { web?: WebDl[]; onWebPlay?: (file: string) => void; onWebRemove?: (id: string) => void };

/** The one Downloads page (the same from Film, Müzik and Kitap): what is still downloading on top, then everything
 *  Luna has downloaded, filtered to the part it was opened from. */
export function Downloads(p: DlProps & WebProps & { start?: FileKind | "all"; onOpenBook: (path: string) => void }) {
  const running = (p.web ?? []).filter((d) => d.state === "run").length, finished = (p.web ?? []).filter((d) => d.state === "done").length;
  // torrents are films and series: their section shows from Film, or anywhere once there is one
  const torrents = !p.start || p.start === "all" || p.start === "video" || p.list.length > 0;
  return <div className="page"><WebDownloads list={p.web ?? []} onPlay={p.onWebPlay} onRemove={p.onWebRemove} />
    {torrents && <DownloadsSection {...p} />}
    <DownloadsLibrary start={p.start} refreshKey={running * 1000 + finished + p.list.filter((t) => t.finished).length * 7} torrentFiles={p.list.filter((t) => t.finished && t.local).map((t) => t.local!)} onPlay={(f) => p.onWebPlay?.(f)} onOpenBook={p.onOpenBook} /></div>;
}

/** Add-on downloads: progress while running; a finished file plays (a finished list opens its folder). */
function WebDownloads({ list, onPlay, onRemove }: { list: WebDl[]; onPlay?: (file: string) => void; onRemove?: (id: string) => void }) {
  if (!list.length) return null;
  return (
    <section className="row">
      <h2>{tt("Web indirmeleri")} <span className="muted small">{list.length}</span></h2>
      <div className="dl-list">
        {list.map((d) => {
          const folder = !!d.file && !/\.[a-z0-9]{2,4}$/i.test(d.file);
          // a download from before the file name was read correctly has no path: open its folder instead
          const sub = d.kind === "audio" ? "Luna Müzik" : "Luna Video";
          // find it by its title (yt-dlp's safe file name keeps only plain letters and digits of the title)
          const findAndPlay = async () => {
            const dir = store.get("dlDir") || await invoke<string | null>("downloads_dir").catch(() => null);
            if (!dir) return;
            const key = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
            const want = key(d.title);
            const where = dir.replace(/[\\/]$/, "") + "\\" + sub;
            // list_dir lists only videos; sound files come from the music scan
            const files = d.kind === "audio"
              ? (await invoke<{ path: string }[]>("music_scan", { folders: [where] }).catch(() => [])).map((t) => ({ name: t.path.split(/[\\/]/).pop() ?? "", path: t.path, is_dir: false }))
              : await invoke<{ name: string; path: string; is_dir: boolean }[]>("list_dir", { path: where }).catch(() => []);
            const hit = want && files.find((f) => !f.is_dir && key(f.name.replace(/\s*\[[^\]]+\]\.[a-z0-9]+$/i, "")) === want);
            if (hit) onPlay?.(hit.path);
          };
          const open = () => { if (!d.file) { if (d.state === "done") void findAndPlay(); return; } if (folder) void invoke("reveal_file", { path: d.file }).catch(() => {}); else onPlay?.(d.file); };
          return (
            <div key={d.id} className="dl-row">
              <div className="dl-main">
                <button className="dl-name ellipsis" disabled={!d.file && d.state !== "done"} title={folder ? tt("Klasörde göster") : tt("Oynat")} onClick={open}>{d.title || d.file?.split(/[\\/]/).pop()}</button>
                <div className="dl-bar"><div style={{ width: (d.state === "error" ? 0 : Math.min(100, d.percent)) + "%" }} className={d.state === "done" ? "done" : ""} /></div>
                <div className="muted small">
                  {d.state === "error" ? <span className="dl-err">{tt("Hata:")} {d.error}</span>
                    : d.state === "done" ? tt("Tamamlandı") + (d.kind === "audio" ? " · " + tt("Müzik") : " · " + tt("Video"))
                    : (d.item ? tt("{0}/{1} · ", d.item[0], d.item[1]) : "") + "%" + d.percent.toFixed(0)}
                </div>
              </div>
              {d.file && <button className="round" aria-label={tt("Klasörde göster")} title={tt("Klasörde göster")} onClick={() => void invoke("reveal_file", { path: d.file }).catch(() => {})}><Icon d={I.folder} size={17} /></button>}
              {d.state !== "run" && <button className="round" aria-label={tt("Listeden kaldır")} title={tt("Listeden kaldır")} onClick={() => onRemove?.(d.id)}><Icon d={I.x} size={18} /></button>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** The torrent list with play / pause / remove (also shown on the home screen). */
export function DownloadsSection({ list, onPlay, onRemoving, onRemoved, home }: DlProps & { home?: boolean }) {
  const [confirm, setConfirm] = useState<TorrentStat | null>(null);
  // on the home screen, what finished counts as seen once the user leaves it
  const shown = useRef(list); shown.current = list;
  useEffect(() => { if (home) return () => markSeen(shown.current); }, [home]);
  const [err, setErr] = useState("");
  const remove = async (t: TorrentStat, mode: RemoveMode) => {
    setConfirm(null);
    setErr("");
    onRemoving?.(t.id);
    try {
      await invoke("torrent_remove", { id: t.id, deleteFiles: mode !== "list" });
    } catch (e) {
      setErr(tt("Silinemedi: ") + String(e));
      return;
    }
    onRemoved?.(t.id, mode);
  };
  const rank = (t: TorrentStat) => t.finished ? 3 : t.error ? 2 : t.state === "paused" ? 1 : 0;
  return (
    <>
      <section className="row">
        <h2>{tt("İndirmeler")} <span className="muted small">{list.length}</span></h2>
        {err && <div className="plugin-msg small err">{err}</div>}
        {!list.length && <div className="muted empty-note downloads-empty"><Icon d={I.down} size={24}/><p>{tt("Henüz torrent yok. Üstteki mıknatıs butonuyla magnet linki ya da torrent dosyası açabilirsin.")}</p></div>}
        <div className="dl-list">
          {/* what is downloading now on top, then paused ones, finished ones last (newest first in each) */}
          {[...list].sort((a, b) => rank(a) - rank(b) || b.id - a.id).map((t) => {
            const p = pct(t);
            const paused = t.state === "paused";
            return (
              <div key={t.id} className="dl-row">
                <div className="dl-main">
                  <button className="dl-name ellipsis" title={tt("Oynat")} onClick={() => onPlay(t.id)}>{t.name || "Torrent #" + t.id}</button>
                  <div className="dl-bar"><div style={{ width: p + "%" }} className={t.finished ? "done" : ""} /></div>
                  <div className="muted small">
                    {t.error ? <span className="dl-err">{tt("Hata:")} {t.error}</span> : t.finished ? tt("Tamamlandı · {0}", fmtSize(t.total_bytes)) :
                      paused ? tt("Duraklatıldı · %{0}", p.toFixed(1)) :
                      tt("%{0} · {1} / {2} · {3} · {4} eş", p.toFixed(1), fmtSize(t.progress_bytes), fmtSize(t.total_bytes), speed(t), peers(t)) +
                      (t.live?.time_remaining?.human_readable ? tt(" · kalan {0}", t.live.time_remaining.human_readable) : "")}
                  </div>
                </div>
                {!t.finished && <button className="round" aria-label={paused ? tt("Devam ettir") : tt("Duraklat")} title={paused ? tt("Devam ettir") : tt("Duraklat")}
                  onClick={() => invoke("torrent_pause", { id: t.id, pause: !paused })}>
                  <Icon d={paused ? I.play : I.pause} fill size={16} />
                </button>}
                <button className="round" aria-label={tt("Kaldır")} title={tt("Kaldır")} onClick={() => setConfirm(t)}><Icon d={I.x} size={18} /></button>
              </div>
            );
          })}
        </div>
      </section>
      {/* on body: inside the scrolled home page the dialog sat far below the middle */}
      {confirm && createPortal(
        <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && setConfirm(null)}>
          <div className="modal">
            <h2>{tt("Torrent kaldırılsın mı?")}</h2>
            <p className="modal-text ellipsis">{confirm.name}</p>
            <p className="muted small">{tt("“Sadece dosyaları sil” derseniz film kütüphanede soluk siyah-beyaz kalır; detaylarından tekrar indirebilirsin.")}</p>
            <div className="modal-actions stack">
              <button className="chip" onClick={() => setConfirm(null)}>{tt("Vazgeç")}</button>
              <button className="ghost sm" onClick={() => remove(confirm, "list")} title={tt("İndirilen dosyalar diskte kalır")}>{tt("Sadece listeden kaldır")}</button>
              <button className="ghost sm" onClick={() => remove(confirm, "files")} title={tt("Film kütüphanede soluk görünür, istediğinde yeniden indirilir")}>{tt("Sadece dosyaları sil")}</button>
              <button className="primary danger" onClick={() => remove(confirm, "all")} title={tt("Dosyalar silinir, film kütüphaneden de kalkar")}>{tt("Her şeyi sil")}</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

/** Download block on a details page for a torrent title that isn't on disk. */
export function DownloadPanel({ pending, stat, onDownload, onCancel, label, hideIdle }: {
  /** a film: the main button says İndir, so the idle block is not shown */
  hideIdle?: boolean;
  /** what isn't here, e.g. one episode of a series ("Bu film bilgisayarında yok" by default) */
  label?: string; pending: boolean; stat?: TorrentStat; onDownload: () => void; onCancel: (id: number) => void;
}) {
  const [ask, setAsk] = useState(false);
  if (!pending && !stat) {
    if (hideIdle) return null;
    return (
      <div className="dlp idle">
        <span className="dlp-off">{label ?? tt("Bu film bilgisayarında yok")}</span>
        <button className="ghost" onClick={onDownload}><Icon d={I.down} size={18} />  {tt("İndir")}</button>
      </div>
    );
  }
  if (!stat) {
    return (
      <div className="dlp">
        <div className="dlp-head"><span className="dlp-spin" />  {tt("Torrent bilgileri alınıyor, eşler aranıyor…")}</div>
        <div className="dlp-bar indet"><div /></div>
      </div>
    );
  }
  const p = pct(stat);
  const paused = stat.state === "paused";
  if (stat.finished) {
    return <div className="dlp done"><Icon d={I.check} size={18} />  {tt("İndirildi ·")} {fmtSize(stat.total_bytes)}</div>;
  }
  return (
    <div className="dlp">
      <div className="dlp-head">
        {!paused && <span className="dlp-spin" />}
        <b>{paused ? tt("Duraklatıldı") : tt("İndiriliyor")}</b>
        <span className="dlp-pct">{pctText(p.toFixed(1).replace(".", DEC))}</span>
        <span className="grow" />
        <button className="round" aria-label={paused ? tt("Devam ettir") : tt("Duraklat")} title={paused ? tt("Devam ettir") : tt("Duraklat")}
          onClick={() => invoke("torrent_pause", { id: stat.id, pause: !paused })}>
          <Icon d={paused ? I.play : I.pause} fill size={14} />
        </button>
        <button className="round" aria-label={tt("İptal")} title={tt("İndirmeyi iptal et")} onClick={() => setAsk(true)}>
          <Icon d={I.x} size={14} />
        </button>
      </div>
      {ask && (
        <div className="dlp-ask">
          <span>{tt("İndirme iptal edilsin ve inen kısım silinsin mi? Film kütüphanede kalır.")}</span>
          <button className="chip" onClick={() => setAsk(false)}>{tt("Vazgeç")}</button>
          <button className="primary danger sm" onClick={() => { setAsk(false); onCancel(stat.id); }}>{tt("İptal et")}</button>
        </div>
      )}
      <div className={"dlp-bar" + (paused ? " paused" : "")}><div style={{ width: p + "%" }} /></div>
      <div className="muted small">
        {fmtSize(stat.progress_bytes)} / {fmtSize(stat.total_bytes)}
        {!paused && tt(" · {0} · {1} eş", speed(stat), peers(stat))}
        {!paused && stat.live?.time_remaining?.human_readable ? tt(" · kalan {0}", stat.live.time_remaining.human_readable) : ""}
      </div>
    </div>
  );
}
