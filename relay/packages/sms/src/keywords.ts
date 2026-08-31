// Carrier-mandated opt-out keywords for Canada and the US. ARRÊT is required
// for Canadian French. Matching is exact on the trimmed, case-folded body:
// "please stop by at 6" is a customer message, not an opt-out.
const STOP = new Set(["stop", "arret", "arrêt", "unsubscribe", "cancel", "end", "quit", "stopall"]);
const START = new Set(["start", "unstop", "yes"]);

const fold = (body: string) => body.trim().toLowerCase();

export function isStopKeyword(body: string): boolean {
  return STOP.has(fold(body));
}

export function isStartKeyword(body: string): boolean {
  return START.has(fold(body));
}
