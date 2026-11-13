/**
 * The 3D world. One unit is one board square; the board top is y = 0 and its
 * centre is the origin, with +x to the right and +z toward the bottom of the
 * flat layout — so (col, row) maps straight to (x, z).
 */
import { Color, HOME, YARD } from "./types";
import { Cell, HOME_SLOTS, YARD_SLOTS, cellFor } from "./board";

export type Vec3 = [number, number, number];

export const PYRAMID_HEIGHT = 0.62;
export const PYRAMID_HALF = 1.5;

/** Surface height of the centre pyramid at a point. */
export const pyramidHeight = (x: number, z: number): number =>
  PYRAMID_HEIGHT * Math.max(0, 1 - Math.max(Math.abs(x), Math.abs(z)) / PYRAMID_HALF);

export const cellWorld = (c: Cell): Vec3 => [c.col - 7, 0, c.row - 7];

export function posWorld(color: Color, pos: number, token: number): Vec3 {
  if (pos === YARD) return cellWorld(YARD_SLOTS[color][token]);
  if (pos === HOME) {
    const [x, , z] = cellWorld(HOME_SLOTS[color][token]);
    return [x, pyramidHeight(x, z), z];
  }
  return cellWorld(cellFor(color, pos, token));
}

export const YARD_CENTER: Record<Color, Vec3> = {
  red: [-4.5, 0, -4.5],
  green: [4.5, 0, -4.5],
  yellow: [4.5, 0, 4.5],
  blue: [-4.5, 0, 4.5],
};

/**
 * Compass bearing of each seat's corner, as a camera-controls azimuth
 * (radians, measured from +z toward +x).
 */
export const SEAT_AZIMUTH: Record<Color, number> = {
  red: Math.atan2(-1, -1),
  green: Math.atan2(1, -1),
  yellow: Math.atan2(1, 1),
  blue: Math.atan2(-1, 1),
};

/** Pawns sharing a square fan out so they can be told apart. */
export function stackSpread(
  players: Color[],
  tokens: Record<Color, number[]>,
): Record<string, [number, number]> {
  const groups = new Map<string, string[]>();
  for (const color of players) {
    tokens[color].forEach((pos, i) => {
      if (pos === YARD || pos === HOME) return;
      const c = cellFor(color, pos, i);
      const key = `${c.col},${c.row}`;
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(`${color}-${i}`);
    });
  }
  const out: Record<string, [number, number]> = {};
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const n = Math.min(list.length, 4);
    list.forEach((key, i) => {
      const t = (Math.min(i, 3) - (n - 1) / 2) * 0.36;
      out[key] = [t, -t * 0.55];
    });
  }
  return out;
}
