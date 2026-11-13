"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { CameraControls } from "@react-three/drei";
import CameraControlsImpl from "camera-controls";
import * as THREE from "three";
import type { Color, GameEvent } from "@/lib/ludo/types";
import { SEAT_AZIMUTH, posWorld } from "@/lib/ludo/world";
import { SLOW_HOP_MS, moveTimeline } from "@/lib/ludo/timeline";

const ACTION = CameraControlsImpl.ACTION;

const probe = new THREE.PerspectiveCamera();
const corner = new THREE.Vector3();
/** Everything that has to stay in shot: the slab's corners, at pawn height too. */
const KEEP: [number, number, number][] = [-1, 1].flatMap((x) =>
  [-1, 1].flatMap((z) => [0, 1.3].map((y) => [x * 8.4, y, z * 8.4] as [number, number, number])),
);

/**
 * Where the camera sits when nothing is happening: behind your own corner,
 * aimed a little above the board so the far horizon — the other player's sky —
 * is in the shot. Distance is solved, not guessed: back off until every corner
 * of the board lands inside the part of the frame the HUD leaves free.
 */
function homePose(seat: Color | null, aspect: number) {
  const portrait = aspect < 0.95;
  const fov = portrait ? 44 : 42;
  // On a tall screen a diamond wastes width, so square the board up instead.
  const az = seat ? SEAT_AZIMUTH[seat] + (portrait ? Math.PI / 4 : 0) : 0;
  const polar = portrait ? 0.66 : 1.1;
  const targetY = portrait ? 0 : 2.5;
  const box = portrait ? { x: 0.95, top: 0.62, bottom: -0.5 } : { x: 0.93, top: 0.42, bottom: -0.92 };

  probe.fov = fov;
  probe.aspect = aspect;
  probe.updateProjectionMatrix();
  let dist = 16;
  for (; dist < 140; dist += 0.5) {
    probe.position.set(
      dist * Math.sin(polar) * Math.sin(az),
      targetY + dist * Math.cos(polar),
      dist * Math.sin(polar) * Math.cos(az),
    );
    probe.lookAt(0, targetY, 0);
    probe.updateMatrixWorld();
    const fits = KEEP.every((k) => {
      corner.set(k[0], k[1], k[2]).project(probe);
      return Math.abs(corner.x) <= box.x && corner.y <= box.top && corner.y >= box.bottom;
    });
    if (fits) break;
  }
  return { az, polar, dist, fov, targetY, portrait };
}

/** Same bearing, but reached the short way round from where we are now. */
const nearest = (target: number, current: number) =>
  current + THREE.MathUtils.euclideanModulo(target - current + Math.PI, Math.PI * 2) - Math.PI;

