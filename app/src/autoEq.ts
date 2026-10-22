/**
 * AutoEq headphone correction (github.com/jaakkopasanen/AutoEq, MIT): the "ParametricEQ.txt" of a
 * headphone model becomes one mpv audio filter (ffmpeg's equalizer / lowshelf / highshelf).
 *   Preamp: -6.1 dB
 *   Filter 1: ON LSC Fc 105 Hz Gain 6.4 dB Q 0.70
 *   Filter 2: ON PK Fc 8800 Hz Gain 5.1 dB Q 1.42
 */
export type EqFilter = { type: "PK" | "LSC" | "HSC"; fc: number; gain: number; q: number };
export type AutoEq = { preamp: number; filters: EqFilter[]; skipped: number };
export const AUTOEQ_LABEL = "@luna_autoeq";

const TYPES: Record<string, EqFilter["type"]> = { PK: "PK", PEAKING: "PK", LSC: "LSC", LS: "LSC", HSC: "HSC", HS: "HSC" };
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** The filters of an AutoEq file; null when it holds none (not an AutoEq file). Unknown or switched-off filters are counted, not used. */
export function parseAutoEq(text: string): AutoEq | null {
  if (typeof text !== "string" || text.length > 200_000) return null;
  let preamp = 0, skipped = 0;
  const filters: EqFilter[] = [];
  for (const line of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const p = line.match(/^\s*Preamp:\s*(-?\d+(?:\.\d+)?)\s*dB/i);
    if (p) { preamp = clamp(Number(p[1]), -24, 6); continue; }
    const f = line.match(/^\s*Filter\s*\d+:\s*(ON|OFF)\s+([A-Za-z]+)\s+Fc\s+(\d+(?:\.\d+)?)\s*Hz\s+Gain\s+(-?\d+(?:\.\d+)?)\s*dB\s+Q\s+(\d+(?:\.\d+)?)/i);
    if (!f) continue;
    const type = TYPES[f[2].toUpperCase()];
    if (f[1].toUpperCase() !== "ON" || !type || filters.length >= 30) { skipped++; continue; }
    filters.push({ type, fc: clamp(Number(f[3]), 10, 24000), gain: clamp(Number(f[4]), -24, 24), q: clamp(Number(f[5]), 0.05, 20) });
  }
  return filters.length ? { preamp, filters, skipped } : null;
}

const num = (n: number) => String(Number(n.toFixed(2)));

/** The value for `af add @luna_autoeq:<value>`: the preamp first (so boosts don't clip), then every filter. */
export function autoEqFilter(eq: AutoEq): string {
  const parts: string[] = [];
  if (eq.preamp !== 0) parts.push(`volume=${num(eq.preamp)}dB`);
  for (const f of eq.filters) {
    const name = f.type === "PK" ? "equalizer" : f.type === "LSC" ? "lowshelf" : "highshelf";
    parts.push(`${name}=f=${num(f.fc)}:t=q:w=${num(f.q)}:g=${num(f.gain)}`);
  }
  return `lavfi=[${parts.join(",")}]`;
}
