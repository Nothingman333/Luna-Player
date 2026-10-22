# Luna Web plus — tasarım ve veri notları

Bu belge "Luna Web plus" turunun neyi nereye koyduğunu ve nasıl sınandığını anlatır. Değişiklik listesi için `CHANGELOG.md`.

## Dosyalar

| Dosya | Görev |
|---|---|
| `src/browserSearchModel.ts` | Arama motorları, `!` kısayolları, adres çözümü (`resolveWebInput`), sonuç sayfasından aranan kelimeler |
| `src/browserHistoryModel.ts` | Yerel geçmiş, frecency, en çok uğranan siteler, öneriler, oturum, selamlama |
| `src/browserReaderModel.ts` | Okuma modu blokları, okuma süresi, "Luna'da oynat" algılama, sade adres |
| `src/browserFindPage.js` | Sayfada bul betiği (Rust `include_str!` ile sayfaya enjekte edilir) |
| `src/BrowserPanels.tsx` | Geçmiş, veri temizleme, bul çubuğu, menü, öneri listesi, okuma modu, kısayol listesi |
| `src/BrowserStart.tsx` | Yeni başlangıç sayfası |
| `src/BrowserPlus.css` | Yukarıdakilerin stilleri (Browser.css ile aynı renk/yazı değişkenleri) |
| `src-tauri/src/browser.rs` | `browser_find`, `mute`/`unmute`/`print` eylemleri, sayfa odaktayken kısayol kancası |

## Saklanan veriler (hepsi yerel `localStorage`)

| Anahtar | İçerik |
|---|---|
| `lunaWebHistory` | En çok 1000 ziyaret `{url,title,at,first,count}`; bozuk satırlar tek tek atılır |
| `lunaWebHistoryPaused` | `"1"` iken ne geçmiş ne oturum yazılır |
| `lunaWebLastSession` | Son açık sekmeler (başlangıç sayfasındaki "kaldığın yerden devam et") |
| `lunaWebHiddenSites` | Başlangıç sayfasında gizlenen site kutucukları |
| `lunaWebSearchEngine` | Seçili arama motoru |
| `lunaWebReader` | Okuma modu ayarları |

Geçmiş hiçbir yapay zekâ isteğine eklenmez (`web-plus-regression` bunu kaynakta denetler). Tek dosyalık yedek bu anahtarları da taşır.

## Güvenlik sınırları

- `browser_find` yalnızca ana arayüzden çağrılır (`trusted`), adresi `checked_url` ile denetler, sorguyu betiğe **JSON dizgesi** olarak verir ve döneni 1000'e kırpar.
- Sayfadan alınan kısayollar: yalnızca `page_shortcut` listesindeki Ctrl/Ctrl+Shift birleşimleri, Alt+Home ve F6. Ctrl+Alt (AltGr) hiçbir zaman alınmaz; Ctrl+C/V/X sayfada kalır.
- Bul betiği sayfanın öğelerini değiştirmez (CSS Custom Highlight); alanlar, script/style/template, `aria-hidden`, gizli ve düzenlenebilir alanlar aranmaz.
- Okuma modu `browser_read` çıktısını kullanır; form değerleri okunmaz (mevcut kural).

## Nasıl sınanır

```powershell
cd app
npm run build ; node scripts/i18n-check.cjs
npm run test:web-plus        # modeller + yerel taraf kaynak denetimleri (CI'da)
npm run test:find-page       # bul betiği gerçek Chromium'da (Playwright gerekir)
npm run test:web-ui          # arayüz uçtan uca, taklit Tauri katmanı (Playwright gerekir)
cd src-tauri ; cargo test --lib
```

`test:web-ui` sekme içeriğini çizmez; yalnızca Luna'nın kendi arayüzünü ve olay akışını sınar. Gerçek WebView2 davranışı (sayfa odaktayken kısayol kancası, sekme sessize alma, yazdırma) için `Luna Web Yerel.cmd` ile elle denenmelidir:

1. Bir siteye gir, sayfaya tıkla, **Ctrl+T**, **Ctrl+F**, **Ctrl+H**, **Ctrl+M** dene (sayfa odaktayken çalışmalı).
2. Ses çalan bir sayfada sekme rozetine tıkla; sessize alınmalı, başka sekmeye geçip dönünce sessiz kalmalı.
3. Bir YouTube sayfasında **Luna'da oynat**.
4. Bir makalede **Ctrl+Shift+R**; **Sesli oku**.
