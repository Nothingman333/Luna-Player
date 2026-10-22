## Genel geliştirmeler — son paket

Kullanıcının seçtiği 14 başlık eklendi: toplu yeniden bağlama, çeviri iptal/yeniden deneme, koleksiyon kurtarma, site simgeleri, sahne notları, ortak alıntılar, altyazı kelime defteri, Letterboxd fark özeti, web okuma kuyruğu, sayfa notları, oynatma tercihlerini yönetme, seri takibi, erişilebilirlik ve yerel görsel önbelleği. Kullanım yerleri, korunacak davranışlar ve doğrulama sınırları **docs/LUNA-GENEL-GELISTIRMELER.md** içinde.

# Luna Web ve sayfa okuyan asistan

Temel: Luna Player `1.6.0CC`, `31bf2360ca178e16235c7c903500559fa909f931`.
Paket ayrı kaynak kopyasında hazırlandı. GitHub'a commit/push yapılmadı.


## Son güncelleme: yeni Web tasarımı, baloncuk ve doğrudan çeviri

- Film/Keşfet/İndirmeler menüsü, dosya açma ve kütüphane araması Web görünümünden kaldırıldı. Ortak Luna modları, koleksiyonlar ve ayarlar korunur.
- Kompakt sekme/adres çerçevesi; Sora ve IBM Plex Sans ile başlangıç sayfası, site kısayolları, kişisel yer imleri ve düzenlenebilir kısayol listesi eklendi. Çeviri ve sayfa araçları açılır menüde toplandı. Türkçe/İngilizce arayüz diline uyum sağlandı.
- Sağ alttaki asistan baloncuğu Web'de ve büyütülmüş uygulama penceresinde görünür; Luna film oynatımı sırasında gizlenir. Her açılış küçük sohbet kutusudur. Büyük çalışma alanı yalnız kullanıcı büyüt düğmesine bastığında açılır.
- Alt durum şeridi ve tam genişlikte ayrılmış asistan boşluğu kaldırıldı. Sayfa pencerenin altına kadar uzanır. Baloncuk app-owned, yetkisiz, şeffaf küçük bir native child view olarak web sayfasının üzerinde görünür; yalnız ana arayüzdeki küçük sohbeti açma sinyali verir. Sohbet kutusu sayfanın üzerinde yüzer; sayfa genişliği değişmez ve sağda ayrı bir siyah sütun ayrılmaz. Native sayfanın yalnız sohbet kutusunun yuvarlatılmış alanı kırpılır; kutu kapatılınca tam sayfa yüzeyi geri gelir. Web sohbetinin takip soruları sayfa özeti ve çeviri bağlamındadır. Ana ekran, diğer bölümler ve tam sohbet alanında native baloncuk gizlenir.
- Web sohbeti film sohbetinden ayrıdır. Kullanıcı her soru gönderdiğinde aktif sayfanın güncel okunabilir metni alınır; ilk sayfa görüntüsüyle cevap üretmeye devam edilmez. Sayfa içeriği sistem talimatı veya native araç çağrısı olarak uygulanamaz. Sayfa bağlamında otomatik oynatma/film kartı akışları çalıştırılmaz.
- **“Sayfayı Türkçeye çevir”**, **“translate this page into English”** gibi komutlar doğrudan sayfanın metin düğümlerini çevirir. Araçlar menüsünden dil seçilebilir; özgün metne dönülebilir. En fazla 180 alan/24.000 karakter; uzun sayfalarda kısmi çeviri bilgisi gösterilir.
- Çeviri mevcut asistan API profilini kullanır. Model yanıtı eksik, yinelenmiş veya uydurma satır numarası içeriyorsa uygulama durur. HTML çalıştırılmaz; yalnız `textContent` değiştirilir. Değişen veya kaldırılan alanlar ezilmez; özgün sayfaya dönme de sonradan değişen alanları korur. Formlar, parolalar, kod, gizli alanlar ve dış çerçeveler çevrilmez.
- Çeviri için 8 yeni kod/davranış testi geçti. Önceki 37+32+12 test ve üretim derlemesi de son kaynakta geçti: toplam 89 kod/davranış testi. Bu güncellemede gerçek Windows penceresi otomatik kullanılmadı; kullanıcı masaüstü/site/video/model testlerini kendisi yapmayı istedi.
- Son kaynak gerçek Rust derleyicisiyle Windows GNU deneme EXE'sine derlendi. Kaynak ZIP'i MSVC ile normal proje derlemesini korur. Ayrı yerel deneme EXE'si `Luna-Web-Yeni-Tasarim` klasöründe açıldı; Rust kurulumu olmadan çalışır, WebView2 gerekir. Bu EXE yerel deneme içindir; imzalı dağıtım/installer değildir. Taşınabilir derleme araçlarındaki x64 GNU pthread sembol uyumu yalnız test araç klasöründe sağlandı; proje kaynaklarına veya MSVC dağıtımına bir uyum katmanı eklenmedi.
- Hdfilmcehennemi gibi sitelerde film izleme, DRM, tam ekran ve canlı API testleri **kullanıcı tarafından henüz doğrulanmış sayılmaz**. Kaynak önizlemesinin üç boyuttaki görsel düzeni kontrol edildi; yatay taşma bulunmadı. Dar/kısa pencerede başlangıç içeriği kaydırılabilir.

