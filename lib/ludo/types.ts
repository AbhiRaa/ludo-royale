export const COLORS = ["red", "green", "yellow", "blue"] as const;
export type Color = (typeof COLORS)[number];

/**
 * Token position is a *relative* progress value per colour:
 *   -1        -> still in the yard
 *   0 .. 50   -> on the shared 52-cell ring (absolute idx = (start + pos) % 52)
 *   51 .. 55  -> that colour's private home column (5 cells)
 *   56        -> HOME (finished)
 */
export const YARD = -1;
export const HOME = 56;
export const LAST_RING_POS = 50;
export const TOKENS_PER_PLAYER = 4;

/**
 * classic — the rules everyone knows.
 * royale  — The Court: each pawn is a character, and bad luck earns Fate.
 */
export type Mode = "classic" | "royale";

/** In royale, a pawn's index is its role. Same four for every player. */
export const ROLES = ["guard", "hunter", "courier", "jester"] as const;
export type Role = (typeof ROLES)[number];

export const FATE_MAX = 3;
export const FATE_START = 1;
export const LOG_LIMIT = 14;
export const REACTIONS = ["❤️", "😂", "😭", "😤", "👏", "🔥"] as const;
export const WAGER_MAX = 120;

/** A player's clock, so each side of the board can wear its own sky. */
export type Zone = {
  /** IANA name, e.g. "Europe/London" */
  tz: string;
  /** minutes east of UTC */
  offsetMin: number;
};

export type Seat = {
  color: Color;
  playerId: string | null;
  name: string | null;
  zone: Zone | null;
};

export type ChatMessage = {
  id: string;
  color: Color | null;
  name: string;
  text: string;
  at: number;
};

export type Capture = { color: Color; token: number; from: number };

export type MoveKind = "enter" | "step" | "back";
export type MoveOption = { token: number; to: number; kind: MoveKind };

export type GameStatus = "lobby" | "playing" | "finished";

/** Everything the board needs to draw one instant of the game. */
export type Snap = {
  tokens: Record<Color, number[]>;
  turn: number;
  fate: Record<Color, number>;
  shield: Record<Color, boolean>;
  dice: number | null;
  awaitingMove: boolean;
  status: GameStatus;
};

export type EventBody =
  | {
      type: "roll";
      color: Color;
      value: number;
      /** the turn ended right here: nothing could move */
      blocked: boolean;
      reason?: "no-moves" | "three-sixes";
      /** nothing moves at the natural value, but Fate could still change that */
      stuck: boolean;
    }
  | {
      type: "move";
      color: Color;
      token: number;
      from: number;
      /** the square aimed at */
      to: number;
      /** where the pawn actually ended up (== from when a shield bounced it) */
      landed: number;
      kind: MoveKind;
      /** the natural throw */
      dice: number;
      /** the value played after any Fate nudge */
      value: number;
      nudge: number;
      captured: Capture[];
      bounced: boolean;
      shieldBroken: Color[];
      star: boolean;
      finished: boolean;
      extraTurn: boolean;
    }
  | { type: "pass"; color: Color }
  | { type: "join"; color: Color; name: string }
  | { type: "start" }
  | { type: "win"; color: Color }
  | { type: "rematch" }
  | { type: "wager"; color: Color }
  | { type: "react"; color: Color; emoji: string };

/**
 * Every event carries the board as it stood right after it. The client plays
 * events strictly in order and shows `after` when each one lands, so it never
 * has to re-derive rules and can never drift from the server.
 */
export type GameEvent = EventBody & { seq: number; after: Snap };

export type PlayerStats = {
  rolls: number;
  sixes: number;
  captures: number;
  lost: number;
  /** captures this player's Guard turned away */
  blocks: number;
  fateSpent: number;
  fateGained: number;
  squares: number;
  /** captures made by each pawn, for the match report's MVP */
  byToken: number[];
};

export type GameState = {
  id: string;
  createdAt: number;
  status: GameStatus;
  mode: Mode;
  maxPlayers: number;
  seats: Seat[];
  /** index into `seats` */
  turn: number;
  /** value shown on the die; null before the first roll of a game */
  dice: number | null;
  /** identifies *which throw* is on the table; bumped only by roll() */
  diceNonce: number;
  /** true once the current player has rolled and still owes a move */
  awaitingMove: boolean;
  /** what the current player may do at the natural die value */
  legalMoves: MoveOption[];
  consecutiveSixes: number;
  tokens: Record<Color, number[]>;
  fate: Record<Color, number>;
  /** whether each colour's Guard still carries its shield */
  shield: Record<Color, boolean>;
  /** finishing order, first entry is the winner */
  ranking: Color[];
  /** the most recent events, oldest first */
  log: GameEvent[];
  stats: Record<Color, PlayerStats>;
  /** "if I win, you owe me…" — hidden from the other side until the end */
  wagers: Record<Color, string | null>;
  /** de-duplicates a retried request so a dropped response cannot re-roll */
  lastActionId: string | null;
  chat: ChatMessage[];
  version: number;
  /** monotonic; equals the seq of the newest event */
  nonce: number;
};

export type PublicSeat = {
  color: Color;
  name: string | null;
  taken: boolean;
  online: boolean;
  you: boolean;
  zone: Zone | null;
};

export type ClientState = Omit<GameState, "seats" | "wagers"> & {
  seats: PublicSeat[];
  yourColor: Color | null;
  yourSeat: number | null;
  yourWager: string | null;
  /** who has sealed a wager — never what it says */
  wagerSet: Record<Color, boolean>;
  wagerLocked: boolean;
  /** every wager, revealed only once the game is over */
  stakes: { color: Color; text: string }[] | null;
};

/** A presence key is refreshed on this cadence and expires after the TTL. */
export const PRESENCE_REFRESH_MS = 7_000;
export const PRESENCE_TTL_SECONDS = 18;
