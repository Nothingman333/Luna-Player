# Luna Player

Filmlerini ve dizilerini tek yerde toplayan, zevkini öğrenen ve izlerken sana eşlik eden modern bir video oynatıcı.
Video motoru [mpv](https://mpv.io), arayüz Tauri + React.

## Kurulum (Windows 10 / 11, 64 bit)

1. [Releases](../../releases) sayfasından `Luna Player_x.y.z_x64-setup.exe` dosyasını indir.
2. Çalıştır. Yönetici izni istemez; Luna yalnızca senin kullanıcı hesabına kurulur.
3. Windows SmartScreen "Windows bilgisayarınızı korudu" derse **Ek bilgi › Yine de çalıştır**'a bas
   (uygulama imzasız olduğu için bu uyarı çıkar).

İlk açılışta kısa bir tanıtım seni karşılar. Daha sonra **Ayarlar › Tanıtımı göster** ile tekrar açabilirsin.

## Anahtarlar (isteğe bağlı, ücretsiz)

Oynatıcı anahtarsız da çalışır. Aşağıdakileri **Ayarlar**'a girince ilgili özellikler açılır:

| Anahtar | Ne açar | Nereden alınır |
|---|---|---|
| TMDB | Afiş, özet, oyuncular, fragman, öneriler | https://www.themoviedb.org/settings/api |
| Gemini | Film asistanı, yabancı özetlerin Türkçeye çevrilmesi | https://aistudio.google.com/apikey |
| OpenSubtitles | Altyazı arama | https://www.opensubtitles.com/consumers |

Anahtarlar yalnızca senin bilgisayarında saklanır.

## Özellikler

- **Kütüphane:** Klasör ekle; dosya adlarından film ve diziler tanınır, afiş, özet, oyuncular ve fragman gelir. Diziler bölüm bölüm gruplanır, kaldığın yer hatırlanır.
- **Oynatıcı:** mpv sayesinde neredeyse her format. Altyazı yoksa otomatik aranır; altyazı zaman çizelgesiyle kayma düzeltilir.
- **Bağlantı ve torrent:** Magnet, `.torrent`, http / m3u8 / rtsp bağlantıları doğrudan açılır; torrentler inerken izlenebilir.
- **Öneriler:** Beğen / beğenme ve 10 üzerinden puan; arkadaşlarının Letterboxd profillerini ekleyip listelerine göz at.
- **İçerik uyarıları:** Rahatsız edici içerikli filmlerin afişi bulanıklaşır ve işaretlenir.
- **Asistan:** "Bu akşam ne izlesem?", "Dune'da kimler oynuyor?" gibi sorulara film sayfaları, sahneler ve oyuncularla cevap verir.

## Kısayollar

| Tuş | İşlev |
|---|---|
| Boşluk / K | Oynat / duraklat |
| ← / → | 5 sn geri / ileri |
| ↑ / ↓, fare tekerleği | Ses |
| F, çift tık | Tam ekran |
| M | Sessiz |
| S | Altyazı paneli |
| Z / X | Altyazıyı ∓50 ms kaydır (Shift ile 500 ms) |
| Ctrl+N | Bağlantı aç (ya da bağlantıyı pencereye yapıştır) |

## Verilerin nerede?

Ayarlar, kütüphane bilgisi, puanlar ve sohbetler `%LOCALAPPDATA%\com.modernplayer.app` klasöründe tutulur.
Video dosyalarına dokunulmaz; Luna kaldırıldığında bu klasörü silersen her şey sıfırlanır.

## Kaynaktan derleme

Gerekenler: [Node.js](https://nodejs.org) 20+, [Rust](https://rustup.rs) (MSVC), Windows için Visual Studio Build Tools.

1. mpv'yi indir: https://github.com/shinchiro/mpv-winbuild-cmake/releases adresinden `mpv-x86_64-*.7z`
   dosyasını `app/src-tauri/mpv/` klasörüne aç (içinde `mpv.exe`, `mpv.com`, `d3dcompiler_43.dll`, `mpv/fonts.conf` olmalı).
2. Geliştirme modu:
   ```
   cd app
   npm install
   npm run tauri dev
   ```
3. Kurulum dosyası: `npm run tauri build` → `app/src-tauri/target/release/bundle/nsis/`

Teknik notlar: video `--wid` ile pencereye gömülü mpv'de oynar, arayüz şeffaf webview olarak üstünde durur.
mpv JSON IPC (named pipe) ile kontrol edilir (`app/src-tauri/src/mpv.rs`).

## Lisanslar

- Luna Player [GPL-3.0](LICENSE) lisanslıdır.
- Luna ile birlikte dağıtılan mpv, [GPLv2+ / LGPL](https://github.com/mpv-player/mpv/blob/master/Copyright) lisanslıdır.
- Inter yazı tipi SIL Open Font License ile dağıtılır (`app/src-tauri/fonts/Inter-LICENSE.txt`).
- Film verileri [TMDB](https://www.themoviedb.org) API'sinden gelir; Luna TMDB tarafından onaylanmış ya da desteklenmiş değildir.
