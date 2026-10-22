# files (17).zip — ARA-03 ek birleşimi

Arşiv nihai teslim değildir. İçindeki ARA-03, ARA-02 yerine geçer. İki kümülatif yama aynı 248 dosyalık kaynağa ayrı ayrı uygulanıp birbirleriyle karşılaştırıldı. Bu sayede önceki turda alınmış 5 farklı teslim tekrar uygulanmadan yalnız 7 dosyalık yeni Browser farkı taşındı.

Eklenenler:
- Geri/ileri düğmeleri her sekmenin gerçek native geçmiş durumunu izler.
- Yüklenirken Yenile yerine Durdur görünür; native stop çağrılır. Durdurulmuş yükleme sıradan hata sayılmaz.
- Eski adrese ait gezinme sonucu mevcut sayfanın yüklenme durumunu değiştirmez.
- Sekmelerde ses rozeti yalnız native ses sinyalinden gösterilir.
- Reddedilen kamera/mikrofon vb. izinler adlandırılır; yeni izin verilmez.
- Araçlarda sayfa yakınlaştırma, uzaklaştırma, yüzde ve sıfırlama; ana Luna arayüzüne odaklı Ctrl + / Ctrl - / Ctrl 0 kısayolları. Gerçek WebView2 odağında kısayol iletimi elle doğrulanmadı.
- Adres çubuğunda IME bileşimi sırasında Escape taslağı bozmaz.
- Popup bildiriminde alan adı, ipucunda tam bağlantı.
- Kapanmış sekmenin gecikmiş zoom komutu artık native durum kaydı oluşturmaz.

Yeni browserNativeModel.ts ve 8 kısa test CI'a dahil edildi. Daha önceki assistant-safety ve claude-integration testleri korundu. Web dışı / komutları filtresinin beklentisi iki bağlam için de kontrol edilir.

Korunanlar: Kitap/Müzik NİHAİ birleşimi, 7 birleşim testi, son kitaplık filtreleri/plan sırası, asistan güvenliği/anahtar maskeleme ve mevcut tema/panel düzeni. Tam ARA-03 kaynağı mevcut projenin üzerine kopyalanmadı.

Doğrulama: 8 yeni saf model testi; tüm kısa test grupları, çeviri ve üretim derleme kontrolleri. Gerçek Browser bileşeninde headless Edge ile 5 akış yerelde yeniden doğrulandı: geçmiş, ses/izin, eski gezinme + durdurma, zoom/sıfırla ve IME. Tauri köprüsü taklittir; gerçek Windows penceresi, WebView2, ses, video, canlı siteler veya gerçek AI sağlayıcısı denenmedi. Teslimin kendi raporundaki 34 kontrolün tarafımızca tekrar çalıştırıldığı iddia edilmez.

Commit/push yapılmadı. Yeni tam GitHub kaynak paketi önceki bütün birleşimleri de içerir.
