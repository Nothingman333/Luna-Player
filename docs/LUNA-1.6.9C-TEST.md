# 1.6.9C yerel doğrulama kaydı — 2026-10-23

Kaynak: mevcut 1.6.8C yerel çalışma kopyasından hazırlanan 1.6.9C. GitHub CI çalışması değildir. Installer üretilmedi.

| Kontrol | Sonuç / kapsam |
|---|---|
| `npm run build` | TypeScript + Vite geçti; ana JS yaklaşık 380.6 KB / gzip 123.4 KB. |
| `npx tsc --noEmit` | Geçti. |
| `npm run lint` | Geçti. |
| `node scripts/i18n-check.cjs` | Tüm `tt` metinlerinin İngilizcesi var. |
| `npm test` | 41 regresyon komutu geçti; son grupta 5 yeni entegrasyon/model kontrolü. |
| `node scripts/release-version.cjs 1.6.9 --check` | Sürüm dosyaları uyumlu; etiket 1.6.9C. |
| `cargo check --locked --offline --tests` | Ayrı CARGO_TARGET_DIR ile Windows Rust kaynak/test derleme kontrolü geçti. Eski browser/upscaler dead-code/unsafe uyarıları var. Tam uygulama Rust testleri çalıştırılmış sayılmaz. |
| İzole native harness | Üretim kodlarından alınan yardımcılar/komutlar: 12 geçti. SQL geçişi, FTS/damga/Türkçe substring, alass kaydırması, NFO, gerçek adblock motoru, mpv policy, Chromaprint tekrar/sessizlik, native rename planı + NFO/altyazı/undo. |
| Gerçek paketli mpv | Fixture metadata'sında aynı işçi PID'si ve dosya kilidinin bırakılması doğrulandı. Gerçek kullanıcı filmi açılmadı. |
| Headless Edge / sahte Tauri | Music/Books/Mine/Chat ekranları açıldı; ilk yüklemede `*UI.tsx` modülleri yüklenmedi. Canlı Luna penceresi değildir. |
| Foliate fixture | Önceki epub.js CFI, highlight, reload olmadan flow, script engelleme, klavye, arama ve TTS range geçti. Kullanıcının kitabı kullanılmadı. |

Hazırlık çalışma klasörü: `~\Documents\Luna-Uygulama-1.6.9C`. Ayrıntılı yerel loglar burada: `build.log`, `regression.log`, `cargo-check.log`, `lint.log`, `native-tests.log`, `reader-qa-result.json`, `views-qa-result.json`. Bu harness ve QA sayfaları ana kaynak deposuna aktarılmaz.

Rustfmt mevcut toolchain'de kurulu değildi; format kontrolünün geçtiği iddia edilmez. Kodun normal derleme ve lint kontrolleri ayrıdır.

Henüz canlı doğrulanmayanlar: kullanıcının mevcut verisinin SQL geçişi, Windows SMTC etkileşimi, duyulabilir gapless, gerçek OCR/Whisper modeli, Anki koleksiyonuna kart, WebView2 liste ağ davranışı, Syncplay ikinci istemci, gerçek medya sunucuları ve MCP sunucusu, AcoustID/SongRec/Demucs, gerçek libmpv DLL/video. SignPath kabulü veya mağaza manifesti yayını yapılmadı. Ayrıntılı özellik sınırları `LUNA-1.6.9C-UPGRADE.md` içindedir.
