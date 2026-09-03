/* Drives a whole game over the real HTTP API. Run: npx tsx scripts/e2e.ts */
const BASE = process.env.BASE ?? "http://localhost:3000";
let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) { failures++; console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
  else console.log(`  ok    ${name}`);
};

type Any = Record<string, any>;
const api = async (path: string, player?: string, body?: Any, method = "GET") => {
  const res = await fetch(BASE + path, {
    method,
    headers: { "content-type": "application/json", ...(player ? { "x-ludo-player": player } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: (await res.json().catch(() => ({}))) as Any };
};

const P1 = "aaaaaaaa-0000-0000-0000-000000000001";
const P2 = "bbbbbbbb-0000-0000-0000-000000000002";
const P3 = "cccccccc-0000-0000-0000-000000000003";

console.log("\n[setup]");
const created = await api("/api/room", P1, { name: "Abhinav", maxPlayers: 2 }, "POST");
check("room created", created.status === 201, JSON.stringify(created.data).slice(0, 160));
const code: string = created.data.code;
check("state starts in lobby", created.data.state.status === "lobby");
check("creator got a seat", created.data.state.yourSeat === 0);

const joined = await api(`/api/room/${code}/join`, P2, { name: "Priya" }, "POST");
check("second player joined", joined.status === 200 && joined.data.state.status === "playing");

const third = await api(`/api/room/${code}/join`, P3, { name: "Gatecrasher" }, "POST");
check("third player rejected from a 2-seat room", third.status === 409, `got ${third.status}`);

console.log("\n[guards]");
const state0 = (await api(`/api/room/${code}`, P1)).data.state;
const offTurn = state0.turn === 0 ? P2 : P1;
const wrongTurn = await api(`/api/room/${code}/action`, offTurn, { type: "roll" }, "POST");
check("off-turn roll rejected", wrongTurn.status === 409, `got ${wrongTurn.status}`);

const stranger = await api(`/api/room/${code}/action`, P3, { type: "roll" }, "POST");
check("non-player action rejected", stranger.status === 403, `got ${stranger.status}`);

const noId = await api(`/api/room/${code}/action`, undefined, { type: "roll" }, "POST");
check("unidentified action rejected", noId.status === 401, `got ${noId.status}`);

const bogus = await api(`/api/room/ZZZZZ`, P1);
check("unknown room 404s", bogus.status === 404);

// The same actionId twice must only ever be applied once.
const onTurn = state0.turn === 0 ? P1 : P2;
const dup = "fixed-action-id-1";
const first = await api(`/api/room/${code}/action`, onTurn, { type: "roll", actionId: dup }, "POST");
const second = await api(`/api/room/${code}/action`, onTurn, { type: "roll", actionId: dup }, "POST");
check("replayed action is a no-op", first.status === 200 && second.status === 200 &&
  first.data.state.version === second.data.state.version &&
  first.data.state.dice === second.data.state.dice,
  `v${first.data.state.version} vs v${second.data.state.version}`);

console.log("\n[live stream]");
{
  const ctrl = new AbortController();
  const res = await fetch(`${BASE}/api/room/${code}/stream?p=${P1}`, { signal: ctrl.signal });
  check("stream responds as event-stream", (res.headers.get("content-type") ?? "").includes("text/event-stream"));
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const deadline = Date.now() + 6000;
  let sawState = false;
  while (Date.now() < deadline && !sawState) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    if (buf.includes("event: state")) sawState = true;
  }
  check("stream pushes a state snapshot", sawState);
  const payload = buf.split("event: state\ndata: ")[1]?.split("\n")[0];
  const parsed = payload ? JSON.parse(payload) : null;
  check("stream payload is the room", parsed?.id === code, String(parsed?.id));
  check("stream marks the subscriber online", parsed?.seats?.[0]?.online === true);
  ctrl.abort();
}

console.log("\n[full game over HTTP]");
let steps = 0;
let captures = 0;
let state = (await api(`/api/room/${code}`, P1)).data.state;
while (state.status === "playing" && steps < 4000) {
  steps++;
  const who = state.turn === 0 ? P1 : P2;
  if (!state.awaitingMove) {
    const r = await api(`/api/room/${code}/action`, who, { type: "roll" }, "POST");
    if (r.status !== 200) { check(`roll at step ${steps}`, false, JSON.stringify(r.data)); break; }
    state = r.data.state;
    continue;
  }
  const pick = state.legalMoves[Math.floor(Math.random() * state.legalMoves.length)];
  const m = await api(`/api/room/${code}/action`, who, { type: "move", token: pick }, "POST");
  if (m.status !== 200) { check(`move at step ${steps}`, false, JSON.stringify(m.data)); break; }
  state = m.data.state;
  if (state.lastEvent?.type === "move") captures += state.lastEvent.captured.length;
}
check("game reached a result", state.status === "finished", `${state.status} after ${steps} calls`);
check("there is a winner", Array.isArray(state.ranking) && state.ranking.length === 2, JSON.stringify(state.ranking));
check("winner has all four home", state.tokens[state.ranking[0]].every((p: number) => p === 56));
console.log(`  info  ${steps} HTTP actions, ${captures} captures, winner ${state.ranking?.[0]}`);

console.log("\n[rematch + chat]");
const re = await api(`/api/room/${code}/action`, P1, { type: "rematch" }, "POST");
check("rematch resets the board", re.status === 200 && re.data.state.status === "playing" &&
  re.data.state.tokens.red.every((p: number) => p === -1));
const said = await api(`/api/room/${code}/action`, P2, { type: "chat", text: "  good game ❤️  " }, "POST");
check("chat message stored and trimmed", said.status === 200 &&
  said.data.state.chat.at(-1)?.text === "good game ❤️");
const empty = await api(`/api/room/${code}/action`, P2, { type: "chat", text: "   " }, "POST");
check("empty chat rejected", empty.status === 400);

console.log("\n[concurrent writes]");
{
  const c = await api("/api/room", P1, { name: "A", maxPlayers: 2 }, "POST");
  const c2 = c.data.code;
  await api(`/api/room/${c2}/join`, P2, { name: "B" }, "POST");
  // 12 chat writes fired at once must all survive the compare-and-swap retries.
  const results = await Promise.all(
    Array.from({ length: 12 }, (_, i) =>
      api(`/api/room/${c2}/action`, i % 2 ? P1 : P2, { type: "chat", text: `m${i}` }, "POST"),
    ),
  );
  const ok = results.every((r) => r.status === 200);
  const final = (await api(`/api/room/${c2}`, P1)).data.state;
  check("all concurrent writes accepted", ok, results.map((r) => r.status).join(","));
  check("no write was lost to a race", final.chat.length === 12, `${final.chat.length}/12`);
}

console.log(failures === 0 ? "\nALL E2E CHECKS PASSED\n" : `\n${failures} E2E CHECK(S) FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
