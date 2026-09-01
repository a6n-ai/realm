import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I/O for legibility

function unbiasedIndex(max: number): number {
  const limit = 256 - (256 % max);
  for (;;) {
    const b = randomBytes(1)[0]!;
    if (b < limit) return b % max;
  }
}

export function generateCode(prefix: string, length = 4): string {
  let body = "";
  for (let i = 0; i < length; i++) {
    body += ALPHABET[unbiasedIndex(ALPHABET.length)]!;
  }
  return `${prefix}-${body}`;
}
