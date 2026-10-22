import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { tt } from "./i18n";
import { flushSecrets, store } from "./library";
import { Switch } from "./FilmReviewAi";
import { addUserCommand, loadUserCommands, saveUserCommands } from "./assistantExtras";
import { loadSponsor, saveSponsor, sponsorLabel, useExtras } from "./PlaybackExtras";
import { SPONSOR_CATEGORIES } from "./playbackExtrasModel";
import { flushScrobbles, lastfmLogin, lbBase, lbValidate, pendingScrobbles, scrobbleStatus } from "./scrobble";
import { DeviceCode, traktDeviceCode, traktOn, traktPoll, traktSignOut, traktStatus } from "./trakt";
import { SPONSOR_COLORS } from "./PlaybackExtras";
import "./ExtrasPlus.css";

/** A secret field: hidden like a password; saved straight to Windows' credential store by its owner. */
function Secret({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder: string; label: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="set-key-in">
      <input type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label} spellCheck={false} autoComplete="off" />
      <button className="set-eye" onClick={() => setShow((s) => !s)} aria-label={show ? tt("Gizle") : tt("Göster")}>{show ? tt("Gizle") : tt("Göster")}</button>
    </div>
  );
}

const when = (at: number) => new Date(at).toLocaleString();

function SponsorCard() {
  useExtras();
  const s = loadSponsor();
  const toggle = (c: string) => saveSponsor({ ...s, cats: s.cats.includes(c) ? s.cats.filter((x) => x !== c) : [...s.cats, c] });
  return (
    <div className="set-card lx-set">
      <h3>SponsorBlock</h3>
      <div className="set-row-switch"><div><b>{tt("YouTube bağlantılarında topluluğun işaretlediği bölümleri atla")}</b>
        <span>{tt("Yalnızca YouTube adresleri için. Sunucuya videonun kimliği değil, kimliğinin özetinin ilk 4 hanesi gider.")}</span></div>
        <Switch on={s.on} onChange={(on) => saveSponsor({ ...s, on })} label={tt("SponsorBlock")} /></div>
      {s.on && <>
        <div className="set-row-switch"><div><b>{tt("Kendiliğinden atla")}</b><span>{tt("Kapalıysa bölüm başlayınca “Atla” düğmesi çıkar.")}</span></div>
          <Switch on={s.auto} onChange={(auto) => saveSponsor({ ...s, auto })} label={tt("Kendiliğinden atla")} /></div>
        <div className="lx-set-cats">
          {SPONSOR_CATEGORIES.map((c) => (
            <label key={c} className="look-check"><input type="checkbox" checked={s.cats.includes(c)} onChange={() => toggle(c)} /><i style={{ background: SPONSOR_COLORS[c] }} />{sponsorLabel(c)}</label>
          ))}
        </div>
      </>}
      <div className="set-hint">{tt("Veriler SponsorBlock topluluğundan (sponsor.ajay.app). Atlanan bölümde “Geri al” düğmesi çıkar.")}</div>
    </div>
  );
}

