"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useRoom } from "@/lib/useRoom";
import { getPlayerName, rememberRoom, setPlayerName } from "@/lib/player";
import { loadMutePreference, setMuted, sfx, unlockAudio } from "@/lib/sound";
import { COLOR_LABEL, PALETTE } from "@/lib/ludo/render";
import { Board } from "./Board";
import { Dice } from "./Dice";
import { PlayerCard } from "./PlayerCard";
import { Chat } from "./Chat";
import { WinOverlay } from "./WinOverlay";

export function Game({ code }: { code: string }) {
  const router = useRouter();
  const { state, status, error, pending, send, join, setError } = useRoom(code);
  const [name, setName] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [muted, setMutedState] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const joinedRef = useRef(false);
  const lastEventRef = useRef(-1);
  const wasMyTurn = useRef(false);

  useEffect(() => {
    const stored = getPlayerName();
    setName(stored);
    setNameDraft(stored);
    setMutedState(loadMutePreference());
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  /* ---- take a seat --------------------------------------------------- */
  useEffect(() => {
    if (!state || joinedRef.current || !name) return;
    if (state.yourSeat != null) {
      joinedRef.current = true;
      rememberRoom(code);
      return;
    }
    if (state.seats.every((s) => s.taken)) return; // full — watch instead
    joinedRef.current = true;
    rememberRoom(code);
    void join(name);
  }, [state, name, join, code]);

  /* ---- reactions to server events ------------------------------------ */
  const ev = state?.lastEvent ?? null;
  useEffect(() => {
    if (!ev || ev.nonce === lastEventRef.current) return;
    const first = lastEventRef.current === -1;
    lastEventRef.current = ev.nonce;
    if (first) return;

    if (ev.type === "join") {
      sfx("join");
      setToast(`${ev.name} sat down.`);
    } else if (ev.type === "start") {
      setToast("Everyone is here. Vermilion opens.");
    } else if (ev.type === "roll" && ev.blocked) {
      const t = setTimeout(() => {
        sfx("blocked");
        setToast(
          ev.reason === "three-sixes"
            ? "Three sixes in a row — turn forfeited."
            : `Nothing to move with a ${ev.value}. Turn passes.`,
        );
      }, 1000);
      return () => clearTimeout(t);
    } else if (ev.type === "rematch") {
      setToast("New game. Board reset.");
    }
  }, [ev]);

  const myColor = state?.yourColor ?? null;
  const myTurn = Boolean(
    state && state.status === "playing" && myColor && state.seats[state.turn]?.color === myColor,
  );

  useEffect(() => {
    if (myTurn && !wasMyTurn.current) {
      sfx("turn");
      if (document.hidden) document.title = "▶ Your turn — Ludo Royale";
    }
    if (!myTurn) document.title = "Ludo Royale";
    wasMyTurn.current = myTurn;
  }, [myTurn]);

  useEffect(() => {
    const restore = () => {
      if (!document.hidden) document.title = "Ludo Royale";
    };
    document.addEventListener("visibilitychange", restore);
    return () => document.removeEventListener("visibilitychange", restore);
  }, []);

  const finished = state?.status === "finished";
  const winner = finished ? state?.ranking[0] ?? null : null;
  useEffect(() => {
    if (!winner) return;
    sfx(winner === myColor ? "win" : "lose");
  }, [winner, myColor]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3400);
    return () => clearTimeout(t);
  }, [toast]);

  /* ---- actions -------------------------------------------------------- */
  const roll = useCallback(() => void send({ type: "roll" }), [send]);
  const pick = useCallback((token: number) => void send({ type: "move", token }), [send]);
  const say = useCallback((text: string) => void send({ type: "chat", text }), [send]);

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

  const toggleSound = () => {
    unlockAudio();
    const next = !muted;
    setMutedState(next);
    setMuted(next);
    if (!next) sfx("turn");
  };

  const hint = useMemo(() => {
    if (!state) return "Setting the table…";
    if (state.status === "lobby") return "Share the code above. The game starts the moment they arrive.";
    if (state.status === "finished") return "Game over.";
    const activeSeat = state.seats[state.turn];
    if (!myColor) return `Watching. ${activeSeat?.name ?? "Someone"} is thinking.`;
    if (!myTurn) return `${activeSeat?.name ?? "Opponent"} is playing…`;
    if (state.awaitingMove) return `You rolled ${state.dice}. Pick a glowing pawn.`;
    return "Your turn. Throw it.";
  }, [state, myColor, myTurn]);

  /* ---- gates ---------------------------------------------------------- */
  if (status === "gone") {
    return (
      <Centered>
        <h2 className="display" style={{ fontSize: 26, marginBottom: 8 }}>That table is gone</h2>
        <p style={{ color: "var(--text-mute)", marginBottom: 20 }}>
          {error ?? "The room expired or never existed."}
        </p>
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
          <input
            className="field"
            autoFocus
            maxLength={18}
            value={nameDraft}
            placeholder="Your name"
            onChange={(e) => setNameDraft(e.target.value)}
          />
          <button className="btn btn-primary" type="submit" disabled={!nameDraft.trim()}>Sit down</button>
        </form>
      </Centered>
    );
  }

  if (!state) {
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

  const seatFull = state.yourSeat == null && state.seats.every((s) => s.taken);

  return (
    <div className="game-shell">
      <header className="game-head">
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginRight: "auto" }}>
          <h1 className="display" style={{ fontSize: 22, letterSpacing: "-.02em" }}>Ludo Royale</h1>
          <span className="eyebrow">room</span>
          <span className="mono" style={{ fontSize: 16, color: "var(--brass-hi)", letterSpacing: ".18em" }}>{code}</span>
        </div>

        <button className="btn btn-ghost" onClick={copy} style={{ padding: "8px 14px", fontSize: 13 }}>
          {copied ? "Link copied ✓" : "Copy invite link"}
        </button>
        <button className="btn btn-ghost" onClick={toggleSound} style={{ padding: "8px 12px", fontSize: 13 }} aria-label="Toggle sound">
          {muted ? "🔇" : "🔊"}
        </button>
        <span
          className="chip"
          title={status}
          style={{ borderColor: status === "live" ? "rgba(46,158,123,.5)" : "rgba(201,162,39,.28)" }}
        >
          <span className="presence" data-on={status === "live"} />
          {status === "live" ? "live" : status === "hidden" ? "paused" : "reconnecting"}
        </span>
      </header>

      {seatFull && (
        <div className="panel panel-tight" style={{ marginBottom: 14, borderColor: "rgba(214,65,47,.4)" }}>
          Both seats are taken, so you are watching this one.
        </div>
      )}

      <div className="game-grid">
        <div className="game-side game-side-left">
          {state.status === "lobby" && (
            <div className="panel" style={{ padding: "18px 18px 20px", textAlign: "center" }}>
              <p className="eyebrow" style={{ marginBottom: 6 }}>Invite code</p>
              <div className="code-display">{code}</div>
              <p style={{ fontSize: 13, color: "var(--text-mute)", margin: "10px 0 14px" }}>
                Waiting for {state.seats.filter((s) => !s.taken).length} more player
                {state.seats.filter((s) => !s.taken).length === 1 ? "" : "s"}.
              </p>
              <button className="btn btn-primary" onClick={copy} style={{ width: "100%" }}>
                {copied ? "Link copied ✓" : "Copy invite link"}
              </button>
            </div>
          )}

          <div className="panel" style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {state.seats.map((_, i) => (
              <PlayerCard key={i} state={state} seatIndex={i} />
            ))}
          </div>

          <div className="panel panel-dice" style={{ padding: "18px 16px 16px" }}>
            <Dice
              value={state.dice}
              nonce={state.diceNonce ?? 0}
              shaking={pending === "roll"}
              onRoll={roll}
              canRoll={myTurn && !state.awaitingMove && pending === null && state.status === "playing"}
              hint={hint}
            />
          </div>
        </div>

        <div className="game-board-col">
          <Board state={state} myColor={myColor} onPick={pick} />
        </div>

        <div className="game-side game-side-right">
          <div className="panel panel-tight">
            <p className="eyebrow" style={{ marginBottom: 8 }}>House rules</p>
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12.5, color: "var(--text-mute)", lineHeight: 1.75 }}>
              <li>A six frees a pawn and buys another throw.</li>
              <li>Land on an opponent to send them home — and throw again.</li>
              <li>Starred squares and entry squares are sanctuary.</li>
              <li>Three sixes in a row forfeits the turn.</li>
              <li>An exact count is needed to come home.</li>
            </ul>
          </div>
          <Chat state={state} onSend={say} />
        </div>
      </div>

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
        {finished && winner && (
          <WinOverlay
            winner={winner}
            winnerName={state.seats.find((s) => s.color === winner)?.name ?? COLOR_LABEL[winner]}
            youWon={winner === myColor}
            busy={pending === "rematch"}
            onRematch={() => void send({ type: "rematch" })}
            onExit={() => router.push("/")}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="lobby-shell">
      <motion.div
        className="panel lobby-card"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ padding: "34px 30px", textAlign: "center" }}
      >
        {children}
      </motion.div>
    </div>
  );
}
