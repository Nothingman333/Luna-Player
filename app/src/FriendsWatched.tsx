import {openFriendFilm} from "./friendFilmLink";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { loadPlaylists, loadRecs, useTaste } from "./Taste";
import { loadFriendRatings, onTasteEngine } from "./tasteEngine";
import { friendsWhoWatched, friendRatingSummary } from "./friendsWatchedModel";
import { extraText } from "./Extras";
import { FriendAvatar, friendProfileUrl } from "./FriendProfile";
import { DEC } from "./i18n";

export function FriendsWatched(props: Parameters<typeof friendsWhoWatched>[0]) {
  useTaste();
  const [, refresh] = useState(0);
  const [open, setOpen] = useState(false);
  const [linkError,setLinkError]=useState("");const [linkBusy,setLinkBusy]=useState(false);
  const openEntry=async(name:string)=>{if(linkBusy)return;setLinkBusy(true);setLinkError("");try{await openFriendFilm(name,props);}catch{setLinkError(extraText("Film değerlendirmesi açılamadı. Tekrar dene.","Could not open the film entry. Try again."));setOpen(true);}finally{setLinkBusy(false);}};
  const [width, setWidth] = useState(400);
  const [down,setDown]=useState(false);
  useEffect(()=>{if(open)setDown((host.current?.getBoundingClientRect().top??400)<300);},[open]);
  const box = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const trigger = useRef<HTMLButtonElement>(null);
  const friends = friendsWhoWatched(props, loadRecs(), loadFriendRatings(), loadPlaylists());
  useEffect(() => onTasteEngine(() => refresh(n => n + 1)), []);
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  useEffect(() => {
    const node = box.current;
    if (!node) return;
    const resize = new ResizeObserver(() => setWidth(node.clientWidth));
    resize.observe(node);setWidth(node.clientWidth);
    return () => resize.disconnect();
  }, [friends.length]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!host.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  if (!friends.length) return null;
  const summary = friendRatingSummary(friends);
  const score = summary.average === null ? extraText("Puan yok", "Not rated") : `${summary.average.toFixed(1).replace(".", DEC)}/5`;
  const step = Math.min(48, Math.max(0, (width - 36) / Math.max(1, friends.length - 1)));
  return <div className="friends-watched" ref={host} aria-label={extraText("Bu filmi izleyen arkadaşların", "Friends who watched this title")}
    onPointerEnter={e => { clearTimeout(closeTimer.current);if (e.pointerType === "mouse") setOpen(true); }}
    onPointerLeave={() => { closeTimer.current = setTimeout(() => { if (!host.current?.contains(document.activeElement)) setOpen(false); }, 140); }}
    onBlurCapture={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false); }}
    onKeyDown={e => { if (e.key === "Escape") { e.preventDefault();e.stopPropagation();trigger.current?.focus();setOpen(false); } }}>
    <button type="button" className="friends-average" aria-expanded={open} onClick={() => setOpen(value => !value)} onFocus={() => setOpen(true)}><span className="muted small">{extraText("Arkadaş ortalaması", "Friends’ average")}</span><b>{score}</b></button>
    <div className={"ww-fan" + (open ? " is-open" : "")} ref={box}
      onPointerEnter={e => { if (e.pointerType === "mouse") setOpen(true); }}
      onFocusCapture={e => { if (e.target.matches(":focus-visible")) setOpen(true); }}
      onBlurCapture={e => { if (!host.current?.contains(e.relatedTarget as Node)) setOpen(false); }}
      onKeyDown={e => { if (e.key === "Escape") { e.preventDefault();e.stopPropagation();trigger.current?.focus();setOpen(false); } }}>
      {friends.map((friend, index) => {
        const label = `${friend.name} · ${extraText("izledi", "watched")}${friend.stars ? ` · ${String(friend.stars).replace(".", DEC)}/5` : ""}`;
        return <button key={friend.name} type="button" className="ww-fan-logo friend-avatar" title={label} aria-label={label}
          style={{ "--fan-x": `${open ? index * step : Math.min(index, 3) * 19}px`, zIndex: friends.length - index, opacity: open || index < 4 ? 1 : 0, pointerEvents: open || index < 4 ? "auto" : "none" } as CSSProperties}
          tabIndex={open || index < 4 ? 0 : -1} onClick={() => {void openEntry(friend.name);}}>
          <FriendAvatar name={friend.name}/>
        </button>;
      })}
      <button type="button" ref={trigger} className="ww-fan-count" aria-expanded={open} aria-label={extraText(`${friends.length} arkadaşını göster`, `Show ${friends.length} friends`)}
        style={{ left: open ? Math.min(width - 90, (friends.length - 1) * step + 44) : Math.min(friends.length - 1, 3) * 19 + 44, opacity: open ? 0 : 1, pointerEvents: open ? "none" : "auto" }} onClick={() => setOpen(value => !value)}>
        {extraText(`${friends.length} arkadaş`, `${friends.length} friends`)}
      </button>
    </div>
    {linkError&&<small role="alert">{linkError}</small>}{open && <div className={"friends-ratings"+(down?" below":"")} role="group" aria-label={extraText("Arkadaş puanları", "Friends’ ratings")}>
      <header><b>{linkBusy?extraText("Değerlendirme açılıyor…","Opening entry…"):extraText("Arkadaş puanları", "Friends’ ratings")}</b><span>{summary.rated}/{friends.length} {extraText("puanladı", "rated")}</span></header>
      {friends.map(friend => <button type="button" key={friend.name} className="friends-rating-row" disabled={!friendProfileUrl(friend.name)}
        title={friendProfileUrl(friend.name) ? extraText("Bu filmin Letterboxd değerlendirmesini aç", "Open this film’s Letterboxd entry") : extraText("Letterboxd bağlı değil", "Letterboxd not connected")}
        onClick={() => void openEntry(friend.name)}><FriendAvatar name={friend.name}/><span className="friend-review"><strong>{friend.name}</strong>{friend.note&&<small>{friend.note}</small>}</span><b>{friend.stars ? `${String(friend.stars).replace(".", DEC)}/5` : extraText("Puan yok", "Not rated")}</b></button>)}
    </div>}
  </div>;
}
