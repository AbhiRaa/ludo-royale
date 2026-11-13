/* Structural + behavioural checks for the Ludo core. Run: npx tsx scripts/verify.ts */
import { COLORS, Color, FATE_MAX, FATE_START, GameState, HOME, LAST_RING_POS, LOG_LIMIT, Mode, TOKENS_PER_PLAYER, YARD } from "../lib/ludo/types";
import { CENTER, HOME_COLUMN, RING, RING_LENGTH, SAFE_RING, STAR_RING, START_INDEX, cellFor, pathCells, ringIndex, validateRing } from "../lib/ludo/board";
import { RuleError, addBot, chat, createGame, hasFinished, join, migrate, move, pass, react, rematch, roll, runBots, seatColorsFor, snapOf, toClientState, viewOf, wager } from "../lib/ludo/engine";
import { chooseMove, isBot } from "../lib/ludo/bot";
import { optionsFor, previewMove, reachableValues, roleOf } from "../lib/ludo/rules";
import { freshEvents, moveTimeline, pathPositions } from "../lib/ludo/timeline";
import { rollDie } from "../lib/ludo/rng";

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) { failures++; console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
  else console.log(`  ok    ${name}`);
};
const throws = (fn: () => unknown, re: RegExp): boolean => {
  try { fn(); return false; } catch (e) { return e instanceof RuleError && re.test(e.message); }
};
const die = (v: number) => () => v;
const [GUARD, HUNTER, COURIER, JESTER] = [0, 1, 2, 3];

/** A seated, running table. p0 is red, p1 is yellow in a two-player game. */
function table(mode: Mode, players = 2): GameState {
  let s = createGame("T", players, mode);
  seatColorsFor(players).forEach((_, i) => { s = join(s, `p${i}`, `P${i}`, { tz: "Etc/UTC", offsetMin: 0 }); });
  return s;
}
/** Yellow's relative position that shares a ring cell with red's `redPos`. */
const yellowAt = (redPos: number) => (ringIndex("red", redPos) - START_INDEX.yellow + 52) % 52;

/* ================================================================== */
console.log("\n[geometry]");
const ringErrors = validateRing();
check("ring is structurally valid", ringErrors.length === 0, ringErrors.join("; "));
check("ring has 52 cells", RING_LENGTH === 52, String(RING_LENGTH));
check("starts are 13 apart", COLORS.every((c, i) => START_INDEX[c] === i * 13));
check("8 safe squares, 4 of them stars", SAFE_RING.size === 8 && STAR_RING.size === 4);
for (const c of COLORS) {
  const seen = new Set<string>();
  for (let p = 0; p <= HOME; p++) { const cell = cellFor(c, p, 0); seen.add(`${cell.col},${cell.row}`); }
  check(`${c}: 57 distinct squares from start to home`, seen.size === 57, String(seen.size));
  const last = cellFor(c, HOME - 1, 0); const col = HOME_COLUMN[c][4];
  check(`${c}: pos 55 is the last home-column cell`, last.col === col.col && last.row === col.row);
}
check("centre is 7,7", CENTER.col === 7 && CENTER.row === 7);
check("path from yard lands on the start square", (() => {
  const cells = pathCells("red", YARD, 0, 0);
  return cells.length === 1 && cells[0].col === RING[0].col && cells[0].row === RING[0].row;
})());

/* ================================================================== */
console.log("\n[the court — courier]");
{
  const s = table("royale"); s.tokens.red[COURIER] = 10; s.tokens.red[GUARD] = 10;
  const opts = optionsFor(viewOf(s), "red", 3);
  check("courier runs one extra square", opts.some((o) => o.token === COURIER && o.to === 14 && o.kind === "step"));
  check("an ordinary pawn does not", opts.some((o) => o.token === GUARD && o.to === 13));
  s.tokens.red[COURIER] = 52;
  check("no bonus inside the home column", optionsFor(viewOf(s), "red", 4).some((o) => o.token === COURIER && o.to === HOME));
  s.tokens.red[COURIER] = 50;
  check("cannot overshoot home with the bonus", !optionsFor(viewOf(s), "red", 6).some((o) => o.token === COURIER));
  check("but reaches home exactly with a 5", optionsFor(viewOf(s), "red", 5).some((o) => o.token === COURIER && o.to === HOME));
  // The courier must never be able to strand itself.
  let stranded = false;
  for (let p = 0; p <= 55; p++) {
    s.tokens.red = [HOME, HOME, p, HOME];
    if (![1, 2, 3, 4, 5, 6].some((v) => optionsFor(viewOf(s), "red", v).length > 0)) stranded = true;
  }
  check("courier always has some roll that moves it", !stranded);
}

