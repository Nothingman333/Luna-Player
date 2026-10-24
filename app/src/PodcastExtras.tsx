import { type ReactNode, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "./nativeCore";
import { lang, tt } from "./i18n";
import { fmtTime, mpv } from "./mpv";
import { indexAt, mergeCues, parseChaptersJson, parseCues, parseTranscriptJson, pickTranscript, PodChapter, PodCue, PodLink, sameEpisodeAudio, textParagraphs } from "./podcastExtrasModel";
import { fold } from "./paletteModel";
import { MemoryCache, ResourceCache } from "./memoryCache";
import "./ExtrasPlus.css";

type Extras = { chapters: PodChapter[]; cues: PodCue[]; paragraphs: string[]; source?: string; incomplete?: boolean };
const feeds = new ResourceCache(new MemoryCache<string>({ entries: 12, weight: 2_000_000, age: 90_000, weigh: text => text.length }));
const cache = new ResourceCache(new MemoryCache<Extras>({ entries: 24, weight: 2_000_000, age: 300_000,
  weigh: value => value.cues.reduce((n, c) => n + c.text.length + 80, 0) + value.paragraphs.join("").length + value.chapters.length * 250 }), value => !value.incomplete);

/** What the show's own feed offers for this episode (Podcasting 2.0): chapters and a transcript. */
async function loadExtras(feed: string, src: string): Promise<Extras> {
  const xml = await feeds.get(feed, () => invoke<string>("http_text", { url: feed }));
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) { feeds.delete(feed); throw Error("Invalid podcast feed"); }
  const item = Array.from(doc.getElementsByTagName("item")).find((it) =>
    Array.from(it.children).some((c) => c.localName === "enclosure" && sameEpisodeAudio(c.getAttribute("url") ?? "", src)));
  const out: Extras = { chapters: [], cues: [], paragraphs: [] };
  if (!item) return out;
  const kids = Array.from(item.children);
  const chap = kids.find((c) => c.localName === "chapters" && c.getAttribute("url"));
  const links: PodLink[] = kids.filter((c) => c.localName === "transcript" && c.getAttribute("url"))
    .map((c) => ({ url: c.getAttribute("url")!, type: c.getAttribute("type") ?? "", lang: c.getAttribute("language") ?? undefined, rel: c.getAttribute("rel") ?? undefined }));
  // Chapter and transcript reads are independent. A failed preferred format can use the feed's next one.
  await Promise.all([
    (async () => { if (chap) try { out.chapters = parseChaptersJson(JSON.parse(await invoke<string>("http_text", { url: chap.getAttribute("url")! }))); } catch { out.incomplete = true; } })(),
    (async () => {
      let remaining = links;
      for (let pick = pickTranscript(remaining, lang()); pick; pick = pickTranscript(remaining, lang())) {
        remaining = remaining.filter(link => link !== pick);
        try {
          const text = await invoke<string>("http_text", { url: pick.url }), t = pick.type.toLowerCase();
          if (t.includes("json")) out.cues = mergeCues(parseTranscriptJson(JSON.parse(text)));
          else if (t.includes("vtt") || t.includes("srt") || t.includes("subrip") || text.includes("-->")) out.cues = mergeCues(parseCues(text));
          else out.paragraphs = textParagraphs(text, t.includes("html"));
          if (out.cues.length || out.paragraphs.length) { out.source = pick.url; return; }
        } catch { /* try another format the publisher supplied */ }
      }
      if (links.length) out.incomplete = true;
    })(),
  ]);
  return out;
}

/** The text with every place the search matches marked (Turkish letters and accents fold, as in the search). */
function highlight(text: string, q: string) {
  const f = fold(q);
  if (!f) return text;
  const out: ReactNode[] = [];
  // fold() keeps the length of ordinary letters, so positions in the folded text map back to the original
  const ft = Array.from(text).map((ch) => fold(ch) || ch).join("");
  let from = 0, k = 0;
  for (let at = ft.indexOf(f); at >= 0 && ft.length === text.length; at = ft.indexOf(f, at + f.length)) {
    out.push(text.slice(from, at), <mark key={k++}>{text.slice(at, at + f.length)}</mark>);
    from = at + f.length;
  }
  return out.length ? [...out, text.slice(from)] : text;
}

