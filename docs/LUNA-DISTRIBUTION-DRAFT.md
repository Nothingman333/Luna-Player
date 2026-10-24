# Dağıtım hazırlığı — yerel taslak, başvuru yapılmadı

2026-10-23. GitHub push/yayın Claude tarafından yapılacak. Bu dosya imza alındığı, SignPath başvurusu gönderildiği veya winget/Scoop paketinin yayımlandığı anlamına gelmez.

## SignPath başvuru metni

Project: Luna Player. Repository: https://github.com/Nothingman333/Luna-Player. License: GPL-3.0. Windows desktop application built with Tauri, Rust and React. It plays local/remote media and manages a media/book library. We would like to apply for the SignPath Foundation open-source signing program for our own Windows application and installer. Third-party mpv/yt-dlp binaries retain their upstream identity; they must not be signed as Luna's own binaries.

Başvuru öncesi proje sahibinin dolduracağı bilgiler: iletişim adresi; gerçek author/reviewer/approver hesapları; MFA doğrulaması; doğrulanabilir CI derlemesi ve imza onayı sorumluları; gizlilik politikası bağlantısı. Bu bilgiler uydurulmadı. Mevcut yerel release betiği tek başına SignPath'ın doğrulanabilir CI akışı şartını karşılıyor kabul edilmemeli.

Kabulden sonra yayımlanacak “Code signing policy” sayfasında kapsam, gerçek ekip rolleri, gizlilik ve imza onayı süreci yer almalı. Başvuru kabul edilmeden ücretsiz imza sağlandığı iddiası README'ye eklenmemeli. Ağ davranışı için gerçeğe aykırı “hiçbir veri göndermez” ifadesi kullanılmamalı: çevrimiçi metadata, reklam listesi güncelleme, kullanıcı etkinleştirdiği AI/scrobble ve medya sunucuları açıklanmalı.

Kaynaklar: [program](https://signpath.org/), [şartlar](https://signpath.org/terms.html). SignPath hesap/organizasyon kimliği ve token verilmediğinden canlı iş akışı veya dış başvuru oluşturulmadı. Updater imzası ile Windows Authenticode imzası ayrı mekanizmalardır.

## winget ve Scoop

`node scripts/distribution-manifests.cjs VERSION PUBLISHER SETUP ZIP SETUP_URL ZIP_URL NEW_OUTPUT_FOLDER` mevcut installer ve portable dosyalarının SHA-256 değerleriyle yerel manifest taslaklarını üretir. Program yayın yapmaz, installer çalıştırmaz, mevcut klasörün üstüne yazmaz. Gerçek yayın varlıkları olmadan sahte checksum üretmez.

Yayın sorumlusu doğru Publisher ve gerçek asset URL'lerini vermeli. `winget validate` ile şema, temiz Windows'ta kurulum/kaldırma ve Scoop kısayolu doğrulanmalı. Mevcut portable paket bir “taşınabilir uygulama dosyaları” arşividir; kullanıcı verisini aynı klasörde tutan yeni bir depolama modu eklenmemiştir. Beta için stable otomatik güncelleme kaynağı tanımlanmadı; 1.3.9 Latest kuralı korunur.

Kaynaklar: [winget manifest](https://learn.microsoft.com/en-us/windows/package-manager/package/manifest), [Scoop manifest](https://github.com/ScoopInstaller/Scoop/wiki/App-Manifests).
