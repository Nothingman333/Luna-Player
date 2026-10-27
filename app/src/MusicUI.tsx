import { applyMusicIdentities } from "./Music";
// UI-only closure; playback/data helpers remain in Music.tsx.
import { ExtraModal,extraText } from "./Extras";
import { Album,albumKey,ASK,changed,copy,Cover,Episode,episodes,epItem,getJson,goMusicPage,groupAlbums,Heard,hoverSong,libCache,libSubs,loadHistory,loadLikes,loadMusicFolders,loadMusicPlaylists,loadPodRecent,loadSubs,MIC,mostPlayed,MPlaylist,MusicView,NOTE,openPlaylist,P,pendingPl,pendingShow,playedMenu,playEpisodeInShow,PlaylistArt,playQueue,podMenu,prefetch,QItem,RADIO_ICON,saveMusicPlaylists,searchShows,setShuffle,setSplit_goMusicPage,setSplit_libCache,setSplit_openPlaylist,setSplit_pendingPl,setSplit_pendingShow,Show,SHUFFLE,songActions,SongVote,Station,stationItem,stations,toggleMusicPause,Track,trackItem,useMusic,useMusicPlaylists } from "./Music";
import { MusicPlaylistTools,PlaylistUtilities } from "./MusicPlaylistTools";
import { reorderPlaylist,uniquePlaylistName } from "./musicWorkspaceModel";
import "./QueueTools.css";
// Müzik modu: the user's own music folders (albums, artists, songs), live radio, a mini player
// and a "now playing" screen with synced lyrics. Playback goes through the same mpv as video,
// with the picture track off.
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "./linkOpen";
import { useEffect,useMemo,useRef,useState } from "react";
import { createPortal } from "react-dom";
import "./BookMusic.css";
import { lang,tt } from "./i18n";
import { store } from "./library";
import { fmtTime } from "./mpv";
import { matchesSearch,playingRowIndex,searchFold } from "./musicModel";
import { invoke } from "./nativeCore";
import { I,Icon,MenuEntry,openMenu } from "./Screens";
import { askAssistant,openAssistant } from "./Taste";
import { TastePanel } from "./TastePanel";
import { TasteProfile } from "./TasteProfile";

/** The music library, scanned once per session (and again on request). */
function useMusicLibrary() {
  const [folders, setFoldersState] = useState<string[]>(loadMusicFolders);
  const [tracks, setTracks] = useState<Track[] | null>(() => (libCache?.sig === loadMusicFolders().join("|") ? libCache.tracks : null));
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState(false);
  const [tick, setTick] = useState(0);
  // the folder watcher found new or removed music files
  useEffect(() => {
    const f = (e: Event) => { if (((e as CustomEvent).detail?.kinds ?? ["music"]).includes("music")) { setSplit_libCache(null); setTick((n) => n + 1); } };
    window.addEventListener("luna-rescan", f);
    return () => window.removeEventListener("luna-rescan", f);
  }, []);
  const sig = folders.join("|");
  useEffect(()=>{const update=()=>{setSplit_libCache(null);setFoldersState(loadMusicFolders());setTick(n=>n+1);};window.addEventListener("luna-library",update);return()=>window.removeEventListener("luna-library",update);},[]);
  useEffect(() => {
    const f = () => setTracks(libCache?.tracks ?? null);
    libSubs.add(f);
    return () => { libSubs.delete(f); };
  }, []);
  useEffect(() => {
    // (a scan cancelled by these early returns never reaches its own finally: "scanning" is switched off here,
    // or "Taranıyor…" stayed on and the add-folder button stayed disabled)
    if (!folders.length) { setSplit_libCache({ sig, tracks: [] }); setTracks([]); setScanning(false); setScanError(false); return; }
    if (libCache?.sig === sig && tick === 0) { setTracks(libCache.tracks); setScanning(false); setScanError(false); return; }
    let alive = true;
    setScanning(true);
    setScanError(false);
    invoke<Track[]>("music_scan", { folders })
      // a scan for folders that changed meanwhile is dropped, not written over the newer one
      .then((raw) => {
        const t=applyMusicIdentities(raw);
        if (sig !== loadMusicFolders().join("|")) return;
        setSplit_libCache({ sig, tracks: t });
        if (alive) setTracks(t);
        libSubs.forEach((f) => f());
      })
      // a failed scan (a drive that is unplugged) is told, with a way to try again; it is not kept as an empty library
      .catch(() => { if (alive) { setTracks([]); setScanError(true); } })
      .finally(() => alive && setScanning(false));
    return () => { alive = false; };
  }, [sig, tick]);
  const setFolders = (f: string[]) => { store.set("musicFolders", JSON.stringify(f)); setFoldersState(f); };
  const albums = useMemo(() => {
    const m = new Map<string, Album>();
    for (const t of tracks ?? []) {
      const k = albumKey(t);
      const a = m.get(k) ?? { key: k, title: t.album || tt("Bilinmeyen albüm"), artist: t.albumArtist || t.artist || tt("Bilinmeyen sanatçı"), year: t.year, cover: t.cover, tracks: [] };
      a.tracks.push(t);
      a.cover ??= t.cover;
      a.year ??= t.year;
      m.set(k, a);
    }
    return [...m.values()];
  }, [tracks]);
  return { folders, setFolders, tracks, albums, scanning, scanError, rescan: () => setTick((n) => n + 1) };
}
/** A YouTube channel name as an artist: "Duke Ellington - Topic", "AdeleVEVO" → "Duke Ellington", "Adele". */
const cleanArtist = (a: string) => a.replace(/\s*-\s*Topic$/i, "").replace(/\s*(VEVO|Official|Resmi)$/i, "").replace(/\s*\(official\)$/i, "").trim();
/** Songs that aren't files: those in Luna's lists and those played from links, so Albums / Artists /
 *  Songs work without a music folder too. */
function onlineTracks(): Track[] {
  const seen = new Set<string>();
  const out: Track[] = [];
  const add = (q: QItem) => {
    if (!q.src || seen.has(q.src) || q.radio || q.podcast || q.book || !/^(https?|ytdl):/i.test(q.src)) return;
    seen.add(q.src);
    const artist = cleanArtist((q.artist ?? "").split(",")[0]) || tt("Bilinmeyen sanatçı");
    out.push({ path: q.src, title: q.title, artist, album: q.album ?? "", albumArtist: artist, duration: q.duration ?? 0, cover: q.cover, online: true, yt: q.yt, page: q.page });
  };
  for (const p of loadMusicPlaylists()) p.items.forEach(add);
  for (const x of mostPlayed(300)) add(x.q);
  return out;
}
export function MusicPage({ view, setView: setPage, query }: { view: MusicView; setView: (v: MusicView) => void; query: string }) {
  const lib = useMusicLibrary();
  useEffect(() => { setSplit_goMusicPage(setPage); return () => { setSplit_goMusicPage(null); }; }, [setPage]);
  const [album, setAlbum] = useState<Album | null>(null);
  const [pl, setPl] = useState<string | null>(() => { const p = pendingPl; setSplit_pendingPl(null); return p; });
  useEffect(() => {
    setSplit_openPlaylist((id) => {
      store.set("musicLibTab", "lists");
      if (view === "library") setPl(id);
      else { setSplit_pendingPl(id); setPage("library"); }
    });
    return () => { setSplit_openPlaylist(null); };
  }, [view]);
  const addFolder = async () => {
    const d = await open({ directory: true, multiple: false });
    if (typeof d === "string" && !lib.folders.includes(d)) lib.setFolders([...lib.folders, d]);
  };
  return (
    <div className="page music">
      {view === "home" && <MusicHome lib={lib} onAlbum={setAlbum} onAddFolder={addFolder} goRadio={() => setPage("radio")}
        goShow={(sh) => { setSplit_pendingShow(sh); setPage("podcast"); }} />}
      {view === "library" && <MusicLibrary lib={lib} query={query} onAlbum={setAlbum} onAddFolder={addFolder} />}
      {view === "taste" && <>
        <TasteProfile kind="music" page onWorkOpen={(key)=>{const all=[...loadLikes().map(x=>x.q),...store.json<{q:QItem}[]>("musicDislikes",[]).map(x=>x.q),...loadHistory().map(x=>x.q),...Object.values(store.json<Record<string,{q:QItem}>>("musicPlays",{})).map(x=>x.q)];const q=all.find(q=>q.title+" | "+(q.artist??"")===key);if(q){playQueue([q]);}else {setPage("library");}}} />
        <section className="la mu-taste"><TastePanel kind="music" open={false} /></section>
      </>}
      {view === "radio" && <RadioPage query={query} />}
      {view === "podcast" && <Podcasts query={query} />}
      {view === "discover" && <MusicDiscover query={query} />}
      {album && <AlbumSheet a={album} onClose={() => setAlbum(null)} />}
      {pl && <PlaylistPage id={pl} onClose={() => setPl(null)} />}
    </div>
  );
}

type Lib = ReturnType<typeof useMusicLibrary>;

