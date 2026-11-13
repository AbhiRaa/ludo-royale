"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Color, Role } from "@/lib/ludo/types";
import type { Vec3 } from "@/lib/ludo/world";
import { PALETTE } from "@/lib/ludo/render";
import { bodyMaterial, brassMaterial, pawnParts } from "./pawnParts";

/** One leg of a scripted move, timed in ms from the start of its cue. */
export type Seg = { t0: number; dur: number; to: Vec3; arc: number; spin?: number };
export type PawnAnim = { id: number; segs: Seg[] };

const easeInOut = (u: number) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);

export function Pawn({
  color,
  role,
  target,
  anim,
  pickable,
  selected,
  shield,
  small,
  phase,
  onPick,
  onHover,
}: {
  color: Color;
  role: Role | null;
  /** where the pawn belongs once nothing is animating it */
  target: Vec3;
  anim: PawnAnim | null;
  pickable: boolean;
  selected: boolean;
  /** Guard only: is the shield still up */
  shield: boolean;
  /** finished pawns shrink onto the pyramid */
  small: boolean;
  phase: number;
  onPick?: () => void;
  onHover?: (on: boolean) => void;
}) {
  const group = useRef<THREE.Group>(null!);
  const body = useRef<THREE.Group>(null!);
  const ring = useRef<THREE.Mesh>(null!);
  const aura = useRef<THREE.Group>(null);
  const mem = useRef({
    ready: false,
    animId: -1,
    t0: 0,
    lastSeg: -1,
    landedAt: -1e9,
    origin: new THREE.Vector3(),
    from: new THREE.Vector3(),
    to: new THREE.Vector3(),
    scale: 1,
    lift: 0,
  });

  const parts = useMemo(() => pawnParts(role), [role]);
  const material = useMemo(() => bodyMaterial(color), [color]);
  const glow = useMemo(() => new THREE.Color(PALETTE[color].light), [color]);

  useFrame((_, dt) => {
    const g = group.current;
    const m = mem.current;
    const now = performance.now();
    if (!m.ready) {
      g.position.set(target[0], target[1], target[2]);
      m.scale = small ? 0.56 : 0.92;
      m.ready = true;
    }

    let spin = 0;
    if (anim) {
      if (m.animId !== anim.id) {
        m.animId = anim.id;
        m.t0 = now;
        m.lastSeg = -1;
        m.origin.copy(g.position);
      }
      const t = now - m.t0;
      let i = -1;
      for (let k = 0; k < anim.segs.length; k++) if (t >= anim.segs[k].t0) i = k;
      if (i >= 0) {
        const seg = anim.segs[i];
        if (i === 0) m.from.copy(m.origin);
        else m.from.set(...anim.segs[i - 1].to);
        m.to.set(...seg.to);
        const u = Math.min(1, (t - seg.t0) / seg.dur);
        g.position.lerpVectors(m.from, m.to, seg.dur > 320 ? easeInOut(u) : u);
        g.position.y += seg.arc * 4 * u * (1 - u);
        if (seg.spin) spin = seg.spin * u;
        if (u >= 1 && m.lastSeg !== i) {
          m.lastSeg = i;
          m.landedAt = now;
        }
      }
      // After the last leg the pawn holds its ground until the cue leaves the
      // stage; settling early would drag it back toward a stale target.
    } else {
      m.animId = -1;
      const k = 1 - Math.exp(-dt * 11);
      g.position.x += (target[0] - g.position.x) * k;
      g.position.y += (target[1] - g.position.y) * k;
      g.position.z += (target[2] - g.position.z) * k;
    }

    // squash on landing, stretch back out
    const q = Math.exp(-(now - m.landedAt) / 75);
    m.scale += ((small ? 0.56 : 0.92) - m.scale) * (1 - Math.exp(-dt * 8));
    body.current.scale.set(m.scale * (1 + 0.15 * q), m.scale * (1 - 0.22 * q), m.scale * (1 + 0.15 * q));
    body.current.rotation.x = spin;

    const wantLift = selected ? 0.3 : pickable ? 0.1 + Math.sin(now / 260 + phase) * 0.05 : 0;
    m.lift += (wantLift - m.lift) * (1 - Math.exp(-dt * 10));
    body.current.position.y = m.lift;

    if (ring.current) {
      const pulse = 0.5 + 0.5 * Math.sin(now / 230 + phase);
      ring.current.visible = pickable;
      ring.current.scale.setScalar(selected ? 1.25 : 0.95 + pulse * 0.2);
      (ring.current.material as THREE.MeshBasicMaterial).opacity = selected ? 0.95 : 0.45 + pulse * 0.4;
    }
    if (aura.current) {
      aura.current.visible = shield;
      aura.current.rotation.y = now / 900;
      aura.current.scale.setScalar(1 + Math.sin(now / 520 + phase) * 0.035);
    }
  });

  return (
    <group ref={group}>
      <group ref={body}>
        {parts.map((p, i) => (
          <mesh
            key={i}
            geometry={p.geo}
            material={p.mat === "brass" ? brassMaterial : material}
            position={p.pos}
            rotation={p.rot}
            castShadow
            receiveShadow
          />
        ))}
        {role === "guard" && (
          <group ref={aura}>
            <mesh position={[0, 0.42, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.54, 0.03, 10, 48]} />
              <meshBasicMaterial color={glow} toneMapped={false} transparent opacity={0.9} />
            </mesh>
            <mesh position={[0, 0.5, 0]}>
              <cylinderGeometry args={[0.54, 0.54, 0.86, 40, 1, true]} />
              <meshBasicMaterial
                color={glow}
                toneMapped={false}
                transparent
                opacity={0.12}
                side={THREE.DoubleSide}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
              />
            </mesh>
          </group>
        )}
      </group>

      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} visible={false}>
        <ringGeometry args={[0.47, 0.58, 44]} />
        <meshBasicMaterial color="#ffe9a8" toneMapped={false} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>

      {pickable && (
        // a generous, invisible target: pawns are small on a phone
        <mesh
          position={[0, 0.65, 0]}
          onClick={(e) => {
            if (e.delta > 8) return; // that was a camera drag, not a tap
            e.stopPropagation();
            onPick?.();
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            onHover?.(true);
          }}
          onPointerOut={() => onHover?.(false)}
        >
          <cylinderGeometry args={[0.56, 0.56, 1.5, 12]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}
