"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientState } from "./ludo/types";
import { getPlayerId } from "./player";

export type ConnectionStatus = "connecting" | "live" | "reconnecting" | "hidden" | "gone";
type ActionPayload =
  | { type: "roll" }
  | { type: "move"; token: number }
  | { type: "rematch" }
  | { type: "chat"; text: string };

export function useRoom(code: string) {
  const [state, setState] = useState<ClientState | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const versionRef = useRef(-1);

  /** Never let a slow HTTP response overwrite fresher stream state. */
  const applyState = useCallback((next: ClientState) => {
    if (next.version < versionRef.current) return;
    versionRef.current = next.version;
    setState(next);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/room/${code}`, {
        headers: { "x-ludo-player": getPlayerId() },
        cache: "no-store",
      });
      const data = await res.json();
      if (res.ok) applyState(data.state);
      else if (res.status === 404) setStatus("gone");
    } catch {
      /* offline; the stream will recover */
    }
  }, [code, applyState]);

  /* ---- live stream ------------------------------------------------- */
  useEffect(() => {
    if (!code) return;
    let source: EventSource | null = null;
    let stopped = false;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const close = () => {
      source?.close();
      source = null;
    };

    const open = () => {
      if (stopped || document.hidden) return;
      close();
      const es = new EventSource(`/api/room/${code}/stream?p=${encodeURIComponent(getPlayerId())}`);
      source = es;

      es.addEventListener("state", (ev) => {
        applyState(JSON.parse((ev as MessageEvent).data) as ClientState);
        setStatus("live");
      });
      es.addEventListener("gone", (ev) => {
        stopped = true;
        setError((JSON.parse((ev as MessageEvent).data) as { error: string }).error);
        setStatus("gone");
        close();
      });
      // The server rotates the connection before the platform timeout.
      es.addEventListener("cycle", () => {
        close();
        if (!stopped) retry = setTimeout(open, 60);
      });
      es.onopen = () => setStatus("live");
      es.onerror = () => {
        setStatus((s) => (s === "gone" ? s : "reconnecting"));
      };
    };

    const onVisibility = () => {
      if (document.hidden) {
        // A forgotten tab should not poll Redis forever.
        close();
        setStatus("hidden");
      } else {
        void refresh();
        open();
      }
    };

    void refresh();
    open();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      clearTimeout(retry);
      document.removeEventListener("visibilitychange", onVisibility);
      close();
    };
  }, [code, applyState, refresh]);

  /* ---- actions ------------------------------------------------------ */
  const send = useCallback(
    async (payload: ActionPayload) => {
      setPending(payload.type);
      try {
        const res = await fetch(`/api/room/${code}/action`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-ludo-player": getPlayerId() },
          body: JSON.stringify({ ...payload, actionId: crypto.randomUUID() }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "That did not work.");
          void refresh();
          return null;
        }
        applyState(data.state as ClientState);
        return data.state as ClientState;
      } catch {
        setError("Lost the connection. Retrying…");
        return null;
      } finally {
        setPending(null);
      }
    },
    [code, applyState, refresh],
  );

  const join = useCallback(
    async (name: string) => {
      setPending("join");
      try {
        const res = await fetch(`/api/room/${code}/join`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-ludo-player": getPlayerId() },
          body: JSON.stringify({ name }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Could not join.");
          return null;
        }
        applyState(data.state as ClientState);
        return data.state as ClientState;
      } catch {
        setError("Could not reach the table.");
        return null;
      } finally {
        setPending(null);
      }
    },
    [code, applyState],
  );

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 4200);
    return () => clearTimeout(t);
  }, [error]);

  return { state, status, error, pending, send, join, refresh, setError };
}
