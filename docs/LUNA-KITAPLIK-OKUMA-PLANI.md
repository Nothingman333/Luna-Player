# Kitaplık ve okuma planı — ek geliştirme turu

Bu tur yalnız kitaplık, kitap verisi ve ilgili testleri değiştirir. Claude’a ayrılan Browser.tsx, Screens.tsx, Taste.tsx ve ai.ts bu turda değiştirilmedi.

## Eklenenler

- EPUB, PDF ve CBZ biçim filtresi.
- Kapaklı/kapaksız kitap filtresi; diğer filtrelerle birlikte uygulanır.
- Başlık, yazar ve konu rafıyla birleşen filtrelerde görünen/toplam kitap sayısı.
- En çok ilerlenmiş kitapları öne alan sıralama.
- Okunacaklar için kayıtlı öncelik sırasına göre görünüm.
- Plan sırasında kitapları önceye/sonraya taşıyan klavye ile erişilebilir oklar.
- Filtre yüzünden görünmeyen ve şu an erişilemeyen kitapları plandan silmeden sıralama.
- Biçim, kapak, konu ve sıralamayı sayfaya geri dönüldüğünde koruma.
- Tek düğmeyle görünümü varsayılana alma; genel arama alanını değiştirmez.
- Kitap moduyla uyumlu, dar pencerede satıra sığan kompakt filtre şeridi.
- Görünüm kaydedilemezse oturumda kullanmaya devam edip hata gösterme.

## Düzeltilenler

- Sayısal olmayan veya aralık dışı okuma yüzdesi artık okuyucuya ve kartlara doğrudan aktarılmaz. Geçersiz konum/tarih alanları güvenli varsayılan alır. Ham kayıt yalnız okumakla değiştirilmez.
- Desteklenmeyen kayıtlı raf ve sıralama değerleri boş bir görünüm yerine varsayılana döner.
- Mevcut olmayan bir rafı kitaptan kaldırmak artık o rafı oluşturmaz.
- `constructor` gibi adlar konu sayacında prototip alanıyla karışmaz; aynı kitap ve aynı raf iki kez sayılmaz.
- Prototip benzeri kitap yolları raf ekleme işlemini bozamaz.
- Bozuk Okunacaklar kaydında sıralama durur; ham kayıt korunur ve hata gösterilir.
- Son açılan kitapların geçmişi beklenmedik dizi/nesne biçimlerinde doğrudan `.filter()` veya atama hatası üretmez.
- Eşit sıralama önceliğinde başlıkla kararlı bir ikincil sıralama uygulanır.

## Doğrulama

Yeni 12 kısa davranış testi; mevcut test grupları, çeviri denetimi ve TypeScript/üretim derlemesi. Ayrıca gerçek BooksPage bileşenlerinde izole headless Edge ile dört akış: filtre kalıcılığı, ilerleme sırası, plan kaydı/anlık güncelleme, 480 piksel genişlik. Bunlar sahte tarama verileri kullanır; kullanıcının kitaplığına veya gerçek Windows penceresine dokunulmadı.

Dosyalar: bookLibraryModel.ts, BookData.ts, Books.tsx, BookMusic.css; test: `npm run test:book-library-view --prefix app`.

Commit/push yapılmadı. Tam kaynak paketi önceki Browser, asistan, film, okuma ve müzik çalışmalarını da içerir. Claude için ek yama, üç ilk Claude paketinin ortak başlangıcına göre birikimlidir; tam güncel kaynak üzerine tekrar uygulanmaz.
