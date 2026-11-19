## 3.5.4CC

- Genel denetim: cam pencereler açılış animasyonunda camını kaybetmiyor (tüm cam sınıfları için tek kural). Mini ses kutusu, transkript menüsü ve güncelleme penceresi de aynı camı kullanıyor; düğmeden büyüyerek açılıp yerine küçülerek kapanıyor.
- 13 sekme konsol hatası olmadan açılıyor; boşta arka plan çağrısı yok.
- Testler güncel koda uyduruldu: 60 test grubu geçiyor.

## 3.5.3CC

- Sinema görünümü: cam efektleri tek sisteme bağlandı (kontrol, panel, perde), camın üst kenarında ince projektör ışığı; oynatıcı kontrolleri filmin üstünde cam bir adada. Daha hissedilir hareket: afişe basınca detay sayfası afişten büyüyerek açılır, sekmeler gidilen yöne kayar, menüler ve pencereler yükselerek açılır, düğmeler basınca hafifçe çöker, 2× gibi göstergeler kısa bir vuruşla belirir, afişler sırayla gelir. Detay sayfası kapanırken açıldığı afişe geri küçülür; film sayfasındaki cam düğmeler afişin rengini alır; menü ve panel köşeleri iç içe uyumlu. Düğme menüye dönüşür (kutu genişlemesi): düğmenin ya da afişin kendi kutusu, köşeleriyle birlikte, açılan pencereye ya da film sayfasına genişler; film sayfası açılırken arkadaki ana sayfa görünür kalır, siyah boşluk çıkmaz. Sekmeler ve Film/Müzik/Kitap arasında eski sayfa geri çekilerek solarken yenisi gidilen yönden aynı anda kayarak gelir, arada boş kare olmaz. Genişleyen kutu daha sakin hareket eder (sayfa ~0,75 sn, menü ~0,5 sn); köşeleri yol boyunca büyük ve yuvarlak kalır, kenarında yumuşak bir gölge ve ince cam çizgisi taşır, sonunda pencerenin köşesine oturur. Ana sayfadaki büyük vitrinden film sayfası da kutu olarak açılır. Luna Web'de Luna simgesi ana başlıktaki yerinde durur; Web ile Film/Müzik/Kitap arasında sayfa (açık bir site yokken) yumuşakça geçer ve seçim hapı Web'den kayarak döner. Üç nokta menüleri, analiz seçenekleri, arkadaş puanları ve film sayfasındaki kutular cam oldu; arkadaş puanları artık üstteki kutunun altında kalmaz. Cam her yerde: oynatıcı menüleri (senkron, altyazı arama, birlikte izle), Keşfet filtresi, Web menüleri ve üst çubuğu, müzik çubuğu ve diğer açılır kutular aynı camı kullanır. Yüklenirken Keşfet ve Kitap rafları başlık satırlarıyla birlikte iskelet gösterir, kartlar gelince sayfa zıplamaz. Ayarlar, Koleksiyonlar, Bağlantı, bildirimler, arama, Detaylar ve "Bu akşam ne izlesem?" açtıkları pencereye düğmenin yerinden büyüyerek dönüşür, kapanınca o düğmeye geri küçülür. Üst çubuk ve ana sayfadaki film alanının düğmelerinde iOS tarzı sıvı cam (Glisse; komut paletinden kapatılabilir). Film/Müzik/Kitap/Web ve üst sekmelerde seçim balonu yeni seçeneğe kayarak gider; mod değişince sayfa da o yöne kayar. Bir filmden geri çıkınca ana sayfa kaldığın yerde ve aynı filmde durur (önceden en üste atlıyordu). Küçük etiketler büyük harften cümle düzenine geçti.
- Birlikte izle (1. adım): oynatıcıdaki 👥 düğmesiyle oda açılır ve bir davet linki oluşur. Linke tıklayan kişi adını yazıp katılmak ister, oda sahibi onaylar. Biri katılınca sağda sohbet paneli açılır (mesaj ve tepkiler); kimse yokken sohbet görünmez. Oda sahibi katılanı çıkarabilir, kontrolü yalnız kendine ya da herkese verebilir. "Odayı kapat" deyince herkes çıkar ve o link bir daha çalışmaz. Luna sunucusu yok, router'da port açılmaz, bağlantı uçtan uca şifrelidir ve video gönderilmez. Oynat/duraklat/sarma eşitlemesi sonraki adımda gelecek.
- Filmde seçilen dublaj dili hatırlanır: menüden seçtiğin dil hemen kaydedilir ve film tekrar açılınca (web akışı, torrent, başka kopya) sitenin varsayılan dilinin yerine o gelir.
- Bir filmin birden çok kopyası varken torrent kopyası silinince kartı kopyalar arasında kalmaz.
- Boşluk basılıyken çıkan 2× göstergesi ekranın tam ortasında.
- Film sayfasında (kütüphanede olmayan filmlerde de) beğeni puanı değiştirilebilir: 👍 ya da 👎'ye tekrar basınca puan balonu açılır, bir kez daha basınca oy kalkar.
- Asistan: DeepSeek gibi modeller film adını yılsız yazsa da listedeki film adları tıklanabilir film olarak görünür.
- Asistan cevabında sağ tık: seçili metni ya da cevabın tamamını kopyala.
- Bildirimler: hazırlanan altyazılar zil panelinin üstünde canlı ilerleme ve kalan süreyle görünür; bildirimler dosya adı yerine bölüm adını kullanır. Çeviri de böyle: "Çevir" deyince stüdyo kapanır, ilerleme zilde görünür, bitince bildirim gelir. Çeviride yapay zekâ bozuk cevap verirse o parça 3 kez yeniden istenir, yine olmazsa yalnız o parça orijinal kalır ve çeviri sürer; bildirim metni tam okunur. Çevir sekmesinde çeviren yapay zekâ (kayıtlı profillerden) ve efor seçilir: Gemini ve OpenAI düşünen modellerinde 4 kademe, Claude ve DeepSeekte düşünme açık/kapalı; varsayılan düşük. Özel sağlayıcılarda (DeepSeek) cevap 2500 tokende kesiliyordu, çeviride 8192 oldu. "Aslına yakın (dil öğrenmek için)" çeviri aynı dildeki normal çevirinin üstüne yazmaz; ayrı dosya ve "dil öğrenme" etiketli ayrı satır olur.
- Podcast ve sesli kitap altyazısı iki dilde: altyazı menüsündeki "Çifte altyazı" ikinci dili seçer ya da stüdyonun Çevir sekmesini mevcut altyazıyla açar (çeviri alt satır olarak eklenir, ana altyazı değişmez); seçilince duyulan satır ve iki yanındaki ikişer satır, her birinin altında çevirisiyle görünür. Görünüm altyazı menüsünden seçilir: alt alta (varsayılan) ya da yan yana. Altyazı menüsü yenilendi: "1" ana altyazı, "2" ikinci dil rozeti; görünüm küçük önizlemeli kartlarla; dosya adı yerine okunur ad.
- Zile basınca sağ üstteki açılır bildirimler kapanır; bildirimlerde altyazı işleri bölüm kapağını, resmi olmayanlar türünün simgesini gösterir.
- Kitaplar kendiliğinden tanınır: dosya adı temizlenir, yazar ayrılır, Open Library / Google Books'tan kapak ve açıklama gelir (yalnız kesin eşleşmede).
- Tarayıcıdan inen dosyalar türüne göre indirme klasörünün içinde Luna Video / Luna Müzik / Luna Kitap'a taşınır ve o kütüphaneye düşer; 7 dakikadan uzun seste podcast, müzik ya da sesli kitap diye sorulur.
- Nereden açılırsa açılsın her kitap Kitaplığım'da kalıcı olarak hatırlanır; kitap sayfasında düzenleme ve raflar ⋯ menüsünde.
- Arkadaş puanları penceresi yalnız ortalamanın ve avatarların üstünde açılır, puan satırını kapatmaz; afişte senin puanın ile TMDB etiketi yan yana durur.
- Dosyası olmayan afiş yalnız soluk görünür; ayrı "Dosya yok" yazısı ve ↓ işareti kaldırıldı. Kartın üzerine gelince açılan satırdaki arkadaş fotoğrafı kaldırıldı (arkadaşlar kartın altında yazıyor).
- Bilgisayarda olmayan filmin sayfasında ana tuş "İndir" olur, "Bu film bilgisayarında yok" kutusu kalktı; indirme başlayınca ve bitince tuş Oynat / Devam et olur.
- Torrentten gelen filmin dosyası silinince film kütüphaneden gitmez, "indirilmedi" olarak kalır ve sayfasında İndir çıkar.
- Film sayfasında İndir, İzleme seçeneklerinde seçili kaliteyi doğrudan indirir (kaynak seçme ekranı açılmaz); kopya seçimi yalnız bilgisayarda olan kopyaları gösterir.
- Puan verilmiş filmde İzledim'e tekrar basınca puan sorulmaz.
- Sesli Luna uyandırma sözünü dinlerken film sesi artık birkaç saniyede bir kısılıp açılmaz; ses yalnız Luna gerçekten dinlerken/konuşurken kısılır.
- Asistan (sesli de) artık ileri/geri sarar, baştan başlatır, hızı değiştirir, altyazı ve ses dilini değiştirir/kapatır, sonraki bölümü açar; kitapta sayfa çevirir ve yazıyı büyütür/küçültür.
- Asistan "Hangisi hakkında?" seçimini sorudan tahmin eder (kitap / şarkı / film); sesli soru panel açılırken kaybolmaz, yeni konuşmada yeniden sorulur.
- Asistan bilgisayarda olmayan filmi/bölümü eklentilerden bulup izletir ya da indirir (kalite seçilebilir); indirmeleri listeler, duraklatır, sürdürür, iptal eder; dışarıdan açılan kitapları da kitaplıkta görür.
- Kitaplar › Sesli kitaplar: bilgisayardaki sesli kitap dosyaları (MP3, M4B…) "Bilgisayardan ekle" ile eklenir; indirilen sesli kitaplarla birlikte "Benim sesli kitaplarım"da listelenir.
- Kitaplar’daki "Dosya aç" artık MP3, M4B gibi sesli kitap dosyalarını da açıyor; dosya Sesli kitaplar’a eklenip çalmaya başlıyor.
- Bilgisayardan eklenen sesli kitaplar Kitaplar ana sayfasındaki Kitaplığım rafında da kart olarak görünüyor; tıklayınca çalıyor.
- Sesli kitap kartları da kitaplar gibi tanınıyor: dosya adından yazar, doğru ad ve kapak bulunuyor.
- Sesli kitap kartlarına sağ tık menüsü: Dinle, kapak ve bilgileri düzenle, koleksiyona ekle, kitaplıktan çıkar, dosyayı sil. "Yazar Kitap Yazar" biçimindeki dosya adları da doğru ayrılıyor.
- Sesli kitap kartlarında da "i" düğmesi var; kitabın detay sayfasını açar, oradan Oku dinlemeyi başlatır.
- Sesli kitabın detay sayfası "SESLİ KİTAP" ve dosya türünü (MP3…) gösteriyor; düğme Oku değil Dinle.
- Sesli kitap kartlarında yüzde yerine filmlerdeki gibi kalan süre yazıyor ("1 sa 20 dk kaldı").
- Kitap detayındaki "Ayrıntılı inceleme" artık Luna Web’i açmıyor, asistana soruyor. Üstteki Kitap düğmesinin simgesi Luna Web’deki açık kitap simgesiyle aynı.
- Sesli kitap ve podcast çalarken üst çubukta filmlerdeki not defteri var: o anki dakikaya not alınır, nota tıklayınca oraya atlanır.
- Fare alttaki oynatma çubuğunun üzerindeyken çubuk kaybolmaz; fare çekilince birkaç saniye sonra gizlenir.
- Bilgisayardaki videolarda zaman çubuğu küçük resimleri arka planda önceden hazırlanır; üzerine gelince en yakın kare hemen çıkar.
- Altyazı penceresinde arama kutusundaki yazıyı fareyle sürükleyip seçince pencere artık kapanmıyor.
- Altyazı araması kütüphanede film tanınmışsa TMDB kimliğiyle yapılır; Türkçe ad yüzünden altyazı bulunamaması bitti. Elle isimle arama eskisi gibi.
- Film kartındaki İzledim düğmesi artık ayrıntılardaki Bitirdim gibi filmi Bitirdiklerim satırına da ekler; İzlemedim deyince oradan çıkar.
- Sesli kitap ve podcast ekranında (internetteki bölümler dahil) stüdyoda yapılan ya da dosyanın yanındaki .srt/.vtt altyazı müzik sözleri gibi akar, satıra tıklayınca oraya atlanır; üst çubukta Altyazı stüdyosu düğmesi var, stüdyoda oluşturulan altyazı kapanınca hemen görünür.
- Altyazı stüdyosunun model listesinde, model klasörüne elle eklenen modeller de görünür; Türkçe için eğitilmiş İTÜ modeli "Türkçe · İTÜ turbo" adıyla ve açıklamasıyla çıkar.
- Altyazı stüdyosunda "Ekran kartı (Vulkan)" motoru: Intel Arc, AMD ve NVIDIA kartlarda çalışır, işlemciden kat kat hızlıdır ve kuruluysa varsayılan seçilir. Ekran kartı NVIDIA olmayan bilgisayarda CUDA seçeneği gizlenir.
- Altyazı stüdyosu internetteki podcast bölümlerinden de altyazı çıkarır: Podbee bölümleri kendi ses adresinden, YouTube ve yt-dlp ile açılan diğer siteler oynatmadaki gibi yt-dlp üzerinden okunur (önce "Ses çıkarılamadı" hatası veriyordu).
- Altyazı stüdyosunda "Altyazı oluştur"a basınca pencere kapanır; iş arkada sürerken ekranın üstünde ilerleme halkası görünür, tıklayınca stüdyo yeniden açılır.
- Sesli kitap/podcast ekranında altyazı arama ve "Sesi takip et" üst çubuğa taşındı. Altyazı işi kendi bölümünün ekranında üstte halka olarak, başka ekranlarda sağ üstte birkaç saniye görünen kart olarak gösterilir; bildirimlerde dosya adı yerine bölümün adı yazar.
- İzlendi tiki afişte ayrı rozet yerine TMDB etiketinin içinde durur.
- Kitapta fare tekerleğiyle sayfa çevrilir; otomatik tanımada dosyadaki Türkçe yazılış korunur.
- Sesli kitap ve podcast ekranında üst çubukta altyazı seçici var: stüdyoda yapılan, çevrilen ya da temizlenen altyazılar, dosyanın yanındaki .srt/.vtt dosyaları ve Kapalı listelenir; seçim her bölüm için hatırlanır, varsayılan en son yapılan altyazıdır.
- Altyazı seçicide Luna'nın önbelleğindeki altyazı silinir; senin dosyanın yanındakiler önce sorulur (İptal: yalnız listeden kalkar). "Yeniden oluştur" stüdyoyu açar.
- Altyazı seçiciden seçili altyazı zaman damgasız, satır satır .txt olarak dışa aktarılır.
- Sesli kitap ve podcast altyazısında arama kutusu satırları süzer, "Sesi takip et" otomatik kaydırmayı açar/kapatır.
- İnternetteki bölümlerde ses önce yt-dlp ile 8 parçalı hızlı indirilir (olmazsa eski yol); sırada "Ses indiriliyor · %40 · ~3 dk kaldı" gibi yüzde ve kalan süre görünür, yazıya dökme aşamasında da.
- Luna açılırken stüdyo önbelleğinde 10 dakikadan eski, yarım kalmış Whisper geçici dosyaları (wav, srt, indirilen ses) temizlenir.
- Altyazı hazır olunca ya da başarısız olunca bildirim çıkar (başlık + "Altyazı hazır" ya da hata).
- 20 dakikadan uzun kayıtlar 10 dakikalık parçalar hâlinde yazıya dökülür ve tek altyazıda birleştirilir; iptal ya da çökme olursa biten parçalar saklanır, aynı iş kaldığı yerden sürer (saklanan parçalar 3 gün sonra silinir).
- Kitap analizi dilden bağımsız: yorumlar önce Goodreads'ten, kalan kısım 1000Kitap'tan gelir; analiz hangi siteleri okuduğunu yazar.
- Keşfet'te film penceresi takılmadan açılır: içerik hazır olunca tek seferde yükselir, yerine oturunca arkası bulanık koyu cam olur (bulanıklık önceden hiç çalışmıyordu). Karttaki çift odak çizgisi kalktı.
- İzleme seçenekleri pencere açılır açılmaz "Aranıyor…" ile görünür; her kalitenin köşesinde izlemeden indiren ↓ düğmesi var.
- Cam görünümü glisse tarzında (az buzlu, ince kenar ışığı); küçük yüzen düğmelerde mercek kırılması. Menülerde seçim plakası satırdan satıra kayar.
- Rozetler, kopya kartları ve oy düğmeleri temayla aynı ("Abonelikle" çipleri gibi); "Kopyaladığın bağlantı" kutusundaki Kapat büyüdü.
- İndirilenler'de biten torrent filmleri de listelenir.
- Sayfa kenarında kaydırınca Apple tarzı esneme; kaydırırken camlar sadeleşir, sayfa ve pencere içi kaydırma akıcı.
- Tarayıcının adres çubuğunda ve düğmelerinde üzerine gelme, basma ve panel geçiş animasyonları.
- Bildirimlerde indirilen filmlerin afişi görünür (eski bildirimlerde de, sürüm adından bulunur).
- Zil düğmesi çark gibi dönmez; üstüne gelince gerçek bir zil gibi hafifçe sallanır. Diğer yuvarlak düğmelerin simgesi dönmek yerine hafifçe büyür.
- Ayarlar penceresi çarkın olduğu köşeden, sekmeden ve zıplamadan açılır; soldaki liste sırayla gelir.
- Tarayıcıda sağ tık menüsü kapanınca arkasında siyah kutu kalmaz; menü sayfanın bulanık görüntüsüyle gerçek cam olur, imleçten büyüyerek açılır, seçim plakası satırlar arasında kayar.
- Keşfet vitrininde yalnız görünen arka plan hareket eder, pencere açıkken durur; oyuncu fotoğraflarının yükleniyor parıltısı fotoğraf gelince durur. [external]
- Bütün açılır menüler ve paneller aynı yumuşak açılışla gelir; camın bulanıklığı ve gölgesi ilk kareden vardır, sonradan yüklenmez. Arkadaş puanları da artık birden belirmez.
- Oynatıcıda Görüntü ↔ Ses geçişi kayan bir anahtarla yapılır, panel yeni boyuna yumuşakça büyür; görüntü kaydırıcıları yeni, sade bir kartta ve sıfırdan dolan çizgiyle.
- Oynatıcıdaki 3'ten geri sayma tuşu kaldırıldı; sahne ve kelime defteri tam ekran pencere yerine tuşunun üstünde küçük bir panel olarak açılır.
- Menüler, paneller ve Ayarlar penceresi açıldıkları gibi yumuşakça kapanır; Ayarlar camı da açılırken bulanıklığını kaybetmez.
- Ayarlar ve Koleksiyonlar listesinde glisse menü akışı: imlecin altında bir plaka kayar, seçilen bölümün plakası yeni seçime kayarak gider.
- Liquid glass değerleri glisse referansına çekildi (bükülme .77, renk ayrışması 1.45, 3px buzlanma, kenar parlaklığı .25); film penceresinin arkasında artık glisse merceği var.
- glisse menüleri gibi: ⋯ tuşuyla açılan menü tuşun yerinde açılır, tuş menüye dönüşür ve kapanınca menü tekrar tuşa dönüşür; küçük menüler büyürken camını kaybetmez. Analiz seçenekleri, arkadaş puanları, açılır seçim kutuları ve paylaşım gibi diğer açılır pencereler de tuşlarından büyür.
- Üst çubuk tek tasarımda: arama, Bağlantı, Koleksiyonlar, bildirim ve ayarlar düğmeleri mod seçicinin kapsülünü (soluk beyaz zemin, ince kenar) kullanır; aşağı kaydırırken sağdaki düğmelerin griye dönüp titremesi giderildi.
- Hero’daki ve film sayfasındaki cam düğmeler artık gerçekten buzlu: açılış animasyonu bittikten sonra da açık kalıp camın arkasını görmesini engelliyordu; kenarlarındaki pürüzlü beyaz çizgi de bundandı.
- Cam düğmelerin kenar parlaklığı (rim) kapatıldı: geç yüklenip kenarlarda pürüzlü beyaz çizgi bırakıyordu.
- Cam düğmeler üst çubuktaki kapsüllerle aynı ince kenarı taşır; hero’daki Detaylar, Fragman, oklar ve “Bu akşam ne izlesem?” aynı buzlu camdadır; kaydırırken cam düğmeler griye dönüp geri gelmez.
- Film penceresi tek parça buzlu cam: arkasındaki ayrı glisse camı pencere büyürken ölçülüp yalnız bir şeridi kaplıyordu (kalanı saydamdı) ve her kaydırmada bütün ekranı yeniden çizip takılmaya yol açıyordu; kaldırıldı. Açılış animasyonu artık sonunda takılı kalıp pencerenin bulanıklığını kapatmıyor. Asıl neden perdeydi: pencerelerin arkasındaki karartma perdesinin solma animasyonu sonunda takılı kalıyor ve üstündeki bütün pencerelerin (film penceresi, diğer pencereler, galeri) buzlanmasını kapatıyordu; düzeltildi.
- Pencerelerin içindeki menüler de tuştan doğar: film penceresindeki ⋯ (Luna Analiz) gibi bir pencerenin içindeki tuşlar dönüşmeye hiç katılmıyordu; artık menü tuşun yerinde açılır, tuş menüye dönüşür ve kapanınca geri döner.
- Pencere içinde açılan menülerin “iki kez açılıyor” gibi görünmesi düzeltildi: menüyle birlikte büyüyen kenar çizgisi, buzlu pencerenin içinde ekrana göre değil pencereye göre yerleşip menünün yanında ayrı bir kutu gibi akıyordu.
- “+ Listeye” artık geri de alır: filmin bulunduğu listede ✓ görünür, tıklayınca o listeden çıkar
- “Çıkınca haber ver” zili yalnız henüz çıkmamış filmlerde ve dizilerde görünür; zil ve “Asistana sor” tuşu yanındaki tuşlarla aynı camı kullanır
- Şarkı, podcast ve sesli kitapta aynı oynatıcı: videosu olan her şeyde (YouTube’dan gelen şarkılar dahil) beğen tuşlarının yanında video tuşu; ±10 sn ve hız menüsü şarkılarda da var (şarkıların hızı ayrı hatırlanır)
- Videolu podcast bölümlerinde beğen tuşunun yanında video tuşu: video tam ekran değil, sol tarafta kapağın yerinde aynı saniyeden oynar (bölüm başa sarmaz); tekrar basınca kapağa döner
- Film penceresinde arkadaş puanları listesi artık izleme sağlayıcılarının logolarının altında kalmıyor
- Podcast ve sesli kitap ekranındaki defter tam ekran pencere yerine filmlerdeki gibi tuşun altında küçük panel olarak açılır; ses paneli ve altyazı seçici de filmlerdeki gibi tuştan büyüyerek açılıp geri kapanır (camları artık bulanık)
- F11 tam ekran uyarısı yukarıdan kayarak gelir ve kayarak gider
- Video tuşu: müzik çalmaya devam eder, kapağın yerinde bulanık kapak üstünde “Video yükleniyor…” ve dönen çember görünür; video hazır olunca o karttan büyüyerek, sesle aynı saniyeden gelir. YouTube şarkısında ses hiç durmaz: video sayfanın içinde sessiz oynar ve çalan sesin saniyesini izler; küçük oynatıcıya geçince video kapanmaz, kayarak küçük oynatıcıya iner, geri dönünce yeniden yüklenmeden büyür
- Ana sayfada izlemeye başladığın filmde “Fragman” tuşu gösterilmez
- Podcast videosunda altyazı artık resmin üstüne basılmaz (sözler zaten sağda); video açılınca resim ve ses aynı saniyeden birlikte başlar
- Podcast ve sesli kitapta oynat tuşunun iki yanında 10 sn geri / 10 sn ileri; ses düzeyinin yanında YouTube’daki gibi hız menüsü (0,5×–2×), seçilen hız sonraki bölümlerde de kalır
- Eksik 12 İngilizce arayüz metni eklendi [external]

