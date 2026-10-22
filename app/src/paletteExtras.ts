import { tt } from "./i18n";

export type PanelName = "health" | "calendar" | "clip" | "scenes" | "recap" | "quote" | "lines";
/** Asks App to open one of the new panels (the ones that need the player, say so themselves when nothing plays). */
export const openPanel = (name: PanelName) => window.dispatchEvent(new CustomEvent("luna-open", { detail: name }));

/** Extra rows of the Ctrl+K palette. */
export function paletteExtras(): { id: string; group: string; label: string; hint?: string; keywords: string; run: () => void }[] {
  const g = tt("Eylemler");
  return [
    { id: "a:lines", group: g, label: tt("Replik ara"), keywords: "line search quote find scene dialogue subtitle replik ara sahne altyazı konuşma hangi film cümle", run: () => openPanel("lines") },
    { id: "a:recap", group: g, label: tt("Luna Özet"), keywords: "recap wrapped year review statistics stats özet yıl istatistik yılın özeti", run: () => openPanel("recap") },
    { id: "a:quote", group: g, label: tt("Replik kartı (oynarken)"), keywords: "quote card share subtitle line replik kart paylaş alıntı", run: () => openPanel("quote") },
    { id: "a:health", group: g, label: tt("Kütüphane sağlığı"), keywords: "library health duplicate copies sample kopya sağlık saglik temizlik yinelenen", run: () => openPanel("health") },
    { id: "a:calendar", group: g, label: tt("Yayın takvimi"), keywords: "calendar upcoming episodes new episode takvim yaklaşan bölüm dizi", run: () => openPanel("calendar") },
    { id: "a:clip", group: g, label: tt("Klip kes (oynarken)"), hint: "X", keywords: "clip gif webm mp4 cut klip kes video parça", run: () => openPanel("clip") },
    { id: "a:scenes", group: g, label: tt("Sahne ızgarası (oynarken)"), hint: "Ctrl+G", keywords: "scene grid contact sheet thumbnails sahne ızgara kareler", run: () => openPanel("scenes") },
  ];
}
