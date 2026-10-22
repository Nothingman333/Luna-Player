# 50 yeni düzeltme ve Luna Debug

Bu kaynak, Luna-Player-Tam-Paket-30-Duzeltme.zip üzerine geliştirilmiştir. Önceki browser, eklenti/indirme, asistan, film, kitap, müzik ve diğer yenilikler korunur. Bu listedeki 50 bulgu önceki 30'un tekrar sayılması değildir. Hepsi kritik hata değildir: bozuk veri, içe aktarma, sınır durumları ve kullanıcı işlemlerindeki hatalar da dahildir.

## Debug ekranı

Ctrl+Shift+D veya Ayarlar'daki yedekleme/tanılama bölümündeki “Hata ayıklama ekranını aç” düğmesiyle açılır. Yerel tarayıcı sayfasından gelen aynı kısayol da yönlendirilir. Luna'nın koyu teması ve vurgu rengi kullanılır; ekran kapatılınca sayfada kalıcı panel bırakmaz.

- Son 5.000 olay bellekte tutulur. Arka uç çağrılarının başlangıcı, adı, süresi, başarı/hata sonucu; JS hataları, yakalanmayan Promise hataları, React hata sınırı; mpv/müzik olayları, kuyruk değişiklikleri; AI sağlayıcı/model bilgisi; uygulamanın gördüğü tarayıcı, indirme ve kaynak yükleme hataları kaydedilir.
- Kategori, metin arama, yalnız hatalar, tümünü/görünenleri/son 200 satırı kopyalama, canlı takip, duraklatma, temizleme ve dosyayı açma bulunur. Satıra tıklayınca JSON ve mevcut hata yığını açılır. Klavye odağı, Escape ve dar ekran düzeni desteklenir.
- Duraklat yalnız görünümü dondurur; kayıt ve disk yazımı sürer. Temizle yalnız bellek listesini temizler, eski disk kaydını silmez. Dosyayı aç, sabit uygulama günlük dosyasını Not Defteri'nde açar; dışarıdan dosya yolu kabul etmez.
- Kopyalanan rapor sürüm, işletim sistemi/sürümü, mimari, ekran ölçeği/çözünürlüğü, geçerli uygulama sayfası veya web kaynağı ve kayıt durumuyla başlar. Gizlilik için web adresinin yol/sorgusu yerine origin yazılır.
- API anahtarları, yetkilendirme, parolalar, çerezler, istem/sayfa içeriği ve özel dosya yolları maskelenir. Native sonuçların kendisi yerine tür/sayı kaydedilir. Ham model yanıtı ve istem gövdesi kayda alınmaz.

Kayıt sınırlıdır: yüksek frekanslı konum/progress olayları yaklaşık saniyede bir örneklenir; ayrıntılar boyutlandırılır. Disk kayıtları yaklaşık 4 MB'de döndürülür, sonsuz arşiv değildir. Disk kuyruğu 1.000 satırla sınırlı; yazma hatası veya aşımda kayıp sayısı rapor başlığında gösterilir. İlgili log komutları tekrar kaydedilmez. Bu araç uzak sitelerdeki bütün HTTP isteklerinin HAR kaydı değildir; uygulamanın görebildiği çağrı ve olayları toplar. React hata sınırının kapsamadığı çökmeleri yakalama garantisi verilmez.

## 50 ayrı hata

Her satırın beklenen davranışı `app/scripts/quality-50-regression.cjs` içindedir. Aynı 50 kontrol önceki kaynak üzerinde 0/50, düzeltilmiş kaynakta 50/50 geçti. Önce/sonra JSON çıktıları KONTROLLER altındadır.

