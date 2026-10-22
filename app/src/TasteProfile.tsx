import { useEffect, useState } from "react";
import { store } from "./library";
import { tt, locale } from "./i18n";
import { ASPECTS, cleanProfile } from "./filmReviewModel";
import type { Aspect } from "./filmReviewModel";
import { cleanRun } from "./reviewAnalysis";
import type { AiRun } from "./reviewAnalysis";
import { TASTE_NAMES, effectiveWeight, learnedTaste, loadAspectScores, profileKeyOf } from "./reviewTaste";
import type { TasteKind } from "./reviewTaste";
import { fillTaste, musicTitle, pendingCount, tasteGenres } from "./tasteFill";

/** "Zevk profilin": the taste diary laid out the way the shared review-analysis app's profile and
 *  dashboard do it — a taste map of the six topics, where each weight comes from, what is avoided,
 *  genres, the rating spread, what stands out in liked titles, trends across every Luna Analiz,
 *  how generous the user is against the community, the gaps, and the latest analyses. */
// (each part has its own six topics: a film's story, a book's plot, a song's lyrics…)
let NAMES: Record<Aspect, string> = TASTE_NAMES.film;
const name = (a: Aspect) => tt(NAMES[a]);
type Diary = { title: string; key?: string; year?: string; vote?: "like" | "dislike"; rating?: number; watched?: number; genres?: string[] };
type Open = (t: { title: string; year?: string; kind?: "movie" | "tv" }) => void;

function runs(prefix = "filmDecision:ai:"): { key: string; run: AiRun }[] {
  const out: { key: string; run: AiRun }[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(prefix)) continue;
      const run = cleanRun(store.json(k, null));
      if (run) out.push({ key: k.slice(prefix.length), run });
    }
  } catch {}
  return out.sort((a, b) => b.run.at - a.run.at);
}

/** What one part keeps about the user, in the shape the profile below reads. Music has no diary or analyses:
 *  its likes and dislikes are the diary, its artists stand in for genres and the hour of listening for the rating spread. */
