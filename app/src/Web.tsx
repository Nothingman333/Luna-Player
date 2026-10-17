// Web search through the user's own plugins (indexer definitions run inside Luna).
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { fmtSize, store } from "./library";
import { I, Icon } from "./Screens";

export type PluginInfo = { file: string; id: string; name: string; site: string; login: boolean; error: string | null };
export type Hit = {
  plugin: string; pluginFile: string; title: string; link: string | null; details: string | null;
  size: number; seeders: number; leechers: number;
};

const disabledList = () => store.json<string[]>("pluginsOff", []);

export function usePlugins() {
  const [list, setList] = useState<PluginInfo[]>([]);
  const refresh = () => invoke<PluginInfo[]>("plugins_list").then(setList).catch(() => setList([]));
  useEffect(() => { refresh(); }, []);
  return { list, refresh };
}

/** Quality tags read from a release title. */
function tags(title: string) {
  const t = title.toLowerCase();
  const out: string[] = [];
  if (/2160p|\b4k\b|uhd/.test(t)) out.push("4K");
  else if (/1080p/.test(t)) out.push("1080p");
  else if (/720p/.test(t)) out.push("720p");
  if (/hdr|dolby.?vision|\bdv\b/.test(t)) out.push("HDR");
  if (/x265|hevc|h\.?265/.test(t)) out.push("HEVC");
  if (/remux/.test(t)) out.push("REMUX");
  return out;
}

