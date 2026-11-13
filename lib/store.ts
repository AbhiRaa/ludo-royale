import { Redis } from "@upstash/redis";
import type { GameState } from "./ludo/types";
import { PRESENCE_TTL_SECONDS } from "./ludo/types";
import { migrate } from "./ludo/engine";
import { isBot } from "./ludo/bot";

const TTL_SECONDS = 60 * 60 * 36; // rooms evaporate a day and a half after last write
const key = (id: string) => `ludo:room:${id}`;
const versionKey = (id: string) => `ludo:room:${id}:v`;
const presenceKey = (id: string, player: string) => `ludo:room:${id}:p:${player}`;

/**
 * Optimistic concurrency: write only if the stored version is still the one we
 * read. Two players acting in the same tick means one retries against fresh
 * state instead of clobbering the other.
 */
const CAS_SCRIPT = `
local cur = redis.call('GET', KEYS[2])
if (cur == false and ARGV[1] == '0') or cur == ARGV[1] then
  redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[4])
  redis.call('SET', KEYS[2], ARGV[3], 'EX', ARGV[4])
  return 1
end
return 0
`;

interface Backend {
  read(id: string): Promise<GameState | null>;
  readVersion(id: string): Promise<number | null>;
  compareAndSet(id: string, expected: number, next: GameState): Promise<boolean>;
  touchPresence(id: string, player: string): Promise<void>;
  readPresence(id: string, players: string[]): Promise<Set<string>>;
  /** version + presence in a single round trip, for the SSE poll loop */
  poll(id: string, players: string[]): Promise<{ version: number | null; online: Set<string> }>;
}

/* ------------------------------------------------------------------ */

