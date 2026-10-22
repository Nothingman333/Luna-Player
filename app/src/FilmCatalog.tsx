import { useDeferredValue, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ComponentType } from "react";
import { extraText } from "./Extras";
import { lang, tt } from "./i18n";
import { IMG, isFinished, isRemote, isUrl, loadRecent, store } from "./library";
import type { Item } from "./library";
import type { Actions } from "./Screens";
import { LibraryToolbar } from "./LibraryToolbar";
import { cleanLibraryView, libraryDecades, libraryGenres, libraryStats, validLibraryItems } from "./libraryTools";
import type { MatchReason } from "./libraryTools";
import { buildGroups, catalogKind, formatRemaining, pickSurprise, scanState, selectCatalog, surprisePool, viewStorageKey } from "./filmCatalogModel";
import type { CatalogGroup, CatalogParams, ResumeInfo } from "./filmCatalogModel";
import "./FilmCatalog.css";

/** What a catalog card is told besides the record: everything is worked out once per search, not once per card. */
export type PosterProps = {
  it: Item; a: Actions; copyCount?: number; episodes?: number; resume?: ResumeInfo | null; reason?: MatchReason | null; watched?: boolean; stamp?: number;
};

export const clearSearch = () => window.dispatchEvent(new Event("luna-clear-search"));
const reasonKinds: Record<MatchReason["kind"], [string, string]> = {
  original: ["Dosya adındaki ad", "Name in the file"], year: ["Yıl", "Year"], genre: ["Tür", "Genre"], cast: ["Oyuncu", "Actor"],
  character: ["Karakter", "Character"], file: ["Dosya adı", "File name"], mixed: ["Birden çok alan", "Several fields"],
};
export const reasonText = (r: MatchReason): string => { const [tr, en] = reasonKinds[r.kind]; const label = extraText(tr, en); return r.text ? `${label}: ${r.text}` : label; };

/** The same list again (by element) keeps the same array, so memoised work is not redone when the app re-renders around it. */
function useStableList<T>(list: T[]): T[] {
  const ref = useRef(list);
  if (ref.current !== list && !(ref.current.length === list.length && ref.current.every((x, i) => x === list[i]))) ref.current = list;
  return ref.current;
}

