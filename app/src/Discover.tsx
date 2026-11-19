import { memo } from "react";
import {extraText} from "./Extras";
import { MyScore } from "./FilmCardExtras";
import { CardActions, CardFriendLine, CardFriends } from "./FilmCardExtras";
// Keşfet, in two parts: "Yeni ve popüler" (TMDB lists and the user's Stremio addon catalogs) and
// "Sana özel" (picks drawn from what the user liked and watched). Every card opens the same title
// page as the recommendations.
import { lang, locale, tt, DEC } from "./i18n";
import { logDebug } from "./debugTelemetry";
import { startTransition, useEffect, useRef, useState } from "react";
import { openUrl } from "./linkOpen";
import { IMG, isFinished, Item, notOut, prefetchDetails, Recent, releaseLabel, SearchHit, searchTmdb, store, tmdbGet, tmdbList } from "./library";
import { I, Icon, openMenu, pct, titleAsks } from "./Screens";
import { CwStar,cwOf, DetailTarget, diaryGet, isSafe, loadDiary, loadTaste, modOn, SourceProps, uiBusy, useContentWarnings, useTaste, youtubeTrailer } from "./Taste";
import { TitleDetail } from "./LazyViews";
import { catalogItems, catalogRows, useAddons } from "./Addons";
import { matchKey } from "./textMatch";
/** a card under the pointer fetches its title's details and pictures, so the window opens complete */
const warm = (t: { tmdbId?: number; kind?: string }) => { if (t.tmdbId) prefetchDetails(t.kind === "tv" ? "tv" : "movie", t.tmdbId); };

type Card = {
  key: string; title: string; year?: string; poster?: string; rating?: number;
  tmdbId?: number; kind?: "movie" | "tv"; because?: string; target: DetailTarget; date?: string;
};

const fromHit = (h: SearchHit, because?: string): Card => ({
  key: h.kind + ":" + h.id, title: h.title, year: h.year || undefined, poster: h.poster ? IMG + "w342" + h.poster : undefined,
  rating: h.rating || undefined, tmdbId: h.id, kind: h.kind, because, date: h.date,
  target: { title: h.title, year: h.year || undefined, kind: h.kind, tmdbId: h.id, date: h.date },
});
const targetOf = (h: SearchHit): DetailTarget => ({ title: h.title, year: h.year || undefined, kind: h.kind, tmdbId: h.id, date: h.date });

// ---------- "Sana özel" ----------
type Seed = { id: number; kind: "movie" | "tv"; title: string; why: "like" | "watched"; genres?: string[] };
const norm = (t: string) => t.trim().toLocaleLowerCase("tr");
// for comparing titles from different sources ("interstellar" = "Interstellar"); `norm` stays for the stored cache key
const same = (t: string) => matchKey(t.trim());

/** A diary title's TMDB id (looked up once). */
async function diaryId(title: string, year?: string): Promise<{ id: number; kind: "movie" | "tv" } | null> {
  const k = `tid:${norm(title)}|${year ?? ""}`;
  const c = store.json<{ id: number; kind: "movie" | "tv" } | null | undefined>(k, undefined);
  if (c !== undefined) return c;
  const y = year ? Number(year) : undefined;
  const h = (await searchTmdb(title, "movie", y).catch(() => []))[0] ?? (await searchTmdb(title, "tv", y).catch(() => []))[0];
  const v = h ? { id: h.id, kind: h.kind } : null;
  store.set(k, JSON.stringify(v));
  return v;
}

/** What the user liked or watched, newest first: the titles picks are drawn from. */
async function seeds(items: Item[], recent: Recent[]): Promise<Seed[]> {
  const out: Seed[] = [];
  const add = (s: Seed) => { if (!out.some((x) => x.id === s.id && x.kind === s.kind)) out.push(s); };
  for (const [k, e] of Object.entries(loadTaste()).sort((a, b) => b[1].at - a[1].at)) {
    const m = k.match(/^(movie|tv):(\d+)$/);
    if (m && e.vote === "like") add({ id: +m[2], kind: m[1] as "movie" | "tv", title: e.title, why: "like" });
  }
  const liked = Object.values(loadDiary()).filter((d) => d.vote === "like" || (d.rating ?? 0) >= 7).sort((a, b) => b.at - a.at).slice(0, 6);
  for (const d of await Promise.all(liked.map(async (d) => ({ d, r: await diaryId(d.title, d.year) }))))
    if (d.r) add({ ...d.r, title: d.d.title, why: "like", genres: d.d.genres });
  const order = (it: Item) => { const i = recent.findIndex((r) => it.files.some((f) => f.path === r.path)); return i < 0 ? 999 : i; };
  items
    .filter((it) => it.meta && it.meta.id > 0 && it.files.some((f) => isFinished(f.path) || pct(recent.find((r) => r.path === f.path)) >= 40))
    .sort((a, b) => order(a) - order(b))
    .forEach((it) => add({ id: it.meta!.id, kind: it.meta!.kind, title: it.meta!.title, why: "watched", genres: it.meta!.genres }));
  return out;
}

/** TMDB's film genres by (localized) name. */
async function genreIds(kind: "movie" | "tv" = "movie"): Promise<Map<string, number>> {
  const k = (kind === "tv" ? "tvgenres:" : "genres:") + locale();
  let list = store.json<{ id: number; name: string }[] | null>(k, null);
  if (!list) {
    list = ((await tmdbGet(`/genre/${kind}/list`, { language: locale() }).catch(() => null))?.genres ?? []) as { id: number; name: string }[];
    if (list.length) store.set(k, JSON.stringify(list));
  }
  return new Map(list.map((g) => [norm(g.name), g.id]));
}

type Picks = {
  heroes: SearchHit[];
  top: Card[];
  bySeed: { seed: Seed; cards: Card[] }[];
  genres: { names: string[]; cards: Card[] } | null;
  hidden: Card[];
  tv: Card[];
  tvHeroes: SearchHit[];
  tvGenres: { names: string[]; cards: Card[] } | null;
  /** TMDB genre ids of the loved genres, for the endless list at the bottom */
  more: { movie: string; tv: string };
  /** keys already shown in the rows above, or not wanted */
  seen: string[];
};

