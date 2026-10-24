# Luna beta — raporları birleştirme ve yarım işleri tamamlama

23 Ekim 2026 · Taban: ön sürüm **v1.6.7**, commit `3c4ae8f55ae792e9abe43fb9c3cf67c506b61bd6`.

Bu teslim, önceki tasarım incelemesinin tam kaynağını ve bu turdaki birleştirmeleri birlikte içerir. Sürüm numarası, uygulama kimliği, updater anahtarı ve bağımlılıklar değiştirilmedi. Commit/push yapılmadı. Gerçek Windows Luna penceresi otomatik kullanılmadı.

## Hangi teslim kullanıldı?

| Gelen içerik | İşlem |
|---|---|
| `luna-player-fixed-final.zip` / `luna-changes-final.patch` | Aynı v1.6.7 tabanına göre nihai kaynak farkları incelenip birleştirildi. `main.tsx` içindeki önceki açılış/menü düzeltmeleri korundu. Ara sürümleri ayrıca uygulanmadı. |
| `files (5).zip`, interim2/interim3 | Nihai genel pakette bulunan eski ara teslimler; tekrar uygulanmadı. |
| `files (1).zip` / asistan ara1 | Sağlayıcı isteği, niyet ayrımı ve JSON okuma düzeltmeleri alındı. Son sohbet dökümünde anlatılan fakat nihai dosyası bulunmayan diğer asistan düzeltmeleri güncel kaynak üzerinde tamamlandı. |
| `files.zip`, `files (2).zip` | Zevk motorunun eski ara teslimleri. |
| `files (3).zip` / Zevk FINAL | Yeni saf motor, bağlantı katmanı ve arayüz alındı. Eski beta-1.0.1 `App.tsx`, `Taste.tsx`, sözlük dosyaları bütünüyle kopyalanmadı; özellikler güncel v1.6.7'ye taşındı. |
| Eski beta tasarım raporu / üç ek metin / iki sohbet dökümü | Talimat olarak çalıştırılmadı; bulgu ve devir verisi olarak incelendi. Mevcut kodla karşılaştırılarak eksikler tamamlandı. |

## Genel nihai düzeltmeler

Gelen raporun 43 kalemlik genel düzeltme kümesi kaynakta birleştirildi. Bunlar 43 yeni ve birbirinden bağımsız kullanıcı hatası olarak tekrar sayılmıyor. Başlıca davranışlar:

- Kitap taramasında çok baytlı karakter ortasından kesme paniği; Letterboxd URL'sinden önce Türkçe İ bulununca oluşan bozuk adres; 1000Kitap başlık normalleştirmesi ve hatalı upscaler XML'indeki panik giderildi.
- Gemini ve model listesine zaman sınırı/model adı doğrulaması; altyazı isteklerine süre ve gövde boyutu sınırları; büyük HTTP yanıtlarına okurken boyut sınırı getirildi.
- Önbellek sayımı/temizliğine iç içe önizlemeler ve still kareleri eklendi.
- Explorer'da boşluklu dosya seçme, bulunamayan dosyanın üst klasörünü açma, Windows aygıt adları ve pano meşgulken kısa yeniden deneme düzeltmeleri alındı.
- Yedek yazma geçici dosya üzerinden, BOM'lu yedek okuma destekli; bir ayarın depolama kotası hatası kalan ayarların geri yüklenmesini kesmiyor.
- SRT'de boş satırsız cue ayrımı, HTML varlıklarını bir kez çözme, OP/ED bölüm başlığı yanlış eşleşmeleri ve geçersiz takvim tarihleri düzeltildi.
- TMDB isteği zaman sınırı/anahtar boşluğu, İngilizce özet yedeği hatası ve boş sezon listesinin kalıcı önbelleğe alınması düzeltildi.

Birleştirme incelemesinde bu kaynakta ek olarak iyileştirilenler: seek karelerinin geçici dosya adı eşzamanlı isteklerde de benzersiz; yedek geçici dosyası benzersiz ve `create_new` ile açılıyor, yazı diske aktarılmadan eski dosyanın yerini almıyor; aynı boyutlu değiştirilen videonun küçük resmi de zaman damgasıyla geçersiz oluyor. Gemini cevap gövdesi de sınırlı okunuyor.

## Asistan — yarım kalan işler tamamlandı

