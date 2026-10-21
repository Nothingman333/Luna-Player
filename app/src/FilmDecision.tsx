import { useEffect, useId, useRef, useState } from "react";
import { store } from "./library";
import { invoke } from "@tauri-apps/api/core";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { tt, locale } from "./i18n";
import { ASPECTS, addAnalysis, cleanProfile, cleanWorkspace, filmKey, parseReviews, personalFit } from "./filmReviewModel";
import type { Aspect, FilmTarget, Mood, Profile, Workspace } from "./filmReviewModel";
import { ReviewAiCard } from "./FilmReviewAi";
import "./FilmDecision.css";

const labels: Record<Aspect, string> = { story: "Hikâye", pace: "Tempo", acting: "Oyunculuk", visuals: "Görsellik", emotion: "Karakter ve duygu", sound: "Müzik ve ses" };
const label = (a: Aspect) => tt(labels[a]);
const profileKey = (f: FilmTarget) => "filmDecision:profile:" + (f.kind === "tv" ? "tv" : "movie");
export function FilmDecisionPanel({ film }: { film: FilmTarget }) {
  return <DecisionWorkspace key={filmKey(film)} film={film} />;
}
function DecisionWorkspace({ film }: { film: FilmTarget }) {
  const key = "filmDecision:work:" + filmKey(film), pk = profileKey(film), uid = useId();
  const [work, setWork] = useState(() => cleanWorkspace(store.json(key, null)));
  const [profile, setProfile] = useState(() => cleanProfile(store.json(pk, null)));
  const [mood, setMood] = useState<Mood>("any"), [text, setText] = useState("");
  const [selected, setSelected] = useState(0), [status, setStatus] = useState("");
  const [note, setNote] = useState(work.feedback.note), [draft, setDraft] = useState(work.draft);
  const [reasons, setReasons] = useState<Aspect[]>(work.feedback.reasons);
  const pending = useRef(0), mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; pending.current++; }; }, []);
  useEffect(() => {
    const sync = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: string; origin?: string }>).detail;
      if (detail?.origin === uid) return;
      const changed = event instanceof StorageEvent ? event.key : detail?.key;
      if (!changed || changed === key) setWork(cleanWorkspace(store.json(key, null)));
      if (!changed || changed === pk) setProfile(cleanProfile(store.json(pk, null)));
    };
    window.addEventListener("film-decision-changed", sync); window.addEventListener("storage", sync);
    return () => { window.removeEventListener("film-decision-changed", sync); window.removeEventListener("storage", sync); };
  }, [key, pk, uid]);
  const save = (next: Workspace) => {
    if (!store.set(key, JSON.stringify(next))) { setStatus(tt("Kaydedilemedi. Depolama alanını kontrol et; metnin burada duruyor.")); return false; }
    setWork(next); window.dispatchEvent(new CustomEvent("film-decision-changed", { detail: { key, origin: uid } })); return true;
  };
  const saveProfile = (next: Profile) => {
    if (!store.set(pk, JSON.stringify(next))) { setStatus(tt("Tercihler kaydedilemedi.")); return; }
    setProfile(next); window.dispatchEvent(new CustomEvent("film-decision-changed", { detail: { key: pk, origin: uid } }));
  };
  const analyze = (raw: string, json = false, done = tt("Yerel tarama kaydedildi. Yorumlar bir sunucuya gönderilmedi.")) => {
    try {
      // Read the latest copy before writing, including changes from another open panel.
      const latest = cleanWorkspace(store.json(key, null));
      if (save(addAnalysis(latest, parseReviews(raw, json)))) { setSelected(0); setStatus(done); }
    } catch { setStatus(tt("Yorumlar okunamadı. En fazla 200 yorum, yorum başına 4000 karakter ve toplam 120000 karakter kullan. JSON biçimi: reviews içinde text ve isteğe bağlı source.")); }
  };
  const analysis = work.history[Math.min(selected, Math.max(0, work.history.length - 1))];
  const learnedProfile = { ...profile, avoid: [...new Set([...profile.avoid, ...(work.feedback.vote === "dislike" ? work.feedback.reasons : [])])] };
  const fit = personalFit(analysis, learnedProfile, mood);
  const previous = work.history[Math.min(selected, work.history.length - 1) + 1];
  const oldFit = personalFit(previous, learnedProfile, mood);
  const feedback = (vote: Workspace["feedback"]["vote"]) => {
    const latest = cleanWorkspace(store.json(key, null));
    if (save({ ...latest, feedback: { vote, reasons, note } })) setStatus(tt("Bu eser için geri bildirimin kaydedildi."));
  };
  const exportData = async () => {
    const json = JSON.stringify({ luna: "film-decision", version: 1, film: { title: film.title, year: film.year, kind: film.kind, id: film.id, rating: film.rating }, workspace: work, profile, method: "keywords-v1" }, null, 2);
    try {
      if ("__TAURI_INTERNALS__" in window) {
        const path = await saveDialog({ defaultPath: "luna-film-notlari.json", filters: [{ name: "JSON", extensions: ["json"] }] });
        if (!path) return;
        await invoke("backup_write", { path, json });
      } else {
        const url = URL.createObjectURL(new Blob([json], { type: "application/json;charset=utf-8" })), a = document.createElement("a");
        a.href = url; a.download = "luna-film-notlari.json"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      setStatus(tt("Analiz ve notlar dışa aktarıldı."));
    } catch { setStatus(tt("Dışa aktarılamadı. Kayıt yerini ve yazma iznini kontrol et.")); }
  };
  return <section className="fd-panel" aria-label={tt("İzlemeye değer mi?")}>
    <div className="fd-heading"><div><span className="fd-eyebrow">{tt("SENİN SEYİR DEFTERİN")}</span><h2>{tt("İzlemeye değer mi?")}</h2></div><span className="fd-local">{tt("Yerel · özel")}</span></div>
    <p className="fd-intro">{tt("Yorumların gerekçelerini kendi tercihlerinle birlikte incele. Son karar sende.")}</p>
    <div className="fd-summary">
      <div><span>{tt("TMDB topluluk puanı")}</span><strong>{Number.isFinite(film.rating) && film.rating! > 0 && film.rating! <= 10 ? film.rating!.toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " / 10" : "—"}</strong><small>{tt("Yorum taramasından bağımsız")}</small></div>
      <div><span>{tt("Kişisel yorum sinyali")}</span><strong>{fit.score === null ? "—" : fit.score + " / 100"}</strong><small>{tt("Açık işaret bulunan konu: {0}", fit.covered)}</small></div>
      <div><label htmlFor={uid + "mood"}>{tt("Bugün ne istersin?")}</label><select id={uid + "mood"} value={mood} onChange={e => setMood(e.target.value as Mood)}><option value="any">{tt("Genel değerlendirme")}</option><option value="easy">{tt("Tempo öncelikli")}</option><option value="deep">{tt("Hikâye ve karakter")}</option><option value="visual">{tt("Görsel bir yolculuk")}</option></select><small>{tt("Seçim yalnız konu ağırlıklarını değiştirir")}</small></div>
    </div>
    <p className="fd-method">{tt("Bu bir yapay zekâ değerlendirmesi değil; Türkçe ve İngilizce anahtar sözcük taraması. İroniyi ve bağlamı kaçırabilir. Sinyal, film puanı veya beğenme olasılığı değildir. En az iki konuda açık işaret yoksa hesaplanmaz.")}</p>
    <ReviewAiCard film={film} profile={learnedProfile} mood={mood} label={label} onReviews={(json) => analyze(json, true, tt("Letterboxd yorumları yerel taramaya da eklendi."))} />
    {analysis && <div className="fd-takeaways"><div><span>{tt("Övgüde öne çıkan konular")}</span><p>{analysis.aspects.filter(r => r.positive > r.negative).map(r => label(r.aspect)).join(" · ") || tt("Yeterli işaret yok")}</p></div><div><span>{tt("Eleştiride öne çıkan konular")}</span><p>{analysis.aspects.filter(r => r.negative > r.positive).map(r => label(r.aspect)).join(" · ") || tt("Yeterli işaret yok")}</p></div></div>}
    {fit.caution.length > 0 && <div className="fd-caution">{tt("Çekincelerine dokunan eleştiriler:")} {fit.caution.map(label).join(", ")}</div>}
    <details className="fd-section"><summary>{tt("Tercihlerim")} <span>{film.kind === "tv" ? tt("Diziler için") : tt("Filmler için")}</span></summary>
      <p>{tt("Film ve dizi tercihleri ayrı tutulur. Ağırlık 0 ise o konu kişisel sinyale katılmaz.")}</p>
      <div className="fd-preferences">{ASPECTS.map(a => <div key={a}><label htmlFor={uid + a}>{label(a)} <b>{profile.weights[a]}</b></label><input id={uid + a} type="range" min="0" max="5" step="1" value={profile.weights[a]} onChange={e => saveProfile({ ...profile, weights: { ...profile.weights, [a]: Number(e.target.value) } })}/><label className="fd-check"><input type="checkbox" checked={profile.avoid.includes(a)} onChange={e => saveProfile({ ...profile, avoid: e.target.checked ? [...profile.avoid, a] : profile.avoid.filter(x => x !== a) })}/>{tt("Eleştiriliyorsa uyar")}</label></div>)}</div>
    </details>
    <details className="fd-section" open={!analysis}><summary>{tt("Yorum ekle ve incele")}</summary>
      <label className="fd-input-label" htmlFor={uid + "reviews"}>{tt("Her yorumu boş satırla ayır. Yorumlar spoiler içerebilir.")}</label>
      <textarea id={uid + "reviews"} value={text} maxLength={120000} onChange={e => setText(e.target.value)} placeholder={tt("Kendi yorumlarını veya incelemek istediğin yorumları buraya ekle…")} rows={4}/>
      <div className="fd-actions"><button className="primary sm" disabled={!text.trim()} onClick={() => analyze(text)}>{tt("Yerel taramayı başlat")}</button><label className="fd-file">{tt("TXT / JSON içe aktar")}<input type="file" accept=".txt,.json,text/plain,application/json" onChange={async e => {
        const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
        const ticket = ++pending.current;
        if (file.size > 500000) { setStatus(tt("Dosya çok büyük. En fazla 500 KB seç.")); return; }
        try { const raw = await file.text(); if (mounted.current && ticket === pending.current) analyze(raw, /\.json$/i.test(file.name)); }
        catch { if (mounted.current && ticket === pending.current) setStatus(tt("Dosya okunamadı.")); }
      }}/></label></div>
      <p className="fd-hint">{tt("JSON örneği:")} <code>{'{"reviews":[{"text":"…","source":"Kendi notlarım"}]}'}</code></p>
    </details>
    {analysis && <div className="fd-results">
      <div className="fd-result-head"><h3>{tt("Yorumların söyledikleri")}</h3><label>{tt("Analiz geçmişi")}<select aria-label={tt("Analiz geçmişi")} value={Math.min(selected, work.history.length - 1)} onChange={e => setSelected(Number(e.target.value))}>{work.history.map((a, i) => <option key={a.id} value={i}>{new Date(a.at).toLocaleString(locale())} · {a.reviews.length}</option>)}</select></label></div>
      <p className="fd-hint">{tt("{0} benzersiz yorum · son 8 tarama saklanır", analysis.reviews.length)}{fit.score !== null && oldFit.score !== null && <> · {tt("Önceki taramaya göre: {0}", (fit.score - oldFit.score >= 0 ? "+" : "") + (fit.score - oldFit.score))}</>}</p>
      <div className="fd-aspects">{analysis.aspects.map(r => <details key={r.aspect} className="fd-aspect"><summary><span>{label(r.aspect)}</span><span className="fd-counts"><b>+{r.positive}</b><i>−{r.negative}</i><small>{tt("{0} belirsiz", r.evidence.length - r.positive - r.negative)}</small></span></summary>{r.evidence.length ? r.evidence.map(ev => <blockquote key={ev.review}><p>{ev.excerpt}</p><cite>{tt("Yorum {0}", ev.review + 1)}{analysis.reviews[ev.review].source && " · " + analysis.reviews[ev.review].source}</cite><details><summary>{tt("Yorumun tamamı · spoiler olabilir")}</summary><p>{analysis.reviews[ev.review].text}</p></details></blockquote>) : <p className="fd-hint">{tt("Bu konuda işaret bulunamadı.")}</p>}</details>)}</div>
    </div>}
    <details className="fd-section"><summary>{tt("İzleme sonrası notum")}</summary><div className="fd-reasons">{ASPECTS.map(a => <label key={a}><input type="checkbox" checked={reasons.includes(a)} onChange={e => setReasons(e.target.checked ? [...reasons, a] : reasons.filter(x => x !== a))}/>{label(a)}</label>)}</div>
      <label className="fd-input-label" htmlFor={uid + "note"}>{tt("Beni etkileyen veya uzaklaştıran gerekçeler")}</label><textarea id={uid + "note"} maxLength={2000} value={note} onChange={e => setNote(e.target.value)} rows={3}/>
      <div className="fd-actions"><button className={"fd-btn" + (work.feedback.vote === "like" ? " active" : "")} onClick={() => feedback("like")}>{tt("Beğendim · kaydet")}</button><button className={"fd-btn" + (work.feedback.vote === "dislike" ? " active" : "")} onClick={() => feedback("dislike")}>{tt("Beğenmedim · kaydet")}</button><button className="fd-btn" onClick={() => feedback("none")}>{tt("Nötr · kaydet")}</button></div>
      <p className="fd-hint">{tt("Beğenmediğin konular bu eserin çekince kartına yansır. Başka eserler için Tercihlerim bölümündeki uyarıları seç. Bu not Letterboxd'a veya izleme günlüğüne otomatik gönderilmez.")}</p>
      <label className="fd-input-label" htmlFor={uid + "draft"}>{tt("Yorum taslağım")}</label><textarea id={uid + "draft"} maxLength={6000} value={draft} onChange={e => setDraft(e.target.value)} rows={4}/><div className="fd-actions"><button className="fd-btn" disabled={!note.trim()} onClick={() => { if (draft.trim() && !confirm(tt("Mevcut taslağı notlarından yeniden oluşturmak istiyor musun?"))) return; setDraft(film.title + (film.year ? " (" + film.year + ")" : "") + "\n\n" + note.trim()); }}>{tt("Notlarımdan taslak oluştur")}</button><button className="fd-btn" onClick={() => { if (save({ ...cleanWorkspace(store.json(key, null)), draft })) setStatus(tt("Taslak kaydedildi.")); }}>{tt("Taslağı kaydet")}</button></div>
    </details>
    <div className="fd-footer"><button className="fd-btn" onClick={exportData}>{tt("Bu eserin analiz ve notlarını dışa aktar")}</button><button className="fd-btn" disabled={!work.history.length} onClick={() => { if (confirm(tt("Bu eserin analiz geçmişi silinsin mi? Notların ve tercihlerin korunur."))) { if (save({ ...cleanWorkspace(store.json(key, null)), history: [] })) setSelected(0); } }}>{tt("Analiz geçmişini temizle")}</button></div>
    <p className="fd-hint">{tt("Dışa aktarma, son kaydedilen notları içerir. Bu dosya tam Luna yedeğinden ayrıdır.")}</p>
    {status && <p className="fd-status" role="status">{status}</p>}
  </section>;
}
