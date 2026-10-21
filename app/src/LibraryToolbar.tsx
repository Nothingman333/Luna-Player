import { tt } from "./i18n";
import type { LibraryFilter, LibrarySort } from "./libraryTools";
export function LibraryToolbar({ files, unmatched, versions, genres, sort, filter, genre, setSort, setFilter, setGenre }: {
  files: number; unmatched: number; versions: number; genres: string[]; sort: LibrarySort; filter: LibraryFilter; genre: string;
  setSort: (s: LibrarySort) => void; setFilter: (s: LibraryFilter) => void; setGenre: (s: string) => void;
}) {
  return <div className="library-tools">
    <div className="library-summary" role="status"><span>{tt("{0} dosya", files)}</span><span>{tt("{0} eşleşmemiş", unmatched)}</span><span>{tt("{0} çoklu sürüm", versions)}</span></div>
    <div className="library-filters">
      <select aria-label={tt("Sıralama")} value={sort} onChange={(e) => setSort(e.target.value as LibrarySort)}>
        <option value="az">A → Z</option><option value="new">{tt("En yeni")}</option><option value="rating">{tt("TMDB puanı")}</option>
      </select>
      <select aria-label={tt("Kayıt filtresi")} value={filter} onChange={(e) => setFilter(e.target.value as LibraryFilter)}>
        <option value="all">{tt("Tümü")}</option><option value="unmatched">{tt("Eşleşmemiş kayıtlar")}</option><option value="versions">{tt("Birden fazla sürümü olanlar")}</option>
      </select>
      <select aria-label={tt("Tür filtresi")} value={genre} onChange={(e) => setGenre(e.target.value)}><option value="">{tt("Tüm türler")}</option>{genres.map((g) => <option key={g} value={g}>{g}</option>)}</select>
      {(filter !== "all" || genre || sort !== "az") && <button className="chip" onClick={() => { setFilter("all"); setGenre(""); setSort("az"); }}>{tt("Filtreleri sıfırla")}</button>}
    </div>
  </div>;
}
