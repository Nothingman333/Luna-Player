// Luna Player add-on: sends a page, link or video to Luna through luna:// (Luna starts if it is closed).
// Luna accepts only a few harmless actions with an http(s) or magnet address.

const lunaLink = (action, url, title, extra = {}) => {
  const q = new URLSearchParams({ url, ...extra });
  if (title) q.set("title", title.slice(0, 300));
  return `luna://${action}?${q}`;
};

// opening the link in the current tab lets Chrome ask "Open Luna Player?" without leaving the page
const sendToLuna = (tabId, action, url, title, extra) => {
  if (!/^(https?:|magnet:\?)/i.test(url || "")) return false;
  chrome.tabs.update(tabId, { url: lunaLink(action, url, title, extra) });
  return true;
};

// Runs inside the page (only when the user asked): what its own player plays. Luna tries the page with yt-dlp first;
// this address is the fallback for sites yt-dlp can't read. Nothing is bypassed: it is the file the browser already loads.
function findPageMedia() {
  const AUDIO = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac)([?#]|$)/i;
  const MEDIA = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|mp4|m4v|webm|m3u8|mpd)([?#]|$)/i;
  const els = [...document.querySelectorAll("audio, video")];
  // the one playing first, then any with a real address (a blob: address can't be opened outside the page)
  els.sort((a, b) => Number(a.paused) - Number(b.paused));
  for (const el of els) {
    const src = el.currentSrc || el.src || el.querySelector("source")?.src || "";
    if (/^https?:/i.test(src)) {
      const audio = el.tagName === "AUDIO" || AUDIO.test(src) || (el.videoWidth === 0 && el.readyState > 0);
      return { media: src, kind: audio ? "audio" : "video", dur: isFinite(el.duration) ? Math.round(el.duration) : 0 };
    }
  }
  // players that hide the element: the media files the page has already fetched (newest last)
  const loaded = performance.getEntriesByType("resource").map((e) => e.name).filter((n) => /^https?:/i.test(n) && MEDIA.test(n));
  const last = loaded.pop();
  if (last) return { media: last, kind: AUDIO.test(last) ? "audio" : "video", dur: 0 };
  return null;
}

// "Luna'da oynat" for a page: the page address, plus what its player plays when it can be found
async function playPage(tab) {
  let extra = {};
  try {
    const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: findPageMedia });
    const m = r?.result;
    if (m?.media) extra = { media: m.media, kind: m.kind, ...(m.dur > 0 ? { dur: String(m.dur) } : {}) };
  } catch { /* a page the add-on can't read (Chrome's own pages, the store): send the address alone */ }
  return sendToLuna(tab.id, "play", tab.url, tab.title, extra);
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: "play-page", title: "Bu sayfayı Luna'da oynat", contexts: ["page"] });
  chrome.contextMenus.create({ id: "play-link", title: "Bağlantıyı Luna'da oynat", contexts: ["link"] });
  chrome.contextMenus.create({ id: "play-video", title: "Videoyu Luna'da oynat", contexts: ["video", "audio"] });
  chrome.contextMenus.create({ id: "open-page", title: "Luna tarayıcısında aç", contexts: ["page", "link"] });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;
  if (info.menuItemId === "play-page") void playPage(tab);
  if (info.menuItemId === "play-link") sendToLuna(tab.id, "play", info.linkUrl);
  if (info.menuItemId === "play-video") {
    const src = info.srcUrl?.startsWith("blob:") ? "" : info.srcUrl;
    // the page goes first (yt-dlp knows more about it); the element's own file is the fallback
    if (src) sendToLuna(tab.id, "play", info.pageUrl, tab.title, { media: src, kind: info.mediaType === "audio" ? "audio" : "video" });
    else void playPage(tab);
  }
  if (info.menuItemId === "open-page") sendToLuna(tab.id, "open", info.linkUrl || info.pageUrl);
});

chrome.runtime.onMessage.addListener((m, _sender, reply) => {
  if (m?.type !== "luna") return;
  if (m.action === "play" && m.tab) { void playPage(m.tab).then(reply); return true; }
  reply(sendToLuna(m.tabId, m.action, m.url, m.title));
});
