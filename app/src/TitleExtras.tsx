import {useWatchCountry,countryName} from "./CountrySelect";
import {WatchProviderGroup} from "./WatchProviderGroup";
import { useEffect, useState } from "react";
import { openUrl } from "./linkOpen";
import { tt, lang } from "./i18n";
import { IMG, store, tmdbGet } from "./library";
import { logoUrl, parseProviders, pickLogo, Providers } from "./titleExtrasModel";

const DAY = 24 * 3600 * 1000;
type Slot<T> = { at: number; v: T | null };
async function cachedGet<T>(key: string, ttl: number, load: () => Promise<T | null>): Promise<T | null> {
  const c = store.json<Slot<T> | null>(key, null);
  if (c && Date.now() - c.at < ttl) return c.v;
  try { const v = await load(); store.set(key, JSON.stringify({ at: Date.now(), v } satisfies Slot<T>)); return v; } catch { return c?.v ?? null; }
}


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
  const country=useWatchCountry();
  const [loading,setLoading]=useState(false);
  useEffect(() => {
    setW(null);setLoading(false);
    if (!id || id < 1 || !store.get("tmdbKey")) return;
    let alive = true;
    setLoading(true);
    cachedGet<Where>(`wp:${kind}:${id}:${country}`, 3 * DAY, async () => parseProviders(await tmdbGet(`/${kind}/${id}/watch/providers`), [country])).then(v=>{if(alive){setW(v);setLoading(false);}});
    return () => { alive = false; };
  }, [kind, id, country]);
  if (!id || id<1 || !store.get("tmdbKey")) return null;
  if (!w || w.region!==country) return <div className="ww" aria-label={tt("Nerede izlenir")}><div className="muted small" role="status">{loading?tt("İzleme seçenekleri yükleniyor…"):tt("{0} için izleme bilgisi bulunamadı.",countryName(country))}</div><div className="ww-src">{tt("Nerede izlenir: JustWatch · {0}",country)}</div></div>;
  const { providers: p, region } = w;
  const go = () => void openUrl(p.link ?? `https://www.themoviedb.org/${kind}/${id}/watch?locale=${region}`).catch(() => {});
  return (
    <div className="ww" aria-label={tt("Nerede izlenir")}>
      <WatchProviderGroup label={tt("Abonelikle")} providers={p.flatrate} onOpen={go}/><WatchProviderGroup label={tt("Kirala")} providers={p.rent} onOpen={go}/><WatchProviderGroup label={tt("Satın al")} providers={p.buy} onOpen={go}/>
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
