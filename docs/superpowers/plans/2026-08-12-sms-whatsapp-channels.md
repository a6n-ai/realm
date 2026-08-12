# SMS and WhatsApp Channels — Implementation Plan (Plan D)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Prerequisite:** Plans A, B and C complete — the outbox, drainer, templates, campaigns and consent machinery all exist and work for email.

**Goal:** SMS and WhatsApp become deliverable channels for both transactional notifications and campaigns, with phone consent, verification and mandatory STOP handling.

**Architecture:** By design from Plan A, a channel is **one provider implementing `ChannelProvider` plus one entry in the `providers` map**. Nothing about the outbox, the drainer, audience resolution, suppression or the admin UI changes. What this plan actually adds is the parts that are *not* symmetric with email: phone number consent and verification, carrier-mandated STOP keyword handling, message segmentation and cost, and WhatsApp's pre-approved template model.

**Tech Stack:** TypeScript, Twilio (SMS + WhatsApp via the same account), `@realm/notifications`, Postgres, Vitest.

---

## ⚠ Read this before starting

Unlike Plans A–C, this plan has **external prerequisites that cannot be satisfied by writing code**, and every one of them has a lead time measured in days or weeks. Nothing in Task 3 onward can be verified end to end until they clear.

| Prerequisite | Status at time of writing | Lead time |
| --- | --- | --- |
| Twilio account + Canadian toll-free or 10DLC number | Does not exist | hours to open; **1–3 weeks** for toll-free verification |
| Toll-free verification (required to send A2P SMS to Canada/US at volume) | Not started | 1–3 weeks, can be rejected and resubmitted |
| Meta Business verification + WhatsApp Business Account | Not started | 1–3 weeks |
| WhatsApp message templates approved | Not started | hours to days **per template**, can be rejected |
| Customer phone numbers with provable consent | `users.phone` exists (Plan B) but is **unverified** and consent was never asked for | ongoing |

The last row is the one most likely to be underestimated. Plan B populates `users.phone` from `orders.customer_phone` — a number given to receive a delivery, which is **not** consent to receive marketing SMS. Task 2 exists to make that distinction explicit in the schema rather than letting a backfilled column quietly become a marketing list.

**Vendor assumption:** this plan is written for **Twilio**, because one account and one credential covers both SMS and WhatsApp (Twilio is a Meta Business Solution Provider), which halves the integration surface. If you pick a different vendor, only Tasks 3 and 6 change — `ChannelProvider` is the seam, and `@realm/sms`/`@realm/whatsapp` are separate packages precisely so a swap does not touch the notification core.

**Recommended sequencing:** start the Twilio account and toll-free verification **before** writing any code, then do Tasks 1–2 (which need no vendor) while verification is pending.

---

## Global Constraints

- Everything from Plans A–C applies.
- **STOP handling is mandatory and must be automatic.** Canadian and US carriers require that STOP, ARRÊT, UNSUBSCRIBE, CANCEL, END and QUIT immediately halt messages to that number. This is an inbound webhook writing `message_suppression`, never a UI checkbox and never a manual process.
- **CASL covers SMS.** Everything Plan C enforces for marketing email applies identically to marketing SMS: provable consent, 24-month implied-consent expiry, sender identification, working opt-out.
- **Never send marketing SMS to an unverified number.** A number typed into a delivery form can be mistyped, and the wrong person receives it. Transactional SMS to an order's own number is defensible; marketing to an unverified number is not.
- **WhatsApp business-initiated messages outside the 24-hour customer-service window must use a Meta-approved template.** Content is a template id plus variables, not free-form copy — the composer previews an externally-approved artifact rather than authoring one.
- SMS costs real money per segment. Any code path that can send must be countable and rate-limited before it is enabled.

---

## File Structure

**Created**

| File | Responsibility |
| --- | --- |
| `packages/sms/` | `@realm/sms` — Twilio provider, segmentation, STOP keywords |
| `packages/whatsapp/` | `@realm/whatsapp` — Twilio WhatsApp provider, template mapping |
| `apps/puchkaman/lib/notifications/sms-provider.ts` | Provider binding |
| `apps/puchkaman/app/api/webhooks/twilio/inbound/route.ts` | STOP/START keyword webhook |
| `apps/puchkaman/app/api/webhooks/twilio/status/route.ts` | Delivery status callbacks |
| `apps/puchkaman/app/api/account/phone/{start,verify}/route.ts` | Phone verification |

**Modified**

| File | Change |
| --- | --- |
| `packages/notifications/src/schema.ts` | `notification_prefs` phone consent columns |
| `packages/notifications/src/handlers.ts` | WhatsApp template-id dispatch |
| `apps/puchkaman/lib/notifications/handlers.ts` | Register sms/whatsapp providers |
| `apps/puchkaman/lib/campaigns/segment.ts` | Exclude unverified phones |
| `deployment/prod/puchkaman/.env.production.example` | Twilio credentials |

---

## Task 1: Phone consent and verification schema

**Files:**
- Modify: `packages/notifications/src/schema.ts`
- Create: `packages/notifications/src/phone.ts`
- Test: `packages/notifications/src/phone.test.ts`

**Interfaces:**
- Consumes: `normalizeAddress` (Plan A Task 3).
- Produces: `toE164(raw: string, defaultCountry?: "CA" | "US"): string | null`; `isSmsDeliverable(user): boolean`; `phoneVerification` table.

`normalizeAddress` strips formatting but does not produce E.164 — `4165550134` and `+14165550134` are the same number and would hash to two different suppression rows. This task fixes that before a single SMS is sent.

- [ ] **Step 1: Write the failing test**

