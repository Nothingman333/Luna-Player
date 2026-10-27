import { useEffect, useRef, useState } from "react";
import { openUrl } from "./linkOpen";
import { loadPlaylists, seenKey } from "./Taste";
import { loadFriendRatings, lbUser, onTasteEngine } from "./tasteEngine";
import { store } from "./library";
import { invoke } from "./nativeCore";
import { extraText } from "./Extras";
import { avatarUrl, letterboxdProfile, profileAvatar } from "./friendProfileModel";

/** Names are not usernames: only an explicitly connected profile can be opened. */
export function friendProfileUrl(name: string): string | null {
  const ratings = Object.entries(loadFriendRatings()).find(([n]) => seenKey(n) === seenKey(name))?.[1];
  const known = letterboxdProfile(ratings?.user);
  if (known) return known;
  const lists = loadPlaylists(), parent = lists.find(p => !p.parent && seenKey(p.name) === seenKey(name));
  if (!parent) return null;
  for (const list of lists.filter(p => p.id === parent?.id || p.parent === parent?.id)) {
    try {
      const url = new URL(list.source?.url ?? "");
      if (url.protocol === "https:" && url.hostname === "letterboxd.com") {
        const profile = letterboxdProfile(lbUser(url.href) ?? undefined);
        if (profile) return profile;
      }
    } catch { /* No explicit connected URL. */ }
  }
  return null;
}
export function openFriendProfile(name: string): boolean {
  const url = friendProfileUrl(name);
  if (!url) return false;
  void openUrl(url).catch(() => {});
  return true;
}

type Cached = { at: number; avatar: string | null; manual?: boolean; parser?:number };
const localPhoto = (value: string | null) => value && value.length < 400000 && /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(value) ? value : null;
const pending = new Map<string, Promise<string | null>>();
let active = 0;
const waiting: (() => void)[] = [];
async function loadAvatar(url: string, force = false): Promise<string | null> {
  const cache = store.json<Record<string, Cached>>("friendProfiles:v1", {}), old = cache[url];
  if (!force && old?.manual && localPhoto(old.avatar)) return localPhoto(old.avatar);
  if (!force && old && (old.avatar || old.parser===2) && Date.now() - old.at < (old.avatar ? 86400000 : 3600000)) return avatarUrl(old.avatar);
  if (pending.has(url)) return pending.get(url)!;
  const task = (async () => {
    if (active >= 2) await new Promise<void>(resolve => waiting.push(resolve));
    else active++;
    try {
      let avatar = avatarUrl(old?.avatar ?? null);
      try { avatar = profileAvatar(await invoke<string>("http_text", { url })) ?? avatar; } catch { /* Keep a previous photo or initials. */ }
      const current = store.json<Record<string, Cached>>("friendProfiles:v1", {});
      if (current[url]?.manual && !force) return localPhoto(current[url].avatar);
      if (avatar) store.set("friendProfiles:v1", JSON.stringify({ ...current, [url]: { at: Date.now(), avatar, parser:2 } }));
      else if (!old?.avatar) store.set("friendProfiles:v1", JSON.stringify({ ...current, [url]: { at: Date.now(), avatar: null, parser:2 } }));
      return avatar;
    } finally { const next = waiting.shift();if (next) next();else active--;pending.delete(url); }
  })();
  pending.set(url, task);
  return task;
}

