import { NextResponse } from "next/server";
import { createGame, join, toClientState } from "@/lib/ludo/engine";
import { createRoom, readRoom } from "@/lib/store";
import { roomCode } from "@/lib/id";
import { fail, requirePlayerId } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const playerId = requirePlayerId(req);
    const body = (await req.json().catch(() => ({}))) as { name?: string; maxPlayers?: number };
    const maxPlayers = [2, 3, 4].includes(Number(body.maxPlayers)) ? Number(body.maxPlayers) : 2;
    const name = typeof body.name === "string" ? body.name : "Player";

    // Retry on the (very unlikely) code collision.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = roomCode();
      if (await readRoom(code)) continue;
      const state = join(createGame(code, maxPlayers), playerId, name);
      if (await createRoom(state)) {
        return NextResponse.json({ code, state: toClientState(state, playerId) }, { status: 201 });
      }
    }
    return NextResponse.json({ error: "Could not create a room. Try again." }, { status: 503 });
  } catch (err) {
    return fail(err);
  }
}
