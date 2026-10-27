import { useState } from "react";
import { diaryGet, diarySet, THUMB, THUMB_DOWN, type Vote } from "./Taste";
import { extraText } from "./Extras";
import { I, Icon } from "./Screens";
import { IMG } from "./library";
import "./AssistantFilmReview.css";

export type ReviewFilm = { title: string; year?: string; poster?: string | null };

/** Progress belongs to the message, so reopening a conversation resumes the same queue. */
export function AssistantFilmReview({ films, index, onAdvance }: {
  films: ReviewFilm[]; index: number; onAdvance: (index: number) => void;
}) {
  const film = films[index];
  if (!film) return <aside className="film-review complete" role="status">{extraText("Değerlendirme sırası tamamlandı", "Review queue completed")} · {films.length}/{films.length}</aside>;
  return <ReviewForm key={`${index}:${film.title}:${film.year}`} film={film} index={index} total={films.length} onAdvance={onAdvance} />;
}

function ReviewForm({ film, index, total, onAdvance }: { film: ReviewFilm; index: number; total: number; onAdvance: (index: number) => void }) {
  const previous = diaryGet(film.title, film.year);
  const [vote, setVote] = useState<Vote | undefined>(previous?.vote);
  const [rating, setRating] = useState<number | undefined>(previous?.rating);
  const [note, setNote] = useState(previous?.note ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = () => {
    if (saving) return;
    setSaving(true);
    try {
      const current = diaryGet(film.title, film.year);
      if (!diarySet(film.title, film.year, { vote, rating, note: note.trim() || undefined, watched: current?.watched ?? Date.now() })) throw new Error("Review could not be saved");
      onAdvance(index + 1);
    } catch {
      setError(extraText("Kaydedilemedi. Seçimlerin burada duruyor; yeniden dene.", "Could not save. Your selections are still here; try again."));
      setSaving(false);
    }
  };
  const poster = film.poster ? (/^https?:/.test(film.poster) ? film.poster : `${IMG}w185${film.poster}`) : null;
  return <aside className="film-review" aria-label={extraText("İzlediğin filmi değerlendir", "Review a watched film")}>
    <header><b>{extraText("İzlediğin filmler", "Watched films")}</b><span aria-live="polite">{index + 1}/{total}</span></header>
    <div className="film-review-title">{poster && <img src={poster} alt="" />}<div><strong>{film.title}</strong><span className="muted">{film.year}</span></div></div>
    <div className="film-review-votes">
      {(["like", "dislike"] as const).map(v => <button key={v} type="button" className={"chip" + (vote === v ? " on" : "")} aria-pressed={vote === v} onClick={() => setVote(vote === v ? undefined : v)}><Icon d={v === "like" ? THUMB : THUMB_DOWN} size={18} />{v === "like" ? extraText("Beğendim", "Liked it") : extraText("Beğenmedim", "Disliked it")}</button>)}
    </div>
    <fieldset><legend>{extraText("Puanın · 10 üzerinden", "Your rating · out of 10")}</legend><div className="film-review-scores">{Array.from({length:10}, (_, n) => n + 1).map(n => <button key={n} type="button" aria-label={`${n}/10`} aria-pressed={rating === n} className={rating === n ? "on" : ""} onClick={() => setRating(rating === n ? undefined : n)}>{n}</button>)}</div></fieldset>
    <label>{extraText("Notun (isteğe bağlı)", "Note (optional)")}<textarea rows={3} value={note} maxLength={12000} onChange={e => setNote(e.target.value)} /></label>
    {error && <p role="alert">{error}</p>}
    <footer><button type="button" className="chip" disabled={saving} onClick={() => onAdvance(index + 1)}>{extraText("Geç", "Skip")}</button><button type="button" className="btn primary" disabled={saving} onClick={submit}>{extraText("Gönder", "Submit")}<Icon d={I.right} size={16}/></button></footer>
  </aside>;
}
