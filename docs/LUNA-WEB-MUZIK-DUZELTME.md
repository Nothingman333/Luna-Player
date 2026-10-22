# Web ve müzik çubuğu yerleşim düzeltmesi

Önceki tam 50 düzeltme + Debug paketi üzerine küçük yerleşim düzeltmesidir. Önceki tüm kaynak, yenilikler ve dokuz Claude skill korunur.

Web açıkken müzik dock'u browser-shell alanını 104 piksel kısaltıyordu. Böylece çubuğun kenarlarında ve altındaki boşlukta arkadaki film/kitap/müzik kütüphanesi görünür kalabiliyordu. Browser arka planı artık pencerenin altına kadar uzanır; 104 piksel boşluk içeride padding olarak ayrılır. Site slotu çubuğun üstünde kalır. Native katman mevcut slot ölçümünü kullanmaya devam eder; Rust değiştirilmedi.

Web aktifken arkadaki shell-body görünümden çıkarılır ve shell kaydırması kapatılır. Böylece benzer kitap/müzik sayfası sızıntısı, görünmeyen içerikte odak ve arkadaki kütüphane kaydırma çubuğu engellenir. Bileşenler unmount edilmez; Web'den dönünce görünüm ve kaydırma geri gelir. Müzik yokken browser tüm yüksekliğini tekrar kullanır. Yeni sabit siyah alt şerit veya yeni tasarım eklenmedi; mevcut tema arka planı korunur.

Üretim CSS ile izole headless Edge kontrolü: masaüstü 1366px ve dar 480px; alt/yan boşlukların opaklığı, site slotunun dock üstünde olması, kütüphanenin gizlenmesi, arka scrollbar'ın kapanması, müzik durunca alanın büyümesi ve Web'den çıkınca kütüphanenin geri gelmesi geçti. Bu sentetik sayfa geometrisi kontrolüdür; gerçek Windows Luna penceresi veya native WebView2 oynatma testi değildir. Son frontend build başarılı. Önceki test kayıtları tarihsel kanıt olarak korunur.

Paket iki alternatif yama içerir: GitHub 5673016 tabanı için changes.patch; son 50 düzeltme + Debug ZIP'i için onceki-pakete-ek.patch. İkisi üst üste uygulanmaz. Tam kaynak kullanılmışsa ayrıca yama uygulanmaz. Yerel farklar dosya bazında birleştirilir. Her iki yama temiz tabanda uygulanıp byte karşılaştırması ve ters uygulamayla doğrulanmıştır. Commit/push yok.
