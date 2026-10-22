/** Library health: finding the same file twice under different names, sample clips and the like. Pure. */
export type Fp = { path: string; size: number; hash: string | null };

/** Files with the same size and the same quick hash (first and last 64 KiB): copies of one file. Largest first. */
export function duplicateGroups(fps: Fp[]): Fp[][] {
  const by = new Map<string, Fp[]>();
  for (const f of fps) {
    if (!f.hash || f.size <= 0) continue;
    const k = f.size + ":" + f.hash;
    const l = by.get(k);
    if (l) l.push(f); else by.set(k, [f]);
  }
  return [...by.values()].filter((g) => g.length > 1).map((g) => g.slice().sort((a, b) => a.path.localeCompare(b.path))).sort((a, b) => b[0].size - a[0].size);
}

/** Bytes that would be freed by keeping one file of every group. */
export const wastedBytes = (groups: Fp[][]) => groups.reduce((n, g) => n + g[0].size * (g.length - 1), 0);

/** A "sample" clip that came with a release: "sample" in the name or a folder called Sample, and small. */
export function looksLikeSample(path: string, size: number): boolean {
  const norm = path.replace(/\\/g, "/").toLowerCase();
  const name = norm.split("/").pop() ?? "";
  const named = /(^|[^a-z])sample([^a-z]|$)/.test(name) || /\/sample\//.test(norm);
  return named && size > 0 && size < 150 * 1024 * 1024;
}

export const humanSize = (n: number) =>
  n >= 1e9 ? (n / 1e9).toFixed(1) + " GB" : n >= 1e6 ? Math.round(n / 1e6) + " MB" : Math.max(1, Math.round(n / 1e3)) + " KB";
