// The button becomes the menu. A window, panel or menu that opens right after a click grows out of the thing that was
// clicked (a box the size of the button, at the button, turns into the panel), and when it closes it shrinks back into
// that button. Works for every opener without touching their code: a MutationObserver sees what appeared.
// Rollback point for the design pass: git tag tasarim-oncesi-2026-11-16.
import { flushSync } from "react-dom";

/** What can open something. */
const SOURCES = "button, [role=button], .poster, .card, label.search, .hero";
/** What opens. The first match in an added subtree is the one that morphs. */
const TARGETS = [
  ".modal", ".chat-ws", ".notify-panel", ".global-search", ".details", ".tracks", ".sync",
  ".cm:not(.player-submenu):not(.sub)", ".wp-pop", ".disc-filter-menu", ".home-feature-panel.active",
  // every other menu or popover opened from a button (glisse: the button turns into it)
  ".la-opts", ".friends-ratings", ".fc-pop", ".fc-rate", ".song-rate", ".lp-menu", ".share-pop", ".sub-search",
  ".luna-select-options", ".lx-pop", ".mini-vol-pop", ".tr-menu",
].join(", ");
const FRESH_MS = 700;

type Source = { el: Element; rect: DOMRect; at: number };
let last: Source | null = null;
const live = new Map<Element, Source & { box: DOMRect; r0: number; r1: number; hid?: boolean }>();
/** glisse: a menu that opens over its own button takes the button's place, so the button hides until it is back. */
const unhide = (src: { el: Element; hid?: boolean } | undefined) => { if (src?.hid) { (src.el as HTMLElement).style.opacity = ""; src.hid = false; } };
/** Small pieces (menus, popovers) keep their glass while they grow: re-blurring them is cheap, and glass that only
 *  "arrives" at the end looked like a late load. Big windows still switch their blur on when they have landed. */
const small = (r: DOMRect) => r.width * r.height < 520 * 700;

/** How far each open page was scrolled: a page taken out of the document forgets it, its closing copy must not. */
const scrolled = new WeakMap<Element, number>();
const onScroll = (e: Event) => { const t = e.target as Element; if (live.has(t)) scrolled.set(t, (t as HTMLElement).scrollTop); };
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

function remember(e: Event) {
  if (e instanceof PointerEvent && e.button !== 0) return; // a right-click menu opens at the pointer, not out of a button
  const t = e.target as Element | null;
  const el = t?.closest?.(SOURCES);
  // a button inside an open window (a title's ⋯) opens its own menu out of itself too; grow() still refuses a target
  // that holds the button or is already open
  if (!el) return;
  last = { el, rect: el.getBoundingClientRect(), at: performance.now() };
}

/** A corner radius as pixels (a round button's 50% included). */
function radius(el: Element, box: DOMRect) {
  const r = getComputedStyle(el).borderTopLeftRadius;
  const n = parseFloat(r) || 0;
  return r.endsWith("%") ? (Math.min(box.width, box.height) * n) / 100 : n;
}

type Box = { left: number; top: number; width: number; height: number };
const lerp = (a: Box, b: Box, k: number): Box => ({
  left: a.left + (b.left - a.left) * k, top: a.top + (b.top - a.top) * k,
  width: a.width + (b.width - a.width) * k, height: a.height + (b.height - a.height) * k,
});

/**
 * One moment of the box: `b` (a box on screen) cut out of the target with clip-path, corners `r`. Where `b` isn't
 * inside the target (a button above its menu) the target is moved so the cut-out lands on `b`. Also returns the box
 * as it is seen, for the soft rim that travels with it.
 */
