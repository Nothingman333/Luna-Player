/**
 * Apple-style rubber band for the page: scrolling past the top or the bottom of a page stretches it a little with
 * growing resistance, and it springs back when the wheel stops. Only the page body moves (the header stays), and only
 * while stretched: at rest it carries no transform, so nothing fixed inside it is affected.
 */
const LIMIT = 110;        // the furthest it can stretch, in px
const REST_AFTER = 120;   // ms without wheel input before it springs back

export function installRubberBand() {
  if (typeof window === "undefined" || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  let pull = 0, body: HTMLElement | null = null, timer = 0;
  const apply = () => {
    if (!body) return;
    const off = Math.sign(pull) * LIMIT * (1 - 1 / (Math.abs(pull) / LIMIT / 2.2 + 1));
    body.style.transition = "none";
    body.style.transform = `translate3d(0, ${-off}px, 0)`;
  };
  const release = () => {
    const b = body;
    pull = 0; body = null;
    if (!b) return;
    b.style.transition = "transform .55s cubic-bezier(.2, .9, .25, 1)";
    b.style.transform = "translate3d(0, 0, 0)";
    b.dataset.rubberRest = "1";
    // a new stretch that began meanwhile keeps its transform
    const clear = () => { if (b.dataset.rubberRest) { delete b.dataset.rubberRest; b.style.transform = ""; b.style.transition = ""; } };
    b.addEventListener("transitionend", clear, { once: true });
    setTimeout(clear, 700);
  };
  // can anything between the pointer and the page still scroll this way? then it isn't the page's edge
  const innerCanScroll = (from: Element | null, shell: Element, dy: number) => {
    for (let el = from; el && el !== shell; el = el.parentElement) {
      const cs = getComputedStyle(el);
      if (!/(auto|scroll)/.test(cs.overflowY) || el.scrollHeight <= el.clientHeight + 1) continue;
      if (dy < 0 ? el.scrollTop > 0 : el.scrollTop + el.clientHeight < el.scrollHeight - 1) return true;
    }
    return false;
  };
  window.addEventListener("wheel", (e) => {
    if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY) || !e.deltaY) return;
    const t = e.target as Element | null;
    const shell = t?.closest?.(".shell") as HTMLElement | null;
    const page = shell?.querySelector<HTMLElement>(":scope > .shell-body");
    if (!shell || !page || t!.closest(".modal-bg, .cm, [role=dialog]") || innerCanScroll(t, shell, e.deltaY)) return;
    const top = shell.scrollTop <= 0, bottom = shell.scrollTop + shell.clientHeight >= shell.scrollHeight - 1;
    const outward = (e.deltaY < 0 && top) || (e.deltaY > 0 && bottom);
    // pushing back the other way while stretched eats the stretch first
    if (!outward && !pull) return;
    body = page;
    delete page.dataset.rubberRest;
    const step = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    pull = outward || Math.sign(pull + step) === Math.sign(pull) ? pull + step : 0;
    apply();
    clearTimeout(timer);
    timer = window.setTimeout(release, REST_AFTER);
  }, { passive: true });
}

/**
 * While a page scrolls, the liquid-glass lenses and the header's blur rest as plain tinted glass and come back
 * ~0.15 s after it stops. They are recomputed every frame the content under them moves: measured in Discover,
 * scrolling ran at ~100 fps with them and ~145 fps without (and slow frames went from up to 11 to 1–2 per pass).
 */
export function installScrollCalm() {
  if (typeof window === "undefined") return;
  let timer = 0, on: HTMLElement | null = null;
  window.addEventListener("scroll", (e) => {
    const el = e.target as HTMLElement | null;
    // the page, and any window that scrolls inside (a title's details)
    if (!el || !el.classList || !(el.classList.contains("shell") || el.classList.contains("modal"))) return;
    if (on !== el) { on?.classList.remove("is-scrolling"); on = el; el.classList.add("is-scrolling"); }
    clearTimeout(timer);
    timer = window.setTimeout(() => { on?.classList.remove("is-scrolling"); on = null; }, 160);
  }, { capture: true, passive: true });
}
