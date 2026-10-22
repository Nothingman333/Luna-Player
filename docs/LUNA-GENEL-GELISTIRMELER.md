# Luna — genel geliştirmeler ve browser paketi

Temel: `31bf2360ca178e16235c7c903500559fa909f931` / 1.6.0CC. Bu değişiklikler önceki Web/asistan geliştirmelerinin üzerine eklendi. Commit veya GitHub push yapılmadı; mevcut kullanıcı verisi ve API profili pakete alınmadı.

## Eklenen 14 başlık

| Özellik | Nerede ve nasıl kullanılır? |
|---|---|
| Toplu yeniden bağlama | Ayarlar → Yedekleme veya kayıp film detayındaki açılır kart. Eski kökü yaz, yeni klasörü seç, önizle, mevcut hedefleri seç. Önce JSON yedeği kaydedilir. Hedefin kendi ayarları varsa işlem durur. Film/müzik/kitap yolları, kitap konumları, koleksiyon referansları, ses/altyazı ayarları ve notlar birlikte eşleştirilir. Geri al, sonraki kullanıcı değişikliklerini ezmeyi reddeder. Açık oynatıcı/okuyucu kapatılmalıdır. |
| Çeviri iptali | Browser çeviri durumunda İptal. Yeni bölüm isteği ve eski yanıtın uygulanması durdurulur. Gönderilmiş sağlayıcı isteği fiziksel olarak iptal edilmiş veya ücretinden vazgeçilmiş sayılmaz. |
| Başarısız çeviriye devam | Başarısız bölümden devam et. Aynı sekme/sayfa ve dil için tamamlanan bölüm yanıtları bellekte korunur; tekrar istenmez. Tüm yanıt doğrulanınca uygulanır. Sayfa değişirse eski çalışma atılır. Uygulama yeniden başlatılınca devam verisi korunmaz. |
| Koleksiyon kurtarma | Koleksiyonlar ekranında hasar varsa belirgin uyarı ve kurtarma kartı. Ham kaydı dışa aktar, okunabilen kayıtları kurtar veya geçerli yedekten yalnız koleksiyonları geri getir. Önce ham yedek, sonra kullanıcı onayı; özgün kayıt kendiliğinden silinmez. |
| Site simgeleri | Browser sekmelerinde sitenin `/favicon.ico` simgesi, yükleme başarısızsa mevcut dünya simgesi. Harici favicon hizmeti kullanılmaz. Her sitenin özel icon manifesti desteklenmiş sayılmaz. |
| Sahne notları | Oynatıcıdaki işaret simgesi veya film detayındaki Film defterim. Yakalanan zamana kısa not ekle, zaman düğmesiyle kaynağa dön, sil veya JSON dışa aktar. Açık kutudayken film değişse de not başlangıçta yakalanan filme aittir. |
| Ortak alıntı defteri | Kitap ana sayfası/kitaplığı ve okuyucu araçları. Mevcut EPUB vurgularını bütün kitaplardan topla; metin/yazar/kitap ara, etiketle, etiketle filtrele, Markdown dışa aktar. Kaynağa dön, ilgili baskının CFI konumunu açar. Dosya/baskı uyumsuzluğu hâlâ hata verebilir; vurgular uydurulmaz. |
| Altyazı kelime defteri | Sahne ve kelime defterindeki Kelime defteri sekmesi. Açılıştaki metin altyazı yakalanır; metin kutusunda kelime seç veya elle yaz, kendi anlam/notunu ekle. Kaynak film ve zaman saklanır. Tüm dosyalardaki kayıtları göster ve CSV dışa aktar. Görüntü altyazısı/video sesi OCR veya transkript gibi okunmaz; AI çağrısı yapılmaz. |
| Letterboxd değişiklik özeti | Öneriler ekranında açılır özet. Bağlı listeler ve kendi izlenen profil kaydı tekrar okunduğunda yeni eserler ve önceki kaynak okumasında bulunup bu kez görünmeyenler gösterilir. Yerel kütüphane eşleşmesi belirtilir. Görünmeyenler Luna'dan silinmez; sayfa sınırı/erişim farkı gerçek silinme sayılmaz. 30 özet tutulur, büyük farklarda ayrıntı sayısı sınırlıdır. |
| Web okuma kuyruğu | Browser Araçlar → Okuma listem. Sayfa ve konumunu kaydet; okundu durumunu değiştir, kaldır veya kayıtlı konuma dön. Kayıtlı sayfaların konumu açık sekmede yaklaşık 5 saniyede bir güncellenir. Dinamik sayfa/yeniden yönlendirme/özel iç kaydırma alanlarında birebir konum garantisi yoktur. |
| Sayfaya bağlı not | Browser Araçlar → Bu sayfanın notu. Elle kaydet; sayfa yeniden açıldığında aynı URL'ye bağlı notu gör. Sorgu ve fragment korunur; farklı makaleler aynı pathname diye birleştirilmez. Notlar ve okuma kuyruğu JSON dışa aktarılır. |
| Oynatma tercihleri | Film detayında Bu dosyanın hatırlanan tercihleri. Mevcut ses/altyazı ve görüntü ayarlarını gör, ayrı ayrı sıfırla. Sıfırlama sonraki açılışı etkiler; konum ve notlar silinmez. |
| Seri takibi | Film detayında bu filmin TMDB serisini takip et; Koleksiyonlar kartından takip edilenleri kontrol et. Yayınlanan yeni filmler işaretlenir, gelecektekiler Yakında görünür. Eseri seçerek koleksiyona ekle. Kontrol kullanıcı isteğiyle yapılır; periyodik arka plan servisi yoktur. TMDB anahtarı gerekir; AI gerekmez. |
| Erişilebilirlik | Ayarlar → Genel. İri arayüz yazıları, belirgin klavye odağı, yüksek metin kontrastı ve azaltılmış hareket. Değişiklik anında yerel kaydedilir. Ziyaret edilen sitelerin görünümü değiştirilmez. |
| Görsel önbelleği | Ayarlar → Genel. Yerel üretilen kitap/müzik kapakları ve video küçük resimlerinin boyutu/adedi; yenile, temizle veya 128/256/512/1024 MB sınır. Müzik/kitap taraması ve video küçük resim üretiminden sonra sınır uygulanır. Eski dosyalar önce temizlenir. Asıl medya, altyazı, notlar, WebView oturumu ve browser HTTP önbelleği bu işleme dahil değildir. |