// ---------- search results ("Web'de bulunanlar") ----------
export function WebResults({ query, onStream, onDownload }: {
  query: string; onStream: (src: string) => void; onDownload: (src: string) => void;
}) {
  const { list } = usePlugins();
  const active = list.filter((p) => !p.error && !disabledList().includes(p.file));
  const [state, setState] = useState<{ q: string; hits: Hit[]; errors: [string, string][]; busy: boolean }>({ q: "", hits: [], errors: [], busy: false });
  const [resolving, setResolving] = useState<string | null>(null);
  const [showErr, setShowErr] = useState(false);
  const q = query.trim();

  useEffect(() => {
    if (q.length < 2 || !active.length) return;
    setState((s) => ({ ...s, busy: true }));
    const t = setTimeout(() => {
      invoke<{ hits: Hit[]; errors: [string, string][] }>("web_search", { query: q, disabled: disabledList() })
        .then((r) => setState({ q, hits: r.hits, errors: r.errors, busy: false }))
        .catch((e) => setState({ q, hits: [], errors: [["", String(e)]], busy: false }));
    }, 700);
    return () => clearTimeout(t);
  }, [q, active.length]);

  if (!active.length || q.length < 2) return null;

  const go = async (h: Hit, play: boolean) => {
    let src = h.link;
    if (!src && h.details) {
      setResolving(h.title);
      try { src = await invoke<string>("web_resolve", { file: h.pluginFile, url: h.details }); }
      catch (e) { setState((s) => ({ ...s, errors: [...s.errors, [h.plugin, String(e)]] })); }
      setResolving(null);
    }
    if (src) (play ? onStream : onDownload)(src);
  };

  return (
    <section className="row web-results">
      <h2>Web'de bulunanlar <span className="muted small">{state.busy ? "aranıyor…" : state.hits.length}</span>
        {state.errors.length > 0 && !state.busy && (
          <button className="chip warn-chip" onClick={() => setShowErr((v) => !v)}>{state.errors.length} eklenti hata verdi</button>
        )}
      </h2>
      {showErr && (
        <div className="web-errors">{state.errors.map(([p, e], i) => <div key={i}><b>{p || "Arama"}</b>: {e}</div>)}</div>
      )}
      {state.busy && !state.hits.length && <div className="web-loading"><span className="dlp-spin" /> {active.length} eklentide aranıyor…</div>}
      {!state.busy && !state.hits.length && <div className="muted empty-note">Web'de sonuç bulunamadı.</div>}
      <div className="web-list">
        {state.hits.slice(0, 60).map((h, i) => (
          <div key={i} className="web-row">
            <div className="web-main">
              <div className="web-title" title={h.title}>{h.title}</div>
              <div className="web-meta">
                {tags(h.title).map((t) => <span key={t} className="web-tag">{t}</span>)}
                {h.size > 0 && <span>{fmtSize(h.size)}</span>}
                <span className={h.seeders > 20 ? "good" : h.seeders > 0 ? "" : "bad"}>▲ {h.seeders}</span>
                <span className="muted">▼ {h.leechers}</span>
                <span className="muted">· {h.plugin}</span>
              </div>
            </div>
            {resolving === h.title ? <span className="dlp-spin" /> : (
              <>
                <button className="ghost sm" onClick={() => go(h, false)} title="Sadece indir"><Icon d={I.down} size={16} /> İndir</button>
                <button className="primary sm" onClick={() => go(h, true)}><Icon d={I.play} fill size={14} /> İndirerek izle</button>
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------- settings section ----------
export function PluginSettings() {
  const { list, refresh } = usePlugins();
  const [off, setOff] = useState<string[]>(disabledList);
  const [msg, setMsg] = useState<Record<string, string>>({});
  const [err, setErr] = useState("");

  const add = async () => {
    const files = await open({ multiple: true, filters: [{ name: "Eklenti tanımı", extensions: ["yml", "yaml"] }] });
    if (!files) return;
    setErr("");
    try { await invoke("plugins_add", { paths: Array.isArray(files) ? files : [files] }); }
    catch (e) { setErr(String(e)); }
    refresh();
  };
  const toggle = (f: string) => {
    const next = off.includes(f) ? off.filter((x) => x !== f) : [...off, f];
    setOff(next);
    store.set("pluginsOff", JSON.stringify(next));
  };
  const remove = async (f: string) => { await invoke("plugins_remove", { file: f }).catch(() => {}); refresh(); };
  const test = async (p: PluginInfo) => {
    setMsg((m) => ({ ...m, [p.file]: "Deneniyor…" }));
    try {
      const hits = await invoke<Hit[]>("plugin_test", { file: p.file, query: "the" });
      setMsg((m) => ({ ...m, [p.file]: hits.length ? `Çalışıyor · ${hits.length} sonuç (ör. “${hits[0].title.slice(0, 50)}”)` : "Bağlandı ama sonuç gelmedi" }));
    } catch (e) {
      setMsg((m) => ({ ...m, [p.file]: "Hata: " + String(e) }));
    }
  };

  return (
    <div className="field">
      <span>Arama eklentileri (web'de bulunanlar)</span>
      <div className="plugins">
        {!list.length && <div className="muted small">Eklenti yok. Jackett biçimindeki (Cardigann) <code>.yml</code> tanım dosyalarını ekleyebilirsin; arama kutusunda “Web'de bulunanlar” bölümü açılır.</div>}
        {list.map((p) => (
          <div key={p.file} className={"plugin" + (p.error ? " broken" : "")}>
            <label className="look-check">
              <input type="checkbox" checked={!p.error && !off.includes(p.file)} disabled={!!p.error} onChange={() => toggle(p.file)} />
              <b>{p.name}</b>
            </label>
            <span className="muted small ellipsis">{p.error ?? p.site}{p.login ? " · giriş gerektiriyor (desteklenmiyor)" : ""}</span>
            <span className="grow" />
            {!p.error && <button className="chip" onClick={() => test(p)}>Dene</button>}
            <button className="round sm-round" aria-label="Sil" title="Sil" onClick={() => remove(p.file)}><Icon d={I.x} size={14} /></button>
            {msg[p.file] && <div className="plugin-msg small">{msg[p.file]}</div>}
          </div>
        ))}
        {err && <div className="plugin-msg small err">{err}</div>}
        <button className="chip" onClick={add}><Icon d={I.plus} size={14} /> Eklenti ekle (.yml)</button>
      </div>
    </div>
  );
}