Aşağıdaki ilk paket kontrolleri geçmiş kayıttır; bu bölümdeki son güncelleme asistan ve tasarım davranışında önceliklidir.

## Yerelde deneme

- `Luna Web Onizleme.cmd`: Node.js ile arayüz önizlemesini açar. Bu seçenek gerçek web sitelerini uygulamanın içine yüklemez; tasarımı görmek içindir.
- `Luna Web Yerel.cmd`: gerçek Tauri uygulamasını kaynak kodundan çalıştırır. Windows 10/11, WebView2, Node.js, Rust MSVC, Visual Studio C++ Build Tools ve mevcut `BUILDING.md` içindeki mpv/yt-dlp hazırlığı gerekir. İlk derleme zaman alır.
- Masaüstünde üstteki **Web** sekmesini seç. Adresi yazıp Enter'a bas. Siteyi kendi oynatıcısında kullan. Asistan için **Sayfayı asistana ver** düğmesine basıp sohbet alanından sorunu yaz. Mevcut Luna API profilini kullanır.
- **Luna Asistan** düğmesi sayfayı paylaşmadan sohbeti açar. **Ayır**, sayfa metnini sonraki sorulardan çıkarır. Sekme/adres değişince ekli metin temizlenir; güncel sayfa için yeniden paylaşmak gerekir.

## Eklenenler

- Luna'nın mevcut vurgu rengini izleyen Web çalışma alanı, sekmeler, adres/arama çubuğu, geri/ileri/yenile, yer imleri, dış tarayıcıda açma ve sayfa kaynağı bilgisi.
- Gerçek child WebView2 kullanımı; sekiz sekme sınırı; kapanan sekmenin native görünümünün bırakılması. iframe kullanarak site gömme zorunluluğu yok.
- Asistan açılınca native sayfa alanının ona yer bırakması; dar pencerede açıklama; modal açılınca native yüzeyin gizlenmesi. Pasif native yüzeylerin sesi WebView2 üzerinden kapatılır; ana belgedeki medya ayrıca duraklatılır.
- Ayrı `web-profile` oturumu. Web sitelerine Luna'nın komutlarına erişim verilmez. Native yetkiler pencere adına değil yalnız `main` ve `subs` webview etiketlerine bağlandı; alt çerçeveler de yetki kazanamaz.
- Yeni pencere isteyen bağlantılar kullanıcıya sunulur. Dosya indirmeleri, kamera/mikrofon ve diğer site izinleri bu ilk sürümde kapalıdır.
- Sayfa okuma yalnız açık kullanıcı isteğiyle yapılır. Başlık, sorgu/fragment içermeyen URL ve en fazla 24.000 karakter okunabilir metin alınır. Formlar, girdiler, düzenlenebilir alanlar, scriptler ve gizli alanlar dışlanır. Çerez/oturum deposu okunmaz.
- Sayfa metni asistanın kullanıcı veri bölümüne eklenir; sistem talimatlarından ayrılır. Sayfa ekliyken native işlem araçları ve otomatik film kartı açma devre dışıdır. Yanıtta uygulamanın koyduğu kaynak bağlantısı bulunur. Ham sayfa metni sohbet geçmişine kaydedilmez; kullanıcının sorusu, yanıt ve kaynak bağlantısı normal sohbet gibi saklanabilir.

Whisper projesindeki ayrı oturum, kontrollü açılır pencere ve eski sekme/gezinti sonuçlarını eleme yaklaşımından yararlanıldı. Electron/Castlabs DRM altyapısı bu Tauri paketine taşınmadı.

## Hedefli düzeltmeler

| Bulgu | Değişiklik | Doğrulama |
|---|---|---|
| Kitap kapandıktan sonra kalan uyku zamanlayıcısı ve medya tuşları | `ttsStop`, okuyucu etkin görünmese de kaynakları temizler. | Davranış testi |
| Açıkça durdurulan askıdaki müziğin filmden sonra geri gelmesi | Stop askıdaki kuyruğu unutur; film için geçici askıya alma kendi anlık görüntüsünü korur. | Davranış testi |
| Bozuk cast/genres alanlarıyla kütüphane filtresinin çökmesi | Dizi/tür kontrolleri ve güvenli filtreleme. | Davranış testi |
| Bozuk koleksiyon JSON/öğelerinin ekranı düşürmesi | Görüntüleme için kayıt doğrulama; bozuk ham veriyi koruma ve üzerine yazmayı engelleme. | Bozuk kök, karma kayıt ve yazma koruması testleri |
| Unicode büyük/küçük harf dönüşümünde altyazı yeniden adlandırma paniği | Özgün UTF-8 karakter sınırından sonek çıkarma. | Gerçek Windows dosya sistemi testi |
| Altyazı hedefi çakıştığında video kısmen yeniden adlandırılması / altyazı kaybı | Önce bütün hedefleri kontrol etme; hata olursa tamamlanan adımları geri alma ve geri alınamayan dosyaları bildirme. | Gerçek Windows hedef çakışması testi |
| Altyazı metninin upscaler günlüğüne yazılması | Satır içeriklerini yazan kayıt kaldırıldı. | Kaynak kontrolü + Rust kontrolü |

