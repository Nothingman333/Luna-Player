// Following series and films: Luna looks them up on TMDB every few hours and leaves a notice when a new
// episode is out or a film is released. The bell next to Settings shows the notices and the followed titles.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { lang, tt } from "./i18n";
import { extraText } from "./Extras";
import { IMG, parseName, searchTmdb, store, tmdbGet } from "./library";
import { I, Icon } from "./Screens";
import { notifyUser } from "./shellBridge";
import { logDebug } from "./debugTelemetry";
import { addNotices, epLabel, Follow, Notice, updateFollow } from "./followModel";
import "./Follow.css";
import { Lens } from "./LiquidGlass";

const FOLLOWS = "follows", NOTICES = "notices";
const EVERY = 3 * 3600e3;
export const loadFollows = () => store.json<Follow[]>(FOLLOWS, []);
export const loadNotices = () => store.json<Notice[]>(NOTICES, []);
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((f) => f());
const saveFollows = (l: Follow[]) => { store.set(FOLLOWS, JSON.stringify(l)); changed(); };
const saveNotices = (l: Notice[]) => { store.set(NOTICES, JSON.stringify(l)); changed(); };
// new notices also pop up at the top right for a while (NoticeToasts)
const popListeners = new Set<(n: Notice) => void>();
const pop = (n: Notice) => popListeners.forEach((f) => f(n));

/** Re-renders when follows or notices change. */
function useFollowState() {
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => bump((n) => n + 1);
    listeners.add(f);
    return () => { listeners.delete(f); };
  }, []);
  return { follows: loadFollows(), notices: loadNotices() };
}

export const isFollowed = (kind: "movie" | "tv", id: number) => loadFollows().some((f) => f.kind === kind && f.id === id);

let running: Promise<void> | null = null;
/** Asks TMDB about the followed titles not looked at for a while (all of them with `force`). */
export function checkFollows(force = false): Promise<void> {
  if (running) return running;
  if (!store.get("tmdbKey")) return Promise.resolve();
  running = (async () => {
    const todo = loadFollows().filter((f) => force || !f.checked || Date.now() - f.checked > EVERY);
    const started = performance.now();
    let asked = 0, failed = 0, told = 0;
    for (let i = 0; i < todo.length; i += 4) {
      const answers = await Promise.all(todo.slice(i, i + 4).map(async (f) => {
        const detail = await tmdbGet(`/${f.kind}/${f.id}`).catch(() => undefined);
        return detail === undefined ? null : updateFollow(f, detail, new Date(), lang() === "tr");
      }));
      const done = answers.filter((a): a is NonNullable<typeof a> => !!a);
      asked += answers.length; failed += answers.length - done.length;
      if (!done.length) continue;
      // merge into the list as it is now: a title unfollowed meanwhile stays unfollowed
      saveFollows(loadFollows().map((f) => done.find((a) => a.follow.kind === f.kind && a.follow.id === f.id)?.follow ?? f));
      const fresh = done.flatMap((a) => (a.notice ? [a.notice] : [])).filter((n) => !loadNotices().some((x) => x.id === n.id));
      if (fresh.length) {
        saveNotices(addNotices(loadNotices(), fresh));
        told += fresh.length;
        for (const n of fresh) { void notifyUser("episode", n.title, n.text); pop(n); }
      }
    }
    // a trace in the debug log (Ctrl+Shift+D) that the check ran: counts only, no titles
    if (todo.length) logDebug("network", "follow_check", { force, asked, failed, notices: told }, failed ? "error" : "info", performance.now() - started);
  })().finally(() => { running = null; });
  return running;
}

export function toggleFollow(t: { id: number; kind: "movie" | "tv"; title: string; year?: string; poster?: string | null }) {
  const l = loadFollows();
  if (l.some((f) => f.kind === t.kind && f.id === t.id)) { saveFollows(l.filter((f) => !(f.kind === t.kind && f.id === t.id))); return false; }
  saveFollows([{ ...t, at: Date.now() }, ...l]);
  void checkFollows();
  return true;
}

