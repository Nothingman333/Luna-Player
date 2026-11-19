// A finished download goes where it belongs: inside the one downloads folder, into a subfolder by kind, and into
// that part of Luna (films, music, books). Long audio (7 min+) is asked about: podcast, music or audiobook.
import { invoke } from "./nativeCore";
import { store } from "./library";

const VIDEO = /\.(mkv|mp4|m4v|avi|mov|webm|wmv|ts|m2ts)$/i;
const AUDIO = /\.(mp3|m4a|m4b|aac|flac|ogg|opus|wav|wma)$/i;
const BOOK = /\.(epub|pdf|mobi|azw3|fb2|cbz)$/i;
export const LONG_AUDIO_SECS = 7 * 60;

export type AudioChoice = "podcast" | "music" | "audiobook";
/** Asked for long audio; the App shows the question and calls back. */
export type AudioAsk = { path: string; name: string; answer: (c: AudioChoice | null) => void };

async function downloadsDir(): Promise<string> {
  return (store.get("dlDir") || (await invoke<string | null>("downloads_dir").catch(() => null)) || "").replace(/[\\/]+$/, "");
}
const sub = async (name: string) => { const d = await downloadsDir(); return d ? d + "\\" + name : ""; };
const move = async (path: string, dir: string) => (dir ? invoke<string>("move_download", { file: path, dir }) : path);

/** Luna Kitap is a book folder of its own (never the whole downloads folder: receipts and such stay out). */
function ensureBookFolder(dir: string) {
  const list = store.json<string[]>("bookFolders", []);
  if (!list.some((f) => f.toLowerCase() === dir.toLowerCase())) store.set("bookFolders", JSON.stringify([...list, dir]));
  window.dispatchEvent(new Event("luna-book-folders"));
  window.dispatchEvent(new CustomEvent("luna-rescan", { detail: { kinds: ["book"] } }));
}

export async function routeDownload(path: string, ask: (a: Omit<AudioAsk, "answer">) => Promise<AudioChoice | null>): Promise<void> {
  const name = path.split(/[\\/]/).pop() ?? path;
  if (BOOK.test(path)) {
    const dir = await sub("Luna Kitap");
    await move(path, dir);
    if (dir) ensureBookFolder(dir);
    return;
  }
  if (VIDEO.test(path)) {
    const dir = await sub("Luna Video");
    await move(path, dir);
    if (dir) window.dispatchEvent(new CustomEvent("luna-film-folder", { detail: dir }));
    return;
  }
  if (!AUDIO.test(path)) return;
  const secs = await invoke<{ duration: number }>("probe_video", { path }).then((i) => i.duration).catch(() => 0);
  const choice: AudioChoice | null = secs >= LONG_AUDIO_SECS ? await ask({ path, name }) : "music";
  if (!choice) return; // left where it is
  if (choice === "music") { await move(path, await sub("Luna Müzik")); window.dispatchEvent(new Event("luna-music-downloads")); return; }
  const folder = choice === "podcast" ? "Luna Podcast" : "Luna Sesli Kitap";
  const moved = await move(path, await sub(folder));
  window.dispatchEvent(new CustomEvent("luna-local-episode", { detail: { path: moved, title: name.replace(/\.[^.]+$/, "").replace(/_/g, " "), audiobook: choice === "audiobook" } }));
}