console.log("\n[the court — jester]");
{
  const s = table("royale"); s.tokens.red[JESTER] = 10;
  check("with nothing behind it, a jester only goes forward", optionsFor(viewOf(s), "red", 4).filter((o) => o.token === JESTER).map((o) => o.kind).join() === "step");
  s.tokens.yellow[COURIER] = yellowAt(6);
  const opts = optionsFor(viewOf(s), "red", 4).filter((o) => o.token === JESTER);
  check("with prey behind it, it may strike backwards", opts.length === 2 && opts.some((o) => o.to === 14) && opts.some((o) => o.to === 6 && o.kind === "back"));
  check("only at exactly the thrown distance", !optionsFor(viewOf(s), "red", 3).some((o) => o.kind === "back"));

  s.tokens.red[JESTER] = 3; s.tokens.yellow[COURIER] = yellowAt(1);
  check("never back past its own entry square", !optionsFor(viewOf(s), "red", 4).some((o) => o.kind === "back"));
  s.tokens.red[JESTER] = 52;
  check("never back out of the home column", !optionsFor(viewOf(s), "red", 1).some((o) => o.kind === "back"));
  s.tokens.red[JESTER] = 12; s.tokens.yellow[COURIER] = yellowAt(8);
  check("sanctuary still holds behind a jester", STAR_RING.has(ringIndex("red", 8)) && !optionsFor(viewOf(s), "red", 4).some((o) => o.kind === "back"));

  const g = table("royale"); g.tokens.red[JESTER] = 10; g.tokens.yellow[COURIER] = yellowAt(6);
  roll(g, "p0", die(4));
  check("two destinations demand a choice", throws(() => move(g, "p0", { token: JESTER }), /Choose where/));
  move(g, "p0", { token: JESTER, to: 6 });
  const ev = g.log[g.log.length - 1];
  check("the backward strike captures and is logged as such", g.tokens.red[JESTER] === 6 && g.tokens.yellow[COURIER] === YARD && ev.type === "move" && ev.kind === "back");
  check("and earns another throw like any capture", g.turn === 0);
  check("backward path walks down the track", pathPositions({ from: 10, to: 6, kind: "back" }).join() === "9,8,7,6");

  const b = table("royale"); b.tokens.red[JESTER] = 10; b.tokens.yellow[GUARD] = yellowAt(6);
  roll(b, "p0", die(4)); move(b, "p0", { token: JESTER, to: 6 });
  check("a shield turns a backward strike away too", b.tokens.red[JESTER] === 10 && b.shield.yellow === false && b.tokens.yellow[GUARD] === yellowAt(6));

  // Progress must be monotonic apart from captures, or a game can be stalled.
  const m = table("royale"); let regress = false;
  for (let i = 0; i < 4000 && m.status === "playing"; i++) {
    const seat = m.seats[m.turn]; const me = seat.playerId!;
    if (!m.awaitingMove) { roll(m, me); continue; }
    const o = m.legalMoves[Math.floor(Math.random() * m.legalMoves.length)];
    if (!o) { pass(m, me); continue; }
    const before = m.tokens[seat.color][o.token];
    move(m, me, { token: o.token, to: o.to });
    const e2 = m.log.filter((e) => e.type === "move").pop();
    if (e2 && e2.type === "move" && e2.landed < before && e2.captured.length === 0 && !e2.bounced) regress = true;
  }
  check("no pawn ever loses ground without taking a piece", !regress);
}

console.log("\n[the court — hunter]");
{
  const star = 8; // red's relative 8 is ring index 8, a star
  check("fixture really is a star", STAR_RING.has(ringIndex("red", star)));
  const s = table("royale"); s.tokens.red[HUNTER] = 5; s.tokens.yellow[COURIER] = yellowAt(star);
  roll(s, "p0", die(3)); move(s, "p0", { token: HUNTER });
  check("hunter captures on a star", s.tokens.yellow[COURIER] === YARD && s.tokens.red[HUNTER] === star);

  const n = table("royale"); n.tokens.red[GUARD] = 5; n.tokens.yellow[COURIER] = yellowAt(star);
  roll(n, "p0", die(3)); move(n, "p0", { token: GUARD });
  check("nobody else can", n.tokens.yellow[COURIER] === yellowAt(star) && n.tokens.red[GUARD] === star);

  const e = table("royale"); e.tokens.red[HUNTER] = 23; e.tokens.yellow[COURIER] = 0; // yellow's entry square
  roll(e, "p0", die(3)); move(e, "p0", { token: HUNTER });
  check("entry squares stay sanctuary even from a hunter", e.tokens.yellow[COURIER] === 0);

  const k = table("classic"); k.tokens.red[HUNTER] = 5; k.tokens.yellow[COURIER] = yellowAt(star);
  roll(k, "p0", die(3)); move(k, "p0", { token: HUNTER });
  check("classic has no hunter", k.tokens.yellow[COURIER] === yellowAt(star));
}

