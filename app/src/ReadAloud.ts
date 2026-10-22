// Sesli okuma: the open EPUB read aloud with Microsoft Edge's natural voices (as Edge's "Read
// aloud" does), the sentence and the word being read marked on the page, the pages turning by
// themselves. If Edge's service can't be reached, Windows' own voice reads on.
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { tt } from "./i18n";
import { store } from "./library";
import { musicPlaying, pauseMusic } from "./Music";

/** One section (chapter file) of the book as shown in the reader. */
export type TtsDoc = { doc: Document; index: number; range: (cfi: string) => Range | null; cfi: (r: Range) => string };
/** What the reader gives the voice: its pages, and ways to move them. */
export type TtsHost = {
  docs: () => TtsDoc[];
  /** where the page on screen starts */
  pageStart: () => string | undefined;
  /** the page with this place on screen */
  show: (cfi: string) => Promise<void>;
  /** is this text on the page on screen */
  visible: (r: Range) => boolean;
  scrolled: () => boolean;
  /** the next chapter file; false at the end of the book */
  nextSection: (index: number) => Promise<boolean>;
};
export type Voice = { name: string; locale: string; gender: string; label: string; kinds?: string[] };
export type Sleep = 0 | 15 | 30 | 60 | "chapter";

type TState = {
  active: boolean; playing: boolean; loading: boolean; rate: number; voice: string; lang: string;
  sleep: Sleep; sleepAt: number; note: string; win: boolean; volume: number; muted: boolean;
};
const saved = store.json<{ rate?: number; volume?: number; muted?: boolean } | null>("ttsSet", {}) ?? {};
const safeRate = (r: unknown) => typeof r === "number" && Number.isFinite(r) ? Math.max(0.5, Math.min(2, r)) : 1;
const safeVolume = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 100;
const T: TState = { active: false, playing: false, loading: false, rate: safeRate(saved.rate), voice: "", lang: "", sleep: 0, sleepAt: 0, note: "", win: false, volume: safeVolume(saved.volume), muted: saved.muted === true };
const subs = new Set<() => void>();
const set = (p: Partial<TState>) => { Object.assign(T, p); subs.forEach((f) => f()); };
export function useTts() {
  const [, bump] = useState(0);
  useEffect(() => { const f = () => bump((n) => n + 1); subs.add(f); return () => { subs.delete(f); }; }, []);
  return { ...T };
}
export const ttsActive = () => T.active;
/** A book is open in the reader that can be read aloud. */
export const ttsReady = () => !!E.host;