function boxAt(b: Box, to: DOMRect, r: number) {
  const w = Math.min(b.width, to.width), h = Math.min(b.height, to.height);
  const x = Math.min(Math.max(b.left - to.left, 0), to.width - w);
  const y = Math.min(Math.max(b.top - to.top, 0), to.height - h);
  const dx = b.left + (b.width - w) / 2 - (to.left + x), dy = b.top + (b.height - h) / 2 - (to.top + y);
  const rr = Math.min(r, w / 2, h / 2);
  return {
    clip: { clipPath: `inset(${y}px ${to.width - x - w}px ${to.height - y - h}px ${x}px round ${rr}px)`, translate: `${dx}px ${dy}px` },
    rim: { left: to.left + x + dx + "px", top: to.top + y + dy + "px", width: w + "px", height: h + "px", borderRadius: rr + "px" },
  };
}
/** Corners while the box travels: big and soft (like a card), whatever the button or the window has at rest. */
const flight = (r0: number, r1: number, to: DOMRect) => Math.max(r0, r1, Math.min(36, Math.min(to.width, to.height) / 5));
// iOS sheet curve: leaves the button at once, then glides a long way into place with no bounce
const OPEN_EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
const CLOSE_EASE = "cubic-bezier(0.45, 0, 0.15, 1)";
/** Unhurried: a menu ~0.5 s, a whole page ~0.75 s. */
const duration = (to: DOMRect) => Math.round(Math.min(780, 420 + Math.sqrt(to.width * to.height) / 4.5));

/**
 * Keyframes for the box going from `a` to `b` (both boxes on screen); the motion is a straight line in time while
 * the corners follow `radii` ([offset, radius] pairs), so they can stay round all the way and only settle at the end.
 */
function path(a: Box, b: Box, to: DOMRect, radii: [number, number][]) {
  const clip: Keyframe[] = [], rim: Keyframe[] = [];
  for (const [o, r] of radii) {
    const f = boxAt(lerp(a, b, o), to, r);
    clip.push({ ...f.clip, offset: o });
    rim.push({ ...f.rim, offset: o });
  }
  return { clip, rim };
}

/** A soft rim (shadow under the edge, the projector line on top) that travels with the box so its edge isn't a hard cut. */
function rimFor(t: HTMLElement) {
  const el = document.createElement("div");
  el.setAttribute("data-morph-ghost", "");
  el.setAttribute("aria-hidden", "true");
  el.className = "morph-rim";
  const z = parseInt(getComputedStyle(t).zIndex, 10);
  el.style.zIndex = String(Number.isFinite(z) ? z + 1 : 401);
  t.after(el);
  return el;
}
/** The rim is position: fixed, but inside a frosted window (backdrop-filter, transform) "fixed" is measured from that
 *  window, not the screen: the rim then ran beside the menu, as if the menu opened twice. Its keyframes are moved by
 *  that offset so it travels exactly with the box. */
function placed(rim: HTMLElement, frames: Keyframe[]) {
  rim.style.left = "0px"; rim.style.top = "0px";
  const o = rim.getBoundingClientRect();
  if (!o.left && !o.top) return frames;
  return frames.map((f) => ({ ...f, left: parseFloat(String(f.left)) - o.left + "px", top: parseFloat(String(f.top)) - o.top + "px" }));
}

function grow(t: Element) {
  const src = last;
  if (!src || performance.now() - src.at > FRESH_MS || !(t instanceof HTMLElement) || reduced()) return;
  if (t.closest("[data-morph-ghost]") || t.contains(src.el) || live.has(t)) return;
  // a page tab or Film/Müzik/Kitap swaps the page (a view transition does that), it doesn't open a window
  if (src.el.closest(".app-header .tabs, .mode-switch")) return;
  // the panel's own entrance would fight the morph (and moves its box): the morph is the entrance now
  for (const a of t.getAnimations()) if (a instanceof CSSAnimation) a.cancel();
  const to = t.getBoundingClientRect();
  if (to.width < 60 || to.height < 40) return;
  last = null;
  t.setAttribute("data-morph-t", "");
  const r0 = radius(src.el, src.rect), r1 = radius(t, to);
  const b = src.el.getBoundingClientRect();
  const covers = b.width > 0 && b.left >= to.left - 1 && b.top >= to.top - 1 && b.right <= to.right + 1 && b.bottom <= to.bottom + 1;
  // (opacity, not visibility: the menu gives focus back to its button when it closes, a hidden button can't take it)
  if (covers) (src.el as HTMLElement).style.opacity = "0";
  live.set(t, { ...src, box: to, r0, r1, hid: covers });
  const light = small(to);
  const ms = duration(to), R = flight(r0, r1, to);
  const p = path(src.rect, to, to, [[0, r0], [0.3, R], [0.86, R], [1, r1]]);
  const opts: KeyframeAnimationOptions = { duration: ms, easing: OPEN_EASE };
  // glass inside the growing box would be re-blurred every frame (that is what made big windows stutter): it comes on
  // once the box has landed
  if (!light) t.setAttribute("data-morphing", "");
  const anim = t.animate(p.clip, opts);
  // (a glass at less than full opacity loses its blur in Chromium: small pieces don't dip, their contents fade in)
  if (!light) t.animate([{ opacity: 0.4 }, { opacity: 1, offset: 0.18 }, { opacity: 1 }], opts);
  const rim = rimFor(t);
  rim.animate(placed(rim, p.rim), opts);
  rim.animate([{ opacity: 1 }, { opacity: 1, offset: 0.75 }, { opacity: 0 }], opts);
  const done = () => { rim.remove(); t.removeAttribute("data-morphing"); };
  anim.finished.catch(() => {}).finally(done);
  window.setTimeout(done, ms + 250);
  t.style.willChange = "clip-path, translate";
  window.setTimeout(() => { t.style.willChange = ""; }, ms + 50);
  // a panel that only switched on (it stays in the page) is done once it has grown: clicks inside it are clicks again
  if (t.matches(".home-feature-panel")) anim.finished.catch(() => {}).finally(() => live.delete(t));
}

