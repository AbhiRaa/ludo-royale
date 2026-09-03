import { COLORS, Color, HOME, YARD } from "./types";

export type Cell = { col: number; row: number };

export const GRID = 15;

/**
 * The shared 52-cell ring, clockwise, index 0 == red's entry square.
 * Layout is the standard 15x15 cross: each arm is 6 long x 3 wide, the
 * middle 3x3 (cols/rows 6..8) is the finish block.
 *
 * Quadrant shape (13 cells each): 6 along an arm's outer lane, 6 up the
 * next arm's outer lane, 1 across the arm's tip.
 */
export const RING: Cell[] = [
  // --- red quadrant: left arm top lane -> top arm left lane -> top tip
  { col: 1, row: 6 }, { col: 2, row: 6 }, { col: 3, row: 6 }, { col: 4, row: 6 }, { col: 5, row: 6 },
  { col: 6, row: 5 }, { col: 6, row: 4 }, { col: 6, row: 3 }, { col: 6, row: 2 }, { col: 6, row: 1 }, { col: 6, row: 0 },
  { col: 7, row: 0 },
  { col: 8, row: 0 },
  // --- green quadrant: top arm right lane -> right arm top lane -> right tip
  { col: 8, row: 1 }, { col: 8, row: 2 }, { col: 8, row: 3 }, { col: 8, row: 4 }, { col: 8, row: 5 },
  { col: 9, row: 6 }, { col: 10, row: 6 }, { col: 11, row: 6 }, { col: 12, row: 6 }, { col: 13, row: 6 }, { col: 14, row: 6 },
  { col: 14, row: 7 },
  { col: 14, row: 8 },
  // --- yellow quadrant: right arm bottom lane -> bottom arm right lane -> bottom tip
  { col: 13, row: 8 }, { col: 12, row: 8 }, { col: 11, row: 8 }, { col: 10, row: 8 }, { col: 9, row: 8 },
  { col: 8, row: 9 }, { col: 8, row: 10 }, { col: 8, row: 11 }, { col: 8, row: 12 }, { col: 8, row: 13 }, { col: 8, row: 14 },
  { col: 7, row: 14 },
  { col: 6, row: 14 },
  // --- blue quadrant: bottom arm left lane -> left arm bottom lane -> left tip
  { col: 6, row: 13 }, { col: 6, row: 12 }, { col: 6, row: 11 }, { col: 6, row: 10 }, { col: 6, row: 9 },
  { col: 5, row: 8 }, { col: 4, row: 8 }, { col: 3, row: 8 }, { col: 2, row: 8 }, { col: 1, row: 8 }, { col: 0, row: 8 },
  { col: 0, row: 7 },
  { col: 0, row: 6 },
];

export const RING_LENGTH = RING.length; // 52

export const START_INDEX: Record<Color, number> = {
  red: 0,
  green: 13,
  yellow: 26,
  blue: 39,
};

/** Each colour's private 5-cell run into the middle. */
export const HOME_COLUMN: Record<Color, Cell[]> = {
  red: [1, 2, 3, 4, 5].map((col) => ({ col, row: 7 })),
  green: [1, 2, 3, 4, 5].map((row) => ({ col: 7, row })),
  yellow: [13, 12, 11, 10, 9].map((col) => ({ col, row: 7 })),
  blue: [13, 12, 11, 10, 9].map((row) => ({ col: 7, row })),
};

export const CENTER: Cell = { col: 7, row: 7 };

/** Entry squares + the four star squares. Nothing can be captured here. */
export const SAFE_RING = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
export const STAR_RING = new Set([8, 21, 34, 47]);

/** 6x6 yard, four resting slots per colour (fractional = cell centre). */
export const YARD_SLOTS: Record<Color, Cell[]> = {
  red: [
    { col: 1.5, row: 1.5 }, { col: 3.5, row: 1.5 },
    { col: 1.5, row: 3.5 }, { col: 3.5, row: 3.5 },
  ],
  green: [
    { col: 10.5, row: 1.5 }, { col: 12.5, row: 1.5 },
    { col: 10.5, row: 3.5 }, { col: 12.5, row: 3.5 },
  ],
  yellow: [
    { col: 10.5, row: 10.5 }, { col: 12.5, row: 10.5 },
    { col: 10.5, row: 12.5 }, { col: 12.5, row: 12.5 },
  ],
  blue: [
    { col: 1.5, row: 10.5 }, { col: 3.5, row: 10.5 },
    { col: 1.5, row: 12.5 }, { col: 3.5, row: 12.5 },
  ],
};