// ---------- the text of a chapter, in paragraphs ----------
type Para = { text: string; nodes: { n: Text; at: number }[]; sents?: [number, number][] };
type Chunk = { p: Para; a: number; b: number };
const BLOCK = "p,div,li,h1,h2,h3,h4,h5,h6,blockquote,pre,td,th,dd,dt,figcaption,caption,section,article,aside,header,footer,nav,body";
function paras(doc: Document): Para[] {
  const out: Para[] = [];
  let cur: Para | null = null, block: Element | null = null;
  const w = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode() as Text | null; n; n = w.nextNode() as Text | null) {
    const el = n.parentElement;
    if (!el || el.closest("script,style,rt,rp,noscript")) continue;
    const blk = el.closest(BLOCK) ?? doc.body;
    if (!cur || blk !== block) { cur = { text: "", nodes: [] }; out.push(cur); block = blk; }
    cur.nodes.push({ n, at: cur.text.length });
    cur.text += n.data;
  }
  return out.filter((p) => /[\p{L}\p{N}]/u.test(p.text));
}
function sentences(p: Para): [number, number][] {
  if (p.sents) return p.sents;
  const out: [number, number][] = [];
  const re = /[.!?…]+["'”’»)\]]*(\s+|$)/g;
  let s = 0, m: RegExpExecArray | null;
  while ((m = re.exec(p.text))) {
    const e = m.index + m[0].length;
    if (e > s) { out.push([s, e]); s = e; }
    if (!m[0].length) re.lastIndex++;
  }
  if (s < p.text.length) out.push([s, p.text.length]);
  return (p.sents = out);
}
/** A paragraph from `from` on, in pieces the voice reads at once (the very first one short, so it starts soon). */
function chunks(p: Para, from: number, first: boolean): Chunk[] {
  const out: Chunk[] = [];
  let a = -1, b = -1, limit = first ? 220 : 700;
  for (const [x0, y] of sentences(p)) {
    if (y <= from) continue;
    const x = Math.max(x0, from);
    if (a < 0) { a = x; b = y; } else if (y - a <= limit) b = y; else { out.push({ p, a, b }); a = x; b = y; limit = 700; }
  }
  if (a >= 0) out.push({ p, a, b });
  // a very long sentence: cut at a space
  return out.flatMap((c) => {
    if (c.b - c.a <= 1200) return [c];
    const l: Chunk[] = [];
    let s = c.a;
    while (c.b - s > 1000) { let e = p.text.lastIndexOf(" ", s + 900); if (e <= s) e = s + 900; l.push({ p, a: s, b: e }); s = e; }
    l.push({ p, a: s, b: c.b });
    return l;
  });
}
function nodeAt(p: Para, i: number): [Text, number] {
  let k = p.nodes.length - 1;
  while (k > 0 && p.nodes[k].at > i) k--;
  const x = p.nodes[k];
  return [x.n, Math.max(0, Math.min(i - x.at, x.n.length))];
}
function rangeOf(p: Para, a: number, b: number): Range {
  const r = p.nodes[0].n.ownerDocument.createRange();
  r.setStart(...nodeAt(p, a));
  r.setEnd(...nodeAt(p, b));
  return r;
}

// ---------- marking what is read (CSS highlights in the page: the book's own markup isn't touched) ----------
export const TTS_CSS = "::highlight(luna-tts-s){background-color:rgba(110,150,255,.2)}::highlight(luna-tts-w){background-color:rgba(110,150,255,.55)}";
function paint(doc: Document | null, sent: Range | null, word: Range | null) {
  const w = doc?.defaultView as any;
  const reg = w?.CSS?.highlights;
  if (!reg) return;
  try {
    if (sent) reg.set("luna-tts-s", new w.Highlight(sent)); else reg.delete("luna-tts-s");
    if (word) reg.set("luna-tts-w", new w.Highlight(word)); else reg.delete("luna-tts-w");
  } catch {}
}

// ---------- voices ----------
const DEFAULT_VOICE: Record<string, string> = {
  tr: "tr-TR-EmelNeural", en: "en-US-EmmaMultilingualNeural", de: "de-DE-KatjaNeural", fr: "fr-FR-DeniseNeural",
  es: "es-ES-ElviraNeural", it: "it-IT-ElsaNeural", ru: "ru-RU-SvetlanaNeural", pt: "pt-BR-FranciscaNeural",
  ar: "ar-SA-ZariyahNeural", ja: "ja-JP-NanamiNeural", zh: "zh-CN-XiaoxiaoNeural", nl: "nl-NL-ColetteNeural",
};
let voiceList: Promise<Voice[]> | null = null;
/** Edge's voices (kept for a week). */
export function loadVoices(): Promise<Voice[]> {
  const raw = store.json<{ at?: number; l?: unknown } | null>("ttsVoices2", null);
  const usableVoice = (v: unknown): v is Voice => !!v && typeof v === "object" && ["name", "locale", "gender", "label"].every(k => typeof (v as Record<string, unknown>)[k] === "string") && ((v as Voice).kinds === undefined || (Array.isArray((v as Voice).kinds) && (v as Voice).kinds!.every(k => typeof k === "string")));
  const c = raw && typeof raw.at === "number" && Array.isArray(raw.l) ? { at: raw.at, l: raw.l.filter(usableVoice) } : null;
  if (c && Date.now() - c.at < 7 * 864e5 && c.l.length) return Promise.resolve(c.l);
  return (voiceList ??= invoke<Voice[]>("tts_voices")
    .then((list) => { const l = Array.isArray(list) ? list.filter(usableVoice) : []; if(l.length){store.set("ttsVoices2", JSON.stringify({ at: Date.now(), l }));store.remove("ttsVoices");}else voiceList=null;return l; })
    .catch(() => { voiceList = null; return c?.l ?? []; }));
}
/** How good a voice is for reading a book, best first (from Microsoft's own kinds and the voice's generation):
 * 0 the newest (2024, Copilot's voices: Ava, Andrew, Emma, Brian, multilingual), 1 the other 2024 multilingual
 * voices, 2 voices made for novels and news, 3 the rest. Children's / cartoon voices and the plain copies of the
 * Copilot voices (the multilingual ones are the same voice, better) are left out. */
const voiceRank = (v: Voice) => {
  const k = v.kinds ?? [];
  if (k.includes("Copilot")) return /Multilingual/.test(v.name) ? 0 : 9;
  if (/Multilingual/.test(v.name)) return 1;
  if (k.includes("Novel")) return 2;
  return 3;
};
const hiddenVoice = (v: Voice) => (v.kinds ?? []).includes("Cartoon") || voiceRank(v) === 9;
/** The voices to offer for a book in `lang`: its own language's best first (at most `n`), then the new
 * multilingual voices, which read other languages too. */
export function voiceChoices(all: Voice[], lang: string, n = 10): { own: Voice[]; multi: Voice[]; more: number } {
  const usable = all.filter((v) => !hiddenVoice(v));
  // for English: American and British first, then the rest
  const near = (v: Voice) => (/^en-(US|GB)$/.test(v.locale) ? 0 : 1);
  const own = usable.filter((v) => v.locale.toLowerCase().startsWith(lang + "-"))
    .sort((a, b) => voiceRank(a) - voiceRank(b) || near(a) - near(b) || a.label.localeCompare(b.label));
  const multi = usable.filter((v) => voiceRank(v) <= 1 && !own.includes(v)).sort((a, b) => voiceRank(a) - voiceRank(b) || a.label.localeCompare(b.label));
  return { own: own.slice(0, n), multi, more: Math.max(0, own.length - n) };
}
const voiceFor = (lang: string) => store.get("ttsVoice:" + lang) || DEFAULT_VOICE[lang] || "en-US-EmmaMultilingualNeural";
/** "win" for Windows' voice */
export function setVoice(name: string) {
  if (T.lang) store.set("ttsVoice:" + T.lang, name);
  set({ voice: name });
  if (T.active) { cancel(); dropCache(); restart(); } // the prepared pieces were in the old voice
}
function saveTtsSettings() { store.set("ttsSet", JSON.stringify({ rate: T.rate, volume: T.volume, muted: T.muted })); }
export const ttsVolume = () => T.volume;
export function setTtsVolume(volume: number, muted = T.muted) {
  set({ volume: safeVolume(volume), muted });
  saveTtsSettings();
  if (E.audio) { E.audio.volume = T.volume / 100; E.audio.muted = T.muted; }
  // Windows snapshots controls at utterance start. Resume at the current word, not the paragraph.
  if (T.active && E.mode === "win") restartWinAtWord();
}
export function setTtsMuted(muted: boolean) { setTtsVolume(T.volume, muted); }
export function setRate(r: number) {
  r = safeRate(r);
  set({ rate: r });
  saveTtsSettings();
  if (E.audio) E.audio.playbackRate = r;
  if (E.mode === "win" && T.active) restartWinAtWord();
}
export function setSleep(s: Sleep) {
  clearTimeout(E.sleepT);
  set({ sleep: s, sleepAt: typeof s === "number" && s > 0 ? Date.now() + s * 60000 : 0 });
  if (typeof s === "number" && s > 0) E.sleepT = setTimeout(() => { setSleep(0); ttsPause(); set({ note: tt("Uyku zamanlayıcısı: okuma durduruldu.") }); }, s * 60000);
}

// ---------- the engine ----------
type Word = { s: number; e: number; at: number };
type Synth = { url: string; words: Word[] };
const E = {
  host: null as TtsHost | null,
  book: null as { path: string; title: string; lang?: string } | null,
  doc: null as TtsDoc | null,
  queue: [] as Chunk[],
  qi: 0,
  gen: 0,
  cache: new Map<Chunk, Promise<Synth>>(),
  audio: null as HTMLAudioElement | null,
  done: null as (() => void) | null,
  mode: "edge" as "edge" | "win",
  edgeDownAt: 0,
  raf: 0,
  following: false,
  heard: 0,
  lastTick: 0,
  winTick: 0,
  winChunk: null as Chunk | null,
  winOffset: 0,
  waitingChapter: false,
  sleepT: undefined as ReturnType<typeof setTimeout> | undefined,
};

/** The open book's text source (the reader's host), for other ways of reading it such as RSVP; null when no book is open. */
export const ttsHost = (): TtsHost | null => E.host;

/** The reader opened (or closed: null) a book. */
export function attachTts(host: TtsHost | null, book?: { path: string; title: string; lang?: string }) {
  if (!host) { ttsStop(); E.host = null; E.book = null; return; }
  E.host = host;
  E.book = book ?? null;
  if (!T.active) set({ note: "" });
}
/** Seconds listened since the last call (for the reading history). */
export function takeHeard() { accountWin(); const s = E.heard; E.heard = 0; return s; }

function accountWin() {
  if (E.winTick) { const now = performance.now(); E.heard += Math.max(0, now - E.winTick) / 1000; E.winTick = T.playing ? now : 0; }
}
function cancel() {
  accountWin(); E.winTick = 0; E.lastTick = 0;
  E.gen++;
  cancelAnimationFrame(E.raf);
  const d = E.done;
  E.done = null;
  E.audio?.pause();
  try { speechSynthesis.cancel(); } catch {}
  d?.();
}
function clearMarks() { for (const d of E.host?.docs() ?? []) paint(d.doc, null, null); }
function dropCache() { for (const p of E.cache.values()) p.then((s) => URL.revokeObjectURL(s.url)).catch(() => {}); E.cache.clear(); }

function guessLang(): string {
  const l = (E.book?.lang ?? "").slice(0, 2).toLowerCase();
  if (l) return l;
  const t = E.queue.slice(0, 3).map((c) => c.p.text).join(" ");
  return /[ğışİĞŞ]/.test(t) ? "tr" : "en";
}

/** Reads from the given place (a CFI), from where reading stopped last time if that is on the page, or from the top of the page. */
export async function ttsStart(fromCfi?: string) {
  const h = E.host;
  if (!h) return;
  cancel();
  E.waitingChapter = false;
  const docs = h.docs();
  const resolve = (cfi?: string) => {
    if (!cfi) return null;
    for (const d of docs) { try { const r = d.range(cfi); if (r && r.startContainer.ownerDocument === d.doc) return { d, r }; } catch {} }
    return null;
  };
  let at = resolve(fromCfi);
  if (!at && !fromCfi && E.book) { const s = resolve(store.get("ttsAt:" + E.book.path) ?? undefined); if (s && h.visible(s.r)) at = s; }
  at ??= resolve(h.pageStart());
  const d = at?.d ?? docs[0];
  if (!d) return;
  const ps = paras(d.doc);
  let pi = 0, off = 0;
  if (at) {
    const node = at.r.startContainer;
    const hit = ps.findIndex((p) => p.nodes.some((x) => x.n === node));
    if (hit >= 0) {
      pi = hit;
      const x = ps[hit].nodes.find((y) => y.n === node)!;
      off = x.at + at.r.startOffset;
      while (off > 0 && !/\s/.test(ps[hit].text[off - 1])) off--; // from the start of the word
    } else {
      // the place is an element: the first paragraph in or after it
      const k = ps.findIndex((p) => { const last = p.nodes[p.nodes.length - 1].n; return node === last || !!(node.compareDocumentPosition(last) & (Node.DOCUMENT_POSITION_FOLLOWING | Node.DOCUMENT_POSITION_CONTAINED_BY)); });
      pi = Math.max(0, k);
    }
  }
  E.doc = d;
  E.queue = ps.slice(pi).flatMap((p, i) => chunks(p, i === 0 ? off : 0, i === 0));
  E.qi = 0;
  dropCache();
  const lang = guessLang();
  const first = !T.active;
  set({ active: true, playing: true, lang, voice: store.get("ttsVoice:" + lang) || voiceFor(lang), note: first && !store.get("ttsNoted") ? "privacy" : T.note === "privacy" ? "privacy" : "" });
  if (musicPlaying()) pauseMusic(true);
  media(true);
  loop(E.gen);
}
export function ttsPause() {
  if (!T.active) return;
  accountWin(); E.winTick = 0;
  set({ playing: false });
  E.audio?.pause();
  try { if (E.mode === "win") speechSynthesis.pause(); } catch {}
}
export function ttsResume() {
  if (!T.active) { ttsStart(); return; }
  if (T.playing) return;
  if (musicPlaying()) pauseMusic(true);
  set({ playing: true, note: T.note === "privacy" ? T.note : "" });
  if (E.waitingChapter) { E.waitingChapter = false; loop(E.gen); return; }
  if (E.mode === "win") { E.winTick = E.done ? performance.now() : 0; try { speechSynthesis.resume(); } catch {} }
  else if (E.audio?.src && E.done) {
    const gen = E.gen, done = E.done;
    E.audio.playbackRate = T.rate;
    E.audio.play().catch(() => { if (E.gen === gen && E.done === done) audioFailure(); });
    tick();
  }
}
export function ttsToggle() { if (!T.active) ttsStart(); else if (T.playing) ttsPause(); else ttsResume(); }
export function ttsStop() {
  cancel();
  clearMarks();
  dropCache();
  setSleep(0);
  E.waitingChapter = false;
  media(false);
  set({ active: false, playing: false, loading: false, note: "" });
}
export function ttsSkip(dir: 1 | -1) {
  if (!T.active) return;
  // back: to the start of this piece if it has been playing a while, else the one before
  if (!(dir < 0 && E.mode === "edge" && (E.audio?.currentTime ?? 0) > 2)) E.qi = Math.max(0, Math.min(E.queue.length, E.qi + dir));
  restart();
}
/** The note in the bar was read (the privacy one is shown only the first time). */
export const ttsNoted = () => { if (T.note === "privacy") store.set("ttsNoted", "1"); set({ note: "" }); };
function restart() {
  const playing = T.playing;
  cancel();
  E.waitingChapter = false;
  set({ playing });
  if (playing) { try { speechSynthesis.resume(); } catch {} }
  loop(E.gen);
}
function restartWinAtWord() {
  const current = E.queue[E.qi];
  if (current && E.winChunk === current && E.winOffset > current.a && E.winOffset < current.b) {
    E.queue[E.qi] = { ...current, a: E.winOffset };
  }
  restart();
}

function media(on: boolean) {
  const ms = (navigator as any).mediaSession;
  if (!ms) return;
  try {
    ms.setActionHandler("play", on ? ttsResume : null);
    ms.setActionHandler("pause", on ? ttsPause : null);
    ms.setActionHandler("nexttrack", on ? () => ttsSkip(1) : null);
    ms.setActionHandler("previoustrack", on ? () => ttsSkip(-1) : null);
    if (on && E.book && (window as any).MediaMetadata) ms.metadata = new (window as any).MediaMetadata({ title: E.book.title, artist: tt("Sesli okuma") });
  } catch {}
}

function synth(c: Chunk): Promise<Synth> {
  let p = E.cache.get(c);
  if (!p) {
    const text = c.p.text.slice(c.a, c.b);
    p = invoke<ArrayBuffer>("tts_speak", { text, voice: T.voice }).then((buf) => {
      const n = new DataView(buf).getUint32(0, true);
      const raw = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, n))) as { text: string; at: number }[];
      const url = URL.createObjectURL(new Blob([new Uint8Array(buf, 4 + n)], { type: "audio/mpeg" }));
      // the words' places in the text
      const words: Word[] = [];
      let cur = c.a;
      for (const w of raw) {
        const i = c.p.text.indexOf(w.text, cur);
        if (i < 0 || i - cur > 80) continue;
        words.push({ s: i, e: i + w.text.length, at: w.at });
        cur = i + w.text.length;
      }
      return { url, words };
    });
    E.cache.set(c, p);
    p.catch(() => E.cache.delete(c));
  }
  return p;
}
const edgeUsable = () => T.voice !== "win" && Date.now() - E.edgeDownAt > 120000;
function prefetch(i: number) { const c = E.queue[i]; if (c && edgeUsable()) synth(c).catch(() => {}); }

