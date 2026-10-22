import { invoke } from "./nativeCore";
import { store } from "./library";
import { lastfmSignature, listenBrainzBody, ScrobbleTrack } from "./scrobbleModel";

/** Scrobbling to ListenBrainz (or a ListenBrainz-compatible server) and Last.fm. The token, the Last.fm
 *  key, secret and session live in Windows' credential store (see SECRET_KEYS in library.ts).
 *  A listen that could not be sent waits in a small queue and is sent with the next one. */
type Svc = "lb" | "lf";
type Pending = { svc: Svc; t: ScrobbleTrack; at: number };
const QUEUE = "scrobbleQueue";
const LASTFM = "https://ws.audioscrobbler.com/2.0/";

export const lbBase = () => (store.get("listenbrainzUrl") || "https://api.listenbrainz.org").trim().replace(/\/+$/, "");
const lbOn = () => !!store.get("listenbrainzToken");
const lfOn = () => !!(store.get("lastfmKey") && store.get("lastfmSecret") && store.get("lastfmSession"));
export const scrobbleOn = () => lbOn() || lfOn();

export type SvcStatus = { ok: boolean; at: number; msg: string };
export const scrobbleStatus = (svc: Svc): SvcStatus | null => store.json<any>("scrobbleStatus", {})?.[svc] ?? null;
function note(svc: Svc, ok: boolean, msg: string) {
  const all = store.json<Record<string, SvcStatus>>("scrobbleStatus", {});
  all[svc] = { ok, at: Date.now(), msg: msg.slice(0, 200) };
  store.set("scrobbleStatus", JSON.stringify(all));
}

/** One request. In Luna it goes through the native side (no CORS limits, https only); in the browser preview it is a plain fetch. */
export async function sendRaw(method: "GET" | "POST", url: string, contentType: string, body: string, auth?: string, extra: [string, string][] = []): Promise<{ status: number; text: string }> {
  if ((window as any).__TAURI_INTERNALS__) {
    const [status, text] = await invoke<[number, string]>("http_send", { method, url, auth: auth ?? null, contentType, body, extra: extra.length ? extra : null });
    return { status, text };
  }
  const r = await fetch(url, { method, headers: { ...(method === "POST" ? { "Content-Type": contentType } : {}), ...(auth ? { Authorization: auth } : {}), ...Object.fromEntries(extra) }, ...(method === "POST" ? { body } : {}), signal: AbortSignal.timeout(15000) });
  return { status: r.status, text: await r.text() };
}
const json = (t: string): any => { try { return JSON.parse(t); } catch { return {}; } };
const okStatus = (n: number) => n >= 200 && n < 300;

async function lbPost(path: string, body: unknown) {
  const r = await sendRaw("POST", lbBase() + path, "application/json", JSON.stringify(body), "Token " + (store.get("listenbrainzToken") ?? ""));
  if (!okStatus(r.status)) throw new Error("ListenBrainz " + r.status + " " + String(json(r.text).error ?? r.text).slice(0, 120));
}
/** Checks a ListenBrainz token; the user name when it is valid. */
export async function lbValidate(token: string, base = lbBase()): Promise<string> {
  const r = await sendRaw("GET", base.replace(/\/+$/, "") + "/1/validate-token", "", "", "Token " + token.trim());
  const j = json(r.text);
  if (okStatus(r.status) && j.valid) return String(j.user_name ?? "");
  throw new Error(String(j.message ?? "ListenBrainz " + r.status));
}

async function lfCall(params: Record<string, string>, withSession = true): Promise<any> {
  // the secret signs the call but is never sent
  const { secret: given, ...rest } = params;
  const secret = given ?? store.get("lastfmSecret") ?? "";
  const p: Record<string, string> = { ...rest, api_key: rest.api_key ?? store.get("lastfmKey") ?? "" };
  if (withSession && !p.sk) p.sk = store.get("lastfmSession") ?? "";
  p.api_sig = lastfmSignature(p, secret);
  p.format = "json";
  const r = await sendRaw("POST", LASTFM, "application/x-www-form-urlencoded", new URLSearchParams(p).toString());
  const j = json(r.text);
  if (!okStatus(r.status) || j.error) throw new Error("Last.fm " + (j.message || r.status));
  return j;
}
/** Last.fm sign-in with the user's own API key and secret: the session key is kept, the password is not. */
export async function lastfmLogin(user: string, password: string, key: string, secret: string): Promise<string> {
  const j = await lfCall({ method: "auth.getMobileSession", username: user.trim(), password, api_key: key.trim(), secret: secret.trim() }, false);
  const sk = String(j?.session?.key ?? "");
  if (!sk) throw new Error("Last.fm: no session");
  return sk;
}

const trackParams = (t: ScrobbleTrack): Record<string, string> => ({
  artist: t.artist, track: t.title, ...(t.album ? { album: t.album } : {}), ...(t.duration ? { duration: String(t.duration) } : {}),
});

/** "Now playing" (best effort: nothing is queued when it fails). */
export async function scrobbleNow(t: ScrobbleTrack) {
  if (lbOn()) await lbPost("/1/submit-listens", listenBrainzBody("playing_now", t, Date.now())).catch(() => {});
  if (lfOn()) await lfCall({ method: "track.updateNowPlaying", ...trackParams(t) }).catch(() => {});
}

async function sendOne(p: Pending) {
  if (p.svc === "lb") await lbPost("/1/submit-listens", listenBrainzBody("single", p.t, p.at));
  else await lfCall({ method: "track.scrobble", ...trackParams(p.t), timestamp: String(Math.floor(p.at / 1000)) });
}
const queue = (): Pending[] => { const q = store.json<Pending[]>(QUEUE, []); return Array.isArray(q) ? q : []; };
const saveQueue = (q: Pending[]) => store.set(QUEUE, JSON.stringify(q.slice(-200)));

/** A finished listen: sent to every connected service; what fails waits for the next try. */
export async function scrobbleListen(t: ScrobbleTrack, at: number) {
  const jobs: Pending[] = [];
  if (lbOn()) jobs.push({ svc: "lb", t, at });
  if (lfOn()) jobs.push({ svc: "lf", t, at });
  const failed: Pending[] = [];
  for (const j of jobs) {
    try { await sendOne(j); note(j.svc, true, t.artist + " – " + t.title); }
    catch (e) { failed.push(j); note(j.svc, false, String((e as Error)?.message ?? e)); }
  }
  if (failed.length) saveQueue([...queue(), ...failed]);
  else if (jobs.length) await flushScrobbles();
}
let flushing = false;
/** Sends what is waiting, oldest first; stops at the first failure (still offline). */
export async function flushScrobbles() {
  if (flushing) return;
  flushing = true;
  try {
    let q = queue();
    while (q.length) {
      const p = q[0];
      if ((p.svc === "lb" && !lbOn()) || (p.svc === "lf" && !lfOn())) { q = q.slice(1); continue; }
      try { await sendOne(p); q = q.slice(1); saveQueue(q); } catch { break; }
    }
    saveQueue(q);
  } finally { flushing = false; }
}
export const pendingScrobbles = () => queue().length;
