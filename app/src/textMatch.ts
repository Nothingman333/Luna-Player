/** One comparison key for what someone typed (or the assistant sent) against a stored name.
 *  No case, no accents on Latin letters, and the Turkish i family (İ I ı i) is one letter, so
 *  "interstellar" finds "Interstellar", "bein" finds "BEIN Sports", "isik" finds "Işık".
 *  Letters of other scripts are kept ("東京", "Москва", "が" stays "が"). */
export function matchKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/(?<=\p{Script=Latin})\p{M}+/gu, "")
    .replace(/[İIı]/g, "i")
    .toLowerCase()
    .replace(/ø/g, "o").replace(/æ/g, "ae").replace(/œ/g, "oe").replace(/ß/g, "ss").replace(/ł/g, "l").replace(/đ/g, "d")
    .normalize("NFC");
}
