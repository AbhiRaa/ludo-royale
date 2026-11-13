/**
 * "The House": a heuristic opponent. Not a search — one ply of evaluation with
 * a feel for danger — which is plenty for Ludo and cheap enough to run inside
 * the same request as the human's move.
 */
import { Color, GameState, HOME, LAST_RING_POS, YARD } from "./types";
import { SAFE_RING, STAR_RING, ringIndex } from "./board";
import { RuleView, optionsFor, previewMove, reachableValues, roleOf } from "./rules";

export const BOT_PREFIX = "bot:";
export const isBot = (playerId: string | null): boolean => Boolean(playerId?.startsWith(BOT_PREFIX));

export type BotChoice = { token: number; to: number; nudge: number };

/** How many opposing pawns could land on this pawn with a single throw. */
function threat(view: RuleView, color: Color, token: number, pos: number): number {
  if (pos < 0 || pos > LAST_RING_POS) return 0;
  const abs = ringIndex(color, pos);
  const star = STAR_RING.has(abs);
  if (SAFE_RING.has(abs) && !star) return 0;

  let count = 0;
  for (const other of view.players) {
    if (other === color) continue;
    view.tokens[other].forEach((p, i) => {
      if (p < 0 || p > LAST_RING_POS) return;
      const role = roleOf(view.mode, i);
      if (star && role !== "hunter") return; // only a Hunter strikes on a star
      const theirs = ringIndex(other, p);
      const ahead = (abs - theirs + 52) % 52;
      const reach = role === "courier" ? ahead - 1 : ahead;
      if (reach >= 1 && reach <= 6 && p + ahead <= LAST_RING_POS) count++;
      if (role === "jester") {
        const behind = (theirs - abs + 52) % 52;
        if (behind >= 1 && behind <= 6 && p - behind >= 0) count++;
      }
    });
  }
  // a shield soaks the first hit
  if (roleOf(view.mode, token) === "guard" && view.shield[color]) return count * 0.3;
  return count;
}

/**
 * Picks what to play with the die on the table, or null to pass.
 * `jitter` keeps it from being perfectly predictable; pass 0 for determinism.
 */
export function chooseMove(state: GameState, view: RuleView, color: Color, jitter = 3): BotChoice | null {
  const dice = state.dice;
  if (dice == null) return null;
  const natural = optionsFor(view, color, dice);

  let best: BotChoice | null = null;
  let bestScore = -Infinity;
  for (const value of reachableValues(dice, state.fate[color])) {
    const cost = Math.abs(value - dice);
    for (const opt of optionsFor(view, color, value)) {
      const out = previewMove(view, color, opt);
      const from = view.tokens[color][opt.token];
      let score = Math.random() * jitter - cost * 9;

      if (out.bounced) {
        score -= 14; // a wasted move, though it does strip the shield
      } else {
        for (const hit of out.captured) score += 52 + hit.from * 0.7;
        if (out.finished) score += 46;
        if (opt.kind === "enter") score += 30;
        else score += out.landed - from;
        if (from <= LAST_RING_POS && out.landed > LAST_RING_POS && !out.finished) score += 10;
        if (out.star) score += 6;
      }

      const weight = 13 * (1 + Math.max(from, 0) / HOME);
      const before = from === YARD ? 0 : threat(view, color, opt.token, from);
      const after = out.bounced ? before : threat(view, color, opt.token, out.landed);
      score += (before - after) * weight;

      if (score > bestScore) {
        bestScore = score;
        best = { token: opt.token, to: opt.to, nudge: value - dice };
      }
    }
  }

  // Stuck at the natural value: spending Fate has to actually be worth it,
  // otherwise bank the Fate that passing pays.
  if (natural.length === 0 && bestScore < 12) return null;
  return best;
}
