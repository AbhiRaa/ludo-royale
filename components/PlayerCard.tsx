"use client";

import { motion } from "motion/react";
import { ClientState, HOME, YARD } from "@/lib/ludo/types";
import { COLOR_LABEL, PALETTE } from "@/lib/ludo/render";

export function PlayerCard({
  state,
  seatIndex,
}: {
  state: ClientState;
  seatIndex: number;
}) {
  const seat = state.seats[seatIndex];
  const swatch = PALETTE[seat.color];
  const tokens = state.tokens[seat.color];
  const home = tokens.filter((p) => p === HOME).length;
  const active = state.status === "playing" && state.turn === seatIndex;
  const rank = state.ranking.indexOf(seat.color);

  return (
    <motion.div
      className="pcard"
      data-active={active}
      style={{ ["--seat" as string]: swatch.base }}
      layout
    >
      <div className="pcard-swatch" />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span
            style={{
              fontWeight: 600, fontSize: 15,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              color: seat.taken ? "var(--text)" : "var(--text-faint)",
            }}
          >
            {seat.name ?? "Waiting…"}
          </span>
          {seat.you && <span className="chip" style={{ padding: "2px 6px", fontSize: 9 }}>you</span>}
          <span className="presence" data-on={seat.online} title={seat.online ? "Online" : "Away"} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5 }}>
          <span className="eyebrow" style={{ color: swatch.base, letterSpacing: ".16em" }}>
            {COLOR_LABEL[seat.color]}
          </span>
          <div style={{ display: "flex", gap: 3 }}>
            {tokens.map((p, i) => (
              <motion.span
                key={i}
                layout
                animate={{
                  backgroundColor: p === HOME ? swatch.base : p === YARD ? "rgba(255,255,255,.10)" : swatch.dark,
                  scale: p === HOME ? 1.1 : 1,
                }}
                style={{
                  width: 7, height: 7, borderRadius: 2,
                  boxShadow: p === HOME ? `0 0 8px ${swatch.base}` : "none",
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {rank >= 0 ? (
        <span className="chip mono" style={{ borderColor: `${swatch.base}66`, color: swatch.light }}>
          {rank === 0 ? "1st" : rank === 1 ? "2nd" : rank === 2 ? "3rd" : "4th"}
        </span>
      ) : (
        <span className="mono" style={{ fontSize: 11, color: "var(--text-faint)" }}>
          {home}/4
        </span>
      )}

      {active && (
        <motion.div
          layoutId="turn-marker"
          style={{
            position: "absolute", left: -1, top: 10, bottom: 10, width: 3,
            borderRadius: 99, background: swatch.base, boxShadow: `0 0 14px ${swatch.base}`,
          }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
        />
      )}
    </motion.div>
  );
}
