import { invoke } from "./nativeCore";
import { save } from "@tauri-apps/plugin-dialog";

/** Saves a drawn canvas as PNG where the user chooses; returns the file, or null when cancelled. */
export async function saveCanvas(canvas: HTMLCanvasElement, name: string, filterName: string): Promise<string | null> {
  const safe = name.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "Luna";
  const path = await save({ defaultPath: safe + ".png", filters: [{ name: filterName, extensions: ["png"] }] }).catch(() => null);
  if (!path) return null;
  return invoke<string>("save_image", { path, data: canvas.toDataURL("image/png") });
}

/** Puts the canvas on the clipboard as a picture; false when the system doesn't allow it. */
export async function copyCanvas(canvas: HTMLCanvasElement): Promise<boolean> {
  try {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
    if (!blob || typeof ClipboardItem === "undefined") return false;
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return true;
  } catch { return false; }
}

/** An image for a canvas (TMDB and data: addresses can be drawn and read back); null when it can't load. */
export function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    if (!src.startsWith("data:")) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Draws an image to cover a box (centre crop), like CSS object-fit: cover. */
export function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / img.width, h / img.height);
  const sw = w / s, sh = h / s;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

/** A rounded rectangle path. */
export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