async function loop(g: number) {
  while (g === E.gen && E.host) {
    if (E.qi >= E.queue.length) {
      // the chapter is over: on to the next one
      if (T.sleep === "chapter") { E.waitingChapter = true; setSleep(0); ttsPause(); set({ note: tt("Bölüm bitti; okuma durduruldu.") }); return; }
      const cur = E.doc?.index ?? -1;
      set({ loading: true });
      const ok = await E.host.nextSection(cur).catch(() => false);
      if (g !== E.gen) return;
      const d = E.host.docs().find((x) => x.index > cur);
      if (!ok || !d) { ttsStop(); set({ note: tt("Kitabın sonuna gelindi.") }); return; }
      E.doc = d;
      E.queue = paras(d.doc).flatMap((p) => chunks(p, 0, false));
      E.qi = 0;
      dropCache();
      continue;
    }
    const c = E.queue[E.qi];
    if (E.book && E.doc) { try { store.set("ttsAt:" + E.book.path, E.doc.cfi(rangeOf(c.p, c.a, c.a))); } catch {} }
    await say(c, g);
    if (g !== E.gen) return;
    E.qi++;
  }
}

async function say(c: Chunk, g: number) {
  let s: Synth | null = null;
  if (edgeUsable()) {
    set({ loading: true });
    prefetch(E.qi + 1);
    s = await synth(c).catch((e) => { console.warn("tts", e); return null; });
    if (g !== E.gen) return;
    if (!s) { E.edgeDownAt = Date.now(); set({ note: tt("Doğal ses şu an kullanılamıyor; Windows'un sesiyle okunuyor.") }); }
  }
  prefetch(E.qi + 1);
  prefetch(E.qi + 2);
  set({ loading: false, win: !s });
  await new Promise<void>((done) => {
    E.done = done;
    if (s) playEdge(c, s, done); else playWin(c, done);
  });
}

