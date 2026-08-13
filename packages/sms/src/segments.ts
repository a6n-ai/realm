// GSM 03.38 basic set. Anything outside it forces UCS-2 for the whole message.
const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
// These cost two septets each.
const GSM_EXTENDED = "^{}\\[~]|€";

/**
 * Segment count and encoding — i.e. what the message will cost.
 *
 * Worth being exact: a single emoji in an otherwise-ASCII template drops the
 * per-segment budget from 160 characters to 70, which can quietly triple the
 * bill on a campaign of any size.
 */
export function countSegments(text: string): { segments: number; encoding: "GSM-7" | "UCS-2" } {
  let septets = 0;
  let gsm = true;

  for (const ch of text) {
    if (GSM_BASIC.includes(ch)) {
      septets += 1;
      continue;
    }
    if (GSM_EXTENDED.includes(ch)) {
      septets += 2;
      continue;
    }
    gsm = false;
    break;
  }

  if (!gsm) {
    // UCS-2 counts UTF-16 code units, so an astral emoji is 2.
    const units = [...text].reduce((n, ch) => n + (ch.codePointAt(0)! > 0xffff ? 2 : 1), 0);
    return { segments: units <= 70 ? 1 : Math.ceil(units / 67), encoding: "UCS-2" };
  }
  // Concatenated messages give up 7 septets per part to the UDH header.
  return { segments: septets <= 160 ? 1 : Math.ceil(septets / 153), encoding: "GSM-7" };
}
