# Ludo Royale — Two Skies

Ludo for two people in two time zones, on a table that floats between both
their skies. Server-authoritative, real-time, deployed on Vercel.

## The game

Every table is one of two games.

**The Court** (`royale`) — your four pawns are four characters, and each bends
one rule:

| Pawn | Rule |
|---|---|
| Guard | Carries a shield. The first pawn that tries to capture it is thrown back to where it came from. The shield returns when the Guard is next sent home. A shielded Guard protects everyone on its square. |
| Hunter | Captures on star squares, where everyone else is safe. Entry squares stay sanctuary. |
| Courier | Runs one square further than the die shows while on the outer track. |
| Jester | May step backward to capture a pawn standing exactly the thrown distance behind it. |

**Fate** turns bad luck into a resource. You earn one when a pawn of yours is
captured, when a throw cannot be played, or when you land on a star; you hold
at most three. After throwing you may spend Fate to shift the die up or down
by one per point. Only a six that was actually thrown earns another throw.

**Classic** (`classic`) — the rules everyone knows, with none of the above.

Both share the basics: a six frees a pawn and earns another throw; a capture
or bringing a pawn home earns another throw; three sixes in a row forfeits the
turn; an exact count is needed to come home.

Around the game: each player may seal a **wager** ("if I win, you owe me…")
that the other side cannot read until the game is decided; and a table can be
played solo against **the House**.

### A rule that had to change

The Jester was first allowed to step backward freely. Simulation found games
that never ended: both sides parked pawns on sanctuary squares and shuffled
their Jesters back and forth forever, because a free backward step is a tempo
move that never runs out. Restricting it to a backward *strike* keeps the
character and restores the guarantee that every move either advances a pawn or
takes one. `scripts/verify.ts` asserts that property directly.

## How it works

| Concern | Approach |
|---|---|
| Rules | `lib/ludo/rules.ts` is pure and shared: the server decides with it, the client previews with the same code, so a preview cannot disagree with the outcome. `lib/ludo/engine.ts` applies moves. |
| Dice | Rolled on the server with the platform CSPRNG. |
| State | One JSON document per room in Upstash Redis, written through a Lua compare-and-swap. Rooms stored by an older build are migrated on read. |
| Events | Every event is logged with the board as it stood after it (`log`, newest 14). The client plays events strictly in order (`lib/usePresenter.ts`) rather than jumping to the newest state, so a burst — a slow poll, or the House answering — is shown as it happened. |
| Timing | `lib/ludo/timeline.ts` is the single source for how long each event takes; the sequencer, both renderers and the sound cues all read it. |
| Realtime | Server-Sent Events with an activity-adaptive poll; the stream is dropped on a hidden tab. |
| Secrets | Wagers and player ids are stripped in `toClientState`; a wager is revealed only once the game is finished. |
| The House | `lib/ludo/bot.ts`, a one-ply heuristic. It plays inside the human's own request, so its events simply queue behind theirs. |

### Presentation

`components/three/` is a three.js scene: a lacquered board on a round table,
lathe-turned pawns, a thrown die, a camera that pushes in on captures. The sky
is one shader with up to four skies in it — each seat owns the stretch behind
its own corner, coloured by that player's wall clock (`lib/sky.ts`), so looking
across the board shows the hour where the other player is. A time zone offset
is all that is shared; there is no geolocation.

`components/FlatBoard.tsx` is the top-down board. It is used automatically when
WebGL is unavailable or the scene fails, and can be chosen in the settings.

Sound effects and the adaptive score (`lib/sound.ts`, `lib/music.ts`) are
synthesised with the Web Audio API; there are no audio files.

## Board model

Pawn positions are stored as *relative* progress per colour:

```
 -1        yard
  0 .. 50  the shared 52-cell ring   (absolute index = (start + pos) % 52)
 51 .. 55  that colour's home column
 56        home
```

Start squares sit at ring indices 0 / 13 / 26 / 39. Safe squares are the four
entry squares plus the four stars: 0, 8, 13, 21, 26, 34, 39, 47.

## Local development

```bash
npm install
npm run dev
```

With no Redis credentials the app uses an in-process store, enough for local
play in a single server. Production needs Upstash.

## Tests

```bash
npx tsx scripts/verify.ts     # rules: every character, Fate, wagers, migration,
                              # 4200 random games, the House, pacing, die fairness
npx tsx scripts/identity.mts  # player identity under working, throwing, and absent storage
npx tsx scripts/e2e.mts       # the whole stack over HTTP (needs a running server;
                              # BASE=https://your-deployment npx tsx scripts/e2e.mts)
```

## Deploying

```bash
vercel link
vercel integration add upstash    # provisions Redis and injects the env vars
vercel env pull .env.local
vercel --prod
```