Tabloda iptal ve yeniden deneme ayrı satırlarda anlatıldığı için 15 satır vardır; kullanıcının 14 özellik başlığından biri bu iki davranışı birlikte içerir.

## Görünüm ve veri davranışı

- Yeni araçlar mevcut koyu/turuncu renk değişkenlerini, yuvarlatılmış kartları ve küçük düğmeleri kullanır. Genel ekranlarda ayrıntılar kapalı açılır kartlarda tutulur.
- Film defteri ve ortak alıntı kutusu normal modal olarak açılır. Oynatıcının kaybolan alt araç çubuğuna bağlı kalmaz. Klavye odağı kutuda tutulur, kapandığında önceki denetime döner.
- Browser tam genişlikte kalır. Sağ alt asistan baloncuğu, sayfanın üzerinde küçük sohbet ve isteğe bağlı büyütme korunur. Araç menüsü açıkken native sayfanın gizlenmesi önceki pencere katmanı davranışıdır.
- Yeni defterler, etiketler, okuma kuyruğu ve seri takipleri yerel kayıttır; mevcut yedekleme bunları da içerir. API anahtarları dışa aktarılmaz.
- Toplu bağlama dosya taşımak veya diskte yeniden adlandırmak değildir. Yeni tarama kökleri eklenir; eski kökler tutulur. Çalışan oynatıcıların eski konumu tekrar yazmaması için önce kapatılması istenir.
- Önbellek temizliği yalnız belirli app-cache alt klasörlerindeki normal görsel dosyalarını tek tek siler; recursive silme, kullanıcıdan serbest yol alma veya reparse-point takip etme yoktur. Kullanımda kalan dosyalar sonuçta belirtilir. Açık kapaklar bir sonraki yenilemeye kadar boş kalabilir.

## Yapılan kısa doğrulamalar

- TypeScript + Vite üretim derlemesi.
- Windows GNU Rust uygulama derlemesi; üretim MSVC yapılandırması değiştirilmedi. Yerel test için kaynak paketi mpv kaynaklarını içermediğinden bundle.resources ortam üzerinden boşaltıldı; yerel EXE yanında mevcut mpv ve font kaynakları bulunur.
- 12 yeni davranış kontrolü: kök sınırı/Unicode, yol doğrulama, kitap konumu ve notların taşınması, alıntı etiketlerinin kimliği, hedef çakışması, geri alma, sonradan değişen verinin korunması, kota hatasında geri dönüş, Letterboxd farklı yıl ayrımı, URL kimliği, bozuk defter verisi.
- İlgili mevcut testler: regression 37, next 32, browser 12, translation 8. Bunlar toplu dayanıklılık veya binlerce senaryo iddiası değildir.
- İzole headless kaynak önizlemesinde okuma konumu, web notu, sahne notu ve kelime kaydı; 1440/680 genişliklerinde modal yatay taşma kontrolü. Gerçek Luna Windows penceresi otomasyonu yapılmadı.
- TMDB/Letterboxd canlı hizmeti, gerçek mpv sahneye atlama, Microsoft ses motoru, DRM ve gerçek masaüstü katmanları bu turda uçtan uca sınanmadı. Bunlar kullanıcının yerel denemesine bırakılmıştır.

Çalıştırma: app içinde npm run build, npm run test:extras; Windows derleme ortamı için BUILDING.md / kur.bat. Bu son genel geliştirme turu yeni bağımlılık eklemez; önceki native browser bağımlılıkları korunur.
