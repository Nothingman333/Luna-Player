# Birleşik GitHub teslimi — browser başlangıcından bugüne

## Kapsam ve kaynak

Temel Git commit'i: `31bf2360ca178e16235c7c903500559fa909f931` (1.6.0CC). Henüz commit/push yapılmadı. Tam kaynak, bu temel üzerine sohbet boyunca hazırlanan bütün değişiklikleri içerir; yalnız son Claude yamaları değildir.

Dahil edilen teslimler:
- İlk browser/asistan ve sonraki genel geliştirmelerin tamamı; kitap kapak/bilgi ve raflar, kayıtlı AI profilleri dahil.
- `files (5).zip` içindeki genel NİHAİ düzeltmeler.
- `files (12).zip` içindeki Browser/Film NİHAİ düzeltmeler.
- `files (13).zip` / `files (7).zip` içindeki Kitap/Müzik ARA2: kod yeniden oluşturuldu, birleşik kaynakta derleme ve kısa kontroller tamamlandı. Nihai olmayan teslimin eksik doğrulaması burada tamamlandı; raporda belirtilen bütün olası gelecek özellikler uygulanmış gibi gösterilmedi.
- Astra raporunda istenen release/updater tutarlılığı, belge/çeviri, düz kayıt doğrulaması ve arşiv sınırları için burada hazırlanan düzeltmeler.

Ayrı Asistan geliştirme sohbetinin sonucu gönderilen dosyalarda yoktu. Mevcut browser asistanı ve bu teslimlerdeki asistan entegrasyonu dahil; gelmemiş bir paketin içeriği eklenmiş sayılmaz.

## Korunan ilk yenilikler

- Luna temasına uygun browser, sekmeler, favoriler, native WebView2, popup bildirimi, sayfa okuma/özet/soru cevap.
- Sağ alt baloncuk ve sayfanın üzerinde normal küçük sohbet; tam genişlikte sayfa, kullanıcı büyütürse büyük asistan. Uzak sayfa IPC izolasyonu ve native bölge kırpması korunur.
- Sayfa çevirisi, özgün metne dönüş, iptal ve başarılı bölümleri koruyarak yeniden deneme.
- Toplu dosya yeniden bağlama, koleksiyon kurtarma, sahne notları, altyazı kelime defteri, ortak alıntı defteri, Letterboxd değişiklik özeti, web okuma kuyruğu/sayfa notları, oynatma tercihi yönetimi, seri takibi, erişilebilirlik ve görsel önbellek yönetimi.
- Kitap kapak/açıklama/konu araması (ISBN veya temiz başlık/yazar), Open Library → Google Books, aday seçimi ve elle düzenleme; çoklu raflar, Okunacaklar ve onaylı asistan raf işlemleri.
- Kaydedilmiş sağlayıcı/Base URL/model profilleri, anahtarların Windows kasasında kalması, asistan içinden hızlı profil seçimi.

## Birleştirilen bug düzeltmeleri ve geliştirmeler

- Browser adres yazarken yönlendirmeyle metnin silinmesi, engellenen indirmede takılı yüklenme, eski sekme hatasının yeni sekmeye sızması, çift sekme açma yarışı ve SPA adres takibi düzeltmeleri.
- Sekme yerleşimi ve klavye kısayolları, asistanın güncel sekme bağlamı, sayfa yokken sayfa sorusu koruması; çeviri uygulama hatasında geçersiz token ile sonsuz yeniden denemenin önlenmesi ve durum metinlerinin çevrilmesi.
- Film geçişinde A konumunun B'ye yazılmasını önleyen kayıt modeli; ayrılırken son konumu kaydetme; kopya bölümleri atlama, bölüm numarası ayrıştırma ve ses/altyazı geri yükleme zamanlayıcısı koruması.
- Poster yükleme hatasında kapak yedeği, uzun başlıklar, aksan duyarsız arama, film/dizi boş durumları, analiz dayanağı açıklaması ve asistan sonucunun kesildiğini belirtme.
- Letterboxd özetinde eksik yıl/tekrar eşleşmeleri. Browser tesliminin çağırana ait başlık normalleştirmesini ve tekil eşleşme modelini, genel teslimin yeniden bağlama düzeltmesiyle birlikte koruduk.
- Türkçe İ içeren klasörde yeniden bağlama yolunun bozulması ve yalnız kayıt anahtarında bulunan yolların önizlemede kaybolması düzeltildi; defter araması ve yazılacak yeni kayıtların doğrulanması eklendi.
- Kitap metadatasında kapak boşsa EPUB'un kendi kapağının korunması, kendi kapağına dönüş, raftaki kitapları seçme, raf sayıları/yeniden adlandırma/silme, güncel raf listesi ve bozuk alıntı etiketi dayanıklılığı birlikte korundu.
- Metadata kaydından sonra kaydedilmiş taslaklar değişmiş işaretini temizler; ikinci gereksiz kayıt önlenir.
- Kitap/müzik taraması iptalinde takılı gösterge, sessiz tarama hatası, aynı parçanın kuyrukta tekrarında karıştırma ve çalıyor satırı, geçersiz EPUB konumunda açılış ve yaklaşık ilerleme düzeltmeleri.
- Müzik konum çubuğunda klavye/erişilebilirlik, radyo/podcast yeniden deneme, arama/sonuç sınırı açıklamaları.

