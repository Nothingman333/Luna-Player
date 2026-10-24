# Luna beta — birikimli nihai teslim

23 Ekim 2026. Güncel paket adı: **Luna-Beta-Tum-Yenilikler-Nihai-2026-10-23.zip**.

Bu teslim önceki `Luna-Beta-Nihai-GitHub-Paketi-2026-10-23.zip` kaynağını ve ondan sonra biriken denetim, performans, görsel, gelen yama ve kullanım geliştirmelerini içerir. Önceki raporlarda “henüz paketlenmedi” yazan turlar artık bu tam kaynaktadır. Raporlar tarihsel çalışma kayıtlarıdır; eski yamalar tekrar uygulanmamalıdır.

Doğrulanmış taban v1.6.7, `3c4ae8f55ae792e9abe43fb9c3cf67c506b61bd6`. Son teslim sırasında uzak GitHub yeniden alınmadı. Sürüm numarası, uygulama kimliği, updater anahtarı ve bağımlılıklar değiştirilmedi. Kullanıcının deposunda commit veya push yapılmadı.

## Toplu yenilik ve düzeltme haritası

Tam kaynak yalnız son birkaç dosyadan oluşmaz; önceki birleşik kaynağın bütün dosyaları dahildir. Ayrıntılı değişiklik dökümleri de `docs/` ve paketin `Raporlar/` dizininde bulunur.

| Alan | Birikimli kaynakta bulunan işler | Ayrıntı |
| --- | --- | --- |
| Tarayıcı | Sayfa bağlamı/çeviri, okuma görünümü, indirme ve eklenti yönetimi, arama motorları, yerel zoom tercihleri, sekme/favori yönetimi; adlandırılmış sekme grupları, arama/kapasite/içe-dışa aktarma korumaları | `LUNA-BETA-BIRLESTIRME.md`, `LUNA-BETA-YENI-KULLANIM.md`, ilgili Web raporları |
| Web defteri | Okuma kuyruğu, sayfa notları, arama/durum/sıralama, açık tercihli dışa aktarma, oturum taslakları, eşzamanlı not koruması; son tur notlu sayfa filtresi ve nottan ilerlemeyi koruyarak kuyruğa alma | `LUNA-WEB-DEFTERI.md`, `LUNA-BETA-KUTUPHANE-WEB-DEVAMI.md`, `LUNA-BETA-DETAYLI-KULLANIM-DEVAMI.md` |
| Film kütüphanesi | Kayıtlı filtre rafları, film/dizi ayrı seçimleri, üç esere kadar karşılaştırma, hatalı/taşınan dosya ve kurtarma taslakları; son tur ortak türler, süre farkı, kopyalanabilir karşılaştırma, özel kapak adresi koruması | Kütüphane/web, yeni kullanım ve ayrıntılı kullanım raporları |
| Letterboxd ve zevk | CSV/ZIP içe aktarma, RSS son girişleri, kişisel puanı koruma, zevk DNA'sı, yorumlarda konu/övgü/eleştiri, seçili AI profiliyle derin okuma, arkadaş uyumu, ruh hali/süre ve gerekçeli öneriler | `LUNA-BETA-BIRLESTIRME.md`, zevk entegrasyon raporları |
| Asistan | Sağlayıcı istekleri/JSON/niyet düzeltmeleri, onay ve işlem sonuçları, güvenli Markdown, sohbet dizini/sabitli yanıtlar, sınırlı profil bağlamı, menü/odak/Escape davranışları; son tur siteye göre kaynak arama ve eşleşen kaynakları kopyalama | Birleştirme, yeni kullanım, ayrıntılı kullanım ve asistan raporları |
| Kitaplar ve müzik | Önceki kitap bilgi/kapak/raf, okuma/alinti ve oynatma geliştirmeleri korunur; son turlar okuma görünümü, kuyruk ve Şimdi Çalıyor taşmaları, podcast döküm pencereleri/yeniden deneme/önbellek, güvenli metin çözümleme | Kitap/müzik raporları, `LUNA-BETA-PERFORMANS-DEVAMI.md`, görsel düzeltme raporu |
| Altyazı ve metin | SRT/VTT/ASS okuma ve yazma, tek geçişli varlık çözümü, dil etiketleri, boş satır/CRLF, çeviri kimlik doğrulama, spoiler sınırı ve arama işaretlemeleri | `LUNA-BETA-50-DAVRANIS-DUZELTMESI.md`, `LUNA-BETA-EK-DENETIM-DUZELTMELERI.md` |
| Performans/dayanıklılık | Tek geçişli kopya sayımı, süre/kapasite sınırlı oturum önbellekleri, iptal edilmiş eski yanıtı önleme, bozuk günlük satırını koruma, Unicode/adres/tarih sınırları, dosya adı regex düzeltmeleri | Performans, ek denetim ve nihai yama raporları |
| Tema ve yerleşim | Mevcut koyu Luna yüzeyleri ve mod renkleri; üst menü, analiz/detay, ayar formu, kitap rafı, asistan/debug, oynatıcı paneli, müzik çubuğu ve dar pencere düzeltmeleri | UI incelemesi ve görsel raporlar; önce/sonra kanıtları |

