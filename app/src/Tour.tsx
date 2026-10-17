import { useEffect, useState } from "react";
import { IMG, store } from "./library";
import { I, Icon, LunaMark } from "./Screens";

/** First-run presentation: what Luna does and how to use it, one animated scene per step. */
type Slide = { eyebrow: string; title: string; text: string; tips: { k?: string; t: string }[]; scene: (p: ScenePosters) => React.ReactNode };
type ScenePosters = { posters: (string | null)[] };

const P = (posters: (string | null)[], n: number) => posters[n % Math.max(1, posters.length)] ?? null;
const Poster = ({ src, className, style }: { src: string | null; className?: string; style?: React.CSSProperties }) => (
  <div className={"tv-poster " + (className ?? "")} style={{ ...style, ...(src ? { backgroundImage: `url(${IMG}w342${src})` } : {}) }} />
);

const SLIDES: Slide[] = [
  {
    eyebrow: "Hoş geldin", title: "Luna Player",
    text: "Filmlerini ve dizilerini tek yerde toplayan, ne izleyeceğini bilen ve izlerken sana eşlik eden bir oynatıcı. Birkaç adımda neler yapabildiğine bakalım.",
    tips: [{ k: "→", t: "ile ilerle" }, { k: "Esc", t: "ile geç" }],
    scene: () => (
      <div className="ts ts-intro">
        <div className="ring r1" /><div className="ring r2" /><div className="ring r3" />
        <div className="orbit"><span /></div>
        <div className="mark"><LunaMark size={120} /></div>
      </div>
    ),
  },
  {
    eyebrow: "Kütüphane", title: "Klasörünü ver, gerisini Luna halleder",
    text: "Video klasörlerini ekle. Luna dosya adlarından filmi ve diziyi tanır; afişi, özeti, oyuncuları ve fragmanı getirir. Diziler bölüm bölüm gruplanır, kaldığın yer hatırlanır.",
    tips: [{ t: "Yanlış tanınan dosyada sağ tık › Eşleşmeyi düzelt" }, { t: "Yabancı dildeki özetler otomatik Türkçeye çevrilir" }],
    scene: ({ posters }) => (
      <div className="ts ts-lib">
        <div className="file"><Icon d={I.folder} size={16} /> Dune.Part.Two.2024.1080p.mkv</div>
        <div className="grid">
          {Array.from({ length: 8 }, (_, n) => <Poster key={n} src={P(posters, n)} style={{ animationDelay: `${0.25 + n * 0.08}s` }} />)}
        </div>
        <div className="sweep" />
        <div className="found"><Icon d={I.check} size={16} /> Tanındı · afiş, özet, oyuncular</div>
      </div>
    ),
  },
  {
    eyebrow: "Oynatıcı", title: "Her formatı açar, sana uyar",
    text: "mpv tabanlı güçlü bir oynatıcı. Fare tekerleği sesi, yön tuşları sarmayı yapar; sağ tık menüsünden ses, altyazı ve görüntü ayarlarına ulaşırsın. Altyazı yoksa Luna senin için arar.",
    tips: [{ k: "Boşluk", t: "oynat / duraklat" }, { k: "F", t: "tam ekran" }, { k: "← →", t: "ileri / geri sar" }],
    scene: ({ posters }) => (
      <div className="ts ts-player">
        <div className="screen">
          <Poster src={P(posters, 2)} className="bgp" />
          <div className="sub">— Bunu daha önce de görmüştüm.</div>
          <div className="vol"><Icon d={I.vol} size={18} /><div><i /></div></div>
          <div className="bar"><i /><b /></div>
        </div>
        <div className="keys"><kbd className="k1">Boşluk</kbd><kbd className="k2">F</kbd><kbd className="k3">→</kbd></div>
      </div>
    ),
  },
  {
    eyebrow: "Bağlantı ve torrent", title: "Bir bağlantı yapıştırman yeterli",
    text: "Magnet, .torrent ya da http, m3u8, rtsp gibi ağ bağlantılarını VLC gibi doğrudan açarsın. Torrentler inerken izlenebilir; adı bulunamayan bağlantılar için sana sorulur.",
    tips: [{ k: "Ctrl+N", t: "bağlantı aç" }, { k: "Ctrl+V", t: "pencereye yapıştır" }],
    scene: () => (
      <div className="ts ts-link">
        <div className="box">
          <div className="lbl"><Icon d={I.magnet} size={16} /> Bağlantı aç</div>
          <div className="input"><span className="typed">magnet:?xt=urn:btih:9f2c…&amp;dn=Interstellar.2014</span><i className="caret" /></div>
          <div className="dl">
            <div className="row"><b>Interstellar (2014)</b><span>izlemeye hazır</span></div>
            <div className="prog"><i /></div>
          </div>
        </div>
      </div>
    ),
  },
  {
    eyebrow: "Öneriler", title: "Zevkini öğrenir",
    text: "Beğendiğin ve beğenmediğin filmleri 10 üzerinden puanla, Luna zevkini öğrensin. Arkadaşlarının Letterboxd profillerini ekleyip onların listelerine ve önerilerine de göz atabilirsin.",
    tips: [{ t: "👍 / 👎 sonrası puan sorulur" }, { t: "Sonra izle listesi ve günlük özet sayfasında" }],
    scene: ({ posters }) => (
      <div className="ts ts-recs">
        {[0, 1, 2].map((n) => <Poster key={n} src={P(posters, n + 4)} className={"c c" + n} />)}
        <div className="like">👍</div>
        <div className="rate">
          <span>Kaç puan?</span>
          <div>{Array.from({ length: 10 }, (_, n) => <i key={n} className={n < 8 ? "on" : ""} style={{ animationDelay: `${1.1 + n * 0.06}s` }}>{n + 1}</i>)}</div>
        </div>
        <div className="friends"><span>A</span><span>D</span><span>E</span><em>Arkadaşın beğendi</em></div>
      </div>
    ),
  },
  {
    eyebrow: "İçerik uyarıları", title: "Görmek istemediğini saklar",
    text: "Moderasyon açıkken rahatsız edici içerik barındıran filmlerin afişi bulanıklaşır ve kırmızı bir yıldızla işaretlenir. Sana uygunsa “Güvenli olarak işaretle” demen yeterli.",
    tips: [{ t: "Öneriler sayfasındaki anahtarla açılıp kapanır" }, { t: "İşaretlediklerin zevkine göre hatırlanır" }],
    scene: ({ posters }) => (
      <div className="ts ts-mod">
        <Poster src={P(posters, 3)} className="mp" />
        <div className="star">★</div>
        <div className="warn"><b>İçerik uyarısı</b><span>Şiddet · Rahatsız edici sahneler</span><button>Güvenli olarak işaretle</button></div>
      </div>
    ),
  },
  {
    eyebrow: "Asistan", title: "Sor, o bulsun",
    text: "Sağ üstteki sohbet düğmesiyle film asistanını aç. “Bu akşam ne izlesem?” ya da “Dune'da kimler oynuyor?” diye sor; film sayfaları, sahneler, oyuncular ve kaynaklarla cevap verir. Büyütünce geniş bir çalışma alanına dönüşür.",
    tips: [{ t: "Kalın film adlarına tıklayınca sayfası açılır" }, { t: "Geçmiş sohbetler saklanır" }],
    scene: ({ posters }) => (
      <div className="ts ts-chat">
        <div className="me">Bu akşam gerilimli bir şey izlesem?</div>
        <div className="dots"><i /><i /><i /></div>
        <div className="bot">
          <span>Zevkine göre şunlar iyi gider:</span>
          <div className="pick"><Poster src={P(posters, 1)} /><div><b>Prisoners (2013)</b><em>Tutsaklar · ★ 8,1</em></div></div>
          <div className="pick"><Poster src={P(posters, 6)} /><div><b>Zodiac (2007)</b><em>Zodyak · ★ 7,7</em></div></div>
        </div>
      </div>
    ),
  },
  {
    eyebrow: "Son adım", title: "Anahtarlarını ekle",
    text: "Bazı özellikler ücretsiz anahtarlar ister. Ayarlar'dan birkaç dakikada girebilirsin; girmesen de oynatıcı her zaman çalışır.",
    tips: [{ t: "Bu sunuma Ayarlar'dan tekrar ulaşabilirsin" }],
    scene: () => (
      <div className="ts ts-keys">
        {[["TMDB", "Afiş, özet, oyuncular, öneriler", I.film], ["Gemini", "Asistan ve çeviriler", I.chat], ["OpenSubtitles", "Altyazı arama", I.subs]].map(([n, d, ic], k) => (
          <div key={n} className="key" style={{ animationDelay: `${0.2 + k * 0.15}s` }}>
            <div className="ic"><Icon d={ic} size={20} /></div>
            <div><b>{n}</b><span>{d}</span></div>
            <i className="ok" style={{ animationDelay: `${0.9 + k * 0.25}s` }}><Icon d={I.check} size={14} /></i>
          </div>
        ))}
      </div>
    ),
  },
];