/** The bell on a title's page. */
export function FollowButton({ id, kind, title, year, poster }: { id?: number; kind: "movie" | "tv"; title: string; year?: string; poster?: string | null }) {
  useFollowState();
  if (!id || id <= 0) return null;
  const on = isFollowed(kind, id);
  // a film from an earlier year is already out: nothing to wait for (one already followed keeps its bell to unfollow)
  if (kind === "movie" && !on && year && Number(year) < new Date().getFullYear()) return null;
  const tip = on ? extraText("Takibi bırak", "Unfollow")
    : kind === "tv" ? extraText("Takip et: yeni bölüm çıkınca haber ver", "Follow: tell me when a new episode is out")
    : extraText("Takip et: çıkınca haber ver", "Follow: tell me when it's out");
  return (
    <button className={"act" + (on ? " on" : "")} data-tip={tip} aria-label={tip} aria-pressed={on}
      onClick={() => toggleFollow({ id, kind, title, year, poster })}><Lens /><Icon d={on ? BELL_ON : BELL} size={20} /></button>
  );
}

const BELL = "M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15ZM10 20.5a2 2 0 0 0 4 0";
const BELL_ON = BELL + "M12 3V2";
const dateText = (d: string) => new Date(d + "T12:00:00").toLocaleDateString(lang() === "tr" ? "tr-TR" : "en-GB", { day: "numeric", month: "long" });
const ago = (at: number) => {
  const m = Math.round((Date.now() - at) / 60000);
  if (m < 60) return extraText(`${Math.max(1, m)} dk önce`, `${Math.max(1, m)} min ago`);
  const h = Math.round(m / 60);
  if (h < 24) return extraText(`${h} sa önce`, `${h} h ago`);
  return new Date(at).toLocaleDateString(lang() === "tr" ? "tr-TR" : "en-GB", { day: "numeric", month: "short" });
};
const open = (n: Pick<Notice, "target" | "go" | "episode" | "art">) => {
  if (n.episode) window.dispatchEvent(new CustomEvent("luna-play-episode", { detail: { ...n.episode, art: n.art } }));
  else if (n.target) window.dispatchEvent(new CustomEvent("luna-open-title", { detail: n.target }));
  else if (n.go) window.dispatchEvent(new CustomEvent("luna-go", { detail: { place: n.go } }));
};

/** Work still running (subtitle jobs): shown live at the top of the bell, not stored. */
export type LiveTask = { id: string; title: string; text: string; pct: number | null; art?: string };
/** a notice without a picture shows what kind it is */
const noticeIcon = (id: string) => id.startsWith("whisper") ? I.subs : id.startsWith("dl") ? I.down : I.film;
let liveTasks: LiveTask[] = [];
const liveListeners = new Set<() => void>();
export function setLiveTasks(l: LiveTask[]) { liveTasks = l; liveListeners.forEach((f) => f()); }
const useLiveTasks = () => { const [, set] = useState(0); useEffect(() => { const f = () => set((n) => n + 1); liveListeners.add(f); return () => { liveListeners.delete(f); }; }, []); return liveTasks; };

/** A download notice has no picture of its own: the film's poster is found from the release name
 *  ("Other.Mommy.2026.1080p…" → TMDB) once and remembered, so the bell and the pop-up show the film. */
const posterAsk = new Map<string, Promise<string | null>>();
function downloadPoster(name: string): Promise<string | null> {
  const p = parseName(name), key = "dlPoster:" + p.kind + ":" + p.title.toLowerCase() + ":" + (p.year ?? "");
  const kept = store.get(key);
  if (kept !== null) return Promise.resolve(kept || null);
  let ask = posterAsk.get(key);
  if (!ask) {
    ask = searchTmdb(p.title, p.kind, p.year).then((h) => { const poster = h[0]?.poster ?? ""; store.set(key, poster); return poster || null; }).catch(() => null);
    posterAsk.set(key, ask);
  }
  return ask;
}
function NoticeArt({ n, toast }: { n: Notice; toast?: boolean }) {
  const dl = !n.poster && !n.art && n.id.startsWith("dl");
  const [found, setFound] = useState<string | null>(null);
  useEffect(() => { if (!dl) return; let alive = true; void downloadPoster(n.title).then((p) => alive && setFound(p)); return () => { alive = false; }; }, [dl, n.title]);
  const poster = n.poster || found;
  if (poster) return <img src={IMG + "w92" + poster} alt="" loading={toast ? undefined : "lazy"} decoding="async" onLoad={(e) => e.currentTarget.classList.add("loaded")} />;
  if (n.art) return <img className="sq" src={n.art} alt="" loading={toast ? undefined : "lazy"} />;
  return toast ? <span className="notice-toast-ic"><Icon d={dl ? I.down : BELL} size={18} /></span> : <i className="notify-nop"><Icon d={noticeIcon(n.id)} size={18} /></i>;
}

