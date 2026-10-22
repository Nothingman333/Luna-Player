import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { store } from "./library";
import { tt, locale } from "./i18n";
import { goPlace } from "./Mine";
import { reviewAi, reviewAiJson, reviewAiName } from "./ai";
import { filmKey } from "./filmReviewModel";
import type { Aspect, FilmTarget, Mood, Profile } from "./filmReviewModel";
import { BATCH, batchPrompt, cleanBatch, cleanRun, cleanVerdict, communityScore, keepReview, summaryPrompt, tally } from "./reviewAnalysis";
import type { AiRun, ItemTone, LbReview, Medium, RunReview, Tone, Topic } from "./reviewAnalysis";
import { askAssistant } from "./Taste";
import { normalizeText } from "./filmReviewModel";
import { learnedTaste, personalScore, rememberAspects, tasteLine } from "./reviewTaste";

export type { AiRun, AiVerdict } from "./reviewAnalysis";

/** Luna Analiz: reads the title's most popular Letterboxd reviews (Settings › Review analysis sets
 *  how many and which AI) and shows them scrolling by as they come in. The AI then reads them in
 *  batches of ten — each review gets its tone and gist while it is read — and sums them up: score,
 *  what most reviewers agree on, where they split, themes, who it is for, and a score for this user
 *  from their taste (reviewTaste.ts). The reviews also go to the local keyword scan. */
const toneLabel = (t: Tone) => tt(({ positive: "Olumlu", mixed: "Karışık", negative: "Olumsuz", unclear: "Belirsiz" } as const)[t]);
const itemLabel = (t: ItemTone) => tt(({ positive: "Olumlu", mixed: "Karışık", negative: "Olumsuz", neutral: "Fikir yok" } as const)[t]);
const itemClass = (t: ItemTone) => (t === "neutral" ? "unclear" : t);
/** Stars drawn, with a real half star (the "½" character looked out of place). */
const STAR = "M12 2.5l2.9 6.2 6.6.8-4.9 4.6 1.3 6.6L12 17.4l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z";
export function Stars({ value, size = 13 }: { value: number; size?: number }) {
  const full = Math.floor(value), half = value - full >= 0.5;
  const clip = "lh" + useId().replace(/[^a-z0-9]/gi, "");
  return <span className="la-stars" role="img" aria-label={tt("{0} yıldız", value.toLocaleString(locale()))}>
    {Array.from({ length: full + (half ? 1 : 0) }, (_, i) => <svg key={i} width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      {half && i === full ? <><defs><clipPath id={clip}><rect x="0" y="0" width="12" height="24" /></clipPath></defs><path d={STAR} fill="currentColor" clipPath={`url(#${clip})`} /><path d={STAR} fill="none" stroke="currentColor" strokeWidth="1.4" opacity=".45" /></>
        : <path d={STAR} fill="currentColor" />}
    </svg>)}
  </span>;
}
const num = (x: number) => x.toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const LONG = 420;
type Phase = "" | "fetch" | "read" | "sum";

/** Retries once: a model sometimes answers with broken JSON. */
async function ask<T>(system: string, user: string, clean: (x: any) => T | null, cfg = reviewAi()): Promise<T | null> {
  for (let i = 0; i < 2; i++) {
    try { const v = clean(await reviewAiJson(system, user, cfg)); if (v) return v; }
    catch (e) { if (String((e as Error)?.message ?? e) === "nokey" || i === 1) throw e; }
    await sleep(800);
  }
  return null;
}

