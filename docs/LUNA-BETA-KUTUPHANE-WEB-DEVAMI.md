# Luna beta — film rafları, yan yana karşılaştırma ve web notları

23 Ekim 2026. **Luna-1.6.7-Beta-Gelistirilmis-Tam-Paket.zip** tam kaynağının devamı. Önceki tarayıcı, asistan, Zevk Laboratuvarı, not kurtarma ve bütün birleşik düzeltmeler içeridedir. Taban v1.6.7 / `3c4ae8f55ae792e9abe43fb9c3cf67c506b61bd6`; bu tur yeni bir uzak GitHub sürümü alınmadı. Sürüm, updater kimliği ve bağımlılıklar korunur. Commit/push yapılmadı.

## Filtre raflarım

Filmler ve Diziler sayfalarında mevcut filtrelerin altında açılır bir raf alanı var:

- **Kısa ve başlanmamış**, **TMDB 8+** ve **Yarım kalanlar** hazır seçimleri.
- Tür, dönem, puan, süre, izleme durumu, sıralama ve görünüm yoğunluğunu adlandırarak saklama. En fazla 12 raf. Film ve dizi rafları ayrı tutulur.
- Kayıtlı rafı tek tıkla uygulama; onayla mevcut filtrelerle güncelleme ve silme. Film dosyası/kütüphane kaydı silinmez.
- Etkin raf, filtreler birebir aynıysa vurgulanır. Üst arama kutusu raflara dahil edilmez; arama ve filtreler ayrı çalışır. Bu ayrım panelde açıklanır.
- Aynı isimli raf, bozuk saklama verisi, kapasite ve yazma hatası korunur. Yazma başarısızsa eski raflar ve girilen ad durur. Ayrı pencerede değiştirilmiş raf kaydının üstüne yazılmaz.
- Kayıtlı tür veya dönem artık kütüphanede bulunmuyorsa filtreyi sessizce yok saymak yerine açıklama gösterilir; rafın özgün kaydı durur.

`LibrarySavedViews.tsx`, `libraryWorkbenchModel.ts`, `LibraryWorkbench.css`, `FilmCatalog.tsx`.

## İki–üç filmi yan yana karşılaştırma

**Karşılaştırmak için seç** düğmesiyle afişlerin altında seçim kutuları görünür. Normal gezinti sırasında bu kutular görünmez; afişlerin tıklama ve sağ tık davranışı korunur.

- Aynı anda en fazla üç eser. Aynı eserin birden fazla dosyası ayrı aday gibi sayılmaz; mevcut katalog kimliği kullanılır.
- Seçim filtreden bağımsız saklanır. Filtre değiştirince veya detaydan dönünce kaybolmaz. Film ve dizi seçimleri ayrıdır.
- Karşılaştırma rafından tek aday kaldırma, seçimi temizleme ve karşılaştırmayı açma. Artık kütüphanede olmayan seçili kayıt açıkça belirtilir; sessizce silinmez ve karşılaştırılabilir aday sayısına dahil edilmez.
- Listeyi aşağı kaydırırken karşılaştırma rafı üst menünün altında erişilebilir kalır. Menü yüksekliği ölçülerek konumlandırılır; oynatıcıya veya tarayıcıya kalıcı alt şerit eklenmez.
- Yan yana kartlarda **yıl, süre, TMDB topluluk puanı, türler ve yerel dosya sayısı** bulunur. Bilinmeyen bilgi “—” olarak gösterilir; puan veya süre uydurulmaz.
- **Konu özetlerini göster** kapalı başlar. Kullanıcı açmadan özet çizilmez. Ayrıntı sayfasına giden düğmeler mevcut kütüphane kaydını açar.
- Kapak yüklenmezse yedek simge görünür. Geniş pencerede üç sütun; dar pencerede kaydırılabilir pencere içinde saran kartlar vardır. Yeni genel modal kimliği veya ikinci asistan yoktur.
- Bu ekran AI çağrısı veya puanlama yapmaz. TMDB puanının topluluk puanı olduğu, kişisel uygunluk puanı olmadığı belirtilir.
- Hasarlı seçim otomatik boş listeyle ezilmez. **Seçimi yedekle ve sıfırla**, açık kullanıcı onayıyla önce özgün metni benzersiz bir kurtarma anahtarında saklar, sonra yalnız karşılaştırma seçimini sıfırlar. Yedek yazılamazsa özgün veri değiştirilmez; sıfırlama yazısı başarısızsa da özgün kayıt durur.

`LibraryCompare.tsx`, `FilmCatalog.tsx`, `libraryWorkbenchModel.ts`, `Extras.tsx` (mevcut modalın isteğe bağlı sınıfı).

## Web defterinden doğrudan not düzenleme

Araçlar → Web defterim içindeki okuma kuyruğu ve sayfa notları artık kaynağa gitmeden düzenlenebilir:

