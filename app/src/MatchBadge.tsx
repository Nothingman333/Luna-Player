// "Sana uyum %82 · tahmini ★★★★": a film against the user's taste model, on the title page.
// Click it for the reasons (the director, themes, era… that pushed it up or down).
import { useEffect, useState } from "react";
import { DEC, pctText, tt } from "./i18n";
import { featName, loadModel, matchFor, onTasteEngine, typeLabel } from "./tasteEngine";
import type { Match } from "./tasteCore";

const starText = (s: number) => "★".repeat(Math.floor(s)) + (s % 1 ? "½" : "");

export function MatchBadge({ kind, id }: { kind?: "movie" | "tv"; id?: number }) {
  const [m, setM] = useState<Match | null>(null);
  const [open, setOpen] = useState(false);
  const [ver, bump] = useState(0);
  useEffect(() => onTasteEngine(() => bump((x) => x + 1)), []);
  useEffect(() => {
    let alive = true;
    setM(null);
    if (!kind || !id || !loadModel()) return;
    matchFor(kind, id).then((r) => alive && setM(r?.match ?? null)).catch(() => {});
    return () => { alive = false; };
  }, [kind, id, ver]);
  if (!m) return null;
  const level = m.pct >= 75 ? "hi" : m.pct >= 45 ? "mid" : "lo";
  const thin = m.known < 3;
  return (
    <div className={"taste-lab-match " + level}>
      <button className="taste-lab-match-btn" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        data-tip={tt("Zevk profiline göre: kendi puanladığın filmler arasında nereye düşeceği")}>
        <b>{pctText(m.pct)}</b> {tt("uyum")}
        <span className="taste-lab-match-stars">· {tt("tahmini")} {starText(m.stars)} <span className="muted">({String(m.stars).replace(".", DEC)})</span></span>
        {thin && <span className="taste-lab-thin">{tt("az veri")}</span>}
      </button>
      {open && (
        <div className="taste-lab-match-why">
          {m.plus.length > 0 && <div><span className="taste-lab-why-h good">{tt("Lehine")}</span>{m.plus.map((r) => <span key={r.key} className="taste-lab-chip good">{typeLabel(r.type)}: {featName(r.key)}</span>)}</div>}
          {m.minus.length > 0 && <div><span className="taste-lab-why-h bad">{tt("Aleyhine")}</span>{m.minus.map((r) => <span key={r.key} className="taste-lab-chip bad">{typeLabel(r.type)}: {featName(r.key)}</span>)}</div>}
          {!m.plus.length && !m.minus.length && <div className="muted small">{tt("Bu filmin özellikleri profilinde pek geçmiyor; tahmin ortalamaya yakın.")}</div>}
          {thin && <div className="muted small">{tt("Profilinde bu filme benzeyen az film var; tahmini temkinli oku.")}</div>}
        </div>
      )}
    </div>
  );
}