/** Leaves a notice in the bell (once per id), e.g. a finished download. */
export function pushNotice(n: Omit<Notice, "at" | "read">) {
  if (loadNotices().some((x) => x.id === n.id)) return;
  const full = { ...n, at: Date.now() };
  saveNotices(addNotices(loadNotices(), [full]));
  pop(full);
}

/** Pop-ups for new notices at the top right: they stay a few seconds (longer while the mouse is on them),
 *  a click opens what they are about and marks them read; they stay in the bell either way. */
export function NoticeToasts() {
  const [list, setList] = useState<Notice[]>([]);
  const hover = useRef(false);
  useEffect(() => {
    const add = (n: Notice) => setList((l) => [...l.filter((x) => x.id !== n.id), n].slice(-3));
    popListeners.add(add);
    const clear = () => setList([]);
    window.addEventListener("luna-bell-open", clear);
    return () => { popListeners.delete(add); window.removeEventListener("luna-bell-open", clear); };
  }, []);
  useEffect(() => {
    // closing the last one with × left no mouseleave: the "mouse is on them" flag stayed on and later pop-ups never went
    if (!list.length) { hover.current = false; return; }
    const t = setInterval(() => { if (!hover.current) setList((l) => l.filter((n) => Date.now() - n.at < 3000)); }, 250);
    return () => clearInterval(t);
  }, [list.length]);
  const drop = (id: string) => setList((l) => l.filter((x) => x.id !== id));
  if (!list.length) return null;
  // on body, above every window (a film window is portaled there too): inside the app they sat blurred behind it
  return createPortal(
    <div className="notice-toasts" role="status" aria-live="polite"
      onMouseEnter={() => { hover.current = true; }}
      onMouseLeave={() => { hover.current = false; setList((l) => l.map((n) => ({ ...n, at: Math.max(n.at, Date.now() - 1500) }))); }}>
      {list.map((n) => (
        <div key={n.id} className="notice-toast">
          <button className="notice-toast-main" onClick={() => {
            drop(n.id);
            saveNotices(loadNotices().map((x) => (x.id === n.id ? { ...x, read: true } : x)));
            open(n);
          }}>
            <NoticeArt n={n} toast />
            <span className="notify-t" title={n.text}><b>{n.title}</b><small>{n.text}</small></span>
          </button>
          <button className="notice-toast-x" aria-label={tt("Kapat")} onClick={() => drop(n.id)}><Icon d={I.x} size={13} /></button>
        </div>
      ))}
    </div>,
    document.body
  );
}

