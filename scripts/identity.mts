/* Regression test: identity must stay stable when storage is hostile.
   Run: npx tsx scripts/identity.mts */
let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) { failures++; console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
  else console.log(`  ok    ${name}`);
};

type Env = { throwing?: boolean; cookies?: boolean };
function install({ throwing = false, cookies = true }: Env) {
  const mem = new Map<string, string>();
  let jar = "";
  const g = globalThis as any;
  g.window = g;
  g.localStorage = {
    getItem(k: string) { if (throwing) throw new DOMException("denied"); return mem.get(k) ?? null; },
    setItem(k: string, v: string) { if (throwing) throw new DOMException("denied"); mem.set(k, v); },
  };
  g.document = {
    get cookie() { return cookies ? jar : ""; },
    set cookie(v: string) {
      if (!cookies) return;
      const [pair] = v.split(";");
      const [k] = pair.split("=");
      const kept = jar.split("; ").filter((c) => c && !c.startsWith(`${k}=`));
      jar = [...kept, pair].join("; ");
    },
  };
  return { mem, jar: () => jar };
}

let bust = 0;
const load = () => import(`../lib/player.ts?v=${++bust}`);

console.log("\n[storage works normally]");
{
  install({});
  const p = await load();
  const a = p.getPlayerId();
  const b = p.getPlayerId();
  check("id is stable across calls", a === b, `${a} vs ${b}`);
  check("id looks like a uuid", /^[0-9a-f-]{36}$/i.test(a), a);
  const p2 = await load(); // simulate a full page reload
  check("id survives a reload", p2.getPlayerId() === a, `${p2.getPlayerId()} vs ${a}`);
  p.setPlayerName("Abhinav");
  check("name persists", (await load()).getPlayerName() === "Abhinav");
}

console.log("\n[localStorage throws, cookies work]");
{
  install({ throwing: true, cookies: true });
  const p = await load();
  const a = p.getPlayerId();
  check("id is stable across calls", a === p.getPlayerId());
  const p2 = await load();
  check("cookie carries the id across a reload", p2.getPlayerId() === a, `${p2.getPlayerId()} vs ${a}`);
}

console.log("\n[no storage at all]");
{
  install({ throwing: true, cookies: false });
  const p = await load();
  const first = p.getPlayerId();
  // This is the case that caused a room creator to take both seats.
  const repeats = Array.from({ length: 20 }, () => p.getPlayerId());
  check("id never changes within a session", repeats.every((r) => r === first), new Set(repeats).size + " distinct");
  check("storageIsPersistent reports false", p.storageIsPersistent() === false);
  p.setPlayerName("Priya");
  check("name still readable in-session", p.getPlayerName() === "Priya");
}

console.log(failures === 0 ? "\nIDENTITY CHECKS PASSED\n" : `\n${failures} IDENTITY CHECK(S) FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
