import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { store } from "./library";
import { tt, locale } from "./i18n";
import { aiKey, reviewAi, reviewAiJson, reviewAiName } from "./ai";
import { ASPECTS, filmKey } from "./filmReviewModel";
import type { Aspect, FilmTarget, Mood, Profile } from "./filmReviewModel";

/** "Worth watching?" › Letterboxd: reads the film's most popular reviews there (Settings › Review AI
 *  sets how many) and has the chosen AI sum them up for this user. The reviews also go to the local
 *  keyword scan, so the two can be compared. */
type LbReview = { author: string; stars: number | null; spoiler: boolean; text: string };
type Tone = "positive" | "mixed" | "negative" | "unclear";
export type AiVerdict = {
  lean: Tone; summary: string; forYou: string; likeIf: string; skipIf: string;
  praise: string[]; criticism: string[]; aspects: { aspect: Aspect; tone: Tone; note: string }[];
};
export type AiRun = { at: number; url: string; count: number; spoilers: number; stars: number | null; model: string; verdict: AiVerdict };

const TONES: Tone[] = ["positive", "mixed", "negative", "unclear"];
const str = (x: unknown, n: number) => (typeof x === "string" ? x.trim().slice(0, n) : "");
const list = (x: unknown) => (Array.isArray(x) ? x.map((s) => str(s, 300)).filter(Boolean).slice(0, 6) : []);
/** The model's answer, kept only in the expected shape (a stored copy is cleaned the same way). */
export function cleanVerdict(x: any): AiVerdict | null {
  if (!x || typeof x !== "object") return null;
  const tone = (t: unknown): Tone => (TONES.includes(t as Tone) ? (t as Tone) : "unclear");
  const aspects = (Array.isArray(x.aspects) ? x.aspects : [])
    .filter((a: any) => a && ASPECTS.includes(a.aspect))
    .map((a: any) => ({ aspect: a.aspect as Aspect, tone: tone(a.tone), note: str(a.note, 400) }))
    .filter((a: any, i: number, all: any[]) => all.findIndex((b) => b.aspect === a.aspect) === i);
  const v = { lean: tone(x.lean), summary: str(x.summary, 900), forYou: str(x.forYou, 700), likeIf: str(x.likeIf, 400), skipIf: str(x.skipIf, 400), praise: list(x.praise), criticism: list(x.criticism), aspects };
  return v.summary ? v : null;
}
function cleanRun(x: any): AiRun | null {
  const verdict = cleanVerdict(x?.verdict);
  if (!verdict || typeof x.at !== "number") return null;
  return { at: x.at, url: str(x.url, 300), count: Number(x.count) || 0, spoilers: Number(x.spoilers) || 0, stars: typeof x.stars === "number" ? x.stars : null, model: str(x.model, 120), verdict };
}

const ASPECT_EN: Record<Aspect, string> = { story: "story", pace: "pace", acting: "acting", visuals: "visuals", emotion: "characters and emotion", sound: "music and sound" };
const MOOD_EN: Record<Mood, string> = { any: "a general verdict", easy: "pace first", deep: "story and characters", visual: "a visual journey" };

