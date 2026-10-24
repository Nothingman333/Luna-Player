# Luna 1.6.8C — temel güvenlik, kararlılık ve performans paketi

Tarih: 2026-10-23. Taban: yerel `master`, `83a68ff` (1.6.7CC).
Bu paket ek geliştirme raporunun tamamı değildir. Aşağıda uygulanmayan maddeler de belirtilmiştir.

## Değişen davranışlar

- `mpv_command` artık Rust'ta izin verilen komutları ve yazılabilir özellikleri denetler. `run`, `subprocess`, script/config seçenekleri, keyfi dosyaya ekran görüntüsü yazımı ve keyfi lavfi grafikleri reddedilir. Dosya başına seçenekler de ayrı izin listesine tabidir; `%n%` kaçışları UTF-8 bayt uzunluğu ile okunur. Mevcut EQ, AutoEQ shelf filtreleri, gece modu, normalize, CAS, hqdn3d ve ekran görüntüsü korunur. Ekran görüntüsü dizini native başlangıçta Masaüstü olarak belirlenir.
- Üretim CSP'si etkinleştirildi. Tauri IPC/asset, kapaklar, EPUB blob çerçeveleri, PDF worker/WASM ve özel HTTP sağlayıcıları için gereken kaynak türleri tanımlıdır. Dev CSP, Vite geliştirme bağlantılarını destekler. Harici native webview IPC reddi korunur.
- PGS bütün zaman olaylarını almaya devam eder. Arayüze normal `time-pos` akışı en fazla 5 Hz ile iletilir; dosya değişimi/seek durumunda sayaç sıfırlanır. React aynı skaler değerde yeni state üretmez. App'in zaman deposundan tamamen ayrılması henüz yapılmadı.
- Film devam konumu, başlangıçtan açma, nottan sahneye geçiş, gecikmeler, altyazı hızı ve gömülü ses/altyazı seçimi dosya yükleme seçenekleridir. Sabit 350/1500 ms geri yükleme zamanlayıcıları kaldırıldı. Harici altyazılar `file-loaded` sonrası gerçek mpv IPC yanıtları ile eklenir. Gecikmiş yanıtlar dosya/nesil kontrolünden geçer.
- Native `mpv_command` artık mpv'nin yanıtını bekler; `get_property` veri döndürür, hata veya kopma reject olur. Komut beklemesi 30 saniye ile sınırlıdır.
- mpv süreci/IPC bağlantısı koparsa hata olayı yayınlanır ve aynı HWND'de en fazla üç yeniden başlatma denenir. Gözlemciler, ayarlar, etiketli filtreler ve son dosya geri yüklenir; son zaman ve duraklatma durumu uygulanır. Kapatma yeniden başlatmayı engeller; `stop` son dosyayı temizler. Tek görev IPC okuma/yazmayı sahiplenir; eski yazıcı yeni bağlantıda yaşamaz.
- Önbellek adları `stable_cache` içindeki alan/uzunluk ayrımlı SHA-256 anahtarlarıdır (128 bit kesit). Thumbnail/still/preview/studio/PGS dosya boyutu ve değiştirilme zamanını içerir. Kitap/müzik kapakları ve altyazı fallback adları da sabittir. Eski dosyalar silinmez; gerektiğinde yeni adla önbellek oluşturulur.
- `lock().unwrap()` kullanımları zehirli kilitte `into_inner()` ile toparlanır. Release panic davranışı `unwind` oldu; bu tüm paniklerin uygulama kapanmadan kurtulacağı iddiası değildir.
- Durum anlık görüntüleri anahtar sırasına göre kararlı serileştirilir, yazmalar sıraya alınır, başarıyla kaydedilen aynı içerik atlanır. Hata sonrasında yeniden denenebilir. Native `state_save` de aynı dosya içeriğini yeniden yazmaz ve aynı içerik için `.bak` oluşturmaz.
- Video/müzik/kitap taramaları gizli ve sistem klasörlerine, `$RECYCLE.BIN`, `System Volume Information` ve junction/reparse dizinlerine girmez. Klasör seçim ekranının sayacı da aynı sınırı uygular.
- Desteklenen video, ses ve kitap uzantıları için Tauri `fileAssociations` eklendi. Varsayılan oynatıcı kullanıcı adına değiştirilmez; NSIS ilişkilendirme testi henüz yapılmadı.
- Görüntü panelinde kapalı/NVIDIA RTX/Intel VSR seçimi vardır. D3D11VA, nv12 ve 2x d3d11vpp kullanır. CPU keskinleştirme/gürültü giderme ve Anime4K ile çakışma önlenir. Native komut reddedilirse filtre temizlenir ve hata bildirilir. Bu arayüz donanımın gerçekten VSR uyguladığını kanıtlayan bir durum göstergesi değildir.
- Browser, LibraryHealth, ClipMaker, SceneGrid, LunaRecap ve LineSearch yerel Suspense sınırlarıyla ayrı yüklenir. Fontsource CSS'inden `.woff` fallback kaldırılır; bütün `.woff2` dil/kalınlık dosyaları korunur.
- `npm test` bütün UI dışı regresyon komutlarını tek girişte toplar (38 komut). UI/e2e komutları bilinçli olarak ayrı kalır. CI'a Clippy ve bağımlılık advisory denetimi eklendi; CI action referansları tam SHA ile sabitlendi.

