import type { Role } from "@/lib/ludo/types";

const PATHS: Record<Role | "pawn", string> = {
  // a shield
  guard: "M8 1.5 13.5 3.6v4.1c0 3.2-2.2 5.7-5.5 6.8C4.7 13.4 2.5 10.9 2.5 7.7V3.6Z",
  // a spearhead
  hunter: "M8 1 11.6 8.2H9.1V15H6.9V8.2H4.4Z",
  // two chevrons: speed
  courier: "M2.5 3.2 7 8l-4.5 4.8h2.7L9.7 8 5.2 3.2Zm5.3 0L12.3 8l-4.5 4.8h2.7L15 8l-4.5-4.8Z",
  // a two-horned cap
  jester: "M3.2 14v-3.4C3.2 8 2.4 5.6.8 3.6c2.6-.4 5 .8 7.2 3.6 2.2-2.8 4.6-4 7.2-3.6-1.6 2-2.4 4.4-2.4 7V14Z",
  pawn: "M8 1.6a2.7 2.7 0 0 1 1.9 4.6c1 .9 1.7 2.4 2 4.6h1.3V14H2.8v-3.2h1.3c.3-2.2 1-3.7 2-4.6A2.7 2.7 0 0 1 8 1.6Z",
};

export function RoleGlyph({ role, size = 14, color = "currentColor" }: { role: Role | null; size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden style={{ display: "block", flex: "none" }}>
      <path d={PATHS[role ?? "pawn"]} fill={color} />
    </svg>
  );
}

export function FateGem({ on, size = 11 }: { on: boolean; size?: number }) {
  return (
    <svg viewBox="0 0 12 12" width={size} height={size} aria-hidden style={{ display: "block" }}>
      <path
        d="M6 .8 11.2 6 6 11.2.8 6Z"
        fill={on ? "#F3DE9B" : "none"}
        stroke={on ? "#FFF3C9" : "rgba(243,222,155,.4)"}
        strokeWidth="1"
        style={on ? { filter: "drop-shadow(0 0 4px rgba(243,222,155,.9))" } : undefined}
      />
    </svg>
  );
}

const PIPS: Record<number, number[]> = {
  1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
};

/** A flat read-out of the die, for confirmation at a glance. */
export function DieFace({ value, size = 46 }: { value: number | null; size?: number }) {
  const on = new Set(value ? PIPS[value] : []);
  return (
    <div className="dieface" style={{ width: size, height: size }} aria-label={value ? `Die shows ${value}` : "Die not thrown"}>
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i}>{on.has(i) ? <i /> : null}</span>
      ))}
    </div>
  );
}
