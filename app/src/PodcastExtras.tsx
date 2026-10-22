import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "./nativeCore";
import { lang, tt } from "./i18n";
import { fmtTime, mpv } from "./mpv";
import { indexAt, mergeCues, parseChaptersJson, parseCues, parseTranscriptJson, pickTranscript, PodChapter, PodCue, PodLink, textParagraphs } from "./podcastExtrasModel";
import { fold } from "./paletteModel";
import "./ExtrasPlus.css";

type Extras = { chapters: PodChapter[]; cues: PodCue[]; paragraphs: string[]; source?: string };
const cache = new Map<string, Promise<Extras>>();
const sameAudio = (a: string, b: string) => a === b || a.split("?")[0] === b.split("?")[0];

/** What the show's own feed offers for this episode (Podcasting 2.0): chapters and a transcript. */
async function loadExtras(feed: string, src: string): Promise<Extras> {
  const xml = await invoke<string>("http_text", { url: feed });
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const item = Array.from(doc.getElementsByTagName("item")).find((it) =>
    Array.from(it.children).some((c) => c.localName === "enclosure" && sameAudio(c.getAttribute("url") ?? "", src)));
  const out: Extras = { chapters: [], cues: [], paragraphs: [] };
  if (!item) return out;
  const kids = Array.from(item.children);
  const chap = kids.find((c) => c.localName === "chapters" && c.getAttribute("url"));
  if (chap) {
    try { out.chapters = parseChaptersJson(JSON.parse(await invoke<string>("http_text", { url: chap.getAttribute("url")! }))); } catch { /* no chapters then */ }
  }
  const links: PodLink[] = kids.filter((c) => c.localName === "transcript" && c.getAttribute("url"))
    .map((c) => ({ url: c.getAttribute("url")!, type: c.getAttribute("type") ?? "", lang: c.getAttribute("language") ?? undefined, rel: c.getAttribute("rel") ?? undefined }));
  const pick = pickTranscript(links, lang());
  if (pick) {
    try {
      const text = await invoke<string>("http_text", { url: pick.url });
      const t = pick.type.toLowerCase();
      if (t.includes("json")) out.cues = mergeCues(parseTranscriptJson(JSON.parse(text)));
      else if (t.includes("vtt") || t.includes("srt") || t.includes("subrip") || text.includes("-->")) out.cues = mergeCues(parseCues(text));
      else out.paragraphs = textParagraphs(text, t.includes("html"));
      out.source = pick.url;
    } catch { /* the transcript could not be read: the chapters still show */ }
  }
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
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let alive = true;
    setX(null);
    const k = feed + "\n" + src;
    if (!cache.has(k)) cache.set(k, loadExtras(feed, src).catch(() => ({ chapters: [], cues: [], paragraphs: [] })));
    cache.get(k)!.then((v) => alive && setX(v));
    return () => { alive = false; };
  }, [feed, src]);
  const cur = x ? indexAt(x.cues, time) : -1;
  const chap = x ? indexAt(x.chapters, time) : -1;
  const shown = useMemo(() => {
    if (!x) return [];
    const t = fold(q);
    return x.cues.map((c, i) => ({ c, i })).filter(({ c }) => !t || fold(c.text).includes(t) || fold(c.speaker ?? "").includes(t));
  }, [x, q]);
  useEffect(() => {
    if (!follow || q || cur < 0) return;
    box.current?.querySelector<HTMLElement>(`[data-cue="${cur}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [cur, follow, q]);
  if (!x || (!x.chapters.length && !x.cues.length && !x.paragraphs.length)) return null;
  const seek = (t: number) => void mpv("seek", t, "absolute");
  return (
    <div className="lx-pod">
      {x.chapters.length > 0 && (
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
      {(x.cues.length > 0 || x.paragraphs.length > 0) && (
        <section>
          <div className="lx-pod-head">
            <h4>{tt("Döküm")}</h4>
            {x.cues.length > 0 && <input className="lx-pod-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tt("Dökümde ara")} aria-label={tt("Dökümde ara")} />}
            {x.cues.length > 0 && <label className="look-check small"><input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />{tt("Sesi takip et")}</label>}
          </div>
          <div className="lx-cues" ref={box}>
            {x.cues.length > 0
              ? shown.map(({ c, i }) => (
                <button key={i} data-cue={i} className={"lx-cue" + (i === cur ? " on" : "")} onClick={() => seek(c.start)}>
                  <span className="lx-t">{fmtTime(c.start)}</span>
                  <span>{c.speaker && <b>{c.speaker}: </b>}{q ? highlight(c.text, q) : c.text}</span>
                </button>))
              : x.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
            {x.cues.length > 0 && shown.length === 0 && <p className="muted small">{tt("Bu sözcük dökümde geçmiyor.")}</p>}
          </div>
          <p className="muted small lx-note">{tt("Döküm ve bölümler podcast'in kendi yayın akışından geliyor.")}</p>
        </section>
      )}
    </div>
  );
}
