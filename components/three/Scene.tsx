"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { Color, GameEvent, HOME, Mode, MoveKind, Snap, YARD } from "@/lib/ludo/types";
import { roleOf } from "@/lib/ludo/rules";
import { moveTimeline, pathPositions } from "@/lib/ludo/timeline";
import { PYRAMID_HALF, PYRAMID_HEIGHT, Vec3, YARD_CENTER, posWorld, stackSpread } from "@/lib/ludo/world";
import { PALETTE } from "@/lib/ludo/render";
import { Pawn, PawnAnim, Seg } from "./Pawn";
import { Die } from "./Die";
import { Director } from "./Director";
import { Effects, FxHandle } from "./Effects";
import { SeatSky, SkyAndLight } from "./Sky";
import { TEX_SPAN, boardTexture, tableTexture } from "./textures";
import { brassMaterial } from "./pawnParts";

export type MarkerTone = "move" | "capture" | "home" | "bounce";
export type Marker = { token: number; to: number; kind: MoveKind; tone: MarkerTone };

export type SceneProps = {
  mode: Mode;
  players: Color[];
  /** the board as currently shown (lags the server while events play out) */
  view: Snap;
  cue: GameEvent | null;
  cinematic: boolean;
  /** the colour this viewer plays, or null when watching */
  seat: Color | null;
  activeColor: Color | null;
  pickable: number[];
  selected: number | null;
  markers: Marker[];
  onPickToken: (token: number) => void;
  onPickMarker: (token: number, to: number) => void;
  onHoverToken: (token: number | null) => void;
  onMiss: () => void;
  die: { owner: Color | null; value: number | null; throwSeq: number; charging: boolean };
  skies: SeatSky[];
  winner: Color | null;
  cameraReset: number;
  lowQuality: boolean;
  /** called once, after the first frame has actually been drawn */
  onReady?: () => void;
};

const TONE: Record<MarkerTone, string> = {
  move: "#ffe9a8",
  capture: "#ff6a55",
  home: "#ffd66b",
  bounce: "#a6d4ff",
};

/** Turns one move event into the scripted flight of every pawn it touches. */
function choreograph(cue: GameEvent | null, cinematic: boolean): Record<string, PawnAnim> {
  if (!cue || cue.type !== "move") return {};
  const tl = moveTimeline(cue, cinematic);
  const from = posWorld(cue.color, cue.from, cue.token);
  const path = pathPositions(cue).map((p) => posWorld(cue.color, p, cue.token));
  const segs: Seg[] = path.map((to, i) => ({
    t0: tl.starts[i],
    dur: tl.hops[i],
    to,
    arc: cue.kind === "enter" ? 1.3 : tl.dramatic && i === path.length - 1 ? 1.9 : 0.55,
  }));

  if (cue.bounced) {
    // it never lands: it meets the shield short of the square and is flung back
    const last = segs.length - 1;
    const prev = last > 0 ? path[last - 1] : from;
    const aim = path[last];
    const hit: Vec3 = [prev[0] + (aim[0] - prev[0]) * 0.62, 0.25, prev[2] + (aim[2] - prev[2]) * 0.62];
    segs[last] = { ...segs[last], to: hit, arc: tl.dramatic ? 1.4 : 0.5 };
    segs.push({ t0: tl.arrive, dur: 560, to: from, arc: 1.7, spin: -Math.PI * 2 });
  }

  const out: Record<string, PawnAnim> = { [`${cue.color}-${cue.token}`]: { id: cue.seq, segs } };
  for (const hit of cue.captured) {
    out[`${hit.color}-${hit.token}`] = {
      id: cue.seq,
      segs: [{ t0: tl.arrive + 40, dur: 820, to: posWorld(hit.color, YARD, hit.token), arc: 3.6, spin: Math.PI * 4 }],
    };
  }
  return out;
}

