import { tt } from "./i18n";

/** The assistant's "/" commands. They are handled by Luna itself, before any model sees them, so
 *  they work the same with Gemini, OpenAI, Claude or a local model. */
export type SlashId = "help" | "new" | "model" | "big" | "small" | "settings" | "history" | "collections" | "next" | "prev" | "pause" | "resume";
export const SLASH: { id: SlashId; cmd: string; alias: string[]; about: () => string }[] = [
  { id: "help", cmd: "/help", alias: ["/yardım", "/yardim", "/komutlar", "/?"], about: () => tt("Bütün komutları ve asistanın yapabildiklerini gösterir") },
  { id: "new", cmd: "/yeni", alias: ["/new", "/temizle", "/clear"], about: () => tt("Yeni bir sohbet başlatır (eskisi geçmişte kalır)") },
  { id: "model", cmd: "/model", alias: ["/ai"], about: () => tt("Şu an hangi yapay zekânın cevap verdiğini söyler") },
  { id: "big", cmd: "/büyüt", alias: ["/buyut", "/big"], about: () => tt("Büyük çalışma alanını açar") },
  { id: "small", cmd: "/küçült", alias: ["/kucult", "/small"], about: () => tt("Küçük pencereye geçer") },
  { id: "settings", cmd: "/ayarlar", alias: ["/settings"], about: () => tt("Ayarları açar (anahtarlar, API profilleri)") },
  { id: "history", cmd: "/geçmiş", alias: ["/gecmis", "/history"], about: () => tt("İzleme, dinleme ve okuma geçmişini açar") },
  { id: "collections", cmd: "/koleksiyonlar", alias: ["/collections"], about: () => tt("Koleksiyonlarını açar") },
  { id: "pause", cmd: "/durdur", alias: ["/pause"], about: () => tt("Çalanı duraklatır") },
  { id: "resume", cmd: "/devam", alias: ["/resume", "/play"], about: () => tt("Duraklatılanı sürdürür") },
  { id: "next", cmd: "/sonraki", alias: ["/next"], about: () => tt("Sonraki şarkıya geçer") },
  { id: "prev", cmd: "/önceki", alias: ["/onceki", "/prev"], about: () => tt("Önceki şarkıya döner") },
];
export function findSlash(text: string) {
  const w = text.trim().split(/\s+/)[0]?.toLocaleLowerCase("tr");
  if (!w?.startsWith("/")) return null;
  return SLASH.find((c) => c.cmd === w || c.alias.includes(w)) ?? null;
}
/** Commands that start with what is typed (for the list over the input). */
export const slashMatches = (typed: string) => {
  const w = typed.trim().toLocaleLowerCase("tr");
  return SLASH.filter((c) => c.cmd.startsWith(w) || c.alias.some((a) => a.startsWith(w)));
};

/** "/help": the commands, the instant phrases and what can be asked, by part of Luna. */
export function helpText(aiName: string): string {
  const sec = (h: string, l: string[]) => `**${h}**\n${l.map((x) => "- " + x).join("\n")}`;
  return [
    tt("Şu an cevap veren: {0}. Aşağıdakilerin hepsi her yapay zekâyla çalışır; sadece Google araması Gemini'ye özel.", aiName),
    sec(tt("Komutlar (/ ile başlar)"), SLASH.map((c) => `${c.cmd} — ${c.about()}`)),
    sec(tt("Anında çalışanlar (modele sorulmadan)"), [
      tt("durdur · devam · kapat · sonraki · önceki"),
      tt("sesi aç · sesi kıs · ses 40 · sessize al · sesi geri aç"),
      tt("karıştır · karıştırma · ne çalıyor?"),
      tt("sesli oku · okumayı durdur (kitapta)"),
      tt("Bir Spotify / YouTube / magnet / .epub bağlantısı yapıştırmak: Luna kendisi açar"),
    ]),
    sec(tt("Film ve dizi"), [
      tt("“Bu akşam ne izlesem?”, “Inception gibi filmler öner” — zevk defterine göre öneri"),
      tt("“Interstellar'ın sayfasını aç”, “Nolan kimdir?”, “X'in fotoğraflarını göster”"),
      tt("“Kütüphanemde korku filmi var mı?”, “Dune'u oynat”"),
      tt("“Bunu izledim, 8 veriyorum”, “sonra izle listeme ekle”"),
      tt("“Bu filmin torrentini / kaynağını bul”, “Alt yazısı Türkçe olsun”"),
    ]),
    sec(tt("Öneriler ve listeler"), [
      tt("“Ali'nin Letterboxd'unu takip et”, “listelerimi güncelle”"),
      tt("“Murat'ın önerilerini puana göre sırala”, “Matrix tarzı filmler listesine ekle”"),
      tt("“Yağmurlu günler için bir koleksiyon yap” — film, müzik ve kitap bir arada"),
    ]),
    sec(tt("Müzik"), [
      tt("“Barış Manço çal”, “bir caz radyosu aç”, “bir podcast öner”"),
      tt("“Coltrane'in en iyi 10 şarkısından liste yap”, “bunun gibi şarkılardan liste yap”"),
      tt("“Listelerimi aç”, “bu şarkının hikâyesi ne?”"),
    ]),
    sec(tt("Kitap"), [
      tt("“Suç ve Ceza'yı aç”, “ücretsiz Dostoyevski kitapları bul”"),
      tt("“Bu kitap hakkında ne düşünülüyor?”, “bunun sesli kitabı var mı?”"),
    ]),
    sec(tt("Genel"), [
      tt("“Beni Müzik'e götür”, “ayarları aç”"),
      tt("“Korku sevmediğimi hatırla”, “bu notu unut”"),
      tt("Bir yazıyı seçip sağ tıkla: Kopyala ya da Asistana sor"),
    ]),
  ].join("\n\n");
}
