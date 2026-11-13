/**
 * Pure rules. No randomness, no I/O, no server-only imports — the server uses
 * these to decide, and the client uses the very same functions to preview.
 */
import {
  Capture,
  Color,
  GameStatus,
  HOME,
  LAST_RING_POS,
  Mode,
  MoveOption,
  ROLES,
  Role,
  YARD,
} from "./types";
import { SAFE_RING, STAR_RING, ringIndex } from "./board";

export type RuleView = {
  mode: Mode;
  /** colours actually seated */
  players: Color[];
  tokens: Record<Color, number[]>;
  shield: Record<Color, boolean>;
};

export const roleOf = (mode: Mode, token: number): Role | null =>
  mode === "royale" ? ROLES[token] ?? null : null;

/** The Courier runs one extra square while it is out on the shared track. */
export function stepDistance(mode: Mode, token: number, from: number, value: number): number {
  const bonus = roleOf(mode, token) === "courier" && from >= 0 && from <= LAST_RING_POS ? 1 : 0;
  return value + bonus;
}

/** Everything `color` may do with a die showing `value`. */
export function optionsFor(view: RuleView, color: Color, value: number): MoveOption[] {
  const out: MoveOption[] = [];
  view.tokens[color].forEach((pos, token) => {
    if (pos === HOME) return;
    if (pos === YARD) {
      if (value === 6) out.push({ token, to: 0, kind: "enter" });
      return;
    }
    const to = pos + stepDistance(view.mode, token, pos, value);
    if (to <= HOME) out.push({ token, to, kind: "step" });

    // The Jester strikes backwards: it may step back only onto an opposing
    // pawn, never out past its own entry square or out of the home column.
    // A free backward step would be a tempo move that never runs out, and two
    // players could then sit on sanctuary squares and stall the game forever.
    if (roleOf(view.mode, token) === "jester" && pos <= LAST_RING_POS && pos - value >= 0) {
      if (holdsPrey(view, color, pos - value)) out.push({ token, to: pos - value, kind: "back" });
    }
  });
  return out;
}

/** Is there an opposing pawn on this square that an ordinary pawn could attack? */
function holdsPrey(view: RuleView, color: Color, pos: number): boolean {
  const abs = ringIndex(color, pos);
  if (SAFE_RING.has(abs)) return false;
  return view.players.some(
    (other) =>
      other !== color &&
      view.tokens[other].some((p) => p >= 0 && p <= LAST_RING_POS && ringIndex(other, p) === abs),
  );
}

/** Die values reachable from `dice` by spending at most `fate`. */
export function reachableValues(dice: number, fate: number): number[] {
  const out: number[] = [];
  for (let v = 1; v <= 6; v++) if (Math.abs(v - dice) <= fate) out.push(v);
  return out;
}

export function hasAnyOption(view: RuleView, color: Color, dice: number, fate: number): boolean {
  return reachableValues(dice, fate).some((v) => optionsFor(view, color, v).length > 0);
}

export type Outcome = {
  /** final resting position of the mover */
  landed: number;
  captured: Capture[];
  /** a Guard's shield turned the attack away */
  bounced: boolean;
  shieldBroken: Color[];
  finished: boolean;
  /** landed on a star: earns Fate in royale */
  star: boolean;
};

/** What would happen if `color` played `opt` right now. Mutates nothing. */
export function previewMove(view: RuleView, color: Color, opt: MoveOption): Outcome {
  const from = view.tokens[color][opt.token];
  const quiet: Outcome = {
    landed: opt.to,
    captured: [],
    bounced: false,
    shieldBroken: [],
    finished: opt.to === HOME,
    star: false,
  };
  if (opt.to > LAST_RING_POS) return quiet;

  const abs = ringIndex(color, opt.to);
  const isStar = STAR_RING.has(abs);
  // Stars and entry squares are sanctuary — except that a Hunter strikes on stars.
  const hunter = roleOf(view.mode, opt.token) === "hunter";
  const canCapture = !SAFE_RING.has(abs) || (hunter && isStar);

  const victims: Capture[] = [];
  const shields = new Set<Color>();
  if (canCapture) {
    for (const other of view.players) {
      if (other === color) continue;
      view.tokens[other].forEach((p, i) => {
        if (p < 0 || p > LAST_RING_POS) return;
        if (ringIndex(other, p) !== abs) return;
        victims.push({ color: other, token: i, from: p });
        if (roleOf(view.mode, i) === "guard" && view.shield[other]) shields.add(other);
      });
    }
  }

  // A shielded Guard protects its whole square: nothing is taken, the attacker
  // is thrown back to where it came from, and the shield is spent.
  if (shields.size > 0) {
    return { ...quiet, landed: from, bounced: true, shieldBroken: [...shields], finished: false };
  }
  return { ...quiet, captured: victims, star: isStar && view.mode === "royale" };
}

/** Wagers seal the moment anyone gets a pawn home. */
export function wagerLocked(tokens: Record<Color, number[]>, status: GameStatus): boolean {
  if (status === "finished") return true;
  return Object.values(tokens).some((list) => list.some((p) => p === HOME));
}
