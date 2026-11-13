import {
  COLORS,
  ClientState,
  Color,
  EventBody,
  FATE_MAX,
  FATE_START,
  GameEvent,
  GameState,
  HOME,
  LOG_LIMIT,
  Mode,
  MoveOption,
  PlayerStats,
  REACTIONS,
  Seat,
  Snap,
  TOKENS_PER_PLAYER,
  WAGER_MAX,
  YARD,
  Zone,
} from "./types";
import { RuleView, hasAnyOption, optionsFor, previewMove, roleOf, wagerLocked } from "./rules";
import { Roller, rollDie } from "./rng";
import { BOT_PREFIX, chooseMove, isBot } from "./bot";

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

const perColor = <T>(make: (c: Color) => T) =>
  Object.fromEntries(COLORS.map((c) => [c, make(c)])) as Record<Color, T>;

const blankStats = (): PlayerStats => ({
  rolls: 0,
  sixes: 0,
  captures: 0,
  lost: 0,
  blocks: 0,
  fateSpent: 0,
  fateGained: 0,
  squares: 0,
  byToken: Array<number>(TOKENS_PER_PLAYER).fill(0),
});

export function createGame(id: string, maxPlayers: number, mode: Mode = "classic"): GameState {
  const colors = seatColorsFor(maxPlayers);
  return {
    id,
    createdAt: Date.now(),
    status: "lobby",
    mode,
    maxPlayers: colors.length,
    seats: colors.map<Seat>((color) => ({ color, playerId: null, name: null, zone: null })),
    turn: 0,
    dice: null,
    diceNonce: 0,
    awaitingMove: false,
    legalMoves: [],
    consecutiveSixes: 0,
    tokens: perColor(() => Array<number>(TOKENS_PER_PLAYER).fill(YARD)),
    fate: perColor(() => (mode === "royale" ? FATE_START : 0)),
    shield: perColor(() => true),
    ranking: [],
    log: [],
    stats: perColor(blankStats),
    wagers: perColor(() => null),
    lastActionId: null,
    chat: [],
    version: 0,
    nonce: 0,
  };
}

/**
 * Brings a room stored by an older build up to the current shape, in place.
 * Rooms live for 36 hours, so a deploy can land in the middle of someone's game.
 */
export function migrate(raw: unknown): GameState {
  const s = raw as GameState & { lastEvent?: unknown };
  s.mode ??= "classic";
  s.fate ??= perColor(() => 0);
  s.shield ??= perColor(() => true);
  s.log ??= [];
  s.stats ??= perColor(blankStats);
  s.wagers ??= perColor(() => null);
  s.diceNonce ??= 0;
  for (const seat of s.seats) seat.zone ??= null;
  delete s.lastEvent;
  // older rooms stored legal moves as bare pawn indices
  if (s.legalMoves.some((m) => typeof m === "number")) {
    s.legalMoves =
      s.awaitingMove && s.dice != null ? optionsFor(viewOf(s), s.seats[s.turn].color, s.dice) : [];
  }
  return s;
}

/* ------------------------------------------------------------------ */
/* queries                                                             */
/* ------------------------------------------------------------------ */

export function viewOf(state: GameState): RuleView {
  return {
    mode: state.mode,
    players: state.seats.filter((s) => s.playerId).map((s) => s.color),
    tokens: state.tokens,
    shield: state.shield,
  };
}

export function snapOf(state: Pick<GameState, keyof Snap>): Snap {
  return {
    tokens: perColor((c) => [...state.tokens[c]]),
    turn: state.turn,
    fate: { ...state.fate },
    shield: { ...state.shield },
    dice: state.dice,
    awaitingMove: state.awaitingMove,
    status: state.status,
  };
}

