# Web defteri, not taslakları ve favori sıralaması

Browser araç menüsündeki “Web defterimi aç” düğmesiyle açılır. Luna'nın mevcut modal, renk, kenarlık ve vurgu düzenini kullanır.

## Eklenenler

- Okuma kuyruğu ve bütün sayfa notları için ayrı, aramalı bir defter penceresi.
- Başlık, URL ve kişisel not içinde Türkçe harf/aksan farkını tolere eden birleşik arama.
- Bütün sayfalar, okunacaklar, başlananlar ve okunanlar filtreleri.
- Son kayıt, başlık ve okuma ilerlemesine göre sıralama.
- Okunacak/okundu/not sayıları ve filtredeki sonuç sayısı.
- Kaldığın kaydırma konumundan açma; dinamik sayfalarda konum yaklaşık olabilir.
- Okundu durumunu değiştirme; kuyruktan kaldırma ve aynı pencerede son kaldırmayı geri alma.
- Kaldırmayı geri alırken sonradan tekrar kaydedilmiş sayfanın yeni kaydını ezmeme.
- Kuyruktan kaldırılan sayfanın notunu koruma; bağımsız notları bütün notlarda bulabilme.
- Yalnız görünen kayıtları, kaynak bağlantısı ve notlarıyla Markdown dışa aktarma.
- 20'şer kayıt gösterme, filtre değişince sayfalama sınırını sıfırlama ve dar pencere düzeni.
- Hasarlı kayıtta okunabilenleri gösterme; düzenlemeyi kapatma ve yalnız ilgili iki ham veri alanını kurtarma JSON'una dışa aktarma. Otomatik silme/onarım yok.
- Araç menüsünde yalnız ilk üç kuyruk kaydı; uzun listeye ayrı defterden erişim.
- Sayfa notlarının son 20 taslağını uygulamanın belleğinde koruma. Menü kapanıp açılsa da taslak kalır; uygulama kapanınca kaybolur. Henüz kaydedilmemiş taslak otomatik diske veya asistana gönderilmez.
- Taslak göstergesi, taslağı geri alma ve Ctrl+Enter ile kaydetme.
- Not başka bir yerde değişmişse yeni kaydın üzerine yazmama; taslağı koruyup açık hata verme.
- Favorileri yukarı/aşağı taşıma; arama tek favoriyi gösterse de bütün listenin gerçek sırası kullanılır.

## Akış düzeltmeleri

Defter portalında tıklamak artık üstteki araç menüsünü kapatıp defteri yok etmez. Not kaydında güncel kayıt yeniden okunur; başka yerde yapılan değişiklik kaybolmaz. Kuyruk düzenleme ve geri almada da güncel veri esas alınır; hasarlı depoya yazılmaz. Sayfa değişmişse not/konum kaydı mevcut adres doğrulanmadan uygulanmaz.

## Kontroller

13 yeni davranış testi arama, filtre/sıralama, bağımsız notlar, geri alma çakışması ve kapasitesi, not çakışması, dışa aktarma ve favori sırasını doğrular. Gerçek Browser/BrowserExtras/WebNotebook/BrowserWorkspace bileşenleriyle izole headless Edge içinde 7 akış ayrıca geçti: taslak kalıcılığı, eşzamanlı not koruması, defter içindeki arama/dışa aktarma, kaldır/geri al, okuma durumu/not araması, 480 piksel düzen ve filtrelenmiş favoriyi taşıma.

Native köprü ve dosya dışa aktarma taklit edildi; gerçek kullanıcı verileri, gerçek Windows penceresi, canlı siteler veya sağlayıcı kullanılmadı. Önceki Claude birleşimleri ve native Browser ARA-03 özellikleri korunur. Commit/push yapılmadı. Bütün eklemeler güncel tam GitHub kaynak paketine dahildir.
