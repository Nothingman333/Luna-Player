import {extraText} from "./Extras";
import {reviewAi,reviewAiName,otherAi} from "./ai";
// "Zevk Laboratuvarı" on the recommendations page: the user's own Letterboxd (export ZIP or RSS),
// the taste profile built from the diary (what they love and avoid, how they rate, how well the
// model knows them), what their own reviews say, how alike friends rate, and picks with reasons.
import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "./nativeCore";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { DEC, lang, pctText, tt } from "./i18n";
import { IMG, store } from "./library";
import type { Item } from "./library";
import { I, Icon } from "./Screens";
import { laterOff, loadDiary, loadLater, loadPlaylists, loadRecs, markLater, readLetterboxd, saveDiaryBulk, useTaste } from "./Taste";
import type { DetailTarget, DiaryEntry } from "./Taste";
import * as C from "./tasteCore";
import {
  aiTasteReading, buildTaste, featName, featOf, forgetFriendRatings, friendCompat, hasTmdb, lbUser, loadAiTaste, loadModel, loadPicks,
  myLbUser, onTasteEngine, readRss, recommend, resetTasteEngine, saveFriendRatings, sayNo, setMyLbUser, syncFriend, typeLabel,
} from "./tasteEngine";
import type { BuildProgress, Mood, Pick } from "./tasteEngine";
import "./TasteLab.css";

type Tab = "dna" | "reviews" | "friends" | "picks";
const starText = (s: number) => "★".repeat(Math.floor(s)) + (s % 1 ? "½" : "");
const num = (x: number, d = 1) => x.toFixed(d).replace(".", DEC);
const diaryNow = ():Record<string,DiaryEntry & C.DiaryLike> => {
 const raw=loadDiary();if(!raw||typeof raw!=="object"||Array.isArray(raw)||Object.values(raw).some(e=>!e||typeof e.title!=="string"||!e.title.trim()))throw Error(extraText("Zevk defteri kaydı hasarlı. Üzerine yazılmadı; önce Ayarlar › Yedekleme’den bir kopya al.","The taste diary is damaged and was not overwritten. Save a copy from Settings › Backup first."));return raw;
};

function useEngine() {
  const [, bump] = useState(0);
  useEffect(() => onTasteEngine(() => bump((x) => x + 1)), []);
}

/** A horizontal bar for a score in −1…1 (or a share 0…1 when `share`). */
function Bar({ v, max, bad }: { v: number; max: number; bad?: boolean }) {
  return <span className={"taste-lab-bar" + (bad ? " bad" : "")}><span style={{ width: `${Math.max(4, Math.min(100, (Math.abs(v) / (max || 1)) * 100))}%` }} /></span>;
}

