import { useEffect, useMemo, useState } from "react";
import { tt, lang } from "./i18n";
import { IMG, Item, store, tmdbGet } from "./library";
import { ExtraModal } from "./Extras";
import { CalendarGroup, daysUntil, groupUpcoming, NextEp, parseNext, Upcoming } from "./calendarModel";
import { notifyUser } from "./shellBridge";

const TTL = 12 * 3600 * 1000;
type Cached = { at: number; next: NextEp | null };
const cached = (id: number): Cached | null => store.json<Cached | null>("cal:" + id, null);

/** The next episode of every show in the library (TMDB; refreshed twice a day; a show without a TMDB match is skipped). */
export function useUpcoming(items: Item[]): { list: Upcoming[]; loading: boolean } {
  const shows = useMemo(() => items.filter((i) => (i.meta?.kind ?? i.parsed.kind) === "tv" && (i.meta?.id ?? 0) > 0).slice(0, 80), [items]);
  const sig = shows.map((s) => s.meta!.id).join(",");
  const [tick, setTick] = useState(0);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!store.get("tmdbKey")) return;
    let alive = true;
    const todo = shows.filter((s) => { const c = cached(s.meta!.id); return !c || Date.now() - c.at > TTL; });
    if (!todo.length) return;
    setLoading(true);
    (async () => {
      for (let i = 0; i < todo.length && alive; i += 4) {
        await Promise.all(todo.slice(i, i + 4).map(async (s) => {
          const tv = await tmdbGet(`/tv/${s.meta!.id}`).catch(() => undefined);
          if (tv !== undefined) store.set("cal:" + s.meta!.id, JSON.stringify({ at: Date.now(), next: parseNext(tv) } satisfies Cached));
        }));
        if (alive) setTick((n) => n + 1);
      }
    })().finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [sig]);
  const list = useMemo(() => {
    const now = new Date();
    return shows.flatMap((s): Upcoming[] => {
      const n = cached(s.meta!.id)?.next;
      return n ? [{ ...n, key: s.key, title: s.meta!.title, poster: s.meta!.poster, days: daysUntil(n.date, now) }] : [];
    });
  }, [sig, tick]);
  // an episode out today: one notification, once
  useEffect(() => {
    for (const u of list) {
      if (u.days !== 0) continue;
      const k = `calNotified:${u.key}:${u.season}:${u.episode}`;
      if (store.get(k)) continue;
      store.set(k, "1");
      void notifyUser("episode", u.title, tt("Bugün yeni bölüm: S{0}B{1}", u.season, u.episode));
    }
  }, [list]);
  return { list, loading };
}

const LABEL: Record<CalendarGroup, () => string> = { today: () => tt("Bugün"), tomorrow: () => tt("Yarın"), week: () => tt("Bu hafta"), later: () => tt("Daha sonra") };
const dateText = (d: string) => new Date(d + "T12:00:00").toLocaleDateString(lang() === "tr" ? "tr-TR" : "en-GB", { day: "numeric", month: "long", weekday: "short" });

function Row({ u, onOpen }: { u: Upcoming; onOpen?: (key: string) => void }) {
  return (
    <button className="cal-row" onClick={() => onOpen?.(u.key)} disabled={!onOpen}>
      {u.poster ? <img src={IMG + "w92" + u.poster} alt="" loading="lazy" /> : <i className="cal-nop" />}
      <span className="cal-t"><b>{u.title}</b><small>{`S${u.season} B${u.episode}`}{u.name ? " · " + u.name : ""}</small></span>
      <span className="cal-d">{dateText(u.date)}</span>
    </button>
  );
}

/** Ctrl+K › "Yayın takvimi": the coming episodes of the shows in the library. */
export function CalendarModal({ items, onOpen, onClose }: { items: Item[]; onOpen: (key: string) => void; onClose: () => void }) {
  const { list, loading } = useUpcoming(items);
  const groups = groupUpcoming(list);
  return (
    <ExtraModal title={tt("Yayın takvimi")} close={onClose}>
      <div className="cal">
        {!store.get("tmdbKey") && <p className="lp-hint">{tt("Takvim için TMDB anahtarı gerekir (Ayarlar › Hesaplar).")}</p>}
        {loading && !groups.length && <p className="lp-hint">{tt("Yükleniyor…")}</p>}
        {!loading && !groups.length && !!store.get("tmdbKey") && <p className="lp-hint">{tt("Kütüphanendeki dizilerin yaklaşan bölümü yok ya da diziler TMDB ile eşleşmemiş.")}</p>}
        {groups.map((g) => <section key={g.group}><h4>{LABEL[g.group]()}</h4>{g.rows.map((u) => <Row key={u.key} u={u} onOpen={(k) => { onClose(); onOpen(k); }} />)}</section>)}
        {groups.length > 0 && <p className="lp-hint">{tt("Tarihler TMDB'den gelir; yayın saati ülkeye göre değişir.")}</p>}
      </div>
    </ExtraModal>
  );
}

/** A small strip on the home page when a show of the library has an episode in the next week. */
export function UpcomingStrip({ items, onOpen, onAll }: { items: Item[]; onOpen: (key: string) => void; onAll: () => void }) {
  const { list } = useUpcoming(items);
  const soon = list.filter((u) => u.days >= 0 && u.days <= 7).sort((a, b) => a.days - b.days).slice(0, 8);
  if (!soon.length) return null;
  return (
    <section className="cal-strip">
      <div className="row-head"><h2>{tt("Yaklaşan bölümler")}</h2><span className="grow" /><button className="chip" onClick={onAll}>{tt("Takvim")}</button></div>
      <div className="cal-strip-row">{soon.map((u) => <Row key={u.key} u={u} onOpen={onOpen} />)}</div>
    </section>
  );
}
