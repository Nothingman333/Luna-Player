// Stremio addons: small web services the user adds by address. They answer with catalogs (rows on
// Keşfet) and streams (sources on a title's page). Luna ships none of them.
import { lang, tt } from "./i18n";
import { useEffect, useState } from "react";
import { invoke } from "./nativeCore";
import { openUrl } from "./linkOpen";
import { developerSessionActive } from "./devSession";
import { imdbOf, seasonEpisodes, store, tmdbGet } from "./library";
import { I, Icon } from "./Screens";

type Resource = string | { name: string; types?: string[]; idPrefixes?: string[] };
export type Catalog = { type: string; id: string; name?: string; extra?: { name: string; isRequired?: boolean }[]; extraRequired?: string[] };
export type Manifest = {
  id: string; version?: string; name: string; description?: string; logo?: string;
  types?: string[]; idPrefixes?: string[]; resources: Resource[]; catalogs?: Catalog[];
  behaviorHints?: { configurationRequired?: boolean; adult?: boolean };
};
export type Addon = { base: string; manifest: Manifest;
  /** the manifest address's query (an access token…), sent with every request to the addon */
  query?: string };
/** An address on the addon: its base, the path, then the query it was installed with. */
const at = (a: { base: string; query?: string }, path: string) => a.base + path + (a.query ?? "");
export type StreamObj = {
  name?: string; title?: string; description?: string; url?: string; infoHash?: string; fileIdx?: number;
  ytId?: string; externalUrl?: string; sources?: string[]; behaviorHints?: { filename?: string; bingeGroup?: string };
};
export type MetaPreview = { id: string; type: string; name: string; poster?: string; releaseInfo?: string; imdbRating?: string };

const KEY = "stremioAddons";
export const loadAddons = () => store.json<Addon[]>(KEY, []);
const listeners = new Set<() => void>();
const saveAddons = (l: Addon[]) => { store.set(KEY, JSON.stringify(l)); listeners.forEach((f) => f()); };

/** Re-renders when addons are added or removed. */
export function useAddons() {
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => bump((n) => n + 1);
    listeners.add(f);
    return () => { listeners.delete(f); };
  }, []);
  return loadAddons();
}

const get = (url: string) => invoke<any>("addon_get", { url });

