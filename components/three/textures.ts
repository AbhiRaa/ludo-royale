import * as THREE from "three";
import { COLORS, Color } from "@/lib/ludo/types";
import { HOME_COLUMN, RING, STAR_RING, START_INDEX, YARD_BOX, YARD_SLOTS } from "@/lib/ludo/board";
import { BRASS, BRASS_HI, PALETTE } from "@/lib/ludo/render";

/** World units the board texture spans: the 15-square board plus a lacquer rim. */
export const TEX_SPAN = 16.2;

function rounded(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

const startColorAt = (idx: number): Color | null => COLORS.find((c) => START_INDEX[c] === idx) ?? null;

/**
 * The board face, painted once onto a canvas: lacquer ground, brass inlay,
 * ivory track, jewel-toned yards. Flat on purpose — the depth comes from the
 * real objects standing on it.
 */
export function boardTexture(size = 2048): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d")!;
  const u = size / TEX_SPAN;
  const o = ((TEX_SPAN - 15) / 2) * u;
  const X = (col: number) => o + col * u;

  // lacquer ground
  const ground = g.createRadialGradient(size * 0.42, size * 0.38, size * 0.1, size / 2, size / 2, size * 0.75);
  ground.addColorStop(0, "#2c2019");
  ground.addColorStop(1, "#130d0a");
  g.fillStyle = ground;
  g.fillRect(0, 0, size, size);

  // brass inlay around the playing field
  g.lineWidth = u * 0.055;
  g.strokeStyle = BRASS;
  rounded(g, o - u * 0.2, o - u * 0.2, 15 * u + u * 0.4, 15 * u + u * 0.4, u * 0.22);
  g.stroke();
  g.lineWidth = u * 0.018;
  g.strokeStyle = BRASS_HI;
  g.globalAlpha = 0.55;
  rounded(g, o - u * 0.36, o - u * 0.36, 15 * u + u * 0.72, 15 * u + u * 0.72, u * 0.3);
  g.stroke();
  g.globalAlpha = 1;

  // yards
  for (const c of COLORS) {
    const box = YARD_BOX[c];
    const x = X(box.col);
    const y = X(box.row);
    const s = 6 * u;
    const pal = PALETTE[c];
    const fill = g.createLinearGradient(x, y, x + s, y + s);
    fill.addColorStop(0, pal.base);
    fill.addColorStop(0.55, pal.dark);
    fill.addColorStop(1, pal.deep);
    g.fillStyle = fill;
    g.fillRect(x, y, s, s);

    g.lineWidth = u * 0.03;
    g.strokeStyle = BRASS;
    g.globalAlpha = 0.45;
    rounded(g, x + u * 0.14, y + u * 0.14, s - u * 0.28, s - u * 0.28, u * 0.2);
    g.stroke();
    g.globalAlpha = 1;

    // ivory pad the pawns rest on
    const pad = g.createLinearGradient(x + u, y + u, x + 5 * u, y + 5 * u);
    pad.addColorStop(0, "#f8f2e4");
    pad.addColorStop(1, "#d9cbb0");
    g.fillStyle = pad;
    g.shadowColor = "rgba(0,0,0,.55)";
    g.shadowBlur = u * 0.25;
    g.shadowOffsetY = u * 0.06;
    rounded(g, x + u, y + u, 4 * u, 4 * u, u * 0.42);
    g.fill();
    g.shadowColor = "transparent";
    g.lineWidth = u * 0.045;
    g.strokeStyle = BRASS;
    g.stroke();

    for (const slot of YARD_SLOTS[c]) {
      const cx = X(slot.col + 0.5);
      const cy = X(slot.row + 0.5);
      g.beginPath();
      g.arc(cx, cy, u * 0.46, 0, Math.PI * 2);
      g.fillStyle = pal.deep;
      g.globalAlpha = 0.16;
      g.fill();
      g.globalAlpha = 0.55;
      g.lineWidth = u * 0.03;
      g.strokeStyle = pal.dark;
      g.stroke();
      g.globalAlpha = 1;
    }
  }

  const tile = (col: number, row: number, owner: Color | null) => {
    const x = X(col) + u * 0.035;
    const y = X(row) + u * 0.035;
    const s = u * 0.93;
    const fill = g.createLinearGradient(x, y, x + s * 0.6, y + s);
    if (owner) {
      fill.addColorStop(0, PALETTE[owner].light);
      fill.addColorStop(0.42, PALETTE[owner].base);
      fill.addColorStop(1, PALETTE[owner].dark);
    } else {
      fill.addColorStop(0, "#f9f3e6");
      fill.addColorStop(0.6, "#efe5d2");
      fill.addColorStop(1, "#d8c9ac");
    }
    g.fillStyle = fill;
    g.shadowColor = "rgba(0,0,0,.6)";
    g.shadowBlur = u * 0.07;
    g.shadowOffsetY = u * 0.025;
    rounded(g, x, y, s, s, u * 0.13);
    g.fill();
    g.shadowColor = "transparent";
    g.lineWidth = u * 0.02;
    g.strokeStyle = owner ? BRASS_HI : BRASS;
    g.globalAlpha = owner ? 0.8 : 0.4;
    g.stroke();
    g.globalAlpha = 1;
  };

  for (const c of COLORS) for (const cell of HOME_COLUMN[c]) tile(cell.col, cell.row, c);
  RING.forEach((cell, idx) => tile(cell.col, cell.row, startColorAt(idx)));

  // stars: sanctuary
  for (const idx of STAR_RING) {
    const cx = X(RING[idx].col + 0.5);
    const cy = X(RING[idx].row + 0.5);
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = (i % 2 === 0 ? 0.3 : 0.125) * u;
      const a = (Math.PI / 5) * i - Math.PI / 2;
      g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    g.closePath();
    g.fillStyle = BRASS;
    g.globalAlpha = 0.62;
    g.fill();
    g.globalAlpha = 0.8;
    g.lineWidth = u * 0.014;
    g.strokeStyle = BRASS_HI;
    g.stroke();
    g.globalAlpha = 1;
  }

  // chevrons on entry squares, pointing the way that colour travels
  for (const c of COLORS) {
    const a = RING[START_INDEX[c]];
    const b = RING[(START_INDEX[c] + 1) % RING.length];
    g.save();
    g.translate(X(a.col + 0.5), X(a.row + 0.5));
    g.rotate(Math.atan2(Math.sign(b.row - a.row), Math.sign(b.col - a.col)));
    g.beginPath();
    g.moveTo(-0.16 * u, -0.17 * u);
    g.lineTo(0.1 * u, 0);
    g.lineTo(-0.16 * u, 0.17 * u);
    g.closePath();
    g.fillStyle = "#fff6e2";
    g.globalAlpha = 0.9;
    g.fill();
    g.restore();
  }

  // the centre is covered by the pyramid; give it a dark seat with a brass rim
  g.fillStyle = "#120d0a";
  g.fillRect(X(6), X(6), 3 * u, 3 * u);
  g.lineWidth = u * 0.05;
  g.strokeStyle = BRASS;
  g.strokeRect(X(6), X(6), 3 * u, 3 * u);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Walnut table top: a warm radial falloff with a little grain drawn across it. */
export function tableTexture(size = 1024): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d")!;
  const base = g.createRadialGradient(size / 2, size / 2, size * 0.05, size / 2, size / 2, size * 0.52);
  base.addColorStop(0, "#4a3323");
  base.addColorStop(0.6, "#33221a");
  base.addColorStop(1, "#1b120d");
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);

  // deterministic grain so the table looks the same on both players' screens
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 260; i++) {
    const y = rnd() * size;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= size; x += size / 16) g.lineTo(x, y + Math.sin(x * 0.006 + i) * 9 + (rnd() - 0.5) * 5);
    g.lineWidth = 0.6 + rnd() * 1.8;
    g.strokeStyle = rnd() > 0.5 ? "rgba(0,0,0,.16)" : "rgba(255,214,160,.045)";
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
