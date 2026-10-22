# Luna — 30 hata düzeltmesi ve kullanım geliştirmeleri

Taban: Son teslim edilen `Luna-Player-Tam-Paket-Asistan-Islemleri.zip` (SHA-256 `b0898728e991e6b9f3294e17f168fd5e78bdbf7330fd4f1acabd3b89895441cc`). Önceki çalışmalar korunarak ayrı kopyada ilerlenmiştir. Bu paket tam kaynaktır; commit, push ve release yapılmadı.

Bu 30 bulgunun hepsi kritik değildir. Veri kaybı, yanlış kayıt/sekme üzerinde işlem ve günlük mahremiyeti sorunlarının yanında arama, gösterim ve bozuk dış veriyle karşılaşılan kenar durumları da vardır. Test sayısı hata sayısı olarak sunulmamıştır.

## Düzeltilen 30 hata

| # | Tetikleyici ve önceki sonuç | Düzeltme ve kaynak |
|---|---|---|
| 01 | Aynı dizi bölümünün bir kopyası bitmişken ikinci kopyası bitmemişse dizi tamamlanmış görünmüyordu. | İzlenme durumu kopya yerine tekil sezon/bölüm bazında hesaplanır. `filmCatalogModel.ts` |
| 02 | Bitirilmiş bölümün yarım kalmış ikinci kopyası “devam et” hedefi seçilebiliyordu. | Herhangi bir kopyası bitmiş bölüm devam adaylarından çıkarılır. `filmCatalogModel.ts` |
| 03 | `Film #2.mkv` gibi yerel dosyalarda `#` sonrası URL parçası sanılıp arama indeksinden kesiliyordu. | Sorgu/fragment temizliği yalnız HTTP(S) adreslerine uygulanır. `libraryTools.ts` |
| 04 | Geçersiz fakat boş olmayan metadata yılı, dosyadan bilinen doğru yılı bastırıyordu. | Önce geçerli metadata yılı, yoksa geçerli dosya yılı kullanılır. `libraryTools.ts` |
| 05 | Süresi henüz bilinmeyen yarım kayıtta kalan süre `NaN` olabiliyordu. | Bilinmeyen sürede kalan zaman güvenli biçimde 0 olur; devam yolu korunur. `filmCatalogModel.ts` |
| 06 | Asistan kaynaklarını ayıklarken `/A?q=X` ile `/a?q=x` aynı sayfa sayılıp kaynaklardan biri siliniyordu. | URL yolu ve sorgunun büyük/küçük harfi korunur. Host normalizasyonunu URL sınıfı yapar. `assistantPresentation.ts` |
| 07 | Çok parçalı mesajlarda her parça tek başına sınırın altında olsa bile toplam mesaj sınırı aşılabiliyordu. | Mesajın bütün metin parçaları ortak karakter bütçesini paylaşır. En yeni soru ve kayıtlı sohbet değişmez. `assistantHistory.ts` |
| 08 | Aynı kimlikli iki okunabilir sohbetten ikincisi geçmiş kurtarmada atılıyordu. | İkinci sohbet benzersiz kurtarma kimliğiyle korunur; gerçekten okunamayan kayıtlar ayrıca sayılır. `assistantHistory.ts` |
| 09 | Kitap arama cevabındaki tek `null` satır, Open Library veya Google Books sonuçlarını tümden düşürebiliyordu. | Boş satırlar elenir, geçerli adaylar korunur. `bookDataModel.ts` |
| 10 | Sağlama toplamı tutan herhangi bir EAN-13, kitap ISBN'si kabul ediliyordu. | ISBN-13 için kitaplara ait 978/979 öneki gerekir. ISBN-10 desteği korunur. `bookDataModel.ts` |
| 11 | Aynı kitap bir raf atama çağrısında birden fazla kez verilirse birbiriyle çelişen işlemler önizlemeye girebiliyordu. | Tek kitap/tek çağrı kontrolü eklenir; bütün raflar aynı atamada belirtilir. `bookDataModel.ts` |
| 12 | Kitapların raf atamalarında bulunan fakat ad listesinde bulunmayan gerçek raf, asistan tarafından yok sayılıyordu. | Raf inceleme ve düzenleme, uygulamanın birleşik `shelfNames()` kaynağını kullanır. `assistantWorkspaceActions.ts` |
| 13 | Model bir kaydın key'iyle başka dosyanın path'ini gönderirse path öncelik kazanıp yanlış kayıt seçilebiliyordu. | İkisi birlikte verilmişse key ve path aynı kaydı doğrulamalıdır. `assistantWorkspaceModel.ts` |
| 14 | Birden çok farklı bölüme sahip dizi kaydına tek `episode` verilirse bütün dosyalar aynı bölüm olabiliyordu. | Farklı bölümler için dosya bazında atama istenir; tek bölümün gerçek kopyaları ve sezon 0 korunur. `assistantWorkspaceModel.ts` |
| 15 | Model kapatma/ses gibi bir işlemde başka `tabId` gönderdiğinde kimlik dikkate alınmayıp açık sekme etkilenebiliyordu. | Etkin sekme dışındaki hedef reddedilir; önce o sekmeye geçilip yeniden onaylanması istenir. Kontrol hem önizlemede hem köprüde yapılır. `assistantWorkspaceActions.ts`, `browserAssistantActions.ts` |
| 16 | “Bu sayfaya not bırak”, “Bu sayfayı okuma kuyruğuna al” gibi doğal komutlar Web işlemi olarak algılanmıyordu. | Türkçe eylem kalıpları tamamlanır. Sayfa özeti hâlâ araçsızdır ve Web değişiklikleri onay ister. `browserAssistantActions.ts` |
| 17 | Favori içe aktarma, mevcut bozuk kaydı sessizce ayıklayıp geri kalanını yazabiliyordu. | Mevcut favoriler de tümden doğrulanır; bozuk veya yinelenmiş veri üstüne yazılmadan yedekleme hatası gösterilir. `browserWorkspaceModel.ts` |
| 18 | Aynı URL'ye açık iki ayrı sekmeden yalnız biri son oturumda saklanıyordu. | Son oturum sekme örneklerini korur; favori ayıklama mantığından ayrılır. Sınır yine 8 sekmedir. `browserHistoryModel.ts` |
| 19 | Adres önerileri, geçmiş arama önerileri eklendiğinde tanımlanan görsel satır sınırını bir aşabiliyordu. | Bütün öneri türleri ortak nihai sınırla kesilir. `browserHistoryModel.ts` |
| 20 | Okuma görünümünde “Part” başlığı, sayfa adı “Part Two” olduğu için gereksiz sanılıp kaldırılıyordu. | Yalnız tam olarak aynı başlık kaldırılır; gerçek alt başlık korunur. `browserReaderModel.ts` |
| 21 | Boş tablo hücreleri kaldırılıp sonraki değerler yanlış sütuna kayıyordu. | Boş hücreler konumlarıyla korunur. `browserReaderModel.ts` |
| 22 | `{"Authorization":"Bearer ..."}` biçimindeki JSON günlükleri kimlik bilgisini gizlemiyordu. | Tırnaklı JSON alanı ve Bearer değeri birlikte maskelenir. `everydayModel.ts` |
| 23 | Boşluk içeren UNC yollarında ilk boşluktan sonraki özel klasör/dosya adı günlükte kalıyordu. | Yol maskesi boşlukları da kapsar; tanılama çıktısı özel dosya kuyruğunu göstermez. `everydayModel.ts` |
| 24 | Kiril gibi Latin dışı film adları eşleştirmede boş metne dönüştüğü için Letterboxd/IMDb sayfasıyla kütüphane bağlantısı kurulamıyordu. | Unicode harf/rakamlar korunur. Başlık eşleşmesi hâlâ adaydır, kesin kimlik değildir. `everydayModel.ts` |
| 25 | TMDB'nin `/discuss/movie/12` gibi başka bir yolundaki sayı kesin film kimliği sanılabiliyordu. | Kesin eşleşme yalnız kökten başlayan `/movie/id` veya `/tv/id` yolunda yapılır. `everydayModel.ts` |
| 26 | Google Books cevap tarihi yanlışlıkla sayı gelirse `.slice()` çağrısı bütün aday dönüşümünü çökertiyordu. | Tarih metin değilse yıl alanı boş bırakılır; kullanılabilir kitap adayı korunur. `bookDataModel.ts` |
| 27 | Karışık çalmada aynı kaynak iki defa listelenmişse çalan ikinci örnek yerine ilk satır işaretleniyordu. | Bilinen gerçek nesne örneği, kaynak adresiyle eşleştirmeden önce aranır. `musicModel.ts` |
| 28 | Web okuma ilerlemesi kaydedildiğinde açık kuyruk bileşenleri değişiklikten haberdar olmuyordu. | Başarılı konum kaydı mevcut `luna-extras` yenileme olayını gönderir. `BrowserExtras.tsx` |
| 29 | Native bağlantı başarılı fakat HTTP 404/500 ise sayfa yükleme hatası bastırılabiliyordu. | HTTP hata durumu da görünür başarısızlık sayılır; geçmişe başarı olarak işaretlenmez. `browserNativeModel.ts`, `Browser.tsx` |
| 30 | Film bilgileri düzenlenirken arka plan metadata güncellemesi yazılan taslağı sıfırlıyor; eski editör yeni bilgiyi ezebiliyordu. | Açık editör taslağı korunur, kayıt bazında değişiklik kontrolü uygulanır. Başka filme gelen güncelleme kaydı engellemez. `EverydayTools.tsx`, `everydayModel.ts` |

