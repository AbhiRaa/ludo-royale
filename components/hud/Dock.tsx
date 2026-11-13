"use client";

import { motion } from "motion/react";
import { REACTIONS } from "@/lib/ludo/types";
import { DieFace, FateGem } from "./glyphs";

export type DockMode =
  | { kind: "watch" }
  | { kind: "wait"; who: string }
  | { kind: "throw"; busy: boolean }
  | {
      kind: "choose";
      /** the die as thrown */
      thrown: number;
      /** the value in play after any pending nudge */
      value: number;
      nudge: number;
      fate: number;
      canDown: boolean;
      canUp: boolean;
      /** nothing moves at the thrown value */
      stuck: boolean;
      busy: boolean;
    };

export function Dock({
  mode,
  hint,
  shown,
  royale,
  canReact,
  onThrow,
  onNudge,
  onPass,
  onReact,
}: {
  mode: DockMode;
  hint: string;
  /** what the die currently reads */
  shown: number | null;
  royale: boolean;
  canReact: boolean;
  onThrow: () => void;
  onNudge: (delta: number) => void;
  onPass: () => void;
  onReact: (emoji: string) => void;
}) {
  const choosing = mode.kind === "choose";
  return (
    <div className="dock" data-kind={mode.kind}>
      <div className="dock-row">
        <div className="dock-die">
          {choosing && royale && (
            <button className="dock-nudge" disabled={!mode.canDown || mode.busy} onClick={() => onNudge(-1)} aria-label="Spend Fate to lower the die by one">
              −
            </button>
          )}
          <motion.div key={shown ?? 0} initial={{ rotate: -14, scale: 0.86 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: "spring", stiffness: 420, damping: 16 }}>
            <DieFace value={shown} />
          </motion.div>
          {choosing && royale && (
            <button className="dock-nudge" disabled={!mode.canUp || mode.busy} onClick={() => onNudge(1)} aria-label="Spend Fate to raise the die by one">
              +
            </button>
          )}
        </div>

        <div className="dock-main">
          {mode.kind === "throw" && (
            <button className="btn btn-primary dock-cta" onClick={onThrow} disabled={mode.busy}>
              {mode.busy ? "Throwing…" : "Throw"}
            </button>
          )}
          {choosing && mode.stuck && (
            <button className="btn dock-cta" onClick={onPass} disabled={mode.busy}>
              Pass{royale ? " · +1 Fate" : ""}
            </button>
          )}
          {choosing && mode.nudge !== 0 && (
            <span className="dock-cost">
              {Array.from({ length: Math.abs(mode.nudge) }, (_, i) => <FateGem key={i} on />)}
              <span>spent on this move</span>
            </span>
          )}
          <p className="dock-hint">{hint}</p>
        </div>
      </div>

      {canReact && (
        <div className="dock-reactions">
          {REACTIONS.map((e) => (
            <button key={e} onClick={() => onReact(e)} aria-label={`React ${e}`}>
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
