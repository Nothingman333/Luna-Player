# Luna Browser ve Film — NİHAİ TESLİM RAPORU

`Luna-Player-Claude-Browser-Filmler.zip` içindeki `YAN-SOHBET-BROWSER-FILMLER.md` görevinin sonucudur. Commit, push veya merge yapılmadı. "Mükemmel/hatasız" iddiası yoktur; aşağıda gerçek hatalar, geliştirme tercihleri ve doğrulanmayanlar ayrı verilmiştir.

## Teslim dosyaları
| Dosya | İçerik |
|---|---|
| `Luna-Player-Browser-Filmler-NIHAI-kaynak.zip` | Güncel **tam kaynak** (`Luna-Player/`, 211 dosya; node_modules, dist, .git, kişisel veri, API anahtarı yok) + `TESLIM/` (patch, rapor, SHA-256 listesi) |
| `luna-browser-filmler-NIHAI.patch` | Bazdan nihai duruma **kümülatif** `git diff` (yeni dosyalar tam içerikle) |
| `luna-browser-filmler-NIHAI-rapor.md` | Bu rapor (aynısı kaynakta `docs/LUNA-BROWSER-FILMLER-DEGISIKLIKLER.md`) |
| `DEGISEN-DOSYALAR-SHA256.json` | Değişen/yeni her dosya için baz ve yeni SHA-256 (diğer sohbetle birleştirmek için) |
| `luna-ui-check-NIHAI.zip` | İsteğe bağlı: headless Firefox görsel/etkileşim düzeneği (kaynak patch'ine dahil değil) |

`ARA1…ARA6` dosyaları ara teslimlerdir; nihai bunların yerine geçer, birlikte uygulanmaz.

## Baz ve uygulama
**Baz:** `Luna-Player-Claude-Browser-Filmler.zip`, sha256 `b9df1bce44ddd989fee4a9593595bd38f0d48857ea4aeda847c977553b18d709` → `Luna-Web-Asistan-GitHub-Paketi/Kaynak/Luna-Player` (208 dosya; `PAKET-KAYNAK-DOGRULAMA.json` ile birebir doğrulandı; temel commit 31bf2360…).
```
cd Luna-Player
git config core.autocrlf false
git apply --check luna-browser-filmler-NIHAI.patch && git apply luna-browser-filmler-NIHAI.patch
# git deposu yoksa:  patch -p1 < luna-browser-filmler-NIHAI.patch
```
Dosyaların çoğu CRLF'tir; `git apply` satır sonundaki `\r` için "trailing whitespace" uyarısı verir, zararsızdır. Patch temiz baz kopyasına uygulanıp sonuç çalışma ağacıyla `diff -rq` ile birebir karşılaştırıldı. Tam kaynak için ZIP'i açmak yeterlidir (`cd Luna-Player/app && npm ci && npm run build`).

## Değişen dosyalar (18; 3 yeni)
`.github/workflows/ci.yml` · `app/package.json` · `app/scripts/film-browser-regression.cjs` **(yeni)** · `app/src-tauri/src/browser.rs` · `app/src/App.css` · `app/src/App.tsx` · `app/src/Browser.css` · `app/src/Browser.tsx` · `app/src/FilmReviewAi.tsx` · `app/src/Screens.tsx` · `app/src/Taste.tsx` · `app/src/browserModel.ts` · `app/src/extrasModel.ts` · `app/src/i18n-en.ts` · `app/src/library.ts` · `app/src/libraryTools.ts` · `app/src/playbackModel.ts` **(yeni)** · `docs/LUNA-BROWSER-FILMLER-DEGISIKLIKLER.md` **(yeni)**

Diğer sohbetle birleştirme: bağımlılık, kilit dosyası, `tauri.conf.json`, `capabilities/default.json` ve uygulama kimliği (`com.modernplayer.app`) **değişmedi**. Ortak dosyalarda yalnız şu bölümlere dokunuldu:
| Dosya | Dokunulan bölüm |
|---|---|
| `App.tsx` | `episodeNeighbor/leftBehind/recordableProgress` içe aktarma; `browserTab` durumu ve `Browser`/`ChatPanel` prop'ları; mpv olay işleyicisi (`start-file`, `end-file`, `file-loaded` ve 1,5 sn zamanlayıcısı); `progressRef`/`saveProgress`; `nextFile`/`prevFile`; `beforeunload` dinleyicisi |
| `Taste.tsx` | `ChatPanel` imzası + `browserTab`; çeviri yanıt metni; sayfasız soru koruması; bağlam satırı JSX; `recordLbChange` ve iki çağrısı; asistan talimatında bir cümle; `search_film_library` sonucu |
| `library.ts` | `playbackModel` içe aktarma; `parseInSeries` bölüm çıkarımı; dosya sıralamasında eşitlik kırıcı |
| `Screens.tsx` | `Poster` (export + kapak yedeği); dört `card-title` ipucu; Keşfet kartı; `Browse` boş metni |
| `App.css`, `FilmReviewAi.tsx`, `i18n-en.ts`, `extrasModel.ts`, `browserModel.ts`, `libraryTools.ts` | Tek bölümler: kapak yedeği kuralı; analiz dayanak satırı (kitap analiziyle ortak bileşen); 12 İngilizce metin; `listDelta`; model talimatı; `foldText`+`selectLibrary` |
| `ci.yml`, `package.json` | Yeni test adımı ve `test:film-browser` betiği |

## 1) Doğrulanmış gerçek hatalar (tetikleyici → etki → çözüm → kanıt)
**Browser**
| # | Hata | Çözüm | Kanıt |
|---|---|---|---|
| W1 | İndirme engellenince sekme adresi indirme URL'sinde, "yükleniyor"da kalıyordu | Son yüklenen adrese döner, yükleme biter (`Browser.tsx`, `download-blocked`) | Firefox kontrolü |
| W2 | Yönlendirme/URL değişimi adres çubuğunda yazılanı siliyordu | Yalnız sekme değişince sıfırlanır; Esc sayfa adresini geri getirir | Firefox kontrolü |
| W3 | Eski sekmenin eylem/çeviri hatası yeni sekmede gösteriliyordu | Hata ait olduğu sekmeye bağlandı | Kod incelemesi (doğrudan test yok) |
| W4 | Sekme açılırken ikinci tıklama yanlış "en fazla 8 sekme" hatası veriyordu | Tek açılış kilidi (`creatingRef`) | Firefox kontrolü |
| W5 | SPA (history API) gezintisinde sekme adresi güncellenmiyordu | `browser_position` `action:"url"`: yalnız native URL, sayfada script yok; başlık değişince ve 3 sn'de bir sorgu | Firefox + yapı testi |
| W6 | Çok sekmede seçili sekme kırpılıyor, 480 px'te hiç görünmüyordu; "+" kayıyordu | Sekmeler alanı paylaşıp daralır (min 104 px), seçili sekme (pencere daralınca da) görünür alana kaydırılır, "+" sabit | Firefox kontrolü + ekran görüntüsü |
| W7 | Asistanın hangi sekmeyi okuyacağı görünmüyor; açık sayfa yokken sayfa sorusu modele gidiyordu | Panelde sekme satırı; sayfa yokken soru modele gönderilmez; model talimatı "video/ses izlemiş gibi konuşma, önceki mesajlar başka sayfaya ait olabilir" | Tip denetimi + model isteği testi (ekranda render edilmedi) |
| W8 | CI'daki `i18n-check` baz durumda başarısızdı (10 eksik İngilizce metin) | Metinler eklendi | `i18n-check` baz: çıkış 1 → şimdi 0 |

**Film/dizi**
| # | Hata | Çözüm | Konum / kanıt |
|---|---|---|---|
| F1 | mpv yeni yolu, yeni dosyanın süre/konumundan önce bildirir → A'nın yeri B'ye yazılabilir; `close` dışındaki ayrılışlarda son ≤5 sn konum kaybolur | `recordableProgress` (yalnız `file-loaded` sonrası kayıt), `leftBehind` (ayrılırken o dosyaya yaz; kaldırılmışsa geri getirme), `pinFile` yüklenir yüklenmez | `playbackModel.ts`, `App.tsx` · saf fonksiyon testleri (gerçek mpv yok) |
| F2 | Aynı bölümün iki kopyasında "sonraki" aynı bölümü açıyordu; eşit bölümlerde sıra tarama sırasına bağlıydı | `episodeNeighbor`, doğal ad sırası | test |
| F3 | Letterboxd özeti liste yenilemesinden farklı başlık anahtarı ve katı yıl eşleşmesi kullanıyordu → aynı film hem "eklendi" hem "görünmüyor"; "+0/−0" satırları geçmişi dolduruyordu; ilk okuma değişiklik sayılıyordu | `listDelta(before, after, norm)`; boş/ilk okuma satır yazmaz | test |
| F4 | `saveProgress` isteğe bağlı parametre alınca `beforeunload`'a doğrudan verildiğinde olay nesnesi konum sanılacaktı (ara sürümde ben ekledim, tsc yakaladı) | `() => saveProgress()` | tsc |
| F5 | `recordLbChange` serbest `seenKey`'e bağlanınca mevcut B29 testi kırıldı | Test **gevşetilmedi**; anahtar parametre yapıldı | B29 geçiyor |
| F6 | `parseInSeries` ad içindeki **son** sayıyı bölüm sayıyordu: "Bölüm 5 - Part 2" → 2, "Episode 12 - The 100 Days" → **100**, "05 - Chapter 12" → 12 (sıralama, "sonraki bölüm", TMDB bölüm adı sessizce bozulurdu) | Açık işaret → baştaki numara → eski kural; `SxxExx` etkilenmez | test (eski kodda başarısız) |
| F7 | TMDB kapağı yüklenemeyince kart boş koyu kutu kalıyordu; kapaksız kartın yedek başlığı sınırsız taşıyordu | Kapak hata verirse küçük resim/başlık yedeği; 5 satır sınırı; tam ad ipucu | Firefox (gerçek `Poster`, ağ yok → kapaklar gerçekten yüklenemedi) |
| F9 | Kütüphane araması aksan/büyük-küçük harf duyarsız değildi ("isik" → "Işık", "amelie" → "Amélie", "penelope" → "Penélope Cruz") | `foldText`; tam eşleşme korunur | test (eski kodda başarısız) |
| F10 | Diziler görünümünde sonuç yokken "Eşleşen film yok." | "Eşleşen dizi yok." | tip denetimi |
| F11 | Asistan talimatı "Araç bulamazsa uydurma; **olduğunu** söyle" (anlam ters); `search_film_library` 12'den fazla eşleşmede listeyi sessizce kesiyordu | "olmadığını söyle"; "toplam N eşleşme, yalnız ilk 12'si" bilgisi | tip denetimi (model davranışı denenmedi) |
| F12 | `file-loaded` işleyicisindeki 1,5 sn'lik zamanlayıcı, kullanıcı başka dosyaya geçmişse bile `restoring`'i kapatıyordu → B'nin kayıtlı ses/altyazısı geri yüklenmeden mpv varsayılanları B'nin tercihi olarak yazılabilirdi | Zamanlayıcı yalnız dosya hâlâ çalıyorsa kapatır | **Kod okumasıyla bulundu; çalışma zamanı/test kanıtı yok** |

## 2) Tasarım ve işlev geliştirmeleri (hata değil, tercih)
Mevcut Luna renk/tipografi/düğme dili kullanıldı; yeni düzen kurulmadı. İnce yükleme çizgisi (azaltılmış harekette durur) · sekme ve boş-başlık davranışı, sekme ipucu (başlık + adres) · Ctrl+T/W/Tab, F5/Ctrl+R, Alt+←/→ (yalnız Luna arayüzü odaktayken; yazı alanında Alt+ok gezinmez; sekme kapatma sağ komşuya geçer) · asistan bağlam satırı · kapak yedeği ve uzun başlık davranışı · film analizi kartında "okunan N yorumdan yapay zekâyla çıkarıldı; puan/yüzdeler yaklaşık okuma, garanti ve topluluk anketi değil" satırı · aksan duyarsız arama · CI'a `test:browser`, `test:translation`, `test:film-browser` adımı.

Kodda doğrulanan iyi durumlar (değişiklik gerekmedi): Letterboxd yenilemesi listeden/yerel kütüphaneden film **silmiyor** (yalnız ekler; kaybolanlar özette "görünmüyor"); analiz akışı sıfır yorumda hata veriyor, yorum/puan uydurmuyor; seri takibi başlığa değil TMDB koleksiyon kimliğine dayanıyor; Keşfet ekranı her istekte `alive` korumalı, hata/boş durumu var; `customMeta` kimliği 0 olduğundan bilinmeyen eserler tek eser sayılmıyor.

## 3) Doğrulanmamış şüpheler ve sınırlar (gerçek ortamda denenmeli)
- **HTML5 tam ekran:** Kodda WebView2 `ContainsFullScreenElementChanged` işlenmiyor (`browser.rs`/`lib.rs` taraması: 0 eşleşme). Sitedeki video tam ekranının yalnız sayfa alanını doldurması veya çalışmaması olası; Windows'ta denemeden olay işleyicisi yazmak riskli olduğundan **kod değiştirilmedi**.
- Video, DRM, site uyumluluğu, açılır pencere ve site oturumları: gerçek WebView2'de denenmedi; hiçbir sitenin çalışacağı vaadi yoktur. Kod düzeyi gerçekler: oturum kalıcı `web-profile` dizininde; izinler (kamera/mikrofon vb.) reddedilir; açılır pencereler reddedilip araç çubuğunda kullanıcıya sunulur; indirmeler kapalı; 7 native browser komutunun hepsi `trusted(&caller)` korumalı; `capabilities/default.json` yalnız `main` ve `subs`.
- F1 gerçek mpv ile uçtan uca denenmedi; F12 ve F11 yalnız kod okumasıyla.
- Asistan paneli (bağlam satırı, sayfasız soru koruması, kesilen liste bildirimi) ekranda render edilmedi.
- İncelenmedi: oynatıcı zaman çizgisi, `Space` tuşunun odaktaki düğmeyle etkileşimi, sahne notu ve kelime defteri akışlarının ayrıntılı gözden geçirilmesi.
- Canlı TMDB/Letterboxd/AI profili kullanılmadı (anahtarsız birim/mock testlerle ilerlendi).
- Rust: `cargo check --locked --target x86_64-pc-windows-gnu --tests` hatasız bitti (`browser.rs` dahil; o günden beri `browser.rs` değişmedi). Kısıtlar: Linux'ta çapraz derleme *kontrolü*, MSVC değil; `zig cc` ile C bağımlılıkları; ikon/manifest gömen `windres` **taklit betikle** atlandı; çalıştırma ve `cargo test` yapılmadı. Uyarılar yalnız `upscaler.rs`'teki iki eski kullanılmayan fonksiyon.
- Gerçek Windows penceresi bilerek otomatik kontrol edilmedi; görsel kontrolde sayfa alanı taklit köprü nedeniyle boştur.

## 4) Gerçekten çalıştırılan kontroller (son kaynakla)
```
build exit=0 :: 
test:regression exit=0 :: {"baseline":false,"total":37,"passed":37,"failed":0}
test:next exit=0 :: {"baseline":false,"total":32,"passed":32,"failed":0}
test:browser exit=0 :: {"total":12,"passed":12,"failed":0}
test:translation exit=0 :: {"total":8,"passed":8,"failed":0}
test:extras exit=0 :: {"total":12,"passed":12,"failed":0}
test:books-profiles exit=0 :: {"total":14,"passed":14,"failed":0}
test:film-browser exit=0 :: {"total":20,"passed":20,"failed":0}
i18n exit=0
no FAIL lines
```
Yeni betik `film-browser-regression.cjs` 20 test içerir. **Mutasyon kontrolü:** baz `extrasModel.ts`/`browser.rs` ile 5, baz `library.ts` ile 2, baz `libraryTools.ts` ile 2 test başarısız olur; testler eski hataları yakalıyor. Mevcut hiçbir test gevşetilmedi. `film-browser` içindeki `url` eylemi denetimi çalışma zamanı testi değil, kaynak yapısı denetimidir.
Başsız Firefox, gerçek `Browser` bileşeni + taklit native köprü (sekmeler, adres, yükleme, indirme engeli, SPA adresi, 8 sekme, 1280–480 px, klavye):
```
{"total": 34, "passed": 34, "failed": 0}
```
Başsız Firefox, gerçek `Poster` bileşeni, yüklenemeyen kapaklar:
```
{"total": 15, "passed": 15, "failed": 0}
```

## 5) Kesin kod blokları (tam metin patch'te; bunlar dosyalardan alınmıştır)
**`app/src/playbackModel.ts` (yeni dosya, tamamı)**
```ts
/** Pure playback bookkeeping, kept apart from React so it can be tested without a player. */
export type Progress = { path: string; title: string; time: number; duration: number };
type EpisodeFile = { path: string; season?: number; episode?: number };

/** Natural file-name order ("Episode 2" before "Episode 10"). */
export const naturalPath = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

/** The place that may be written for the file on screen. mpv announces a new path before that file's own time and
 *  duration, so until its resume point has been read (`ready`), nothing may be recorded for it: film A's place
 *  must never be saved onto film B. */
export function recordableProgress(path: string | null, title: string, time: number, duration: number, ready: string | null, music: boolean): Progress | null {
  return path && duration > 0 && !music && ready === path ? { path, title, time: Number.isFinite(time) && time > 0 ? time : 0, duration } : null;
}

/** The last place to write when playback leaves `before` (for another file, or for none). Nothing is written for a
 *  file the user took off "Continue watching" meanwhile (`stillListed`), so a removal is never undone. */
export function leftBehind(before: string | null, now: string | null, last: Progress | null, stillListed: boolean): Progress | null {
  return before && before !== now && last?.path === before && stillListed ? last : null;
}

/** The episode after (1) or before (-1) the one at `path` in a show's sorted files. Two copies of the same
 *  episode (720p and 1080p) are one step, so "next" never replays the same episode. */
export function episodeNeighbor<T extends EpisodeFile>(files: T[], path: string, dir: 1 | -1): T | undefined {
  const at = files.findIndex((f) => f.path === path);
  if (at < 0) return undefined;
  const cur = files[at];
  const same = (f: T) => cur.episode != null && f.episode != null && f.episode === cur.episode && (f.season ?? 0) === (cur.season ?? 0);
  for (let i = at + dir; i >= 0 && i < files.length; i += dir) if (!same(files[i])) return files[i];
  return undefined;
}
```
**`app/src/extrasModel.ts` — `listDelta`**
```ts
/** What a list read added and what it no longer shows. Same title + same year is one work; a read that lost
 *  or gained the year (Letterboxd pages do not always carry it) is the same work too, as in the list refresh.
 *  Two different years stay two works (Dune 1984 / Dune 2021). `norm` must match the caller's own title key. */
export function listDelta<T extends { title: string; year?: string }>(before: T[], after: T[],
  norm: (title: string) => string = t => t.normalize("NFC").trim().toLocaleLowerCase()) {
  const name = (x: T) => norm(x.title.normalize("NFC")), exact = (x: T) => name(x) + "|" + (x.year || "");
  const open = new Map<string, number[]>(); // title → indexes of `before` not yet matched
  before.forEach((x, i) => { const k = name(x); open.set(k, [...(open.get(k) ?? []), i]); });
  const matched = new Set<number>(), seen = new Set<string>(), added: T[] = [];
  for (const x of after) {
    const free = open.get(name(x)) ?? [];
    let at = free.findIndex(i => (before[i].year || "") === (x.year || ""));
    if (at < 0) at = free.findIndex(i => !before[i].year || !x.year);
    if (at >= 0) { matched.add(free[at]); seen.add(exact(x)); free.splice(at, 1); continue; }
    // a repeated entry of a work already matched (a rewatch in a diary) is not new
    if (seen.has(exact(x)) || before.some((b, i) => matched.has(i) && name(b) === name(x) && (!b.year || !x.year || b.year === x.year))) continue;
    added.push(x); seen.add(exact(x));
  }
  return { added, removed: before.filter((_, i) => !matched.has(i) && !after.some(a => name(a) === name(before[i]) && (a.year || "") === (before[i].year || ""))) };
}
```
**`app/src/libraryTools.ts` — `foldText` (`selectLibrary` içinde `|| foldText(searchable).includes(folded)` eklendi)**
```ts
export const foldText = (s: string) => s.normalize("NFD").replace(/\p{M}+/gu, "").replace(/ı/g, "i").replace(/ø/gi, "o").replace(/æ/gi, "ae").replace(/œ/gi, "oe").replace(/ß/g, "ss").replace(/ł/gi, "l").replace(/đ/gi, "d").toLowerCase();
```
**`app/src/library.ts` — `parseInSeries` bölüm çıkarımı**
```ts
  // An explicit marker wins ("Bölüm 5 - Part 2" is episode 5, "Episode 12 - The 100 Days" is 12), then a leading
  // number ("05 - Chapter 12"); only without either is the last number taken.
  const marked = name.match(/(?<![\p{L}\d])(?:bölüm|bolum|episode|ep|e|b)[\s._-]*(\d{1,3})(?!\d)/iu);
  const lead = name.match(/^\s*(\d{1,3})\s*[-._)\]]/);
  const episode = marked ? +marked[1] : lead ? +lead[1] : nums.length ? nums[nums.length - 1] : undefined;
  return { kind: "tv", title: show ? clean(show) : p.title, season: sm ? +(sm[1] ?? sm[2]) : 1, ...(episode != null ? { episode } : {}) };
```
**`app/src-tauri/src/browser.rs` — `browser_position` içinde `url` dalı**
```rust
    // In-page (history API) navigation raises no load event; the UI asks for the native address. No page script runs.
    if action=="url" {return Ok(serde_json::json!({"url":before.as_str()}));}
```
**`app/src/App.tsx` — `file-loaded` 1,5 sn zamanlayıcısı (F12)**
```ts
        // (only if this file is still the one playing: a stale timer of file A must not end B's restore phase,
        // or B's saved dub/subtitle would be overwritten by mpv's defaults)
        setTimeout(() => { if (pathRef.current !== p) return; restoring.current = false; setTrackTick((n) => n + 1); }, 1500);
```