type MQ = { src: string; title: string; artist?: string; podcast?: boolean; radio?: boolean };
function sourceOf(kind: TasteKind) {
  if (kind === "film") return { diary: Object.values(store.json<Record<string, Diary>>("diary", {})), all: runs(), extra: null as null | Extra };
  if (kind === "book") {
    const d = store.json<Record<string, { title: string; author?: string; vote?: "like" | "dislike"; rating?: number; read?: number; at?: number }>>("bookDiary", {});
    const diary: Diary[] = Object.entries(d).map(([k, e]) => ({ title: e.title, vote: e.vote, rating: e.rating, watched: e.read ?? e.at,
      // the subjects Open Library gave the book stand in for genres
      genres: (store.json<{ subjects?: string[] } | null>("olInfo:" + k, null)?.subjects ?? tasteGenres("book")[e.title] ?? []).slice(0, 6) }));
    const by: Record<string, number> = {};
    for (const e of Object.values(d)) if (e.vote === "like" && e.author) by[e.author] = (by[e.author] ?? 0) + 1;
    return { diary, all: runs("bookAnalysis:"), extra: { title: tt("En sevdiğin yazarlar"), sub: tt("Beğendiğin kitapların yazarları"), rows: Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 8) } as Extra };
  }
  const likes = store.json<{ q: MQ; at: number }[]>("musicLikes", []).filter((x) => !x.q.podcast);
  const dis = store.json<{ q: MQ; at: number }[]>("musicDislikes", []);
  const plays = Object.values(store.json<Record<string, { n: number; at: number; q: MQ }>>("musicPlays", {})).filter((x) => !x.q.podcast && !x.q.radio);
  const hist = store.json<{ q: MQ; at: number }[]>("musicHistory", []).filter((x) => !x.q.podcast && !x.q.radio);
  const tg = tasteGenres("music");
  const pts = store.json<Record<string, number>>("musicRatings", {});
  const byGenre = likes.some((x) => tg[musicTitle(x.q)]?.length);
  const diary: Diary[] = [
    ...likes.map((x) => ({ title: x.q.title, key: musicTitle(x.q), vote: "like" as const, rating: pts[x.q.src], watched: x.at, genres: byGenre ? tg[musicTitle(x.q)] ?? [] : x.q.artist ? [x.q.artist] : [] })),
    ...dis.map((x) => ({ title: x.q.title, vote: "dislike" as const, rating: pts[x.q.src], watched: x.at })),
  ];
  const hours = Array.from({ length: 8 }, (_, i) => hist.filter((x) => Math.floor(new Date(x.at).getHours() / 3) === i).length);
  return { diary, all: [] as { key: string; run: AiRun }[], extra: {
    title: tt("En çok dinlediklerin"), sub: tt("{0} farklı şarkı, {1} dinleme", plays.length, plays.reduce((n, x) => n + x.n, 0)),
    rows: plays.sort((a, b) => b.n - a.n).slice(0, 8).map((x) => [x.q.title + (x.q.artist ? " — " + x.q.artist : ""), x.n] as [string, number]),
    hours, songs: plays.length, heard: hist.length, month: hist.filter((x) => Date.now() - x.at < 30 * 86400000).length,
  } as Extra };
}
type Extra = { title: string; sub: string; rows: [string, number][]; hours?: number[]; songs?: number; heard?: number; month?: number };
const norm = (t: string) => t.toLocaleLowerCase("tr").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
/** a run's title: saved with it, or (older runs) read from its Letterboxd address */
const titleOf = (run: AiRun) => run.title || (run.url.split("/").filter(Boolean).pop() ?? "").replace(/-\d{4}$/, "").replace(/-/g, " ");
const n1 = (x: number) => x.toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function Radar({ values }: { values: Record<Aspect, number> }) {
  const cx = 150, cy = 132, r = 96, n = ASPECTS.length;
  const pt = (i: number, v: number) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; return [cx + Math.cos(a) * r * v, cy + Math.sin(a) * r * v] as const; };
  const ring = (v: number) => ASPECTS.map((_, i) => pt(i, v).join(",")).join(" ");
  const poly = ASPECTS.map((a, i) => pt(i, Math.min(1, values[a] / 2.2)).join(",")).join(" ");
  return <svg viewBox="0 0 300 270" className="tp-radar" role="img" aria-label={ASPECTS.map((a) => `${name(a)} ×${n1(values[a])}`).join(", ")}>
    {[1, 0.66, 0.33].map((v) => <polygon key={v} points={ring(v)} className="tp-ring" />)}
    {ASPECTS.map((_, i) => { const [x, y] = pt(i, 1); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} className="tp-ring" />; })}
    <polygon points={poly} className="tp-shape" />
    {ASPECTS.map((a, i) => { const [x, y] = pt(i, Math.min(1, values[a] / 2.2)); return <circle key={a} cx={x} cy={y} r={3.5} className="tp-dot" />; })}
    {ASPECTS.map((a, i) => { const [x, y] = pt(i, 1.2); return <text key={a} x={x} y={y + 4} textAnchor="middle" className="tp-label">{name(a)}</text>; })}
  </svg>;
}

const Bars = ({ rows, max, tone }: { rows: [string, number, string?][]; max: number; tone?: string }) =>
  <div className="tp-bars">{rows.map(([l, v, sub]) => <div key={l} className="tp-bar"><span className="ellipsis" title={l}>{l}</span><div><i className={tone ? "-" + tone : ""} style={{ width: Math.max(3, (v / Math.max(max, 1e-9)) * 100) + "%" }} /></div><b>{sub ?? v}</b></div>)}</div>;

