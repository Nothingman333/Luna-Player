# Luna 3.4.7D — adres çubuğu ve eklenti paneli

Kullanıcı geri bildirimi (2 Kasım 2026): eklenti düğmesi okuma modunun yanında olmalı; adres metni düğmelerin
altına taşmamalı; sabitlenen eklentilerin simgeleri görünmeli; sabitlenen bir eklenti ayrı pencere/sekme gibi
açılmak yerine tıklanan simgenin altında açılmalı.

## Yapılan değişiklikler

- **Adres çubuğu yerleşimi:** URL metni artık formun tamamına göre mutlak bir `left/right` değeriyle değil,
  `.browser-addr-field` alanının içinde konumlanıyor. Alan, kalan gerçek genişliği alıyor; host kalın, yol
  üç nokta ile kısalıyor. Okuma modu, eklenti düğmesi, koleksiyon, Luna ve git düğmeleri metnin üstüne binemiyor.
- **Eklenti düğmesi:** `BrowserExtensionToolbar` formun dışından çıkarılıp okuma modu düğmesinin hemen yanına
  alındı. Sabitlenen simgeler ve eklenti (puzzle) düğmesi aynı grupta; dar pencerede (≤900 px) sabit simgeler
  gizleniyor, eklenti menüsü puzzle düğmesinden açılmaya devam ediyor. Aynı eşikte Luna oynat düğmesi yalnız
  simgeye küçülüyor ve adres alanı biraz genişliyor; böylece URL 800 px'te de okunabilir kalıyor.
- **Simgeler:** `browser_extension_ui::icon_value` artık `action`, `browser_action`, `page_action` ve paket
  `icons` tablolarının hepsini, 19/38 px dahil, tercih sırasıyla okuyor. Dark Reader gibi yalnız 19/38 px
  `default_icon` ve 16/48/128 px paket simgesi tanımlayan eklentiler artık harf yerine gerçek simge gösteriyor.
- **Eklenti paneli:** `browser_extension_manage` içindeki eski `open` işlemi ve ayrı `luna-extension-{id}`
  penceresi kaldırıldı. Yeni `browser_extension_popup` komutu, tıklanan simgenin ekran dikdörtgenini alıp
  çerçevesiz, görev çubuğunda görünmeyen, 400×560 mantıksal boyutlu bir paneli simgenin altında açıyor.
  Pencere ekran dışına taşmıyor; alta sığmazsa düğmenin üstüne dönüyor. Odak panelden ayrıldığında (sayfaya
  veya araç çubuğuna dönüş) panel kendiliğinden kapanıyor. Panel ayrı bir sekme değil; sekme çubuğuna kayıt
  eklemiyor ve görev çubuğunda pencere oluşturmuyor.
- **Çeviri menüleri:** “Orijinal dilinde göster” (sağ tık) ve “Özgün sayfaya dön” (araçlar menüsü) artık
  yalnızca sayfa gerçekten çevrildikten sonra (`translatedPages` sekme revizyonuyla eşleşiyorsa) görünüyor;
  çevrilmemiş sayfada yerlerini “Sayfayı çevir” alıyor. Çeviri sürerken eylem devre dışı.

## Doğrulama

- `npx tsc --noEmit -p app/tsconfig.json`: geçti.
- `cargo check` (`app/src-tauri`): geçti; yeni komut `lib.rs` invoke listesine kayıtlı.
- `npm test`: 58 regresyon komutu geçti. Bu turda ayrıca `review-completion-regression.cjs` yerel çeviri
  bağımlılığını yükleyecek şekilde güncellendi ve `releaseHistory.ts` 3.4.7D kaydıyla yeniden üretildi.
- Yerleşim, Tauri köprüsü taklit edilen `browser-preview.html?demo=extensions` sayfasında headless Edge ile
  1855×1094, 1440×900, 800×700 ve klasik (tek satır kapalı) görünümde kontrol edildi. URL metni düğmelerin
  altında kalmıyor; iki sabit eklenti simgesi ve puzzle düğmesi okuma modunun yanında görünüyor.
- Simge seçimi, diskteki gerçek Dark Reader 4.9.134 paketiyle doğrulandı: `icons/dr_48.png` seçildi ve dosya
  mevcut (2.289 bayt).
- Çeviri menüsü değişikliğinden sonra `npx tsc --noEmit` tekrar geçti; Vite HMR çalışan geliştirme penceresine
  `Browser.tsx` güncellemesini iletti. Menünün gerçek sağ tık akışı kullanıcı penceresinde denenir.

## Çalışma alanından başlatma (bulunan çökme)

- `E:\deepseek deneme\vlc modern\...\target\debug\app.exe` doğrudan çalıştırıldığında Tauri ana WebView2
  penceresini oluşturamıyordu (`0x800700AA` “kaynak kullanımda” veya `0x5` erişim engellendi). Aynı derleme
  `%LOCALAPPDATA%\LunaDevRun` klasörüne kopyalandığında sorunsuz açıldı; yani hata Luna kodunda değil, çalışma
  alanı yolunun bu makinedeki dosya sistemi kısıtında.
- Tekrarlanabilir geliştirme başlatıcısı eklendi: `npm run dev:outside`. Vite'ı başlatır, debug derlemeyi alır,
  `app.exe` ile `mpv`/`fonts` klasörlerini `%LOCALAPPDATA%\LunaDevRun` altına kopyalar ve uygulamayı oradan açar.
- Windows Defender SmartScreen’in imzasız `app.exe` uyarısı ayrı bir koruma penceresidir; normal kurulu Luna
  sürümünü etkilemez.

## Sınırlar

- Gerçek Windows Luna penceresinde eklenti panelinin açılması, odak kaybında kapanması ve DPI/çok monitör
  yerleşimi bu turda otomatik test edilmedi; kullanıcı gerçek pencere testini yapar. Ana pencerenin
  `%LOCALAPPDATA%\LunaDevRun` üzerinden açıldığı doğrulandı.
- Headless tarayıcı testi DOM/yerleşim ve taklit köprü seviyesindedir; WebView2 eklenti API'si veya gerçek
  eklenti sayfası yüklemesi kanıtı değildir.
- Rust birim testi derlendi; test çalıştırıcısı bu makinede `STATUS_ENTRYPOINT_NOT_FOUND (0xC0000139)` ile
  açılmadığı için simge birimi testi çalıştırılamadı. Derleme ve gerçek manifest kontrolü yapıldı.

Sürüm: `3.4.7D` (`version.ts`, `package.json`, `package-lock.json`, `tauri.conf.json`, `Cargo.toml`,
`Cargo.lock`).
