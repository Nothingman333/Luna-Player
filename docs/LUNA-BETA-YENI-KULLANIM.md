# Luna beta — sekme grupları, sohbet dizini ve güvenli taslaklar

23 Ekim 2026. Önceki **Luna-1.6.7-Beta-GitHub-Paketi** tam kaynağının devamıdır. Taban v1.6.7 / `3c4ae8f55ae792e9abe43fb9c3cf67c506b61bd6`; bu turda GitHub'a erişilemediğinden yeni bir uzak sürüm alındığı iddia edilmiyor. Önceki birleşik kaynak ve bütün yenilikler korunur. Sürüm, updater kimliği, kilit dosyaları ve bağımlılıklar değiştirilmedi. Commit/push yapılmadı.

## Tarayıcı: birden fazla sekme grubu

Araçlar → Sekmeler ve favoriler içinde, tek kayıtlı grubun yerini adlandırılmış gruplar alıyor. Film gecesi, araştırma veya sonra okunacaklar gibi farklı kümeler saklanabilir.

- Açık sekmelerden yeni grup oluşturma; mevcut grubu adlandırma, açık sekmelerle güncelleme ve silme. Değiştirme ve silme onay ister; açık siteler kapanmaz.
- En fazla 12 grup, grupta 8 sekme. Grup düğmelerinde sekme sayısı; seçili grupta zaten açık olanlar ve kalan sekme kapasitesi görünür.
- Grup içinde başlık/adres arama; tek sayfa açma veya yalnız eksik sekmeleri açma. Kapasite dolarsa kalanlar silinmez. İşlem bitince açılan/açılmayan sayısı gösterilir. “Kalanları durdur”, sıradaki açılışları durdurur; başlamış native işlemin iptal edildiği iddia edilmez.
- JSON dışa aktarma ve 128 KB sınırıyla içe aktarma. Aynı adlı gruplar sayfalarını birleştirir; kapasite aşılırsa bütün işlem reddedilir, kısmi kırpma yapılmaz. Kimlik çakışması çözülür; ayrı gruplar birbirinin üzerine yazılmaz.
- Önceki `lunaWebSavedTabs` kaydı ilk grup olarak görünür; özgün kayıt silinmez. Yeni kayıt ancak kullanıcının başarılı kaydetme işlemiyle oluşur. Boş eski grup boş bir kart üretmez.
- Hasarlı kayıt üzerine boş liste yazılmaz. İçe aktarma adresleri, kimlikleri, adları, boyutları ve sınırları doğrular. Ayrı pencerede değiştirilmiş grup kaydının üzerine yazılmadan işlem durur.
- Yerel tarayıcı izinleri ve sekiz açık sekme sınırı korunur; yeni IPC/Rust komutu yoktur.

İlgili dosyalar: `BrowserTabGroups.tsx`, `BrowserTabGroups.css`, `webTabGroupsModel.ts`, `BrowserWorkspace.tsx`.

## Asistan: uzun sohbetler için dizin

Sohbet araçlarının altında açılır **Sohbet dizini** bulunur. Görüşmeyi değiştirmez ve bir AI isteği başlatmaz.

- Sorular: konuşmanın sorularını listeler; tıklayınca özgün mesaja gider.
- Sabitli yanıtlar: yanıtı, ona ait soruyla birlikte gösterir; mevcut Sabitle işleviyle birlikte çalışır.
- Kaynaklar: cevaplardaki gerçek kayıtlı kaynakları tekilleştirir. Dış tarayıcıda açma ve kaynağın geçtiği mesaja gitme ayrı işlemlerdir. Uygunsuz şemalar, kimlik bilgisi taşıyan adresler ve bozuk kaynaklar gösterilmez.
- Dizin içi arama Türkçe karakterleri/aksanları tolere eder. Sorguya göre ilk 100 sonuç çizilir; daha fazlası varsa aramayla daraltma açıklaması vardır.
- Dizin alanı sınırlı yükseklikte kayar. Yazarken aynı mesaj listesi için indeks tekrar hesaplanmaz. Sabitleme, kopyalama, dışa aktarma ve var olan sohbet araması korunur.
- “Büyük çalışma alanı” ipucu sürekli araçların üstünde durmaz; yalnız fareyle üzerine gelince veya klavye odağında görünür. Asistan varsayılan olarak sayfa üstündeki normal küçük kutu olarak kalır.

İlgili dosyalar: `AssistantTools.tsx`, `AssistantTools.css`, `assistantPresentation.ts`, `Taste.tsx`, `App.css`.

## Film incelemesi: not kaybetmemek

Film/dizi ayrıntısındaki **İzledikten sonra** bölümünde, yazılan not, gerekçe seçimleri ve yorum taslağı için ayrı yerel kurtarma kaydı var.

- Yazma durulduktan sonra 450 ms içinde kurtarma kopyası alınır. Panelden ayrılırken veya sayfa kapanırken son metin de saklanmaya çalışılır. Ani işletim sistemi/elektrik kesintisinde henüz çalışmamış JS için garanti verilmez.
- Film tekrar açılınca yarım kalmış taslak belirtilir. Kullanıcı geri getirene veya silene kadar eski kayıtlı not düzenleyicisi kilitli kalır; yanlışlıkla kurtarma kopyasının üstüne yazılmaz.
- “Bütün notlarımı kaydet” hem notu, gerekçeleri hem yorum taslağını kaydeder; beğendim/beğenmedim kararını değiştirmez. Eski ayrı kaydetme düğmeleri de çalışır.
- Kaydedilmemiş değişiklik ve yerel kurtarma durumu görünür. Kaydetme sonrası eşit kurtarma kopyası kaldırılır. Başarısız kaydetmede metin düzenleyicide kalır.
- Bozuk kurtarma kaydı korunur; başka pencerede değişen taslağın üzerine otomatik yazılmaz. Bu sırada kullanıcıya metnini kaydetmesi/kopyalaması söylenir.
- Kurtarma kopyası Letterboxd'a, izleme günlüğüne veya AI sağlayıcısına gönderilmez. Kullanıcının tam Luna yedeği yerel verileri zaten kapsar.