export function FilmCatalogView({ title, items: rawItems, query, a, Poster }: {
  title: string; items: Item[]; query: string; a: Actions; Poster: ComponentType<PosterProps>;
}) {
  const stable = useStableList(rawItems);
  const items = useMemo(() => validLibraryItems(stable), [stable]);
  const rawCount = stable.length;
  const locale = lang() === "tr" ? "tr" : "en";
  // the saved view belongs to the kind of catalog, taken from its records (an empty list falls back to the page title)
  const kind = catalogKind(items, title === tt("Diziler"));
  const viewKey = viewStorageKey(kind);
  const [preferences, setPreferences] = useState(() => ({ key: viewKey, value: cleanLibraryView(store.json(viewKey, {})) }));
  const view = preferences.key === viewKey ? preferences.value : cleanLibraryView(store.json(viewKey, {}));
  const [saveError, setSaveError] = useState("");
  const viewRef = useRef(view); viewRef.current = view;
  const updateView = (change: Partial<typeof view>) => {
    const next = cleanLibraryView({ ...viewRef.current, ...change });
    viewRef.current = next;
    setPreferences({ key: viewKey, value: next });
    setSaveError(store.set(viewKey, JSON.stringify(next)) ? "" : extraText("Görünüm tercihi kaydedilemedi.", "View preference could not be saved."));
  };
  const { sort, filter } = view;

  // library events (finished / un-finished, a download that completed, a relink…) refresh what the cards show
  const [stamp, setStamp] = useState(0);
  useEffect(() => { const f = () => setStamp((n) => n + 1); window.addEventListener("luna-library", f); return () => window.removeEventListener("luna-library", f); }, []);
  const recentRaw = store.get("recent") ?? "", finishedRaw = store.get("finished") ?? "";
  const recentRows = useMemo(() => loadRecent(), [recentRaw, stamp]);
  const scanning = useSyncExternalStore(scanState.subscribe, scanState.get);

  const genres = useMemo(() => libraryGenres(items, locale), [items, locale]);
  const decades = useMemo(() => libraryDecades(items), [items]);
  const genre = genres.includes(view.genre) ? view.genre : "";
  const decade = decades.includes(view.decade) ? view.decade : "";
  const stats = useMemo(() => libraryStats(items), [items]);
  const libTitles = useMemo(() => buildGroups(items).length, [items]);

  const deferred = useDeferredValue(query);
  const q = deferred.trim();
  const params: CatalogParams = { query: deferred, sort, filter, genre, decade, minRating: view.minRating, runtime: view.runtime, watch: view.watch, locale };
  const ctx = { recent: recentRows, finished: isFinished };
  const result = useMemo(() => selectCatalog(items, params, ctx), // eslint-disable-line react-hooks/exhaustive-deps
    [items, deferred, sort, filter, genre, decade, view.minRating, view.runtime, view.watch, locale, recentRows, finishedRaw, stamp]);
  const activeFilters = filter !== "all" || !!genre || !!decade || view.minRating !== 0 || !!view.runtime || view.watch !== "all";
  const resetFilters = () => updateView({ filter: "all", genre: "", decade: "", minRating: 0, runtime: "", watch: "all", sort: "az" });
  const series = kind === "tv";

  // an empty result: what would come back if only the search, or only the filters, were removed
  const empty = result.groups.length === 0 && items.length > 0;
  const without = useMemo(() => {
    if (!empty) return null;
    const off = { filter: "all" as const, genre: "", decade: "", minRating: 0, runtime: "" as const, watch: "all" as const };
    return {
      search: q && activeFilters ? selectCatalog(items, { ...params, query: "" }, ctx).titles : null,
      filters: activeFilters ? selectCatalog(items, { ...params, ...off }, ctx).titles : null,
    };
  }, [empty, items, deferred, sort, filter, genre, decade, view.minRating, view.runtime, view.watch, locale, recentRows, finishedRaw, stamp]); // eslint-disable-line react-hooks/exhaustive-deps

  // the cards act through the latest actions, but only re-render when something they show changes
  const aRef = useRef(a); aRef.current = a;
  const stableA = useMemo<Actions>(() => ({
    play: (p, s) => aRef.current.play(p, s), details: (k) => aRef.current.details(k), menu: (e, t) => aRef.current.menu(e, t),
    rematch: a.rematch ? (t) => aRef.current.rematch?.(t) : undefined, missing: a.missing,
  }), [a.missing, !!a.rematch]); // eslint-disable-line react-hooks/exhaustive-deps

  // surprise pick: only from what the current filters show, and only films whose file is really there
  const unusable = (p: string) => a.missing.has(p) || isRemote(p) || isUrl(p);
  const pool = useMemo(() => surprisePool(result.groups, unusable), [result.groups, a.missing, stamp]); // eslint-disable-line react-hooks/exhaustive-deps
  const [pick, setPick] = useState<string | null>(null);
  const picked = pick ? result.groups.find((g) => g.id === pick) ?? null : null;
  const roll = () => { const g = pickSurprise(pool.pool, pick); setPick(g ? g.id : null); };

  const word = (n: number) => (series ? extraText("dizi", "series") : extraText("film", n === 1 ? "film" : "films"));
  const fileWord = series ? extraText("bölüm dosyası", "episode files") : extraText("dosya", "files");
  const runtimeLabel = view.runtime === "short" ? "≤ 90" : view.runtime === "medium" ? "91–150" : "> 150";
  const watchLabel = view.watch === "unwatched" ? extraText("Başlanmamış", "Not started") : view.watch === "started" ? extraText("Devam edilenler", "In progress") : extraText("İzlenenler", "Watched");

  return (
    <div className="page">
      <section className="row">
        <h2>{q ? tt("Yerel dosyalar · “{0}”", deferred.trim()) : title} <span className="muted small library-count" title={extraText(`${result.titles} ${word(result.titles)} · ${result.files} ${fileWord}`, `${result.titles} ${word(result.titles)} · ${result.files} ${fileWord}`)}>{result.titles}</span></h2>
        <LibraryToolbar kind={kind} titles={libTitles} files={stats.files} unmatched={stats.unmatched} versions={stats.versions.size} genres={genres}
          sort={sort} filter={filter} genre={genre} setSort={(s) => updateView({ sort: s })} setFilter={(f) => updateView({ filter: f })} setGenre={(g) => updateView({ genre: g })} onReset={resetFilters} />
        <div className="library-refine-row">
          <div className="library-refine-selects">
            <select aria-label={extraText("Yapım dönemi", "Release decade")} value={decade} onChange={(e) => updateView({ decade: e.target.value })}><option value="">{extraText("Bütün yıllar", "All years")}</option>{decades.map((d) => <option key={d} value={d}>{d}–{Number(d) + 9}</option>)}</select>
            <select aria-label={extraText("En düşük TMDB puanı", "Minimum TMDB rating")} value={view.minRating} onChange={(e) => updateView({ minRating: Number(e.target.value) })}><option value={0}>{extraText("Bütün TMDB puanları", "All TMDB ratings")}</option><option value={-1}>{extraText("TMDB puanı olmayanlar", "Without a TMDB rating")}</option>{[6, 7, 8].map((r) => <option key={r} value={r}>TMDB ★ {r}+</option>)}</select>
            <select aria-label={extraText("Süre filtresi", "Runtime filter")} value={view.runtime} onChange={(e) => updateView({ runtime: e.target.value as typeof view.runtime })}><option value="">{extraText("Bütün süreler", "All runtimes")}</option><option value="short">≤ 90 {extraText("dk", "min")}</option><option value="medium">91–150 {extraText("dk", "min")}</option><option value="long">&gt; 150 {extraText("dk", "min")}</option></select>
            <select aria-label={extraText("İzleme durumu", "Watch status")} value={view.watch} onChange={(e) => updateView({ watch: e.target.value as typeof view.watch })}><option value="all">{extraText("Bütün durumlar", "All watch states")}</option><option value="unwatched">{extraText("Başlanmamış", "Not started")}</option><option value="started">{extraText("Devam edilenler", "In progress")}</option><option value="watched">{extraText("İzlenenler", "Watched")}</option></select>
          </div>
          <span className="library-result-note" role="status">{extraText(`${result.titles} / ${libTitles} ${word(libTitles)} · ${result.files} ${fileWord}`, `${result.titles} of ${libTitles} ${word(libTitles)} · ${result.files} ${fileWord}`)}</span>
          {pool.pool.length > 0 && <button className="chip library-surprise-btn" onClick={roll} title={extraText("Şu an görünen, diskte olan sonuçlardan birini seçer", "Picks one of the results shown now that are on disk")}>{picked ? extraText("Başka birini seç", "Pick another") : series ? extraText("Sürpriz dizi", "Surprise me (series)") : extraText("Sürpriz film", "Surprise me (film)")}</button>}
          <button className={"chip library-density" + (view.compact ? " on" : "")} aria-pressed={view.compact} onClick={() => updateView({ compact: !view.compact })}>{view.compact ? extraText("Rahat görünüm", "Comfortable view") : extraText("Sık görünüm", "Compact view")}</button>
          {activeFilters && <button className="chip" onClick={resetFilters}>{extraText("Bütün filtreleri temizle", "Clear all filters")}</button>}
        </div>
        {(q || activeFilters) && <div className="library-active-filters" aria-label={extraText("Etkin filtreler", "Active filters")}>
          {q && <button className="chip library-search-chip" onClick={clearSearch} title={extraText("Aramayı temizle; filtreler kalır", "Clear the search; filters stay")}>{extraText("Arama", "Search")}: “{deferred.trim()}” ×</button>}
          {genre && <button className="chip" onClick={() => updateView({ genre: "" })}>{genre} ×</button>}
          {decade && <button className="chip" onClick={() => updateView({ decade: "" })}>{decade}–{Number(decade) + 9} ×</button>}
          {view.minRating !== 0 && <button className="chip" onClick={() => updateView({ minRating: 0 })}>{view.minRating === -1 ? extraText("TMDB puanı yok", "No TMDB rating") : `TMDB ★ ${view.minRating}+`} ×</button>}
          {view.runtime && <button className="chip" onClick={() => updateView({ runtime: "" })}>{runtimeLabel} {extraText("dk", "min")} ×</button>}
          {view.watch !== "all" && <button className="chip" onClick={() => updateView({ watch: "all" })}>{watchLabel} ×</button>}
          {filter !== "all" && <button className="chip" onClick={() => updateView({ filter: "all" })}>{filter === "versions" ? extraText("Çoklu sürüm", "Multiple versions") : extraText("Eşleşmemiş", "Unmatched")} ×</button>}
        </div>}
        {scanning && <p className="library-scan-note muted small" role="status"><span className="pulse">{extraText("Klasörler taranıyor…", "Scanning folders…")}</span> {extraText("Mevcut kayıtlar ve filtreler yerinde; tarama bitince liste güncellenir.", "Existing entries and filters stay; the list updates when the scan finishes.")}</p>}
        {rawCount > items.length && <p className="library-data-warning" role="status">{extraText(`${rawCount - items.length} eksik veya hasarlı kayıt görüntülenemedi. Kaynak kayıtlar korundu; yeniden taramayı deneyebilirsin.`, `${rawCount - items.length} incomplete or damaged entries could not be displayed. Source records were kept; try rescanning.`)}</p>}
        {saveError && <p className="muted small" role="status">{saveError}</p>}
        {picked && <SurprisePanel group={picked} skipped={pool.skippedWatched} series={series} a={a} usable={(p) => !unusable(p)} onAgain={roll} onClose={() => setPick(null)} />}
        {result.list.length ? <div className={"grid library-results" + (view.compact ? " is-compact" : "")}>{result.groups.flatMap((g) => g.members.map((it) => (
          <Poster key={it.key} it={it} a={stableA} copyCount={result.copies.get(it.key)} episodes={g.episodes} resume={g.resume} reason={g.reason} watched={g.state === "watched"} stamp={stamp} />
        )))}</div>
          : <EmptyCatalog series={series} empty={items.length === 0} scanning={scanning} query={q} filtersOn={activeFilters} without={without} onClearSearch={clearSearch} onClearFilters={resetFilters} onClearAll={() => { resetFilters(); clearSearch(); }} />}
      </section>
    </div>
  );
}