export function Director({
  seat,
  cue,
  cinematic,
  winner,
  resetKey,
}: {
  seat: Color | null;
  cue: GameEvent | null;
  cinematic: boolean;
  winner: Color | null;
  /** bump to send the camera back to its home pose */
  resetKey: number;
}) {
  const controls = useRef<CameraControlsImpl>(null);
  const size = useThree((s) => s.size);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const aspect = size.width / Math.max(1, size.height);
  const busy = useRef(false);
  const saved = useRef({ pos: new THREE.Vector3(), target: new THREE.Vector3(), has: false });
  const opened = useRef(false);

  const goHome = (transition: boolean, smooth = 0.6) => {
    const c = controls.current;
    if (!c) return;
    const pose = homePose(seat, aspect);
    if (camera.fov !== pose.fov) {
      camera.fov = pose.fov;
      camera.updateProjectionMatrix();
    }
    c.smoothTime = smooth;
    void c.setFocalOffset(0, 0, 0, transition);
    void c.setTarget(0, pose.targetY, 0, transition);
    void c.rotateTo(nearest(pose.az, c.azimuthAngle), pose.polar, transition);
    void c.dollyTo(pose.dist, transition);
  };

  // settle into the seat; the very first time, sweep in from above
  useEffect(() => {
    const c = controls.current;
    if (!c || busy.current) return;
    if (!opened.current) {
      opened.current = true;
      const pose = homePose(seat, aspect);
      void c.setTarget(0, pose.targetY, 0, false);
      void c.rotateTo(pose.az + 0.9, 0.22, false);
      void c.dollyTo(pose.dist * 1.55, false);
      goHome(true, 1.1);
    } else goHome(true, 0.7);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seat, aspect > 0.95, resetKey]);

  // re-fit when the window changes shape, without stealing the user's angle
  useEffect(() => {
    const c = controls.current;
    if (!c || busy.current || !opened.current) return;
    void c.dollyTo(homePose(seat, aspect).dist, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Math.round(aspect * 20)]);

  // ---- shots ----------------------------------------------------------
  useEffect(() => {
    const c = controls.current;
    if (!c || !cue) return;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const hold = () => {
      if (!saved.current.has) {
        c.getPosition(saved.current.pos);
        c.getTarget(saved.current.target);
        saved.current.has = true;
      }
      busy.current = true;
      c.enabled = false;
    };
    const release = (smooth = 0.75) => {
      if (!saved.current.has) return;
      const { pos, target } = saved.current;
      saved.current.has = false;
      c.smoothTime = smooth;
      void c.setLookAt(pos.x, pos.y, pos.z, target.x, target.y, target.z, true);
      c.enabled = true;
      busy.current = false;
    };

    if (cue.type === "start" && cinematic) {
      // establishing shot: a slow descent onto the table
      const pose = homePose(seat, aspect);
      busy.current = true;
      void c.rotateTo(nearest(pose.az, c.azimuthAngle) - 1.5, 0.3, false);
      void c.dollyTo(pose.dist * 1.7, false);
      c.smoothTime = 1.5;
      timers.push(setTimeout(() => { busy.current = false; goHome(true, 1.5); }, 60));
    }

    if (cue.type === "move" && cinematic) {
      const tl = moveTimeline(cue, true);
      if (tl.dramatic) {
        // push in on the square where it is about to happen, from wherever
        // the player was already looking — a cut that never disorients
        const [tx, , tz] = posWorld(cue.color, cue.to, cue.token);
        timers.push(
          setTimeout(() => {
            hold();
            const here = c.getPosition(new THREE.Vector3());
            const dir = new THREE.Vector3(here.x - tx, 0, here.z - tz).normalize();
            dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.5);
            c.smoothTime = 0.32;
            void c.setLookAt(tx + dir.x * 7.2, 3.3, tz + dir.z * 7.2, tx, 0.45, tz, true);
          }, Math.max(0, tl.arrive - SLOW_HOP_MS - 160)),
        );
        timers.push(
          setTimeout(() => release(0.8), tl.arrive + (cue.bounced ? 700 : 1000)),
        );
      } else if (cue.finished) {
        timers.push(
          setTimeout(() => {
            hold();
            c.smoothTime = 0.45;
            void c.dollyTo(c.distance * 0.72, true);
          }, Math.max(0, tl.arrive - 250)),
        );
        timers.push(setTimeout(() => release(0.8), tl.arrive + 650));
      }
    }

    return () => {
      timers.forEach(clearTimeout);
      // a cue cut short must never leave the camera stranded or input disabled
      if (saved.current.has) release(0.5);
      busy.current = false;
      c.enabled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cue?.seq, cinematic]);

  // the winner gets a slow lap of honour
  useFrame((_, dt) => {
    const c = controls.current;
    if (c && winner && !busy.current) void c.rotate(dt * 0.12, 0, false);
  });

  return (
    <CameraControls
      ref={controls}
      makeDefault
      minPolarAngle={0.12}
      maxPolarAngle={1.32}
      minDistance={6}
      maxDistance={95}
      smoothTime={0.6}
      draggingSmoothTime={0.14}
      mouseButtons={{ left: ACTION.ROTATE, middle: ACTION.NONE, right: ACTION.NONE, wheel: ACTION.DOLLY }}
      touches={{ one: ACTION.TOUCH_ROTATE, two: ACTION.TOUCH_DOLLY, three: ACTION.NONE }}
    />
  );
}
