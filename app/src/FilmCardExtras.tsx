// The parts every film card shares (Keşfet, home rows, Filmler, Öneriler): friends who watched the title with their
// stars, and the hover action row. Card hosts are often <button>s, so the actions are spans with role="button".
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { openUrl } from "./linkOpen";
import { diaryGet, diarySet, has, laterOff, loadLater, loadPlaylists, listeners, loadRecs, markLater, youtubeTrailer } from "./Taste";
import { loadFriendRatings, onTasteEngine } from "./tasteEngine";
import { friendRatingSummary, friendsWhoWatched, type WatchingFriend } from "./friendsWatchedModel";
import { FriendAvatar } from "./FriendProfile";
import { I, Icon, openMenu, titleAsks } from "./Screens";
import { extraText } from "./Extras";
import { DEC, tt } from "./i18n";

export type CardTitle = { title: string; year?: string; id?: number; kind: "movie" | "tv" };

// One snapshot of recs, playlists, friend ratings and the watch-later list for every card, rebuilt only when taste data
// changes. Results are cached per title, and a title no friend data mentions skips the full scan, so big grids stay fast.
type Snap = {
  recs: ReturnType<typeof loadRecs>; ratings: ReturnType<typeof loadFriendRatings>; lists: ReturnType<typeof loadPlaylists>;
  later: string[]; names: Set<string>; ids: Set<string>; hits: Map<string, WatchingFriend[]>;
};
let snap: Snap | null = null;
const norm = (t: string) => t.replace(/\s*\(\d{4}\)\s*$/, "").trim().toLocaleLowerCase("tr");
const data = (): Snap => {
  if (snap) return snap;
  const recs = loadRecs(), ratings = loadFriendRatings(), lists = loadPlaylists();
  const names = new Set<string>(), ids = new Set<string>();
  for (const r of recs) if (r.title) names.add(norm(r.title));
  for (const f of Object.values(ratings)) {
    for (const id of Object.keys(f?.r ?? {})) ids.add(id);
    for (const t of Object.values(f?.t ?? {})) if (typeof t === "string") names.add(norm(t));
  }
  for (const l of lists) for (const it of l.items ?? []) if (it?.title) names.add(norm(it.title));
  return (snap = { recs, ratings, lists, later: loadLater(), names, ids, hits: new Map() });
};
const reset = () => { snap = null; };
let wired = false;
// A light subscription: every taste change (likes, lists, watch later) or friend-ratings update drops the snapshot and
// re-renders the card. useTaste() is not used here because it re-reads and parses the stores on each render.
function useSnap(): Snap {
  const [, refresh] = useState(0);
  useEffect(() => {
    if (!wired) { wired = true; listeners.add(reset); onTasteEngine(reset); }
    const f = () => refresh((n) => n + 1);
    listeners.add(f);
    const off = onTasteEngine(f);
    return () => { listeners.delete(f); off(); };
  }, []);
  return data();
}
function friendsOf(d: Snap, t: CardTitle): WatchingFriend[] {
  if (!t.title) return [];
  const k = t.kind + "|" + (t.id ?? "") + "|" + norm(t.title) + "|" + (t.year ?? "");
  let hit = d.hits.get(k);
  if (!hit) {
    hit = d.names.has(norm(t.title)) || (t.id && d.ids.has(String(t.id))) ? friendsWhoWatched(t, d.recs, d.ratings, d.lists) : [];
    d.hits.set(k, hit);
  }
  return hit;
}
const useFriends = (t: CardTitle) => friendsOf(useSnap(), t);
const starText = (s?: number) => (s ? "★" + s.toFixed(1).replace(/\.0$/, "").replace(".", DEC) : "—");

/** Five stars drawn with the same glyph: full, a real half star (left half filled) and dim empty ones. The "½" character
 *  used before came from another font and sat small and low next to the stars. */
function StarRow({ stars }: { stars: number }) {
  const full = Math.floor(stars), half = stars - full >= 0.5;
  return (
    <span className="fc-stars" aria-label={extraText(`${stars} yıldız`, `${stars} stars`)}>
      {Array.from({ length: 5 }, (_, i) => <span key={i} aria-hidden="true" className={i < full ? "on" : i === full && half ? "half" : ""}>★</span>)}
    </span>
  );
}

/** Stacked friend photos; in the poster's corner, or inline at the end of the hover row. Hovering them opens the
 *  friends' stars and notes inside the poster's own frame (scrolling when long). */
