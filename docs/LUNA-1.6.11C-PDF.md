# Luna 2 PDF uygulaması — 1.7.1C

Sürüm numarası düzeltmesi (2026-10-23): kullanıcı onluk basamak devri istedi; 1.6.11C → 1.7.1C. Özellikler aynı. Bu belgenin dosya adı ve 1.6.11C kanıt/yedek yolları tarihsel kayıt ve mevcut bağlantılar için korunur. Yeni sürüm penceresi ve altı sürüm dosyası 1.7.1 ile eşlendi.

2026-10-23. Kaynak: kullanıcının Downloads klasöründeki ea231718-7979-4bf8-94f2-abcf8e3e0f78_luna_2.pdf (10 sayfa). Metin ve ekran görüntüleri birlikte incelendi. Kullanıcı kendisi yokken devam edilmesine izin verdi; somut maddeler uygulandı. Belgenin fikir/kararsızlık bölümleri ayrı tutuldu.

## Uygulananlar

- Ayarlar / Genel içinde yerel AI token sayacı: Gemini, OpenAI uyumlu ve Anthropic yanıtlarının bildirdiği girdi/çıktı/toplam/önbellek tokenları. Native çağrı köprüsünde tek yerde sayılır; Tauri'nin salt okunur nesneleri değiştirilmez. Önbellek girdisi iki kez toplanmaz; Anthropic cache okuma/yazma girdileri hesaba katılır. Bilgi bildirmeyen yanıtların sayısı ayrı görünür. Sayaç tutar, abonelik kredisi veya geçmiş kullanım iddiası taşımaz; yalnız toplamlar saklanır, metin/anahtar tutulmaz. Sıfırlama yerel onaylıdır.
- Tanıtım kısayollarına Ctrl+K genel arama eklendi. Tanıtımın ardından sistem hazırlığı açılır; eski kullanıcılara yeni donanım rehberi bir kere gösterilir. Ayarlar'dan yeniden taranabilir.
- Mevcut system_check, GPU adlarını ve RAM miktarını yerel CIM sorgusuyla alır. Whisper için CPU/CUDA ayrımı ve base/small model önerisi yapılır; kaydedilmiş kullanıcı seçimleri değiştirilmez ve kendiliğinden motor/model indirilmez. RAM bilinmiyorsa küçük model tercih edilir. NVIDIA bulunmayan bilinen sistemde CUDA indirme/seçme düğmeleri ve uygun olmayan VSR üreticisi devre dışıdır. GPU marka algısı gerçek sürücü/özellik sertifikası değildir.
- Vulkan artık oynatmanın zorunlu şartı gibi sunulmaz; normal mpv yolu D3D11 kullanır. Anime4K shader gereksinimi, ayrı ücretli Lossless Scaling, OCR dil paketi, AnkiConnect, SongRec/Demucs ve çevrim içi API gereksinimleri rehberde ayrılır. GPU efektleri kendiliğinden açılmaz.
- Görüntü/kadraj, sahne/klip ve iyileştirme seçenekleri UP içinde toplandı. Luna (mpv/Anime4K/VSR) ve Lossless Scaling motoru seçilir. Yerel Anime4K indirme/seçimi korunur. mpv hareket ara değerlemesi ile Lossless Scaling'in kare üretimi aynı teknoloji gibi adlandırılmaz. Lossless açılırken çakışan yerel iyileştirmeler kapatılır. Aynı video ayarını düzenleyen iki bölüm, ortak depodaki güncel değerleri birleştirir; parlaklık değiştirmenin HQ/Anime4K seçimini geri alması engellenir.
- Çark ses ayarlarını açar. Ekolayzer, ses dengeleme/gece modu ve A-B döngüsü korunur. Altyazı zaman çizelgesine altyazı seçiminden ulaşılır; ayrı alt çubuk düğmesi kaldırıldı. Ses seçimi altyazı panelinde kalır.
- Basit native checkbox'lar mevcut temanın erişilebilir, klavyeyle kullanılan anahtarlarına dönüştürüldü. Renk/font sistemi korunur.
- Altyazı stüdyosu arama/yükleme ekranında her zaman seçenek. Sonuç yoksa bilgisayarda yazıya dökme açıklamasıyla yerinde önerilir. Sahte tam-dosya uyumu iddiası yapılmaz; dosya hash eşleşmesi yoksa başlık/bölüm kontrolü açıklanır.
- Altyazı adını elle değiştirip arama eklendi. Elle arama, backend'de dosya hash'ini ve eski yıl/sezon/bölüm kısıtlarını kullanmaz; otomatik dosya eşleştirmesine geri dönülebilir. Eski istek cevapları ve kapatılan pencereye gelen cevaplar bırakılır. Kullanıcı hangi sonucu ekleyeceğini seçer; dış servis sonuçları otomatik doğru sayılmaz.
- Stüdyo en fazla 800 px; dört araç üstte kompakt sekme. Canlı altyazı ve PGS OCR açılır ek araçlar bölümünde, kaybolmadan erişilebilir.
- Film sağ tık alt menüleri kaydırılan ana menünün dışında aynı portalda sabit konumlanır, sağ/sol ve üst/alt ekran sınırlarıyla yerleştirilir. Uzun parça listesi kaydırılır; klavye/fokus ve Escape korunur. Gerçek native video katmanı doğrulaması ayrıca gerekir.
- Müzik/kitap zevk ölçümü global iş durumunu dinler; çalışan iş başka yerden başlasa da taranıyor göstergesi görünür. Ortak analizde çalışan düğme ve belirsiz ilerleme hareketi vardır; azaltılmış hareket tercihine uyulur.
- Kitap analizleri/yerel eserler tıklanır; müzik eserleri ve en çok dinlenen şarkılar gerçek kayıtları açar/çalar. Belirsiz aynı adlı kitap yanlış seçilmez.
- Yalnız yıldızlı yorumlar kaydırılan flex listesinde küçülmez; boş metne açıklama eklenir ve kayıtta yıldızlı satırlar korunur. 30 satırlık örnekte üst üste binme kontrol edildi.
- Keşfet ayrıntısında dizi sezon/toplam bölüm/yayımlanmış bölüm sayısı gösterilir. TMDB'nin son yayımlanmış bölümü ve önceki normal sezonları kullanılır; özel/gelecek sezonlar sayılmaz. Tarihi gelecekte olan henüz başlamamış dizi 0; eksik veri — olarak gösterilir. Ek sezon ağı istekleri yapılmaz.
- F11 açıklaması üst ortaya taşındı. Film/müzik/kitap düğmesine tekrar basmak ilgili ana sayfaya döner ve açık ayrıntıyı temizler.
- Yeni sürüm bulunduğunda mevcut güvenli updater akışına bağlı pop-up eklendi; kendiliğinden kurulum yapılmaz. Her sürüm açılışında bir kez Neler yeni penceresi; bu sürümün yerel notları içerir. Beta ve imza kontrolleri korunur.
- Luna Analiz ana görünümü korunarak sonuç başlıkları daha belirgin bölümlere alındı. Önem 0–5, etki çarpanı ve eser puanı 0–10 ayrı etiketlendi. Hesap/formüller ve kullanıcı puanları yeniden ölçeklenmedi.
- Gerçek kütüphane afişindeki TMDB puanı sağ alta alındı; üstteki format/bitirme bilgileriyle aynı köşede durmaz.

