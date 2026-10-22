# Son tur: 40 somut düzeltme ve geliştirme

Bu liste yalnız bu turda eklenen işleri anlatır. Önceki browser/asistan, kitap/müzik, koleksiyon, AI profilleri ve diğer birleştirmeler tam kaynakta korunur. Maddelerin hepsi ayrı bug iddiası değildir; hata düzeltmeleri ve yeni kullanım kolaylıkları ayrı belirtilmiştir.

## Browser — 14 madde

1. **Düzeltme:** 40 favori doluyken yeni favori eklemek eski favoriyi sessizce silmez; sınır açıklanır.
2. **Düzeltme:** Aynı adrese kısayol eklemek mevcut kaydı yerinde günceller; listeyi sebepsiz yeniden sıralamaz. Başlık uzunluğu sınırlıdır.
3. **Ekleme:** Favorileri JSON olarak dışa aktarma.
4. **Ekleme:** Favori JSON dosyasını mevcut listeyle birleştirerek içe aktarma. Adresler doğrulanır; geçersiz/sınırı aşan dosya mevcut listeyi değiştirmez. Dosya 128 KiB ile sınırlıdır.
5. **Ekleme:** Çeviri dili hatırlanır; ilk seçim arayüz diline göre yapılır.
6. **Ekleme:** Ctrl+1…8 ve Ctrl+9 ile belirli/son sekmeye geçme.
7. **Ekleme:** Sekme şeridinde oklar, Home ve End; etkin sekmede klavye odağı korunur. Yalnız etkin sekme Tab sırasındadır.
8. **Ekleme:** Orta fare düğmesiyle ilgili sekmeyi kapatma.
9. **Düzeltme:** Sayfa araçları dışarı tıklayınca kapanır; Escape, odağı araç düğmesine döndürür.
10. **Ekleme:** Kaydedilmiş sekme grubundan tek bir sayfayı açma; aynı adres açıksa o sekmeye geçme.
11. **Ekleme:** Kaydedilmiş gruptan tek kaydı kaldırma.
12. **Düzeltme:** Sekme/favori yöneticisinin async işlemleri kilitlenir; dosya okuma sürerken ikinci düzenleme ilk kaydın üzerine yazmaz.
13. **Düzeltme:** Kullanıcı başka sekmeye geçince eski uyarı temizlenir; sekme oluşturma hatası yanlışlıkla temizlenmez. Favori adlandırma alanı odaklanır ve Escape ile vazgeçilir.
14. **Ekleme:** Sekme yöneticisinde kısa klavye kılavuzu ve favori sayacı.

Bu kısayollar Luna'nın kendi arayüzü odaktayken çalışır. Uzak WebView2 sayfasının kendi klavye olaylarını ele geçirmek için yeni bir native köprü eklenmedi.

## Asistan — 10 madde

15. **Düzeltme:** Normal yanıt ve araç devam turları sağlayıcı/model/URL/anahtarı mesaj başında yakalar; Ayarlar değişirse süren yanıt başka sağlayıcıya kaymaz. Koleksiyon araştırması da aynı profili kullanır.
16. **Düzeltme:** Kimlik doğrulama, izin, iptal ve bağlantı hatalarında model zinciri gereksiz tekrar isteği göndermez. Kota/model hatalarında mevcut fallback korunur.
17. **Düzeltme:** Araçsız fallback tüm sistem talimatlarını korur; sadece ilk parçayı almak nedeniyle yanıt tercihi ve diğer bağlam kaybolmaz.
18. **Düzeltme:** Gösterilen AI hata metninde kullanılan anahtar, Bearer değeri ve yaygın token sorgu parametreleri maskelenir.
19. **Düzeltme:** Araç başlamadan başarısız olan isteğin metni boş taslak kutusuna geri gelir; kullanıcının sonradan yazdığı taslak ezilmez. Araç başlamışsa otomatik taslak geri yüklemek yerine kısmi işlem uyarısı gösterilir; hiçbir işlem otomatik yeniden gönderilmez.
20. **Ekleme:** Açık asistan panelinde kayıtlı konuşmalar arasında geçerken gönderilmemiş taslaklar ayrı tutulur. Panel kapatıldıktan sonra kalıcılık vaadi yoktur.
21. **Düzeltme:** Mesaj/sohbet geçmişinin temel şekli doğrulanır; nesne yerine dizi beklenmesi veya metin yerine sayı gelmesi render zincirini düşürmez.
22. **Ekleme:** Asistan odaktayken Ctrl+F doğrudan sohbet aramasını açar; aramayı temizleme düğmesi eklenir.
23. **Düzeltme:** Eski tarayıcılarda pano fallback'i metin seçimini ve önceki odağı geri yükler.
24. **Düzeltme:** Kullanıcı yeni mesaj gönderince sohbet en alta döner; geçmişi okurken bırakılmış kaydırma konumu yeni isteği görünmez bırakmaz.

## Film kütüphanesi — 10 madde