function EmptyCatalog({ series, empty, scanning, query, filtersOn, without, onClearSearch, onClearFilters, onClearAll }: {
  series: boolean; empty: boolean; scanning: boolean; query: string; filtersOn: boolean; without: { search: number | null; filters: number | null } | null;
  onClearSearch: () => void; onClearFilters: () => void; onClearAll: () => void;
}) {
  if (empty) return <div className="muted empty-note library-empty">{scanning ? extraText("Klasörler taranıyor… Videolar bulundukça burada görünecek.", "Scanning folders… videos will appear here as they are found.") : tt("Bir şey bulunamadı. Klasörler sekmesinden kütüphaneye klasör ekleyebilirsin.")}</div>;
  const what = series ? extraText("dizi", "series") : extraText("film", "film");
  return (
    <div className="muted empty-note library-empty" role="status">
      <div>{query && filtersOn ? extraText(`“${query}” aramasıyla ve seçili filtrelerle eşleşen ${what} yok.`, `No ${what} matches “${query}” together with the selected filters.`)
        : query ? extraText(`“${query}” ile eşleşen ${what} yok.`, `No ${what} matches “${query}”.`)
          : extraText(`Seçili filtrelere uyan ${what} yok.`, `No ${what} fits the selected filters.`)}</div>
      <div className="library-empty-actions">
        {query && <button className="chip" onClick={onClearSearch}>{extraText("Aramayı temizle", "Clear search")}{without?.search != null ? ` · ${without.search}` : ""}</button>}
        {filtersOn && <button className="chip" onClick={onClearFilters}>{extraText("Filtreleri temizle", "Clear filters")}{without?.filters != null ? ` · ${without.filters}` : ""}</button>}
        {query && filtersOn && <button className="chip" onClick={onClearAll}>{extraText("Hepsini temizle", "Clear everything")}</button>}
      </div>
      {query && filtersOn && <div className="small">{extraText("Arama ve filtreler ayrı tutulur: birini temizlemek ötekini silmez. Sayılar, o düğmeye basınca görünecek sonucu gösterir.", "The search and the filters are kept apart: clearing one leaves the other. The numbers are the results that button would bring back.")}</div>}
    </div>
  );
}

