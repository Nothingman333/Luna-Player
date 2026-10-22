export type BrowserIconName = "back" | "forward" | "reload" | "search" | "close" | "plus" | "star" | "home" | "external" | "translate" | "more" | "arrow" | "lock" | "spark" | "book" | "film" | "globe" | "speaker";
const paths: Record<BrowserIconName, string> = {
  back: "m14 6-6 6 6 6", forward: "m10 6 6 6-6 6", reload: "M20 8V3l-3 3a8 8 0 1 0 2.2 9M20 3h-5",
  search: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z", close: "m6 6 12 12M6 18 18 6", plus: "M12 5v14M5 12h14",
  star: "m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z", home: "m3 10 9-7 9 7v10H3ZM9 20v-7h6v7",
  external: "M14 3h7v7M10 14 21 3M21 14v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h6",
  translate: "M3 5h12M9 3v2M5 5c0 6 4 10 9 12M13 5c-1 6-5 11-10 13M14 21l4-11 4 11M15.5 17h5",
  more: "M5 12h.01M12 12h.01M19 12h.01", arrow: "M4 12h16m-6-6 6 6-6 6", lock: "M6 10h12v11H6ZM8 10V6a4 4 0 0 1 8 0v4",
  spark: "m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6ZM20 2v4M18 4h4",
  book: "M12 6C8 3 4 4 2 5v15c3-2 6-2 10 0 4-2 7-2 10 0V5c-2-1-6-2-10 1Zm0 0v14", film: "M3 3h18v18H3ZM7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4",
  globe: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z",
  speaker: "M4 9h4l5-4v14l-5-4H4ZM16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11",
};
export function BrowserIcon({ name, size = 18 }: { name: BrowserIconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.65} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
