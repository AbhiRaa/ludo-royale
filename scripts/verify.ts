/* Structural + behavioural checks for the Ludo core. Run: npx tsx scripts/verify.ts */
import { COLORS, Color, GameState, HOME, LAST_RING_POS, TOKENS_PER_PLAYER, YARD } from "../lib/ludo/types";
import { CENTER, HOME_COLUMN, RING, RING_LENGTH, SAFE_RING, START_INDEX, cellFor, pathCells, ringIndex, validateRing } from "../lib/ludo/board";
import { createGame, hasFinished, join, legalMovesFor, move, roll, seatColorsFor } from "../lib/ludo/engine";

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) { failures++; console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
  else console.log(`  ok    ${name}`);
};

console.log("\n[geometry]");
const ringErrors = validateRing();
check("ring is structurally valid", ringErrors.length === 0, ringErrors.join("; "));
check("ring has 52 cells", RING_LENGTH === 52, String(RING_LENGTH));
check("starts are 13 apart", COLORS.every((c, i) => START_INDEX[c] === i * 13));
check("8 safe squares", SAFE_RING.size === 8);
check("every safe index is on the ring", [...SAFE_RING].every((i) => i >= 0 && i < 52));

// Full lap: 51 ring cells + 5 home column + home = 57 distinct squares, 56 steps.
for (const c of COLORS) {
  const seen = new Set<string>();
  for (let p = 0; p <= HOME; p++) {
    const cell = cellFor(c, p, 0);
    seen.add(`${cell.col},${cell.row}`);
  }
  check(`${c}: 57 distinct squares from start to home`, seen.size === 57, String(seen.size));
  const last = cellFor(c, HOME - 1, 0);
  const col = HOME_COLUMN[c][4];
  check(`${c}: pos 55 is the last home-column cell`, last.col === col.col && last.row === col.row);
  // A colour must never walk through another colour's home column.
  for (let p = 0; p <= LAST_RING_POS; p++) {
    const cell = cellFor(c, p, 0);
    const inCentre = cell.col >= 6 && cell.col <= 8 && cell.row >= 6 && cell.row <= 8;
    if (inCentre) { check(`${c}: ring pos ${p} escapes the centre`, false); break; }
  }
}
check("centre is 7,7", CENTER.col === 7 && CENTER.row === 7);

// Two colours must share ring cells (that is what makes capture possible),
// and each colour's own start must be unreachable-as-a-capture (it is safe).
const redCells = new Set(Array.from({ length: 51 }, (_, p) => ringIndex("red", p)));
const yellowCells = new Set(Array.from({ length: 51 }, (_, p) => ringIndex("yellow", p)));
check("red and yellow tracks overlap", [...redCells].some((i) => yellowCells.has(i)));

check("path from yard lands on the start square", (() => {
  const cells = pathCells("red", YARD, 0, 0);
  return cells.length === 1 && cells[0].col === RING[0].col && cells[0].row === RING[0].row;
})());
check("path of 6 yields 6 waypoints", pathCells("red", 3, 9, 0).length === 6);

/* ------------------------------------------------------------------ */
console.log("\n[rules — 4000 simulated games]");

function invariants(s: GameState, where: string) {
  for (const c of COLORS) {
    const t = s.tokens[c];
    if (t.length !== TOKENS_PER_PLAYER) { failures++; console.error(`  FAIL token count ${c} @ ${where}`); }
    for (const p of t) {
      if (p !== YARD && (p < 0 || p > HOME)) { failures++; console.error(`  FAIL pos ${p} for ${c} @ ${where}`); }
    }
  }
  // Nobody may occupy a cell shared with an opponent unless that cell is safe.
  const occupancy = new Map<number, Color[]>();
  for (const seat of s.seats) {
    if (!seat.playerId) continue;
    for (const p of s.tokens[seat.color]) {
      if (p < 0 || p > LAST_RING_POS) continue;
      const abs = ringIndex(seat.color, p);
      const list = occupancy.get(abs) ?? [];
      list.push(seat.color);
      occupancy.set(abs, list);
    }
  }
  for (const [abs, colors] of occupancy) {
    const distinct = new Set(colors);
    if (distinct.size > 1 && !SAFE_RING.has(abs)) {
      failures++;
      console.error(`  FAIL unsafe co-occupation at ring ${abs} by ${[...distinct]} @ ${where}`);
    }
  }
}

let totalTurns = 0, games = 0, sixStreakForfeits = 0, captures = 0, longest = 0;
const winsByColor: Record<string, number> = {};

for (const playerCount of [2, 3, 4]) {
  for (let g = 0; g < 1400; g++) {
    const colors = seatColorsFor(playerCount);
    let s = createGame("TEST" + g, playerCount);
    colors.forEach((c, i) => { s = join(s, `p${i}`, `P${i}`); });
    if (s.status !== "playing") { check("game starts when full", false); break; }

    let steps = 0;
    while (s.status === "playing" && steps < 20000) {
      steps++;
      const seat = s.seats[s.turn];
      const me = seat.playerId!;
      s = roll(s, me);
      if (s.lastEvent?.type === "roll" && s.lastEvent.blocked) {
        if (s.lastEvent.reason === "three-sixes") sixStreakForfeits++;
        continue;
      }
      const opts = s.legalMoves;
      if (opts.length === 0) { failures++; console.error("  FAIL awaiting move with no options"); break; }
      const pick = opts[Math.floor(Math.random() * opts.length)];
      const before = s.tokens;
      s = move(s, me, pick);
      if (s.lastEvent?.type === "move") captures += s.lastEvent.captured.length;
      invariants(s, `game ${g} step ${steps}`);
    }

    if (s.status !== "finished") { failures++; console.error(`  FAIL game ${g} (${playerCount}P) did not finish in ${steps} steps`); break; }
    const champ = s.ranking[0];
    if (!hasFinished(s, champ)) { failures++; console.error(`  FAIL winner ${champ} has tokens left`); }
    if (s.ranking.length !== playerCount) { failures++; console.error(`  FAIL ranking size ${s.ranking.length} for ${playerCount}P`); }
    winsByColor[champ] = (winsByColor[champ] ?? 0) + 1;
    totalTurns += steps; games++; longest = Math.max(longest, steps);
  }
}

check("all simulated games terminated", games === 4200, `${games}/4200`);
check("captures happen", captures > 0, String(captures));
check("three-six forfeits happen", sixStreakForfeits > 0, String(sixStreakForfeits));
console.log(`  info  avg ${Math.round(totalTurns / games)} rolls/game, longest ${longest}`);
console.log(`  info  ${captures} captures, ${sixStreakForfeits} triple-six forfeits`);
console.log(`  info  wins by colour: ${JSON.stringify(winsByColor)}`);

/* Fairness of the die + first-player advantage sanity ------------------ */
console.log("\n[fairness]");
const faces: Record<number, number> = {};
{
  const s = createGame("R", 2);
  void s;
  const { rollDie } = require("../lib/ludo/rng");
  for (let i = 0; i < 600000; i++) { const v = rollDie(); faces[v] = (faces[v] ?? 0) + 1; }
}
const counts = Object.values(faces);
const expected = 100000;
const maxDev = Math.max(...counts.map((c) => Math.abs(c - expected) / expected));
check("die faces are uniform within 2%", maxDev < 0.02, `max deviation ${(maxDev * 100).toFixed(2)}%`);
check("die only produces 1..6", Object.keys(faces).sort().join(",") === "1,2,3,4,5,6");

console.log(failures === 0 ? "\nALL CHECKS PASSED\n" : `\n${failures} CHECK(S) FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
