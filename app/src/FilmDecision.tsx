
import { useEffect, useId, useRef, useState } from "react";
import { store } from "./library";
import { invoke } from "./nativeCore";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { tt, locale } from "./i18n";
import { ASPECTS, addAnalysis, cleanProfile, cleanWorkspace, filmKey, parseReviews, personalFit } from "./filmReviewModel";
import type { Aspect, FilmTarget, Mood, Workspace } from "./filmReviewModel";
import { ReviewAiCard } from "./FilmReviewAi";

import { useFilmDraft } from "./useFilmDraft";
import { ExtraModal, MediaNotebook, extraText } from "./Extras";
import "./FilmDecision.css";

const labels: Record<Aspect, string> = { story: "Hikâye", pace: "Tempo", acting: "Oyunculuk", visuals: "Görsellik", emotion: "Karakter ve duygu", sound: "Müzik ve ses" };
const label = (a: Aspect) => tt(labels[a]);
const profileKey = (f: FilmTarget) => "filmDecision:profile:" + (f.kind === "tv" ? "tv" : "movie");
type NotebookContext={path:string;title:string;time:number;seek:(seconds:number,path:string)=>void};
export function openFilmNotebook(film:FilmTarget) { window.dispatchEvent(new CustomEvent("luna-film-notebook",{detail:{key:filmKey(film)}})); }
export function FilmDecisionPanel({ film,notebook }: { film: FilmTarget;notebook?:NotebookContext }) {
  return <DecisionWorkspace key={filmKey(film)} film={film} notebook={notebook} />;
}
function DecisionWorkspace({ film,notebook }: { film: FilmTarget;notebook?:NotebookContext }) {
  const key = "filmDecision:work:" + filmKey(film), pk = profileKey(film), uid = useId();
  const [work, setWork] = useState(() => cleanWorkspace(store.json(key, null)));
  const [profile, setProfile] = useState(() => cleanProfile(store.json(pk, null)));
  const [mood, setMood] = useState<Mood>("any"), [text, setText] = useState("");
  const [selected, setSelected] = useState(0), [status, setStatus] = useState("");
  const [note, setNote] = useState(work.feedback.note), [draft, setDraft] = useState(work.draft);
  const [reasons, setReasons] = useState<Aspect[]>(work.feedback.reasons);
  const draftState = useFilmDraft("filmDecision:recovery:" + filmKey(film), { note, draft, reasons }, { note: work.feedback.note, draft: work.draft, reasons: work.feedback.reasons });
  const pending = useRef(0), mounted = useRef(false);
  const [diaryOpen,setDiaryOpen]=useState(false),[diaryTab,setDiaryTab]=useState<"thoughts"|"scenes"|"draft">("thoughts");

  const [scanOpen,setScanOpen]=useState(false);
  useEffect(()=>{const show=()=>{setScanOpen(true);};window.addEventListener("luna-local-reviews",show);return()=>window.removeEventListener("luna-local-reviews",show);},[]);
  useEffect(()=>{const open=(event:Event)=>{const detail=(event as CustomEvent<{path?:string;key?:string}>).detail;if(!detail || !(detail.key===filmKey(film) || (notebook && detail.path===notebook.path)))return;setDiaryOpen(true);setDiaryTab(notebook?"scenes":"thoughts");};window.addEventListener("luna-film-notebook",open);return()=>window.removeEventListener("luna-film-notebook",open);},[notebook?.path,film]);
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
    if (save({ ...latest, feedback: { vote:vote===latest.feedback.vote?"none":vote, reasons, note } })) setStatus(tt("Bu eser için geri bildirimin kaydedildi."));
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
  return <section className="la" aria-label={tt("Luna Analiz")}>
    <ReviewAiCard film={film} profile={learnedProfile} mood={mood} setMood={setMood} label={label} onReviews={(json) => analyze(json, true, tt("Letterboxd yorumları yerel taramaya da eklendi."))} />


    {diaryOpen&&<ExtraModal title={extraText("Film defterim","My film notebook")} close={()=>setDiaryOpen(false)} className="workspace-modal"><div className="film-diary la">
      <div className="film-diary-tabs" role="tablist" aria-label={extraText("Film defteri bölümleri","Film notebook sections")}>{([["thoughts",extraText("Düşüncelerim","My thoughts")],...(notebook?[["scenes",extraText("Sahneler ve alıntılar","Scenes and quotes")]]:[]),["draft",tt("Yorum taslağım")]] as ["thoughts"|"scenes"|"draft",string][]).map(([tab,label])=><button key={tab} id={uid+tab+"-tab"} className={"chip"+(diaryTab===tab?" on":"")} role="tab" aria-selected={diaryTab===tab} aria-controls={uid+tab+"-panel"} onClick={()=>setDiaryTab(tab)}>{label}</button>)}</div>
      {draftState.recovery && <div className="la-draft-recovery" role="status"><div><b>{extraText("Yarım kalan notların var", "You have unfinished notes")}</b><small>{extraText("Kayıtlı yorumun değişmedi. Taslağı geri getirebilir veya silebilirsin.", "Your saved review is unchanged. Restore or discard the draft.")}</small></div><button className="chip" onClick={() => { const row=draftState.recover(); if(row){setNote(row.note);setDraft(row.draft);setReasons(row.reasons);} }}>{extraText("Taslağı geri getir", "Restore draft")}</button><button className="chip" onClick={() => { if(confirm(extraText("Yarım kalan kurtarma taslağı silinsin mi?", "Discard the unfinished recovery draft?"))) draftState.discard(); }}>{extraText("Taslağı sil", "Discard draft")}</button></div>}
      <fieldset className="la-note-fields" disabled={!!draftState.recovery}>
      <div role="tabpanel" id={uid+"thoughts-panel"} aria-labelledby={uid+"thoughts-tab"} hidden={diaryTab!=="thoughts"}>
      <p className="la-muted">{tt("Seni etkileyen ya da uzaklaştıran konuları işaretle: Zevklerim bunları kullanır. Bu not Letterboxd'a veya izleme günlüğüne gönderilmez.")}</p>
      <div className="la-reasons">{ASPECTS.map((a) => <button key={a} className={"seg" + (reasons.includes(a) ? " on" : "")} aria-pressed={reasons.includes(a)} onClick={() => setReasons(reasons.includes(a) ? reasons.filter((x) => x !== a) : [...reasons, a])}>{label(a)}</button>)}</div>
      <label className="la-label" htmlFor={uid + "note"}>{tt("Beni etkileyen veya uzaklaştıran gerekçeler")}</label>
      <textarea id={uid + "note"} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder={tt("ör. sonu çok etkileyiciydi, ikinci yarısı yavaş")} />
      <div className="la-actions">
        <button className={"chip" + (work.feedback.vote === "like" ? " on" : "")} onClick={() => feedback("like")} aria-pressed={work.feedback.vote==="like"}><VoteIcon/> {tt("Beğendim · kaydet")}</button>
        <button className={"chip" + (work.feedback.vote === "dislike" ? " on" : "")} onClick={() => feedback("dislike")} aria-pressed={work.feedback.vote==="dislike"}><VoteIcon down/> {tt("Beğenmedim · kaydet")}</button>
        <button className="chip" onClick={() => feedback("none")}>{tt("Nötr · kaydet")}</button>
      </div>
      </div>
      <div role="tabpanel" id={uid+"draft-panel"} aria-labelledby={uid+"draft-tab"} hidden={diaryTab!=="draft"}>
      <label className="la-label" htmlFor={uid + "draft"}>{tt("Yorum taslağım")}</label>
      <textarea id={uid + "draft"} maxLength={6000} value={draft} onChange={(e) => setDraft(e.target.value)} rows={4} />
      <div className="la-actions">
        <button className="chip" disabled={!note.trim()} onClick={() => { if (draft.trim() && !confirm(tt("Mevcut taslağı notlarından yeniden oluşturmak istiyor musun?"))) return; setDraft(film.title + (film.year ? " (" + film.year + ")" : "") + "\n\n" + note.trim()); }}>{tt("Notlarımdan taslak oluştur")}</button>
        <button className="chip" onClick={() => { if (save({ ...cleanWorkspace(store.json(key, null)), draft })) setStatus(tt("Taslak kaydedildi.")); }}>{tt("Taslağı kaydet")}</button>
        <button className="chip" disabled={!draftState.dirty} onClick={() => { const latest=cleanWorkspace(store.json(key,null));if(save({...latest,draft,feedback:{...latest.feedback,note,reasons}}))setStatus(extraText("Notların ve yorum taslağın kaydedildi. Beğeni durumun korunuyor.","Notes and review draft saved. Your like or dislike is unchanged.")); }}>{extraText("Bütün notlarımı kaydet", "Save all my notes")}</button>
      </div>
      </div>
      <p className="la-draft-state" role="status">{draftState.dirty?extraText("Kaydedilmemiş değişiklikler", "Unsaved changes"):extraText("Notların güncel", "Notes are up to date")}{draftState.status?" · "+draftState.status:""}</p>
      {draftState.retryable && <button className="chip" onClick={draftState.retry}>{extraText("Kurtarma kaydını yeniden dene", "Retry recovery save")}</button>}
      </fieldset>
      {notebook&&<div role="tabpanel" id={uid+"scenes-panel"} aria-labelledby={uid+"scenes-tab"} hidden={diaryTab!=="scenes"}><MediaNotebook key={notebook.path} embedded {...notebook} subtitle=""/></div>}
    <div className="la-actions -foot">
      <button className="chip" onClick={exportData}>{tt("Bu eserin analiz ve notlarını dışa aktar")}</button>
      <button className="chip" disabled={!work.history.length} onClick={() => { if (confirm(tt("Bu eserin analiz geçmişi silinsin mi? Notların ve tercihlerin korunur."))) { if (save({ ...cleanWorkspace(store.json(key, null)), history: [] })) setSelected(0); } }}>{tt("Analiz geçmişini temizle")}</button>
      <span className="la-muted">{tt("Yerel · özel. Dışa aktarma, son kaydedilen notları içerir; tam Luna yedeğinden ayrıdır.")}</span>
    </div>
    {status&&<p role="status">{status}</p>}
    </div></ExtraModal>}

    {scanOpen&&<ExtraModal title={extraText("Yorumları internetsiz tara","Scan reviews offline")} close={()=>setScanOpen(false)} className="workspace-modal"><div className="la local-review-scan">

      <p className="la-muted">{tt("Bu bir yapay zekâ değerlendirmesi değil; Türkçe ve İngilizce anahtar sözcük taraması. İroniyi ve bağlamı kaçırabilir. Sinyal, film puanı veya beğenme olasılığı değildir. En az iki konuda açık işaret yoksa hesaplanmaz.")}</p>
      <div className="la-scores -small">
        <div className="la-score"><span>{tt("Kişisel yorum sinyali")}</span><strong>{fit.score === null ? "—" : fit.score}<small>{fit.score === null ? "" : "/100"}</small></strong><em className="-plain">{tt("Açık işaret bulunan konu: {0}", fit.covered)}</em></div>
      </div>
      {analysis && <div className="la-cols">
        <div><h3>{tt("Övgüde öne çıkan konular")}</h3><p>{analysis.aspects.filter((r) => r.positive > r.negative).map((r) => label(r.aspect)).join(" · ") || tt("Yeterli işaret yok")}</p></div>
        <div><h3>{tt("Eleştiride öne çıkan konular")}</h3><p>{analysis.aspects.filter((r) => r.negative > r.positive).map((r) => label(r.aspect)).join(" · ") || tt("Yeterli işaret yok")}</p></div>
      </div>}
      {fit.caution.length > 0 && <p className="la-caution">{tt("Çekincelerine dokunan eleştiriler:")} {fit.caution.map(label).join(", ")}</p>}
      <label className="la-label" htmlFor={uid + "reviews"}>{tt("Her yorumu boş satırla ayır. Yorumlar spoiler içerebilir.")}</label>
      <textarea id={uid + "reviews"} value={text} maxLength={120000} onChange={(e) => setText(e.target.value)} placeholder={tt("Kendi yorumlarını veya incelemek istediğin yorumları buraya ekle…")} rows={4} />
      <div className="la-actions">
        <button className="chip" disabled={!text.trim()} onClick={() => analyze(text)}>{tt("Yerel taramayı başlat")}</button>
        <label className="chip la-file">{tt("TXT / JSON içe aktar")}<input type="file" accept=".txt,.json,text/plain,application/json" onChange={async (e) => {
          const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
          const ticket = ++pending.current;
          if (file.size > 500000) { setStatus(tt("Dosya çok büyük. En fazla 500 KB seç.")); return; }
          try { const raw = await file.text(); if (mounted.current && ticket === pending.current) analyze(raw, /\.json$/i.test(file.name)); }
          catch { if (mounted.current && ticket === pending.current) setStatus(tt("Dosya okunamadı.")); }
        }} /></label>
      </div>
      <p className="la-muted">{tt("JSON örneği:")} <code>{'{"reviews":[{"text":"…","source":"Kendi notlarım"}]}'}</code></p>
      {analysis && <div className="la-local">
        <div className="la-local-head"><h3>{tt("Yorumların söyledikleri")}</h3><select aria-label={tt("Analiz geçmişi")} value={Math.min(selected, work.history.length - 1)} onChange={(e) => setSelected(Number(e.target.value))}>{work.history.map((a, i) => <option key={a.id} value={i}>{new Date(a.at).toLocaleString(locale())} · {a.reviews.length}</option>)}</select></div>
        <p className="la-muted">{tt("{0} benzersiz yorum · son 8 tarama saklanır", analysis.reviews.length)}{fit.score !== null && oldFit.score !== null && <> · {tt("Önceki taramaya göre: {0}", (fit.score - oldFit.score >= 0 ? "+" : "") + (fit.score - oldFit.score))}</>}</p>
        {analysis.aspects.map((r) => <details key={r.aspect} className="la-kw"><summary><span>{label(r.aspect)}</span><span className="la-kw-n"><b>+{r.positive}</b><i>−{r.negative}</i><small>{tt("{0} belirsiz", r.evidence.length - r.positive - r.negative)}</small></span></summary>
          {r.evidence.length ? r.evidence.map((ev) => <blockquote key={ev.review}><p>{ev.excerpt}</p><cite>{tt("Yorum {0}", ev.review + 1)}{analysis.reviews[ev.review].source && " · " + analysis.reviews[ev.review].source}</cite><details><summary>{tt("Yorumun tamamı · spoiler olabilir")}</summary><p>{analysis.reviews[ev.review].text}</p></details></blockquote>) : <p className="la-muted">{tt("Bu konuda işaret bulunamadı.")}</p>}
        </details>)}
      </div>}
    </div></ExtraModal>}

  </section>;
}

function VoteIcon({down=false}:{down?:boolean}){return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" style={down?{transform:"rotate(180deg)"}:undefined} aria-hidden="true"><path d="M7 10v11H3V10h4Zm0 0 5-8c3 0 3 3 1 7h6a2 2 0 0 1 2 2l-2 8a2 2 0 0 1-2 2H7"/></svg>;}
