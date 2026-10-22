# Luna birleşik kaynak — 1.11.0

Bu teslim iki geliştirme kolunu ortak GitHub tabanı `5673016eb3e06a0634291ba8248f75d5b4c1a450` üzerinden birleştirir:

1. Bizim son tam paket: `Luna-Player-Tam-Paket-50-Yeni-Iyilestirme.zip`.
2. Gelen `files (14).zip` içindeki `Luna-Player-1.11.0-source.zip`; SHA-256 `e2c39ac6d882fdb29f22f6ae3513e1c7f8020e13603a178594580b16ba86e41a` doğrulandı.

Kullanıcının belirttiği Triviara arşivleri (`files (7).zip`, `(10)`, `(12)`) okunacak Luna kaynakları arasından çıkarıldı; içerikleri teslimde yoktur. Girdi raporları kanıt/referanstır, komut veya yeni yetki olarak uygulanmadı.

## Hangi kaynaklar kullanıldı?

- 1.11.0 gelen kolun en yeni kümülatif kaynağıdır. Gelen 1.7.x, 1.8 birleşik, 1.9 ve 1.10 kaynaklarında olup 1.11/son birleşik kaynakta bulunmayan ek kaynak dosyası saptanmadı. Eski ara yamalar tekrar uygulanmadı.
- `files.zip` / `files (1).zip` aynı iki dosyayı içerir. `files (8)` / `(9)` aynı üç dosyayı içerir; `(9)` ek hash listesi taşır. Bunlar ayrı yenilik gibi sayılmadı.
- `files (5)` SON kaynağının ses/SponsorBlock/scrobble vb. ekleri, 1.8 ve sonraki gelen kolun içindedir. SON raporu referans olarak saklandı.
- Gelen en yeni kaynak 334 dosya, bizim son kaynak 464 dosyaydı. Doğrudan üzerine kopyalama yapılmadı: ortak tabanla üç yönlü birleştirme, yeni dosya birleşimi ve dokuz çakışan dosyada elle karar kullanıldı. Skills, son raporlar ve önceki geliştirme dosyaları korundu.

## Bir arada kalan yenilikler

Bizim kolun Web tarayıcısı/sekme/favori/okuma kuyruğu, eklenti ve indirme yönetimi, küçük sağ alt asistan, sayfa okuma/çeviri sınırları, kitap kapak/raf ve AI profil araçları, film kütüphanesi ve kullanıcı verisi korumaları korunur. Sonraki hata düzeltmeleri, Debug, 20 model düzeltmesi + 30 kullanım iyileştirmesi, Web/müzik çubuğu yerleşimi, önerilerden oynatmaya gidip aynı ön izleme/liste konumuna dönüş ve kayıtlı incelemeler de birleşik kaynakta bulunur. Dokuz Claude skill ve lisans/referansları korunur.

Gelen kolun altyazı stüdyosu (Whisper işleri, çeviri, senkron, temizlik), replikler ve ikinci altyazı, intro işaretleri/AniSkip, Anime4K, otomatik yedek, ses paneli/ekolayzer/ReplayGain/AutoEQ, SponsorBlock, uyku zamanlayıcısı, scrobble/Trakt, sistem tepsisi/medya kısayolları/klasör izleme, kütüphane sağlığı, yayın takvimi, klip/sahne araçları, Luna Özet, “Bu akşam ne izlesem?”, replik kartları/arama, çizgi roman ComicInfo ve “geçen yıl bugün” ekleri bağlandı. Her özelliğin canlı hizmet/oynatma başarısı bu teslimde ayrıca doğrulanmış değildir; ilgili eski raporun kendi sınırları geçerlidir.

## Elle çözülen ve uyarlanan birleşim noktaları