| No | Kaynak (`app/src/`) | Hata ve düzeltme |
|---|---|---|
| 01 | playbackModel.ts | Sonsuz/NaN süre kayıt sırasında null olabiliyordu; geçersiz süre reddedilir. |
| 02 | playbackModel.ts | Geçici EOF aşımı devam et konumunu dosya sonundan ileri kaydediyordu; süreye sınırlandırılır. |
| 03 | M3u.tsx | Göreli M3U yolları UNC paylaşım kökünü bozabiliyordu; paylaşım sınırı korunur. |
| 04 | M3u.tsx | Sıradan yorumda geçen HLS etiketi kanal listesini stream sanıyordu; gerçek etiket satırı aranır. |
| 05 | M3u.tsx | EXTINF sonrasındaki EXTGRP kanalın önceki grubunu değiştirmiyordu; doğru sıra uygulanır. |
| 06 | M3u.tsx | Hatalı yüzde işaretli dosya adı URI çözümlemesinde açılışı kesiyordu; güvenli geri dönüş eklendi. |
| 07 | M3u.tsx | Bozuk son listeler kaydı sağlam liste açmayı bozuyordu; güvenli okuma, bozuk ham veriyi koruma eklendi. |
| 08 | M3u.tsx | Yalnız CR kullanan satır sonları ayrılmıyordu; desteklendi. |
| 09 | M3u.tsx | Göreli kanal logosu liste adresine göre çözülmüyordu; kaynak URL tabanı kullanılır. |
| 10 | M3u.tsx | Kökten başlayan yerel kanal yolu listenin sürücüsüne bağlanmıyordu; sürücü korunur. |
| 11 | M3u.tsx | Çok büyük listeler sınırsız işleniyordu; 8 MiB ve 20.000 kanal bütçesi aşımında anlaşılır ret eklendi. |
| 12 | musicWorkspaceModel.ts | Taşınabilir liste dışa aktarımı URL kullanıcı adı/parolasını taşıyabiliyordu; kimlik bilgili kaynak reddedilir. |
| 13 | musicWorkspaceModel.ts | İçe aktarılan yerel parça yolları NUL/kontrol karakteri kabul ediyordu; reddedilir. |
| 14 | musicWorkspaceModel.ts | Aynı Windows dosyasının harf/eğik çizgi varyasyonları yinelenen sayılmıyordu; eşleştirme düzeltildi. |
| 15 | readingExperienceModel.ts | Gece yarısını aşan birleşik okuma dakikaları ilk güne yazılıyordu; günlere bölünür. |
| 16 | readingExperienceModel.ts | Birleşen oturumun gerçek bitişi kaybolup sonraki birleştirme bozuluyordu; endAt saklanır. |
| 17 | bookReaderModel.ts | Geçersiz EPUB bölüm indeksi kitabı bitmiş gösterebiliyordu; indeks doğrulanır. |
| 18 | bookDataModel.ts | Kitap açıklamasındaki HTML varlıkları ham görünüyordu; yaygın ve sayısal varlıklar çözülür. |
| 19 | bookDataModel.ts | ISBN-10/ISBN-13 etiketli geçerli arama değerleri reddediliyordu; etiket temizlenir. |
| 20 | bookDataModel.ts | Geçersiz birincil kapak adresi sağlam küçük kapağa dönüşü engelliyordu; geçerli yedek denenir. |
| 21 | browserHistoryModel.ts | Geçmiş kurtarma yinelenen ve sırasız ziyaretler bırakıyordu; en yeni tekil kayıtlar seçilir. |
| 22 | browserHistoryModel.ts | Saat geri alındığında ilk ziyaret son ziyaretten ileri kalabiliyordu; zamanlar tutarlılaştırılır. |
| 23 | browserHistoryModel.ts | Hızlı başarısız yenileme eski sağlam ziyaret sayısını azaltabiliyordu; yalnız eklenen ziyaret geri alınır. |
| 24 | browserHistoryModel.ts | Sayısal fakat Date sınırı dışındaki zaman geçmiş gruplamasını bozabiliyordu; reddedilir. |
| 25 | browserWorkspaceModel.ts | İçe aktarılan favoride URL yerine arama metni Google favorisine dönüşüyordu; HTTP(S) adresi zorunlu. |
| 26 | browserWorkspaceModel.ts | İlk sekiz favori zaten açıksa daha sonraki açılabilir favoriler atlanıyordu; filtre öncesi aday taraması genişletildi. |
| 27 | browserReaderContent.ts | Ayrışık aksan/işaret arama vurgusunun dışında kalıyordu; eşleşme aralığı tamamlanır. |
| 28 | browserReaderContent.ts | Ardışık aynı paragraflar, gerçek tekrar olsalar bile siliniyordu; korunur. |
| 29 | browserTranslation.ts | “Özgün sayfaya dönme” olumsuz talimatı geri dönüş başlatıyordu; olumsuz niyet dikkate alınır. |
| 30 | browserTranslation.ts | Desteklenmeyen açık hedef dil sessizce Türkçe'ye çevriliyordu; otomatik yanlış dil işlemi durdurulur. |
| 31 | assistantToolRun.ts | Araç tekrar engelleme harf duyarlı yol/URL/not/ID'leri küçük harfe çevirip birleştiriyordu; kimlik alanları korunur. |
| 32 | assistantToolRun.ts | Başarılı yapılandırılmış “Not Found” adlı sonuç hataymış gibi sayılıyordu; JSON başarı yapısı dikkate alınır. |
| 33 | assistantReliability.ts | Kaydedilmiş asistan kartlarının bozuk iç kitap/şarkı/film alanları render'ı bozabiliyordu; iç yapı temizlenir. |
| 34 | assistantReliability.ts | Dostça sağlayıcı hata metni gizli veri maskelemesini atlayabiliyordu; aynı maskelemeden geçer. |
| 35 | assistantReliability.ts | api_key biçimindeki alanlar sağlayıcı hata metninde gizlenmiyordu; desen genişletildi. |
| 36 | reviewAnalysis.ts | Boş AI puanı bilinmiyor yerine sıfıra dönüşüyordu; boş puan ayrı tutulur. |
| 37 | reviewAnalysis.ts | En iyi yorum etiketi analiz edilen öğeye karşılık gelmeyen sıra numarasını kabul ediyordu; kaynak aralığı doğrulanır. |
| 38 | reviewAnalysis.ts | Geçersiz analiz geçmişi tarihi görünüme taşınıyordu; kayıt doğrulanır. |
| 39 | reviewAnalysis.ts | Ölçek dışı yıldızlar topluluk puanını şişirebiliyordu; .5–5 aralığı kullanılır. |
| 40 | safety.ts | Yedek şekil doğrulamasında müzik listeleri/beğeniler/son M3U listeleri eksikti; kapsam tamamlandı. |
| 41 | safety.ts | Geri yükleme onayı başarısız olduğunda yalnız arayüz geri alınıyordu; kalıcı kopya da geri yüklenir. |
| 42 | safety.ts | Depolama işleminde aynı anahtar iki kez kullanılabiliyordu; yazma öncesi reddedilir. |
| 43 | extrasModel.ts | Taşınan Windows yoluna bağlı ayarlar harf/eğik çizgi farkında yeniden bağlanmıyordu; eşleştirme düzeltildi. |
| 44 | extrasModel.ts | Koleksiyon film yılı çevresindeki boşluk yinelenen tespitini kaçırıyordu; yıl temizlenir. |
| 45 | extrasModel.ts | İstenen başlıktaki yıl dikkate alınmayıp yeniden çevrimler aynı izlenmiş film sayılabiliyordu; yıl eşleşir. |
| 46 | extrasModel.ts | CSV yıldız puanında Türkçe ondalık virgül okunmuyordu; desteklendi. |
| 47 | extrasModel.ts | İzlenmiş kaydı yazılamayınca bellek yine değişiyordu; önce yazma doğrulanır, sonra cache yayımlanır. |
| 48 | library.ts | Yanlış şekilli son medya kaydı kütüphane başlangıcını bozabiliyordu; ham veri korunarak güvenli okunur. |
| 49 | library.ts | Bozuk sezon önbelleği dizi olmayan bölüm sonucu verebiliyordu; dizi yapısı doğrulanır. |
| 50 | ReadAloud.ts | Geçici boş native ses listesi Promise önbelleğinde sonsuza dek kalıyordu; yeniden deneme sağlanır. |

