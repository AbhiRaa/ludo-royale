import { Role } from "./types";

export const ROLE_INFO: Record<Role, { name: string; tag: string; rule: string }> = {
  guard: {
    name: "Guard",
    tag: "Shielded",
    rule: "Carries a shield. The first pawn that tries to capture it is thrown back instead. The shield returns when the Guard is next sent home.",
  },
  hunter: {
    name: "Hunter",
    tag: "Strikes on stars",
    rule: "Captures even on star squares, where everyone else is safe. Entry squares remain sanctuary.",
  },
  courier: {
    name: "Courier",
    tag: "One step further",
    rule: "Always runs one square more than the die shows while it is out on the track.",
  },
  jester: {
    name: "Jester",
    tag: "Strikes backward",
    rule: "May step backward to capture a pawn standing exactly the thrown distance behind it.",
  },
};
