import { extraText } from "./Extras";
import { tt } from "./i18n";
import type { LibraryFilter, LibrarySort } from "./libraryTools";
export function LibraryToolbar({ kind = "movie", titles, files, unmatched, versions, genres, sort, filter, genre, setSort, setFilter, setGenre, onReset }: {
  kind?: "movie" | "tv"; titles?: number; files: number; unmatched: number; versions: number; genres: string[]; sort: LibrarySort; filter: LibraryFilter; genre: string;
  onReset?: () => void;
  setSort: (s: LibrarySort) => void; setFilter: (s: LibraryFilter) => void; setGenre: (s: string) => void;
}) {
  const series = kind === "tv";
  return <div className="library-tools">
    {/* the whole library of this kind, whatever the filters show: titles and files are different numbers */}
    <div className="library-summary" role="status">
      {titles != null && <span>{series ? extraText(`${titles} dizi`, `${titles} series`) : extraText(`${titles} film`, `${titles} ${titles === 1 ? "film" : "films"}`)}</span>}
      <span>{series ? extraText(`${files} bölüm dosyası`, `${files} episode files`) : tt("{0} dosya", files)}</span>
      <span>{tt("{0} eşleşmemiş", unmatched)}</span>
      {!series && <span title={extraText("Aynı filmin birden çok dosyası olanlar", "Films that have more than one file")}>{tt("{0} çoklu sürüm", versions)}</span>}
    </div>
    <div className="library-filters">
      <select aria-label={tt("Sıralama")} value={sort} onChange={(e) => setSort(e.target.value as LibrarySort)}>
        <option value="az">A → Z</option><option value="new">{tt("En yeni")}</option><option value="old">{extraText("En eski", "Oldest first")}</option><option value="short">{extraText("Süre: kısa → uzun", "Runtime: short to long")}</option><option value="rating">{extraText("TMDB puanı", "TMDB rating")}</option>
      </select>
      <select aria-label={tt("Kayıt filtresi")} value={filter} onChange={(e) => setFilter(e.target.value as LibraryFilter)}>
        <option value="all">{tt("Tümü")}</option><option value="unmatched">{tt("Eşleşmemiş kayıtlar")}</option>{!series && <option value="versions">{tt("Birden fazla sürümü olanlar")}</option>}
      </select>
      <select aria-label={tt("Tür filtresi")} value={genre} onChange={(e) => setGenre(e.target.value)}><option value="">{tt("Tüm türler")}</option>{genres.map((g) => <option key={g} value={g}>{g}</option>)}</select>
      {(filter !== "all" || genre || sort !== "az") && <button className="chip" onClick={() => { if (onReset) { onReset(); return; } setFilter("all"); setGenre(""); setSort("az"); }}>{tt("Filtreleri sıfırla")}</button>}
    </div>
  </div>;
}