- OpenAI/Claude/Base URL'ye sıcaklık, çıktı sınırı ve uygun JSON modu taşınıyor; düşünme modeli için uygun istek alanları kullanılıyor. Bu kontrol sağlayıcı taklitleriyle yapıldı; canlı hesap testi değildir.
- İngilizce soru/görüşte geçen `read/start/play/open` artık otomatik açma isteği sayılmıyor. Linkli mesajlar açma aracına zorlanmıyor.
- JSON cevapları ortak okuyucuda, anlaşılır hatayla işleniyor.
- Film profili bölümleri hem kayıt sayısı hem karakter olarak sınırlı. Tüm özet için de üst sınır var; kesilen kayıtlar belirtiliyor. Kayıtlı geçmiş/veri kesilmiyor, ayrıntılar mevcut liste araçlarıyla okunabiliyor.
- Yazı kutusunda her tuşta mesaj HTML'i ve her kalın başlıkta günlük/listeler yeniden ayrıştırılmıyor. Mesaj, ilgili veri veya bağlam değiştiğinde görünüm yenileniyor.
- Markdown başlığı, numaralı liste, satır içi kod ve kod bloğu destekleniyor. Üretilen film düğmesinin HTML'i sonradan italik kurallarıyla bozulmuyor; kod içindeki yıldız ve HTML düz metin kalıyor.
- Film modundaki yalnız-film talimatı, mevcut kitap/müzik/koleksiyon araçlarıyla tutarlı hale getirildi.
- Altyazı çevirisinde eksik/reddedilmiş anahtar, kota, iptal gibi durumlar körlemesine yeniden denenmiyor.
- Adında Error/Failed geçen başarılı işlem sonucu hata sayılmıyor. Sohbet silmede onay; geçmişte klavyeyle seçim; film ve bağlantılara klavye erişimi eklendi. Küçük cevap eylemlerinin hedefleri büyütüldü.

## Tarayıcı — teslim edilmeyen beş düzeltme tamamlandı

1. WebView2 zoom olayı kullanıcı değişikliğini site için saklar; Luna'nın kendi geri yükleme olayı kullanıcı tercihi sanılmaz. Kapatılan sekmenin işareti temizlenir.
2. Seçili metin çevirisi araçlarda seçilen hedef dili kullanır; tam sayfa çevirisi olarak algılanmaz.
3. Başlangıç sayfasından Ctrl+PageUp son sekmeye gider.
4. Yerel tarafta üretilmeyen eski `download-blocked` ve yanlış “indirme kapalı” mesajı kaldırıldı.
5. Tarayıcı günlük yazısı, yerleşimi sıralayan komut kuyruğunu beklemez.

## Zevk Laboratuvarı — güncel beta içinde

Öneriler sayfasında mevcut zevk özeti/profili korunarak yeni açılır panel eklendi:

- Letterboxd CSV/ZIP'ten izlenenler, puanlar, yorumlar, etiketler ve izleme listesi; kişisel Luna puanını koruyan tekrar yükleme.
- RSS'ten son girişleri eşitleme; bu, bütün Letterboxd geçmişi değildir.
- Tür/tema/yönetmen/senarist/oyuncu/dönem/dil/ülke özellikleriyle hesaplanan zevk DNA'sı; dağılım ve çapraz sınama bilgisi.
- Kendi yorumlarının konu ve övgü/eleştiri analizi. Derin AI okuması eski Gemini-only yol yerine seçili yorum AI profilini kullanır; gönderilecek yorumlar arayüzde açıklanır.
- Arkadaşların ortak puanları üzerinden uyum; farklı yıllardaki yeniden çekimler aynı film sayılmaz. Eski kayıt anahtarları yerine başlık/yıl kimliği kullanılır.
- Ruh hali, süre ve az bilinen film filtreleriyle gerekçeli öneri; “Bana göre değil”; izleme listesi ve kütüphanede bulunma bilgisi.
- Film detayı ve öneri önizlemesinde gerekçeleri açılabilen uyum rozeti.
- Asistana kısa zevk özeti.

Taşıma sırasında eski zaman çizelgesinin `tl-*` sınıflarıyla çakışma giderildi; yeni alanlar `taste-lab-*` ad alanında. İstatistik kartları, dar pencere ve TR/EN durumları görüntülendi. Geçersiz tarihlerin aya/yıla taşması engellendi. Profil sıfırlanırken devam eden işin eski modeli geri yazması önlendi. Hasarlı model çizilmiyor; hasarlı günlük üzerine yeni içe aktarma yazılmıyor. Kayıtlı ham veri kurtarma için korunuyor.

## Eski tasarım turundan tamamlananlar

