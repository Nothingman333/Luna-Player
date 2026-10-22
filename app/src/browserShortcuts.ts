/**
 * The keyboard shortcuts of Luna Web, in one place for the help panel (F1).
 * No imports, so the regression scripts can load it on its own; scripts/browser-suggest-regression.cjs
 * checks that every entry here is really handled in Browser.tsx.
 */
export type WebShortcut = { keys: string[]; tr: string; en: string };
export type WebShortcutGroup = { id: string; tr: string; en: string; items: WebShortcut[] };

export const WEB_SHORTCUTS: WebShortcutGroup[] = [
  { id: "tabs", tr: "Sekmeler", en: "Tabs", items: [
    { keys: ["Ctrl", "T"], tr: "Yeni sekme", en: "New tab" },
    { keys: ["Ctrl", "W"], tr: "Sekmeyi kapat", en: "Close tab" },
    { keys: ["Ctrl", "Shift", "T"], tr: "Kapatılan sekmeyi geri aç", en: "Reopen closed tab" },
    { keys: ["Ctrl", "Tab"], tr: "Sonraki sekme (Shift ile önceki)", en: "Next tab (with Shift: previous)" },
    { keys: ["Ctrl", "PgUp / PgDn"], tr: "Önceki / sonraki sekme", en: "Previous / next tab" },
    { keys: ["Ctrl", "Shift", "PgUp / PgDn"], tr: "Sekmeyi sola / sağa taşı (sürükleyerek de olur)", en: "Move the tab left / right (dragging works too)" },
    { keys: ["Ctrl", "1…9"], tr: "Sekmeye git (9: sonuncu)", en: "Go to tab (9: the last)" },
    { keys: ["Ctrl", "Shift", "A"], tr: "Sekmeler ve favoriler", en: "Tabs and favourites" },
    { keys: ["Shift", "F10"], tr: "Sekme menüsü (sekmeye odaklıyken)", en: "Tab menu (with a tab focused)" },
  ] },
  { id: "page", tr: "Sayfa", en: "Page", items: [
    { keys: ["F5"], tr: "Yenile", en: "Reload" },
    { keys: ["Alt", "←"], tr: "Geri", en: "Back" },
    { keys: ["Alt", "→"], tr: "İleri", en: "Forward" },
    { keys: ["Ctrl", "+"], tr: "Yakınlaştır", en: "Zoom in" },
    { keys: ["Ctrl", "-"], tr: "Uzaklaştır", en: "Zoom out" },
    { keys: ["Ctrl", "0"], tr: "Yakınlığı sıfırla", en: "Reset zoom" },
    { keys: ["Ctrl", "D"], tr: "Favori ekle / kaldır", en: "Add / remove favourite" },
    { keys: ["F9"], tr: "Okuma görünümü (içinde Ctrl+F ile ara)", en: "Reading view (Ctrl+F searches inside it)" },
  ] },
  { id: "palette", tr: "Her şey bir kutuda", en: "Everything in one box", items: [
    { keys: ["Ctrl", "K"], tr: "Komut paleti: komutlar, sekmeler, favoriler, geçmiş", en: "Command palette: commands, tabs, favourites, history" },
    { keys: ["Ctrl", "H"], tr: "Geçmiş (günlere göre, aranabilir)", en: "History (by day, searchable)" },
  ] },
  { id: "address", tr: "Adres çubuğu", en: "Address bar", items: [
    { keys: ["!yt …"], tr: "Hızlı arama: !yt, !w, !tmdb, !lb, !gr, !sp, !m … (“!yt dune” ya da “dune !yt”)", en: "Quick search: !yt, !w, !tmdb, !lb, !gr, !sp, !m … (“!yt dune” or “dune !yt”)" },
    { keys: ["Ctrl", "L"], tr: "Adres çubuğuna git", en: "Focus the address bar" },
    { keys: ["↑", "↓"], tr: "Önerilerde gez", en: "Move through suggestions" },
    { keys: ["Enter"], tr: "Aç (seçili öneri ya da yazılan)", en: "Open (the chosen suggestion or what you typed)" },
    { keys: ["Esc"], tr: "Listeyi kapat; tekrar: adresi geri al", en: "Close the list; again: restore the address" },
  ] },
  { id: "help", tr: "Yardım", en: "Help", items: [
    { keys: ["F1"], tr: "Bu pencere (Ctrl + / de çalışır)", en: "This window (Ctrl + / works too)" },
  ] },
];

/** Plain text of one entry: "Ctrl + Shift + T". */
export const shortcutLabel = (item: WebShortcut): string => item.keys.join(" + ");