## Astra kapsamındaki ek düzeltmeler

- `scripts/release-version.cjs`: tek sürüm girdisini package.json, package-lock, Tauri config, Cargo.toml/Cargo.lock ve görünen APP_VERSION alanına uygular. `--check` yalnız tutarlılığı denetler. Kaynağın mevcut sürümü 1.6.0 tutuldu; yeni release sürümü manuel build sırasında girilir.
- Release workflow gerçek build-release.ps1 üzerinden imzalı kurulum ve latest.json üretir; mevcut imzalama anahtarı zorunludur. Installer, .sig, portable ZIP ve manifest aynı çıktılara alınır; sürüm, URL ve imza tutarlılığı kontrol edilir; UTF-8 BOM olmadan checksum yazılır.
- Otomatik push/tag yayını yoktur. Actions → Release manuel çalışır; isteğe bağlı publish yalnız taslak release oluşturur. Mevcut updater özel anahtarı repository secrets'a kullanıcı tarafından eklenmelidir; yeni anahtar üretilmedi, anahtarlar değiştirilmedi. Henüz imzalı yayın/Actions çalıştırması yapılmadı.
- Health workflow eksik latest.json ve tag/manifest sürüm uyuşmazlığını hata sayar. BUILDING.md/CONTRIBUTING.md manuel akışla eşitlendi. Portable staging temizliğinde beklenen yol ve link kontrolü eklendi.
- Native state_save/state_load ve ön yüz restore yalnız string değerli nesne kabul eder; geçersiz restore dosyası sağlam durumu gizlemez. Mevcut kayıt biçimi korunur, gereksiz migration yapılmadı. Kitap raf/metadata alanları backup biçim kontrollerine eklendi.
- Kitap dosyası 300 MiB; EPUB/CBZ arşivi en çok 10.000 giriş, toplam bildirilmiş açılmış boyut 2 GiB; tek görsel 64 MiB ve XML metadata okuması 4 MiB ile sınırlanır. Okuyucuya yüklemeden önce denetlenir, sınırlı okuyucular bildirilmiş boyuta tek başına güvenmez. Bunlar bütün PDF/EPUB render motoru için tam kaynak tüketimi garantisi değildir.
- Yerel ağ politikası: HTTP(S) üzerinden kullanıcının açtığı LAN/localhost sayfaları desteklenir; mevcut ayrıcalıklı uygulama origin/komut kısıtları korunur. Yerel ağ desteği tek başına SSRF açığı diye sayılmadı; toptan LAN engelleme eklenmedi.
- Büyük bundle refaktörü ve yalnız uyarı temizlemek için bağımlılık yükseltmesi yapılmadı.

## Doğrulama

- Son birleşik ön yüz: TypeScript + Vite build geçti (mevcut büyük chunk/dinamik import uyarıları var).
- 184 kısa kontrol geçti: regression 37, next 32, browser 12, translation 8, extras 14, books/profiles 19, film/browser 20, book/music 17, delivery 7, asistan sunumu 6, çalışma alanı 12.
- İngilizce metin kontrolü geçti. Film/browser testindeki “varsayılan sistem dili İngilizcedir” varsayımı kaldırıldı; açık İngilizce/Türkçe ve özel anahtar davranışları korunarak sınandı.
- Release/health/CI YAML ve PowerShell betikleri sözdizimi denetiminden geçti. Sürüm planı ve hatalı sürüm girdileri kısa testlerde denetlendi.
- Windows GNU native derleme günlüğü TESTLER içinde. Üretim MSVC ayarları ve uygulama kimliği değiştirilmedi. İmzalı NSIS/Actions/updater yayını, canlı servisler ve gerçek Windows video/TTS/DRM uçtan uca testi yapılmadı.
- Paket yaması temel Git kaynağına uygulanıp geri alınarak ve bütün dosya hash'leri karşılaştırılarak doğrulanır.