/** "About this episode": the episode's chapters (click to jump) and its transcript (follows the voice, searchable). */
export function PodcastExtras({ feed, src, time }: { feed: string; src: string; time: number }) {
  const [x, setX] = useState<Extras | null>(null);
  const [q, setQ] = useState("");
  const [follow, setFollow] = useState(true);
  const [retry, setRetry] = useState(0), [error, setError] = useState(false), [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(80), [manualStart, setManualStart] = useState(0);
  const deferred = useDeferredValue(q), query = fold(deferred);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let alive = true;
    setX(null); setError(false); setLoading(true);
    const k = JSON.stringify([feed, src, lang()]);
    cache.get(k, () => loadExtras(feed, src)).then(v => { if (alive) { setX(v); setError(!!v.incomplete); } })
      .catch(() => { if (alive) setError(true); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [feed, src, retry]);
  useEffect(() => { setQ(""); setLimit(80); setManualStart(0); setFollow(true); }, [feed, src]);
  const reload = () => { cache.delete(JSON.stringify([feed, src, lang()])); feeds.delete(feed); setManualStart(0); setLimit(80); setRetry(n => n + 1); };
  const cur = x ? indexAt(x.cues, time) : -1;
  const chap = x ? indexAt(x.chapters, time) : -1;
  const indexed = useMemo(() => x?.cues.map((c, i) => ({ c, i, text: fold(c.text), speaker: fold(c.speaker ?? "") })) ?? [], [x]);
  const shown = useMemo(() => indexed.filter(row => !query || row.text.includes(query) || row.speaker.includes(query)), [indexed, query]);
  useEffect(() => setLimit(80), [query]);
  const start = query ? 0 : follow ? Math.max(0, cur - 30) : manualStart;
  const visible = shown.slice(start, start + limit);
  useEffect(() => {
    if (!follow || q || cur < 0) return;
    const target = box.current?.querySelector<HTMLElement>(`[data-cue="${cur}"]`);
    if (target && box.current) box.current.scrollTo({ top: target.offsetTop - box.current.offsetTop - box.current.clientHeight / 2, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [cur, follow, q]);
  if (!loading && !error && (!x || (!x.chapters.length && !x.cues.length && !x.paragraphs.length))) return null;
  const seek = (t: number) => void mpv("seek", t, "absolute");
  return (
    <div className="lx-pod">
      {loading && <p className="muted small" role="status">{tt("Bölüm bilgileri yükleniyor…")}</p>}
      {error && <div className="lx-pod-retry" role="status"><span>{tt("Bölüm bilgileri tam yüklenemedi.")}</span><button className="lx-pill" disabled={loading} onClick={reload}>{tt("Yeniden dene")}</button></div>}
      {x && x.chapters.length > 0 && (
        <section>
          <h4>{tt("Konu başlıkları")}</h4>
          <ol className="lx-chapters">
            {x.chapters.map((c, i) => (
              <li key={i}><button className={i === chap ? "on" : ""} onClick={() => seek(c.start)}>
                <span className="lx-t">{fmtTime(c.start)}</span><span>{c.title}</span></button></li>
            ))}
          </ol>
        </section>
      )}
      {x && (x.cues.length > 0 || x.paragraphs.length > 0) && (
        <section>
          <div className="lx-pod-head">
            <h4>{tt("Döküm")}</h4>
            {x.cues.length > 0 && <input className="lx-pod-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tt("Dökümde ara")} aria-label={tt("Dökümde ara")} />}
            {q && <button className="lx-pill" onClick={() => setQ("")}>{tt("Aramayı temizle")}</button>}
            {x.cues.length > 0 && <label className="look-check small"><input type="checkbox" checked={follow} onChange={(e) => { if (!e.target.checked) setManualStart(start); setFollow(e.target.checked); }} />{tt("Sesi takip et")}</label>}
          </div>
          {q && <p className="muted small" role="status">{tt("{0}/{1} döküm satırı", shown.length, x.cues.length)}</p>}
          <div className="lx-cues" ref={box}>
            {x.cues.length > 0
              ? visible.map(({ c, i }) => (
                <button key={i} data-cue={i} className={"lx-cue" + (i === cur ? " on" : "")} onClick={() => seek(c.start)}>
                  <span className="lx-t">{fmtTime(c.start)}</span>
                  <span>{c.speaker && <b>{c.speaker}: </b>}{query ? highlight(c.text, deferred) : c.text}</span>
                </button>))
              : x.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
            {x.cues.length > 0 && shown.length === 0 && <p className="muted small">{tt("Bu sözcük dökümde geçmiyor.")}</p>}
          </div>
          {shown.length > visible.length && <div className="lx-pod-pages"><small>{tt("{0}–{1} / {2} satır", start + 1, start + visible.length, shown.length)}</small>{start > 0 && <button className="lx-pill" onClick={() => { setFollow(false); setManualStart(Math.max(0, start - 80)); setLimit(80); }}>{tt("Önceki satırları göster")}</button>}{start + visible.length < shown.length && <button className="lx-pill" onClick={() => { setFollow(false); setManualStart(start); setLimit(n => n + 80); }}>{tt("Daha fazla satır göster")}</button>}</div>}
          <p className="muted small lx-note">{tt("Döküm ve bölümler podcast'in kendi yayın akışından geliyor.")}</p>
        </section>
      )}
    </div>
  );
}
