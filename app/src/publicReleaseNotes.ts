/** Public news describes user benefits; raw engineering notes are reserved for developer mode. */
export function publicReleaseNotes(records:readonly {text:string}[],english=false):string[]{
 const text=records.map(r=>r.text.split('\n').filter(line=>! /\[dev\]/i.test(line)).join('\n')).join('\n');
 const topics:[RegExp,string,string][]=[
  [/güncelleme penceresi|yenilik metni/i,"Neler yeni ekranı artık daha sade ve anlaşılır.","The What’s new screen is now simpler and clearer."],
  [/kopya|kütüphane|library|catalog|katalog/i,'Film kütüphanesi ve kopya film görünümü daha düzenli.','The film library and duplicate movie views are more organized.'],
  [/tarayıcı|browser|luna web|webview|reklam engelleyici|ublock/i,'Web’de gezinme ve reklam engelleme iyileştirildi.','Browsing and ad blocking have been improved.'],
  [/oynat|playback|mpv|hdr|kalite|akış|stream/i,'Video oynatma ve izlemeye devam etme deneyimi iyileştirildi.','Video playback and continuing where you left off have been improved.'],
  [/altyazı|subtitle|whisper/i,'Altyazı bulma ve düzenleme araçları geliştirildi.','Subtitle search and editing tools have been improved.'],
  [/asistan|assistant|sohbet|analiz/i,'Asistan ve analiz ekranları daha kullanışlı.','Assistant and analysis screens are easier to use.'],
  [/müzik|music|şarkı|playlist|çalma list|sesli kitap/i,'Müzik dinleme ve çalma listesi işlemleri geliştirildi.','Music listening and playlist tools have been improved.'],
  [/kitap|book|okuma|reader|sayfa not/i,'Kitap okuma ve not alma deneyimi iyileştirildi.','Reading and taking book notes have been improved.'],
  [/öneri|önerilen|keşfet|discover|recommend|arkadaş|letterbox/i,'Film keşfi ve arkadaş önerileri geliştirildi.','Film discovery and friend recommendations have been improved.'],
  [/defter|not alma|notlar|notebook|sahne|klip/i,'Defterler, sahneler ve kişisel notlar daha kullanışlı.','Notebooks, scenes and personal notes are easier to use.'],
  [/ayar|görünüm|tasarım|erişilebilir|animasyon|arayüz|interface|layout|settings|ui\b/i,'Görünüm ve kullanım kolaylığı iyileştirildi.','Appearance and ease of use have been improved.'],
 ];
 const notes=topics.filter(([match])=>match.test(text)).map(([,tr,en])=>english?en:tr);
 return notes.length?notes:[english?'Small fixes make Luna more reliable and easier to use.':'Küçük düzeltmelerle Luna daha kararlı ve kullanışlı.'];
}
