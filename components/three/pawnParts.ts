import * as THREE from "three";
import type { Color, Role } from "@/lib/ludo/types";
import { PALETTE } from "@/lib/ludo/render";

/**
 * Every pawn is turned on a lathe from a profile, then given the one feature
 * that tells you who it is from across the table: the Guard's battlements,
 * the Hunter's spearhead, the Courier's halo, the Jester's belled cap.
 */
export type Part = {
  geo: THREE.BufferGeometry;
  mat: "body" | "brass";
  pos?: [number, number, number];
  rot?: [number, number, number];
};

type Profile = [number, number][];
const lathe = (pts: Profile) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 32);

const FOOT: Profile = [[0, 0], [0.36, 0], [0.385, 0.03], [0.36, 0.085], [0.3, 0.115], [0.255, 0.15]];
const BODY: Profile = [...FOOT, [0.19, 0.3], [0.145, 0.5], [0.125, 0.6], [0.205, 0.635], [0.205, 0.668], [0.115, 0.7], [0, 0.7]];

function build(role: Role | null): Part[] {
  switch (role) {
    case "guard": {
      const tower = lathe([
        [0, 0], [0.41, 0], [0.435, 0.03], [0.41, 0.09], [0.335, 0.125], [0.285, 0.2], [0.255, 0.5],
        [0.275, 0.6], [0.335, 0.645], [0.335, 0.8], [0.265, 0.8], [0.265, 0.725], [0, 0.725],
      ]);
      const merlon = new THREE.BoxGeometry(0.12, 0.1, 0.075);
      const parts: Part[] = [
        { geo: tower, mat: "body" },
        { geo: new THREE.TorusGeometry(0.262, 0.022, 10, 40), mat: "brass", pos: [0, 0.5, 0], rot: [Math.PI / 2, 0, 0] },
      ];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        parts.push({ geo: merlon, mat: "body", pos: [Math.sin(a) * 0.3, 0.85, Math.cos(a) * 0.3], rot: [0, a, 0] });
      }
      return parts;
    }
    case "hunter":
      return [
        { geo: lathe([...FOOT, [0.18, 0.3], [0.125, 0.56], [0.105, 0.74], [0.185, 0.775], [0.185, 0.805], [0.1, 0.84], [0, 0.84]]), mat: "body" },
        { geo: new THREE.ConeGeometry(0.15, 0.52, 24), mat: "brass", pos: [0, 1.1, 0] },
      ];
    case "courier":
      return [
        {
          geo: lathe([
            [0, 0], [0.32, 0], [0.345, 0.03], [0.32, 0.08], [0.265, 0.11], [0.225, 0.15], [0.165, 0.28],
            [0.12, 0.52], [0.1, 0.63], [0.17, 0.66], [0.17, 0.69], [0.095, 0.72], [0, 0.72],
          ]),
          mat: "body",
        },
        { geo: new THREE.SphereGeometry(0.16, 28, 20), mat: "body", pos: [0, 0.87, 0] },
        { geo: new THREE.TorusGeometry(0.28, 0.022, 10, 44), mat: "brass", pos: [0, 0.88, 0], rot: [1.05, 0, 0.35] },
      ];
    case "jester": {
      const lean = 0.72;
      const horn = new THREE.ConeGeometry(0.062, 0.3, 14);
      const bell = new THREE.SphereGeometry(0.06, 14, 10);
      const parts: Part[] = [
        { geo: lathe(BODY), mat: "body" },
        { geo: new THREE.SphereGeometry(0.17, 28, 20), mat: "body", pos: [0, 0.85, 0] },
      ];
      for (const side of [-1, 1]) {
        parts.push({ geo: horn, mat: "body", pos: [side * Math.sin(lean) * 0.29, 0.85 + Math.cos(lean) * 0.29, 0], rot: [0, 0, -side * lean] });
        parts.push({ geo: bell, mat: "brass", pos: [side * Math.sin(lean) * 0.46, 0.85 + Math.cos(lean) * 0.46, 0] });
      }
      return parts;
    }
    default:
      return [
        { geo: lathe(BODY), mat: "body" },
        { geo: new THREE.SphereGeometry(0.185, 28, 20), mat: "body", pos: [0, 0.86, 0] },
      ];
  }
}

const partCache = new Map<string, Part[]>();
export function pawnParts(role: Role | null): Part[] {
  const key = role ?? "pawn";
  let parts = partCache.get(key);
  if (!parts) partCache.set(key, (parts = build(role)));
  return parts;
}

const bodyCache = new Map<Color, THREE.MeshPhysicalMaterial>();
export function bodyMaterial(color: Color): THREE.MeshPhysicalMaterial {
  let m = bodyCache.get(color);
  if (!m) {
    m = new THREE.MeshPhysicalMaterial({
      color: PALETTE[color].base,
      roughness: 0.3,
      clearcoat: 1,
      clearcoatRoughness: 0.18,
      sheen: 0.4,
      sheenColor: new THREE.Color(PALETTE[color].light),
    });
    bodyCache.set(color, m);
  }
  return m;
}

export const brassMaterial = new THREE.MeshStandardMaterial({ color: "#d8b24c", metalness: 1, roughness: 0.26 });
