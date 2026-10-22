import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { tt } from "./i18n";
import { mpv, MpvState, setProp } from "./mpv";
import { pauseMusic, useMusic } from "./Music";
import { parseSponsorSegments, segmentToSkip, sleepFadeVolume, SponsorSegment, sponsorUrl, youtubeId } from "./playbackExtrasModel";
import { presenceActivity, scrobbleDue, scrobbleTrack, traktTarget } from "./scrobbleModel";
import { traktOn, traktScrobble } from "./trakt";
import { store, Item } from "./library";
import { flushScrobbles, scrobbleListen, scrobbleNow, scrobbleOn } from "./scrobble";
import { applySound, loadSponsor, resetAbLoop, setSleep, setSponsorNow, sleep, sleepTick, SPONSOR_COLORS, sponsorLabel, useExtras } from "./PlaybackExtras";

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Everything the playback extras do while something plays, for films and music alike: the right
 *  sound profile, SponsorBlock on YouTube links, the music sleep timer and scrobbling. Renders only
 *  the small SponsorBlock note. Mounted once, next to the player. */
export function PlaybackRuntime({ s, film, item }: { s: MpvState; film: boolean; item?: Item | null }) {
  useExtras();
  const m = useMusic();
  const c = m.now;
  const music = !film && !!c && !!s.path && (s.path === c.src || (!!c.yt && /googlevideo\.com/i.test(s.path)));
  const mode = film ? "film" : music ? "music" : null;

  // ---- sound: each new file gets its part's profile (mpv may have restarted in between); a loop belongs to its file
  useEffect(() => {
    if (!s.path || !mode) return;
    void applySound(mode, true);
    resetAbLoop();
  }, [s.path, mode]);

  // ---- SponsorBlock (YouTube only; only 4 hex digits of the video's hash are sent)
  const vid = film ? youtubeId(s.path) : music && c ? youtubeId(c.src) : null;
  const sponsorSet = loadSponsor();
  const sponsorKey = sponsorSet.on ? sponsorSet.cats.join(",") : "";
  const [segs, setSegs] = useState<SponsorSegment[]>([]);
  const done = useRef<string[]>([]);
  const [note, setNote] = useState<{ seg: SponsorSegment; skipped: boolean } | null>(null);
  const hide = useRef(0);
  useEffect(() => {
    setSegs([]); setNote(null); done.current = [];
    if (!vid || !sponsorKey) return;
    let alive = true;
    const cats = sponsorKey.split(",");
    (async () => {
      const url = await sha256Hex(vid).then((h) => sponsorUrl(h, cats))
        .catch(() => "https://sponsor.ajay.app/api/skipSegments?videoID=" + encodeURIComponent(vid) + "&categories=" + encodeURIComponent(JSON.stringify(cats)));
      // no segments: the server answers 404, which is simply "nothing to skip"
      const text = await invoke<string>("http_text", { url }).catch(() => "[]");
      if (!alive) return;
      let json: unknown = [];
      try { json = JSON.parse(text); } catch { /* not JSON: nothing to skip */ }
      setSegs(parseSponsorSegments(json, vid, cats));
    })();
    return () => { alive = false; };
  }, [vid, sponsorKey]);
  useEffect(() => { setSponsorNow(segs); }, [segs]);
  useEffect(() => () => setSponsorNow([]), []);
  useEffect(() => {
    if (!segs.length || !mode) return;
    const seg = segmentToSkip(segs, s.time, done.current);
    if (!seg) {
      if (note && !note.skipped && (s.time < note.seg.start || s.time >= note.seg.end)) setNote(null);
      return;
    }
    if (loadSponsor().auto) {
      done.current = [...done.current, seg.uuid];
      void mpv("seek", seg.end, "absolute");
      show({ seg, skipped: true });
    } else if (note?.seg.uuid !== seg.uuid) show({ seg, skipped: false });
  }, [Math.floor(s.time * 4), segs]);
  function show(n: { seg: SponsorSegment; skipped: boolean }) {
    setNote(n);
    clearTimeout(hide.current);
    hide.current = window.setTimeout(() => setNote(null), n.skipped ? 6000 : 15000);
  }
  useEffect(() => () => clearTimeout(hide.current), []);

  // ---- music sleep timer: a fade in the last seconds, then the music pauses and the volume comes back
  const vol = useRef(s.volume); vol.current = s.volume;
  const baseVol = useRef<number | null>(null);
  const finishSleep = () => {
    pauseMusic(true);
    if (baseVol.current != null) setProp("volume", baseVol.current);
    baseVol.current = null;
    setSleep("off");
  };
  useEffect(() => {
    if (sleep.deadline == null) return;
    const id = window.setInterval(() => {
      sleepTick();
      const left = (sleep.deadline! - Date.now()) / 1000;
      if (left < 20 && music) {
        if (baseVol.current == null) baseVol.current = vol.current;
        setProp("volume", sleepFadeVolume(baseVol.current, left));
      }
      if (left <= 0) finishSleep();
    }, 1000);
    return () => clearInterval(id);
  }, [sleep.deadline, music]);
  // "when this song ends": a 10-second fade at its end, then pause (before the next one starts)
  useEffect(() => {
    if (sleep.choice !== "song" || !music || !(s.duration > 0)) return;
    const left = s.duration - s.time;
    if (left < 10) {
      if (baseVol.current == null) baseVol.current = vol.current;
      setProp("volume", sleepFadeVolume(baseVol.current, left, 10));
    }
    if (left <= 0.6) finishSleep();
  }, [Math.floor(s.time * 2), sleep.choice, music]);

  // ---- scrobbling: "now playing" after a few seconds, a listen after half the song or 4 minutes
  const play = useRef<{ id: string; played: number; last: number; sent: boolean; now: boolean } | null>(null);
  useEffect(() => {
    if (!music || !c || !scrobbleOn()) return;
    const id = c.src + "#" + m.index;
    let p = play.current;
    // a new song, or the same one again from the start (repeat one)
    if (!p || p.id !== id || (p.sent && s.time + 5 < p.last)) { p = play.current = { id, played: 0, last: s.time, sent: false, now: false }; return; }
    const d = s.time - p.last;
    p.last = s.time;
    if (!s.paused && d > 0 && d < 2.5) p.played += d;
    const t = scrobbleTrack(c);
    if (!t) return;
    if (!p.now && p.played > 3) { p.now = true; void scrobbleNow(t); }
    const dur = s.duration > 0 ? s.duration : c.duration ?? 0;
    if (!p.sent && scrobbleDue(p.played, dur)) {
      p.sent = true;
      void scrobbleListen({ ...t, duration: t.duration ?? Math.round(dur) }, Date.now() - p.played * 1000);
    }
  }, [Math.floor(s.time), music, c?.src, m.index, s.paused]);
  // listens that waited (offline): another try every ten minutes
  useEffect(() => { const id = window.setInterval(() => { if (scrobbleOn()) void flushScrobbles(); }, 600000); return () => clearInterval(id); }, []);

  // ---- Trakt: start / pause while a film or episode plays, stop (watched past 80 %) when it changes or ends
  const tk = useRef<{ key: string; t: NonNullable<ReturnType<typeof traktTarget>>; state: "start" | "pause" | null; pct: number } | null>(null);
  useEffect(() => {
    const t = film && traktOn() ? traktTarget(item, s.path) : null;
    const key = t ? JSON.stringify(t) : "";
    const cur = tk.current;
    if (cur && cur.key !== key) { void traktScrobble("stop", cur.t, cur.pct); tk.current = null; }
    if (!t || !(s.duration > 0)) return;
    const pct = Math.min(100, (s.time / s.duration) * 100);
    if (!tk.current) tk.current = { key, t, state: null, pct };
    tk.current.pct = pct;
    const want = s.paused || s.eof ? "pause" : "start";
    if (s.eof && tk.current.state !== null) { void traktScrobble("stop", t, 100); tk.current.state = null; return; }
    if (tk.current.state !== want && (want === "pause" ? tk.current.state === "start" : pct > 0.3)) { tk.current.state = want; void traktScrobble(want, t, pct); }
  }, [film, s.path, s.paused, s.eof, Math.floor(s.time / 20), item?.key]);
  // Luna closes: what was playing stops at its last point
  useEffect(() => { const f = () => { const c = tk.current; if (c) void traktScrobble("stop", c.t, c.pct); }; window.addEventListener("beforeunload", f); return () => window.removeEventListener("beforeunload", f); }, []);

  // ---- Discord: what plays shows on the user's profile (their own application id; off unless switched on)
  const presence = useRef("");
  const dTitle = mode === "film" ? (item?.meta?.title ?? s.title) : mode === "music" && c ? c.title : "";
  useEffect(() => {
    const id = (store.get("discordId") ?? "").trim();
    const on = !!id && store.get("discordOn") === "1";
    const act = on && mode && dTitle ? presenceActivity({ mode, title: dTitle, artist: c?.artist, paused: s.paused, time: s.time, duration: s.duration, now: Date.now(),
      labels: { film: tt("Film izliyor"), music: tt("Müzik dinliyor"), paused: tt("Duraklatıldı") } }) : null;
    const key = act ? [act.details, act.state, s.paused, Math.round((act.timestamps?.end ?? 0) / 15000)].join("|") : "";
    if (key === presence.current || (!key && !presence.current)) return;
    presence.current = key;
    if (!id) return;
    invoke("discord_presence", { clientId: id, activity: act }).then(() => store.set("discordStatus", JSON.stringify({ ok: true, at: Date.now(), msg: act ? act.details : "" })))
      .catch((e) => store.set("discordStatus", JSON.stringify({ ok: false, at: Date.now(), msg: String(e) })));
  }, [mode, dTitle, s.paused, Math.floor(s.time / 15)]);

  if (!note || !mode) return null;
  const label = sponsorLabel(note.seg.category);
  return createPortal(
    <div className={"lx-toast" + (film ? " film" : "")} role="status" key={note.seg.uuid + String(note.skipped)}>
      <span className="lx-dot" style={{ background: SPONSOR_COLORS[note.seg.category] ?? "#2fbf71" }} />
      <span className="lx-toast-t">{note.skipped ? tt("{0} atlandı", label) : label}</span>
      {note.skipped
        ? <button className="chip" onClick={() => { void mpv("seek", note.seg.start, "absolute"); setNote(null); }}>{tt("Geri al")}</button>
        : <button className="chip" onClick={() => { done.current = [...done.current, note.seg.uuid]; void mpv("seek", note.seg.end, "absolute"); setNote(null); }}>{tt("Atla")}</button>}
      <button className="lx-x" aria-label={tt("Kapat")} onClick={() => { done.current = [...done.current, note.seg.uuid]; setNote(null); }}>×</button>
      <span className="lx-credit">SponsorBlock</span>
      <i className="lx-toast-bar" style={{ animationDuration: (note.skipped ? 6000 : 15000) + "ms" }} />
    </div>,
    document.body,
  );
}
