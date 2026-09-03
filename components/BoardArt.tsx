import { memo } from "react";
import { COLORS, Color } from "@/lib/ludo/types";
import {
  HOME_COLUMN,
  RING,
  STAR_RING,
  START_INDEX,
  YARD_BOX,
  YARD_SLOTS,
} from "@/lib/ludo/board";
import { BOARD, BRASS, BRASS_HI, CELL, IVORY, LACQUER, PALETTE, cellXY } from "@/lib/ludo/render";

const startColorAt = (idx: number): Color | null =>
  COLORS.find((c) => START_INDEX[c] === idx) ?? null;

function Star({ x, y }: { x: number; y: number }) {
  const r = 13;
  const pts = Array.from({ length: 10 }, (_, i) => {
    const rad = i % 2 === 0 ? r : r * 0.42;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    return `${(x + Math.cos(a) * rad).toFixed(2)},${(y + Math.sin(a) * rad).toFixed(2)}`;
  }).join(" ");
  return <polygon points={pts} fill={BRASS} opacity={0.45} stroke={BRASS_HI} strokeWidth={0.6} strokeOpacity={0.5} />;
}

/** Chevron on an entry square, pointing the way that colour travels. */
function Chevron({ idx, color }: { idx: number; color: Color }) {
  const a = RING[idx];
  const b = RING[(idx + 1) % RING.length];
  const dx = Math.sign(b.col - a.col);
  const dy = Math.sign(b.row - a.row);
  const { x, y } = cellXY(a);
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle})`} opacity={0.9}>
      <path d="M -6 -7 L 5 0 L -6 7 Z" fill={PALETTE[color].deep} opacity={0.55} />
      <path d="M -7 -7 L 4 0 L -7 7 Z" fill="#FFF6E2" opacity={0.85} />
    </g>
  );
}

function BoardArtInner() {
  return (
    <svg
      viewBox={`0 0 ${BOARD} ${BOARD}`}
      width={BOARD}
      height={BOARD}
      className="board-shell"
      style={{ borderRadius: 26, display: "block" }}
      aria-hidden
    >
      <defs>
        <linearGradient id="lacquer" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2A201A" />
          <stop offset="45%" stopColor={LACQUER} />
          <stop offset="100%" stopColor="#120D0B" />
        </linearGradient>

        {COLORS.map((c) => (
          <linearGradient key={`yg-${c}`} id={`yard-${c}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={PALETTE[c].base} />
            <stop offset="52%" stopColor={PALETTE[c].dark} />
            <stop offset="100%" stopColor={PALETTE[c].deep} />
          </linearGradient>
        ))}
        {COLORS.map((c) => (
          <linearGradient key={`cg-${c}`} id={`cell-${c}`} x1="0" y1="0" x2="0.6" y2="1">
            <stop offset="0%" stopColor={PALETTE[c].light} />
            <stop offset="42%" stopColor={PALETTE[c].base} />
            <stop offset="100%" stopColor={PALETTE[c].dark} />
          </linearGradient>
        ))}
        {COLORS.map((c) => (
          <linearGradient key={`tg-${c}`} id={`tri-${c}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={PALETTE[c].base} />
            <stop offset="100%" stopColor={PALETTE[c].dark} />
          </linearGradient>
        ))}

        <linearGradient id="ivoryCell" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor="#F8F2E4" />
          <stop offset="60%" stopColor={IVORY} />
          <stop offset="100%" stopColor="#DCCEB4" />
        </linearGradient>

        <radialGradient id="gloss" cx="0.3" cy="0.16" r="0.85">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.14" />
          <stop offset="45%" stopColor="#FFFFFF" stopOpacity="0.03" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.32" />
        </radialGradient>

        <filter id="cellShadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="1" stdDeviation="1.1" floodColor="#000" floodOpacity="0.55" />
        </filter>
        <filter id="padInset" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.6" />
        </filter>
      </defs>

      {/* board body */}
      <rect x="0" y="0" width={BOARD} height={BOARD} rx="26" fill="url(#lacquer)" />

      {/* yards */}
      {COLORS.map((c) => {
        const box = YARD_BOX[c];
        const x = box.col * CELL;
        const y = box.row * CELL;
        const size = 6 * CELL;
        return (
          <g key={`yard-g-${c}`}>
            <rect x={x} y={y} width={size} height={size} fill={`url(#yard-${c})`} />
            <rect
              x={x + 4} y={y + 4} width={size - 8} height={size - 8}
              rx="10" fill="none" stroke={BRASS} strokeOpacity="0.28" strokeWidth="1"
            />
            <rect
              x={x + CELL} y={y + CELL} width={4 * CELL} height={4 * CELL}
              rx="20" fill="url(#ivoryCell)" stroke={BRASS} strokeWidth="2" strokeOpacity="0.75"
              filter="url(#padInset)"
            />
            {YARD_SLOTS[c].map((slot, i) => {
              const p = cellXY(slot);
              return (
                <g key={`slot-${c}-${i}`}>
                  <circle cx={p.x} cy={p.y} r="21" fill={PALETTE[c].deep} opacity="0.16" />
                  <circle cx={p.x} cy={p.y} r="21" fill="none" stroke={PALETTE[c].dark} strokeOpacity="0.5" strokeWidth="1.5" />
                </g>
              );
            })}
          </g>
        );
      })}

      {/* home columns */}
      {COLORS.map((c) =>
        HOME_COLUMN[c].map((cell, i) => (
          <rect
            key={`hc-${c}-${i}`}
            x={cell.col * CELL + 1.5} y={cell.row * CELL + 1.5}
            width={CELL - 3} height={CELL - 3} rx="6"
            fill={`url(#cell-${c})`} stroke={BRASS} strokeOpacity="0.4" strokeWidth="1"
          />
        )),
      )}

      {/* the 52-square ring */}
      {RING.map((cell, idx) => {
        const owner = startColorAt(idx);
        return (
          <rect
            key={`ring-${idx}`}
            x={cell.col * CELL + 1.5} y={cell.row * CELL + 1.5}
            width={CELL - 3} height={CELL - 3} rx="6"
            fill={owner ? `url(#cell-${owner})` : "url(#ivoryCell)"}
            stroke={owner ? BRASS_HI : BRASS}
            strokeOpacity={owner ? 0.75 : 0.32}
            strokeWidth="1"
            filter="url(#cellShadow)"
          />
        );
      })}

      {/* safe stars + entry chevrons */}
      {[...STAR_RING].map((idx) => {
        const p = cellXY(RING[idx]);
        return <Star key={`star-${idx}`} x={p.x} y={p.y} />;
      })}
      {COLORS.map((c) => (
        <Chevron key={`chev-${c}`} idx={START_INDEX[c]} color={c} />
      ))}

      {/* centre: four wedges meeting at the middle */}
      <g>
        <rect x={6 * CELL} y={6 * CELL} width={3 * CELL} height={3 * CELL} fill="#15100D" />
        <path d={`M ${6 * CELL} ${6 * CELL} L ${6 * CELL} ${9 * CELL} L 360 360 Z`} fill="url(#tri-red)" />
        <path d={`M ${6 * CELL} ${6 * CELL} L ${9 * CELL} ${6 * CELL} L 360 360 Z`} fill="url(#tri-green)" />
        <path d={`M ${9 * CELL} ${6 * CELL} L ${9 * CELL} ${9 * CELL} L 360 360 Z`} fill="url(#tri-yellow)" />
        <path d={`M ${6 * CELL} ${9 * CELL} L ${9 * CELL} ${9 * CELL} L 360 360 Z`} fill="url(#tri-blue)" />
        <rect
          x={6 * CELL} y={6 * CELL} width={3 * CELL} height={3 * CELL}
          fill="none" stroke={BRASS} strokeWidth="2" strokeOpacity="0.8"
        />
        <circle cx="360" cy="360" r="9" fill="#15100D" stroke={BRASS_HI} strokeWidth="1.5" strokeOpacity="0.9" />
        <circle cx="360" cy="360" r="3" fill={BRASS_HI} opacity="0.9" />
      </g>

      {/* brass inlay border + glass gloss */}
      <rect x="3" y="3" width={BOARD - 6} height={BOARD - 6} rx="24" fill="none" stroke={BRASS} strokeOpacity="0.5" strokeWidth="1.5" />
      <rect x="9" y="9" width={BOARD - 18} height={BOARD - 18} rx="19" fill="none" stroke={BRASS_HI} strokeOpacity="0.14" strokeWidth="1" />
      <rect x="0" y="0" width={BOARD} height={BOARD} rx="26" fill="url(#gloss)" pointerEvents="none" />
    </svg>
  );
}

export const BoardArt = memo(BoardArtInner);
