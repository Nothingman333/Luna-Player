// iOS-style liquid glass (Glisse) under Luna's floating buttons: the film behind a button is bent at its rim like a
// lens instead of only blurred. A trial: it can be switched off from the command palette ("Sıvı camı kapat").
import { Glass } from "glisse";
import { useSyncExternalStore } from "react";
import { store } from "./library";

const KEY = "liquidGlass";
const EVENT = "luna-liquid-glass";
const subscribe = (cb: () => void) => { window.addEventListener(EVENT, cb); return () => window.removeEventListener(EVENT, cb); };
// On unless switched off in the palette (the user asked to try it, so Windows' "transparency effects" switch doesn't hide it).
const read = () => store.get(KEY) !== "0";

export const liquidGlassOn = () => store.get(KEY) !== "0";
export function setLiquidGlass(on: boolean) {
  store.set(KEY, on ? "1" : "0");
  document.documentElement.toggleAttribute("data-liquid-glass", on);
  window.dispatchEvent(new Event(EVENT));
}
document.documentElement.toggleAttribute("data-liquid-glass", read());

/** Put as the first child of a button; the button's own label stays on top. */
export function Lens({ className = "" }: { className?: string } = {}) {
  const on = useSyncExternalStore(subscribe, read);
  return on ? <Glass className={"luna-lens" + (className ? " " + className : "")} aria-hidden /> : null;
}
