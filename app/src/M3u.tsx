import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { tt } from "./i18n";
import { store } from "./library";
import { matchKey } from "./textMatch";

/** .m3u / .m3u8: an HLS stream (#EXT-X-…) plays as it is; an IPTV-style list (#EXTINF lines, each
 *  followed by an address) opens as a channel list to pick from, like VLC's playlist. */
export type Channel = { name: string; url: string; group: string; logo?: string };
export type M3uList = { name: string; src: string; channels: Channel[] };
export const isM3u = (p: string) => /\.m3u8?([?#]|$)/i.test(p);

/** The title after the first comma that is not inside quotes: `#EXTINF:-1 group-title="A, B",Dune, Part Two`
 *  gives "Dune, Part Two". null when the line has no title part. */
export function extinfTitle(line: string): string | null {
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') quoted = !quoted;
    else if (c === "," && !quoted) return line.slice(i + 1).trim();
  }
  return null;
}
/** A list entry that is a path relative to the list's folder (no scheme, not rooted: "a.mkv", "..\\Movies\\a.mkv"). */
export const isRelativeLocal = (u: string) => !/^[a-z][a-z0-9+.-]*:/i.test(u) && !/^[\\/]/.test(u);
/** `dir` plus a relative path: "." and ".." are resolved and the drive is never popped. */
export function joinLocal(dir: string, rel: string): string {
  const sep = dir.includes("\\") || !dir.includes("/") ? "\\" : "/";
  const parts = dir.split(/[\\/]/).filter((p, i) => p || i === 0);
  for (const seg of rel.split(/[\\/]/)) {
    if (!seg || seg === ".") continue;
    if (seg === "..") { if (parts.length > 1) parts.pop(); } else parts.push(seg);
  }
  return parts.join(sep);
}
/** The channels shown for a group and a search text (case, accents and Turkish I/ı do not matter). */
export function filterChannels(channels: Channel[], group: string, query: string): Channel[] {
  const needle = matchKey(query.trim());
  return channels.filter((c) => (!group || c.group === group) && (!needle || matchKey(c.name).includes(needle)));
}

export function parseM3u(text: string, base?: string, dir?: string): Channel[] | "stream" {
  text = text.replace(/^\uFEFF/, "");
  if (/#EXT-X-(TARGETDURATION|STREAM-INF|MEDIA-SEQUENCE|VERSION|PLAYLIST-TYPE|ENDLIST)/i.test(text)) return "stream";
  const out: Channel[] = [];
  let info: { name: string; group: string; logo?: string } | null = null;
  let group = "";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^#EXTINF/i.test(line)) {
      const attr = (k: string) => line.match(new RegExp(k + '="([^"]*)"', "i"))?.[1];
      // the title is what follows the first comma outside quotes (it may hold commas itself); a line without
      // one has no title, so tvg-name is used rather than the whole line
      const name = extinfTitle(line) || attr("tvg-name") || "";
      info = { name, group: attr("group-title") || group, logo: attr("tvg-logo") || undefined };
    } else if (/^#EXTGRP:/i.test(line)) group = line.slice(8).trim();
    else if (!line.startsWith("#")) {
      let url = line;
      if (base && !/^[a-z][a-z0-9+.-]*:/i.test(url)) { try { url = new URL(url, base).href; } catch {} }
      else if (dir && isRelativeLocal(url)) url = joinLocal(dir, url);
      out.push({ name: info?.name || url.split(/[\\/]/).pop() || url, url, group: info?.group || group, logo: info?.logo });
      info = null;
    }
  }
  return out;
}

/** Reads a list from disk or the web. "stream" when it is one HLS stream to play directly. */
export async function readM3u(src: string): Promise<M3uList | "stream"> {
  const web = /^https?:\/\//i.test(src);
  const text = web ? await invoke<string>("http_text", { url: src }) : await invoke<string>("text_file_read", { path: src });
  // a list on disk resolves its relative entries against its own folder (mpv would use the working folder)
  const got = parseM3u(text, web ? src : undefined, !web && /[\\/]/.test(src) ? src.replace(/[\\/][^\\/]*$/, "") : undefined);
  if (got === "stream") return "stream";
  if (!got.length) throw new Error(tt("Bu listede oynatılacak bir adres yok"));
  const name = decodeURIComponent(src.split(/[\\/]/).pop() ?? src).replace(/[?#].*$/, "").replace(/\.m3u8?$/i, "") || tt("Liste");
  // recent lists, to open again from the channel window
  const recent = store.json<{ name: string; src: string }[]>("m3uRecent", []).filter((x) => x.src !== src);
  store.set("m3uRecent", JSON.stringify([{ name, src }, ...recent].slice(0, 8)));
  return { name, src, channels: got };
}

export function M3uDialog({ list, onPlay, onClose, onOpen }: { list: M3uList; onPlay: (c: Channel) => void; onClose: () => void; onOpen: (src: string) => void }) {
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<string>("");
  const groups = useMemo(() => [...new Set(list.channels.map((c) => c.group).filter(Boolean))], [list]);
  const shown = filterChannels(list.channels, group, q);
  const recent = store.json<{ name: string; src: string }[]>("m3uRecent", []).filter((x) => x.src !== list.src);
  return createPortal(
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal wide m3u">
        <div className="m3u-head">
          <div><h2>{list.name}</h2><div className="muted small">{tt("{0} yayın", list.channels.length)}{groups.length ? " · " + tt("{0} grup", groups.length) : ""}</div></div>
          <span className="grow" />
          <button className="round" aria-label={tt("Kapat")} onClick={onClose}>✕</button>
        </div>
        <input className="m3u-search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={tt("Kanal ara")} />
        {groups.length > 1 && <div className="m3u-groups">
          <button className={"seg sm" + (!group ? " on" : "")} onClick={() => setGroup("")}>{tt("Hepsi")}</button>
          {groups.slice(0, 40).map((g) => <button key={g} className={"seg sm" + (group === g ? " on" : "")} onClick={() => setGroup(g)}>{g}</button>)}
        </div>}
        <div className="m3u-list">
          {shown.slice(0, 600).map((c, i) => (
            <button key={i + c.url} className="m3u-ch" onClick={() => onPlay(c)} title={c.url}>
              {c.logo ? <img src={c.logo} alt="" loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }} /> : <span className="m3u-ph">{Array.from(c.name)[0]?.toUpperCase()}</span>}
              <span className="m3u-ch-t"><b className="ellipsis">{c.name}</b>{c.group && <span className="muted small ellipsis">{c.group}</span>}</span>
              <span className="m3u-play" aria-hidden>▶</span>
            </button>
          ))}
          {!shown.length && <div className="muted small">{tt("Eşleşen yayın yok.")}</div>}
          {shown.length > 600 && <div className="muted small">{tt("İlk 600 yayın gösteriliyor; aramayla daralt.")}</div>}
        </div>
        {recent.length > 0 && <div className="m3u-recent"><span className="muted small">{tt("Son açılan listeler:")}</span>{recent.map((r) => <button key={r.src} className="chip sm" onClick={() => onOpen(r.src)}>{r.name}</button>)}</div>}
      </div>
    </div>,
    document.body,
  );
}