## 3.5.2CC

- İndirilmemiş filmlerde sağ tık "Kaynak ekle…"; diğerlerinde "Kaynağı değiştir…"; "Bu film bilgisayarında yok" penceresinde torrent / web kaynak seçimi.
- Diskte olmayan dosyayı silerken "Silinemedi" hatası yerine kütüphaneden kaldırılır.
- Siteden gelen videolarda donma azaltıldı: ileri sarma önizlemesi açılışta ve yükleme sırasında aynı siteden ayrıca veri çekmez.
- Film elle "İzlendi" işaretlenince de puan sorulur.
- DeepSeek asistan komutları: düşünen modelde araç çağrısından sonra 400 hatası düzeltildi.
- DeepSeek: Düşünme düğmesi DeepSeek düşünmesini açıp kapatır; kısa, ona özel sistem notu.
- API profillerinde hazır DeepSeek seçeneği: adres ve model kendiliğinden dolar, yalnız anahtar girilir.
- Sesli asistan: daha kısa, direkt ve sıcak (liste yok, en çok 1-2 öneri); yanıt yazısı ses bitene kadar ekranda kalır; film oynarken de "Luna" diye seslenilebilir.
- Asistan "YouTube'da X kanalına git" gibi isteklerde siteyi açmak yerine orada arar.
- Kitaplarda yazı %500'e kadar büyütülebilir; yazısını pikselle sabitleyen EPUB'larda da harfler büyür (önce yalnız satır arası açılıyordu).
- Kitap okurken web videosu alttaki küçük oynatıcıda görünür (siyah kalmıyordu); "Siteye dön" kitaptan da siteye götürür, kitap kaldığı yerde bekler.

## 3.5.1CC

- Her siteden "Luna'da oynat": uzun ses (10 dk+) podcastlere, kısa ses müziğe, video oynatıcıya gider. Web videosunda sağ tık "Podcastlere taşı".
- Podbee desteği: bölüm sayfası doğrudan çalar, podcast sayfası bütün bölümleriyle podcastlere eklenir.
- Podcast sayfası çalma listesi gibi: büyük kapak, çal, abone ol, bölümlerde arama ve tablo.
- Abone olunan podcastlerin yeni bölümleri kontrol edilir: zile bildirim düşer, tıklayınca çalar; rafta "Yeni" etiketi.
- Podcast sağ tık menüsü: en yeni bölümü çal, sitesini aç, bağlantıyı kopyala, abonelikten çık. YouTube dışı bölümlerde "Sitede aç".
- Siteden gelen podcast bölümleri kaldığı yerden devam eder; Luna yenilenince video ekranı açılmaz.
- Müzik ve kitaplarda İndirmeler sekmesi, Beğendiklerim yanında İndirilenler; indirilen şarkılarda yeşil indirildi işareti. YouTube listeleri gerçek adlarıyla gelir.

## 3.5.0CC

- Yakında: henüz çıkmamış film ve bölümlerde İzle düğmesi yok; "Henüz çıkmadı · tarih" ya da "Şimdilik sinemalarda · dijitalde tarih" yazar. Festival tarihleri artık çıkış sayılmaz, kısa süreli İzle görünmesi düzeldi.
- Kaynak ekle penceresinde "Web'de ara" en üstte ve doğru yazımla.
- İndirmelerde durdur/başlat tek düğme; dosya adına tıklayınca oynar. Aktif indirme en üstte, bitenlerde durdur düğmesi yok.
- Bildirimler film penceresinin üstünde görünür, 3 saniyede kaybolur; aynı indirme bildirimi iki kez gelmez.
- Kopya bölümler filmlerdeki gibi üst üste kart: üzerine gelince açılır, her kopyada Yerel/Web etiketi var.
- Seçtiğin ses ve altyazı dili dizi başına ve genel olarak hatırlanır.
- Keşfet sürüklemesinde takılma azaltıldı (bildirim ve disk yazımı sürükleme sırasında bekletilir). Hâlâ tam akıcı değil.
- Luna Closed 3.5.0 lunaplayer.org'da yayınlandı (tek sürüm). Closed hata bildirimine "Hata ayıklama geçmişini ekle" kutusu eklendi; bu dev kaynağında yok.

## 3.4.9CC

- Kütüphanedeki bir dosya açılamazsa (bozuk ya da desteklenmiyor) oynatıcı boş kalmaz; o film ya da bölümün eklenti kaynakları açılır, oradan oynatılabilir ya da indirilebilir.
- Yeni bildirimler sağ üstte birkaç saniye görünen, tıklanabilir pop-up'lar olarak çıkar (indirme başladı, indirme bitti, yeni bölüm) ve zilde de kalır. İndir'e basınca artık görünür bir bildirim gelir.
- Bölüm bilgi penceresinde o bölüm için alınmış sahne ve kelime notları görünür; nota tıklayınca o ana gidilir.
- Bilgisayarında olmayan film ve bölümlerde eklentilerden 4K / 1080p / 720p izleme seçenekleri: her kalitenin en çok paylaşılan kaynağı, boyutu ve paylaşan sayısıyla; tıklayınca oynar, sağ tıkla indirilir. ⋯ menüsünde "Kaynak ekle…" (indirilmişlerde "Başka kaynak ekle…") torrent ve web kaynaklarını açar, seçilen kaynak ayrı kopya olarak indirilir.
- Oynatıcıda önceki bölüm düğmesi (bilgisayarda yoksa eklentiden) ve sağda cam görünümlü Bölümler paneli: sezonlar, izlendi/oynuyor/bilgisayarında/eklentiden/çıkış tarihi durumları, tıklayınca oynatma.
- Bölüm kartlarındaki "i" artık bölümün kendi detayını açar: TMDB görseli, özeti, yönetmen, senarist, konuk oyuncular, puan ve izlendi düğmesi.
- Bölüm adları Türkçe çevirisi olmayınca İngilizce TMDB adından gelir ("4. Bölüm" yerine gerçek ad); boş özet de İngilizceden tamamlanır.
- OpenSubtitles: ara sıra gelen 403 yanıtı artık "API anahtarı geçersiz" sayılmaz; Luna kendisi birkaç kez yeniden dener. Anahtar hatası yalnız sunucu anahtarı reddettiğini söylerse gösterilir.
- İzlemeye devam et: daha önce izlendi işaretlenmiş bir bölüm ya da film yeniden açılıp yarıda bırakılınca listede yine görünür.
- Kütüphane sayfasında "Bitirdim" (✓) düğmesi basılınca yeşile döner; film ya da dizinin tamamı izlendi olunca 1–10 puan penceresi açılır.
- "Kayıtlı video açılamadı" penceresinde, eklenti varsa filmin torrent kaynakları da listelenir.
- Keşfet sıraları fareyle basılı tutup yana sürüklenebilir; sona yaklaşınca yeni afişler yüklenir (Sana özel sıraları sevdiğin türlerden devam eder).
- Keşfet › Sana özel: düğmeye ikinci kez basınca kapanır; en altta sevdiğin türlerden sayfa sayfa yüklenen sonsuz bir liste var (Film/Dizi seçimine uyar).
- Takip kontrolü her çalıştığında debug günlüğüne "follow_check" kaydı düşer (yalnız sayılar).
- Zil › Takip ettiklerin: "Şimdi kontrol et" düğmesi bütün takipleri hemen TMDB'ye sorar; yanında son kontrol zamanı görünür.
- Keşfet › Sana özel: diziler için iki yeni sıra: beğendiğin ve izlediğin dizilere göre "Sana uygun diziler" ve sevdiğin türlerden en beğenilen diziler. Kategoriler’de Film ya da Dizi seçilince Sana özel de yalnız onu gösterir.
- Torrentten yalnız video ve altyazı dosyaları iner; videosu olmayan (program vb. içeren, sahte olabilecek) kaynak hiç indirilmez ve uyarı verilir.
- Torrent kaldırma penceresi ekranın ortasında açılır. Bölüm kaynak penceresinde de İzle'deki gibi “Webde ara” var.
- Bilgisayarda olmayan bölüm izlendi işaretlenince kütüphanedekiler gibi “✓ İzlendi” etiketi gösterir.
- Bölümün çıkıp çıkmadığı daha sıkı: TMDB tarihi ABD günü olduğu için bölüm ertesi günden itibaren çıkmış sayılır; çıkış günü “Bugün çıkıyor · kaynak henüz olmayabilir” yazar (kaynak listesi yine açılabilir).
- Beğendim sonrası çıkan puan balonu, altındaki “Bu film bilgisayarında yok · İndir” kutusunun arkasında kalmıyor.
- Metinle torrent araması (Knaben): kaynak listesine yazdığın arama Knaben'de olduğu gibi aranır (bölüm “S01E07” biçimine çevrilir), eklentiler bir şey bulamazsa da sorulur. Sonuçlar eklentilerinkiyle aynı listede, en çok paylaşılan üstte; aynı torrent iki kez görünmez. Ayarlar › Eklentiler'den kapatılabilir; Knaben'e yalnız arama metni gider.
- Kaynak listesinde aramanın tamamı değiştirilebilir: ad ve sezon/bölüm tek kutuda (“VisionQuest S1B7”; S01E07, S1:B7, 1x07 de olur). Ara deyince Luna o başlığı bulur, bulunanı gösterir ve eklentilere yeniden sorar (IMDb numarası da yazılabilir). Sorulan eklentiler görünür; henüz çıkmamış bölümde çıkış tarihi yazar.
- Bilgisayarda olmayan bölüm kartına sağ tıklayınca menü açılır: Kaynakları göster, En iyi kaynakla oynat, İzlendi/İzlenmedi olarak işaretle, Bölüm adını kopyala, TMDB'de aç. Eklentiden izlenip biten bölüm de izlendi sayılır.
- Biten indirmeler ana sayfada bir kez görününce oradan kalkar (İndirmeler sayfasında durur); bitince zil bildirimlerine “İndirme tamamlandı” düşer, tıklayınca İndirmeler açılır.
- Luna Analiz varsayılan olarak kapalı gelir; açıp kapatma hatırlanır, analiz başlayınca kendiliğinden açılır.
- Uzantı yönetimi Chrome’daki uzantılar sayfası gibi: arama, Geliştirici modu, Uzantılarım / Klavye kısayolları menüsü ve simge, sürüm, açıklama, Ayrıntılar, Kaldır ve aç/kapat düğmesi olan kartlar. Mağaza bağlantısı yapıştırıp “İncele” deme adımı kaldırıldı.
- Her uzantının Ayrıntılar sayfası var: açıklama, sürüm, boyut, kimlik, arka plan çalışanı, izinler, site erişimi, klavye kısayolları, uzantı seçenekleri, web sitesi, Chrome Web Store sayfası, kaynak klasörü ve kaldırma.
- Geliştirici modunda paketlenmemiş klasör veya ZIP/CRX yüklenebiliyor, uzantılar tek tek ya da “Güncelle” ile hep birlikte yeniden yükleniyor.
- Chrome Web Store’dan kurulum Google Çeviri, Grammarly gibi eski 1024 bit anahtarlı eklentilerde “CRX geliştirici imzası doğrulanamadı” hatası vermiyor.
- Mağazanın “Chrome’a ekle” düğmesi .crx dosyası indirmeye kalkınca indirme yerine Luna’nın “eklensin mi?” kartı açılıyor.
- Sayfa çevirisi Chrome’daki gibi Google Çeviri ile yapılıyor: sayfanın dili kendiliğinden bulunuyor, her dildeki sayfa çevrilebiliyor ve model indirme beklenmiyor. İnternet yoksa cihazdaki yerel çeviri devreye giriyor. Seçili metin çevirisi de aynı yolu kullanıyor.
- Sabitlenen eklentinin paneli artık Luna penceresinin içinde, Chrome’daki gibi simgenin altında açılıyor ve açık sayfayı tanıyor: Dark Reader gibi eklentiler “about:” yerine gezdiğin siteyi görüyor ve siteye özel ayar yapılabiliyor. Panel sayfaya ya da Luna’ya tıklayınca, simgeye yeniden basınca veya sekme değişince kapanıyor.
- Adres çubuğundaki eklentiler (yapboz) düğmesi yanındaki düğmelerle aynı renk, boyut ve çizgide; daha sade bir yapboz simgesi var.
- Stremio eklentisi (ör. Torrentio) kuruluyken film sayfasındaki “İzle” düğmesi eklentilerdeki kaynakları açıyor. web araması artık kaynaklar panelinde “Webde ara” olarak duruyor.
- Eklenti kaynaklarından torrent oynatırken “Bilgiler alınıyor”da takılma düzeldi: Torrentio kaynaklarının çoğu tracker adresi olmadan geliyordu ve Luna dosya listesini yalnız DHT ile arıyordu. Artık her torrente bilinen açık tracker’lar ekleniyor; kimse paylaşmıyorsa 2 dakika sonra “başka bir kaynak dene” uyarısı çıkıyor.
- Eklenti kaynakları en çok paylaşılandan (seed) en aza sıralanıyor.
- Gölgeli altyazılar (Sinema ve Klasik sarı) Netflix’teki gibi pürüzsüz: kalın ve koyu siyah kenar yerine ince, yarı saydam bir kenar ve yumuşak bir gölge var.
- Keşfet › Kategoriler’de seçili Film ya da Dizi’ye yeniden basınca seçim kalkıyor ve Keşfet’in genel sayfasına dönülüyor.
- Dizi seçiliyken “Yeni başlayan diziler”, “Bu hafta yeni bölümü çıkan diziler” ve “Yakında başlayacak diziler”; Film seçiliyken “Yeni çıkan filmler” ve “Yakında” satırları var, seçtiğin türe göre. Genel Keşfet sayfasına da “Yeni başlayan diziler” eklendi.
- Dizi ve film takibi: bir başlığın sayfasındaki zil düğmesiyle takip et. Luna takip ettiklerini birkaç saatte bir TMDB’den kontrol ediyor; yeni bölüm çıkınca ya da film yayımlanınca bildirim bırakıyor (Luna arkadayken Windows bildirimi de, Ayarlar’daki “bölüm” bildirimi açıksa).
- Ayarlar düğmesinin yanında Bildirimler düğmesi: okunmamış sayısı, bildirim listesi (tıklayınca başlık açılıyor) ve sıradaki bölüm tarihiyle “Takip ettiklerin” listesi.
- Dizi sayfasında TMDB’deki bütün sezonlar ve bölümler görünüyor; bilgisayarında olmayan bölümler soluk kartla duruyor. Tıklayınca o bölümün eklentilerdeki (ör. Torrentio) kaynak listesi açılıyor, hangisini oynatacağını sen seçiyorsun. Ayarlar › Oynatma ve bağlantılar’daki “Otomatik kaynak eşleştirme” açıksa Luna kaynağı kendisi seçip oynatıyor: önce en çok paylaşılan 1080p, yoksa en yakın kalite (720p, sonra 4K). Henüz yayımlanmamış bölümler çıkış tarihiyle gösteriliyor.
- Oynatıcıdaki “Sonraki bölüm” (düğme, N tuşu ve bölüm bitince 8 saniyelik geri sayım) sıradaki bölüm bilgisayarında yoksa onun da kaynak listesini açıyor (otomatik eşleştirme açıksa kaynağı kendisi seçip oynatıyor); sezonun son bölümünden sonra yeni sezonun ilk bölümüne geçiyor.
- Webden kaydedilmiş bir dizi bölümünün bağlantısı artık açılmıyorsa “Kayıtlı video açılamadı” yerine o bölümün eklentilerdeki kaynak listesi açılıyor (İzle’deki liste: Oynat / İndir); kaynak sayfasını açma seçeneği de duruyor.
- Henüz yayımlanmamış bir bölüme “Sonraki bölüm” ya da bölüm kartıyla gidince “kaynak bulunamadı” yerine “Bu bölüm henüz çıkmadı · çıkış: 1 Ocak 2027” (tarih belli değilse onu) diyor; bölüm bitince çıkmamış bölüme geri sayım başlamıyor. Eski kayıtlı bölüm listeleri yayın tarihleriyle bir kez yenileniyor.
- Torrentler sırayla iniyor: yeni bir bölüm ya da film oynatınca veya indirince ondan önceki yarım indirmeler duraklıyor, bütün bağlantı yenisine kalıyor. Yenisi bitince ya da kaldırılınca en son duraklatılan kendiliğinden devam ediyor. Duraklatılmış bir indirmeyi elle sürdürmek de onu öne alıyor; elle duraklatılan sıraya geri girmiyor. Luna açılınca kalan indirmelerden yalnız en yenisi sürüyor.

## 3.4.8CC

- Sabitlenen eklentiye tıklayınca eklentinin kendi paneli simgenin altında açılıyor. Tarayıcıda sekme açıkken “Luna penceresi kapalı” hatası verip hiç açılmıyordu.
- Web bölümüne girince sabitlenen eklenti simgeleri hemen görünüyor; eskiden eklenti yöneticisini açmadan çıkmıyordu.
- Chrome Web Store’da mağazanın kendi “Chrome’a ekle” düğmesi çalışıyor: Luna eklentiyi Google’dan alıp imzasını doğruluyor ve Chrome’daki gibi tek bir “Eklentiyi ekle” sorusuyla kuruyor. Ayrı “Luna’ya kur” düğmesi, yönetim ekranına geçiş ve mağaza ipucu kaldırıldı.
- İndirme sürerken sekme kapatılabiliyor; indirme arka planda sürüyor ve İndirmeler’den izlenebiliyor. Sekme indirme bitince kendiliğinden tamamen kapanıyor.
- Sayfa çevirisi tarayıcılardaki gibi çalışıyor: önce ekranda görünen kısım çevrilip hemen sayfaya yazılıyor, sonra sayfanın geri kalanı parça parça çevriliyor. Kaydırınca ya da sonradan gelen yazılar (akışlar, açılan menüler) kendiliğinden çevriliyor; sayfanın yalnız ilk bölümü çevrilip tekrar çevir’e basmak gerekmiyor.
- Tarayıcıda sekme açıkken tepsi simgesine tıklamak veya “Luna’yı göster” Luna’yı yeniden öne getiriyor; klavye medya tuşları ve Upscaler altyazı penceresi de sekme açıkken çalışıyor. [external]

## 3.4.7D

- Eklenti düğmesi ve sabitlenen eklentiler artık okuma modu düğmesinin yanında, adres çubuğunun içinde duruyor; adres metni düğmelerin altında kalmadan kendi alanında kısaltılıyor.
- Sabitlenen eklentilerin gerçek simgeleri görünüyor: 19/38 px manifest simgeleri ve paket simge tablosu birlikte okunuyor.
- Sabitlenen bir eklentiye tıklanınca ayrı bir pencere veya sekme yerine, tıklanan simgenin altında çerçevesiz bir eklenti paneli açılıyor; sayfaya ya da araç çubuğuna dönünce kendiliğinden kapanıyor.
- Sayfa sağ tık ve araçlar menülerinde “Orijinal dilinde göster / Özgün sayfaya dön” yalnız sayfa çevrildikten sonra görünüyor; çevrilmemiş sayfada yerini “Sayfayı çevir” alıyor.

## 3.4.6C

- Sayfa çevirisinden sonra adres çubuğundan veya sağ tıktaki “Orijinal dilinde göster” seçeneğinden özgün sayfaya dönebilirsin.
- Adres çubuğundaki Eklentiler menüsünden kurulu eklentileri sabitleyebilir, sabitlemeyi kaldırabilir ve kendi arayüzlerini açabilirsin. Sabitleme tercihin saklanır.
- Bildirimler açık tarayıcı menülerinin üzerini kapatmaz; dar pencerelerde eklenti menüsü ekrana sığar.

## 3.4.5C

- Web bildirimleri ve içe aktarma önerileri adres çubuğunun altında görünür; adresi kapatmaz.
- Sağ tık menüsünden sayfa özgün diline döndürülebilir.
- Yerel çeviri dil dosyaları cihazda kalıcı saklanır ve yeniden kullanımda doğrulanarak açılır.

## 3.4.4C

- Web’de seçili metin ve sayfa çevirisi cihazında çalışır; asistan sohbeti, API anahtarı veya token gerektirmez. Türkçe dahil sekiz dil desteklenir.
- Dil dosyaları ilk kullanımda doğrulanarak indirilir ve sonraki kullanımlar için saklanır. İndirme ve çeviri durumu gösterilir; hata sonrası yeniden denenebilir.
- Seçili metin çevirisi kaynak/hedef dil seçimi ve kopyalama düğmesi bulunan ayrı bir pencerede açılır. Sayfa çevirisinde özgün metne dönülebilir.

## 3.4.3

- Web koleksiyonlarında alıntılar tam metin, resimler büyütülebilir önizleme olarak açılır. Kaynak sayfa ve alıntının ilgili bölümü ayrı düğmeyle açılır.
- Resim adresi eksik olduğunda sayfadaki gerçek görsel adresi alınır; eski eksik kayıtlar açıkça belirtilir.

## 3.4.2C

- Chrome Web Store sayfasından Luna’ya kur düğmesiyle ve yeni indirilen CRX paketleriyle doğrudan kurulum önizlemesine geçilir; İndirilenler bölümüne gitmek gerekmez. ZIP/CRX ve klasör seçimi korunur.
- Web açılış sayfasından da koleksiyonlara ulaşılabilir. Aynı sitenin sayfaları, alıntıları ve medyaları tek açılır grupta toplanır.
- Koleksiyon panelinden kayıt veya koleksiyon silinebilir; işlemden önce onay istenir. Aynı sayfanın seçili alıntıları birleştirilebilir.

## 3.4.1C

- Web koleksiyonları adres çubuğundan, sayfadan ayrılmadan açılan bir panelde gezilebilir. Kayıt açıldığında panel kapanır.
- Aynı sayfadan farklı metin alıntıları kaydedilebilir; alıntı, resim, video ve ses kayıtlarının kaynak sitesi gösterilir.
- Koleksiyonlardaki web bağlantıları açılırken koleksiyon penceresinin açık kalması düzeltildi.

## 3.4.0C

- Önceki Web oturumunu açarken kurtarma penceresi sayfaların tüm kaynaklarını beklemeden kapanır; sekmeler arka planda yüklenmeye devam eder.
- Mini oynatıcı ve Web görünümünde fare imlecinin oynatıcı tarafından gizlenmesi düzeltildi.

## 3.3.9C

- Web sayfalarını, bağlantıları, resimleri, video ve ses bağlantılarını sağ tıkla mevcut koleksiyonlarına ekleyebilirsin.
- Adres ve arama alanlarında sağ tıkla düzenleme, yapıştırıp gitme ve arama seçenekleri eklendi. Seçili metni kopyalayabilir veya tercih ettiğin arama motorunda arayabilirsin.
- Kategori yüklemesi bağlantı hatasından sonra yeniden denenebilir; mikrofon kısayolu bırakıldığında bekleyen kayıt başlangıcı iptal edilir.

## 3.3.8CC — 2026-10-28

- Asistan: "tarayıcıyı aç", "web’i aç" Luna’nın tarayıcısını açıyor (önceden bu adda bir film arıyordu).
- Asistan (yerel model): model aracı yazı olarak yazarsa (<tool_call>…) Luna onu gerçek araç çağrısı olarak çalıştırıyor; yazı cevapta görünmüyor.
- Asistan (yerel model): model döngüye girip aynı satırı tekrar tekrar yazarsa tekrarlar atılıyor; yanıtların bir üst sınırı var.
- Asistan: film, müzik ve kitap talimatlarının başında da emoji kullanmaması söyleniyor.

## 3.3.7CC — 2026-10-28

