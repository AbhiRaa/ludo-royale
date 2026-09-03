import { NextResponse } from "next/server";
import { ConflictError, MissingRoomError, StorageUnconfiguredError } from "./store";
import { RuleError } from "./ludo/engine";

export const PLAYER_HEADER = "x-ludo-player";

export function playerIdFrom(req: Request): string | null {
  // EventSource cannot set headers, so the SSE route passes ?p= instead.
  const raw = req.headers.get(PLAYER_HEADER) ?? new URL(req.url).searchParams.get("p");
  if (!raw) return null;
  const id = raw.trim();
  // UUID-shaped only; keeps junk out of Redis key names
  return /^[a-zA-Z0-9-]{8,64}$/.test(id) ? id : null;
}

export function requirePlayerId(req: Request): string {
  const id = playerIdFrom(req);
  if (!id) throw new RuleError("Missing player identity.", 401);
  return id;
}

export function fail(err: unknown) {
  if (err instanceof RuleError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof MissingRoomError || err instanceof ConflictError || err instanceof StorageUnconfiguredError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error("[ludo] unhandled", err);
  return NextResponse.json({ error: "Something went wrong on our side." }, { status: 500 });
}
