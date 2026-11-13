"use client";

import { AnimatePresence, motion } from "motion/react";
import { Color, HOME, Mode, PublicSeat, Snap, YARD, FATE_MAX } from "@/lib/ludo/types";
import { roleOf } from "@/lib/ludo/rules";
import { PALETTE } from "@/lib/ludo/render";
import { clockLabel, localHour, placeName } from "@/lib/zone";
import { PHASE_GLYPH, skyAt } from "@/lib/sky";
import { FateGem, RoleGlyph } from "./glyphs";

export type Floater = { id: number; color: Color; emoji: string };

export function Plate({
  seat,
  view,
  mode,
  active,
  now,
  wagerSealed,
  rank,
  floaters,
  bubble,
  compact,
  onWager,
}: {
  seat: PublicSeat;
  view: Snap;
  mode: Mode;
  active: boolean;
  /** shared ticking clock, so every plate re-renders on the same minute */
  now: number;
  wagerSealed: boolean;
  rank: number;
  floaters: Floater[];
  bubble: string | null;
  compact: boolean;
  /** present only on your own plate while wagers are still open */
  onWager?: () => void;
}) {
  const pal = PALETTE[seat.color];
  const tokens = view.tokens[seat.color];
  const sky = skyAt(localHour(seat.zone, now));
  const fate = view.fate[seat.color];

  return (
    <motion.div className="plate" data-active={active} data-compact={compact} style={{ ["--seat" as string]: pal.base, ["--seat-hi" as string]: pal.light }} layout>
      <div className="plate-swatch" />
      <div className="plate-main">
        <div className="plate-name">
          <span className="plate-name-text" style={{ color: seat.taken ? undefined : "var(--text-faint)" }}>
            {seat.name ?? "Waiting…"}
          </span>
          {seat.you && <span className="plate-you">you</span>}
          {seat.taken && <span className="presence" data-on={seat.online} title={seat.online ? "Here" : "Away"} />}
        </div>
        <div className="plate-clock" title={seat.zone ? `${seat.zone.tz}` : undefined}>
          {seat.zone ? (
            <>
              <span className="plate-phase" data-day={sky.isDay}>{PHASE_GLYPH[sky.phase]}</span>
              <span className="mono">{clockLabel(seat.zone, now)}</span>
              <span className="plate-place">{placeName(seat.zone)}</span>
            </>
          ) : (
            <span className="plate-place">{seat.taken ? "somewhere" : "seat open"}</span>
          )}
        </div>
      </div>

      <div className="plate-side">
        {mode === "royale" && (
          <div className="plate-fate" title={`Fate ${fate} of ${FATE_MAX}`}>
            {Array.from({ length: FATE_MAX }, (_, i) => (
              <motion.span key={i} animate={{ scale: i < fate ? [1.5, 1] : 1 }} transition={{ duration: 0.35 }}>
                <FateGem on={i < fate} />
              </motion.span>
            ))}
          </div>
        )}
        <div className="plate-roster">
          {tokens.map((pos, i) => {
            const role = roleOf(mode, i);
            const where = pos === HOME ? "home" : pos === YARD ? "yard" : "out";
            return (
              <span
                key={i}
                className="plate-pawn"
                data-where={where}
                data-shield={role === "guard" && view.shield[seat.color] && where !== "home"}
                title={`${role ?? "pawn"} — ${where === "home" ? "home" : where === "yard" ? "in the yard" : "on the board"}`}
              >
                <RoleGlyph role={role} size={compact ? 11 : 13} />
              </span>
            );
          })}
        </div>
      </div>

      {rank >= 0 && <span className="plate-rank">{["1st", "2nd", "3rd", "4th"][rank]}</span>}
      {onWager ? (
        <button className="plate-seal" data-set={wagerSealed} onClick={onWager} title={wagerSealed ? "Your wager is sealed — tap to change it" : "Seal a wager"}>
          {wagerSealed ? "✉" : "+ wager"}
        </button>
      ) : (
        wagerSealed && <span className="plate-seal" data-set title="A wager is sealed">✉</span>
      )}

      <AnimatePresence>
        {bubble && (
          <motion.div
            key={bubble}
            className="plate-bubble"
            initial={{ opacity: 0, y: 6, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4 }}
          >
            {bubble}
          </motion.div>
        )}
      </AnimatePresence>
      {floaters.map((f) => (
        <motion.span
          key={f.id}
          className="plate-floater"
          initial={{ opacity: 0, y: 0, scale: 0.4, x: (f.id % 5) * 16 - 32 }}
          animate={{ opacity: [0, 1, 1, 0], y: -92, scale: [0.4, 1.5, 1.25, 1.1] }}
          transition={{ duration: 1.9, ease: "easeOut" }}
        >
          {f.emoji}
        </motion.span>
      ))}
    </motion.div>
  );
}
