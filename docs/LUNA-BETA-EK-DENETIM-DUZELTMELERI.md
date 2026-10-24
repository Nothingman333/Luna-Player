# Son teslim sonrası doğrulanan ek düzeltmeler

23 Ekim 2026. Girdi: kullanıcının `files (4).zip` dosyası (denetim yaması, 19 kontrol, ham fuzz çıktıları ve audit araçları). Taban çalışma kaynağı, `Luna-Beta-Nihai-GitHub-Paketi-2026-10-23.zip` tesliminin devamıdır. Yeni uzak sürüm alınmadı; önceki birleşik yenilikler korunur. Kullanıcı yalnız düzeltmeleri istedi: **bu tur paket üretilmedi, mevcut ZIP değiştirilmedi, commit/push yapılmadı.**

## Alınan düzeltmeler

Gelen yamadaki B1–B9 kapsamı değerlendirildi. Bunlar 9 bulgu ailesidir; aynı nedenin SRT/VTT, adres/kısayol gibi farklı tetikleyicileri ayrı bug sayılmadı.

1. **Altyazı dışa aktarma:** cue içindeki boş satır, tekrar okunduğunda kalan metni kaybettiriyordu. SRT/VTT yazarken boş satır tek satır sonuna çevrilir; Windows CRLF de normalleştirilir. Dosya okuyucu, standart dosyalardaki gerçek cue ayırıcılarını kabul etmeye devam eder.
2. **Altyazı dil kodları:** `es-419`, `zh-Hant-TW` gibi bölge/yazı etiketleri `und` oluyordu. Güvenli dil + isteğe bağlı dört harfli yazı + iki harfli/üç rakamlı bölge desteklenir. `pt_BR` uyumu ve dosya adı için geçersiz girdilerin reddi korunur.
3. **Tarayıcı adres kuralları ve hata metni:** frontend, Rust'ın zaten reddettiği IPC/asset/app kökenlerini ve dev portunun farklı loopback yazımlarını gezinme öncesinde reddeder. Native hata mesajlarının Türkçesi eklenir. Bu, native güvenliğin aşılması iddiası değildir; mevcut Rust reddi yerinde durur.
4. **Bozuk Unicode arama metni:** tek kalmış UTF-16 surrogate, `encodeURIComponent` içinde `URI malformed` hatası üretiyordu. Adres/arama ve bang girişlerinde bozuk parça U+FFFD ile değiştirilir; geçerli emoji korunur.
5. **Türkçe kısayollar:** `!İMDB` / `!ımdb`, `!imdb` ile aynı aramayı yapar.
6. **Discord başlığı:** kısaltma emoji surrogate çiftini kesebiliyordu; başlık/durum kod noktası sınırında kısaltılır.
7. **Zevk benzerliği:** Jaccard hesabında yinelenen öğeler kesişimi şişirebiliyordu. Her iki taraf küme olarak hesaplanır; tekrarlar benzerliği 1'in üstüne çıkarmaz.
8. **Dosya boyutu yazımı:** 999,6 MB `1000 MB` yerine `1.0 GB`; 999,6 KB `1 MB` görünür. NaN/negatif boyutlar `0 KB` olur; mevcut normal boyut gösterimi korunur.
9. **İki yavaş regex yolu:** dosya adında uzun boşluk/tire dizileri ve altyazı algılamada uzun boş satır dizileri aşırı geri izleme yaratıyordu. Dosya adında baştan tüm öneki tekrar deneyen regex yerine bölüm/yıl işareti bulunup başlık dilimlenir; son ayırıcılar tek geçişte taranır. ASS algılama satır başında yalnız yatay boşluk atlar.

## Gelen yamaya göre farklı uygulananlar

- **AutoEq B11 alınmadı.** 24 kHz üst sınırını 20 kHz'e çekmenin bir uygulama hatasını giderdiği gösterilmedi; sınır tercihi doğrulanmış bug olarak sayılmadı. `autoEq.ts` son teslimle aynıdır.
- **Dosya adındaki uzun ayırıcı dizilerini kısaltma alınmadı.** Gelen `base()` değişikliği `A------------B` gibi gerçek başlığı değiştiriyordu. Bunun yerine yavaş aramanın kendisi değiştirildi. Parantezli yılın başlığa açık parantez bırakmaması da kontrol edildi.
- **IPv4-mapped IPv6 kontrolü daraltıldı.** Gelen `host.startsWith('[::ffff:7f')` kontrolü `0.127.0.1` gibi loopback olmayan bir adresi de engelliyordu. İki hex grubu ayrıştırılıp yalnız 127/8 ve 0.0.0.0 reddedilir; Rust kuralıyla eşleşir. Normal LAN ve diğer yerel portlar açık kalır.
- Ham fuzz dosyasındaki binlerce `undefined`, `null`, yanlış tür ve beklenen doğrulama hatası topluca uygulama bug'ı kabul edilmedi. Linux'a özel `audit-araclari.tgz` üretim kaynağına veya CI'a taşınmadı.

## Kontroller

Yeni `npm run test:audit-fixes` CI'a eklendi. Gelen 19 kontrolün AutoEq maddesi çıkarıldı; dosya adı korunumu ve CRLF kontrolü eklendi: **20 kontrol**. Aynı nihai kontrol kümesi önceki teslim kaynağında **5/20**, işlenmiş kaynakta **20/20** geçti. Geçen/başarısız kontrol sayıları ayrı bug sayısı değildir. Performans kontrolleri sentetik uzun metinlerin sürelerini ölçer; gerçek Windows UI donması yeniden üretildi denmez.

- Önceki 50 davranış kontrolü: **50/50**.
- İlgili mevcut gruplar: browser **16/16**, browser-reader **8/8**, browser-magic **23/23**, shell-extras **9/9**, subtitle-studio **25/25**, film-browser **20/20**, taste-core **44/44**.
- Dosya adı karşılaştırması: **102** normal/kenar örneğinde eski ve yeni başlık/yıl/bölüm ayrıştırması aynı.
- i18n denetimi başarılı. Üretim TypeScript/Vite derlemesi başarılı; mevcut büyük parça ve etkisiz dinamik import uyarıları sürer.
- Ekran yerleşimi/CSS değiştirilmedi; yeni görsel tur gerekmedi. Rust, medya oynatma, Discord bağlantısı veya gerçek Windows Luna penceresi çalıştırılmadı. Tarayıcı adresleri ve dışa aktarma davranışları model düzeyinde sınandı.

Kanıtlar kaynak dışındaki `incoming-audit-files4/` dizininde: `accepted-before.json`, `accepted-after.json`, karşılık gelen günlükler, ilgili test günlükleri ve `build.log`. Önceki kaynak `before-integration/` altında korunur. `check-filename-parity.cjs` 102 örneğin karşılaştırmasını yapar. Paket istenince bu kaynak ve rapor, önceki tam teslimin üstüne birleştirilmelidir; eski ZIP bu düzeltmeleri henüz içermez.
