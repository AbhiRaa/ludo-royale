/* Drives whole games over the real HTTP API. Run: npx tsx scripts/e2e.mts
   Against a deployment: BASE=https://… npx tsx scripts/e2e.mts */
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
const act = (code: string, player: string | undefined, body: Any) => api(`/api/room/${code}/action`, player, body, "POST");

const P1 = "aaaaaaaa-0000-0000-0000-000000000001";
const P2 = "bbbbbbbb-0000-0000-0000-000000000002";
const P3 = "cccccccc-0000-0000-0000-000000000003";
const INDIA = { tz: "Asia/Kolkata", offsetMin: 330 };
const LONDON = { tz: "Europe/London", offsetMin: 0 };

console.log(`\n[setup] ${BASE}`);
const created = await api("/api/room", P1, { name: "Abhinav", maxPlayers: 2, mode: "royale", zone: INDIA }, "POST");
check("room created", created.status === 201, JSON.stringify(created.data).slice(0, 160));
const code: string = created.data.code;
check("it is a royale table in the lobby", created.data.state.mode === "royale" && created.data.state.status === "lobby");
check("creator got a seat and starting Fate", created.data.state.yourSeat === 0 && created.data.state.fate.red === 1);

const joined = await api(`/api/room/${code}/join`, P2, { name: "Priya", zone: LONDON }, "POST");
check("second player joined and the game started", joined.status === 200 && joined.data.state.status === "playing");
check("each player can see the other's clock", joined.data.state.seats[0].zone?.tz === "Asia/Kolkata" && joined.data.state.seats[1].zone?.tz === "Europe/London");
const rejoin = await api(`/api/room/${code}/join`, P2, { name: "Priya", zone: LONDON }, "POST");
check("an identical re-join does not bump the version", rejoin.data.state.version === joined.data.state.version);
const third = await api(`/api/room/${code}/join`, P3, { name: "Gatecrasher" }, "POST");
check("third player rejected from a 2-seat room", third.status === 409, `got ${third.status}`);

console.log("\n[guards]");
const state0 = (await api(`/api/room/${code}`, P1)).data.state;
const offTurn = state0.turn === 0 ? P2 : P1;
check("off-turn roll rejected", (await act(code, offTurn, { type: "roll" })).status === 409);
check("non-player action rejected", (await act(code, P3, { type: "roll" })).status === 403);
check("unidentified action rejected", (await act(code, undefined, { type: "roll" })).status === 401);
check("unknown room 404s", (await api(`/api/room/ZZZZZ`, P1)).status === 404);
check("unknown action rejected", (await act(code, P1, { type: "teleport" })).status === 400);
const onTurn = state0.turn === 0 ? P1 : P2;
const first = await act(code, onTurn, { type: "roll", actionId: "fixed-action-id-1" });
const second = await act(code, onTurn, { type: "roll", actionId: "fixed-action-id-1" });
check("replayed action is a no-op", first.status === 200 && second.status === 200 &&
  first.data.state.version === second.data.state.version && first.data.state.diceNonce === second.data.state.diceNonce);

console.log("\n[wagers over the wire]");
{
  const w1 = await act(code, P1, { type: "wager", text: "a handwritten letter" });
  const w2 = await act(code, P2, { type: "wager", text: "you cook on the next visit" });
  check("both wagers accepted", w1.status === 200 && w2.status === 200);
  const hers = await api(`/api/room/${code}`, P2); const stranger = await api(`/api/room/${code}`, P3); const anon = await api(`/api/room/${code}`);
  check("her client never receives his wager", !JSON.stringify(hers.data).includes("handwritten") && hers.data.state.yourWager === "you cook on the next visit");
  check("neither does a stranger or an anonymous request", !/handwritten|you cook/.test(JSON.stringify(stranger.data) + JSON.stringify(anon.data)));
  check("both are shown as sealed", hers.data.state.wagerSet.red === true && hers.data.state.wagerSet.yellow === true);
}