Dosyalar `app/src/` altındadır. Yeni kontroller `app/scripts/quality-30-regression.cjs` ve `quality-ui.cjs` içindedir. Eski iki test beklentisi bilinçli değişen davranışa uyarlandı: aynı kimlikli sohbet artık kaybolmaz; farklı bölümlere tek numara topluca atanmaz. Mevcut kontroller kaldırılmadı.

## Ek kullanım iyileştirmeleri

- Asistan, uzun müzik listesi ve koleksiyonlarda `id`, `offset`, `limit` ile sonraki öğeleri okuyabilir. Öğelerin düzenlemede kullanılan mutlak sırası ve `hasMore` verilir. Böylece ilk 200 öğenin dışında kalan parçalara da bilinçli işlem yapabilir.
- Bölüm 0, onay kartında da numarasıyla gösterilir.
- Film editöründe çakışma mesajı taslağı koruyarak ne yapılacağını açıklar; var olan Luna modalı/renkleri kullanılır.
- Okuma tablosu sütunları, adres önerisi yüksekliği ve çalan parça vurgusu daha tutarlı hale gelir. Ayrı bir tema veya kalıcı yan panel eklenmez.

## Doğrulama ve sınırlar

- 01–29 için aynı regresyonlar önce eski davranış üzerinde çalıştırıldı: 29/29 düzeltme beklentisi başarısızdı. Yeni kaynakta bu 29 kontrol ve metadata çakışması modeliyle 30/30 başarılı.
- 30 için önceki paketin gerçek React editöründe headless Edge karşılaştırması yapıldı: taslak silinmesi yeniden üretildi (çıkış 1); yeni editör aynı durumda taslağı ve yeni kaydı korudu (çıkış 0).
- Üretim derlemesi (`npm run build`) başarılı. İngilizce metin kontrolü başarılı. Derlemede mevcut büyük paket/dinamik import uyarıları vardır.
- İlgili mevcut kontroller: asistan güvenliği 27/27; asistan işlemleri 14/14; film/tarayıcı 20/20; okuma modeli 8/8; adres önerileri 21/21; kitap/profiller 20/20; müzik çalışma alanı 11/11; günlük araçlar 11/11.
- Headless Web arayüzü: başlangıç, adres önerileri, geçmiş ve okuma görünümü 4/4. Asistan gerçek React/native taklit arayüzü 6/6.
- UI kontrolleri izole Edge, sentetik depolama ve taklit native/AI seviyesindedir. Canlı sağlayıcı, gerçek Windows Luna penceresi veya gerçek site oynatma/DRM doğrulaması yapılmadı. Rust kaynakları bu turda değişmedi.

Ham önce/sonra çıktıları ve yama/ZIP bütünlük kayıtları paket içindedir. Önceki tüm kaynak, eklenti/indirme çalışmaları ve 9 Claude skill korunur. Önceki Asistan İşlemleri paketinin üstüne yalnız ek yama uygulanır; tam kaynağı alan kişi aynı yamayı tekrar uygulamaz.
