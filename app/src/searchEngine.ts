import { setSearchResolver } from "./browserModel";
import { lang } from "./i18n";
import { store } from "./library";
import { makeResolver } from "./webSearch";

/** Sets the address bar's search engine from the saved choice (at start and after a change in Settings). */
export function applySearchEngine(choice: string | null = store.get("webSearch") ?? (store.get("lunaWebSearchEngine")==="duckduckgo"?"ddg":store.get("lunaWebSearchEngine"))): void {
  setSearchResolver(makeResolver(choice, lang()));
  window.dispatchEvent(new CustomEvent("luna-search-engine",{detail:choice}));
}
