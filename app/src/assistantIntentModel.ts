/** Pure intent checks for the assistant (no Tauri / React), so the words that force a tool call can be tested.
 *  A forced call is strong: the provider MUST call one of the named tools, and Luna then asks to open or play
 *  something. A false positive ("Have you read Dune?", "Where should I start with Kubrick?") turns a question
 *  into an "open this?" card, so the English verbs only count when they are used as a request. */

/** Lower-case Turkish text without its special letters, for matching what people type on any keyboard. */
export const toolIntentText = (t: string) => String(t ?? "").toLocaleLowerCase("tr").replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g")
  .replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c").replace(/[\u2018\u2019\u02bc]/g, "'");

/** Turkish imperatives are distinct words ("aç", "oynat", "çal", "oku"); "açıkla", "okudum", "çalışma" do not match. */
const TR_OPEN = String.raw`\b(ac|oynat|baslat|cal|dinlet|oku)\b|\bacar misin|\bacabilir|\bcalar misin`;
/** An English verb counts at the start of a sentence or after a request phrase ("please", "can you", "I want to"…). */
const EN_LEAD = String.raw`(?:^|[.!?;:]\s*|\b(?:please|pls|can you|could you|would you|will you|can u|let'?s|lets|i want to|i wanna|i'?d like to|go ahead and|just)\s+)`;
const EN_VERB = String.raw`(?:open(?!\s+(?:to|for|minded|ended)\b)|play(?!\s+(?:it safe|along|around)\b)|start(?!\s+(?:with|from|by|off|over)\b)|resume|put on|listen to|read(?!\s+(?:me|about|more|up|reviews?|the (?:link|page|reviews?|plot|summary)|this (?:link|page)|that (?:link|page))\b))\b`;
export const OPEN_INTENT = new RegExp(`${TR_OPEN}|${EN_LEAD}${EN_VERB}`);

/** The message asks Luna to open / play / read something now (text already passed through toolIntentText).
 *  A message with a link is about that link (read_link / import_link), never a forced "open" call. */
export function wantsOpenTool(intentText: string, hasLink = false): boolean {
  if (hasLink) return false;
  return OPEN_INTENT.test(intentText);
}
