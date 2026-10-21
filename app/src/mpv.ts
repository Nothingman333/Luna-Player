import { tt } from "./i18n";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";

export type Track = {
  id: number;
  type: "video" | "audio" | "sub";
  title?: string;
  lang?: string;
  external?: boolean;
  "external-filename"?: string;
  codec?: string;
  "src-id"?: number;
  selected?: boolean;
};

export type MpvState = {
  path: string | null;
  title: string;
  time: number;
  duration: number;
  paused: boolean;
  subDelay: number;
  volume: number;
  mute: boolean;
  sub: Track | null;
  tracks: Track[];
  subText: string;
  osd?: { w: number; h: number; mt: number; mb: number; ml: number; mr: number };
  speed?: number;
  eof?: boolean;
  audioDelay?: number;
  chapters?: { title?: string; time: number }[];
  chapter?: number;
  aspect?: string | number;
  loop?: string | boolean;
  volumeMax?: number;
  deinterlace?: boolean | string;
  rotate?: number;
};

const initial: MpvState = {
  path: null,
  title: "",
  time: 0,
  duration: 0,
  paused: true,
  subDelay: 0,
  volume: 100,
  mute: false,
  sub: null,
  tracks: [],
  subText: "",
};

/** Picture-based subtitles (Blu-ray PGS, DVD, DVB): mpv can draw them but has no text for them. */
export const isPgs = (t?: Track | null) => !!t && /pgs/i.test(t.codec ?? "");
export const isImageSub = (t?: Track | null) => !!t && /pgs|dvd_sub|dvdsub|dvb|xsub|vobsub/i.test(t.codec ?? "");

export const mpv = (...args: unknown[]) => invoke("mpv_command", { args });
export const setProp = (name: string, value: unknown) => mpv("set_property", name, value);

const keyOf: Record<string, keyof MpvState> = {
  "time-pos": "time",
  duration: "duration",
  pause: "paused",
  "sub-delay": "subDelay",
  path: "path",
  "media-title": "title",
  volume: "volume",
  mute: "mute",
  "current-tracks/sub": "sub",
  "track-list": "tracks",
  speed: "speed",
  "eof-reached": "eof",
  "audio-delay": "audioDelay",
  "chapter-list": "chapters",
  chapter: "chapter",
  "video-aspect-override": "aspect",
  "loop-file": "loop",
  "volume-max": "volumeMax",
  deinterlace: "deinterlace",
  "video-rotate": "rotate",
  "sub-text": "subText",
  "osd-dimensions": "osd",
};

/** Live mpv state plus a callback for raw events (file-loaded, end-file…). */
export function useMpv(onEvent?: (name: string, ev: any) => void) {
  const [state, setState] = useState<MpvState>(initial);
  const cb = useRef(onEvent);
  cb.current = onEvent;

  useEffect(() => {
    const un = listen<any>("mpv", ({ payload }) => {
      if (payload.event === "property-change") {
        const key = keyOf[payload.name];
        if (!key) return;
        const fallback = initial[key];
        setState((s) => ({ ...s, [key]: payload.data ?? fallback }));
      } else {
        cb.current?.(payload.event, payload);
      }
    });
    // Observe only once we listen, so the initial values aren't missed.
    const ids: number[] = [];
    let gone = false;
    un.then(() => {
      // unmounted before the listener was ready: nothing to observe (no one would unobserve it)
      if (gone) return;
      Object.keys(keyOf).forEach((name, i) => {
        ids.push(i + 1);
        mpv("observe_property", i + 1, name);
      });
    });
    return () => {
      gone = true;
      ids.forEach((id) => mpv("unobserve_property", id));
      un.then((f) => f());
    };
  }, []);

  return state;
}

// Subtitle looks. Netflix Sans is proprietary and can't be shipped; Inter (bundled, open
// licence) is the closest free match.
export type SubOpts = { font: string; size: number; color: string; bg: "none" | "shadow" | "box"; bold: boolean; margin: number };

export const SUB_PRESETS: Record<string, { label: string; opts: SubOpts }> = {
  netflix: { label: tt("Sinema"), opts: { font: "Inter SemiBold", size: 46, color: "#FFFFFF", bg: "shadow", bold: false, margin: 48 } },
  box: { label: tt("Kutulu"), opts: { font: "Inter SemiBold", size: 44, color: "#FFFFFF", bg: "box", bold: false, margin: 48 } },
  yellow: { label: tt("Klasik sarı"), opts: { font: "Inter Bold", size: 46, color: "#FFE15A", bg: "shadow", bold: false, margin: 48 } },
};
export const SUB_FONTS: [string, string][] = [
  ["Netflix Sans Medium", "Netflix Sans"], ["Netflix Sans Bold", tt("Netflix Sans Kalın")], ["Netflix Sans Regular", tt("Netflix Sans İnce")],
  ["Inter SemiBold", "Inter"], ["Inter Medium", tt("Inter İnce")], ["Inter Bold", tt("Inter Kalın")],
  ["Segoe UI Semibold", "Segoe UI"], ["Arial", "Arial"], ["Verdana", "Verdana"], ["Tahoma", "Tahoma"],
  ["Calibri", "Calibri"], ["Georgia", "Georgia"], ["Trebuchet MS", "Trebuchet"],
];
export const SUB_COLORS: [string, string][] = [
  ["#FFFFFF", tt("Beyaz")], ["#FFE15A", tt("Sarı")], ["#9EE7FF", tt("Açık mavi")], ["#B8F5A0", tt("Yeşil")], ["#FFB070", tt("Turuncu")], ["#D0D0D0", tt("Gri")],
];

export function loadSubOpts(): SubOpts {
  try {
    const o = JSON.parse(localStorage.getItem("subOpts") ?? "null");
    if (o) return { ...SUB_PRESETS.netflix.opts, ...o };
  } catch {}
  // Netflix Sans can't be shipped: a fresh install uses the bundled Inter until the user adds it
  return { ...SUB_PRESETS.netflix.opts, font: "Inter SemiBold" };
}

export function applySubOpts(o: SubOpts) {
  try { localStorage.setItem("subOpts", JSON.stringify(o)); } catch {}
  setProp("sub-font", o.font);
  setProp("sub-bold", o.bold);
  setProp("sub-font-size", o.size);
  setProp("sub-color", o.color);
  setProp("sub-margin-y", o.margin);
  if (o.bg === "box") {
    setProp("sub-border-style", "background-box");
    setProp("sub-outline-size", 3);
    setProp("sub-back-color", "#B8000000");
    setProp("sub-shadow-offset", 0);
    setProp("sub-blur", 0);
  } else {
    setProp("sub-border-style", "outline-and-shadow");
    setProp("sub-outline-color", "#E6000000");
    setProp("sub-outline-size", o.bg === "shadow" ? 1.5 : 0.9);
    setProp("sub-shadow-offset", o.bg === "shadow" ? 1.8 : 0);
    setProp("sub-back-color", "#A0000000");
    setProp("sub-blur", 0.4);
  }
  // Restyle plain-text subs (SRT etc.), but leave real ASS typesetting alone.
  setProp("sub-ass-override", "scale");
}
export function fmtTime(t: number) {
  t = Math.max(0, Math.floor(t));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return (h ? h + ":" : "") + mm + ":" + String(s).padStart(2, "0");
}