/** A target was taken out of the page: a copy of it shrinks back into its opener's box and then goes. */
function shrink(gone: Element, t: Element, parent: Node, next: Node | null) {
  const src = live.get(t)!;
  live.delete(t);
  if (reduced() || !parent.isConnected || document.querySelector(".root.playing")) { unhide(src); return; }
  // a hidden button still measures as itself (opacity keeps its box)
  const rect = src.el.isConnected ? src.el.getBoundingClientRect() : src.rect;
  if (!rect.width) { unhide(src); return; }
  const ghost = gone.cloneNode(true) as HTMLElement;
  ghost.setAttribute("data-morph-ghost", "");
  ghost.setAttribute("aria-hidden", "true");
  ghost.inert = true;
  ghost.style.pointerEvents = "none";
  // the page itself went (not a window inside a curtain): pin its copy where it stood, the shelves are back in its place
  if (gone === t) Object.assign(ghost.style, { position: "fixed", left: src.box.left + "px", top: src.box.top + "px", width: src.box.width + "px", height: src.box.height + "px", margin: "0", zIndex: "400" });
  parent.insertBefore(ghost, next && next.parentNode === parent ? next : null);
  for (const a of ghost.getAnimations({ subtree: true })) a.cancel();
  if (gone === t) ghost.scrollTop = scrolled.get(t) ?? 0;
  const inner = (ghost.matches("[data-morph-t]") ? ghost : ghost.querySelector("[data-morph-t]")) as HTMLElement | null;
  if (!inner) { ghost.remove(); unhide(src); return; }
  const to = inner.getBoundingClientRect(), light = small(to);
  const ms = Math.round(duration(to) * 0.8), R = flight(src.r0, src.r1, to);
  inner.style.willChange = "clip-path, translate, opacity";
  if (!light) inner.setAttribute("data-morphing", "");
  // the box folds back into the button with round corners, lands there, then dissolves into it
  const p = path(to, rect, to, [[0, src.r1], [0.12, R], [0.8, R], [1, src.r0]]);
  const opts: KeyframeAnimationOptions = { duration: ms, easing: CLOSE_EASE, fill: "forwards" };
  const anim = inner.animate(p.clip, opts);
  // a small piece keeps its glass to the end and only its contents fade; it dissolves into the button at the very end
  if (light) for (const c of Array.from(inner.children)) (c as HTMLElement).animate?.([{ opacity: 1 }, { opacity: 0, offset: 0.4 }, { opacity: 0 }], opts);
  inner.animate([{ opacity: 1 }, { opacity: 1, offset: light ? 0.9 : 0.62 }, { opacity: 0 }], opts);
  const rim = rimFor(inner);
  rim.animate(placed(rim, p.rim), opts);
  rim.animate([{ opacity: 1 }, { opacity: 0.8, offset: 0.62 }, { opacity: 0 }], opts);
  // a window's curtain fades out with it
  if (ghost !== inner) ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms, easing: "ease-out", fill: "forwards" });
  const done = () => { ghost.remove(); rim.remove(); unhide(src); };
  anim.finished.catch(() => {}).finally(done);
  window.setTimeout(done, ms + 250); // a hidden window doesn't run animations: never leave the copy behind
}

