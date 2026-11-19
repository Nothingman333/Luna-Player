# Luna gerçek kullanım incelemesi (2026-11-12)

Test edilen: kök klasördeki `Luna Player.exe` (sürüm 3.5.1CC, 7 Kasım derlemesi). Kaynakta 3.5.3CC var; bu exe'de sonraki düzeltmeler yok.
Yöntem: Uygulamayı gerçek pencerede fare/klavye ile gezdim, her ekrana girip çıktım.

Önem: 🔴 bozuk / çalışmıyor · 🟠 yanlış ya da kafa karıştırıcı · 🟡 görünüm/tutarlılık

## Bulgular

1. 🟠 **Açılış "Neler yeni?" penceresi boş.** Başlık "Luna 3.5.1CC · Neler yeni?" ve "Başlayalım" düğmesi var, arada hiç madde yok. Kullanıcı ne değiştiğini göremiyor.
3. 🔴 **Film sayfasında puan seçilemiyor (gerçek pencerede tekrarlandı).** Galaksinin Koruyucuları 3: 👍 basılı filmde 👍'e basınca oy siliniyor (puan balonu açılmıyor). Tekrar basınca balon açılıyor ama "9"a fareyle tıklamak hiçbir şey yapmıyor; puan 7 kalıyor. Aynı kod tarayıcı test sayfasında çalışıyor → gerçek pencerede balonun üstünde görünmez bir katman var. 3.5.3CC kaynağında basışta kaydetme + `rate_ask_open/pointer` debug kaydı eklendi; yeni derlemede doğrulanmalı.
4. 🟡 **Kalan süre biçimi tutarsız.** Ana sayfa kartı "2:08:32 kaldı", film sayfası "129 dakika kaldı", hero "7:26 kaldı". Aynı bilgi üç biçimde.
5. ✅ (hata değil) **"Nerede izlenir: JustWatch · AT".** Ayarlar › Genel'de izleme ülkesi Avusturya seçili; doğru davranıyor.
6. 🟠 **Kütüphane özeti: "1 erişilemeyen klasörler"** (tekil sayıyla çoğul) ve özet penceresinde H:\filmler için hiçbir eylem yok (yeniden bağla / kaldır / tekrar dene). Kullanıcı ne yapacağını bilmiyor. Uyarı şeridi her sayfada kalıyor.
7. 🟡 **Filmler sayfasında iki sıra filtre.** Üstte A→Z / Tümü / Tüm türler, altında Bütün yıllar / TMDB puanı / süre / durum, bir de "Filtre rafları". Aynı işi yapan iki filtre bölgesi kalabalık.
8. 🟠 **"ekran kaydi" film olarak listede.** Bir ekran kaydı dosyası kütüphanede film kartı olarak duruyor (afiş yok, bilgisi yok). Kişisel videoları ayırmanın bir yolu yok.
9. 🟡 **Ana sayfa hero ile "İzlemeye devam et" sırası uyuşmuyor.** Hero "Kaldığın yerden devam et: Supergirl" diyor, sıranın ilk kartı Galaksinin Koruyucuları 3 (en son izlenen).
10. 🟠 **Öneriler sayfası kendi içinde çelişiyor.** Üstte "Henüz profil yok… Profilimi oluştur" yazıyor, hemen altında dolu "Zevk özetin" (97 beğendiğin, 20 beğenmediğin, 6,6 ortalama, 128) ve "Zevk profilin" (yine 97 / 20 / 6,6) var. Aynı sayılar iki ayrı blokta tekrar ediyor; sayfa analiz + öneri + listeler + sonra izleyeceklerim karışımıyla çok uzun.
11. 🟡 **"Temalar taranıyor · N film kaldı" kartı her yerde.** Film işi olduğu halde Müzik, Kitap ve Web modunda da sağ üstte duruyor; bildirim panelinin sekmesini ("Takip ettikleri…") ve film sayfasındaki "Resimleri aç" düğmesini kapatıyor.
12. 🟡 **Klasörler sayfasında erişilemeyen klasör belli değil.** H:\filmler kartı "…" gösteriyor, uyarı/renk yok; üstteki "1 erişilemeyen klasör" uyarısıyla bağlantı kurulmuyor. Ayrıca "E:\aaqq" adlı bir test klasörü film klasörü olarak ekli duruyor (kullanıcı kontrol etmeli).
13. 🟡 **İndirmeler: bitmiş indirmede eylem yok.** Resident Evil "Tamamlandı" ama "Oynat" ya da "Klasörde göster" yok, sadece ×. × silme mi listeden kaldırma mı belli değil.
14. 🟠 **Genel aramada aynı film üç kez.** "matrix": Matrix (1999) TMDB, Matrix (1999) Kütüphanede, The Matrix (Önerilerinde) ayrı satırlar. Kütüphanedeki kayıt TMDB kaydının altında. Aynı yapım tek satırda birleşmeli, kütüphane önce gelmeli.
15. 🟡 **Arama açılır listesinin üstünden indirme çubuğu geçiyor.** İndirmeler sayfasında arama yapınca yeşil ilerleme çubuğu açılır listenin içinden çizgi olarak görünüyor (katman sırası hatası).
16. 🟠 **Bildirim metinleri İngilizce.** "Çeviri durdu: The AI answer's JSON could…" — model hata mesajı çevrilmeden gösteriliyor. Altyazı bildirimlerinde kapak resmi yok (boş kare), çeviri bildirimlerinde var.
17. 🟠 **Ayarlar "Luna güncel" diyor ama kontrol hata veriyor.** "Son bakış 28.10.2026" (iki hafta önce); debug kaydında `update_check ✕ 404 Not Found`. Kullanıcıya hata gösterilmiyor, yanlışlıkla güncel sanıyor.
18. 🟡 **Ayarlar penceresi büyük ekranda küçük.** 2048 genişlikte ~770 px'lik pencere; içerik sıkışık, uzun bölümler çok kaydırma istiyor.
19. 🟡 **Müzik "En çok dinlediklerin"de aynı şarkı iki kez.** "System Of A Down – Aerials" iki kart, "Nascent" iki kart (farklı kapaklarla). Ayrıca 12. kart ikinci satıra tek başına düşüyor.
20. 🟠 **Kitap: "Okumaya devam et" kitabının kapağı boş ve Kitaplığım'da yok.** "Turkish fairy tales…" hero'da duruyor ama Kitaplığım'da sadece Dracula ve Crime and Punishment var.
21. 🟡 **Web "Önceki oturumu kurtar" penceresi düzensiz.** Onay kutusu yazının ortasında üstte, satırla hizalı değil.
22. 🟡 **Web ana sayfasında boş gri kutu.** Sık uğradıkların kartlarının üstünde içi boş bir kutu (boş tooltip) duruyor.
23. 🟡 **Web ana sayfasındaki "Luna Asistan" kartı** açık sayfa yokken "Bu sayfayı özetle / Türkçeye çevir" öneriyor; tıklanınca anlamsız.
24. 🟠 **Web modundan çıkış gizli.** Web'e geçince Film/Müzik/Kitap düğmeleri kayboluyor; ancak sol üstteki Luna logosuna tıklayınca açılıyor. İlk kez kullanan kişi geri dönemez.
25. 🟠 **Film sayfasında "Dosya bulunamadı" ama "Oynat" çalışıyor.** Matrix Reloaded'ın bir kopyası H:'de (erişilemiyor), diğeri F:'de. Sayfa büyük "Dosya bulunamadı" kutusu gösteriyor; oysa film oynuyor. Uyarı hangi kopya için olduğunu söylemeli.
26. 🔴 **Oynatıcı ses/altyazı paneli sağdan taşıyor.** "Görünüm" sütununda Konum'un ↑ düğmesi, yazı tipi kutusunun sağı ve alttaki "Kalın" anahtarı pencere dışında kalıyor (kullanıcının daha önceki ekran görüntüsünde de aynı).
27. 🟠 **Luna penceresi kendiliğinden odağı kaybediyor.** Gezerken birkaç kez Luna arkaya düştü, masaüstü öne geldi (her seferinde yeniden öne almak gerekti). Tam ekrandayken başka pencere odağı alıyor olabilir.
2. 🟡 **Pencere başlığına çift tıklamak tam ekrana geçiriyor.** Windows'ta çift tıklama "büyüt" anlamına gelir; Luna doğrudan tam ekran (F11) yapıyor. Beklenmedik.

## Sınırlar

- Exe 3.5.1CC; kaynaktaki 3.5.3CC düzeltmeleri (dublaj hafızası, 2× ortalama, puan balonu, film adı bağlantıları) bu exe'de yok, yeni derlemede tekrar bakılmalı.
- Gezilen yerler: açılış, Ana sayfa, Keşfet, Filmler, film sayfası ve üç nokta menüsü, Diziler, Öneriler, Klasörler, İndirmeler, genel arama, bildirimler, Ayarlar (Genel, Hesaplar), Müzik ana sayfası, Kitap ana sayfası, Web ana sayfası, oynatıcı ve ses/altyazı paneli.
- Girilmeyenler: asistan sohbeti, Koleksiyonlar, Bağlantı, Bu akşam ne izlesem, Luna Analiz, kitap okuyucu, müzik çalar, torrent başlatma, altyazı stüdyosu. Bir şey silinmedi, hiçbir ayar kaydedilmedi.
- Kişisel veri, şifre ya da anahtar bu nota yazılmadı.
