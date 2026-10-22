# Günlük kullanım geliştirmeleri — 12 iş ve tema düzenlemeleri

Bu tur, Luna-Player-Birlesik-Tam-Paket-20261022.zip içindeki birleşik kaynağın devamıdır. Önceki browser/eklenti/indirme, Claude çalışmaları ve 9 skill korunur. Mevcut çoklu film kopyası ve asistan geri alma altyapısı geliştirilmiştir; ikinci bir sistem kurulmamıştır.

| İş | Etkin davranış ve kullanım |
|---|---|
| 1. Akıllı bağlantı menüsü | Sayfadaki bağlantıya sağ tık: yeni sekme, sonra oku, kopyala, uygun medya bağlantısında Luna'da oynat. WebView2 native menü hedefi okunur; siteye Luna komut erişimi verilmez. |
| 2. Video izleme görünümü | Araçlar → İzleme görünümü. Browser araçları daralır; üstte açık bir çıkış kontrolü kalır. Sayfa gerçek HTML tam ekranına geçtiğinde asistan baloncuğu ve kutusu gizlenir, çıkınca geri gelir. DRM/film uyumluluğu garantisi değildir. |
| 3. Site tercihleri | Araçlar → Bu sitenin tercihleri: başlangıç sesi, açılır pencere politikası (sor/engelle/sekmede aç), hatırlanan yakınlaştırmayı sıfırlama. Tercihler origin bazında ayrıdır; sekme sınırı 8 kalır. Kamera/mikrofon/konum izni açılmaz. Elle sekme susturma aynı sitedeki yeniden yüklemede korunur. |
| 4. Oturum kurtarma | Temiz kapanmamış kayıtta Web bölümünde seçmeli kurtarma ekranı açılır. Sabit işaretleri korunur; sekmeler sırayla başlatılır, yükleme başına en fazla 8 saniye beklenir; sıra durdurulabilir. beforeunload temiz kapanış işaretidir. Geçmiş duraklatıldığında kurtarma kaydı tutulmaz. Bu bir güç kesintisi dayanıklılığı garantisi değildir; yalnız diske kaydedilmiş durum kurtarılabilir. |
| 5. Görünür ve güncellenebilir asistan bağlamı | Paylaşılan sayfa/seçili metin ve yakalama saati gösterilir. Bu sayfayla güncelle tam sayfayı yeniden okur; Ayır bağlamı bırakır. Sekme kimliği, gezinme nesli veya URL değişince devam eden eski yanıt bırakılır; aynı URL'li farklı sekmeler de ayrılır. |
| 6. Seçili metinle asistan | Sayfada seçilen metne sağ tık: Açıkla, Çevir, Notlara ekle. İlk ikisinde modele tüm sayfa yerine seçilen metin verilir; bağlam açıkça ‘Yalnız seçili metin’ der. Güncelle komutu tam sayfaya döner. Düzenlenebilir alanların native menüsü değiştirilmez. |
| 7. Asistan önizlemesi ve geri alma | Var olan işlem onayı/geri alma korunur. Kitap rafı değişikliklerinde gerçek kitap/yazar kayıtları ayrı seçim satırlarıyla gösterilir; seçilmeyenler işleme girmez. Aynı adlı belirsiz kitapta plan uygulanmaz. Gerçekleşen değişiklik önceki geri alma sistemiyle geri alınır. |
| 8. Web filmi → kütüphane | TMDB film/dizi kimliği kesin eşleşmede ‘Kütüphanende var’ gösterilir. IMDb/Letterboxd başlık+yıl eşleşmeleri olası aday olarak sunulur; IMDb kimliği yerelde yoksa kesin diye sunulmaz. Tıklama mevcut film kaydına geçer; izlenen/izlenecek bilgisi yerel kayıttan gelir. |
| 9. Çoklu film sürümleri | Var olan TMDB kimliğiyle tek kart/kopya grubu korunur. Sürüm kutusunda Extended/IMAX/4K gibi dosya adı ipuçları gösterilir. Seçilen sürüm hatırlanır ve detaydan sıfırlanabilir. Etiketler dosya adı ipucudur, medya ölçümü değildir. Dosya silinmez/taşınmaz. |
| 10. Tarama özeti | Film kütüphanesi taraması eklenen, artık bulunmayan, erişilemeyen kökler ve bilgisi güncellenen eserleri gösterir. Tekil aynı adlı dosyalar olası taşınma olarak ayrılır; otomatik yeniden bağlanmaz. Hata durumunda yeniden deneme vardır. |
| 11. Eşleşme/kaynak/kilit | Film detayında Bilgileri düzenle: başlık, yıl, açıklama, TMDB kapak yolu veya TMDB görsel URL'si ve kilit. Kimlik için mevcut yeniden eşleştirme kullanılır; açık kullanıcı eşleşmesi kilitli kayda da uygulanır. Otomatik TMDB yanıtı kilitli elle düzenlemeyi ezemez. Kitap yöneticisinde kaynak, düzenleme tarihi ve kilit görünür; kaydedilmiş kullanıcı bilgileri taramada korunur. |
| 12. Tanılama paketi | Ayarlar → Yedekleme → Sorun bildirme paketi. Önizleme, isteğe bağlı ayıklanmış son loglar, JSON kaydetme. Sohbet/kütüphane/veri tabanı/anahtar listeleri rapora alınmaz. Gerçek anahtar değerleri, bearer/anahtar alanları, URL yolu/sorgusu ve yerel dosya yolları ayıklanır. Opsiyonel loglarda alan adları kalabilir; kullanıcı önizlemeyi inceleyerek paylaşır. Kendiliğinden gönderim yoktur. |

