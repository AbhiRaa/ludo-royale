"use client";

import dynamic from "next/dynamic";
import { Component, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useRoom } from "@/lib/useRoom";
import { usePresenter } from "@/lib/usePresenter";
import { getPlayerName, rememberRoom, setPlayerName } from "@/lib/player";
import { buzz, loadMutePreference, setMuted, sfx, unlockAudio } from "@/lib/sound";
import { loadMusicPreference, setMusicOn, setTension, startMusic, stopMusic } from "@/lib/music";
import { Color, GameEvent, HOME, ROLES, Snap } from "@/lib/ludo/types";
import { RuleView, optionsFor, previewMove, roleOf } from "@/lib/ludo/rules";
import { ROLL_MS, SLOW_HOP_MS, moveTimeline } from "@/lib/ludo/timeline";
import { ROLE_INFO } from "@/lib/ludo/court";
import { BRASS_HI, PALETTE } from "@/lib/ludo/render";
import { localHour, localZone } from "@/lib/zone";
import { skyAt } from "@/lib/sky";
import { FlatBoard } from "./FlatBoard";
import { Chat } from "./Chat";
import { Plate, Floater } from "./hud/Plate";
import { Dock, DockMode } from "./hud/Dock";
import { Banner, BannerSpec } from "./hud/Banner";
import { CourtPanel, Prefs, SettingsMenu, WagerSheet } from "./hud/Panels";
import { Report } from "./hud/Report";
import type { Marker } from "./three/Scene";

const Scene = dynamic(() => import("./three/Scene"), { ssr: false, loading: () => null });

/** If the 3D scene ever throws, the game carries on on the flat board. */
class SceneBoundary extends Component<{ onFail: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFail();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

const readFlag = (key: string, fallback: boolean) => {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
};
const writeFlag = (key: string, value: boolean) => {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    /* preference will not persist */
  }
};

/** How much is riding on the next few throws, 0..1. Drives the score. */
function tensionOf(view: Snap, players: Color[]): number {
  if (view.status !== "playing") return 0.12;
  let lead = 0;
  let home = 0;
  for (const c of players) {
    const t = view.tokens[c];
    lead = Math.max(lead, t.reduce((n, p) => n + Math.max(p, 0), 0) / (4 * HOME));
    home = Math.max(home, t.filter((p) => p === HOME).length);
  }
  return Math.min(1, 0.14 + lead * 0.55 + (home / 4) * 0.22 + (home >= 3 ? 0.16 : 0));
}

let bannerSeq = 0;
let floaterSeq = 0;