function NoMusic({ onAddFolder, scanning }: { onAddFolder: () => void; scanning: boolean }) {
  return (
    <section className="hero empty mu-empty">
      <h1>{tt("Müzik arşivini ekle")}</h1>
      <div className="muted">{tt("Müzik klasörünü seç: albümler, kapaklar ve sanatçılar dosyaların etiketlerinden çıkar. MP3, FLAC, M4A, OGG, OPUS, WAV…")}</div>
      <button className="primary" onClick={onAddFolder} disabled={scanning}><Icon d={I.folder} size={18} />  {tt("Müzik klasörü ekle")}</button>
    </section>
  );
}
// right-click menus: the assistant's ready questions come first
const albumMenu = (a: Album, onOpen?: () => void): MenuEntry[] => [
  { label: ASK + tt("Bu albüm hakkında"), act: () => askAssistant(tt("“{0}” ({1}) albümü hakkında bilgi ver", a.title, a.artist)) },
  { label: ASK + tt("Bu albümün şarkıları hangi film ve dizilerde geçiyor?"), act: () => askAssistant(tt("“{0}” ({1}) albümünün şarkıları hangi film ve dizilerde geçiyor?", a.title, a.artist)) },
  { label: ASK + tt("Buna benzer albümler"), act: () => askAssistant(tt("“{0}” ({1}) albümüne benzer albümler öner; arşivimde olanları önce söyle", a.title, a.artist)) },
  { label: ASK + tt("Sanatçı hakkında"), act: () => askAssistant(tt("{0} hakkında kısaca bilgi ver; belgeseli ya da filmi var mı?", a.artist)) },
  "sep",
  { label: tt("Çal"), act: () => playQueue(a.tracks.map(trackItem)) },
  { label: tt("Karışık çal"), act: () => playQueue(a.tracks.map(trackItem), 0, true) },
  ...(onOpen ? [{ label: tt("Şarkıları göster"), act: onOpen }] : []),
];
const showMenu = (s: { title: string; author: string }, open: () => void): MenuEntry[] => [
  { label: ASK + tt("Bu podcast hakkında"), act: () => askAssistant(tt("“{0}” ({1}) podcasti hakkında bilgi ver; hangi bölümlerden başlamalıyım?", s.title, s.author)) },
  { label: ASK + tt("Buna benzer podcastler"), act: () => askAssistant(tt("“{0}” podcastine benzer podcastler öner", s.title)) },
  "sep",
  { label: tt("Bölümleri göster"), act: open },
];

function AlbumCard({ a, onOpen }: { a: Album; onOpen: () => void }) {
  return (
    <button className="mu-album" onClick={onOpen} title={`${a.title} · ${a.artist}`} onContextMenu={(e) => openMenu(e, albumMenu(a, onOpen))}>
      <div className="mu-album-art">
        <Cover src={a.cover} name={a.title} size="100%" />
        <span className="mu-album-play" role="button" aria-label={tt("Çal")} tabIndex={0}
          onClick={(e) => { e.stopPropagation(); playQueue(a.tracks.map(trackItem)); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); playQueue(a.tracks.map(trackItem)); } }}>
          <Icon d={I.play} fill size={18} />
        </span>
      </div>
      <b className="ellipsis">{a.title}</b>
      <span className="muted small ellipsis">{a.artist}{a.year ? ` · ${a.year}` : ""}</span>
    </button>
  );
}

const plMenu = (p: MPlaylist): MenuEntry[] => [
  { label: tt("Çal"), act: () => playQueue(p.items, 0, false, p.id) },
  { label: tt("Karışık çal"), act: () => playQueue(p.items, 0, true, p.id) },
  "sep",
  { label: tt("Listeyi sil"), danger: true, act: () => { if (confirm(tt("“{0}” listesi silinsin mi?", p.name))) saveMusicPlaylists(loadMusicPlaylists().filter((x) => x.id !== p.id)); } },
];
function PlaylistCard({ p }: { p: MPlaylist }) {
  return (
    <button className="mu-album" onClick={() => openPlaylist?.(p.id)} title={p.name} onContextMenu={(e) => openMenu(e, plMenu(p))}>
      <div className="mu-album-art">
        <PlaylistArt p={p} size="100%" />
        <span className="mu-album-play" role="button" aria-label={tt("Çal")} tabIndex={0}
          onClick={(e) => { e.stopPropagation(); playQueue(p.items, 0, false, p.id); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); playQueue(p.items, 0, false, p.id); } }}><Icon d={I.play} fill size={18} /></span>
      </div>
      <b className="ellipsis">{p.name}</b>
      <span className="muted small ellipsis">{[p.from, tt("{0} şarkı", p.items.length)].filter(Boolean).join(" · ")}</span>
    </button>
  );
}
const EQ = <span className="pl-eq" aria-hidden="true"><i /><i /><i /></span>;
/** A playlist as a whole page: its cover as the backdrop, a big play button, the songs as a table you can play, search, reorder and edit. */
function PlaylistPage({ id, onClose }: { id: string; onClose: () => void }) {
  const all = useMusicPlaylists();
  const m = useMusic();
  const [q, setQ] = useState("");
  const [saveError,setSaveError]=useState("");
  useEffect(()=>{const f=(e:Event)=>setSaveError(String((e as CustomEvent).detail));window.addEventListener("luna-playlist-error",f);return()=>window.removeEventListener("luna-playlist-error",f);},[]);
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const p = all.find((x) => x.id === id);
  useEffect(() => {
    // the first songs are ready before they are clicked
    p?.items.slice(0, 3).forEach((t) => prefetch(t, 3));
    document.body.classList.add("pl-open");
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector(".extra-modal") && !(e.target instanceof HTMLInputElement)) { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", k, true);
    return () => { document.body.classList.remove("pl-open"); window.removeEventListener("keydown", k, true); };
  }, []);
  if (!p) return <ExtraModal title={extraText("Listeye erişilemiyor","Playlist unavailable")} close={onClose}><p role="alert" className="playlist-save-error">{saveError||extraText("Liste artık mevcut değil veya kayıt hasarlı. Mevcut verilerin üzerine yazılmadı.","The playlist is no longer available or its data is damaged. Existing data was not overwritten.")}</p></ExtraModal>;
  const save = (items: QItem[], patch: Partial<MPlaylist> = {}) => {const current=loadMusicPlaylists();if(!current.some(x=>x.id===id)){setSaveError(extraText("Bu liste artık mevcut değil.","This playlist no longer exists."));return false;}const ok=saveMusicPlaylists(current.map(x=>x.id===id?{...x,...patch,items}:x));if(ok){if(P.from===id){P.from="";changed();}setSaveError("");}return ok;};
  const total = p.items.reduce((n, t) => n + (t.duration || 0), 0);
  // this list is the one playing (not just another list that shares the song)
  const ours = !!m.now && m.from === p.id;
  const playing = ours && !m.paused;
  const needle = searchFold(q);
  const shown = p.items.map((t, i) => ({ t, i })).filter(({ t }) => matchesSearch(needle, t.title, t.artist, t.album));
  // the row playing: only in the list the queue was started from, and only that one row when a song is in the list twice
  const nowAt = playingRowIndex(p.items, m.now, m.index, ours, m.shuffle);
  const playAt = (i: number) => {
    if (i === nowAt) { toggleMusicPause(); return; }
    playQueue(p.items, i, false, p.id);
  };
  const bigPlay = () => (ours ? toggleMusicPause() : playQueue(p.items, 0, false, p.id));
  const move = (from: number, to: number) => {const items=reorderPlaylist(p.items,from,to);if(items!==p.items)save(items);};
  const duplicate=()=>{const rows=loadMusicPlaylists();const id=crypto.randomUUID();if(saveMusicPlaylists([{...p,id,name:uniquePlaylistName(p.name,rows),items:p.items.map(q=>({...q})),at:Date.now()},...rows]))setSaveError(extraText("Listenin kopyası kütüphaneye eklendi.","A copy of the playlist was added to your library."));};
  const rename = () => { const n = prompt(tt("Listenin adı"), p.name)?.trim(); if (n) save(p.items, { name: n.slice(0,120) }); };
  const remove = () => { if (confirm(tt("“{0}” listesi silinsin mi?", p.name))) { if(saveMusicPlaylists(loadMusicPlaylists().filter((x) => x.id !== id)))onClose(); } };
  // "⋯": the playlist's own link (the address it was imported from) first, then edit/delete
  const moreMenu = (): MenuEntry[] => {
    const link: MenuEntry[] = p.url
      ? [
        { label: tt("Tarayıcıda aç"), act: () => openUrl(p.url!) },
        { label: tt("Bağlantıyı kopyala"), act: () => copy(p.url!) },
        "sep",
      ]
      : [];
    return [...link, { label: tt("Adını değiştir"), act: rename }, "sep", { label: tt("Listeyi sil"), danger: true, act: remove }];
  };
  const hours = Math.floor(total / 3600), mins = Math.round((total % 3600) / 60);
  return createPortal(
    <>
      <div className="chat-scrim" onMouseDown={onClose} />
      <div className="pl-page pl-card glass page-anim" role="dialog" aria-modal="true" aria-label={p.name}>
        <div className="pl-bg-clip"><div className="pl-bg" style={p.cover ? { backgroundImage: `url(${p.cover})` } : undefined} /></div>
        <header className="pl-top">
          <button className="round" aria-label={tt("Geri")} onClick={onClose}><Icon d={I.left} /></button>
        </header>
        <section className="pl-head">
          <PlaylistArt p={p} size={224} radius={16} />
          <div className="pl-head-txt">
            <span className="eyebrow">{tt("LİSTE")}</span>
            <h1 title={tt("Adını değiştir")} onClick={rename}>{p.name}</h1>
            <span className="muted pl-meta">{[p.from ? tt("{0}'dan aktarıldı", p.from) : "", tt("{0} şarkı", p.items.length),
              total ? (hours ? tt("{0} sa {1} dk", hours, mins) : tt("{0} dk", mins)) : ""].filter(Boolean).join(" · ")}</span>
          </div>
        </section>
        <div className="pl-bar">
          <button className="pl-big" aria-label={playing ? tt("Duraklat") : tt("Çal")} disabled={!p.items.length} onClick={bigPlay}>
            <Icon d={playing ? I.pause : I.play} fill size={26} /></button>
          <button className={"act" + (ours && m.shuffle ? " on" : "")} data-tip={tt("Karışık çal")} aria-label={tt("Karışık çal")} disabled={!p.items.length}
            onClick={() => (ours ? setShuffle(!m.shuffle) : playQueue(p.items, 0, true, p.id))}><Icon d={SHUFFLE} size={20} /></button>
          <button className="act" data-tip={tt("Diğer seçenekler")} aria-label={tt("Diğer seçenekler")}
            onClick={(e) => openMenu(e, moreMenu())}>
            <Icon d={I.more} size={22} /></button>
          <button className="act" data-tip={tt("Asistana sor")} aria-label={tt("Asistana sor")}
            onClick={openAssistant}><Icon d={I.chat} size={20} /></button>
          <span className="grow" />
          <label className="pl-search"><Icon d={I.search} size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tt("Listede ara")} /></label>
        </div>
        <PlaylistUtilities playlist={p} onDuplicate={duplicate} onReplace={items=>save(items)}/>
        {saveError&&<p className="playlist-save-error" role="status">{saveError}</p>}
        {needle&&<div className="playlist-search-meta">{shown.length} / {p.items.length} {extraText("parça","tracks")} · {extraText("Çalma ve düzenleme asıl liste sırasını kullanır.","Playback and edits use the original playlist order.")}</div>}
        <div className="pl-table">
          <div className="pl-row pl-th"><span>#</span><span>{tt("Başlık")}</span><span className="pl-alb">{tt("Albüm")}</span><span /><span className="pl-dur"><Icon d="M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" size={15} /></span><span /></div>
          {shown.map(({ t, i }) => {
            const cur = i === nowAt;
            return (
              <div key={i} aria-current={cur ? "true" : undefined} className={"pl-row" + (cur ? " cur" : "") + (over === i && drag != null && drag !== i ? (drag < i ? " drop-after" : " drop-before") : "")}
                draggable={!needle} onDragStart={() => setDrag(i)} onDragEnd={() => { setDrag(null); setOver(null); }} {...hoverSong(t)}
                onDragOver={(e) => { if (drag != null) { e.preventDefault(); setOver(i); } }}
                onDrop={(e) => { e.preventDefault(); if (drag != null) move(drag, i); setDrag(null); setOver(null); }}
                onClick={(e) => { if ((e.target as HTMLElement).closest("button")) return; playAt(i); }}
                onContextMenu={(e) => openMenu(e, songActions(t, () => playQueue(p.items, i, false, p.id),
                  [{ label: tt("Listeden çıkar"), danger: true, act: () => save(p.items.filter((_, j) => j !== i)) }]))}>
                <button className="pl-n" aria-label={cur && !m.paused ? tt("Duraklat") : tt("Çal")} onClick={() => playAt(i)}>
                  <span className="pl-num">{cur && m.loading ? <span className="mu-spin sm" aria-label={tt("Yükleniyor…")} /> : cur && !m.paused ? EQ : i + 1}</span>
                  <span className="pl-hover"><Icon d={cur && !m.paused ? I.pause : I.play} fill size={14} /></span>
                </button>
                <span className="pl-title">
                  <Cover src={t.cover} name={t.title} size={42} radius={6} icon={NOTE} />
                  <span className="mu-song-t"><b className="ellipsis">{t.title}</b><span className="muted small ellipsis">{t.artist}</span></span>
                </span>
                <span className="pl-alb muted small ellipsis">{t.album ?? ""}</span>
                <SongVote q={t} />
                <span className="pl-dur muted small">{t.duration ? fmtTime(t.duration) : ""}</span>
                <div className="playlist-move-actions"><button disabled={i===0} aria-label={extraText(t.title+" listede yukarı taşı","Move "+t.title+" up in playlist")} onClick={()=>move(i,i-1)}>↑</button><button disabled={i===p.items.length-1} aria-label={extraText(t.title+" listede aşağı taşı","Move "+t.title+" down in playlist")} onClick={()=>move(i,i+1)}>↓</button><button className="pl-x" aria-label={tt("Listeden çıkar")} title={tt("Listeden çıkar")} onClick={() => save(p.items.filter((_, j) => j !== i))}><Icon d={I.x} size={14} /></button></div>
              </div>
            );
          })}
          {!shown.length && <div className="muted empty-note">{needle ? tt("Bu aramayla şarkı yok") : tt("Bu liste boş")}</div>}
        </div>
      </div>
    </>,
    document.querySelector(".root") ?? document.body,
  );
}

