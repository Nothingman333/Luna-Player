# Luna beta — gelen nihai yamanın birleştirilmesi

23 Ekim 2026. `files (2).zip` içindeki kümülatif `luna-1.6.7-duzeltmeler.patch` incelendi; gerekli parçalar mevcut birleşik kaynağa uyarlandı. `files.zip` ve `files (1).zip` içindeki ara dosyalar aynıdır; tekrar uygulanmadı.

Mevcut çalışma, v1.6.7 (`3c4ae8f55ae792e9abe43fb9c3cf67c506b61bd6`) üzerine önceki beta birleşimi, performans ve görsel düzeltmeleri içerir. Eski dosyalarla üstüne yazılmadı. **Yeni paket, commit veya push yapılmadı; eski nihai ZIP bu değişiklikleri içermez.**

## Alınan ve uyarlanan düzeltmeler

1. **Eklenti manifesti ve çeviri JSON'larında UTF-8 BOM:** `extension_package.rs` ortak ayrıştırıcısı yalnız baştaki üç BOM baytını kaldırır. İmzalı paketin manifest düzenlemesi, önizleme ve `_locales` mesajları aynı yolu kullanır. Bozuk JSON, izin incelemesi, imza kontrolü ve boyut/yol sınırları korunur. BOM'lu manifest ve yerelleştirme için Rust testi eklendi.
2. **Sayfa okuma özel adres denetimi:** `lib.rs::is_private_url` ana makine adının sondaki noktasını normalleştirir. `localhost.` ve `app.localhost.` özel adres kalır; genel adreslerin sondaki noktası sırf bu nedenle reddedilmez. Bu düzeltme tüm DNS/SSRF risklerinin çözüldüğü iddiası değildir. Adres sınır testi eklendi.
3. **Arama motoru listesi:** Ayarlar'a Ecosia ve Yandex eklendi; sekiz motor, mevcut DuckDuckGo kimlik eşlemesi ve özel adres şablonları korunur.
4. **Motor seçiminin hemen uygulanması:** Web başlangıcından seçilen motor, kayıtla birlikte paylaşılan adres çözümleyicisine uygulanır. Uygulamayı yeniden açmadan diğer arama yolları da güncellenir.
5. **Yerel gün hesabı:** Asistanın film çıkış değerlendirmesi ve seri takibindeki “yeni/yakında” ile bilinen film listesi mevcut `dayKey` işlevini kullanır. Türkiye'de 00:00–03:00 arasında önceki UTC gününün seçilmesi giderildi.
6. **Zevk defterinde bozuk satır:** Gelen yama yalnız silme koşulunu koruyordu; listeyi sıralama bundan önce `null.at` ile çökebiliyordu. `diaryModel.ts::isDiaryEntry` hem görünür satırları hem silinecek hedefleri doğrular. Diğer hasarlı satırlar depoda kalır; bir geçerli kaydı silmek onları temizlemez.
7. **Asistan ··· menüleri:** Eylem sonrası, başka menüye/dışarıya basınca ve Escape ile kapanır. Tek belge dinleyicisi kümesi paylaşılır ve son bileşen kalkınca temizlenir. Gelen yamadan farklı olarak Escape tüketilir; aynı tuş alttaki geniş çalışma alanını da kapatmaz. Klavyeyle kapatırken odak menü başlığına döner; dışarı tıklarken yeni hedefin odağı çalınmaz. Önceki sohbet dizini/sayfalama performans değişiklikleri korunur.
8. **UI kontrol bakımı:** `web-ui-e2e.cjs` güncel geçmiş bileşenini ve sekiz motoru kullanır. `round-50-ui.cjs` eylemler arasında menüyü yeniden açar, gecikmeli odak dönüşünü bekler ve Escape/dışarı basma/menü kapanma davranışını denetler. Eski test seçicileri ürün hatası olarak sayılmadı.

## Yeniden uygulanmayanlar

