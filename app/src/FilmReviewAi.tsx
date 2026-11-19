import {TastePanel} from "./TastePanel";
import {SimilarTitles} from "./SimilarTitles";
import {ExtraModal,extraText} from "./Extras";
import {savedFilmAnalysis} from "./filmAnalysisStorage";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { invoke } from "./nativeCore";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "./linkOpen";
import { store } from "./library";
import { beginTask, dropTask, taskOf, updateTask, useAnalysisTask } from "./AnalysisTasks";
import { tt, locale } from "./i18n";
import { goPlace } from "./Mine";
import { reviewAi, reviewAiJson, reviewAiName } from "./ai";
import { filmKey } from "./filmReviewModel";
import type { Aspect, FilmTarget, Mood, Profile } from "./filmReviewModel";
import { BATCH, batchPrompt, cleanBatch, cleanRun, cleanVerdict, communityScore, keepReview, lengthBatches, reviewKey, summaryPrompt, tally, trivialReview } from "./reviewAnalysis";
import type { ReadItem } from "./reviewAnalysis";
import type { AiRun, ItemTone, LbReview, Medium, RunReview, Tone, Topic } from "./reviewAnalysis";
import { askAssistant } from "./Taste";
import { normalizeText } from "./filmReviewModel";
import { learnedTaste, personalScore, rememberAspects, tasteLine } from "./reviewTaste";
import { developerSessionActive } from "./devSession";

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
/** 83 s → "1:23". */
const clock = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
async function ask<T>(system: string, user: string, clean: (x: any) => T | null, cfg = reviewAi(), think = true): Promise<T | null> {
  for (let i = 0; i < 2; i++) {
    try { const v = clean(await reviewAiJson(system, user, cfg, think)); if (v) return v; }
    catch (e) { if (String((e as Error)?.message ?? e) === "nokey" || i === 1) throw e; }
    await sleep(800);
  }
  return null;
}