- Mevcut nota **Notu düzenle**, henüz notu olmayan okuma kaydına **Not ekle**.
- **Notu kopyala**, düzenleme sırasında **Taslağı kopyala**. Kaydetme için **Ctrl+Enter**; Escape yalnız not düzenlemesini ele alır, arka pencereyi kapatmaz.
- Vazgeç, değişiklik varsa onay ister. Boş metin kaydetme, mevcut notun silinmesi için ayrıca onay ister.
- Not başka yerde güncellendiyse eski metin üstüne yazılmaz. Yazılan taslak kalır; kopyalayıp güncel notu inceleme açıklaması gösterilir.
- Not defteri kapanıp tekrar açılınca yarım metin aynı oturumda geri gelir. Bu, uygulama yeniden başladıktan sonra saklanan kalıcı taslak değildir; arayüzde “bu oturumda” diye belirtilir.
- En fazla 20 açık not taslağı. Sınır dolunca yeni düzenleme başlamaz; eski taslaklar sessizce atılmaz. Not başına mevcut 5000 karakter sınırı korunur.
- Bozuk kayıt ve depolama yazma hatasında özgün notlar/taslak korunur. Bir notu düzenlemek diğer sayfaların notunu değiştirmez.
- Kaydetme/vazgeçme sonrası klavye odağı ilgili düzenleme düğmesine döner. Kaynağı açmak ve okundu işaretlemek ayrı işlemler olarak kalır.
- Okuma ilerleme çubuğu koyu zemin ve etkin modun vurgu rengiyle çizilir; yerel beyaz çubuk görünümü kaldırıldı.

`WebNoteEditor.tsx`, `WebNotebook.tsx`, `WebNotebook.css`.

## Görünüm ve veri sınırları

Luna'nın mevcut koyu yüzeyleri, IBM Plex Sans/Sora yazıları, kontrolleri ve mod renkleri kullanılır. Yeni yazı tipi, API, paket bağımlılığı veya Rust komutu eklenmedi. Kurtarma/veri anahtarları: `lunaLibraryFilters:movie|tv`, `lunaLibraryCompare:movie|tv`; hasarlı seçim kopyaları `lunaLibraryCompare:*@damaged:*`. API anahtarı, web çerezi veya kişisel veritabanı teslim kaynağına eklenmedi.

Önceki tasarım ve davranış raporları tarihsel kayıttır. Bu tur “50 yeni hata” diye bir sayı üretilmedi; üç yeni kullanım akışı ve bunların veri/görünüm korumaları tamamlandı.

## Gerçek doğrulama

- `npm run build` (TypeScript + Vite) ve i18n denetimi geçti.
- `test:library-workbench` içindeki 9 veri/işlem testi geçti: raf CRUD/bozuk veri/isim/kota/eşitlik, karşılaştırma seçimi sınırları, not değişikliği/bozuk veri.
- İlgili mevcut `workspace`, `library`, `film-browser`, `quality-50`, `web-notebook`, `creative-plus`, `delivery` grupları geçti. Önceki tüm CI matrisleri bu tur yeniden çalışmış gibi gösterilmez.
- Ortak modal bileşeniyle ilişkili film/kitap önizlemesi ve web araçları için 6 komşu etkileşim grubu da geçti.
- Gerçek üretim React arayüzü, sentetik IPC ve örnek kitaplıkla **TR/EN × 1280/640 px**, 850 px yükseklikte: raf kaydet/uygula/hazır filtre/sıfırla; yazma kotasında veri/adı koruma; üç aday seçimi ve dördüncüyü engelleme; karşılaştırma penceresi ve özetin isteğe bağlı açılması; film/dizi ayrımı; notu Ctrl+Enter ile kaydetme; oturum taslağını geri getirme; dışarıdan güncellenmiş notu koruma; hasarlı karşılaştırma kaydını yedekleyip sıfırlama sınandı.
- Bu tur 20 ekran görüntüsü alındı ve ilgili geniş/dar ekranlar tam boy incelendi. Önceki kanıtlar ayrı klasörlerde korunur; her resim ayrı hata/test sayılmaz.
- Rust değişmedi. Gerçek Windows Luna/WebView2, video/DRM, canlı AI/TMDB/Letterboxd veya okuyucu testi yapılmadı. Taklit IPC ile site açılışının veya video oynatmanın doğrulandığı iddia edilmez.

## Paket

Yeni tam kaynak önceki **7,7 MB geliştirilmiş tam paket** dahil bütün çalışmayı içerir. `changes.patch`, v1.6.7 tabanından kümülatif farktır. `onceki-pakete-ek.patch`, yalnız o önceki tam paket kaynağından bu teslim kaynağına farktır. İkisini aynı kaynağa peş peşe uygulamayın; farklı başlangıçlar için alternatiflerdir. Önce `git apply --check` kullanın.

Her iki yama Git'in gerçek diff çıktısıyla üretildi; ayrı temiz dizinde ileri/ters uygulama ve kaynak karşılaştırmasıyla doğrulandı. ZIP CRC, tam kaynak dosyaları ve SHA-256 listesi kontrol edildi. Yerel kurulu EXE'nin güncellenmesi için yeniden derleme gerekir.
