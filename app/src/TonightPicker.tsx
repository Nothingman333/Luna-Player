import { useEffect, useMemo, useRef, useState } from "react";
import { tt, lang } from "./i18n";
import { IMG, isFinished, isRemote, Item, Recent } from "./library";
import { Candidate, Mood, Pick, pickTonight, Reason } from "./tonightModel";
import { useTint } from "./posterTint";
import { openPanel } from "./paletteExtras";

const TIMES: [number, () => string][] = [[50, () => tt("Bir bölümlük")], [100, () => tt("1,5 saat")], [130, () => tt("2 saat")], [180, () => tt("3 saat")], [0, () => tt("Fark etmez")]];
const MOODS: [Mood, () => string, string][] = [
  ["any", () => tt("Her şey olur"), "M12 3v18M3 12h18"],
  ["tense", () => tt("Gerilim"), "M13 2L4 14h7l-1 8 9-12h-7z"],
  ["light", () => tt("Hafif"), "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM8.5 14a4 4 0 0 0 7 0M9 10h.01M15 10h.01"],
  ["deep", () => tt("Düşündürücü"), "M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.4.3.6.8.6 1.2V16h6v-1c0-.4.2-.9.6-1.2A6 6 0 0 0 12 3z"],
  ["epic", () => tt("Macera"), "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM16 8l-2 6-6 2 2-6z"],
  ["heart", () => tt("Duygusal"), "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"],
];

/** Films not watched yet and the next episode of shows already started, as candidates. */
export function tonightCandidates(items: Item[], recent: Recent[]): Candidate[] {
  const progress = new Map(recent.map((r) => [r.path, r.duration > 0 ? r.time / r.duration : 0]));
  const out: Candidate[] = [];
  items.forEach((it, order) => {
    const m = it.meta;
    if (!m || m.id <= 0 || !it.files.length) return;
    const local = it.files.filter((f) => !isRemote(f.path));
    if (!local.length) return;
    if ((m.kind ?? it.parsed.kind) === "tv") {
      const next = local.find((f) => !isFinished(f.path) && (progress.get(f.path) ?? 0) < 0.9);
      const started = local.some((f) => isFinished(f.path) || (progress.get(f.path) ?? 0) > 0.05);
      if (!next || !started) return;
      out.push({ key: it.key, title: m.title, kind: "tv", runtime: m.runtime && m.runtime < 120 ? m.runtime : 45, genres: m.genres, rating: m.rating, poster: m.poster, backdrop: m.backdrop, path: next.path, episode: next.season != null ? `S${next.season}·B${next.episode ?? "?"}` : undefined, order });
    } else {
      if (local.some((f) => isFinished(f.path) || (progress.get(f.path) ?? 0) > 0.9)) return;
      out.push({ key: it.key, title: m.title, kind: "movie", runtime: m.runtime ?? 0, genres: m.genres, rating: m.rating, poster: m.poster, backdrop: m.backdrop, path: local[0].path, order });
    }
  });
  return out;
}

const reasonText = (r: Reason): string => {
  if (r.kind === "time") return tt("{0} dk · vaktine uyuyor", r.value);
  if (r.kind === "mood") return MOODS.find((m) => m[0] === r.value)?.[1]() ?? "";
  if (r.kind === "rating") return tt("TMDB ★ {0}", String(r.value).replace(".", lang() === "tr" ? "," : "."));
  if (r.kind === "episode") return tt("Sıradaki bölüm {0}", r.value);
  return tt("Bir süredir bekliyor");
};