function SurprisePanel({ group, skipped, series, a, usable, onAgain, onClose }: {
  group: CatalogGroup; skipped: number; series: boolean; a: Actions; usable: (path: string) => boolean; onAgain: () => void; onClose: () => void;
}) {
  const m = group.rep.meta, f = group.rep;
  const name = m?.title || f.parsed.title, year = m?.year || f.parsed.year || "";
  const holder = group.members.find((x) => x.files.some((file) => usable(file.path))) ?? group.members[0];
  const poster = m?.poster ? IMG + "w185" + m.poster : null;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.focus(); }, [group.id]);
  return (
    <div className="library-surprise" role="region" aria-label={extraText("Sürpriz seçim", "Surprise pick")} tabIndex={-1} ref={ref}>
      <div className="library-surprise-poster">{poster ? <img src={poster} alt="" /> : <span>{name}</span>}</div>
      <div className="library-surprise-body">
        <div className="muted small">{series ? extraText("Bu akşam bunu izleyebilirsin", "You could watch this tonight") : extraText("Bu akşam bunu izleyebilirsin", "You could watch this tonight")}</div>
        <h3>{name}{year ? <span className="muted"> · {year}</span> : null}</h3>
        <div className="muted small">{extraText("Şu an görünen sonuçlardan seçildi", "Picked from the results shown now")}{skipped > 0 ? " · " + extraText(`${skipped} izlenmiş kayıt atlandı`, `${skipped} watched skipped`) : ""}</div>
        <div className="library-surprise-actions">
          <button className="primary sm" onClick={() => a.details(holder.key)}>{extraText("Detayları aç", "Open details")}</button>
          <button className="chip" onClick={onAgain}>{extraText("Başka birini seç", "Pick another")}</button>
          <button className="chip" onClick={onClose}>{extraText("Kapat", "Close")}</button>
        </div>
      </div>
    </div>
  );
}

export const remainingLabel = (r: ResumeInfo): string => formatRemaining(r.remaining, tt("sa"), tt("dk"));
