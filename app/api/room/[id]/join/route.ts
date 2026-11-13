import { NextResponse } from "next/server";
import { join, toClientState } from "@/lib/ludo/engine";
import { readPresence, seatedPlayerIds, touchPresence, updateRoom } from "@/lib/store";
import { normaliseCode } from "@/lib/id";
import { fail, requirePlayerId } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const code = normaliseCode(id);
    const playerId = requirePlayerId(req);
    const body = (await req.json().catch(() => ({}))) as { name?: string; zone?: unknown };
    const name = typeof body.name === "string" ? body.name : "Player";

    const state = await updateRoom(code, (draft) => {
      const before = JSON.stringify(draft.seats);
      join(draft, playerId, name, body.zone);
      // a plain re-join must not bump the version and wake every client
      return JSON.stringify(draft.seats) === before ? null : draft;
    });
    await touchPresence(code, playerId);
    const online = await readPresence(code, seatedPlayerIds(state));
    return NextResponse.json({ state: toClientState(state, playerId, online) });
  } catch (err) {
    return fail(err);
  }
}
