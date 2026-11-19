// Birlikte izle (watch party): room menu on the player's people button, chat panel on the right while someone is in
// the room, host approval dialog and invite-link dialog anywhere in Luna. The connection itself lives in
// src-tauri/src/watch_party.rs; this file only shows it. Sync of play/pause/seek comes in the next step.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { extraText as x } from "./Extras";
import { Icon } from "./Screens";
import { store } from "./library";
import { logDebug } from "./debugTelemetry";
import "./WatchParty.css";

type Member = { id: string; name: string; host?: boolean; me?: boolean };
type Msg = { key: number; sys?: boolean; name?: string; text: string; me?: boolean; host?: boolean };
type State = {
  open: boolean; host: boolean; link: string; hostName: string; members: Member[]; everyone: boolean;
  requests: { id: string; name: string }[]; msgs: Msg[]; unread: number; chat: boolean; waiting: boolean;
  invite: string | null; toast: { key: number; text: string } | null; busy: boolean; menu: boolean;
};
const empty = (): State => ({ open: false, host: false, link: "", hostName: "", members: [], everyone: false, requests: [], msgs: [], unread: 0, chat: false, waiting: false, invite: null, toast: null, busy: false, menu: false });
let st: State = empty();
let seq = 0;
const subs = new Set<() => void>();
const set = (patch: Partial<State> | ((s: State) => Partial<State>)) => { st = { ...st, ...(typeof patch === "function" ? patch(st) : patch) }; subs.forEach((f) => f()); };
/** True while the room menu is open: the player keeps its controls on screen meanwhile. */
export const usePartyMenu = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => st.menu);
const useParty = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => st);
let toastTimer: number | undefined;
const toast = (text: string) => { window.clearTimeout(toastTimer); set({ toast: { key: ++seq, text } }); toastTimer = window.setTimeout(() => set({ toast: null }), 3200); };
const addMsg = (m: Omit<Msg, "key">) => set((s) => ({ msgs: [...s.msgs, { ...m, key: ++seq }].slice(-200), unread: s.chat || m.sys || m.me ? s.unread : s.unread + 1 }));
const myName = () => store.get("partyName") || "";
const errText = (e: unknown) => String(e).replace(/^Error:\s*/, "").slice(0, 200);

const PEOPLE = "M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM22 19v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8";
const CHAT = "M21 12a8 8 0 0 1-11.8 7L4 20l1.1-4.4A8 8 0 1 1 21 12z";
const REACTIONS = ["😂", "😮", "❤️", "🔥"];