- Asistan: istenen şarkı arşivde ve listelerde yoksa YouTube’dan bulunup sormadan çalınıyor ("getireyim mi" kartı yok); "rahatlatıcı bir şey aç" gibi isteklerde de doğrudan çalıyor.
- Asistan: emoji kullanmıyor ve cevabın sonuna "başka bir şey ister misin" gibi soru eklemiyor.
- Asistan (yerel model): modele yalnız bulunulan bölümün araçları gönderiliyor (önceden her istekte ~37 bin karakterlik bütün araç listesi gidiyordu); kütüphane düzenleme araçları yalnız düzenleme isteğinde ekleniyor. "request exceeds" bağlam hatası ve yavaşlık bunun içindi.

## 3.3.6CC — 2026-10-28

- Sesli asistan: yanıt sesi için ElevenLabs desteği. Ayarlar › Sesli asistan › Ses servisi: kendi API anahtarınla hesabındaki seslerden biri ve model (Hızlı Flash v2.5 ya da En doğal Multilingual v2) seçilir. Hak biterse ya da bağlantı olmazsa Microsoft sesi okur. Kitap sesli okuma değişmedi.

## 3.3.5CC — 2026-10-28

- Sesli asistan: "Luna, …" diye seslenirken de asistan penceresinin yazı kutusu sesine göre hareket eden dalgaya dönüşüyor (önceden yalnız "Luna" deyip bekleyince çıkıyordu).

## 3.3.4CC — 2026-10-28

- Sesli asistan: model sesli konuştuğunu biliyor; yumuşak, nazik ve kısa konuşan, kullanıcının ne izleyip dinlediğini bilen bir arkadaş gibi yanıt veriyor. Liste dökmek yerine asıl merak edileni tek cümleyle söylüyor ("En son ne izledim?" sorusuna son izleneni söyler).

## 3.3.3CC — 2026-10-28

- Analiz: yorumlar İngilizce olsa da sonuç Türkçe yazılıyor (küçük yerel modeller isteğin sonunda ayrıca hatırlatılıyor).
- Sesli asistan: asistan penceresi açıkken üstünde boş bir kutu (katman hatası) çıkmıyor; sesin durumu yalnız yazı kutusundaki dalgada gösteriliyor.

## 3.3.2CC — 2026-10-28

- Analiz (yerel model): "Yapay zekânın cevabı okunamadı" hatası düzeltildi. Kısa yorumlar ayıklanınca numaralar aralıklı kalıyor, küçük model ise cevabı 1, 2, 3 diye numaralıyordu; artık her grup modele 1’den numaralanıyor ve cevap Luna’da asıl yorumlara eşleniyor.

## 3.3.1CC — 2026-10-28


## 3.3.0CC — 2026-10-28

- Analiz (yalnız yerel model): tek satırlık, sadece emoji olan ve tekrar eden yorumlar modele gönderilmeden yıldızlarından etiketleniyor; kalan yorumlar sayıya göre değil uzunluğa göre gruplanıyor (kısa yorumlar bir arada, uzun denemeler ayrı); bir film için okunan yorumlar hatırlanıyor, sonraki analizde yalnız yeni yorumlar okunuyor (son 30 eser). API ile çalışan modeller eskisi gibi.

## 3.2.9CC — 2026-10-28

- Analiz (yerel model): 30 yoruma kadar her şey düşünerek okunuyor; daha fazlasında yorum grupları hızlı (düşünmeden) okunup yalnız son özet düşünerek çıkarılıyor; 60 yorumun üstünde özet de hızlı modda. Böylece bağlam taşmıyor ve analiz kısalıyor.

## 3.2.8CC — 2026-10-28

- Analiz: yerel model (LM Studio) Letterboxd yorumlarını her zaman düşünme moduyla okuyor; sohbetin Düşünme ya da Flash ayarı buna karışmıyor.

## 3.2.7CC — 2026-10-28

- Analiz: Letterboxd sayfaları tamamen görünmeyen bir pencerede okunuyor; ekranda bir şey açılmıyor. Pencere yalnız gerçek bir "insan mısın" kontrolü çıkarsa öne geliyor.

## 3.2.6CC — 2026-10-28

- Analiz: Letterboxd sayfası açıldığı hâlde okunmuyordu (sayfa durumu yanlış çözülüyordu); artık sayfa yüklenir yüklenmez yorumlar okunup pencere kapanıyor.

## 3.2.5CC — 2026-10-28

- Analiz: Letterboxd sayfaları Luna tarayıcısının profiliyle (aynı çerezlerle), ekran dışında duran gerçek bir pencerede açılıyor; film bağlantısı (TMDB → Letterboxd) da bu yoldan bulunuyor. Sayfa 8 saniyede açılmazsa pencere ekrana gelir, kontrolü kullanıcı geçer. Her adım debug kaydına yazılıyor.

## 3.2.4CC — 2026-10-28

- Analiz: Letterboxd yorumları düz indirmeyi reddedince (403) Luna sayfayı görünmeyen bir tarayıcı penceresinde açıp yorumları oradan okuyor. Site "insan mısın" kontrolü isterse pencere öne gelir; kontrolü kullanıcı geçer.
- Sesli asistan: Flash kapalıysa sesli istekler de Flash'sız, seçilen ayarla çalışıyor.

## 3.2.3CC — 2026-10-28

- Asistan (Flash ve sesli): cümlenin kalıbına değil anlamına bakıyor; "Google'da ara", "YouTube'da şu kanalı bul", "Spotify'a git" gibi istekleri nasıl söylenirse söylensin yeni sekmede açıyor.
- Sesli asistan: "sevmedim / değiştir / başka bir şey aç" çalan şarkıyı değiştiriyor (aynı sanatçıdan ya da benzer tarzda); beğenilmeyen şarkı bir daha seçilmiyor. "Bunu beğendim" beğenilenlere ekliyor; durdur/sonraki/ses/"bu ne şarkı" da anlaşılıyor.
- Sesli asistan: müzik ilk kelimeden itibaren kısılıyor ve Luna konuşmasını bitirene kadar arada yükselmiyor.
- Sesli asistan: konuşurken yazı kutusunda yalnız sesine göre hareket eden dalga görünüyor.
- "Web de X'e git" (boşluklu) artık tarayıcı isteği olarak anlaşılıyor.

## 3.2.2CC — 2026-10-28

- Sesli asistan: asistan penceresi açıkken sesle konuşunca yazı kutusu sesine tepki veren bir çizgiye dönüşüyor ve söyledikleri/cevap onun yanında görünüyor.
- Sesli asistan: ayarlardaki seçimlerin hemen kaydedildiği yazıyor (Kaydet gerekmiyor).

## 3.2.1CC — 2026-10-28

- Sesli asistan: şarkı adları "(Official Video)", "[Lyrics]", "| kanal" gibi ekler olmadan gösterilip okunuyor.
- Sesli asistan: Luna dinlerken, düşünürken ve konuşurken çalan müziğin sesi kısılıyor, bitince geri geliyor.
- Sesli asistan: "Luna" duyulunca kısa bir ses çalıyor; ardından bir şey söylenmezse 8 saniyede kendiliğinden kapanıyor. Takılan bir adım 1 dakikada kendini bitiriyor.
- Sesli asistan: "Luna" dinlenirken balonun altındaki küçük nokta yerine balonun çevresinde yumuşak bir halka yanıyor.

## 3.2.0CC — 2026-10-28


## 3.1.9CC — 2026-10-28


## 3.1.8CC — 2026-10-28

- Sesli asistan: "Tarkan" deyince "Tarık" çalıyordu. Yapay zekânın söylenmeyen bir ad eklemesi artık engelleniyor (söylenen kelimelere benzemeyen kısım atılıyor) ve YouTube'da adı geçen sanatçının şarkısı öne alınıyor.
- Sesli asistan: kısa basılı tutma kaydı da artık WAV olarak alınıyor.

## 3.1.7CC — 2026-10-28

- Sesli asistan: yapay zekâya isteğin konuşmadan yazıya çevrildiği ve kelimelerin yanlış duyulmuş olabileceği söyleniyor; kastedileni anlayıp adları düzelterek uyguluyor ("Sezan Aksu" → Sezen Aksu, "tarikanın kuzu kuzu" → Tarkan - Kuzu Kuzu). Şarkılar "Sanatçı - Şarkı adı" biçiminde aranıyor.

## 3.1.6CC — 2026-10-28

- Sesli asistan: dinlerken, düşünürken ya da cevap okurken tekrar "Luna" dersen baştan başlıyor (cevap susar, yeni isteğini dinler).
- Sesli asistan: tek başına "Luna" daha çabuk algılanıyor (kısa kelimeden sonra 0,45 sn sessizlik yetiyor).
- Sesli asistan: şarkı eşleştirmesi tam kelimeyle yapılıyor ("tarika" artık "Tarikat" listesini açmıyor); YouTube'dan şarkı uzunluğundaki (1,5–8 dk) ilk sonuç çalınıyor, belgesel/konuşma videoları atlanıyor.
- Sesli asistan: Web bölümünde küre artık sayfanın ve web balonunun üstünde.

## 3.1.5CC — 2026-10-28

- Sesli asistan: "Luna" diye uyandırdıktan sonra isteğin başında tekrar "Luna" dersen artık isteğin parçası sayılmıyor (tuşla konuşurken de).

## 3.1.4CC — 2026-10-28

- Sesli asistan: **"Luna" deyince dinleme** (Ayarlar → Sesli asistan, isteğe bağlı). "Luna, Sezen Aksu çal" ya da önce "Luna" deyip sonra isteğini söyle; sustuktan sonra (0,8 / 1,2 / 2 sn, seçilebilir) kendisi bitirir. Ses yalnız bu bilgisayarda Whisper ile dinlenir. Film oynarken dinlemez. Dinlerken asistan balonunda küçük bir nokta yanar.
- Sesli asistan: küreye tıklayınca asistan penceresi açılıyor.
- Sesli asistan: Web bölümünde küre sayfanın altında kalıyordu; artık sayfanın üstünde görünüyor ve web balonunun yerine geçiyor.

## 3.1.3CC — 2026-10-28

- Sesli asistan: şarkı istekleri doğrudan çalıyor (müzik çalarda), kart, soru ya da web araması yok. Yer söylenmezse önce kütüphane ve listelerine, yoksa YouTube'a bakılır; "webde" dersen doğrudan YouTube'dan, "kütüphanemde" dersen yalnız kütüphaneden çalar. Cevap yalnız "Çalıyorum: …".
- Asistan: "Nerede aransın?" kartında Webde seçilince şarkılar için site listesi değil, çalma kartı (Çal / Kütüphaneye ekle ve çal) geliyor.

## 3.1.2CC — 2026-10-28

- Sesli asistan: asistan penceresi açıkken küre pencerenin altında kalıyordu; artık pencerenin başlığındaki Luna noktasının yerine geçiyor, söylediklerin hemen yanında görünüyor.

## 3.1.1CC — 2026-10-28

- Sesli asistan: sesle açılan asistan penceresi artık kapatılabiliyor.
- Sesli asistan: asistan balonu kaybolup aynı yerde sese tepki veren küreye dönüşüyor (ayrı bir küre çıkmıyor).
- "Nerede aransın?" kartına yazarak ya da sesle verilen cevap artık kartın cevabı sayılıyor; Whisper'ın yanlış duyduğu "Bebde", "Vep de" gibi söyleyişler de "Webde" olarak anlaşılıyor. Whisper'a Luna'nın sık kelimeleri ipucu olarak veriliyor.
- Gizlilik: ses kaydının baytları artık debug günlüğüne yazılmıyor.

## 3.1.0CC — 2026-10-28

- Yeni: **Sesli asistan** (yerel model). Ayarlar → Hesaplar ve anahtarlar → Sesli asistan. Kısayolu (varsayılan Ctrl+Space) basılı tut, konuş, bırak: asistan balonu sesine tepki veren bir küreye dönüşür, söylediklerin yanında cam bir balonda görünür, cevap kısa ve sesli gelir ("Açıyorum." gibi). Sohbet penceresi yalnız cevap bir kart gerektirdiğinde açılır. Yazıya çevirme bu bilgisayarda Whisper ile yapılır; altyazı stüdyosuyla aynı kurulum kullanılır, ikinci kez indirilmez. Yanıt sesi kitap sesli okumadaki doğal seslerden seçilir.

## 3.0.9CC — 2026-10-27

- Flash: "Nerede arayayım?" seçimi Luna kart tasarımına geçti (başlık, iki seçenek kartı, açıklamalı); ayrı mesaj balonu kalktı.
- Flash açıkken Düşünme anahtarı kapalı görünüyor ve altında "Flash karar veriyor" yazıyor.

## 3.0.8CC — 2026-10-27

- Asistan (yerel model): Yanıt biçimi menüsüne **⚡ Flash** modu eklendi. Açıkken Luna mesaja önce düşünmeden hızlıca bakar: basit soru ve işler düşünmeden yapılır, karmaşık işlerde düşünme kendiliğinden açılır. Şarkı, film ya da kitap istenip nerede aranacağı söylenmediyse "Kütüphanemde / Webde" düğmeleri çıkar, yalnız seçilen yerde aranır. Yanıtın altında ⚡ ya da 🧠 hangi yolun seçildiğini gösterir. Flash kapalıyken her şey eskisi gibi çalışır.

## 3.0.7CC — 2026-10-27

- Asistan: web komutları: "webde beni X'e götür", "X sitesini aç" siteyi açıyor; "youtube'dan son şarkısını aç" önceki konuşmadan kişiyi bulup YouTube'da en yenilere göre sıralı arıyor. Vikipedi, IMDb, Letterboxd, Reddit, Ekşi gibi siteler de anlaşılıyor.

## 3.0.6CC — 2026-10-27

- Asistan: "arat" istekleri artık yapay zekâdan geçiyor; önceki konuşmaya bakıp "onun en iyi albümünü arat", "bunu arat" gibi göndermeleri gerçek adlarla değiştirerek tarayıcıda arıyor. Yapay zekâya ulaşılamazsa isteğin kendi kelimeleri aranıyor.

## 3.0.5CC — 2026-10-27

- Asistan: "internette" demeden de arama yapıyor: "mick gordon diye arat", "X'i arat", "X diye ara" tarayıcıda arama sekmesi açıyor. Yalnız "ara" (ör. "annemi ara") arama sayılmıyor.

## 3.0.4CC — 2026-10-27

- Asistan: "internette X diye arat", "tarayıcıda X'i ara" gibi istekler artık sohbette cevaplanmıyor; Luna'nın tarayıcısında, seçili arama motoruyla arama sekmesi açılıyor.

## 3.0.3CC — 2026-10-27

- Asistan: sayfa notunun açılır kutusu pencerenin dışına taşıyordu; artık mesajın genişliğinde, pencerenin içinde açılıyor.
- Asistan: okunan sayfa "Kaynaklar" satırında tekrar gösterilmiyor (zaten sayfa notunda var).
- Asistan (küçük pencere): yanıt altındaki öneri düğmeleri (Yeniden üret, Önemli noktaları açıkla…) küçük haplara dönüştü, daha az yer kaplıyor.

## 3.0.2CC — 2026-10-27

- Asistan (yerel model): Qwen gibi küçük modeller cümle ortasına Çince karakter karıştırıyor ve Luna'nın [ALINTI SONU …] işaretini cevaba kopyalıyordu. Modele bunları yapmaması söyleniyor; yine de gelirse cevaptan temizleniyor (sohbette Çince/Japonca/Korece yazılmışsa karakterlere dokunulmuyor).

## 3.0.1CC — 2026-10-27

- Asistan (yerel model): "Düşünme" anahtarı kapalıyken bile Qwen3 düşünmeye devam ediyordu; model adı "Qwen 3 4B" gibi boşluklu yazılınca tanınmıyordu. Artık "Qwen 3", "qwen3", "qwen-3" gibi her yazılış tanınıyor ve düşünme gerçekten kapanıyor.

## 3.0.0CC — 2026-10-27

- Asistan: "Okunan sayfa" bilgisi Kopyala / Sabitle satırına taşındı; tek satır, üzerine gelince ya da klavyeyle odaklanınca tamamı görünüyor.
- Asistan: aynı YouTube videosunda adres ekleri (&t= gibi) değişince yanlışlıkla "Sayfa değişti" uyarısı çıkıyordu; düzeltildi.
- Asistan (yerel model): Qwen3'ün düşünmeyi kapatma komutu (/no_think) modelin kendi talimatına uygun olarak mesajın sonuna ekleniyor (önceden sistem talimatına ekleniyordu).

## 2.9.9CC — 2026-10-27

- Açılır menüler: yukarı açılan kısa menüler (ör. asistanda Yanıt biçimi) düğmeden kopup ekranın üstünde asılı kalıyordu; artık düğmenin hemen üstünde açılıyor.
- Asistan: Yanıt biçimi menüsüne "Düşünme" anahtarı eklendi (yerel ve özel sunucu profillerinde). Kapalıyken Qwen3 gibi modeller hızlı yanıt veriyor, açıkken cevaptan önce düşünüyor.

## 2.9.8CC — 2026-10-27

- Asistan (yerel model): Qwen3 modellerinde (LM Studio, Ollama) düşünme modu otomatik kapatılıyor (/no_think), basit sorulara çok daha hızlı yanıt geliyor. Bir yerel model düşünmesini yanıtın içine <think> olarak yazarsa o kısım gösterilmiyor.

## 2.9.7CC — 2026-10-27

- Web mini oynatıcı: duraklatıp yeniden başlatınca kayboluyordu (sayfanın "ses çalıyor" bilgisi bir an düşüyor, gizli sayfa bunu tekrar bildirmiyordu). Mini oynatıcı artık sen kapatana ya da siteye dönene kadar açık kalıyor; duraklat/oynat simgesi videonun gerçek durumunu gösteriyor.

## 2.9.6CC — 2026-10-27

- Ana sayfa slaytı: seçili çizgide ilerleme animasyonu görünmüyordu, çizgi hep dolu turuncu duruyordu. Sebep, seçili çizginin zeminini de turuncuya boyayan eski bir stil kuralıydı; zemin yeniden sönük, turuncu dolum soldan sağa ilerliyor ve bitince sıradaki slayta geçiyor.

## 2.9.5CC — 2026-10-27

- Ana sayfa slaytı: seçili çizgideki turuncu dolum alttaki gri çizgiyle tam üst üste oturmuyordu ve sol ucu düz görünüyordu; dolum artık genişliği artarak ilerliyor, iki ucu da yuvarlak ve çizgiyle aynı hizada.

## 2.9.4CC — 2026-10-27

- YouTube özeti (yerel model ve diğer sağlayıcılar): altyazı hiç gelmiyordu. Türkçe altyazı istendiğinde YouTube otomatik çeviriye "çok fazla istek" (429) diyor ve hiçbir altyazı inmiyordu; artık videonun kendi dilindeki altyazı, sonra İngilizce alınıyor.

## 2.9.3CC — 2026-10-27


## 2.9.2CC — 2026-10-27


## 2.9.1CC — 2026-10-27

- Asistan (yerel model ve diğer sağlayıcılar): YouTube videosunda altyazı çekilirken yeni bir animasyon görünüyor ("Videonun altyazısını çekiyorum"); yanıtın altındaki "Okunan sayfa" satırı altyazıdan okunup okunmadığını söylüyor ("Altyazıdan okundu" ya da "Altyazı alınamadı, yalnız sayfa metni").

## 2.9.0CC — 2026-10-27

- YouTube özeti (yerel model ve diğer sağlayıcılar): altyazı indirilip okunduktan sonra hemen siliniyordu; artık yarıda kalan bir indirmenin geride bıraktığı klasörler de 15 dakika sonra temizleniyor.

## 2.8.9CC — 2026-10-27

- Web mini oynatıcı: "Siteye dön" düğmesi geri geldi (yazılı, oklu); videonun açıldığı sekmeye döner. Yalnız web videolarının mini oynatıcısında.

## 2.8.8CC — 2026-10-27

- Asistan: sayfa şeridi küçük bir "✧ Sayfa" çipine dönüştü ve "Yanıt biçimi" satırına yerleşti (↻ güncelle, × ayır; ayrıntılar üzerine gelince). Küçük asistan penceresi biraz büyüdü, yanıtlara daha çok yer kalıyor.

## 2.8.7CC — 2026-10-27

- Asistan: yanıt gelince sohbet artık en alta kaymıyor; yanıtın başı görünür kalıyor, uzun yanıtı yukarıdan okuyabiliyorsun.
- Asistan: "Ayır" artık sayfayı gerçekten ayırıyor; sonraki sorular sayfasız cevaplanıyor, "Sayfaya bağla" ile ya da sayfa hakkında bir şey sorunca yeniden bağlanıyor. Sayfa şeridi yazma kutusunun hemen üstüne taşındı.

## 2.8.6CC — 2026-10-27

- Web: tarayıcıda video oynarken başka bölüme geçince artık düz şerit yerine filmlerdeki gibi mini oynatıcı çıkıyor; küçük karede videonun kendisi oynuyor, oynat/duraklat, 10 sn geri/ileri, ilerleme çubuğu ve Web'e dön düğmesi var.
- Asistan: Brave Search desteği. Ayarlar › Hesaplar ve anahtarlar'a Brave Search anahtarı girilirse yerel model (LM Studio, Ollama), OpenAI ve Claude profillerinde asistan internette arayabiliyor; Gemini kendi Google aramasını kullanmaya devam ediyor.

## 2.8.5CC — 2026-10-27

- Asistan: kütüphanende olmayan önerilen filmler ve diziler ("Dış öneri") artık tıklanabiliyor; tıklayınca sayfası açılıyor, üzerine gelince afişi görünüyor. "Dış öneri" etiketi duruyor.

## 2.8.4CC — 2026-10-27

- Ana sayfa ve Keşfet vitrini: slayt, seçili çizginin dolma animasyonu bitince değişiyor; çizgi artık slaytın gerisinde kalmıyor (web veya oynatıcıdan dönünce ve fare üzerindeyken de aynı hızda). Fare üzerindeyken çizgi durup kaldığı yerden devam ediyor.

## 2.8.3CC — 2026-10-27

- Web’den Film’e dönünce kaldığın yere dönersin: Luna Web’de fragman açtığın film penceresi (arama, Keşfet, kütüphane) kapanmaz, web açıkken gizlenir ve Film’e tıklayınca aynen geri gelir. Film’deyken Film’e yeniden tıklamak ana sayfaya götürür. Müzik ve Kitap için de aynı.

## 2.8.2CC — 2026-10-27

- Luna Web: adres kapsülünün yuvarlak sınırı artık üç noktayı da içine alıyor (içteki düğmeye basınca beliren eski halka kaldırıldı).
- Luna logosuna tıklayınca ayrı menü açılmıyor; şerit genişleyip açık kalıyor. Koleksiyonlar ve Ayarlar şeridin sonunda. Klasik görünüm seçeneği Araçlar’da.
- Film penceresinden fragman (veya başka bağlantı) Luna Web’de açılınca pencere kapanıyor; tarayıcı arkada kalmıyor.
- Tarayıcı üst satırı hiçbir durumda iki satıra kırılmıyor; yer imleri kendi satırında.

## 2.8.1CC — 2026-10-27

- Luna Web bildirimleri adres kapsülünden konuşuyor: favori, kopyalama, indirme, izin, hata, çeviri ve eklenti bildirimleri buzlu cam bir kapsül olarak adresin yerinde belirir, sonra adrese geri döner. Sayfa artık aşağı kaymıyor. Kısa bilgiler 3 sn kalır (altta biten çizgi), hatalar 8 sn; düğmeli olanlar (Tekrar dene, İptal, Kurulumu incele) ve kapatma düğmesi kapsülün içinde.
- Müziği içe aktar düğmesi adres kapsülünde artık nefes almıyor, düz düğme.

## 2.8.0CC — 2026-10-27