function SongTile({ q, n, onPlay }: { q: QItem; n: number; onPlay: () => void }) {
  return (
    <button className="mu-album" onClick={onPlay} title={`${q.title}${q.artist ? " · " + q.artist : ""}`} {...hoverSong(q)}
      onContextMenu={(e) => openMenu(e, playedMenu(q, onPlay))}>
      <div className="mu-album-art">
        <Cover src={q.cover} name={q.title} size="100%" icon={NOTE} />
        <span className="mu-album-play" aria-hidden="true"><Icon d={I.play} fill size={18} /></span>
      </div>
      <b className="ellipsis">{q.title}</b>
      <span className="muted small ellipsis">{[q.artist, tt("{0} kez", n)].filter(Boolean).join(" · ")}</span>
    </button>
  );
}
/** "Beğendiğin şarkılar" among the lists (always first, can't be deleted). */
function LikedCard({ onOpen }: { onOpen: () => void }) {
  const n = loadLikes().length;
  return (
    <button className="mu-album" onClick={onOpen} title={tt("Beğendiklerim")}>
      <div className="mu-album-art mu-liked-card"><Icon d={HEART} size={44} fill /></div>
      <b className="ellipsis">{tt("Beğendiklerim")}</b>
      <span className="muted small ellipsis">{tt("{0} öğe", n)}</span>
    </button>
  );
}
function HomeLists() {
  const lists = useMusicPlaylists();
  useMusic(); // the counts change as songs play
  const most = mostPlayed();
  const liked = loadLikes().length > 0;
  return (
    <>
      {/* "Beğendiklerim" always heads the lists, even while it is empty */}
      {(lists.length > 0 || liked) && (
        <section className="row"><h2>{tt("Listelerin")}</h2>
          <div className="mu-grid"><LikedCard onOpen={() => { store.set("musicLibTab", "liked"); goMusicPage?.("library"); }} />{lists.slice(0, 11).map((p) => <PlaylistCard key={p.id} p={p} />)}</div>
        </section>
      )}
      {most.length > 0 && (
        <section className="row"><h2>{tt("En çok dinlediklerin")}</h2>
          <div className="mu-grid">{most.map((x, i) => <SongTile key={x.q.src} q={x.q} n={x.n} onPlay={() => playQueue(most.map((m) => m.q), i)} />)}</div>
        </section>
      )}
    </>
  );
}

