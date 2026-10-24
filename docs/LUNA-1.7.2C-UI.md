# Luna 1.7.2C — 23 Ekim 2026 arayüz geri bildirimi

Bu tur kullanıcının ekran görüntülü isteğini mevcut 1.7.1C kaynak üzerinde uygular. Önceki paketler yeniden uygulanmadı. Ana kaynak hedefi E:\deepseek deneme\vlc modern; çalışma ve kontrol kanıtları C:\Users\fatme\Documents\Luna-1.7.2C-UI içindedir. GitHub push Claude tarafından yapılacak; Codex commit/push/release veya kurulum paketi üretmedi.

## Yapılanlar

- Oynatıcı çarkı varsayılan Görüntü ve ayrı Ses sekmesi açar. Parlaklık/kontrast/kadraj/sahne/klip araçları mevcut VideoPanel üzerinden korunur. UP, Luna/Lossless iyileştirmeleri için kalır. Panel ekran dışına taşmaz ve kısa pencerede kaydırılır.
- Altyazı aramasındaki stüdyo düğmesi mevcut turuncu tema vurgusunu kullanır. Oluştur sekmesi altı büyük model kartı yerine yan yana motor/model seçicileri, dil/hız satırı ve sabit alt işlem alanı kullanır. Gelişmiş ayarlar/kuyruk ve canlı altyazı/OCR ayrı açılır alanlardadır. CPU/CUDA, özel dosya seçimi, bütün modeller, indirme, kuyruk ve diğer stüdyo sekmeleri korunur. Model indirmesinin motor seçimini geri alması engellendi. Otomatik model/motor indirme eklenmedi.
- Film ayrıntısındaki alt mükerrer Film defterim düğmesi kaldırıldı. Üst ikon ve not kayıtları korunur; data-tip eksikliğinden oluşan boş beyaz ipucu düzeltildi. Hatırlanan dosya tercihleri ve film serileri üç nokta menüsünden ayrı pencerelerde açılır. Mevcut dosya seçeneklerine aynı menüden ulaşılır.
- AI token sayacı Genel’den Hesaplar ve anahtarlar bölümünün ilk kartına taşındı. Hesaplama/depolama davranışı değiştirilmedi.
- Genel’de dilin yanına İzleme ülkesi eklendi; dar pencerede alt alta yerleşir. Ülke seçimi arayüz dilinden bağımsız, kalıcı watchCountry anahtarıdır. İlk seçim öncesinde Türkçe için TR, diğer dilde US başlangıç değeri gösterilir; tanıtım ve sistem rehberi tamamlanınca ülke sorusu açılır. Mevcut kullanıcılar da daha önce ülke seçmediyse bir kez görür. Devam veya kapatma gösterilen ülkeyi kaydeder.
- TMDB üzerinden JustWatch yalnız seçili ülkenin tekliflerini gösterir. Önceki TR/US/GB dil tabanlı geri düşme kaldırıldı; ülkeye özel wp:kind:id:country önbelleği kullanılır. Ülke değişimi bileşeni yeniler, eski ülke sonuçları gösterilmez. Seçilen ülkede veri yoksa açık boş durum ve ülke koduyla JustWatch kaynağı görünür. API anahtarı yine gereklidir; ülke listesinde bulunmak veri bulunduğunu garanti etmez.
- F11 çıkış bildirimi küçük sağ üst kapsül olur; kütüphanede gezinme çubuğunun altında, oynatımda üstte görünür. 2,2 saniye sonra kapanır; elle kapatılabilir. F11 kısayolunun kendisi değişmedi.
- Sürüm altı dosyada release-version.cjs ile 1.7.2; ajan C, görünen etiket 1.7.2C. Kullanıcının onluk devir kuralı geçerlidir.

## Doğrulama

İlgili altı regresyon komutu başarılı: test:country-ui (yeni), test:subtitle-studio (26), test:shell-extras (9; sistemde ffmpeg bulunmadığından o alt kontrol atlandı), test:luna2, test:detail-polish (13), test:delivery (7). Yeni ülke regresyonu dil bağımsızlığı, geçersiz kod, kalıcı seçim, yinelenen olayın önlenmesi, abonelikten çıkma ve yalnız istenen ülkenin teklifini sınar; npm test tarafından da otomatik alınır.

Headless Edge, sahte Tauri ve sentetik depolama/TMDB ile 1280×800 ve 640×800: Görüntü/Ses sekmeleri ve mpv komut çağrısı, panel sınırları; altı model ve özel model seçeneği, Intel’de CUDA engeli, kurulu modelle erişilebilir oluşturma düğmesi, eksik modelde düğmenin engellenmesi; turuncu stüdyo düğmesi; token kartının sırası ve Genel’den kalkması; üst defter ipucu ve mükerrer düğmenin yokluğu; üç nokta menüsü/tercihler penceresi/dosya seçenekleri; FR→US→DE→FR ülke geçişi, boş ülke ve önbellek ayrımı; ülke tanıtımı ve F11 kapsülünün gezinme çubuğuna çakışmaması geçti. Tarayıcı çalışma zamanı hatası yok. ui-result.json ve PNG’ler çalışma klasöründe tutulur.

Son kaynak üzerinde npm run build (TypeScript + Vite), npm run lint, node scripts/i18n-check.cjs ve sürüm --check çalıştırıldı ve geçti; sonuçları build-final.log, lint-final.log, i18n-final.log ve version-final.log dosyalarında tutulur. FilmReviewAi için mevcut büyük chunk uyarısı derlemeyi engellemez. Bu tur Rust işlevi değişmedi; yeni Rust derlemesi yapılmadı.

Gerçek Windows Luna/WebView2, gerçek mpv görüntüsü/sesi, Whisper indirme/çalıştırma ve canlı servis yanıtları test edilmiş sayılmaz. Kullanıcı Luna Dev.cmd ile uygulamadaki görünümü doğrulayacak. QA sayfaları, sahte anahtarlar ve bağımlılıklar ana kaynağa aktarılmaz. Kullanıcı medyası/notları, plugins ve gizli anahtarlar değiştirilmez.

## Claude’a devir

CODEX-CLAUDE-DEVIR.md Git dışında kalır; bu turun özeti oraya eklenir. promotion-manifest.json değişen dosyaları, promotion-receipt.json aktarım ve SHA-256 sonucunu, main-before-promotion önceki kaynakları içerir. Bağımsız ana kaynak değişikliği varsa aktarım durur. Push/release için kullanıcının mevcut dışlama/snapshot ve beta kuralları korunur; bu tur push yetkisi değildir.

Kullanıcı disk alanını kendisi açacak. Dosya/klasör silme, önbellek/derleme artığı temizleme veya otomatik alan açma işlemlerinden önce her zaman sor. Bu tur temizlik veya dosya silme yapılmadı.
