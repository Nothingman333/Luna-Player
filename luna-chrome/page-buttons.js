// A Luna button right on YouTube and Spotify pages, so nothing goes through the toolbar popup.
// YouTube video → "Luna'da oynat" (full-screen video in Luna); YouTube Music / Spotify → "Luna'ya ekle" (music import).
(() => {
  const host = location.hostname;
  const isSpotify = host === "open.spotify.com";
  const isYtMusic = host === "music.youtube.com";

  const target = () => {
    const u = new URL(location.href);
    if (isSpotify) return /^\/(track|album|playlist|artist)\//.test(u.pathname) ? { action: "import", label: "Luna'ya ekle" } : null;
    if (isYtMusic) return u.pathname === "/watch" || u.pathname === "/playlist" ? { action: "import", label: "Luna'ya ekle" } : null;
    if (u.pathname === "/playlist" && u.searchParams.has("list")) return { action: "import", label: "Luna'ya ekle", playlist: true };
    return u.pathname === "/watch" && u.searchParams.has("v") ? { action: "play", label: "Luna'da oynat" } : null;
  };

  const send = (action) => {
    const q = new URLSearchParams({ url: location.href });
    if (document.title) q.set("title", document.title.replace(/ - YouTube$/, "").slice(0, 300));
    // pause the page's own player so the sound doesn't play twice
    if (action === "play") document.querySelector("video")?.pause();
    location.href = `luna://${action}?${q}`;
  };

  const LOGO = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="currentColor" opacity=".25"/><path d="M15.5 4.6A8 8 0 1 0 19.4 15 6.5 6.5 0 0 1 15.5 4.6Z" fill="currentColor"/></svg>';

  const sendLink = (action, extra) => {
    const q = new URLSearchParams({ url: location.href, ...extra });
    if (document.title) q.set("title", document.title.replace(/ - YouTube$/, "").slice(0, 300));
    if (action === "play") document.querySelector("video")?.pause();
    location.href = `luna://${action}?${q}`;
  };

  // the Luna menu, drawn like YouTube's own settings menu: Play / Download › video qualities and music
  const closeMenu = () => document.getElementById("luna-ytp-menu")?.remove();
  const ICON = {
    play: '<path d="M8 5v14l11-7z" fill="#fff"/>',
    down: '<path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19h14" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    video: '<rect x="3" y="6" width="13" height="12" rx="2" stroke="#fff" stroke-width="2" fill="none"/><path d="m16 10 5-3v10l-5-3" stroke="#fff" stroke-width="2" fill="none" stroke-linejoin="round"/>',
    music: '<path d="M9 18V6l10-2v12" stroke="#fff" stroke-width="2" fill="none"/><circle cx="6.5" cy="18" r="2.5" stroke="#fff" stroke-width="2" fill="none"/><circle cx="16.5" cy="16" r="2.5" stroke="#fff" stroke-width="2" fill="none"/>',
    back: '<path d="m14 6-6 6 6 6" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  };
  const row = (icon, label, hint, act) => {
    const r = document.createElement("div");
    r.className = "luna-ytp-item";
    r.setAttribute("role", "menuitem");
    r.tabIndex = 0;
    r.innerHTML = `<span class="luna-ytp-ic">${icon ? `<svg viewBox="0 0 24 24" width="24" height="24">${ICON[icon]}</svg>` : ""}</span><span class="luna-ytp-label"></span><span class="luna-ytp-hint"></span>`;
    r.querySelector(".luna-ytp-label").textContent = label;
    r.querySelector(".luna-ytp-hint").textContent = hint || "";
    const go = (e) => { e.preventDefault(); e.stopPropagation(); act(); };
    r.addEventListener("click", go);
    r.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") go(e); });
    return r;
  };
  const head = (label, back) => {
    const h = row("back", label, "", back);
    h.classList.add("luna-ytp-head");
    return h;
  };
  // a video opened inside a playlist: Luna can open the whole list, where the user picks what to keep (nothing downloads by itself)
  const listId = () => new URL(location.href).searchParams.get("list");
  const openList = () => {
    closeMenu();
    document.querySelector("video")?.pause();
    location.href = `luna://import?${new URLSearchParams({ url: `https://www.youtube.com/playlist?list=${listId()}` })}`;
  };
  const listTitle = () => document.querySelector("ytd-playlist-panel-renderer #header-description h3 yt-formatted-string, ytd-playlist-panel-renderer .title")?.textContent?.trim() || "";
  // whole = the whole list the video was opened in
  const fill = (menu, page, whole = false) => {
    menu.replaceChildren();
    const dl = (extra) => {
      closeMenu();
      if (!whole) { sendLink("download", extra); return; }
      const q = new URLSearchParams({ url: location.href, ...extra, playlist: "1" });
      const t = listTitle();
      if (t) q.set("title", t.slice(0, 300));
      location.href = `luna://download?${q}`;
    };
    if (page === "main") {
      if (listId()) menu.append(row("music", "Listeyi Luna'da aç", "Seç", openList));
      menu.append(
        row("play", "Luna'da oynat", "Tam ekran", () => { closeMenu(); sendLink("play"); }),
        row("down", "İndir", "›", () => fill(menu, listId() ? "which" : "download")),
      );
    } else if (page === "which") {
      menu.append(
        head("İndir", () => fill(menu, "main")),
        row("video", "Bu video", "›", () => fill(menu, "download")),
        row("down", "Tüm liste", "›", () => fill(menu, "download", true)),
      );
    } else if (page === "download") {
      menu.append(
        head(whole ? "Tüm liste" : "İndir", () => fill(menu, listId() ? "which" : "main")),
        row("video", "Video", "›", () => fill(menu, "video", whole)),
        row("music", "Müzik", "›", () => fill(menu, "music", whole)),
      );
    } else if (page === "video") {
      menu.append(head("Video", () => fill(menu, "download", whole)));
      for (const h of [2160, 1440, 1080, 720, 480, 360]) {
        menu.append(row(null, `${h}p`, h >= 2160 ? "4K" : h >= 1440 ? "2K" : h >= 720 ? "HD" : "", () => dl({ kind: "video", height: String(h) })));
      }
    } else {
      menu.append(
        head("Müzik", () => fill(menu, "download", whole)),
        row(null, "En iyi kalite", "M4A", () => dl({ kind: "audio" })),
      );
    }
    menu.querySelector(".luna-ytp-item:not(.luna-ytp-head)")?.focus({ preventScroll: true });
  };
  const toggleMenu = () => {
    if (document.getElementById("luna-ytp-menu")) { closeMenu(); return; }
    const player = document.getElementById("movie_player");
    if (!player) { sendLink("play"); return; }
    const menu = document.createElement("div");
    menu.id = "luna-ytp-menu";
    menu.setAttribute("role", "menu");
    menu.addEventListener("click", (e) => e.stopPropagation());
    menu.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); closeMenu(); } });
    player.appendChild(menu);
    fill(menu, "main");
  };
  document.addEventListener("click", (e) => { if (!e.target.closest?.("#luna-ytp-menu, .luna-ytp-btn")) closeMenu(); }, true);

  // on a YouTube playlist page: a round Luna button beside "Play all", +, edit and share; Luna imports the list like any playlist link
  const placeInPlaylist = () => {
    const area = [...document.querySelectorAll("yt-flexible-actions-view-model, ytd-playlist-header-renderer #top-level-buttons-computed")].find((el) => el.getClientRects().length);
    if (!area) return false;
    // the element whose own children are the buttons (Play all, +, edit, share, ⋮), however deep YouTube nests it
    const holders = [area, ...area.querySelectorAll("*")].filter((el) => !el.closest(".luna-pl-wrap"));
    const row = holders.reduce((best, el) => {
      const n = [...el.children].filter((c) => c.querySelector("button") || c.tagName === "BUTTON").length;
      return n > best.n ? { el, n } : best;
    }, { el: null, n: 1 }).el;
    if (!row) return false;
    if (!area.querySelector(".luna-pl-btn")) {
      const b = document.createElement("button");
      b.className = "luna-pl-btn";
      b.type = "button";
      b.title = "Luna'ya ekle";
      b.setAttribute("aria-label", "Oynatma listesini Luna'ya ekle");
      b.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M14.2 4.4a8 8 0 1 0 5.4 10.4 6.2 6.2 0 0 1-5.4-10.4Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="17.6" cy="6.2" r="1.7" fill="#ff7a2a"/></svg>';
      b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); sendLink("import"); });
      // right after "Play all", on the same line: the row stays one line and "Play all" gives up a little width
      const wrap = document.createElement("div");
      wrap.className = "luna-pl-wrap " + (row.firstElementChild?.className || "");
      wrap.appendChild(b);
      row.firstElementChild ? row.firstElementChild.after(wrap) : row.appendChild(wrap);
      row.style.flexWrap = "nowrap";
      if (row.firstElementChild) row.firstElementChild.style.minWidth = "0";
    }
    return true;
  };

  // on a YouTube video the button sits in the player's own control bar, drawn like YouTube's icons
  const placeInPlayer = () => {
    const bar = document.querySelector("#movie_player .ytp-right-controls");
    if (!bar) return false;
    if (!bar.querySelector(".luna-ytp-btn")) {
      const b = document.createElement("button");
      b.className = "ytp-button luna-ytp-btn";
      b.title = "Luna'da oynat";
      b.setAttribute("aria-label", "Luna'da oynat");
      b.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M14.2 4.4a8 8 0 1 0 5.4 10.4 6.2 6.2 0 0 1-5.4-10.4Z" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><circle cx="17.6" cy="6.2" r="1.7" fill="#ff7a2a"/></svg>';
      b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); toggleMenu(b); });
      // right before the subtitles button, among YouTube's plain icons (not inside another add-on's group)
      const cc = bar.querySelector(".ytp-subtitles-button");
      if (cc?.parentElement) cc.parentElement.insertBefore(b, cc); else bar.prepend(b);
    }
    return true;
  };

  const place = () => {
    const t = target();
    let btn = document.getElementById("luna-page-btn");
    if (!t) { btn?.remove(); return; }
    if (t.playlist) { if (placeInPlaylist()) { btn?.remove(); return; } }
    else if (!isSpotify && !isYtMusic && placeInPlayer()) { btn?.remove(); return; }
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "luna-page-btn";
      btn.type = "button";
      btn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); send(btn.dataset.action); });
      document.body.appendChild(btn);
    }
    if (btn.dataset.action !== t.action) {
      btn.dataset.action = t.action;
      btn.innerHTML = LOGO + "<span></span>";
      btn.querySelector("span").textContent = t.label;
      btn.title = t.label;
    }
  };

  // both sites change pages without reloading: check again when the address changes
  let last = "";
  setInterval(() => {
    if (location.href !== last) { last = location.href; place(); }
    // YouTube rebuilds its player now and then: put the button back if it went missing
    else if (!isSpotify && !isYtMusic && target() && !document.querySelector(".luna-ytp-btn, .luna-pl-btn")) place();
  }, 700);
  place();
})();