function mark(c: Chunk, s: number, e: number) {
  // the chapter on screen was changed under the voice (contents, search, the slider): read on from the new page
  if (!c.p.nodes[0].n.ownerDocument.defaultView) {
    const generation = E.gen;
    if (T.active && T.playing) setTimeout(() => { if (T.active && T.playing && E.gen === generation) ttsStart(); }, 0);
    return;
  }
  const sent = sentences(c.p).find(([a, b]) => s >= a && s < b) ?? [c.a, c.b];
  const doc = c.p.nodes[0].n.ownerDocument;
  let word: Range | null = null;
  try { word = rangeOf(c.p, s, e); paint(doc, rangeOf(c.p, Math.max(sent[0], c.a), Math.min(sent[1], c.b)), word); } catch {}
  // the page follows the voice
  if (word && E.host && !E.following && !E.host.visible(word)) {
    E.following = true;
    const cfi = E.doc?.cfi(word);
    const h = E.host;
    (h.scrolled() ? Promise.resolve((word.startContainer.parentElement as HTMLElement | null)?.scrollIntoView({ block: "center", behavior: "smooth" }))
      : cfi ? h.show(cfi) : Promise.resolve())
      .catch(() => {}).finally(() => setTimeout(() => { E.following = false; }, 400));
  }
}

