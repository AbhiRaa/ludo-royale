"use client";

/**
 * The top-down board. It is the fallback when WebGL is unavailable and an
 * option for anyone who prefers it — so it speaks the same protocol as the 3D
 * scene: show `view`, and act out `cue`.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { Color, GameEvent, HOME, Mode, Snap, YARD } from "@/lib/ludo/types";
import { roleOf } from "@/lib/ludo/rules";
import { moveTimeline, pathPositions } from "@/lib/ludo/timeline";
import { BOARD, PALETTE, Point, posXY } from "@/lib/ludo/render";
import { stackSpread } from "@/lib/ludo/world";
import { BoardArt } from "./BoardArt";
import { TokenPiece } from "./TokenPiece";
import { RoleGlyph } from "./hud/glyphs";
import type { Marker, MarkerTone } from "./three/Scene";

const TONE: Record<MarkerTone, string> = { move: "#ffe9a8", capture: "#ff6a55", home: "#ffd66b", bounce: "#a6d4ff" };
const CELL_PX = BOARD / 15;

type Anim = { x: number | number[]; y: number | number[]; times?: number[]; duration: number; delay: number; rotate?: number[]; lift: boolean };

export function FlatBoard({
  mode,
  players,
  view,
  cue,
  cinematic,
  seat,
  activeColor,
  pickable,
  selected,
  markers,
  onPickToken,
  onPickMarker,
  onHoverToken,
}: {
  mode: Mode;
  players: Color[];
  view: Snap;
  cue: GameEvent | null;
  cinematic: boolean;
  seat: Color | null;
  activeColor: Color | null;
  pickable: number[];
  selected: number | null;
  markers: Marker[];
  onPickToken: (token: number) => void;
  onPickMarker: (token: number, to: number) => void;
  onHoverToken: (token: number | null) => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / BOARD));
    ro.observe(el);
    setScale(el.clientWidth / BOARD);
    return () => ro.disconnect();
  }, []);

  const spread = useMemo(() => stackSpread(players, view.tokens), [players, view.tokens]);

  const anims = useMemo(() => {
    const out: Record<string, Anim> = {};
    if (!cue || cue.type !== "move") return out;
    const tl = moveTimeline(cue, cinematic);
    const start = posXY(cue.color, cue.from, cue.token);
    const path: Point[] = pathPositions(cue).map((p) => posXY(cue.color, p, cue.token));
    const span = Math.max(1, tl.arrive - tl.pre);
    const xs = [start.x];
    const ys = [start.y];
    const times = [0];
    path.forEach((b, i) => {
      const a = i === 0 ? start : path[i - 1];
      const t0 = tl.starts[i] - tl.pre;
      xs.push((a.x + b.x) / 2, b.x);
      ys.push(Math.min(a.y, b.y) - 22, b.y);
      times.push((t0 + tl.hops[i] / 2) / span, (t0 + tl.hops[i]) / span);
    });
    let duration = span / 1000;
    if (cue.bounced) {
      // thrown back to where it started
      const back = 560;
      const total = span + back;
      for (let i = 0; i < times.length; i++) times[i] = (times[i] * span) / total;
      xs.push(start.x);
      ys.push(start.y);
      times.push(1);
      duration = total / 1000;
    }
    out[`${cue.color}-${cue.token}`] = { x: xs, y: ys, times, duration, delay: tl.pre / 1000, lift: true };
    for (const hit of cue.captured) {
      const from = posXY(hit.color, hit.from, hit.token);
      const to = posXY(hit.color, YARD, hit.token);
      out[`${hit.color}-${hit.token}`] = {
        x: [from.x, (from.x + to.x) / 2, to.x],
        y: [from.y, Math.min(from.y, to.y) - 96, to.y],
        times: [0, 0.55, 1],
        rotate: [0, 400, 720],
        duration: 0.8,
        delay: tl.arrive / 1000,
        lift: true,
      };
    }
    return out;
  }, [cue, cinematic]);

  return (
    <div className="board-frame" ref={frame}>
      <div className="board-scaler" style={{ transform: `scale(${scale})` }}>
        <BoardArt />
        {activeColor && (
          <div style={{ position: "absolute", inset: 0, borderRadius: 26, pointerEvents: "none", boxShadow: `inset 0 0 90px -30px ${PALETTE[activeColor].base}`, transition: "box-shadow .6s" }} />
        )}

        {seat &&
          markers.map((m) => {
            const at = m.to === HOME ? { x: BOARD / 2, y: BOARD / 2 } : posXY(seat, m.to, m.token);
            return (
              <button
                key={`${m.token}-${m.to}`}
                className="flat-marker"
                style={{ transform: `translate(${at.x}px, ${at.y}px)`, ["--tone" as string]: TONE[m.tone] }}
                onClick={() => onPickMarker(m.token, m.to)}
                aria-label={`Land here${m.tone === "capture" ? " and capture" : ""}`}
              />
            );
          })}

        {players.flatMap((color) =>
          view.tokens[color].map((pos, index) => {
            const key = `${color}-${index}`;
            const base = posXY(color, pos, index);
            const off = spread[key];
            const rest = { x: base.x + (off ? off[0] * CELL_PX : 0), y: base.y + (off ? off[1] * CELL_PX : 0) };
            const a = anims[key];
            const role = roleOf(mode, index);
            const canPick = color === seat && pickable.includes(index);
            const chosen = color === seat && selected === index;
            const done = pos === HOME;
            return (
              <motion.div
                key={key}
                className="token"
                style={{ zIndex: a?.lift ? 40 : canPick ? 30 : 20 }}
                initial={false}
                animate={{ x: a ? a.x : rest.x, y: a ? a.y : rest.y, rotate: a?.rotate ?? 0, scale: done ? 0.56 : chosen ? 1.18 : 1 }}
                transition={a ? { duration: a.duration, delay: a.delay, times: a.times, ease: "easeInOut" } : { duration: 0.3, ease: "easeOut" }}
              >
                <div className="token-shadow" />
                <div
                  className={`${canPick ? "token-hit token-ready" : ""} ${role === "guard" && view.shield[color] && !done ? "token-shielded" : ""}`}
                  style={{ position: "relative" }}
                  onClick={canPick ? () => onPickToken(index) : undefined}
                  onMouseEnter={canPick ? () => onHoverToken(index) : undefined}
                  onMouseLeave={canPick ? () => onHoverToken(null) : undefined}
                  role={canPick ? "button" : undefined}
                  aria-label={canPick ? `Move your ${role ?? "pawn"}` : undefined}
                >
                  <TokenPiece color={color} crowned={done} />
                  {role && !done && (
                    <span className="token-role">
                      <RoleGlyph role={role} size={14} />
                    </span>
                  )}
                </div>
              </motion.div>
            );
          }),
        )}
      </div>
    </div>
  );
}
