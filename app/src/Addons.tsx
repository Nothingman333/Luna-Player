// Stremio addons: small web services the user adds by address. They answer with catalogs (rows on
// Keşfet) and streams (sources on a title's page). Luna ships none of them.
import { tt } from "./i18n";
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { store } from "./library";
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
export async function findStreams(type: "movie" | "series", id: string): Promise<{ found: Found[]; errors: [string, string][] }> {
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
  // keep the addons' own order (they sort by quality), addon by addon as installed
  const order = asked.map((a) => a.base);
  found.sort((x, y) => order.indexOf(x.addon.base) - order.indexOf(y.addon.base));
  return { found, errors };
}

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
export function StreamList({ type, id, onPlay, onDownload }: {
  type: "movie" | "series"; id: string; onPlay: (src: string) => void; onDownload: (src: string) => void;
}) {
  const [st, setSt] = useState<{ busy: boolean; found: Found[]; errors: [string, string][] }>({ busy: true, found: [], errors: [] });
  const [all, setAll] = useState(false);
  useEffect(() => {
    let alive = true;
    setSt({ busy: true, found: [], errors: [] });
    setAll(false);
    findStreams(type, id).then((r) => alive && setSt({ busy: false, ...r }));
    return () => { alive = false; };
  }, [type, id]);
  const list = all ? st.found : st.found.slice(0, 12);
  return (
    <div className="streams">
      {st.busy && <div className="muted small pulse">{tt("Eklentilere soruluyor…")}</div>}
      {!st.busy && !st.found.length && <div className="muted small">{tt("Eklentilerin bu başlık için kaynak bulamadı.")}</div>}
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
      </div>
    </div>
  );
}