let lastWord = -1;
/** The word being said, marked; the time listened, counted. */
function sync() {
  const a = E.audio;
  const now = performance.now();
  if (a && !a.paused) { if (E.lastTick) E.heard += (now - E.lastTick) / 1000; E.lastTick = now; } else E.lastTick = 0;
  const words = (a as any)?._words as Word[] | undefined, c = (a as any)?._chunk as Chunk | undefined;
  if (!a || !words || !c) return;
  const t = a.currentTime + 0.04;
  let k = -1;
  for (let i = 0; i < words.length && words[i].at <= t; i++) k = i;
  if (k !== lastWord) { lastWord = k; if (k >= 0) mark(c, words[k].s, words[k].e); else mark(c, c.a, c.a); }
}
/** Every frame while the voice plays (and on the audio's own time updates, when the window is hidden and frames stop). */
function tick() {
  cancelAnimationFrame(E.raf);
  const step = () => { sync(); if (E.audio && !E.audio.paused) E.raf = requestAnimationFrame(step); };
  E.raf = requestAnimationFrame(step);
}

function audioFailure() {
  // A rejected play promise need not fire an audio error event. Stop cleanly rather than hang.
  ttsStop();
  set({ note: tt("Ses başlatılamadı. Yeniden okumayı deneyin.") });
}
function playEdge(c: Chunk, s: Synth, done: () => void) {
  E.mode = "edge";
  const a = (E.audio ??= new Audio());
  const end = () => { if (E.done === done) { E.done = null; done(); } };
  a.onended = end;
  a.onerror = () => { if (E.done === done) audioFailure(); };
  a.onplay = () => tick();
  a.ontimeupdate = sync;
  a.onpause = sync;
  (a as any)._words = s.words;
  (a as any)._chunk = c;
  lastWord = -2;
  a.src = s.url;
  a.playbackRate = T.rate;
  a.volume = T.volume / 100;
  a.muted = T.muted;
  (a as any).preservesPitch = true;
  if (!s.words.length) mark(c, c.a, c.a);
  const gen = E.gen;
  if (T.playing) a.play().catch(() => { if (E.gen === gen && E.done === done) audioFailure(); });
}

