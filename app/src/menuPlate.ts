/**
 * Glisse-style menus: one highlight plate slides under the item the pointer (or keyboard focus) is on, instead of
 * each row lighting up on its own. Works for every Luna context menu (.cm) and Luna Web's menus through one delegated listener.
 */
const ITEM = ".cm-item:not(:disabled), .browser-tab-menu > button:not(:disabled), .set-nav > .set-nav-i";
const MENU = ".cm, .browser-tab-menu, .set-nav";
// lists whose chosen row also has a plate of its own that slides to the new choice (Settings, Collections)
const PICK = ".set-nav";

function plateOf(menu: HTMLElement) {
  let p = menu.querySelector<HTMLElement>(":scope > .cm-plate");
  if (!p) {
    p = document.createElement("div");
    p.className = "cm-plate";
    p.setAttribute("aria-hidden", "true");
    menu.prepend(p);
  }
  return p;
}

function moveTo(item: HTMLElement) {
  const menu = item.closest<HTMLElement>(MENU);
  if (!menu) return;
  const p = plateOf(menu), fresh = !p.classList.contains("on");
  const danger = item.classList.contains("danger");
  // first appearance: jump there without sliding in from the corner
  if (fresh) p.style.transition = "none";
  p.style.transform = `translate(${item.offsetLeft}px, ${item.offsetTop}px)`;
  p.style.width = item.offsetWidth + "px";
  p.style.height = item.offsetHeight + "px";
  p.classList.toggle("danger", danger);
  p.classList.add("on");
  menu.classList.add("has-plate");
  if (fresh) { void p.offsetWidth; p.style.transition = ""; }
}

/** The chosen row's plate: slides from the old choice to the new one instead of the highlight jumping. */
function placePick(list: HTMLElement) {
  const on = list.querySelector<HTMLElement>(":scope > .set-nav-i.on");
  let p = list.querySelector<HTMLElement>(":scope > .nav-pick");
  if (!on) { p?.remove(); list.classList.remove("has-pick"); return; }
  const fresh = !p;
  if (!p) {
    p = document.createElement("div");
    p.className = "nav-pick";
    p.setAttribute("aria-hidden", "true");
    list.prepend(p);
    p.style.transition = "none";
  }
  p.style.transform = `translate(${on.offsetLeft}px, ${on.offsetTop}px)`;
  p.style.width = on.offsetWidth + "px";
  p.style.height = on.offsetHeight + "px";
  list.classList.add("has-pick");
  if (fresh) { void p.offsetWidth; p.style.transition = ""; }
}
const pickSoon = (el: Element | null) => {
  const list = el?.closest?.<HTMLElement>(PICK);
  if (list) window.setTimeout(() => list.isConnected && placePick(list), 0); // React has committed the new choice by then
};

function hide(menu: HTMLElement) {
  menu.querySelector<HTMLElement>(":scope > .cm-plate")?.classList.remove("on");
}

export function installMenuPlate() {
  if (typeof document === "undefined") return;
  document.addEventListener("pointerover", (e) => {
    const t = e.target as HTMLElement | null;
    const item = t?.closest?.<HTMLElement>(ITEM);
    if (item) moveTo(item);
    const list = t?.closest?.<HTMLElement>(PICK);
    if (list && !list.querySelector(":scope > .nav-pick")) placePick(list);
  }, true);
  document.addEventListener("click", (e) => pickSoon(e.target as Element), true);
  document.addEventListener("pointerout", (e) => {
    const menu = (e.target as HTMLElement | null)?.closest?.<HTMLElement>(MENU);
    const to = e.relatedTarget as HTMLElement | null;
    if (menu && !(to && menu.contains(to) && to.closest(ITEM))) {
      if (!(to && menu.contains(to))) hide(menu);
    }
  }, true);
  document.addEventListener("focusin", (e) => {
    const item = (e.target as HTMLElement | null)?.closest?.<HTMLElement>(ITEM);
    if (item) moveTo(item);
    pickSoon(e.target as Element);
  });
}
