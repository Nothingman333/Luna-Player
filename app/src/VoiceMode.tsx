/**
 * Voice assistant (local models): hold the shortcut, speak, let go. The recording is turned into text by the same
 * Whisper engine and model the subtitle studio uses (one download for both), asked of the assistant, and the answer is
 * read back short with Luna's natural voices (the book read-aloud ones). The chat opens only when the answer is a card.
 */
import { useEffect, useRef, useState } from "react";
import { invoke } from "./nativeCore";
import { store } from "./library";
import { extraText } from "./Extras";
import { captureAiUse } from "./ai";
import { askAssistant } from "./Taste";
import { P as music } from "./Music";
import { setProp } from "./mpv";
import { loadVoices, type Voice } from "./ReadAloud";
import { getEngine, getModel, newJob, onJob, pickEngine, pickModel, runWhisper, whisperStatus, type WhisperStatus } from "./studioBridge";
import { LunaSelect } from "./LunaSelect";
import { lang as uiLang } from "./i18n";
import "./VoiceMode.css";
import { developerSessionActive } from "./devSession";

export const VOICE_KEYS = [
  { value: "ctrl+space", label: "Ctrl + Space" },
  { value: "ctrl+shift+space", label: "Ctrl + Shift + Space" },
  { value: "f8", label: "F8" },
];
export const voicePrefs = {
  on: () => store.get("voiceOn") === "1",
  key: () => VOICE_KEYS.some((k) => k.value === store.get("voiceKey")) ? store.get("voiceKey")! : "ctrl+space",
  voice: () => store.get("voiceVoice") ?? "",
  /** "Luna" wakes the assistant without the shortcut */
  wake: () => store.get("voiceWake") === "1",
  /** how long a pause ends a sentence said after "Luna" (ms) */
  silence: () => { const n = Number(store.get("voiceSilence")); return n >= 600 && n <= 3000 ? n : 1200; },
  /** speech to text: Luna's Whisper (whisper.cpp), or an outside Python with a model on the GPU (developer setting) */
  engine: () => (store.get("voiceEngine") === "python" && !!store.get("voicePython") ? "python" : "whisper"),
  python: () => store.get("voicePython") ?? "",
};
const WHISPER_HINT = "Luna asistan. webde, internette, kutuphanemde, YouTube, Spotify, sarki, film, kitap.";
/** "Luna, …" (as Whisper may write it): the words after the name, "" for the name alone, null when it was not said. */
export function afterWake(text: string): string | null {
  const m = text.trim().match(/^(?:hey|hi|selam|merhaba)?[\s,]*(?:luna|lüna|lunа|loona|lona|luma|lunah|una)\b[\s,.!?:;-]*(.*)$/i);
  return m ? m[1].trim() : null;
}
/** 16-bit mono WAV at 16 kHz from the microphone's float samples. */
function wav(chunks: Float32Array[], rate: number): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0), step = rate / 16000, n = Math.floor(total / step);
  const out = new DataView(new ArrayBuffer(44 + n * 2));
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); out.setUint32(4, 36 + n * 2, true); str(8, "WAVEfmt "); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
  out.setUint32(24, 16000, true); out.setUint32(28, 32000, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true); str(36, "data"); out.setUint32(40, n * 2, true);
  let ci = 0, off = 0;
  for (let i = 0; i < n; i++) {
    let pos = Math.floor(i * step) - off;
    while (ci < chunks.length && pos >= chunks[ci].length) { pos -= chunks[ci].length; off += chunks[ci].length; ci++; }
    const v = ci < chunks.length ? Math.max(-1, Math.min(1, chunks[ci][pos])) : 0;
    out.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
  }
  return new Uint8Array(out.buffer);
}
/** A recording's words, with the Whisper the subtitle studio uses; "" when nothing was said, null when Whisper is missing. */
async function transcribe(bytes: Uint8Array): Promise<string | null> {
  if (voicePrefs.engine() === "python") {
    let clip = "";
    try {
      clip = await invoke<string>("voice_clip", { audio: Array.from(bytes) });
      const text = (await invoke<string>("voice_engine_transcribe", { python: voicePrefs.python(), path: clip, lang: lang() })).replace(/\s+/g, " ").trim();
      store.set("voiceEngineOk", "1");
      return text;
    } finally {
      if (clip) void invoke("voice_clip_done", { path: clip }).catch(() => {});
    }
  }
  const st = await whisperStatus();
  const engine = pickEngine(st), model = pickModel(st);
  if (!engine || !model) return null;
  let clip = "";
  try {
    clip = await invoke<string>("voice_clip", { audio: Array.from(bytes) });
    return srtText(await runWhisper({ job: newJob(), input: clip, engine, model, lang: lang(), translate: false, preset: "fast", vad: false, prompt: WHISPER_HINT }));
  } finally {
    if (clip) void invoke("voice_clip_done", { path: clip }).catch(() => {});
  }
}
const isKey = (e: KeyboardEvent, key: string) =>
  key === "f8" ? e.key === "F8" && !e.ctrlKey && !e.altKey
  : e.code === "Space" && e.ctrlKey && !e.altKey && (key === "ctrl+shift+space") === e.shiftKey;