- **Explorer `/select` yolu:** `browser_downloads.rs` zaten doğru `raw_arg` düzenini kullanır; değiştirilmedi.
- **Sınırsız ağ yanıtı okuma:** Rapordaki eski `get_text/http_text/addon_get` bulgusu mevcut kaynakta geçerli değil. Bu yollar sırasıyla 20/16 MiB sınırlı `read_capped` üzerinden geçiyor; `fetch_page_text` için de sayfa başına 4 MiB sınırı var. Önceki korumalar korunur.
- **Markdown/AI onayıyla ilgili şüpheler:** Gelen rapor bunları doğrulamamıştı. Bu tur yeni kesin hata olarak sayılmadı; çalışan ayrıştırıcı ve onay sınırı değiştirilmedi.
- **Tüm yamayı doğrudan uygulama:** Satır sonu/bağlam ve birikmiş kaynak farkları nedeniyle kontrol uygulanabilir bulmadı. Ürün değişiklikleri elle uyarlandı; iki test betiğinin hunk içerikleri önce eşleşme doğrulanarak birleştirildi. Ara yama ile nihai yama peş peşe uygulanmadı.

## Araştırma paketi

`Luna-GitHub-Arastirma.zip` bir kod paketi değildir. Öneriler mevcut kaynakla karşılaştırıldı: Anki dışa aktarma, podcast dökümü, okuma görünümü ve yanıt boyutu sınırlarının bir kısmı zaten var. Bunlar yeni özellik olarak yeniden sayılmadı.

İleride değerlendirilebilecek bağımsız işler: daha kaliteli makale çıkarımı için örnek sayfa karşılaştırmaları; yerel medya sunucuları için açık bir sağlayıcı katmanı; gapless/crossfade için gerçek mpv prototipi. Bu tur motor/depoya geçiş, SQLite göçü, yeni bağımlılık veya dış proje kodu eklenmedi. Araştırmadaki depo/lisans/popülerlik bilgileri bu tur yeniden internetten doğrulanmadı; öneri listesi uygulanmış özellik listesi değildir.

## Doğrulama

- Yeni `test:incoming-final`: **6/6 geçti.** Sekiz motor uyumu, anında çözümleyici güncellemesi, yerel tarih kullanımı, null/bozuk günlük satırlarının görüntülenmesi, hedef silmede bozuk satırların korunması ve özel motor uyumu.
- Aynı kontroller değişiklik öncesi görüntüde çalıştırıldı: **5 başarısız, 1 başarılı**. Bozuk satır testlerinde gerçek `null.at` ve `null.title` hataları görüldü; önceki kaynak Ecosia seçiminden sonra Google çözümleyicisini kullanmaya devam ediyordu. Yeni script CI'a eklendi.
- İlgili mevcut kontroller: shell-extras **9/9** (isteğe bağlı ffmpeg kontrolü ortamda atlandı), web-plus **31/31**, browser-suggest **21/21**, assistant-presentation **6/6**, performance-workflows **12/12**; geçti.
- Başsız Edge, taklit native/clipboard: round-50-ui **7 akış grubu** geçti; ek Escape kontrolü alttaki çalışma alanına tuş ulaşmadığını doğrular. Motor/başlangıç/sekme kısayolu/Türkçe panel için seçilmiş Web UI senaryoları **4/4** geçti. Bunlar canlı WebView2 testleri değildir; diğer Web UI senaryoları bu tur yeniden çalıştırılmadı.
- `tsc && vite build` ve İngilizce metin denetimi geçti. Mevcut büyük chunk/etkisiz dinamik import uyarıları sürer.
- **Rust sınırı:** Yerel çevrimdışı GNU araç zinciriyle izole native test denemesi uygulama testlerine ulaşmadan bağlayıcıda durdu (`gcc_eh`, ardından CRT sembol uyumsuzluğu). Yeni Rust testleri bu makinede çalışmış sayılmaz. Native uygulama derlemesi veya Explorer/WebView2 canlı doğrulaması yapılmadı. Mevcut Windows CI `cargo test --lib` adımı bu testleri de kapsar; bu tur CI çalıştırılmadı.

Önceki kaynak kopyası, model önce/sonra JSON'ları, uygulanan gelen yama ve kontrol günlükleri ayrı yerel `beta-incoming-final-evidence/` çalışma dizininde. Seçilmiş kayıtlar `docs/evidence/incoming-final/` içine alındı. Hiçbir gerçek API anahtarı veya kullanıcı medya dosyası kullanılmadı.
