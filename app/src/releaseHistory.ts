// Generated from the versioned CHANGELOG; keep older records for skipped upgrades.
export const RELEASE_HISTORY=[
  {
    "version": "2.7.5",
    "text": "- 2.7.3 ve 2.7.4 geri alındı: web videosunda çubuk davranışı 2.7.2 ile aynı."
  },
  {
    "version": "2.7.4",
    "text": "- Web sesi başlayınca müzik çubuğu birden kaybolmuyor: bunu yapan eski bir gizleme kuralı kaldırıldı; çubuk sayfa hazır olunca kayarak gider."
  },
  {
    "version": "2.7.3",
    "text": "- Web videosu başlarken siyah bar kalmaz: çubuk, sayfanın videoyu açarken yaşadığı ~1 saniyelik takılma geçtikten sonra kayar (sabit gecikme yerine sayfanın hazır olması beklenir, en çok 1,8 sn)."
  },
  {
    "version": "2.7.2",
    "text": "- Web videosu başlarken çubuk kısa bir an bekleyip sonra kayar: videonun açıldığı ilk anda ekran takılırken siyah bar görünmesin diye."
  },
  {
    "version": "2.7.0",
    "text": "- Web videosu başlayınca çubuk kayarken solmuyor: içeriğiyle birlikte aşağı iner, arkasında siyah boş kutu kalmaz. Küçük film videosu kaymanın başında gizlenmez, çubukla birlikte iner."
  },
  {
    "version": "2.6.9",
    "text": "- Web videosu başlayınca çubuğun aşağı kayışı yavaşladı ve yumuşadı; geri gelişi aynı kaldı."
  },
  {
    "version": "2.6.8",
    "text": "- Web videosu başlayınca çubuk sayfanın arkasında birden kaybolmaz: kayma bitene kadar sayfadaki oyuk yerinde kalır, çubuk aşağı kayarak gider."
  },
  {
    "version": "2.6.7",
    "text": "- Web videosu başlayınca küçük film oynatıcısı aşağı kayarak gider: video artık pencerenin alt kenarına yapışıp sonra birden kaybolmuyor."
  },
  {
    "version": "2.6.6",
    "text": "- Web videosu başlayınca çubuk birden kaybolmaz, kayarak gider: sayfadaki oyuk çubuktan pencerenin altına kadar uzanır, video başlarken sayfa meşgul olsa da animasyon görünür."
  },
  {
    "version": "2.6.5",
    "text": "- Web videosu başlayınca küçük film çubuğu giderken küçük video da çubukla birlikte aşağı kayar, birden kaybolmaz."
  },
  {
    "version": "2.6.4",
    "text": "- Web’den açılan bir filmin sayfasındaki ⋯ menüsünde “Bunu izliyorsun” kontrolü o film için kapatılıp açılabilir.\n- Küçük film çubuğu web videosu durunca geri gelirken küçük video da çubukla birlikte kayar; yerinde birden belirmez."
  },
  {
    "version": "2.6.3",
    "text": "- Web videosu durunca çubuk da gittiği gibi kayarak geri gelir.\n- Film ile şarkı arasında geçerken çubuk yalnız yerinde yumuşakça belirir; ardından aşağıdan yukarı ikinci bir hareket gelmez."
  },
  {
    "version": "2.6.2",
    "text": "- Web sayfasında çubuk geri gelirken de kayarak gelir: sayfadaki oyuk animasyon boyunca her karede çubuğu izler.\n- Film ile şarkı arasında geçerken yeni çubuk aynı yerde yumuşakça belirir (aşağıdan zıplamaz)."
  },
  {
    "version": "2.6.1",
    "text": "- Web sayfasında müzik ve küçük film çubuğu sayfanın üstünde yüzer: çubuğun şekli sayfa penceresinden oyulur, altta siyah şerit kalmaz ve çubuk gelip giderken sayfa yeniden boyutlanmaz."
  },
  {
    "version": "2.6.0",
    "text": "- Web sayfasında müzik ve küçük film çubukları yeniden görünür; yalnız web sayfası ses çalarken kayarak gizlenir, ses durunca geri gelir."
  },
  {
    "version": "2.5.9",
    "text": "- Web sayfasında video başlayınca müzik çubuğu gizlenince altta kalan siyah boşluk kaldırıldı; sayfa tam yüksekliğe geçer.\n- Küçük film çubuğu da web videosu sesle başlayınca filmi duraklatır ve kayarak gizlenir; küçük video tarayıcının üstünde tek başına kalmaz. Film çubuğu görünürken web sayfası ona yer açar."
  },
  {
    "version": "2.5.8",
    "text": "- Çubuktaki ses kaydırıcısı her zaman görünür."
  },
  {
    "version": "2.5.7",
    "text": "- Çubuktaki ses kaydırıcısının üst üste binen eski kuralları temizlendi; tek kural: yeri hep ayrılı, hoparlöre gelince açılır, hoparlörden ve kaydırıcıdan ayrılınca kapanır."
  },
  {
    "version": "2.5.6",
    "text": "- Çubuktaki ses kaydırıcısı fare hoparlörde ya da kaydırıcıdayken açık kalır, ikisinden de ayrılınca kapanır.\n- Web sayfasında video başlayıp müzik duraklayınca müzik çubuğu aşağı kayarak gizlenir ve sayfa tam yüksekliğini korur; müzik yeniden çalınca çubuk kayarak geri gelir."
  },
  {
    "version": "2.5.5",
    "text": "- Neler yeni ekranı onaylanan tasarıma getirildi: bulanık videonun üstünde koyu mavi cam kart, sade başlık, ince zaman çizgisi üzerinde noktalı liste ve sade Başlayalım düğmesi."
  },
  {
    "version": "2.5.4",
    "text": "- Neler yeni ekranı herkes için yeni tasarımda: daha ince başlık, altında \"… sürümünden bu yana N güncelleme\" satırı ve renkli noktalı liste; bulanık video arka plan korunur."
  },
  {
    "version": "2.5.2",
    "text": "- Ses kaydırıcısı hoparlörün üzerine gelince aynı yerde belirir, yeri hep ayrılı olduğu için hiçbir şey kaymaz; hemen kaybolmaz.\n- Film ile şarkı arasında geçerken büyük oynatıcının bir an görünüp sayfanın yenileniyormuş gibi görünmesi kaldırıldı; film doğrudan küçük çubukta açılır."
  },
  {
    "version": "2.5.1",
    "text": "- Çubuktaki ses ayarı açılır balon yerine ses düğmesinin yanında her zaman görünen kısa, ince bir kaydırıcı; fare altında hiçbir şey açılıp kapanmaz."
  },
  {
    "version": "2.5.0",
    "text": "- Çubuktaki ses ayarı artık ses düğmesinin üstünde küçük bir balon olarak açılır; düğmeleri itmediği için çubuk fare altında titreyip bozulmaz."
  },
  {
    "version": "2.4.9",
    "text": "- Küçültülmüş film varken YouTube şarkısı açınca film beklemeye alınmıyor, \"filme geç\" oku çıkmıyor ve film yeniden açılınca oynatıcı kayboluyordu; düzeltildi."
  },
  {
    "version": "2.4.8",
    "text": "- Luna her açılışta Film bölümünde başlar."
  },
  {
    "version": "2.4.7",
    "text": "- Küçük çubuktaki videoya tıklamak filmi büyütüp tam ekranda açar."
  },
  {
    "version": "2.4.6",
    "text": "- Küçük film çubuğu müzik tarafında da filmin turuncu rengini kullanır. Geçiş noktaları kendi renginde: şarkı yeşil, film turuncu; beklerken soluk, çalarken tam renk."
  },
  {
    "version": "2.4.5",
    "text": "- Çubuktaki ses kaydırıcısı artık yalnız ses düğmesinin üzerine gelince açılır; filme/şarkıya geç okuna giderken çubuk genişlemez."
  },
  {
    "version": "2.4.4",
    "text": "- Film ile şarkı arasında geçiş artık çubuğun içinde: tek ok düğmesi ve hangisinin çaldığını gösteren iki nokta. Çubuğun üstündeki sekmeler kaldırıldı.\n- Küçültülmüş filme şarkıdan geri dönünce oynatıcının tamamen kaybolması düzeltildi (film yanlışlıkla müzik sayılıyordu); film küçük oynatıcıda devam eder."
  },
  {
    "version": "2.4.3",
    "text": "- Küçük video çubuğu müzik çubuğuyla aynı şekilde: ortada, tek satır, ~780px, zaman çizgisi üst kenarda, küçük video kapak yerinde. Şarkı/film sekmeleri arasında geçiş yumuşak."
  },
  {
    "version": "2.4.2",
    "text": "- Tam ekrandayken filmi küçük oynatıcıya almak (−) artık tam ekrandan çıkarmaz; büyütünce film yine tam ekranda devam eder."
  },
  {
    "version": "2.4.1",
    "text": "- Tam ekrandayken filmden Esc ile çıkmak artık tam ekranı kapatmaz; tam ekrandan yalnız F11 ile çıkılır (oynatıcının kendi açtığı tam ekran film kapanınca kapanır)."
  },
  {
    "version": "2.4.0",
    "text": "- Pencerenin büyütme (□) düğmesi yeniden doğrudan tam ekrana geçer; tam ekranda farenin ekranın üst ortasına gidince çıkış düğmeleri görünür."
  },
  {
    "version": "2.3.9",
    "text": "- Luna son kapanıştaki boyutla değil, her açılışta 1152×684 boyutunda ve ortada açılır.\n- Arkadaş puanlarındaki buçuklu yıldız artık gerçek yarım yıldız olarak çizilir; boş yıldızlar soluk görünür.\n- Müzik çubuğu tek satır ve ~780px: solda şarkı, sağda bütün düğmeler yan yana. Ses kaydırıcısı ses simgesinin üzerine gelince açılır."
  },
  {
    "version": "2.3.8",
    "text": "- Luna 1152×684 boyutunda, ekranın ortasında açılır.\n- Müzik çubuğu artık tam genişlikte değil: ortada, en fazla 980px genişliğinde kompakt bir çubuk."
  },
  {
    "version": "2.3.7",
    "text": "- Müzik çubuğu daha kompakt: aynı düğmeler, yarı yükseklik. Zaman çizgisi üst kenarda ince bir çizgi; üzerine gelince kalınlaşır ve tutamaç çıkar. Süre şarkı bilgisinin yanında yazar."
  },
  {
    "version": "2.3.6",
    "text": "- Film küçültülmüşken müzik açınca alt çubuk artık kaybolmaz: son açılan çalar, film kaldığı yerde bekler. Alt çubuğun üstündeki ♪ şarkı / ▶ film sekmeleriyle ikisi arasında geçilir.\n- Arkadaş puanları penceresi afişin içine sığar, cam görünümündedir; uzun yorumlar pencerede kaydırılır.\n- Bu akşam ne izlesem: arkadaş seçimi düğmesi yalnız Önerilenler seçiliyken yumuşakça görünür."
  },
  {
    "version": "2.3.5",
    "text": "- Ana sayfa vitrininde Detaylar ve “Bu akşam ne izlesem?” düğmeleri aynı görünür; parlak bir resim üstünde düğme artık griye dönmez."
  },
  {
    "version": "2.3.4",
    "text": "- Film kartlarının düğmeleri her yerde Öneriler tasarımında: afişin alt kısmında tek sıra. Arkadaş fotoğrafları artık düğmeleri kapatmaz; üzerine gelince sıranın sonuna geçer.\n- Büyük film ızgaralarında kartlar daha hızlı: arkadaş puanları tek seferde hazırlanır, düğmeler yalnız kartın üzerine gelince oluşturulur."
  },
  {
    "version": "2.3.3",
    "text": "- Ortak film kartı: Keşfet, ana sayfa satırları, Filmler ve Öneriler kartlarında filmi izleyen arkadaşların fotoğrafları ve puanları görünür; fotoğraflara gelince herkesin yıldızı açılır.\n- Kartların üzerine gelince her yerde aynı hızlı düğmeler çıkar: Oynat, Fragman, Detay, Sonra izle, İzledim ve Diğer menüsü."
  },
  {
    "version": "2.3.2",
    "text": "- Öneri listelerindeki afiş kartlarına Sonra izle ve İzledim düğmeleri eklendi."
  },
  {
    "version": "2.3.1",
    "text": "- Keşfet kategorilerinde birden fazla tür birlikte seçilebilir.\n- Kategori sonuçları sınırlı bir sırada kalmaz; aşağı kaydırdıkça o kategorideki yeni filmler yüklenir."
  },
  {
    "version": "2.3.0",
    "text": "- Keşfet kategori menüsü okunabilir cam görünümüne uyarlandı; dışarı tıklama ve Escape ile kapanır.\n- Başka bir öneri hazırlanırken mevcut film görünür kalır. Afiş değiştiren hızlı döngü kaldırıldı; özet ve oyuncular için yer ayrılarak kartın boyut sıçraması azaltıldı."
  },
  {
    "version": "2.2.9",
    "text": "- Küçük video oynatıcısında pencere boyutlandırma ve görünüm geçişleri sırasında görüntünün ana arayüzü kaplamasına karşı yerel video alanı ayrıldı.\n- Küçültme tam ekrandan çıkış tamamlandıktan sonra yapılır. Küçük oynatıcı pencere kenarından yukarı alındı; ses kontrolünü gizleyen müzik çubuğu kuralları ayrıldı."
  },
  {
    "version": "2.2.8",
    "text": "- Küçük video oynatıcısı müzik çubuğuyla aynı düzende: solda video ve başlık, ortada oynat/duraklat, 10 sn geri/ileri ve tıklanabilir ilerleme çubuğu, sağda ses ve kapat."
  },
  {
    "version": "2.2.7",
    "text": "- Küçük oynatıcı açıkken film detayına girildiğinde oluşan siyah ekran düzeltildi. Aynı film veya başka bir film oynatıldığında büyük görünüm açılır.\n- Küçük oynatıcıya ses seviyesi ve sessize alma kontrolleri eklendi. Tam ekrandan çıkınca pencere ekranın çalışma alanına oturtulur."
  },
  {
    "version": "2.2.6",
    "text": "- Küçük video modu pencere yeniden boyutlandırılırken korunur; geçici ölçü hatası videoyu büyütmez.\n- Pencereyi büyütmek otomatik tam ekrana geçirmez. Oynatıcı kontrolleri, ses/altyazı ve diğer pencereler dar ve kısa ekranlara uyar."
  },
  {
    "version": "2.2.5",
    "text": "- Kopya film afişlerinde her dosyanın çözünürlük ve SRT yan dosya bilgisi görünür; eksik çözünürlük bilgisi açıkça belirtilir.\n- Keşfet kategori menüsü film/dizi, kategori ve süre gruplarıyla yenilendi.\n- Yandex sonuç bağlantıları normal tıklamada doğrudan açılır; yeni sekme kısayolları korunur."
  },
  {
    "version": "2.2.4",
    "text": "- Kopya filmler daha belirgin bir afiş destesi, çerçeve ve kopya rozetiyle gösterilir; üzerine gelince kopyalar yana açılır."
  },
  {
    "version": "2.2.3",
    "text": "- Küçük video oynatıcısının boş görüntüsü düzeltildi; kontroller ve süre bilgisi bir araya getirildi.\n- Kayıtlı web videosu açılamadığında sessizce tarayıcıya geçmek yerine kaynak yenileme seçeneği sunulur; izleme konumu korunur.\n- Ana sayfa düğmeleri eşleştirildi; kopya filmlerin üst üste afişleri belirginleştirildi."
  },
  {
    "version": "2.2.2",
    "text": "- Web’den açılan filmler kapatılıp Filmler bölümünden yeniden açıldığında kaldığın yer korunur. Baştan başla seçeneği aynı şekilde çalışır."
  },
  {
    "version": "2.2.1",
    "text": "- Web’de gezinirken reklam engellemenin oluşturduğu gereksiz yük azaltıldı; sayfa yükleme deneyimi iyileştirildi."
  },
  {
    "version": "2.1.9",
    "text": "- Kopya film afişleri kapalıyken tek başlık ve bilgi satırı gösterir; yana açıldığında her kopyanın bilgileri görünür.\n- Reklam engelleyici geçici sorgu hatasında açık durumunu korur; yeniden kurulum başlatmaz."
  },
  {
    "version": "2.1.8",
    "text": "- Web sekmeleri ve bölümler arasında geçişte arka plan sesi korunur. YouTube parçaları ve playlistler mevcut müzik aktarım penceresinden seçilir.\n- Video için küçük oynatıcı, beğenme ve playlist seçenekleri eklendi. Oynatıcı ses oturumu Luna Player adıyla gösterilir."
  },
  {
    "version": "2.1.7",
    "text": "- Reklam engelleyici eklenti yönetimi, asistan balonu yerine yalnız gerçek web sekmesinin profilini kullanır.\n\n- YouTube playlist aktarımı tek videoyu çalmak yerine mevcut şarkı seçme ve liste oluşturma penceresini kullanır. Aktarım oku hafifçe vurgulanır.\n- Ana sayfadaki film kopyaları üst üste toplanıp yana açılır. Web başlıklarındaki sezon ve bölüm bilgileri dizi olarak ayrıştırılır.\n- Kategoriler, mevcut Keşfet görünümünün içeriklerini filtreleyen açılır menüdür. Ana sayfanın seçim düğmesi ortak cam görünümünü kullanır."
  },
  {
    "version": "2.1.6",
    "text": "- Arkadaş önerileri bütün listeyi beklemez: kayıtlı TMDB tür ve süre bilgileri önce kullanılır; eksikler küçük gruplar halinde, uygun aday bulunana kadar yüklenir.\n- Öneriler yüklenirken afişler yumuşak bir sıralama animasyonuyla bekleme durumunu gösterir."
  },
  {
    "version": "2.1.4",
    "text": "- Rust tarayıcı modülünün dosya açıklaması düzeltildi; E0753 derleme hatası giderildi.\n- Klip başlangıç ve bitiş alanları dakika:saniye veya saat:dakika:saniye biçiminde gösterilir ve düzenlenir. Geçersiz zamanlar kaydedilmez."
  },
  {
    "version": "2.1.5",
    "text": "- Web filmlerinin değişen akış adresleri ve oynatıcı yönlendirmelerinde devam kaydı korundu; devam konumuna ulaşılmadan sıfır saniye kaydedilmesi engellendi. Film kopyaları ortak ilerleme gösterir ve katalogda yana açılan afiş gruplarında toplanır.\n- Luna Web Araçlar bölümüne kullanıcının sağladığı uBlock Origin Lite Manifest V3 paketiyle aç/kapat düğmesi eklendi. Otomatik oynatma yalnız ses kaynaklarını ve 8 saniyeden kısa klipleri atlar. Playlist bağlantıları mevcut müzik içe aktarma ekranını açar.\n- HDR kaynağı ve oynatıcının renk çıkışı ayrı gösterilir; HDR çıkış politikası ekranın otomatik bildirilen yeteneklerini izler.\n- Arkadaş önerileri seçilen kişilerin içe aktarılmış kayıtlarını kullanır; eksik tür ve süre bilgileri TMDB ile tamamlanır. Arkadaş puanları ilgili kişinin film değerlendirme sayfasını açar. TMDB puanları açıkça etiketlenir."
  },
  {
    "version": "2.1.3",
    "text": "- Web aktarımının geçici sessize alması kullanıcı sekme tercihinden ayrıldı. Kaynak sayfa, iç içe oynatıcı kareleri ve yeniden başlatma girişimleri native kare kontrolüyle durdurulur.\n- HLS ana manifestleri otomatik seçimde önceliklidir. Uzantısız medya adresleri de boyut/süre sınırıyla incelenir; yalnız ses codec'i taşıyan kaynaklara çözünürlük etiketi verilmez.\n- Video açılırken vid=auto dosyaya özel uygulanır. Yalnız ses çıkan Web kaynağında başka video kaynağı sınırlı sayıda denenir; uygun kaynak yoksa seçim ekranına dönülür.\n- YouTube'da mevcutsa HDR video ve ayrı ses birlikte tercih edilir. Görüntü paneli kaynak HDR/SDR durumu ile ekran çıkışını ayrı gösterir.\n- Ana sayfadaki Bu akşam ne izlesem düğmesi slayt göstergelerinin soluna, mevcut sayfa düğmelerinin stiliyle taşındı."
  },
  {
    "version": "2.1.2",
    "text": "- YouTube videoları film kütüphanesi ve devam listesinden ayrıldı; önceki filmin altyazı ve parça durumu yeni videoya taşınmaz. Eski kayıtlar silinmez.\n- Web kaynaklarında ayrı ses grubu bulunan HLS kalite seçenekleri ilgili ses akışıyla birlikte açılır. YouTube görüntü ve sesini birlikte alan sayfa oynatıcısını kullanır.\n- Kalite bilgisi oynatılan akışın çözünürlüğünden alınır; doğrulanmış PQ/HLG içeriğinde HDR etiketi gösterilir. Kare içindeki oynatma sinyali otomatik açılmada kullanılır.\n- Yalnız Web filmlerinde afiş/ad içeren 10 saniyelik eşleştirme bildirimi ve Değiştir düğmesi eklendi. Film detaylarının menüsünden de Web eşleşmesi değiştirilebilir."
  },
  {
    "version": "2.1.1",
    "text": "- Web Araçlar menüsüne en uygun kaynağı otomatik seçme ve oynayan web videolarını Luna’da otomatik açma seçenekleri eklendi; varsayılanları kapalıdır. Ses akışları ve tespit edilen reklam önizlemeleri video seçiminden ayıklanır.\n- Kaynak açılamadığında, zaman aşımında veya video motoru hatasında tarayıcıya ve kaynak seçimine dönülür. Luna’da video açılırken sayfadaki video duraklatılır; site tarafından yeniden başlatılması aktarım boyunca engellenir.\n- Webden açılan YouTube bağlantıları görüntülü oynatıcıyı kullanır. Site başlıklarındaki izle ekleri temizlenir; film için sayfada belirtilen çıkış yılı TMDB eşleştirmesine eklenir."
  },
  {
    "version": "2.1.0",
    "text": "- Web kaynak seçiminde HLS ana listesindeki gerçek çözünürlükler okunur; çok kaliteli akışlarda çözünürlük aralığı gösterilir. Bilgi bulunamayan kaynaklar Kalite bilinmiyor olarak belirtilir.\n- Oynatıcı kalite alanı açık videonun gerçek çözünürlüğünü gösterir; belirsiz Akış etiketleri açıklayıcı hale getirildi."
  },
  {
    "version": "2.0.9",
    "text": "- Webde Luna’da oynat, birden fazla video kaynağı bulduğunda süre, kalite ve kaynak bilgileriyle seçim penceresi açar. Tek kaynak doğrudan açılır; seçim iptal edilirse oynatma başlamaz."
  },
  {
    "version": "2.0.8",
    "text": "- Kaynak videolar süre ve çözünürlüğe göre sıralanır; reklam olarak tanınan ve kısa kaynaklar ana videonun önüne geçmez. Erişilebilir gömülü oynatıcıların video bilgileri de değerlendirilir.\n- Kalite listesi ekranın sınırlarına göre açılır; boş/sayısal kalite etiketleri düzenlendi. Uzun altyazı adlarının diğer sütuna taşması giderildi.\n- Klip karelerinde yüklenme durumu gösterilir. Web sahne ızgarası daha az ağ isteğiyle ve yakın zamandaki kareleri önce yükleyerek açılır; önizlemede düşük HLS kalitesi kullanılır.\n- Webden gelen film adı, site ve izleme eklerinden temizlenip mevcut otomatik TMDB eşleştirmesine verilir."
  },
  {
    "version": "2.0.7",
    "text": "- Tarayıcı videolarında film adı kaynak sayfasından alınır. Devam kaydı sayfa kimliğini, kaynak adresini, referrer bilgisini ve erişilebilir ses/altyazıları saklar; yeniden açılışta oynatma bağlamı geri yüklenir.\n\n- İnternet videosu açılırken ve ileri sarma sırasında yüklenme göstergesi eklendi. Önizleme, sahne ızgarası ve klip aktarımı kaynak adresi ile gerekli HTTP başlıklarını kullanır; klip penceresindeki sıkışma düzeltildi.\n- Tarayıcıda erişilebilir JW/HLS kaynaklarının yakalanması genişletildi; kaynak birden fazla kalite sunuyorsa Görüntü panelinden seçilebilir. Açılamayan videolarda tekrar deneme açıklaması gösterilir.\n- Luna’da video başladığında tarayıcıdaki video duraklatılır. Tarayıcı sesi müziği duraklatır ve müzik çubuğunu gizler; video tam ekranında Luna çubukları gizlenir.\n- Akşam önerisinde konu, otomatik çeviri ve oyuncular gösterilir; afişten ayrıntılar açılır. Arkadaş puanları cam temaya uyar; ana sayfa düğmesi ve asistan müzik kontrolleri yeniden hizalandı."
  },
  {
    "version": "2.0.6",
    "text": "- Ana sayfada Bu akşam ne izlesem düğmesi, önerileri devam kartıyla aynı alanda yumuşak geçişle açar; sayfaya yeniden gelince devam kartı gösterilir. Arkadaş seçimine yuvarlak profil fotoğrafları eklendi.\n- Tarayıcıdan video açılmasını engelleyen oynatıcı referrer doğrulaması düzeltildi; yalnız güvenli HTTP(S) kaynak adreslerine izin verilir."
  },
  {
    "version": "2.0.4",
    "text": "- Yanıt biçimi ve tarayıcı arama motoru seçimleri Luna temasına uygun, klavyeyle kullanılabilen menülere dönüştürüldü. Başlangıç araması ile adres çubuğu birbirinden ayrıldı.\n- Letterboxd profil fotoğraflarında Gravatar desteği ve yeni fotoğraf ayrıştırıcısıyla yeniden deneme eklendi.\n- Tarayıcıda diğer siteler için Luna’da oynat erişimi açıldı; erişilebilir video, HLS/DASH, ses ve altyazı kaynakları mevcut oynatıcıya aktarılır."
  },
  {
    "version": "2.0.3",
    "text": "- Öneriler filtre değişince ekranda kalır; gösterilen filmler 8 saat sonra yeniden aday olabilir, yeni filmler önce gelir. Arkadaş puanlarının yanında kayıtlı yorumlar görünür.\n- Tarayıcı asistanı YouTube videosunu sağlayıcıya göre özetler: Gemini video bağlantısını, diğerleri alınabilen altyazıyı kullanır. Özet isteği YouTube simgesi ve özel bekleme animasyonu ile gösterilir.\n- Tarayıcı yeni sekme bağlantılarını tekrar sormadan açar; asistan bağlantıları varsayılan tarayıcıya gider.\n- Geniş asistanda yanıt biçimi üst çubuğa taşındı; müzik kontrolleri, şarkı önizleme düğmeleri ve genişleyen liste onayı eklendi. Film ayrıntıları ekran boyutuna uyar."
  },
  {
    "version": "2.0.2",
    "text": "- Sistem ve bakım için ayrı bir sistem simgesi kullanılır.\n- Kütüphane önerileri tükenince yeniden döner; filtreler uygun seçenek bırakmazsa kütüphaneden alternatif gösterilir.\n- Bu akşam ne izlesem bölümüne arkadaş seçimi olan Önerilenler kaynağı eklendi. Seçilen filmin önerenleri, varsa kişisel puanları ve notları gösterilir."
  },
  {
    "version": "2.0.1",
    "text": "- Öneriler kişi bölümüne Fotoğrafı yenile ve Fotoğraf seç eklendi; site erişimi engellense bile yerel profil fotoğrafı kullanılabilir ve başarısız yenilemede mevcut fotoğraf korunur."
  },
  {
    "version": "2.0.0",
    "text": "- Arkadaş ortalaması /5 gösterilir; üzerine gelince kimin kaç puan verdiği ve puansız izlemeler görünür. Bu bölüm Öneriler film ayrıntılarında da yer alır.\n- Bağlı Letterboxd profillerinin fotoğrafları erişilebildiğinde yüklenir; fotoğraflardan profillere gidilir. Öneriler kişi kartları ve kişi başlığına da profil erişimi eklendi."
  },
  {
    "version": "1.9.9",
    "text": "- Film detaylarında kalan süre toplam sürenin yanında dakika olarak gösterilir. Alttaki eski süre satırı kaldırıldı.\n- Bu filmi izleyen arkadaşlar Önerilerdeki izleme/beğeni/puan kayıtlarından bulunur; üst üste duran ad simgeleri üzerine gelince yana açılır."
  },
  {
    "version": "1.9.8",
    "text": "- Asistan yanıtlarındaki küçük film simgesi yalnız kütüphanede bulunan filmlerde gösterilir; diğer bilinen filmlerin üzerine gelince açılan seçenekler korunur."
  },
  {
    "version": "1.9.7",
    "text": "- Asistan yanıtlarında film adlarının yanındaki beğeni emojisi ve Kütüphanende etiketi tek küçük film simgesinde birleştirildi; durum bilgileri ipucunda, işlemler simgenin menüsünde korunur."
  },
  {
    "version": "1.9.6",
    "text": "- Filmlere beğeni, beğenmeme veya puan vermek izlenmiş kaydını da oluşturur; seçimi kaldırmak izleme geçmişini silmez.\n- Asistana izlediğini söylediğin filmler yanıtın yanında sırayla değerlendirilir: beğeni, 10 üzerinden puan ve isteğe bağlı not Gönder ile mevcut deftere kaydedilir.\n- Keşfet içerik uyarısı yıldızı afişin sağ üst köşesine taşındı; bulanık görselin üzerinde net kalır."
  },
  {
    "version": "1.9.5",
    "text": "- Görünüm ve erişilebilirlik seçenekleri Oynatma ve bağlantılar içine, Luna Web seçenekleri Genel içine taşındı; iki ayrı sekme kaldırıldı.\n- Bu akşam ne izlesem kartına mevcut beğeni/puanlama sistemini kullanan afiş üstü beğen/beğenme ve afiş altı Asistana sor düğmeleri eklendi. Üst kısayollar ortalandı."
  },
  {
    "version": "1.9.4",
    "text": "- Geniş asistandaki koleksiyon onay paneli kullanılabilir alana yayılır; film, müzik ve kitap grupları sığdıkça yan yana yerleşir. Liste yüksekliği pencereyle büyür, küçük asistanın kompakt görünümü korunur."
  },
  {
    "version": "1.9.3",
    "text": "- Genel ayarları sadeleştirildi: görünüm/erişilebilirlik, sistem/bakım ve web seçenekleri ilgili bölümlere ayrıldı; atlama/ses oynatmaya, donanım Upscaler’a taşındı. Ayar kartlarının yüzeyleri eşitlendi.\n- Sohbet araması, dizini ve üç nokta yalnız geniş asistanda, film adının karşısındaki üst satırda yer alır. Kopyalama/indirme üç noktada; menü katmanları okunaklıdır.\n- Tanıtımın Film/Müzik/Kitap vurguları aynı zaman çizelgesine alındı; fazladan kenarlık ve eksik kitap çizgileri düzeltildi, geçişler hafifletildi.\n- Keşfet'teki bulanık afişlerin adında kırmızı içerik uyarısı yıldızı gösterilir; puan ve etiketler net kalır.\n- AI token sayacı yanıt geldikçe güncellenir. Elle token bütçesi giriş alanı kaldırıldı; kalan hesap kotası alınamadığında açıkça belirtilir."
  },
  {
    "version": "1.9.2",
    "text": "- Müzik zevk profili kayıtlarında mevcut kapaklar gösterilir. Film, kitap ve müzikte konu önemi /5 olarak okunur.\n- Zevk testinde Hiçbiri seçeneği eklendi, uzun seçenek metinlerinin taşması düzeltildi.\n- Genel arama cam görünümü, kapak/afiş ve mevcut puan, süre ve tür bilgileriyle düzenlendi.\n- Ana sayfa önerileri gösterilmiş filmleri hatırlar, tekrar önermez ve Sonra izle listesine kaydedilebilir.\n- Yenilik ekranındaki Başlayalım yanındaki koyu şerit kaldırıldı."
  },
  {
    "version": "1.9.1",
    "text": "- Galeri oklarının hover sırasında aşağı kayması düzeltildi; resim ve küçük resimler yüklenirken kontrol konumları sabit tutuldu.\n- Zevk testi altı hikâye seçimi üzerinden öneri üretir; süre/kaynak sorularını tekrarlamaz. Sonuçlardaki İzledim düğmesi izleme kaydını tutar ve yerine başka film getirir."
  },
  {
    "version": "1.9.0",
    "text": "- Film resimleri ortak büyük galeri, yan oklar ve küçük resim şeridiyle açılır.\n- Dışarıdan önerileri için gereksiz ayrıntı/oyuncu istekleri kaldırıldı, önbellek eklendi; kapsam değişiminde kontrollerin yerleşimi sabitlendi.\n- Üç soruluk Zevk testi film önerir. Ana sayfa slayt göstergelerinde yalnız geçerli slayt vurgulanır."
  },
  {
    "version": "1.8.9",
    "text": "- Genel arama çubuğunda küçük öneri listesi, Daha fazla ile kaynaklara ayrılmış tam sonuçlar gösterilir; yazarken sayfa değişmez.\n- Tanıtımın beğeni emojisi çizgi ikonla değiştirildi; güncelleme videosu yalnız yenilik kutusunun içine alındı."
  },
  {
    "version": "1.8.8",
    "text": "- Kitaptan çıkışta kapanmış Foliate sayfa belgelerine erişim düzeltildi.\n- Dışarıdan kapsamı yalnız kütüphane dışındaki filmleri önerir. Genel arama kütüphane, öneriler, TMDB film/dizi, kitap ve müzik sonuçlarını ayırır.\n- F11 bildirimi üst ortaya taşındı; arka plan resimleri galerisi ve yerel token bütçesine göre kalan yüzde eklendi.\n- Güncelleme ekranında kullanıcı videolarından rastgele, karartılmış ve bulanık arka plan oynatılır."
  },
  {
    "version": "1.8.7",
    "text": "- Kütüphanede / Fark etmez seçimi Benim için seç yanında iki belirgin, kayar göstergeli düğme oldu."
  },
  {
    "version": "1.8.5",
    "text": "- Analiz odak seçenekleri analiz öncesi zevk tercih penceresine taşındı. Eleştiriliyorsa uyar açıklaması gerçek davranışına uygun hale getirildi."
  },
  {
    "version": "1.8.4",
    "text": "- Bu akşam ne izlesem bölümüne tek düğmeyle Kütüphanede / Fark etmez kapsam seçimi eklendi; süre seçenekleri korundu."
  },
  {
    "version": "1.8.3",
    "text": "- EPUB sayfa notlarına okuyucu sayfası eklendi; defterden alınan notlar sayfa etiketini korur. Eski notların kayıtlı konumu okuyucuda ziyaret edilince sayfa etiketi tamamlanır."
  },
  {
    "version": "1.8.2",
    "text": "- Dış kaynaklı yenilik maddeleri kaynak etiketiyle kaynaklarını sonunda gösterir; eski bilinmeyen kayıtlar tahminle etiketlenmez."
  },
  {
    "version": "1.8.1",
    "text": "- Kitap defterine okuyucuyla ortak sayfa/konum notları, not düzenleme ve kayıtlı yere dönüş eklendi.\n- Film ayrıntısında Altyazı ekle üç nokta menüsüne taşındı."
  },
  {
    "version": "1.8.0",
    "text": "- Kitap ve film defteri düğmeleri ana eylem satırına yuvarlak ikon olarak alındı; diğer defter girişleri kaldırıldı."
  },
  {
    "version": "1.7.9",
    "text": "- Kitaplık filtreleri tek panelde toplandı; sıralama açılır seçim oldu, mükerrer raf düzenleme kaldırıldı.\n- Zevk profili kayıtları aranabilir, sanatçıyı ayrı satırda gösteren listeye dönüştü."
  },
  {
    "version": "1.7.8",
    "text": "- Kalabalık izleme seçeneklerinde üst üste duran daireler aynı satırda sağa kayarak açılır ve geri toplanır. Ayrı menü, yinelenen seçenekler ve kaydırma okları kaldırıldı.\n\n- Öneri ve Keşfet ayrıntılarına seçili ülkenin Nerede izlenir bilgisi eklendi. Letterboxd puanları boş ve yarım yıldızları destekleyen sabit beş yıldızla gösterilir.\n\n- Kitabın altı hazır asistan sorusu kapak/raf/defter düğmelerinin yanında doğrudan görünür; ayrı soru penceresi kaldırıldı."
  },
  {
    "version": "1.7.7",
    "text": "- Film/kitap defteri ve internetsiz yorum taraması geniş açılır pencerelere taşındı. Kitap ayrıntısına Asistana sor eklendi.\n- Analizden önce zevk tercihleri açılır; Analize başla ile işlem başlar. Alttaki ayrı tercih alanları kaldırıldı.\n- Kitap filtreleri Tümü ile başlar; seçili filtreye tekrar basınca Tümü olur. Boş beğeni alanlarındaki emoji yönergeleri sadeleştirildi.\n- Kitap ve müzik profil sayılarından ilgili kayıtlara erişilir. Kitap ayrıntısında müzik çubuğu için alt boşluk bırakıldı.\n- Sağlayıcılar sabit yükseklikte yatay açılır; sığmayan seçenekler oklarla gezilir. TMDB etiketi sol alta taşındı."
  },
  {
    "version": "1.7.6",
    "text": "- Luna Analiz küçültülebilir; film defterinde simgeli beğeni düğmeleri tekrar basılınca seçimi kaldırır.\n- Benzerler ilk görünümde en çok beş eser; TMDB önerileriyle tamamlama ve daha fazla arama eklendi.\n- Kaynak bilgisi TMDB ipucunda; dosya/altyazı bilgisi menüde; ayrıntıda kalan süre gösterilir.\n- TMDB afiş etiketi sağ üstte ve diğer rozetlere alan bırakarak gösterilir; sağlayıcı açılma animasyonu belirginleştirildi."
  },
  {
    "version": "1.7.5",
    "text": "- Analiz seçenekleri iki eşit menü satırında; ayarlar ayrı görünümde açılır.\n- Sağlayıcı seçenekleri satır içinde yana açılır, alt metnin üstüne binmez.\n- Kaynak bilgisi TMDB bilgilerinin altına; Bilgileri düzenle üç nokta menüsüne taşındı."
  },
  {
    "version": "1.7.4",
    "text": "- Analiz odağı metni açıklığa kavuşturuldu; üç nokta menüsünde analiz ayarları ve internetsiz tarama toplandı.\n- Film sayfasındaki iki mükerrer kısayol kaldırıldı. Zevk tercihleri varsayılan kapalı; önem 5 üzerinden gösterilir.\n- Yenilik penceresi son görülen sürümden güncel sürüme kadar bütün kayıtlı değişiklikleri listeler."
  },
  {
    "version": "1.7.3",
    "text": "- İzledikten sonra ve sahne/kelime defteri mevcut tasarımda sekmelerle birleştirildi; kayıtlar ve oynatıcı defteri korunur.\n- Oyuncular Luna Analiz’in hemen üstüne alındı. Kalabalık sağlayıcı grupları üst üste dairesel logolarla açılır; bütün seçenekler erişilebilir.\n- Görüntü/Ses başlığındaki dikdörtgen zemin farkı düzeltildi. Yerel tarama ve genel sayfa tasarımı korunur.\n- Yerel, yayımlanmamış sürüm. Ayrıntı: docs/LUNA-1.7.3C-DEFTER.md. Push Claude’da; kurulum paketi veya temizlik yapılmadı."
  },
  {
    "version": "1.7.2",
    "text": "- Çarkta Görüntü/Ses sekmeleri; turuncu stüdyo düğmesi ve motor/model seçicili kompakt altyazı stüdyosu.\n- Alt mükerrer film defteri düğmesi kaldırıldı; üst düğmenin boş ipucu düzeltildi. Hatırlanan tercihler ve film serileri üç nokta menüsünden açılır.\n- AI token sayacı Hesaplar ve anahtarlar başına taşındı. Genel ayarlarda dilin yanında bağımsız izleme ülkesi ve tanıtım sonunda ülke sorusu eklendi.\n- JustWatch sonuçları ve önbelleği yalnız seçilen ülkeye aittir; farklı ülkeye geri düşmez. F11 bildirimi küçültülüp üst gezinme çubuğundan uzaklaştırıldı.\n- Yerel, yayımlanmamış sürüm. Kontroller ve sınırlar: docs/LUNA-1.7.2C-UI.md. Commit/push/release/kurulum paketi yok; push Claude’da."
  },
  {
    "version": "1.6.10",
    "text": "- Merge the cumulative beta source package over local 1.6.9C without reverting SQLite, Foliate, playback clock, native safety or lazy views.\n- Add saved library filters/comparison, browser tab groups and notebook improvements, assistant/taste/text fixes and native book/frame fixes.\n- Integrate 54 regression commands into npm test; preserve existing dependencies, identity and updater configuration.\n- See docs/LUNA-1.6.10C-PAKET-BIRLESIMI.md for taken/skipped changes and actual verification. No commit, push, installer or release."
  },
  {
    "version": "1.6.9",
    "text": "- Add SQLite persistence and subtitle FTS, SMTC, native gapless preparation and reusable metadata probe.\n- Add Foliate reader formats, reference alass/FPS alignment, Windows PGS OCR and AnkiConnect cards.\n- Add adblock, NFO matching, smart lists, rename preview/journal, hybrid filename parsing and Chromaprint skip candidates.\n- Add opt-in Syncplay, media server sources, stdio MCP, local live captions, recognition and vocal tool adapters.\n- Separate Music/Books/Mine/Taste views from runtime state, defer UI chunks, isolate the playback clock, add compiler/lint and regression coverage.\n- Add opt-in direct libmpv backend and local distribution/signing drafts. No DLL, SongRec/Demucs binary, installer, signing approval or release is bundled/claimed.\n- Details, feature limits and verification: `docs/LUNA-1.6.9C-UPGRADE.md`. GitHub publication remains with Claude."
  },
  {
    "version": "1.6.8",
    "text": "- Validate mpv commands/options/filter graphs and enable CSP. Preserve existing playback controls and sound filters.\n- Apply film resume and track preferences as file options; acknowledge native IPC commands instead of restore timers.\n- Bound mpv restarts, restore playback state, throttle UI timestamps without dropping PGS timestamps, and use stable cache keys.\n- Recover poisoned locks, avoid unchanged state writes, skip protected scan folders, and declare file associations.\n- Add optional NVIDIA/Intel VSR, six lazy panels, woff2-only fonts, a regression entry point and CI checks.\n- See `docs/LUNA-1.6.8C-HARDENING.md` for verification and unfinished roadmap items. No installer or release created."
  },
  {
    "version": "1.11.0",
    "text": "- **Replik ara (Ctrl+K, and on the home page):** type what was said (\"köprüde buluşalım\") and see every film and moment of your library where it is said, with the line before and after and your words marked. Case, Turkish letters and punctuation don't matter (\"koprude bulusalim\" finds \"Köprüde buluşalım.\"), a phrase split over two subtitle lines is found, and Enter plays the film from two seconds before the line. It reads the subtitle files beside your films (the Turkish one first, else English, else any; hearing-impaired and forced-only files last) and keeps them in memory for the session; subtitles inside the video file aren't read.\n- **Anime openings and endings (AniSkip, off by default):** for animation shows Luna asks AniList for the show's MyAnimeList id and AniSkip's community data for the episode, and the \"Skip intro\" button appears for the opening, the ending and the recap. It is strict so it never skips the wrong minute: the title must agree, later seasons are used only when an entry names the season, the answer's episode length must be within 15 s of your file, and anything you marked yourself or that the file's chapter names give wins. What is sent: the show's name, the episode number and its length. Settings › General.\n- **Comics:** CBZ files that carry a `ComicInfo.xml` are shown as \"Saga #12: Fire & Ice\" with the writer as author and the language set; comics without it are as before. Comics already in the library are read once more to pick this up.\n- **A year ago today (home page):** the films and episodes you finished on this day in earlier years, under the \"what to watch tonight\" card.\n- Native: `library_subtitles` (which subtitle file to read for each film).\n- Checks: `npm run test:library` (9 tests, the AniSkip answers are real ones) and 4 more Rust unit tests (ComicInfo fields and titles, subtitle ranking). Every new text has English.\n- Not in this version: gapless music playback (it needs a test against a real mpv), `.nfo` files, batch renaming, smart lists, an ad blocker, MCP client, server clients, live captions, vocal separation, song recognition. The Now Playing screen already has a blurred cover background, so a cover tint was not added."
  },
  {
    "version": "1.10.0",
    "text": "- **Luna Özet (Ctrl+K, and from the home page):** your year, last 30 days or all time as a short story: hours of films and music, the films and episodes you finished with their posters and your top genres, your diary's average and favourites, your most played artists and the hours of the day you listen (a 24-hour dial), the books you finished, and a heat map of the days Luna was open with your longest streak. A playful portrait sums it up (night owl, marathoner, bookworm, music lover, critic, explorer, dreamer). The last page draws a 1080×1350 card you can save as PNG or copy. Everything comes from what Luna already keeps on this computer; nothing is sent.\n- **\"Bu akşam ne izlesem?\" (home page):** tell Luna how much time you have and the mood you're in (tense, light, thoughtful, adventure, moving); it shuffles through your unwatched films and the next episode of shows you've started, picks one that fits, and says why (length, mood, rating, waiting for a while). \"Another one\" never repeats the last few picks.\n- **Quote cards:** the ❝ button on a line in the Lines panel (or Ctrl+K while a film plays) sets that line over a full-size frame of the moment it is said, in Literata italic, with the film's name and time. Three looks (cinema, poster, plain), 4:5 or 16:9, the accent colour taken from the frame itself; save as PNG or copy.\n- **Poster colours:** a film's page takes a soft tint from its poster.\n- **Scene grid** shows the line being said under each picture; the **clip maker** shows the first and last frame of the clip while you choose.\n- **Fix:** `Cargo.lock` now carries the crates 1.9.0 added (notify and the notification, global-shortcut and autostart plugins); before, Cargo added them on the first build.\n- Native: `still_frame` (a 1600-px frame as a data address, so the page can draw it) and `save_image` (only PNG or JPEG data with a matching file name; written to a temporary name, then renamed).\n- Checks: `npm run test:creative` (10 tests) and 2 more Rust unit tests (base64, picture data). Every new text has English."
  },
  {
    "version": "1.9.0",
    "text": "New in this version, on top of the merged 1.8.0CC:\n\n- **Luna and Windows (Settings › General):** close to the system tray (music, podcasts and radio go on; a film pauses), media keys that work in every program, start with Windows (to the tray), a library-folder watcher that refreshes films, music and books by itself and can start Whisper for new films without subtitles, and Windows notifications (Whisper finished, new files, a new episode today, backup) shown only while Luna is in the background. All of it is off until switched on. Whisper, downloads and batches show their progress on the taskbar button.\n- **Whisper:** speed presets (fast, balanced, quality), Silero voice-activity detection (skips silence and music, so fewer invented lines and a faster run; the 0.9 MB model is downloaded and verified on first use), and the film's names are carried through every window of the audio, not only the first. The command line now comes from a small tested core.\n- **Library health (Ctrl+K):** copies of the same file (size plus a hash of the first and last 64 KiB), sample clips, missing files, films without a subtitle file and films without a TMDB match. Nothing is deleted by itself; \"Delete…\" asks again and sends to the Recycle Bin. Films without subtitles can go to the Whisper queue in one click.\n- **Scene grid (Ctrl+G) and clip maker (X):** the playing film as a sheet of 36 pictures, and an MP4, WebM or GIF cut between two moments with mpv's own encoder (size cap 8, 25 or 50 MB, subtitles burnt in on request).\n- **Episode calendar (Ctrl+K and the home page):** the next episode of every show in the library from TMDB.\n- **Title pages:** the title's own logo when TMDB has one, and \"where to watch\" (JustWatch data through TMDB, with the source named).\n- **Sound and picture:** ReplayGain (track or album), AutoEq headphone correction from a ParametricEQ.txt file (works with the equaliser of the Sound panel), and smooth motion (frame interpolation synchronised to the display) in the video settings.\n- **Luna Web:** choose the search engine for the address bar (or your own address) and use bangs such as `!yt`, `!imdb`, `!w`; \"Open archived copy\" opens the Internet Archive's newest copy of a page.\n- **Books:** Atkinson Hyperlegible Next, Lexend and OpenDyslexic as reading typefaces.\n- Checks: `npm run test:shell-extras` (9 tests; the AutoEq filter strings are also run through ffmpeg when it is installed) and 7 more Rust unit tests (`shell_core`: folder classification, debouncing, the Whisper and clip command lines). Every new text has English.\n- Not in this version (suggested in the ideas list): ComicInfo and CBR comics, gapless playback, `.nfo` files, batch renaming, smart lists, year-in-review, AniSkip, an ad blocker, MCP client, server clients, live captions, vocal separation, song recognition."
  },
  {
    "version": "1.8.0",
    "text": "Two work streams merged into one tree: the subtitle studio and skipping (1.7.0–1.7.1CC, below as \"part A\") and the playback extras (sound panel, SponsorBlock, scrobbling, podcast chapters, fast reading, command palette, Trakt, Discord; \"part B\").\n\n- **One SponsorBlock, one sound panel:** the earlier music-only SponsorBlock switch and the \"night mode\" menu item of part A were removed; part B's versions (films and songs, categories, ask-first, coloured seek-bar marks; per-part sound profiles with night mode, balance, clear speech and the equaliser) replace them.\n- `StudioExtras.tsx` (part A's Settings cards: auto-skip, diagnostics report) was renamed from `PlaybackExtras.tsx`, which part B uses for the sound and SponsorBlock settings.\n- Checks: `npm run test:subtitle-studio` and `npm run test:extras-plus` both pass on the merged tree."
  },
  {
    "version": "1.7.1",
    "text": "The subtitle studio, finished. Checked with the isolated UI fixture (screenshots in the delivery), the regression scripts and `cargo check`; not run in a real Windows Luna window yet.\n\n- **A studio that explains itself:** a rail on the left with each tool and its state (progress, \"needs a file\"); Create is three numbered steps. Engines and models are cards: speed and accuracy, \"Recommended\", \"In use\", the download progress inside the card, \"Use this\" for what is installed. Time left is shown for downloads, audio and transcription.\n- **Better Whisper subtitles:** the title and the cast's character names from TMDB go to Whisper as its prompt (plain ASCII only, which whisper-cli can read), so names are spelled right; lines Whisper makes up in silence or music (\"Thanks for watching\", \"Altyazı M.K.\", amara.org credits, subscribe requests, loops of the same line) are removed and counted. \"All episodes without subtitles\" / \"Only this video\" in one click.\n- **Whisper pill:** while Whisper works, a small ring with the phase, percent and time left sits in the player's top bar; a click opens the studio.\n- **Translation:** \"Natural\" or \"Close to the original (for learning)\", how many requests it will take, the latest translated lines side by side as they arrive, and after Stop \"Carry on where it stopped\".\n- **Sync you can see:** a strip shows where the speech is in the audio, where the lines are now and where they go after the fix (a movable 90-second window), a match meter and the overlap with speech before and after. \"Preview in the video\" tries it without saving; closing the preview puts the old timing back.\n- **Clean-up with every change listed:** each fix shows how many lines it alone would change; the lines that will change are listed (removed, new text, longer display).\n- **Transcript:** the second subtitle under each line, \"Follow playback\" and \"Back to now\", keyboard (↑ ↓, Enter to go there, E to edit), export as text or Markdown (Obsidian) with both languages, explanations remembered per word and line, \"In the notebook ✓\".\n- **Skip intro:** a thin line in the button shows how much of the part is left.\n- Fix: a label rule of Luna's dialogs stacked the clean-up options vertically; they are rows again.\n- `npm run test:subtitle-studio`: 26 tests (was 21); `studio_core`: 12 unit tests."
  },
  {
    "version": "1.7.0",
    "text": "Subtitle studio and playback extras. Checked with the isolated UI fixture, the regression scripts and `cargo check`; nothing here has been run in a real Windows Luna window yet.\n\n- **Subtitle studio** (Audio & subtitles › \"Subtitle studio…\", the right-click menu, or \"Make from the audio…\" in the subtitle search window):\n  - **Create:** local Whisper transcription with whisper.cpp. Download the engine (processor build 4 MB, NVIDIA CUDA 12 build 457 MB; pinned to v1.8.4 and verified by size and SHA-256) and a model (tiny … large-v3-turbo), or point Luna at your own `whisper-cli.exe` and `.bin` model. One video or the episodes of a series that have no subtitle go into a queue that keeps running when the window is closed. The result is written next to the video as `Film.<language>.srt` (never over an existing file), long segments are split into readable lines. Nothing is sent anywhere.\n  - **Translate:** the subtitle in another language with the assistant's AI: 40 lines at a time with the lines before and after as context, character names from TMDB kept, timing unchanged, each answer checked (only the asked ids, missing lines keep their text), a stopped run can be kept. The translation can be shown as a second subtitle.\n  - **Sync:** Luna listens to the video's audio once, finds where speech is and lines the subtitle up with it: the delay and 23.976 / 24 / 25 fps mix-ups (`sub-delay` and `sub-speed`), remembered per file. It shows how sure it is and how much of the subtitle falls on speech before and after.\n  - **Clean up:** hearing-impaired notes, speaker labels, song lines, overlaps, lines shown too briefly to read, long lines, repeats. SRT and VTT are changed in place after a copy of the original is kept in Luna's cache; an ASS file is left alone and a cleaned SRT is saved beside it.\n- **Transcript panel (R):** every line of the subtitle with search, click-to-jump, the current line followed, click a word to ask what it means in that line (assistant's AI), add it to the vocabulary notebook or copy it; SRT/VTT lines can be edited. For embedded subtitles the lines seen while watching are kept instead.\n- **Second subtitle:** pick one in Audio & subtitles (mpv's `secondary-sid`). The main subtitle is now found as the selected track that is not the second one, so the remembered choice for a video can no longer be the second subtitle by mistake.\n- **Skip intro (I):** from the video's chapter names (Intro, Opening, Recap, Previously, Credits, Preview and the Turkish equivalents) or from an intro you marked once for a series (right-click › Intro mark). Settings › General can skip each kind by itself.\n- **SponsorBlock in YouTube songs (music, off by default):** skips non-music parts and sponsor talk. Only the first 4 characters of the video id's SHA-256 are sent to sponsor.ajay.app (their privacy lookup); the data is CC BY-NC-SA 4.0.\n- **Night mode** (right-click › Audio): evens out quiet speech and loud effects; it can start on for every film (Settings › General) and is removed again for music.\n- **Picture:** \"High-quality scaling\" and **Anime4K** (Fast / High quality) in the video panel; the shaders (0.8 MB, v4.0.1) are downloaded on request and verified. No Lossless Scaling needed.\n- **Assistant:** while a film plays it also gets the subtitle lines shown so far (never later lines; no claim to see the picture or hear the sound), and the lines seen while watching for embedded subtitles.\n- **Automatic backup** (Settings › Backup): a folder, daily or weekly, how many to keep (3–30). Choose a OneDrive / Google Drive / Dropbox folder and it reaches the cloud by itself. Only Luna's own `Luna auto-backup …json` files are ever removed (to the Recycle Bin).\n- **Vocabulary notebook:** export for Anki (tab-separated text with header lines).\n- **Settings › General:** a diagnostics report to copy into a bug report (versions, mpv/Vulkan, Whisper and shader setup, the chosen AI service, storage size; no keys, no user name).\n- **Safer files:** new subtitles are written through a temporary file and renamed; downloads are size- and hash-checked and deleted when cancelled or incomplete; archive entries are flattened to checked names.\n- Windows user names with letters outside plain ASCII: Whisper's command line is given 8.3 short paths (or `C:\\Users\\Public\\Luna-Studio` for its temporary files); when that is impossible the message says which folder to use.\n- New: `npm run test:subtitle-studio` (21 tests) and `studio_core` unit tests (11, `cargo test`).\n- Not in this version (suggested earlier): podcast transcripts, Whisper lyrics for songs, OCR for picture subtitles, watching together, page/comic/PDF translation, LibriVox audio–text alignment."
  },
  {
    "version": "1.8.0",
    "text": "- **Sound (films):** a new button in the player bar opens Sound: three effect tiles (balance, night mode, clear speech), a 10-band equaliser drawn as a curve you drag (or set with the arrow keys; double-click flattens a band) with 9 presets, and an A-B loop that stays when the panel closes and is marked on the seek bar. Films and music keep separate settings. Only Luna's own labelled mpv filters are added or removed, so other filters stay.\n- **Sound and sleep timer (music):** a button on the Now playing screen with the same equaliser and a sleep timer (15, 30, 45 minutes, 1 hour, or when the song ends) that fades the music before it pauses.\n- **SponsorBlock:** YouTube links (films and songs) skip the parts the SponsorBlock community marked (sponsor, self-promotion, reminders, music-video parts without music…). Choose the categories and automatic or ask-first in Settings › Playback and connections. Only the first 4 characters of the video id's SHA-256 are sent; a skipped part shows \"Undo\".\n- **Scrobbling:** ListenBrainz (token, own server possible) and Last.fm (own API key and secret; the password is used once and not kept). A listen counts after half the song or 4 minutes; radio, podcasts and audiobooks are never sent. Keys and sessions are kept in Windows' credential store; listens that could not be sent wait and are sent later.\n- **Podcast chapters and transcript:** episodes whose feed carries `<podcast:chapters>` or `<podcast:transcript>` (Podcasting 2.0) show the chapters (click to jump) and a searchable transcript that follows the voice, in \"About this episode\".\n- **Fast reading (EPUB):** a button in the reader shows one word at a time at a steady pace (150–900 words/min) with the recognition letter marked; it starts on the page on screen, goes on into the next chapter and the book turns to the word reached when it closes.\n- **Command palette (Ctrl+K):** go to any part, open a film from the library (with its poster), run common actions or ask the assistant; recent choices come first, groups stay together, Turkish and English words both find a place.\n- **Trakt:** films and episodes from the library show as \"watching\" on Trakt while they play and are marked watched past 80 %. Sign-in with a code on trakt.tv (device flow) using the user's own Trakt app; tokens in Windows' credential store, refreshed before they run out.\n- **Discord:** optional \"Watching / Listening to\" presence through the Discord app on the computer (the user's own application id); off by default.\n- **Seek bars:** SponsorBlock parts are drawn in their category colour on the film and music bars.\n- **Assistant:** `/karşılaştır question` asks the same question to the saved API profiles and shows each answer with its time; `/komut` adds, lists and deletes your own commands (`/komut ekle özet3 = Summarise: {metin}`), also manageable in Settings. Your commands appear in the \"/\" list.\n- **Native:** `http_send` (GET/POST for ListenBrainz, Last.fm and Trakt; https or this computer only, only Authorization, Content-Type and Trakt's two API headers, no redirects, answer cut at 64 KB) and `discord_presence` (Discord's local pipe, Windows).\n- Checks: `npm run test:extras-plus` (20 tests), also in CI; Rust unit test for the allowed addresses. Every new text has English."
  },
  {
    "version": "1.6.0",
    "text": "- Books and music get the films' full taste profile in a \"My taste\" tab (taste map, weights, genres/authors/artists, rating spread or listening hours, most played, gaps).\n- Songs: thumbs-up / thumbs-down on every row and \"out of 10?\" after a vote; the points feed the music taste.\n- Liked or disliked books and songs get six-topic scores and genres from the AI once (twenty per message, only new ones, \"Measuring…\" while it runs); films unchanged.\n- Own Letterboxd updates itself daily and follows changed or removed ratings and hearts; missing genres from TMDB; update button on the taste profile.\n- Same tab order in every part; the assistant shows a song playing on another part's page and lets you pick it or a general chat.\n- \"Find songs like this\" opens a songs card (new list or grow an existing one); reader music popup has a volume drop-down and popups fade out.\n- Luna Analiz: settings, Stop and the running button in order; smoother reading animation. Big player: the assistant stays above the timeline; mouse back closes it."
  },
  {
    "version": "1.5.4",
    "text": "- Separate book and music taste, own lists only in \"+ Add to list\" with a new list, friends' lists read-only, picture gallery, poster preview, share/import lists, podcast fixes."
  },
  {
    "version": "1.5.1",
    "text": "- Luna Analiz: real half stars; similar titles open their page; Luna-style switches; (i) explains My taste; a settings button (how many reviews, spoilers in or out); the Settings card restyled.\n- \"+ Add to list\": lists grouped under each friend, with search.\n- Recommendations: \"All films\" for a friend (all their lists and picks in one wall).\n- Your taste profile: taste map, weights and where they come from, avoided topics, genres, rating spread, what stands out in liked titles, trends across analyses, how generous you rate, gaps, latest analyses.\n- Books: Luna Analiz reads 1000Kitap reviews; \"In-depth review\" asks the assistant for reviews, videos, essays and thinkers' readings with sources.\n- Music: volume in the big player; \"Liked\" always first; playlists get a picture from their songs; Spotify import can be stopped or cancelled; \"playlist of songs like this\".\n- Assistant: a bubble at the bottom right (hidden while a film plays), minimise button, right-click Copy / Ask on selected text (and Cut/Copy/Paste in text boxes), \"/\" commands with /help that work with every AI, a tool-less retry for models that reject tools.\n- .m3u / .m3u8: IPTV lists open as a channel list; HLS streams play directly."
  },
  {
    "version": "1.5.0",
    "text": "- **\"Worth watching?\" is now Luna Analiz**, laid out like the rest of the details page: a plain section with Luna's headings, chips and the mode's colour instead of a boxed card. Big \"For you\" score next to Luna Analiz, review tone, TMDB and Letterboxd; agreement with bars; praise and criticism; topics with score bars.\n- **Long reviews are read whole:** Letterboxd cuts long reviews short in its lists (about 470 characters); Luna now fetches the rest. In the feed they open with \"Read more\"; spoilers stay hidden behind \"show\".\n- **My taste (was \"Preferences\")**, built like the shared review-analysis app: the importance you set counts 35%, the topics you marked as reasons in titles you liked count 65%, the reasons for dislikes pull a topic down. The \"For you\" score blends the community score with these, and says why (\"Pace is very strong, and it matters to you\"). Each topic shows its effective weight, where it was learned from and this title's score; \"Apply\" takes the suggested importance.\n- \"After watching\" (reasons, note, draft) and the local keyword scan are tidy fold-out sections under it."
  },
  {
    "version": "1.4.9",
    "text": "- **\"Worth watching?\" › Letterboxd, live:** the reviews scroll into the card one by one as they are fetched. The AI then reads them in groups of ten: the group being read lights up, and each review gets its tone, topic and a one-line gist. Spoiler reviews stay blurred until clicked. \"Stop\" cancels.\n- **A much more detailed analysis** (the method of the shared \"review analysis\" app):\n  - AI score with what pulls it up and down, and a community score from the reviews' tone and depth plus the stars;\n  - what most reviewers agree on, with shares, and where they split;\n  - a critic's note, themes, feelings, who it is for, similar titles, a score per topic;\n  - the positive / mixed / negative / no-stance split, and every review read, filterable by tone.\n- **Taste learning:** each analysis keeps the topic scores. Once three analysed titles are liked or disliked, Luna suggests preference weights (\"Apply\"), shows \"Fits your taste %\", and the analysis and the assistant use it.\n- **API profiles** (Settings › Accounts and keys): save several services with their own key, model and base URL (up to 8). The assistant and the review analysis can each use a profile. Keys stay in Windows' credential store.\n- \"Worth watching?\" is now also on Discover and recommendation pages."
  },
  {
    "version": "1.4.8",
    "text": "- **AI connection fixed:**\n  - OpenAI and Claude sometimes failed with \"Couldn't reach the assistant … error sending request\".\n  - The cause: Luna checked the servers' certificates only against the list built into the program, and those servers now also use a newer issuer that the list lacks.\n  - Luna now also trusts Windows' own, always up-to-date certificate store.\n  - The error message now shows the real cause (certificate, timeout…)."
  },
  {
    "version": "1.4.7",
    "text": "- **\"Worth watching?\" › Letterboxd + AI:** one button fetches the film's most popular Letterboxd reviews (50 by default) and has an AI sum them up for you:\n  - the overall feeling, a \"for you\" paragraph from your preferences, what is praised and criticised, \"you'll like it if / skip it if\", and a note per topic;\n  - the average star rating and the number of spoiler reviews;\n  - the same reviews also go to the local keyword scan.\n  The AI is told not to reveal spoilers and to use only what the reviews say.\n- **Settings › Accounts and keys › Review analysis:**\n  - its own AI (Gemini, OpenAI, Claude, a base URL, or the same as the assistant) and model;\n  - how many reviews to fetch (10–100);\n  - an extra instruction.\n  It uses the keys already entered for the assistant.\n- Letterboxd turns away Luna's own connection on review pages, so they are read with Windows' built-in curl.exe; the film is found by its TMDB id, or by title and year.\n\n﻿## 1.4.6CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)\n\n- **\"Worth watching?\" workspace** in film/series details (library and the assistant's film card):\n  - paste or import reviews (TXT/JSON);\n  - a local keyword scan by topic: story, pace, acting, visuals, characters, music. The community score and your own signal stay apart.\n  - film and series preferences, mood weights and warnings;\n  - like/dislike with reasons, a history of 8 scans, and a review draft from your notes;\n  - JSON export.\n- **Music:**\n  - pausing while a YouTube link resolves keeps it paused;\n  - stale retries and skips can no longer start another song;\n  - a bad start index is clamped.\n- **Read aloud:**\n  - volume and mute in the bar;\n  - the assistant's volume and mute commands reach the reading voice;\n  - bad speed or voice settings are cleaned;\n  - a voice error stops reading instead of skipping text;\n  - no restart after Stop.\n- **Books:**\n  - notes are kept per file, so two editions don't share notes. Old notes are kept and can be copied on request.\n  - a failed save keeps the editor open and shows an error;\n  - broken notes can't crash the reader;\n  - a stale book search doesn't show old results.\n- **Dependency:** @xmldom/xmldom 0.8.15 for epubjs (npm audit: 0).\n- **Checks:** 32 more regression tests (`npm run test:next`), also in CI."
  },
  {
    "version": "1.4.5",
    "text": "- **Fixes package (B01–B36):**\n  - Backup and restore: a wrong-shaped backup, a full storage or a failed save no longer wipes or half-restores data.\n  - API keys: saving and deleting a key now waits and shows an error when it fails.\n  - Collections: same title in two years, the chosen episode, the right book, YouTube songs, renames and a slow search after a delete.\n  - Updates: beta and auto-check switches respected; a retry after a failed download works.\n  - Read aloud: pause, speed, voice, stop at chapter end and resume; only listened time counted.\n  - YouTube: a broken direct link falls back instead of looping.\n  - Letterboxd: real addresses only; remakes kept apart; star values checked; posters not mixed up.\n  - Torrents: cancelling no longer deletes files.\n  - Wikisource: safe decoding, valid long chapters, and a failed chapter stops the save.\n- **Library:**\n  - Sort by A–Z, year or rating; filter by genre, unmatched or several copies.\n  - Collection search.\n  - Letterboxd lists: friend-rating filter and a link to the list.\n- **Checks:** 37 regression tests (`npm run test:regression`), also run by CI."
  },
  {
    "version": "1.4.4",
    "text": "- **Small window:** leaving full screen (or playing in a small window) no longer blows the window back up to the size of the screen. 1.4.3 checked \"is the window inside the screen?\" on every resize, and leaving full screen briefly reports a screen-sized window; the check now runs once, when Luna starts."
  },
  {
    "version": "1.4.3",
    "text": "- **Same look on every screen:** on screens narrower than 1920 points (e.g. Windows scaling 125% or 150%) Luna zooms out a little, so text, spacing and the top bar sit as on a 1920-wide screen (Settings › \"Fit the layout to the screen\"). The top bar's labels fold away step by step only when the tabs don't fit.\n- **Above the taskbar:** a window that was restored taller than the screen is shrunk and moved back into the space above the taskbar (the assistant's input was hidden under it). Luna opens full screen the first time on a machine.\n- **Full screen:** the ⛶ / ✕ buttons wake only at the very top edge, so they no longer cover the \"Recommendations\" tab.\n- **Assistant:** opens as the big workspace (Escape shrinks it only for the moment); the small bubble has the same ⋯ menu by each title (Watched, Liked, Disliked, Watch later, Trailer) instead of the old tick box.\n- **Assistant with OpenAI / Claude / base URL:** a message mentioning Letterboxd is no longer pushed to the \"film links\" tool; the assistant is told the addresses of your own and your friends' Letterboxd (it can read them again with read_link) and what data it has (notes, diary, lists); trivia questions keep Luna's tools (no Google search outside Gemini); a required tool is the only one offered."
  },
  {
    "version": "1.4.2",
    "text": "- A clean rebuild of 1.4.1's code (every build file made anew); checked that the interface inside the program is byte for byte the one Luna Dev runs.\n- GitHub: every push and pull request is built and tested (CI), and each release is checked live (downloads, checksums, the updater's latest.json); the services Luna uses are checked daily."
  },
  {
    "version": "1.4.1",
    "text": "- **Letterboxd › all their films:** a friend's whole \"Watched\" list comes in as its own tab (before, only the films they rated 4★+ did); friends connected earlier get it on \"⟳ Update\". A person with only Letterboxd lists opens on them, not on an empty \"Recommendations\" tab (that tab only shows when someone typed a recommendation for them).\n- **Hide what I watched:** if Luna doesn't know yet what you watched, it says how to connect your own profile (\"This is my profile\")."
  },
  {
    "version": "1.4.0",
    "text": "From testing with a friend.\n\n- **Home › where are your films?** With no library folder yet, the home screen asks for one right away (\"Choose film folder\" / \"Choose series folder\" open the folder picker). Before, the button only led to the Folders page.\n- **Folders › films and series apart:** the Folders page has \"Film folders\" and \"Series folders\", each with its own add button; a folder can be moved between the two. In a series folder each show is its own folder, a \"Season 2\" / \"Sezon 2\" folder is the season, and \"03 - Pilot.mkv\" or \"Bölüm 3\" is the episode, even without S01E03 in the name.\n- **The same film twice:** copies of one film (a 1080p and a 4K, or two file names TMDB matches to the same film) sit side by side in the grids and the poster says \"2 copies\". The details page lists every copy with its quality, subtitles and size; the chosen one is what Play plays (the last watched copy first).\n- **SRT next to the quality:** a video with a subtitle file beside it (\"Film.srt\", \"Film.tr.srt\") shows \"SRT\" next to 1080p / 4K on the cards and the details page.\n- **Rename a file in Luna:** right-click › \"Rename file…\" renames the video on disk; its subtitle files get the new name too, and where you stopped, its quality and \"finished\" stay. The assistant can do it as well (\"rename that file to Alien (1979)\"), asking first.\n- **Full screen:** F11 now also works on the library screens (before only during a film), and each time Luna goes full screen, at start too, a small note at the top left says \"Full screen · F11 to leave\" for a few seconds.\n- **Collections window:** the posters behind showed sharply through the glass. The page behind is now blurred, as under the assistant.\n- **The assistant's AI:** besides Gemini, OpenAI, Claude, or any OpenAI-compatible server at a base URL (OpenRouter, Groq, DeepSeek, a local Ollama / LM Studio without a key). Settings › Accounts & keys: pick the service, the key and the model (the list is loaded from the service). All of Luna's tools work with them; Google Search stays Gemini-only, so such answers are marked \"no sources\".\n- **Letterboxd:**\n  - the link box takes a user name, \"@name\", \"letterboxd.com/name\" or a full link (a page with a query or a \"www.\" no longer fails); an unknown user says so;\n  - while a profile is read, a card shows what is being read (\"Watched: page 3 · 214 films\", \"List 4/12…\") and for how long, instead of a silent wait of a minute or two;\n  - \"This is my profile\": your own watched films (with your stars), likes and watchlist are saved in Luna (the diary and \"Watch later\"), and \"⟳ Update\" refreshes them;\n  - \"Hide what I watched\" on friends' recommendations and their Letterboxd lists hides the films you already watched (ticked, rated or on your Letterboxd); it remembers the choice.\n- (Dev: the browser mock can add folders, rename, read Letterboxd with progress and answer as OpenAI / Claude.)"
  },
  {
    "version": "1.3.9",
    "text": "- **Books › no second copy:** a free book that is already in the library (asked for from the open-libraries row or by the assistant) is opened from the library instead of being downloaded again as \"… (2).epub\". Its card says \"In your library · read\".\n- **Audiobooks › only audiobooks:** the most-listened row showed LibriVox's cover-art picture sets (\"Thumbs 12\", \"LibrivoxCDCoverArt…\"); only recordings are listed now, and a book read more than once shows its most listened reading (a search still shows every reading).\n- **README:** new pictures (music, books, the assistant asking which one) and the text covers music, books, collections and updates."
  },
  {
    "version": "1.3.8",
    "text": "Bug pass.\n\n- **Header › all tabs on a laptop:** at 1280–1400 px wide the seventh film tab (Öneriler) was cut off and hidden. The tabs sit closer there and \"Dosya aç\" keeps only its icon (with its tooltip), so all of them fit. On narrower windows the tabs still slide sideways, but now the mouse wheel moves them, a fade at the edge shows more are waiting, and the open tab is brought into view (before, with no scrollbar, some tabs couldn't be reached by mouse).\n- **Music › a song that won't open:** a missing or broken file left the bar at 0:00 showing \"Pause\" as if playing, and the queue stopped there. Now it is skipped after the \"couldn't open\" warning, and the next song plays. After 3 in a row (for example a drive unplugged), or at the end of the queue, Luna stops and pauses instead of running through the rest. A radio station that fails just stops.\n- **Player › panels:** the Upscaler panel stayed open under the audio/subtitles or video-settings panel and the two overlapped. Now opening one closes the others, and the Upscaler panel closes on a click outside it like the rest.\n- **Player › Esc:** with a panel or menu open, Esc closed the whole film. Now the first Esc closes the panel, the next one leaves the film.\n- **Esc closes windows:** Esc now closes the window on top everywhere, as a click beside it does. Before, many didn't close on Esc (open link, subtitle search, confirmations, the music link…). A window over the film or a book closes alone; the film keeps playing.\n- **Reader › comics in Luna Dev:** CBZ comics stayed on \"…\" and never showed a page in the development build (React's double mount left a \"closed\" flag set). The installed build wasn't affected.\n- **Reader › Esc in the search box:** closes the panel now (a note being written is still not thrown away by Esc). The contents button opens on the contents again, not on the last search."
  },
  {
    "version": "1.3.7",
    "text": "- **Tour › no release file name:** the library step no longer shows a film's release file name (\"Dune.Part.Two.2024.1080p.mkv\"); it says \"Filmler klasörü taranıyor…\" instead.\n- (Checked: the tour's posters show without a TMDB key, since TMDB's image server needs none; only an internet connection.)"
  },
  {
    "version": "1.3.6",
    "text": "- **Tour › real posters:** the films the scenes name show their own posters (Prisoners, Zodiac, Dune 1984, Blade Runner 2049 on the picture-quality step), and with an empty library (a first run) well-known films fill the shelves. Shown from TMDB's image server like the library's, nothing copied into Luna. None on the torrent step, and the content-warning step uses no real film.\n- **TMDB credit:** the notice TMDB's API terms ask for is in Settings › General (under the version) and a small \"posters from TMDB\" line sits under the tour's step counter."
  },
  {
    "version": "1.3.5",
    "text": "- **Tour › the whole of Luna for someone new:** 16 steps now. Added: Picture quality (Lossless Scaling driven by Luna: a sharp/soft split moving over a picture, 60 → 120 FPS, subtitles kept sharp; Q and the UP button), History and safety (one history of films, songs and books, a backup in one file, signed updates) and Shortcuts (Alt+A for the assistant first, then Ctrl+O, Ctrl+N, Space, F, ← →, Ctrl+→, Alt+←, Esc, lighting up in turn). The film assistant step now sits with the film steps.\n- **Tour › Alt+A:** both assistant steps say the assistant opens from any screen with Alt+A.\n- **Tour › what's new:** the short tour for people who saw the old one also gets History and safety and Shortcuts."
  },
  {
    "version": "1.3.4",
    "text": "- **Tour › the whole of Luna:** the first-run tour now shows all of it, 13 steps: a new welcome (the three parts circling the mark), \"Film, Müzik, Kitap\" (the switch moving between the parts in their colours), Music (synced lyrics lighting up, the music bar, radio / podcasts / likes), Books (a page read aloud word by word, Gutenberg / Vikikaynak / LibriVox), the assistant everywhere (the \"Hangisi hakkında?\" chooser, a web search, ready questions) and Collections (research steps, the confirmation card with ticks, \"Çıkması bekleniyor\"). Music and Books slides take their part's colour; new steps carry a \"Yeni\" badge.\n- **Tour › what's new, once:** someone who saw the older tour gets a short \"Yenilikler\" tour of only the new steps the next time Luna opens. Settings › \"Tanıtımı göster\" still shows the whole tour."
  },
  {
    "version": "1.3.3",
    "text": "- **Assistant › from the \"now playing\" screen:** the assistant opened over the full song screen is about the song: it comes first in the chooser (picked), the header shows its name and the ready questions are about it."
  },
  {
    "version": "1.3.2",
    "text": "- **Assistant › two things open at once, you pick:** the assistant now sees everything open at the same time — the film or episode playing, a film page, a book in the reader or its page, the song, radio or audiobook playing — in every part of Luna. When two or more are open, a small \"Hangisi hakkında?\" row above the message box lets you pick which one the chat is about (\"bu\", \"bunu\" then mean that one); it appears only then. A message that names one (\"çalan şarkı…\", \"izlediğim film…\") picks it by itself.\n- **Assistant › the song in the film part:** with only a song playing, the film part's assistant knows it too (before, only the music part did)."
  },
  {
    "version": "1.3.1",
    "text": "- **Collections › a book added by hand finds your shelf:** a book typed into a collection (\"＋ Ekle\" › Kitap) that is already in your library is matched to it (its full title, cover and author), so it opens from the collection."
  },
  {
    "version": "1.3.0",
    "text": "- **Music › the bar is whole again:** the heart had a column of its own in the music bar, so the lyrics button, the volume and the close button were pushed onto a second row out of sight and the controls sat at the right edge. The heart now sits beside the song; the controls are in the middle and the volume is on the right again.\n- **Music › narrow window:** the volume stays (shorter) instead of disappearing; only the lyrics button is hidden."
  },
  {
    "version": "1.2.9",
    "text": "- **Collections › no more see-through layers:** while the big assistant is open over the collections, the collections page waits hidden behind it (two glass panes showed through each other); it is back when the assistant closes or shrinks.\n- **Collections › the real music bar:** instead of the small bar of 1.2.7, Luna's own music bar (seek, volume, shuffle, repeat, like) shows over the collections page while music plays, and the page moves up to leave it room.\n- **Collections › the Google button** shows Google's coloured \"G\" instead of a plain letter."
  },
  {
    "version": "1.2.8",
    "text": "- **Assistant › an existing collection first:** asked for a collection on a subject you already have one on (\"Dune\" → \"Dune Evreni\"), the assistant makes nothing new: it says you have it (and what's in it) and offers to look again for new and missing things. A \"yes\" (or \"look again / update\" in the request) searches the internet again and adds only what the collection doesn't have yet to the same collection; if nothing is new it says it's up to date."
  },
  {
    "version": "1.2.7",
    "text": "- **Collections › the assistant opens over the page:** \"find\", \"what is it about\", \"let the assistant add\" no longer close the collections; the assistant (big or small) opens on top and closing it brings you back. Esc closes the assistant first.\n- **Collections › buttons instead of words:** each row has small buttons: play / read / download, **G** (search it on Google), the YouTube trailer (films and series) and ✦ (let the assistant find it). The right-click menu has Google and the trailer too.\n- **Collections › add by hand:** \"＋ Add\" (and \"Add by hand…\" in Edit) opens a small form: film/series, song or book, its name, year / artist / author and a note. A song is looked up on YouTube so it plays; a film in the library is joined to it. A new empty collection opens with the form ready.\n- **Collections › music plays with the page open:** a song plays with the collection's other songs after it, and a bar at the bottom of the page shows what's playing (previous, pause, next, \"Go to music\").\n- **Menus and the small assistant stay sharp and on top:** they were inside the part of Luna that a full-screen page blurs, so the Edit menu came up blurred behind the collections. They now open above everything.\n- A book or a film opened from anywhere (the assistant too) closes the collections page, so it doesn't stay on top of the reader or come back after the film.\n- **Subtitles:** a failed OpenSubtitles search or download is tried four times (a short wait between) before the error is shown; a wrong key or the daily limit is shown at once."
  },
  {
    "version": "1.2.6",
    "text": "- **Assistant › collection films checked on TMDB:** before the confirmation card every film is looked up on TMDB; when it belongs to a series (Dune: Part One → Dune Collection) the series' missing films are added, the newest and the announced ones too. A film whose date is still ahead is marked \"Expected: <date>\"; one whose date has passed but isn't marked released is searched by name on Google (\"has it come out?\") and is added as out or as expected by the answer.\n- The internet research before a collection follows the same rule for announced films."
  },
  {
    "version": "1.2.5",
    "text": "- **Assistant › collections are researched on the internet first:** before making a collection the assistant runs a Google search for the subject (every book, every film and series with its release status, the best-known soundtrack pieces) and builds the list from that, not from memory, so new films and books are in. Announced but unreleased ones are added with \"coming: <date>\". If the search can't be used, nothing from memory is passed off as a search.\n- **The assistant knows today's date** (it's in every request now), so it knows its own knowledge may be older than what has come out."
  },
  {
    "version": "1.2.4",
    "text": "- **Assistant › collections follow your words first:** \"the new films\" means only the new adaptations (no old ones), \"films\" means no series, a director, year or genre narrows it; it is complete only inside what you asked for, and the songs come only from what made it in.\n- **Collection confirmation has ticks:** every film, song and book on the card has a checkbox (all ticked); untick what you don't want and only the rest is saved. The count per group shows how many are kept, and the assistant is told what you took out so it doesn't claim or suggest them again. Unticking everything is the same as Cancel."
  },
  {
    "version": "1.2.3",
    "text": "- **Assistant › collections are complete:** unless you set a limit, a collection now holds every book of the series or universe (in order, other authors' sequels and prequels too), every film and series adaptation (old ones, miniseries, spin-offs; nothing unreleased), and for each of them the 3–5 best-known soundtrack pieces one by one with their composer (not album names), so they play. For any subject, not only Dune.\n- Songs and free books for a long collection are looked up six at a time (up to 80 items) instead of all at once."
  },
  {
    "version": "1.2.2",
    "text": "- **Assistant › collection confirmation names everything:** before saving, the card lists each film, song and book by name (with year or person and the assistant's note), grouped, instead of only \"2 films, 2 songs, 2 books\"."
  },
  {
    "version": "1.2.1",
    "text": "- **Assistant › collections, fixed again:** a collection request that also mentioned \"soundtrack\" (or another behind-the-scenes word) was sent to a Google search, which has none of Luna's tools, so the assistant said it couldn't make the collection. Only the exact spelling \"koleksiyon\" was caught before; now typos (\"koleksion\"), lists and any \"make / add / gather / download / take me\" request always go to Luna's tools."
  },
  {
    "version": "1.2.0",
    "text": "- **Assistant › take me there (new):** \"take me to Discover\", \"open the radio\", \"show my collections\", \"my history\", \"settings\"… the assistant closes and Luna opens that page in the right part (film, music, books).\n- **After making a collection** the assistant closes and the collection opens, so you see it at once (the answer stays in the chat).\n- The assistant's working steps are back as before (each shows at once; no waiting at the end)."
  },
  {
    "version": "1.1.9",
    "text": "- **Assistant › collections, fixed:** since 1.1.7 a request with Luna's tools failed (the collection tool's nested list was likely refused by Gemini), so the assistant answered without tools and wrote the collection out as text without saving it. The tool now takes plain lists (\"Name | year or person | note\"). If the tools still fail, the note under the answer says so with the real error (\"Luna's tools couldn't be used, nothing was done …\") instead of \"Google search couldn't be used\", and the assistant no longer pretends it did something.\n- **Collections keep names and join what can be had:** films and books not on disk are saved by name; songs are looked up on YouTube so they play from the collection; for books a free edition is searched (Vikikaynak, Project Gutenberg): the item then says **Download**, and a click brings it into the library and opens it. Nothing is downloaded without that click."
  },
  {
    "version": "1.1.8",
    "text": "- **Books › Discover › Vikikaynak (Turkish, new):** Turkish works out of copyright from Turkish Wikisource (Sabahattin Ali, Ömer Seyfettin, Halit Ziya, Nutuk…), legal and free. Luna turns the work's pages into an EPUB with chapters and a contents list (long works take up to a minute).\n- **The assistant looks in every free source at once:** Project Gutenberg, Vikikaynak and the catalogs you added, then shows the best match on the \"Is it this one?\" card with where it was found. If nothing free has it, it says so and doesn't point to pirate sites.\n- **Assistant:** asking for a collection with \"soundtrack\" in it no longer turns into a web search that only writes the list as text (it really makes the collection now); while it gathers a collection, the film reel, sound bars and page-flip animations play in turn; each step stays on screen a moment (the work itself isn't slower).\n- Ready questions are ordered longest first so the chips fill the rows tidily, in both languages; the assistant's welcome text fits the part you're in (music, books)."
  },
  {
    "version": "1.1.7",
    "text": "- **Collections (new, in every part):** the new \"Collections\" button in the top bar. A collection keeps films, songs and books around one theme, e.g. ask the assistant \"make a collection about Dune: the films, the music, the books\". They don't have to be in your library: what is opens with one click (Play / Read), the rest says Find and the assistant looks for it. \"Add to a collection…\" in the right-click menu of films, songs and books; rename, delete, remove an item, \"have the assistant add to it\". The assistant asks before it makes or changes one, and Undo works.\n- **One history:** the same window has a History page: films (each sitting of more than a minute, with how far you got), songs and books together, by day, with Film / Music / Book filters; click to open again, right-click to remove, or clear it all. The assistant knows the last two weeks (\"what did I watch yesterday?\").\n- New ready questions: a collection for a film you love / the book you're reading."
  },
  {
    "version": "1.1.6",
    "text": "- **Settings › General › Updates:** check now, \"Tell me when a new version is out\", and **Get beta versions too** (off by default; turning it on warns that betas may have bugs and offers to back up first).\n- The version number in Settings now really follows the changes (it had stayed at 1.1.1 since 1.1.1CC)."
  },
  {
    "version": "1.1.5",
    "text": "- **Assistant › free books:** asking for a book that isn't in the library (\"Suç ve Ceza'yı istiyorum\") searches the free libraries with the page-turning animation and shows a card with the cover: \"Is it this one?\" → **Yes, save it** (downloads into the library) → **Read**. \"Another edition\" goes through the other results; a book already in the library shows Read at once; a saved book deleted later goes back to Save."
  },
  {
    "version": "1.1.4",
    "text": "- **The assistant's ready questions:** \"What is this film / series / book about?\" (no spoilers) is now the first one on a film's page, in the right-click menus of films, series and books, and \"What is the book I'm reading about?\" in Books.\n- Versions (fixed): the last number counts to 9, then the middle one goes up (1.1.9 → 1.2.0). 1.2.0CC was renamed 1.1.3CC."
  },
  {
    "version": "1.1.3",
    "text": "- **Books › delete on right-click, everywhere:** every book of the library (home shelves, \"Continue reading\", the library, the reading history, the cover on a book's page) now has \"Delete the reading record\" (where you were, like, rating, note; the file stays) and \"Delete the file (to the Recycle Bin)\", each asked first."
  },
  {
    "version": "1.1.2",
    "text": "- **Read aloud:** changing the voice while reading now switches at once (the pieces already prepared in the old voice were played first; leaving the book was needed)."
  },
  {
    "version": "1.1.1",
    "text": "- **Read aloud › the best voices first:** the voice menu now lists Microsoft's newest voices first (Ava, Andrew, Emma, Brian: the 2024 multilingual \"Copilot\" voices), then the other new multilingual voices, then the voices made for novels; old copies and the children's voice are hidden. The book's own language comes first (at most ten, \"Other voices in this language…\" for the rest); the multilingual voices can read Turkish and other languages too.\n- If Microsoft's service drops the connection (it does now and then when asked quickly in a row), Luna tries once more before switching to Windows' voice."
  },
  {
    "version": "1.1.0",
    "text": "- **Books › read aloud (new), with Microsoft Edge's natural voices** (as in Edge's \"Read aloud\"): the speaker button at the top of the reader, or Ctrl+Shift+U. The sentence being read is shaded and the word being said is marked, in step with the voice; the pages turn (or scroll) by themselves and it goes on into the next chapter.\n- **Read from here:** select any text and choose \"🔊 Read from here\" (while reading: \"Continue from here\"). Without a selection it starts from the top of the page, or from where you stopped if that is on the page.\n- **The reading bar:** previous / next paragraph, pause, speed (0.5×–2×, the voice keeps its pitch), voice (Emel or Ahmet for Turkish, the book's language first, multilingual voices, or Windows' own voice offline), sleep timer (15 / 30 / 60 minutes or the end of the chapter), close.\n- Music pauses when reading starts, and the reading waits if you start music. Headset keys pause the reading. Changing the chapter from the contents or the search reads on from the new page.\n- If Edge's voice can't be reached, Windows' voice reads on and the bar says so. The first time, the bar also says that the page's text goes to Microsoft's speech service, as in Edge.\n- The time listened goes into the reading history (🔊). The assistant can start and stop it (\"kitabı sesli oku\", \"okumayı durdur\"); while a book is read aloud, \"durdur / devam\" are for the reading.\n- Versions: a new feature now raises the middle number (1.1.0); fixes raise the last one."
  },
  {
    "version": "1.0.10",
    "text": "- **Book reader fixes:** the selection menu appears only after the mouse button is released and sits above the selected text (under it near the top), never over it. The reader now lives in the app's own layer: the small assistant shows over it, right-click menus work in it, and the big assistant blurs it (the text no longer shows through). The assistant button opens a menu: open the assistant, a spoiler-free recap, talk about the book, what to listen to while reading.\n- **Music › Liked (new, like Spotify's Liked Songs):** ♥ in the player bar, Now playing and the reader's music panel, and in every song's menu. Library › \"Liked\" has songs and podcast episodes in two tabs, play / shuffle; it can't be deleted (a song leaves it when un-liked). A \"Liked\" card leads the lists on the music home and in Lists.\n- **Music › History (new):** every listen, day by day with the time; remove one or clear all.\n- **One song menu everywhere** (Discover, library songs, playlists, liked, history, most played, the player bar): the assistant's questions, play, play next, add to the end of the queue, like, add to a list, open on YouTube / Spotify or search YouTube, copy the link.\n- **Discover:** switching country shows \"Loading the … list\" with placeholders.\n- **Books › shelves (new):** All · Reading · Finished · Liked · Disliked · History. Liked and finished books also show on the books home. Books read from a link or \"Open file\" count too.\n- **Reading history (new):** every sitting with a book is kept (day, time, minutes, from % to %), with the total reading time; remove one or clear all.\n- The assistant also knows your liked songs and episodes, your listening history, books marked as read and your reading history."
  },
  {
    "version": "1.0.9",
    "text": "The book reader in the approved Apple Books–style design:\n\n- **Highlights and underlines** (EPUB): select text → yellow / green / blue / pink or underline, a note, copy, or \"Ask the assistant\" about the passage. A click on a highlight changes its colour, edits its note or deletes it.\n- **Notes:** a note on a highlight, or on the page (the pencil at the top; also for PDF and comics).\n- **Bookmarks:** the bookmark at the top right marks the page (filled when the page is marked).\n- **One side panel:** Contents · Bookmarks · Notes (every highlight and note, newest first, click to go there) · Search (EPUB: every place the words appear, with the text around).\n- **Ask the assistant** at the top: a spoiler-free reminder of the book up to the chapter you're in.\n- **Themes and settings:** six themes (Original, Quiet, Paper, Evening, Night, Forest), text size, **brightness** (darkens the page; Windows' brightness isn't touched) and **warm light**, font, line spacing, bold text, scroll to read, two pages on wide screens.\n- The top and bottom bars take the page's colours and fade while you read (a mouse move brings them back); the bottom shows the pages left in the chapter.\n- Panels and menus close when you click anywhere else, in the book page too.\n- Highlights, notes and bookmarks are kept per book on this computer (and go into the backup file)."
  },
  {
    "version": "1.0.8",
    "text": "- **Music is fetched as sound only, always.** A song found by a YouTube search (Discover, Spotify lists) was left to mpv, which turned the search into a new entry without the audio-only settings and fetched the 1080p video too (the clip showed through behind the assistant, and it took ~4 s). Luna now finds every YouTube song's audio-only address itself (the search through YouTube's quick search service) and gives mpv only that: it starts ~0.2 s after the address is found. If Luna can't find it, mpv tries, still sound only; a film resets mpv to picture and normal quality.\n- **yt-dlp folder build:** it starts in ~0.4 s instead of ~1.1 s for every song (the one-file build unpacked itself each time); a lookup went from ~2.4 s to ~1.6 s. Weekly self-update works with it. `scripts/fetch-mpv.ps1` and `package-portable.ps1` use it; the installer ships `mpv/yt-dlp/`.\n- **Loading shows:** from the click until the sound starts, the song row and the player bar show a spinner and \"Loading…\" (the previous song pauses meanwhile).\n- **Sooner starts:** a song is prepared after the mouse rests on it 0.12 s (up to four at a time); an opened playlist and the Discover chart prepare their first three.\n- **Right click on played songs** (music home \"Most played\", the reader's \"Recently played\") and on recently played podcast episodes: remove from the list, copy the link, open in the browser (YouTube / Spotify page, or a YouTube search for a song found by name; the episode and its RSS feed)."
  },
  {
    "version": "1.0.7",
    "text": "- **Serious fix: a song no longer opens as a video or lands in Films.** The music queue was briefly empty while mpv still had a song (opening a YouTube link cleared it first and then waited for YouTube); the app took that song for a film. Music is now also recognised by the addresses it was loaded from, and a YouTube link keeps the music going until its songs are ready.\n- **Music and films:** starting a film pauses the music instead of throwing it away; when you close the film the song is back where it was, paused (no headset key starts it during the film). Live radio just stops.\n- **Songs start sooner:** resting the mouse on a song (Discover, library songs, playlist rows, the reader's music panel) starts finding it, and a click while that runs waits for it instead of starting a second search.\n- **Music › Discover:** a search box for songs and artists.\n- **Podcasts:** in Now playing the tab is \"About this episode\" (the episode's own description and date) instead of lyrics; a recently played episode queues the rest of its show, so \"Up next\" has the episodes.\n- **Book reader:** a ♪ button in the top bar opens a small music panel: what's playing with back / play-pause / next, and your lists, recently played songs and podcasts to start without leaving the book."
  },
  {
    "version": "1.0.6",
    "text": "- **Podcasts:** the last episode of each show you listened to is remembered: \"Recently played\" on the podcast page and \"Pick up your podcasts\" on the music home page. A card carries on the episode where you stopped (with how much is left) and \"Episodes\" opens that show's other episodes; the episode you were on is marked in the list.\n- **Books:** the \"Continue reading\" card has the book's backdrop (the painting found on its details page, else its cover), blurred and darkened, like the details page."
  },
  {
    "version": "1.0.5",
    "text": "- **Music › Discover (new):** what's most played now in 16 countries (Apple's open charts, no account), songs of the artists you listen to most, and genre buttons that have the assistant make a playlist. Songs play from YouTube; nothing is downloaded.\n- **Music library tabs:** Albums / Artists / Songs also show the songs from your Luna lists and the ones you've played from links, so they work without a music folder (\"- Topic\" / \"VEVO\" channel names become the artist).\n- **Songs start sooner:** the next YouTube song's audio address is found while the current one plays (and the first one when a playlist page opens), so it starts at once; if that address fails, it's loaded the usual way without a warning.\n- **Playlist page:** in a small window the page behind no longer shows through the song list (darker, more blurred).\n- **Assistant:** \"durdur\", \"devam\", \"sonraki\", \"önceki\", \"sesi kıs / aç / 40 yap\", \"karıştır\", \"ne çalıyor\" act at once without asking the model (it used to say \"stopped\" without doing it); a new player_control tool covers other wordings. A song in a Luna list is found by title and artist in any order (\"Duke Ellington Solitude\") and plays inside that list; a song that's nowhere gets the YouTube card (\"not in your lists, found it on YouTube\": add and play, or just play) instead of \"not found\". Recommendations in films, music and books give both what's in the library and new finds outside it.\n- **Copied links:** a Spotify, YouTube, Apple Music, podcast, torrent, video or book link copied in another program brings a small \"Import / Close\" note at the top for 30 seconds (from when Luna is in front); it can be turned off in Settings › General, and then the clipboard isn't read at all.\n- **Podcasts:** a podcast link (RSS feed, Apple Podcasts, Spotify show) is recognised in the music link window: the show is followed and opened. The shows you follow are on the music home page.\n- **Backup (Settings › Backup, new):** one file with your records, lists, notes and settings (not the media files, not the API keys); restore from it; buttons open Google Drive / OneDrive / Dropbox so you upload it yourself.\n- **API keys** (TMDB, OpenSubtitles, Gemini) are kept encrypted in Windows' Credential Manager instead of plain text; an old plain copy is moved there and removed from Luna's settings and its state file.\n- **Torrents carry on after a restart:** the engine remembers its downloads; they show in Downloads again and continue.\n- **Unknown files:** a video added by hand whose name TMDB doesn't recognise gets a small \"I couldn't recognise this file — write its name\" card; nothing found again says it may not be a film.\n- **yt-dlp updates itself** once a week in the background.\n- **DeepSeek's findings (4 + 2):** \"[REC] (2007)\" / \"[REC] 2\" keep their bracketed titles; a font added later no longer overwrites one with the same file name; the Folders breadcrumb shows inside sub-folders again; quick ± clicks on the subtitle timeline add up; a subtitle's language from the server can't put the file outside the video's folder; deleting a finished torrent stops it first even when it plays as a local file. Also: an old \"recommend\" check in the assistant had a broken character and never matched."
  },
  {
    "version": "1.0.4",
    "text": "- The `Luna Player.exe` in the project folder finds the project's mpv again (videos play from it); since 1.0.2 it only looked beside itself.\n- The project folder's Windows permissions were put back to normal: a tool had marked it \"low integrity\", so every program started from it (Luna too) couldn't write its settings and closed at once (\"os error 183\")."
  },
  {
    "version": "1.0.3",
    "text": "Two outside bug reports on the 1.0.1 beta (30 + 75 findings) checked one by one: 104 were real and are fixed; one (torrent list after a restart) was not a bug as described.\n\n- **Books:** arrow / space keys inside an EPUB no longer throw; a theme picked while a book loads sticks; the progress bar jumps by chapter when page positions can't be made. A PDF opens at its last page when the saved page is past the end, a damaged page says so, closing while loading leaves nothing running. Comics: the last two-page spread counts as finished, an unreadable page says so, no memory is kept after closing. \"Author - Title - Subtitle\" keeps its subtitle; a book opened with \"Open file\" stays in \"Continue\". Catalogs: a free PDF is preferred to an EPUB to buy, paging and a new search no longer mix catalogs or shelves, xml:base, redirects, prefixed OpenSearch tags and {searchTerms} in the path or twice all work. LibriVox keeps chapters that only come in one quality. EPUB titles decode &#233;-style characters and any namespace prefix. Downloads: a zip with no book or comic pages is refused, the size limit holds while downloading, names like CON / AUX are saved safely.\n- **Music:** shuffle keeps the song playing and the songs before it; a film's speed / loop no longer carries into music; holding Space pauses once; another playlist that shares a song starts instead of pausing the wrong one. Lyrics: a dropped connection is retried, live and studio takes don't share lyrics, a line with several times shows at each. A YouTube song that mpv reports by its media address still moves on at its end. Short podcasts aren't marked heard after seconds; \"newest episode\" is the newest even when the feed lists the oldest first. Radio search also finds stations by genre. Deleted songs leave \"most played\" and \"where you left off\". Library scans: a cancelled or failed scan no longer overwrites the library, \"2Pac\" / \"50 Cent\" keep their names, an album's later track can give the cover, a changed cover is picked up, nested folders don't list a song twice. Spotify move: an unticked song stays unticked, one unreadable song no longer stops the move. The music link window does nothing after it is closed.\n- **Assistant:** closing it while a card waits cancels; every delete gets its own card and choices, and an empty delete no longer lets other changes pass unasked; playing a song asks like other opens; \"Undo\" undoes every round of an answer, leaves a downloaded book out, and covers a music playlist it made. Non-Latin names don't match everything; \"Home\" deletes the song Home, not the album Homecoming; a playlist keeps the size asked for; a series asked for by name isn't the film of that name; a year given (\"Dune (1984)\") is respected when removing or editing. A question sent from a menu while it is busy waits instead of getting lost; a deleted conversation stays deleted; a new song gets its own conversation.\n- **Films:** an unfinished torrent asks before the music stops; \"I finished this episode\" moves \"Continue\" on; a 45-second clip isn't finished at the start; Discover's picks follow a like turned into a dislike and what was watched. Addon addresses keep their ?token=. File names: \"The Web (1947)\", \"(500) Days of Summer\", \"C++.mp4\" and two shows of the same name from different years are read right; .m2ts is in the open dialog. Missing-file checks and subtitle timelines ignore late answers; subtitle lines are sorted; UTF-16 subtitles show on the timeline; a failing subtitle name search says why. Deleting a book or song never takes a video's subtitles along. Removing a season torrent clears every episode opened from it. Hero sliders keep picture and title together; a cover that failed once tries again for the next song or book. Watch-later cards are checked for content warnings; a list search fills the posters of what it shows; a known TMDB id gives its own poster.\n- **Letterboxd:** \"Update\" no longer wipes list edits made while it ran, says when lists couldn't be read; a custom list named like a standard shelf stays separate; list CSV exports and Letterboxd links import without a Gemini key; the diary's latest vote counts for friend match.\n- **Other:** page reading can't be redirected into the local network; search plugins: \"$1E\" replacements, and/or with more arguments, htmldecode / diacritics / validate, POST $raw, .YML files and \"1,234,567\" sizes work. Lossless Scaling is restarted even if saving fails, is detected on a second monitor, and its untitled default profile becomes Luna's. Every font in a .ttc is listed; same-named fonts in a zip both stay. The setup check's \"Check again\" works after an error."
  },
  {
    "version": "1.0.2",
    "text": "- **Privacy:** the program no longer carries the folders it was built in (the Windows user name and the project folder showed inside `Luna Player.exe` as error-message paths). Shared builds are made with `scripts/build-release.ps1`.\n- The GitHub release workflow runs only when started by hand: pushing a tag no longer rebuilds the release over the tested files."
  },
  {
    "version": "1.0.1",
    "text": "- **Assistant:** no film page for taste remarks (\"vampir konusunu sevmiyorum\" was read as \"konusu\"), none twice for a film already shown, and the one-film page only when a film was asked for.\n- **Header:** fits on 1920 px screens again with its labels; on narrower windows the labels fold step by step and the tabs fade at the edge when they scroll.\n- **Music:** turning shuffle off restores the original order; the end of a playlist rewinds and pauses (play starts it again); a YouTube link that can't be read also stops the sound.\n- **Books:** comic (CBZ) pages are freed as you read (memory no longer grows); arrow / Page keys turn pages even after clicking the Aa or contents buttons.\n- \"İnik değil\" tooltip reworded.\n- Notebook: the version rules are kept, rules can't be deleted; Gemini (G) added to the model letters.\n- Fixes found by DeepSeek (see `deepseek tarafından bulunan hatalar/BULGULAR.md`), checked and the header fix reworked by Claude Code."
  },
  {
    "version": "1.0.0",
    "text": "- **Settings › General now shows the app version** (`1.0.0D`).\n- Version format: `MAJOR.MINOR.PATCH` + the letter of the AI model that made the last change\n  (`D` DeepSeek, `C` ChatGPT, `CC` Claude Code, `Q` Qwen, `K` Kimi). Each new model round bumps the number.\n- Single version source: `app/src/version.ts`; `package.json`, `tauri.conf.json` and `Cargo.toml` follow it.\n- Remaining audit fixes, packaging and release workflow updates from the 0.3.0 cycle.\n# Changelog"
  },
  {
    "version": "0.3.0",
    "text": "A large correctness and packaging release.\n\n### Player and library\n\n- Fixed \"continue watching\" saving several seconds behind, and saved the final position on exit.\n- Fixed `1920x1080` being read as a release year (posters/summaries now match).\n- Fixed the external-subtitle key overriding an embedded subtitle on every launch.\n- Fixed lost-file re-linking through a torrent using a stale library snapshot.\n- Fixed subtitle nudge keys/buttons using stale state (G/H, +/−).\n- Fixed the cancelled sleep timer leaving the video paused.\n- Throttled seek-bar dragging; final seek on release.\n- The preview worker is always stopped before a file is deleted or moved.\n- \"Finished\" now uses one threshold (95%) across the home row, menus and the player.\n\n### Books\n\n- Audiobooks are visible to the assistant and on the books home (\"Recently listened audiobooks\").\n- A corrupt EPUB can no longer panic/abort the whole app (`percent_decode` is byte-safe, with a test).\n- CBZ blob URLs are revoked; PDF documents/workers are destroyed.\n- EPUB \"two pages\" no longer reloads the whole book.\n- CBZ page numbers cannot go negative; loaded pages are clamped.\n- CBR files are no longer advertised as downloadable (RAR is not supported).\n- A failed book deletion no longer clears the reading record first.\n\n### Music and assistant\n\n- YouTube playlist requests now search smarter (punctuation, artist/title, relevance checks), fill missing\n  entries with the artist's other real tracks, and show a preview before creating the playlist.\n- The assistant opens the new playlist and closes itself; Alt+A toggles it.\n- Song links (`play_song`) and the \"add to library and play\" card are restored.\n- The assistant prompt no longer includes an unbounded film library (first 400 entries).\n- Playlist/reminder/title removals respect the year; duplicate recommendations are avoided.\n- Undo only reverts the assistant's own changes, not later manual edits.\n- Empty/one-letter note deletion can no longer wipe every note.\n- Conversations are separated by song/book/film context instead of one endless chat.\n\n### Packaging\n\n- Setup (NSIS) and portable zip builds, GitHub Actions release workflow.\n- GPL-3.0 license, third-party notices (mpv GPLv2+, yt-dlp Unlicense, fonts OFL).\n- Build documentation for fetching mpv and producing both packages."
  }
];
