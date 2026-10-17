import { EN } from "./i18n-en";

/** UI language: English unless the user picked Turkish in Settings. Changing it reloads the app. */
export type Lang = "en" | "tr";
export const lang = (): Lang => {
  try { return localStorage.getItem("lang") === "tr" ? "tr" : "en"; } catch { return "en"; }
};
export const setLang = (l: Lang) => {
  try { localStorage.setItem("lang", l); } catch {}
  window.location.reload();
};
const isTr = lang() === "tr";
try { document.documentElement.lang = isTr ? "tr" : "en"; } catch {}
/** Locale for numbers, dates and TMDB requests. */
export const locale = () => (isTr ? "tr-TR" : "en-US");

/** UI text: written in Turkish in the code, shown in English unless Turkish is chosen. `{0}`, `{1}`… take the extra arguments. */
export function tt(s: string, ...args: unknown[]): string {
  const out = isTr ? s : EN[s] ?? s;
  return args.length ? out.replace(/\{(\d+)\}/g, (m, i) => (i < args.length ? String(args[i] ?? "") : m)) : out;
}
/** Subtitle languages searched by default, in order. */
export const defaultSubLangs = () => (isTr ? "tr,en,de" : "en");