async function picks(items: Item[], recent: Recent[]): Promise<Picks | "empty"> {
  const all = await seeds(items, recent);
  if (!all.length) return "empty";
  const from = all.slice(0, 10);
  const diary = Object.values(loadDiary());
  const disliked = new Set(diary.filter((d) => d.vote === "dislike").map((d) => same(d.title)));
  for (const e of Object.values(loadTaste())) if (e.vote === "dislike") disliked.add(same(e.title));
  // anything already watched, liked or rated isn't news
  const watched = new Set(diary.filter((d) => d.watched || d.vote || d.rating).map((d) => same(d.title)));
  for (const e of Object.values(loadTaste())) if (e.vote) watched.add(same(e.title));
  const owned = new Set(items.filter((i) => i.meta).map((i) => i.meta!.kind + ":" + i.meta!.id));
  const skip = (h: SearchHit) => owned.has(h.kind + ":" + h.id) || disliked.has(same(h.title)) || watched.has(same(h.title)) ||
    from.some((s) => s.id === h.id && s.kind === h.kind) || (h.rating ?? 0) < 5.5;
  const why = (s: Seed) => (s.why === "like" ? tt("{0} beğendiğin için", s.title) : tt("{0} izlediğin için", s.title));

  const lists = await Promise.all(from.map((s) => tmdbList(`/${s.kind}/${s.id}/recommendations`, s.kind).catch(() => [] as SearchHit[])));
  const score = new Map<string, { h: SearchHit; n: number; seed: Seed; hits: number }>();
  lists.forEach((list, si) => list.slice(0, 20).forEach((h, rank) => {
    if (skip(h)) return;
    const k = h.kind + ":" + h.id;
    // titles several favourites point to rise; a liked seed counts more than one only watched
    const w = (1 - rank / 25) * (from[si].why === "like" ? 1.5 : 1);
    const cur = score.get(k);
    if (cur) { cur.n += w; cur.hits++; } else score.set(k, { h, n: w, seed: from[si], hits: 1 });
  }));
  const ranked = [...score.values()].sort((a, b) => b.n - a.n);
  const top = ranked.slice(0, 30).map(({ h, seed, hits }) => fromHit(h, hits > 1 ? tt("{0} ve {1} başka beğendiğine benziyor", seed.title, hits - 1) : why(seed)));
  const heroes = ranked.filter((x) => x.h.backdrop && x.h.overview).slice(0, 6).map((x) => x.h);

  // one row per recent favourite: "Because you liked X"
  const bySeed = from.slice(0, 6)
    .map((seed, i) => ({ seed, cards: lists[i].filter((h) => !skip(h)).slice(0, 20).map((h) => fromHit(h)) }))
    .filter((r) => r.cards.length >= 4);

  // the genres that come up most in what was liked and watched
  const count = new Map<string, number>();
  for (const s of from) for (const g of s.genres ?? []) count.set(g, (count.get(g) ?? 0) + (s.why === "like" ? 2 : 1));
  const names = [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([g]) => g);
  let genres: Picks["genres"] = null;
  let movieGenreMap: Map<string, number> | null = null;
  if (names.length) {
    const ids = movieGenreMap = await genreIds();
    const gid = names.map((n) => ids.get(norm(n))).filter((x): x is number => !!x);
    if (gid.length) {
      const hits = await tmdbList("/discover/movie", "movie", {
        with_genres: gid.join(","), sort_by: "vote_average.desc", "vote_count.gte": "800",
      }).catch(() => [] as SearchHit[]);
      const cards = hits.filter((h) => !skip(h)).map((h) => fromHit(h));
      if (cards.length >= 4) genres = { names, cards };
    }
  }

  // highly rated but little known: picks with a high score that aren't popular
  const hidden = ranked.filter((x) => (x.h.rating ?? 0) >= 7.2).slice(30, 50).map(({ h, seed }) => fromHit(h, why(seed)));
  // series of their own: recommendations from the series liked or watched, then series in the loved genres
  const tvSeeds = all.filter((s) => s.kind === "tv").slice(0, 8);
  const tvLists = await Promise.all(tvSeeds.map((s) => {
    const i = from.indexOf(s);
    return i >= 0 ? Promise.resolve(lists[i]) : tmdbList(`/tv/${s.id}/recommendations`, "tv").catch(() => [] as SearchHit[]);
  }));
  const tvScore = new Map<string, { h: SearchHit; n: number; seed: Seed; hits: number }>();
  const tvSkip = (h: SearchHit) => skip(h) || tvSeeds.some((s) => s.id === h.id);
  tvLists.forEach((list, si) => list.slice(0, 20).forEach((h, rank) => {
    if (h.kind !== "tv" || tvSkip(h)) return;
    const w = (1 - rank / 25) * (tvSeeds[si].why === "like" ? 1.5 : 1);
    const cur = tvScore.get("tv:" + h.id);
    if (cur) { cur.n += w; cur.hits++; } else tvScore.set("tv:" + h.id, { h, n: w, seed: tvSeeds[si], hits: 1 });
  }));
  const tvRanked = [...tvScore.values()].sort((a, b) => b.n - a.n);
  const tvHeroes = tvRanked.filter((x) => x.h.backdrop && x.h.overview).slice(0, 6).map((x) => x.h);
  const tv = tvRanked.slice(0, 30)
    .map(({ h, seed, hits }) => fromHit(h, hits > 1 ? tt("{0} ve {1} başka beğendiğine benziyor", seed.title, hits - 1) : why(seed)));
  let tvGenres: Picks["tvGenres"] = null;
  let tvIds: number[] = [];
  const allCount = new Map<string, number>();
  for (const s of all) for (const g of s.genres ?? []) allCount.set(g, (allCount.get(g) ?? 0) + (s.why === "like" ? 2 : 1));
  const movieIds = names.length ? [...new Set(names.map((n) => movieGenreMap?.get(norm(n))).filter((x): x is number => !!x))] : [];
  const tvNames = [...allCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([g]) => g);
  if (tvNames.length) {
    // TV genres are named differently ("Aksiyon & Macera"), so a film genre matches the TV genre that contains it
    const ids = [...(await genreIds("tv")).entries()];
    const gid = [...new Set(tvNames.map((n) => ids.find(([name]) => name === norm(n) || name.includes(norm(n)))?.[1]).filter((x): x is number => !!x))];
    tvIds = gid;
    if (gid.length) {
      const hits = await tmdbList("/discover/tv", "tv", {
        with_genres: gid.join("|"), without_genres: "10763,10767", sort_by: "vote_average.desc", "vote_count.gte": "300",
      }).catch(() => [] as SearchHit[]);
      const cards = hits.filter((h) => !tvSkip(h) && !tvScore.has("tv:" + h.id)).map((h) => fromHit(h));
      if (cards.length >= 4) tvGenres = { names: tvNames, cards };
    }
  }
  const seen = [...owned, ...top, ...tv, ...hidden, ...(genres?.cards ?? []), ...(tvGenres?.cards ?? []), ...bySeed.flatMap((b) => b.cards)]
    .map((x) => typeof x === "string" ? x : x.key);
  return { heroes, top, bySeed, genres, hidden, tv, tvHeroes, tvGenres, more: { movie: movieIds.join("|"), tv: tvIds.join("|") }, seen };
}

