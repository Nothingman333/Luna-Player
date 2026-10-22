import { store } from "./library";
import { sendRaw } from "./scrobble";
import { traktBody, TraktTarget } from "./scrobbleModel";

/** Trakt: films and episodes are marked as being watched while they play and as watched past 80 %.
 *  The user registers their own Trakt app (client id + secret) and signs in with a code on trakt.tv
 *  (device flow); the tokens live in Windows' credential store. */
const API = "https://api.trakt.tv";
const OOB = "urn:ietf:wg:oauth:2.0:oob";
const json = (t: string): any => { try { return JSON.parse(t); } catch { return {}; } };
const head = (id = store.get("traktClientId") ?? ""): [string, string][] => [["trakt-api-key", id], ["trakt-api-version", "2"]];
export const traktOn = () => !!(store.get("traktClientId") && store.get("traktToken"));
export type TraktStatus = { ok: boolean; at: number; msg: string };
export const traktStatus = (): TraktStatus | null => store.json<TraktStatus | null>("traktStatus", null);
const note = (ok: boolean, msg: string) => store.set("traktStatus", JSON.stringify({ ok, at: Date.now(), msg: msg.slice(0, 200) }));

const post = (path: string, body: unknown, auth?: string, id?: string) => sendRaw("POST", API + path, "application/json", JSON.stringify(body), auth, head(id));

export type DeviceCode = { device_code: string; user_code: string; verification_url: string; expires_in: number; interval: number };
/** Step 1 of signing in: a short code the user types on trakt.tv/activate. */
export async function traktDeviceCode(clientId: string): Promise<DeviceCode> {
  const r = await post("/oauth/device/code", { client_id: clientId.trim() }, undefined, clientId.trim());
  const j = json(r.text);
  if (r.status !== 200 || !j.user_code) throw new Error("Trakt " + r.status);
  return j;
}
function keepTokens(j: any) {
  store.set("traktToken", String(j.access_token)); store.set("traktRefresh", String(j.refresh_token ?? ""));
  store.set("traktExpires", String((Number(j.created_at) || Math.floor(Date.now() / 1000)) + (Number(j.expires_in) || 86400)));
}
/** Step 2: asks whether the code was entered. "pending" until then. */
export async function traktPoll(code: string, clientId: string, secret: string): Promise<"ok" | "pending" | "slow" | "expired" | "denied" | "error"> {
  const r = await post("/oauth/device/token", { code, client_id: clientId.trim(), client_secret: secret.trim() }, undefined, clientId.trim());
  if (r.status === 200) {
    store.set("traktClientId", clientId.trim()); store.set("traktSecret", secret.trim());
    keepTokens(json(r.text));
    const me = await sendRaw("GET", API + "/users/settings", "", "", "Bearer " + store.get("traktToken"), head()).catch(() => null);
    if (me && me.status === 200) store.set("traktUser", String(json(me.text)?.user?.username ?? ""));
    return "ok";
  }
  return r.status === 400 ? "pending" : r.status === 429 ? "slow" : r.status === 410 ? "expired" : r.status === 418 ? "denied" : "error";
}
/** A fresh token (refreshed a day before it runs out). */
async function token(): Promise<string> {
  const exp = Number(store.get("traktExpires") ?? 0);
  if (exp && exp - Date.now() / 1000 < 86400 && store.get("traktRefresh")) {
    const r = await post("/oauth/token", { refresh_token: store.get("traktRefresh"), client_id: store.get("traktClientId"), client_secret: store.get("traktSecret"), redirect_uri: OOB, grant_type: "refresh_token" });
    if (r.status === 200) keepTokens(json(r.text));
  }
  return store.get("traktToken") ?? "";
}
export function traktSignOut() { store.set("traktToken", ""); store.set("traktRefresh", ""); store.remove("traktExpires"); store.remove("traktUser"); }

/** start / pause / stop for what plays now; failures are noted, never thrown into the player. */
export async function traktScrobble(action: "start" | "pause" | "stop", t: TraktTarget, progress: number) {
  if (!traktOn()) return;
  try {
    const r = await post("/scrobble/" + action, traktBody(t, progress), "Bearer " + (await token()));
    if (r.status === 201 || r.status === 200) note(true, action === "stop" && progress >= 80 ? "✓ " + (json(r.text)?.movie?.title ?? json(r.text)?.episode?.title ?? "") : action);
    else if (r.status !== 409) note(false, "Trakt " + r.status);
  } catch (e) { note(false, String((e as Error)?.message ?? e)); }
}
