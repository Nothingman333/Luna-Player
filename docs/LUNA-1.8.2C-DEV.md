# Luna 1.8.2C — geliştirici notları

Kullanıcı isteği: F3 ile korunan geliştirici menüsü; Alt+D ile kompakt not/ekran görüntüsü paneli; işaretleme ve AI tarafından okunabilir rapor. Raporlar şifrelenmez.

## Kullanım

- İlk F3 açılışında yerel şifreyi iki kez gir (en az 12 karakter). Ekran görüntüsünde paylaşılan şifre kaynak dosyaya, rapora veya devir notuna konmadı.
- Sonraki F3 girişinde bu şifre gerekir. Alt+D yalnız açık oturumda paneli gösterir/gizler. Oturum 30 dakika sonra veya Kilitle ile kapanır.
- Luna penceresi ya da tüm ekranları seç, Ekran görüntüsü al. Otomatik/periyodik çekim yok.
- Çiz/İşaretle ile görüntüye çiz; son çizimi geri alabilirsin. Paneli kapatıp açınca görüntü/işaretler bellekte korunur; kilitleme veya uygulama kapanışı görüntüyü bellekten bırakır. Not taslağı uygulama verisinde tutulur.
- Raporu dosyalara kaydet ile bir klasör seç. Benzersiz alt klasörde screenshot.png (görüntü varsa), report.md, report.json, events.log ve varsa native.log üretilir. Not PNG'nin altına da basılır; rapordaki metin ayrı okunabilir kalır. Eski dosyalar üzerine yazılmaz.
- Debug kayıtları mevcut hata ayıklama ekranını açar. Günlükler gözlemlenen olayları ve ölçümleri içerir; bütün kaynak kodun ya da tüm olası hataların kaydı değildir.

## Giriş koruması

Windows uygulama yerel veri dizininde developer-auth.json: rastgele 16 bayt tuz, PBKDF2-HMAC-SHA256 600.000 tur, 32 bayt doğrulayıcı. Düz şifre saklanmaz. PGP dosya şifrelemesi değildir; giriş doğrulaması için şifre özeti kullanılır. İlk kurulumu kullanıcı yapar. Var olan/hasarlı kimlik dosyası otomatik değiştirilmez.
Rust komutları ana WebView'i ve 32 rastgele baytlık, 30 dakikalık bellek oturumunu kontrol eder. Yanlış girişler bekletilir; beşinci başarısızlıktan itibaren 30 saniye. dev_ çağrıları telemetry dışında: şifre, token, not ve PNG argümanları loglanmaz. Kaynak dosyadan şifre okunamaz; aynı Windows hesabının dosyalarına/işlemine müdahale edebilen birine karşı mutlak güvenlik iddiası yoktur.

## Değişiklik kaynağı

CHANGELOG'da dış paket/rapor veya kullanıcının istemediği dış öneriden alınan her yeni maddeye [external] konur. Yenilik ekranı bu etiketi maddenin sonunda “Dış kaynaklardan gelen” olarak gösterir (İngilizce arayüzde çevrilir). Kullanıcı istekleri normal kalır; eski belirsiz kaynaklar tahminle etiketlenmez. CLAUDE.md gelecekteki güncellemeler için aynı kuralı taşır.

## Doğrulama ve sınırlar

- TypeScript/Vite build, ilgili ESLint, i18n ve sürüm kontrolü geçti.
- Windows cargo check --offline ayrı hedefte geçti; önceki 10 uyarı var, yeni modülde uyarı yok. Installer/release üretmedi.
- Gerçek Rust kaynak parçalarından küçük test: doğru/yanlış şifre doğrulama, boş/yanlış/geçerli/sona ermiş oturum kontrolü geçti. Bu test native komut/Windows entegrasyon testi değildir.
- Headless Edge/mock Tauri 1280/640: kilitli Alt+D, ilk şifre eşleşme kontrolü, yanlış ve doğru giriş, F3/Alt+D, panelin yakalamadan kalkması, çizimlerin geri gelmesi, PNG'ye not ekleme, rapor çağrısı, tam ekran seçimi, log gizliliği ve kaynak etiketi geçti. Sentetik ekran ve geçici tarayıcı verileri kullanıldı; gerçek kullanıcı ekranı çekilmedi veya parola kurulmadı.
- Gerçek Windows GDI yakalama, farklı DPI/monitör ve native tarayıcı/video görünümü Luna Dev.cmd ile kullanıcı tarafından denenmeli. Yakalama görünen ekran piksellerini kullanır; korunan video görüntüleri siyah kalabilir.

Push/release Claude'da. Dosya/önbellek temizliği yapılmadı.
