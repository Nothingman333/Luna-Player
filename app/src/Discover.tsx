import {extraText} from "./Extras";
import { CardActions, CardFriendLine, CardFriends } from "./FilmCardExtras";
// Keşfet, in two parts: "Yeni ve popüler" (TMDB lists and the user's Stremio addon catalogs) and
// "Sana özel" (picks drawn from what the user liked and watched). Every card opens the same title
// page as the recommendations.
import { lang, locale, tt, DEC } from "./i18n";
import { useEffect, useRef, useState } from "react";
import { openUrl } from "./linkOpen";
import { IMG, isFinished, Item, Recent, SearchHit, searchTmdb, store, tmdbGet, tmdbList } from "./library";
import { I, Icon, openMenu, pct, titleAsks } from "./Screens";
import { CwStar,cwOf, DetailTarget, diaryGet, isSafe, loadDiary, loadTaste, modOn, SourceProps, useContentWarnings, useTaste, youtubeTrailer } from "./Taste";
import { TitleDetail } from "./LazyViews";
import { catalogItems, catalogRows, useAddons } from "./Addons";
import { matchKey } from "./textMatch";

type Card = {
  key: string; title: string; year?: string; poster?: string; rating?: number;
  tmdbId?: number; kind?: "movie" | "tv"; because?: string; target: DetailTarget;
};

const fromHit = (h: SearchHit, because?: string): Card => ({
  key: h.kind + ":" + h.id, title: h.title, year: h.year || undefined, poster: h.poster ? IMG + "w342" + h.poster : undefined,
  rating: h.rating || undefined, tmdbId: h.id, kind: h.kind, because,
  target: { title: h.title, year: h.year || undefined, kind: h.kind, tmdbId: h.id },
});
const targetOf = (h: SearchHit): DetailTarget => ({ title: h.title, year: h.year || undefined, kind: h.kind, tmdbId: h.id });

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
  return out.slice(0, 10);
}

