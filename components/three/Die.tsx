"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import type { Color } from "@/lib/ludo/types";
import { YARD_CENTER } from "@/lib/ludo/world";

const SIZE = 0.84;
const HALF = SIZE / 2;
const THROW_MS = 1100;

/** Which way each face points on the resting cube. Opposite faces sum to 7. */
const NORMAL: Record<number, [number, number, number]> = {
  1: [0, 1, 0], 6: [0, -1, 0],
  2: [0, 0, 1], 5: [0, 0, -1],
  3: [1, 0, 0], 4: [-1, 0, 0],
};
const PIPS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

const UP = new THREE.Vector3(0, 1, 0);
/** Orientation that brings `value` to the top, turned `yaw` about the vertical. */
function faceUp(value: number, yaw: number, out: THREE.Quaternion): THREE.Quaternion {
  const n = new THREE.Vector3(...NORMAL[value]);
  out.setFromUnitVectors(n, UP);
  return out.premultiply(new THREE.Quaternion().setFromAxisAngle(UP, yaw));
}

export function Die({
  owner,
  value,
  throwSeq,
  charging,
}: {
  /** whose yard the die lives in */
  owner: Color | null;
  /** face to show; null hides the die */
  value: number | null;
  /** changes once per throw — that change is what launches the die */
  throwSeq: number;
  /** the local player has clicked and the server has not answered yet */
  charging: boolean;
}) {
  const group = useRef<THREE.Group>(null!);
  const mem = useRef({
    mode: "hidden" as "hidden" | "rest" | "charge" | "throw" | "flip",
    seq: null as number | null,
    shown: null as number | null,
    t0: 0,
    from: new THREE.Vector3(),
    to: new THREE.Vector3(),
    qFrom: new THREE.Quaternion(),
    qTo: new THREE.Quaternion(),
    axis: new THREE.Vector3(1, 0, 0),
    turns: 3,
    scale: 0,
  });
  const tmp = useMemo(() => ({ q: new THREE.Quaternion(), v: new THREE.Vector3() }), []);

  const pips = useMemo(() => {
    const out: { pos: [number, number, number]; rot: [number, number, number] }[] = [];
    const step = 0.19;
    for (const [face, dots] of Object.entries(PIPS)) {
      const n = new THREE.Vector3(...NORMAL[Number(face)]);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
      const e = new THREE.Euler().setFromQuaternion(q);
      for (const [a, b] of dots) {
        const p = new THREE.Vector3(a * step, b * step, HALF + 0.002).applyQuaternion(q);
        out.push({ pos: [p.x, p.y, p.z], rot: [e.x, e.y, e.z] });
      }
    }
    return out;
  }, []);

  useFrame((_, dt) => {
    const g = group.current;
    const m = mem.current;
    const now = performance.now();
    const home = owner ? YARD_CENTER[owner] : null;

    // ---- decide what the die should be doing --------------------------
    if (m.seq === null) {
      // first frame: sit wherever the game already has it, without a throw
      m.seq = throwSeq;
      if (home && value != null) {
        m.mode = "rest";
        m.shown = value;
        g.position.set(home[0], HALF, home[2]);
        faceUp(value, 0.5, g.quaternion);
      }
    } else if (throwSeq !== m.seq && home && value != null) {
      m.seq = throwSeq;
      m.shown = value;
      const wasCharging = m.mode === "charge";
      m.mode = "throw";
      m.t0 = now;
      if (wasCharging) m.from.copy(g.position);
      else {
        // comes in over that player's own corner of the table
        const out = tmp.v.set(home[0], 0, home[2]).normalize();
        m.from.set(home[0] + out.x * 4.4, 4.8, home[2] + out.z * 4.4);
      }
      m.to.set(home[0], HALF, home[2]);
      faceUp(value, Math.random() * Math.PI * 2, m.qTo);
      m.axis.set(Math.random() - 0.5, Math.random() * 0.4, Math.random() - 0.5).normalize();
      m.turns = 2.5 + Math.random() * 1.5;
    } else if (charging && home && m.mode !== "throw") {
      if (m.mode !== "charge") {
        m.mode = "charge";
        m.t0 = now;
        if (m.scale < 0.2) g.position.set(home[0], 0.6, home[2]);
      }
    } else if (!charging && m.mode === "charge") {
      // the request failed: put the die back down
      m.mode = m.shown != null ? "rest" : "hidden";
    } else if (m.mode === "rest" && value != null && value !== m.shown) {
      // Fate nudged it: tip over to the new face
      m.shown = value;
      m.mode = "flip";
      m.t0 = now;
      m.qFrom.copy(g.quaternion);
      faceUp(value, 0.5, m.qTo);
    } else if (value == null && !charging && m.mode !== "hidden") {
      m.mode = "hidden";
    }

    // ---- then do it ----------------------------------------------------
    let wantScale = 1;
    if (m.mode === "hidden") {
      wantScale = 0;
    } else if (m.mode === "charge" && home) {
      const t = (now - m.t0) / 1000;
      g.position.x += (home[0] - g.position.x) * 0.2;
      g.position.z += (home[2] - g.position.z) * 0.2;
      g.position.y += (2.3 + Math.sin(t * 9) * 0.12 - g.position.y) * 0.18;
      g.rotateOnWorldAxis(tmp.v.set(0.6, 1, 0.3).normalize(), dt * 16);
    } else if (m.mode === "throw") {
      const u = Math.min(1, (now - m.t0) / THROW_MS);
      const eased = 1 - Math.pow(1 - u, 3);
      g.position.x = m.from.x + (m.to.x - m.from.x) * eased;
      g.position.z = m.from.z + (m.to.z - m.from.z) * eased;
      // a drop and two and a half decaying bounces
      g.position.y = HALF + Math.pow(1 - u, 2) * (m.from.y - HALF) * Math.abs(Math.cos(u * Math.PI * 2.5));
      // tumbling that slows into exactly the right face
      tmp.q.setFromAxisAngle(m.axis, (1 - eased) * m.turns * Math.PI * 2);
      g.quaternion.copy(m.qTo).premultiply(tmp.q);
      if (u >= 1) m.mode = "rest";
    } else if (m.mode === "flip") {
      const u = Math.min(1, (now - m.t0) / 340);
      g.quaternion.slerpQuaternions(m.qFrom, m.qTo, u * u * (3 - 2 * u));
      g.position.y = HALF + Math.sin(u * Math.PI) * 0.55;
      if (u >= 1) m.mode = "rest";
    } else if (home) {
      g.position.x += (home[0] - g.position.x) * 0.2;
      g.position.z += (home[2] - g.position.z) * 0.2;
      g.position.y += (HALF - g.position.y) * 0.25;
    }
    m.scale += (wantScale - m.scale) * (1 - Math.exp(-dt * 14));
    g.scale.setScalar(Math.max(0.0001, m.scale));
  });

  return (
    <group ref={group} scale={0.0001}>
      <RoundedBox args={[SIZE, SIZE, SIZE]} radius={0.13} smoothness={5} castShadow receiveShadow>
        <meshPhysicalMaterial color="#f3e9d2" roughness={0.3} clearcoat={0.7} clearcoatRoughness={0.25} />
      </RoundedBox>
      {pips.map((p, i) => (
        <mesh key={i} position={p.pos} rotation={p.rot}>
          <circleGeometry args={[0.066, 20]} />
          <meshStandardMaterial color="#2b1f0c" roughness={0.45} />
        </mesh>
      ))}
    </group>
  );
}
