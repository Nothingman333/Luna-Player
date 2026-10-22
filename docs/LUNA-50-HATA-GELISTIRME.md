# 50 değişiklik: 20 sınır durumu düzeltmesi + 30 kullanım iyileştirmesi

Taban: Luna-Player-Tam-Paket-Oneriler-Duzeltme.zip. Önceki bütün yenilikler, Web/müzik düzeltmesi, önerilerde ön izlemeye dönüş, kayıtlı analizler ve Debug korunur. Sayı 50 yeni kritik hata anlamına gelmez. İlk 20 madde bozuk/ithal veri, uyumluluk yordamları ve sınır durumlarındaki doğrulanmış model hatalarıdır. Bazı yordamlar eski tarayıcı uyumluluk akışlarına da aittir; hepsi aktif Windows yolunda gözlenmiş uygulama hatası değildir. Son 30 madde ayrı kullanıcı işlevleri ve kullanım iyileştirmeleridir.

## 20 doğrulanmış düzeltme

`app/scripts/round-50-regression.cjs` üretim modellerini yapay kayıtlarla çalıştırır. Aynı beklentiler önceki kaynakta 0/20, son kaynakta 20/20 geçti. Bunlar canlı site/Windows hata yeniden üretimi olarak sunulmaz.

| # | Kaynak (`app/src/`) | Düzeltilen davranış |
|---|---|---|
| 01 | browserSuggest.ts | JavaScript tarih sınırı dışındaki sayısal ziyaret zamanları kabul ediliyordu; reddedilir. |
| 02 | browserSuggest.ts, browserHistoryModel.ts | Yinelenen geçmiş kaydının en yeni satırı eski satırın daha yüksek ziyaret sayısını kaybettiriyordu; en yüksek bilinen sayı korunur, toplanıp şişirilmez. |
| 03 | browserSuggest.ts | Saat geri alındığında negatif süre hızlı yenileme sayılıyordu; ayrı ziyaret olarak işlenir. |
| 04 | browserSuggest.ts | Geçersiz tarih göreli zaman hesabında toISOString ile hata üretiyordu; güvenli boş etiket döner. |
| 05 | browserSuggest.ts | Eski ziyaretin gün etiketi UTC günüyle gösteriliyordu; yerel takvim günü kullanılır. |
| 06 | browserSuggest.ts | Boş adres sorgusu yinelenen/geçersiz ham geçmiş satırlarını doğrudan öneriyordu; temizlenerek gösterilir. |
| 07 | browserStartModel.ts | Gelecekteki geçmiş günü “Bugün” etiketi alıyordu; gerçek tarih gösterilir. |
| 08 | browserStartModel.ts | Gruplama, sonlu fakat takvim dışı tarihleri kabul ediyordu; geçersiz gün satırı oluşturulmaz. |
| 09 | browserStartModel.ts | Ham üst site kayıtlarında URL içindeki kullanıcı adı/parola kalabiliyordu; kimlik bilgili kaynak kullanılmaz. |
| 10 | webNotebookModel.ts | Markdown dışa aktarımında URL içindeki açı işaretleri bağlantı sınırını bozabiliyordu; kaçırılır. Not metni değiştirilmez. |
| 11 | readingExperienceModel.ts | Yalnız CR ile ayrılmış alıntı satırları dışa aktarımda blok alıntının dışına çıkıyordu; satır sonları birlikte işlenir. |
| 12 | bookLibraryModel.ts | Aynı kitap yolu son-okunan sıralamasında iki kez varsa son sıra ilk/yeni sıranın üzerine yazılıyordu; ilk sıra korunur. |
| 13 | filmCatalogModel.ts | Sonsuz süre “Infinity” olarak biçimlenebiliyordu; geçersiz süre gösterilmez. |
| 14 | filmCatalogModel.ts | Sıfır kalan süre bir dakika diye gösteriliyordu; bitmiş/boş kalan süreye sahte dakika eklenmez. |
| 15 | filmCatalogModel.ts | Negatif/kesirli/güvensiz TMDB ve oyuncu ID'leri bağlantıya taşınabiliyordu; pozitif güvenli tamsayı zorunlu. |
| 16 | debugModel.ts | “Hata” kategorisi AI/oynatıcı/tarayıcı kategorisindeki başarısız çağrıları dışlıyordu; bütün hata seviyeleri bulunur. |
| 17 | assistantHistory.ts | Kurtarılan sohbetin takvim dışı tarihi korunabiliyordu; güvenli tarih ve onarım kaydı kullanılır. |
| 18 | assistantHistory.ts | 60 sohbeti aşan içe aktarım sessiz kırpılıyor, kayıp/hasar bildirilmiyordu; atılan sayısı ve hasar bayrağı doğru hesaplanır. |
| 19 | assistantHistory.ts | Geçmiş kısaltma açıklaması, hesaplanmış model metin bütçesini yeniden aşırabiliyordu; yeterli yer yoksa eklenmez. Son soru yine korunur. |
| 20 | readingExperienceModel.ts | Takvim dışı başlangıç/bitişe sahip okuma oturumu kaydedilebiliyordu; reddedilir. |

## 30 kullanım iyileştirmesi

### Tarayıcı geçmişi (21–30)