- Luna Web: adres kapsülündeki düğmelere (Luna, okuma, yer imi, indirme, araçlar) tıklamak artık adresi genişletmiyor; düğmeler yerinde kalıp tıklanabiliyor. Adres yalnız yazı alanına tıklanınca genişliyor.
- Araçlar düğmesi çeviri simgesi yerine üç nokta.

## 2.7.9CC — 2026-10-27

- Luna Web: Araçlar (çeviri) düğmesi adres kapsülünün içinde, en sağda. Tek satır görünümde ana sayfa düğmesi kaldırıldı (başlangıç sayfası + ile açılır).
- Logo üzerine gelince genişlerken artık sekmelerin üstünü kapatmıyor; adres çubuğu gibi yer açıp satırı kaydırıyor.

## 2.7.8CC — 2026-10-27

- Luna Web: adres çubuğu pencerenin ortasında; tıklayınca iki yana doğru genişliyor. Sekmeler soldaki alanı kullanıyor. Çok dar pencerede adres sekmelerin ardından gelir.

## 2.7.7CC — 2026-10-27

- Luna Web tek satır: geri, ileri ve yenile logonun hemen yanında. Luna logosu artık tam görünüyor (önceden yalnız nokta kalıyordu); üzerine gelince genişleyip Film, Müzik, Kitap ve Web’i gösteriyor, tıklayınca tam menü açılıyor.
- Adres çubuğu tıklanmadıkça dar duruyor, tıklayınca genişliyor; sekmelere daha çok yer kalıyor.

## 2.7.6CC — 2026-10-27

- Luna Web yeni tek satır görünüm: Luna menüsü logoya küçüldü (Film, Müzik, Kitap, Koleksiyonlar, Ayarlar logodan açılır), sekmeler ve adres aynı satırda. Video sayfasında "Luna" düğmesi adresin içinde. Düğmeler Luna’nın yuvarlak düğme ve hap sekmesi tasarımında.
- Eski görünüme dönmek için: logo menüsünde "Klasik tarayıcı görünümü" ya da Araçlar’da "Tek satır tarayıcı görünümü" kutusu.

## 2.7.5CC — 2026-10-27

- 2.7.3 ve 2.7.4 geri alındı: web videosunda çubuk davranışı 2.7.2 ile aynı.

## 2.7.4CC — 2026-10-27

- Web sesi başlayınca müzik çubuğu birden kaybolmuyor: bunu yapan eski bir gizleme kuralı kaldırıldı; çubuk sayfa hazır olunca kayarak gider.

## 2.7.3CC — 2026-10-27

- Web videosu başlarken siyah bar kalmaz: çubuk, sayfanın videoyu açarken yaşadığı ~1 saniyelik takılma geçtikten sonra kayar (sabit gecikme yerine sayfanın hazır olması beklenir, en çok 1,8 sn).

## 2.7.2CC — 2026-10-27

- Web videosu başlarken çubuk kısa bir an bekleyip sonra kayar: videonun açıldığı ilk anda ekran takılırken siyah bar görünmesin diye.

## 2.7.1CC — 2026-10-27


## 2.7.0CC — 2026-10-27

- Web videosu başlayınca çubuk kayarken solmuyor: içeriğiyle birlikte aşağı iner, arkasında siyah boş kutu kalmaz. Küçük film videosu kaymanın başında gizlenmez, çubukla birlikte iner.

## 2.6.9CC — 2026-10-27

- Web videosu başlayınca çubuğun aşağı kayışı yavaşladı ve yumuşadı; geri gelişi aynı kaldı.

## 2.6.8CC — 2026-10-27

- Web videosu başlayınca çubuk sayfanın arkasında birden kaybolmaz: kayma bitene kadar sayfadaki oyuk yerinde kalır, çubuk aşağı kayarak gider.

## 2.6.7CC — 2026-10-27

- Web videosu başlayınca küçük film oynatıcısı aşağı kayarak gider: video artık pencerenin alt kenarına yapışıp sonra birden kaybolmuyor.

## 2.6.6CC — 2026-10-27

- Web videosu başlayınca çubuk birden kaybolmaz, kayarak gider: sayfadaki oyuk çubuktan pencerenin altına kadar uzanır, video başlarken sayfa meşgul olsa da animasyon görünür.

## 2.6.5CC — 2026-10-27

- Web videosu başlayınca küçük film çubuğu giderken küçük video da çubukla birlikte aşağı kayar, birden kaybolmaz.

## 2.6.4CC — 2026-10-27

- Web’den açılan bir filmin sayfasındaki ⋯ menüsünde “Bunu izliyorsun” kontrolü o film için kapatılıp açılabilir.
- Küçük film çubuğu web videosu durunca geri gelirken küçük video da çubukla birlikte kayar; yerinde birden belirmez.

## 2.6.3CC — 2026-10-27

- Web videosu durunca çubuk da gittiği gibi kayarak geri gelir.
- Film ile şarkı arasında geçerken çubuk yalnız yerinde yumuşakça belirir; ardından aşağıdan yukarı ikinci bir hareket gelmez.

## 2.6.2CC — 2026-10-27

- Web sayfasında çubuk geri gelirken de kayarak gelir: sayfadaki oyuk animasyon boyunca her karede çubuğu izler.
- Film ile şarkı arasında geçerken yeni çubuk aynı yerde yumuşakça belirir (aşağıdan zıplamaz).

## 2.6.1CC — 2026-10-27

- Web sayfasında müzik ve küçük film çubuğu sayfanın üstünde yüzer: çubuğun şekli sayfa penceresinden oyulur, altta siyah şerit kalmaz ve çubuk gelip giderken sayfa yeniden boyutlanmaz.

## 2.6.0CC — 2026-10-27

- Web sayfasında müzik ve küçük film çubukları yeniden görünür; yalnız web sayfası ses çalarken kayarak gizlenir, ses durunca geri gelir.

## 2.5.9CC — 2026-10-27

- Web sayfasında video başlayınca müzik çubuğu gizlenince altta kalan siyah boşluk kaldırıldı; sayfa tam yüksekliğe geçer.
- Küçük film çubuğu da web videosu sesle başlayınca filmi duraklatır ve kayarak gizlenir; küçük video tarayıcının üstünde tek başına kalmaz. Film çubuğu görünürken web sayfası ona yer açar.

## 2.5.8CC — 2026-10-27

- Çubuktaki ses kaydırıcısı her zaman görünür.

## 2.5.7CC — 2026-10-27

- Çubuktaki ses kaydırıcısının üst üste binen eski kuralları temizlendi; tek kural: yeri hep ayrılı, hoparlöre gelince açılır, hoparlörden ve kaydırıcıdan ayrılınca kapanır.

## 2.5.6CC — 2026-10-27

- Çubuktaki ses kaydırıcısı fare hoparlörde ya da kaydırıcıdayken açık kalır, ikisinden de ayrılınca kapanır.
- Web sayfasında video başlayıp müzik duraklayınca müzik çubuğu aşağı kayarak gizlenir ve sayfa tam yüksekliğini korur; müzik yeniden çalınca çubuk kayarak geri gelir.

## 2.5.5CC — 2026-10-27

- Neler yeni ekranı onaylanan tasarıma getirildi: bulanık videonun üstünde koyu mavi cam kart, sade başlık, ince zaman çizgisi üzerinde noktalı liste ve sade Başlayalım düğmesi.

## 2.5.4CC — 2026-10-27

- Neler yeni ekranı herkes için yeni tasarımda: daha ince başlık, altında "… sürümünden bu yana N güncelleme" satırı ve renkli noktalı liste; bulanık video arka plan korunur.

## 2.5.3CC — 2026-10-27


## 2.5.2CC — 2026-10-27

- Ses kaydırıcısı hoparlörün üzerine gelince aynı yerde belirir, yeri hep ayrılı olduğu için hiçbir şey kaymaz; hemen kaybolmaz.
- Film ile şarkı arasında geçerken büyük oynatıcının bir an görünüp sayfanın yenileniyormuş gibi görünmesi kaldırıldı; film doğrudan küçük çubukta açılır.

## 2.5.1CC — 2026-10-27

- Çubuktaki ses ayarı açılır balon yerine ses düğmesinin yanında her zaman görünen kısa, ince bir kaydırıcı; fare altında hiçbir şey açılıp kapanmaz.

## 2.5.0CC — 2026-10-27

- Çubuktaki ses ayarı artık ses düğmesinin üstünde küçük bir balon olarak açılır; düğmeleri itmediği için çubuk fare altında titreyip bozulmaz.

## 2.4.9CC — 2026-10-27

- Küçültülmüş film varken YouTube şarkısı açınca film beklemeye alınmıyor, "filme geç" oku çıkmıyor ve film yeniden açılınca oynatıcı kayboluyordu; düzeltildi.

## 2.4.8CC — 2026-10-27

- Luna her açılışta Film bölümünde başlar.

## 2.4.7CC — 2026-10-27

- Küçük çubuktaki videoya tıklamak filmi büyütüp tam ekranda açar.

## 2.4.6CC — 2026-10-27

- Küçük film çubuğu müzik tarafında da filmin turuncu rengini kullanır. Geçiş noktaları kendi renginde: şarkı yeşil, film turuncu; beklerken soluk, çalarken tam renk.

## 2.4.5CC — 2026-10-27

- Çubuktaki ses kaydırıcısı artık yalnız ses düğmesinin üzerine gelince açılır; filme/şarkıya geç okuna giderken çubuk genişlemez.

## 2.4.4CC — 2026-10-27

- Film ile şarkı arasında geçiş artık çubuğun içinde: tek ok düğmesi ve hangisinin çaldığını gösteren iki nokta. Çubuğun üstündeki sekmeler kaldırıldı.
- Küçültülmüş filme şarkıdan geri dönünce oynatıcının tamamen kaybolması düzeltildi (film yanlışlıkla müzik sayılıyordu); film küçük oynatıcıda devam eder.

## 2.4.3CC — 2026-10-27

- Küçük video çubuğu müzik çubuğuyla aynı şekilde: ortada, tek satır, ~780px, zaman çizgisi üst kenarda, küçük video kapak yerinde. Şarkı/film sekmeleri arasında geçiş yumuşak.

## 2.4.2CC — 2026-10-27

- Tam ekrandayken filmi küçük oynatıcıya almak (−) artık tam ekrandan çıkarmaz; büyütünce film yine tam ekranda devam eder.

## 2.4.1CC — 2026-10-27

- Tam ekrandayken filmden Esc ile çıkmak artık tam ekranı kapatmaz; tam ekrandan yalnız F11 ile çıkılır (oynatıcının kendi açtığı tam ekran film kapanınca kapanır).

## 2.4.0CC — 2026-10-27

- Pencerenin büyütme (□) düğmesi yeniden doğrudan tam ekrana geçer; tam ekranda farenin ekranın üst ortasına gidince çıkış düğmeleri görünür.

## 2.3.9CC — 2026-10-27

- Luna son kapanıştaki boyutla değil, her açılışta 1152×684 boyutunda ve ortada açılır.
- Arkadaş puanlarındaki buçuklu yıldız artık gerçek yarım yıldız olarak çizilir; boş yıldızlar soluk görünür.
- Müzik çubuğu tek satır ve ~780px: solda şarkı, sağda bütün düğmeler yan yana. Ses kaydırıcısı ses simgesinin üzerine gelince açılır.

## 2.3.8CC — 2026-10-27

- Luna 1152×684 boyutunda, ekranın ortasında açılır.
- Müzik çubuğu artık tam genişlikte değil: ortada, en fazla 980px genişliğinde kompakt bir çubuk.

## 2.3.7CC — 2026-10-27

- Müzik çubuğu daha kompakt: aynı düğmeler, yarı yükseklik. Zaman çizgisi üst kenarda ince bir çizgi; üzerine gelince kalınlaşır ve tutamaç çıkar. Süre şarkı bilgisinin yanında yazar.

## 2.3.6CC — 2026-10-27

- Film küçültülmüşken müzik açınca alt çubuk artık kaybolmaz: son açılan çalar, film kaldığı yerde bekler. Alt çubuğun üstündeki ♪ şarkı / ▶ film sekmeleriyle ikisi arasında geçilir.
- Arkadaş puanları penceresi afişin içine sığar, cam görünümündedir; uzun yorumlar pencerede kaydırılır.
- Bu akşam ne izlesem: arkadaş seçimi düğmesi yalnız Önerilenler seçiliyken yumuşakça görünür.

## 2.3.5CC — 2026-10-27

- Ana sayfa vitrininde Detaylar ve “Bu akşam ne izlesem?” düğmeleri aynı görünür; parlak bir resim üstünde düğme artık griye dönmez.

## 2.3.4CC — 2026-10-27

- Film kartlarının düğmeleri her yerde Öneriler tasarımında: afişin alt kısmında tek sıra. Arkadaş fotoğrafları artık düğmeleri kapatmaz; üzerine gelince sıranın sonuna geçer.
- Büyük film ızgaralarında kartlar daha hızlı: arkadaş puanları tek seferde hazırlanır, düğmeler yalnız kartın üzerine gelince oluşturulur.

## 2.3.3CC — 2026-10-27

- Ortak film kartı: Keşfet, ana sayfa satırları, Filmler ve Öneriler kartlarında filmi izleyen arkadaşların fotoğrafları ve puanları görünür; fotoğraflara gelince herkesin yıldızı açılır.
- Kartların üzerine gelince her yerde aynı hızlı düğmeler çıkar: Oynat, Fragman, Detay, Sonra izle, İzledim ve Diğer menüsü.

## 2.3.2CC — 2026-10-27

- Öneri listelerindeki afiş kartlarına Sonra izle ve İzledim düğmeleri eklendi.

## 2.3.1CC — 2026-10-27

- Keşfet kategorilerinde birden fazla tür birlikte seçilebilir.
- Kategori sonuçları sınırlı bir sırada kalmaz; aşağı kaydırdıkça o kategorideki yeni filmler yüklenir.

## 2.3.0C — 2026-10-27

- Keşfet kategori menüsü okunabilir cam görünümüne uyarlandı; dışarı tıklama ve Escape ile kapanır.
- Başka bir öneri hazırlanırken mevcut film görünür kalır. Afiş değiştiren hızlı döngü kaldırıldı; özet ve oyuncular için yer ayrılarak kartın boyut sıçraması azaltıldı.

## 2.2.9C — 2026-10-27

- Küçük video oynatıcısında pencere boyutlandırma ve görünüm geçişleri sırasında görüntünün ana arayüzü kaplamasına karşı yerel video alanı ayrıldı.
- Küçültme tam ekrandan çıkış tamamlandıktan sonra yapılır. Küçük oynatıcı pencere kenarından yukarı alındı; ses kontrolünü gizleyen müzik çubuğu kuralları ayrıldı.

## 2.2.8CC — 2026-10-27

- Küçük video oynatıcısı müzik çubuğuyla aynı düzende: solda video ve başlık, ortada oynat/duraklat, 10 sn geri/ileri ve tıklanabilir ilerleme çubuğu, sağda ses ve kapat.

## 2.2.7C — 2026-10-27

- Küçük oynatıcı açıkken film detayına girildiğinde oluşan siyah ekran düzeltildi. Aynı film veya başka bir film oynatıldığında büyük görünüm açılır.
- Küçük oynatıcıya ses seviyesi ve sessize alma kontrolleri eklendi. Tam ekrandan çıkınca pencere ekranın çalışma alanına oturtulur.

## 2.2.6C — 2026-10-27

- Küçük video modu pencere yeniden boyutlandırılırken korunur; geçici ölçü hatası videoyu büyütmez.
- Pencereyi büyütmek otomatik tam ekrana geçirmez. Oynatıcı kontrolleri, ses/altyazı ve diğer pencereler dar ve kısa ekranlara uyar.

## 2.2.5C — 2026-10-27

- Kopya film afişlerinde her dosyanın çözünürlük ve SRT yan dosya bilgisi görünür; eksik çözünürlük bilgisi açıkça belirtilir.
- Keşfet kategori menüsü film/dizi, kategori ve süre gruplarıyla yenilendi.
- Yandex sonuç bağlantıları normal tıklamada doğrudan açılır; yeni sekme kısayolları korunur.

## 2.2.4C — 2026-10-27

- Kopya filmler daha belirgin bir afiş destesi, çerçeve ve kopya rozetiyle gösterilir; üzerine gelince kopyalar yana açılır.

## 2.2.3C — 2026-10-27

- Küçük video oynatıcısının boş görüntüsü düzeltildi; kontroller ve süre bilgisi bir araya getirildi.
- Kayıtlı web videosu açılamadığında sessizce tarayıcıya geçmek yerine kaynak yenileme seçeneği sunulur; izleme konumu korunur.
- Ana sayfa düğmeleri eşleştirildi; kopya filmlerin üst üste afişleri belirginleştirildi.

## 2.2.2C — 2026-10-27

- Web’den açılan filmler kapatılıp Filmler bölümünden yeniden açıldığında kaldığın yer korunur. Baştan başla seçeneği aynı şekilde çalışır.

## 2.2.1C — 2026-10-27

- Web’de gezinirken reklam engellemenin oluşturduğu gereksiz yük azaltıldı; sayfa yükleme deneyimi iyileştirildi.

## 2.2.0C — 2026-10-27

- Güncelleme penceresindeki boş yenilik metni düzeltildi. Normal kullanıcılar, atladıkları sürümlerin yeniliklerini kısa ve tekrarsız bir özette görür.

## 2.1.9C

- Kopya film afişleri kapalıyken tek başlık ve bilgi satırı gösterir; yana açıldığında her kopyanın bilgileri görünür.
- Reklam engelleyici geçici sorgu hatasında açık durumunu korur; yeniden kurulum başlatmaz.

## 2.1.8C

- Web sekmeleri ve bölümler arasında geçişte arka plan sesi korunur. YouTube parçaları ve playlistler mevcut müzik aktarım penceresinden seçilir.
- Video için küçük oynatıcı, beğenme ve playlist seçenekleri eklendi. Oynatıcı ses oturumu Luna Player adıyla gösterilir.

## 2.1.7

- Reklam engelleyici eklenti yönetimi, asistan balonu yerine yalnız gerçek web sekmesinin profilini kullanır.

- Dev İzle, ayrıntı penceresini kapatarak Luna Web’de yeni sekme açar; gizli pencereler tarayıcı etkileşimini engellemez.
- YouTube playlist aktarımı tek videoyu çalmak yerine mevcut şarkı seçme ve liste oluşturma penceresini kullanır. Aktarım oku hafifçe vurgulanır.
- Ana sayfadaki film kopyaları üst üste toplanıp yana açılır. Web başlıklarındaki sezon ve bölüm bilgileri dizi olarak ayrıştırılır.
- Kategoriler, mevcut Keşfet görünümünün içeriklerini filtreleyen açılır menüdür. Ana sayfanın seçim düğmesi ortak cam görünümünü kullanır.

## 2.1.6

- Arkadaş önerileri bütün listeyi beklemez: kayıtlı TMDB tür ve süre bilgileri önce kullanılır; eksikler küçük gruplar halinde, uygun aday bulunana kadar yüklenir.
- Öneriler yüklenirken afişler yumuşak bir sıralama animasyonuyla bekleme durumunu gösterir.

## 2.1.4


- Rust tarayıcı modülünün dosya açıklaması düzeltildi; E0753 derleme hatası giderildi.
- Klip başlangıç ve bitiş alanları dakika:saniye veya saat:dakika:saniye biçiminde gösterilir ve düzenlenir. Geçersiz zamanlar kaydedilmez.

## 2.1.5

- Web filmlerinin değişen akış adresleri ve oynatıcı yönlendirmelerinde devam kaydı korundu; devam konumuna ulaşılmadan sıfır saniye kaydedilmesi engellendi. Film kopyaları ortak ilerleme gösterir ve katalogda yana açılan afiş gruplarında toplanır.
- Luna Web Araçlar bölümüne kullanıcının sağladığı uBlock Origin Lite Manifest V3 paketiyle aç/kapat düğmesi eklendi. Otomatik oynatma yalnız ses kaynaklarını ve 8 saniyeden kısa klipleri atlar. Playlist bağlantıları mevcut müzik içe aktarma ekranını açar.
- HDR kaynağı ve oynatıcının renk çıkışı ayrı gösterilir; HDR çıkış politikası ekranın otomatik bildirilen yeteneklerini izler.
- Arkadaş önerileri seçilen kişilerin içe aktarılmış kayıtlarını kullanır; eksik tür ve süre bilgileri TMDB ile tamamlanır. Arkadaş puanları ilgili kişinin film değerlendirme sayfasını açar. TMDB puanları açıkça etiketlenir.
- Keşfet’e film/dizi, kategori ve süre filtreleri eklendi. Geniş asistanın arkasındaki detay penceresi bulanıklaştırıldı; cam düğmelerin okunabilirliği iyileştirildi. Hatırlanan kopya seçimi sıfırlama üç noktaya taşındı.

## 2.1.3

- Web aktarımının geçici sessize alması kullanıcı sekme tercihinden ayrıldı. Kaynak sayfa, iç içe oynatıcı kareleri ve yeniden başlatma girişimleri native kare kontrolüyle durdurulur.
- HLS ana manifestleri otomatik seçimde önceliklidir. Uzantısız medya adresleri de boyut/süre sınırıyla incelenir; yalnız ses codec'i taşıyan kaynaklara çözünürlük etiketi verilmez.
- Video açılırken vid=auto dosyaya özel uygulanır. Yalnız ses çıkan Web kaynağında başka video kaynağı sınırlı sayıda denenir; uygun kaynak yoksa seçim ekranına dönülür.
- YouTube'da mevcutsa HDR video ve ayrı ses birlikte tercih edilir. Görüntü paneli kaynak HDR/SDR durumu ile ekran çıkışını ayrı gösterir.
- Ana sayfadaki Bu akşam ne izlesem düğmesi slayt göstergelerinin soluna, mevcut sayfa düğmelerinin stiliyle taşındı.

## 2.1.2

- YouTube videoları film kütüphanesi ve devam listesinden ayrıldı; önceki filmin altyazı ve parça durumu yeni videoya taşınmaz. Eski kayıtlar silinmez.
- Web kaynaklarında ayrı ses grubu bulunan HLS kalite seçenekleri ilgili ses akışıyla birlikte açılır. YouTube görüntü ve sesini birlikte alan sayfa oynatıcısını kullanır.
- Kalite bilgisi oynatılan akışın çözünürlüğünden alınır; doğrulanmış PQ/HLG içeriğinde HDR etiketi gösterilir. Kare içindeki oynatma sinyali otomatik açılmada kullanılır.
- Yalnız Web filmlerinde afiş/ad içeren 10 saniyelik eşleştirme bildirimi ve Değiştir düğmesi eklendi. Film detaylarının menüsünden de Web eşleşmesi değiştirilebilir.

## 2.1.1C — 2026-10-25

- Web Araçlar menüsüne en uygun kaynağı otomatik seçme ve oynayan web videolarını Luna’da otomatik açma seçenekleri eklendi; varsayılanları kapalıdır. Ses akışları ve tespit edilen reklam önizlemeleri video seçiminden ayıklanır.
- Kaynak açılamadığında, zaman aşımında veya video motoru hatasında tarayıcıya ve kaynak seçimine dönülür. Luna’da video açılırken sayfadaki video duraklatılır; site tarafından yeniden başlatılması aktarım boyunca engellenir.
- Webden açılan YouTube bağlantıları görüntülü oynatıcıyı kullanır. Site başlıklarındaki izle ekleri temizlenir; film için sayfada belirtilen çıkış yılı TMDB eşleştirmesine eklenir.

## 2.1.0C — 2026-10-25

- Web kaynak seçiminde HLS ana listesindeki gerçek çözünürlükler okunur; çok kaliteli akışlarda çözünürlük aralığı gösterilir. Bilgi bulunamayan kaynaklar Kalite bilinmiyor olarak belirtilir.
- Oynatıcı kalite alanı açık videonun gerçek çözünürlüğünü gösterir; belirsiz Akış etiketleri açıklayıcı hale getirildi.

## 2.0.9C — 2026-10-25