function prompt(film: FilmTarget, reviews: LbReview[], profile: Profile, mood: Mood, note: string) {
  const tr = locale().startsWith("tr");
  const system = [
    "You read film reviews from Letterboxd and tell one viewer whether the title is worth their time.",
    "Use only what the reviews say; do not add facts, plot details or awards they don't mention.",
    "Never reveal spoilers: describe how people felt, not what happens. Some reviews are jokes or one-liners: weigh them lightly.",
    `Write every text field in ${tr ? "Turkish" : "English"}, short and concrete.`,
    "Answer with JSON only, in this shape:",
    '{"lean":"positive|mixed|negative|unclear","summary":"2-3 sentences: the overall feeling of the reviews","forYou":"2-3 sentences for this viewer, using their priorities and warnings","likeIf":"one sentence: you will like it if…","skipIf":"one sentence: skip it if…","praise":["up to 5 points reviewers praise"],"criticism":["up to 5 points reviewers criticise"],"aspects":[{"aspect":"story|pace|acting|visuals|emotion|sound","tone":"positive|mixed|negative|unclear","note":"one sentence"}]}',
    "Give an aspect only if the reviews talk about it; tone 'unclear' when they don't agree or say little.",
    note ? "The viewer's extra instruction: " + note : "",
  ].filter(Boolean).join("\n");
  const prefs = ASPECTS.map((a) => `${ASPECT_EN[a]}: ${profile.weights[a]}/5${profile.avoid.includes(a) ? " (warn me if criticised)" : ""}`).join(", ");
  const user = [
    `Title: ${film.title}${film.year ? ` (${film.year})` : ""} — ${film.kind === "tv" ? "series" : "film"}`,
    `What this viewer cares about (0 = not at all, 5 = a lot): ${prefs}`,
    `Today they want: ${MOOD_EN[mood]}`,
    "",
    `${reviews.length} reviews, most popular first:`,
    ...reviews.map((r, i) => `[${i + 1}]${r.stars ? ` ${r.stars}★` : ""}${r.spoiler ? " (spoiler)" : ""} ${r.text.replace(/\s+/g, " ").slice(0, 1500)}`),
  ].join("\n");
  return { system, user };
}

const toneLabel = (t: Tone) => tt(({ positive: "Olumlu", mixed: "Karışık", negative: "Olumsuz", unclear: "Belirsiz" } as const)[t]);

