"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Color } from "@/lib/ludo/types";
import { YARD_CENTER } from "@/lib/ludo/world";
import type { Sky as SkyState } from "@/lib/sky";

export type SeatSky = { color: Color; sky: SkyState };

const VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * One dome, up to four skies. Each seat owns the stretch of sky behind its own
 * corner of the table; between corners the skies blend. Look across the board
 * and what is on the horizon is the hour on the other player's clock.
 */
const FRAG = /* glsl */ `
  uniform vec3 uTop[4];
  uniform vec3 uHor[4];
  uniform vec2 uDir[4];
  uniform float uOn[4];
  uniform float uNight[4];
  uniform vec3 uOrb[4];
  uniform vec3 uOrbCol[4];
  uniform float uTime;
  uniform float uDrop;
  varying vec3 vDir;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  void main() {
    vec3 view = normalize(vDir);
    // The table floats high above everything, and the camera looks down at it,
    // so the true horizon would never be in shot. Sky-space lowers it to where
    // the far edge of the table is: the sky begins where the table ends.
    vec3 d = normalize(vec3(view.x, view.y + uDrop, view.z));
    vec2 flat2 = normalize(view.xz + vec2(1e-5));

    float wsum = 0.0;
    float night = 0.0;
    vec3 top = vec3(0.0);
    vec3 hor = vec3(0.0);
    for (int i = 0; i < 4; i++) {
      float w = uOn[i] * (pow(max(dot(flat2, uDir[i]) * 0.5 + 0.5, 0.0), 3.0) + 0.0005);
      wsum += w;
      top += w * uTop[i];
      hor += w * uHor[i];
      night += w * uNight[i];
    }
    wsum = max(wsum, 1e-5);
    top /= wsum; hor /= wsum; night /= wsum;

    float e = d.y;
    vec3 col = mix(hor, top, smoothstep(0.0, 0.46, e));
    col += hor * 0.2 * exp(-abs(e) * 9.0);
    // under the horizon there is more sky, not ground: the same haze, deepening
    vec3 deep = mix(hor, top, 0.55) * 0.5;
    col = mix(col, deep, smoothstep(0.0, -0.7, e));

    // stars, only where it is night
    vec3 cell = d * 150.0;
    float h = hash(floor(cell));
    float star = step(0.9972, h) * smoothstep(0.42, 0.0, length(fract(cell) - 0.5));
    col += vec3(star) * (0.55 + 0.45 * sin(uTime * 1.7 + h * 90.0)) * night * smoothstep(-0.05, 0.18, e) * 1.6;

    // each seat's sun or moon hangs behind its own corner
    for (int i = 0; i < 4; i++) {
      float c = max(dot(d, uOrb[i]), 0.0);
      float disc = smoothstep(0.99955, 0.99982, c);
      float halo = pow(c, 420.0) * 0.6 + pow(c, 34.0) * 0.13;
      col += uOrbCol[i] * (disc * 1.4 + halo) * uOn[i];
    }

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rad = (deg: number) => (deg * Math.PI) / 180;

export function SkyAndLight({ seats, lowQuality }: { seats: SeatSky[]; lowQuality: boolean }) {
  const dome = useRef<THREE.Mesh>(null!);

  const uniforms = useMemo(
    () => ({
      uTop: { value: [0, 1, 2, 3].map(() => new THREE.Color()) },
      uHor: { value: [0, 1, 2, 3].map(() => new THREE.Color()) },
      uDir: { value: [0, 1, 2, 3].map(() => new THREE.Vector2(1, 0)) },
      uOn: { value: [0, 0, 0, 0] },
      uNight: { value: [0, 0, 0, 0] },
      uOrb: { value: [0, 1, 2, 3].map(() => new THREE.Vector3(0, 1, 0)) },
      uOrbCol: { value: [0, 1, 2, 3].map(() => new THREE.Color()) },
      uTime: { value: 0 },
      uDrop: { value: 0.3 },
    }),
    [],
  );

  const rig = useMemo(() => {
    return seats.map(({ color, sky }) => {
      const c = YARD_CENTER[color];
      const flat = new THREE.Vector2(c[0], c[2]).normalize();
      // Kept low on purpose: an honest noon sun would sit out of frame, and the
      // point is to see whose sun (or moon) it is. Colour carries the hour.
      const orbEl = rad(lerp(2.5, 12.5, sky.elevation));
      const lightEl = rad(lerp(27, 64, sky.elevation));
      return {
        color,
        sky,
        flat,
        orb: new THREE.Vector3(Math.cos(orbEl) * flat.x, Math.sin(orbEl), Math.cos(orbEl) * flat.y),
        lightPos: new THREE.Vector3(Math.cos(lightEl) * flat.x, Math.sin(lightEl), Math.cos(lightEl) * flat.y).multiplyScalar(42),
        lightColor: new THREE.Color().setRGB(...sky.light.color, THREE.SRGBColorSpace),
      };
    });
  }, [seats]);

  useEffect(() => {
    for (let i = 0; i < 4; i++) {
      const r = rig[i];
      uniforms.uOn.value[i] = r ? 1 : 0;
      if (!r) continue;
      uniforms.uTop.value[i].setRGB(...r.sky.top, THREE.SRGBColorSpace);
      uniforms.uHor.value[i].setRGB(...r.sky.horizon, THREE.SRGBColorSpace);
      uniforms.uDir.value[i].copy(r.flat);
      uniforms.uNight.value[i] = r.sky.night;
      uniforms.uOrb.value[i].copy(r.orb);
      if (r.sky.isDay) uniforms.uOrbCol.value[i].setRGB(1.0, 0.9, 0.7).multiplyScalar(1.5);
      else uniforms.uOrbCol.value[i].setRGB(0.8, 0.87, 1.0);
    }
  }, [rig, uniforms]);

  const edge = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, clock }, dt) => {
    dome.current.position.copy(camera.position);
    uniforms.uTime.value = clock.elapsedTime;
    // find how far below eye level the table's far edge appears, and put the
    // horizon there; eased, so camera moves never make the sky jump
    camera.getWorldDirection(edge);
    edge.y = 0;
    if (edge.lengthSq() > 1e-4) {
      edge.normalize().multiplyScalar(15.6).setY(-0.7).sub(camera.position).normalize();
      const want = THREE.MathUtils.clamp(-edge.y - 0.015, 0, 0.92);
      uniforms.uDrop.value += (want - uniforms.uDrop.value) * Math.min(1, dt * 3);
    }
  });

  const keyIndex = rig.reduce((best, r, i) => (r.sky.light.intensity > (rig[best]?.sky.light.intensity ?? -1) ? i : best), 0);
  const avgNight = rig.length ? rig.reduce((n, r) => n + r.sky.night, 0) / rig.length : 0;
  const hemi = useMemo(() => {
    const c = new THREE.Color(0, 0, 0);
    for (const r of rig) c.add(new THREE.Color().setRGB(...r.sky.horizon, THREE.SRGBColorSpace));
    if (rig.length) c.multiplyScalar(1 / rig.length);
    return c.lerp(new THREE.Color("#ffffff"), 0.35);
  }, [rig]);
  const shadowSize = lowQuality ? 1024 : 2048;

  return (
    <>
      <mesh ref={dome} renderOrder={-10} frustumCulled={false}>
        <sphereGeometry args={[320, 48, 32]} />
        <shaderMaterial
          vertexShader={VERT}
          fragmentShader={FRAG}
          uniforms={uniforms}
          side={THREE.BackSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      <hemisphereLight args={[hemi, "#3b2a1c", 0.32 + avgNight * 0.18]} />
      {/* the lamp over the table: keeps the board readable under any sky */}
      <directionalLight position={[3, 22, 5]} intensity={0.22 + avgNight * 0.5} color="#ffe7c6" />

      {rig.map((r, i) => (
        <directionalLight
          key={r.color}
          position={r.lightPos}
          color={r.lightColor}
          intensity={r.sky.light.intensity}
          castShadow={i === keyIndex}
          shadow-mapSize={[shadowSize, shadowSize]}
          shadow-camera-left={-13}
          shadow-camera-right={13}
          shadow-camera-top={13}
          shadow-camera-bottom={-13}
          shadow-camera-near={5}
          shadow-camera-far={90}
          shadow-bias={-0.0004}
          shadow-normalBias={0.03}
        />
      ))}

      {/* after dark, a lantern burns over that player's yard */}
      {rig.map((r) =>
        r.sky.night > 0.35 ? (
          <pointLight
            key={`lantern-${r.color}`}
            position={[YARD_CENTER[r.color][0], 2.8, YARD_CENTER[r.color][2]]}
            color="#ffc681"
            intensity={r.sky.night * 7}
            distance={9}
            decay={1.6}
          />
        ) : null,
      )}
    </>
  );
}
