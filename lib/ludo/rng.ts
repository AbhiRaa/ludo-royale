/** Unbiased 1..6 from the platform CSPRNG (rejection sampling). */
export function rollDie(): number {
  const buf = new Uint8Array(1);
  // 252 = 6 * 42, the largest multiple of 6 under 256
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < 252) return (buf[0] % 6) + 1;
  }
}
