import { Color, GameState, HOME, YARD, ClientState } from "./types";
import { Cell, HOME_SLOTS, YARD_SLOTS, cellFor } from "./board";

export const BOARD = 720;
export const CELL = 48;
export const TOKEN = 38;
export const HALF = TOKEN / 2;

export type Point = { x: number; y: number };

export const cellXY = (c: Cell): Point => ({ x: (c.col + 0.5) * CELL, y: (c.row + 0.5) * CELL });

export function posXY(color: Color, pos: number, token: number): Point {
  if (pos === YARD) return cellXY(YARD_SLOTS[color][token]);
  if (pos === HOME) return cellXY(HOME_SLOTS[color][token]);
  return cellXY(cellFor(color, pos, token));
}

/** Pixel waypoints for a walk, excluding the starting square. */
export function pathXY(color: Color, from: number, to: number, token: number): Point[] {
  if (from === YARD) return [posXY(color, 0, token)];
  const out: Point[] = [];
  for (let p = from + 1; p <= to; p++) out.push(posXY(color, p, token));
  return out;
}

export const tokenKey = (color: Color, i: number) => `${color}-${i}`;

/**
 * Tokens sharing a square fan out slightly so you can always count them.
 * Only applies on the shared track — yard and home have their own slots.
 */
export function stackOffsets(state: GameState | ClientState): Record<string, Point> {
  const groups = new Map<string, string[]>();
  for (const seat of state.seats) {
    const positions = state.tokens[seat.color];
    positions.forEach((pos, i) => {
      if (pos === YARD || pos === HOME) return;
      const c = cellFor(seat.color, pos, i);
      const k = `${c.col},${c.row}`;
      const list = groups.get(k) ?? [];
      list.push(tokenKey(seat.color, i));
      groups.set(k, list);
    });
  }
  const out: Record<string, Point> = {};
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const n = Math.min(list.length, 4);
    list.forEach((key, i) => {
      const t = (Math.min(i, 3) - (n - 1) / 2) * 8.5;
      out[key] = { x: t, y: -t * 0.55 };
    });
  }
  return out;
}

export type Swatch = { base: string; light: string; dark: string; deep: string };

export const PALETTE: Record<Color, Swatch> = {
  red:    { base: "#D6412F", light: "#FF7A66", dark: "#8B2317", deep: "#5A1409" },
  green:  { base: "#2E9E7B", light: "#63D8B0", dark: "#17614A", deep: "#0C3B2C" },
  yellow: { base: "#EFA00B", light: "#FFD26B", dark: "#A2660A", deep: "#6B4204" },
  blue:   { base: "#3B6FD4", light: "#7FA9F5", dark: "#1E3F87", deep: "#132A5C" },
};

export const BRASS = "#C9A227";
export const BRASS_HI = "#F3DE9B";
export const IVORY = "#EFE5D2";
export const LACQUER = "#1D1613";

export const COLOR_LABEL: Record<Color, string> = {
  red: "Vermilion",
  green: "Jade",
  yellow: "Saffron",
  blue: "Lapis",
};

/* --- animation timing (ms) ------------------------------------------- */
export const HOP_MS = 135;
export const HOP_RISE = 22;
export const CAPTURE_MS = 620;
export const DICE_MS = 1150;
