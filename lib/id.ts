/** Unambiguous alphabet: no O/0, I/1, or similar look-alikes. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function roomCode(len = 5): string {
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[buf[i] % ALPHABET.length];
  return out;
}

export function normaliseCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

export function playerToken(): string {
  return crypto.randomUUID();
}
