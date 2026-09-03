import { NextResponse } from "next/server";
import { chat, move, rematch, roll, toClientState, RuleError } from "@/lib/ludo/engine";
import { readPresence, seatedPlayerIds, touchPresence, updateRoom } from "@/lib/store";
import { normaliseCode } from "@/lib/id";
import { fail, requirePlayerId } from "@/lib/api";
import type { GameState } from "@/lib/ludo/types";

export const dynamic = "force-dynamic";

type Body = {
  type?: string;
  token?: number;
  text?: string;
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

    const apply = (draft: GameState): GameState | null => {
      if (actionId && draft.lastActionId === actionId) return null; // already applied
      if (actionId) draft.lastActionId = actionId;

      switch (body.type) {
        case "roll":
          return roll(draft, playerId);
        case "move": {
          const token = Number(body.token);
          if (!Number.isInteger(token) || token < 0 || token > 3) {
            throw new RuleError("Bad token index.");
          }
          return move(draft, playerId, token);
        }
        case "rematch":
          return rematch(draft, playerId);
        case "chat":
          return chat(draft, playerId, String(body.text ?? ""));
        default:
          throw new RuleError("Unknown action.");
      }
    };

    const state = await updateRoom(code, apply);
    await touchPresence(code, playerId);
    const online = await readPresence(code, seatedPlayerIds(state));
    return NextResponse.json({ state: toClientState(state, playerId, online) });
  } catch (err) {
    return fail(err);
  }
}