export function hasFinished(state: GameState, color: Color): boolean {
  return state.tokens[color].every((p) => p === HOME);
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

/** Appends to the log. Call only once the state fully reflects the event. */
function emit(state: GameState, body: EventBody) {
  const event = { ...body, seq: ++state.nonce, after: snapOf(state) } as GameEvent;
  state.log.push(event);
  if (state.log.length > LOG_LIMIT) state.log.splice(0, state.log.length - LOG_LIMIT);
}

/** Fate only exists in royale, and never exceeds the cap. */
function gainFate(state: GameState, color: Color, amount = 1) {
  if (state.mode !== "royale") return;
  const next = Math.min(FATE_MAX, state.fate[color] + amount);
  state.stats[color].fateGained += next - state.fate[color];
  state.fate[color] = next;
}

function cleanZone(zone: unknown): Zone | null {
  if (!zone || typeof zone !== "object") return null;
  const { tz, offsetMin } = zone as Record<string, unknown>;
  if (typeof tz !== "string" || !/^[A-Za-z0-9_+\-/]{1,64}$/.test(tz)) return null;
  if (typeof offsetMin !== "number" || !Number.isInteger(offsetMin)) return null;
  if (offsetMin < -720 || offsetMin > 840) return null;
  return { tz, offsetMin };
}

/* ------------------------------------------------------------------ */
/* mutations — every one returns the same object, mutated in place      */
/* ------------------------------------------------------------------ */

export function join(state: GameState, playerId: string, rawName: string, rawZone?: unknown): GameState {
  const name = rawName.trim().slice(0, 18) || "Player";
  const zone = cleanZone(rawZone);
  const existing = seatOf(state, playerId);
  if (existing >= 0) {
    const seat = state.seats[existing];
    seat.name = name;
    if (zone) seat.zone = zone;
    return state;
  }
  const free = state.seats.findIndex((s) => !s.playerId);
  if (free < 0) throw new RuleError("This room is full.", 409);

  const seat = state.seats[free];
  seat.playerId = playerId;
  seat.name = name;
  seat.zone = zone;
  emit(state, { type: "join", color: seat.color, name });

  if (state.status === "lobby" && state.seats.every((s) => s.playerId)) {
    state.status = "playing";
    state.turn = 0;
    emit(state, { type: "start" });
  }
  return state;
}

export function roll(state: GameState, playerId: string, roller: Roller = rollDie): GameState {
  requireTurn(state, playerId);
  if (state.awaitingMove) throw new RuleError("Move a pawn first.");

  const color = state.seats[state.turn].color;
  const value = roller();
  state.dice = value;
  state.diceNonce += 1;
  state.stats[color].rolls += 1;
  if (value === 6) state.stats[color].sixes += 1;
  state.consecutiveSixes = value === 6 ? state.consecutiveSixes + 1 : 0;

  if (state.consecutiveSixes >= 3) {
    gainFate(state, color);
    passTurn(state);
    emit(state, { type: "roll", color, value, blocked: true, reason: "three-sixes", stuck: false });
    return state;
  }

  const view = viewOf(state);
  const natural = optionsFor(view, color, value);
  // Even with nothing to move, the turn stays open if Fate could change that.
  if (natural.length === 0 && !hasAnyOption(view, color, value, state.fate[color])) {
    gainFate(state, color);
    passTurn(state);
    emit(state, { type: "roll", color, value, blocked: true, reason: "no-moves", stuck: false });
    return state;
  }

  state.legalMoves = natural;
  state.awaitingMove = true;
  emit(state, { type: "roll", color, value, blocked: false, stuck: natural.length === 0 });
  return state;
}

export type MoveRequest = { token: number; to?: number; nudge?: number };

export function move(state: GameState, playerId: string, req: MoveRequest): GameState {
  requireTurn(state, playerId);
  if (!state.awaitingMove || state.dice == null) throw new RuleError("Roll the die first.");

  const color = state.seats[state.turn].color;
  const natural = state.dice;
  const nudge = req.nudge ?? 0;
  if (!Number.isInteger(nudge)) throw new RuleError("Bad nudge.");
  if (nudge !== 0 && state.mode !== "royale") throw new RuleError("Fate is not part of this game.");
  if (Math.abs(nudge) > state.fate[color]) throw new RuleError("Not enough Fate.");
  const value = natural + nudge;
  if (value < 1 || value > 6) throw new RuleError("A die only goes from 1 to 6.");

  const view = viewOf(state);
  const mine = optionsFor(view, color, value).filter((o) => o.token === req.token);
  let option: MoveOption | undefined;
  if (req.to != null) option = mine.find((o) => o.to === req.to);
  else if (mine.length === 1) option = mine[0];
  else if (mine.length > 1) throw new RuleError("Choose where that pawn lands.");
  if (!option) throw new RuleError("That pawn cannot move.");

  const outcome = previewMove(view, color, option);
  const from = state.tokens[color][option.token];
  const stats = state.stats[color];

  state.fate[color] -= Math.abs(nudge);
  stats.fateSpent += Math.abs(nudge);

  if (outcome.bounced) {
    for (const guard of outcome.shieldBroken) {
      state.shield[guard] = false;
      state.stats[guard].blocks += 1;
    }
  } else {
    state.tokens[color][option.token] = outcome.landed;
    stats.squares += from === YARD ? 1 : Math.abs(outcome.landed - from);
    for (const hit of outcome.captured) {
      state.tokens[hit.color][hit.token] = YARD;
      state.stats[hit.color].lost += 1;
      // a Guard sent home picks its shield back up
      if (roleOf(state.mode, hit.token) === "guard") state.shield[hit.color] = true;
      gainFate(state, hit.color);
    }
    stats.captures += outcome.captured.length;
    stats.byToken[option.token] += outcome.captured.length;
    if (outcome.star) gainFate(state, color);
  }

  // Only a six that was actually thrown buys another throw; Fate never does.
  const extraTurn = natural === 6 || outcome.captured.length > 0 || outcome.finished;
  state.dice = value;

  const justWon = hasFinished(state, color) && !state.ranking.includes(color);
  if (justWon) state.ranking.push(color);

  const stillPlaying = state.seats.filter((s) => s.playerId && !state.ranking.includes(s.color));
  if (stillPlaying.length <= 1) {
    state.status = "finished";
    state.awaitingMove = false;
    state.legalMoves = [];
    for (const s of stillPlaying) state.ranking.push(s.color);
  } else if (extraTurn && !state.ranking.includes(color)) {
    state.awaitingMove = false;
    state.legalMoves = [];
    if (natural !== 6) state.consecutiveSixes = 0;
  } else {
    passTurn(state);
  }

  emit(state, {
    type: "move",
    color,
    token: option.token,
    from,
    to: option.to,
    landed: outcome.landed,
    kind: option.kind,
    dice: natural,
    value,
    nudge,
    captured: outcome.captured,
    bounced: outcome.bounced,
    shieldBroken: outcome.shieldBroken,
    star: outcome.star,
    finished: outcome.finished,
    extraTurn,
  });
  if (justWon) emit(state, { type: "win", color });
  return state;
}

/** Give up a throw that cannot be played as it lies. Earns one Fate. */
export function pass(state: GameState, playerId: string): GameState {
  requireTurn(state, playerId);
  if (!state.awaitingMove || state.dice == null) throw new RuleError("Roll the die first.");
  const color = state.seats[state.turn].color;
  if (optionsFor(viewOf(state), color, state.dice).length > 0) {
    throw new RuleError("You have a move to make.");
  }
  gainFate(state, color);
  passTurn(state);
  emit(state, { type: "pass", color });
  return state;
}

export function rematch(state: GameState, playerId: string): GameState {
  if (seatOf(state, playerId) < 0) throw new RuleError("You are not in this game.", 403);
  if (state.status !== "finished") throw new RuleError("The game is still running.");

  // whoever came last opens the next game
  const last = state.ranking[state.ranking.length - 1];
  const opener = state.seats.findIndex((s) => s.color === last);

  for (const c of COLORS) {
    state.tokens[c] = Array<number>(TOKENS_PER_PLAYER).fill(YARD);
    state.fate[c] = state.mode === "royale" ? FATE_START : 0;
    state.shield[c] = true;
    state.stats[c] = blankStats();
  }
  state.ranking = [];
  state.status = "playing";
  state.turn = opener >= 0 ? opener : 0;
  state.dice = null;
  state.awaitingMove = false;
  state.legalMoves = [];
  state.consecutiveSixes = 0;
  emit(state, { type: "rematch" });
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

/** Seal (or clear) "if I win, you owe me…". Locked once any pawn is home. */
export function wager(state: GameState, playerId: string, rawText: string): GameState {
  const idx = seatOf(state, playerId);
  if (idx < 0) throw new RuleError("You are not in this game.", 403);
  if (wagerLocked(state.tokens, state.status)) throw new RuleError("Wagers are sealed for this game.");
  const color = state.seats[idx].color;
  const text = rawText.trim().slice(0, WAGER_MAX);
  const had = Boolean(state.wagers[color]);
  state.wagers[color] = text || null;
  if (text && !had) emit(state, { type: "wager", color });
  return state;
}

export function react(state: GameState, playerId: string, emoji: string): GameState {
  const idx = seatOf(state, playerId);
  if (idx < 0) throw new RuleError("You are not in this game.", 403);
  if (!(REACTIONS as readonly string[]).includes(emoji)) throw new RuleError("Unknown reaction.");
  emit(state, { type: "react", color: state.seats[idx].color, emoji });
  return state;
}

/* ------------------------------------------------------------------ */
/* the House                                                           */
/* ------------------------------------------------------------------ */

/** Seats a computer opponent in the next free chair. */
export function addBot(state: GameState, mirrorOf?: Zone | null): GameState {
  const free = state.seats.find((s) => !s.playerId);
  if (!free) throw new RuleError("This room is full.", 409);
  // The House keeps its clock on the far side of the world, so a solo table
  // still sits between two different skies.
  const zone = mirrorOf
    ? { tz: "Etc/House", offsetMin: mirrorOf.offsetMin > 0 ? mirrorOf.offsetMin - 720 : mirrorOf.offsetMin + 720 }
    : null;
  return join(state, `${BOT_PREFIX}${free.color}`, "The House", zone);
}

/**
 * Plays every computer turn that is due, in place. Runs inside the human's
 * own request, so the events simply queue up behind theirs in the log and the
 * client plays them back one after another.
 */
export function runBots(state: GameState, roller: Roller = rollDie): GameState {
  for (let guard = 0; guard < 60 && state.status === "playing"; guard++) {
    const seat = state.seats[state.turn];
    if (!isBot(seat.playerId)) break;
    const id = seat.playerId!;
    if (!state.awaitingMove) {
      roll(state, id, roller);
      continue;
    }
    const choice = chooseMove(state, viewOf(state), seat.color);
    if (choice) move(state, id, choice);
    else if (state.legalMoves.length > 0) move(state, id, { token: state.legalMoves[0].token, to: state.legalMoves[0].to });
    else pass(state, id);
  }
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
  const { seats, wagers, ...rest } = state;
  const over = state.status === "finished";
  return {
    ...rest,
    seats: seats.map((s, i) => ({
      color: s.color,
      name: s.name,
      taken: Boolean(s.playerId),
      online: s.playerId != null && (isBot(s.playerId) || online.has(s.playerId)),
      you: i === mySeat,
      zone: s.zone,
    })),
    yourColor: mySeat >= 0 ? seats[mySeat].color : null,
    yourSeat: mySeat >= 0 ? mySeat : null,
    yourWager: mySeat >= 0 ? wagers[seats[mySeat].color] : null,
    wagerSet: perColor((c) => Boolean(wagers[c])),
    wagerLocked: wagerLocked(state.tokens, state.status),
    // A wager stays secret until there is a result to attach it to.
    stakes: over
      ? seats.filter((s) => s.playerId && wagers[s.color]).map((s) => ({ color: s.color, text: wagers[s.color]! }))
      : null,
  };
}
