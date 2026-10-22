# Çalma listeleri ve sesli kitaplar — yeni geliştirme turu

Bu tur Browser.tsx, film Screens.tsx, Taste.tsx ve ai.ts değiştirilmedi. Üç Claude paketinin ilk kaynak fotoğrafı da sabit bırakıldı.

## Kullanıma eklenenler

1. Müzik › Kütüphane › Listeler içinde, Spotify bağlantısı gerektirmeden boş ve adlandırılmış kendi listesini oluşturma.
2. Aynı isim varsa mevcut listeyi ezmek yerine boşta olan numaralı ad kullanma.
3. Luna JSON çalma listesini içe aktarma. Kimlik yeniden oluşturulur; var olan listeye yazılmaz ve parçalar otomatik çalınmaz.
4. Listeyi Luna JSON biçiminde dışa aktarma. Ses dosyaları kopyalanmaz; yerel yolların başka bilgisayarda bulunması gerekir. Dışa aktarma API/model gibi bilinmeyen alanları taşımaz; parça adresleri kullanıcının seçtiği liste verisidir.
5. Liste sayfasında bağımsız kopya oluşturma.
6. Yinelenen kaynak adreslerini kullanıcı onayıyla temizleme; ilk kayıt ve asıl sıra korunur.
7. Parçaları sürüklemek zorunda kalmadan yukarı/aşağı taşıma. Arama açıkken düğmeler, görünür sonuç sayısına değil asıl listedeki konuma göre çalışır.
8. Arama açıkken sonuç/adet ve hangi sıranın kullanıldığı açıklaması.
9. Şarkı kuyruğunu çalmayı kesmeden yeni bir çalma listesine kaydetme; liste adı küçük formda girilir. Kaydedilen sıra ve yinelenenler korunur, kullanıcı sonra temizleyebilir.
10. Liste araçları ve satır eylemleri Luna temasına uygun; 480px genişlikte taşmadan çalışacak şekilde düzenlendi. Kaldırma düğmesi klavye odağında kaybolmaz.

## Hata düzeltmeleri ve veri koruması

11. Çalma listesi kaydı başarısızsa başarılı değişiklik bildirimi yayımlanmaz; hata gösterilir. Liste silme başarısızsa sayfa kendiliğinden kapanmaz.
12. Bozuk/yanlış şekilli liste deposu veya yinelenmiş liste kimlikleri varsa üzerine yeni liste yazarak eski kayıtlar sessizce kaybedilmez. Görüntüleme geçersiz kayıtları dışarıda tutabilir; yazma öncesi bütün asıl veri doğrulanır ve sorun varsa yazma reddedilir. Kurtarma için yedek gerekir; bu otomatik onarım değildir.
13. Açık listenin verisi kaybolur/bozulursa boş ekrana düşmek yerine kapatılabilir uyarı görünür.
14. Çalmakta olan kayıtlı liste düzenlendiğinde mevcut kuyruk değiştirilmez. Eski kuyruk artık listenin yeni sırasıymış gibi işaretlenmesin diye liste bağlantısı ayrılır; devam eden ses kesilmez.
15. İçe aktarma 4 MiB, 5.000 parça ile sınırlıdır. Sürüm/biçim, temel alanlar ve kaynaklar doğrulanır. Komut/JavaScript/data/file gibi desteklenmeyen adresler ve kimlik bilgili HTTP URL'leri reddedilir. İçe aktarma izin verilen HTTP(S), YouTube arama adresleri ve mutlak Windows/UNC dosya yollarını taşır; dosyaları açmaz.
16. Sesli kitaplarda bölüm içindeki saniye konumu artık kaynak adresi başına kaydedilir. Yeniden yükleme beş saniye geri alarak devam eder. Biten veya geçersiz konum baştan başlar. Bu ilerleme MusicDock'un native oynatma durumunu aldığı sırada kaydedilir.
17. Sesli kitap bölüm numarası, kuyruğun o anki indeksinden bağımsız taşınır. Kuyruk sıralanıp kısalsa da kaydedilen bölüm numarası yanlış olmaz.
18. Podcast'in kaydedilmiş çok erken konumları da geçerli olduğunda devam edebilir; yalnız 30 saniyeyi geçenleri kabul eden eski eşik kaldırıldı. NaN, negatif ve bilinen sürenin dışındaki değerler kullanılmaz.
19. Podcast/sesli kitap oynatma ekranına yalnız o bölümü baştan dinleme düğmesi eklendi.
20. Podcast bölüm bilgisi veya sesli kitap bölüm listesi geç gelirse daha sonra seçilmiş müziğin/Stop işleminin üzerine oynatma başlatmaz. İstek nesli kontrol edilir.
21. Sesli kitap kartındaki çift tıklama ve yakalanmayan yükleme hataları engellendi; yeniden denenebilir durum görünür. Kart kapatılmışsa geç cevap çalmayı başlatmaz.
22. Bozuk tekrar modu ayarı geçerli off/all/one değerlerinden birine döner.

## Doğrulama

- Yeni 11 test dahil toplam 234 kısa JS/TS regresyonu geçti. Mevcut gerçek playback fonksiyonlarını çıkararak çalıştıran test düzeneklerine yeni resume yardımcısı bağlandı; ses fallback kontrolleri korunuyor.
- 7 yeni izole gerçek React akışı geçti: boş liste, import/sıralama/dedup, kopya/export/dar pencere, hasarlı kayıt koruması, sesli kitap konumu ve bölüm kimliği, bölümü baştan yükleme, kuyruğu native çalma komutu göndermeden kaydetme.
- Üretim derlemesi ve İngilizce metin kontrolü geçti; paket kaynak hashleri ve yamanın uygulanıp geri alınması ayrıca doğrulandı.
- Arayüz testleri headless Edge ve taklit native ses/olay/dosya diyaloglarıyla yapıldı. Gerçek ses çıkışı, canlı podcast/Archive.org, gerçek kullanıcı dosyası veya gerçek Windows Luna penceresi testi yapılmadı. Önceki tam Rust test yürütücüsünün DLL başlangıç sınırı değişmedi.
- Commit/push/release yapılmadı. Tam kaynak paketi önceki tüm yerel çalışmalarla birlikte bu turu da içerir.