function ReviewLine({ r, reading, order = 0, label }: { r: RunReview; reading: boolean; order?: number; label: (a: Aspect) => string }) {
  const [open, setOpen] = useState(false), [shown, setShown] = useState(!r.spoiler);
  const read = r.read;
  const long = r.text.length > LONG;
  return <article className={"la-rv" + (reading ? " -reading" : "") + (read ? " -t-" + itemClass(read.tone) : "")} style={reading ? { ["--i" as any]: order } : undefined}>
    <div className="la-rv-face" aria-hidden>{(r.author || "?")[0].toUpperCase()}</div>
    <div className="la-rv-main">
      <div className="la-rv-top">
        <b>{r.author || "—"}</b>
        {r.stars != null && <Stars value={r.stars} />}
        {r.best && <span className="la-pill -good">✦ {tt("en iyi gerekçe")}</span>}
        {r.worst && <span className="la-pill -bad">{tt("en sert eleştiri")}</span>}
        <span className="grow" />
        {read && <span className="la-rv-tag">{read.topic === "general" ? tt("Genel") : label(read.topic as Aspect)} · <i className={"-" + itemClass(read.tone)}>{itemLabel(read.tone)}</i></span>}
      </div>
      {!shown
        ? <button className="la-spoiler" onClick={() => setShown(true)}>{tt("Spoiler içeriyor · göster")}</button>
        : <p className={"la-rv-text" + (long && !open ? " -cut" : "")}>{r.text}</p>}
      {shown && long && <button className="la-more" onClick={() => setOpen((x) => !x)}>{open ? tt("Daha az göster") : tt("Devamını oku")}</button>}
      {read?.gist && <p className="la-rv-gist">{read.gist}</p>}
    </div>
  </article>;
}

/** The reviews as a scrolling feed: during fetching it follows the newest, during reading the batch being read. */
function Feed({ list, reading, follow, label, done }: { list: RunReview[]; reading: [number, number] | null; follow: boolean; label: (a: Aspect) => string; done?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || !follow) return;
    // (set directly: a smooth scroll restarted every few ms never gets anywhere; the cards animate in instead)
    if (reading) {
      const first = el.children[reading[0]] as HTMLElement | undefined;
      if (first) el.scrollTop = first.offsetTop - el.offsetTop - 8;
    } else el.scrollTop = el.scrollHeight;
  }, [list.length, reading?.[0], follow]);
  return <div className={"la-feed" + (done ? " -done" : "")} ref={box}>
    {list.map((r, i) => <ReviewLine key={i + r.author + r.text.slice(0, 20)} r={r} reading={!!reading && i >= reading[0] && i < reading[1]} order={reading ? i - reading[0] : 0} label={label} />)}
  </div>;
}

