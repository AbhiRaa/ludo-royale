"use client";

const ID_KEY = "ludo.playerId";
const NAME_KEY = "ludo.playerName";

export function getPlayerId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(ID_KEY, id);
  }
  return id;
}

export function getPlayerName(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(NAME_KEY) ?? "";
}

export function setPlayerName(name: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(NAME_KEY, name.trim().slice(0, 18));
}