function MusicHome({ lib, onAlbum, onAddFolder, goRadio, goShow }: { lib: Lib; onAlbum: (a: Album) => void; onAddFolder: () => void; goRadio: () => void; goShow: (s: Show) => void }) {
  const pods = <PodcastRow onOpen={goShow} />;
  const m = useMusic();
  const last = store.json<QItem | null>("musicLast", null);
  const recentKeys = store.json<string[]>("musicRecentAlbums", []);
  const recent = recentKeys.map((k) => lib.albums.find((a) => a.key === k)).filter(Boolean) as Album[];
  const others = lib.albums.filter((a) => !recentKeys.includes(a.key)).slice(0, 18);
  const lastAlbum = last?.albumKey ? lib.albums.find((a) => a.key === last.albumKey) : undefined;
  const resume = () => {
    if (!lastAlbum || !last) return;
    const i = lastAlbum.tracks.findIndex((t) => t.path === last.src);
    playQueue(lastAlbum.tracks.map(trackItem), Math.max(0, i));
  };
  const [top, setTop] = useState<Station[] | null>(null);
  useEffect(() => {
    let alive = true;
    stations(`/stations/bycountrycodeexact/${lang() === "tr" ? "TR" : "US"}?order=votes&reverse=true&hidebroken=true&limit=12`)
      .then((l) => alive && setTop(l)).catch(() => alive && setTop([]));
    return () => { alive = false; };
  }, []);
  if (lib.tracks && !lib.tracks.length && !lib.folders.length) return (
    <>
            <HomeLists />
      {pods}
      <NoMusic onAddFolder={onAddFolder} scanning={lib.scanning} />
      <RadioRow list={top} title={tt("Canlı radyo")} more={goRadio} />
    </>
  );
  return (
    <>
            <section className="mu-top">
        <div className="mu-card mu-mix">
          <div>
            <div className="eyebrow">{tt("BUGÜN İÇİN")}</div>
            <h2>{tt("Karışık çal")}</h2>
            <div className="muted">{lib.tracks == null ? tt("Arşivin okunuyor…") : tt("Arşivindeki {0} şarkıdan rastgele", lib.tracks.length)}</div>
          </div>
          <button className="primary" disabled={!lib.tracks?.length} onClick={() => playQueue(lib.tracks!.map(trackItem), 0, true)}>
            <Icon d={SHUFFLE} size={16} />  {tt("Karışık çal")}</button>
        </div>
        {last && lastAlbum ? (
          <button className="mu-card mu-resume" onClick={resume}>
            <Cover src={last.cover} name={last.album ?? last.title} size={112} />
            <div className="mu-resume-txt">
              <div className="eyebrow">{m.now?.src === last.src ? tt("ŞİMDİ ÇALIYOR") : tt("KALDIĞIN YERDEN")}</div>
              <b>{last.title}</b>
              <span className="muted">{[last.artist, last.album].filter(Boolean).join(" · ")}</span>
            </div>
          </button>
        ) : (
          <button className="mu-card mu-resume" onClick={goRadio}>
            <Cover name="radio" size={112} icon={RADIO_ICON} />
            <div className="mu-resume-txt">
              <div className="eyebrow">{tt("CANLI")}</div>
              <b>{tt("Radyo dinle")}</b>
              <span className="muted">{tt("Dünyanın her yerinden binlerce istasyon")}</span>
            </div>
          </button>
        )}
      </section>
      {lib.scanning && !lib.tracks?.length && <div className="muted small pulse">{tt("Müzik arşivin taranıyor…")}</div>}
      <HomeLists />
      {pods}
      {recent.length > 0 && (
        <section className="row"><h2>{tt("Son dinlenen albümler")}</h2>
          <div className="mu-grid">{recent.slice(0, 12).map((a) => <AlbumCard key={a.key} a={a} onOpen={() => onAlbum(a)} />)}</div>
        </section>
      )}
      {others.length > 0 && (
        <section className="row"><h2>{recent.length ? tt("Arşivinden") : tt("Albümlerin")}</h2>
          <div className="mu-grid">{others.map((a) => <AlbumCard key={a.key} a={a} onOpen={() => onAlbum(a)} />)}</div>
        </section>
      )}
      <RadioRow list={top} title={tt("Canlı radyo")} more={goRadio} />
    </>
  );
}

function RadioRow({ list, title, more }: { list: Station[] | null; title: string; more?: () => void }) {
  const m = useMusic();
  if (list && !list.length) return null;
  return (
    <section className="row">
      <div className="row-head"><h2>{title}</h2>{more && <button className="chip" onClick={more}>{tt("Tümü")}</button>}</div>
      <div className="mu-stations">
        {list == null && Array.from({ length: 8 }, (_, i) => <div key={i} className="mu-station ghost-card" />)}
        {list?.map((s) => <StationCard key={s.stationuuid} s={stationItem(s)} on={m.now?.src === s.url_resolved} />)}
      </div>
    </section>
  );
}

function StationCard({ s, on }: { s: QItem; on: boolean }) {
  const favs = store.json<QItem[]>("musicRadioFav", []);
  const fav = favs.some((f) => f.src === s.src);
  const [, bump] = useState(0);
  const toggleFav = () => {
    store.set("musicRadioFav", JSON.stringify(fav ? favs.filter((f) => f.src !== s.src) : [s, ...favs]));
    bump((n) => n + 1);
  };
  return (
    <div className={"mu-station" + (on ? " on" : "")}>
      <button className="mu-station-main" onClick={() => playQueue([s])} title={s.title}
        onContextMenu={(e) => openMenu(e, [
          { label: ASK + tt("Buna benzer radyolar"), act: () => askAssistant(tt("“{0}” radyosuna benzer istasyonlar öner ve birini aç", s.title)) },
          "sep",
          { label: tt("Dinle"), act: () => playQueue([s]) },
          { label: fav ? tt("Favorilerden çıkar") : tt("Favorilere ekle"), act: toggleFav },
        ])}>
        <Cover src={s.favicon} name={s.title} size={44} radius={10} icon={RADIO_ICON} />
        <span className="mu-station-txt"><b className="ellipsis">{s.title}</b><span className="muted small ellipsis">{s.artist}</span></span>
        {on && <span className="mu-live">{tt("CANLI")}</span>}
      </button>
      <button className={"mu-fav" + (fav ? " on" : "")} aria-label={fav ? tt("Favorilerden çıkar") : tt("Favorilere ekle")} title={fav ? tt("Favorilerden çıkar") : tt("Favorilere ekle")} onClick={toggleFav}>
        <Icon d="M12 21l-8.5-8.6a5 5 0 0 1 7-7.1L12 6.8l1.5-1.5a5 5 0 0 1 7 7.1z" size={16} fill={fav} />
      </button>
    </div>
  );
}

type LibTab = "albums" | "artists" | "songs" | "lists" | "liked" | "history";
function MusicLibrary({ lib, query, onAlbum, onAddFolder }: { lib: Lib; query: string; onAlbum: (a: Album) => void; onAddFolder: () => void }) {
  const [tab, setTab] = useState<LibTab>(() => (store.get("musicLibTab") as LibTab) || "albums");
  const pick = (t: LibTab) => { setTab(t); store.set("musicLibTab", t); };
  const [artist, setArtist] = useState<string | null>(null);
  // accents and Turkish dots don't matter ("sarki" finds "Şarkı"); every word may be in a different field (title + artist)
  const q = searchFold(query);
  const hit = (...xs: (string | undefined)[]) => matchesSearch(q, ...xs);
  const allLists = useMusicPlaylists();
  // the folder's songs, then those from lists and links (a song that is also a file isn't shown twice)
  const online = useMemo(() => {
    const files = new Set((lib.tracks ?? []).map((t) => `${t.artist}|${t.title}`.toLowerCase()));
    return onlineTracks().filter((t) => !files.has(`${t.artist}|${t.title}`.toLowerCase()));
  }, [lib.tracks, allLists]);
  const allTracks = [...(lib.tracks ?? []), ...online];
  const allAlbums = [...lib.albums, ...groupAlbums(online.filter((t) => t.album))];
  const albums = allAlbums.filter((a) => hit(a.title, a.artist) && (!artist || a.artist === artist))
    .sort((x, y) => x.artist.localeCompare(y.artist) || (x.year ?? 0) - (y.year ?? 0));
  const byArtist = new Map<string, Track[]>();
  for (const t of allTracks) { const k = t.albumArtist || t.artist; byArtist.set(k, [...(byArtist.get(k) ?? []), t]); }
  const artists = [...byArtist.keys()].filter((a) => hit(a)).sort((x, y) => x.localeCompare(y));
  const songMatches = allTracks.filter((t) => hit(t.title, t.artist, t.album) && (!artist || (t.albumArtist || t.artist) === artist));
  const songs = songMatches.slice(0, 500);
  const lists = allLists.filter((p) => hit(p.name));
  if (lib.tracks && !lib.tracks.length && !lib.folders.length && tab !== "lists" && tab !== "liked" && tab !== "history" && !lists.length && !online.length) return <NoMusic onAddFolder={onAddFolder} scanning={lib.scanning} />;
  return (
    <>
      <div className="row-head mu-lib-head">
        <div className="seg-row">
          {([["liked", tt("Beğendiklerim")], ["lists", tt("Listeler")], ["albums", tt("Albümler")], ["artists", tt("Sanatçılar")], ["songs", tt("Şarkılar")], ["history", tt("Geçmiş")]] as const).map(([k, l]) => (
            <button key={k} className={"seg sm" + (tab === k ? " on" : "")} onClick={() => { pick(k); setArtist(null); }}>{l}</button>
          ))}
        </div>
        <span className="grow" />
        {lib.scanning ? <span className="muted small pulse">{tt("Taranıyor…")}</span> : <span className="muted small">{tt("{0} şarkı · {1} albüm", allTracks.length, allAlbums.length)}</span>}
        <button className="chip" onClick={lib.rescan} disabled={lib.scanning}>{tt("Yeniden tara")}</button>
        <button className="chip" onClick={onAddFolder}><Icon d={I.plus} size={14} />  {tt("Klasör")}</button>
      </div>
      <div className="mu-folders">
        {lib.folders.map((f) => (
          <span key={f} className="mu-folder" title={f}><Icon d={I.folder} size={14} /><span className="ellipsis">{f}</span>
            <button aria-label={tt("Kaldır")} title={tt("Kaldır")} onClick={() => lib.setFolders(lib.folders.filter((x) => x !== f))}><Icon d={I.x} size={12} /></button></span>
        ))}
      </div>
      {lib.scanError && !lib.scanning && <div className="mu-note warn" role="alert"><span>{tt("Müzik klasörleri taranamadı. Sürücü bağlı mı, klasör yerinde mi?")}</span><button className="chip" onClick={lib.rescan}>{tt("Yeniden dene")}</button></div>}
      {tab === "albums" && (
        <>
          {artist && <div className="mu-crumb"><button className="chip" onClick={() => setArtist(null)}>← {tt("Tüm albümler")}</button><b>{artist}</b></div>}
          <div className="mu-grid">{albums.map((a) => <AlbumCard key={a.key} a={a} onOpen={() => onAlbum(a)} />)}</div>
          {/* an artist's songs that aren't on an album (YouTube singles) */}
          {artist && songs.some((t) => !t.album) && <><h3 className="mu-sub-h">{tt("Şarkılar")}</h3><SongList tracks={songs.filter((t) => !t.album)} showAlbum /></>}
          {!albums.length && !artist && <div className="muted empty-note">{tt("Albüm bilgisi olan şarkı yok. Sanatçılar ve Şarkılar sekmelerinde listelerindeki ve dinlediğin şarkılar da var.")}</div>}
        </>
      )}
      {tab === "artists" && (
        <div className="mu-artists">
          {artists.map((name) => {
            const theirs = allAlbums.filter((a) => a.artist === name);
            const tracks = byArtist.get(name) ?? [];
            return (
              <button key={name} className="mu-artist" onClick={() => { setArtist(name); pick(theirs.length ? "albums" : "songs"); }}
                onContextMenu={(e) => openMenu(e, [{ label: tt("Karışık çal"), act: () => playQueue(tracks.map(trackItem), 0, true) },
                  { label: ASK + tt("Buna benzer sanatçılar"), act: () => askAssistant(tt("{0} gibi sanatçılar öner", name)) }])}>
                <Cover src={theirs.find((a) => a.cover)?.cover ?? tracks.find((t) => t.cover)?.cover} name={name} size={120} radius={60} />
                <b className="ellipsis">{name}</b>
                <span className="muted small">{theirs.length ? tt("{0} albüm", theirs.length) : tt("{0} şarkı", tracks.length)}</span>
              </button>
            );
          })}
        </div>
      )}
      {tab === "songs" && (
        <>
          {artist && <div className="mu-crumb"><button className="chip" onClick={() => setArtist(null)}>← {tt("Tüm şarkılar")}</button><b>{artist}</b></div>}
          <SongList tracks={songs} showAlbum />
          {songMatches.length > songs.length && <div className="muted small mu-cap-note">{tt("İlk {0} şarkı gösteriliyor ({1} eşleşme). Daraltmak için üstteki arama kutusunu kullan.", songs.length, songMatches.length)}</div>}
        </>
      )}
      {tab === "liked" && <LikedView />}
      {tab === "history" && <HistoryView />}
      {tab === "lists"&&<MusicPlaylistTools lists={allLists} save={saveMusicPlaylists} open={id=>openPlaylist?.(id)}/>}
      {tab === "lists" && (lists.length || loadLikes().length
        ? <div className="mu-grid"><LikedCard onOpen={() => pick("liked")} />{lists.map((p) => <PlaylistCard key={p.id} p={p} />)}</div>
        : <div className="muted empty-note">{tt("Henüz listen yok. Üstteki bağlantı düğmesine bir Spotify liste linki yapıştır: şarkıların YouTube karşılıkları bulunur ve aynı sırayla buraya liste olarak eklenir.")}</div>)}
    </>
  );
}