export const YARD_BOX: Record<Color, Cell> = {
  red: { col: 0, row: 0 },
  green: { col: 9, row: 0 },
  yellow: { col: 9, row: 9 },
  blue: { col: 0, row: 9 },
};

/**
 * Where finished tokens rest inside the middle triangle. Values are cell
 * units (px = (v + 0.5) * 48) chosen to sit well inside each wedge.
 */
const NEAR = 6.0417;  // 314px
const MID  = 6.5417;  // 338px
const LO   = 6.7708;  // 349px
const HI   = 7.2292;  // 371px
const MID2 = 7.4583;  // 382px
const FAR  = 7.9583;  // 406px

export const HOME_SLOTS: Record<Color, Cell[]> = {
  red:    [{ col: NEAR, row: LO }, { col: NEAR, row: HI }, { col: MID,  row: LO }, { col: MID,  row: HI }],
  green:  [{ col: LO,   row: NEAR }, { col: HI, row: NEAR }, { col: LO, row: MID }, { col: HI,  row: MID }],
  yellow: [{ col: FAR,  row: LO }, { col: FAR,  row: HI }, { col: MID2, row: LO }, { col: MID2, row: HI }],
  blue:   [{ col: LO,   row: FAR }, { col: HI, row: FAR }, { col: LO, row: MID2 }, { col: HI, row: MID2 }],
};

/** Absolute ring index for a colour at relative progress `pos` (0..50). */
export function ringIndex(color: Color, pos: number): number {
  return (START_INDEX[color] + pos) % RING_LENGTH;
}

/** Grid cell a token occupies. `token` is only needed for yard/home slots. */
export function cellFor(color: Color, pos: number, token: number): Cell {
  if (pos === YARD) return YARD_SLOTS[color][token];
  if (pos === HOME) return HOME_SLOTS[color][token];
  if (pos >= 51) return HOME_COLUMN[color][pos - 51];
  return RING[ringIndex(color, pos)];
}

/**
 * Cells a token visits stepping from `from` to `to` (excluding `from`).
 * Used to animate the hop-by-hop walk.
 */
export function pathCells(color: Color, from: number, to: number, token: number): Cell[] {
  const out: Cell[] = [];
  if (from === YARD) return [cellFor(color, to, token)];
  for (let p = from + 1; p <= to; p++) out.push(cellFor(color, p, token));
  return out;
}

/** True when two tokens on the ring cannot capture each other. */
export function isSafeRingIndex(idx: number): boolean {
  return SAFE_RING.has(idx);
}

export function colorOfRingStart(idx: number): Color | null {
  for (const c of COLORS) if (START_INDEX[c] === idx) return c;
  return null;
}

/**
 * Structural self-check. Every consecutive pair must be orthogonally
 * adjacent, except the four corner turns that wrap the centre block.
 */
export function validateRing(): string[] {
  const errors: string[] = [];
  if (RING.length !== 52) errors.push(`ring length ${RING.length} != 52`);
  const seen = new Set<string>();
  for (const c of RING) {
    const k = `${c.col},${c.row}`;
    if (seen.has(k)) errors.push(`duplicate ring cell ${k}`);
    seen.add(k);
    const inCentre = c.col >= 6 && c.col <= 8 && c.row >= 6 && c.row <= 8;
    if (inCentre) errors.push(`ring cell ${k} sits inside the centre block`);
  }
  let diagonals = 0;
  for (let i = 0; i < RING.length; i++) {
    const a = RING[i];
    const b = RING[(i + 1) % RING.length];
    const d = Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
    if (d === 1) continue;
    if (Math.abs(a.col - b.col) === 1 && Math.abs(a.row - b.row) === 1) {
      diagonals++;
      continue;
    }
    errors.push(`ring cells ${i} -> ${i + 1} are not adjacent`);
  }
  if (diagonals !== 4) errors.push(`expected 4 corner turns, found ${diagonals}`);

  for (const color of COLORS) {
    const lastRing = RING[ringIndex(color, 50)];
    const firstHome = HOME_COLUMN[color][0];
    const d = Math.abs(lastRing.col - firstHome.col) + Math.abs(lastRing.row - firstHome.row);
    if (d !== 1) errors.push(`${color}: ring exit ${JSON.stringify(lastRing)} not adjacent to home column`);
    const entry = RING[START_INDEX[color]];
    const yard = YARD_BOX[color];
    const near =
      entry.col >= yard.col - 1 && entry.col <= yard.col + 6 &&
      entry.row >= yard.row - 1 && entry.row <= yard.row + 6;
    if (!near) errors.push(`${color}: entry square is not beside its yard`);
  }
  return errors;
}
