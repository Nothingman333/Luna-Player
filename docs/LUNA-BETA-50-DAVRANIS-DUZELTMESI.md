# Luna beta — 50 davranış düzeltmesi ve iyileştirme

23 Ekim 2026. Çalışma kaynağı: `luna-beta-ui-review`, önceki **Luna-1.6.7-Beta-Kutuphane-Web-Tam-Paket.zip** kaynağının devamı. Taban: v1.6.7 / `3c4ae8f55ae792e9abe43fb9c3cf67c506b61bd6`. Bu tur uzak depodan yeni sürüm alınmadı; önceki birleşik yenilikler korunuyor. Sürüm, bağımlılık ve Rust kodu değiştirilmedi. Kullanıcının isteğiyle **yeni ZIP/push paketi hazırlanmadı; commit/push yapılmadı.** Önceki ZIP bu turun değişikliklerini henüz içermez.

## Sayım ve kanıt

Bu liste **50 kritik veya Windows'ta yeniden üretilmiş hata** iddiası değildir. 36 davranış hatası (H), bozuk/dış veriye karşı 12 dayanıklılık düzeltmesi (D) ve 2 kullanım iyileştirmesi (İ) var. Aynı satırdaki farklı girdiler ayrı madde sayılmadı; ortak entity düzeltmesi üç tüketicide tek madde olarak sayıldı. Ayrıca aşağıda küçük arayüz eklemeleri var. Kullanılmayan eski palet modelinde bulunan iki aday sayımdan çıkarıldı; etkin palet zaten o davranışları destekliyor.

`app/scripts/fifty-behavior-regression.cjs` gerçek üretim modellerini yükler. Bu turun başındaki kaynak saklanarak aynı 50 kontrol çalıştırıldı: **önce 0/50, sonra 50/50 başarılı**. Bunlar model girdi/çıktı testleridir; canlı API veya native oynatma testi değildir. Dış veri vakaları uygulama içinde gerçek bir bozuk dosyayla çökme üretildiği anlamına gelmez. Betik `LUNA_MODEL_ROOT` ile eski kaynağa da yönlendirilebilir; `LUNA_RESULTS_FILE` ile JSON sonuç verir. CI'a `npm run test:fifty-behavior` eklendi.

## 50 madde

