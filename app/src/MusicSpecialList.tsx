// "Beğendiklerim" and "İndirilenler" open as the same full list page as a playlist (cover, play, shuffle, search, rows),
// but they are built from the likes / the downloads folder, so they can't be renamed, reordered or deleted.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { DlBadge, Cover, downloadedSongs, hoverSong, loadLikes, NOTE, playQueue, QItem, setShuffle, SHUFFLE, songActions, SongVote, toggleLike, toggleMusicPause, useMusic } from "./Music";
import { tt } from "./i18n";
import { fmtTime } from "./mpv";
import { matchesSearch, playingRowIndex, searchFold } from "./musicModel";
import { invoke } from "./nativeCore";
import { I, Icon, MenuEntry, openMenu } from "./Screens";

export type SpecialList = "__liked" | "__downloaded";
export const isSpecialList = (id: string): id is SpecialList => id === "__liked" || id === "__downloaded";
const HEART = "M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.1 5.3 3 1.7-1.9 3.2-3 5.3-3 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z";

export function SpecialListPage({ id, onClose }: { id: SpecialList; onClose: () => void }) {
  const m = useMusic();
  const liked = id === "__liked";
  const [items, setItems] = useState<QItem[] | null>(liked ? null : null);
  const [q, setQ] = useState("");
  // the likes change as songs are liked; the downloads are read from disk once
  const likes = liked ? loadLikes().filter((x) => !x.q.podcast).map((x) => x.q) : null;
  useEffect(() => { if (liked) return; let on = true; void downloadedSongs().then((s) => { if (on) setItems(s); }); return () => { on = false; }; }, [liked]);
  useEffect(() => {
    document.body.classList.add("pl-open");
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" && !(e.target instanceof HTMLInputElement)) { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", k, true);
    return () => { document.body.classList.remove("pl-open"); window.removeEventListener("keydown", k, true); };
  }, []);
  const list = likes ?? items ?? [];
  const name = liked ? tt("Beğendiklerim") : tt("İndirilenler");
  const total = list.reduce((n, t) => n + (t.duration || 0), 0);
  const hours = Math.floor(total / 3600), mins = Math.round((total % 3600) / 60);
  const ours = !!m.now && m.from === id;
  const playing = ours && !m.paused;
  const needle = searchFold(q);
  const shown = list.map((t, i) => ({ t, i })).filter(({ t }) => matchesSearch(needle, t.title, t.artist, t.album));
  const nowAt = playingRowIndex(list, m.now, m.index, ours, m.shuffle);
  const playAt = (i: number) => { if (i === nowAt) { toggleMusicPause(); return; } playQueue(list, i, false, id); };
  const extra = (t: QItem): MenuEntry[] => liked
    ? [{ label: tt("Beğendiklerimden çıkar"), danger: true, act: () => toggleLike(t) }]
    : [{ label: tt("Klasörde göster"), act: () => void invoke("reveal_file", { path: t.src }).catch(() => {}) }];
  return createPortal(
    <>
      <div className="chat-scrim" onMouseDown={onClose} />
      <div className="pl-page pl-card glass page-anim" role="dialog" aria-modal="true" aria-label={name}>
        <div className="pl-bg-clip"><div className="pl-bg" style={list[0]?.cover ? { backgroundImage: `url(${list[0].cover})` } : undefined} /></div>
        <header className="pl-top">
          <button className="round" aria-label={tt("Geri")} onClick={onClose}><Icon d={I.left} /></button>
        </header>
        <section className="pl-head">
          <div className={"mu-special-art " + (liked ? "mu-liked-card" : "mu-dl-card")} style={{ width: 224, height: 224, borderRadius: 16 }}>
            <Icon d={liked ? HEART : I.down} size={84} fill={liked} />
          </div>
          <div className="pl-head-txt">
            <span className="eyebrow">{tt("LİSTE")}</span>
            <h1>{name}</h1>
            <span className="muted pl-meta">{[tt("{0} şarkı", list.length), total ? (hours ? tt("{0} sa {1} dk", hours, mins) : tt("{0} dk", mins)) : ""].filter(Boolean).join(" · ")}</span>
          </div>
        </section>
        <div className="pl-bar">
          <button className="pl-big" aria-label={playing ? tt("Duraklat") : tt("Çal")} disabled={!list.length} onClick={() => (ours ? toggleMusicPause() : playQueue(list, 0, false, id))}>
            <Icon d={playing ? I.pause : I.play} fill size={26} /></button>
          <button className={"act" + (ours && m.shuffle ? " on" : "")} data-tip={tt("Karışık çal")} aria-label={tt("Karışık çal")} disabled={!list.length}
            onClick={() => (ours ? setShuffle(!m.shuffle) : playQueue(list, 0, true, id))}><Icon d={SHUFFLE} size={20} /></button>
          <span className="grow" />
          <label className="pl-search"><Icon d={I.search} size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tt("Listede ara")} /></label>
        </div>
        <div className="pl-table">
          <div className="pl-row pl-th"><span>#</span><span>{tt("Başlık")}</span><span className="pl-alb">{tt("Albüm")}</span><span /><span className="pl-dur"><Icon d="M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" size={15} /></span><span /></div>
          {shown.map(({ t, i }) => {
            const cur = i === nowAt;
            return (
              <div key={t.src + i} aria-current={cur ? "true" : undefined} className={"pl-row" + (cur ? " cur" : "")} {...hoverSong(t)}
                onClick={(e) => { if ((e.target as HTMLElement).closest("button")) return; playAt(i); }}
                onContextMenu={(e) => openMenu(e, songActions(t, () => playQueue(list, i, false, id), extra(t)))}>
                <button className="pl-n" aria-label={cur && !m.paused ? tt("Duraklat") : tt("Çal")} onClick={() => playAt(i)}>
                  <span className="pl-num">{cur && m.loading ? <span className="mu-spin sm" aria-label={tt("Yükleniyor…")} /> : i + 1}</span>
                  <span className="pl-hover"><Icon d={cur && !m.paused ? I.pause : I.play} fill size={14} /></span>
                </button>
                <span className="pl-title">
                  <Cover src={t.cover} name={t.title} size={42} radius={6} icon={NOTE} />
                  <span className="mu-song-t"><b className="ellipsis">{t.title}</b><span className="muted small ellipsis"><DlBadge q={t} />{t.artist}</span></span>
                </span>
                <span className="pl-alb muted small ellipsis">{t.album ?? ""}</span>
                <SongVote q={t} />
                <span className="pl-dur muted small">{t.duration ? fmtTime(t.duration) : ""}</span>
                <span />
              </div>
            );
          })}
          {items === null && !liked ? <div className="muted empty-note">{tt("Yükleniyor…")}</div>
            : !shown.length && <div className="muted empty-note">{needle ? tt("Bu aramayla şarkı yok") : liked ? tt("Henüz beğendiğin şarkı yok") : tt("Henüz indirilen şarkı yok. YouTube'da Luna düğmesi › İndir › Müzik ile şarkı indirebilirsin.")}</div>}
        </div>
      </div>
    </>,
    document.querySelector(".root") ?? document.body,
  );
}