const lang = () => (uiLang() === "en" ? "en" : "tr");

/** A natural voice for the interface language: the chosen one, else Emel / Ava, else any of the language. */
async function replyVoice(): Promise<string> {
  const all = await loadVoices().catch(() => [] as Voice[]);
  const chosen = voicePrefs.voice();
  if (chosen && all.some((v) => v.name === chosen)) return chosen;
  const loc = lang() === "en" ? "en-US" : "tr-TR";
  return all.find((v) => v.locale === loc && /Emel|Ava/.test(v.name))?.name ?? all.find((v) => v.locale.startsWith(lang()))?.name ?? (lang() === "en" ? "en-US-AvaNeural" : "tr-TR-EmelNeural");
}
/** The answer as it is spoken: no markdown or links, at most two short sentences. */
export function spokenLine(text: string): string {
  const plain = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[([]([^)\]]*(official|video|audio|lyric|klip|clip|visuali[sz]er|hd|4k)[^)\]]*)[)\]]/gi, "").replace(/https?:\/\/\S+/g, "").replace(/[*_`#>|]/g, "").replace(/\s+/g, " ").trim();
  const sentences = plain.match(/[^.!?…]+[.!?…]*/g) ?? [plain];
  return sentences.slice(0, 2).join(" ").trim().slice(0, 240);
}
let playing: HTMLAudioElement | null = null;
/** Two soft notes: "I'm listening". */
function chime() {
  try {
    const ctx = new AudioContext(), t = ctx.currentTime;
    [660, 880].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f; o.type = "sine";
      g.gain.setValueAtTime(0, t + i * 0.09); g.gain.linearRampToValueAtTime(0.12, t + i * 0.09 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.22);
      o.connect(g).connect(ctx.destination); o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.25);
    });
    setTimeout(() => void ctx.close(), 600);
  } catch { /* no sound */ }
}
/** The reply's voice service: Microsoft's (Edge, free) or ElevenLabs with the user's own key. */
const elevenPrefs = {
  on: () => store.get("voiceTts") === "eleven" && !!store.get("elevenKey") && !!store.get("elevenVoice"),
  model: () => store.get("elevenModel") === "eleven_multilingual_v2" ? "eleven_multilingual_v2" : "eleven_flash_v2_5",
};
/** One spoken line as MP3: ElevenLabs when chosen; if it fails (no credit, no network) the Edge voice reads it. */
async function replyAudio(line: string): Promise<Uint8Array<ArrayBuffer>> {
  if (elevenPrefs.on()) {
    try { return new Uint8Array(await invoke<ArrayBuffer>("elevenlabs_speak", { key: store.get("elevenKey") ?? "", voice: store.get("elevenVoice") ?? "", model: elevenPrefs.model(), text: line })); }
    catch (e) { console.warn("ElevenLabs:", String(e).slice(0, 200)); }
  }
  const buf = await invoke<ArrayBuffer>("tts_speak", { text: line, voice: await replyVoice() });
  const n = new DataView(buf).getUint32(0, true);
  return new Uint8Array(buf, 4 + n);
}
export async function speak(text: string) {
  const line = spokenLine(text);
  if (!line) return;
  playing?.pause();
  const url = URL.createObjectURL(new Blob([await replyAudio(line)], { type: "audio/mpeg" }));
  const audio = new Audio(url);
  playing = audio;
  // resolves when the voice has finished (or was cut off), so the text can stay on screen until then
  await new Promise<void>((done) => {
    const end = () => { URL.revokeObjectURL(url); done(); };
    audio.onended = end; audio.onpause = end; audio.onerror = end;
    audio.play().catch(end);
  });
}
/** Whisper's SRT as plain text. */
const srtText = (srt: string) => srt.split(/\r?\n/).filter((l) => l.trim() && !/^\d+$/.test(l.trim()) && !/-->/.test(l)).join(" ").replace(/\[[^\]]*\]|\([^)]*\)/g, "").replace(/\s+/g, " ").trim();

type Phase = "idle" | "listen" | "hear" | "think" | "say" | "note";

export function VoiceMode({ paused = false }: { paused?: boolean }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [line, setLine] = useState("");
  const level = useRef<HTMLDivElement>(null);
  const rec = useRef<{ stream: MediaStream; node: ScriptProcessorNode; chunks: Float32Array[]; ctx: AudioContext; raf: number; started: number } | null>(null);
  const captureEpoch = useRef(0), capturePending = useRef(false);
  const phaseRef = useRef(phase); phaseRef.current = phase;
  const hideTimer = useRef(0);
  const awaitingCommand = useRef(0);
  const understanding = useRef(false);
  const [wakeLive, setWakeLive] = useState(false);
  // someone is speaking into the "Luna" listener right now (the music goes down already, before it is understood)
  const [capturing, setCapturing] = useState(false);
  const [spot, setSpot] = useState<{ right?: number; bottom?: number; left?: number; top?: number; docked?: boolean } | null>(null);

  const show = (p: Phase, text = "", hideAfter = 0) => {
    clearTimeout(hideTimer.current);
    setPhase(p); setLine(text);
    if (hideAfter) hideTimer.current = window.setTimeout(() => { setPhase("idle"); setLine(""); }, hideAfter);
  };

  const start = async () => {
    if (capturePending.current || rec.current || phaseRef.current === "hear" || phaseRef.current === "think") return;
    if (captureAiUse().provider !== "custom") { show("note", extraText("Sesli asistan şimdilik yalnız yerel modelle (LM Studio) çalışıyor.", "The voice assistant works only with a local model (LM Studio) for now."), 3500); return; }
    playing?.pause();
    const epoch = ++captureEpoch.current; capturePending.current = true;
    let openedStream: MediaStream | null = null, openedContext: AudioContext | null = null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      openedStream = stream;
      if (epoch !== captureEpoch.current || !voicePrefs.on()) { stream.getTracks().forEach(t => t.stop()); return; }
      const chunks: Float32Array[] = [];
      // the orb follows the voice's loudness; the samples are kept for a WAV
      const ctx = new AudioContext(); openedContext = ctx;
      const an = ctx.createAnalyser(); an.fftSize = 512;
      const src = ctx.createMediaStreamSource(stream);
      src.connect(an);
      const node = ctx.createScriptProcessor(4096, 1, 1);
      node.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      src.connect(node); node.connect(ctx.destination);
      const data = new Uint8Array(an.fftSize);
      const tick = () => {
        an.getByteTimeDomainData(data);
        let sum = 0; for (const v of data) sum += (v - 128) * (v - 128);
        const lvl = Math.min(1, Math.sqrt(sum / data.length) / 40).toFixed(3);
        level.current?.style.setProperty("--lvl", lvl); document.documentElement.style.setProperty("--voice-lvl", lvl);
        if (rec.current) rec.current.raf = requestAnimationFrame(tick);
      };
      rec.current = { stream, node, chunks, ctx, raf: 0, started: Date.now() };
      rec.current.raf = requestAnimationFrame(tick);
      show("listen", extraText("Dinliyorum…", "Listening…"));
    } catch {
      openedStream?.getTracks().forEach(t => t.stop());
      void openedContext?.close().catch(() => {});
      if (epoch !== captureEpoch.current) return;
      show("note", extraText("Mikrofona erişilemedi. Windows ayarlarında mikrofon iznini kontrol et.", "The microphone could not be opened. Check the microphone permission in Windows settings."), 4500);
    } finally { if (epoch === captureEpoch.current) capturePending.current = false; }
  };

  const stop = async () => {
    ++captureEpoch.current; capturePending.current = false;
    const r = rec.current;
    if (!r) return;
    rec.current = null;
    cancelAnimationFrame(r.raf);
    r.node.disconnect();
    r.stream.getTracks().forEach((t) => t.stop());
    const rate = r.ctx.sampleRate;
    void r.ctx.close();
    if (Date.now() - r.started < 400) { show("idle"); return; }
    show("hear", extraText("Anlıyorum…", "Understanding…"));
    await understand(wav(r.chunks, rate));
  };
  /** Turns a recording into a question for the assistant (`wake`: only if it starts with "Luna", or right after it). */
  const understand = async (bytes: Uint8Array, wake: "" | "name" | "after" = "") => {
    if (!wake) show("hear", extraText("Anlıyorum…", "Understanding…"));
    try {
      let text = await transcribe(bytes);
      if (!voicePrefs.on()) return;
      if (text === null) { show("note", extraText("Whisper kurulu değil: Ayarlar → Hesaplar ve anahtarlar → Sesli asistan.", "Whisper is not installed: Settings → Accounts and keys → Voice assistant."), 5000); return; }
      if (wake === "name") {
        const rest = afterWake(text);
        // not for Luna: whatever it was doing goes on
        if (rest === null) return;
        // "Luna" while it was answering: the answer stops, it starts over
        playing?.pause();
        chime();
        // "Luna" alone: it waits for the request, and gives up quietly if none comes
        if (!rest) { awaitingCommand.current = Date.now(); show("listen", extraText("Dinliyorum…", "Listening…"), 8000); return; }
        text = rest;
      } else {
        // said again after waking it ("Luna … Luna, play X"), or by habit with the key: the name is not part of the request
        const rest = afterWake(text);
        if (rest !== null) text = rest;
      }
      if (!text) { show("note", extraText("Bir şey duyamadım.", "I didn't hear anything."), 2500); return; }
      if (captureAiUse().provider !== "custom") { show("note", extraText("Sesli asistan şimdilik yalnız yerel modelle (LM Studio) çalışıyor.", "The voice assistant works only with a local model (LM Studio) for now."), 3500); return; }
      show("think", text);
      askAssistant(text, undefined, true);
    } catch (e) {
      show("note", extraText("Ses yazıya çevrilemedi: ", "Could not transcribe: ") + String(e).replace(/^Error: /, "").slice(0, 160), 5000);
    }
  };

  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (!voicePrefs.on() || e.repeat || !isKey(e, voicePrefs.key())) return; e.preventDefault(); e.stopPropagation(); void start(); };
    // letting go of the main key (Space / F8) ends the recording, whatever happened to the modifiers
    const up = (e: KeyboardEvent) => { if (!rec.current && !capturePending.current) return; if (voicePrefs.key() === "f8" ? e.key === "F8" : e.code === "Space") { e.preventDefault(); void stop(); } };
    const blur = () => { void stop(); };
    const answer = (e: Event) => {
      const d = (e as CustomEvent<{ text: string; card: boolean }>).detail;
      if (!d || phaseRef.current !== "think" || !voicePrefs.on()) return;
      if (d.card) window.dispatchEvent(new Event("luna-voice-show"));
      // the text stays while it is spoken, and a moment after
      show("say", spokenLine(d.text));
      void speak(d.text).catch(() => {}).finally(() => { if (phaseRef.current === "say") show("say", spokenLine(d.text), 1500); });
    };
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    window.addEventListener("blur", blur);
    window.addEventListener("luna-voice-answer", answer);
    return () => { ++captureEpoch.current; capturePending.current = false; const r = rec.current; rec.current = null; if (r) { cancelAnimationFrame(r.raf); r.node.disconnect(); r.stream.getTracks().forEach(t => t.stop()); void r.ctx.close(); } clearTimeout(hideTimer.current); window.removeEventListener("keydown", down, true); window.removeEventListener("keyup", up, true); window.removeEventListener("blur", blur); window.removeEventListener("luna-voice-answer", answer); };
  }, []);

  const [prefsTick, setPrefsTick] = useState(0);
  // the GPU engine is loaded ahead only after it has once loaded fine: a failed load (GPU memory full) can take the
  // window down with it, and loading again at every start would repeat that
  useEffect(() => { if (voicePrefs.on() && voicePrefs.engine() === "python" && store.get("voiceEngineOk") === "1") void invoke("voice_engine_warm", { python: voicePrefs.python() }).catch(() => store.remove("voiceEngineOk")); }, [prefsTick]);
  // turned off: everything goes at once, the recording, the answer being spoken and the GPU engine's memory
  useEffect(() => {
    if (!prefsTick || voicePrefs.on()) return;
    ++captureEpoch.current; capturePending.current = false;
    const r = rec.current;
    rec.current = null;
    if (r) { cancelAnimationFrame(r.raf); r.node.disconnect(); r.stream.getTracks().forEach((t) => t.stop()); void r.ctx.close(); }
    playing?.pause();
    awaitingCommand.current = 0;
    show("idle");
    void invoke("voice_engine_stop").catch(() => {});
  }, [prefsTick]);
  useEffect(() => { const f = () => setPrefsTick((n) => n + 1); window.addEventListener("luna-voice-prefs", f); return () => window.removeEventListener("luna-voice-prefs", f); }, []);
  useEffect(() => {
    // "Luna": on only when chosen, and never while a film plays (its sound would wake it)
    // also during a film: the film is turned down while Luna listens and answers
    if (!voicePrefs.on() || !voicePrefs.wake()) { setWakeLive(false); return; }
    let stream: MediaStream | null = null, ctx: AudioContext | null = null, node: ScriptProcessorNode | null = null, stopped = false;
    const pre: Float32Array[] = [];
    let seg: Float32Array[] | null = null, loud = 0, quiet = 0, segStart = 0;
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
        ctx = new AudioContext();
        const src = ctx.createMediaStreamSource(stream);
        node = ctx.createScriptProcessor(2048, 1, 1);
        const rate = ctx.sampleRate, blockMs = 2048 / rate * 1000;
        node.onaudioprocess = (e) => {
          const data = new Float32Array(e.inputBuffer.getChannelData(0));
          let sum = 0; for (const v of data) sum += v * v;
          const rms = Math.sqrt(sum / data.length);
          // busy (recording by key, understanding, answering, speaking): nothing is collected
          // while it thinks or speaks it still listens, but only for "Luna" (to start over, like Siri)
          const busy = !!rec.current || phaseRef.current === "hear" || understanding.current;
          if (busy) { seg = null; pre.length = 0; loud = 0; return; }
          // the bars follow the voice while Luna listens, and also while a "Luna, …" sentence is being spoken
          if (phaseRef.current === "listen" || seg) { const lvl = Math.min(1, rms * 12).toFixed(3); level.current?.style.setProperty("--lvl", lvl); document.documentElement.style.setProperty("--voice-lvl", lvl); }
          const speaking = rms > 0.02;
          if (!seg) {
            pre.push(data); if (pre.length > Math.ceil(400 / blockMs)) pre.shift();
            loud = speaking ? loud + blockMs : 0;
            if (loud >= 120) { seg = [...pre]; pre.length = 0; quiet = 0; segStart = Date.now(); setCapturing(true); }
            return;
          }
          seg.push(data);
          quiet = speaking ? 0 : quiet + blockMs;
          const long = Date.now() - segStart > 12000;
          // a short word followed by a pause is most likely the name alone: it is checked at once
          const len = Date.now() - segStart, waiting = awaitingCommand.current && Date.now() - awaitingCommand.current < 8000;
          if (quiet >= (!waiting && len < 1600 ? 450 : voicePrefs.silence()) || long) {
            const clip = seg; seg = null; loud = 0; setCapturing(false);
            if (Date.now() - segStart < 450) return;
            const after = awaitingCommand.current && Date.now() - awaitingCommand.current < 8000;
            awaitingCommand.current = 0;
            if (after) show("hear", extraText("Anlıyorum…", "Understanding…"));
            understanding.current = true;
            void understand(wav(clip, rate), after ? "after" : "name").finally(() => { understanding.current = false; });
          }
        };
        src.connect(node); node.connect(ctx.destination);
        setWakeLive(true);
      } catch { setWakeLive(false); }
    })();
    return () => { stopped = true; setWakeLive(false); setCapturing(false); node?.disconnect(); void ctx?.close(); stream?.getTracks().forEach((t) => t.stop()); };
  }, [paused, prefsTick]);
  const ducked = useRef<number | null>(null);
  const unduck = useRef(0);
  useEffect(() => {
    // not while only checking a sound for the wake word: the film's own voices would duck it every few seconds
    const active = phase === "listen" || phase === "hear" || phase === "think" || phase === "say";
    clearTimeout(unduck.current);
    if (active && ducked.current === null && !music.paused && music.volume > 0) { ducked.current = music.volume; void setProp("volume", Math.round(music.volume * 0.25)); }
    if (!active && ducked.current !== null) {
      // back up only once Luna has finished speaking, and after a short breath (a next step often follows at once)
      const back = () => { if (playing && !playing.paused && !playing.ended) { unduck.current = window.setTimeout(back, 400); return; } const v = ducked.current; ducked.current = null; if (v !== null) void setProp("volume", v); };
      unduck.current = window.setTimeout(back, 1500);
    }
  }, [phase, capturing]);
  useEffect(() => {
    // never stuck: a step that does not finish ends on its own
    if (phase === "hear" || phase === "think") { const stuck = window.setTimeout(() => show("note", extraText("Olmadı, tekrar dener misin?", "That didn't work, try again?"), 3000), 60000); return () => clearTimeout(stuck); }
  }, [phase]);
  useEffect(() => { document.body.classList.toggle("voice-wake", wakeLive); }, [wakeLive]);
  useEffect(() => { window.dispatchEvent(new CustomEvent("luna-voice-phase", { detail: { phase: phase === "idle" && capturing ? "listen" : phase, line } })); }, [phase, line, capturing]);
  useEffect(() => {
    document.body.classList.toggle("voice-on", phase !== "idle");
    if (phase === "idle") return;
    // with the assistant open the orb sits on its title dot; otherwise it takes the assistant bubble's place
    const place = () => {
      const dot = [...document.querySelectorAll<HTMLElement>(".chat-head .chat-dot, .ws-brand .chat-dot")].find((e) => e.getClientRects().length);
      const d = dot?.getBoundingClientRect();
      if (d && d.width) { setSpot({ left: Math.round(d.left + d.width / 2), top: Math.round(d.top + d.height / 2), docked: true }); return; }
      const r = document.querySelector<HTMLElement>(".ai-bubble")?.getBoundingClientRect();
      setSpot(r && r.width ? { right: Math.round(innerWidth - r.right), bottom: Math.round(innerHeight - r.bottom) } : null);
    };
    place();
    const again = window.setTimeout(place, 120);
    return () => clearTimeout(again);
  }, [phase]);
  // with the assistant open its composer shows the voice (bars and words): no second, floating mark over it
  if (phase === "idle" || spot?.docked) return null;
  return (
    <div className={"voice-mode voice-" + phase + (spot?.docked ? " voice-docked" : "")} role="status" aria-live="polite"
      style={spot?.docked ? { left: spot.left, top: spot.top } : spot ? { right: spot.right, bottom: spot.bottom } : undefined}>
      {line && <div className="voice-line">{line}</div>}
      <button className="voice-orb" ref={level as any} aria-label={extraText("Asistanı aç", "Open the assistant")} onClick={() => window.dispatchEvent(new Event("luna-voice-show"))}><span /><span /><span /></button>
    </div>
  );
}

/** Settings → Accounts and keys: the voice assistant. */
export function VoiceSettings() {
  const [on, setOn] = useState(voicePrefs.on);
  const [key, setKey] = useState(voicePrefs.key);
  const [voice, setVoice] = useState(voicePrefs.voice);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [wake, setWake] = useState(voicePrefs.wake);
  const [dev] = useState(developerSessionActive);
  const [engine, setEngine] = useState(() => store.get("voiceEngine") === "python" ? "python" : "whisper");
  const [python, setPython] = useState(voicePrefs.python);
  const [engineMsg, setEngineMsg] = useState("");
  const [silence, setSilence] = useState(voicePrefs.silence);
  const [st, setSt] = useState<WhisperStatus | null>(null);
  const [busy, setBusy] = useState("");
  const [tts, setTts] = useState(() => store.get("voiceTts") === "eleven" ? "eleven" : "edge");
  const [elevenKey, setElevenKey] = useState(() => store.get("elevenKey") ?? "");
  const [elevenVoice, setElevenVoice] = useState(() => store.get("elevenVoice") ?? "");
  const [elevenModel, setElevenModel] = useState(() => store.get("elevenModel") ?? "eleven_flash_v2_5");
  const [elevenVoices, setElevenVoices] = useState<[string, string][]>([]);
  const [elevenMsg, setElevenMsg] = useState("");
  const loadEleven = (k = elevenKey) => { if (!k.trim()) return; setElevenMsg("…"); void invoke<[string, string][]>("elevenlabs_voices", { key: k.trim() }).then((l) => { setElevenVoices(l); setElevenMsg(l.length ? "" : extraText("Hesapta ses yok", "No voices in the account")); }, (e) => setElevenMsg(/401/.test(String(e)) ? extraText("Anahtar geçersiz", "The key is not valid") : String(e).replace(/^Error: /, "").slice(0, 120))); };
  useEffect(() => { if (tts === "eleven") loadEleven(); }, [tts]);
  useEffect(() => { void loadVoices().then((l) => setVoices(l.filter((v) => /^(tr|en)-/.test(v.locale)))).catch(() => {}); void whisperStatus().then(setSt).catch(() => {}); }, []);
  const ready = !!(pickEngine(st) && pickModel(st));
  const install = async () => {
    const job = newJob();
    const off = await onJob(job, (e) => setBusy(e.pct != null ? `${Math.round(e.pct * (e.pct <= 1 ? 100 : 1))}%` : "…"));
    try {
      if (!pickEngine(st)) await getEngine(job, "cpu");
      if (!pickModel(st)) await getModel(job, "small");
      setSt(await whisperStatus());
      setBusy("");
    } catch (e) { setBusy(extraText("Kurulamadı: ", "Could not install: ") + String(e).replace(/^Error: /, "")); }
    finally { off(); }
  };
  return (
    <div className="set-card voice-settings">
      <label className="look-check"><input type="checkbox" checked={on} onChange={(e) => { setOn(e.target.checked); store.set("voiceOn", e.target.checked ? "1" : "0"); window.dispatchEvent(new Event("luna-voice-prefs")); }} />{extraText("Sesli asistan", "Voice assistant")}</label>
      <div className="set-hint">{extraText("Kısayolu basılı tut, konuş, bırak. Yazıya çevirme bu bilgisayarda Whisper ile yapılır; kısa sesli yanıt Microsoft'un doğal sesleriyle okunur (bunun için yanıt metni Microsoft'a gider). Şimdilik yalnız yerel modelle (LM Studio) çalışır.", "Hold the shortcut, speak, let go. Speech is turned into text on this PC with Whisper; the short spoken reply uses Microsoft's natural voices (the reply text goes to Microsoft for that). For now it works only with a local model (LM Studio).")}</div>
      <div className="set-hint">{extraText("Bu bölümdeki seçimler hemen kaydedilir; Kaydet'e basmana gerek yok.", "Choices here are kept at once; no need to press Save.")}</div>
      <div className="voice-settings-row"><span>{extraText("Kısayol (bas-konuş-bırak)", "Shortcut (push to talk)")}</span>
        <LunaSelect label={extraText("Kısayol", "Shortcut")} value={key} options={VOICE_KEYS} onChange={(v) => { setKey(v); store.set("voiceKey", v); }} /></div>
      <label className="look-check voice-settings-check"><input type="checkbox" checked={wake} onChange={(e) => { setWake(e.target.checked); store.set("voiceWake", e.target.checked ? "1" : "0"); window.dispatchEvent(new Event("luna-voice-prefs")); }} />{extraText("“Luna” deyince dinle", "Listen when I say “Luna”")}</label>
      <div className="set-hint">{extraText("Mikrofon açık kalır ve yalnız konuşma olduğunda bu bilgisayarda Whisper ile dinlenir; ses dışarı gönderilmez. “Luna, Sezen Aksu çal” ya da önce “Luna” deyip sonra isteğini söyle. Film oynarken dinlemez. Her konuşma işlemciyi biraz kullanır.", "The microphone stays on and only speech is checked, on this PC with Whisper; no audio leaves it. Say “Luna, play …” or “Luna” then your request. It does not listen while a film plays. Each bit of speech uses some CPU.")}</div>
      {wake && <div className="voice-settings-row"><span>{extraText("Sustuktan sonra bitir", "End after a pause of")}</span>
        <LunaSelect label={extraText("Sessizlik", "Pause")} value={String(silence)} options={[{ value: "800", label: "0,8 sn" }, { value: "1200", label: "1,2 sn" }, { value: "2000", label: "2 sn" }]} onChange={(v) => { setSilence(Number(v)); store.set("voiceSilence", v); }} /></div>}
      <div className="voice-settings-row"><span>{extraText("Ses servisi", "Voice service")}</span>
        <LunaSelect label={extraText("Ses servisi", "Voice service")} value={tts} options={[{ value: "edge", label: extraText("Microsoft (ücretsiz)", "Microsoft (free)") }, { value: "eleven", label: "ElevenLabs" }]} onChange={(v) => { setTts(v); store.set("voiceTts", v); }} /></div>
      {tts === "eleven" && <>
        <div className="set-hint">{extraText("Kendi ElevenLabs anahtarınla çalışır; her yanıt hesabındaki karakter hakkından düşer ve yanıt metni ElevenLabs'e gider. Bir sorun olursa (hak bitti, internet yok) Microsoft sesi okur.", "Uses your own ElevenLabs key; each reply counts against your account's characters and its text goes to ElevenLabs. If it fails (no credit, no network) the Microsoft voice reads it.")}</div>
        <div className="voice-settings-row"><span>{extraText("API anahtarı", "API key")}</span>
          <input className="voice-python" type="password" autoComplete="off" spellCheck={false} value={elevenKey} placeholder="xi-api-key" onChange={(e) => setElevenKey(e.target.value)} onBlur={() => { store.set("elevenKey", elevenKey.trim()); loadEleven(); }} /></div>
        <div className="voice-settings-row"><span>{extraText("ElevenLabs sesi", "ElevenLabs voice")}</span>
          <LunaSelect label={extraText("ElevenLabs sesi", "ElevenLabs voice")} value={elevenVoice} options={[{ value: "", label: elevenMsg || extraText("Bir ses seç", "Choose a voice") }, ...elevenVoices.map(([id, name]) => ({ value: id, label: name }))]} onChange={(v) => { setElevenVoice(v); store.set("elevenVoice", v); }} />
          <button className="chip" disabled={!elevenKey.trim()} onClick={() => loadEleven()}>{extraText("Yenile", "Refresh")}</button></div>
        <div className="voice-settings-row"><span>Model</span>
          <LunaSelect label="Model" value={elevenModel} options={[{ value: "eleven_flash_v2_5", label: extraText("Hızlı (Flash v2.5)", "Fast (Flash v2.5)") }, { value: "eleven_multilingual_v2", label: extraText("En doğal (Multilingual v2)", "Most natural (Multilingual v2)") }]} onChange={(v) => { setElevenModel(v); store.set("elevenModel", v); }} />
          <button className="chip" disabled={!elevenKey.trim() || !elevenVoice} onClick={() => void speak(extraText("Merhaba, ben Luna. Açıyorum.", "Hi, I'm Luna. Opening it."))}>{extraText("Dinle", "Listen")}</button></div>
      </>}
      {tts === "edge" && <div className="voice-settings-row"><span>{extraText("Yanıt sesi", "Reply voice")}</span>
        <LunaSelect label={extraText("Yanıt sesi", "Reply voice")} value={voice || ""} options={[{ value: "", label: extraText("Otomatik", "Automatic") }, ...voices.map((v) => ({ value: v.name, label: v.label || v.name }))]} onChange={(v) => { setVoice(v); store.set("voiceVoice", v); }} />
        <button className="chip" onClick={() => void speak(extraText("Merhaba, ben Luna. Açıyorum.", "Hi, I'm Luna. Opening it."))}>{extraText("Dinle", "Listen")}</button></div>}
      {dev && <div className="voice-settings-row"><span>{extraText("Yazıya çevirme motoru", "Speech-to-text engine")}</span>
        <LunaSelect label={extraText("Motor", "Engine")} value={engine} options={[{ value: "whisper", label: "Whisper (Luna)" }, { value: "python", label: extraText("Harici Python (ekran kartı)", "External Python (GPU)") }]} onChange={(v) => { setEngine(v); store.set("voiceEngine", v); window.dispatchEvent(new Event("luna-voice-prefs")); }} /></div>}
      {dev && engine === "python" && <div className="voice-settings-row"><span>python.exe</span>
        <input className="voice-python" value={python} placeholder={extraText("python.exe yolu (PyTorch ve modeli olan ortam)", "python.exe path (an environment with PyTorch and the model)")} onChange={(e) => setPython(e.target.value)} onBlur={() => { store.set("voicePython", python.trim()); window.dispatchEvent(new Event("luna-voice-prefs")); }} />
        <button className="chip" disabled={!python.trim() || engineMsg === "…"} onClick={() => { store.set("voicePython", python.trim()); setEngineMsg("…"); store.remove("voiceEngineOk"); void invoke("voice_engine_warm", { python: python.trim() }).then(() => { store.set("voiceEngineOk", "1"); setEngineMsg(extraText("Hazır", "Ready")); }, (e) => setEngineMsg(/OUT_OF_RESOURCES|out of memory/i.test(String(e)) ? extraText("Ekran kartı belleği yetmedi. LM Studio'da bağlamı küçült ya da modeli kaldır, sonra tekrar dene.", "Not enough GPU memory. Lower the context or unload the model in LM Studio, then try again.") : String(e).replace(/^Error: /, "").slice(0, 160))); }}>{engineMsg || extraText("Yükle ve dene", "Load and test")}</button></div>}
      <div className="voice-settings-row"><span>Whisper</span>
        {ready ? <b className="voice-ready">{extraText("Hazır (altyazı stüdyosuyla ortak)", "Ready (shared with the subtitle studio)")}</b>
          : <button className="chip" disabled={!!busy && busy !== "" && !busy.startsWith(extraText("Kurulamadı", "Could not"))} onClick={() => void install()}>{busy || extraText("Kur (~470 MB)", "Install (~470 MB)")}</button>}</div>
    </div>
  );
}