| ID | Tür | Önceki sorun / değişen davranış |
|---|---|---|
| F01 | H | Özel asistan komutunda `$&`, `$$` gibi kullanıcı metni değiştirme belirteci olarak yorumlanıyordu; artık aynen korunur. |
| F02 | H | Komut metninin içindeki `{selection}` ikinci turda yeniden işleniyordu; şablon tek geçişte genişletilir. |
| F03 | H | Görsel olarak aynı Unicode komut adı farklı normalizasyonla bulunamıyordu; kayıt, çağrı ve ayrılmış ad kontrolü NFC kullanır. |
| F04 | H | Asistan kaynağının sonundaki cümle noktası URL'ye katılıyordu; noktalama bağlantı dışında kalır. |
| F05 | H | Parantezli film adlarının Markdown URL'si kesiliyordu; dengeli parantezler korunur. |
| F06 | H | 3 ile başlayan sıralı asistan listesi 1'den görünüyordu; başlangıç sayısı korunur. |
| F07 | H | Boşluksuz uzun alıntı kartın dışına taşıyordu; ölçülen genişliğe göre karakter sınırlarında sarılır. |
| F08 | H | Alıntı kartındaki boş paragraf satırları kayboluyordu; kullanıcı satır araları korunur. |
| F09 | H | VTT dışa aktarma literal `<…>` ve `&amp;` metnini markup gibi yazıyordu; metin kaçırılarak yeniden okumada korunur. |
| F10 | H | Alıntı kısaltma emoji karakterini yarıya bölebiliyordu; Unicode kod noktası sınırında kesilir. |
| F11 | D | Podcast saatinde `01:61` veya `1.5:20` kabul ediliyordu; saat alanları doğrulanır. Tek alanlı `63.5` saniye geçerlidir. |
| F12 | D | Podcast bölümünün `null` başlangıcı sıfır sayılıyordu; eksik süre bölüm üretmez. |
| F13 | D | Negatif podcast bölümü sessizce sıfıra taşınıyordu; kayıt reddedilir. |
| F14 | H | Boş ayırıcı satırı olmayan podcast altyazıları tek parçada birleşiyordu; her zaman satırı ayrı cue başlatır. |
| F15 | H | Podcast WebVTT `NOTE` metaverisi konuşma gibi gösterilebiliyordu; NOTE/STYLE/REGION blokları atlanır. |
| F16 | H | Entity metni bazı yerlerde iki kez, sayısal entity ise hiç çözülmüyordu; ortak tek geçişli çözüm altyazı/podcast/replik aramasına bağlandı. Önceden ayrıştırılmış altyazı aramada tekrar çözülmez. |
| F17 | D | JSON dökümünde `null` zaman sıfırda hayali konuşma yaratıyordu; geçersiz başlangıç reddedilir. |
| F18 | D | JSON podcast dökümünde bitiş başlangıçtan önce olabiliyordu; ters aralık reddedilir. |
| F19 | H | Podcast döküm seçimi belgelenen sıranın tersine çalışıyordu; zamanlı format, aynı format içinde tercih edilen dil sırası düzeltildi. |
| F20 | H | `en-US` tercihi `en` dökümünü eşleştirmiyordu; dilin ana alt etiketi karşılaştırılır. |
| F21 | H | HTML podcast dökümünde script/style içeriği okunur metne karışıyordu; görünmeyen bloklar ve yorumlar çıkarılır. |
| F22 | H | WebVTT iç zaman damgası `<00:02.000>` konuşmada görünüyordu; gösterimden çıkarılır. |
| F23 | H | ASS çizim komutları replik metni olabiliyordu; `\\p` çizim modu takip edilerek yalnız gerçek konuşma tutulur. |
| F24 | H | Çok uzun tek kelime/URL altyazı satırını taşırıyordu; kelime sınırı bulunamadığında güvenli karakter sarma uygulanır. |
| F25 | H | Kısa Whisper aralığını çok parçaya bölmek, yuvarlamadan sonra sıfır süreli cue üretiyordu; parça sayısı milisaniye bütçesine uyar ve bitiş korunur. |
| F26 | H | Örtüşme temizliği en az 0,3 saniye dayattığı için yakın satırlar hâlâ örtüşüyordu; pozitif süre ve sonraki başlangıç birlikte korunur. |
| F27 | H | Müzik temizliği `#1 is the winner` gibi normal repliği siliyordu; `#` müzik işareti sayılmaz. |
| F28 | H | Asistanın sahne bağlamına 0,25 saniye sonraki replik eklenebiliyordu; gelecekte başlamış satır verilmez. |
| F29 | H | Beş kısa cue'nun arkasındaki hâlâ etkin uzun cue bulunamıyordu; dört satırlık arama sınırı kaldırıldı. |
| F30 | D | AI çeviri yanıtının `null` kimliği 0'a çevrilip ilk repliği değiştirebiliyordu; kimlik sayısal tam sayı olmalı. |
| F31 | D | Aynı kimliğe iki farklı çeviri gelince sonuncusu sessizce kazanıyordu; çelişkide özgün satır korunur ve eksik sayılır. |
| F32 | H | `pt_BR` gibi yerel kodu altyazı dosyasında `und` oluyordu; alt çizgi tireye normalleştirilir. |
| F33 | D | Negatif medya bölümü başlangıcından intro atlama üretilebiliyordu; negatif başlangıç reddedilir. |
| F34 | H | Bölüm listesi video süresini aşınca atlama hedefi de aşıyordu; aralık gerçek süreyle sınırlanır. |
| F35 | D | Kaydedilmiş intro başlangıcı `null` ise 0'a çevrilip sahte intro doğuyordu; eksik işaret geçerli sayılmaz. |
| F36 | H | Özel intro işareti, daha erken başlayan dosya bölümü tarafından ezilebiliyordu; kullanıcı işareti önce değerlendirilir, sonuç sonra zamana göre sıralanır. |
| F37 | H | Replik aramasında çakışan vurgulama aralıkları harf kaybettiriyordu; kesişen aralıklar birleştirilir. |
| F38 | H | Aynı sözcüğün satırdaki yalnız ilk geçişi vurgulanıyordu; tüm geçişler gösterilir. |
| F39 | H | Aynı dosya yolunda `?id=1` ve `?id=2` podcast bölümleri aynı sayılıp yanlış döküm seçilebiliyordu; bölüm parametreleri korunur, yalnız bilinen süreli CDN imza alanları yok sayılır. |
| F40 | H | Hızlı okuyucunun odak harfi bazı Unicode harflerini yarıya bölüyordu; konum, harf ve uzun kelime beklemesi kod noktalarına göre hesaplanır. |
| F41 | D | TMDB logosu dizisindeki `null` satır film detayını hata yoluna sokuyordu; geçersiz logo atlanır. |
| F42 | D | `https://` gibi tamamlanmamış sağlayıcı adresi izleme bağlantısı olabiliyordu; URL ayrıştırılır, protokol ve kimlik bilgileri denetlenir. |
| F43 | H | Yinelenen sağlayıcı kimliği iki aynı izleme düğmesi üretiyordu; kategori içinde tekilleştirilir. |
| F44 | İ | Aynı dildeki logolarda önce genişlik, eşitlikte oy dikkate alınarak küçük/bulanık logo tercihi azaltıldı. |
| F45 | H | Tek yüklemeye gelen iki tarayıcı hata olayı geçmiş sayacını iki kez azaltıyordu; geri alma yalnız bir kez işlenir. |
| F46 | D | Eski bir hata zamanı daha yeni ziyareti geri alabiliyordu; ziyaret öncesi hata göz ardı edilir. |
| F47 | İ | Öneri listesi doluyken geçmiş arama tamamlama hiç görünmüyordu; güncel arama ve geçmiş aramalar için yer ayrılır. |
| F48 | H | Sayfa metni Luna tarafından kesildiğinde asistan `truncated:false` görebiliyordu; yerel kesilme bilgisi de bildirilir. |
| F49 | H | Google Maps `?q=` adresi web arama sonucu gibi gösteriliyordu; Google arama yolu `/search` ile ayrılır. |
| F50 | H | `localhost?view=library` gezinme yerine aranmaya gidiyordu; sorgu/fragment başlangıcı yerel adres olarak tanınır. |