21. Bugün / son 7 gün / son 30 gün / tüm zamanlar filtresi.
22. Site alan adına göre filtreleme.
23. En yeni, en eski ve en çok ziyaret sıralaması.
24. Filtrelenmiş sonuç adreslerinin topluca kopyalanması; yalnız ekranda ilk 50 ile sınırlı değildir.
25. Filtrelenmiş geçmişin JSON olarak dışa aktarılması.
26. Seçilen sitenin bütün ziyaretlerini, alan adını gösteren onayla unutma.
27. Tek düğmeyle aramayı temizleme; arama doluyken Escape önce aramayı temizler.
28. İlk 50 kaydı render etme ve 50'şer genişletme; saklanan geçmiş kırpılmaz.
29. Her geçmiş satırının adresini ayrı kopyalama.
30. Panel açıkken dakika/gün bilgisini yenileme; ziyaret saatinde göreli ve tam tarih ipucu.

Bu arayüz gerçekten kullanılan `BrowserPanels.HistoryPanel` üzerinden bağlanır. Eski geçmiş kaydetme anahtarı, duraklatma, son saat/bugün temizleme ve Ctrl/orta tıkla yeni sekmede açma korunur. 1.000 satırlık ana geçmiş, 200 satırlık eski öneri sınırına yanlışlıkla indirilmez. Arama sayfaları ve fragment'li ziyaretlerin özgün adresi korunur. Site silme yalnız geçmiş kaydını kaldırır, çerez/site verisi silmez.

### Debug (31–40)

31. Son 1 / 5 / 15 dakika ve bütün kayıtlar filtresi.
32. Görünen hata, ölçülen çağrı sayısı ve ortalama çağrı süresi özeti.
33. Seçili tek kaydı ortam başlığıyla kopyalama.
34. Görünen sonuçları `.log` raporu olarak dışa aktarma.
35. En az 100 / 500 / 1.000 / 5.000 ms süren çağrıları süzme.
36. En yeni kayda gitme ve canlı takibi yeniden açma düğmesi.
37. Kategori, arama, hata, zaman ve süre filtrelerini birlikte sıfırlama.
38. Bekleyen/yazılamayan disk kaydı sayılarını ve yazma hatasını kalıcı durum alanında gösterme.
39. Hataları renk yanında uyarı simgesiyle; uzun çağrıları vurgu ve süre açıklamasıyla gösterme.
40. Seçili çağrının adını tek tıkla arama filtresine taşıma.

Eski 5.000 satır sınırı, anahtar/özel içerik maskelemesi, yüksek frekans örneklemesi, duraklatmanın yalnız görünümü durdurması ve döndürülen disk günlüğü korunur. Bu araç uzak sitenin bütün ağ trafiğini kaydeden HAR aracı değildir. Ortalama, görünen ve süre ölçümü bulunan kayıtlar üzerindedir; uygulamanın toplam performans puanı değildir.

### Asistan ve okuma/film kullanımı (41–50)

41. Sohbetteki son model yanıtını ayrı kopyalama.
42. Sohbetteki son kullanıcı sorusunu ayrı kopyalama.
43. Sohbeti düz metin `.txt` olarak dışa aktarma; Markdown seçeneği korunur.
44. Sohbet araçlarında mesaj ve yaklaşık kelime sayısı.
45. Mesajdaki tamamlanmış kod bloklarını tek başına kopyalama; kod çalıştırılmaz.
46. Tek bir mesajı Markdown olarak dışa aktarma.
47. Sohbet içi arama kapanınca klavye odağını arama düğmesine geri verme.
48. Hasarlı sohbet geçmişinin kurtarma yedeğini silmeden önce onay; iptal yedeği korur.
49. Alıntı dışa aktarımına vurgunun kayıt tarihini ekleme; kitap/yazar/bölüm/not bilgisi korunur.
50. Zevk profilinin aç/kapat başlığına durumuna uygun “Daralt/Genişlet” ipucu ve İngilizce karşılığı.

Yeni asistan araçları üç nokta menüsünde tutulur; mevcut küçük sohbet paneli ve tema korunur. Kopyalama/dışa aktarım kullanıcı eylemidir; yeni bir AI isteği veya araç yürütmesi başlatmaz.

## Gerçekleştirilen kontroller

- Yeni model beklentileri: eski kaynakta 0/20, son kaynakta 20/20.
- Gerçek React geçmiş/debug/asistan bileşenleri, taklit native/clipboard ile headless Edge: 7 akış geçti; arayüz hatası yok. Masaüstü ve dar ekran görüntüleri incelendi.
- Son frontend üretim derlemesi ve İngilizce denetimi başarılı.
- İlgili önceki model grupları: browser, browser-suggest, browser-magic, assistant-safety, debug, reading-experience, film-browser, web-notebook ve önceki quality-50. Ham çıktılar KONTROLLER altında.
- Rust değiştirilmedi. Gerçek Windows Luna penceresi, mpv oynatma, canlı model API'si ve canlı site/DRM test edilmedi. Headless köprü başarısı bu testlerin yerine geçmez.
- Tam kaynak ve iki alternatif yama paketlenir. Yamalar iki temiz tabanda gerçek uygulama/byte karşılaştırması/ters uygulama ile doğrulanır; ZIP kaynak hash'leri ayrıca denetlenir.

Commit/push/release yapılmadı. Paket tam kaynaktır; derlenmiş EXE veya kurulu bağımlılık içermez.
