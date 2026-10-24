# Nihai birleşik kaynak teslimi — 23 Ekim 2026

> Tarihsel teslim. Güncel birikimli paket ve sonraki tüm değişiklikler için **LUNA-BETA-BIRIKIMLI-NIHAI-TESLIM.md** dosyasını okuyun. Aşağıdaki eski yama/paket adları yeni paketle birlikte tekrar uygulanmaz.

Paket: **Luna-Beta-Nihai-GitHub-Paketi-2026-10-23.zip**. Tam kaynak `Kaynak/Luna-Player` içindedir. Önceki kütüphane/web paketinin bütün kaynakları korunur; son 50 maddelik düzeltme turu, küçük arayüz eklemeleri, testler ve raporlar da bu tam kaynaktadır. Bu bir kaynak/push hazırlık paketidir; kurulum EXE'si değildir. Kurulu Luna otomatik değişmez.

Taban **v1.6.7**, commit `3c4ae8f55ae792e9abe43fb9c3cf67c506b61bd6`. Bu teslim için uzak GitHub'dan yeni sürüm alınmadı. Sürüm, uygulama kimliği, updater ve bağımlılıklar korunur. Kullanıcının deposunda commit/push yapılmadı.

- `changes.patch`: yukarıdaki temiz beta tabanından bütün birleşik değişiklikler.
- `onceki-pakete-ek.patch`: yalnız **Luna-1.6.7-Beta-Kutuphane-Web-Tam-Paket.zip** tam kaynağından bu nihai kaynağa fark. Önceki ZIP SHA-256: `66e496c07e5e6b8487886c2b3d83539f21c60ff770401bd2fe483712957a4ad5`.
- Bunlar alternatif tabanlar içindir. İki yamayı art arda uygulamayın; tam kaynağı aldıktan sonra yamayı yeniden uygulamayın. İlerleyen/kişisel değişiklikleri olan bir depoda önce `git apply --check`, ardından dosya bazında birleştirme gerekir. Körlemesine üstüne yazmayın.
- Yama kontrolü, ileri/ters uygulama ve bütün kaynak karşılaştırması paket içindeki `PATCH-VERIFICATION.json` / `DELTA-VERIFICATION.json` içinde açıklanır. Metinlerde CRLF/LF normalleştirilir, ikili dosyalar birebir karşılaştırılır. Tam kaynak ZIP içeriği ise SHA-256 ile bayt düzeyinde doğrulanır.

İşe `CLAUDE.md` ile başlayın; proje becerileri `.claude/skills` altındadır. Son tur için `docs/LUNA-BETA-50-DAVRANIS-DUZELTMESI.md`, önceki bütünleşme ve kullanım turları için yanındaki `LUNA-BETA-*` raporları okunmalıdır. Kaynak içindeki tarihsel raporlar yeniden uygulanacak yama talimatı değildir.

`app` içinde `npm ci`, `npm run build`, `npm run test:fifty-behavior` ve `node scripts/i18n-check.cjs` çalıştırılabilir. Yerel önizleme: `npm run preview -- --host 127.0.0.1 --port 1454 --strictPort`; native derleme için `BUILDING.md` geçerlidir.

Son geliştirme turunda üretim derlemesi, i18n, 50 model kontrolü ve ilgili mevcut test grupları geçti. Seçili görseller gerçek React bileşenlerinden sentetik IPC/medya verisiyle alındı. Gerçek Windows/Tauri oynatma, DRM ve canlı AI servisleri denenmedi. Önceki Rust günlüğü tarihsel derleme kanıtıdır; bu tur Rust değiştirilmedi. Paket `.git`, `node_modules`, derleme çıktıları, kişisel medya/veritabanları veya API anahtarları içermez.
