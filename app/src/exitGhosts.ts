/**
 * Menus, panels and the settings window close as smoothly as they open — for the pieces Morph.ts doesn't already fold
 * back into a button (one opened at the pointer by a right-click, a dropdown, a popover).
 *
 * Luna's floating pieces are rendered conditionally ({open && <Menu/>}), so React removes them at once and they
 * vanished in a single frame. One observer catches such a piece the moment React removes it, puts that same (now
 * unused, inert) element back where it was for a moment, plays the closing animation from Cinema.css (.lg-leaving)
 * and then removes it for good.
 */
const EXIT = [
  ".cm:not(.player-submenu)", ".la-opts", ".friends-ratings", ".disc-filter-menu", ".fc-pop", ".fc-rate", ".song-rate",
  ".lp-menu", ".share-pop", ".notify-panel", ".luna-select-options", ".tracks", ".sync", ".sub-search", ".wp-pop",
  ".chat-ws", ".chat-scrim", ".lx-pop", ".full-tip", ".mini-vol-pop", ".tr-menu", ".tr-pop", ".update-popup",
].join(", ");
const DIRECT = `:scope > :is(${EXIT})`;
const MAX_MS = 320;

function leave(node: HTMLElement, parent: Node, next: Node | null, glass: HTMLElement[]) {
  node.dataset.ghost = "";
  node.setAttribute("inert", "");
  node.setAttribute("aria-hidden", "true");
  node.style.pointerEvents = "none";
  try { parent.insertBefore(node, next && next.parentNode === parent ? next : null); } catch { return; }
  // in-flow pieces would push the page around: only floating ones (or ones inside a floating wrapper) come back
  const floats = (el: HTMLElement) => { const p = getComputedStyle(el).position; return p === "absolute" || p === "fixed"; };
  if (!floats(node) && !floats(glass[0])) { node.remove(); return; }
  for (const g of glass) g.classList.add("lg-leaving");
  let gone = false;
  const done = () => { if (gone) return; gone = true; node.remove(); };
  glass[0].addEventListener("animationend", (e) => { if (e.target === glass[0]) done(); });
  window.setTimeout(done, MAX_MS);
}

export function installExitGhosts() {
  if (typeof MutationObserver === "undefined" || typeof document === "undefined") return;
  const calm = matchMedia("(prefers-reduced-motion: reduce)");
  new MutationObserver((records) => {
    if (calm.matches || document.hidden) return;
    for (const r of records) {
      if (!r.removedNodes.length || !(r.target as Node).isConnected) continue;
      // the same piece put back right away (a re-render with a new key) is not a close
      const added = new Set<string>();
      r.addedNodes.forEach((a) => { if (a instanceof HTMLElement) added.add(a.className); });
      r.removedNodes.forEach((n) => {
        if (!(n instanceof HTMLElement) || "ghost" in n.dataset || n.hasAttribute("data-morph-ghost") || added.has(n.className)) return;
        const glass = n.matches(EXIT) ? [n] : Array.from(n.querySelectorAll<HTMLElement>(DIRECT));
        if (!glass.length || glass.length > 2) return;
        // grown out of a button by Morph.ts: Morph folds it back into that button (and its curtain with it)
        if (glass.some((g) => g.hasAttribute("data-morph-t")) || n.querySelector("[data-morph-t]")) return;
        leave(n, r.target, r.nextSibling, glass);
      });
    }
  }).observe(document.body, { childList: true, subtree: true });
}