console.log("\n[the court — guard]");
{
  const sq = 10; // not a safe square
  check("fixture is not sanctuary", !SAFE_RING.has(ringIndex("red", sq)));
  const s = table("royale"); s.tokens.red[HUNTER] = 7; s.tokens.yellow[GUARD] = yellowAt(sq); s.tokens.yellow[COURIER] = yellowAt(sq);
  const before = s.fate.yellow;
  roll(s, "p0", die(3)); move(s, "p0", { token: HUNTER });
  const ev = s.log[s.log.length - 1];
  check("shield throws the attacker back", s.tokens.red[HUNTER] === 7 && ev.type === "move" && ev.bounced && ev.landed === 7);
  check("the guard is untouched", s.tokens.yellow[GUARD] === yellowAt(sq));
  check("and so is anyone standing with it", s.tokens.yellow[COURIER] === yellowAt(sq));
  check("the shield is spent", s.shield.yellow === false && s.stats.yellow.blocks === 1);
  check("a bounce is not a capture: no Fate, turn passes", s.fate.yellow === before && s.turn === 1);

  s.turn = 0; s.awaitingMove = false;
  roll(s, "p0", die(3)); move(s, "p0", { token: HUNTER });
  check("second strike takes the square", s.tokens.yellow[GUARD] === YARD && s.tokens.yellow[COURIER] === YARD);
  check("a guard sent home picks its shield back up", s.shield.yellow === true);
  check("each captured pawn pays its owner Fate", s.fate.yellow === Math.min(FATE_MAX, before + 2), `${before} -> ${s.fate.yellow}`);
  check("capture grants another throw", s.turn === 0 && !s.awaitingMove);
  check("the preview agrees with what happened", (() => {
    const p = table("royale"); p.tokens.red[HUNTER] = 7; p.tokens.yellow[GUARD] = yellowAt(sq);
    const out = previewMove(viewOf(p), "red", { token: HUNTER, to: sq, kind: "step" });
    return out.bounced && out.landed === 7 && out.captured.length === 0;
  })());
}

console.log("\n[fate]");
{
  const s = table("royale"); s.fate.red = 2; s.tokens.red[GUARD] = 10;
  roll(s, "p0", die(2));
  check("cannot spend Fate you do not have", throws(() => move(s, "p0", { token: GUARD, nudge: 3 }), /Not enough Fate/));
  move(s, "p0", { token: GUARD, nudge: 2 });
  check("nudging moves the played value and spends Fate", s.tokens.red[GUARD] === 14 && s.fate.red === 0 && s.stats.red.fateSpent === 2);
  check("the die shows the value that was played", s.dice === 4);

  const b = table("royale"); b.fate.red = 3; b.tokens.red[GUARD] = 10;
  roll(b, "p0", die(5));
  check("a die cannot be nudged past 6", throws(() => move(b, "p0", { token: GUARD, nudge: 2 }), /1 to 6/));

  const c = table("classic"); c.tokens.red[GUARD] = 10;
  check("classic starts with no Fate", c.fate.red === 0 && FATE_START > 0);
  roll(c, "p0", die(2));
  check("classic refuses a nudge", throws(() => move(c, "p0", { token: GUARD, nudge: 1 }), /not part of this game|Not enough/));

  const six = table("royale"); six.fate.red = 1; six.tokens.red[GUARD] = 10;
  roll(six, "p0", die(6)); move(six, "p0", { token: GUARD, nudge: -1 });
  check("a thrown six keeps its extra throw even when nudged down", six.tokens.red[GUARD] === 15 && six.turn === 0 && !six.awaitingMove);

  const up = table("royale"); up.fate.red = 1;
  roll(up, "p0", die(5));
  const rollEv = up.log[up.log.length - 1];
  check("no natural move but Fate could help: turn stays open, flagged stuck", up.awaitingMove && rollEv.type === "roll" && rollEv.stuck && !rollEv.blocked);
  move(up, "p0", { token: GUARD, nudge: 1 });
  check("a nudged six frees a pawn", up.tokens.red[GUARD] === 0);
  check("but buys no extra throw", up.turn === 1);

  const p = table("royale"); p.fate.red = 1;
  roll(p, "p0", die(5)); pass(p, "p0");
  check("passing a stuck throw earns Fate and ends the turn", p.fate.red === 2 && p.turn === 1 && !p.awaitingMove);

  const np = table("royale"); np.tokens.red[GUARD] = 10;
  roll(np, "p0", die(2));
  check("cannot pass while a move exists", throws(() => pass(np, "p0"), /have a move/));

  const auto = table("royale"); auto.fate.red = 0;
  roll(auto, "p0", die(3));
  const autoEv = auto.log[auto.log.length - 1];
  check("nothing reachable: turn passes by itself and pays Fate", auto.turn === 1 && auto.fate.red === 1 && autoEv.type === "roll" && autoEv.blocked);

  const cap = table("royale"); cap.fate.red = FATE_MAX;
  roll(cap, "p0", die(3)); pass(cap, "p0");
  check("Fate is capped", cap.fate.red === FATE_MAX);
  check("reachable values respect both Fate and the die", reachableValues(5, 2).join() === "3,4,5,6" && reachableValues(1, 0).join() === "1");

  const st = table("royale"); st.fate.red = 0; st.tokens.red[GUARD] = 5;
  roll(st, "p0", die(3)); move(st, "p0", { token: GUARD });
  check("landing on a star earns Fate", st.tokens.red[GUARD] === 8 && st.fate.red === 1);
}

