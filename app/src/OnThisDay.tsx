import { useMemo } from "react";
import { tt } from "./i18n";
import { IMG, Item, loadFinished } from "./library";
import { onThisDay } from "./onThisDayModel";

/** A slim line on the home page: what you finished on this day in earlier years. */
export function OnThisDay({ items, onOpen }: { items: Item[]; onOpen: (key: string) => void }) {
  const mem = useMemo(() => {
    const byPath = new Map<string, Item>();
    for (const it of items) for (const f of it.files) byPath.set(f.path, it);
    const done = Object.entries(loadFinished()).flatMap(([path, at]) => {
      const it = byPath.get(path);
      if (!it?.meta) return [];
      return [{ key: it.key, title: it.meta.title, poster: it.meta.poster ? IMG + "w92" + it.meta.poster : null, at, kind: it.meta.kind }];
    });
    return onThisDay(done, Date.now());
  }, [items]);
  if (!mem.length) return null;
  return (
    <section className="otd" aria-label={tt("Geçen yıl bugün")}>
      <span className="otd-label"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8v5l3 2M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" /></svg>{tt("Bugün, geçmiş yıllarda")}</span>
      {mem.map((m) => (
        <button key={m.key + m.yearsAgo} className="otd-item" onClick={() => onOpen(m.key)} title={m.title}>
          {m.poster ? <img src={m.poster} alt="" /> : <i />}
          <span><b>{m.title}</b><small>{m.yearsAgo === 1 ? tt("1 yıl önce") : tt("{0} yıl önce", m.yearsAgo)}{m.count > 1 ? " · " + tt("{0} bölüm", m.count) : ""}</small></span>
        </button>
      ))}
    </section>
  );
}