let started = false;
function start() {
  if (started) return;
  started = true;
  void invoke<Record<string, unknown>>("party_status").then((r) => { if (r?.open) set({ open: true, host: !!r.host, link: String(r.link || ""), everyone: !!r.everyone, members: (r.members as Member[]) || [] }); }).catch(() => {});
  void invoke<string | null>("party_startup_link").then((l) => { if (l) set({ invite: l }); }).catch(() => {});
  void listen<string>("party-link", (e) => { if (!st.open) set({ invite: e.payload }); else toast(x("Önce bulunduğun odadan çık", "Leave your current room first")); });
  void listen<Record<string, any>>("party", (e) => {
    const p = e.payload;
    switch (p.kind) {
      case "request": set((s) => ({ requests: [...s.requests.filter((r) => r.id !== p.id), { id: p.id, name: p.name }] })); break;
      case "requestDone": set((s) => ({ requests: s.requests.filter((r) => r.id !== p.id) })); break;
      case "members": set({ members: p.list || [] }); break;
      case "joined":
        addMsg({ sys: true, text: x("{0} katıldı", "{0} joined").replace("{0}", p.name) });
        toast(x("{0} odaya katıldı", "{0} joined the room").replace("{0}", p.name));
        if (!st.msgs.some((m) => !m.sys)) set({ chat: true, unread: 0 });
        break;
      case "left": addMsg({ sys: true, text: (p.kicked ? x("{0} çıkarıldı", "{0} was removed") : x("{0} ayrıldı", "{0} left")).replace("{0}", p.name) }); break;
      case "waiting": set({ waiting: true }); break;
      case "welcome":
        set({ open: true, host: false, waiting: false, hostName: p.host, everyone: !!p.everyone, chat: true, unread: 0, msgs: [] });
        addMsg({ sys: true, text: x("Odaya katıldın · oda sahibi {0}", "You joined · host {0}").replace("{0}", p.host) });
        break;
      case "mode": set({ everyone: !!p.everyone }); break;
      case "msg": {
        const d = p.data || {};
        if (d.t === "chat" && typeof d.text === "string") { addMsg({ name: d.name, text: d.text.slice(0, 500), host: d.from === "host" }); if (!st.chat) toast(`${d.name}: ${d.text.slice(0, 80)}`); }
        if (d.t === "react" && REACTIONS.includes(d.emoji)) { float(d.emoji); addMsg({ name: d.name, text: d.emoji, host: d.from === "host" }); }
        break;
      }
      case "ended": {
        const why: Record<string, string> = {
          closedByMe: x("Oda kapatıldı. Link artık çalışmıyor.", "Room closed. The link no longer works."),
          left: x("Odadan ayrıldın", "You left the room"),
          closed: x("Oda sahibi odayı kapattı", "The host closed the room"),
          kicked: x("Oda sahibi seni odadan çıkardı", "The host removed you from the room"),
          lost: x("Oda bağlantısı koptu", "Lost connection to the room"),
        };
        st = { ...empty(), invite: st.invite };
        toast(why[p.reason] || why.lost);
        break;
      }
    }
  });
}

/** Emoji reactions float up over the video for everyone. */
function float(emoji: string) {
  const el = document.createElement("div");
  el.className = "wp-float";
  el.textContent = emoji;
  el.style.left = 20 + Math.random() * 45 + "%";
  document.body.appendChild(el);
  window.setTimeout(() => el.remove(), 2300);
}

async function openRoom(name: string) {
  store.set("partyName", name.trim());
  set({ busy: true });
  try {
    const r = await invoke<Record<string, unknown>>("party_host", { name: name.trim() || x("Oda sahibi", "Host") });
    set({ open: true, host: true, link: String(r.link || ""), members: (r.members as Member[]) || [], everyone: false, msgs: [], unread: 0 });
    logDebug("app", "party_host", { ok: true });
  } catch (e) { toast(errText(e)); logDebug("app", "party_host", { ok: false }); }
  set({ busy: false });
}

async function join(link: string, name: string) {
  store.set("partyName", name.trim());
  set({ busy: true, invite: null, waiting: true });
  try { await invoke("party_join", { link: link.trim(), name: name.trim() || x("Misafir", "Guest") }); logDebug("app", "party_join", { ok: true }); }
  catch (e) { toast(errText(e)); set({ waiting: false }); logDebug("app", "party_join", { ok: false }); }
  set({ busy: false });
}

const send = (data: Record<string, unknown>) => invoke("party_send", { data }).catch((e) => toast(errText(e)));