## Kullanıcının kısa yerel kontrolü

1. Film başlat, ilerlet, başka filme geçip ilkine dön: konumları ayrı kalmalı. Dizide sonraki bölüm aynı bölümün ikinci kopyasına geçmemeli.
2. Browser'da birkaç sekme aç; adres yazarken gezinme, sekme değiştirme ve asistan baloncuğunu dene. Sohbet sayfanın üzerinde açılmalı; video tam ekranını istediğin sitede kendin dene.
3. Çeviriyi başlat/iptal et/yeniden dene ve özgün sayfaya dön. Yeni sekmeye eski çeviri uygulanmamalı.
4. Kitap kapağı/rafı kaydet; ilerleme ve alıntının kaldığını kontrol et. Sesli okumada ses/hız/sessiz ve kapatma/uyku zamanlayıcısını dene.
5. Aynı parçayı içeren çalma listesinde karıştır aç/kapat; müziği açıkça durdurup filmden dön: kendiliğinden yeniden başlamamalı.
6. Sağlayıcı profilini değiştirip sonraki mesajın seçili profili kullandığını kontrol et. Yedeği dışa aktar; gerçek veride hasarlı dosya denemesi yapmadan önce ayrı kopya kullan.

## Paketi GitHub'a taşıma

`Kaynak/Luna-Player` tam birleşik kaynak ağacıdır. `.git` içermez; mevcut checkout'un .git klasörünü koru. `Yama/changes.patch` aynı değişikliklerin başlangıç commit'ine göre farkıdır; tam kaynak üstüne tekrar uygulanmaz. Hedef checkout başka değişiklikler içeriyorsa klasörleri körlemesine ezme; Yama/Apply.ps1 önce yalnız denetim yapar ve uyuşmayan dosyada durur. Push komutlarını çalıştırmadan önce diff'i gözden geçir. node_modules, target, EXE, kişisel dosyalar ve gerçek API anahtarları pakette yoktur.


## Son ek geliştirme turu

- Asistan: aynı render aralığında çift gönderim için anlık kilit; yeni/başka sohbete geçerken ve bağlam değişirken bekleyen onay/önizlemeyi iptal etme; konuşma değiştikten sonra eski yanıttan yeni araç veya otomatik film kartı açılmasını durdurma. Eski konuşmanın hata/çeviri yanıtı yeni konuşmanın üzerine yazılmaz. Başlatılmış uzak istek veya yürümekte olan araç fiziksel olarak geri alınmış sayılmaz.
- Kitap düzenleyicisi: kaydedilmemiş değişiklikle kapatırken seçim; seçilenlerdeki değişiklik sayısı; kayıt sonrası dolan açıklama dahil gerçek kaydedilen taslağı gösterme; gereksiz tekrar kaydı engelleme.
- Toplu kitap araması: tek kitap hatasında kalanlara devam; odaktaki kitabın hata/servis bilgisini gösterme; toplu sonuç özeti; durdurulduktan sonra geç hata mesajının arayüzü ezmesini engelleme. Geçersiz elle girilen ISBN için açık hata; her iki ISBN kaynağı boşsa başlık/yazarla arama. Aday seçimi ve açık kayıt gerekliliği korunur.
- Sağlayıcı profili: kısmi düzenlemede verilmemiş anahtarı koruma; profil metadatasına yalnız izinli alanları yazma.
- Hasarlı optional kitap kaynak/yıl verisini görüntüleme dışında tutma; sonsuz bölüm sayısını okuma ilerlemesi tahminine almama.
- Son ekler için ilgili kısa testler yeniden çalıştırıldı. Asistan oturum kontrollerinden biri kaynak yapısı kontrolüdür; gerçek sağlayıcı/araç uçtan uca testi değildir. İzole headless kitap arayüzünde kaydetmeden kapanmayı reddetme, başarılı kaydın değişmiş işaretini temizlemesi ve kaydedilmiş düzenleyicinin kapanması kontrol edildi. Gerçek Luna Windows penceresine otomatik işlem yapılmadı.


## Kozmetik ve asistan kullanım turu