## Küçük arayüz eklemeleri

- Alıntı kartına **karakter sayacı** ve **Özgün repliğe dön** düğmesi. Giriş sınırı emoji karakterlerini ikiye bölmeden 280 kod noktasıdır; normal metin, fontlar ve renkler korunur.
- Podcast döküm aramasına **Aramayı temizle** ve **görünen/toplam satır sayısı**. Düğmeler mevcut chip/pill stili ve etkin tema renklerini kullanır.
- Yeni metinlerin İngilizcesi eklendi; i18n denetimi geçer.

## Doğrulama

- TypeScript + Vite üretim derlemesi başarılı. Vite'ın önceden var olan büyük parça/etkisiz dinamik içe aktarma uyarıları hata değildir.
- Yeni 50 girdi/çıktı kontrolü başarılı; eski kaynaktaki başarısız sonuçlar ayrıca tutuldu.
- İlgili mevcut gruplar: subtitle-studio 25, extras-plus 20, library 9, shell-extras 9, creative-plus 12, assistant-improvements 10, browser-suggest 21, iteration-1 7, creative 10 başarılı.
- Alıntı/podcast gerçek React bileşenleri: **önce/sonra**, 1280×900 Türkçe ve 640×900 İngilizce. Uzun alıntı, emoji sınırı, sıfırlama, podcast arama/temizleme ve Markdown bağlantıları kontrol edildi. Native kare alma ve RSS/altyazı yanıtları sentetiktir.
- F39'un eski kaynak testi, eski React dosyasında bulunan gerçek `sameAudio` ifadesini çıkarıp çalıştırır; yeni kaynakta ayrılmış üretim modelini çağırır. Yeni boş bir yardımcı uydurularak eski kaynakta yokluğu hata sayılmaz.
- Tam uygulama içinde tarayıcı önerileri: 1280×850 TR ve 640×850 EN. Dolu listede geçmiş arama görünürlüğü, 7 satır sınırı, Escape ve yatay taşma kontrolü geçti. Kütüphane/native köprü taklittir.
- Ekran görüntüleri okunarak önceki alıntı taşması ve yeni satır sarma gözle doğrulandı; yalnız taşma ölçümüne dayanılmadı.
- Kanıt çalışma dizini: `beta-fifty-evidence/` (kaynak deposunun yanında): `before.json`, `after.json`, önceki kaynak kopyası, test günlükleri, `visual-results.json`, `browser-results.json`, önce/sonra PNG'ler. Bu dizin yeni teslim paketi değildir.

Gerçek Windows/Tauri penceresinde video, DRM, WebView2 bindirmeleri veya canlı AI sağlayıcıları denenmedi. Bu tur bütün uygulama sayfaları yeniden gezilmedi. Bütün bug'ların bittiği iddia edilmiyor. Geliştirme turunun ardından kullanıcı nihai paketi istedi; bu kaynak `Luna-Beta-Nihai-GitHub-Paketi-2026-10-23.zip` teslimine dahil edildi. Teslim yönergesi: `LUNA-BETA-NIHAI-TESLIM.md`.
