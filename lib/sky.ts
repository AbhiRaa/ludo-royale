/**
 * What the sky looks like at a given hour on someone's wall clock. Pure maths:
 * no geolocation, no network — a wall clock is all a time zone can honestly
 * tell us, and it is enough to know whether she is under sun or stars.
 */
export type RGB = [number, number, number];

export type Sky = {
  /** colour overhead */
  top: RGB;
  /** colour at the horizon */
  horizon: RGB;
  /** 0 in daylight, 1 in full night */
  night: number;
  /** height of the sun (day) or moon (night) above the horizon, 0..1 */
  elevation: number;
  isDay: boolean;
  /** key light this sky throws across the board */
  light: { color: RGB; intensity: number };
  phase: "night" | "dawn" | "day" | "golden" | "dusk";
};

const hex = (h: string): RGB => [
  parseInt(h.slice(1, 3), 16) / 255,
  parseInt(h.slice(3, 5), 16) / 255,
  parseInt(h.slice(5, 7), 16) / 255,
];
const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const KEYS: { h: number; top: RGB; hor: RGB }[] = [
  { h: 0, top: hex("#060a1f"), hor: hex("#1a2a66") },
  { h: 4.6, top: hex("#080d26"), hor: hex("#22306e") },
  { h: 5.8, top: hex("#1b2757"), hor: hex("#e98157") },
  { h: 7.2, top: hex("#3f7fd6"), hor: hex("#f6c9a0") },
  { h: 9, top: hex("#3478d4"), hor: hex("#bfe0fb") },
  { h: 13, top: hex("#2c6ccb"), hor: hex("#cfe9ff") },
  { h: 16.5, top: hex("#3a72c2"), hor: hex("#fbe0b4") },
  { h: 18.2, top: hex("#2c2e74"), hor: hex("#ff7b47") },
  { h: 19.4, top: hex("#121943"), hor: hex("#a8456b") },
  { h: 20.8, top: hex("#080d26"), hor: hex("#212f6c") },
  { h: 24, top: hex("#060a1f"), hor: hex("#1a2a66") },
];

export function skyAt(hour: number): Sky {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].h <= h) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const t = (h - a.h) / (b.h - a.h);

  const night = 1 - smooth(5, 6.8, h) + smooth(18.3, 20.6, h);
  const isDay = h >= 6 && h < 18.6;
  const sun = Math.sin(((h - 6) / 12.6) * Math.PI);
  const moon = Math.sin((((h - 18.6 + 24) % 24) / 11.4) * Math.PI);
  const elevation = Math.max(0.06, isDay ? sun : moon);

  const warm = mix(hex("#ffb26b"), hex("#fff3dc"), Math.min(1, Math.max(0, sun) * 1.6));
  const light = isDay
    ? { color: warm, intensity: 0.55 + 1.25 * Math.pow(Math.max(0, sun), 0.6) }
    : { color: hex("#9db2ff"), intensity: 0.5 };

  const phase: Sky["phase"] =
    h < 5 || h >= 20.6 ? "night" : h < 7.2 ? "dawn" : h < 16.5 ? "day" : h < 18.6 ? "golden" : "dusk";

  return { top: mix(a.top, b.top, t), horizon: mix(a.hor, b.hor, t), night: Math.min(1, night), elevation, isDay, light, phase };
}

export const PHASE_GLYPH: Record<Sky["phase"], string> = {
  night: "☾",
  dawn: "◐",
  day: "☀",
  golden: "◑",
  dusk: "◒",
};
