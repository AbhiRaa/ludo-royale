/* Drives a live room over HTTP so a watching browser animates it.
   Usage: npx tsx scripts/drive.mts <code> <p1> <p2> <goal> */
const BASE = "http://localhost:3000";
const [code, P1, P2, goal = "onboard"] = process.argv.slice(2);
type Any = Record<string, any>;
const api = async (path: string, player?: string, body?: Any, method = "GET") => {
  const res = await fetch(BASE + path, {
    method,
    headers: { "content-type": "application/json", ...(player ? { "x-ludo-player": player } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: (await res.json().catch(() => ({}))) as Any };
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let state = (await api(`/api/room/${code}`, P1)).data.state;
const onTrack = (s: Any, c: string) => s.tokens[c].filter((p: number) => p >= 0 && p <= 50).length;

for (let i = 0; i < 3000; i++) {
  if (state.status !== "playing") break;
  const who = state.turn === 0 ? P1 : P2;
  if (!state.awaitingMove) {
    state = (await api(`/api/room/${code}/action`, who, { type: "roll" }, "POST")).data.state;
  } else {
    // prefer the move that captures, so the interesting animation actually fires
    let pick = state.legalMoves[0];
    if (goal === "capture") {
      const me = state.seats[state.turn].color;
      const foe = state.seats[1 - state.turn].color;
      const START: Any = { red: 0, green: 13, yellow: 26, blue: 39 };
      const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
      const foeAbs = new Set(
        state.tokens[foe].filter((p: number) => p >= 0 && p <= 50).map((p: number) => (START[foe] + p) % 52),
      );
      for (const t of state.legalMoves) {
        const from = state.tokens[me][t];
        const to = from === -1 ? 0 : from + state.dice;
        if (to > 50) continue;
        const abs = (START[me] + to) % 52;
        if (foeAbs.has(abs) && !SAFE.has(abs)) { pick = t; break; }
      }
    }
    state = (await api(`/api/room/${code}/action`, who, { type: "move", token: pick }, "POST")).data.state;
    if (state.lastEvent?.type === "move" && state.lastEvent.captured.length && goal === "capture") {
      console.log("CAPTURE", JSON.stringify(state.lastEvent));
      break;
    }
  }
  await sleep(140);
  if (goal === "onboard" && onTrack(state, "red") >= 2 && onTrack(state, "yellow") >= 2) break;
}
console.log("turn", state.turn, "red", JSON.stringify(state.tokens.red), "yellow", JSON.stringify(state.tokens.yellow), state.status);
