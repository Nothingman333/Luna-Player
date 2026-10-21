import { lang, setLang, tt } from "./i18n";
import { useEffect, useState } from "react";
import { IMG, store } from "./library";
import { I, Icon, LunaMark } from "./Screens";

/**
 * First-run presentation: what Luna does and how to use it, one animated scene per step.
 * Someone who saw an older one gets only what's new since (once).
 */
type Theme = "film" | "music" | "books";
type Slide = { eyebrow: string; title: string; text: string; tips: { k?: string; t: string }[]; scene: (p: ScenePosters) => React.ReactNode;
  /** the part's colour while the slide is on */
  theme?: Theme;
  /** new since the last tour: shown to those who saw that one */
  fresh?: boolean };
/** Raised when slides are added: the ones marked fresh are shown once to people who saw the tour before. */
const TOUR_V = 2;
const MUSIC_D = "M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z";
const BOOK_D = "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 21V5";
const FILM_D = "M4 4h16v16H4zM8 4v16M16 4v16";
const SPARK_D = "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z";
const Eq = () => <div className="eq"><i /><i /><i /><i /><i /></div>;
/** A sentence read aloud: the word being read lights up, one after another. */
const Spoken = ({ text }: { text: string }) => {
  const w = text.split(" ");
  return <p className="spoken" style={{ ["--n" as any]: w.length }}>{w.map((x, n) => <span key={n} style={{ ["--i" as any]: n }}>{x} </span>)}</p>;
};
const Intro = () => (
  <div className="ts ts-intro">
    <div className="ring r1" /><div className="ring r2" /><div className="ring r3" />
    <div className="orbit"><span className="o-film"><Icon d={FILM_D} size={14} /></span><span className="o-music"><Icon d={MUSIC_D} size={14} /></span><span className="o-books"><Icon d={BOOK_D} size={14} /></span></div>
    <div className="mark"><LunaMark size={120} /></div>
  </div>
);
type ScenePosters = { posters: (string | null)[] };

const P = (posters: (string | null)[], n: number) => posters[n % Math.max(1, posters.length)] ?? null;
/**
 * Real posters for the films the scenes name, and well-known ones for an empty library (a first run).
 * Shown from TMDB's own image server, like the library's: nothing is copied into Luna. Not on the torrent step,
 * and not on the content-warning step (a real film shouldn't stand there as "disturbing").
 */
const KNOWN = {
  prisoners: "/uhviyknTT5cEQXbn6vWIqfM4vGm.jpg", zodiac: "/6YmeO4pB7XTh8P8F960O1uA14JO.jpg", dune84: "/4kJmUCE7mkVJjXa7A0g2rY4IGTm.jpg",
  dune2: "/6izwz7rsy95ARzTR3poZ8H6c5pp.jpg", br2049: "/gajva2L0rPYkEWjzgFlBXCAVBE5.jpg", interstellar: "/yQvGrMoipbRoddT0ZR8tPoR7NfX.jpg",
};
const FILLER = ["/pEzNVQfdzYDzVK0XqxERIw2x2se.jpg", "/xlaY2zyzMfkhk0HSC5VUwzoZPU1.jpg", "/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg", "/jUo8cNmU400WtZiJss45HNXlQ2e.jpg",
  "/ulcAi4dKpAjHwYGS08vNyx9H6I9.jpg", "/eCOtqtfvn7mxGl6nfmq4b1exJRc.jpg", "/7fn624j5lj3xTme2SgiLCeuedmO.jpg", "/dXNAPwY7VrqMAo51EKhhCJfaGb5.jpg",
  "/nSxDa3M9aMvGVLoItzWTepQ5h5d.jpg", "/v1tRXZ4JtD2Iv6fjkPvT4GiwslV.jpg", KNOWN.br2049, KNOWN.interstellar];
const Poster = ({ src, className, style }: { src: string | null; className?: string; style?: React.CSSProperties }) => (
  <div className={"tv-poster " + (className ?? "")} style={{ ...style, ...(src ? { backgroundImage: `url(${IMG}w342${src})` } : {}) }} />
);

