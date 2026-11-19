# Luna 1.7.3C — Film defteri ve sağlayıcı görünümü

Kullanıcı önce yalnız not alınmasını, sonra “tamam uygula” diyerek sınırlı değişiklikleri istedi. Mevcut tasarım korunur; önceki görsel taslağın genel sayfa/başlık/analiz görünümü uygulanmadı. Oyuncular film başlığının altına değil, Luna Analiz’in hemen üstüne taşındı.

## Değişiklikler

- İzledikten sonra bölümü Film defterim olarak birleştirildi. Düşüncelerim, Sahneler ve alıntılar, Yorum taslağım sekmeleri aynı mevcut alanda açılır. Film sayfasındaki defter ikonu bu alanın sahne sekmesine gider. Ayrı bir mükerrer defter penceresi açmaz.
- Mevcut geri bildirim/taslak/kurtarma ve lunaSceneNotes/lunaWordNotes depolaması korunur. Yeni depolama veya kayıt göçü yok. Sahne saatleri, arama, dosya filtresi, dışa aktarma, kelime ve Anki araçları aynı MediaNotebook bileşeninin gömülü sürümüdür. Oynatıcıdaki ayrı defter penceresi çalışmaya devam eder. Kopya dosya değişince gömülü defter yeni yol ile yeniden açılır. Sekme değişimi yazılan metni silmez.
- Oyuncu satırı mevcut fotoğraf/isim/karakter ve TMDB tıklama davranışıyla bütün analiz bölümünün hemen önündedir.
- Abonelikle/Kirala/Satın al grupları üç veya daha az sağlayıcıda mevcut görünümde kalır. Üçten fazlaysa en çok dört dairesel logo birbirini kısmen örter ve toplam seçenek sayısı görünür. Fareyle üzerine gelme, klavye odağı veya tıklama bütün sağlayıcıları açar. Önceki sekiz seçenek sınırı kaldırıldı. Escape/dışarı tıklama ve odak/işaretçi ayrılması kapanmayı yönetir; uzun liste kaydırılabilir. Seçili ülke/önbellek/JustWatch bağlantısı değişmedi.
- Görüntü/Ses başlığının opak dikdörtgen zemini kaldırıldı. Panelin mevcut yüzeyi kullanılır, ayrı bir zemin bloğu çizilmez. Başlık içerikle birlikte kayar.
- Yerel taramanın adı, işlevi ve analizi değiştirilmedi. Kullanıcı yalnız anlamını sormuştu; kaldırılması istenmedi.
- Altı sürüm dosyası release-version.cjs 1.7.3 ile eşleşir; version.ts örneği 1.7.3C. Push Claude’da.

## Kontroller ve sınırlar

TypeScript/Vite derlemesi, ESLint, i18n kontrolü ve sürüm kontrolü başarılı. İlgili regresyon grupları: performance-workflows (12), review-completion (7), country-ui, creative-plus (12; film taslak kurtarması dahil), extras (14; not kaydı doğrulama/taşıma dahil) başarılı.

Headless Edge + sahte Tauri/sentetik veri, 1280 ve 640 piksel: oyuncuların analizden önce gelmesi; defter ikonuyla birleşik sahne sekmesinin açılması; önceki sahne notunun korunması, yeni sahne ekleme; düşünce ve yorum taslağı kaydetme ve sekme değişiminde korunma; 12 sağlayıcının tamamına erişim, fare/klavye/Escape/dışarı tıklama; sağlayıcı açılır alanının ekran sınırları; çark başlığının şeffaf zemini; ayrı oynatıcı defteri ve kelime kaydı doğrulandı. Gerçek API/anahtar/kullanıcı kaydı kullanılmadı. Tarayıcı çalışma zamanı hatası yok. İlk fixture dış ağ yanıtlarını yanlış taklit ettiği için bir betik ayrıştırma hatası üretti; yalnız fixture düzeltildi ve son kontrol temiz geçti.

Gerçek Windows Luna/WebView2/mpv penceresi otomatik kullanılmadı; kullanıcı Luna Dev.cmd ile görünümü doğrulayacak. Rust işlevi değişmedi; yeni cargo/installer/exe üretilmedi. Mevcut büyük FilmReviewAi chunk uyarısı derlemeyi engellemiyor. Kanıtlar: ~\Documents\Luna-1.7.3C-Defter (ui-result.json, PNG’ler, build-final.log, lint-final.log, sürüm/i18n logları). QA dosyaları ana projeye dahil edilmez.

## Devir

Claude, CODEX-CLAUDE-DEVIR.md son girişini de okumalı; bu Git dışında kalır. Önceki tasarım notundaki “uygulama yetkisi yok” sınırı bu sınırlı çalışma için kullanıcının son “tamam uygula” mesajıyla kaldırıldı. Taslağın geri kalanını uygulama yetkisi verilmedi. Aktarım manifesti başlangıç hashlerini kontrol eder, önceki kaynakları yedekler ve SHA-256 ile son dosyaları doğrular.

Commit/push/release/USB işlemi ve otomatik yer açma/silme/önbellek temizliği yapılmadı. Temizlik için her zaman kullanıcıya sor. Kullanıcı verisi, plugins ve gizli anahtarlar korunur.
