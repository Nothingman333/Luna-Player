import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { tt } from "./i18n";
import { store } from "./library";

/** .m3u / .m3u8: an HLS stream (#EXT-X-…) plays as it is; an IPTV-style list (#EXTINF lines, each
 *  followed by an address) opens as a channel list to pick from, like VLC's playlist. */
export type Channel = { name: string; url: string; group: string; logo?: string };
export type M3uList = { name: string; src: string; channels: Channel[] };
export const isM3u = (p: string) => /\.m3u8?([?#]|$)/i.test(p);

export function parseM3u(text: string, base?: string): Channel[] | "stream" {
  if (/#EXT-X-(TARGETDURATION|STREAM-INF|MEDIA-SEQUENCE|VERSION|PLAYLIST-TYPE|ENDLIST)/i.test(text)) return "stream";
  const out: Channel[] = [];
  let info: { name: string; group: string; logo?: string } | null = null;
  let group = "";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^#EXTINF/i.test(line)) {
      const attr = (k: string) => line.match(new RegExp(k + '="([^"]*)"', "i"))?.[1];
      const name = line.slice(line.lastIndexOf(",") + 1).trim() || attr("tvg-name") || "";
      info = { name, group: attr("group-title") ?? group, logo: attr("tvg-logo") || undefined };
    } else if (/^#EXTGRP:/i.test(line)) group = line.slice(8).trim();
    else if (!line.startsWith("#")) {
      let url = line;
      if (base && !/^[a-z][a-z0-9+.-]*:/i.test(url)) { try { url = new URL(url, base).href; } catch {} }
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
  const got = parseM3u(text, web ? src : undefined);
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
  const needle = q.trim().toLocaleLowerCase("tr");
  const shown = list.channels.filter((c) => (!group || c.group === group) && (!needle || c.name.toLocaleLowerCase("tr").includes(needle)));
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
              {c.logo ? <img src={c.logo} alt="" loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }} /> : <span className="m3u-ph">{c.name[0]?.toUpperCase()}</span>}
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