- Luna renklerini izleyen karşılama başlığı/işareti ve iki sütunlu öneri kartları; dar ekranda tek sütun, uzun başlıklarda otomatik yükseklik. Küçük/yüzen sohbet ve native browser bölge davranışı korunur.
- Mesaj başına kopyalama; kullanıcı sorusunu gönderilmeden düzenleyiciye alma. Kopyalama başarısızsa anlaşılır geri bildirim; panoda yalnız görünen metin yer alır.
- Sohbet içinde vurgu/Türkçe harf duyarsız, çok kelimeli arama; eşleşme sayısı, önceki/sonraki sonuç, ilgili mesaja kaydırma ve görsel vurgu. Arama ve dışa aktarım modelin gizli öneri satırını değil ekranda sunulan mesajı kullanır.
- Sohbeti kopyalama ve Markdown dosyasına dışa aktarma; yalnız mesaj metni ve geçerli HTTP(S) kaynakları, araç argümanları/anahtar deposu değil. İptal edilen dosya seçiminde başarı bildirimi gösterilmez.
- Büyüyen çok satırlı giriş: Enter gönderir, Shift+Enter yeni satır açar; IME yazımı gönderilmez. 12.000 karakter sınırı ve sayaç; yeni sohbet eski taslağı temizler.
- Kitap/müzik için bölüme uygun varsayılan takip soruları; İngilizce sayfa önerisinde çeviri hedefi İngilizce. İşlem adımı henüz gelmediyse boş yüklenme kutusu yerine hazırlık durumu gösterilir.
- Yalnız ilgili kısa kontroller yeniden çalıştırıldı; yeni sunum/arama/dışa aktarma/klavye yardımcıları 5 testle sınandı. Ayrı headless ChatPanel önizlemesinde 6 akış geçti: arama, kopyalama, taklit dosya kaydıyla Markdown dışa aktarımı, soruyu düzenleme/Shift+Enter, yeni sohbet görünümü ve taslak temizliği, 480px pencere. Gerçek pano/native dosya yazımı/AI sağlayıcı veya Windows Luna penceresi testi değildir.


## Browser, film kütüphanesi ve asistan kullanım turu

### Browser
- Araçlar → Sekmeler ve favoriler: açık sekmeleri tek grup olarak açık kullanıcı işlemiyle kaydetme, kaydedilenleri mevcut sekmeleri kapatmadan açma, grubu unutma. Otomatik gezinti geçmişi tutulmaz; kaydedilen URL'ler yalnız yerelde bulunur. Arama parametreleri ve sayfa bölümleri korunur. Kayıt en çok 8 benzersiz normal web adresi içerir, kalan kapasite kadar açılır. Grup açma durdurulabilir; gönderilmiş tek açma komutu geri alınmış sayılmaz.
- Son kapatılan sekmeyi menüden veya Ctrl+Shift+T ile geri açma. Bu kayıtlar yalnız mevcut Browser bileşeni oturumunda bellekte tutulur, diske geçmiş yazılmaz. Native sayfa odağındaki kısayollar sayfaya aittir; Luna arayüzü odaktayken kısayol çalışır.
- Bütün favoriler için arama/açma/kaldırma ekranı; başlangıç sayfasındaki ilk 6 veya araç çubuğundaki ilk 12 sınırından dolayı kalan favoriler erişilemez kalmaz.
- Aynı sekmeyi hızlı çift kapatma ve aynı grubu hızlı çift açma için anlık koruma. URL doğrulaması ve native IPC kısıtları korunur.

### Film/dizi kütüphanesi
- Mevcut türe/kayıt filtresine ek yapım dönemi ve minimum TMDB puanı filtresi; bulunamayan puanlar minimum puan filtresinde gösterilmez.
- Rahat/sık poster görünümü, sonuç sayısı ve boş sonuç ekranından filtreleri temizleme. Görünüm ve filtre tercihleri film/dizi için ayrı yerel kaydedilir; bozuk kayıt varsayılan değerlere döner.
- Arama kelimeleri başlık/yıl/oyuncu alanlarında birlikte bulunabilir. Katalog ve puanlar değiştirilmez.
- Kısa aralıkta ardışık görünüm güncellemelerinde eski ayarın diğerini ezmemesi; tüm filtreleri sıfırlamanın yeni filtreleri de temizlemesi.
- TMDB posteri kadar yerel küçük resim de yüklenemezse film adı gösterilir. Küçük resim hatasında boş kutu kalması giderildi; fallback yüzeyinde sonsuz yüklenme parıltısı durur. Posterler kendi yüklenme durumunu da işler.

