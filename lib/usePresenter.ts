"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientState, GameEvent, Snap } from "./ludo/types";
import { cueDuration, freshEvents, isInstant } from "./ludo/timeline";

const snapOf = (s: ClientState): Snap => ({
  tokens: s.tokens,
  turn: s.turn,
  fate: s.fate,
  shield: s.shield,
  dice: s.dice,
  awaitingMove: s.awaitingMove,
  status: s.status,
});

/**
 * Turns "the server's state changed" into "play these events, one at a time".
 *
 * The network delivers state in bursts — a slow poll can carry a throw and the
 * move that followed it, and the House answers a move with several events at
 * once. Showing only the newest state would skip straight to the ending, so
 * the board shown here deliberately lags: `view` is the game as of the last
 * event that has finished playing, and `cue` is the one on stage right now.
 */
export function usePresenter(
  state: ClientState | null,
  cinematic: boolean,
  onInstant: (ev: GameEvent) => void,
) {
  const [view, setView] = useState<Snap | null>(null);
  const [cue, setCue] = useState<GameEvent | null>(null);

  const queue = useRef<GameEvent[]>([]);
  const lastSeq = useRef<number | null>(null);
  const playing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(state);
  latest.current = state;
  const film = useRef(cinematic);
  film.current = cinematic;
  const instant = useRef(onInstant);
  instant.current = onInstant;

  const drain = useCallback(() => {
    const next = queue.current.shift();
    if (!next) {
      playing.current = false;
      setCue(null);
      // nothing left to play: fall exactly into step with the server
      if (latest.current) setView(snapOf(latest.current));
      return;
    }
    playing.current = true;
    setCue(next);
    timer.current = setTimeout(() => {
      setView(next.after);
      drain();
    }, cueDuration(next, film.current));
  }, []);

  useEffect(() => {
    if (!state) return;
    if (lastSeq.current === null) {
      // First sight of the room: show it as it is, do not replay its history.
      lastSeq.current = state.nonce;
      setView(snapOf(state));
      return;
    }
    const { fresh, gap } = freshEvents(state.log, state.nonce, lastSeq.current);
    lastSeq.current = state.nonce;

    if (gap) {
      clearTimeout(timer.current);
      queue.current = [];
      playing.current = false;
      setCue(null);
      setView(snapOf(state));
      return;
    }
    for (const ev of fresh) {
      if (isInstant(ev)) instant.current(ev);
      else queue.current.push(ev);
    }
    if (!playing.current) {
      if (queue.current.length) drain();
      else setView(snapOf(state));
    }
  }, [state, drain]);

  useEffect(
    () => () => {
      clearTimeout(timer.current);
      playing.current = false;
      queue.current = [];
    },
    [],
  );

  return { view, cue, idle: cue === null };
}