## Doğrulama ve sınırlar

- Yeni 50 model/davranış kontrolü: 50/50; eski kaynakta aynı beklentiler 0/50.
- Debug model ve instrumentasyon: 10/10; gerçek React debug ekranı, taklit native köprü ve headless Edge: 6/6.
- Üretim frontend derlemesi, TypeScript ve İngilizce metin denetimi başarılı. İlgili eski asistan güvenliği/işlemleri, çeviri, okuma, müzik, extras, genel regresyon ve 30 düzeltme kontrolleri başarılı.
- Rust `cargo check --offline --locked` başarılı; mevcut taşınabilir GNU araç zincirinde link-self-contained bayrağı ve yalnız kontrol sırasında bundle kaynakları hariç tutuldu. Projenin üretim kimliği, bağımlılıkları ve kilit dosyaları değiştirilmedi. Mevcut uyarılar derleme hatası değildir.
- Gerçek Windows Luna penceresi otomatik kullanılmadı. Canlı model/DRM/site oynatma ve gerçek Windows mpv oturumu sınanmadı. Sentetik kontroller bu testlerin yerine sunulmaz.
- İki yama, ayrı temiz tabanlara `git apply --check` ve gerçek uygulamayla doğrulanır; tüm kaynak byte'ları ve geri alma karşılaştırılır. ZIP kaynak hash'leri ayrıca kontrol edilir.

Commit, push ve release yapılmadı. Paket tam kaynaktır; EXE/kurulu bağımlılık içermez. Yeni çalışma tabanı bu pakettir; eski yamalar tekrar üstüne uygulanmaz.
