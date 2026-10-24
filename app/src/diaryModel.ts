import type { DiaryEntry } from "./Taste";

/** Invalid rows stay in storage, but cannot crash the diary's list or removal action. */
export function isDiaryEntry(value: unknown): value is DiaryEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.title === "string" && !!row.title.trim() && typeof row.at === "number" && Number.isFinite(row.at)
    && (row.year === undefined || typeof row.year === "string");
}
