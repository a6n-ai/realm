import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I/O for legibility

export function generateCode(prefix: string, length = 4): string {
  const bytes = randomBytes(length);
  let body = "";
  for (let i = 0; i < length; i++) {
    body += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return `${prefix}-${body}`;
}
