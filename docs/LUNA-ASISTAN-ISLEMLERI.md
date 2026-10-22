# Luna Asistan — gerçek uygulama işlemleri

Bu tur, son verilen `Luna-Player-Tam-Paket-Gunluk-Gelistirmeler.zip` tam kaynağına eklenmiştir. Browser eklentileri/indirmeleri, önceki birleştirmeler, günlük geliştirmeler ve 9 Claude skill korunur. Bu yeni tam paket bir sonraki çalışmanın tabanıdır. Commit, push ve release yapılmadı.

## Kullanılabilen yeni işlemler

- Film/dizi kütüphanesini gerçek kayıt anahtarları ve dosya yollarıyla inceleme; tür, sorgu, şüpheli bölüm işaretleri ve sayfalama. 50 kayıt üst sınırıyla `hasMore` gösterilir; ilk sayfa bütün arşiv gibi sunulmaz.
- Film/dizi türünü, dizi adını, sezonunu ve bölümünü onayla düzeltme. Her dosya onay kartında ayrı görünür ve seçimden çıkarılabilir. Aynı diziye ait kayıtlar yeniden gruplandırılır; sezon 0 özel bölümleri korunur.
- Elle sınıflandırmayı kaldırıp dosya/klasör algısına dönme. Yanlış türdeki eski TMDB eşleştirmesi elle sınıflandırmayı geri çeviremez.
- Eşleşmiş film/dizi bilgilerinin otomatik değişikliklere karşı kilidini açma/kapatma.
- Gerçek kitap raflarını, müzik listelerini ve koleksiyonları ID ve öğe sıralarıyla inceleme.
- Kitap rafını yeniden adlandırma veya raf etiketini kaldırma. Kitap dosyası ve okuma geçmişi silinmez. Konuya göre raflara atama ve Okunacaklar işlemleri önceki gerçek kitap önizlemesiyle birlikte devam eder.
- Müzik listesinin adını değiştirme; seçilen şarkıları yalnız listeden çıkarma.
- Koleksiyon adını değiştirme, seçilen öğeleri çıkarma veya koleksiyon kaydını kaldırma. Kaynak medya dosyaları korunur.
- Web içinde sekmeleri listeleme, yeni sekme açma, sekme seçme/kapatma, yenileme, sayfada arama kutusunu doldurma, sesi açma/kapatma.
- Açık Web sayfasını favorilere veya okuma kuyruğuna kaydetme; sayfaya kişisel not ekleme. Bu kayıt değişiklikleri geri alınabilir. Sekme açma/kapatma ve ses komutları kayıt geri alma kapsamına girmez; mevcut kapatılan sekmeler geçmişi korunur.

## Düzeltmeler ve davranış sınırları

- Ekrandaki `Geçersiz çağrı atlandı: search_film_library` durumlarından biri olan boş sorgu düzeltildi: tüm kütüphaneye bakarken zorunlu bir başlık gerekmez. Bilinen arama araçlarında `q`, `search`, `title` varyantları `query` olarak normalleştirilir. Diğer zorunlu alan ve tür kontrolleri korunur.
- Düzenlemeler gerçek ID/path üzerinden yapılır; modelin tahmin ettiği kayıt veya dosya kabul edilmez. Numaralı dosya adı bir inceleme ipucudur, kesin dizi kanıtı değildir. Özellikle numaralı kısa filmler otomatik taşınmaz. Emin olunmayan seri adını kullanıcı belirlemelidir.
- Film/dizi düzeltmesi dosya yoluna bağlı bir uygulama kaydıdır. Dosyaları yeniden adlandırmaz veya taşımaz; kaynak metadata kaydını silmez. Yol değişirse eski override kendiliğinden başka dosyaya atanmaz. Oynatma geçmişi ve kaynak dosyalar yerinde kalır; eski filme bağlı kişisel puanlar yeni diziye otomatik kopyalanmaz.
- Düzenleme onayı beklerken aynı depolama kaydı değişmişse işlem reddedilir. Bozuk kayıtların üzerine yazılmaz; depolama doluluğu başarı diye raporlanmaz.
- Geri alma mevcut mekanizmayı kullanır: asistan işleminden sonra kullanıcı tekrar düzenlemişse o kayıt geri alınmaz. Kütüphane ve Web arayüzlerine yenileme olayı gönderilir.
- Web sayfası analizi araçsız kalır. Yalnız kullanıcının doğrudan Web işlemi istediği turda `manage_web` açılır; o isteğe sayfa metni veya eski sayfa sohbeti eklenmez, kütüphane araçları sunulmaz. Web değişiklikleri ayrıca onay ister.
- Web işlemi onay sırasında seçili sekme/URL/sayfa nesli değişirse yeni sayfaya uygulanmaz. Kuyruğa girmiş native kapatma, yenileme ve ses komutları çalışmaya başlamadan da bağlamı kontrol eder.
- Onaylanan kendi sekme açma işlemi, sayfa analizi iptaliyle yanlışlıkla yarıda kesilmez. Sayfa analizindeki geç yanıt koruması devam eder.
- Mevcut Luna teması ve sağ altta küçük kutu olarak açılan asistan korunmuştur. Yeni ayrı tam ekran veya siyah yan panel eklenmemiştir.