console.log("\n[live stream]");
{
  const ctrl = new AbortController();
  const res = await fetch(`${BASE}/api/room/${code}/stream?p=${P1}`, { signal: ctrl.signal });
  check("stream responds as event-stream", (res.headers.get("content-type") ?? "").includes("text/event-stream"));
  const reader = res.body!.getReader(); const dec = new TextDecoder();
  let buf = ""; const deadline = Date.now() + 6000;
  while (Date.now() < deadline && !buf.includes("event: state")) {
    const { value, done } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
  }
  const payload = buf.split("event: state\ndata: ")[1]?.split("\n")[0];
  const parsed = payload ? JSON.parse(payload) : null;
  check("stream pushes the room", parsed?.id === code);
  check("stream marks the subscriber online", parsed?.seats?.[0]?.online === true);
  check("the stream carries the event log", Array.isArray(parsed?.log) && parsed.log.length > 0 && typeof parsed.log[0].seq === "number" && parsed.log[0].after?.tokens);
  check("the stream leaks no wager and no player id", !/you cook|aaaaaaaa|bbbbbbbb/.test(buf));
  ctrl.abort();
}

/** Plays whatever is legal; passes when stuck. Exercises nudges when it can. */
async function playOut(c: string, players: string[], maxCalls = 6000) {
  let state = (await api(`/api/room/${c}`, players[0])).data.state;
  let calls = 0; const seen = { nudges: 0, passes: 0, bounces: 0, captures: 0, backs: 0 };
  while (state.status === "playing" && calls < maxCalls) {
    calls++;
    const who = players[state.turn];
    let r;
    if (!state.awaitingMove) r = await act(c, who, { type: "roll" });
    else if (state.legalMoves.length) {
      const o = state.legalMoves[Math.floor(Math.random() * state.legalMoves.length)];
      r = await act(c, who, { type: "move", token: o.token, to: o.to });
    } else {
      // stuck at the natural value: try entering with a nudged six, else pass
      const color = state.seats[state.turn].color;
      const need = 6 - state.dice;
      const inYard = state.tokens[color].findIndex((p: number) => p === -1);
      if (state.mode === "royale" && inYard >= 0 && need <= state.fate[color]) { r = await act(c, who, { type: "move", token: inYard, to: 0, nudge: need }); seen.nudges++; }
      else { r = await act(c, who, { type: "pass" }); seen.passes++; }
    }
    if (r.status !== 200) { check(`action ${calls}`, false, JSON.stringify(r.data)); break; }
    state = r.data.state;
    const ev = state.log[state.log.length - 1];
    if (ev?.type === "move") { if (ev.bounced) seen.bounces++; seen.captures += ev.captured.length; if (ev.kind === "back") seen.backs++; }
  }
  return { state, calls, seen };
}

console.log("\n[a full royale game over HTTP]");
{
  const { state, calls, seen } = await playOut(code, [P1, P2]);
  check("game reached a result", state.status === "finished", `${state.status} after ${calls} calls`);
  check("there is a full ranking", state.ranking?.length === 2, JSON.stringify(state.ranking));
  check("winner has all four home", state.tokens[state.ranking[0]].every((p: number) => p === 56));
  check("Fate was spent to enter the board", seen.nudges > 0, String(seen.nudges));
  check("wagers are revealed with the result", state.stakes?.length === 2 && state.stakes.some((s: Any) => s.text === "a handwritten letter"));
  check("match stats add up", state.stats.red.captures + state.stats.yellow.captures === state.stats.red.lost + state.stats.yellow.lost);
  console.log(`  info  ${calls} HTTP actions · ${seen.captures} captures · ${seen.bounces} shield blocks · ${seen.nudges} nudges · ${seen.passes} passes · winner ${state.ranking?.[0]}`);

  const re = await act(code, P1, { type: "rematch" });
  check("rematch resets the board", re.status === 200 && re.data.state.status === "playing" && re.data.state.tokens.red.every((p: number) => p === -1));
  const said = await act(code, P2, { type: "chat", text: "  good game ❤️  " });
  check("chat message stored and trimmed", said.data.state.chat.at(-1)?.text === "good game ❤️");
  check("empty chat rejected", (await act(code, P2, { type: "chat", text: "   " })).status === 400);
  const cheer = await act(code, P2, { type: "react", emoji: "🔥" });
  check("a reaction lands in the log", cheer.status === 200 && cheer.data.state.log.at(-1)?.type === "react");
  check("a made-up reaction is refused", (await act(code, P2, { type: "react", emoji: "💣" })).status === 400);
}

