# Tasarım düzeltmeleri — 23 Ekim 2026

- Tarayıcıdaki Arşiv kopyasını aç komutu yanlışlıkla Araçlar menüsü dışındaydı. Menü içine taşındı; adres çubuğu yeniden tek satır.
- Araçlar menüsünde uzun içerik için sınırlı yükseklik/kaydırma, simge ve kısayol hizaları.
- Ana sayfadaki Bu akşam ne izlesem kartının ikinci kez eklenen yan boşluğu kaldırıldı; hero ve kitaplık satırlarıyla hizalandı.
- Kart başlığı ve Replik ara/Luna Özet düğmeleri dar alanda ayrı, okunabilir satırlara geçer.
- Küçük pencerede henüz sonuç seçilmemiş kartın dekoratif afiş alanı gizlenir; gereksiz yükseklik kaldırılır. Seçim sonucu gösterilir.
- Uzun sonuç başlıkları ve oynatma düğmeleri dar alanda taşmadan yerleşir.
- Önerilerde düğme yazılarının sabit yükseklik içinde birkaç satıra ezilmesi giderildi. Kontroller bütün halde alt satıra geçer.
- Değişiklik bulunmayan başarılı tarama için büyük Kütüphane güncellendi bildirimi gösterilmez. Gerçek değişiklik ve hata bildirimleri korunur ve sayfa boşluklarına hizalanır.
- Kayıtlı sağlayıcı dahil ayar select alanlarının beyaz varsayılan görünümü koyu temaya uyarlandı.
- 760 piksel altındaki ayar/koleksiyon menüsü, gizlenen yatay sekmeler yerine bütün bölümlerin görülebildiği ızgaraya dönüştürüldü.

## Kontrol

Film 7, müzik 6, kitap 5, tarayıcı 2, asistan 1, ayarlar 8, koleksiyonlar 2: toplam 31 görünüm. 1920, 1280, 800 ve 640 piksel genişliklerde toplam 124 son ekran görüntüsü. Her genişlikte yükseklik 900 piksel. Son JSON kayıtlarında yatay taşma ve yakalanan JavaScript hatası yok. Görseller bölüm sayfalarının üst görünümünü ve menü durumlarını kapsar; her sayfanın tüm kaydırma konumları veya bütün olası diyaloglar test edilmiş değildir.

Gerçek üretim arayüzü izole headless Edge'de çalıştırıldı. Native IPC, medya dosyaları ve dış servis yanıtları örnektir. Gerçek Windows Luna penceresinde otomasyon, gerçek video/DRM testi veya ücretli AI çağrısı yapılmadı. Font ve arama eklentisi listelerine eksik test yanıtları ilk turda düzeltildi; bunlar uygulama hatası olarak sayılmadı.

TypeScript/Vite üretim derlemesi, İngilizce çeviri kontrolü ve 10 debug regresyon kontrolü geçti. Önceki siyah ekran/invoke düzeltmeleri bu tam pakette korunur.

Yeniden görsel inceleme: app klasöründe üretim build ve preview sunucusu çalıştır; PLAYWRIGHT_MODULE ile kurulu Playwright modülünü, LUNA_TEST_URL ile sunucu adresini belirt. node scripts/ui-design-audit.cjs çıktı-klasörü. AUDIT_WIDTH=640 belirli bir genişliği seçer. Script yalnız izole örnek veri kullanır.
