// Marks "this browser asked for a sign-in code", so the email's link can sign
// in straight away here (same device) and only shows the code anywhere else.
// Holds no secret: the code itself only ever arrives by email.
const KEY = "tg:pending-sign-in";
const TTL_MS = 10 * 60 * 1000; // matches emailOTP expiresIn

export type PendingSignIn = { email: string; callbackUrl: string | null };

export function rememberPendingSignIn(email: string, callbackUrl: string | null) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ email, callbackUrl, at: Date.now() }));
  } catch {
    // Storage blocked: the link falls back to showing the code.
  }
}

export function takePendingSignIn(): PendingSignIn | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as PendingSignIn & { at: number };
    if (typeof p.email !== "string" || Date.now() - p.at > TTL_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return { email: p.email, callbackUrl: p.callbackUrl ?? null };
  } catch {
    return null;
  }
}

export function clearPendingSignIn() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}
