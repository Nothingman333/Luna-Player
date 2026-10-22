import { store } from "./library";
import { sendRaw } from "./scrobble";
import { animeQuery, Cand, parseSkipTimes, pickMal, skipUrl } from "./aniskipModel";
import type { Segment } from "./segmentModel";

/** Settings › General: opening and ending times for anime from AniSkip. Off by default: it sends the show's name and episode number. */
export const aniskipOn = () => store.get("aniskip") === "1";
const DAY = 86400000;
type Slot = { at: number; segs: Segment[] };
const slot = (k: string) => store.json<Slot | null>(k, null);

const Q = "query($q:String){Page(perPage:6){media(search:$q,type:ANIME,sort:SEARCH_MATCH){idMal title{romaji english native} format episodes seasonYear}}}";
async function candidates(query: string): Promise<Cand[]> {
  const key = "aniskipSearch:" + query.toLowerCase();
  const c = store.json<{ at: number; list: Cand[] } | null>(key, null);
  if (c && Date.now() - c.at < 30 * DAY) return c.list;
  const r = await sendRaw("POST", "https://graphql.anilist.co", "application/json", JSON.stringify({ query: Q, variables: { q: query } }));
  if (r.status !== 200) throw new Error("AniList " + r.status);
  const list = (JSON.parse(r.text)?.data?.Page?.media ?? []) as Cand[];
  store.set(key, JSON.stringify({ at: Date.now(), list }));
  return list;
}

/** Known opening/ending/recap times for a file, or [] (not an anime we can match, no data, offline). Remembered per file. */
export async function loadAniSkip(path: string, o: { title: string; season?: number; episode?: number; duration: number }): Promise<Segment[]> {
  if (!aniskipOn() || !o.episode || !(o.duration > 300)) return [];
  const key = "aniskip:" + path;
  const hit = slot(key);
  if (hit && Date.now() - hit.at < (hit.segs.length ? 30 : 3) * DAY) return hit.segs;
  try {
    const query = animeQuery(o.title);
    if (query.length < 2) return [];
    const mals = pickMal(await candidates(query), { title: query, season: o.season, episode: o.episode });
    for (const mal of mals) {
      const r = await sendRaw("GET", skipUrl(mal, o.episode, o.duration), "", "");
      if (r.status !== 200) continue;
      const segs = parseSkipTimes(JSON.parse(r.text), o.duration);
      if (segs.length) { store.set(key, JSON.stringify({ at: Date.now(), segs } satisfies Slot)); return segs; }
    }
    store.set(key, JSON.stringify({ at: Date.now(), segs: [] } satisfies Slot));
  } catch { /* offline or rate limited: try again next time */ }
  return [];
}