`packages/notifications/src/phone.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isSmsDeliverable, toE164 } from "./phone";

describe("toE164", () => {
  it("adds the country code to a bare 10-digit Canadian number", () => {
    expect(toE164("4165550134")).toBe("+14165550134");
  });

  it("keeps an already-qualified number", () => {
    expect(toE164("+14165550134")).toBe("+14165550134");
  });

  it("strips formatting", () => {
    expect(toE164("(416) 555-0134")).toBe("+14165550134");
    expect(toE164("416.555.0134")).toBe("+14165550134");
  });

  it("handles a leading 1 without a plus", () => {
    expect(toE164("14165550134")).toBe("+14165550134");
  });

  it("rejects a number that is too short or too long", () => {
    expect(toE164("5550134")).toBeNull();
    expect(toE164("123456789012345678")).toBeNull();
  });

  it("rejects empty and junk input", () => {
    expect(toE164("")).toBeNull();
    expect(toE164("not a phone")).toBeNull();
  });

  it("preserves a non-North-American number that already carries a plus", () => {
    expect(toE164("+442071838750")).toBe("+442071838750");
  });
});

describe("isSmsDeliverable", () => {
  it("allows a verified number for marketing", () => {
    expect(isSmsDeliverable({ phone: "+14165550134", phoneVerified: true }, "marketing")).toBe(true);
  });

  it("blocks an unverified number for marketing", () => {
    expect(isSmsDeliverable({ phone: "+14165550134", phoneVerified: false }, "marketing")).toBe(false);
  });

  it("allows an unverified number for a transactional message", () => {
    expect(isSmsDeliverable({ phone: "+14165550134", phoneVerified: false }, "transactional")).toBe(true);
  });

  it("blocks a missing number for either kind", () => {
    expect(isSmsDeliverable({ phone: null, phoneVerified: true }, "transactional")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @realm/notifications test src/phone.test.ts`
Expected: FAIL — `Failed to resolve import "./phone"`.

- [ ] **Step 3: Write `src/phone.ts`**

```ts
import type { Kind } from "./types";

/**
 * Normalize to E.164.
 *
 * This matters more than it looks: suppression is keyed on the address string,
 * so "4165550134" and "+14165550134" would be two different rows and a STOP
 * recorded against one would not block the other. Every phone number entering
 * the system goes through here first.
 *
 * North American default because both apps operate in Canada. A number that
 * already carries a `+` is trusted as-is rather than being re-derived.
 */
export function toE164(raw: string, defaultCountry: "CA" | "US" = "CA"): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("+")) {
    const digits = trimmed.slice(1).replace(/\D/g, "");
    // E.164 allows at most 15 digits; fewer than 8 is not a routable number.
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

/**
 * Whether a number may receive a message of this kind.
 *
 * Marketing requires a VERIFIED number. A phone typed into a delivery form can
 * be mistyped, and a marketing message to a mistyped number reaches a stranger
 * who never consented to anything — a CASL problem and a reputational one.
 * A transactional message to the number attached to that person's own order is
 * defensible without verification.
 */
export function isSmsDeliverable(
  user: { phone: string | null; phoneVerified: boolean },
  kind: Kind,
): boolean {
  if (!user.phone) return false;
  return kind === "transactional" || user.phoneVerified;
}
```

- [ ] **Step 4: Add the verification table to the factory**

In `makeNotificationTables`, add:

```ts
  /**
   * Short-lived phone verification codes. Separate from the auth OTP tables:
   * this verifies a NUMBER, not an identity, and a customer with no login must
   * be able to complete it.
   */
  const phoneVerification = pgTable("phone_verification", {
    ...baseColumns("phv"),
    phone: text("phone").notNull(),
    /** Hashed, never the plaintext code. */
    codeHash: text("code_hash").notNull(),
    expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    consumedAt: bigint("consumed_at", { mode: "number" }),
  }, (t) => [
    index("phone_verification_phone_idx").on(t.phone, t.expiresAt),
  ]);
```

and add it to the returned object and to `NotificationTables`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @realm/notifications test src/phone.test.ts`
Expected: PASS — 11 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/notifications/src/phone.ts packages/notifications/src/phone.test.ts packages/notifications/src/schema.ts
git commit -m "feat(notifications): E.164 normalization and phone deliverability rules

Suppression is keyed on the address string, so 4165550134 and +14165550134
would be two rows and a STOP against one would not block the other. Marketing
additionally requires a verified number -- a mistyped delivery phone reaches
a stranger who consented to nothing."
```

---

## Task 2: Phone verification flow

**Files:**
- Create: `apps/puchkaman/lib/notifications/phone-verify.ts`
- Create: `apps/puchkaman/app/api/account/phone/start/route.ts`
- Create: `apps/puchkaman/app/api/account/phone/verify/route.ts`
- Test: `apps/puchkaman/lib/notifications/__tests__/phone-verify.test.ts`

**Interfaces:**
- Consumes: `toE164`, `phoneVerification` (Task 1).
- Produces: `startVerification(phone): Promise<{ sent: boolean }>`; `confirmVerification(phone, code): Promise<boolean>`.

This task can be built and tested **before Twilio exists** — the send is behind the provider interface and no-ops when unconfigured.

- [ ] **Step 1: Write the failing test**

