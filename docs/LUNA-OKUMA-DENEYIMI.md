# Okuma deneyimi ve alıntı defteri geliştirmeleri

Bu tur Browser.tsx, Taste.tsx, ai.ts ve film Screens.tsx dosyalarına dokunmadan tamamlandı. Mevcut üç Claude paketinin görev/snapshot içeriği değiştirilmedi.

## Alıntı defteri

- Büyük boş liste yerine kaynak, kişisel not ve vurgu rengini ayıran Luna temalı kartlar.
- Alıntı, not, bölüm, kitap, yazar ve etiket üzerinde çok kelimeli, Türkçe/aksan duyarsız arama.
- Kitaba ve etikete göre birlikte filtreleme; başlık aynı olsa bile kitap yolu ile ayrım.
- Yeni/eski ve kitaba göre sıralama; seçimler kaynak veriyi değiştirmez.
- Alıntıyı kitabı, yazarı, bölümü, notu ve etiketleriyle kopyalama.
- Yalnız filtrelenen sonuçları Markdown dışa aktarma; iptal edilirse başarı mesajı gösterilmez.
- Etiketleri prompt penceresi yerine kart içinde düzenleme, Kaydet/Vazgeç/Escape; yinelenen etiketler ayıklanır.
- Etikete tıklayarak filtreleme; tüm filtreleri tek düğmeyle temizleme.
- Kayıt sırasında en güncel etiket haritası okunur; başka alıntılara arada eklenen etiketler korunur.
- Bozuk etiket verisi sessizce boş nesneye çevrilip üzerine yazılmaz. Uyarı ve yedek önerisi gösterilir; düzenleme durur.
- Uzun defterler başlangıçta 60 kart, isteğe bağlı 60 daha gösterir. Dışa aktarma yalnız ekranda yüklenmiş 60 satırla sınırlanmaz; bütün filtrelenmiş sonuçlar alınır.
- Geç biten kitap taraması kapatılmış defterin veya yeniden açılmış ziyaretin verisini değiştirmez.
- Kaynağa dönüş mevcut EPUB CFI akışını kullanır; yeni ikinci not deposu oluşturulmadı.

## Okuma geçmişi ve okuyucu

- Geçmişte kitap/yazar araması ve son 7/30/90 gün filtreleri.
- Filtrelenen oturumların süre toplamı, sayısı ve Markdown dışa aktarımı.
- Gruplama yıl-ay-gün anahtarıyla yapılır; farklı yılların aynı tarihleri karışmaz. Başlıkta yıl görünür; oturumlar yeniden eskiye sıralanır.
- Bir oturumu kaldırmak yalnız aynı zaman damgasına sahip başka bir kitabı da kaldırmaz; kitap yolu da karşılaştırılır.
- Geçmiş kaldırma/temizleme kaydedilemezse arayüz başarılıymış gibi boşalmaz; hata gösterilir.
- Oturum birleştirme yalnız öncekinin bitişinden sonraki 0–30 dakika aralığında yapılır. Negatif fark/çakışan zamanlar yanlış birleşmez. Geçersiz süre ve ilerleme yeni kayda giremez.
- Okuyucunun tema/font/aralık/sayfa düzeni değerleri sabit seçeneklerden doğrulanır; yazı boyutu 70–200, karartma 0–0.7 ve sıcaklık 0–1 sınırında tutulur. NaN/Infinity veya bozuk türler görünüme taşınmaz. Eski gray teması dusk olarak korunur.
- Vurgu/not/yer imi verisinin bozuk satırları gösterimde ayıklansa bile sonraki bir düzenleme bu satırları sessizce silmez; mevcut ham veri doğrulanamazsa kaydetme engellenir, yedek önerilir. Bu otomatik veri kurtarma değildir.

## Kontroller ve sınırlar

Yeni 10 davranış kontrolü dahil toplam 223 kısa JS/TS testi geçti. Gerçek okuyucu not kaydetme fonksiyonu bozuk veriyle çalıştırılarak yazmadan durduğu ayrıca sınandı. Yeni alıntı panelinde taklit pano/dosya yazımıyla 5 headless gerçek React akışı geçti: arama/kopyalama, eşzamanlı etiket koruma, filtreli dışa aktarma/kaynağa dönüş, 480px yerleşim ve bozuk veri koruması. Derleme, çeviri kontrolü ve diff biçim kontrolü geçti.

Gerçek EPUB dosyası, Windows oynatma penceresi, canlı servis veya fiziksel pano testi yapılmadı. Önceki tam Rust test yürütücüsü DLL başlangıç kısıtı geçerlidir. Commit/push/release yapılmadı. Son paket browser'ın ilk eklenmesinden bu yana önceki çalışmaların tümünü de içerir.