/** The bell next to Settings: notices and the followed titles; also keeps the follows checked. */
export function NotifyButton() {
  const { follows, notices } = useFollowState();
  const [show, setShow] = useState(false);
  const [tab, setTab] = useState<"news" | "follows">("news");
  const live = useLiveTasks();
  const [checking, setChecking] = useState(false);
  const lastCheck = Math.max(0, ...follows.map((f) => f.checked ?? 0));
  const box = useRef<HTMLDivElement>(null);
  const unread = notices.filter((n) => !n.read).length;
  useEffect(() => {
    const first = setTimeout(() => void checkFollows(), 8000);
    const every = setInterval(() => void checkFollows(), 30 * 60e3);
    return () => { clearTimeout(first); clearInterval(every); };
  }, []);
  useEffect(() => {
    if (!show) return;
    const outside = (e: PointerEvent) => { if (e.target instanceof Node && !box.current?.contains(e.target)) setShow(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setShow(false); box.current?.querySelector("button")?.focus(); } };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", esc, true);
    return () => { document.removeEventListener("pointerdown", outside, true); document.removeEventListener("keydown", esc, true); };
  }, [show]);
  // what was shown counts as read once the panel closes (new ones stay marked while it is open)
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !show && loadNotices().some((n) => !n.read)) saveNotices(loadNotices().map((n) => ({ ...n, read: true })));
    wasOpen.current = show;
  }, [show]);
  // opening the bell: the pop-ups at the top right go, the same notices are in the panel
  const toggle = () => setShow((v) => { if (!v) window.dispatchEvent(new Event("luna-bell-open")); return !v; });
  const label = extraText("Bildirimler", "Notifications");
  const tr = lang() === "tr";
  return (
    <div className="notify-anchor" ref={box}>
      <button className="round gear notify-btn" aria-label={unread ? `${label} (${unread})` : label} title={label} aria-expanded={show} aria-haspopup="dialog" onClick={toggle}>
        <Icon d={BELL} />
        {unread > 0 && <span className="notify-badge">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {show && (
        <div className="notify-panel" role="dialog" aria-label={label}>
          <div className="notify-tabs" role="tablist">
            <button role="tab" aria-selected={tab === "news"} className={"seg" + (tab === "news" ? " on" : "")} onClick={() => setTab("news")}>{label}</button>
            <button role="tab" aria-selected={tab === "follows"} className={"seg" + (tab === "follows" ? " on" : "")} onClick={() => setTab("follows")}>{extraText("Takip ettiklerin", "Following")} {follows.length ? `(${follows.length})` : ""}</button>
          </div>
          {tab === "news" ? (
            <div className="notify-list">
              {!notices.length && !live.length && <p className="notify-empty">{follows.length
                ? extraText("Henüz yeni bir şey yok. Takip ettiğin dizinin yeni bölümü ya da filmin çıkınca burada görünür.", "Nothing new yet. A new episode of a show you follow, or a film's release, shows up here.")
                : extraText("Bir dizinin ya da filmin sayfasındaki zil düğmesiyle takip et; yeni bölüm çıkınca burada haber veririz.", "Follow a show or film with the bell on its page; new episodes show up here.")}</p>}
              {live.map((t) => (
                <div key={t.id} className="notify-row notify-live" role="status">
                  {t.art ? <img className="sq" src={t.art} alt="" loading="lazy" /> : <i className="notify-nop"><Icon d={I.subs} size={18} /></i>}
                  <span className="notify-t"><b>{t.title}</b><small>{t.text}</small>
                    <span className="notify-bar"><i style={{ width: (t.pct ?? 0) + "%" }} /></span></span>
                  <span className="notify-ago">{t.pct != null ? Math.round(t.pct) + "%" : "…"}</span>
                </div>
              ))}
              {notices.map((n) => (
                <button key={n.id} className={"notify-row" + (n.read ? "" : " unread")} onClick={() => { setShow(false); open(n); }}>
                  <NoticeArt n={n} />
                  <span className="notify-t"><b>{n.title}</b><small>{n.text}</small></span>
                  <span className="notify-ago">{ago(n.at)}</span>
                </button>
              ))}
              {notices.length > 0 && <button className="chip notify-clear" onClick={() => saveNotices([])}>{extraText("Bildirimleri temizle", "Clear notifications")}</button>}
            </div>
          ) : (
            <div className="notify-list">
              {!follows.length && <p className="notify-empty">{extraText("Takip ettiğin dizi ya da film yok.", "You aren't following anything.")}</p>}
              {follows.length > 0 && (
                <div className="notify-check">
                  <button className="chip" disabled={checking} onClick={() => { setChecking(true); void checkFollows(true).finally(() => setChecking(false)); }}>
                    {checking ? extraText("Kontrol ediliyor…", "Checking…") : extraText("Şimdi kontrol et", "Check now")}
                  </button>
                  {lastCheck > 0 && !checking && <small>{extraText("Son kontrol", "Last check")}: {ago(lastCheck)}</small>}
                </div>
              )}
              {follows.map((f) => (
                <div key={f.kind + f.id} className="notify-row">
                  <button className="notify-open" onClick={() => { setShow(false); open({ target: { title: f.title, year: f.year, kind: f.kind, tmdbId: f.id } }); }}>
                    {f.poster ? <img src={IMG + "w92" + f.poster} alt="" loading="lazy" /> : <i className="notify-nop" />}
                    <span className="notify-t"><b>{f.title}</b><small>{
                      f.kind === "tv"
                        ? f.next ? extraText("Sonraki bölüm", "Next episode") + `: ${epLabel(f.next, tr)} · ${dateText(f.next.date)}`
                          : f.last ? extraText("Son bölüm", "Latest episode") + `: ${epLabel(f.last, tr)} · ${dateText(f.last.date)}`
                          : f.checked ? extraText("Bölüm tarihi yok", "No episode date") : tt("Yükleniyor…")
                        : f.release ? (f.out ? extraText("Çıktı", "Out") : extraText("Çıkış", "Release")) + ` · ${dateText(f.release)}`
                        : f.checked ? extraText("Çıkış tarihi yok", "No release date") : tt("Yükleniyor…")
                    }</small></span>
                  </button>
                  <button className="round sm-round" aria-label={extraText("Takibi bırak", "Unfollow")} title={extraText("Takibi bırak", "Unfollow")} onClick={() => toggleFollow(f)}><Icon d={I.x} size={14} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
