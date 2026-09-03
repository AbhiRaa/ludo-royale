import { Color } from "@/lib/ludo/types";
import { BRASS_HI, PALETTE } from "@/lib/ludo/render";

/** Top-down view of a lacquered pawn: domed, glossy, brass-rimmed. */
export function TokenPiece({ color, crowned = false }: { color: Color; crowned?: boolean }) {
  const p = PALETTE[color];
  const gid = `tok-${color}`;
  return (
    <svg viewBox="0 0 38 38" width="38" height="38" style={{ display: "block", overflow: "visible" }}>
      <defs>
        <radialGradient id={gid} cx="0.34" cy="0.28" r="0.92">
          <stop offset="0%" stopColor={p.light} />
          <stop offset="38%" stopColor={p.base} />
          <stop offset="100%" stopColor={p.dark} />
        </radialGradient>
      </defs>
      <ellipse cx="19" cy="21.5" rx="15.5" ry="14.5" fill={p.deep} opacity="0.85" />
      <circle cx="19" cy="18.4" r="15" fill={`url(#${gid})`} />
      <circle cx="19" cy="18.4" r="15" fill="none" stroke={BRASS_HI} strokeWidth="1.1" strokeOpacity="0.55" />
      <circle cx="19" cy="17.2" r="8.6" fill={p.light} opacity="0.26" />
      <circle cx="19" cy="17.2" r="8.6" fill="none" stroke={p.deep} strokeWidth="0.8" strokeOpacity="0.35" />
      <ellipse cx="14.4" cy="12.4" rx="5.4" ry="3.4" fill="#FFFFFF" opacity="0.5" transform="rotate(-28 14.4 12.4)" />
      <path d="M 7 24 A 13 13 0 0 0 31 24" fill="none" stroke={p.deep} strokeWidth="2" strokeOpacity="0.32" strokeLinecap="round" />
      {crowned && (
        <g transform="translate(19 6.5)">
          <path d="M -5 3 L -5 -2 L -2.4 0.6 L 0 -3.4 L 2.4 0.6 L 5 -2 L 5 3 Z" fill={BRASS_HI} stroke="#8A6E17" strokeWidth="0.6" />
        </g>
      )}
    </svg>
  );
}
