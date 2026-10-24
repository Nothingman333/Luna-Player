# Luna beta — ayrıntılı kullanım iyileştirmeleri

23 Ekim 2026. Mevcut birleşik beta kaynağının devamıdır; önceki nihai yama, performans, görsel ve hata düzeltmeleri korunur. Taban v1.6.7, `3c4ae8f55ae792e9abe43fb9c3cf67c506b61bd6`. Bu tur uzak depo yeniden güncellenmedi. Yeni ZIP, commit veya push yapılmadı. Önceden verilen ZIP bu devamı içermez.

## Film karşılaştırması

- Seçilen eserlerde en kısa/en uzun süre ve aradaki fark gösterilir. Süresi bilinmeyen kayıt sıfır dakika sayılmaz; yalnız bilinen sürelerden hesap yapıldığı belirtilir.
- Ortak türler ayrı, kısa bir özet alanında gösterilir. Büyük/küçük harf ve aksan farkları karşılaştırmayı bozmaz; aynı tür tekrarlanmaz.
- Karşılaştırma düz metin olarak kopyalanabilir. Konu özetleri, ekrandaki açık seçenek işaretlenmedikçe panoya da eklenmez. Topluluk puanı kişisel uygunluk puanından ayrılır.
- Kartlar karşılaştırma penceresi içinden kaldırılabilir. İkiden az eser kalınca yönlendirme çıkar ve kopyalama kapanır.
- Özel bir HTTP(S) kapak adresinin önüne TMDB adresi eklenmesi giderildi. Geçersiz/kimlik bilgisi içeren adres yüklenmez; kapak yüklenmezse mevcut yer tutucu kullanılır.
- Boş üyeli ya da artık kütüphanede olmayan karşılaştırma grubu, temsilci esere erişmeye çalışmaz. Bozuk konu verisi kopyalamayı çökertmez.
- Özet, eylemler ve kartlar Luna'nın mevcut yüzey, kenarlık, yazı ve odak stillerini kullanır. Dar pencerede kartlar sarılır; pencerenin içeriği dikey kaydırılabilir.

Kaynak: `LibraryCompare.tsx`, `libraryComparisonModel.ts`, `LibraryWorkbench.css`.

## Asistanın kaynaklarını kullanma

- Sohbet dizininin Kaynaklar bölümünde site filtresi eklendi. Metin araması ile birlikte çalışır.
- Eşleşen/toplam kaynak sayısı ve tek düğmeyle arama/site filtresini temizleme bulunur.
- Eşleşen kaynakların başlık ve bağlantıları kopyalanabilir. Bu işlem yalnız ekranda ilk yüklenen 100 satırla sınırlı değildir; eşleşen listenin tamamını kullanır.
- Bir kaynakta hangi siteden geldiği gösterilir; kaynağın geçtiği özgün mesaja atlama korunur.
- Sohbet değişince artık bulunmayan site filtresi sıfırlanır. Kopyalama sırasında yinelenen işlem engellenir; sonuç/hata bildirilir.
- Kaynak dışa aktarımında HTTP(S) adres denetimi ve kimlik bilgili URL reddi korunur. Yeni model isteği veya geçmişi AI'a gönderme eklenmedi.

Kaynak: `AssistantTools.tsx`, `AssistantTools.css`, `assistantPresentation.ts`.

## Web defteri ve okuma kuyruğu

- Okuma kuyruğuna “Yalnız notu olan sayfalar” filtresi eklendi. Metin, okundu/devam ediyor durumu ve sıralamayla birlikte çalışır.
- Bütün sayfa notlarından, henüz kuyrukta olmayan bir sayfa doğrudan okuma kuyruğuna alınabilir.
- Sayfanın notu ayrı kayıtta korunur. Zaten kuyrukta olan sayfanın daha yeni ilerleme oranı veya okundu durumu sıfırlanmaz.
- Mevcut 300 kayıt sınırı, hasarlı kayıt koruması ve kayıt hatası bildirimi geçerlidir. Kuyruk doluyken başka sayfa sessizce çıkarılmaz.

Kaynak: `WebNotebook.tsx`, `WebNotebook.css`, `webNotebookModel.ts`.

## Geçmişte daha açık silme davranışı

