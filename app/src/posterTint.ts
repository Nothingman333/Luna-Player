import { useEffect, useState } from "react";
import { store } from "./library";

/**
 * A colour from a poster for tinting the page around it (TMDB serves its images with CORS, so a
 * small canvas can read them). Vivid mid-tones count most; the result is kept dark and saturated
 * enough for white text. `pickTint` is pure.
 */
export function pickTint(px: ArrayLike<number>): [number, number, number] | null {
  let R = 0, G = 0, B = 0, W = 0, aR = 0, aG = 0, aB = 0, n = 0;
  for (let i = 0; i + 3 < px.length; i += 4) {
    if (px[i + 3] < 128) continue;
    const r = px[i] / 255, g = px[i + 1] / 255, b = px[i + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
    const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
    const w = s * Math.max(0, 1 - Math.abs(l - 0.5) * 1.7);
    R += px[i] * w; G += px[i + 1] * w; B += px[i + 2] * w; W += w;
    aR += px[i]; aG += px[i + 1]; aB += px[i + 2]; n++;
  }
  if (!n) return null;
  const [r, g, b] = W > n * 0.02 ? [R / W, G / W, B / W] : [aR / n, aG / n, aB / n];
  // to HSL, clamp to a tone that works behind white text, back to RGB
  const rr = r / 255, gg = g / 255, bb = b / 255, max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb);
  let h = 0; const l0 = (max + min) / 2, d = max - min;
  const s0 = d === 0 ? 0 : d / (1 - Math.abs(2 * l0 - 1));
  if (d) h = max === rr ? ((gg - bb) / d) % 6 : max === gg ? (bb - rr) / d + 2 : (rr - gg) / d + 4;
  h = (h * 60 + 360) % 360;
  const s = s0 < 0.08 ? s0 : Math.min(0.72, Math.max(0.35, s0)), l = Math.min(0.5, Math.max(0.32, l0));
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r1, g1, b1] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r1 + m) * 255), Math.round((g1 + m) * 255), Math.round((b1 + m) * 255)];
}

const mem = new Map<string, string | null>();
/** "r, g, b" for a CSS variable, or null until (or unless) the picture could be read. */
export function useTint(url: string | null | undefined): string | null {
  const [tint, setTint] = useState<string | null>(() => (url ? mem.get(url) ?? store.get("tint:" + url) : null));
  useEffect(() => {
    if (!url) { setTint(null); return; }
    const known = mem.get(url) ?? store.get("tint:" + url);
    if (known) { setTint(known); return; }
    let alive = true;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const c = document.createElement("canvas"); c.width = 24; c.height = 36;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, 24, 36);
        const t = pickTint(ctx.getImageData(0, 0, 24, 36).data);
        const v = t ? t.join(", ") : null;
        mem.set(url, v);
        if (v) store.set("tint:" + url, v);
        if (alive) setTint(v);
      } catch { mem.set(url, null); }
    };
    img.onerror = () => { mem.set(url, null); };
    img.src = url;
    return () => { alive = false; };
  }, [url]);
  return tint;
}
