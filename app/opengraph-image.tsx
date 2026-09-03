import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Ludo Royale — a lacquered Ludo board for two time zones";

const SEATS = [
  { c: "#D6412F", l: "#FF7A66" },
  { c: "#2E9E7B", l: "#63D8B0" },
  { c: "#EFA00B", l: "#FFD26B" },
  { c: "#3B6FD4", l: "#7FA9F5" },
];

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex",
          flexDirection: "column", alignItems: "center", justifyContent: "center",
          background:
            "radial-gradient(120% 90% at 50% 0%, #2A201A 0%, #17110E 45%, #0B0807 100%)",
          color: "#F2EAD9",
        }}
      >
        <div style={{ display: "flex", gap: 26, marginBottom: 40 }}>
          {SEATS.map((s) => (
            <div
              key={s.c}
              style={{
                width: 86, height: 86, borderRadius: 999,
                background: `linear-gradient(150deg, ${s.l}, ${s.c} 55%, #000)`,
                border: "3px solid rgba(243,222,155,.55)",
                display: "flex",
              }}
            />
          ))}
        </div>
        <div style={{ fontSize: 116, fontWeight: 700, letterSpacing: -3, color: "#F3DE9B", display: "flex" }}>
          Ludo Royale
        </div>
        <div style={{ fontSize: 34, color: "#A8977C", marginTop: 18, display: "flex" }}>
          One lacquered board. Two time zones.
        </div>
      </div>
    ),
    size,
  );
}