Yüklenmeyen Inter kullanımına bağlı UI fontları IBM Plex Sans'a bağlandı (altyazı font tercihi bunun dışında). Üst menüde koşulsuz solma kaldırıldı; seçili sekmenin çevresi görünür, dar menü sıkışması azaltılmış durumda. Öneri düğmeleri sarılıyor. Film/dizi detayının sert alt kenarı yumuşatıldı. Uzun sağ tık satırları büyüyebiliyor. Ses/altyazı, video ve upscaler panelleri seek alanının üzerinde açılıyor. Bağlantı penceresinin alt şeridi, indirmeler boş durumu, klasörde önizlemesiz dosyanın simgesi/eksik dosya bilgisi ve küçük slayt/listeler/çeviri hedefleri tamamlandı. Var olan rail okları, eksik dosya ayrımı ve hata yakalayıcı yeniden eklenmedi.

Font ağırlığının “bulanıklık” yaptığı iddiası ve bütün seçili kontrolleri tek stile dönüştürme önerisi uygulanmadı; bunlar doğrulanmış hata değildi ve mevcut temanın hiyerarşisini değiştirecekti. Önceki tasarım düzeltmeleri için `LUNA-BETA-UI-REVIEW.md` tarihsel ilk tur raporudur; bu dosya son birleşik durumdur.

## Doğrulama

- `npm run build` ve i18n denetimi geçti.
- Windows GNU araç zinciriyle **`cargo check --lib --tests --offline` geçti**. Önceden mevcut mpv kaynakları yalnız çalışma kopyasına bağlandı; paket içine EXE/DLL eklenmedi. Bu MSVC/kurulum paketi veya gerçek oynatma testi değildir. Uyarılar günlükte korunmuştur.
- CI dosyasındaki bütün frontend test komutları geçti; önce ilgili asistan/tarayıcı grupları, sonra kalan gruplar çalıştırıldı. Sonuçlar ve günlükler teslimde bulunur. Bu, GitHub üzerindeki Windows MSVC işinin çalıştırıldığı anlamına gelmez.
- Asistan istek/niyet/JSON: 10 kontrol; genel frontend düzeltmeleri: 7; zevk çekirdeği: 44; bu tur tamamlama: 7; zevk entegrasyonu: 4 kontrol geçti. Bunlar ayrı hataların sayısı değildir.
- Zevk Laboratuvarı'nın dört sekmesi, öneriyi reddetme ve asistan Markdown görünümü TR/EN, 1440/640 genişlikte gerçek React arayüzünde sentetik verilerle denendi.
- Önceki analiz, spoiler, Letterboxd ve dar menü 18 etkileşim grubu; film/kitap önizlemesi ve web araçları 6 grup son kaynakta yeniden geçti.
- Tanıtımın **16 adımı**, bağlantı penceresi ve üç oynatıcı paneli 1280/800 genişlikte kontrol edildi. Dar tanıtımda sahne taşarak adım düğmelerini örtüyordu; sahne kendi alanında kaydırılıyor, düğmeler erişilebilir. Panellerin alt kenarı seek alanının üzerinde ölçüldü. Sahte mpv olayları gerçek video oluşturmaz.
- Küçük görsel seçki tam kod paketinin `Gorsel-Ozet/index.html` dosyasında. Bütün görseller ve önce/sonra galerisi ayrı `Luna-1.6.7-Beta-Gorsel-Kanitlar.zip` içindeki `index.html` dosyasında.

## Gelecek fikirleri — tamamlandı diye sunulmayanlar

Raporlardaki beyin fırtınası maddeleri bu tamamlamaların dışında kalır: gerçek sağlayıcı iptali ve streaming, soruya göre araç alt kümesi; arka planda web sesi, OAuth popup pencereleri, site izin paneli, yerel yazdırma/favicon API'si, uyuyan sekmeler, eklenti popup'ı ve klasörlü favoriler; embedding, ortak izleme, 10 film başlangıç anketi ve sağlayıcı bulunabilirliği. Bunlara çalışan düğme görüntüsü ekleyip altyapısı varmış gibi davranılmadı. Mevcut sekme/izin/IPC sınırları korunuyor.

Gerçek Windows Luna, canlı AI/TMDB/Letterboxd, DRM/oynatma, EPUB/PDF/CBZ okuyucu ve MSVC installer testi yapılmadı. Kaynak ve yama, kurulu uygulamayı kendiliğinden güncellemez. Eski ara yamaları bu tam kaynağın üstüne tekrar uygulamayın.