`apps/puchkaman/lib/notifications/__tests__/phone-verify.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { eq, like } from "drizzle-orm";
import { db } from "@/db/client";
import { phoneVerification } from "@/db/schema";
import { confirmVerification, startVerification, MAX_ATTEMPTS } from "@/lib/notifications/phone-verify";

const PHONE = "+14165550199";
const send = vi.fn(async () => ({ providerMessageId: "sm_test" }));

afterEach(async () => {
  await db.delete(phoneVerification).where(eq(phoneVerification.phone, PHONE));
  send.mockClear();
});

describe("phone verification", () => {
  it("stores a hash, never the plaintext code", async () => {
    const { code } = await startVerification(PHONE, { send });
    const [row] = await db.select().from(phoneVerification).where(eq(phoneVerification.phone, PHONE));
    expect(row.codeHash).not.toContain(code);
    expect(row.codeHash).toHaveLength(64);
  });

  it("confirms a correct code once", async () => {
    const { code } = await startVerification(PHONE, { send });
    expect(await confirmVerification(PHONE, code)).toBe(true);
    expect(await confirmVerification(PHONE, code)).toBe(false);
  });

  it("rejects a wrong code", async () => {
    await startVerification(PHONE, { send });
    expect(await confirmVerification(PHONE, "000000")).toBe(false);
  });

  it("locks out after too many attempts", async () => {
    const { code } = await startVerification(PHONE, { send });
    for (let i = 0; i < MAX_ATTEMPTS; i++) await confirmVerification(PHONE, "000000");
    expect(await confirmVerification(PHONE, code)).toBe(false);
  });

  it("rejects an expired code", async () => {
    const { code } = await startVerification(PHONE, { send });
    await db
      .update(phoneVerification)
      .set({ expiresAt: Date.now() - 1 })
      .where(eq(phoneVerification.phone, PHONE));
    expect(await confirmVerification(PHONE, code)).toBe(false);
  });

  it("refuses a number that is not valid E.164", async () => {
    await expect(startVerification("nonsense", { send })).resolves.toEqual({ sent: false, code: null });
    expect(send).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter puchkaman test lib/notifications/__tests__/phone-verify.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the module**

```ts
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import type { ChannelProvider } from "@realm/notifications";
import { toE164 } from "@realm/notifications";
import { db } from "@/db/client";
import { phoneVerification } from "@/db/schema";

export const MAX_ATTEMPTS = 5;
const TTL_MS = 10 * 60_000;

const hash = (code: string) => createHash("sha256").update(code).digest("hex");

/**
 * Issue a 6-digit code. Stored hashed: a database read must not hand someone a
 * working code for every pending verification.
 *
 * Returns the plaintext code ONLY so tests can assert against it — no caller in
 * app code may log or return it.
 */
export async function startVerification(
  raw: string,
  deps: { send: ChannelProvider["send"] },
): Promise<{ sent: boolean; code: string | null }> {
  const phone = toE164(raw);
  if (!phone) return { sent: false, code: null };

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.insert(phoneVerification).values({
    phone,
    codeHash: hash(code),
    expiresAt: Date.now() + TTL_MS,
  });

  await deps.send({ to: { phone }, text: `Your Puchkaman verification code is ${code}. It expires in 10 minutes.` });
  return { sent: true, code };
}

/** Confirm a code. Consumes the row on success; counts the attempt either way. */
export async function confirmVerification(raw: string, code: string): Promise<boolean> {
  const phone = toE164(raw);
  if (!phone) return false;

  const [row] = await db
    .select()
    .from(phoneVerification)
    .where(
      and(
        eq(phoneVerification.phone, phone),
        isNull(phoneVerification.consumedAt),
        gt(phoneVerification.expiresAt, Date.now()),
      ),
    )
    .orderBy(desc(phoneVerification.createdAt))
    .limit(1);

  if (!row || row.attempts >= MAX_ATTEMPTS) return false;

  // Count the attempt BEFORE comparing, so a crash mid-check cannot be used to
  // retry indefinitely.
  await db
    .update(phoneVerification)
    .set({ attempts: row.attempts + 1 })
    .where(eq(phoneVerification.id, row.id));

  const expected = Buffer.from(row.codeHash, "hex");
  const given = Buffer.from(hash(code), "hex");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;

  await db
    .update(phoneVerification)
    .set({ consumedAt: Date.now() })
    .where(eq(phoneVerification.id, row.id));
  return true;
}
```

- [ ] **Step 4: Write the routes**

Both routes must be **rate limited** — an unthrottled `start` endpoint is an SMS-cost amplification vector aimed at your own bill. Read the rate limiter used elsewhere in the app (`rg -n "rateLimit" apps/puchkaman/lib`) and apply it: at most 3 starts per number per hour, and 10 per IP per hour.

- [ ] **Step 5: Run the test and commit**

```bash
pnpm --filter puchkaman test lib/notifications/__tests__/phone-verify.test.ts
git add apps/puchkaman/lib/notifications/phone-verify.ts apps/puchkaman/app/api/account/phone
git commit -m "feat(puchkaman): phone number verification

Codes are stored hashed and the attempt is counted before the comparison, so
a crash mid-check cannot be used to retry indefinitely. The start endpoint is
rate limited -- unthrottled, it is an SMS-cost amplifier aimed at our own bill."
```

---

## Task 3: `@realm/sms`

**Files:**
- Create: `packages/sms/{package.json,tsconfig.json,vitest.config.ts}`
- Create: `packages/sms/src/{index,types,segments,keywords,twilio-provider}.ts`
- Test: `packages/sms/src/{segments,keywords}.test.ts`

**Interfaces:**
- Consumes: `ChannelProvider`, `OutboundMessage` (Plan A Task 1).
- Produces: `TwilioSmsProvider` implementing `ChannelProvider`; `countSegments(text): { segments: number; encoding: "GSM-7" | "UCS-2" }`; `isStopKeyword(body)`; `isStartKeyword(body)`.

Segmentation and keywords are pure and get real tests; the Twilio call itself is a thin `fetch` verified against the sandbox in Task 7.

- [ ] **Step 1: Scaffold the package**

`packages/sms/package.json`:

```json
{
  "name": "@realm/sms",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "types": "./src/index.ts",
  "scripts": { "typecheck": "tsc --noEmit", "test": "vitest run" },
  "dependencies": { "@realm/commons": "workspace:*" },
  "peerDependencies": { "@realm/notifications": "workspace:*" },
  "devDependencies": { "@realm/notifications": "workspace:*", "typescript": "^5", "vitest": "^4.1.9" }
}
```

`tsconfig.json` and `vitest.config.ts`: copy `packages/coupons/`'s verbatim.

- [ ] **Step 2: Write the failing tests**

`packages/sms/src/segments.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { countSegments } from "./segments";