## Görünüm

Luna'nın mevcut renk değişkenleri, kart/yuvarlak düğme/ExtraModal yapısı ve küçük asistanı kullanıldı. Film/kitap başlıkları iki satırla dengelendi, bilgi kaynağı ve durum satırları sade tutuldu. Formlar, odak halkaları, onay kutuları ve 480px/520px düzenleri mevcut temaya uyar. Yeni tam genişlikte asistan alt şeridi veya sağ siyah sütun eklenmedi. Tarayıcının native sayfasında birden fazla kutu için kesim bölgesi desteklenir; menü asistanı kaplamak zorunda değildir.

## Bu turda bulunan/düzeltilen kenar durumları

- Aynı URL'li iki sekmenin asistan bağlamları artık id+nesille ayrılır; geç yanıt yeni sayfada görünmez.
- Seçili metin kapsamı, sayfa/sekmeye geçiş veya Web'den ayrılınca bırakılır. Güncelle komutu gizli seçimi devam ettirmez.
- Geçmiş duraklatma kurtarma verisinin yazılmasını durdurur; boş açılış kurtarılacak kaydı silmez.
- Son sekme bilerek kapatılırsa eski normal oturum listesi tekrar geri getirilmez.
- Site başlangıç sesinin uygulanması, kullanıcının aynı sitede elle seçtiği sekme sesini yeniden yüklemede bozmaz.
- Kütüphanedeki olası taşınmalar aynı dosya adı birden çok yerde varsa tekil eşleşme sayılmaz.
- Asistan raf önizlemesinde seçimi kaldırılan kitaplar hem yürütmeden hem kayıt değişikliğinden çıkarılır.
- Kütüphane bildirimi başarısız taramada eski dosya listesini silmeden hata ve yeniden deneme sunar.
- Film bilgisi otomatik gelirken elle kilitlenen kaydı eski yanıt ezemez.

## Doğrulama

- TypeScript + Vite üretim derlemesi: geçti; önceki chunk/dinamik import uyarıları sürer.
- Windows GNU portable araçlarıyla cargo build --offline --locked: geçti. MSVC/kimlik ayarları değişmedi; derleme kontrolünde bundle kaynakları TAURI_CONFIG ortam değişkeniyle devre dışıydı.
- 11 yeni model davranışı testi, 31 Web Plus, 23 browser magic, 8 okuma, 21 öneri ve 27 asistan güvenliği kontrolü: 121/121 geçti. İngilizce çeviri denetimi geçti. Bu sayılar model ve kaynak bağlantısı kontrollerinin toplamıdır.
- Ayrı headless Edge + taklit Tauri: önceki/yeni browser akışları 22/22, son sekme sesi regresyonu ayrıca 1/1 geçti.
- Gerçek React bileşenleri + taklit native/AI: 10/10 geçti. Film bilgisi/kilit, tarama özeti, tanılama önizleme+dışa aktarma, film eşleşmesi, sürüm hafızası/sıfırlama, kitap kilidi, asistan bağlam yenileme/geç yanıt, raf önizlemesi+geri alma ve 480px asistan kontrol edildi.
- Gerçek Luna Windows penceresi, WebView2 menüsü/tam ekran davranışı, canlı film/DRM, gerçek sağlayıcı yanıtları ve ani süreç kesintisi bu turda çalıştırılmadı. Bunlar kullanıcıda denenmelidir. Önceki turun Tauri test EXE başlatma sorunu bu turda tekrar denenmedi; native derleme canlı test sayılmaz.
- Tam kaynak ZIP ve iki yama temiz tabanlarda uygulanıp hash'leri karşılaştırılarak, ardından ters uygulanarak doğrulanır.

## Kullanım sınırları

Kaynak tamdır; EXE/kurulu bağımlılıklar içermez. Önceki paketle birleştirilmiş kaynağı kullanıyorsanız yalnız ona ait ek yamayı seçin. GitHub'ın belirtilen temelindeyseniz tam yamayı seçin. İkisini art arda uygulamayın. Yeni hedefteki kullanıcı değişikliklerini inceleyip koruyun. Commit/push/release yapılmadı.