console.log("\n[wagers]");
{
  const s = table("royale");
  wager(s, "p0", "  a handwritten letter  "); wager(s, "p1", "you cook on the next visit");
  const mine = toClientState(s, "p0"); const hers = toClientState(s, "p1"); const watcher = toClientState(s, null);
  check("you see your own wager, trimmed", mine.yourWager === "a handwritten letter");
  check("both are shown as sealed", mine.wagerSet.red && mine.wagerSet.yellow);
  check("the other side cannot read yours", !JSON.stringify(hers).includes("handwritten") && !JSON.stringify(mine).includes("you cook"));
  check("a spectator can read neither", !/handwritten|you cook/.test(JSON.stringify(watcher)));
  check("nothing is revealed while the game runs", mine.stakes === null);
  s.tokens.red[COURIER] = HOME;
  check("wagers lock once a pawn is home", throws(() => wager(s, "p1", "changed my mind"), /sealed/) && toClientState(s, "p1").wagerLocked);
  s.status = "finished";
  const done = toClientState(s, "p1");
  check("everything is revealed at the end", done.stakes?.length === 2 && JSON.stringify(done).includes("handwritten"));
  check("strangers cannot place a wager", throws(() => wager(table("royale"), "nobody", "x"), /not in this game/));
}

console.log("\n[event log + sequencing]");
{
  const s = table("royale");
  let contiguous = true, snapsMatch = true;
  for (let i = 0; i < 400 && s.status === "playing"; i++) {
    const me = s.seats[s.turn].playerId!;
    const seqBefore = s.nonce;
    if (!s.awaitingMove) roll(s, me);
    else if (s.legalMoves.length) { const o = s.legalMoves[0]; move(s, me, { token: o.token, to: o.to }); }
    else pass(s, me);
    if (s.nonce > seqBefore && JSON.stringify(s.log[s.log.length - 1].after) !== JSON.stringify(snapOf(s))) snapsMatch = false;
    for (let j = 1; j < s.log.length; j++) if (s.log[j].seq !== s.log[j - 1].seq + 1) contiguous = false;
  }
  check("log never exceeds its limit", s.log.length <= LOG_LIMIT && s.log.length > 0);
  check("event seqs are contiguous and end at nonce", contiguous && s.log[s.log.length - 1].seq === s.nonce);
  check("every event carries the board as it stood after it", snapsMatch);

  const seen = s.nonce - 3;
  check("a client three events behind gets exactly those three", (() => { const r = freshEvents(s.log, s.nonce, seen); return r.fresh.length === 3 && !r.gap; })());
  check("a client far behind is told to jump to the present", freshEvents(s.log, s.nonce, s.nonce - LOG_LIMIT - 5).gap);
  check("a client that is current has nothing to play", (() => { const r = freshEvents(s.log, s.nonce, s.nonce); return r.fresh.length === 0 && !r.gap; })());

  const before = s.nonce; chat(s, "p0", "hello");
  check("chat is not a board event", s.nonce === before);
  react(s, "p0", "🔥");
  check("a reaction is logged", s.log[s.log.length - 1].type === "react");
  check("unknown reactions are refused", throws(() => react(s, "p0", "<script>"), /Unknown reaction/));

  const cap = table("royale"); cap.tokens.red[HUNTER] = 7; cap.tokens.yellow[COURIER] = yellowAt(10);
  roll(cap, "p0", die(3)); move(cap, "p0", { token: HUNTER });
  const mv = cap.log[cap.log.length - 1];
  if (mv.type === "move") {
    const calm = moveTimeline(mv, false), film = moveTimeline(mv, true);
    check("a capture gets a slow final hop only with cinematics on", film.dramatic && !calm.dramatic && film.arrive > calm.arrive);
    check("timeline hops match the squares walked", calm.hops.length === 3 && calm.starts[0] === calm.pre);
  } else check("capture fixture produced a move", false);
}

