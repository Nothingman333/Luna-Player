import { useEffect, useId, useState } from "react";
import { store } from "./library";
import { tt, locale } from "./i18n";
import { ASPECTS, cleanProfile } from "./filmReviewModel";
import type { Aspect, Profile } from "./filmReviewModel";
import { Switch } from "./FilmReviewAi";
import { TASTE_NAMES, effectiveWeight, learnedTaste, profileKeyOf, suggestedWeights, workPrefix } from "./reviewTaste";
import type { TasteKind } from "./reviewTaste";
import "./FilmDecision.css";

/** What each part's "Zevklerim" says about itself: the six topics and where the learning comes from. */
const intro = (k: TasteKind): { topics: string; learn: string; empty: string; scoreHere: string } => ({
  film: {
    topics: tt("Luna her filmi ve diziyi altı konuda değerlendirir: hikâye, tempo, oyunculuk, görsellik, karakter ve duygu, müzik ve ses. Zevklerim, bu konuların senin için ne kadar önemli olduğunu tutar."),
    learn: tt("Beğendiğin eserlerde \"beni bu etkiledi\" dediğin konular ve beğendiğin analizli eserlerin en güçlü konuları %65 sayılır; beğenmediklerinin sebepleri o konuyu aşağı çeker."),
    empty: tt("Henüz öğrenilen bir şey yok: izlediğin eserlerde aşağıdaki \"İzledikten sonra\" bölümünden neden beğendiğini işaretle ya da analiz ettiğin eserleri beğen."),
    scoreHere: tt("Luna Analiz'in bu eserde o konuya verdiği puan."),
  },
  book: {
    topics: tt("Luna her kitabı altı konuda değerlendirir: kurgu, tempo, üslup, atmosfer ve dünya, karakter ve duygu, fikirler ve derinlik. Bu zevk sadece kitaplar içindir; film ve müzik zevkine karışmaz."),
    learn: tt("Beğendiğin kitaplarda \"beni bu etkiledi\" dediğin konular ve beğendiğin analizli kitapların en güçlü konuları %65 sayılır; beğenmediklerinin sebepleri o konuyu aşağı çeker."),
    empty: tt("Henüz öğrenilen bir şey yok: okuduğun kitaplarda \"Okuduktan sonra\" bölümünden neden beğendiğini işaretle ya da analiz ettiğin kitapları beğen."),
    scoreHere: tt("Luna Analiz'in bu kitapta o konuya verdiği puan (1000Kitap incelemelerine göre)."),
  },
  music: {
    topics: tt("Luna şarkıları altı konuda tartar: söz ve anlam, ritim ve enerji, vokal, prodüksiyon ve ses, duygu ve atmosfer, melodi. Bu zevk sadece müzik içindir; film ve kitap zevkine karışmaz."),
    learn: tt("Beğendiğin şarkılarda \"beni bu etkiledi\" dediğin konular %65 sayılır; beğenmediğin şarkıların sebepleri o konuyu aşağı çeker. Asistan sana şarkı ve liste önerirken bunu kullanır."),
    empty: tt("Henüz öğrenilen bir şey yok: büyük çalma ekranında bir şarkıyı beğenince \"Seni ne etkiledi?\" sorusuna cevap ver."),
    scoreHere: "",
  },
})[k];
const subtitle = (k: TasteKind) => ({ film: tt("Filmler için"), book: tt("Kitaplar için"), music: tt("Müzik için") })[k];

export const tasteLabel = (kind: TasteKind) => (a: Aspect) => tt(TASTE_NAMES[kind][a]);

/** Tells every open taste panel (and Luna Analiz) that a profile or a verdict changed. */
const changed = (key: string, origin: string) => window.dispatchEvent(new CustomEvent("film-decision-changed", { detail: { key, origin } }));

