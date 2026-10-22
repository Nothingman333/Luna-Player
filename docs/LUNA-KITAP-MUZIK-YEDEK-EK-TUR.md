# Kitap, müzik kuyruğu ve yedekleme — ek tur

Bu çalışma üç Claude paketinin Browser/Film/Asistan sahiplik alanlarının dışında yapıldı. Önceki 40 madde ve önceki tüm birleştirmeler korunur. Daha önce gönderilen üç Claude ZIP'i değiştirilmedi; onların temel kaynak fotoğrafı sabit kalır. Sonuçları geldiğinde kendi farkları bu merkezi kaynağa birleştirilmeli.

## Kitaplar

- Başlığın içindeki standart 13 haneli veya aralıklı ISBN doğru tanınır. ISBN kaynakları boşsa başlık/yazar araması yalnız bir kez denenir; aynı gömülü ISBN tekrar çıkarılıp sonsuz istek zinciri başlatılmaz. Başlık aramasından tanınan ISBN temizlenir.
- Aday seçildikten sonra açıklamayı bilerek boşaltmak korunur; kaydet sırasında Open Library açıklaması sessizce geri doldurulmaz.
- Yalnız açık kitabın kaydedilmemiş taslağını geri alma düğmesi eklendi; diğer kitapların taslakları etkilenmez.
- Toplu kapak aramasında görünen ilk 20 kapaksız kitabı seçme düğmesi eklendi. Böylece arama sınırını aşmadan eksik kapaklarla başlanabilir.
- Dosyadan/linkten yeni açılan ve geçmişe giren kitaplar listeye yeniden klasör taraması gerektirmeden katılır. Önceki useMemo yalnız tarama dizisine bağlı kaldığından yeni kaynak kayıtlarını kaçırabiliyordu.
- Kaynak listelerini birleştirme ve okuma geçmişinde bozuk temel kayıtlar güvenle dışarıda bırakılır; recent yolları dizi olarak doğrulanır. Veriler otomatik silinmez. Bu, her türlü bozuk kitap alanının eksiksiz kurtarıldığı iddiası değildir.

## Müzik kuyruğu

- Sıradakiler içinde şarkı/sanatçı araması ve sonuç sayısı.
- Çalan parçayı kesmeden kuyruktan başka bir kaydı kaldırma. Aynı URL iki kez varsa seçilen oluşum kaldırılır; çalan kaydın sıra indeksi doğru kalır.
- Henüz çalınmamış parçaları yukarı/aşağı taşıma.
- Çalan ve önceki parçaları koruyup sonrakileri temizleme.
- Çalan parçayı kaldırma düğmesi kapalıdır. Bir düzenleme yapılınca eski shuffle kopyası atılır ve karışık çalma kapanır; daha sonra silinen parçalar shuffle kapatılırken geri gelmez. Kayıtlı çalma listesi değişmez.
- Kuyruk düzenlemesi loadCurrent/mpv çağrısı yapmaz; sürmekteki sesi yeniden başlatmaz. Düzenleme ilkesi küçük açıklamada görünür, kontroller mevcut Luna temasına uygundur.

## Yedekler

- Dosyayı seçince hemen geri yüklemek yerine tarih/sürüm/dosya ve değişen kayıt gruplarını gösteren Luna temalı önizleme açılır.
- Varsayılan açık seçenek, mevcut kayıtların güvenlik kopyasını başka dosyaya kaydettikten sonra geri yükler. Dosya seçiminden vazgeçilirse geri yükleme de başlamaz. Aynı Windows yolunun büyük/küçük harf ve ayraç varyantı güvenlik kopyası olarak seçilirse reddedilir; bu kontrol dosya sistemi hardlink/symlink eşdeğerliği garantisi değildir.
- Başka bir yedekteki profil slotu/adresi mevcut Windows kasasındaki anahtarla eşleşebileceği için geri yüklemede bu bilgisayarın API bağlantı ayarları korunur: AI profilleri, aktif profil, sağlayıcı, Base URL, model seçimleri ve değerlendirme sağlayıcı seçimi. Diğer yedek verileri normal geri yüklenir. Yeni bilgisayarda API bağlantıları otomatik etkinleştirilmez; kullanıcı kurar. Bu davranış önizlemede açıkça belirtilir.
- Kaynak dosya/snapshot ve anahtar değerleri önizlemede metin olarak sergilenmez; anahtarlar hâlâ yedek dışındadır.
- Çift tıklama ve üst üste dosya seçimi için işlem kilidi. Bozuk tarih kontrollü gösterilir, yedek dosya adı yerel güne göre oluşur.
- Yedek klasörünü/bulut sitesini açma hataları yakalanır; eski sessiz veya yakalanmamış hata yolları kaldırılır.
- Kalıcı state yazımı başarısızsa mevcut replaceStorage geri alma mekanizması korunur.

## Doğrulama

- Yeni yardımcılar ve gerçek kuyruk güncelleme fonksiyonuyla 10 kısa kontrol; ISBN için 1 ek gerçek searchBookInfo davranış testi.
- Kitap/profil toplam 20, kitap/müzik 17 ve temel regresyon 37 kontrolü geçti; son toplu kısa test kayıtları TESTLER/final-* içinde.
- İzole gerçek React bileşenlerinde 7 akış geçti: önizlemede kayıt değiştirmeme, güvenlik kopyasını iptal, aynı dosyaya yazmayı reddetme, önce kopya alma + başarısız persist sonrası geri alma + API adresini koruma, açıklamayı boş kaydetme, tek taslağı geri alma, gerçek kuyruk kontrollerinin yeniden oynatma yapmaması.
- UI kontrolleri taklit dosya diyalogları/native/metadata ile headless Edge'de yapıldı; gerçek kullanıcı dosyası, canlı servis, gerçek Windows Luna penceresi veya gerçek ses çıkışı testi değildir.
- Derleme ve İngilizce metin kontrolü geçti. Rust kaynağı bu turda değiştirilmedi; tam uygulama Rust test yürütücüsünün önceki DLL başlangıç sınırı devam eder.
- Commit/push/release yapılmadı.