İlgili dosyalar: `FilmDecision.tsx`, `FilmDecision.css`, `useFilmDraft.ts`, `filmDraftModel.ts`.

## Asistan komutlarını düzenleme ve gerçek hata düzeltmeleri

Ayarlar'daki **Kendi asistan komutların** listesinde Düzenle düğmesi var. Metin ve ad düzenleyiciye gelir, odak görünür alana taşınır. Vazgeç kayıtlı komutu değiştirmez. Alanlar mevcut 24/2000 karakter sınırlarını gösterilen akışta uygular; dar pencerede satır düğmeleri sarılır.

Kaynakta doğrulanan ve düzeltilen davranışlar:

1. Asistan komutunda depolama yazısı başarısızken başarılı mesajı üretiliyordu. Artık kaydetme ve silme hatası açıkça bildirilir; ayarlarda yazılan metin korunur.
2. 41. komut, temizleyicinin son 40 kaydı alması yüzünden en eski komutu sessizce düşürüyordu. Yeni ekleme reddedilir; var olan komut aynı sınır içinde güncellenebilir.
3. Hasarlı `userCommands` kaydı temizlenmiş boş liste üzerinden kaydedilince özgün kayıt kaybolabiliyordu. Hasarlı kayıt üzerine yazma engellenir.
4. Sekme yöneticisindeki sol/sağ taşıma, şeritteki taşımanın kullandığı sabitlenmiş sekme sınırını uygulamıyordu. Artık aynı `stepTab` sınırı kullanılır; sabitli sekmelerle normal sekmeler yer değiştiremez.
5. Asistanın sürekli görünen büyütme ipucu sohbet araçlarını örtüyordu. İpucu yalnız ilgili düğmenin hover/klavye odağında görünür.

Bu maddeler birbirinden bağımsız 50 veya 100 hata diye sunulmaz. Yeni özelliklerin koruma kontrolleri de ayrı ayrı “bulunmuş uygulama hatası” sayılmaz.

## Görünüm ve doğrulama

Mevcut IBM Plex Sans/Sora, koyu yüzeyler, yuvarlatılmış kontroller ve etkin modun renk değişkenleri kullanılır. Yeni renk sistemi, yazı tipi veya bağımlılık yoktur. Komut listesi, sekme grubu kartları ve sohbet dizini dar pencereye uyarlanmıştır.

- `npm run build` ve i18n denetimi geçti.
- Yeni `test:creative-plus`: 12 anlamlı veri/işlem kontrolü geçti. Grup birleşimi/kota/geçersiz adres, sohbet indeksleri/kaynaklar, kurtarma verisi, sabit sekme sınırı ve komut kaydetme/kota durumları.
- İlgili mevcut `workspace`, `assistant-presentation`, `assistant-safety`, `extras-plus`, `film-browser`, `review-completion`, `delivery` grupları geçti. Önceki turun bütün CI testleri bu tur yeniden çalıştırılmış gibi sayılmadı.
- Gerçek üretim React arayüzüyle TR/EN × 1280/640 px, 850 px yükseklikte: soru/sabit/kaynak araması ve mesaja gitme; film notu yazıp ayrılma/geri gelme/kurtarma/kaydetme; eski grup açma/yeni grup oluşturma/yinelenen adı reddetme; komut düzenleme ve depolama hatasında veri/metni koruma sınandı. Son ekranlar ve JSON sonuçları görsel galeride.
- Rust bu tur değişmedi. Önceki `cargo check --lib --tests --offline` günlüğü tarihsel kanıt olarak korunur; Rust testleri veya MSVC installer bu tur çalıştırıldı diye sunulmaz.
- Görseller ve UI testleri sentetik Tauri/örnek kitaplık verileri kullanır. Gerçek Windows Luna/WebView2, video/DRM, canlı AI/TMDB/Letterboxd ve EPUB/PDF/CBZ okuyucu testi değildir. Site yükleme için UI testinde native köprü taklit edilir; sitede gezinildiği iddia edilmez.

## Teslim ve uygulama

Yeni tam kaynak önceki paketi kapsar; eski yamaları bunun üstüne yeniden uygulamayın. `changes.patch` v1.6.7 tabanından kümülatif farktır. `onceki-pakete-ek.patch` yalnız bir önceki 6,9 MB tam paketin kaynağından bu kaynağa farktır. Bunlar alternatif başlangıçlar içindir; ikisini peş peşe uygulamayın. Tabanınız farklıysa `git apply --check` sonucunu inceleyip birleştirin.

Yamalar ayrı temiz dizinde Git'in gerçek diff çıktısıyla üretildi, ileri/ters uygulanıp içerikleri karşılaştırıldı. ZIP içeriği ve SHA-256 listesi doğrulandı. Yerel EXE'nin değişmesi için yeniden derlemek gerekir.
