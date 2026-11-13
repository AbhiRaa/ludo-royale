/**
 * How long each event takes on screen. Shared by the sequencer (which waits),
 * the renderers (which animate) and the sound cues (which land on the beat),
 * so the three can never disagree about when a pawn arrives.
 */
import { GameEvent, YARD } from "./types";

export type MoveEvent = Extract<GameEvent, { type: "move" }>;
export type RollEvent = Extract<GameEvent, { type: "roll" }>;

export const HOP_MS = 150;
/** the last hop of a capture hangs in the air */
export const SLOW_HOP_MS = 620;
export const ROLL_MS = 1250;

/** Positions a pawn passes through after leaving `from`, ending on `to`. */
export function pathPositions(ev: Pick<MoveEvent, "from" | "to" | "kind">): number[] {
  if (ev.kind === "enter" || ev.from === YARD) return [ev.to];
  const dir = ev.to >= ev.from ? 1 : -1;
  const out: number[] = [];
  for (let p = ev.from + dir; dir > 0 ? p <= ev.to : p >= ev.to; p += dir) out.push(p);
  return out;
}

export type MoveTimeline = {
  /** time spent flipping the die to its nudged value before anything moves */
  pre: number;
  hops: number[];
  /** start time of each hop */
  starts: number[];
  /** the moment the pawn reaches (or strikes) its target */
  arrive: number;
  /** slow-motion final hop + close camera */
  dramatic: boolean;
  total: number;
};

export function moveTimeline(ev: MoveEvent, cinematic: boolean): MoveTimeline {
  const path = pathPositions(ev);
  const dramatic = cinematic && (ev.captured.length > 0 || ev.bounced);
  const pre = ev.nudge !== 0 ? 450 : 0;
  const hops = path.map((_, i) => (dramatic && i === path.length - 1 ? SLOW_HOP_MS : HOP_MS));
  const starts: number[] = [];
  let t = pre;
  for (const h of hops) {
    starts.push(t);
    t += h;
  }
  const tail = ev.captured.length
    ? cinematic ? 1500 : 850
    : ev.bounced
      ? cinematic ? 1150 : 750
      : ev.finished ? 950 : ev.star ? 380 : 140;
  return { pre, hops, starts, arrive: t, dramatic, total: t + tail };
}

export function cueDuration(ev: GameEvent, cinematic: boolean): number {
  switch (ev.type) {
    case "roll":
      return ROLL_MS + (ev.blocked ? 800 : 0);
    case "move":
      return moveTimeline(ev, cinematic).total;
    case "pass":
      return 600;
    case "start":
      return cinematic ? 3000 : 500;
    case "rematch":
      return 900;
    case "win":
      return 600;
    default:
      return 0;
  }
}

/** Events that happen alongside play rather than taking a turn at the table. */
export const isInstant = (ev: GameEvent): boolean =>
  ev.type === "join" || ev.type === "wager" || ev.type === "react";

/**
 * Which logged events has this client not shown yet? `gap` means some already
 * fell off the end of the log (a long reconnect) — the caller should jump
 * straight to the present instead of replaying a story with missing pages.
 */
export function freshEvents(
  log: GameEvent[],
  nonce: number,
  lastSeq: number,
): { fresh: GameEvent[]; gap: boolean } {
  const fresh = log.filter((e) => e.seq > lastSeq);
  return { fresh, gap: fresh.length !== nonce - lastSeq };
}