- Webde Luna’da oynat, birden fazla video kaynağı bulduğunda süre, kalite ve kaynak bilgileriyle seçim penceresi açar. Tek kaynak doğrudan açılır; seçim iptal edilirse oynatma başlamaz.

## 2.0.8C — 2026-10-25

- Kaynak videolar süre ve çözünürlüğe göre sıralanır; reklam olarak tanınan ve kısa kaynaklar ana videonun önüne geçmez. Erişilebilir gömülü oynatıcıların video bilgileri de değerlendirilir.
- Kalite listesi ekranın sınırlarına göre açılır; boş/sayısal kalite etiketleri düzenlendi. Uzun altyazı adlarının diğer sütuna taşması giderildi.
- Klip karelerinde yüklenme durumu gösterilir. Web sahne ızgarası daha az ağ isteğiyle ve yakın zamandaki kareleri önce yükleyerek açılır; önizlemede düşük HLS kalitesi kullanılır.
- Webden gelen film adı, site ve izleme eklerinden temizlenip mevcut otomatik TMDB eşleştirmesine verilir.

## 2.0.7C — 2026-10-25

- Tarayıcı videolarında film adı kaynak sayfasından alınır. Devam kaydı sayfa kimliğini, kaynak adresini, referrer bilgisini ve erişilebilir ses/altyazıları saklar; yeniden açılışta oynatma bağlamı geri yüklenir.

- İnternet videosu açılırken ve ileri sarma sırasında yüklenme göstergesi eklendi. Önizleme, sahne ızgarası ve klip aktarımı kaynak adresi ile gerekli HTTP başlıklarını kullanır; klip penceresindeki sıkışma düzeltildi.
- Tarayıcıda erişilebilir JW/HLS kaynaklarının yakalanması genişletildi; kaynak birden fazla kalite sunuyorsa Görüntü panelinden seçilebilir. Açılamayan videolarda tekrar deneme açıklaması gösterilir.
- Luna’da video başladığında tarayıcıdaki video duraklatılır. Tarayıcı sesi müziği duraklatır ve müzik çubuğunu gizler; video tam ekranında Luna çubukları gizlenir.
- Akşam önerisinde konu, otomatik çeviri ve oyuncular gösterilir; afişten ayrıntılar açılır. Arkadaş puanları cam temaya uyar; ana sayfa düğmesi ve asistan müzik kontrolleri yeniden hizalandı.

## 2.0.6C — 2026-10-25

- Ana sayfada Bu akşam ne izlesem düğmesi, önerileri devam kartıyla aynı alanda yumuşak geçişle açar; sayfaya yeniden gelince devam kartı gösterilir. Arkadaş seçimine yuvarlak profil fotoğrafları eklendi.
- Tarayıcıdan video açılmasını engelleyen oynatıcı referrer doğrulaması düzeltildi; yalnız güvenli HTTP(S) kaynak adreslerine izin verilir.

## 2.0.5C — 2026-10-25


## 2.0.4C — 2026-10-25

- Yanıt biçimi ve tarayıcı arama motoru seçimleri Luna temasına uygun, klavyeyle kullanılabilen menülere dönüştürüldü. Başlangıç araması ile adres çubuğu birbirinden ayrıldı.
- Letterboxd profil fotoğraflarında Gravatar desteği ve yeni fotoğraf ayrıştırıcısıyla yeniden deneme eklendi.
- Tarayıcıda diğer siteler için Luna’da oynat erişimi açıldı; erişilebilir video, HLS/DASH, ses ve altyazı kaynakları mevcut oynatıcıya aktarılır.


## 2.0.3C — 2026-10-25

- Öneriler filtre değişince ekranda kalır; gösterilen filmler 8 saat sonra yeniden aday olabilir, yeni filmler önce gelir. Arkadaş puanlarının yanında kayıtlı yorumlar görünür.
- Tarayıcı asistanı YouTube videosunu sağlayıcıya göre özetler: Gemini video bağlantısını, diğerleri alınabilen altyazıyı kullanır. Özet isteği YouTube simgesi ve özel bekleme animasyonu ile gösterilir.
- Tarayıcı yeni sekme bağlantılarını tekrar sormadan açar; asistan bağlantıları varsayılan tarayıcıya gider.
- Geniş asistanda yanıt biçimi üst çubuğa taşındı; müzik kontrolleri, şarkı önizleme düğmeleri ve genişleyen liste onayı eklendi. Film ayrıntıları ekran boyutuna uyar.

## 2.0.2C — 2026-10-25

- Sistem ve bakım için ayrı bir sistem simgesi kullanılır.
- Kütüphane önerileri tükenince yeniden döner; filtreler uygun seçenek bırakmazsa kütüphaneden alternatif gösterilir.
- Bu akşam ne izlesem bölümüne arkadaş seçimi olan Önerilenler kaynağı eklendi. Seçilen filmin önerenleri, varsa kişisel puanları ve notları gösterilir.

## 2.0.1C — 2026-10-25

- Öneriler kişi bölümüne Fotoğrafı yenile ve Fotoğraf seç eklendi; site erişimi engellense bile yerel profil fotoğrafı kullanılabilir ve başarısız yenilemede mevcut fotoğraf korunur.

## 2.0.0C — 2026-10-25

- Arkadaş ortalaması /5 gösterilir; üzerine gelince kimin kaç puan verdiği ve puansız izlemeler görünür. Bu bölüm Öneriler film ayrıntılarında da yer alır.
- Bağlı Letterboxd profillerinin fotoğrafları erişilebildiğinde yüklenir; fotoğraflardan profillere gidilir. Öneriler kişi kartları ve kişi başlığına da profil erişimi eklendi.

## 1.9.9C — 2026-10-25

- Film detaylarında kalan süre toplam sürenin yanında dakika olarak gösterilir. Alttaki eski süre satırı kaldırıldı.
- Bu filmi izleyen arkadaşlar Önerilerdeki izleme/beğeni/puan kayıtlarından bulunur; üst üste duran ad simgeleri üzerine gelince yana açılır.

## 1.9.8C — 2026-10-25

- Asistan yanıtlarındaki küçük film simgesi yalnız kütüphanede bulunan filmlerde gösterilir; diğer bilinen filmlerin üzerine gelince açılan seçenekler korunur.

## 1.9.7C — 2026-10-25

- Asistan yanıtlarında film adlarının yanındaki beğeni emojisi ve Kütüphanende etiketi tek küçük film simgesinde birleştirildi; durum bilgileri ipucunda, işlemler simgenin menüsünde korunur.

## 1.9.6C — 2026-10-25

- Filmlere beğeni, beğenmeme veya puan vermek izlenmiş kaydını da oluşturur; seçimi kaldırmak izleme geçmişini silmez.
- Asistana izlediğini söylediğin filmler yanıtın yanında sırayla değerlendirilir: beğeni, 10 üzerinden puan ve isteğe bağlı not Gönder ile mevcut deftere kaydedilir.
- Keşfet içerik uyarısı yıldızı afişin sağ üst köşesine taşındı; bulanık görselin üzerinde net kalır.

## 1.9.5C — 2026-10-25

- Görünüm ve erişilebilirlik seçenekleri Oynatma ve bağlantılar içine, Luna Web seçenekleri Genel içine taşındı; iki ayrı sekme kaldırıldı.
- Bu akşam ne izlesem kartına mevcut beğeni/puanlama sistemini kullanan afiş üstü beğen/beğenme ve afiş altı Asistana sor düğmeleri eklendi. Üst kısayollar ortalandı.

## 1.9.4C — 2026-10-25

- Geniş asistandaki koleksiyon onay paneli kullanılabilir alana yayılır; film, müzik ve kitap grupları sığdıkça yan yana yerleşir. Liste yüksekliği pencereyle büyür, küçük asistanın kompakt görünümü korunur.

## 1.9.3C — 2026-10-25

- Genel ayarları sadeleştirildi: görünüm/erişilebilirlik, sistem/bakım ve web seçenekleri ilgili bölümlere ayrıldı; atlama/ses oynatmaya, donanım Upscaler’a taşındı. Ayar kartlarının yüzeyleri eşitlendi.
- Sohbet araması, dizini ve üç nokta yalnız geniş asistanda, film adının karşısındaki üst satırda yer alır. Kopyalama/indirme üç noktada; menü katmanları okunaklıdır.
- Tanıtımın Film/Müzik/Kitap vurguları aynı zaman çizelgesine alındı; fazladan kenarlık ve eksik kitap çizgileri düzeltildi, geçişler hafifletildi.
- Keşfet'teki bulanık afişlerin adında kırmızı içerik uyarısı yıldızı gösterilir; puan ve etiketler net kalır.
- AI token sayacı yanıt geldikçe güncellenir. Elle token bütçesi giriş alanı kaldırıldı; kalan hesap kotası alınamadığında açıkça belirtilir.

## 1.9.2C — 2026-10-24

- Müzik zevk profili kayıtlarında mevcut kapaklar gösterilir. Film, kitap ve müzikte konu önemi /5 olarak okunur.
- Zevk testinde Hiçbiri seçeneği eklendi, uzun seçenek metinlerinin taşması düzeltildi.
- Genel arama cam görünümü, kapak/afiş ve mevcut puan, süre ve tür bilgileriyle düzenlendi.
- Ana sayfa önerileri gösterilmiş filmleri hatırlar, tekrar önermez ve Sonra izle listesine kaydedilebilir.
- Yenilik ekranındaki Başlayalım yanındaki koyu şerit kaldırıldı.

## 1.9.1C — 2026-10-24

- Galeri oklarının hover sırasında aşağı kayması düzeltildi; resim ve küçük resimler yüklenirken kontrol konumları sabit tutuldu.
- Zevk testi altı hikâye seçimi üzerinden öneri üretir; süre/kaynak sorularını tekrarlamaz. Sonuçlardaki İzledim düğmesi izleme kaydını tutar ve yerine başka film getirir.

## 1.9.0C — 2026-10-24

- Film resimleri ortak büyük galeri, yan oklar ve küçük resim şeridiyle açılır.
- Dışarıdan önerileri için gereksiz ayrıntı/oyuncu istekleri kaldırıldı, önbellek eklendi; kapsam değişiminde kontrollerin yerleşimi sabitlendi.
- Üç soruluk Zevk testi film önerir. Ana sayfa slayt göstergelerinde yalnız geçerli slayt vurgulanır.

## 1.8.9C — 2026-10-24

- Genel arama çubuğunda küçük öneri listesi, Daha fazla ile kaynaklara ayrılmış tam sonuçlar gösterilir; yazarken sayfa değişmez.
- Tanıtımın beğeni emojisi çizgi ikonla değiştirildi; güncelleme videosu yalnız yenilik kutusunun içine alındı.

## 1.8.8C — 2026-10-24

- Kitaptan çıkışta kapanmış Foliate sayfa belgelerine erişim düzeltildi.
- Dışarıdan kapsamı yalnız kütüphane dışındaki filmleri önerir. Genel arama kütüphane, öneriler, TMDB film/dizi, kitap ve müzik sonuçlarını ayırır.
- F11 bildirimi üst ortaya taşındı; arka plan resimleri galerisi ve yerel token bütçesine göre kalan yüzde eklendi.
- Güncelleme ekranında kullanıcı videolarından rastgele, karartılmış ve bulanık arka plan oynatılır.

## 1.8.7C — 2026-10-24

- Kütüphanede / Fark etmez seçimi Benim için seç yanında iki belirgin, kayar göstergeli düğme oldu.

## 1.8.6C — 2026-10-24


## 1.8.5C — 2026-10-24

- Analiz odak seçenekleri analiz öncesi zevk tercih penceresine taşındı. Eleştiriliyorsa uyar açıklaması gerçek davranışına uygun hale getirildi.

## 1.8.4C — 2026-10-24

- Bu akşam ne izlesem bölümüne tek düğmeyle Kütüphanede / Fark etmez kapsam seçimi eklendi; süre seçenekleri korundu.

## 1.8.3C — 2026-10-24

- EPUB sayfa notlarına okuyucu sayfası eklendi; defterden alınan notlar sayfa etiketini korur. Eski notların kayıtlı konumu okuyucuda ziyaret edilince sayfa etiketi tamamlanır.

## 1.8.3CC — 2026-10-24


## 1.8.2C — 2026-10-24

- Dış kaynaklı yenilik maddeleri kaynak etiketiyle kaynaklarını sonunda gösterir; eski bilinmeyen kayıtlar tahminle etiketlenmez.

## 1.8.1C — 2026-10-24

- Kitap defterine okuyucuyla ortak sayfa/konum notları, not düzenleme ve kayıtlı yere dönüş eklendi.
- Film ayrıntısında Altyazı ekle üç nokta menüsüne taşındı.

## 1.8.0C — 2026-10-24

- Kitap ve film defteri düğmeleri ana eylem satırına yuvarlak ikon olarak alındı; diğer defter girişleri kaldırıldı.

## 1.7.9C — 2026-10-24

- Kitaplık filtreleri tek panelde toplandı; sıralama açılır seçim oldu, mükerrer raf düzenleme kaldırıldı.
- Zevk profili kayıtları aranabilir, sanatçıyı ayrı satırda gösteren listeye dönüştü.

## 1.7.8C — 2026-10-24 — İzleme seçenekleri ve yıldızlar

- Kalabalık izleme seçeneklerinde üst üste duran daireler aynı satırda sağa kayarak açılır ve geri toplanır. Ayrı menü, yinelenen seçenekler ve kaydırma okları kaldırıldı.

- Öneri ve Keşfet ayrıntılarına seçili ülkenin Nerede izlenir bilgisi eklendi. Letterboxd puanları boş ve yarım yıldızları destekleyen sabit beş yıldızla gösterilir.

- Kitabın altı hazır asistan sorusu kapak/raf/defter düğmelerinin yanında doğrudan görünür; ayrı soru penceresi kaldırıldı.

## 1.7.7C — 2026-10-24 — Defterler, tercihler ve profil kayıtları

- Film/kitap defteri ve internetsiz yorum taraması geniş açılır pencerelere taşındı. Kitap ayrıntısına Asistana sor eklendi.
- Analizden önce zevk tercihleri açılır; Analize başla ile işlem başlar. Alttaki ayrı tercih alanları kaldırıldı.
- Kitap filtreleri Tümü ile başlar; seçili filtreye tekrar basınca Tümü olur. Boş beğeni alanlarındaki emoji yönergeleri sadeleştirildi.
- Kitap ve müzik profil sayılarından ilgili kayıtlara erişilir. Kitap ayrıntısında müzik çubuğu için alt boşluk bırakıldı.
- Sağlayıcılar sabit yükseklikte yatay açılır; sığmayan seçenekler oklarla gezilir. TMDB etiketi sol alta taşındı.

## 1.7.6C — Analiz, benzerler ve film ayrıntısı

- Luna Analiz küçültülebilir; film defterinde simgeli beğeni düğmeleri tekrar basılınca seçimi kaldırır.
- Benzerler ilk görünümde en çok beş eser; TMDB önerileriyle tamamlama ve daha fazla arama eklendi.
- Kaynak bilgisi TMDB ipucunda; dosya/altyazı bilgisi menüde; ayrıntıda kalan süre gösterilir.
- TMDB afiş etiketi sağ üstte ve diğer rozetlere alan bırakarak gösterilir; sağlayıcı açılma animasyonu belirginleştirildi.

## 1.7.5C — Analiz menüsü ve film ayrıntısı yerleşimi

- Analiz seçenekleri iki eşit menü satırında; ayarlar ayrı görünümde açılır.
- Sağlayıcı seçenekleri satır içinde yana açılır, alt metnin üstüne binmez.
- Kaynak bilgisi TMDB bilgilerinin altına; Bilgileri düzenle üç nokta menüsüne taşındı.

## 1.7.4C — Analiz seçenekleri ve birikimli yenilikler

- Analiz odağı metni açıklığa kavuşturuldu; üç nokta menüsünde analiz ayarları ve internetsiz tarama toplandı.
- Film sayfasındaki iki mükerrer kısayol kaldırıldı. Zevk tercihleri varsayılan kapalı; önem 5 üzerinden gösterilir.
- Yenilik penceresi son görülen sürümden güncel sürüme kadar bütün kayıtlı değişiklikleri listeler.

## 1.7.3C — Birleşik film defteri ve kompakt sağlayıcılar

- İzledikten sonra ve sahne/kelime defteri mevcut tasarımda sekmelerle birleştirildi; kayıtlar ve oynatıcı defteri korunur.
- Oyuncular Luna Analiz’in hemen üstüne alındı. Kalabalık sağlayıcı grupları üst üste dairesel logolarla açılır; bütün seçenekler erişilebilir.
- Görüntü/Ses başlığındaki dikdörtgen zemin farkı düzeltildi. Yerel tarama ve genel sayfa tasarımı korunur.
- Yerel, yayımlanmamış sürüm. Ayrıntı: docs/LUNA-1.7.3C-DEFTER.md. Push Claude’da; kurulum paketi veya temizlik yapılmadı.

## 1.7.2C — Oynatıcı, altyazı stüdyosu ve izleme ülkesi

- Çarkta Görüntü/Ses sekmeleri; turuncu stüdyo düğmesi ve motor/model seçicili kompakt altyazı stüdyosu.
- Alt mükerrer film defteri düğmesi kaldırıldı; üst düğmenin boş ipucu düzeltildi. Hatırlanan tercihler ve film serileri üç nokta menüsünden açılır.
- AI token sayacı Hesaplar ve anahtarlar başına taşındı. Genel ayarlarda dilin yanında bağımsız izleme ülkesi ve tanıtım sonunda ülke sorusu eklendi.
- JustWatch sonuçları ve önbelleği yalnız seçilen ülkeye aittir; farklı ülkeye geri düşmez. F11 bildirimi küçültülüp üst gezinme çubuğundan uzaklaştırıldı.
- Yerel, yayımlanmamış sürüm. Kontroller ve sınırlar: docs/LUNA-1.7.2C-UI.md. Commit/push/release/kurulum paketi yok; push Claude’da.

## 1.7.1C — Luna 2 PDF arayüz ve kullanım düzeltmeleri

Kullanıcının onluk devir kuralıyla önceki yerel 1.6.11C numarası 1.7.1C olarak düzeltildi; özellikler aynı.

UP/ses/altyazı düzeni, donanım/RAM rehberi, yerel AI token sayacı, elle altyazı arama, kompakt stüdyo, menü/yorum/afiş konumu, dizi bölüm sayıları ve sürüm yenilik penceresi. Ayrıntı ve sınırlar: docs/LUNA-1.6.11C-PDF.md.

## 1.6.10C — 2026-10-23 (local, unreleased)
- Merge the cumulative beta source package over local 1.6.9C without reverting SQLite, Foliate, playback clock, native safety or lazy views.
- Add saved library filters/comparison, browser tab groups and notebook improvements, assistant/taste/text fixes and native book/frame fixes.
- Integrate 54 regression commands into npm test; preserve existing dependencies, identity and updater configuration.
- See docs/LUNA-1.6.10C-PAKET-BIRLESIMI.md for taken/skipped changes and actual verification. No commit, push, installer or release.

## 1.6.9C — 2026-10-23 (local, unreleased)
- Add SQLite persistence and subtitle FTS, SMTC, native gapless preparation and reusable metadata probe.
- Add Foliate reader formats, reference alass/FPS alignment, Windows PGS OCR and AnkiConnect cards.
- Add adblock, NFO matching, smart lists, rename preview/journal, hybrid filename parsing and Chromaprint skip candidates.
- Add opt-in Syncplay, media server sources, stdio MCP, local live captions, recognition and vocal tool adapters.
- Separate Music/Books/Mine/Taste views from runtime state, defer UI chunks, isolate the playback clock, add compiler/lint and regression coverage.
- Add opt-in direct libmpv backend and local distribution/signing drafts. No DLL, SongRec/Demucs binary, installer, signing approval or release is bundled/claimed.
- Details, feature limits and verification: `docs/LUNA-1.6.9C-UPGRADE.md`. GitHub publication remains with Claude.

## 1.6.8C — 2026-10-23 (local, unreleased)
- Validate mpv commands/options/filter graphs and enable CSP. Preserve existing playback controls and sound filters.
- Apply film resume and track preferences as file options; acknowledge native IPC commands instead of restore timers.
- Bound mpv restarts, restore playback state, throttle UI timestamps without dropping PGS timestamps, and use stable cache keys.
- Recover poisoned locks, avoid unchanged state writes, skip protected scan folders, and declare file associations.
- Add optional NVIDIA/Intel VSR, six lazy panels, woff2-only fonts, a regression entry point and CI checks.
- See `docs/LUNA-1.6.8C-HARDENING.md` for verification and unfinished roadmap items. No installer or release created.