/** TMDB's film genres by (localized) name. */
async function genreIds(): Promise<Map<string, number>> {
  const k = "genres:" + locale();
  let list = store.json<{ id: number; name: string }[] | null>(k, null);
  if (!list) {
    list = ((await tmdbGet("/genre/movie/list", { language: locale() }).catch(() => null))?.genres ?? []) as { id: number; name: string }[];
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
};

async function picks(items: Item[], recent: Recent[]): Promise<Picks | "empty"> {
  const from = await seeds(items, recent);
  if (!from.length) return "empty";
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
  if (names.length) {
    const ids = await genreIds();
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
  return { heroes, top, bySeed, genres, hidden };
}

// ---------- a horizontal row ----------
function Rail({ title, sub, load, given, deps = [], items, onOpen }: {
  title: string; sub?: string; load?: () => Promise<Card[]>; given?: Card[]; deps?: unknown[]; items: Item[];
  onOpen: (t: DetailTarget) => void;
}) {
  const [loaded, setLoaded] = useState<Card[] | null>(null);
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!load) return;
    let alive = true;
    setFailed(false);
    load().then((c) => alive && setLoaded(c)).catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, deps);
  useTaste();
  const cards = given ?? loaded;
  const list = cards ?? [];
  useContentWarnings(list.filter((c) => c.tmdbId).map((c) => ({ tmdbId: c.tmdbId, kind: c.kind })));
  if (failed || (cards && !cards.length)) return null;
  const owned = (c: Card) => items.some((i) => c.tmdbId && i.meta?.id === c.tmdbId && i.meta.kind === c.kind);
  const scroll = (d: number) => ref.current?.scrollBy({ left: d * ref.current.clientWidth * 0.85, behavior: "smooth" });
  return (
    <section className="row disc-row">
      <div className="row-head"><h2>{title}</h2>{sub && <span className="muted small">{sub}</span>}</div>
      <div className="rail-wrap">
        <button className="rail-arrow l" aria-label={tt("Önceki")} onClick={() => scroll(-1)}><Icon d={I.left} size={26} /></button>
        <div className="rail" ref={ref}>
          {cards == null && Array.from({ length: 8 }, (_, i) => <div key={i} className="disc-card ghost-card"><div className="disc-poster" /></div>)}
          {list.map((c) => {
            const d = diaryGet(c.title, c.year);
            const blur = modOn() && !!cwOf(c.tmdbId, c.kind)?.length && !isSafe(c.tmdbId, c.kind);
            return (
              <button key={c.key} className="disc-card" onClick={() => onOpen(c.target)} title={c.because}
                onContextMenu={(e) => openMenu(e, [...titleAsks(c.title, c.year, c.kind), "sep", { label: tt("Detaylar"), act: () => onOpen(c.target) }])}>
                <div className={"disc-poster" + (blur ? " cw-blur" : "")}>
                  {c.poster ? <img src={c.poster} alt="" loading="lazy" onLoad={(e) => e.currentTarget.classList.add("loaded")} />
                    : <div className="plg-blank"><Icon d={I.film} size={26} /><span>{c.title}</span></div>}
                  <span className="disc-warning"><CwStar id={c.tmdbId} kind={c.kind}/></span>
                  <CardFriends t={{ title: c.title, year: c.year, id: c.tmdbId, kind: c.kind ?? "movie" }} />
                  <CardActions t={{ title: c.title, year: c.year, id: c.tmdbId, kind: c.kind ?? "movie" }} onDetail={() => onOpen(c.target)} />
                  {c.rating ? <span className="tmdb-badge">★ {c.rating.toFixed(1).replace(".", DEC)}</span> : null}
                  {(owned(c) || d?.watched) && <span className="disc-flag">{d?.watched ? tt("İzledin") : tt("Kütüphanende")}</span>}
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
  const n = hits?.length ?? 0;
  useEffect(() => {
    if (hover || n < 2) return;
    const id = setTimeout(() => setI((x) => (x + 1) % n), 8000);
    return () => clearTimeout(id);
  }, [i, hover, n]);
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
          {h.rating ? `★ ${String(h.rating).replace(".", DEC)} · ` : ""}{h.year}
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
              {k === i && !hover && <span className="hero-dot-fill disc-fill" />}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

// ---------- the two parts ----------
function NewSection({ items, onOpen,filter }: { items: Item[]; onOpen: (t: DetailTarget) => void;filter?:CategoryFilter|null }) {
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
  const rows: [string, string, () => Promise<SearchHit[]>][] = filter?[]: [
    ["now", tt("Yeni çıkan filmler"), () => tmdbList("/movie/now_playing", "movie", { region })],
    ["popm", tt("Popüler filmler"), () => tmdbList("/movie/popular", "movie")],
    ["popt", tt("Popüler diziler"), () => tmdbList("/tv/popular", "tv")],
    ["air", tt("Yeni bölümü çıkan diziler"), () => tmdbList("/tv/on_the_air", "tv")],
    ["top", tt("Tüm zamanların en iyileri"), () => tmdbList("/movie/top_rated", "movie")],
    ["soon", tt("Yakında"), () => tmdbList("/movie/upcoming", "movie", { region })],
  ];
  return (
    <>
      {hasKey && (
        <>
          <DiscHero hits={trend && trend.filter((h) => h.backdrop && h.overview).slice(0, 6)} onOpen={onOpen}
            eyebrow={(h) => filter?extraText("SEÇTİĞİN KATEGORİLERDEN","FROM YOUR CATEGORIES"):(h.kind === "tv" ? tt("BU HAFTA ÇOK İZLENEN DİZİ") : tt("BU HAFTA ÇOK İZLENEN FİLM"))} />
          <Rail title={tt("Bu hafta öne çıkanlar")} items={items} onOpen={onOpen} given={trend?.map((h) => fromHit(h))} />
          {filter&&<FilterGrid key={filterKey} kind={filter.kind} params={params} items={items} onOpen={onOpen}/>}
          {rows.map(([id, title, load]) => (
            <Rail key={id+filterKey} title={title} items={items} onOpen={onOpen} load={async () => (await load()).map((h) => fromHit(h))} />
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
}

function ForYouSection({ items, recent, onOpen }: { items: Item[]; recent: Recent[]; onOpen: (t: DetailTarget) => void }) {
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
  if (p === "error") return <div className="disc-empty muted">{tt("Öneriler getirilemedi; internet bağlantını ve TMDB anahtarını kontrol et.")}</div>;
  return (
    <>
      <DiscHero hits={p ? p.heroes : null} onOpen={onOpen} eyebrow={() => tt("SANA ÖZEL")} />
      <Rail title={tt("Sana en uygunlar")} sub={tt("beğendiklerine ve izlediklerine göre")} items={items} onOpen={onOpen} given={p ? p.top : undefined} />
      {p?.bySeed.map(({ seed, cards }) => (
        <Rail key={seed.kind + seed.id} title={seed.why === "like" ? tt("{0} beğendiğin için", seed.title) : tt("{0} izlediğin için", seed.title)}
          items={items} onOpen={onOpen} given={cards} />
      ))}
      {p?.genres && <Rail title={tt("Sevdiğin türlerden: {0}", p.genres.names.join(", "))} sub={tt("en beğenilenler")} items={items} onOpen={onOpen} given={p.genres.cards} />}
      {p && p.hidden.length >= 4 && <Rail title={tt("Gözden kaçmış olabilir")} sub={tt("yüksek puanlı, sana uygun")} items={items} onOpen={onOpen} given={p.hidden} />}
    </>
  );
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
        <div className="disc-filter-anchor" ref={categoryAnchor}><button className={"seg"+(category?" on":"")} aria-expanded={categoryOpen} aria-controls="discover-filters" aria-haspopup="dialog" onClick={()=>setCategoryOpen(v=>!v)}>{extraText("Kategoriler","Categories")} ▾</button>{categoryOpen&&<div className="disc-filter-menu" id="discover-filters" role="dialog" aria-label={extraText("Keşfi filtrele","Filter discovery")}><Categories value={category} onChange={value=>{setCategory(value);setPart("new");}}/><div className="modal-actions"><button className="chip" onClick={()=>{setCategory(null);setCategoryOpen(false);}}>{extraText("Filtreleri sıfırla","Reset filters")}</button><button className="chip" onClick={()=>setCategoryOpen(false)}>{tt("Kapat")}</button></div></div>}</div>
        <button role="tab" aria-selected={part === "you"} className={"seg" + (part === "you" ? " on" : "")} onClick={() => setPart("you")}>✦  {tt("Sana özel")}</button>
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
          : hasKey && <ForYouSection items={items} recent={recent} onOpen={setDetail} />}
      </div>
      {detail && <TitleDetail t={detail} items={items} onClose={() => setDetail(null)} onPlay={onPlay} onTorrent={onTorrent}
        onAsk={onAsk} onSource={onSource} onDownload={onDownload} />}
    </div>
  );
}

function Categories({value,onChange}:{value:CategoryFilter|null;onChange:(value:CategoryFilter)=>void}){
 const kind=value?.kind??"movie",genre=value?.genre??"",length=value?.length??"";const [genres,setGenres]=useState<{id:number;name:string}[]>([]);
 useEffect(()=>{let alive=true;tmdbGet("/genre/"+kind+"/list",{language:locale()}).then(data=>{if(alive)setGenres(data.genres||[]);}).catch(()=>{if(alive)setGenres([]);});return()=>{alive=false;};},[kind]);
 return <div className="disc-category-controls">
   <div className="disc-filter-heading"><Icon d={I.search} size={18}/><strong>{extraText("Keşfi filtrele","Filter discovery")}</strong></div>
   <fieldset><legend>{extraText("Ne izlemek istersin?","What would you like to watch?")}</legend><div className="disc-kind-switch">{(["movie","tv"] as const).map(k=><button className={"chip"+(kind===k?" on":"")} aria-pressed={kind===k} key={k} onClick={()=>onChange({kind:k,genre:"",length})}>{k==="movie"?tt("Film"):tt("Dizi")}</button>)}</div></fieldset>
   <fieldset><legend>{extraText("Kategori","Category")}</legend><div className="disc-genre-options"><button className={"chip"+(!genre?" on":"")} aria-pressed={!genre} onClick={()=>onChange({kind,genre:"",length})}>{extraText("Bütün kategoriler","All categories")}</button>{genres.map(g=><button key={g.id} className={"chip"+(genre.split(",").includes(String(g.id))?" on":"")} aria-pressed={genre.split(",").includes(String(g.id))} onClick={()=>{const id=String(g.id),set=genre?genre.split(","):[];onChange({kind,genre:(set.includes(id)?set.filter(x=>x!==id):[...set,id]).join(","),length});}}>{g.name}</button>)}</div></fieldset>
   <fieldset><legend>{extraText("Süren ne kadar?","How much time do you have?")}</legend><div className="disc-runtime-options">{[["",tt("Fark etmez")],["0-45",extraText("45 dk altı","Under 45 min")],["45-90",extraText("45–90 dk","45–90 min")],["90-120",extraText("1,5–2 saat","1.5–2 hours")],["120-180",extraText("2–3 saat","2–3 hours")],["180-",extraText("3 saat üzeri","Over 3 hours")]].map(([v,label])=><button key={v} className={"chip"+(length===v?" on":"")} aria-pressed={length===v} onClick={()=>onChange({kind,genre,length:v})}>{label}</button>)}</div></fieldset>
 </div>;
}

// Filtered discovery: one poster grid that keeps loading the next TMDB page as you scroll.
function FilterGrid({kind,params,items,onOpen}:{kind:"movie"|"tv";params:Record<string,string>;items:Item[];onOpen:(t:DetailTarget)=>void}){
 const [cards,setCards]=useState<Card[]>([]),[page,setPage]=useState(1),[busy,setBusy]=useState(false),[done,setDone]=useState(false);
 const end=useRef<HTMLDivElement>(null);
 useEffect(()=>{let alive=true;setBusy(true);
  tmdbList("/discover/"+kind,kind,{...params,sort_by:"popularity.desc",page:String(page)}).then(l=>{if(!alive)return;if(!l.length)setDone(true);
   setCards(c=>{const seen=new Set(c.map(x=>x.key));return [...c,...l.map(h=>fromHit(h)).filter(x=>!seen.has(x.key))];});}).catch(()=>alive&&setDone(true)).finally(()=>alive&&setBusy(false));
  return()=>{alive=false;};},[page]);
 useEffect(()=>{const el=end.current;if(!el||busy||done||page>=500)return;
  const io=new IntersectionObserver(e=>{if(e[0].isIntersecting)setPage(p=>p+1);},{rootMargin:"600px"});io.observe(el);return()=>io.disconnect();},[busy,done,page]);
 useContentWarnings(cards.filter(c=>c.tmdbId).map(c=>({tmdbId:c.tmdbId,kind:c.kind})));
 const owned=(c:Card)=>items.some(i=>c.tmdbId&&i.meta?.id===c.tmdbId&&i.meta.kind===c.kind);
 if(done&&!cards.length)return <p className="muted">{extraText("Bu kategorilerde sonuç yok.","No results in these categories.")}</p>;
 return <section className="row disc-row"><div className="row-head"><h2>{extraText("Seçtiğin kategoriler","Your categories")}</h2></div>
  <div className="disc-grid">{cards.map(c=>{const d=diaryGet(c.title,c.year);return <button key={c.key} className="disc-card" onClick={()=>onOpen(c.target)}>
   <div className="disc-poster">{c.poster?<img src={c.poster} alt="" loading="lazy" onLoad={e=>e.currentTarget.classList.add("loaded")}/>:<div className="plg-blank"><Icon d={I.film} size={26}/><span>{c.title}</span></div>}
    {c.rating?<span className="tmdb-badge">★ {c.rating.toFixed(1).replace(".",DEC)}</span>:null}
    {(owned(c)||d?.watched)&&<span className="disc-flag">{d?.watched?tt("İzledin"):tt("Kütüphanende")}</span>}
    <CardFriends t={{title:c.title,year:c.year,id:c.tmdbId,kind:c.kind??"movie"}}/><CardActions t={{title:c.title,year:c.year,id:c.tmdbId,kind:c.kind??"movie"}} onDetail={()=>onOpen(c.target)}/></div>
   <div className="card-title">{c.title}</div><div className="muted small ellipsis">{c.year??""}</div><CardFriendLine t={{title:c.title,year:c.year,id:c.tmdbId,kind:c.kind??"movie"}}/></button>;})}
   {busy&&Array.from({length:6},(_,i)=><div key={"g"+i} className="disc-card ghost-card"><div className="disc-poster"/></div>)}</div>
  <div ref={end} style={{height:1}}/></section>;
}
