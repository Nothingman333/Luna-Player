# Luna 1.7.7C — 24 Ekim 2026 açılır pencere düzeni

Kullanıcı altı görselle kitap filtreleri, kitap/müzik profil kayıtları, defter/yorum pencereleri, sağlayıcı takılması ve TMDB konumu için değişiklik istedi. Analizden önce mi sonra mı tercih sorulacağı netleştirildi; kullanıcı “Önce tercih penceresi, sonra analize başla” seçti.

## Son davranış

- Kitaplık filtresi her açılışta Tümü ile başlar. Seçili filtreye tekrar basmak Tümü’ne döner. Saklı kitap/raf/okuma durumu değiştirilmez. Boş beğeni listesi metinleri emoji yerine gerçek Beğen/Beğenme düğmelerini tarif eder.
- Film ayrıntısına Film defterim düğmesi geri eklendi. Defter altta bir bölüm değildir; geniş ExtraModal penceresinde düşünceler/sahne-kelime kayıtları/yorum taslağı açılır. Dışa aktarma ve geçmiş kontrolleri de pencereye alındı. Mevcut depolama/kurtarma davranışı korunur.
- Kitap ayrıntısında Kitap defterim düğmesi, okuduktan sonraki sebepler, beğeni ve kişisel notu geniş pencerede toplar. Mevcut alıntı defterine oradan ulaşılır. Kapak/raf düğmeleri yanında Asistana sor, aynı mevcut kitap sorularını açar. Sayfa altında ayrı not/zevk/soru bölümü kalmaz. Müzik çubuğuna karşı kitap sayfasına alt boşluk eklenir; gerçek Windows katmanları kullanıcı tarafından doğrulanmalıdır.
- Yorumları internetsiz tara menüsü geniş pencerede mevcut yerel tarama işlevini açar; sayfayı aşağı kaydırmaz. Özellik kaldırılmadı.
- Film ve kitap analiz düğmesi önce zevk tercihlerini açar. İlk açılışta analiz okuma isteği başlamaz; kullanıcı Analize başla dediğinde mevcut analiz başlar. Tercih içeriği kaydırılabilir, işlem düğmesi görünür kalır. Kitap tercih değişiklikleri üst bileşeni günceller; filmde mevcut öğrenilmiş çekince birleşimi bozulmaz.
- Müzik/kitap profilindeki sayı kartları ilgili kayıt listesini açar; kayıt seçimi mevcut eser açma/çalma callback’ini kullanır. Müzikte dinleme kayıtları, sanatçı alt seçimi ve son 30 gün ayrımı korunur. Hiç kayıt yoksa açık boş durum çıkar.
- Sağlayıcılar yükseklik değiştirip fare hedefini oynatmaz. Sabit yükseklikte yatay sıra, transform/opacity animasyonu ve taşan içeriği gezdiren oklar kullanılır. Oklar yalnız ilgili yönde kaydırma varsa etkindir; geniş ekranda tüm seçenekler sığıyorsa kaydırma gerekmez. Klavye/odak/ESC/dışarı tıklama ve azaltılmış hareket davranışı korunur.
- Afiş TMDB etiketi tekrar sol altta; teknik rozetler üstte kalır.

## Doğrulama ve devir

TypeScript/Vite, ESLint, i18n ve sürüm kontrolü uygulanır. İlgili books-profiles (20), book-library-view (12), creative-plus (12) regresyonları geçti. Headless Edge + sahte Tauri/sentetik kitap-müzik verisi 1280/640: film popup notu, analiz öncesi tercihler/önem değişimi ve başlatma sırası, internetsiz tarama popup, kitapta varsayılan Tümü/tekrar tıklama, kitap notu/Asistana sor popup, müzik/kitap profil kayıtlarının tıklanması, sağlayıcı fare hedefi ve yatay gezinme, TMDB sol alt yerleşimi kontrol edildi. Başlangıçtaki test fixture’ına eksik olay dinleyici kapatma metodu ve sahte anahtar eklenmesi gerekti; bunlar ürün hatası sayılmaz. Gerçek Luna/WebView2/mpv/servis testi yapılmış sayılmaz.

Kanıt/yedek: ~/Documents/Luna-1.7.7C-Pencereler. Son sonuçlar ui-result.json ve log/PNG dosyalarında; promotion-manifest/receipt ve main-before-promotion aktarımı/yedeği gösterir. QA dosyaları ana kaynağa dahil edilmez. Sonraki sürüm 1.7.8 + ajan eki; push Claude’da. Commit/push/release/installer/USB yok. Otomatik alan açma/silme/önbellek temizliği yapılmadı; her zaman kullanıcıya sor. Kullanıcı verisi/medya, plugins ve anahtarlar korunur.
