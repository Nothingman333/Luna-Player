/** "Temalar ve duygular": what keeps coming back in what the user liked. An analysis writes its own free text for each
 *  title, so labels sharing a meaningful word are one group; a group from a single title says nothing about taste. */
export type ThemeWork = { title: string; weight: number; labels: { name: string; share: number }[] };
export type ThemeGroup = { name: string; score: number; works: string[] };

const STOP = new Set(["and", "the", "with", "from", "that", "this", "ile", "için", "gibi", "olan", "veya", "bir"]);
const stems = (label: string) => label.toLocaleLowerCase("tr").split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 4 && !STOP.has(w)).map((w) => w.slice(0, 5));

export function themeGroups(works: readonly ThemeWork[], limit: number, minWorks = 2): ThemeGroup[] {
  const groups: { stems: Set<string>; names: Map<string, number>; score: number; works: Set<string> }[] = [];
  for (const work of works) for (const { name, share } of work.labels) {
    const own = stems(name);
    const key = own.length ? own : [name.toLocaleLowerCase("tr")];
    const hits = groups.filter((g) => key.some((s) => g.stems.has(s)));
    const group = hits[0] ?? { stems: new Set<string>(), names: new Map<string, number>(), score: 0, works: new Set<string>() };
    if (!hits.length) groups.push(group);
    for (const other of hits.slice(1)) {
      other.stems.forEach((s) => group.stems.add(s));
      other.names.forEach((v, n) => group.names.set(n, (group.names.get(n) ?? 0) + v));
      other.works.forEach((w) => group.works.add(w));
      group.score += other.score;
      groups.splice(groups.indexOf(other), 1);
    }
    const value = work.weight * share / 100;
    key.forEach((s) => group.stems.add(s));
    group.names.set(name, (group.names.get(name) ?? 0) + value);
    group.works.add(work.title);
    group.score += value;
  }
  return groups.filter((g) => g.works.size >= minWorks).sort((a, b) => b.score - a.score).slice(0, limit)
    .map((g) => ({ name: [...g.names].sort((a, b) => b[1] - a[1])[0][0], score: g.score, works: [...g.works] }));
}