function ReviewLine({ r, reading, order = 0, label }: { r: RunReview; reading: boolean; order?: number; label: (a: Aspect) => string }) {
  const [open, setOpen] = useState(false), [shown, setShown] = useState(!r.spoiler);
  const read = r.read;
  const long = r.text.length > LONG;
  return <article className={"la-rv" + (!r.text.trim() ? " -rating-only" : "") + (reading ? " -reading" : "") + (read ? " -t-" + itemClass(read.tone) : "")} style={reading ? { ["--i" as any]: order } : undefined}>
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
        : <p className={"la-rv-text" + (long && !open ? " -cut" : "")}>{r.text.trim() || tt("Yalnızca yıldız puanı verilmiş.")}</p>}
      {shown && long && <button className="la-more" onClick={() => setOpen((x) => !x)}>{open ? tt("Daha az göster") : tt("Devamını oku")}</button>}
      {shown && read?.gist && <p className="la-rv-gist">{read.gist}</p>}
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
  const site = book ? "1000Kitap / Goodreads" : "Letterboxd";
  const key = book ? "bookAnalysis:" + encodeURIComponent(normalizeText(film.title + "|" + (author ?? "")).trim()) : "filmDecision:ai:" + filmKey(film);
  const [run, setRun] = useState<AiRun | null>(() => book?cleanRun(store.json(key, null)):savedFilmAnalysis(film));
  const [phase, setPhase] = useState<Phase>("");
  const [status, setStatus] = useState(""), [error, setError] = useState("");
  // developer mode: how long each part took (Letterboxd, reading, summing up); the last run's times stay on screen
  const [times, setTimes] = useState<{ start: number; read?: number; sum?: number; end?: number; stopped?: boolean } | null>(null);
  const [, setTick] = useState(0);
  const dev = developerSessionActive();
  useEffect(() => { if (!dev || !times || times.end) return; const id = setInterval(() => setTick((n) => n + 1), 1000); return () => clearInterval(id); }, [dev, times]);
  const [feed, setFeed] = useState<RunReview[]>([]);
  const [reading, setReading] = useState<[number, number] | null>(null);
  const [step, setStep] = useState<[number, number]>([0, 0]);
  const [showAll, setShowAll] = useState(false);
  const [filter, setFilter] = useState<ItemTone | "all">("all");
  const [preferences,setPreferences]=useState(false);
  // closed until opened; the choice is remembered
  const [collapsed,setCollapsedState]=useState(()=>store.get("lunaAnalysisOpen")!=="1");
  const setCollapsed=(f:(x:boolean)=>boolean)=>setCollapsedState(x=>{const v=f(x);store.set("lunaAnalysisOpen",v?"0":"1");return v;});
  const [opts, setOpts] = useState(false);
  const [optsPage,setOptsPage]=useState<"menu"|"settings">("menu");
  const [, redraw] = useState(0);
  useEffect(()=>{const update=()=>redraw(n=>n+1);window.addEventListener("film-decision-changed",update);return()=>window.removeEventListener("film-decision-changed",update);},[]);
  const optsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!opts) return;
    const away = (e: MouseEvent) => { if (!optsRef.current?.contains(e.target as Node)) setOpts(false); };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault(); e.stopPropagation(); setOpts(false);
      optsRef.current?.querySelector<HTMLButtonElement>(".la-gear")?.focus({ preventScroll: true });
    };
    document.addEventListener("mousedown", away); document.addEventListener("keydown", esc, true);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc, true); };
  }, [opts]);
  useLayoutEffect(() => {
    if (!opts) return;
    const anchor = optsRef.current?.querySelector<HTMLButtonElement>(".la-gear");
    const panel = optsRef.current?.querySelector<HTMLElement>(".la-opts");
    if (!anchor || !panel) return;
    const fit = () => {
      const box = anchor.getBoundingClientRect(), edge = 12;
      const origin = optsRef.current!.getBoundingClientRect();
      let left = 0, right = innerWidth, top = 0, bottom = innerHeight;
      for (let parent = optsRef.current!.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent), rect = parent.getBoundingClientRect();
        if (/auto|scroll|hidden|clip/.test(style.overflowY)) { top = Math.max(top, rect.top); bottom = Math.min(bottom, rect.bottom); }
        if (/auto|scroll|hidden|clip/.test(style.overflowX)) { left = Math.max(left, rect.left); right = Math.min(right, rect.right); }
      }
      const below = Math.max(0, bottom - box.top - edge);
      const above = Math.max(0, box.bottom - top - edge);
      const upward = below < Math.min(panel.scrollHeight, 320) && above > below;
      const available = upward ? above : below;
      const maxHeight = Math.min(560, Math.max(80, available), Math.max(80, bottom - top - edge * 2));
      panel.style.width = Math.max(120, Math.min(340, right - left - edge * 2)) + "px";
      panel.style.maxHeight = maxHeight + "px";
      const height = panel.offsetHeight;
      panel.style.left = Math.max(left + edge, Math.min(box.right - panel.offsetWidth, right - panel.offsetWidth - edge)) - origin.left + "px";
      // glisse: the menu takes the ⋯ button's place (Morph.ts turns the button into it), growing down from the
      // button's top, or up from its bottom when there is no room below
      panel.style.top = Math.max(top + edge, Math.min(upward ? box.bottom - height : box.top, bottom - height - edge)) - origin.top + "px";
      panel.style.right = "auto";
    };
    fit();
    panel.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    window.addEventListener("resize", fit); window.addEventListener("scroll", fit, true);
    return () => { window.removeEventListener("resize", fit); window.removeEventListener("scroll", fit, true); };
  }, [opts]);
  const queue = useRef<LbReview[]>([]);
  const ticket = useRef(0);
  // leaving the page does not stop an analysis; a page opened meanwhile follows it and shows the result
  const task = useAnalysisTask(key);
  useEffect(() => {
    if (!task || task.state === "running") return;
    setRun(book ? cleanRun(store.json(key, null)) : savedFilmAnalysis(film));
    if (task.state === "error") setError(task.status);
    dropTask(task);
  }, [task, task?.state]);
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
    if (taskOf(key)?.state === "running") return;
    const t = ++ticket.current;
    const live = () => t === ticket.current;
    const job = beginTask(key, film.title, book ? null : { title: film.title, year: film.year ? String(film.year).slice(0, 4) : undefined, kind: film.kind === "tv" ? "tv" : "movie", tmdbId: film.id && film.id > 0 ? film.id : undefined }, () => { ticket.current++; });
    const say = (m: string) => { setStatus(m); updateTask(job, { status: m }); };
    if (!cfg.use.key) { dropTask(job); setError(tt("Yorum analizi için seçilen yapay zekânın anahtarı yok. Ayarlar › Hesaplar ve anahtarlar.")); return; }
    setError(""); setFeed([]); queue.current = []; setReading(null); setStep([0, 0]);
    setPhase("fetch"); say(tt("Letterboxd'da aranıyor…")); setTimes({ start: Date.now() });
    const stops = inApp ? await Promise.all([
      listen<string>("lb-reviews-progress", (e) => { if (live()) say(e.payload); }),
      listen<LbReview[]>("lb-reviews-found", (e) => { if (live()) queue.current.push(...e.payload); }),
    ]) : [];
    try {
      const year = film.year ? String(film.year).slice(0, 4) : undefined;
      const got = book
        ? await invoke<{ url: string; reviews: LbReview[]; rating: number | null; readers: number | null; site?: string }>("book_reviews", { title: film.title, author: author ?? null, count: cfg.count })
        : await invoke<{ url: string; reviews: LbReview[]; rating?: number | null; readers?: number | null }>("letterboxd_reviews", { tmdb: film.id && film.id > 0 ? film.id : null, tv: film.kind === "tv", title: film.title, year, count: cfg.count, spoilers: cfg.spoilers });
      if (!live()) return;
      if (!got.reviews.length) throw new Error(book ? tt("1000Kitap ve Goodreads'te bu kitap için inceleme bulunamadı.") : tt("Letterboxd'da bu eser için yorum bulunamadı."));
      // let the feed finish scrolling in, then use the full list
      for (let i = 0; i < 100 && queue.current.length && live(); i++) await sleep(100);
      if (!live()) return;
      queue.current = [];
      const reviews: RunReview[] = got.reviews.map((r) => ({ ...r, read: null }));
      setFeed(reviews.slice());
      onReviews(JSON.stringify({ reviews: got.reviews.map((r) => ({ text: r.text.slice(0, 4000), source: site + " · " + r.author + (r.stars ? " · " + r.stars + "★" : "") })) }));

      // 1) read in batches: each review gets its tone, depth, topic and gist
      setPhase("read"); updateTask(job, { pct: 12 }); setTimes((x) => x && { ...x, read: Date.now() });
      const tr = locale().startsWith("tr");
      // a local model (LM Studio) reads lighter: one-liners and repeats are labelled from their stars without it,
      // reviews it has read before for this title come from its memory, and the rest go in batches filled by length.
      // A service over an API reads as before: every review, ten a batch.
      const local = cfg.provider === "custom";
      const memKey = "reviewReadMemory", filmId = filmKey(film);
      const memory = local ? store.json<Record<string, Record<string, ReadItem>>>(memKey, {}) : {};
      const known = memory[filmId] ?? {};
      const toRead: number[] = [];
      if (local) {
        const seen = new Set<string>();
        reviews.forEach((r, i) => {
          const kept = known[reviewKey(r)];
          const light = kept ? null : trivialReview(r, seen);
          if (kept || light) reviews[i] = { ...r, read: kept ?? light };
          else toRead.push(i + 1);
        });
        setFeed(reviews.slice());
      }
      const groups = local ? lengthBatches(toRead, (n) => reviews[n - 1].text) : Array.from({ length: Math.ceil(reviews.length / BATCH) }, (_, b) => Array.from({ length: Math.min(BATCH, reviews.length - b * BATCH) }, (_, i) => b * BATCH + i + 1));
      const batches = groups.length;
      // a local model thinks while it pays off: up to 30 reviews every batch is read carefully; with more, the batches
      // (simple labelling) go quick and only the summing up thinks; past 60 the summing up's input is long enough
      // that thinking would crowd a small context, so it goes quick too
      const thinkRead = reviews.length <= 30, thinkSum = reviews.length <= 60;
      let failed = 0;
      for (let b = 0; b < batches; b++) {
        const nums = groups[b], off = nums[0] - 1, last = nums[nums.length - 1], part = nums.map((n) => reviews[n - 1]);
        setReading([off, last]); setStep([b + 1, batches]); updateTask(job, { pct: 12 + (b / batches) * 73 });
        say(tt("{0}–{1}. yorumlar okunuyor", off + 1, last));
        // a small local model numbers its answer 1, 2, 3… whatever the reviews' own numbers are: it is shown 1…k and
        // the answer is mapped back here
        const { system, user } = batchPrompt(film, part, local ? 0 : off, tr, medium);
        const raw = await ask(system, user, (x) => { const c = cleanBatch(x, local ? 0 : off, part.length); return c.items.size ? c : null; }, cfg, thinkRead).catch((e) => { if (String((e as Error)?.message ?? e) === "nokey") throw e; return null; });
        if (!live()) return;
        if (!raw) { failed++; continue; }
        const back = (n: number) => (local ? nums[n - 1] : n);
        const res = { items: new Map([...raw.items].map(([n, it]) => [back(n), it] as const)), best: raw.best.map(back), worst: raw.worst.map(back) };
        for (const [n, it] of res.items) reviews[n - 1] = { ...reviews[n - 1], read: it };
        for (const n of res.best) reviews[n - 1] = { ...reviews[n - 1], best: true };
        for (const n of res.worst) reviews[n - 1] = { ...reviews[n - 1], worst: true };
        setFeed(reviews.slice());
      }
      if (local) {
        // what the model read is kept for this title (the last 30 titles), so a later run reads only new reviews
        const mine: Record<string, ReadItem> = { ...known };
        for (const n of toRead) { const r = reviews[n - 1]; if (r.read) mine[reviewKey(r)] = r.read; }
        const rest = Object.entries(memory).filter(([k]) => k !== filmId).slice(-29);
        try { store.set(memKey, JSON.stringify(Object.fromEntries([...rest, [filmId, mine]]))); } catch { /* full: next run reads again */ }
      }
      if (batches && failed === batches) throw new Error(tt("Yapay zekânın cevabı okunamadı. Tekrar dene ya da Ayarlar'dan başka bir model seç."));

      // 2) sum it all up
      setReading(null); setPhase("sum"); updateTask(job, { pct: 88 }); setTimes((x) => x && { ...x, sum: Date.now() });
      say(tt("{0} yorum okundu · ortak düşünceler çıkarılıyor…", reviews.length));
      const { system, user } = summaryPrompt(film, reviews, profile, mood, cfg.note, tasteLine(profile, learned, book ? "book" : "film"), tr, medium);
      const verdict = await ask(system, user, cleanVerdict, cfg, thinkSum);
      if (!live()) return;
      if (!verdict) throw new Error(tt("Yapay zekânın cevabı okunamadı. Tekrar dene ya da Ayarlar'dan başka bir model seç."));
      const rated = reviews.filter((r) => r.stars);
      const { counts, topics } = tally(reviews);
      const next: AiRun = {
        at: Date.now(), url: got.url, count: reviews.length, spoilers: reviews.filter((r) => r.spoiler).length,
        stars: rated.length ? Math.round((rated.reduce((s, r) => s + r.stars!, 0) / rated.length) * 10) / 10 : null,
        model: reviewAiName(cfg), community: communityScore(reviews), counts, topics, verdict, reviews: reviews.map(keepReview),
        siteScore: got.rating ?? null, readers: got.readers ?? null, site: (got as { site?: string }).site || undefined, title: film.title, year: film.year ? String(film.year).slice(0, 4) : undefined,
      };
      rememberAspects(film, verdict.aspects, book ? "book" : "film");
      if (!store.set(key, JSON.stringify(next))) setError(tt("Analiz yapıldı ama kaydedilemedi."));
      else window.dispatchEvent(new CustomEvent("film-decision-changed",{detail:{key}}));
      updateTask(job, { state: "done" }); setRun(next); onRun?.(next); setShowAll(false); setFilter("all");
    } catch (e) {
      if (!live()) return;
      const m = String((e as Error)?.message ?? e);
      const shown = m === "nokey" ? tt("Yorum analizi için seçilen yapay zekânın anahtarı yok. Ayarlar › Hesaplar ve anahtarlar.") : m.replace(/^Error: /, "");
      setError(shown); updateTask(job, { state: "error", status: shown });
    } finally {
      for (const s of stops) s();
      if (job.state === "running") dropTask(job);
      if (live()) { setPhase(""); setStatus(""); setReading(null); setTimes((x) => x && !x.end ? { ...x, end: Date.now() } : x); }
    }
  };

  const busy = phase !== "" || task?.state === "running";
  const v = run?.verdict;
  const aspectScores = v ? Object.fromEntries(v.aspects.filter((a) => a.score != null).map((a) => [a.aspect, a.score!])) : {};
  const base = v ? v.score ?? run!.community : null;
  const mine = v ? personalScore(base, aspectScores, profile, learned) : null;
  const tmdb = Number.isFinite(film.rating) && film.rating! > 0 && film.rating! <= 10 ? film.rating! : null;
  const pct = phase === "fetch" ? Math.min(100, (feed.length / cfg.count) * 100) : phase === "read" && step[1] ? (step[0] / step[1]) * 100 : phase === "sum" ? 100 : 0;
  const shown = (run?.reviews ?? []).map((r, i) => [r, i] as const).filter(([r]) => filter === "all" || r.read?.tone === filter);
  const topicName = (t: Topic) => (t === "general" ? tt("Genel") : label(t));
  const moods: [Mood, string][] = [["any", tt("Genel")], ["easy", tt("Tempo")], ["deep", tt("Hikâye ve karakter")], ["visual", tt("Görsellik")]];

  return <div className="la-ai" aria-busy={busy}>
    <div className="la-head">
      <h2>{tt("Luna Analiz")}</h2><button className="chip" aria-expanded={!collapsed} aria-label={extraText("Luna Analiz’i küçült veya aç","Collapse or expand Luna Analysis")} onClick={()=>setCollapsed(x=>!x)}>{collapsed?"▾":"▴"}</button>
      <span className="la-src">{site} · {reviewAiName(cfg)}</span>
      <span className="grow" />
      <div className="la-opts-wrap" ref={optsRef}>
        <button className={"la-gear" + (opts ? " on" : "")} aria-label={extraText("Analiz seçenekleri","Analysis options")} title={extraText("Analiz seçenekleri","Analysis options")} aria-expanded={opts} onClick={() => {setOptsPage("menu");setOpts((x) => !x);}}>
          <span aria-hidden="true">•••</span>
        </button>
        {opts && <div className="la-opts" role="dialog" aria-label={tt("Analiz ayarları")}>
          {optsPage==="menu"?<div className="analysis-options-menu"><button className="analysis-menu-row" onClick={()=>setOptsPage("settings")}>{tt("Analiz ayarları")}<span aria-hidden="true">›</span></button>
          {!book&&<button className="analysis-menu-row" onClick={()=>{setOpts(false);window.dispatchEvent(new Event("luna-local-reviews"));}}>{extraText("Yorumları internetsiz tara","Scan reviews offline")}</button>}
          </div>:<><button className="analysis-menu-back" onClick={()=>setOptsPage("menu")}>‹ {tt("Analiz ayarları")}</button>
          <div className="la-opt">
            <div><b>{tt("Okunacak yorum")}</b><span>{tt("{0} yorum · daha çok yorum daha uzun sürer", cfg.count)}</span></div>
            <div className="la-steps">{[10, 20, 30, 50, 75, 100].map((n) => <button key={n} className={"seg" + (cfg.count === n ? " on" : "")} aria-pressed={cfg.count === n} onClick={() => { store.set("reviewAiCount", String(n)); redraw((x) => x + 1); }}>{n}</button>)}</div>
          </div>
          {!book && <div className="la-opt -row">
            <div><b>{tt("Spoiler'lı yorumlar")}</b><span>{cfg.spoilers ? tt("Okunur; listede gizli durur") : tt("Hiç okunmaz, analize girmez")}</span></div>
            <Switch on={cfg.spoilers} label={tt("Spoiler'lı yorumlar")} onChange={(on) => { store.set("reviewAiSpoilers", on ? "1" : "0"); redraw((x) => x + 1); }} />
          </div>}
          <button className="la-link" onClick={() => { setOpts(false); goPlace("settings"); }}>{tt("Yapay zekâ ve ek talimat: Ayarlar ›")}</button>
          </>}
        </div>}
      </div>
      {/* settings, then Stop beside the running button and as big as it */}
      {busy && <button className="la-stop" onClick={() => { task?.cancel(); if (task) dropTask(task); ticket.current++; setPhase(""); setStatus(""); setReading(null); setTimes((x) => x && { ...x, end: Date.now(), stopped: true }); }}>{tt("Durdur")}</button>}
      <button className="la-go" disabled={busy || !inApp} onClick={()=>setPreferences(true)}>{busy ? <><span className="spinner" aria-hidden="true" /> {tt("Okunuyor…")}</> : run ? tt("Yeniden analiz et") : tt("{0} yorumu oku ve analiz et", cfg.count)}</button>
    </div>
    {preferences&&<ExtraModal title={extraText("Zevk tercihlerim","Taste preferences")} close={()=>setPreferences(false)} className="workspace-modal analysis-preferences"><section className="la">    {!book && <div className="la-moods" role="group" aria-label={tt("Analizde neye odaklanalım?")}>
      <span>{tt("Analizde neye odaklanalım?")}</span>
      {moods.map(([m, n]) => <button key={m} className={"seg" + (mood === m ? " on" : "")} aria-pressed={mood === m} onClick={() => setMood(m)}>{n}</button>)}
    </div>}
<TastePanel kind={book?"book":"film"} open/><div className="modal-actions"><button className="primary" onClick={()=>{setPreferences(false);setCollapsed(()=>false);void start();}}>{extraText("Analize başla","Start analysis")}</button></div></section></ExtraModal>}
    <div hidden={collapsed}>
    <p className="la-lead">{book ? tt("1000Kitap ve Goodreads'teki en beğenilen {0} incelemeyi tek tek okur; okurların ortak düşüncelerini, tartıştıkları noktaları ve kitabın sana uygunluğunu çıkarır.", cfg.count) : tt("Letterboxd'daki en popüler {0} yorumu tek tek okur; ortak düşünceleri, tartışılan noktaları ve senin zevkine ne kadar uyduğunu çıkarır.", cfg.count)}</p>

    {busy && <div className="la-live">
      <div className="la-live-top"><span className="la-pulse" /><span className="la-live-msg" role="status">{status}</span><span className="la-live-n">{phase === "fetch" ? `${feed.length} / ${cfg.count}` : phase === "read" ? `${step[0]} / ${step[1]}` : ""}</span>{dev && times && <span className="la-dev-time" title={extraText("Geçen süre (geliştirici)", "Elapsed (developer)")}>⏱ {clock(Date.now() - times.start)}</span>}</div>
      <div className="la-progress"><span style={{ width: pct + "%" }} /></div>
      <Feed list={feed} reading={reading} follow label={label} />
    </div>}
    {dev && times?.end && !busy && <p className="la-dev-times">⏱ {extraText("Toplam", "Total")} <b>{clock(times.end - times.start)}</b>{times.stopped ? extraText(" (durduruldu)", " (stopped)") : ""}
      {" · "}{extraText("Letterboxd", "Fetch")} {clock((times.read ?? times.end) - times.start)}
      {times.read && <>{" · "}{extraText("okuma", "reading")} {clock((times.sum ?? times.end) - times.read)}</>}
      {times.sum && <>{" · "}{extraText("özet", "summary")} {clock(times.end - times.sum)}</>}</p>}
    {error && <p className="la-error" role="alert">{error}</p>}

    {v && run && !busy && <div className="la-result">
      <div className="la-score-header"><div className="la-scores">
        {mine && <div className="la-score -main"><span>{tt("Senin için")}</span><strong>{num(mine.score)}</strong>{Math.abs(mine.diff) >= 0.1 && <em className={mine.diff > 0 ? "-up" : "-down"}>{mine.diff > 0 ? "+" : ""}{num(mine.diff)}</em>}</div>}
        {v.score != null && <div className="la-score"><span>{tt("Luna Analiz")}</span><strong>{num(v.score)}</strong></div>}
        {run.community != null && <div className="la-score"><span>{tt("Yorumların tonu")}</span><strong>{num(run.community)}</strong></div>}
        {tmdb != null && <div className="la-score"><span>TMDB</span><strong>{num(tmdb)}</strong></div>}
        {run.stars != null && <div className="la-score"><span>Letterboxd</span><strong>{num(run.stars)}<small>★</small></strong></div>}
        {run.siteScore != null && <div className="la-score"><span>{run.site || "1000Kitap"}</span><strong>{num(run.siteScore)}</strong>{run.readers ? <em className="-plain">{tt("{0} okur", run.readers.toLocaleString(locale()))}</em> : null}</div>}
      </div><span className={"la-verdict -" + v.lean}>{toneLabel(v.lean)}</span></div>
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
      {(v.audience.length > 0 || v.similar.length > 0 || (!book&&!!film.id)) && <div className="la-cols">
        {v.audience.length > 0 && <div><h3>{tt("Kimler için")}</h3><ul className="la-list">{v.audience.map((x) => <li key={x}>{x}</li>)}</ul></div>}
        {book && v.similar.length > 0 && <div><h3>{tt("Benzerleri")}</h3><ul className="la-list">{v.similar.map((x) => <li key={x.title}><button className="la-title" title={tt("{0} · ayrıntıları aç", x.title)} onClick={() => book ? askAssistant(tt("“{0}” kitabı hakkında bilgi ver; neden “{1}” ile birlikte anılıyor?", x.title, film.title)) : window.dispatchEvent(new CustomEvent("luna-open-title", { detail: { title: x.title, year: x.year ? String(x.year) : undefined, kind: film.kind === "tv" ? "tv" : "movie" } }))}>{x.title}{x.year ? ` (${x.year})` : ""} ↗</button>{x.why ? " — " + x.why : ""}</li>)}</ul></div>}
        {!book?<SimilarTitles key={key+String(run.at)} film={film} initial={v.similar}/>:null}
      </div>}

      {run.reviews.length > 0 && <div className="la-block">
        <div className="la-read-head">
          <button className="la-toggle" aria-expanded={showAll} onClick={() => setShowAll((x) => !x)}><h3>{tt("Okunan yorumlar")} <span>{run.reviews.length}</span></h3><span className="la-chev">{showAll ? "▴" : "▾"}</span></button>
          {showAll && <div className="la-filter">{(["all", "positive", "mixed", "negative", "neutral"] as const).map((f) => <button key={f} className={"seg" + (filter === f ? " on" : "")} aria-pressed={filter === f} onClick={() => setFilter(f)}>{f === "all" ? tt("Hepsi") : itemLabel(f)}{f !== "all" && ` ${run.counts[f]}`}</button>)}</div>}
        </div>
        {showAll && (shown.length ? <Feed list={shown.map(([r]) => r)} reading={null} follow={false} label={label} done /> : <div className="la-feed-empty" role="status">{tt("Bu filtreye uyan yorum yok.")}</div>)}
      </div>}
      <p className="la-foot">{new Date(run.at).toLocaleString(locale())} · {run.model} · <button className="la-link" onClick={() => openUrl(run.url).catch(() => {})}>{book ? tt("{0} sayfasını aç", (run.site || "1000Kitap").split(" + ")[0]) : tt("Letterboxd'da aç")} ↗</button> · {tt("Yapay zekâ yanılabilir; yorumların kendisi yukarıda.")}</p>
    </div>}
    </div>
  </div>;
}