// ---------- a horizontal row ----------
function Rail({ title, sub, load, given, deps = [], items, onOpen, more }: {
  title: string; sub?: string; load?: () => Promise<Card[]>; given?: Card[]; deps?: unknown[]; items: Item[];
  onOpen: (t: DetailTarget) => void;
  /** the next page (2, 3, …) when the row is scrolled near its end; [] once there is no more */
  more?: (page: number) => Promise<Card[]>;
}) {
  const [loaded, setLoaded] = useState<Card[] | null>(null);
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [extra, setExtra] = useState<Card[]>([]);
  const page = useRef({ next: 2, busy: false, done: false, misses: 0 });
  useEffect(() => { setExtra([]); page.current = { next: 2, busy: false, done: false, misses: 0 }; }, deps);
  const loadMore = () => {
    const el = ref.current, pg = page.current;
    if (!more || !el || pg.busy || pg.done || el.scrollLeft + el.clientWidth * 4 < el.scrollWidth) return;
    pg.busy = true;
    more(pg.next++).then((add) => {
      if (!add.length) { pg.done = true; return; }
      // asked well before the end and added as low-priority work, so a drag in progress keeps its frames
      startTransition(() => setExtra((cur) => {
        const seen = new Set([...(given ?? loaded ?? []), ...cur].map((c) => c.key));
        const fresh = add.filter((c) => !seen.has(c.key));
        // a page of only repeats or skipped titles: try a few more before giving up
        if (!fresh.length && ++pg.misses > 3) pg.done = true;
        return fresh.length ? [...cur, ...fresh] : cur;
      }));
    }).catch(() => { pg.done = true; }).finally(() => { pg.busy = false; requestAnimationFrame(loadMore); });
  };
  // drag the posters sideways with the left mouse button; a drag is not a click on the card under it
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const dragged = useRef(false);
  const checkMore = useRef(0);
  const loaf = useRef<PerformanceObserver | null>(null), slow = useRef<any[]>([]);
  const meter = useRef(0), frames = useRef<{ frames: number; late: number; worst: number; start: number } | null>(null);
  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || e.button !== 0 || !ref.current) return;
    drag.current = { x: e.clientX, left: ref.current.scrollLeft, moved: false };
    uiBusy.drag = true;
    // a release outside the row (no capture yet) must still end the hold, or disk writes would wait forever
    const end = () => { uiBusy.drag = false; window.removeEventListener("pointerup", end, true); window.removeEventListener("blur", end); };
    window.addEventListener("pointerup", end, true); window.addEventListener("blur", end);
    // frame timing of the drag for the debug report (counts only): which frames came late and by how much
    const m = { last: performance.now(), frames: 0, late: 0, worst: 0, start: performance.now() };
    const tick = (now: number) => { const gap = now - m.last; m.last = now; m.frames++; if (gap > 25) m.late++; if (gap > m.worst) m.worst = gap; if (drag.current) meter.current = requestAnimationFrame(tick); };
    cancelAnimationFrame(meter.current); meter.current = requestAnimationFrame(tick); frames.current = m;
    // what the slow frames spent their time on (WebView2's long-animation-frame entries): script file and function names, layout time
    slow.current = [];
    try { loaf.current?.disconnect(); loaf.current = new PerformanceObserver((l) => { for (const x of l.getEntries() as any[]) slow.current.push(x); }); loaf.current.observe({ type: "long-animation-frame", buffered: false }); } catch { loaf.current = null; }
    dragged.current = false;
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current, el = ref.current;
    if (!d || !el) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) < 6) return;
    if (!d.moved) { d.moved = true; el.setPointerCapture(e.pointerId); el.classList.add("dragging"); }
    // one scroll per frame: the mouse reports far more often than the screen draws, and each write made the row lay out again
    want.current = d.left - dx;
    if (!frame.current) frame.current = requestAnimationFrame(() => { frame.current = 0; if (ref.current && want.current !== null) ref.current.scrollLeft = want.current; });
  };
  const want = useRef<number | null>(null), frame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  const onUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    uiBusy.drag = false;
    cancelAnimationFrame(meter.current);
    const m = frames.current;
    loaf.current?.disconnect(); loaf.current = null;
    const top = [...slow.current].sort((a, b) => b.duration - a.duration).slice(0, 4).map((x) => ({
      ms: Math.round(x.duration), layout: Math.round(x.styleAndLayoutStart ? x.startTime + x.duration - x.styleAndLayoutStart : 0),
      scripts: [...(x.scripts ?? [])].sort((a: any, b: any) => b.duration - a.duration).slice(0, 3).map((sc: any) =>
        `${Math.round(sc.duration)}ms ${sc.invoker ?? ""} ${sc.sourceFunctionName ?? ""} ${String(sc.sourceURL ?? "").split("/").pop()?.split("?")[0] ?? ""}:${sc.sourceCharPosition ?? ""}`),
    }));
    if (d?.moved && m) logDebug("app", "discover_drag", { slow: JSON.stringify(top), ms: Math.round(performance.now() - m.start), frames: m.frames, late: m.late, worst: Math.round(m.worst), cards: ref.current?.childElementCount ?? 0 });
    if (!d?.moved) return;
    dragged.current = true;
    ref.current?.classList.remove("dragging");
    if (ref.current?.hasPointerCapture(e.pointerId)) ref.current.releasePointerCapture(e.pointerId);
  };
  useEffect(() => {
    if (!load) return;
    let alive = true;
    setFailed(false);
    load().then((c) => alive && setLoaded(c)).catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, deps);
  useTaste();
  const cards = given ?? loaded;
  const list = cards ? [...cards, ...extra] : [];
  useContentWarnings(list.filter((c) => c.tmdbId).map((c) => ({ tmdbId: c.tmdbId, kind: c.kind })));
  if (failed || (cards && !cards.length)) return null;
  const owned = (c: Card) => items.some((i) => c.tmdbId && i.meta?.id === c.tmdbId && i.meta.kind === c.kind);
  const scroll = (d: number) => ref.current?.scrollBy({ left: d * ref.current.clientWidth * 0.85, behavior: "smooth" });
  return (
    <section className="row disc-row">
      <div className="row-head"><h2>{title}</h2>{sub && <span className="muted small">{sub}</span>}</div>
      <div className="rail-wrap">
        <button className="rail-arrow l" aria-label={tt("Önceki")} onClick={() => scroll(-1)}><Icon d={I.left} size={26} /></button>
        <div className="rail" ref={ref} onScroll={() => { if (!checkMore.current) checkMore.current = requestAnimationFrame(() => { checkMore.current = 0; loadMore(); }); }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
          onClickCapture={(e) => { if (dragged.current) { e.preventDefault(); e.stopPropagation(); dragged.current = false; } }} onDragStart={(e) => e.preventDefault()}>
          {cards == null && Array.from({ length: 8 }, (_, i) => <div key={i} className="disc-card ghost-card"><div className="disc-poster" /></div>)}
          {list.map((c) => {
            const d = diaryGet(c.title, c.year);
            const blur = modOn() && !!cwOf(c.tmdbId, c.kind)?.length && !isSafe(c.tmdbId, c.kind);
            return (
              <button key={c.key} className="disc-card" onPointerEnter={() => warm(c.target)} onFocus={() => warm(c.target)} onClick={() => onOpen(c.target)} title={c.because}
                onContextMenu={(e) => openMenu(e, [...titleAsks(c.title, c.year, c.kind), "sep", { label: tt("Detaylar"), act: () => onOpen(c.target) }])}>
                <div className={"disc-poster" + (blur ? " cw-blur" : "")}>
                  {c.poster ? <img src={c.poster} alt="" loading="lazy" decoding="async" onLoad={(e) => e.currentTarget.classList.add("loaded")} />
                    : <div className="plg-blank"><Icon d={I.film} size={26} /><span>{c.title}</span></div>}
                  <span className="disc-warning"><CwStar id={c.tmdbId} kind={c.kind}/></span>
                  <CardFriends t={{ title: c.title, year: c.year, id: c.tmdbId, kind: c.kind ?? "movie" }} />
                  <CardActions t={{ title: c.title, year: c.year, id: c.tmdbId, kind: c.kind ?? "movie" }} onDetail={() => onOpen(c.target)} />
                  {c.rating ? <span className="tmdb-badge">★ {c.rating.toFixed(1).replace(".", DEC)}<MyScore t={{ title: c.title, year: c.year, id: c.tmdbId, kind: c.kind ?? "movie" }} /></span> : null}
                  {notOut(c.date, c.year) ? <span className="disc-flag soon">{c.date ? tt("Çıkış: {0}", releaseLabel(c.date, true)) : tt("Henüz çıkmadı")}</span>
                    : (owned(c) || d?.watched) && <span className="disc-flag">{d?.watched ? tt("İzledin") : tt("Kütüphanende")}</span>}
                </div>
                <div className="card-title">{c.title}</div>
                <div className="muted small ellipsis">{c.because ?? c.year ?? ""}</div>
                <CardFriendLine t={{ title: c.title, year: c.year, id: c.tmdbId, kind: c.kind ?? "movie" }} />
              </button>
            );
          })}
        </div>
        <button className="rail-arrow r" aria-label={tt("Sonraki")} onClick={() => scroll(1)}><Icon d={I.right} size={26} /></button>
      </div>
    </section>
  );
}

// ---------- the big slider at the top ----------
function DiscHero({ hits, eyebrow, onOpen }: { hits: SearchHit[] | null; eyebrow: (h: SearchHit) => string; onOpen: (t: DetailTarget) => void }) {
  const [i, setI] = useState(0);
  const [hover, setHover] = useState(false);
  const still = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const n = hits?.length ?? 0;
  useEffect(() => {
    // the fill animation turns the slides (see the home hero); a timer only when motion is reduced
    if (!still || hover || n < 2) return;
    const id = setTimeout(() => setI((x) => (x + 1) % n), 8000);
    return () => clearTimeout(id);
  }, [i, hover, n, still]);
  if (!hits || !n) return hits ? null : <section className="hero disc-hero placeholder" />;
  // (one index for the text and the picture, also after the list got shorter)
  const cur = Math.min(i, n - 1);
  const h = hits[cur];
  const open = () => onOpen(targetOf(h));
  return (
    <section className="hero clickable disc-hero" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onClick={open}>
      {hits.map((x, k) => <div key={x.kind + x.id} className={"hero-bg" + (k === cur ? " on" : "")} style={{ backgroundImage: `url("${IMG}w1280${x.backdrop}")` }} />)}
      <div className="hero-shade" />
      <div className="hero-body" key={h.kind + h.id}>
        <div className="eyebrow">{eyebrow(h)}</div>
        <h1>{h.title}</h1>
        <div className="muted hero-meta">
          {h.rating ? `★ ${String(h.rating).replace(".", DEC)} · ` : ""}{h.year}<MyScore long t={{ title: h.title, year: h.year ? String(h.year) : undefined, id: h.id, kind: h.kind === "tv" ? "tv" : "movie" }} />
          <p className="hero-ov">{h.overview}</p>
        </div>
        <div className="hero-actions" onClick={(e) => e.stopPropagation()}>
          <button className="primary light" onClick={open}>{tt("Detaylar")}</button>
          <button className="ghost" onClick={() => openUrl(youtubeTrailer(h.year ? `${h.title} (${h.year})` : h.title))}><Icon d={I.play} fill size={16} />  {tt("Fragman")}</button>
        </div>
      </div>
      {n > 1 && (
        <div className="hero-dots" onClick={(e) => e.stopPropagation()}>
          {hits.map((_, k) => (
            <button key={k} aria-label={tt("{0}. öğe", k + 1)} className={"hero-dot" + (k === i ? " on" : "")} onClick={() => setI(k)}>
              {k === i && <span className="hero-dot-fill disc-fill" style={{ animationPlayState: hover ? "paused" : "running" }} onAnimationEnd={() => setI((x) => (x + 1) % n)} />}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

// ---------- the two parts ----------
const NewSection = memo(function NewSection({ items, onOpen,filter }: { items: Item[]; onOpen: (t: DetailTarget) => void;filter?:CategoryFilter|null }) {
  const addons = useAddons();
  const hasKey = !!store.get("tmdbKey");
  const region = lang() === "tr" ? "TR" : "US";
  const limits=filter?.length.split("-")??[];const params:Record<string,string>={...(filter?.genre?{with_genres:filter.genre}:{}),...(limits[0]?{"with_runtime.gte":limits[0]}:{}),...(limits[1]?{"with_runtime.lte":limits[1]}:{})};
  const filterKey=JSON.stringify(filter);
  const [trend, setTrend] = useState<SearchHit[] | null>(null);
  useEffect(() => {
    if (!hasKey) return;
    let alive = true;
    setTrend(null);
    (filter?tmdbList("/discover/"+filter.kind,filter.kind,{...params,sort_by:"popularity.desc"}):tmdbList("/trending/all/week")).then((l) => alive && setTrend(l)).catch(() => alive && setTrend([]));
    return () => { alive = false; };
  }, [filterKey,hasKey]);
  const catRows = catalogRows(addons).filter(({ cat }) => cat.type === "movie" || cat.type === "series");
  // "new" rows by date (TMDB discover), so a filter's genre and runtime apply to them too; news and talk shows are left out
  const day = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  const newTv = (extra: Record<string, string> = {}) => (n = 1) => tmdbList("/discover/tv", "tv", { without_genres: "10763,10767", ...extra, "first_air_date.gte": day(-60), "first_air_date.lte": day(0), sort_by: "popularity.desc", page: String(n) });
  const dated: [string, string, (n?: number) => Promise<SearchHit[]>][] = !filter ? [] : filter.kind === "tv" ? [
    ["tvnew", extraText("Yeni başlayan diziler", "New series"), newTv(params)],
    ["tvair", extraText("Bu hafta yeni bölümü çıkan diziler", "New episodes this week"), (n = 1) => tmdbList("/discover/tv", "tv", { page: String(n),  without_genres: "10763,10767", ...params, "air_date.gte": day(-7), "air_date.lte": day(0), sort_by: "popularity.desc" })],
    ["tvsoon", extraText("Yakında başlayacak diziler", "Series starting soon"), (n = 1) => tmdbList("/discover/tv", "tv", { page: String(n),  without_genres: "10763,10767", ...params, "first_air_date.gte": day(1), "first_air_date.lte": day(90), sort_by: "popularity.desc" })],
  ] : [
    ["mvnew", tt("Yeni çıkan filmler"), (n = 1) => tmdbList("/discover/movie", "movie", { page: String(n),  ...params, "primary_release_date.gte": day(-60), "primary_release_date.lte": day(0), sort_by: "popularity.desc" })],
    ["mvsoon", tt("Yakında"), (n = 1) => tmdbList("/discover/movie", "movie", { page: String(n),  ...params, "primary_release_date.gte": day(1), "primary_release_date.lte": day(120), sort_by: "popularity.desc" })],
  ];
  const rows: [string, string, (n?: number) => Promise<SearchHit[]>][] = filter?[]: [
    ["now", tt("Yeni çıkan filmler"), (n = 1) => tmdbList("/movie/now_playing", "movie", { page: String(n),  region })],
    ["tvnew", extraText("Yeni başlayan diziler", "New series"), newTv()],
    ["popm", tt("Popüler filmler"), (n = 1) => tmdbList("/movie/popular", "movie", { page: String(n) })],
    ["popt", tt("Popüler diziler"), (n = 1) => tmdbList("/tv/popular", "tv", { page: String(n) })],
    ["air", tt("Yeni bölümü çıkan diziler"), (n = 1) => tmdbList("/tv/on_the_air", "tv", { page: String(n) })],
    ["top", tt("Tüm zamanların en iyileri"), (n = 1) => tmdbList("/movie/top_rated", "movie", { page: String(n) })],
    ["soon", tt("Yakında"), (n = 1) => tmdbList("/movie/upcoming", "movie", { page: String(n),  region })],
  ];
  return (
    <>
      {hasKey && (
        <>
          <DiscHero hits={trend && trend.filter((h) => h.backdrop && h.overview).slice(0, 6)} onOpen={onOpen}
            eyebrow={(h) => filter?extraText("SEÇTİĞİN KATEGORİLERDEN","FROM YOUR CATEGORIES"):(h.kind === "tv" ? tt("BU HAFTA ÇOK İZLENEN DİZİ") : tt("BU HAFTA ÇOK İZLENEN FİLM"))} />
          <Rail title={tt("Bu hafta öne çıkanlar")} items={items} onOpen={onOpen} given={trend?.map((h) => fromHit(h))} />
          {dated.map(([id, title, load]) => (
            <Rail key={id+filterKey} title={title} items={items} onOpen={onOpen} load={async () => (await load()).map((h) => fromHit(h))}
              more={async (n) => (await load(n)).map((h) => fromHit(h))} />
          ))}
          {filter&&<FilterGrid key={filterKey} kind={filter.kind} params={params} items={items} onOpen={onOpen}/>}
          {rows.map(([id, title, load]) => (
            <Rail key={id+filterKey} title={title} items={items} onOpen={onOpen} load={async () => (await load()).map((h) => fromHit(h))}
              more={async (n) => (await load(n)).map((h) => fromHit(h))} />
          ))}
        </>
      )}
      {!filter&&catRows.map(({ addon, cat }) => (
        <Rail key={addon.base + cat.type + cat.id} title={cat.name ?? cat.id} sub={addon.manifest.name + " · " + (cat.type === "series" ? tt("Diziler") : tt("Filmler"))}
          items={items} onOpen={onOpen} deps={[addon.base, cat.id]}
          load={async () => (await catalogItems(addon, cat)).map((m) => ({
            key: m.type + ":" + m.id, title: m.name, year: m.releaseInfo?.slice(0, 4), poster: m.poster,
            rating: Number(m.imdbRating) || undefined, kind: m.type === "series" ? "tv" as const : "movie" as const,
            target: { title: m.name, year: m.releaseInfo?.match(/\d{4}/)?.[0], kind: m.type === "series" ? "tv" : "movie",
              imdbId: m.id.startsWith("tt") ? m.id : undefined, stremio: { type: m.type, id: m.id } },
          }))} />
      ))}
    </>
  );
});

const ForYouSection = memo(function ForYouSection({ items, recent, onOpen, kind }: { items: Item[]; recent: Recent[]; onOpen: (t: DetailTarget) => void; kind?: "movie" | "tv" }) {
  const [p, setP] = useState<Picks | "empty" | "error" | null>(null);
  // picks follow the library once it has loaded its details, and every new like
  const libSig = items.filter((i) => i.meta).length;
  const { taste } = useTaste();
  // (what each vote is, not how many: a like turned into a dislike changes the picks too)
  const likeSig = Object.entries(loadDiary()).filter(([, d]) => d.vote).map(([k, d]) => k + ":" + d.vote).join("|") + "#" + JSON.stringify(taste);
  // and what was watched (a film finished since)
  const seenSig = recent.map((r) => r.path + ":" + Math.round((r.duration ? r.time / r.duration : 0) * 10)).join("|");
  useEffect(() => {
    let alive = true;
    picks(items, recent).then((x) => alive && setP(x)).catch(() => alive && setP("error"));
    return () => { alive = false; };
  }, [libSig, likeSig, seenSig]);
  if (p === "empty") return (
    <section className="hero empty disc-you-empty">
      <h1>{tt("Seni biraz tanıyalım")}</h1>
      <div className="muted">{tt("Sana özel öneriler, beğendiğin ve izlediğin filmlerden çıkar. Birkaç film izle, film sayfalarında 👍 ile beğendiklerini işaretle ya da Öneriler'den Letterboxd hesabını içe aktar.")}</div>
    </section>
  );
  // a row scrolled to its end goes on with well rated titles in the loved genres
  const moreOf = (k: "movie" | "tv") => {
    if (!p || p === "error" || !p.more[k]) return undefined;
    const seen = new Set(p.seen);
    const done = new Set(Object.values(loadDiary()).filter((d) => d.vote || d.watched || d.rating).map((d) => same(d.title)));
    return async (n: number) => (await tmdbList(`/discover/${k}`, k, {
      with_genres: p.more[k], sort_by: "vote_average.desc", "vote_count.gte": k === "tv" ? "150" : "300", page: String(n),
      ...(k === "tv" ? { without_genres: "10763,10767" } : {}),
    })).map((h) => fromHit(h)).filter((c) => !seen.has(c.key) && !done.has(same(c.title)));
  };
  // the Categories film/series choice applies here too
  const only = (cards: Card[]) => (kind ? cards.filter((c) => c.kind === kind) : cards);
  if (p === "error") return <div className="disc-empty muted">{tt("Öneriler getirilemedi; internet bağlantını ve TMDB anahtarını kontrol et.")}</div>;
  return (
    <>
      <DiscHero hits={p ? (kind === "tv" ? p.tvHeroes : kind ? p.heroes.filter((h) => h.kind === kind) : p.heroes) : null} onOpen={onOpen} eyebrow={() => tt("SANA ÖZEL")} />
      {kind !== "tv" && <Rail title={tt("Sana en uygunlar")} sub={tt("beğendiklerine ve izlediklerine göre")} items={items} onOpen={onOpen} given={p ? only(p.top) : undefined} more={moreOf("movie")} deps={[!!p]} />}
      {p && kind !== "movie" && p.tv.length >= 4 && <Rail title={tt("Sana uygun diziler")} sub={tt("beğendiğin ve izlediğin dizilere göre")} items={items} onOpen={onOpen} given={p.tv} more={moreOf("tv")} deps={[!!p]} />}
      {p && kind !== "movie" && p.tvGenres && <Rail title={tt("Sevdiğin türlerden diziler: {0}", p.tvGenres.names.join(", "))} sub={tt("en beğenilenler")} items={items} onOpen={onOpen} given={p.tvGenres.cards} />}
      {p?.bySeed.map(({ seed, cards }) => only(cards).length >= 4 && (
        <Rail key={seed.kind + seed.id} title={seed.why === "like" ? tt("{0} beğendiğin için", seed.title) : tt("{0} izlediğin için", seed.title)}
          items={items} onOpen={onOpen} given={only(cards)} />
      ))}
      {kind !== "tv" && p?.genres && <Rail title={tt("Sevdiğin türlerden: {0}", p.genres.names.join(", "))} sub={tt("en beğenilenler")} items={items} onOpen={onOpen} given={p.genres.cards} />}
      {p && only(p.hidden).length >= 4 && <Rail title={tt("Gözden kaçmış olabilir")} sub={tt("yüksek puanlı, sana uygun")} items={items} onOpen={onOpen} given={only(p.hidden)} />}
      {p && <ForYouMore p={p} kind={kind} items={items} onOpen={onOpen} />}
    </>
  );
});

/** The endless list under Sana özel: well rated titles in the loved genres, page after page. */
function ForYouMore({ p, kind, items, onOpen }: { p: Picks; kind?: "movie" | "tv"; items: Item[]; onOpen: (t: DetailTarget) => void }) {
  const k = kind ?? (p.more.movie ? "movie" : "tv");
  const genres = p.more[k];
  if (!genres) return null;
  const seen = new Set(p.seen);
  const disliked = new Set(Object.values(loadDiary()).filter((d) => d.vote || d.watched || d.rating).map((d) => same(d.title)));
  return <FilterGrid key={k + genres} kind={k} items={items} onOpen={onOpen} title={k === "tv" ? tt("Sana uygun daha fazla dizi") : tt("Sana uygun daha fazla film")}
    params={{ with_genres: genres, "vote_count.gte": k === "tv" ? "150" : "300", "vote_average.gte": "6.5", ...(k === "tv" ? { without_genres: "10763,10767" } : {}) }}
    hide={(c) => seen.has(c.key) || disliked.has(same(c.title))} />;
}

type Part = "new" | "you";
type CategoryFilter={kind:"movie"|"tv";genre:string;length:string};
export function DiscoverPage({ items, recent, onPlay, onTorrent, onAsk, onSource, onDownload, onSettings }: {
  items: Item[]; recent: Recent[]; onPlay?: (path: string) => void; onTorrent?: () => void; onAsk?: (it: Item) => void; onSettings: () => void;
} & SourceProps) {
  const [detail, setDetail] = useState<DetailTarget | null>(null);
  const categoryAnchor=useRef<HTMLDivElement>(null);
  const [categoryOpen,setCategoryOpen]=useState(false),[category,setCategory]=useState<CategoryFilter|null>(null);
  useEffect(()=>{
    if(!categoryOpen)return;
    const outside=(event:PointerEvent)=>{if(event.target instanceof Node&&!categoryAnchor.current?.contains(event.target))setCategoryOpen(false);};
    const escape=(event:KeyboardEvent)=>{if(event.key==="Escape"){setCategoryOpen(false);categoryAnchor.current?.querySelector('button')?.focus();}};
    document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',escape);};
  },[categoryOpen]);
  const [part, setPartState] = useState<Part>(() => (store.get("discPart") === "you" ? "you" : "new"));
  const setPart = (x: Part) => { setPartState(x); store.set("discPart", x); };
  const hasKey = !!store.get("tmdbKey");
  return (
    <div className="page discover">
      <div className="disc-parts">
        <button role="tab" aria-selected={part === "new"} className={"seg" + (part === "new" ? " on" : "")} onClick={() => setPart("new")}>{tt("Yeni ve popüler")}</button>
        <div className="disc-filter-anchor" ref={categoryAnchor}><button className={"seg"+(category?" on":"")} aria-expanded={categoryOpen} aria-controls="discover-filters" aria-haspopup="dialog" onClick={()=>setCategoryOpen(v=>!v)}>{extraText("Kategoriler","Categories")} ▾</button>{categoryOpen&&<div className="disc-filter-menu" id="discover-filters" role="dialog" aria-label={extraText("Keşfi filtrele","Filter discovery")}><Categories value={category} onChange={value=>setCategory(value)}/><div className="modal-actions"><button className="chip" onClick={()=>{setCategory(null);setCategoryOpen(false);}}>{extraText("Filtreleri sıfırla","Reset filters")}</button><button className="chip" onClick={()=>setCategoryOpen(false)}>{tt("Kapat")}</button></div></div>}</div>
        <button role="tab" aria-selected={part === "you"} className={"seg" + (part === "you" ? " on" : "")} onClick={() => setPart(part === "you" ? "new" : "you")}>✦  {tt("Sana özel")}</button>
      </div>
      {!hasKey && (
        <section className="hero empty">
          <h1>{tt("Keşfet için TMDB anahtarı gerekli")}</h1>
          <div className="muted">{tt("Yeni ve popüler filmler, sana özel öneriler TMDB'den gelir. Anahtar ücretsiz.")}</div>
          <button className="ghost" onClick={onSettings}>{tt("Ayarlar'ı aç")}</button>
        </section>
      )}
      <div key={part} className="disc-part">
        {part === "new" ? <NewSection items={items} onOpen={setDetail} filter={category}/>
          : hasKey && <ForYouSection items={items} recent={recent} onOpen={setDetail} kind={category?.kind} />}
      </div>
      {detail && <TitleDetail key={detail.title + (detail.year ?? "")} t={detail} items={items} onClose={() => setDetail(null)} onPlay={onPlay} onTorrent={onTorrent}
        onAsk={onAsk} onSource={onSource} onDownload={onDownload} />}
    </div>
  );
}

function Categories({value,onChange}:{value:CategoryFilter|null;onChange:(value:CategoryFilter|null)=>void}){
 const kind=value?.kind??"movie",genre=value?.genre??"",length=value?.length??"";const [genres,setGenres]=useState<{id:number;name:string}[]>([]);
 useEffect(()=>{let alive=true;tmdbGet("/genre/"+kind+"/list",{language:locale()}).then(data=>{if(alive)setGenres(data.genres||[]);}).catch(()=>{if(alive)setGenres([]);});return()=>{alive=false;};},[kind]);
 return <div className="disc-category-controls">
   <div className="disc-filter-heading"><Icon d={I.search} size={18}/><strong>{extraText("Keşfi filtrele","Filter discovery")}</strong></div>
   <fieldset><legend>{extraText("Ne izlemek istersin?","What would you like to watch?")}</legend><div className="disc-kind-switch">{(["movie","tv"] as const).map(k=><button className={"chip"+(value?.kind===k?" on":"")} aria-pressed={value?.kind===k} key={k} onClick={()=>onChange(value?.kind===k?null:{kind:k,genre:"",length})}>{k==="movie"?tt("Film"):tt("Dizi")}</button>)}</div></fieldset>
   <fieldset><legend>{extraText("Kategori","Category")}</legend><div className="disc-genre-options"><button className={"chip"+(!genre?" on":"")} aria-pressed={!genre} onClick={()=>onChange({kind,genre:"",length})}>{extraText("Bütün kategoriler","All categories")}</button>{genres.map(g=><button key={g.id} className={"chip"+(genre.split(",").includes(String(g.id))?" on":"")} aria-pressed={genre.split(",").includes(String(g.id))} onClick={()=>{const id=String(g.id),set=genre?genre.split(","):[];onChange({kind,genre:(set.includes(id)?set.filter(x=>x!==id):[...set,id]).join(","),length});}}>{g.name}</button>)}</div></fieldset>
   <fieldset><legend>{extraText("Süren ne kadar?","How much time do you have?")}</legend><div className="disc-runtime-options">{[["",tt("Fark etmez")],["0-45",extraText("45 dk altı","Under 45 min")],["45-90",extraText("45–90 dk","45–90 min")],["90-120",extraText("1,5–2 saat","1.5–2 hours")],["120-180",extraText("2–3 saat","2–3 hours")],["180-",extraText("3 saat üzeri","Over 3 hours")]].map(([v,label])=><button key={v} className={"chip"+(length===v?" on":"")} aria-pressed={length===v} onClick={()=>onChange({kind,genre,length:v})}>{label}</button>)}</div></fieldset>
 </div>;
}

// Filtered discovery: one poster grid that keeps loading the next TMDB page as you scroll.
function FilterGrid({kind,params,items,onOpen,title,hide}:{kind:"movie"|"tv";params:Record<string,string>;items:Item[];onOpen:(t:DetailTarget)=>void;title?:string;hide?:(c:Card)=>boolean}){
 const [cards,setCards]=useState<Card[]>([]),[page,setPage]=useState(1),[busy,setBusy]=useState(true),[done,setDone]=useState(false),[loadError,setLoadError]=useState(false),[retry,setRetry]=useState(0);
 const end=useRef<HTMLDivElement>(null);
 useEffect(()=>{let alive=true;setBusy(true);setLoadError(false);
  tmdbList("/discover/"+kind,kind,{...params,sort_by:"popularity.desc",page:String(page)}).then(l=>{if(!alive)return;if(!l.length)setDone(true);
   setCards(c=>{const seen=new Set(c.map(x=>x.key));return [...c,...l.map(h=>fromHit(h)).filter(x=>!seen.has(x.key)&&!hide?.(x))];});}).catch(()=>alive&&setLoadError(true)).finally(()=>alive&&setBusy(false));
  return()=>{alive=false;};},[page,retry]);
 useEffect(()=>{const el=end.current;if(!el||busy||done||loadError||page>=500)return;
  const io=new IntersectionObserver(e=>{if(e[0].isIntersecting)setPage(p=>p+1);},{rootMargin:"600px"});io.observe(el);return()=>io.disconnect();},[busy,done,page,loadError]);
 useContentWarnings(cards.filter(c=>c.tmdbId).map(c=>({tmdbId:c.tmdbId,kind:c.kind})));
 const owned=(c:Card)=>items.some(i=>c.tmdbId&&i.meta?.id===c.tmdbId&&i.meta.kind===c.kind);
 if(done&&!cards.length)return <p className="muted">{extraText("Bu kategorilerde sonuç yok.","No results in these categories.")}</p>;
 return <section className="row disc-row"><div className="row-head"><h2>{title??extraText("Seçtiğin kategoriler","Your categories")}</h2></div>
  <div className="disc-grid">{cards.map(c=>{const d=diaryGet(c.title,c.year);return <button key={c.key} className="disc-card" onPointerEnter={()=>warm(c.target)} onClick={()=>onOpen(c.target)}>
   <div className="disc-poster">{c.poster?<img src={c.poster} alt="" loading="lazy" decoding="async" onLoad={e=>e.currentTarget.classList.add("loaded")}/>:<div className="plg-blank"><Icon d={I.film} size={26}/><span>{c.title}</span></div>}
    {c.rating?<span className="tmdb-badge">★ {c.rating.toFixed(1).replace(".",DEC)}<MyScore t={{title:c.title,year:c.year,id:c.tmdbId,kind:c.kind??"movie"}}/></span>:null}
    {(owned(c)||d?.watched)&&<span className="disc-flag">{d?.watched?tt("İzledin"):tt("Kütüphanende")}</span>}
    <CardFriends t={{title:c.title,year:c.year,id:c.tmdbId,kind:c.kind??"movie"}}/><CardActions t={{title:c.title,year:c.year,id:c.tmdbId,kind:c.kind??"movie"}} onDetail={()=>onOpen(c.target)}/></div>
   <div className="card-title">{c.title}</div><div className="muted small ellipsis">{c.year??""}</div><CardFriendLine t={{title:c.title,year:c.year,id:c.tmdbId,kind:c.kind??"movie"}}/></button>;})}
   {busy&&Array.from({length:6},(_,i)=><div key={"g"+i} className="disc-card ghost-card"><div className="disc-poster"/></div>)}</div>
  {loadError&&<div role="alert" className="library-empty"><p>{extraText("Filmler yüklenemedi. Bağlantını kontrol edip yeniden deneyebilirsin.","Movies could not be loaded. Check your connection and retry.")}</p><button className="chip" onClick={()=>setRetry(n=>n+1)}>{extraText("Yeniden dene","Retry")}</button></div>}
  <div ref={end} style={{height:1}}/></section>;
}

