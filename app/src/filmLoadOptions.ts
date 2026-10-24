export type FilmTrackPref = { aid?: number; sid?: number | "no"; sidExt?: string };
/** File-scoped options prevent track/default state from leaking between two rapidly opened files. */
export function filmLoadOptions(input: {
  fromStart: boolean; position?: {time: number; duration: number}; jump?: number;
  delay: unknown; audioDelay: unknown; subSpeed: unknown; pref: FilmTrackPref | null;
}): string {
  const finite = (value: unknown, fallback = 0) => { const n = Number(value); return Number.isFinite(n) ? n : fallback; };
  const position = input.position;
  const start = input.jump != null && Number.isFinite(input.jump) && input.jump >= 0 ? input.jump
    : !input.fromStart && position && Number.isFinite(position.time) && Number.isFinite(position.duration)
      && position.time > 10 && position.time < position.duration - 30 ? position.time : 0;
  const speed = finite(input.subSpeed, 1);
  const options = [`start=${start}`, `sub-delay=${finite(input.delay)}`, `audio-delay=${finite(input.audioDelay)}`,
    `sub-speed=${speed > 0.5 && speed < 2 ? speed : 1}`, "secondary-sid=no"];
  if (Number.isInteger(input.pref?.aid) && input.pref!.aid! > 0) options.push(`aid=${input.pref!.aid}`);
  if (input.pref?.sid === "no") options.push("sid=no");
  else if (Number.isInteger(input.pref?.sid) && Number(input.pref?.sid) > 0) options.push(`sid=${input.pref!.sid}`);
  return options.join(",");
}
