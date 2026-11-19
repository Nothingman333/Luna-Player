// The player's episodes panel: a glass sheet on the right with the show's seasons and every episode,
// the one playing marked; a click plays an episode from the library or from the addons.
import { useEffect, useRef, useState } from "react";
import { lang, tt } from "./i18n";
import { Episode, genericEpisodeName, IMG, isFinished, Recent, seasonEpisodes, tmdbGet } from "./library";
import { AddonEpisode, episodeOut, episodeToday, NextEpisode, streamAddons } from "./Addons";
import { I, Icon } from "./Screens";
import "./PlayerEpisodes.css";

/** The episode before `ep`: the one before it in its season, or the last of the season before. */
export async function prevEpisodeBefore(ep: AddonEpisode): Promise<NextEpisode | null> {
  const list = await seasonEpisodes(ep.tmdbId, ep.season);
  const p = list.filter((e) => e.episode < ep.episode).sort((x, y) => y.episode - x.episode)[0];
  if (p) return { ...ep, episode: p.episode, out: episodeOut(p), airDate: p.airDate ?? null };
  if (ep.season <= 1) return null;
  const last = (await seasonEpisodes(ep.tmdbId, ep.season - 1)).sort((x, y) => y.episode - x.episode)[0];
  return last ? { ...ep, season: ep.season - 1, episode: last.episode, out: episodeOut(last), airDate: last.airDate ?? null } : null;
}

type LibFile = { path: string; season?: number | null; episode?: number | null };

export function PlayerEpisodes({ ep, files, playing, recent, onFile, onRemote, onClose }: {
  ep: AddonEpisode; files: LibFile[]; playing: string | null; recent: Recent[];
  onFile: (path: string) => void; onRemote: (e: NextEpisode) => void; onClose: () => void;
}) {
  const [seasons, setSeasons] = useState<number[]>([ep.season]);
  const [season, setSeason] = useState(ep.season);
  const [eps, setEps] = useState<Episode[] | null>(null);
  const box = useRef<HTMLElement>(null);
  const addons = streamAddons().length > 0;
  useEffect(() => {
    let alive = true;
    tmdbGet(`/tv/${ep.tmdbId}`).then((d) => {
      const l = ((d?.seasons ?? []) as { season_number: number }[]).map((x) => x.season_number).filter((n) => n > 0);
      if (alive && l.length) setSeasons([...new Set([...l, ep.season])].sort((a, b) => a - b));
    }).catch(() => {});
    return () => { alive = false; };
  }, [ep.tmdbId]);
  useEffect(() => {
    let alive = true;
    setEps(null);
    seasonEpisodes(ep.tmdbId, season).then((l) => alive && setEps(l)).catch(() => alive && setEps([]));
    return () => { alive = false; };
  }, [ep.tmdbId, season]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("keydown", esc, true);
    return () => document.removeEventListener("keydown", esc, true);
  }, []);
  // the playing episode in view
  useEffect(() => { if (eps) box.current?.querySelector(".pe-row.now")?.scrollIntoView({ block: "center" }); }, [eps]);

  const fileOf = (n: number) => files.find((f) => (f.season ?? 1) === season && f.episode === n);
  // episodes only on disk (TMDB doesn't list them) still show
  const numbers = [...new Set([...(eps ?? []).map((e) => e.episode), ...files.filter((f) => (f.season ?? 1) === season && f.episode != null).map((f) => f.episode!)])].sort((a, b) => a - b);
  const fmtDay = (d: string) => new Date(d + "T12:00:00").toLocaleDateString(lang() === "tr" ? "tr-TR" : "en-GB", { day: "numeric", month: "long" });
  return (
    <aside ref={box} className="player-episodes" role="dialog" aria-label={tt("Bölümler")} onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <header>
        <b>{tt("Bölümler")}</b>
        <button className="round" aria-label={tt("Kapat")} onClick={onClose}><Icon d={I.x} size={16} /></button>
      </header>
      {seasons.length > 1 && (
        <div className="pe-seasons">
          {seasons.map((n) => <button key={n} className={"chip" + (n === season ? " on" : "")} onClick={() => setSeason(n)}>{tt("Sezon")} {n}</button>)}
        </div>
      )}
      <div className="pe-list">
        {eps === null && Array.from({ length: 5 }, (_, i) => <div key={i} className="pe-row ghost"><span className="pe-still" /><span className="pe-t"><b>&nbsp;</b></span></div>)}
        {eps && !numbers.length && <p className="muted small">{tt("Bu sezonun bölümleri bulunamadı.")}</p>}
        {eps && numbers.map((n) => {
          const e = eps.find((x) => x.episode === n);
          const f = fileOf(n);
          const key = f?.path ?? `tmdb-ep:${ep.tmdbId}:${season}:${n}`;
          const now = (f && f.path === playing) || (!f && season === ep.season && n === ep.episode);
          const r = f ? recent.find((x) => x.path === f.path) : undefined;
          const pct = r && r.duration ? Math.min(100, (r.time / r.duration) * 100) : 0;
          const seen = isFinished(key) || pct >= 95;
          const out = !e || episodeOut(e) || episodeToday(e);
          const can = !!f || (addons && out);
          const name = e?.name && !genericEpisodeName(e.name) ? e.name : tt("{0}. Bölüm", n);
          const state = now ? (r && r.duration ? tt("Şimdi oynuyor · {0} dk kaldı", Math.max(1, Math.round((r.duration - r.time) / 60))) : tt("Şimdi oynuyor"))
            : seen ? "✓ " + tt("İzlendi")
            : f ? (r ? tt("Yarıda kaldı") : tt("Bilgisayarında"))
            : !out ? (e?.airDate ? tt("Çıkış: {0}", fmtDay(e.airDate)) : tt("Henüz çıkmadı"))
            : addons ? tt("Eklentiden · kaynak seç") : tt("Bilgisayarında yok");
          return (
            <button key={n} className={"pe-row" + (now ? " now" : "") + (seen && !now ? " seen" : "") + (can ? "" : " off")} aria-disabled={!can} aria-current={now || undefined}
              onClick={() => { if (!can || now) return; if (f) onFile(f.path); else onRemote({ ...ep, season, episode: n, out: true, airDate: e?.airDate ?? null }); }}>
              <span className="pe-still" style={e?.still ? { backgroundImage: `url("${IMG}w300${e.still}")` } : undefined}>
                {!e?.still && <Icon d={I.film} size={18} />}
                {pct > 0 && <i style={{ width: pct + "%" }} />}
              </span>
              <span className="pe-t">
                <b>{lang() === "tr" ? "B" : "E"}{n} · {name}</b>
                <small>{state}</small>
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
