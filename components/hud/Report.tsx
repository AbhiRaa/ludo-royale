"use client";

import { useMemo } from "react";
import { motion } from "motion/react";
import { ClientState, Color, ROLES } from "@/lib/ludo/types";
import { ROLE_INFO } from "@/lib/ludo/court";
import { BRASS, BRASS_HI, PALETTE } from "@/lib/ludo/render";

export function Report({
  state,
  myColor,
  busy,
  onRematch,
  onExit,
}: {
  state: ClientState;
  myColor: Color | null;
  busy: boolean;
  onRematch: () => void;
  onExit: () => void;
}) {
  const winner = state.ranking[0];
  const pal = PALETTE[winner];
  const nameOf = (c: Color) => state.seats.find((s) => s.color === c)?.name ?? c;
  const players = state.seats.filter((s) => s.taken).map((s) => s.color);
  const royale = state.mode === "royale";

  const confetti = useMemo(
    () =>
      Array.from({ length: 110 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 2.4,
        dur: 2.8 + Math.random() * 2.4,
        size: 5 + Math.random() * 8,
        drift: (Math.random() - 0.5) * 200,
        spin: 360 + Math.random() * 900,
        color: [pal.base, pal.light, BRASS, BRASS_HI, "#F7F1E4"][i % 5],
        square: i % 3 !== 0,
      })),
    [pal],
  );

  const won = state.stakes?.find((s) => s.color === winner) ?? null;
  const others = state.stakes?.filter((s) => s.color !== winner) ?? [];
  const debtors = players.filter((c) => c !== winner).map(nameOf).join(" and ");

  const rows: { label: string; pick: (c: Color) => number; show: boolean }[] = [
    { label: "Throws", pick: (c) => state.stats[c].rolls, show: true },
    { label: "Sixes", pick: (c) => state.stats[c].sixes, show: true },
    { label: "Captures", pick: (c) => state.stats[c].captures, show: true },
    { label: "Shield blocks", pick: (c) => state.stats[c].blocks, show: royale },
    { label: "Fate spent", pick: (c) => state.stats[c].fateSpent, show: royale },
    { label: "Squares run", pick: (c) => state.stats[c].squares, show: true },
  ];

  // the single deadliest pawn of the game
  let mvp: { color: Color; token: number; kills: number } | null = null;
  for (const c of players) {
    state.stats[c].byToken.forEach((kills, token) => {
      if (kills > (mvp?.kills ?? 0)) mvp = { color: c, token, kills };
    });
  }
  const best = mvp as { color: Color; token: number; kills: number } | null;
  const duel = players.length === 2;

  return (
    <motion.div className="report-veil" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
        {confetti.map((c) => (
          <motion.span
            key={c.id}
            initial={{ y: -60, opacity: 0, rotate: 0 }}
            animate={{ y: "108vh", x: c.drift, opacity: [0, 1, 1, 0.9], rotate: c.spin }}
            transition={{ duration: c.dur, delay: c.delay, repeat: Infinity, ease: "linear" }}
            style={{ position: "absolute", top: 0, left: `${c.left}%`, width: c.size, height: c.size * (c.square ? 1.5 : 1), borderRadius: c.square ? 1 : "50%", background: c.color }}
          />
        ))}
      </div>

      <motion.div
        className="panel report"
        initial={{ scale: 0.86, y: 26, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 210, damping: 21, delay: 0.1 }}
      >
        <motion.div
          className="report-crest"
          animate={{ rotate: [0, -6, 6, -3, 0], scale: [1, 1.07, 1] }}
          transition={{ duration: 1.4, repeat: Infinity, repeatDelay: 2.4 }}
          style={{ background: `linear-gradient(155deg, ${pal.light}, ${pal.base} 50%, ${pal.dark})`, boxShadow: `0 0 46px -6px ${pal.base}, inset 0 2px 0 rgba(255,255,255,.4)` }}
        >
          👑
        </motion.div>
        <p className="eyebrow" style={{ marginBottom: 8 }}>{winner === myColor ? "You take the table" : "The table is taken"}</p>
        <h2 className="display" style={{ fontSize: "clamp(28px, 5vw, 38px)", lineHeight: 1.08 }}>{nameOf(winner)} wins</h2>

        {won && (
          <motion.div className="report-stake" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }}>
            <span className="eyebrow" style={{ color: "var(--brass-hi)" }}>The seal is broken · {debtors} owe{debtors.includes(" and ") ? "" : "s"} {nameOf(winner)}</span>
            <q>{won.text}</q>
          </motion.div>
        )}
        {others.map((o) => (
          <p key={o.color} className="report-also">
            {nameOf(o.color)} was playing for <q>{o.text}</q>
          </p>
        ))}

        {duel ? (
          <div className="report-stats">
            <span className="who" style={{ color: PALETTE[players[0]].light, textAlign: "right" }}>{nameOf(players[0])}</span>
            <span />
            <span className="who" style={{ color: PALETTE[players[1]].light, textAlign: "left" }}>{nameOf(players[1])}</span>
            {rows.filter((r) => r.show).flatMap((r) => {
              const a = r.pick(players[0]);
              const b = r.pick(players[1]);
              return [
                <span key={`${r.label}a`} className="n" data-lead={a > b} style={{ textAlign: "right" }}>{a}</span>,
                <span key={`${r.label}k`} className="k">{r.label}</span>,
                <span key={`${r.label}b`} className="n" data-lead={b > a} style={{ textAlign: "left" }}>{b}</span>,
              ];
            })}
          </div>
        ) : (
          <p className="report-mvp">Finishing order: {state.ranking.map(nameOf).join(" · ")}</p>
        )}

        {best && (
          <p className="report-mvp">
            Deadliest piece: <strong style={{ color: PALETTE[best.color].light }}>
              {nameOf(best.color)}’s {royale ? ROLE_INFO[ROLES[best.token]].name : `pawn ${best.token + 1}`}
            </strong>{" "}
            — {best.kills} capture{best.kills === 1 ? "" : "s"}
          </p>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginTop: 22 }}>
          {myColor && (
            <button className="btn btn-primary" onClick={onRematch} disabled={busy}>
              {busy ? "Setting up…" : "Play again"}
            </button>
          )}
          <button className="btn btn-ghost" onClick={onExit}>Leave table</button>
        </div>
      </motion.div>
    </motion.div>
  );
}
