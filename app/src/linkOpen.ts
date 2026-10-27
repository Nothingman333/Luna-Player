// Every web link in Luna goes through here. When the developer panel's "Watch search" target is Luna Web, http(s)
// links (trailers, TMDB, YouTube…) open in Luna's own browser instead of the system browser.
import { openUrl as systemOpen } from "@tauri-apps/plugin-opener";
import { store } from "./library";

export async function openUrl(url: string | URL, openWith?: string): Promise<void> {
  const href = String(url);
  if (store.get("devWatchTarget") === "luna" && /^https?:\/\//i.test(href)) {
    window.dispatchEvent(new CustomEvent("luna-browser-open", { detail: { url: href } }));
    return;
  }
  return systemOpen(href, openWith);
}
