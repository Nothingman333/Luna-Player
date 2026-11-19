import { useLayoutEffect, useRef, type ReactNode } from "react";

/**
 * Grows or shrinks smoothly when what is inside changes size (a tab switch, a section opening), instead of the
 * panel jumping to its new height. It only animates height, so the glass around it keeps its blur.
 */
export function SmoothHeight({ children, className = "" }: { children: ReactNode; className?: string }) {
  const outer = useRef<HTMLDivElement>(null), inner = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const o = outer.current, i = inner.current;
    if (!o || !i || typeof ResizeObserver === "undefined") return;
    let last = i.offsetHeight, idle = 0;
    const done = () => { o.style.height = ""; o.style.overflow = ""; };
    const ro = new ResizeObserver(() => {
      const next = i.offsetHeight;
      if (next === last) return;
      const from = o.getBoundingClientRect().height || last;
      last = next;
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      clearTimeout(idle);
      o.style.overflow = "hidden";
      o.style.height = from + "px";
      void o.offsetHeight; // start from the old height
      o.style.height = next + "px";
      idle = window.setTimeout(done, 340);
    });
    ro.observe(i);
    return () => { ro.disconnect(); clearTimeout(idle); };
  }, []);
  return <div ref={outer} className={"smooth-h " + className}><div ref={inner}>{children}</div></div>;
}
