# Claude teslimlerinin birleşimi — 22 Ekim 2026

## Esas alınan teslimler

| Arşiv | Seçim |
|---|---|
| files (14).zip | Asistan/Browser NİHAİ; aynı paketteki ara-01/02 yerine. |
| files (12).zip | Kitap/Müzik NİHAİ; önceki ara sürümler yerine. Büyük kısmı zaten mevcut olduğundan yalnız kalan farklar taşındı. |
| files (9).zip | Asistan ARA2; ARA1 yerine kümülatif, daha yeni nihai asistan paketi verilmemiş. |
| files (8).zip | Film ARA1; verilen en yeni film teslimi. |
| files (6).zip | Native Browser ARA1; AB nihai paketi Rust tarafına dokunmadığından bu ayrı değişiklikler de birleştirildi. |
| files (11).zip | Bağımsız kalite ARA2; ARA1 yerine. |
| files (5).zip | Whisper/dublaj projesine ait; Luna koduna alınmadı. |

İçerik tekrarları: files.zip = files (4).zip = files (8).zip; files (3).zip = files (9).zip; files (7).zip = files (11).zip. ZIP baytları farklı olsa da iç dosyaların adları ve SHA-256 içerikleri eşit. Kitap/müzik ARA3, NİHAİ içinde var. Envanter ekli JSON dosyasında. Kullanıcının bu turda vermediği, klasördeki boş/indirme aşamasındaki ZIP dosyaları teslim kabul edilmedi.

## Birleşen işler

- Asistan araç adı/argüman doğrulaması; yinelenen değiştirici çağrıları eleme, kısmi sonuç ve geri alma kayıtlarını koruma.
- Yanıtı durdurma ve sohbet değişiminde eski yanıtı kullanmama; başlamış native/model isteğinin fiziksel olarak durmayabileceğini açıklama.
- Hasarlı sohbet geçmişini kurtarma ve ham yedek; sohbet başına taslak/arama/kaydırma.
- Sağlayıcı yanıt biçimleri ve anlaşılır hata açıklamaları; profil seçimi ve anahtar maskeleme korunur.
- Sayfa sorularını çeviri komutu sanmama; dil yönünü doğru seçme; /çevir ve /orijinal komutlarını Web bağlamında önerme.
- Sayfa okurken main/article seçimi, paragrafları ve satır içi yazıyı birleştirme. Form içindeki normal metin okunabilir; alan değerleri, düzenlenebilir alanlar ve gizli öğeler okunmaz.
- Browser sayfa bağlamı ve hata açıklamaları; küçük baloncuk ve sayfa üstünde panel düzeni korunur.
- Native tarayıcıda uygulama/IPC/asset kökeni ve geliştirme portu kontrolleri; about:blank başlangıcıyla asset kökenini ayırma.
- Native gezinme/geri-ileri/ses/izin olayları, durdurma/yakınlaştırma/veri temizleme sözleşmesi. Yeni olaylar adres değişikliği sanılmaz. Her yeni native özellik için yeni arayüz düğmesi eklendiği iddia edilmez.
- Film kopyalarını TMDB kimliğiyle gruplama; arama eşleştiğinde diğer kopyaları koruma; izleme durumu ve devam edilecek kopya.
- Oyuncu, karakter, yıl, dosya adı dahil arama ve eşleşme gerekçesi; ortak karşılaştırıcı/önbellek, kararlı sıralama.
- Afiş hata belleği, rozet ve menü düzeni, klavye kullanımı, sürpriz seçim ve tarama/boş durum açıklamaları.
- Türkçe I/ı dahil eşleştirme; M3U adlarında virgüller, disk listelerinin göreli yolları ve kanal grupları.
- Luna temalı hata sınırı/kurtarma ekranı; yt-dlp argüman ayırıcı ve indexer dosya adı koruması.
- Kitap sağ tık menüsünde Okunacaklar ekle/çıkar; eski web kapağını geri getirmeden dosya kapağına dönme.
- Çalma listesi arka plan taşmasını sınırlama, müzikte sesi kapat/önceki seviyeyi aç; film başlarken kitabın sesli okumasını durdurma.

## Korunan sonraki çalışmalar

Kitaplık biçim/kapak filtreleri ve plan sırası, alıntı defteri/etiketler, okuma geçmişi filtreleri, sesli kitap konumu, çalma listesi içe/dışa aktarma ve kuyruk düzenleme, yedek önizlemesi/korumaları korunur. Eski tam kaynaklar üst üste kopyalanmadı. Ortak CI, package.json ve çeviri değişiklikleri birleştirildi. Daha sıkı metadata/ISBN doğrulaması, sınırlandırılmış arama ve güncel kitap düzenleme akışları eski sürüme döndürülmedi.

## Doğrulama ve sınırlar

Gerçek üretim modüllerine ait kısa test grupları, çeviri denetimi, TypeScript/web derlemesi ve Windows GNU hedefi derlemesi uygulandı; sonuçlar TESTLER klasöründe. 7 yeni birleşim testi film kopyaları, izleme/devam ve kapak geri dönüşünü kontrol eder. Ayrıca gerçek ChatPanel, FilmCatalogView ve sayfa çıkarıcıda 5 izole headless Edge akışı geçti. Örnek kitaplık ve taklit sağlayıcı/native köprü kullanıldı; gerçek API anahtarı kullanılmadı.

Gerçek Windows penceresi, canlı film siteleri, gerçek video/DRM, ses aygıtları ve üretim MSVC çalıştırması denenmedi. Tam native test EXE'sinin önceki ortam kısıtı devam eder; derleme başarısı oynatma doğrulaması olarak sunulmaz. Yeni test sayısı bulunan bug sayısı değildir.

Üretim uygulama kimliği ve bağımlılık kilitleri bu birleşim için değiştirilmedi. Commit/push/release yapılmadı. Birleşim öncesi kaynak fotoğrafı ayrı çalışma dizininde saklandı. Ekli belgelerdeki commit/push talimatları kullanıcı isteği sayılmadı.