- “Son 1 saati sil” ve “Bugünü sil” artık doğrudan silmek yerine satır içi onay açar. Etkilenecek kayıt sayısı görünür.
- Zaman aralığı işlemlerinin bütün siteleri kapsadığı açıkça belirtilir; site/metin filtresi var diye yalnız görünen satırların silineceği izlenimi verilmez.
- Başlangıç zamanı onay açılırken sabitlenir. Beklerken saat ilerlese de onaylanan aralık kaymaz. “Bugün” yerel gece yarısını kullanır.
- Site silme sayısı da arama sonucundan değil, o sitenin bütün kayıtlarından hesaplanır. Vazgeç hiçbir kayıt silmez.
- Dönem, site, arama ve sıralama tek düğmeyle sıfırlanabilir; odak arama alanına döner.

Kaynak: `BrowserHistory.tsx`, `historyDeleteModel.ts`. Mevcut arka uç silme çağrıları korunur; bu tur yeni native komut eklenmedi.

## Doğrulama

- `test:detail-polish`: 13/13 yeni davranış kontrolü. Süre hesabı, özetlerin açık tercih gerektirmesi, kapak adresi, güvenli kaynaklar, not/kuyruk koruması ve silme sınırları kapsanır. Aynı grupta bozuk konu verisi de kontrol edilir.
- İlgili mevcut kontroller: `test:library-workbench` 9/9, `test:web-notebook` 13/13, `test:round-50` 20/20, `test:assistant-presentation` 6/6, `test:incoming-final` 6/6. Yeni grupla toplam 67 başarılı kontrol.
- `tsc && vite build` ve `i18n-check.cjs` geçti. Önceden mevcut büyük chunk/dinamik import uyarıları sürer; bunlar derleme hatası değildir.
- Başsız Edge'de 1280 px Türkçe ve 640 px İngilizce: dört bileşenin önce/sonra durumları, toplam 16 kontrol kaydı. Kopyalama, kaynak filtreleme ve özgün mesaja gitme, notu kuyruğa alma, ilerlemenin korunması, silmeyi iptal/onay ve filtre sıfırlama etkileşimleri ayrıca denetlendi.
- Fontlar beklenerek ekran görüntüleri alındı ve incelendi; yatay taşma ve konsol hatası yok. 16 kayıt 16 ayrı hata anlamına gelmez. Geçmiş aramasındaki ertelenmiş React güncellemesini beklemeyen ilk test kontrolü düzeltildi; bu ürün hatası olarak sayılmadı.

Bu kontrol **sentetik kitaplık ve taklit Tauri köprüsü** kullanır. Gerçek Windows Luna penceresi, yerel WebView2 katman bileşimi, gerçek AI sağlayıcısı veya medya oynatma testi değildir. Bu tur bütün uygulamanın sayfa sayfa yeniden denetlendiği ya da bütün hataların giderildiği iddia edilmez. Rust değişikliği yapılmadı.

Kanıt: `evidence/detail-polish/results.json`, `check.cjs`, `visual.log`, `build-final.log` ve aynı veri/pencereyle alınan PNG'ler. Testin `serve.mjs` dosyası geçici öncesi kaynak dizinine başvurur; taşınabilir üretim sunucusu değildir.

### Görsel örnekler — 1280 px

| Akış | Önce | Sonra |
| --- | --- | --- |
| Film karşılaştırması | [Önce](evidence/detail-polish/before-1280-compare.png) | [Sonra](evidence/detail-polish/after-1280-compare.png) |
| Asistan kaynak dizini | [Önce](evidence/detail-polish/before-1280-assistant.png) | [Sonra](evidence/detail-polish/after-1280-assistant.png) |
| Web defteri | [Önce](evidence/detail-polish/before-1280-notebook.png) | [Sonra](evidence/detail-polish/after-1280-notebook.png) |
| Geçmiş | [Önce](evidence/detail-polish/before-1280-history.png) | [Onay açık](evidence/detail-polish/after-1280-history-confirmation.png) |

### Dar pencere — 640 px

| Karşılaştırma | Kaynak filtresi | Notlu sayfalar | Geçmiş onayı |
| --- | --- | --- | --- |
| [Görsel](evidence/detail-polish/after-640-compare.png) | [Görsel](evidence/detail-polish/after-640-assistant-filtered.png) | [Görsel](evidence/detail-polish/after-640-notebook-noted.png) | [Görsel](evidence/detail-polish/after-640-history-confirmation.png) |
