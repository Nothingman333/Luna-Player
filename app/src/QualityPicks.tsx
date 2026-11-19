// "İzleme seçenekleri": for a film or episode that isn't on this computer, one card per quality (4K, 1080p, 720p)
// with the addons' most shared source of it. A click plays it; the menu downloads it or opens every source.
import { useEffect, useState } from "react";
import { tt } from "./i18n";
import { imdbOf, store } from "./library";
import { AddonEpisode, findStreams, Found, seeders, streamAddons, streamHeight, streamTarget } from "./Addons";
import { I, Icon, openMenu } from "./Screens";
import "./QualityPicks.css";

const TIERS: [number, string][] = [[2160, "4K"], [1080, "1080p"], [720, "720p"]];
const PICK = "qualityPick";
const sizeOf = (s: Found["s"]) => `${s.title ?? ""} ${s.description ?? ""}`.match(/💾\s*([\d.,]+\s*[GM]B)/i)?.[1] ?? `${s.title ?? ""} ${s.description ?? ""}`.match(/\b([\d.,]+\s*GB)\b/i)?.[1];
const audioOf = (s: Found["s"]) => {
  const t = `${s.name ?? ""} ${s.title ?? ""} ${s.behaviorHints?.filename ?? ""}`;
  return /atmos/i.test(t) ? "Atmos" : /\b(7\.1)\b/.test(t) ? "7.1" : /\b(5\.1|ddp?5|dd\+?5)/i.test(t) ? "5.1" : undefined;
};
const hdrOf = (s: Found["s"]) => /\b(dv|dolby\.?vision)\b/i.test(`${s.title ?? ""} ${s.behaviorHints?.filename ?? ""}`) ? "DV" : /\bhdr/i.test(`${s.title ?? ""} ${s.behaviorHints?.filename ?? ""}`) ? "HDR" : undefined;

/** The cards on screen: the details page's İndir downloads the chosen quality (or the best one) straight away. */
let shown: { download: () => boolean } | null = null;
export const downloadPickedQuality = () => shown?.download() ?? false;

/** The most shared source of each quality, best quality first. */
export function qualityTiers(found: Found[]): { label: string; f: Found }[] {
  const out: { label: string; f: Found }[] = [];
  for (const [h, label] of TIERS) {
    const f = found.filter(({ s }) => streamHeight(s) === h && streamTarget(s)?.kind !== "browser" && (seeders(s) ?? 1) > 0)
      .sort((a, b) => (seeders(b.s) ?? -1) - (seeders(a.s) ?? -1))[0];
    if (f) out.push({ label, f });
  }
  return out;
}

export function QualityPicks({ type, id, name, onPlay, onDownload, onAll }: {
  type: "movie" | "series"; id: string | null; name: string;
  onPlay: (src: string, name: string) => void; onDownload: (src: string) => void; onAll?: () => void;
}) {
  const [tiers, setTiers] = useState<{ label: string; f: Found }[] | null>(null);
  useEffect(() => {
    let alive = true;
    setTiers(null);
    // no id yet: the IMDb id is still being looked up, the cards already show "searching"
    if (!id) return;
    findStreams(type, id).then((r) => alive && setTiers(qualityTiers(r.found))).catch(() => alive && setTiers([]));
    return () => { alive = false; };
  }, [type, id]);
  const liked = store.get(PICK);
  useEffect(() => {
    if (!tiers?.length) return;
    const me = { download: () => { const t = tiers.find((x) => x.label === store.get(PICK)) ?? tiers[0]; const src = streamTarget(t.f.s)?.src; if (!src) return false; store.set(PICK, t.label); onDownload(src); return true; } };
    shown = me;
    return () => { if (shown === me) shown = null; };
  }, [tiers, onDownload]);
  if (tiers && !tiers.length) return null;
  const go = (label: string, f: Found, act: "play" | "download") => {
    const t = streamTarget(f.s);
    if (!t) return;
    store.set(PICK, label);
    if (act === "play") onPlay(t.src, name); else onDownload(t.src);
  };
  return (
    <section className="qp">
      <div className="qp-head"><b>{tt("İzleme seçenekleri")}</b><span className="muted small">{tt("eklentilerinden · her kalitenin en çok paylaşılanı")}</span></div>
      <div className="qp-row">
        {tiers === null && TIERS.map(([, l], i) => <div key={l} className="qp-card ghost" style={{ animationDelay: i * 0.12 + "s" }} aria-busy="true"><span className="qp-top"><span className="qp-q">{l}</span></span><small className="qp-searching"><i className="qp-spin" aria-hidden="true" />{tt("Aranıyor…")}</small></div>)}
        {tiers?.map(({ label, f }) => {
          const n = seeders(f.s), size = sizeOf(f.s), extra = [audioOf(f.s), hdrOf(f.s)].filter(Boolean).join(" · ");
          return (
            <div key={label} className="qp-cell">
            <button className={"qp-card" + (liked === label ? " on" : "")} title={(f.s.title ?? f.s.name ?? "").replace(/\n/g, " · ")}
              onClick={() => go(label, f, "play")}
              onContextMenu={(e) => openMenu(e, [
                { label: tt("Oynat"), act: () => go(label, f, "play") },
                { label: tt("İndir"), act: () => go(label, f, "download") },
                ...(onAll ? ["sep" as const, { label: tt("Bütün kaynakları göster…"), act: onAll }] : []),
              ])}>
              <span className="qp-top"><span className="qp-q">{label}</span>{size && <span className="muted">{size}</span>}</span>
              <span className="qp-meta">{n != null && <span>👤 {n}</span>}{extra && <span>{extra}</span>}</span>
              <small className="qp-src">{f.addon.manifest.name}</small>
            </button>
            {/* download only, without playing */}
            <button type="button" className="qp-dl" aria-label={tt("{0} indir", label)} title={tt("İzlemeden indir")} onClick={() => go(label, f, "download")}><Icon d={I.down} size={16} /></button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** QualityPicks for a film or an episode known by its TMDB id (the addons need its IMDb id). */
export function TmdbQualityPicks({ film, ep, onPlay, onDownload, onAll }: {
  film?: { tmdbId: number; title: string; year?: string }; ep?: AddonEpisode;
  onPlay: (src: string, name: string) => void; onDownload: (src: string) => void; onAll?: () => void;
}) {
  const [imdb, setImdb] = useState<string | null | undefined>(undefined);
  const tmdbId = film?.tmdbId ?? ep?.tmdbId ?? 0;
  useEffect(() => {
    let alive = true;
    setImdb(undefined);
    imdbOf(ep ? "tv" : "movie", tmdbId).then((x) => alive && setImdb(x)).catch(() => alive && setImdb(null));
    return () => { alive = false; };
  }, [tmdbId, !!ep]);
  if (!streamAddons().length || imdb === null) return null;
  const name = ep ? `${ep.title} — S${String(ep.season).padStart(2, "0")}E${String(ep.episode).padStart(2, "0")}` : film!.year ? `${film!.title} (${film!.year})` : film!.title;
  return <QualityPicks type={ep ? "series" : "movie"} id={!imdb ? null : ep ? `${imdb}:${ep.season}:${ep.episode}` : imdb} name={name} onPlay={onPlay} onDownload={onDownload} onAll={onAll} />;
}

/** Opens App's "Kaynak ekle" window for a film or an episode: its sources, and what is picked downloads as another copy. */
export const addSource = (detail: { film?: { tmdbId: number; title: string; year?: string }; ep?: AddonEpisode; more: boolean }) =>
  window.dispatchEvent(new CustomEvent("luna-add-source", { detail }));