## Gerçek doğrulama

- Çalışma kopyasında `npm run build`: geçti (TypeScript + Vite).
- Son arayüz çıktısı: ana JS 1.312,29 kB, gzip 418,67 kB; `.woff` dosyası 0. Bu değerler eski raporla aynı taban üzerinde yapılmış bir karşılaştırmalı performans ölçümü değildir.
- `npm test`: 38 komut geçti; mevcut modeller/kaynak bağlantı testleri ve yeni `hardening-regression.cjs` dahil.
- `node app/scripts/i18n-check.cjs`: geçti.
- `node scripts/release-version.cjs 1.6.8 --check`: geçti.
- Ayrı target dizininde `cargo check --locked --offline`: geçti; 9 uyarı. Tauri uygulamasının bütün Rust kaynağı derleme kontrolünden geçti.
- Üretim `mpv_policy.rs` ve `stable_cache.rs` için bağımsız Rust test çalıştırıcısı: 3 test geçti.
- Üretim mpv modülünü kullanan, Tauri event/subtitle uçları stub olan çalıştırıcı: 1 recovery-state testi geçti. Bu native pencere veya gerçek süreç çökme testi değildir.
- Yerel `cargo clippy --locked --offline --lib --tests`: Clippy bileşeni kurulu olmadığından çalışmadı. CI aracı kuracak şekilde tanımlandı. Yerel `cargo audit` ve canlı GitHub Actions çalıştırılmadı.
- Gerçek Luna penceresi, CSP altında EPUB/PDF, VSR GPU çıktısı, mpv çökme/geri dönüşü, installer/NSIS ve release updater kontrolü yapılmadı.
- Installer, setup, portable, release veya USB yedeği üretilmedi. Commit/push/tag/release yok.

## Rapordaki 19 öncelik maddesi

| # | Madde | Durum |
|---|---|---|
| 1 | mpv izin listesi ve CSP | Uygulandı; canlı kitap/provider/pencere kontrolü gerekiyor |
| 2 | Zaman seyreltme ve ayrı depo | Seyreltme uygulandı; ayrı zaman deposu/App ayrıştırması yapılmadı |
| 3 | Film dosya-başı seçenekleri | Uygulandı; gerçek dosyalarla parça/devam testi gerekiyor |
| 4 | Sabit SHA önbellek anahtarları | Uygulandı |
| 5 | Kilitler ve mpv gözeticisi | Uygulandı; gerçek süreç çökme testi gerekiyor |
| 6 | Değişmeyen snapshot'ı yazmama | Uygulandı; sıra, tekrar, hata ve yarış testleri geçti |
| 7 | Dosya ilişkilendirmeleri | Config uygulandı; NSIS testi yapılmadı |
| 8 | RTX/Intel VSR | Uygulandı; gerçek GPU testi yapılmadı, otomatik ölçek seçimi yok |
| 9 | Windows SMTC | Yapılmadı; mevcut global medya tuşları henüz değiştirilmedi |
| 10 | Gapless müzik | Yapılmadı |
| 11 | alass senkron | Yapılmadı |
| 12 | Kod bölme/Compiler/lint | 6 panel ve woff2 uygulandı; CI tek giriş/Clippy/audit/SHA eklendi. Ana Music/Books/Taste/Mine ayrıştırması, React Compiler ve JS lint yapılmadı |
| 13 | Chromaprint intro/jenerik | Yapılmadı |
| 14 | adblock-rust | Yapılmadı |
| 15 | foliate-js kitap motoru | Yapılmadı |
| 16 | Syncplay | Yapılmadı |
| 17 | SQLite veri taşıma | Yapılmadı; mevcut storage anahtarları korundu |
| 18 | SignPath başvurusu | Yapılmadı; harici hesap/başvuru gerektirir |
| 19 | libmpv deney dalı | Yapılmadı; mevcut üretim oynatma motoru yerinde korundu |

Rapordaki diğer açık işler de tamamlandı sayılmamalı: PGS OCR, AnkiConnect, AcoustID/MusicBrainz, karaoke/Demucs, StarDict, dosya adı parser değişimi/200 örnek, NFO, toplu yeniden adlandırma, akıllı listeler, kalıcı probe worker, canlı altyazı, SongRec, Jellyfin/OpenSubsonic/Audiobookshelf, MCP istemcisi, RTX HDR, winget/Scoop ve alternatif imza başvuruları.

## Sonraki doğrulama

`Luna Dev.cmd` ile film/harici altyazı/nottan açma, müzik/AutoEQ, EPUB/PDF, Web/provider, ekran görüntüsü ve isteğe bağlı VSR denenmeli. mpv'nin yalnızca Luna'ya ait child süreci sonlandırılarak sınırlı yeniden başlatma ve pause/resume kontrol edilmeli. Kullanıcının gerçek penceresi Codex tarafından otomatik sürülmedi.

Push ve GitHub yayınını kullanıcı Claude'a bıraktı. Bu belge yayın yetkisi değildir; yerel devir notu ve test sınırları okunmalı. 1.3.9 Latest kalır; yeni beta yayın açıkça istenirse prerelease ve `latest=false` kullanılmalı.

Kaynaklar: [mpv komut/seçenek belgesi](https://mpv.io/manual/stable/), [Tauri CSP](https://v2.tauri.app/security/csp/), [Tauri yapılandırması](https://v2.tauri.app/reference/config/).
