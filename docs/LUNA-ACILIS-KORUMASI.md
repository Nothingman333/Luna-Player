# Siyah ekran: açılış koruması ve tanı

Hedef gerçek push: 4136529bd1f574bcba809b117219189018368882 (sürüm 1.6.5). Bu commit GitHub'dan ayrı dizine alındı; kullanıcının yerel deposuna ve uygulama verilerine yazılmadı. Gönderilen önceki birleşik paketle karşılaştırıldı: ana açılış kodu aynı, ek farklar sürüm/lock ve birkaç test/arama tanıma satırıydı. Hedefteki bu değişiklikler korundu.

## Kesin olarak doğrulanan

Mevcut main.tsx React'i oluşturmak için önce state_load ve secrets_load bekliyor. Native çağrı cevapsız kalırsa root boş kalıyor. ErrorBoundary bu aşamada henüz oluşmadığı için hata ekranı da yok. Üretim girişinde state_load sonsuza dek bekletilerek eski sürümde boş BODY yeniden üretildi. Bu, kullanıcının Windows'ta yaşadığı siyah ekranın kesin kök nedeni olarak doğrulanmadı. Normal sahte native yanıtlarıyla eski tam üretim girişi açıldı.

Kullanıcı siyah ekranda Ctrl+Shift+D'nin de hiçbir şey açmadığını belirtti. Bu tek başına JavaScript mi native görüntü katmanı mı olduğunu kesin belirlemez; debug'a ulaşmadan çalışan bağımsız bir açılış tanısı gerekir.

## Değişiklikler

- index.html içinde React'ten bağımsız, ilk anda görünen Luna açılış yüzeyi.
- public/boot.js bağımlılıksız klasik script olarak module girişinden önce çalışır. Yüklenemeyen JavaScript modülü ve açılış hataları görünür hâle gelir.
- startup.ts main modülünü dinamik yükler; modül yükleme hatası ErrorBoundary kurulmadan yakalanır.
- main.tsx aşamaları bildirir: arayüz dosyaları, state_load, secrets_load, görünüm ayarları, react_render. Açılış Promise hatası yakalanır.
- Bir aşama 15 saniye yanıt vermezse aşama adı, kopyalanabilir teknik ayrıntı ve yeniden deneme düğmeleri gösterilir. Çağrı sonradan tamamlanırsa normal açılış devam edebilir.
- React commit olunca açılış yüzeyi kaldırılır. Subtitle overlay penceresi bu yüzeyle kapatılmaz.
- Native köprü cevap veriyorsa aşama/arıza satırları mevcut debug dosyasına da yazılır. Gizli değer ve yerel yollar raporda maskelenir.
- Veri veya anahtar yüklemesi bitmeden boş kayıtlarla App'i açıp kaydetme yapılmaz. Depolama/yedek/anahtarlar sıfırlanmaz, otomatik yeniden yükleme döngüsü eklenmez.

Bu paket kilitlenen native çağrıyı zorla tamamlamaz ve WebView2'nin hiç çizmediği bir pencereyi JavaScript ile düzelttiği iddiasında değildir. Ekranda açılış yüzeyi bile görünmüyorsa bu, UI çalışmadan/native katmanda kalan sorunu ayırmak için önemli kanıttır.

## Kullanım

GitHub 4136529 tabanında changes.patch için önce git apply --check, ardından git apply. Hedef değiştiyse dosya bazında birleştir. Yalnız değişen dosyalar Degisen-Dosyalar içinde; tam kaynak ayrı ZIP'te. Kişisel verileri ve .git'i koru. Bu kaynak uygulandıktan sonra yeniden derlenmiş uygulamayı açmak gerekir; push tek başına kurulu EXE'yi güncellemez.

Yeni açılış ekranındaki aşama/ayrıntıyı kullanıcı paylaşmalı. Tam ekran yine bütünüyle siyah kalır ve Luna yazısı bile çıkmazsa bunu da bildirmeli. Bu bilgi olmadan kesin Windows kök nedeni söylenemez.

## Kontroller

Üretim frontend build başarılı. Gerçek index/main/App ile headless Edge: normal açılış; yanıtsız state_load; yanıtsız secrets_load; engellenmiş main modülü olmak üzere dört kontrol geçti. Native köprü ve IPC cevapları sentetiktir. Gerçek Windows Luna penceresi otomatik kullanılmadı. Rust değiştirilmedi. Yama gerçek uygulanıp kaynak byte'ları karşılaştırıldı ve geri alındı; ZIP CRC ve kaynak hash'leri denetlendi. Commit/push yapılmadı.

## Sonradan doğrulanan asıl hata ve düzeltmesi

Kullanıcının Windows ekranında görünen hata: `TypeError: Cannot assign to read only property invoke` / `installDebugTelemetry`. Debug kurulumu Tauri tarafından salt okunur tanımlanan invoke alanına yazıyordu; arayüz modülü açılmadan çöküyordu. transformCallback alanına yazma da kaldırıldı.

Uygulama çağrıları nativeCore.ts üzerinden resmi invoke API’sine iletilir; kayıt, süre, sonuç ve hata takibi debugTelemetry.ts içindeki sarmalayıcıda yapılır. Tauri nesneleri değiştirilmez. Olay kayıtları resmi listen API’siyle alınır. debug_log çağrısı kendi kendini kaydetmez.

Salt okunur/frozen Tauri köprüsüyle 10 debug kontrolü ve gerçek üretim girişinde 5 açılış senaryosu geçti. TypeScript/Vite üretim derlemesi ve Windows GNU native debug derlemesi geçti. Düzeltmeli gerçek Windows uygulaması başlatıldı; pencerede otomasyon yapılmadı. Görsel kontrol kullanıcıya bırakıldı.
