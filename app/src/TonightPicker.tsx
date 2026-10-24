import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { tt, lang } from "./i18n";
import { IMG, isFinished, isRemote, Item, Recent, store } from "./library";
import { Candidate, Mood, Pick, pickTonight, Reason } from "./tonightModel";
import {diaryGet,loadLater,markLater} from "./Taste";
import {TasteQuiz} from "./TasteQuiz";
import {outsideLibrary,outsideTonightPool} from "./tonightPool";
import {extraText} from "./Extras";
import { useTint } from "./posterTint";
import { openPanel } from "./paletteExtras";

const TonightDetail=lazy(()=>import("./TasteUI").then(m=>({default:m.TitleDetail})));
const SHOWN="tonightShown";
const candidateId=(c:Candidate)=>c.kind+":"+(c.tmdbId??c.key);
function shownHistory():Record<string,number>{const raw=store.get(SHOWN);if(raw===null)return {};const data=JSON.parse(raw);if(!data||typeof data!=="object"||Array.isArray(data)||Object.values(data).some(x=>typeof x!=="number"||!Number.isFinite(x)))throw Error(extraText("Öneri geçmişi okunamadı; mevcut kayıt korundu.","Suggestion history could not be read; existing records were preserved."));return data;}
const laterLabel=(c:Candidate)=>c.title+(c.year?" ("+c.year+")":"");
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
      out.push({ key: it.key, year:m.year,tmdbId:m.id,title: m.title, kind: "tv", runtime: m.runtime && m.runtime < 120 ? m.runtime : 45, genres: m.genres, rating: m.rating, poster: m.poster, backdrop: m.backdrop, path: next.path, episode: next.season != null ? `S${next.season}·B${next.episode ?? "?"}` : undefined, order });
    } else {
      if (local.some((f) => isFinished(f.path) || (progress.get(f.path) ?? 0) > 0.9)) return;
      out.push({ key: it.key, year:m.year,tmdbId:m.id,title: m.title, kind: "movie", runtime: m.runtime ?? 0, genres: m.genres, rating: m.rating, poster: m.poster, backdrop: m.backdrop, path: local[0].path, order });
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
  const localCandidates = useMemo(() => tonightCandidates(items, recent), [items, recent]);
  const [quiz,setQuiz]=useState(false);
  const known=useMemo(()=>new Set(items.filter(it=>(it.meta?.kind??it.parsed.kind)!=="tv").map(it=>it.meta?.id).filter((id):id is number=>typeof id==="number"&&id>0)),[items]);
  const [libraryOnly,setLibraryOnly]=useState(true),[external,setExternal]=useState<Candidate[]>([]),[loading,setLoading]=useState(false),[loadError,setLoadError]=useState(""),[detail,setDetail]=useState<Candidate|null>(null);
  const cands=useMemo(()=>libraryOnly?localCandidates:external,[libraryOnly,localCandidates,external]);
  const [minutes, setMinutes] = useState(130);
  const [mood, setMood] = useState<Mood>("any");
  const [res, setRes] = useState<Pick | null | "none">(null);
  const [rolling, setRolling] = useState<string | null>(null);
  const [only, setOnly] = useState(false);
  const page=useRef(1),generation=useRef(0);
  const [choosing,setChoosing]=useState(false),[saveMessage,setSaveMessage]=useState("");
  const [,refreshSaved]=useState(0);
  const timer = useRef(0);
  useEffect(() => () => {clearInterval(timer.current);generation.current++;}, []);
  const pick = useMemo(() => (res && res !== "none" ? res.pick : null), [res]);
  const tint = useTint(pick?.poster ? IMG + "w92" + pick.poster : null);
  useEffect(()=>{clearInterval(timer.current);setRolling(null);setRes(null);generation.current++;setChoosing(false);setSaveMessage("");},[libraryOnly]);
  useEffect(()=>{if(libraryOnly)return;page.current=1;generation.current++;setChoosing(false);clearInterval(timer.current);setRolling(null);setRes(null);let alive=true;setLoading(true);setLoadError("");
    void outsideTonightPool(minutes,mood).then(rows=>{if(alive)setExternal(outsideLibrary(rows,known));}).catch(e=>{if(alive){setExternal([]);setLoadError(String(e));}}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;};
  },[libraryOnly,minutes,mood,known]);
  useEffect(()=>{generation.current++;clearInterval(timer.current);setRolling(null);setRes(null);setChoosing(false);setSaveMessage("");},[minutes,mood]);
  const showDetails=(c:Candidate)=>{if(c.key.startsWith("external:"))setDetail(c);else onDetails(c.key);};

  const saveLater=()=>{if(!pick)return;try{const label=laterLabel(pick);markLater(label,true);if(!loadLater().includes(label))throw Error(extraText("Daha sonrası için kaydedilemedi.","Could not save for later."));refreshSaved(n=>n+1);setSaveMessage(extraText("Sonra izle listene kaydedildi.","Saved to your watch later list."));}catch(e){setSaveMessage(String(e));}};
  const roll = async () => {
    if(choosing||loading||rolling)return;
    clearInterval(timer.current);const gen=++generation.current;setChoosing(true);setLoadError("");setSaveMessage("");
    try{
      const history=shownHistory(),seed=Date.now()%100000;
      let rows=cands;
      const eligible=()=>rows.filter(c=>!history[candidateId(c)]&&!diaryGet(c.title,c.year)?.watched);
      let r=pickTonight(eligible(),{minutes,mood,seed});
      for(let attempt=0;!r&&!libraryOnly&&attempt<3&&page.current<500;attempt++){
        const more=outsideLibrary(await outsideTonightPool(minutes,mood,++page.current),known);
        if(gen!==generation.current)return;
        rows=[...new Map([...rows,...more].map(c=>[candidateId(c),c])).values()];
        r=pickTonight(eligible(),{minutes,mood,seed});
      }
      if(gen!==generation.current)return;
      if(!libraryOnly)setExternal(rows);
      if(!r){setRes("none");return;}
      const shown=[r.pick,...r.others];for(const c of shown)history[candidateId(c)]=Date.now();
      if(!store.set(SHOWN,JSON.stringify(history)))throw Error(extraText("Öneri geçmişi kaydedilemedi; tekrar önermemek için seçim durduruldu.","Suggestion history could not be saved. Selection stopped to prevent repeats."));
      setOnly(false);
      const pool=shown.filter(c=>c.poster).map(c=>IMG+"w185"+c.poster);
      if(!pool.length||matchMedia("(prefers-reduced-motion: reduce)").matches){setRes(r);return;}
      let n=0;const selected=r;setRes(null);
      timer.current=window.setInterval(()=>{setRolling(pool[(n*7+seed)%pool.length]);if(++n>9){clearInterval(timer.current);setRolling(null);if(gen===generation.current)setRes(selected);}},110);
    }catch(e){if(gen===generation.current)setLoadError(String(e));}finally{if(gen===generation.current)setChoosing(false);}
  };
  return (
    <><section className={"tn glass" + (tint ? " tinted" : "")} style={tint ? ({ "--tn-rgb": tint } as React.CSSProperties) : undefined}>
      <div className="tn-ask">
        <div className="tn-head">
          <h2>{tt("Bu akşam ne izlesem?")}</h2>
          <div className="tn-head-actions"><button className="tn-recap" onClick={()=>setQuiz(true)}>{extraText("Zevk testi","Taste quiz")} ›</button><button className="tn-recap" onClick={() => openPanel("lines")} title={tt("Replik ara")}>{tt("Replik ara")} ›</button>
          <button className="tn-recap" onClick={() => openPanel("recap")} title={tt("Luna Özet")}>{tt("Luna Özet")} ›</button></div>
        </div>
        <p className="tn-sub">{libraryOnly?tt("Kütüphanende bekleyenlerden, vaktine ve ruh haline göre."):extraText("Yalnız kütüphanen dışındaki filmlerden, vaktine ve ruh haline göre.","Only films outside your library, for your time and mood.")}</p><div className="tn-status" role="status">{loading||choosing?extraText("Öneriler yükleniyor…","Loading suggestions…"):loadError||saveMessage}</div>
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
        <div className="tn-pick-controls"><button className="tn-go" onClick={()=>void roll()} disabled={!!rolling||loading||choosing}>{res && res !== "none" ? tt("Başka bir tane") : tt("Benim için seç")}</button><div className={"tn-scope"+(libraryOnly?"":" outside")} role="group" aria-label={extraText("Öneri kapsamı","Suggestion scope")}><span aria-hidden="true"/>{([true,false] as const).map(local=><button key={String(local)} aria-pressed={libraryOnly===local} onClick={()=>setLibraryOnly(local)}>{local?extraText("Kütüphanede","In library"):extraText("Dışarıdan","Outside library")}</button>)}</div></div>
      </div>
      <div className="tn-out" aria-live="polite">
        {rolling && <div className="tn-roll"><img src={rolling} alt="" /></div>}
        {!rolling && res === null && (
          <div className="tn-fan" aria-hidden="true">
            {cands.filter((c) => c.poster).slice(0, 3).map((c, i) => <img key={c.key} src={IMG + "w185" + c.poster} alt="" style={{ "--i": i } as React.CSSProperties} />)}
          </div>
        )}
        {!rolling && res === "none" && <p className="tn-none">{extraText("Bu tercihlerde henüz göstermediğim film kalmadı. Süreyi veya ruh halini değiştirebilir, dış önerilerde yeniden aratabilirsin.","No unseen suggestions remain for these preferences. Change your time or mood, or search outside suggestions again.")}</p>}
        {!rolling && pick && res && res !== "none" && (
          <div className="tn-result" key={pick.key}>
            {pick.poster ? <img className="tn-poster" src={IMG + "w342" + pick.poster} alt="" /> : <div className="tn-poster blank" />}
            <div className="tn-info">
              <h3>{pick.title}</h3>
              <div className="tn-reasons">{res.reasons.map((r, i) => <span key={i} className="tn-reason">{reasonText(r)}</span>)}</div>
              {only && <p className="tn-only">{tt("Bu süreye ve ruh haline uyan tek seçenek bu.")}</p>}
              <div className="tn-acts">
                {pick.path&&<button className="primary" onClick={() => onPlay(pick.path)}>{pick.kind === "tv" ? tt("Bölümü oynat") : tt("Oynat")}</button>}
                <button className="chip" onClick={() => showDetails(pick)}>{tt("Ayrıntılar")}</button>
                <button className="chip" disabled={loadLater().includes(laterLabel(pick))} onClick={saveLater}>{loadLater().includes(laterLabel(pick))?extraText("Kaydedildi","Saved"):extraText("Sonra izle","Watch later")}</button>
              </div>
              {res.others.length > 0 && (
                <div className="tn-others"><span>{tt("Ya da:")}</span>{res.others.map((o) => <button key={o.key} className="tn-other" onClick={() => showDetails(o)} title={o.title}>{o.poster ? <img src={IMG + "w92" + o.poster} alt="" /> : null}<span>{o.title}</span></button>)}</div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>{quiz&&<TasteQuiz local={localCandidates} known={known} minutes={minutes} libraryOnly={libraryOnly} close={()=>setQuiz(false)} onDetails={showDetails}/>} {detail&&<Suspense fallback={null}><TonightDetail t={{title:detail.title,tmdbId:Number(detail.key.slice(9)),kind:detail.kind}} items={items} onClose={()=>setDetail(null)}/></Suspense>}</>
  );
}