/** "stremio://host/…/manifest.json", or the address without manifest.json → the addon's base URL. */
export function addonBase(input: string): string {
  let u = input.trim().replace(/^stremio:\/\//i, "https://");
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  return u.replace(/\/manifest\.json(\?.*)?$/i, "").replace(/\/+$/, "");
}
/** The "?…" after manifest.json ("" when there is none). */
const addonQuery = (input: string) => input.trim().match(/\/manifest\.json(\?[^#]*)/i)?.[1] ?? "";

export async function installAddon(input: string): Promise<Addon> {
  const base = addonBase(input);
  const query = addonQuery(input) || undefined;
  const m: Manifest = await get(at({ base, query }, "/manifest.json"));
  if (!m || typeof m.id !== "string" || typeof m.name !== "string" || !Array.isArray(m.resources))
    throw new Error(tt("Bu adres bir Stremio eklentisi değil"));
  if (m.behaviorHints?.configurationRequired)
    throw new Error(tt("Bu eklentinin önce kendi sitesinde ayarlanması gerekiyor; ayarladıktan sonra verdiği adresi gir"));
  const a: Addon = { base, manifest: m, query };
  saveAddons([...loadAddons().filter((x) => x.base !== base && x.manifest.id !== m.id), a]);
  return a;
}
export const removeAddon = (base: string) => saveAddons(loadAddons().filter((a) => a.base !== base));

/** Whether an addon answers `resource` for this type and id. */
function supports(m: Manifest, resource: string, type: string, id: string) {
  for (const r of m.resources) {
    const name = typeof r === "string" ? r : r.name;
    if (name !== resource) continue;
    const types = (typeof r !== "string" && r.types) || m.types || [];
    const prefixes = (typeof r !== "string" && r.idPrefixes) || m.idPrefixes;
    if (types.includes(type) && (!prefixes || prefixes.some((p) => id.startsWith(p)))) return true;
  }
  return false;
}
export const streamAddons = (l = loadAddons()) => l.filter((a) => a.manifest.resources.some((r) => (typeof r === "string" ? r : r.name) === "stream"));

/** Catalogs that can be shown as a plain row (no search text or genre required). */
export function catalogRows(l = loadAddons()): { addon: Addon; cat: Catalog }[] {
  return l.flatMap((addon) => (addon.manifest.catalogs ?? [])
    .filter((c) => !c.extraRequired?.length && !c.extra?.some((e) => e.isRequired))
    .map((cat) => ({ addon, cat })));
}
export async function catalogItems(addon: Addon, cat: Catalog): Promise<MetaPreview[]> {
  const r = await get(at(addon, `/catalog/${cat.type}/${encodeURIComponent(cat.id)}.json`));
  return (r?.metas ?? []).filter((m: any) => m && m.id && m.name);
}

export type Found = { addon: Addon; s: StreamObj };
/** Streams from every addon that knows this title. `id` is an IMDb id, plus ":season:episode" for a series. */
export async function findStreams(type: "movie" | "series", id: string): Promise<{ found: Found[]; errors: [string, string][]; asked: string[] }> {
  const asked = streamAddons().filter((a) => supports(a.manifest, "stream", type, id));
  const found: Found[] = [];
  const errors: [string, string][] = [];
  await Promise.all(asked.map(async (addon) => {
    try {
      const r = await get(at(addon, `/stream/${type}/${encodeURIComponent(id)}.json`));
      for (const s of r?.streams ?? []) if (s && (s.url || s.infoHash || s.ytId || s.externalUrl)) found.push({ addon, s });
    } catch (e) {
      errors.push([addon.manifest.name, String(e)]);
    }
  }));
  // most shared first (Torrentio's "👤 315"); sources without a count keep the addons' order after them
  const order = asked.map((a) => a.base);
  found.sort((x, y) => (seeders(y.s) ?? -1) - (seeders(x.s) ?? -1) || order.indexOf(x.addon.base) - order.indexOf(y.addon.base));
  return { found, errors, asked: asked.map((a) => a.manifest.name) };
}

/** How many people share a torrent, when the addon says so ("👤 315" or "Seeders: 315"). */
export function seeders(s: StreamObj): number | undefined {
  const m = `${s.title ?? ""}\n${s.description ?? ""}\n${s.name ?? ""}`.match(/(?:👤|seeders?:?)\s*(\d+)/i);
  return m ? Number(m[1]) : undefined;
}

/** The resolution an addon names for a stream ("1080p", "4k"…), as lines of height; undefined when it says none. */
export function streamHeight(s: StreamObj): number | undefined {
  const t = `${s.name ?? ""} ${s.title ?? ""} ${s.behaviorHints?.filename ?? ""}`;
  if (/\b(2160p|4k|uhd)\b/i.test(t)) return 2160;
  const m = t.match(/\b(1080|720|576|480|360)p\b/i);
  return m ? Number(m[1]) : undefined;
}
/** The source Luna picks by itself: 1080p first, then the nearest quality (720p, then 4K, then the rest); the most shared one of that quality. */
export function bestStream(found: Found[]): Found | null {
  const tier = (s: StreamObj) => ({ 1080: 0, 720: 1, 2160: 2 } as Record<number, number>)[streamHeight(s) ?? 0] ?? 3;
  const playable = found.filter(({ s }) => { const t = streamTarget(s); return t && t.kind !== "browser"; });
  const shared = playable.filter(({ s }) => (seeders(s) ?? 1) > 0);
  return [...(shared.length ? shared : playable)].sort((a, b) => tier(a.s) - tier(b.s) || (seeders(b.s) ?? -1) - (seeders(a.s) ?? -1))[0] ?? null;
}

/** Which episode an addon source is (so the player can offer the next one even when it isn't in the library). */
export type AddonEpisode = { tmdbId: number; title: string; season: number; episode: number };
const EP_KEY = "addonEpisodes";
const sourceKey = (src: string) => src.match(/btih:([a-z0-9]+)/i)?.[1]?.toLowerCase() ?? src;
export function addonEpisodeFor(src?: string | null): AddonEpisode | null {
  return src ? store.json<Record<string, AddonEpisode>>(EP_KEY, {})[sourceKey(src)] ?? null : null;
}
function rememberEpisode(src: string, ep: AddonEpisode) {
  const all = Object.entries(store.json<Record<string, AddonEpisode>>(EP_KEY, {})).filter(([k]) => k !== sourceKey(src)).slice(-49);
  store.set(EP_KEY, JSON.stringify(Object.fromEntries([...all, [sourceKey(src), ep]])));
}
/** An episode that isn't on this computer: the best addon source for it (see bestStream), ready to play. */
export async function episodeSource(ep: AddonEpisode): Promise<{ src: string; name: string }> {
  if (!streamAddons().length) throw new Error(tt("Bu bölüm bilgisayarında yok. Ayarlar › Eklentiler'den bir Stremio eklentisi eklersen Luna kaynağı kendisi bulur."));
  const imdb = await imdbOf("tv", ep.tmdbId);
  if (!imdb) throw new Error(tt("Bu başlığın IMDb numarası bulunamadı; eklentiler başlıkları IMDb numarasıyla arar."));
  const { found } = await findStreams("series", `${imdb}:${ep.season}:${ep.episode}`);
  const best = bestStream(found);
  const t = best && streamTarget(best.s);
  if (!t) {
    // no source is often just an episode that isn't out yet: say that instead
    const e = (await seasonEpisodes(ep.tmdbId, ep.season)).find((x) => x.episode === ep.episode);
    throw new Error(e && !episodeOut(e) ? notOutText(e.airDate) : tt("Eklentilerin bu bölüm için kaynak bulamadı."));
  }
  rememberEpisode(t.src, ep);
  return { src: t.src, name: `${ep.title} — S${String(ep.season).padStart(2, "0")}${lang() === "tr" ? "B" : "E"}${String(ep.episode).padStart(2, "0")}` };
}

/** The episode after this one that is already out (the next season's first after a season's last), from TMDB; null when there is none yet. */
export async function nextEpisodeAfter(ep: AddonEpisode): Promise<NextEpisode | null> {
  const list = await seasonEpisodes(ep.tmdbId, ep.season);
  const n = list.find((e) => e.episode === ep.episode + 1);
  if (n) return { ...ep, episode: n.episode, out: episodeOut(n), airDate: n.airDate ?? null };
  if (!list.length || list.some((e) => e.episode > ep.episode)) return null;
  const first = (await seasonEpisodes(ep.tmdbId, ep.season + 1)).sort((x, y) => x.episode - y.episode)[0];
  return first ? { ...ep, season: ep.season + 1, episode: first.episode, out: episodeOut(first), airDate: first.airDate ?? null } : null;
}
/** The next episode, and whether it is out yet (TMDB's air date; no date = not out). */
export type NextEpisode = AddonEpisode & { out: boolean; airDate: string | null };
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** Out for sure: TMDB's air date is the US date (often the evening there, the next day here), so an episode
 *  counts as out from the day after it; on the day itself it is "airs today" (see episodeToday). */
export const episodeOut = (e: { airDate?: string | null }) => !!e.airDate && e.airDate < localDay();
export const episodeToday = (e: { airDate?: string | null }) => !!e.airDate && e.airDate === localDay();
/** "Not out yet" with its date when TMDB has one. */
export const notOutText = (airDate?: string | null) => airDate
  ? tt("Bu bölüm henüz çıkmadı · çıkış: {0}", new Date(airDate + "T12:00:00").toLocaleDateString(lang() === "tr" ? "tr-TR" : "en-GB", { day: "numeric", month: "long", year: "numeric" }))
  : tt("Bu bölüm henüz çıkmadı; çıkış tarihi belli değil.");

/** What Luna does with a stream: play it (a video address or a torrent) or open it in the browser. */
export function streamTarget(s: StreamObj): { kind: "play" | "torrent" | "browser"; src: string } | null {
  if (s.infoHash) {
    const tr = (s.sources ?? []).filter((x) => x.startsWith("tracker:")).map((x) => "&tr=" + encodeURIComponent(x.slice(8)));
    const dn = s.behaviorHints?.filename ? "&dn=" + encodeURIComponent(s.behaviorHints.filename) : "";
    return { kind: "torrent", src: `magnet:?xt=urn:btih:${s.infoHash}${dn}${tr.join("")}${s.fileIdx != null ? "&so=" + s.fileIdx : ""}` };
  }
  if (s.url) return { kind: /^magnet:/i.test(s.url) ? "torrent" : "play", src: s.url };
  if (s.ytId) return { kind: "browser", src: "https://www.youtube.com/watch?v=" + encodeURIComponent(s.ytId) };
  if (s.externalUrl) return { kind: "browser", src: s.externalUrl };
  return null;
}

// ---------- sources list (a title's page) ----------
export function StreamList({ type, id, title, notOut, onPlay, onDownload }: {
  type: "movie" | "series"; id: string; onPlay: (src: string) => void; onDownload: (src: string) => void;
  /** the title it is for, shown with what the addons were asked */
  title?: string;
  /** when the episode isn't out yet: said instead of "no sources" */
  notOut?: string | null;
}) {
  const [st, setSt] = useState<{ busy: boolean; found: Found[]; errors: [string, string][]; asked?: string[] }>({ busy: true, found: [], errors: [] });
  const [all, setAll] = useState(false);
  // a title (and episode) searched by hand replaces the id
  const [base, setBase] = useState<string | null>(null);
  // the text typed by hand: Knaben searches it as it is
  const [text, setText] = useState<string | null>(null);
  useEffect(() => { setBase(null); setText(null); }, [id]);
  const q = base ?? id;
  useEffect(() => {
    let alive = true;
    setSt({ busy: true, found: [], errors: [] });
    setAll(false);
    findStreams(type, q).then(async (r) => {
      if (!alive) return;
      // Knaben when the user typed a search, or when the addons found nothing
      if (!knabenOn() || (!text && r.found.length)) { setSt({ busy: false, ...r }); return; }
      setSt({ busy: true, ...r });
      const [, s, e] = q.split(":");
      const words = text ?? knabenText(title ?? "", type === "series" && s ? Number(s) : null, Number(e));
      const k = words ? await knabenSearch(words) : { found: [], error: null };
      if (!alive) return;
      // a torrent the addons already listed isn't shown twice
      const have = new Set(r.found.map((y) => y.s.infoHash?.toLowerCase()).filter(Boolean));
      const found = [...r.found, ...k.found.filter((x) => !have.has((x.s.infoHash ?? x.s.url?.match(/btih:([a-z0-9]+)/i)?.[1] ?? "").toLowerCase()))]
        .map((x, i) => ({ x, i })).sort((a, b) => ((seeders(b.x.s) ?? -1) - (seeders(a.x.s) ?? -1)) || a.i - b.i).map(({ x }) => x);
      setSt({ busy: false, found, errors: k.error ? [...r.errors, ["Knaben", k.error] as [string, string]] : r.errors, asked: [...r.asked, "Knaben"] });
    });
    return () => { alive = false; };
  }, [type, q, text]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = all ? st.found : st.found.slice(0, 12);
  return (
    <div className="streams">
      <StreamQuery type={type} id={q} title={title} asked={st.asked} onSearch={(next, words) => { if (next) setBase(next); setText(words); }} />
      {st.busy && <div className="muted small pulse">{tt("Eklentilere soruluyor…")}</div>}
      {!st.busy && !st.found.length && <div className="muted small">{notOut || (st.asked && !st.asked.length ? tt("Eklentilerinden hiçbiri bu tür başlıklara kaynak vermiyor.") : tt("Eklentilerin bu başlık için kaynak bulamadı."))}</div>}
      {list.map(({ addon, s }, i) => {
        const t = streamTarget(s);
        if (!t) return null;
        const head = (s.name ?? addon.manifest.name).replace(/\s*\n\s*/g, " · ");
        const body = (s.title ?? s.description ?? "").trim();
        return (
          <div key={i} className="web-row stream-row">
            <div className="grow stream-txt">
              <b>{head}</b>
              {body && <div className="muted small stream-body">{body}</div>}
            </div>
            {t.kind === "browser" ? (
              <button className="ghost sm" onClick={() => openUrl(t.src)}>{tt("Tarayıcıda aç")}</button>
            ) : (
              <>
                {t.kind === "torrent" && <button className="ghost sm" title={tt("Sadece indir")} onClick={() => onDownload(t.src)}><Icon d={I.down} size={16} />  {tt("İndir")}</button>}
                <button className="primary sm" onClick={() => onPlay(t.src)}><Icon d={I.play} fill size={14} />  {tt("Oynat")}</button>
              </>
            )}
          </div>
        );
      })}
      {!all && st.found.length > 12 && <button className="chip" onClick={() => setAll(true)}>{tt("Tümünü göster ({0})", st.found.length)}</button>}
      {!st.busy && st.errors.map(([n, e]) => <div key={n} className="plugin-msg small err">{n}: {e}</div>)}
    </div>
  );
}

// ---------- Knaben: text search over public torrent sites ----------
/** Settings › Eklentiler: on unless turned off. */
export const knabenOn = () => store.get("knabenSearch") !== "0";
/** "Title S01E07" for an episode, the title (year in parentheses made plain) for a film. */
export function knabenText(title: string, season: number | null, episode: number) {
  const name = title.replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
  if (!name) return "";
  return season != null && Number.isFinite(episode) ? `${name} S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}` : name;
}
const KNABEN: Addon = { base: "knaben", manifest: { id: "knaben", name: "Knaben", resources: ["stream"], types: ["movie", "series"] } } as Addon;
type KnabenHit = { title?: string; hash?: string | null; magnetUrl?: string | null; bytes?: number; seeders?: number; liveSeeders?: number; tracker?: string; cachedOrigin?: string };
/** Knaben's hits as streams: name, size and seeders shown like Torrentio's ("💾 1.9 GB 👤 230"). */
export async function knabenSearch(words: string): Promise<{ found: Found[]; error: string | null }> {
  try {
    const r = await invoke<{ hits?: KnabenHit[] }>("knaben_search", { query: words });
    const found: Found[] = [];
    for (const h of r?.hits ?? []) {
      const hash = (h.hash ?? h.magnetUrl?.match(/btih:([a-z0-9]{32,40})/i)?.[1] ?? "").toLowerCase();
      if (!h.title || (!hash && !h.magnetUrl)) continue;
      const seed = h.liveSeeders ?? h.seeders ?? 0;
      const size = h.bytes ? `💾 ${fmtBytes(h.bytes)} ` : "";
      const height = streamHeight({ name: h.title, title: h.title } as StreamObj);
      found.push({ addon: KNABEN, s: {
        name: "Knaben" + (height ? ` · ${height >= 2160 ? "4K" : height + "p"}` : ""),
        title: `${h.title}\n${size}👤 ${seed}${h.tracker ? ` · ${h.tracker}` : ""}`,
        // the magnet as Knaben gives it keeps the site's trackers
        ...(h.magnetUrl ? { url: h.magnetUrl } : { infoHash: hash }),
      } as StreamObj });
    }
    found.sort((a, b) => (seeders(b.s) ?? -1) - (seeders(a.s) ?? -1));
    return { found, error: null };
  } catch (e) {
    return { found: [], error: String(e).replace(/^Error: /, "") };
  }
}
const fmtBytes = (n: number) => n >= 1024 ** 3 ? (n / 1024 ** 3).toFixed(1) + " GB" : Math.round(n / 1024 ** 2) + " MB";

/** Settings › Oynatma: Luna picks a missing episode's source by itself (off: the sources list opens). */
export const autoSource = () => store.get("autoSource") === "1";
/** Opens the sources list of an episode (the player shows it over everything). */
export const showEpisodeSources = (ep: AddonEpisode) => window.dispatchEvent(new CustomEvent("luna-episode-sources", { detail: ep }));

/** What the addons were asked, with the name editable: addons look titles up by IMDb number, so a typed name
 *  is found on TMDB first (or an IMDb number "tt…" is used as it is) and the addons are asked again. */
function StreamQuery({ type, id, title, asked, onSearch }: { type: "movie" | "series"; id: string; title?: string; asked?: string[]; onSearch: (id: string | null, words: string) => void }) {
  const [, season, episode] = id.split(":");
  // the whole query is one text: name plus "S1E7" for an episode, all of it editable
  const initial = (title ?? "") + (type === "series" && season ? ` S${season}${lang() === "tr" ? "B" : "E"}${episode}` : "");
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [found, setFound] = useState("");
  useEffect(() => setName(initial), [title]); // eslint-disable-line react-hooks/exhaustive-deps
  const go = async () => {
    let q = name.trim();
    if (!q || busy) return;
    setErr(""); setFound("");
    // season and episode from the text: S1E7, S01B07, S1:B7, 1x07; without them the list's own are kept
    let se = season ? `:${season}:${episode}` : "";
    const m = type === "series" ? q.match(/\bS(?:ezon)?\s*(\d{1,3})\s*[:.]?\s*(?:E|B|Bölüm|Ep)?\s*(\d{1,4})\b|\b(\d{1,3})x(\d{1,4})\b/i) : null;
    if (m) { se = `:${Number(m[1] ?? m[3])}:${Number(m[2] ?? m[4])}`; q = (q.slice(0, m.index) + q.slice(m.index! + m[0].length)).trim(); }
    const [, s2, e2] = se.split(":");
    // for Knaben: the name as typed, with the episode in the usual "S01E07" form
    const words = knabenText(q.replace(/tt\d{5,}/, "").trim() || (title ?? ""), s2 ? Number(s2) : null, Number(e2));
    const tt0 = q.match(/tt\d{5,}/)?.[0];
    if (tt0) { onSearch(tt0 + se, words); return; }
    if (!q) { setErr(tt("Bu adla bir başlık bulunamadı.")); return; }
    setBusy(true);
    try {
      const kind = type === "series" ? "tv" : "movie";
      const r = await tmdbGet(`/search/${kind}`, { query: q }) as { results?: { id: number; name?: string; title?: string; first_air_date?: string; release_date?: string }[] };
      const hit = r?.results?.[0];
      const imdb = hit ? await imdbOf(kind, hit.id) : null;
      if (imdb && hit) {
        const year = (hit.first_air_date || hit.release_date || "").slice(0, 4);
        setFound(`${hit.name || hit.title || q}${year ? ` (${year})` : ""}`);
        onSearch(imdb + se, words);
      } else if (knabenOn()) onSearch(null, words);
      else setErr(tt("Bu adla bir başlık bulunamadı."));
    } catch (e) { if (knabenOn()) onSearch(null, words); else setErr(String(e).replace(/^Error: /, "")); }
    setBusy(false);
  };
  return (
    <div className="muted small stream-query">
      <form onSubmit={(e) => { e.preventDefault(); void go(); }}>
        <span>{tt("Aranan")}:</span>
        <input value={name} onChange={(e) => setName(e.target.value)} aria-label={tt("Aranan ad")} spellCheck={false} onKeyDown={(e) => e.stopPropagation()} />
        <button className="chip" type="submit" disabled={busy || !name.trim()}>{busy ? tt("Aranıyor…") : tt("Ara")}</button>
        {asked?.length ? <span>· {asked.join(", ")}</span> : null}
      </form>
      {found && <div>{tt("Bulunan: {0}", found)}</div>}
      {err && <div className="err">{err}</div>}
    </div>
  );
}

/** The sources list of one episode (the one "İzle" shows), for when its saved video can't be opened any more. */
/** "Webde ara", as on a title's İzle (developer session only): a web search for the episode, in Luna's browser
 *  or the system one by the developer setting; the video played there is matched to the episode as on İzle. */
export function EpisodeWebSearch({ ep, onOpen }: { ep: AddonEpisode; onOpen?: () => void }) {
  const [on, setOn] = useState(developerSessionActive);
  useEffect(() => { const sync = () => setOn(developerSessionActive()); window.addEventListener("luna-dev-session", sync); return () => window.removeEventListener("luna-dev-session", sync); }, []);
  if (!on) return null;
  const go = () => {
    const url = "https://yandex.com/search/?text=" + encodeURIComponent(`${knabenText(ep.title, ep.season, ep.episode)} izle`);
    onOpen?.();
    if (store.get("devWatchTarget") === "luna") window.dispatchEvent(new CustomEvent("luna-browser-open", { detail: { url } }));
    else void openUrl(url);
  };
  return <button className="chip" onClick={go}>{tt("Web'de ara")}</button>;
}

/** "Webde ara" for a film (developer session only), like EpisodeWebSearch. */
export function FilmWebSearch({ title, year, onOpen }: { title: string; year?: string; onOpen?: () => void }) {
  const [on, setOn] = useState(developerSessionActive);
  useEffect(() => { const sync = () => setOn(developerSessionActive()); window.addEventListener("luna-dev-session", sync); return () => window.removeEventListener("luna-dev-session", sync); }, []);
  if (!on) return null;
  const go = () => {
    const url = "https://yandex.com/search/?text=" + encodeURIComponent(`${title}${year ? " " + year : ""} izle`);
    onOpen?.();
    if (store.get("devWatchTarget") === "luna") window.dispatchEvent(new CustomEvent("luna-browser-open", { detail: { url } }));
    else void openUrl(url);
  };
  return <button className="chip" onClick={go}>{tt("Web'de ara")}</button>;
}

export function EpisodeSources({ ep, onPlay, onDownload }: { ep: AddonEpisode; onPlay: (src: string, name: string) => void; onDownload: (src: string) => void }) {
  const [imdb, setImdb] = useState<string | null | undefined>(undefined);
  const [notOut, setNotOut] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setImdb(undefined);
    imdbOf("tv", ep.tmdbId).then((x) => alive && setImdb(x)).catch(() => alive && setImdb(null));
    return () => { alive = false; };
  }, [ep.tmdbId]);
  // an episode not out yet has no sources: say that instead of "nothing found"
  useEffect(() => {
    let alive = true;
    setNotOut(null);
    seasonEpisodes(ep.tmdbId, ep.season).then((l) => {
      const e = l.find((x) => x.episode === ep.episode);
      if (alive && e && !episodeOut(e)) setNotOut(notOutText(e.airDate ?? null));
    }).catch(() => {});
    return () => { alive = false; };
  }, [ep.tmdbId, ep.season, ep.episode]);
  const name = `${ep.title} — S${String(ep.season).padStart(2, "0")}${lang() === "tr" ? "B" : "E"}${String(ep.episode).padStart(2, "0")}`;
  if (imdb === undefined) return <div className="muted small pulse">{tt("Hazırlanıyor…")}</div>;
  if (!imdb) return <div className="muted small">{tt("Bu başlığın IMDb numarası bulunamadı; eklentiler başlıkları IMDb numarasıyla arar.")}</div>;
  return <StreamList type="series" id={`${imdb}:${ep.season}:${ep.episode}`} title={ep.title} notOut={notOut}
    onPlay={(src) => { rememberEpisode(src, ep); onPlay(src, name); }} onDownload={(src) => { rememberEpisode(src, ep); onDownload(src); }} />;
}

/** A film's sources from the addons (by its TMDB id), e.g. when a saved web video stopped opening. */
export function FilmSources({ tmdbId, title, year, onPlay, onDownload }: { tmdbId: number; title: string; year?: string; onPlay: (src: string, name: string) => void; onDownload: (src: string) => void }) {
  const [imdb, setImdb] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    setImdb(undefined);
    imdbOf("movie", tmdbId).then((x) => alive && setImdb(x)).catch(() => alive && setImdb(null));
    return () => { alive = false; };
  }, [tmdbId]);
  const name = year ? `${title} (${year})` : title;
  if (imdb === undefined) return <div className="muted small pulse">{tt("Hazırlanıyor…")}</div>;
  if (!imdb) return <div className="muted small">{tt("Bu başlığın IMDb numarası bulunamadı; eklentiler başlıkları IMDb numarasıyla arar.")}</div>;
  return <StreamList type="movie" id={imdb} title={name} onPlay={(src) => onPlay(src, name)} onDownload={onDownload} />;
}

// ---------- settings section ----------
export function AddonSettings() {
  const list = useAddons();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const add = async () => {
    if (!url.trim() || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const a = await installAddon(url);
      setMsg({ text: tt("Eklendi: {0}", a.manifest.name) });
      setUrl("");
    } catch (e) {
      setMsg({ text: String(e).replace(/^Error: /, ""), err: true });
    } finally {
      setBusy(false);
    }
  };
  const what = (m: Manifest) => {
    const res = m.resources.map((r) => (typeof r === "string" ? r : r.name));
    return [
      (m.catalogs?.length ?? 0) > 0 && tt("katalog"),
      res.includes("stream") && tt("kaynak"),
      res.includes("subtitles") && tt("altyazı"),
      res.includes("meta") && tt("bilgi"),
    ].filter(Boolean).join(" · ");
  };
  return (
    <div className="field">
      <span>{tt("Stremio eklentileri")}</span>
      <div className="plugins">
        {!list.length && <div className="muted small">{tt("Eklenti yok. Bir Stremio eklentisinin adresini (…/manifest.json) yapıştır: katalogları Keşfet'te satır olur, kaynakları film sayfasında listelenir. Hangi eklentiyi kuracağın ve ne izlediğin senin sorumluluğunda.")}</div>}
        {list.map((a) => (
          <div key={a.base} className="plugin">
            {a.manifest.logo && <img className="addon-logo" src={a.manifest.logo} alt="" />}
            <b>{a.manifest.name}</b>
            <span className="muted small ellipsis" title={a.manifest.description}>{[a.manifest.version && "v" + a.manifest.version, what(a.manifest)].filter(Boolean).join(" · ")}</span>
            <span className="grow" />
            <button className="round sm-round" aria-label={tt("Sil")} title={tt("Sil")} onClick={() => removeAddon(a.base)}><Icon d={I.x} size={14} /></button>
          </div>
        ))}
        <form className="addon-add" onSubmit={(e) => { e.preventDefault(); add(); }}>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…/manifest.json" />
          <button className="chip" disabled={!url.trim() || busy}><Icon d={I.plus} size={14} />  {busy ? tt("Ekleniyor…") : tt("Ekle")}</button>
        </form>
        {msg && <div className={"plugin-msg small" + (msg.err ? " err" : "")}>{msg.text}</div>}
        <label className="look-check">
          <input type="checkbox" defaultChecked={knabenOn()} onChange={(e) => store.set("knabenSearch", e.target.checked ? "1" : "0")} />
          {tt("Metinle torrent araması (Knaben)")}
        </label>
        <div className="set-hint">{tt("Kaynak listesinde yazdığın arama Knaben'de (açık torrent sitelerinin ücretsiz dizini) olduğu gibi aranır; eklentiler bir şey bulamazsa da sorulur. Knaben'e yalnız arama metni gider.")}</div>
      </div>
    </div>
  );
}