25. **Ekleme:** Eskiden yeniye sıralama.
26. **Ekleme:** Süreye göre kısadan uzuna sıralama; süresi bilinmeyenler sonda.
27. **Ekleme:** ≤90, 91–150 ve >150 dakika süre filtreleri; bilinmeyen süre bu gruplara sokulmaz.
28. **Ekleme:** Başlanmamış, devam edilen ve izlenmiş kayıt filtreleri. Bir filmin bitmiş kopyası filmi izlenmiş sayar; dizide bütün bölümlerin bitmesi gerekir.
29. **Ekleme:** Puanı olmayanları ayrı gösterme.
30. **Ekleme:** Etkin filtreleri ayrı küçük düğmelerden kaldırma; diğer seçimler korunur. Yeni filtreler mevcut film/dizi görünüm tercihine kaydedilir.
31. **Düzeltme:** Eksik veya dosyasız katalog kayıtları listeyi çökertmez; sayıları uyarıda gösterilir ve asıl kayıtlar silinmez. Afiş kartı ve thumbnail isteği de boş yola karşı korunur.
32. **Düzeltme:** Geçersiz yıl/NaN puanı sıralamayı bozmaz; bilinmeyen yıllar tarih sıralamalarında sona gider.
33. **Ekleme:** Kütüphane araması tür adlarını da tarar; çok kelimeli/aksan duyarsız arama korunur.
34. **Görsel geliştirme:** Kartlarda TMDB topluluk puanı rozeti ve bilinen film süresi; mevcut Luna renkleri, küçük etiketler, görünür klavye odağı ve dar pencere düzeni korunur.

## Medya motoru / arşivler — 6 madde

35. **Düzeltme:** PGS istek nesli aynı kilit altında başlatılır, kurulur ve yayımlanır. Geç biten eski yükleme yeni izi değiştiremez; clear da devam eden işleri geçersiz kılar. Eski progress/ready/error bildirimi süzülür.
36. **Düzeltme:** PGS boyutları ve taşma denetimli RGBA hesabı sınırlıdır: en fazla 4096×2160 piksel bütçesi, ayrıca en/boy sınırları. RLE satır dışına gereksiz döngü yapmaz; nesne verisi 8 MiB, toplam tutulan nesneler 32 MiB, nesne sayısı 256 ile sınırlıdır.
37. **Düzeltme:** PGS paket başına 16 MiB, toplam iz 128 MiB, 100.000 paket; en fazla 30.000 çıktı resmi ve 1 GiB toplam çözümlenen RGBA bütçesi. Zlib genişlemesi ve header-stripping verisi de denetlenir. Limit aşımı hata döndürür.
38. **Düzeltme:** PGS decode işleri sırayla çalışır; okuma/çözümleme sırasında eski istek bırakılır. EBML boyut/u64 taşmaları reddedilir; önbellek indeksi 8 MiB ile okunur ve temel içeriği doğrulanır. Dosyanın değişim zamanı ve yeni cache sürümü anahtara katılır.
39. **Düzeltme:** Font içe aktarmada font başına 32 MiB ve işlem toplamı 128 MiB; ZIP başına en fazla 1.000 girdi, en fazla 64 seçilen dosya. Gerçek açılan veriler de sınırlı okunur. Font listesinin dosya okumaları da sınırlanır.
40. **Düzeltme:** CSV/Letterboxd ZIP okumalarında dosya başına 50.000.000 bayt, toplam 128 MiB, 200 CSV, 10.000 ZIP girdisi ve 64 seçilen dosya sınırı. Gerçek açılan veri aşılırsa kırpılmış CSV kullanmak yerine hata döner.

## Gönderilen raporla karşılaştırma

- PGS yarış durumu: **mevcuttu, düzeltildi**. Kaynak ve bağımsız Rust testleriyle doğrulandı; gerçek film/Windows oynatma ile yeniden üretim yapılmadı.
- PGS bellek sınırları: **mevcuttu, düzeltildi**. Küçük geçerli bitmap, aşırı boyut, toplam paket bütçesi ve taşma senaryoları test edildi.
- EPUB/CBZ sınırsız zip_text/zip_bytes: **bu paket öncesinde düzeltilmişti**. Mevcut kaynakta XML 4 MiB, resim 64 MiB, 10.000 girdi, 2 GiB ilan edilen açılmış arşiv toplamı ve 300 MiB kitap dosyası sınırı var; yerel EPUB meta/CBZ sayfa taraması da korumaları kullanıyor. Bu turda tekrar yeni bug diye sayılmadı. Font ve CSV tarafında kalan toplam sınırlar ayrıca tamamlandı.
- Eksik 10 İngilizce anahtar: **bu son kaynakta yeniden oluşmadı**. `node app/scripts/i18n-check.cjs` başarıyla geçiyor; önceki düzeltmeler korunuyor.

## Kontrol sınırları

- 202 kısa JavaScript/TypeScript regresyonu geçti (önceki 184 + yeni 18). Bu sayı bug sayısı değildir.
- TypeScript/Vite üretim derlemesi ve İngilizce metin kontrolü geçti.
- İzole gerçek React bileşenleri + headless Edge + taklit native/AI: 9 yeni akış geçti. Gerçek site/sağlayıcı/Windows UI testi değildir.
- Aynı üretim PGS modülü ve CSV fonksiyonuyla bağımsız Rust yürütücüsünde 10 test geçti; gerçek medya isteyen 1 test bilerek ignored.
- Tam uygulama `cargo test --lib` derlendi ancak GNU test EXE'si bu ortamda `0xc0000139 / STATUS_ENTRYPOINT_NOT_FOUND` DLL başlangıç hatasıyla çalışamadı. Bağımsız testler bunun yerine tüm uygulama testleri geçti diye sunulmaz. GitHub Windows MSVC CI sonucu henüz yoktur.
- Native üretim kaynak derlemesinin sonucu TESTLER/rust-build.log içindedir. GitHub Actions tetiklenmedi; npm ci için yeni bağımlılık eklenmedi. Release/commit/push yapılmadı.