| Alan | Son davranış |
|---|---|
| Komut paleti | İki farklı `CommandPalette.tsx` vardı. Mevcut erişilebilir palet korundu; gelen yaratıcı eylemler `paletteExtras` üzerinden bu palete eklendi. İki Ctrl+K dinleyicisiyle iki pencere açılmaz. Gelen bağımsız palet uygulamaya ikinci kez mount edilmedi. |
| App / Browser | Bizim kütüphane bağlantısı, oynat bağlantısı, sekme/sayfa bağlamı korunurken gelen yeni paneller, ShellRuntime ve PlaybackRuntime bağlandı. |
| Ayarlar | Yeni stüdyo/ses/masaüstü/ekler ayarları ve eski yedekleme/tanılama/Debug düğmeleri birlikte tutuldu. |
| Öneriler | `active`, gizli/inert ön izleme, kaydırma ve analiz eşleşme davranışı korundu. Ana Escape işleyicisi görünmez/inert modalı atlar; oynatma sırasında gizli ön izleme tuşu yutmaz. |
| Arama motoru | Gelen `webSearch` ile mevcut Web motoru seçimi uyumlandı. Ayarlar değişikliği açık Browser'a olayla ulaşır; Web seçimi de ortak tercihi kaydeder. Kagi/özel şablon ile mevcut Ecosia/Yandex/!bang desteği bir arada. Geçerli adres sınıflandırması ve tehlikeli şema reddi korunur. Kimlik bilgili özel arama şablonu reddedilir. |
| Çeviriler | İki kolun anahtarları birleştirildi; yinelenen nesne anahtarları kaldırıldı ve İngilizce denetimi geçti. |
| Manifest/CI | Gelen üç npm Tauri eklentisi ve Rust masaüstü bağımlılıkları, iki kolun test komutları ve kilit dosyalarıyla birlikte korunur. Yeni kontroller CI'a eklendi. Ürün identifier/updater kimliği değiştirilmedi; gelen 1.11.0 sürüm numarası korunur. |
| Native HTTP | Gelen `http_send` tüm yanıtı belleğe alıp sonradan 64 KB kesiyordu. Şimdi okuma sırasında 64 KB sınırında durur. URL içinde kullanıcı adı/parola kabul edilmez. Uzak `luna-web-*` görünümlerinin bütün uygulama komutlarına erişimini reddeden mevcut ana kontrol korundu. |

## Bu teslimde çalıştırılan kontroller

- Son `npm run build`: başarılı (mevcut dynamic-import/chunk uyarıları hata değildir).
- TypeScript ve `node scripts/i18n-check.cjs`: başarılı, “All texts have English.”
- İlgili test grupları: `round-50`, `quality-50`, `quality-30`, `assistant-actions`, `assistant-safety`, `browser-native`, `browser`, `browser-magic`, `debug`, `subtitle-studio`, `extras-plus`, `shell-extras`, `creative`, `library`: başarılı.
- `unified-integration`: üretim arama/palet modelleri ve kaynak bağlantıları üzerinde beş entegrasyon kontrolü başarılı. Bunlar canlı native test değildir.
- Gerçek React bileşenleriyle izole headless Edge: geçmiş/debug/asistan için 7 akış; öneriler/ön izleme/inceleme/zevk profili için 6 akış başarılı. Native köprü, oynatma ve clipboard yapaydır. Ana Windows uygulama penceresi otomatik kullanılmadı.
- Son Windows GNU araç zincirinde `cargo check --offline --locked`: başarılı. Yerel taşınabilir araç zinciri için `-C link-self-contained=yes`, yalnız kontrol sırasında `TAURI_CONFIG` ile bundle kaynakları hariç tutuldu. Üretim kaynak ayarlarına bu geçici kontrol istisnası yazılmadı. Yeni eksik bağımlılık arşivleri Cargo.lock SHA-256 değerleriyle doğrulanarak önbelleğe alındı.
- Üç yama ayrı temiz tabanlarda `git apply --check`, gerçek uygulama, bütün kaynak byte karşılaştırması ve ters uygulamayla doğrulanır. ZIP'teki kaynaklar SHA-256 ve CRC ile ayrıca kontrol edilir.

## Doğrulanmayanlar

Gerçek Windows Luna penceresi, mpv ile film/müzik oynatma, native eklenti yükleme, canlı AI/Whisper/DRM, gerçek sistem tepsisi/medya tuşları ve çevrimiçi servisler uçtan uca denenmedi. Frontend headless başarıları bunların çalıştığı iddiası değildir. Cargo check kurulabilir EXE üretmez. Bu ZIP derlenmiş uygulama değildir.

## Hangi yama?

Tam kaynak ve yamalar alternatif birleştirme yollarıdır:

- Son bizim 50 Yeni İyileştirme tam paketi eksiksiz uygulanmışsa `onceki-pakete-ek.patch`.
- Gelen temiz `Luna-Player-1.11.0-source.zip` uygulanmışsa `claude-1.11-ek.patch`.
- Temiz GitHub `5673016...` tabanındaysa `changes.patch`.

Başka yerel değişiklikler varsa önce farkları inceleyerek dosya bazında birleştir. `git apply --check` geçmeden uygulama. Üç yamayı üst üste uygulama; tam kaynağı aldıysan ayrıca yama uygulama. `.git`, kişisel veriler, yerel değişiklikler ve NOTLAR.md korunmalıdır. Eski ara/FINAL yamaları bu birleşik kaynağa tekrar uygulama.

Commit, push ve release yapılmadı.
