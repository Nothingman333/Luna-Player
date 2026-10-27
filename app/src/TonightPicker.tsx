import {resolveTonightCandidates} from "./tonightResolve";
import {TonightMetadata} from "./TonightMetadata";
import {FriendAvatar} from "./FriendProfile";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { tt, lang } from "./i18n";
import { details,searchTmdb,IMG, isFinished, isRemote, Item, Recent, store } from "./library";
import { Candidate, Mood, Pick, pickTonight, Reason } from "./tonightModel";
import {diaryGet,loadLater,markLater,TasteButtons} from "./Taste";
import {TasteQuiz} from "./TasteQuiz";
import {outsideLibrary,outsideTonightPool} from "./tonightPool";
import {extraText,ExtraModal} from "./Extras";
import {friendPool} from "./tonightFriends";
import {loadPlaylists,loadRecs,useTaste} from "./Taste";
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
export function tonightCandidates(items: Item[], recent: Recent[], includeFinished=false): Candidate[] {
  const progress = new Map(recent.map((r) => [r.path, r.duration > 0 ? r.time / r.duration : 0]));
  const out: Candidate[] = [];
  items.forEach((it, order) => {
    const m = it.meta;
    if (!m || m.id <= 0 || !it.files.length) return;
    const local = it.files.filter((f) => !isRemote(f.path));
    if (!local.length) return;
    if ((m.kind ?? it.parsed.kind) === "tv") {
      const next = local.find((f) => !isFinished(f.path) && (progress.get(f.path) ?? 0) < 0.9) ?? (includeFinished ? local[0] : undefined);
      const started = local.some((f) => isFinished(f.path) || (progress.get(f.path) ?? 0) > 0.05);
      if (!next || (!started && !includeFinished)) return;
      out.push({ key: it.key, year:m.year,tmdbId:m.id,title: m.title, kind: "tv", runtime: m.runtime && m.runtime < 120 ? m.runtime : 45, genres: m.genres, rating: m.rating, poster: m.poster, backdrop: m.backdrop, path: next.path, episode: next.season != null ? `S${next.season}·B${next.episode ?? "?"}` : undefined, order });
    } else {
      if (!includeFinished && local.some((f) => isFinished(f.path) || (progress.get(f.path) ?? 0) > 0.9)) return;
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
export function TonightPicker({ items, recent, onPlay, onDetails, onAsk }: { items: Item[]; recent: Recent[]; onPlay: (path: string) => void; onDetails: (key: string) => void;onAsk?:(it:Item)=>void }) {
  const localCandidates = useMemo(() => tonightCandidates(items, recent), [items, recent]);
  const [quiz,setQuiz]=useState(false);
  const known=useMemo(()=>new Set(items.filter(it=>(it.meta?.kind??it.parsed.kind)!=="tv").map(it=>it.meta?.id).filter((id):id is number=>typeof id==="number"&&id>0)),[items]);
  const [source,setSource]=useState<"library"|"outside"|"friends">("library");
  const libraryOnly=source==="library";
  const {version:tasteVersion}=useTaste();
  const [friendSettings,setFriendSettings]=useState(false);
  const [selectedFriends,setSelectedFriends]=useState<string[]|null>(()=>{const saved=store.json<unknown>("tonightFriends",null);return Array.isArray(saved)&&saved.every(n=>typeof n==="string")?saved:null;});
  const friends=useMemo(()=>friendPool(items,loadRecs(),loadPlaylists(),selectedFriends),[items,tasteVersion,selectedFriends]);
  const allLocal=useMemo(()=>tonightCandidates(items,recent,true),[items,recent]);
  const [fallback,setFallback]=useState(false);
  const cycle=useRef(Number(store.get("tonightLibraryCycleAt"))||0);
  const [external,setExternal]=useState<Candidate[]>([]),[loading,setLoading]=useState(false),[loadError,setLoadError]=useState(""),[detail,setDetail]=useState<Candidate|null>(null);
  const cands=useMemo(()=>source==="library"?localCandidates:source==="friends"?friends.candidates:external,[source,localCandidates,friends,external]);
  const [minutes, setMinutes] = useState(130);
  const [mood, setMood] = useState<Mood>("any");
  const [res, setRes] = useState<Pick | null | "none">(null);
  const[resultNotes,setResultNotes]=useState<(typeof friends.candidates)[number]["friendNotes"]>([]);
  const [only, setOnly] = useState(false);
  const page=useRef(1),generation=useRef(0),friendCursor=useRef(0);
  const [choosing,setChoosing]=useState(false),[saveMessage,setSaveMessage]=useState("");
  const [,refreshSaved]=useState(0);
  useEffect(() => () => {generation.current++;}, []);
  const pick = useMemo(() => (res && res !== "none" ? res.pick : null), [res]);
  const pickedItem=useMemo<Item|null>(()=>pick?(items.find(it=>it.key===pick.key||!!pick.tmdbId&&it.meta?.id===pick.tmdbId&&it.meta.kind===pick.kind)??{key:pick.key,parsed:{title:pick.title,kind:pick.kind},files:[],meta:{id:pick.tmdbId??0,kind:pick.kind,title:pick.title,year:pick.year??"",overview:"",runtime:pick.runtime,genres:pick.genres,rating:pick.rating,poster:pick.poster,backdrop:pick.backdrop,cast:[]}}):null,[pick,items]);
  const tint = useTint(pick?.poster ? IMG + "w92" + pick.poster : null);
  useEffect(()=>{generation.current++;setChoosing(false);setSaveMessage("");},[source,selectedFriends]);
  useEffect(()=>{if(source!=="outside"){setLoading(false);return;}page.current=1;generation.current++;setChoosing(false);let alive=true;setLoading(true);setLoadError("");
    void outsideTonightPool(minutes,mood).then(rows=>{if(alive)setExternal(outsideLibrary(rows,known));}).catch(e=>{if(alive){setExternal([]);setLoadError(String(e));}}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;};
  },[source,minutes,mood,known]);
  useEffect(()=>{generation.current++;setChoosing(false);setSaveMessage("");},[minutes,mood]);
  const showDetails=(c:Candidate)=>{const local=items.find(it=>it.key===c.key||!!c.path&&it.files.some(f=>f.path===c.path));if(local)onDetails(local.key);else setDetail(c);};

  const saveLater=()=>{if(!pick)return;try{const label=laterLabel(pick);markLater(label,true);if(!loadLater().includes(label))throw Error(extraText("Daha sonrası için kaydedilemedi.","Could not save for later."));refreshSaved(n=>n+1);setSaveMessage(extraText("Sonra izle listene kaydedildi.","Saved to your watch later list."));}catch(e){setSaveMessage(String(e));}};
  const roll = async () => {
    if(choosing||loading)return;
    const gen=++generation.current;setChoosing(true);setLoadError("");setSaveMessage("");
    try{
      const history=shownHistory(),seed=Date.now()%100000;
      let rows=cands;
      const eligible=()=>rows.filter(c=>(source!=="friends"||minutes===0||c.runtime>0)&&(!history[candidateId(c)]||Date.now()-history[candidateId(c)]>=8*60*60*1000)&&!diaryGet(c.title,c.year)?.watched);
      if(source==="friends"){
        const resolved=await resolveTonightCandidates(rows,{
          read:c=>store.json<import("./library").Meta|null>("tonightFriendMeta:"+c.kind+":"+(c.tmdbId??c.title+":"+c.year),null),
          load:async c=>{let id=c.tmdbId;if(!id){const hits=await searchTmdb(c.title,c.kind,c.year?Number(c.year):undefined);id=hits.find(h=>!c.year||h.year===c.year)?.id;}if(!id)return null;const metadata=await details(c.kind,id);store.set("tonightFriendMeta:"+c.kind+":"+(c.tmdbId??c.title+":"+c.year),JSON.stringify(metadata));return metadata;},
          accepts:c=>(!history[candidateId(c)]||Date.now()-history[candidateId(c)]>=8*60*60*1000)&&!diaryGet(c.title,c.year)?.watched&&(minutes===0||c.runtime>0)&&!!pickTonight([c],{minutes,mood,seed}),
          active:()=>gen===generation.current,offset:friendCursor.current
        });
        friendCursor.current=resolved.nextOffset;
        if(gen!==generation.current)return;rows=resolved.rows;

      }
      const choose=()=>pickTonight(eligible().filter(c=>!history[candidateId(c)]),{minutes,mood,seed})??pickTonight(eligible(),{minutes,mood,seed,avoid:pick?[pick.key]:[]});
      let r=choose();
      for(let attempt=0;!r&&source==="outside"&&attempt<3&&page.current<500;attempt++){
        const more=outsideLibrary(await outsideTonightPool(minutes,mood,++page.current),known);
        if(gen!==generation.current)return;
        rows=[...new Map([...rows,...more].map(c=>[candidateId(c),c])).values()];
        r=choose();
      }
      if(gen!==generation.current)return;
      setFallback(false);
      if(source==="friends"&&!r)r=pickTonight(rows.filter(c=>(minutes===0||c.runtime>0)&&!diaryGet(c.title,c.year)?.watched),{minutes,mood,seed,avoid:pick?[pick.key]:[]});
      if(libraryOnly&&!r){
        const avoid=pick?[pick.key]:[];
        r=pickTonight(rows.filter(c=>!diaryGet(c.title,c.year)?.watched),{minutes,mood,seed,avoid});
        if(!r){r=pickTonight(allLocal,{minutes,mood,seed,avoid});}
        if(!r&&allLocal.length){r=pickTonight(allLocal,{minutes:0,mood:"any",seed,avoid});if(r)r.reasons=r.reasons.filter(reason=>reason.kind!=="time");setFallback(true);}
        if(r){cycle.current=Math.max(Date.now(),...Object.values(history),0)+1;if(!store.set("tonightLibraryCycleAt",String(cycle.current)))throw Error(extraText("Öneri döngüsü kaydedilemedi.","Could not save the suggestion cycle."));}
      }
      if(source==="outside")setExternal(rows);
      if(!r){setRes("none");return;}
      const shown=[r.pick,...r.others];for(const c of shown)history[candidateId(c)]=libraryOnly?Math.max(Date.now(),cycle.current):Date.now();
      if(!store.set(SHOWN,JSON.stringify(history)))throw Error(extraText("Öneri geçmişi kaydedilemedi; tekrar önermemek için seçim durduruldu.","Suggestion history could not be saved. Selection stopped to prevent repeats."));
      setOnly(false);
      const commit=(value:Pick)=>{setRes(value);setResultNotes(source==="friends"?friends.candidates.find(c=>c.key===value.pick.key)?.friendNotes??[]:[]);};
      // Keep the previous result mounted while choosing; animate a small overlay instead of replacing image URLs every frame.
      const selected=r;
      if(selected.pick.poster){const image=new Image();image.src=IMG+"w342"+selected.pick.poster;await Promise.race([image.decode().catch(()=>{}),new Promise<void>(resolve=>window.setTimeout(resolve,700))]);}
      if(gen===generation.current)commit(selected);
    }catch(e){if(gen===generation.current)setLoadError(String(e));}finally{if(gen===generation.current)setChoosing(false);}
  };
  return (
    <><section className={"tn glass" + (tint ? " tinted" : "")} style={tint ? ({ "--tn-rgb": tint } as React.CSSProperties) : undefined}>
      <div className="tn-head-actions"><button className="tn-recap" onClick={()=>setQuiz(true)}>{extraText("Zevk testi","Taste quiz")} ›</button><button className="tn-recap" onClick={() => openPanel("lines")} title={tt("Replik ara")}>{tt("Replik ara")} ›</button>
          <button className="tn-recap" onClick={() => openPanel("recap")} title={tt("Luna Özet")}>{tt("Luna Özet")} ›</button></div>
      <div className="tn-ask">
        <div className="tn-head">
          <h2>{tt("Bu akşam ne izlesem?")}</h2>

        </div>
        <p className="tn-sub">{source==="friends"?extraText("Seçtiğin arkadaşların önerileri ve Letterboxd listelerinden.","From your selected friends’ recommendations and Letterboxd lists."):libraryOnly?tt("Kütüphanende bekleyenlerden, vaktine ve ruh haline göre."):extraText("Yalnız kütüphanen dışındaki filmlerden, vaktine ve ruh haline göre.","Only films outside your library, for your time and mood.")}</p><div className="tn-status" role="status">{loading||choosing?extraText("Öneriler yükleniyor…","Loading suggestions…"):loadError||saveMessage}</div>
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
        <div className="tn-pick-controls"><button className="tn-go" onClick={()=>void roll()} disabled={loading||choosing}>{res && res !== "none" ? tt("Başka bir tane") : tt("Benim için seç")}</button><div className="tn-scope three" role="group" aria-label={extraText("Öneri kapsamı","Suggestion scope")}><span aria-hidden="true" style={{transform:`translateX(${["library","outside","friends"].indexOf(source)*100}%)`}}/>{(["library","outside","friends"] as const).map(value=><button key={value} aria-pressed={source===value} onClick={()=>setSource(value)}>{value==="library"?extraText("Kütüphanede","In library"):value==="outside"?extraText("Dışarıdan","Outside library"):extraText("Önerilenler","From friends")}</button>)}</div><button className={"chip tn-friend-settings"+(source==="friends"?" shown":"")} aria-hidden={source!=="friends"} tabIndex={source==="friends"?0:-1} title={extraText("Arkadaş seçimi","Choose friends")} aria-label={extraText("Arkadaş seçimi","Choose friends")} onClick={()=>setFriendSettings(true)}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 7h16M4 17h16M8 4v6M16 14v6"/></svg></button></div>
      </div>
      <div className={"tn-out"+((loading||choosing)?" is-busy":"")} aria-live="polite" aria-busy={loading||choosing}>
        {pick&&(loading||choosing)&&<div className="tn-pending" role="status"><span/>{extraText("Yeni öneri hazırlanıyor…","Finding your next pick…")}</div>}
        {!pick && (res === null || loading || choosing) && (
          <div className={"tn-fan"+((loading||choosing)?" is-loading":"")} aria-hidden="true">
            {((loading||choosing)&&!cands.some(c=>c.poster)?localCandidates:cands).filter((c) => c.poster).slice(0, 3).map((c, i) => <img key={c.key} src={IMG + "w185" + c.poster} alt="" style={{ "--i": i } as React.CSSProperties} />)}
          </div>
        )}
        {!loading && !choosing && res === "none" && <p className="tn-none">{libraryOnly?extraText("Kütüphanene oynatılabilir bir film ekle.","Add a playable film to your library."):source==="friends"?extraText("Bu tercihler için yeni öneri bulunamadı. Arkadaş seçimini veya filtreleri değiştirebilirsin.","No new recommendation fits. Change friends or filters."):extraText("Bu tercihlerde henüz göstermediğim film kalmadı. Süreyi veya ruh halini değiştirebilir, dış önerilerde yeniden aratabilirsin.","No unseen suggestions remain for these preferences. Change your time or mood, or search outside suggestions again.")}</p>}
        {pick && res && res !== "none" && (
          <div className="tn-result" key={pick.key}>
            <div className="tn-poster-column"><div className="tn-poster-frame" role="button" tabIndex={0} aria-label={pick.title} onClick={()=>showDetails(pick)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();showDetails(pick);}}}>{pick.poster ? <img className="tn-poster" src={IMG + "w342" + pick.poster} alt="" /> : <div className="tn-poster blank" />}{pickedItem&&<div className="tn-poster-votes" onClick={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()}><TasteButtons it={pickedItem} votesOnly/></div>}</div>{pickedItem&&onAsk&&<button className="chip tn-ask-assistant" onClick={()=>onAsk(pickedItem)}>{tt("Asistana sor")}</button>}</div>
            <div className="tn-info">
              <h3>{pick.title}</h3><TonightMetadata key={pick.key} pick={pick}/>
              <div className="tn-reasons">{res.reasons.map((r, i) => <span key={i} className="tn-reason">{reasonText(r)}</span>)}</div>
              {resultNotes.length>0&&<div className="tn-friend-notes">{resultNotes.map(note=><div key={note.name}><b>{note.name}</b> {extraText("önerdi","recommended")}{note.stars?` · ${String(note.stars).replace(".",lang()==="tr"?",":".")}/5`:""}{note.note&&<p>{note.note}</p>}</div>)}</div>}
              {fallback&&<p className="muted small">{extraText("Filtrelerde yeni seçenek kalmadığı için kütüphanenden başka bir film seçildi.","Another library film was selected because no new title fits these filters.")}</p>}
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
    </section>{friendSettings&&<ExtraModal title={extraText("Arkadaş seçimi","Choose friends")} close={()=>setFriendSettings(false)}><p className="muted">{extraText("Önerilenler kaynağında kimlerin filmleri kullanılsın?","Whose films should be included in From friends?")}</p>{friends.people.length?friends.people.map(name=><label className="tn-friend-option" key={name}><input type="checkbox" checked={selectedFriends===null||selectedFriends.includes(name)} onChange={event=>{const current=selectedFriends??friends.people;const next=event.target.checked?[...new Set([...current,name])]:current.filter(n=>n!==name);if(store.set("tonightFriends",JSON.stringify(next)))setSelectedFriends(next);else setLoadError(extraText("Arkadaş seçimi kaydedilemedi.","Could not save the friend selection."));}}/><FriendAvatar name={name}/><span>{name}</span></label>):<p>{extraText("Önce Öneriler bölümünden arkadaş ekle veya Letterboxd bağla.","Add friends or connect Letterboxd in Recommendations first.")}</p>}<button className="chip" onClick={()=>setFriendSettings(false)}>{tt("Kapat")}</button></ExtraModal>}{quiz&&<TasteQuiz local={localCandidates} known={known} minutes={minutes} libraryOnly={libraryOnly} close={()=>setQuiz(false)} onDetails={showDetails}/>} {detail&&<Suspense fallback={null}><TonightDetail t={{title:detail.title,tmdbId:detail.tmdbId,year:detail.year,kind:detail.kind}} items={items} onClose={()=>setDetail(null)}/></Suspense>}</>
  );
}