console.log("\n[classic still plays, with the old request shape]");
{
  const c = (await api("/api/room", P1, { name: "A", maxPlayers: 2, mode: "classic" }, "POST")).data;
  await api(`/api/room/${c.code}/join`, P2, { name: "B" }, "POST");
  check("classic table has no Fate", c.state.mode === "classic" && c.state.fate.red === 0);
  let s = (await api(`/api/room/${c.code}`, P1)).data.state; let calls = 0; let bareOk = true;
  while (s.status === "playing" && calls++ < 6000) {
    const who = [P1, P2][s.turn];
    // the previous client sent only { token } — that must keep working
    const r = s.awaitingMove ? await act(c.code, who, { type: "move", token: s.legalMoves[0].token }) : await act(c.code, who, { type: "roll" });
    if (r.status !== 200) { bareOk = false; console.error("   ", JSON.stringify(r.data)); break; }
    s = r.data.state;
  }
  check("a whole classic game completes on bare {token} moves", bareOk && s.status === "finished", `${s.status} after ${calls}`);
  check("classic refuses Fate", (await act(c.code, P1, { type: "pass" })).status !== 200);
}

console.log("\n[solo against the House]");
{
  const solo = await api("/api/room", P1, { name: "Abhinav", mode: "royale", solo: true, zone: INDIA }, "POST");
  check("solo table starts immediately", solo.status === 201 && solo.data.state.status === "playing" && solo.data.state.seats[1].name === "The House");
  check("the House is present and its id is hidden", solo.data.state.seats[1].online === true && !JSON.stringify(solo.data).includes("bot:"));
  let s = solo.data.state; let calls = 0; let alwaysMine = true; let maxBurst = 0;
  while (s.status === "playing" && calls++ < 6000) {
    const seqBefore = s.nonce;
    let r;
    if (!s.awaitingMove) r = await act(solo.data.code, P1, { type: "roll" });
    else if (s.legalMoves.length) r = await act(solo.data.code, P1, { type: "move", token: s.legalMoves[0].token, to: s.legalMoves[0].to });
    else r = await act(solo.data.code, P1, { type: "pass" });
    if (r.status !== 200) { check("solo action", false, JSON.stringify(r.data)); break; }
    s = r.data.state;
    maxBurst = Math.max(maxBurst, s.nonce - seqBefore);
    if (s.status === "playing" && s.turn !== 0) alwaysMine = false;
  }
  check("the House always answers within the same request", alwaysMine);
  check("a solo game runs to a result", s.status === "finished", `${s.status} after ${calls}`);
  console.log(`  info  ${calls} of my actions · largest burst of events in one response: ${maxBurst} (log holds 14) · winner ${s.ranking?.[0]}`);
}

console.log("\n[concurrent writes]");
{
  const c = await api("/api/room", P1, { name: "A", maxPlayers: 2 }, "POST");
  await api(`/api/room/${c.data.code}/join`, P2, { name: "B" }, "POST");
  const results = await Promise.all(
    Array.from({ length: 12 }, (_, i) => act(c.data.code, i % 2 ? P1 : P2, { type: "chat", text: `m${i}` })),
  );
  const final = (await api(`/api/room/${c.data.code}`, P1)).data.state;
  check("all concurrent writes accepted", results.every((r) => r.status === 200), results.map((r) => r.status).join(","));
  check("no write was lost to a race", final.chat.length === 12, `${final.chat.length}/12`);
}

console.log(failures === 0 ? "\nALL E2E CHECKS PASSED\n" : `\n${failures} E2E CHECK(S) FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