/** Luna's on/off switch (instead of a bare checkbox). */
export function Switch({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return <button role="switch" aria-checked={on} aria-label={label} className={"la-switch" + (on ? " on" : "")} onClick={() => onChange(!on)}><span /></button>;
}

function Split({ counts }: { counts: Record<ItemTone, number> }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (!total) return null;
  const order: ItemTone[] = ["positive", "mixed", "negative", "neutral"];
  return <div className="la-split">
    <div className="la-split-bar">{order.filter((t) => counts[t]).map((t) => <span key={t} className={"-" + itemClass(t)} style={{ flexGrow: counts[t] }} />)}</div>
    <div className="la-split-legend">{order.filter((t) => counts[t]).map((t) => <span key={t}><i className={"-" + itemClass(t)} />{itemLabel(t)} <b>%{Math.round((counts[t] / total) * 100)}</b></span>)}</div>
  </div>;
}

export function ReviewAiCard({ film, profile, mood, setMood, label, onReviews, onRun, medium = "film", author }: {
  film: FilmTarget; profile: Profile; mood: Mood; setMood: (m: Mood) => void; label: (a: Aspect) => string;
  onReviews: (json: string) => void; onRun?: (r: AiRun) => void;
  /** "book": the reviews come from 1000Kitap and the topics are named for books */
  medium?: Medium; author?: string;
}) {
  const book = medium === "book";
  const site = book ? "1000Kitap" : "Letterboxd";
  const key = book ? "bookAnalysis:" + encodeURIComponent(normalizeText(film.title + "|" + (author ?? "")).trim()) : "filmDecision:ai:" + filmKey(film);
  const [run, setRun] = useState<AiRun | null>(() => cleanRun(store.json(key, null)));
  const [phase, setPhase] = useState<Phase>("");
  const [status, setStatus] = useState(""), [error, setError] = useState("");
  const [feed, setFeed] = useState<RunReview[]>([]);
  const [reading, setReading] = useState<[number, number] | null>(null);
  const [step, setStep] = useState<[number, number]>([0, 0]);
  const [showAll, setShowAll] = useState(false);
  const [filter, setFilter] = useState<ItemTone | "all">("all");
  const [opts, setOpts] = useState(false);
  const [, redraw] = useState(0);
  const optsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!opts) return;
    const away = (e: MouseEvent) => { if (!optsRef.current?.contains(e.target as Node)) setOpts(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpts(false); };
    document.addEventListener("mousedown", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [opts]);
  const queue = useRef<LbReview[]>([]);
  const ticket = useRef(0);
  useEffect(() => () => { ticket.current++; }, []);
  const cfg = reviewAi();
  const inApp = "__TAURI_INTERNALS__" in window;
  // the taste learned from films is about films; a book is weighed by its own preferences only
  const learned = learnedTaste(book ? "book" : "film");

  // the fetched reviews drip into the feed one by one
  useEffect(() => {
    if (phase !== "fetch") return;
    const id = setInterval(() => {
      const next = queue.current.shift();
      if (next) setFeed((f) => [...f, { ...next, read: null }]);
    }, 85);
    return () => clearInterval(id);
  }, [phase]);

  const start = async () => {
    const t = ++ticket.current;
    const live = () => t === ticket.current;
    if (!cfg.use.key) { setError(tt("Yorum analizi için seçilen yapay zekânın anahtarı yok. Ayarlar › Hesaplar ve anahtarlar.")); return; }
    setError(""); setFeed([]); queue.current = []; setReading(null); setStep([0, 0]);
    setPhase("fetch"); setStatus(tt("Letterboxd'da aranıyor…"));
    const stops = inApp ? await Promise.all([
      listen<string>("lb-reviews-progress", (e) => { if (live()) setStatus(e.payload); }),
      listen<LbReview[]>("lb-reviews-found", (e) => { if (live()) queue.current.push(...e.payload); }),
    ]) : [];
    try {
      const year = film.year ? String(film.year).slice(0, 4) : undefined;
      const got = book
        ? await invoke<{ url: string; reviews: LbReview[]; rating: number | null; readers: number | null }>("book_reviews", { title: film.title, author: author ?? null, count: cfg.count })
        : await invoke<{ url: string; reviews: LbReview[]; rating?: number | null; readers?: number | null }>("letterboxd_reviews", { tmdb: film.id && film.id > 0 ? film.id : null, tv: film.kind === "tv", title: film.title, year, count: cfg.count, spoilers: cfg.spoilers });
      if (!live()) return;
      if (!got.reviews.length) throw new Error(book ? tt("1000Kitap'ta bu kitap için inceleme bulunamadı.") : tt("Letterboxd'da bu eser için yorum bulunamadı."));
      // let the feed finish scrolling in, then use the full list
      for (let i = 0; i < 100 && queue.current.length && live(); i++) await sleep(100);
      if (!live()) return;
      queue.current = [];
      const reviews: RunReview[] = got.reviews.map((r) => ({ ...r, read: null }));
      setFeed(reviews.slice());
      onReviews(JSON.stringify({ reviews: got.reviews.map((r) => ({ text: r.text.slice(0, 4000), source: site + " · " + r.author + (r.stars ? " · " + r.stars + "★" : "") })) }));

      // 1) read in batches: each review gets its tone, depth, topic and gist
      setPhase("read");
      const tr = locale().startsWith("tr");
      const batches = Math.ceil(reviews.length / BATCH);
      let failed = 0;
      for (let b = 0; b < batches; b++) {
        const off = b * BATCH, part = reviews.slice(off, off + BATCH);
        setReading([off, off + part.length]); setStep([b + 1, batches]);
        setStatus(tt("{0}–{1}. yorumlar okunuyor", off + 1, off + part.length));
        const { system, user } = batchPrompt(film, part, off, tr, medium);
        const res = await ask(system, user, (x) => { const c = cleanBatch(x, off, part.length); return c.items.size ? c : null; }, cfg).catch((e) => { if (String((e as Error)?.message ?? e) === "nokey") throw e; return null; });
        if (!live()) return;
        if (!res) { failed++; continue; }
        for (const [n, it] of res.items) reviews[n - 1] = { ...reviews[n - 1], read: it };
        for (const n of res.best) reviews[n - 1] = { ...reviews[n - 1], best: true };
        for (const n of res.worst) reviews[n - 1] = { ...reviews[n - 1], worst: true };
        setFeed(reviews.slice());
      }
      if (failed === batches) throw new Error(tt("Yapay zekânın cevabı okunamadı. Tekrar dene ya da Ayarlar'dan başka bir model seç."));

      // 2) sum it all up
      setReading(null); setPhase("sum");
      setStatus(tt("{0} yorum okundu · ortak düşünceler çıkarılıyor…", reviews.length));
      const { system, user } = summaryPrompt(film, reviews, profile, mood, cfg.note, tasteLine(profile, learned, book ? "book" : "film"), tr, medium);
      const verdict = await ask(system, user, cleanVerdict, cfg);
      if (!live()) return;
      if (!verdict) throw new Error(tt("Yapay zekânın cevabı okunamadı. Tekrar dene ya da Ayarlar'dan başka bir model seç."));
      const rated = reviews.filter((r) => r.stars);
      const { counts, topics } = tally(reviews);
      const next: AiRun = {
        at: Date.now(), url: got.url, count: reviews.length, spoilers: reviews.filter((r) => r.spoiler).length,
        stars: rated.length ? Math.round((rated.reduce((s, r) => s + r.stars!, 0) / rated.length) * 10) / 10 : null,
        model: reviewAiName(cfg), community: communityScore(reviews), counts, topics, verdict, reviews: reviews.map(keepReview),
        siteScore: got.rating ?? null, readers: got.readers ?? null, title: film.title, year: film.year ? String(film.year).slice(0, 4) : undefined,
      };
      rememberAspects(film, verdict.aspects, book ? "book" : "film");
      if (!store.set(key, JSON.stringify(next))) setError(tt("Analiz yapıldı ama kaydedilemedi."));
      setRun(next); onRun?.(next); setShowAll(false); setFilter("all");
    } catch (e) {
      if (!live()) return;
      const m = String((e as Error)?.message ?? e);
      setError(m === "nokey" ? tt("Yorum analizi için seçilen yapay zekânın anahtarı yok. Ayarlar › Hesaplar ve anahtarlar.") : m.replace(/^Error: /, ""));
    } finally {
      for (const s of stops) s();
      if (live()) { setPhase(""); setStatus(""); setReading(null); }
    }
  };

  const busy = phase !== "";
  const v = run?.verdict;
  const aspectScores = v ? Object.fromEntries(v.aspects.filter((a) => a.score != null).map((a) => [a.aspect, a.score!])) : {};
  const base = v ? v.score ?? run!.community : null;
  const mine = v ? personalScore(base, aspectScores, profile, learned) : null;
  const tmdb = Number.isFinite(film.rating) && film.rating! > 0 && film.rating! <= 10 ? film.rating! : null;
  const pct = phase === "fetch" ? Math.min(100, (feed.length / cfg.count) * 100) : phase === "read" && step[1] ? (step[0] / step[1]) * 100 : phase === "sum" ? 100 : 0;
  const shown = (run?.reviews ?? []).map((r, i) => [r, i] as const).filter(([r]) => filter === "all" || r.read?.tone === filter);
  const topicName = (t: Topic) => (t === "general" ? tt("Genel") : label(t));
  const moods: [Mood, string][] = [["any", tt("Genel")], ["easy", tt("Tempo")], ["deep", tt("Hikâye ve karakter")], ["visual", tt("Görsellik")]];

  return <div className="la-ai">
    <div className="la-head">
      <h2>{tt("Luna Analiz")}</h2>
      <span className="la-src">{site} · {reviewAiName(cfg)}</span>
      <span className="grow" />
      <div className="la-opts-wrap" ref={optsRef}>
        <button className={"la-gear" + (opts ? " on" : "")} aria-label={tt("Analiz ayarları")} title={tt("Analiz ayarları")} aria-expanded={opts} onClick={() => setOpts((x) => !x)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
        </button>
        {opts && <div className="la-opts" role="dialog" aria-label={tt("Analiz ayarları")}>
          <h4>{tt("Analiz ayarları")}</h4>
          <div className="la-opt">
            <div><b>{tt("Okunacak yorum")}</b><span>{tt("{0} yorum · daha çok yorum daha uzun sürer", cfg.count)}</span></div>
            <div className="la-steps">{[10, 20, 30, 50, 75, 100].map((n) => <button key={n} className={"seg" + (cfg.count === n ? " on" : "")} onClick={() => { store.set("reviewAiCount", String(n)); redraw((x) => x + 1); }}>{n}</button>)}</div>
          </div>
          {!book && <div className="la-opt -row">
            <div><b>{tt("Spoiler'lı yorumlar")}</b><span>{cfg.spoilers ? tt("Okunur; listede gizli durur") : tt("Hiç okunmaz, analize girmez")}</span></div>
            <Switch on={cfg.spoilers} label={tt("Spoiler'lı yorumlar")} onChange={(on) => { store.set("reviewAiSpoilers", on ? "1" : "0"); redraw((x) => x + 1); }} />
          </div>}
          <button className="la-link" onClick={() => { setOpts(false); goPlace("settings"); }}>{tt("Yapay zekâ ve ek talimat: Ayarlar ›")}</button>
        </div>}
      </div>
      {/* settings, then Stop beside the running button and as big as it */}
      {busy && <button className="la-stop" onClick={() => { ticket.current++; setPhase(""); setStatus(""); setReading(null); }}>{tt("Durdur")}</button>}
      <button className="la-go" disabled={busy || !inApp} onClick={start}>{busy ? tt("Okunuyor…") : run ? tt("Yeniden analiz et") : tt("{0} yorumu oku ve analiz et", cfg.count)}</button>
    </div>
    <p className="la-lead">{book ? tt("1000Kitap'taki en beğenilen {0} incelemeyi tek tek okur; okurların ortak düşüncelerini, tartıştıkları noktaları ve kitabın sana uygunluğunu çıkarır.", cfg.count) : tt("Letterboxd'daki en popüler {0} yorumu tek tek okur; ortak düşünceleri, tartışılan noktaları ve senin zevkine ne kadar uyduğunu çıkarır.", cfg.count)}</p>
    {!book && <div className="la-moods" role="group" aria-label={tt("Bugün ne istersin?")}>
      <span>{tt("Bugün ne istersin?")}</span>
      {moods.map(([m, n]) => <button key={m} className={"seg" + (mood === m ? " on" : "")} onClick={() => setMood(m)}>{n}</button>)}
    </div>}

    {busy && <div className="la-live">
      <div className="la-live-top"><span className="la-pulse" /><span className="la-live-msg" role="status">{status}</span><span className="la-live-n">{phase === "fetch" ? `${feed.length} / ${cfg.count}` : phase === "read" ? `${step[0]} / ${step[1]}` : ""}</span></div>
      <div className="la-progress"><span style={{ width: pct + "%" }} /></div>
      <Feed list={feed} reading={reading} follow label={label} />
    </div>}
    {error && <p className="la-error" role="alert">{error}</p>}

    {v && run && !busy && <div className="la-result">
      <div className="la-scores">
        {mine && <div className="la-score -main"><span>{tt("Senin için")}</span><strong>{num(mine.score)}</strong>{Math.abs(mine.diff) >= 0.1 && <em className={mine.diff > 0 ? "-up" : "-down"}>{mine.diff > 0 ? "+" : ""}{num(mine.diff)}</em>}</div>}
        {v.score != null && <div className="la-score"><span>{tt("Luna Analiz")}</span><strong>{num(v.score)}</strong></div>}
        {run.community != null && <div className="la-score"><span>{tt("Yorumların tonu")}</span><strong>{num(run.community)}</strong></div>}
        {tmdb != null && <div className="la-score"><span>TMDB</span><strong>{num(tmdb)}</strong></div>}
        {run.stars != null && <div className="la-score"><span>Letterboxd</span><strong>{num(run.stars)}<small>★</small></strong></div>}
        {run.siteScore != null && <div className="la-score"><span>1000Kitap</span><strong>{num(run.siteScore)}</strong>{run.readers ? <em className="-plain">{tt("{0} okur", run.readers.toLocaleString(locale()))}</em> : null}</div>}
        <span className={"la-verdict -" + v.lean}>{toneLabel(v.lean)}</span>
      </div>
      <p className="la-muted la-basis">{tt("Bu özet, okunan {0} yorumdan yapay zekâyla çıkarıldı. Puanlar ve yüzdeler yaklaşık bir okumadır; doğruluk garantisi vermez ve gerçek bir topluluk anketi değildir.", run.count)}</p>
      {mine && (mine.notes.length > 0 || learned) && <p className="la-why">
        {mine.notes.map((n) => n.kind === "strong" ? tt("{0} çok güçlü, senin için önemli", label(n.aspect)) : n.kind === "weak" ? tt("{0} zayıf, senin için önemli", label(n.aspect)) : tt("{0} eleştiriliyor, uyarılmak istemiştin", label(n.aspect))).join(" · ")}
        {mine.notes.length > 0 && learned ? " · " : ""}
        {learned && tt("Zevkin {0} beğendiğin ve {1} beğenmediğin eserden öğrenildi.", learned.liked, learned.disliked)}
      </p>}
      <Split counts={run.counts} />

      <p className="la-summary">{v.summary}</p>
      {v.scoreWhy && <p className="la-muted">{v.scoreWhy}</p>}
      {v.editorNote && <blockquote className="la-quote">{v.editorNote}</blockquote>}
      {v.forYou && <div className="la-foryou"><h3>{tt("Senin için")}</h3><p>{v.forYou}</p></div>}

      {v.consensus.length > 0 && <div className="la-block"><h3>{tt("Ortak düşünceler")}</h3>
        <ul className="la-cons">{v.consensus.map((c) => <li key={c.point}><b>%{c.share}</b><div><p>{c.point}</p><div className="la-meter"><span className={"-" + c.tone} style={{ width: Math.max(3, c.share) + "%" }} /></div></div></li>)}</ul>
      </div>}
      {v.debates.length > 0 && <div className="la-block"><h3>{tt("Bölündükleri noktalar")}</h3>{v.debates.map((d) => <p key={d} className="la-debate">{d}</p>)}</div>}

      <div className="la-cols">
        {v.praise.length > 0 && <div><h3>{tt("Övülenler")}</h3><ul className="la-list -good">{v.praise.map((x) => <li key={x}>{x}</li>)}</ul></div>}
        {v.criticism.length > 0 && <div><h3>{tt("Eleştirilenler")}</h3><ul className="la-list -bad">{v.criticism.map((x) => <li key={x}>{x}</li>)}</ul></div>}
      </div>
      {(v.likeIf || v.skipIf) && <div className="la-cols">
        {v.likeIf && <div className="la-if -good"><span>{tt("Seversin, eğer…")}</span><p>{v.likeIf}</p></div>}
        {v.skipIf && <div className="la-if -bad"><span>{tt("Geç, eğer…")}</span><p>{v.skipIf}</p></div>}
      </div>}

      {v.aspects.length > 0 && <div className="la-block"><h3>{tt("Konulara göre")}</h3>
        <div className="la-aspects">{v.aspects.map((a) => <div key={a.aspect} className="la-aspect">
          <div className="la-aspect-top"><b>{label(a.aspect)}</b><span className={"la-tone -" + a.tone}>{toneLabel(a.tone)}</span><strong>{a.score != null ? num(a.score) : "—"}</strong></div>
          <div className="la-meter"><span className={"-" + a.tone} style={{ width: (a.score ?? 0) * 10 + "%" }} /></div>
          {a.note && <p>{a.note}</p>}
        </div>)}</div>
      </div>}

      {(v.themes.length > 0 || v.emotions.length > 0 || Object.keys(run.topics).length > 0) && <div className="la-block la-tags">
        {Object.keys(run.topics).length > 0 && <div><span>{tt("En çok konuşulan")}</span><p>{(Object.entries(run.topics) as [Topic, number][]).sort((a, b) => b[1] - a[1]).map(([t, n]) => <i key={t}>{topicName(t)} <b>{n}</b></i>)}</p></div>}
        {v.themes.length > 0 && <div><span>{tt("Temalar")}</span><p>{v.themes.map((x) => <i key={x.name}>{x.name} <b>%{x.share}</b></i>)}</p></div>}
        {v.emotions.length > 0 && <div><span>{tt("Bıraktığı duygu")}</span><p>{v.emotions.map((x) => <i key={x.name}>{x.name} <b>%{x.share}</b></i>)}</p></div>}
      </div>}
      {(v.audience.length > 0 || v.similar.length > 0) && <div className="la-cols">
        {v.audience.length > 0 && <div><h3>{tt("Kimler için")}</h3><ul className="la-list">{v.audience.map((x) => <li key={x}>{x}</li>)}</ul></div>}
        {v.similar.length > 0 && <div><h3>{tt("Benzerleri")}</h3><ul className="la-list">{v.similar.map((x) => <li key={x.title}><button className="la-title" title={tt("{0} · ayrıntıları aç", x.title)} onClick={() => book ? askAssistant(tt("“{0}” kitabı hakkında bilgi ver; neden “{1}” ile birlikte anılıyor?", x.title, film.title)) : window.dispatchEvent(new CustomEvent("luna-open-title", { detail: { title: x.title, year: x.year ? String(x.year) : undefined, kind: film.kind === "tv" ? "tv" : "movie" } }))}>{x.title}{x.year ? ` (${x.year})` : ""} ↗</button>{x.why ? " — " + x.why : ""}</li>)}</ul></div>}
      </div>}

      {run.reviews.length > 0 && <div className="la-block">
        <div className="la-read-head">
          <button className="la-toggle" aria-expanded={showAll} onClick={() => setShowAll((x) => !x)}><h3>{tt("Okunan yorumlar")} <span>{run.reviews.length}</span></h3><span className="la-chev">{showAll ? "▴" : "▾"}</span></button>
          {showAll && <div className="la-filter">{(["all", "positive", "mixed", "negative", "neutral"] as const).map((f) => <button key={f} className={"seg" + (filter === f ? " on" : "")} onClick={() => setFilter(f)}>{f === "all" ? tt("Hepsi") : itemLabel(f)}{f !== "all" && ` ${run.counts[f]}`}</button>)}</div>}
        </div>
        {showAll && <Feed list={shown.map(([r]) => r)} reading={null} follow={false} label={label} done />}
      </div>}
      <p className="la-foot">{new Date(run.at).toLocaleString(locale())} · {run.model} · <button className="la-link" onClick={() => openUrl(run.url).catch(() => {})}>{book ? tt("1000Kitap'ta aç") : tt("Letterboxd'da aç")} ↗</button> · {tt("Yapay zekâ yanılabilir; yorumların kendisi yukarıda.")}</p>
    </div>}
  </div>;
}