export function TasteLab({ items, onOpen }: { items: Item[]; onOpen: (t: DetailTarget) => void }) {
  useTaste();
  useEngine();
  const [open, setOpen] = useState(() => store.get("tasteLabOpen") !== "0");
  const [tab,setTab]=useState<Tab>(()=>{const t=store.get("tasteLabTab");return t==="reviews"||t==="friends"||t==="picks"?t:"dna";});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState<BuildProgress | null>(null);
  const [me, setMe] = useState(myLbUser());
  const stop = useRef<AbortController | null>(null);
  useEffect(()=>()=>stop.current?.abort(),[]);
  useEffect(() => { store.set("tasteLabOpen", open ? "1" : "0"); }, [open]);
  useEffect(() => { store.set("tasteLabTab", tab); }, [tab]);
  const model = loadModel();
  let diary:Record<string,DiaryEntry & C.DiaryLike>;
  try{diary=diaryNow();}catch(error){return <section className="taste-lab"><h3>{tt("Zevk Laboratuvarı")}</h3><p role="alert">{String(error).replace(/^Error: /,"")}</p></section>;}
  const diaryCount = Object.keys(diary).length;

  const run = async (label: string, job: (signal: AbortSignal, say: (m: string) => void) => Promise<string>) => {
    if (busy||stop.current) return;
    const ac = new AbortController();
    stop.current = ac;
    setBusy(true); setMsg(label);
    try { setMsg(await job(ac.signal, (m) => { if (!ac.signal.aborted) setMsg(m); })); } catch (e) { setMsg(String(e).replace(/^Error: /, "")); }
    setBusy(false); setProg(null); stop.current = null;
  };

  // ----- the user's own Letterboxd
  const importExport = () => run(tt("Letterboxd dosyası okunuyor…"), async () => {
    const f = await openDialog({ multiple: true, filters: [{ name: "Letterboxd", extensions: ["zip", "csv"] }] });
    const paths = Array.isArray(f) ? f : f ? [f] : [];
    if (!paths.length) return "";
    const ex = C.readLbExport(await invoke<[string, string][]>("read_export", { paths }));
    if (!ex.films.length && !ex.watchlist.length) throw new Error(tt("Bu dosyada Letterboxd verisi bulunamadı. Letterboxd'da Ayarlar → Veri → Dışa aktar ile inen ZIP'i seç."));
    const res = C.mergeIntoDiary(diaryNow(), ex.films);
    // the watchlist goes to "Sonra izle", written once
    const cur = loadLater();
    const has = new Set(cur.map((x) => C.diaryKey(x)));
    const add = ex.watchlist.map((w) => (w.year ? `${w.title} (${w.year})` : w.title)).filter((l) => !has.has(C.diaryKey(l)) && !res.diary[C.diaryKey(l)]?.watched);
    if (add.length) store.set("laterList", JSON.stringify([...cur, ...add]));
    saveDiaryBulk(res.diary as Record<string, DiaryEntry>);
    return tt("Letterboxd'dan {0} film eklendi, {1} kayıt güncellendi ({2} puan, {3} yorum); {4} film Sonra izle'ye girdi. Şimdi profilini oluştur.", res.added, res.updated, res.rated, res.reviews, add.length);
  });
  const syncMine = () => run(tt("Letterboxd'daki son girişlerin okunuyor…"), async () => {
    const u = lbUser(me);
    if (!u) throw new Error(tt("Letterboxd kullanıcı adını ya da profil bağlantını yaz."));
    setMyLbUser(u);
    const list = await readRss(u);
    const res = C.mergeIntoDiary(diaryNow(), list);
    saveDiaryBulk(res.diary as Record<string, DiaryEntry>);
    return tt("Son {0} girişin okundu: {1} yeni film, {2} güncelleme. (RSS yalnızca son 50 girişi verir; tüm geçmiş için dışa aktarma dosyasını kullan.)", list.length, res.added, res.updated);
  });
  const build = () => run(tt("Profil hazırlanıyor…"), async (signal) => {
    const m = await buildTaste(diaryNow(), setProg, signal);
    if (signal.aborted) return tt("Durduruldu. Bulunan bilgiler saklandı; tekrar başlatınca kaldığı yerden devam eder.");
    if (!m) return tt("Profil için en az 5 film gerekiyor (puanladığın, beğendiğin ya da izlediğin).");
    setTab("dna");
    return tt("Profil hazır: {0} film ({1} puanlı).", m.films, m.rated);
  });

  const head = (
    <div className="taste-lab-head">
      <button className="taste-lab-title" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <Icon d={open ? I.down : I.right} size={16} /> {tt("Zevk Laboratuvarı")}
        {model && <span className="muted small"> · {tt("{0} film", model.films)}{model.acc.rho != null ? ` · ${tt("isabet")} ${num(model.acc.rho, 2)}` : ""}</span>}
      </button>
      <span className="grow" />
      {open && <>
        <button className="chip" disabled={busy} onClick={importExport} data-tip={tt("Letterboxd → Ayarlar → Veri → Dışa aktar ile inen ZIP: tüm izlediklerin, puanların, yorumların, beğenilerin ve izleme listen")}>{tt("Letterboxd verimi içe aktar")}</button>
        <button className="primary sm" disabled={busy || !diaryCount} onClick={build}>{model ? tt("Profili güncelle") : tt("Profilimi oluştur")}</button>
      </>}
    </div>
  );
  if (!open) return <section className="taste-lab">{head}</section>;
  return (
    <section className="taste-lab">
      {head}
      <div className="taste-lab-me">
        <span className="muted small">{tt("Letterboxd kullanıcı adın:")}</span>
        <input aria-label={tt("Letterboxd kullanıcı adın:")} maxLength={200} value={me} onChange={(e) => setMe(e.target.value)} onKeyDown={(e) => e.key === "Enter" && syncMine()} placeholder={tt("ör. kullaniciadi")} />
        <button className="chip" disabled={busy || !me.trim()} onClick={syncMine} data-tip={tt("Profilinin RSS akışından son girişlerini (puan, beğeni, yorum) deftere ekler")}>{tt("⟳ Son girişlerimi eşitle")}</button>
        {!hasTmdb() && <span className="taste-lab-warn small">{tt("Profil ve öneriler için Ayarlar'dan TMDB anahtarı gerekli.")}</span>}
      </div>
      {(busy || msg) && (
        <div className="taste-lab-status small">
          {prog && <span className="taste-lab-prog"><span style={{ width: `${(prog.done / Math.max(1, prog.total)) * 100}%` }} /></span>}
          <span>{prog ? tt("{0}/{1} film incelendi · {2} eşleşti · {3}", prog.done, prog.total, prog.found, prog.title ?? "") : msg}</span>
          {busy && <button className="chip" onClick={() => stop.current?.abort()}>{tt("Durdur")}</button>}
        </div>
      )}
      <div className="pl-tabs taste-lab-tabs">
        {([["dna", tt("Zevk DNA'n")], ["reviews", tt("Yorumların")], ["friends", tt("Arkadaş uyumu")], ["picks", tt("Senin için")]] as [Tab, string][]).map(([k, l]) => (
          <button key={k} className={"seg sm" + (tab === k ? " on" : "")} aria-pressed={tab===k} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === "dna" && <Dna diary={diary} />}
      {tab === "reviews" && <Reviews diary={diary} onOpen={onOpen} />}
      {tab === "friends" && <Friends diary={diary} busy={busy} run={run} />}
      {tab === "picks" && <Picks items={items} busy={busy} run={run} onOpen={onOpen} />}
    </section>
  );
}

// ---------------------------------------------------------------- DNA
const DNA_TYPES: C.FeatType[] = ["g", "k", "d", "w", "a", "y", "l", "c"];
function Dna({ diary }: { diary: Record<string, C.DiaryLike> }) {
  const model = loadModel();
  const [more, setMore] = useState(false);
  const extra = useMemo(() => {
    // against the crowd: the user's rating vs TMDB's average for the same films
    const pairs: [number, number][] = [];
    const years = new Map<number, number>();
    let hours = 0, rewatches = 0;
    for (const e of Object.values(diary)) {
      const f = featOf(e.title, e.year);
      if (e.rating && f?.va && (f.vc ?? 0) > 30) pairs.push([e.rating / 2, f.va / 2]);
      if (e.watched) { const y = new Date(e.watched).getUTCFullYear(); years.set(y, (years.get(y) ?? 0) + 1); hours += (f?.rt ?? 0) / 60; }
      rewatches += e.rewatch ?? 0;
    }
    const r = C.pearson(pairs.map((p) => p[0]), pairs.map((p) => p[1]));
    const diff = pairs.length ? pairs.reduce((s, p) => s + p[0] - p[1], 0) / pairs.length : null;
    const last = [...years.entries()].sort((a, b) => a[0] - b[0]).slice(-8);
    return { r, diff, n: pairs.length, last, hours: Math.round(hours), rewatches };
  }, [diary, model?.at]);
  if (!model) return <div className="muted small taste-lab-empty">{tt("Henüz profil yok. Letterboxd verini içe aktar ya da filmlere puan ver, sonra “Profilimi oluştur”a bas. Luna her filmin türünü, temalarını, yönetmenini, oyuncularını, dönemini ve dilini TMDB'den alıp neyi neden sevdiğini çıkarır.")}</div>;
  const st = model.stats;
  const maxHist = Math.max(1, ...st.hist);
  const accText = model.acc.auc != null
    ? tt("Model, sevdiğin bir filmi sevmediğinden %{0} ihtimalle doğru ayırıyor (görmediği filmlerle sınandı).", Math.round(model.acc.auc * 100))
    : extraText("Ayrım isabeti için yeterli sayıda yüksek ve düşük puanlı film gerekiyor.","Measuring discrimination needs enough highly and poorly rated films.");
  return (
    <div className="taste-lab-dna">
      <div className="sum-grid taste-lab-cards">
        <div><b>{model.films}</b><span>{tt("profildeki film")}</span></div>
        <div><b>{num(st.mean / 2)}★</b><span>{tt("puan ortalaman")}</span></div>
        <div><b>{num(st.sd / 2)}</b><span>{tt("puan yayılımın (★)")}</span></div>
        <div><b>{extra.r != null ? num(extra.r, 2) : "–"}</b><span>{tt("ana akımla uyumun")}</span></div>
        <div><b>{model.acc.rho != null ? num(model.acc.rho, 2) : "–"}</b><span>{tt("tahmin isabeti (ρ)")}</span></div>
      </div>
      <div className="muted small">{accText}{extra.diff != null ? " " + (extra.diff >= 0.15 ? tt("TMDB ortalamasından {0}★ cömertsin.", num(extra.diff)) : extra.diff <= -0.15 ? tt("TMDB ortalamasından {0}★ daha sertsin.", num(-extra.diff)) : tt("Puanların TMDB ortalamasına yakın.")) : ""}</div>
      <div className="taste-lab-hist" aria-label={tt("Puan dağılımın")}>
        {st.hist.map((n, i) => (
          <div key={i} className="taste-lab-hcol" title={`${num((i + 1) / 2)}★ · ${n}`}><span style={{ height: `${(n / maxHist) * 100}%` }} /><em>{(i + 1) % 2 === 0 ? (i + 1) / 2 : "½"}</em></div>
        ))}
      </div>
      <div className="taste-lab-grid">
        {(more ? DNA_TYPES : DNA_TYPES.slice(0, 4)).map((t) => {
          const { plus, minus } = C.topFeatures(model, t, 7, t === "g" || t === "y" || t === "l" || t === "c" ? 3 : 2);
          if (!plus.length && !minus.length) return null;
          const max = Math.max(...plus.map((x) => x[1]), ...minus.map((x) => -x[1]), 0.01);
          return (
            <div key={t} className="taste-lab-box">
              <h4>{typeLabel(t)}</h4>
              {plus.map(([k, v, n, avg]) => <div key={k} className="taste-lab-row" title={tt("{0} film · ortalama puanın {1}", Math.round(n), avg != null ? num(avg / 2) + "★" : "–")}><span className="ellipsis">{featName(k)}</span><Bar v={v} max={max} /><span className="muted small">{avg != null ? num(avg / 2) + "★" : ""}</span></div>)}
              {minus.length > 0 && <div className="taste-lab-sub">{tt("Uzak durdukların")}</div>}
              {minus.map(([k, v, n, avg]) => <div key={k} className="taste-lab-row" title={tt("{0} film · ortalama puanın {1}", Math.round(n), avg != null ? num(avg / 2) + "★" : "–")}><span className="ellipsis">{featName(k)}</span><Bar v={v} max={max} bad /><span className="muted small">{avg != null ? num(avg / 2) + "★" : ""}</span></div>)}
            </div>
          );
        })}
      </div>
      <div className="taste-lab-foot">
        <button className="chip" onClick={() => setMore((v) => !v)}>{more ? tt("Daha az") : tt("Dönem, dil ve ülke de")}</button>
        {extra.last.length > 1 && <span className="muted small">{tt("Yıllara göre izlediğin:")} {extra.last.map(([y, n]) => `${y}: ${n}`).join(" · ")}{extra.hours ? ` · ${tt("toplam ~{0} saat", extra.hours)}` : ""}{extra.rewatches ? ` · ${tt("{0} tekrar izleme", extra.rewatches)}` : ""}</span>}
        <span className="grow" />
        <button className="chip" onClick={() => { if (confirm(tt("Profil, film bilgileri önbelleği ve öneriler silinsin mi? Zevk defterin silinmez."))) resetTasteEngine(); }}>{tt("Profili sıfırla")}</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- reviews
const ASPECT_NAMES: Record<C.Aspect, string> = { story: "Hikâye / senaryo", acting: "Oyunculuk", visuals: "Görüntü", sound: "Müzik ve ses", pace: "Tempo", emotion: "Duygu", ending: "Final", direction: "Yönetmenlik", humor: "Mizah" };
function Reviews({ diary, onOpen }: { diary: Record<string, C.DiaryLike>; onOpen: (t: DetailTarget) => void }) {
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMsg, setAiMsg] = useState("");
  const list = Object.values(diary).filter((e) => (e.review ?? e.note ?? "").trim());
  const ins = C.analyseReviews(list.map(e=>({text:e.review??e.note??"",rating:e.rating})));
  const ai = loadAiTaste();
  const askAi = async () => {
    const ai=reviewAi();const key=ai.use.key;
    if (!key) { setAiMsg(extraText("Yorum analizi için seçilen AI profilinin anahtarını Ayarlar’dan gir.","Enter the selected review AI profile’s key in Settings.")); return; }
    setAiBusy(true); setAiMsg(tt("Yorumların okunuyor…"));
    try { await aiTasteReading(diaryNow(), async body=>({r:ai.provider==="gemini"?await invoke("gemini",{key,model:ai.model,body}):(await otherAi(body,ai.use)).r,model:{id:reviewAiName(ai)}})); setAiMsg(""); } catch (e) { setAiMsg(String(e).replace(/^Error: /, "")); }
    setAiBusy(false);
  };
  if (!ins.n) return <div className="muted small taste-lab-empty">{tt("Henüz yorum yok. Letterboxd verini içe aktarınca yorumların da gelir; Luna'da bir filme yazdığın notlar da sayılır.")}</div>;
  const maxM = Math.max(1, ...ins.aspects.map((a) => a.mentions));
  return (
    <div className="taste-lab-rev">
      <div className="muted small">{tt("{0} yorum · ortalama {1} kelime · {2} tanesi Türkçe.", ins.n, ins.avgLen, ins.turkish)} {ins.toneVsRating != null ? (ins.toneVsRating > 0.35 ? tt("Yazdıkların puanlarınla tutarlı.") : tt("Yazdıklarının tonu ile puanların her zaman örtüşmüyor; puanı daha çok başka şeyler belirliyor olabilir.")) : ""}</div>
      <div className="taste-lab-aspects">
        <div className="taste-lab-arow head"><span>{tt("Neyden bahsediyorsun")}</span><span>{tt("Ne sıklıkla")}</span><span>{tt("Övgü / eleştiri")}</span><span>{tt("Övdüğünde / eleştirdiğinde puanın")}</span></div>
        {ins.aspects.filter((a) => a.mentions).map((a) => (
          <div key={a.aspect} className="taste-lab-arow" title={[ins.quotes[a.aspect]?.pos, ins.quotes[a.aspect]?.neg].filter(Boolean).map((q) => `“${q}”`).join("\n")}>
            <span>{tt(ASPECT_NAMES[a.aspect])}</span>
            <span><Bar v={a.mentions} max={maxM} /> <span className="muted small">{pctText(Math.round(a.share * 100))}</span></span>
            <span><span className="taste-lab-pos">+{a.pos}</span> <span className="taste-lab-neg">−{a.neg}</span></span>
            <span className="muted small">{a.ratingWhenPraised != null ? num(a.ratingWhenPraised / 2) + "★" : "–"} / {a.ratingWhenCriticised != null ? num(a.ratingWhenCriticised / 2) + "★" : "–"}</span>
          </div>
        ))}
      </div>
      {ins.vocab.length > 0 && <div className="taste-lab-words"><span className="muted small">{tt("Sık kullandığın kelimeler:")}</span>{ins.vocab.map(([w]) => <span key={w} className="taste-lab-chip">{w}</span>)}</div>}
      <div className="taste-lab-ai">
        <div className="taste-lab-ai-head"><b>{tt("Yapay zekâ ile derin okuma")}</b><span className="muted small">{extraText("En anlatıcı yaklaşık 60 yorum seçili AI profiline gönderilir; önerdiği filmler TMDB’de doğrulanır.","About 60 representative reviews are sent to your selected AI profile; suggested films are checked on TMDB.")}</span><span className="grow" />
          <button className="chip" disabled={aiBusy} onClick={askAi}>{ai ? tt("Yeniden oku") : tt("Yorumlarımı oku")}</button></div>
        {aiMsg && <div className="small import-msg">{aiMsg}</div>}
        {ai && (
          <div className="taste-lab-ai-body">
            <p>{ai.summary}</p>
            <div className="taste-lab-two">
              <div><h4>{tt("Sevdiğin")}</h4><ul>{ai.loves.map((x) => <li key={x}>{x}</li>)}</ul></div>
              <div><h4>{tt("Kaçındığın")}</h4><ul>{ai.avoids.map((x) => <li key={x}>{x}</li>)}</ul></div>
            </div>
            {ai.values.length > 0 && <><h4>{tt("Filmleri neye göre tartıyorsun")}</h4><ul>{ai.values.map((v) => <li key={v.aspect}><b>{v.aspect}:</b> {v.note}</li>)}</ul></>}
            {ai.blindSpots.length > 0 && <><h4>{tt("Henüz denemediğin ama sevebileceğin alanlar")}</h4><ul>{ai.blindSpots.map((x) => <li key={x}>{x}</li>)}</ul></>}
            {ai.tryNext.length > 0 && <><h4>{tt("Sıradaki denemeler")}</h4><div className="taste-lab-try">{ai.tryNext.map((t) => (
              <button key={t.title} className="taste-lab-try-item" onClick={() => onOpen({ title: t.title, year: t.year, tmdbId: t.tmdbId, kind: t.kind })}><b>{t.title}{t.year ? ` (${t.year})` : ""}</b><span className="muted small">{t.why}</span></button>
            ))}</div></>}
            <div className="muted small">{tt("{0} · {1}", new Date(ai.at).toLocaleDateString(lang() === "en" ? "en-GB" : "tr-TR"), ai.model ?? "")}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- friends
/** The Letterboxd user behind a friend's folder (from its linked lists' addresses). */
function folderUser(name: string): string | undefined {
  const all = loadPlaylists();
  const folder = all.find((p) => !p.parent && C.seenKey(p.name) === C.seenKey(name));
  const url = folder ? all.filter((p) => p.parent === folder.id).map((p) => p.source?.url).find(Boolean) : undefined;
  return url ? lbUser(url) ?? undefined : undefined;
}
type Run = (label: string, job: (signal: AbortSignal, say: (m: string) => void) => Promise<string>) => void;
function Friends({ diary, busy, run }: { diary: Record<string, C.DiaryLike>; busy: boolean; run: Run }) {
  const list = friendCompat(diary);
  const folders = loadPlaylists().filter((p) => !p.parent && loadPlaylists().some((x) => x.parent === p.id));
  const missing = folders.filter((f) => !list.some((l) => C.seenKey(l.name) === C.seenKey(f.name)));
  const [who, setWho] = useState("");
  const [user, setUser] = useState("");
  const fetchAll = (name: string, u: string) => run(tt("{0} için Letterboxd puanları okunuyor…", name), async () => {
    const secs = await readLetterboxd(`https://letterboxd.com/${u}/`, 80);
    const films = secs.filter((s) => s.kind === "watched").flatMap((s) => s.films);
    saveFriendRatings(name, films, u);
    return tt("{0}: {1} puanlı film alındı.", name, films.filter((f) => f.stars).length);
  });
  const quick = (name: string, u: string) => run(tt("{0} için son girişler okunuyor…", name), async () => tt("{0}: son girişlerden {1} puan eklendi.", name, await syncFriend(name, u)));
  return (
    <div className="taste-lab-friends">
      <div className="muted small">{tt("Uyum, ikinizin de puanladığı filmlerdeki puanların ne kadar birlikte gittiğidir (az ortak filmde temkinli hesaplanır). Uyumu yüksek arkadaşlarının çok sevdiği filmler “Senin için”de öne çıkar.")}</div>
      {list.map((f) => (
        <div key={f.name} className="taste-lab-friend">
          <div className="taste-lab-f-name"><b>{f.name}</b>{f.user && <span className="muted small"> @{f.user}</span>}</div>
          <div className={"taste-lab-f-pct " + ((f.c.pct ?? 0) >= 65 ? "hi" : (f.c.pct ?? 0) >= 45 ? "mid" : "lo")}>{f.c.pct != null ? pctText(f.c.pct) : "–"}</div>
          <div className="taste-lab-f-info small">
            <span className="muted">{tt("{0} ortak puanlı film · {1} puanı kayıtlı", f.c.n, f.rated)}</span>
            {f.c.agree.length > 0 && <div><span className="taste-lab-pos">{tt("Hemfikir:")}</span> {f.c.agree.join(", ")}</div>}
            {f.c.split.length > 0 && <div><span className="taste-lab-neg">{tt("Ayrıştığınız:")}</span> {f.c.split.join(", ")}</div>}
          </div>
          <div className="taste-lab-f-act">
            {(f.user ?? folderUser(f.name)) && <button className="chip" disabled={busy} onClick={() => quick(f.name, (f.user ?? folderUser(f.name))!)}>{tt("⟳ Son girişler")}</button>}
            <button className="round sm-round" title={tt("Puanlarını unut")} aria-label={tt("Puanlarını unut")} onClick={() => forgetFriendRatings(f.name)}><Icon d={I.x} size={12} /></button>
          </div>
        </div>
      ))}
      {missing.length > 0 && (
        <div className="taste-lab-missing small">
          <span className="muted">{tt("Puanları henüz alınmamış Letterboxd klasörleri:")}</span>
          {missing.map((f) => { const u = folderUser(f.name); return u ? <button key={f.id} className="chip" disabled={busy} onClick={() => fetchAll(f.name, u)}>{f.name} @{u}</button> : null; })}
        </div>
      )}
      <div className="taste-lab-add">
        <input aria-label={tt("Arkadaşın adı")} maxLength={80} value={who} onChange={(e) => setWho(e.target.value)} placeholder={tt("Arkadaşın adı")} />
        <input aria-label={tt("Letterboxd kullanıcı adı ya da bağlantısı")} maxLength={200} value={user} onChange={(e) => setUser(e.target.value)} placeholder={tt("Letterboxd kullanıcı adı ya da bağlantısı")} />
        <button className="chip" disabled={busy || !who.trim() || !lbUser(user)} onClick={() => fetchAll(who.trim(), lbUser(user)!)}>{tt("Puanlarını al")}</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- picks
const MOODS: [Mood, string][] = [["any", "Hepsi"], ["light", "Hafif"], ["tense", "Gerilim"], ["mind", "Kafa yoran"], ["heart", "Duygusal"]];
const SRC_LABEL: Record<string, string> = { seed: "{0} sevdiğin için", theme: "Temaların: {0}", director: "Yönetmen: {0}", friend: "{0} önerdi", friendlike: "{0} verdi", later: "Sonra izle listende" };
function Picks({ items, busy, run, onOpen }: { items: Item[]; busy: boolean; run: Run; onOpen: (t: DetailTarget) => void }) {
  const saved = loadPicks();
  const [mood, setMood] = useState<Mood>(saved?.opts.mood ?? "any");
  const [maxRt, setMaxRt] = useState<number>(saved?.opts.maxRuntime ?? 0);
  const [gems, setGems] = useState(!!saved?.opts.gems);
  const [shown, setShown] = useState(12);
  const later = loadLater();
  const model = loadModel();
  const go = () => run(tt("Öneriler hazırlanıyor…"), async (signal, say) => {
    const recs = loadRecs();
    const picks = await recommend({
      diary: diaryNow(),
      owned: new Set(items.filter((i) => i.meta && i.meta.id > 0).map((i) => `${i.meta!.kind}:${i.meta!.id}`)),
      later: loadLater(),
      friendRecs: recs.filter((r) => !r.status).map((r) => ({ title: r.title, year: r.year, tmdbId: r.tmdbId, kind: r.kind, from: r.from })),
      dismissedTitles: new Set(recs.filter((r) => r.status === "dismissed").map((r) => C.seenKey(r.title))),
    }, { mood, maxRuntime: maxRt || undefined, gems, signal, onProgress: say });
    setShown(12);
    return picks.length ? tt("{0} öneri hazır.", picks.length) : tt("Bu filtrelerle öneri çıkmadı; filtreleri gevşet.");
  });
  if (!model) return <div className="muted small taste-lab-empty">{tt("Öneriler zevk profilinden gelir: önce “Profilimi oluştur”a bas.")}</div>;
  const isLater = (p: Pick) => later.some((l) => C.diaryKey(l) === C.diaryKey(p.title, p.year));
  return (
    <div className="taste-lab-picks">
      <div className="taste-lab-filters">
        {MOODS.map(([k, l]) => <button key={k} className={"seg sm" + (mood === k ? " on" : "")} onClick={() => setMood(k)}>{tt(l)}</button>)}
        <select aria-label={tt("Her süre")} className="pl-pick" value={maxRt} onChange={(e) => setMaxRt(Number(e.target.value))}>
          <option value={0}>{tt("Her süre")}</option><option value={100}>{tt("≤ 100 dk")}</option><option value={130}>{tt("≤ 130 dk")}</option>
        </select>
        <label className="taste-lab-check"><input type="checkbox" checked={gems} onChange={(e) => setGems(e.target.checked)} /> {tt("Az bilinenleri öne al")}</label>
        <span className="grow" />
        <button className="primary sm" disabled={busy} onClick={go}>{saved ? tt("Yeniden öner") : tt("Öner")}</button>
      </div>
      {saved && <div className="taste-lab-pgrid">
        {saved.picks.slice(0, shown).map((p) => (
          <div key={p.kind + p.id} className="taste-lab-pick">
            <button className="taste-lab-poster" onClick={() => onOpen({ title: p.title, year: p.year, tmdbId: p.id, kind: p.kind })}
              style={p.poster ? { backgroundImage: `url(${IMG}w342${p.poster})` } : undefined}>
              {!p.poster && <span>{p.title}</span>}
              <span className={"taste-lab-pct " + (p.match.pct >= 75 ? "hi" : p.match.pct >= 45 ? "mid" : "lo")}>{pctText(p.match.pct)}</span>
              {p.owned && <span className="taste-lab-flag">{tt("Kütüphanende")}</span>}
            </button>
            <div className="taste-lab-p-title ellipsis" title={p.title}>{p.title} <span className="muted small">{p.year ?? ""}</span></div>
            <div className="taste-lab-p-stars small">{tt("tahmini")} {starText(p.match.stars)}{p.rt ? <span className="muted"> · {p.rt} {tt("dk")}</span> : null}</div>
            <div className="taste-lab-p-why small">
              {p.match.plus.slice(0, 2).map((r) => <span key={r.key} className="taste-lab-chip good">{featName(r.key)}</span>)}
              {p.match.minus.slice(0, 1).map((r) => <span key={r.key} className="taste-lab-chip bad" title={tt("Aleyhine")}>{featName(r.key)}</span>)}
            </div>
            <div className="taste-lab-p-src muted small ellipsis" title={p.sources.map((s) => tt(SRC_LABEL[s.kind], s.label)).join(" · ")}>{p.sources.slice(0, 2).map((s) => tt(SRC_LABEL[s.kind], s.label)).join(" · ")}</div>
            <div className="taste-lab-p-act">
              <button className={"round sm-round" + (isLater(p) ? " on" : "")} title={isLater(p) ? tt("Sonra izle listesinden çıkar") : tt("Sonra izle")} aria-label={tt("Sonra izle")}
                onClick={() => (isLater(p) ? laterOff(p.title, p.year) : markLater(p.year ? `${p.title} (${p.year})` : p.title, true))}><Icon d={isLater(p) ? I.check : I.plus} size={12} /></button>
              <button className="round sm-round" title={tt("Bana göre değil")} aria-label={tt("Bana göre değil")} onClick={() => sayNo(p.kind, p.id)}>⊘</button>
            </div>
          </div>
        ))}
      </div>}
      {saved && saved.picks.length > shown && <div className="plg-more"><button className="chip" onClick={() => setShown((n) => n + 12)}>{tt("Daha fazla göster (")}{saved.picks.length - shown})</button></div>}
      {saved && <div className="muted small">{tt("Uyum yüzdesi: filmin, kendi puanladığın filmler arasında nereye düşeceği. Sıralamada ayrıca kalite, kaç kaynağın aynı filmi gösterdiği ve uyumlu arkadaşların puanı sayılır; benzer filmler aralanır.")}</div>}
    </div>
  );
}
