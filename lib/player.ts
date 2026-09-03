"use client";

const ID_KEY = "ludo.playerId";
const NAME_KEY = "ludo.playerName";
const YEAR = 60 * 60 * 24 * 365;

/**
 * Identity has to survive storage being unavailable. In-app browsers
 * (WhatsApp, Instagram) and private windows can throw on localStorage or
 * partition it away — and minting a fresh id per call is catastrophic here:
 * the room creator would take a second seat and lock their opponent out.
 *
 * So: an in-memory cache keeps the id stable for the session even with no
 * storage at all, a cookie carries it across reloads when localStorage is
 * blocked, and localStorage remains the primary store when it works.
 */
let cachedId: string | null = null;
let cachedName: string | null = null;

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function lsSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage disabled — the cookie and the module cache carry us */
  }
}
function cookieGet(key: string): string | null {
  try {
    const match = document.cookie.match(new RegExp(`(?:^|; )${key.replace(/\./g, "\\.")}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}
function cookieSet(key: string, value: string) {
  try {
    document.cookie = `${key}=${encodeURIComponent(value)}; path=/; max-age=${YEAR}; samesite=lax`;
  } catch {
    /* nothing else to try */
  }
}

const UUID = /^[0-9a-fA-F-]{8,64}$/;

export function getPlayerId(): string {
  if (typeof window === "undefined") return "";
  if (cachedId) return cachedId;

  const stored = lsGet(ID_KEY) ?? cookieGet(ID_KEY);
  const id = stored && UUID.test(stored) ? stored : crypto.randomUUID();

  cachedId = id;
  lsSet(ID_KEY, id);
  cookieSet(ID_KEY, id);
  return id;
}

export function getPlayerName(): string {
  if (typeof window === "undefined") return "";
  if (cachedName != null) return cachedName;
  cachedName = lsGet(NAME_KEY) ?? cookieGet(NAME_KEY) ?? "";
  return cachedName;
}

export function setPlayerName(name: string) {
  if (typeof window === "undefined") return;
  const clean = name.trim().slice(0, 18);
  cachedName = clean;
  lsSet(NAME_KEY, clean);
  cookieSet(NAME_KEY, clean);
}

/** Best-effort persistence check, used to warn the player before it bites. */
export function storageIsPersistent(): boolean {
  if (typeof window === "undefined") return true;
  return lsGet(ID_KEY) !== null || cookieGet(ID_KEY) !== null;
}

export function rememberRoom(code: string) {
  lsSet("ludo.lastRoom", code);
  cookieSet("ludo.lastRoom", code);
}

export function lastRoom(): string | null {
  if (typeof window === "undefined") return null;
  return lsGet("ludo.lastRoom") ?? cookieGet("ludo.lastRoom");
}
