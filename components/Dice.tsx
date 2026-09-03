"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BRASS_HI } from "@/lib/ludo/render";
import { sfx } from "@/lib/sound";

const FACE_ROT: Record<number, { rx: number; ry: number }> = {
  1: { rx: 0, ry: 0 },
  2: { rx: -90, ry: 0 },
  3: { rx: 0, ry: -90 },
  4: { rx: 0, ry: 90 },
  5: { rx: 90, ry: 0 },
  6: { rx: 0, ry: 180 },
};

const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

const FACE_TRANSFORM: Record<number, string> = {
  1: "translateZ(37px)",
  6: "rotateY(180deg) translateZ(37px)",
  3: "rotateY(90deg) translateZ(37px)",
  4: "rotateY(-90deg) translateZ(37px)",
  2: "rotateX(90deg) translateZ(37px)",
  5: "rotateX(-90deg) translateZ(37px)",
};

function Face({ value }: { value: number }) {
  const on = new Set(PIPS[value]);
  return (
    <div className="dice-face" style={{ transform: FACE_TRANSFORM[value] }}>
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i}>{on.has(i) ? <i className="pip" /> : null}</span>
      ))}
    </div>
  );
}

export function Dice({
  value,
  nonce,
  shaking,
  onRoll,
  canRoll,
  hint,
}: {
  value: number | null;
  nonce: number;
  shaking: boolean;
  onRoll: () => void;
  canRoll: boolean;
  hint: string;
}) {
  const rot = useRef({ rx: -22, ry: 28 });
  const [pose, setPose] = useState(rot.current);
  const [landing, setLanding] = useState(false);
  const [sixPop, setSixPop] = useState(0);
  const seen = useRef(-1);

  // Resolve the throw whenever a fresh roll arrives from the server.
  useEffect(() => {
    if (value == null || nonce === seen.current) return;
    const first = seen.current === -1;
    seen.current = nonce;
    const face = FACE_ROT[value];
    const spins = 2 + Math.floor(Math.random() * 2);
    const next = {
      rx: Math.ceil(rot.current.rx / 360) * 360 + 360 * spins + face.rx,
      ry: Math.ceil(rot.current.ry / 360) * 360 + 360 * (spins + 1) + face.ry,
    };
    rot.current = next;
    setPose(next);
    if (first) return; // do not perform a landing on first paint
    setLanding(true);
    const t1 = setTimeout(() => {
      sfx("land");
      setLanding(false);
      if (value === 6) {
        sfx("six");
        setSixPop((n) => n + 1);
      }
    }, 900);
    return () => clearTimeout(t1);
  }, [nonce, value]);

  const throwIt = () => {
    if (!canRoll) return;
    sfx("rattle");
    onRoll();
  };

  return (
    <div className="dice-lockup">
      <div className="dice-stage" style={{ position: "relative", width: 110, height: 106, flex: "none" }}>
        <AnimatePresence>
          {sixPop > 0 && (
            <motion.div
              key={sixPop}
              initial={{ scale: 0.3, opacity: 0.95 }}
              animate={{ scale: 2.5, opacity: 0 }}
              transition={{ duration: 0.85, ease: "easeOut" }}
              style={{
                position: "absolute", inset: 12, borderRadius: "50%",
                border: `2px solid ${BRASS_HI}`, boxShadow: `0 0 40px ${BRASS_HI}`,
                pointerEvents: "none",
              }}
            />
          )}
        </AnimatePresence>

        <motion.div
          style={{ position: "absolute", left: 18, top: 8, transformStyle: "preserve-3d" }}
          animate={
            shaking
              ? { y: [0, -6, 0, -4, 0], x: [0, 3, -3, 2, 0] }
              : landing
                ? { y: [0, -66, 0, -22, 0, -7, 0], x: [0, 6, 10, 8, 6, 5, 5] }
                : { y: 0, x: 0 }
          }
          transition={
            shaking
              ? { duration: 0.32, repeat: Infinity, ease: "easeInOut" }
              : landing
                ? { duration: 0.9, times: [0, 0.18, 0.42, 0.58, 0.76, 0.88, 1], ease: "easeOut" }
                : { duration: 0.3 }
          }
        >
          <motion.div
            className="dice-cube"
            animate={
              shaking
                ? { rotateX: pose.rx + 720, rotateY: pose.ry + 900 }
                : { rotateX: pose.rx, rotateY: pose.ry }
            }
            transition={
              shaking
                ? { duration: 1.6, repeat: Infinity, ease: "linear" }
                : { duration: 0.9, ease: [0.16, 0.9, 0.28, 1.03] }
            }
          >
            {[1, 2, 3, 4, 5, 6].map((v) => (
              <Face key={v} value={v} />
            ))}
          </motion.div>
        </motion.div>

        <motion.div
          className="dice-shadow"
          style={{ position: "absolute", left: 24, top: 92 }}
          animate={landing ? { scaleX: [1, 0.5, 1, 0.7, 1], opacity: [0.6, 0.2, 0.6, 0.35, 0.6] } : { scaleX: 1, opacity: 0.6 }}
          transition={{ duration: 0.9 }}
        />
      </div>

      <div className="dice-actions">
        <button className="btn btn-primary" onClick={throwIt} disabled={!canRoll} style={{ minWidth: 150 }}>
          {shaking ? "Rolling…" : "Roll the die"}
        </button>
        <p className="dice-hint">{hint}</p>
      </div>
    </div>
  );
}