console.log("\n[seats, clocks, rematch, old rooms]");
{
  let s = createGame("Z", 2, "royale");
  s = join(s, "a", "Abhinav", { tz: "Asia/Kolkata", offsetMin: 330 });
  s = join(s, "b", "Priya", { tz: "<img src=x>", offsetMin: 99999 });
  check("a real time zone is kept", s.seats[0].zone?.offsetMin === 330);
  check("a junk one is dropped", s.seats[1].zone === null);
  check("the clock reaches the other player", toClientState(s, "b").seats[0].zone?.tz === "Asia/Kolkata");
  join(s, "b", "Priya", { tz: "Europe/London", offsetMin: 0 });
  check("re-joining can correct it without taking a second seat", s.seats[1].zone?.tz === "Europe/London" && s.seats.filter((x) => x.playerId).length === 2);

  wager(s, "b", "the last word"); wager(s, "a", "bragging rights");
  s.tokens.red = [HOME, HOME, HOME, 55]; s.fate.red = 0; s.shield.yellow = false; s.tokens.yellow[GUARD] = 20;
  roll(s, "a", die(1)); move(s, "a", { token: JESTER });
  check("finishing the last pawn ends the game", s.status === "finished" && s.ranking.join() === "red,yellow" && s.log.some((e) => e.type === "win"));
  rematch(s, "b");
  check("rematch resets board, Fate, shields and stats", s.status === "playing" && s.tokens.red.every((p) => p === YARD) && s.fate.red === FATE_START && s.shield.yellow && s.stats.red.rolls === 0);
  check("whoever lost opens the next game", s.seats[s.turn].color === "yellow");
  check("wagers carry over to the rematch", s.wagers.yellow === "the last word");

  // A room exactly as the previous build stored it, caught mid-turn.
  const legacy = JSON.parse(JSON.stringify({
    id: "OLD01", createdAt: 1, status: "playing", maxPlayers: 2,
    seats: [{ color: "red", playerId: "a", name: "A" }, { color: "yellow", playerId: "b", name: "B" }],
    turn: 0, dice: 4, diceNonce: 9, awaitingMove: true, legalMoves: [0, 2], consecutiveSixes: 0,
    tokens: { red: [12, -1, 30, 56], green: [-1, -1, -1, -1], yellow: [5, -1, -1, -1], blue: [-1, -1, -1, -1] },
    ranking: [], lastEvent: { type: "roll", color: "red", value: 4, blocked: false, nonce: 40 },
    lastActionId: null, chat: [], version: 77, nonce: 40,
  }));
  const m = migrate(legacy);
  check("an old room becomes a classic game", m.mode === "classic" && m.fate.red === 0 && Array.isArray(m.log) && !("lastEvent" in m));
  check("its pending moves are rebuilt in the new shape", m.legalMoves.length === 2 && m.legalMoves.every((o) => typeof o === "object" && o.kind === "step"));
  move(m, "a", { token: 0 });
  check("and the game simply carries on", m.tokens.red[0] === 16 && m.turn === 1);
  check("migrating twice changes nothing", JSON.stringify(migrate(JSON.parse(JSON.stringify(m)))) === JSON.stringify(m));
}

/* ================================================================== */
function invariants(s: GameState, where: string): void {
  const bad = (msg: string) => { failures++; console.error(`  FAIL ${msg} @ ${where}`); };
  for (const c of COLORS) {
    if (s.tokens[c].length !== TOKENS_PER_PLAYER) bad(`token count ${c}`);
    for (const p of s.tokens[c]) if (p !== YARD && (p < 0 || p > HOME)) bad(`pos ${p} for ${c}`);
    if (s.fate[c] < 0 || s.fate[c] > FATE_MAX) bad(`fate ${s.fate[c]} for ${c}`);
    if (s.mode === "classic" && s.fate[c] !== 0) bad(`classic game holds fate for ${c}`);
    if (typeof s.shield[c] !== "boolean") bad(`shield flag ${c}`);
    if (s.tokens[c][GUARD] === YARD && !s.shield[c]) bad(`${c} guard is home without its shield`);
  }
  // Opponents may share a square only where it is sanctuary.
  const occupancy = new Map<number, Set<Color>>();
  for (const seat of s.seats) {
    if (!seat.playerId) continue;
    for (const p of s.tokens[seat.color]) {
      if (p < 0 || p > LAST_RING_POS) continue;
      const abs = ringIndex(seat.color, p);
      (occupancy.get(abs) ?? occupancy.set(abs, new Set()).get(abs)!).add(seat.color);
    }
  }
  for (const [abs, colors] of occupancy) if (colors.size > 1 && !SAFE_RING.has(abs)) bad(`unsafe co-occupation at ring ${abs}`);
  const caps = COLORS.reduce((n, c) => n + s.stats[c].captures, 0);
  const lost = COLORS.reduce((n, c) => n + s.stats[c].lost, 0);
  if (caps !== lost) bad(`captures ${caps} != losses ${lost}`);
  if (s.log.length > LOG_LIMIT) bad("log overflow");
}

