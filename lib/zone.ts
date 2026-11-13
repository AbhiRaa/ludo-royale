import type { Zone } from "./ludo/types";

/** The viewer's own clock. Safe to call only in the browser. */
export function localZone(): Zone | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Etc/UTC";
    return { tz, offsetMin: -new Date().getTimezoneOffset() };
  } catch {
    return null;
  }
}

const PLACE: Record<string, string> = {
  "Asia/Kolkata": "India",
  "Asia/Calcutta": "India",
  "Etc/House": "Elsewhere",
  "Etc/UTC": "UTC",
};

export function placeName(zone: Zone | null): string {
  if (!zone) return "";
  if (PLACE[zone.tz]) return PLACE[zone.tz];
  const last = zone.tz.split("/").pop() ?? zone.tz;
  return last.replace(/_/g, " ");
}

/** Hour of day, 0..24, on that player's wall clock. */
export function localHour(zone: Zone | null, now = Date.now()): number {
  const offset = zone ? zone.offsetMin : -new Date(now).getTimezoneOffset();
  const minutes = (((now / 60000 + offset) % 1440) + 1440) % 1440;
  return minutes / 60;
}

export function clockLabel(zone: Zone | null, now = Date.now()): string {
  const h = localHour(zone, now);
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
