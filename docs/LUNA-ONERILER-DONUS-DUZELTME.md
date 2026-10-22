# Öneriler: oynatmadan geri dönüş, incelemeler ve zevk profili

Bu kaynak son Luna-Player-Tam-Paket-Web-Muzik-Duzeltme.zip üzerine geliştirilmiştir. Önceki tüm yenilikler, 50 düzeltme, Debug, Web/müzik yerleşim düzeltmesi ve dokuz Claude skill korunur.

## 1. İzle → geri: aynı film ön izlemesi ve liste konumu

Ön izleme İzle düğmesinde onClose çağrılıyor, App oynatma sırasında shell/RecsPage bileşenlerini kaldırıyordu. Böylece seçili film, arkadaş/listeler sekmesi, genişletilmiş sonuç sayısı ve kaydırma durumu kayboluyordu.

Film modundaki öneriler sayfası oynatma sırasında aynı bileşen olarak tutulur; görünmez ve inert olur. Önerilerden açılan TitleDetail, dosya veya eklenti kaynağıyla oynatmaya geçerken kapatılmaz; oynatma sırasında görünmez ve inert kalır. App oynatmadan çıkınca aynı ön izleme ve sayfa yeniden görünür; scroll konumları ve liste seçimi korunur. İlgili modal, oynatma sürerken asistanın açık film bağlamından çıkarılır. Öneriler dışındaki ön izlemelerde önceki kapatma davranışı korunur.

Ön izlemede fare geri/Alt+sol için luna-back yakalanır: açık galeri varsa önce o, yoksa yalnız ön izleme kapanır. Liste başa alınmaz. Gerçek mpv stop/EOF sonrası dönüş Windows uygulamasında ayrıca kullanıcı tarafından sınanmalıdır.

## 2. İncelemesi yapılmış filmleri hatırlama

AI incelemeleri zaten kalıcı depoya yazılıyor, ancak okuma yalnız mevcut filmKey üzerinden yapılıyordu. Önce TMDB ID ile, sonra yalnız ad/yıl ile açılan aynı film (veya ters yöndeki kimlik zenginleşmesi) eski analizine erişemiyordu.

filmAnalysisStorage mevcut veriyi değiştirmeden önce tam kimlik anahtarını okur. Bulamazsa yalnız aynı tür, ad ve bilinen yayın yılına ait tekil kaydı kullanır. Bilinen farklı TMDB ID'leri, farklı yıllar ve film/dizi birbirine geçirilmez; belirsiz eşleşmede rastgele analiz seçilmez. Bu güvenli ad/yıl geri dönüşü çevrilmiş farklı film adlarını tahmin ederek eşleştirmez. Eski inceleme verileri silinmez veya topluca taşınmaz.

Hem ReviewAiCard hem FilmDecision puanları aynı kayıt okumasını kullanır. Yeni analiz başarıyla kaydedilince film-decision-changed olayı yayınlanır. Öneri kartlarına mevcut temayla Analiz edildi / Analyzed rozeti eklendi; işaret yeniden açılışta kalıcı kayıttan hesaplanır. Kaydetme başarısızlığı hâlâ kullanıcıya gösterilir; kalıcı kayıt yapılmış gibi işaretlenmez. Mevcut bozuk/kaybolmuş bir analiz yeniden oluşturulmuş sayılmaz.

## 3. Zevk profili aç/kapat göstergesi

Küçük üçgen yerine belirgin 30 px çerçeveli, tema vurgu rengini izleyen SVG ok kullanılır; açılınca yön değiştirir. Klavye odağı görünür. Önceden open=false ve page=undefined birleşiminde aria-expanded kaldırılıyordu; artık kapalı durumda açıkça false verilir.

## Doğrulama

Gerçek RecsPage, TitleDetail, ReviewAiCard ve TasteProfile bileşenlerini kullanan izole headless Edge sayfasında altı kontrol geçti: profil oku/durum; ID'siz yeniden açılışta kayıtlı analiz; oynatmayı taklit ederek aynı ön izleme, liste genişletmesi ve iki kaydırma konumunu koruma; ön izlemeden geri; remake/film-dizi/ID ayrımı; sayfa yenilemesinden sonra analiz rozeti. Native köprü ve oynatma taklittir; gerçek App/mpv/Windows uçtan uca testi değildir. Frontend üretim derlemesi, İngilizce metin denetimi ve ilgili 30 regresyon kontrolü başarılı. Rust değiştirilmedi.

Son kaynak ve iki alternatif yama pakettedir. Son Web/müzik paketine yalnız onceki-pakete-ek.patch; temiz GitHub 5673016 tabanına yalnız changes.patch uygulanır. Farklı yerel kaynak dosya bazında birleştirilir. Yamalar üst üste uygulanmaz. Uygulama/byte karşılaştırması/ters uygulama ve ZIP hash denetimi yapılır. Commit/push yok.