/** "Zevklerim": how much each topic counts for the user in one part of Luna (films, books or music). */
export function TastePanel({ kind, scores = {}, sub, open = true }: { kind: TasteKind; scores?: Partial<Record<Aspect, number>>; sub?: string; open?: boolean }) {
  const pk = profileKeyOf(kind), uid = useId();
  const [profile, setProfile] = useState<Profile>(() => cleanProfile(store.json(pk, null)));
  const [, bump] = useState(0);
  const [info, setInfo] = useState(false);
  const [status, setStatus] = useState("");
  useEffect(() => {
    const sync = (e: Event) => {
      const d = (e as CustomEvent<{ key?: string; origin?: string }>).detail;
      if (d?.origin === uid) return;
      setProfile(cleanProfile(store.json(pk, null)));
      bump((n) => n + 1); // a verdict changed: the learned part is read again
    };
    window.addEventListener("film-decision-changed", sync);
    return () => window.removeEventListener("film-decision-changed", sync);
  }, [pk, uid]);
  const save = (next: Profile) => {
    if (!store.set(pk, JSON.stringify(next))) { setStatus(tt("Tercihler kaydedilemedi.")); return; }
    setProfile(next); changed(pk, uid);
  };
  const label = tasteLabel(kind);
  const learned = learnedTaste(kind);
  const suggest = suggestedWeights(profile, learned);
  const differs = !!learned && ASPECTS.some((a) => suggest[a] !== profile.weights[a]);
  const num = (x: number) => x.toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const t = intro(kind);
  return <details className="la-sec" open={open}>
    <summary><h3>{tt("Zevklerim")}</h3><span>{sub ?? subtitle(kind)}</span>
      <button className={"la-info" + (info ? " on" : "")} aria-label={tt("Zevklerim nedir?")} title={tt("Zevklerim nedir?")} aria-expanded={info} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setInfo((x) => !x); }}>i</button></summary>
    {info && <div className="la-infobox" role="note">
      <b>{tt("Zevklerim nedir?")}</b>
      <p>{t.topics}</p>
      <ul>
        <li><b>{tt("Noktalar")}</b> — {tt("bir konuya senin verdiğin önem (kare = hesaba katma, 5 nokta = çok önemli). Hesabın %35'i budur.")}</li>
        <li><b>×1,65</b> — {tt("konunun gerçekte ne kadar ağır bastığı.")} {t.learn}</li>
        {t.scoreHere && <li><b>{tt("bu eserde 8,4")}</b> — {t.scoreHere}</li>}
        <li><b>{tt("Eleştiriliyorsa uyar")}</b> — {tt("bu konu zayıfsa \"Senin için\" puanı düşer ve uyarı çıkar.")}</li>
      </ul>
    </div>}
    <div className="la-taste">
      {ASPECTS.map((a) => {
        const eff = effectiveWeight(a, profile, learned);
        return <div className="la-taste-row" key={a}>
          <b>{label(a)}</b>
          <div className="la-dots" role="radiogroup" aria-label={tt("{0} senin için ne kadar önemli?", label(a))}>
            {[0, 1, 2, 3, 4, 5].map((n) => <button key={n} role="radio" aria-checked={profile.weights[a] === n} className={(n === 0 ? "-off" : "") + (n > 0 && n <= profile.weights[a] ? " on" : "") + (n === 0 && profile.weights[a] === 0 ? " on" : "")}
              title={n === 0 ? tt("Hesaba katma") : tt("Önem: {0}/5", n)} onClick={() => save({ ...profile, weights: { ...profile.weights, [a]: n } })} />)}
          </div>
          <span className="la-eff">
            {eff ? <b>×{eff.toLocaleString(locale(), { maximumFractionDigits: 2 })}</b> : <b className="-off">{tt("katılmıyor")}</b>}
            {learned?.boost[a] && <i className="-up">↑ {tt("beğenilerinden")}</i>}
            {learned?.penalty[a] && <i className="-down">↓ {tt("beğenmediklerinden")}</i>}
          </span>
          <span className="la-film">{scores[a] != null ? tt("bu eserde {0}", num(scores[a]!)) : ""}</span>
          <span className="la-warn"><Switch on={profile.avoid.includes(a)} label={tt("{0}: eleştiriliyorsa uyar", label(a))} onChange={(on) => save({ ...profile, avoid: on ? [...profile.avoid, a] : profile.avoid.filter((x) => x !== a) })} />{tt("Eleştiriliyorsa uyar")}</span>
        </div>;
      })}
    </div>
    <p className="la-muted">{learned ? tt("Zevkin {0} beğendiğin ve {1} beğenmediğin eserden öğrenildi.", learned.liked, learned.disliked) : t.empty}</p>
    {differs && <div className="la-suggest"><span>{tt("Beğenilerine göre önerilen önem: {0}", ASPECTS.map((a) => `${label(a)} ${suggest[a]}`).join(" · "))}</span><button className="chip" onClick={() => save({ ...profile, weights: suggest })}>{tt("Uygula")}</button></div>}
    {status && <p className="la-status" role="status">{status}</p>}
  </details>;
}

/** "Seni ne etkiledi?": the reasons behind a like or a dislike for one book or song (films keep theirs in "İzledikten sonra"). */
export type Verdict = { vote: "like" | "dislike" | "none"; reasons: Aspect[] };
export const loadVerdict = (kind: TasteKind, key: string): Verdict => {
  const f = store.json<any>(workPrefix(kind) + key, null)?.feedback;
  return { vote: f?.vote === "like" || f?.vote === "dislike" ? f.vote : "none", reasons: Array.isArray(f?.reasons) ? ASPECTS.filter((a) => f.reasons.includes(a)) : [] };
};
export function saveVerdict(kind: TasteKind, key: string, v: Verdict, title?: string) {
  const k = workPrefix(kind) + key;
  const old = store.json<any>(k, null) ?? {};
  store.set(k, JSON.stringify({ ...old, ...(title ? { title } : {}), feedback: { ...(old.feedback ?? {}), vote: v.vote, reasons: v.reasons } }));
  changed(k, "verdict");
}
export function ReasonPicker({ kind, itemKey, vote, title, compact, name }: { kind: TasteKind; itemKey: string; vote: "like" | "dislike" | "none"; title?: string; compact?: boolean; /** the book or song, as the assistant should read it */ name?: string }) {
  const [v, setV] = useState(() => loadVerdict(kind, itemKey));
  useEffect(() => { setV(loadVerdict(kind, itemKey)); }, [kind, itemKey]);
  // the like/dislike itself lives in the page (the reading diary, the liked songs); the reasons follow it
  useEffect(() => {
    if (v.vote === vote) return;
    const next = { vote, reasons: vote === "none" ? [] : v.reasons };
    setV(next); saveVerdict(kind, itemKey, next, name);
  }, [vote]);
  if (vote === "none") return null;
  const label = tasteLabel(kind);
  const toggle = (a: Aspect) => { const next = { vote, reasons: v.reasons.includes(a) ? v.reasons.filter((x) => x !== a) : [...v.reasons, a] }; setV(next); saveVerdict(kind, itemKey, next, name); };
  return <div className={"la-why" + (compact ? " -compact" : "")}>
    <span>{title ?? (vote === "like" ? tt("Seni ne etkiledi?") : tt("Seni ne uzaklaştırdı?"))}</span>
    <div className="la-reasons">{ASPECTS.map((a) => <button key={a} className={"seg" + (v.reasons.includes(a) ? " on" : "")} aria-pressed={v.reasons.includes(a)} onClick={() => toggle(a)}>{label(a)}</button>)}</div>
  </div>;
}
