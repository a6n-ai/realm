/**
 * Clover Developer Dashboard app webhooks (Payments / Orders).
 *
 * Auth: after URL verification, Dashboard shows a Clover Auth Code that is
 * sent as `X-Clover-Auth` on every notification. Compare with env
 * `CLOVER_WEBHOOK_AUTH` (constant-time).
 *
 * Payload shape (notifications):
 * `{ appId, merchants: { [mId]: [{ objectId, type, ts }, ...] } }`
 * where objectId is like `P:PAYMENTID` or `O:ORDERID`.
 *
 * Setup POST may be `{ verificationCode: "…" }` — respond 200 so the admin
 * can paste the code into Dashboard → Verify.
 *
 * Note: Hosted Checkout uses a different HMAC `Clover-Signature` scheme —
 * not used by puchkaman's iframe + pay-for-order flow.
 */

export type CloverWebhookUpdateType = "CREATE" | "UPDATE" | "DELETE" | string;

export type CloverWebhookUpdate = {
  merchantId: string;
  objectId: string;
  type: CloverWebhookUpdateType;
  ts?: number;
};

export type CloverWebhookEventKind =
  | "A"
  | "C"
  | "CA"
  | "E"
  | "I"
  | "IC"
  | "IG"
  | "IM"
  | "O"
  | "M"
  | "P"
  | "SH"
  | string;

export type ParsedCloverObjectId = {
  kind: CloverWebhookEventKind;
  id: string;
};

export type CloverWebhookParseResult =
  | { kind: "verification"; verificationCode: string }
  | { kind: "notification"; appId?: string; updates: CloverWebhookUpdate[] }
  | { kind: "unknown" };

/** Constant-time string compare for auth codes. */
export function safeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

/**
 * Verify `X-Clover-Auth` against the Dashboard auth code.
 * Returns false when expected is empty (misconfigured) or header mismatches.
 */
export function verifyCloverWebhookAuth(
  headerValue: string | null | undefined,
  expectedAuthCode: string | null | undefined,
): boolean {
  const got = (headerValue ?? "").trim();
  const expected = (expectedAuthCode ?? "").trim();
  if (!expected || !got) return false;
  return safeEqualString(got, expected);
}

/** Parse `P:ABC` / `O:XYZ` style object ids from app webhooks. */
export function parseCloverWebhookObjectId(objectId: string): ParsedCloverObjectId | null {
  const raw = objectId.trim();
  if (!raw) return null;
  const colon = raw.indexOf(":");
  if (colon <= 0 || colon === raw.length - 1) return null;
  return {
    kind: raw.slice(0, colon),
    id: raw.slice(colon + 1),
  };
}

export function parseCloverWebhookBody(body: unknown): CloverWebhookParseResult {
  if (!body || typeof body !== "object") return { kind: "unknown" };
  const o = body as Record<string, unknown>;

  if (typeof o.verificationCode === "string" && o.verificationCode.trim()) {
    return { kind: "verification", verificationCode: o.verificationCode.trim() };
  }

  const merchants = o.merchants;
  if (!merchants || typeof merchants !== "object") return { kind: "unknown" };

  const updates: CloverWebhookUpdate[] = [];
  for (const [merchantId, list] of Object.entries(merchants as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const u = item as Record<string, unknown>;
      if (typeof u.objectId !== "string" || !u.objectId) continue;
      updates.push({
        merchantId,
        objectId: u.objectId,
        type: typeof u.type === "string" ? u.type : "UPDATE",
        ts: typeof u.ts === "number" ? u.ts : undefined,
      });
    }
  }

  if (updates.length === 0) return { kind: "unknown" };
  return {
    kind: "notification",
    appId: typeof o.appId === "string" ? o.appId : undefined,
    updates,
  };
}

/** Load webhook auth code from env (never log the value). */
export function loadCloverWebhookAuthFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const v = env.CLOVER_WEBHOOK_AUTH?.trim();
  return v || null;
}
