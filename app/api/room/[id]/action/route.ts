import { NextResponse } from "next/server";
import { chat, move, pass, react, rematch, roll, runBots, toClientState, wager, RuleError } from "@/lib/ludo/engine";
import { readPresence, seatedPlayerIds, touchPresence, updateRoom } from "@/lib/store";
import { normaliseCode } from "@/lib/id";
import { fail, requirePlayerId } from "@/lib/api";
import type { GameState } from "@/lib/ludo/types";

export const dynamic = "force-dynamic";

type Body = {
  type?: string;
  token?: number;
  /** destination, needed only when a pawn has more than one */
  to?: number;
  /** Fate spent shifting the die, -3..3 */
  nudge?: number;
  text?: string;
  emoji?: string;
  /** client-generated, lets us ignore a duplicate delivery of the same action */
  actionId?: string;
};

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const code = normaliseCode(id);
    const playerId = requirePlayerId(req);
    const body = (await req.json().catch(() => ({}))) as Body;
    const actionId = typeof body.actionId === "string" ? body.actionId.slice(0, 64) : null;

    const act = (draft: GameState): GameState => {
      switch (body.type) {
        case "roll":
          return roll(draft, playerId);
        case "move": {
          const token = Number(body.token);
          if (!Number.isInteger(token) || token < 0 || token > 3) {
            throw new RuleError("Bad token index.");
          }
          const to = body.to == null ? undefined : Number(body.to);
          if (to !== undefined && !Number.isInteger(to)) throw new RuleError("Bad destination.");
          const nudge = body.nudge == null ? 0 : Number(body.nudge);
          return move(draft, playerId, { token, to, nudge });
        }
        case "pass":
          return pass(draft, playerId);
        case "wager":
          return wager(draft, playerId, String(body.text ?? ""));
        case "react":
          return react(draft, playerId, String(body.emoji ?? ""));
        case "rematch":
          return rematch(draft, playerId);
        case "chat":
          return chat(draft, playerId, String(body.text ?? ""));
        default:
          throw new RuleError("Unknown action.");
      }
    };

    const apply = (draft: GameState): GameState | null => {
      if (actionId && draft.lastActionId === actionId) return null; // already applied
      if (actionId) draft.lastActionId = actionId;
      // if a computer opponent is up next, it answers within this same write
      return runBots(act(draft));
    };

    const state = await updateRoom(code, apply);
    await touchPresence(code, playerId);
    const online = await readPresence(code, seatedPlayerIds(state));
    return NextResponse.json({ state: toClientState(state, playerId, online) });
  } catch (err) {
    return fail(err);
  }
}