export function ReviewAiCard({ film, profile, mood, label, onReviews }: { film: FilmTarget; profile: Profile; mood: Mood; label: (a: Aspect) => string; onReviews: (json: string) => void }) {
  const key = "filmDecision:ai:" + filmKey(film);
  const [run, setRun] = useState<AiRun | null>(() => cleanRun(store.json(key, null)));
  const [busy, setBusy] = useState(""), [error, setError] = useState("");
  const ticket = useRef(0);
  useEffect(() => () => { ticket.current++; }, []);
  const cfg = reviewAi();
  const inApp = "__TAURI_INTERNALS__" in window;

  const start = async () => {
    const t = ++ticket.current;
    if (!aiKey(cfg.provider)) { setError(tt("Yorum analizi için seçilen yapay zekânın anahtarı yok. Ayarlar › Hesaplar ve anahtarlar.")); return; }
    setError(""); setBusy(tt("Letterboxd'da aranıyor…"));
    const stop = inApp ? await listen<string>("lb-reviews-progress", (e) => { if (t === ticket.current) setBusy(e.payload); }) : () => {};
    try {
      const year = film.year ? String(film.year).slice(0, 4) : undefined;
      const got = await invoke<{ url: string; reviews: LbReview[] }>("letterboxd_reviews", { tmdb: film.id && film.id > 0 ? film.id : null, tv: film.kind === "tv", title: film.title, year, count: cfg.count });
      if (t !== ticket.current) return;
      if (!got.reviews.length) throw new Error(tt("Letterboxd'da bu eser için yorum bulunamadı."));
      // the same reviews go to the local scan too
      onReviews(JSON.stringify({ reviews: got.reviews.map((r) => ({ text: r.text.slice(0, 4000), source: "Letterboxd · " + r.author + (r.stars ? " · " + r.stars + "★" : "") })) }));
      setBusy(tt("{0} yorum alındı · {1} analiz ediyor…", got.reviews.length, reviewAiName(cfg)));
      const { system, user } = prompt(film, got.reviews, profile, mood, cfg.note);
      const verdict = cleanVerdict(await reviewAiJson(system, user));
      if (t !== ticket.current) return;
      if (!verdict) throw new Error(tt("Yapay zekânın cevabı okunamadı. Tekrar dene ya da Ayarlar'dan başka bir model seç."));
      const rated = got.reviews.filter((r) => r.stars);
      const next: AiRun = { at: Date.now(), url: got.url, count: got.reviews.length, spoilers: got.reviews.filter((r) => r.spoiler).length, stars: rated.length ? Math.round((rated.reduce((s, r) => s + r.stars!, 0) / rated.length) * 10) / 10 : null, model: reviewAiName(cfg), verdict };
      if (!store.set(key, JSON.stringify(next))) setError(tt("Analiz yapıldı ama kaydedilemedi."));
      setRun(next);
    } catch (e) {
      if (t !== ticket.current) return;
      const m = String((e as Error)?.message ?? e);
      setError(m === "nokey" ? tt("Yorum analizi için seçilen yapay zekânın anahtarı yok. Ayarlar › Hesaplar ve anahtarlar.") : m.replace(/^Error: /, ""));
    } finally {
      stop();
      if (t === ticket.current) setBusy("");
    }
  };

  const v = run?.verdict;
  return <div className="fd-ai">
    <div className="fd-ai-head">
      <div><span className="fd-eyebrow">{tt("LETTERBOXD · YAPAY ZEKÂ")}</span><p className="fd-hint">{tt("En popüler {0} yorumu çeker ve {1} ile özetler. Ayarlar › Hesaplar ve anahtarlar › Yorum analizi.", cfg.count, reviewAiName(cfg))}</p></div>
      <button className="primary sm" disabled={!!busy || !inApp} onClick={start}>{busy ? tt("Çalışıyor…") : run ? tt("Yeniden çek ve analiz et") : tt("Letterboxd'dan {0} yorum çek ve analiz et", cfg.count)}</button>
    </div>
    {busy && <p className="fd-status" role="status">{busy}</p>}
    {error && <p className="fd-status fd-error" role="alert">{error}</p>}
    {v && run && <div className="fd-ai-result">
      <div className="fd-ai-lean"><b className={"fd-tone -" + v.lean}>{toneLabel(v.lean)}</b><span>{tt("{0} yorum", run.count)}{run.stars !== null && <> · {tt("ortalama {0}★", run.stars.toLocaleString(locale()))}</>}{run.spoilers > 0 && <> · {tt("{0} spoiler'lı", run.spoilers)}</>}</span></div>
      <p className="fd-ai-summary">{v.summary}</p>
      {v.forYou && <div className="fd-ai-you"><span>{tt("Senin için")}</span><p>{v.forYou}</p></div>}
      <div className="fd-takeaways">
        {v.praise.length > 0 && <div><span>{tt("Övülenler")}</span><ul>{v.praise.map((x) => <li key={x}>{x}</li>)}</ul></div>}
        {v.criticism.length > 0 && <div><span>{tt("Eleştirilenler")}</span><ul>{v.criticism.map((x) => <li key={x}>{x}</li>)}</ul></div>}
      </div>
      {(v.likeIf || v.skipIf) && <div className="fd-takeaways">{v.likeIf && <div><span>{tt("Seversin, eğer…")}</span><p>{v.likeIf}</p></div>}{v.skipIf && <div><span>{tt("Geç, eğer…")}</span><p>{v.skipIf}</p></div>}</div>}
      {v.aspects.length > 0 && <div className="fd-ai-aspects">{v.aspects.map((a) => <div key={a.aspect}><span>{label(a.aspect)} <b className={"fd-tone -" + a.tone}>{toneLabel(a.tone)}</b></span><p>{a.note}</p></div>)}</div>}
      <p className="fd-hint">{new Date(run.at).toLocaleString(locale())} · {run.model} · <button className="fd-link" onClick={() => openUrl(run.url).catch(() => {})}>{tt("Letterboxd'da aç")} ↗</button> · {tt("Yapay zekâ özeti hatalı olabilir; yorumların kendisi aşağıdaki yerel taramada.")}</p>
    </div>}
  </div>;
}