/** Player bar: the people button (room menu) and, while someone else is in the room, the chat button. */
export function PartyButtons() {
  const p = useParty();
  const menu = p.menu;
  const setMenu = (v: boolean | ((m: boolean) => boolean)) => set((s) => ({ menu: typeof v === "function" ? v(s.menu) : v }));
  const box = useRef<HTMLDivElement>(null);
  useEffect(start, []);
  useEffect(() => () => set({ menu: false }), []);
  useEffect(() => {
    if (!menu) return;
    const away = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) setMenu(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setMenu(false); } };
    window.addEventListener("pointerdown", away, true); window.addEventListener("keydown", esc, true);
    return () => { window.removeEventListener("pointerdown", away, true); window.removeEventListener("keydown", esc, true); };
  }, [menu]);
  const others = p.host ? p.members.length > 1 : p.open;
  return (
    <>
      {others && (
        <button className={"nf wp-chatbtn" + (p.chat ? " on" : "")} aria-pressed={p.chat} aria-label={x("Sohbet", "Chat")} title={x("Sohbet", "Chat")}
          onClick={() => set((s) => ({ chat: !s.chat, unread: 0 }))}>
          <Icon d={CHAT} size={32} />{p.unread > 0 && !p.chat && <span className="wp-dot" aria-label={x("Yeni mesaj", "New message")} />}
        </button>
      )}
      <div className="tracks-anchor" ref={box}>
        <button className={"nf" + (p.open || menu ? " on" : "")} aria-expanded={menu} aria-label={x("Birlikte izle", "Watch together")} title={x("Birlikte izle", "Watch together")}
          onClick={() => setMenu((v) => !v)}>
          <Icon d={PEOPLE} size={34} />
        </button>
        {menu && <RoomMenu onDone={() => setMenu(false)} />}
      </div>
    </>
  );
}

function RoomMenu({ onDone }: { onDone: () => void }) {
  const p = useParty();
  const [name, setName] = useState(myName);
  const [link, setLink] = useState("");
  const [sure, setSure] = useState(false);
  const [copied, setCopied] = useState(false);
  if (p.waiting) return (
    <div className="wp-pop" role="dialog" aria-label={x("Birlikte izle", "Watch together")}>
      <h4>{x("Onay bekleniyor", "Waiting for approval")}</h4>
      <p className="wp-mut"><span className="wp-spin" aria-hidden="true" />{x("Oda sahibi katılma isteğini görüyor.", "The host is seeing your request.")}</p>
    </div>
  );
  if (!p.open) return (
    <div className="wp-pop" role="dialog" aria-label={x("Birlikte izle", "Watch together")}>
      <h4>{x("Birlikte izle", "Watch together")}</h4>
      <p className="wp-mut">{x("Bir link oluştur, gönderdiğin kişi seninle aynı anda izlesin.", "Create a link; whoever you send it to watches with you.")}</p>
      <label className="wp-field"><span>{x("Adın", "Your name")}</span><input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder={x("Odada görünecek ad", "Name shown in the room")} /></label>
      <button className="wp-btn fill" disabled={p.busy} onClick={() => void openRoom(name)}>{p.busy ? x("Oda açılıyor…", "Opening…") : x("Oda aç", "Open room")}</button>
      <div className="wp-hr" />
      <label className="wp-field"><span>{x("Link ile katıl", "Join with a link")}</span>
        <div className="wp-row"><input value={link} onChange={(e) => setLink(e.target.value)} placeholder="luna://izle/…" onKeyDown={(e) => { if (e.key === "Enter" && link.trim()) void join(link, name); }} />
          <button className="wp-btn" disabled={!link.trim() || p.busy} onClick={() => void join(link, name)}>{x("Katıl", "Join")}</button></div>
      </label>
    </div>
  );
  if (!p.host) return (
    <div className="wp-pop" role="dialog" aria-label={x("Birlikte izle", "Watch together")}>
      <h4>{x("Oda sahibi: {0}", "Host: {0}").replace("{0}", p.hostName)}</h4>
      <People list={p.members} />
      <div className="wp-hr" />
      <button className="wp-item danger" onClick={() => { onDone(); void invoke("party_close"); }}><Icon d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" size={18} />{x("Odadan ayrıl", "Leave room")}</button>
    </div>
  );
  const copy = () => { void navigator.clipboard.writeText(p.link).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1600); }).catch(() => toast(x("Kopyalanamadı", "Couldn't copy"))); };
  return (
    <div className="wp-pop" role="dialog" aria-label={x("Birlikte izle", "Watch together")}>
      <h4>{x("Oda açık · {0} kişi", "Room open · {0} people").replace("{0}", String(Math.max(1, p.members.length)))}</h4>
      <div className="wp-link"><Icon d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" size={16} />
        <span title={p.link}>{p.link}</span><button className="wp-btn sm" onClick={copy}>{copied ? x("Kopyalandı", "Copied") : x("Kopyala", "Copy")}</button></div>
      <p className="wp-mut">{x("Linki göndereceğin kişiye ilet. Katılmak isteyeni sen onaylarsın.", "Send the link. You approve everyone who asks to join.")}</p>
      <People list={p.members} kick />
      <button className="wp-item" role="switch" aria-checked={p.everyone} onClick={() => { const v = !p.everyone; set({ everyone: v }); void invoke("party_mode", { everyone: v }); }}>
        <Icon d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" size={18} />
        {x("Kontrol: ", "Control: ")}{p.everyone ? x("herkes", "everyone") : x("yalnız ben", "only me")}
      </button>
      <div className="wp-hr" />
      {!sure ? (
        <button className="wp-item danger" onClick={() => setSure(true)}><Icon d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" size={18} />{x("Odayı kapat", "Close room")}</button>
      ) : (
        <div className="wp-sure">
          <p>{x("Herkes odadan çıkar ve bu link bir daha çalışmaz.", "Everyone leaves and this link stops working for good.")}</p>
          <div className="wp-row"><button className="wp-btn" onClick={() => setSure(false)}>{x("Vazgeç", "Cancel")}</button>
            <button className="wp-btn danger" onClick={() => { onDone(); void invoke("party_close"); }}>{x("Odayı kapat", "Close room")}</button></div>
        </div>
      )}
    </div>
  );
}