export function TasteProfile({ onOpen, kind = "film", page, sync }: { onOpen?: Open; kind?: TasteKind; /** the part's own "Zevk profilim" tab */ page?: boolean;
  /** the user's own Letterboxd: read it again from here (it also updates itself once a day) */ sync?: { at: number; run: () => Promise<string> } }) {
  const [syncMsg, setSyncMsg] = useState("");
  const openKey = kind === "film" ? "tasteProfileOpen" : "tasteProfileOpen:" + kind;
  const [open, setOpen] = useState(() => store.get(openKey) !== "0");
  const toggle = () => { setOpen(!open); store.set(openKey, open ? "0" : "1"); };
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => bump((n) => n + 1);
    window.addEventListener("film-decision-changed", f);
    window.addEventListener("luna-music-likes", f);
    return () => { window.removeEventListener("film-decision-changed", f); window.removeEventListener("luna-music-likes", f); };
  }, []);
  // only when something new was liked or disliked: the AI is not asked again for what it already scored
  const [measuring, setMeasuring] = useState(0);
  useEffect(() => {
    if (!page || kind === "film") return;
    const n = pendingCount(kind);
    if (!n) return;
    setMeasuring(n);
    void fillTaste(kind, true).finally(() => setMeasuring(0));
  }, [page, kind]);
  NAMES = TASTE_NAMES[kind];
  const { diary, all, extra } = sourceOf(kind);
  const music = kind === "music";
  if (!diary.length && !all.length && !extra?.heard) return page ? <section className="row tp"><div className="tp-head"><h2>{tt("Zevk profilin")}</h2></div>
    <p className="muted">{music ? tt("Henüz bir şey yok: şarkı dinledikçe, beğendikçe ya da beğenmedikçe zevk profilin burada oluşur.") : tt("Henüz bir şey yok: kitapları beğendikçe, puanladıkça ve Luna Analiz yaptıkça zevk profilin burada oluşur.")}</p></section> : null;
  const profile = cleanProfile(store.json(profileKeyOf(kind), null));
  const learned = learnedTaste(kind);
  const eff = Object.fromEntries(ASPECTS.map((a) => [a, effectiveWeight(a, profile, learned)])) as Record<Aspect, number>;

  const liked = diary.filter((e) => e.vote === "like" || (e.rating ?? 0) >= 7);
  const disliked = diary.filter((e) => e.vote === "dislike" || (e.rating && e.rating <= 4));
  const rated = diary.filter((e) => e.rating);
  const avg = rated.length ? rated.reduce((s, e) => s + e.rating!, 0) / rated.length : null;
  const month = Date.now() - 30 * 86400000;
  const reviewsRead = all.reduce((s, x) => s + x.run.count, 0);

  // genres of what was liked
  const g: Record<string, number> = {};
  for (const e of liked) for (const x of e.genres ?? []) g[x] = (g[x] ?? 0) + 1;
  const genres = Object.entries(g).sort((a, b) => b[1] - a[1]).slice(0, 8);
  // the rating spread, 1-10
  const spread = Array.from({ length: 10 }, (_, i) => rated.filter((e) => Math.round(e.rating!) === i + 1).length);
  const spreadMax = Math.max(1, ...spread);

  // what stands out in liked titles that have an analysis (average topic score)
  const scores = Object.values(loadAspectScores(kind));
  const likedKeys = new Set(liked.map((e) => norm(music ? e.key ?? e.title : e.title) + "|" + (e.year ?? "").slice(0, 4)));
  const likedScored = scores.filter((s) => likedKeys.has(norm(s.title) + "|" + s.year) || likedKeys.has(norm(s.title) + "|"));
  const pattern = ASPECTS.map((a) => { const v = likedScored.map((s) => s.aspects[a]).filter((x): x is number => x != null); return [a, v.length ? v.reduce((p, c) => p + c, 0) / v.length : null] as const; })
    .filter(([, v]) => v != null).sort((a, b) => b[1]! - a[1]!) as [Aspect, number][];

  // trends across every analysis: praised / criticised topics, themes, feelings
  const praised: Record<string, number> = {}, criticised: Record<string, number> = {}, themes: Record<string, number> = {}, feels: Record<string, number> = {};
  for (const { run } of all) {
    for (const a of run.verdict.aspects) {
      if (a.tone === "positive") praised[name(a.aspect)] = (praised[name(a.aspect)] ?? 0) + 1;
      if (a.tone === "negative" || a.tone === "mixed") criticised[name(a.aspect)] = (criticised[name(a.aspect)] ?? 0) + (a.tone === "negative" ? 1 : 0.5);
    }
    for (const t of run.verdict.themes) themes[t.name] = (themes[t.name] ?? 0) + t.share / 100;
    for (const t of run.verdict.emotions) feels[t.name] = (feels[t.name] ?? 0) + t.share / 100;
  }
  const top = (o: Record<string, number>, k = 6) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, k);

  // the user's ratings against Luna Analiz / the community, where both exist
  const pairs = diary.filter((e) => e.rating).map((e) => {
    const hit = all.find(({ run }) => titleOf(run) && norm(titleOf(run)) === norm(e.title) && (!e.year || !run.year || run.year === e.year.slice(0, 4)));
    const base = hit ? hit.run.verdict.score ?? hit.run.community : null;
    return base != null ? e.rating! - base : null;
  }).filter((x): x is number => x != null);
  const generosity = pairs.length >= 2 ? pairs.reduce((a, b) => a + b, 0) / pairs.length : null;

  // gaps: topics with no signal yet
  const gaps = ASPECTS.filter((a) => !learned?.boost[a] && !learned?.penalty[a] && profile.weights[a] === 3);
  const avoided = ASPECTS.filter((a) => profile.avoid.includes(a) || learned?.penalty[a]);

  return <section className="row tp">
    <button className="tp-head" aria-expanded={open || page} onClick={page ? undefined : toggle}>
      <h2>{tt("Zevk profilin")}</h2>
      <span className="muted small">{music ? tt("Müzik için · {0} beğeni ve beğenmeme · {1} dinleme", diary.length, extra?.heard ?? 0)
        : tt("{0} için · {1} kayıt · {2} Luna Analiz · {3} yorum okundu", kind === "book" ? tt("Kitaplar") : tt("Filmler"), diary.length, all.length, reviewsRead)}</span>
      <span className="grow" />{!page && <span className="tp-chev">{open ? "▴" : "▾"}</span>}
    </button>
    {measuring > 0 && <div className="tp-measure small" role="status"><span className="la-pulse" />{tt("Ölçülüyor… {0} yeni eser zevk haritana ekleniyor", measuring)}</div>}
    {sync && <div className="tp-sync small muted">
      <span>{syncMsg || tt("Letterboxd'un her gün kendiliğinden güncellenir · son: {0}", sync.at ? new Date(sync.at).toLocaleString(locale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : tt("hiç"))}</span>
      <button className="chip" disabled={syncMsg === tt("Letterboxd'un okunuyor…")} onClick={async () => {
        setSyncMsg(tt("Letterboxd'un okunuyor…"));
        setSyncMsg(await sync.run().catch((e) => String(e).replace(/^Error: /, "")));
      }}>⟳ {tt("Letterboxd'dan güncelle")}</button>
    </div>}
    {(open || page) && <>
      {music ? <div className="tp-stats">
        <div><b>{liked.length}</b><span>{tt("beğendiğin şarkı")}</span></div>
        <div><b>{disliked.length}</b><span>{tt("beğenmediğin şarkı")}</span></div>
        <div><b>{extra?.songs ?? 0}</b><span>{tt("dinlediğin farklı şarkı")}</span></div>
        <div><b>{extra?.heard ?? 0}</b><span>{tt("kayıtlı dinleme")}</span></div>
        <div><b>{genres.length}</b><span>{tt("beğendiğin sanatçı")}</span></div>
        <div><b>{extra?.month ?? 0}</b><span>{tt("son 30 günde dinleme")}</span></div>
      </div> : <div className="tp-stats">
        <div><b>{Math.max(liked.length, learned?.liked ?? 0)}</b><span>{tt("beğendiğin")}</span></div>
        <div><b>{Math.max(disliked.length, learned?.disliked ?? 0)}</b><span>{tt("beğenmediğin")}</span></div>
        <div><b>{avg != null ? n1(avg) : "–"}</b><span>{tt("puan ortalaman")}</span></div>
        <div><b>{all.length}</b><span>{kind === "book" ? tt("analiz edilen kitap") : tt("analiz edilen eser")}</span></div>
        <div><b>{reviewsRead}</b><span>{kind === "book" ? tt("okunan inceleme") : tt("okunan yorum")}</span></div>
        <div><b>{diary.filter((e) => (e.watched ?? 0) > month).length + all.filter((x) => x.run.at > month).length}</b><span>{tt("son 30 günde hareket")}</span></div>
      </div>}

      <div className="tp-grid">
        <div className="tp-card">
          <h3>{tt("Zevk haritan")}</h3>
          <p className="muted small">{tt("Altı konunun senin için gerçek ağırlığı: elle verdiğin önem %35, beğeni sebeplerin %65.")}</p>
          <Radar values={eff} />
        </div>
        <div className="tp-card">
          <h3>{tt("Konulara göre ağırlıkların")}</h3>
          <div className="tp-weights">{[...ASPECTS].sort((a, b) => eff[b] - eff[a]).map((a) => <div key={a} className="tp-w">
            <span>{name(a)}</span>
            <div className="tp-wbar"><i style={{ width: (eff[a] / 2.2) * 100 + "%" }} /></div>
            <b>{eff[a] ? "×" + eff[a].toLocaleString(locale(), { maximumFractionDigits: 2 }) : tt("katılmıyor")}</b>
            <small>{learned?.boost[a] ? <em className="-up">↑ {tt("beğenilerinden")}</em> : null}{learned?.penalty[a] ? <em className="-down">↓ {tt("beğenmediklerinden")}</em> : null}{!learned?.boost[a] && !learned?.penalty[a] ? tt("önem {0}/5", profile.weights[a]) : null}</small>
          </div>)}</div>
          {learned && <p className="muted small">{tt("Zevkin {0} beğendiğin ve {1} beğenmediğin eserden öğrenildi.", learned.liked, learned.disliked)}</p>}
        </div>
      </div>

      <div className="tp-grid">
        {pattern.length > 0 && <div className="tp-card"><h3>{tt("Beğendiklerinde öne çıkanlar")}</h3><p className="muted small">{tt("Beğendiğin analizli eserlerde konuların ortalama puanı")}</p>
          <Bars rows={pattern.map(([a, v]) => [name(a), v, n1(v)])} max={10} tone="good" /></div>}
        {genres.length > 0 && <div className="tp-card"><h3>{music ? (store.get("tasteGenres:music") && genres.length && Object.keys(tasteGenres("music")).length ? tt("En sevdiğin türler") : tt("En sevdiğin sanatçılar")) : kind === "book" ? tt("En sevdiğin konular") : tt("En sevdiğin türler")}</h3>
          <p className="muted small">{music ? (Object.keys(tasteGenres("music")).length ? tt("Beğendiğin şarkıların türleri") : tt("Beğendiğin şarkıların sanatçıları")) : kind === "book" ? tt("Beğendiğin kitapların konuları (Open Library)") : tt("Beğendiklerindeki türler")}</p>
          <Bars rows={genres.map(([x, c]) => [x, c])} max={genres[0][1]} /></div>}
        {extra && extra.rows.length > 0 && <div className="tp-card"><h3>{extra.title}</h3><p className="muted small">{extra.sub}</p>
          <Bars rows={extra.rows} max={extra.rows[0][1]} /></div>}
        {extra?.hours && extra.heard ? <div className="tp-card"><h3>{tt("Ne zaman dinliyorsun")}</h3><p className="muted small">{tt("Son {0} dinlemenin saatlere dağılımı", extra.heard)}</p>
          <div className="tp-hist" style={{ gridTemplateColumns: "repeat(8, 1fr)" }}>{extra.hours.map((c, i) => <div key={i} title={tt("{0}:00–{1}:00 · {2} dinleme", i * 3, i * 3 + 3, c)}><i style={{ height: (c / Math.max(1, ...extra.hours!)) * 100 + "%" }} /><span>{i * 3}</span></div>)}</div></div> : null}
        {rated.length > 0 && <div className="tp-card"><h3>{tt("Puan dağılımın")}</h3><p className="muted small">{tt("{0} puanlı eser", rated.length)}</p>
          <div className="tp-hist">{spread.map((c, i) => <div key={i} title={tt("{0} puan: {1} eser", i + 1, c)}><i style={{ height: (c / spreadMax) * 100 + "%" }} /><span>{i + 1}</span></div>)}</div>
          {generosity != null && <p className="small tp-gen">{Math.abs(generosity) < 0.3 ? tt("Puanların Luna Analiz'le neredeyse aynı.") : generosity > 0 ? tt("Luna Analiz'e göre ortalama {0} puan daha cömertsin.", n1(generosity)) : tt("Luna Analiz'e göre ortalama {0} puan daha sertsin.", n1(-generosity))}</p>}
        </div>}
      </div>

      {all.length >= 2 && <div className="tp-grid">
        {top(praised).length > 0 && <div className="tp-card"><h3>{tt("En çok övülen")}</h3><p className="muted small">{tt("{0} analizde yorumcuların övdüğü konular", all.length)}</p><Bars rows={top(praised)} max={top(praised)[0][1]} tone="good" /></div>}
        {top(criticised).length > 0 && <div className="tp-card"><h3>{tt("En çok eleştirilen")}</h3><p className="muted small">{tt("{0} analizde yorumcuların eleştirdiği konular", all.length)}</p><Bars rows={top(criticised).map(([l, v]) => [l, v, n1(v)])} max={top(criticised)[0][1]} tone="bad" /></div>}
        {top(themes).length > 0 && <div className="tp-card"><h3>{tt("Temalar ve duygular")}</h3><p className="muted small">{kind === "book" ? tt("Okuduklarında en sık geçenler") : tt("İzlediklerinde en sık geçenler")}</p>
          <div className="tp-tags">{top(themes, 8).map(([t]) => <i key={t}>{t}</i>)}{top(feels, 6).map(([t]) => <i key={t} className="-feel">{t}</i>)}</div></div>}
      </div>}

      {(avoided.length > 0 || gaps.length > 0) && <div className="tp-grid">
        {avoided.length > 0 && <div className="tp-card"><h3>{tt("Kaçındıkların")}</h3><p className="muted small">{tt("Eleştiriliyorsa uyarı istediğin ya da beğenmediklerinde sebep gösterdiğin konular")}</p>
          <div className="tp-tags">{avoided.map((a) => <i key={a} className="-bad">{name(a)}{learned?.penalty[a] ? ` ×${n1(learned.penalty[a]!)}` : ""}</i>)}</div></div>}
        {gaps.length > 0 && <div className="tp-card"><h3>{tt("Profil boşlukları")}</h3><p className="muted small">{music ? tt("Bu konularda henüz sinyal yok. Büyük çalma ekranında beğendiğin ya da beğenmediğin şarkılarda sebep işaretlersen öneriler keskinleşir.")
            : kind === "book" ? tt("Bu konularda henüz sinyal yok. Kitap sayfasında \"Okuduktan sonra\" bölümünden sebep işaretlersen öneriler keskinleşir.")
            : tt("Bu konularda henüz sinyal yok. İzlediklerinde \"İzledikten sonra\" bölümünden sebep işaretlersen öneriler keskinleşir.")}</p>
          <div className="tp-tags">{gaps.map((a) => <i key={a}>{name(a)}</i>)}</div></div>}
      </div>}

      {all.length > 0 && <div className="tp-card -wide"><h3>{tt("Son analizlerin")}</h3>
        <div className="tp-recent">{all.slice(0, 10).map(({ key, run }) => {
          const shown = titleOf(run) || "?";
          return <button key={key} className="tp-run" disabled={!onOpen} onClick={() => onOpen?.({ title: shown, year: run.year, kind: key.startsWith("tv:") ? "tv" : "movie" })}>
            <b className="ellipsis">{shown}</b>
            <span>{run.verdict.score != null ? n1(run.verdict.score) : "—"}</span>
            <small className={"-" + run.verdict.lean}>{run.count} {tt("yorum")}</small>
          </button>;
        })}</div>
      </div>}
    </>}
  </section>;
}
