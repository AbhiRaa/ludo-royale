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

export type Seat = {
  color: Color;
  playerId: string | null;
  name: string | null;
};

export type ChatMessage = {
  id: string;
  color: Color | null;
  name: string;
  text: string;
  at: number;
};

export type Capture = { color: Color; token: number; from: number };

/** Describes the last mutation so the client can choreograph its animation. */
export type GameEvent =
  | {
      type: "roll";
      color: Color;
      value: number;
      /** no legal move followed, the turn moved on */
      blocked: boolean;
      reason?: "no-moves" | "three-sixes";
      nonce: number;
    }
  | {
      type: "move";
      color: Color;
      token: number;
      from: number;
      to: number;
      dice: number;
      captured: Capture[];
      finished: boolean;
      extraTurn: boolean;
      nonce: number;
    }
  | { type: "join"; color: Color; name: string; nonce: number }
  | { type: "start"; nonce: number }
  | { type: "win"; color: Color; nonce: number }
  | { type: "rematch"; nonce: number };

export type GameStatus = "lobby" | "playing" | "finished";

export type GameState = {
  id: string;
  createdAt: number;
  status: GameStatus;
  maxPlayers: number;
  seats: Seat[];
  /** index into `seats` */
  turn: number;
  /** value shown on the die; null before the first roll of a game */
  dice: number | null;
  /** true once the current player has rolled and still owes a move */
  awaitingMove: boolean;
  /** token indices the current player may legally move with `dice` */
  legalMoves: number[];
  consecutiveSixes: number;
  tokens: Record<Color, number[]>;
  /** finishing order, first entry is the winner */
  ranking: Color[];
  lastEvent: GameEvent | null;
  /** de-duplicates a retried request so a dropped response cannot re-roll */
  lastActionId: string | null;
  chat: ChatMessage[];
  version: number;
  /** monotonic; gives every event a stable identity for the client queue */
  nonce: number;
};

export type PublicSeat = {
  color: Color;
  name: string | null;
  taken: boolean;
  online: boolean;
  you: boolean;
};

export type ClientState = Omit<GameState, "seats"> & {
  seats: PublicSeat[];
  yourColor: Color | null;
  yourSeat: number | null;
};

/** A presence key is refreshed on this cadence and expires after the TTL. */
export const PRESENCE_REFRESH_MS = 7_000;
export const PRESENCE_TTL_SECONDS = 18;