export const tourSeen = () => store.get("tourDone") === "1";

export function Tour({ onClose, onSettings, posters = [] }: { onClose: () => void; onSettings: () => void; posters?: (string | null)[] }) {
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const [leaving, setLeaving] = useState(false);
  const last = i === SLIDES.length - 1;
  const go = (n: number) => { if (n < 0 || n >= SLIDES.length) return; setDir(n > i ? 1 : -1); setI(n); };
  const done = () => { store.set("tourDone", "1"); setLeaving(true); setTimeout(onClose, 450); };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") done();
      else if (e.key === "ArrowRight" || e.key === "Enter") (last ? done() : go(i + 1));
      else if (e.key === "ArrowLeft") go(i - 1);
      else return;
      e.stopPropagation(); e.preventDefault();
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  });
  const s = SLIDES[i];
  const ps = posters.filter(Boolean);
  return (
    <div className={"tour-bg" + (leaving ? " out" : "")} style={{ ["--step" as any]: i }}>
      <div className="tour-glow g1" /><div className="tour-glow g2" />
      <div className="tour-grain" />
      <div className="tour-top">
        <div className="brand"><LunaMark size={24} /> Luna Player</div>
        <div className="tour-prog">
          {SLIDES.map((x, n) => (
            <button key={n} className={n < i ? "past" : n === i ? "now" : ""} onClick={() => go(n)} title={x.eyebrow}><i /></button>
          ))}
        </div>
        <button className="tour-skip" onClick={done}>Geç <kbd>Esc</kbd></button>
      </div>
      <div className={"tour-stage " + (dir > 0 ? "fwd" : "bwd")} key={i}>
        <div className="tour-text">
          <div className="tour-eyebrow"><span>{String(i + 1).padStart(2, "0")}</span>{s.eyebrow}</div>
          <h1>{s.title}</h1>
          <p>{s.text}</p>
          <div className="tour-tips">
            {s.tips.map((t, n) => <div key={n} style={{ animationDelay: `${0.45 + n * 0.1}s` }}>{t.k && <kbd>{t.k}</kbd>}{t.t}</div>)}
          </div>
        </div>
        <div className="tour-scene">{s.scene({ posters: ps })}</div>
      </div>
      <div className="tour-foot">
        <button className="tour-back" onClick={() => go(i - 1)} disabled={i === 0}><Icon d={I.left} size={18} /> Geri</button>
        <div className="tour-count">{i + 1} / {SLIDES.length}</div>
        <div className="tour-act">
          {last && <button className="ghost" onClick={() => { done(); setTimeout(onSettings, 460); }}>Ayarları aç</button>}
          <button className="go" onClick={() => (last ? done() : go(i + 1))}>{i === 0 ? "Başlayalım" : last ? "Luna'ya geç" : "İleri"} <Icon d={I.right} size={18} /></button>
        </div>
      </div>
    </div>
  );
}
