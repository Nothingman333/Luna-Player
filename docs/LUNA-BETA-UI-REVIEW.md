# Luna beta — görsel inceleme ve düzeltmeler

Tarih: 23 Ekim 2026. Taban: GitHub ön sürümü **v1.6.7**, tam commit `3c4ae8f55ae792e9abe43fb9c3cf67c506b61bd6`. İnceleme sırasında main aynı commit'teydi; eski beta-1.0.1 dalı kullanılmadı. Sürüm, updater, uygulama kimliği ve Rust kodu değiştirilmedi.

Bu çalışma mevcut Luna tasarımını korur. IBM Plex Sans/Sora, film turuncusu, kitap ve web moru, müzik yeşili ve kullanıcı vurgu değişkenleri korunur. Yeni tasarım sistemi veya bağımlılık eklenmedi. Kişisel kitaplık, anahtarlar ve profil verileri üzerinde test yapılmadı. Commit/push yapılmadı.

## Düzeltilenler

1. Film detayında analiz bileşeni `#film-decision` içine taşınmış, eski doğrudan çocuk CSS seçicisi geçersiz kalmıştı. Analizin kenara yapışması düzeltildi.
2. Film defteri, hatırlanan oynatma tercihleri ve seri takip kartları da aynı detay sayfası kenar hizasına alındı; açılır başlıkları belirginleştirildi.
3. Analiz sonucu puanları tema değişkenlerini kullanan okunaklı kartlara ayrıldı. Olumlu/olumsuz sonuç etiketi puan ızgarasından ayrılarak fazladan boş sütun oluşturması önlendi.
4. Uzun analiz özetlerinin satır uzunluğu sınırlandı ve satır aralığı iyileştirildi.
5. Yorum kartlarına sınır, iç boşluk ve daha sakin metin ağırlığı verildi. Uzun yorum listesi sınırlandırılmış, kaydırılabilir bir okuma alanı oldu.
6. Uzun kullanıcı adları ve gerekçelerin kartları genişletmesi önlendi.
7. Spoiler gizliyken yorumun yapay zekâ özeti görünüyordu. Özeti de yalnız yorum açıldıktan sonra gösteriliyor.
8. Sonuç vermeyen yorum filtresine açıklayıcı boş durum eklendi; TR/EN karşılığı mevcut.
9. Zevk önem noktalarının görünümü korunarak tıklama alanları büyütüldü.
10. Önem seçenekleri radyo grubu olarak klavyeyle yönetiliyor: ok tuşları, Home/End, tek Tab durağı ve seçili durum.
11. Zevk satırları yalnız pencereye değil bulundukları kapsayıcının genişliğine göre düzenleniyor; dar öneri önizlemesinde de çalışıyor.
12. Zevk başlıklarının açılıp kapandığı belirgin bir okla gösteriliyor. Profil başlığındaki sayılar dar pencerede ayrı satıra geçiyor; başlığa kaydırma sabit üst menünün altında kalmıyor.
13. Son analiz kartlarında uzun adlar ve klavye odağı düzenlendi.
14. Letterboxd onay kutusuna yanlışlıkla metin alanı genişliği uygulanıyordu. Kimlik ve bağlantı satırları ayrıldı; onay kutusu, kişi adı ve URL düzgün hizalandı. Alanların erişilebilir adları eklendi.
15. Analiz ayarları menüsü kullanılabilir alana göre yukarı/aşağı açılıyor; kısa pencere ve kaydırılabilir önizleme sınırlarına sığıyor.
16. Analiz menüsünde Escape yalnız menüyü kapatıp odağı düğmeye döndürüyor. Film öneri önizlemesini/kitap detayını aynı anda kapatan üst seviye Escape çakışması giderildi.
17. Web okuma listesi ve sayfa notu bölümleri tema çerçeveleri, tutarlı yazı boyutları, açılma okları ve klavye odağıyla düzenlendi.
18. Web araçları açıkken asistan balonu 560 piksel ve üzeri pencerelerde menünün soluna geçiyor; not/dışa aktarma düğmelerini örtmüyor. Araçlar kapanınca normal sağ alt konumuna dönüyor.

## İnceleme ve kanıtlar

Üretim derlemesindeki gerçek React arayüzü headless Microsoft Edge'de açıldı. Yerel veri ve Tauri komutları sentetik örneklerle sağlandı. Baseline ve düzeltilmiş analiz/profil/Letterboxd durumları 1440, 800 ve 640 piksel genişliklerde aynı veriyle görüntülendi. Geniş incelemede 1280×720 ve 640×620 boyutlarında film, müzik, kitap sekmeleri, ayarların sekiz bölümü, koleksiyonlar, web araçları ve asistan açıldı; uzun sayfalarda alt bölümler de yakalandı. Film öneri önizlemesi ve kitap analizi ayrıca dolu sonuçlarla açıldı.

- `npm run build`: geçti (TypeScript ve Vite üretim derlemesi).
- `node scripts/i18n-check.cjs`: geçti.
- `node scripts/film-browser-regression.cjs`: 20/20 geçti.
- `beta-ui-interactions.cjs`: 1440×900, 640×620, 800×400 boyutlarında toplam 18 etkileşim grubu geçti. Klavye, kayda yazma, spoiler, boş filtre, aç/kapa, Letterboxd ve menü konumu doğrulandı.
- `beta-final-panels.cjs`: iki boyutta toplam 6 etkileşim grubu geçti. Öneri önizlemesi ve kitap detayında Escape sırası; web notu ve okuma listesi sınırları doğrulandı.
- Genel sayfa akışında 87 ekran durumu yakalandı; JavaScript sayfa hatası veya ölçülen yatay taşma oluşmadı. Bu sayı 87 benzersiz test veya bütün özelliklerin doğrulandığı anlamına gelmez.

Görseller ve çalıştırılabilir kontrol betikleri teslim paketinin `Gorsel-Kanitlar/` ve `Kontroller/` dizinlerindedir. Galeri önce/sonra çiftlerini ve sayfa taramasını içerir. Tam boyutlu görseller düzen/okunabilirlik açısından ayrıca incelendi; yalnız taşma ölçümüne dayanılmadı.

## Sınırlar

Gerçek Windows Luna penceresi otomatik yönetilmedi. Bu çalışma yerel WebView2 çocuk penceresinin DOM katmanlarıyla birleşimini, gerçek video/DRM/tam ekranı, canlı Letterboxd aktarımını, ücretli AI çağrılarını veya gerçek EPUB/PDF render'ını doğrulamaz. Keşif/çevrimiçi kataloglarda anahtar yok/bağlantı yok durumları gözlendi; gerçek katalog içerikleri sınanmadı. Kayıtlı örnek analizler gerçek AI isteği sonucu değildir. Bütün sayfaların bütün olası veri durumlarında kusursuz olduğu iddia edilmez.

## Devam eden çalışmalar için

Global Codex tasarım skillleri kullanılabilir. Luna'ya özel `luna-ui-design` proje içine de kopyalandı ve CLAUDE.md'ye bağlandı. Görsel değişiklikte bu skill ile `luna-ui-consistency` birlikte uygulanmalı; mevcut font/tema, kompakt asistan ve native IPC sınırları korunmalı. Önceki tarihsel paketlerdeki yamalar bu tabana yeniden uygulanmamalı.