export function FriendAvatar({ name }: { name: string }) {
  const root = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [, refresh] = useState(0);
  const [photoRevision, setPhotoRevision] = useState(0);
  const url = friendProfileUrl(name);
  useEffect(() => onTasteEngine(() => refresh(n => n + 1)), []);
  useEffect(() => { const update = () => setPhotoRevision(n => n + 1);window.addEventListener("luna-friend-photo", update);return () => window.removeEventListener("luna-friend-photo", update); }, []);
  useEffect(() => {
    if (!root.current) return;
    const observer = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) { setVisible(true);observer.disconnect(); } }, { rootMargin: "120px" });
    observer.observe(root.current);return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setAvatar(null);
    if (!visible || !url) return;
    let alive = true;
    void loadAvatar(url).then(photo => { if (alive) setAvatar(photo); }).catch(() => { if (alive) setAvatar(null); });
    return () => { alive = false; };
  }, [url, visible, photoRevision]);
  return <span className="friend-photo" ref={root} aria-hidden="true">{avatar ? <img src={avatar} alt="" loading="lazy" onError={() => setAvatar(null)} /> : name.split(/\s+/).map(p => Array.from(p)[0]).slice(0, 2).join("").toLocaleUpperCase("tr")}</span>;
}

export function FriendPhotoControls({ name }: { name: string }) {
  const file = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const url = friendProfileUrl(name);
  const notify = () => window.dispatchEvent(new Event("luna-friend-photo"));
  return <div className="friend-photo-controls"><button className="chip" disabled={!url || busy} onClick={async () => {
    if (!url) return;setBusy(true);
    const photo = await loadAvatar(url, true).catch(() => null);notify();setBusy(false);
    setMessage(photo ? extraText("Fotoğraf yenilendi", "Photo refreshed") : extraText("Letterboxd fotoğrafı alınamadı. Fotoğraf seç ile yerel bir görsel kullanabilirsin.", "Could not load the Letterboxd photo. Choose a local image instead."));
  }}>{extraText("Fotoğrafı yenile", "Refresh photo")}</button><button className="chip" disabled={!url || busy} onClick={() => file.current?.click()}>{extraText("Fotoğraf seç", "Choose photo")}</button>
    <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={async e => {
      const selected = e.target.files?.[0];e.target.value = "";if (!selected || !url) return;
      setBusy(true);try {
        if (!/^image\/(png|jpeg|webp)$/.test(selected.type) || selected.size > 10 * 1024 * 1024) throw new Error("Invalid image");
        const bitmap = await createImageBitmap(selected);const canvas = document.createElement("canvas");canvas.width = canvas.height = 160;
        const context = canvas.getContext("2d");if (!context) { bitmap.close();throw new Error("Canvas unavailable"); }
        const side = Math.min(bitmap.width, bitmap.height);context.drawImage(bitmap, (bitmap.width-side)/2, (bitmap.height-side)/2, side, side, 0, 0, 160, 160);bitmap.close();
        const avatar = canvas.toDataURL("image/png");if (!localPhoto(avatar)) throw new Error("Invalid image");
        const cache = store.json<Record<string, Cached>>("friendProfiles:v1", {});
        if (!store.set("friendProfiles:v1", JSON.stringify({ ...cache, [url]: { at: Date.now(), avatar, manual: true } }))) throw new Error("Could not save");
        notify();setMessage(extraText("Fotoğraf kaydedildi", "Photo saved"));
      } catch { setMessage(extraText("Fotoğraf kaydedilemedi. PNG, JPG veya WebP (en fazla 10 MB) seç.", "Could not save the photo. Choose PNG, JPG or WebP (up to 10 MB).")); } finally { setBusy(false); }
    }}/><span className="muted small" role="status">{message}</span></div>;
}

export function FriendProfileButton({ name, className = "", text = false }: { name: string; className?: string; text?: boolean }) {
  const url = friendProfileUrl(name);
  const label = url ? extraText(`${name} · Letterboxd profilini aç`, `${name} · Open Letterboxd profile`) : extraText(`${name} · Letterboxd bağlı değil`, `${name} · Letterboxd not connected`);
  return <button type="button" className={`friend-profile-button ${className}`} disabled={!url} title={label} aria-label={label} onClick={() => openFriendProfile(name)}><FriendAvatar name={name}/>{text && <span>{extraText("Letterboxd profili", "Letterboxd profile")}</span>}</button>;
}