function SongList({ tracks, showAlbum }: { tracks: Track[]; showAlbum?: boolean }) {
  const m = useMusic();
  return (
    <div className="mu-songs">
      {tracks.map((t, i) => {
        const on = m.now?.src === t.path;
        return (
          <button key={t.path} aria-current={on ? "true" : undefined} className={"mu-song" + (on ? " on" : "")} onClick={() => playQueue(tracks.map(trackItem), i)} {...(t.online ? hoverSong(trackItem(t)) : {})}
            onContextMenu={(e) => openMenu(e, songActions(trackItem(t), () => playQueue(tracks.map(trackItem), i)))}>
            <span className="mu-n">{on && m.loading ? <span className="mu-spin sm" aria-label={tt("Yükleniyor…")} /> : on ? <Icon d={NOTE} size={14} /> : showAlbum ? i + 1 : t.track ?? i + 1}</span>
            {showAlbum && <Cover src={t.cover} name={t.album} size={36} radius={6} />}
            <span className="mu-song-t"><b className="ellipsis">{t.title}</b><span className="muted small ellipsis">{showAlbum && t.album ? `${t.artist} · ${t.album}` : t.artist}</span></span>
            <SongVote q={trackItem(t)} />
            <span className="muted small">{t.duration ? fmtTime(t.duration) : ""}</span>
          </button>
        );
      })}
    </div>
  );
}

function AlbumSheet({ a, onClose }: { a: Album; onClose: () => void }) {
  const total = a.tracks.reduce((n, t) => n + (t.duration || 0), 0);
  return createPortal(
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal wide mu-sheet">
        <div className="mu-sheet-head">
          <Cover src={a.cover} name={a.title} size={168} />
          <div className="mu-sheet-txt">
            <span className="eyebrow">{tt("ALBÜM")}</span>
            <h2>{a.title}</h2>
            <span className="muted">{a.artist}{a.year ? ` · ${a.year}` : ""} · {tt("{0} şarkı", a.tracks.length)}{total ? ` · ${fmtTime(total)}` : ""}</span>
            <div className="seg-row">
              <button className="primary" onClick={() => { playQueue(a.tracks.map(trackItem)); onClose(); }}><Icon d={I.play} fill size={16} />  {tt("Çal")}</button>
              <button className="chip" onClick={() => { playQueue(a.tracks.map(trackItem), 0, true); onClose(); }}><Icon d={SHUFFLE} size={14} />  {tt("Karışık")}</button>
            </div>
          </div>
          <button className="round" aria-label={tt("Kapat")} onClick={onClose}><Icon d={I.x} size={18} /></button>
        </div>
        <SongList tracks={a.tracks} />
      </div>
    </div>,
    document.body,
  );
}

// ---------- Keşfet: what's popular in a country, songs of the artists you listen to, genres ----------
// Apple's open charts and search (no account, no key); each song plays from YouTube when its turn
// comes, like a Spotify list (nothing is downloaded).
const CHART_LANDS: [string, string][] = [
  ["tr", "Türkiye"], ["us", "ABD"], ["gb", "İngiltere"], ["de", "Almanya"], ["fr", "Fransa"], ["es", "İspanya"],
  ["it", "İtalya"], ["br", "Brezilya"], ["mx", "Meksika"], ["jp", "Japonya"], ["kr", "Kore"], ["in", "Hindistan"],
  ["ru", "Rusya"], ["az", "Azerbaycan"], ["sa", "Arap dünyası"], ["gr", "Yunanistan"],
];
const GENRES = ["Pop", "Rock", "Jazz", "Hip-hop", "Lo-fi", "Klasik müzik", "Elektronik", "Türk sanat müziği", "Anadolu rock", "Film müzikleri", "Metal", "R&B"];
const searchItem = (title: string, artist: string, cover?: string, duration?: number): QItem =>
  ({ src: `ytdl://ytsearch1:${artist} ${title} audio`, title, artist, cover, duration, yt: true });