function playWin(c: Chunk, done: () => void) {
  E.mode = "win";
  E.winChunk = c;
  E.winOffset = c.a;
  E.audio?.pause();
  const text = c.p.text.slice(c.a, c.b);
  const u = new SpeechSynthesisUtterance(text);
  const vs = speechSynthesis.getVoices();
  const v = vs.find((x) => x.lang.toLowerCase().startsWith(T.lang) && x.localService) ?? vs.find((x) => x.lang.toLowerCase().startsWith(T.lang));
  if (v) u.voice = v;
  u.lang = v?.lang ?? T.lang;
  u.rate = T.rate;
  u.volume = T.muted ? 0 : T.volume / 100;
  u.onstart = () => { if (E.done !== done) return; E.winTick = T.playing ? performance.now() : 0; mark(c, c.a, c.a); };
  u.onboundary = (e) => {
    if (E.done !== done || (e.name && e.name !== "word")) return;
    const s = c.a + e.charIndex;
    if (Number.isFinite(s) && s >= c.a && s < c.b) E.winOffset = s;
    let end = s + (e.charLength || 0);
    if (end <= s) { const m = /^[^\s]+/.exec(c.p.text.slice(s)); end = s + (m ? m[0].length : 1); }
    mark(c, s, end);
  };
  const fin = () => { if (E.done === done) { accountWin(); E.winTick = 0; E.done = null; done(); } };
  u.onend = fin;
  u.onerror = () => { if (E.done === done) audioFailure(); };
  if (T.playing) speechSynthesis.resume();
  speechSynthesis.speak(u);
  if (!T.playing) speechSynthesis.pause();
}