type Tally = { games: number; rolls: number; longest: number; captures: number; forfeits: number; bounces: number; starKills: number; backs: number; nudges: number; passes: number; wins: Record<string, number> };
const tally = (): Tally => ({ games: 0, rolls: 0, longest: 0, captures: 0, forfeits: 0, bounces: 0, starKills: 0, backs: 0, nudges: 0, passes: 0, wins: {} });

function simulate(mode: Mode, perCount: number): Tally {
  const t = tally();
  for (const playerCount of [2, 3, 4]) {
    for (let g = 0; g < perCount; g++) {
      const s = table(mode, playerCount);
      let steps = 0;
      while (s.status === "playing" && steps < 30000) {
        steps++;
        const seat = s.seats[s.turn]; const me = seat.playerId!; const color = seat.color;
        if (!s.awaitingMove) {
          roll(s, me);
          const ev = s.log[s.log.length - 1];
          if (ev.type === "roll" && ev.reason === "three-sixes") t.forfeits++;
          invariants(s, `${mode} game ${g} step ${steps}`);
          continue;
        }
        // A loose but purposeful policy: take captures, mostly walk forwards,
        // sometimes spend Fate, sometimes hold it.
        const view = viewOf(s);
        const values = Math.random() < 0.35 ? reachableValues(s.dice!, s.fate[color]) : [s.dice!];
        const pool = values.flatMap((v) => optionsFor(view, color, v).map((o) => ({ o, v, out: previewMove(view, color, o) })));
        const kills = pool.filter((x) => x.out.captured.length > 0);
        const forward = pool.filter((x) => x.o.kind !== "back");
        const pick = kills.length && Math.random() < 0.7 ? kills : forward.length && Math.random() < 0.9 ? forward : pool;
        if (pick.length === 0) {
          if (optionsFor(view, color, s.dice!).length === 0) { pass(s, me); t.passes++; }
          else { const o = s.legalMoves[0]; move(s, me, { token: o.token, to: o.to }); }
        } else {
          const { o, v, out } = pick[Math.floor(Math.random() * pick.length)];
          const starKill = out.captured.length > 0 && SAFE_RING.has(ringIndex(color, o.to));
          const thrown = s.dice!;
          move(s, me, { token: o.token, to: o.to, nudge: v - thrown });
          if (v !== thrown) t.nudges++;
          if (out.bounced) t.bounces++;
          if (starKill) t.starKills++;
          if (o.kind === "back") t.backs++;
          t.captures += out.captured.length;
        }
        invariants(s, `${mode} game ${g} step ${steps}`);
      }
      if (s.status !== "finished") { failures++; console.error(`  FAIL ${mode} game ${g} (${playerCount}P) did not finish in ${steps} steps`); break; }
      if (!hasFinished(s, s.ranking[0])) { failures++; console.error(`  FAIL winner ${s.ranking[0]} has pawns left`); }
      if (s.ranking.length !== playerCount) { failures++; console.error(`  FAIL ranking size ${s.ranking.length}`); }
      t.wins[s.ranking[0]] = (t.wins[s.ranking[0]] ?? 0) + 1;
      t.rolls += COLORS.reduce((n, c) => n + s.stats[c].rolls, 0);
      t.longest = Math.max(t.longest, steps); t.games++;
    }
  }
  return t;
}

const PER = 700;
console.log(`\n[classic — ${PER * 3} simulated games]`);
const classic = simulate("classic", PER);
check("all classic games terminated", classic.games === PER * 3, `${classic.games}/${PER * 3}`);
check("captures happen", classic.captures > 0);
check("three-six forfeits happen", classic.forfeits > 0);
check("classic never bounces, nudges, passes, walks back or kills on a star", classic.bounces + classic.nudges + classic.passes + classic.backs + classic.starKills === 0);
console.log(`  info  avg ${Math.round(classic.rolls / classic.games)} rolls/game · ${classic.captures} captures · wins ${JSON.stringify(classic.wins)}`);

