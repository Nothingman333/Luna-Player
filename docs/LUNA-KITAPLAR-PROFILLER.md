# Kitap kapakları, konu rafları ve sağlayıcı profilleri

## Kitaplık
- Kitaplar ekranındaki **Kapak ve bilgileri bul** düğmesi veya kitap sağ tık menüsü tekli/toplu düzenleyiciyi açar. Bir aramada en fazla 20 kitap seçilebilir; durdurulabilir.
- EPUB içindeki geçerli ISBN-10/ISBN-13 alınır. Eski indeks sonraki taramada bir kez yenilenir. PDF/CBZ için dosya içeriğinden ISBN çıkarımı yoktur; ISBN elle yazılabilir. ISBN yoksa dosya uzantısı/OCR gibi artıklar temizlenerek ad ve yazar aranır.
- Open Library, sonuç çıkmazsa Google Books kullanılır. Servislerin kotaları/erişilebilirliği nedeniyle her kitabın bulunacağı garanti değildir. Arama yalnız ad/yazar/ISBN gönderir, kitabın kendisini yüklemez.
- Adaylar kapak, yazar, yıl ve kaynakla gösterilir. Kullanıcı aday seçip **Hazırlanan seçili bilgileri kaydet** demeden hiçbir internet sonucu uygulanmaz. Başka kitabın aramasını incelemek veya seçmek, henüz düzenlenmemiş kitapların metadatasını yazmaz.
- Kapak, ad, yazar, ISBN, açıklama ve konular elle düzenlenebilir. Bilgisayardan kapak seçilebilir. Seçilen kapak kitap kartı ve ayrıntıda kullanılır.
- Düzeltmeler `bookDetailsByPath` içinde tutulur. Asıl kitap dosyası yeniden yazılmaz. Önceki başlık/yazar kimliği korunur; eski günlük, not ve alıntı anahtarları kaybolmaz. Okuma konumları dosya yolunda kalır.

## Raflar ve asistan
- Kitaplıkta **Rafları düzenle** ile Psikoloji/Felsefe gibi raflar oluşturulur; seçilen kitaplar birden fazla rafa eklenebilir veya tek bir raftan çıkarılabilir. Konu rafı filtresi kitaplığı daraltır.
- **Okunacaklar**, konu raflarından ve okumaya başlama/bitirme durumundan ayrıdır.
- Örnek: “Yalnız kitaplığımdaki kitapları incele. Psikoloji ve Felsefe raflarına uygun olanları öner; emin olmadıklarını sor. Onaylayınca ekle.”
- Asistan gerçek kitap adlarını/yazarlarını kullanır; belirsiz veya mevcut olmayan eşleşme bütün işlemi durdurur. Raf değişiklikleri mevcut onay ve geri alma akışından geçer. Dosya taşımaz.
- Hasarlı raf kayıtları görüntülemeyi devirmeden süzülür; kayıt sırasında bozuk veri üzerine sessizce yazılmaz. Standart Luna yedeği bu yerel bilgileri içerir; toplu yeniden bağlama yol referanslarını da taşır.

## Sağlayıcı profilleri
- Ayarlar › Hesaplar bölümünde sağlayıcı, Base URL, API anahtarı ve modeli gir; profil adı verip **Kaydet ve kullan** ile sakla. En fazla 8 adlandırılmış profil düzenlenip silinebilir.
- Asistanın başlığındaki açılır seçimle kayıtlı profiller arasında geçiş yapılır; sonraki mesaj yeni profili kullanır, yeniden başlatma gerekmez. Yanıt sürerken hızlı seçim kapalıdır.
- API anahtarları mevcut Windows kimlik bilgisi kasasında tutulur; profil JSON'una ve kaynak paketine eklenmez. Kasa yazımı başarısızsa kayıt geri alınır.
- Özel sağlayıcılar OpenAI uyumlu `/chat/completions` ve `/models` uç noktalarını desteklemelidir. Alan adına `/v1` eklenir; tam chat uç noktası yapıştırılırsa yinelenmez. Gömülü kimlik bilgisi ve sorgu/hash içeren URL kabul edilmez. Model elle de girilebilir.

## Kontroller
14 kitap/profil davranış kontrolü, önceki 101 regresyon kontrolü, TypeScript/Vite ve Windows GNU native derlemesi geçti. Ayrı headless önizlemede taklit aramayla aday seçimi/kayıt, ikinci raf ekleme, okunacaklar ve dar ekran yerleşimi kontrol edildi. Bu kontroller gerçek Windows uygulaması veya canlı sağlayıcı/kitap servisi testi değildir. Pencereyi kullanıcı kendisi deneyebilir.
