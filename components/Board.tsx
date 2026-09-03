"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useAnimationControls } from "motion/react";
import { ClientState, Color, HOME, YARD } from "@/lib/ludo/types";
import {
  BOARD,
  CAPTURE_MS,
  HOP_MS,
  HOP_RISE,
  PALETTE,
  Point,
  pathXY,
  posXY,
  stackOffsets,
  tokenKey,
} from "@/lib/ludo/render";
import { TokenPiece } from "./TokenPiece";
import { BoardArt } from "./BoardArt";
import { sfx } from "@/lib/sound";

type Anim = {
  key: string;
  color: Color;
  index: number;
  x: number | number[];
  y: number | number[];
  times?: number[];
  ease?: string | string[];
  duration: number;
  delay: number;
  shadow: number | number[];
  rotate?: number[];
  scale?: number[];
  lift: boolean;
  finished: boolean;
};

type Burst = {
  id: number;
  x: number;
  y: number;
  color: string;
  bits: { dx: number; dy: number; size: number; rot: number }[];
};

type Flash = { id: number; text: string; tone: string };

let burstSeq = 0;
let flashSeq = 0;

function makeBurst(x: number, y: number, color: string, count = 16): Burst {
  return {
    id: ++burstSeq,
    x,
    y,
    color,
    bits: Array.from({ length: count }, () => {
      const a = Math.random() * Math.PI * 2;
      const d = 26 + Math.random() * 62;
      return {
        dx: Math.cos(a) * d,
        dy: Math.sin(a) * d - 14,
        size: 3 + Math.random() * 5,
        rot: Math.random() * 360,
      };
    }),
  };
}

