/* Mini video for a background web tab: the page's own <video> fills the small native window and everything else is
   hidden. Run by native code in the page's main frame only (no IPC is exposed); returns the video's state as JSON. */
(action, value) => {
  const root = document.documentElement, mark = "data-luna-mini", styleId = "luna-mini-style";
  const area = (v) => { const r = v.getBoundingClientRect(); return r.width * r.height; };
  const pick = () => {
    const all = Array.from(document.querySelectorAll("video")).filter((v) => v.readyState > 0 || v.currentSrc);
    return all.sort((a, b) => (Number(a.paused) - Number(b.paused)) || (area(b) - area(a)))[0] || null;
  };
  let video = document.querySelector("video[" + mark + "]");
  if (action === "off") {
    root.classList.remove("luna-mini"); video?.removeAttribute(mark); document.getElementById(styleId)?.remove();
    return JSON.stringify({ ok: true });
  }
  if (action === "on") {
    if (!video || !video.isConnected) { video = pick(); if (video) video.setAttribute(mark, ""); }
    if (video && !document.getElementById(styleId)) {
      const style = document.createElement("style"); style.id = styleId;
      style.textContent = "html.luna-mini,html.luna-mini body{overflow:hidden!important}"
        + "html.luna-mini *{visibility:hidden!important}"
        + "html.luna-mini video[" + mark + "]{visibility:visible!important;position:fixed!important;inset:0!important;left:0!important;top:0!important;"
        + "width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;margin:0!important;"
        + "transform:none!important;object-fit:contain!important;background:#000!important;z-index:2147483647!important}";
      (document.head || root).appendChild(style);
    }
    if (video) root.classList.add("luna-mini");
  }
  if (video && action === "seek" && Number.isFinite(value)) video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + value));
  if (video && action === "seek-to" && Number.isFinite(value) && Number.isFinite(video.duration)) video.currentTime = Math.max(0, Math.min(1, value)) * video.duration;
  return JSON.stringify(video
    ? { ok: true, time: video.currentTime || 0, duration: Number.isFinite(video.duration) ? video.duration : 0, paused: video.paused }
    : { ok: false });
}
