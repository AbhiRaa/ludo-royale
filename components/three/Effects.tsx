"use client";

import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Vec3 } from "@/lib/ludo/world";

export type FxHandle = {
  burst(at: Vec3, color: string, count?: number, power?: number): void;
  ring(at: Vec3, color: string): void;
};

const MAX = 260;
const RINGS = 5;

type Mote = { life: number; ttl: number; size: number; pos: THREE.Vector3; vel: THREE.Vector3 };

/** A fixed pool of sparks and shockwave rings — nothing is allocated mid-game. */
export const Effects = forwardRef<FxHandle>(function Effects(_, ref) {
  const mesh = useRef<THREE.InstancedMesh>(null!);
  const rings = useRef<(THREE.Mesh | null)[]>([]);
  const motes = useMemo<Mote[]>(
    () => Array.from({ length: MAX }, () => ({ life: 0, ttl: 1, size: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3() })),
    [],
  );
  const ringState = useRef(Array.from({ length: RINGS }, () => ({ t: 1 })));
  const cursor = useRef(0);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tint = useMemo(() => new THREE.Color(), []);

  useImperativeHandle(ref, () => ({
    burst(at, color, count = 22, power = 1) {
      tint.set(color);
      for (let i = 0; i < count; i++) {
        const idx = cursor.current++ % MAX;
        const m = motes[idx];
        const a = Math.random() * Math.PI * 2;
        const up = 0.35 + Math.random() * 0.9;
        const speed = (2.2 + Math.random() * 4.2) * power;
        m.pos.set(at[0], at[1] + 0.35, at[2]);
        m.vel.set(Math.cos(a) * speed, up * 5.5 * power, Math.sin(a) * speed);
        m.ttl = 0.55 + Math.random() * 0.6;
        m.life = m.ttl;
        m.size = 0.07 + Math.random() * 0.1;
        mesh.current.setColorAt(idx, tint);
      }
      if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
    },
    ring(at, color) {
      const idx = ringState.current.findIndex((r) => r.t >= 1);
      const r = rings.current[idx < 0 ? 0 : idx];
      if (!r) return;
      ringState.current[idx < 0 ? 0 : idx].t = 0;
      r.position.set(at[0], at[1] + 0.04, at[2]);
      (r.material as THREE.MeshBasicMaterial).color.set(color);
    },
  }));

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    for (let i = 0; i < MAX; i++) {
      const m = motes[i];
      if (m.life > 0) {
        m.life -= dt;
        m.vel.y -= 13 * dt;
        m.pos.addScaledVector(m.vel, dt);
        if (m.pos.y < 0.05) {
          m.pos.y = 0.05;
          m.vel.y *= -0.35;
          m.vel.x *= 0.7;
          m.vel.z *= 0.7;
        }
        dummy.position.copy(m.pos);
        dummy.scale.setScalar(m.size * Math.max(0, m.life / m.ttl));
      } else {
        dummy.scale.setScalar(0);
      }
      dummy.updateMatrix();
      mesh.current.setMatrixAt(i, dummy.matrix);
    }
    mesh.current.instanceMatrix.needsUpdate = true;

    ringState.current.forEach((s, i) => {
      const r = rings.current[i];
      if (!r) return;
      if (s.t < 1) {
        s.t = Math.min(1, s.t + dt * 1.7);
        r.visible = true;
        r.scale.setScalar(0.6 + s.t * 3.4);
        (r.material as THREE.MeshBasicMaterial).opacity = (1 - s.t) * 0.9;
      } else r.visible = false;
    });
  });

  return (
    <>
      <instancedMesh ref={mesh} args={[undefined, undefined, MAX]} frustumCulled={false}>
        <icosahedronGeometry args={[1, 0]} />
        <meshBasicMaterial toneMapped={false} transparent blending={THREE.AdditiveBlending} depthWrite={false} />
      </instancedMesh>
      {Array.from({ length: RINGS }, (_, i) => (
        <mesh key={i} ref={(el) => { rings.current[i] = el; }} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
          <ringGeometry args={[0.5, 0.6, 56]} />
          <meshBasicMaterial toneMapped={false} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      ))}
    </>
  );
});