function ListenBrainzCard() {
  const [token, setToken] = useState(store.get("listenbrainzToken") ?? "");
  const [url, setUrl] = useState(store.get("listenbrainzUrl") ?? "");
  const [user, setUser] = useState(store.get("listenbrainzUser") ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const st = scrobbleStatus("lb");
  const connect = async () => {
    setBusy(true); setMsg(null);
    try {
      const u = await lbValidate(token, (url.trim() || "https://api.listenbrainz.org"));
      store.set("listenbrainzToken", token.trim()); store.set("listenbrainzUrl", url.trim()); store.set("listenbrainzUser", u);
      await flushSecrets();
      setUser(u); setMsg({ ok: true, t: tt("Bağlandı: {0}", u) }); void flushScrobbles();
    } catch (e) { setMsg({ ok: false, t: String((e as Error)?.message ?? e) }); } finally { setBusy(false); }
  };
  const leave = async () => { store.set("listenbrainzToken", ""); store.remove("listenbrainzUser"); await flushSecrets().catch(() => {}); setToken(""); setUser(""); setMsg(null); };
  return (
    <div className="set-card lx-set">
      <h3>ListenBrainz</h3>
      <div className="set-hint">{tt("Dinlediğin şarkılar listenbrainz.org hesabına yazılır. Kullanıcı belirtecini (user token) hesap ayarlarından al. Radyo, podcast ve sesli kitaplar gönderilmez.")}</div>
      <Secret value={token} onChange={setToken} placeholder={tt("Kullanıcı belirteci")} label={tt("ListenBrainz kullanıcı belirteci")} />
      <label>{tt("Sunucu (isteğe bağlı, kendi sunucun varsa)")}<input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={lbBase()} spellCheck={false} /></label>
      <div className="lx-set-row">
        <button className="chip" onClick={connect} disabled={busy || !token.trim()}>{busy ? tt("Deneniyor…") : tt("Bağlan ve dene")}</button>
        {user && <button className="chip" onClick={leave}>{tt("Bağlantıyı kes")}</button>}
        {user && !msg && <span className="lx-set-ok">{tt("Bağlı: {0}", user)}</span>}
        {msg && <span className={msg.ok ? "lx-set-ok" : "lx-set-bad"}>{msg.t}</span>}
      </div>
      {st && <div className="set-hint">{st.ok ? tt("Son gönderim: {0} · {1}", when(st.at), st.msg) : tt("Son deneme başarısız ({0}): {1}", when(st.at), st.msg)}</div>}
    </div>
  );
}

function LastfmCard() {
  const [key, setKey] = useState(store.get("lastfmKey") ?? "");
  const [secret, setSecret] = useState(store.get("lastfmSecret") ?? "");
  const [user, setUser] = useState(store.get("lastfmUser") ?? "");
  const [pass, setPass] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const connected = !!store.get("lastfmSession");
  const st = scrobbleStatus("lf");
  const connect = async () => {
    setBusy(true); setMsg(null);
    try {
      const sk = await lastfmLogin(user, pass, key, secret);
      store.set("lastfmKey", key.trim()); store.set("lastfmSecret", secret.trim()); store.set("lastfmSession", sk); store.set("lastfmUser", user.trim());
      await flushSecrets();
      setPass(""); setMsg({ ok: true, t: tt("Bağlandı: {0}", user.trim()) }); void flushScrobbles();
    } catch (e) { setMsg({ ok: false, t: String((e as Error)?.message ?? e) }); } finally { setBusy(false); }
  };
  const leave = async () => { store.set("lastfmSession", ""); await flushSecrets().catch(() => {}); setMsg(null); };
  return (
    <div className="set-card lx-set">
      <h3>Last.fm</h3>
      <div className="set-hint">{tt("Last.fm kendi API anahtarını ister: last.fm/api/account/create sayfasından ücretsiz bir uygulama oluştur. Parolan saklanmaz; yalnızca bağlanırken bir kez gönderilir ve yerine oturum anahtarı kaydedilir.")}</div>
      <Secret value={key} onChange={setKey} placeholder={tt("API anahtarı")} label={tt("Last.fm API anahtarı")} />
      <Secret value={secret} onChange={setSecret} placeholder={tt("Paylaşılan gizli anahtar (shared secret)")} label={tt("Last.fm gizli anahtarı")} />
      <div className="lx-set-row">
        <input value={user} onChange={(e) => setUser(e.target.value)} placeholder={tt("Kullanıcı adı")} aria-label={tt("Last.fm kullanıcı adı")} spellCheck={false} />
        <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder={tt("Parola")} aria-label={tt("Last.fm parolası")} autoComplete="off" />
      </div>
      <div className="lx-set-row">
        <button className="chip" onClick={connect} disabled={busy || !key.trim() || !secret.trim() || !user.trim() || !pass}>{busy ? tt("Deneniyor…") : tt("Bağlan")}</button>
        {connected && <button className="chip" onClick={leave}>{tt("Bağlantıyı kes")}</button>}
        {connected && !msg && <span className="lx-set-ok">{tt("Bağlı: {0}", user)}</span>}
        {msg && <span className={msg.ok ? "lx-set-ok" : "lx-set-bad"}>{msg.t}</span>}
      </div>
      {st && <div className="set-hint">{st.ok ? tt("Son gönderim: {0} · {1}", when(st.at), st.msg) : tt("Son deneme başarısız ({0}): {1}", when(st.at), st.msg)}</div>}
    </div>
  );
}

function TraktCard() {
  const [id, setId] = useState(store.get("traktClientId") ?? "");
  const [secret, setSecret] = useState(store.get("traktSecret") ?? "");
  const [code, setCode] = useState<DeviceCode | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [, redraw] = useState(0);
  const stop = useRef(false);
  useEffect(() => () => { stop.current = true; }, []);
  const connect = async () => {
    setMsg(null); stop.current = false;
    let dc: DeviceCode;
    try { dc = await traktDeviceCode(id); } catch (e) { setMsg({ ok: false, t: String((e as Error)?.message ?? e) }); return; }
    setCode(dc); void openUrl(dc.verification_url).catch(() => {});
    const until = Date.now() + dc.expires_in * 1000;
    let wait = Math.max(5, dc.interval) * 1000;
    while (!stop.current && Date.now() < until) {
      await new Promise((r) => setTimeout(r, wait));
      if (stop.current) return;
      const st = await traktPoll(dc.device_code, id, secret).catch(() => "error" as const);
      if (st === "ok") { await flushSecrets().catch(() => {}); setCode(null); setMsg({ ok: true, t: tt("Bağlandı: {0}", store.get("traktUser") ?? "Trakt") }); return; }
      if (st === "slow") wait += 1000;
      if (st === "denied" || st === "expired" || st === "error") break;
    }
    setCode(null);
    if (!stop.current) setMsg({ ok: false, t: tt("Kod onaylanmadı ya da süresi doldu. Yeniden dene.") });
  };
  const st = traktStatus();
  const on = traktOn();
  return (
    <div className="set-card lx-set">
      <h3>Trakt {on && <span className="lx-state ok">{tt("Bağlı: {0}", store.get("traktUser") || "Trakt")}</span>}</h3>
      <div className="set-hint">{tt("İzlediğin filmler ve bölümler oynarken Trakt'ta “izleniyor” görünür; %80'i geçince izlendi olarak işaretlenir. trakt.tv/oauth/applications sayfasında bir uygulama oluştur (yönlendirme adresi: urn:ietf:wg:oauth:2.0:oob) ve kimliği ile gizli anahtarını buraya yaz.")}</div>
      {!on && <>
        <Secret value={id} onChange={setId} placeholder={tt("Client ID")} label={tt("Trakt Client ID")} />
        <Secret value={secret} onChange={setSecret} placeholder={tt("Client Secret")} label={tt("Trakt Client Secret")} />
      </>}
      {code && (
        <div className="lx-set-row">
          <span>{tt("trakt.tv/activate sayfasına bu kodu yaz:")}</span><span className="lx-code">{code.user_code}</span>
          <button className="chip" onClick={() => void openUrl(code.verification_url)}>{tt("Sayfayı aç ↗")}</button>
          <button className="chip" onClick={() => { stop.current = true; setCode(null); }}>{tt("Vazgeç")}</button>
        </div>
      )}
      <div className="lx-set-row">
        {!on && !code && <button className="chip" disabled={!id.trim() || !secret.trim()} onClick={() => void connect()}>{tt("Bağlan")}</button>}
        {on && <button className="chip" onClick={async () => { traktSignOut(); await flushSecrets().catch(() => {}); setMsg(null); redraw((n) => n + 1); }}>{tt("Bağlantıyı kes")}</button>}
        {msg && <span className={msg.ok ? "lx-set-ok" : "lx-set-bad"}>{msg.t}</span>}
      </div>
      {st && <div className="set-hint">{st.ok ? tt("Son gönderim: {0} · {1}", when(st.at), st.msg) : tt("Son deneme başarısız ({0}): {1}", when(st.at), st.msg)}</div>}
    </div>
  );
}

function DiscordCard() {
  const [id, setId] = useState(store.get("discordId") ?? "");
  const [on, setOn] = useState(store.get("discordOn") === "1");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const save = (nextId: string, nextOn: boolean) => { store.set("discordId", nextId.trim()); store.set("discordOn", nextOn ? "1" : "0"); };
  const test = async () => {
    setMsg(null);
    try {
      await invoke("discord_presence", { clientId: id.trim(), activity: { details: "Luna Player", state: tt("Bağlantı denemesi"), assets: { large_image: "luna", large_text: "Luna Player" } } });
      setMsg({ ok: true, t: tt("Discord'da görünüyor. Birkaç saniye sonra kaybolur.") });
      window.setTimeout(() => void invoke("discord_presence", { clientId: id.trim(), activity: null }).catch(() => {}), 8000);
    } catch (e) { setMsg({ ok: false, t: String(e) }); }
  };
  const st = store.json<{ ok: boolean; at: number; msg: string } | null>("discordStatus", null);
  return (
    <div className="set-card lx-set">
      <h3>Discord</h3>
      <div className="set-row-switch"><div><b>{tt("Ne izlediğimi ve dinlediğimi Discord'da göster")}</b>
        <span>{tt("Bilgi yalnızca bu bilgisayardaki Discord uygulamasına gider. discord.com/developers/applications sayfasında “Luna Player” adlı bir uygulama oluştur, Application ID'sini buraya yapıştır; görsel için Rich Presence › Art Assets bölümüne “luna” adlı bir resim yükleyebilirsin.")}</span></div>
        <Switch on={on} onChange={(v) => { setOn(v); save(id, v); if (!v && id.trim()) void invoke("discord_presence", { clientId: id.trim(), activity: null }).catch(() => {}); }} label={tt("Discord durumu")} /></div>
      <div className="lx-set-row">
        <input value={id} onChange={(e) => { setId(e.target.value.replace(/\D/g, "")); save(e.target.value.replace(/\D/g, ""), on); }} placeholder={tt("Application ID")} aria-label={tt("Discord Application ID")} inputMode="numeric" spellCheck={false} />
        <button className="chip" disabled={id.trim().length < 15} onClick={() => void test()}>{tt("Dene")}</button>
      </div>
      {msg && <span className={msg.ok ? "lx-set-ok" : "lx-set-bad"}>{msg.t}</span>}
      {st && !msg && on && <div className="set-hint">{st.ok ? tt("Son güncelleme: {0}", when(st.at)) : tt("Son deneme başarısız ({0}): {1}", when(st.at), st.msg)}</div>}
    </div>
  );
}

function CommandsCard() {
  const [list, setList] = useState(loadUserCommands);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [err, setErr] = useState("");
  const add = () => {
    const e = addUserCommand(name, prompt);
    if (e) { setErr(e); return; }
    setErr(""); setName(""); setPrompt(""); setList(loadUserCommands());
  };
  const remove = (n: string) => { saveUserCommands(list.filter((c) => c.name !== n)); setList(loadUserCommands()); };
  return (
    <div className="set-card lx-set">
      <h3>{tt("Kendi asistan komutların")}</h3>
      <div className="set-hint">{tt("Sık kullandığın isteği bir komuta çevir. Metnin gireceği yere {metin}, Web bölümünde seçili metin için {seçim} yaz. Örnek: /özet3 uzun bir yazı → “Üç maddede özetle: …”")}</div>
      {list.length > 0 && (
        <ul className="lx-cmds">
          {list.map((c) => (
            <li key={c.name}><b>/{c.name}</b><span title={c.prompt}>{c.prompt.replace(/\s+/g, " ")}</span>
              <button className="chip" onClick={() => remove(c.name)} aria-label={tt("“/{0}” komutunu sil", c.name)}>{tt("Sil")}</button></li>
          ))}
        </ul>
      )}
      <div className="lx-set-row">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={tt("Komut adı (ör. özet3)")} aria-label={tt("Komut adı")} style={{ maxWidth: 200 }} spellCheck={false} />
      </div>
      <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={tt("Asistana gidecek metin: Bunu üç maddede özetle: {metin}")} aria-label={tt("Komutun metni")} />
      <div className="lx-set-row">
        <button className="chip" onClick={add} disabled={!name.trim() || !prompt.trim()}>{tt("Komutu kaydet")}</button>
        {err && <span className="lx-set-bad">{err}</span>}
      </div>
    </div>
  );
}

/** Settings › Playback and connections. Every change is saved at once (no Save button needed). */
export function ExtrasSettings() {
  const [, tick] = useState(0);
  useEffect(() => { const id = window.setInterval(() => tick((n) => n + 1), 5000); return () => clearInterval(id); }, []);
  const waiting = pendingScrobbles();
  return (
    <>
      <div className="set-card lx-set">
        <h3>{tt("Ses ve zamanlayıcı")}</h3>
        <div className="set-hint">{tt("Filmlerde: oynatıcıdaki ses düğmesi (ekolayzer, ses dengeleme, gece modu, konuşma netliği, A-B döngüsü). Müzikte: “Şu an çalıyor” ekranındaki ses düğmesi (ekolayzer ve uyku zamanlayıcısı). Film ve müzik ayrı ayarlar kullanır.")}</div>
        <div className="set-hint">{tt("Ctrl+K her yerden komut paletini açar: bir yere git, kütüphanendeki bir filmi aç ya da asistana sor.")}</div>
        <div className="set-hint">{tt("Bu bölümdeki değişiklikler hemen kaydedilir; alttaki Kaydet düğmesi gerekmez.")}</div>
      </div>
      <SponsorCard />
      <ListenBrainzCard />
      <LastfmCard />
      <TraktCard />
      <DiscordCard />
      {waiting > 0 && (
        <div className="set-card lx-set"><div className="lx-set-row"><span>{tt("{0} dinleme gönderilmeyi bekliyor (bağlantı yoktu).", waiting)}</span>
          <button className="chip" onClick={() => void flushScrobbles().then(() => tick((n) => n + 1))}>{tt("Şimdi gönder")}</button></div></div>
      )}
      <CommandsCard />
    </>
  );
}