/** Home: "What should I watch tonight?" — your own library, the time you have, the mood you're in. */
export function TonightPicker({ items, recent, onPlay, onDetails }: { items: Item[]; recent: Recent[]; onPlay: (path: string) => void; onDetails: (key: string) => void }) {
  const cands = useMemo(() => tonightCandidates(items, recent), [items, recent]);
  const [minutes, setMinutes] = useState(130);
  const [mood, setMood] = useState<Mood>("any");
  const [res, setRes] = useState<Pick | null | "none">(null);
  const [rolling, setRolling] = useState<string | null>(null);
  const [only, setOnly] = useState(false);
  const avoid = useRef<string[]>([]);
  const timer = useRef(0);
  useEffect(() => () => clearInterval(timer.current), []);
  const pick = useMemo(() => (res && res !== "none" ? res.pick : null), [res]);
  const tint = useTint(pick?.poster ? IMG + "w92" + pick.poster : null);
  if (cands.length < 2) return null;
  const roll = () => {
    clearInterval(timer.current);
    const seed = Date.now() % 100000;
    const r = pickTonight(cands, { minutes, mood, seed, avoid: avoid.current });
    const pool = cands.filter((c) => c.poster).map((c) => IMG + "w185" + c.poster);
    if (!r) { setRes("none"); return; }
    setOnly(!!res && res !== "none" && res.pick.key === r.pick.key && !r.others.length);
    avoid.current = [r.pick.key, ...avoid.current].slice(0, 6);
    if (!pool.length || matchMedia("(prefers-reduced-motion: reduce)").matches) { setRes(r); return; }
    let n = 0;
    setRes(null);
    timer.current = window.setInterval(() => {
      setRolling(pool[(n * 7 + seed) % pool.length]);
      if (++n > 9) { clearInterval(timer.current); setRolling(null); setRes(r); }
    }, 110);
  };
  return (
    <section className={"tn glass" + (tint ? " tinted" : "")} style={tint ? ({ "--tn-rgb": tint } as React.CSSProperties) : undefined}>
      <div className="tn-ask">
        <div className="tn-head">
          <h2>{tt("Bu akşam ne izlesem?")}</h2>
          <button className="tn-recap" onClick={() => openPanel("lines")} title={tt("Replik ara")}>{tt("Replik ara")} ›</button>
          <button className="tn-recap" onClick={() => openPanel("recap")} title={tt("Luna Özet")}>{tt("Luna Özet")} ›</button>
        </div>
        <p className="tn-sub">{tt("Kütüphanende bekleyenlerden, vaktine ve ruh haline göre.")}</p>
        <div className="tn-row" role="radiogroup" aria-label={tt("Ne kadar vaktin var?")}>
          {TIMES.map(([m, l]) => <button key={m} role="radio" aria-checked={minutes === m} className={"tn-chip" + (minutes === m ? " on" : "")} onClick={() => setMinutes(m)}>{l()}</button>)}
        </div>
        <div className="tn-row" role="radiogroup" aria-label={tt("Ruh hali")}>
          {MOODS.map(([k, l, d]) => (
            <button key={k} role="radio" aria-checked={mood === k} className={"tn-chip mood" + (mood === k ? " on" : "")} onClick={() => setMood(k)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>{l()}
            </button>
          ))}
        </div>
        <button className="tn-go" onClick={roll} disabled={!!rolling}>{res && res !== "none" ? tt("Başka bir tane") : tt("Benim için seç")}</button>
      </div>
      <div className="tn-out" aria-live="polite">
        {rolling && <div className="tn-roll"><img src={rolling} alt="" /></div>}
        {!rolling && res === null && (
          <div className="tn-fan" aria-hidden="true">
            {cands.filter((c) => c.poster).slice(0, 3).map((c, i) => <img key={c.key} src={IMG + "w185" + c.poster} alt="" style={{ "--i": i } as React.CSSProperties} />)}
          </div>
        )}
        {!rolling && res === "none" && <p className="tn-none">{tt("Bu süreye ve ruh haline uyan bir şey bulamadım. Vakti uzatmayı ya da “Her şey olur”u dene.")}</p>}
        {!rolling && pick && res && res !== "none" && (
          <div className="tn-result" key={pick.key}>
            {pick.poster ? <img className="tn-poster" src={IMG + "w342" + pick.poster} alt="" /> : <div className="tn-poster blank" />}
            <div className="tn-info">
              <h3>{pick.title}</h3>
              <div className="tn-reasons">{res.reasons.map((r, i) => <span key={i} className="tn-reason">{reasonText(r)}</span>)}</div>
              {only && <p className="tn-only">{tt("Bu süreye ve ruh haline uyan tek seçenek bu.")}</p>}
              <div className="tn-acts">
                <button className="primary" onClick={() => onPlay(pick.path)}>{pick.kind === "tv" ? tt("Bölümü oynat") : tt("Oynat")}</button>
                <button className="chip" onClick={() => onDetails(pick.key)}>{tt("Ayrıntılar")}</button>
              </div>
              {res.others.length > 0 && (
                <div className="tn-others"><span>{tt("Ya da:")}</span>{res.others.map((o) => <button key={o.key} className="tn-other" onClick={() => onDetails(o.key)} title={o.title}>{o.poster ? <img src={IMG + "w92" + o.poster} alt="" /> : null}<span>{o.title}</span></button>)}</div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