## Kullanıcı örnekleri

> Film listemdeki olası dizi bölümlerini incele. Emin olduklarını hangi diziye, sezona ve bölüme taşıyacağını dosya dosya göster; numaralı kısa filmlere dokunma.

> Felsefe rafının adını Düşünce olarak değiştir. Kitaplara dokunma.

> Yol müziği listemi incele; şu iki şarkıyı yalnız listeden çıkar.

> Bu sayfayı favorilere ekle. Bu sayfaya “Hafta sonu tekrar oku” notu bırak.

> Açık sekmeleri göster; YouTube sekmesine geç.

İşlem sayısı sınırlıdır: tek sınıflandırma çağrısında en fazla 200 dosya, kilit değişiminde 100 kayıt, liste öğesi çıkarmada 200 sıra. Beş araç turundan daha uzun işler ayrı mesajlarla sürdürülmelidir. Koleksiyon/müzik incelemesinde her listenin ilk 200 öğesi ve kesilme işareti verilir. Asistanın başarıyla işlem yapabilmesi için kullanılan modelin araç çağrılarını desteklemesi gerekir; salt metin iddiası işlem yapıldığı anlamına gelmez.

## Doğrulama

Hedefli kontroller: `npm run test:assistant-actions`, `npm run test:assistant-safety`, `node scripts/i18n-check.cjs`, `npm run build`; ayrıca `test:assistant-actions-ui` ve önceki `test:everyday-ui` akışları. Sonuçlar paketin KONTROLLER klasöründedir.

UI kontrolleri izole headless Edge'de gerçek React bileşenleri, taklit native köprü ve taklit AI kullanır. Canlı API, gerçek Windows Luna penceresi, DRM veya gerçek site oynatma testi değildir. Bu tur Rust kaynaklarını değiştirmez; gerçek Windows uygulamasını kullanıcı test eder. Üretim derlemesindeki mevcut büyük chunk/dinamik import uyarıları hata değildir.

## Claude için kod haritası

`assistantWorkspaceModel.ts` saf sınıflandırma planı ve incelemesini, `assistantWorkspaceActions.ts` şema/gerçek işlem/özel onay anlık görüntülerini, `browserAssistantActions.ts` sekmeye bağlı köprüyü içerir. `Taste.tsx` şemaları, özel önizleme verisini modelden ayrı tutmayı, onay/işaret kaldırma ve geri almayı bağlar. `library.ts` override'ları gruplamadan önce uygular. `Browser.tsx` mevcut native kuyruk ve veri yardımcılarıyla gerçek Web işlemlerini yürütür. Sahte başarı ekleme, sayfa içeriğine araç yetkisi verme veya mevcut uygulamanın üzerine kör kopyalama yapma.