async function chartSongs(cc: string): Promise<QItem[]> {
  const k = "muChart:" + cc;
  const c = store.json<{ at: number; l: QItem[] } | null>(k, null);
  if (c && Date.now() - c.at < 6 * 3600e3 && c.l.length) return c.l;
  const r = await getJson(`https://rss.marketingtools.apple.com/api/v2/${cc}/music/most-played/50/songs.json`);
  const l: QItem[] = (r?.feed?.results ?? []).map((x: any) => searchItem(x.name, x.artistName, x.artworkUrl100?.replace("100x100", "400x400")));
  if (l.length) store.set(k, JSON.stringify({ at: Date.now(), l }));
  return l;
}
async function songSearch(q: string): Promise<QItem[]> {
  const r = await getJson(`https://itunes.apple.com/search?entity=song&limit=30&country=${lang() === "tr" ? "tr" : "us"}&term=${encodeURIComponent(q)}`);
  return (r?.results ?? []).map((x: any) => searchItem(x.trackName, x.artistName, x.artworkUrl100?.replace("100x100", "400x400"), x.trackTimeMillis ? x.trackTimeMillis / 1000 : undefined));
}
async function artistSongs(artist: string): Promise<QItem[]> {
  const r = await getJson(`https://itunes.apple.com/search?entity=song&limit=12&country=${lang() === "tr" ? "tr" : "us"}&term=${encodeURIComponent(artist)}`);
  const want = artist.toLocaleLowerCase();
  return (r?.results ?? []).filter((x: any) => String(x.artistName ?? "").toLocaleLowerCase().includes(want))
    .map((x: any) => searchItem(x.trackName, x.artistName, x.artworkUrl100?.replace("100x100", "400x400"), x.trackTimeMillis ? x.trackTimeMillis / 1000 : undefined));
}
/** The artists you listen to most (plays and lists), for "from artists you like". */
function topArtists(n: number): string[] {
  const count = new Map<string, number>();
  const add = (a: string | undefined, w: number) => {
    const k = cleanArtist((a ?? "").split(",")[0]);
    if (k && k.length > 1) count.set(k, (count.get(k) ?? 0) + w);
  };
  for (const x of mostPlayed(200)) if (!x.q.radio && !x.q.podcast && !x.q.book) add(x.q.artist, x.n);
  for (const p of loadMusicPlaylists()) for (const t of p.items) add(t.artist, 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([a]) => a);
}
function SongTiles({ items }: { items: QItem[] | null }) {
  const m = useMusic();
  return (
    <div className="mu-tiles">
      {items == null && Array.from({ length: 10 }, (_, i) => <div key={i} className="mu-tile ghost-card" />)}
      {items?.map((t, i) => (
        <button key={t.src} className={"mu-tile" + (m.now?.src === t.src ? " on" : "")} title={`${t.title} · ${t.artist}`} {...hoverSong(t)}
          onClick={() => playQueue(items, i)}
          onContextMenu={(e) => openMenu(e, songActions(t, () => playQueue(items, i), [{ label: tt("Listeye ekle: Luna'ya eklenenler"), act: () => addToAdded(t) }]))}>
          <span className="mu-tile-n">{m.now?.src === t.src && m.loading ? <span className="mu-spin sm" aria-label={tt("Yükleniyor…")} /> : i + 1}</span>
          <Cover src={t.cover} name={t.title} size={48} radius={8} />
          <span className="mu-song-t"><b className="ellipsis">{t.title}</b><span className="muted small ellipsis">{t.artist}</span></span>
        </button>
      ))}
    </div>
  );
}
/** "Luna'ya eklenenler": the list songs found outside the library go to. */
function addToAdded(t: QItem) {
  const lists = loadMusicPlaylists();
  const id = "luna-added";
  const cur = lists.find((p) => p.id === id);
  if (cur) { if (!cur.items.some((x) => x.src === t.src)) saveMusicPlaylists(lists.map((p) => (p.id === id ? { ...p, items: [...p.items, t] } : p))); }
  else saveMusicPlaylists([{ id, name: tt("Luna'ya eklenenler"), from: "Luna", at: Date.now(), items: [t] }, ...lists]);
}
function MusicDiscover({ query }: { query: string }) {
  const [q, setQ] = useState(query);
  const [deb, setDeb] = useState(query.trim());
  useEffect(() => { setQ(query); }, [query]);
  useEffect(() => { const t = setTimeout(() => setDeb(q.trim()), 450); return () => clearTimeout(t); }, [q]);
  const [found, setFound] = useState<QItem[] | null>(null);
  useEffect(() => {
    if (!deb) { setFound(null); return; }
    let alive = true;
    setFound(null);
    songSearch(deb).then((l) => alive && setFound(l)).catch(() => alive && setFound([]));
    return () => { alive = false; };
  }, [deb]);
  const [cc, setCc] = useState(() => store.get("muChartLand") || (lang() === "tr" ? "tr" : "us"));
  const [chart, setChart] = useState<QItem[] | null>(null);
  const [err, setErr] = useState(false);
  const artists = useMemo(() => topArtists(4), []);
  const [byArtist, setByArtist] = useState<Record<string, QItem[] | null>>({});
  useEffect(() => {
    let alive = true;
    setChart(null); setErr(false);
    chartSongs(cc).then((l) => { if (!alive) return; setChart(l); l.slice(0, 3).forEach((t) => prefetch(t, 3)); }).catch(() => { if (alive) { setChart([]); setErr(true); } });
    return () => { alive = false; };
  }, [cc]);
  useEffect(() => {
    let alive = true;
    for (const a of artists) artistSongs(a).then((l) => alive && setByArtist((m) => ({ ...m, [a]: l }))).catch(() => alive && setByArtist((m) => ({ ...m, [a]: [] })));
    return () => { alive = false; };
  }, [artists.join("|")]);
  const land = CHART_LANDS.find(([k]) => k === cc)?.[1] ?? cc.toUpperCase();
  const search = (
    <div className="row-head mu-lib-head">
      <label className="search mu-radio-search"><Icon d={I.search} size={18} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tt("Şarkı ya da sanatçı ara")} /></label>
    </div>
  );
  if (deb) return (
    <>
      {search}
      <section className="row">
        <div className="row-head">
          <h2>{tt("“{0}” için şarkılar", deb)}</h2>
          <span className="grow" />
          {!!found?.length && <button className="primary sm" onClick={() => playQueue(found)}><Icon d={I.play} fill size={14} />  {tt("Hepsini çal")}</button>}
        </div>
        {found && !found.length && <div className="muted">{tt("Şarkı bulunamadı. Müzik › Bağlantı'dan YouTube'da da arayabilirsin.")}</div>}
        <SongTiles items={found} />
      </section>
    </>
  );
  return (
    <>
      {search}
      <section className="row">
        <div className="row-head">
          <h2>{tt("Şu an popüler: {0}", tt(land))}</h2>
          <span className="grow" />
          {!!chart?.length && <button className="primary sm" onClick={() => playQueue(chart)}><Icon d={I.play} fill size={14} />  {tt("Hepsini çal")}</button>}
          {!!chart?.length && <button className="chip" onClick={() => playQueue(chart, 0, true)}><Icon d={SHUFFLE} size={14} />  {tt("Karışık")}</button>}
        </div>
        <div className="mu-lands">
          {CHART_LANDS.map(([k, name]) => (
            <button key={k} className={"seg sm" + (k === cc ? " on" : "")} onClick={() => { setCc(k); store.set("muChartLand", k); }}>{tt(name)}</button>
          ))}
        </div>
        {chart == null && !err && <div className="muted small mu-loading-row"><span className="mu-spin sm" /> {tt("{0} listesi yükleniyor…", tt(land))}</div>}
        {err && <div className="muted">{tt("Liste alınamadı; internet bağlantını kontrol et.")}</div>}
        {chart && !chart.length && !err && <div className="muted">{tt("Bu ülke için liste yok.")}</div>}
        <SongTiles items={chart} />
        <div className="muted small mu-credit">{tt("Liste: Apple Music'te en çok dinlenenler (herkese açık). Şarkılar YouTube'dan çalınır; hiçbir şey indirilmez.")}</div>
      </section>
      {artists.map((a) => byArtist[a] === undefined || byArtist[a]!.length ? (
        <section className="row" key={a}>
          <div className="row-head">
            <h2>{tt("{0} dinlediğin için", a)}</h2>
            <span className="grow" />
            <button className="chip" onClick={() => askAssistant(tt("{0} gibi sanatçılar öner; kütüphanemde olanlar ve olmayanlar", a))}>{ASK + tt("Benzer sanatçılar")}</button>
          </div>
          <SongTiles items={byArtist[a] ?? null} />
        </section>
      ) : null)}
      {!artists.length && <div className="muted empty-note">{tt("Biraz müzik dinledikçe burada sevdiğin sanatçıların şarkıları da çıkacak.")}</div>}
      <section className="row">
        <h2>{tt("Türler")}</h2>
        <div className="mu-genres">
          {GENRES.map((g) => (
            <button key={g} className="mu-genre" onClick={() => askAssistant(tt("{0} türünde 15 şarkılık bir çalma listesi yap", tt(g)))}>{tt(g)}</button>
          ))}
        </div>
        <div className="muted small">{tt("Bir türe tıklayınca asistan sana o türde bir liste hazırlar.")}</div>
      </section>
    </>
  );
}