const initial = (n: string) => (n.trim()[0] || "?").toLocaleUpperCase();
function People({ list, kick }: { list: Member[]; kick?: boolean }) {
  return (
    <ul className="wp-people">
      {list.map((m) => (
        <li key={m.id}>
          <span className={"wp-av" + (m.host ? " host" : "")}>{initial(m.name)}</span>
          <span className="wp-name">{m.name}{m.me ? x(" (sen)", " (you)") : ""}{m.host ? <small>{x("oda sahibi", "host")}</small> : null}</span>
          {kick && !m.host && <button className="wp-btn sm ghost" onClick={() => void invoke("party_kick", { id: m.id })}>{x("Çıkar", "Remove")}</button>}
        </li>
      ))}
    </ul>
  );
}

/** Right-hand chat panel in the player; it exists only while someone else is in the room. */
export function PartyChat() {
  const p = useParty();
  const [text, setText] = useState("");
  const list = useRef<HTMLDivElement>(null);
  const others = p.host ? p.members.length > 1 : p.open;
  const shown = p.open && others && p.chat;
  useEffect(() => {
    document.documentElement.classList.toggle("wp-chat-open", shown);
    return () => document.documentElement.classList.remove("wp-chat-open");
  }, [shown]);
  useEffect(() => { const el = list.current; if (el) el.scrollTop = el.scrollHeight; }, [p.msgs.length, shown]);
  if (!shown) return null;
  const submit = () => {
    const t = text.trim().slice(0, 500);
    if (!t) return;
    setText("");
    addMsg({ name: x("Sen", "You"), text: t, me: true });
    void send({ t: "chat", text: t });
  };
  const react = (emoji: string) => { float(emoji); addMsg({ name: x("Sen", "You"), text: emoji, me: true }); void send({ t: "react", emoji }); };
  return (
    <aside className="wp-chat" aria-label={x("Oda sohbeti", "Room chat")} onKeyDown={(e) => e.stopPropagation()}>
      <header>
        <div className="wp-chat-head"><b>{x("Birlikte izle", "Watch together")}</b>
          <button className="wp-x" aria-label={x("Sohbeti gizle", "Hide chat")} onClick={() => set({ chat: false })}><Icon d="M6 6l12 12M18 6L6 18" size={18} /></button></div>
        <div className="wp-chips">{p.members.map((m) => <span key={m.id} className="wp-chip"><span className={"wp-av" + (m.host ? " host" : "")}>{initial(m.name)}</span>{m.me ? x("Sen", "You") : m.name}</span>)}</div>
      </header>
      <div className="wp-msgs" ref={list} aria-live="polite">
        {p.msgs.map((m) => m.sys
          ? <div key={m.key} className="wp-m sys">{m.text}</div>
          : <div key={m.key} className={"wp-m" + (m.me ? " me" : "")}><span className={"wp-who" + (m.host ? " host" : "")}>{m.name}</span>{m.text}</div>)}
      </div>
      <div className="wp-inbox">
        <div className="wp-inp">
          <input value={text} maxLength={500} placeholder={x("Mesaj yaz", "Write a message")} aria-label={x("Mesaj", "Message")}
            onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }} />
          {REACTIONS.map((r) => <button key={r} className="wp-em" aria-label={x("Tepki: ", "React: ") + r} onClick={() => react(r)}>{r}</button>)}
        </div>
      </div>
    </aside>
  );
}