### Asistan
- Kısa/dengeli/ayrıntılı yanıt tercihi: sonraki model isteğine sabit, sınırlı bir üslup talimatı eklenir; modelin mutlak uyacağı garantisi değildir. Kullanıcının mesajındaki açık ayrıntı tercihi, doğruluk ve onay kuralları korunur.
- Kullanıcı yukarı kaydırdığında Son mesaja dön düğmesi; yukarıdaki mesajları okurken zorla alta kaydırma yerine kullanıcı seçimi.

Yeni saf yardımcılar 7 kısa testle; ayrı headless kaynak arayüzünde sekme kapatma/geri açma, grubun kaydı ve yeniden açılması, birleşik film filtreleri/temizleme, kalıcı yoğunluk, bozuk küçük resimde başlık, dar ekran ve asistan tercih kaydı toplam 8 akışla kontrol edildi. Native webview ve hizmetler taklit edildi; gerçek Windows/site/video/API testi değildir. Son ön yüz ve native derleme günlüğü pakettedir.


## Browser sekme ve favori düzenleme turu

- Ctrl+Shift+A veya Araçlar → Sekmeler ve favoriler ile bütün açık sekmeleri başlık/adres içinde çok kelimeli, aksan/Türkçe harf duyarsız arama; aktif sekme vurgusu; sekmeye geçiş ve yerinden kapatma.
- Sekmelerin sırasını sağa/sola değiştirme; native sekme kimlikleri, sayfa ve oturum korunur. Sınırdaki taşıma düğmeleri kapalıdır.
- Mevcut sekmeyi çoğaltma ve gerçek sayfa bağlantısını kopyalama. Adres alanında gönderilmemiş başka metin olsa bile kopyalanan/çoğaltılan adres açık sayfaya aittir. Pano başarısı/başarısızlığı bildirilir.
- Son kapatılan ilk 5 sekmeyi listeleyip belirli birini geri açma; Ctrl+Shift+T son kapatılanı açmaya devam eder.
- Favorinin adını değiştirme, boş ad kontrolü ve adresi koruma; favori zaten açık bir sekmeyse yeni kopya açmak yerine ona geçme. Favorilerde Türkçe/aksan duyarsız arama ve boş sonuç açıklaması.
- Ctrl+D ile favori durumunu değiştirme; araç menüsünde Esc ile kapatma (Luna arayüzü odaktayken).
- Arka plandaki sekmenin kapanması aktif sayfanın asistan bağlamını artık temizlemez. Sadece seçili sekme kapanınca bağlam ayrılır.
- Saf arama/sıralama yardımcıları için 2 ek test (çalışma alanı toplam 9); ayrı headless browser önizlemesinde gerçek sayfa adresini kopyalama, çoğaltma, arama/sıralama, arka plan sekmesi kapanırken bağlamı koruma, favori adını kaydetme ve 480px yerleşim olmak üzere 6 kısa akış geçti. Native/pano taklit edilmiştir; gerçek Windows veya canlı site testi değildir.


## Asistan yeniden üretimi ve browser yarış durumları

- Yeniden üret düğmesi önceki ses/oynatma komutunu, bağlantı eylemini veya sayfa çevirisini tekrar yürütmez. Mevcut yanıt yalnız yeniden ifade edilir; model isteğine araç yetkisi eklenmez, dönen araç çağrısı da çalıştırılmaz. Önceki değişikliğin geri alma bilgisi korunur. Bağımsız eylem kartlarında bu düğme kapalıdır. Yeni işlem yapmak için kullanıcı normal yeni mesaj gönderir.
- Ek TMDB kontrolü sürerken sohbet değişirse eski konuşmaya ait onay kartı sonradan açılmaz.
- Çeviri snapshot'ı beklenirken iptal/sekme değişimi olduysa eski sonuç yeniden deneme verisine yazılmaz. Apply komutu native kuyruğa alınmış ama henüz başlamamışsa sekme/revizyon/iptal koşulları çalıştırılmadan önce yeniden sınanır. Başlamış native uygulamayı geri alma garantisi yoktur.
- Okuma kuyruğundan devam etme isteği yalnız URL'ye değil sekme kimliğine bağlıdır; başka sekmedeki aynı adresin yüklenmesi yanlış kaydırma yapmaz. Hedef sekme kapanır veya gezinme başarısız olursa bekleyen konum temizlenir. Arka planda yüklenen doğru sekmeye konum uygulanabilir.
- Sayfa okuma hatası eski sekmeden geldiyse yeni sekmenin uyarı alanına yazılmaz.
- Okuma konumu/not kaydı async sayfa konumunu bekledikten sonra en güncel kaydı okur; arada eklenen satır/ilerleme kaybolmaz. Aynı sayfa tekrar kaydedilirken Okundu durumu korunur. Kayıt sürerken çift işlem ve metin değişimi engellenir; kapatılan panelin geç yanıtı kayıt yazmaz.
- Hasarlı browser not/okuma verileri sessizce süzülüp kalanlar üzerine yazılmaz; kayıt durur ve yedek önerir. Otomatik ilerleme kaydı da bozuk kayıtları ezmez. Dolu not defterinde mevcut notu silmek çalışır.
- Yeni davranışlar için 5 ek kısa kontrol; headless gerçek React bileşenlerinde geciken okuma konumu sırasında yeni satır ekleme ve modelin eylem çağrısı döndürmesine rağmen yeniden üretimin ses/oynatma işlemi yürütmemesi test edildi. Bunlar taklit native/AI ile izole kontrollerdir; canlı sağlayıcı/gerçek Windows testi değildir. Bekleyen native apply ve bazı bağlam korumaları derleme/kaynak düzeyinde kontrol edilmiştir, gerçek WebView2 yarış testi sayılmaz.