function RadioPage({ query }: { query: string }) {
  const m = useMusic();
  const [q, setQ] = useState(query);
  const [scope, setScope] = useState<"local" | "world">("local");
  const [list, setList] = useState<Station[] | null>(null);
  const [err, setErr] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => { setQ(query); }, [query]);
  useEffect(() => {
    let alive = true;
    setList(null);
    setErr(false);
    const t = setTimeout(() => {
      const cc = lang() === "tr" ? "TR" : "US";
      const where = `&order=votes&reverse=true&hidebroken=true&limit=60${scope === "local" ? "&countrycode=" + cc : ""}`;
      const e = encodeURIComponent(q.trim());
      // a search is by name and by genre (a jazz station needn't have "jazz" in its name)
      const found = q.trim()
        ? Promise.all([stations(`/stations/search?name=${e}${where}`), stations(`/stations/search?tag=${e}${where}`).catch(() => [] as Station[])])
          .then(([byName, byTag]) => [...byName, ...byTag.filter((s) => !byName.some((x) => x.stationuuid === s.stationuuid))])
        : stations(scope === "local" ? `/stations/bycountrycodeexact/${cc}?order=votes&reverse=true&hidebroken=true&limit=60` : `/stations/topvote/60`);
      found.then((l) => alive && setList(l)).catch(() => { if (alive) { setList([]); setErr(true); } });
    }, q.trim() ? 400 : 0);
    return () => { alive = false; clearTimeout(t); };
  }, [q, scope, retry]);
  const favs = store.json<QItem[]>("musicRadioFav", []);
  const recent = store.json<QItem[]>("musicRecentRadio", []);
  return (
    <>
      <div className="row-head mu-lib-head">
        <label className="search mu-radio-search"><Icon d={I.search} size={18} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tt("İstasyon ara: ad, tür (jazz, rock)…")} /></label>
        <div className="seg-row">
          <button className={"seg sm" + (scope === "local" ? " on" : "")} onClick={() => setScope("local")}>{lang() === "tr" ? tt("Türkiye") : tt("Ülkem")}</button>
          <button className={"seg sm" + (scope === "world" ? " on" : "")} onClick={() => setScope("world")}>{tt("Dünya")}</button>
        </div>
      </div>
      {!q.trim() && favs.length > 0 && (
        <section className="row"><h2>{tt("Favorilerin")}</h2>
          <div className="mu-stations">{favs.map((s) => <StationCard key={s.src} s={s} on={m.now?.src === s.src} />)}</div></section>
      )}
      {!q.trim() && recent.length > 0 && (
        <section className="row"><h2>{tt("Son dinlediklerin")}</h2>
          <div className="mu-stations">{recent.map((s) => <StationCard key={s.src} s={s} on={m.now?.src === s.src} />)}</div></section>
      )}
      <section className="row">
        <h2>{q.trim() ? tt("“{0}” için istasyonlar", q.trim()) : tt("En sevilen istasyonlar")}</h2>
        {err && <div className="mu-note warn" role="alert"><span>{tt("Radyo listesi alınamadı; internet bağlantını kontrol et.")}</span><button className="chip" onClick={() => setRetry((n) => n + 1)}>{tt("Yeniden dene")}</button></div>}
        {list && !list.length && !err && <div className="muted">{tt("İstasyon bulunamadı.")}</div>}
        <div className="mu-stations">
          {list == null && Array.from({ length: 12 }, (_, i) => <div key={i} className="mu-station ghost-card" />)}
          {list?.map((s) => <StationCard key={s.stationuuid} s={stationItem(s)} on={m.now?.src === s.url_resolved} />)}
        </div>
        <div className="muted small mu-credit">{tt("İstasyon listesi: radio-browser.info (açık ve ücretsiz)")}</div>
      </section>
    </>
  );
}
const showOf = (q: QItem): Show => {
  const sub = loadSubs().find((x) => x.feed === q.podcast);
  return sub ?? { feed: q.podcast!, title: q.artist ?? q.album ?? "", author: "", art: q.cover ?? undefined };
};
/** "Kaldığın yerden": each card carries on with its episode; "Bölümler" opens the show's other episodes. */
function PodcastRecent({ onShow, title }: { onShow: (s: Show) => void; title: string }) {
  const m = useMusic();
  const l = loadPodRecent();
  if (!l.length) return null;
  return (
    <section className="row"><h2>{title}</h2>
      <div className="pod-recent">
        {l.slice(0, 8).map(({ q }) => {
          const pos = Number(store.get("podPos:" + q.src) ?? 0);
          const pct = pos === -1 ? 100 : q.duration && pos > 0 ? Math.min(100, (pos / q.duration) * 100) : 0;
          const on = m.now?.src === q.src;
          return (
            <div key={q.src} className={"pod-rc" + (on ? " on" : "")} onContextMenu={(e) => openMenu(e, podMenu(q, () => onShow(showOf(q))))}>
              <button className="pod-rc-main" onClick={() => playEpisodeInShow(q)} title={q.title}>
                <Cover src={q.cover} name={q.artist ?? q.title} size={64} radius={10} icon={MIC} />
                <span className="pod-rc-t">
                  <span className="muted small ellipsis">{q.artist}</span>
                  <b className="ellipsis">{q.title}</b>
                  <span className="bk-bar pod-rc-bar"><span style={{ width: pct + "%" }} /></span>
                  <span className="muted small">{pos === -1 ? tt("dinlendi") : pos > 0 && q.duration ? tt("{0} kaldı", fmtTime(q.duration - pos)) : tt("Başla")}</span>
                </span>
              </button>
              <button className="chip pod-rc-eps" onClick={() => onShow(showOf(q))}>{tt("Bölümler")} →</button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
/** The shows you follow, on the music home page. */
function PodcastRow({ onOpen }: { onOpen: (s: Show) => void }) {
  const subs = loadSubs();
  return (
    <>
      <PodcastRecent onShow={onOpen} title={tt("Podcast'te kaldığın yerden")} />
      {subs.length > 0 && (
        <section className="row"><h2>{tt("Podcastlerin")}</h2>
          <div className="mu-grid">{subs.slice(0, 12).map((s) => <ShowCard key={s.feed} s={s} onOpen={() => onOpen(s)} />)}</div>
        </section>
      )}
    </>
  );
}
type Top = { id: string; title: string; author: string; art?: string };
async function topShows(): Promise<Top[]> {
  const k = "podTop:" + lang();
  const c = store.json<{ at: number; l: Top[] } | null>(k, null);
  if (c && Date.now() - c.at < 86400e3) return c.l;
  const r = await getJson(`https://rss.marketingtools.apple.com/api/v2/${lang() === "tr" ? "tr" : "us"}/podcasts/top/30/podcasts.json`);
  const l: Top[] = (r?.feed?.results ?? []).map((x: any) => ({ id: x.id, title: x.name, author: x.artistName, art: x.artworkUrl100?.replace("100x100", "600x600") }));
  store.set(k, JSON.stringify({ at: Date.now(), l }));
  return l;
}
async function feedOf(t: Top): Promise<Show | null> {
  const r = await getJson(`https://itunes.apple.com/lookup?id=${t.id}`);
  const x = r?.results?.[0];
  return x?.feedUrl ? { feed: x.feedUrl, title: t.title, author: t.author, art: x.artworkUrl600 ?? t.art } : null;
}

function ShowCard({ s, onOpen }: { s: { title: string; author: string; art?: string }; onOpen: () => void }) {
  return (
    <button className="mu-album" onClick={onOpen} title={s.title} onContextMenu={(e) => openMenu(e, showMenu(s, onOpen))}>
      <div className="mu-album-art"><Cover src={s.art} name={s.title} size="100%" icon={MIC} /></div>
      <b className="ellipsis">{s.title}</b>
      <span className="muted small ellipsis">{s.author}</span>
    </button>
  );
}

function Podcasts({ query }: { query: string }) {
  const [q, setQ] = useState(query);
  const [deb, setDeb] = useState(query);
  useEffect(() => { setQ(query); setDeb(query); }, [query]);
  useEffect(() => { const t = setTimeout(() => setDeb(q.trim()), 450); return () => clearTimeout(t); }, [q]);
  const [subs, setSubs] = useState<Show[]>(loadSubs);
  const [found, setFound] = useState<Show[] | null>(null);
  const [top, setTop] = useState<Top[] | null>(null);
  const [err, setErr] = useState(false);
  const [retry, setRetry] = useState(0);
  const [show, setShow] = useState<Show | null>(() => { const p = pendingShow; setSplit_pendingShow(null); return p; });
  // a podcast link while this page is already open
  useEffect(() => {
    const f = () => { if (pendingShow) { setShow(pendingShow); setSplit_pendingShow(null); setSubs(loadSubs()); } };
    window.addEventListener("luna-podcast", f);
    return () => window.removeEventListener("luna-podcast", f);
  }, []);
  useEffect(() => {
    let alive = true;
    setErr(false);
    if (deb) { setFound(null); searchShows(deb).then((l) => alive && setFound(l)).catch(() => alive && setErr(true)); }
    else { setFound(null); topShows().then((l) => alive && setTop(l)).catch(() => alive && setErr(true)); }
    return () => { alive = false; };
  }, [deb, retry]);
  // a featured podcast's feed can take a while: say so instead of looking frozen
  const [opening, setOpening] = useState<Top | null>(null);
  const [openErr, setOpenErr] = useState("");
  const openRef = useRef<Top | null>(null);
  const openTop = async (t: Top) => {
    openRef.current = t; setOpening(t); setOpenErr("");
    const s = await feedOf(t).catch(() => null);
    if (openRef.current !== t) return; // cancelled, or another one was clicked
    openRef.current = null; setOpening(null);
    if (s) setShow(s); else setOpenErr(tt("“{0}” açılamadı; podcastin beslemesine ulaşılamadı.", t.title));
  };
  const cancelOpen = () => { openRef.current = null; setOpening(null); };
  if (opening && !show) return <div className="mu-pod-wait"><div className="mu-pod-spin" /><b>{tt("Podcast açılıyor…")}</b><span className="muted small">{opening.title}</span><span className="muted small">{tt("Bölümler podcastin kendi beslemesinden alınıyor")}</span><button className="chip sm" onClick={cancelOpen}>{tt("İptal")}</button></div>;
  if (show) return <ShowPage s={show} onBack={() => { setShow(null); setSubs(loadSubs()); }} />;
  return (
    <>
      <div className="row-head mu-lib-head">
        <label className="search mu-radio-search"><Icon d={I.search} size={18} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tt("Podcast ara")} /></label>
      </div>
      {!deb && <PodcastRecent onShow={setShow} title={tt("Son dinlediklerin")} />}
      {!deb && subs.length > 0 && (
        <section className="row"><h2>{tt("Abone olduklarım")}</h2>
          <div className="mu-grid">{subs.map((x) => <ShowCard key={x.feed} s={x} onOpen={() => setShow(x)} />)}</div></section>
      )}
      <section className="row">
        <h2>{deb ? tt("“{0}” için podcastler", deb) : tt("Öne çıkan podcastler")}</h2>
        {openErr && <div className="muted">{openErr}</div>}
        {err && <div className="mu-note warn" role="alert"><span>{tt("Podcast listesi alınamadı; internet bağlantını kontrol et.")}</span><button className="chip" onClick={() => setRetry((n) => n + 1)}>{tt("Yeniden dene")}</button></div>}
        <div className="mu-grid">
          {(deb ? found : top) == null && !err && Array.from({ length: 8 }, (_, i) => <div key={i} className="mu-album ghost-card"><div className="mu-album-art" /></div>)}
          {deb ? found?.map((x) => <ShowCard key={x.feed} s={x} onOpen={() => setShow(x)} />)
            : top?.map((t) => <ShowCard key={t.id} s={t} onOpen={() => openTop(t)} />)}
        </div>
        {deb && found && !found.length && <div className="muted">{tt("Podcast bulunamadı.")}</div>}
        <div className="muted small mu-credit">{tt("Podcast dizini: Apple Podcasts (arama) · bölümler podcastin kendi RSS beslemesinden")}</div>
      </section>
    </>
  );
}

function ShowPage({ s, onBack }: { s: Show; onBack: () => void }) {
  const m = useMusic();
  const [data, setData] = useState<{ show: Partial<Show>; eps: Episode[] } | null>(null);
  const [err, setErr] = useState("");
  const [subbed, setSubbed] = useState(() => loadSubs().some((x) => x.feed === s.feed));
  const [n, setN] = useState(30);
  useEffect(() => {
    let alive = true;
    episodes(s.feed).then((d) => alive && setData(d)).catch((e) => alive && setErr(String(e)));
    return () => { alive = false; };
  }, [s.feed]);
  const art = s.art ?? data?.show.art;
  const toggleSub = () => {
    const l = loadSubs();
    store.set("podcasts", JSON.stringify(subbed ? l.filter((x) => x.feed !== s.feed) : [{ ...s, art }, ...l]));
    setSubbed(!subbed);
  };
  const item = (e: Episode): QItem => epItem(e, s, art);
  const play = (i: number) => data && playQueue(data.eps.slice(i).map(item));
  const fmtDate = (t?: number) => (t ? new Date(t).toLocaleDateString(lang() === "tr" ? "tr-TR" : "en-US", { day: "numeric", month: "short", year: "numeric" }) : "");
  return (
    <>
      <div className="row-head mu-lib-head"><button className="chip" onClick={onBack}>← {tt("Podcastler")}</button></div>
      <div className="mu-sheet-head pod-head">
        <Cover src={art} name={s.title} size={168} icon={MIC} />
        <div className="mu-sheet-txt">
          <span className="eyebrow">{tt("PODCAST")}</span>
          <h2>{data?.show.title ?? s.title}</h2>
          <span className="muted">{s.author || data?.show.author}{data ? ` · ${tt("{0} bölüm", data.eps.length)}` : ""}</span>
          <div className="seg-row">
            <button className="primary" disabled={!data?.eps.length} onClick={() => play(0)}><Icon d={I.play} fill size={16} />  {tt("En yeni bölümü çal")}</button>
            <button className={"chip" + (subbed ? " on" : "")} onClick={toggleSub}>{subbed ? tt("✓ Abonesin") : tt("+ Abone ol")}</button>
          </div>
        </div>
      </div>
      {err && <div className="muted">{tt("Podcast okunamadı: ") + err}</div>}
      {!data && !err && <div className="muted pulse">{tt("Bölümler getiriliyor…")}</div>}
      <div className="mu-songs pod-eps">
        {data?.eps.slice(0, n).map((e, i) => {
          const pos = Number(store.get("podPos:" + e.src) ?? 0);
          const on = m.now?.src === e.src;
          return (
            <button key={e.src} className={"mu-song pod-ep" + (on ? " on" : "") + (pos === -1 ? " heard" : "")} onClick={() => play(i)}>
              <span className="mu-n">{on ? <Icon d={NOTE} size={14} /> : <Icon d={I.play} fill size={12} />}</span>
              {pos > 0 && <span className="pod-ep-dot" title={tt("Kaldığın bölüm")} />}
              <span className="mu-song-t">
                <b className="ellipsis">{e.title}</b>
                <span className="muted small ellipsis">{[fmtDate(e.date), e.about].filter(Boolean).join(" · ")}</span>
              </span>
              <span className="muted small pod-dur">{pos === -1 ? tt("dinlendi") : pos > 0 && e.duration ? tt("{0} kaldı", fmtTime(e.duration - pos)) : e.duration ? fmtTime(e.duration) : ""}</span>
            </button>
          );
        })}
      </div>
      {data && data.eps.length > n && <button className="chip bk-more" onClick={() => setN(n + 30)}>{tt("Daha fazla bölüm")}</button>}
    </>
  );
}

const HEART = "M12 21l-8.5-8.6a5 5 0 0 1 7-7.1L12 6.8l1.5-1.5a5 5 0 0 1 7 7.1z";

/** Rows of songs or episodes that aren't files (likes, history): play from here, the song menu on right click. */
function QRows({ items, extra, when }: { items: QItem[]; extra?: (q: QItem) => MenuEntry[]; when?: (i: number) => string }) {
  const m = useMusic();
  return (
    <div className="mu-songs">
      {items.map((q, i) => {
        const on = m.now?.src === q.src;
        const play = () => (q.podcast ? playEpisodeInShow(q) : playQueue(items.filter((x) => !x.podcast), Math.max(0, items.filter((x) => !x.podcast).indexOf(q))));
        return (
          <button key={q.src + i} className={"mu-song" + (on ? " on" : "")} onClick={play} {...hoverSong(q)}
            onContextMenu={(e) => openMenu(e, songActions(q, play, extra?.(q)))}>
            <span className="mu-n">{on && m.loading ? <span className="mu-spin sm" /> : on ? <Icon d={NOTE} size={14} /> : i + 1}</span>
            <Cover src={q.cover} name={q.album ?? q.title} size={36} radius={6} icon={q.podcast ? MIC : NOTE} />
            <span className="mu-song-t"><b className="ellipsis">{q.title}</b><span className="muted small ellipsis">{[q.artist, q.album && q.album !== q.artist ? q.album : ""].filter(Boolean).join(" · ")}</span></span>
            <SongVote q={q} />
            <span className="muted small">{when ? when(i) : q.duration ? fmtTime(q.duration) : ""}</span>
          </button>
        );
      })}
    </div>
  );
}
function LikedView() {
  useMusic();
  const all = loadLikes();
  const [kind, setKind] = useState<"songs" | "pods">("songs");
  const songs = all.filter((x) => !x.q.podcast).map((x) => x.q);
  const pods = all.filter((x) => x.q.podcast).map((x) => x.q);
  const list = kind === "songs" ? songs : pods;
  return (
    <>
      <section className="mu-liked-head">
        <div className="mu-liked-art"><Icon d={HEART} size={54} fill /></div>
        <div className="mu-liked-txt">
          <span className="eyebrow">{tt("LİSTE")}</span>
          <h1>{tt("Beğendiklerim")}</h1>
          <span className="muted">{tt("{0} şarkı · {1} podcast bölümü", songs.length, pods.length)}</span>
          <div className="seg-row">
            <button className="primary" disabled={!songs.length} onClick={() => playQueue(songs)}><Icon d={I.play} fill size={16} />  {tt("Çal")}</button>
            <button className="chip" disabled={!songs.length} onClick={() => playQueue(songs, 0, true)}><Icon d={SHUFFLE} size={14} />  {tt("Karışık")}</button>
          </div>
        </div>
      </section>
      {kind === "songs" && <section className="la mu-taste"><TastePanel kind="music" open={false} /></section>}
      <div className="seg-row mu-liked-tabs">
        <button className={"seg sm" + (kind === "songs" ? " on" : "")} onClick={() => setKind("songs")}>{tt("Şarkılar")} {songs.length || ""}</button>
        <button className={"seg sm" + (kind === "pods" ? " on" : "")} onClick={() => setKind("pods")}>{tt("Podcast bölümleri")} {pods.length || ""}</button>
      </div>
      {list.length ? <QRows items={list} />
        : <div className="muted empty-note">{kind === "songs" ? tt("Henüz beğendiğin şarkı yok. Çalan şarkının yanındaki ♥'e ya da bir şarkıya sağ tıklayıp “Beğendiklerime ekle”ye bas.") : tt("Beğendiğin podcast bölümü yok. Bir bölüm çalarken ♥'e bas.")}</div>}
    </>
  );
}

/** "Geçmiş": what you listened to, day by day. */
function HistoryView() {
  useMusic();
  const h = loadHistory();
  const day = (t: number) => {
    const d = new Date(t), today = new Date();
    const y = new Date(); y.setDate(today.getDate() - 1);
    return d.toDateString() === today.toDateString() ? tt("Bugün") : d.toDateString() === y.toDateString() ? tt("Dün")
      : d.toLocaleDateString(lang() === "tr" ? "tr-TR" : "en-US", { weekday: "long", day: "numeric", month: "long" });
  };
  const groups: { day: string; items: Heard[] }[] = [];
  for (const x of h) { const d = day(x.at); if (groups[groups.length - 1]?.day !== d) groups.push({ day: d, items: [] }); groups[groups.length - 1].items.push(x); }
  const remove = (x: Heard) => { store.set("musicHistory", JSON.stringify(loadHistory().filter((y) => !(y.at === x.at && y.q.src === x.q.src)))); changed(); };
  if (!h.length) return <div className="muted empty-note">{tt("Dinleme geçmişin burada birikecek.")}</div>;
  return (
    <>
      <div className="row-head"><span className="muted small">{tt("{0} dinleme", h.length)}</span><span className="grow" />
        <button className="chip" onClick={() => { if (confirm(tt("Dinleme geçmişi silinsin mi? (Beğendiklerin ve listelerin kalır.)"))) { store.remove("musicHistory"); changed(); } }}>{tt("Geçmişi temizle")}</button></div>
      {groups.map((g) => (
        <section key={g.day} className="row mu-hist">
          <h3>{g.day}</h3>
          <QRows items={g.items.map((x) => x.q)} when={(i) => new Date(g.items[i].at).toLocaleTimeString(lang() === "tr" ? "tr-TR" : "en-US", { hour: "2-digit", minute: "2-digit" })}
            extra={(q) => { const x = g.items.find((y) => y.q === q)!; return [{ label: tt("Geçmişten kaldır"), danger: true, act: () => remove(x) }]; }} />
        </section>
      ))}
    </>
  );
}
