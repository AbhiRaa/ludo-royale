import { NextResponse } from "next/server";
import { toClientState } from "@/lib/ludo/engine";
import { readPresence, readRoom, seatedPlayerIds } from "@/lib/store";
import { normaliseCode } from "@/lib/id";
import { fail, playerIdFrom } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const code = normaliseCode(id);
    const state = await readRoom(code);
    if (!state) return NextResponse.json({ error: "Room not found." }, { status: 404 });

    const playerId = playerIdFrom(req);
    const online = await readPresence(code, seatedPlayerIds(state));
    return NextResponse.json(
      { state: toClientState(state, playerId, online) },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    return fail(err);
  }
}