console.log(`\n[royale — ${PER * 3} simulated games]`);
const royale = simulate("royale", PER);
check("all royale games terminated", royale.games === PER * 3, `${royale.games}/${PER * 3}`);
check("shields turn attacks away", royale.bounces > 0, String(royale.bounces));
check("hunters kill on stars", royale.starKills > 0, String(royale.starKills));
check("jesters walk backwards", royale.backs > 0, String(royale.backs));
check("Fate gets spent", royale.nudges > 0, String(royale.nudges));
check("stuck throws get passed", royale.passes > 0, String(royale.passes));
console.log(`  info  avg ${Math.round(royale.rolls / royale.games)} rolls/game · ${royale.captures} captures · ${royale.bounces} shield blocks · ${royale.starKills} star kills · ${royale.backs} backward moves · ${royale.nudges} nudges · ${royale.passes} passes`);
console.log(`  info  wins ${JSON.stringify(royale.wins)}`);
{
  // Seat order must not decide royale games: in 2P, red and yellow should split.
  const two = tally();
  for (let g = 0; g < 3000; g++) {
    const s = table("royale", 2); let steps = 0;
    while (s.status === "playing" && steps++ < 30000) {
      const me = s.seats[s.turn].playerId!; const color = s.seats[s.turn].color;
      if (!s.awaitingMove) { roll(s, me); continue; }
      const fwd = s.legalMoves.filter((o) => o.kind !== "back");
      const o = (fwd.length ? fwd : s.legalMoves)[Math.floor(Math.random() * (fwd.length || s.legalMoves.length))];
      if (!o) { const v = reachableValues(s.dice!, s.fate[color]).find((x) => optionsFor(viewOf(s), color, x).length); 
        if (v == null) pass(s, me); else { const n = optionsFor(viewOf(s), color, v)[0]; move(s, me, { token: n.token, to: n.to, nudge: v - s.dice! }); } }
      else move(s, me, { token: o.token, to: o.to });
    }
    two.wins[s.ranking[0]] = (two.wins[s.ranking[0]] ?? 0) + 1;
  }
  const share = (two.wins.red ?? 0) / 3000;
  check("going first is not a decisive edge in 2P royale", share > 0.44 && share < 0.56, `red wins ${(share * 100).toFixed(1)}%`);
}