Bu harita her özelliğin bu son turda sıfırdan yapıldığı anlamına gelmez. Eklenti/WebView2/DRM uyumluluğu bütün siteler ve Chrome eklentileri için garanti değildir. Letterboxd RSS bütün geçmişi vermez. Model uzlaşması doğruluk garantisi değildir.

## Son gelen `files (3).zip`

Dosya 3546 bayttır; ZIP merkez dizini/son kaydı yoktur. Buna rağmen tek yerel kayıttaki DEFLATE akışı tamamdır. Kurtarılan `luna-1.6.7-ek-duzeltmeler-tur2.patch`: sıkıştırılmış boyut 3464 bayt, açılmış boyut 9011 bayt, CRC-32 `9a3fa9c5`. Veri tanımlayıcısının boyut ve CRC alanları hesaplanan içerikle eşleşir. Özgün dosya değiştirilmedi.

| Gelen parça | Sonuç |
| --- | --- |
| Rust kitap XML'inde çok baytlı kesme | Mevcut kod karakter sınırını zaten koruyordu; daha eski byte-slice yamasıyla değiştirilmedi. Gelen Japonca/Türkçe örnekleri test olarak eklendi. |
| Kendiliğinden kapanan `<dc:title/>` | Gerçek eksik: sonraki alanın işaretlemesini başlık sanabiliyordu. Boş öğe atlanır; sonraki gerçek başlık okunabilir. İki Rust test grubu mevcut testlere eklendi. |
| Kitap sanat görseli metni | Zincirleme çözümleme yerine mevcut ortak tek geçişli `decodeTextEntities` kullanıldı. İç içe kodlanmış tırnak bir kez çözülür. |
| Asistan dosya yeniden adlandırma | Başlık yedeği ve açık dosya ayrımı `matchKey` ile Türkçe I/İ/ı ve aksanları tutarlı karşılaştırır. Gerçek yol değiştirilmez; belirsiz adaylar tek dosya gibi seçilmez; ağ akışları hedef olmaz. Önceki onay sınırı korunur. |
| Çalma listesi sanatçı filtresi | Mevcut ortak `matchKey` ile noktalı İ/Latin aksan eşleştirmesi tamamlandı. Bu, bütün sanatçı kimliği sorunlarını çözen bir kimlik servisi değildir. |
| Altyazı/podcast varlıkları | Mevcut ortak tek geçişli çözücü daha kapsamlıydı; eski `.replace` zinciri geri getirilmedi. Gelen S27 örnekleri regresyona eklendi. |

Yeni üretim işlevi/ifadelerini kullanan `test:incoming-tour2` aynı 5 kontrolde önce 0/5, sonra 5/5 geçti. Rust testleri yazıldı; **bu teslimde çalıştırılmadı**. Önceki turdaki yerel GNU/CRT bağlayıcı sorunu devam eden bir doğrulama sınırıdır; eski `cargo check` günlüğü son kodun native testi sayılmaz. Hedef Windows/MSVC ortamında `cargo test --lib` ve normal Tauri derlemesi gereklidir.

## Son kontroller ve kapsam

- Son ayrıntılı kullanım turunun 67 ilgili kontrolü geçti; 13'ü yeni `test:detail-polish` grubundadır.
- Gelen ek yama: `test:incoming-tour2` 5/5; `test:subtitle-studio` 26/26 (S27 dahil; kimlik numarası toplam kontrol sayısı değildir); `test:fifty-behavior` 50/50; `test:assistant-improvements` 10/10.
- TypeScript/Vite üretim derlemesi ve İngilizce çeviri kontrolü geçti. Mevcut büyük chunk ve etkisiz dinamik import uyarıları sürer.
- Dört akışın 1280 px TR / 640 px EN önce-sonra durumları: 16 başsız Edge kontrol kaydı ve etkileşim kanıtı. Gerçek Windows Luna penceresi otomatik kullanılmadı.
- Önceki turların günlükleri tarihsel olarak korunur; bütün CI matrisinin her tur yeniden çalıştırıldığı, canlı AI/TMDB/Letterboxd hesabının veya gerçek oynatmanın sınandığı iddia edilmez.

## Uygulama ve teslim

Paket kökündeki `ONCE-OKU.md` ve `CLAUDE-ILE-BIRLESTIR.md` güncel talimatlardır. `Kaynak/Luna-Player` tam birleşik kaynaktır. `changes.patch` temiz v1.6.7 içindir; `onceki-nihai-pakete-ek.patch` yalnız bir önceki nihai ZIP kaynağı içindir. Alternatiftir; peş peşe uygulanmaz.

Hedef GitHub dalı ilerlemişse önce durumu ve yerel değişiklikleri kaydetmeden inceleyin, `git apply --check` kullanın; uyuşmazlıkta dosya bazında birleştirin. Tam ağacı eski tabanmış gibi üstüne kopyalamayın. Kullanıcı verisi ve `.git` pakette yoktur. Yeni sürüm/kurulum için kaynak yeniden derlenmelidir.

Yamalar Git'in gerçek diff çıktısıyla üretilir; ayrı temiz dizinde ileri/ters uygulama ve kaynak karşılaştırması, ZIP CRC ve SHA-256 envanteri teslim üreticisinde doğrulanır. Sonuç dosyaları paket kökündedir. Bu doğrulama Windows/MSVC çalıştırma testinin yerine geçmez.