## Unreleased — Luna Web plus (new features and fixes, not yet released)
- **Search:** pick Google, DuckDuckGo, Bing, Brave Search, Startpage or Ecosia (start page, remembered). Shortcuts in the address bar open a site's own search: `!yt`, `!w`, `!lb`, `!tmdb`, `!imdb`, `!gr`, `!1000k`, `!eksi`, `!r`, `!gh`, `!maps`, `!tr`, `!g`, `!ddg` (`!yt dune trailer`, or `dune trailer !yt`; a bare `!lb` opens the site; Wikipedia and Translate follow the interface language).
- **Address bar:** suggestions as you type (a tab that is already open switches instead of opening twice, then favourites, history, past searches); arrows, Enter and Esc; Shift+Delete removes a history row; the text is selected on focus; when you are not editing, the host is emphasised and a results page shows the words searched; a warning icon marks plain http pages (not localhost).
- **History (Ctrl+H):** kept only on this computer, never added to an AI request. 1000 pages, one switch to pause it, search that ignores accents and Turkish dotless i, grouped by day, remove one page / last hour / today / all, export. Error pages are not recorded; a late title renames the visit.
- **Clear browsing data (Ctrl+Shift+Del):** history range, cookies, cache and site data (the native `clear-data` action now has a button), recently closed tabs, the download list. Favourites, notes and the reading queue are never touched.
- **Start page:** greeting and clock, search-engine picker, shortcut hints, "Your frequent places" built from history (a tile can be hidden), "Pick up where you left off" (previous tabs), "Continue reading" from the reading queue, recently closed tabs, letter avatars with real favicons; staggered entrance and an orbiting star (still under *reduced motion*).
- **Find in page (Ctrl+F):** counts, next / previous (Enter / Shift+Enter), match case. Matches are painted with the CSS Custom Highlight API: the page's elements are never changed, form fields and scripts are not searched, only a count and a position come back.
- **Reading view (Ctrl+Shift+R, or the button in the address bar):** the page text in Luna's typography; four themes (Luna, sepia, paper, night), text size, serif / sans, line width, reading time, progress line, read aloud (double-click a paragraph to start there), copy, ask Luna, add to the reading queue.
- **Play in Luna:** on a YouTube / Vimeo / Dailymotion / Twitch / SoundCloud / Bandcamp page or a direct media link a button opens it in Luna's own player; the page is muted so nothing plays twice.
- **Tabs:** mute (badge on the tab, Ctrl+M, menu), right-click menu (reload, duplicate, mute, play in Luna, favourite, copy link, open in browser, move, close / close others / close to the right, reopen), drag to reorder, Alt+Home goes to the start page, Ctrl+J opens downloads, print.
- **Shortcuts work while the page has the keyboard** (Ctrl+T / W / L / K / F / H / D / M / J, Ctrl+1…9, Ctrl+Tab, Ctrl+Shift+T / A / R / Del, Alt+Home, F6). Before, they only worked while Luna's own interface had the focus. Only these combinations are taken from the page; Ctrl+C / V / X, AltGr characters and everything else stay the page's.
- Fixes: the tools menu no longer runs off a small window (it scrolls). A muted tab stays muted when the page is shown again; a hidden page is always muted, as before.
- **Also:** a keyboard shortcut list (**Ctrl+/**, or Tools › Keyboard shortcuts) with the `!` search shortcuts; a zoom chip in the address bar (click resets); site icons in the favourites bar, Ctrl+click or middle-click opens a favourite in a new tab; Alt+Enter opens what is in the address bar in a new tab.
- **Backups:** the one-file backup carries the web history and settings like the rest of your data (it is your own file). "Clear browsing data" removes the history from the app; make a new backup afterwards if you keep old ones.
- Checks: `npm run test:web-plus` (31 checks on the models and the native-side guards), `npm run test:find-page` (10 checks of the find script in a real Chromium: what it skips, that the page is never changed, wrap-around, limits; caught a collapsed-range bug in the first version), `npm run test:web-ui` (17 end-to-end flows in a real Chromium with a mocked native layer). The last two are local tools and need Playwright.


## Unreleased — Luna Web "moonlight" pass: command palette, quick searches, history, pinned tabs, a livelier start page, Listen (not yet released)

- **Command palette (Ctrl+K):** one box for everything. In Web: this page's commands (reading view, translate, favourite, zoom, pin, copy link …), open tabs, favourites, history, search engines and quick searches; an address or a search typed into it is offered too. In the library (Film, Music, Books): jump to any part or page, open Settings, Collections, History, the assistant, "open a file / link", the tour, or any film or series you own (opens its details). Case, accents and the Turkish İ/ı do not matter; one short word also matches letters in order ("rdv" finds Reading view).
- **Quick searches ("bangs"):** `!yt dune`, `dune !yt` or just `!yt` (opens the site): YouTube, Wikipedia (English and Turkish), TMDB, IMDb, Letterboxd, Goodreads, Project Gutenberg, LibriVox, Spotify, Google Maps/Images, Reddit, GitHub, and Google/DuckDuckGo/Bing. They work in the address bar, the start page search and the palette; the suggestion row says where the search goes. Only plain https addresses are ever built.
- **Start page:** greeting for the hour, a live clock, the real phase of the moon (drawn from the date), a soft moving glow, a search box with its own suggestions and an engine picker, one-click quick-search chips, **your regulars** (the sites you visit most, weighted by how recent; one click opens the site, × forgets it), and a row of shortcuts at the bottom. "Your corner" gets an "All (N)" button.
- **Tabs:** pin (tab menu or palette: icon only, always first, kept by "Close other tabs"), drag a tab with the mouse to reorder (pointer-based, not HTML5 drag-and-drop, because the window's file-drop handler would stop that on Windows; a tab never crosses the pinned line), Ctrl+PgUp/PgDn to switch and Ctrl+Shift+PgUp/PgDn to move, a turning icon while a tab loads, a calmer, deeper tab strip.
- **Address bar:** when you are not editing it shows the site first and the rest of the address quietly; an orange "not encrypted" chip for http pages.
- **History (Ctrl+H):** every remembered visit grouped by day (Today, Yesterday, the weekday, the date), searchable, one-by-one removal, "Clear history" asks first. Luna Web now keeps 200 pages (was 60).
- **Reading view — Listen:** reads the article aloud with the system voices in the page's language, paragraph by paragraph; the paragraph being read is lit and kept in view; pause/resume, stop, speed 0.8–1.5×. A book being read aloud and Luna's music give way when it starts. Closing the reading view stops it.
- **Fixed — keyboard lost in dialogs:** removing a history row or pressing Stop in the reading view used to leave the keyboard on the page body, so Esc / F9 did nothing for a moment (or never). The focus now goes back to the dialog, and Esc/F9/Ctrl+F also work from the body.
- **Fixed — Web ran a 160 ms page-layer check even while another part of Luna was shown;** it now stops until Web is shown again. The "continue reading" list was re-read from storage on every key typed on the start page; it is read once per visit of the start page.
- **Fixed:** an empty Enter on the start page's search no longer shows an error; the New tab button clears a stale error and puts the cursor in the big search; Turkish error texts from the address and page-reading code (`Bir adres ya da arama yaz.`, `Yalnız http / https …`, `Önce bir web sayfası aç.` …) read in English when the interface is English.
- Checks: `npm run test:browser-magic` (23 tests: sites and moon, history groups, pin/drag/step, quick searches, palette ranking, wiring, styles; in CI) and the older Web checks updated for the 200-page history and the new shortcuts (Ctrl+K, Ctrl+H, Ctrl+PgUp/PgDn, quick searches).

## Unreleased — Luna Web: reading view, smarter address bar, per-site zoom, search engines, recent visits, tab menu (not yet released)

- **Reading view (F9, the book button in the address bar, or Tools › Reading view):** the page's text in a calm reader drawn by Luna: Night, Sepia and Paper themes, text size (also Ctrl +/−), serif or sans, narrow or wide page, a contents list from the page's headings, minutes and words, a reading progress line, lists and tables kept. **Find inside it with Ctrl+F** (F3 / Enter for the next match, Shift for the previous one; accents, case and the Turkish İ/ı do not matter, table cells included). Copy the whole text or hand it to the assistant ("Ask Luna"). No link in it is live and no page script runs; the page layer is hidden while it is open, and Esc or F9 brings the page back with the keyboard on the book button. A long page or one read while loading says so. The choices are remembered.
- **Zoom remembered per site:** zoom a site once (Ctrl +/−, the Tools menu or the page's own Ctrl+wheel) and its pages open at that zoom again; other sites open at 100 %; Ctrl+0 forgets it. Up to 200 sites, on this computer only.
- **Continue reading on the start page:** pages in your reading list that you have not finished, newest first, with how far you got; a click opens the page where you stopped.
- **Address suggestions:** while you type, the address bar offers open tabs ("Switch to tab"), favourites and recently visited pages that contain every typed word (accents, case and the Turkish dotted/dotless i do not matter). The typed text always comes first, as an address to open or a web search. Up/Down, Enter and Esc work; the list is an accessible combobox (listbox, active option announced) and the page layer underneath is cut out like the tools menu, so the list is never hidden behind the page.
- **Search engine:** Google (default), DuckDuckGo, Bing, Brave Search, Startpage, Ecosia or Yandex (Tools menu › Search engine). Only searches change; typed addresses never do.
- **Recently visited:** Luna Web keeps the last 200 pages on this computer (reloads count once, search result pages and Luna's own addresses are never kept; the page's real title replaces the host name when it arrives). They show on the start page ("Recently visited", remove one or clear all) and in the suggestions. "Remember recent visits" in the Tools menu turns it off and deletes the list. They go into the backup file like the other Web data.
- **Tab menu:** right-click a tab (or Menu key / Shift+F10): Reload, Duplicate, Copy link, Open in your browser, Close tabs to the right, Close other tabs, Close tab. Arrow keys move, Esc closes and returns to the tab.
- **Fixed — a search with a colon:** "Dune: part two" or "Re: konu" was read as an address with the scheme "dune:" and refused ("Only http / https web addresses can be opened"). Only a scheme without a space, with `//`, or a known one (file:, javascript:, data: …) is an address now; those are still refused.
- **Fixed — what counts as an address:** "3.14", "v1.2.3", "e.g." and e-mail addresses go to the search instead of a dead `https://3.14`; an IPv4 address such as 192.168.1.1 opens over `http://` (routers and local servers rarely have a certificate).
- **Fixed — tools menu on short windows:** the menu's height was capped at 76 % of the window, but it starts about 168 px below the top, so on windows shorter than ~700 px its lower part left the screen. It now fits and scrolls.
- Favourites bar: a "+N" button opens the full list when there are more than twelve. Small polish: accent line under the active tab, calmer inactive tab close buttons, address bar focus glow, lift on the start page's cards.
- **Keyboard shortcuts panel:** F1 (or Ctrl+/) in Web, also under Tools › Keyboard shortcuts, lists every Web shortcut; a test checks that each listed key is really handled in the code.
- Checks: `npm run test:browser-suggest` (21 tests: engines, address reading, suggestion ranking, visit list, shortcut table, wiring, styles) and `npm run test:browser-reader` (8 tests: page text to blocks, reading time, contents, accent-insensitive find mapped back to the original letters, highlights, reader settings, per-site zoom, wiring), both in CI.
## 1.11.0CC — 2026-10-22 (beta, not built yet: try it with Luna Dev.cmd)

- **Replik ara (Ctrl+K, and on the home page):** type what was said ("köprüde buluşalım") and see every film and moment of your library where it is said, with the line before and after and your words marked. Case, Turkish letters and punctuation don't matter ("koprude bulusalim" finds "Köprüde buluşalım."), a phrase split over two subtitle lines is found, and Enter plays the film from two seconds before the line. It reads the subtitle files beside your films (the Turkish one first, else English, else any; hearing-impaired and forced-only files last) and keeps them in memory for the session; subtitles inside the video file aren't read.
- **Anime openings and endings (AniSkip, off by default):** for animation shows Luna asks AniList for the show's MyAnimeList id and AniSkip's community data for the episode, and the "Skip intro" button appears for the opening, the ending and the recap. It is strict so it never skips the wrong minute: the title must agree, later seasons are used only when an entry names the season, the answer's episode length must be within 15 s of your file, and anything you marked yourself or that the file's chapter names give wins. What is sent: the show's name, the episode number and its length. Settings › General.
- **Comics:** CBZ files that carry a `ComicInfo.xml` are shown as "Saga #12: Fire & Ice" with the writer as author and the language set; comics without it are as before. Comics already in the library are read once more to pick this up.
- **A year ago today (home page):** the films and episodes you finished on this day in earlier years, under the "what to watch tonight" card.
- Native: `library_subtitles` (which subtitle file to read for each film).
- Checks: `npm run test:library` (9 tests, the AniSkip answers are real ones) and 4 more Rust unit tests (ComicInfo fields and titles, subtitle ranking). Every new text has English.
- Not in this version: gapless music playback (it needs a test against a real mpv), `.nfo` files, batch renaming, smart lists, an ad blocker, MCP client, server clients, live captions, vocal separation, song recognition. The Now Playing screen already has a blurred cover background, so a cover tint was not added.

## 1.10.0CC — 2026-10-22 (beta, not built yet: try it with Luna Dev.cmd)

- **Luna Özet (Ctrl+K, and from the home page):** your year, last 30 days or all time as a short story: hours of films and music, the films and episodes you finished with their posters and your top genres, your diary's average and favourites, your most played artists and the hours of the day you listen (a 24-hour dial), the books you finished, and a heat map of the days Luna was open with your longest streak. A playful portrait sums it up (night owl, marathoner, bookworm, music lover, critic, explorer, dreamer). The last page draws a 1080×1350 card you can save as PNG or copy. Everything comes from what Luna already keeps on this computer; nothing is sent.
- **"Bu akşam ne izlesem?" (home page):** tell Luna how much time you have and the mood you're in (tense, light, thoughtful, adventure, moving); it shuffles through your unwatched films and the next episode of shows you've started, picks one that fits, and says why (length, mood, rating, waiting for a while). "Another one" never repeats the last few picks.
- **Quote cards:** the ❝ button on a line in the Lines panel (or Ctrl+K while a film plays) sets that line over a full-size frame of the moment it is said, in Literata italic, with the film's name and time. Three looks (cinema, poster, plain), 4:5 or 16:9, the accent colour taken from the frame itself; save as PNG or copy.
- **Poster colours:** a film's page takes a soft tint from its poster.
- **Scene grid** shows the line being said under each picture; the **clip maker** shows the first and last frame of the clip while you choose.
- **Fix:** `Cargo.lock` now carries the crates 1.9.0 added (notify and the notification, global-shortcut and autostart plugins); before, Cargo added them on the first build.
- Native: `still_frame` (a 1600-px frame as a data address, so the page can draw it) and `save_image` (only PNG or JPEG data with a matching file name; written to a temporary name, then renamed).
- Checks: `npm run test:creative` (10 tests) and 2 more Rust unit tests (base64, picture data). Every new text has English.

## 1.9.0CC — 2026-10-22 (beta, not built yet: try it with Luna Dev.cmd)

New in this version, on top of the merged 1.8.0CC:

- **Luna and Windows (Settings › General):** close to the system tray (music, podcasts and radio go on; a film pauses), media keys that work in every program, start with Windows (to the tray), a library-folder watcher that refreshes films, music and books by itself and can start Whisper for new films without subtitles, and Windows notifications (Whisper finished, new files, a new episode today, backup) shown only while Luna is in the background. All of it is off until switched on. Whisper, downloads and batches show their progress on the taskbar button.
- **Whisper:** speed presets (fast, balanced, quality), Silero voice-activity detection (skips silence and music, so fewer invented lines and a faster run; the 0.9 MB model is downloaded and verified on first use), and the film's names are carried through every window of the audio, not only the first. The command line now comes from a small tested core.
- **Library health (Ctrl+K):** copies of the same file (size plus a hash of the first and last 64 KiB), sample clips, missing files, films without a subtitle file and films without a TMDB match. Nothing is deleted by itself; "Delete…" asks again and sends to the Recycle Bin. Films without subtitles can go to the Whisper queue in one click.
- **Scene grid (Ctrl+G) and clip maker (X):** the playing film as a sheet of 36 pictures, and an MP4, WebM or GIF cut between two moments with mpv's own encoder (size cap 8, 25 or 50 MB, subtitles burnt in on request).
- **Episode calendar (Ctrl+K and the home page):** the next episode of every show in the library from TMDB.
- **Title pages:** the title's own logo when TMDB has one, and "where to watch" (JustWatch data through TMDB, with the source named).
- **Sound and picture:** ReplayGain (track or album), AutoEq headphone correction from a ParametricEQ.txt file (works with the equaliser of the Sound panel), and smooth motion (frame interpolation synchronised to the display) in the video settings.
- **Luna Web:** choose the search engine for the address bar (or your own address) and use bangs such as `!yt`, `!imdb`, `!w`; "Open archived copy" opens the Internet Archive's newest copy of a page.
- **Books:** Atkinson Hyperlegible Next, Lexend and OpenDyslexic as reading typefaces.
- Checks: `npm run test:shell-extras` (9 tests; the AutoEq filter strings are also run through ffmpeg when it is installed) and 7 more Rust unit tests (`shell_core`: folder classification, debouncing, the Whisper and clip command lines). Every new text has English.
- Not in this version (suggested in the ideas list): ComicInfo and CBR comics, gapless playback, `.nfo` files, batch renaming, smart lists, year-in-review, AniSkip, an ad blocker, MCP client, server clients, live captions, vocal separation, song recognition.

## 1.8.0CC — 2026-10-22 (beta, not built yet: try it with Luna Dev.cmd)

Two work streams merged into one tree: the subtitle studio and skipping (1.7.0–1.7.1CC, below as "part A") and the playback extras (sound panel, SponsorBlock, scrobbling, podcast chapters, fast reading, command palette, Trakt, Discord; "part B").

- **One SponsorBlock, one sound panel:** the earlier music-only SponsorBlock switch and the "night mode" menu item of part A were removed; part B's versions (films and songs, categories, ask-first, coloured seek-bar marks; per-part sound profiles with night mode, balance, clear speech and the equaliser) replace them.
- `StudioExtras.tsx` (part A's Settings cards: auto-skip, diagnostics report) was renamed from `PlaybackExtras.tsx`, which part B uses for the sound and SponsorBlock settings.
- Checks: `npm run test:subtitle-studio` and `npm run test:extras-plus` both pass on the merged tree.

## 1.7.1CC (part A) — 2026-10-22 (beta, not built yet: try it with Luna Dev.cmd)

The subtitle studio, finished. Checked with the isolated UI fixture (screenshots in the delivery), the regression scripts and `cargo check`; not run in a real Windows Luna window yet.

- **A studio that explains itself:** a rail on the left with each tool and its state (progress, "needs a file"); Create is three numbered steps. Engines and models are cards: speed and accuracy, "Recommended", "In use", the download progress inside the card, "Use this" for what is installed. Time left is shown for downloads, audio and transcription.
- **Better Whisper subtitles:** the title and the cast's character names from TMDB go to Whisper as its prompt (plain ASCII only, which whisper-cli can read), so names are spelled right; lines Whisper makes up in silence or music ("Thanks for watching", "Altyazı M.K.", amara.org credits, subscribe requests, loops of the same line) are removed and counted. "All episodes without subtitles" / "Only this video" in one click.
- **Whisper pill:** while Whisper works, a small ring with the phase, percent and time left sits in the player's top bar; a click opens the studio.
- **Translation:** "Natural" or "Close to the original (for learning)", how many requests it will take, the latest translated lines side by side as they arrive, and after Stop "Carry on where it stopped".
- **Sync you can see:** a strip shows where the speech is in the audio, where the lines are now and where they go after the fix (a movable 90-second window), a match meter and the overlap with speech before and after. "Preview in the video" tries it without saving; closing the preview puts the old timing back.
- **Clean-up with every change listed:** each fix shows how many lines it alone would change; the lines that will change are listed (removed, new text, longer display).
- **Transcript:** the second subtitle under each line, "Follow playback" and "Back to now", keyboard (↑ ↓, Enter to go there, E to edit), export as text or Markdown (Obsidian) with both languages, explanations remembered per word and line, "In the notebook ✓".
- **Skip intro:** a thin line in the button shows how much of the part is left.
- Fix: a label rule of Luna's dialogs stacked the clean-up options vertically; they are rows again.
- `npm run test:subtitle-studio`: 26 tests (was 21); `studio_core`: 12 unit tests.

## 1.7.0CC — 2026-10-22 (beta, not built yet: try it with Luna Dev.cmd)

Subtitle studio and playback extras. Checked with the isolated UI fixture, the regression scripts and `cargo check`; nothing here has been run in a real Windows Luna window yet.

- **Subtitle studio** (Audio & subtitles › "Subtitle studio…", the right-click menu, or "Make from the audio…" in the subtitle search window):
  - **Create:** local Whisper transcription with whisper.cpp. Download the engine (processor build 4 MB, NVIDIA CUDA 12 build 457 MB; pinned to v1.8.4 and verified by size and SHA-256) and a model (tiny … large-v3-turbo), or point Luna at your own `whisper-cli.exe` and `.bin` model. One video or the episodes of a series that have no subtitle go into a queue that keeps running when the window is closed. The result is written next to the video as `Film.<language>.srt` (never over an existing file), long segments are split into readable lines. Nothing is sent anywhere.
  - **Translate:** the subtitle in another language with the assistant's AI: 40 lines at a time with the lines before and after as context, character names from TMDB kept, timing unchanged, each answer checked (only the asked ids, missing lines keep their text), a stopped run can be kept. The translation can be shown as a second subtitle.
  - **Sync:** Luna listens to the video's audio once, finds where speech is and lines the subtitle up with it: the delay and 23.976 / 24 / 25 fps mix-ups (`sub-delay` and `sub-speed`), remembered per file. It shows how sure it is and how much of the subtitle falls on speech before and after.
  - **Clean up:** hearing-impaired notes, speaker labels, song lines, overlaps, lines shown too briefly to read, long lines, repeats. SRT and VTT are changed in place after a copy of the original is kept in Luna's cache; an ASS file is left alone and a cleaned SRT is saved beside it.
- **Transcript panel (R):** every line of the subtitle with search, click-to-jump, the current line followed, click a word to ask what it means in that line (assistant's AI), add it to the vocabulary notebook or copy it; SRT/VTT lines can be edited. For embedded subtitles the lines seen while watching are kept instead.
- **Second subtitle:** pick one in Audio & subtitles (mpv's `secondary-sid`). The main subtitle is now found as the selected track that is not the second one, so the remembered choice for a video can no longer be the second subtitle by mistake.
- **Skip intro (I):** from the video's chapter names (Intro, Opening, Recap, Previously, Credits, Preview and the Turkish equivalents) or from an intro you marked once for a series (right-click › Intro mark). Settings › General can skip each kind by itself.
- **SponsorBlock in YouTube songs (music, off by default):** skips non-music parts and sponsor talk. Only the first 4 characters of the video id's SHA-256 are sent to sponsor.ajay.app (their privacy lookup); the data is CC BY-NC-SA 4.0.
- **Night mode** (right-click › Audio): evens out quiet speech and loud effects; it can start on for every film (Settings › General) and is removed again for music.
- **Picture:** "High-quality scaling" and **Anime4K** (Fast / High quality) in the video panel; the shaders (0.8 MB, v4.0.1) are downloaded on request and verified. No Lossless Scaling needed.
- **Assistant:** while a film plays it also gets the subtitle lines shown so far (never later lines; no claim to see the picture or hear the sound), and the lines seen while watching for embedded subtitles.
- **Automatic backup** (Settings › Backup): a folder, daily or weekly, how many to keep (3–30). Choose a OneDrive / Google Drive / Dropbox folder and it reaches the cloud by itself. Only Luna's own `Luna auto-backup …json` files are ever removed (to the Recycle Bin).
- **Vocabulary notebook:** export for Anki (tab-separated text with header lines).
- **Settings › General:** a diagnostics report to copy into a bug report (versions, mpv/Vulkan, Whisper and shader setup, the chosen AI service, storage size; no keys, no user name).
- **Safer files:** new subtitles are written through a temporary file and renamed; downloads are size- and hash-checked and deleted when cancelled or incomplete; archive entries are flattened to checked names.
- Windows user names with letters outside plain ASCII: Whisper's command line is given 8.3 short paths (or `C:\Users\Public\Luna-Studio` for its temporary files); when that is impossible the message says which folder to use.
- New: `npm run test:subtitle-studio` (21 tests) and `studio_core` unit tests (11, `cargo test`).
- Not in this version (suggested earlier): podcast transcripts, Whisper lyrics for songs, OCR for picture subtitles, watching together, page/comic/PDF translation, LibriVox audio–text alignment.

## 1.8.0CC part B — playback extras, scrobbling, podcast chapters, fast reading, command palette (side chat, merged)

- **Sound (films):** a new button in the player bar opens Sound: three effect tiles (balance, night mode, clear speech), a 10-band equaliser drawn as a curve you drag (or set with the arrow keys; double-click flattens a band) with 9 presets, and an A-B loop that stays when the panel closes and is marked on the seek bar. Films and music keep separate settings. Only Luna's own labelled mpv filters are added or removed, so other filters stay.
- **Sound and sleep timer (music):** a button on the Now playing screen with the same equaliser and a sleep timer (15, 30, 45 minutes, 1 hour, or when the song ends) that fades the music before it pauses.
- **SponsorBlock:** YouTube links (films and songs) skip the parts the SponsorBlock community marked (sponsor, self-promotion, reminders, music-video parts without music…). Choose the categories and automatic or ask-first in Settings › Playback and connections. Only the first 4 characters of the video id's SHA-256 are sent; a skipped part shows "Undo".
- **Scrobbling:** ListenBrainz (token, own server possible) and Last.fm (own API key and secret; the password is used once and not kept). A listen counts after half the song or 4 minutes; radio, podcasts and audiobooks are never sent. Keys and sessions are kept in Windows' credential store; listens that could not be sent wait and are sent later.
- **Podcast chapters and transcript:** episodes whose feed carries `<podcast:chapters>` or `<podcast:transcript>` (Podcasting 2.0) show the chapters (click to jump) and a searchable transcript that follows the voice, in "About this episode".
- **Fast reading (EPUB):** a button in the reader shows one word at a time at a steady pace (150–900 words/min) with the recognition letter marked; it starts on the page on screen, goes on into the next chapter and the book turns to the word reached when it closes.
- **Command palette (Ctrl+K):** go to any part, open a film from the library (with its poster), run common actions or ask the assistant; recent choices come first, groups stay together, Turkish and English words both find a place.
- **Trakt:** films and episodes from the library show as "watching" on Trakt while they play and are marked watched past 80 %. Sign-in with a code on trakt.tv (device flow) using the user's own Trakt app; tokens in Windows' credential store, refreshed before they run out.
- **Discord:** optional "Watching / Listening to" presence through the Discord app on the computer (the user's own application id); off by default.
- **Seek bars:** SponsorBlock parts are drawn in their category colour on the film and music bars.
- **Assistant:** `/karşılaştır question` asks the same question to the saved API profiles and shows each answer with its time; `/komut` adds, lists and deletes your own commands (`/komut ekle özet3 = Summarise: {metin}`), also manageable in Settings. Your commands appear in the "/" list.
- **Native:** `http_send` (GET/POST for ListenBrainz, Last.fm and Trakt; https or this computer only, only Authorization, Content-Type and Trakt's two API headers, no redirects, answer cut at 64 KB) and `discord_presence` (Discord's local pipe, Windows).
- Checks: `npm run test:extras-plus` (20 tests), also in CI; Rust unit test for the allowed addresses. Every new text has English.

## Unreleased — assistant and browser review (bug fixes and small improvements, not yet released)
- Assistant (Web part): a question or a refusal about the page ("do not translate this page", "is the translation right?", "what is the original price?") no longer translates the page or undoes a translation; only plain commands do, with the right language direction ("from German into English") and the interface language as the default.
- New exact commands `/çevir [language]` and `/orijinal` (listed first in the Web part and in `/help`); slash commands also work with Caps Lock ("/SETTINGS").
- Page reading: a list of articles, an article before the main content, a page wrapped in one form, a huge menu or inline tags no longer give wrong, empty or fragmented text; headings, list items and table rows are marked. Form values stay unread.
- The assistant also sees what the user selected on the page (never from a field), the page language and whether the page was still loading; page data passes a whitelist, and the end of the page block carries a one-time token.
- Native page-read errors are explained in the interface language; the translate tool's default target follows the interface language.

## Unreleased — review pass (bug fixes and small improvements, not yet released)
- Bulk relink: a root folder containing Turkish "İ" no longer produces a broken new path; the preview also finds records whose path lives only in a storage key (book positions, playback preferences); summary line plus "Select found" / "Clear selection".
- Books: saving details without a cover (or picking a candidate with none) keeps the book's own cover; the cover field is only an override with a "use the book's own cover" button; "Select books on this shelf" in the shelf editor; quotation count; the quotation export no longer fails on a damaged tag record.
- Web translation: status and error texts follow the interface language; a page that rejects the finished translation no longer offers a retry that cannot succeed.
- Letterboxd changes: a title without a year matches the same title with a year, like the list merge does.
- Notebook: entries are validated before they are written; search box in the scene / word notebook.
- Settings: the panel no longer slides sideways in narrow windows; relink rows keep their checkbox beside the path.
- Every interface text has English again (`node scripts/i18n-check.cjs` passes).

## 1.6.0CC — 2026-10-22 (beta)
- Books and music get the films' full taste profile in a "My taste" tab (taste map, weights, genres/authors/artists, rating spread or listening hours, most played, gaps).
- Songs: thumbs-up / thumbs-down on every row and "out of 10?" after a vote; the points feed the music taste.
- Liked or disliked books and songs get six-topic scores and genres from the AI once (twenty per message, only new ones, "Measuring…" while it runs); films unchanged.
- Own Letterboxd updates itself daily and follows changed or removed ratings and hearts; missing genres from TMDB; update button on the taste profile.
- Same tab order in every part; the assistant shows a song playing on another part's page and lets you pick it or a general chat.
- "Find songs like this" opens a songs card (new list or grow an existing one); reader music popup has a volume drop-down and popups fade out.
- Luna Analiz: settings, Stop and the running button in order; smoother reading animation. Big player: the assistant stays above the timeline; mouse back closes it.

## 1.5.4CC – 1.5.2CC — 2026-10-22 (beta, tried with Luna Dev.cmd)
- Separate book and music taste, own lists only in "+ Add to list" with a new list, friends' lists read-only, picture gallery, poster preview, share/import lists, podcast fixes.

## 1.5.1CC — 2026-10-21 (beta, not built yet: try it with Luna Dev.cmd)

- Luna Analiz: real half stars; similar titles open their page; Luna-style switches; (i) explains My taste; a settings button (how many reviews, spoilers in or out); the Settings card restyled.
- "+ Add to list": lists grouped under each friend, with search.
- Recommendations: "All films" for a friend (all their lists and picks in one wall).
- Your taste profile: taste map, weights and where they come from, avoided topics, genres, rating spread, what stands out in liked titles, trends across analyses, how generous you rate, gaps, latest analyses.
- Books: Luna Analiz reads 1000Kitap reviews; "In-depth review" asks the assistant for reviews, videos, essays and thinkers' readings with sources.
- Music: volume in the big player; "Liked" always first; playlists get a picture from their songs; Spotify import can be stopped or cancelled; "playlist of songs like this".
- Assistant: a bubble at the bottom right (hidden while a film plays), minimise button, right-click Copy / Ask on selected text (and Cut/Copy/Paste in text boxes), "/" commands with /help that work with every AI, a tool-less retry for models that reject tools.
- .m3u / .m3u8: IPTV lists open as a channel list; HLS streams play directly.

## 1.5.0CC — 2026-10-21 (beta, not built yet: try it with Luna Dev.cmd)

- **"Worth watching?" is now Luna Analiz**, laid out like the rest of the details page: a plain section with Luna's headings, chips and the mode's colour instead of a boxed card. Big "For you" score next to Luna Analiz, review tone, TMDB and Letterboxd; agreement with bars; praise and criticism; topics with score bars.
- **Long reviews are read whole:** Letterboxd cuts long reviews short in its lists (about 470 characters); Luna now fetches the rest. In the feed they open with "Read more"; spoilers stay hidden behind "show".
- **My taste (was "Preferences")**, built like the shared review-analysis app: the importance you set counts 35%, the topics you marked as reasons in titles you liked count 65%, the reasons for dislikes pull a topic down. The "For you" score blends the community score with these, and says why ("Pace is very strong, and it matters to you"). Each topic shows its effective weight, where it was learned from and this title's score; "Apply" takes the suggested importance.
- "After watching" (reasons, note, draft) and the local keyword scan are tidy fold-out sections under it.

## 1.4.9CC — 2026-10-21 (beta, not built yet: try it with Luna Dev.cmd)

- **"Worth watching?" › Letterboxd, live:** the reviews scroll into the card one by one as they are fetched. The AI then reads them in groups of ten: the group being read lights up, and each review gets its tone, topic and a one-line gist. Spoiler reviews stay blurred until clicked. "Stop" cancels.
- **A much more detailed analysis** (the method of the shared "review analysis" app):
  - AI score with what pulls it up and down, and a community score from the reviews' tone and depth plus the stars;
  - what most reviewers agree on, with shares, and where they split;
  - a critic's note, themes, feelings, who it is for, similar titles, a score per topic;
  - the positive / mixed / negative / no-stance split, and every review read, filterable by tone.
- **Taste learning:** each analysis keeps the topic scores. Once three analysed titles are liked or disliked, Luna suggests preference weights ("Apply"), shows "Fits your taste %", and the analysis and the assistant use it.
- **API profiles** (Settings › Accounts and keys): save several services with their own key, model and base URL (up to 8). The assistant and the review analysis can each use a profile. Keys stay in Windows' credential store.
- "Worth watching?" is now also on Discover and recommendation pages.

## 1.4.8CC — 2026-10-21 (beta)

- **AI connection fixed:**
  - OpenAI and Claude sometimes failed with "Couldn't reach the assistant … error sending request".
  - The cause: Luna checked the servers' certificates only against the list built into the program, and those servers now also use a newer issuer that the list lacks.
  - Luna now also trusts Windows' own, always up-to-date certificate store.
  - The error message now shows the real cause (certificate, timeout…).

## 1.4.7CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **"Worth watching?" › Letterboxd + AI:** one button fetches the film's most popular Letterboxd reviews (50 by default) and has an AI sum them up for you:
  - the overall feeling, a "for you" paragraph from your preferences, what is praised and criticised, "you'll like it if / skip it if", and a note per topic;
  - the average star rating and the number of spoiler reviews;
  - the same reviews also go to the local keyword scan.
  The AI is told not to reveal spoilers and to use only what the reviews say.
- **Settings › Accounts and keys › Review analysis:**
  - its own AI (Gemini, OpenAI, Claude, a base URL, or the same as the assistant) and model;
  - how many reviews to fetch (10–100);
  - an extra instruction.
  It uses the keys already entered for the assistant.
- Letterboxd turns away Luna's own connection on review pages, so they are read with Windows' built-in curl.exe; the film is found by its TMDB id, or by title and year.

﻿## 1.4.6CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **"Worth watching?" workspace** in film/series details (library and the assistant's film card):
  - paste or import reviews (TXT/JSON);
  - a local keyword scan by topic: story, pace, acting, visuals, characters, music. The community score and your own signal stay apart.
  - film and series preferences, mood weights and warnings;
  - like/dislike with reasons, a history of 8 scans, and a review draft from your notes;
  - JSON export.
- **Music:**
  - pausing while a YouTube link resolves keeps it paused;
  - stale retries and skips can no longer start another song;
  - a bad start index is clamped.
- **Read aloud:**
  - volume and mute in the bar;
  - the assistant's volume and mute commands reach the reading voice;
  - bad speed or voice settings are cleaned;
  - a voice error stops reading instead of skipping text;
  - no restart after Stop.
- **Books:**
  - notes are kept per file, so two editions don't share notes. Old notes are kept and can be copied on request.
  - a failed save keeps the editor open and shows an error;
  - broken notes can't crash the reader;
  - a stale book search doesn't show old results.
- **Dependency:** @xmldom/xmldom 0.8.15 for epubjs (npm audit: 0).
- **Checks:** 32 more regression tests (`npm run test:next`), also in CI.

## 1.4.5CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Fixes package (B01–B36):**
  - Backup and restore: a wrong-shaped backup, a full storage or a failed save no longer wipes or half-restores data.
  - API keys: saving and deleting a key now waits and shows an error when it fails.
  - Collections: same title in two years, the chosen episode, the right book, YouTube songs, renames and a slow search after a delete.
  - Updates: beta and auto-check switches respected; a retry after a failed download works.
  - Read aloud: pause, speed, voice, stop at chapter end and resume; only listened time counted.
  - YouTube: a broken direct link falls back instead of looping.
  - Letterboxd: real addresses only; remakes kept apart; star values checked; posters not mixed up.
  - Torrents: cancelling no longer deletes files.
  - Wikisource: safe decoding, valid long chapters, and a failed chapter stops the save.
- **Library:**
  - Sort by A–Z, year or rating; filter by genre, unmatched or several copies.
  - Collection search.
  - Letterboxd lists: friend-rating filter and a link to the list.
- **Checks:** 37 regression tests (`npm run test:regression`), also run by CI.

## 1.4.4CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Small window:** leaving full screen (or playing in a small window) no longer blows the window back up to the size of the screen. 1.4.3 checked "is the window inside the screen?" on every resize, and leaving full screen briefly reports a screen-sized window; the check now runs once, when Luna starts.

## 1.4.3CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Same look on every screen:** on screens narrower than 1920 points (e.g. Windows scaling 125% or 150%) Luna zooms out a little, so text, spacing and the top bar sit as on a 1920-wide screen (Settings › "Fit the layout to the screen"). The top bar's labels fold away step by step only when the tabs don't fit.
- **Above the taskbar:** a window that was restored taller than the screen is shrunk and moved back into the space above the taskbar (the assistant's input was hidden under it). Luna opens full screen the first time on a machine.
- **Full screen:** the ⛶ / ✕ buttons wake only at the very top edge, so they no longer cover the "Recommendations" tab.
- **Assistant:** opens as the big workspace (Escape shrinks it only for the moment); the small bubble has the same ⋯ menu by each title (Watched, Liked, Disliked, Watch later, Trailer) instead of the old tick box.
- **Assistant with OpenAI / Claude / base URL:** a message mentioning Letterboxd is no longer pushed to the "film links" tool; the assistant is told the addresses of your own and your friends' Letterboxd (it can read them again with read_link) and what data it has (notes, diary, lists); trivia questions keep Luna's tools (no Google search outside Gemini); a required tool is the only one offered.

## 1.4.2CC — 2026-10-21 (beta)

- A clean rebuild of 1.4.1's code (every build file made anew); checked that the interface inside the program is byte for byte the one Luna Dev runs.
- GitHub: every push and pull request is built and tested (CI), and each release is checked live (downloads, checksums, the updater's latest.json); the services Luna uses are checked daily.

## 1.4.1CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Letterboxd › all their films:** a friend's whole "Watched" list comes in as its own tab (before, only the films they rated 4★+ did); friends connected earlier get it on "⟳ Update". A person with only Letterboxd lists opens on them, not on an empty "Recommendations" tab (that tab only shows when someone typed a recommendation for them).
- **Hide what I watched:** if Luna doesn't know yet what you watched, it says how to connect your own profile ("This is my profile").

## 1.4.0CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

From testing with a friend.

- **Home › where are your films?** With no library folder yet, the home screen asks for one right away ("Choose film folder" / "Choose series folder" open the folder picker). Before, the button only led to the Folders page.
- **Folders › films and series apart:** the Folders page has "Film folders" and "Series folders", each with its own add button; a folder can be moved between the two. In a series folder each show is its own folder, a "Season 2" / "Sezon 2" folder is the season, and "03 - Pilot.mkv" or "Bölüm 3" is the episode, even without S01E03 in the name.
- **The same film twice:** copies of one film (a 1080p and a 4K, or two file names TMDB matches to the same film) sit side by side in the grids and the poster says "2 copies". The details page lists every copy with its quality, subtitles and size; the chosen one is what Play plays (the last watched copy first).
- **SRT next to the quality:** a video with a subtitle file beside it ("Film.srt", "Film.tr.srt") shows "SRT" next to 1080p / 4K on the cards and the details page.
- **Rename a file in Luna:** right-click › "Rename file…" renames the video on disk; its subtitle files get the new name too, and where you stopped, its quality and "finished" stay. The assistant can do it as well ("rename that file to Alien (1979)"), asking first.
- **Full screen:** F11 now also works on the library screens (before only during a film), and each time Luna goes full screen, at start too, a small note at the top left says "Full screen · F11 to leave" for a few seconds.
- **Collections window:** the posters behind showed sharply through the glass. The page behind is now blurred, as under the assistant.
- **The assistant's AI:** besides Gemini, OpenAI, Claude, or any OpenAI-compatible server at a base URL (OpenRouter, Groq, DeepSeek, a local Ollama / LM Studio without a key). Settings › Accounts & keys: pick the service, the key and the model (the list is loaded from the service). All of Luna's tools work with them; Google Search stays Gemini-only, so such answers are marked "no sources".
- **Letterboxd:**
  - the link box takes a user name, "@name", "letterboxd.com/name" or a full link (a page with a query or a "www." no longer fails); an unknown user says so;
  - while a profile is read, a card shows what is being read ("Watched: page 3 · 214 films", "List 4/12…") and for how long, instead of a silent wait of a minute or two;
  - "This is my profile": your own watched films (with your stars), likes and watchlist are saved in Luna (the diary and "Watch later"), and "⟳ Update" refreshes them;
  - "Hide what I watched" on friends' recommendations and their Letterboxd lists hides the films you already watched (ticked, rated or on your Letterboxd); it remembers the choice.
- (Dev: the browser mock can add folders, rename, read Letterboxd with progress and answer as OpenAI / Claude.)

## 1.3.9CC — 2026-10-21

- **Books › no second copy:** a free book that is already in the library (asked for from the open-libraries row or by the assistant) is opened from the library instead of being downloaded again as "… (2).epub". Its card says "In your library · read".
- **Audiobooks › only audiobooks:** the most-listened row showed LibriVox's cover-art picture sets ("Thumbs 12", "LibrivoxCDCoverArt…"); only recordings are listed now, and a book read more than once shows its most listened reading (a search still shows every reading).
- **README:** new pictures (music, books, the assistant asking which one) and the text covers music, books, collections and updates.

## 1.3.8CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

Bug pass.

- **Header › all tabs on a laptop:** at 1280–1400 px wide the seventh film tab (Öneriler) was cut off and hidden. The tabs sit closer there and "Dosya aç" keeps only its icon (with its tooltip), so all of them fit. On narrower windows the tabs still slide sideways, but now the mouse wheel moves them, a fade at the edge shows more are waiting, and the open tab is brought into view (before, with no scrollbar, some tabs couldn't be reached by mouse).
- **Music › a song that won't open:** a missing or broken file left the bar at 0:00 showing "Pause" as if playing, and the queue stopped there. Now it is skipped after the "couldn't open" warning, and the next song plays. After 3 in a row (for example a drive unplugged), or at the end of the queue, Luna stops and pauses instead of running through the rest. A radio station that fails just stops.
- **Player › panels:** the Upscaler panel stayed open under the audio/subtitles or video-settings panel and the two overlapped. Now opening one closes the others, and the Upscaler panel closes on a click outside it like the rest.
- **Player › Esc:** with a panel or menu open, Esc closed the whole film. Now the first Esc closes the panel, the next one leaves the film.
- **Esc closes windows:** Esc now closes the window on top everywhere, as a click beside it does. Before, many didn't close on Esc (open link, subtitle search, confirmations, the music link…). A window over the film or a book closes alone; the film keeps playing.
- **Reader › comics in Luna Dev:** CBZ comics stayed on "…" and never showed a page in the development build (React's double mount left a "closed" flag set). The installed build wasn't affected.
- **Reader › Esc in the search box:** closes the panel now (a note being written is still not thrown away by Esc). The contents button opens on the contents again, not on the last search.
- (Dev only: the browser mock can now deliver events and acts as a small mpv, so playback can be tried there.)

## 1.3.7CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Tour › no release file name:** the library step no longer shows a film's release file name ("Dune.Part.Two.2024.1080p.mkv"); it says "Filmler klasörü taranıyor…" instead.
- (Checked: the tour's posters show without a TMDB key, since TMDB's image server needs none; only an internet connection.)

## 1.3.6CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Tour › real posters:** the films the scenes name show their own posters (Prisoners, Zodiac, Dune 1984, Blade Runner 2049 on the picture-quality step), and with an empty library (a first run) well-known films fill the shelves. Shown from TMDB's image server like the library's, nothing copied into Luna. None on the torrent step, and the content-warning step uses no real film.
- **TMDB credit:** the notice TMDB's API terms ask for is in Settings › General (under the version) and a small "posters from TMDB" line sits under the tour's step counter.

## 1.3.5CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Tour › the whole of Luna for someone new:** 16 steps now. Added: Picture quality (Lossless Scaling driven by Luna: a sharp/soft split moving over a picture, 60 → 120 FPS, subtitles kept sharp; Q and the UP button), History and safety (one history of films, songs and books, a backup in one file, signed updates) and Shortcuts (Alt+A for the assistant first, then Ctrl+O, Ctrl+N, Space, F, ← →, Ctrl+→, Alt+←, Esc, lighting up in turn). The film assistant step now sits with the film steps.
- **Tour › Alt+A:** both assistant steps say the assistant opens from any screen with Alt+A.
- **Tour › what's new:** the short tour for people who saw the old one also gets History and safety and Shortcuts.

## 1.3.4CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Tour › the whole of Luna:** the first-run tour now shows all of it, 13 steps: a new welcome (the three parts circling the mark), "Film, Müzik, Kitap" (the switch moving between the parts in their colours), Music (synced lyrics lighting up, the music bar, radio / podcasts / likes), Books (a page read aloud word by word, Gutenberg / Vikikaynak / LibriVox), the assistant everywhere (the "Hangisi hakkında?" chooser, a web search, ready questions) and Collections (research steps, the confirmation card with ticks, "Çıkması bekleniyor"). Music and Books slides take their part's colour; new steps carry a "Yeni" badge.
- **Tour › what's new, once:** someone who saw the older tour gets a short "Yenilikler" tour of only the new steps the next time Luna opens. Settings › "Tanıtımı göster" still shows the whole tour.

## 1.3.3CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Assistant › from the "now playing" screen:** the assistant opened over the full song screen is about the song: it comes first in the chooser (picked), the header shows its name and the ready questions are about it.

## 1.3.2CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Assistant › two things open at once, you pick:** the assistant now sees everything open at the same time — the film or episode playing, a film page, a book in the reader or its page, the song, radio or audiobook playing — in every part of Luna. When two or more are open, a small "Hangisi hakkında?" row above the message box lets you pick which one the chat is about ("bu", "bunu" then mean that one); it appears only then. A message that names one ("çalan şarkı…", "izlediğim film…") picks it by itself.
- **Assistant › the song in the film part:** with only a song playing, the film part's assistant knows it too (before, only the music part did).

## 1.3.1CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Collections › a book added by hand finds your shelf:** a book typed into a collection ("＋ Ekle" › Kitap) that is already in your library is matched to it (its full title, cover and author), so it opens from the collection.

## 1.3.0CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Music › the bar is whole again:** the heart had a column of its own in the music bar, so the lyrics button, the volume and the close button were pushed onto a second row out of sight and the controls sat at the right edge. The heart now sits beside the song; the controls are in the middle and the volume is on the right again.
- **Music › narrow window:** the volume stays (shorter) instead of disappearing; only the lyrics button is hidden.

## 1.2.9CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Collections › no more see-through layers:** while the big assistant is open over the collections, the collections page waits hidden behind it (two glass panes showed through each other); it is back when the assistant closes or shrinks.
- **Collections › the real music bar:** instead of the small bar of 1.2.7, Luna's own music bar (seek, volume, shuffle, repeat, like) shows over the collections page while music plays, and the page moves up to leave it room.
- **Collections › the Google button** shows Google's coloured "G" instead of a plain letter.

## 1.2.8CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Assistant › an existing collection first:** asked for a collection on a subject you already have one on ("Dune" → "Dune Evreni"), the assistant makes nothing new: it says you have it (and what's in it) and offers to look again for new and missing things. A "yes" (or "look again / update" in the request) searches the internet again and adds only what the collection doesn't have yet to the same collection; if nothing is new it says it's up to date.

## 1.2.7CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Collections › the assistant opens over the page:** "find", "what is it about", "let the assistant add" no longer close the collections; the assistant (big or small) opens on top and closing it brings you back. Esc closes the assistant first.
- **Collections › buttons instead of words:** each row has small buttons: play / read / download, **G** (search it on Google), the YouTube trailer (films and series) and ✦ (let the assistant find it). The right-click menu has Google and the trailer too.
- **Collections › add by hand:** "＋ Add" (and "Add by hand…" in Edit) opens a small form: film/series, song or book, its name, year / artist / author and a note. A song is looked up on YouTube so it plays; a film in the library is joined to it. A new empty collection opens with the form ready.
- **Collections › music plays with the page open:** a song plays with the collection's other songs after it, and a bar at the bottom of the page shows what's playing (previous, pause, next, "Go to music").
- **Menus and the small assistant stay sharp and on top:** they were inside the part of Luna that a full-screen page blurs, so the Edit menu came up blurred behind the collections. They now open above everything.
- A book or a film opened from anywhere (the assistant too) closes the collections page, so it doesn't stay on top of the reader or come back after the film.
- **Subtitles:** a failed OpenSubtitles search or download is tried four times (a short wait between) before the error is shown; a wrong key or the daily limit is shown at once.

## 1.2.6CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Assistant › collection films checked on TMDB:** before the confirmation card every film is looked up on TMDB; when it belongs to a series (Dune: Part One → Dune Collection) the series' missing films are added, the newest and the announced ones too. A film whose date is still ahead is marked "Expected: <date>"; one whose date has passed but isn't marked released is searched by name on Google ("has it come out?") and is added as out or as expected by the answer.
- The internet research before a collection follows the same rule for announced films.

## 1.2.5CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Assistant › collections are researched on the internet first:** before making a collection the assistant runs a Google search for the subject (every book, every film and series with its release status, the best-known soundtrack pieces) and builds the list from that, not from memory, so new films and books are in. Announced but unreleased ones are added with "coming: <date>". If the search can't be used, nothing from memory is passed off as a search.
- **The assistant knows today's date** (it's in every request now), so it knows its own knowledge may be older than what has come out.

## 1.2.4CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Assistant › collections follow your words first:** "the new films" means only the new adaptations (no old ones), "films" means no series, a director, year or genre narrows it; it is complete only inside what you asked for, and the songs come only from what made it in.
- **Collection confirmation has ticks:** every film, song and book on the card has a checkbox (all ticked); untick what you don't want and only the rest is saved. The count per group shows how many are kept, and the assistant is told what you took out so it doesn't claim or suggest them again. Unticking everything is the same as Cancel.

## 1.2.3CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Assistant › collections are complete:** unless you set a limit, a collection now holds every book of the series or universe (in order, other authors' sequels and prequels too), every film and series adaptation (old ones, miniseries, spin-offs; nothing unreleased), and for each of them the 3–5 best-known soundtrack pieces one by one with their composer (not album names), so they play. For any subject, not only Dune.
- Songs and free books for a long collection are looked up six at a time (up to 80 items) instead of all at once.

## 1.2.2CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Assistant › collection confirmation names everything:** before saving, the card lists each film, song and book by name (with year or person and the assistant's note), grouped, instead of only "2 films, 2 songs, 2 books".

## 1.2.1CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Assistant › collections, fixed again:** a collection request that also mentioned "soundtrack" (or another behind-the-scenes word) was sent to a Google search, which has none of Luna's tools, so the assistant said it couldn't make the collection. Only the exact spelling "koleksiyon" was caught before; now typos ("koleksion"), lists and any "make / add / gather / download / take me" request always go to Luna's tools.

## 1.2.0CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Assistant › take me there (new):** "take me to Discover", "open the radio", "show my collections", "my history", "settings"… the assistant closes and Luna opens that page in the right part (film, music, books).
- **After making a collection** the assistant closes and the collection opens, so you see it at once (the answer stays in the chat).
- The assistant's working steps are back as before (each shows at once; no waiting at the end).

## 1.1.9CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Assistant › collections, fixed:** since 1.1.7 a request with Luna's tools failed (the collection tool's nested list was likely refused by Gemini), so the assistant answered without tools and wrote the collection out as text without saving it. The tool now takes plain lists ("Name | year or person | note"). If the tools still fail, the note under the answer says so with the real error ("Luna's tools couldn't be used, nothing was done …") instead of "Google search couldn't be used", and the assistant no longer pretends it did something.
- **Collections keep names and join what can be had:** films and books not on disk are saved by name; songs are looked up on YouTube so they play from the collection; for books a free edition is searched (Vikikaynak, Project Gutenberg): the item then says **Download**, and a click brings it into the library and opens it. Nothing is downloaded without that click.

## 1.1.8CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Books › Discover › Vikikaynak (Turkish, new):** Turkish works out of copyright from Turkish Wikisource (Sabahattin Ali, Ömer Seyfettin, Halit Ziya, Nutuk…), legal and free. Luna turns the work's pages into an EPUB with chapters and a contents list (long works take up to a minute).
- **The assistant looks in every free source at once:** Project Gutenberg, Vikikaynak and the catalogs you added, then shows the best match on the "Is it this one?" card with where it was found. If nothing free has it, it says so and doesn't point to pirate sites.
- **Assistant:** asking for a collection with "soundtrack" in it no longer turns into a web search that only writes the list as text (it really makes the collection now); while it gathers a collection, the film reel, sound bars and page-flip animations play in turn; each step stays on screen a moment (the work itself isn't slower).
- Ready questions are ordered longest first so the chips fill the rows tidily, in both languages; the assistant's welcome text fits the part you're in (music, books).

## 1.1.7CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Collections (new, in every part):** the new "Collections" button in the top bar. A collection keeps films, songs and books around one theme, e.g. ask the assistant "make a collection about Dune: the films, the music, the books". They don't have to be in your library: what is opens with one click (Play / Read), the rest says Find and the assistant looks for it. "Add to a collection…" in the right-click menu of films, songs and books; rename, delete, remove an item, "have the assistant add to it". The assistant asks before it makes or changes one, and Undo works.
- **One history:** the same window has a History page: films (each sitting of more than a minute, with how far you got), songs and books together, by day, with Film / Music / Book filters; click to open again, right-click to remove, or clear it all. The assistant knows the last two weeks ("what did I watch yesterday?").
- New ready questions: a collection for a film you love / the book you're reading.

## 1.1.6CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Luna updates itself (new):** a while after opening (at most twice a day) Luna looks at its GitHub releases; when a new version is out a card at the bottom says "Luna 1.2.0 is ready" with **Update**, What's new, Later and Skip this version. Update downloads it, checks the signature, installs it and reopens Luna; your data stays. The portable zip and the developer build open the download page instead.
- **Settings › General › Updates:** check now, "Tell me when a new version is out", and **Get beta versions too** (off by default; turning it on warns that betas may have bugs and offers to back up first).
- The version number in Settings now really follows the changes (it had stayed at 1.1.1 since 1.1.1CC).

## 1.1.5CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Assistant › free books:** asking for a book that isn't in the library ("Suç ve Ceza'yı istiyorum") searches the free libraries with the page-turning animation and shows a card with the cover: "Is it this one?" → **Yes, save it** (downloads into the library) → **Read**. "Another edition" goes through the other results; a book already in the library shows Read at once; a saved book deleted later goes back to Save.

## 1.1.4CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **The assistant's ready questions:** "What is this film / series / book about?" (no spoilers) is now the first one on a film's page, in the right-click menus of films, series and books, and "What is the book I'm reading about?" in Books.
- Versions (fixed): the last number counts to 9, then the middle one goes up (1.1.9 → 1.2.0). 1.2.0CC was renamed 1.1.3CC.

## 1.1.3CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Books › delete on right-click, everywhere:** every book of the library (home shelves, "Continue reading", the library, the reading history, the cover on a book's page) now has "Delete the reading record" (where you were, like, rating, note; the file stays) and "Delete the file (to the Recycle Bin)", each asked first.

## 1.1.2CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Read aloud:** changing the voice while reading now switches at once (the pieces already prepared in the old voice were played first; leaving the book was needed).

## 1.1.1CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Read aloud › the best voices first:** the voice menu now lists Microsoft's newest voices first (Ava, Andrew, Emma, Brian: the 2024 multilingual "Copilot" voices), then the other new multilingual voices, then the voices made for novels; old copies and the children's voice are hidden. The book's own language comes first (at most ten, "Other voices in this language…" for the rest); the multilingual voices can read Turkish and other languages too.
- If Microsoft's service drops the connection (it does now and then when asked quickly in a row), Luna tries once more before switching to Windows' voice.

## 1.1.0CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Books › read aloud (new), with Microsoft Edge's natural voices** (as in Edge's "Read aloud"): the speaker button at the top of the reader, or Ctrl+Shift+U. The sentence being read is shaded and the word being said is marked, in step with the voice; the pages turn (or scroll) by themselves and it goes on into the next chapter.
- **Read from here:** select any text and choose "🔊 Read from here" (while reading: "Continue from here"). Without a selection it starts from the top of the page, or from where you stopped if that is on the page.
- **The reading bar:** previous / next paragraph, pause, speed (0.5×–2×, the voice keeps its pitch), voice (Emel or Ahmet for Turkish, the book's language first, multilingual voices, or Windows' own voice offline), sleep timer (15 / 30 / 60 minutes or the end of the chapter), close.
- Music pauses when reading starts, and the reading waits if you start music. Headset keys pause the reading. Changing the chapter from the contents or the search reads on from the new page.
- If Edge's voice can't be reached, Windows' voice reads on and the bar says so. The first time, the bar also says that the page's text goes to Microsoft's speech service, as in Edge.
- The time listened goes into the reading history (🔊). The assistant can start and stop it ("kitabı sesli oku", "okumayı durdur"); while a book is read aloud, "durdur / devam" are for the reading.
- Versions: a new feature now raises the middle number (1.1.0); fixes raise the last one.

## 1.0.10CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Book reader fixes:** the selection menu appears only after the mouse button is released and sits above the selected text (under it near the top), never over it. The reader now lives in the app's own layer: the small assistant shows over it, right-click menus work in it, and the big assistant blurs it (the text no longer shows through). The assistant button opens a menu: open the assistant, a spoiler-free recap, talk about the book, what to listen to while reading.
- **Music › Liked (new, like Spotify's Liked Songs):** ♥ in the player bar, Now playing and the reader's music panel, and in every song's menu. Library › "Liked" has songs and podcast episodes in two tabs, play / shuffle; it can't be deleted (a song leaves it when un-liked). A "Liked" card leads the lists on the music home and in Lists.
- **Music › History (new):** every listen, day by day with the time; remove one or clear all.
- **One song menu everywhere** (Discover, library songs, playlists, liked, history, most played, the player bar): the assistant's questions, play, play next, add to the end of the queue, like, add to a list, open on YouTube / Spotify or search YouTube, copy the link.
- **Discover:** switching country shows "Loading the … list" with placeholders.
- **Books › shelves (new):** All · Reading · Finished · Liked · Disliked · History. Liked and finished books also show on the books home. Books read from a link or "Open file" count too.
- **Reading history (new):** every sitting with a book is kept (day, time, minutes, from % to %), with the total reading time; remove one or clear all.
- The assistant also knows your liked songs and episodes, your listening history, books marked as read and your reading history.

## 1.0.9CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

The book reader in the approved Apple Books–style design:

- **Highlights and underlines** (EPUB): select text → yellow / green / blue / pink or underline, a note, copy, or "Ask the assistant" about the passage. A click on a highlight changes its colour, edits its note or deletes it.
- **Notes:** a note on a highlight, or on the page (the pencil at the top; also for PDF and comics).
- **Bookmarks:** the bookmark at the top right marks the page (filled when the page is marked).
- **One side panel:** Contents · Bookmarks · Notes (every highlight and note, newest first, click to go there) · Search (EPUB: every place the words appear, with the text around).
- **Ask the assistant** at the top: a spoiler-free reminder of the book up to the chapter you're in.
- **Themes and settings:** six themes (Original, Quiet, Paper, Evening, Night, Forest), text size, **brightness** (darkens the page; Windows' brightness isn't touched) and **warm light**, font, line spacing, bold text, scroll to read, two pages on wide screens.
- The top and bottom bars take the page's colours and fade while you read (a mouse move brings them back); the bottom shows the pages left in the chapter.
- Panels and menus close when you click anywhere else, in the book page too.
- Highlights, notes and bookmarks are kept per book on this computer (and go into the backup file).

## 1.0.8CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Music is fetched as sound only, always.** A song found by a YouTube search (Discover, Spotify lists) was left to mpv, which turned the search into a new entry without the audio-only settings and fetched the 1080p video too (the clip showed through behind the assistant, and it took ~4 s). Luna now finds every YouTube song's audio-only address itself (the search through YouTube's quick search service) and gives mpv only that: it starts ~0.2 s after the address is found. If Luna can't find it, mpv tries, still sound only; a film resets mpv to picture and normal quality.
- **yt-dlp folder build:** it starts in ~0.4 s instead of ~1.1 s for every song (the one-file build unpacked itself each time); a lookup went from ~2.4 s to ~1.6 s. Weekly self-update works with it. `scripts/fetch-mpv.ps1` and `package-portable.ps1` use it; the installer ships `mpv/yt-dlp/`.
- **Loading shows:** from the click until the sound starts, the song row and the player bar show a spinner and "Loading…" (the previous song pauses meanwhile).
- **Sooner starts:** a song is prepared after the mouse rests on it 0.12 s (up to four at a time); an opened playlist and the Discover chart prepare their first three.
- **Right click on played songs** (music home "Most played", the reader's "Recently played") and on recently played podcast episodes: remove from the list, copy the link, open in the browser (YouTube / Spotify page, or a YouTube search for a song found by name; the episode and its RSS feed).

## 1.0.7CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Serious fix: a song no longer opens as a video or lands in Films.** The music queue was briefly empty while mpv still had a song (opening a YouTube link cleared it first and then waited for YouTube); the app took that song for a film. Music is now also recognised by the addresses it was loaded from, and a YouTube link keeps the music going until its songs are ready.
- **Music and films:** starting a film pauses the music instead of throwing it away; when you close the film the song is back where it was, paused (no headset key starts it during the film). Live radio just stops.
- **Songs start sooner:** resting the mouse on a song (Discover, library songs, playlist rows, the reader's music panel) starts finding it, and a click while that runs waits for it instead of starting a second search.
- **Music › Discover:** a search box for songs and artists.
- **Podcasts:** in Now playing the tab is "About this episode" (the episode's own description and date) instead of lyrics; a recently played episode queues the rest of its show, so "Up next" has the episodes.
- **Book reader:** a ♪ button in the top bar opens a small music panel: what's playing with back / play-pause / next, and your lists, recently played songs and podcasts to start without leaving the book.

## 1.0.6CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Podcasts:** the last episode of each show you listened to is remembered: "Recently played" on the podcast page and "Pick up your podcasts" on the music home page. A card carries on the episode where you stopped (with how much is left) and "Episodes" opens that show's other episodes; the episode you were on is marked in the list.
- **Books:** the "Continue reading" card has the book's backdrop (the painting found on its details page, else its cover), blurred and darkened, like the details page.

## 1.0.5CC — 2026-10-20 (beta, not built yet: tried with Luna Dev.cmd)

- **Music › Discover (new):** what's most played now in 16 countries (Apple's open charts, no account), songs of the artists you listen to most, and genre buttons that have the assistant make a playlist. Songs play from YouTube; nothing is downloaded.
- **Music library tabs:** Albums / Artists / Songs also show the songs from your Luna lists and the ones you've played from links, so they work without a music folder ("- Topic" / "VEVO" channel names become the artist).
- **Songs start sooner:** the next YouTube song's audio address is found while the current one plays (and the first one when a playlist page opens), so it starts at once; if that address fails, it's loaded the usual way without a warning.
- **Playlist page:** in a small window the page behind no longer shows through the song list (darker, more blurred).
- **Assistant:** "durdur", "devam", "sonraki", "önceki", "sesi kıs / aç / 40 yap", "karıştır", "ne çalıyor" act at once without asking the model (it used to say "stopped" without doing it); a new player_control tool covers other wordings. A song in a Luna list is found by title and artist in any order ("Duke Ellington Solitude") and plays inside that list; a song that's nowhere gets the YouTube card ("not in your lists, found it on YouTube": add and play, or just play) instead of "not found". Recommendations in films, music and books give both what's in the library and new finds outside it.
- **Copied links:** a Spotify, YouTube, Apple Music, podcast, torrent, video or book link copied in another program brings a small "Import / Close" note at the top for 30 seconds (from when Luna is in front); it can be turned off in Settings › General, and then the clipboard isn't read at all.
- **Podcasts:** a podcast link (RSS feed, Apple Podcasts, Spotify show) is recognised in the music link window: the show is followed and opened. The shows you follow are on the music home page.
- **Backup (Settings › Backup, new):** one file with your records, lists, notes and settings (not the media files, not the API keys); restore from it; buttons open Google Drive / OneDrive / Dropbox so you upload it yourself.
- **API keys** (TMDB, OpenSubtitles, Gemini) are kept encrypted in Windows' Credential Manager instead of plain text; an old plain copy is moved there and removed from Luna's settings and its state file.
- **Torrents carry on after a restart:** the engine remembers its downloads; they show in Downloads again and continue.
- **Unknown files:** a video added by hand whose name TMDB doesn't recognise gets a small "I couldn't recognise this file — write its name" card; nothing found again says it may not be a film.
- **yt-dlp updates itself** once a week in the background.
- **DeepSeek's findings (4 + 2):** "[REC] (2007)" / "[REC] 2" keep their bracketed titles; a font added later no longer overwrites one with the same file name; the Folders breadcrumb shows inside sub-folders again; quick ± clicks on the subtitle timeline add up; a subtitle's language from the server can't put the file outside the video's folder; deleting a finished torrent stops it first even when it plays as a local file. Also: an old "recommend" check in the assistant had a broken character and never matched.

## 1.0.4CC — 2026-10-20 (beta)

- The `Luna Player.exe` in the project folder finds the project's mpv again (videos play from it); since 1.0.2 it only looked beside itself.
- The project folder's Windows permissions were put back to normal: a tool had marked it "low integrity", so every program started from it (Luna too) couldn't write its settings and closed at once ("os error 183").

## 1.0.3CC — 2026-10-20 (beta)

Two outside bug reports on the 1.0.1 beta (30 + 75 findings) checked one by one: 104 were real and are fixed; one (torrent list after a restart) was not a bug as described.

- **Books:** arrow / space keys inside an EPUB no longer throw; a theme picked while a book loads sticks; the progress bar jumps by chapter when page positions can't be made. A PDF opens at its last page when the saved page is past the end, a damaged page says so, closing while loading leaves nothing running. Comics: the last two-page spread counts as finished, an unreadable page says so, no memory is kept after closing. "Author - Title - Subtitle" keeps its subtitle; a book opened with "Open file" stays in "Continue". Catalogs: a free PDF is preferred to an EPUB to buy, paging and a new search no longer mix catalogs or shelves, xml:base, redirects, prefixed OpenSearch tags and {searchTerms} in the path or twice all work. LibriVox keeps chapters that only come in one quality. EPUB titles decode &#233;-style characters and any namespace prefix. Downloads: a zip with no book or comic pages is refused, the size limit holds while downloading, names like CON / AUX are saved safely.
- **Music:** shuffle keeps the song playing and the songs before it; a film's speed / loop no longer carries into music; holding Space pauses once; another playlist that shares a song starts instead of pausing the wrong one. Lyrics: a dropped connection is retried, live and studio takes don't share lyrics, a line with several times shows at each. A YouTube song that mpv reports by its media address still moves on at its end. Short podcasts aren't marked heard after seconds; "newest episode" is the newest even when the feed lists the oldest first. Radio search also finds stations by genre. Deleted songs leave "most played" and "where you left off". Library scans: a cancelled or failed scan no longer overwrites the library, "2Pac" / "50 Cent" keep their names, an album's later track can give the cover, a changed cover is picked up, nested folders don't list a song twice. Spotify move: an unticked song stays unticked, one unreadable song no longer stops the move. The music link window does nothing after it is closed.
- **Assistant:** closing it while a card waits cancels; every delete gets its own card and choices, and an empty delete no longer lets other changes pass unasked; playing a song asks like other opens; "Undo" undoes every round of an answer, leaves a downloaded book out, and covers a music playlist it made. Non-Latin names don't match everything; "Home" deletes the song Home, not the album Homecoming; a playlist keeps the size asked for; a series asked for by name isn't the film of that name; a year given ("Dune (1984)") is respected when removing or editing. A question sent from a menu while it is busy waits instead of getting lost; a deleted conversation stays deleted; a new song gets its own conversation.
- **Films:** an unfinished torrent asks before the music stops; "I finished this episode" moves "Continue" on; a 45-second clip isn't finished at the start; Discover's picks follow a like turned into a dislike and what was watched. Addon addresses keep their ?token=. File names: "The Web (1947)", "(500) Days of Summer", "C++.mp4" and two shows of the same name from different years are read right; .m2ts is in the open dialog. Missing-file checks and subtitle timelines ignore late answers; subtitle lines are sorted; UTF-16 subtitles show on the timeline; a failing subtitle name search says why. Deleting a book or song never takes a video's subtitles along. Removing a season torrent clears every episode opened from it. Hero sliders keep picture and title together; a cover that failed once tries again for the next song or book. Watch-later cards are checked for content warnings; a list search fills the posters of what it shows; a known TMDB id gives its own poster.
- **Letterboxd:** "Update" no longer wipes list edits made while it ran, says when lists couldn't be read; a custom list named like a standard shelf stays separate; list CSV exports and Letterboxd links import without a Gemini key; the diary's latest vote counts for friend match.
- **Other:** page reading can't be redirected into the local network; search plugins: "$1E" replacements, and/or with more arguments, htmldecode / diacritics / validate, POST $raw, .YML files and "1,234,567" sizes work. Lossless Scaling is restarted even if saving fails, is detected on a second monitor, and its untitled default profile becomes Luna's. Every font in a .ttc is listed; same-named fonts in a zip both stay. The setup check's "Check again" works after an error.

## 1.0.2CC — 2026-10-20 (beta)

- **Privacy:** the program no longer carries the folders it was built in (the Windows user name and the project folder showed inside `Luna Player.exe` as error-message paths). Shared builds are made with `scripts/build-release.ps1`.
- The GitHub release workflow runs only when started by hand: pushing a tag no longer rebuilds the release over the tested files.

## 1.0.1CC — 2026-10-20 (beta)

- **Assistant:** no film page for taste remarks ("vampir konusunu sevmiyorum" was read as "konusu"), none twice for a film already shown, and the one-film page only when a film was asked for.
- **Header:** fits on 1920 px screens again with its labels; on narrower windows the labels fold step by step and the tabs fade at the edge when they scroll.
- **Music:** turning shuffle off restores the original order; the end of a playlist rewinds and pauses (play starts it again); a YouTube link that can't be read also stops the sound.
- **Books:** comic (CBZ) pages are freed as you read (memory no longer grows); arrow / Page keys turn pages even after clicking the Aa or contents buttons.
- "İnik değil" tooltip reworded.
- Notebook: the version rules are kept, rules can't be deleted; Gemini (G) added to the model letters.
- Fixes found by DeepSeek (see `deepseek tarafından bulunan hatalar/BULGULAR.md`), checked and the header fix reworked by Claude Code.

## 1.0.0D — 2026-10-19

- **Settings › General now shows the app version** (`1.0.0D`).
- Version format: `MAJOR.MINOR.PATCH` + the letter of the AI model that made the last change
  (`D` DeepSeek, `C` ChatGPT, `CC` Claude Code, `Q` Qwen, `K` Kimi). Each new model round bumps the number.
- Single version source: `app/src/version.ts`; `package.json`, `tauri.conf.json` and `Cargo.toml` follow it.
- Remaining audit fixes, packaging and release workflow updates from the 0.3.0 cycle.
# Changelog

## 0.3.0 — 2026-10-19

A large correctness and packaging release.

### Player and library

- Fixed "continue watching" saving several seconds behind, and saved the final position on exit.
- Fixed `1920x1080` being read as a release year (posters/summaries now match).
- Fixed the external-subtitle key overriding an embedded subtitle on every launch.
- Fixed lost-file re-linking through a torrent using a stale library snapshot.
- Fixed subtitle nudge keys/buttons using stale state (G/H, +/−).
- Fixed the cancelled sleep timer leaving the video paused.
- Throttled seek-bar dragging; final seek on release.
- The preview worker is always stopped before a file is deleted or moved.
- "Finished" now uses one threshold (95%) across the home row, menus and the player.

### Books

- Audiobooks are visible to the assistant and on the books home ("Recently listened audiobooks").
- A corrupt EPUB can no longer panic/abort the whole app (`percent_decode` is byte-safe, with a test).
- CBZ blob URLs are revoked; PDF documents/workers are destroyed.
- EPUB "two pages" no longer reloads the whole book.
- CBZ page numbers cannot go negative; loaded pages are clamped.
- CBR files are no longer advertised as downloadable (RAR is not supported).
- A failed book deletion no longer clears the reading record first.

### Music and assistant

- YouTube playlist requests now search smarter (punctuation, artist/title, relevance checks), fill missing
  entries with the artist's other real tracks, and show a preview before creating the playlist.
- The assistant opens the new playlist and closes itself; Alt+A toggles it.
- Song links (`play_song`) and the "add to library and play" card are restored.
- The assistant prompt no longer includes an unbounded film library (first 400 entries).
- Playlist/reminder/title removals respect the year; duplicate recommendations are avoided.
- Undo only reverts the assistant's own changes, not later manual edits.
- Empty/one-letter note deletion can no longer wipe every note.
- Conversations are separated by song/book/film context instead of one endless chat.

### Packaging

- Setup (NSIS) and portable zip builds, GitHub Actions release workflow.
- GPL-3.0 license, third-party notices (mpv GPLv2+, yt-dlp Unlicense, fonts OFL).
- Build documentation for fetching mpv and producing both packages.

## 0.2.3 and earlier

See the git history and the previous GitHub releases.
