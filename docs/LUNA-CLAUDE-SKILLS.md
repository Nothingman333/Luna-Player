# Luna için Claude beceri paketi — 22 Ekim 2026

Bu teslim önceki tam Luna kaynağını, browser eklenti/indirme geliştirmelerini ve 9 beceriyi içerir. Uygulama kodu bu beceri turunda değiştirilmedi; yalnız Claude yönergeleri, lisans/kaynak kayıtları ve .gitignore'da paylaşılacak beceri klasörü istisnası eklendi.

## Beceri seçimi

| Beceri | Luna'da kullanım | Kaynak |
| --- | --- | --- |
| luna-project-workflow | Kod haritası, küçük kontroller ve kaynak/yama teslimi | Luna'ya özel yazıldı |
| luna-ui-consistency | Temayı, yoğunluğu, baloncuk/overlay ve erişilebilirliği koruyarak arayüz iyileştirme | Luna'ya özel yazıldı |
| luna-tauri-browser | IPC, native pencere, eklenti, indirme ve WebView2 yaşam döngüsü | Luna kodu ve resmi Tauri/Microsoft belgeleriyle yazıldı |
| luna-assistant-library | Asistan, sağlayıcı profili, film/kitap metadata ve koleksiyonlar | Luna'ya özel yazıldı |
| frontend-design | Görsel kalite ve kullanılabilirlik | Anthropic, Luna kapsamına uyarlandı |
| webapp-testing | İzole Playwright arayüz kontrolleri | Anthropic, Windows/mock sınırlarına uyarlandı |
| vercel-react-best-practices | React render, effect ve async performansı | Vercel, Vite/client kapsamına uyarlandı |
| systematic-debugging | Önce tetikleyici/kök neden, sonra hedefli düzeltme | Obra Superpowers, bağımsız kullanıma uyarlandı |
| verification-before-completion | Gerçekte doğrulanan sonuçla raporlama | Obra Superpowers, sınırlı ve ilgili kontrol seçimine uyarlandı |

Kaynaklar sabit commit'lere bağlandı. Her upstream kopyada lisans veya lisans beyanı, UPSTREAM-SKILL.md ve LOCAL-ADAPTATIONS.md var. Tam kaynak/commit listesi LUNA-CLAUDE-SKILL-SOURCES.json'da. Topluluk Tauri skill'inin incelenen kaynakta uygulanabilir lisans kaydı bulunmadığı için metni kopyalanmadı; Luna native rehberi özgün yazıldı. Bu paket upstream yazarlarca onaylanmış bir sürüm değildir.

## Claude Code

Beceriler proje kökünde `.claude/skills/<name>/SKILL.md`, yönlendirici `CLAUDE.md` dosyasındadır. Hedef aynı temeldeyse paketteki yama; hedef ilerlemişse dosya farklarını koruyan birleştirme kullanılabilir. Mevcut CLAUDE.md ve aynı adlı kullanıcı becerilerini ezmeden birleştirin. `.gitignore`, yalnız proje becerilerini paylaşır; `.claude` yerel ayar/oturum dosyaları ve app/.claude gizli kalır.

Yeni bir Claude Code oturumunda ilgili becerileri doğal istekle veya mevcutsa `/luna-project-workflow`, `/luna-tauri-browser` gibi komutlarla kullanabilirsin. Çalıştığın proje kökünü doğru seç. Bir beceriyi içeren ZIP'i sohbete eklemek tek başına o becerinin kurulması değildir.

## Claude web

1. Claude'da Settings → Capabilities altında Code execution and file creation açık olmalı.
2. Customize → Skills → + Create skill → Upload a skill üzerinden `Claude-Web-Skill-Zipleri` klasöründeki **tekil beceri ZIP'lerini** yükle ve ilgili olanları etkinleştir.
3. Tam kaynak paketini kod sohbetine ayrıca yükle. Becerilerin kaynak koduna erişmesi için kod dosyaları da aynı iş akışında erişilebilir olmalı.

Tam proje ZIP'ini tek bir beceri olarak yükleme. Her tekil ZIP bir `<skill-name>/SKILL.md` ve ihtiyaç duyduğu kaynakları içerir. Dört `luna-*` rehberi projeye özeldir; diğerlerini uygun görevlere göre kullan. Tüm beceri gövdelerini her seferinde baştan okumak gerekmez.

Web ortamı Windows native araçlarını otomatik sağlamaz. Python/Node Playwright veya Rust araçlarının kurulmuş olması ayrı bir konudur. İzole arayüz testleri native eklenti/DRM/video uyumluluğunu kanıtlamaz. Gerçek Windows Luna penceresini kullanıcının denemesi tercihi korunur. Hook, otomatik global kurulum, telemetri, API anahtarı veya otomatik push yoktur.

## Claude'a verilecek kısa mesaj

> Bu Luna Player tam kaynak paketini incele. Önce CLAUDE.md ve göreve uygun `.claude/skills` yönergelerini oku; mevcut tema ve kullanıcı verilerini koru. İstekle ilgili geliştirmeleri yap, şüpheli bug'ları kanıtla ve kök nedenlerini düzelt. İlgisiz büyük refaktör veya bütün test matrisini başlatma; değişikliğe uygun kısa kontrolleri tamamla. Mock test, derleme ve canlı Windows testi sonuçlarını ayır. İstediğimde tam kaynak, uygulanabilir Git yaması ve değişiklik raporu ver. Commit/push yetkisini bu sohbetten esas al.

## Yapılan beceri kontrolleri

Aktif SKILL.md ön bilgileri ve klasör adları, iç referanslar, lisans/kaynak dosyaları ve tekil ZIP yapıları kontrol edilir. Paket kaynak hash'leri ve Git yaması ayrıca doğrulanır. Bu yapısal kontroller, Claude'un her görevde doğru karar vereceğini veya becerilerin bir modelde karşılaştırmalı olarak daha iyi sonuç verdiğini göstermez. İndirilen upstream yardımcı betikler bu hazırlık sırasında çalıştırılmadı.

## Resmi kaynaklar

- https://code.claude.com/docs/en/skills
- https://support.claude.com/en/articles/12512180-use-skills-in-claude
- https://github.com/anthropics/skills
- https://github.com/vercel-labs/agent-skills
- https://github.com/obra/superpowers
- https://v2.tauri.app/security/capabilities/
- https://v2.tauri.app/develop/calling-rust/
