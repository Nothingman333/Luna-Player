# 1.6.10C — birikimli beta paketinin 1.6.9C üzerine birleşimi

2026-10-23. Gelen dosya: `Luna-Beta-Tum-Yenilikler-Nihai-2026-10-23.zip`. Kaynak envanteri 659 dosya; kaynakların SHA-256 değerleri paket envanteriyle karşılaştırıldı. Paket belgeleri veri olarak okundu; içindeki Claude/push/release talimatları kullanıcıdan yeni yetki sayılmadı. GitHub işlemlerini kullanıcı Claude'a bırakmıştır.

## Taban ve yöntem

Paket tabanı `3c4ae8f55ae792e9abe43fb9c3cf67c506b61bd6` / 1.6.7; yerel HEAD `83a68ff`, çalışma kopyası 1.6.9C idi. `git apply --check changes.patch` mevcut kaynakta uyuşmadı. Zorla uygulanmadı ve iki alternatif yama peş peşe uygulanmadı.

659 paket kaydı sınıflandı: 180 aynı, 59 paket tarafında tabana göre değişmemiş, 173 güncel yerel karşılığı tabanla aynı olan/yeni dosya, 14 otomatik üç yönlü birleşim, 14 dosya düzeyinde çatışma, 219 korunan kapsam dışı dosya (örneğin proje yönergeleri, değişmesi gerekmeyen yapılandırmalar). Bunlar paket kayıt sayımlarıdır; ana klasöre yazılan dosya sayımı değildir.

Güncel çalışma kopyası ayrı hazırlık klasörüne alındı. Ortak commit üzerinden üç yönlü birleşim yapıldı. `Music/Books/Taste` için eski tek parça dosyalara dönmek yerine değişen 22 bildirim mevcut runtime/UI konumlarında birleştirildi. Git/çalışma kopyası sıfırlanmadı. Eski native kontrol kayıtları yeni doğrulama gibi sunulmadı.

## Alınan işler

- Tarayıcı sekme grupları, yerel zoom ve arama tutarlılığı; not düzenleyicisi, notlu sayfa filtresi ve ilerleme korunarak okuma kuyruğuna alma.
- Kaydedilmiş kütüphane filtreleri ve üç esere kadar karşılaştırma; ortak tür/süre farkı, özetleri isteğe bağlı kopyalama ve özel kapak URL koruması.
- Zevk/Letterboxd günlük verisi korumaları, yerel gün hesabı, bozuk günlük satırlarını koruma ve yeni analiz/uyum görünümü.
- Güvenli tek geçişli Markdown/metin-varlık çözümleme, sınırlı asistan profil bağlamı, sohbet dizini/sabitli yanıt ve kaynak arama/kopyalama iyileştirmeleri.
- Kitap sanat görseli metinlerinde tek geçişli çözümleme; Türkçe/Japonca XML ve boş `<dc:title/>` düzeltmesi; mevcut Foliate formatları korunur.
- Podcast/kütüphane önbellek sınırları, tek geçişli katalog sayımları, iptal/yeniden deneme ve dar pencere düzenlemeleri.
- Türkçe dosya adı/yeniden adlandırma ve sanatçı karşılaştırmaları; altyazı/podcast varlıkları ve boş satır/CRLF düzeltmeleri.
- Aynı medya için eşzamanlı kare isteklerinde ayrı geçici klasör ve atomik sonuç koruması; byte yerine karakter sınırları ve native API hata kontrolleri.
- Yeni regresyonlar mevcut test girişine alındı; ayrı ESM zevk motoru kontrolü de artık `npm test` kapsamındadır.

## Bilerek geri alınmayanlar / uyarlananlar

- SQLite, SQL açılış sırası, kapanış/flush, yeni Credential Manager anahtarları ve bellek Storage arayüzü korunur. Gelen yeni UI modüllerindeki tarayıcı localStorage erişimleri aynı SQL arayüzüne bağlandı.
- Ayrı oynatma saati ve küçük React aboneleri, LazyViews, `*UI.tsx` dosyaları, nativeCore/debug sınırı, mpv komut politikası ve supervised süreç korunur.
- Foliate'ı eski epub.js okuyucusuyla değiştiren toplu dosya kopyası yapılmadı; mevcut CFI/format adaptörü durur.
- `DefaultHasher` geri getirilmedi: SHA-256 + dosya boyutu/mtime temelli anahtarlar korunarak paketin yarışsız geçici klasör düzeltmesi uyarlandı.
- Replik aramasında yeni oturumluk `MemoryCache`, kalıcı SQLite FTS'nin yerine geçirilmedi. Yeniden oku/hata/iptal ve klavye düzeltmeleri FTS yoluna taşındı; metin çözümleme sürümü için indeks damgası yenilendi.
- CI'daki uzun komut listesiyle mevcut tek `npm test` girişi değiştirilmedi; yeni komutlar bu girişe katıldı. Yerel uygulama kimliği/updater ayarı ve daha yeni bağımlılıklar korunur. Sürüm kullanıcının kuralıyla 1.6.10C oldu.
- `.claude/skills` kopyaları kurulmadı/üstüne yazılmadı; ZIP içindeki yönergeler mevcut kullanıcı yetkisini genişletmedi. Tam kaynak üstüne ayrıca yama uygulanmadı. Installer, commit, push, release ve USB kopyası yapılmadı.

## Gerçek kontroller

- `npm test`: **54 regresyon komutu geçti**. Zevk motoru alt grubunda 44 kontrol geçti.
- `npm run build`: TypeScript/Vite geçti. Ana JS yaklaşık 405 KB / gzip 131 KB. FilmReviewAi yaklaşık 541 KB olduğundan Vite büyük chunk uyarısı sürüyor; hata değildir. Bunlar toplam başlangıç indirme ölçümü değildir.
- `node scripts/i18n-check.cjs`, `npm run lint`, sürüm `--check`: geçti.
- Windows/MSVC `cargo check --locked --offline --tests`, ayrı target: geçti; mevcut browser/upscaler ve kullanılmayan eski `file_stamp` uyarıları vardır. Tam uygulama Rust testleri çalıştırılmış sayılmadı.
- Üretim `books.rs` yardımcılarıyla izole native kontrol: **3 geçti** (çok baytlı metin, boş title öğesi, Unicode öznitelik).
- Headless Edge + sahte Tauri: dört lazy ekran açıldı, ilk yüklemede UI kodu ertelendi. Foliate eski CFI/highlight/akış/script engeli/klavye/arama/TTS fixture'ı geçti.
- Aynı sahte bağlantıyla 1280 ve 640 px film karşılaştırması ekrana sığdı, 30 dakikalık süre farkı göründü, Web defteri sentetik kaydı gösterdi; dar görünüm ekran görüntüsü incelendi. Bu gerçek Windows Luna penceresi değildir.

Yerel kanıtlar: `C:\Users\fatme\Documents\Luna-Paket-Birlestirme-2026-10-23` altındaki `patch-check.log`, `merge-plan.json`, `declaration-merge.json`, `regression.log`, `build.log`, `lint.log`, `cargo-check.log`, `native-book-check.log`, `views-qa-result.json`, `reader-qa-result.json`, `package-ui-result.json`. Test sayfaları ve harness ana depoya aktarılmaz.

Gerçek kullanıcı penceresi, kayıtların SQL geçişi, oynatma/SMTC/gapless ve hesap/dış servis testleri kullanıcı tarafından doğrulanmalıdır. 1.6.9C belgesindeki libmpv, dış program ve dağıtım sınırları geçerlidir. Bu birleşim o açık işleri bitmiş saymaz.