export function Board({
  state,
  myColor,
  onPick,
}: {
  state: ClientState;
  myColor: Color | null;
  onPick: (token: number) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [flashes, setFlashes] = useState<Flash[]>([]);
  const [hovered, setHovered] = useState<number | null>(null);
  const shake = useAnimationControls();

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / BOARD));
    ro.observe(el);
    setScale(el.clientWidth / BOARD);
    return () => ro.disconnect();
  }, []);

  const offsets = useMemo(() => stackOffsets(state), [state]);
  const event = state.lastEvent;

  /* ---- choreography ------------------------------------------------- */
  const anims = useMemo(() => {
    const out: Anim[] = [];
    const mover = event?.type === "move" ? event : null;
    const moveSteps = mover ? (mover.from === YARD ? 1 : mover.to - mover.from) : 0;
    const moverSecs = mover ? (moveSteps * HOP_MS) / 1000 : 0;

    for (const seat of state.seats) {
      const color = seat.color;
      if (!seat.taken) continue;
      state.tokens[color].forEach((pos, index) => {
        const key = tokenKey(color, index);
        const off = offsets[key] ?? { x: 0, y: 0 };
        const target = posXY(color, pos, index);
        const fx = target.x + off.x;
        const fy = target.y + off.y;

        const base: Anim = {
          key, color, index,
          x: fx, y: fy,
          duration: 0.34, delay: 0,
          shadow: 1, lift: false,
          finished: pos === HOME,
        };

        // the token that just walked
        if (mover && mover.color === color && mover.token === index) {
          const start = posXY(color, mover.from, index);
          const pts: Point[] = pathXY(color, mover.from, mover.to, index);
          const n = pts.length;
          const xs = [start.x];
          const ys = [start.y];
          const shadow = [1];
          const times = [0];
          const ease: string[] = [];
          for (let s = 0; s < n; s++) {
            const a = s === 0 ? start : pts[s - 1];
            const b = pts[s];
            const last = s === n - 1;
            xs.push((a.x + b.x) / 2);
            ys.push(Math.min(a.y, b.y) - HOP_RISE);
            shadow.push(0.5);
            times.push((s + 0.5) / n);
            ease.push("easeOut");
            xs.push(b.x + (last ? off.x : 0));
            ys.push(b.y + (last ? off.y : 0));
            shadow.push(1);
            times.push((s + 1) / n);
            ease.push("easeIn");
          }
          out.push({ ...base, x: xs, y: ys, times, ease, shadow, duration: moverSecs, lift: true });
          return;
        }

        // a token that just got sent home
        const hit = mover?.captured.find((c) => c.color === color && c.token === index);
        if (hit) {
          const from = posXY(color, hit.from, index);
          const to = posXY(color, YARD, index);
          out.push({
            ...base,
            x: [from.x, (from.x + to.x) / 2, to.x],
            y: [from.y, Math.min(from.y, to.y) - 96, to.y],
            shadow: [1, 0.25, 1],
            rotate: [0, 400, 720],
            scale: [1, 1.38, 1],
            times: [0, 0.55, 1],
            ease: ["easeOut", "easeIn"],
            duration: CAPTURE_MS / 1000,
            delay: moverSecs,
            lift: true,
          });
          return;
        }

        out.push(base);
      });
    }
    return out;
  }, [state, offsets, event]);

  /* ---- sound + particles on the same timeline ------------------------ */
  useEffect(() => {
    if (!event || event.type !== "move") return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const steps = event.from === YARD ? 1 : event.to - event.from;
    for (let s = 0; s < steps; s++) {
      timers.push(setTimeout(() => sfx("hop", Math.min(s, 5)), s * HOP_MS + HOP_MS * 0.45));
    }
    const arrival = steps * HOP_MS;

    if (event.captured.length) {
      timers.push(
        setTimeout(() => {
          sfx("capture");
          void shake.start({
            x: [0, -7, 6, -5, 3, 0],
            y: [0, 5, -4, 3, -2, 0],
            transition: { duration: 0.45, ease: "easeOut" },
          });
          setFlashes((f) => [...f, { id: ++flashSeq, text: "CAPTURED", tone: PALETTE[event.color].light }]);
          setBursts((b) => [
            ...b,
            ...event.captured.map((c) => {
              const p = posXY(c.color, c.from, c.token);
              return makeBurst(p.x, p.y, PALETTE[c.color].light, 20);
            }),
          ]);
        }, arrival),
      );
    }
    if (event.finished) {
      timers.push(
        setTimeout(() => {
          sfx("home");
          const p = posXY(event.color, HOME, event.token);
          setBursts((b) => [...b, makeBurst(p.x, p.y, PALETTE[event.color].light, 24)]);
          setFlashes((f) => [...f, { id: ++flashSeq, text: "HOME", tone: PALETTE[event.color].light }]);
        }, arrival),
      );
    }
    return () => timers.forEach(clearTimeout);
  }, [event?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!bursts.length) return;
    const t = setTimeout(() => setBursts((b) => b.slice(1)), 900);
    return () => clearTimeout(t);
  }, [bursts]);
  useEffect(() => {
    if (!flashes.length) return;
    const t = setTimeout(() => setFlashes((f) => f.slice(1)), 1100);
    return () => clearTimeout(t);
  }, [flashes]);

  /* ---- interaction --------------------------------------------------- */
  const myTurn =
    state.status === "playing" &&
    myColor != null &&
    state.seats[state.turn]?.color === myColor &&
    state.awaitingMove;
  const pickable = myTurn ? state.legalMoves : [];
  const activeColor = state.seats[state.turn]?.color ?? null;

  useEffect(() => {
    if (!myTurn) setHovered(null);
  }, [myTurn, state.nonce]);

  const ghost = useMemo(() => {
    if (!myTurn || hovered == null || !myColor || state.dice == null) return null;
    if (!state.legalMoves.includes(hovered)) return null;
    const pos = state.tokens[myColor][hovered];
    const to = pos === YARD ? 0 : pos + state.dice;
    if (to > HOME) return null;
    return posXY(myColor, to, hovered);
  }, [hovered, myColor, myTurn, state.dice, state.tokens, state.legalMoves]);

  return (
    <div className="board-frame" ref={frameRef}>
      <div className="board-scaler" style={{ transform: `scale(${scale})` }}>
        <motion.div style={{ position: "absolute", inset: 0 }} animate={shake}>
        <BoardArtLayer activeColor={activeColor} />

        {/* destination preview */}
        <AnimatePresence>
          {ghost && myColor && (
            <motion.div
              key="ghost"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              style={{
                position: "absolute", left: 0, top: 0,
                width: 44, height: 44, marginLeft: -22, marginTop: -22,
                borderRadius: "50%",
                border: `2px dashed ${PALETTE[myColor].light}`,
                background: `${PALETTE[myColor].base}22`,
                transform: `translate(${ghost.x}px, ${ghost.y}px)`,
                pointerEvents: "none",
              }}
            />
          )}
        </AnimatePresence>

        {/* tokens */}
        {anims.map((a) => {
          const canPick = a.color === myColor && pickable.includes(a.index);
          return (
            <motion.div
              key={a.key}
              className="token"
              style={{ zIndex: a.lift ? 40 : canPick ? 30 : 20 }}
              initial={false}
              animate={{
                x: a.x,
                y: a.y,
                ...(a.rotate ? { rotate: a.rotate } : { rotate: 0 }),
                ...(a.scale ? { scale: a.scale } : { scale: a.finished ? 0.56 : 1 }),
              }}
              transition={{
                duration: a.duration,
                delay: a.delay,
                times: a.times,
                ease: (a.ease ?? "easeOut") as never,
              }}
            >
              <motion.div
                className="token-shadow"
                animate={{ scale: a.shadow, opacity: Array.isArray(a.shadow) ? a.shadow.map((s) => 0.25 + s * 0.5) : 0.75 }}
                transition={{ duration: a.duration, delay: a.delay, times: a.times, ease: (a.ease ?? "easeOut") as never }}
              />
              <div className={canPick ? "token-hit token-ready" : undefined}
                   style={{ position: "relative" }}
                   onClick={canPick ? () => onPick(a.index) : undefined}
                   onMouseEnter={canPick ? () => setHovered(a.index) : undefined}
                   onMouseLeave={canPick ? () => setHovered(null) : undefined}
                   role={canPick ? "button" : undefined}
                   aria-label={canPick ? `Move ${a.color} token ${a.index + 1}` : undefined}
              >
                <motion.div
                  animate={canPick ? { y: [0, -3.5, 0] } : { y: 0 }}
                  transition={canPick ? { duration: 1.5, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 }}
                >
                  <TokenPiece color={a.color} crowned={a.finished} />
                </motion.div>
              </div>
            </motion.div>
          );
        })}

        {/* particles */}
        {bursts.map((b) => (
          <div key={b.id} style={{ position: "absolute", left: b.x, top: b.y, pointerEvents: "none", zIndex: 60 }}>
            {b.bits.map((bit, i) => (
              <motion.span
                key={i}
                initial={{ x: 0, y: 0, opacity: 1, scale: 1, rotate: 0 }}
                animate={{ x: bit.dx, y: bit.dy + 40, opacity: 0, scale: 0.3, rotate: bit.rot }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                style={{
                  position: "absolute",
                  width: bit.size, height: bit.size,
                  borderRadius: i % 3 === 0 ? 2 : "50%",
                  background: b.color,
                  boxShadow: `0 0 10px ${b.color}`,
                }}
              />
            ))}
          </div>
        ))}

        {/* floating callouts */}
        {flashes.map((f, i) => (
          <motion.div
            key={f.id}
            initial={{ opacity: 0, y: 20, scale: 0.7 }}
            animate={{ opacity: [0, 1, 1, 0], y: [20, -6, -18, -48], scale: [0.7, 1.12, 1, 0.95] }}
            transition={{ duration: 1.1, times: [0, 0.22, 0.6, 1] }}
            style={{
              position: "absolute", left: 0, right: 0, top: 250 + i * 44,
              textAlign: "center", pointerEvents: "none", zIndex: 70,
              fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 26,
              letterSpacing: "0.22em", color: f.tone,
              textShadow: `0 0 26px ${f.tone}, 0 3px 12px rgba(0,0,0,.95)`,
            }}
          >
            {f.text}
          </motion.div>
        ))}
        </motion.div>
      </div>
    </div>
  );
}

/** Board art plus the soft tint that follows whoever is on turn. */
function BoardArtLayer({ activeColor }: { activeColor: Color | null }) {
  return (
    <>
      <BoardArt />
      <AnimatePresence>
        {activeColor && (
          <motion.div
            key={activeColor}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7 }}
            style={{
              position: "absolute", inset: 0, borderRadius: 26, pointerEvents: "none",
              boxShadow: `inset 0 0 90px -30px ${PALETTE[activeColor].base}`,
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
