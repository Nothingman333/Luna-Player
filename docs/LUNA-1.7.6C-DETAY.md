# Luna 1.7.6C — Analiz ve film ayrıntısı geri bildirimi

Sağlayıcıların satır içi açılımı daha belirgin genişleme/kayma animasyonuyla gösterilir; alttaki satırları örten katman kullanılmaz, dar yerde satıra sarılır. Azaltılmış hareket tercihinde animasyon kapalıdır.

Luna Analiz başlığındaki düğme analiz içeriğini gizler/açar; devam eden işlem iptal edilmez. Film defteri ve zevk tercihleri korunur. Benzerler cevabı en çok beş başlık kabul eder; modele tek örnek yerine gerekçelendirilebilen beş farklı eser istenir. Kayıtlı analiz tek sonuç içeriyorsa TMDB önerileriyle tamamlanır; ilk görünüm en çok beştir. Daha fazla benzer ara, kalan sonuçları veya sonraki API sayfasını getirir. Yeterli veri yokken beş eser uydurulmaz; hata/boş durum gösterilir. TMDB önerileri AI gerekçeleriyle karıştırılmadan etiketlenir. Kitapların önceki benzer eser davranışı korunur.

Altyazı durumu ve boyut üç nokta menüsünde Dosya ve altyazı bilgisi penceresine taşındı. Ayrıntıdaki satır kayıtlı devam konumundan kalan süreyi gösterir; başlanmamış dosyada açık durum yazılır. Kaynak bilgi satırı kalktı; TMDB puan düğmesinin üzerine gelince kaynak ve kimlik görünür. Afişteki TMDB etiketi sağ üstte, diğer rozetlere ayrılmış alanla ve sade rozet biçimindedir. Film defteri beğeni düğmeleri emoji yerine çizgi simge kullanır; seçili düğmeye tekrar basma nötr duruma döner. Mevcut notlar ve nedenler korunur.

Sürüm 1.7.6C, sonraki 1.7.7 + ajan eki. Kanıtlar ~/Documents/Luna-1.7.6C-Detay altında; ayrıntılı kontrol ve gerçek Windows sınırları Claude devir notundadır. Yerel/sentetik kontroller gerçek mpv veya canlı API testi değildir. Rust işlevi değişmedi, installer/exe üretilmedi. Push Claude’da; dosya temizliği yapılmaz, silme/alan açma öncesi kullanıcıya sorulur.