function Pyramid() {
  const geometry = useMemo(() => {
    const h = PYRAMID_HEIGHT;
    const a = PYRAMID_HALF;
    // one outward-facing triangle per colour, wound so its normal points out
    const faces: [Color, number[][]][] = [
      ["red", [[-a, 0, -a], [-a, 0, a], [0, h, 0]]],
      ["green", [[a, 0, -a], [-a, 0, -a], [0, h, 0]]],
      ["yellow", [[a, 0, a], [a, 0, -a], [0, h, 0]]],
      ["blue", [[-a, 0, a], [a, 0, a], [0, h, 0]]],
    ];
    const pos: number[] = [];
    const col: number[] = [];
    for (const [color, tri] of faces) {
      const base = new THREE.Color(PALETTE[color].base);
      const tip = new THREE.Color(PALETTE[color].light);
      tri.forEach((v, i) => {
        pos.push(...v);
        const c = i === 2 ? tip : base;
        col.push(c.r, c.g, c.b);
      });
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  }, []);
  return (
    <group>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshPhysicalMaterial vertexColors roughness={0.28} clearcoat={1} clearcoatRoughness={0.15} />
      </mesh>
      <mesh position={[0, PYRAMID_HEIGHT + 0.07, 0]} material={brassMaterial} castShadow>
        <octahedronGeometry args={[0.16, 0]} />
      </mesh>
    </group>
  );
}

function MarkerRing({ at, tone, wide, onPick }: { at: Vec3; tone: MarkerTone; wide: boolean; onPick: () => void }) {
  const ring = useRef<THREE.Mesh>(null!);
  const cross = useRef<THREE.Group>(null);
  const r = wide ? 2.25 : 0.4;
  useFrame(() => {
    const t = performance.now();
    const pulse = 0.5 + 0.5 * Math.sin(t / 190);
    ring.current.scale.setScalar(1 + pulse * 0.1);
    (ring.current.material as THREE.MeshBasicMaterial).opacity = 0.6 + pulse * 0.4;
    if (cross.current) {
      cross.current.rotation.y = t / 520;
      cross.current.position.y = 1.55 + Math.sin(t / 300) * 0.08;
    }
  });
  return (
    <group position={[at[0], at[1] + 0.035, at[2]]}>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[r * 0.78, r, 48]} />
        <meshBasicMaterial color={TONE[tone]} toneMapped={false} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={(e) => {
          if (e.delta > 8) return;
          e.stopPropagation();
          onPick();
        }}
      >
        <circleGeometry args={[wide ? r : 0.5, 32]} />
        <meshBasicMaterial color={TONE[tone]} toneMapped={false} transparent opacity={0.2} depthWrite={false} />
      </mesh>
      {(tone === "capture" || tone === "bounce") && (
        <group ref={cross} position={[0, 1.55, 0]}>
          {tone === "capture" ? (
            [-1, 1].map((s) => (
              <mesh key={s} rotation={[0, 0, (s * Math.PI) / 4]}>
                <boxGeometry args={[0.46, 0.085, 0.085]} />
                <meshBasicMaterial color={TONE.capture} toneMapped={false} />
              </mesh>
            ))
          ) : (
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.2, 0.045, 8, 24]} />
              <meshBasicMaterial color={TONE.bounce} toneMapped={false} />
            </mesh>
          )}
        </group>
      )}
    </group>
  );
}

/** A soft frame of light around the yard of whoever is on turn. */
function TurnGlow({ color }: { color: Color | null }) {
  const mesh = useRef<THREE.Mesh>(null!);
  useFrame(() => {
    const m = mesh.current.material as THREE.MeshBasicMaterial;
    m.opacity = color ? 0.5 + 0.35 * Math.sin(performance.now() / 420) : 0;
  });
  const at = color ? YARD_CENTER[color] : ([0, 0, 0] as Vec3);
  return (
    <mesh ref={mesh} position={[at[0], 0.02, at[2]]} rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
      <ringGeometry args={[2.86 * Math.SQRT2, 3.0 * Math.SQRT2, 4, 1]} />
      <meshBasicMaterial
        color={color ? PALETTE[color].light : "#ffffff"}
        toneMapped={false}
        transparent
        opacity={0}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

/** Development only: hands the renderer to the console so a frame can be timed. */
function DevProbe() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    (window as unknown as { __ludo3d?: unknown }).__ludo3d = { gl, scene, camera };
  }, [gl, scene, camera]);
  return null;
}

