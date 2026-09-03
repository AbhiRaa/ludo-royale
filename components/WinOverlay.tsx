"use client";

import { useMemo } from "react";
import { motion } from "motion/react";
import { Color } from "@/lib/ludo/types";
import { BRASS, BRASS_HI, COLOR_LABEL, PALETTE } from "@/lib/ludo/render";

export function WinOverlay({
  winner,
  winnerName,
  youWon,
  onRematch,
  onExit,
  busy,
}: {
  winner: Color;
  winnerName: string;
  youWon: boolean;
  onRematch: () => void;
  onExit: () => void;
  busy: boolean;
}) {
  const pal = PALETTE[winner];
  const confetti = useMemo(
    () =>
      Array.from({ length: 130 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 2.4,
        dur: 2.6 + Math.random() * 2.4,
        size: 5 + Math.random() * 8,
        drift: (Math.random() - 0.5) * 200,
        spin: 360 + Math.random() * 900,
        color: [pal.base, pal.light, BRASS, BRASS_HI, "#F7F1E4"][i % 5],
        square: i % 3 !== 0,
      })),
    [pal],
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        position: "fixed", inset: 0, zIndex: 150,
        display: "grid", placeItems: "center",
        background: "radial-gradient(60% 50% at 50% 45%, rgba(20,14,11,.86), rgba(8,6,5,.96))",
        backdropFilter: "blur(7px)",
        padding: 24,
      }}
    >
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
        {confetti.map((c) => (
          <motion.span
            key={c.id}
            initial={{ y: -60, opacity: 0, rotate: 0 }}
            animate={{ y: "108vh", x: c.drift, opacity: [0, 1, 1, 0.9], rotate: c.spin }}
            transition={{ duration: c.dur, delay: c.delay, repeat: Infinity, ease: "linear" }}
            style={{
              position: "absolute", top: 0, left: `${c.left}%`,
              width: c.size, height: c.size * (c.square ? 1.5 : 1),
              borderRadius: c.square ? 1 : "50%",
              background: c.color,
              boxShadow: `0 0 8px ${c.color}88`,
            }}
          />
        ))}
      </div>

      <motion.div
        className="panel"
        initial={{ scale: 0.82, y: 28, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 20, delay: 0.12 }}
        style={{ padding: "34px 34px 28px", textAlign: "center", maxWidth: 440, position: "relative" }}
      >
        <motion.div
          animate={{ rotate: [0, -6, 6, -3, 0], scale: [1, 1.07, 1] }}
          transition={{ duration: 1.4, repeat: Infinity, repeatDelay: 2.2 }}
          style={{
            width: 74, height: 74, margin: "0 auto 18px", borderRadius: 20,
            background: `linear-gradient(155deg, ${pal.light}, ${pal.base} 50%, ${pal.dark})`,
            boxShadow: `0 0 46px -6px ${pal.base}, inset 0 2px 0 rgba(255,255,255,.4)`,
            display: "grid", placeItems: "center",
            fontSize: 36,
          }}
        >
          👑
        </motion.div>

        <p className="eyebrow" style={{ marginBottom: 8 }}>
          {youWon ? "You take the table" : "Game over"}
        </p>
        <h2 className="display" style={{ fontSize: 34, lineHeight: 1.1, marginBottom: 6 }}>
          {winnerName} wins
        </h2>
        <p style={{ color: "var(--text-mute)", fontSize: 14, margin: "0 0 24px" }}>
          All four {COLOR_LABEL[winner].toLowerCase()} pawns are home.
        </p>

        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <button className="btn btn-primary" onClick={onRematch} disabled={busy}>
            {busy ? "Setting up…" : "Play again"}
          </button>
          <button className="btn btn-ghost" onClick={onExit}>
            Leave table
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
