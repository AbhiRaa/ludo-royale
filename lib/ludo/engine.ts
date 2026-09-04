import {
  COLORS,
  Color,
  ClientState,
  Capture,
  GameState,
  HOME,
  LAST_RING_POS,
  Seat,
  TOKENS_PER_PLAYER,
  YARD,
} from "./types";
import { isSafeRingIndex, ringIndex } from "./board";
import { rollDie } from "./rng";

export class RuleError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Two players sit diagonally opposite, which is the classic 2P setup. */
export function seatColorsFor(maxPlayers: number): Color[] {
  switch (maxPlayers) {
    case 2:
      return ["red", "yellow"];
    case 3:
      return ["red", "green", "yellow"];
    default:
      return ["red", "green", "yellow", "blue"];
  }
}

export function createGame(id: string, maxPlayers: number): GameState {
  const colors = seatColorsFor(maxPlayers);
  return {
    id,
    createdAt: Date.now(),
    status: "lobby",
    maxPlayers: colors.length,
    seats: colors.map<Seat>((color) => ({ color, playerId: null, name: null })),
    turn: 0,
    dice: null,
    diceNonce: 0,
    awaitingMove: false,
    legalMoves: [],
    consecutiveSixes: 0,
    tokens: Object.fromEntries(
      COLORS.map((c) => [c, Array<number>(TOKENS_PER_PLAYER).fill(YARD)]),
    ) as Record<Color, number[]>,
    ranking: [],
    lastEvent: null,
    lastActionId: null,
    chat: [],
    version: 0,
    nonce: 0,
  };
}

/* ------------------------------------------------------------------ */
/* queries                                                             */
/* ------------------------------------------------------------------ */

export function hasFinished(state: GameState, color: Color): boolean {
  return state.tokens[color].every((p) => p === HOME);
}

export function legalMovesFor(state: GameState, color: Color, dice: number): number[] {
  const out: number[] = [];
  state.tokens[color].forEach((pos, i) => {
    if (pos === HOME) return;
    if (pos === YARD) {
      if (dice === 6) out.push(i);
      return;
    }
    if (pos + dice <= HOME) out.push(i);
  });
  return out;
}

export function seatOf(state: GameState, playerId: string): number {
  return state.seats.findIndex((s) => s.playerId === playerId);
}

function nextSeat(state: GameState, from: number): number {
  const n = state.seats.length;
  for (let step = 1; step <= n; step++) {
    const idx = (from + step) % n;
    const seat = state.seats[idx];
    if (!seat.playerId) continue;
    if (state.ranking.includes(seat.color)) continue;
    return idx;
  }
  return from;
}

function passTurn(state: GameState) {
  state.turn = nextSeat(state, state.turn);
  state.awaitingMove = false;
  state.legalMoves = [];
  state.consecutiveSixes = 0;
}

/* ------------------------------------------------------------------ */
/* mutations — every one returns the same object, mutated in place      */
/* ------------------------------------------------------------------ */

export function join(state: GameState, playerId: string, rawName: string): GameState {
  const name = rawName.trim().slice(0, 18) || "Player";
  const existing = seatOf(state, playerId);
  if (existing >= 0) {
    if (state.seats[existing].name === name) return state;
    state.seats[existing].name = name;
    return state;
  }
  const free = state.seats.findIndex((s) => !s.playerId);
  if (free < 0) throw new RuleError("This room is full.", 409);

  state.seats[free].playerId = playerId;
  state.seats[free].name = name;
  state.lastEvent = { type: "join", color: state.seats[free].color, name, nonce: ++state.nonce };

  if (state.status === "lobby" && state.seats.every((s) => s.playerId)) {
    state.status = "playing";
    state.turn = 0;
    state.lastEvent = { type: "start", nonce: ++state.nonce };
  }
  return state;
}

export function roll(state: GameState, playerId: string): GameState {
  requireTurn(state, playerId);
  if (state.awaitingMove) throw new RuleError("Move a token first.");

  const color = state.seats[state.turn].color;
  const value = rollDie();
  state.dice = value;
  // `?? 0` backfills rooms stored before this field existed.
  state.diceNonce = (state.diceNonce ?? 0) + 1;
  state.consecutiveSixes = value === 6 ? state.consecutiveSixes + 1 : 0;

  if (state.consecutiveSixes >= 3) {
    state.lastEvent = { type: "roll", color, value, blocked: true, reason: "three-sixes", nonce: ++state.nonce };
    passTurn(state);
    return state;
  }

  const moves = legalMovesFor(state, color, value);
  if (moves.length === 0) {
    state.lastEvent = { type: "roll", color, value, blocked: true, reason: "no-moves", nonce: ++state.nonce };
    passTurn(state);
    return state;
  }

  state.legalMoves = moves;
  state.awaitingMove = true;
  state.lastEvent = { type: "roll", color, value, blocked: false, nonce: ++state.nonce };
  return state;
}

