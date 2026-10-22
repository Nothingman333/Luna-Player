# Luna Web: eklenti ve indirme yönetimi — 22 Ekim 2026

Temel: GitHub main `5673016eb3e06a0634291ba8248f75d5b4c1a450` (1.6.3). Önceki browser, asistan, film, kitap, müzik ve Web defteri kodu bu kaynağa dahildir. Sürüm numarası otomatik artırılmadı.

## Eklentiler

Araçlar → Eklentileri yönet ekranı Luna'nın renk, kart, düğme ve modal sistemini kullanır. Chrome Web Store ayrıntı sayfasında ayrıca **Kurulumunu incele** bağlantısı görünür.

- Resmi mağaza bağlantısı veya 32 harfli kimlikle Google'ın HTTPS indirme hizmetinden CRX3 alma. Yönlendirmeler resmi indirme alan adlarıyla sınırlı; WebView2'nin gerçek sürümü hizmete gönderilir.
- ZIP, CRX3 ve yerel eklenti klasörü seçimi. Kaynak klasör değiştirilmez; Luna'nın uygulama veri klasörüne kopya alınır.
- Önce ad, sürüm, açıklama, zorunlu/isteğe bağlı izinler ve site erişimleri; ardından açık **İzinleri kabul et ve yükle** onayı.
- CRX3 RSA/ECDSA geliştirici imzası ve istenen mağaza kimliği doğrulanır. Doğrulanmış anahtar manifestin `key` alanına aktarılır; eklenti kimliği korunur. Bu imza kontrolü eklentinin güvenilir veya zararsız olduğunu garanti etmez.
- ZIP/klasör kaynakları imzasız yerel kaynak olarak belirtilir. CRX2 reddedilir.
- İndirme 32 MiB, tek açılmış dosya 16 MiB, toplam açılmış veri 128 MiB, 5.000 dosya sınırı; yol dışına çıkma, Windows aygıt/ad/ADS yolları, bağlantılı dosya ve klasörler, büyük/çakışan arşivler reddedilir.
- `__MSG_...__` ad ve açıklamaları eklentinin varsayılan dil sözlüğünden çözülür. Chrome paketinin `_metadata` içeriği unpacked yüklemeye aktarılmaz.
- Liste, etkinlik durumu, etkinleştirme/devre dışı bırakma ve onaylı kaldırma **WebView2 profil API'si** ile yapılır. Klasör var diye yüklendi denmez; gerçek callback sonucu beklenir.
- Zaman aşımı/başarısız kurulum sonucu görünür; geç kalmış native callback'in kaynağını silmemek için denenmiş paket dosyaları korunur. Kaldırma native profil kaydını kaldırır; yönetilen kaynak klasörü otomatik tekrar yüklenmez.
- Eski sürümde gerçekten yüklenmiş profil eklentileri korunur. Sadece klasöre kopyalanmış ama yüklenmemiş olanlar için **Klasörden ekle** kullanılabilir.

WebView2, Chrome Web Store'un Chrome'a ekle düğmesini doğrudan sağlamaz. Luna kendi indirme/izin/kurulum akışını kullanır. Chrome'a özgü API'ler ve araç çubuğu popup'ları tam uyumlu olmayabilir; bu tur bu popup'lar için yeni bir toolbar host'u eklemez. Otomatik eklenti güncellemesi yoktur; yeni paket aynı kimlikle manuel kurulabilir. Resmi referans: https://learn.microsoft.com/en-us/dotnet/api/microsoft.web.webview2.core.corewebview2profile.addbrowserextensionasync

## İndirmeler

Araçlar → İndirmeler, bu oturumun native kayıtlarını gösterir.

- URL yerine her indirme için ayrı sayısal kimlik ve gerçek `ICoreWebView2DownloadOperation` tutulur. Eşzamanlı aynı URL'ler karışmaz; başarısızlık/iptal de doğru operasyona bağlanır.
- Gerçek alınan/toplam bayt, biliniyorsa ilerleme çubuğu, durum ve dosya adı. Sahte yüzde üretilmez; olaylar en fazla yaklaşık 250 ms'de bir arayüze bildirilir.
- Native duraklat, destekleniyorsa devam et ve iptal. Sunucu/WebView2 devam etmeyi desteklemiyorsa devam düğmesi sunulmaz.
- Downloads klasörüne benzersiz dosya adı; mevcut dosyanın veya başka indirme hedefinin üzerine yazılmaz. Geçersiz/aygıt dosya adları ve yön yanıltıcı kontrol karakterleri temizlenir.
- Arama, durum filtresi, dosyayı aç, klasörde göster, tek kaydı kaldır ve bitenleri temizle. Liste temizleme diskteki dosyaları silmez; devam edebilen işler saklanır.
- Yalnız native kayıtta tamamlanmış dosyalar açılır. Program/komut dosyası ve bilinmeyen türlerde Aç, dosyayı Explorer'da gösterir.
- Etkin veya devam edebilen indirmesi olan sekme yanlışlıkla kapatılamaz; önce İndirmeler'den iptal edilmesi veya tamamlanması gerekir. Uygulama kapatıldıktan sonra indirme devamı ve kalıcı indirme geçmişi bu turda yoktur.
- En fazla 32 etkin/devam edebilen indirme ve 200 oturum kaydı. Tamamlanan native olay abonelikleri temizlenir. Browser bileşeni kapanırken veya uygulama yeniden yüklenirken native işler ve abonelikler ayrıca kapatılır; sahipsiz sekme bırakılmaz.

## Ek düzeltmeler

YouTube altyazısı beklenirken bütün sekme komutlarını bloke eden ortak kuyruk kullanılmıyor. Altyazı geldikten sonra sekme/sayfa nesli yeniden kontrol ediliyor; eski videonun içeriği yeni sayfaya taşınamıyor. Altyazı önbelleği 20 kayıtla sınırlı; başarısız boş sonuç kalıcı olarak önbelleğe alınmıyor. Browser olay günlüğüne tam sayfa adresi/değeri gönderilmiyor.

## Yapılan kontroller

- TypeScript ve frontend üretim derlemesi; i18n kontrolü.
- Windows GNU araç zinciriyle native derleme; üretim MSVC/proje kimliği değiştirilmeden yalnız yerel kaynak bundle ayarı ortamda boşaltıldı.
- Üretim parser/imza koduyla 10 hedefli native test: doğru/bozuk imza, kimlik uyuşmazlığı, başlık, mağaza adresi, yol dışına çıkma, çakışan dosya, büyük açılmış veri, yerelleştirme ve ZIP kaynakları.
- Resmi Google indirme hizmetinden alınmış uBlock Origin Lite CRX3 dosyası, kurmadan/çalıştırmadan üretim imza, kimlik, açma ve manifest önizleme kodundan geçirildi.
- Gerçek React yönetim bileşeniyle 11 izole headless Edge kontrolü: izin önizlemesi, reddedilen/başarılı native sonuç, aç/kapat/kaldır, yerel paket seçme, ayrı indirme kimlikleri, duraklat/devam/iptal, filtre/klasör açma ve 480px yerleşim. Bu kontroller native köprüyü taklit eder.

**Gerçek Luna Windows penceresi sürülmedi. Canlı WebView2 eklenti çalıştırma, sitelerden indirme, native duraklat/devam/iptal ve üçüncü taraf eklenti uyumluluğu kullanıcı tarafından ayrıca denenmelidir.** Kontrol sayısı düzeltilmiş bug sayısı değildir.