export function Game({ code }: { code: string }) {
  const router = useRouter();
  const { state, status, error, pending, send, join, setError } = useRoom(code);

  const [name, setName] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [prefs, setPrefs] = useState<Prefs>({ sound: true, music: true, film: true, flat: false });
  const [webgl, setWebgl] = useState(true);
  const [narrow, setNarrow] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const [panel, setPanel] = useState<"court" | "wager" | "settings" | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [bubbles, setBubbles] = useState<Partial<Record<Color, string>>>({});
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [banner, setBanner] = useState<BannerSpec | null>(null);
  const [grade, setGrade] = useState<"kill" | "gold" | null>(null);
  const [copied, setCopied] = useState(false);
  const [cameraReset, setCameraReset] = useState(0);
  const [showReport, setShowReport] = useState(false);

  const [nudge, setNudge] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [die, setDie] = useState<{ owner: Color | null; value: number | null; throwSeq: number }>({ owner: null, value: null, throwSeq: -1 });

  const joinedRef = useRef(false);
  const dieSeeded = useRef(false);
  const chatSeen = useRef<number | null>(null);
  const chatOpenRef = useRef(chatOpen);
  chatOpenRef.current = chatOpen;
  const stateRef = useRef(state);
  stateRef.current = state;

  /* ---- one-time setup -------------------------------------------------- */
  useEffect(() => {
    const stored = getPlayerName();
    setName(stored);
    setNameDraft(stored);
    const sound = !loadMutePreference();
    const music = loadMusicPreference();
    setPrefs({ sound, music, film: readFlag("ludo.film", true), flat: readFlag("ludo.flat", false) });
    try {
      const probe = document.createElement("canvas");
      setWebgl(Boolean(probe.getContext("webgl2") ?? probe.getContext("webgl")));
    } catch {
      setWebgl(false);
    }

    const mq = window.matchMedia("(max-width: 760px)");
    const onMq = () => setNarrow(mq.matches);
    onMq();
    mq.addEventListener("change", onMq);

    // audio can only begin from a gesture; the score starts with the first one
    const unlock = () => {
      unlockAudio();
      if (loadMusicPreference()) startMusic();
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    const onVisible = () => {
      if (document.hidden) stopMusic();
      else if (loadMusicPreference()) startMusic();
    };
    document.addEventListener("visibilitychange", onVisible);
    const tick = setInterval(() => setNow(Date.now()), 20_000);
    return () => {
      mq.removeEventListener("change", onMq);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(tick);
      stopMusic();
    };
  }, []);

  const changePrefs = useCallback((patch: Partial<Prefs>) => {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      if (patch.sound !== undefined) {
        unlockAudio();
        setMuted(!next.sound);
        if (next.sound) sfx("turn");
      }
      if (patch.music !== undefined) {
        unlockAudio();
        setMusicOn(next.music);
      }
      if (patch.film !== undefined) writeFlag("ludo.film", next.film);
      if (patch.flat !== undefined) writeFlag("ludo.flat", next.flat);
      return next;
    });
  }, []);

  /* ---- take a seat ----------------------------------------------------- */
  useEffect(() => {
    if (!state || joinedRef.current || !name) return;
    if (state.yourSeat != null) {
      joinedRef.current = true;
      rememberRoom(code);
      // an older build may have seated us without a clock: send it now
      if (!state.seats[state.yourSeat].zone) void join(name);
      return;
    }
    if (state.seats.every((s) => s.taken)) return; // full — watch instead
    joinedRef.current = true;
    rememberRoom(code);
    void join(name);
  }, [state, name, join, code]);

  /* ---- things that happen beside the board ------------------------------ */
  const nameOf = useCallback((c: Color) => stateRef.current?.seats.find((s) => s.color === c)?.name ?? c, []);
  const onInstant = useCallback(
    (ev: GameEvent) => {
      if (ev.type === "join") {
        sfx("join");
        setToast(`${ev.name} sat down.`);
      } else if (ev.type === "wager") {
        if (ev.color !== stateRef.current?.yourColor) {
          sfx("fate");
          setToast(`${nameOf(ev.color)} sealed a wager.`);
        }
      } else if (ev.type === "react") {
        sfx("react");
        const id = ++floaterSeq;
        setFloaters((f) => [...f, { id, color: ev.color, emoji: ev.emoji }]);
        setTimeout(() => setFloaters((f) => f.filter((x) => x.id !== id)), 2000);
      }
    },
    [nameOf],
  );

  const { view, cue, idle } = usePresenter(state, prefs.film, onInstant);

  const myColor = state?.yourColor ?? null;
  const royale = state?.mode === "royale";
  const seatsKey = state ? state.seats.map((s) => `${s.color}${s.taken ? 1 : 0}${s.zone?.offsetMin ?? "x"}`).join("|") : "";
  const players = useMemo(
    () => (stateRef.current ? stateRef.current.seats.filter((s) => s.taken).map((s) => s.color) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seatsKey],
  );
  const pieceName = useCallback(
    (token: number) => (stateRef.current?.mode === "royale" ? ROLE_INFO[ROLES[token]].name : "pawn"),
    [],
  );

  /* ---- the die follows the events that have actually played -------------- */
  useEffect(() => {
    if (!state || dieSeeded.current) return;
    dieSeeded.current = true;
    if (state.dice == null) return;
    const last = [...state.log].reverse().find((e) => e.type === "roll" || e.type === "move");
    const owner = last && (last.type === "roll" || last.type === "move") ? last.color : state.seats[state.turn]?.color ?? null;
    setDie({ owner, value: state.dice, throwSeq: -1 });
  }, [state]);
  useEffect(() => {
    if (!cue) return;
    if (cue.type === "roll") setDie({ owner: cue.color, value: cue.value, throwSeq: cue.seq });
    else if (cue.type === "move") setDie((d) => ({ ...d, owner: cue.color, value: cue.value }));
    else if (cue.type === "rematch") setDie({ owner: null, value: null, throwSeq: -1 });
  }, [cue]);

  /* ---- sound, haptics, banners: all on the same clock as the pawns ------- */
  useEffect(() => {
    const s = stateRef.current;
    if (!cue || !s) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, Math.max(0, ms)));
    const show = (spec: Omit<BannerSpec, "id">, start: number, hold: number, look: "kill" | "gold" | null = null) => {
      at(start, () => {
        setBanner({ ...spec, id: ++bannerSeq });
        setGrade(look);
      });
      at(start + hold, () => {
        setBanner(null);
        setGrade(null);
      });
    };
    const film = prefs.film;
    const mine = cue.type !== "start" && cue.type !== "rematch" && "color" in cue && cue.color === s.yourColor;

    if (cue.type === "roll") {
      if (!mine) sfx("rattle");
      at(230, () => { sfx("land"); buzz(14); });
      at(680, () => sfx("tick"));
      if (cue.value === 6 && !cue.blocked) at(1000, () => sfx("six"));
      if (cue.blocked) {
        at(ROLL_MS, () => sfx("blocked"));
        if (cue.reason === "three-sixes") {
          show({ title: "Three sixes", sub: `${nameOf(cue.color)} forfeits the turn`, tone: PALETTE[cue.color].light, cinema: false }, ROLL_MS, 760);
        } else {
          at(ROLL_MS, () => setToast(`Nothing moves on a ${cue.value}${s.mode === "royale" ? ` — ${mine ? "you bank" : `${nameOf(cue.color)} banks`} a Fate` : ""}.`));
        }
      }
    } else if (cue.type === "move") {
      const tl = moveTimeline(cue, film);
      const who = `${nameOf(cue.color)}’s ${pieceName(cue.token)}`;
      if (cue.nudge !== 0) {
        sfx("nudge", cue.nudge);
        at(140, () => sfx("fate"));
      }
      tl.starts.forEach((t, i) => at(t + tl.hops[i] * 0.5, () => sfx("hop", Math.min(i, 5))));
      if (tl.dramatic) at(tl.arrive - SLOW_HOP_MS, () => sfx("whoosh"));
      if (cue.captured.length) {
        at(tl.arrive, () => { sfx("capture"); if (film) sfx("boom"); buzz([30, 40, 70]); });
        const prey = cue.captured.map((h) => `${nameOf(h.color)}’s ${pieceName(h.token)}`).join(" & ");
        show({ title: "Sent home", sub: `${who} takes ${prey}`, tone: PALETTE[cue.color].light, cinema: film }, tl.arrive - 60, film ? 1350 : 950, film ? "kill" : null);
      } else if (cue.bounced) {
        at(tl.arrive, () => { sfx("shield"); buzz(45); });
        show({ title: "Denied", sub: `${nameOf(cue.shieldBroken[0])}’s Guard throws ${who} back`, tone: "#a6d4ff", cinema: film }, tl.arrive, film ? 1000 : 800);
      } else if (cue.finished) {
        at(tl.arrive, () => sfx("home"));
        show({ title: "Home", sub: `${who} is in`, tone: "#ffd66b", cinema: false }, tl.arrive, 820, "gold");
      } else if (cue.star) {
        at(tl.arrive, () => sfx("fate"));
      }
    } else if (cue.type === "pass") {
      sfx("pass");
      setToast(`${mine ? "You pass" : `${nameOf(cue.color)} passes`}${s.mode === "royale" ? " and bank" + (mine ? "" : "s") + " a Fate" : ""}.`);
    } else if (cue.type === "start") {
      sfx("start");
      const names = s.seats.filter((x) => x.taken).map((x) => x.name ?? x.color);
      show({ title: names.join(" × "), sub: s.mode === "royale" ? "The Court is seated" : "Classic rules", tone: BRASS_HI, cinema: film }, 350, film ? 2300 : 1300);
    } else if (cue.type === "rematch") {
      sfx("start");
      setToast("New game. The loser opens.");
    } else if (cue.type === "win") {
      sfx(cue.color === s.yourColor ? "win" : "lose");
    }
    return () => {
      timers.forEach(clearTimeout);
      setBanner(null);
      setGrade(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cue?.seq]);

  useEffect(() => {
    if (view) setTension(tensionOf(view, players));
  }, [view, players]);

  /* ---- chat: bubbles by the speaker's plate, a badge when the drawer is shut */
  useEffect(() => {
    if (!state) return;
    const count = state.chat.length;
    if (chatSeen.current === null) {
      chatSeen.current = count;
      return;
    }
    if (count <= chatSeen.current) return;
    const fresh = state.chat.slice(chatSeen.current);
    chatSeen.current = count;
    for (const m of fresh) {
      if (!m.color || m.color === state.yourColor) continue;
      sfx("msg");
      if (chatOpenRef.current) continue;
      setUnread((n) => n + 1);
      const color = m.color;
      setBubbles((b) => ({ ...b, [color]: m.text }));
      setTimeout(() => setBubbles((b) => (b[color] === m.text ? { ...b, [color]: undefined } : b)), 5200);
    }
  }, [state]);

  /* ---- whose move, and what may they do ---------------------------------- */
  const playing = state?.status === "playing";
  const turnColor = state && view ? state.seats[view.turn]?.color ?? null : null;
  const myTurn = Boolean(state && playing && idle && myColor && state.seats[state.turn]?.color === myColor);
  const choosing = myTurn && Boolean(state?.awaitingMove) && state?.dice != null;
  const myFate = state && myColor ? state.fate[myColor] : 0;

  useEffect(() => {
    setNudge(0);
    setSelected(null);
    setHovered(null);
  }, [state?.diceNonce, choosing]);

  const ruleView = useMemo<RuleView | null>(
    () => (state ? { mode: state.mode, players, tokens: state.tokens, shield: state.shield } : null),
    [state, players],
  );
  const value = choosing && state?.dice != null ? state.dice + nudge : null;
  const options = useMemo(
    () => (choosing && ruleView && myColor && value != null ? optionsFor(ruleView, myColor, value) : []),
    [choosing, ruleView, myColor, value],
  );
  const pickable = useMemo(() => [...new Set(options.map((o) => o.token))], [options]);
  const focus = selected ?? hovered;
  const markers = useMemo<Marker[]>(() => {
    if (focus == null || !ruleView || !myColor) return [];
    return options
      .filter((o) => o.token === focus)
      .map((o) => {
        const out = previewMove(ruleView, myColor, o);
        return { ...o, tone: out.bounced ? "bounce" : out.captured.length ? "capture" : out.finished ? "home" : "move" };
      });
  }, [focus, options, ruleView, myColor]);
  const stuck = choosing && (state?.legalMoves.length ?? 0) === 0;

  /* ---- actions ----------------------------------------------------------- */
  const throwDie = useCallback(() => {
    sfx("rattle");
    void send({ type: "roll" });
  }, [send]);
  const play = useCallback(
    (token: number, to: number) => {
      if (pending) return;
      setSelected(null);
      setHovered(null);
      void send({ type: "move", token, to, nudge });
    },
    [send, nudge, pending],
  );
  const pickToken = useCallback(
    (token: number) => {
      const mine = options.filter((o) => o.token === token);
      if (mine.length === 1) play(token, mine[0].to);
      else if (mine.length > 1) {
        sfx("tick");
        setSelected((s) => (s === token ? null : token));
      }
    },
    [options, play],
  );
  const nudgeBy = useCallback(
    (delta: number) => {
      if (!state || state.dice == null) return;
      const next = nudge + delta;
      if (Math.abs(next) > myFate || state.dice + next < 1 || state.dice + next > 6) return;
      sfx("nudge", delta);
      setSelected(null);
      setNudge(next);
    },
    [state, nudge, myFate],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "Space" && myTurn && state && !state.awaitingMove && !pending) {
        e.preventDefault();
        throwDie();
      }
      if (e.code === "Escape") {
        setSelected(null);
        setPanel(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [myTurn, state, pending, throwDie]);

  useEffect(() => {
    if (myTurn && state && !state.awaitingMove) {
      sfx("turn");
      if (document.hidden) document.title = "▶ Your turn — Ludo Royale";
    } else if (!document.hidden) document.title = "Ludo Royale";
  }, [myTurn, state?.awaitingMove]); // eslint-disable-line react-hooks/exhaustive-deps

  // the first time someone meets the Court, introduce it
  useEffect(() => {
    if (!royale || !playing || !myColor) return;
    if (readFlag("ludo.court.seen", false)) return;
    writeFlag("ludo.court.seen", true);
    const t = setTimeout(() => setPanel((p) => p ?? "court"), 3400);
    return () => clearTimeout(t);
  }, [royale, playing, myColor]);

  const finished = state?.status === "finished";
  useEffect(() => {
    if (!finished || !idle) {
      setShowReport(false);
      return;
    }
    const t = setTimeout(() => setShowReport(true), 2400);
    return () => clearTimeout(t);
  }, [finished, idle]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3400);
    return () => clearTimeout(t);
  }, [toast]);

  const myZone = useMemo(() => localZone(), []);
  const skies = useMemo(
    () =>
      (stateRef.current?.seats ?? [])
        .filter((s) => s.taken)
        .map((s) => ({ color: s.color, sky: skyAt(localHour(s.zone ?? myZone, now)) })),
    // the sky only needs to move every couple of minutes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seatsKey, Math.floor(now / 120_000), myZone],
  );

  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/play/${code}` : "";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setToast(shareUrl);
    }
  };

  /* ---- what to tell the player ------------------------------------------- */
  const hint = useMemo(() => {
    if (!state || !view) return "";
    if (state.status === "lobby") return "The game begins the moment the other chair fills.";
    if (state.status === "finished") return "Game over.";
    const active = state.seats[view.turn];
    if (!myColor) return `You are watching. ${active?.name ?? "Someone"} is up.`;
    if (!idle) return "";
    if (state.seats[state.turn]?.color !== myColor) return `${active?.name ?? "Your opponent"} is playing…`;
    if (!state.awaitingMove) return "Your throw.";

    if (focus != null && ruleView && markers.length === 1) {
      const out = previewMove(ruleView, myColor, markers[0]);
      const piece = pieceName(focus);
      if (out.bounced) return `Their Guard’s shield will throw your ${piece} back — but it breaks the shield.`;
      if (out.captured.length) return `Your ${piece} captures ${out.captured.map((h) => `${nameOf(h.color)}’s ${pieceName(h.token)}`).join(" and ")}. Throw again.`;
      if (out.finished) return `Brings your ${piece} home. Throw again.`;
      if (markers[0].kind === "enter") return `Brings your ${piece} onto the board.`;
      if (out.star) return `Lands your ${piece} on a star: safe, and +1 Fate.`;
    }
    if (selected != null && markers.length > 1) return "Forward, or strike backward? Tap where the Jester lands.";
    if (options.length === 0) {
      if (royale && myFate > 0) return `Nothing moves on a ${value}. Nudge the die with Fate, or pass.`;
      return `Nothing moves on a ${value}.`;
    }
    return nudge !== 0 ? `Playing it as a ${value}. Tap a glowing pawn.` : `You threw a ${state.dice}. Tap a glowing pawn.`;
  }, [state, view, myColor, idle, focus, ruleView, markers, selected, options, royale, myFate, value, nudge, pieceName, nameOf]);

  /* ---- gates ---------------------------------------------------------------- */
  if (status === "gone") {
    return (
      <Centered>
        <h2 className="display" style={{ fontSize: 26, marginBottom: 8 }}>That table is gone</h2>
        <p style={{ color: "var(--text-mute)", marginBottom: 20 }}>{error ?? "The room expired or never existed."}</p>
        <button className="btn btn-primary" onClick={() => router.push("/")}>Back to the lobby</button>
      </Centered>
    );
  }
  if (!name) {
    return (
      <Centered>
        <p className="eyebrow" style={{ marginBottom: 10 }}>Room {code}</p>
        <h2 className="display" style={{ fontSize: 28, marginBottom: 16 }}>What should we call you?</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const v = nameDraft.trim();
            if (!v) return;
            setPlayerName(v);
            setName(v);
            unlockAudio();
          }}
          style={{ display: "flex", gap: 10 }}
        >
          <input className="field" autoFocus maxLength={18} value={nameDraft} placeholder="Your name" onChange={(e) => setNameDraft(e.target.value)} />
          <button className="btn btn-primary" type="submit" disabled={!nameDraft.trim()}>Sit down</button>
        </form>
      </Centered>
    );
  }
  if (!state || !view) {
    return (
      <Centered>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }}
          style={{ width: 34, height: 34, borderRadius: 9, border: "2px solid var(--brass)", borderTopColor: "transparent", margin: "0 auto 16px" }}
        />
        <p style={{ color: "var(--text-mute)" }}>Unfolding the board…</p>
      </Centered>
    );
  }

  const use3d = webgl && !prefs.flat;
  const mySeat = state.yourSeat != null ? state.seats[state.yourSeat] : null;
  const farSeats = state.seats.filter((s) => !s.you);
  const openSeats = state.seats.filter((s) => !s.taken).length;
  const winner = finished ? state.ranking[0] ?? null : null;
  const shown = value ?? die.value;

  const dockMode: DockMode = !myColor || !playing
    ? { kind: "watch" }
    : !myTurn
      ? { kind: "wait", who: state.seats[view.turn]?.name ?? "" }
      : state.awaitingMove && state.dice != null
        ? {
            kind: "choose",
            thrown: state.dice,
            value: state.dice + nudge,
            nudge,
            fate: myFate,
            canDown: royale && state.dice + nudge - 1 >= 1 && Math.abs(nudge - 1) <= myFate,
            canUp: royale && state.dice + nudge + 1 <= 6 && Math.abs(nudge + 1) <= myFate,
            stuck,
            busy: pending !== null,
          }
        : { kind: "throw", busy: pending !== null };

  const board = {
    mode: state.mode,
    players,
    view,
    cue,
    cinematic: prefs.film,
    seat: myColor,
    activeColor: playing ? turnColor : null,
    pickable,
    selected,
    markers,
    onPickToken: pickToken,
    onPickMarker: play,
    onHoverToken: setHovered,
  };

  return (
    <div className="stage" data-grade={grade ?? undefined}>
      <div className="stage-canvas">
        {use3d ? (
          <SceneBoundary onFail={() => setWebgl(false)}>
            <Scene
              {...board}
              onMiss={() => setSelected(null)}
              die={{ owner: die.owner ?? (pending === "roll" ? myColor : null), value: shown, throwSeq: die.throwSeq, charging: pending === "roll" }}
              skies={skies}
              winner={winner}
              cameraReset={cameraReset}
              lowQuality={narrow}
            />
          </SceneBoundary>
        ) : (
          <div className="stage-flat">
            <div><FlatBoard {...board} /></div>
          </div>
        )}
      </div>

      <div className="hud">
        <header className="hud-top">
          <div className="hud-brand">
            <h1 className="display">Ludo Royale</h1>
            <span className="eyebrow">{royale ? "the court" : "classic"}</span>
            <span className="hud-code">{code}</span>
          </div>
          <button className="hud-btn" onClick={copy}>{copied ? "Copied ✓" : <>Invite<span className="long"> link</span></>}</button>
          <button className="hud-btn" data-on={panel === "court"} onClick={() => setPanel(panel === "court" ? null : "court")}>
            {royale ? "Court" : "Rules"}
          </button>
          <button
            className="hud-btn"
            data-on={chatOpen}
            onClick={() => {
              setChatOpen(!chatOpen);
              setUnread(0);
              setBubbles({});
            }}
          >
            Chat{unread > 0 && <span className="hud-badge">{unread}</span>}
          </button>
          <button className="hud-btn" data-on={panel === "settings"} onClick={() => setPanel(panel === "settings" ? null : "settings")} aria-label="Settings">
            ⚙
          </button>
          <span className="chip" title={status} style={{ borderColor: status === "live" ? "rgba(46,158,123,.5)" : "rgba(201,162,39,.28)", background: "rgba(10,8,6,.7)" }}>
            <span className="presence" data-on={status === "live"} />
            {status === "live" ? "live" : status === "hidden" ? "paused" : "…"}
          </span>
        </header>

        <div className="plates-far">
          {farSeats.map((seat) => (
            <Plate
              key={seat.color}
              seat={seat}
              view={view}
              mode={state.mode}
              active={playing && turnColor === seat.color}
              now={now}
              wagerSealed={state.wagerSet[seat.color]}
              rank={state.ranking.indexOf(seat.color)}
              floaters={floaters.filter((f) => f.color === seat.color)}
              bubble={bubbles[seat.color] ?? null}
              compact={narrow}
            />
          ))}
        </div>

        <div className="hud-bottom">
          {mySeat && (
            <div className="plate-near">
              <Plate
                seat={mySeat}
                view={view}
                mode={state.mode}
                active={playing && turnColor === mySeat.color}
                now={now}
                wagerSealed={state.wagerSet[mySeat.color]}
                rank={state.ranking.indexOf(mySeat.color)}
                floaters={floaters.filter((f) => f.color === mySeat.color)}
                bubble={null}
                compact={narrow}
                onWager={() => setPanel("wager")}
              />
            </div>
          )}
          <Dock
            mode={dockMode}
            hint={hint}
            shown={shown}
            royale={royale}
            canReact={Boolean(myColor) && state.status !== "lobby"}
            onThrow={throwDie}
            onNudge={nudgeBy}
            onPass={() => void send({ type: "pass" })}
            onReact={(emoji) => void send({ type: "react", emoji })}
          />
        </div>

        {state.status === "lobby" && (
          <motion.div className="panel table-card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
            <p className="eyebrow" style={{ marginBottom: 6 }}>Invite code</p>
            <div className="code-display">{code}</div>
            <p style={{ fontSize: 13.5, color: "var(--text-mute)", margin: "10px 0 16px" }}>
              Waiting for {openSeats} more player{openSeats === 1 ? "" : "s"}. Send the link — the game starts the moment they sit down.
            </p>
            <button className="btn btn-primary" onClick={copy} style={{ width: "100%" }}>{copied ? "Link copied ✓" : "Copy invite link"}</button>
            {mySeat && (
              <button className="btn btn-ghost" onClick={() => setPanel("wager")} style={{ width: "100%", marginTop: 8 }}>
                {state.wagerSet[mySeat.color] ? "Your wager is sealed ✉ — change it" : "Seal a wager while you wait"}
              </button>
            )}
          </motion.div>
        )}

        <AnimatePresence>
          {chatOpen && (
            <motion.div key="chat" className="chat-drawer" initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 18 }}>
              <Chat state={state} onSend={(text) => void send({ type: "chat", text })} onClose={() => setChatOpen(false)} />
            </motion.div>
          )}
          {panel === "court" && <CourtPanel key="court" royale={royale} onClose={() => setPanel(null)} />}
          {panel === "wager" && (
            <WagerSheet
              key="wager"
              current={state.yourWager}
              locked={state.wagerLocked}
              onSave={(text) => void send({ type: "wager", text })}
              onClose={() => setPanel(null)}
            />
          )}
          {panel === "settings" && (
            <SettingsMenu
              key="settings"
              prefs={prefs}
              canFlat={webgl}
              onChange={changePrefs}
              onResetCamera={() => setCameraReset((n) => n + 1)}
              onClose={() => setPanel(null)}
            />
          )}
        </AnimatePresence>

        <Banner spec={banner} />

        <AnimatePresence>
          {(toast || error) && (
            <motion.div
              className="toast"
              initial={{ opacity: 0, y: 20, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.96 }}
              style={error ? { borderColor: "rgba(214,65,47,.55)" } : undefined}
              onClick={() => {
                setToast(null);
                setError(null);
              }}
            >
              {error ?? toast}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showReport && winner && (
            <Report state={state} myColor={myColor} busy={pending === "rematch"} onRematch={() => void send({ type: "rematch" })} onExit={() => router.push("/")} />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="lobby-shell">
      <motion.div className="panel lobby-card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} style={{ padding: "34px 30px", textAlign: "center" }}>
        {children}
      </motion.div>
    </div>
  );
}