function redisEnv(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

export const storageMode: "redis" | "memory" = redisEnv() ? "redis" : "memory";

class RedisBackend implements Backend {
  private redis: Redis;
  constructor(env: { url: string; token: string }) {
    this.redis = new Redis({ url: env.url, token: env.token });
  }
  async read(id: string): Promise<GameState | null> {
    const raw = await this.redis.get(key(id));
    if (raw == null) return null;
    // Upstash parses JSON payloads for us, but tolerate a plain string too.
    return migrate(typeof raw === "string" ? JSON.parse(raw) : raw);
  }
  async readVersion(id: string): Promise<number | null> {
    const raw = await this.redis.get(versionKey(id));
    if (raw == null) return null;
    return Number(raw);
  }
  async compareAndSet(id: string, expected: number, next: GameState): Promise<boolean> {
    const res = await this.redis.eval(
      CAS_SCRIPT,
      [key(id), versionKey(id)],
      [String(expected), JSON.stringify(next), String(next.version), String(TTL_SECONDS)],
    );
    return Number(res) === 1;
  }
  async touchPresence(id: string, player: string): Promise<void> {
    await this.redis.set(presenceKey(id, player), 1, { ex: PRESENCE_TTL_SECONDS });
  }
  async readPresence(id: string, players: string[]): Promise<Set<string>> {
    if (players.length === 0) return new Set();
    const values = await this.redis.mget<(unknown | null)[]>(
      ...players.map((p) => presenceKey(id, p)),
    );
    const out = new Set<string>();
    players.forEach((p, i) => {
      if (values[i] != null) out.add(p);
    });
    return out;
  }
  async poll(id: string, players: string[]) {
    if (players.length === 0) {
      return { version: await this.readVersion(id), online: new Set<string>() };
    }
    const pipe = this.redis.pipeline();
    pipe.get(versionKey(id));
    pipe.mget(...players.map((p) => presenceKey(id, p)));
    const [version, presence] = (await pipe.exec()) as [unknown, (unknown | null)[]];
    const online = new Set<string>();
    players.forEach((p, i) => {
      if (presence?.[i] != null) online.add(p);
    });
    return { version: version == null ? null : Number(version), online };
  }
}

/**
 * Dev-only fallback so `next dev` runs with no credentials. Single process,
 * so it is enough for local play but never used once Upstash env vars exist.
 */
class MemoryBackend implements Backend {
  private map = new Map<string, { state: string; expires: number }>();
  private live(id: string) {
    const row = this.map.get(id);
    if (!row) return null;
    if (row.expires < Date.now()) {
      this.map.delete(id);
      return null;
    }
    return row;
  }
  async read(id: string): Promise<GameState | null> {
    const row = this.live(id);
    return row ? migrate(JSON.parse(row.state)) : null;
  }
  async readVersion(id: string): Promise<number | null> {
    const row = this.live(id);
    return row ? (JSON.parse(row.state) as GameState).version : null;
  }
  async compareAndSet(id: string, expected: number, next: GameState): Promise<boolean> {
    const row = this.live(id);
    const current = row ? (JSON.parse(row.state) as GameState).version : 0;
    if (row ? current !== expected : expected !== 0) return false;
    this.map.set(id, { state: JSON.stringify(next), expires: Date.now() + TTL_SECONDS * 1000 });
    return true;
  }
  private presence = new Map<string, number>();
  async touchPresence(id: string, player: string): Promise<void> {
    this.presence.set(presenceKey(id, player), Date.now() + PRESENCE_TTL_SECONDS * 1000);
  }
  async readPresence(id: string, players: string[]): Promise<Set<string>> {
    const now = Date.now();
    const out = new Set<string>();
    for (const p of players) {
      const exp = this.presence.get(presenceKey(id, p));
      if (exp && exp > now) out.add(p);
    }
    return out;
  }
  async poll(id: string, players: string[]) {
    return { version: await this.readVersion(id), online: await this.readPresence(id, players) };
  }
}

const globalRef = globalThis as unknown as { __ludoBackend?: Backend };
const env = redisEnv();
const backend: Backend =
  globalRef.__ludoBackend ??
  (globalRef.__ludoBackend = env ? new RedisBackend(env) : new MemoryBackend());

/* ------------------------------------------------------------------ */

export async function readRoom(id: string): Promise<GameState | null> {
  assertConfigured();
  return backend.read(id);
}

export async function readRoomVersion(id: string): Promise<number | null> {
  return backend.readVersion(id);
}

export async function touchPresence(id: string, player: string): Promise<void> {
  return backend.touchPresence(id, player);
}

export async function readPresence(id: string, players: string[]): Promise<Set<string>> {
  return backend.readPresence(id, players);
}

export async function pollRoom(id: string, players: string[]) {
  return backend.poll(id, players);
}

/** Player ids currently seated, for presence lookups. */
export function seatedPlayerIds(state: GameState): string[] {
  return state.seats.map((s) => s.playerId).filter((p): p is string => Boolean(p) && !isBot(p));
}

export async function createRoom(state: GameState): Promise<boolean> {
  assertConfigured();
  state.version = 1;
  return backend.compareAndSet(state.id, 0, state);
}

/**
 * The in-memory fallback is fine for `next dev`, but on Vercel each request may
 * hit a different instance — a half-working game is worse than a clear error.
 */
export class StorageUnconfiguredError extends Error {
  status = 503;
  constructor() {
    super("The game store is not connected yet. Add the Upstash integration and redeploy.");
  }
}

function assertConfigured() {
  if (storageMode === "memory" && process.env.VERCEL) throw new StorageUnconfiguredError();
}

export class ConflictError extends Error {
  status = 503;
  constructor() {
    super("The room was busy. Try that again.");
  }
}
export class MissingRoomError extends Error {
  status = 404;
  constructor() {
    super("That room does not exist (or it expired).");
  }
}

/**
 * Read-modify-write with retries. `mutate` must be pure enough to re-run:
 * it is called again from scratch on every contention retry.
 */
export async function updateRoom(
  id: string,
  mutate: (state: GameState) => GameState | null,
  attempts = 6,
): Promise<GameState> {
  assertConfigured();
  for (let i = 0; i < attempts; i++) {
    const current = await backend.read(id);
    if (!current) throw new MissingRoomError();

    const draft = JSON.parse(JSON.stringify(current)) as GameState;
    const next = mutate(draft);
    if (next === null) return current; // mutation decided nothing needs writing

    next.version = current.version + 1;
    if (await backend.compareAndSet(id, current.version, next)) return next;

    // brief, jittered backoff before re-reading
    await new Promise((r) => setTimeout(r, 25 + Math.random() * 60 * (i + 1)));
  }
  throw new ConflictError();
}