export function CardFriends({ t, inline }: { t: CardTitle; inline?: boolean }) {
  const friends = useFriends(t);
  const [box, setBox] = useState<{ left: number; width: number; bottom: number; max: number } | null>(null);
  const closer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(closer.current), []);
  if (!friends.length) return null;
  const shown = friends.slice(0, 2), more = friends.length - shown.length;
  const mine = diaryGet(t.title, t.year);
  const open = (el: HTMLElement) => {
    clearTimeout(closer.current);
    const me = el.getBoundingClientRect();
    const frame = (el.closest(".plg-poster, .poster-img, .disc-poster") ?? el).getBoundingClientRect();
    setBox({ left: frame.left + 6, width: Math.max(140, frame.width - 12), bottom: window.innerHeight - me.top + 6, max: Math.max(60, me.top - frame.top - 12) });
  };
  const close = () => { clearTimeout(closer.current); closer.current = setTimeout(() => setBox(null), 140); };
  return (
    <span className={"fc-friends" + (inline ? " inline" : "")} onClick={(e) => e.stopPropagation()}
      onPointerEnter={(e) => open(e.currentTarget)} onPointerLeave={close}>
      {box && createPortal(
        // Posters clip their content, so the list lives on <body> but is sized to the poster it belongs to.
        <div className="fc-pop" role="tooltip" style={{ left: box.left, width: box.width, bottom: box.bottom, maxHeight: box.max }}
          onPointerEnter={() => clearTimeout(closer.current)} onPointerLeave={close} onWheel={(e) => e.stopPropagation()}>
          {friends.map((f) => (
            <div key={f.name} className="fc-pop-row">
              <div><b>{f.name}</b> <span className="fc-pop-stars">{f.stars ? <StarRow stars={f.stars} /> : extraText("izledi", "watched")}</span></div>
              {f.note && <div className="fc-pop-note">{f.note}</div>}
            </div>
          ))}
          <div className="fc-pop-me">{extraText("Sen", "You")} — {mine?.watched ? (mine.rating ? `${mine.rating}/10` : extraText("izledin", "watched")) : extraText("izlemedin", "not watched")}</div>
        </div>, document.body)}
      {shown.map((f) => <FriendAvatar key={f.name} name={f.name} />)}
      {more > 0 && <span className="friend-photo fc-more">+{more}</span>}
    </span>
  );
}

/** The line under the title: the first two friends' stars, or the average when more friends rated it. */
export function CardFriendLine({ t }: { t: CardTitle }) {
  const friends = useFriends(t);
  if (!friends.length) return null;
  const sum = friendRatingSummary(friends);
  const text = friends.length > 2 && sum.average !== null
    ? extraText(`Arkadaş ort. ${starText(sum.average)} (${friends.length} kişi)`, `Friends avg. ${starText(sum.average)} (${friends.length})`)
    : friends.slice(0, 2).map((f) => `${f.name} ${starText(f.stars)}`).join(" · ");
  return <div className="fc-line ellipsis" title={friends.map((f) => `${f.name} ${starText(f.stars)}`).join("\n")}>{text}</div>;
}

type ActionProps = { t: CardTitle; onPlay?: () => void; onDetail: () => void; extra?: React.ReactNode };

/** Hover actions in the Öneriler style (a row at the bottom of the poster). The row is mounted only while the card
 *  is hovered or focused, so a grid of a thousand posters does not keep thousands of buttons alive. */
export function CardActions(props: ActionProps) {
  const slot = useRef<HTMLSpanElement>(null);
  const [live, setLive] = useState(false);
  useEffect(() => {
    const card = slot.current?.closest(".poster, .disc-card, .plg-card");
    if (!card) return;
    const on = () => setLive(true);
    const leave = () => setLive(false);
    const blur = (e: Event) => { if (!card.contains((e as FocusEvent).relatedTarget as Node | null)) setLive(false); };
    card.addEventListener("pointerenter", on); card.addEventListener("focusin", on);
    card.addEventListener("pointerleave", leave); card.addEventListener("focusout", blur);
    return () => {
      card.removeEventListener("pointerenter", on); card.removeEventListener("focusin", on);
      card.removeEventListener("pointerleave", leave); card.removeEventListener("focusout", blur);
    };
  }, []);
  return <span ref={slot} className="fc-slot">{live && <ActionRow {...props} />}</span>;
}

function ActionRow({ t, onPlay, onDetail, extra }: ActionProps) {
  const d = useSnap();
  const label = t.year ? `${t.title} (${t.year})` : t.title;
  const later = has(d.later, label) || has(d.later, t.title);
  const watched = !!diaryGet(t.title, t.year)?.watched;
  const act = (fn: (e: React.MouseEvent) => void) => ({
    role: "button", tabIndex: 0,
    onClick: (e: React.MouseEvent) => { e.stopPropagation(); e.preventDefault(); fn(e); },
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); e.preventDefault(); (e.currentTarget as HTMLElement).click(); } },
  });
  return (
    <span className="plg-hover fc-row">
      {onPlay && <span className="round" title={tt("Oynat")} aria-label={tt("Oynat")} {...act(onPlay)}><Icon d={I.play} fill size={16} /></span>}
      <span className="round" title={tt("YouTube'da Türkçe fragman")} aria-label={tt("Fragman")} {...act(() => openUrl(youtubeTrailer(label)))}><Icon d={I.film} size={14} /></span>
      <span className="round" title={tt("Detay")} aria-label={tt("Detay")} {...act(onDetail)}>i</span>
      <span className={"round" + (later ? " on" : "")} title={later ? tt("Sonra izle listesinden çıkar") : tt("Sonra izle")} aria-label={tt("Sonra izle")}
        {...act(() => { if (later) laterOff(t.title, t.year); else markLater(label, true); reset(); })}><Icon d={later ? I.check : I.plus} size={14} /></span>
      <span className={"round" + (watched ? " on" : "")} title={watched ? tt("İzlemedim") : tt("İzledim")} aria-label={tt("İzledim")}
        {...act(() => diarySet(t.title, t.year, { watched: watched ? undefined : Date.now() }))}><Icon d={I.check} size={14} /></span>
      <span className="round" title={tt("Diğer")} aria-label={tt("Diğer")}
        {...act((e) => openMenu(e, [...titleAsks(t.title, t.year, t.kind), "sep", { label: tt("Detaylar"), act: onDetail }]))}>⋯</span>
      {extra}
      <CardFriends t={t} inline />
    </span>
  );
}