describe("countSegments", () => {
  it("counts a short GSM-7 message as one segment", () => {
    expect(countSegments("Your order is ready")).toEqual({ segments: 1, encoding: "GSM-7" });
  });

  it("counts exactly 160 GSM-7 characters as one segment", () => {
    expect(countSegments("a".repeat(160)).segments).toBe(1);
  });

  it("counts 161 GSM-7 characters as two segments", () => {
    expect(countSegments("a".repeat(161)).segments).toBe(2);
  });

  it("switches to UCS-2 when a non-GSM character appears", () => {
    expect(countSegments("Ready 🎉").encoding).toBe("UCS-2");
  });

  it("counts 70 UCS-2 characters as one segment and 71 as two", () => {
    expect(countSegments("é".repeat(70)).segments).toBe(1);
    expect(countSegments("é".repeat(71)).segments).toBe(2);
  });

  it("charges GSM-7 extended characters as two", () => {
    // {} [] ~ ^ \ | € occupy two septets each.
    expect(countSegments("{".repeat(80)).segments).toBe(1);
    expect(countSegments("{".repeat(81)).segments).toBe(2);
  });
});
```

`packages/sms/src/keywords.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isStartKeyword, isStopKeyword } from "./keywords";

describe("isStopKeyword", () => {
  it.each(["STOP", "stop", " Stop ", "ARRÊT", "ARRET", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"])(
    "recognises %s",
    (word) => expect(isStopKeyword(word)).toBe(true),
  );

  it("does not fire on a stop word inside a sentence", () => {
    expect(isStopKeyword("please stop by at 6")).toBe(false);
  });

  it("does not fire on empty input", () => {
    expect(isStopKeyword("")).toBe(false);
  });
});

describe("isStartKeyword", () => {
  it.each(["START", "unstop", "YES"])("recognises %s", (w) => expect(isStartKeyword(w)).toBe(true));
  it("does not confuse START with STOP", () => {
    expect(isStartKeyword("STOP")).toBe(false);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter @realm/sms test`
Expected: FAIL — modules not found.

- [ ] **Step 4: Write `src/segments.ts`**

```ts
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
    if (GSM_BASIC.includes(ch)) { septets += 1; continue; }
    if (GSM_EXTENDED.includes(ch)) { septets += 2; continue; }
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
```

- [ ] **Step 5: Write `src/keywords.ts`**

```ts
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
```

- [ ] **Step 6: Write `src/twilio-provider.ts`**

```ts
import type { ChannelProvider, OutboundMessage } from "@realm/notifications";
import { countSegments } from "./segments";

export interface TwilioSmsConfig {
  accountSid: string;
  authToken: string;
  /** Sending number in E.164, or a Messaging Service SID (starts with MG). */
  from: string;
  statusCallbackUrl?: string;
  /** Refuse to send a message longer than this many segments. */
  maxSegments?: number;
}

/**
 * Twilio SMS. A thin fetch rather than the SDK: the SDK pulls a large
 * dependency tree for one POST, and the request shape is stable.
 */
export class TwilioSmsProvider implements ChannelProvider {
  constructor(private readonly config: TwilioSmsConfig) {}

  async send(message: OutboundMessage): Promise<{ providerMessageId: string }> {
    const to = message.to.phone;
    if (!to) throw new Error("SMS requires a phone number");
    const body = message.text ?? "";
    if (!body) throw new Error("SMS requires a text body");

    // Guard rail, not an optimization: a template bug that interpolates a large
    // blob would otherwise be billed per segment, silently, at campaign scale.
    const max = this.config.maxSegments ?? 4;
    const { segments } = countSegments(body);
    if (segments > max) {
      throw new Error(`SMS is ${segments} segments, over the ${max}-segment limit`);
    }

    const params = new URLSearchParams({ To: to, Body: body });
    if (this.config.from.startsWith("MG")) params.set("MessagingServiceSid", this.config.from);
    else params.set("From", this.config.from);
    if (this.config.statusCallbackUrl) params.set("StatusCallback", this.config.statusCallbackUrl);

    const auth = Buffer.from(`${this.config.accountSid}:${this.config.authToken}`).toString("base64");
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${this.config.accountSid}/Messages.json`,
      {
        method: "POST",
        headers: { authorization: `Basic ${auth}`, "content-type": "application/x-www-form-urlencoded" },
        body: params,
      },
    );

    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`Twilio send failed (${res.status}): ${detail.slice(0, 300)}`);
    }
    const json = (await res.json()) as { sid: string };
    return { providerMessageId: json.sid };
  }
}
```

`src/index.ts` re-exports all four modules.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm --filter @realm/sms test`
Expected: PASS — 15 tests.

- [ ] **Step 8: Commit**

```bash
git add packages/sms
git commit -m "feat(sms): @realm/sms with Twilio provider, segmentation and STOP keywords

countSegments is exact because a single emoji in an ASCII template drops the
per-segment budget from 160 to 70 characters and can triple a campaign's bill.
The provider refuses anything over maxSegments for the same reason."
```

---

## Task 4: Inbound STOP webhook

**Files:**
- Create: `apps/puchkaman/app/api/webhooks/twilio/inbound/route.ts`
- Create: `apps/puchkaman/lib/notifications/twilio-signature.ts`
- Test: `apps/puchkaman/app/api/webhooks/twilio/inbound/route.test.ts`

**Interfaces:**
- Consumes: `isStopKeyword`/`isStartKeyword` (Task 3), `suppress` (Plan A Task 3), `toE164` (Task 1).
- Produces: `verifyTwilioSignature(url, params, authToken, header): boolean`; `POST /api/webhooks/twilio/inbound`.

This is the mandatory one. Without it, a STOP is ignored and you are in breach of carrier rules on the first campaign.

- [ ] **Step 1: Write the failing test**

`apps/puchkaman/app/api/webhooks/twilio/inbound/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const suppress = vi.fn();
const unsuppress = vi.fn();
vi.mock("@/lib/notifications/suppression", () => ({
  suppressPhone: (p: string, r: string) => suppress(p, r),
  unsuppressPhone: (p: string) => unsuppress(p),
}));

const { processInbound } = await import("./route");

beforeEach(() => { suppress.mockClear(); unsuppress.mockClear(); });

describe("processInbound", () => {
  it("suppresses on STOP", async () => {
    await processInbound({ From: "+14165550134", Body: "STOP" });
    expect(suppress).toHaveBeenCalledWith("+14165550134", "sms STOP keyword");
  });

  it("suppresses on the French ARRÊT", async () => {
    await processInbound({ From: "+14165550134", Body: "ARRÊT" });
    expect(suppress).toHaveBeenCalled();
  });

  it("normalizes the number before suppressing", async () => {
    await processInbound({ From: "4165550134", Body: "stop" });
    expect(suppress).toHaveBeenCalledWith("+14165550134", "sms STOP keyword");
  });

  it("re-enables on START", async () => {
    await processInbound({ From: "+14165550134", Body: "START" });
    expect(unsuppress).toHaveBeenCalledWith("+14165550134");
  });

  it("ignores an ordinary reply", async () => {
    await processInbound({ From: "+14165550134", Body: "is my order ready?" });
    expect(suppress).not.toHaveBeenCalled();
    expect(unsuppress).not.toHaveBeenCalled();
  });

  it("ignores a message with no usable From", async () => {
    await processInbound({ From: "garbage", Body: "STOP" });
    expect(suppress).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter puchkaman test app/api/webhooks/twilio/inbound/route.test.ts`
Expected: FAIL — route not found.

- [ ] **Step 3: Write the signature verifier**

`apps/puchkaman/lib/notifications/twilio-signature.ts`:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Twilio signs each webhook with HMAC-SHA1 over the full URL plus the POST
 * parameters sorted by key and concatenated. Without this check anyone could
 * POST a forged STOP for an arbitrary number — or, worse, a forged START to
 * undo someone's opt-out.
 */
export function verifyTwilioSignature(
  url: string,
  params: Record<string, string>,
  authToken: string,
  header: string | null,
): boolean {
  if (!header) return false;
  const payload = Object.keys(params)
    .sort()
    .reduce((acc, k) => acc + k + params[k], url);
  const expected = createHmac("sha1", authToken).update(Buffer.from(payload, "utf-8")).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}
```

- [ ] **Step 4: Write the route**

```ts
import { isStartKeyword, isStopKeyword } from "@realm/sms";
import { toE164 } from "@realm/notifications";
import { createLogger } from "@realm/commons/logger";
import { handler, problem } from "@realm/routes";
import { suppressPhone, unsuppressPhone } from "@/lib/notifications/suppression";
import { verifyTwilioSignature } from "@/lib/notifications/twilio-signature";

export const runtime = "nodejs";
const log = createLogger("twilio-inbound");

/** Apply one inbound message. Exported for tests (bypasses signature checks). */
export async function processInbound(params: { From?: string; Body?: string }): Promise<void> {
  const phone = toE164(params.From ?? "");
  const body = params.Body ?? "";
  if (!phone) return;

  if (isStopKeyword(body)) {
    await suppressPhone(phone, "sms STOP keyword");
    log.info("sms opt-out recorded");
    return;
  }
  if (isStartKeyword(body)) {
    await unsuppressPhone(phone);
    log.info("sms opt-in restored");
  }
}

export const POST = handler(async (req: Request): Promise<Response> => {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) return problem(503, "SMS not configured");

  const form = await req.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => { params[k] = String(v); });

  // The public URL Twilio signed, which may differ from req.url behind the proxy.
  const url = process.env.TWILIO_INBOUND_URL ?? req.url;
  if (!verifyTwilioSignature(url, params, token, req.headers.get("x-twilio-signature"))) {
    log.error("twilio signature verification failed");
    return problem(403, "Invalid signature");
  }

  await processInbound(params);
  // Twilio expects TwiML; an empty Response element means "no auto-reply".
  return new Response("<Response/>", { headers: { "content-type": "text/xml" } });
});
```

- [ ] **Step 5: Add the suppression helpers**

Append to `apps/puchkaman/lib/notifications/suppression.ts`:

```ts
/** STOP reaches everything: a carrier opt-out is not a marketing preference. */
export async function suppressPhone(phone: string, reason: string): Promise<void> {
  await suppress(db, notificationTables, { address: phone, channel: "sms", reason, scope: "all" });
  await suppress(db, notificationTables, { address: phone, channel: "whatsapp", reason, scope: "all" });
}

/** START restores messaging. Only clears keyword opt-outs, never a carrier block. */
export async function unsuppressPhone(phone: string): Promise<void> {
  await db
    .delete(notificationTables.messageSuppression)
    .where(
      and(
        eq(notificationTables.messageSuppression.address, normalizeAddress(phone)),
        inArray(notificationTables.messageSuppression.channel, ["sms", "whatsapp"]),
        like(notificationTables.messageSuppression.reason, "sms STOP%"),
      ),
    );
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter puchkaman test app/api/webhooks/twilio/inbound/route.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 7: Commit**

```bash
git add apps/puchkaman/app/api/webhooks/twilio apps/puchkaman/lib/notifications
git commit -m "feat(puchkaman): mandatory SMS STOP keyword handling

Signature verification is not optional here: without it anyone could POST a
forged STOP for an arbitrary number, or a forged START undoing someone's
opt-out. STOP suppresses with scope=all -- a carrier opt-out is not a
marketing preference."
```

---

## Task 5: Wire SMS into the handlers

**Files:**
- Modify: `apps/puchkaman/lib/notifications/handlers.ts`
- Modify: `apps/puchkaman/lib/notifications/enqueue.ts`
- Modify: `apps/puchkaman/lib/campaigns/segment.ts`
- Modify: `deployment/prod/puchkaman/.env.production.example`

**Interfaces:**
- Consumes: `TwilioSmsProvider` (Task 3), `isSmsDeliverable` (Task 1).
- Produces: an `sms` entry in the providers map.

- [ ] **Step 1: Register the provider**

In `apps/puchkaman/lib/notifications/handlers.ts`:

```ts
import { TwilioSmsProvider } from "@realm/sms";

/**
 * Absent credentials the channel simply has no provider, and buildHandlers
 * leaves it undefined — an enqueued sms row then fails with "No handler for
 * channel sms" and retries with backoff rather than being lost. That is the
 * intended behaviour while verification is pending.
 */
function smsChannelProvider(): ChannelProvider | undefined {
  const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token, TWILIO_FROM: from } = process.env;
  if (!sid || !token || !from) return undefined;
  return new TwilioSmsProvider({
    accountSid: sid,
    authToken: token,
    from,
    statusCallbackUrl: process.env.TWILIO_STATUS_URL,
    maxSegments: Number(process.env.SMS_MAX_SEGMENTS ?? 4),
  });
}
```

and add `sms: smsChannelProvider(),` to the `providers` map.

- [ ] **Step 2: Enforce verification for marketing SMS**

In `apps/puchkaman/lib/campaigns/segment.ts`, the segment query gains a guard so an unverified number never enters a marketing audience:

```ts
  // Marketing SMS requires a verified number (see isSmsDeliverable). Audience
  // resolution is the right place: excluding here is one query, whereas
  // excluding at send time would have already created the outbox row.
  const rows = await db
    .select({ userId: orders.userId })
    .from(orders)
    .innerJoin(users, eq(users.id, orders.userId))
    .where(and(sql`${orders.userId} is not null`, segment.requireVerifiedPhone ? eq(users.phoneVerified, true) : sql`true`))
    .groupBy(orders.userId)
    .having(having.length ? and(...having) : sql`true`);
```

Add `requireVerifiedPhone?: boolean` to the `segment` shape in `AudienceDef` (`packages/notifications/src/campaign-schema.ts`) and default it **true** in the audience builder UI whenever `sms` or `whatsapp` is among the campaign's channels.

- [ ] **Step 3: Add the env vars**

```
# Twilio. Absent, the sms channel has no provider and sms rows retry with backoff.
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
# E.164 number or a Messaging Service SID (MG...).
TWILIO_FROM=
TWILIO_STATUS_URL=https://puchkaman.ca/api/webhooks/twilio/status
# Public URL Twilio signs for inbound webhooks — must match exactly, including scheme.
TWILIO_INBOUND_URL=https://puchkaman.ca/api/webhooks/twilio/inbound
# Refuse to send anything longer. Guards against a template bug billing per segment.
SMS_MAX_SEGMENTS=4
```

- [ ] **Step 4: Typecheck and commit**

```bash
pnpm turbo typecheck
git add apps/puchkaman deployment/prod/puchkaman
git commit -m "feat(puchkaman): register the SMS channel

Verified-phone filtering happens during audience resolution, not at send: by
send time the outbox row already exists and excluding it there would leave a
permanently skipped row behind."
```

---

## Task 6: `@realm/whatsapp`

**Files:**
- Create: `packages/whatsapp/{package.json,tsconfig.json,vitest.config.ts}`
- Create: `packages/whatsapp/src/{index,types,window,twilio-provider}.ts`
- Test: `packages/whatsapp/src/window.test.ts`

**Interfaces:**
- Consumes: `ChannelProvider` (Plan A Task 1).
- Produces: `TwilioWhatsAppProvider`; `isInsideServiceWindow(lastInboundAt, now)`; `SERVICE_WINDOW_MS`.

- [ ] **Step 1: Write the failing test**

`packages/whatsapp/src/window.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SERVICE_WINDOW_MS, isInsideServiceWindow, requiresTemplate } from "./window";

const HOUR = 3_600_000;

describe("isInsideServiceWindow", () => {
  it("is a 24-hour window", () => {
    expect(SERVICE_WINDOW_MS).toBe(24 * HOUR);
  });

  it("is inside just before 24 hours", () => {
    expect(isInsideServiceWindow(0, 24 * HOUR - 1)).toBe(true);
  });

  it("is outside at exactly 24 hours", () => {
    expect(isInsideServiceWindow(0, 24 * HOUR)).toBe(false);
  });

  it("is outside when there was never an inbound message", () => {
    expect(isInsideServiceWindow(null, 0)).toBe(false);
  });
});

describe("requiresTemplate", () => {
  it("requires a template with no recent inbound message", () => {
    expect(requiresTemplate(null, 0)).toBe(true);
  });

  it("allows free-form inside the window", () => {
    expect(requiresTemplate(0, HOUR)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @realm/whatsapp test`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/window.ts`**

```ts
/**
 * Meta's customer-service window. A business may send free-form content only
 * within 24 hours of the customer's last inbound message; outside it, every
 * message must use a template Meta approved in advance.
 *
 * This is why campaign_content carries provider_template_id: a WhatsApp
 * campaign is almost always outside the window, so its "content" is an
 * externally-approved artifact plus variables, not copy authored in the editor.
 */
export const SERVICE_WINDOW_MS = 24 * 3_600_000;

export function isInsideServiceWindow(lastInboundAt: number | null, now: number): boolean {
  if (lastInboundAt === null) return false;
  return now - lastInboundAt < SERVICE_WINDOW_MS;
}

export function requiresTemplate(lastInboundAt: number | null, now: number): boolean {
  return !isInsideServiceWindow(lastInboundAt, now);
}
```

- [ ] **Step 4: Write `src/twilio-provider.ts`**

```ts
import type { ChannelProvider, OutboundMessage } from "@realm/notifications";

export interface TwilioWhatsAppConfig {
  accountSid: string;
  authToken: string;
  /** Sender in E.164, sent as `whatsapp:+1...`. */
  from: string;
  statusCallbackUrl?: string;
}

/**
 * Twilio WhatsApp. When `providerTemplateId` is present it is sent as a Content
 * SID with JSON variables (the approved-template path); otherwise a plain body
 * is sent, which Meta accepts only inside the 24-hour service window.
 */
export class TwilioWhatsAppProvider implements ChannelProvider {
  constructor(private readonly config: TwilioWhatsAppConfig) {}

  async send(message: OutboundMessage): Promise<{ providerMessageId: string }> {
    const to = message.to.phone;
    if (!to) throw new Error("WhatsApp requires a phone number");

    const params = new URLSearchParams({
      To: `whatsapp:${to}`,
      From: `whatsapp:${this.config.from}`,
    });

    if (message.providerTemplateId) {
      params.set("ContentSid", message.providerTemplateId);
      // Twilio expects positional variables keyed "1", "2", … as a JSON object.
      if (message.vars) params.set("ContentVariables", JSON.stringify(message.vars));
    } else if (message.text) {
      params.set("Body", message.text);
    } else {
      throw new Error("WhatsApp requires either a template id or a text body");
    }

    if (this.config.statusCallbackUrl) params.set("StatusCallback", this.config.statusCallbackUrl);

    const auth = Buffer.from(`${this.config.accountSid}:${this.config.authToken}`).toString("base64");
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${this.config.accountSid}/Messages.json`,
      {
        method: "POST",
        headers: { authorization: `Basic ${auth}`, "content-type": "application/x-www-form-urlencoded" },
        body: params,
      },
    );

    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`Twilio WhatsApp send failed (${res.status}): ${detail.slice(0, 300)}`);
    }
    const json = (await res.json()) as { sid: string };
    return { providerMessageId: json.sid };
  }
}
```

- [ ] **Step 5: Register it and surface template ids in the composer**

Mirror Task 5 Step 1 for `whatsapp` in `apps/puchkaman/lib/notifications/handlers.ts`, reading `TWILIO_WHATSAPP_FROM`.

In the campaign composer (Plan C Task 9), the WhatsApp tab replaces the rich editor with: a **template id field**, a variables table, and a read-only preview. Add a one-line note in the UI stating that WhatsApp content must be approved by Meta in advance — the person composing will otherwise reasonably expect to type a message.

- [ ] **Step 6: Run the tests and commit**

```bash
pnpm --filter @realm/whatsapp test
git add packages/whatsapp apps/puchkaman
git commit -m "feat(whatsapp): @realm/whatsapp with Twilio provider and service window

Outside Meta's 24-hour customer-service window every message must use a
pre-approved template, so the composer's WhatsApp tab takes a template id and
variables rather than free-form copy."
```

---

## Task 7: Delivery status callbacks and verification

**Files:**
- Create: `apps/puchkaman/app/api/webhooks/twilio/status/route.ts`
- Test: `apps/puchkaman/app/api/webhooks/twilio/status/route.test.ts`

**Interfaces:**
- Consumes: `verifyTwilioSignature` (Task 4), `recordCampaignEvent` (Plan C Task 8).
- Produces: `POST /api/webhooks/twilio/status`.

- [ ] **Step 1: Write the failing test**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const recordEvent = vi.fn();
const suppress = vi.fn();
vi.mock("@/lib/notifications/campaign-stats", () => ({
  recordCampaignEvent: (id: string, t: string) => recordEvent(id, t),
}));
vi.mock("@/lib/notifications/suppression", () => ({ suppressPhone: (p: string, r: string) => suppress(p, r) }));

const { processStatus } = await import("./route");

beforeEach(() => { recordEvent.mockClear(); suppress.mockClear(); });

describe("processStatus", () => {
  it("counts a delivered message", async () => {
    await processStatus({ MessageSid: "SM1", MessageStatus: "delivered" });
    expect(recordEvent).toHaveBeenCalledWith("SM1", "delivered");
  });

  it("counts a failed message", async () => {
    await processStatus({ MessageSid: "SM2", MessageStatus: "failed" });
    expect(recordEvent).toHaveBeenCalledWith("SM2", "failed");
  });

  it("suppresses a number on an unreachable-landline error", async () => {
    await processStatus({ MessageSid: "SM3", MessageStatus: "undelivered", ErrorCode: "30006", To: "whatsapp:+14165550134" });
    expect(suppress).toHaveBeenCalledWith("+14165550134", "carrier undeliverable 30006");
  });

  it("does not suppress on a transient error", async () => {
    await processStatus({ MessageSid: "SM4", MessageStatus: "undelivered", ErrorCode: "30001", To: "+14165550134" });
    expect(suppress).not.toHaveBeenCalled();
  });

  it("ignores an intermediate queued status", async () => {
    await processStatus({ MessageSid: "SM5", MessageStatus: "queued" });
    expect(recordEvent).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails, then write the route**

Permanent failure codes worth suppressing on: `30003` (unreachable handset), `30005` (unknown destination), `30006` (landline or unreachable carrier), `21610` (recipient has opted out at Twilio's own level). Everything else — queueing, rate limits, transient carrier errors — must **not** suppress; a transient failure that permanently blocked a number would silently lose a customer.

```ts
const PERMANENT = new Set(["30003", "30005", "30006", "21610"]);
const COUNTED: Record<string, string> = { delivered: "delivered", failed: "failed", undelivered: "failed", read: "read" };

export async function processStatus(p: Record<string, string | undefined>): Promise<void> {
  const sid = p.MessageSid;
  const status = p.MessageStatus ?? "";
  if (!sid || !COUNTED[status]) return;

  await recordCampaignEvent(sid, COUNTED[status]);

  if (p.ErrorCode && PERMANENT.has(p.ErrorCode)) {
    const phone = toE164((p.To ?? "").replace(/^whatsapp:/, ""));
    if (phone) await suppressPhone(phone, `carrier undeliverable ${p.ErrorCode}`);
  }
}
```

Wrap it in the same signature-verified `POST` handler shape as Task 4.

- [ ] **Step 3: Run the test and commit**

```bash
pnpm --filter puchkaman test app/api/webhooks/twilio/status/route.test.ts
git add apps/puchkaman/app/api/webhooks/twilio/status
git commit -m "feat(puchkaman): Twilio delivery status callbacks

Only permanent carrier codes suppress a number. A transient failure that
permanently blocked a number would silently lose a customer."
```

---

## Task 8: Final verification

- [ ] **Step 1: Full typecheck and test**

Run: `pnpm turbo typecheck && pnpm turbo test`
Expected: PASS.

- [ ] **Step 2: Confirm the channels degrade safely while unconfigured**

With no Twilio env vars set, enqueue an `sms` row and drain.
Expected: the row goes to `pending` with `last_error: "No handler for channel sms"` and a backoff, **not** `sent` and not lost. This is the state the system should sit in until verification clears.

- [ ] **Step 3: Twilio sandbox smoke (needs the account)**

1. Verify your own number through the Task 2 flow. Confirm `users.phone_verified` flips.
2. Send a transactional SMS to yourself via a templated event.
3. Reply `STOP`. Confirm two `message_suppression` rows appear (`sms` and `whatsapp`, `scope: "all"`).
4. Trigger the same event again. Confirm the row is skipped.
5. Reply `START`. Confirm the rows are removed and delivery resumes.

Step 3 is the compliance check. If it does not work, **do not enable SMS**.

- [ ] **Step 4: Segment-count sanity on a real template**

Render your longest SMS template with realistic values and run `countSegments` on the output. Anything above 2 segments should be shortened before launch — at campaign scale the difference is the whole bill.

- [ ] **Step 5: Commit the milestone**

```bash
git commit --allow-empty -m "chore(notifications): plan D complete -- sms and whatsapp channels

Adding a channel was one provider plus one entry in the providers map, as
designed. Everything genuinely new was the asymmetric part: phone consent and
verification, carrier-mandated STOP handling, segment cost and WhatsApp's
pre-approved template model."
```

---

## Self-Review

**Spec coverage.** Covers spec §3.4's channel-generic provider seam, §5.3's phone columns in use, §7 requirement 6 (automatic STOP handling), and phase 3 in full. The `provider_template_id` column reserved in Plan A Task 2 is consumed here by Task 6 — that column existing is what keeps WhatsApp from forcing a schema change.

**Placeholder scan.** Task 6 Step 5's composer change is described rather than coded, because it modifies a component authored in Plan C whose final shape is not fixed until that plan runs; the required fields and the one-line user-facing note are specified exactly. Task 7 Step 2 gives the route body and points at Task 4 for the surrounding handler shape rather than repeating twenty lines of signature verification. Everything else is runnable.

**Type consistency.** `ChannelProvider`/`OutboundMessage` (Plan A Task 1) are implemented by `TwilioSmsProvider` (Task 3) and `TwilioWhatsAppProvider` (Task 6) and consumed in Task 5's providers map. `toE164` (Task 1) is used by Tasks 2, 4 and 7. `suppressPhone`/`unsuppressPhone` (Task 4) are consumed by Task 7. `recordCampaignEvent` (Plan C Task 8) is reused unchanged for SMS statuses — the outbox already stores `provider_message_id` for every channel, so attribution needed no new code.

**Amendment to Plan C** made here: `AudienceDef["segment"]` gains `requireVerifiedPhone?: boolean` (Task 5 Step 2). If Plan C has already run, this is an additive change to a jsonb shape — no migration.

**Honest limitation.** Tasks 3 through 7 cannot be verified end to end until the Twilio account, toll-free verification, Meta Business verification and at least one approved WhatsApp template all exist. The unit tests are real and will pass; the integration behaviour is unproven until then. Task 8 Step 2 exists so that the unconfigured state is at least a *tested* state, rather than something discovered on the first send.

---

Plan complete and saved to `docs/superpowers/plans/2026-08-12-sms-whatsapp-channels.md`.
