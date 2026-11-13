"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { getPlayerId, getPlayerName, lastRoom as readLastRoom, setPlayerName } from "@/lib/player";
import { normaliseCode } from "@/lib/id";
import { COLORS } from "@/lib/ludo/types";
import { PALETTE } from "@/lib/ludo/render";
import { localZone } from "@/lib/zone";
import { TokenPiece } from "@/components/TokenPiece";

export default function Lobby() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [seats, setSeats] = useState(2);
  const [mode, setMode] = useState<"royale" | "classic">("royale");
  const [busy, setBusy] = useState<"create" | "solo" | "join" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRoom, setLastRoom] = useState<string | null>(null);

  useEffect(() => {
    setName(getPlayerName());
    setLastRoom(readLastRoom());
  }, []);

  const remember = () => {
    const n = name.trim() || "Player";
    setPlayerName(n);
    return n;
  };

  const create = async (solo = false) => {
    setBusy(solo ? "solo" : "create");
    setError(null);
    try {
      const res = await fetch("/api/room", {
        method: "POST",
        headers: { "content-type": "application/json", "x-ludo-player": getPlayerId() },
        body: JSON.stringify({ name: remember(), maxPlayers: seats, mode, solo, zone: localZone() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not open a table.");
      router.push(`/play/${data.code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(null);
    }
  };

  const joinRoom = (raw: string) => {
    const c = normaliseCode(raw);
    if (c.length < 4) {
      setError("That code looks too short.");
      return;
    }
    setBusy("join");
    remember();
    router.push(`/play/${c}`);
  };

  return (
    <div className="lobby-shell">
      <motion.div
        className="lobby-card"
        initial={{ opacity: 0, y: 26 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
      >
        {/* floating pawns */}
        <div style={{ display: "flex", justifyContent: "center", gap: 22, marginBottom: 26 }}>
          {COLORS.map((c, i) => (
            <motion.div
              key={c}
              initial={{ y: 24, opacity: 0, rotate: -12 }}
              animate={{ y: [0, -9, 0], opacity: 1, rotate: 0 }}
              transition={{
                y: { duration: 2.6 + i * 0.35, repeat: Infinity, ease: "easeInOut", delay: i * 0.18 },
                opacity: { duration: 0.5, delay: 0.1 + i * 0.09 },
                rotate: { duration: 0.6, delay: 0.1 + i * 0.09 },
              }}
              style={{ filter: `drop-shadow(0 10px 16px ${PALETTE[c].deep})` }}
            >
              <TokenPiece color={c} />
            </motion.div>
          ))}
        </div>

        <div style={{ textAlign: "center", marginBottom: 30 }}>
          <p className="eyebrow" style={{ marginBottom: 10 }}>Pachisi across the time zones</p>
          <h1
            className="display"
            style={{
              fontSize: "clamp(42px, 9vw, 66px)",
              lineHeight: 0.95,
              background: "linear-gradient(175deg, #FFF7E6 0%, #F3DE9B 42%, #C9A227 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Ludo Royale
          </h1>
          <p style={{ color: "var(--text-mute)", fontSize: 15, marginTop: 12, maxWidth: 400, marginInline: "auto" }}>
            One table, floating between two skies — yours and theirs, each at its own hour. Open a table and send the code.
          </p>
        </div>

        <div className="panel" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 18 }}>
          <label style={{ display: "block" }}>
            <span className="eyebrow" style={{ display: "block", marginBottom: 7 }}>Your name</span>
            <input
              className="field"
              maxLength={18}
              value={name}
              placeholder="e.g. Abhinav"
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          <div>
            <span className="eyebrow" style={{ display: "block", marginBottom: 7 }}>The game</span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {([
                ["royale", "The Court", "Four characters. Fate. A sharper game."],
                ["classic", "Classic", "The rules you grew up with."],
              ] as const).map(([id, title, note]) => (
                <button
                  key={id}
                  className="btn"
                  onClick={() => setMode(id)}
                  aria-pressed={mode === id}
                  style={{
                    textAlign: "left",
                    padding: "11px 13px",
                    borderColor: mode === id ? "rgba(201,162,39,.85)" : undefined,
                    background: mode === id ? "linear-gradient(180deg, rgba(201,162,39,.34), rgba(201,162,39,.12))" : undefined,
                  }}
                >
                  <span style={{ display: "block", fontFamily: "var(--font-display)", fontSize: 17, color: mode === id ? "var(--bone)" : "var(--text-mute)" }}>{title}</span>
                  <span style={{ display: "block", fontSize: 11.5, fontWeight: 400, color: "var(--text-faint)", marginTop: 3, lineHeight: 1.35 }}>{note}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="eyebrow" style={{ display: "block", marginBottom: 7 }}>Players</span>
            <div style={{ display: "flex", gap: 8 }}>
              {[2, 3, 4].map((n) => (
                <button
                  key={n}
                  className="btn"
                  onClick={() => setSeats(n)}
                  style={{
                    flex: 1,
                    borderColor: seats === n ? "rgba(201,162,39,.8)" : undefined,
                    background: seats === n ? "linear-gradient(180deg, rgba(201,162,39,.34), rgba(201,162,39,.14))" : undefined,
                    color: seats === n ? "var(--bone)" : "var(--text-mute)",
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <button className="btn btn-primary" onClick={() => create(false)} disabled={busy !== null} style={{ padding: "14px 20px", fontSize: 15 }}>
            {busy === "create" ? "Laying out the board…" : "Open a new table"}
          </button>
          <button className="btn btn-ghost" onClick={() => create(true)} disabled={busy !== null} style={{ marginTop: -8, fontSize: 13 }}>
            {busy === "solo" ? "The House is sitting down…" : "Nobody around? Play the House"}
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ flex: 1, height: 1, background: "rgba(201,162,39,.2)" }} />
            <span className="eyebrow">or join one</span>
            <span style={{ flex: 1, height: 1, background: "rgba(201,162,39,.2)" }} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              joinRoom(code);
            }}
            style={{ display: "flex", flexDirection: "column", gap: 10 }}
          >
            <input
              className="field field-code"
              maxLength={8}
              value={code}
              placeholder="CODE"
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
            <button className="btn" type="submit" disabled={busy !== null || code.trim().length < 4}>
              {busy === "join" ? "Joining…" : "Join the table"}
            </button>
          </form>

          {lastRoom && (
            <button
              className="btn btn-ghost"
              onClick={() => joinRoom(lastRoom)}
              style={{ fontSize: 12.5 }}
            >
              Rejoin your last table · <span className="mono">{lastRoom}</span>
            </button>
          )}

          {error && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              style={{ color: "var(--danger)", fontSize: 13, margin: 0, textAlign: "center" }}
            >
              {error}
            </motion.p>
          )}
        </div>

        <p style={{ textAlign: "center", fontSize: 11.5, color: "var(--text-faint)", marginTop: 20 }}>
          Dice are thrown on the server, so nobody can nudge their luck.
        </p>
      </motion.div>
    </div>
  );
}
