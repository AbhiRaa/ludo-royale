# Ludo Royale

A hand-lacquered Ludo board for two people in two time zones. Server-authoritative,
real-time, and built to deploy on Vercel.

## How it works

| Concern | Approach |
|---|---|
| Rules | Pure, deterministic reducer in `lib/ludo/engine.ts`. No rules run on the client. |
| Dice | Rolled on the server with the platform CSPRNG (`lib/ludo/rng.ts`), so a player cannot influence their own luck. |
| State | One JSON document per room in Upstash Redis, written through a Lua compare-and-swap so simultaneous actions never clobber each other. |
| Realtime | Server-Sent Events (`/api/room/[id]/stream`). The poll cadence adapts to activity and the client drops the stream entirely on a hidden tab. |
| Presence | Short-TTL Redis keys, refreshed by the open stream — presence never bumps the game version, so it cannot cause update storms. |
| Retries | Every action carries a client-generated `actionId`; a replayed request is a no-op, so a dropped response over a flaky link can never roll the die twice. |

## Board model

Token positions are stored as *relative* progress per colour:

```
 -1        yard
  0 .. 50  the shared 52-cell ring   (absolute index = (start + pos) % 52)
 51 .. 55  that colour's home column
 56        home
```

Start squares sit at ring indices 0 / 13 / 26 / 39. Safe squares are the four
entry squares plus the four stars: 0, 8, 13, 21, 26, 34, 39, 47.

## House rules

- A six frees a pawn from the yard and grants another throw.
- Landing on an opponent sends it home and grants another throw.
- Entry squares and starred squares are sanctuary — no captures there.
- Three sixes in a row forfeits the turn.
- An exact count is needed to come home; reaching home grants another throw.
- First player with all four pawns home wins.

## Local development

```bash
npm install
npm run dev
```

With no Redis credentials the app falls back to an in-process store, which is
enough for local play in a single dev server. Production needs Upstash.

## Tests

```bash
npx tsx scripts/verify.ts    # board geometry, rules, 4200 simulated games, die fairness
npx tsx scripts/identity.mts  # player identity under working, throwing, and absent storage
npx tsx scripts/e2e.mts       # the whole stack over HTTP (needs `npm run dev` running,
                              # or BASE=https://your-deployment npx tsx scripts/e2e.mts)
```

## Deploying

```bash
vercel link
vercel integration add upstash    # provisions Redis and injects the env vars
vercel env pull .env.local
vercel --prod
```