function onMutations(records: MutationRecord[]) {
  const fresh = !!last && performance.now() - last.at <= FRESH_MS;
  let added = false;
  for (const r of records) {
    if (r.type === "attributes") {
      const el = r.target as Element;
      if (fresh && el.classList?.contains("home-feature-panel") && el.classList.contains("active") && !(r.oldValue || "").includes("active")) { grow(el); added = true; }
      continue;
    }
    if (!fresh) continue;
    for (const n of r.addedNodes) {
      if (!(n instanceof Element) || n.hasAttribute("data-morph-ghost")) continue;
      const t = n.matches(TARGETS) ? n : n.querySelector(TARGETS);
      if (t) { grow(t); added = true; }
    }
  }
  if (!live.size) return;
  for (const r of records) {
    if (r.type !== "childList") continue;
    for (const n of r.removedNodes) {
      if (!(n instanceof Element) || n.hasAttribute("data-morph-ghost")) continue;
      for (const t of [...live.keys()]) {
        if (n !== t && !n.contains(t)) continue;
        // swapped for a new one of the same kind (another film's page): no way back to show
        if (added) { unhide(live.get(t)); live.delete(t); continue; }
        shrink(n, t, r.target, r.nextSibling);
      }
    }
  }
  // panels that went away inside something that stays (a class change) are forgotten
  for (const t of [...live.keys()]) if (!t.isConnected) { unhide(live.get(t)); live.delete(t); }
}

let installed = false;
export function installMorph() {
  if (installed) return () => {};
  installed = true;
  window.addEventListener("pointerdown", remember, true);
  window.addEventListener("click", remember, true);
  window.addEventListener("scroll", onScroll, { capture: true, passive: true });
  const mo = new MutationObserver(onMutations);
  mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"], attributeOldValue: true });
  return () => {
    installed = false;
    window.removeEventListener("pointerdown", remember, true);
    window.removeEventListener("click", remember, true);
    window.removeEventListener("scroll", onScroll, true);
    mo.disconnect();
    live.clear();
  };
}

/**
 * Page changes (a tab, Film/Müzik/Kitap) as one soft move: the page you leave fades out drifting back while the new one
 * glides in from the side you moved to, both at once, so there is never an empty frame in between. The header stays
 * put (its pill slides on its own). Updates asked for in the same moment go in one transition.
 */
let queue: (() => void)[] | null = null;
export function softly(update: () => void, animate = true) {
  type VT = Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };
  const d = document as VT;
  if (!animate || !d.startViewTransition || reduced() || document.querySelector(".root.playing")) { update(); return; }
  if (queue) { queue.push(update); return; }
  // which way: from the lit tab toward the one just pressed
  const pressed = document.activeElement as HTMLElement | null;
  const lit = pressed?.parentElement?.querySelector<HTMLElement>(":scope > .on");
  const back = !!pressed && !!lit && pressed !== lit && pressed.getBoundingClientRect().left < lit.getBoundingClientRect().left;
  document.documentElement.dataset.navDir = back ? "back" : "fwd";
  queue = [update];
  // A transition cut short (fast tab switching) rejects its promises; the update itself still ran, so that is not an error.
  const vt = d.startViewTransition(() => { const q = queue ?? []; queue = null; flushSync(() => q.forEach((f) => f())); }) as { finished: Promise<void>; ready?: Promise<void>; updateCallbackDone?: Promise<void> };
  for (const p of [vt.finished, vt.ready, vt.updateCallbackDone]) p?.catch(() => {});
}

/** Luna Web shows only its own page (no website): a native site sits outside the page and can't take part in a view transition. */
export const webAtStart = () => !!document.querySelector(".browser-shell.is-start:not([hidden])");