**Windows sesli okuma iyileştirmesi:** ses/hız değişiminde paragrafın başına dönmek yerine son bildirilen kelimeden devam edilir; duraklatma niyeti korunur. On hızlı değişiklik ve eski paragraf konumunun yeni paragrafa uygulanmaması sınandı. Gerçek ses motoru denenmedi; kelime sınırı bildirmeyen Windows seslerinde kusursuz konum koruma garanti edilmez.

Ses sürgüsünün sessizi kaldırması önceki raporda tasarım tercihiyle karışan bir maddeydi; bu davranış burada ayrı bir doğrulanmış hata sayılmadı.

## Gerçekte çalıştırılan kontroller

| Kontrol | Sonuç | Kapsam |
|---|---|---|
| `npm run build` | Geçti | TypeScript ve Vite üretim derlemesi |
| `npm run test:regression` | 37/37 | Önceki davranış testleri |
| `npm run test:next` | 32/32 | Önceki ikinci test grubu |
| `npm run test:browser` | 12/12 | Yeni adres, yetki, asistan isteği, kayıt ve okuma/müzik regresyonları |
| Edge arayüz/DOM kontrolü | 11/11 | Gerçek DOM; sekme komutları için taklit native köprü |
| `cargo check --offline --locked --tests` | Geçti | Gerçek Rust 1.99.1 Windows GNU derleyicisiyle uygulama ve test kaynakları |
| Unicode/çakışma testi | 1/1 | Üretim dosya fonksiyonlarından çıkarılan test, gerçek Windows dosya sistemi |

Rust kontrolünde yalnız derleme kontrolü için `TAURI_CONFIG={"bundle":{"resources":[]}}` kullanıldı; indirilmemiş mpv paket dosyaları denetime katılmadı. Üretim `tauri.conf.json` içindeki kaynak listesi korunur. Taşınabilir derleyici ve vendor bağımlılıkları dağıtım paketine eklenmez. Rust'taki iki eski kullanılmayan fonksiyon uyarısı ile Vite'ın büyük parça uyarısı devam eder.

**Bu sonuçlar gerçek Tauri/WebView2 penceresinde gezinme testi, tam Windows installer derlemesi, film oynatma, DRM/OAuth uyumluluk testi veya canlı API modeliyle asistan testi değildir.** Bu kontroller yerel masaüstü çalıştırmasında tamamlanmalıdır. Önceki bütün denetim başlıkları bu paketle kapatılmış sayılmaz; yedek/state atomikliği, upscaler ayar dosyası ve torrent/dosya kilidi akışlarının kapsamlı Windows denetimi burada yapılmadı.

## Masaüstünde son kontrol listesi

1. Film, Müzik ve Kitap sekmelerinin açıldığını; mevcut kütüphane/Letterboxd verilerinin göründüğünü kontrol et.
2. Web'de iki site aç, sekme değiştir, adres yaz, geri/ileri/yenile ve sekme kapatmayı dene.
3. Kendi oynatıcısında video aç; sesin sekme değişince kapandığını ve Luna film oynatımıyla çakışmadığını kontrol et.
4. Asistanı aç/kapat/büyüt; ayarları aç; pencereyi yeniden boyutlandır. Native sayfa kontrolleri örtmemeli.
5. Bir metin sayfasını paylaş; başlık/kaynak görünsün. Özet sor; sayfa değişince eski metin ekinin kalktığını doğrula.
6. Parola/girdi/form içeren bir sayfada paylaşım yap; form değerlerinin okunmadığını doğrula.
7. Kendi kullandığın film sitelerinin oturum açma, açılır pencere ve tam ekran davranışlarını ayrıca dene. Çalışmayan sitede **Dışarıda aç** seçeneğini kullan.

## Teknik kaynaklar

- [Tauri child webview API](https://docs.rs/tauri/2.12.3/tauri/window/struct.Window.html#method.add_child)
- [Tauri Webview API](https://docs.rs/tauri/2.12.3/tauri/webview/struct.Webview.html)
- [Tauri yetkileri ve uzak kaynaklar](https://v2.tauri.app/security/capabilities/)
- [Microsoft WebView2 özellikleri](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/overview-features-apis)
