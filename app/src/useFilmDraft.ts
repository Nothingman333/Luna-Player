import {appStorage as localStorage} from "./appStorage";
import { useEffect, useRef, useState } from "react";
import { readFilmDraft, filmDraftEqual, type FilmDraft } from "./filmDraftModel";
import { extraText as t } from "./Extras";

/** Separate recovery data: typing never changes the saved review or the user's vote. */
export function useFilmDraft(key: string, value: FilmDraft, saved: FilmDraft) {
  const [initial] = useState(() => {
    try {
      const raw = localStorage.getItem(key), draft = raw === null ? null : readFilmDraft(JSON.parse(raw));
      return { raw, draft: draft && !filmDraftEqual(draft, saved) ? draft : null, blocked: raw !== null && !draft };
    } catch { return { raw: null, draft: null, blocked: true }; }
  });
  const [recovery, setRecovery] = useState(initial.draft), [status, setStatus] = useState(""), [retryable, setRetryable] = useState(false);
  const latest = useRef({ value, saved, recovery }); latest.current = { value, saved, recovery };
  const expected = useRef(initial.raw), alive = useRef(true), blocked = useRef(initial.blocked);
  const persist = () => {
    if (blocked.current || latest.current.recovery) return;
    try {
      if (localStorage.getItem(key) !== expected.current) { blocked.current = true; throw Error(t("Taslak başka bir pencerede değişti; üzerine yazılmadı.", "The draft changed in another window and was not overwritten.")); }
      if (filmDraftEqual(latest.current.value, latest.current.saved)) {
        if (expected.current !== null) { localStorage.removeItem(key); expected.current = null; }
        if (alive.current) { setStatus(""); setRetryable(false); }
        return;
      }
      const row = { version: 1 as const, at: Date.now(), ...latest.current.value };
      if (!readFilmDraft(row)) throw Error(t("Taslak kaydedilemedi; metnini kopyalayarak koru.", "Draft could not be saved; copy your text to keep it."));
      const previous = expected.current ? readFilmDraft(JSON.parse(expected.current)) : null;
      if (!previous || !filmDraftEqual(previous, row)) {
        const raw = JSON.stringify(row); localStorage.setItem(key, raw); expected.current = raw;
      }
      if (alive.current) { setRetryable(false); setStatus(t("Kurtarma taslağı bu cihazda saklandı.", "A recovery draft was saved on this device.")); }
    } catch (e) { if (alive.current) { setRetryable(!blocked.current); setStatus(String(e).replace(/^Error: /, "")); } }
  };
  const persistRef = useRef(persist); persistRef.current = persist;
  useEffect(() => { const timer = setTimeout(() => persistRef.current(), 450); return () => clearTimeout(timer); }, [value.note, value.draft, value.reasons.join(","), saved.note, saved.draft, saved.reasons.join(","), recovery]);
  useEffect(() => {
    alive.current = true;
    const hide = () => persistRef.current(); window.addEventListener("pagehide", hide);
    return () => { alive.current = false; persistRef.current(); window.removeEventListener("pagehide", hide); };
  }, [key]);
  const recover = () => { const row = recovery; setRecovery(null); return row; };
  const discard = () => {
    try {
      if (localStorage.getItem(key) !== expected.current) throw Error(t("Taslak değişti; pencereyi yeniden aç.", "Draft changed; reopen this window."));
      localStorage.removeItem(key); expected.current = null; setRecovery(null);
    } catch (e) { setStatus(String(e)); }
  };
  return { recovery, recover, discard, retry: () => persistRef.current(), retryable, status: initial.blocked ? t("Kurtarma kaydı okunamadı; özgün kayıt korunuyor. Yazdığın metni kaydet veya kopyala.", "The recovery record could not be read and was kept. Save or copy the text you type.") : status, dirty: !filmDraftEqual(value, saved) };
}
