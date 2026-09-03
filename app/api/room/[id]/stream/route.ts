import { toClientState } from "@/lib/ludo/engine";
import { pollRoom, readRoom, seatedPlayerIds, touchPresence } from "@/lib/store";
import { normaliseCode } from "@/lib/id";
import { playerIdFrom } from "@/lib/api";
import { PRESENCE_REFRESH_MS } from "@/lib/ludo/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Rotate the connection before the platform limit; EventSource reconnects. */
const CONNECTION_BUDGET_MS = 240_000;
const HEARTBEAT_MS = 15_000;

/**
 * Poll cadence adapts to activity: tight during a turn, lazy when the room is
 * idle. The client also closes the stream entirely on a hidden tab, so a
 * forgotten browser tab costs nothing.
 */
function pollInterval(idleMs: number): number {
  if (idleMs < 10_000) return 250;
  if (idleMs < 90_000) return 800;
  return 2_500;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const code = normaliseCode(id);
  const playerId = playerIdFrom(req);
  const encoder = new TextEncoder();
  let cancelled = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (chunk: string) => {
        if (cancelled) return false;
        try {
          controller.enqueue(encoder.encode(chunk));
          return true;
        } catch {
          cancelled = true;
          return false;
        }
      };
      const send = (event: string, data: unknown) =>
        write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

      write("retry: 2000\n\n");

      const initial = await readRoom(code);
      if (!initial) {
        send("gone", { error: "Room not found." });
        controller.close();
        return;
      }

      let players = seatedPlayerIds(initial);
      let lastVersion = -1;
      let lastOnlineKey = "";
      let lastChangeAt = Date.now();
      let lastHeartbeat = Date.now();
      let lastTouch = 0;
      const startedAt = Date.now();

      try {
        while (!cancelled && Date.now() - startedAt < CONNECTION_BUDGET_MS) {
          const now = Date.now();
          if (playerId && now - lastTouch >= PRESENCE_REFRESH_MS) {
            lastTouch = now;
            await touchPresence(code, playerId);
          }

          const { version, online } = await pollRoom(code, players);
          if (version === null) {
            send("gone", { error: "Room expired." });
            break;
          }

          const onlineKey = [...online].sort().join("|");
          if (version !== lastVersion || onlineKey !== lastOnlineKey) {
            const state = await readRoom(code);
            if (state) {
              players = seatedPlayerIds(state);
              if (!send("state", toClientState(state, playerId, online))) break;
              lastVersion = state.version;
              lastOnlineKey = onlineKey;
              lastChangeAt = Date.now();
              lastHeartbeat = Date.now();
            }
          } else if (Date.now() - lastHeartbeat >= HEARTBEAT_MS) {
            lastHeartbeat = Date.now();
            if (!write(": ping\n\n")) break;
          }

          await sleep(pollInterval(Date.now() - lastChangeAt));
        }
      } catch (err) {
        console.error("[ludo] stream", err);
      } finally {
        if (!cancelled) {
          send("cycle", { reason: "reconnect" });
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      }
    },
    cancel() {
      cancelled = true;
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