/** Mounted once at the app root: join requests, the invite-link dialog and short notices work on every screen. */
export function PartyGlobal() {
  const p = useParty();
  const [name, setName] = useState(myName);
  useEffect(start, []);
  const req = p.requests[0];
  return (
    <>
      {req && (
        <div className="wp-request" role="alertdialog" aria-label={x("Katılma isteği", "Join request")}>
          <span className="wp-av">{initial(req.name)}</span>
          <div><b>{x("{0} katılmak istiyor", "{0} wants to join").replace("{0}", req.name)}</b><small>{x("Kabul edersen seninle izler ve sohbete yazar.", "If you accept, they watch with you and can chat.")}</small></div>
          <button className="wp-btn" onClick={() => void invoke("party_answer", { id: req.id, allow: false })}>{x("Reddet", "Decline")}</button>
          <button className="wp-btn fill" onClick={() => void invoke("party_answer", { id: req.id, allow: true })}>{x("Kabul et", "Accept")}</button>
        </div>
      )}
      {p.invite && (
        <div className="wp-scrim" onPointerDown={(e) => { if (e.target === e.currentTarget) set({ invite: null }); }}>
          <div className="wp-dialog" role="dialog" aria-modal="true" aria-label={x("İzleme davetine katıl", "Join watch invite")}
            onKeyDown={(e) => { if (e.key === "Escape") set({ invite: null }); }}>
            <h3>{x("Birlikte izlemeye davet edildin", "You were invited to watch together")}</h3>
            <p className="wp-mut">{x("Katılınca oda sahibi bir onay isteği görür. Bağlantı uçtan uca şifrelidir; video gönderilmez, filmi herkes kendi Luna'sında açar.", "The host sees a request when you join. The connection is end-to-end encrypted; no video is sent, everyone plays the film in their own Luna.")}</p>
            <label className="wp-field"><span>{x("Adın", "Your name")}</span><input autoFocus value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder={x("Odada görünecek ad", "Name shown in the room")} /></label>
            <div className="wp-row end"><button className="wp-btn" onClick={() => set({ invite: null })}>{x("Vazgeç", "Cancel")}</button>
              <button className="wp-btn fill" disabled={p.busy} onClick={() => void join(p.invite!, name)}>{x("Katıl", "Join")}</button></div>
          </div>
        </div>
      )}
      {p.waiting && !p.invite && <div className="wp-toast wait"><span className="wp-spin" aria-hidden="true" />{x("Oda sahibinin onayı bekleniyor…", "Waiting for the host to approve…")}</div>}
      {p.toast && <div key={p.toast.key} className="wp-toast" role="status">{p.toast.text}</div>}
    </>
  );
}