const ALL: Slide[] = [
  {
    eyebrow: tt("Hoş geldin"), title: "Luna Player",
    text: tt("Filmlerin, dizilerin, müziğin ve kitapların tek yerde. Ne izleyeceğini, ne dinleyeceğini, ne okuyacağını bilen bir asistanla. Birkaç adımda neler yapabildiğine bakalım."),
    tips: [{ k: "→", t: tt("ile ilerle") }, { k: "Esc", t: tt("ile geç") }],
    scene: () => <Intro />,
  },
  {
    eyebrow: tt("Üç bölüm"), title: tt("Film, Müzik, Kitap"), fresh: true,
    text: tt("Luna'nın üç bölümü var, her biri kendi rengiyle. Üst çubuktaki düğmeyle aralarında geçersin; müzik sen film sayfalarında gezerken de çalmaya devam eder."),
    tips: [{ t: tt("Üst çubukta Film / Müzik / Kitap") }, { t: tt("Ortak geçmiş: izlediğin, dinlediğin, okuduğun her şey") }],
    scene: ({ posters }) => (
      <div className="ts ts-modes">
        <div className="sw"><i className="pill" />
          <span className="m0"><Icon d={FILM_D} size={14} /> {tt("Film")}</span>
          <span className="m1"><Icon d={MUSIC_D} size={14} /> {tt("Müzik")}</span>
          <span className="m2"><Icon d={BOOK_D} size={14} /> {tt("Kitap")}</span>
        </div>
        <div className="cards">
          <div className="mc c0"><Poster src={P(posters, 0)} className="art" /><b>{tt("Film")}</b><em>{tt("Kütüphane, oynatıcı, öneriler")}</em></div>
          <div className="mc c1"><div className="art"><Eq /></div><b>{tt("Müzik")}</b><em>{tt("Arşiv, YouTube, radyo, podcast")}</em></div>
          <div className="mc c2"><div className="art"><i /><i /><i /><i /></div><b>{tt("Kitap")}</b><em>{tt("Okuyucu, sesli okuma, ücretsiz kitaplar")}</em></div>
        </div>
      </div>
    ),
  },
  {
    eyebrow: tt("Kütüphane"), title: tt("Klasörünü ver, gerisini Luna halleder"),
    text: tt("Video klasörlerini ekle. Luna dosya adlarından filmi ve diziyi tanır; afişi, özeti, oyuncuları ve fragmanı getirir. Diziler bölüm bölüm gruplanır, kaldığın yer hatırlanır."),
    tips: [{ t: tt("Yanlış tanınan dosyada sağ tık › Eşleşmeyi düzelt") }, { t: tt("Yabancı dildeki özetler otomatik Türkçeye çevrilir") }],
    scene: ({ posters }) => (
      <div className="ts ts-lib">
        <div className="file"><Icon d={I.folder} size={16} />  {tt("Filmler klasörü taranıyor…")}</div>
        <div className="grid">
          {Array.from({ length: 8 }, (_, n) => <Poster key={n} src={P(posters, n)} style={{ animationDelay: `${0.25 + n * 0.08}s` }} />)}
        </div>
        <div className="sweep" />
        <div className="found"><Icon d={I.check} size={16} />  {tt("Tanındı · afiş, özet, oyuncular")}</div>
      </div>
    ),
  },
  {
    eyebrow: tt("Oynatıcı"), title: tt("Her formatı açar, sana uyar"),
    text: tt("mpv tabanlı güçlü bir oynatıcı. Fare tekerleği sesi, yön tuşları sarmayı yapar; sağ tık menüsünden ses, altyazı ve görüntü ayarlarına ulaşırsın. Altyazı yoksa Luna senin için arar."),
    tips: [{ k: tt("Boşluk"), t: tt("oynat / duraklat") }, { k: "F", t: tt("tam ekran") }, { k: "← →", t: tt("ileri / geri sar") }],
    scene: ({ posters }) => (
      <div className="ts ts-player">
        <div className="screen">
          <Poster src={P(posters, 2)} className="bgp" />
          <div className="sub">{tt("— Bunu daha önce de görmüştüm.")}</div>
          <div className="vol"><Icon d={I.vol} size={18} /><div><i /></div></div>
          <div className="bar"><i /><b /></div>
        </div>
        <div className="keys"><kbd className="k1">{tt("Boşluk")}</kbd><kbd className="k2">F</kbd><kbd className="k3">→</kbd></div>
      </div>
    ),
  },
  {
    eyebrow: tt("Görüntü kalitesi"), title: tt("Daha keskin, daha akıcı"),
    text: tt("Lossless Scaling yüklüyse Luna onu kendisi yönetir: düşük çözünürlüklü videolar FSR ya da NIS ile ekrana göre büyütülür, kare üretimi 60 FPS'i 120'ye çıkarır. Altyazılar ayrı bir katmanda kalır, bulanıklaşmaz."),
    tips: [{ k: "Q", t: tt("Upscaler aç / kapat") }, { t: tt("Oynatıcıdaki UP düğmesi") }, { t: tt("İsteğe bağlı: Steam'den Lossless Scaling") }],
    scene: () => (
      <div className="ts ts-up">
        <div className="screen">
          <Poster src={KNOWN.br2049} className="lo" /><Poster src={KNOWN.br2049} className="hi" />
          <i className="split" /><span className="l">720p</span><span className="r">4K · FSR</span>
          <div className="sub">{tt("— Altyazı her zaman net.")}</div>
        </div>
        <div className="fps"><b>60</b><Icon d={I.right} size={16} /><b className="x2">120</b><span>FPS</span><em>{tt("Kare üretimi")}</em></div>
      </div>
    ),
  },
  {
    eyebrow: tt("Bağlantı ve torrent"), title: tt("Bir bağlantı yapıştırman yeterli"),
    text: tt("Magnet, .torrent ya da http, m3u8, rtsp gibi ağ bağlantılarını VLC gibi doğrudan açarsın. Torrentler inerken izlenebilir; adı bulunamayan bağlantılar için sana sorulur."),
    tips: [{ k: "Ctrl+N", t: tt("bağlantı aç") }, { k: "Ctrl+V", t: tt("pencereye yapıştır") }],
    scene: () => (
      <div className="ts ts-link">
        <div className="box">
          <div className="lbl"><Icon d={I.magnet} size={16} />  {tt("Bağlantı aç")}</div>
          <div className="input"><span className="typed">{"magnet:?xt=urn:btih:0123abcd…&dn=Medya"}</span><i className="caret" /></div>
          <div className="dl">
            <div className="row"><b>{tt("Medya İndiriliyor")}</b><span>{tt("izlemeye hazır")}</span></div>
            <div className="prog"><i /></div>
          </div>
        </div>
      </div>
    ),
  },
  {
    eyebrow: tt("Öneriler"), title: tt("Zevkini öğrenir"),
    text: tt("Beğendiğin ve beğenmediğin filmleri 10 üzerinden puanla, Luna zevkini öğrensin. Arkadaşlarının Letterboxd profillerini ekleyip onların listelerine ve önerilerine de göz atabilirsin."),
    tips: [{ t: tt("👍 / 👎 sonrası puan sorulur") }, { t: tt("Sonra izle listesi ve günlük özet sayfasında") }],
    scene: ({ posters }) => (
      <div className="ts ts-recs">
        {[0, 1, 2].map((n) => <Poster key={n} src={P(posters, n + 4)} className={"c c" + n} />)}
        <div className="like">👍</div>
        <div className="rate">
          <span>{tt("Kaç puan?")}</span>
          <div>{Array.from({ length: 10 }, (_, n) => <i key={n} className={n < 8 ? "on" : ""} style={{ animationDelay: `${1.1 + n * 0.06}s` }}>{n + 1}</i>)}</div>
        </div>
        <div className="friends"><span>A</span><span>D</span><span>E</span><em>{tt("Arkadaşın beğendi")}</em></div>
      </div>
    ),
  },
  {
    eyebrow: tt("İçerik uyarıları"), title: tt("Görmek istemediğini saklar"),
    text: tt("Moderasyon açıkken rahatsız edici içerik barındıran filmlerin afişi bulanıklaşır ve kırmızı bir yıldızla işaretlenir. Sana uygunsa “Güvenli olarak işaretle” demen yeterli."),
    tips: [{ t: tt("Öneriler sayfasındaki anahtarla açılıp kapanır") }, { t: tt("İşaretlediklerin zevkine göre hatırlanır") }],
    scene: () => (
      <div className="ts ts-mod">
        <Poster src={null} className="mp" />
        <div className="star">★</div>
        <div className="warn"><b>{tt("İçerik uyarısı")}</b><span>{tt("Şiddet · Rahatsız edici sahneler")}</span><button>{tt("Güvenli olarak işaretle")}</button></div>
      </div>
    ),
  },
  {
    eyebrow: tt("Film asistanı"), title: tt("Sor, o bulsun"),
    text: tt("Sağ üstteki sohbet düğmesiyle film asistanını aç. “Bu akşam ne izlesem?” ya da “Dune'da kimler oynuyor?” diye sor; film sayfaları, sahneler, oyuncular ve kaynaklarla cevap verir. Büyütünce geniş bir çalışma alanına dönüşür."),
    tips: [{ k: "Alt+A", t: tt("asistanı aç / kapat") }, { t: tt("Kalın film adlarına tıklayınca sayfası açılır") }, { t: tt("Geçmiş sohbetler saklanır") }],
    scene: () => (
      <div className="ts ts-chat">
        <div className="me">{tt("Bu akşam gerilimli bir şey izlesem?")}</div>
        <div className="dots"><i /><i /><i /></div>
        <div className="bot">
          <span>{tt("Zevkine göre şunlar iyi gider:")}</span>
          <div className="pick"><Poster src={KNOWN.prisoners} /><div><b>{tt("Prisoners (2013)")}</b><em>{tt("Tutsaklar · ★ 8,1")}</em></div></div>
          <div className="pick"><Poster src={KNOWN.zodiac} /><div><b>{tt("Zodiac (2007)")}</b><em>{tt("Zodyak · ★ 7,7")}</em></div></div>
        </div>
      </div>
    ),
  },
  {
    eyebrow: tt("Müzik"), title: tt("Dinlediğin her şey"), theme: "music", fresh: true,
    text: tt("Kendi arşivini ekle ya da hiçbir şey indirmeden YouTube'dan çal. Radyo, podcast, eş zamanlı şarkı sözleri, beğendiklerin ve çalma listelerin burada; Spotify ve YouTube listelerini de içe aktarabilirsin."),
    tips: [{ k: "Ctrl+→", t: tt("sonraki şarkı") }, { k: tt("Boşluk"), t: tt("oynat / duraklat") }, { t: tt("Spotify listesi yapıştır › içe aktar") }],
    scene: () => (
      <div className="ts ts-music">
        <div className="np">
          <div className="art"><Icon d={MUSIC_D} size={46} /></div>
          <div className="lyr">
            {[tt("Gece yine sessiz,"), tt("şehrin ışıkları uzakta;"), tt("bir şarkı çalıyor içimde,"), tt("sabaha kadar.")].map((l, n) => <p key={n} style={{ animationDelay: `${0.6 + n * 1.3}s` }}>{l}</p>)}
          </div>
        </div>
        <div className="dock">
          <div className="cov"><Icon d={MUSIC_D} size={16} /></div>
          <div className="t"><b>{tt("Gece Şarkısı")}</b><span>{tt("Luna Orkestrası")}</span></div>
          <Eq />
          <div className="bar"><i /></div>
        </div>
        <div className="chips"><span>{tt("Radyo")}</span><span>{tt("Podcast")}</span><span>♥ {tt("Beğendiklerim")}</span><span>{tt("Sözler")}</span></div>
      </div>
    ),
  },
  {
    eyebrow: tt("Kitaplar"), title: tt("Oku ya da dinle"), theme: "books", fresh: true,
    text: tt("EPUB ve PDF kitaplarını rahat bir okuyucuda aç; kaldığın yer hatırlanır. Luna kitabı doğal seslerle sesli okur, okunan kelimeyi işaretler. Gutenberg, Vikikaynak ve LibriVox'tan ücretsiz kitapları ve sesli kitapları bulup getirir."),
    tips: [{ t: tt("Bir yeri seç › buradan sesli oku") }, { t: tt("Okurken müzik paneli") }, { t: tt("Raflar: okuyorum, bitti, beğendim") }],
    scene: () => (
      <div className="ts ts-books">
        <div className="book">
          <div className="pg">
            <h4>{tt("Birinci Bölüm")}</h4>
            <Spoken text={tt("Kum tepelerinin ardında güneş yavaşça batıyor, rüzgâr eski bir şarkıyı fısıldıyordu.")} />
            <i /><i /><i className="s" />
          </div>
          <div className="pg"><i /><i /><i /><i className="s" /><i /><i /><i className="s" /></div>
        </div>
        <div className="read"><Icon d={I.vol} size={15} /> {tt("Sesli okuma · doğal ses")}<Eq /></div>
        <div className="free">
          {["Gutenberg", "Vikikaynak", "LibriVox"].map((n, k) => <span key={n} style={{ animationDelay: `${1.4 + k * 0.2}s` }}><b>{n}</b><em>{tt("Ücretsiz")}</em></span>)}
        </div>
      </div>
    ),
  },
  {
    eyebrow: tt("Asistan"), title: tt("Her yerde yanında"), fresh: true,
    text: tt("Asistan üç bölümün hepsinde çalışır: film önerir ve açar, şarkı çalar ve çalma listesi yapar, ücretsiz kitap bulup getirir. Ekranda ne açık olduğunu görür; bir film ve bir şarkı aynı anda açıksa hangisinden bahsettiğini sana sorar."),
    tips: [{ k: "Alt+A", t: tt("her ekrandan aç") }, { t: tt("Büyütünce geniş çalışma alanı, sohbetler saklanır") }, { t: tt("Bilgi soruları Google'da aranır, kaynaklarıyla") }],
    scene: () => (
      <div className="ts ts-ai">
        <div className="focus"><span className="q">{tt("Hangisi hakkında?")}</span>
          <span className="o"><Icon d={FILM_D} size={12} /> {tt("Dune")} <small>{tt("Film sayfası")}</small></span>
          <span className="o on"><Icon d={MUSIC_D} size={12} /> {tt("Main Title")} <small>{tt("Çalıyor")}</small></span>
        </div>
        <div className="me">{tt("Bu şarkı hangi filmde geçiyor?")}</div>
        <div className="think"><i /> {tt("İnternette araştırıyorum")}</div>
        <div className="bot">
          <span>{tt("Toto'nun “Main Title”ı, Dune (1984) filminin açılış müziği.")}</span>
          <div className="pick"><Poster src={KNOWN.dune84} /><div><b>{tt("Dune (1984)")}</b><em>{tt("David Lynch · film müziği: Toto")}</em></div></div>
        </div>
        <div className="asks">
          {[tt("Dune'un müziklerinden bir liste yap"), tt("Ücretsiz bir Dostoyevski romanı bul"), tt("Bu akşam ne izlesem?"), tt("Sakin bir radyo aç")].map((x, n) => <span key={n} style={{ animationDelay: `${3 + n * 0.25}s` }}>{x}</span>)}
        </div>
      </div>
    ),
  },
  {
    eyebrow: tt("Koleksiyonlar"), title: tt("Bir evrenin hepsi, tek listede"), fresh: true,
    text: tt("“Dune için koleksiyon yap” de: asistan internette araştırır, filmleri TMDB'de kontrol eder, kitapları ve film müziklerini bulur. Hepsini onayına sunar; istemediklerinin tikini kaldırırsın. Henüz çıkmamış filmler “Çıkması bekleniyor” diye işaretlenir."),
    tips: [{ t: tt("Üst çubukta Koleksiyonlar") }, { t: tt("Elle ekle, Google'da ara, fragmanı izle") }, { t: tt("Sağ tık › Koleksiyona ekle…") }],
    scene: () => (
      <div className="ts ts-coll">
        <div className="steps">
          {[tt("İnternette araştırıyorum"), tt("Filmleri TMDB'de kontrol ediyorum"), tt("Onayını bekliyorum")].map((x, n) => <span key={n} style={{ animationDelay: `${0.3 + n * 0.55}s` }}><Icon d={I.check} size={12} /> {x}</span>)}
        </div>
        <div className="card">
          <div className="h"><Icon d={SPARK_D} size={16} /> <b>{tt("Dune Evreni")}</b></div>
          {([
            [FILM_D, tt("Filmler ve diziler"), [[tt("Dune · 1984"), 1], [tt("Dune: Part Two · 2024"), 1], [tt("Dune: Part Three"), 2]]],
            [MUSIC_D, tt("Müzikler"), [[tt("Paul's Dream · Hans Zimmer"), 1], [tt("Main Title · Toto"), 0]]],
            [BOOK_D, tt("Kitaplar"), [[tt("Dune · Frank Herbert"), 1], [tt("Dune Mesihi · Frank Herbert"), 1]]],
          ] as [string, string, [string, number][]][]).map(([ic, h, rows], g) => (
            <div key={g} className="grp">
              <div className="gh"><Icon d={ic} size={13} /> {h}</div>
              {rows.map(([t, st], n) => (
                <div key={n} className={"row" + (st === 0 ? " off" : "")} style={{ animationDelay: `${1.9 + g * 0.45 + n * 0.15}s` }}>
                  <i className="tick">{st !== 0 && <Icon d={I.check} size={11} />}</i><span>{t}</span>{st === 2 && <em>{tt("Çıkması bekleniyor")}</em>}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    eyebrow: tt("Geçmiş ve güvenlik"), title: tt("Hiçbir şey kaybolmaz"), fresh: true,
    text: tt("İzlediğin, dinlediğin ve okuduğun her şey tek bir geçmişte, gün gün durur; asistan da ona bakar. Ayarlar'dan her şeyini tek bir dosyaya yedeklersin. Luna yeni sürümleri kendisi bulur, sorup kurar."),
    tips: [{ t: tt("Koleksiyonlar › Geçmiş") }, { t: tt("Ayarlar › Yedekleme") }, { t: tt("Ayarlar › Genel › güncellemeler") }],
    scene: () => (
      <div className="ts ts-hist">
        <div className="tl">
          {([[FILM_D, "c-film", tt("Dune: Part Two"), tt("İzlendi · %62 → %100"), tt("Bugün 21:40")],
            [MUSIC_D, "c-music", tt("Paul's Dream"), tt("Hans Zimmer"), tt("Bugün 20:15")],
            [BOOK_D, "c-books", tt("Dune"), tt("Okundu · 38 dk"), tt("Dün")],
            [MUSIC_D, "c-music", tt("Gece Şarkısı"), tt("Luna Orkestrası"), tt("Dün")]] as string[][]).map(([ic, c, t, d, w], n) => (
            <div key={n} className={"ev " + c} style={{ animationDelay: `${0.3 + n * 0.18}s` }}>
              <i><Icon d={ic} size={14} /></i><div><b>{t}</b><span>{d}</span></div><em>{w}</em>
            </div>
          ))}
        </div>
        <div className="upd"><Icon d={SPARK_D} size={18} /><div><b>{tt("Yeni sürüm hazır")}</b><span>{tt("İmzalı ve doğrulandı · yeniden başlat")}</span></div></div>
        <div className="bk"><Icon d={I.check} size={14} /> {tt("Yedek alındı · tek dosya")}</div>
      </div>
    ),
  },
  {
    eyebrow: tt("Kısayollar"), title: tt("Klavyeyle her şey"), fresh: true,
    text: tt("Fareye uzanmadan: asistanı Alt+A ile her ekrandan açarsın, dosyayı Ctrl+O ile, bağlantıyı Ctrl+N ile. Yazı yazarken kısayollar araya girmez."),
    tips: [{ k: "Alt+A", t: tt("asistan") }, { k: "Esc", t: tt("açık olanı kapatır") }],
    scene: () => (
      <div className="ts ts-keysc">
        {([["Alt+A", tt("Asistanı aç")], ["Ctrl+O", tt("Dosya aç")], ["Ctrl+N", tt("Bağlantı aç")], [tt("Boşluk"), tt("Oynat / duraklat")], ["F", tt("Tam ekran")],
          ["← →", tt("İleri / geri sar")], ["Ctrl+→", tt("Sonraki şarkı")], ["Alt+←", tt("Geri dön")], ["Esc", tt("Kapat")]] as [string, string][]).map(([k, t], n) => (
          <div key={n} className={"kr" + (n === 0 ? " star" : "")} style={{ ["--i" as any]: n }}><kbd>{k}</kbd><span>{t}</span></div>
        ))}
      </div>
    ),
  },
  {
    eyebrow: tt("Son adım"), title: tt("Anahtarlarını ekle"),
    text: tt("Bazı özellikler ücretsiz anahtarlar ister. Ayarlar'dan birkaç dakikada girebilirsin; girmesen de oynatıcı her zaman çalışır."),
    tips: [{ t: tt("Bu sunuma Ayarlar'dan tekrar ulaşabilirsin") }, { t: tt("Luna yeni sürümleri kendisi bulur") }],
    scene: () => (
      <div className="ts ts-keys">
        {[["TMDB", tt("Afiş, özet, oyuncular, öneriler"), I.film], ["Gemini", tt("Asistan, koleksiyonlar ve çeviriler"), I.chat], ["OpenSubtitles", tt("Altyazı arama"), I.subs]].map(([n, d, ic], k) => (
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

const NEWS: Slide = {
  eyebrow: tt("Yenilikler"), title: tt("Luna büyüdü"),
  text: tt("Son tanıtımdan bu yana Luna'ya müzik, kitaplar, koleksiyonlar ve her bölümde çalışan bir asistan geldi. Kısaca bakalım."),
  tips: [{ k: "→", t: tt("ile ilerle") }, { k: "Esc", t: tt("ile geç") }],
  scene: () => <Intro />,
};

/** Seen this tour (an older one counts too: then only what's new is shown, see tourNews). */
export const tourSeen = () => store.get("tourDone") === "1" && Number(store.get("tourV") ?? 1) >= TOUR_V;
/** Saw an older tour: the new slides are shown once. */
export const tourNews = () => store.get("tourDone") === "1" && Number(store.get("tourV") ?? 1) < TOUR_V;

export function Tour({ onClose, onSettings, posters = [], news = false }: { onClose: () => void; onSettings: () => void; posters?: (string | null)[]; news?: boolean }) {
  const [SLIDES] = useState(() => (news ? [NEWS, ...ALL.filter((x) => x.fresh), ALL[ALL.length - 1]] : ALL));
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const [leaving, setLeaving] = useState(false);
  const last = i === SLIDES.length - 1;
  const go = (n: number) => { if (n < 0 || n >= SLIDES.length) return; setDir(n > i ? 1 : -1); setI(n); };
  const done = () => { store.set("tourDone", "1"); store.set("tourV", String(TOUR_V)); setLeaving(true); setTimeout(onClose, 450); };
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
  const ps = [...new Set([...posters.filter(Boolean), ...FILLER])];
  return (
    <div className={"tour-bg t-" + (s.theme ?? "film") + (leaving ? " out" : "")} style={{ ["--step" as any]: i }}>
      <div className="tour-glow g1" /><div className="tour-glow g2" />
      <div className="tour-grain" />
      <div className="tour-top">
        <div className="brand"><LunaMark size={24} />  {tt("Luna Player")}</div>
        <div className="tour-prog">
          {SLIDES.map((x, n) => (
            <button key={n} className={n < i ? "past" : n === i ? "now" : ""} onClick={() => go(n)} title={x.eyebrow}><i /></button>
          ))}
        </div>
        <div className="tour-lang">
          <button className={lang() === "en" ? "on" : ""} onClick={() => lang() !== "en" && setLang("en")}>EN</button>
          <button className={lang() === "tr" ? "on" : ""} onClick={() => lang() !== "tr" && setLang("tr")}>TR</button>
        </div>
        <button className="tour-skip" onClick={done}>{tt("Geç")} <kbd>{tt("Esc")}</kbd></button>
      </div>
      <div className={"tour-stage " + (dir > 0 ? "fwd" : "bwd")} key={i}>
        <div className="tour-text">
          <div className="tour-eyebrow"><span>{String(i + 1).padStart(2, "0")}</span>{s.eyebrow}{s.fresh && !news && <em className="tour-new">{tt("Yeni")}</em>}</div>
          <h1>{s.title}</h1>
          <p>{s.text}</p>
          <div className="tour-tips">
            {s.tips.map((t, n) => <div key={n} style={{ animationDelay: `${0.45 + n * 0.1}s` }}>{t.k && <kbd>{t.k}</kbd>}{t.t}</div>)}
          </div>
        </div>
        <div className="tour-scene">{s.scene({ posters: ps })}</div>
      </div>
      <div className="tour-foot">
        <button className="tour-back" onClick={() => go(i - 1)} disabled={i === 0}><Icon d={I.left} size={18} />  {tt("Geri")}</button>
        <div className="tour-count">{i + 1} / {SLIDES.length}<small className="tour-credit">{tt("Film afişleri ve bilgileri TMDB'den")}</small></div>
        <div className="tour-act">
          {last && <button className="ghost" onClick={() => { done(); setTimeout(onSettings, 460); }}>{tt("Ayarları aç")}</button>}
          <button className="go" onClick={() => (last ? done() : go(i + 1))}>{i === 0 ? tt("Başlayalım") : last ? tt("Luna'ya geç") : tt("İleri")} <Icon d={I.right} size={18} /></button>
        </div>
      </div>
    </div>
  );
}