function World(props: SceneProps) {
  const { mode, players, view, cue, cinematic, seat, pickable, selected, markers } = props;
  const root = useRef<THREE.Group>(null!);
  const fx = useRef<FxHandle>(null);
  const quake = useRef({ until: 0, power: 0, span: 1 });

  const board = useMemo(() => boardTexture(props.lowQuality ? 1024 : 2048), [props.lowQuality]);
  const table = useMemo(() => tableTexture(), []);
  useEffect(() => () => { board.dispose(); table.dispose(); }, [board, table]);

  const anims = useMemo(() => choreograph(cue, cinematic), [cue, cinematic]);
  const spread = useMemo(() => stackSpread(players, view.tokens), [players, view.tokens]);

  // sparks, shockwaves and camera shake land on the same beat as the pawns
  useEffect(() => {
    if (!cue || cue.type !== "move") return;
    const tl = moveTimeline(cue, cinematic);
    const at = posWorld(cue.color, cue.to, cue.token);
    const shake = (power: number, ms: number) => { quake.current = { until: performance.now() + ms, power, span: ms }; };
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (cue.captured.length) {
      timers.push(setTimeout(() => {
        for (const hit of cue.captured) fx.current?.burst(at, PALETTE[hit.color].light, 30, 1.15);
        fx.current?.ring(at, PALETTE[cue.color].light);
        shake(0.26, 420);
      }, tl.arrive));
    }
    if (cue.bounced) {
      timers.push(setTimeout(() => {
        fx.current?.burst(at, "#cfe8ff", 34, 1);
        fx.current?.ring(at, "#cfe8ff");
        shake(0.18, 320);
      }, tl.arrive));
    }
    if (cue.finished) {
      timers.push(setTimeout(() => {
        fx.current?.burst([0, PYRAMID_HEIGHT, 0], "#ffe08a", 44, 1.25);
        fx.current?.ring([0, 0, 0], "#ffe08a");
      }, tl.arrive));
    }
    if (cue.star && cue.captured.length === 0) {
      timers.push(setTimeout(() => fx.current?.burst(at, "#ffe9a8", 12, 0.6), tl.arrive));
    }
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cue?.seq]);

  const announced = useRef(false);
  useFrame(() => {
    // by the time a frame callback runs twice, the first frame is on screen
    if (!announced.current && root.current) {
      announced.current = true;
      requestAnimationFrame(() => props.onReady?.());
    }
    const q = quake.current;
    const left = q.until - performance.now();
    if (left > 0) {
      const k = q.power * (left / q.span);
      root.current.position.set((Math.random() - 0.5) * k, (Math.random() - 0.5) * k * 0.6, (Math.random() - 0.5) * k);
    } else if (root.current.position.lengthSq() > 0) root.current.position.set(0, 0, 0);
  });

  return (
    <>
      <SkyAndLight seats={props.skies} lowQuality={props.lowQuality} />
      <Environment resolution={128} frames={1}>
        <color attach="background" args={["#0d0a08"]} />
        <Lightformer form="ring" intensity={1.5} color="#ffe2b8" position={[0, 10, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[5, 5, 1]} />
        <Lightformer form="rect" intensity={0.7} color="#9db8ff" position={[-12, 3, 6]} rotation={[0, Math.PI / 2, 0]} scale={[10, 4, 1]} />
        <Lightformer form="rect" intensity={0.7} color="#ffb27a" position={[12, 3, -6]} rotation={[0, -Math.PI / 2, 0]} scale={[10, 4, 1]} />
      </Environment>

      <group ref={root}>
        {/* the table: a round walnut top, floating */}
        <mesh position={[0, -0.96, 0]} receiveShadow>
          <cylinderGeometry args={[15.2, 14.6, 0.5, 96]} />
          <meshStandardMaterial color="#2a1c14" roughness={0.75} />
        </mesh>
        <mesh position={[0, -0.705, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <circleGeometry args={[15.2, 96]} />
          <meshStandardMaterial map={table} roughness={0.62} />
        </mesh>
        <mesh position={[0, -0.71, 0]} rotation={[Math.PI / 2, 0, 0]} material={brassMaterial}>
          <torusGeometry args={[15.2, 0.085, 10, 120]} />
        </mesh>

        {/* the board: a lacquered slab with the painted face laid on top */}
        <RoundedBox args={[TEX_SPAN + 0.4, 0.7, TEX_SPAN + 0.4]} radius={0.2} smoothness={5} position={[0, -0.352, 0]} castShadow receiveShadow>
          <meshPhysicalMaterial color="#1a120e" roughness={0.35} clearcoat={1} clearcoatRoughness={0.12} />
        </RoundedBox>
        <mesh position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[TEX_SPAN, TEX_SPAN]} />
          <meshPhysicalMaterial map={board} roughness={0.55} clearcoat={0.4} clearcoatRoughness={0.32} envMapIntensity={0.3} />
        </mesh>
        {[-1, 1].flatMap((sx) =>
          [-1, 1].map((sz) => (
            <mesh key={`${sx}${sz}`} position={[sx * 8.0, 0.02, sz * 8.0]} material={brassMaterial} castShadow>
              <sphereGeometry args={[0.15, 18, 12]} />
            </mesh>
          )),
        )}

        <Pyramid />
        <TurnGlow color={props.winner ? null : props.activeColor} />

        {players.flatMap((color) =>
          view.tokens[color].map((pos, index) => {
            const key = `${color}-${index}`;
            const base = posWorld(color, pos, index);
            const off = spread[key];
            const target: Vec3 = off ? [base[0] + off[0], base[1], base[2] + off[1]] : base;
            const mine = color === seat;
            const role = roleOf(mode, index);
            return (
              <Pawn
                key={key}
                color={color}
                role={role}
                target={target}
                anim={anims[key] ?? null}
                pickable={mine && pickable.includes(index)}
                selected={mine && selected === index}
                shield={role === "guard" && view.shield[color] && pos !== HOME}
                small={pos === HOME}
                phase={index * 1.7 + color.length}
                onPick={() => props.onPickToken(index)}
                onHover={(on) => props.onHoverToken(on ? index : null)}
              />
            );
          }),
        )}

        {seat &&
          markers.map((m) => (
            <MarkerRing
              key={`${m.token}-${m.to}`}
              at={m.to === HOME ? [0, 0, 0] : posWorld(seat, m.to, m.token)}
              tone={m.tone}
              wide={m.to === HOME}
              onPick={() => props.onPickMarker(m.token, m.to)}
            />
          ))}

        <Die {...props.die} />
        <Effects ref={fx} />
      </group>

      <Director seat={seat} cue={cue} cinematic={cinematic} winner={props.winner} resetKey={props.cameraReset} />
      {process.env.NODE_ENV !== "production" && <DevProbe />}
    </>
  );
}

export default function Scene(props: SceneProps) {
  return (
    <Canvas
      shadows
      dpr={props.lowQuality ? [1, 1.5] : [1, 2]}
      camera={{ fov: 35, near: 0.5, far: 900, position: [0, 30, 30] }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        // keeps the lacquer colours saturated where ACES would wash them out
        gl.toneMapping = THREE.NeutralToneMapping;
        gl.toneMappingExposure = 1.0;
      }}
      onPointerMissed={props.onMiss}
      style={{ touchAction: "none" }}
    >
      <World {...props} />
    </Canvas>
  );
}
