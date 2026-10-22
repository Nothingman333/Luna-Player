import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { tt, lang } from "./i18n";
import { IMG, store, tmdbGet } from "./library";
import { logoUrl, parseProviders, pickLogo, Provider, Providers } from "./titleExtrasModel";

const DAY = 24 * 3600 * 1000;
type Slot<T> = { at: number; v: T | null };
async function cachedGet<T>(key: string, ttl: number, load: () => Promise<T | null>): Promise<T | null> {
  const c = store.json<Slot<T> | null>(key, null);
  if (c && Date.now() - c.at < ttl) return c.v;
  try { const v = await load(); store.set(key, JSON.stringify({ at: Date.now(), v } satisfies Slot<T>)); return v; } catch { return c?.v ?? null; }
}
const regions = () => (lang() === "tr" ? ["TR", "US", "GB"] : ["US", "GB", "TR"]);

/** The title's own logo (TMDB), or null while it loads, when there is none, or without a TMDB key. */
export function useTitleLogo(kind: "movie" | "tv" | undefined, id: number | undefined): string | null {
  const [path, setPath] = useState<string | null>(null);
  useEffect(() => {
    setPath(null);
    if (!kind || !id || id < 1 || !store.get("tmdbKey")) return;
    let alive = true;
    cachedGet<string>(`tl:${kind}:${id}:${lang()}`, 30 * DAY, async () => pickLogo(await tmdbGet(`/${kind}/${id}/images`, { include_image_language: `${lang()},en,null` }), lang()))
      .then((p) => alive && setPath(p));
    return () => { alive = false; };
  }, [kind, id]);
  return path ? logoUrl(path, IMG) : null;
}

type Where = { region: string; providers: Providers };
/** "Where to watch" chips for a title the library doesn't hold (or does): the data is JustWatch's, via TMDB, and must say so. */
export function WhereToWatch({ kind, id }: { kind: "movie" | "tv"; id: number }) {
  const [w, setW] = useState<Where | null>(null);
  useEffect(() => {
    setW(null);
    if (!id || id < 1 || !store.get("tmdbKey")) return;
    let alive = true;
    cachedGet<Where>(`wp:${kind}:${id}`, 3 * DAY, async () => parseProviders(await tmdbGet(`/${kind}/${id}/watch/providers`), regions())).then((v) => alive && setW(v));
    return () => { alive = false; };
  }, [kind, id]);
  if (!w) return null;
  const { providers: p, region } = w;
  const go = () => void openUrl(p.link ?? `https://www.themoviedb.org/${kind}/${id}/watch?locale=${region}`).catch(() => {});
  const group = (label: string, list: Provider[]) => list.length > 0 && (
    <div className="ww-group"><span className="ww-label">{label}</span>
      {list.slice(0, 8).map((x) => (
        <button key={x.id} className="ww-chip" onClick={go} title={x.name}>
          {x.logo ? <img src={IMG + "w92" + x.logo} alt="" loading="lazy" /> : null}<span>{x.name}</span>
        </button>
      ))}
    </div>
  );
  return (
    <div className="ww" aria-label={tt("Nerede izlenir")}>
      {group(tt("Abonelikle"), p.flatrate)}{group(tt("Kirala"), p.rent)}{group(tt("Satın al"), p.buy)}
      <div className="ww-src">{tt("Nerede izlenir: JustWatch · {0}", region)}</div>
    </div>
  );
}

/** The page's heading: the title's logo when TMDB has one (the text stays for screen readers), else the plain title. */
export function TitleLogo({ kind, id, title }: { kind?: "movie" | "tv"; id?: number; title: string }) {
  const logo = useTitleLogo(kind, id);
  const [bad, setBad] = useState(false);
  useEffect(() => setBad(false), [logo]);
  return logo && !bad
    ? <><h1 className="d-title-sr">{title}</h1><img className="d-logo" src={logo} alt="" onError={() => setBad(true)} /></>
    : <h1>{title}</h1>;
}