/* ================================================================== */
console.log("\n[the House]");
{
  // Two competent players, same policy on both sides: an honest pace figure.
  const pace = (mode: Mode, games: number) => {
    let rolls = 0, caps = 0, red = 0;
    for (let g = 0; g < games; g++) {
      const s = table(mode, 2); let guard = 0;
      while (s.status === "playing" && guard++ < 30000) {
        const seat = s.seats[s.turn]; const me = seat.playerId!;
        if (!s.awaitingMove) { roll(s, me); continue; }
        const c = chooseMove(s, viewOf(s), seat.color);
        if (c) move(s, me, c); else if (s.legalMoves.length) move(s, me, { token: s.legalMoves[0].token, to: s.legalMoves[0].to }); else pass(s, me);
        invariants(s, `${mode} house game ${g}`);
      }
      if (s.status !== "finished") { failures++; console.error(`  FAIL house game ${g} did not finish`); break; }
      rolls += s.stats.red.rolls + s.stats.yellow.rolls; caps += s.stats.red.captures + s.stats.yellow.captures;
      if (s.ranking[0] === "red") red++;
    }
    return { rolls: rolls / games, caps: caps / games, red: red / games };
  };
  const pc = pace("classic", 1500), pr = pace("royale", 1500);
  console.log(`  info  2P, competent play — classic: ${pc.rolls.toFixed(0)} throws, ${pc.caps.toFixed(1)} captures · royale: ${pr.rolls.toFixed(0)} throws, ${pr.caps.toFixed(1)} captures`);
  check("royale is not a slower game than classic", pr.rolls <= pc.rolls * 1.05, `${pr.rolls.toFixed(0)} vs ${pc.rolls.toFixed(0)}`);
  check("royale has more fighting in it", pr.caps > pc.caps, `${pr.caps.toFixed(1)} vs ${pc.caps.toFixed(1)}`);
  check("seat order does not decide a game between equals", pr.red > 0.44 && pr.red < 0.56 && pc.red > 0.44 && pc.red < 0.56, `red wins ${(pc.red * 100).toFixed(1)}% classic, ${(pr.red * 100).toFixed(1)}% royale`);

  // The House has to be worth playing: it should beat a pawn-pusher clearly.
  let houseWins = 0; const N = 600;
  for (let g = 0; g < N; g++) {
    const s = table("royale", 2); let guard = 0;
    while (s.status === "playing" && guard++ < 30000) {
      const seat = s.seats[s.turn]; const me = seat.playerId!;
      if (!s.awaitingMove) { roll(s, me); continue; }
      if (seat.color === "yellow") { const c = chooseMove(s, viewOf(s), "yellow"); if (c) move(s, me, c); else pass(s, me); continue; }
      const fwd = s.legalMoves.filter((o) => o.kind !== "back");
      const o = (fwd.length ? fwd : s.legalMoves)[Math.floor(Math.random() * (fwd.length || s.legalMoves.length))];
      if (o) move(s, me, { token: o.token, to: o.to }); else pass(s, me);
    }
    if (s.ranking[0] === "yellow") houseWins++;
  }
  check("the House clearly beats random pawn-pushing", houseWins / N > 0.7, `${((houseWins / N) * 100).toFixed(0)}%`);

  // Solo table: the House answers inside the human's own request.
  let solo = createGame("SOLO", 2, "royale");
  solo = join(solo, "me", "Abhinav", { tz: "Asia/Kolkata", offsetMin: 330 });
  runBots(addBot(solo, solo.seats[0].zone));
  check("a solo table starts at once with the House seated", solo.status === "playing" && isBot(solo.seats[1].playerId) && solo.seats[1].name === "The House");
  check("the House keeps a clock on the far side of the world", solo.seats[1].zone?.offsetMin === 330 - 720);
  check("the House is always shown as present", toClientState(solo, "me").seats[1].online === true);
  check("the human still opens", solo.turn === 0 && !solo.awaitingMove);
  let handedBack = true, guard = 0;
  while (solo.status === "playing" && guard++ < 30000) {
    if (!solo.awaitingMove) roll(solo, "me");
    else { const c = chooseMove(solo, viewOf(solo), "red"); if (c) move(solo, "me", c); else pass(solo, "me"); }
    runBots(solo);
    if (solo.status === "playing" && solo.turn !== 0) handedBack = false;
    invariants(solo, `solo step ${guard}`);
  }
  check("after the House plays, the turn is always back with the human", handedBack);
  check("a solo game runs to a result", solo.status === "finished" && solo.ranking.length === 2);
  check("bot ids never leak either", !JSON.stringify(toClientState(solo, "me")).includes("bot:"));
}

/* ================================================================== */
console.log("\n[dice throw identity]");
{
  const s = table("classic");
  let rolls = 0, moves = 0, wrongRollBump = 0, movesThatBumped = 0;
  for (let step = 0; step < 6000 && s.status === "playing"; step++) {
    const me = s.seats[s.turn].playerId!;
    const beforeRoll = s.diceNonce;
    roll(s, me); rolls++;
    if (s.diceNonce !== beforeRoll + 1) wrongRollBump++;
    if (!s.awaitingMove) continue;
    const beforeMove = s.diceNonce;
    const o = s.legalMoves[Math.floor(Math.random() * s.legalMoves.length)];
    move(s, me, { token: o.token, to: o.to }); moves++;
    if (s.diceNonce !== beforeMove) movesThatBumped++;
  }
  check("diceNonce advances exactly once per roll", wrongRollBump === 0, `${wrongRollBump}/${rolls}`);
  check("moving a pawn never re-identifies the throw", movesThatBumped === 0, `${movesThatBumped}/${moves}`);
  const wire = JSON.parse(JSON.stringify(toClientState(s, "p0")));
  check("diceNonce reaches the client", wire.diceNonce === s.diceNonce);
  check("no player id ever reaches a client", !/"playerId"|"p0"|"p1"/.test(JSON.stringify(wire)));
}

console.log("\n[fairness]");
{
  const faces: Record<number, number> = {};
  for (let i = 0; i < 600000; i++) { const v = rollDie(); faces[v] = (faces[v] ?? 0) + 1; }
  const maxDev = Math.max(...Object.values(faces).map((c) => Math.abs(c - 100000) / 100000));
  check("die faces are uniform within 2%", maxDev < 0.02, `max deviation ${(maxDev * 100).toFixed(2)}%`);
  check("die only produces 1..6", Object.keys(faces).sort().join(",") === "1,2,3,4,5,6");
  check("roles exist only in royale", roleOf("royale", 1) === "hunter" && roleOf("classic", 1) === null);
}

console.log(failures === 0 ? "\nALL CHECKS PASSED\n" : `\n${failures} CHECK(S) FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