## Son tur: 40 madde ve rapor doğrulaması

Yeni browser, asistan, film kütüphanesi ve native PGS/arşiv değişikliklerinin tamamı [LUNA-SON-TUR-40.md](LUNA-SON-TUR-40.md) içinde listelendi. 202 kısa JS/TS kontrolü, 9 izole UI akışı ve 10 bağımsız Rust testi geçti. Tam uygulama Rust test EXE başlangıç sorunu ve gerçek Windows/MSVC doğrulama sınırı da orada açıkça yazılıdır.


## Kitap, müzik ve yedekleme ek turu

Claude görevleriyle çakışmayan merkezi ek tur [LUNA-KITAP-MUZIK-YEDEK-EK-TUR.md](LUNA-KITAP-MUZIK-YEDEK-EK-TUR.md) dosyasında açıklanır. ISBN arama sınırı, kitap taslağı/açıklama düzeltmeleri, müzik kuyruğu düzenleme ve API bağlantılarını koruyan yedek önizleme dahildir. Gönderilmiş üç Claude paketi aynı eski kaynak fotoğrafında bırakıldı; yalnız kendi teslim farkları birleştirilmelidir.


## Okuma deneyimi ve alıntı defteri

Yeni alıntı kartları, filtre/sıralama/kopyalama/etiket düzenleme; okuma geçmişi arama, dönem ve dışa aktarma; okuyucu tercihleri ve bozuk not korumaları [LUNA-OKUMA-DENEYIMI.md](LUNA-OKUMA-DENEYIMI.md) içinde açıklanır.


## Çalma listeleri ve sesli kitap geliştirmeleri

Liste oluşturma/içe-dışa aktarma/kopyalama/sıralama/kuyruktan kayıt; sesli kitap konumunu ve bölüm kimliğini hatırlama, geciken seçimi iptal etme ve hasarlı liste deposunu koruma [LUNA-MUZIK-LISTELER-SESLI-KITAPLAR.md](LUNA-MUZIK-LISTELER-SESLI-KITAPLAR.md) içinde açıklanır.


Son ek tur: [Kitaplık ve okuma planı](LUNA-KITAPLIK-OKUMA-PLANI.md). Biçim/kapak filtreleri, görünüm kalıcılığı, plan öncelikleri ve kayıt doğrulaması dahildir.


Claude teslimlerinin birleşimi: [LUNA-CLAUDE-BIRLESTIRME-2026-10-22.md](LUNA-CLAUDE-BIRLESTIRME-2026-10-22.md). Esas alınan nihai/ara teslimler ve korunan sonraki geliştirmeler raporda belirtilir.


Ek Browser teslimi: [LUNA-CLAUDE-ARA03-EK-BIRLESIM.md](LUNA-CLAUDE-ARA03-EK-BIRLESIM.md). files (17).zip içindeki yalnız yeni ARA-03 farkları birleştirildi.


Son kullanım geliştirmeleri: [LUNA-WEB-DEFTERI.md](LUNA-WEB-DEFTERI.md). Web kuyruğu/notlar için defter, taslak koruması ve favori sıralaması dahildir.