export function move(state: GameState, playerId: string, token: number): GameState {
  requireTurn(state, playerId);
  if (!state.awaitingMove || state.dice == null) throw new RuleError("Roll the die first.");
  if (!state.legalMoves.includes(token)) throw new RuleError("That token cannot move.");

  const color = state.seats[state.turn].color;
  const dice = state.dice;
  const from = state.tokens[color][token];
  const to = from === YARD ? 0 : from + dice;
  state.tokens[color][token] = to;

  const captured = captureAt(state, color, to);
  const finished = to === HOME;
  const extraTurn = dice === 6 || captured.length > 0 || finished;

  state.lastEvent = {
    type: "move",
    color,
    token,
    from,
    to,
    dice,
    captured,
    finished,
    extraTurn,
    nonce: ++state.nonce,
  };

  if (hasFinished(state, color) && !state.ranking.includes(color)) {
    state.ranking.push(color);
    state.lastEvent = { type: "win", color, nonce: ++state.nonce };
  }

  const stillPlaying = state.seats.filter((s) => s.playerId && !state.ranking.includes(s.color));
  if (stillPlaying.length <= 1) {
    state.status = "finished";
    state.awaitingMove = false;
    state.legalMoves = [];
    for (const s of stillPlaying) {
      if (!state.ranking.includes(s.color)) state.ranking.push(s.color);
    }
    return state;
  }

  if (extraTurn && !state.ranking.includes(color)) {
    state.awaitingMove = false;
    state.legalMoves = [];
    if (dice !== 6) state.consecutiveSixes = 0;
  } else {
    passTurn(state);
  }
  return state;
}

/** Sends every opposing token sharing this ring cell back to its yard. */
function captureAt(state: GameState, mover: Color, pos: number): Capture[] {
  if (pos < 0 || pos > LAST_RING_POS) return [];
  const abs = ringIndex(mover, pos);
  if (isSafeRingIndex(abs)) return [];

  const captured: Capture[] = [];
  for (const seat of state.seats) {
    if (!seat.playerId || seat.color === mover) continue;
    const other = seat.color;
    state.tokens[other].forEach((p, i) => {
      if (p < 0 || p > LAST_RING_POS) return;
      if (ringIndex(other, p) !== abs) return;
      state.tokens[other][i] = YARD;
      captured.push({ color: other, token: i, from: p });
    });
  }
  return captured;
}

export function rematch(state: GameState, playerId: string): GameState {
  if (seatOf(state, playerId) < 0) throw new RuleError("You are not in this game.", 403);
  if (state.status !== "finished") throw new RuleError("The game is still running.");

  for (const c of COLORS) state.tokens[c] = Array<number>(TOKENS_PER_PLAYER).fill(YARD);
  state.ranking = [];
  state.status = "playing";
  // loser of the previous game opens the next one
  state.turn = 0;
  state.dice = null;
  state.awaitingMove = false;
  state.legalMoves = [];
  state.consecutiveSixes = 0;
  state.lastEvent = { type: "rematch", nonce: ++state.nonce };
  return state;
}

export function chat(state: GameState, playerId: string, rawText: string): GameState {
  const text = rawText.trim().slice(0, 240);
  if (!text) throw new RuleError("Empty message.");
  const idx = seatOf(state, playerId);
  if (idx < 0) throw new RuleError("You are not in this game.", 403);
  const seat = state.seats[idx];
  state.chat.push({
    id: `${state.nonce}-${idx}-${Date.now().toString(36)}`,
    color: seat.color,
    name: seat.name ?? "Player",
    text,
    at: Date.now(),
  });
  if (state.chat.length > 60) state.chat = state.chat.slice(-60);
  return state;
}

function requireTurn(state: GameState, playerId: string) {
  if (state.status !== "playing") throw new RuleError("The game is not running.");
  const idx = seatOf(state, playerId);
  if (idx < 0) throw new RuleError("You are not in this game.", 403);
  if (idx !== state.turn) throw new RuleError("It is not your turn.", 409);
}

/* ------------------------------------------------------------------ */
/* serialisation                                                       */
/* ------------------------------------------------------------------ */

export function toClientState(
  state: GameState,
  playerId: string | null,
  online: Set<string> = new Set(),
): ClientState {
  const mySeat = playerId ? seatOf(state, playerId) : -1;
  const { seats, ...rest } = state;
  return {
    ...rest,
    seats: seats.map((s, i) => ({
      color: s.color,
      name: s.name,
      taken: Boolean(s.playerId),
      online: s.playerId != null && online.has(s.playerId),
      you: i === mySeat,
    })),
    yourColor: mySeat >= 0 ? seats[mySeat].color : null,
    yourSeat: mySeat >= 0 ? mySeat : null,
  };
}