## Bekleyen fikirler ve sınırlar

PDF sesli komuta henüz karar verilmediğini, Art tarayıcı eklentisinin düşünüldüğünü söylüyor. Bu iki fikir uygulanmış gibi gösterilmedi, eklenti/servis kurulmadı. Önceki 1.6.9C/1.6.10C belgelerindeki dış servis, libmpv ve diğer açık maddeler bu turla bitmiş sayılmaz.

Gerçek Windows Luna penceresi kullanıcı tarafından test edilecek. Bu tur GPU VSR, CUDA, yerel Whisper modeli, Lossless Scaling, OpenSubtitles hesabı, updater kurulum veya gerçek kitap/ses dosyasıyla uçtan uca doğrulama yapmadı. Donanım isimleri ve RAM, tam özellik uyumluluk testi değildir.

## Doğrulama

- npm test: yeni Luna 2 grubu dahil 55 regresyon komutu geçti. Son düzenlemelerden sonra zevk/ayrıntı/stüdyo ilgili grupları ayrıca geçti.
- TypeScript/Vite build, lint, i18n ve sürüm --check: geçti. FilmReviewAi için önceki büyük chunk uyarısı sürer; hata değildir.
- cargo check --locked --offline --tests, ayrı CARGO_TARGET_DIR: geçti. Bu tüm Rust testlerinin çalıştırılması değildir; manuel arama testi derlendi.
- Yeni davranış kontrolü: API token biçimleri, cache çift saymama, yanıt vermeyen servis, sıfırlama/anahtar gizliliği, çağrı köprüsü kapsamı, sezon sayımı ve donanım önerileri.
- Headless Edge + sahte Tauri ve sentetik kayıtlar, 1280 ve 640 px: alt menü sınırları/25 ses parçası; Intel/NVIDIA ayrımı; UP görünümü ve parlaklık değiştirirken HQ koruma; isimle arama; stüdyo genişliği; puan etiketleri; token/donanım ekranı; sürüm notunun bir kez görünmesi ve güncelleme pop-up'ı; müzik satırı tıklama; afiş puanı konumu; 30 yorumun çakışmaması. JS hatası yok. Dar stüdyo/UP/altyazı/afiş/yorum görselleri incelendi. Bunlar gerçek Luna penceresi değildir.

Kanıtlar/yedek: C:/Users/fatme/Documents/Luna-1.6.11C-PDF altında build.log, regression.log, cargo-check.log, ui-result.json, ekran görüntüleri, promotion-manifest.json, promotion-receipt.json ve main-before-promotion. Test sayfaları, node_modules, hedef ve derleme dosyaları ana kaynağa aktarılmaz.

Teknik kaynaklar (2026-10-23): https://github.com/ggml-org/whisper.cpp/blob/master/README.md?plain=1 (CPU/CUDA ve ayrı backend'ler); https://mpv.io/manual/master/ (d3d11vpp donanım/sürücü şartları). Genel backend desteği, Luna'nın CPU/CUDA indirme seçeneklerine ek backend kurulduğu anlamına gelmez.

Commit/push/release/installer/USB işlemi yapılmadı. GitHub push Claude'da. Yerel CODEX-CLAUDE-DEVIR.md Git dışıdır.
